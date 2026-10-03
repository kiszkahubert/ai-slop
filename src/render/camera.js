// Third-person (default) and first-person camera, with hypoxia sway and terrain collision.
import * as THREE from 'three';
import { clamp, lerp } from '../core/math.js';

export class CameraRig {
  constructor(camera) {
    this.camera = camera; this.sway = 0; this.dist = 7; this.target = new THREE.Vector3();
    this.free = null;   // debug free camera: { pos: [x,y,z], look: [x,y,z] }
  }
  update(dt, time, game, climber) {
    const { P, S, view, field } = game, cam = this.camera;
    if (this.free) { cam.position.set(...this.free.pos); cam.lookAt(...this.free.look); climber.group.visible = true; return; }
    this.sway = lerp(this.sway, clamp((74 - S.spo2) / 18, 0, 1) * (game.mode === 'play' ? 1 : 0.3), dt * 0.8);
    const sw = this.sway, fall = P.falling ? 1 : 0;
    const yaw = view.yaw + sw * 0.05 * Math.sin(time * 0.53) + fall * 0.05 * Math.sin(time * 13);
    const pitch = clamp(view.pitch + sw * 0.035 * Math.sin(time * 0.71 + 1) + (P.onLadder ? 0.01 * Math.sin(time * 6) : 0), -1.45, 1.45);
    const roll = sw * 0.06 * Math.sin(time * 0.37) + fall * 0.15 * Math.sin(time * 9);
    if (view.fp) {
      cam.position.set(P.x, P.y + 1.65 + (P.moving ? Math.sin(P.phase * 2) * 0.04 : 0), P.z);
      cam.rotation.set(pitch, yaw, roll, 'YXZ');
      climber.group.visible = false;
      return;
    }
    climber.group.visible = true;
    this.target.set(P.x, P.y + 1.55, P.z);
    const fx = -Math.sin(yaw) * Math.cos(pitch), fy = Math.sin(pitch), fz = -Math.cos(yaw) * Math.cos(pitch);
    let want = view.dist;
    for (let k = 1; k <= 12; k++) {
      const d = (view.dist * k) / 12, x = this.target.x - fx * d, y = this.target.y - fy * d, z = this.target.z - fz * d;
      if (y < field.height(x, z) + 0.5) { want = Math.max(1.2, d - view.dist / 12); break; }
    }
    this.dist = want < this.dist ? want : lerp(this.dist, want, Math.min(1, dt * 3));
    cam.position.set(this.target.x - fx * this.dist, this.target.y - fy * this.dist, this.target.z - fz * this.dist);
    const gh = field.height(cam.position.x, cam.position.z) + 0.4;
    if (cam.position.y < gh) cam.position.y = gh;
    cam.lookAt(this.target);
    cam.rotateZ(roll);
  }
}
