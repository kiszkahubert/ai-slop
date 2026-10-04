import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Route } from '../../src/world/route.js';
import { routeCrevasse } from '../../src/world/routeHazards.js';
import { alignClimbingSummits, PEAKS, llToXZ } from '../../src/world/geo.js';

test('a ladder fissure cannot intersect a neighbouring route leg away from its ladder', () => {
  const route = new Route('bend', { points: [[0, 0], [100, 0], [100, 10], [0, 10]], tags: {} });
  const cv = routeCrevasse(route, 50, { length: 70, width: 4, angleOffset: 0 });
  assert.equal(cv, null, 'no safe site exists on this close hairpin');
});

test('a straight route retains a full-length ladder crossing', () => {
  const route = new Route('straight', { points: [[0, 0], [200, 0]], tags: {} });
  const cv = routeCrevasse(route, 100, { length: 70, width: 4, angleOffset: .2 });
  assert.equal(cv.len, 70);
  assert.equal(cv.ladder, true);
});

test('the new Icefall crossing that killed an on-route climber is fitted or relocated', () => {
  const data = JSON.parse(fs.readFileSync(new URL('../../assets/route.json', import.meta.url)));
  const route = new Route('main', data.main);
  const p = route.nearest(-5554.516419292635, -911.5109282439363);
  const cv = routeCrevasse(route, p.s, { length: 33.689544450026006, width: 3.064983468875289, angleOffset: 0 });
  if (!cv) return;
  for (let s = 0; s < route.L; s += .5) {
    const q = route.at(s), dx = q.x - cv.x, dz = q.z - cv.z;
    const u = Math.abs(dx * cv.ux + dz * cv.uz), v = Math.abs(-dx * cv.uz + dz * cv.ux);
    assert.ok(!(u > 2.2 && u < cv.len / 2 && v < cv.w / 2), 'route crosses the fissure off the ladder');
  }
});

test('climbing summit markers follow the regenerated route endpoints', () => {
  const original = PEAKS.map((p) => ({ ...p }));
  try {
    alignClimbingSummits({ main: { pts: [{ x: -12, z: 4 }] }, lhotse: { pts: [{ x: 836, z: 2880 }] } });
    for (const [id, x, z] of [['everest', -12, 4], ['lhotse', 836, 2880]]) {
      const p = PEAKS.find((p) => p.id === id), projected = llToXZ(p.lat, p.lon);
      assert.deepEqual([p.x, p.z], [x, z]);
      assert.ok(Math.abs(projected.x - x) < 1e-7 && Math.abs(projected.z - z) < 1e-7);
    }
    assert.equal(PEAKS.find((p) => p.id === 'everest').e, 8849);
  } finally {
    PEAKS.forEach((p, i) => Object.assign(p, original[i]));
  }
});
