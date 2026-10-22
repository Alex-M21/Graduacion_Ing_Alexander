// Browser-only RSVP fixtures; no guests or files are written to a hosted API.
import {spawn} from 'node:child_process';
import {mkdir,mkdtemp,readFile,readdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {PDFDocument} from '../public/invitation/pdf-lib.esm.min.js';
const base=process.env.QA_BASE_URL || 'http://127.0.0.1:8788/';
assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname),'Use a local preview for PDF QA.');
await mkdir('.sites-runtime/invitation-pdf',{recursive:true});
const run=await mkdtemp(path.resolve('.sites-runtime/invitation-pdf/run-'));
const downloads=path.join(run,'downloads');await mkdir(downloads);
const chrome=spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--disable-component-update','--disk-cache-size=1048576','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--user-data-dir='+path.join(run,'chrome'),'about:blank'],{windowsHide:true,stdio:['ignore','ignore','pipe']});
let socket;
try {
  const endpoint=await new Promise((resolve,reject)=>{let out='';const timer=setTimeout(()=>reject(new Error('Chrome startup timed out')),20000);chrome.stderr.on('data',b=>{out+=b;const m=out.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(m){clearTimeout(timer);resolve(m[1]);}});chrome.on('error',reject);});
  const pages=await(await fetch('http://'+new URL(endpoint).host+'/json/list')).json();
  socket=new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl);await new Promise(r=>socket.onopen=r);
  let id=0;const pending=new Map(),exceptions=[];
  socket.onmessage=({data})=>{const m=JSON.parse(data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(new Error(m.error.message)):p.resolve(m.result);}if(m.method==='Runtime.exceptionThrown')exceptions.push(m.params.exceptionDetails.text);};
  const send=(method,params={})=>new Promise((resolve,reject)=>{const i=++id;pending.set(i,{resolve,reject});socket.send(JSON.stringify({id:i,method,params}));});
  const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.text);return r.result.value;};
  const pause=ms=>new Promise(r=>setTimeout(r,ms));
  async function waitFor(expression){for(let i=0;i<180;i++){if(await evaluate(expression))return;await pause(100);}console.log(await evaluate('({confirmed:document.querySelector("#confirmed-state")?.hidden,status:document.querySelector("#invitation-status")?.textContent,formError:document.querySelector("#form-error")?.textContent,invalid:Array.from(document.querySelectorAll("#rsvp-form :invalid")).map(e=>e.id),requests:window.__qaRequests,guest:window.__qaGuest})'));throw new Error('Timeout: '+expression);}
  await send('Page.enable');await send('Runtime.enable');
  await send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:downloads});
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await send('Page.addScriptToEvaluateOnNewDocument',{source:`(() => {
    const fetchOriginal=window.fetch.bind(window);
    window.__qaGuest=JSON.parse(localStorage.getItem('qa-pdf-guest') || 'null');
    window.__qaFailTemplate=true;window.__qaRequests=[];
    window.fetch=async(input,options={})=>{
      const u=new URL(input instanceof Request ? input.url : String(input),location.origin);window.__qaRequests.push(u.href);
      if(u.pathname==='/api/me')return Response.json({albumOpen:true,isAdmin:false,guest:window.__qaGuest});
      if(u.pathname==='/api/rsvp' && options.method==='POST'){
        const data=JSON.parse(options.body);window.__qaGuest={fullName:data.fullName,email:data.email,attendance:'yes'};
        localStorage.setItem('qa-pdf-guest',JSON.stringify(window.__qaGuest));return Response.json({ok:true,guestPass:'a'.repeat(64)});
      }
      if(u.pathname==='/api/rsvp/attendance') {window.__qaGuest.attendance=JSON.parse(options.body).attendance;return Response.json({ok:true});}
      if(u.pathname==='/api/photos')return Response.json({photos:[],nextCursor:null});
      if(u.pathname.endsWith('/facultad-template.pdf') && window.__qaFailTemplate)return new Response('Unavailable',{status:503});
      return fetchOriginal(input,options);
    };
  })();`});
  await send('Page.navigate',{url:base});await waitFor('document.querySelector("#rsvp-form")?.hidden === false');
  assert.equal(await evaluate('document.querySelector("#personal-invitation").hidden'),true);
  const name='María José López de León';
  async function submit(fullName) {
    await evaluate(`(() => {document.querySelector('#fullName').value=${JSON.stringify(fullName)};document.querySelector('#email').value='pdf-qa@example.test';document.querySelector('#cui').value='1234567890123';document.querySelector('.consent input').checked=true;document.querySelector('#rsvp-form').requestSubmit();})()`);
  }
  await submit(name);
  await waitFor('!document.querySelector("#confirmed-state").hidden && document.querySelector("#invitation-status").textContent.includes("No pudimos")');
  assert.equal(await evaluate('document.querySelector("#prepare-invitation").disabled'),false,'PDF failure does not lose RSVP or disable retry');
  await evaluate('window.__qaFailTemplate=false;document.querySelector("#prepare-invitation").click()');
  await waitFor('!document.querySelector("#download-invitation").hidden');
  async function downloadedPdf(expectedName) {
    const filename=await evaluate('document.querySelector("#download-invitation").download');
    for(let i=0;i<100;i++) {if((await readdir(downloads)).includes(filename))break;await pause(100);}
    const bytes=await readFile(path.join(downloads,filename)),pdf=await PDFDocument.load(bytes);
    assert.equal(pdf.getPageCount(),1);assert.deepEqual(pdf.getPage(0).getSize(),{width:842,height:595});
    assert.equal(pdf.getAuthor(),'Ing. Alexander Mejía');assert.equal(pdf.getSubject(),'Invitación personal para '+expectedName);
    assert.ok(bytes.length>116449,'personalized content was added to the original PDF');
    return {filename,bytes};
  }
  const first=await downloadedPdf(name);await writeFile(path.join(run,'sample.pdf'),first.bytes);
  for(const width of [320,360,390,430]) {
    await send('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:true});
    assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true,'PDF confirmation fits '+width);
    assert.equal(await evaluate('(()=>{const r=document.querySelector("#download-invitation").getBoundingClientRect();return r.left>=0&&r.right<=innerWidth;})()'),true,'PDF download button fits '+width);
  }
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await evaluate('document.querySelector("#personal-invitation").scrollIntoView({block:"center",behavior:"instant"})');
  const shot=await send('Page.captureScreenshot',{format:'png'});await writeFile(path.join(run,'phone-confirmation.png'),Buffer.from(shot.data,'base64'));
  const oldUrl=await evaluate('document.querySelector("#download-invitation").href');
  await evaluate('document.querySelector("#edit-rsvp").click()');
  await submit('Ana Lucía Méndez');await waitFor('!document.querySelector("#download-invitation").hidden && document.querySelector("#download-invitation").download!=='+JSON.stringify(first.filename));
  await downloadedPdf('Ana Lucía Méndez');
  assert.equal(await evaluate(`fetch(${JSON.stringify(oldUrl)}).then(()=>true,()=>false)`),false,'old name blob is revoked');
  const longName=('María Alejandra Fernández López '.repeat(6)).slice(0,160).trim();
  const longBase64=await evaluate(`(async()=>{const {createPersonalInvitation}=await import(new URL('./invitation/personalize.js',location.href).href);const {blob}=await createPersonalInvitation(${JSON.stringify(longName)});return new Promise(r=>{const reader=new FileReader();reader.onload=()=>r(reader.result.split(',')[1]);reader.readAsDataURL(blob);});})()`);
  await writeFile(path.join(run,'long-name.pdf'),Buffer.from(longBase64,'base64'));
  // A returning guest can prepare the PDF again; visiting does not auto-download.
  await send('Page.navigate',{url:base+'?return=1'});await waitFor('document.querySelector("#confirmed-name")?.textContent.includes("Ana")');
  assert.equal(await evaluate('document.querySelector("#download-invitation").hidden'),true);
  await evaluate('window.__qaFailTemplate=false;document.querySelector("#prepare-invitation").click()');await waitFor('!document.querySelector("#download-invitation").hidden');
  await evaluate('document.querySelector("#decline-rsvp").click()');await waitFor('document.querySelector("#personal-invitation").hidden');
  assert.equal(await evaluate('document.querySelector("#download-invitation").hasAttribute("href")'),false);
  assert.equal(await evaluate('window.__qaRequests.some(url=>url.includes("pdf-qa@")||url.includes("1234567890123")||url.includes("#acceso="))'),false);
  assert.deepEqual(exceptions,[]);
  console.log(JSON.stringify({passed:true,registrationSurvivesPdfFailure:true,retryDownload:true,automaticDownloadAfterEdit:true,accentedNames:true,longName:true,returningGuest:true,declinedGuest:true,noHostedWrites:true,artifacts:run},null,2));
} finally {socket?.close();chrome.kill();}
