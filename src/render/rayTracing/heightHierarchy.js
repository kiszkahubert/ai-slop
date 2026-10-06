// Conservative height bounds. Shared by the worker, CPU reference tests and GPU traversal.
export function buildHeightHierarchy(field, block = 4) {
  const levels = [], nx = field.nx, nz = field.nz;
  let width = Math.ceil((nx - 1) / block), height = Math.ceil((nz - 1) / block);
  let data = new Float32Array(width * height * 2);
  for (let z = 0; z < height; z++) for (let x = 0; x < width; x++) {
    let min = Infinity, max = -Infinity;
    for (let j = z * block; j <= Math.min((z + 1) * block, nz - 1); j++) {
      for (let i = x * block; i <= Math.min((x + 1) * block, nx - 1); i++) {
        const h = field.h[j * nx + i]; min = Math.min(min, h); max = Math.max(max, h);
      }
    }
    const k = (z * width + x) * 2; data[k] = min; data[k + 1] = max;
  }
  while (true) {
    levels.push({ width, height, data });
    if (width === 1 && height === 1) break;
    const w = Math.ceil(width / 2), h = Math.ceil(height / 2), next = new Float32Array(w * h * 2);
    for (let z = 0; z < h; z++) for (let x = 0; x < w; x++) {
      let min = Infinity, max = -Infinity;
      for (let j = z * 2; j < Math.min(z * 2 + 2, height); j++) for (let i = x * 2; i < Math.min(x * 2 + 2, width); i++) {
        const k = (j * width + i) * 2; min = Math.min(min, data[k]); max = Math.max(max, data[k + 1]);
      }
      next[(z * w + x) * 2] = min; next[(z * w + x) * 2 + 1] = max;
    }
    width = w; height = h; data = next;
  }
  const atlasWidth = levels[0].width, atlasHeight = levels.reduce((n, l) => n + l.height, 0);
  const atlas = new Float32Array(atlasWidth * atlasHeight * 2), offsets = [];
  let row = 0;
  for (const l of levels) {
    offsets.push([l.width, l.height, row, 0]);
    for (let z = 0; z < l.height; z++) atlas.set(l.data.subarray(z * l.width * 2, (z + 1) * l.width * 2), (row + z) * atlasWidth * 2);
    row += l.height;
  }
  return { atlas, width: atlasWidth, height: atlasHeight, offsets, block };
}

export function triangleHit(origin, direction, a, b, c, near = 0, far = Infinity) {
  const sub = (p, q) => p.map((v, i) => v - q[i]);
  const cross = (p, q) => [p[1]*q[2]-p[2]*q[1], p[2]*q[0]-p[0]*q[2], p[0]*q[1]-p[1]*q[0]];
  const dot = (p, q) => p.reduce((s, v, i) => s + v*q[i], 0);
  const e1 = sub(b, a), e2 = sub(c, a), p = cross(direction, e2), det = dot(e1, p);
  if (Math.abs(det) < 1e-10) return null;
  const t = sub(origin, a), u = dot(t, p) / det;
  if (u < -1e-7 || u > 1 + 1e-7) return null;
  const q = cross(t, e1), v = dot(direction, q) / det;
  if (v < -1e-7 || u + v > 1 + 1e-7) return null;
  const distance = dot(e2, q) / det;
  return distance >= near && distance <= far ? distance : null;
}

export function referenceHeightHit(field, origin, direction, near = 0, far = Infinity) {
  let hit = null;
  const point = (i, j) => [field.x0 + i*field.cell, field.h[j*field.nx+i], field.z0 + j*field.cell];
  for (let j = 0; j < field.nz - 1; j++) for (let i = 0; i < field.nx - 1; i++) {
    const a = point(i,j), b = point(i+1,j), c = point(i,j+1), d = point(i+1,j+1);
    for (const tri of [[a,c,b], [b,c,d]]) {
      const t = triangleHit(origin, direction, ...tri, near, hit ?? far); if (t !== null) hit = t;
    }
  }
  return hit;
}
