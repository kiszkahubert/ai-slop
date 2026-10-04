import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spo2Target, stepPhysiology, swapTank, isEmptyBottle, o2Flowing, packLoad } from '../../src/sim/physiology.js';
import { OXYGEN } from '../../src/config.js';

const stats = (o = {}) => ({ health: 100, stamina: 100, frost: 0, exh: 10, spo2: 80, accl: 6200, o2on: false, flow: 3, tanks: [300, 300], deathZoneHours: 0, ...o });
const env = { T: -25, wind: 30, wc: -38, vis: 60, sunEl: 0.5, cwm: false, exposure: 1 };
const mk = (y, S) => ({ S, P: { x: 0, z: 0, y }, env, time: 10, weather: null, field: { glacierAt: () => 0 } });

test('SpO2 falls with altitude and rises with oxygen flow and acclimatization', () => {
  const S = stats();
  assert.ok(spo2Target(S, 5300, 0) > spo2Target(S, 7000, 0));
  assert.ok(spo2Target(S, 7000, 0) > spo2Target(S, 8849, 0));
  assert.ok(spo2Target(stats({ o2on: true }), 8849, 0) > spo2Target(S, 8849, 0) + 10);
  assert.ok(spo2Target(stats({ accl: 7400 }), 8000, 0) > spo2Target(stats({ accl: 5200 }), 8000, 0));
});

function survive(y, S, maxHours) {
  const g = mk(y, S);
  for (let h = 0; h < maxHours; h += 1 / 60) {
    const cause = stepPhysiology(g, 1 / 60, { moving: false, sprint: false, grade: 0, resting: false });
    if (cause) return { died: true, hours: h, cause };
  }
  return { died: false, health: S.health };
}

test('the death zone kills without supplemental oxygen', () => {
  const r = survive(8400, stats(), 48);
  assert.ok(r.died, 'should die');
  assert.ok(r.hours > 2 && r.hours < 12, `died after ${r.hours.toFixed(1)} h`);
  assert.match(r.cause, /death zone/);
});

test('3 L/min keeps you alive at 8,400 m for 10 hours', () => {
  const r = survive(8400, stats({ o2on: true, tanks: [300, 300, 300] }), 10);
  assert.ok(!r.died && r.health > 80);
});

test('bottles: one empty threshold everywhere', () => {
  const S = stats({ o2on: true, tanks: [OXYGEN.emptyBar, 250] });
  assert.ok(isEmptyBottle(OXYGEN.emptyBar) && !isEmptyBottle(OXYGEN.emptyBar + 1));
  assert.equal(o2Flowing(S), false, 'an empty bottle on the regulator does not flow');
  swapTank(S, false);
  assert.deepEqual(S.tanks, [250]);
  assert.ok(o2Flowing(S));
  assert.ok(packLoad(stats({ tanks: [300, 300] })) > packLoad(stats({ tanks: [] })) + 7);
});

test('oxygen is consumed at the flow rate (4 L bottle, bar per minute = L/min / 4)', () => {
  const S = stats({ o2on: true, flow: 2, tanks: [300] }), g = mk(7000, S);
  stepPhysiology(g, 1, { moving: false, sprint: false, grade: 0, resting: false });
  assert.ok(Math.abs(S.tanks[0] - (300 - 30)) < 1e-6);
});
