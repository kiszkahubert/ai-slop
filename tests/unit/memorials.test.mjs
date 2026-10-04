import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Route } from '../../src/world/route.js';
import { MEMORIALS, placeMemorials } from '../../src/world/memorials.js';

// a straight route due north (-z), climbing 1 m per metre from 5,300 m
const pts = []; for (let i = 0; i <= 4000; i += 10) pts.push([0, -i]);
const tag = (h) => (h - 5300) / 10;
const main = new Route('main', { points: pts, tags: { ebc: 0, icefall_mid: tag(5600), c2: tag(6400), c4: tag(7950), balcony: tag(8400), southsummit: tag(8750) } });
const field = { height: (x, z) => 5300 - z };

test('every memorial is placed, off the trail, at its landmark or reported altitude', () => {
  const list = placeMemorials({ main }, field);
  assert.equal(list.length, MEMORIALS.length);
  const by = Object.fromEntries(list.map((m) => [m.id, m]));
  assert.ok(Math.abs(by.schmatz.y - 8300) < 3, `Schmatz at ${by.schmatz.y}`);
  assert.ok(Math.abs(by.fischer.y - 8440) < 3 && Math.abs(by.hall.y - 8758) < 3);
  for (const m of list) assert.ok(Math.abs(m.x) === Math.abs(m.side) && m.text.length > 60 && ['body', 'memorial'].includes(m.kind), m.id);
  // the trail heads north (-z): positive side is to the east, on the right going up
  assert.ok(by.fischer.x > 0 && by.babuchiri.x < 0);
});

test('only remains reported in place are shown as bodies', () => {
  assert.deepEqual(MEMORIALS.filter((m) => m.kind === 'body').map((m) => m.id).sort(), ['fischer', 'hall']);
});
