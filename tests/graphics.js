// Graphics: the quality switch applies live from the title-screen buttons, the post-processing chain matches each
// preset, the oxygen gear shows only while oxygen is on, the mountain-shadow map is computed, and the HUD still runs.
// (wrapped in an async function so the file also parses for ESLint: the harness awaits the result)
return (async () => {
  const W = window.__sim, g = W.game, out = { presets: {} };
  for (const q of ['low', 'high', 'medium']) {
    document.querySelector(`#scrTitle [data-quality=${q}]`).click();
    const fx = W.postfx;
    out.presets[q] = {
      active: W.quality, button: document.querySelector(`#scrTitle [data-quality=${q}]`).classList.contains('active'),
      post: fx.q.post, ssao: !!fx.aoRT === fx.q.ssao, bloom: !!fx.bloom === fx.q.bloom,
      shadowMap: W.env.sun.shadow.mapSize.x, terrainTex: g.field && W.scene ? true : false,
    };
  }
  let stored = null; try { stored = localStorage.getItem('everestSim.quality'); } catch { /* blocked */ }
  out.remembered = stored;
  // a real expedition: oxygen gear follows the O key
  document.getElementById('btnNew').click();
  const parts = W.climber.parts;
  W.climber.update(0.016, g.P, g.S); out.o2Off = { bottle: parts.o2.visible, mask: parts.mask.visible };
  g.S.o2on = true; W.climber.update(0.016, g.P, g.S); out.o2On = { bottle: parts.o2.visible, mask: parts.mask.visible };
  g.S.o2on = false;
  // the mountains' shadow map has real content (some texels lit, some in shadow, unless the sun is down)
  const ms = W.env.macro; ms.flush(W.env.sunVec);
  const d = ms.texture.image.data; let lit = 0, dark = 0; for (let i = 0; i < d.length; i += 7) { if (d[i] > 200) lit++; else if (d[i] < 50) dark++; }
  out.macro = { lit: lit > 0, dark: dark > 0 };
  await new Promise((r) => setTimeout(r, 1500));
  out.hud = document.getElementById('hAlt').textContent;
  out.mode = g.mode;
  return out;
})();
