import { test } from 'node:test';
import assert from 'node:assert/strict';
import { game } from '../../src/sim/game.js';
import { toggleSkis, updateSki } from '../../src/sim/ski.js';
import { CrevasseField } from '../../src/world/crevasses.js';

// a plane falling away to the south (+z) at the given gradient
function slopeWorld(grad) {
  const height = (x, z) => 6000 - grad * z;
  game.field = { height, slope: () => ({ gx: 0, gz: -grad, mag: grad }), rock: null, x0: -1e5, x1: 1e5, z0: -1e5, z1: 1e5 };
  game.world = { crevasses: [], seracGrid: new Map() };
  game.free = true; game.mode = 'play'; game.auto = null;
  game.S = { stamina: 100, exh: 0, health: 100, distance: 0 };
  Object.assign(game.P, { x: 0, z: 0, y: 6000, falling: null, clipped: -1, ski: null });
  game.view.yaw = 0;
}
const SOUTH = Math.PI, EAST = -Math.PI / 2;      // facing angles: direction (-sin, -cos)
const run = (s, ctl = null) => { for (let t = 0; t < s; t += 1 / 60) updateSki(1 / 60, ctl); };

test('skis pointed down the fall line accelerate, to a bounded top speed', () => {
  slopeWorld(0.5);
  game.P.facing = SOUTH; toggleSkis();
  run(4);
  const v4 = game.P.ski.speed;
  assert.ok(v4 > 8, `speed after 4 s: ${v4}`);
  assert.ok(game.P.z > 15 && game.P.y < 5990);
  run(60);
  assert.ok(game.P.ski.speed > v4 && game.P.ski.speed < 45, `terminal speed ${game.P.ski.speed}`);
});

test('a tuck is faster than standing up', () => {
  slopeWorld(0.5); game.P.facing = SOUTH; toggleSkis(); run(30);
  const upright = game.P.ski.speed;
  slopeWorld(0.5); game.P.facing = SOUTH; toggleSkis(); run(30, { dx: 0, dz: 0, sprint: true });
  assert.ok(game.P.ski.speed > upright + 3, `tuck ${game.P.ski.speed} vs ${upright}`);
});

test('edges hold a traverse across the slope', () => {
  slopeWorld(0.6);
  game.P.facing = EAST; toggleSkis();
  run(5);
  assert.ok(Math.abs(game.P.z) < 0.5, `slid ${game.P.z} m down the hill`);
  assert.ok(game.P.ski.speed < 0.5);
});

test('carving turns the skis toward the direction you steer', () => {
  slopeWorld(0.3);
  game.P.facing = SOUTH; toggleSkis(); run(3);
  const h0 = game.P.ski.h;
  run(0.5, { dx: 1, dz: 0, sprint: false });             // steer east
  assert.ok(Math.abs(game.P.ski.h - h0) > 0.5);
  assert.ok(game.P.x > 0.5, 'curves away east');
});

test('snowplough brakes to a stop, and the skis only come off when slow', () => {
  slopeWorld(0.15);
  game.P.facing = SOUTH; toggleSkis();
  game.P.ski.u = 20; run(0.1);
  assert.equal(toggleSkis(), false, 'refuses at speed');
  assert.ok(game.P.ski);
  run(10, { dx: 0, dz: -1, sprint: false });             // push back uphill = brake
  assert.ok(game.P.ski.speed < 1, `still at ${game.P.ski.speed}`);
  assert.equal(toggleSkis(), true);
  assert.equal(game.P.ski, null);
});

test('a ski crossing is ballistic: equal speed clears a narrow gap but tumbles into a wide one',()=>{
  const outcomes=[];
  for(const width of [1,8]) {
    slopeWorld(0);game.field.cell=4;
    game.world.crevasseField=new CrevasseField(game.field,[{x:0,z:0,ux:1,uz:0,len:40,w:width,ladder:false}]);
    const route={pts:[{x:9999,z:9999}],nearestWithin:()=>null};
    game.routes={main:route,lhotse:route,nuptse:route};game.camps=[];
    game.physics={groundHeight:game.field.height,startFall:({velocity})=>{game.P.falling={reason:'crevasse',velocity};game.P.ski=null;}};
    Object.assign(game.P,{x:0,z:-width/2-.2,y:6000,facing:SOUTH});toggleSkis();game.P.ski.u=12;
    let airborne=false;
    for(let i=0;i<90&&!game.P.falling;i++){updateSki(1/120,{dx:0,dz:0});airborne ||=!!game.P.ski?.air;}
    outcomes.push({airborne,fell:!!game.P.falling,skis:!!game.P.ski,z:game.P.z});
  }
  assert.ok(outcomes.every(o=>o.airborne));assert.ok(outcomes[0].skis&&!outcomes[0].fell&&outcomes[0].z>.5);
  assert.ok(outcomes[1].fell&&!outcomes[1].skis);game.physics=null;
});
