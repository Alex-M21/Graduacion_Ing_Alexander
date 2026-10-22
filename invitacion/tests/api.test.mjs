import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdir,readdir} from 'node:fs/promises';
import {build} from 'esbuild';
import {Miniflare} from 'miniflare';

test('anonymous web registration, private receipt, photos/videos, range playback and organizer privacy',async()=>{
  await mkdir('.sites-runtime',{recursive:true});
  const output = await build({
    stdin:{contents:`
      import {GET,POST,HEAD,OPTIONS} from "./app/api/[...path]/route";
      export default {async fetch(request){
        const account = request.headers.get("x-test-account");
        globalThis.__testUser = account ? {userId:account,email:account+"@example.test",displayName:account} : null;
        const originalNow = Date.now;
        Date.now = () => Date.parse(request.headers.get("x-test-now") || "2026-10-28T00:00:00-06:00");
        try {return await ({GET,POST,HEAD,OPTIONS}[request.method] || (()=>new Response(null,{status:405})))(request);}
        finally {Date.now = originalNow;}
      }}
    `,resolveDir:process.cwd(),loader:'ts'},
    outfile:'.sites-runtime/test-worker.mjs',bundle:true,format:'esm',platform:'browser',external:['cloudflare:workers'],write:false,
    plugins:[{name:'test-identity-only',setup(builder){
      builder.onResolve({filter:/^@\/app\/chatgpt-auth$/},()=>({path:'auth',namespace:'test'}));
      builder.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'export async function getChatGPTUser(){return globalThis.__testUser}',loader:'js'}));
    }}]
  });
  const mf = new Miniflare({modules:true,script:output.outputFiles[0].text,compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:['DB'],r2Buckets:['BUCKET'],bindings:{CUI_ENCRYPTION_KEY:Buffer.alloc(32,5).toString('base64'),ADMIN_EMAIL:'organizer@example.test'},cf:false});
  try {
    const {DB,BUCKET} = await mf.getBindings();
    for (const file of (await readdir(new URL('../drizzle/',import.meta.url))).filter(file=>file.endsWith('.sql')).sort()) {
      const sql = await readFile(new URL('../drizzle/'+file,import.meta.url),'utf8');
      for (const statement of sql.split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean)) await DB.prepare(statement).run();
    }
    let pass = '';
    async function request(path,method='GET',body,extra={}) {
      const bytes = body instanceof Uint8Array;
      const headers = {origin:'https://event.test',...(pass ? {'x-guest-pass':pass} : {}),...(bytes ? {'x-upload-size':String(body.length)} : body ? {'content-type':'application/json'} : {}),...extra};
      return mf.dispatchFetch('https://event.test'+(path.startsWith('/api/') ? path : '/api/'+path),{method,headers,body:bytes ? body : body ? JSON.stringify(body) : undefined});
    }
    const payload = {fullName:'Alice Invitada Prueba',email:'alice@example.test',cui:'1234567890123',attendance:'yes',consent:true};
    const anonymous = await (await request('me')).json(); assert.equal(anonymous.guest,null);
    const cors=await request('rsvp','OPTIONS',undefined,{origin:'https://alex-m21.github.io'});
    assert.equal(cors.status,204);assert.equal(cors.headers.get('access-control-allow-origin'),'https://alex-m21.github.io');
    assert.equal(cors.headers.get('access-control-allow-credentials'),null);
    assert.equal((await request('rsvp','OPTIONS',undefined,{origin:'https://attacker.test'})).status,403);
    assert.equal((await request('admin/drive')).status,403);
    assert.equal((await request('admin/drive/sync','POST',{})).status,403);
    assert.equal((await request('admin/guests')).status,403);
    assert.equal((await request('photos')).status,403);
    assert.equal((await request('rsvp','POST',payload,{origin:'https://attacker.test'})).status,403);
    assert.equal((await request('rsvp','POST',{...payload,consent:false})).status,400);
    const register = await request('rsvp','POST',payload); assert.equal(register.status,200); pass = (await register.json()).guestPass; assert.match(pass,/^[a-f0-9]{64}$/);
    const me = await (await request('me')).json(); assert.equal(me.guest.fullName,payload.fullName); assert.equal('cui' in me.guest,false);
    const stored = await DB.prepare('SELECT * FROM guests').first();
    assert.ok(!JSON.stringify(stored).includes(payload.cui)); assert.notEqual(stored.access_hash,pass);
    assert.equal((await request('photos','GET',undefined,{'x-test-now':'2026-10-27T23:59:59-06:00'})).status,403);
    const image = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+XH1sAAAAASUVORK5CYII=','base64'));
    assert.equal((await request('photos','POST',new TextEncoder().encode('<svg onload="alert(1)">not a real image file</svg>'))).status,400);
    const photoResponse = await request('photos','POST',image); assert.equal(photoResponse.status,201); const photoId = (await photoResponse.json()).id;
    const mp4 = new Uint8Array(1024); mp4.set([0,0,0,24]); mp4.set(new TextEncoder().encode('ftypisom'),4);
    const videoResponse = await request('photos','POST',mp4,{'content-type':'video/mp4'}); assert.equal(videoResponse.status,201); const videoId = (await videoResponse.json()).id;
    const webm = new Uint8Array(128); webm.set([0x1a,0x45,0xdf,0xa3]); webm.set(new TextEncoder().encode('webm'),16);
    assert.equal((await request('photos','POST',webm)).status,201);
    const mov = new Uint8Array(mp4); mov.set(new TextEncoder().encode('qt  '),8); assert.equal((await request('photos','POST',mov)).status,201);
    const avif = new Uint8Array(mp4); avif.set(new TextEncoder().encode('avif'),8); assert.equal((await request('photos','POST',avif)).status,400);
    assert.equal((await request('photos','POST',mp4,{'x-upload-size':String(51*1024*1024)})).status,413);
    assert.equal((await request('photos','POST',image,{'x-upload-size':String(9*1024*1024)})).status,413);
    assert.equal((await request('photos','POST',mp4,{'x-upload-size':'1025'})).status,400);
    assert.equal((await request('photos','POST',mp4,{'x-upload-size':'1023'})).status,400);
    const gallery = await (await request('photos')).json(); assert.equal(gallery.photos.length,4);
    const video = gallery.photos.find(p=>p.id===videoId); assert.equal(video.kind,'video'); assert.equal(video.contentType,'video/mp4');
    assert.equal('email' in video,false); assert.equal('userId' in video,false);
    const range = await request(video.url,'GET',undefined,{range:'bytes=10-29'}); assert.equal(range.status,206); assert.equal(range.headers.get('content-range'),'bytes 10-29/1024'); assert.deepEqual(new Uint8Array(await range.arrayBuffer()),mp4.slice(10,30));
    const suffix = await request(video.url,'GET',undefined,{range:'bytes=-10'}); assert.equal(suffix.status,206); assert.equal((await suffix.arrayBuffer()).byteLength,10);
    assert.equal((await request(video.url,'GET',undefined,{range:'bytes=5000-'})).status,416);
    const head = await request(video.url,'HEAD'); assert.equal(head.status,200); assert.equal(head.headers.get('content-length'),'1024'); assert.equal((await head.arrayBuffer()).byteLength,0);
    assert.equal((await request('photos/'+videoId,'POST',mp4)).status,405); assert.equal((await request('photos/'+videoId,'DELETE')).status,405);
    const alicePass = pass; pass='';
    assert.equal((await request('photos/'+photoId)).status,403);
    assert.equal((await request(video.url)).status,200); // Scoped URL grants only this media, not the guest record.
    assert.equal((await request(video.url.replace('signature=','signature=0'))).status,403);
    assert.equal((await request(video.url,'GET',undefined,{'x-test-now':'2026-10-28T02:00:00-06:00'})).status,403);
    assert.equal((await request('photos')).status,403);
    const duplicate = await request('rsvp','POST',payload); assert.equal(duplicate.status,409);
    pass='0'.repeat(64); assert.equal((await (await request('me')).json()).guest,null);
    pass=alicePass;
    assert.equal((await request('rsvp','POST',{...payload,fullName:'Alice Nombre Actualizado'})).status,200);
    assert.equal((await (await request('me')).json()).guest.fullName,'Alice Nombre Actualizado');
    pass='';
    const bob = await request('rsvp','POST',{...payload,fullName:'Bob Invitado Prueba',email:'bob@example.test',cui:'1234567890124'}); pass=(await bob.json()).guestPass;
    assert.equal((await (await request('photos')).json()).photos.length,4);
    assert.equal((await request('admin/guests')).status,403);
    const admin = await (await request('admin/guests','GET',undefined,{'x-test-account':'organizer'})).json(); assert.equal(admin.guests.length,2); assert.equal(admin.guests.find(g=>g.email===payload.email).cui,payload.cui);
    const driveStatus=await (await request('admin/drive','GET',undefined,{'x-test-account':'organizer'})).json();assert.equal(driveStatus.connected,false);assert.equal(driveStatus.pendingGuests,2);
    assert.equal((await request('admin/drive','POST',{url:'https://attacker.test',secret:'0'.repeat(64)},{'x-test-account':'organizer'})).status,400);
    const csv = await request('admin/guests?format=csv','GET',undefined,{'x-test-account':'organizer'}); assert.ok((await csv.text()).includes(payload.cui));
    pass=alicePass; await request('rsvp','POST',{...payload,attendance:'no'});
    assert.equal((await request(video.url)).status,403); // Links lose access when attendance is withdrawn.
    assert.ok(await BUCKET.head('event/photos/'+videoId));
  } finally {await mf.dispose();}
});
