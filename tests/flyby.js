// Scenic flyby: the flight visits every stop in order, the camera stays well above the terrain,
// skips jump ahead, Escape ends the flight, and time of day and weather are restored afterwards.
const W = window.__sim, g = W.game, out = {};
const click = (sel) => { const b = document.querySelector(sel); if (!b) throw new Error('missing ' + sel); b.click(); };

click('#btnFree');
out.panel = { free: g.free, flybyButton: !!document.querySelector('[data-act=flyby]') };
const savedBefore = localStorage.getItem('everestSim.v2.save');
const before = { time: g.time, clear: !!g.weather.clear };

click('[data-act=flyby]');
out.started = { mode: g.mode, flying: !!g.flyby, hudHidden: document.getElementById('hud').classList.contains('hidden') };

// fly the whole route: page.evaluate blocks rAF, so updateFlyby is driven only from here
const TAGS = ['ebc', 'icefall_mid', 'icefall_top', 'c1', 'c2', 'bergschrund', 'c3', 'yellowband', 'geneva',
  'c4', 'triangular', 'balcony', 'southsummit', 'hillary', 'everest'];
let visited = [], minClear = 1e9, holdHour = null, frames = 0;
while (g.flyby && frames < 90000) {
  W.updateFlyby(0.1);
  frames++;
  if (!g.flyby) break;                       // the flight completed on this very step
  if (g.flyby.visited.length !== visited.length) visited = [...g.flyby.visited];
  const p = g.flyby.pose.pos, clear = p[1] - g.field.height(p[0], p[2]);
  if (clear < minClear) minClear = clear;
  if (holdHour === null && g.flyby.phase === 'hold') holdHour = (g.time % 24 + 24) % 24;
}
out.flight = { frames, stops: visited, order: JSON.stringify(visited) === JSON.stringify(TAGS), complete: !g.flyby };
out.flight.minClearance = Math.round(minClear);
out.flight.holdHour = holdHour === null ? null : Math.round(holdHour * 10) / 10;
out.flight.cameraPose = !g.flyby;

// everything is put back exactly as it was
out.restored = { time: g.time === before.time, clear: !!g.weather.clear === before.clear, saveUntouched: localStorage.getItem('everestSim.v2.save') === savedBefore };
out.hudBack = !document.getElementById('hud').classList.contains('hidden');

// skips: three Shift presses at the first hover jump three stops ahead
W.startFlyby();
while (g.flyby.phase !== 'hold') W.updateFlyby(0.1);
W.skipStop(); W.skipStop(); W.skipStop();
out.skip = { target: g.flyby.stops[g.flyby.i].tag, phase: g.flyby.phase };
W.stopFlyby('cancelled');

// Escape ends the flight instead of pausing
g.mode = 'play';
W.startFlyby();
W.updateFlyby(0.5);
window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }));
window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Escape' }));
out.escape = { ended: !g.flyby, mode: g.mode };
return out;
