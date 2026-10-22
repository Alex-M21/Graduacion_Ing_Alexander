// Run only against a local development database with a local test encryption key.
// The event-day UI is mocked; server upload/range authorization is tested in api.test.mjs.
import {spawn} from 'node:child_process';
import {mkdir,writeFile,mkdtemp} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const base=process.env.QA_BASE_URL || 'http://127.0.0.1:5173';
assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname),'QA writes test data and must use a local server.');
await mkdir('.sites-runtime',{recursive:true});
const profile=await mkdtemp(path.resolve('.sites-runtime/qa-chrome-'));
const chrome=spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:['ignore','ignore','pipe']});
let socket;
try {
  const endpoint=await new Promise((resolve,reject)=>{let output='';const timer=setTimeout(()=>reject(new Error('Chrome startup timed out')),20000);chrome.stderr.on('data',chunk=>{output+=chunk;const match=output.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(match){clearTimeout(timer);resolve(match[1]);}});chrome.on('error',reject);});
  const pages=await(await fetch('http://'+new URL(endpoint).host+'/json/list')).json();
  socket=new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
  let id=0;const pending=new Map();const exceptions=[];
  socket.onmessage=({data})=>{const m=JSON.parse(data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(new Error(m.error.message)):p.resolve(m.result);}if(m.method==='Runtime.exceptionThrown')exceptions.push(m.params.exceptionDetails.text);};
  const send=(method,params={})=>new Promise((resolve,reject)=>{const requestId=++id;pending.set(requestId,{resolve,reject});socket.send(JSON.stringify({id:requestId,method,params}));});
  const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.text);return r.result.value;};
  async function waitFor(expression){for(let i=0;i<140;i++){if(await evaluate(expression))return;await new Promise(r=>setTimeout(r,150));}throw new Error('Page readiness timed out: '+expression);}
  await send('Page.enable');await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1050,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url:base});
  await waitFor('document.querySelector("#rsvp-form")?.hidden === false');
  assert.equal(await evaluate('document.querySelector(".signin-box") === null'),true);
  assert.equal(await evaluate('document.body.textContent.includes("Auditorio Francisco Vela") && document.body.textContent.includes("identificación de estudiante")'),true);
  await evaluate('document.fonts.ready');
  assert.equal(await evaluate('document.documentElement.scrollWidth <= document.documentElement.clientWidth'),true);
  let shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});await writeFile('.sites-runtime/desktop.png',Buffer.from(shot.data,'base64'));
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await new Promise(r=>setTimeout(r,300));assert.equal(await evaluate('document.documentElement.scrollWidth <= document.documentElement.clientWidth'),true);
  shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});await writeFile('.sites-runtime/mobile.png',Buffer.from(shot.data,'base64'));
  await evaluate(`(() => {
    const values={fullName:"Invitado Prueba Navegador",email:"qa@example.test",cui:"000000"+Date.now().toString().slice(-7)};
    for(const [name,value] of Object.entries(values)){const input=document.getElementById(name);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(input,value);input.dispatchEvent(new Event("input",{bubbles:true}));}
    document.querySelector(".consent input").click();document.querySelector("form").requestSubmit();
  })()`);
  await waitFor('document.querySelector("#confirmed-state")?.hidden === false');
  assert.equal(await evaluate('/^[a-f0-9]{64}$/.test(localStorage.getItem("graduacion-guest-pass"))'),true);
  // Verify private link recovery in a new page load without exposing the receipt.
  await evaluate('window.__qaPass=localStorage.getItem("graduacion-guest-pass");localStorage.removeItem("graduacion-guest-pass");location.href="/#acceso="+window.__qaPass;location.reload()');
  await waitFor('document.querySelector("#confirmed-state")?.hidden === false && /^[a-f0-9]{64}$/.test(localStorage.getItem("graduacion-guest-pass"))');
  assert.equal(await evaluate('fetch("/api/admin/guests").then(r=>r.status)'),403);
  assert.equal(await evaluate('fetch("/api/photos",{method:"DELETE"}).then(r=>r.status)'),405);
  // A real playable WebM generated locally exercises the viewer without moving
  // the production event clock or uploading synthetic media to a hosted album.
  const eventDayScript=`(() => {
    const originalFetch=window.fetch.bind(window);
    const clip=(async()=>{
      const canvas=document.createElement("canvas");canvas.width=320;canvas.height=180;const ctx=canvas.getContext("2d");const stream=canvas.captureStream(8);
      const recorder=new MediaRecorder(stream,{mimeType:"video/webm;codecs=vp8"});const chunks=[];
      const finished=new Promise(resolve=>{recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};recorder.onstop=()=>resolve(new Blob(chunks,{type:"video/webm"}));});
      recorder.start();let frame=0;const timer=setInterval(()=>{ctx.fillStyle=frame++%2 ? "#172e39" : "#a17b41";ctx.fillRect(0,0,320,180);},80);
      setTimeout(()=>{clearInterval(timer);recorder.stop();stream.getTracks().forEach(track=>track.stop());},900);
      return URL.createObjectURL(await finished);
    })();
    window.fetch=async(input,options)=>{
      const pathname=new URL(typeof input==="string" ? input : input.url,location.origin).pathname;
      if(pathname==="/api/me")return Response.json({albumOpen:true,isAdmin:false,guest:{fullName:"Invitado Prueba Navegador",email:"qa@example.test",attendance:"yes"}});
      if(pathname==="/api/photos")return Response.json({photos:[{id:"00000000-0000-4000-8000-000000000001",url:await clip,kind:"video",contentType:"video/webm",createdAt:"2026-10-28T10:00:00-06:00"}],nextCursor:null});
      if(pathname.endsWith("/access"))return Response.json({url:await clip});
      return originalFetch(input,options);
    };
  })()`;
  await send('Page.addScriptToEvaluateOnNewDocument',{source:eventDayScript});
  await send('Page.navigate',{url:base+'/?qa=album#recuerdos'});
  await waitFor('document.querySelector(".video-tile") !== null');
  assert.equal(await evaluate('Array.from(document.querySelectorAll(".upload-buttons input")).some(i=>i.accept.includes("video/"))'),true);
  assert.equal(await evaluate('document.documentElement.scrollWidth <= document.documentElement.clientWidth'),true);
  await evaluate('document.querySelector(".media-grid button").click()');
  await waitFor('document.querySelector("video")?.readyState >= 2');
  assert.equal(await evaluate('document.querySelector("video").controls && document.querySelector("video").videoWidth > 0'),true);
  await evaluate('document.querySelector("video").play()');
  await waitFor('document.querySelector("video").currentTime > 0');
  await evaluate('document.querySelector("#close-viewer").click()');
  await waitFor('document.querySelector("video") === null');
  assert.deepEqual(exceptions,[]);
  console.log('Browser QA passed: anonymous desktop/mobile registration, private link recovery, entry instructions, organizer protection, video controls and playback.');
} finally {socket?.close();chrome.kill();}
