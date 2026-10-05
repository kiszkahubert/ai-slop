// Third-person (default) and first-person camera, with hypoxia sway and terrain collision.
import * as THREE from 'three';
import { clamp, lerp } from '../core/math.js';
import { groundHeight } from '../sim/surface.js';

export class CameraRig {
  constructor(camera) {
    this.camera = camera; this.sway = 0; this.dist = 7; this.target = new THREE.Vector3();
    this.free = null;   // debug free camera: { pos: [x,y,z], look: [x,y,z] }
  }
  update(dt, time, game, climber) {
    const { P, S, view } = game, cam = this.camera;
    if (this.free) { cam.position.set(...this.free.pos); cam.lookAt(...this.free.look); climber.group.visible = true; return; }
    this.sway = lerp(this.sway, clamp((74 - S.spo2) / 18, 0, 1) * (game.mode === 'play' ? 1 : 0.3), dt * 0.8);
    const sw = this.sway, fall = !!(P.falling || P.recovery);
    const started=!!P.falling && this.fallState!==P.falling;
    this.fallState=P.falling;
    const yaw = view.yaw + sw * 0.05 * Math.sin(time * 0.53);
    // Lift the chase camera above the uphill slope while keeping the user's orbit.
    const sx=Math.sin(yaw),sz=Math.cos(yaw),grade=fall?game.field.slope(P.x,P.z,16):null;
    const fallPitch=fall ? -Math.atan(Math.max(.7,grade.gx*sx+grade.gz*sz+.5)) : view.pitch;
    const pitch = clamp(fallPitch + sw * 0.035 * Math.sin(time * 0.71 + 1) + (P.onLadder ? 0.01 * Math.sin(time * 6) : 0), -1.45, 1.45);
    const roll = sw * 0.06 * Math.sin(time * 0.37) + (P.falling?.impact || 0)*.035;
    if (view.fp && !fall) {
      cam.position.set(P.x, P.y + 1.65 + (P.moving ? Math.sin(P.phase * 2) * 0.04 : 0), P.z);
      cam.rotation.set(pitch, yaw, roll, 'YXZ');
      climber.group.visible = false;
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
    for (let k = 1; k <= 12; k++) {
      const d = (distance * k) / 12, x = this.target.x - fx * d, y = this.target.y - fy * d, z = this.target.z - fz * d;
      if (y < groundHeight(game,x,z) + 0.5) { want = Math.max(1.2, d - distance / 12); break; }
    }
    this.dist = want < this.dist ? want : lerp(this.dist, want, Math.min(1, dt * 3));
    cam.position.set(this.target.x - fx * this.dist, this.target.y - fy * this.dist, this.target.z - fz * this.dist);
    const gh = groundHeight(game,cam.position.x,cam.position.z) + 0.4;
    if (cam.position.y < gh) cam.position.y = gh;
    cam.lookAt(this.target);
    cam.rotateZ(roll);
  }
}
