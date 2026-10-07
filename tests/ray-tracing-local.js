return (async()=>{
const THREE=await import('three'),{FullScreenQuad}=await import('three/addons/postprocessing/Pass.js');
const {MeshBVH,MeshBVHUniformStruct,FloatVertexAttributeTexture}=await import('/assets/render/rt-runtime.js');
const {LOCAL_FRAG,VERT}=await import('/src/render/rayTracing/shaders.js');
const {halfTexture}=await import('/src/render/rayTracing/lighting.js');
const {RT_SHARED}=await import('/src/render/rayTracing/materials.js');
const r=__sim.renderer,old=r.getRenderTarget(),resources=[];
const make=(data,w=1,h=1)=>{const t=new THREE.DataTexture(new Float32Array(data),w,h,THREE.RGBAFormat,THREE.FloatType);t.needsUpdate=true;resources.push(t);return t;};
const p=make([0,0,0,1]),n=make([0,1,0,528]),black=make([0,0,0,1]),sun=make([1,1,0,0]);
const array=new THREE.DataArrayTexture(new Uint8Array([255,255,255,255]),1,1,1);array.needsUpdate=true;resources.push(array);
const material=__sim.terrain.mat;
const uniforms={...material.userData.uniforms,uPosition:{value:p},uNormal:{value:n},uColors:{value:null},uUvs:{value:null},uCacheIrr:{value:black},uCacheSun:{value:sun},uMasks:{value:RT_SHARED.uRtCoreIrr.value},uPropAlbedo:{value:array},uOrigin:{value:new THREE.Vector3()},uCamera:{value:new THREE.Vector3(0,2,10)},uMaskRect:{value:new THREE.Vector4()},uCacheRect:{value:new THREE.Vector4()},uFrame:{value:0},uBvh:{value:null},uSunDir:{value:new THREE.Vector3(0,1,0)},uSkyAmbient:{value:new THREE.Color(1,1,1)},uSunColor:{value:new THREE.Color(0,0,0)}};
const quad=new FullScreenQuad(new THREE.ShaderMaterial({uniforms,vertexShader:VERT,fragmentShader:LOCAL_FRAG,defines:{TERRAIN_GRAD:1,TERRAIN_MICRO:0,TERRAIN_ANTI_TILING:1},depthTest:false,depthWrite:false}));
const target=new THREE.WebGLRenderTarget(1,1,{type:THREE.FloatType,depthBuffer:false}),pixel=new Float32Array(4);
let bvh,colors,uvs,geometry;
const install=(g,color=[1,0,0,0],coord=[0,0,0,0])=>{
  bvh?.dispose();colors?.dispose();uvs?.dispose();geometry?.dispose();geometry=g;
  const count=g.attributes.position.count,col=new Float32Array(count*4),uv=new Float32Array(count*4);
  for(let i=0;i<count;i++){col.set(color,i*4);uv.set(coord,i*4);}g.setAttribute('color',new THREE.BufferAttribute(col,4));g.setAttribute('uv',new THREE.BufferAttribute(uv,4));
  g.clearGroups();bvh=new MeshBVHUniformStruct();bvh.updateFrom(new MeshBVH(g));colors=new FloatVertexAttributeTexture();uvs=new FloatVertexAttributeTexture();colors.updateFrom(g.attributes.color);uvs.updateFrom(g.attributes.uv);halfTexture(colors);halfTexture(uvs);
  uniforms.uBvh.value=bvh;uniforms.uColors.value=colors;uniforms.uUvs.value=uvs;
};
const sample=(frame,x=0)=>{p.image.data[0]=x;p.needsUpdate=true;uniforms.uFrame.value=frame;r.setRenderTarget(target);quad.render(r);r.readRenderTargetPixels(target,0,0,1,1,pixel);return Array.from(pixel);};
try {
  // This closed red box is entirely absent from the main rasterized scene.
  const room=new THREE.BoxGeometry(40,8,40);room.translate(0,4,0);install(room);
  let bounce=0,green=0,blocked=0;
  for(let i=1;i<=32;i++){const c=sample(i);bounce+=c[0]/32;green+=c[1]/32;blocked+=c[3]/32;}
  const roof=new THREE.BoxGeometry(10,.2,10);roof.translate(5,4,0);install(roof);
  let edge=0,left=0,right=0;
  for(let i=1;i<=64;i++){edge+=sample(i)[3]/64;left+=sample(i,-.2)[3]/64;right+=sample(i,.2)[3]/64;}
  // Secondary rays must see the same ground-to-white blend as the display material.
  // Use uniform brown terrain layers to make the expected blend independent of procedural noise.
  const ground=new THREE.DataArrayTexture(new Uint8Array([64,32,16,255,64,32,16,255,64,32,16,255,64,32,16,255]),1,1,4);
  const surface=new THREE.DataArrayTexture(new Uint8Array([128,128,230,255,128,128,230,255,128,128,230,255,128,128,230,255]),1,1,4);
  ground.needsUpdate=surface.needsUpdate=true;resources.push(ground,surface);
  uniforms.uAlbedo={value:ground};uniforms.uSurface={value:surface};uniforms.uTexSize={value:1};uniforms.uMacro={value:make([.5,.5,.5,.5])};
  const iceRoom=new THREE.BoxGeometry(40,8,40);iceRoom.translate(0,4,0);install(iceRoom,[0,0,0,-2],[.5,.5,3,528]);
  const foot=sample(1,0).slice(0,3);
  // Change only the gap above ground. The upper surface must retain the white map.
  for(let i=0;i<geometry.attributes.color.count;i++)geometry.attributes.color.setX(i,10);
  colors.updateFrom(geometry.attributes.color);halfTexture(colors);
  const crest=sample(1,0).slice(0,3),expected=[64,32,16].map(c=>(1-.72)+.72*c/255);
  const iceBlend=foot.every((c,i)=>Math.abs(c/crest[i]-expected[i])<.001)&&crest.every(c=>Math.abs(c-.25)<.001);
  return {pass:bounce>.2&&green<.001&&blocked===0&&edge>.25&&edge<.75&&left===1&&right===0&&iceBlend,bounce,green,blocked,penumbra:{edge,left,right},ice:{foot,crest,pass:iceBlend}};
}finally{r.setRenderTarget(old);quad.material.dispose();quad.dispose();target.dispose();bvh?.dispose();colors?.dispose();uvs?.dispose();geometry?.dispose();resources.forEach(t=>t.dispose());}
})();
