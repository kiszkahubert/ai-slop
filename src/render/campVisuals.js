// Render-only camp assets: shared surfaces, spatial instance batches and hysteretic near/far detail.
import * as THREE from 'three';
import { createCampModels } from './campModels.js';
import { createCampTextures, disposeCampTextures } from './campTextures.js';
import { patchMacroShadow } from './shared.js';

const CELL = 512;
const FOOT = { sleep: [1.28, 1.02], dome: [3.5, 3.5], mess: [4, 2.1], toilet: [0.55, 0.55],
  kitchen: [3.1, 2.3], tarp: [3.1, 2.3], barrel: [0.3, 0.3], bottle: [0.11, 0.11], crate: [0.3, 0.2], solar: [0.8, 0.5], altar: [0.8, 0.8] };
const SURFACES = {
  fabric: ['fabric', 0xffffff, 0, 0.94, 'main'], accent: ['fabric', 0xffffff, 0, 0.94, 'accent'],
  seam: ['fabric', 0xd4d1c7, 0, 0.98, 'main'], dark: ['fabric', 0x252c31, 0, 1, 'fixed'],
  door: ['fabric', 0xc3c3c3, 0, 0.98, 'accent'],
  paint: ['paint', 0xffffff, 0.2, 0.84, 'main'], metal: ['paint', 0xc4c6c9, 0.8, 0.66, 'fixed'],
  plastic: ['plastic', 0xffffff, 0, 0.92, 'main'], stone: ['stone', 0xffffff, 0, 1, 'main'],
  whiteStone: ['stone', 0xeae5d8, 0, 1, 'fixed'], solar: ['solar', 0xffffff, 0.32, 0.8, 'fixed'],
  glass: ['plastic', 0x719aaa, 0.5, 0.22, 'fixed'], label: ['fabric', 0xe7dfc8, 0, 1, 'fixed'],
};
const up = new THREE.Vector3(0, 1, 0), white = new THREE.Color(0xffffff);

export function campDetailRadius(q) { return q.campDetailRadius ?? (q.textureSize >= 1024 ? 120 : q.textureSize >= 512 ? 80 : 40); }
export function campDetailLevel(distance, previous, radius) {
  return distance < radius * (previous === 1 ? 1.1 : 0.9) ? 1 : 0;
}

export class CampVisuals {
  constructor(scene, field, { quality = { textureSize: 512 }, anisotropy = 1 } = {}) {
    this.field = field; this.anisotropy = anisotropy; this.records = []; this.cells = new Map();
    this.root = new THREE.Group(); this.root.name = 'Camp exterior models'; scene.add(this.root);
    this.models = createCampModels(); this.materials = {}; this.lastCamera = new THREE.Vector3(Infinity, Infinity, Infinity);
    this.radius = campDetailRadius(quality); this.size = 0; this.finished = false; this.disposed = false;
    for (const [name, [, color, metalness, roughness]] of Object.entries(SURFACES)) {
      const m = new THREE.MeshStandardMaterial({ color, metalness, roughness, vertexColors: true, side: THREE.DoubleSide });
      m.name = `Camp ${name}`; m.normalScale.setScalar(name === 'stone' || name === 'whiteStone' ? 0.65 : 0.28);
      patchMacroShadow(m); this.materials[name] = m;
    }
    this.ropeMaterial = new THREE.MeshStandardMaterial({ color: 0x817866, roughness: 0.96 }); patchMacroShadow(this.ropeMaterial);
    this.pegMaterial = new THREE.MeshStandardMaterial({ color: 0x8d9599, metalness: 0.65, roughness: 0.65 }); patchMacroShadow(this.pegMaterial);
    this.ropeGeometry = new THREE.CylinderGeometry(0.006, 0.006, 1, 4);
    this.pegGeometry = new THREE.CylinderGeometry(0.01, 0.012, 0.18, 5);
    this.applyQuality(quality);
  }

  add(kind, { x, z, y = this.field.height(x, z), rot = 0, scale = [1, 1, 1], color = 0xffffff,
    accent = color, id = `${kind}-${this.records.length}`, quaternion = null, originOffset = null, ground = true }) {
    if (this.finished || this.disposed) throw new Error('Camp assets are already finalized');
    if (!this.models[kind]) throw new Error(`Unknown camp model: ${kind}`);
    const q = quaternion ? quaternion.clone() : new THREE.Quaternion().setFromAxisAngle(up, rot);
    if (ground && !quaternion) {
      // Seat the floor on the local support plane, limiting tilt for upright expedition structures.
      const [hx, hz] = FOOT[kind], ca = Math.cos(rot), sa = Math.sin(rot);
      const dx = hx * scale[0], dz = hz * scale[2], H = (u, v) => this.field.height(x + u * ca + v * sa, z - u * sa + v * ca);
      const sx = (H(dx, 0) - H(-dx, 0)) / (2 * dx), sz = (H(0, dz) - H(0, -dz)) / (2 * dz);
      const normal = new THREE.Vector3(-sx * ca - sz * sa, 1, sx * sa - sz * ca).normalize();
      const slope = new THREE.Quaternion().setFromUnitVectors(up, normal), angle = slope.angleTo(new THREE.Quaternion());
      if (angle > Math.PI / 15) slope.slerp(new THREE.Quaternion(), 1 - (Math.PI / 15) / angle);
      q.premultiply(slope);
    }
    const position = new THREE.Vector3(x, y, z);
    if (originOffset) position.add(new THREE.Vector3(...originOffset).applyQuaternion(q));
    const matrix = new THREE.Matrix4().compose(position, q, new THREE.Vector3(...scale));
    // Decoration uses its own stable hash, so adding detail never consumes the placement RNG.
    let hash = 2166136261; for (const c of id) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619);
    const tone = 0.92 + (hash >>> 0) / 4294967295 * 0.08;
    const record = { id, kind, x, y, z, matrix, color: new THREE.Color(color).multiplyScalar(tone), accent: new THREE.Color(accent).multiplyScalar(tone), level: 0, guys: [] };
    for (const tie of this.models[kind][1].ties) {
      const a = new THREE.Vector3(...tie.from).applyMatrix4(matrix), b = new THREE.Vector3(...tie.to).applyMatrix4(matrix);
      b.y = this.field.height(b.x, b.z) + 0.035;
      if (this.field.distanceToTrack && this.field.distanceToTrack(b.x, b.z) < 2) continue;
      if (Math.abs(a.y - b.y) > 3.5) continue;
      const mid = a.clone().lerp(b, 0.5); mid.y -= Math.min(0.06, a.distanceTo(b) * 0.018);
      const segments = [];
      for (const [p, end] of [[a, mid], [mid, b]]) {
        const dir = end.clone().sub(p), length = dir.length();
        if (length < 0.01) continue;
        segments.push(new THREE.Matrix4().compose(p.clone().add(end).multiplyScalar(0.5),
          new THREE.Quaternion().setFromUnitVectors(up, dir.normalize()), new THREE.Vector3(1, length, 1)));
      }
      const peg = new THREE.Matrix4().compose(b.clone().add(new THREE.Vector3(0, 0.03, 0)),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.25), new THREE.Vector3(1, 1, 1));
      record.guys.push({ segments, peg });
    }
    this.records.push(record);
    const key = `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;
    if (!this.cells.has(key)) this.cells.set(key, { models: new Map(), ropes: null, pegs: null });
    const cell = this.cells.get(key);
    if (!cell.models.has(kind)) cell.models.set(kind, { records: [], meshes: [[], []] });
    cell.models.get(kind).records.push(record); record.cell = cell; record.bucket = cell.models.get(kind);
    return record;
  }

  mesh(geo, material, count, name, detail) {
    const mesh = new THREE.InstancedMesh(geo, material, Math.max(1, count)); mesh.count = 0; mesh.name = name;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.castShadow = detail; mesh.receiveShadow = true;
    this.root.add(mesh); return mesh;
  }
  buildBucket(kind, bucket) {
    for (let level = 0; level < 2; level++) {
      if (!bucket.meshes[level].length) bucket.meshes[level] = this.models[kind][level].parts.map((part) =>
        this.mesh(part.geometry, this.materials[part.surface], bucket.records.length, `${kind}/${level}/${part.surface}`, level === 1));
      for (const [i, mesh] of bucket.meshes[level].entries()) {
        const surface = this.models[kind][level].parts[i].surface, mode = SURFACES[surface][4]; mesh.count = 0;
        for (const r of bucket.records) if (r.level === level) {
          mesh.setMatrixAt(mesh.count, r.matrix); mesh.setColorAt(mesh.count, mode === 'main' ? r.color : mode === 'accent' ? r.accent : white); mesh.count++;
        }
        this.commit(mesh);
      }
    }
  }
  buildGuys(cell) {
    let capacity = 0; for (const b of cell.models.values()) for (const r of b.records) capacity += r.guys.length;
    if (!capacity) return;
    if (!cell.ropes) {
      cell.ropes = this.mesh(this.ropeGeometry, this.ropeMaterial, capacity * 2, 'Tent guy lines', true);
      cell.pegs = this.mesh(this.pegGeometry, this.pegMaterial, capacity, 'Tent anchors', true);
    }
    cell.ropes.count = cell.pegs.count = 0;
    for (const b of cell.models.values()) for (const r of b.records) if (r.level === 1) for (const guy of r.guys) {
      for (const matrix of guy.segments) cell.ropes.setMatrixAt(cell.ropes.count++, matrix);
      cell.pegs.setMatrixAt(cell.pegs.count++, guy.peg);
    }
    this.commit(cell.ropes); this.commit(cell.pegs);
  }
  commit(mesh) {
    mesh.visible = mesh.count > 0; mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }
  finish() {
    if (this.finished) return;
    this.finished = true;
    for (const cell of this.cells.values()) {
      for (const [kind, bucket] of cell.models) this.buildBucket(kind, bucket);
      this.buildGuys(cell);
    }
  }
  update(camera, force = false) {
    if (this.disposed || !this.finished) return;
    const now = performance.now(), expiredWarm = this.records.some(r => r.warmUntil && r.warmUntil <= now);
    if (!force && !this.dirty && !expiredWarm && camera.position.distanceToSquared(this.lastCamera) < 4) return;
    this.lastCamera.copy(camera.position); const changed = new Set(), cells = new Set();
    for (const r of this.records) {
      if (r.warmUntil <= now) r.warmUntil = 0;
      const distance = Math.hypot(r.x - camera.position.x, r.y - camera.position.y, r.z - camera.position.z);
      const level = this.radius === 0 ? 0 : Math.max(campDetailLevel(distance, r.level, this.radius), r.warmUntil > now ? 1 : 0);
      if (force || this.dirty || r.level !== level) { r.level = level; changed.add(r.bucket); cells.add(r.cell); }
    }
    for (const cell of cells) {
      for (const [kind, bucket] of cell.models) if (changed.has(bucket)) this.buildBucket(kind, bucket);
      this.buildGuys(cell);
    }
    this.dirty = false;
  }
  /** Prepare one upcoming camp bucket; its instances remain in their real world positions. */
  prepare(camera) {
    if (this.disposed || !this.finished) return 0;
    const now = performance.now();
    const record = this.records.find(r => !r.level && Math.hypot(r.x - camera.position.x, r.y - camera.position.y, r.z - camera.position.z) < this.radius);
    if (!record) return 0;
    for (const r of record.bucket.records) {
      if (Math.hypot(r.x - camera.position.x, r.y - camera.position.y, r.z - camera.position.z) < this.radius) { r.warmUntil = now + 8000; r.level = 1; }
    }
    const [kind] = [...record.cell.models].find(([, bucket]) => bucket === record.bucket);
    this.buildBucket(kind, record.bucket); this.buildGuys(record.cell);
    return 1;
  }
  applyQuality(q) {
    if (this.disposed) return;
    this.radius = campDetailRadius(q); this.dirty = true;
    if (this.radius === 0) for (const record of this.records) record.warmUntil = 0;
    if (this.size === q.textureSize) return;
    const old = this.textures; this.textures = createCampTextures(q.textureSize, this.anisotropy); this.size = q.textureSize;
    for (const [name, material] of Object.entries(this.materials)) {
      Object.assign(material, this.textures[SURFACES[name][0]]); material.needsUpdate = true;
    }
    if (old) disposeCampTextures(old);
  }
  stats() {
    let detailed = 0; for (const r of this.records) if (r.level) detailed++;
    return { objects: this.records.length, detailed, batches: this.root.children.length, textureSize: this.size,
      textures: this.textures ? Object.values(this.textures).reduce((n, t) => n + Object.keys(t).length, 0) : 0 };
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true; this.root.removeFromParent();
    for (const mesh of this.root.children) mesh.dispose();
    for (const kinds of Object.values(this.models)) for (const model of kinds) for (const part of model.parts) part.geometry.dispose();
    this.ropeGeometry.dispose(); this.pegGeometry.dispose(); this.ropeMaterial.dispose(); this.pegMaterial.dispose();
    for (const material of Object.values(this.materials)) material.dispose(); disposeCampTextures(this.textures);
    this.textures = null;
    this.root.clear(); this.cells.clear(); this.records.length = 0;
  }
}
