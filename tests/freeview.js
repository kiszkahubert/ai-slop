// Free viewing: switch over from the Base Camp menu, teleport everywhere, survive anything,
// and leave the expedition save untouched.
const W = window.__sim, g = W.game, out = { visits: [] };
const click = (sel) => { const b = document.querySelector(sel); if (!b) throw new Error('missing ' + sel); b.click(); };
// stand in Base Camp and open its menu
const ebc = g.camps.find((c) => c.id === 'ebc'); W.teleport(ebc.x + 3, ebc.z + 3); W.interact();
out.campMenu = g.mode;
click('[data-act=free]');
out.free = g.free;
const pressT = () => { window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyT' })); window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyT' })); };
const ids = [...document.querySelectorAll('[data-act=tp]')].map((b) => b.dataset.id);
for (const id of ids) {
  if (g.mode === 'play') pressT();            // T reopens the panel after each teleport
  click(`[data-act=tp][data-id=${id}]`);
  out.visits.push(`${id}:${Math.round(g.P.y)}`);
}
// stay on the summit of Everest for 30 game hours at night, without oxygen
pressT();
click('[data-act=hour][data-h="1"]');
click('[data-act=tp][data-id=everest]');
g.S.o2on = false;
let t = 0; while (t < (30 * 3600) / 22 && W.simStep(0.25, { dx: 0, dz: 0 })) t += 0.25;
out.summitStay = { mode: g.mode, health: Math.round(g.S.health), y: Math.round(g.P.y), summitFlag: g.S.summits.everest };
// walk off the summit ridge in free viewing: no fall
let fell = false; t = 0; while (t < 10 && W.simStep(1 / 30, { dx: 1, dz: 0 })) { t += 1 / 30; fell ||= !!g.P.falling; }
out.walkOffRidge = { fell, mode: g.mode };
// the expedition save still holds the real climb at Base Camp
const save = JSON.parse(localStorage.getItem('everestSim.v2.save'));
out.saveKept = { y: Math.round(g.field.height(save.P.x, save.P.z)) };
return out;
