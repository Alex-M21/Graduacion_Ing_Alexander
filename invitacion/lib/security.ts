const encoder = new TextEncoder();
function bytesToBase64(bytes: Uint8Array) { return btoa(Array.from(bytes, b => String.fromCharCode(b)).join("")); }
function base64ToBytes(value: string) { return Uint8Array.from(atob(value), c => c.charCodeAt(0)); }
async function encryptionKey(secret: string) {
  const raw = base64ToBytes(secret);
  if (raw.length !== 32) throw new Error("Invalid encryption key");
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}
export async function encryptCui(cui: string, userId: string, secret: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: encoder.encode(userId) }, await encryptionKey(secret), encoder.encode(cui));
  return `${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(encrypted))}`;
}
export async function decryptCui(value: string, userId: string, secret: string) {
  const [iv, encrypted] = value.split(".");
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64ToBytes(iv), additionalData: encoder.encode(userId) }, await encryptionKey(secret), base64ToBytes(encrypted));
  return new TextDecoder().decode(plain);
}
export async function hashCui(cui: string, secret: string) {
  const key = await crypto.subtle.importKey("raw", base64ToBytes(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return bytesToBase64(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(`cui:${cui}`))));
}
export function normalizeRegistration(body: unknown) {
  if (!body || typeof body !== "object") throw new Error("Revisa los datos del formulario.");
  const data = body as Record<string, unknown>;
  const fullName = typeof data.fullName === "string" ? data.fullName.trim().replace(/\s+/g, " ") : "";
  const email = typeof data.email === "string" ? data.email.trim().toLowerCase() : "";
  const cui = typeof data.cui === "string" ? data.cui.replace(/[\s-]/g, "") : "";
  if (fullName.length < 5 || fullName.length > 160 || fullName.split(" ").length < 2 || /[\x00-\x1f]/.test(fullName)) throw new Error("Escribe tu nombre y apellidos completos.");
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Escribe un correo válido.");
  if (!/^\d{13}$/.test(cui)) throw new Error("El CUI debe tener 13 dígitos.");
  if (data.attendance !== "yes" && data.attendance !== "no") throw new Error("Selecciona si podrás asistir.");
  if (data.consent !== true) throw new Error("Necesitamos tu autorización para guardar los datos del registro.");
  return { fullName, email, cui, attendance: data.attendance as "yes" | "no" };
}
export function photoType(bytes: Uint8Array) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if ([137,80,78,71,13,10,26,10].every((b,i) => bytes[i] === b)) return "image/png";
  if (new TextDecoder().decode(bytes.slice(0,4)) === "RIFF" && new TextDecoder().decode(bytes.slice(8,12)) === "WEBP") return "image/webp";
  return null;
}
export function albumIsOpen(opensAt: string, now = Date.now()) { return now >= Date.parse(opensAt); }
export function csvCell(value: string) { return `"${(/^[\s]*[=+@-]/.test(value) ? "'" : "") + value.replaceAll('"', '""')}"`; }
