// GPU-completed render timings, with every pass counted. No FPS claims are inferred from CPU submission time.
return (async () => {
  const s = __sim, g = s.game, r = s.renderer, gl = r.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
  const gpu = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  const timerExt = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  const THREE = await import('three'), {QUALITY_PRESETS} = await import('/src/render/quality.js');
  const requestedSamples = Number(new URLSearchParams(location.search).get('benchmarkFrames'));
  const sampleCount = requestedSamples >= 20 && requestedSamples <= 600 ? Math.floor(requestedSamples) : 60;
  const out = [], previousSample = s.resolution.sample;
  // A test-only inert mode avoids both simulation and the 30 fps menu cap.
  s.setFrameCap('max'); s.setRayTracing(false); g.mode = 'benchmark'; g.free = true; g.weather.clear = true; g.time = 12;
  s.resolution.sample = () => false; // compare each preset at its initial resolution, independently of warmup
  const originalRender = s.postfx.render, originalAutoReset = r.info.autoReset;
  // Submit only the explicitly sampled frames. A normal uncapped animation loop can queue hundreds of
  // expensive software-rendered frames during warmup and distort the following measurements.
  s.postfx.render = () => {};
  const readback = new Uint8Array(4);
  const percentile = (values,p) => values.slice().sort((a,b) => a-b)[Math.floor((values.length-1)*p)];
  try {
    for (const id of ['ebc','c3','everest']) {
      const p = id === 'everest' ? g.routes.main.pts.at(-1) : g.camps.find(c => c.id === id);
      s.teleport(p.x,p.z);
      const y = g.field.height(p.x,p.z);
      s.rig.free = {pos:[p.x+20,y+18,p.z+40],look:[p.x,y+3,p.z]};
      for (const quality of ['medium','low','verylow']) {
        console.log('Benchmark starting:',id,quality);
        s.setQuality(quality);
        await new Promise(resolve => setTimeout(resolve,3000));
        // Settle the display LOD before timing; actual gameplay retains time-sliced builds.
        const q = QUALITY_PRESETS[quality], view = {camera:s.camera,height:r.domElement.height,pixelError:q.terrainError,distanceScale:q.lodDistanceScale || 1};
        for (let i=0;i<100 && s.terrain.update(s.camera.position,100,view);i++);
        for (let i=0;i<100 && s.backdropTerrain.update(s.camera.position,100,view);i++);
        r.info.autoReset = false;
        const values = [], intervals = [], calls = [], triangles = [], gpuValues = [], queries = [];
        let previous = performance.now();
        const poll = () => {
          if (!timerExt) return;
          const disjoint = gl.getParameter(timerExt.GPU_DISJOINT_EXT);
          while (queries.length && (disjoint || gl.getQueryParameter(queries[0].query,gl.QUERY_RESULT_AVAILABLE))) {
            const {query,index} = queries.shift();
            if (!disjoint && index >= 10) gpuValues.push(gl.getQueryParameter(query,gl.QUERY_RESULT)/1e6);
            gl.deleteQuery(query);
          }
        };
        const deadline = performance.now()+Math.max(180000,(sampleCount+10)*15000);
        for (let i=0;i<sampleCount+10;i++) {
          if (performance.now() > deadline) throw Error(`Benchmark timed out at ${id}/${quality}: ${values.length} rendered frames`);
          await new Promise(requestAnimationFrame);
          poll();
          r.info.reset(); const start = performance.now();
          intervals.push(start-previous); previous = start;
          const query = timerExt && queries.length < 4 ? gl.createQuery() : null;
          if (query) gl.beginQuery(timerExt.TIME_ELAPSED_EXT,query);
          originalRender.call(s.postfx,{free:g.free,focus:s.rig.dist});
          if (query) { gl.endQuery(timerExt.TIME_ELAPSED_EXT); queries.push({query,index:values.length}); }
          // Unlike submission/flush timings, reading one output pixel waits for all the preceding passes.
          gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,readback);
          values.push(performance.now()-start); calls.push(r.info.render.calls); triangles.push(r.info.render.triangles);
        }
        await new Promise(requestAnimationFrame); poll();
        for (const {query} of queries) gl.deleteQuery(query);
        out.push({location:id,quality,buffer:r.getDrawingBufferSize(new THREE.Vector2()).toArray(),samples:sampleCount,
          renderedFps:1000/(intervals.slice(10).reduce((sum,v)=>sum+v,0)/sampleCount),
          medianFrameMs:percentile(intervals.slice(10),.5),p95FrameMs:percentile(intervals.slice(10),.95),
          medianRenderMs:percentile(values.slice(10),.5),p95RenderMs:percentile(values.slice(10),.95),
          medianGpuMs:gpuValues.length ? percentile(gpuValues,.5) : null,gpuSamples:gpuValues.length,
          drawCalls:percentile(calls.slice(10),.5),triangles:percentile(triangles.slice(10),.5)});
        console.log('Very Low benchmark:', JSON.stringify(out.at(-1)));
      }
    }
  } finally {
    s.postfx.render = originalRender; r.info.autoReset = originalAutoReset; s.resolution.sample = previousSample; s.rig.free = null;
  }
  return {gpu,viewport:[innerWidth,innerHeight],sampleCount,results:out};
})();
