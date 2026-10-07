return (async()=>{
const THREE=await import('three'),{FullScreenQuad}=await import('three/addons/postprocessing/Pass.js');
const {CACHE_FRAG,VERT}=await import('/src/render/rayTracing/shaders.js'),{RT_SHARED}=await import('/src/render/rayTracing/materials.js');
const rt=__sim.rayTracing,r=__sim.renderer,old=r.getRenderTarget(),oldColor=r.getClearColor(new THREE.Color()),alpha=r.getClearAlpha(),auto=r.autoClear;
const textures=[],uniforms={...__sim.terrain.mat.userData.uniforms};
const texture=(data,w,h,format)=>{const t=new THREE.DataTexture(new Float32Array(data),w,h,format,THREE.FloatType);t.needsUpdate=true;textures.push(t);return t;};
for(let i=0;i<2;i++){
  uniforms['uHeight'+i]={value:texture([0,0,0,0],2,2,THREE.RedFormat)};uniforms['uBounds'+i]={value:texture([0,0],1,1,THREE.RGFormat)};
  uniforms['uGrid'+i]={value:new THREE.Vector4(-32,-32,64,0)};uniforms['uGridSize'+i]={value:new THREE.Vector2(2,2)};
  uniforms['uLevels'+i]={value:new Int32Array(Array.from({length:12},()=>[1,1,0,0]).flat())};uniforms['uLevelCount'+i]={value:1};
}
const black=texture([0,0,0,0],1,1,THREE.RGBAFormat),rect=new THREE.Vector4(-8,-8,1/16,1/16);
Object.assign(uniforms,{uMasks:{value:black},uMaskRect:{value:rect},uCacheRect:{value:rect},uField:{value:0},uFrame:{value:0},uReset:{value:0},uSunOnly:{value:0},uPreviousIrr:{value:black},uPreviousSun:{value:black},uSunDir:{value:new THREE.Vector3(0,1,0)},uSunColor:{value:new THREE.Color(1,1,1)},uSkyAmbient:{value:new THREE.Color(.3,.4,.5)}});
const q=new FullScreenQuad(new THREE.ShaderMaterial({vertexShader:VERT,fragmentShader:CACHE_FRAG,uniforms,defines:{TERRAIN_ANTI_TILING:1,TERRAIN_GRAD:1,TERRAIN_MICRO:0},depthTest:false,depthWrite:false}));
const pair=[0,1].map(()=>new THREE.WebGLMultipleRenderTargets(8,8,2,{type:THREE.HalfFloatType,depthBuffer:false}));
const c={field:0,sunOnly:0,rect,w:8,h:8,pair,read:0,tiles:[{x:2,y:3,w:2,h:2}],cursor:0,generation:1,versions:[]};
const cache={...rt,caches:[c,c,c,c],frame:0,cacheQuad:q,stats:{cacheTiles:0},draw:rt.draw};
const keys=['uRtCoreIrr','uRtCoreSun','uRtBackIrr','uRtBackSun'],saved=keys.map(k=>RT_SHARED[k].value);
const read=new THREE.WebGLRenderTarget(8,8,{type:THREE.FloatType,depthBuffer:false}),values=new Float32Array(8*8*4);
const copy=new FullScreenQuad(new THREE.ShaderMaterial({vertexShader:VERT,fragmentShader:'varying vec2 vUv;uniform sampler2D t;void main(){gl_FragColor=texture2D(t,vUv);}',uniforms:{t:{value:null}},depthTest:false,depthWrite:false}));
try{
  r.autoClear=false;r.setClearColor(0,0);for(const t of pair){r.setRenderTarget(t);r.clear();}
  rt.cacheStep.call(cache);copy.material.uniforms.t.value=pair[c.read].texture[0];r.setRenderTarget(read);copy.render(r);r.readRenderTargetPixels(read,0,0,8,8,values);
  let touched=0,outside=0;for(let y=0;y<8;y++)for(let x=0;x<8;x++)if(values[(y*8+x)*4+3]>.5){touched++;if(x<2||x>=4||y<3||y>=5)outside++;}
  return {pass:touched===4&&outside===0,touched,outside};
}finally{r.setRenderTarget(old);r.setClearColor(oldColor,alpha);r.autoClear=auto;r.setScissorTest(false);keys.forEach((k,i)=>RT_SHARED[k].value=saved[i]);q.material.dispose();q.dispose();copy.material.dispose();copy.dispose();read.dispose();pair.forEach(t=>t.dispose());textures.forEach(t=>t.dispose());}
})();
