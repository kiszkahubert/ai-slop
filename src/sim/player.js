// Climber movement on the real terrain: slope-dependent speed, fixed ropes, ladders over
// crevasses, seracs, slips and falls, and the route-following autopilot.
import { MOVE, SLIP_ANGLE } from '../config.js';
import { clamp, lerp, smoothstep, D2R, fmt, wrapAngle } from '../core/math.js';
import { emit, toast } from '../core/events.js';
import { crevasseLocal } from '../world/props.js';
import { game, die, nearCamp, region } from './game.js';
import { hypF, maxStamina, packLoad } from './physiology.js';

// ---------------- fixed ropes
export function nearestRope(x, z, exclude = -1) {
  let best = { d: 1e9, rope: -1, i: 0, px: 0, pz: 0 };
  game.world.ropes.forEach((rope, ri) => {
    if (ri === exclude) return;
    const pts = rope.pts;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1], dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz || 1;
      const t = clamp(((x - a.x) * dx + (z - a.z) * dz) / l2, 0, 1);
      const d = Math.hypot(a.x + dx * t - x, a.z + dz * t - z);
      if (d < best.d) best = { d, rope: ri, i, px: a.x + dx * t, pz: a.z + dz * t };
    }
  });
  return best;
}
function ropeProject(ri, x, z, hint) {
  const pts = game.world.ropes[ri].pts;
  const i0 = hint >= 0 ? Math.max(0, hint - 40) : 0, i1 = hint >= 0 ? Math.min(pts.length - 1, hint + 40) : pts.length - 1;
  let best = null;
  for (let i = i0; i < i1; i++) {
    const a = pts[i], b = pts[i + 1], dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz || 1, L = Math.sqrt(l2);
    const traw = ((x - a.x) * dx + (z - a.z) * dz) / l2, t = clamp(traw, 0, 1);
    const px = a.x + dx * t, pz = a.z + dz * t, d = Math.hypot(px - x, pz - z);
    if (!best || d < best.d) {
      best = { d, px, pz, i, end: (i === 0 && traw < 0) || (i === pts.length - 2 && traw > 1), beyond: i === 0 ? -traw * L : (traw - 1) * L };
    }
  }
  return best;
}
export function clipTo(rope) {
  game.P.clipped = rope; game.P.ropeHint = -1;
}

function seracCollide(x, z) {
  const kx = Math.floor(x / 20), kz = Math.floor(z / 20), grid = game.world.seracGrid;
  for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
    const list = grid.get(kx + a + ',' + (kz + b)); if (!list) continue;
    for (const s of list) {
      const dx = x - s.x, dz = z - s.z, d = Math.hypot(dx, dz), rr = s.r + MOVE.playerRadius;
      if (d < rr && d > 1e-4) { x = s.x + (dx / d) * rr; z = s.z + (dz / d) * rr; }
    }
  }
  return [x, z];
}

// ---------------- interaction (E)
export function interact() {
  const P = game.P;
  if (P.falling) return;
  const camp = nearCamp(P.x, P.z);
  if (camp) { emit('openCamp', camp); return; }
  const ropes = game.world.ropes;
  if (P.clipped >= 0) {
    const other = nearestRope(P.x, P.z, P.clipped);
    if (other.d < 5) { clipTo(other.rope); toast(`Clipped over to the ${ropes[other.rope].name}.`, 'good', 3); return; }
    toast(`Unclipped from the ${ropes[P.clipped].name}.`, 'warn', 2.5); P.clipped = -1; return;
  }
  const nr = nearestRope(P.x, P.z);
  if (nr.d < MOVE.ropeReach) { clipTo(nr.rope); toast(`Clipped into the ${ropes[nr.rope].name}. A slip is held by the rope.`, 'good', 3); }
}

// ---------------- autopilot: follow the marked route, clipping into ropes, at FAST_FORWARD speed
export function startAutopilot() {
  const { P, routes, view } = game;
  const fx = -Math.sin(view.yaw), fz = -Math.cos(view.yaw);
  // pick the route you are on - at the Yellow Band junction, the one you are facing
  let best = null;
  for (const route of [routes.main, routes.lhotse]) {
    const n = route.nearest(P.x, P.z);
    if (n.d > 40) continue;
    const a = route.at(n.s), dot = fx * a.dx + fz * a.dz;
    let dir = dot >= 0 ? 1 : -1;
    if ((dir < 0 && n.s < 3) || (dir > 0 && n.s > route.L - 3)) dir = -dir;      // at an end, the only way is back
    const score = n.d - 10 * Math.abs(dot) - (route === routes.lhotse && dir > 0 && n.s < 30 && dot > 0.3 ? 5 : 0);
    if (!best || score < best.score) best = { route, n, dir, score };
  }
  if (!best) { toast('Too far from the marked route to follow it — walk back to the wands first.', 'warn'); return false; }
  const { route, n, dir } = best;
  game.auto = { route, dir, startS: n.s, hint: n.i, campAtStart: nearCamp(P.x, P.z)?.id || null, resting: false };
  toast(`Following the route ${dir > 0 ? 'up' : 'down'} — time ×4. Any movement key takes back control.`, 'info', 3.5);
  return true;
}
export function stopAutopilot(msg) {
  if (!game.auto) return;
  game.auto = null;
  if (msg) toast(msg, 'info', 4);
}
function autopilotControl() {
  const A = game.auto, { P, S, view, routes } = game, R = A.route;
  const n = R.nearest(P.x, P.z, A.hint); A.hint = n.i;
  const s = n.s;
  // stopping points: camps, the Yellow Band junction, the ends of the route
  for (const c of game.camps) {
    if (routes[c.route] !== R || c.id === A.campAtStart) continue;
    if ((A.dir > 0 ? s >= c.s - 8 && A.startS < c.s - 8 : s <= c.s + 8 && A.startS > c.s + 8)) { stopAutopilot(`Arrived at ${c.name}.`); return null; }
  }
  if (R === routes.main && A.dir > 0 && A.startS < R.s('yellowband') - 10 && s >= R.s('yellowband') - 3) {
    stopAutopilot('Yellow Band junction: left (on) to the Geneva Spur and South Col, or switch to the Lhotse ropes [E] for Lhotse.'); return null;
  }
  if (A.dir > 0 && s >= R.L - 2) { stopAutopilot(R === routes.main ? 'You are on the summit ridge top.' : 'Top of the Lhotse route.'); return null; }
  if (A.dir < 0 && s <= 2) {
    if (R === routes.lhotse) { // continue down the main route from the junction
      const m = routes.main; game.auto = { ...A, route: m, startS: m.s('yellowband'), hint: m.tags.yellowband }; return null;
    }
    stopAutopilot('End of the route.'); return null;
  }
  // rest when out of breath
  if (S.winded || S.stamina < 3) A.resting = true;
  if (A.resting && S.stamina > Math.min(45, maxStamina(S) - 5)) A.resting = false;
  // clip into ropes on the way
  if (P.clipped < 0) { const nr = nearestRope(P.x, P.z); if (nr.d < 4) clipTo(nr.rope); }
  else {
    const other = nearestRope(P.x, P.z, P.clipped);
    if (other.d < 4) {
      const ahead = R.at(s + A.dir * 12), cur = game.world.ropes[P.clipped].pts;
      const curBest = Math.min(...cur.filter((_, k) => k % 4 === 0).map((q) => Math.hypot(q.x - ahead.x, q.z - ahead.z)));
      if (Math.hypot(other.px - ahead.x, other.pz - ahead.z) < curBest) clipTo(other.rope);
    }
  }
  if (A.resting) return { dx: 0, dz: 0, sprint: false };
  const t = R.at(s + A.dir * 7);
  let dx = t.x - P.x, dz = t.z - P.z; const l = Math.hypot(dx, dz) || 1;
  dx /= l; dz /= l;
  view.yaw += wrapAngle(Math.atan2(-dx, -dz) - view.yaw) * 0.04;
  return { dx, dz, sprint: false };
}

// ---------------- movement
/** ctl: { dx, dz, sprint } world-space direction (unit or zero), or null for autopilot */
export function updatePlayer(dt, ctl) {
  const { P, S, field } = game;
  if (P.falling) return updateFall(dt);
  if (game.auto) ctl = autopilotControl() || { dx: 0, dz: 0 };   // manual input cancels it (see step.js)
  let dx = ctl ? ctl.dx : 0, dz = ctl ? ctl.dz : 0;
  P.moving = !!(dx || dz); P.sprint = false; P.grade = 0; P.onLadder = false;
  if (P.moving) {
    const sprint = !!ctl.sprint && S.stamina > 4 && !S.winded;
    const h0 = field.height(P.x, P.z), grade = (field.height(P.x + dx * 1.5, P.z + dz * 1.5) - h0) / 1.5;
    P.grade = grade;
    const slopeF = grade > 0 ? 1 / (1 + MOVE.uphill * grade) : 1 / (1 + MOVE.downhill * -grade);
    const weightF = clamp(1 - (packLoad(S) - 14) / 80, 0.65, 1);
    const exhF = 1 - 0.35 * smoothstep(50, 100, S.exh), frostF = 1 - 0.3 * smoothstep(50, 100, S.frost);
    const wdir = game.weather.sample(game.time).dir * D2R;
    const head = Math.max(0, -(dx * -Math.sin(wdir) + dz * Math.cos(wdir)));
    const windF = 1 - clamp((game.env.wind - 35) / 160, 0, 0.35) * head;
    const stamF = S.stamina < 8 && grade > 0.2 ? 0.55 : 1;
    const v3 = (sprint ? MOVE.sprint : MOVE.walk) * slopeF * hypF(S) * weightF * exhF * frostF * windF * stamF;
    P.sprint = sprint;
    const vh = v3 / Math.sqrt(1 + grade * grade);
    let nx = P.x + dx * vh * dt, nz = P.z + dz * vh * dt;
    // crevasses: cross on the ladder or fall in
    for (const cv of game.world.crevasses) {
      const loc = crevasseLocal(cv, nx, nz); if (!loc) continue;
      if (cv.ladder && Math.abs(loc.u) < 1.3) { P.onLadder = true; continue; }
      if (cv.ladder && Math.abs(loc.u) < 2.2) {
        nx -= cv.ux * Math.sign(loc.u) * (Math.abs(loc.u) - 1.2); nz -= cv.uz * Math.sign(loc.u) * (Math.abs(loc.u) - 1.2);
        P.onLadder = true; continue;
      }
      if (Math.abs(loc.v) < cv.w / 2 - 0.4) {
        P.x = nx; P.z = nz; P.y = field.height(nx, nz) - 20;
        die(`Fell into a crevasse in the ${region()}. Always cross on the ladders.`);
        return;
      }
    }
    if (P.onLadder) { nx = P.x + (nx - P.x) * 0.45; nz = P.z + (nz - P.z) * 0.45; }
    const hn = field.height(nx, nz), stepGrade = (hn - h0) / Math.max(0.01, Math.hypot(nx - P.x, nz - P.z));
    if (stepGrade > MOVE.maxGrade && P.clipped < 0) { emit('prompt', 'Too steep to climb here — find the route or a fixed rope', 1.2); nx = P.x; nz = P.z; }
    [nx, nz] = seracCollide(nx, nz);
    if (P.clipped >= 0) {
      const pr = ropeProject(P.clipped, nx, nz, P.ropeHint); P.ropeHint = pr.i;
      if (pr.end && pr.beyond > 2.5) {
        const other = nearestRope(nx, nz, P.clipped);
        if (other.d < 5) { clipTo(other.rope); toast(`Clipped over to the ${game.world.ropes[other.rope].name}.`); }
        else { toast(`End of the ${game.world.ropes[P.clipped].name} — unclipped.`); P.clipped = -1; }
      } else if (pr.d > MOVE.ropeLeash) {
        nx = pr.px + ((nx - pr.px) / pr.d) * MOVE.ropeLeash; nz = pr.pz + ((nz - pr.pz) / pr.d) * MOVE.ropeLeash;
      }
    }
    nx = clamp(nx, field.x0 + 100, field.x1 - 100); nz = clamp(nz, field.z0 + 100, field.z1 - 100);
    S.distance += Math.hypot(nx - P.x, nz - P.z);
    P.x = nx; P.z = nz;
    P.facing = Math.atan2(-dx, -dz);
    P.phase += dt * v3 * 1.9;
    if (sprint) S.stamina -= 14 * dt;
    else if (grade > 0.6) S.stamina -= 1.4 * (grade - 0.6) * dt;
    else S.stamina += 5 * (0.3 + 0.7 * smoothstep(55, 92, S.spo2)) * dt;
    // slips: steep faces are dangerous unless clipped into a fixed rope
    if (P.clipped < 0 && !P.onLadder) {
      const ang = Math.atan(field.faceSlope(P.x, P.z)) / D2R;
      if (ang > SLIP_ANGLE) {
        let risk = Math.pow((ang - SLIP_ANGLE) / 25, 2) * 0.9;
        if (sprint) risk *= 1.8;
        risk *= (1 + 1.2 * (1 - hypF(S))) * (1 + S.exh / 150);
        if (game.env.wind > 70) risk *= 1 + (game.env.wind - 70) / 60;
        if (Math.random() < risk * dt) startFall();
      }
    }
  } else {
    S.stamina += 14 * (0.3 + 0.7 * smoothstep(55, 92, S.spo2)) * dt;
    P.phase *= 0.9;
    if (P.clipped < 0 && field.slope(P.x, P.z).mag > 2.2 && Math.random() < 0.6 * dt) startFall();
  }
  if (S.stamina <= 0) { S.stamina = 0; if (!S.winded) toast('Out of breath — stop and recover.', 'warn'); S.winded = true; }
  if (S.winded && S.stamina > 25) S.winded = false;
  S.stamina = clamp(S.stamina, 0, maxStamina(S));
  P.y = field.height(P.x, P.z);
}

// ---------------- falls
export function startFall() {
  const P = game.P;
  P.falling = { vx: 0, vz: 0, v: 0, startY: P.y, maxV: 0, t: 0, arrestTried: false, region: region().replace(/^(Camp|Lhotse Camp) \d.*/, 'route') };
  game.S.falls++;
  if (game.auto) game.auto = null;
  toast('You slipped! Self-arrest…', 'bad', 3);
}

function updateFall(dt) {
  const { P, S, field } = game, f = P.falling;
  f.t += dt;
  const sl = field.slope(P.x, P.z, 2), ang = Math.atan(sl.mag), g = 9.81, mu = 0.3;
  if (sl.mag > 1e-3) {
    const ux = -sl.gx / sl.mag, uz = -sl.gz / sl.mag;
    f.v = Math.max(0, f.v + g * (Math.sin(ang) - mu * Math.cos(ang)) * dt);
    const vh = f.v * Math.cos(ang);
    f.vx = lerp(f.vx, ux * vh, 0.3); f.vz = lerp(f.vz, uz * vh, 0.3);
  } else f.v = Math.max(0, f.v - g * mu * dt);
  P.x = clamp(P.x + f.vx * dt, field.x0 + 100, field.x1 - 100); P.z = clamp(P.z + f.vz * dt, field.z0 + 100, field.z1 - 100);
  P.y = field.height(P.x, P.z);
  f.maxV = Math.max(f.maxV, f.v);
  let drop = f.startY - P.y;
  if (!f.arrestTried && f.t > 0.7) {
    f.arrestTried = true;
    const chance = clamp(0.75 - (ang / D2R - 40) / 30, 0.05, 0.75) * (0.4 + 0.6 * hypF(S)) * (S.stamina > 10 ? 1 : 0.5);
    if (Math.random() < chance) {
      P.falling = null;
      const dmg = 4 + drop * 0.6;
      S.health -= dmg;
      toast(`Self-arrest! You dug in your ice axe after ${fmt(Math.max(1, drop))} m (−${fmt(dmg)} health). Clip into the ropes!`, 'warn', 5);
      if (S.health <= 0) die(`Fell on the ${f.region} and did not survive the injuries.`);
      return;
    }
  }
  if (drop > 180 || f.maxV > 40) {
    for (let k = 0; k < 6000; k++) {            // let the body come to rest
      const s2 = field.slope(P.x, P.z, 2); if (s2.mag < 0.4) break;
      P.x = clamp(P.x - (s2.gx / s2.mag) * 0.5, field.x0 + 100, field.x1 - 100); P.z = clamp(P.z - (s2.gz / s2.mag) * 0.5, field.z0 + 100, field.z1 - 100);
    }
    P.y = field.height(P.x, P.z); drop = f.startY - P.y;
    die(`Fell ${fmt(drop)} m down the ${f.region}.`);
    return;
  }
  if ((f.v < 0.6 && ang < 32 * D2R && f.t > 0.4) || f.t > 30) {
    const dmg = Math.max(0, drop - 10) * 1.1 + Math.max(0, f.maxV - 14) * 3;
    P.falling = null; S.health -= dmg;
    if (S.health <= 0) { die(`Fell ${fmt(drop)} m on the ${f.region} and did not survive the injuries.`); return; }
    toast(drop > 3 ? `Stopped after ${fmt(drop)} m. Injured (−${fmt(dmg)} health).` : 'Self-arrest! You stopped yourself.', dmg > 0 ? 'bad' : 'warn', 5);
  }
}
