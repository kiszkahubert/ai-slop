import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CrevasseField, subtractConvex } from '../../src/world/crevasses.js';
import { buildCrevasseTerrain } from '../../src/world/crevasseTerrain.js';
import { querySupport, sweepSupport } from '../../src/sim/surface.js';
import { Avalanche } from '../../src/sim/avalanche.js';
import { initPhysics } from '../../src/sim/physics.js';
import { CameraRig } from '../../src/render/camera.js';
import { fixture, step } from '../helpers/physics.mjs';

const flat=()=>({cell:4,x0:0,z0:0,nx:33,nz:33,x1:128,z1:128,height:()=>6000,heightAt:()=>6000,slope:()=>({gx:0,gz:0,mag:0}),surfaceType:()=> 'ice',glacierAt:()=>1});
const place=(ladder=false)=>({x:64,z:64,ux:1,uz:0,len:40,w:4,ladder});
const area=(a,b,c)=>Math.abs((b[0]-a[0])*(c[2]-a[2])-(b[2]-a[2])*(c[0]-a[0]))/2;
await initPhysics();

test('polygon subtraction conserves exterior area and cuts a narrow hole through a large triangle',()=>{
  const pieces=subtractConvex([[0,0,0],[10,0,0],[0,0,10]],[[1,0,1],[2,0,1],[2,0,2],[1,0,2]]);
  const exterior=pieces.reduce((sum,p)=>sum+p.slice(1,-1).reduce((a,v,i)=>a+area(p[0],v,p[i+2]),0),0);
  assert.ok(Math.abs(exterior-49)<1e-8);
});
test('cavity generation is deterministic and preserves the supplied hazard placement',()=>{
  const a=new CrevasseField(flat(),[place()]),b=new CrevasseField(flat(),[place()]);
  assert.deepEqual(a.records[0].geometry,b.records[0].geometry);
  for(const key of ['x','z','ux','uz','len','w','ladder'])assert.equal(a.records[0][key],place()[key]);
  const cv=a.records[0];assert.ok(cv.depth>=12&&cv.depth<=35);
  for(const p of cv.outline){const l=a.local(cv,p[0],p[2]);assert.ok(Math.abs(l.u)<=cv.len/2+1e-7&&Math.abs(l.v)<=cv.w/2+1e-7);}
  for(let i=0;i<cv.geometry.length;i+=3){const [a,b,c]=cv.geometry.slice(i,i+3).map(p=>new THREE.Vector3(...p));assert.ok(b.sub(a).cross(c.sub(a)).lengthSq()>1e-12);}
});
test('every terrain LOD keeps the opening empty, including an aperture on a chunk boundary',()=>{
  const f=flat(),holes=new CrevasseField(f,[place()]);
  for(const range of [[0,32],[0,16],[16,32]])for(const lod of [1,2,4,8,16,32,64]) {
    const g=buildCrevasseTerrain(f,{i0:range[0],i1:range[1],j0:0,j1:32},lod,holes),p=g.attributes.position;
    for(let i=0;i<p.count;i+=3){const v=[0,1,2].map(k=>new THREE.Vector3().fromBufferAttribute(p,i+k));assert.ok(v.every(p=>p.toArray().every(Number.isFinite)));
      assert.ok(v[1].clone().sub(v[0]).cross(v[2].clone().sub(v[0])).lengthSq()>1e-12);
      if(v.every(p=>p.y===6000)){const c=v.reduce((s,p)=>s.add(p),new THREE.Vector3()).multiplyScalar(1/3);assert.equal(holes.at(c.x,c.z),null);}}
    g.dispose();
  }
});
test('support distinguishes the actual ladder, empty air, shaft floor and swept entry',()=>{
  const field=flat(),holes=new CrevasseField(field,[place(true)]),g={field,world:{crevasseField:holes}};
  assert.equal(querySupport(g,{x:64,y:6000,z:64},.6).kind,'ladder');
  assert.equal(querySupport(g,{x:64.4,y:6000,z:64},.6),null);
  assert.equal(querySupport(g,{x:68,y:6000,z:64},.6),null);
  assert.equal(querySupport(g,{x:68,y:6000,z:64},40).kind,'cavity');
  const sweep=sweepSupport(g,{x:68,y:6000,z:58},{x:68,z:70});assert.ok(sweep.cv&&sweep.t<.5&&!sweep.support);
  assert.ok(querySupport(g,holes.safePosition(68,64),.6));
});

test('wall rim segments follow the native triangle surface on rugged terrain',()=>{
  const f=flat();f.height=(x,z)=>{
    const i=Math.floor(x/4),j=Math.floor(z/4),u=x/4-i,v=z/4-j,h=(i,j)=>6000+Math.sin(i*1.4+j*.7)*3;
    const a=h(i,j),b=h(i+1,j),c=h(i,j+1),d=h(i+1,j+1);
    return u+v<=1?a+(b-a)*u+(c-a)*v:d+(c-d)*(1-u)+(b-d)*(1-v);
  };
  const holes=new CrevasseField(f,[{...place(),ux:Math.cos(.37),uz:Math.sin(.37)}]),cv=holes.records[0];
  for(const vertices of [cv.geometry,cv.farGeometry])for(let i=0;i<vertices.length;i+=3) {
    const rim=vertices.slice(i,i+3).filter(p=>Math.abs(p[1]-f.height(p[0],p[2]))<1e-7);
    if(rim.length!==2)continue;
    for(const t of [.2,.5,.8]) {
      const p=rim[0].map((v,k)=>v+(rim[1][k]-v)*t);
      assert.ok(Math.abs(p[1]-f.height(p[0],p[2]))<1e-6);
    }
  }
});
test('snow intercepted by crevasses is counted as outflow and never creates support',()=>{
  const f=flat(),holes=new CrevasseField(f,[place()]),a=new Avalanche(f,{x:64,z:64},{crevasseField:holes,size:16,cell:4,width:24,length:24});
  for(let i=0;i<90;i++)a.step(1/30);
  assert.ok(a.escaped>0);assert.equal(a.sample(64,64).depth,0);assert.ok(Math.abs(a.volume()+a.escaped-a.initialVolume)<1e-6);
});

function physical({free=true,clipped=false}={}) {
  const g=fixture({free,type:'ice'}),cv={x:0,z:0,ux:1,uz:0,len:40,w:5,ladder:false};
  g.world.crevasseField=new CrevasseField(g.field,[cv]);
  g.P.lastSupported={x:0,y:6000,z:4,clipped:-1};
  if(clipped){g.P.clipped=0;g.world.ropes=[{pts:[{x:0,y:6001,z:0}]}];}
  g.physics.startFall({reason:'crevasse'});return g;
}
test('physical crevasse entry falls under gravity without snapping or arresting in air',()=>{
  const g=physical();const y=g.P.y;step(g,.3,120,true);
  assert.ok(g.P.y<y-.3&&g.P.y>y-1);assert.equal(g.P.falling.arresting,false);assert.equal(g.S.health,100);g.physics.reset();
});
test('survivors remain trapped or suspended and reset returns to supported ground',()=>{
  for(const clipped of [false,true]) {
    const g=physical({clipped});step(g,25,120);
    assert.equal(g.P.falling?.phase,clipped?'suspended':'trapped');const y=g.P.y;
    step(g,1);assert.equal(g.P.y,y);assert.equal(g.S.health,100);
    assert.ok(g.physics.resetExperiment());assert.equal(g.P.falling,null);assert.ok(querySupport(g,g.P,.6));
  }
});
test('a shallow ledge impact and an existing rope catch can leave living expedition survivors',()=>{
  const g=fixture({free:false,type:'ice'});
  for(let seed=0;seed<200;seed++) {
    const holes=new CrevasseField(g.field,[{x:0,z:0,ux:1,uz:0,len:40,w:5,ladder:false}],seed);
    if(holes.records[0].ledge>=2 && holes.records[0].ledge<2.3){g.world.crevasseField=holes;break;}
  }
  assert.ok(g.world.crevasseField);g.P.z=1.9;g.P.facing=Math.PI/2;g.physics.startFall({reason:'crevasse'});step(g,25,120);
  assert.equal(g.mode,'play',JSON.stringify({health:g.S.health,y:g.P.y,ledge:g.world.crevasseField.records[0].ledge,events:g.physics.events.filter(e=>e.type==='impact')}));assert.equal(g.P.falling?.phase,'trapped');assert.ok(g.S.health>0&&g.S.health<100);
  assert.ok(g.physics.events.some(e=>e.type==='impact'));g.physics.reset();
  const roped=physical({free:false,clipped:true});step(roped,25,120);
  assert.equal(roped.mode,'play');assert.equal(roped.P.falling?.phase,'suspended');assert.ok(roped.S.health>0);roped.physics.reset();
});
test('unprotected impacts can be fatal and crevasse falls agree across frame rates',()=>{
  const deadly=physical({free:false});step(deadly,10);assert.equal(deadly.mode,'dead');assert.ok(deadly.physics.events.some(e=>e.type==='impact'));deadly.physics.reset();
  const poses=[30,60,144].map(hz=>{const g=physical();step(g,.5,hz);const p={...g.P};g.physics.reset();return p;});
  for(const p of poses.slice(1))assert.ok(Math.hypot(p.x-poses[0].x,p.y-poses[0].y,p.z-poses[0].z)<.02);
});
test('the camera follows a body below the rim instead of lifting itself onto the glacier',()=>{
  const g=physical(),cam=new THREE.PerspectiveCamera(),rig=new CameraRig(cam);step(g,1);
  rig.update(.1,0,g,{group:{visible:false}});assert.ok(cam.position.y<5999);assert.ok(cam.position.toArray().every(Number.isFinite));g.physics.reset();
});

test('a body pressed against ice never pushes the chase camera through the wall',()=>{
  const g=physical(),holes=g.world.crevasseField,hit=holes.ray({x:0,y:5997,z:0},{x:0,y:0,z:1},5);
  assert.ok(hit);
  const target=[0,5997,hit.point.z-.1];g.physics.pose=()=>({pelvis:{p:target}});
  Object.assign(g.P,{x:0,y:5996.1,z:target[2]});g.view.pitch=0;g.view.yaw=0;
  const cam=new THREE.PerspectiveCamera(),rig=new CameraRig(cam),climber={group:{visible:true}};
  rig.update(.1,0,g,climber);assert.ok(cam.position.z<hit.point.z);assert.equal(climber.group.visible,false);g.physics.reset();
});
