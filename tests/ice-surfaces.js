return (async () => {
  const s = __sim, g = s.game, THREE = await import('three'), assert = (ok, message) => { if (!ok) throw Error(message); };
  const owner = g.world.iceVisuals, meshes = [], placements = [], geometries = [];
  s.scene.traverse(o => { if (o.userData.iceFormation) meshes.push(o); });
  assert(meshes.length === 4, 'Three tower batches and one Icefall batch must remain instanced');
  for (const mesh of meshes) {
    assert(mesh.isInstancedMesh && mesh.castShadow && mesh.receiveShadow, 'Ice lost instancing or shadows');
    assert(mesh.material.userData.iceBlend && mesh.geometry.attributes.iceGroundHeights && mesh.geometry.attributes.iceGroundParams, 'Ice ground contact data is missing');
    assert(mesh.geometry.attributes.iceGroundParams.array.every(Number.isFinite), 'Ground fade parameters are invalid');
    placements.push(mesh.instanceMatrix.array.slice()); geometries.push(mesh.geometry.attributes.position.array.slice());
  }
  const { SceneCatalog } = await import('/src/render/rayTracing/catalog.js');
  const catalog = new SceneCatalog(s.scene, g.world), matrix = new THREE.Matrix4(), first = meshes[0];
  first.getMatrixAt(0, matrix);
  const descriptor = catalog.descriptor(first.geometry, first.material, matrix, undefined, first, 0);
  assert(descriptor.color[3] === 1 && descriptor.uv.length > 0, 'Ice albedo or UVs missing from the traced scene');
  assert(descriptor.iceGround?.length === descriptor.position.length / 3 * 4, 'Traced ice has no ground blend');
  const initial = catalog.makeTextureArray(); let disposed = 0;
  initial.addEventListener('dispose', () => disposed++);
  const sizes = [];
  for (const name of ['low', 'high', 'medium', 'low', 'medium']) {
    s.setQuality(name); catalog.invalidateTextures();
    await new Promise(requestAnimationFrame);
    const tex = catalog.makeTextureArray();
    assert(tex !== initial, 'Traced albedo stayed stale after a texture replacement');
    assert(catalog.materialTextures[0] === first.material.map, 'Traced catalogue retained a disposed ice map');
    assert(catalog.materialTextures.length === 1 && catalog.textureLayers.size === 1, 'Quality change leaked texture layers');
    for (let i = 0; i < meshes.length; i++) {
      const mesh = meshes[i], mat = mesh.material;
      assert(mesh.instanceMatrix.array.every((v, k) => v === placements[i][k]), 'Quality change moved an ice formation');
      assert(mesh.geometry.attributes.position.array.every((v, k) => v === geometries[i][k]), 'Quality change altered geometry');
      assert(mat.map === owner.textures.map && mat.normalMap === owner.textures.normalMap && mat.roughnessMap === owner.textures.roughnessMap, 'Ice textures are not shared');
      assert(mat.map.image.width === owner.size, 'Wrong ice texture resolution');
      const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
      mat.onBeforeCompile(shader);
      assert(shader.uniforms.uAlbedo === owner.terrainUniforms.uAlbedo && shader.uniforms.uSurface === owner.terrainUniforms.uSurface, 'Ground textures became stale after changing quality');
    }
    // Verify the rebuilt byte array contains the current ice map, using the same canvas resampling as the catalogue.
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = owner.size;
    const ctx = canvas.getContext('2d'); ctx.putImageData(new ImageData(new Uint8ClampedArray(owner.textures.map.image.data), owner.size, owner.size), 0, 0);
    const reduced = document.createElement('canvas'); reduced.width = reduced.height = 256;
    const small = reduced.getContext('2d'); small.drawImage(canvas, 0, 0, 256, 256);
    const expected = small.getImageData(0, 0, 256, 256).data, actual = tex.image.data;
    assert(expected.every((v, i) => v === actual[i]), 'Traced texture pixels differ from the current surface');
    sizes.push({ quality: name, textureSize: owner.size });
  }
  assert(disposed === 1, 'Replaced traced array was not released once'); catalog.dispose();
  return { pass: true, towers: meshes.filter(o => o.userData.iceFormation === 'camp').reduce((n, o) => n + o.count, 0), seracs: meshes.find(o => o.userData.iceFormation === 'icefall').count, sizes };
})();
