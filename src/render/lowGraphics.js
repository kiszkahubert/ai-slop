import * as THREE from 'three';
import { TERRAIN } from '../config.js';

/** Vertex-lit terrain: no fragment texture reads, PBR, normal maps or terrain depth pass.
 * Uses the same mesh/masks, native crevasse collars and Earth curvature as the detailed renderer.
 * Lambert lighting retains the sun, moon, hemisphere and nighttime headlamp.
 */
export function createSimpleTerrainMaterial() {
  const material = new THREE.MeshLambertMaterial({ color: 0xffffff });
  material.name = 'Very Low terrain';
  material.userData.rtTerrain = true;
  material.onBeforeCompile = sh => {
    sh.uniforms.uCurv = { value: 1 / (2 * TERRAIN.earthRadius) };
    sh.vertexShader = `attribute float aGlacier; attribute float aRock;
      uniform float uCurv; varying vec3 vTerrainColor;\n` + sh.vertexShader.replace('#include <begin_vertex>', `
      #include <begin_vertex>
      vec4 wp = modelMatrix * vec4(transformed, 1.0);
      vec3 wn = normalize(mat3(modelMatrix) * objectNormal);
      float slope = 1.0 - clamp(wn.y, 0.0, 1.0);
      // Broad rock/snow/ice/debris regions remain readable without triplanar textures.
      float snow = (1.0-smoothstep(0.25,0.46,slope))*smoothstep(5200.0,5750.0,wp.y);
      snow *= 1.0-clamp(aRock,0.0,1.0)*smoothstep(0.04,0.2,slope);
      vec3 rock = mix(vec3(0.22,0.19,0.16),vec3(0.33,0.29,0.23),wn.y);
      float band = smoothstep(7430.0,7480.0,wp.y)*(1.0-smoothstep(7610.0,7670.0,wp.y));
      rock *= mix(vec3(1.0),vec3(1.35,1.15,0.8),band);
      vTerrainColor = mix(rock,vec3(0.82,0.87,0.92),snow);
      vec3 glacier = mix(vec3(0.24,0.21,0.17),vec3(0.56,0.73,0.82),smoothstep(5350.0,5510.0,wp.y));
      glacier = mix(glacier,vec3(0.82,0.87,0.92),smoothstep(5900.0,6150.0,wp.y));
      vTerrainColor = mix(vTerrainColor,glacier,aGlacier*(1.0-smoothstep(0.22,0.4,slope)));
      vec2 dc = wp.xz-cameraPosition.xz;
      transformed.y -= dot(dc,dc)*uCurv;`);
    sh.fragmentShader = 'varying vec3 vTerrainColor;\n' + sh.fragmentShader.replace(
      '#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb *= vTerrainColor;');
  };
  material.customProgramCacheKey = () => 'verylow-terrain-v1';
  return material;
}

/** Reversible render-only substitutions. Shared source materials and simulation geometry stay intact. */
export class LowGraphics {
  constructor(scene, world) {
    this.scene = scene; this.world = world; this.originals = new Map(); this.materials = new Map(); this.active = false;
  }
  simplified(source) {
    if (this.materials.has(source)) return this.materials.get(source);
    const material = new THREE.MeshLambertMaterial({
      color: source.color, emissive: source.emissive, emissiveIntensity: source.emissiveIntensity,
      vertexColors: source.vertexColors, side: source.side, transparent: source.transparent,
      opacity: source.opacity, alphaTest: source.alphaTest, depthWrite: source.depthWrite,
      depthTest: source.depthTest, fog: source.fog, wireframe: source.wireframe,
      // Preserve cutouts and decals (flags, goggles, helmet); omit opaque surface detail.
      map: source.transparent || source.alphaTest > 0 || source.map?.isCanvasTexture ? source.map : null,
      alphaMap: source.alphaMap,
    });
    if (source.name.startsWith('Glacier ice')) material.color.set(0xb9d9e8);
    if (source === this.world.crevasseVisuals.material) material.color.set(0xb9d9e8);
    material.name = source.name + ' (Very Low)';
    this.materials.set(source, material); return material;
  }
  apply(active) {
    if (this.active === active) return;
    this.active = active;
    if (active) {
      this.scene.traverse(o => {
        if (!o.isMesh) return;
        const original = o.material, list = Array.isArray(original) ? original : [original];
        if (!list.some(m => m.isMeshStandardMaterial && !m.userData.rtTerrain)) return;
        this.originals.set(o, original);
        const simple = list.map(m => m.isMeshStandardMaterial && !m.userData.rtTerrain ? this.simplified(m) : m);
        o.material = Array.isArray(original) ? simple : simple[0];
      });
    } else {
      for (const [mesh, material] of this.originals) mesh.material = material;
      this.originals.clear();
      // Texture sets are replaced by quality switches, so don't keep stale substitutions alive.
      for (const material of this.materials.values()) material.dispose();
      this.materials.clear();
    }
    for (const mesh of this.world.routeWear.meshes) mesh.visible = !active;
  }
}
