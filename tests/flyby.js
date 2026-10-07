// Real DEM + camera regression: motion, hidden cuts, both tours, replay and exact restoration.
const W = window.__sim, g = W.game, out = {};
const click = sel => { const b = document.querySelector(sel); if (!b) throw new Error('missing ' + sel); b.click(); };
click('#btnFree');
W.rig.update(.1, 0, g, W.climber);
out.panel = { free: g.free, full: !!document.querySelector('[data-tour=full]'), highlights: !!document.querySelector('[data-tour=highlights]') };
const savedBefore = localStorage.getItem('everestSim.v2.save');
const player = JSON.stringify(g.P), stats = JSON.stringify(g.S), view = JSON.stringify(g.view);
const before = { time: g.time, clear: !!g.weather.clear, fov: W.camera.fov, pos: W.camera.position.toArray(), quat: W.camera.quaternion.toArray() };
let dt = 1 / 60;
const distance = (a,b) => Math.hypot(...a.map((v,i) => v-b[i]));
const snapshot = () => ({ pos: W.camera.position.toArray(), quat: W.camera.quaternion.toArray(), fov: W.camera.fov, fade: g.flyby?.fade || 0 });
const step = () => { W.updateFlyby(dt); W.rig.update(dt, 0, g, W.climber); };
const until = predicate => { let n=0; while (!predicate() && n++ < 90000) step(); if (n >= 90000) throw new Error('flyby timeout'); };
const returnToViewer = () => { W.stopFlyby('cancelled'); until(() => !g.flyby); };
click('[data-tour=full]');
out.started = { mode: g.mode, flying: !!g.flyby, hudHidden: document.getElementById('hud').classList.contains('hidden') };

function measureTour() {
  let previous = snapshot(), frames = 0, minClear = Infinity, minTarget = Infinity, maxStep = 0, maxAngle = 0, maxFov = 0, hiddenCuts = 0, unsafeCuts = 0;
  while (g.flyby.phase !== 'finished' && frames++ < 90000) {
    step(); const f = g.flyby, p = f.pose, now = snapshot(), d = distance(previous.pos, now.pos);
    const angle = 2 * Math.acos(Math.min(1, Math.abs(previous.quat.reduce((n,v,i) => n + v*now.quat[i],0)))) * 180 / Math.PI;
    if (now.fade === 1) { if (d > 10) hiddenCuts++; }
    else if (d > 5) unsafeCuts++;
    if (f.phase === 'hold' || f.phase === 'travel' || f.phase === 'finished') {
      minClear = Math.min(minClear, p.pos[1]-g.field.height(p.pos[0],p.pos[2]));
      minTarget = Math.min(minTarget, distance(p.pos,p.look));
      maxStep = Math.max(maxStep,d); maxAngle = Math.max(maxAngle,angle); maxFov = Math.max(maxFov,Math.abs(now.fov-previous.fov));
    }
    previous = now;
  }
  return { frames, seconds: frames*dt, stops:[...g.flyby.visited], minClear, minTarget, maxStep, maxAngle, maxFov, hiddenCuts, unsafeCuts,
    hour:g.time%24, wind:g.flyby.env.wind, duration:g.flyby.duration, finished:g.flyby.phase==='finished' };
}
out.full = measureTour();
out.finishedControls = !document.getElementById('flybyReplay').classList.contains('hidden');
const finalPos = W.camera.position.toArray(); for(let i=0;i<300;i++) step();
out.linger = distance(finalPos,W.camera.position.toArray()) < .001;
click('#flybyReplay'); until(() => g.flyby.phase === 'hold');
out.replay = g.flyby.stops[g.flyby.i].tag === 'ebc' && g.flyby.visited.length === 1;
click('#flybyNext'); click('#flybyNext'); click('#flybyNext');
out.skip = { target:g.flyby.stops[g.flyby.i].tag, phase:g.flyby.phase };
let previous = snapshot(), covered = true;
until(() => {
  const now = snapshot();
  if (distance(previous.pos,now.pos)>5 && now.fade!==1) covered=false;
  previous=now; return g.flyby.phase==='hold';
});
out.skip.covered = covered;
window.dispatchEvent(new KeyboardEvent('keydown',{code:'Escape'}));
window.dispatchEvent(new KeyboardEvent('keyup',{code:'Escape'}));
out.escape = { returning:g.flyby.phase==='return', mode:g.mode };
until(() => !g.flyby);
out.restored = { time:g.time===before.time, clear:!!g.weather.clear===before.clear, fov:W.camera.fov===before.fov,
  position:distance(W.camera.position.toArray(),before.pos)<.001,
  orientation:distance(W.camera.quaternion.toArray(),before.quat)<.001,
  player:JSON.stringify(g.P)===player, stats:JSON.stringify(g.S)===stats, view:JSON.stringify(g.view)===view,
  save:localStorage.getItem('everestSim.v2.save')===savedBefore };
out.hudBack = !document.getElementById('hud').classList.contains('hidden');
W.startFlyby(0,'highlights'); out.highlights = measureTour(); returnToViewer();
out.cadences = [];
for (const hz of [30, 144]) {
  dt = 1 / hz; W.startFlyby();
  const result = measureTour();
  out.cadences.push({ hz, seconds:result.seconds, maxSpeed:result.maxStep*hz, maxTurn:result.maxAngle*hz,
    valid:result.finished && result.stops.length===15 && result.unsafeCuts===0 && result.minClear>45 && result.maxAngle*hz<26 && Math.abs(result.seconds-out.full.seconds)<1 });
  returnToViewer();
}
dt = 1 / 60;

// Restoration while travelling, and opening from first person with an arbitrary lens.
W.camera.fov=71; W.camera.updateProjectionMatrix(); g.view.fp=true;
W.rig.update(dt,0,g,W.climber); const fp = snapshot();
W.startFlyby(); until(() => g.flyby.phase==='travel');
for(let i=0;i<500;i++) step(); returnToViewer();
out.firstPerson = { fov:W.camera.fov===71, orientation:distance(fp.quat,W.camera.quaternion.toArray())<.001, fp:g.view.fp };
W.startFlyby(); until(() => g.flyby.phase==='travel');
const c2 = g.routes.main.at(g.routes.main.s('c2')); W.teleport(c2.x,c2.z);
out.teleport = { ended:!g.flyby, lens:W.camera.fov===71, time:g.time===before.time, clear:!!g.weather.clear===before.clear };
const destination = g.routes.main.at(g.routes.main.s('ebc')+20);
W.teleport(destination.x,destination.z);
out.teleport.destination = Math.hypot(g.P.x-destination.x,g.P.z-destination.z)<25;
g.view.fp=false; W.camera.fov=before.fov; W.camera.updateProjectionMatrix(); W.rig.update(dt,0,g,W.climber);
out.ok = out.panel.full && out.panel.highlights && out.full.finished && out.full.stops.length===15 && out.highlights.stops.length===7
  && out.full.minClear>45 && out.highlights.minClear>45 && out.full.minTarget>20 && out.highlights.minTarget>20
  && out.full.maxStep<2 && out.highlights.maxStep<3 && out.full.maxAngle<.5 && out.highlights.maxAngle<.5
  && out.full.maxFov<.35 && out.full.unsafeCuts===0 && out.highlights.unsafeCuts===0
  && out.highlights.seconds<out.full.seconds*.75 && out.full.hour<6.52 && out.full.wind>20
  && out.finishedControls && out.linger && out.replay && out.skip.target==='c1' && out.skip.covered
  && out.escape.returning && out.escape.mode==='play' && Object.values(out.restored).every(Boolean)
  && out.hudBack && Object.values(out.firstPerson).every(Boolean) && out.cadences.every(r=>r.valid) && Object.values(out.teleport).every(Boolean);
return out;
