// Uniform-grid index over polyline segments, for fast nearest-segment queries.
// Each segment is registered in every grid cell its bounding box touches.

export class SegmentIndex {
  /**
   * @param segments array of { ax, az, bx, bz, ...payload }
   * @param cell     grid cell size in metres
   */
  constructor(segments, cell = 60) {
    this.cell = cell; this.segs = segments; this.grid = new Map();
    segments.forEach((s, k) => {
      const i0 = Math.floor(Math.min(s.ax, s.bx) / cell), i1 = Math.floor(Math.max(s.ax, s.bx) / cell);
      const j0 = Math.floor(Math.min(s.az, s.bz) / cell), j1 = Math.floor(Math.max(s.az, s.bz) / cell);
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
        const key = i * 73856093 ^ j * 19349663;
        let list = this.grid.get(key);
        if (!list) this.grid.set(key, (list = []));
        list.push(k);
      }
    });
  }

  /**
   * Nearest segment to (x, z), searching outward ring by ring up to maxDist.
   * Returns { d, k, t, px, pz } or null when nothing lies within maxDist.
   */
  nearest(x, z, maxDist = Infinity, filter = null) {
    const c = this.cell, ci = Math.floor(x / c), cj = Math.floor(z / c);
    const maxRing = Number.isFinite(maxDist) ? Math.ceil(maxDist / c) + 1 : 1e6;
    let best = null; const seen = new Set();
    const visit = (i, j) => {
      const list = this.grid.get(i * 73856093 ^ j * 19349663);
      if (!list) return;
      for (const k of list) {
        if (seen.has(k)) continue;
        seen.add(k);
        const s = this.segs[k];
        if (filter && !filter(s)) continue;
        const dx = s.bx - s.ax, dz = s.bz - s.az, l2 = dx * dx + dz * dz || 1;
        let t = ((x - s.ax) * dx + (z - s.az) * dz) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
        const px = s.ax + dx * t, pz = s.az + dz * t, d = Math.hypot(px - x, pz - z);
        if (d <= maxDist && (!best || d < best.d)) best = { d, k, t, px, pz };
      }
    };
    for (let r = 0; r <= maxRing; r++) {
      // every point in ring r is at least (r - 1) cells away: stop once that exceeds the best hit
      if (best && (r - 1) * c > best.d) break;
      if (r === 0) visit(ci, cj);
      else {                                   // walk only the ring's perimeter
        for (let i = ci - r; i <= ci + r; i++) { visit(i, cj - r); visit(i, cj + r); }
        for (let j = cj - r + 1; j <= cj + r - 1; j++) { visit(ci - r, j); visit(ci + r, j); }
      }
      if (seen.size === this.segs.length) break;   // every segment examined
    }
    return best;
  }
}
