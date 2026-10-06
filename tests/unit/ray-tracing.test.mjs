import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { buildHeightHierarchy, referenceHeightHit, triangleHit } from '../../src/render/rayTracing/heightHierarchy.js';
import { buildRegion } from '../../src/render/rayTracing/worker.js';
import { CrevasseField } from '../../src/world/crevasses.js';
import { lightingSize, regionOrigin, RT_LIMITS } from '../../src/render/rayTracing/settings.js';

test('height bounds include shared edge vertices and odd-sized parent blocks',()=>{
  const f={nx:10,nz:7,h:Float32Array.from({length:70},(_,i)=>Math.sin(i)*10)};
  f.h[4]=80;const h=buildHeightHierarchy(f);
  assert.equal(h.atlas[1],80);assert.equal(h.atlas[3],80);
  const last=h.offsets.at(-1),k=last[2]*h.width*2;
  assert.equal(h.atlas[k],Math.min(...f.h));assert.equal(h.atlas[k+1],80);
});
test('native triangle diagonal, double sided hits and distance limits',()=>{
  const f={x0:0,z0:0,nx:2,nz:2,cell:4,h:new Float32Array([0,0,0,4])};
  assert.equal(referenceHeightHit(f,[3,8,3],[0,-1,0]),6);
  assert.equal(referenceHeightHit(f,[1,8,1],[0,-1,0]),8);
  assert.equal(referenceHeightHit(f,[3,-8,3],[0,1,0]),10);
  assert.equal(triangleHit([1,8,1],[0,-1,0],[0,0,0],[4,0,0],[0,0,4],0,7),null);
});
test('worker snapshot retains carved openings and transforms instance vertices without changing source arrays',()=>{
  const field={x0:0,z0:0,nx:33,nz:33,cell:4,h:new Float32Array(33*33).fill(6000),height:()=>6000};
  const holes=new CrevasseField(field,[{x:64,z:64,ux:1,uz:0,len:40,w:4,ladder:false}]);
  const source=new Float32Array([0,0,0,2,0,0,0,0,2]);const before=source.slice();
  const mesh={position:source,color:[1,0,0,0],matrix:new THREE.Matrix4().makeTranslation(30,6010,30).toArray()};
  const s=buildRegion(field,[0,0],[mesh],holes.records.map(r=>({box:r.box,strips:r.strips})));
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(s.position,3));
  const bvh=MeshBVH.deserialize(s.serialized,g,{setIndex:true});
  assert.equal(bvh.raycastFirst(new THREE.Ray(new THREE.Vector3(64,6010,64),new THREE.Vector3(0,-1,0)),THREE.DoubleSide),null);
  assert.equal(bvh.raycastFirst(new THREE.Ray(new THREE.Vector3(30.5,6012,30.5),new THREE.Vector3(0,-1,0)),THREE.DoubleSide).distance,2);
  assert.equal(bvh.raycastFirst(new THREE.Ray(new THREE.Vector3(30.5,6008,30.5),new THREE.Vector3(0,1,0)),THREE.DoubleSide).distance,2);
  assert.deepEqual(source,before);assert.ok(s.position.length/3<s.triangles*3);g.dispose();
});
test('screen and anchor budgets stay bounded at large resolutions',()=>{
  assert.deepEqual(lightingSize(3840,2160),[960,540]);assert.deepEqual(lightingSize(1920,1080,.25),[480,270]);
  assert.deepEqual(regionOrigin({x:-1,z:129}),[-128,128]);assert.equal(RT_LIMITS.memory,268435456);
});
