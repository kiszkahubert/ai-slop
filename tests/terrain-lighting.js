return (async()=>{
  const THREE=await import('three');const {createTerrainMaterial}=await import('/src/world/terrainMaterial.js');
  const {SHARED}=await import('/src/render/shared.js');
  const {RT_SHARED,patchRayTracingMaterial,MATERIAL_PARS}=await import('/src/render/rayTracing/materials.js');
  const r=__sim.renderer,old=r.getRenderTarget(),scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-1,1,1,-1,.1,30);
  camera.position.set(0,10,0);camera.up.set(0,0,-1);camera.lookAt(0,0,0);
  const sun=new THREE.DirectionalLight(0xffffff,3);sun.position.set(8,6,0);scene.add(sun);
  const tex=new THREE.DataArrayTexture(new Float32Array(Array.from({length:4},()=>[.5,.5,.85,1]).flat()),1,1,4);tex.type=THREE.FloatType;tex.needsUpdate=true;
  const noise=new THREE.DataTexture(new Uint8Array([128,128,128,128]),1,1);noise.needsUpdate=true;
  const mat=createTerrainMaterial({layers:{albedo:tex,surface:tex,size:1},macroNoise:noise,relief:null,antiTiling:true,microDetail:true});
  mat.userData.uniforms.uSnowFx.value.set(0,0,0,0);
  const geometry=new THREE.PlaneGeometry(2,2).rotateX(-Math.PI/2);
  geometry.setAttribute('aGlacier',new THREE.Float32BufferAttribute([0,0,0,0],1));geometry.setAttribute('aRock',new THREE.Float32BufferAttribute([0,0,0,0],1));
  const mesh=new THREE.Mesh(geometry,mat);scene.add(mesh);
  const target=new THREE.WebGLRenderTarget(4,4,{type:THREE.FloatType,depthBuffer:true}),pixels=new Float32Array(64);
  const saved={rect:SHARED.uMacroRect.value.clone(),sun:SHARED.uSunDir.value.clone(),sky:SHARED.uSkyAmbient.value.clone(),map:SHARED.uMacroShadow.value,exposure:r.toneMappingExposure};
  const shadow=new THREE.DataTexture(new Uint8Array([0,0,0,255]),1,1);shadow.needsUpdate=true;
  const irradiance=new THREE.DataTexture(new Float32Array([0,0,0,4]),1,1,THREE.RGBAFormat,THREE.FloatType);
  const visibility=new THREE.DataTexture(new Float32Array([1,1,.5,1]),1,1,THREE.RGBAFormat,THREE.FloatType);
  irradiance.needsUpdate=visibility.needsUpdate=true;
  const rtSaved=Object.fromEntries(Object.entries(RT_SHARED).map(([k,u])=>[k,u.value]));
  const contactShadow=async()=>{
    const {setupLighting}=await import('/src/render/lighting.js');
    const {FullScreenQuad}=await import('three/addons/postprocessing/Pass.js');
    const scene=new THREE.Scene(),lights=setupLighting(scene,{shadowExtent:55,shadowMapSize:2048});
    scene.remove(lights.hemi,lights.moon,lights.headlamp);
    lights.follow({x:0,y:0,z:0},new THREE.Vector3(.8,.6,0));
    const floor=new THREE.Mesh(new THREE.PlaneGeometry(2,2).rotateX(-Math.PI/2),new THREE.MeshStandardMaterial({roughness:1}));floor.receiveShadow=true;
    const boot=new THREE.Mesh(new THREE.BoxGeometry(.12,.22,.32),new THREE.MeshStandardMaterial());boot.position.y=.12;boot.castShadow=true;scene.add(floor,boot);
    const target=new THREE.WebGLRenderTarget(16,16,{type:THREE.FloatType}),pixel=new Float32Array(4),enabled=r.shadowMap.enabled;
    const traced=new THREE.WebGLRenderTarget(1,1,{type:THREE.FloatType}),quad=new FullScreenQuad(new THREE.ShaderMaterial({uniforms:RT_SHARED,vertexShader:'void main(){gl_Position=vec4(position.xy,0,1);}',fragmentShader:MATERIAL_PARS+'\nvoid main(){gl_FragColor=vec4(vec3(rtDynamicShadow(vec3(-.1875,0.0,-.0625))),1.0);}',depthTest:false,depthWrite:false}));
    const read=()=>{r.shadowMap.needsUpdate=true;r.setRenderTarget(target);r.render(scene,camera);r.readRenderTargetPixels(target,6,8,1,1,pixel);return (pixel[0]+pixel[1]+pixel[2])/3;};
    const trace=()=>{RT_SHARED.uRtDynamicShadow.value=lights.sun.shadow.map.texture;RT_SHARED.uRtDynamicMatrix.value=lights.sun.shadow.matrix.clone();RT_SHARED.uRtDynamicSize.value=lights.sun.shadow.mapSize.clone();r.setRenderTarget(traced);quad.render(r);r.readRenderTargetPixels(traced,0,0,1,1,pixel);return pixel[0];};
    try{
      r.shadowMap.enabled=true;const shadow=read(),dynamic=trace();
      lights.sun.shadow.bias=-.00025;lights.sun.shadow.normalBias=.035;const detached=read();
      boot.castShadow=false;const lit=read(),dynamicLit=trace();
      return {shadow,detached,lit,dynamic,dynamicLit,pass:shadow<lit*.85&&shadow<detached*.85&&Math.abs(detached-lit)<.01&&lit>.1&&dynamic<.9&&dynamicLit>.99};
    }
    finally{r.shadowMap.enabled=enabled;lights.sun.shadow.map?.dispose();target.dispose();traced.dispose();quad.material.dispose();quad.dispose();floor.geometry.dispose();floor.material.dispose();boot.geometry.dispose();boot.material.dispose();}
  };
  const sample=(x,occluded)=>{
    const normals=geometry.attributes.normal;for(let i=0;i<normals.count;i++)normals.setXYZ(i,x,.6,0);normals.needsUpdate=true;
    SHARED.uMacroRect.value.set(-10,-10,occluded?.05:0,.05);r.setRenderTarget(target);r.render(scene,camera);r.readRenderTargetPixels(target,0,0,4,4,pixels);
    return (pixels[20]+pixels[21]+pixels[22])/3;
  };
  try {
    SHARED.uMacroShadow.value=shadow;SHARED.uSkyAmbient.value.setRGB(0,0,0);SHARED.uSunDir.value.set(.8,.6,0);r.toneMappingExposure=.72;
    const lit=sample(.8,false),opposed=sample(-.8,false),occluded=sample(.8,true);
    patchRayTracingMaterial(mat);
    RT_SHARED.uRtEnabled.value=1;RT_SHARED.uRtLocalReady.value=0;
    RT_SHARED.uRtCoreIrr.value=irradiance;RT_SHARED.uRtCoreSun.value=visibility;
    RT_SHARED.uRtCoreRect.value=new THREE.Vector4(-10,-10,.05,.05);
    const tracedLit=sample(.8,true);
    visibility.image.data[0]=0;visibility.needsUpdate=true;const tracedShadow=sample(.8,false);
    const contact=await contactShadow();
    return {pass:lit>opposed*3&&lit>occluded*3&&Number.isFinite(lit)&&Math.abs(tracedLit-lit)<.001&&tracedShadow<tracedLit*.05&&contact.pass,lit,opposed,occluded,tracedLit,tracedShadow,contact};
  }finally{
    SHARED.uMacroRect.value.copy(saved.rect);SHARED.uSunDir.value.copy(saved.sun);SHARED.uSkyAmbient.value.copy(saved.sky);SHARED.uMacroShadow.value=saved.map;r.toneMappingExposure=saved.exposure;
    for(const [k,value] of Object.entries(rtSaved))RT_SHARED[k].value=value;
    r.setRenderTarget(old);tex.dispose();noise.dispose();shadow.dispose();irradiance.dispose();visibility.dispose();mat.dispose();geometry.dispose();target.dispose();
  }
})();
