import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { QUALITY_PRESETS, renderPixelRatio, qualitySettings, initialVeryLowFullResolution, veryLowFullResolution, rememberVeryLowFullResolution } from '../../src/render/quality.js';
import { LowResolution } from '../../src/render/lowResolution.js';
import { LowGraphics, createSimpleTerrainMaterial } from '../../src/render/lowGraphics.js';
import { campDetailRadius } from '../../src/render/campVisuals.js';
import { CoreField } from '../../src/world/heightfield.js';
import { TerrainLOD } from '../../src/world/terrain.js';

test('Very Low bounds 3D resolution independently of viewport/DPR and disables costly passes', () => {
  const q = QUALITY_PRESETS.verylow;
  for (const [w, h, dpr] of [[1920,1080,1], [3840,2160,2], [1280,720,1], [720,1280,3]]) {
    const ratio = renderPixelRatio(q,w,h,dpr);
    assert.ok(w*ratio <= 960 && h*ratio <= 540);
    assert.ok(ratio <= .5);
    assert.equal(renderPixelRatio(q,w,h,dpr,.5),ratio*.5);
  }
  assert.equal(renderPixelRatio(QUALITY_PRESETS.high,1280,720,2),1.5);
  for (const flag of ['post','shadows','depthPrepass','macroShadow','mist']) assert.equal(q[flag],false);
  assert.equal(q.snowParticles,0); assert.equal(campDetailRadius(q),0);
});

test('adaptive resolution reduces sustained slow frames, ignores suspension and recovers with headroom', () => {
  const r = new LowResolution();
  for (let i=0;i<100;i++) r.sample(70);
  assert.equal(r.scale,.5);
  for (let i=0;i<1000;i++) r.sample(33.33);
  assert.equal(r.scale,.5,'30 fps cap does not trigger resolution oscillation');
  for (let i=0;i<2000;i++) r.sample(16.67);
  assert.equal(r.scale,1);
  r.reset(); for (const ms of [NaN,Infinity,0,-5,5000]) assert.equal(r.sample(ms),false);
  assert.equal(r.scale,1); assert.equal(r.samples,0);
});

test('full resolution uses native display pixels and preserves Very Low optimizations', () => {
  const q = qualitySettings('verylow', true);
  for (const [w,h,dpr] of [[1920,1080,1], [3840,2160,2], [720,1280,3]]) {
    assert.equal(renderPixelRatio(q,w,h,dpr),dpr);
  }
  assert.equal(q.adaptiveResolution,false);
  for (const key of Object.keys(QUALITY_PRESETS.verylow)) {
    if (!['pixelRatio','maxWidth','maxHeight','adaptiveResolution'].includes(key)) {
      assert.equal(q[key],QUALITY_PRESETS.verylow[key],key);
    }
  }
  assert.equal(qualitySettings('verylow',false),QUALITY_PRESETS.verylow);
  for (const name of ['low','medium','high']) assert.equal(qualitySettings(name,true),QUALITY_PRESETS[name]);
});

test('full-resolution preference persists and works when browser storage is blocked', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis,'localStorage');
  const values = new Map();
  try {
    Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)}});
    assert.equal(initialVeryLowFullResolution(),false);
    rememberVeryLowFullResolution(true);
    assert.equal(initialVeryLowFullResolution(),true);
    assert.equal(veryLowFullResolution(),true);
    assert.equal(qualitySettings('verylow').adaptiveResolution,false);
    Object.defineProperty(globalThis,'localStorage',{configurable:true,get:()=>{throw Error('Blocked');}});
    assert.equal(initialVeryLowFullResolution(),false);
    rememberVeryLowFullResolution(false);
    assert.equal(veryLowFullResolution(),false);
  } finally {
    rememberVeryLowFullResolution(false);
    if (original) Object.defineProperty(globalThis,'localStorage',original);
    else delete globalThis.localStorage;
  }
});

test('simple scenery preserves instancing, cutouts and geometry and restores the exact source materials', () => {
  const scene = new THREE.Scene(), surface = new THREE.MeshStandardMaterial({color:0xaa5500,vertexColors:true});
  surface.map = new THREE.Texture(); surface.normalMap = new THREE.Texture();
  const cutout = new THREE.MeshStandardMaterial({map:new THREE.Texture(),alphaTest:.5,side:THREE.DoubleSide});
  const geometry = new THREE.BoxGeometry(), mesh = new THREE.InstancedMesh(geometry,surface,2);
  const flag = new THREE.Mesh(geometry,[surface,cutout]); scene.add(mesh,flag);
  const footprint = new THREE.Mesh(geometry,surface); scene.add(footprint);
  const low = new LowGraphics(scene,{routeWear:{meshes:[footprint]},crevasseVisuals:{material:surface}});
  low.apply(true);
  assert.ok(mesh.material.isMeshLambertMaterial); assert.equal(mesh.material.map,null);
  assert.equal(mesh.material,flag.material[0]); assert.equal(flag.material[1].map,cutout.map);
  assert.equal(flag.material[1].alphaTest,.5); assert.equal(mesh.geometry,geometry); assert.equal(mesh.count,2);
  assert.equal(footprint.visible,false);
  low.apply(false);
  assert.equal(mesh.material,surface); assert.deepEqual(flag.material,[surface,cutout]);
  assert.equal(surface.normalMap.isTexture,true); assert.equal(footprint.visible,true);
  assert.equal(low.materials.size,0); assert.equal(low.originals.size,0);
});

test('simple terrain compiles vertex lighting and curvature without fragment texture sampling', () => {
  const mat = createSimpleTerrainMaterial(), shader = {uniforms:{},vertexShader:THREE.ShaderLib.lambert.vertexShader,fragmentShader:THREE.ShaderLib.lambert.fragmentShader};
  mat.onBeforeCompile(shader);
  assert.match(shader.vertexShader,/transformed.y -= dot\(dc,dc\)\*uCurv/);
  assert.match(shader.vertexShader,/aGlacier/); assert.match(shader.vertexShader,/aRock/);
  assert.ok(shader.uniforms.uCurv.value > 0);
  assert.doesNotMatch(shader.fragmentShader,/sampler2DArray|triLayer|uZCull|uMacroShadow/);
  assert.match(shader.fragmentShader,/diffuseColor.rgb \*= vTerrainColor/);
});

test('settled terrain skips scans, invalidates on view/settings changes, and switches every cached material', () => {
  const f = new CoreField({x0:0,z0:0,cell:4,nx:17,nz:17},new Float32Array(17*17));
  const scene = new THREE.Scene(), first = new THREE.MeshBasicMaterial(), second = createSimpleTerrainMaterial();
  const terrain = new TerrainLOD(scene,first,f,{chunkCells:8,levels:[1,2,4],distances:[20,40],mergeFrom:1});
  const camera = new THREE.PerspectiveCamera(62,1,.3,1000); camera.position.set(0,12,0); camera.lookAt(32,0,32);
  const view={camera,height:720,pixelError:5,distanceScale:1};
  for(let i=0;i<20 && terrain.update(camera.position,50,view);i++);
  const desired = terrain.desiredLevel.bind(terrain); let scans=0;
  terrain.desiredLevel=(...args)=>{scans++;return desired(...args);};
  terrain.update(camera.position,50,view); assert.equal(scans,0);
  view.height=360; terrain.update(camera.position,50,view); assert.ok(scans>0);
  scans=0; view.distanceScale=.35; terrain.update(camera.position,50,view); assert.ok(scans>0);
  scans=0; camera.rotateY(.1); terrain.update(camera.position,50,view); assert.ok(scans>0);
  terrain.setMaterial(second);
  for(const ch of terrain.chunks) for(const mesh of ch.meshes) if(mesh) assert.equal(mesh.material,second);
  for(const group of terrain.groups.values()) if(group.mesh) assert.equal(group.mesh.material,second);
});
