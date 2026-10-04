export const D2R = Math.PI / 180;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const fmt = (n) => Math.round(n).toLocaleString('en-US');
export const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export function timeOfDay(tH) {
  const hod = ((tH % 24) + 24) % 24;
  return String(Math.floor(hod)).padStart(2, '0') + ':' + String(Math.floor((hod * 60) % 60)).padStart(2, '0');
}
export const dayOf = (tH) => Math.floor(tH / 24) + 1;
export const hourOfDay = (tH) => ((tH % 24) + 24) % 24;
export function compassName(deg) {
  return ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round((((deg % 360) + 360) % 360) / 45) % 8];
}
