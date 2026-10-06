// Climber movement on the real terrain: slope-dependent speed, fixed ropes, ladders over
// crevasses, seracs, slips and falls, and the route-following autopilot.
import { MOVE, SLIP_ANGLE } from '../config.js';
import { clamp, smoothstep, D2R, wrapAngle } from '../core/math.js';
import { emit, toast } from '../core/events.js';
import { SegmentIndex } from '../core/spatial.js';
import { game, nearCamp, region, speedFactor } from './game.js';
import { hypF, maxStamina, packLoad } from './physiology.js';
import { CLIMBS } from '../world/route.js';
import { groundHeight, querySupport, sweepSupport } from './surface.js';

// ---------------- fixed ropes
let ropeIndex = null, ropeIndexFor = null;
/** Nearest fixed rope (spatial index over all rope segments). maxDist bounds the search. */
export function nearestRope(x, z, exclude = -1, maxDist = 400, route = null) {
  const ropes = game.world.ropes;
  if (ropeIndexFor !== ropes) {
    const segs = [];
    ropes.forEach((rope, ri) => { for (let i = 0; i < rope.pts.length - 1; i++) segs.push({ ax: rope.pts[i].x, az: rope.pts[i].z, bx: rope.pts[i + 1].x, bz: rope.pts[i + 1].z, rope: ri, i }); });
    ropeIndex = new SegmentIndex(segs, 40); ropeIndexFor = ropes;
  }
  const h = ropeIndex.nearest(x, z, maxDist, (s) => s.rope !== exclude && (!route || ropes[s.rope].route === route));
  if (!h) return { d: 1e9, rope: -1, i: 0, px: 0, pz: 0 };
  const s = ropeIndex.segs[h.k];
  return { d: h.d, rope: s.rope, i: s.i, px: h.px, pz: h.pz };
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

export function seracCollide(x, z) {
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
  if(game.P.falling || (game.physics?.avalanche && !game.physics.avalanche.settled)) { toast('Find safety before opening a camp or changing ropes.', 'warn', 3); return; }
  const P = game.P;
  const camp = nearCamp(P.x, P.z);
  if (camp) { emit('openCamp', camp); return; }
  if (P.ski) { toast('You cannot clip into a rope with skis on — [X] takes them off.', 'warn', 3); return; }
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
/** F: follow the route, stopping at camps. Shift+F (nonstop): only stop at the end of the route. */
export function startAutopilot({ nonstop = false, routeName = null, direction = null } = {}) {
  if(game.P.falling || (game.physics?.avalanche && !game.physics.avalanche.settled)) return false;
  const { P, routes, view } = game;
  if (P.ski) { toast('Take your skis off [X] to follow the route.', 'warn', 3); return false; }
  const fx = -Math.sin(view.yaw), fz = -Math.cos(view.yaw);
  // Pick the route you are on; at a junction, favour the branch you are facing.
  let best = null;
  for (const route of Object.values(routes)) {
    if (routeName && route.name !== routeName) continue;
    const n = route.nearestWithin(P.x, P.z, 40);
    if (!n) continue;
    const a = route.at(n.s), dot = fx * a.dx + fz * a.dz;
    let dir = dot >= 0 ? 1 : -1;
    if (direction === 1 || direction === -1) dir = direction;
    if ((dir < 0 && n.s < 3) || (dir > 0 && n.s > route.L - 3)) dir = -dir;      // at an end, the only way is back
    const score = n.d - 10 * Math.abs(dot) - (route !== routes.main && dir > 0 && n.s < 30 && dot > 0.3 ? 5 : 0);
    if (!best || score < best.score) best = { route, n, dir, score };
  }
  if (!best) { toast('Too far from the marked route to follow it — walk back to the wands first.', 'warn'); return false; }
  const { route, n, dir } = best;
  game.auto = { route, dir, startS: n.s, hint: n.i, campAtStart: nearCamp(P.x, P.z)?.id || null, resting: false, nonstop };
  toast(`Following the route ${dir > 0 ? 'up' : 'down'}${nonstop ? ' without stopping at camps' : ''} — time ×4. Any movement key takes back control.`, 'info', 3.5);
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
  for (const c of A.nonstop ? [] : game.camps) {
    if (routes[c.route] !== R || c.id === A.campAtStart) continue;
    if ((A.dir > 0 ? s >= c.s - 8 && A.startS < c.s - 8 : s <= c.s + 8 && A.startS > c.s + 8)) { stopAutopilot(`Arrived at ${c.name}.`); return null; }
  }
  if (!A.nonstop && R === routes.main && A.dir > 0 && A.startS < R.s('yellowband') - 10 && s >= R.s('yellowband') - 3) {
    stopAutopilot('Yellow Band junction: left (on) to the Geneva Spur and South Col, or switch to the Lhotse ropes [E] for Lhotse.'); return null;
  }
  if (A.dir > 0 && s >= R.L - 2) { stopAutopilot(`Top of the ${CLIMBS.find((c) => c.route === R.name).short} route.`); return null; }
  if (A.dir < 0 && s <= 2) {
    if (R !== routes.main) { // Continue down the main route from this branch's junction.
      const m = routes.main, junction = CLIMBS.find((c) => c.route === R.name).junction;
      game.auto = { ...A, route: m, startS: m.s(junction), hint: m.tags[junction] }; return null;
    }
    stopAutopilot('End of the route.'); return null;
  }
  // rest when out of breath
  if (S.winded || S.stamina < 3) A.resting = true;
  if (A.resting && S.stamina > Math.min(45, maxStamina(S) - 5)) A.resting = false;
  // clip into ropes on the way
  if (P.clipped >= 0 && game.world.ropes[P.clipped].route !== R) P.clipped = -1;
  if (P.clipped < 0) { const nr = nearestRope(P.x, P.z, -1, 400, R); if (nr.d < 4) clipTo(nr.rope); }
  else {
    const other = nearestRope(P.x, P.z, P.clipped, 400, R);
    if (other.d < 4) {
      const ahead = R.at(s + A.dir * 12), cur = game.world.ropes[P.clipped].pts;
      const curBest = Math.min(...cur.filter((_, k) => k % 4 === 0).map((q) => Math.hypot(q.x - ahead.x, q.z - ahead.z)));
      if (Math.hypot(other.px - ahead.x, other.pz - ahead.z) < curBest) clipTo(other.rope);
    }
  }
  if (A.resting) return { dx: 0, dz: 0, sprint: false };
  let t = R.at(s + A.dir * 7);
  const holes=game.world.crevasseField;
  if(holes && R===routes.main) {
    A.crossed ??= new Set();
    if(!A.crossing) {
      const cv=holes.records.find(cv=>cv.ladder && !A.crossed.has(cv.id) && Math.hypot(cv.x-P.x,cv.z-P.z)<9);
      if(cv) {const loc=holes.local(cv,P.x,P.z);A.crossing={id:cv.id,entry:loc.v<0?-1:1,phase:0};}
    }
    if(A.crossing) {
      const c=A.crossing,cv=holes.records.find(v=>v.id===c.id),ext=cv.w/2+2.2;
      const waypoint=(side)=>({x:cv.x-cv.uz*ext*side,z:cv.z+cv.ux*ext*side});
      t=waypoint(c.phase? -c.entry:c.entry);
      if(Math.hypot(t.x-P.x,t.z-P.z)<.3) {
        if(!c.phase){c.phase=1;t=waypoint(-c.entry);}
        else {A.crossed.add(cv.id);A.crossing=null;t=R.at(s+A.dir*7);}
      }
    }
  }
  let dx = t.x - P.x, dz = t.z - P.z; const l = Math.hypot(dx, dz) || 1;
  dx /= l; dz /= l;
  view.yaw += wrapAngle(Math.atan2(-dx, -dz) - view.yaw) * 0.04;
  return { dx, dz, sprint: false };
}

// ---------------- movement
/** ctl: { dx, dz, sprint } world-space direction (unit or zero), or null for autopilot */
export function updatePlayer(dt, ctl) {
  const { P, S, field } = game;
  if (P.falling || P.recovery) return;
  if (game.auto) ctl = autopilotControl() || { dx: 0, dz: 0 };   // manual input cancels it (see step.js)
  let dx = ctl ? ctl.dx : 0, dz = ctl ? ctl.dz : 0;
  const current=querySupport(game,P,.6);
  if(!current || current.kind==='cavity') {game.physics?.startFall({reason:'crevasse',region:region(),velocity:P.velocity});return;}
  P.lastSupported={x:P.x,y:current.height,z:P.z,clipped:P.clipped};
  let crossing=null;
  for(const cv of game.world.crevasseField?.nearby({x0:P.x-4,x1:P.x+4,z0:P.z-4,z1:P.z+4})||[]) {
    if(!cv.ladder)continue;const {u,v}=game.world.crevasseField.local(cv,P.x,P.z);
    if(Math.abs(u)>.85 || Math.abs(v)>cv.w/2+2.3)continue;
    crossing=cv;
    const along=-dx*cv.uz+dz*cv.ux,lateral=dx*cv.ux+dz*cv.uz;
    if(Math.abs(along)>.75 && Math.abs(lateral)<.55) {
      const correction=clamp(-u*3,-.65,.65);dx=-cv.uz*along+cv.ux*correction;dz=cv.ux*along+cv.uz*correction;
      const l=Math.hypot(dx,dz);if(l>1){dx/=l;dz/=l;}
    }
    break;
  }
  P.moving = !!(dx || dz); P.sprint = false; P.grade = 0; P.onLadder = current.kind==='ladder';
  if (P.moving) {
    const sprint = !!ctl.sprint && S.stamina > 4 && !S.winded && !crossing;
    const h0 = groundHeight(game,P.x,P.z), grade = (groundHeight(game,P.x + dx * 1.5,P.z + dz * 1.5) - h0) / 1.5;
    P.grade = grade;
    const slopeF = grade > 0 ? 1 / (1 + MOVE.uphill * grade) : 1 / (1 + MOVE.downhill * -grade);
    const weightF = clamp(1 - (packLoad(S) - 14) / 80, 0.65, 1);
    const exhF = 1 - 0.35 * smoothstep(50, 100, S.exh), frostF = 1 - 0.3 * smoothstep(50, 100, S.frost);
    const wdir = game.weather.sample(game.time).dir * D2R;
    const head = Math.max(0, -(dx * -Math.sin(wdir) + dz * Math.cos(wdir)));
    const windF = 1 - clamp((game.env.wind - 35) / 160, 0, 0.35) * head;
    const stamF = S.stamina < 8 && grade > 0.2 ? 0.55 : 1;
    const v3 = (sprint ? MOVE.sprint : MOVE.walk) * slopeF * hypF(S) * weightF * exhF * frostF * windF * stamF * (crossing ? .45 : 1);
    const mul = speedFactor();          // debug walk speed
    P.sprint = sprint;
    const vh = (v3 * mul) / Math.sqrt(1 + grade * grade);
    let nx = P.x + dx * vh * dt, nz = P.z + dz * vh * dt;
    const hn = groundHeight(game,nx,nz), stepGrade = (hn - h0) / Math.max(0.01, Math.hypot(nx - P.x, nz - P.z));
    if (stepGrade > MOVE.maxGrade && P.clipped < 0 && !game.free) { emit('prompt', 'Too steep to climb here — find the route or a fixed rope', 1.2); nx = P.x; nz = P.z; }
    [nx, nz] = seracCollide(nx, nz);
    if (P.clipped >= 0) {
      const pr = ropeProject(P.clipped, nx, nz, P.ropeHint); P.ropeHint = pr.i;
      if (pr.end && pr.beyond > 2.5) {
        const other = nearestRope(nx, nz, P.clipped, 400, game.auto?.route);
        if (other.d < 5) { clipTo(other.rope); toast(`Clipped over to the ${game.world.ropes[other.rope].name}.`); }
        else { toast(`End of the ${game.world.ropes[P.clipped].name} — unclipped.`); P.clipped = -1; }
      } else if (pr.d > MOVE.ropeLeash) {
        nx = pr.px + ((nx - pr.px) / pr.d) * MOVE.ropeLeash; nz = pr.pz + ((nz - pr.pz) / pr.d) * MOVE.ropeLeash;
      }
    }
    nx = clamp(nx, field.x0 + 100, field.x1 - 100); nz = clamp(nz, field.z0 + 100, field.z1 - 100);
    const sweep=sweepSupport(game,P,{x:nx,z:nz});
    if(!sweep.support) {
      P.lastSupported={...sweep.last,clipped:P.clipped};
      const velocity={x:(nx-P.x)/dt,y:grade*vh,z:(nz-P.z)/dt};
      Object.assign(P,{x:sweep.x,y:sweep.y,z:sweep.z});
      game.physics?.startFall({reason:'crevasse',region:region(),velocity});return;
    }
    P.onLadder=sweep.support.kind==='ladder';
    S.distance += Math.hypot(nx - P.x, nz - P.z);
    P.velocity={x:(nx-P.x)/dt,y:(sweep.support.height-current.height)/dt,z:(nz-P.z)/dt};
    P.x = nx; P.z = nz;
    P.facing = Math.atan2(-dx, -dz);
    P.phase += dt * v3 * 1.9;
    if (sprint) S.stamina -= 14 * dt;
    else if (grade > 0.6) S.stamina -= 1.4 * (grade - 0.6) * dt;
    else S.stamina += 5 * (0.3 + 0.7 * smoothstep(55, 92, S.spo2)) * dt;
    // slips: steep faces are dangerous unless clipped into a fixed rope
    if (P.clipped < 0 && !P.onLadder && !game.free) {
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
    P.velocity={x:0,y:0,z:0};
    S.stamina += 14 * (0.3 + 0.7 * smoothstep(55, 92, S.spo2)) * dt;
    P.phase *= 0.9;
    if (P.clipped < 0 && !game.free && field.slope(P.x, P.z).mag > 2.2 && Math.random() < 0.6 * dt) startFall();
  }
  if (S.stamina <= 0) { S.stamina = 0; if (!S.winded) toast('Out of breath — stop and recover.', 'warn'); S.winded = true; }
  if (S.winded && S.stamina > 25) S.winded = false;
  S.stamina = clamp(S.stamina, 0, maxStamina(S));
  if(!P.falling) P.y = game.world.crevasseField?.ladderSupport(P.x,P.z)?.height ?? groundHeight(game,P.x,P.z);
}

// ---------------- falls
export function startFall() {
  return game.physics?.startFall({region:region().replace(/^(Camp|Lhotse Camp) \d.*/, 'route')});
}
