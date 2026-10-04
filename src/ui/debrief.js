// End-of-expedition debrief screen: altitude / SpO2 / oxygen chart, verdicts, decision journal
// and key numbers. Rendered into #scrDebrief (see index.html) and opened from the death/win cards.
import { DEATH_ZONE } from '../config.js';
import { dayOf, fmt, timeOfDay, clamp } from '../core/math.js';
import { game, score } from '../sim/game.js';
import { buildDebrief } from '../sim/debrief.js';
import { CLIMBS, reachedSummits } from '../world/route.js';

const $ = (id) => document.getElementById(id);
const ICONS = { camp: '▣', summit: '▲', death: '✝', win: '✔', fall: '✕', bottle: '◯', o2: 'O₂', rest: '…', start: '▶' };
let current = null, hover = -1, layout = null;

export function renderDebrief() {
  current = buildDebrief(game);
  hover = -1;
  const S = game.S;
  $('dbTitle').textContent = game.mode === 'won' ? 'Debrief — back at Camp 2' : 'Debrief — expedition over';
  const reached = reachedSummits(S);
  $('dbSub').textContent = S.cause || (reached.length ? `${reached.map((c) => c.name).join(' + ')} summited.` : 'No summit reached.');
  $('dbVerdict').innerHTML = current.empty ? '' : current.verdicts.map((v) =>
    `<div class="vd ${v.sev}"><span class="ic">${v.sev === 'bad' ? '✕' : v.sev === 'warn' ? '!' : '✓'}</span><span>${v.text}</span></div>`).join('');
  drawStats(current);
  drawJournal(current);
  const cv = $('dbChart');
  if (!cv.dataset.bound) {
    cv.dataset.bound = '1';
    cv.addEventListener('mousemove', (e) => {
      if (!current || current.empty) return;
      const r = cv.getBoundingClientRect();
      const tB = Math.max(current.endT, current.startT + 0.6);
      const t = current.startT + ((e.clientX - r.left) / Math.max(1, r.width)) * (tB - current.startT);
      hover = nearestIdx(current.samples, t);
      drawChart(current, hover);
      showTip(e);
    });
    cv.addEventListener('mouseleave', () => {
      hover = -1;
      if (current) drawChart(current, -1);
      $('dbTip').classList.add('hidden');
    });
  }
  drawChart(current, -1);
  $('dbTip').classList.add('hidden');
}

function nearestIdx(s, t) {
  let lo = 0, hi = s.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (s[m].t < t) lo = m; else hi = m; }
  return Math.abs(s[lo].t - t) <= Math.abs(s[hi].t - t) ? lo : hi;
}

function drawStats(d) {
  const S = game.S;
  const when = (k) => (S.summits[k] ? `Day ${dayOf(S.summitTimes[k])} ${timeOfDay(S.summitTimes[k])}${S.summitNoO2[k] ? ' · no O₂' : ''}` : '—');
  const list = [
    ['Score', fmt(score())],
    ['Highest point', d.empty ? '—' : fmt(d.peak.y) + ' m'],
    ...CLIMBS.map((c) => [c.short, when(c.id)]),
    ['Expedition time', `${Math.floor(game.time / 24)} d ${Math.floor(game.time % 24)} h`],
    ['Distance walked', (S.distance / 1000).toFixed(1) + ' km'],
    ['Falls', S.falls],
    ['O₂ bottles drained', d.bottlesOut],
    ['Time above 8,000 m', d.dzH.toFixed(1) + ' h'],
    ['Above 8,000 m without O₂', d.dzNoO2H > 0.02 ? d.dzNoO2H.toFixed(1) + ' h' : 'none'],
    ['Lowest SpO₂', d.empty ? '—' : Math.round(d.minSp.sp) + '%'],
    ['Frostbite', Math.round(S.frost) + '%'],
  ];
  $('dbStats').innerHTML = list.map(([k, v]) => `<div class="stat"><div class="k">${k}</div><div class="v">${v}</div></div>`).join('');
}

function drawJournal(d) {
  if (d.empty) { $('dbJournal').innerHTML = '<p class="note">No telemetry recorded.</p>'; return; }
  const row = (type, t, text) => `<div class="evt ${type}"><span class="t">D${dayOf(t)} ${timeOfDay(t)}</span><span class="ic">${ICONS[type] || '·'}</span><span>${text}</span></div>`;
  const rows = [row('start', d.startT, `Expedition starts at ${fmt(d.samples[0].y)} m`)];
  for (const e of d.events) rows.push(row(e.type, e.t, e.text));
  $('dbJournal').innerHTML = rows.join('');
}

// ---------------- chart
function drawChart(d, hiIdx) {
  const cv = $('dbChart'), ctx = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#12202f'); bg.addColorStop(1, '#0a121b');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  if (!d || d.empty) {
    ctx.fillStyle = '#8fa1b3'; ctx.font = '26px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('No telemetry recorded for this expedition.', W / 2, H / 2);
    layout = null; return;
  }
  const s = d.samples;
  const x0 = 104, x1 = W - 34, y0 = 34, y1 = H - 72;
  const tA = d.startT, tB = Math.max(d.endT, tA + 0.6);
  let amin = Infinity, amax = -Infinity;
  for (const p of s) { amin = Math.min(amin, p.y); amax = Math.max(amax, p.y); }
  const lo = Math.max(0, Math.floor((amin - 200) / 500) * 500);
  const hi = Math.max(Math.ceil((amax + 250) / 500) * 500, DEATH_ZONE + 400);
  const X = (t) => x0 + ((t - tA) / (tB - tA)) * (x1 - x0);
  const Y = (a) => y1 - ((clamp(a, lo, hi) - lo) / (hi - lo)) * (y1 - y0);
  layout = { X, Y };

  // altitude grid
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  for (let a = lo; a <= hi + 1; a += 250) {
    const major = a % 1000 === 0;
    ctx.strokeStyle = major ? 'rgba(255,255,255,0.13)' : 'rgba(255,255,255,0.045)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x0, Y(a)); ctx.lineTo(x1, Y(a)); ctx.stroke();
    if (major) { ctx.fillStyle = 'rgba(143,161,179,0.95)'; ctx.font = '22px system-ui'; ctx.fillText(fmt(a), x0 - 12, Y(a)); }
  }
  // death zone band
  if (hi > DEATH_ZONE) {
    ctx.fillStyle = 'rgba(255,90,79,0.10)';
    ctx.fillRect(x0, Y(hi), x1 - x0, Y(DEATH_ZONE) - Y(hi));
    ctx.strokeStyle = 'rgba(255,90,79,0.5)'; ctx.setLineDash([9, 7]); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x0, Y(DEATH_ZONE)); ctx.lineTo(x1, Y(DEATH_ZONE)); ctx.stroke(); ctx.setLineDash([]);
    if (Y(DEATH_ZONE) - Y(hi) > 30) {
      ctx.fillStyle = 'rgba(255,120,110,0.95)'; ctx.font = '700 22px system-ui'; ctx.textAlign = 'left';
      ctx.fillText('DEATH ZONE · 8,000 m', x0 + 12, Y(DEATH_ZONE) - 16);
    }
  }
  // time grid
  const span = tB - tA, step = span <= 8 ? 1 : span <= 30 ? 6 : span <= 90 ? 12 : 24;
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  for (let t = Math.ceil(tA / step) * step; t <= tB + 1e-6; t += step) {
    const midnight = ((t % 24) + 24) % 24 < 1e-6;
    ctx.strokeStyle = midnight ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.055)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(X(t), y0); ctx.lineTo(X(t), y1); ctx.stroke();
    ctx.fillStyle = 'rgba(143,161,179,0.95)'; ctx.font = '20px system-ui';
    ctx.fillText(midnight ? `Day ${dayOf(t)}` : `${String(Math.floor(((t % 24) + 24) % 24)).padStart(2, '0')}h`, X(t), y1 + 14);
  }
  // altitude area + line coloured by SpO2
  ctx.beginPath(); ctx.moveTo(X(s[0].t), Y(lo));
  for (const p of s) ctx.lineTo(X(p.t), Y(p.y));
  ctx.lineTo(X(s[s.length - 1].t), Y(lo)); ctx.closePath();
  ctx.fillStyle = 'rgba(140,200,255,0.09)'; ctx.fill();
  ctx.lineWidth = 4; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  for (let i = 1; i < s.length; i++) {
    const a = s[i - 1];
    ctx.strokeStyle = a.sp >= 80 ? '#7fd8a8' : a.sp >= 68 ? '#f2c14e' : '#ff5a4f';
    ctx.beginPath(); ctx.moveTo(X(a.t), Y(a.y)); ctx.lineTo(X(s[i].t), Y(s[i].y)); ctx.stroke();
  }
  if (s.length === 1) { ctx.fillStyle = '#7fd8a8'; ctx.beginPath(); ctx.arc(X(s[0].t), Y(s[0].y), 6, 0, 7); ctx.fill(); }
  // oxygen strip
  const sy = y1 + 34, sh = 16;
  ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fillRect(x0, sy, x1 - x0, sh);
  for (let i = 1; i < s.length; i++) {
    const a = s[i - 1];
    if (!a.on) continue;
    ctx.fillStyle = `rgba(79,183,255,${0.3 + 0.7 * clamp(a.b / 300, 0, 1)})`;
    ctx.fillRect(X(a.t), sy, Math.max(1.5, X(s[i].t) - X(a.t)), sh);
  }
  ctx.fillStyle = 'rgba(143,161,179,0.95)'; ctx.font = '20px system-ui'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  ctx.fillText('O₂', x0 - 12, sy + sh / 2);
  // markers
  const at = (t) => { const i = nearestIdx(s, t); return s[i]; };
  const tag = (text, x, y, color) => {
    const below = y - 40 < y0 + 6;
    ctx.fillStyle = color; ctx.font = '700 19px system-ui'; ctx.textAlign = 'center';
    ctx.textBaseline = below ? 'top' : 'bottom';
    ctx.fillText(text, clamp(x, x0 + 30, x1 - 30), below ? y + 13 : y - 13);
  };
  for (const e of d.camps) {
    const p = at(e.t), x = X(e.t), y = Y(e.y ?? p.y);
    ctx.fillStyle = '#e8eef5';
    ctx.beginPath(); ctx.moveTo(x, y - 8); ctx.lineTo(x + 8, y); ctx.lineTo(x, y + 8); ctx.lineTo(x - 8, y); ctx.closePath(); ctx.fill();
    tag(e.short || 'camp', x, y, 'rgba(232,238,245,0.95)');
  }
  for (const e of d.summits) {
    const p = at(e.t), x = X(e.t), y = Y(p.y);
    ctx.fillStyle = '#f2c14e';
    ctx.beginPath(); ctx.moveTo(x, y - 12); ctx.lineTo(x + 11, y + 3); ctx.lineTo(x - 11, y + 3); ctx.closePath(); ctx.fill();
    tag('SUMMIT', x, y, '#f2c14e');
  }
  for (const e of d.falls) {
    const p = at(e.t), x = X(e.t), y = Y(e.y ?? p.y);
    ctx.strokeStyle = '#ff5a4f'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x - 6, y - 6); ctx.lineTo(x + 6, y + 6); ctx.moveTo(x + 6, y - 6); ctx.lineTo(x - 6, y + 6); ctx.stroke();
  }
  if (game.mode === 'dead') {
    const p = s[s.length - 1];
    ctx.strokeStyle = '#ffb3ad'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(X(p.t), Y(p.y) - 9); ctx.lineTo(X(p.t), Y(p.y) + 9);
    ctx.moveTo(X(p.t) - 8, Y(p.y) - 2); ctx.lineTo(X(p.t) + 8, Y(p.y) - 2); ctx.stroke();
    tag('died here', X(p.t), Y(p.y), '#ffb3ad');
  }
  // hover crosshair + frame
  if (hiIdx >= 0 && hiIdx < s.length) {
    const p = s[hiIdx];
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1.5; ctx.setLineDash([6, 5]);
    ctx.beginPath(); ctx.moveTo(X(p.t), y0); ctx.lineTo(X(p.t), y1); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(X(p.t), Y(p.y), 6, 0, 7); ctx.fill();
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.14)'; ctx.lineWidth = 1; ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
}

function showTip(ev) {
  if (!current || current.empty || hover < 0 || !layout) return $('dbTip').classList.add('hidden');
  const p = current.samples[hover], cv = $('dbChart'), wrap = cv.parentElement, tip = $('dbTip');
  const r = cv.getBoundingClientRect(), wr = wrap.getBoundingClientRect(), scale = r.width / cv.width;
  tip.innerHTML = `<b>Day ${dayOf(p.t)} · ${timeOfDay(p.t)}</b> · ${fmt(p.y)} m<br>SpO₂ ${Math.round(p.sp)}% · health ${Math.round(p.hp)}% · ${p.r ? 'resting' : 'on the move'}<br>` +
    (p.on ? `O₂ ${p.fl} L/min · bottle ${Math.round(p.b)} bar · ${p.n} carried` : 'O₂ off');
  tip.classList.remove('hidden');
  tip.style.left = `${layout.X(p.t) * scale + (r.left - wr.left)}px`;
  tip.style.top = `${layout.Y(p.y) * scale + (r.top - wr.top)}px`;
}
