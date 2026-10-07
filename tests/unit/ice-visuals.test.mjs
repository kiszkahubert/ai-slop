import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { iceTowerGeometry, iceFaceUVs } from '../../src/render/iceGeometry.js';
import { createGlacierIceTextures } from '../../src/render/proceduralTextures.js';
import { IceVisuals } from '../../src/render/iceVisuals.js';
import { SceneCatalog } from '../../src/render/rayTracing/catalog.js';
import { patchRayTracingMaterial, captureMaterial } from '../../src/render/rayTracing/materials.js';
import { iceGroundHeight, iceGroundDescriptor, prepareIceGround } from '../../src/render/iceGround.js';
import { buildRegion } from '../../src/render/rayTracing/worker.js';
import { createTerrainMaterial } from '../../src/world/terrainMaterial.js';

test('glacier blocks are closed, consistently wound surfaces with noncollapsed face UVs', () => {
  for (const seed of [1, 2, 3, ...Array.from({ length: 24 }, (_, i) => i + 11)]) {
    const g = iceTowerGeometry(seed), p = g.attributes.position, uv = g.attributes.uv, vertices = new Map(), edges = new Map();
    const key = i => [p.getX(i), p.getY(i), p.getZ(i)].join(',');
    let volume = 0;
    for (const attr of Object.values(g.attributes)) assert.ok(attr.array.every(Number.isFinite));
    for (let i = 0; i < p.count; i += 3) {
      const points = [0, 1, 2].map(k => new THREE.Vector3().fromBufferAttribute(p, i + k));
      const [a, b, c] = points;
      assert.ok(b.clone().sub(a).cross(c.clone().sub(a)).lengthSq() > 1e-8, `seed ${seed}: degenerate face`);
      const uvArea = (uv.getX(i + 1) - uv.getX(i)) * (uv.getY(i + 2) - uv.getY(i)) - (uv.getY(i + 1) - uv.getY(i)) * (uv.getX(i + 2) - uv.getX(i));
      assert.ok(Math.abs(uvArea) > 1e-6, `seed ${seed}: collapsed UVs`);
      volume += a.dot(b.clone().cross(c)) / 6;
      for (let k = 0; k < 3; k++) {
        const from = key(i + k), to = key(i + (k + 1) % 3), edge = [from, to].sort().join('|');
        vertices.set(from, true);
        if (!edges.has(edge)) edges.set(edge, []);
        edges.get(edge).push(from < to ? 1 : -1);
      }
    }
    for (const directions of edges.values()) assert.deepEqual(directions.slice().sort(), [-1, 1], `seed ${seed}: open or reversed edge`);
    assert.equal(vertices.size - edges.size + p.count / 3, 2, 'one closed surface');
    assert.ok(volume > 1, 'outward winding encloses positive volume');
    assert.equal(g.boundingBox.min.y, 0);
    assert.ok(g.boundingBox.max.y < 1.06 && g.boundingBox.max.y >= 0.99);
    const same = iceTowerGeometry(seed);
    assert.deepEqual(g.attributes.position.array, same.attributes.position.array); same.dispose();
    g.dispose();
  }
});

test('Icefall UV repair preserves its original positions and supplies every triangle with UV area', () => {
  const g = new THREE.IcosahedronGeometry(1, 1), before = g.attributes.position.array.slice();
  iceFaceUVs(g, [2, 4, 2]);
  assert.deepEqual(g.attributes.position.array, before);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i += 3) {
    const area = (uv.getX(i + 1) - uv.getX(i)) * (uv.getY(i + 2) - uv.getY(i)) - (uv.getY(i + 1) - uv.getY(i)) * (uv.getX(i + 2) - uv.getX(i));
    assert.ok(Math.abs(area) > 1e-6);
  }
  g.dispose();
});

test('ice textures are deterministic, periodic PBR data with visible colour and roughness variation', () => {
  const a = createGlacierIceTextures(128, 4), b = createGlacierIceTextures(128, 4);
  assert.equal(a.map.colorSpace, THREE.SRGBColorSpace);
  assert.equal(a.normalMap.colorSpace, THREE.NoColorSpace);
  assert.equal(a.roughnessMap.colorSpace, THREE.NoColorSpace);
  for (const name of Object.keys(a)) {
    const t = a[name], bytes = t.image.data, size = t.image.width;
    assert.deepEqual(bytes, b[name].image.data);
    assert.equal(t.wrapS, THREE.RepeatWrapping); assert.equal(t.wrapT, THREE.RepeatWrapping);
    assert.ok(t.generateMipmaps); assert.equal(t.anisotropy, 4);
    const tones = new Set(); for (let i = 0; i < bytes.length; i += 4) tones.add(bytes[i]);
    assert.ok(tones.size > (name === 'map' ? 8 : 20), `${name}: surface has no readable variation`);
    // The wrap is another adjacent sample, not a discontinuity larger than internal gradients.
    for (const vertical of [false, true]) {
      let edge = 0, interior = 0;
      const at = (x, y) => bytes[(y * size + x) * 4];
      for (let line = 0; line < size; line++) {
        edge += Math.abs(vertical ? at(line, 0) - at(line, size - 1) : at(0, line) - at(size - 1, line));
        for (let cell = 1; cell < size; cell++) interior += Math.abs(vertical ? at(line, cell) - at(line, cell - 1) : at(cell, line) - at(cell - 1, line));
      }
      assert.ok(edge / size < interior / (size * (size - 1)) * 2.5, `${name}: texture wrap seam`);
    }
  }
  const n = a.normalMap.image.data;
  for (let i = 0; i < n.length; i += 4) {
    const length = Math.hypot(...[0, 1, 2].map(c => n[i + c] / 255 * 2 - 1));
    assert.ok(Math.abs(length - 1) < 0.015); assert.equal(n[i + 3], a.roughnessMap.image.data[i + 1]);
  }
  for (const texture of [...Object.values(a), ...Object.values(b)]) texture.dispose();
});

test('quality replaces shared maps once and disposal releases each owned resource once', () => {
  const v = new IceVisuals({ quality: { textureSize: 32 }, anisotropy: 4 }), materials = Object.values(v.materials);
  const catalog = new SceneCatalog(new THREE.Scene(), {});
  let disposed = 0, materialDisposals = 0;
  for (const mat of materials) mat.addEventListener('dispose', () => materialDisposals++);
  for (const size of [64, 128, 32]) {
    const previous = v.textures;
    for (const t of Object.values(previous)) t.addEventListener('dispose', () => disposed++);
    for (const mat of materials) assert.equal(catalog.layer(mat.map, mat), 1);
    v.applyQuality({ textureSize: size });
    assert.equal(v.size, size);
    for (const mat of materials) for (const name of ['map', 'normalMap', 'roughnessMap']) assert.equal(mat[name], v.textures[name]);
    const maps = v.textures; v.applyQuality({ textureSize: size }); assert.equal(v.textures, maps);
    for (const mat of materials) { assert.equal(mat.metalness, 0); assert.equal(mat.emissive.getHex(), 0); assert.equal(mat.transparent, false); }
    catalog.arrayCount = 1; catalog.invalidateTextures(); assert.equal(catalog.arrayCount, -1);
    assert.equal(catalog.materialTextures[0], v.textures.map); assert.equal(catalog.textureLayers.size, 1);
  }
  assert.equal(disposed, 9); assert.equal(catalog.materialTextures.length, 1);
  for (const t of Object.values(v.textures)) t.addEventListener('dispose', () => disposed++);
  v.dispose(); v.dispose(); v.applyQuality({ textureSize: 64 });
  assert.equal(disposed, 12); assert.equal(materialDisposals, 2); assert.equal(v.stats().textures, 0);
});

test('ice surface and capture preserve texture maps and compose the existing lighting shaders', () => {
  const v = new IceVisuals({ quality: { textureSize: 32 } }), m = v.materials.tower;
  patchRayTracingMaterial(m);
  const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
  m.onBeforeCompile(shader);
  assert.ok(shader.vertexShader.includes('instanceMatrix * sharedWorldPos'));
  assert.ok(shader.fragmentShader.includes('rtPrepare(vSharedWorld,rtN)'));
  const capture = captureMaterial(m, true, new THREE.Vector3());
  assert.equal(capture.map, m.map); assert.equal(capture.normalMap, m.normalMap); assert.equal(capture.roughnessMap, m.roughnessMap);
  const captureShader = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
  capture.onBeforeCompile(captureShader);
  assert.ok(captureShader.fragmentShader.includes('outNormal=vec4('));
  capture.dispose(); v.dispose();
});

test('ice feet sample the local sloping ground without changing geometry or instance transforms', () => {
  const field = { x0: 0, z0: 0, nx: 2, nz: 2, cell: 100,
    height: (x, z) => 5312 + x * 0.12 - z * 0.08, glacierAt: () => 0.8, rock: new Uint8Array([64, 64, 64, 64]),
    slope: () => ({ gx: 0.12, gz: -0.08 }) };
  const geo = iceTowerGeometry(2), mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial(), 2);
  const matrix = new THREE.Matrix4().compose(new THREE.Vector3(20, 5312, 30),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.7), new THREE.Vector3(4, 12, 5));
  mesh.setMatrixAt(0, matrix); mesh.setMatrixAt(1, new THREE.Matrix4().makeScale(2, 3, 2));
  const positions = geo.attributes.position.array.slice(), transforms = mesh.instanceMatrix.array.slice();
  prepareIceGround(mesh, field); prepareIceGround(mesh, field);
  assert.deepEqual(geo.attributes.position.array, positions); assert.deepEqual(mesh.instanceMatrix.array, transforms);
  const heights = geo.attributes.iceGroundHeights.array.subarray(0, 4), p = new THREE.Vector3();
  for (const [x, z] of [[0, 0], [-0.8, 0.4], [0.7, -0.7], [1, -1]]) {
    p.set(x, 0, z).applyMatrix4(matrix);
    assert.ok(Math.abs(iceGroundHeight(heights, x, z) - field.height(p.x, p.z)) < 0.0005, 'fade must follow the sloping footprint');
  }
  const params = geo.attributes.iceGroundParams;
  assert.ok(Math.abs(params.getZ(0) - 2.88) < 1e-5); assert.ok(Math.abs(params.getZ(1) - 1.4) < 1e-5);
  assert.ok(Math.abs(params.getY(0) - 64 / 255) < 1e-6); assert.equal(params.getW(0) % 1, 0);
  const descriptor = iceGroundDescriptor(mesh, matrix, 0);
  assert.ok(descriptor.iceGround.every(Number.isFinite));
  for (let i = 0; i < geo.attributes.position.count; i++) {
    p.fromBufferAttribute(geo.attributes.position, i).applyMatrix4(matrix);
    assert.ok(Math.abs(descriptor.iceGround[i * 4] - (p.y - iceGroundHeight(heights, geo.attributes.position.getX(i), geo.attributes.position.getZ(i)))) < 1e-5);
  }
  geo.dispose(); mesh.material.dispose();
});

test('traced ice preserves ground parameters, map layer and UVs through indexed seams', () => {
  const field = { x0: 0, z0: 0, nx: 2, nz: 2, cell: 4, h: new Float32Array(4).fill(5312) };
  const mesh = { position: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0]),
    index: new Uint16Array([0, 1, 2, 3, 2, 1]), color: [1, 1, 1, 3], uv: new Float32Array([0, 0, 1, 0, 0, 1, 0.5, 0.5]),
    iceGround: new Float32Array([0.1, 1, 0.2, 3, 0.2, 1, 0.2, 3, 1, 1, 0.2, 3, 0.1, 1, 0.2, 3]),
    iceGroundNormal: 528, matrix: new THREE.Matrix4().makeTranslation(20, 5312, 20).toArray() };
  const s = buildRegion(field, [0, 0], [mesh]), found = [];
  assert.equal(s.uv.length, s.position.length / 3 * 4);
  for (let i = 0; i < s.color.length / 4; i++) if (s.color[i * 4 + 3] < -1.5) {
    const c = Array.from(s.color.subarray(i * 4, i * 4 + 4)), uv = Array.from(s.uv.subarray(i * 4, i * 4 + 4));
    assert.equal(c[3], -4); assert.equal(-c[3] - 2, 2, 'texture array layer must remain 2');
    assert.equal(c[1], 1); assert.ok(Math.abs(c[2] - 0.2) < 1e-6); assert.equal(uv[2], 3); assert.equal(uv[3], 528);
    found.push(uv.slice(0, 2));
  }
  assert.deepEqual(found.sort(), [[0, 0], [0, 1], [0.5, 0.5], [1, 0]].sort());
});

test('ice borrows current terrain uniforms and composes ground blending with traced and capture shaders', () => {
  const terrain = createTerrainMaterial({ layers: { albedo: null, surface: null, size: 32 }, macroNoise: null, relief: null });
  const v = new IceVisuals({ quality: { textureSize: 32 }, field: {}, terrainMaterial: terrain }), m = v.materials.tower;
  patchRayTracingMaterial(m);
  const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
  m.onBeforeCompile(shader);
  assert.equal(shader.uniforms.uAlbedo, terrain.userData.uniforms.uAlbedo);
  assert.equal(shader.uniforms.uSurface, terrain.userData.uniforms.uSurface);
  terrain.userData.uniforms.uAlbedo.value = 'replacement'; assert.equal(shader.uniforms.uAlbedo.value, 'replacement');
  assert.ok(shader.vertexShader.includes('iceGroundHeights')); assert.ok(shader.fragmentShader.includes('iceGroundWeight(iceBase'));
  assert.ok(shader.fragmentShader.includes('roughness*texture2D(normalMap,vNormalMapUv).a'));
  assert.ok(!shader.fragmentShader.includes('#include <roughnessmap_fragment>'), 'roughness must share the normal sampler within the GPU limit');
  assert.ok(shader.fragmentShader.includes('rtPrepare(vSharedWorld,rtN)'));
  const capture = captureMaterial(m, true, new THREE.Vector3()), sh = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
  capture.onBeforeCompile(sh); assert.ok(sh.fragmentShader.includes('outNormal=vec4(')); assert.ok(sh.vertexShader.includes('iceGroundParams'));
  v.applyQuality({ textureSize: 64, exactGradients: true }); assert.equal(m.defines.TERRAIN_GRAD, 1);
  let borrowedDisposed = 0;
  terrain.userData.uniforms.uAlbedo.value = { dispose: () => borrowedDisposed++ };
  capture.dispose(); v.dispose(); assert.equal(borrowedDisposed, 0, 'terrain maps belong to terrain, not ice'); terrain.dispose();
});
