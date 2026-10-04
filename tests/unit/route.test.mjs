import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Route, campsFor, ropeDefs, regionName } from '../../src/world/route.js';

const data = JSON.parse(fs.readFileSync(new URL('../../assets/route.json', import.meta.url)));
const routes = { main: new Route('main', data.main), lhotse: new Route('lhotse', data.lhotse) };

test('the main route runs from Base Camp to the summit of Everest', () => {
  const m = routes.main;
  for (const tag of ['ebc', 'c1', 'c2', 'bergschrund', 'c3', 'yellowband', 'geneva', 'c4', 'balcony', 'southsummit', 'hillary', 'everest']) {
    assert.ok(tag in m.tags, `missing ${tag}`);
  }
  const order = ['ebc', 'c1', 'c2', 'c3', 'yellowband', 'c4', 'balcony', 'southsummit', 'hillary'].map((t) => m.s(t));
  assert.deepEqual([...order].sort((a, b) => a - b), order, 'waypoints are in climbing order');
  assert.ok(m.L > 9000 && m.L < 12000, `route length ${m.L}`);
  const end = m.pts.at(-1);
  assert.ok(Math.hypot(end.x, end.z) < 200, 'route ends near the Everest summit (world origin)');
});

test('Route.at interpolates and clamps', () => {
  const m = routes.main;
  assert.deepEqual([m.at(-5).x, m.at(-5).z], [m.pts[0].x, m.pts[0].z]);
  const mid = m.at(m.L / 2);
  assert.ok(Math.abs(Math.hypot(mid.dx, mid.dz) - 1) < 1e-6, 'direction is a unit vector');
});

test('Route.nearest (indexed) agrees with the windowed search and finds on-route points', () => {
  const m = routes.main;
  for (const s of [0, 500, 3000, 6000, m.L - 1]) {
    const p = m.at(s), n = m.nearest(p.x, p.z);
    assert.ok(n.d < 1e-6 && Math.abs(n.s - s) < 1e-3, `s=${s}`);
    const w = m.nearest(p.x + 7, p.z - 3, n.i);
    assert.ok(Math.abs(w.d - m.nearest(p.x + 7, p.z - 3).d) < 1e-9);
  }
  assert.equal(m.nearestWithin(20000, 20000, 100), null);
});

test('camps, ropes and region names', () => {
  const camps = campsFor(routes);
  assert.deepEqual(camps.map((c) => c.id), ['ebc', 'c1', 'c2', 'c3', 'c4', 'lhotse_c4']);
  assert.equal(camps[0].stock, Infinity);
  const ropes = ropeDefs(routes);
  assert.ok(ropes.every((r) => r.s1 > r.s0));
  const c3 = camps.find((c) => c.id === 'c3');
  assert.equal(regionName(routes, camps, c3.x, c3.z, 7100), c3.name);
  const icefall = routes.main.at(routes.main.s('icefall_mid'));
  assert.equal(regionName(routes, camps, icefall.x, icefall.z, 5800), 'Khumbu Icefall');
  const top = routes.main.pts.at(-1);
  assert.equal(regionName(routes, camps, top.x, top.z, 8849), 'Summit of Mount Everest');
  assert.equal(regionName(routes, camps, 14000, 14000, 5000), 'Khumbu Glacier');     // far away: no crash
});
