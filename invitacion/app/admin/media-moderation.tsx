"use client";
import {useEffect,useRef,useState} from "react";
import {Eye,EyeOff,RefreshCw,Trash2,ExternalLink} from "lucide-react";
type Media={id:string;url:string;kind:"photo"|"video";contentType:string;bytes:number;createdAt:string;hiddenAt:string|null;uploaderName:string|null};
type Stats={files:number;bytes:number;hidden:number};
function size(bytes:number) {return bytes<1024 ? bytes+" B" : bytes<1024**2 ? (bytes/1024).toFixed(1)+" KB" : bytes<1024**3 ? (bytes/1024**2).toFixed(2)+" MB" : (bytes/1024**3).toFixed(2)+" GB";}
export default function MediaModeration() {
  const [media,setMedia]=useState<Media[]>([]),[stats,setStats]=useState<Stats>({files:0,bytes:0,hidden:0});
  const [kind,setKind]=useState("all"),[visibility,setVisibility]=useState("all"),[cursor,setCursor]=useState<string|null>(null);
  const [loading,setLoading]=useState(true),[loadError,setLoadError]=useState("");
  const [busy,setBusy]=useState<string|null>(null),[actionError,setActionError]=useState(""),[notice,setNotice]=useState("");
  const [viewingEnabled,setViewingEnabled]=useState(true);
  const requestVersion=useRef(0);
  async function load(next?:string) {
    const version=++requestVersion.current;setLoading(true);setLoadError("");
    try {
      const query=new URLSearchParams({kind,visibility});if(next) query.set("cursor",next);
      const response=await fetch("/api/admin/media?"+query);
      const data=await response.json() as {media:Media[];stats:Stats;viewingEnabled:boolean;nextCursor:string|null;error?:string};
      if(!response.ok) throw new Error(data.error || "No pudimos cargar el álbum.");
      if(version!==requestVersion.current) return;
      setMedia(current=>next ? Array.from(new Map([...current,...data.media].map(item=>[item.id,item])).values()) : data.media);
      setStats(data.stats);setCursor(data.nextCursor);setViewingEnabled(data.viewingEnabled);
    } catch(e) {if(version===requestVersion.current) setLoadError(e instanceof Error ? e.message : "No pudimos cargar el álbum.");}
    finally {if(version===requestVersion.current) setLoading(false);}
  }
  useEffect(()=>{setMedia([]);setCursor(null);void load();return ()=>{requestVersion.current++;};},[kind,visibility]);
  async function changeViewing() {
    if(busy || loading) return;
    setBusy("viewing");setActionError("");setNotice("");
    try {
      const response=await fetch("/api/admin/media/settings",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({viewingEnabled:!viewingEnabled})});
      const data=await response.json() as {error?:string};
      if(!response.ok) throw new Error(data.error || "No pudimos cambiar la visualización del álbum.");
      setNotice(viewingEnabled ? "Visualización pausada para los invitados. Pueden seguir subiendo recuerdos y tú puedes revisarlos aquí." : "Visualización activada. Los invitados pueden ver los recuerdos que no estén ocultos.");
    } catch(e) {setActionError(e instanceof Error ? e.message : "No pudimos cambiar la visualización.");}
    finally {await load();setBusy(null);}
  }
  async function moderate(item:Media,action:"visibility"|"delete") {
    if(busy || loading) return;
    if(action==="delete" && !window.confirm("¿Eliminar este recuerdo definitivamente?\n\nSe borrará del álbum y del almacenamiento. No podrás recuperarlo desde esta página. El registro del invitado permanecerá intacto.")) return;
    setBusy(item.id);setActionError("");setNotice("");
    try {
      const response=await fetch("/api/admin/media/"+encodeURIComponent(item.id)+(action==="visibility" ? "/visibility" : ""),{
        method:action==="delete" ? "DELETE" : "POST",credentials:"same-origin",
        ...(action==="visibility" ? {headers:{"Content-Type":"application/json"},body:JSON.stringify({hidden:!item.hiddenAt})} : {})
      });
      const data=await response.json() as {error?:string};
      if(!response.ok) throw new Error(data.error || "No pudimos actualizar el recuerdo.");
      setNotice(action==="delete" ? "Recuerdo eliminado del álbum y del almacenamiento." : item.hiddenAt ? "El recuerdo vuelve a estar visible para los invitados." : "Recuerdo oculto. Los invitados ya no pueden abrirlo.");
    } catch(e) {setActionError(e instanceof Error ? e.message : "No pudimos actualizar el recuerdo. Intenta de nuevo.");}
    finally {await load();setBusy(null);}
  }
  return <section className="moderation" aria-labelledby="moderation-title">
    <p className="eyebrow">SOLO PARA EL ORGANIZADOR</p><h2 id="moderation-title">Moderación del álbum</h2>
    <p>Revisa las fotos y videos. Ocultar los retira del álbum de invitados y permite volver a mostrarlos. Eliminar los borra definitivamente.</p>
    <div className="moderation-viewing"><div><h3>Visualización para invitados</h3><p>{viewingEnabled ? "Activa: los invitados confirmados pueden ver las fotos y videos visibles." : "Pausada: solo tú puedes ver el álbum desde este administrador."}</p><small>Las subidas siguen disponibles. Este control afecta a todo el álbum, incluidas las fotos y los videos.</small></div><button type="button" role="switch" aria-checked={viewingEnabled} className="moderation-switch" disabled={loading || !!busy} onClick={()=>void changeViewing()}><span aria-hidden="true"/>{busy==="viewing" ? "Guardando…" : viewingEnabled ? "Pausar visualización" : "Activar visualización"}</button></div>
    <div className="moderation-stats" aria-live="polite"><div><strong>{stats.files}</strong><span>Fotos y videos</span></div><div><strong>{size(stats.bytes)}</strong><span>Tamaño del álbum</span></div><div><strong>{stats.hidden}</strong><span>Ocultos</span></div></div>
    <p className="moderation-hint">El tamaño incluye los archivos ocultos. Ocultar no libera espacio.</p>
    <div className="moderation-toolbar">
      <label>Tipo<select value={kind} onChange={e=>setKind(e.target.value)} disabled={!!busy}><option value="all">Fotos y videos</option><option value="photo">Solo fotos</option><option value="video">Solo videos</option></select></label>
      <label>Visibilidad<select value={visibility} onChange={e=>setVisibility(e.target.value)} disabled={!!busy}><option value="all">Todos</option><option value="visible">Visibles</option><option value="hidden">Ocultos</option></select></label>
      <button type="button" className="text-button" onClick={()=>void load()} disabled={loading || !!busy}><RefreshCw size={15}/> Actualizar álbum</button>
    </div>
    {actionError && <p className="error" role="alert">{actionError}</p>}
    {notice && <p className="admin-notice" role="status">{notice}</p>}
    {loadError && <p className="error" role="alert">{loadError} <button type="button" className="text-button" onClick={()=>void load()} disabled={loading || !!busy}>Reintentar</button></p>}
    <div className="moderation-grid">
      {media.map(item=><article className="moderation-card" key={item.id} data-media-id={item.id}>
        <div className="moderation-preview">{item.kind==="video" ? <video src={item.url} controls playsInline preload="none" aria-label="Video para moderar"/> : <a href={item.url} target="_blank" rel="noopener noreferrer" aria-label="Ver foto completa"><img src={item.url} alt="Foto compartida por un invitado" loading="lazy"/></a>}</div>
        <div className="moderation-card-body"><span className={"media-visibility "+(item.hiddenAt ? "is-hidden" : "is-public")}>{item.hiddenAt ? "Oculto para invitados" : "Visible en el álbum"}</span>
          <p className="moderation-uploader">{item.uploaderName || "Invitado con registro eliminado"}</p>
          <p className="moderation-meta">{item.kind==="video" ? "Video" : "Foto"} · {size(item.bytes)} · {new Date(item.createdAt).toLocaleDateString("es-GT",{timeZone:"America/Guatemala",day:"numeric",month:"short"})}</p>
          <a className="text-button" href={item.url} target="_blank" rel="noopener noreferrer">Ver original <ExternalLink size={12}/></a>
          <div className="moderation-actions"><button type="button" className="moderation-visibility" disabled={!!busy || loading} onClick={()=>void moderate(item,"visibility")}>{item.hiddenAt ? <Eye size={15}/> : <EyeOff size={15}/>} {item.hiddenAt ? "Volver a mostrar" : "Ocultar"}</button><button type="button" className="admin-delete" disabled={!!busy || loading} onClick={()=>void moderate(item,"delete")}><Trash2 size={15}/> Eliminar</button></div>
          {busy===item.id && <p role="status">Actualizando recuerdo…</p>}
        </div>
      </article>)}
    </div>
    {loading && <p role="status">Cargando recuerdos…</p>}
    {!loading && !loadError && !media.length && <p>No hay recuerdos con estos filtros.</p>}
    {cursor && <button type="button" className="button" disabled={loading || !!busy} onClick={()=>void load(cursor)}>Cargar más recuerdos</button>}
  </section>;
}
