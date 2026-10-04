// Altitude physiology: SpO₂, acclimatization, the death zone, bottled oxygen, frostbite,
// exhaustion and health. Rates are per game hour.
import { OXYGEN, DEATH_ZONE } from '../config.js';
import { clamp, smoothstep } from '../core/math.js';
import { toast, emit } from '../core/events.js';
import { windChill, sunDirection } from './weather.js';

export const o2Flowing = (S) => S.o2on && S.tanks.length > 0 && S.tanks[0] > OXYGEN.emptyBar;
export const isEmptyBottle = (bar) => bar <= OXYGEN.emptyBar;
export const o2Benefit = (S) => (o2Flowing(S) ? OXYGEN.flowBenefit[S.flow] : 0);
export const hypF = (S) => 0.38 + 0.62 * smoothstep(52, 90, S.spo2);         // movement factor from hypoxia
export const maxStamina = (S) => 100 - 0.6 * S.exh;
export const packLoad = (S) => OXYGEN.baseLoadKg + S.tanks.reduce((a, p) => a + OXYGEN.emptyKg + (OXYGEN.gasKg * p) / OXYGEN.bottleBar, 0);

/** Equilibrium SpO₂ for an altitude, given acclimatization, oxygen flow and exertion. */
export function spo2Target(S, h, exert) {
  const eff = h - o2Benefit(S);
  const x = Math.max(0, eff - 1500 - 0.55 * Math.max(0, S.accl - 4000)) / 1000;
  return clamp(99 - 3.13 * Math.pow(x, 1.4) - exert, 25, 99);
}

export function swapTank(S, auto) {
  const before = S.tanks.length;
  S.tanks = S.tanks.filter((p) => !isEmptyBottle(p));
  const dropped = before - S.tanks.length;
  if (dropped) emit('bottle', S.tanks.length, S.tanks[0] || 0);
  if (!S.tanks.length) {
    if (S.o2on) { S.o2on = false; toast('Oxygen bottle empty — no spares left!', 'bad', 6); }
    return;
  }
  S.tanks.sort((a, b) => b - a);
  if (auto && dropped) toast(`Bottle empty — switched to a fresh one (${S.tanks.length} left).`, 'warn');
}

/** Local conditions at a point. exposure: >1 on ridges, <1 in hollows. */
export function conditionsAt(game, x, z, y, tH, inTent, exposure = 1) {
  const W = game.weather, sun = game._sunTmp || (game._sunTmp = { set(a, b, c) { this.x = a; this.y = b; this.z = c; } });
  const sunEl = sunDirection(tH, sun);
  const cwm = game.field.glacierAt(x, z) > 0.5 && y > 5950 && y < 6900;     // the Western Cwm: sheltered, a solar oven
  const T = W.temperature(y, tH, sunEl, cwm), wind = W.wind(y, tH, (cwm ? 0.55 : 1) * exposure);
  return { T: inTent ? T + 20 : T, wind: inTent ? 0 : wind, wc: inTent ? T + 20 : windChill(T, wind), vis: W.visibilityKm(tH), sunEl, cwm, exposure };
}

const CAUSES = {
  hypoxia: 'Severe hypoxia — your blood oxygen fell too low and you lost consciousness (HACE).',
  deathzone: 'Hypoxia in the death zone — without supplemental oxygen your body shut down above 8,000 m.',
  exposure: 'Exposure — frostbite and hypothermia in the wind and cold.',
  exhaustion: 'Exhaustion — you collapsed and could not get up again.',
};

/** Advance physiology by dtH game hours. ctx: { moving, sprint, grade, resting }. Returns a death cause or null. */
export function stepPhysiology(game, dtH, ctx) {
  const S = game.S, h = game.P.y;
  const e = ctx.resting ? conditionsAt(game, game.P.x, game.P.z, h, game.time, true) : game.env;
  // bottled oxygen
  if (S.o2on) {
    if (!o2Flowing(S)) swapTank(S, true);
    if (o2Flowing(S)) {
      S.tanks[0] -= (S.flow / OXYGEN.bottleLitres) * 60 * dtH * (ctx.sprint ? 1.3 : 1);
      if (isEmptyBottle(S.tanks[0])) { S.tanks[0] = Math.max(0, S.tanks[0]); swapTank(S, true); }
    }
  }
  const exert = ctx.resting ? -2 : ctx.sprint ? 7 : ctx.moving ? 2.5 + 2 * Math.max(0, ctx.grade) : 0;
  S.spo2 += (spo2Target(S, h, exert) - S.spo2) * Math.min(1, dtH * 25);
  // health
  const dmg = { hypoxia: 0, deathzone: 0, exposure: 0, exhaustion: 0 };
  if (S.spo2 < 65) dmg.hypoxia = (65 - S.spo2) * 1.2;
  if (h > DEATH_ZONE) {
    if (o2Benefit(S) === 0) {
      const accl = clamp((S.accl - 5000) / 2500, 0, 1);
      dmg.deathzone = (10 + (14 * (h - DEATH_ZONE)) / 849) * (1.25 - 0.5 * accl);
      S.deathZoneHours += dtH;
    } else { dmg.deathzone = Math.max(0, 2.5 - 0.6 * S.flow); S.usedO2InDZ = true; }
  }
  if (S.frost >= 100) dmg.exposure = 12;
  if (e.wc < -45 && !ctx.resting) dmg.exposure += (-45 - e.wc) * 0.15;
  if (S.exh >= 100) dmg.exhaustion = 10;
  let heal = 0;
  if (ctx.resting && h < DEATH_ZONE) heal = S.spo2 >= 80 ? 9 : S.spo2 >= 72 ? 4 : S.spo2 >= 66 ? 1.2 : 0;
  else if (!ctx.resting && S.spo2 > 82 && h < 7000) heal = 1.5;
  const total = dmg.hypoxia + dmg.deathzone + dmg.exposure + dmg.exhaustion;
  S.health = clamp(S.health + (heal - total) * dtH, 0, 100);
  if (total > 0) { let wv = -1; for (const k in dmg) if (dmg[k] > wv) { wv = dmg[k]; S.lastDamage = k; } }
  // frostbite
  let fr = Math.max(0, -e.wc - 30) * 0.2;
  if (fr > 0) { if (S.spo2 < 70) fr *= 1.4; if (ctx.moving) fr *= 0.75; if (o2Flowing(S)) fr *= 0.85; }
  if (ctx.resting) fr = -3; else if (fr === 0 && e.wc > -10) fr = -0.5;
  S.frost = clamp(S.frost + fr * dtH, 0, 100);
  // exhaustion
  let ex = 0.8 + Math.max(0, (h - 6000) / 1000) * 0.8;
  if (ctx.moving) ex += (ctx.grade < -0.1 ? 0.8 : 1.6) + Math.max(0, ctx.grade) * 1.3;
  if (ctx.sprint) ex += 4;
  if (S.spo2 < 65) ex += 1.5;
  if (ctx.resting) ex = -10 * clamp((S.spo2 - 60) / 25, 0.1, 1.2);
  S.exh = clamp(S.exh + ex * dtH, 0, 100);
  // acclimatization: rises while you spend time high, deteriorates above 7,800 m
  if (h > S.accl && S.spo2 > 62) {
    const tgt = Math.min(h + 200, 7500);
    if (tgt > S.accl) S.accl += ((tgt - S.accl) / 30) * dtH * (ctx.resting ? 1.3 : 1);
  }
  if (h > 7800) S.accl -= 4 * dtH; else if (h < S.accl - 900) S.accl -= 1.5 * dtH;
  S.accl = clamp(S.accl, 4500, 7500);
  return S.health <= 0 ? CAUSES[S.lastDamage] || CAUSES.hypoxia : null;
}
