// Optional integration test: install Playwright and Chromium, then npm run test:browser.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');

function wav(duration){
  const rate=16000,n=duration*rate,b=Buffer.alloc(44+n*2);
  b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);
  b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(rate,24);b.writeUInt32LE(rate*2,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(n*2,40);
  for(let i=0;i<n;i++){const t=i/rate,pulse=((t-.23)% .5+.5)% .5<.07?1:.2;b.writeInt16LE(Math.round(Math.sin(t*2*Math.PI*440)*7000*pulse),44+i*2);}
  return b;
}
async function run(){
  const root=path.join(__dirname,'..');
  const server=http.createServer((req,res)=>{
    const file=({'/':'index.html','/styles.css':'styles.css','/app.js':'app.js'})[req.url];
    if(!file){res.writeHead(204);res.end();return;}
    res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');
    res.end(fs.readFileSync(path.join(root,file)));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  let browser;
  try{
    browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
    const page=await browser.newPage({viewport:{width:1600,height:1200}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
    // Inspection is injected into the test response only; production has no hooks.
    await page.route('**/app.js',async route=>{
      const source=fs.readFileSync(path.join(root,'app.js'),'utf8');
      await route.fulfill({contentType:'text/javascript',body:source.replace(/\}\)\(\);\s*$/,`window.__dj={deckA,deckB,historyEntries,audio:()=>ctx,master:()=>master,recorder:()=>recorder,mic:()=>micChannel};})();`)});
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    assert.equal(await page.locator('.performance-pad').count(),16);
    assert.equal(await page.locator('[data-monitor]:disabled').count(),3);
    await page.locator('#filePicker').setInputFiles([{name:'short.wav',mimeType:'audio/wav',buffer:wav(20)},{name:'long.wav',mimeType:'audio/wav',buffer:wav(40)}]);
    await page.locator('.track').nth(0).locator('.row-load button').nth(1).click();
    await page.waitForFunction(()=>window.__dj.deckA.buffer);
    await page.locator('.track').nth(1).locator('.row-load button').nth(2).click();
    await page.waitForFunction(()=>window.__dj.deckB.buffer);
    assert.equal(await page.evaluate(()=>window.__dj.historyEntries.length),0);
    for(const id of ['A','B']){
      await page.locator('#bpm'+id).fill('120');await page.locator('#bpm'+id).dispatchEvent('change');
      await page.locator('#gridOffset'+id).fill('0.230');await page.locator('#gridOffset'+id).dispatchEvent('change');
      await page.locator(`[data-action="quantize"][data-deck="${id}"]`).click();
      await page.locator(`[data-action="play"][data-deck="${id}"]`).click();
    }
    await page.waitForTimeout(250);
    assert.equal(await page.evaluate(()=>window.__dj.deckA.playing&&window.__dj.deckB.playing&&window.__dj.audio().state==='running'),true);
    assert.equal(await page.evaluate(()=>window.__dj.historyEntries.length),2);
    // Confirm a live audio signal reaches the master bus, not just PLAYING text.
    const rms=await page.evaluate(async()=>{
      const a=window.__dj.audio().createAnalyser();window.__dj.master().connect(a);
      await new Promise(resolve=>setTimeout(resolve,100));const v=new Float32Array(a.fftSize);a.getFloatTimeDomainData(v);window.__dj.master().disconnect(a);
      return Math.sqrt(v.reduce((s,x)=>s+x*x,0)/v.length);
    });assert.ok(rms>.001,'master must contain decoded audio');
    await page.locator('[data-pad-mode="loop"][data-deck="A"]').click();
    await page.locator('#performancePadsA .performance-pad').nth(0).click();
    await page.locator('#pitchA').evaluate(el=>{el.value='10';el.dispatchEvent(new Event('input',{bubbles:true}))});
    await page.waitForTimeout(700);
    const loop=await page.evaluate(()=>{const d=window.__dj.deckA;return {position:d.current(),start:d.source.loopStart,end:d.source.loopEnd}});
    assert.ok(Math.abs(loop.end-loop.start-.25)<1e-7);assert.ok(loop.position>=loop.start&&loop.position<loop.end);
    await page.locator('[data-loop="4"][data-deck="A"]').click();
    assert.equal(await page.locator('#performancePadsA [data-loop-pad="4"]').getAttribute('aria-pressed'),'true');
    await page.locator('[data-pad-mode="fx"][data-deck="A"]').click();
    const pad=page.locator('#performancePadsA .performance-pad').nth(1);await pad.focus();await page.keyboard.down('Space');
    assert.equal(await page.evaluate(()=>window.__dj.deckA.nodes.revWet.gain.value),Math.fround(.78));
    await page.keyboard.up('Space');
    assert.equal(await page.evaluate(()=>window.__dj.deckA.nodes.filter.frequency.value),20000);
    assert.equal(await page.evaluate(()=>window.__dj.deckA.nodes.revWet.gain.value),0);
    // CUE preview and takeover through actual pointer events, including release outside.
    await page.evaluate(()=>{const d=window.__dj.deckB;d.pause(false);d.seek(0)});
    const cue=page.locator('[data-action="cue"][data-deck="B"]');await cue.scrollIntoViewIfNeeded();const box=await cue.boundingBox();
    await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();
    assert.equal(await page.evaluate(()=>window.__dj.deckB.playing),true);
    await page.mouse.move(5,5);await page.mouse.up();assert.equal(await page.evaluate(()=>window.__dj.deckB.playing),false);
    await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();
    await page.evaluate(()=>document.querySelector('[data-action="play"][data-deck="B"]').click());
    await page.mouse.up();assert.equal(await page.evaluate(()=>window.__dj.deckB.playing),true);
    // Real Web Audio microphone routing with a deterministic synthetic input.
    await page.evaluate(()=>{
      navigator.mediaDevices.getUserMedia=async()=>{const c=window.__dj.audio(),o=c.createOscillator(),g=c.createGain(),dest=c.createMediaStreamDestination();g.gain.value=.3;o.connect(g).connect(dest);o.start();return dest.stream;};
      const e=document.getElementById('talkoverSensitivity');e.value='.01';
    });
    await page.locator('#micToggle').click();await page.waitForFunction(()=>document.getElementById('micStatus').textContent==='MIC LIVE');
    await page.waitForFunction(()=>window.__dj.deckA.nodes.duck.gain.value<.9);
    await page.locator('#micMute').click();await page.waitForFunction(()=>window.__dj.deckA.nodes.duck.gain.value>.95);
    await page.locator('#micMute').click();await page.locator('#talkoverToggle').click();
    await page.waitForFunction(()=>window.__dj.deckA.nodes.duck.gain.value>.95);
    await page.locator('#samplerGrid input').first().setInputFiles({name:'sample.wav',mimeType:'audio/wav',buffer:wav(2)});
    await page.waitForFunction(()=>document.querySelector('.sample-pad.loaded'));
    await page.locator('.sample-pad.loaded').first().click();await page.locator('#stopSamples').click();
    await page.locator('#recordToggle').click();await page.waitForTimeout(1100);await page.locator('#recordToggle').click();
    await page.waitForFunction(()=>!document.getElementById('recordDownload').hidden);
    const recording=await page.evaluate(async()=>{
      const blob=await (await fetch(document.getElementById('recordDownload').href)).blob();
      const decoded=await window.__dj.audio().decodeAudioData(await blob.arrayBuffer());const v=decoded.getChannelData(0);
      return {bytes:blob.size,duration:decoded.duration,rms:Math.sqrt(v.reduce((s,x)=>s+x*x,0)/v.length)};
    });assert.ok(recording.bytes>100);assert.ok(recording.duration>.8);assert.ok(recording.rms>.001);
    await page.locator('#micToggle').click();assert.equal(await page.locator('#micStatus').textContent(),'MIC OFF');
    await page.locator('[data-library-view="prepare"]').click();await page.locator('[data-library-view="collection"]').click();
    await page.locator('.track').first().locator('.prepare').click();await page.locator('[data-library-view="prepare"]').click();
    assert.equal(await page.locator('.track').count(),1);
    await page.locator('[data-library-view="history"]').click();assert.ok(await page.locator('.track').count()>=2);
    if(process.env.SCREENSHOT_PATH)await page.screenshot({path:process.env.SCREENSHOT_PATH,fullPage:true});
    assert.deepEqual(errors,[]);
    console.log('PASS: Chromium real audio playback, loop/pitch, pads, CUE, synthetic mic/talkover, sampler, decoded recording, Prepare/History; no browser errors.');
  }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
}
run().catch(e=>{console.error(e);process.exitCode=1});
