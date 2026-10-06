import { terrainSampleShader } from '../../world/terrainMaterial.js';
import { HEIGHT_TRACE, RANDOM_GLSL } from './heightShader.js';
import { shaderStructs, shaderIntersectFunction } from '../../../assets/render/rt-runtime.js';

export const VERT = 'varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0,1);}';
export const OCT = `
vec2 octEncode(vec3 n){n/=abs(n.x)+abs(n.y)+abs(n.z);vec2 p=n.xz;return (n.y>=0.0?p:(1.0-abs(p.yx))*sign(p))*0.5+0.5;}
vec3 octDecode(vec2 p){p=p*2.0-1.0;vec3 n=vec3(p.x,1.0-abs(p.x)-abs(p.y),p.y);if(n.y<0.0)n.xz=(1.0-abs(n.zx))*sign(n.xz);return normalize(n);}
`;

export const CACHE_FRAG = `
varying vec2 vUv;
layout(location=1) out vec4 outSun;
uniform sampler2D uPreviousIrr,uPreviousSun,uMasks;
uniform vec4 uCacheRect,uMaskRect;
uniform int uField;
uniform float uFrame,uReset,uSunOnly;
${HEIGHT_TRACE}
${RANDOM_GLSL}
${OCT}
${terrainSampleShader()}
vec3 terrainAlbedo(vec3 p,vec3 n,float footprint){
  vec2 uv=(p.xz-uMaskRect.xy)*uMaskRect.zw;vec2 mask=texture2D(uMasks,clamp(uv,0.0,1.0)).rg;
  if(any(lessThan(uv,vec2(0)))||any(greaterThan(uv,vec2(1))))mask=vec2(0);
  vec3 c;secondaryTerrain(p,n,mask.r,mask.g,4000.0,vec3(footprint,0,0),vec3(0,0,footprint),c);return clamp(c,0.0,1.0);
}
void main(){
  vec2 xz=uCacheRect.xy+vUv/uCacheRect.zw;
  vec3 n=fieldNormal(uField,xz),p=vec3(xz.x,surfaceHeight(uField,xz),xz.y)+n*0.2;
  vec2 r=vec2(rand(gl_FragCoord.xy,uFrame),rand(gl_FragCoord.yx,uFrame+1.0));
  vec3 dir=hemisphere(n,r),sd=sunSample(uSunDir,fract(r+vec2(.373,.697)));
  int hf;float full=uSunDir.y>0.0?traceLandscape(p,sd,0.0,100000.0,hf):-1.0;
  float farSun=uSunDir.y>0.0?traceLandscape(p,sd,256.0,100000.0,hf):-1.0;
  float hit=uSunOnly>.5?-1.0:traceLandscape(p,dir,0.0,2048.0,hf);
  vec4 old=texture2D(uPreviousIrr,vUv),oldSun=texture2D(uPreviousSun,vUv);
  if(full== -2.0||farSun== -2.0||hit== -2.0){gl_FragColor=old*uReset;outSun=oldSun;return;}
  vec3 sky=uSkyAmbient*mix(0.35,1.0,max(dir.y,0.0)),irr=sky;
  vec3 bent=dir;
  if(hit>=0.0){
    vec3 q=p+dir*hit,hn=fieldNormal(hf,q.xz);if(dot(hn,dir)>0.0)hn=-hn;
    int sf;float shadow=traceLandscape(q+hn*0.2,sd,0.0,100000.0,sf);
    if(shadow== -2.0){gl_FragColor=old*uReset;outSun=oldSun;return;}
    vec3 alb=terrainAlbedo(q,hn,16.0);
    irr=alb*(uSkyAmbient*mix(.25,1.0,max(hn.y,0.0))+uSunColor*max(dot(hn,sd),0.0)*(shadow<0.0?1.0:0.0));
    bent=n;
  }
  float count=min(old.a*uReset,15.0),alpha=1.0/(count+1.0);
  gl_FragColor=vec4(mix(old.rgb,irr,alpha),count+1.0);
  vec3 previous=count>0.0?octDecode(oldSun.ba):n;
  outSun=vec4(mix(oldSun.rg,vec2(full<0.0?1.0:0.0,farSun<0.0?1.0:0.0),alpha),octEncode(normalize(mix(previous,bent,alpha))));
}
`;

export const LOCAL_FRAG = `
precision highp usampler2D;
precision highp isampler2D;
varying vec2 vUv;
uniform sampler2D uPosition,uNormal,uColors,uUvs,uCacheIrr,uCacheSun,uMasks;
uniform sampler2DArray uPropAlbedo;
uniform vec3 uOrigin,uCamera;
uniform vec4 uMaskRect,uCacheRect;
uniform float uFrame;
${shaderStructs}
${shaderIntersectFunction}
uniform BVH uBvh;
${RANDOM_GLSL}
${OCT}
${terrainSampleShader()}
bool localHit(vec3 p,vec3 d,float limit,out vec3 q,out vec3 n,out vec3 alb){
  uvec4 face;vec3 bary;float side,dist;
  bool hit=bvhIntersectFirstHit(uBvh,p-uOrigin,d,face,n,bary,side,dist);
  if(!hit||dist>limit)return false;
  q=p+d*dist;
  vec4 col=textureSampleBarycoord(uColors,bary,face.xyz);alb=col.rgb;
  if(col.a< -0.5){
    vec2 uv=(q.xz-uMaskRect.xy)*uMaskRect.zw,mask=texture2D(uMasks,clamp(uv,0.0,1.0)).rg;
    float footprint=max(.05,dist*.01);secondaryTerrain(q,n,mask.r,mask.g,length(q-uCamera),vec3(footprint,0,0),vec3(0,0,footprint),alb);
  }else if(col.a>0.5){vec2 uv=textureSampleBarycoord(uUvs,bary,face.xyz).xy;alb*=textureLod(uPropAlbedo,vec3(uv,col.a-1.0),0.0).rgb;}
  alb=clamp(alb,0.0,1.0);return true;
}
vec4 cached(vec3 p){return texture2D(uCacheIrr,clamp((p.xz-uCacheRect.xy)*uCacheRect.zw,0.0,1.0));}
void main(){
  vec4 P=texture2D(uPosition,vUv),N=texture2D(uNormal,vUv);vec3 p=P.xyz+uOrigin;
  vec3 geometricNormal=octDecode(vec2(mod(N.w,32.0),floor(N.w/32.0))/31.0);
  if(P.a<0.5||length(p-uCamera)>120.0){gl_FragColor=vec4(0);return;}
  vec2 r=vec2(rand(gl_FragCoord.xy,uFrame),rand(gl_FragCoord.yx,uFrame+3.0));
  vec3 sd=sunSample(uSunDir,fract(r+vec2(.193,.719))),dir=hemisphere(geometricNormal,r),q,hn,alb;
  float sun=1.0;if(uSunDir.y>0.0&&localHit(p+geometricNormal*.12,sd,256.0,q,hn,alb))sun=0.0;
  vec3 irr=cached(p).rgb;
  if(localHit(p+geometricNormal*.12,dir,128.0,q,hn,alb)){
    vec3 qq,nn,aa;float lit=localHit(q+hn*.12,sd,256.0,qq,nn,aa)?0.0:1.0;
    float distant=texture2D(uCacheSun,clamp((q.xz-uCacheRect.xy)*uCacheRect.zw,0.0,1.0)).g;
    irr=alb*(uSkyAmbient*mix(.25,1.0,max(hn.y,0.0))+uSunColor*max(dot(hn,sd),0.0)*lit*distant);
  }
  gl_FragColor=vec4(irr,sun);
}
`;

export const TEMPORAL_FRAG = `
varying vec2 vUv;
uniform sampler2D tCurrent,tHistory,tPosition,tPreviousPosition,tNormal,tPreviousNormal;
uniform mat4 uPreviousVP;
uniform vec3 uOrigin,uPreviousOrigin;
uniform vec2 uTexel;
uniform float uHistory,uReuse;
void main(){
  vec4 p=texture2D(tPosition,vUv),cur=texture2D(tCurrent,vUv);if(p.a<.5){gl_FragColor=cur;return;}
  vec4 clip=uPreviousVP*vec4(p.xyz+uOrigin,1);vec2 uv=clip.xy/clip.w*.5+.5;
  vec4 oldP=texture2D(tPreviousPosition,uv);vec3 n=texture2D(tNormal,vUv).xyz,oldN=texture2D(tPreviousNormal,uv).xyz;
  bool valid=uHistory>.5&&clip.w>0.0&&all(greaterThanEqual(uv,vec2(0)))&&all(lessThanEqual(uv,vec2(1)))&&oldP.a>.5;
  valid=valid&&length(oldP.xyz+uPreviousOrigin-p.xyz-uOrigin)<max(.25,length(p.xyz)*.0001)&&dot(n,oldN)>.9;
  if(uReuse>.5){gl_FragColor=valid?texture2D(tHistory,uv):vec4(0,0,0,-1);return;}
  vec4 lo=cur,hi=cur;
  for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){vec4 c=texture2D(tCurrent,vUv+vec2(x,y)*uTexel);lo=min(lo,c);hi=max(hi,c);}
  vec4 hist=clamp(texture2D(tHistory,uv),lo,hi);gl_FragColor=mix(cur,hist,valid?.85:0.0);
}
`;
export const FILTER_FRAG = `
varying vec2 vUv;uniform sampler2D tInput,tPosition,tNormal;uniform vec2 uTexel;uniform float uStep;
void main(){vec4 p=texture2D(tPosition,vUv),sum=vec4(0);vec3 n=texture2D(tNormal,vUv).xyz;float ws=0.0;
  if(p.a<.5||texture2D(tInput,vUv).a<0.0){gl_FragColor=texture2D(tInput,vUv);return;}
  for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
    vec2 uv=vUv+vec2(x,y)*uTexel*uStep;vec4 q=texture2D(tPosition,uv);vec3 nn=texture2D(tNormal,uv).xyz;
    float w=pow(max(dot(n,nn),0.0),32.0)*exp(-length(p.xyz-q.xyz)/max(.2,uStep*.2))*(q.a>.5?1.0:0.0);
    vec4 value=texture2D(tInput,uv);if(value.a<0.0)w=0.0;sum+=value*w;ws+=w;
  }gl_FragColor=sum/max(ws,0.0001);
}`;
