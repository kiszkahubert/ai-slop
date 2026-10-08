// Chunked level-of-detail terrain. Each chunk keeps one mesh per LOD level it has needed;
// skirts hide cracks between neighbours at different levels.
import * as THREE from 'three';
import { TERRAIN } from '../config.js';
import { buildCrevasseTerrainJob } from './crevasseTerrain.js';
import { TERRAIN_LAYER } from '../render/depthPrepass.js';

export function axisSamples(start, end, step) {
  const result=[]; for(let i=start;i<end;i+=step)result.push(i);
  result.push(end); return result;
}

function meshAxes(f, ch, step) {
  const xs = axisSamples(ch.i0, ch.i1, step), zs = axisSamples(ch.j0, ch.j1, step), b = f.boundaryGrid;
  const include = (list, start, end, origin, base) => {
    for (let v = Math.ceil((origin + start * f.cell - base) / b.cell) * b.cell + base; v <= origin + end * f.cell; v += b.cell) list.push(Math.round((v - origin) / f.cell));
    return [...new Set(list)].sort((a, c) => a - c);
  };
  return [b && (ch.j0 === 0 || ch.j1 === f.nz - 1) ? include(xs, ch.i0, ch.i1, f.x0, b.x0) : xs,
    b && (ch.i0 === 0 || ch.i1 === f.nx - 1) ? include(zs, ch.j0, ch.j1, f.z0, b.z0) : zs];
}

const inside = (r, x, z) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;

// Compare each native vertex with the actual triangle split of a coarser mesh.
// A single spike on a ridge must count even when it lies between coarse vertices.
export function measureLodError(field, chunk, step) {
  return drain(lodErrorJob(field,chunk,step));
}
function drain(job) { let result; do {result=job.next();} while(!result.done); return result.value; }
function* lodErrorJob(field, chunk, step) {
  if(step===1)return 0;
  let error=0;
  const [xs,zs]=meshAxes(field,chunk,step);
  // One coarse cell at a time (its corners read once). A native vertex on a shared coarse edge belongs to the
  // cell after it, except on the chunk's last row / column.
  for(let zj=0;zj<zs.length-1;zj++){
    const b=zs[zj],jz=zs[zj+1],jEnd=zj===zs.length-2?jz:jz-1;
    for(let xi=0;xi<xs.length-1;xi++){
      const a=xs[xi],ix=xs[xi+1],iEnd=xi===xs.length-2?ix:ix-1;
      const h00=field.heightAt(a,b),h10=field.heightAt(ix,b),h01=field.heightAt(a,jz),h11=field.heightAt(ix,jz);
      for(let j=b;j<=jEnd;j++){
        const v=(j-b)/(jz-b);
        for(let i=a;i<=iEnd;i++){
          const u=(i-a)/(ix-a);
          const coarse=u+v<=1?h00+(h10-h00)*u+(h01-h00)*v:h11+(h01-h11)*(1-u)+(h10-h11)*(1-v);
          error=Math.max(error,Math.abs(field.heightAt(i,j)-coarse));
        }
      }
    }
    yield;
  }
  return error;
}

export class TerrainLOD {
  /**
   * @param field   height field (CoreField or BackdropField)
   * @param opts    { chunkCells, levels: [steps], distances: [m], clipInside?, normalField?, glacier?: bool }
   */
  constructor(scene, material, field, opts) {
    this.scene = scene; this.mat = material; this.f = field; this.o = opts;
    this.chunks = [];
    this.prepared = []; // bounded hidden meshes for a predicted flyby camera
    this.preparing = null;
    this.building = null; // the time-sliced mesh build in hand (see buildSliced)
    this.errorDeadline = Infinity; // LOD error measurements stop for this frame after it (time-sliced updates)
    this.frustum = new THREE.Frustum(); this.viewProjection = new THREE.Matrix4();
    const C = opts.chunkCells, ncx = Math.ceil((field.nx - 1) / C), ncz = Math.ceil((field.nz - 1) / C);
    for (let cj = 0; cj < ncz; cj++) for (let ci = 0; ci < ncx; ci++) {
      const i0 = ci * C, j0 = cj * C, i1 = Math.min(i0 + C, field.nx - 1), j1 = Math.min(j0 + C, field.nz - 1);
      const x0 = field.x0 + i0 * field.cell, x1 = field.x0 + i1 * field.cell, z0 = field.z0 + j0 * field.cell, z1 = field.z0 + j1 * field.cell, clip = opts.clipInside;
      if (clip && inside(clip,x0,z0) && inside(clip,x1,z1)) continue;
      const join = !!clip && x0 <= clip.x1 && x1 >= clip.x0 && z0 <= clip.z1 && z1 >= clip.z0;
      let mn = 1e9, mx = -1e9;
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const h = field.heightAt(i, j); mn = Math.min(mn, h); mx = Math.max(mx, h); }
      this.chunks.push({
        i0, j0, i1, j1, mn, mx, join, meshes: [], errors: [], level: -1,
        x0: field.x0 + i0 * field.cell, x1: field.x0 + i1 * field.cell, z0: field.z0 + j0 * field.cell, z1: field.z0 + j1 * field.cell,
      });
    }
    // Coarse far chunks (a few dozen triangles each) are drawn merged in groups of 4x4: one draw instead of 16
    this.groups = new Map();
    if (opts.mergeFrom !== undefined) for (const ch of this.chunks) {
      const key = Math.floor(ch.i0 / C / 4) + ',' + Math.floor(ch.j0 / C / 4);
      let g = this.groups.get(key); if (!g) this.groups.set(key, g = { chunks: [], mesh: null, dirty: true });
      g.chunks.push(ch); ch.group = g;
    }
    for (const ch of this.chunks) {
      ch.bounds=new THREE.Sphere(new THREE.Vector3((ch.x0+ch.x1)/2,(ch.mn+ch.mx)/2,(ch.z0+ch.z1)/2),Math.hypot(ch.x1-ch.x0,ch.mx-ch.mn,ch.z1-ch.z0)/2+300);
      this.setLevel(ch, ch.join ? 0 : opts.levels.length - 1);
    }
    this.mergeGroups();
  }

  vertexHeight(i, j) {
    return this.f.heightAt(i, j);
  }

  buildGeometry(ch, step) {
    return drain(this.geometryJob(ch,step));
  }
  *geometryJob(ch, step) {
    if (ch.join) step = this.o.levels[0];
    if(this.o.crevasses?.nearby(ch,8).length)return yield* buildCrevasseTerrainJob(this.f,ch,step,this.o.crevasses);
    const f = this.f, [xs,zs]=meshAxes(f,ch,step),ni=xs.length,nj=zs.length, clip=this.o.clipInside;
    const normalField=this.o.normalField || f;
    const normalHeight=(x,z)=>normalField.height ? normalField.height(x,z) : normalField.heightAt(Math.round((x-normalField.x0)/normalField.cell),Math.round((z-normalField.z0)/normalField.cell));
    const nv = ni * nj + 2 * (ni + nj);
    const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), gl = new Float32Array(nv), rk = new Float32Array(nv);
    const glacier = this.o.glacier ? f.glacier : null, rock = this.o.glacier ? f.rock : null;
    const put = (v, i, j, drop) => {
      i = Math.min(i, f.nx - 1); j = Math.min(j, f.nz - 1);
      const h = this.vertexHeight(i, j);
      if (drop && f.boundaryGrid) drop *= Math.min(1,Math.min(i,f.nx-1-i,j,f.nz-1-j)*f.cell/f.boundaryGrid.cell);
      if (drop && clip) drop *= Math.min(1,Math.hypot(Math.max(clip.x0-(f.x0+i*f.cell),0,(f.x0+i*f.cell)-clip.x1),Math.max(clip.z0-(f.z0+j*f.cell),0,(f.z0+j*f.cell)-clip.z1))/f.cell);
      pos[v * 3] = f.x0 + i * f.cell; pos[v * 3 + 1] = h - drop; pos[v * 3 + 2] = f.z0 + j * f.cell;
      const x=f.x0+i*f.cell,z=f.z0+j*f.cell;
      const span=f.normalSpan?.(x,z,Math.max(1,step>>1)*f.cell) || Math.max(1,step>>1)*f.cell;
      const nx = (normalHeight(x-span,z)-normalHeight(x+span,z))/(2*span);
      const nz = (normalHeight(x,z-span)-normalHeight(x,z+span))/(2*span);
      const l = Math.hypot(nx, 1, nz);
      nor[v * 3] = nx / l; nor[v * 3 + 1] = 1 / l; nor[v * 3 + 2] = nz / l;
      gl[v] = glacier ? glacier[j * f.nx + i] / 255 : 0;
      rk[v] = rock ? rock[j * f.nx + i] / 255 : 0;
    };
    for (let j = 0; j < nj; j++) {
      for (let i = 0; i < ni; i++) { put(j * ni + i, xs[i], zs[j], 0); if(i%64===63)yield; }
    }
    const idx = [];
    for (let j = 0; j < nj - 1; j++) for (let i = 0; i < ni - 1; i++) {
      if (clip && inside(clip,f.x0+(xs[i]+xs[i+1])*.5*f.cell,f.z0+(zs[j]+zs[j+1])*.5*f.cell)) continue;
      const a = j * ni + i, b = a + 1, c = a + ni, d = c + 1;
      idx.push(a, c, b, b, c, d);
      if(i%64===63)yield;
    }
    const depth = step * f.cell * 1.5 + 20;
    const edges = [
      [ni, (k) => [k, 0]], [nj, (k) => [ni - 1, k]], [ni, (k) => [ni - 1 - k, nj - 1]], [nj, (k) => [0, nj - 1 - k]],
    ];
    let base = ni * nj;
    for (const [edgeId, [n, e]] of edges.entries()) {
      const shared = f.boundaryGrid && [ch.j0===0,ch.i1===f.nx-1,ch.j1===f.nz-1,ch.i0===0][edgeId];
      for (let k = 0; k < n; k++) { const [i, j] = e(k); put(base + k, xs[i], zs[j], shared ? 0 : depth); }
      if (shared) { base += n; continue; }
      for (let k = 0; k < n - 1; k++) {
        const [i0, j0] = e(k), [i1, j1] = e(k + 1);
        if (clip && inside(clip,f.x0+(xs[i0]+xs[i1])*.5*f.cell,f.z0+(zs[j0]+zs[j1])*.5*f.cell)) continue;
        const t0 = j0 * ni + i0, t1 = j1 * ni + i1, s0 = base + k, s1 = base + k + 1;
        if (pos[t0*3+1]!==pos[s0*3+1]) idx.push(t0,s0,t1,t0,t1,s0);
        if (pos[t1*3+1]!==pos[s1*3+1]) idx.push(t1,s0,s1,t1,s1,s0);
      }
      base += n;
      yield;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('aGlacier', new THREE.BufferAttribute(gl, 1));
    g.setAttribute('aRock', new THREE.BufferAttribute(rk, 1));
    g.setIndex(nv > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
    g.computeBoundingSphere();
    // curvature lowers distant terrain in the shader: make the bounds generous so culling stays correct
    g.boundingSphere.radius += 300;
    return g;
  }

  ensureLevel(ch, lv) {
    if (!ch.meshes[lv] && this.building?.ch===ch && this.building.lv===lv) {
      const job=this.building;this.building=null;this.installGeometry(ch,lv,drain(job.iterator));
    }
    if (!ch.meshes[lv]) {
      const job=this.preparing;
      const geometry=job?.kind==='geometry' && job.ch===ch && job.lv===lv ? drain(job.iterator) : this.buildGeometry(ch,this.o.levels[lv]);
      if(job?.kind==='geometry' && job.ch===ch && job.lv===lv)this.preparing=null;
      this.installGeometry(ch,lv,geometry);
    }
    return ch.meshes[lv];
  }
  installGeometry(ch,lv,geometry) {
    if(ch.meshes[lv]){geometry.dispose();return;}
    const m=new THREE.Mesh(geometry,this.mat);
    m.receiveShadow=!!this.o.shadows;m.matrixAutoUpdate=false;m.visible=false;m.layers.enable(TERRAIN_LAYER);
    this.scene.add(m);ch.meshes[lv]=m;
  }

  setLevel(ch, lv) {
    this.ensureLevel(ch, lv);
    this.prepared = this.prepared.filter(p => p.ch !== ch || p.lv !== lv);
    if (ch.level >= 0 && ch.meshes[ch.level]) ch.meshes[ch.level].visible = false;
    if (ch.group && (this.merged(lv) || this.merged(ch.level))) ch.group.dirty = true;
    ch.meshes[lv].visible = !this.merged(lv); ch.level = lv;
  }
  merged(lv) { return this.o.mergeFrom !== undefined && lv >= this.o.mergeFrom; }

  /** Rebuild the merged mesh of each group whose coarse members changed: the same vertices, concatenated. */
  mergeGroups() {
    for (const g of this.groups.values()) {
      if (!g.dirty) continue;
      g.dirty = false;
      const parts = g.chunks.filter(ch => this.merged(ch.level)).map(ch => ch.meshes[ch.level].geometry);
      if (g.mesh) { this.scene.remove(g.mesh); g.mesh.geometry.dispose(); g.mesh = null; }
      if (!parts.length) continue;
      const geometry = mergeGeometries(parts);
      const m = new THREE.Mesh(geometry, this.mat);
      m.receiveShadow = !!this.o.shadows; m.matrixAutoUpdate = false; m.layers.enable(TERRAIN_LAYER);
      this.scene.add(m); g.mesh = m;
    }
  }

  /** Resume altitude-error/geometry jobs within a cooperative deadline, keeping future meshes hidden. */
  prepare(camera, view, { maxMeshes = 1, timeMs = 1.5, maxCached = 8 } = {}) {
    const start = performance.now();
    camera.updateMatrixWorld(true);
    this.viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.viewProjection);
    this.focalLength = view.height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    const candidates = this.chunks.filter(ch => this.frustum.intersectsSphere(ch.bounds))
      .sort((a, b) => a.bounds.center.distanceToSquared(camera.position) - b.bounds.center.distanceToSquared(camera.position));
    let built = 0, cursor=0;
    while(built<maxMeshes && performance.now()-start<timeMs) {
      if(this.preparing) {
        const job=this.preparing,result=job.iterator.next();
        if(result.done) {
          this.preparing=null;
          if(job.kind==='error')job.ch.errors[job.lv]=result.value;
          else {
            this.installGeometry(job.ch,job.lv,result.value);
            if(job.ch.level!==job.lv)this.prepared.push({ch:job.ch,lv:job.lv,until:performance.now()+8000});
            built++;
          }
        }
        continue;
      }
      const ch=candidates[cursor++];if(!ch)break;
      const p=camera.position;
      const distance=Math.hypot(Math.max(ch.x0-p.x,0,p.x-ch.x1),Math.max(ch.z0-p.z,0,p.z-ch.z1),Math.max(ch.mn-p.y,0,p.y-ch.mx)*.6);
      let lv=this.desiredLevel(ch,camera.position);
      while(lv>0) {
        if(ch.errors[lv]===undefined){this.preparing={kind:'error',ch,lv,iterator:lodErrorJob(this.f,ch,this.o.levels[lv])};cursor--;break;}
        if(ch.errors[lv]*this.focalLength/Math.max(4,distance)>view.pixelError)lv--;else break;
      }
      if(this.preparing)continue;
      if(ch.meshes[lv] || lv>=ch.level || (this.building?.ch===ch && this.building.lv===lv))continue;
      this.preparing={kind:'geometry',ch,lv,iterator:this.geometryJob(ch,this.o.levels[lv])};
    }
    while (this.prepared.length > maxCached) this.releasePrepared(this.prepared.shift());
    return { built, ms: performance.now() - start, cached: this.prepared.length };
  }
  cancelPrepare() { this.preparing?.iterator.return(); this.preparing=null; }
  releasePrepared({ ch, lv }) {
    if (ch.level === lv || !ch.meshes[lv]) return;
    this.scene.remove(ch.meshes[lv]); ch.meshes[lv].geometry.dispose(); ch.meshes[lv] = null;
  }

  desiredLevel(ch, p, view = null) {
    if (ch.join) return 0;
    const dx = Math.max(ch.x0 - p.x, 0, p.x - ch.x1), dz = Math.max(ch.z0 - p.z, 0, p.z - ch.z1);
    const dy = Math.max(ch.mn - p.y, 0, p.y - ch.mx);
    const d = Math.hypot(dx, dz, dy * 0.6), D = this.o.distances;
    let lv = 0; while (lv < D.length && d > D[lv]) lv++;
    lv=Math.min(lv, this.o.levels.length - 1);
    if(view){
      if(this.frustum.intersectsSphere(ch.bounds)){
        const focal=this.focalLength??view.height/(2*Math.tan(THREE.MathUtils.degToRad(view.camera.fov)/2));
        let deferred=false;
        const pixelError=level=>{
          const job=this.preparing;
          if(ch.errors[level]===undefined && job?.kind==='error' && job.ch===ch && job.lv===level){ch.errors[level]=drain(job.iterator);this.preparing=null;}
          if(ch.errors[level]===undefined){
            if(performance.now()>this.errorDeadline){deferred=true;return 0;}
            ch.errors[level]=measureLodError(this.f,ch,this.o.levels[level]);
          }
          return ch.errors[level]*focal/Math.max(4,d);
        };
        while(lv>0 && pixelError(lv)>view.pixelError)lv--;
        // Coarsening needs a margin in both distance and projected error.
        if(ch.level>=0 && lv>ch.level && (d<(D[ch.level]||Infinity)*1.1 || pixelError(lv)>view.pixelError*.75))lv=ch.level;
        // Out of time this frame for measuring errors: decide next frame, keeping the current mesh meanwhile.
        if(deferred && ch.level>=0)return ch.level;
      }
    }
    return lv;
  }

  /**
   * Advance the mesh build in hand for at most `timeMs`, then start the next ones while time remains. The chunk
   * keeps its current mesh until the new one is complete, so an expensive mesh (a crevasse collar takes
   * 50-150 ms) is spread over several frames instead of stalling one. Returns whether a mesh was installed.
   */
  buildSliced(todo, budget, timeMs) {
    const deadline = performance.now() + timeMs, wanted = (job) => todo.some(([lv, ch]) => ch === job.ch && lv === job.lv);
    const advance = (job) => { let r; do r = job.iterator.next(); while (!r.done && performance.now() < deadline); return r; };
    if (this.building && !wanted(this.building)) { this.building.iterator.return(); this.building = null; }
    let installed = 0;
    for (let k = 0; installed < budget && performance.now() < deadline; ) {
      if (!this.building) {
        while (k < todo.length && todo[k][1].meshes[todo[k][0]]) k++;
        if (k >= todo.length) break;
        const [lv, ch] = todo[k++];
        this.building = { ch, lv, iterator: this.geometryJob(ch, this.o.levels[lv]) };
      }
      const job = this.building, r = advance(job);
      if (!r.done) break;
      this.building = null; this.installGeometry(job.ch, job.lv, r.value); this.setLevel(job.ch, job.lv); installed++;
    }
    return installed;
  }

  /**
   * Returns the number of chunks still waiting for a finer mesh. Without `timeMs` up to `budget` meshes are built
   * at once (loading); with it, builds are time-sliced across frames (see buildSliced).
   */
  update(p, budget = 3, view = null, timeMs = Infinity) {
    const now = performance.now();
    this.prepared = this.prepared.filter(item => {
      if (now < item.until) return true;
      this.releasePrepared(item); return false;
    });
    if(view){view.camera.updateMatrixWorld(true);this.viewProjection.multiplyMatrices(view.camera.projectionMatrix,view.camera.matrixWorldInverse);this.frustum.setFromProjectionMatrix(this.viewProjection);
      this.focalLength=view.height/(2*Math.tan(THREE.MathUtils.degToRad(view.camera.fov)/2));}
    const todo = [];
    // Time-sliced: the nearest chunks get their LOD errors measured first
    let chunks = this.chunks;
    if (timeMs !== Infinity) {
      this.errorDeadline = performance.now() + timeMs;
      if (!this.byDistance || Math.hypot(p.x - this.sortedAt.x, p.z - this.sortedAt.z) > 64) {
        const dist = (ch) => (ch.bounds.center.x - p.x) ** 2 + (ch.bounds.center.z - p.z) ** 2;
        this.byDistance = this.chunks.map((ch) => [dist(ch), ch]).sort((a, b) => a[0] - b[0]).map((e) => e[1]);
        this.sortedAt = { x: p.x, z: p.z };
      }
      chunks = this.byDistance;
    }
    for (const ch of chunks) {
      const lv = this.desiredLevel(ch, p, view);
      if (lv === ch.level) continue;
      if (ch.meshes[lv]) this.setLevel(ch, lv); else todo.push([lv, ch]);
    }
    this.errorDeadline = Infinity;
    todo.sort((a, b) => a[0] - b[0]);
    if (timeMs === Infinity) for (let k = 0; k < Math.min(budget, todo.length); k++) this.setLevel(todo[k][1], todo[k][0]);
    else this.buildSliced(todo, budget, timeMs);
    // free detailed meshes that are no longer needed
    for (const ch of this.chunks) for (let lv = 0; lv < 2; lv++) {
      const m = ch.meshes[lv];
      if (m && ch.level > lv + 1 && !this.prepared.some(item => item.ch === ch && item.lv === lv)) { this.scene.remove(m); m.geometry.dispose(); ch.meshes[lv] = null; }
    }
    this.mergeGroups();
    return todo.length;
  }
}

/** Concatenate terrain chunk geometries (indexed or not) into one indexed geometry with the same vertices. */
function mergeGeometries(parts) {
  const names = ['position', 'normal', 'aGlacier', 'aRock'];
  let vertices = 0, indices = 0;
  for (const g of parts) { vertices += g.attributes.position.count; indices += g.index ? g.index.count : g.attributes.position.count; }
  const out = new THREE.BufferGeometry(), index = vertices > 65535 ? new Uint32Array(indices) : new Uint16Array(indices);
  for (const name of names) {
    const size = parts[0].attributes[name].itemSize, data = new Float32Array(vertices * size);
    let o = 0; for (const g of parts) { data.set(g.attributes[name].array, o); o += g.attributes[name].array.length; }
    out.setAttribute(name, new THREE.BufferAttribute(data, size));
  }
  let base = 0, k = 0;
  for (const g of parts) {
    const n = g.attributes.position.count;
    if (g.index) for (const v of g.index.array) index[k++] = v + base; else for (let v = 0; v < n; v++) index[k++] = v + base;
    base += n;
  }
  out.setIndex(new THREE.BufferAttribute(index, 1));
  out.computeBoundingSphere();
  out.boundingSphere.radius += 300;   // the curvature lowers distant terrain in the shader (as for every chunk)
  return out;
}

export function coreTerrainOptions() {
  return { chunkCells: TERRAIN.chunkCells, levels: [1, 2, 4, 8, 16, 32, 64], distances: TERRAIN.lodDistances, glacier: true, shadows: true, mergeFrom: 4 };
}
export function backdropTerrainOptions(core) {
  return { chunkCells: TERRAIN.backdropChunkCells, levels: [1, 2, 4], distances: [12000, 30000], clipInside: core, normalField: core };
}
