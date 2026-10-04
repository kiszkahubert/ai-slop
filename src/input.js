// Keyboard and mouse.
import { clamp } from './core/math.js';
import { emit } from './core/events.js';
import { game, toggleO2, setFlow } from './sim/game.js';
import { interact, startAutopilot, stopAutopilot } from './sim/player.js';
import { escapePressed } from './ui/screens.js';

export const keys = new Set();

export function initInput({ onDebugKey } = {}) {
  addEventListener('keydown', (e) => {
    if (['Space', 'ArrowUp', 'ArrowDown', 'Tab'].includes(e.code)) e.preventDefault();
    if (e.repeat) return;
    keys.add(e.code);
    if (e.code === 'Escape') { escapePressed(); return; }
    if (game.mode !== 'play') return;
    switch (e.code) {
      case 'KeyE': interact(); break;
      case 'KeyO': toggleO2(); break;
      case 'KeyF': if (game.auto) stopAutopilot('Stopped following the route.'); else startAutopilot(); break;
      case 'BracketRight': case 'Equal': setFlow(game.S.flow + 1); break;
      case 'BracketLeft': case 'Minus': setFlow(game.S.flow - 1); break;
      case 'KeyV': game.view.fp = !game.view.fp; document.getElementById('crosshair').classList.toggle('hidden', !game.view.fp); break;
      case 'KeyM': document.getElementById('hudTR').classList.toggle('big'); break;
      case 'KeyT': if (game.free) { emit('openTravel'); break; } if (onDebugKey) onDebugKey(e.code); break;
      default:
        if (/^Digit[1-4]$/.test(e.code)) setFlow(Number(e.code.slice(5)));
        if (onDebugKey) onDebugKey(e.code);
    }
  });
  addEventListener('keyup', (e) => keys.delete(e.code));
  addEventListener('blur', () => keys.clear());
  addEventListener('mousemove', (e) => {
    if (!game.locked || game.mode !== 'play') return;
    game.view.yaw -= e.movementX * 0.0022;
    game.view.pitch = clamp(game.view.pitch - e.movementY * 0.0022, -1.4, 1.35);
  });
  addEventListener('wheel', (e) => { if (game.mode === 'play') game.view.dist = clamp(game.view.dist * (e.deltaY > 0 ? 1.12 : 0.89), 2.5, 30); }, { passive: true });
}

/** Manual movement from the keyboard, relative to the camera; null when no key is held. */
export function manualControl() {
  let ix = 0, iz = 0;
  if (keys.has('KeyW')) iz -= 1; if (keys.has('KeyS')) iz += 1;
  if (keys.has('KeyA')) ix -= 1; if (keys.has('KeyD')) ix += 1;
  const sprint = keys.has('ShiftLeft') || keys.has('ShiftRight');
  if (!ix && !iz) return { dx: 0, dz: 0, sprint };
  const yaw = game.view.yaw, fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
  let dx = fx * -iz + rx * ix, dz = fz * -iz + rz * ix;
  const l = Math.hypot(dx, dz);
  return { dx: dx / l, dz: dz / l, sprint };
}
