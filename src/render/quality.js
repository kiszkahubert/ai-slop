// Graphics quality presets (Low / Medium / High). The choice is remembered per browser and can be forced with
// ?quality=low|medium|high. Nothing here affects the simulation.

export const QUALITY_PRESETS = {
  low: {
    label: 'Low', pixelRatio: 1, msaa: 0, post: false, bloom: false, ssao: false, dof: false,
    shadowMapSize: 1024, shadowExtent: 40, textureSize: 256, reliefCell: 32, aoCell: 64, macroShadow: false,
    microDetail: false, snowParticles: 1500, mist: false,
  },
  medium: {
    label: 'Medium', pixelRatio: 1.25, msaa: 4, post: true, bloom: true, ssao: false, dof: false,
    shadowMapSize: 2048, shadowExtent: 55, textureSize: 512, reliefCell: 16, aoCell: 32, macroShadow: true,
    microDetail: true, snowParticles: 3500, mist: true,
  },
  high: {
    label: 'High', pixelRatio: 1.5, msaa: 4, post: true, bloom: true, ssao: true, dof: true,
    shadowMapSize: 4096, shadowExtent: 70, textureSize: 1024, reliefCell: 8, aoCell: 16, macroShadow: true,
    microDetail: true, snowParticles: 6000, mist: true,
  },
};

const KEY = 'everestSim.quality';

export function initialQuality() {
  const q = new URLSearchParams(location.search).get('quality');
  if (q && QUALITY_PRESETS[q]) return q;
  try { const s = localStorage.getItem(KEY); if (s && QUALITY_PRESETS[s]) return s; } catch { /* storage blocked */ }
  return 'medium';
}

export function rememberQuality(q) {
  try { localStorage.setItem(KEY, q); } catch { /* storage blocked */ }
}

let current = 'medium';
export const currentQuality = () => current;
export function setCurrentQuality(q) { current = q; }
