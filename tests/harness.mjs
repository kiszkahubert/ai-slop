// Headless test harness: serves the project over HTTP and drives it with Playwright.
//
//   node tests/harness.mjs tests/smoke.json            # run a list of actions
//
// Environment:
//   THREE_DIR    path to a local three@0.160.0 package (default: node_modules/three when installed)
//   CHROMIUM     path to a Chromium binary (default: Playwright's)
//   SHOTS        directory for screenshots (default: tests/out)
//   SHOT_TIMEOUT screenshot timeout in ms (default: 120000)
//   VIDEO        set to 1 to save a browser recording under SHOTS
//   NO_SHOTS     set to 1 to skip screenshots while retaining all assertions
//   HARDWARE     set to 1 to use the real GPU (renderer is reported by the benchmark)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(process.env.PLAYWRIGHT || 'playwright');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json' };
TYPES['.mjs'] = 'text/javascript';

const server = http.createServer((req, res) => {
  let p = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  if (!p.startsWith(root) || !fs.existsSync(p)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

const actions = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const shots = process.env.SHOTS || path.join(root, 'tests', 'out');
// SwiftShader captures can take 25-50 s on a busy machine; Playwright's default is 30 s
const SHOT_TIMEOUT = Number(process.env.SHOT_TIMEOUT || 120000);
fs.mkdirSync(shots, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM || undefined,
  args: process.env.HARDWARE ? ['--use-gl=angle', '--use-angle=d3d11', '--ignore-gpu-blocklist'] : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const viewport={width:Number(process.env.W || 1280),height:Number(process.env.H || 720)};
const page = await browser.newPage({ viewport, ...(process.env.VIDEO ? {recordVideo:{dir:shots,size:viewport}} : {}) });
const errors = [];
process.on('uncaughtException', async error => { console.error(error); await browser.close(); server.close(); process.exit(1); });
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); console.log(`[${m.type()}]`, m.text()); });
page.on('pageerror', (e) => { errors.push(e.message); console.log('[pageerror]', e.message); });
// serve three.js locally when available, so the tests run offline and don't depend on the CDN
const threeDir = process.env.THREE_DIR || (fs.existsSync(path.join(root, 'node_modules/three/build/three.module.js')) ? path.join(root, 'node_modules/three') : null);
if (threeDir) {
  await page.route('https://cdn.jsdelivr.net/npm/three@0.160.0/**', (r) => {
    const rel = new URL(r.request().url()).pathname.replace('/npm/three@0.160.0/', '');
    r.fulfill({ path: path.join(threeDir, rel), contentType: 'text/javascript' });
  });
}
await page.route('https://cdn.jsdelivr.net/npm/@dimforge/rapier3d-compat@0.21.0/**', (r) => {
  const rel=new URL(r.request().url()).pathname.replace('/npm/@dimforge/rapier3d-compat@0.21.0/', '');
  return r.fulfill({ path: path.join(root,'node_modules/@dimforge/rapier3d-compat',rel),contentType:'text/javascript' });
});
await page.goto(`http://localhost:${port}/${process.env.Q || '?debug'}`);
await page.waitForFunction(() => window.__sim && window.__sim.game.mode === 'title', null, { timeout: 180000 });
for (const a of actions) {
  if (a.click) await page.click(a.click);
  if (a.eval) { const r = await page.evaluate(a.eval); if (r !== undefined) console.log('[eval]', JSON.stringify(r)); }
  if (a.script) {
    const src = fs.readFileSync(path.resolve(root, a.script), 'utf8');
    const r = await page.evaluate(`(async () => { ${src}\n })()`);
    console.log('[script]', JSON.stringify(r, null, 1));
    if (a.save) fs.writeFileSync(path.join(shots,path.basename(a.save)),JSON.stringify(r,null,2)+'\n');
    if (a.expect && !new Function('r', `return (${a.expect});`)(r)) { errors.push('expectation failed: ' + a.expect); }
  }
  if (a.key) { await page.keyboard.down(a.key); await page.waitForTimeout(a.hold || 50); await page.keyboard.up(a.key); }
  if (a.wait) await page.waitForTimeout(a.wait);
  if (a.shot && !process.env.NO_SHOTS) await page.screenshot({ path: path.join(shots, a.shot), timeout: SHOT_TIMEOUT });
}
const video=page.video();
await page.close();
if(video) {
  const destination=path.join(shots,path.basename(process.argv[2],'.json')+'.webm');
  await video.saveAs(destination);await video.delete();console.log('[video]',destination);
}
await browser.close();
server.close();
if (errors.length) { console.log(`FAILED: ${errors.length} error(s)`); process.exit(1); }
console.log('OK');
