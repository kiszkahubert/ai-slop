// Closed glacier blocks. Shape is generated on logical vertices before UV/normal seams are split.
import * as THREE from 'three';
import { mulberry32 } from '../core/noise.js';

/** Dominant-face projections keep caps and steep walls usable by tangent-space ice maps. */
export function iceFaceUVs(geometry, scale = [2.5, 4, 2.5]) {
  const p = geometry.attributes.position, uv = [], a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
    const n = b.sub(a).cross(c.sub(a));
    const axis = Math.abs(n.y) > Math.max(Math.abs(n.x), Math.abs(n.z)) ? 1 : Math.abs(n.x) > Math.abs(n.z) ? 0 : 2;
    const u = axis === 0 ? 2 : 0, v = axis === 1 ? 2 : 1;
    for (let k = i; k < i + 3; k++) uv.push(p.array[k * 3 + u] * scale[u], p.array[k * 3 + v] * scale[v]);
  }
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return geometry;
}

/** Unit-height, grounded tower with angular walls, shoulders and a broken crest. */
export function iceTowerGeometry(seed) {
  const r = mulberry32(seed), sides = 12, levels = [0, 0.12, 0.38, 0.62, 0.8, 1], widths = [1, 0.97, 0.88, 0.84, 0.74, 0.7];
  const lean = [(r() - 0.5) * 0.13, (r() - 0.5) * 0.1];
  const outline = Array.from({ length: sides }, (_, i) => {
    const angle = i * Math.PI * 2 / sides, radius = 0.9 + r() * 0.12;
    const x = Math.cos(angle), z = Math.sin(angle);
    return [Math.sign(x) * Math.pow(Math.abs(x), 0.65) * radius, Math.sign(z) * Math.pow(Math.abs(z), 0.65) * radius];
  });
  const rings = levels.map((y, row) => outline.map(([x, z]) => {
    const width = widths[row] * (1 + (r() - 0.5) * 0.045);
    const height = row === levels.length - 1 ? 0.96 + (r() - 0.5) * 0.18 : row === 0 ? 0 : y + (r() - 0.5) * 0.075;
    return [x * width + lean[0] * y * y, height, z * width + lean[1] * y * y];
  }));
  const positions = [], triangle = (a, b, c) => positions.push(...a, ...b, ...c);
  for (let row = 0; row < rings.length - 1; row++) for (let i = 0; i < sides; i++) {
    const j = (i + 1) % sides, lo = rings[row], hi = rings[row + 1];
    triangle(lo[i], hi[i], lo[j]); triangle(lo[j], hi[i], hi[j]);
  }
  const bottom = [0, 0, 0], top = [lean[0], 0.99, lean[1]];
  for (let i = 0; i < sides; i++) {
    const j = (i + 1) % sides;
    triangle(bottom, rings[0][i], rings[0][j]);
    triangle(top, rings.at(-1)[j], rings.at(-1)[i]);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals(); iceFaceUVs(geometry); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return geometry;
}
