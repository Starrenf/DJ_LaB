(()=>{
  "use strict";
  const applyVisualVersion=()=>{
    const beta=document.querySelector(".beta");
    if(beta)beta.textContent="0.3.3 PRO";
    const footerVersion=document.querySelector(".footer span");
    if(footerVersion)footerVersion.textContent="HET PODIUM // DJ LAB 0.3.3 PRO";
    document.documentElement.dataset.visualRefresh="0.3.3";
  };
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",applyVisualVersion,{once:true});
  else applyVisualVersion();
})();
