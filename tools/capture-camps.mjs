// Reproducible camp views and render-work measurements. Uses local Three.js, like the browser test harness.
// node tools/capture-camps.mjs before|after [low|medium|high] [overview,close,crampon,c3,night,distant,equipment,bottles]
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
  let p = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
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
  console.log('Camp capture: game ready');
  const fixture = path.join(out, 'camp-views.json');
  const views = fs.existsSync(fixture) ? JSON.parse(fs.readFileSync(fixture, 'utf8')) : await page.evaluate(async () => {
    const W = window.__sim, g = W.game, THREE = await import('three');
    const { planBaseCamp } = await import('./src/world/baseCamp.js');
    const plan = planBaseCamp(g.field, g.routes), c = plan.compounds[0], y = g.field.height(c.x, c.z);
    const old = W.scene.children.find((o) => o.isInstancedMesh && o.instanceMatrix.count === 2000);
    let tent;
    if (old) { const mat = new THREE.Matrix4(); old.getMatrixAt(0, mat); tent = new THREE.Vector3().setFromMatrixPosition(mat); }
    else { const t = g.world.campVisuals.records.find((o) => o.id === 'base-sleep-0-0'); tent = new THREE.Vector3(t.x, t.y, t.z); }
    const cp = plan.crampon, cy = g.field.height(cp.x, cp.z), camp = g.camps.find((o) => o.id === 'c3');
    const high = g.camps.find((o) => o.id === 'c4');
    return [
      { id: 'overview', pos: [c.x + 17, y + 7, c.z + 15], look: [c.x, y + 1, c.z], time: 12 },
      { id: 'close', pos: [tent.x + 3.6, tent.y + 1.8, tent.z + 3.8], look: [tent.x, tent.y + 0.6, tent.z], time: 12 },
      { id: 'crampon', pos: [cp.x + 6, cy + 3, cp.z + 7], look: [cp.x, cy + 1, cp.z], time: 12 },
      { id: 'c3', pos: [camp.x + 16, camp.elevation + 7, camp.z + 15], look: [camp.x, camp.elevation + 1, camp.z], time: 12 },
      { id: 'night', pos: [high.x + 5, high.elevation + 1.7, high.z + 6], look: [high.x, high.elevation + 0.6, high.z], time: 23 },
      { id: 'distant', pos: [c.x + 130, y + 50, c.z + 130], look: [c.x, y + 1, c.z], time: 12 },
    ];
  });
  const equipment = await page.evaluate(async () => {
    const records = window.__sim.game.world.campVisuals?.records;
    if (!records) return [];
    const THREE = await import('three');
    const panel = records.find((r) => r.id === 'base-solar-0-0'), bottles = records.find((r) => r.id === 'ebc-bottle-0');
    const center = new THREE.Vector3(0, 0.7, 0).applyMatrix4(panel.matrix);
    const normal = new THREE.Vector3(0, Math.cos(0.6), Math.sin(0.6)).transformDirection(panel.matrix);
    const pos = center.clone().addScaledVector(normal, 3).add(new THREE.Vector3(0.8, 0, 0).transformDirection(panel.matrix).multiplyScalar(0.8));
    return [
      { id: 'equipment', pos: pos.toArray(), look: center.toArray(), time: 12 },
      { id: 'bottles', pos: [bottles.x + 1.8, bottles.y + 1.1, bottles.z + 2], look: [bottles.x + 0.35, bottles.y + 0.4, bottles.z + 0.35], time: 12 },
    ];
  });
  for (const v of equipment) {
    const old = views.find((o) => o.id === v.id);
    if (old) Object.assign(old, v); else views.push(v);
  }
  fs.writeFileSync(fixture, JSON.stringify(views, null, 2));
  const selected = process.argv[4]?.split(','), results = {};
  for (const view of views.filter((v) => !selected || selected.includes(v.id))) {
    await page.evaluate((v) => {
      const W = window.__sim, g = W.game;
      W.rig.free = { pos: v.pos, look: v.look }; g.time = v.time;
      g.P.x = v.pos[0]; g.P.z = v.pos[2]; g.P.y = g.field.height(g.P.x, g.P.z);
      g.P.facing = Math.atan2(-(v.look[0] - v.pos[0]), -(v.look[2] - v.pos[2]));
      for (const e of document.querySelectorAll('.screen,#hud')) e.classList.add('hidden');
      W.climber.group.visible = false; W.rig.update(0, 0, g, W.climber);
      for (let i = 0; i < 60; i++) W.terrain.update(W.camera.position, 40);
      g.world.campVisuals?.update(W.camera, true);
    }, view);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    results[view.id] = await page.evaluate(() => {
      const W = window.__sim, R = W.renderer, times = [];
      const prev = R.info.autoReset; R.info.autoReset = false;
      let work;
      for (let i = 0; i < 6; i++) {
        R.info.reset(); const t = performance.now(); W.postfx.render({ free: false, focus: 7 });
        times.push(performance.now() - t); work = { calls: R.info.render.calls, triangles: R.info.render.triangles };
      }
      R.info.autoReset = prev;
      return { ...work, cpuSubmitMedianMs: times.sort((a, b) => a - b)[3], textures: R.info.memory.textures,
        camp: W.game.world.campVisuals?.stats() };
    });
    await page.screenshot({ path: path.join(out, `camp-${label}-${quality}-${view.id}.png`), timeout: 180000 });
    console.log(view.id, JSON.stringify(results[view.id]));
  }
  fs.writeFileSync(path.join(out, `camp-${label}-${quality}.json`), JSON.stringify({ quality, results, errors }, null, 2));
  if (errors.length) throw new Error(errors.join('\n'));
} finally {
  if (browser) await browser.close();
  server.closeAllConnections(); await new Promise((r) => server.close(r));
}
