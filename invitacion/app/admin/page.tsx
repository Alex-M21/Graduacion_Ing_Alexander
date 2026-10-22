"use client";
import {useEffect,useState} from "react";
import {ArrowLeft,Download,RefreshCw,Trash2} from "lucide-react";
import DriveSettings from "./drive-settings";
type Guest={id:string;fullName:string;email:string;cui:string;attendance:"yes"|"no";createdAt:string};
export default function Admin() {
  const [guests,setGuests]=useState<Guest[]>([]);
  const [error,setError]=useState("");const [actionError,setActionError]=useState("");
  const [notice,setNotice]=useState("");const [loading,setLoading]=useState(true);
  const [search,setSearch]=useState("");const [deletingId,setDeletingId]=useState<string|null>(null);
  async function load() {
    setLoading(true);setError("");
    try {
      const response=await fetch("/api/admin/guests");
      const data=await response.json() as {guests:Guest[];error?:string};
      if(!response.ok) throw new Error(data.error || "No pudimos cargar el listado.");
      setGuests(data.guests);
    } catch(e) {setError(e instanceof Error ? e.message : "No pudimos cargar el listado.");}
    finally {setLoading(false);}
  }
  async function removeGuest(guest:Guest) {
    if(deletingId || loading) return;
    if(!window.confirm(`¿Eliminar el registro de ${guest.fullName}?\n\nSe borrarán sus datos del listado y su enlace privado dejará de funcionar. Sus fotos y videos permanecerán en el álbum. Esta acción no se puede deshacer.`)) return;
    setDeletingId(guest.id);setActionError("");setNotice("");
    try {
      const response=await fetch("/api/admin/guests/"+encodeURIComponent(guest.id),{method:"DELETE",credentials:"same-origin"});
      const data=await response.json() as {error?:string};
      if(!response.ok) throw new Error(data.error || "No pudimos eliminar el registro.");
      setGuests(current=>current.filter(item=>item.id!==guest.id));
      setNotice(`Se eliminó el registro de ${guest.fullName}.`);
    } catch(e) {setActionError(e instanceof Error ? e.message : "No pudimos eliminar el registro. Intenta de nuevo.");}
    finally {setDeletingId(null);}
  }
  useEffect(()=>{void load();},[]);
  const filtered=guests.filter(g=>`${g.fullName} ${g.email} ${g.cui}`.toLowerCase().includes(search.toLowerCase()));
  return <main className="admin-page">
    <a className="text-button" href="/"><ArrowLeft size={14}/> Volver a la invitación</a>
    <p className="eyebrow" style={{marginTop:30}}>SOLO PARA EL ORGANIZADOR</p><h1>Listado de invitados</h1>
    <p>Graduación Ing. Alexander Mejía · 28 de octubre de 2026 · 10:00 a. m.</p>
    {error ? <>
      <p className="error" role="alert">{error}</p><p>Inicia sesión con el correo autorizado del organizador.</p>
      <a className="button primary" href="/signin-with-chatgpt?return_to=%2Fadmin" target="_top">Iniciar sesión</a>
      <button className="text-button" style={{marginLeft:20}} onClick={()=>void load()}>Reintentar</button>
    </> : <>
      <p className="summary">{guests.filter(g=>g.attendance==="yes").length} asistencias confirmadas · {guests.filter(g=>g.attendance==="no").length} no asistirán</p>
      <div className="admin-toolbar">
        <input aria-label="Buscar por nombre, correo o CUI" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar nombre, correo o CUI…"/>
        <button className="text-button" disabled={loading || !!deletingId} onClick={()=>void load()}><RefreshCw size={14}/>Actualizar</button>
        <a className="button primary" href="/api/admin/guests?format=csv"><Download size={16}/>Descargar listado CSV</a>
      </div>
      <p>Los CUI son privados. Comparte el listado únicamente con el personal encargado del ingreso.</p>
      {actionError && <p className="error" role="alert">{actionError}</p>}
      {notice && <p className="admin-notice" role="status">{notice}</p>}
      <div className="admin-table-wrap"><table><thead><tr><th>Nombre completo</th><th>Correo</th><th>CUI</th><th>Asistencia</th><th>Acciones</th></tr></thead><tbody>
        {filtered.map(g=><tr key={g.id}><td>{g.fullName}</td><td>{g.email}</td><td>{g.cui}</td><td>{g.attendance==="yes" ? "Confirmada" : "No asistirá"}</td><td><button type="button" className="admin-delete" disabled={loading || !!deletingId} onClick={()=>void removeGuest(g)} aria-label={`Eliminar registro de ${g.fullName}`}><Trash2 size={15}/>{deletingId===g.id ? "Eliminando…" : "Eliminar"}</button></td></tr>)}
      </tbody></table></div>
      {loading && <p role="status">Consultando listado…</p>}
      {!loading && !filtered.length && <p>{search ? "No hay coincidencias." : "Aún no hay invitados registrados."}</p>}
    </>}
    <DriveSettings/>
  </main>;
}
