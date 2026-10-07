// Title, pause, camp, death and victory screens, and the play/pause/pointer-lock flow.
import { OXYGEN, TURNAROUND_H } from '../config.js';
import { fmt, timeOfDay, dayOf, hourOfDay, clamp } from '../core/math.js';
import { on, emit, toast } from '../core/events.js';
import { mulberry32 } from '../core/noise.js';
import { game, newGame, load, save, hasSave, restHours, campAction, toggleO2, region, score,
  destinations, teleportTo, enterFreeViewing, exitFreeViewing, setHour, setClearWeather, setSpeedMul } from '../sim/game.js';
import { nearestRope, clipTo, startAutopilot } from '../sim/player.js';
import { resetHUD } from './hud.js';
import { isEmptyBottle } from '../sim/physiology.js';
import { renderDebrief } from './debrief.js';
import { QUALITY_PRESETS, currentQuality } from '../render/quality.js';
import { FRAME_CAPS, initialFrameCap } from '../render/framePacing.js';
import { CLIMBS, reachedSummits } from '../world/route.js';

const $ = (id) => document.getElementById(id);
const SCREENS = ['scrTitle', 'scrPause', 'scrCamp', 'scrDead', 'scrWin', 'scrDebrief', 'scrLoading'];
let canvas, currentCamp = null, pausedAt = 0, expectUnlock = false, debriefReturn = 'scrDead';
let rayTracingStatus = { requested: false, status: 'Off' };
on('rayTracingStatus', status => { rayTracingStatus = status; renderRayTracing(); });
function renderRayTracing() {
  for (const box of document.querySelectorAll('[data-ray-tracing]')) {
    const strength = rayTracingStatus.strength || 'normal';
    const levels = [['subtle', 'Subtle'], ['normal', 'Normal'], ['strong', 'Strong']]
      .map(([id, label]) => `<button data-rt-strength="${id}" class="${id === strength ? 'active' : ''}" ${rayTracingStatus.requested ? '' : 'disabled'}>${label}</button>`).join('');
    box.innerHTML = `<label><input type="checkbox" data-rt-toggle ${rayTracingStatus.requested ? 'checked' : ''}> Ray-traced lighting</label>
      <span class="qbtns" style="margin-left:8px">${levels}</span><small class="dim" style="display:block">${rayTracingStatus.status}</small>`;
  }
}

function show(id) {
  for (const s of SCREENS) $(s).classList.toggle('hidden', s !== id);
  document.body.dataset.screen = id || '';        // CSS hides HUD warnings under modal screens
}

/** Low / Medium / High buttons on the title and pause screens. */
function renderQualityButtons() {
  for (const box of document.querySelectorAll('[data-quality-buttons]')) {
    box.innerHTML = Object.entries(QUALITY_PRESETS).map(([id, q]) => `<button data-quality="${id}" class="${id === currentQuality() ? 'active' : ''}">${q.label}</button>`).join('');
  }
}

/** Frame-rate limit buttons (30 / 60 / 120 / Max) next to the quality buttons. */
let frameCap = initialFrameCap();
function renderFpsButtons() {
  for (const box of document.querySelectorAll('[data-fps-buttons]')) {
    box.innerHTML = Object.entries(FRAME_CAPS).map(([id, c]) => `<button data-fps="${id}" class="${id === frameCap ? 'active' : ''}">${c.label}</button>`).join('');
  }
}

export function initScreens(glCanvas) {
  canvas = glCanvas;
  renderQualityButtons();
  renderFpsButtons();
  renderRayTracing();
  document.addEventListener('change', e => { if (e.target.matches('[data-rt-toggle]')) emit('setRayTracing', e.target.checked); });
  document.addEventListener('click', (e) => {
    const rs = e.target.closest('[data-rt-strength]');
    if (rs) { emit('setRayTracingStrength', rs.dataset.rtStrength); return; }
    const fb = e.target.closest('[data-fps]');
    if (fb) { frameCap = fb.dataset.fps; emit('setFrameCap', frameCap); renderFpsButtons(); return; }
    const b = e.target.closest('[data-quality]');
    if (!b) return;
    emit('setQuality', b.dataset.quality);
    renderQualityButtons();
  });
  $('btnNew').onclick = () => { emit('userGesture'); newGame(Math.floor(Math.random() * 1e9)); save(true); resetHUD(); introToasts(); resumePlay(); };
  $('btnFree').onclick = () => {
    emit('userGesture'); newGame(Math.floor(Math.random() * 1e9), { free: true }); resetHUD(); resumePlay();
    toast('Free viewing: pick a camp or summit to teleport to. Press T at any time to open this panel again.', 'info', 7);
    openTravel();
  };
  $('btnContinue').onclick = () => {
    emit('userGesture');
    if (load()) { resetHUD(); toast('Expedition loaded.', 'good'); resumePlay(); return; }
    // the HUD (and its toasts) is hidden on the title screen, so explain here
    $('titleMsg').textContent = 'The saved expedition could not be read and has been discarded. Start a new expedition.';
    $('btnContinue').disabled = !hasSave();
  };
  $('btnResume').onclick = () => resumePlay();
  $('btnLoadSave').onclick = () => { if (load()) { resetHUD(); toast('Loaded last save.', 'good'); resumePlay(); } };
  $('btnQuit').onclick = () => showTitle();
  $('btnDeadLoad').onclick = () => { if (load()) { resetHUD(); toast('Loaded last save.', 'good'); resumePlay(); } };
  $('btnDeadNew').onclick = () => $('btnNew').onclick();
  $('btnWinContinue').onclick = () => resumePlay();
  $('btnWinNew').onclick = () => $('btnNew').onclick();
  const openDebrief = (from) => { debriefReturn = from; show('scrDebrief'); renderDebrief(); };
  $('btnDeadDebrief').onclick = () => openDebrief('scrDead');
  $('btnWinDebrief').onclick = () => openDebrief('scrWin');
  $('btnDbClose').onclick = () => show(debriefReturn);
  $('btnDbRetry').onclick = $('btnDeadLoad').onclick;
  $('btnDbNew').onclick = () => $('btnNew').onclick();
  $('campCard').addEventListener('click', onCampClick);
  on('openCamp', openCamp);
  on('openTravel', () => openTravel());
  on('teleported', () => resetHUD());
  on('death', showDeath);
  on('win', showWin);
  document.addEventListener('pointerlockchange', () => {
    const locked = document.pointerLockElement === canvas;
    game.locked = locked;
    if (!locked) {
      if (expectUnlock) expectUnlock = false;            // we released it ourselves
      else if (game.mode === 'play') pause();
    } else if (game.mode !== 'play') releasePointer();   // a late lock must never trap a menu
  });
  canvas.addEventListener('click', () => { if (game.mode === 'play' && !document.pointerLockElement) lockPointer(); });
}

export function lockPointer() { try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch { /* unsupported */ } }
export function releasePointer() { if (document.pointerLockElement) { expectUnlock = true; document.exitPointerLock(); } }

export function showTitle() {
  game.mode = 'title';
  $('hud').classList.add('hidden');
  $('btnContinue').disabled = !hasSave();
  $('titleMsg').textContent = '';
  show('scrTitle');
}
export function resumePlay() {
  game.mode = 'play'; currentCamp = null;
  show(null);
  $('hud').classList.remove('hidden');
  lockPointer();
}
export function pause() {
  if (game.mode !== 'play') return;
  game.mode = 'paused'; pausedAt = performance.now();
  releasePointer();
  show('scrPause');
}
export function escapePressed() {
  if (game.mode === 'play') pause();
  else if (game.mode === 'paused' && performance.now() - pausedAt > 500) resumePlay();
  else if (game.mode === 'camp') resumePlay();
}

function introToasts() {
  [
    'Day 1 at Everest Base Camp. Follow the red wands east into the Khumbu Icefall.',
    'Cross crevasses only on the ladders. Clip into fixed ropes with E on steep ground.',
    'Press F near the wands to follow the route with time fast-forwarded ×4.',
    'Acclimatize: rest at Camps 2 and 3 before the summit push. Camps have forecasts and oxygen.',
    'Most climbers start bottled oxygen around Camp 3 (O to toggle, 1–4 for flow).',
  ].forEach((m, i) => setTimeout(() => game.mode === 'play' && toast(m, 'info', 7), 800 + i * 3800));
}

// ---------------- camp
function openCamp(camp) {
  currentCamp = camp; game.mode = 'camp'; game.auto = null;
  releasePointer();
  if (game.free) renderTravel(); else renderCamp();
  show('scrCamp');
}
/** Free-viewing panel: teleport to any camp or summit, set the time of day and the weather. */
export function openTravel() {
  if (game.mode !== 'play' && game.mode !== 'camp') return;
  currentCamp = null; game.mode = 'camp'; game.auto = null;
  releasePointer();
  renderTravel();
  show('scrCamp');
}
function renderTravel() {
  const here = region(), hod = hourOfDay(game.time), clear = !!game.weather.clear;
  const dests = destinations().map((d) => `<button data-act="tp" data-id="${d.id}" class="${d.summit ? 'primary' : ''}">${d.name}<br><span class="dim" style="font-size:11px">${fmt(d.elevation)} m</span></button>`).join('');
  const hours = [[5.3, 'Sunrise'], [8, 'Morning'], [12, 'Noon'], [17, 'Afternoon'], [18.6, 'Sunset'], [1, 'Night']];
  const speeds = [1, 2, 4, 8, 16].map((m) => `<button data-act="speed" data-m="${m}" ${game.speedMul === m ? 'disabled' : ''}>×${m}</button>`).join('');
  const time = hours.map(([h, n]) => `<button data-act="hour" data-h="${h}" ${Math.abs(hod - h) < 0.4 ? 'disabled' : ''}>${n}</button>`).join('');
  $('campCard').innerHTML = `
    <h2>Free viewing <span class="dim" style="font-weight:400">· ${here} · ${fmt(game.P.y)} m</span></h2>
    <p>Teleport anywhere on the route. Survival systems are off — no hypoxia, cold or injury — and nothing is saved, so your
      expedition save is kept. Walk, look around, or press <kbd>F</kbd> to follow the route from wherever you land.</p>
    <h3>Teleport</h3>
    <div class="btns dest">${dests}</div>
    <h3>Time of day · Day ${dayOf(game.time)}, ${timeOfDay(game.time)}</h3>
    <div class="btns">${time}</div>
    <h3>Weather</h3>
    <div class="btns">
      <button data-act="clear" data-on="1" ${clear ? 'disabled' : ''}>Clear skies</button>
      <button data-act="clear" data-on="0" ${clear ? '' : 'disabled'}>Real forecast weather</button>
    </div>
    <h3>Walk speed <span class="dim" style="font-weight:400">· debug</span></h3>
    <div class="btns">${speeds}</div>
    <h3>Physics experiments</h3>
    <p class="note">Try a fall with J or release an avalanche with B. Hold Space to self-arrest or escape shallow burial.
      Crevasses have physical depth and can trap you. Injuries are disabled here. Shift+B resets physics and returns you to supported ground.</p>
    <div class="btns"><button data-act="test-fall">Test fall</button><button data-act="avalanche">Release avalanche</button><button data-act="reset-physics">Reset experiment</button></div>
    <h3>Climb for real</h3>
    <p class="note">Survival systems back on, right here: a fresh expedition from where you stand, acclimatized as after the
      rotations and on oxygen above 7,000 m. Your old save is kept until you rest or save at a camp.</p>
    <div class="btns">
      <button data-act="exit-free">Exit free viewing — climb on from here</button>
    </div>
    <div class="btns" style="margin-top:16px">
      <button data-act="new-exp">Start a real expedition</button>
      ${hasSave() ? '<button data-act="continue-exp">Continue saved expedition</button>' : ''}
      <button class="primary" data-act="leave-camp">Close</button>
    </div>`;
}
function forecastRows() {
  const W = game.weather, rows = [], start = Math.ceil(game.time / 12) * 12, r = mulberry32(Math.floor(start) * 131 + game.S.seed);
  const nuptse = currentCamp.route === 'nuptse';
  for (let k = 0; k < 10; k++) {
    const t0 = start + k * 12;
    let wsum = 0, tmin = 99, smax = 0;
    for (let h = 0; h < 12; h++) { wsum += W.wind(nuptse ? 7861 : 8849, t0 + h, 1.15); smax = Math.max(smax, W.sample(t0 + h).S); tmin = Math.min(tmin, W.temperature(nuptse ? currentCamp.elevation : 7900, t0 + h, 0, false)); }
    const lead = (t0 - game.time) / 24;
    const wind = Math.max(5, wsum / 12 + (r() - 0.5) * 2 * lead * 7), snowp = clamp(smax * 100 + (r() - 0.5) * lead * 12, 0, 100);
    const v = wind < 40 && snowp < 45 ? ['Summit window', 'g'] : wind < 70 ? ['Marginal', 'w'] : ['Jet stream', 'b'];
    rows.push(`<tr><td>Day ${dayOf(t0)} ${hourOfDay(t0) < 12 ? '00–12h' : '12–24h'}</td><td class="${v[1]}">${Math.round(wind)} km/h</td><td>${Math.round(tmin)}°C</td><td>${Math.round(snowp)}%</td><td class="${v[1]}">${v[0]}</td></tr>`);
  }
  return rows.join('');
}
function renderCamp() {
  const c = currentCamp, S = game.S, P = game.P, hod = hourOfDay(game.time);
  const stock = c.id === 'ebc' ? '∞' : S.stock[c.id];
  const tanks = S.tanks.map((p, i) => `<div class="tank ${i === 0 ? 'cur' : ''}"><div class="lvl"><div style="height:${(p / OXYGEN.bottleBar) * 100}%"></div></div>${Math.round(p)} bar</div>`).join('') || '<span class="dim">No bottles carried</span>';
  const nr = nearestRope(P.x, P.z);
  const ropeBtn = P.clipped >= 0 ? '<button data-act="unclip">Unclip from rope</button>' : nr.d < 8 ? `<button data-act="clip">Clip into ${game.world.ropes[nr.rope].name}</button>` : '';
  const recov = S.spo2 >= 80 ? 'good' : S.spo2 >= 72 ? 'slow' : S.spo2 >= 66 ? 'very slow' : 'none — too high to recover';
  const full = OXYGEN.bottleBar;
  $('campCard').innerHTML = `
    <h2>${c.name} <span class="dim" style="font-weight:400">· ${fmt(c.elevation)} m</span></h2>
    <p>Day ${dayOf(game.time)}, ${timeOfDay(game.time)} · SpO₂ ${Math.round(S.spo2)}% · Health ${Math.round(S.health)} · Exhaustion ${Math.round(S.exh)}% ·
      Acclimatized to ~${fmt(S.accl)} m · Recovery while resting here: <b>${recov}</b>.</p>
    <h3>Rest &amp; wait out the weather</h3>
    <div class="btns">
      <button data-act="rest" data-h="1">Rest 1 h</button><button data-act="rest" data-h="6">Rest 6 h</button><button data-act="rest" data-h="12">Rest 12 h</button>
      <button data-act="rest" data-h="${(23 - hod + 24) % 24 || 24}">Rest until 23:00${['c4', 'lhotse_c4', 'nuptse_c3'].includes(c.id) ? ' (summit push)' : ''}</button>
      <button data-act="rest" data-h="${(5 - hod + 24) % 24 || 24}">Rest until 05:00</button>
    </div>
    <p class="note">Resting restores stamina and reduces exhaustion; sleeping lower recovers faster. Time spent high raises acclimatization.
      Sleeping on oxygen uses your bottle if the flow is on (${S.o2on ? 'on' : 'off'}, ${S.flow} L/min).</p>
    <h3>Oxygen — camp stock: ${stock} full bottle${stock === 1 ? '' : 's'}</h3>
    <div class="tanklist">${tanks}</div>
    <div class="btns">
      <button data-act="take" ${S.stock[c.id] > 0 && S.tanks.length < OXYGEN.maxCarried ? '' : 'disabled'}>Take a full bottle</button>
      <button data-act="leave" ${S.tanks.some((p) => p > full - 10) ? '' : 'disabled'}>Cache a full bottle here</button>
      <button data-act="swap" ${S.tanks.length > 1 || (S.tanks.length && S.tanks[0] < full - 10 && S.stock[c.id] > 0) ? '' : 'disabled'}>Swap to fullest bottle</button>
      <button data-act="dump" ${S.tanks.some(isEmptyBottle) ? '' : 'disabled'}>Drop empty bottles</button>
      <button data-act="o2">${S.o2on ? 'Turn oxygen off' : 'Turn oxygen on'}</button>
    </div>
    <p class="note">Carry at most ${OXYGEN.maxCarried} bottles. A full 4 L bottle (300 bar) weighs 3.6 kg and lasts ~10 h at 2 L/min, ~5 h at 4 L/min.</p>
    ${c.id === 'c2' ? `<h3>Choose your climb</h3>
    <p class="note">Continue toward Everest and Lhotse, or take the purple branch across the Western Cwm to Nuptse.</p>
    <div class="btns"><button data-act="follow" data-route="main">Follow toward Everest / Lhotse</button>
      <button data-act="follow" data-route="nuptse">Climb Nuptse · purple route</button></div>` : ''}
    <h3>Forecast — summit (${c.route === 'nuptse' ? '7,861' : '8,849'} m) winds</h3>
    <table class="fc"><tr><th>Period</th><th>Summit wind</th><th>Min temp ${c.route === 'nuptse' ? 'High Camp' : 'South Col'}</th><th>Snow</th><th></th></tr>${forecastRows()}</table>
    <p class="note">Look for summit winds below ~40 km/h. ${c.route === 'nuptse' ? 'Leave high camp early and plan a safe descent' : 'Leave the South Col around 23:00 and turn around'} by ${TURNAROUND_H}:00.</p>
    ${c.id === 'ebc' ? `<h3>Free viewing</h3>
    <p class="note">Teleport to any camp or summit to look around. This switches to free viewing: survival systems turn off and
      nothing is saved, so this expedition stays in your save — continue it later from the title screen.</p>
    <div class="btns"><button data-act="free">Free viewing — teleport to a camp or summit</button></div>` : ''}
    <div class="btns" style="margin-top:14px">
      <button data-act="save">Save progress</button>${ropeBtn}
      <button class="primary" data-act="leave-camp">Leave camp</button>
    </div>`;
}
function onCampClick(e) {
  const b = e.target.closest('button'); if (!b) return;
  const act = b.dataset.act, P = game.P;
  if (act === 'rest') { if (restHours(Number(b.dataset.h)) && game.mode === 'camp') renderCamp(); return; }
  if (act === 'free') { save(true); enterFreeViewing(); renderTravel(); return; }
  if (act === 'tp') { teleportTo(b.dataset.id); resumePlay(); return; }
  if (act === 'hour') { setHour(Number(b.dataset.h)); renderTravel(); return; }
  if (act === 'clear') { setClearWeather(b.dataset.on === '1'); renderTravel(); return; }
  if (act === 'speed') { setSpeedMul(Number(b.dataset.m)); renderTravel(); return; }
  if(act==='test-fall') { resumePlay(); game.physics.testFall(); return; }
  if(act==='avalanche') { resumePlay(); game.physics.triggerAvalanche(); return; }
  if(act==='reset-physics') { game.physics.resetExperiment(); renderTravel(); return; }
  if (act === 'exit-free') { exitFreeViewing(); resetHUD(); resumePlay(); return; }
  if (act === 'new-exp') { $('btnNew').onclick(); return; }
  if (act === 'continue-exp') { $('btnContinue').onclick(); return; }
  if (act === 'follow') { resumePlay(); startAutopilot({ routeName: b.dataset.route, direction: 1 }); return; }
  if (act === 'o2') toggleO2();
  else if (act === 'save') save();
  else if (act === 'clip') clipTo(nearestRope(P.x, P.z).rope);
  else if (act === 'unclip') P.clipped = -1;
  else if (act === 'leave-camp') { resumePlay(); return; }
  else campAction(act, currentCamp);
  renderCamp();
}

// ---------------- end screens
const stats = (list) => list.map(([k, v]) => `<div class="stat"><div class="k">${k}</div><div class="v">${v}</div></div>`).join('');
function showDeath(cause) {
  releasePointer();
  const { S, P } = game;
  $('deadCause').textContent = cause;
  $('deadStats').innerHTML = stats([
    ['Altitude at death', fmt(P.y) + ' m'], ['Highest point', fmt(S.maxAlt) + ' m'], ['Location', region()],
    ['Time', `Day ${dayOf(game.time)}, ${timeOfDay(game.time)}`],
    ['Summits', reachedSummits(S).map((c) => c.short).join(' + ') || 'none'],
    ['Hours in death zone without O₂', S.deathZoneHours.toFixed(1)],
  ]);
  setTimeout(() => show('scrDead'), 700);
}
function showWin() {
  releasePointer();
  const S = game.S, reached = reachedSummits(S), all = reached.length === CLIMBS.length;
  const remaining = CLIMBS.filter((c) => !S.summits[c.id]).map((c) => c.short).join(' or ');
  const when = (k) => (S.summits[k] ? `Day ${dayOf(S.summitTimes[k])} ${timeOfDay(S.summitTimes[k])}${S.summitNoO2[k] ? ' (no O₂!)' : ''}` : '—');
  $('winText').textContent = all
    ? 'Everest, Lhotse and Nuptse in one expedition — and back to the safety of the Western Cwm. All three summits completed.'
    : `You summited ${reached.map((c) => c.short).join(' + ')} and made it back to Camp 2. Keep climbing for ${remaining}, or end the expedition here.`;
  $('winStats').innerHTML = stats([
    ['Score', fmt(score())], ...CLIMBS.map((c) => [c.short, when(c.id)]), ['Highest point', fmt(S.maxAlt) + ' m'],
    ['Expedition time', `${Math.floor(game.time / 24)} d ${Math.floor(game.time % 24)} h`], ['Frostbite', Math.round(S.frost) + '%'],
    ['Falls', S.falls], ['Distance walked', (S.distance / 1000).toFixed(1) + ' km'],
  ]);
  $('btnWinContinue').classList.toggle('hidden', all);
  show('scrWin');
}
