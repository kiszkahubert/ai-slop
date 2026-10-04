// Place a synthetic ladder crossing where a nearby bend cannot cross the same
// fissure a second time away from the ladder. New DEM routes can have tight turns.
export function routeCrevasse(route, distance, { length, width, angleOffset }) {
  for (const shift of [0, -8, 8, -16, 16, -24, 24, -32, 32, -48, 48, -64, 64]) {
    const s = distance + shift;
    if (s < 0 || s > route.L) continue;
    const p = route.at(s), ang = Math.atan2(p.dz, p.dx) + Math.PI / 2 + angleOffset;
    const cv = { x: p.x, z: p.z, ux: Math.cos(ang), uz: Math.sin(ang), len: length, w: width, ladder: true };
    const local = (q) => {
      const dx = q.x - cv.x, dz = q.z - cv.z;
      return { u: dx * cv.ux + dz * cv.uz, v: -dx * cv.uz + dz * cv.ux };
    };
    for (let i = 0; i < route.pts.length - 1; i++) {
      const a = local(route.pts[i]), b = local(route.pts[i + 1]), dv = b.v - a.v, band = width / 2 + 1;
      let t0 = 0, t1 = 1;
      if (Math.abs(dv) < 1e-9) {
        if (Math.abs(a.v) > band) continue;
      } else {
        const c = (-band - a.v) / dv, d = (band - a.v) / dv;
        t0 = Math.max(0, Math.min(c, d)); t1 = Math.min(1, Math.max(c, d));
        if (t0 > t1) continue;
      }
      // Clip each continuous route segment to the fissure band. Point samples can
      // miss a second crossing between vertices, particularly on a hairpin.
      const ua = a.u + (b.u - a.u) * t0, ub = a.u + (b.u - a.u) * t1;
      const lo = Math.min(ua, ub), hi = Math.max(ua, ub);
      if (hi > 2.2) cv.len = Math.min(cv.len, 2 * Math.max(0, Math.max(lo, 2.2) - 2));
      if (lo < -2.2) cv.len = Math.min(cv.len, 2 * Math.max(0, -Math.min(hi, -2.2) - 2));
    }
    if (cv.len >= 24) return cv;
  }
  return null; // keep the route clear when no safe ladder site exists
}
