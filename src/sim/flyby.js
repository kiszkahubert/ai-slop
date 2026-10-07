// Scenic flyby: a cinematic camera flight along the South Col route — from Base Camp, over the Khumbu
// Icefall and up the Western Cwm, the Lhotse Face and the Southeast Ridge to the summit of Everest —
// hovering briefly at every camp, landmark and viewpoint. Free viewing only: the climber stays where
// they are, survival systems stay off and nothing is saved.
import { TIME_SCALE } from '../config.js';
import { clamp, lerp, smoothstep, wrapAngle, fmt } from '../core/math.js';
import { emit, toast, on } from '../core/events.js';
import { game, refreshConditions, setHour } from './game.js';
import { LANDMARKS } from '../world/route.js';
import { PEAKS } from '../world/geo.js';

const STEP = 20;          // m between flight-path samples
const CRUISE = 30;        // m/s along the path
const BRAKE = 7;          // m/s² approaching a stop
const ACCEL = 9;          // m/s² leaving a stop
const ENTRY_T = 5;        // s to blend from wherever the camera was onto the flight path
const SKIP_T = 3;         // s for a skipped approach
const LOOK_AHEAD = 280;   // m of path to look at while cruising
const LOOK_ALIGN = 220;   // m before a stop the gaze starts settling on it
const ORBIT_W = (2 * Math.PI) / 55;   // rad/s of the slow hold orbit

/** The stops, in route order. gaze: a named peak the camera admires while hovering (the panoramas). */
const STOPS = [
  { tag: 'ebc', off: 20, name: 'Everest Base Camp', hold: 8,
    text: 'A village of expedition tents on the Khumbu Glacier, 5,300 m. Six weeks of rotations begin here — every South Col climb starts on the red wands ahead, up the Icefall.' },
  { tag: 'icefall_mid', name: 'The Khumbu Icefall', hold: 8,
    text: LANDMARKS.icefall_mid },
  { tag: 'icefall_top', name: 'Top of the Icefall', hold: 9, gaze: 'everest',
    text: LANDMARKS.icefall_top },
  { tag: 'c1', name: 'Camp 1', hold: 6,
    text: 'Tents threaded between crevasses at the head of the Icefall. Most expeditions spend two nights here, letting the blood learn the altitude.' },
  { tag: 'c2', name: 'Camp 2 · Advanced Base Camp', hold: 8, gaze: 'nuptse',
    text: 'Home above the Icefall, under the wall of Nuptse. Babu Chiri Sherpa slept a night on the summit without oxygen, and fell into a crevasse near this camp in 2001.' },
  { tag: 'bergschrund', name: 'The Bergschrund', hold: 6,
    text: LANDMARKS.bergschrund },
  { tag: 'c3', name: 'Camp 3 · Lhotse Face', hold: 7,
    text: 'Shelves cut into 1,100 m of blue ice. From here on, climbers sleep on bottled oxygen.' },
  { tag: 'yellowband', name: 'The Yellow Band', hold: 6,
    text: LANDMARKS.yellowband },
  { tag: 'geneva', name: 'The Geneva Spur', hold: 6,
    text: LANDMARKS.geneva },
  { tag: 'c4', name: 'Camp 4 · The South Col', hold: 8, gaze: 'everest',
    text: 'The last camp, already inside the death zone. The summit push leaves here around midnight; the 1996 storm caught Yasuko Namba within a few hundred metres of these tents.' },
  { tag: 'triangular', name: 'The Triangular Face', hold: 6,
    text: LANDMARKS.triangular },
  { tag: 'balcony', name: 'The Balcony · 8,400 m', hold: 7,
    text: LANDMARKS.balcony },
  { tag: 'southsummit', name: 'The South Summit · 8,749 m', hold: 6,
    text: LANDMARKS.southsummit },
  { tag: 'hillary', name: 'The Hillary Step · 8,790 m', hold: 6,
    text: LANDMARKS.hillary },
  { tag: 'everest', name: 'The Summit of Mount Everest', hold: 18, reveal: true,
    text: '8,849 m — the highest point on Earth. From the South Col it is five to seven hours through the death zone, and the safe return is still ahead.' },
];

const stopS = (route, st) => route.s(st.tag) + (st.off || 0);
const gazePoint = (id) => {
  const p = PEAKS.find((q) => q.id === id);
  return p ? [p.x, p.e, p.z] : null;
};

/** Flight path above the route: samples every STEP metres, heights smoothed over the terrain. */
function buildPath(route) {
  const field = game.field, n = Math.floor(route.L / STEP) + 3;
  const xs = new Float64Array(n), ys = new Float64Array(n), zs = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    const p = route.at(Math.min(k * STEP, route.L));
    xs[k] = p.x; zs[k] = p.z;
    const g = field.height(p.x, p.z);
    ys[k] = g + 130 + 110 * smoothstep(6100, 8600, g);   // more clearance the higher we fly
  }
  for (let pass = 0; pass < 5; pass++) {
    for (let k = 1; k < n - 1; k++) ys[k] = (ys[k - 1] + 2 * ys[k] + ys[k + 1]) / 4;
  }
  return { xs, ys, zs, n };
}

/** Catmull–Rom interpolated position on the flight path at distance s. */
function pathPoint(path, s) {
  const f = clamp(s / STEP, 0, path.n - 2), i = Math.min(path.n - 2, Math.floor(f)), t = f - i;
  const j = (a) => clamp(i + a, 0, path.n - 1);
  const cr = (p0, p1, p2, p3) =>
    0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
  return {
    x: cr(path.xs[j(-1)], path.xs[j(0)], path.xs[j(1)], path.xs[j(2)]),
    y: cr(path.ys[j(-1)], path.ys[j(0)], path.ys[j(1)], path.ys[j(2)]),
    z: cr(path.zs[j(-1)], path.zs[j(0)], path.zs[j(1)], path.zs[j(2)]),
  };
}

// ---------------- flight state machine
export function startFlyby(from = 0) {
  if (game.flyby) return true;
  if (!game.free) { toast('The scenic flyby is part of free viewing.', 'warn', 3); return false; }
  if (game.P.falling || game.P.recovery || game.P.ski?.air) { toast('Return to supported ground before taking off.', 'warn', 3); return false; }
  const route = game.routes.main;
  const stops = STOPS.map((st) => {
    const p = st.tag === 'everest' ? route.pts.at(-1) : route.at(stopS(route, st));
    return { ...st, s: st.tag === 'everest' ? route.L - 7 : stopS(route, st), at: { x: p.x, z: p.z, ground: game.field.height(p.x, p.z) } };
  });
  const path = buildPath(route);
  const i = clamp(from, 0, stops.length - 1);
  const rigPose = game.rig?.pose;
  const P = game.P;
  const origin = rigPose ? { pos: [...rigPose.pos], look: [...rigPose.look] }
    : { pos: [P.x, P.y + 14, P.z], look: [stops[0].at.x, stops[0].at.ground + 60, stops[0].at.z] };
  const saved = { time: game.time, clear: !!game.weather.clear };
  game.weather.clear = true;      // golden-hour light for the flight; both are restored on landing
  setHour(5.4);
  refreshConditions();
  game.flyby = {
    route, stops, path, origin, saved, i, s: stops[i].s, speed: 6,
    phase: 'entry', t: 0, roll: 0, lastYaw: null, visited: [], pose: null, entryT: ENTRY_T,
  };
  updateFlyby(0);
  emit('flybyStart', stops.length);
  return true;
}

export function stopFlyby(reason = 'cancelled') {
  const f = game.flyby;
  if (!f) return;
  game.flyby = null;
  game.time = f.saved.time; game.weather.clear = f.saved.clear;
  refreshConditions();
  emit('flybyEnd', reason, f.visited.length);
  if (reason === 'complete') toast('Flyby complete — the summit of Everest. Press T to teleport, or keep exploring.', 'good', 6);
  else if (reason === 'cancelled') toast('Flyby ended — press T to teleport, or keep exploring.', 'info', 4);
}

/** Shift or Space: skip a stop — leave the current hover, or fly past the stop we are approaching. */
export function skipStop() {
  const f = game.flyby;
  if (!f) return;
  const j = f.i + 1;
  if (j >= f.stops.length) { stopFlyby('complete'); return; }
  f.origin = { pos: [...f.pose.pos], look: [...f.pose.look] };
  f.i = j; f.s = Math.max(0, f.stops[j].s - 260); f.speed = CRUISE * 0.8;
  f.phase = 'entry'; f.t = 0; f.entryT = SKIP_T; f.lastYaw = null;
  emit('flybyCaption', null);
}

const lookBlend = (remaining) => 1 - smoothstep(0, LOOK_ALIGN, remaining);   // 0 far away, 1 settled on the stop

export function updateFlyby(dt) {
  const f = game.flyby;
  if (!f) return;
  f.t += dt;
  game.time += (dt * TIME_SCALE) / 3600;   // the light keeps moving at 1× while we fly
  const path = f.path, stop = f.stops[f.i], pose = { fov: 62, roll: 0 };

  if (f.phase === 'entry') {
    const blend = smoothstep(0, 1, Math.min(1, f.t / f.entryT)), from = f.origin;
    f.speed = Math.min(f.speed + ACCEL * dt, CRUISE);
    f.s = Math.min(f.s + f.speed * dt, stop.s);
    const to = pathPoint(path, Math.min(f.s + Math.max(f.speed * 2, 40), stop.s));
    const toLook = pathPoint(path, Math.min(f.s + LOOK_AHEAD, stop.s));
    pose.pos = [lerp(from.pos[0], to.x, blend), lerp(from.pos[1], to.y, blend), lerp(from.pos[2], to.z, blend)];
    pose.look = [lerp(from.look[0], toLook.x, blend), lerp(from.look[1], toLook.y, blend), lerp(from.look[2], toLook.z, blend)];
    pose.fov = lerp(55, 66, blend);
    if (f.t >= f.entryT) { f.phase = 'cruise'; f.t = 0; }
  } else if (f.phase === 'cruise') {
    const remaining = Math.max(0, stop.s - f.s);
    f.speed = Math.min(f.speed + ACCEL * dt, CRUISE, Math.sqrt(2 * BRAKE * remaining));
    f.s += f.speed * dt;
    const here = pathPoint(path, f.s);
    const ahead = pathPoint(path, Math.min(f.s + Math.max(LOOK_AHEAD * (1 - lookBlend(remaining)), 30), f.route.L - 1));
    const target = stop.gaze ? gazePoint(stop.gaze) : [stop.at.x, stop.at.ground + 8, stop.at.z];
    const k = lookBlend(remaining);
    pose.pos = [here.x, here.y, here.z];
    pose.look = [lerp(ahead.x, target[0], k), lerp(ahead.y, target[1], k), lerp(ahead.z, target[2], k)];
    pose.fov = lerp(66, 55, k);
    // banking: roll gently into the path's turns
    const yaw = Math.atan2(-(pose.look[0] - pose.pos[0]), -(pose.look[2] - pose.pos[2]));
    if (f.lastYaw !== null && dt > 0) f.roll += (clamp(-wrapAngle(yaw - f.lastYaw) / dt * 0.55, -0.09, 0.09) - f.roll) * Math.min(1, dt * 2.5);
    f.lastYaw = yaw;
    pose.roll = f.roll;
    if (remaining < 1) beginHold(f, stop);
  } else if (f.phase === 'hold') {
    const o = f.orbit, k = 1 - Math.pow(1 - Math.min(1, f.t / stop.hold), 3);   // ease-out expansion
    const a = o.a0 + o.omega * f.t, r = lerp(o.r0, o.radius, k), h = lerp(o.h0, o.height, k);
    const x = o.cx + Math.sin(a) * r, z = o.cz + Math.cos(a) * r;
    const target = stop.gaze ? gazePoint(stop.gaze) : [stop.at.x, stop.at.ground + 8, stop.at.z];
    pose.pos = [x, Math.max(o.cy + h, game.field.height(x, z) + 45), z];
    pose.look = target;
    pose.fov = 55;
    if (f.t >= stop.hold) { endHold(f, stop); if (!game.flyby) return; }
  }
  pose.pos[1] = Math.max(pose.pos[1], game.field.height(pose.pos[0], pose.pos[2]) + 32);
  f.pose = pose;
}

/** Enter the hover: an orbit that starts exactly where the camera is, so the handover is seamless. */
function beginHold(f, stop) {
  const cx = stop.at.x, cz = stop.at.z, cy = stop.at.ground + 10;
  const dx = f.pose.pos[0] - cx, dy = f.pose.pos[1] - cy, dz = f.pose.pos[2] - cz;
  const a0 = Math.atan2(dx, dz), r0 = Math.max(20, Math.hypot(dx, dz));
  const dir = f.route.at(stop.s), tangent = (dx * dir.dx + dz * dir.dz) >= 0 ? 1 : -1;
  f.orbit = {
    cx, cy, cz, a0, r0, h0: Math.max(30, dy), omega: tangent * ORBIT_W,
    radius: stop.reveal ? 320 : 140, height: stop.reveal ? 260 : 120,
  };
  f.phase = 'hold'; f.t = 0; f.roll = 0; f.lastYaw = null;
  f.visited.push(stop.tag);
  emit('flybyCaption', {
    index: f.visited.length, count: f.stops.length,
    kicker: stop.reveal ? `${fmt(stop.at.ground)} m` : `Stop ${f.visited.length} of ${f.stops.length} · ${fmt(stop.at.ground)} m`,
    title: stop.name,
    text: stop.text,
  });
}

/** Leave the hover: remember where the orbit ended, then blend back onto the flight path. */
function endHold(f, stop) {
  if (f.i >= f.stops.length - 1) { stopFlyby('complete'); return; }
  const o = f.orbit, a = o.a0 + o.omega * stop.hold;
  const ex = o.cx + Math.sin(a) * o.radius, ez = o.cz + Math.cos(a) * o.radius;
  f.origin = {
    pos: [ex, Math.max(o.cy + o.height, game.field.height(ex, ez) + 45), ez],
    look: [...f.pose.look],
  };
  f.i++; f.s = stop.s + 30; f.speed = 14;
  f.phase = 'entry'; f.t = 0; f.entryT = ENTRY_T; f.lastYaw = null;
  emit('flybyCaption', null);
}

/** True while a flyby owns the camera. */
export const flying = () => !!game.flyby;

on('teleported', () => stopFlyby('teleport'));
