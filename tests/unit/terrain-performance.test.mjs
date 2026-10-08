import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CoreField } from '../../src/world/heightfield.js';
import { TerrainLOD, measureLodError, axisSamples } from '../../src/world/terrain.js';

const rough = (n, seed = 1) => new CoreField({ x0: 0, z0: 0, cell: 4, nx: n, nz: n },
  Float32Array.from({ length: n * n }, (_, k) => Math.sin(k % n / 7 + seed) * Math.cos(Math.floor(k / n) / 5) * 30 + ((k * 2654435761) % 97) / 9));

// the per-vertex form the coarse-cell rewrite replaced: every native vertex finds its coarse cell
function referenceError(field, ch, step) {
  if (step === 1) return 0;
  const xs = axisSamples(ch.i0, ch.i1, step), zs = axisSamples(ch.j0, ch.j1, step);
  let error = 0, zj = 0;
  for (let j = ch.j0; j <= ch.j1; j++) for (let i = ch.i0; i <= ch.i1; i++) {
    while (zj < zs.length - 2 && j >= zs[zj + 1]) zj++;
    let xi = Math.min(Math.floor((i - ch.i0) / step), xs.length - 2);
    while (xi > 0 && i < xs[xi]) xi--;
    while (xi < xs.length - 2 && i >= xs[xi + 1]) xi++;
    const a = xs[xi], b = zs[zj], ix = xs[xi + 1], jz = zs[zj + 1], u = (i - a) / (ix - a), v = (j - b) / (jz - b);
    const h00 = field.heightAt(a, b), h10 = field.heightAt(ix, b), h01 = field.heightAt(a, jz), h11 = field.heightAt(ix, jz);
    const coarse = u + v <= 1 ? h00 + (h10 - h00) * u + (h01 - h00) * v : h11 + (h01 - h11) * (1 - u) + (h10 - h11) * (1 - v);
    error = Math.max(error, Math.abs(field.heightAt(i, j) - coarse));
  }
  return error;
}

test('LOD error measured per coarse cell equals the per-vertex reference exactly, partial chunks included', () => {
  const f = rough(70, 3);
  for (const ch of [{ i0: 0, j0: 0, i1: 64, j1: 64 }, { i0: 64, j0: 0, i1: 69, j1: 64 }, { i0: 0, j0: 64, i1: 69, j1: 69 }, { i0: 3, j0: 5, i1: 40, j1: 27 }])
    for (const step of [1, 2, 4, 8, 16, 64]) assert.equal(measureLodError(f, ch, step), referenceError(f, ch, step), `${JSON.stringify(ch)} step ${step}`);
});

test('coarse far chunks draw merged per 4x4 group with exactly their own vertices', () => {
  const f = rough(257);
  f.glacier = new Uint8Array(f.h.length); f.rock = new Uint8Array(f.h.length);
  const scene = new THREE.Scene(), opts = { chunkCells: 16, levels: [1, 2, 4, 8, 16], distances: [60, 120, 240, 480], glacier: false, shadows: false, mergeFrom: 3 };
  const terrain = new TerrainLOD(scene, new THREE.MeshBasicMaterial(), f, opts);
  const camera = new THREE.PerspectiveCamera(62, 1, .3, 10000); camera.position.set(40, 60, 40); camera.lookAt(500, 0, 500); camera.updateMatrixWorld();
  for (let k = 0; k < 50 && terrain.update(camera.position, 40) > 0; k++);
  let merged = 0;
  for (const g of terrain.groups.values()) {
    const members = g.chunks.filter((ch) => ch.level >= 3);
    for (const ch of g.chunks) assert.equal(ch.meshes[ch.level].visible, ch.level < 3, 'a chunk is drawn by itself or by its group, never both');
    if (!members.length) { assert.equal(g.mesh, null); continue; }
    merged++;
    const pos = g.mesh.geometry.attributes.position.array, index = g.mesh.geometry.index.array;
    const expected = members.flatMap((ch) => { const geo = ch.meshes[ch.level].geometry, p = geo.attributes.position.array; return Array.from(geo.index.array, (v) => [p[v * 3], p[v * 3 + 1], p[v * 3 + 2]]); });
    assert.deepEqual(Array.from(index, (v) => [pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]]), expected, 'same triangles, same vertices, same order');
  }
  assert.ok(merged > 0 && merged < terrain.chunks.filter((ch) => ch.level >= 3).length, 'fewer draws than coarse chunks');
  // a member refining leaves the group and is drawn by itself; the group mesh is rebuilt without it
  camera.position.set(900, 60, 900); camera.updateMatrixWorld();
  for (let k = 0; k < 80 && terrain.update(camera.position, 40) > 0; k++);
  for (const g of terrain.groups.values()) for (const ch of g.chunks) assert.equal(ch.meshes[ch.level].visible, ch.level < 3);
});

test('time-sliced updates keep the current mesh until a finer one is complete, and settle like the eager path', () => {
  const make = () => { const f = rough(129, 5); f.glacier = new Uint8Array(f.h.length); f.rock = new Uint8Array(f.h.length);
    return new TerrainLOD(new THREE.Scene(), new THREE.MeshBasicMaterial(), f, { chunkCells: 32, levels: [1, 2, 4, 8], distances: [40, 80, 160], glacier: false, shadows: false }); };
  const eager = make(), sliced = make(), p = new THREE.Vector3(20, 40, 20);
  for (let k = 0; k < 40 && eager.update(p, 40) > 0; k++);
  let frames = 0;
  while (sliced.update(p, 3, null, 0.05) > 0 && frames++ < 5000) {
    for (const ch of sliced.chunks) assert.ok(ch.meshes[ch.level] && ch.meshes[ch.level].visible, 'every chunk always shows a complete mesh');
  }
  assert.ok(frames > 1, 'the work was spread over several updates');
  assert.deepEqual(sliced.chunks.map((ch) => ch.level), eager.chunks.map((ch) => ch.level));
  for (const ch of sliced.chunks) {
    const a = ch.meshes[ch.level].geometry, b = eager.chunks[sliced.chunks.indexOf(ch)].meshes[ch.level].geometry;
    assert.deepEqual(a.attributes.position.array, b.attributes.position.array);
  }
});
