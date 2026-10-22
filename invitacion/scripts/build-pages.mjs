import {mkdir,readFile,writeFile,copyFile,cp} from "node:fs/promises";
import path from "node:path";
import {createHash} from "node:crypto";
const output=path.resolve(process.argv[2] || "../docs");
const body=await readFile(new URL("../web/body.html",import.meta.url),"utf8");
await mkdir(output,{recursive:true});
const version=createHash("sha256");
for(const name of ["styles.css","faculty.css","app.js","config.js"]) version.update(await readFile(new URL("../public/web/"+name,import.meta.url)));
const stamp=version.digest("hex").slice(0,12);
const html=`<!doctype html>
<html lang="es-GT"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex,nofollow">
<meta name="referrer" content="no-referrer">
<meta name="theme-color" content="#ffffff">
<title>Graduación · Ing. Alexander Mejía</title>
<meta name="description" content="Cada persona invitada forma parte de quien soy hoy y de los logros que he alcanzado. Acompáñame a celebrar mi graduación como Ingeniero en Ciencias y Sistemas.">
<meta property="og:type" content="website">
<meta property="og:locale" content="es_GT">
<meta property="og:title" content="🎓 Graduación · Ing. Alexander Mejía">
<meta property="og:description" content="Formas parte de quien soy hoy y de mis logros. Acompáñame a mi graduación como Ingeniero en Ciencias y Sistemas. Miércoles 28 de octubre · 10:00 a. m.">
<meta property="og:url" content="https://alex-m21.github.io/Graduacion_Ing_Alexander/">
<meta property="og:image" content="https://alex-m21.github.io/Graduacion_Ing_Alexander/share-card.png">
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Invitación a la graduación del Ing. Alexander Mejía, 28 de octubre de 2026 a las 10:00 a. m.">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="./favicon.svg"><link rel="stylesheet" href="./styles.css?v=${stamp}"><link rel="stylesheet" href="./faculty.css?v=${stamp}">
<script defer src="./config.js?v=${stamp}"></script><script defer src="./app.js?v=${stamp}"></script>
</head><body>${body}</body></html>\n`;
await writeFile(path.join(output,"index.html"),html);
await writeFile(path.join(output,".nojekyll"),"");
for(const name of ["styles.css","faculty.css","app.js","config.js"]) await copyFile(new URL("../public/web/"+name,import.meta.url),path.join(output,name));
await copyFile(new URL("../public/favicon.svg",import.meta.url),path.join(output,"favicon.svg"));
await copyFile(new URL("../public/share-card.png",import.meta.url),path.join(output,"share-card.png"));
await cp(new URL("../public/venue/",import.meta.url),path.join(output,"venue"),{recursive:true});
await cp(new URL("../public/web/fonts/",import.meta.url),path.join(output,"fonts"),{recursive:true});
await cp(new URL("../public/audio/",import.meta.url),path.join(output,"audio"),{recursive:true});
await cp(new URL("../public/code-icons/",import.meta.url),path.join(output,"code-icons"),{recursive:true});
console.log("GitHub Pages assets prepared: "+output);
