// Native Pléiades height fields with Copernicus fallback (tools/build_pleiades_assets.py).
//
// CoreField: the 15.4 × 11.5 km climbing area at 4 m. Measured terrain is kept without
// procedural height noise or invented couloir walls; a boot track and camp terraces
// provide the walking surface. Metadata can still enable refinement for legacy grids.
// BackdropField: 92 × 82 km of the surrounding Himalaya at 160 m for the horizon.
import { TERRAIN } from '../config.js';
import { clamp, lerp, smoothstep } from '../core/math.js';
import { makeNoise2D, mulberry32 } from '../core/noise.js';

async function loadPixels(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load ${url} (${res.status})`);
  const bmp = await createImageBitmap(await res.blob(), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  const cv = document.createElement('canvas');
  cv.width = bmp.width; cv.height = bmp.height;
  const g = cv.getContext('2d', { willReadFrequently: true });
  g.drawImage(bmp, 0, 0);
  return g.getImageData(0, 0, bmp.width, bmp.height);
}

function decode(img, scale = 4) {
  const n = img.width * img.height, h = new Float32Array(n), b = new Uint8Array(n), d = img.data;
  for (let i = 0; i < n; i++) { h[i] = (d[i * 4] * 256 + d[i * 4 + 1]) / scale; b[i] = d[i * 4 + 2]; }
  return { h, b };
}

class GridField {
  constructor(g, h) {
    this.x0 = g.x0; this.z0 = g.z0; this.cell = g.cell; this.nx = g.nx; this.nz = g.nz; this.h = h;
    this.x1 = this.x0 + (this.nx - 1) * this.cell; this.z1 = this.z0 + (this.nz - 1) * this.cell;
  }
  contains(x, z, margin = 0) {
    return x > this.x0 + margin && x < this.x1 - margin && z > this.z0 + margin && z < this.z1 - margin;
  }
  // exact height of the finest triangle mesh (cells split along the (i+1,j)-(i,j+1) diagonal)
  height(x, z) {
    const fx = clamp((x - this.x0) / this.cell, 0, this.nx - 1.0001), fz = clamp((z - this.z0) / this.cell, 0, this.nz - 1.0001);
    const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, o = j * this.nx + i, H = this.h;
    const a = H[o], b = H[o + 1], c = H[o + this.nx], d = H[o + this.nx + 1];
    if (u + v <= 1) return a + (b - a) * u + (c - a) * v;
    return d + (c - d) * (1 - u) + (b - d) * (1 - v);
  }
  heightAt(i, j) { return this.h[clamp(j, 0, this.nz - 1) * this.nx + clamp(i, 0, this.nx - 1)]; }
}

export class BackdropField extends GridField {
  static async load(meta) {
    const img = await loadPixels(TERRAIN.backdropUrl);
    return new BackdropField(meta.backdrop, decode(img).h);
  }
}

export class CoreField extends GridField {
  constructor(g, h, options = {}) {
    super(g, h);
    this.refineFactor = options.refine ?? TERRAIN.refine;
    this.proceduralDetail = options.proceduralDetail ?? false;
  }
  static async load(meta) {
    const img = await loadPixels(TERRAIN.coreUrl);
    const { h, b } = decode(img);
    const f = new CoreField(meta.core, h, meta.runtime);
    f.base = new GridField(meta.core, h);   // measured surface (used for exposure / slip risk)
    f.glacierBase = b;
    return f;
  }

  /**
   * Keep the native grid (or refine a legacy grid), level the track and cut camp terraces.
   * summits: [{ x, z, e }] - points snapped to their surveyed elevation (the smoothed track profile
   * would otherwise shave a few metres off a sharp top).
   * extra: { pads: [{ x, z, h, rin, rout }] more terraces (Base Camp compounds, helipad, ponds),
   *          relief(x, z, h, glacier01, trackDist) -> metres added to the surface (Base Camp glacier hummocks) }
   */
  refine(routes, camps, seed = 1, summits = [], extra = {}) {
    const R = this.refineFactor, B = this.base, noise = makeNoise2D(mulberry32(seed));
    if (R !== 1 && R !== 2) throw new Error('Terrain refinement must be 1 or 2');
    const nx = (B.nx - 1) * R + 1, nz = (B.nz - 1) * R + 1, cell = B.cell / R;
    // Copy at native resolution: track/camp edits must not change the face-slope source.
    const H = R === 1 ? B.h.slice() : new Float32Array(nx * nz);
    // separable Catmull-Rom; with R = 2 only the phases 0 and ½ occur
    const W = [[0, 1, 0, 0], [-1 / 16, 9 / 16, 9 / 16, -1 / 16]];
    if (R === 2) {
      const tmp = new Float32Array(nx * B.nz);
      for (let j = 0; j < B.nz; j++) for (let i = 0; i < nx; i++) {
        const bi = Math.floor(i / R), w = W[i % R]; let s = 0;
        for (let k = 0; k < 4; k++) s += w[k] * B.heightAt(bi - 1 + k, j);
        tmp[j * nx + i] = s;
      }
      for (let j = 0; j < nz; j++) {
        const bj = Math.floor(j / R), w = W[j % R];
        for (let i = 0; i < nx; i++) {
          let s = 0;
          for (let k = 0; k < 4; k++) s += w[k] * tmp[clamp(bj - 1 + k, 0, B.nz - 1) * nx + i];
          H[j * nx + i] = s;
        }
      }
    }
    // distance to the boot track, with the index of the nearest route point
    const track = routes.flatMap((r, ri) => r.pts.map((p, pi) => ({ r: ri, i: pi, x: p.x, z: p.z })));
    const tDist = new Float32Array(nx * nz).fill(99), tRef = new Int32Array(nx * nz).fill(-1);
    const rad = 14, rc = Math.ceil(rad / cell);
    track.forEach((p, k) => {
      const ci = Math.round((p.x - B.x0) / cell), cj = Math.round((p.z - B.z0) / cell);
      for (let dj = -rc; dj <= rc; dj++) for (let di = -rc; di <= rc; di++) {
        const i = ci + di, j = cj + dj; if (i < 0 || j < 0 || i >= nx || j >= nz) continue;
        const d = Math.hypot(B.x0 + i * cell - p.x, B.z0 + j * cell - p.z), o = j * nx + i;
        if (d < tDist[o]) { tDist[o] = d; tRef[o] = k; }
      }
    });
    // smoothed natural-surface profile along each route (the level of the kicked-in track)
    const profiles = routes.map((r) => {
      const raw = r.pts.map((p) => B.height(p.x, p.z)), out = new Float32Array(raw.length);
      for (let i = 0; i < raw.length; i++) {
        let s = 0, w = 0;
        for (let k = -3; k <= 3; k++) { const q = raw[clamp(i + k, 0, raw.length - 1)], wk = Math.exp(-k * k / 6); s += q * wk; w += wk; }
        out[i] = s / w;
      }
      return out;
    });
    routes.forEach((r, ri) => { r.profile = profiles[ri]; });
    const trackHeight = (x, z, k) => {
      const t = track[k], r = routes[t.r], prof = profiles[t.r];
      let best = 1e9, hv = prof[t.i];
      for (const a of [t.i - 1, t.i]) {
        if (a < 0 || a >= r.pts.length - 1) continue;
        const p = r.pts[a], q = r.pts[a + 1], dx = q.x - p.x, dz = q.z - p.z, l2 = dx * dx + dz * dz || 1;
        const u = clamp(((x - p.x) * dx + (z - p.z) * dz) / l2, 0, 1);
        const d = Math.hypot(p.x + dx * u - x, p.z + dz * u - z);
        if (d < best) { best = d; hv = lerp(prof[a], prof[a + 1], u); }
      }
      return hv;
    };
    const pads = camps.map((c) => ({ x: c.x, z: c.z, h: profiles[c.routeIndex][c.pointIndex], rin: c.pad[0], rout: c.pad[0] + c.pad[1] }));
    pads.push(...(extra.pads || []));
    // terraces bucketed on a 64 m grid, so each terrain cell only tests the few that can reach it
    const PB = 64, padBuckets = new Map();
    for (const p of pads) {
      for (let bz = Math.floor((p.z - p.rout) / PB); bz <= Math.floor((p.z + p.rout) / PB); bz++)
        for (let bx = Math.floor((p.x - p.rout) / PB); bx <= Math.floor((p.x + p.rout) / PB); bx++) {
          const k = bx * 100003 + bz; if (!padBuckets.has(k)) padBuckets.set(k, []); padBuckets.get(k).push(p);
        }
    }
    // Rock-exposure shading for the Lhotse Couloir and Geneva Spur.
    const lh = routes[1], couloirFrom = lh.tags.couloir - 20;
    const gen = routes[0].pts[routes[0].tags.geneva];
    const rockMask = new Uint8Array(nx * nz);
    // detail + track + pads
    const glacier = new Uint8Array(nx * nz);
    for (let j = 0; j < nz; j++) {
      const z = B.z0 + j * cell;
      for (let i = 0; i < nx; i++) {
        const x = B.x0 + i * cell, o = j * nx + i;
        const bi = clamp(Math.round(i / R), 1, B.nx - 2), bj = clamp(Math.round(j / R), 1, B.nz - 2);
        glacier[o] = this.glacierBase[bj * B.nx + bi];
        let h = H[o];
        const td = tDist[o];
        if (this.proceduralDetail) { // optional legacy detail, never added to the Pléiades surface
          const gx = (B.heightAt(bi + 1, bj) - B.heightAt(bi - 1, bj)) / (2 * B.cell);
          const gz = (B.heightAt(bi, bj + 1) - B.heightAt(bi, bj - 1)) / (2 * B.cell);
          const slope = Math.hypot(gx, gz), gl = this.glacierBase[bj * B.nx + bi] / 255;
          const amp = lerp(1.1, 3.6, smoothstep(0.75, 1.3, slope)) * (1 - 0.6 * gl);
          const n = noise(x / 55, z / 55) * 0.55 + noise(x / 23 + 7.1, z / 23 - 3.3) * 0.3 + noise(x / 9.5 - 2.2, z / 9.5 + 5.4) * 0.15;
          let detail = n * amp;
          const icefall = gl * smoothstep(5330, 5420, h) * (1 - smoothstep(5960, 6040, h));
          if (icefall > 0) detail += icefall * (3.5 * (1 - Math.abs(noise(x / 26, z / 26))) - 1.6);
          h += detail * smoothstep(2.5, 12, td);
        }
        let rk = 0;
        const t = tRef[o] >= 0 ? track[tRef[o]] : null;
        if (t && t.r === 1 && t.i > couloirFrom && td > 4) {        // couloir walls
          const wall = smoothstep(4.5, 8.5, td) * (1 - smoothstep(11.5, 14, td)) * smoothstep(couloirFrom, couloirFrom + 30, t.i);
          if (this.proceduralDetail) h += 9 * wall;
          rk = Math.max(rk, smoothstep(5, 8, td) * smoothstep(couloirFrom, couloirFrom + 30, t.i));
        }
        const dg = Math.hypot(x - gen.x - 40, z - gen.z + 30);
        if (dg < 170) rk = Math.max(rk, (1 - smoothstep(60, 170, dg)) * (td > 5 ? 1 : 0.3));
        rockMask[o] = rk * 255;
        if (extra.relief) h += extra.relief(x, z, h, glacier[o] / 255, td);
        for (const p of padBuckets.get(Math.floor(x / PB) * 100003 + Math.floor(z / PB)) || []) {   // terraces first; the boot track (below) keeps its own profile
          const d = Math.hypot(x - p.x, z - p.z);
          if (d < p.rout) h = lerp(h, p.h, 1 - smoothstep(p.rin, p.rout, d));
        }
        if (td < 6.5 && tRef[o] >= 0) {
          const w = 1 - smoothstep(1.7, 6.5, td);
          h = lerp(h, trackHeight(x, z, tRef[o]), w);
        }
        for (const s of summits) {
          const d = Math.hypot(x - s.x, z - s.z);
          if (d < 10) h = lerp(h, s.e, 1 - smoothstep(2, 10, d));
        }
        H[o] = h;
      }
    }
    this.nx = nx; this.nz = nz; this.cell = cell; this.h = H; this.glacier = glacier; this.rock = rockMask;
    this.trackDist = tDist;
  }

  glacierAt(x, z) {
    const i = clamp(Math.round((x - this.x0) / this.cell), 0, this.nx - 1), j = clamp(Math.round((z - this.z0) / this.cell), 0, this.nz - 1);
    return this.glacier[j * this.nx + i] / 255;
  }
  /** gradient of the walkable surface */
  slope(x, z, e = 1.2) {
    const gx = (this.height(x + e, z) - this.height(x - e, z)) / (2 * e);
    const gz = (this.height(x, z + e) - this.height(x, z - e)) / (2 * e);
    return { gx, gz, mag: Math.hypot(gx, gz) };
  }
  /** steepness of the natural face (ignores the levelled track) - drives fall risk and exposure */
  faceSlope(x, z) {
    // Face exposure is a physical scale. A finer grid must not turn an isolated
    // four-metre ice bump on the Cwm into a steep mountainside slip hazard.
    const B = this.base, e = Math.max(B.cell, TERRAIN.faceSampleDistance);
    return Math.hypot(B.height(x + e, z) - B.height(x - e, z), B.height(x, z + e) - B.height(x, z - e)) / (2 * e);
  }
  distanceToTrack(x, z) {
    const i = clamp(Math.round((x - this.x0) / this.cell), 0, this.nx - 1), j = clamp(Math.round((z - this.z0) / this.cell), 0, this.nz - 1);
    return this.trackDist[j * this.nx + i];
  }
}
