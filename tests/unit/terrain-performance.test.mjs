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

// Charge field reads to a deterministic clock so scheduler tests also model a slower CPU.
function schedulerFixture(t, { nx = 129, nz = 129, height = (i, j) => i === 5 && j === 7 ? 30 : 0 } = {}) {
  let clock = 0, reads = 0;
  t.mock.method(performance, 'now', () => clock);
  const f = new CoreField({ x0: 0, z0: 0, cell: 4, nx, nz },
    Float32Array.from({ length: nx * nz }, (_, k) => height(k % nx, Math.floor(k / nx))));
  f.glacier = new Uint8Array(f.h.length); f.rock = new Uint8Array(f.h.length);
  const terrain = new TerrainLOD(new THREE.Scene(), new THREE.MeshBasicMaterial(), f,
    { chunkCells: 128, levels: [1, 2, 4], distances: [350, 900], glacier: false, shadows: false });
  const camera = new THREE.PerspectiveCamera(100, 1, .3, 40000);
  camera.position.set(1000, 50, 200); camera.lookAt(256, 0, 200);
  const read = f.heightAt.bind(f);
  f.heightAt = (i, j) => { clock += .01; reads++; return read(i, j); };
  return { f, terrain, camera, view: { camera, height: 720, pixelError: 2 }, now: () => clock, reads: () => reads };
}

test('screen-space errors pause within the update budget and resume without rereading vertices', t => {
  const { f, terrain, camera, view, now, reads } = schedulerFixture(t), ch = terrain.chunks[0];
  const expected = referenceError({ heightAt: (i, j) => f.h[j * f.nx + i] }, ch, 2);
  const before = now();
  assert.ok(terrain.update(camera.position, 0, view, 4) > 0, 'an unresolved LOD decision still counts as pending work');
  assert.ok(now() - before <= 5.3, 'only the final 64-vertex batch may overrun the cooperative deadline');
  assert.equal(ch.errors[1], undefined, 'an expensive measurement is not drained in one frame');
  const iterator = ch.errorJobs[1];
  assert.ok(iterator);
  let frames = 1;
  while (ch.errors[1] === undefined && frames++ < 200) {
    const start = now();
    terrain.update(camera.position, 0, view, 4);
    assert.ok(now() - start <= 5.3);
    if (ch.errors[1] === undefined) assert.equal(ch.errorJobs[1], iterator, 'resume the same measurement');
    assert.equal(ch.meshes[ch.level].visible, true);
  }
  assert.ok(frames > 1 && frames < 200);
  assert.equal(ch.errors[1], expected);
  assert.equal(reads(), 129 * 129 + 4 * 64 * 64, 'each native vertex and each coarse cell corner is read once');
});

test('finishing an error measurement and starting geometry share one frame deadline', t => {
  const { terrain, camera, view, now } = schedulerFixture(t), ch = terrain.chunks[0];
  let frames = 0, finalElapsed;
  while (ch.errors[1] === undefined && frames++ < 200) {
    const start = now();
    terrain.update(camera.position, 3, view, 4);
    finalElapsed = now() - start;
    assert.ok(finalElapsed <= 5.3, 'geometry must use the remaining error-measurement budget');
  }
  assert.equal(ch.errors[1], 30);
  assert.ok(finalElapsed > 0);
  assert.ok(terrain.building, 'geometry started with the remaining budget');
  assert.equal(ch.level, 2, 'the old complete mesh remains visible while refinement is unfinished');
  for (let k = 0; terrain.update(camera.position, 3, view, 4) > 0 && k < 200; k++);
  assert.equal(ch.level, 0);
});

test('a deferred LOD decision preserves a partial mesh, which resumes when its target is known', t => {
  const { terrain, camera, view, now } = schedulerFixture(t,
    { nx: 257, height: (i, j) => i <= 128 ? 1000 : i === 133 && j === 7 ? 20 : 0 });
  camera.position.set(0, 50, 200); camera.lookAt(512, 500, 200);
  const ch = terrain.chunks[1], create = t.mock.method(terrain, 'geometryJob');
  const iterator = terrain.geometryJob(ch, 1), cancel = t.mock.method(iterator, 'return');
  iterator.next();
  const pending = { ch, lv: 0, iterator };
  terrain.building = pending;
  const before = now();
  terrain.update(camera.position, 3, view, 4);
  assert.ok(terrain.building === pending, 'the original partial mesh remains pending');
  assert.ok(now() - before <= 5.3);
  assert.equal(cancel.mock.callCount(), 0, 'running out of measurement time does not invalidate the mesh');
  assert.equal(ch.level, 2);
  assert.equal(terrain.desiredLevel(ch, camera.position, view), 0, 'the pending refinement is still required');
  for (let k = 0; terrain.update(camera.position, 3, view, 4) > 0 && k < 400; k++);
  assert.equal(ch.level, 0);
  assert.equal(cancel.mock.callCount(), 0);
  assert.equal(create.mock.calls.filter(call => call.arguments[0] === ch && call.arguments[1] === 1).length, 1,
    'the native mesh finishes from its original iterator');
});

test('a resolved obsolete target cancels a partial mesh even when no build time remains', t => {
  const { terrain, now } = schedulerFixture(t), ch = terrain.chunks[0];
  const iterator = terrain.geometryJob(ch, 1), cancel = t.mock.method(iterator, 'return');
  iterator.next(); terrain.building = { ch, lv: 0, iterator };
  const before = now();
  terrain.update(new THREE.Vector3(10000, 10000, 10000), 3, null, 0);
  assert.equal(now(), before);
  assert.equal(cancel.mock.callCount(), 1);
  assert.equal(terrain.building, null);
  assert.equal(ch.level, 2);
});

test('flyby error measurements remain resumable when prediction ends and the current view takes over', t => {
  const { terrain, camera, view, now } = schedulerFixture(t), ch = terrain.chunks[0];
  terrain.prepare(camera, view, { timeMs: 4 });
  assert.equal(terrain.preparing.kind, 'error');
  const iterator = terrain.preparing.iterator;
  const handoff = now();
  terrain.update(camera.position, 3, view, 4);
  assert.ok(now() - handoff <= 5.3, 'the current view does not drain an active prefetch measurement');
  assert.equal(terrain.preparing, null);
  assert.equal(ch.errorJobs[1], iterator);
  terrain.prepare(camera, view, { timeMs: 4 });
  assert.equal(terrain.preparing.iterator, iterator);
  terrain.cancelPrepare();
  assert.equal(terrain.preparing, null);
  const start = now();
  terrain.update(camera.position, 3, view, 4);
  assert.ok(now() - start <= 5.3, 'prefetched errors are resumed, not drained');
  assert.equal(ch.errorJobs[1], iterator);
  assert.equal(ch.errors[1], undefined);
  for (let k = 0; terrain.update(camera.position, 3, view, 4) > 0 && k < 400; k++);
  assert.equal(ch.errors[1], 30);
  assert.equal(ch.level, 0);
});

test('the current view resumes a partly prepared flyby mesh instead of starting another build', t => {
  const { terrain, camera, view, now } = schedulerFixture(t, { height: () => 0 }), ch = terrain.chunks[0];
  ch.errors[1] = 0;
  const create = t.mock.method(terrain, 'geometryJob');
  terrain.prepare(camera, view, { timeMs: 4 });
  assert.equal(terrain.preparing.kind, 'geometry');
  const iterator = terrain.preparing.iterator, before = now();
  terrain.update(camera.position, 3, view, 4);
  assert.ok(now() - before <= 5.3);
  assert.equal(terrain.building.iterator, iterator);
  assert.equal(terrain.preparing, null);
  for (let k = 0; terrain.update(camera.position, 3, view, 4) > 0 && k < 200; k++);
  assert.equal(ch.level, 1);
  assert.equal(create.mock.callCount(), 1);
});
