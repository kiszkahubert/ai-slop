// Post-processing: HDR scene render -> screen-space ambient occlusion (High) -> composite (+ vignette)
// -> depth of field (High, free viewing only) -> bloom (Medium/High) -> ACES tone mapping and sRGB output.
// The game uses a logarithmic depth buffer (true-scale terrain from 0.3 m to 150 km), which the stock SSAO/GTAO and
// Bokeh passes cannot read, so the AO and DOF passes here decode it themselves:
//   depth d = log2(1 + w) / log2(far + 1)  ->  view distance w = 2^(d · log2(far + 1)) - 1.
// On Low only the terrain depth prepass (depthPrepass.js) runs here and the renderer draws straight to the screen with ACES tone mapping.
import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { VISUALS } from '../config.js';
import { RT_SHARED } from './rayTracing/materials.js';
import { TerrainDepthPrepass } from './depthPrepass.js';

const VERT = `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4( position.xy, 0.0, 1.0 ); }`;
const DEPTH = `
  uniform sampler2D tDepth; uniform float uLogFar; uniform vec2 uProj;
  float viewDist( vec2 uv ) { return exp2( texture2D( tDepth, uv ).x * uLogFar ) - 1.0; }
  vec3 viewPos( vec2 uv ) { float z = viewDist( uv ); vec2 n = uv * 2.0 - 1.0; return vec3( n.x * z / uProj.x, n.y * z / uProj.y, -z ); }`;

const AO_FRAG = `
  varying vec2 vUv; uniform vec2 uTexel; uniform float uRadius; uniform float uIntensity; uniform float uMaxDist;
  ${DEPTH}
  void main() {
    float d = texture2D( tDepth, vUv ).x;
    if ( d >= 0.99999 ) { gl_FragColor = vec4( 1.0 ); return; }
    vec3 P = viewPos( vUv );
    float z = -P.z;
    if ( z > uMaxDist ) { gl_FragColor = vec4( 1.0 ); return; }
    vec3 N = normalize( cross( viewPos( vUv + vec2( uTexel.x, 0.0 ) ) - P, viewPos( vUv + vec2( 0.0, uTexel.y ) ) - P ) );
    if ( dot( N, P ) > 0.0 ) N = -N;
    vec2 rUv = 0.5 * uRadius * uProj / z;
    float jitter = fract( sin( dot( gl_FragCoord.xy, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 ) * 6.2832;
    float occ = 0.0;
    for ( int i = 0; i < 12; i ++ ) {
      float fi = float( i ), a = fi * 2.39996 + jitter, r = ( fi + 0.5 ) / 12.0;
      vec2 uv = vUv + vec2( cos( a ), sin( a ) ) * rUv * r;
      vec3 v = viewPos( uv ) - P;
      float vv = dot( v, v );
      float range = 1.0 - smoothstep( uRadius, uRadius * 2.0, sqrt( vv ) );
      occ += max( 0.0, dot( v, N ) - 0.02 * uRadius ) / ( vv + 0.0005 * z ) * range;
    }
    float ao = clamp( 1.0 - uIntensity * occ * ( 2.0 / 12.0 ) * uRadius, 0.0, 1.0 );
    ao = mix( ao, 1.0, smoothstep( uMaxDist * 0.6, uMaxDist, z ) );
    gl_FragColor = vec4( ao, ao, ao, 1.0 );
  }`;

const BLUR_FRAG = `
  varying vec2 vUv; uniform sampler2D tAO; uniform vec2 uTexel;
  ${DEPTH}
  void main() {
    float z0 = viewDist( vUv ), sum = 0.0, wsum = 0.0;
    for ( int y = -2; y <= 2; y ++ ) for ( int x = -2; x <= 2; x ++ ) {
      vec2 uv = vUv + vec2( float( x ), float( y ) ) * uTexel;
      float w = 1.0 / ( 1.0 + abs( viewDist( uv ) - z0 ) / max( 0.05, z0 * 0.02 ) * 4.0 );
      sum += texture2D( tAO, uv ).r * w; wsum += w;
    }
    float ao = sum / wsum;
    gl_FragColor = vec4( ao, ao, ao, 1.0 );
  }`;

const COMPOSITE_FRAG = `
  uniform sampler2D uRtPosition; uniform float uRtEnabled,uRtLocalReady;
  uniform vec3 uRtOrigin,uRtCamera;
  varying vec2 vUv; uniform sampler2D tColor; uniform sampler2D tAO; uniform float uUseAO; uniform float uVignette; uniform float uAspect;
  void main() {
    vec4 c = texture2D( tColor, vUv );
    // A mirror-sharp sun highlight can overflow the half-float buffer (Inf), and some drivers produce NaN. Either one
    // would be smeared by the bloom and depth-of-field blurs into a large black box, so they stop here.
    c.r = isnan( c.r ) ? 0.0 : c.r; c.g = isnan( c.g ) ? 0.0 : c.g; c.b = isnan( c.b ) ? 0.0 : c.b;
    c.rgb = clamp( c.rgb, 0.0, 256.0 );
    c.a = 1.0;
    if ( uUseAO > 0.5 ) {
      vec4 surface=texture2D(uRtPosition,vUv);
      float traced = uRtEnabled * uRtLocalReady * step(.5, surface.a) * (1.0-smoothstep(80.0,120.0,length(surface.xyz+uRtOrigin-uRtCamera)));
      c.rgb *= mix(texture2D(tAO,vUv).r,1.0,traced);
    }
    vec2 p = ( vUv - 0.5 ) * vec2( uAspect, 1.0 );
    c.rgb *= mix( 1.0, smoothstep( 1.05, 0.25, length( p ) ), uVignette );
    gl_FragColor = c;
  }`;

const DOF_FRAG = `
  varying vec2 vUv; uniform sampler2D tColor; uniform vec2 uTexel; uniform float uFocus; uniform float uRange; uniform float uMaxBlur;
  ${DEPTH}
  // a thin-lens circle of confusion: grows with |1 - focus / distance|, so the far mountains are softened, not smeared
  float coc( vec2 uv ) { float z = viewDist( uv ); return clamp( ( abs( 1.0 - uFocus / z ) - uRange / ( uFocus + uRange ) ) * 0.85, 0.0, 0.7 ); }
  void main() {
    float c0 = coc( vUv );
    vec4 sum = texture2D( tColor, vUv ); float wsum = 1.0;
    if ( c0 > 0.01 ) {
      for ( int i = 0; i < 24; i ++ ) {
        float fi = float( i ), a = fi * 2.39996, r = sqrt( ( fi + 0.5 ) / 24.0 );
        vec2 uv = vUv + vec2( cos( a ), sin( a ) ) * r * c0 * uMaxBlur * uTexel;
        float w = coc( uv ) + 0.05;                     // sharp foreground does not bleed into the blur
        sum += texture2D( tColor, uv ) * w; wsum += w;
      }
    }
    gl_FragColor = sum / wsum;
  }`;

function rt(w, h, opts = {}) {
  return new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, ...opts });
}
function quad(frag, uniforms) {
  return new FullScreenQuad(new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false }));
}

export class PostFX {
  constructor(renderer, scene, camera) {
    this.renderer = renderer; this.scene = scene; this.camera = camera;
    this.q = null; this.targets = []; this.w = 1; this.h = 1;
    const P = VISUALS.post;
    const depthU = () => ({ tDepth: { value: null }, uLogFar: { value: 1 }, uProj: { value: new THREE.Vector2(1, 1) } });
    this.aoQuad = quad(AO_FRAG, { ...depthU(), uTexel: { value: new THREE.Vector2() }, uRadius: { value: P.aoRadius }, uIntensity: { value: P.aoIntensity }, uMaxDist: { value: P.aoMaxDistance } });
    this.blurQuad = quad(BLUR_FRAG, { ...depthU(), tAO: { value: null }, uTexel: { value: new THREE.Vector2() } });
    this.compQuad = quad(COMPOSITE_FRAG, { ...RT_SHARED, tColor: { value: null }, tAO: { value: null }, uUseAO: { value: 0 }, uVignette: { value: P.vignette }, uAspect: { value: 1 } });
    this.dofQuad = quad(DOF_FRAG, { ...depthU(), tColor: { value: null }, uTexel: { value: new THREE.Vector2() }, uFocus: { value: 7 }, uRange: { value: P.dofFocusRange }, uMaxBlur: { value: P.dofMaxBlur } });
    this.output = new OutputPass();
    this.output.renderToScreen = true;
    this.prepass = new TerrainDepthPrepass(renderer);
  }

  /** (Re)build the render targets for a quality preset. */
  configure(q) {
    this.q = q;
    for (const t of this.targets) t.dispose();
    this.targets = []; this.sceneRT = this.hdrA = this.hdrB = this.aoRT = this.aoBlurRT = null;
    if (this.bloom) { this.bloom.dispose(); this.bloom = null; }
    if (!q.post) return;
    const needDepth = q.ssao || q.dof;
    this.sceneRT = rt(this.w, this.h, { depthBuffer: true, samples: q.msaa, depthTexture: needDepth ? new THREE.DepthTexture(this.w, this.h) : null });
    this.hdrA = rt(this.w, this.h); this.hdrB = rt(this.w, this.h);
    this.targets.push(this.sceneRT, this.hdrA, this.hdrB);
    if (q.ssao) {
      const hw = Math.max(1, this.w >> 1), hh = Math.max(1, this.h >> 1);
      this.aoRT = rt(hw, hh, { type: THREE.UnsignedByteType }); this.aoBlurRT = rt(hw, hh, { type: THREE.UnsignedByteType });
      this.targets.push(this.aoRT, this.aoBlurRT);
    }
    if (q.bloom) {
      const P = VISUALS.post;
      this.bloom = new UnrealBloomPass(new THREE.Vector2(this.w, this.h), P.bloomStrength, P.bloomRadius, P.bloomThreshold);
    }
  }

  setSize(w, h) {
    this.w = Math.max(1, Math.floor(w)); this.h = Math.max(1, Math.floor(h));
    this.prepass.setSize(this.w, this.h);
    if (this.q) this.configure(this.q);
  }

  /** opts: { free (bool), focus (m) } */
  render(opts = {}) {
    const { renderer, scene, camera, q } = this;
    this.prepass.render(scene, camera);             // terrain depth first: hidden terrain skips its shading
    if (!q || !q.post) { renderer.setRenderTarget(null); renderer.render(scene, camera); this.prepass.end(); return; }
    renderer.setRenderTarget(this.sceneRT);
    renderer.render(scene, camera);
    this.prepass.end();
    const logFar = Math.log2(camera.far + 1), proj = camera.projectionMatrix.elements;
    const setDepth = (u) => { u.tDepth.value = this.sceneRT.depthTexture; u.uLogFar.value = logFar; u.uProj.value.set(proj[0], proj[5]); };
    // ambient occlusion at half resolution, then a depth-aware blur
    const cu = this.compQuad.material.uniforms;
    cu.uUseAO.value = 0;
    if (q.ssao) {
      const au = this.aoQuad.material.uniforms; setDepth(au); au.uTexel.value.set(1 / this.aoRT.width, 1 / this.aoRT.height);
      renderer.setRenderTarget(this.aoRT); this.aoQuad.render(renderer);
      const bu = this.blurQuad.material.uniforms; setDepth(bu); bu.tAO.value = this.aoRT.texture; bu.uTexel.value.set(1 / this.aoRT.width, 1 / this.aoRT.height);
      renderer.setRenderTarget(this.aoBlurRT); this.blurQuad.render(renderer);
      cu.uUseAO.value = 1; cu.tAO.value = this.aoBlurRT.texture;
    }
    cu.tColor.value = this.sceneRT.texture; cu.uAspect.value = this.w / this.h;
    renderer.setRenderTarget(this.hdrA); this.compQuad.render(renderer);
    let cur = this.hdrA;
    if (q.dof && opts.free) {
      const du = this.dofQuad.material.uniforms; setDepth(du);
      du.tColor.value = cur.texture; du.uTexel.value.set(1 / this.w, 1 / this.h); du.uFocus.value = opts.focus || 7;
      renderer.setRenderTarget(this.hdrB); this.dofQuad.render(renderer);
      cur = this.hdrB;
    }
    if (this.bloom) this.bloom.render(renderer, null, cur, 0, false);
    this.output.render(renderer, null, cur);
  }
}

export function setupPostProcessing(renderer, scene, camera, quality) {
  const fx = new PostFX(renderer, scene, camera);
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  fx.setSize(size.x, size.y);
  fx.configure(quality);
  return fx;
}
