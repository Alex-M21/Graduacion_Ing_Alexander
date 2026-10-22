// Real browser checks. The event-day collection is mocked in the browser only.
// This script never registers guests or uploads files to the selected server.
import {spawn} from 'node:child_process';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const base=process.env.QA_BASE_URL || 'http://127.0.0.1:5173/';
await mkdir('.sites-runtime/gallery',{recursive:true});
const profile=await mkdtemp(path.resolve('.sites-runtime/gallery/chrome-'));
const chrome=spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--disable-component-update','--disk-cache-size=1048576','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:['ignore','ignore','pipe']});
let socket;
try {
  const endpoint=await new Promise((resolve,reject)=>{let text='';const timer=setTimeout(()=>reject(new Error('Chrome startup timed out')),20000);chrome.stderr.on('data',b=>{text+=b;const m=text.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(m){clearTimeout(timer);resolve(m[1]);}});chrome.on('error',reject);});
  const pages=await(await fetch('http://'+new URL(endpoint).host+'/json/list')).json();socket=new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl);await new Promise(r=>socket.onopen=r);
  let id=0;const pending=new Map(),exceptions=[];
  socket.onmessage=({data})=>{const m=JSON.parse(data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(new Error(m.error.message)):p.resolve(m.result);}if(m.method==='Runtime.exceptionThrown')exceptions.push(m.params.exceptionDetails.text);};
  const send=(method,params={})=>new Promise((resolve,reject)=>{const i=++id;pending.set(i,{resolve,reject});socket.send(JSON.stringify({id:i,method,params}));});
  const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.text+' '+JSON.stringify(r.exceptionDetails.exception));return r.result.value;};
  const pause=ms=>new Promise(r=>setTimeout(r,ms));
  async function waitFor(expression){for(let i=0;i<180;i++){if(await evaluate(expression))return;await pause(100);}throw new Error('Timeout: '+expression);}
  async function navigate(condition,url=base){const target=new URL(url);target.searchParams.set('__qa_navigation',String(Date.now()));await evaluate('window.__qaLeaving=true');await send('Page.navigate',{url:target.href});await waitFor('!window.__qaLeaving && ('+condition+')');}
  async function shot(name){const result=await send('Page.captureScreenshot',{format:'png'});await writeFile('.sites-runtime/gallery/'+name+'.png',Buffer.from(result.data,'base64'));}
  await send('Page.enable');await send('Runtime.enable');await send('Emulation.setFocusEmulationEnabled',{enabled:true});
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await navigate('document.querySelector("#rsvp-form")?.hidden === false');
  await waitFor('document.querySelector(".hero-photo img")?.complete && document.querySelector(".hero-photo img").naturalWidth>0');
  await shot('desktop-invitation');
  await evaluate('document.querySelector(".venue-heading").scrollIntoView({behavior:"instant",block:"start"})');
  await waitFor('Array.from(document.querySelectorAll("[data-venue] img")).every(i=>i.complete&&i.naturalWidth>0)');await pause(650);await shot('desktop-venue');
  await evaluate('document.querySelector("[data-venue]").click()');await waitFor('document.querySelector("#viewer-content img")?.naturalWidth>0 && document.querySelector("#viewer-content").getAttribute("aria-busy")==="false"');
  assert.equal(await evaluate('document.querySelector("#viewer-position").textContent'),'1 de 4');
  assert.equal(await evaluate('document.querySelector("#viewer-prev").disabled'),true);
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowRight',code:'ArrowRight'});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowRight',code:'ArrowRight'});
  await waitFor('document.querySelector("#viewer-position").textContent==="2 de 4" && document.querySelector("#viewer-content img")?.naturalWidth>0');
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27,nativeVirtualKeyCode:27});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27,nativeVirtualKeyCode:27});await waitFor('!document.querySelector("#viewer").open');
  await waitFor('document.activeElement.hasAttribute("data-venue")');
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await evaluate('document.querySelector(".venue-heading").scrollIntoView({behavior:"instant"})');await pause(300);await shot('mobile-venue');
  await evaluate('document.querySelector("#venue-next").click()');await waitFor('document.querySelector("#venue-position").textContent==="2 / 4"');
  await evaluate('document.querySelectorAll("[data-venue]")[1].click()');await waitFor('document.querySelector("#viewer-content img")?.naturalWidth>0');
  assert.equal(await evaluate('(()=>{const r=document.querySelector("#viewer-content img").getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth;})()'),true,'image fits phone viewer');
  await shot('mobile-viewer');
  // A right-to-left swipe should move to the next photo without a page scroll.
  const touch=await evaluate('(()=>{const r=document.querySelector("#viewer-content").getBoundingClientRect();return {x:r.left+r.width*.8,y:r.top+r.height*.5,end:r.left+r.width*.2};})()');
  await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:touch.x,y:touch.y}]});await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:touch.end,y:touch.y}]});await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await waitFor('document.querySelector("#viewer-position").textContent==="3 de 4"');
  await evaluate('document.querySelector("#close-viewer").click()');
  // Locally generated WebM and supplied venue images act as event-day fixtures.
  await send('Page.addScriptToEvaluateOnNewDocument',{source:`(() => {
    const fetchOriginal=window.fetch.bind(window);
    const photoUrls=['jardin-campus.jpeg','ingenieria-usac.jpeg','rincon-campus.jpeg','auditorio.jpeg'];
    window.__qaDelayAccess=false;window.__qaAccessTrace=[];
    let clip;const getClip=()=>clip ||= (async()=>{
      const canvas=document.createElement('canvas');canvas.width=320;canvas.height=180;
      const ctx=canvas.getContext('2d'),stream=canvas.captureStream(0),track=stream.getVideoTracks()[0],recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp8'}),chunks=[];
      const done=new Promise(resolve=>{recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};recorder.onstop=()=>resolve(new Blob(chunks,{type:'video/webm'}));});
      recorder.start();let frame=0;const timer=setInterval(()=>{ctx.fillStyle=frame++%2?'#ef6c2f':'#252525';ctx.fillRect(0,0,320,180);track.requestFrame();},80);
      setTimeout(()=>{clearInterval(timer);recorder.stop();stream.getTracks().forEach(t=>t.stop());},700);const blob=await done;window.__qaClipInfo={size:blob.size,type:blob.type};return URL.createObjectURL(blob);
    })();
    const photos=Array.from({length:9},(_,i)=>({id:'fixture-'+i,kind:i===2?'video':'photo',url:new URL('venue/'+photoUrls[i%4],location.href).href,createdAt:'2026-10-28T16:00:00Z',contentType:i===2?'video/webm':'image/jpeg'}));
    window.fetch=async(input,options)=>{
      const u=new URL(typeof input==='string'?input:input.url,location.origin);
      if(u.pathname==='/api/me')return Response.json({albumOpen:true,isAdmin:false,guest:{fullName:'Prueba local de galería',email:'qa@example.test',attendance:'yes'}});
      if(u.pathname==='/api/photos')return Response.json({photos,nextCursor:null});
      if(u.pathname.startsWith('/api/photos/fixture-')&&u.pathname.endsWith('/access')){
        window.__qaAccessTrace.push(u.pathname);
        if(window.__qaDelayAccess)await new Promise(r=>setTimeout(r,700));
        const i=Number(u.pathname.split('/')[3].replace('fixture-',''));return Response.json({url:i===2?await getClip():photos[i].url});
      }
      return fetchOriginal(input,options);
    };
  })();`});
  await navigate('document.querySelectorAll(".media-item").length===1',base+'#videos');
  assert.equal(await evaluate('document.querySelector("[data-filter=video]").getAttribute("aria-pressed")'),'true','video deep link selects videos on load');
  await evaluate('location.hash="#fotos"');await waitFor('document.querySelectorAll(".media-item").length===8');
  assert.equal(await evaluate('document.querySelector("[data-filter=photo]").getAttribute("aria-pressed")'),'true');
  await evaluate('document.querySelector("#refresh-album").click()');await waitFor('!document.querySelector("#refresh-album").disabled');
  assert.equal(await evaluate('document.querySelectorAll(".media-item").length'),8,'refresh preserves photo filter');
  await evaluate('location.hash="#album"');await waitFor('document.querySelectorAll(".media-item").length===9');
  await navigate('document.querySelectorAll(".media-item").length===8',base+'#fotos');
  await evaluate('document.querySelector("[data-filter=all]").click()');
  assert.equal(await evaluate('location.hash'),'#album','filter buttons expose shareable collection links');
  assert.equal(await evaluate('document.querySelector("#album-preview").hidden'),true);
  for(const width of [320,390,430,768,1440]){
    await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<=760});
    await evaluate('document.querySelector("#media-grid").scrollIntoView({behavior:"instant"})');await pause(150);
    assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'),true,'album width '+width);
    assert.equal(await evaluate('Array.from(document.querySelectorAll(".media-item")).every(e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth;})'),true,'masonry bounds '+width);
    if(width===390||width===1440){await pause(500);await shot(width===390?'mobile-album':'desktop-album');}
  }
  await evaluate('document.querySelector("[data-filter=photo]").click()');assert.equal(await evaluate('document.querySelectorAll(".media-item").length'),8);
  await evaluate('document.querySelector(".media-item").click()');await waitFor('document.querySelector("#viewer-content img")?.naturalWidth>0');assert.equal(await evaluate('document.querySelector("#viewer-position").textContent'),'1 de 8');
  await evaluate('document.querySelector("#close-viewer").click();document.querySelector("[data-filter=video]").click()');assert.equal(await evaluate('document.querySelectorAll(".media-item").length'),1);
  await evaluate('document.querySelector(".video-tile").click()');
  try {await waitFor('document.querySelector("#viewer video")?.readyState>=2');} catch(error) {console.log(await evaluate('({open:document.querySelector("#viewer").open,content:document.querySelector("#viewer-content").innerHTML,clip:window.__qaClipInfo,requests:window.__qaAccessTrace,video:(()=>{const v=document.querySelector("#viewer video");return v?{ready:v.readyState,network:v.networkState,error:v.error?.message,source:v.src}:null})()})'));throw error;}
  await evaluate('document.querySelector("#viewer video").play()');await waitFor('document.querySelector("#viewer video").currentTime>0');
  await evaluate('document.querySelector("#close-viewer").click()');await waitFor('document.querySelector("#viewer video")===null');
  // Closing a loading private photo must prevent an old response reopening it.
  await evaluate('window.__qaDelayAccess=true;document.querySelector("[data-filter=photo]").click();document.querySelector(".media-item").click();document.querySelector("#close-viewer").click()');await pause(1000);
  assert.equal(await evaluate('!document.querySelector("#viewer").open && document.querySelector("#viewer-content").children.length===0'),true,'late response stays closed');
  assert.deepEqual(exceptions,[]);
  console.log('Gallery QA passed: venue photos, keyboard and swipe navigation, focus return, phone image fit, masonry at five sizes, initial photo/video deep links and hash changes, persistent filters, WebM playback and safe close during loading. Collection data was mocked; no hosted records or files were written.');
} finally {socket?.close();chrome.kill();}
