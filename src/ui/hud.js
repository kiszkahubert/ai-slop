// Heads-up display: altimeter, physiology bars, altitude gauge, compass, clock, oxygen,
// conditions, status pills, prompts, the death-zone warning and hypoxia screen effects.
import { TURNAROUND_H, DEATH_ZONE, OXYGEN, SLIP_ANGLE } from '../config.js';
import { clamp, fmt, timeOfDay, dayOf, hourOfDay, compassName, D2R } from '../core/math.js';
import { on, toast } from '../core/events.js';
import { game, nearCamp, region } from '../sim/game.js';
import { o2Flowing, maxStamina, packLoad } from '../sim/physiology.js';
import { nearestRope } from '../sim/player.js';
import { crevasseLocal } from '../world/props.js';
import { Minimap } from './minimap.js';

const $ = (id) => document.getElementById(id);
let el, minimap, tick = 0, vertHist = [], promptOverride = null, promptUntil = 0;

export function initHUD(canvas) {
  el = {
    alt: $('hAlt'), vert: $('hVert'), loc: $('hLoc'), accl: $('hAccl'), clock: $('hClock'), turn: $('hTurn'),
    oState: $('oState'), oFlow: $('oFlow'), oFill: $('oFill'), oBar: $('oBar'), oTime: $('oTime'), oSpare: $('oSpare'), oLoad: $('oLoad'),
    wT: $('wT'), wWC: $('wWC'), wWind: $('wWind'), wVis: $('wVis'), wSky: $('wSky'),
    prompt: $('prompt'), status: $('hStatus'), dzTag: $('dzTag'), dzBanner: $('dzBanner'),
    compass: $('compass').getContext('2d'), gauge: $('altGauge').getContext('2d'), canvas,
  };
  minimap = new Minimap($('minimap'), game);
  on('prompt', (t, sec) => { promptOverride = t; promptUntil = performance.now() + sec * 1000; });
  on('deathzone', () => {
    el.dzBanner.classList.remove('hidden');
    clearTimeout(el.dzBanner._t); el.dzBanner._t = setTimeout(() => el.dzBanner.classList.add('hidden'), 5000);
  });
}
export function resetHUD() { vertHist = []; }

function bar(id, v, max, txt, color) {
  const b = $(id), f = b.querySelector('.fill');
  f.style.width = clamp((v / max) * 100, 0, 100) + '%';
  if (color) f.style.background = color;
  b.querySelector('.val').textContent = txt;
}
const sev = (v) => (v < 40 ? 'var(--good)' : v < 75 ? 'var(--warn)' : 'var(--bad)');

export function updateHUD(dt) {
  tick += dt;
  drawCompass();
  if (tick < 0.1) return;
  tick = 0;
  const { S, P, env, weather } = game, y = P.y;
  el.alt.textContent = fmt(y);
  vertHist.push([game.time, y]);
  while (vertHist.length > 2 && game.time - vertHist[0][0] > 0.5) vertHist.shift();
  const dh = vertHist.length > 1 ? (y - vertHist[0][1]) / Math.max(0.05, game.time - vertHist[0][0]) : 0;
  el.vert.textContent = (dh >= 0 ? '+' : '−') + fmt(Math.abs(dh)) + ' m/h';
  el.loc.textContent = region();
  bar('bSpo2', S.spo2 - 40, 60, Math.round(S.spo2) + '%', S.spo2 > 82 ? 'var(--good)' : S.spo2 > 68 ? 'var(--warn)' : 'var(--bad)');
  bar('bHealth', S.health, 100, Math.round(S.health), S.health > 60 ? 'var(--good)' : S.health > 30 ? 'var(--warn)' : 'var(--bad)');
  bar('bStam', S.stamina, 100, Math.round(S.stamina) + '/' + Math.round(maxStamina(S)), S.winded ? 'var(--bad)' : '#62b6ff');
  bar('bFrost', S.frost, 100, Math.round(S.frost) + '%', sev(S.frost));
  bar('bExh', S.exh, 100, Math.round(S.exh) + '%', sev(S.exh));
  el.accl.textContent = `Acclimatized to ~${fmt(Math.round(S.accl / 10) * 10)} m · highest ${fmt(S.maxAlt)} m`;
  el.clock.textContent = `Day ${dayOf(game.time)} · ${timeOfDay(game.time)}${game.auto ? ' · ⏩ ×4' : ''}`;
  const hod = hourOfDay(game.time);
  if (y > 7900 && !game.free && !(S.summits.everest && S.summits.lhotse)) {
    const past = hod >= TURNAROUND_H && hod < 23;
    el.turn.textContent = past ? `Past the ${TURNAROUND_H}:00 turnaround — descend!` : `Turnaround time ${TURNAROUND_H}:00`;
    el.turn.style.color = past ? 'var(--bad)' : 'var(--warn)';
    if (past && y > 8200 && !S.turnWarned) { S.turnWarned = true; toast(`It is past ${TURNAROUND_H}:00. Turn around and descend before dark.`, 'bad', 7); }
  } else el.turn.textContent = '';
  // oxygen
  const flowing = o2Flowing(S), cur = S.tanks.length ? S.tanks[0] : 0;
  el.oState.textContent = S.o2on ? (flowing ? 'ON' : 'EMPTY') : 'OFF';
  el.oState.className = 'pill ' + (S.o2on ? (flowing ? 'on' : 'alert') : '');
  el.oFlow.textContent = S.flow + ' L/min';
  el.oFill.style.width = (cur / OXYGEN.bottleBar) * 100 + '%';
  el.oBar.textContent = S.tanks.length ? Math.round(cur) + ' bar' : 'none';
  const mins = S.tanks.length ? (cur * OXYGEN.bottleLitres) / S.flow : 0;
  el.oTime.textContent = S.tanks.length ? `${Math.floor(mins / 60)}h ${String(Math.floor(mins % 60)).padStart(2, '0')}m at ${S.flow} L/min` : 'No bottle';
  const spare = Math.max(0, S.tanks.length - 1), spareGas = S.tanks.slice(1).reduce((a, p) => a + p, 0);
  el.oSpare.textContent = spare ? `${spare} (${Math.round((spareGas * OXYGEN.bottleLitres) / S.flow / 60)}h more)` : 'none';
  el.oLoad.textContent = packLoad(S).toFixed(1) + ' kg';
  // conditions
  const w = weather.sample(game.time);
  el.wT.textContent = Math.round(env.T) + '°C';
  el.wWC.textContent = Math.round(env.wc) + '°C'; el.wWC.className = env.wc < -40 ? 'b' : env.wc < -25 ? 'w' : '';
  el.wWind.textContent = `${Math.round(env.wind)} km/h from ${compassName(w.dir)}`; el.wWind.className = env.wind > 80 ? 'b' : env.wind > 45 ? 'w' : '';
  el.wVis.textContent = env.vis > 10 ? '> 10 km' : env.vis >= 1 ? env.vis.toFixed(1) + ' km' : Math.round(env.vis * 1000) + ' m';
  el.wSky.textContent = w.S > 0.65 ? 'Storm' : w.S > 0.35 ? 'Snow' : w.S > 0.18 ? 'Cloudy' : env.sunEl > 0 ? 'Clear' : 'Clear night';
  // death zone
  const inDZ = y > DEATH_ZONE;
  el.dzTag.classList.toggle('hidden', !inDZ);
  if (inDZ) {
    el.dzTag.textContent = game.free ? 'DEATH ZONE · above 8,000 m' : flowing ? 'DEATH ZONE · on oxygen' : 'DEATH ZONE · NO OXYGEN — health draining';
    el.dzTag.classList.toggle('flash', !flowing && !game.free);
  }
  // status
  const pills = [], ropes = game.world.ropes;
  if (game.free) pills.push('<span class="pill on">Free viewing · [T] teleport</span>');
  if (P.clipped >= 0) pills.push(`<span class="pill on">Clipped: ${ropes[P.clipped].name}</span>`);
  if (game.auto) pills.push('<span class="pill on">Following route ⏩</span>');
  if (P.onLadder) pills.push('<span class="pill">On ladder</span>');
  if (S.spo2 < 65) pills.push('<span class="pill alert flash">Severe hypoxia</span>');
  if (S.o2on && !flowing) pills.push('<span class="pill alert">Oxygen empty</span>');
  if (flowing && cur < 40) pills.push('<span class="pill alert">Bottle low</span>');
  if (S.frost > 60) pills.push('<span class="pill alert">Frostbite</span>');
  if (S.exh > 80) pills.push('<span class="pill alert">Exhausted</span>');
  if (env.sunEl < 0.03) pills.push('<span class="pill">Headlamp</span>');
  el.status.innerHTML = pills.join('');
  // contextual prompt
  let pr = '';
  if (promptOverride && performance.now() < promptUntil) pr = promptOverride;
  else {
    const camp = nearCamp(P.x, P.z);
    if (camp) pr = game.free ? `[E] ${camp.name} — teleport, time of day` : `[E] ${camp.name} — rest, oxygen, forecast, save`;
    else if (P.clipped >= 0) {
      const other = nearestRope(P.x, P.z, P.clipped);
      pr = other.d < 5 ? `[E] Clip over to the ${ropes[other.rope].name}` : '';
    } else {
      const nr = nearestRope(P.x, P.z);
      if (nr.d < 6) pr = `[E] Clip into the ${ropes[nr.rope].name}`;
      else {
        for (const cv of game.world.crevasses) {
          const loc = crevasseLocal(cv, P.x, P.z, 4);
          if (loc && !(cv.ladder && Math.abs(loc.u) < 1.3)) { pr = cv.ladder ? 'Crevasse — cross on the ladder' : 'Crevasse! Keep away from the edge'; break; }
        }
        if (!pr && Math.atan(game.field.faceSlope(P.x, P.z)) / D2R > SLIP_ANGLE) pr = 'Steep, exposed ground — a slip here can be fatal without a rope';
        if (!pr && game.field.distanceToTrack(P.x, P.z) < 8 && !game.auto) pr = '[F] Follow the route (fast-forward)';
      }
    }
  }
  if (el.prompt.textContent !== pr) el.prompt.textContent = pr;
  drawGauge();
  minimap.draw();
  // hypoxia: blur, desaturation, tunnel vision; frost rime at the edges
  const blur = clamp((76 - S.spo2) / 5, 0, 4) + (P.falling ? 1 : 0), sat = 1 - clamp((72 - S.spo2) / 40, 0, 0.55);
  const filt = blur > 0.05 || sat < 0.99 ? `blur(${blur.toFixed(1)}px) saturate(${sat.toFixed(2)})` : 'none';
  if (el.canvas.style.filter !== filt) el.canvas.style.filter = filt;
  $('vignette').style.opacity = clamp((82 - S.spo2) / 30, 0, 0.85) + (S.health < 30 ? 0.2 : 0);
  $('frostOverlay').style.opacity = clamp((S.frost - 30) / 70, 0, 0.8);
}

function drawCompass() {
  const g = el.compass, W = 420, Hh = 40, { P, view } = game;
  g.clearRect(0, 0, W, Hh);
  const heading = (((-view.yaw / D2R) % 360) + 360) % 360;
  g.font = '12px system-ui'; g.textAlign = 'center';
  for (let d = -90; d <= 90; d += 5) {
    const aa = (((Math.round(heading + d)) % 360) + 360) % 360;
    if (aa % 5 !== 0) continue;
    const x = W / 2 + d * (W / 180), major = aa % 45 === 0;
    g.strokeStyle = `rgba(255,255,255,${major ? 0.9 : 0.35})`;
    g.beginPath(); g.moveTo(x, 4); g.lineTo(x, major ? 14 : 9); g.stroke();
    if (major) { g.fillStyle = aa === 0 ? '#ff6b5e' : '#fff'; g.fillText(compassName(aa), x, 30); }
  }
  const mark = (tx, tz, col, label, ly) => {
    const brg = (Math.atan2(tx - P.x, -(tz - P.z)) / D2R + 360) % 360, d = ((brg - heading + 540) % 360) - 180;
    if (Math.abs(d) > 90) return;
    const x = W / 2 + d * (W / 180);
    g.fillStyle = col; g.beginPath(); g.moveTo(x, 34); g.lineTo(x - 5, 40); g.lineTo(x + 5, 40); g.fill();
    g.font = '10px system-ui'; g.fillText(label, x, ly); g.font = '12px system-ui';
  };
  const ev = game.routes.main.pts.at(-1), lh = game.routes.lhotse.pts.at(-1);
  mark(ev.x, ev.z, '#ffd166', '▲ Everest', 24);
  mark(lh.x, lh.z, '#7cc8ff', '▲ Lhotse', 13);
  g.fillStyle = '#fff'; g.font = 'bold 13px system-ui'; g.fillText(Math.round(heading) + '°', W / 2, Hh - 1);
  g.strokeStyle = '#fff'; g.beginPath(); g.moveTo(W / 2, 0); g.lineTo(W / 2, 16); g.stroke();
}

function drawGauge() {
  const g = el.gauge, W = 52, Hh = 330, lo = 5000, hi = 9000, { S, P } = game;
  const yOf = (h) => Hh - 12 - ((h - lo) / (hi - lo)) * (Hh - 24);
  g.clearRect(0, 0, W, Hh);
  g.fillStyle = 'rgba(200,40,40,0.35)'; g.fillRect(8, yOf(hi), 10, yOf(DEATH_ZONE) - yOf(hi));
  g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(8, yOf(DEATH_ZONE), 10, yOf(lo) - yOf(DEATH_ZONE));
  g.fillStyle = 'rgba(95,211,141,0.6)'; g.fillRect(8, yOf(S.accl), 10, yOf(lo) - yOf(S.accl));
  g.font = '9px system-ui'; g.fillStyle = '#8fa1b3'; g.textAlign = 'left';
  for (let h = lo; h <= hi; h += 1000) { g.fillRect(18, yOf(h), 4, 1); g.fillText(h / 1000 + 'k', 24, yOf(h) + 3); }
  g.fillStyle = '#ffd166'; for (const c of game.camps) g.fillRect(4, yOf(c.elevation), 18, 1);
  g.fillStyle = '#ff9a8f'; g.fillRect(4, yOf(S.maxAlt), 18, 1);
  const y = yOf(P.y);
  g.fillStyle = '#fff'; g.beginPath(); g.moveTo(20, y); g.lineTo(30, y - 6); g.lineTo(30, y + 6); g.fill();
}
