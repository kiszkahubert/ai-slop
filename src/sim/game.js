// Game state, progress (camps, landmarks, summits, win), camps (rest, oxygen) and saving.
import { START_TIME_H, OXYGEN, DEATH_ZONE } from '../config.js';
import { emit, toast } from '../core/events.js';
import { fmt, timeOfDay, dayOf } from '../core/math.js';
import { Weather } from './weather.js';
import { stepPhysiology, conditionsAt, maxStamina, o2Flowing, swapTank } from './physiology.js';
import { LANDMARKS, regionName } from '../world/route.js';

const SAVE_KEY = 'everestSim.v2.save';

export const game = {
  mode: 'loading',        // loading | title | play | paused | camp | dead | won
  time: START_TIME_H,     // game hours since Day 1 00:00
  S: {},                  // climber stats, inventory and progress
  P: { x: 0, z: 0, y: 0, facing: 0, moving: false, sprint: false, grade: 0, falling: null, onLadder: false, clipped: -1, phase: 0, routeHint: -1 },
  view: { yaw: 0, pitch: -0.15, dist: 7, fp: false },
  env: { T: 0, wind: 0, wc: 0, vis: 60, sunEl: 0, cwm: false, exposure: 1 },
  auto: null,             // route-following autopilot state
  field: null, backdrop: null, routes: null, camps: null, world: null, weather: null,
};

export function newGame(seed) {
  const g = game;
  g.S = {
    seed, health: 100, stamina: 100, frost: 0, exh: 8, spo2: 85, accl: 5200, maxAlt: 0,
    o2on: false, flow: 2, tanks: [OXYGEN.bottleBar, OXYGEN.bottleBar],
    summits: { everest: false, lhotse: false }, summitTimes: {}, summitNoO2: {},
    usedO2InDZ: false, deathZoneHours: 0, stock: Object.fromEntries(g.camps.map((c) => [c.id, c.stock === Infinity ? 99 : c.stock])),
    visited: { ebc: true }, landmarks: {}, cause: null, winShownFor: 0, falls: 0, distance: 0, turnWarned: false, inDZ: false,
  };
  g.time = START_TIME_H;
  g.weather = new Weather(seed);
  const m = g.routes.main, a = m.at(m.s('ebc') + 20), b = m.at(m.s('ebc') + 60);
  Object.assign(g.P, { x: a.x - a.dz * 4, z: a.z + a.dx * 4, falling: null, clipped: -1, onLadder: false, routeHint: -1 });
  g.P.y = g.field.height(g.P.x, g.P.z);
  g.view.yaw = Math.atan2(-(b.x - a.x), -(b.z - a.z)); g.P.facing = g.view.yaw; g.view.pitch = -0.1;
  g.S.maxAlt = g.P.y;
  g.auto = null;
  refreshConditions();
}

export function refreshConditions() {
  const P = game.P;
  game.env = conditionsAt(game, P.x, P.z, P.y, game.time, false, game.env.exposure || 1);
}

export const region = () => regionName(game.routes, game.camps, game.P.x, game.P.z, game.P.y);

export function nearCamp(x, z) {
  for (const c of game.camps) if (Math.hypot(c.x - x, c.z - z) < (c.id === 'ebc' ? 55 : 30)) return c;
  return null;
}

export function die(cause) {
  if (game.mode === 'dead') return;
  game.mode = 'dead'; game.S.cause = cause; game.auto = null;
  emit('death', cause);
}

/** Landmarks, camps, the death-zone banner, summits and the win condition. */
export function checkProgress() {
  const { S, P, routes } = game;
  if (P.y > S.maxAlt) S.maxAlt = P.y;
  for (const route of [routes.main, routes.lhotse]) for (const [tag, i] of Object.entries(route.tags)) {
    if (S.landmarks[tag] || !LANDMARKS[tag]) continue;
    const p = route.pts[i];
    if (Math.hypot(p.x - P.x, p.z - P.z) < 30) { S.landmarks[tag] = true; toast(LANDMARKS[tag], 'info', 7); }
  }
  const camp = nearCamp(P.x, P.z);
  if (camp && !S.visited[camp.id]) {
    S.visited[camp.id] = true;
    toast(`Reached ${camp.name} — ${fmt(camp.elevation)} m. Press E to rest, change bottles and save.`, 'good', 7);
  }
  if (P.y > DEATH_ZONE && !S.inDZ) {
    S.inDZ = true; emit('deathzone');
    if (!o2Flowing(S)) toast('You are above 8,000 m without supplemental oxygen. Press O!', 'bad', 6);
  } else if (P.y < DEATH_ZONE - 20) S.inDZ = false;
  const ev = routes.main.pts[routes.main.pts.length - 1], lh = routes.lhotse.pts[routes.lhotse.pts.length - 1];
  if (!S.summits.everest && Math.hypot(P.x - ev.x, P.z - ev.z) < 10 && P.y > 8835) {
    S.summits.everest = true; S.summitTimes.everest = game.time; S.summitNoO2.everest = !S.usedO2InDZ;
    toast('SUMMIT! You are standing on top of the world — Mount Everest, 8,849 m. Now get down alive.', 'good', 10);
    emit('summit', 'everest');
  }
  if (!S.summits.lhotse && Math.hypot(P.x - lh.x, P.z - lh.z) < 10 && P.y > 8500) {
    S.summits.lhotse = true; S.summitTimes.lhotse = game.time; S.summitNoO2.lhotse = !S.usedO2InDZ;
    toast('SUMMIT! Lhotse, 8,516 m — the fourth-highest mountain on Earth. Now descend to Camp 2.', 'good', 10);
    emit('summit', 'lhotse');
  }
  const c2 = game.camps.find((c) => c.id === 'c2');
  const n = (S.summits.everest ? 1 : 0) + (S.summits.lhotse ? 1 : 0);
  if (n > S.winShownFor && Math.hypot(c2.x - P.x, c2.z - P.z) < 35) {
    S.winShownFor = n; game.mode = 'won'; game.auto = null; emit('win');
  }
}

export function score() {
  const S = game.S;
  let s = 0;
  if (S.summits.everest) s += 1000 * (S.summitNoO2.everest ? 1.5 : 1);
  if (S.summits.lhotse) s += 700 * (S.summitNoO2.lhotse ? 1.5 : 1);
  if (S.summits.everest && S.summits.lhotse) s += 1500;
  s += Math.round(S.health * 3) - Math.round(S.frost * 4) - S.falls * 50 - Math.round(Math.max(0, game.time - 96) * 2);
  return Math.max(0, s);
}

// ---------------- camps
export function restHours(hours) {
  const steps = Math.max(1, Math.ceil(hours * 10)), dtH = hours / steps;
  for (let k = 0; k < steps; k++) {
    game.time += dtH;
    const cause = stepPhysiology(game, dtH, { resting: true, moving: false, sprint: false, grade: 0 });
    if (cause) { die(cause); return false; }
  }
  game.S.stamina = maxStamina(game.S); game.S.winded = false;
  refreshConditions();
  save(true);
  toast(`Rested ${hours} h — ${timeOfDay(game.time)}, Day ${dayOf(game.time)}. Progress saved.`, 'good');
  return true;
}

export function campAction(act, camp) {
  const S = game.S, full = OXYGEN.bottleBar;
  if (act === 'take' && S.stock[camp.id] > 0 && S.tanks.length < OXYGEN.maxCarried) {
    S.stock[camp.id]--; S.tanks.push(full);
    if (S.tanks[0] < 1) S.tanks.sort((a, b) => b - a);
    toast(`Took a full bottle (${S.tanks.length} carried).`, 'good');
  }
  if (act === 'leave') {
    const i = S.tanks.findIndex((p) => p > full - 10);
    if (i >= 0) { S.tanks.splice(i, 1); S.stock[camp.id]++; toast(`Cached a full bottle at ${camp.short}.`, 'good'); }
  }
  if (act === 'swap') {
    if (S.tanks.length && S.tanks[0] < full - 10 && S.stock[camp.id] > 0 && !S.tanks.slice(1).some((p) => p > S.tanks[0])) {
      S.tanks[0] = full; S.stock[camp.id]--; toast('Fitted a fresh bottle from the camp stock.', 'good');
    } else { S.tanks.sort((a, b) => b - a); toast('Regulator moved to the fullest bottle.'); }
  }
  if (act === 'dump') S.tanks = S.tanks.filter((p) => p >= 20);
}

export function toggleO2() {
  const S = game.S;
  if (!S.o2on && !S.tanks.length) { toast('No oxygen bottles carried.', 'warn'); return; }
  S.o2on = !S.o2on;
  if (S.o2on && !o2Flowing(S)) swapTank(S, false);
  toast(S.o2on ? `Oxygen ON — ${S.flow} L/min.` : 'Oxygen OFF.', S.o2on ? 'info' : 'warn', 2.5);
}
export function setFlow(f) {
  game.S.flow = Math.max(1, Math.min(4, f));
  toast(`Oxygen flow ${game.S.flow} L/min${game.S.o2on ? '' : ' (flow is off — press O)'}`, 'info', 2);
}

// ---------------- save / load
let lastSave = null;
function serialize() {
  const P = game.P;
  return JSON.stringify({ v: 2, S: game.S, P: { x: P.x, z: P.z, facing: P.facing, clipped: P.clipped }, time: game.time, yaw: game.view.yaw });
}
export function save(silent) {
  lastSave = serialize();
  try { localStorage.setItem(SAVE_KEY, lastSave); } catch { /* private mode: keep the in-memory copy */ }
  if (!silent) toast('Progress saved.', 'good');
}
export function hasSave() {
  try { if (localStorage.getItem(SAVE_KEY)) return true; } catch { /* ignore */ }
  return !!lastSave;
}
export function load() {
  let raw = null;
  try { raw = localStorage.getItem(SAVE_KEY); } catch { /* ignore */ }
  raw = raw || lastSave;
  if (!raw) return false;
  const d = JSON.parse(raw);
  game.S = d.S; game.S.stock.ebc = 99;
  Object.assign(game.P, { x: d.P.x, z: d.P.z, facing: d.P.facing, clipped: d.P.clipped ?? -1, falling: null, routeHint: -1 });
  game.P.y = game.field.height(game.P.x, game.P.z);
  game.time = d.time; game.view.yaw = d.yaw; game.auto = null;
  game.weather = new Weather(game.S.seed);
  refreshConditions();
  return true;
}
