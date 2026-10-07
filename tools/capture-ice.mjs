// Fixed close views of Base Camp towers and Icefall seracs, including traced lighting.
// SHOTS selects the output folder; RT=1 includes tracing; BASELINE=1 captures one side.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';

const root=path.resolve('.'),out=path.resolve(process.env.SHOTS||'tests/out/ice');
const server=http.createServer((req,res)=>{
  if(req.url==='/favicon.ico'){res.writeHead(204);res.end();return;}
  const p=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://local').pathname));
  if(!p.startsWith(root+path.sep)||!fs.existsSync(p)||!fs.statSync(p).isFile()){res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.png':'image/png','.jpg':'image/jpeg'})[path.extname(p)]||'application/octet-stream');
  fs.createReadStream(p).pipe(res);
});
await new Promise(resolve=>server.listen(0,resolve));fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM||undefined,args:process.env.HARDWARE?['--use-gl=angle','--use-angle=d3d11','--ignore-gpu-blocklist']:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
const results=[],errors=[];
try{
  const page=await browser.newPage({viewport:{width:1280,height:720}});
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(`http://localhost:${server.address().port}/index.html?debug&localthree&rt=off&quality=medium`);
  await page.waitForFunction(()=>window.__sim?.game.mode==='title',null,{timeout:180000});
  const placements=await page.evaluate(async()=>{
    const s=__sim,THREE=await import('three');
    window.__iceRegionOrigin=(await import('/src/render/rayTracing/settings.js')).regionOrigin;
    window.__iceReadCoverage=(await import('/tests/rt-support.mjs')).readCacheCoverage;
    document.querySelectorAll('.screen').forEach(o=>o.classList.add('hidden'));
    s.game.mode='paused';s.game.weather.clear=true;s.rig.update=()=>{};
    window.__iceRaf=requestAnimationFrame.bind(window);
    window.requestAnimationFrame=callback=>window.__iceRaf(time=>{if(window.__icePaused)window.__iceResume=callback;else callback(time);});
    const areas={camp:[],icefall:[]},matrix=new THREE.Matrix4();
    s.scene.traverse(o=>{
      if(!o.isInstancedMesh)return;
      const area=o.userData.iceFormation||(o.material.color?.getHex()===0xe4f1fb?'camp':o.material.color?.getHex()===0xcfe9f6?'icefall':null);
      if(!area)return;
      for(let i=0;i<o.count;i++){o.getMatrixAt(i,matrix);areas[area].push(matrix.elements.slice());}
    });
    window.__iceAreas=areas;
    return {areas,collisions:[...s.game.world.seracGrid]};
  });
  const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
  const placementHashes={camp:{count:placements.areas.camp.length,hash:hash(placements.areas.camp)},icefall:{count:placements.areas.icefall.length,hash:hash(placements.areas.icefall)},collisions:hash(placements.collisions)};
  for(const area of ['camp','icefall'])for(const time of [7.2,12])for(const side of process.env.BASELINE? [0]:[0,1,2]){
    await page.evaluate(async({area,time,side})=>{
      const s=__sim,g=s.game,THREE=await import('three'),route=g.routes.main;
      const target=route.at(route.s(area==='camp'?'ebc':'icefall_mid'));
      const matrices=window.__iceAreas[area];
      const ordered=matrices.slice().sort((a,b)=>Math.hypot(a[12]-target.x,a[14]-target.z)-Math.hypot(b[12]-target.x,b[14]-target.z));
      const closest=area==='camp'?ordered[0]:ordered.find(m=>{
        const slope=g.field.slope(m[12],m[14],16);
        return Math.hypot(slope.gx,slope.gz)<.4;
      });
      if(!closest)throw Error('Missing ice in '+area);
      const matrix=new THREE.Matrix4().fromArray(closest),p=new THREE.Vector3(),q=new THREE.Quaternion(),scale=new THREE.Vector3();matrix.decompose(p,q,scale);
      const height=scale.y*(area==='camp'?1:2),radius=Math.max(scale.x,scale.z),ground=g.field.height(p.x,p.z);
      const lookY=area==='camp'?p.y+height*.55:ground+height*.28,angle=.35+side*Math.PI*2/3;
      g.time=time;s.teleport(p.x+radius*2.8,p.z);g.P.moving=false;
      const cx=p.x+Math.cos(angle)*radius*3.2,cz=p.z+Math.sin(angle)*radius*3.2;
      s.camera.position.set(cx,Math.max(g.field.height(cx,cz)+2,lookY+height*.05),cz);
      s.camera.lookAt(p.x,lookY,p.z);s.env.adapt=1;
      for(let i=0;i<30&&s.terrain.update(s.camera.position,40)>0;i++);
    },{area,time,side});
    for(const traced of process.env.RT==='1'?[false,true]:[false]){
      await page.evaluate(traced=>__sim.setRayTracing(traced),traced);
      if(traced){
        await page.waitForFunction(()=>{
          const s=__sim,rt=s.rayTracing;if(rt.failed)throw Error(rt.failed);
          const origin=window.__iceRegionOrigin(s.camera.position);
          return rt.stats.active&&rt.snapshot?.origin.every((v,i)=>v===origin[i])&&!rt.pending&&rt.lastTime===s.game.time&&rt.frame>8;
        },null,{timeout:180000});
        // Warm the native cache tiles actually sampled by this view.
        await page.evaluate(async()=>{
          window.__icePaused=true;await new Promise(window.__iceRaf);
          const s=__sim,rt=s.rayTracing,r=s.renderer,old=r.getRenderTarget(),auto=r.autoClear;
          const viewport=r.getViewport(new (await import('three')).Vector4());
          try{
            r.autoClear=false;r.setScissorTest(false);
            for(let i=0;i<rt.caches.length;i++){
              const c=rt.caches[i],cursor=c.cursor;
              // cacheStep sorts tiles whenever cursor is zero. Prime that ordering before taking tile IDs.
              rt.frame+=((i-rt.frame%4+4)%4)||4;c.cursor=0;rt.cacheStep();
              const px=(s.camera.position.x-c.rect.x)*c.rect.z*c.w-.5,py=(s.camera.position.z-c.rect.y)*c.rect.w*c.h-.5;
              const xs=[Math.floor(px),Math.floor(px)+1],ys=[Math.floor(py),Math.floor(py)+1];
              const ids=c.tiles.map((tile,id)=>({tile,id})).filter(({tile:t})=>xs.some(x=>x>=t.x&&x<t.x+t.w)&&ys.some(y=>y>=t.y&&y<t.y+t.h)).map(v=>v.id);
              for(let pass=0;pass<8;pass++)for(const id of ids){rt.frame+=((i-rt.frame%4+4)%4)||4;c.cursor=id;rt.cacheStep();}c.cursor=cursor;
            }
            r.getContext().finish();
          }finally{r.autoClear=auto;r.setRenderTarget(old);r.setViewport(viewport);window.__icePaused=false;if(window.__iceResume){window.__iceRaf(window.__iceResume);window.__iceResume=null;}}
        });
        await page.waitForFunction(()=>{
          const s=__sim,rt=s.rayTracing;if(rt.failed)throw Error(rt.failed);if(!rt.historyValid)return false;
          const coverage=window.__iceReadCoverage(s);
          return coverage[0]>3&&coverage[3]>.9;
        },null,{timeout:180000});
      }
      await page.waitForTimeout(600);
      await page.evaluate(async()=>{window.__icePaused=true;await new Promise(window.__iceRaf);__sim.renderer.getContext().finish();});
      if(errors.length)throw Error(errors.join('\n'));
      const file=`${area}-${time===12?'noon':'0712'}-${side}-${traced?'on':'off'}.png`;
      await page.screenshot({path:path.join(out,file),timeout:120000});
      const state=await page.evaluate(async()=>{
        const s=__sim,{readCacheCoverage}=await import('/tests/rt-support.mjs');const gl=s.renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');
        return {camera:s.camera.position.toArray(),time:s.game.time,quality:s.quality,exposure:s.renderer.toneMappingExposure,renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),rt:s.rayTracing.stats,coverage:s.rayTracing.stats.active?readCacheCoverage(s):null};
      });
      if(traced&&(!state.rt.active||state.coverage[0]<=3||state.coverage[3]<=.9))throw Error('Traced lighting lost convergence before capture: '+file+' '+JSON.stringify(state));
      await page.evaluate(()=>{window.__icePaused=false;if(window.__iceResume){window.__iceRaf(window.__iceResume);window.__iceResume=null;}});
      results.push({file,area,time,side,traced,...state});console.log('Captured',file);
      fs.writeFileSync(path.join(out,'settings.json'),JSON.stringify({placementHashes,results,errors},null,2)+'\n');
    }
  }
  if(errors.length)throw Error(errors.join('\n'));
}finally{await browser.close();server.close();}
