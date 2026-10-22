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
    window.__qaGuests=[{id:'guest_alice',fullName:'Alice Prueba',email:'alice@example.test',cui:'1234567890123',attendance:'yes'},{id:'guest_bob',fullName:'Bob Prueba',email:'bob@example.test',cui:'1234567890124',attendance:'yes'}];
    window.fetch=async(input,options={})=>{
      const u=new URL(input instanceof Request ? input.url : String(input),location.origin);
      if(u.pathname==='/api/admin/guests') return Response.json({guests:window.__qaGuests});
      if(u.pathname==='/api/admin/drive') return Response.json({connected:false,pendingGuests:0,pendingMedia:0});
      if(u.pathname.startsWith('/api/admin/guests/') && options.method==='DELETE') {
        window.__qaCalls.push({path:u.pathname,credentials:options.credentials});
        if(window.__qaFailDelete)return Response.json({error:'Error de prueba: intenta de nuevo.'},{status:503});
        const id=u.pathname.split('/').pop();window.__qaGuests=window.__qaGuests.filter(g=>g.id!==id);return Response.json({ok:true});
      }
      return original(input,options);
    };
  })();`});
  await send('Page.navigate',{url:base+'/admin'});
  await waitFor('document.querySelectorAll(".admin-delete").length===2 && !document.querySelector(".admin-delete").disabled');
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
  const shot=await send('Page.captureScreenshot',{format:'png'});await writeFile('.sites-runtime/admin/admin-after-delete.png',Buffer.from(shot.data,'base64'));
  assert.deepEqual(exceptions,[]);
  console.log('Admin QA passed: responsive table, cancel, failed request, retry, removal and updated totals. All rows and DELETE requests were mocked locally.');
} finally {socket?.close();chrome.kill();}
