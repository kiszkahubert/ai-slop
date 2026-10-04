// Full expedition driven through the game's own systems: the route-following autopilot (F),
// camp rests, oxygen and bottle management - the way a careful player climbs.
// Run with:  node tests/harness.mjs tests/expedition.json
const W = window.__sim, g = W.game, target = window.__target || 'everest';
const log = [], R = g.routes;
let seed = window.__seed || 777;
Math.random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;    // deterministic slips
const stat = (tag) => log.push(`${tag}: Day ${Math.floor(g.time / 24) + 1} ${(g.time % 24).toFixed(1)}h y=${Math.round(g.P.y)} hp=${Math.round(g.S.health)} spo2=${Math.round(g.S.spo2)} exh=${Math.round(g.S.exh)} frost=${Math.round(g.S.frost)} accl=${Math.round(g.S.accl)} tanks=[${g.S.tanks.map(Math.round)}] o2=${g.S.o2on} falls=${g.S.falls} mode=${g.mode}`);
const face = (route, s, dir) => { const a = route.at(s), b = route.at(s + dir * 10); g.view.yaw = Math.atan2(-(b.x - a.x), -(b.z - a.z)); };
const nearS = (route) => route.nearest(g.P.x, g.P.z).s;
// follow the route until the autopilot stops itself; returns false if the climber died
function follow(route, dir, maxSeconds = 4000) {
  face(route, nearS(route), dir);
  if (!W.startAutopilot()) return false;
  let t = 0;
  while (g.auto && g.mode === 'play' && t < maxSeconds) {
    W.simStep(1 / 30, { dx: 0, dz: 0 }); t += 1 / 30;
    if (g.P.y > 7300 && !g.S.o2on && g.S.tanks.length) { g.S.flow = 3; g.S.o2on = true; }
  }
  return g.mode === 'play' || g.mode === 'won';
}
const rest = (h, flow) => { if (flow) { g.S.flow = flow; g.S.o2on = true; } else g.S.o2on = false; const ok = W.restHours(h); stat(`rest ${h.toFixed(1)} h`); return ok; };
const until = (hh) => ((hh - (g.time % 24)) + 24) % 24 || 24;
const takeBottles = (camp, n) => { while (g.S.tanks.length < n && g.S.stock[camp] > 0) { g.S.stock[camp]--; g.S.tanks.push(300); } };

g.S.tanks = [300, 300];
for (const [camp, h] of [['c1', 0], ['c2', 16], ['c3', 10]]) {
  if (!follow(R.main, 1)) { stat('died'); return { log, cause: g.S.cause }; }
  stat('reach ' + camp);
  if (h && !rest(h)) return { log, cause: g.S.cause };
}
if (target === 'everest') {
  if (!follow(R.main, 1)) { stat('died'); return { log, cause: g.S.cause }; }           // C3 -> junction
  if (!follow(R.main, 1)) { stat('died'); return { log, cause: g.S.cause }; }           // junction -> C4
  stat('reach c4'); takeBottles('c4', 4);
  if (!rest(until(23), 1)) return { log, cause: g.S.cause };
  g.S.tanks.sort((a, b) => b - a);
  follow(R.main, 1); stat('summit push');
} else {
  if (!follow(R.main, 1)) { stat('died'); return { log, cause: g.S.cause }; }           // C3 -> Yellow Band junction
  W.interact();                                                                         // clip over to the Lhotse ropes
  if (!follow(R.lhotse, 1)) { stat('died'); return { log, cause: g.S.cause }; }         // -> Lhotse Camp 4
  stat('reach lhotse c4'); takeBottles('lhotse_c4', 3);
  if (!rest(until(23), 1)) return { log, cause: g.S.cause };
  g.S.tanks.sort((a, b) => b - a);
  follow(R.lhotse, 1); stat('summit push');
}
if (g.mode !== 'play') return { log, cause: g.S.cause };
// descend to Camp 2 (the autopilot stops at each camp on the way)
for (let k = 0; k < 6 && g.mode === 'play'; k++) {
  const route = target === 'lhotse' && R.lhotse.nearest(g.P.x, g.P.z).d < R.main.nearest(g.P.x, g.P.z).d ? R.lhotse : R.main;
  follow(route, -1);
}
stat('descent');
return { log, cause: g.S.cause, summits: g.S.summits, won: g.mode === 'won' };
