// One simulation tick (also used headlessly by the tests).
import { TIME_SCALE } from '../config.js';
import { clamp } from '../core/math.js';
import { game, checkProgress, die, refreshConditions } from './game.js';
import { stepPhysiology } from './physiology.js';
import { recordSample } from './debrief.js';
import { updatePlayer, stopAutopilot } from './player.js';
import { updateSki } from './ski.js';

let envTimer = 0;

/** dt: real seconds. ctl: manual control { dx, dz, sprint } or null. Returns false when play stops. */
export function simStep(dt, ctl) {
  if (game.mode !== 'play') return false;
  if (game.auto && ctl && (ctl.dx || ctl.dz)) stopAutopilot('You took back control.');
  game.time += (dt * TIME_SCALE) / 3600;
  envTimer -= dt;
  if (envTimer <= 0) {
    envTimer = 0.25;
    const { P, field } = game;
    // ridges and summits catch more wind than hollows
    const around = (field.height(P.x + 60, P.z) + field.height(P.x - 60, P.z) + field.height(P.x, P.z + 60) + field.height(P.x, P.z - 60)) / 4;
    game.env.exposure = clamp(1 + (P.y - around) / 80, 0.6, 1.45);
    refreshConditions();
  }
  if (game.P.ski && !game.P.falling) updateSki(dt, ctl); else updatePlayer(dt, ctl);
  if (game.mode !== 'play') return false;
  const P = game.P;
  if (game.free) {                      // free viewing: no physiology, always fit and well
    Object.assign(game.S, { health: 100, stamina: 100, exh: 0, frost: 0, spo2: 95, winded: false });
    checkProgress();
    return true;
  }
  recordSample(game);
  const cause = stepPhysiology(game, (dt * TIME_SCALE) / 3600, { moving: P.moving, sprint: P.sprint, grade: P.grade, resting: false });
  if (cause) { die(cause); return false; }
  checkProgress();
  return game.mode === 'play';
}
