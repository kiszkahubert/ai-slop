import * as THREE from 'three';
import { OCT } from './shaders.js';

export const BLACK = new THREE.DataTexture(new Float32Array(4),1,1,THREE.RGBAFormat,THREE.FloatType);BLACK.needsUpdate=true;
export const RT_SHARED = {
  uRtEnabled:{value:0},uRtOrigin:{value:new THREE.Vector3()},uRtCamera:{value:new THREE.Vector3()},uRtResolution:{value:new THREE.Vector2(1,1)},
  uRtCoreIrr:{value:BLACK},uRtCoreSun:{value:BLACK},uRtBackIrr:{value:BLACK},uRtBackSun:{value:BLACK},
  uRtCoreRect:{value:new THREE.Vector4()},uRtBackRect:{value:new THREE.Vector4()},
  uRtLocal:{value:BLACK},uRtPosition:{value:BLACK},uRtNormal:{value:BLACK},uRtLocalReady:{value:0},
  uRtDynamicShadow:{value:BLACK},uRtDynamicMatrix:{value:new THREE.Matrix4()},uRtDynamicSize:{value:new THREE.Vector2(1024,1024)},
};
export const MATERIAL_PARS = `
uniform float uRtEnabled,uRtLocalReady;
uniform vec3 uRtOrigin,uRtCamera;
uniform vec2 uRtResolution,uRtDynamicSize;
uniform vec4 uRtCoreRect,uRtBackRect;
uniform sampler2D uRtCoreIrr,uRtCoreSun,uRtBackIrr,uRtBackSun,uRtLocal,uRtPosition,uRtNormal,uRtDynamicShadow;
uniform mat4 uRtDynamicMatrix;
${OCT}
vec4 rtCache(vec3 p){vec2 uv=(p.xz-uRtCoreRect.xy)*uRtCoreRect.zw;if(all(greaterThanEqual(uv,vec2(0)))&&all(lessThanEqual(uv,vec2(1))))return texture2D(uRtCoreIrr,uv);
  uv=(p.xz-uRtBackRect.xy)*uRtBackRect.zw;if(all(greaterThanEqual(uv,vec2(0)))&&all(lessThanEqual(uv,vec2(1))))return texture2D(uRtBackIrr,uv);return vec4(0);}
vec4 rtSunCache(vec3 p){vec2 uv=(p.xz-uRtCoreRect.xy)*uRtCoreRect.zw;if(all(greaterThanEqual(uv,vec2(0)))&&all(lessThanEqual(uv,vec2(1))))return texture2D(uRtCoreSun,uv);
  uv=(p.xz-uRtBackRect.xy)*uRtBackRect.zw;return texture2D(uRtBackSun,clamp(uv,0.0,1.0));}
float rtBlend(vec3 p){if(uRtEnabled<.5)return 0.0;return smoothstep(0.0,4.0,rtCache(p).a)*step(.00001,dot(rtSunCache(p).ba,vec2(1)));}
vec4 rtLocalValue(vec3 p,vec3 n,out float weight){
  weight=0.0;if(uRtLocalReady<.5||length(p-uRtCamera)>=120.0)return vec4(0);
  vec2 uv=gl_FragCoord.xy/uRtResolution;vec2 texel=1.0/vec2(textureSize(uRtLocal,0));vec4 sum=vec4(0);float ws=0.0;
  for(int y=0;y<2;y++)for(int x=0;x<2;x++){
    vec2 q=floor(uv/texel-0.5)*texel+(vec2(x,y)+.5)*texel;vec4 pos=texture2D(uRtPosition,q);vec3 nn=texture2D(uRtNormal,q).xyz;
    vec4 value=texture2D(uRtLocal,q);
    float w=pos.a>.5&&value.a>=0.0?exp(-length(pos.xyz+uRtOrigin-p)/max(.25,length(p-uRtCamera)*.015))*pow(max(dot(n,nn),0.0),16.0):0.0;
    sum+=value*w;ws+=w;
  }
  weight=(1.0-smoothstep(80.0,120.0,length(p-uRtCamera)))*smoothstep(.1,.6,ws);return sum/max(ws,.0001);
}
vec3 rtIrradiance(vec3 p,vec3 n){
  vec4 c=rtCache(p),s=rtSunCache(p);vec3 bent=octDecode(s.ba);float directional=clamp(.7+.3*dot(n,bent),.4,1.0);
  float w;vec4 local=rtLocalValue(p,n,w);return mix(c.rgb*directional,local.rgb,w);
}
float rtSunVisibility(vec3 p,vec3 n){float w;vec4 local=rtLocalValue(p,n,w);vec4 s=rtSunCache(p);return mix(s.r,local.a*s.g,w);}
float rtLocalWeight(vec3 p,vec3 n){float w;rtLocalValue(p,n,w);return w>0.0?w*rtBlend(p):0.0;}
float rtDynamicShadow(vec3 p){
  vec4 c=uRtDynamicMatrix*vec4(p,1);c.xyz/=c.w;
  if(any(lessThan(c.xyz,vec3(0)))||any(greaterThan(c.xyz,vec3(1))))return 1.0;
  float shadow=0.0;
  for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
    float d=dot(texture2D(uRtDynamicShadow,c.xy+vec2(x,y)/uRtDynamicSize),vec4(1.0/16777216.0,1.0/65536.0,1.0/256.0,1.0)*.99609375);shadow+=step(c.z-.00002,d);
  }return shadow/9.0;
}
`;

export function patchRayTracingMaterial(mat) {
  if(!mat?.isMeshStandardMaterial||mat.userData.rtPatched)return;
  mat.userData.rtPatched=true;mat.userData.rtBaseCallback=mat.onBeforeCompile;
  const prev=mat.onBeforeCompile,key=mat.customProgramCacheKey.bind(mat),world=mat.userData.rtTerrain?'vWPos':'vSharedWorld';
  mat.onBeforeCompile=(sh,r)=>{
    prev(sh,r);Object.assign(sh.uniforms,RT_SHARED);
    sh.fragmentShader=MATERIAL_PARS+'\n'+sh.fragmentShader;
    // Material evaluation stays forward rendered. The new term replaces ambient diffuse before AO/fog.
    sh.fragmentShader=sh.fragmentShader.replace('#include <aomap_fragment>',`
      float rtAmount=rtBlend(${world});
      vec3 rtWorldNormal=normalize((vec4(normal,0.0)*viewMatrix).xyz);
      if(rtAmount>0.0)reflectedLight.indirectDiffuse=mix(reflectedLight.indirectDiffuse,rtIrradiance(${world},rtWorldNormal)*material.diffuseColor/3.14159265,rtAmount);
      #include <aomap_fragment>`);
    if(mat.userData.rtTerrain){
      sh.fragmentShader=sh.fragmentShader.replace('tAO = ao * bakedAO;',`tAO = ao * mix(bakedAO,1.0,rtBlend(vWPos));`)
        .replace('tSnow * uSnowFx.y * vec3', 'tSnow * uSnowFx.y * (1.0-rtAmount) * vec3');
    }
    // Expand only this material's light chunk, retaining Three's other light and BRDF handling.
    const expanded=sh.fragmentShader.match(/\/\/ SUN_LIGHT_BEGIN\n([\s\S]*?)\n\/\/ SUN_LIGHT_END/);
    let lights=expanded?expanded[1]:THREE.ShaderChunk.lights_fragment_begin;
    // Covered pixels use traced sun visibility rather than multiplying it by
    // the fallback macro shadow a second time.
    lights=lights.replace(`macroSunShadow( ${world} )`,`mix(macroSunShadow( ${world} ),1.0,rtBlend(${world}))`);
    lights=lights.replace('getDirectionalLightInfo( directionalLight, directLight );',`
      getDirectionalLightInfo(directionalLight,directLight);
      #if UNROLLED_LOOP_INDEX == 0
      vec3 rtN=normalize((vec4(normal,0.0)*viewMatrix).xyz);
      if(uRtEnabled>.5)directLight.color*=mix(1.0,rtSunVisibility(${world},rtN),rtBlend(${world}));
      #endif`);
    lights=lights.replace('directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;',`
      float stockShadow=(directLight.visible&&receiveShadow)?getShadow(directionalShadowMap[i],directionalLightShadow.shadowMapSize,directionalLightShadow.shadowBias,directionalLightShadow.shadowRadius,vDirectionalShadowCoord[i]):1.0;
      #if UNROLLED_LOOP_INDEX == 0
      float rtWeight=uRtEnabled>.5?rtLocalWeight(${world},rtN):0.0;
      directLight.color*=rtWeight>0.0?mix(stockShadow,rtDynamicShadow(${world}),rtWeight):stockShadow;
      #else
      directLight.color*=stockShadow;
      #endif`);
    sh.fragmentShader=expanded?sh.fragmentShader.replace(expanded[0],lights):sh.fragmentShader.replace('#include <lights_fragment_begin>',lights);
  };
  mat.customProgramCacheKey=()=>key()+'|rt-forward-v1';mat.needsUpdate=true;
}

export function captureMaterial(source,eligible,origin) {
  // Material.copy shares texture assets. Avoid JSON-cloning terrain uniforms and their large
  // typed arrays through userData for every display chunk entering the capture scene.
  const mat=new source.constructor().copy({...source,userData:{}}),prev=source.userData.rtBaseCallback||source.onBeforeCompile;
  mat.defines={...source.defines};
  mat.userData.rtCaptureEligible=eligible;
  const world=source.userData.rtTerrain?'vWPos':'vSharedWorld';
  mat.onBeforeCompile=(sh,r)=>{
    prev(sh,r);sh.uniforms.uCaptureOrigin={value:origin};sh.uniforms.uCaptureEligible={value:eligible?1:0};
    sh.fragmentShader=OCT+'\nuniform vec3 uCaptureOrigin;uniform float uCaptureEligible;layout(location=1) out vec4 outNormal;\n'+sh.fragmentShader;
    sh.fragmentShader=sh.fragmentShader.replace('#include <lights_physical_fragment>',`
      gl_FragColor=vec4(${world}-uCaptureOrigin,uCaptureEligible);
      vec3 geometricViewNormal=cross(dFdx(vViewPosition),dFdy(vViewPosition));
      geometricViewNormal=dot(geometricViewNormal,geometricViewNormal)>1e-12?normalize(geometricViewNormal):nonPerturbedNormal;
      vec3 geometricWorldNormal=normalize((vec4(geometricViewNormal,0.0)*viewMatrix).xyz);
      vec2 packedGeometric=floor(octEncode(geometricWorldNormal)*31.0+.5);
      outNormal=vec4(normalize((vec4(normal,0.0)*viewMatrix).xyz),packedGeometric.x+packedGeometric.y*32.0);return;
      #include <lights_physical_fragment>`);
  };
  mat.customProgramCacheKey=()=>source.uuid+'|rt-capture-'+eligible;mat.toneMapped=false;return mat;
}
