// A camera-only tour. The climber, expedition progress and save never move with the camera.
import { clamp, lerp, fmt } from '../core/math.js';
import { emit, toast, on } from '../core/events.js';
import { game, refreshConditions } from './game.js';
import { conditionsAt } from './physiology.js';
import { PEAKS } from '../world/geo.js';
import { ease, mix3, distance3, makeTrack, trackPoint, travelTiming, travelProgress } from './flybyMotion.js';

const FADE_OUT = .65, BLACK = .45, FADE_IN = .85;
const CUT_T = FADE_OUT + BLACK + FADE_IN;
const CINEMATIC_HOUR = 6.1; // readable morning light, held within a warm 25-minute window
const HIGHLIGHTS = new Set(['ebc', 'icefall_mid', 'c2', 'c3', 'c4', 'balcony', 'everest']);
// kind, radius, height, sweep in degrees. Bearings are relative to the uphill route tangent.
const STOPS = [
  { tag: 'ebc', off: 20, name: 'Everest Base Camp', shot: ['arc', 260, 95, 28], speed: 32,
    text: 'An expedition village on the Khumbu Glacier. Every South Col climb begins here, with weeks of acclimatization and rotations through the camps above.' },
  { tag: 'icefall_mid', name: 'The Khumbu Icefall', shot: ['glide', 230, 110, 32], speed: 30,
    text: 'A moving maze of seracs and deep crevasses. Ladders and fixed lines thread a fragile route through the glacier.' },
  { tag: 'icefall_top', name: 'Top of the Icefall', shot: ['reveal', 320, 100, 24], speed: 28, gaze: 'everest',
    text: 'The Western Cwm opens ahead, enclosed by Everest, Lhotse and Nuptse. Beyond the Icefall, the scale of the mountain becomes clear.' },
  { tag: 'c1', name: 'Camp 1', shot: ['arc', 210, 80, -24], speed: 45,
    text: 'Tents between crevasses at the head of the Icefall. Climbers pause here to acclimatize before crossing the Western Cwm.' },
  { tag: 'c2', name: 'Camp 2 · Advanced Base Camp', shot: ['arc', 330, 110, 32], speed: 65, gaze: 'nuptse',
    text: 'Home above the Icefall, beneath the immense wall of Nuptse. This sheltered camp is the staging point for the upper mountain.' },
  { tag: 'bergschrund', name: 'The Bergschrund', shot: ['glide', 250, 100, -28], speed: 38,
    text: 'The glacier pulls away from the Lhotse Face here. Above this great crack rises a wall of blue ice more than a kilometre high.' },
  { tag: 'c3', name: 'Camp 3 · Lhotse Face', shot: ['reveal', 290, 130, 20], speed: 32,
    text: 'Tiny tent platforms cut into the Lhotse Face. The camp clings to blue ice, with the Western Cwm far below.' },
  { tag: 'yellowband', name: 'The Yellow Band', shot: ['arc', 270, 110, -25], speed: 35,
    text: 'A pale band of rock interrupts the ice. Everest climbers traverse toward the Geneva Spur; the Lhotse route continues up the face.' },
  { tag: 'geneva', name: 'The Geneva Spur', shot: ['reveal', 300, 110, 26], speed: 32,
    text: 'A dark rock buttress guards the final approach to the South Col. The last camp lies beyond its crest.' },
  { tag: 'c4', name: 'Camp 4 · The South Col', shot: ['arc', 390, 105, -26], speed: 40, gaze: 'everest',
    text: 'The final camp, nearly eight kilometres above sea level. Summit teams leave this exposed saddle around midnight, climbing toward the Southeast Ridge.' },
  { tag: 'triangular', name: 'The Triangular Face', shot: ['glide', 300, 125, 26], speed: 30,
    text: 'A long, steep snow face above the South Col. In darkness, climbers follow its fixed lines toward the Balcony.' },
  { tag: 'balcony', name: 'The Balcony · 8,400 m', shot: ['arc', 290, 100, -26], speed: 24,
    text: 'A small resting place on the Southeast Ridge. Dawn often reaches climbers here, revealing the immense drop into the surrounding valleys.' },
  { tag: 'southsummit', name: 'The South Summit · 8,749 m', shot: ['reveal', 340, 145, 22], speed: 20,
    text: 'A summit before the summit. Ahead, a narrow corniced ridge leads toward the Hillary Step and the highest point on Earth.' },
  { tag: 'hillary', name: 'The Hillary Step · 8,790 m', shot: ['glide', 250, 115, -20], speed: 18,
    text: 'The final exposed passage below the summit. To the east, the Kangshung Face drops roughly three kilometres toward Tibet.' },
  { tag: 'everest', name: 'The Summit of Mount Everest', shot: ['pullback', 330, 155, 16], speed: 16, hold: 22,
    text: '8,849 metres above sea level. The route ends on this small crest, surrounded by Himalayan peaks and valleys reaching far into the distance.' },
];

const subject = (stop) => [stop.at.x, stop.at.ground + 12, stop.at.z];
function shotRaw(stop, u) {
  const [kind, radius, height, sweep] = stop.shot, d = stop.direction;
  const angle = Math.atan2(-d.dx, -d.dz) + .55 + sweep * Math.PI / 180 * (u - .5);
  const r = kind === 'pullback' ? lerp(radius, 620, u) : radius;
  const slide = kind === 'glide' ? lerp(-75, 75, u) : 0;
  const pos = [stop.at.x + Math.sin(angle) * r + d.dz * slide,
    stop.at.ground + height + (kind === 'reveal' ? u * 70 : kind === 'pullback' ? u * 75 : 0),
    stop.at.z + Math.cos(angle) * r - d.dx * slide];
  let look = subject(stop);
  if (stop.gaze) {
    const peak = PEAKS.find((p) => p.id === stop.gaze);
    if (peak) look = mix3(look, [peak.x, peak.e, peak.z], ease((u - .28) / .72) * .82);
  }
  return { pos, look, fov: kind === 'pullback' ? lerp(56, 62, u) : 58, roll: 0 };
}
function buildStops(route, mode) {
  return STOPS.filter((st) => mode !== 'highlights' || HIGHLIGHTS.has(st.tag)).map((st) => {
    const s = st.tag === 'everest' ? route.L - 7 : route.s(st.tag) + (st.off || 0);
    const p = st.tag === 'everest' ? route.pts.at(-1) : route.at(s);
    const stop = { ...st, s, at: { x: p.x, z: p.z, ground: game.field.height(p.x, p.z) }, direction: route.at(s) };
    stop.hold = Math.max(st.hold || 8, Math.ceil(2 + st.text.split(/\s+/).length / 2.7));
    stop.lift = 0;
    // Lift the entire authored shot smoothly, avoiding a reactive terrain clamp.
    for (let k = 0; k <= 100; k++) {
      const pose = shotRaw(stop, k / 100);
      stop.lift = Math.max(stop.lift, game.field.height(pose.pos[0], pose.pos[2]) + 70 - pose.pos[1]);
    }
    return stop;
  });
}
function shotPose(stop, u) { const pose = shotRaw(stop, u); pose.pos[1] += stop.lift; return pose; }
function buildLeg(f, a, b) {
  const from = shotPose(a, 1), to = shotPose(b, 0), span = b.s - a.s;
  const count = Math.max(6, Math.ceil(span / 45));
  const base = (s) => { const p = f.route.at(s), g = game.field.height(p.x, p.z); return [p.x, g + 150, p.z]; };
  const start = base(a.s), end = base(b.s);
  const points = Array.from({ length: count + 1 }, (_, i) => {
    const u = i / count, p = base(lerp(a.s, b.s, u));
    const left = 1 - ease(Math.min(1, u * span / Math.min(550, span / 2)));
    const right = 1 - ease(Math.min(1, (1 - u) * span / Math.min(550, span / 2)));
    return p.map((v, k) => v + (from.pos[k] - start[k]) * left + (to.pos[k] - end[k]) * right);
  });
  for (let pass = 0; pass < 3; pass++) {
    const old = points.map((p) => [...p]);
    for (let i = 1; i < count; i++) for (const k of [0, 2]) points[i][k] = (old[i - 1][k] + 2 * old[i][k] + old[i + 1][k]) / 4;
  }
  const track = makeTrack(points, game.field);
  const timing = travelTiming(track.length, b.speed * (f.mode === 'highlights' ? 2.5 : 1.5));
  return { track, timing, from, to, a, b };
}
function legPose(leg, t) {
  const u = travelProgress(t, leg.timing), pos = trackPoint(leg.track, u);
  const ahead = trackPoint(leg.track, Math.min(1, u + 180 / leg.track.length));
  const behind = trackPoint(leg.track, Math.max(0, u - 30 / leg.track.length));
  const direction = ahead.map((v, i) => v - behind[i]), len = Math.hypot(...direction) || 1;
  const forward = pos.map((v, i) => v + direction[i] / len * 300);
  const depart = ease(u * leg.track.length / 300), arrive = ease((1 - u) * leg.track.length / 400);
  let look = mix3(mix3(leg.from.look, forward, depart), leg.to.look, 1 - arrive);
  if (distance3(pos, look) < 30) look = forward;
  return { pos, look, fov: lerp(lerp(leg.from.fov, 64, depart), leg.to.fov, 1 - arrive), roll: 0 };
}
function cameraOrigin() {
  const rig = game.rig, P = game.P;
  const pos = rig ? rig.camera.position.toArray() : [P.x, P.y + 14, P.z];
  const direction = rig ? rig.camera.getWorldDirection(rig.forward).toArray() : [0, 0, -1];
  return { pos, look: pos.map((v, i) => v + direction[i] * 100), fov: rig?.camera.fov ?? 62, roll: 0,
    quaternion: rig?.camera.quaternion.toArray() };
}
export function startFlyby(from = 0, mode = 'full') {
  if (game.flyby) return true;
  if (!game.free) { toast('The scenic flyby is part of free viewing.', 'warn', 3); return false; }
  if (game.P.falling || game.P.recovery || game.P.ski?.air) { toast('Return to supported ground before taking off.', 'warn', 3); return false; }
  mode = mode === 'highlights' ? mode : 'full';
  const route = game.routes.main, stops = buildStops(route, mode), origin = cameraOrigin();
  const f = game.flyby = { route, stops, mode, origin, saved: { time: game.time, clear: !!game.weather.clear,
    camera: origin, dist: game.rig?.dist ?? game.view.dist },
    i: Number.isFinite(from) ? clamp(Math.floor(from), 0, stops.length - 1) : 0, phase: 'cut', t: 0, elapsed: 0, fade: 0,
    visited: [], pose: origin, legs: [], switched: false, restored: false, env: null, prefetch: { built: 0, ms: 0, maxMs: 0, jobs: 0 } };
  for (let i = 1; i < stops.length; i++) f.legs[i] = buildLeg(f, stops[i - 1], stops[i]);
  f.duration = CUT_T + stops.reduce((n, s) => n + s.hold, 0) + f.legs.reduce((n, l) => n + l.timing.duration, 0);
  emit('flybyStart', stops.length); emit('flybyFinished', false);
  return true;
}
function caption(f) {
  const stop = f.stops[f.i];
  emit('flybyCaption', { kicker: `${f.mode === 'highlights' ? 'Highlights' : 'Full route'} · Stop ${f.i + 1} of ${f.stops.length} · ${fmt(stop.at.ground)} m`, title: stop.name, text: stop.text });
}
function beginHold(f) {
  f.phase = 'hold'; f.t = 0;
  if (!f.visited.includes(f.stops[f.i].tag)) f.visited.push(f.stops[f.i].tag);
  caption(f);
}
function cutTo(f, index) {
  f.i = index; f.phase = 'cut'; f.t = 0; f.switched = false;
  emit('flybyCaption', null); emit('flybyFinished', false);
}
export function skipStop() {
  const f = game.flyby;
  if (!f || f.phase === 'return') return;
  if (f.i >= f.stops.length - 1) { stopFlyby('cancelled'); return; }
  cutTo(f, f.i + 1);
}
export function replayFlyby() {
  const f = game.flyby;
  if (!f || f.phase === 'return') return;
  f.visited = []; f.elapsed = 0; cutTo(f, 0);
}
function restore(f) {
  game.time = f.saved.time; game.weather.clear = f.saved.clear;
  refreshConditions(); f.restored = true; f.env = null;
  f.pose = { ...f.saved.camera, pos: [...f.saved.camera.pos], look: [...f.saved.camera.look] };
  if (game.rig) {
    game.rig.dist = f.saved.dist;
    game.rig.camera.fov = f.saved.camera.fov; game.rig.camera.updateProjectionMatrix();
  }
}
function finishReturn(f) {
  game.flyby = null; emit('flybyFade', 0); emit('flybyEnd', f.reason, f.visited.length);
}
export function stopFlyby(reason = 'cancelled') {
  const f = game.flyby;
  if (!f) return;
  if (reason === 'teleport' || game.mode !== 'play') { f.reason = reason; restore(f); finishReturn(f); return; }
  if (f.phase === 'return') return;
  f.phase = 'return'; f.t = 0; f.switched = false; f.reason = reason;
  emit('flybyCaption', null); emit('flybyFinished', false);
}
export function updateFlyby(dt) {
  const f = game.flyby;
  if (!f) return;
  f.t += dt;
  if (!f.restored && f.phase !== 'finished') f.elapsed += dt;
  if (f.phase === 'cut' || f.phase === 'return') {
    f.fade = f.t < FADE_OUT ? Math.max(f.fade, ease(f.t / FADE_OUT)) : f.t < FADE_OUT + BLACK ? 1 : 1 - ease((f.t - FADE_OUT - BLACK) / FADE_IN);
    if (f.t >= FADE_OUT && !f.switched) {
      f.switched = true;
      if (f.phase === 'return') restore(f);
      else {
        game.weather.clear = true;
        game.time = Math.floor(f.saved.time / 24) * 24 + CINEMATIC_HOUR;
        f.pose = shotPose(f.stops[f.i], 0); f.pose.snap = true;
      }
    }
    if (f.t >= CUT_T) {
      f.fade = 0;
      if (f.phase === 'return') { finishReturn(f); return; }
      f.pose = shotPose(f.stops[f.i], 0); beginHold(f);
    }
  } else if (f.phase === 'hold') {
    const stop = f.stops[f.i];
    f.pose = shotPose(stop, ease(f.t / stop.hold));
    if (f.t >= stop.hold) {
      if (f.i === f.stops.length - 1) { f.phase = 'finished'; f.t = 0; emit('flybyFinished', true); }
      else { f.i++; f.phase = 'travel'; f.t = 0; emit('flybyCaption', null); }
    }
  } else if (f.phase === 'travel') {
    const leg = f.legs[f.i]; f.pose = legPose(leg, f.t);
    if (f.t >= leg.timing.duration) { f.pose = shotPose(f.stops[f.i], 0); beginHold(f); }
  }
  if (f.switched && !f.restored) {
    game.time = Math.floor(f.saved.time / 24) * 24 + CINEMATIC_HOUR + Math.min(25 / 60, f.elapsed / 3600 * 2);
    const p = f.pose.pos;
    f.env = conditionsAt(game, p[0], p[2], p[1], game.time, false, p[1] > 7900 ? 1.15 : 1);
  }
  emit('flybyFade', f.fade);
}
/** Pure future-pose lookup for bounded terrain/camp preparation. */
export function flybyPreview(seconds = 5) {
  const f = game.flyby;
  if (!f || f.restored || f.phase === 'return' || f.phase === 'finished') return null;
  if (f.phase === 'travel') return legPose(f.legs[f.i], f.t + seconds);
  if (f.phase === 'hold' && f.stops[f.i].hold - f.t < seconds && f.legs[f.i + 1]) return legPose(f.legs[f.i + 1], seconds - (f.stops[f.i].hold - f.t));
  return shotPose(f.stops[f.i], ease((f.phase === 'hold' ? f.t + seconds : 0) / f.stops[f.i].hold));
}
export const flying = () => !!game.flyby;
on('teleported', () => stopFlyby('teleport'));
