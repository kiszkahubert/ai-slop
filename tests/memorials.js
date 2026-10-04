// The dead of the route as checkpoints: placed on the real terrain, saving progress when reached on an expedition
// (unless too weak), telling their story, and never saving in free viewing.
// (wrapped in an async function so the file also parses for ESLint: the harness awaits the result)
return (async () => {
  const W = window.__sim, g = W.game, out = {};
  document.getElementById('gl').requestPointerLock = () => undefined;      // see extras.js
  if (document.pointerLockElement) document.exitPointerLock();
  await new Promise((r) => setTimeout(r, 200));
  if (g.mode !== 'play') document.getElementById('btnResume').click();
  const list = g.world.memorials, by = Object.fromEntries(list.map((m) => [m.id, m]));
  out.placed = list.map((m) => `${m.id}:${m.kind}:${Math.round(m.y)}`);
  const saved = () => JSON.parse(localStorage.getItem('everestSim.v2.save'));
  const visit = (m) => { W.teleport(m.x + 3, m.z); W.simStep(0.1, { dx: 0, dz: 0 }); };
  const toasts = () => document.getElementById('toasts').textContent;
  // a checkpoint on a real expedition saves there
  visit(by.babuchiri);
  const s1 = saved();
  out.babuchiri = { reached: !!g.S.checkpoints.babuchiri, savedHere: Math.hypot(s1.P.x - g.P.x, s1.P.z - g.P.z) < 1, inSave: !!s1.S.checkpoints.babuchiri, story: toasts().includes('Babu Chiri') };
  // too weak to carry on from here: marked, but the save is not overwritten
  g.S.health = 20; visit(by.namba);
  const s2 = saved();
  out.namba = { reached: !!g.S.checkpoints.namba, saveKept: Math.hypot(s2.P.x - s1.P.x, s2.P.z - s1.P.z) < 1 };
  // free viewing: the story is told, nothing is saved
  document.getElementById('btnQuit').click(); document.getElementById('btnFree').click();
  document.querySelector('[data-act=tp][data-id=southsummit]').click();
  visit(by.hall);
  const s3 = saved();
  out.free = { story: toasts().includes('Rob Hall'), saveKept: Math.hypot(s3.P.x - s1.P.x, s3.P.z - s1.P.z) < 1 };
  return out;
})();
