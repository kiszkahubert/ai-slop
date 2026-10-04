import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CoreField } from '../../src/world/heightfield.js';
import { Route } from '../../src/world/route.js';

function fixture(options) {
  const g = { x0: 0, z0: 0, cell: 4, nx: 41, nz: 41 };
  const h = Float32Array.from({ length: g.nx * g.nz }, (_, o) => 6000 + (o % g.nx) * 2 + Math.floor(o / g.nx));
  const field = new CoreField(g, h, options);
  field.base = new CoreField(g, h, options);
  field.glacierBase = new Uint8Array(h.length).fill(255);
  const main = new Route('main', { points: [[20, 80], [40, 80], [60, 80], [80, 80], [100, 80], [120, 80]], tags: { geneva: 2 } });
  const lh = new Route('lhotse', { points: [[60, 80], [60, 100], [60, 120], [60, 140]], tags: { couloir: 1 } });
  return { field, routes: [main, lh], original: h.slice() };
}

test('native 4 m terrain keeps measured off-track heights and does not add couloir walls', () => {
  const { field, routes, original } = fixture({ refine: 1, proceduralDetail: false });
  field.refine(routes, []);
  assert.equal(field.cell, 4);
  assert.equal(field.nx, 41);
  assert.equal(field.height(140, 20), 6075, 'measured planar surface remains unchanged');
  assert.equal(field.height(72, 120), 6066, 'no synthetic nine-metre couloir wall');
  assert.deepEqual(field.base.h, original, 'walking-surface edits cannot corrupt measured face slopes');
  assert.notEqual(field.h, field.base.h, 'native-resolution processing owns its own height array');
});

test('native summit cap is local and leaves the source surface intact', () => {
  const { field, routes, original } = fixture({ refine: 1, proceduralDetail: false });
  field.refine(routes, [], 1, [{ x: 120, z: 80, e: 8849 }]);
  assert.equal(field.height(120, 80), 8849);
  assert.equal(field.height(144, 80), 6092, 'cap does not reshape the surrounding ridge');
  assert.deepEqual(field.base.h, original);
});

test('metadata can refine legacy grids without inventing terrain detail', () => {
  const { field, routes } = fixture({ refine: 2, proceduralDetail: false });
  field.refine(routes, []);
  assert.equal(field.cell, 2);
  assert.equal(field.nx, 81);
  assert.ok(Math.abs(field.height(138, 20) - 6074) < 1e-4);
  assert.ok(field.h.every(Number.isFinite));
});

test('face exposure keeps its physical sampling span on a finer DEM', () => {
  const { field } = fixture({ refine: 1, proceduralDetail: false });
  const x = 80, z = 80, index = 20 * field.nx + 21;
  const plane = Math.hypot(.5, .25);
  field.base.h[index] += 10; // a local ice bump 4 m east of the track
  assert.ok(field.slope(x, z, 4).mag > 1, 'the native surface still resolves the bump');
  assert.ok(Math.abs(field.faceSlope(x, z) - plane) < 1e-6, 'small relief does not change face exposure');
  field.base.h = Float32Array.from(field.base.h, (_, o) => 6000 + (o % field.nx) * 4);
  assert.ok(Math.abs(field.faceSlope(x, z) - 1) < 1e-6, 'a broad 45-degree face remains exposed');
});
