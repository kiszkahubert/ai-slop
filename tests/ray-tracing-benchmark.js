return (async()=>{
const s=__sim,rt=s.rayTracing,r=s.renderer,gl=r.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');
const gpu=ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);
if(/swiftshader|llvmpipe/i.test(gpu))throw new Error('Benchmark requires a hardware GPU: '+gpu);
s.setQuality('medium');s.game.mode='paused';s.game.weather.clear=true;s.game.time=12;
document.querySelectorAll('.screen').forEach(o=>o.classList.add('hidden'));
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const sample=async()=>{
  const values=[],gpuValues=[],renderValues=[],start=performance.now();let previous=start;
  while(performance.now()-start<60000){await new Promise(requestAnimationFrame);const now=performance.now();values.push(now-previous);previous=now;
    renderValues.push(s.renderMs);if(rt.stats.gpuMs!==null)gpuValues.push(rt.stats.gpuMs);}
  const percentile=(a,p)=>a.sort((a,b)=>a-b)[Math.floor((a.length-1)*p)]??null;
  return {frames:values.length,seconds:(performance.now()-start)/1000,fps:1000/(values.reduce((a,b)=>a+b,0)/values.length),frameMedianMs:percentile(values,.5),frameP95Ms:percentile(values,.95),renderMedianMs:percentile(renderValues,.5),lightingGpuMedianMs:percentile(gpuValues,.5)};
};
s.setRayTracing(false);await pause(10000);const off=await sample();
s.setRayTracing(true);let end=performance.now()+120000;
while(!rt.snapshot||!rt.historyValid){if(rt.failed)throw new Error(rt.failed);if(performance.now()>end)throw new Error('Lighting timed out');await pause(100);}
await pause(10000);const {readCacheCoverage}=await import('/tests/rt-support.mjs'),coverage=readCacheCoverage(s);
if(coverage[3]<.5)throw new Error('Benchmark requires converged lighting at the camera: '+JSON.stringify(coverage));
const on=await sample();
const result={gpu,viewport:{width:innerWidth,height:innerHeight},drawingBuffer:r.getDrawingBufferSize(new (await import('three')).Vector2()).toArray(),quality:s.quality,warmupSeconds:10,sampleSeconds:60,off,on,scale:rt.scale,localUpdateStride:rt.localUpdateStride,memoryMiB:rt.stats.memoryBytes/1048576,triangles:rt.stats.triangles,coverageAtCamera:readCacheCoverage(s),incrementalMedianMs:on.frameMedianMs-off.frameMedianMs,target60Fps:on.fps>=59.5,lightingBudget5Ms:on.lightingGpuMedianMs<=5};
s.setRayTracing(false);return result;
})();
