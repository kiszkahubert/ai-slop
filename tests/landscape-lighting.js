return (async()=>{
  const T=await import('three'),{FullScreenQuad}=await import('three/addons/postprocessing/Pass.js');
  const {CoreField}=await import('/src/world/heightfield.js'),{createLandscapeField}=await import('/src/world/landscape.js');
  const {buildHeightHierarchy}=await import('/src/render/rayTracing/heightHierarchy.js'),{HEIGHT_TRACE}=await import('/src/render/rayTracing/heightShader.js');
  const {MATERIAL_PARS,RT_SHARED}=await import('/src/render/rayTracing/materials.js');
  const r=__sim.renderer,old=r.getRenderTarget(),textures=[],quads=[],target=new T.WebGLRenderTarget(1,1,{type:T.FloatType,depthBuffer:false}),pixels=new Float32Array(4);
  const tex=(a,w,h,format=T.RGBAFormat)=>{const t=new T.DataTexture(new Float32Array(a),w,h,format,T.FloatType);t.needsUpdate=true;textures.push(t);return t;};
  const make=(g,h)=>new CoreField(g,Float32Array.from({length:g.nx*g.nz},(_,i)=>h(g.x0+i%g.nx*g.cell,g.z0+Math.floor(i/g.nx)*g.cell)));
  const core=make({x0:-64,z0:-48,cell:4,nx:33,nz:25},(x,z)=>6070+.1*x+.06*z),back=make({x0:-512,z0:-512,cell:16,nx:65,nz:65},(x,z)=>6000+.1*x+.06*z);
  const land=createLandscapeField(core,back),uniforms={ro:{value:new T.Vector3()},rd:{value:new T.Vector3(0,-1,0)}};
  [land,back].forEach((f,i)=>{const h=buildHeightHierarchy(f);uniforms['uHeight'+i]={value:tex(f.h,f.nx,f.nz,T.RedFormat)};uniforms['uBounds'+i]={value:tex(h.atlas,h.width,h.height,T.RGFormat)};
    uniforms['uGrid'+i]={value:new T.Vector4(f.x0,f.z0,f.cell,0)};uniforms['uGridSize'+i]={value:new T.Vector2(f.nx,f.nz)};uniforms['uLevels'+i]={value:new Int32Array(Array.from({length:12},(_,k)=>h.offsets[k]||[1,1,0,0]).flat())};uniforms['uLevelCount'+i]={value:h.offsets.length};});
  const quad=(fragmentShader,uniforms)=>{const q=new FullScreenQuad(new T.ShaderMaterial({vertexShader:'void main(){gl_Position=vec4(position.xy,0,1);}',fragmentShader,uniforms,depthTest:false,depthWrite:false}));quads.push(q);return q;};
  const traversal=quad(HEIGHT_TRACE+'\nuniform vec3 ro,rd;void main(){int f;gl_FragColor=vec4(traceLandscape(ro,rd,.01,10000.0,f),float(f),0,1);}',uniforms),rays=[];
  try{
    for(const [x,z]of[[core.x0,0],[core.x0-4,0],[core.x1+160,0],[0,core.z0-160],[0,core.z1+160],[land.x0,0],[land.x0-4,0],[land.x1,0],[land.x1+4,0],[0,land.z0],[0,land.z0-4],[0,land.z1],[0,land.z1+4],[land.x0,land.z0],[land.x1,land.z1]]){
      uniforms.ro.value.set(x,9000,z);r.setRenderTarget(target);traversal.render(r);r.readRenderTargetPixels(target,0,0,1,1,pixels);
      const expected=9000-land.height(x,z);rays.push({x,z,error:Math.abs(pixels[0]-expected)});
    }
    const cacheUniforms={...RT_SHARED,uRtEnabled:{value:1},uRtCoreRect:{value:new T.Vector4(0,0,1/512,1/512)},uRtBackRect:{value:new T.Vector4(-512,-512,1/1536,1/1536)},
      uRtCoreIrr:{value:tex([1,0,0,8],1,1)},uRtBackIrr:{value:tex([0,0,1,8],1,1)},uRtCoreSun:{value:tex([1,.5,.5,.5],1,1)},uRtBackSun:{value:tex([.5,1,.5,.5],1,1)},point:{value:new T.Vector3()}};
    const probe=quad(MATERIAL_PARS+'\nuniform vec3 point;void main(){vec4 c=rtCache(point),s=rtSunCache(point);gl_FragColor=vec4(c.r,c.b,s.r,rtBlend(point));}',cacheUniforms),mixes=[];
    for(const x of [-1,0,1,32,64,96,128,256,511,512,513]){
      cacheUniforms.point.value.set(x,6000,256);r.setRenderTarget(target);probe.render(r);r.readRenderTargetPixels(target,0,0,1,1,pixels);
      const t=Math.max(0,Math.min(1,Math.min(x,512-x)/128)),w=t*t*(3-2*t);
      mixes.push({x,error:Math.max(Math.abs(pixels[0]-w),Math.abs(pixels[1]-(1-w)),Math.abs(pixels[2]-(.5+.5*w)),Math.abs(pixels[3]-1))});
    }
    return {pass:rays.every(v=>v.error<.02)&&mixes.every(v=>v.error<.0001),rays:rays.length,maxHeightError:Math.max(...rays.map(v=>v.error)),cacheProbes:mixes.length,maxCacheError:Math.max(...mixes.map(v=>v.error))};
  }finally{r.setRenderTarget(old);target.dispose();textures.forEach(t=>t.dispose());quads.forEach(q=>{q.material.dispose();q.dispose();});}
})();
