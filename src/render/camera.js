// Third-person (default) and first-person camera, with hypoxia sway and terrain collision.
import * as THREE from 'three';
import { clamp, lerp } from '../core/math.js';
import { groundHeight } from '../sim/surface.js';

export class CameraRig {
  constructor(camera) {
    this.camera = camera; this.sway = 0; this.dist = 7; this.target = new THREE.Vector3();
    this.free = null;   // debug free camera: { pos: [x,y,z], look: [x,y,z] }
    this.pose = null;   // last camera pose as plain arrays, for the scenic flyby's opening blend
  }
  update(dt, time, game, climber) {
    const { P, S, view } = game, cam = this.camera;
    if (game.flyby?.pose) {
      const p = game.flyby.pose;
      cam.position.set(p.pos[0], p.pos[1], p.pos[2]);
      cam.rotation.set(0, 0, 0, 'YXZ');
      cam.lookAt(p.look[0], p.look[1], p.look[2]);
      if (p.roll) cam.rotateZ(p.roll);
      if (cam.fov !== p.fov) { cam.fov = p.fov; cam.updateProjectionMatrix(); }
      this.dist = 400;                      // distant focus so depth of field keeps the peaks sharp
      this.pose = { pos: p.pos, look: p.look };
      climber.group.visible = false;
      return;
    }
    if (this.free) { cam.position.set(...this.free.pos); cam.lookAt(...this.free.look); climber.group.visible = true; return; }
    this.sway = lerp(this.sway, clamp((74 - S.spo2) / 18, 0, 1) * (game.mode === 'play' ? 1 : 0.3), dt * 0.8);
    const sw = this.sway, fall = !!(P.falling || P.recovery);
    const started=!!P.falling && this.fallState!==P.falling;
    this.fallState=P.falling;
    const yaw = view.yaw + sw * 0.05 * Math.sin(time * 0.53);
    const fx0 = -Math.sin(yaw), fz0 = -Math.cos(yaw);
    // Lift the chase camera above the uphill slope while keeping the user's orbit.
    const sx=Math.sin(yaw),sz=Math.cos(yaw),grade=fall?game.field.slope(P.x,P.z,16):null;
    const holes=game.world?.crevasseField,inCavity=!!holes?.at(P.x,P.z) && P.y<game.field.height(P.x,P.z)-.3;
    const fallPitch=fall && !inCavity ? -Math.atan(Math.max(.7,grade.gx*sx+grade.gz*sz+.5)) : view.pitch;
    const pitch = clamp(fallPitch + sw * 0.035 * Math.sin(time * 0.71 + 1) + (P.onLadder ? 0.01 * Math.sin(time * 6) : 0), -1.45, 1.45);
    const roll = sw * 0.06 * Math.sin(time * 0.37) + (P.falling?.impact || 0)*.035;
    if (view.fp && !fall) {
      cam.position.set(P.x, P.y + 1.65 + (P.moving ? Math.sin(P.phase * 2) * 0.04 : 0), P.z);
      cam.rotation.set(pitch, yaw, roll, 'YXZ');
      climber.group.visible = false;
      this.pose = { pos: [P.x, cam.position.y, P.z], look: [P.x - fx0 * 50, cam.position.y + Math.sin(pitch) * 50, P.z - fz0 * 50] };
      this.wasFalling=false;
      return;
    }
    climber.group.visible = true;
    const pose=P.falling?game.physics?.pose().pelvis:null;
    const gettingUp=P.recovery?climber.bodyParts?.get('pelvis')?.getWorldPosition(new THREE.Vector3()):null;
    const target=pose?new THREE.Vector3(...pose.p):gettingUp||new THREE.Vector3(P.x,P.y+1.55,P.z);
    if(fall && this.wasFalling && !started) this.target.lerp(target,1-Math.exp(-dt*9)); else this.target.copy(target);
    this.wasFalling=fall;
    const fx = -Math.sin(yaw) * Math.cos(pitch), fy = Math.sin(pitch), fz = -Math.cos(yaw) * Math.cos(pitch);
    const distance=fall?Math.max(9,view.dist):view.dist;
    let want = distance;
    const wall=holes?.ray(this.target,{x:-fx,y:-fy,z:-fz},distance);
    if(wall)want=Math.max(.05,wall.distance-.2);
    for (let k = 1; k <= 12; k++) {
      const d = (distance * k) / 12, x = this.target.x - fx * d, y = this.target.y - fy * d, z = this.target.z - fz * d;
      if (!holes?.at(x,z) && y < groundHeight(game,x,z) + 0.5) { want = Math.min(want, Math.max(.4, d - distance / 12)); break; }
    }
    this.dist = want < this.dist ? want : lerp(this.dist, want, Math.min(1, dt * 3));
    cam.position.set(this.target.x - fx * this.dist, this.target.y - fy * this.dist, this.target.z - fz * this.dist);
    const gh = groundHeight(game,cam.position.x,cam.position.z) + 0.4;
    if (!holes?.at(cam.position.x,cam.position.z) && cam.position.y < gh) cam.position.y = gh;
    cam.lookAt(this.target);
    cam.rotateZ(roll);
    this.pose = { pos: [cam.position.x, cam.position.y, cam.position.z], look: [this.target.x, this.target.y, this.target.z] };
    // When a wall leaves the camera inside the clothing, hide the visual body
    // until orbiting creates space. Physics and the headlamp remain active.
    if(fall && this.dist<.45)climber.group.visible=false;
  }
}
