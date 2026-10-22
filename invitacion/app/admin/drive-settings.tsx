"use client";
import {useEffect,useState,type FormEvent} from "react";
type DriveStatus={connected:boolean;folderUrl?:string;sheetUrl?:string;pendingGuests:number;pendingMedia:number};
export default function DriveSettings() {
  const [status,setStatus]=useState<DriveStatus|null>(null);const [error,setError]=useState("");const [busy,setBusy]=useState(false);const [message,setMessage]=useState("");
  async function call(path:string,options?:RequestInit) {const response=await fetch(path,options);const data=await response.json() as DriveStatus & {error?:string;processed?:number};if(!response.ok) throw new Error(data.error || "No se pudo completar la operación.");return data;}
  async function load() {try{setStatus(await call("/api/admin/drive"));}catch{/* The main panel already reports unauthorized users. */}}
  useEffect(()=>{void load();},[]);
  async function connect(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();setBusy(true);setError("");setMessage("");const form=event.currentTarget;const data=new FormData(form);
    try {await call("/api/admin/drive",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:data.get("url"),secret:data.get("secret")})});form.reset();await load();setMessage("Drive conectado. Sincroniza los registros y archivos existentes para completar el cambio.");}
    catch(error){setError(error instanceof Error ? error.message : "No pudimos conectar Drive.");}finally{setBusy(false);}
  }
  async function sync() {
    setBusy(true);setError("");setMessage("");
    try {let count=0;for(let batch=0;batch<100;batch++){const result=await call("/api/admin/drive/sync",{method:"POST",headers:{"Content-Type":"application/json"},body:"{}"});count+=result.processed ?? 0;setMessage("Sincronizando… "+count+" registros y archivos procesados.");if(!result.processed) break;}await load();setMessage("Sincronización terminada. Revisa los pendientes; puedes repetirla si hace falta.");}
    catch(error){setError(error instanceof Error ? error.message : "No pudimos completar la sincronización.");}finally{setBusy(false);}
  }
  if(!status) return null;
  return <section className="drive-settings"><h2>Almacenamiento en Google Drive</h2><p>{status.connected ? "Las nuevas fotos y videos se guardan en Drive. El listado se copia a tu hoja privada." : "Drive todavía no está conectado. El registro y el álbum actuales siguen usando el almacenamiento del sitio."}</p>{status.connected && <><p><a href={status.folderUrl} target="_blank" rel="noreferrer">Abrir carpeta privada ↗</a> · <a href={status.sheetUrl} target="_blank" rel="noreferrer">Abrir listado en Sheets ↗</a></p><p>{status.pendingGuests} registros y {status.pendingMedia} archivos pendientes de copiar.</p><button className="button" disabled={busy} onClick={()=>void sync()}>Sincronizar pendientes</button></>}<details><summary>{status.connected ? "Cambiar conexión" : "Conectar mi Drive"}</summary><p>Autoriza la conexión de Google Apps Script con tu cuenta. Los archivos necesarios están en el repositorio, en <code>invitacion/integrations/google-apps-script</code>. Esta autorización se hace una sola vez; los invitados no necesitan una cuenta de Google.</p><form onSubmit={connect}><label>URL de implementación de Google<input name="url" type="url" placeholder="https://script.google.com/macros/s/…/exec" required/></label><label>Clave privada de conexión<input name="secret" type="password" autoComplete="new-password" required pattern="[a-f0-9]{64}" placeholder="Clave BRIDGE_KEY de las propiedades del script"/></label><p>La clave se cifra en el servidor. No la pegues en el chat ni la subas a GitHub.</p><button className="button" disabled={busy}>{busy ? "Comprobando…" : "Conectar Drive"}</button></form></details>{error && <p className="error" role="alert">{error}</p>}{message && <p role="status">{message}</p>}</section>;
}
