// Expedition telemetry: time samples and events recorded during a climb, plus the analysis
// that powers the end-of-expedition debrief screen. Pure data - no UI imports.
import { DEATH_ZONE, TURNAROUND_H } from '../config.js';
import { on } from '../core/events.js';
import { dayOf, fmt, timeOfDay } from '../core/math.js';
import { CLIMBS, reachedSummits } from '../world/route.js';

const SAMPLE_STEP_H = 5 / 60;      // one sample per 5 game minutes
const MAX_SAMPLES = 6000;          // ~20 game days of telemetry

export const debrief = {
  t: -1e9,                         // time of the most recent sample
  samples: [],
  events: [],
  lastO2: { on: false, flow: 2 },
};

export function resetDebrief() {
  debrief.t = -1e9; debrief.samples = []; debrief.events = [];
  debrief.lastO2 = { on: false, flow: 2 };
}

export function recordSample(game, resting = false, force = false) {
  const S = game.S;
  if (!S || game.free || !S.tanks) return;
  if (!force && game.time - debrief.t < SAMPLE_STEP_H) return;
  const tanks = S.tanks;
  debrief.t = game.time;
  debrief.samples.push({
    t: game.time, y: game.P.y, sp: S.spo2, hp: S.health, ex: S.exh, fr: S.frost, ac: S.accl,
    on: S.o2on && tanks.length > 0 ? 1 : 0, fl: S.flow, b: tanks[0] || 0, n: tanks.length,
    tb: tanks.reduce((a, p) => a + p, 0), r: resting ? 1 : 0, w: game.env.wind || 0,
  });
  if (debrief.samples.length > MAX_SAMPLES) debrief.samples.splice(0, debrief.samples.length - MAX_SAMPLES);
}

// ---------------- event subscriptions (module side effect; importing this file is enough)
function note(type, text, data = {}) {
  debrief.events.push({ t: debrief.t, type, text, ...data });
}
on('camp', (c) => note('camp', `Arrived at ${c.name} · ${fmt(c.elevation)} m`, { y: c.elevation, short: c.short }));
on('summit', (id) => {
  const c = CLIMBS.find((c) => c.id === id);
  note('summit', `Summit — ${c.name}, ${fmt(c.e)} m`);
});
on('death', () => note('death', 'Expedition over'));
on('win', () => note('win', 'Back at Camp 2, alive'));
on('fall', (region, y) => note('fall', `Slipped on the ${region}`, { y }));
on('bottle', (spares) => note('bottle', spares > 0 ? `Oxygen bottle empty — ${spares} spare${spares === 1 ? '' : 's'} left` : 'Last oxygen bottle empty — no O₂ left'));
on('o2', (isOn, flow) => {
  const last = debrief.lastO2;
  if (isOn !== last.on) note('o2', isOn ? `Oxygen on — ${flow} L/min` : 'Oxygen off');
  else if (flow !== last.flow) note('o2', `Oxygen flow set to ${flow} L/min`);
  debrief.lastO2 = { on: isOn, flow };
});
on('checkpoint', (m) => note('checkpoint', `Passed ${m.title} · ${fmt(m.y)} m`, { y: m.y }));
on('rest', (hours, where) => note('rest', `Rested ${hours} h${where ? ' at ' + where : ''}`));

// ---------------- analysis
const dur = (h) => {
  const m = Math.round(h * 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`;
};

export function buildDebrief(game) {
  const S = game.S, s = debrief.samples;
  const d = {
    empty: s.length === 0, samples: s, events: debrief.events,
    startT: s.length ? s[0].t : game.time, endT: s.length ? s[s.length - 1].t : game.time,
    dzH: 0, dzNoO2H: 0, lateH: 0, lowSpH: 0, restH: 0, bottlesOut: 0,
    verdicts: [], camps: [], falls: [], summits: [], bottles: [],
  };
  if (d.empty) return d;
  let peak = s[0], minSp = s[0], lastDZ = null;
  for (let i = 0; i < s.length; i++) {
    const p = s[i];
    if (p.y > peak.y) peak = p;
    if (p.sp < minSp.sp) minSp = p;
    const dt = i ? p.t - s[i - 1].t : 0;
    if (p.y > DEATH_ZONE) {
      if (dt) {
        d.dzH += dt;
        if (!p.on) d.dzNoO2H += dt;
        if (((p.t % 24) + 24) % 24 >= TURNAROUND_H) d.lateH += dt;
      }
      lastDZ = p;
    }
    if (p.sp < 65) d.lowSpH += dt;
    if (p.r) d.restH += dt;
  }
  d.peak = peak; d.minSp = minSp; d.lastDZ = lastDZ;
  d.camps = d.events.filter((e) => e.type === 'camp');
  d.falls = d.events.filter((e) => e.type === 'fall');
  d.summits = d.events.filter((e) => e.type === 'summit');
  d.bottles = d.events.filter((e) => e.type === 'bottle');
  d.bottlesOut = d.bottles.length;

  const v = d.verdicts, summits = reachedSummits(S), reached = summits.length > 0;
  if (reached) {
    if (d.lateH > 0.4) v.push({ sev: 'bad', text: `Turnaround: still above 8,000 m after 14:00 for ${dur(d.lateH)}${lastDZ ? ` (last at ${timeOfDay(lastDZ.t)} on Day ${dayOf(lastDZ.t)})` : ''}. The afternoon wind and a thinning oxygen budget are why the turnaround exists.` });
    else if (d.dzH > 0.4) v.push({ sev: 'good', text: 'Turnaround discipline: off the summit ridge before the 14:00 deadline.' });
  }
  if (d.dzNoO2H > 0.2) v.push({ sev: (S.lastDamage === 'deathzone' || S.lastDamage === 'hypoxia') ? 'bad' : 'warn',
    text: `${dur(d.dzNoO2H)} above 8,000 m without supplemental oxygen${S.summits.everest && S.summitNoO2.everest ? ' — the hard way, and you survived it' : ''}. Above 8,000 m the body cannot acclimatize.` });
  else if (d.dzH > 0.4 && reached) v.push({ sev: 'good', text: `Bottled oxygen ran the entire ${dur(d.dzH)} above 8,000 m.` });
  if (d.lowSpH > 0.2) v.push({ sev: d.lowSpH > 1 ? 'bad' : 'warn',
    text: `Blood oxygen fell below 65% for ${dur(d.lowSpH)} — lowest ${Math.round(minSp.sp)}% at ${fmt(minSp.y)} m (Day ${dayOf(minSp.t)} ${timeOfDay(minSp.t)}).` });
  if (reached) {
    const ac = Math.round(peak.ac);
    if (ac < 6300) v.push({ sev: 'bad', text: `Summited acclimatized only to ~${fmt(ac)} m. Rotations up to Camp 2 and Camp 3 raise your SpO₂ and your reserve.` });
    else if (ac < 6900) v.push({ sev: 'warn', text: `Summited acclimatized to ~${fmt(ac)} m — on the thin side. Another night high before the push pays for itself.` });
    else v.push({ sev: 'good', text: `Well acclimatized: ~${fmt(ac)} m at the high point.` });
  }
  if (d.bottlesOut >= 2) v.push({ sev: 'warn', text: `${d.bottlesOut} oxygen bottles drained. Stage and swap earlier so you never trade flow for fear of running dry.` });
  if (S.frost >= 20) v.push({ sev: S.frost >= 55 ? 'bad' : 'warn', text: `Frostbite risk reached ${Math.round(S.frost)}%. Wind chill, more than altitude, is what costs fingers.` });
  if (S.falls) v.push({ sev: 'warn', text: `${S.falls} slip${S.falls > 1 ? 's' : ''} on the mountain. Ropes and self-arrest are what kept this from being worse.` });
  if (game.mode === 'won') v.push({ sev: 'good', text: summits.length > 1
    ? `${summits.map((c) => c.short).join(' + ')} and a safe descent to Camp 2 in one expedition.`
    : 'Summit and a safe descent to Camp 2 — the expedition succeeded.' });
  const rank = { bad: 0, warn: 1, good: 2 };
  v.sort((a, bb) => rank[a.sev] - rank[bb.sev]);
  return d;
}
