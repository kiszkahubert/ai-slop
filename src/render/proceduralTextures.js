// Procedural textures, generated at load so the game needs no texture files:
//  - terrain layers (rock, snow, ice/firn, moraine) as two texture arrays: albedo (sRGB, A = height) and
//    surface (RG = tangent-space normal, B = roughness, A = ambient occlusion)
//  - the quilted down-jacket normal map, and a placeholder for the helmet logo decal.
// All noise is tileable so the textures repeat seamlessly.
import * as THREE from 'three';
import { applyPhotographedRock } from './terrainAssets.js';
import { mulberry32 } from '../core/noise.js';

// ---------------- tileable noise
function valueNoise(S, cells, rand) {
  const g = new Float32Array(cells * cells);
  for (let i = 0; i < g.length; i++) g[i] = rand();
  const out = new Float32Array(S * S), k = cells / S;
  for (let y = 0; y < S; y++) {
    const fy = y * k, j = Math.floor(fy); let v = fy - j; v = v * v * (3 - 2 * v);
    const r0 = (j % cells) * cells, r1 = ((j + 1) % cells) * cells;
    for (let x = 0; x < S; x++) {
      const fx = x * k, i = Math.floor(fx); let u = fx - i; u = u * u * (3 - 2 * u);
      const i0 = i % cells, i1 = (i + 1) % cells;
      const a = g[r0 + i0] + (g[r0 + i1] - g[r0 + i0]) * u, b = g[r1 + i0] + (g[r1 + i1] - g[r1 + i0]) * u;
      out[y * S + x] = a + (b - a) * v;
    }
  }
  return out;
}
/** fractal Brownian motion of tileable value noise, normalised to 0..1 */
export function fbm(S, base, rand, oct = 5, gain = 0.5) {
  const o = new Float32Array(S * S); let amp = 1, tot = 0;
  for (let k = 0; k < oct; k++) {
    const cells = base << k; if (cells > S) break;
    const l = valueNoise(S, cells, rand);
    for (let i = 0; i < o.length; i++) o[i] += l[i] * amp;
    tot += amp; amp *= gain;
  }
  for (let i = 0; i < o.length; i++) o[i] /= tot;
  return o;
}
/** tileable Worley (cellular) noise: F1, F2 (in cell units) and the id of the nearest cell */
function worley(S, cells, rand) {
  const px = new Float32Array(cells * cells), py = new Float32Array(cells * cells);
  for (let i = 0; i < px.length; i++) { px[i] = rand(); py[i] = rand(); }
  const F1 = new Float32Array(S * S), F2 = new Float32Array(S * S), id = new Uint32Array(S * S), k = cells / S;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const fx = x * k, fy = y * k, ci = Math.floor(fx), cj = Math.floor(fy);
    let d1 = 9, d2 = 9, best = 0;
    for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) {
      const ii = ci + a, jj = cj + b, wi = ((ii % cells) + cells) % cells, wj = ((jj % cells) + cells) % cells, c = wj * cells + wi;
      const dx = ii + px[c] - fx, dy = jj + py[c] - fy, d = Math.sqrt(dx * dx + dy * dy);
      if (d < d1) { d2 = d1; d1 = d; best = c; } else if (d < d2) d2 = d;
    }
    const o = y * S + x; F1[o] = d1; F2[o] = d2; id[o] = best;
  }
  return { F1, F2, id };
}
/** anisotropic (stretched) value noise: ripples elongated along x */
function stretched(S, cx, cy, rand) {
  const g = new Float32Array(cx * cy);
  for (let i = 0; i < g.length; i++) g[i] = rand();
  const out = new Float32Array(S * S);
  for (let y = 0; y < S; y++) {
    const fy = (y / S) * cy, j = Math.floor(fy); let v = fy - j; v = v * v * (3 - 2 * v);
    for (let x = 0; x < S; x++) {
      const fx = (x / S) * cx, i = Math.floor(fx); let u = fx - i; u = u * u * (3 - 2 * u);
      const at = (a, b) => g[(b % cy) * cx + (a % cx)];
      const a = at(i, j) + (at(i + 1, j) - at(i, j)) * u, b = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * u;
      out[y * S + x] = a + (b - a) * v;
    }
  }
  return out;
}
function blur(S, src, r) {
  const tmp = new Float32Array(S * S), out = new Float32Array(S * S), n = 2 * r + 1;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let s = 0; for (let k = -r; k <= r; k++) s += src[y * S + ((x + k + S) % S)];
    tmp[y * S + x] = s / n;
  }
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let s = 0; for (let k = -r; k <= r; k++) s += tmp[((y + k + S) % S) * S + x];
    out[y * S + x] = s / n;
  }
  return out;
}
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };

/** writes a Sobel normal (tangent space, xy) into RG of an RGBA byte array */
function sobelInto(S, h, strength, dst, off) {
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const H = (a, b) => h[((y + b + S) % S) * S + ((x + a + S) % S)];
    const gx = (H(1, -1) + 2 * H(1, 0) + H(1, 1)) - (H(-1, -1) + 2 * H(-1, 0) + H(-1, 1));
    const gy = (H(-1, 1) + 2 * H(0, 1) + H(1, 1)) - (H(-1, -1) + 2 * H(0, -1) + H(1, -1));
    let nx = -gx * strength, ny = -gy * strength; const l = Math.hypot(nx, ny, 1); nx /= l; ny /= l;
    const o = off + (y * S + x) * 4;
    dst[o] = (nx * 0.5 + 0.5) * 255; dst[o + 1] = (ny * 0.5 + 0.5) * 255;
  }
}

// ---------------- terrain layers
export const LAYER = { rock: 0, snow: 1, ice: 2, moraine: 3 };

function rockLayer(S, rand) {
  // dark schist and granite in strata (v runs up the face in the side projections), cracked
  const f = fbm(S, 4, rand, 6), warp = fbm(S, 2, rand, 3), w = worley(S, 6, rand), fine = fbm(S, 32, rand, 3), mask = fbm(S, 3, rand, 3);
  const grit = fbm(S, 128, rand, 2);
  const h = new Float32Array(S * S), strataTone = new Float32Array(S * S);
  for (let i = 0; i < S * S; i++) {
    const y = Math.floor(i / S) / S;
    const band = Math.sin((y * 9 + warp[i] * 1.8) * Math.PI * 2) * 0.5 + 0.5;      // 9 strata per tile (tileable)
    const crack = 1 - (1 - smooth(0.0, 0.05, w.F2[i] - w.F1[i])) * smooth(0.5, 0.7, mask[i]);   // joints only in places
    strataTone[i] = band;
    h[i] = (0.5 * f[i] + 0.25 * Math.pow(band, 3) + 0.15 * fine[i] + 0.06 * grit[i]) * (0.7 + 0.3 * crack);
  }
  const cav = blur(S, h, 4);
  const col = (i) => {
    const t = 0.55 * f[i] + 0.45 * strataTone[i], c = (0.7 + 0.45 * fine[i]) * (0.85 + 0.3 * grit[i]);
    return [(48 + 52 * t) * c, (45 + 46 * t) * c, (43 + 40 * t) * c];
  };
  return { h, cav, col, rough: (i) => 0.82 + 0.12 * (1 - h[i]), normalStrength: 7 };
}

function snowLayer(S, rand) {
  // wind-carved sastrugi: ridges stretched along x, over fine grain
  const rip = stretched(S, 4, 9, rand), rip2 = stretched(S, 7, 17, rand), grain = fbm(S, 32, rand, 3), lumps = fbm(S, 4, rand, 4);
  const patches = fbm(S, 3, rand, 3);
  const h = new Float32Array(S * S);
  for (let i = 0; i < S * S; i++) {
    const r = Math.pow(1 - Math.abs(rip[i] * 2 - 1), 3) * 0.4 + Math.pow(1 - Math.abs(rip2[i] * 2 - 1), 4) * 0.12;
    const carve = smooth(0.48, 0.72, patches[i]);
    h[i] = r * carve + 0.12 * lumps[i] + 0.035 * grain[i];
  }
  const cav = blur(S, h, 3);
  return {
    h, cav,
    col: (i) => { const c = 0.965 + 0.035 * grain[i] - 0.03 * (cav[i] - h[i] > 0 ? 1 : 0); return [236 * c, 241 * c, 250 * c]; },
    rough: (i) => 0.78 - 0.18 * smooth(0.5, 0.9, h[i]),            // crests are wind-polished
    normalStrength: 0.85,
  };
}

function iceLayer(S, rand) {
  // blue glacier ice and firn: smooth swells, a network of fine cracks, trapped bubbles
  const f = fbm(S, 3, rand, 5), w = worley(S, 10, rand), b = fbm(S, 64, rand, 2), mask = fbm(S, 4, rand, 3);
  const h = new Float32Array(S * S), crack = new Float32Array(S * S);
  for (let i = 0; i < S * S; i++) {
    crack[i] = (1 - smooth(0.0, 0.025, w.F2[i] - w.F1[i])) * smooth(0.45, 0.65, mask[i]) * 0.8;
    h[i] = 0.7 * f[i] - 0.25 * crack[i] + 0.05 * b[i];
  }
  const cav = blur(S, h, 3);
  return {
    h, cav,
    col: (i) => {
      const t = f[i], c = crack[i];
      return [150 + 60 * t - 50 * c, 190 + 40 * t - 35 * c, 222 + 25 * t - 15 * c];
    },
    rough: (i) => 0.18 + 0.15 * b[i] + 0.45 * crack[i],
    normalStrength: 2.5,
  };
}

function moraineLayer(S, rand) {
  // gravel and boulders of the moraine: two sizes of rounded stones, each with its own tint
  const big = worley(S, 10, rand), small = worley(S, 34, rand), f = fbm(S, 8, rand, 4);
  const tint = new Float32Array(10 * 10 + 34 * 34); for (let i = 0; i < tint.length; i++) tint[i] = rand();
  const h = new Float32Array(S * S);
  for (let i = 0; i < S * S; i++) h[i] = 0.6 * smooth(0.0, 0.75, 1 - big.F1[i]) + 0.35 * smooth(0.0, 0.8, 1 - small.F1[i]) + 0.1 * f[i];
  const cav = blur(S, h, 3);
  return {
    h, cav,
    col: (i) => {
      const t = big.F1[i] < 0.45 ? tint[big.id[i]] : tint[100 + small.id[i]], c = 0.7 + 0.45 * f[i];
      return [(92 + 50 * t) * c, (84 + 44 * t) * c, (76 + 38 * t) * c];
    },
    rough: () => 0.93,
    normalStrength: 6,
  };
}

/** Builds the two terrain texture arrays at the given size (power of two). */
export function createTerrainLayerTextures(S, anisotropy = 1, rock = null) {
  const rand = mulberry32(2024);
  const layers = [rockLayer(S, rand), snowLayer(S, rand), iceLayer(S, rand), moraineLayer(S, rand)];
  const albedo = new Uint8Array(S * S * 4 * layers.length), surface = new Uint8Array(S * S * 4 * layers.length);
  layers.forEach((L, k) => {
    const off = k * S * S * 4;
    let mn = 1e9, mx = -1e9; for (let i = 0; i < S * S; i++) { mn = Math.min(mn, L.h[i]); mx = Math.max(mx, L.h[i]); }
    for (let i = 0; i < S * S; i++) {
      const o = off + i * 4, c = L.col(i);
      albedo[o] = Math.min(255, c[0]); albedo[o + 1] = Math.min(255, c[1]); albedo[o + 2] = Math.min(255, c[2]);
      albedo[o + 3] = ((L.h[i] - mn) / (mx - mn || 1)) * 255;
      surface[o + 2] = clamp01(L.rough(i)) * 255;
      surface[o + 3] = clamp01(1 - Math.max(0, L.cav[i] - L.h[i]) * 6) * 255;    // cavities -> occlusion
    }
    sobelInto(S, L.h, L.normalStrength * (S / 512), surface, off);
  });
  applyPhotographedRock(S, albedo, surface, rock);
  const make = (data, srgb) => {
    const t = new THREE.DataArrayTexture(data, S, S, layers.length);
    t.format = THREE.RGBAFormat; t.type = THREE.UnsignedByteType;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
    t.generateMipmaps = true; t.anisotropy = anisotropy;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.needsUpdate = true;
    return t;
  };
  return { albedo: make(albedo, true), surface: make(surface, false), size: S };
}

/** Low-frequency RGBA noise for macro variation (breaks up tiling over hundreds of metres). */
export function createMacroNoiseTexture() {
  const S = 256, r = mulberry32(99), data = new Uint8Array(S * S * 4);
  const R = fbm(S, 4, r, 5), G = fbm(S, 8, r, 5), B = fbm(S, 16, r, 4), A = fbm(S, 8, r, 5);
  for (let i = 0; i < S * S; i++) { data[i * 4] = R[i] * 255; data[i * 4 + 1] = G[i] * 255; data[i * 4 + 2] = B[i] * 255; data[i * 4 + 3] = A[i] * 255; }
  const t = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true; t.needsUpdate = true;
  return t;
}

// ---------------- climber
/** Quilted down: horizontal baffles with stitched seams (normal map; v runs up the garment). */
export function createPuffyNormalMap(baffles = 8) {
  const S = 256, rand = mulberry32(11), grain = fbm(S, 64, rand, 2), h = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const v = ((y / S) * baffles) % 1, puff = Math.pow(Math.sin(v * Math.PI), 0.55);
    const seam = 1 - smooth(0, 0.06, Math.min(v, 1 - v));
    const stitch = seam * (Math.floor((x / S) * 64) % 2 === 0 ? 1 : 0.4);
    h[y * S + x] = puff * 0.9 - stitch * 0.15 + grain[y * S + x] * 0.04;
  }
  const data = new Uint8Array(S * S * 4).fill(255);
  sobelInto(S, h, 3.5, data, 0);
  const t = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true; t.needsUpdate = true;
  return t;
}

/** A neutral stand-in used until the real logo file exists at VISUALS.helmetLogoUrl. */
export function createLogoPlaceholder() {
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 256;
  const g = cv.getContext('2d');
  g.clearRect(0, 0, 512, 256);
  g.fillStyle = 'rgba(20,30,70,0.92)'; g.beginPath(); g.roundRect(36, 52, 440, 152, 30); g.fill();
  g.strokeStyle = '#f2c200'; g.lineWidth = 10; g.stroke();
  g.fillStyle = '#ffffff'; g.font = 'bold 92px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('LOGO', 256, 132);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
