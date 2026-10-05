import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { game, newGame, checkProgress, score } from '../../src/sim/game.js';
import { Route, campsFor } from '../../src/world/route.js';
import { debrief } from '../../src/sim/debrief.js';

const data = JSON.parse(fs.readFileSync(new URL('../../assets/route.json', import.meta.url)));
game.routes = Object.fromEntries(['main', 'lhotse', 'nuptse'].map((k) => [k, new Route(k, data[k])]));
game.camps = campsFor(game.routes);
game.field = { height: () => 6400, glacierAt: () => 1 };

test('Nuptse credits once and wins only after descending to Camp 2', () => {
  newGame(3); game.mode = 'play';
  const p = game.routes.nuptse.pts.at(-1);
  Object.assign(game.P, { ...p, y: 7861 });
  checkProgress(); checkProgress();
  assert.equal(game.S.summits.nuptse, true);
  assert.equal(game.S.summits.everest, false);
  assert.equal(game.mode, 'play');
  assert.equal(debrief.events.filter((e) => e.type === 'summit').length, 1);
  Object.assign(game.P, { ...game.routes.main.point('c2'), y: 6400 });
  checkProgress();
  assert.equal(game.mode, 'won');
  assert.equal(game.S.winShownFor, 1);
  game.mode = 'play'; checkProgress();
  assert.equal(game.mode, 'play', 'the same summit does not repeat the win');
});

test('free viewing gives no Nuptse credit and oxygen use below 8,000 m is recorded', () => {
  newGame(4, { free: true }); game.mode = 'play';
  Object.assign(game.P, { ...game.routes.nuptse.pts.at(-1), y: 7861 });
  checkProgress();
  assert.equal(game.S.summits.nuptse, false);
  game.free = false; game.S.o2on = true; checkProgress();
  assert.equal(game.S.summitNoO2.nuptse, false);
});

test('three summits retain the Everest/Lhotse bonus and add a triple bonus', () => {
  newGame(5);
  game.S.summits = { everest: true, lhotse: true, nuptse: false };
  const double = score();
  game.S.summits.nuptse = true;
  assert.equal(score() - double, 1500, '500 summit points plus 1,000 triple bonus');
});
test('a falling climber cannot claim a summit or finish the expedition', () => {
  newGame(6);game.mode='play';
  Object.assign(game.P,{...game.routes.nuptse.pts.at(-1),y:7861,falling:{t:1}});
  checkProgress();assert.equal(game.S.summits.nuptse,false);
  game.S.summits.nuptse=true;
  Object.assign(game.P,{...game.routes.main.point('c2'),y:6400});
  checkProgress();assert.equal(game.mode,'play');assert.equal(game.S.winShownFor,0);
  game.P.falling=null;checkProgress();assert.equal(game.mode,'won');
});
