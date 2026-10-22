import { env } from "cloudflare:workers";
import { and, desc, eq, lt, or, count, isNull, notLike } from "drizzle-orm";
import { getDb } from "@/db";
import { guests, photos } from "@/db/schema";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { event } from "@/lib/event";
import { albumIsOpen, encryptCui, decryptCui, hashCui, normalizeRegistration, csvCell } from "@/lib/security";
import { MediaError, byteRange, storeMedia } from "@/lib/media";
import { guestPassHash, newGuestPass, mediaUrl, mediaGuest } from "@/lib/guest-access";
import {getDriveConnection,saveDriveConnection,driveCall,DriveStore,type DriveConnection} from "@/lib/drive";

export const dynamic = "force-dynamic";
const noCache = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy":"no-referrer" };
function json(data: unknown, status = 200) { return Response.json(data, { status, headers: noCache }); }
function isUniqueConflict(error: unknown) {
  let cause = error;
  for (let depth = 0; depth < 6 && cause; depth++) {
    if (String(cause).includes("UNIQUE constraint failed")) return true;
    cause = cause instanceof Error ? cause.cause : null;
  }
  return false;
}
async function readLimited(request: Request,max: number) {
  if (Number(request.headers.get("content-length")) > max || !request.body) throw new Error("Revisa el formulario.");
  const reader = request.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  while (true) { const {done,value} = await reader.read(); if (done) break; size += value.length; if (size > max) { await reader.cancel(); throw new Error("Revisa el formulario."); } chunks.push(value); }
  const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk,offset); offset += chunk.length; } return bytes;
}
export async function GET(request: Request) { return handle(request); }
export async function POST(request: Request) { return handle(request); }
export async function DELETE(request: Request) { return handle(request); }
export async function HEAD(request: Request) { return handle(request); }
export async function OPTIONS(request: Request) { return handle(request); }
async function handle(request: Request): Promise<Response> {
  const origin=request.headers.get("origin");
  const allowed=new Set([new URL(request.url).origin,"https://alex-m21.github.io"]);
  if(origin && !allowed.has(origin)) return json({error:"Solicitud no permitida."},403);
  const response=request.method==="OPTIONS" ? new Response(null,{status:204}) : await dispatch(request);
  const headers=new Headers(response.headers);
  if(origin && allowed.has(origin)) {
    headers.set("Access-Control-Allow-Origin",origin);headers.set("Vary","Origin");
    headers.set("Access-Control-Allow-Methods","GET, POST, DELETE, HEAD, OPTIONS");
    headers.set("Access-Control-Allow-Headers","Content-Type, X-Guest-Pass, X-Upload-Size, Range");
    headers.set("Access-Control-Expose-Headers","Content-Length, Content-Range, Accept-Ranges");
    headers.set("Access-Control-Max-Age","600");
  }
  return new Response(response.body,{status:response.status,headers});
}
async function mirrorGuest(connection: DriveConnection,guest: typeof guests.$inferSelect,key: string) {
  await driveCall(connection,"record",{id:guest.userId,fullName:guest.fullName,email:guest.email,cui:await decryptCui(guest.cuiEncrypted,guest.userId,key),attendance:guest.attendance,createdAt:guest.createdAt,version:guest.consentAt});
  await getDb().update(guests).set({driveSyncedAt:new Date().toISOString()}).where(and(eq(guests.userId,guest.userId),eq(guests.consentAt,guest.consentAt)));
}
async function mirrorIfConnected(userId: string,key: string) {
  try {const connection=await getDriveConnection(key);if(!connection) return false;const guest=await getDb().query.guests.findFirst({where:eq(guests.userId,userId)});if(guest) await mirrorGuest(connection,guest,key);return false;}
  catch {return true;} // The issued private pass must still reach the guest; pending copies are retried from the admin panel.
}
async function dispatch(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url); const path = url.pathname.replace(/\/$/,"");
    if (request.method === "POST" || request.method === "DELETE") {
      const origin = request.headers.get("origin");
      if (!origin || ![url.origin,"https://alex-m21.github.io"].includes(origin)) return json({error:"Solicitud no permitida."},403);
    }
    const user = await getChatGPTUser();
    const db = getDb();
    const pass = request.headers.get("x-guest-pass");
    const guestByPass = pass && /^[a-f0-9]{64}$/.test(pass) ? await db.query.guests.findFirst({where:eq(guests.accessHash,await guestPassHash(pass))}) : undefined;
    let guest = guestByPass ?? (user ? await db.query.guests.findFirst({where:eq(guests.userId,user.userId)}) : undefined);
    const mediaMatch = /^\/api\/photos\/([a-f0-9-]{36})(\/access)?$/.exec(path);
    if (!guest && mediaMatch && !mediaMatch[2] && env.CUI_ENCRYPTION_KEY) {
      const guestId = await mediaGuest(url,mediaMatch[1],env.CUI_ENCRYPTION_KEY);
      if (guestId) guest = await db.query.guests.findFirst({where:eq(guests.userId,guestId)});
    }
    const isAdmin = !!env.ADMIN_EMAIL && !!user && user.email.toLowerCase() === env.ADMIN_EMAIL.trim().toLowerCase();
    if (path === "/api/me" && request.method === "GET") return json({
      email:user?.email ?? "",isAdmin,albumOpen:albumIsOpen(event.albumOpensAt),
      guest:guest ? {fullName:guest.fullName,email:guest.email,attendance:guest.attendance} : null
    });
    if (path === "/api/rsvp" && request.method === "POST") {
      if (!env.CUI_ENCRYPTION_KEY) return json({error:"El registro aún no está habilitado. Intenta más tarde."},503);
      let data;
      try { data = normalizeRegistration(JSON.parse(new TextDecoder().decode(await readLimited(request,4096)))); }
      catch(error) { return json({error:error instanceof Error ? error.message : "Revisa el formulario."},400); }
      const userId = guest?.userId ?? user?.userId ?? `guest_${crypto.randomUUID()}`;
      // A receipt capability grants access to this registration, without an
      // account or a separate OAuth/session system. Only its hash is stored.
      const issuedPass = guestByPass ? undefined : newGuestPass();
      const accessHash = issuedPass ? await guestPassHash(issuedPass) : guest!.accessHash;
      const now = new Date().toISOString();
      const registration = {fullName:data.fullName,email:data.email,cuiEncrypted:await encryptCui(data.cui,userId,env.CUI_ENCRYPTION_KEY),cuiHash:await hashCui(data.cui,env.CUI_ENCRYPTION_KEY),accessHash,attendance:data.attendance,consentAt:now,driveSyncedAt:null};
      try { await db.insert(guests).values({userId,...registration,createdAt:guest?.createdAt ?? now}).onConflictDoUpdate({target:guests.userId,set:registration}); }
      catch(error) { if (isUniqueConflict(error)) return json({error:"No pudimos guardar el registro. Si ya te registraste, usa tu enlace privado de acceso o contacta al organizador."},409); throw error; }
      const driveSyncPending=await mirrorIfConnected(userId,env.CUI_ENCRYPTION_KEY);
      return json({ok:true,...(issuedPass ? {guestPass:issuedPass} : {}),driveSyncPending});
    }
    if(path==="/api/rsvp/attendance" && request.method==="POST") {
      if(!guest || !env.CUI_ENCRYPTION_KEY) return json({error:"Abre tu acceso privado para actualizar tu asistencia."},403);
      let body;try {body=JSON.parse(new TextDecoder().decode(await readLimited(request,512)));}catch{return json({error:"Respuesta inválida."},400);}
      if(body.attendance!=="yes" && body.attendance!=="no") return json({error:"Respuesta inválida."},400);
      await db.update(guests).set({attendance:body.attendance,consentAt:new Date().toISOString(),driveSyncedAt:null}).where(eq(guests.userId,guest.userId));
      return json({ok:true,driveSyncPending:await mirrorIfConnected(guest.userId,env.CUI_ENCRYPTION_KEY)});
    }
    if(path.startsWith("/api/admin/drive")) {
      if(!isAdmin || !env.CUI_ENCRYPTION_KEY) return json({error:"Acceso reservado al organizador."},403);
      if(path==="/api/admin/drive" && request.method==="POST") {
        let value;try{value=JSON.parse(new TextDecoder().decode(await readLimited(request,4096)));}catch{return json({error:"Revisa los datos de conexión."},400);}
        const connection={url:String(value.url || "").trim(),secret:String(value.secret || "").trim()};
        try {await driveCall(connection,"health");await saveDriveConnection(connection,env.CUI_ENCRYPTION_KEY);}
        catch{return json({error:"No pudimos conectar Drive. Verifica la URL, la clave y que la implementación permita acceso al servicio."},400);}
        return json({ok:true});
      }
      const connection=await getDriveConnection(env.CUI_ENCRYPTION_KEY);
      if(path==="/api/admin/drive" && request.method==="GET") {
        const pendingGuests=(await db.select({total:count()}).from(guests).where(isNull(guests.driveSyncedAt)))[0].total;
        const pendingMedia=(await db.select({total:count()}).from(photos).where(notLike(photos.objectKey,"drive:%")))[0].total;
        return json({connected:!!connection,pendingGuests,pendingMedia,...(connection ? await driveCall(connection,"health") : {})});
      }
      if(path==="/api/admin/drive/sync" && request.method==="POST") {
        if(!connection) return json({error:"Conecta Drive primero."},409);
        const pending=await db.select().from(guests).where(isNull(guests.driveSyncedAt)).limit(5);
        for(const item of pending) await mirrorGuest(connection,item,env.CUI_ENCRYPTION_KEY);
        const legacy=await db.select().from(photos).where(notLike(photos.objectKey,"drive:%")).limit(2);
        const drive=new DriveStore(connection);
        for(const item of legacy) {
          const object=await env.BUCKET?.get(item.objectKey);
          if(!object) throw new Error("Missing existing media");
          const key="drive:"+item.id;
          await drive.put(key,object.body,{bytes:item.bytes,httpMetadata:{contentType:item.contentType}});
          await db.update(photos).set({objectKey:key}).where(eq(photos.id,item.id));
        }
        return json({ok:true,processed:pending.length+legacy.length});
      }
      return json({error:"Ruta no encontrada."},404);
    }
    const deleteGuest=/^\/api\/admin\/guests\/([a-zA-Z0-9_-]{1,100})$/.exec(path);
    if(deleteGuest && request.method==="DELETE") {
      if(!isAdmin) return json({error:"Acceso reservado al organizador."},403);
      if(!env.CUI_ENCRYPTION_KEY) return json({error:"El listado no está disponible."},503);
      const target=await db.query.guests.findFirst({where:eq(guests.userId,deleteGuest[1])});
      if(!target) return json({error:"El registro ya no existe. Actualiza el listado."},404);
      const connection=await getDriveConnection(env.CUI_ENCRYPTION_KEY);
      if(connection) {
        try {await driveCall(connection,"deleteRecord",{id:target.userId});}
        catch {return json({error:"No se eliminó el registro. Revisa la conexión de Drive y actualiza la implementación de Apps Script para permitir eliminar registros."},503);}
      }
      // The nullable FK detaches existing media, preserving the shared album.
      await db.delete(guests).where(eq(guests.userId,target.userId));
      return json({ok:true});
    }
    if (path === "/api/admin/guests" && request.method === "GET") {
      if (!isAdmin) return json({error:"Acceso reservado al organizador."},403);
      if (!env.CUI_ENCRYPTION_KEY) return json({error:"El listado no está disponible."},503);
      const rows = await db.select().from(guests).orderBy(guests.fullName);
      const list = await Promise.all(rows.map(async g => ({id:g.userId,fullName:g.fullName,email:g.email,cui:await decryptCui(g.cuiEncrypted,g.userId,env.CUI_ENCRYPTION_KEY!),attendance:g.attendance,createdAt:g.createdAt})));
      if (url.searchParams.get("format") === "csv") {
        const lines = [["Nombre completo","Correo","CUI","Asistencia","Registro"],...list.map(g=>[g.fullName,g.email,g.cui,g.attendance === "yes" ? "Confirmada" : "No asistirá",g.createdAt])];
        return new Response("\uFEFF"+lines.map(row=>row.map(csvCell).join(",")).join("\r\n"),{headers:{...noCache,"Content-Type":"text/csv; charset=utf-8","Content-Disposition":'attachment; filename="invitados-graduacion.csv"'}});
      }
      return json({guests:list});
    }
    if (path === "/api/photos" || mediaMatch) {
      if (guest?.attendance !== "yes") return json({error:"Confirma tu asistencia o abre tu enlace privado para entrar al álbum."},403);
      if (!albumIsOpen(event.albumOpensAt)) return json({error:"El álbum todavía no está disponible. Intenta de nuevo más tarde."},403);
      if (!env.CUI_ENCRYPTION_KEY) return json({error:"El álbum no está disponible. Intenta más tarde."},503);
      if (mediaMatch) {
        if (request.method !== "GET" && request.method !== "HEAD") return json({error:"No se permite modificar ni borrar fotos ni videos."},405);
        const media = await db.query.photos.findFirst({where:eq(photos.id,mediaMatch[1])});
        if (!media) return json({error:"Recuerdo no encontrado."},404);
        if (mediaMatch[2]) return json({url:await mediaUrl(media.id,guest.userId,env.CUI_ENCRYPTION_KEY)});
        let range;
        try { range = request.headers.has("if-range") ? null : byteRange(request.headers.get("range"),media.bytes); }
        catch { return new Response(null,{status:416,headers:{...noCache,"Content-Range":`bytes */${media.bytes}`,"Accept-Ranges":"bytes"}}); }
        const headers: Record<string,string> = {...noCache,"Content-Type":media.contentType,"Content-Length":String(range?.length ?? media.bytes),"Content-Disposition":"inline","Accept-Ranges":"bytes"};
        if (range) headers["Content-Range"] = `bytes ${range.offset}-${range.offset+range.length-1}/${media.bytes}`;
        if (request.method === "HEAD") return new Response(null,{status:range ? 206 : 200,headers});
        const connection=media.objectKey.startsWith("drive:") ? await getDriveConnection(env.CUI_ENCRYPTION_KEY) : null;
        if(media.objectKey.startsWith("drive:") && !connection) return json({error:"La conexión del álbum no está disponible."},503);
        const object = connection ? await new DriveStore(connection).get(media.objectKey,range ?? undefined) : await env.BUCKET?.get(media.objectKey,range ? {range} : undefined);
        if (!object) return json({error:"Recuerdo no encontrado."},404);
        return new Response(object.body,{status:range ? 206 : 200,headers});
      }
      if (request.method === "GET") {
        let cursor: {date:string;id:string} | null = null;
        if (url.searchParams.has("cursor")) { try { cursor = JSON.parse(atob(url.searchParams.get("cursor")!)); if (!cursor || !/^\d{4}-/.test(cursor.date) || !/^[a-f0-9-]{36}$/.test(cursor.id)) throw 0; } catch { return json({error:"Página inválida."},400); } }
        const rows = await db.select({id:photos.id,createdAt:photos.createdAt,contentType:photos.contentType}).from(photos).where(cursor ? or(lt(photos.createdAt,cursor.date),and(eq(photos.createdAt,cursor.date),lt(photos.id,cursor.id))) : undefined).orderBy(desc(photos.createdAt),desc(photos.id)).limit(31);
        const items = rows.slice(0,30); const last = items.at(-1);
        return json({photos:await Promise.all(items.map(async item=>({...item,kind:item.contentType.startsWith("video/") ? "video" : "photo",url:await mediaUrl(item.id,guest!.userId,env.CUI_ENCRYPTION_KEY!)}))),nextCursor:rows.length > 30 && last ? btoa(JSON.stringify({date:last.createdAt,id:last.id})) : null});
      }
      if (request.method === "POST") {
        const totals = await db.select({total:count()}).from(photos).where(eq(photos.userId,guest.userId));
        if (totals[0].total >= 50) return json({error:"Ya compartiste el máximo de 50 fotos y videos por invitado."},429);
        const connection=await getDriveConnection(env.CUI_ENCRYPTION_KEY);
        if(!connection && !env.BUCKET) return json({error:"El álbum no está disponible."},503);
        const bucket=connection ? new DriveStore(connection) : env.BUCKET!;
        const id = crypto.randomUUID(); const objectKey = connection ? "drive:"+id : `event/photos/${id}`;
        const uploaded = await storeMedia(request,bucket,objectKey);
        try { await db.insert(photos).values({id,userId:guest.userId,objectKey,...uploaded,createdAt:new Date().toISOString()}); }
        catch(error) { await bucket.delete(objectKey); throw error; }
        return json({ok:true,id},201);
      }
    }
    return json({error:"Ruta no encontrada."},404);
  } catch(error) {
    if (error instanceof MediaError) return json({error:error.message},error.status);
    return json({error:"No pudimos completar la solicitud. Intenta de nuevo."},500);
  }
}
