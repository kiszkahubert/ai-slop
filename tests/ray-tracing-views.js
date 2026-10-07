return (async()=>{
const s=__sim;document.querySelectorAll('.screen').forEach(o=>o.classList.add('hidden'));s.game.mode='paused';s.game.weather.clear=true;s.game.time=12;s.setQuality('medium');
const rt=s.rayTracing;s.setRayTracing(true);const end=performance.now()+120000;
const start=rt.frame;
while(!rt.historyValid||rt.frame<start+1600){if(rt.failed)throw new Error(rt.failed);if(performance.now()>end)throw new Error('Lighting timed out');await new Promise(r=>setTimeout(r,100));}
const {readCacheCoverage}=await import('/tests/rt-support.mjs');
return {ready:rt.stats.active,stats:rt.stats,cacheAtCamera:readCacheCoverage(s)};
})();
