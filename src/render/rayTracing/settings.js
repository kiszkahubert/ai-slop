export const RT_LIMITS = Object.freeze({ memory: 256 * 1024 * 1024, radius: 120, fade: 80, region: 1024, snap: 128,
  sunDistance: 256, bounceDistance: 128, gpuBudget: 5, maxWidth: 960, maxHeight: 540,
  cacheHistory: 8,                 // samples in the landscape caches' running average
  startScale: 0.35,                // local lighting resolution (fraction of the screen) to start from
  scales: [0.5, 0.35, 0.25, 0.18], // what the frame-time / GPU-time adaptation steps through
  frameBudgetMs: 24,               // without GPU timers: drop resolution when frames take longer than this
  minPrimitiveRadius: 0.3,         // smaller instances (pebbles, pegs, guy lines) are left out of the ray structure
  detailRadius: 180,               // camp models: detailed within this distance of the region centre, simple beyond
});
/** Restart the caches only for a discontinuity between two frames: a jump in time, or the sun jumping ~6°. */
export function shouldResetCaches(lastTime, time, lastSun, sun) {
  return lastTime === null || Math.abs(time - lastTime) > 1 || lastSun.distanceTo(sun) > 0.1;
}
/**
 * Adaptive local resolution. gpuMs: measured lighting GPU time (null when timer queries are unavailable);
 * frameMs: smoothed frame interval. Returns the next scale (one step at a time).
 */
export function nextScale(scale, gpuMs, frameMs, limit = 1) {
  const S = RT_LIMITS.scales, found = S.findIndex((v) => v <= scale + 1e-6), i = found < 0 ? S.length - 1 : found;
  const slow = gpuMs !== null ? gpuMs > RT_LIMITS.gpuBudget : frameMs > RT_LIMITS.frameBudgetMs;
  const fast = gpuMs !== null ? gpuMs < RT_LIMITS.gpuBudget * 0.55 : frameMs < 17.5;
  let next = slow ? S[Math.min(S.length - 1, i + 1)] : fast ? S[Math.max(0, i - 1)] : S[i];
  return Math.min(next, limit);
}
const KEY = 'everestSim.rayTracing';
export function initialRayTracing() {
  const q = new URLSearchParams(location.search).get('rt');
  if (q === 'on' || q === 'off') return q === 'on';
  try { return localStorage.getItem(KEY) === 'on'; } catch { return false; }
}
export function rememberRayTracing(on) { try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* optional */ } }
export function regionOrigin(p) { return [Math.floor(p.x / RT_LIMITS.snap) * RT_LIMITS.snap, Math.floor(p.z / RT_LIMITS.snap) * RT_LIMITS.snap]; }
export function lightingSize(w, h, scale = 0.5) {
  const s = Math.min(scale, RT_LIMITS.maxWidth/w, RT_LIMITS.maxHeight/h);
  return [Math.max(1, Math.floor(w*s)), Math.max(1, Math.floor(h*s))];
}

/** How strongly traced occlusion and bounce light show (1 = physically plain). Remembered per browser. */
export const RT_STRENGTHS = Object.freeze({ subtle: 1.0, normal: 1.5, strong: 2.2 });
const STRENGTH_KEY = 'everestSim.rayTracingStrength';
export function initialStrength() {
  const q = new URLSearchParams(location.search).get('rtStrength');
  if (q && RT_STRENGTHS[q]) return q;
  try { const v = localStorage.getItem(STRENGTH_KEY); if (v && RT_STRENGTHS[v]) return v; } catch { /* optional */ }
  return 'normal';
}
export function rememberStrength(name) { try { localStorage.setItem(STRENGTH_KEY, name); } catch { /* optional */ } }
