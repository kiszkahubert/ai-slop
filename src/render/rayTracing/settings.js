export const RT_LIMITS = Object.freeze({ memory: 256 * 1024 * 1024, radius: 120, fade: 80, region: 1024, snap: 128,
  sunDistance: 256, bounceDistance: 128, gpuBudget: 5, maxWidth: 960, maxHeight: 540 });
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
