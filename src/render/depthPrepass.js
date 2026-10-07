// Terrain depth prepass. The scene uses a logarithmic depth buffer, so every material writes gl_FragDepth and the
// GPU can no longer reject hidden fragments before shading them: each layer of terrain behind a ridge, every chunk
// skirt and the sunken backdrop under the core terrain ran the full triplanar shader (measured: ~4.6 terrain
// fragments shaded per pixel at Base Camp). This pass first draws the terrain depth alone with a trivial shader,
// then the terrain shader skips the expensive part (layer textures, lighting) of any fragment that lies far behind
// all the terrain around that pixel (a slope behind a ridge, the backdrop sunk under the core terrain). A skipped
// fragment is one the depth test would have rejected anyway, so the image is unchanged; skirts and anything near
// the visible surface are always shaded, so antialiased edges and LOD cracks keep every sample.
import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { TERRAIN } from '../config.js';

/** Camera layer the terrain chunks are also on, so the prepass can draw them alone. */
export const TERRAIN_LAYER = 5;

/** Uniforms read by the terrain shader. uZCullOn is 1 only while the main view is drawn. */
export const ZCULL = { uZCull: { value: null }, uZCullOn: { value: 0 } };

/**
 * GLSL for the terrain shader, placed after the last texture read that relies on screen derivatives: discarding a
 * fragment leaves its 2x2 quad without helpers, so nothing below it may use implicit derivatives. `keep` is an
 * expression of every such value computed above: the discard depends on it (it is always > -1e30, and a NaN only
 * keeps the fragment), so the compiler cannot sink those reads below the discard.
 * Stored value = 1 / view depth of the farthest front terrain in the 5x5 pixels around (0 = sky there: no test).
 * Only terrain more than twice as far as all of that is skipped. The terrain is a height field and the camera never
 * rolls, so up a screen column the visible depth only grows: terrain glimpsed at one antialiasing sample of an
 * edge pixel is also what the pixel centres above it see, and lies within the neighbourhood's depth.
 */
export const zcullTest = (keep) => `
  if ( uZCullOn > 0.5 ) {
    float zcW = 1.0 / gl_FragCoord.w;
    float zcInv = texelFetch( uZCull, ivec2( gl_FragCoord.xy ), 0 ).r;
    if ( zcInv > 0.0 && zcW > 2.0 / zcInv + 50.0 + 2.0 * fwidth( zcW ) && ( ${keep} ) > -1e30 ) discard;
  }`;
export const ZCULL_PARS = 'uniform sampler2D uZCull;\nuniform float uZCullOn;\n';

const PREPASS_VERT = `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  uniform float uCurv;
  void main() {
    // the same transform as the terrain material: the Earth's curvature relative to the camera
    vec3 transformed = vec3( position );
    vec4 wp0 = modelMatrix * vec4( transformed, 1.0 );
    vec2 dc = wp0.xz - cameraPosition.xz;
    transformed.y -= dot( dc, dc ) * uCurv;
    vec4 mvPosition = modelViewMatrix * vec4( transformed, 1.0 );
    gl_Position = projectionMatrix * mvPosition;
    #include <logdepthbuf_vertex>
  }`;
const PREPASS_FRAG = `
  #include <common>
  #include <logdepthbuf_pars_fragment>
  void main() {
    #include <logdepthbuf_fragment>
    gl_FragColor = vec4( gl_FragCoord.w, 0.0, 0.0, 1.0 );
  }`;
const DILATE_FRAG = `
  uniform sampler2D tInv;
  void main() {
    ivec2 p = ivec2( gl_FragCoord.xy ), hi = textureSize( tInv, 0 ) - 1;
    float m = 3.4e38;
    for ( int y = -2; y <= 2; y ++ ) for ( int x = -2; x <= 2; x ++ )
      m = min( m, texelFetch( tInv, clamp( p + ivec2( x, y ), ivec2( 0 ), hi ), 0 ).r );
    gl_FragColor = vec4( m, 0.0, 0.0, 1.0 );      // 1 / the farthest terrain depth around the pixel
  }`;

export class TerrainDepthPrepass {
  constructor(renderer) {
    this.renderer = renderer;
    this.supported = renderer.capabilities.isWebGL2 && renderer.extensions.has('EXT_color_buffer_float');
    this.enabled = this.supported;
    this.material = new THREE.ShaderMaterial({
      vertexShader: PREPASS_VERT, fragmentShader: PREPASS_FRAG,
      uniforms: { uCurv: { value: 1 / (2 * TERRAIN.earthRadius) } },
    });
    this.dilate = new FullScreenQuad(new THREE.ShaderMaterial({
      vertexShader: 'void main() { gl_Position = vec4( position.xy, 0.0, 1.0 ); }', fragmentShader: DILATE_FRAG,
      uniforms: { tInv: { value: null } }, depthTest: false, depthWrite: false,
    }));
    this.depthRT = this.cullRT = null; this.w = this.h = 0;
    this.clear = new THREE.Color();
  }

  setSize(w, h) {
    if (!this.supported || (w === this.w && h === this.h)) return;
    this.w = w; this.h = h;
    this.depthRT?.dispose(); this.cullRT?.dispose();
    const opts = { type: THREE.FloatType, format: THREE.RedFormat, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false };
    this.depthRT = new THREE.WebGLRenderTarget(w, h, { ...opts, depthBuffer: true });
    this.cullRT = new THREE.WebGLRenderTarget(w, h, { ...opts, depthBuffer: false });
  }

  /** Draws the terrain depth for this view; afterwards the terrain shader culls hidden fragments (ZCULL.uZCullOn). */
  render(scene, camera) {
    ZCULL.uZCullOn.value = 0;
    if (!this.enabled || !this.depthRT) return false;
    const r = this.renderer, target = r.getRenderTarget(), override = scene.overrideMaterial, mask = camera.layers.mask;
    const shadows = r.shadowMap.autoUpdate, alpha = r.getClearAlpha(), autoClear = r.autoClear;
    r.getClearColor(this.clear);
    // the lights join the layer too: a light set that changed between the two draws would make three.js
    // re-validate every lit material's program each frame
    for (const o of scene.children) if (o.isLight) o.layers.enable(TERRAIN_LAYER);
    scene.overrideMaterial = this.material; camera.layers.set(TERRAIN_LAYER);
    r.shadowMap.autoUpdate = false; r.autoClear = true; r.setClearColor(0x000000, 0);
    r.setRenderTarget(this.depthRT); r.render(scene, camera);
    this.dilate.material.uniforms.tInv.value = this.depthRT.texture;
    r.setRenderTarget(this.cullRT); this.dilate.render(r);
    scene.overrideMaterial = override; camera.layers.mask = mask;
    r.shadowMap.autoUpdate = shadows; r.autoClear = autoClear; r.setClearColor(this.clear, alpha);
    r.setRenderTarget(target);
    ZCULL.uZCull.value = this.cullRT.texture; ZCULL.uZCullOn.value = 1;
    return true;
  }

  /** Call right after the main view is drawn, so other passes using the terrain material never cull. */
  end() { ZCULL.uZCullOn.value = 0; }
}
