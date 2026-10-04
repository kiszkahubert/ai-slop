// Weather timeline: jet-stream strength, storms and summit windows over ~16 days,
// plus wind / temperature / visibility at any altitude and the real sun path at 28°N in May.
import { clamp, lerp, smoothstep, D2R } from '../core/math.js';
import { mulberry32 } from '../core/noise.js';

const HOURS = 24 * 16;

export class Weather {
  constructor(seed) {
    this.seed = seed;
    const rand = mulberry32(seed ^ 0x9e3779b9);
    this.J = new Float32Array(HOURS); this.S = new Float32Array(HOURS); this.D = new Float32Array(HOURS);
    const ph = [0, 0, 0, 0].map(() => rand() * Math.PI * 2);
    // a few multi-day summit windows when the jet stream lifts off the summit
    this.windows = [
      { c: 62 + rand() * 30, d: 24 + rand() * 12 },
      { c: 140 + rand() * 40, d: 22 + rand() * 18 },
      { c: 232 + rand() * 50, d: 28 + rand() * 22 },
    ];
    const storms = [];
    for (let k = 0; k < 7; k++) storms.push({ c: 12 + rand() * (HOURS - 12), d: 8 + rand() * 22, s: 0.55 + rand() * 0.45 });
    const daily = Array.from({ length: 17 }, () => rand());
    const bump = (h, c, d) => smoothstep(c - d / 2 - 5, c - d / 2 + 5, h) * (1 - smoothstep(c + d / 2 - 5, c + d / 2 + 5, h));
    for (let h = 0; h < HOURS; h++) {
      let j = 0.64 + 0.2 * Math.sin(h / 70 * 6.283 + ph[0]) + 0.12 * Math.sin(h / 29 * 6.283 + ph[1]) + 0.07 * Math.sin(h / 11 * 6.283 + ph[2]);
      let wm = 0; for (const w of this.windows) wm = Math.max(wm, bump(h, w.c, w.d));
      j *= 1 - 0.88 * wm;
      let s = 0; for (const st of storms) s = Math.max(s, st.s * bump(h, st.c, st.d));
      // pre-monsoon pattern: clear mornings, afternoon cloud and snow showers
      s = Math.max(s, Math.exp(-((h % 24 - 15.5) ** 2) / 8) * (0.12 + 0.4 * daily[Math.floor(h / 24)]));
      s *= 1 - 0.8 * wm;
      if (h < 8) s *= 0.3;
      this.J[h] = clamp(j, 0.03, 1); this.S[h] = clamp(s, 0, 1);
      this.D[h] = 270 + 25 * Math.sin(h / 37 + ph[3]);      // westerly jet
    }
  }
  sample(tH) {
    if (this.clear) return { J: 0.12, S: 0, dir: 275 };     // free viewing: clear, calm skies
    const t = ((tH % HOURS) + HOURS) % HOURS, i = Math.floor(t), f = t - i, k = (i + 1) % HOURS;
    return { J: lerp(this.J[i], this.J[k], f), S: lerp(this.S[i], this.S[k], f), dir: lerp(this.D[i], this.D[k], f) };
  }
  /** wind speed in km/h; exposure scales for ridges (>1) and sheltered hollows (<1) */
  wind(h, tH, exposure = 1) {
    const w = this.sample(tH), a = clamp((h - 5000) / 3849, 0, 1);
    const jet = Math.pow(clamp((h - 6800) / 2049, 0, 1), 1.6);
    let v = 8 + 18 * a + w.J * 135 * jet + w.S * (22 + 25 * a);
    v *= 1 + 0.16 * Math.sin(tH * 37.0) * Math.sin(tH * 11.3 + 1.3);
    return Math.max(0, v * exposure);
  }
  temperature(h, tH, sunEl, solarOven) {
    const w = this.sample(tH), hod = ((tH % 24) + 24) % 24;
    let T = 34 - 6.5 * h / 1000 + 6 * Math.cos(((hod - 14) / 24) * 2 * Math.PI) - 6 * w.S - 3 * w.J;
    if (solarOven && sunEl > 0.15) T += 9 * smoothstep(0.15, 0.9, sunEl) * (1 - w.S);   // the Western Cwm in sunshine
    return T;
  }
  visibilityKm(tH) { return clamp(60 * Math.pow(1 - this.sample(tH).S, 2.4) + 0.12, 0.12, 60); }
}

export function windChill(T, v) {
  if (v < 4.8 || T > 10) return T;
  const p = Math.pow(v, 0.16);
  return 13.12 + 0.6215 * T - 11.37 * p + 0.3965 * T * p;
}

/** Sun direction (x east, y up, z south) at game time tH; returns elevation in radians. */
export function sunDirection(tH, out) {
  const hod = ((tH % 24) + 24) % 24, Hr = (hod - 12) * 15 * D2R;
  const lat = 27.99 * D2R, dec = 18 * D2R;
  const el = Math.asin(Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(Hr));
  const az = Math.atan2(Math.sin(Hr), Math.cos(Hr) * Math.sin(lat) - Math.tan(dec) * Math.cos(lat)) + Math.PI;
  out.set(Math.cos(el) * Math.sin(az), Math.sin(el), -Math.cos(el) * Math.cos(az));
  return el;
}
