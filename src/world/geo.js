// Local projection used by the asset pipeline (tools/demlib.py) and the game.
// Origin: summit of Mount Everest. x = east (m), z = south (m).
export const LAT0 = 27.988056, LON0 = 86.925278;
const phi = (LAT0 * Math.PI) / 180;
const M_LON = 111412.84 * Math.cos(phi) - 93.5 * Math.cos(3 * phi);
const M_LAT = 111132.92 - 559.82 * Math.cos(2 * phi) + 1.175 * Math.cos(4 * phi);

export const llToXZ = (lat, lon) => ({ x: (lon - LON0) * M_LON, z: -(lat - LAT0) * M_LAT });
export const xzToLL = (x, z) => ({ lat: LAT0 - z / M_LAT, lon: LON0 + x / M_LON });

// Named summits (surveyed elevations): name tags on their rendered tops; the major ones also on the route map.
export const PEAKS = [
  { id: 'everest', name: 'Mount Everest', lat: 27.988056, lon: 86.925278, e: 8849 },
  { id: 'lhotse', name: 'Lhotse', lat: 27.961667, lon: 86.933056, e: 8516 },
  { id: 'nuptse', name: 'Nuptse', lat: 27.967, lon: 86.886, e: 7861 },
  { id: 'shar', name: 'Lhotse Shar', lat: 27.961389, lon: 86.945, e: 8383 },
  { id: 'pumori', name: 'Pumori', lat: 28.0147, lon: 86.8281, e: 7161 },
  { id: 'changtse', name: 'Changtse', lat: 28.0244, lon: 86.9142, e: 7543 },
  { id: 'makalu', name: 'Makalu', lat: 27.889444, lon: 87.088889, e: 8485 },
  { id: 'chooyu', name: 'Cho Oyu', lat: 28.094167, lon: 86.660833, e: 8188 },
  { id: 'amadablam', name: 'Ama Dablam', lat: 27.861667, lon: 86.861389, e: 6812 },
  // more of the skyline (name tags only, not on the route map)
  { id: 'lingtren', name: 'Lingtren', lat: 28.02, lon: 86.85, e: 6749, minor: true },
  { id: 'khumbutse', name: 'Khumbutse', lat: 28.0203, lon: 86.8731, e: 6636, minor: true },
  { id: 'kalapatthar', name: 'Kala Patthar', lat: 27.995833, lon: 86.828417, e: 5644, minor: true },
  { id: 'lobuche', name: 'Lobuche East', lat: 27.9589, lon: 86.7908, e: 6119, minor: true },
  { id: 'cholatse', name: 'Cholatse', lat: 27.92, lon: 86.7661, e: 6440, minor: true },
  { id: 'taboche', name: 'Taboche', lat: 27.8975, lon: 86.7792, e: 6495, minor: true },
  { id: 'islandpeak', name: 'Island Peak', lat: 27.92079, lon: 86.93516, e: 6165, minor: true },
  { id: 'baruntse', name: 'Baruntse', lat: 27.871667, lon: 86.98, e: 7162, minor: true },
  { id: 'chomolonzo', name: 'Chomo Lonzo', lat: 27.929722, lon: 87.107222, e: 7804, minor: true },
  { id: 'gyachungkang', name: 'Gyachung Kang', lat: 28.098056, lon: 86.742222, e: 7952, minor: true },
  { id: 'kangtega', name: 'Kangtega', lat: 27.7833, lon: 86.8167, e: 6782, minor: true },
  { id: 'thamserku', name: 'Thamserku', lat: 27.79028, lon: 86.7875, e: 6623, minor: true },
].map((p) => ({ ...p, ...llToXZ(p.lat, p.lon) }));

// Compass/map markers follow the active DEM's summit endpoints. The projection
// origin stays fixed, and the surveyed elevation targets remain unchanged.
export function alignClimbingSummits(routes) {
  for (const [id, route] of [['everest', routes.main], ['lhotse', routes.lhotse], ['nuptse', routes.nuptse]]) {
    if (!route) continue;
    const end = route.pts.at(-1), marker = PEAKS.find((p) => p.id === id);
    Object.assign(marker, { x: end.x, z: end.z, ...xzToLL(end.x, end.z) });
  }
}
