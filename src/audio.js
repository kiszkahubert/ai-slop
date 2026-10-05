// Wind noise that follows the wind speed, and an alarm for empty oxygen / severe hypoxia.
import { OXYGEN } from './config.js';
import { clamp } from './core/math.js';
import { on } from './core/events.js';
import { game } from './sim/game.js';
import { o2Flowing } from './sim/physiology.js';

let audio = null;

export function initAudio() { on('userGesture', start); }

function start() {
  if (audio) return;
  try {
    const ctx = new AudioContext();
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    const filt = ctx.createBiquadFilter(); filt.type = 'bandpass'; filt.Q.value = 0.6;
    const gain = ctx.createGain(); gain.gain.value = 0;
    src.connect(filt).connect(gain).connect(ctx.destination); src.start();
    const rumble=ctx.createBiquadFilter(),snowGain=ctx.createGain(); rumble.type='lowpass';rumble.frequency.value=180;snowGain.gain.value=0;
    src.connect(rumble).connect(snowGain).connect(ctx.destination);
    audio = { ctx, filt, gain, snowGain, beep: 0 };
  } catch { audio = null; }
}

export function updateAudio(dt) {
  if (!audio) return;
  const play = game.mode === 'play', w = game.env.wind, t = audio.ctx.currentTime, S = game.S;
  audio.gain.gain.setTargetAtTime(play ? clamp(w / 140, 0.03, 0.5) * 0.5 : 0, t, 0.4);
  audio.filt.frequency.setTargetAtTime(250 + w * 6 + 120 * Math.sin(performance.now() / 900), t, 0.3);
  const A=game.physics?.avalanche,dist=A?Math.hypot(game.P.x-A.source.x,game.P.z-A.source.z):0;
  const intensity=A&&!A.settled&&(play||game.mode==='dead')?clamp(A.maxSpeed/25,0,1)/(1+dist/200):0;
  audio.snowGain.gain.setTargetAtTime(intensity*.6,t,.2);
  audio.beep -= dt;
  if (play && audio.beep <= 0 && ((S.o2on && (!o2Flowing(S) || S.tanks[0] < OXYGEN.lowBar)) || S.spo2 < 58)) {
    audio.beep = 2;
    const o = audio.ctx.createOscillator(), g = audio.ctx.createGain();
    o.frequency.value = 880; g.gain.value = 0.05; o.connect(g).connect(audio.ctx.destination);
    o.start(); o.stop(t + 0.15);
  }
}
