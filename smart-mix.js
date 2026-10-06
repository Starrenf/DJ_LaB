(function(){
"use strict";

const fileCache=new Map();
const originalArrayBuffer=(typeof File!=="undefined"&&File.prototype.arrayBuffer)?File.prototype.arrayBuffer:null;
let analysisContext=null;
let mixRun=null;

function normalizeTitle(name){
  return String(name||"").replace(/\.[^.]+$/,"").replace(/[_-]+/g," ").trim().toLowerCase();
}

if(originalArrayBuffer){
  File.prototype.arrayBuffer=function(){
    fileCache.set(normalizeTitle(this.name),this);
    return originalArrayBuffer.call(this);
  };
}

function $(id){return document.getElementById(id)}
function clamp(v,a,b){return Math.min(b,Math.max(a,v))}
function sleep(ms){return new Promise(resolve=>setTimeout(resolve,ms))}
function dispatch(el,type){el.dispatchEvent(new Event(type,{bubbles:true}))}
function parseTime(text){
  const s=String(text||"").replace(/^-/,'').trim();
  const parts=s.split(":").map(Number);
  if(parts.length!==2||parts.some(Number.isNaN))return 0;
  return parts[0]*60+parts[1];
}
function isPlaying(id){return $("state"+id)?.textContent==="PLAYING"||$("state"+id)?.textContent==="CUE PREVIEW"}
function deckLoaded(id){return !!$("title"+id)&&!/Sleep een track/i.test($("title"+id).textContent)}
function deckTitle(id){return normalizeTitle($("title"+id)?.textContent)}
function pitchRate(id){return 1+Number($("pitch"+id)?.value||0)/100}
function displayedBpm(id){return Number($("bpm"+id)?.value||0)}
function baseBpm(id){const shown=displayedBpm(id);return shown?shown/pitchRate(id):0}
function gridOffset(id){const v=Number($("gridOffset"+id)?.value);return Number.isFinite(v)&&v>=0?v:null}

function notify(message){
  let el=$("smartMixStatus");
  if(el)el.textContent=message;
  const toast=document.getElementById("toast");
  if(toast){
    toast.textContent=message;
    toast.classList.add("show");
    clearTimeout(notify.timer);
    notify.timer=setTimeout(()=>toast.classList.remove("show"),2500);
  }
}

function getFileForDeck(id){
  const key=deckTitle(id);
  if(fileCache.has(key))return fileCache.get(key);
  for(const [name,file] of fileCache){
    if(name===key||name.startsWith(key)||key.startsWith(name))return file;
  }
  return null;
}

async function decodeFile(file){
  if(!file||!originalArrayBuffer)throw new Error("Audiobestand niet beschikbaar");
  analysisContext=analysisContext||new (window.AudioContext||window.webkitAudioContext)();
  const bytes=await originalArrayBuffer.call(file);
  return analysisContext.decodeAudioData(bytes.slice(0));
}

function buildOnsetEnvelope(buffer){
  const rate=buffer.sampleRate;
  const targetHz=200;
  const hop=Math.max(1,Math.floor(rate/targetHz));
  const maxSamples=Math.min(buffer.length,Math.floor(rate*120));
  const data=buffer.getChannelData(0);
  const energy=[];
  for(let i=0;i<maxSamples;i+=hop){
    let sum=0,count=0;
    const end=Math.min(maxSamples,i+hop);
    for(let j=i;j<end;j+=2){sum+=Math.abs(data[j]);count++}
    energy.push(count?sum/count:0);
  }
  const onset=new Float32Array(energy.length);
  let smooth=0;
  for(let i=0;i<energy.length;i++){
    smooth=smooth*.93+energy[i]*.07;
    const prev=i?energy[i-1]:0;
    onset[i]=Math.max(0,energy[i]-Math.max(prev*.85,smooth*.9));
  }
  return {onset,hz:targetHz};
}

function detectBpm(onset,hz){
  let bestScore=-Infinity,bestBpm=120;
  const maxFrames=Math.min(onset.length,hz*90);
  for(let bpm=72;bpm<=168;bpm+=.5){
    const lag=Math.max(1,Math.round(hz*60/bpm));
    let score=0;
    for(let i=lag;i<maxFrames;i++)score+=onset[i]*onset[i-lag];
    if(score>bestScore){bestScore=score;bestBpm=bpm}
  }
  return Math.round(bestBpm*10)/10;
}

function detectBeatPhase(onset,hz,bpm){
  const lag=Math.max(1,Math.round(hz*60/bpm));
  const limit=Math.min(onset.length,hz*90);
  let bestPhase=0,bestScore=-Infinity;
  for(let phase=0;phase<lag;phase++){
    let score=0,weight=1;
    for(let i=phase;i<limit;i+=lag){
      score+=onset[i]*weight;
      weight=Math.max(.35,weight*.992);
    }
    if(score>bestScore){bestScore=score;bestPhase=phase}
  }
  let local=bestPhase,localValue=-Infinity;
  const radius=Math.max(2,Math.round(hz*.04));
  for(let i=Math.max(0,bestPhase-radius);i<=Math.min(onset.length-1,bestPhase+radius);i++){
    if(onset[i]>localValue){localValue=onset[i];local=i}
  }
  return local/hz;
}

async function analyzeDeck(id,force=false){
  if(!deckLoaded(id))throw new Error("Deck "+id+" heeft geen track");
  const bpmEl=$("bpm"+id),gridEl=$("gridOffset"+id);
  let bpm=displayedBpm(id),offset=gridOffset(id);
  if(!force&&bpm>0&&offset!==null)return {bpm,offset};

  const file=getFileForDeck(id);
  if(!file)throw new Error("Laad de track in Deck "+id+" opnieuw zodat Auto Grid hem kan analyseren");

  notify("AUTO GRID · Deck "+id+" analyseren…");
  const buffer=await decodeFile(file);
  const {onset,hz}=buildOnsetEnvelope(buffer);
  const detectedBase=(bpm>0)?baseBpm(id):detectBpm(onset,hz);
  offset=detectBeatPhase(onset,hz,detectedBase);

  if(!(bpm>0)){
    bpmEl.value=detectedBase.toFixed(1);
    dispatch(bpmEl,"change");
    bpm=detectedBase;
  }
  gridEl.value=offset.toFixed(3);
  dispatch(gridEl,"change");

  const quant=document.querySelector('[data-action="quantize"][data-deck="'+id+'"]');
  if(quant&&!quant.classList.contains("active"))quant.click();
  notify("AUTO GRID · Deck "+id+" ≈ "+detectedBase.toFixed(1)+" BPM");
  return {bpm:displayedBpm(id),offset};
}

function seekDeck(id,seconds){
  const wave=$("wave"+id);
  const current=parseTime($("time"+id)?.textContent);
  const remain=parseTime($("remain"+id)?.textContent);
  const duration=current+remain;
  if(!wave||!duration)return false;
  const rect=wave.getBoundingClientRect();
  const ratio=clamp(seconds/duration,0,.999);
  wave.dispatchEvent(new MouseEvent("click",{bubbles:true,clientX:rect.left+rect.width*ratio,clientY:rect.top+rect.height/2}));
  return true;
}

function setPitchForBpm(id,targetBpm){
  const pitch=$("pitch"+id),bpm=$("bpm"+id);
  if(!pitch||!bpm)return false;
  pitch.value="0";
  dispatch(pitch,"input");
  const base=Number(bpm.value||0);
  if(!base)return false;
  const pct=(targetBpm/base-1)*100;
  const min=Number(pitch.min||-10),max=Number(pitch.max||10);
  if(pct<min||pct>max)return false;
  pitch.value=pct.toFixed(2);
  dispatch(pitch,"input");
  return true;
}

function setRange(id,value){
  const el=$(id);if(!el)return;
  el.value=String(value);dispatch(el,"input");
}

function chooseDecks(){
  const a=isPlaying("A"),b=isPlaying("B");
  if(a&&!b)return {source:"A",target:"B"};
  if(b&&!a)return {source:"B",target:"A"};
  if(a&&b){
    const x=Number($("crossfader")?.value||0);
    return x<=0?{source:"A",target:"B"}:{source:"B",target:"A"};
  }
  return null;
}

function nextBarDelay(source){
  const bpmOut=displayedBpm(source);
  const rate=pitchRate(source);
  const bpmBase=bpmOut/rate;
  const offset=gridOffset(source)??0;
  const now=parseTime($("time"+source)?.textContent);
  const mediaBeat=60/bpmBase;
  let beatIndex=(now-offset)/mediaBeat;
  let nextBeat=Math.ceil((beatIndex+.08)/4)*4;
  let boundary=offset+nextBeat*mediaBeat;
  let delay=(boundary-now)/rate;
  if(delay<.35){nextBeat+=4;boundary=offset+nextBeat*mediaBeat;delay=(boundary-now)/rate}
  return Math.max(.05,delay);
}

function preciseTimeout(callback,delayMs){
  const target=performance.now()+delayMs;
  let timer;
  const tick=()=>{
    const remaining=target-performance.now();
    if(remaining<=8){
      requestAnimationFrame(()=>callback());
    }else{
      timer=setTimeout(tick,Math.max(4,remaining-12));
    }
  };
  timer=setTimeout(tick,Math.max(0,delayMs-18));
  return ()=>clearTimeout(timer);
}

function ease(p){return p*p*(3-2*p)}

function cancelSmartMix(reason="SMART MIX geannuleerd"){
  if(!mixRun)return;
  mixRun.cancelled=true;
  mixRun.cancelStart?.();
  if(mixRun.raf)cancelAnimationFrame(mixRun.raf);
  if(mixRun.sourceLow!==undefined)setRange("low"+mixRun.source,mixRun.sourceLow);
  if(mixRun.targetLow!==undefined)setRange("low"+mixRun.target,mixRun.targetLow);
  mixRun=null;
  const b=$("smartMixButton");
  if(b){b.classList.remove("active");b.textContent="⚡ SMART MIX"}
  notify(reason);
}

function animateTransition(source,target,durationSec,startX,targetX,sourceLow,targetLow){
  const started=performance.now();
  const xfade=$("crossfader");
  const sourceLowEl=$("low"+source),targetLowEl=$("low"+target);
  const finish=()=>{
    xfade.value=String(targetX);dispatch(xfade,"input");
    setRange("low"+target,targetLow);
    if(isPlaying(source))document.querySelector('[data-action="play"][data-deck="'+source+'"]').click();
    setRange("low"+source,sourceLow);
    const b=$("smartMixButton");
    if(b){b.classList.remove("active");b.textContent="⚡ SMART MIX"}
    mixRun=null;
    notify("SMART MIX klaar · Deck "+target+" is live");
  };

  const frame=now=>{
    if(!mixRun||mixRun.cancelled)return;
    const p=clamp((now-started)/(durationSec*1000),0,1);
    const shaped=ease(p);
    xfade.value=String(startX+(targetX-startX)*shaped);dispatch(xfade,"input");

    if(p<.45){
      const q=ease(p/.45);
      sourceLowEl.value=String(sourceLow+(-12-sourceLow)*q);dispatch(sourceLowEl,"input");
      targetLowEl.value="-12";dispatch(targetLowEl,"input");
    }else{
      sourceLowEl.value="-12";dispatch(sourceLowEl,"input");
      const q=ease(clamp((p-.45)/.35,0,1));
      targetLowEl.value=String(-12+(targetLow+12)*q);dispatch(targetLowEl,"input");
    }

    $("smartMixStatus").textContent="MIX "+Math.round(p*100)+"% · "+source+" → "+target;
    if(p<1){mixRun.raf=requestAnimationFrame(frame)}else finish();
  };
  mixRun.raf=requestAnimationFrame(frame);
}

async function smartMix(){
  if(mixRun){cancelSmartMix();return}
  const pair=chooseDecks();
  if(!pair)return notify("Start eerst Deck A of Deck B; SMART MIX mixt daarna naar het andere deck");
  const {source,target}=pair;
  if(!deckLoaded(target))return notify("Laad eerst een track in Deck "+target);

  const button=$("smartMixButton");
  button.classList.add("active");button.textContent="■ CANCEL MIX";
  mixRun={source,target,cancelled:false};

  try{
    await analyzeDeck(source,false);
    await analyzeDeck(target,false);
    if(!mixRun||mixRun.cancelled)return;

    if(isPlaying(target))document.querySelector('[data-action="play"][data-deck="'+target+'"]').click();

    const sourceBpm=displayedBpm(source);
    if(!sourceBpm)throw new Error("Geen BPM gevonden voor Deck "+source);

    if(!setPitchForBpm(target,sourceBpm))throw new Error("BPM-verschil is te groot voor de huidige pitch-range");

    const targetOffset=gridOffset(target)??0;
    seekDeck(target,targetOffset);

    const sourceLow=Number($("low"+source).value||0);
    const targetLow=Number($("low"+target).value||0);
    mixRun.sourceLow=sourceLow;mixRun.targetLow=targetLow;
    setRange("low"+target,-12);

    const xfade=$("crossfader");
    const startX=Number(xfade.value||0);
    const targetX=target==="A"?-1:1;
    const bars=Number($("smartMixBars").value||8);
    const transitionSec=bars*4*60/sourceBpm;
    const delaySec=nextBarDelay(source);
    $("smartMixStatus").textContent="WACHT OP VOLGENDE MAAT · "+delaySec.toFixed(1)+"s";

    mixRun.cancelStart=preciseTimeout(()=>{
      if(!mixRun||mixRun.cancelled)return;
      const play=document.querySelector('[data-action="play"][data-deck="'+target+'"]');
      play.click();
      notify("SMART MIX · beat-sync gestart "+source+" → "+target);
      animateTransition(source,target,transitionSec,startX,targetX,sourceLow,targetLow);
    },delaySec*1000);
  }catch(err){
    cancelSmartMix(err.message||"SMART MIX kon niet starten");
  }
}

function injectStyles(){
  const style=document.createElement("style");
  style.textContent=`
    .smart-mix-console{display:flex;align-items:center;gap:6px;flex-wrap:wrap;justify-content:center}
    .smart-mix-button{height:30px;padding:0 12px;border:1px solid rgba(125,255,118,.45);background:linear-gradient(180deg,rgba(125,255,118,.13),rgba(125,255,118,.04));color:#9dff98;border-radius:8px;font-size:8px;font-weight:1000;letter-spacing:.1em;box-shadow:0 0 18px rgba(125,255,118,.08)}
    .smart-mix-button.active{color:#fff;border-color:#ff5b73;background:rgba(255,91,115,.13);box-shadow:0 0 20px rgba(255,91,115,.12)}
    .smart-mix-bars{height:30px;border:1px solid #29323d;background:#0d1218;color:#9ba8b4;border-radius:8px;padding:0 6px;font-size:7px;font-weight:900}
    .smart-mix-status{flex-basis:100%;font-size:6px;color:#687581;letter-spacing:.08em;text-align:center;white-space:nowrap}
    .smart-auto-grid{border-color:rgba(34,230,255,.28)!important;color:#8cefff!important}
  `;
  document.head.appendChild(style);
}

function init(){
  injectStyles();
  ["A","B"].forEach(id=>{
    const pitch=$("pitch"+id);
    if(pitch){pitch.min="-16";pitch.max="16"}
    const controls=document.querySelector('[data-performance="'+id+'"] .beatgrid-controls');
    if(controls&&!controls.querySelector(".smart-auto-grid")){
      const b=document.createElement("button");
      b.className="smart-auto-grid";
      b.textContent="AUTO GRID";
      b.title="Analyseer BPM en eerste beat automatisch";
      b.onclick=async()=>{
        b.disabled=true;
        try{await analyzeDeck(id,true)}catch(err){notify(err.message)}finally{b.disabled=false}
      };
      controls.appendChild(b);
    }
  });

  const host=document.querySelector(".wave-center-info");
  if(host){
    host.innerHTML='<div class="smart-mix-console"><button id="smartMixButton" class="smart-mix-button">⚡ SMART MIX</button><select id="smartMixBars" class="smart-mix-bars" title="Lengte automatische overgang"><option value="4">4 BARS</option><option value="8" selected>8 BARS</option><option value="16">16 BARS</option></select><span id="smartMixStatus" class="smart-mix-status">AUTO GRID · BPM SYNC · BAR START · BASS SWAP</span></div>';
    $("smartMixButton").onclick=smartMix;
  }
}

if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});
else init();

})();
