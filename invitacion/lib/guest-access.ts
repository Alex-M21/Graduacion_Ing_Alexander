const encoder = new TextEncoder();
function hex(bytes: ArrayBuffer) { return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,"0")).join(""); }
export function newGuestPass() { return hex(crypto.getRandomValues(new Uint8Array(32)).buffer); }
export async function guestPassHash(pass: string) { return hex(await crypto.subtle.digest("SHA-256",encoder.encode(pass))); }
async function signingKey(secret: string) {
  return crypto.subtle.importKey("raw",Uint8Array.from(atob(secret),c=>c.charCodeAt(0)),{name:"HMAC",hash:"SHA-256"},false,["sign","verify"]);
}
export async function mediaUrl(id: string,guestId: string,secret: string) {
  const expires = Math.floor(Date.now()/1000)+3600;
  const signature = hex(await crypto.subtle.sign("HMAC",await signingKey(secret),encoder.encode(`media:${id}:${guestId}:${expires}`)));
  const query = new URLSearchParams({guest:guestId,expires:String(expires),signature});
  return `/api/photos/${id}?${query}`;
}
export async function mediaGuest(url: URL,id: string,secret: string) {
  const guest = url.searchParams.get("guest"); const expires = Number(url.searchParams.get("expires")); const signature = url.searchParams.get("signature");
  if (!guest || !/^[a-zA-Z0-9_-]{1,100}$/.test(guest) || !Number.isSafeInteger(expires) || expires < Math.floor(Date.now()/1000) || expires > Math.floor(Date.now()/1000)+3600 || !signature || !/^[a-f0-9]{64}$/.test(signature)) return null;
  const valid = await crypto.subtle.verify("HMAC",await signingKey(secret),Uint8Array.from(signature.match(/../g)!,part=>parseInt(part,16)),encoder.encode(`media:${id}:${guest}:${expires}`));
  return valid ? guest : null;
}
