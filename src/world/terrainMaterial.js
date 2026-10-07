// Terrain shading, injected into MeshStandardMaterial:
//  - photographed rock and procedural snow/ice/moraine, each with albedo, normal, roughness and AO, sampled
//    with TRIPLANAR mapping (whiteout normal blend) so nothing stretches on steep faces;
//  - layers blended by altitude, slope, glacier and rock masks (the same masks the game always used), the Yellow Band
//    tinting the rock between ~7,430 and 7,670 m;
//  - anti-tiling: every layer is sampled at two scales mixed by low-frequency macro noise, plus a micro-detail
//    normal close to the camera;
//  - the Sobel relief normal and horizon AO baked from the elevation model (crisp distant relief);
//  - snow: sparkle in sunlight, blue subsurface-like brightening in shadow, wind-carved sastrugi;
//  - the mountains' own shadows (MacroShadow) on the sun light.
// The vertex stage also bends distant terrain down with the curvature of the Earth (relative to the camera).
import * as THREE from 'three';
import { TERRAIN, VISUALS } from '../config.js';
import { D2R } from '../core/math.js';
import { SHARED, MACRO_SHADOW_PARS, injectSunShadow } from '../render/shared.js';
import { ZCULL, ZCULL_PARS, zcullTest } from '../render/depthPrepass.js';

/**
 * opts: { layers: {albedo, surface, size} texture arrays, macroNoise, relief (texture|null), reliefRect (Vector4),
 *         microDetail (bool), antiTiling (bool), exactGradients (bool: textureGrad + hardware anisotropy) }
 */
export function createTerrainMaterial(opts) {
  const V = VISUALS.terrain, a = V.sastrugiAngleDeg * D2R;
  const uniforms = {
    uCurv: { value: 1 / (2 * TERRAIN.earthRadius) },
    uAlbedo: { value: opts.layers.albedo },
    uSurface: { value: opts.layers.surface },
    uTexSize: { value: opts.layers.size },
    uMacro: { value: opts.macroNoise },
    uRelief: { value: opts.relief },
    uReliefRect: { value: opts.relief ? opts.reliefRect : new THREE.Vector4(0, 0, 0, 0) },
    uReliefFade: { value: new THREE.Vector2(...V.reliefNormalFade) },
    uTile: { value: new THREE.Vector4(1 / V.textureTileM, 1 / V.microTileM, V.normalStrength, opts.microDetail ? V.microNormalStrength : 0) },
    uSnowFx: { value: new THREE.Vector4(V.snowSparkle, V.snowSubsurface, 0, V.aoStrength) },
    uSastrugiCS: { value: new THREE.Vector2(Math.cos(a), Math.sin(a)) },
    uZCull: ZCULL.uZCull, uZCullOn: ZCULL.uZCullOn,
  };
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.86, metalness: 0 });
  mat.userData.rtTerrain = true;
  mat.defines = { TERRAIN_ANTI_TILING: opts.antiTiling ? 1 : 0, TERRAIN_MICRO: opts.microDetail ? 1 : 0, TERRAIN_GRAD: opts.exactGradients ? 1 : 0 };
  mat.userData.uniforms = uniforms;
  mat.userData.macroPatched = true;           // has its own mountain-shadow code (see patchMacroShadow)
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    for (const k of ['uMacroShadow', 'uMacroRect', 'uSunDir', 'uSunColor', 'uSkyAmbient']) sh.uniforms[k] = SHARED[k];
    sh.vertexShader = 'attribute float aGlacier;\nattribute float aRock;\nuniform float uCurv;\nvarying float vGl;\nvarying float vRock;\nvarying vec3 vWPos;\nvarying vec3 vWNrm;\n' +
      sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        vec4 wp0 = modelMatrix * vec4(transformed, 1.0);
        vWPos = wp0.xyz; vWNrm = normalize(mat3(modelMatrix) * objectNormal); vGl = aGlacier; vRock = aRock;
        vec2 dc = wp0.xz - cameraPosition.xz;
        transformed.y -= dot(dc, dc) * uCurv;`);
    // hidden terrain (see depthPrepass.js) stops right after the last implicit-derivative texture read. Every
    // derivative needed later (the glints' footprint, three's geometric roughness) is taken before that point.
    const color = FRAG_COLOR.replace(DERIVATIVES, DERIVATIVES + PRE_CULL_DERIVATIVES + zcullTest(PRE_CULL_VALUES));
    sh.fragmentShader = FRAG_PARS + ZCULL_PARS + 'vec3 tDpx, tDpy; float tGeomRough;\n' + MACRO_SHADOW_PARS + '\n' + injectSunShadow(sh.fragmentShader, 'vWPos')
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + color)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        normal = normalize( ( viewMatrix * vec4( tNrm, 0.0 ) ).xyz );`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = tRough;`)
      // the same roughness three computes there, with its normal derivatives taken before any discard
      .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>
        material.roughness = min( max( roughnessFactor, 0.0525 ) + tGeomRough, 1.0 );`)
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>
        {
          float occ = mix( 1.0, tAO, uSnowFx.w );
          reflectedLight.indirectDiffuse *= occ; reflectedLight.indirectSpecular *= occ;
          // snow scatters light under its surface: shadowed snow glows faintly blue instead of going grey
          reflectedLight.indirectDiffuse += tSnow * uSnowFx.y * vec3( 0.30, 0.48, 0.85 ) * uSkyAmbient * diffuseColor.rgb * 0.9 * occ;
        }`)
      .replace('#include <opaque_fragment>', `
        {
          // sun glints on snow crystals: sparse facets that twinkle as the view moves
          vec3 cell = floor( vWPos * 18.0 );
          vec3 vd = normalize( cameraPosition - vWPos );
          float hsh = fract( sin( dot( cell, vec3( 12.9898, 78.233, 37.719 ) ) ) * 43758.5453 );
          vec3 facet = normalize( tNrm + vec3( hsh - 0.5, 0.0, fract(hsh * 17.0) - 0.5 ) * 0.35 );
          float ndl = max( dot( tNrm, uSunDir ), 0.0 );
          float resolved = 1.0 - smoothstep( 0.025, 0.09, max(length(tDpx), length(tDpy)) );   // = dFdx/dFdy(vWPos)
          float glint = smoothstep(0.985, 1.0, hsh) * pow(max(dot(facet, normalize(vd + uSunDir)), 0.0), 320.0)
            * resolved * ndl * tSnow * uSnowFx.x * macroSunShadow( vWPos )
            * ( 1.0 - smoothstep( 25.0, 70.0, length( cameraPosition - vWPos ) ) );
          outgoingLight += uSunColor * glint * 1.8;
        }
        #include <opaque_fragment>`);
  };
  mat.customProgramCacheKey = () => `terrain-zcull-${mat.defines.TERRAIN_ANTI_TILING}-${mat.defines.TERRAIN_MICRO}-${mat.defines.TERRAIN_GRAD}`;
  return mat;
}

/** Swap textures and detail options (quality change) without rebuilding the terrain. */
export function updateTerrainMaterial(mat, opts) {
  const u = mat.userData.uniforms, V = VISUALS.terrain;
  if (opts.layers) { u.uAlbedo.value.dispose(); u.uSurface.value.dispose(); u.uAlbedo.value = opts.layers.albedo; u.uSurface.value = opts.layers.surface; }
  if (opts.relief !== undefined) {
    if (u.uRelief.value && u.uRelief.value !== opts.relief) u.uRelief.value.dispose();
    u.uRelief.value = opts.relief; u.uReliefRect.value = opts.relief ? opts.reliefRect : new THREE.Vector4(0, 0, 0, 0);
  }
  if (opts.layers) u.uTexSize.value = opts.layers.size;
  u.uTile.value.w = opts.microDetail ? V.microNormalStrength : 0;
  mat.defines.TERRAIN_ANTI_TILING = opts.antiTiling ? 1 : 0; mat.defines.TERRAIN_MICRO = opts.microDetail ? 1 : 0;
  mat.defines.TERRAIN_GRAD = opts.exactGradients ? 1 : 0;
  mat.needsUpdate = true;
}

const FRAG_PARS = `
uniform sampler2DArray uAlbedo;
uniform sampler2DArray uSurface;
uniform sampler2D uMacro;
uniform sampler2D uRelief;
uniform vec4 uReliefRect;
uniform vec2 uReliefFade;
uniform vec4 uTile;
uniform vec4 uSnowFx;
uniform vec2 uSastrugiCS;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uSkyAmbient;
varying float vGl;
varying float vRock;
varying vec3 vWPos;
varying vec3 vWNrm;
vec3 tNrm; float tRough; float tAO; float tSnow;

uniform float uTexSize;
// High: exact gradients (hardware anisotropic filtering). Low/Medium: an explicit mip level that keeps up to 2x
// more detail along the stretched axis at grazing angles (an approximation of anisotropic filtering that is much
// cheaper on weak or software GPUs).
float lodOf( vec2 gx, vec2 gy ) {
  float a = length( gx ) * uTexSize, b = length( gy ) * uTexSize;
  return log2( max( max( a, b ) * 0.5, min( a, b ) ) );
}
#if TERRAIN_GRAD
  #define TSAMPLE( T, uv, L, gx, gy ) textureGrad( T, vec3( uv, L ), gx, gy )
#else
  #define TSAMPLE( T, uv, L, gx, gy ) textureLod( T, vec3( uv, L ), lodOf( gx, gy ) )
#endif
mat2 sastrugi() { return mat2( uSastrugiCS.x, uSastrugiCS.y, -uSastrugiCS.y, uSastrugiCS.x ); }

// one layer, triplanar, at one scale: albedo (rgb) + height (a) / normal (whiteout, world space), roughness, AO.
// Samples use explicit gradients (dx, dy = screen derivatives of the world position) because they sit inside
// branches, where implicit derivatives are undefined and would pick garbage mip levels.
void triLayer( float L, vec3 p, vec3 n, vec3 bw, float s, float strength, vec3 dx, vec3 dy,
               inout vec3 alb, inout vec3 nrm, inout float rough, inout float ao, float w ) {
  vec3 a = vec3( 0.0 ), nn = vec3( 0.0 ); float r = 0.0, o = 0.0;
  if ( bw.x > 0.0 ) {
    vec2 uv = p.zy * s, gx = dx.zy * s, gy = dy.zy * s;
    vec4 A = TSAMPLE( uAlbedo, uv, L, gx, gy ), B = TSAMPLE( uSurface, uv, L, gx, gy );
    vec2 t = ( B.xy * 2.0 - 1.0 ) * strength;
    nn += vec3( t + n.zy, n.x ).zyx * bw.x; a += A.rgb * bw.x; r += B.z * bw.x; o += B.w * bw.x;
  }
  if ( bw.y > 0.0 ) {
    vec2 uv = p.xz * s, gx = dx.xz * s, gy = dy.xz * s;
    if ( L == 1.0 ) { mat2 R = sastrugi(); uv = R * uv; gx = R * gx; gy = R * gy; }   // snow ripples lie across the prevailing wind
    vec4 A = TSAMPLE( uAlbedo, uv, L, gx, gy ), B = TSAMPLE( uSurface, uv, L, gx, gy );
    vec2 t = ( B.xy * 2.0 - 1.0 ) * strength;
    if ( L == 1.0 ) t = t * sastrugi();
    nn += vec3( t + n.xz, n.y ).xzy * bw.y; a += A.rgb * bw.y; r += B.z * bw.y; o += B.w * bw.y;
  }
  if ( bw.z > 0.0 ) {
    vec2 uv = p.xy * s, gx = dx.xy * s, gy = dy.xy * s;
    vec4 A = TSAMPLE( uAlbedo, uv, L, gx, gy ), B = TSAMPLE( uSurface, uv, L, gx, gy );
    vec2 t = ( B.xy * 2.0 - 1.0 ) * strength;
    nn += vec3( t + n.xy, n.z ) * bw.z; a += A.rgb * bw.z; r += B.z * bw.z; o += B.w * bw.z;
  }
  float bs = bw.x + bw.y + bw.z;
  alb += a / bs * w; nrm += nn / bs * w; rough += r / bs * w; ao += o / bs * w;
}

// a layer with anti-tiling (two scales, the second rotated and offset) and close-up micro normals
void layer( float L, vec3 p, vec3 n, vec3 bw, float mixN, float camD, float ns, vec3 dx, vec3 dy,
            inout vec3 alb, inout vec3 nrm, inout float rough, inout float ao, float w ) {
  if ( w < 0.005 ) return;
  float s = uTile.x, k = uTile.z * ns;
  #if TERRAIN_ANTI_TILING
    vec3 sw = vec3( 1.0, 1.0, -1.0 );
    triLayer( L, p, n, bw, s, k, dx, dy, alb, nrm, rough, ao, w * ( 1.0 - mixN ) );
    vec3 rotatedNormal = vec3(0.0);
    triLayer( L, p.zyx * sw + 37.0, n.zyx * sw, bw.zyx, s * 0.37, k, dx.zyx * sw, dy.zyx * sw, alb, rotatedNormal, rough, ao, w * mixN );
    // Inverse of R(v) = v.zyx * sw. Accumulate only in the original world basis.
    nrm += (rotatedNormal * sw).zyx;
  #else
    triLayer( L, p, n, bw, s, k, dx, dy, alb, nrm, rough, ao, w );
  #endif
  #if TERRAIN_MICRO
    float near = 1.0 - smoothstep( 30.0, 120.0, camD );
    if ( near > 0.0 ) {
      vec3 ma = vec3( 0.0 ), mn = vec3( 0.0 ); float mr = 0.0, mo = 0.0;
      triLayer( L, p + 11.0, n, bw, uTile.y, uTile.w * ns, dx, dy, ma, mn, mr, mo, 1.0 );
      nrm += ( mn - n ) * w * near;
    }
  #endif
}
`;

// The tracer samples the same authored layer blend with a ray footprint instead of screen derivatives.
export const terrainNormalShader = () => FRAG_PARS.replace(/varying[^;]+;/g, '');
export function terrainSampleShader() {
  const pars = terrainNormalShader();
  const body = FRAG_COLOR.replace('vec3 n0 = normalize( vWNrm );', '')
    .replace('float camD = length( vWPos - cameraPosition );', '')
    .replace('vec3 dpx = dFdx( q ), dpy = dFdy( q );', '')
    .replaceAll('vWPos', 'p').replaceAll('vGl', 'glacier').replaceAll('vRock', 'rock')
    .replace('diffuseColor.rgb = alb * tint;', 'result = alb * tint;');
  return pars + '\nvoid secondaryTerrain(vec3 p, vec3 n0, float glacier, float rock, float camD, vec3 dpx, vec3 dpy, out vec3 result)' + body;
}

const DERIVATIVES = 'vec3 dpx = dFdx( q ), dpy = dFdy( q );';
// = dFdx/dFdy of vWPos, and three's geometryRoughness from nonPerturbedNormal (normalize( vNormal ), front faces)
const PRE_CULL_DERIVATIVES = `
  tDpx = dpx; tDpy = dpy;
  { vec3 npn = normalize( vNormal ); vec3 dxy = max( abs( dFdx( npn ) ), abs( dFdy( npn ) ) ); tGeomRough = max( max( dxy.x, dxy.y ), dxy.z ); }`;
// everything above that came from implicit derivatives (relief and macro-noise reads, dFdx/dFdy)
const PRE_CULL_VALUES = 'rel.x + rel.y + rel.a + n1 + n2 + n3 + n4 + tGeomRough + dot( abs( tDpx ) + abs( tDpy ), vec3( 1.0 ) )';
const FRAG_COLOR = `
{
  vec3 n0 = normalize( vWNrm );
  float camD = length( vWPos - cameraPosition );
  // the relief map (Sobel on the elevation model) takes over from the coarse mesh normals in the distance
  vec2 ruv = ( vWPos.xz - uReliefRect.xy ) * uReliefRect.zw;
  vec2 reliefEdge = min(ruv, 1.0-ruv) / max(uReliefRect.zw, vec2(1e-9));
  float inside = uReliefRect.z > 0.0 ? smoothstep(0.0,64.0,min(reliefEdge.x,reliefEdge.y)) : 0.0;
  vec4 rel = mix( vec4( 0.5, 0.5, 1.0, 1.0 ), texture2D( uRelief, clamp( ruv, 0.0, 1.0 ) ), inside );
  vec3 nR = vec3( rel.r * 2.0 - 1.0, 0.0, rel.g * 2.0 - 1.0 ); nR.y = sqrt( max( 0.0, 1.0 - dot( nR.xz, nR.xz ) ) );
  vec3 nrm = normalize( mix( n0, nR, inside * smoothstep( uReliefFade.x, uReliefFade.y, camD ) ) );
  float bakedAO = mix( 1.0, rel.a, inside );

  float slope = 1.0 - clamp( nrm.y, 0.0, 1.0 );      // 1 - cos(angle): 40° = .234, 50° = .357, 60° = .5
  float hgt = vWPos.y;
  vec3 bw = pow( abs( nrm ), vec3( 6.0 ) ); bw /= ( bw.x + bw.y + bw.z );
  vec3 q = vWPos;
  // projections that would contribute little are faded out smoothly (no seams), saving their texture fetches
  vec3 bwT = max( bw - 0.06, 0.0 ); bwT /= ( bwT.x + bwT.y + bwT.z );
  #define TRI(S) ( texture2D( uMacro, q.zy * (S) ) * bw.x + texture2D( uMacro, q.xz * (S) ) * bw.y + texture2D( uMacro, q.xy * (S) ) * bw.z )
  float n1 = TRI( 0.0011 ).r;
  float n2 = TRI( 0.0093 ).g;
  float n3 = TRI( 0.071 ).b;
  vec3 qs = vec3( q.x * 0.002, hgt * 0.021, q.z * 0.002 );     // horizontal strata at the scale of the face
  float n4 = ( texture2D( uMacro, qs.zy ) * bw.x + texture2D( uMacro, qs.xz ) * bw.y + texture2D( uMacro, qs.xy ) * bw.z ).a;

  // ---- layer weights (rock, snow, ice, moraine) from the same masks as always
  float rk = smoothstep( 0.2, 0.4, slope );
  float wR = rk, wM = 1.0 - rk, wS = 0.0, wI = 0.0;
  float snowAmt = 1.0 - smoothstep( 0.36, 0.46, slope + ( n2 - 0.5 ) * 0.14 + ( n3 - 0.5 ) * 0.06 );
  // Accumulation favours shelves and lee faces; windward steep rock stays exposed.
  float windward = max(dot(nrm.xz, vec2(uSastrugiCS.x, uSastrugiCS.y)), 0.0);
  snowAmt *= 1.0 - windward * smoothstep(0.12, 0.4, slope) * 0.42;
  snowAmt *= smoothstep( 5200.0, 5750.0, hgt + ( n1 - 0.5 ) * 350.0 );
  wR *= 1.0 - snowAmt; wM *= 1.0 - snowAmt; wS = snowAmt;
  float blueIce = smoothstep( 0.17, 0.33, slope ) * ( 0.35 + 0.45 * n2 ) * 0.7;     // wind-polished ice on steep snow
  wI += wS * blueIce; wS *= 1.0 - blueIce;
  // glaciers: debris-covered below ~5,400 m, white/blue ice in the Icefall, snow in the Cwm
  float g = vGl * ( 1.0 - smoothstep( 0.22, 0.4, slope ) );
  float deb = smoothstep( 5470.0, 5330.0, hgt + ( n1 - 0.5 ) * 80.0 ), cwm = smoothstep( 5900.0, 6150.0, hgt ) * 0.9;
  wR = mix( wR, 0.0, g ); wM = mix( wM, deb * ( 1.0 - cwm ), g ); wS = mix( wS, cwm, g ); wI = mix( wI, ( 1.0 - deb ) * ( 1.0 - cwm ), g );
  // features below the DEM's resolution: Geneva Spur rock, Lhotse Couloir walls
  float rockF = vRock * smoothstep( 0.04, 0.15, slope + ( n3 - 0.5 ) * 0.1 ) * smoothstep( 0.25, 0.5, n2 + vRock * 0.4 );
  wS *= 1.0 - rockF; wI *= 1.0 - rockF; wM *= 1.0 - rockF; wR = wR * ( 1.0 - rockF ) + rockF;
  float tot = wR + wS + wI + wM; wR /= tot; wS /= tot; wI /= tot; wM /= tot;

  // ---- sample the layers
  vec3 alb = vec3( 0.0 ), nacc = vec3( 0.0 ); float rough = 0.0, ao = 0.0;
  float mixN = smoothstep( 0.3, 0.7, n2 );
  // wind carves sastrugi only in places: elsewhere the snow is smooth
  float carve = mix( 0.06, 0.7, smoothstep( 0.52, 0.78, n2 * 0.65 + n3 * 0.35 ) ) * ( 1.0 - 0.85 * smoothstep( 0.08, 0.25, slope ) );
  float detailFade = 1.0 - smoothstep(100.0, 1100.0, camD);
  vec3 dpx = dFdx( q ), dpy = dFdy( q );
  layer( 0.0, q, nrm, bwT, mixN, camD, mix(0.18, 0.75, detailFade), dpx, dpy, alb, nacc, rough, ao, wR );
  layer( 1.0, q, nrm, bwT, mixN, camD, carve * detailFade, dpx, dpy, alb, nacc, rough, ao, wS );
  layer( 2.0, q, nrm, bwT, mixN, camD, mix(0.15, 0.7, detailFade), dpx, dpy, alb, nacc, rough, ao, wI );
  layer( 3.0, q, nrm, bwT, mixN, camD, mix(0.15, 0.8, detailFade), dpx, dpy, alb, nacc, rough, ao, wM );
  // texture detail fades into the macro colour far away (the mip chain averages it anyway)
  float far = smoothstep( 2500.0, 9000.0, camD );
  tNrm = normalize( mix( nacc, nrm, far * 0.6 ) );
  tRough = rough; tAO = ao * bakedAO; tSnow = wS + wI * 0.6;

  // ---- colour: macro variation, the Yellow Band, the rock strata
  float bandN = ( n1 - 0.5 ) * 140.0 + ( n4 - 0.5 ) * 60.0;
  float yb = smoothstep( 7430.0, 7480.0, hgt + bandN ) * ( 1.0 - smoothstep( 7610.0, 7670.0, hgt + bandN ) );
  vec3 rockTint = mix( vec3( 1.0 ), vec3( 1.5, 1.27, 0.88 ), yb * 0.8 ) * ( 0.9 + 0.2 * n4 ) * ( 0.94 + 0.12 * n1 );
  vec3 snowTint = vec3( 0.97 + 0.05 * n2 );
  vec3 iceTint = mix( vec3( 0.95, 1.0, 1.04 ), vec3( 1.05, 1.02, 0.98 ), n3 );
  vec3 morTint = vec3( 0.85 + 0.3 * n2 );
  vec3 tint = rockTint * wR + snowTint * wS + iceTint * wI + morTint * wM;
  diffuseColor.rgb = alb * tint;
}
`;
