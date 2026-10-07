import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { FramePacer, frameInterval, FRAME_CAPS, MENU_FPS } from '../../src/render/framePacing.js';
import { createTerrainMaterial } from '../../src/world/terrainMaterial.js';

/** Display refreshes at `hz` for `ms`; returns the number of frames the pacer lets through. */
function drawn(pacer, hz, ms = 10000, menu = false) {
  let n = 0;
  for (let t = 0; t < ms; t += 1000 / hz) if (pacer.due(t + Math.sin(t) * 0.3, menu)) n++;   // ±0.3 ms of jitter
  return n;
}

test('a frame cap averages its rate on any display, never more', () => {
  for (const hz of [60, 75, 120, 144, 165, 240]) {
    const fps = drawn(new FramePacer(60), hz) / 10;
    assert.ok(fps <= 60.5 && fps >= Math.min(hz, 60) - 1.5, `${hz} Hz display drew ${fps} fps`);
  }
  assert.equal(drawn(new FramePacer(0), 144), drawn(new FramePacer(0), 144));
  assert.ok(Math.abs(drawn(new FramePacer(0), 144) / 10 - 144) < 1, 'Max draws every refresh');
  assert.ok(Math.abs(drawn(new FramePacer(120), 144) / 10 - 120) < 1.5);
});

test('menus draw at most 30 frames a second, a lower cap still wins, and a stall does not cause a burst', () => {
  assert.ok(Math.abs(drawn(new FramePacer(60), 144, 10000, true) / 10 - MENU_FPS) < 1);
  assert.ok(Math.abs(drawn(new FramePacer(0), 240, 10000, true) / 10 - MENU_FPS) < 1);
  assert.equal(frameInterval(30, true), 1000 / 30);
  const p = new FramePacer(60);
  assert.ok(p.due(0)); assert.ok(p.due(500));                 // a long hitch: draw at once...
  assert.ok(!p.due(504)); assert.ok(!p.due(510)); assert.ok(p.due(517));   // ...then back on schedule, no catch-up
  assert.deepEqual(Object.keys(FRAME_CAPS), ['30', '60', '120', 'max']);
  assert.equal(new FramePacer(30).idleMs(), 1000 / 30 - 1000 / 60);
  assert.equal(new FramePacer(60).idleMs(), 0);
});

test('hidden terrain is discarded only after every read that needs screen derivatives', () => {
  const t = new THREE.DataArrayTexture(new Uint8Array(4), 1, 1, 1);
  for (const exactGradients of [false, true]) {
    const mat = createTerrainMaterial({ layers: { albedo: t, surface: t, size: 1 }, macroNoise: new THREE.Texture(), relief: null, microDetail: true, antiTiling: true, exactGradients });
    const sh = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
    mat.onBeforeCompile(sh);
    const f = sh.fragmentShader.replace(/\/\/[^\n]*/g, ''), main = f.indexOf('void main()');
    const cut = f.indexOf('discard;', main);
    assert.ok(cut > main, 'the terrain shader has the hidden-fragment test');
    const before = f.slice(main, cut), after = f.slice(cut);
    for (const read of ['texture2D( uRelief', 'texture2D( uMacro, qs', 'dFdx( q )', 'dFdx( npn )']) assert.ok(before.includes(read), read);
    // below the discard: explicit-LOD layer samples only (TSAMPLE), and the spot-light map three compiles out
    assert.deepEqual([...after.matchAll(/\b(texture2D|texture|dFdx|dFdy|fwidth)\s*\(/g)].map((m) => m[1]), ['texture2D']);
    assert.match(after, /spotColor = texture2D\( spotLightMap/);
    assert.match(after, /#include <lights_physical_fragment>\s*material\.roughness = min\( max\( roughnessFactor, 0\.0525 \) \+ tGeomRough, 1\.0 \);/);
    // the derivative-dependent values feed the discard, so they cannot be moved below it
    assert.match(before, /\(\s*rel\.x \+ rel\.y \+ rel\.a \+ n1 \+ n2 \+ n3 \+ n4 \+ tGeomRough/);
  }
});
