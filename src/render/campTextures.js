// Shared, deterministic camp surfaces. No DOM, image downloads or per-object textures.
import * as THREE from 'three';
import { mulberry32 } from '../core/noise.js';

const TAU = Math.PI * 2;
const byte = (v) => Math.round(Math.max(0, Math.min(255, v)));

export function createCampSurface(kind, size, anisotropy = 1) {
  const rand = mulberry32({ fabric: 251, paint: 252, plastic: 253, stone: 254, solar: 255 }[kind]);
  const color = new Uint8Array(size * size * 4), normal = new Uint8Array(size * size * 4);
  const roughness = new Uint8Array(size * size * 4), height = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size, grain = rand() - 0.5, o = (y * size + x) * 4;
    const wave = Math.sin(TAU * (u * 3 + Math.sin(v * TAU * 2) * 0.18));
    let c = 235, h = 0, r = 210, rgb;
    if (kind === 'fabric') {
      const weave = Math.sin(u * TAU * 96) * Math.sin(v * TAU * 96);
      const grid = Math.pow(Math.abs(Math.cos(u * TAU * 16)), 24) + Math.pow(Math.abs(Math.cos(v * TAU * 16)), 24);
      const wrinkle = wave * Math.sin(v * TAU * 5 + u * TAU);
      c = 233 + grain * 9 + weave * 4 - grid * 6 + wrinkle * 5;
      h = weave * 0.025 + grid * 0.035 + wrinkle * 0.04;
      r = 211 + grain * 12 - grid * 7;
    } else if (kind === 'paint') {
      const scratch = Math.pow(Math.abs(Math.sin(v * TAU * 41 + Math.sin(u * TAU * 2) * 0.1)), 90);
      const wear = Math.pow(Math.max(0, Math.sin(u * TAU * 3) * Math.cos(v * TAU * 4)), 8);
      c = 235 + grain * 12 - scratch * 22 - wear * 37; h = grain * 0.01 - scratch * 0.04;
      r = 170 + wear * 55 + grain * 16;
    } else if (kind === 'plastic') {
      c = 240 + grain * 10 + wave * 2; h = grain * 0.012; r = 195 + grain * 18;
    } else if (kind === 'stone') {
      const grit = Math.sin(u * TAU * 17 + Math.sin(v * TAU * 9)) * Math.cos(v * TAU * 23);
      c = 218 + grit * 18 + wave * 8 + grain * 25; h = grit * 0.12 + grain * 0.08; r = 235 + grain * 12;
    } else if (kind === 'solar') {
      // A 4 x 6 array of cells; thin busbars sit inside pale cell boundaries.
      const a = (u * 4) % 1, b = (v * 6) % 1;
      const edge = Math.min(a, 1 - a, b, 1 - b) < 0.025;
      const bus = Math.abs(a - 0.33) < 0.008 || Math.abs(a - 0.67) < 0.008;
      const tone = Math.sin(u * TAU * 11) * Math.cos(v * TAU * 13);
      rgb = edge ? [140, 158, 170] : bus ? [93, 119, 143] : [18 + tone * 4, 37 + tone * 6, 64 + tone * 10];
      r = edge ? 185 : 85; h = edge ? 0.02 : 0;
    }
    color[o] = byte(rgb ? rgb[0] : c); color[o + 1] = byte(rgb ? rgb[1] : c);
    color[o + 2] = byte(rgb ? rgb[2] : c); color[o + 3] = 255;
    roughness[o] = roughness[o + 1] = roughness[o + 2] = byte(r); roughness[o + 3] = 255;
    height[y * size + x] = h;
  }
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const at = (a, b) => height[((b + size) % size) * size + ((a + size) % size)];
    const dx = (at(x + 1, y) - at(x - 1, y)) * size / 256;
    const dy = (at(x, y + 1) - at(x, y - 1)) * size / 256, len = Math.hypot(dx, dy, 1), o = (y * size + x) * 4;
    normal[o] = byte(127.5 - dx / len * 127.5); normal[o + 1] = byte(127.5 - dy / len * 127.5);
    normal[o + 2] = byte(127.5 + 1 / len * 127.5); normal[o + 3] = 255;
  }
  const tex = (data, srgb) => {
    const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
    t.anisotropy = Math.min(8, anisotropy); t.needsUpdate = true;
    return t;
  };
  return { map: tex(color, true), normalMap: tex(normal, false), roughnessMap: tex(roughness, false) };
}

export function createCampTextures(size, anisotropy) {
  return Object.fromEntries(['fabric', 'paint', 'plastic', 'stone', 'solar'].map((kind) =>
    [kind, createCampSurface(kind, kind === 'fabric' ? size : Math.min(size, kind === 'plastic' ? 256 : 512), anisotropy)]));
}

export function disposeCampTextures(textures) {
  for (const surface of Object.values(textures)) for (const t of Object.values(surface)) t.dispose();
}
