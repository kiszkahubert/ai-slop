// Route map: a hillshade of the real terrain with the route, camps, summits and the climber.
import { clamp, fmt } from '../core/math.js';
import { PEAKS } from '../world/geo.js';

const B = { x0: -7200, x1: 1400, z0: -1700, z1: 3300 };   // area shown (m)
const W = 600, H = Math.round((W * (B.z1 - B.z0)) / (B.x1 - B.x0));

export class Minimap {
  constructor(canvas, game) {
    this.canvas = canvas; canvas.width = W; canvas.height = H;
    canvas.style.aspectRatio = `${W} / ${H}`;
    this.g = canvas.getContext('2d'); this.game = game; this.img = this.render();
  }
  toPx(x, z) { return [((x - B.x0) / (B.x1 - B.x0)) * W, ((z - B.z0) / (B.z1 - B.z0)) * H]; }
  render() {
    const { field, routes, camps } = this.game;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const g = cv.getContext('2d'), img = g.createImageData(W, H);
    const sx = (B.x1 - B.x0) / W, sz = (B.z1 - B.z0) / H;
    for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
      const x = B.x0 + px * sx, z = B.z0 + py * sz, h = field.height(x, z);
      const hx = field.height(x + 10, z) - field.height(x - 10, z), hz = field.height(x, z + 10) - field.height(x, z - 10);
      const nx = -hx / 20, nz = -hz / 20, l = Math.hypot(nx, 1, nz);
      const shade = clamp((nx * -0.6 + 0.6 + nz * -0.5) / l, 0, 1), slope = Math.hypot(hx, hz) / 20;
      let c;
      if (field.glacierAt(x, z) > 0.5 && slope < 0.4) c = h < 5450 ? [150, 140, 128] : [175, 205, 226];
      else if (slope > 1.1) c = [92, 86, 80];
      else if (h > 5700) c = [234, 239, 246];
      else c = [140, 128, 112];
      const k = 0.45 + 0.75 * shade, o = (py * W + px) * 4;
      img.data[o] = clamp(c[0] * k, 0, 255); img.data[o + 1] = clamp(c[1] * k, 0, 255); img.data[o + 2] = clamp(c[2] * k, 0, 255); img.data[o + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    for (const [route, col] of [[routes.main, '#ff4a2a'], [routes.lhotse, '#1fa8ff']]) {
      g.strokeStyle = col; g.lineWidth = 2.5; g.setLineDash([6, 4]); g.beginPath();
      route.pts.forEach((p, i) => { const [a, b] = this.toPx(p.x, p.z); i ? g.lineTo(a, b) : g.moveTo(a, b); });
      g.stroke();
    }
    g.setLineDash([]); g.font = 'bold 12px system-ui';
    const label = (t, a, b) => { g.fillStyle = '#000'; g.fillText(t, a + 1, b + 1); g.fillStyle = '#fff'; g.fillText(t, a, b); };
    for (const c of camps) {
      const [a, b] = this.toPx(c.x, c.z);
      g.fillStyle = '#ffd166'; g.strokeStyle = '#000'; g.lineWidth = 2; g.beginPath(); g.arc(a, b, 5, 0, 7); g.fill(); g.stroke();
      label(c.short, a + 7, b + 4);
    }
    for (const pk of PEAKS) {
      const [a, b] = this.toPx(pk.x, pk.z); if (a < 0 || a > W || b < 0 || b > H) continue;
      g.fillStyle = '#111'; g.beginPath(); g.moveTo(a, b - 7); g.lineTo(a - 6, b + 4); g.lineTo(a + 6, b + 4); g.fill();
      const t = `${pk.name} ${fmt(pk.e)}`; label(t, Math.min(a + 8, W - g.measureText(t).width - 4), b + 4);
    }
    label('N ↑', W - 34, 20);
    return cv;
  }
  draw() {
    const { P, view } = this.game, g = this.g;
    g.drawImage(this.img, 0, 0);
    const [px, pz] = this.toPx(P.x, P.z);
    g.save(); g.translate(px, pz); g.rotate(-P.facing);
    g.fillStyle = '#ff2d2d'; g.strokeStyle = '#fff'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(0, -11); g.lineTo(7, 8); g.lineTo(0, 4); g.lineTo(-7, 8); g.closePath(); g.fill(); g.stroke();
    g.restore();
    g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 1.5; g.beginPath();
    for (const o of [-0.4, 0.4]) { g.moveTo(px, pz); g.lineTo(px - Math.sin(view.yaw + o) * 28, pz - Math.cos(view.yaw + o) * 28); }
    g.stroke();
  }
}
