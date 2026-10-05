import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createCampModels } from '../../src/render/campModels.js';
import { CampVisuals, campDetailLevel } from '../../src/render/campVisuals.js';
import { QUALITY_PRESETS } from '../../src/render/quality.js';
import { createCampSurface } from '../../src/render/campTextures.js';

test('camp shells and equipment have finite, textured geometry with cheaper distant versions', () => {
  const models = createCampModels();
  for (const [kind, versions] of Object.entries(models)) {
    const counts = [];
    for (const model of versions) {
      let count = 0;
      for (const part of model.parts) {
        for (const attr of Object.values(part.geometry.attributes)) assert.ok(attr.array.every(Number.isFinite), `${kind}: invalid attribute`);
        assert.equal(part.geometry.attributes.uv.count, part.geometry.attributes.position.count);
        const p = part.geometry.attributes.position, uv = part.geometry.attributes.uv;
        for (let i = 0; i < p.count; i += 3) {
          const a = new THREE.Vector3().fromBufferAttribute(p, i), b = new THREE.Vector3().fromBufferAttribute(p, i + 1), c = new THREE.Vector3().fromBufferAttribute(p, i + 2);
          const area = b.sub(a).cross(c.sub(a)).lengthSq();
          const uvArea = (uv.getX(i + 1) - uv.getX(i)) * (uv.getY(i + 2) - uv.getY(i)) - (uv.getY(i + 1) - uv.getY(i)) * (uv.getX(i + 2) - uv.getX(i));
          if (area > 1e-10) assert.ok(Math.abs(uvArea) > 1e-10, `${kind}: collapsed UVs break tangent-space normals`);
        }
        assert.ok(part.geometry.boundingSphere.radius > 0);
        count += part.geometry.attributes.position.count; part.geometry.dispose();
      }
      counts.push(count);
    }
    assert.ok(counts[0] < counts[1], `${kind}: distant model must be cheaper`);
  }
});

test('detail hysteresis prevents repeated switches around the threshold', () => {
  assert.equal(campDetailLevel(79, 0, 80), 0);
  assert.equal(campDetailLevel(71, 0, 80), 1);
  assert.equal(campDetailLevel(85, 1, 80), 1);
  assert.equal(campDetailLevel(89, 1, 80), 0);
});

test('camp texture bytes are deterministic and color/data maps use the right color spaces', () => {
  const a = createCampSurface('fabric', 32), b = createCampSurface('fabric', 32);
  assert.deepEqual(a.map.image.data, b.map.image.data);
  assert.equal(a.map.colorSpace, THREE.SRGBColorSpace);
  assert.equal(a.normalMap.colorSpace, THREE.NoColorSpace);
  assert.equal(a.roughnessMap.colorSpace, THREE.NoColorSpace);
  assert.ok(new Set(a.map.image.data).size > 8);
  for (const t of [...Object.values(a), ...Object.values(b)]) t.dispose();
});

test('quality changes keep placements, ground anchors and shared batches stable, releasing replaced maps', () => {
  const scene = new THREE.Scene(), field = { height: (x, z) => 5000 + x * 0.08 + z * 0.03 };
  const visual = new CampVisuals(scene, field, { quality: QUALITY_PRESETS.low });
  const a = visual.add('sleep', { x: 20, z: 10, rot: 0.6, color: 0xf5b301, id: 'tent' });
  visual.add('sleep', { x: 24, z: 10, id: 'neighbor' });
  visual.finish();
  for (const guy of a.guys) {
    const p = new THREE.Vector3().setFromMatrixPosition(guy.peg);
    assert.ok(Math.abs(p.y - field.height(p.x, p.z) - 0.065) < 1e-8, 'anchors follow the support terrain');
  }
  const placement = a.matrix.elements.slice(), camera = new THREE.PerspectiveCamera();
  camera.position.set(20, a.y + 2, 12); visual.update(camera);
  assert.equal(a.level, 1);
  const batches = visual.stats().batches;
  let disposed = 0;
  for (const t of Object.values(visual.textures).flatMap(Object.values)) t.addEventListener('dispose', () => disposed++);
  for (const q of [QUALITY_PRESETS.medium, QUALITY_PRESETS.high, QUALITY_PRESETS.low]) {
    visual.applyQuality(q); visual.update(camera, true);
    assert.deepEqual(a.matrix.elements, placement);
    assert.equal(visual.stats().textures, 15);
    assert.equal(visual.stats().batches, batches);
  }
  assert.equal(disposed, 15);
  camera.position.set(500, a.y + 2, 500); visual.update(camera);
  assert.equal(a.level, 0);
  assert.equal(visual.root.children.filter((m) => m.visible && m.name.includes('/1/')).length, 0);
  visual.dispose(); visual.dispose();
  assert.equal(scene.children.length, 0);
  assert.equal(visual.stats().textures, 0);
});
