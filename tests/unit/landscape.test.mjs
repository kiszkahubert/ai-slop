import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CoreField } from '../../src/world/heightfield.js';
import { createLandscapeField } from '../../src/world/landscape.js';
import { TerrainLOD, coreTerrainOptions, backdropTerrainOptions } from '../../src/world/terrain.js';
import { buildHeightHierarchy, referenceHeightHit } from '../../src/render/rayTracing/heightHierarchy.js';
import { buildRegion } from '../../src/render/rayTracing/worker.js';
import { createReliefTexture } from '../../src/render/terrainMaps.js';
import { MATERIAL_PARS } from '../../src/render/rayTracing/materials.js';

function grid(g, height) {
  const f=new CoreField(g,Float32Array.from({length:g.nx*g.nz},(_,k)=>height(g.x0+k%g.nx*g.cell,g.z0+Math.floor(k/g.nx)*g.cell)));
  f.glacier=new Uint8Array(f.h.length).fill(180);f.rock=new Uint8Array(f.h.length).fill(90);return f;
}
function fixture(offset=15,shape=false) {
  const plane=(x,z)=>6000+.12*x+.08*z;
  const core=grid({x0:32,z0:-68,cell:4,nx:81,nz:65},(x,z)=>plane(x,z)+offset+(shape?7*Math.sin(x/23)*Math.cos(z/37):0));
  const back=grid({x0:-1024,z0:-1024,cell:16,nx:161,nz:161},(x,z)=>plane(x,z)+(shape?5*Math.sin(x/80):0));
  return {core,back,land:createLandscapeField(core,back)};
}

test('landscape preserves every climbing height and mask without sharing mutable arrays',()=>{
  const {core,back,land}=fixture(15,true),old=core.h.slice();
  assert.notEqual(land.h,core.h);assert.equal(land.cell,4);
  assert.equal((land.x0-back.x0)%back.cell,0);assert.equal((land.z1-back.z0)%back.cell,0);
  for(let j=0;j<core.nz;j++)for(let i=0;i<core.nx;i++){
    const k=j*core.nx+i,l=Math.round((core.z0-land.z0)/4+j)*land.nx+Math.round((core.x0-land.x0)/4+i);
    assert.equal(land.h[l],core.h[k]);assert.equal(land.glacier[l],180);assert.equal(land.rock[l],90);
  }
  assert.deepEqual(core.h,old);assert.ok(land.h.every(Number.isFinite));
  assert.deepEqual(createLandscapeField(core,back).h,land.h,'generation is deterministic');
  assert.throws(()=>createLandscapeField(core,back,{blendWidth:0}));
});

test('Hermite transitions on all sides and corners match heights, slopes and fallback',()=>{
  for(const offset of [-70,0,70]){
    const {core,back,land}=fixture(offset);
    for(const [x,z,nx,nz] of [[core.x0,40,-1,0],[core.x1,40,1,0],[120,core.z0,0,-1],[120,core.z1,0,1],[core.x0,core.z0,-Math.SQRT1_2,-Math.SQRT1_2],[core.x1,core.z0,Math.SQRT1_2,-Math.SQRT1_2],[core.x0,core.z1,-Math.SQRT1_2,Math.SQRT1_2],[core.x1,core.z1,Math.SQRT1_2,Math.SQRT1_2]]){
      assert.ok(Math.abs(land.height(x,z)-core.height(x,z))<.001);
      let previous=offset;
      for(const d of [4,80,160,240,320,400]){
        const X=x+nx*d,Z=z+nz*d,delta=land.height(X,Z)-back.height(X,Z);
        assert.ok(Math.abs(delta)<=Math.abs(previous)+.004);previous=delta;
        // A diagonal query at the nominal band end interpolates 4 m cells
        // straddling the circular corner cutoff; its residual stays below 1 cm.
        if(d>=320)assert.ok(Math.abs(delta)<.01);
      }
      const inner=core.height(x,z)-core.height(x-nx*4,z-nz*4),outer=land.height(x+nx*4,z+nz*4)-land.height(x,z);
      assert.ok(Math.abs(inner-outer)<.05,'no step in the join');
    }
    for(const [x,z] of [[land.x0,40],[land.x1,40],[120,land.z0],[120,land.z1]]){
      assert.ok(Math.abs(land.height(x,z)-back.height(x,z))<.001);
      const k=Math.round((z-land.z0)/4)*land.nx+Math.round((x-land.x0)/4);assert.equal(land.glacier[k],0);assert.equal(land.rock[k],0);
    }
  }
});

test('all landscape LODs join native backdrop triangles without skirts or buried curtains',()=>{
  const {land,back}=fixture(70,true),scene=new THREE.Scene(),mat=new THREE.MeshStandardMaterial();
  const terrain=new TerrainLOD(scene,mat,land,{...coreTerrainOptions(),chunkCells:128});
  const distant=new TerrainLOD(scene,mat,back,{...backdropTerrainOptions(land),chunkCells:32});
  const boundaryNormals=new Map();
  for(const ch of distant.chunks.filter(c=>c.join)){
    assert.equal(distant.desiredLevel(ch,new THREE.Vector3(100000,9000,100000)),0);
    for(const step of [1,2,4]){
      const g=distant.buildGeometry(ch,step),p=g.attributes.position,index=g.index.array;
      for(const i of new Set(index)){const x=p.getX(i),z=p.getZ(i);if((x===land.x0||x===land.x1||z===land.z0||z===land.z1)&&Math.abs(p.getY(i)-land.height(x,z))<.01)boundaryNormals.set(`${x}/${z}`,Array.from(g.attributes.normal.array.subarray(i*3,i*3+3)));}
      for(let k=0;k<index.length;k+=3){const ids=Array.from(index.subarray(k,k+3)),x=ids.reduce((v,i)=>v+p.getX(i),0)/3,z=ids.reduce((v,i)=>v+p.getZ(i),0)/3;
        assert.ok(!(x>land.x0+.001&&x<land.x1-.001&&z>land.z0+.001&&z<land.z1-.001),'backdrop is geometrically clipped');
      }
      g.dispose();
    }
  }
  for(const ch of terrain.chunks.filter(c=>c.i0===0||c.j0===0||c.i1===land.nx-1||c.j1===land.nz-1))for(const step of [1,2,4,8,16,32,64]){
    const g=terrain.buildGeometry(ch,step),mesh=new THREE.Mesh(g,mat),p=g.attributes.position,used=new Set(g.index.array);
    mesh.updateMatrixWorld(true);
    for(const i of used){const x=p.getX(i),z=p.getZ(i);if(x===land.x0||x===land.x1||z===land.z0||z===land.z1){assert.ok(Math.abs(p.getY(i)-back.height(x,z))<.01,'shared perimeter has no skirts');const n=boundaryNormals.get(`${x}/${z}`);if(n)assert.ok(n.every((v,k)=>Math.abs(v-g.attributes.normal.array[i*3+k])<.00001),'normals agree across both meshes');}}
    const probes=[];if(ch.i0===0||ch.i1===land.nx-1)for(let j=ch.j0;j<=ch.j1;j+=3)probes.push([ch.i0===0?land.x0:land.x1,land.z0+j*4]);
    if(ch.j0===0||ch.j1===land.nz-1)for(let i=ch.i0;i<=ch.i1;i+=3)probes.push([land.x0+i*4,ch.j0===0?land.z0:land.z1]);
    for(const [x,z] of probes){const hit=new THREE.Raycaster(new THREE.Vector3(x,9000,z),new THREE.Vector3(0,-1,0)).intersectObject(mesh)[0];assert.ok(hit);assert.ok(Math.abs(hit.point.y-back.height(x,z))<.01);}
    assert.ok(p.array.every(Number.isFinite));assert.ok(g.attributes.normal.array.every(Number.isFinite));
    for(let i=0;i<p.count;i++){assert.ok(p.getX(i)>=ch.x0&&p.getX(i)<=ch.x1);assert.ok(p.getZ(i)>=ch.z0&&p.getZ(i)<=ch.z1);}
    g.dispose();
  }
  for(const m of scene.children)m.geometry.dispose();mat.dispose();
});

test('the slope correction stays within ±0.25 along diagonal corner directions',()=>{
  for(const sign of [-1,1]){
    const core=grid({x0:-64,z0:-48,cell:4,nx:33,nz:25},(x,z)=>6100+sign*2*(x+z));
    const back=grid({x0:-512,z0:-512,cell:16,nx:65,nz:65},()=>6000),land=createLandscapeField(core,back);
    const x=core.x1+112,z=core.z1+112,t=Math.hypot(112,112)/320,h00=1-3*t*t+2*t*t*t,h10=t*(1-t)*(1-t);
    const expected=6000+h00*(core.h.at(-1)-6000)+320*h10*.25*sign;
    assert.ok(Math.abs(land.height(x,z)-expected)<.001);
  }
});

test('lighting hierarchies and local snapshots include the exterior transition',()=>{
  const core=grid({x0:0,z0:0,cell:4,nx:17,nz:17},()=>6100),back=grid({x0:-64,z0:-64,cell:16,nx:13,nz:13},()=>6000);
  const land=createLandscapeField(core,back,{blendWidth:32}),bounds=buildHeightHierarchy(land),top=bounds.offsets.at(-1);
  assert.equal(bounds.atlas[(top[2]*bounds.width)*2+1],6100);
  const x=-16,z=32,hit=referenceHeightHit(land,[x,6200,z],[0,-1,0]);assert.ok(Math.abs(6200-hit-land.height(x,z))<.001);
  const region=buildRegion(land,[0,0],[]);assert.ok(region.position.some((_,i)=>i%3===0&&region.position[i]<0));
  const relief=createReliefTexture(land,8,16);assert.ok(relief.texture.image.data.every(Number.isFinite));relief.texture.dispose();
});

test('a join exactly on a backdrop chunk edge pins the outside neighbour too',()=>{
  const {back}=fixture(),core=grid({x0:-192,z0:0,cell:4,nx:81,nz:65},(x,z)=>6050+.1*x+.08*z);
  const land=createLandscapeField(core,back),scene=new THREE.Scene(),mat=new THREE.MeshStandardMaterial();
  assert.equal(land.x0,-512);
  const terrain=new TerrainLOD(scene,mat,back,{...backdropTerrainOptions(land),chunkCells:32});
  const neighbours=terrain.chunks.filter(ch=>ch.x1===land.x0&&ch.z0<land.z1&&ch.z1>land.z0);
  assert.ok(neighbours.length>0);assert.ok(neighbours.every(ch=>ch.join&&terrain.desiredLevel(ch,new THREE.Vector3(1e6,1e6,1e6))===0));
  for(const mesh of scene.children)mesh.geometry.dispose();mat.dispose();
});

test('cache transition reuses the existing samplers and fades across 128 metres',()=>{
  assert.ok(MATERIAL_PARS.includes('smoothstep(0.0,128.0'));
  assert.ok(MATERIAL_PARS.includes('mix(b,c,w)'));
  assert.equal((MATERIAL_PARS.match(/uniform sampler2D /g)||[]).length,1);
});
