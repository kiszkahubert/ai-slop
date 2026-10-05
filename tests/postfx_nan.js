// A mirror-sharp highlight can overflow the half-float HDR buffer (> 65,504 -> Inf) and some drivers produce NaN.
// Neither may reach the bloom blur, which would smear it into a big black box (seen on Fedora / Mesa).
// Render a frame, then the same frame with a small object that outputs Inf and NaN, and count the pixels around
// the object that turned dark.
// (wrapped in an async function so the file also parses for ESLint: the harness awaits the result)
return (async () => {
  const W = window.__sim, g = W.game, THREE = await import('three');
  const out = {};
  const gl = W.renderer.getContext(), S = 400;
  const grab = () => {
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight, px = new Uint8Array(S * S * 4);
    gl.readPixels((w - S) >> 1, (h - S) >> 1, S, S, gl.RGBA, gl.UNSIGNED_BYTE, px); return px;
  };
  for (const q of ['medium', 'high']) {
    W.setQuality(q);
    W.rig.update(0.016, 0, g, W.climber);
    const cam = W.camera, fwd = new THREE.Vector3(); cam.getWorldDirection(fwd);
    W.postfx.render({ free: true, focus: 4 });
    const before = grab();
    const mat = new THREE.ShaderMaterial({
      uniforms: { uZero: { value: 0 } },
      vertexShader: 'void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }',
      fragmentShader: 'uniform float uZero; void main() { float inf = 1.0 / uZero; gl_FragColor = vec4( inf, uZero / uZero, 1.0e30, 1.0 ); }',
    });
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8), mat);
    m.position.copy(cam.position).addScaledVector(fwd, 3); W.scene.add(m);
    W.postfx.render({ free: true, focus: 4 });
    const after = grab();
    W.scene.remove(m); m.geometry.dispose(); mat.dispose();
    let darkened = 0, n = 0;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      if (Math.hypot(x - S / 2, y - S / 2) < 40) continue;            // the object itself
      const o = (y * S + x) * 4, b0 = before[o] + before[o + 1] + before[o + 2], b1 = after[o] + after[o + 1] + after[o + 2];
      n++; if (b1 < b0 - 60) darkened++;
    }
    out[q] = { darkened: +(darkened / n).toFixed(4) };
  }
  W.setQuality('medium');
  return out;
})();
