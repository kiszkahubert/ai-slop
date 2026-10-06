// Game state, progress (camps, landmarks, summits, win), camps (rest, oxygen) and saving.
import { START_TIME_H, OXYGEN, DEATH_ZONE } from '../config.js';
import { emit, toast } from '../core/events.js';
import { fmt, timeOfDay, dayOf, clamp } from '../core/math.js';
import { Weather } from './weather.js';
import { stepPhysiology, conditionsAt, maxStamina, o2Flowing, swapTank, isEmptyBottle, spo2Target } from './physiology.js';
import { resetDebrief, recordSample } from './debrief.js';
import { LANDMARKS, regionName, CLIMBS, reachedSummits } from '../world/route.js';
import { CHECKPOINT_RADIUS } from '../world/memorials.js';

const SAVE_KEY = 'everestSim.v2.save';

export const game = {
  mode: 'loading',        // loading | title | play | paused | camp | dead | won
  time: START_TIME_H,     // game hours since Day 1 00:00
  S: {},                  // climber stats, inventory and progress
  P: { x: 0, z: 0, y: 0, facing: 0, moving: false, sprint: false, grade: 0, falling: null, onLadder: false, clipped: -1, phase: 0, routeHint: -1, ski: null },
  view: { yaw: 0, pitch: -0.15, dist: 7, fp: false },
  env: { T: 0, wind: 0, wc: 0, vis: 60, sunEl: 0, cwm: false, exposure: 1 },
  auto: null,             // route-following autopilot state
  free: false,            // free viewing: teleport anywhere, survival systems off, nothing saved
  debug: false,           // ?debug in the URL
  speedMul: 1,            // walk-speed multiplier (debug and free viewing only)
  field: null, backdrop: null, routes: null, camps: null, world: null, weather: null,
};

function freshStats(seed) {
  return {
    seed, health: 100, stamina: 100, frost: 0, exh: 8, spo2: 85, accl: 5200, maxAlt: 0,
    o2on: false, flow: 2, tanks: [OXYGEN.bottleBar, OXYGEN.bottleBar],
    summits: Object.fromEntries(CLIMBS.map((c) => [c.id, false])), summitTimes: {}, summitNoO2: {},
    usedO2InDZ: false, usedO2Above7000: false, deathZoneHours: 0, stock: Object.fromEntries(game.camps.map((c) => [c.id, c.stock])),   // Base Camp: Infinity
    visited: { ebc: true }, landmarks: {}, checkpoints: {}, cause: null, winShownFor: 0, falls: 0, distance: 0, turnWarned: false, inDZ: false, nearCampId: null,
  };
}

export function newGame(seed, { free = false } = {}) {
  const g = game;
  g.physics?.reset();
  resetDebrief();
  g.free = free;
  g.S = freshStats(seed);
  g.time = START_TIME_H;
  g.weather = new Weather(seed);
  const m = g.routes.main, a = m.at(m.s('ebc') + 20), b = m.at(m.s('ebc') + 60);
  Object.assign(g.P, { x: a.x - a.dz * 4, z: a.z + a.dx * 4, falling: null, clipped: -1, onLadder: false, routeHint: -1, ski: null, lastSupported:null });
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
  recordSample(game, false, true);
  emit('death', cause);
}

/** Landmarks, camps, the death-zone banner, summits and the win condition. */
export function checkProgress() {
  const { S, P, routes } = game;
  if (P.y > S.maxAlt) S.maxAlt = P.y;
  checkMemorials();
  if (game.free || P.falling) return; // Summit and safe-return credit require a standing climber.
  if (P.y > 7000 && o2Flowing(S)) S.usedO2Above7000 = true;
  for (const route of Object.values(routes)) for (const [tag, i] of Object.entries(route.tags)) {
    if (S.landmarks[tag] || !LANDMARKS[tag]) continue;
    const p = route.pts[i];
    if (Math.hypot(p.x - P.x, p.z - P.z) < 30) { S.landmarks[tag] = true; toast(LANDMARKS[tag], 'info', 7); }
  }
  const camp = nearCamp(P.x, P.z);
  if (camp && !S.visited[camp.id]) {
    S.visited[camp.id] = true;
    toast(`Reached ${camp.name} — ${fmt(camp.elevation)} m. Press E to rest, change bottles and save.`, 'good', 7);
  }
  if (camp && S.nearCampId !== camp.id) { S.nearCampId = camp.id; emit('camp', camp); }
  else if (!camp) S.nearCampId = null;
  if (P.y > DEATH_ZONE && !S.inDZ) {
    S.inDZ = true; emit('deathzone');
    if (!o2Flowing(S)) toast('You are above 8,000 m without supplemental oxygen. Press O!', 'bad', 6);
  } else if (P.y < DEATH_ZONE - 20) S.inDZ = false;
  for (const c of CLIMBS) {
    const p = routes[c.route].pts.at(-1);
    if (!S.summits[c.id] && Math.hypot(P.x - p.x, P.z - p.z) < 10 && P.y > c.minElevation) {
      S.summits[c.id] = true; S.summitTimes[c.id] = game.time;
      S.summitNoO2[c.id] = !(c.e > DEATH_ZONE ? S.usedO2InDZ : S.usedO2Above7000);
      S.maxAlt = Math.max(S.maxAlt, c.e);
      toast(`SUMMIT! ${c.name}, ${fmt(c.e)} m. Now descend to Camp 2.`, 'good', 10);
      emit('summit', c.id);
    }
  }
  const c2 = game.camps.find((c) => c.id === 'c2');
  const n = reachedSummits(S).length;
  if (n > S.winShownFor && Math.hypot(c2.x - P.x, c2.z - P.z) < 35) {
    S.winShownFor = n; game.mode = 'won'; game.auto = null; emit('win');
  }
}

/**
 * The dead of the route are checkpoints: passing one tells their story and, on a real expedition, saves progress
 * there unless you are in no state to carry on from it.
 */
const seenInFreeView = new Set();
const story = (m) => (m.text.startsWith(m.title) ? m.text : `${m.title} — ${m.text}`);
function checkMemorials() {
  const { S, P } = game, list = game.world?.memorials || [];
  for (const m of list) {
    if (Math.hypot(m.x - P.x, m.z - P.z) > CHECKPOINT_RADIUS) continue;
    if (game.free) {
      if (!seenInFreeView.has(m.id)) { seenInFreeView.add(m.id); toast(story(m), 'memorial', 14); }
      continue;
    }
    S.checkpoints ||= {};
    if (S.checkpoints[m.id]) continue;
    S.checkpoints[m.id] = true;
    const canSave = !P.falling && S.health > 30 && game.mode === 'play';
    toast(story(m), 'memorial', 14);
    emit('checkpoint', m);
    if (canSave) { save(true); toast(`Checkpoint ${Object.keys(S.checkpoints).length}/${list.length} — progress saved.`, 'good', 4); }
    else toast('Checkpoint reached, but you are in no state to save here.', 'warn', 4);
  }
}

export function score() {
  const S = game.S;
  let s = 0;
  for (const c of reachedSummits(S)) s += c.points * (S.summitNoO2[c.id] ? 1.5 : 1);
  if (S.summits.everest && S.summits.lhotse) s += 1500;
  if (reachedSummits(S).length === CLIMBS.length) s += 1000;
  s += Math.round(S.health * 3) - Math.round(S.frost * 4) - S.falls * 50 - Math.round(Math.max(0, game.time - 96) * 2);
  return Math.max(0, s);
}

// ---------------- camps
export function restHours(hours) {
  if (game.free) { game.time += hours; refreshConditions(); return true; }
  const steps = Math.max(1, Math.ceil(hours * 10)), dtH = hours / steps;
  for (let k = 0; k < steps; k++) {
    game.time += dtH;
    const cause = stepPhysiology(game, dtH, { resting: true, moving: false, sprint: false, grade: 0 });
    if (cause) { die(cause); return false; }
    recordSample(game, true);
  }
  game.S.stamina = maxStamina(game.S); game.S.winded = false;
  refreshConditions();
  save(true);
  emit('rest', hours, nearCamp(game.P.x, game.P.z)?.short);
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
  if (act === 'dump') S.tanks = S.tanks.filter((p) => !isEmptyBottle(p));
}

export function toggleO2() {
  const S = game.S;
  if (!S.o2on && !S.tanks.length) { toast('No oxygen bottles carried.', 'warn'); return; }
  S.o2on = !S.o2on;
  if (S.o2on && !o2Flowing(S)) swapTank(S, false);
  toast(S.o2on ? `Oxygen ON — ${S.flow} L/min.` : 'Oxygen OFF.', S.o2on ? 'info' : 'warn', 2.5);
  emit('o2', S.o2on, S.flow);
}
export function setFlow(f) {
  game.S.flow = Math.max(1, Math.min(4, f));
  toast(`Oxygen flow ${game.S.flow} L/min${game.S.o2on ? '' : ' (flow is off — press O)'}`, 'info', 2);
  emit('o2', game.S.o2on, game.S.flow);
}

// ---------------- save / load
let lastSave = null;
function serialize() {
  const P = game.P;
  return JSON.stringify({ v: 2, S: game.S, P: { x: P.x, z: P.z, facing: P.facing, clipped: P.clipped }, time: game.time, yaw: game.view.yaw });
}
export function save(silent) {
  if (game.free) return;            // free viewing never overwrites the expedition save
  if(game.P.falling || game.P.ski?.air || (game.physics?.avalanche && !game.physics.avalanche.settled)) { if(!silent) toast('Cannot save during a fall, airborne crossing or moving avalanche.', 'warn', 3); return; }
  lastSave = serialize();
  try { localStorage.setItem(SAVE_KEY, lastSave); } catch { /* private mode: keep the in-memory copy */ }
  if (!silent) toast('Progress saved.', 'good');
}
function parseSave(raw) {
  try {
    const d = JSON.parse(raw);
    const ok = d && d.v === 2 && d.S && typeof d.S === 'object' && Array.isArray(d.S.tanks) && d.S.stock && d.S.summits &&
      d.P && Number.isFinite(d.P.x) && Number.isFinite(d.P.z) && Number.isFinite(d.time);
    return ok ? d : null;
  } catch { return null; }
}
/** The stored save, else this session's in-memory copy. Unreadable saves are discarded, never thrown. */
function readSave() {
  let stored = null;
  try { stored = localStorage.getItem(SAVE_KEY); } catch { /* storage blocked */ }
  if (stored) {
    const d = parseSave(stored);
    if (d) return d;
    // a corrupt or incompatible save must not brick "Continue": discard it and say so
    try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
    toast('The saved expedition was unreadable and has been discarded.', 'bad', 7);
  }
  if (lastSave) {
    const d = parseSave(lastSave);
    if (d) return d;
    lastSave = null;
  }
  return null;
}
export function hasSave() {
  try { const s = localStorage.getItem(SAVE_KEY); if (s && parseSave(s)) return true; } catch { /* ignore */ }
  return !!lastSave && !!parseSave(lastSave);
}
export function load() {
  const d = readSave();
  if (!d) return false;
  game.physics?.reset();
  game.S = d.S; game.S.stock.ebc = Infinity;       // JSON stores Infinity as null
  // Older v2 saves predate Nuptse; keep their inventory and completed summits.
  game.S.summits.nuptse ??= false;
  game.S.usedO2Above7000 ??= !!game.S.usedO2InDZ;
  for (const c of game.camps) game.S.stock[c.id] ??= c.stock;
  Object.assign(game.P, { x: d.P.x, z: d.P.z, facing: d.P.facing, clipped: d.P.clipped ?? -1, falling: null, routeHint: -1, ski: null });
  game.P.y = game.field.height(game.P.x, game.P.z);
  const safe=game.world?.crevasseField?.safePosition(game.P.x,game.P.z);if(safe)Object.assign(game.P,safe);
  game.P.lastSupported=null;
  game.time = d.time; game.view.yaw = d.yaw; game.auto = null; game.free = false;
  game.weather = new Weather(game.S.seed);
  resetDebrief();
  refreshConditions();
  return true;
}

// ---------------- free viewing
/** Places you can teleport to in free viewing, in route order. */
export function destinations() {
  const m = game.routes.main, l = game.routes.lhotse, n = game.routes.nuptse;
  const list = [
    ['ebc', 'Everest Base Camp', m, m.s('ebc') + 20, 1],
    ['icefall_mid', 'Khumbu Icefall', m, m.s('icefall_mid'), 1],
    ['c1', 'Camp 1', m, m.s('c1'), 1],
    ['c2', 'Camp 2 · ABC', m, m.s('c2'), 1],
    ['c3', 'Camp 3 · Lhotse Face', m, m.s('c3'), 1],
    ['yellowband', 'Yellow Band', m, m.s('yellowband'), 1],
    ['c4', 'Camp 4 · South Col', m, m.s('c4'), 1],
    ['balcony', 'The Balcony', m, m.s('balcony'), 1],
    ['southsummit', 'South Summit', m, m.s('southsummit'), 1],
    ['hillary', 'Hillary Step', m, m.s('hillary'), 1],
    ['everest', 'Summit of Mount Everest', m, m.L - 7, 1],      // just below the top, facing the summit
    ['lhotse_c4', 'Lhotse Camp 4', l, l.s('lhotse_c4'), 1],
    ['couloir', 'Lhotse Couloir', l, l.s('couloir'), 1],
    ['lhotse', 'Summit of Lhotse', l, l.L - 7, 1],
    ['nuptse_bergschrund', 'Nuptse North Face', n, n.s('nuptse_bergschrund'), 1],
    ['nuptse_c3', 'Nuptse High Camp', n, n.s('nuptse_c3'), 1],
    ['nuptse_rib', 'Nuptse North Rib', n, n.s('nuptse_rib'), 1],
    ['nuptse', 'Summit of Nuptse', n, n.L, -1],
  ];
  return list.map(([id, name, route, s, dir]) => {
    const climb = CLIMBS.find((c) => c.id === id), summit = !!climb, p = route.at(s);
    const elevation = summit ? climb.e : game.field.height(p.x, p.z);   // summits: surveyed height
    return { id, name, route, s, dir, elevation, summit };
  });
}

export function enterFreeViewing() {
  if (game.free) return;
  game.free = true; game.auto = null;
  toast('Free viewing: teleport anywhere with T, survival systems are off. Your saved expedition is kept.', 'info', 7);
}

/**
 * Leave free viewing where you stand and climb on from there for real: a fresh expedition at this spot, with
 * the acclimatization of a climber who did the rotations and oxygen on if you are high. The old save is
 * kept until you next rest or save at a camp.
 */
export function exitFreeViewing() {
  if (!game.free) return;
  if(game.P.falling || game.P.ski?.air) {toast('Return to supported ground with teleport or Shift+B before starting an expedition.', 'warn', 4);return false;}
  const { P } = game;
  game.free = false; game.auto = null; game.weather.clear = false;
  const S = game.S = freshStats(game.S.seed);
  S.accl = clamp(P.y - 600, 5200, 7000);
  if (P.y > 7000) S.o2on = true;
  S.spo2 = spo2Target(S, P.y, 0); S.maxAlt = P.y;
  S.visited = Object.fromEntries(game.camps.filter((c) => c.id === 'ebc' || c.elevation < P.y - 50).map((c) => [c.id, true]));
  resetDebrief();
  refreshConditions();
  recordSample(game, false, true);
  toast(`Expedition on from ${region()} at ${fmt(P.y)} m — survival systems are back on${S.o2on ? ', oxygen flowing at 2 L/min' : ''}.`, 'warn', 7);
}

/** Walk-speed multiplier for debugging; it applies in free viewing and with ?debug only. */
export const speedFactor = () => (game.free || game.debug ? game.speedMul : 1);
export function setSpeedMul(m) {
  game.speedMul = clamp(m, 0.25, 32);
  toast(`Walk speed ×${game.speedMul}${game.free || game.debug ? '' : ' (applies in free viewing or with ?debug)'}`, 'info', 2);
}

/** Move the climber somewhere new, clearing everything tied to the old position (rope, autopilot, fall). */
export function placePlayer(x, z, yaw) {
  game.physics?.reset();
  const { P, view } = game;
  Object.assign(P, { x, z, falling: null, clipped: -1, ropeHint: -1, onLadder: false, routeHint: -1, moving: false });
  if (P.ski) Object.assign(P.ski, { u: 0, w: 0, speed: 0, air:null });
  P.y = game.field.height(x, z);
  const safe=game.world?.crevasseField?.safePosition(x,z);if(safe)Object.assign(P,safe);
  P.lastSupported=null;
  if (yaw !== undefined) { view.yaw = yaw; P.facing = yaw; }
  game.auto = null;
  refreshConditions();
  emit('teleported');
}

export function teleportTo(id) {
  const d = destinations().find((x) => x.id === id);
  if (!d) return false;
  const p = d.route.at(d.s), q = id === 'nuptse' ? game.routes.main.pts.at(-1) : d.route.at(d.s + d.dir * 25);
  placePlayer(p.x, p.z, Math.atan2(-(q.x - p.x), -(q.z - p.z)));
  game.view.pitch = d.summit ? 0.08 : 0.02;
  toast(`${d.name} — ${fmt(d.elevation)} m`, 'good', 3);
  return true;
}

/** Jump to an hour of the current day (or the next day if it is already later). */
export function setHour(h) {
  const day = Math.floor(game.time / 24) * 24;
  game.time = day + h + (day + h < game.time - 12 ? 24 : 0);
  refreshConditions();
}

export function setClearWeather(on) {
  game.weather.clear = on;
  refreshConditions();
}
