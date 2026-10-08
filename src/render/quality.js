// Graphics presets. The choice is remembered per browser; ?quality=verylow|low|medium|high overrides it.
// Nothing here affects the simulation.

export const QUALITY_PRESETS = {
  verylow: {
    label: 'Very Low', pixelRatio: 0.5, maxWidth: 960, maxHeight: 540, adaptiveResolution: true,
    simpleTerrain: true, simpleScenery: true, simpleSky: true, shadows: false, depthPrepass: false,
    msaa: 0, post: false, bloom: false, ssao: false, dof: false,
    shadowMapSize: 128, shadowExtent: 40, textureSize: 128, reliefCell: 64, aoCell: 128, macroShadow: false,
    microDetail: false, exactGradients: false, snowParticles: 0, mist: false, terrainError: 12,
    campDetailRadius: 0, lodDistanceScale: 0.35,
  },
  low: {
    label: 'Low', pixelRatio: 1, msaa: 0, post: false, bloom: false, ssao: false, dof: false,
    shadowMapSize: 1024, shadowExtent: 40, textureSize: 256, reliefCell: 32, aoCell: 64, macroShadow: false,
    microDetail: false, exactGradients: false, snowParticles: 1500, mist: false, terrainError: 5,
  },
  medium: {
    label: 'Medium', pixelRatio: 1.25, msaa: 4, post: true, bloom: true, ssao: false, dof: false,
    shadowMapSize: 2048, shadowExtent: 55, textureSize: 512, reliefCell: 16, aoCell: 32, macroShadow: true,
    microDetail: true, exactGradients: false, snowParticles: 3500, mist: true, terrainError: 3,
  },
  high: {
    label: 'High', pixelRatio: 1.5, msaa: 4, post: true, bloom: true, ssao: true, dof: true,
    shadowMapSize: 4096, shadowExtent: 70, textureSize: 1024, reliefCell: 8, aoCell: 16, macroShadow: true,
    microDetail: true, exactGradients: true, snowParticles: 6000, mist: true, terrainError: 2,
  },
};

const KEY = 'everestSim.quality';
const FULL_RESOLUTION_KEY = 'everestSim.veryLowFullResolution';

export function initialVeryLowFullResolution() {
  try { return localStorage.getItem(FULL_RESOLUTION_KEY) === 'true'; } catch { return false; }
}

let fullResolution = initialVeryLowFullResolution();
export const veryLowFullResolution = () => fullResolution;
export function rememberVeryLowFullResolution(value) {
  fullResolution = !!value;
  try { localStorage.setItem(FULL_RESOLUTION_KEY, String(fullResolution)); } catch { /* storage blocked */ }
}

/** Full resolution keeps every Very Low optimization except resolution reduction. */
export function qualitySettings(name, nativeResolution = veryLowFullResolution()) {
  const q = QUALITY_PRESETS[name];
  if (name !== 'verylow' || !nativeResolution) return q;
  return { ...q, pixelRatio: Infinity, maxWidth: Infinity, maxHeight: Infinity, adaptiveResolution: false };
}

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

/** Keep CSS/HUD resolution intact, but bound the 3D drawing buffer even on a 4K display. */
export function renderPixelRatio(q, width, height, dpr = 1, scale = 1) {
  return Math.min(dpr, q.pixelRatio, (q.maxWidth || Infinity) / Math.max(1, width),
    (q.maxHeight || Infinity) / Math.max(1, height)) * scale;
}
