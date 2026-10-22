"use client";
import {useEffect} from "react";
export default function StaticInvitation({html}:{html:string}) {
  useEffect(()=>{
    let cancelled=false;let app:HTMLScriptElement|undefined;
    const config=document.createElement("script");config.src="/web/config.js";
    config.onload=()=>{if(cancelled) return;app=document.createElement("script");app.src="/web/app.js";document.body.appendChild(app);};
    document.body.appendChild(config);
    return ()=>{cancelled=true;config.remove();app?.remove();};
  },[]);
  return <div dangerouslySetInnerHTML={{__html:html}}/>;
}
