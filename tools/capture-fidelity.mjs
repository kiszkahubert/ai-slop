// Capture either this checkout or FIDELITY_ROOT using exactly the same fixtures.
// RT=1 includes converged traced views. Software timings are diagnostic only.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const root = path.resolve(process.env.FIDELITY_ROOT || '.'), out = path.resolve(process.env.SHOTS || 'tests/out/fidelity');
const server = http.createServer((req, res) => {
  const p = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://local').pathname));
  if (!p.startsWith(root + path.sep) || !fs.existsSync(p) || !fs.statSync(p).isFile()) { res.writeHead(404); res.end(); return; }
  res.setHeader('Content-Type', ({'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.png':'image/png','.jpg':'image/jpeg'})[path.extname(p)] || 'application/octet-stream');
  fs.createReadStream(p).pipe(res);
});
await new Promise(resolve => server.listen(0, resolve)); fs.mkdirSync(out, {recursive:true});
const browser = await chromium.launch({executablePath:process.env.CHROMIUM || undefined, args:process.env.HARDWARE?['--use-gl=angle','--ignore-gpu-blocklist']:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
try {
  const page = await browser.newPage({viewport:{width:Number(process.env.W || 960),height:Number(process.env.H || 540)}});
  const errors=[]; page.on('pageerror', e=>errors.push(e.message)); page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.route('https://cdn.jsdelivr.net/npm/three@0.160.0/**', route=>route.fulfill({path:path.join(root,'node_modules/three',new URL(route.request().url()).pathname.replace('/npm/three@0.160.0/','')),contentType:'text/javascript'}));
  await page.route('https://cdn.jsdelivr.net/npm/@dimforge/rapier3d-compat@0.21.0/**',route=>route.fulfill({path:path.join(root,'node_modules/@dimforge/rapier3d-compat',new URL(route.request().url()).pathname.replace('/npm/@dimforge/rapier3d-compat@0.21.0/','')),contentType:'text/javascript'}));
  await page.goto(`http://localhost:${server.address().port}/index.html?debug&rt=off&quality=medium`);
  await page.waitForFunction(()=>window.__sim?.game.mode==='title',null,{timeout:180000});
  await page.evaluate(()=>{
    const s=window.__sim; document.querySelectorAll('.screen').forEach(o=>o.classList.add('hidden'));
    window.__captureRaf=requestAnimationFrame.bind(window);
    window.requestAnimationFrame=callback=>window.__captureRaf(time=>{
      if(window.__capturePaused)window.__captureResume=callback;else callback(time);
    });
    s.game.mode='paused';s.game.weather.clear=true;s.game.time=12;s.rig.update=()=>{};
    const update=s.env.update.bind(s.env);s.env.update=(_dt,ctx)=>{const result=update(0,ctx);s.renderer.toneMappingExposure=.72;return result;};
    const animate=s.climber.update.bind(s.climber);s.climber.update=(_dt,...args)=>animate(0,...args);
  });
  const results=[];
  for(const view of ['summit','ridge','rock','camp']) {
    if(process.env.VIEW && !process.env.VIEW.split(',').includes(view))continue;
    await page.evaluate(()=>__sim.setRayTracing(false));
    await page.evaluate(view=>{
      const s=__sim,g=s.game,route=view==='rock'?g.routes.lhotse:g.routes.main;
      const p=view==='camp'?route.pts[0]:view==='rock'?route.pts[Math.floor(route.pts.length*.82)]:route.pts.at(-1);
      s.teleport(p.x,p.z);g.P.facing=Math.PI;g.P.moving=false;g.P.phase=0;
      s.climber.group.rotation.y=Math.PI;
      const y=g.field.height(p.x,p.z),offset=view==='summit'?[8,4,12]:view==='rock'?[32,10,32]:view==='camp'?[0,4,12]:[3,2.8,5];
      const target=view==='summit'?[-800,-220,-1600]:view==='rock'?[-30,24,-70]:view==='camp'?[0,1,0]:[-2,0,-7];
      s.camera.position.set(p.x+offset[0],y+offset[1],p.z+offset[2]);s.camera.lookAt(p.x+target[0],y+target[1],p.z+target[2]);
      s.terrain.update(s.camera.position,40);s.env.adapt=1;
    },view);
    for(const traced of process.env.RT==='1'?[false,true]:[false]) {
      await page.evaluate(traced=>__sim.setRayTracing(traced),traced);
      if(traced){
        await page.waitForFunction(()=>{const rt=__sim.rayTracing;if(rt.failed)throw Error(rt.failed);return rt.stats.active&&rt.snapshot&&rt.frame>8;},null,{timeout:180000});
        await page.evaluate(async()=>{
          window.__capturePaused=true;await new Promise(window.__captureRaf);
          const s=__sim,rt=s.rayTracing,r=s.renderer,old=r.getRenderTarget(),auto=r.autoClear,viewport=r.getViewport(new (await import('three')).Vector4());
          try{
            r.autoClear=false;r.setScissorTest(false);
            // Use the real native ray pass, with distinct RNG frames, to warm the
            // camera's tiles without waiting for a complete landscape-atlas cycle.
            for(let i=0;i<rt.caches.length;i++){
              const c=rt.caches[i],cursor=c.cursor,px=(s.camera.position.x-c.rect.x)*c.rect.z*c.w-.5,py=(s.camera.position.z-c.rect.y)*c.rect.w*c.h-.5;
              const xs=[Math.floor(px),Math.floor(px)+1],ys=[Math.floor(py),Math.floor(py)+1];
              const ids=c.tiles.map((tile,id)=>({tile,id})).filter(({tile:t})=>xs.some(x=>x>=t.x&&x<t.x+t.w)&&ys.some(y=>y>=t.y&&y<t.y+t.h)).map(v=>v.id);
              for(let pass=0;pass<8;pass++)for(const id of ids){rt.frame+=((i-rt.frame%4+4)%4)||4;c.cursor=id;rt.cacheStep();}
              c.cursor=cursor;
            }
            r.getContext().finish();
          }finally{r.autoClear=auto;r.setRenderTarget(old);r.setViewport(viewport);window.__capturePaused=false;if(window.__captureResume){window.__captureRaf(window.__captureResume);window.__captureResume=null;}}
        });
        await page.waitForFunction(async()=>{
        const s=__sim,rt=s.rayTracing;if(rt.failed)throw Error(rt.failed);
        if(!rt.historyValid)return false;
        const {readCacheCoverage}=await import('/tests/rt-support.mjs');
        const coverage=readCacheCoverage(s);
        return coverage[0]>3&&coverage[2]>.00001&&coverage[3]>.9;
        },null,{timeout:180000});
      }
      await page.waitForTimeout(1500);
      // Drain queued software draws before asking the compositor for a capture.
      await page.evaluate(async()=>{window.__capturePaused=true;await new Promise(window.__captureRaf);__sim.renderer.getContext().finish();});
      await page.screenshot({path:path.join(out,`${view}-${traced?'on':'off'}.png`),timeout:120000});
      await page.evaluate(()=>{window.__capturePaused=false;if(window.__captureResume){window.__captureRaf(window.__captureResume);window.__captureResume=null;}});
      const state=await page.evaluate(async()=>{
        const s=__sim,frames=[],cpu=[];let previous=await new Promise(requestAnimationFrame);
        const gl=s.renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');
        const renderer=ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);
        const samples=/swiftshader|llvmpipe/i.test(renderer)?12:60;
        for(let i=0;i<samples;i++){const now=await new Promise(requestAnimationFrame);frames.push(now-previous);previous=now;cpu.push(s.frameMs);}
        frames.sort((a,b)=>a-b);cpu.sort((a,b)=>a-b);
        const percentile=(values,p)=>values[Math.floor((values.length-1)*p)];
        const {readCacheCoverage}=await import('/tests/rt-support.mjs');
        return {camera:s.camera.position.toArray(),quaternion:s.camera.quaternion.toArray(),time:s.game.time,clear:s.game.weather.clear,quality:s.quality,exposure:s.renderer.toneMappingExposure,renderer,samples:frames.length,timing:'requestAnimationFrame interval',median:percentile(frames,.5),p95:percentile(frames,.95),cpuMedian:percentile(cpu,.5),rt:s.rayTracing.stats,rtScale:s.rayTracing.scale,cacheAtCamera:s.rayTracing.stats.active?readCacheCoverage(s):null};
      });
      results.push({view,traced,...state});console.log(view,traced?'RT on':'RT off',state.median.toFixed(1)+' ms');
      fs.writeFileSync(path.join(out,'settings.json'),JSON.stringify({results,errors},null,2)+'\n');
    }
  }
  fs.writeFileSync(path.join(out,'settings.json'),JSON.stringify({results,errors},null,2)+'\n');
  if(errors.length)throw Error(errors.join('\n'));
} finally { await browser.close();server.close(); }
