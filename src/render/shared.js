// Uniforms shared by every patched material (one object each, so a single update reaches them all), and the
// patch that lets any MeshStandardMaterial receive the mountains' own shadows (MacroShadow).
import * as THREE from 'three';

const white = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1); white.needsUpdate = true;

export const SHARED = {
  uMacroShadow: { value: white },
  uMacroRect: { value: new THREE.Vector4(0, 0, 0, 0) },      // x0, z0, 1/width, 1/depth; zero size = off
  uSunDir: { value: new THREE.Vector3(0, 1, 0) },
  uSunColor: { value: new THREE.Color(1, 1, 1) },           // sun colour × intensity
  uSkyAmbient: { value: new THREE.Color(0.5, 0.6, 0.8) },   // sky light colour × intensity
  uTime: { value: 0 },
  uFlagWind: { value: 0 },
};

/** GLSL: world-space position varying (instancing aware). Vertex side. */
export const WORLD_POS_VERTEX = `
  vec4 sharedWorldPos = vec4( transformed, 1.0 );
  #ifdef USE_INSTANCING
    sharedWorldPos = instanceMatrix * sharedWorldPos;
  #endif
  sharedWorldPos = modelMatrix * sharedWorldPos;
  vSharedWorld = sharedWorldPos.xyz;`;

export const MACRO_SHADOW_PARS = `
  uniform sampler2D uMacroShadow;
  uniform vec4 uMacroRect;
  float macroSunShadow( vec3 w ) {
    if ( uMacroRect.z == 0.0 ) return 1.0;
    vec2 uv = ( w.xz - uMacroRect.xy ) * uMacroRect.zw;
    if ( uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0 ) return 1.0;
    return texture2D( uMacroShadow, uv ).r;
  }`;

/** Multiplies the first directional light (the sun) by the mountain shadow. */
export function injectSunShadow(fragmentShader, worldVar = 'vSharedWorld') {
  const lights=THREE.ShaderChunk.lights_fragment_begin.replace(
    'getDirectionalLightInfo( directionalLight, directLight );',
    `getDirectionalLightInfo( directionalLight, directLight );
     #if UNROLLED_LOOP_INDEX == 0
       directLight.color *= macroSunShadow( ${worldVar} );
     #endif`,
  );
  // onBeforeCompile runs before Three resolves includes. Expand this one chunk
  // explicitly so the patch reaches the direct light, and retain a hook for RT.
  return fragmentShader.replace('#include <lights_fragment_begin>',`// SUN_LIGHT_BEGIN\n${lights}\n// SUN_LIGHT_END`);
}

/** Patch a standard material (keeps any existing onBeforeCompile). */
export function patchMacroShadow(mat) {
  if (!mat || mat.userData.macroPatched || !(mat.isMeshStandardMaterial)) return;
  mat.userData.macroPatched = true;
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    sh.uniforms.uMacroShadow = SHARED.uMacroShadow; sh.uniforms.uMacroRect = SHARED.uMacroRect;
    sh.vertexShader = 'varying vec3 vSharedWorld;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n' + WORLD_POS_VERTEX);
    sh.fragmentShader = 'varying vec3 vSharedWorld;\n' + MACRO_SHADOW_PARS + '\n' + injectSunShadow(sh.fragmentShader);
  };
  const key = mat.customProgramCacheKey ? mat.customProgramCacheKey.bind(mat) : () => '';
  mat.customProgramCacheKey = () => key() + '|macro';
  mat.needsUpdate = true;
}

/** Patch every standard material in a subtree. */
export function patchSceneMaterials(root) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) patchMacroShadow(m);
  });
}
