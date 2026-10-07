import * as THREE from 'three';
import { OCT } from './shaders.js';
import { SHARED } from '../shared.js';

export const BLACK = new THREE.DataTexture(new Float32Array(4),1,1,THREE.RGBAFormat,THREE.FloatType);BLACK.needsUpdate=true;
export const RT_SHARED = {
  uRtEnabled:{value:0},uRtOrigin:{value:new THREE.Vector3()},uRtCamera:{value:new THREE.Vector3()},uRtResolution:{value:new THREE.Vector2(1,1)},
  uRtCoreIrr:{value:BLACK},uRtCoreSun:{value:BLACK},uRtBackIrr:{value:BLACK},uRtBackSun:{value:BLACK},
  uRtCoreRect:{value:new THREE.Vector4()},uRtBackRect:{value:new THREE.Vector4()},
  uRtLocal:{value:BLACK},uRtPosition:{value:BLACK},uRtNormal:{value:BLACK},uRtLocalReady:{value:0},
  uRtDynamicShadow:{value:BLACK},uRtDynamicMatrix:{value:new THREE.Matrix4()},uRtDynamicSize:{value:new THREE.Vector2(1024,1024)},
  uRtStrength:{value:1.5},
  uRtDebug:{value:0},                          // 1 blend, 2 near-camera coverage, 3 traced ambient, 4 traced sun visibility
  uRtSky:{value:SHARED.uSkyAmbient.value},     // the same Color object, so it follows the sky without copying
};
export const MATERIAL_PARS = `
uniform float uRtEnabled,uRtLocalReady,uRtStrength,uRtDebug;
uniform vec3 uRtSky;
uniform vec3 uRtOrigin,uRtCamera;
uniform vec2 uRtResolution,uRtDynamicSize;
uniform vec4 uRtCoreRect,uRtBackRect;
uniform sampler2D uRtCoreIrr,uRtCoreSun,uRtBackIrr,uRtBackSun,uRtLocal,uRtPosition,uRtNormal,uRtDynamicShadow;
uniform mat4 uRtDynamicMatrix;
${OCT}
float rtCoreWeight(vec2 uv){vec2 edge=min(uv,1.0-uv)/max(uRtCoreRect.zw,vec2(1e-9));return smoothstep(0.0,128.0,min(edge.x,edge.y));}
vec4 rtCache(vec3 p){
  vec2 uv=(p.xz-uRtCoreRect.xy)*uRtCoreRect.zw,backUv=(p.xz-uRtBackRect.xy)*uRtBackRect.zw;
  vec4 b=vec4(0);float w=rtCoreWeight(uv);
  if(w<1.0&&all(greaterThanEqual(backUv,vec2(0)))&&all(lessThanEqual(backUv,vec2(1))))b=texture2D(uRtBackIrr,backUv);
  if(any(lessThan(uv,vec2(0)))||any(greaterThan(uv,vec2(1))))return b;
  vec4 c=texture2D(uRtCoreIrr,uv);
  if(b.a<.001)return c;if(c.a<.001)return b;return mix(b,c,w);
}
vec4 rtSunCache(vec3 p){
  vec2 uv=(p.xz-uRtCoreRect.xy)*uRtCoreRect.zw,backUv=(p.xz-uRtBackRect.xy)*uRtBackRect.zw;float w=rtCoreWeight(uv);
  vec4 b=vec4(0);if(w<1.0)b=texture2D(uRtBackSun,clamp(backUv,0.0,1.0));
  if(any(lessThan(uv,vec2(0)))||any(greaterThan(uv,vec2(1))))return b;
  vec4 c=texture2D(uRtCoreSun,uv);
  if(dot(b.ba,vec2(1))<.00001)return c;if(dot(c.ba,vec2(1))<.00001)return b;
  vec4 result=mix(b,c,w);result.ba=octEncode(normalize(mix(octDecode(b.ba),octDecode(c.ba),w)));return result;
}
float rtBlend(vec3 p){if(uRtEnabled<.5)return 0.0;return smoothstep(0.0,4.0,rtCache(p).a)*step(.00001,dot(rtSunCache(p).ba,vec2(1)));}
vec4 rtLocalValue(vec3 p,vec3 n,out float weight){
  weight=0.0;if(uRtLocalReady<.5||length(p-uRtCamera)>=120.0)return vec4(0);
  vec2 uv=gl_FragCoord.xy/uRtResolution;vec2 texel=1.0/vec2(textureSize(uRtLocal,0));vec4 sum=vec4(0);float ws=0.0;
  for(int y=0;y<2;y++)for(int x=0;x<2;x++){
    vec2 q=floor(uv/texel-0.5)*texel+(vec2(x,y)+.5)*texel;vec4 pos=texture2D(uRtPosition,q);vec3 nn=texture2D(uRtNormal,q).xyz;
    vec4 value=texture2D(uRtLocal,q);
    // Generous matching: the lighting buffer is a fraction of the screen resolution, and strict position/normal
    // tests rejected whole rows of pixels on bumpy ground (stripes that crawled as the camera moved).
    float w=pos.a>.5&&value.a>=0.0?exp(-length(pos.xyz+uRtOrigin-p)/max(.4,length(p-uRtCamera)*.04))*pow(max(dot(n,nn),0.0),4.0):0.0;
    sum+=value*w;ws+=w;
  }
  weight=(1.0-smoothstep(80.0,120.0,length(p-uRtCamera)))*smoothstep(.02,.25,ws);return sum/max(ws,.0001);
}
// Everything the material needs is looked up once per fragment (rtPrepare) and reused by the ambient, sun and
// shadow terms; the lookups are the expensive part of the forward pass.
bool gRtReady=false;float gRtBlend=0.0,gRtLocalW=0.0;vec4 gRtCache=vec4(0.0),gRtSun=vec4(0.0),gRtLocal=vec4(0.0);
void rtPrepare(vec3 p,vec3 n){
  if(gRtReady)return;gRtReady=true;if(uRtEnabled<.5)return;
  gRtCache=rtCache(p);gRtSun=rtSunCache(p);
  gRtBlend=smoothstep(0.0,4.0,gRtCache.a)*step(.00001,dot(gRtSun.ba,vec2(1)));
  if(gRtBlend>0.0)gRtLocal=rtLocalValue(p,n,gRtLocalW);
}
vec3 rtIrradiance(vec3 p,vec3 n){
  rtPrepare(p,n);vec3 bent=octDecode(gRtSun.ba);float directional=clamp(.7+.3*dot(n,bent),.4,1.0);
  vec3 traced=mix(gRtCache.rgb*directional,gRtLocal.rgb,gRtLocalW);
  // Strength > 1 exaggerates what tracing changes relative to an open sky: occluded light darker, bounce brighter.
  vec3 sky=max(uRtSky,vec3(1e-4));
  return sky*pow(max(traced,vec3(0.0))/sky,vec3(uRtStrength));
}
float rtSunVisibility(vec3 p,vec3 n){rtPrepare(p,n);return mix(gRtSun.r,gRtLocal.a*gRtSun.g,gRtLocalW);}
float rtLocalWeight(vec3 p,vec3 n){rtPrepare(p,n);return gRtLocalW*gRtBlend;}
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
    sh.fragmentShader=sh.fragmentShader.replace('#include <opaque_fragment>',`
      if(uRtDebug>0.5){
        vec3 rtDn=normalize((vec4(normal,0.0)*viewMatrix).xyz);rtPrepare(${world},rtDn);
        outgoingLight=uRtDebug<1.5?vec3(gRtBlend):uRtDebug<2.5?vec3(gRtLocalW*gRtBlend,gRtBlend*(1.0-gRtLocalW),0.0)
          :uRtDebug<3.5?rtIrradiance(${world},rtDn)*0.35:vec3(rtSunVisibility(${world},rtDn));
      }
      #include <opaque_fragment>`);
    sh.fragmentShader=sh.fragmentShader.replace('#include <aomap_fragment>',`
      vec3 rtWorldNormal=normalize((vec4(normal,0.0)*viewMatrix).xyz);
      rtPrepare(${world},rtWorldNormal);float rtAmount=gRtBlend;
      if(rtAmount>0.0)reflectedLight.indirectDiffuse=mix(reflectedLight.indirectDiffuse,rtIrradiance(${world},rtWorldNormal)*material.diffuseColor/3.14159265,rtAmount);
      #include <aomap_fragment>`);
    if(mat.userData.rtTerrain){
      sh.fragmentShader=sh.fragmentShader.replace('tAO = ao * bakedAO;',`rtPrepare(vWPos,tNrm);tAO = ao * mix(bakedAO,1.0,gRtBlend);`)
        .replace('tSnow * uSnowFx.y * vec3', 'tSnow * uSnowFx.y * (1.0-rtAmount) * vec3');
    }
    // Expand only this material's light chunk, retaining Three's other light and BRDF handling.
    const expanded=sh.fragmentShader.match(/\/\/ SUN_LIGHT_BEGIN\n([\s\S]*?)\n\/\/ SUN_LIGHT_END/);
    let lights=expanded?expanded[1]:THREE.ShaderChunk.lights_fragment_begin;
    // Covered pixels use traced sun visibility rather than multiplying it by
    // the fallback macro shadow a second time.
    lights=lights.replace('getDirectionalLightInfo( directionalLight, directLight );',`
      getDirectionalLightInfo(directionalLight,directLight);
      #if UNROLLED_LOOP_INDEX == 0
      vec3 rtN=normalize((vec4(normal,0.0)*viewMatrix).xyz);rtPrepare(${world},rtN);
      if(uRtEnabled>.5)directLight.color*=mix(1.0,rtSunVisibility(${world},rtN),gRtBlend);
      #endif`);
    lights=lights.replace(`macroSunShadow( ${world} )`,`mix(macroSunShadow( ${world} ),1.0,gRtBlend)`);
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
  mat.customProgramCacheKey=()=>key()+'|rt-forward-v2';mat.needsUpdate=true;
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
