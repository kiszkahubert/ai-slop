import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { makeTrack, trackPoint, travelTiming, travelProgress, ease, distance3 } from '../../src/sim/flybyMotion.js';
import { CoreField } from '../../src/world/heightfield.js';
import { TerrainLOD } from '../../src/world/terrain.js';

test('camera distance ramps join cruising with continuous speed and gentle starts/stops', () => {
  for (const length of [20, 400, 3000]) {
    const speed = 40, timing = travelTiming(length, speed), h = .001;
    const at = t => travelProgress(t, timing) * length;
    assert.equal(at(0), 0); assert.equal(at(timing.duration), length);
    assert.ok(at(h) / h < .001);
    assert.ok((length - at(timing.duration - h)) / h < .001);
    for (const t of [timing.ramp, timing.duration - timing.ramp]) {
      const a = (at(t) - at(t - h)) / h, b = (at(t + h) - at(t)) / h;
      assert.ok(Math.abs(a - b) < .001); assert.ok(Math.abs(a - speed) < .001);
    }
  }
  assert.ok(ease(.0001) / .0001 < .001);
  assert.ok((1 - ease(.9999)) / .0001 < .001);
});

test('camera tracks clear a narrow terrain ridge and measure spatial distance along turns', () => {
  const field = { height: (x, z) => 80 * Math.exp(-((x - 100) ** 2 + z ** 2) / 80) };
  const points = [[0, 80, 0], [80, 80, 0], [120, 80, 0], [180, 80, 20], [250, 80, 0]];
  const track = makeTrack(points, field);
  assert.deepEqual(trackPoint(track, 0), points[0]); assert.deepEqual(trackPoint(track, 1), points.at(-1));
  let last = trackPoint(track, 0), min = Infinity;
  for (let i = 1; i <= 10000; i++) {
    const p = trackPoint(track, i / 10000);
    min = Math.min(min, p[1] - field.height(p[0], p[2]));
    assert.ok(distance3(last, p) < track.length / 10000 + .001); last = p;
  }
  assert.ok(min > 55); assert.ok(track.length > 250);
});

test('future terrain meshes are hidden, bounded and reused when the camera arrives', () => {
  const f = new CoreField({ x0: 0, z0: 0, cell: 4, nx: 65, nz: 65 }, new Float32Array(65 * 65));
  f.glacier = new Uint8Array(f.h.length); f.rock = new Uint8Array(f.h.length);
  const scene = new THREE.Scene(), terrain = new TerrainLOD(scene, new THREE.MeshBasicMaterial(), f,
    { chunkCells: 8, levels: [1, 2, 4], distances: [100, 200], glacier: false, shadows: false });
  const camera = new THREE.PerspectiveCamera(62, 1, .3, 10000);
  camera.position.set(128, 40, 200); camera.lookAt(128, 0, 128); camera.updateProjectionMatrix();
  const view = { camera, height: 720, pixelError: 2 };
  for (let i = 0; i < 10; i++) terrain.prepare(camera, view, { maxMeshes: 1, timeMs: 100, maxCached: 3 });
  assert.equal(terrain.prepared.length, 3);
  for (const {ch, lv} of terrain.prepared) { assert.equal(ch.level, 2); assert.equal(ch.meshes[lv].visible, false); }
  const item = terrain.prepared[0], mesh = item.ch.meshes[item.lv];
  terrain.setLevel(item.ch, item.lv);
  assert.equal(item.ch.meshes[item.lv], mesh); assert.equal(mesh.visible, true);
  assert.ok(!terrain.prepared.some(p => p.ch === item.ch && p.lv === item.lv));
  for (const ch of terrain.chunks) for (const m of ch.meshes) if (m) m.geometry.dispose();
});

test('terrain geometry can pause between batches and resume with identical vertex data', () => {
  const n=129,f=new CoreField({x0:0,z0:0,cell:4,nx:n,nz:n},Float32Array.from({length:n*n},(_,k)=>Math.sin(k%n/11)*Math.cos(Math.floor(k/n)/17)*20));
  f.glacier=new Uint8Array(f.h.length);f.rock=new Uint8Array(f.h.length);
  const terrain=new TerrainLOD(new THREE.Scene(),new THREE.MeshBasicMaterial(),f,{chunkCells:128,levels:[1,4,16],distances:[100,300],glacier:false,shadows:false});
  const ch=terrain.chunks[0],job=terrain.geometryJob(ch,1);
  assert.equal(job.next().done,false,'native geometry yields before completion');
  terrain.preparing={kind:'geometry',ch,lv:0,iterator:job};
  const resumed=terrain.ensureLevel(ch,0).geometry,reference=terrain.buildGeometry(ch,1);
  for(const name of ['position','normal','aGlacier','aRock'])assert.deepEqual(resumed.attributes[name].array,reference.attributes[name].array);
  assert.deepEqual(resumed.index.array,reference.index.array);assert.equal(terrain.preparing,null);
  reference.dispose();for(const mesh of ch.meshes)if(mesh)mesh.geometry.dispose();
});
