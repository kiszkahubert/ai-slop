// Easter egg: strap on skis anywhere on the mountain ([X]) and ski down it. Gravity pulls you down the fall
// line, the edges hold you along the skis, and you carve by steering toward the way you want to go.
//   W (towards the tips) skate · A/D carve · S (back) snowplough brake · Shift tuck · X skis off
import { clamp, wrapAngle } from '../core/math.js';
import { toast } from '../core/events.js';
import { game, region } from './game.js';
import { seracCollide, stopAutopilot } from './player.js';
import { maxStamina } from './physiology.js';
import { groundHeight, querySupport, sweepSupport } from './surface.js';

export const SKI = {
  g: 9.81,
  mu: 0.04, muBrake: 0.5, muRock: 0.45,   // snow friction gliding / snowploughing / on rock
  drag: 0.0045, dragTuck: 0.0022, dragBrake: 0.012,   // air drag per metre, as k·v²
  edgeGrip: 8,                            // how fast sideways slide dies away (1/s)
  edgeHold: 4.4,                          // sideways pull the edges hold outright (m/s², ~40° traverses)
  turnRate: 1.9,                          // rad/s
  skate: 2.2, skateMax: 4,                // skating push (m/s²) up to this speed
  bonk: 12,                               // hitting a serac faster than this hurts (m/s)
  wobble: 33,                             // above this the skis start to chatter (m/s)
};

const heading = (h) => [-Math.sin(h), -Math.cos(h)];

export function toggleSkis() {
  const P = game.P;
  if (P.falling) return false;
  if (P.ski) {
    if (P.ski.speed > 3) { toast('Slow down first — snowplough with S.', 'warn', 2); return false; }
    P.ski = null;
    toast('Skis off. Back on your crampons.', 'info', 2.5);
    return true;
  }
  stopAutopilot();
  if (P.clipped >= 0) P.clipped = -1;
  P.ski = { h: P.facing, u: 0, w: 0, speed: 0, pitch: 0, tuck: false, brake: false, cv: null };
  toast('⛷ Skis on! W skate · A/D carve · S snowplough · Shift tuck · X to take them off.', 'good', 6);
  return true;
}

/** One step on skis. ctl: { dx, dz, sprint } world-space direction the player wants, like walking. */
export function updateSki(dt, ctl) {
  const { P, S, field } = game, K = P.ski;
  if(K.air) {skiFlight(dt);return;}
  P.lastSupported={x:P.x,y:P.y,z:P.z,clipped:-1};
  // steering: turn the skis toward the direction asked for; straight back means brake, straight on means skate
  K.brake = false;
  let push = false;
  if (ctl && (ctl.dx || ctl.dz)) {
    const diff = wrapAngle(Math.atan2(-ctl.dx, -ctl.dz) - K.h);
    if (Math.abs(diff) > 2.4) K.brake = true;
    else {
      K.h = wrapAngle(K.h + clamp(diff, -SKI.turnRate * dt, SKI.turnRate * dt));
      push = Math.abs(diff) < 0.6;
    }
  }
  K.tuck = !!ctl?.sprint && !K.brake;
  const [hx, hz] = heading(K.h), nx0 = -hz, nz0 = hx;   // along the skis / to their left
  // gravity along the surface, projected onto the horizontal: g·sinθ·cosθ down the fall line
  const sl = field.slope(P.x, P.z, 1.5), G2 = sl.gx * sl.gx + sl.gz * sl.gz, cosT = 1 / Math.sqrt(1 + G2);
  const ax = (-SKI.g * sl.gx) / (1 + G2), az = (-SKI.g * sl.gz) / (1 + G2);
  // turning carries the speed round with the skis
  const an = ax * nx0 + az * nz0, hold = K.brake ? SKI.edgeHold * 0.6 : SKI.edgeHold;
  let u = K.u + (ax * hx + az * hz) * dt, w = K.w + Math.sign(an) * Math.max(0, Math.abs(an) - hold) * dt;
  w *= Math.exp(-SKI.edgeGrip * (K.brake ? 1.5 : 1) * dt);
  if (push && u > -0.5 && u < SKI.skateMax) { u += SKI.skate * dt; S.stamina -= 3 * dt; }
  const rocky = field.rock && field.rock[cellIndex(field, P.x, P.z)] > 128;
  const mu = K.brake ? SKI.muBrake : rocky ? SKI.muRock : SKI.mu;
  const k = K.brake ? SKI.dragBrake : K.tuck ? SKI.dragTuck : SKI.drag;
  const decel = (mu * SKI.g * cosT + k * u * u) * dt;
  u = Math.abs(u) <= decel ? 0 : u - Math.sign(u) * decel;
  let vx = u * hx + w * nx0, vz = u * hz + w * nz0;
  let nx = P.x + vx * dt, nz = P.z + vz * dt;
  const hv = Math.hypot(vx, vz), grade = hv > 1e-3 ? (groundHeight(game,nx,nz) - groundHeight(game,P.x,P.z)) / (hv * dt) : 0;
  K.speed = hv * Math.sqrt(1 + grade * grade);
  const sweep=sweepSupport(game,P,{x:nx,z:nz});
  if(!sweep.support) {
    P.lastSupported={...sweep.last,clipped:-1};Object.assign(P,{x:sweep.x,y:sweep.y,z:sweep.z});
    K.u=u;K.w=w;K.air={vx,vy:grade*hv,vz};
    skiFlight(dt*(1-sweep.t));return;
  }
  // seracs: bounce off
  const [sx, sz] = seracCollide(nx, nz);
  if (Math.hypot(sx - nx, sz - nz) > 1e-3) {
    if (K.speed > SKI.bonk) {
      if(game.physics) { game.physics.startFall({reason:'ski crash',region:region(),velocity:{x:vx,y:grade*hv,z:vz}}); return; }
    }
    u = 0; w = 0; vx = vz = 0;
  }
  nx = clamp(sx, field.x0 + 100, field.x1 - 100); nz = clamp(sz, field.z0 + 100, field.z1 - 100);
  // speed wobble: past ~120 km/h the skis chatter and you can lose them
  if (K.speed > SKI.wobble && !game.free && Math.random() < ((K.speed - SKI.wobble) / 10) ** 2 * (K.tuck ? 1 : 0.6) * dt) {
    P.x = nx; P.z = nz; P.y = groundHeight(game,nx,nz); P.ski = null;
    game.physics?.startFall({reason:'lost ski edge',region:region(),velocity:{x:vx,y:grade*hv,z:vz}});
    return;
  }
  S.distance += Math.hypot(nx - P.x, nz - P.z);
  P.velocity={x:vx,y:grade*hv,z:vz};
  P.x = nx; P.z = nz; P.y = sweep.support.height;
  K.u = u; K.w = w;
  // the skis follow the slope along their length
  K.pitch = Math.atan((groundHeight(game,P.x+hx,P.z+hz)-groundHeight(game,P.x-hx,P.z-hz))/2);
  P.facing = K.h;
  P.moving = K.speed > 0.5; P.sprint = false; P.grade = clamp(grade, -2, 2); P.onLadder = false;
  P.phase *= 0.9;
  if (!push) S.stamina += (K.speed > 0.5 ? 6 : 14) * dt;
  S.stamina = clamp(S.stamina, 0, maxStamina(S));
  if (S.winded && S.stamina > 25) S.winded = false;
  // the camera swings round behind you as you pick up speed
  game.view.yaw += wrapAngle(K.h - game.view.yaw) * clamp(K.speed / 15, 0, 1) * Math.min(1, dt * 2);
}

function skiFlight(dt) {
  const P=game.P,K=P.ski,a=K.air,holes=game.world.crevasseField;
  const nx=P.x+a.vx*dt,nz=P.z+a.vz*dt,ny=P.y+a.vy*dt-.5*SKI.g*dt*dt;
  a.vy-=SKI.g*dt;P.velocity={x:a.vx,y:a.vy,z:a.vz};
  const direction={x:nx-P.x,y:ny-P.y,z:nz-P.z},length=Math.hypot(direction.x,direction.y,direction.z);
  const hit=length>0?holes?.ray({x:P.x,y:P.y+.2,z:P.z},direction,length):null;
  const support=querySupport(game,{x:nx,y:ny+.3,z:nz},.8);
  const surface=holes?.at(nx,nz)?null:groundHeight(game,nx,nz);
  Object.assign(P,{x:nx,y:ny,z:nz});P.moving=true;P.onLadder=false;
  if(hit || (support?.kind==='cavity')) {
    if(hit)Object.assign(P,{x:hit.point.x,y:hit.point.y-.2,z:hit.point.z});
    game.physics.startFall({reason:'crevasse',region:region(),velocity:P.velocity});return;
  }
  if(surface!==null && ny<=surface+.08 && a.vy<=0) {
    if(a.vy<-6) {game.physics.startFall({reason:'ski landing',region:region(),velocity:P.velocity});return;}
    P.y=surface;K.air=null;P.lastSupported={x:P.x,y:P.y,z:P.z,clipped:-1};return;
  }
  if(ny<game.field.height(nx,nz)-.55) game.physics.startFall({reason:'crevasse',region:region(),velocity:P.velocity});
}

const cellIndex = (f, x, z) => clamp(Math.round((z - f.z0) / f.cell), 0, f.nz - 1) * f.nx + clamp(Math.round((x - f.x0) / f.cell), 0, f.nx - 1);
