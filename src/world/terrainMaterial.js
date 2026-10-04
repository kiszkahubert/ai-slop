// Terrain shading: snow, wind-polished blue ice, rock (with the Yellow Band), debris-covered
// glacier and close-up detail normals, injected into MeshStandardMaterial. The vertex stage
// also bends distant terrain down with the curvature of the Earth (relative to the camera).
import * as THREE from 'three';
import { TERRAIN } from '../config.js';
import { mulberry32 } from '../core/noise.js';
import { lerp } from '../core/math.js';

function tileableNoise(S, cells, rand) {
  const g = new Float32Array(cells * cells);
  for (let i = 0; i < g.length; i++) g[i] = rand();
  const out = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const fx = (x / S) * cells, fy = (y / S) * cells, i = Math.floor(fx), j = Math.floor(fy);
    let u = fx - i, v = fy - j; u = u * u * (3 - 2 * u); v = v * v * (3 - 2 * v);
    const at = (a, b) => g[(b % cells) * cells + (a % cells)];
    out[y * S + x] = lerp(lerp(at(i, j), at(i + 1, j), u), lerp(at(i, j + 1), at(i + 1, j + 1), u), v);
  }
  return out;
}
function fbm(S, base, rand, oct = 4) {
  const o = new Float32Array(S * S); let amp = 0.5, tot = 0;
  for (let k = 0; k < oct; k++) {
    const l = tileableNoise(S, base << k, rand);
    for (let i = 0; i < o.length; i++) o[i] += l[i] * amp;
    tot += amp; amp *= 0.5;
  }
  for (let i = 0; i < o.length; i++) o[i] /= tot;
  return o;
}

function makeColorNoise() {
  const S = 256, r = mulberry32(99), data = new Uint8Array(S * S * 4);
  const R = fbm(S, 4, r), G = fbm(S, 8, r), B = fbm(S, 16, r), A = fbm(S, 8, r);
  for (let i = 0; i < S * S; i++) { data[i * 4] = R[i] * 255; data[i * 4 + 1] = G[i] * 255; data[i * 4 + 2] = B[i] * 255; data[i * 4 + 3] = A[i] * 255; }
  const t = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true; t.needsUpdate = true;
  return t;
}

function makeDetailNormals() {
  // gradient of a ridged height field -> RG = slope in the two plane axes
  const S = 256, r = mulberry32(7), h = fbm(S, 8, r, 5);
  for (let i = 0; i < h.length; i++) h[i] = Math.pow(1 - Math.abs(h[i] * 2 - 1), 1.5);
  const data = new Uint8Array(S * S * 4);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const hx = h[y * S + ((x + 1) % S)] - h[y * S + ((x + S - 1) % S)];
    const hy = h[((y + 1) % S) * S + x] - h[((y + S - 1) % S) * S + x];
    const o = (y * S + x) * 4;
    data[o] = Math.max(0, Math.min(255, 128 - hx * 220)); data[o + 1] = Math.max(0, Math.min(255, 128 - hy * 220));
    data[o + 2] = 255; data[o + 3] = 255;
  }
  const t = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true; t.needsUpdate = true;
  return t;
}

export function createTerrainMaterial() {
  const uniforms = {
    uNoise: { value: makeColorNoise() },
    uDetailN: { value: makeDetailNormals() },
    uCurv: { value: 1 / (2 * TERRAIN.earthRadius) },
  };
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.86, metalness: 0 });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = 'attribute float aGlacier;\nattribute float aRock;\nuniform float uCurv;\nvarying float vGl;\nvarying float vRock;\nvarying vec3 vWPos;\nvarying vec3 vWNrm;\n' +
      sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        vec4 wp0 = modelMatrix * vec4(transformed, 1.0);
        vWPos = wp0.xyz; vWNrm = normalize(mat3(modelMatrix) * objectNormal); vGl = aGlacier; vRock = aRock;
        vec2 dc = wp0.xz - cameraPosition.xz;
        transformed.y -= dot(dc, dc) * uCurv;`);
    sh.fragmentShader = 'uniform sampler2D uNoise;\nuniform sampler2D uDetailN;\nvarying float vGl;\nvarying float vRock;\nvarying vec3 vWPos;\nvarying vec3 vWNrm;\n' +
      sh.fragmentShader
        .replace('#include <color_fragment>', `#include <color_fragment>
        {
          vec3 nrm = normalize(vWNrm);
          float slope = 1.0 - clamp(nrm.y, 0.0, 1.0);          // 1 - cos(angle): 40° = .234, 50° = .357, 60° = .5
          float hgt = vWPos.y;
          // triplanar sampling so steep faces are not streaked by a top-down projection
          vec3 bw = pow(abs(nrm), vec3(4.0)); bw /= (bw.x + bw.y + bw.z);
          vec3 q = vWPos;
          #define TRI(S) (texture2D(uNoise, q.zy * (S)) * bw.x + texture2D(uNoise, q.xz * (S)) * bw.y + texture2D(uNoise, q.xy * (S)) * bw.z)
          float n1 = TRI(0.0011).r;
          float n2 = TRI(0.0093).g;
          float n3 = TRI(0.071).b;
          vec3 qs = vec3(q.x * 0.002, hgt * 0.021, q.z * 0.002);   // horizontal rock strata
          float n4 = (texture2D(uNoise, qs.zy) * bw.x + texture2D(uNoise, qs.xz) * bw.y + texture2D(uNoise, qs.xy) * bw.z).a;
          // rock: dark schist and granite, with the pale limestone of the Yellow Band (7,400-7,750 m)
          vec3 rock = mix(vec3(0.13, 0.12, 0.115), vec3(0.30, 0.27, 0.245), n1 * 0.5 + n4 * 0.5) * (0.75 + 0.5 * n3);
          float bandN = (n1 - 0.5) * 140.0 + (n4 - 0.5) * 60.0;
          float yb = smoothstep(7430.0, 7480.0, hgt + bandN) * (1.0 - smoothstep(7610.0, 7670.0, hgt + bandN));
          rock = mix(rock, vec3(0.55, 0.46, 0.32) * (0.8 + 0.4 * n3), yb * 0.8);
          // snow, wind-polished blue ice on the steeper slopes
          vec3 snow = vec3(0.93, 0.95, 0.99) * (0.94 + 0.06 * n2);
          vec3 blueIce = mix(vec3(0.62, 0.76, 0.88), vec3(0.80, 0.88, 0.95), n3);
          snow = mix(snow, blueIce, smoothstep(0.17, 0.33, slope) * (0.35 + 0.45 * n2));
          float snowAmt = 1.0 - smoothstep(0.36, 0.46, slope + (n2 - 0.5) * 0.14 + (n3 - 0.5) * 0.06);
          snowAmt *= smoothstep(5200.0, 5750.0, hgt + (n1 - 0.5) * 350.0);
          vec3 scree = mix(vec3(0.38, 0.34, 0.30), vec3(0.53, 0.48, 0.42), n2) * (0.8 + 0.4 * n3);
          vec3 col = mix(mix(scree, rock, smoothstep(0.2, 0.4, slope)), snow, snowAmt);
          // glaciers: debris-covered below ~5,400 m, white/blue ice in the Icefall, snow in the Cwm
          float g = vGl * (1.0 - smoothstep(0.22, 0.4, slope));
          vec3 ice = mix(vec3(0.60, 0.74, 0.84), vec3(0.86, 0.92, 0.97), n2) * (0.88 + 0.24 * n3);
          vec3 debris = mix(vec3(0.30, 0.28, 0.26), vec3(0.48, 0.45, 0.41), n2) * (0.75 + 0.5 * n3);
          vec3 gcol = mix(ice, debris, smoothstep(5470.0, 5330.0, hgt + (n1 - 0.5) * 80.0));
          gcol = mix(gcol, snow, smoothstep(5900.0, 6150.0, hgt) * 0.9);
          col = mix(col, gcol, g);
          // the Yellow Band is a limestone band exposed right across the Lhotse Face and Everest
          float ybRock = yb * smoothstep(0.06, 0.14, slope + (n2 - 0.5) * 0.12 + (n3 - 0.5) * 0.06) * smoothstep(0.42, 0.68, n4 + n2 * 0.4);
          col = mix(col, vec3(0.60, 0.50, 0.34) * (0.8 + 0.35 * n3), ybRock * 0.85);
          // features below the DEM's resolution: Geneva Spur rock, Lhotse Couloir walls
          col = mix(col, rock * 0.85, vRock * smoothstep(0.04, 0.15, slope + (n3 - 0.5) * 0.1) * smoothstep(0.25, 0.5, n2 + vRock * 0.4));
          diffuseColor.rgb = col;
        }`)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          vec3 nW = normalize(vWNrm);
          vec3 bw = pow(abs(nW), vec3(4.0)); bw /= (bw.x + bw.y + bw.z);
          vec2 tx = texture2D(uDetailN, vWPos.zy * 0.09).xy * 2.0 - 1.0;
          vec2 ty = texture2D(uDetailN, vWPos.xz * 0.09).xy * 2.0 - 1.0;
          vec2 tz = texture2D(uDetailN, vWPos.xy * 0.09).xy * 2.0 - 1.0;
          vec2 ty2 = texture2D(uDetailN, vWPos.xz * 0.013).xy * 2.0 - 1.0;
          vec3 pert = vec3(0.0, tx.y, tx.x) * bw.x + vec3(ty.x + ty2.x, 0.0, ty.y + ty2.y) * bw.y + vec3(tz.x, tz.y, 0.0) * bw.z;
          float rockiness = smoothstep(0.25, 0.45, 1.0 - nW.y);
          float fade = 1.0 - smoothstep(80.0, 700.0, length(vWPos - cameraPosition));
          vec3 nP = normalize(nW + pert * mix(0.18, 0.55, rockiness) * fade);
          normal = normalize((viewMatrix * vec4(nP, 0.0)).xyz);
        }`);
  };
  return mat;
}
