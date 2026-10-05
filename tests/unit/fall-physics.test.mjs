import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { initPhysics } from '../../src/sim/physics.js';
import { BODY } from '../../src/sim/body.js';
import { fixture, step } from '../helpers/physics.mjs';
import { CameraRig } from '../../src/render/camera.js';
import { triangleHeight } from '../../src/sim/surface.js';

await initPhysics();
test('airborne body follows gravity, with no terrain snapping or instant self-arrest',()=>{
  const g=fixture();g.physics.startFall({heightOffset:5,reason:'test',velocity:{x:2,y:0,z:0}});
  const centre=()=>[...g.physics.parts.values()].reduce((sum,p)=>sum+p.rb.translation().y*p.mass,0)/[...g.physics.parts.values()].reduce((sum,p)=>sum+p.mass,0);
  const initial=centre();step(g,.3,60,true);
  assert.ok(Math.abs(centre()-(initial-.5*9.81*.3*.3))<.025);
  assert.ok(g.P.x>.5);assert.equal(g.P.falling.arresting,false);assert.equal(g.S.stamina,100);g.physics.reset();
});
test('ragdoll joints stay connected and knees respect their limits on impact',()=>{
  const g=fixture({slope:.5});g.physics.startFall({heightOffset:2,reason:'test',velocity:{x:1,y:0,z:4}});step(g,4);
  assert.equal(g.physics.parts.size,11);
  for(const def of BODY.filter((d)=>d.parent)) {
    const part=g.physics.parts.get(def.id),parent=g.physics.parts.get(def.parent),pd=parent.def;
    const world=(rb,offset)=>new THREE.Vector3(...offset).applyQuaternion(rb.rotation()).add(rb.translation());
    const a=world(parent.rb,def.joint.map((v,i)=>v-pd.p[i])),b=world(part.rb,def.joint.map((v,i)=>v-def.p[i]));
    assert.ok(a.distanceTo(b)<.08,def.id+' remains attached');
    if(def.hinge) {
      const relative=new THREE.Quaternion().copy(parent.rb.rotation()).invert().multiply(new THREE.Quaternion().copy(part.rb.rotation()));
      if(relative.w<0) relative.set(-relative.x,-relative.y,-relative.z,-relative.w);
      const angle=2*Math.atan2(relative.x,relative.w);
      assert.ok(angle>=def.hinge[0]-.08 && angle<=def.hinge[1]+.08,def.id+' respects its hinge limit');
    }
    assert.ok(Object.values(part.rb.translation()).every(Number.isFinite));
  }
  g.physics.reset();
});
test('early self-arrest stops on snow, costs stamina, and is less effective on ice',()=>{
  const run=(type,arrest)=>{
    const g=fixture({slope:.45,type});g.P.facing=Math.PI;
    g.physics.startFall({velocity:{x:0,y:-1.35,z:3}});step(g,6,120,arrest);
    const result={z:g.P.z,stamina:g.S.stamina,falling:!!g.P.falling};g.physics.reset();return result;
  };
  const slide=run('snow',false),snow=run('snow',true),ice=run('ice',true);
  assert.equal(snow.falling,false);assert.ok(snow.z<slide.z*.25);assert.ok(snow.stamina<100);
  assert.ok(ice.z>snow.z*3);assert.equal(ice.falling,true);
});
test('settled debris supports later falls without modifying the DEM',()=>{
  const g=fixture();g.physics.avalanche={settled:true,step:()=>{},sample:()=>({depth:1,vx:0,vz:0})};
  g.P.y=6001;g.physics.startFall({heightOffset:1,reason:'test'});step(g,4);
  assert.ok(g.P.y>=6000.8);assert.equal(g.field.height(0,0),6000);g.physics.reset();
});
function buried({depth,free=false}) {
  const g=fixture({free});g.physics.startFall({reason:'test'});
  for(const {rb} of g.physics.parts.values()) { const p=rb.translation();rb.setTranslation({x:p.x,y:p.y-1.4,z:p.z},true); }
  g.physics.avalanche={settled:true,step:()=>{},sample:()=>({depth,vx:0,vz:0})};
  return g;
}
test('shallow burial can be dug out while deep burial consumes air and then health',()=>{
  const shallow=buried({depth:.5});step(shallow,.1);assert.ok(shallow.physics.burial.shallow);
  step(shallow,4,120,true);assert.equal(shallow.physics.burial,null);assert.ok(shallow.S.health>0);shallow.physics.reset();
  const deep=buried({depth:2});step(deep,8,120,true);
  assert.equal(deep.physics.burial.shallow,false);assert.equal(deep.mode,'play');assert.ok(deep.physics.burial.air<5);
  const y=deep.P.y;step(deep,15,120,true);assert.equal(deep.mode,'dead');assert.ok(Math.abs(deep.P.y-y)<.01);deep.physics.reset();
});
test('rugged terrain triangles do not create phantom snow burial away from the avalanche',()=>{
  const field={x0:0,z0:0,nx:2,nz:2,cell:4,height:(x,z)=>x*z};
  assert.equal(triangleHeight(field,1,1),0);assert.equal(triangleHeight(field,3,3),8);
  const g=buried({depth:0});step(g,.1);assert.equal(g.physics.burial,null);g.physics.reset();
});
test('free viewing survives burial and reset restores the experiment position and camera',()=>{
  const g=buried({depth:2,free:true});const saved={...g.physics.preTrigger};step(g,30);
  assert.equal(g.mode,'play');assert.equal(g.S.health,100);assert.equal(g.physics.burial.air,180);
  assert.equal(g.physics.resetExperiment(),true);assert.equal(g.physics.avalanche,null);assert.equal(g.P.falling,null);
  assert.equal(g.P.y,saved.P.y);assert.equal(g.view.fp,true);assert.equal(g.physics.world,null);
});
test('moving snow knocks down and carries a climber, with free-view invulnerability',()=>{
  const g=fixture({slope:.65});
  assert.equal(g.physics.triggerAvalanche({source:{x:0,z:-40},cell:4,size:64,width:40,length:24,seed:31}),true);
  const A=g.physics.avalanche;step(g,12,60);
  assert.ok(g.physics.events.some((e)=>e.type==='knockdown'&&e.reason==='avalanche'));
  assert.ok(g.P.z>10);assert.equal(g.S.health,100);assert.equal(g.mode,'play');
  assert.ok(Math.abs(A.volume()+A.escaped-A.initialVolume)<1e-6);g.physics.reset();
});
test('fall camera exposes the body and restores the chosen first-person view',()=>{
  const g=fixture({slope:.8}),camera=new THREE.PerspectiveCamera(),rig=new CameraRig(camera),climber={group:{visible:false}};
  g.physics.startFall({heightOffset:2});rig.update(.1,0,g,climber);
  assert.equal(climber.group.visible,true);assert.equal(g.view.fp,true);
  assert.ok(camera.position.y>g.field.height(camera.position.x,camera.position.z));
  g.physics.reset();g.P.recovery={t:.2};rig.update(.1,0,g,climber);
  assert.equal(climber.group.visible,true);
  g.P.recovery=null;rig.update(.1,0,g,climber);
  assert.equal(climber.group.visible,false);assert.equal(g.view.fp,true);
  g.P.x=500;g.physics.startFall();rig.update(.01,0,g,climber);
  assert.ok(Math.abs(rig.target.x-500)<.01,'a new fall cannot inherit a stale camera target');g.physics.reset();
});
test('falls produce equivalent poses at 30, 60 and 144 Hz',()=>{
  const positions=[30,60,144].map((hz)=>{const g=fixture({slope:.5});g.physics.startFall({heightOffset:1,reason:'test',velocity:{x:0,y:0,z:3}});step(g,2,hz);const p={...g.P};g.physics.reset();return p;});
  for(const p of positions.slice(1)) assert.ok(Math.hypot(p.x-positions[0].x,p.y-positions[0].y,p.z-positions[0].z)<.015);
});
test('a fatal impact preserves motion instead of teleporting the body',()=>{
  const g=fixture({free:false});g.physics.startFall({heightOffset:8,reason:'test',velocity:{x:4,y:-18,z:0}});
  for(let i=0;i<180&&g.mode==='play';i++)g.physics.step(1/120);
  assert.equal(g.mode,'dead');const x=g.P.x;step(g,.5);
  assert.ok(g.P.x>=x);assert.ok(g.P.x-x<5);assert.ok(g.P.falling);g.physics.reset();
});
test('fixed rope holds the harness while preserving the body motion',()=>{
  const g=fixture({slope:1});g.P.clipped=0;g.world.ropes=[{pts:[{x:0,y:6001,z:0}]}];
  g.physics.startFall({reason:'test',velocity:{x:0,y:0,z:8}});
  for(let i=0;i<480 && g.P.falling;i++) {
    g.physics.step(1/120);
    const p=g.physics.poses.pelvis?.p;
    if(p) assert.ok(Math.hypot(p[0],p[1]-6001,p[2])<3.1);
  }
  assert.ok(g.P.z<4);g.physics.reset();
});
