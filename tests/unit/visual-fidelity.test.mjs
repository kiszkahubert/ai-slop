import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { axisSamples,measureLodError,TerrainLOD } from '../../src/world/terrain.js';
import { cornicePatch,sampleCornice } from '../../src/world/routeFeatures.js';
import { groundHeight,querySupport,sweepSupport } from '../../src/sim/surface.js';
import { patchMacroShadow } from '../../src/render/shared.js';
import { patchRayTracingMaterial } from '../../src/render/rayTracing/materials.js';
import { createFlagMaterial,prepareFlagMesh } from '../../src/render/flags.js';
import { garmentGeometry,legAngles } from '../../src/render/climber.js';
import RAPIER from '@dimforge/rapier3d-compat';
import { initPhysics } from '../../src/sim/physics.js';
import { fixture } from '../helpers/physics.mjs';

test('projected LOD error retains a native ridge spike and partial chunk edges',()=>{
  const field={nx:18,nz:14,x0:0,z0:0,cell:4,heightAt:(i,j)=>i===5&&j===7?20:0};
  const ch={i0:0,j0:0,i1:17,j1:13};
  assert.deepEqual(axisSamples(0,17,8),[0,8,16,17]);
  assert.equal(measureLodError(field,ch,1),0);assert.equal(measureLodError(field,ch,4),20);
  const terrain=new TerrainLOD(new THREE.Scene(),new THREE.MeshStandardMaterial(),field,{chunkCells:32,levels:[1,2,4,8],distances:[10,20,30]});
  const camera=new THREE.PerspectiveCamera(60,1,.1,10000);camera.position.set(32,80,200);camera.lookAt(32,0,28);camera.updateMatrixWorld(true);
  const view={camera,height:1080,pixelError:3};terrain.update(camera.position,8,view);
  assert.equal(terrain.chunks[0].level,0);
  const p=terrain.chunks[0].meshes[3].geometry.attributes.position;
  assert.ok(Array.from({length:p.count},(_,i)=>p.getX(i)).includes(68));
  assert.ok(Array.from({length:p.count},(_,i)=>p.getZ(i)).includes(52));
});

test('cornice support equals rendered triangles and swept walking follows the raised surface',()=>{
  const field={height:(x,z)=>6000+x*.07+z*.02,slope:()=>({gx:.07,gz:.02})};
  const r=cornicePatch(field,{x:10,z:12,dx:.8,dz:.6});r.id='test';
  const mesh=new THREE.Mesh(r.geometry,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));mesh.updateMatrixWorld(true);
  const features={sample:(x,z)=>sampleCornice(r,x,z)},g={field,world:{routeFeatures:features}};
  for(const [x,z] of [[10,12],[10.6,12.8],[9.2,11.5]]){
    const hit=new THREE.Raycaster(new THREE.Vector3(x,6020,z),new THREE.Vector3(0,-1,0)).intersectObject(mesh)[0];
    assert.ok(Math.abs(features.sample(x,z).height-hit.point.y)<.002);
    const y=groundHeight(g,x,z);assert.ok(y>=field.height(x,z));assert.equal(querySupport(g,{x,y,z}).kind,'cornice');
  }
  const start={x:7.5,z:10.1};start.y=groundHeight(g,start.x,start.z);
  const swept=sweepSupport(g,start,{x:12,z:13.5});assert.ok(swept.support);assert.ok(Math.abs(swept.last.y-groundHeight(g,12,13.5))<.002);
  assert.equal(features.sample(100,100),null);r.geometry.dispose();
});

test('streamed Rapier shelf collider agrees with display and standing support',async()=>{
  await initPhysics();
  const g=fixture(),r=cornicePatch(g.field,{x:12,z:8,dx:1,dz:0});
  g.world.routeFeatures={records:[r],sample:(x,z)=>sampleCornice(r,x,z)};
  const physics=g.physics;physics.world=new RAPIER.World({x:0,y:-9.81,z:0});physics.origin={x:0,y:6000,z:0};
  try{
    for(const deposit of [null,{settled:true,sample:()=>({depth:.3})}]){
      physics.avalanche=deposit;physics.streamTerrain();physics.world.step();
      for(const [x,z] of [[12,8],[12.7,8.3],[10.9,7.4]]){
        const ray=new RAPIER.Ray({x,y:20,z},{x:0,y:-1,z:0});
        const hit=physics.world.castRay(ray,30,true,undefined,0x00010002);
        assert.ok(hit);assert.ok(Math.abs(6020-hit.timeOfImpact-groundHeight(g,x,z))<.002);
      }
    }
  }finally{physics.reset();r.geometry.dispose();}
});

test('macro sun and traced visibility both reach the expanded lighting chunk',()=>{
  const material=new THREE.MeshStandardMaterial();patchMacroShadow(material);patchRayTracingMaterial(material);
  const shader={uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};
  material.onBeforeCompile(shader);
  assert.ok(shader.fragmentShader.includes('mix(macroSunShadow( vSharedWorld ),1.0,rtBlend(vSharedWorld))'));
  assert.ok(shader.fragmentShader.includes('directLight.color*=mix(1.0,rtSunVisibility(vSharedWorld,rtN),rtBlend(vSharedWorld))'));
  assert.ok(!shader.fragmentShader.includes('#include <lights_fragment_begin>'));
});

test('flag depth and display shaders share the deformation and flags remain dynamic',()=>{
  const mesh=prepareFlagMesh(new THREE.Mesh(new THREE.PlaneGeometry(.34,.24,12,5),createFlagMaterial()));
  const make=()=>({uniforms:{},vertexShader:THREE.ShaderLib.depth.vertexShader});
  const a=make(),b=make();mesh.material.onBeforeCompile(a);mesh.customDepthMaterial.onBeforeCompile(b);
  assert.equal(a.vertexShader,b.vertexShader);assert.equal(a.uniforms.uTime,b.uniforms.uTime);
  assert.ok(mesh.userData.rtDynamic&&mesh.castShadow);
});

test('garment shells have finite normals and leg IK reaches supported feet',()=>{
  const geometry=garmentGeometry(.1,.435,5);
  assert.ok(geometry.attributes.position.array.every(Number.isFinite));assert.ok(geometry.attributes.normal.array.every(Number.isFinite));geometry.dispose();
  for(const [distance,forward] of [[.8,0],[.68,.24],[.52,-.28]]){
    const {hip,knee}=legAngles(distance,forward);
    const y=.435*Math.cos(hip)+.395*Math.cos(hip+knee),z=.435*Math.sin(hip)+.395*Math.sin(hip+knee);
    assert.ok(Math.abs(y-distance)<1e-8&&Math.abs(z-forward)<1e-8);
  }
});
