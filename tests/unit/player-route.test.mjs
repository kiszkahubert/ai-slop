import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Route } from '../../src/world/route.js';
import { game } from '../../src/sim/game.js';
import { nearestRope, startAutopilot } from '../../src/sim/player.js';

test('autopilot can explicitly choose Nuptse at a shared camp, regardless of camera direction', () => {
  const main = new Route('main', { points: [[0, 0], [100, 0]], tags: { c2: 0 } });
  const nuptse = new Route('nuptse', { points: [[0, 0], [0, 100]], tags: { c2: 0 } });
  game.routes = { main, nuptse }; game.camps = [];
  Object.assign(game.P, { x: 0, z: 0 }); game.view.yaw = Math.PI / 2;
  assert.equal(startAutopilot({ routeName: 'nuptse', direction: 1 }), true);
  assert.equal(game.auto.route, nuptse);
  assert.equal(game.auto.dir, 1);
});

test('autopilot rope searches stay on the chosen route at overlapping branches', () => {
  const main = {}, nuptse = {};
  game.world = { ropes: [
    { route: main, pts: [{ x: 0, z: 0 }, { x: 100, z: 0 }] },
    { route: nuptse, pts: [{ x: 0, z: 2 }, { x: 100, z: 2 }] },
  ] };
  assert.equal(nearestRope(50, 0).rope, 0);
  assert.equal(nearestRope(50, 0, -1, 10, nuptse).rope, 1);
  assert.equal(nearestRope(50, 2, -1, 10, main).rope, 0);
  assert.equal(nearestRope(50, 0, 0, 10, main).rope, -1);
});
