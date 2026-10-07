// Pure camera-path helpers. Measure distance on the camera path, not the walking route.
import { clamp, lerp } from '../core/math.js';
export const ease = (u) => { const t = clamp(u, 0, 1); return t * t * t * (10 + t * (-15 + 6 * t)); };
export const mix3 = (a, b, t) => a.map((v, i) => lerp(v, b[i], t));
export const distance3 = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));
function spline(points, u) {
  const f = clamp(u, 0, 1) * (points.length - 1), i = Math.min(points.length - 2, Math.floor(f)), t = f - i;
  const at = (j) => points[clamp(j, 0, points.length - 1)];
  return at(i).map((v, k) => {
    const a = at(i - 1)[k], b = v, c = at(i + 1)[k], d = at(i + 2)[k];
    return .5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t);
  });
}
/** Conservative altitude envelope and arc-length samples for constant-speed travel. */
export function makeTrack(points, field, clearance = 55) {
  const count = Math.max(32, Math.ceil(points.slice(1).reduce((n, p, i) => n + distance3(p, points[i]), 0) / 4));
  const samples = Array.from({ length: count + 1 }, (_, i) => spline(points, i / count));
  const floor = samples.map((p) => field.height(p[0], p[2]) + clearance + 8);
  for (let i = 0; i <= count; i++) samples[i][1] = Math.max(samples[i][1], floor[i]);
  // Spread lifts without averaging away a narrow terrain peak.
  for (let pass = 0; pass < 12; pass++) {
    const heights = samples.map((p) => p[1]);
    for (let i = 1; i < count; i++) samples[i][1] = Math.max(floor[i], heights[i], (heights[i - 1] + 2 * heights[i] + heights[i + 1]) / 4);
  }
  const lengths = [0];
  for (let i = 1; i <= count; i++) lengths.push(lengths[i - 1] + distance3(samples[i], samples[i - 1]));
  return { samples, lengths, length: lengths[count] };
}
export function trackPoint(track, u) {
  const s = clamp(u, 0, 1) * track.length;
  let lo = 0, hi = track.lengths.length - 1;
  while (hi - lo > 1) { const m = (hi + lo) >> 1; if (track.lengths[m] <= s) lo = m; else hi = m; }
  return mix3(track.samples[lo], track.samples[hi], (s - track.lengths[lo]) / (track.lengths[hi] - track.lengths[lo] || 1));
}
// Integrate a quintic velocity ramp: position, velocity and acceleration match at the ends.
const integral = (u) => 2.5 * u ** 4 - 3 * u ** 5 + u ** 6;
export function travelTiming(length, speed) {
  const ramp = Math.min(5, length / speed / 2);
  return { duration: length / speed + ramp, ramp };
}
export function travelProgress(t, timing) {
  const { duration: T, ramp: r } = timing;
  if (!r || t >= T) return 1;
  if (t <= 0) return 0;
  const total = T - r;
  if (t < r) return r * integral(t / r) / total;
  if (t > T - r) return 1 - r * integral((T - t) / r) / total;
  return (t - r / 2) / total;
}
