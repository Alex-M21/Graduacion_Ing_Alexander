(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const config = window.INVITATION_CONFIG || {};
  const apiBase = (config.apiBase || location.origin).replace(/\/$/,"");
  const storageKey = "graduacion-guest-pass";
  let pass = "", me = null, editing = false, busy = false, media = [], cursor = null, paged = false, filter = "all";
  try { pass = localStorage.getItem(storageKey) || ""; } catch {}
  const restored = new URLSearchParams(location.hash.slice(1)).get("acceso");
  function savePass(value) { pass=value; try { localStorage.setItem(storageKey,value); } catch {} }
  if (restored && /^[a-f0-9]{64}$/.test(restored)) { savePass(restored); history.replaceState(null,"",location.pathname+"#registro"); }
  function message(id,text) { $(id).textContent=text || ""; $(id).hidden=!text; }
  let toastTimer;
  function toast(text) { message("toast",text); clearTimeout(toastTimer); toastTimer=setTimeout(()=>message("toast",""),6500); }
  function publicUrl() { return new URL(location.pathname,location.origin).href; }
  async function api(path,options={}) {
    const headers = new Headers(options.headers); if(pass) headers.set("X-Guest-Pass",pass);
    const response = await fetch(apiBase+path,{...options,headers,credentials:"omit"});
    const data = await response.json().catch(()=>({error:"No pudimos comunicarnos con el servidor."}));
    if(!response.ok) throw new Error(data.error || "Intenta de nuevo.");
    return data;
  }
  function renderRegistration() {
    $("register-loading").hidden=true; $("register-connection-error").hidden=true;
    const showConfirmation=!!me?.guest && !editing;
    $("rsvp-form").hidden=showConfirmation; $("confirmed-state").hidden=!showConfirmation;
    $("cancel-edit").hidden=!editing;
    if(showConfirmation) {
      const attending=me.guest.attendance==="yes";
      $("confirmed-title").textContent=attending ? "¡Estás en la lista!" : "Gracias por avisarme.";
      $("confirmed-name").textContent=me.guest.fullName+(attending ? ", nos vemos para celebrar." : ", espero que pronto podamos celebrar juntos.");
      $("album-entry").hidden=!attending;
      $("album-entry").textContent=me.albumOpen ? "Entrar y compartir mis recuerdos ↗" : "Consultar el álbum de recuerdos ↗";
      $("save-access").hidden=!pass; document.querySelector(".access-help").hidden=!pass;
      $("decline-rsvp").hidden=!attending;
    }
    const canEnter=me?.guest?.attendance==="yes" && me.albumOpen;
    $("album-content").hidden=!canEnter; $("album-locked").hidden=canEnter;
    $("album-preview").hidden=canEnter; $("album-upload-shortcut").hidden=!canEnter;
    $("album-register-link").hidden=me?.guest?.attendance==="yes";
    $("album-locked-message").textContent=me?.guest?.attendance==="yes" ? "Tu asistencia está confirmada. Estamos preparando el álbum; actualiza la página en un momento." : "Confirma tu asistencia para compartir y ver los recuerdos de todos. Si ya confirmaste, entra con tu enlace privado.";
    const attending=me?.guest?.attendance==="yes";
    $("mobile-action-link").href=canEnter ? "#album" : "#registro";
    $("mobile-action-link").textContent=canEnter ? "Ver fotos y videos ↗" : attending && !editing ? "Ver mi confirmación ↗" : "Confirmar asistencia ↗";
    $("mobile-action-note").textContent=attending ? "¡Ya estás en la lista!" : "28 OCT · 10:00 a. m.";
  }
  async function refreshMe() {
    try { const wasOpen=me?.guest?.attendance==="yes" && me.albumOpen; me=await api("/api/me"); renderRegistration(); if(!wasOpen && me.guest?.attendance==="yes" && me.albumOpen) await loadMedia(); }
    catch { $("register-loading").hidden=true; $("register-connection-error").hidden=false; }
  }
  $("retry-me").addEventListener("click",()=>void refreshMe());
  $("rsvp-form").addEventListener("submit",async event=>{
    event.preventDefault(); if(busy) return;
    const form=event.currentTarget; const fields=new FormData(form);
    const cui=String(fields.get("cui") || "").replace(/[\s-]/g,"");
    if(!/^\d{13}$/.test(cui)) { message("form-error","Escribe los 13 números del CUI de tu DPI, sin letras."); $("cui").focus(); return; }
    busy=true; $("submit-rsvp").disabled=true; $("submit-rsvp").textContent="Guardando…"; message("form-error","");
    try {
      const result=await api("/api/rsvp",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({fullName:fields.get("fullName"),email:fields.get("email"),cui,attendance:"yes",consent:fields.get("consent")==="on"})});
      if(result.guestPass) savePass(result.guestPass);
      form.reset(); editing=false; await refreshMe();
      message("registration-notice","Tu confirmación está guardada. Pulsa «Guardar mi acceso privado» para copiar tu enlace y conservarlo.");
      if(me?.guest) { $("confirmed-title").focus({preventScroll:true}); $("confirmed-state").scrollIntoView({block:"nearest",behavior:matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth"}); celebrateConfirmation(); }
    } catch(error) { message("form-error",error.message); }
    finally { busy=false; $("submit-rsvp").disabled=false; $("submit-rsvp").innerHTML='Confirmar mi asistencia <span aria-hidden="true">↗</span>'; }
  });
  $("edit-rsvp").addEventListener("click",()=>{
    editing=true; renderRegistration(); $("fullName").value=me.guest.fullName; $("email").value=me.guest.email; $("cui").value=""; message("registration-notice",""); $("fullName").focus();
  });
  $("cancel-edit").addEventListener("click",()=>{editing=false;message("form-error","");renderRegistration();});
  $("decline-rsvp").addEventListener("click",async()=>{
    if(busy) return; busy=true;
    try { await api("/api/rsvp/attendance",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({attendance:"no"})}); await refreshMe(); toast("Tu respuesta se actualizó. Gracias por avisar."); }
    catch(error) {toast(error.message);} finally {busy=false;}
  });
  $("save-access").addEventListener("click",async()=>{
    const url=publicUrl()+"#acceso="+pass;
    try {await navigator.clipboard.writeText(url);toast("Acceso privado copiado. Guárdalo y no lo compartas.");}
    catch {message("registration-notice","Guarda tu acceso privado: "+url);}
  });
  $("calendar-button").addEventListener("click",()=>{
    const text=["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//Alexander Mejia//Graduacion//ES","BEGIN:VEVENT","UID:alexander-graduacion-20261028","DTSTAMP:"+new Date().toISOString().replace(/[-:]/g,"").replace(".000",""),"DTSTART:20261028T160000Z","SUMMARY:Graduación Ing. Alexander Mejía","LOCATION:Auditorio Francisco Vela - Campus Central zona 12 - cerca del edificio T3","DESCRIPTION:Lleva identificación de estudiante o DPI y confirma tu asistencia en la invitación.","END:VEVENT","END:VCALENDAR"].join("\r\n");
    const url=URL.createObjectURL(new Blob([text],{type:"text/calendar;charset=utf-8"})); const a=document.createElement("a");a.href=url;a.download="graduacion-alexander.ics";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  const venueButtons=Array.from(document.querySelectorAll("[data-venue]"));
  const venuePhotos=venueButtons.map(button=>({kind:"photo",url:new URL(button.dataset.src,location.href).href,caption:button.dataset.caption,alt:button.querySelector("img").alt}));
  venueButtons.forEach((button,index)=>button.addEventListener("click",()=>openViewer("venue",venuePhotos,index,button)));
  const venueGallery=$("venue-gallery");
  function venueIndex() {
    const left=venueGallery.getBoundingClientRect().left;
    return venueButtons.reduce((closest,button,index)=>Math.abs(button.getBoundingClientRect().left-left)<Math.abs(venueButtons[closest].getBoundingClientRect().left-left) ? index : closest,0);
  }
  function updateVenuePosition() {
    const index=venueIndex();$("venue-position").textContent=(index+1)+" / "+venueButtons.length;
    $("venue-prev").disabled=index===0;$("venue-next").disabled=index===venueButtons.length-1;
  }
  function scrollVenue(direction) {
    const index=Math.max(0,Math.min(venueButtons.length-1,venueIndex()+direction));
    venueGallery.scrollTo({left:venueGallery.scrollLeft+venueButtons[index].getBoundingClientRect().left-venueGallery.getBoundingClientRect().left,behavior:matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth"});
  }
  $("venue-prev").addEventListener("click",()=>scrollVenue(-1));$("venue-next").addEventListener("click",()=>scrollVenue(1));
  let venueFrame=0;
  venueGallery.addEventListener("scroll",()=>{cancelAnimationFrame(venueFrame);venueFrame=requestAnimationFrame(updateVenuePosition);},{passive:true});
  updateVenuePosition();
  function renderMedia() {
    const grid=$("media-grid");grid.replaceChildren();
    const visible=media.filter(item=>filter==="all" || item.kind===filter);
    for(const [index,item] of visible.entries()) {
      const button=document.createElement("button");button.type="button";button.className="media-item";button.setAttribute("aria-label",(item.kind==="video" ? "Reproducir video " : "Ver foto ")+(index+1));
      button.style.setProperty("--ratio",item.kind==="video" ? "1.2" : [".8","1.15",".75","1"][index%4]);
      if(item.kind==="video") {
        const tile=document.createElement("span");tile.className="video-tile";
        const play=document.createElement("span");play.textContent="▷";const label=document.createElement("small");label.textContent="VIDEO";tile.append(play,label);button.append(tile);
      } else {
        const image=document.createElement("img");image.alt="Foto "+(index+1)+" de la graduación";image.loading="lazy";image.decoding="async";
        image.addEventListener("load",()=>button.style.setProperty("--ratio",String(image.naturalWidth/image.naturalHeight)),{once:true});
        image.src=new URL(item.url,apiBase).href;button.append(image);
      }
      const caption=document.createElement("span");caption.className="media-caption";caption.setAttribute("aria-hidden","true");
      const title=document.createElement("span");title.textContent=(item.kind==="video" ? "VIDEO " : "FOTO ")+String(index+1).padStart(2,"0");
      const date=document.createElement("small");date.textContent=new Date(item.createdAt).toLocaleDateString("es-GT",{timeZone:"America/Guatemala",day:"numeric",month:"short"});title.append(date);
      const arrow=document.createElement("span");arrow.textContent=item.kind==="video" ? "▷" : "↗";caption.append(title,arrow);button.append(caption);
      button.addEventListener("click",()=>openViewer("album",visible,index,button));grid.append(button);
    }
    $("empty-album").hidden=visible.length>0;
    $("empty-album").querySelector("h3").textContent=media.length ? "Todavía no hay recuerdos de este tipo aquí." : "Esta historia la escribimos entre todos.";
    $("empty-album").querySelector("p").textContent=media.length ? "Prueba con otro filtro o carga más recuerdos." : "Comparte la primera foto o el primer video de nuestro gran día.";
    const count=visible.length ? visible.length+(visible.length===1 ? " recuerdo cargado" : " recuerdos cargados") : "Aún no hay recuerdos";
    if($("media-count").textContent!==count) $("media-count").textContent=count;
    $("more-media").hidden=!cursor;
  }
  async function loadMedia(next) {
    if(me?.guest?.attendance!=="yes" || !me.albumOpen) return;
    $("refresh-album").disabled=true;
    try {
      const result=await api("/api/photos"+(next ? "?cursor="+encodeURIComponent(next) : ""));
      media=Array.from(new Map([...media,...result.photos].map(item=>[item.id,item])).values()).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||b.id.localeCompare(a.id));
      if(next || !paged) cursor=result.nextCursor; if(next) paged=true;
      renderMedia();
    } catch(error) {message("album-error",error.message);}
    finally {$("refresh-album").disabled=false;}
  }
  const albumFilters={"#album":"all","#fotos":"photo","#videos":"video"};
  function selectFilter(value) {
    filter=value;
    document.querySelectorAll("[data-filter]").forEach(item=>{const active=item.dataset.filter===filter;item.classList.toggle("active",active);item.setAttribute("aria-pressed",String(active));});
    renderMedia();
  }
  function openAlbumLink() {
    const value=albumFilters[location.hash];
    if(!value) return;
    selectFilter(value);
    if(location.hash!=="#album") requestAnimationFrame(()=>$("album").scrollIntoView({block:"start",behavior:"instant"}));
  }
  document.querySelectorAll("[data-filter]").forEach(button=>button.addEventListener("click",()=>{
    selectFilter(button.dataset.filter);
    const hash=Object.keys(albumFilters).find(key=>albumFilters[key]===filter);
    history.replaceState(null,"",location.pathname+location.search+hash);
  }));
  window.addEventListener("hashchange",openAlbumLink);
  // Repeated taps on the same shortcut also return to the selected collection.
  document.querySelectorAll('.album-quick-links a').forEach(link=>link.addEventListener("click",event=>{
    if(location.hash===link.hash) {event.preventDefault();openAlbumLink();}
  }));
  openAlbumLink();
  $("refresh-album").addEventListener("click",()=>{message("album-error","");void loadMedia();});
  $("more-media").addEventListener("click",()=>void loadMedia(cursor));
  let viewerItems=[],viewerIndex=0,viewerKind="venue",viewerRequest=0,viewerOpener=null;
  function openViewer(kind,items,index,opener) {
    viewerKind=kind;viewerItems=items.slice();viewerIndex=index;
    if(!$("viewer").open) {viewerOpener=opener || document.activeElement;$("viewer").showModal();document.documentElement.classList.add("viewer-open");}
    void renderViewer();
  }
  async function renderViewer() {
    const request=++viewerRequest,item=viewerItems[viewerIndex],box=$("viewer-content");
    box.querySelector("video")?.pause();box.replaceChildren();box.setAttribute("aria-busy","true");
    const loading=document.createElement("p");loading.className="viewer-loading";loading.setAttribute("role","status");loading.textContent=item.kind==="video" ? "Preparando video…" : "Abriendo foto…";box.append(loading);
    $("viewer-category").textContent=viewerKind==="venue" ? "EL LUGAR DE NUESTRA CELEBRACIÓN" : "GRADUACIÓN · ALEXANDER MEJÍA";
    $("viewer-caption").textContent=item.caption || (item.kind==="video" ? "Un pedacito de nuestro gran día." : "Un recuerdo para siempre.");
    $("viewer-position").textContent=(viewerIndex+1)+" de "+viewerItems.length;
    $("viewer-prev").disabled=viewerIndex===0;$("viewer-next").disabled=viewerIndex===viewerItems.length-1;
    const current=()=>request===viewerRequest && $("viewer").open;
    function fail(text) {
      if(!current()) return;box.setAttribute("aria-busy","false");
      const error=document.createElement("div");error.className="viewer-error";error.setAttribute("role","alert");
      const message=document.createElement("p");message.textContent=text;
      const retry=document.createElement("button");retry.type="button";retry.className="button light";retry.textContent="Intentar de nuevo ↻";retry.addEventListener("click",()=>void renderViewer());error.append(message,retry);box.replaceChildren(error);
    }
    try {
      const url=viewerKind==="venue" ? item.url : new URL((await api("/api/photos/"+item.id+"/access")).url,apiBase).href;
      if(!current()) return;
      const element=document.createElement(item.kind==="video" ? "video" : "img");
      if(item.kind==="video") {element.controls=true;element.playsInline=true;element.preload="metadata";element.setAttribute("controlsList","nodownload");element.setAttribute("aria-label","Video de la graduación");}
      else {element.alt=item.alt || "Recuerdo de la graduación, ampliado";element.draggable=false;}
      const ready=()=>{if(current()){loading.remove();box.setAttribute("aria-busy","false");}};
      element.addEventListener(item.kind==="video" ? "loadedmetadata" : "load",ready,{once:true});
      element.addEventListener("error",()=>fail(item.kind==="video" ? "No se pudo reproducir este video. Intenta con otro navegador o una versión MP4 con H.264." : "No pudimos abrir la foto. Revisa tu conexión e intenta de nuevo."),{once:true});
      box.replaceChildren(element,loading);element.src=url;
    } catch(error) {fail(error.message || "No pudimos abrir este recuerdo.");}
  }
  function stepViewer(direction) {const next=viewerIndex+direction;if(next<0 || next>=viewerItems.length) return;viewerIndex=next;void renderViewer();}
  $("viewer-prev").addEventListener("click",()=>stepViewer(-1));$("viewer-next").addEventListener("click",()=>stepViewer(1));
  $("close-viewer").addEventListener("click",()=>$("viewer").close());
  $("viewer").addEventListener("close",()=>{if($("viewer").open) return;viewerRequest++;$("viewer-content").querySelector("video")?.pause();$("viewer-content").replaceChildren();document.documentElement.classList.remove("viewer-open");if(viewerOpener?.isConnected) viewerOpener.focus({preventScroll:true});});
  $("viewer").addEventListener("click",event=>{if(event.target!==$("viewer")) return;const r=$("viewer").getBoundingClientRect();if(event.clientX<r.left || event.clientX>r.right || event.clientY<r.top || event.clientY>r.bottom) $("viewer").close();});
  $("viewer").addEventListener("keydown",event=>{if(event.target.tagName==="VIDEO" || event.ctrlKey || event.metaKey || event.altKey) return;if(event.key==="ArrowLeft" || event.key==="ArrowRight") {event.preventDefault();stepViewer(event.key==="ArrowLeft" ? -1 : 1);}});
  let touchStart=null;
  $("viewer-content").addEventListener("touchstart",event=>{touchStart=event.touches.length===1 && event.target.tagName!=="VIDEO" ? {x:event.touches[0].clientX,y:event.touches[0].clientY} : null;},{passive:true});
  $("viewer-content").addEventListener("touchend",event=>{if(!touchStart || event.touches.length) {touchStart=null;return;}const touch=event.changedTouches[0],dx=touch.clientX-touchStart.x,dy=touch.clientY-touchStart.y;if(Math.abs(dx)>70 && Math.abs(dy)<70) stepViewer(dx<0 ? 1 : -1);touchStart=null;},{passive:true});
  async function preparePhoto(file) {
    if(file.size>20*1024*1024) throw new Error(file.name+": la foto original debe pesar menos de 20 MB.");
    const image=await createImageBitmap(file).catch(()=>{throw new Error(file.name+": selecciona JPG, PNG o WebP. Convierte las fotos HEIC a JPG.");});
    try {const scale=Math.min(1,2200/Math.max(image.width,image.height));const canvas=document.createElement("canvas");canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));const context=canvas.getContext("2d");if(!context) throw new Error("No pudimos preparar la foto.");context.fillStyle="#fff";context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,0,canvas.width,canvas.height);return await new Promise((resolve,reject)=>canvas.toBlob(blob=>blob ? resolve(blob) : reject(new Error("No pudimos preparar la foto.")),"image/jpeg",0.86));}
    finally {image.close();}
  }
  function sendFile(blob,type,onProgress) {
    return new Promise((resolve,reject)=>{
      const xhr=new XMLHttpRequest();xhr.open("POST",apiBase+"/api/photos");xhr.setRequestHeader("Content-Type",type);xhr.setRequestHeader("X-Upload-Size",String(blob.size));if(pass) xhr.setRequestHeader("X-Guest-Pass",pass);
      xhr.upload.onprogress=event=>{if(event.lengthComputable) onProgress(Math.round(event.loaded/event.total*100));};
      xhr.onload=()=>{if(xhr.status>=200 && xhr.status<300) {resolve();return;}let error="No pudimos guardar el archivo. Intenta de nuevo.";try{error=JSON.parse(xhr.responseText).error || error;}catch{}reject(new Error(error));};
      xhr.onerror=()=>reject(new Error("La conexión se interrumpió. Revisa tu internet e intenta de nuevo."));xhr.onabort=()=>reject(new Error("La subida se canceló."));xhr.send(blob);
    });
  }
  async function upload(files) {
    if(busy || !files?.length) return;
    if(files.length>10) {message("album-error","Selecciona hasta 10 archivos a la vez.");return;}
    if(me?.guest?.attendance!=="yes" || !me.albumOpen) {toast("Confirma tu asistencia o abre tu acceso privado para compartir tus recuerdos.");return;}
    busy=true;message("album-error","");let completed=0;
    const inputs=document.querySelectorAll(".upload-buttons input");inputs.forEach(input=>input.disabled=true);$("upload-progress").hidden=false;
    try {
      for(const file of Array.from(files)) {
        const video=file.type.startsWith("video/") || /\.(mp4|mov|webm)$/i.test(file.name);
        if(video && file.size>50*1024*1024) throw new Error(file.name+": cada video debe pesar como máximo 50 MB. Recórtalo o comprímelo antes de subirlo.");
        message("upload-status","Preparando archivo "+(completed+1)+" de "+files.length+"…");
        const blob=video ? file : await preparePhoto(file);const type=video ? file.type || (file.name.toLowerCase().endsWith(".mov") ? "video/quicktime" : file.name.toLowerCase().endsWith(".webm") ? "video/webm" : "video/mp4") : "image/jpeg";
        await sendFile(blob,type,percent=>{message("upload-status","Compartiendo archivo "+(completed+1)+" de "+files.length+" · "+percent+"%");$("upload-progress").value=percent;});completed++;
      }
      message("upload-status",completed+(completed===1 ? " recuerdo compartido. ¡Gracias!" : " recuerdos compartidos. ¡Gracias!"));
    } catch(error) {message("album-error",(completed ? completed+" archivos guardados. " : "")+error.message);message("upload-status","");}
    finally {busy=false;inputs.forEach(input=>input.disabled=false);$("upload-progress").hidden=true;await loadMedia();}
  }
  for(const id of ["choose-media","capture-photo","capture-video"]) $(id).addEventListener("change",event=>{void upload(event.target.files);event.target.value="";});
  $("dropzone").addEventListener("dragover",event=>{event.preventDefault();$("dropzone").classList.add("dragging");});
  $("dropzone").addEventListener("dragleave",()=>$("dropzone").classList.remove("dragging"));
  $("dropzone").addEventListener("drop",event=>{event.preventDefault();$("dropzone").classList.remove("dragging");void upload(event.dataTransfer.files);});

  // A fixed number of CSS particles keeps the celebration light on mobile.
  const reducedMotion=matchMedia("(prefers-reduced-motion: reduce)");
  const smallScreen=matchMedia("(max-width: 760px)");
  const celebrationEmojis=["🎓","🎓","🎓","⭐","🌟","✨","🎊","🎉"];
  const randomBetween=(min,max)=>min+Math.random()*(max-min);
  function makeRainParticle(initial=false) {
    const mobile=smallScreen.matches;
    const piece=document.createElement("span");piece.className="celebration-particle";
    piece.textContent=celebrationEmojis[Math.floor(Math.random()*celebrationEmojis.length)];
    const duration=randomBetween(9,18),angle=randomBetween(-180,180),spin=randomBetween(-540,540);
    const properties={
      "--left":randomBetween(0,100).toFixed(2)+"%",
      "--size":randomBetween(mobile ? 16 : 19,mobile ? 27 : 34).toFixed(1)+"px",
      "--duration":duration.toFixed(2)+"s",
      "--delay":(initial ? -Math.random()*duration : randomBetween(.15,2.5)).toFixed(2)+"s",
      "--drift":randomBetween(mobile ? -80 : -150,mobile ? 80 : 150).toFixed(1)+"px",
      "--sway":randomBetween(-38,38).toFixed(1)+"px",
      "--start-angle":angle.toFixed(1)+"deg",
      "--mid-angle":(angle+spin*.45).toFixed(1)+"deg",
      "--end-angle":(angle+spin).toFixed(1)+"deg",
      "--peak-opacity":randomBetween(.3,.65).toFixed(2)
    };
    for(const [name,value] of Object.entries(properties)) piece.style.setProperty(name,value);
    return piece;
  }
  function createRain() {
    const layer=$("celebration-rain");layer.replaceChildren();
    if(reducedMotion.matches) return;
    const count=smallScreen.matches ? 36 : 64;
    const particles=document.createDocumentFragment();
    for(let i=0;i<count;i++) particles.append(makeRainParticle(true));
    layer.append(particles);
  }
  // Re-roll each emoji after it leaves the screen; keep the particle count fixed.
  $("celebration-rain").addEventListener("animationend",event=>{
    const piece=event.target;
    if(event.animationName!=="celebration-fall" || piece.parentNode!==$("celebration-rain") || reducedMotion.matches) return;
    piece.replaceWith(makeRainParticle());
  });
  function updateEffects() {
    document.documentElement.classList.toggle("effects-paused",reducedMotion.matches || document.hidden);
  }
  reducedMotion.addEventListener("change",()=>{createRain();updateEffects();});
  smallScreen.addEventListener("change",createRain);
  document.addEventListener("visibilitychange",updateEffects);
  createRain();updateEffects();
  // Music starts when the browser permits it, or on the first visitor gesture.
  // Muting persists locally; opening a video pauses the song to avoid two tracks.
  const music=$("background-music"),musicButton=$("music-toggle");
  let musicWanted=true,musicStarting=false;
  try {musicWanted=localStorage.getItem("graduacion-music")!=="off";} catch {}
  music.volume=.28;
  function updateMusicButton() {
    const playing=!music.paused && !music.muted;
    musicButton.setAttribute("aria-pressed",String(playing));
    musicButton.setAttribute("aria-label",playing ? "Silenciar música" : "Activar música");
    $("music-label").textContent=playing ? "Silenciar música" : "Activar música";
  }
  async function startMusic() {
    if(!musicWanted || musicStarting || document.hidden || $("viewer").open || !music.paused) return;
    musicStarting=true;
    try {await music.play();if(!musicWanted || document.hidden || $("viewer").open) music.pause();}
    catch {} // Autoplay restrictions leave the visible music button available.
    finally {musicStarting=false;updateMusicButton();}
  }
  musicButton.addEventListener("click",()=>{
    if(!music.paused || musicStarting) {musicWanted=false;music.pause();}
    else {musicWanted=true;void startMusic();}
    try {localStorage.setItem("graduacion-music",musicWanted ? "on" : "off");} catch {}
    updateMusicButton();
  });
  const firstGesture=event=>{
    if(event.target.closest?.("#music-toggle") || event.target.closest?.("input,textarea")) return;
    void startMusic();
  };
  document.addEventListener("pointerdown",firstGesture,{passive:true});
  document.addEventListener("keydown",firstGesture);
  music.addEventListener("play",updateMusicButton);
  music.addEventListener("pause",updateMusicButton);
  $("viewer").addEventListener("play",()=>music.pause(),true);
  $("viewer").addEventListener("close",()=>void startMusic());
  document.addEventListener("visibilitychange",()=>{if(document.hidden) music.pause();else void startMusic();});
  updateMusicButton();void startMusic();

  // Brief, bounded bursts reward taps without covering controls or form fields.
  document.addEventListener("click",event=>{
    if(reducedMotion.matches || document.hidden || $("viewer").open || !event.target.closest?.(".button,.album-quick-links a") || document.querySelectorAll(".celebration-burst").length>=24) return;
    const rect=event.target.closest(".button,.album-quick-links a").getBoundingClientRect();
    const x=event.detail ? event.clientX : rect.left+rect.width/2,y=event.detail ? event.clientY : rect.top+rect.height/2;
    const pieces=document.createDocumentFragment();
    for(let i=0;i<12;i++) {
      const piece=document.createElement("span");piece.className="celebration-burst";piece.setAttribute("aria-hidden","true");
      piece.textContent=celebrationEmojis[Math.floor(Math.random()*celebrationEmojis.length)];
      const values={"--burst-x":x+"px","--burst-y":y+"px","--burst-size":randomBetween(15,25)+"px","--burst-dx":randomBetween(-115,115)+"px","--burst-dy":randomBetween(-160,40)+"px","--burst-spin":randomBetween(-180,180)+"deg"};
      for(const [name,value] of Object.entries(values)) piece.style.setProperty(name,value);
      piece.addEventListener("animationend",()=>piece.remove(),{once:true});pieces.append(piece);
    }
    document.body.append(pieces);
  });
  const heroPhoto=document.querySelector(".hero-photo");
  if(matchMedia("(hover: hover) and (pointer: fine)").matches) {
    heroPhoto.addEventListener("pointermove",event=>{
      if(reducedMotion.matches) return;
      const r=heroPhoto.getBoundingClientRect();
      heroPhoto.style.setProperty("--tilt-x",((.5-(event.clientY-r.top)/r.height)*5)+"deg");
      heroPhoto.style.setProperty("--tilt-y",(((event.clientX-r.left)/r.width-.5)*5)+"deg");
    });
    heroPhoto.addEventListener("pointerleave",()=>{heroPhoto.style.removeProperty("--tilt-x");heroPhoto.style.removeProperty("--tilt-y");});
  }
  let progressFrame=0;
  function readingProgress() {
    progressFrame=0;const total=document.documentElement.scrollHeight-innerHeight;
    document.documentElement.style.setProperty("--reading-progress",String(total>0 ? Math.max(0,Math.min(1,scrollY/total)) : 0));
  }
  window.addEventListener("scroll",()=>{if(!progressFrame) progressFrame=requestAnimationFrame(readingProgress);},{passive:true});
  readingProgress();
  if("IntersectionObserver" in window) {
    const links=Array.from(document.querySelectorAll(".nav nav>a"));
    const sections=new IntersectionObserver(entries=>{
      for(const entry of entries) if(entry.isIntersecting) for(const link of links) {
        if(link.hash==="#"+entry.target.id) link.setAttribute("aria-current","location");else link.removeAttribute("aria-current");
      }
    },{rootMargin:"-10% 0px -65% 0px"});
    for(const id of ["evento","registro","album"]) sections.observe($(id));
  }
  function celebrateConfirmation() {
    if(reducedMotion.matches || !$("confirmed-state").animate) return;
    $("confirmed-state").animate([{opacity:.4,transform:"translateY(8px)"},{opacity:1,transform:"translateY(0)"}],{duration:400,easing:"ease-out"});
  }
  function updateCountdown() {
    const remaining=Math.max(0,new Date(config.eventStartsAt || "2026-10-28T10:00:00-06:00").getTime()-Date.now());
    const total=Math.floor(remaining/1000);
    const values={days:Math.floor(total/86400),hours:Math.floor(total/3600)%24,minutes:Math.floor(total/60)%60,seconds:total%60};
    for(const [unit,value] of Object.entries(values)) $("countdown-"+unit).textContent=String(value).padStart(2,"0");
    if(!remaining) {
      const eventDay=Date.now()<new Date("2026-10-29T00:00:00-06:00").getTime();
      $("countdown-caption").textContent=eventDay ? "¡HOY CELEBRAMOS! 🎓" : "¡GRACIAS POR COMPARTIR ESTE LOGRO!";
      $("countdown").hidden=true;
    }
  }
  updateCountdown();setInterval(()=>{if(!document.hidden) updateCountdown();},1000);
  if("IntersectionObserver" in window && !reducedMotion.matches) {
    const reveal=new IntersectionObserver(entries=>{
      for(const entry of entries) if(entry.isIntersecting) {entry.target.classList.add("is-visible");reveal.unobserve(entry.target);}
    },{threshold:.12});
    document.querySelectorAll(".event-story,.venue-heading,.album-heading,.closing h2,.form-card,.entry-note").forEach(element=>{element.classList.add("reveal-ready");reveal.observe(element);});
  }
  // Keep the fixed action away from the phone keyboard and active form fields.
  document.addEventListener("focusin",event=>{if(event.target.matches("input:not([type=checkbox]),textarea")) document.documentElement.classList.add("input-focused");});
  document.addEventListener("focusout",()=>{requestAnimationFrame(()=>{if(!document.activeElement?.matches("input:not([type=checkbox]),textarea")) document.documentElement.classList.remove("input-focused");});});
  void refreshMe();
  setInterval(()=>{if(document.visibilityState==="visible") {void refreshMe();if(me?.albumOpen) void loadMedia();}},30000);
})();
