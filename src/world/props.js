// Everything placed on the terrain: camps, wands, fixed ropes, ladders over crevasses,
// seracs in the Icefall, prayer flags, the Hillary Step and summit markers.
import * as THREE from 'three';
import { fmt } from '../core/math.js';
import { makeNoise2D, mulberry32 } from '../core/noise.js';
import { ropeDefs } from './route.js';

const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();

function instanced(scene, geo, mat, n, cast = true) {
  const m = new THREE.InstancedMesh(geo, mat, Math.max(1, n));
  m.castShadow = cast; m.receiveShadow = true; m.count = 0; scene.add(m); return m;
}
function add(im, x, y, z, rotY = 0, sx = 1, sy = 1, sz = 1, color = null, quat = null) {
  if (im.count >= im.instanceMatrix.count) return;
  if (quat) _q.copy(quat); else _q.setFromAxisAngle(_v.set(0, 1, 0), rotY);
  _m4.compose(_v.set(x, y, z), _q, _s.set(sx, sy, sz));
  im.setMatrixAt(im.count, _m4);
  if (color !== null) im.setColorAt(im.count, _c.set(color));
  im.count++;
}
function finish(...ims) {
  for (const im of ims) {
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.computeBoundingSphere();
  }
}

export function makeLabel(scene, text, sub) {
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 128;
  const g = cv.getContext('2d');
  g.fillStyle = 'rgba(8,14,22,0.72)'; g.beginPath(); g.roundRect(4, 14, 504, 100, 20); g.fill();
  g.fillStyle = '#fff'; g.font = 'bold 44px system-ui, sans-serif'; g.textAlign = 'center'; g.fillText(text, 256, 62);
  g.fillStyle = '#9fc4e8'; g.font = '32px system-ui, sans-serif'; g.fillText(sub, 256, 100);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, sizeAttenuation: false, transparent: true, depthWrite: false, fog: false }));
  sp.scale.set(0.16, 0.04, 1);
  scene.add(sp);
  return sp;
}

export function crevasseLocal(cv, x, z, pad = 0) {
  const dx = x - cv.x, dz = z - cv.z;
  const u = dx * cv.ux + dz * cv.uz, v = -dx * cv.uz + dz * cv.ux;
  return Math.abs(u) < cv.len / 2 + pad && Math.abs(v) < cv.w / 2 + pad ? { u, v } : null;
}

export function buildProps(scene, field, routes, camps, seed = 5) {
  const r = mulberry32(seed);
  const H = (x, z) => field.height(x, z);
  const world = { camps, ropes: [], crevasses: [], seracGrid: new Map(), labels: [] };
  const box = new THREE.BoxGeometry(1, 1, 1);

  // ---------------- camps
  const tents = instanced(scene, new THREE.SphereGeometry(1, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ roughness: 0.7 }), 160);
  const mess = instanced(scene, box, new THREE.MeshStandardMaterial({ roughness: 0.8 }), 40);
  const bottles = instanced(scene, new THREE.CylinderGeometry(0.11, 0.11, 0.62, 10), new THREE.MeshStandardMaterial({ color: 0xe8661a, roughness: 0.4, metalness: 0.3 }), 120);
  const TENT = [0xf5b301, 0xf07d12, 0xe03a26, 0xf5d000, 0x2a8de0, 0x3db35a, 0xf5b301, 0xf07d12];
  for (const c of camps) {
    const route = routes[c.route], ny = H(c.x, c.z), dir = route.at(c.s);
    let placed = 0, tries = 0;
    while (placed < c.tents && tries++ < 1500) {
      const a = r() * Math.PI * 2, d = 4 + Math.sqrt(r()) * c.spread;
      const x = c.x + Math.cos(a) * d, z = c.z + Math.sin(a) * d;
      if (field.distanceToTrack(x, z) < 3.5) continue;
      const y = H(x, z);
      if (Math.abs(y - ny) > (c.id === 'ebc' ? 12 : 3)) continue;
      const s = 1.1 + r() * 0.5;
      add(tents, x, y - 0.05, z, r() * 6, s * 1.25, s * 0.95, s, TENT[Math.floor(r() * TENT.length)]);
      placed++;
    }
    const ox = c.x - dir.dz * 5, oz = c.z + dir.dx * 5;
    const nb = c.id === 'ebc' ? 12 : Math.max(2, Math.min(8, c.stock + 2));
    for (let k = 0; k < nb; k++) { const bx = ox + (k % 4) * 0.25, bz = oz + Math.floor(k / 4) * 0.25; add(bottles, bx, H(bx, bz) + 0.31, bz); }
    if (c.id === 'ebc') {
      for (let k = 0; k < 10; k++) {
        const a = r() * Math.PI * 2, d = 20 + r() * 45, x = c.x + Math.cos(a) * d, z = c.z + Math.sin(a) * d;
        if (field.distanceToTrack(x, z) < 8) continue;
        add(mess, x, H(x, z) + 1.2, z, r() * 3, 7, 2.4, 4, [0x3a6fb5, 0xd8d2c0, 0x5b8a3c, 0xc9a227][k % 4]);
      }
      const chx = c.x - 26, chz = c.z + 20, chy = H(chx, chz);
      add(mess, chx, chy + 0.6, chz, 0.3, 2.4, 1.2, 2.4, 0xb8b0a5);
      add(mess, chx, chy + 1.5, chz, 0.3, 1.5, 0.6, 1.5, 0xe8e2d5);
      prayerFlags(scene, field, chx, chy + 2, chz, 8, 28, 8, r);
    }
    if (c.id === 'c4') {
      // the South Col is littered with spent bottles and torn tents
      for (let k = 0; k < 25; k++) { const x = c.x + (r() - 0.5) * 70, z = c.z + (r() - 0.5) * 70; add(bottles, x, H(x, z) + 0.08, z, r() * 6, 1, 1, 1, null, _q.setFromEuler(new THREE.Euler(Math.PI / 2, r() * 6, 0))); }
    }
    c.label = makeLabel(scene, c.short === 'EBC' ? 'Base Camp' : c.name.split(' · ')[0], fmt(ny) + ' m');
    c.label.position.set(c.x, ny + 30, c.z);
    c.elevation = ny;
  }

  // ---------------- summits
  for (const [route, title] of [[routes.main, 'Everest summit'], [routes.lhotse, 'Lhotse summit']]) {
    const p = route.pts[route.pts.length - 1], y = H(p.x, p.z);
    prayerFlags(scene, field, p.x, y + 1.5, p.z, 5, 10, 1.4, r);
    const l = makeLabel(scene, title, fmt(y) + ' m'); l.position.set(p.x, y + 30, p.z); world.labels.push(l);
  }

  // ---------------- route wands and boot track
  const poles = instanced(scene, new THREE.CylinderGeometry(0.025, 0.025, 1.5, 5), new THREE.MeshStandardMaterial({ color: 0x5a4632 }), 1200, false);
  const flagGeo = new THREE.PlaneGeometry(0.4, 0.26); flagGeo.translate(0.2, 0, 0);
  const flags = instanced(scene, flagGeo, new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.8 }), 1200, false);
  for (const [route, col] of [[routes.main, 0xff3b1f], [routes.lhotse, 0x1fa8ff]]) {
    let side = 1;
    for (let s = 12; s < route.L - 5; s += 28) {
      const p = route.at(s), x = p.x - p.dz * 2.3 * side, z = p.z + p.dx * 2.3 * side; side = -side;
      const y = H(x, z);
      add(poles, x, y + 0.7, z); add(flags, x, y + 1.32, z, r() * 6, 1, 1, 1, col);
    }
    bootTrack(scene, field, route);
  }

  // ---------------- fixed ropes
  for (const d of ropeDefs(routes)) world.ropes.push(rope(scene, field, d));

  // ---------------- crevasses and ladders (Icefall and lower Western Cwm)
  const m = routes.main;
  const rungs = instanced(scene, box, new THREE.MeshStandardMaterial({ color: 0xb8bcc2, metalness: 0.7, roughness: 0.35 }), 3000);
  const iceA = m.s('ebc') + 300, iceB = m.s('icefall_top') + 40, cwmB = m.s('c1') + 900;
  const crossings = [];
  for (let k = 0; k < 13; k++) crossings.push(iceA + (iceB - iceA) * (k + 0.5) / 13);
  crossings.push(m.s('c1') + 260, m.s('c1') + 520, m.s('c1') + 780);
  for (const s of crossings) {
    const p = m.at(s), ang = Math.atan2(p.dz, p.dx) + Math.PI / 2 + (r() - 0.5) * 0.7;
    const wide = s > m.s('c1');
    world.crevasses.push({ x: p.x, z: p.z, ux: Math.cos(ang), uz: Math.sin(ang), len: 30 + r() * 50, w: wide ? 4.5 + r() * 2.5 : 2.6 + r() * 2, ladder: true });
  }
  let tries = 0;
  while (world.crevasses.length < 90 && tries++ < 5000) {
    const s = iceA + r() * (cwmB - iceA), p = m.at(s);
    const off = (r() < 0.5 ? -1 : 1) * (25 + r() * 230);
    const x = p.x - p.dz * off, z = p.z + p.dx * off;
    if (field.glacierAt(x, z) < 0.6 || field.slope(x, z).mag > 0.5) continue;
    const ang = Math.atan2(p.dz, p.dx) + Math.PI / 2 + (r() - 0.5) * 0.9;
    const cv = { x, z, ux: Math.cos(ang), uz: Math.sin(ang), len: 20 + r() * 60, w: 2 + r() * 4, ladder: false };
    let ok = true;
    for (let k = 0; k <= 10 && ok; k++) {
      const t = (k / 10 - 0.5) * (cv.len + 16);
      if (field.distanceToTrack(x + cv.ux * t, z + cv.uz * t) < 14) ok = false;
    }
    for (const o of world.crevasses) if (Math.hypot(o.x - x, o.z - z) < (o.len + cv.len) / 2 + 5) ok = false;
    if (ok) world.crevasses.push(cv);
  }
  const lipMat = new THREE.MeshStandardMaterial({ color: 0xa8d8f2, roughness: 0.3, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const holeMat = new THREE.MeshBasicMaterial({ color: 0x041018, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  for (const cv of world.crevasses) {
    scene.add(ribbon(field, cv, cv.w + 1.8, 0.1, lipMat));
    scene.add(ribbon(field, cv, cv.w, 0.18, holeMat));
    if (cv.ladder) ladder(field, cv, rungs);
  }

  // ---------------- seracs
  const sg = new THREE.IcosahedronGeometry(1, 1), n2 = makeNoise2D(mulberry32(seed + 77)), sp = sg.attributes.position;
  for (let i = 0; i < sp.count; i++) {
    _v.fromBufferAttribute(sp, i);
    const k = 1 + 0.3 * n2(_v.x * 1.7 + _v.y, _v.z * 1.7 - _v.y);
    sp.setXYZ(i, _v.x * k, _v.y * k * (_v.y > 0.5 ? 0.8 : 1), _v.z * k);
  }
  sg.computeVertexNormals();
  const seracs = instanced(scene, sg, new THREE.MeshStandardMaterial({ color: 0xcfe9f6, roughness: 0.25, flatShading: true }), 1100);
  tries = 0;
  while (seracs.count < 1100 && tries++ < 12000) {
    const s = iceA - 100 + r() * (iceB - iceA + 60), p = m.at(s);
    const off = (r() < 0.5 ? -1 : 1) * (12 + Math.pow(r(), 0.8) * 300);
    const x = p.x - p.dz * off, z = p.z + p.dx * off;
    if (field.glacierAt(x, z) < 0.5 || field.distanceToTrack(x, z) < 11) continue;
    let bad = false;
    for (const cv of world.crevasses) if (crevasseLocal(cv, x, z, 3)) { bad = true; break; }
    if (bad) continue;
    const w = 3 + r() * 8, h = 5 + r() * 15, y = H(x, z);
    _q.setFromEuler(new THREE.Euler((r() - 0.5) * 0.35, r() * 6.28, (r() - 0.5) * 0.35));
    add(seracs, x, y + h * 0.3, z, 0, w, h, w * (0.7 + r() * 0.6), null, _q);
    const key = Math.floor(x / 20) + ',' + Math.floor(z / 20);
    if (!world.seracGrid.has(key)) world.seracGrid.set(key, []);
    world.seracGrid.get(key).push({ x, z, r: w * 0.85 });
  }

  // ---------------- Hillary Step (rock step beside the ridge track) and the summit-ridge cornice
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x57514a, roughness: 0.95, flatShading: true });
  const rocks = instanced(scene, new THREE.DodecahedronGeometry(1, 0), rockMat, 40);
  const hs = m.s('hillary');
  for (let k = 0; k < 14; k++) {
    const p = m.at(hs - 14 + k * 2), side = k % 2 ? 1 : -1, off = side * (2.4 + r() * 1.5);
    const x = p.x - p.dz * off, z = p.z + p.dx * off;
    add(rocks, x, H(x, z) + 0.5, z, r() * 6, 1.4 + r() * 1.4, 1.5 + r() * 2.5, 1.2 + r());
  }
  cornice(scene, field, m, m.s('southsummit'), hs);

  finish(tents, mess, bottles, poles, flags, rungs, seracs, rocks);
  return world;
}

function bootTrack(scene, field, route) {
  const pos = [], idx = []; let k = 0;
  for (let s = 0; s <= route.L; s += 3) {
    const p = route.at(s);
    for (const sg of [-1, 1]) { const x = p.x - p.dz * 0.7 * sg, z = p.z + p.dx * 0.7 * sg; pos.push(x, field.height(x, z) + 0.05, z); }
    if (k > 0) { const a = (k - 1) * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    k++;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: 0x7f8b98, transparent: true, opacity: 0.42, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
  mesh.renderOrder = 1; scene.add(mesh);
}

function rope(scene, field, d) {
  const pts = [];
  for (let s = d.s0; s <= d.s1 + 0.01; s += 2.5) {
    const p = d.route.at(Math.min(s, d.s1)), x = p.x + p.dz * 1.0, z = p.z - p.dx * 1.0;
    pts.push(new THREE.Vector3(x, field.height(x, z) + 0.85, z));
  }
  const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), pts.length * 2, 0.04, 5, false);
  scene.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: d.color, roughness: 0.6 })));
  const stakes = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.04, 0.04, 1.0, 5), new THREE.MeshStandardMaterial({ color: 0x777777, metalness: 0.6 }), Math.ceil(pts.length / 10) + 1);
  stakes.count = 0;
  for (let i = 0; i < pts.length; i += 10) add(stakes, pts[i].x, pts[i].y - 0.45, pts[i].z);
  finish(stakes); scene.add(stakes);
  return { name: d.name, pts, color: d.color };
}

function ribbon(field, cv, width, lift, mat) {
  const pos = [], idx = [], steps = Math.ceil(cv.len / 2), vx = -cv.uz, vz = cv.ux;
  for (let k = 0; k <= steps; k++) {
    const u = (k / steps - 0.5) * cv.len, taper = 1 - Math.pow(Math.abs(k / steps - 0.5) * 2, 3) * 0.85;
    for (const sg of [-1, 1]) {
      const x = cv.x + cv.ux * u + vx * sg * width / 2 * taper, z = cv.z + cv.uz * u + vz * sg * width / 2 * taper;
      pos.push(x, field.height(x, z) + lift, z);
    }
    if (k < steps) { const a = k * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2, a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, mat); mesh.receiveShadow = true; return mesh;
}

function ladder(field, cv, rungs) {
  const vx = -cv.uz, vz = cv.ux, ext = cv.w / 2 + 1.3;
  const A = new THREE.Vector3(cv.x - vx * ext, 0, cv.z - vz * ext); A.y = field.height(A.x, A.z) + 0.14;
  const B = new THREE.Vector3(cv.x + vx * ext, 0, cv.z + vz * ext); B.y = field.height(B.x, B.z) + 0.14;
  const dir = B.clone().sub(A), len = dir.length(); dir.normalize();
  const side = new THREE.Vector3(cv.ux, 0, cv.uz);
  const up = new THREE.Vector3().crossVectors(side, dir).normalize(); if (up.y < 0) up.negate();
  const sideN = new THREE.Vector3().crossVectors(dir, up).normalize();
  const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(dir, up, sideN));
  for (const o of [-0.3, 0.3]) { const c = A.clone().add(B).multiplyScalar(0.5).addScaledVector(sideN, o); add(rungs, c.x, c.y, c.z, 0, len, 0.07, 0.05, null, q); }
  for (let t = 0.15; t < len; t += 0.32) { const c = A.clone().addScaledVector(dir, t); add(rungs, c.x, c.y + 0.01, c.z, 0, 0.04, 0.04, 0.62, null, q); }
  cv.ladderA = A; cv.ladderB = B;
}

function cornice(scene, field, route, s0, s1) {
  // wind-sculpted snow overhanging the Kangshung (east) side of the summit ridge
  const pos = [], idx = []; let k = 0;
  for (let s = s0; s <= s1; s += 2) {
    const p = route.at(s);
    let ex = p.dz, ez = -p.dx;               // right-hand normal of the ridge direction
    if (ex < 0) { ex = -ex; ez = -ez; }       // make it point east
    const x0 = p.x + ex * 1.8, z0 = p.z + ez * 1.8, y0 = field.height(x0, z0);
    const ring = [[1.8, 0.1], [3.2, 0.9], [5.2, 0.8], [6.0, 0.1], [4.4, -1.2], [2.4, -1.4]];
    for (const [o, dy] of ring) { const x = p.x + ex * o, z = p.z + ez * o; pos.push(x, y0 + dy, z); }
    if (k > 0) for (let a = 0; a < 6; a++) {
      const b = (a + 1) % 6, i0 = (k - 1) * 6;
      idx.push(i0 + a, i0 + 6 + a, i0 + b, i0 + b, i0 + 6 + a, i0 + 6 + b);
    }
    k++;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0xf2f6fb, roughness: 0.7, side: THREE.DoubleSide }));
  mesh.castShadow = true; mesh.receiveShadow = true; scene.add(mesh);
}

function prayerFlags(scene, field, x, y, z, lines, length, height, r) {
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, height, 6), new THREE.MeshStandardMaterial({ color: 0x6b5236 }));
  pole.position.set(x, y + height / 2 - 1, z); pole.castShadow = true; scene.add(pole);
  const per = Math.ceil(length / 0.55);
  const im = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.34, 0.24), new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.9 }), lines * per);
  im.count = 0;
  const COLS = [0x1e5bd8, 0xf2f2f2, 0xd8261c, 0x1f9e3a, 0xf2c200];
  const top = new THREE.Vector3(x, y + height - 1, z);
  for (let l = 0; l < lines; l++) {
    const a = (l / lines) * Math.PI * 2 + r() * 0.3, ex = x + Math.cos(a) * length, ez = z + Math.sin(a) * length;
    const end = new THREE.Vector3(ex, field.height(ex, ez) + 0.6, ez), dir = end.clone().sub(top).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), new THREE.Vector3(dir.x, 0, dir.z).normalize());
    for (let k = 0; k < per; k++) {
      const t = (k + 0.5) / per, p = top.clone().lerp(end, t); p.y -= Math.sin(t * Math.PI) * length * 0.06;
      add(im, p.x, p.y - 0.12, p.z, 0, 1, 1, 1, COLS[k % 5], q);
    }
  }
  finish(im); scene.add(im);
}
