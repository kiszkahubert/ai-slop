// Sun, sky light, moon and headlamp. The sun's shadow camera follows the climber and is snapped to whole
// shadow-map texels in light space, so shadows stay sharp near the player and never shimmer as they move.
import * as THREE from 'three';

export function setupLighting(scene, quality) {
  const sun = new THREE.DirectionalLight(0xffffff, 3);
  sun.castShadow = true;
  sun.shadow.bias = -0.00025; sun.shadow.normalBias = 0.035;
  scene.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(0xbcd4ff, 0x9a9590, 0.8); scene.add(hemi);
  const moon = new THREE.DirectionalLight(0x8ea6d8, 0); moon.position.set(-3000, 6000, 2000); scene.add(moon);
  const headlamp = new THREE.SpotLight(0xfff4e0, 0, 70, 0.55, 0.6, 1.5);
  scene.add(headlamp, headlamp.target);

  const up = new THREE.Vector3(0, 1, 0), right = new THREE.Vector3(), upv = new THREE.Vector3(), c = new THREE.Vector3();
  const L = {
    sun, hemi, moon, headlamp, extent: 55, size: 2048,
    applyQuality(q) {
      this.extent = q.shadowExtent;
      if (this.size !== q.shadowMapSize) {
        this.size = q.shadowMapSize;
        sun.shadow.mapSize.set(this.size, this.size);
        if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
      }
      Object.assign(sun.shadow.camera, { left: -this.extent, right: this.extent, top: this.extent, bottom: -this.extent, near: 1, far: 1400 });
      sun.shadow.camera.updateProjectionMatrix();
    },
    /** Centre the shadow camera on the climber, snapped to the shadow-map texel grid. */
    follow(P, sunDir) {
      right.crossVectors(up, sunDir); if (right.lengthSq() < 1e-6) right.set(1, 0, 0); right.normalize();
      upv.crossVectors(sunDir, right).normalize();
      const tex = (2 * this.extent) / this.size;
      c.set(P.x, P.y, P.z);
      const u = c.dot(right), v = c.dot(upv);
      c.addScaledVector(right, Math.floor(u / tex) * tex - u).addScaledVector(upv, Math.floor(v / tex) * tex - v);
      sun.target.position.copy(c);
      sun.position.copy(c).addScaledVector(sunDir, 600);
    },
  };
  L.applyQuality(quality);
  return L;
}
