import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { MATERIAL_PARS, RT_SHARED } from '../src/render/rayTracing/materials.js';

// Sample the same cache functions used by the forward shader, rather than treating
// a running service or allocated texture as proof that lighting reaches the scene.
export function readCacheCoverage(api) {
  const r=api.renderer,old=r.getRenderTarget(),target=new THREE.WebGLRenderTarget(1,1,{type:THREE.FloatType,depthBuffer:false}),pixels=new Float32Array(4);
  const quad=new FullScreenQuad(new THREE.ShaderMaterial({vertexShader:'void main(){gl_Position=vec4(position.xy,0,1);}',fragmentShader:MATERIAL_PARS+'\nuniform vec3 point;void main(){vec4 c=rtCache(point),sun=rtSunCache(point);gl_FragColor=vec4(c.a,sun.r,sun.b+sun.a,rtBlend(point));}',uniforms:{...RT_SHARED,point:{value:api.camera.position}},depthTest:false,depthWrite:false}));
  try{r.setRenderTarget(target);quad.render(r);r.readRenderTargetPixels(target,0,0,1,1,pixels);return Array.from(pixels);}
  finally{r.setRenderTarget(old);target.dispose();quad.material.dispose();quad.dispose();}
}
