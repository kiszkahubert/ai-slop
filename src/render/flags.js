import * as THREE from 'three';
import { SHARED } from './shared.js';

const deform=`
  float seed=0.0;
  #ifdef USE_INSTANCING
    seed=dot(instanceMatrix[3].xz,vec2(.17,.31));
  #endif
  float freeEdge=uv.x*uv.x;
  float flutter=uTime*(2.0+uFlagWind*.035)+seed+uv.x*7.0-uv.y*2.0;
  transformed.z+=freeEdge*(.025+.055*clamp(uFlagWind/80.0,0.0,1.0))*sin(flutter);
  transformed.y+=freeEdge*.018*sin(flutter*.71+uv.y*5.0);`;

export function createFlagMaterial() {
  const material=new THREE.MeshStandardMaterial({side:THREE.DoubleSide,roughness:.93,flatShading:true});
  material.onBeforeCompile=shader=>{
    shader.uniforms.uTime=SHARED.uTime;shader.uniforms.uFlagWind=SHARED.uFlagWind;
    shader.vertexShader='uniform float uTime,uFlagWind;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n'+deform);
  };
  material.customProgramCacheKey=()=> 'wind-flags-v1';
  return material;
}

export function prepareFlagMesh(mesh) {
  mesh.castShadow=mesh.receiveShadow=true;mesh.userData.rtDynamic=true;
  const depth=new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking,side:THREE.DoubleSide});
  depth.onBeforeCompile=mesh.material.onBeforeCompile;
  depth.customProgramCacheKey=()=> 'wind-flags-depth-v1';
  mesh.customDepthMaterial=depth;
  // Deformation must not be culled at the undeformed plane's zero thickness.
  mesh.geometry.computeBoundingSphere();mesh.geometry.boundingSphere.radius+=.12;
  return mesh;
}
