import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Weather, windChill, sunDirection } from '../../src/sim/weather.js';

test('weather is deterministic per seed', () => {
  const a = new Weather(42), b = new Weather(42), c = new Weather(43);
  assert.deepEqual(a.sample(77.3), b.sample(77.3));
  assert.notDeepEqual(a.sample(77.3), c.sample(77.3));
});

test('wind rises with altitude and the jet stream; summit windows exist', () => {
  const w = new Weather(7);
  for (let t = 0; t < 300; t += 7) assert.ok(w.wind(8849, t) >= w.wind(5300, t));
  const summitWinds = Array.from({ length: 300 }, (_, t) => w.wind(8849, t));
  assert.ok(Math.min(...summitWinds) < 45, 'there is at least one calm-ish window');
  assert.ok(Math.max(...summitWinds) > 90, 'and jet-stream days');
});

test('clear-skies override (free viewing)', () => {
  const w = new Weather(1); w.clear = true;
  assert.equal(w.sample(123).S, 0);
  assert.ok(w.visibilityKm(123) > 50);
});

test('wind chill and the sun', () => {
  assert.ok(windChill(-20, 60) < -30);
  assert.equal(windChill(15, 60), 15);
  const v = { set(x, y, z) { Object.assign(this, { x, y, z }); } };
  assert.ok(sunDirection(12, v) > 1.0 && v.z > 0, 'noon sun is high in the south');
  assert.ok(sunDirection(0, v) < 0, 'midnight sun is below the horizon');
  sunDirection(7, v); assert.ok(v.x > 0, 'morning sun is in the east');
});
