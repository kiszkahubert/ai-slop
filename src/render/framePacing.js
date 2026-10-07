// Frame-rate limit. A browser renders as often as the display refreshes (144-240 Hz on gaming monitors), so
// without a cap the GPU redraws this scene up to four times more often than it needs to and runs flat out.
// The cap changes how often a frame is drawn, never what is drawn. Menus (title, pause, camp, victory) draw at
// most 30 frames a second behind the panel. The choice is remembered per browser and can be forced with
// ?fps=30|60|120|max.

export const FRAME_CAPS = { 30: { label: '30', fps: 30 }, 60: { label: '60', fps: 60 }, 120: { label: '120', fps: 120 }, max: { label: 'Max', fps: 0 } };
export const MENU_FPS = 30;
const KEY = 'everestSim.frameCap';

export function initialFrameCap() {
  const q = new URLSearchParams(location.search).get('fps');
  if (q && FRAME_CAPS[q]) return q;
  try { const s = localStorage.getItem(KEY); if (s && FRAME_CAPS[s]) return s; } catch { /* storage blocked */ }
  return '60';
}

export function rememberFrameCap(name) {
  try { localStorage.setItem(KEY, name); } catch { /* storage blocked */ }
}

/** Minimum time between frames (ms) for a cap and whether a menu covers the view; 0 = every display refresh. */
export function frameInterval(fps, menu = false) {
  const f = menu ? (fps > 0 ? Math.min(fps, MENU_FPS) : MENU_FPS) : fps;
  return f > 0 ? 1000 / f : 0;
}

/**
 * Decides on each display refresh whether to draw. Frames are due on a fixed schedule (so a 60 cap on a 144 Hz
 * display averages 60, not 48), a little early is accepted (display refresh timestamps jitter) and a schedule
 * that falls behind is restarted rather than caught up with a burst of frames.
 */
export class FramePacer {
  constructor(fps = 60) { this.fps = fps; this.next = null; }
  setFps(fps) { this.fps = fps; this.next = null; }
  /** now: requestAnimationFrame timestamp (ms). */
  due(now, menu = false) {
    const interval = frameInterval(this.fps, menu);
    if (interval === 0) { this.next = null; return true; }
    if (this.next !== null && now < this.next - Math.min(2, interval * 0.2)) return false;
    this.next = this.next === null || now - this.next > interval ? now + interval : this.next + interval;
    return true;
  }
  /** Time the limit deliberately leaves idle per frame beyond a 60 Hz frame (ms), for load heuristics. */
  idleMs(menu = false) { return Math.max(0, frameInterval(this.fps, menu) - 1000 / 60); }
}
