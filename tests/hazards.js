// Death zone, crevasse and fall checks.
const W = window.__sim, g = W.game, R = g.routes.main, out = {};
let seed = 4242;
Math.random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;   // deterministic slips
const reset = () => { g.mode = 'play'; Object.assign(g.S, { health: 100, frost: 0, exh: 10, spo2: 80, cause: null, accl: 6200 }); g.P.clipped = -1; g.P.falling = null; };
const standFor = (hours) => { let t = 0; while (t < hours * 3600 / 22 && W.simStep(1 / 10, { dx: 0, dz: 0 })) t += 1 / 10; return (t * 22) / 3600; };
// 1. Balcony (8,400 m) on 3 L/min for 10 h: survives
reset(); const b = R.point('balcony'); W.teleport(b.x, b.z);
Object.assign(g.S, { o2on: true, flow: 3, tanks: [300, 300, 300] });
out.onOxygen = { survivedHours: standFor(10).toFixed(1), health: Math.round(g.S.health), mode: g.mode };
// 2. Same place without oxygen: dies of death-zone hypoxia
reset(); g.S.o2on = false;
out.noOxygen = { hoursToDeath: standFor(48).toFixed(1), mode: g.mode, cause: g.S.cause };
// 3. Walking into a crevasse off the ladder line
reset(); const cv = g.world.crevasses.find((c) => c.ladder); const vx = -cv.uz, vz = cv.ux;
W.teleport(cv.x + cv.ux * 8 - vx * (cv.w / 2 + 3), cv.z + cv.uz * 8 - vz * (cv.w / 2 + 3));
let t = 0; while (t < 6 && W.simStep(1 / 30, { dx: vx, dz: vz })) t += 1 / 30;
out.crevasse = { mode: g.mode, cause: g.S.cause };
// 4. Crossing on the ladder
reset(); W.teleport(cv.x - vx * (cv.w / 2 + 3), cv.z - vz * (cv.w / 2 + 3));
let ladder = false; t = 0; while (t < 6 && W.simStep(1 / 30, { dx: vx, dz: vz })) { t += 1 / 30; ladder ||= g.P.onLadder; }
out.ladder = { mode: g.mode, usedLadder: ladder };
// 5. Climbing the Lhotse Face unclipped: slips happen
reset(); let slips = 0, deaths = 0;
for (let k = 0; k < 8; k++) {
  reset(); const s = R.s('c3') + 80, p = R.at(s); W.teleport(p.x, p.z);
  t = 0; while (t < 30 && W.simStep(1 / 30, { dx: p.dx, dz: p.dz })) { t += 1 / 30; if (g.P.falling) { slips++; break; } }
  while (t < 90 && g.P.falling && W.simStep(1 / 30, null)) t += 1 / 30;
  if (g.mode === 'dead') deaths++;
}
out.unclippedLhotseFace = { attempts: 8, slips, deaths };
// 6. Same, clipped into the fixed rope: no slips
let clippedSlips = 0;
for (let k = 0; k < 4; k++) {
  reset(); const s = R.s('c3') + 80, p = R.at(s); W.teleport(p.x, p.z); W.interact();
  t = 0; while (t < 30 && W.simStep(1 / 30, { dx: p.dx, dz: p.dz })) { t += 1 / 30; if (g.P.falling) clippedSlips++; }
}
out.clippedLhotseFace = { slips: clippedSlips, clipped: g.P.clipped >= 0 };
return out;
