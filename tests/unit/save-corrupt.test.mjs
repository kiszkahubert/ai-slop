// Separate file = fresh module state: no in-memory save exists, as after a page reload.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
const { game, load, hasSave } = await import('../../src/sim/game.js');
game.field = { height: () => 5300, glacierAt: () => 0 };
const KEY = 'everestSim.v2.save';

test('a corrupt save (issue #2) is discarded instead of throwing', () => {
  store.set(KEY, '{bad json');
  assert.equal(hasSave(), false, 'Continue stays disabled for an unreadable save');
  assert.doesNotThrow(() => load());
  assert.equal(load(), false);
  assert.equal(store.has(KEY), false, 'bad save removed');
});

test('a structurally invalid save is rejected', () => {
  store.set(KEY, JSON.stringify({ v: 2, S: { tanks: 'nope' }, P: {} }));
  assert.equal(load(), false);
  store.set(KEY, JSON.stringify({ v: 1, S: {}, P: { x: 0, z: 0 }, time: 1 }));
  assert.equal(load(), false);
});
