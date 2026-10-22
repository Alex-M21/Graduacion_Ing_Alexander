import {eq} from "drizzle-orm";
import {getDb} from "@/db";
import {settings} from "@/db/schema";
import {encryptCui,decryptCui} from "@/lib/security";
import type {AlbumStore} from "@/lib/media";

export type DriveConnection = {url:string;secret:string};
type DriveContext = {accessToken:string;photoFolderId:string;videoFolderId:string;folderUrl:string;sheetUrl:string};
function validateConnection(value: DriveConnection) {
  if(!/^https:\/\/script\.google\.com\/macros\/s\/[a-zA-Z0-9_-]+\/exec$/.test(value.url) || !/^[a-f0-9]{64}$/.test(value.secret)) throw new Error("Revisa la URL de implementación de Google y la clave privada de conexión.");
  return value;
}
export async function getDriveConnection(key: string) {
  const row=await getDb().query.settings.findFirst({where:eq(settings.key,"drive")});
  return row ? validateConnection(JSON.parse(await decryptCui(row.encryptedValue,"drive-connection",key))) : null;
}
export async function saveDriveConnection(value: DriveConnection,key: string) {
  validateConnection(value);
  const encryptedValue=await encryptCui(JSON.stringify(value),"drive-connection",key);
  await getDb().insert(settings).values({key:"drive",encryptedValue}).onConflictDoUpdate({target:settings.key,set:{encryptedValue}});
}
export async function driveCall<T = Record<string,unknown>>(connection: DriveConnection,action: string,payload: unknown={}) {
  validateConnection(connection);
    const response=await fetch(connection.url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({secret:connection.secret,action,payload}),signal:AbortSignal.timeout(25000),redirect:"follow"});
  const result=await response.json() as {ok:boolean;data:T};
  if(!response.ok || !result.ok) throw new Error("No se pudo completar la operación en Google Drive. Revisa la conexión en el panel.");
  return result.data;
}
export class DriveStore implements AlbumStore {
  private context?: Promise<DriveContext>;
  constructor(private connection: DriveConnection) {}
  private auth() {return this.context ??= driveCall<DriveContext>(this.connection,"token").then(value=>{
    if(typeof value.accessToken!=="string" || !value.accessToken || !/^[a-zA-Z0-9_-]{10,}$/.test(value.photoFolderId) || !/^[a-zA-Z0-9_-]{10,}$/.test(value.videoFolderId)) throw new Error("Invalid Drive connection");
    return value;
  });}
  private async find(key: string) {
    const ctx=await this.auth();const mediaId=key.replace(/^drive:/,"");
    if(!/^[a-f0-9-]{36}$/.test(mediaId)) throw new Error("Invalid media key");
    const q="trashed = false and appProperties has { key='graduacionMedia' and value='"+mediaId+"' } and ('"+ctx.photoFolderId+"' in parents or '"+ctx.videoFolderId+"' in parents)";
    const response=await fetch("https://www.googleapis.com/drive/v3/files?"+new URLSearchParams({q,fields:"files(id)",pageSize:"2"}),{headers:{Authorization:"Bearer "+ctx.accessToken}});
    if(!response.ok) throw new Error("Drive read failed");
    const files=await response.json() as {files:{id:string}[]};return files.files[0]?.id ?? null;
  }
  async put(key: string,body: ReadableStream<Uint8Array>,options: {httpMetadata:{contentType:string};bytes:number}) {
    try {
    const ctx=await this.auth();const type=options.httpMetadata.contentType;
    if(await this.find(key)) {await body.cancel();return;}
    const suffix:Record<string,string>={"image/jpeg":"jpg","image/png":"png","image/webp":"webp","video/mp4":"mp4","video/quicktime":"mov","video/webm":"webm"};
    const init=await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id",{
      method:"POST",headers:{Authorization:"Bearer "+ctx.accessToken,"Content-Type":"application/json","X-Upload-Content-Type":type,"X-Upload-Content-Length":String(options.bytes)},
      body:JSON.stringify({name:key.replace(/^drive:/,"")+"."+suffix[type],mimeType:type,parents:[type.startsWith("video/") ? ctx.videoFolderId : ctx.photoFolderId],appProperties:{graduacionMedia:key.replace(/^drive:/,"")}})
    });
    const location=init.headers.get("location");
    if(!init.ok || !location) throw new Error("Drive upload initialization failed");
    const parsed=new URL(location);
    if(parsed.protocol!=="https:" || !(parsed.hostname==="www.googleapis.com" || parsed.hostname==="content.googleapis.com")) throw new Error("Invalid upload URL");
    const uploaded=await fetch(location,{method:"PUT",headers:{Authorization:"Bearer "+ctx.accessToken,"Content-Type":type,"Content-Length":String(options.bytes)},body});
    if(!uploaded.ok) {await uploaded.body?.cancel();throw new Error("Drive upload failed");}
    await uploaded.body?.cancel();
    } catch(error) {await body.cancel(error).catch(()=>{});throw error;}
  }
  async get(key: string,range?: {offset:number;length:number}) {
    const ctx=await this.auth();const id=await this.find(key);if(!id) return null;
    const response=await fetch("https://www.googleapis.com/drive/v3/files/"+encodeURIComponent(id)+"?alt=media",{headers:{Authorization:"Bearer "+ctx.accessToken,...(range ? {Range:"bytes="+range.offset+"-"+(range.offset+range.length-1)} : {})}});
    if(response.status===404) return null;
    if(!response.ok || (range && response.status!==206)) throw new Error("Drive download failed");
    return {body:response.body};
  }
  async delete(key: string) {
    const ctx=await this.auth();const id=await this.find(key);if(!id) return;
    const response=await fetch("https://www.googleapis.com/drive/v3/files/"+encodeURIComponent(id),{method:"DELETE",headers:{Authorization:"Bearer "+ctx.accessToken}});
    if(!response.ok && response.status!==404) throw new Error("Drive cleanup failed");
  }
}
