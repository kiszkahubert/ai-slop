import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Avalanche,findRelease } from '../../src/sim/avalanche.js';

const plane=(slope=0)=>({x0:-2000,z0:-2000,x1:2000,z1:2000,height:(x,z)=>6000-slope*z,slope:()=>({gx:0,gz:-slope,mag:slope}),glacierAt:()=>1});
const advance=(a,t)=>{for(let elapsed=0;elapsed<t-1e-9;elapsed+=1/30) a.step(1/30);};
test('dense snow conserves released volume including open-boundary outflow',()=>{
  const a=new Avalanche(plane(.65),{x:0,z:0},{size:32,cell:8,seed:18});
  let peak=0;for(let i=0;i<600;i++){a.step(1/30);peak=Math.max(peak,a.maxSpeed);}
  assert.ok(Math.abs(a.volume()+a.escaped-a.initialVolume)<1e-6);
  assert.ok(a.h.every((h)=>h>=0&&Number.isFinite(h)));
  assert.ok(peak>1);
  let zsum=0,m=0;for(let k=0;k<a.h.length;k++){zsum+=a.h[k]*(a.z0+(Math.floor(k/a.size)+.5)*a.cell);m+=a.h[k];}
  assert.ok(zsum/m>30,'snow follows the downhill direction');
});
test('snow deposits and stops on a flat runout without losing its mass',()=>{
  const a=new Avalanche(plane(),{x:0,z:0},{size:32,cell:8,seed:7});advance(a,15);
  assert.ok(a.settled);assert.equal(a.maxSpeed,0);
  assert.ok(Math.abs(a.volume()+a.escaped-a.initialVolume)<1e-6);
  assert.ok(a.sample(0,0).depth>.1);
});
test('release search requires an uphill snow slope and stays inside the terrain',()=>{
  assert.equal(findRelease(plane(),0,0),null);
  const release=findRelease(plane(.7),0,0);assert.ok(release.z<-100);
  assert.equal(findRelease({...plane(.7),surfaceType:()=> 'rock'},0,0),null);
});
test('seeded flow is independent of caller frame rate',()=>{
  const results=[30,60,144].map((hz)=>{
    const a=new Avalanche(plane(.6),{x:0,z:0},{size:24,cell:8,seed:19});
    for(let i=0;i<hz*3;i++) a.step(1/hz);return [...a.h,...a.qx,...a.qz];
  });
  for(const r of results.slice(1)) assert.ok(r.every((v,i)=>Math.abs(v-results[0][i])<1e-8));
});
