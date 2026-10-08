// Resolution changes use complete rendered-frame intervals (including GPU backpressure), not CPU submission time.
// A slow device drops one step per sampling window; sustained headroom is needed to raise resolution again.
export class LowResolution {
  constructor() { this.reset(); }
  reset() { this.scale = 1; this.elapsed = 0; this.samples = 0; this.fastWindows = 0; }
  sample(ms) {
    if (!Number.isFinite(ms) || ms <= 0 || ms > 1000) return false; // tab suspension / one-off compilation
    this.elapsed += ms; this.samples++;
    if (this.elapsed < 1500 || this.samples < 6) return false;
    const average = this.elapsed / this.samples;
    this.elapsed = this.samples = 0;
    const previous = this.scale;
    if (average > 45) { this.scale = Math.max(0.5, this.scale - 0.15); this.fastWindows = 0; }
    else if (average < 28) {
      if (++this.fastWindows >= 4) { this.scale = Math.min(1, this.scale + 0.15); this.fastWindows = 0; }
    } else this.fastWindows = 0;
    return Math.abs(previous - this.scale) > 1e-6;
  }
}
