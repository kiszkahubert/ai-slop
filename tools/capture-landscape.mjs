// Identical before/after fixtures; LANDSCAPE_ROOT can point to an archived checkout.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const root=path.resolve(process.env.LANDSCAPE_ROOT||'.'),deps=path.resolve('node_modules'),out=path.resolve(process.env.SHOTS||'tests/out/landscape');
const server=http.createServer((req,res)=>{
  const u=new URL(req.url,'http://local');if(u.pathname==='/favicon.ico'){res.writeHead(204);res.end();return;}
  const p=path.resolve(root,'.'+decodeURIComponent(u.pathname));
  if(!p.startsWith(root+path.sep)||!fs.existsSync(p)||!fs.statSync(p).isFile()){res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.css':'text/css'})[path.extname(p)]||'application/octet-stream');fs.createReadStream(p).pipe(res);
});
await new Promise(r=>server.listen(0,r));fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM||undefined,args:process.env.HARDWARE?['--use-gl=angle','--use-angle=d3d11','--ignore-gpu-blocklist']:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
try{
  const page=await browser.newPage({viewport:{width:1600,height:900}}),errors=[],results=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  for(const [prefix,folder]of[['three@0.160.0','three'],['@dimforge/rapier3d-compat@0.21.0','@dimforge/rapier3d-compat']])await page.route('https://cdn.jsdelivr.net/npm/'+prefix+'/**',r=>r.fulfill({path:path.join(deps,folder,new URL(r.request().url()).pathname.replace('/npm/'+prefix+'/','')),contentType:'text/javascript'}));
  await page.goto(`http://localhost:${server.address().port}/index.html?debug&rt=off&quality=medium&fps=max`);
  await page.waitForFunction(()=>window.__sim?.game.mode==='title',null,{timeout:180000});
  const preservation=await page.evaluate(async()=>{
    const s=__sim,g=s.game;document.querySelectorAll('.screen').forEach(e=>e.classList.add('hidden'));
    // An inert non-menu mode keeps frame pacing out of timing measurements.
    g.mode='capture';g.weather.clear=true;s.rig.update=()=>{};s.env.adapt=1;
    const update=s.env.update.bind(s.env);s.env.update=(_dt,ctx)=>{const v=update(0,ctx);s.renderer.toneMappingExposure=.72;return v;};
    const animate=s.climber.update.bind(s.climber);s.climber.update=(_dt,...args)=>animate(0,...args);
    window.__landRaf=requestAnimationFrame.bind(window);window.requestAnimationFrame=cb=>window.__landRaf(t=>{if(window.__landPaused)window.__landResume=cb;else cb(t);});
    const {regionOrigin}=await import('/src/render/rayTracing/settings.js'),{readCacheCoverage}=await import('/tests/rt-support.mjs');window.__landOrigin=regionOrigin;window.__landCoverage=readCacheCoverage;
    const hash=async data=>Array.from(new Uint8Array(await window.crypto.subtle.digest('SHA-256',data))).map(b=>b.toString(16).padStart(2,'0')).join('');
    return {heights:await hash(g.field.h),base:await hash(g.field.base.h),glacier:await hash(g.field.glacier),rock:await hash(g.field.rock),route:await hash(new window.TextEncoder().encode(JSON.stringify(Object.values(g.routes).map(r=>r.pts)))),collisions:await hash(new window.TextEncoder().encode(JSON.stringify(g.world.collisions)))};
  });
  const fixtures=[];
  for(const quality of (process.env.QUALITIES||'low,medium,high').split(','))for(const time of [7.05,12])fixtures.push({view:'summit',quality,time});
  if(!process.env.SUMMIT_ONLY)for(const view of ['west','north','south','corner'])fixtures.push({view,quality:'medium',time:12});
  for(const fixture of fixtures){
    if(process.env.VIEWS&&!process.env.VIEWS.split(',').includes(fixture.view))continue;
    await page.evaluate(({view,quality,time})=>{
      const s=__sim,g=s.game,c=g.field;s.setRayTracing(false);if(s.quality!==quality)s.setQuality(quality);g.time=time;
      const p=g.routes.main.pts.at(-1);let x,z,target;
      if(view==='summit'){x=p.x-7;z=p.z+4;target=[p.x+5000,c.height(p.x,p.z)-1200,p.z+1100];}
      else if(view==='west'){x=c.x0+600;z=-1000;target=[c.x0-400,c.height(c.x0,-1000),-1000];}
      else if(view==='north'){x=-3000;z=c.z0+600;target=[x,c.height(x,c.z0),c.z0-400];}
      else if(view==='south'){x=-7000;z=c.z1-600;target=[x,c.height(x,c.z1),c.z1+400];}
      else{x=c.x1-600;z=c.z0+600;target=[c.x1+250,c.height(c.x1,c.z0),c.z0-250];}
      s.teleport(Math.max(c.x0+50,Math.min(c.x1-50,x)),Math.max(c.z0+50,Math.min(c.z1-50,z)));
      s.camera.position.set(x,view==='summit'?c.height(p.x,p.z)+6:Math.max(c.height(x,z),target[1])+180,z);s.camera.lookAt(...target);g.P.moving=false;
      const box=view==='summit'||view==='corner'?{x0:c.x1-800,x1:c.x1+800,z0:c.z0-500,z1:c.z1+500}:view==='west'?{x0:c.x0-800,x1:c.x0+800,z0:c.z0-500,z1:c.z1+500}:view==='north'?{x0:c.x0-500,x1:c.x1+500,z0:c.z0-800,z1:c.z0+800}:{x0:c.x0-500,x1:c.x1+500,z0:c.z1-800,z1:c.z1+800};window.__landBox=box;
      for(let i=0;i<30&&s.terrain.update(s.camera.position,40)>0;i++);s.backdropTerrain?.update(s.camera.position,40);
    },fixture);
    for(const traced of process.env.RT==='1'&&fixture.quality!=='low'?[false,true]:[false]){
      await page.evaluate(v=>__sim.setRayTracing(v),traced);
      if(traced){
        await page.waitForFunction(()=>{const s=__sim,rt=s.rayTracing,o=window.__landOrigin(s.camera.position);if(rt.failed)throw Error(rt.failed);return rt.stats.active&&rt.snapshot?.origin.every((v,i)=>v===o[i])&&!rt.pending&&rt.lastTime===s.game.time&&rt.frame>8;},null,{timeout:180000});
        await page.evaluate(async full=>{
          window.__landPaused=true;await new Promise(window.__landRaf);const s=__sim,rt=s.rayTracing,r=s.renderer,old=r.getRenderTarget(),auto=r.autoClear,viewport=r.getViewport(new (await import('three')).Vector4());
          try{r.autoClear=false;r.setScissorTest(false);
            for(let i=0;i<rt.caches.length;i++){
              const c=rt.caches[i],cursor=c.cursor;rt.frame+=((i-rt.frame%4+4)%4)||4;c.cursor=0;rt.cacheStep();
              const b=window.__landBox,boxes=[b,{x0:s.camera.position.x-128,x1:s.camera.position.x+128,z0:s.camera.position.z-128,z1:s.camera.position.z+128}];
              const ids=c.tiles.map((t,id)=>({t,id})).filter(({t})=>full||boxes.some(b=>{
                const x0=c.rect.x+t.x/c.w/c.rect.z,x1=c.rect.x+(t.x+t.w)/c.w/c.rect.z,z0=c.rect.y+t.y/c.h/c.rect.w,z1=c.rect.y+(t.y+t.h)/c.h/c.rect.w;return x0<b.x1&&x1>b.x0&&z0<b.z1&&z1>b.z0;
              })).map(v=>v.id);
              for(let pass=0;pass<8;pass++)for(const id of ids){rt.frame+=((i-rt.frame%4+4)%4)||4;c.cursor=id;rt.cacheStep();}c.cursor=cursor;
            }r.getContext().finish();
          }finally{r.autoClear=auto;r.setRenderTarget(old);r.setViewport(viewport);window.__landPaused=false;if(window.__landResume){window.__landRaf(window.__landResume);window.__landResume=null;}}
        },process.env.FULL_CACHE==='1');
        await page.waitForFunction(()=>{const s=__sim,rt=s.rayTracing;if(rt.failed)throw Error(rt.failed);if(!rt.historyValid)return false;const c=window.__landCoverage(s);return c[0]>3&&c[3]>.9;},null,{timeout:180000});
      }
      await page.waitForTimeout(1000);
      const state=await page.evaluate(async()=>{
        const s=__sim,r=s.renderer,gl=r.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info'),frames=[],cpu=[],draw=[];let last=await new Promise(window.__landRaf);
        for(let i=0;i<90;i++){const now=await new Promise(window.__landRaf);frames.push(now-last);last=now;cpu.push(s.frameMs);draw.push(s.renderMs);}
        const median=a=>a.sort((a,b)=>a-b)[Math.floor(a.length/2)];return {camera:s.camera.position.toArray(),quaternion:s.camera.quaternion.toArray(),exposure:r.toneMappingExposure,renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),frameMedian:median(frames),cpuMedian:median(cpu),drawMedian:median(draw),rt:{...s.rayTracing.stats},coverage:s.rayTracing.stats.active?window.__landCoverage(s):null};
      });
      if(traced&&(!state.rt.active||!state.coverage||state.coverage[0]<=3||state.coverage[3]<=.9))throw Error('Lighting lost convergence before capture');
      await page.evaluate(async()=>{window.__landPaused=true;await new Promise(window.__landRaf);__sim.renderer.getContext().finish();});
      if(errors.length)throw Error(errors.join('\n'));
      const file=`${fixture.view}-${fixture.time===12?'noon':'0703'}-${fixture.quality}-${traced?'on':'off'}.png`;
      await page.screenshot({path:path.join(out,file),timeout:120000});
      await page.evaluate(()=>{window.__landPaused=false;if(window.__landResume){window.__landRaf(window.__landResume);window.__landResume=null;}});
      results.push({file,...fixture,traced,...state});fs.writeFileSync(path.join(out,'settings.json'),JSON.stringify({preservation,results,errors},null,2)+'\n');console.log(file,JSON.stringify({frame:state.frameMedian,cpu:state.cpuMedian,memory:state.rt.memoryBytes}));
    }
  }
}finally{await browser.close();server.close();}
