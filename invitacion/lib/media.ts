import { photoType } from "./security";

export const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
export interface AlbumStore {
  put(key: string,body: ReadableStream<Uint8Array>,options: {httpMetadata:{contentType:string};bytes:number}): Promise<unknown>;
  delete(key: string): Promise<unknown>;
}
export class MediaError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export function mediaType(bytes: Uint8Array) {
  const image = photoType(bytes);
  if (image) return image;
  const decoder = new TextDecoder();
  if (bytes.length >= 16 && decoder.decode(bytes.slice(4,8)) === "ftyp") {
    const boxSize = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0);
    if (boxSize < 16 || boxSize > 4096) return null;
    const major = decoder.decode(bytes.slice(8,12));
    if (major === "qt  ") return "video/quicktime";
    const brands = new Set(["isom","iso2","iso3","iso4","iso5","iso6","mp41","mp42","avc1","M4V ","M4VH","M4VP","MSNV","dash"]);
    if (brands.has(major)) return "video/mp4";
    // Do not mistake HEIC/AVIF images or audio-only files for video.
    return null;
  }
  if ([0x1a,0x45,0xdf,0xa3].every((b,i) => bytes[i] === b) && decoder.decode(bytes.slice(0,512)).includes("webm")) return "video/webm";
  return null;
}
export function byteRange(header: string | null, size: number) {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2])) throw new MediaError("Rango inválido.",416);
  const suffix = !match[1];
  const start = suffix ? Math.max(0,size-Number(match[2])) : Number(match[1]);
  const end = suffix || !match[2] ? size-1 : Math.min(size-1,Number(match[2]));
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= size || end < start || (suffix && Number(match[2]) === 0)) throw new MediaError("Rango inválido.",416);
  return { offset:start, length:end-start+1 };
}

// R2 requires a known-length stream. Forward bounded chunks instead of buffering
// a complete video in the Worker's 128 MB memory. See Cloudflare's stream docs.
export async function storeMedia(request: Request, bucket: AlbumStore, key: string) {
  const sizeHeader = request.headers.get("x-upload-size") ?? request.headers.get("content-length");
  const size = Number(sizeHeader);
  if (!sizeHeader || !Number.isSafeInteger(size) || size < 32) throw new MediaError("No pudimos leer el tamaño del archivo. Selecciónalo de nuevo.",411);
  if (size > MAX_VIDEO_BYTES) throw new MediaError("Cada video debe pesar como máximo 50 MB.",413);
  if (!request.body) throw new MediaError("El archivo está vacío.");
  const reader = request.body.getReader();
  const firstChunks: Uint8Array[] = [];
  let received = 0;
  let writer: WritableStreamDefaultWriter<Uint8Array> | undefined;
  try {
    while (received < Math.min(512,size)) {
      const {done,value} = await reader.read();
      if (done) break;
      firstChunks.push(value);
      received += value.byteLength;
      if (received > size) throw new MediaError("El tamaño del archivo no coincide.");
    }
    const prefix = new Uint8Array(Math.min(512,received));
    let offset = 0;
    for (const chunk of firstChunks) { const part = chunk.subarray(0,prefix.length-offset); prefix.set(part,offset); offset += part.length; if (offset === prefix.length) break; }
    const contentType = mediaType(prefix);
    if (!contentType) throw new MediaError("Usa fotos JPG, PNG o WebP, o videos MP4, MOV o WebM.");
    if (contentType.startsWith("image/") && size > MAX_PHOTO_BYTES) throw new MediaError("Cada foto debe pesar como máximo 8 MB.",413);
    const stream = new FixedLengthStream(size);
    writer = stream.writable.getWriter();
    const stored = bucket.put(key,stream.readable,{httpMetadata:{contentType},bytes:size});
    const pumping = (async () => {
      try {
        for (const chunk of firstChunks) await writer!.write(chunk);
        while (true) {
          const {done,value} = await reader.read();
          if (done) break;
          received += value.byteLength;
          if (received > size) throw new MediaError("El tamaño del archivo no coincide.");
          await writer!.write(value);
        }
        if (received !== size) throw new MediaError("La subida quedó incompleta. Intenta de nuevo.");
        await writer!.close();
      } catch(error) { await writer!.abort(error).catch(() => {}); throw error; }
    })();
    await Promise.all([stored,pumping]);
    return {contentType,bytes:size};
  } catch(error) {
    await reader.cancel().catch(() => {});
    await writer?.abort(error).catch(() => {});
    await bucket.delete(key).catch(() => {});
    throw error;
  } finally { reader.releaseLock(); }
}
