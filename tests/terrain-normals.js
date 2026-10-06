// Exercise the production GLSL with an exactly flat float normal texture. This
// catches basis errors independently of the procedural texture generator.
return (async()=>{
  const THREE=await import('three');const {FullScreenQuad}=await import('three/addons/postprocessing/Pass.js');
  const {terrainNormalShader}=await import('/src/world/terrainMaterial.js');
  const r=__sim.renderer,old=r.getRenderTarget(),pixels=new Float32Array(4);
  const tex=new THREE.DataArrayTexture(new Float32Array([.5,.5,.8,1,.5,.5,.8,1]),1,1,2);
  tex.type=THREE.FloatType;tex.needsUpdate=true;
  const target=new THREE.WebGLRenderTarget(1,1,{type:THREE.FloatType,depthBuffer:false});
  const uniforms={uAlbedo:{value:tex},uSurface:{value:tex},uTile:{value:new THREE.Vector4(1,2,1,.6)},uTexSize:{value:1},uSastrugiCS:{value:new THREE.Vector2(.5,.8660254)},base:{value:new THREE.Vector3()},blend:{value:0},layerIndex:{value:0}};
  const failures=[];let cases=0;
  try {
    for(const anti of [0,1])for(const micro of [0,1]){
      const q=new FullScreenQuad(new THREE.ShaderMaterial({uniforms,defines:{TERRAIN_ANTI_TILING:anti,TERRAIN_MICRO:micro,TERRAIN_GRAD:0},vertexShader:'void main(){gl_Position=vec4(position.xy,0,1);}',fragmentShader:terrainNormalShader()+`
        uniform vec3 base;uniform float blend,layerIndex;
        void main(){vec3 w=pow(abs(base),vec3(6));w=max(w/dot(w,vec3(1))-.06,0.0);w/=dot(w,vec3(1));
        vec3 a=vec3(0),n=vec3(0);float rough=0.0,ao=0.0;
        layer(layerIndex,vec3(17,43,-9),base,w,blend,1.0,1.0,vec3(.1,0,0),vec3(0,0,.1),a,n,rough,ao,1.0);
        gl_FragColor=vec4(normalize(n),1);}`,depthTest:false,depthWrite:false}));
      try {
        const normals=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1],[-.8,.6,0],[0,.6,-.8]];
        for(const x of [-1,1])for(const y of [-1,1])for(const z of [-1,1])normals.push([x*.6,y*.7,z*.4]);
        for(const n of normals)for(const blend of [0,.37,1])for(const L of [0,1]){
          uniforms.base.value.fromArray(n).normalize();uniforms.blend.value=blend;uniforms.layerIndex.value=L;
          r.setRenderTarget(target);q.render(r);r.readRenderTargetPixels(target,0,0,1,1,pixels);cases++;
          const error=uniforms.base.value.distanceTo(new THREE.Vector3(...pixels.slice(0,3)));
          if(error>1e-5||!Number.isFinite(error))failures.push({anti,micro,n,blend,L,error,result:Array.from(pixels)});
        }
      }finally{q.material.dispose();q.dispose();}
    }
  }finally{r.setRenderTarget(old);tex.dispose();target.dispose();}
  return {pass:failures.length===0,cases,failures};
})();
