// Everest Base Camp as it is in the climbing season: a tent city of expedition compounds spread over the rubble-
// covered Khumbu Glacier below the Icefall, and the walk from camp through ice towers and hummocks to Crampon
// Point, where the fixed lines into the Icefall begin.
//
// planBaseCamp() runs on the measured terrain before it is refined: it picks the compound sites (gentle glacier
// ground at base-camp altitude, away from the route), the trekkers' end with the painted boulder, a helipad, melt
// ponds and Crampon Point, and returns the terraces and the glacier relief the terrain refinement applies.
// buildBaseCamp() then places everything on the finished surface. Ice towers are solid (like the seracs).
import * as THREE from 'three';
import { mulberry32, makeNoise2D } from '../core/noise.js';
import { clamp, smoothstep, fmt } from '../core/math.js';
import { llToXZ } from './geo.js';

const GORAK_SHEP = llToXZ(27.98, 86.83);           // trekkers arrive from here (south-west)
const EBC_POINT = llToXZ(28.00722, 86.85944);      // the published Base Camp position (5,364 m): the far end of the tent strip

/** field: the core height field before refine (native grid + glacierBase). */
export function planBaseCamp(field, routes, seed = 11) {
  const r = mulberry32(seed), m = routes.main, E = m.point('ebc'), sE = m.s('ebc');
  const B = field.base || field, gB = field.glacierBase;
  const H = (x, z) => B.height(x, z);
  const glacier = (x, z) => {
    const i = clamp(Math.round((x - B.x0) / B.cell), 0, B.nx - 1), j = clamp(Math.round((z - B.z0) / B.cell), 0, B.nz - 1);
    return gB ? gB[j * B.nx + i] / 255 : 0;
  };
  const slope = (x, z, e = 12) => Math.hypot(H(x + e, z) - H(x - e, z), H(x, z + e) - H(x, z - e)) / (2 * e);
  const nearRoute = (x, z, d) => Object.values(routes).some((rt) => rt.nearestWithin(x, z, d));
  const Eh = H(E.x, E.z);

  // ---- compound sites: gentle glacier at base-camp altitude, off the route, a short walk from the hub at E
  const cand = [];
  for (let z = E.z - 1400; z <= E.z + 600; z += 24) for (let x = E.x - 1400; x <= E.x + 400; x += 24) {
    const d = Math.hypot(x - E.x, z - E.z);
    if (d < 85 || d > 1300) continue;
    const h = H(x, z);
    if (glacier(x, z) < 0.35 || slope(x, z) > 0.2 || h < Eh - 70 || h > Eh + 45 || nearRoute(x, z, 34)) continue;
    cand.push({ x, z, h, d });
  }
  // the tents crowd a strip from the hub at the Icefall foot to the published Base Camp position
  const sx = EBC_POINT.x - E.x, sz = EBC_POINT.z - E.z, sl2 = sx * sx + sz * sz;
  const strip = (x, z) => { const t = clamp(((x - E.x) * sx + (z - E.z) * sz) / sl2, 0, 1); return Math.hypot(E.x + sx * t - x, E.z + sz * t - z); };
  const order = cand.map((c) => ({ c, k: strip(c.x, c.z) * 1.6 + c.d * 0.25 + r() * 220 })).sort((a, b) => a.k - b.k).map((o) => o.c);
  const SCHEMES = [
    [0xf5b301, 0xf5b301, 0xf07d12], [0xf07d12, 0xe8661a, 0xf5b301], [0xf5d000, 0xf5b301, 0x2a8de0],
    [0x2a8de0, 0x1f5fb8, 0xf5d000], [0xe03a26, 0xf5b301, 0xf5b301], [0x3db35a, 0xf5d000, 0xf5b301], [0xf5b301, 0xe03a26, 0x2a8de0],
  ];
  const compounds = [];
  for (const c of order) {
    if (compounds.length >= 52) break;
    if (compounds.some((o) => Math.hypot(o.x - c.x, o.z - c.z) < 46)) continue;
    const rad = 14 + r() * 6;
    let s = 0, n = 0;
    for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; s += H(c.x + Math.cos(a) * rad * 0.6, c.z + Math.sin(a) * rad * 0.6); n++; }
    compounds.push({ x: c.x, z: c.z, h: (s / n + c.h) / 2, r: rad, rot: r() * Math.PI * 2, scheme: SCHEMES[Math.floor(r() * SCHEMES.length)], big: r() < 0.45 });
  }
  const free = (x, z, gap) => compounds.every((o) => Math.hypot(o.x - x, o.z - z) > o.r + gap) && !nearRoute(x, z, 25);
  // ---- the trekkers' end (toward Gorak Shep): the painted boulder; a helipad nearby
  const gx = GORAK_SHEP.x - E.x, gz = GORAK_SHEP.z - E.z, gl = Math.hypot(gx, gz);
  let sign = null, best = -1e9;
  for (const c of cand) {
    const k = ((c.x - E.x) * gx + (c.z - E.z) * gz) / gl;
    if (k > best && free(c.x, c.z, 14)) { best = k; sign = { x: c.x, z: c.z, h: c.h }; }
  }
  let heli = null; best = 1e9;
  for (const c of cand) {
    if (!sign || !free(c.x, c.z, 22)) continue;
    const d = Math.hypot(c.x - sign.x, c.z - sign.z);
    if (d > 70 && d < best) { best = d; heli = { x: c.x, z: c.z, h: c.h }; }
  }
  // ---- Crampon Point: where the Icefall fixed lines begin
  const cs = sE + 215, cp = m.at(cs), side = H(cp.x - cp.dz * 9, cp.z + cp.dx * 9) < H(cp.x + cp.dz * 9, cp.z - cp.dx * 9) ? 1 : -1;
  const crampon = { x: cp.x - cp.dz * 9 * side, z: cp.z + cp.dx * 9 * side, dx: cp.dx, dz: cp.dz };
  crampon.h = H(crampon.x, crampon.z);

  // ---- where the glacier gets its relief: the base-camp basin, and a corridor along the route to the Icefall
  const G = 8, gx0 = E.x - 1500, gz0 = E.z - 1500, gn = Math.ceil(3000 / G) + 1, zone = new Float32Array(gn * gn);
  const corridor = []; for (let s = sE; s <= sE + 380; s += 10) corridor.push(m.at(s));
  for (let j = 0; j < gn; j++) for (let i = 0; i < gn; i++) {
    const x = gx0 + i * G, z = gz0 + j * G, h = H(x, z);
    let zn = (1 - smoothstep(1150, 1480, Math.hypot(x - E.x, z - E.z))) * (1 - smoothstep(Eh + 70, Eh + 170, h));
    let dc = 1e9, sc = 0;
    corridor.forEach((p, k) => { const d = Math.hypot(p.x - x, p.z - z); if (d < dc) { dc = d; sc = k * 10; } });
    zn = Math.max(zn, (1 - smoothstep(95, 170, dc)) * (1 - smoothstep(320, 380, sc)));
    zone[j * gn + i] = zn;
  }
  const zoneAt = (x, z) => {
    const i = Math.round((x - gx0) / G), j = Math.round((z - gz0) / G);
    return i < 0 || j < 0 || i >= gn || j >= gn ? 0 : zone[j * gn + i];
  };
  const noise = makeNoise2D(mulberry32(seed + 1));
  /** metres added to the glacier: debris-covered ice mounds, troughs and kettles (0 on the trail) */
  const relief = (x, z, h, gl01, td) => {
    if (gl01 < 0.3) return 0;
    const zn = zoneAt(x, z);
    if (zn <= 0) return 0;
    const n1 = noise(x / 44, z / 44), n2 = noise(x / 17 + 3.1, z / 17 - 1.7), n3 = noise(x / 7 - 5.3, z / 7 + 2.2);
    const mound = Math.pow(1 - Math.abs(n1), 2.2) * 6.5 + n2 * 2 + n3 * 0.55 - 2.6;
    const camp = 0.45 + 0.55 * smoothstep(60, 220, strip(x, z));      // the camp has levelled its rubble
    return mound * zn * camp * Math.min(1, gl01 * 1.4) * smoothstep(4, 15, td);
  };

  // ---- melt ponds in the hummocks
  const ponds = [];
  for (let k = 0; k < 400 && ponds.length < 9; k++) {
    const a = r() * Math.PI * 2, d = 150 + r() * 1000, x = E.x + Math.cos(a) * d, z = E.z + Math.sin(a) * d;
    if (zoneAt(x, z) < 0.8 || glacier(x, z) < 0.5 || slope(x, z) > 0.15 || !free(x, z, 25)) continue;
    if ((sign && Math.hypot(x - sign.x, z - sign.z) < 50) || (heli && Math.hypot(x - heli.x, z - heli.z) < 50)) continue;
    if (ponds.some((p) => Math.hypot(p.x - x, p.z - z) < 90)) continue;
    ponds.push({ x, z, r: 6 + r() * 8, h: H(x, z) - 1.8 });
  }

  const pads = [
    ...compounds.map((c) => ({ x: c.x, z: c.z, h: c.h, rin: c.r, rout: c.r + 10 })),
    ...(sign ? [{ x: sign.x, z: sign.z, h: sign.h, rin: 10, rout: 18 }] : []),
    ...(heli ? [{ x: heli.x, z: heli.z, h: heli.h, rin: 13, rout: 22 }] : []),
    { x: crampon.x, z: crampon.z, h: crampon.h, rin: 5, rout: 10 },
    ...ponds.map((p) => ({ x: p.x, z: p.z, h: p.h, rin: p.r, rout: p.r + 7 })),
  ];
  return { E, compounds, sign, heli, crampon, ponds, pads, relief, zoneAt, seed };
}

// ---------------- building
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler(), _c = new THREE.Color();
function inst(scene, geo, mat, n, cast = true) {
  const m = new THREE.InstancedMesh(geo, mat, n); m.count = 0; m.castShadow = cast; m.receiveShadow = true; scene.add(m); return m;
}
function put(im, x, y, z, ry = 0, sx = 1, sy = 1, sz = 1, color = null, rx = 0, rz = 0) {
  if (im.count >= im.instanceMatrix.count) return;
  _q.setFromEuler(_e.set(rx, ry, rz, 'YXZ'));
  im.setMatrixAt(im.count, _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz)));
  if (color !== null) im.setColorAt(im.count, _c.set(color));
  im.count++;
}
function done(...ims) { for (const im of ims) { im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; im.computeBoundingSphere(); } }

function signTexture(lines, opts = {}) {
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 256;
  const g = cv.getContext('2d');
  g.fillStyle = opts.bg || 'rgba(0,0,0,0)'; g.fillRect(0, 0, 512, 256);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  lines.forEach(([text, size, color], k) => {
    g.font = `bold ${size}px sans-serif`; g.fillStyle = color;
    g.fillText(text, 256, 256 * ((k + 1) / (lines.length + 1)));
  });
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

/** An ice tower: a chunky, irregular serac (a jittered, slightly leaning truncated cone with a ragged top). */
function iceTowerGeometry(seed) {
  const r = mulberry32(seed), geo = new THREE.CylinderGeometry(0.45, 1, 1, 7, 5, false), p = geo.attributes.position;
  const lean = (r() - 0.5) * 0.3;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i) + 0.5, k = 1 + (r() - 0.5) * 0.55;
    const top = y > 0.99 ? (r() - 0.3) * 0.35 : 0;                     // ragged crest
    p.setXYZ(i, p.getX(i) * k + y * y * lean, p.getY(i) + top, p.getZ(i) * k * (0.75 + 0.25 * y));
  }
  geo.translate(0, 0.5, 0); geo.computeVertexNormals();
  return geo;
}

/** Everything that stands at Base Camp and on the way to Crampon Point. */
export function buildBaseCamp(scene, field, routes, plan, world, prayerFlags, makeLabel) {
  const r = mulberry32(plan.seed + 7), H = (x, z) => field.height(x, z);
  const M = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.75, ...o });
  const tents = inst(scene, new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), M(0xffffff, { roughness: 0.6 }), 2000);
  const domes = inst(scene, new THREE.IcosahedronGeometry(1, 2), M(0xffffff, { roughness: 0.55 }), 60);
  const boxes = inst(scene, new THREE.BoxGeometry(1, 1, 1), M(0xffffff, { roughness: 0.75 }), 400);
  const roofGeo = new THREE.CylinderGeometry(1, 1, 1, 3, 1); roofGeo.rotateZ(Math.PI / 2);
  const roofs = inst(scene, roofGeo, M(0xffffff, { roughness: 0.7 }), 80);
  const stones = inst(scene, new THREE.DodecahedronGeometry(1, 0), M(0xffffff, { roughness: 0.95 }), 4600);
  const barrels = inst(scene, new THREE.CylinderGeometry(0.3, 0.3, 0.9, 12), M(0x1f5fb8, { roughness: 0.5 }), 260);
  const panels = inst(scene, new THREE.BoxGeometry(1.6, 0.04, 1), M(0x1b2a4a, { roughness: 0.25, metalness: 0.5 }), 140);
  const tarps = inst(scene, new THREE.PlaneGeometry(1, 1), M(0x2f6fd0, { roughness: 0.8, side: THREE.DoubleSide }), 60);
  const whitewash = M(0xe9e4d8, { roughness: 0.9 });
  const chortens = inst(scene, new THREE.BoxGeometry(1, 1, 1), whitewash, 200);
  const ice = new THREE.MeshStandardMaterial({ color: 0xe4f1fb, roughness: 0.32, metalness: 0, emissive: 0x0b2135, emissiveIntensity: 0.25 });
  const towerGeos = [iceTowerGeometry(1), iceTowerGeometry(2), iceTowerGeometry(3)];
  const towers = towerGeos.map((g) => inst(scene, g, ice, 90));
  const water = new THREE.MeshStandardMaterial({ color: 0x3fa7b8, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.88 });
  const ROCK = [0x6b6560, 0x7d766d, 0x5a5550, 0x8b847a];

  // ---- expedition compounds
  for (const c of plan.compounds) {
    const y = H(c.x, c.z), [main, alt, accent] = c.scheme;
    const at = (u, v) => { const ca = Math.cos(c.rot), sa = Math.sin(c.rot); return [c.x + u * ca - v * sa, c.z + u * sa + v * ca]; };
    // dining tent: a big dome or a long mess tent with a ridge roof
    if (c.big) { const [x, z] = at(0, 0); put(domes, x, y - 0.6, z, r() * 3, 3.6, 2.8, 3.6, r() < 0.5 ? 0xf5d000 : 0xe9e9e4); }
    else {
      const [x, z] = at(0, 0);
      put(boxes, x, y + 1.0, z, c.rot, 8, 2.0, 4.2, r() < 0.5 ? 0x2a6fb8 : 0xd8d2c0);
      put(roofs, x, y + 2.35, z, c.rot, 4.2, 8.2, 1.25, r() < 0.5 ? 0x2a6fb8 : 0xd8d2c0);
    }
    // kitchen: a dry-stone wall under a blue tarp
    { const [x, z] = at(-c.r * 0.45, c.r * 0.35);
      for (let k = 0; k < 18; k++) {
        const t = k / 18, u = -2.5 + 5 * ((t * 4) % 1), side = Math.floor(t * 4);
        const [sx, sz] = side === 0 ? [u, -1.8] : side === 1 ? [2.5, u * 0.72] : side === 2 ? [-u, 1.8] : [-2.5, -u * 0.72];
        const [wx, wz] = at(-c.r * 0.45 + sx, c.r * 0.35 + sz);
        put(stones, wx, y + 0.35, wz, r() * 6, 0.55, 0.45, 0.5, ROCK[k % 4]);
        put(stones, wx, y + 0.85, wz, r() * 6, 0.45, 0.35, 0.45, ROCK[(k + 1) % 4]);
      }
      put(tarps, x, y + 1.55, z, c.rot, 6.2, 4.6, 1, null, -Math.PI / 2 + 0.12);
    }
    // sleeping tents in an arc around the compound
    const n = 10 + Math.floor(r() * 9);
    for (let k = 0; k < n; k++) {
      const a = Math.PI * 0.15 + (k / n) * Math.PI * 1.55 + (r() - 0.5) * 0.15, rr = c.r * (0.62 + r() * 0.3);
      const [x, z] = at(Math.cos(a) * rr, Math.sin(a) * rr), ty = H(x, z), col = k % 4 === 3 ? alt : main, ry = -a + c.rot;
      put(tents, x, ty - 0.05, z, ry, 1.35, 1.05, 1.05, col);
      put(tents, x + Math.cos(ry) * 1.15, ty - 0.05, z - Math.sin(ry) * 1.15, ry, 0.7, 0.72, 0.8, accent);   // vestibule
      put(stones, x, ty - 0.15, z, ry, 1.6, 0.18, 1.3, ROCK[k % 4]);               // stone platform
    }
    // toilet tents, solar panels, barrels
    for (let k = 0; k < 2; k++) { const [x, z] = at(c.r * 0.85, -c.r * 0.3 + k * 1.4); put(boxes, x, H(x, z) + 1.0, z, c.rot, 1.1, 2.0, 1.1, k ? 0x3db35a : 0x2a8de0); }
    for (let k = 0; k < 3; k++) { const [x, z] = at(c.r * 0.2 + k * 1.8, -c.r * 0.55); put(panels, x, H(x, z) + 0.7, z, c.rot + Math.PI, 1, 1, 1, null, 0.6); }
    for (let k = 0; k < 5; k++) { const [x, z] = at(-c.r * 0.15 + (k % 3) * 0.65, c.r * 0.6 + Math.floor(k / 3) * 0.65); put(barrels, x, H(x, z) + 0.45, z); }
    // puja altar (lhap-so): a whitewashed stone chorten with a flag pole and prayer flags to the tents
    { const [x, z] = at(c.r * 0.3, c.r * 0.15), py = H(x, z);
      put(chortens, x, py + 0.45, z, c.rot, 1.6, 0.9, 1.6); put(chortens, x, py + 1.15, z, c.rot, 1.1, 0.5, 1.1); put(chortens, x, py + 1.6, z, c.rot + 0.78, 0.6, 0.4, 0.6);
      prayerFlags(scene, field, x, py + 1.8, z, 5, c.r * 0.9, 5.5, r);
    }
  }

  // ---- rubble and boulders over the debris-covered glacier
  for (let k = 0; k < 2600; k++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 1400, x = plan.E.x - 250 + Math.cos(a) * d, z = plan.E.z - 450 + Math.sin(a) * d;
    if (plan.zoneAt(x, z) < 0.3 || field.distanceToTrack(x, z) < 3.5) continue;
    if (plan.compounds.some((c) => Math.hypot(c.x - x, c.z - z) < c.r * 0.75)) continue;
    const s = 0.25 + Math.pow(r(), 3) * 2.2;
    put(stones, x, H(x, z) + s * 0.3, z, r() * 6, s, s * (0.5 + r() * 0.4), s * (0.7 + r() * 0.5), ROCK[Math.floor(r() * 4)], r(), r());
  }

  // ---- ice towers: clusters of seracs, thickest on the walk to the Icefall; solid, like the seracs above
  const m = routes.main, sE = m.s('ebc');
  const placed = [];
  const tryTower = (x, z, near) => {
    if (plan.zoneAt(x, z) < 0.45 || field.glacierAt(x, z) < 0.5 || field.distanceToTrack(x, z) < 13) return false;
    if (plan.compounds.some((c) => Math.hypot(c.x - x, c.z - z) < c.r + 28)) return false;
    if ([plan.sign, plan.heli, plan.crampon].some((q) => q && Math.hypot(q.x - x, q.z - z) < 30)) return false;
    if (plan.ponds.some((p) => Math.hypot(p.x - x, p.z - z) < p.r + 6)) return false;
    if (placed.some((t) => Math.hypot(t.x - x, t.z - z) < t.rad + 4)) return false;
    const ht = 7 + r() * 9 + near * 12, rad = ht * (0.45 + r() * 0.2);
    const y = Math.min(H(x, z), H(x + rad * 0.7, z), H(x - rad * 0.7, z), H(x, z + rad * 0.7), H(x, z - rad * 0.7)) - 1;
    put(towers[placed.length % 3], x, y, z, r() * 6, rad, ht, rad * (0.7 + r() * 0.5), null, (r() - 0.5) * 0.1, (r() - 0.5) * 0.1);
    placed.push({ x, z, rad });
    const key = Math.floor(x / 20) + ',' + Math.floor(z / 20);          // collision, as for the seracs
    if (!world.seracGrid.has(key)) world.seracGrid.set(key, []);
    world.seracGrid.get(key).push({ x, z, r: rad * 0.75 });
    return true;
  };
  for (let k = 0; k < 600 && placed.length < 220; k++) {
    let cx, cz, near, spread, n;
    if (k % 3 !== 2) {                                   // along the walk to Crampon Point and the Icefall foot
      const s = sE + 30 + r() * 320, p = m.at(s), off = (r() < 0.5 ? -1 : 1) * (20 + r() * 120);
      cx = p.x - p.dz * off; cz = p.z + p.dx * off; near = (s - sE) / 350; spread = 18 + r() * 22; n = 3 + Math.floor(r() * 6);
    } else {                                             // a few groups at the edges of the camp basin
      const a = r() * Math.PI * 2, d = 350 + r() * 900; cx = plan.E.x + Math.cos(a) * d; cz = plan.E.z + Math.sin(a) * d;
      near = 0; spread = 14 + r() * 14; n = 2 + Math.floor(r() * 4);
    }
    for (let q = 0; q < n * 3 && n > 0; q++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * spread;
      if (tryTower(cx + Math.cos(a) * d, cz + Math.sin(a) * d, near)) n--;
    }
  }

  // ---- melt ponds
  for (const p of plan.ponds) {
    const w = new THREE.Mesh(new THREE.CircleGeometry(p.r + 2.5, 28).rotateX(-Math.PI / 2), water);
    w.position.set(p.x, H(p.x, p.z) + 0.25, p.z); w.receiveShadow = true; scene.add(w);
  }

  // ---- the trekkers' end: the painted boulder, buried in prayer flags
  if (plan.sign) {
    const { x, z } = plan.sign, y = H(x, z);
    put(stones, x, y + 1.3, z, 0.4, 3.2, 1.9, 2.4, 0x77706a);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 2.1), new THREE.MeshStandardMaterial({
      map: signTexture([['EVEREST', 64, '#c81e1e'], ['BASE CAMP', 64, '#c81e1e'], ['5364m', 56, '#c81e1e']]), transparent: true, roughness: 0.9,
      polygonOffset: true, polygonOffsetFactor: -2,
    }));
    const toE = Math.atan2(plan.E.x - x, plan.E.z - z) + Math.PI;     // the painted face looks back down the trail
    face.position.set(x + Math.sin(toE) * 2.75, y + 1.5, z + Math.cos(toE) * 2.75); face.rotation.y = toE;
    scene.add(face);
    prayerFlags(scene, field, x, y + 3.4, z, 9, 9, 2.5, r);
    for (let k = 0; k < 14; k++) put(stones, x + (r() - 0.5) * 8, y + 0.2, z + (r() - 0.5) * 8, r() * 6, 0.4 + r() * 0.5, 0.35, 0.5, ROCK[k % 4]);
  }
  // ---- helipad: a ring of whitewashed stones round an H, with a windsock
  if (plan.heli) {
    const { x, z } = plan.heli, y = H(x, z);
    for (let k = 0; k < 28; k++) { const a = (k / 28) * Math.PI * 2; put(chortens, x + Math.cos(a) * 9, y + 0.15, z + Math.sin(a) * 9, a, 0.5, 0.3, 0.4); }
    for (const [u, v, w, d] of [[-2, 0, 0.7, 6], [2, 0, 0.7, 6], [0, 0, 3.3, 0.7]]) put(chortens, x + u, y + 0.06, z + v, 0, w, 0.12, d);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 5, 6), M(0x9a9a9a, { metalness: 0.6 })); pole.position.set(x + 12, y + 2.5, z); scene.add(pole);
    const sock = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1.8, 10, 1, true), M(0xff6a00, { side: THREE.DoubleSide })); sock.rotation.z = Math.PI / 2; sock.position.set(x + 12.9, y + 4.8, z); scene.add(sock);
  }
  // ---- Crampon Point: a tarp shelter, gear, a sign
  { const c = plan.crampon, y = H(c.x, c.z), ry = Math.atan2(c.dx, c.dz);
    put(tarps, c.x, y + 1.6, c.z, ry, 4.5, 3.2, 1, null, -Math.PI / 2 + 0.3);
    for (let k = 0; k < 4; k++) put(barrels, c.x + (k - 1.5) * 0.7, y + 0.45, c.z + 1.6, 0, 1, 1, 1);
    for (let k = 0; k < 6; k++) put(boxes, c.x - 1.5 + (k % 3) * 0.75, y + 0.2 + Math.floor(k / 3) * 0.4, c.z - 1.4, ry, 0.6, 0.38, 0.4, k % 2 ? 0x2a2f38 : 0xe8661a);
    const board = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.2), new THREE.MeshStandardMaterial({
      map: signTexture([['CRAMPON POINT', 54, '#ffffff'], ['Khumbu Icefall ▲', 40, '#ffd166']], { bg: '#24456f' }), roughness: 0.8, side: THREE.DoubleSide,
    }));
    board.position.set(c.x + 2.6, y + 1.9, c.z); board.rotation.y = ry; scene.add(board);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.9, 6), M(0x5a4632)); post.position.set(c.x + 2.6, y + 0.95, c.z); scene.add(post);
    const l = makeLabel(scene, 'Crampon Point', fmt(y) + ' m'); l.position.set(c.x, y + 9, c.z); l.userData.range = 900; world.labels.push(l);
  }
  done(tents, domes, boxes, roofs, stones, barrels, panels, tarps, chortens, ...towers);
  return { towers: placed.length, compounds: plan.compounds.length };
}
