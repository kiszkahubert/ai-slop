// Actual loaded camps: shared maps, quality switching, anchored lines, LOD and simulation boundaries.
return (async () => {
  const W = window.__sim, g = W.game, THREE = await import('three'), v = g.world.campVisuals;
  const snapshot = () => JSON.stringify({ S: g.S, P: g.P, time: g.time, free: g.free,
    camps: g.camps.map((c) => ({ ...c, label: undefined })) });
  const state = snapshot(), placements = v.records.map((r) => r.matrix.elements.join(',')).join('|');
  const out = { objects: v.records.length, kinds: [...new Set(v.records.map((r) => r.kind))], camps: {}, resources: [] };
  for (const c of g.camps) out.camps[c.id] = v.records.filter((r) => r.id.startsWith(c.id + '-sleep-')).length;
  const tent = v.records.find((r) => r.id === 'base-sleep-0-0');
  const cam = new THREE.PerspectiveCamera(); cam.position.set(tent.x + 3, tent.y + 2, tent.z + 3);
  cam.lookAt(tent.x, tent.y + 0.6, tent.z);
  let released = 0;
  for (const t of Object.values(v.textures).flatMap(Object.values)) t.addEventListener('dispose', () => released++);
  for (const quality of ['low', 'high', 'medium']) W.setQuality(quality);
  const { QUALITY_PRESETS } = await import('./src/render/quality.js');
  // Measure camp ownership independently of the pre-existing particle rebuilds in the global quality switch.
  for (const quality of ['low', 'high', 'medium', 'low', 'high', 'medium']) {
    v.applyQuality(QUALITY_PRESETS[quality]); v.update(cam, true);
    // Submit directly so textures actually enter the renderer resource cache, including at Low.
    W.renderer.render(W.scene, cam);
    out.resources.push({ ...v.stats(), gpuTextures: W.renderer.info.memory.textures });
  }
  out.released = released;
  out.stateKept = snapshot() === state;
  out.placementsKept = v.records.map((r) => r.matrix.elements.join(',')).join('|') === placements;
  out.near = tent.level;
  cam.position.set(tent.x + 500, tent.y + 2, tent.z + 500); v.update(cam, true); out.far = tent.level;
  let grounded = true;
  for (const r of v.records) for (const guy of r.guys) {
    const p = new THREE.Vector3().setFromMatrixPosition(guy.peg);
    if (Math.abs(p.y - g.field.height(p.x, p.z) - 0.065) > 1e-5) grounded = false;
  }
  out.anchorsGrounded = grounded;
  out.macroPatched = Object.values(v.materials).every((m) => m.userData.macroPatched);
  out.textured = Object.values(v.materials).every((m) => m.map && m.normalMap && m.roughnessMap);
  out.stableResources = out.resources[2].gpuTextures === out.resources[5].gpuTextures;
  v.update(W.camera, true);
  return out;
})();
