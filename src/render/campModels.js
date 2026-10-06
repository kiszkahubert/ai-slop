// Metre-scale expedition props. Parts with the same surface are merged once, then instanced by CampVisuals.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const TAU = Math.PI * 2;

class Model {
  constructor(near) { this.near = near; this.parts = new Map(); this.ties = []; }
  part(surface, geo, { pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1], tint = 0xffffff } = {}) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (g !== geo) geo.dispose();
    const m = new THREE.Matrix4().compose(new THREE.Vector3(...pos),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), new THREE.Vector3(...scale));
    g.applyMatrix4(m);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    const col = new THREE.Color(tint), colors = new Float32Array(g.attributes.position.count * 3);
    for (let i = 0; i < colors.length; i += 3) { colors[i] = col.r; colors[i + 1] = col.g; colors[i + 2] = col.b; }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    // RoundedBoxGeometry includes extra attributes that the simple custom shells do not have.
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(name)) g.deleteAttribute(name);
    if (!this.parts.has(surface)) this.parts.set(surface, []);
    this.parts.get(surface).push(g);
  }
  box(surface, size, pos, radius = 0, tint = 0xffffff) {
    this.part(surface, radius ? new RoundedBoxGeometry(...size, this.near && Math.min(...size) > 0.2 ? 2 : 1, radius) : new THREE.BoxGeometry(...size), { pos, tint });
  }
  rod(surface, a, b, radius = 0.015) {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A);
    const geo = new THREE.CylinderGeometry(radius, radius, d.length(), this.near ? 6 : 4);
    geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d.normalize()));
    this.part(surface, geo, { pos: A.add(B).multiplyScalar(0.5).toArray() });
  }
  tube(surface, points, radius = 0.012, segments = 24) {
    this.part(surface, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map((p) => V(...p))), segments, radius, 4, false));
  }
  finish() {
    const parts = [...this.parts].map(([surface, geos]) => {
      const geometry = mergeGeometries(geos); geos.forEach((g) => g.dispose());
      geometry.computeBoundingSphere(); return { surface, geometry };
    });
    return { parts, ties: this.ties };
  }
}

function grid(nu, nv, point) {
  const positions = [], uv = [], indices = [];
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
    positions.push(...point(i / nu, j / nv)); uv.push(i / nu, j / nv);
    if (i < nu && j < nv) { const a = j * (nu + 1) + i; indices.push(a, a + nu + 1, a + 1, a + 1, a + nu + 1, a + nu + 2); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(indices); g.computeVertexNormals(); return g;
}

function face(points) {
  const g = new THREE.BufferGeometry(), pos = [], uv = [];
  const origin = new THREE.Vector3(...points[0]);
  const axisU = new THREE.Vector3(...points[1]).sub(origin).normalize();
  const normal = axisU.clone().cross(new THREE.Vector3(...points[points.length - 1]).sub(origin)).normalize();
  const axisV = normal.cross(axisU).normalize();
  const projected = points.map((p) => { const v = new THREE.Vector3(...p).sub(origin); return [v.dot(axisU), v.dot(axisV)]; });
  const us = projected.map((p) => p[0]), vs = projected.map((p) => p[1]);
  const u0 = Math.min(...us), v0 = Math.min(...vs), du = Math.max(...us) - u0 || 1, dv = Math.max(...vs) - v0 || 1;
  for (let i = 1; i < points.length - 1; i++) for (const k of [0, i, i + 1]) {
    pos.push(...points[k]); uv.push((projected[k][0] - u0) / du, (projected[k][1] - v0) / dv);
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals(); return g;
}

function door(model, x, width, height, floor = 0.07) {
  const shape = new THREE.Shape(), w = width / 2;
  shape.moveTo(-w, 0); shape.lineTo(w, 0); shape.lineTo(w, height * 0.65);
  shape.quadraticCurveTo(w, height, 0, height); shape.quadraticCurveTo(-w, height, -w, height * 0.65); shape.closePath();
  const geo = new THREE.ShapeGeometry(shape, model.near ? 10 : 4);
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) + w) / width, uv.getY(i) / height);
  model.part('door', geo, { pos: [x, floor, 0], rot: [0, Math.PI / 2, 0] });
  if (model.near) {
    const pts = [[x + 0.006, floor, w], [x + 0.006, floor + height * 0.65, w],
      [x + 0.006, floor + height * 0.97, w * 0.4], [x + 0.006, floor + height, 0],
      [x + 0.006, floor + height * 0.97, -w * 0.4], [x + 0.006, floor + height * 0.65, -w], [x + 0.006, floor, -w]];
    model.tube('dark', pts, 0.008, 24);
    model.box('metal', [0.012, 0.065, 0.02], [x + 0.015, floor + height * 0.43, -w + 0.045]);
  }
}

function sleep(model) {
  const n = model.near ? 32 : 12, k = model.near ? 14 : 6;
  const point = (u, v) => {
    const a = u * TAU, t = v * Math.PI / 2, radial = Math.pow(Math.cos(t), 0.68);
    const sg = (q) => Math.sign(q) * Math.pow(Math.abs(q), 0.72);
    const sag = model.near ? Math.sin(a * 4) ** 2 * Math.sin(t * 2) * 0.024 : 0;
    return [1.28 * sg(Math.cos(a)) * radial, 0.05 + 1.12 * Math.sin(t) - sag, 1.02 * sg(Math.sin(a)) * radial];
  };
  model.part('fabric', grid(n, k, point));
  model.part('accent', face([[0.78, 0.04, -0.89], [1.93, 0.04, -0.6], [1.88, 0.7, 0], [0.8, 0.99, 0]]));
  model.part('accent', face([[0.8, 0.99, 0], [1.88, 0.7, 0], [1.93, 0.04, 0.6], [0.78, 0.04, 0.89]]));
  model.part('accent', face([[1.93, 0.04, 0.6], [1.88, 0.7, 0], [1.93, 0.04, -0.6]]));
  door(model, 1.935, 0.8, 0.57, 0.05);
  // A dark reinforced tub floor, not an extra dome under the canopy.
  model.part('dark', grid(n, 1, (u, v) => { const p = point(u, 0); return [p[0] * 1.006, -0.07 + v * 0.17, p[2] * 1.006]; }));
  if (model.near) {
    for (const diagonal of [-1, 1]) {
      const pts = [];
      for (let i = 0; i <= 20; i++) {
        const u = diagonal > 0 ? 0.125 : 0.375;
        const p = point(i <= 10 ? u : u + 0.5, i <= 10 ? i / 10 : (20 - i) / 10);
        p[1] += 0.018; pts.push(p);
      }
      model.tube('metal', pts, 0.012, 32);
      // Clips and reinforced pole sleeves interrupt the otherwise perfectly uniform rods.
      for (const i of [3, 6, 14, 17]) model.box('dark', [0.052, 0.043, 0.055], pts[i], 0.012);
    }
    for (const a of [0.25, 0.75, 1.25, 1.75]) {
      const pts = []; for (let j = 0; j <= 12; j++) { const p = point(a / 2, j / 12); p[1] += 0.004; pts.push(p); }
      model.tube('seam', pts, 0.006, 16);
    }
    model.part('dark', face([[-0.99, 0.53, -0.67], [-0.77, 0.77, -0.55], [-0.66, 0.56, -0.85]]));
    model.tube('seam', [[0.82, 1.0, 0], [1.9, 0.72, 0]], 0.009, 6);
    model.box('accent', [0.045, 0.36, 0.09], [1.94, 0.27, 0.44], 0.02);
  }
  for (const x of [-1, 1]) for (const z of [-1, 1]) model.ties.push({ from: [x * 1.1, 0.65, z * 0.85], to: [x * 1.75, 0, z * 1.5] });
}

function dome(model) {
  const n = model.near ? 18 : 12, levels = model.near ? 6 : 4, rings = [];
  for (let j = 0; j <= levels; j++) {
    const t = j / levels * Math.PI / 2, ring = [];
    for (let i = 0; i < n; i++) {
      const a = (i + (j % 2) * 0.5) / n * TAU;
      ring.push([Math.cos(a) * 3.5 * Math.pow(Math.cos(t), 0.78), 0.08 + 2.55 * Math.sin(t), Math.sin(a) * 3.5 * Math.pow(Math.cos(t), 0.78)]);
    }
    rings.push(ring);
  }
  for (let j = 0; j < levels; j++) for (let i = 0; i < n; i++) {
    const a = rings[j][i], b = rings[j][(i + 1) % n], c = rings[j + 1][i], d = rings[j + 1][(i + 1) % n];
    model.part('fabric', face([a, c, b]), { tint: (i + j) % 4 === 0 ? 0xcbd0cf : 0xffffff });
    if (j < levels - 1) model.part('fabric', face([b, c, d]));
    if (model.near) {
      model.rod('metal', a, c, 0.016); model.rod('seam', a, b, 0.012);
      if (j < levels - 1) model.rod('seam', b, c, 0.009);
    }
  }
  model.box('accent', [0.92, 1.78, 1.42], [3.18, 0.89, 0]);
  model.part('accent', face([[2.72, 1.78, -0.71], [3.65, 1.78, -0.71], [3.65, 2.02, 0], [2.72, 2.02, 0]]));
  model.part('accent', face([[2.72, 2.02, 0], [3.65, 2.02, 0], [3.65, 1.78, 0.71], [2.72, 1.78, 0.71]]));
  door(model, 3.646, 1.1, 1.63);
  for (const side of [-1, 1]) {
    model.part('glass', new THREE.PlaneGeometry(1, 0.6), { pos: [0.2, 1.23, side * 3.15], rot: [side * 0.25, side > 0 ? 0 : Math.PI, 0] });
  }
  for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; model.ties.push({ from: [Math.cos(a) * 2.8, 1.5, Math.sin(a) * 2.8], to: [Math.cos(a) * 4.2, 0, Math.sin(a) * 4.2] }); }
}

function mess(model) {
  for (const side of [-1, 1]) {
    model.part('fabric', grid(model.near ? 24 : 4, model.near ? 6 : 1, (u, v) =>
      [(u - 0.5) * 8, v * 1.95, side * (2.1 - (model.near ? Math.sin(u * Math.PI * 4) ** 2 * Math.sin(v * Math.PI) * 0.045 : 0))]));
    model.part('fabric', grid(model.near ? 24 : 4, model.near ? 8 : 1, (u, v) =>
      [(u - 0.5) * 8, 1.95 + v * 0.95 - Math.sin(v * Math.PI) * 0.055, side * (2.1 * (1 - v))]));
    for (const x of [-2.5, -0.5, 1.5]) {
      model.part('glass', new THREE.PlaneGeometry(0.82, 0.58), { pos: [x, 1.18, side * 2.105], rot: [0, side > 0 ? 0 : Math.PI, 0] });
      if (model.near) {
        for (const dx of [-0.44, 0.44]) model.box('seam', [0.028, 0.64, 0.022], [x + dx, 1.18, side * 2.115]);
        for (const y of [0.86, 1.5]) model.box('seam', [0.91, 0.028, 0.022], [x, y, side * 2.115]);
      }
    }
    model.box('dark', [8, 0.13, 0.035], [0, 0.06, side * 2.1]);
  }
  for (const x of [-4, 4]) model.part('accent', face([[x, 0, -2.1], [x, 0, 2.1], [x, 1.95, 2.1], [x, 2.9, 0], [x, 1.95, -2.1]]));
  door(model, 4.008, 1.34, 1.75);
  if (model.near) for (const x of [-4, -2, 0, 2, 4]) {
    model.tube('seam', [[x, 0.06, -2.1], [x, 1.96, -2.1], [x, 2.912, 0], [x, 1.96, 2.1], [x, 0.06, 2.1]], 0.011, 16);
    if (Math.abs(x) === 4) for (const side of [-1, 1]) model.rod('metal', [x, 0, side * 2.1], [x, 1.97, side * 2.1], 0.025);
  }
  for (const x of [-3.8, 0, 3.8]) for (const side of [-1, 1]) model.ties.push({ from: [x, 1.9, side * 2.1], to: [x, 0, side * 3] });
}

function toilet(model) {
  for (const side of [-1, 1]) {
    model.part('fabric', grid(model.near ? 8 : 1, model.near ? 8 : 1, (u, v) =>
      [(u - 0.5) * 1.1 * (1 - 0.08 * v), v * 1.92, side * (0.55 - 0.045 * v - Math.sin(v * Math.PI) * Math.sin(u * Math.PI) * 0.025)]));
    model.part('fabric', grid(model.near ? 8 : 1, model.near ? 8 : 1, (u, v) =>
      [side * (0.55 - 0.045 * v), v * 1.92, (u - 0.5) * 1.1 * (1 - 0.08 * v)]));
  }
  for (const side of [-1, 1]) {
    model.part('accent', face([[-0.51, 1.92, side * 0.51], [0.51, 1.92, side * 0.51], [0.51, 2.17, 0], [-0.51, 2.17, 0]]));
  }
  door(model, 0.557, 0.78, 1.6);
  if (model.near) for (const x of [-1, 1]) for (const z of [-1, 1]) {
    model.rod('seam', [x * 0.55, 0, z * 0.55], [x * 0.505, 1.92, z * 0.505], 0.014);
    model.ties.push({ from: [x * 0.5, 1.84, z * 0.5], to: [x * 0.9, 0, z * 0.9] });
  }
}

function tarp(model, kitchen) {
  const roof = (u, v) => [(u - 0.5) * 6.2, 2.22 + Math.abs(v - 0.5) * 0.25 - Math.sin(u * Math.PI) * Math.sin(v * Math.PI) * 0.16, (v - 0.5) * 4.6];
  model.part('fabric', grid(model.near ? 20 : 6, model.near ? 12 : 4, roof));
  for (const u of [0.03, 0.97]) for (const v of [0.03, 0.97]) {
    const p = roof(u, v); model.rod('metal', [p[0], 0, p[2]], p, 0.028);
    model.ties.push({ from: p, to: [p[0] * 1.12, 0, p[2] * 1.15] });
  }
  if (model.near) for (const u of [0, 1]) {
    const pts = []; for (let j = 0; j <= 12; j++) pts.push(roof(u, j / 12)); model.tube('seam', pts, 0.008, 16);
  }
  if (kitchen) {
    model.box('metal', [2.6, 0.075, 0.7], [-0.3, 1.05, 1.1], 0.02);
    for (const x of [-1.45, 0.85]) for (const z of [0.85, 1.35]) model.rod('metal', [x, 0.03, z], [x, 1.02, z], 0.023);
    model.box('dark', [0.65, 0.12, 0.38], [-0.6, 1.15, 1.1], 0.04);
    model.part('metal', new THREE.CylinderGeometry(0.17, 0.16, 0.23, model.near ? 16 : 8), { pos: [-0.6, 1.32, 1.1] });
    if (model.near) {
      model.part('dark', new THREE.TorusGeometry(0.17, 0.025, 5, 12), { pos: [-0.6, 1.4, 1.1], rot: [Math.PI / 2, 0, 0] });
      model.part('paint', new THREE.CylinderGeometry(0.15, 0.15, 0.4, 12), { pos: [0.8, 0.2, 0.6] });
      model.tube('dark', [[0.8, 0.43, 0.6], [0.95, 0.55, 0.85], [0.15, 0.4, 0.98], [-0.6, 1.15, 1.04]], 0.012, 16);
    }
  }
}

function barrel(model) {
  model.part('paint', new THREE.CylinderGeometry(0.295, 0.295, 0.89, model.near ? 24 : 12), { pos: [0, 0.45, 0] });
  model.part('metal', new THREE.CylinderGeometry(0.294, 0.294, 0.02, model.near ? 24 : 12), { pos: [0, 0.901, 0] });
  if (model.near) {
    for (const y of [0.04, 0.3, 0.64, 0.88]) model.part('metal', new THREE.TorusGeometry(0.296, 0.012, 5, 24), { pos: [0, y, 0], rot: [Math.PI / 2, 0, 0] });
    model.part('dark', new THREE.CylinderGeometry(0.028, 0.028, 0.018, 8), { pos: [0.14, 0.921, -0.08] });
  }
}

function bottle(model) {
  model.part('paint', new THREE.CylinderGeometry(0.106, 0.108, 0.5, model.near ? 20 : 10), { pos: [0, 0.27, 0] });
  model.part('paint', new THREE.SphereGeometry(0.106, model.near ? 20 : 10, 8, 0, TAU, 0, Math.PI / 2), { pos: [0, 0.52, 0], scale: [1, 0.68, 1] });
  model.part('metal', new THREE.CylinderGeometry(0.029, 0.038, 0.065, 8), { pos: [0, 0.615, 0] });
  model.part('dark', new THREE.CylinderGeometry(0.044, 0.044, 0.025, 8), { pos: [0, 0.665, 0] });
  if (model.near) {
    model.part('metal', new THREE.TorusGeometry(0.106, 0.007, 4, 16), { pos: [0, 0.025, 0], rot: [Math.PI / 2, 0, 0] });
    model.box('label', [0.15, 0.12, 0.004], [0, 0.39, 0.109]);
    model.part('metal', new THREE.CylinderGeometry(0.026, 0.026, 0.018, 12), { pos: [0, 0.61, 0.045], rot: [Math.PI / 2, 0, 0] });
    model.part('label', new THREE.CircleGeometry(0.021, 12), { pos: [0, 0.61, 0.056] });
    model.rod('dark', [0, 0.61, 0.058], [0.012, 0.623, 0.058], 0.002);
  }
}

function crate(model) {
  model.box('plastic', [0.6, 0.33, 0.4], [0, 0.175, 0], 0.035);
  model.box('paint', [0.615, 0.055, 0.415], [0, 0.355, 0], 0.02);
  for (const side of [-1, 1]) {
    model.box('dark', [0.22, 0.068, 0.014], [0, 0.235, side * 0.202], 0.012);
    if (model.near) for (const x of [-0.2, 0.2]) model.box('metal', [0.036, 0.075, 0.015], [x, 0.3, side * 0.214], 0.006);
  }
}

function solar(model) {
  model.part('metal', new THREE.BoxGeometry(1.6, 0.045, 1), { pos: [0, 0.7, 0], rot: [0.6, 0, 0] });
  model.part('solar', new THREE.PlaneGeometry(1.48, 0.89), { pos: [0, 0.723, 0.016], rot: [-Math.PI / 2 + 0.6, 0, 0] });
  for (const x of [-0.67, 0.67]) for (const z of [-0.36, 0.36]) {
    model.rod('metal', [x, 0, z], [x, 0.7 - z * Math.sin(0.6), z * Math.cos(0.6)], 0.024);
  }
  if (model.near) model.tube('dark', [[-0.4, 0.7, 0], [-0.45, 0.3, -0.12], [-0.6, 0.035, -0.4], [-0.9, 0.03, -0.4]], 0.008, 12);
}

function altar(model) {
  model.box('stone', [1.6, 0.87, 1.6], [0, 0.435, 0], 0.065);
  model.box('whiteStone', [1.12, 0.48, 1.12], [0, 1.11, 0], 0.05);
  model.part('whiteStone', new THREE.CylinderGeometry(0.15, 0.43, 0.42, 4), { pos: [0, 1.55, 0], rot: [0, Math.PI / 4, 0] });
  if (model.near) for (const y of [0.25, 0.52, 0.76]) for (const z of [-0.805, 0.805]) model.box('dark', [1.42, 0.008, 0.008], [0, y, z]);
}

export function createCampModels() {
  const builders = { sleep, dome, mess, toilet, tarp: (m) => tarp(m, false), kitchen: (m) => tarp(m, true), barrel, bottle, crate, solar, altar };
  return Object.fromEntries(Object.entries(builders).map(([kind, build]) => [kind, [false, true].map((near) => {
    const model = new Model(near); build(model); return model.finish();
  })]));
}
