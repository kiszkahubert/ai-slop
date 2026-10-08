return (async () => {
  const s = __sim, g = s.game, assert = (ok, message) => { if (!ok) throw Error(message); };
  const parts = [], campRecords = g.world.campVisuals.records.map(r => [r.x,r.y,r.z]);
  s.scene.traverse(o => { if (o.userData.iceFormation) parts.push({mesh:o,material:o.material,geometry:o.geometry,instances:o.instanceMatrix.array.slice()}); });
  const heights = g.field.h, save = localStorage.getItem('everestSim.v2.save');
  const camp = g.camps[0], support = s.querySupport({x:camp.x,y:camp.elevation+2,z:camp.z},5);
  document.querySelector('#scrTitle [data-quality=verylow]').click();
  await new Promise(requestAnimationFrame);
  assert(s.quality === 'verylow' && document.querySelector('#scrTitle [data-quality=verylow]').classList.contains('active'),'Very Low button did not apply');
  assert(localStorage.getItem('everestSim.quality') === 'verylow','Very Low was not remembered');
  assert(!s.renderer.getContext().getContextAttributes().antialias,'Default framebuffer still uses MSAA');
  assert(!s.renderer.shadowMap.enabled && !s.env.sun.castShadow,'Shadows still run');
  assert(!s.postfx.q.post && !s.postfx.prepass.enabled && !s.postfx.prepass.depthRT,'Extra render passes still allocated');
  assert(!s.env.sky.visible && !s.env.mist.enabled && s.env.snow.N === 0,'Atmospheric effects still run');
  assert(g.world.campVisuals.stats().detailed === 0,'Camp detail was not reduced');
  assert(s.renderer.domElement.width <= 960 && s.renderer.domElement.height <= 540,'Drawing buffer exceeds the limit');
  const fullResolution = document.querySelector('#scrTitle [data-very-low-full-resolution]');
  assert(!fullResolution.closest('[data-very-low-resolution]').classList.contains('hidden'),'Resolution option missing on Very Low');
  s.resolution.scale = .5; // switching must discard any previous adaptive reduction
  fullResolution.click();
  assert(s.veryLowFullResolution && s.resolution.scale === 1,'Full resolution did not reset adaptive scaling');
  assert(localStorage.getItem('everestSim.veryLowFullResolution') === 'true','Resolution choice was not remembered');
  const nativeBuffer = () => s.renderer.domElement.width === Math.floor(innerWidth*devicePixelRatio) && s.renderer.domElement.height === Math.floor(innerHeight*devicePixelRatio);
  assert(nativeBuffer(),'Full resolution retained a cap or half-resolution scale');
  assert(document.querySelector('#scrPause [data-very-low-full-resolution]').checked,'Pause-screen checkbox did not sync');
  for (let i=0;i<8;i++) await new Promise(requestAnimationFrame);
  assert(nativeBuffer() && s.resolution.samples === 0,'Full resolution still runs adaptive downscaling');
  assert(!s.renderer.shadowMap.enabled && !s.postfx.q.post && !s.env.sky.visible,'Full resolution lost Very Low optimizations');
  s.setQuality('low');
  assert(s.renderer.getPixelRatio() === Math.min(devicePixelRatio,1),'Resolution preference changed another preset');
  s.setQuality('verylow');
  assert(nativeBuffer(),'Full-resolution preference lost when switching presets');
  window.dispatchEvent(new window.Event('resize'));
  assert(nativeBuffer(),'Viewport resize restored resolution reduction');
  fullResolution.click();
  assert(!s.veryLowFullResolution && localStorage.getItem('everestSim.veryLowFullResolution') === 'false','Reduced-resolution choice failed');
  assert(s.renderer.domElement.width <= 960 && s.renderer.domElement.height <= 540,'Reduced resolution was not restored');
  const terrainMeshes = s.terrain.chunks.flatMap(ch => ch.meshes.filter(Boolean));
  assert(terrainMeshes.every(m => m.material.isMeshLambertMaterial),'Terrain still uses PBR');
  for (const part of parts) {
    assert(part.mesh.material.isMeshLambertMaterial,'Ice still uses PBR');
    assert(part.mesh.geometry === part.geometry && part.mesh.instanceMatrix.array.every((v,i) => v === part.instances[i]),'Ice geometry or placements changed');
  }
  assert(g.field.h === heights && localStorage.getItem('everestSim.v2.save') === save,'Preset modified terrain or save');
  assert(JSON.stringify(s.querySupport({x:camp.x,y:camp.elevation+2,z:camp.z},5)) === JSON.stringify(support),'Preset changed surface support');
  assert(g.world.campVisuals.records.every((r,i) => r.x === campRecords[i][0] && r.y === campRecords[i][1] && r.z === campRecords[i][2]),'Camp placements changed');
  s.setRayTracing(true); s.rayTracing.prepare(g.time);
  assert(!s.rayTracing.worker && !s.rayTracing.stats.active && s.rayTracing.stats.status === 'Paused on Very Low','Saved/forced ray tracing bypasses Very Low');
  s.setRayTracing(false);
  for (const q of ['high','verylow','low','verylow','medium']) {
    s.setQuality(q); await new Promise(requestAnimationFrame);
    assert(s.renderer.shadowMap.enabled === (q !== 'verylow'),'Shadow state was not restored');
    assert(s.postfx.prepass.enabled === (q !== 'verylow' && s.postfx.prepass.supported),'Depth prepass state was not restored');
    if (q !== 'verylow') for (const part of parts) assert(part.mesh.material === part.material && part.material.map === g.world.iceVisuals.textures.map,'Source material was not restored');
  }
  document.querySelector('#scrTitle [data-quality=medium]').click();
  assert(fullResolution.closest('[data-very-low-resolution]').classList.contains('hidden'),'Very Low resolution option shown on Medium');
  s.setQuality('verylow'); g.time = 1;
  await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame);
  assert(s.env.headlamp.intensity > 0 && !s.env.sky.visible,'Very Low lost nighttime lighting');
  document.querySelector('#btnNew').click(); s.setQuality('verylow');
  await new Promise(resolve => setTimeout(resolve,500));
  assert(document.querySelector('#hAlt').textContent.length > 0 && g.mode === 'play','HUD/expedition failed');
  return {ok:true,quality:s.quality,buffer:[s.renderer.domElement.width,s.renderer.domElement.height],terrainChunks:terrainMeshes.length};
})();
