// Reproducible crevasse views and render-work measurements. Uses local Three.js, like the browser test harness.
// node tools/capture-crevasses.mjs before|after [low|medium|high] [rim,ladder,inside,night,distant]
// BASELINE selects a directory containing a committed src/ snapshot for matching before views.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const label = process.argv[2] || 'after', quality = process.argv[3] || 'medium';
if (!/^[a-z0-9-]+$/i.test(label) || !['low', 'medium', 'high'].includes(quality)) throw new Error('Invalid label/quality');
const out = path.join(root, 'tests/out'); fs.mkdirSync(out, { recursive: true });
const server = http.createServer((req, res) => {
  const pathname=decodeURIComponent(new URL(req.url,'http://x').pathname);
  let p = path.join(root, pathname);
  if(process.env.BASELINE && pathname.startsWith('/src/'))p=path.join(process.env.BASELINE,pathname);
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  if (!p.startsWith(root + path.sep) || !fs.existsSync(p)) { res.writeHead(404); res.end(); return; }
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.css': 'text/css' };
  res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.route('https://cdn.jsdelivr.net/npm/three@0.160.0/**', (r) => r.fulfill({
    path: path.join(root, 'node_modules/three', new URL(r.request().url()).pathname.replace('/npm/three@0.160.0/', '')),
    contentType: 'text/javascript',
  }));
  await page.route('https://cdn.jsdelivr.net/npm/@dimforge/rapier3d-compat@0.21.0/**', (r) => r.fulfill({
    path: path.join(root, 'node_modules/@dimforge/rapier3d-compat', new URL(r.request().url()).pathname.replace('/npm/@dimforge/rapier3d-compat@0.21.0/', '')),
    contentType: 'text/javascript',
  }));
  await page.goto(`http://127.0.0.1:${server.address().port}/?quality=${quality}`);
  await page.waitForFunction(() => window.__sim?.game.mode === 'title', null, { timeout: 180000 });
  console.log('Crevasse capture: game ready');
  const fixture = path.join(out, 'crevasse-views.json');
  const views = fs.existsSync(fixture) ? JSON.parse(fs.readFileSync(fixture, 'utf8')) : await page.evaluate(() => {
    const g=window.__sim.game,cv=g.world.crevasses.find(c=>c.ladder),vx=-cv.uz,vz=cv.ux;
    const point=(u,v,dy)=>{const x=cv.x+cv.ux*u+vx*v,z=cv.z+cv.uz*u+vz*v;return [x,g.field.height(x,z)+dy,z];};
    return [
      {id:'rim',pos:point(8,-cv.w/2-.65,2.7),look:point(8,0,-4),time:12},
      {id:'ladder',pos:point(3,-cv.w/2-3,2.8),look:point(0,0,-1),time:12},
      {id:'inside',pos:point(8,0,-5),look:point(12,.1,-12),time:12},
      {id:'inside-night',pos:point(8,0,-5),look:point(12,.1,-12),time:1},
      {id:'night',pos:point(8,-cv.w/2-.65,2.7),look:point(8,0,-4),time:1},
      {id:'falling',pos:point(8,0,0),look:point(8,0,-3),time:12,fall:.8},
      {id:'distant',pos:point(30,-100,50),look:point(0,0,-2),time:12},
    ];
  });
  fs.writeFileSync(fixture,JSON.stringify(views,null,2));
  const layout=await page.evaluate(()=>{
    const g=window.__sim.game;return {crevasses:g.world.crevasses.map(c=>({x:c.x,z:c.z,ux:c.ux,uz:c.uz,len:c.len,w:c.w,ladder:c.ladder})),seracs:[...g.world.seracGrid],camps:g.world.campVisuals.records.map(r=>({id:r.id,x:r.x,z:r.z}))};
  });
  fs.writeFileSync(path.join(out,`crevasse-${label}-layout.json`),JSON.stringify(layout));
  const selected = process.argv[4]?.split(','), results = {};
  for (const view of views.filter((v) => !selected || selected.includes(v.id))) {
    await page.evaluate((v) => {
      const W = window.__sim, g = W.game;
      W.resetPhysics();g.free=true;g.mode='paused';
      if(v.fall) {
        g.P.x=v.pos[0];g.P.y=v.pos[1];g.P.z=v.pos[2];g.P.clipped=-1;g.P.velocity=null;g.mode='play';
        W.forceFall({reason:'crevasse',velocity:{x:0,y:0,z:0}});
        for(let i=0;i<v.fall*120;i++)W.stepPhysics(1/120);
        g.mode='paused';const c=g.world.crevasses[0];
        v.pos=[g.P.x+c.ux*2-c.uz*.5,g.P.y+1.2,g.P.z+c.uz*2+c.ux*.5];
        v.look=[g.P.x,g.P.y+.85,g.P.z];
      }
      W.rig.free = { pos: v.pos, look: v.look }; g.time = v.time;
      W.captureRender ||=W.postfx.render.bind(W.postfx);
      const focus=Math.hypot(...v.look.map((value,i)=>value-v.pos[i]));
      W.postfx.render=(ctx)=>W.captureRender({...ctx,focus});
      if(!v.fall){g.P.x = v.pos[0]; g.P.z = v.pos[2]; g.P.y = v.pos[1] - 1.65;}
      g.P.facing = Math.atan2(-(v.look[0] - v.pos[0]), -(v.look[2] - v.pos[2]));
      g.view.fp=true;g.view.yaw=g.P.facing;g.view.pitch=Math.atan2(v.look[1]-v.pos[1],Math.hypot(v.look[0]-v.pos[0],v.look[2]-v.pos[2]));
      for (const e of document.querySelectorAll('.screen,#hud')) e.classList.add('hidden');
      Object.defineProperty(W.climber.group,'visible',{get:()=>!!v.fall,set:()=>{},configurable:true});
      W.rig.update(0, 0, g, W.climber);
      for (let i = 0; i < 60; i++) W.terrain.update(W.camera.position, 40);
      g.world.crevasseVisuals?.update(W.camera); g.world.campVisuals.update(W.camera,true);
    }, view);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    results[view.id] = await page.evaluate(async () => {
      const W = window.__sim, R = W.renderer, times = [];
      const prev = R.info.autoReset; R.info.autoReset = false;
      let work;
      for (let i = 0; i < 6; i++) {
        R.info.reset(); const t = performance.now(); W.postfx.render({ free: false, focus: 7 });
        times.push(performance.now() - t); work = { calls: R.info.render.calls, triangles: R.info.render.triangles };
      }
      R.info.autoReset = prev;
      const frames=[];
      for(let i=0;i<12;i++)await new Promise(r=>requestAnimationFrame(()=>{frames.push(W.frameMs);r();}));
      return { ...work, cpuSubmitMedianMs: times.sort((a, b) => a - b)[3],frameMedianMs:frames.sort((a,b)=>a-b)[6], textures: R.info.memory.textures,
        geometries:R.info.memory.geometries,crevasse: W.game.world.crevasseVisuals?.stats() };
    });
    await page.screenshot({ path: path.join(out, `crevasse-${label}-${quality}-${view.id}.png`), timeout: 180000 });
    console.log(view.id, JSON.stringify(results[view.id]));
  }
  fs.writeFileSync(path.join(out, `crevasse-${label}-${quality}.json`), JSON.stringify({ quality, results, errors }, null, 2));
  if (errors.length) throw new Error(errors.join('\n'));
} finally {
  if (browser) await browser.close();
  server.closeAllConnections(); await new Promise((r) => server.close(r));
}
