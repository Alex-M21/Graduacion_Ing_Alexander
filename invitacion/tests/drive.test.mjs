import test from "node:test";
import assert from "node:assert/strict";
import {build} from "esbuild";
import {mkdir} from "node:fs/promises";
test("Drive streams private media, supports ranges, rejects unsafe URLs and cancels failed uploads",async()=>{
  await mkdir(".sites-runtime",{recursive:true});
  await build({entryPoints:["lib/drive.ts"],outfile:".sites-runtime/drive-under-test.mjs",bundle:true,format:"esm",platform:"node",plugins:[{name:"database-boundary",setup(builder){
    builder.onResolve({filter:/^@\/db(\/schema)?$/},args=>({path:args.path,namespace:"test"}));
    builder.onLoad({filter:/.*/,namespace:"test"},args=>({contents:args.path.endsWith("schema") ? "export const settings = {};" : 'export function getDb(){throw new Error("Database is outside this storage test")}',loader:"js"}));
  }}]});
  const {DriveStore,driveCall}=await import("../.sites-runtime/drive-under-test.mjs");
  const originalFetch=globalThis.fetch;
  const connection={url:"https://script.google.com/macros/s/test-deployment/exec",secret:"a".repeat(64)};
  const key="drive:11111111-1111-4111-8111-111111111111";
  const files=new Map();let pendingKey="";let failInit=false;
  globalThis.fetch=async(input,options={})=>{
    const url=new URL(input);
    if(url.hostname==="script.google.com") {
      const body=JSON.parse(options.body);assert.equal(body.secret,connection.secret);
      return Response.json({ok:true,data:{accessToken:"test-private-token",photoFolderId:"photoFolder123",videoFolderId:"videoFolder123"}});
    }
    assert.equal(options.headers.Authorization,"Bearer test-private-token");
    if(url.pathname==="/drive/v3/files") {
      const query=url.searchParams.get("q");assert.ok(query.includes("photoFolder123"));assert.ok(query.includes("videoFolder123"));
      const match=query.match(/value='([^']+)'/);return Response.json({files:files.has(match[1]) ? [{id:match[1]}] : []});
    }
    if(url.pathname==="/upload/drive/v3/files" && options.method==="POST") {
      if(failInit) return new Response("rejected",{status:403});
      const metadata=JSON.parse(options.body);pendingKey=metadata.appProperties.graduacionMedia;
      assert.equal(metadata.parents[0],"videoFolder123");assert.equal("permissions" in metadata,false);
      return new Response(null,{status:200,headers:{Location:"https://www.googleapis.com/upload-session"}});
    }
    if(url.pathname==="/upload-session") {
      const bytes=new Uint8Array(await new Response(options.body).arrayBuffer());assert.equal(bytes.length,Number(options.headers["Content-Length"]));
      files.set(pendingKey,bytes);return Response.json({id:pendingKey});
    }
    if(url.pathname.startsWith("/drive/v3/files/")) {
      const id=url.pathname.split("/").at(-1);
      if(options.method==="DELETE") {files.delete(id);return new Response(null,{status:204});}
      const bytes=files.get(id);if(!bytes) return new Response(null,{status:404});
      const range=options.headers.Range;if(!range) return new Response(bytes);
      const [,start,end]=/bytes=(\d+)-(\d+)/.exec(range);return new Response(bytes.slice(Number(start),Number(end)+1),{status:206});
    }
    throw new Error("Unexpected network request");
  };
  try {
    const store=new DriveStore(connection);
    const bytes=new Uint8Array(128).fill(7);
    await store.put(key,new Blob([bytes]).stream(),{bytes:128,httpMetadata:{contentType:"video/mp4"}});
    assert.equal(files.size,1);
    await store.put(key,new Blob([bytes]).stream(),{bytes:128,httpMetadata:{contentType:"video/mp4"}});assert.equal(files.size,1,"Retry must not duplicate an existing file");
    const read=await store.get(key,{offset:8,length:12});assert.equal((await new Response(read.body).arrayBuffer()).byteLength,12);
    await assert.rejects(driveCall({url:"https://attacker.test",secret:connection.secret},"token"));
    failInit=true;let cancelled=false;
    const stream=new ReadableStream({cancel(){cancelled=true;}});
    await assert.rejects(store.put("drive:22222222-2222-4222-8222-222222222222",stream,{bytes:128,httpMetadata:{contentType:"video/mp4"}}));assert.equal(cancelled,true);
    await store.delete(key);assert.equal(files.size,0);
  } finally {globalThis.fetch=originalFetch;}
});
