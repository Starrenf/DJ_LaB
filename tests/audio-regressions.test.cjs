const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');

// Run the real application in an isolated DOM/audio harness. No test hooks ship.
function harness(){
  class Element{
    constructor(){this.value='0';this.style={};this.width=1800;this.height=92;this.dataset={};this.children=[];this.events={};this.classes=new Set();this.attributes={};
      this.classList={add:k=>this.classes.add(k),remove:k=>this.classes.delete(k),toggle:(k,v)=>v?this.classes.add(k):this.classes.delete(k),contains:k=>this.classes.has(k)};}
    set innerHTML(v){this.html=v;this.children=[];}
    get innerHTML(){return this.html||'';}
    appendChild(v){this.children.push(v);}
    setAttribute(k,v){this.attributes[k]=v;}
    addEventListener(k,v){this.events[k]=v;}
    querySelector(){return new Element();}
    querySelectorAll(){return [];}
    getContext(){return {clearRect(){},fillRect(){}};}
    setPointerCapture(){}
  }
  const elements=new Map(),selectors=new Map(),lists=new Map();
  const element=id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id)};
  element('searchTracks').value='';
  const document={getElementById:element,querySelector:s=>{if(!selectors.has(s))selectors.set(s,new Element());return selectors.get(s)},querySelectorAll:s=>lists.get(s)||[],createElement:()=>new Element(),addEventListener(){}};
  const context={console,document,window:{addEventListener(){}},localStorage:{getItem:()=>null,setItem(){}},requestAnimationFrame(){},setTimeout(){},clearTimeout(){},setInterval(){},clearInterval(){}};
  const source=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
  vm.runInNewContext(source.replace(/\}\)\(\);\s*$/,`globalThis.api={Deck,deckA,deckB,tracks,historyEntries,setAudio:value=>ctx=value};})();`),context);
  const audio={state:'running',currentTime:0,decodeAudioData:async()=>buffer(),createBufferSource:()=>({playbackRate:{},connect(){},disconnect(){},start(){},stop(){}})};
  context.api.setAudio(audio);
  for(const d of [context.api.deckA,context.api.deckB]){
    d.buffer=buffer();d.bpm=120;
    d.nodes={input:{},low:{gain:{value:0}},mid:{gain:{value:0}},high:{gain:{value:0}},channel:{gain:{value:1}},filter:{type:'lowpass',frequency:{value:20000}},delay:{delayTime:{value:.28}},delayWet:{gain:{value:0}},feedback:{gain:{value:.28}},revWet:{gain:{value:0}},xf:{gain:{setTargetAtTime(){}}}};
  }
  return {...context.api,audio,element,document,lists};
}
function buffer(duration=180){return {duration,getChannelData:()=>new Float32Array(1000)}};
function close(actual,expected){assert.ok(Math.abs(actual-expected)<1e-8,`${actual} != ${expected}`);}

test('quantize defaults off and requires a manually aligned beatgrid',()=>{
  const {deckA:d}=harness();assert.equal(d.quantize,false);
  d.toggleQuantize();assert.equal(d.quantize,false);
  d.setBeatOffset(.23);d.toggleQuantize();assert.equal(d.quantize,true);
  close(d.quantizeTime(1.20),1.23);
  d.toggleQuantize();close(d.quantizeTime(1.20),1.20);
});
test('all supported beat loops keep buffer lengths independent of pitch',()=>{
  const {deckA:d}=harness();
  for(const rate of [.9,1,1.1])for(const beats of [.5,1,2,4,8,16,32,64]){
    d.loopBeats=0;d.offset=10;d.rate=rate;d.toggleLoop(beats);
    const s=d.sourceAt(10);assert.equal(s.loop,true);close(s.loopEnd-s.loopStart,beats*.5);
  }
});
test('playhead wraps across multiple loop cycles at changed pitch',()=>{
  const {deckA:d,audio}=harness();d.offset=10;d.rate=1.1;d.toggleLoop(4);d.play();
  audio.currentTime=7;close(d.current(),11.7);
  d.setRate(.9);close(d.current(),11.7);
  audio.currentTime=8;close(d.current(),10.6);
});
test('loop OFF preserves the exact audible position even with quantize enabled',()=>{
  const {deckA:d,audio}=harness();d.setBeatOffset(0);d.toggleQuantize();d.offset=10;d.toggleLoop(4);d.play();
  audio.currentTime=.24;d.toggleLoop(4);close(d.offset,10.24);assert.equal(d.source.loop,undefined);
});
test('loop boundaries survive pause and resume',()=>{
  const {deckA:d,audio}=harness();d.offset=10;d.toggleLoop(4);d.play();audio.currentTime=1.4;d.pause(false);d.play();
  close(d.source.loopStart,10);close(d.source.loopEnd,12);close(d.offset,11.4);
});
test('loops reject missing BPM and insufficient remaining audio',()=>{
  const {deckA:d}=harness();d.bpm=null;d.toggleLoop(4);assert.equal(d.loopBeats,0);
  d.bpm=120;d.offset=179.8;d.toggleLoop(4);assert.equal(d.loopBeats,0);
});
test('beat jump outside a loop exits it; a jump to track end stops safely',()=>{
  const {deckA:d}=harness();d.offset=10;d.toggleLoop(4);d.play();d.beatJump(8);
  assert.equal(d.loopBeats,0);close(d.current(),14);
  d.beatJump(1000);assert.equal(d.playing,false);close(d.offset,180);
  d.play();assert.equal(d.playing,true);close(d.current(),0);
});
test('releasing any FX restores the neutral filter and original delay',()=>{
  const {deckA:d}=harness();
  for(let i=0;i<8;i++){d.applyPadFx(i,true);d.applyPadFx(i,false);close(d.nodes.filter.frequency.value,20000);close(d.nodes.delay.delayTime.value,.28);}
});
test('releasing one held pad preserves other pads and updated slider values',()=>{
  const {deckA:d,element}=harness();d.applyPadFx(1,true);d.applyPadFx(4,true);d.applyPadFx(4,false);
  close(d.nodes.revWet.gain.value,.78);close(d.nodes.low.gain.value,0);
  element('lowA').value='6';d.refreshPadFx();d.applyPadFx(1,false);
  close(d.nodes.low.gain.value,6);close(d.nodes.revWet.gain.value,0);
});
test('multiple pointers on one pad release independently and cleanup is idempotent',()=>{
  const {deckA:d}=harness();d.applyPadFx(1,true,'p1');d.applyPadFx(1,true,'p2');d.applyPadFx(1,false,'p1');
  close(d.nodes.revWet.gain.value,.78);d.clearPadFx();d.applyPadFx(1,false,'p2');close(d.nodes.revWet.gain.value,0);
});
test('changing pad modes clears held FX; keyboard hold releases restore audio',()=>{
  const {deckA:d,element}=harness();d.setPadMode('fx');const pad=element('performancePadsA').children[1];
  const e={key:' ',repeat:false,preventDefault(){}};pad.onkeydown(e);close(d.nodes.revWet.gain.value,.78);
  pad.onkeyup(e);close(d.nodes.revWet.gain.value,0);
  pad.onkeydown(e);d.setPadMode('hotcue');close(d.nodes.revWet.gain.value,0);
});
test('old loop buttons and performance pads render the same active state',()=>{
  const {deckA:d,element,lists}=harness();d.setPadMode('loop');const pad=element('performancePadsA').children[3];
  const old={dataset:{loop:'4'},classList:{toggle:(k,v)=>old.active=v},setAttribute(){}};
  lists.set('[data-loop][data-deck="A"], #performancePadsA [data-loop-pad]',[old,pad]);
  d.toggleLoop(4);assert.equal(old.active,true);assert.equal(pad.classes.has('active'),true);
  d.toggleLoop(4);assert.equal(old.active,false);assert.equal(pad.classes.has('active'),false);
});
test('CUE preview release and CUE + PLAY takeover retain their semantics',()=>{
  const {deckA:d,audio}=harness();d.cueDown();assert.equal(d.playing,true);audio.currentTime=.3;d.cueUp();assert.equal(d.playing,false);close(d.offset,0);
  d.cueDown();d.play();d.cueUp();assert.equal(d.playing,true);assert.equal(d.cuePreview,false);
});
test('failed or superseded decodes never replace a playing track',async()=>{
  const {deckA:d,audio}=harness();const original={title:'original'};d.track=original;d.play();
  audio.decodeAudioData=async()=>{throw Error('invalid')};await d.load({file:{arrayBuffer:async()=>new ArrayBuffer(1)}});
  assert.equal(d.track,original);assert.equal(d.playing,true);
  const pending=[];audio.decodeAudioData=()=>new Promise(resolve=>pending.push(resolve));
  const t=title=>({title,file:{arrayBuffer:async()=>new ArrayBuffer(1)}});
  const first=d.load(t('first'));const second=d.load(t('second'));await new Promise(resolve=>setImmediate(resolve));
  pending[1](buffer());await second;pending[0](buffer());await first;assert.equal(d.track.title,'second');
});
test('history records playback, not merely loading; hot cues persist for the session',async()=>{
  const {deckA:d,historyEntries}=harness();const track={title:'track',file:{arrayBuffer:async()=>new ArrayBuffer(1)}};
  await d.load(track);assert.equal(historyEntries.length,0);d.hotCue(7,false);d.hotCue(7,false);
  assert.equal(historyEntries.length,1);d.pause(false);await d.load(track);assert.equal(d.hotCues[7],0);
});
