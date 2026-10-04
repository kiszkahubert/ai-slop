// The climber: down suit, pack with an oxygen bottle, helmet, mask and ice axe.
import * as THREE from 'three';

export function makeClimber(scene) {
  const g = new THREE.Group();
  const M = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.75, ...o });
  const suit = M(0xd42a1e), pants = M(0x1d2633, { roughness: 0.8 }), dark = M(0x15171a, { roughness: 0.6 });
  const mk = (geo, mat, x, y, z, parent = g) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; };
  mk(new THREE.CapsuleGeometry(0.27, 0.42, 4, 10), suit, 0, 1.18, 0);
  mk(new THREE.CapsuleGeometry(0.22, 0.12, 4, 10), pants, 0, 0.9, 0);
  mk(new THREE.SphereGeometry(0.14, 14, 10), M(0xc58c64), 0, 1.68, 0);
  mk(new THREE.SphereGeometry(0.16, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), M(0xf4f4f4, { roughness: 0.4 }), 0, 1.71, 0.01).scale.set(1, 0.85, 1.05);
  mk(new THREE.BoxGeometry(0.24, 0.07, 0.06), M(0x223355, { metalness: 0.6, roughness: 0.2 }), 0, 1.7, -0.13);
  mk(new THREE.CylinderGeometry(0.06, 0.07, 0.1, 10), dark, 0, 1.6, -0.14).rotation.x = Math.PI / 2;
  mk(new THREE.BoxGeometry(0.46, 0.6, 0.26), M(0xf2b01e, { roughness: 0.7 }), 0, 1.2, 0.27);
  mk(new THREE.CylinderGeometry(0.075, 0.075, 0.56, 10), M(0xe85d10, { roughness: 0.35, metalness: 0.4 }), 0.14, 1.32, 0.44).rotation.z = 0.1;
  const legs = [], arms = [];
  for (const s of [-1, 1]) {
    const hip = new THREE.Group(); hip.position.set(0.12 * s, 0.92, 0); g.add(hip);
    mk(new THREE.CapsuleGeometry(0.1, 0.55, 4, 8), pants, 0, -0.4, 0, hip);
    mk(new THREE.BoxGeometry(0.16, 0.14, 0.3), M(0xe0b800), 0, -0.82, -0.04, hip);
    legs.push(hip);
    const sh = new THREE.Group(); sh.position.set(0.34 * s, 1.42, 0); g.add(sh);
    mk(new THREE.CapsuleGeometry(0.08, 0.48, 4, 8), suit, 0, -0.3, 0, sh);
    mk(new THREE.SphereGeometry(0.08, 8, 6), dark, 0, -0.6, 0, sh);
    arms.push(sh);
  }
  const axe = new THREE.Group(); axe.position.set(0, -0.6, 0); arms[1].add(axe);
  mk(new THREE.BoxGeometry(0.03, 0.62, 0.03), dark, 0, -0.2, -0.05, axe);
  mk(new THREE.BoxGeometry(0.03, 0.04, 0.28), M(0x999999, { metalness: 0.8 }), 0, 0.08, -0.05, axe);
  scene.add(g);

  return {
    group: g,
    update(dt, P) {
      g.position.set(P.x, P.y, P.z);
      g.rotation.y += Math.atan2(Math.sin(P.facing - g.rotation.y), Math.cos(P.facing - g.rotation.y)) * Math.min(1, dt * 10);
      const sw = Math.sin(P.phase) * (P.moving ? 0.65 : 0);
      legs[0].rotation.x = sw; legs[1].rotation.x = -sw;
      arms[0].rotation.x = -sw * 0.8; arms[1].rotation.x = sw * 0.8 - (P.grade > 0.5 ? 0.9 : 0.2);
      g.rotation.x = P.falling ? 1.2 : P.moving && P.grade > 0.5 ? -0.12 : 0;
    },
  };
}
