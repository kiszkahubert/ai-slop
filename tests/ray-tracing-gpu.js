// GPU traversal is compared with exact CPU native-triangle intersections, including
// rays that leave the core and hit an off-screen backdrop ridge.
return (async()=>{
const THREE=await import('three');
const {FullScreenQuad}=await import('three/addons/postprocessing/Pass.js');
const {HEIGHT_TRACE}=await import('/src/render/rayTracing/heightShader.js');
const {buildHeightHierarchy,referenceHeightHit}=await import('/src/render/rayTracing/heightHierarchy.js');
const r=__sim.renderer,old=r.getRenderTarget(),fields=[
  {nx:17,nz:13,x0:-32,z0:-24,cell:4,h:Float32Array.from({length:221},(_,i)=>Math.sin(i%17*.6)*3+Math.cos(Math.floor(i/17)*.7)*2)},
  {nx:17,nz:17,x0:-128,z0:-128,cell:16,h:Float32Array.from({length:289},(_,i)=>i%17===12?30:0)},
];
const uniforms={},textures=[];
fields.forEach((f,i)=>{
  const h=buildHeightHierarchy(f);
  const make=(a,w,h,format)=>{const t=new THREE.DataTexture(a,w,h,format,THREE.FloatType);t.needsUpdate=true;textures.push(t);return t;};
  uniforms['uHeight'+i]={value:make(f.h,f.nx,f.nz,THREE.RedFormat)};uniforms['uBounds'+i]={value:make(h.atlas,h.width,h.height,THREE.RGFormat)};
  uniforms['uGrid'+i]={value:new THREE.Vector4(f.x0,f.z0,f.cell,0)};uniforms['uGridSize'+i]={value:new THREE.Vector2(f.nx,f.nz)};
  uniforms['uLevels'+i]={value:new Int32Array(Array.from({length:12},(_,k)=>h.offsets[k]||[1,1,0,0]).flat())};uniforms['uLevelCount'+i]={value:h.offsets.length};
});
uniforms.ro={value:new THREE.Vector3()};uniforms.rd={value:new THREE.Vector3()};
const q=new FullScreenQuad(new THREE.ShaderMaterial({uniforms,vertexShader:'void main(){gl_Position=vec4(position.xy,0,1);}',fragmentShader:HEIGHT_TRACE+'\nuniform vec3 ro,rd;void main(){int f;float t=traceLandscape(ro,rd,0.01,100000.0,f);gl_FragColor=vec4(t,float(f),0,1);}',depthTest:false,depthWrite:false}));
const target=new THREE.WebGLRenderTarget(1,1,{type:THREE.FloatType,depthBuffer:false}),pixels=new Float32Array(4),results=[];
try {
  for(let k=0;k<26;k++){
    const origin=k>=24?[k===24?0:-100,20000,k===24?0:-100]:k<20?[-29+(k*13)%58,40,-21+(k*7)%42]:[0,15,-20];
    const dir=k>=24?new THREE.Vector3(0,1,0):k<20?new THREE.Vector3((k%3-1)*.25,-1,(k%5-2)*.15).normalize():new THREE.Vector3(1,.05,k*.002).normalize();
    let a=referenceHeightHit(fields[0],origin,dir.toArray(),.01,1000),b=null;
    // Clip backdrop triangles to outside the core before determining the reference hit.
    const f=fields[1],point=(i,j)=>[f.x0+i*f.cell,f.h[j*f.nx+i],f.z0+j*f.cell];
    const {triangleHit}=await import('/src/render/rayTracing/heightHierarchy.js');
    for(let j=0;j<f.nz-1;j++)for(let i=0;i<f.nx-1;i++)for(const tri of [[point(i,j),point(i,j+1),point(i+1,j)],[point(i+1,j),point(i,j+1),point(i+1,j+1)]]){
      const t=triangleHit(origin,dir.toArray(),...tri,.01,b??1000);
      if(t!==null){const p=origin.map((v,i)=>v+dir.toArray()[i]*t);if(p[0]<-32||p[0]>32||p[2]<-24||p[2]>24)b=t;}
    }
    const expected=a===null?b:b===null?a:Math.min(a,b);
    uniforms.ro.value.fromArray(origin);uniforms.rd.value.copy(dir);r.setRenderTarget(target);q.render(r);r.readRenderTargetPixels(target,0,0,1,1,pixels);
    results.push({expected,actual:pixels[0],pass:expected===null?pixels[0]===-1:Math.abs(expected-pixels[0])<.02});
  }
}finally{r.setRenderTarget(old);target.dispose();q.material.dispose();q.dispose();textures.forEach(t=>t.dispose());}
return {pass:results.every(x=>x.pass),rays:results.length,failures:results.filter(x=>!x.pass),offscreenBackdrop:results.slice(-4)};
})();
