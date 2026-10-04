// Climbing helmet: shell, vents, rim and chin strap in a semi-matte finish, with the logo applied as decals on the
// front and both sides (DecalGeometry follows the shell's curvature). The logo comes from VISUALS.helmetLogoUrl;
// until that file loads (or if it is missing) a drawn placeholder is shown, so swapping it is just replacing the PNG.
import * as THREE from 'three';
import { DecalGeometry } from 'three/addons/geometries/DecalGeometry.js';
import { VISUALS } from '../config.js';
import { createLogoPlaceholder } from './proceduralTextures.js';

export function createHelmet({ shellColor = 0xf4f5f7, accentColor = 0x1d3f8f } = {}) {
  const g = new THREE.Group();
  const shellMat = new THREE.MeshStandardMaterial({ color: shellColor, roughness: 0.48, metalness: 0.0 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x15171c, roughness: 0.7 });
  const accentMat = new THREE.MeshStandardMaterial({ color: accentColor, roughness: 0.55 });
  const strapMat = new THREE.MeshStandardMaterial({ color: 0x222a36, roughness: 0.85 });

  // shell: a slightly elongated dome that covers the back of the head a little lower than the front
  const shellGeo = new THREE.SphereGeometry(0.152, 40, 24, 0, Math.PI * 2, 0, Math.PI * 0.56);
  const pos = shellGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const z = pos.getZ(i), y = pos.getY(i);
    if (z > 0 && y < 0.03) pos.setY(i, y - 0.025 * (z / 0.152));      // lower at the back
  }
  shellGeo.computeVertexNormals();
  const shell = new THREE.Mesh(shellGeo, shellMat);
  shell.scale.set(1.0, 0.92, 1.12); shell.castShadow = true; shell.receiveShadow = true;
  // rim
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.152, 0.008, 8, 48), accentMat);
  rim.rotation.x = Math.PI / 2; rim.scale.set(1.0, 1.12, 1); rim.position.y = 0.006;
  // vents: three rounded slots each side of the crest
  const vents = new THREE.Group();
  const ventGeo = new THREE.CapsuleGeometry(0.009, 0.045, 4, 8);
  for (const s of [-1, 1]) for (let k = 0; k < 3; k++) {
    const v = new THREE.Mesh(ventGeo, darkMat);
    const th = s * 0.36;
    v.position.set(Math.sin(th) * 0.135, 0.128 - Math.abs(k - 1) * 0.008, (k - 1) * 0.06);
    v.rotation.set(Math.PI / 2, 0, -th);
    vents.add(v);
  }
  // chin strap and buckle
  const strap = new THREE.Mesh(new THREE.TorusGeometry(0.115, 0.006, 6, 32, Math.PI * 1.05), strapMat);
  strap.rotation.set(0, Math.PI / 2, Math.PI + 0.02); strap.position.set(0, -0.04, 0.0); strap.scale.set(1.0, 1.25, 1.0);
  const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.012, 0.02), darkMat); buckle.position.set(0, -0.185, -0.03);
  g.add(shell, rim, vents, strap, buckle);

  // logo decals, projected onto the shell (shell transform only, so they land in this group's space)
  shell.updateMatrixWorld(true);
  const logoMat = new THREE.MeshStandardMaterial({
    map: createLogoPlaceholder(), transparent: true, depthWrite: false, roughness: 0.5, metalness: 0,
    polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
  });
  const decal = (p, rotY, w, h) => {
    const m = new THREE.Mesh(new DecalGeometry(shell, p, new THREE.Euler(0, rotY, 0), new THREE.Vector3(w, h, 0.12)), logoMat);
    m.renderOrder = 1; g.add(m); return m;
  };
  decal(new THREE.Vector3(-0.15, 0.055, 0.01), -Math.PI / 2, 0.15, 0.075);   // left
  decal(new THREE.Vector3(0.15, 0.055, 0.01), Math.PI / 2, 0.15, 0.075);     // right
  decal(new THREE.Vector3(0, 0.07, -0.17), Math.PI, 0.11, 0.055);            // front
  new THREE.TextureLoader().load(VISUALS.helmetLogoUrl, (tex) => {
    tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    logoMat.map.dispose(); logoMat.map = tex; logoMat.needsUpdate = true;
  }, undefined, () => { /* keep the placeholder */ });
  g.userData.logoMaterial = logoMat;
  return g;
}
