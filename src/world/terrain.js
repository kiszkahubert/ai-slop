// Chunked level-of-detail terrain. Each chunk keeps one mesh per LOD level it has needed;
// skirts hide cracks between neighbours at different levels.
import * as THREE from 'three';
import { TERRAIN } from '../config.js';
import { buildCrevasseTerrain } from './crevasseTerrain.js';
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
  if(step===1)return 0;
  let error=0, zj=0;
  const [xs,zs]=meshAxes(field,chunk,step);
  for(let j=chunk.j0;j<=chunk.j1;j++)for(let i=chunk.i0;i<=chunk.i1;i++){
    while(zj<zs.length-2 && j>=zs[zj+1])zj++;
    let xi=Math.min(Math.floor((i-chunk.i0)/step),xs.length-2);
    while(xi>0 && i<xs[xi])xi--;
    while(xi<xs.length-2 && i>=xs[xi+1])xi++;
    const a=xs[xi],b=zs[zj],ix=xs[xi+1],jz=zs[zj+1],u=(i-a)/(ix-a),v=(j-b)/(jz-b);
    const h00=field.heightAt(a,b),h10=field.heightAt(ix,b),h01=field.heightAt(a,jz),h11=field.heightAt(ix,jz);
    const coarse=u+v<=1?h00+(h10-h00)*u+(h01-h00)*v:h11+(h01-h11)*(1-u)+(h10-h11)*(1-v);
    error=Math.max(error,Math.abs(field.heightAt(i,j)-coarse));
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
    for (const ch of this.chunks) {
      ch.bounds=new THREE.Sphere(new THREE.Vector3((ch.x0+ch.x1)/2,(ch.mn+ch.mx)/2,(ch.z0+ch.z1)/2),Math.hypot(ch.x1-ch.x0,ch.mx-ch.mn,ch.z1-ch.z0)/2+300);
      this.setLevel(ch, ch.join ? 0 : opts.levels.length - 1);
    }
  }

  vertexHeight(i, j) {
    return this.f.heightAt(i, j);
  }

  buildGeometry(ch, step) {
    if (ch.join) step = this.o.levels[0];
    if(this.o.crevasses?.nearby(ch,8).length)return buildCrevasseTerrain(this.f,ch,step,this.o.crevasses);
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
    for (let j = 0; j < nj; j++) for (let i = 0; i < ni; i++) put(j * ni + i, xs[i], zs[j], 0);
    const idx = [];
    for (let j = 0; j < nj - 1; j++) for (let i = 0; i < ni - 1; i++) {
      if (clip && inside(clip,f.x0+(xs[i]+xs[i+1])*.5*f.cell,f.z0+(zs[j]+zs[j+1])*.5*f.cell)) continue;
      const a = j * ni + i, b = a + 1, c = a + ni, d = c + 1;
      idx.push(a, c, b, b, c, d);
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

  setLevel(ch, lv) {
    if (!ch.meshes[lv]) {
      const m = new THREE.Mesh(this.buildGeometry(ch, this.o.levels[lv]), this.mat);
      m.receiveShadow = !!this.o.shadows; m.matrixAutoUpdate = false; m.visible = false; m.layers.enable(TERRAIN_LAYER);
      this.scene.add(m); ch.meshes[lv] = m;
    }
    if (ch.level >= 0 && ch.meshes[ch.level]) ch.meshes[ch.level].visible = false;
    ch.meshes[lv].visible = true; ch.level = lv;
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
        const pixelError=level=>{
          ch.errors[level] ??= measureLodError(this.f,ch,this.o.levels[level]);
          return ch.errors[level]*focal/Math.max(4,d);
        };
        while(lv>0 && pixelError(lv)>view.pixelError)lv--;
        // Coarsening needs a margin in both distance and projected error.
        if(ch.level>=0 && lv>ch.level && (d<(D[ch.level]||Infinity)*1.1 || pixelError(lv)>view.pixelError*.75))lv=ch.level;
      }
    }
    return lv;
  }

  /** returns the number of chunks still waiting for a finer mesh */
  update(p, budget = 3, view = null) {
    if(view){view.camera.updateMatrixWorld(true);this.viewProjection.multiplyMatrices(view.camera.projectionMatrix,view.camera.matrixWorldInverse);this.frustum.setFromProjectionMatrix(this.viewProjection);
      this.focalLength=view.height/(2*Math.tan(THREE.MathUtils.degToRad(view.camera.fov)/2));}
    const todo = [];
    for (const ch of this.chunks) {
      const lv = this.desiredLevel(ch, p, view);
      if (lv === ch.level) continue;
      if (ch.meshes[lv]) this.setLevel(ch, lv); else todo.push([lv, ch]);
    }
    todo.sort((a, b) => a[0] - b[0]);
    for (let k = 0; k < Math.min(budget, todo.length); k++) this.setLevel(todo[k][1], todo[k][0]);
    // free detailed meshes that are no longer needed
    for (const ch of this.chunks) for (let lv = 0; lv < 2; lv++) {
      const m = ch.meshes[lv];
      if (m && ch.level > lv + 1) { this.scene.remove(m); m.geometry.dispose(); ch.meshes[lv] = null; }
    }
    return todo.length;
  }
}

export function coreTerrainOptions() {
  return { chunkCells: TERRAIN.chunkCells, levels: [1, 2, 4, 8, 16, 32, 64], distances: TERRAIN.lodDistances, glacier: true, shadows: true };
}
export function backdropTerrainOptions(core) {
  return { chunkCells: TERRAIN.backdropChunkCells, levels: [1, 2, 4], distances: [12000, 30000], clipInside: core, normalField: core };
}
