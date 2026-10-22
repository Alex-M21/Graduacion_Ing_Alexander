import {eq} from "drizzle-orm";
import {getDb} from "@/db";
import {settings} from "@/db/schema";
import {decryptCui,encryptCui} from "@/lib/security";
const settingKey="album-viewing";
export async function albumViewingEnabled(key:string|undefined) {
  if(!key) return false;
  const row=await getDb().query.settings.findFirst({where:eq(settings.key,settingKey)});
  if(!row) return true;
  return JSON.parse(await decryptCui(row.encryptedValue,settingKey,key))===true;
}
export async function setAlbumViewingEnabled(enabled:boolean,key:string) {
  const encryptedValue=await encryptCui(JSON.stringify(enabled),settingKey,key);
  await getDb().insert(settings).values({key:settingKey,encryptedValue}).onConflictDoUpdate({target:settings.key,set:{encryptedValue}});
}
