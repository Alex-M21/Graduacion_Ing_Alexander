import {PDFDocument} from "./pdf-lib.esm.min.js";

// The faculty artwork is retained as the original PDF page. Only the empty
// name area receives an overlay. Canvas preserves accented/Unicode guest names
// using the device's font fallback, without sending personal data elsewhere.
let templatePromise;
async function templateBytes() {
  if(!templatePromise) templatePromise=fetch(new URL("./facultad-template.pdf",import.meta.url))
    .then(response=>{if(!response.ok) throw new Error("No pudimos cargar la invitación de la Facultad.");return response.arrayBuffer();})
    .catch(error=>{templatePromise=null;throw error;});
  return new Uint8Array(await templatePromise).slice();
}

function wrapName(context,text,maxWidth) {
  const lines=[];let line="";
  for(const word of text.split(" ")) {
    if(context.measureText(word).width>maxWidth) {
      if(line) {lines.push(line);line="";}
      const letters=typeof Intl.Segmenter==="function" ? Array.from(new Intl.Segmenter(undefined,{granularity:"grapheme"}).segment(word),item=>item.segment) : Array.from(word);
      for(const letter of letters) {
        if(line && context.measureText(line+letter).width>maxWidth) {lines.push(line);line="";}
        line+=letter;
      }
    } else if(line && context.measureText(line+" "+word).width>maxWidth) {
      lines.push(line);line=word;
    } else line+=(line ? " " : "")+word;
  }
  if(line) lines.push(line);
  return lines;
}

export async function createPersonalInvitation(fullName) {
  if(typeof fullName!=="string") throw new Error("Necesitamos tu nombre para preparar la invitación.");
  const name=fullName.replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim();
  if(name.length<2 || name.length>160) throw new Error("Revisa tu nombre completo antes de descargar la invitación.");
  const pdf=await PDFDocument.load(await templateBytes());
  const page=pdf.getPage(0);
  const canvas=document.createElement("canvas");canvas.width=2526;canvas.height=1785;
  const context=canvas.getContext("2d");
  if(!context) throw new Error("Tu navegador no pudo preparar el PDF. Intenta con otro navegador.");
  try {
    context.scale(2,2);context.textAlign="center";context.textBaseline="alphabetic";
    const center=528;
    context.fillStyle="#122b54";context.font='bold 34px Georgia, "Times New Roman", serif';
    context.fillText("Ing. Alexander Mejía",center,515);
    context.fillStyle="#805b24";context.font='13px Arial, Helvetica, sans-serif';
    context.fillText("INVITACIÓN PERSONAL PARA",center,580);
    let size=32,lines;
    do {context.font=`bold ${size}px Arial, Helvetica, sans-serif`;lines=wrapName(context,name,680);if(lines.length<=4 && lines.length*size*1.18<=82) break;size-=1;} while(size>=14);
    if(lines.length>4 || size<14) throw new Error("No pudimos acomodar tu nombre en la invitación. Revisa tus datos.");
    context.fillStyle="#122b54";
    lines.forEach((line,index)=>context.fillText(line,center,628+(index-(lines.length-1)/2)*size*1.18));
    context.font='bold 18px Arial, Helvetica, sans-serif';
    context.fillText("Miércoles 28 de octubre de 2026, 10:00 a. m.",center,696);
    context.font='15px Arial, Helvetica, sans-serif';
    context.fillText("Auditorio Francisco Vela, Campus Central, zona 12",center,723);
    const png=await new Promise((resolve,reject)=>canvas.toBlob(blob=>blob ? resolve(blob) : reject(new Error("No pudimos crear el PDF. Intenta de nuevo.")),"image/png"));
    const overlay=await pdf.embedPng(await png.arrayBuffer());
    page.drawImage(overlay,{x:0,y:0,width:page.getWidth(),height:page.getHeight()});
    pdf.setTitle("Invitación a la graduación de Ing. Alexander Mejía");
    pdf.setSubject("Invitación personal para "+name);
    pdf.setAuthor("Ing. Alexander Mejía");
    pdf.setCreator("Invitación digital de graduación");
    const bytes=await pdf.save();
    const safeName=name.normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-zA-Z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,85) || "invitado";
    return {blob:new Blob([bytes],{type:"application/pdf"}),filename:"Invitacion-Alexander-Mejia-"+safeName+".pdf"};
  } finally {canvas.width=0;canvas.height=0;}
}
