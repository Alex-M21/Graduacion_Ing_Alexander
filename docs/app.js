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
      $("album-entry").textContent=me.albumOpen ? "Ver fotos y videos del evento ↗" : "Ver cómo entrar al álbum el 28 de octubre ↗";
      $("save-access").hidden=!pass; document.querySelector(".access-help").hidden=!pass;
      $("decline-rsvp").hidden=!attending;
    }
    const canEnter=me?.guest?.attendance==="yes" && me.albumOpen;
    $("album-content").hidden=!canEnter; $("album-locked").hidden=canEnter;
    $("album-register-link").hidden=me?.guest?.attendance==="yes";
    $("album-locked-message").textContent=me?.guest?.attendance==="yes" ? "¡Ya confirmaste! Guarda tu acceso privado y vuelve el 28 de octubre. Aquí podrás subir fotos y videos y ver los de los demás." : "Regístrate arriba. El 28 de octubre podrás entrar con tu acceso privado para subir y ver fotos y videos.";
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
  $("share-invitation").addEventListener("click",async()=>{
    const url=publicUrl();
    try { if(navigator.share) await navigator.share({title:"Graduación Ing. Alexander Mejía",text:"Acompáñame a celebrar. Confirma tu asistencia aquí:",url}); else {await navigator.clipboard.writeText(url);toast("Enlace de la invitación copiado.");} }
    catch(error) {if(error.name!=="AbortError") toast("Comparte este enlace: "+url);}
  });
  // Share the public invitation only; a guest's private access stays on this device.
  $("share-whatsapp").href="https://wa.me/?text="+encodeURIComponent("🎓 Te invito a la graduación del Ing. Alexander Mejía.\n📅 28 de octubre de 2026 · 10:00 a. m.\n📍 Auditorio Francisco Vela, Campus Central, zona 12.\nConfirma tu asistencia aquí: "+publicUrl());
  $("calendar-button").addEventListener("click",()=>{
    const text=["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//Alexander Mejia//Graduacion//ES","BEGIN:VEVENT","UID:alexander-graduacion-20261028","DTSTAMP:"+new Date().toISOString().replace(/[-:]/g,"").replace(".000",""),"DTSTART:20261028T160000Z","SUMMARY:Graduación Ing. Alexander Mejía","LOCATION:Auditorio Francisco Vela - Campus Central zona 12 - cerca del edificio T3","DESCRIPTION:Lleva identificación de estudiante o DPI y confirma tu asistencia en la invitación.","END:VEVENT","END:VCALENDAR"].join("\r\n");
    const url=URL.createObjectURL(new Blob([text],{type:"text/calendar;charset=utf-8"})); const a=document.createElement("a");a.href=url;a.download="graduacion-alexander.ics";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  $("admin-link").href=apiBase+"/admin";
  function renderMedia() {
    const grid=$("media-grid");grid.replaceChildren();
    const visible=media.filter(item=>filter==="all" || item.kind===filter);
    for(const [index,item] of visible.entries()) {
      const button=document.createElement("button");button.className="media-item";button.setAttribute("aria-label",(item.kind==="video" ? "Reproducir video " : "Ver foto ")+(index+1));
      if(item.kind==="video") {
        const tile=document.createElement("span");tile.className="video-tile";
        const play=document.createElement("span");play.textContent="▷";const label=document.createElement("small");label.textContent="VIDEO";tile.append(play,label);button.append(tile);
      } else {const image=document.createElement("img");image.src=new URL(item.url,apiBase).href;image.alt="Recuerdo de la graduación";image.loading="lazy";button.append(image);}
      button.addEventListener("click",()=>void openMedia(item));grid.append(button);
    }
    $("empty-album").hidden=visible.length>0;
    $("empty-album").querySelector("h3").textContent=media.length ? "No hay recuerdos de este tipo en esta página." : "El primer recuerdo puede ser tuyo.";
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
  document.querySelectorAll("[data-filter]").forEach(button=>button.addEventListener("click",()=>{
    filter=button.dataset.filter;
    document.querySelectorAll("[data-filter]").forEach(item=>{const active=item===button;item.classList.toggle("active",active);item.setAttribute("aria-pressed",String(active));});
    renderMedia();
  }));
  $("refresh-album").addEventListener("click",()=>{message("album-error","");void loadMedia();});
  $("more-media").addEventListener("click",()=>void loadMedia(cursor));
  async function openMedia(item) {
    try {
      const result=await api("/api/photos/"+item.id+"/access");const box=$("viewer-content");box.replaceChildren();
      const element=document.createElement(item.kind==="video" ? "video" : "img");element.src=new URL(result.url,apiBase).href;
      if(item.kind==="video") {element.controls=true;element.playsInline=true;element.preload="metadata";element.setAttribute("controlsList","nodownload");element.setAttribute("aria-label","Video de la graduación");}
      else element.alt="Recuerdo de la graduación, ampliado";
      element.addEventListener("error",()=>{const error=document.createElement("p");error.className="error";error.textContent=item.kind==="video" ? "No se pudo reproducir este video. Intenta en otro navegador o solicita una versión MP4 con H.264." : "No pudimos abrir la foto. Actualiza el álbum e intenta de nuevo.";box.append(error);},{once:true});
      box.append(element);$("viewer").showModal();
    } catch(error) {message("album-error",error.message);}
  }
  $("close-viewer").addEventListener("click",()=>$("viewer").close());
  $("viewer").addEventListener("close",()=>$("viewer-content").replaceChildren());
  $("viewer").addEventListener("click",event=>{if(event.target===$("viewer")) $("viewer").close();});
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
    if(me?.guest?.attendance!=="yes" || !me.albumOpen) {toast("El álbum se abre el día del evento para invitados confirmados.");return;}
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
  let effectsEnabled=true;
  try {effectsEnabled=sessionStorage.getItem("graduacion-effects")!=="off";} catch {}
  function createRain() {
    const layer=$("celebration-rain");layer.replaceChildren();
    if(reducedMotion.matches) return;
    const count=smallScreen.matches ? 16 : 28;
    const emojis=["🎓","🎊","🎓","🎉","✨","🎓","🎊"];
    const particles=document.createDocumentFragment();
    for(let i=0;i<count;i++) {
      const piece=document.createElement("span");piece.className="celebration-particle";piece.textContent=emojis[i%emojis.length];
      piece.style.setProperty("--left",((i+.3)/count*100).toFixed(2)+"%");
      piece.style.setProperty("--size",(smallScreen.matches ? 17+i%4*2 : 20+i%5*2)+"px");
      piece.style.setProperty("--duration",(11+i%7)+"s");
      piece.style.setProperty("--delay",(-i*1.83)+"s");
      piece.style.setProperty("--drift",(i%2 ? 38 : -38)+"px");
      piece.style.setProperty("--spin",(i%2 ? 240 : -240)+"deg");particles.append(piece);
    }
    layer.append(particles);
  }
  function updateEffects() {
    const active=effectsEnabled && !reducedMotion.matches;
    document.documentElement.classList.toggle("effects-paused",!active || document.hidden);
    const button=$("motion-toggle");button.hidden=false;button.disabled=reducedMotion.matches;
    button.setAttribute("aria-pressed",String(active));
    button.textContent=reducedMotion.matches ? "Efectos reducidos" : active ? "Ⅱ Pausar efectos" : "▷ Activar efectos";
    button.setAttribute("aria-label",reducedMotion.matches ? "Efectos desactivados según tu preferencia de movimiento reducido" : active ? "Pausar confeti y animaciones" : "Activar confeti y animaciones");
  }
  $("motion-toggle").addEventListener("click",()=>{
    effectsEnabled=!effectsEnabled;
    try {sessionStorage.setItem("graduacion-effects",effectsEnabled ? "on" : "off");} catch {}
    updateEffects();
  });
  reducedMotion.addEventListener("change",()=>{createRain();updateEffects();});
  smallScreen.addEventListener("change",createRain);
  document.addEventListener("visibilitychange",updateEffects);
  createRain();updateEffects();
  function celebrateConfirmation() {
    if(!effectsEnabled || reducedMotion.matches || !$("confirmed-state").animate) return;
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
    document.querySelectorAll(".how-it-works li,.event-grid>h2,.album-heading,.closing h2").forEach(element=>{element.classList.add("reveal-ready");reveal.observe(element);});
  }
  // Keep the fixed action away from the phone keyboard and active form fields.
  document.addEventListener("focusin",event=>{if(event.target.matches("input:not([type=checkbox]),textarea")) document.documentElement.classList.add("input-focused");});
  document.addEventListener("focusout",()=>{requestAnimationFrame(()=>{if(!document.activeElement?.matches("input:not([type=checkbox]),textarea")) document.documentElement.classList.remove("input-focused");});});
  void refreshMe();
  setInterval(()=>{if(document.visibilityState==="visible") {void refreshMe();if(me?.albumOpen) void loadMedia();}},30000);
})();
