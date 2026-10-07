import * as THREE from 'three';
import { createGlacierIceTextures } from './proceduralTextures.js';
import { patchMacroShadow, SHARED } from './shared.js';
import { terrainSampleShader } from '../world/terrainMaterial.js';
import { ICE_GROUND_GLSL, prepareIceGround } from './iceGround.js';

/** Own the shared ice maps; placements and geometry are independent of graphics quality. */
export class IceVisuals {
  constructor({ quality = { textureSize: 512 }, anisotropy = 1, field, terrainMaterial } = {}) {
    this.anisotropy = anisotropy; this.size = 0; this.disposed = false;
    this.field = field; this.terrainUniforms = terrainMaterial?.userData.uniforms;
    this.materials = {};
    for (const kind of ['tower', 'serac']) {
      const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0, flatShading: true });
      material.name = `Glacier ice ${kind}`; material.normalScale.setScalar(0.45);
      patchMacroShadow(material);
      if (field && this.terrainUniforms) this.patchGround(material);
      this.materials[kind] = material;
    }
    this.applyQuality(quality);
  }
  patchGround(material) {
    material.userData.iceBlend = true;
    const previous = material.onBeforeCompile, key = material.customProgramCacheKey.bind(material);
    material.onBeforeCompile = (sh, renderer) => {
      previous(sh, renderer); Object.assign(sh.uniforms, this.terrainUniforms);
      for (const name of ['uSunDir', 'uSunColor', 'uSkyAmbient']) sh.uniforms[name] = SHARED[name];
      sh.vertexShader = 'attribute vec4 iceGroundHeights; attribute vec4 iceGroundParams; varying vec4 vIceGround; varying float vIceGroundNormal;\n' +
        sh.vertexShader.replace('vSharedWorld = sharedWorldPos.xyz;', `vSharedWorld = sharedWorldPos.xyz;
          vec2 iceFoot=clamp(position.xz*0.5+0.5,0.0,1.0);
          float iceHeight=mix(mix(iceGroundHeights.x,iceGroundHeights.y,iceFoot.x),mix(iceGroundHeights.z,iceGroundHeights.w,iceFoot.x),iceFoot.y);
          vIceGround=vec4(iceHeight,iceGroundParams.xyz); vIceGroundNormal=iceGroundParams.w;`);
      sh.fragmentShader = 'varying vec4 vIceGround; varying float vIceGroundNormal; float iceBlend; float iceRough;\n' + terrainSampleShader() + ICE_GROUND_GLSL + sh.fragmentShader;
      sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
        vec3 iceBase=vec3(vSharedWorld.x,vIceGround.x,vSharedWorld.z);
        vec3 iceDx=dFdx(iceBase),iceDy=dFdy(iceBase);
        iceBlend=iceGroundWeight(iceBase,vSharedWorld.y-vIceGround.x,vIceGround.w); iceRough=1.0;
        if(iceBlend>0.001){
          vec3 iceGroundColor; secondaryTerrain(iceBase,iceGroundNormal(vIceGroundNormal),vIceGround.y,vIceGround.z,length(vSharedWorld-cameraPosition),iceDx,iceDy,iceGroundColor);
          diffuseColor.rgb=mix(diffuseColor.rgb,iceGroundColor,iceBlend); iceRough=tRough;
        }`).replace('#include <roughnessmap_fragment>', `
        // Normal RGB and roughness A share one sampler so terrain + traced lighting fit 16 texture units.
        float roughnessFactor=roughness*texture2D(normalMap,vNormalMapUv).a;
        roughnessFactor=mix(roughnessFactor,iceRough,iceBlend);`);
    };
    material.customProgramCacheKey = () => key() + '|ice-ground-v1';
  }
  prepareMesh(mesh) { if (this.field && this.terrainUniforms) prepareIceGround(mesh, this.field); }
  applyQuality(q) {
    if (this.disposed) return;
    if (this.terrainUniforms) for (const material of Object.values(this.materials)) {
      material.defines = { TERRAIN_MICRO: 0, TERRAIN_ANTI_TILING: q.textureSize >= 512 ? 1 : 0, TERRAIN_GRAD: q.exactGradients ? 1 : 0 };
      material.needsUpdate = true;
    }
    if (this.size === q.textureSize) return;
    const old = this.textures;
    this.textures = createGlacierIceTextures(q.textureSize, this.anisotropy); this.size = q.textureSize;
    for (const material of Object.values(this.materials)) { Object.assign(material, this.textures); material.needsUpdate = true; }
    for (const texture of Object.values(old || {})) texture.dispose();
  }
  stats() { return { textures: this.disposed ? 0 : 3, textureSize: this.size }; }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const material of Object.values(this.materials)) material.dispose();
    for (const texture of Object.values(this.textures || {})) texture.dispose();
    this.textures = null;
  }
}
