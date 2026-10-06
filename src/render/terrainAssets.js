// The photographed rock is bundled, decoded once, and repacked into the existing
// terrain arrays. No new samplers or remote requests are required at runtime.
let rock;
export function loadTerrainRock() {
  rock ??= Promise.all(['albedo.jpg', 'surface.png'].map(async name => {
    const response = await fetch(`assets/materials/marble-cliff/${name}`);
    if (!response.ok) throw new Error(`Rock material: ${response.status}`);
    return createImageBitmap(await response.blob(), {colorSpaceConversion: 'none', premultiplyAlpha: 'none'});
  })).then(([albedo, surface]) => ({albedo, surface})).catch(error => {
    console.warn('Using procedural rock fallback:', error.message); return null;
  });
  return rock;
}

export function applyPhotographedRock(S, albedo, surface, rock) {
  if (!rock) return;
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = S;
  const ctx = canvas.getContext('2d', {willReadFrequently: true});
  const read = image => {
    ctx.clearRect(0, 0, S, S); ctx.drawImage(image, 0, 0, S, S);
    return ctx.getImageData(0, 0, S, S).data;
  };
  const color = read(rock.albedo), data = read(rock.surface);
  // Reverse image rows to retain the source OpenGL tangent basis (v points up).
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dst = (y * S + x) * 4, src = ((S - 1 - y) * S + x) * 4;
    for (let k = 0; k < 3; k++) albedo[dst + k] = color[src + k] * 0.62;
    surface[dst] = data[src]; surface[dst + 1] = data[src + 1];
    surface[dst + 2] = data[src + 2]; surface[dst + 3] = data[src + 3];
  }
}
