// A rendering/lighting surface around the climbing field. Gameplay keeps the original field.
import { CoreField } from './heightfield.js';
import { clamp, smoothstep } from '../core/math.js';

function sample(f, x, z) {
  const fx = clamp((x - f.x0) / f.cell, 0, f.nx - 1), fz = clamp((z - f.z0) / f.cell, 0, f.nz - 1);
  const i = Math.min(Math.floor(fx), f.nx - 2), j = Math.min(Math.floor(fz), f.nz - 2);
  const u = fx - i, v = fz - j, k = j * f.nx + i, h = f.h;
  return u + v <= 1 ? h[k] + (h[k + 1] - h[k]) * u + (h[k + f.nx] - h[k]) * v
    : h[k + f.nx + 1] + (h[k + f.nx] - h[k + f.nx + 1]) * (1 - u) + (h[k + 1] - h[k + f.nx + 1]) * (1 - v);
}

export function createLandscapeField(core, backdrop, { blendWidth = 320 } = {}) {
  if (!Number.isFinite(blendWidth) || blendWidth < 32 || backdrop.cell % core.cell !== 0) throw Error('Invalid landscape transition grid');
  const x0 = Math.floor((core.x0 - blendWidth - backdrop.x0) / backdrop.cell) * backdrop.cell + backdrop.x0;
  const z0 = Math.floor((core.z0 - blendWidth - backdrop.z0) / backdrop.cell) * backdrop.cell + backdrop.z0;
  const x1 = Math.ceil((core.x1 + blendWidth - backdrop.x0) / backdrop.cell) * backdrop.cell + backdrop.x0;
  const z1 = Math.ceil((core.z1 + blendWidth - backdrop.z0) / backdrop.cell) * backdrop.cell + backdrop.z0;
  const g = { x0, z0, cell: core.cell, nx: Math.round((x1 - x0) / core.cell) + 1, nz: Math.round((z1 - z0) / core.cell) + 1 };
  const field = new CoreField(g, new Float32Array(g.nx * g.nz), { refine: 1, proceduralDetail: false });
  field.glacier = new Uint8Array(field.h.length); field.rock = new Uint8Array(field.h.length);
  field.backdrop = backdrop; field.boundaryGrid = backdrop; field.blendWidth = blendWidth;
  const oi = Math.round((core.x0 - x0) / g.cell), oj = Math.round((core.z0 - z0) / g.cell), edge = new Map();
  const gradient = (f, x, z) => {
    const a = clamp(x - 32, f.x0, f.x1), b = clamp(x + 32, f.x0, f.x1);
    const c = clamp(z - 32, f.z0, f.z1), d = clamp(z + 32, f.z0, f.z1);
    return [(sample(f, b, z) - sample(f, a, z)) / (b - a), (sample(f, x, d) - sample(f, x, c)) / (d - c)];
  };
  for (let j = 0; j < g.nz; j++) {
    const z = z0 + j * g.cell, innerRow = j >= oj && j < oj + core.nz;
    if (innerRow) {
      const src = (j - oj) * core.nx, dst = j * g.nx + oi;
      field.h.set(core.h.subarray(src, src + core.nx), dst);
      if (core.glacier) field.glacier.set(core.glacier.subarray(src, src + core.nx), dst);
      if (core.rock) field.rock.set(core.rock.subarray(src, src + core.nx), dst);
    }
    for (let i = 0; i < g.nx; i++) {
      if (innerRow && i >= oi && i < oi + core.nx) { i = oi + core.nx - 1; continue; }
      const x = x0 + i * g.cell, k = j * g.nx + i, px = clamp(x, core.x0, core.x1), pz = clamp(z, core.z0, core.z1);
      const dx = x - px, dz = z - pz, distance = Math.hypot(dx, dz), low = sample(backdrop, x, z);
      field.h[k] = low;
      if (distance >= blendWidth) continue;
      const ci = Math.round((px - core.x0) / core.cell), cj = Math.round((pz - core.z0) / core.cell), key = cj * core.nx + ci;
      let e = edge.get(key);
      if (!e) {
        const cg = gradient(core, px, pz), bg = gradient(backdrop, px, pz);
        e = [core.h[key] - sample(backdrop, px, pz), clamp(cg[0] - bg[0], -.25, .25), clamp(cg[1] - bg[1], -.25, .25)];
        edge.set(key, e);
      }
      const t = distance / blendWidth, h00 = 1 - 3 * t * t + 2 * t * t * t, h10 = t * (1 - t) * (1 - t);
      const slope = clamp((e[1] * dx + e[2] * dz) / distance, -.25, .25);
      field.h[k] = low + h00 * e[0] + blendWidth * h10 * slope;
      field.glacier[k] = (core.glacier?.[key] || 0) * h00;
      field.rock[k] = (core.rock?.[key] || 0) * h00;
    }
  }
  // Normal filters can sample across the outer join instead of clamping to a flat edge.
  field.height = (x, z) => sample(x < x0 || x > x1 || z < z0 || z > z1 ? backdrop : field, x, z);
  field.heightAt = (i, j) => i < 0 || j < 0 || i >= g.nx || j >= g.nz ? sample(backdrop, x0 + i * g.cell, z0 + j * g.cell) : field.h[j * g.nx + i];
  field.normalSpan = (x, z, span) => {
    const d = Math.min(x - x0, x1 - x, z - z0, z1 - z);
    return span + (backdrop.cell - span) * (1 - smoothstep(0, backdrop.cell, d));
  };
  return field;
}
