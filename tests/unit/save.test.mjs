import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// minimal localStorage for Node
const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };

const { game, newGame, save, load, campAction } = await import('../../src/sim/game.js');
const { Route, campsFor } = await import('../../src/world/route.js');
const data = JSON.parse(fs.readFileSync(new URL('../../assets/route.json', import.meta.url)));
game.routes = { main: new Route('main', data.main), lhotse: new Route('lhotse', data.lhotse) };
game.camps = campsFor(game.routes);
game.field = { height: () => 5300, glacierAt: () => 0 };
const KEY = 'everestSim.v2.save';

beforeEach(() => store.clear());

test('save / load round trip keeps Base Camp stock infinite', () => {
  newGame(5);
  assert.equal(game.S.stock.ebc, Infinity);
  for (let i = 0; i < 200; i++) campAction('take', game.camps[0]), campAction('leave', game.camps[0]);
  assert.equal(game.S.stock.ebc, Infinity);
  save(true);
  game.S = {};
  assert.equal(load(), true);
  assert.equal(game.S.stock.ebc, Infinity);
  assert.equal(game.S.seed, 5);
});

test('a corrupt stored save falls back to this session\'s copy', () => {
  newGame(6); save(true);
  store.set(KEY, '{bad json');
  assert.equal(load(), true, 'in-memory copy is used');
  assert.equal(store.has(KEY), false, 'the corrupt stored save was removed');
});

test('free viewing never writes the expedition save', () => {
  newGame(9, { free: true });
  save(true);
  assert.equal(store.has(KEY), false);
});
