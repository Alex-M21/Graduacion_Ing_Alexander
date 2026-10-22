// Admin UI uses local browser fixtures. No real registration is deleted.
import {spawn} from 'node:child_process';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const base=process.env.QA_BASE_URL || 'http://127.0.0.1:8787';
assert.ok(['127.0.0.1','localhost'].includes(new URL(base).hostname));
await mkdir('.sites-runtime/admin',{recursive:true});
const profile=await mkdtemp(path.resolve('.sites-runtime/admin/chrome-'));
const chrome=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--disable-component-update','--disk-cache-size=1048576','--no-first-run','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:['ignore','ignore','pipe']});
let socket;
try {
  const endpoint=await new Promise((resolve,reject)=>{let out='';chrome.stderr.on('data',b=>{out+=b;const m=out.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(m)resolve(m[1]);});chrome.on('error',reject);});
  const pages=await(await fetch('http://'+new URL(endpoint).host+'/json/list')).json();
  socket=new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl);await new Promise(r=>socket.onopen=r);
  let id=0,dialogResolve;const pending=new Map(),exceptions=[];
  socket.onmessage=({data})=>{const m=JSON.parse(data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(new Error(m.error.message)):p.resolve(m.result);}if(m.method==='Runtime.exceptionThrown')exceptions.push(m.params.exceptionDetails.text);if(m.method==='Page.javascriptDialogOpening')dialogResolve?.(m.params);};
  const send=(method,params={})=>new Promise((resolve,reject)=>{const i=++id;pending.set(i,{resolve,reject});socket.send(JSON.stringify({id:i,method,params}));});
  const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.text);return r.result.value;};
  const pause=ms=>new Promise(r=>setTimeout(r,ms));
  async function waitFor(expression){for(let i=0;i<160;i++){if(await evaluate(expression))return;await pause(100);}throw new Error('Timeout: '+expression);}
  await send('Page.enable');await send('Runtime.enable');
  await send('Page.addScriptToEvaluateOnNewDocument',{source:`(() => {
    const original=window.fetch.bind(window);window.__qaCalls=[];window.__qaFailDelete=true;
    window.__qaMediaCalls=[];window.__qaFailMediaDelete=true;window.__qaViewingEnabled=true;
    window.__qaMedia=[{id:'11111111-1111-4111-8111-111111111111',kind:'photo',url:'/venue/jardin-campus.jpeg',contentType:'image/jpeg',bytes:512000,createdAt:'2026-10-22T16:00:00Z',hiddenAt:null,uploaderName:'Bob Prueba'},{id:'22222222-2222-4222-8222-222222222222',kind:'video',url:'',contentType:'video/mp4',bytes:2621440,createdAt:'2026-10-22T16:00:00Z',hiddenAt:null,uploaderName:null}];
    window.__qaGuests=[{id:'guest_alice',fullName:'Alice Prueba',email:'alice@example.test',cui:'1234567890123',attendance:'yes'},{id:'guest_bob',fullName:'Bob Prueba',email:'bob@example.test',cui:'1234567890124',attendance:'yes'}];
    window.fetch=async(input,options={})=>{
      const u=new URL(input instanceof Request ? input.url : String(input),location.origin);
      if(u.pathname==='/api/admin/guests') return Response.json({guests:window.__qaGuests});
      if(u.pathname==='/api/admin/drive') return Response.json({connected:false,pendingGuests:0,pendingMedia:0});
      if(u.pathname==='/api/admin/media') {
        const kind=u.searchParams.get('kind'),visibility=u.searchParams.get('visibility');
        return Response.json({media:window.__qaMedia.filter(m=>(!kind||kind==='all'||m.kind===kind)&&(!visibility||visibility==='all'||(visibility==='hidden')===!!m.hiddenAt)),stats:{files:window.__qaMedia.length,bytes:window.__qaMedia.reduce((n,m)=>n+m.bytes,0),hidden:window.__qaMedia.filter(m=>m.hiddenAt).length},viewingEnabled:window.__qaViewingEnabled,nextCursor:null});
      }
      if(u.pathname==='/api/admin/media/settings') {window.__qaViewingEnabled=JSON.parse(options.body).viewingEnabled;return Response.json({ok:true});}
      if(u.pathname.startsWith('/api/admin/media/')) {
        window.__qaMediaCalls.push({path:u.pathname,method:options.method,credentials:options.credentials});
        const id=u.pathname.split('/')[4],item=window.__qaMedia.find(m=>m.id===id);
        if(options.method==='POST')item.hiddenAt=JSON.parse(options.body).hidden ? '2026-10-22T16:00:00Z' : null;
        if(options.method==='DELETE') {
          if(window.__qaFailMediaDelete){item.hiddenAt='2026-10-22T16:00:00Z';return Response.json({error:'El archivo quedó oculto. Reintenta eliminarlo.'},{status:503});}
          window.__qaMedia=window.__qaMedia.filter(m=>m.id!==id);
        }
        return Response.json({ok:true});
      }
      if(u.pathname.startsWith('/api/admin/guests/') && options.method==='DELETE') {
        window.__qaCalls.push({path:u.pathname,credentials:options.credentials});
        if(window.__qaFailDelete)return Response.json({error:'Error de prueba: intenta de nuevo.'},{status:503});
        const id=u.pathname.split('/').pop();window.__qaGuests=window.__qaGuests.filter(g=>g.id!==id);return Response.json({ok:true});
      }
      return original(input,options);
    };
  })();`});
  await send('Page.navigate',{url:base+'/admin'});
  await waitFor('document.querySelectorAll("tbody .admin-delete").length===2 && !document.querySelector("tbody .admin-delete").disabled');
  for(const width of [320,390,1440]) {
    await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<=760});
    assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true,'admin fits '+width);
  }
  async function confirmDelete(accept) {
    const dialog=new Promise(resolve=>dialogResolve=resolve);
    const click=evaluate('document.querySelector(".admin-delete").click()');
    const info=await dialog;assert.ok(info.message.includes('Alice Prueba'));
    await send('Page.handleJavaScriptDialog',{accept});await click;
  }
  await confirmDelete(false);assert.equal(await evaluate('window.__qaCalls.length'),0);
  await confirmDelete(true);await waitFor('document.querySelector(".error")?.textContent.includes("Error de prueba")');
  assert.equal(await evaluate('document.querySelectorAll("tbody tr").length'),2,'failure retains rows');
  await evaluate('window.__qaFailDelete=false');await confirmDelete(true);
  await waitFor('document.querySelectorAll("tbody tr").length===1');
  assert.equal(await evaluate('document.querySelector("tbody tr").textContent.includes("Bob Prueba")'),true);
  assert.equal(await evaluate('document.querySelector(".summary").textContent.startsWith("1 asistencias")'),true);
  assert.equal(await evaluate('document.querySelector(".admin-notice").textContent.includes("Alice Prueba")'),true);
  assert.equal(await evaluate('window.__qaCalls.at(-1).credentials'),'same-origin');
  await waitFor('document.querySelectorAll(".moderation-card").length===2');
  for(const width of [320,390,1440]) {
    await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<=760});
    assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true,'moderation fits '+width);
  }
  await evaluate('document.querySelector(".moderation-switch").click()');await waitFor('document.querySelector(".moderation-switch").getAttribute("aria-checked")==="false" && !document.querySelector(".moderation-switch").disabled');
  assert.equal(await evaluate('document.querySelectorAll(".moderation-card").length'),2,'organizer still sees album while viewing is paused');
  await evaluate('document.querySelector(".moderation-switch").click()');await waitFor('document.querySelector(".moderation-switch").getAttribute("aria-checked")==="true" && !document.querySelector(".moderation-switch").disabled');
  await evaluate('document.querySelector(".moderation-visibility").click()');await waitFor('document.querySelector(".media-visibility").classList.contains("is-hidden")');
  await evaluate('document.querySelectorAll(".moderation-toolbar select")[1].value="hidden";document.querySelectorAll(".moderation-toolbar select")[1].dispatchEvent(new Event("change",{bubbles:true}))');
  await waitFor('document.querySelectorAll(".moderation-card").length===1');
  await evaluate('document.querySelector(".moderation-visibility").click()');await waitFor('document.querySelectorAll(".moderation-card").length===0');
  await evaluate('document.querySelectorAll(".moderation-toolbar select")[1].value="all";document.querySelectorAll(".moderation-toolbar select")[1].dispatchEvent(new Event("change",{bubbles:true}))');
  await waitFor('document.querySelectorAll(".moderation-card").length===2');
  async function confirmMediaDelete(accept) {
    const dialog=new Promise(resolve=>dialogResolve=resolve);const click=evaluate('document.querySelector(".moderation-card .admin-delete").click()');
    const info=await dialog;assert.ok(info.message.includes('definitivamente'));await send('Page.handleJavaScriptDialog',{accept});await click;
  }
  const callsBefore=await evaluate('window.__qaMediaCalls.length');await confirmMediaDelete(false);assert.equal(await evaluate('window.__qaMediaCalls.length'),callsBefore);
  await confirmMediaDelete(true);await waitFor('document.querySelector(".moderation .error")?.textContent.includes("quedó oculto") && !document.querySelector(".moderation-card .admin-delete").disabled');
  assert.equal(await evaluate('document.querySelectorAll(".moderation-card").length'),2);
  assert.equal(await evaluate('document.querySelector(".media-visibility").classList.contains("is-hidden")'),true);
  await evaluate('window.__qaFailMediaDelete=false');await confirmMediaDelete(true);await waitFor('document.querySelectorAll(".moderation-card").length===1');
  assert.equal(await evaluate('document.querySelector(".moderation-stats strong").textContent'),'1');
  assert.equal(await evaluate('document.querySelectorAll("tbody tr").length'),1,'deleting a file keeps guest registration');
  assert.equal(await evaluate('document.querySelector(".moderation video").controls'),true);
  await evaluate('document.querySelector(".moderation").scrollIntoView({behavior:"instant"})');
  const shot=await send('Page.captureScreenshot',{format:'png'});await writeFile('.sites-runtime/admin/admin-after-delete.png',Buffer.from(shot.data,'base64'));
  assert.deepEqual(exceptions,[]);
  console.log('Admin QA passed: guest deletion, responsive moderation, global viewing switch, hide/restore, filters, canceled deletion, failed delete hidden state, retry and storage totals. All data and mutations were mocked locally.');
} finally {socket?.close();chrome.kill();}
