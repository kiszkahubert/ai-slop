// Global tuning constants. World units are metres; x = east, z = south, y = true elevation.
// The origin is the summit of Mount Everest (27.988056°N, 86.925278°E). The map is true scale.

export const TIME_SCALE = 22;            // game seconds per real second at 1× speed
export const FAST_FORWARD = 4;           // simulation multiplier while route-following (F)
export const START_TIME_H = 7;           // Day 1, 07:00
export const TURNAROUND_H = 14;          // summit turnaround time

export const TERRAIN = {
  coreUrl: 'assets/terrain/core.png',
  backdropUrl: 'assets/terrain/backdrop.png',
  metaUrl: 'assets/terrain/meta.json',
  routeUrl: 'assets/route.json',
  refine: 1,                // preserve the native 4 m Pléiades grid
  faceSampleDistance: 15,   // face exposure uses the same 30 m span at any DEM resolution
  chunkCells: 128,          // 512 m chunks keep the near-camera 4 m meshes bounded
  lodDistances: [350, 900, 1800, 3600, 7200, 14000], // 4 m near the climber, coarser on the horizon
  backdropChunkCells: 48,
  earthRadius: 6371000,
};

export const MOVE = {
  walk: 4.2,                // m/s on flat ground (real time, 1×)
  sprint: 6.8,
  uphill: 0.95,             // speed /= (1 + uphill * grade)
  downhill: 0.07,           // descending fixed ropes is fast (arm wraps, rappels)
  maxGrade: 2.2,            // ~65°: steeper ground cannot be climbed without a fixed rope
  ropeLeash: 3.0,           // m of lateral play while clipped
  ropeReach: 6.0,           // m: how close you must be to clip in
  playerRadius: 0.45,
};

export const OXYGEN = {
  bottleBar: 300,           // full Poisk-style 4 L bottle
  bottleLitres: 4,
  maxCarried: 4,
  emptyKg: 3.0,
  gasKg: 0.6,
  baseLoadKg: 13,
  flowBenefit: [0, 1000, 1800, 2400, 2900],   // metres of "altitude removed" per L/min setting
  emptyBar: 10,             // residual pressure: at or below this a bottle no longer delivers and counts as empty
  lowBar: 40,               // "bottle low" warning
};

export const DEATH_ZONE = 8000;
// Unclipped climbers can slip on faces steeper than this; measured face slopes
// are sampled separately from the smoothed boot track.
export const SLIP_ANGLE = 32;

// ---------------- visuals (tunable; no effect on game mechanics)
export const VISUALS = {
  helmetLogoUrl: 'assets/redbull-logo.png',  // transparent PNG decal on the helmet; a placeholder is drawn if missing
  terrain: {
    textureTileM: 7,          // metres per repeat of the layer textures (macro scale)
    microTileM: 1.3,          // metres per repeat of the close-up micro detail
    normalStrength: 1.0,      // layer normal-map strength
    microNormalStrength: 0.6, // close-up micro-normal strength (fades out by ~120 m)
    reliefNormalFade: [260, 900],   // m: blend from mesh normals to the Sobel relief normal map
    aoStrength: 0.85,         // baked terrain (horizon) ambient occlusion
    snowSparkle: 1.0,         // sun glints on snow
    snowSubsurface: 1.0,      // blue-tinted brightening of snow in shadow
    sastrugiAngleDeg: 300,    // direction of the prevailing wind that carves the snow ripples (from WNW)
  },
  fog: {
    heightFalloff: 0.00042,   // 1/m: how quickly the haze thins with altitude (0 = plain distance fog)
    aerialTint: [0.52, 0.66, 0.92], // blue of distant ranges (aerial perspective)
    aerialStrength: 0.55,
  },
  post: {
    bloomStrength: 0.22, bloomRadius: 0.45, bloomThreshold: 1.25,
    vignette: 0.28,
    aoRadius: 1.4, aoIntensity: 1.1, aoMaxDistance: 120,   // screen-space AO (High)
    dofFocusRange: 4, dofMaxBlur: 6,                       // depth of field (High, free viewing only): sharp zone (m), blur (px)
  },
  mist: { opacity: 0.55, altitudes: [4950, 5500, 6250] },  // valley mist layers
};
