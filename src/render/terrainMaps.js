// Maps derived from the elevation model, covering the core terrain:
//  - a relief texture: RG = world-space normal (Sobel filter on the heights), A = horizon-based ambient occlusion.
//    Distant LOD meshes are coarse; this keeps their relief crisp.
//  - MacroShadow: the shadows the mountains cast on each other (Everest over the Western Cwm, Lhotse at dusk),
//    ray-marched toward the sun on the CPU a few rows per frame, so the work never causes a hitch.
import * as THREE from 'three';

/** World rectangle (x0, z0, 1/width, 1/depth) mapping world xz to the uv of a texture with one texel per k cells. */
function texelRect(field, k, n, m) {
  const d = k * field.cell;
  return new THREE.Vector4(field.x0 - d / 2, field.z0 - d / 2, 1 / (n * d), 1 / (m * d));
}

/** Sobel normals at `cell` metres, horizon AO at `aoCell` metres. Returns { texture, rect }. */
export function createReliefTexture(field, cell, aoCell) {
  const k = Math.max(1, Math.round(cell / field.cell)), n = Math.floor((field.nx - 1) / k) + 1, m = Math.floor((field.nz - 1) / k) + 1;
  const H = (i, j) => field.heightAt(i * k, j * k), d = k * field.cell;
  const data = new Uint8Array(n * m * 4);
  for (let j = 0; j < m; j++) for (let i = 0; i < n; i++) {
    const gx = (H(i + 1, j - 1) + 2 * H(i + 1, j) + H(i + 1, j + 1)) - (H(i - 1, j - 1) + 2 * H(i - 1, j) + H(i - 1, j + 1));
    const gz = (H(i - 1, j + 1) + 2 * H(i, j + 1) + H(i + 1, j + 1)) - (H(i - 1, j - 1) + 2 * H(i, j - 1) + H(i + 1, j - 1));
    let nx = -gx / (8 * d), nz = -gz / (8 * d); const l = Math.hypot(nx, 1, nz); nx /= l; nz /= l;
    const o = (j * n + i) * 4;
    data[o] = (nx * 0.5 + 0.5) * 255; data[o + 1] = (nz * 0.5 + 0.5) * 255; data[o + 2] = 255;
  }
  // horizon AO on a coarser grid, bilinearly upsampled into A
  const ka = Math.max(1, Math.round(aoCell / field.cell)), an = Math.floor((field.nx - 1) / ka) + 1, am = Math.floor((field.nz - 1) / ka) + 1;
  const ao = new Float32Array(an * am), dirs = [];
  for (let a = 0; a < 8; a++) dirs.push([Math.cos((a / 8) * Math.PI * 2), Math.sin((a / 8) * Math.PI * 2)]);
  const steps = []; for (let s = 1; s <= 160; s *= 1.7) steps.push(s);
  for (let j = 0; j < am; j++) for (let i = 0; i < an; i++) {
    const ci = i * ka, cj = j * ka, h0 = field.heightAt(ci, cj) + 1.5;
    let occ = 0;
    for (const [dx, dz] of dirs) {
      let maxT = 0;
      for (const s of steps) {
        const ii = Math.round(ci + dx * s * ka), jj = Math.round(cj + dz * s * ka);
        if (ii < 0 || jj < 0 || ii >= field.nx || jj >= field.nz) break;
        const t = (field.h[jj * field.nx + ii] - h0) / (s * ka * field.cell);
        if (t > maxT) maxT = t;
      }
      occ += maxT / Math.sqrt(1 + maxT * maxT);          // sine of the horizon angle
    }
    ao[j * an + i] = 1 - occ / 8;
  }
  for (let j = 0; j < m; j++) for (let i = 0; i < n; i++) {
    const fx = Math.min(an - 1.001, (i * k) / ka), fz = Math.min(am - 1.001, (j * k) / ka), ii = Math.floor(fx), jj = Math.floor(fz), u = fx - ii, v = fz - jj;
    const a = ao[jj * an + ii] * (1 - u) + ao[jj * an + ii + 1] * u, b = ao[(jj + 1) * an + ii] * (1 - u) + ao[(jj + 1) * an + ii + 1] * u;
    data[(j * n + i) * 4 + 3] = Math.max(0, Math.min(1, a * (1 - v) + b * v)) * 255;
  }
  const t = new THREE.DataTexture(data, n, m, THREE.RGBAFormat);
  t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = true;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.needsUpdate = true;
  return { texture: t, rect: texelRect(field, k, n, m) };
}

export class MacroShadow {
  constructor(field, cell = 32) {
    this.f = field; this.k = Math.max(1, Math.round(cell / field.cell));
    this.n = Math.floor((field.nx - 1) / this.k) + 1; this.m = Math.floor((field.nz - 1) / this.k) + 1;
    this.back = new Uint8Array(this.n * this.m).fill(255);
    this.texture = new THREE.DataTexture(new Uint8Array(this.n * this.m).fill(255), this.n, this.m, THREE.RedFormat, THREE.UnsignedByteType);
    this.texture.minFilter = this.texture.magFilter = THREE.LinearFilter; this.texture.needsUpdate = true;
    this.row = -1; this.sun = new THREE.Vector3(); this.done = new THREE.Vector3(0, -1, 0); this.enabled = true;
    this.rect = texelRect(field, this.k, this.n, this.m);
  }
  /** Advances the ray march by `rows` rows; starts again when the sun has moved. */
  update(sunDir, rows = 24) {
    if (!this.enabled) return;
    if (this.row < 0) {
      if (sunDir.angleTo(this.done) < 0.0025) return;   // ~0.15°: nothing visible changed
      this.sun.copy(sunDir); this.row = 0;
    }
    const { f, k, n, m, back } = this, s = this.sun, hl = Math.hypot(s.x, s.z);
    const end = Math.min(m, this.row + rows);
    if (s.y <= -0.02) { back.fill(0, this.row * n, end * n); }
    else {
      const ux = s.x / (hl || 1), uz = s.z / (hl || 1), tanEl = s.y / Math.max(hl, 1e-4), step0 = k * f.cell * 1.5;
      for (let j = this.row; j < end; j++) for (let i = 0; i < n; i++) {
        const ci = i * k, cj = j * k, x0 = f.x0 + ci * f.cell, z0 = f.z0 + cj * f.cell, h0 = f.h[cj * f.nx + ci] + 2;
        let lit = 1;
        for (let d = step0; d < 22000; d *= 1.22) {
          const x = x0 + ux * d, z = z0 + uz * d;
          if (x < f.x0 || z < f.z0 || x > f.x1 || z > f.z1) break;
          const hi = Math.round((x - f.x0) / f.cell), hj = Math.round((z - f.z0) / f.cell);
          const clear = h0 + d * tanEl - f.h[hj * f.nx + hi];
          lit = Math.min(lit, 0.5 + (clear / d) * 45);            // soft edge: the sun is half a degree wide
          if (lit <= 0) { lit = 0; break; }
          if (h0 + d * tanEl > 8900) break;                      // above every summit
        }
        back[j * n + i] = lit * 255;
      }
    }
    this.row = end;
    if (this.row >= m) {
      this.texture.image.data.set(back); this.texture.needsUpdate = true;
      this.done.copy(this.sun); this.row = -1;
    }
  }
  /** Sunlit fraction (0..1) at a world position, from the last finished pass. */
  sample(x, z) {
    const d = this.k * this.f.cell, i = Math.round((x - this.f.x0) / d), j = Math.round((z - this.f.z0) / d);
    if (!this.enabled || i < 0 || j < 0 || i >= this.n || j >= this.m) return 1;
    return this.texture.image.data[j * this.n + i] / 255;
  }
  /** Finish the current pass at once (after a teleport or a jump in time). */
  flush(sunDir) { this.done.set(0, -1, 0); this.row = -1; do this.update(sunDir, this.m); while (this.row >= 0); }
}
