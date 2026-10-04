// Debug walk speed, leaving free viewing where you stand, and the ski easter egg on the real mountain.
// (wrapped in an async function so the file also parses for ESLint: the harness awaits the result)
return (async () => {
  const W = window.__sim, g = W.game, out = {};
  // menus open and close faster than headless Chromium grants and releases the pointer lock; keep it out of the way
  document.getElementById('gl').requestPointerLock = () => undefined;
  if (document.pointerLockElement) document.exitPointerLock();
  await new Promise((r) => setTimeout(r, 200));
  if (g.mode !== 'play') document.getElementById('btnResume').click();
  const click = (sel) => { const b = document.querySelector(sel); if (!b) throw new Error('missing ' + sel); b.click(); };
  const key = (code) => { window.dispatchEvent(new KeyboardEvent('keydown', { code })); window.dispatchEvent(new KeyboardEvent('keyup', { code })); };
  const frame = () => new Promise((r) => setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(r)), 300));   // the HUD redraws every 0.1 s
  const walk = (s, ctl) => { let t = 0; while (t < s && W.simStep(1 / 30, ctl)) t += 1 / 30; };
  // ---- walk speed: 2 s across Base Camp at ×1, then at ×4 ([.] twice with ?debug)
  const ebc = g.camps.find((c) => c.id === 'ebc');
  const dist = (mul) => {
    W.setSpeedMul(mul); W.teleport(ebc.x, ebc.z);
    const x0 = g.P.x, z0 = g.P.z; walk(2, { dx: 1, dz: 0 });
    return Math.hypot(g.P.x - x0, g.P.z - z0);
  };
  const d1 = dist(1); key('Period'); key('Period');
  out.speedKey = g.speedMul;
  W.teleport(ebc.x, ebc.z); { const x0 = g.P.x; walk(2, { dx: 1, dz: 0 }); out.speedRatio = +(Math.abs(g.P.x - x0) / d1).toFixed(2); }
  await frame();
  out.pill = document.getElementById('hStatus').textContent;
  W.setSpeedMul(1);
  // ---- free viewing → teleport to the South Col → exit free viewing, staying put
  click('#btnQuit'); click('#btnFree');
  click('[data-act=tp][data-id=c4]');
  key('KeyT');
  const before = { x: g.P.x, z: g.P.z };
  click('[data-act=exit-free]');
  out.exit = { mode: g.mode, free: g.free, moved: Math.hypot(g.P.x - before.x, g.P.z - before.z), o2: g.S.o2on, accl: Math.round(g.S.accl), c3: !!g.S.visited.c3 };
  walk(60, { dx: 0, dz: 0 });
  out.afterExit = { mode: g.mode, health: Math.round(g.S.health), spo2: Math.round(g.S.spo2), time: +g.time.toFixed(2) };
  // ---- skis: free viewing again, from the Lhotse Face (Camp 3) straight down the fall line
  click('#btnQuit'); click('#btnFree'); click('[data-act=tp][data-id=c3]');
  const sl = g.field.slope(g.P.x, g.P.z, 3);
  g.P.facing = Math.atan2(sl.gx, sl.gz);
  key('KeyX');
  out.skisOn = !!g.P.ski;
  const y0 = g.P.y; let vmax = 0;
  for (let t = 0; t < 20 && W.simStep(1 / 30, { dx: 0, dz: 0 }); t += 1 / 30) vmax = Math.max(vmax, g.P.ski.speed);
  await frame();
  out.ski = { drop: Math.round(y0 - g.P.y), vmaxKmh: Math.round(vmax * 3.6), mode: g.mode, pill: document.getElementById('hStatus').textContent.includes('Skis') };
  key('KeyF'); out.autopilotRefused = !g.auto;
  // brake (hold back) until slow, then take the skis off
  const [hx, hz] = [-Math.sin(g.P.ski.h), -Math.cos(g.P.ski.h)];
  for (let t = 0; t < 30 && g.P.ski.speed > 1; t += 1 / 30) W.simStep(1 / 30, { dx: -hx, dz: -hz });
  key('KeyX');
  out.skisOff = !g.P.ski;
  return out;
})();
