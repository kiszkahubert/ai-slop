import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SegmentIndex } from '../../src/core/spatial.js';
import { mulberry32 } from '../../src/core/noise.js';

function brute(segs, x, z) {
  let best = Infinity;
  for (const s of segs) {
    const dx = s.bx - s.ax, dz = s.bz - s.az, l2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - s.ax) * dx + (z - s.az) * dz) / l2));
    best = Math.min(best, Math.hypot(s.ax + dx * t - x, s.az + dz * t - z));
  }
  return best;
}

test('SegmentIndex.nearest matches a brute-force scan', () => {
  const r = mulberry32(3), segs = [];
  let x = 0, z = 0;
  for (let i = 0; i < 400; i++) { const nx = x + (r() - 0.3) * 40, nz = z + (r() - 0.5) * 40; segs.push({ ax: x, az: z, bx: nx, bz: nz }); x = nx; z = nz; }
  const idx = new SegmentIndex(segs, 50);
  for (let k = 0; k < 300; k++) {
    const qx = -500 + r() * 6000, qz = -1500 + r() * 3000;
    assert.ok(Math.abs(idx.nearest(qx, qz).d - brute(segs, qx, qz)) < 1e-9);
  }
});

test('SegmentIndex respects maxDist and filters', () => {
  const segs = [{ ax: 0, az: 0, bx: 10, bz: 0, tag: 'a' }, { ax: 0, az: 50, bx: 10, bz: 50, tag: 'b' }];
  const idx = new SegmentIndex(segs, 20);
  assert.equal(idx.nearest(5, 1000, 100), null);
  assert.equal(idx.segs[idx.nearest(5, 2).k].tag, 'a');
  assert.equal(idx.segs[idx.nearest(5, 2, Infinity, (s) => s.tag === 'b').k].tag, 'b');
});
