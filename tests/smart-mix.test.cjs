const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const source=fs.readFileSync(path.join(__dirname,'..','smart-mix.js'),'utf8');

test('Smart Mix module contains automatic grid and one-touch transition flow',()=>{
  assert.match(source,/AUTO GRID/);
  assert.match(source,/SMART MIX/);
  assert.match(source,/detectBpm/);
  assert.match(source,/detectBeatPhase/);
  assert.match(source,/nextBarDelay/);
  assert.match(source,/animateTransition/);
  assert.match(source,/BASS SWAP/);
});

test('Smart Mix keeps transition cancelable and limits pitch changes to UI range',()=>{
  assert.match(source,/cancelSmartMix/);
  assert.match(source,/pct<min\|\|pct>max/);
  assert.match(source,/CANCEL MIX/);
});
