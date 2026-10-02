(function(){
"use strict";
const $=id=>document.getElementById(id);
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const fmt=s=>{s=Math.max(0,Number(s)||0);const m=Math.floor(s/60),r=s-m*60;return String(m).padStart(2,"0")+":"+r.toFixed(1).padStart(4,"0")};
let ctx=null,master=null,samplerGain=null,selectedPlaylist="all";
const tracks=new Map(), playlists=new Map([["Warm-up",[]],["Main set",[]],["Closing",[]]]);
const samples=Array.from({length:8},(_,i)=>({name:"Sample "+(i+1),buffer:null,sources:new Set()}));

function toast(t){const e=$("toast");e.textContent=t;e.classList.add("show");clearTimeout(toast.t);toast.t=setTimeout(()=>e.classList.remove("show"),2200)}
function ensureAudio(){
  if(!ctx){
    ctx=new (window.AudioContext||window.webkitAudioContext)({latencyHint:"interactive"});
    master=ctx.createGain(); master.gain.value=Number($("masterVol").value); master.connect(ctx.destination);
    samplerGain=ctx.createGain(); samplerGain.gain.value=Number($("samplerVol").value); samplerGain.connect(master);
    deckA.init(); deckB.init();
  }
  if(ctx.state==="suspended") ctx.resume();
  $("audioStatus").classList.add("live"); $("audioStatus").innerHTML="<i></i> AUDIO READY";
}
function impulse(){
  const len=Math.floor(ctx.sampleRate*1.4),b=ctx.createBuffer(2,len,ctx.sampleRate);
  for(let c=0;c<2;c++){const d=b.getChannelData(c);for(let i=0;i<len;i++)d[i]=(Math.random()*2-1)*Math.pow(1-i/len,2.7)}
  return b;
}
class Deck{
  constructor(id){
    this.id=id;this.buffer=null;this.track=null;this.source=null;this.playing=false;this.offset=0;this.startedAt=0;this.rate=1;this.bpm=null;this.cue=0;this.cueHeld=false;this.cuePreview=false;this.cueTakeover=false;this.loopBeats=0;this.nodes=null;this.peaks=[];
  }
  init(){
    if(this.nodes)return;
    const input=ctx.createGain(),low=ctx.createBiquadFilter(),mid=ctx.createBiquadFilter(),high=ctx.createBiquadFilter(),filter=ctx.createBiquadFilter();
    low.type="lowshelf";low.frequency.value=250;mid.type="peaking";mid.frequency.value=1200;mid.Q.value=.7;high.type="highshelf";high.frequency.value=5000;filter.type="lowpass";filter.frequency.value=20000;
    const dry=ctx.createGain(),delay=ctx.createDelay(1.5),feedback=ctx.createGain(),delayWet=ctx.createGain(),conv=ctx.createConvolver(),revWet=ctx.createGain(),channel=ctx.createGain(),xf=ctx.createGain();
    delay.delayTime.value=.28;feedback.gain.value=.28;delayWet.gain.value=0;conv.buffer=impulse();revWet.gain.value=0;channel.gain.value=.9;xf.gain.value=Math.SQRT1_2;
    input.connect(low).connect(mid).connect(high).connect(filter);
    filter.connect(dry).connect(channel);filter.connect(delay).connect(delayWet).connect(channel);delay.connect(feedback).connect(delay);filter.connect(conv).connect(revWet).connect(channel);
    channel.connect(xf).connect(master);
    this.nodes={input,low,mid,high,filter,delay,feedback,delayWet,conv,revWet,channel,xf};
  }
  current(){if(!this.buffer)return 0;if(!this.playing)return this.offset;return clamp(this.offset+(ctx.currentTime-this.startedAt)*this.rate,0,this.buffer.duration)}
  async load(track){
    ensureAudio(); if(this.playing)this.pause(false);
    const arr=await track.file.arrayBuffer();
    try{this.buffer=await ctx.decodeAudioData(arr.slice(0))}catch(e){toast("Audio kon niet worden gelezen");return}
    this.track=track;this.offset=0;this.cue=0;this.rate=1;this.bpm=track.bpm||null;this.loopBeats=0;
    $("title"+this.id).textContent=track.title;$("artist"+this.id).textContent="Local file";$("bpm"+this.id).value=this.bpm?this.bpm.toFixed(1):"";$("pitch"+this.id).value=0;$("state"+this.id).textContent="READY";
    document.querySelector(".deck-"+this.id.toLowerCase()+" .wave-wrap").classList.add("has-track");this.makePeaks();this.draw();this.update();
    toast(track.title+" geladen in Deck "+this.id);
  }
  sourceAt(pos){
    const s=ctx.createBufferSource();s.buffer=this.buffer;s.playbackRate.value=this.rate;s.connect(this.nodes.input);
    if(this.loopBeats&&this.bpm){const len=this.loopBeats*60/(this.bpm*this.rate);s.loop=true;s.loopStart=pos;s.loopEnd=Math.min(this.buffer.duration,pos+len)}
    s.onended=()=>{if(this.source===s&&!s.loop){this.playing=false;this.offset=0;this.source=null;this.update()}};
    return s;
  }
  play(){
    if(!this.buffer)return toast("Laad eerst een track");ensureAudio();

    // DJ-style CUE + PLAY takeover:
    // while CUE preview is playing, pressing PLAY latches playback.
    if(this.cueHeld&&this.cuePreview&&this.playing){
      this.cueTakeover=true;
      this.cuePreview=false;
      this.update();
      return;
    }

    if(this.playing){this.pause(false);return}
    if(this.offset>=this.buffer.duration-.02)this.offset=0;
    this.source=this.sourceAt(this.offset);this.startedAt=ctx.currentTime;this.source.start(0,this.offset);this.playing=true;this.update();
  }
  pause(resetCue){
    if(!this.playing)return;const now=this.current();try{this.source.stop()}catch(e){}this.source=null;this.playing=false;this.offset=resetCue?this.cue:now;this.update();
  }
  seek(t){if(!this.buffer)return;const was=this.playing;if(was)this.pause(false);this.offset=clamp(t,0,this.buffer.duration);if(was)this.play();this.draw();this.update()}
  cueDown(){
    if(!this.buffer)return;
    this.cueHeld=true;
    this.cueTakeover=false;

    // During normal playback: return to the stored cue and stop there.
    if(this.playing&&!this.cuePreview){
      this.pause(true);
      this.offset=this.cue;
      this.draw();
      toast("Terug naar CUE "+fmt(this.cue));
      return;
    }

    // While paused away from the stored cue: set a new cue point.
    if(!this.playing&&Math.abs(this.offset-this.cue)>.06){
      this.cue=this.offset;
      this.draw();
      this.update();
      toast("CUE gezet op "+fmt(this.cue));
      return;
    }

    // While paused exactly at CUE: hold-to-preview.
    if(!this.playing){
      this.offset=this.cue;
      this.cuePreview=true;
      if(this.offset>=this.buffer.duration-.02)this.offset=this.cue=0;
      this.source=this.sourceAt(this.offset);
      this.startedAt=ctx.currentTime;
      this.source.start(0,this.offset);
      this.playing=true;
      this.update();
    }
  }
  cueUp(){
    this.cueHeld=false;

    // PLAY was pressed while holding CUE: keep playing.
    if(this.cueTakeover){
      this.cueTakeover=false;
      this.cuePreview=false;
      this.update();
      return;
    }

    // Normal CUE preview: stop and snap back to the cue point.
    if(this.cuePreview){
      this.cuePreview=false;
      if(this.playing){
        try{this.source.stop()}catch(e){}
        this.source=null;
        this.playing=false;
      }
      this.offset=this.cue;
      this.update();
      this.draw();
    }
  }
  setRate(r){r=clamp(r,.8,1.2);const t=this.current(),was=this.playing;if(was)this.pause(false);this.rate=r;this.offset=t;if(was)this.play();$("pitch"+this.id).value=((r-1)*100).toFixed(1);if(this.bpm)$("bpm"+this.id).value=(this.bpm*r).toFixed(1)}
  sync(other){if(!this.bpm||!other.bpm)return toast("BPM ontbreekt");this.setRate((other.bpm*other.rate)/this.bpm);document.querySelector('[data-action="sync"][data-deck="'+this.id+'"]').classList.add("active")}
  toggleLoop(n){this.loopBeats=this.loopBeats===n?0:n;document.querySelectorAll('[data-loop][data-deck="'+this.id+'"]').forEach(b=>b.classList.toggle("active",Number(b.dataset.loop)===this.loopBeats));if(this.playing){const t=this.current();this.pause(false);this.offset=t;this.play()}}
  makePeaks(){const data=this.buffer.getChannelData(0),bins=220,step=Math.max(1,Math.floor(data.length/bins));this.peaks=[];for(let i=0;i<bins;i++){let m=0;const a=i*step,b=Math.min(data.length,a+step);for(let j=a;j<b;j+=Math.max(1,Math.floor(step/60)))m=Math.max(m,Math.abs(data[j]));this.peaks.push(m)}}
  draw(){
    const c=$("wave"+this.id),g=c.getContext("2d"),w=c.width,h=c.height;g.clearRect(0,0,w,h);g.fillStyle="#070a0f";g.fillRect(0,0,w,h);
    if(!this.peaks.length)return;
    const prog=this.buffer?this.current()/this.buffer.duration:0,accent=this.id==="A"?"#22e6ff":"#ff3bbd";
    const bw=w/this.peaks.length;for(let i=0;i<this.peaks.length;i++){const ph=this.peaks[i]*h*.82;g.fillStyle=(i/this.peaks.length)<=prog?accent:"#34404c";g.fillRect(i*bw,(h-ph)/2,Math.max(1,bw-1),ph)}
    if(this.buffer){const x=(this.cue/this.buffer.duration)*w;g.fillStyle="#ffcf4a";g.fillRect(x-1,0,2,h)}
  }
  update(){
    const t=this.current(),dur=this.buffer?this.buffer.duration:0;$("time"+this.id).textContent=fmt(t);$("remain"+this.id).textContent="-"+fmt(Math.max(0,dur-t));
    $("state"+this.id).textContent=this.playing?"PLAYING":(this.buffer?"READY":"EMPTY");
    const p=document.querySelector('[data-action="play"][data-deck="'+this.id+'"]');p.classList.toggle("active",this.playing);p.textContent=this.playing?"Ⅱ PAUSE":"▶ PLAY";
    $("jog"+this.id).classList.toggle("playing",this.playing);if(this.buffer)this.draw();
  }
}
const deckA=new Deck("A"),deckB=new Deck("B");

function updateCross(){
  if(!ctx||!deckA.nodes||!deckB.nodes)return;const x=Number($("crossfader").value),a=Math.sqrt((1-x)/2),b=Math.sqrt((1+x)/2);deckA.nodes.xf.gain.setTargetAtTime(a,ctx.currentTime,.01);deckB.nodes.xf.gain.setTargetAtTime(b,ctx.currentTime,.01)
}
function updateChannel(id){
  if(!ctx)return;const d=id==="A"?deckA:deckB,n=d.nodes;if(!n)return;
  n.low.gain.value=Number($("low"+id).value);n.mid.gain.value=Number($("mid"+id).value);n.high.gain.value=Number($("high"+id).value);n.channel.gain.value=Number($("gain"+id).value)*Number($("vol"+id).value)
}
function updateFx(id){
  if(!ctx)return;const d=id==="A"?deckA:deckB,n=d.nodes;if(!n)return;const f=Number($("filter"+id).value);
  if(f>=0){n.filter.type="lowpass";n.filter.frequency.value=400+Math.pow(f,2)*19600}else{n.filter.type="highpass";n.filter.frequency.value=30+Math.pow(-f,2)*5000}
  const e=Number($("echo"+id).value),r=Number($("reverb"+id).value);n.delayWet.gain.value=e*.75;n.feedback.gain.value=.18+e*.5;n.revWet.gain.value=r*.7
}
function trackTitle(file){return file.name.replace(/\.[^.]+$/,"").replace(/[_-]+/g," ")}
async function addFiles(list){
  for(const f of Array.from(list||[])){if(!f.type.startsWith("audio/")&&!/\.(mp3|wav|m4a|aac|ogg)$/i.test(f.name))continue;const id=crypto.randomUUID?crypto.randomUUID():String(Date.now()+Math.random());tracks.set(id,{id,file:f,title:trackTitle(f),bpm:null,duration:null})}
  renderLibrary();
}
function renderLibrary(){
  const rows=$("trackRows"),q=$("searchTracks").value.toLowerCase();rows.innerHTML="";let arr=[...tracks.values()];
  if(selectedPlaylist!=="all"){const ids=playlists.get(selectedPlaylist)||[];arr=arr.filter(t=>ids.includes(t.id))}
  arr=arr.filter(t=>t.title.toLowerCase().includes(q));$("allCount").textContent=tracks.size;$("libraryTitle").textContent=selectedPlaylist==="all"?"Alle tracks":selectedPlaylist;
  if(!arr.length){rows.innerHTML='<div class="empty-library">Nog geen tracks. Voeg lokale audio toe.</div>'}
  arr.forEach((t,i)=>{const r=document.createElement("div");r.className="track-row track";r.draggable=true;r.innerHTML='<span>'+(i+1)+'</span><span class="track-name"><strong>'+esc(t.title)+'</strong><small>Local file</small></span><span class="track-bpm">'+(t.bpm?t.bpm.toFixed(1):'<button>ANALYZE</button>')+'</span><span>--:--</span><span><select class="playlist-select"><option value="">+ playlist</option>'+[...playlists.keys()].map(n=>'<option>'+esc(n)+'</option>').join("")+'</select></span><span class="row-load"><button>A</button><button>B</button></span>';
    r.addEventListener("dragstart",e=>e.dataTransfer.setData("text/hp-track",t.id));const btns=r.querySelectorAll(".row-load button");btns[0].onclick=()=>deckA.load(t);btns[1].onclick=()=>deckB.load(t);
    const an=r.querySelector(".track-bpm button");if(an)an.onclick=()=>analyze(t);r.querySelector(".playlist-select").onchange=e=>{const n=e.target.value;if(n){const a=playlists.get(n);if(!a.includes(t.id))a.push(t.id);savePlaylists();toast("Toegevoegd aan "+n)}e.target.value=""};rows.appendChild(r)
  });
  renderPlaylists();
}
function esc(s){return String(s).replace(/[&<>"]/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[m]))}
function savePlaylists(){localStorage.setItem("hp-dj-playlists",JSON.stringify(Object.fromEntries(playlists)))}
function renderPlaylists(){
  const box=$("playlistList");box.innerHTML="";for(const [n,a] of playlists){const b=document.createElement("button");b.className="playlist"+(selectedPlaylist===n?" active":"");b.innerHTML="♪ "+esc(n)+" <span>"+a.length+"</span>";b.onclick=()=>{selectedPlaylist=n;renderLibrary()};box.appendChild(b)}
  document.querySelector('[data-playlist="all"]').classList.toggle("active",selectedPlaylist==="all")
}
async function analyze(t){
  ensureAudio();toast("BPM analyseren…");const buf=await ctx.decodeAudioData((await t.file.arrayBuffer()).slice(0)),d=buf.getChannelData(0),rate=buf.sampleRate,step=Math.floor(rate/200),env=[];
  for(let i=0;i<d.length;i+=step){let s=0;for(let j=i;j<Math.min(d.length,i+step);j++)s+=Math.abs(d[j]);env.push(s/step)}
  let best=0,bpm=120;for(let b=70;b<=160;b++){const lag=Math.max(1,Math.round((60/b)*200)),limit=Math.min(env.length-lag,5000);let c=0;for(let i=0;i<limit;i++)c+=env[i]*env[i+lag];if(c>best){best=c;bpm=b}}
  t.bpm=bpm;if(deckA.track===t){deckA.bpm=bpm;$("bpmA").value=bpm.toFixed(1)}if(deckB.track===t){deckB.bpm=bpm;$("bpmB").value=bpm.toFixed(1)}renderLibrary();toast("BPM ≈ "+bpm)
}
function renderSampler(){
  const g=$("samplerGrid");g.innerHTML="";samples.forEach((s,i)=>{const cell=document.createElement("div");cell.className="sample-cell";cell.innerHTML='<button class="sample-pad '+(s.buffer?"loaded":"")+'"><span class="sample-number">'+(i+1)+'</span><strong>'+esc(s.name)+'</strong><small>'+(s.buffer?"TRIGGER":"EMPTY")+'</small></button><label class="sample-load">LOAD<input type="file" accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg"></label>';
    cell.querySelector(".sample-pad").onclick=()=>triggerSample(i);cell.querySelector("input").onchange=e=>loadSample(i,e.target.files[0]);cell.ondragover=e=>{e.preventDefault();cell.classList.add("dragover")};cell.ondragleave=()=>cell.classList.remove("dragover");cell.ondrop=e=>{e.preventDefault();cell.classList.remove("dragover");const f=e.dataTransfer.files[0];if(f)loadSample(i,f);else{const id=e.dataTransfer.getData("text/hp-track");if(tracks.has(id))loadSample(i,tracks.get(id).file)}};g.appendChild(cell)})
}
async function loadSample(i,f){if(!f)return;ensureAudio();try{samples[i].buffer=await ctx.decodeAudioData((await f.arrayBuffer()).slice(0));samples[i].name=trackTitle(f);renderSampler();toast("Sample "+(i+1)+" geladen")}catch(e){toast("Sample kon niet worden gelezen")}}
function triggerSample(i){const s=samples[i];if(!s.buffer)return toast("Laad eerst een sample");ensureAudio();const src=ctx.createBufferSource();src.buffer=s.buffer;src.connect(samplerGain);s.sources.add(src);src.onended=()=>{s.sources.delete(src);renderSampler()};src.start();renderSampler()}
function stopSamples(){samples.forEach(s=>{for(const x of s.sources)try{x.stop()}catch(e){}s.sources.clear()});renderSampler()}

function bindDeck(d,other){
  const id=d.id;document.querySelector('[data-action="play"][data-deck="'+id+'"]').onclick=()=>d.play();
  const cue=document.querySelector('[data-action="cue"][data-deck="'+id+'"]');cue.onpointerdown=e=>{e.preventDefault();d.cueDown();cue.classList.add("active")};["pointerup","pointercancel","lostpointercapture"].forEach(ev=>cue.addEventListener(ev,()=>{d.cueUp();cue.classList.remove("active")}));
  document.querySelector('[data-action="sync"][data-deck="'+id+'"]').onclick=()=>d.sync(other);
  document.querySelectorAll('[data-loop][data-deck="'+id+'"]').forEach(b=>b.onclick=()=>d.toggleLoop(Number(b.dataset.loop)));
  $("pitch"+id).oninput=e=>d.setRate(1+Number(e.target.value)/100);$("bpm"+id).onchange=e=>{const shown=Number(e.target.value);if(shown>0){d.bpm=shown/d.rate;if(d.track)d.track.bpm=d.bpm}};
  ["gain","vol","high","mid","low"].forEach(k=>$(k+id).oninput=()=>updateChannel(id));["filter","echo","reverb"].forEach(k=>$(k+id).oninput=()=>updateFx(id));
  const wave=$("wave"+id);wave.onclick=e=>{if(!d.buffer)return;const r=wave.getBoundingClientRect();d.seek(((e.clientX-r.left)/r.width)*d.buffer.duration)};
  const wrap=document.querySelector(".deck-"+id.toLowerCase()+" .wave-wrap");wrap.ondragover=e=>{e.preventDefault();wrap.classList.add("dragover")};wrap.ondragleave=()=>wrap.classList.remove("dragover");wrap.ondrop=e=>{e.preventDefault();wrap.classList.remove("dragover");const tid=e.dataTransfer.getData("text/hp-track");if(tracks.has(tid))d.load(tracks.get(tid));else if(e.dataTransfer.files.length)addFiles(e.dataTransfer.files)};
  const jog=$("jog"+id);let sx=0,st=0;jog.onpointerdown=e=>{if(!d.buffer)return;sx=e.clientX;st=d.current();jog.setPointerCapture(e.pointerId)};jog.onpointermove=e=>{if(jog.hasPointerCapture(e.pointerId))d.seek(st+(e.clientX-sx)*.04)}
}

const saved=JSON.parse(localStorage.getItem("hp-dj-playlists")||"null");if(saved){playlists.clear();Object.entries(saved).forEach(([k,v])=>playlists.set(k,v))}
$("filePicker").onchange=e=>addFiles(e.target.files);$("searchTracks").oninput=renderLibrary;$("crossfader").oninput=updateCross;$("masterVol").oninput=e=>{if(master)master.gain.value=Number(e.target.value);$("settingsMaster").value=e.target.value};$("settingsMaster").oninput=e=>{$("masterVol").value=e.target.value;if(master)master.gain.value=Number(e.target.value)};
$("samplerVol").oninput=e=>{if(samplerGain)samplerGain.gain.value=Number(e.target.value)};$("stopSamples").onclick=stopSamples;$("audioStatus").onclick=ensureAudio;
$("addPlaylist").onclick=()=>{const n=$("playlistName").value.trim();if(!n)return;if(!playlists.has(n))playlists.set(n,[]);$("playlistName").value="";selectedPlaylist=n;savePlaylists();renderLibrary()};
document.querySelector('[data-playlist="all"]').onclick=()=>{selectedPlaylist="all";renderLibrary()};
const drop=$("dropLibrary");["dragenter","dragover"].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.add("dragover")}));["dragleave","drop"].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.remove("dragover")}));drop.ondrop=e=>addFiles(e.dataTransfer.files);
$("settingsBtn").onclick=()=>$("settingsModal").hidden=false;$("closeSettings").onclick=()=>$("settingsModal").hidden=true;$("settingsModal").onclick=e=>{if(e.target===$("settingsModal"))$("settingsModal").hidden=true};
document.querySelectorAll("[data-theme-pick]").forEach(b=>b.onclick=()=>{document.body.dataset.theme=b.dataset.themePick;document.querySelectorAll(".theme").forEach(x=>x.classList.toggle("active",x===b));deckA.draw();deckB.draw()});
$("autoBpm").onclick=async()=>{for(const t of tracks.values())if(!t.bpm)await analyze(t)};
window.addEventListener("keydown",e=>{if(e.repeat||/INPUT|SELECT|TEXTAREA/.test(e.target.tagName))return;const n=Number(e.key);if(n>=1&&n<=8)triggerSample(n-1)});
bindDeck(deckA,deckB);bindDeck(deckB,deckA);renderSampler();renderLibrary();
function loop(){deckA.update();deckB.update();const vals=[deckA,deckB].filter(d=>d.playing&&d.bpm).map(d=>d.bpm*d.rate);$("masterBpm").textContent=vals.length?(vals.reduce((a,b)=>a+b,0)/vals.length).toFixed(1)+" BPM":"--.- BPM";requestAnimationFrame(loop)}loop();
})();