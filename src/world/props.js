// Everything placed on the terrain: camps, wands, fixed ropes, ladders over crevasses,
// seracs in the Icefall, prayer flags, the Hillary Step and summit markers.
import * as THREE from 'three';
import { fmt } from '../core/math.js';
import { makeNoise2D, mulberry32 } from '../core/noise.js';
import { ropeDefs, CLIMBS } from './route.js';
import { routeCrevasse } from './routeHazards.js';
import { placeMemorials } from './memorials.js';
import { buildBaseCamp } from './baseCamp.js';
import { PEAKS } from './geo.js';
import { CampVisuals } from '../render/campVisuals.js';
import { CrevasseField } from './crevasses.js';
import { CrevasseVisuals } from '../render/crevasses.js';
import { createFlagMaterial, prepareFlagMesh } from '../render/flags.js';
import { buildRouteWear } from '../render/routeWear.js';
import { RouteFeatures } from './routeFeatures.js';

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

export function makeLabel(scene, text, sub, kind = 'place') {
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 128;
  const g = cv.getContext('2d');
  g.fillStyle = 'rgba(8,14,22,0.72)'; g.beginPath(); g.roundRect(4, 14, 504, 100, 20); g.fill();
  g.fillStyle = '#fff'; g.font = 'bold 44px system-ui, sans-serif'; g.textAlign = 'center'; g.fillText(kind === 'peak' ? '▲ ' + text : text, 256, 62);
  g.fillStyle = '#9fc4e8'; g.font = '32px system-ui, sans-serif'; g.fillText(sub, 256, 100);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, sizeAttenuation: false, transparent: true, depthWrite: false, fog: false }));
  if (kind === 'peak') sp.scale.set(0.12, 0.03, 1); else sp.scale.set(0.16, 0.04, 1);
  scene.add(sp);
  return sp;
}

export function crevasseLocal(cv, x, z, pad = 0) {
  const dx = x - cv.x, dz = z - cv.z;
  const u = dx * cv.ux + dz * cv.uz, v = -dx * cv.uz + dz * cv.ux;
  return Math.abs(u) < cv.len / 2 + pad && Math.abs(v) < cv.w / 2 + pad ? { u, v } : null;
}

/** opts: { backdrop, basePlan, seed, quality (graphics preset), anisotropy } */
export function buildProps(scene, field, routes, camps, { backdrop = null, basePlan = null, seed = 5, quality, anisotropy = 1 } = {}) {
  const r = mulberry32(seed);
  const H = (x, z) => field.height(x, z);
  const world = { camps, ropes: [], crevasses: [], seracGrid: new Map(), labels: [] };
  const campVisuals = world.campVisuals = new CampVisuals(scene, field, { quality, anisotropy });
  const box = new THREE.BoxGeometry(1, 1, 1);

  // ---------------- camps
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
      campVisuals.add('sleep', { x, y, z, rot: r() * 6, scale: [s * 1.25 / 1.28, s * 0.95 / 1.17, s / 1.02],
        color: TENT[Math.floor(r() * TENT.length)], id: `${c.id}-sleep-${placed}` });
      placed++;
    }
    const ox = c.x - dir.dz * 5, oz = c.z + dir.dx * 5;
    const nb = c.id === 'ebc' ? 12 : Math.max(2, Math.min(8, c.stock + 2));
    for (let k = 0; k < nb; k++) { const x = ox + (k % 4) * 0.25, z = oz + Math.floor(k / 4) * 0.25;
      campVisuals.add('bottle', { x, z, color: 0xe8661a, id: `${c.id}-bottle-${k}` }); }
    if (c.id === 'ebc') {
      for (let k = 0; k < 10; k++) {
        const a = r() * Math.PI * 2, d = 20 + r() * 45, x = c.x + Math.cos(a) * d, z = c.z + Math.sin(a) * d;
        if (field.distanceToTrack(x, z) < 8) continue;
        campVisuals.add('mess', { x, z, rot: r() * 3, scale: [7 / 8, 2.4 / 2.9, 4 / 4.2],
          color: [0x3a6fb5, 0xd8d2c0, 0x5b8a3c, 0xc9a227][k % 4], id: `hub-mess-${k}` });
      }
      const chx = c.x - 26, chz = c.z + 20, chy = H(chx, chz);
      campVisuals.add('altar', { x: chx, y: chy, z: chz, rot: 0.3, scale: [1.5, 1, 1.5], color: 0xb8b0a5, id: 'hub-altar' });
      prayerFlags(scene, field, chx, chy + 2, chz, 8, 28, 8, r);
    }
    if (c.id === 'c4') {
      // the South Col is littered with spent bottles and torn tents
      for (let k = 0; k < 25; k++) { const x = c.x + (r() - 0.5) * 70, z = c.z + (r() - 0.5) * 70;
        campVisuals.add('bottle', { x, y: H(x, z) + 0.108, z, rot: r() * 6, color: 0xe8661a,
          quaternion: new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, r() * 6, 0)),
          originOffset: [0, -0.31, 0], ground: false, id: `c4-spent-${k}` }); }
    }
    c.label = makeLabel(scene, c.short === 'EBC' ? 'Base Camp' : c.name.split(' · ')[0], fmt(ny) + ' m');
    c.label.position.set(c.x, ny + 30, c.z);
    c.elevation = ny;
  }

  // ---------------- summits
  for (const c of CLIMBS) {
    const route = routes[c.route], title = `${c.short} summit`;
    const p = route.pts[route.pts.length - 1], y = H(p.x, p.z);
    prayerFlags(scene, field, p.x, y + 1.5, p.z, 5, 10, 1.4, r);
    const l = makeLabel(scene, title, fmt(y) + ' m'); l.position.set(p.x, y + 30, p.z); world.labels.push(l);
  }
  // name tags on the other real summits in view, placed on the rendered top
  for (const pk of PEAKS) {
    if (CLIMBS.some((c) => c.id === pk.id)) continue;
    const top = peakTop(field, backdrop, pk);
    const l = makeLabel(scene, pk.name, fmt(pk.e) + ' m', 'peak');
    l.position.set(top.x, top.y + 90, top.z);
    Object.assign(l.userData, { range: 75000, near: 1500, baseY: top.y + 90, curve: true });
    world.labels.push(l);
  }

  // ---------------- route wands and boot track
  const poles = instanced(scene, new THREE.CylinderGeometry(0.025, 0.025, 1.5, 5), new THREE.MeshStandardMaterial({ color: 0x5a4632 }), 1200, false);
  const flagGeo = new THREE.PlaneGeometry(0.4, 0.26, 12, 5); flagGeo.translate(0.2, 0, 0);
  const flags = prepareFlagMesh(instanced(scene, flagGeo, createFlagMaterial(), 1200));
  for (const c of CLIMBS) {
    const route = routes[c.route], col = c.color;
    let side = 1;
    for (let s = 12; s < route.L - 5; s += 28) {
      const p = route.at(s), x = p.x - p.dz * 2.3 * side, z = p.z + p.dx * 2.3 * side; side = -side;
      const y = H(x, z);
      add(poles, x, y + 0.7, z); add(flags, x, y + 1.32, z, r() * 6, 1, 1, 1, col);
    }
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
    const angleOffset = (r() - 0.5) * 0.7;
    const wide = s > m.s('c1');
    const cv = routeCrevasse(m, s, { angleOffset, length: 30 + r() * 50, width: wide ? 4.5 + r() * 2.5 : 2.6 + r() * 2 });
    if (cv) world.crevasses.push(cv);
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
  world.crevasseField = new CrevasseField(field, world.crevasses, seed);
  world.crevasseVisuals = new CrevasseVisuals(scene, world.crevasseField, quality);
  for (const cv of world.crevasses) {
    if (cv.ladder) ladder(field, cv, rungs);
  }
  world.routeFeatures=new RouteFeatures(scene,field,routes,world.crevasseField);
  world.routeWear=buildRouteWear(scene,field,routes,world.crevasseField);

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

  // ---------------- Hillary Step (rock step beside the ridge track)
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x57514a, roughness: 0.95, flatShading: true });
  const rocks = instanced(scene, new THREE.DodecahedronGeometry(1, 0), rockMat, 40);
  const hs = m.s('hillary');
  for (let k = 0; k < 14; k++) {
    const p = m.at(hs - 14 + k * 2), side = k % 2 ? 1 : -1, off = side * (2.4 + r() * 1.5);
    const x = p.x - p.dz * off, z = p.z + p.dx * off;
    add(rocks, x, H(x, z) + 0.5, z, r() * 6, 1.4 + r() * 1.4, 1.5 + r() * 2.5, 1.2 + r());
  }

  finish(poles, flags, rungs, seracs, rocks);
  world.memorials = memorials(scene, field, placeMemorials(routes, field), r, world);
  if (basePlan) world.baseCamp = buildBaseCamp(scene, field, routes, basePlan, world, prayerFlags, makeLabel);
  campVisuals.finish();
  return world;
}

/** The highest rendered point near a peak's surveyed position (core terrain if it is there, else the backdrop). */
function peakTop(core, backdrop, pk) {
  const inCore = core.contains(pk.x, pk.z, 200), f = inCore || !backdrop ? core : backdrop;
  const R = inCore ? 700 : 1600, step = inCore ? 8 : 40;
  let best = { x: pk.x, z: pk.z, y: f.height(pk.x, pk.z) };
  for (let z = pk.z - R; z <= pk.z + R; z += step) for (let x = pk.x - R; x <= pk.x + R; x += step) {
    if ((x - pk.x) ** 2 + (z - pk.z) ** 2 > R * R) continue;
    const y = f.height(x, z); if (y > best.y) best = { x, z, y };
  }
  return best;
}

function rope(scene, field, d) {
  const pts = [];
  for (let s = d.s0; s < d.s1 + 2.5; s += 2.5) {
    const distance=Math.min(s,d.s1)-d.s0,p = d.route.at(d.s0+distance), x = p.x + p.dz * 1.0, z = p.z - p.dx * 1.0;
    const span=Math.min(25,d.s1-(d.s0+Math.floor(distance/25)*25));
    const sag=.3*Math.sin(Math.PI*Math.min(distance%25,span)/Math.max(span,.01));
    pts.push(new THREE.Vector3(x, field.height(x, z) + 0.85 - Math.max(0,sag), z));
    if(s>=d.s1)break;
  }
  // Linear spans avoid Catmull-Rom overshoot through the rugged native surface.
  const curve=new THREE.Curve();curve.getPoint=(t,target=new THREE.Vector3())=>{
    const f=t*(pts.length-1),i=Math.min(pts.length-2,Math.floor(f));return target.copy(pts[i]).lerp(pts[i+1],f-i);
  };
  const geo = new THREE.TubeGeometry(curve, pts.length * 2, 0.012, 6, false);
  const mesh=new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: d.color, roughness: 0.8 }));
  mesh.castShadow=mesh.receiveShadow=true;scene.add(mesh);
  const stakes = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.04, 0.04, 1.0, 5), new THREE.MeshStandardMaterial({ color: 0x777777, metalness: 0.6 }), Math.ceil(pts.length / 10) + 1);
  stakes.castShadow=stakes.receiveShadow=true;
  stakes.count = 0;
  for (let i = 0; i < pts.length; i += 10) add(stakes, pts[i].x, pts[i].y - 0.45, pts[i].z);
  finish(stakes); scene.add(stakes);
  return { name: d.name, pts, color: d.color, route: d.route };
}

function ladder(field, cv, rungs) {
  for(const part of cv.ladderParts) add(rungs, part.center.x, part.center.y, part.center.z, 0, ...part.half.map(v=>v*2), null, part.rotation);
}

// The dead of the route (see memorials.js): a cairn with prayer flags, or a shrouded figure off the trail where the
// remains are reported to lie. Labels only show from close by.
function memorials(scene, field, list, r, world) {
  const stone = new THREE.MeshStandardMaterial({ color: 0x5f5850, roughness: 0.95 }), snow = new THREE.MeshStandardMaterial({ color: 0xf2f5f8, roughness: 0.9 });
  const shroud = [new THREE.MeshStandardMaterial({ color: 0x6d7f8f, roughness: 0.95 }), new THREE.MeshStandardMaterial({ color: 0x8a6a4f, roughness: 0.95 })];
  const rockGeo = new THREE.DodecahedronGeometry(1, 0), bodyGeo = new THREE.CapsuleGeometry(0.26, 1.35, 4, 10), driftGeo = new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  list.forEach((m, k) => {
    const g = new THREE.Group(); g.position.set(m.x, m.y, m.z); g.rotation.y = m.heading; scene.add(g);
    const mesh = (geo, mat, x, y, z) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; g.add(o); return o; };
    if (m.kind === 'body') {
      const b = mesh(bodyGeo, shroud[k % 2], 0, 0.2, 0); b.rotation.set(0, r() * 0.6 - 0.3, Math.PI / 2);
      mesh(driftGeo, snow, 0.3, -0.05, 0.12).scale.set(1.25, 0.32, 0.55);
      mesh(rockGeo, stone, -1.3, 0.15, 0.25).scale.set(0.32, 0.28, 0.3);
    } else {
      let y = 0;
      for (let i = 0; i < 6; i++) { const sz = 0.55 - i * 0.07; const o = mesh(rockGeo, stone, (r() - 0.5) * 0.12, y + sz * 0.6, (r() - 0.5) * 0.12); o.scale.setScalar(sz); o.rotation.set(r() * 3, r() * 3, r() * 3); y += sz * 0.95; }
    }
    prayerFlags(scene, field, m.x + Math.cos(m.heading) * 1.6, m.y + 1, m.z - Math.sin(m.heading) * 1.6, 3, 5, 2.2, r);
    const l = makeLabel(scene, m.title, fmt(m.y) + ' m'); l.position.set(m.x, m.y + 6, m.z); l.userData.range = 450; world.labels.push(l);
  });
  return list;
}

function prayerFlags(scene, field, x, y, z, lines, length, height, r) {
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, height, 6), new THREE.MeshStandardMaterial({ color: 0x6b5236 }));
  pole.position.set(x, y + height / 2 - 1, z); pole.castShadow = true; scene.add(pole);
  const per = Math.ceil(length / 0.55);
  const geo=new THREE.PlaneGeometry(0.34,0.24,12,5);geo.translate(.17,0,0);
  const im = prepareFlagMesh(new THREE.InstancedMesh(geo,createFlagMaterial(),lines * per));
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
