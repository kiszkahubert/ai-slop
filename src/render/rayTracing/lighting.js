import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { MeshBVH, MeshBVHUniformStruct, FloatVertexAttributeTexture } from '../../../assets/render/rt-runtime.js';
import { SHARED } from '../shared.js';
import { emit, on } from '../../core/events.js';
import { SceneCatalog, isDynamic, isVisible } from './catalog.js';
import { RT_SHARED, BLACK, captureMaterial } from './materials.js';
import { RT_LIMITS, initialRayTracing, rememberRayTracing, regionOrigin, lightingSize } from './settings.js';
import { VERT, CACHE_FRAG, LOCAL_FRAG, TEMPORAL_FRAG, FILTER_FRAG } from './shaders.js';
import { GpuTimer } from './timer.js';

const uniform=value=>({value});
export function halfTexture(t){const source=t.image.data;t.image.data=Uint16Array.from(source,x=>THREE.DataUtils.toHalfFloat(x));t.type=THREE.HalfFloatType;
  t.internalFormat=t.format===THREE.RGBAFormat?'RGBA16F':t.format===THREE.RGFormat?'RG16F':'R16F';t.needsUpdate=true;}
function dataTexture(data,w,h,format=THREE.RedFormat,type=THREE.FloatType) {
  const t=new THREE.DataTexture(data,w,h,format,type);t.needsUpdate=true;return t;
}
function target(w,h,capture=false) {
  if(capture){
    const t=new THREE.WebGLMultipleRenderTargets(w,h,2,{type:THREE.FloatType,minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter,depthBuffer:true});
    t.texture[1].type=THREE.HalfFloatType;return t;
  }
  return new THREE.WebGLRenderTarget(w,h,{type:THREE.HalfFloatType,depthBuffer:false,minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter});
}
function quad(fragmentShader,uniforms) {
  return new FullScreenQuad(new THREE.ShaderMaterial({vertexShader:VERT,fragmentShader,uniforms,depthWrite:false,depthTest:false}));
}
const COPY=`varying vec2 vUv;uniform sampler2D tA,tB;layout(location=1) out vec4 outB;
void main(){gl_FragColor=texture2D(tA,vUv);outB=texture2D(tB,vUv);}`;
const fieldData=f=>({h:f.h,nx:f.nx,nz:f.nz,x0:f.x0,z0:f.z0,cell:f.cell});
const rect=f=>new THREE.Vector4(f.x0,f.z0,1/((f.nx-1)*f.cell),1/((f.nz-1)*f.cell));

/** Optional lighting service. Simulation data and display LOD geometry are read-only inputs. */
export class RayTracingLighting {
  constructor(renderer,scene,camera,{field,back,world,terrainMaterial,sun,quality}) {
    Object.assign(this,{renderer,scene,camera,field,back,world,terrainMaterial,sun,quality});
    this.requested=initialRayTracing();this.failed=null;this.worker=null;this.ready=false;
    this.catalog=new SceneCatalog(scene,world);this.proxies=new Map();this.captureScene=new THREE.Scene();this.dynamicScene=new THREE.Scene();
    this.captureCamera=camera.clone();
    this.frame=0;this.job=0;this.pending=null;this.snapshot=null;this.caches=[];this.textures=[];this.screenTargets=[];
    this.origin=new THREE.Vector3();this.previousOrigin=new THREE.Vector3();this.previousVP=new THREE.Matrix4();this.historyValid=false;
    this.scale=.5;this.memoryScaleLimit=.5;this.tileCount=1;this.localUpdateStride=1;this.stats={requested:this.requested,active:false,status:'Off',gpuMs:null,memoryBytes:0,triangles:0,snapshots:0,cacheTiles:0,localUpdateStride:1};
    this.lastSun=new THREE.Vector3();this.lastSky=new THREE.Color();this.lastTime=null;
    this.timer=new GpuTimer(renderer.getContext());
    this.copy=quad(COPY,{tA:uniform(BLACK),tB:uniform(BLACK)});
    this.depthMaterial=new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking,side:THREE.DoubleSide});
    this.dynamicScene.overrideMaterial=this.depthMaterial;
    this.dynamicTarget=new THREE.WebGLRenderTarget(1024,1024,{depthBuffer:true,minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter});
    this.unsubscribe=on('teleported',()=>{this.historyValid=false;});
    this.notify();
  }
  notify() {
    this.stats.requested=this.requested;
    this.stats.active=this.requested&&this.quality!=='low'&&this.ready&&!this.failed;
    this.stats.status=!this.requested?'Off':this.failed?'Unavailable: '+this.failed:this.quality==='low'?'Paused on Low':this.ready?'On — lighting converges while you explore':'Preparing lighting…';
    emit('rayTracingStatus',{...this.stats});
  }
  setEnabled(value) {
    this.requested=!!value;rememberRayTracing(this.requested);this.historyValid=false;
    RT_SHARED.uRtEnabled.value=0;RT_SHARED.uRtLocalReady.value=0;this.notify();return this.requested;
  }
  configure(name) {this.quality=name;this.historyValid=false;this.rebuildProxies=true;this.resetCaches();
    if(this.snapshot)this.localQuad.material.uniforms.uPropAlbedo.value=this.catalog.makeTextureArray();this.notify();}
  fail(message) {
    this.failed=message;RT_SHARED.uRtEnabled.value=0;RT_SHARED.uRtLocalReady.value=0;
    this.releaseResources();this.notify();
  }
  start() {
    const r=this.renderer,gl=r.getContext();
    if(!r.capabilities.isWebGL2||!gl.getExtension('EXT_color_buffer_float'))throw new Error('WebGL2 floating point render targets are required');
    if(gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS)<16||gl.getParameter(gl.MAX_DRAW_BUFFERS)<2||r.capabilities.maxTextureSize<this.field.nx)throw new Error('GPU texture limits are too small');
    this.catalog.patch();
    this.worker=new Worker(new URL('../../../assets/render/rt-worker.js',import.meta.url),{type:'module'});
    this.worker.onerror=()=>this.fail('Lighting worker could not start');
    this.worker.onmessage=({data})=>{
      try {
        if(data.type==='error')throw new Error(data.message);
        if(data.type==='hierarchies')this.installFields(data.hierarchies);
        if(data.type==='region'){
          this.pending=null;
          const desired=regionOrigin(this.camera.position);
          if(data.id===this.job&&data.result.origin.every((v,i)=>v===desired[i]))this.installSnapshot(data.result);
        }
      }catch(e){this.fail(e.message);}
    };
    this.worker.postMessage({type:'init',fields:[fieldData(this.field),fieldData(this.back)]});
  }
  installFields(hierarchies) {
    this.fieldUniforms={};
    [this.field,this.back].forEach((f,i)=>{
      const h=hierarchies[i],height=dataTexture(f.h,f.nx,f.nz),bounds=dataTexture(h.atlas,h.width,h.height,THREE.RGFormat);
      this.textures.push(height,bounds);
      this.fieldUniforms['uHeight'+i]=uniform(height);this.fieldUniforms['uBounds'+i]=uniform(bounds);
      this.fieldUniforms['uGrid'+i]=uniform(new THREE.Vector4(f.x0,f.z0,f.cell,0));
      this.fieldUniforms['uGridSize'+i]=uniform(new THREE.Vector2(f.nx,f.nz));
      this.fieldUniforms['uLevels'+i]=uniform(new Int32Array(Array.from({length:12},(_,k)=>h.offsets[k]||[1,1,0,0]).flat()));
      this.fieldUniforms['uLevelCount'+i]=uniform(h.offsets.length);
    });
    const f=this.field,masks=new Uint8Array(f.nx*f.nz*2);
    for(let i=0;i<f.nx*f.nz;i++){masks[i*2]=f.glacier[i];masks[i*2+1]=f.rock[i];}
    this.masks=dataTexture(masks,f.nx,f.nz,THREE.RGFormat,THREE.UnsignedByteType);this.textures.push(this.masks);
    const common={...this.terrainMaterial.userData.uniforms,...SHARED,uMasks:uniform(this.masks),uMaskRect:uniform(rect(f))};
    this.cacheQuad=quad(CACHE_FRAG,{...common,...this.fieldUniforms,uCacheRect:uniform(rect(f)),uField:uniform(0),uFrame:uniform(0),uReset:uniform(0),uSunOnly:uniform(0),uPreviousIrr:uniform(BLACK),uPreviousSun:uniform(BLACK)});
    this.localQuad=quad(LOCAL_FRAG,{...common,uPosition:uniform(BLACK),uNormal:uniform(BLACK),uColors:uniform(BLACK),uUvs:uniform(BLACK),uCacheIrr:uniform(BLACK),uCacheSun:uniform(BLACK),uPropAlbedo:uniform(null),uBvh:uniform(null),uOrigin:uniform(this.origin),uCamera:uniform(this.camera.position),uCacheRect:uniform(rect(f)),uFrame:uniform(0)});
    for(const q of [this.cacheQuad,this.localQuad])q.material.defines={TERRAIN_ANTI_TILING:1,TERRAIN_MICRO:0,TERRAIN_GRAD:1};
    this.temporal=quad(TEMPORAL_FRAG,{tCurrent:uniform(BLACK),tHistory:uniform(BLACK),tPosition:uniform(BLACK),tPreviousPosition:uniform(BLACK),tNormal:uniform(BLACK),tPreviousNormal:uniform(BLACK),uPreviousVP:uniform(this.previousVP),uOrigin:uniform(this.origin),uPreviousOrigin:uniform(this.previousOrigin),uTexel:uniform(new THREE.Vector2()),uHistory:uniform(0),uReuse:uniform(0)});
    this.filter=quad(FILTER_FRAG,{tInput:uniform(BLACK),tPosition:uniform(BLACK),tNormal:uniform(BLACK),uTexel:uniform(new THREE.Vector2()),uStep:uniform(1)});
    // Irradiance and visibility have independent physical sampling densities.
    for(const [i,spacing,sunOnly] of [[0,64,0],[0,32,1],[1,512,0],[1,320,1]]){
      const f=[this.field,this.back][i],w=Math.ceil((f.nx-1)*f.cell/spacing),h=Math.ceil((f.nz-1)*f.cell/spacing);
      const make=()=>new THREE.WebGLMultipleRenderTargets(w,h,2,{type:THREE.HalfFloatType,depthBuffer:false,minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter});
      const c={field:i,sunOnly,rect:rect(f),w,h,pair:[make(),make()],read:0,tiles:[],cursor:0,generation:1,versions:[]};
      for(let y=0;y<h;y+=16)for(let x=0;x<w;x+=32)c.tiles.push({x,y,w:Math.min(32,w-x),h:Math.min(16,h-y)});
      this.caches.push(c);
    }
    RT_SHARED.uRtCoreRect.value.copy(rect(this.field));RT_SHARED.uRtBackRect.value.copy(rect(this.back));
    this.ready=true;this.resetCaches();this.notify();this.checkMemory();
  }
  resetCaches() {for(const c of this.caches){c.generation++;c.cursor=0;c.versions=[];}this.historyValid=false;}
  requestSnapshot() {
    if(this.pending||!this.ready)return;
    const origin=regionOrigin(this.camera.position);
    if(this.snapshot?.origin.every((v,i)=>v===origin[i]))return;
    this.pending=origin;this.job++;
    const meshes=this.catalog.region(origin);
    // Functions used by crevasse rendering are deliberately not sent to the worker.
    const apertures=this.world.crevasseField.records.map(r=>({box:r.box,strips:r.strips}));
    this.worker.postMessage({type:'region',id:this.job,origin,meshes,apertures});
  }
  installSnapshot(s) {
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(s.position,3));
    g.setAttribute('color',new THREE.BufferAttribute(s.color,4));g.setAttribute('uv',new THREE.BufferAttribute(s.uv,2));
    const bvh=MeshBVH.deserialize(s.serialized,g,{setIndex:true}),gpu=new MeshBVHUniformStruct();gpu.updateFrom(bvh);
    const colors=new FloatVertexAttributeTexture(),uvs=new FloatVertexAttributeTexture();colors.updateFrom(g.attributes.color);uvs.updateFrom(g.attributes.uv);
    halfTexture(colors);halfTexture(uvs);
    const next={...s,geometry:g,gpu,colors,uvs};const old=this.snapshot;this.snapshot=next;
    this.memoryScaleLimit=.5;
    this.origin.set(s.origin[0],0,s.origin[1]);RT_SHARED.uRtOrigin.value.copy(this.origin);this.historyValid=false;
    const u=this.localQuad.material.uniforms;u.uBvh.value=gpu;u.uColors.value=colors;u.uUvs.value=uvs;
    u.uPropAlbedo.value=this.catalog.makeTextureArray();
    this.disposeSnapshot(old);this.stats.triangles=s.triangles;this.stats.snapshots++;this.checkMemory();
  }
  disposeSnapshot(s) {if(s){s.geometry.dispose();s.gpu.dispose();s.colors.dispose();s.uvs.dispose();}}
  resize(w,h) {
    const [lw,lh]=lightingSize(w,h,this.scale);
    RT_SHARED.uRtResolution.value.set(w,h);
    if(this.w===lw&&this.h===lh)return;
    for(const t of this.screenTargets)t.dispose();this.screenTargets=[];this.w=lw;this.h=lh;
    this.positions=[target(lw,lh,true),target(lw,lh,true)];this.raw=target(lw,lh);
    this.history=[target(lw,lh),target(lw,lh)];this.filters=[target(lw,lh),target(lw,lh)];this.captureIndex=0;this.historyIndex=0;
    this.screenTargets.push(...this.positions,this.raw,...this.history,...this.filters);this.historyValid=false;this.checkMemory();
    const r=this.renderer,gl=r.getContext(),saved=r.getRenderTarget();
    try{for(const t of this.screenTargets){r.setRenderTarget(t);if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw new Error('Floating point lighting framebuffer is unsupported');}}
    finally{r.setRenderTarget(saved);}
  }
  checkMemory() {
    // Dynamic depth target plus an 8 MiB allowance for programs, quad buffers and driver padding.
    let bytes=1024*1024*16;
    for(const t of this.textures)bytes+=t.image.data.byteLength;
    for(const c of this.caches)bytes+=c.w*c.h*8*4;
    if(this.w)bytes+=this.w*this.h*(28*2+8*5);
    const s=this.snapshot;
    if(s){for(const t of [s.gpu.position,s.gpu.index,s.gpu.bvhBounds,s.gpu.bvhContents,s.colors,s.uvs])bytes+=t.image.data.byteLength;}
    if(this.catalog.array)bytes+=this.catalog.array.image.data.byteLength;
    this.stats.memoryBytes=bytes;
    if(bytes>RT_LIMITS.memory){
      if(this.w>160&&this.h>90){
        const s=this.renderer.getDrawingBufferSize(new THREE.Vector2());
        this.scale=Math.min(this.scale/2,this.w/s.x/2,this.h/s.y/2);this.memoryScaleLimit=this.scale;
        this.resize(s.x,s.y);return;
      }
      throw new Error('Lighting uses '+Math.ceil(bytes/1048576)+' MiB, exceeding the 256 MiB GPU budget');
    }
  }
  updateProxies() {
    if(this.rebuildProxies){for(const p of this.proxies.values())p.capture.material.dispose();this.proxies.clear();this.captureScene.clear();this.dynamicScene.clear();this.rebuildProxies=false;}
    const seen=new Set(),sphere=new THREE.Sphere();this.scene.updateMatrixWorld(true);
    this.scene.traverse(o=>{
      if(!o.isMesh||!isVisible(o)||Array.isArray(o.material)||!o.material.isMeshStandardMaterial||o.material.transparent)return;
      if(o.isInstancedMesh&&!o.boundingSphere)o.computeBoundingSphere();
      if(!o.geometry.boundingSphere)o.geometry.computeBoundingSphere();sphere.copy(o.isInstancedMesh?o.boundingSphere:o.geometry.boundingSphere).applyMatrix4(o.matrixWorld);
      if(sphere.distanceToPoint(this.camera.position)>160)return;
      seen.add(o);let p=this.proxies.get(o);const dynamic=isDynamic(o);
      if(!p){
        const make=mat=>o.isInstancedMesh?new THREE.InstancedMesh(o.geometry,mat,o.instanceMatrix.count):new THREE.Mesh(o.geometry,mat);
        p={capture:make(captureMaterial(o.material,!dynamic,this.origin)),shadow:dynamic&&o.castShadow?make(this.depthMaterial):null};
        this.captureScene.add(p.capture);if(p.shadow)this.dynamicScene.add(p.shadow);this.proxies.set(o,p);
      }
      for(const proxy of [p.capture,p.shadow])if(proxy){
        proxy.matrixAutoUpdate=false;proxy.matrix.copy(o.matrixWorld);proxy.frustumCulled=o.frustumCulled;
        if(o.isInstancedMesh){proxy.instanceMatrix=o.instanceMatrix;proxy.instanceColor=o.instanceColor;proxy.count=o.count;proxy.boundingSphere=o.boundingSphere;}
      }
    });
    for(const [source,p] of this.proxies)if(!seen.has(source)){this.captureScene.remove(p.capture);if(p.shadow)this.dynamicScene.remove(p.shadow);p.capture.material.dispose();this.proxies.delete(source);}
  }
  draw(q,t) {this.renderer.setRenderTarget(t);q.render(this.renderer);}
  cacheStep() {
    // Alternate core and backdrop so distant mountains continue to converge during close views.
    const c=this.caches[this.frame%4],u=this.cacheQuad.material.uniforms;
    if(c.cursor===0){
      const p=this.camera.position,f=[this.field,this.back][c.field];
      c.tiles.sort((a,b)=>{
        const distance=t=>Math.hypot(f.x0+(t.x+16)/c.w/c.rect.z-p.x,f.z0+(t.y+8)/c.h/c.rect.w-p.z);
        return distance(a)-distance(b);
      });
    }
    const index=c.cursor%c.tiles.length,tile=c.tiles[index],a=c.pair[c.read],b=c.pair[1-c.read];
    this.copy.material.uniforms.tA.value=a.texture[0];this.copy.material.uniforms.tB.value=a.texture[1];this.draw(this.copy,b);
    u.uPreviousIrr.value=a.texture[0];u.uPreviousSun.value=a.texture[1];u.uCacheRect.value=c.rect;
    u.uField.value=c.field;u.uFrame.value=this.frame;u.uSunOnly.value=c.sunOnly;u.uReset.value=c.versions[index]===c.generation?1:0;
    // setRenderTarget restores the target's scissor state, so bind before applying the tile.
    b.scissor.set(tile.x,tile.y,tile.w,tile.h);b.scissorTest=true;this.renderer.setRenderTarget(b);this.cacheQuad.render(this.renderer);b.scissorTest=false;this.renderer.setScissorTest(false);
    c.versions[index]=c.generation;c.cursor++;c.read=1-c.read;this.stats.cacheTiles++;
    RT_SHARED.uRtCoreIrr.value=this.caches[0].pair[this.caches[0].read].texture[0];
    RT_SHARED.uRtCoreSun.value=this.caches[1].pair[this.caches[1].read].texture[1];
    RT_SHARED.uRtBackIrr.value=this.caches[2].pair[this.caches[2].read].texture[0];
    RT_SHARED.uRtBackSun.value=this.caches[3].pair[this.caches[3].read].texture[1];
  }
  renderLocal() {
    this.updateProxies();const r=this.renderer,index=this.captureIndex,position=this.positions[index],previous=this.positions[1-index];
    this.captureCamera.copy(this.camera,false);this.captureCamera.far=160;this.captureCamera.updateProjectionMatrix();
    r.setClearColor(0,0);r.setRenderTarget(position);r.clear();r.render(this.captureScene,this.captureCamera);
    this.sun.shadow.updateMatrices(this.sun);
    r.setClearColor(0xffffff,1);r.setRenderTarget(this.dynamicTarget);r.clear();r.render(this.dynamicScene,this.sun.shadow.camera);
    RT_SHARED.uRtDynamicShadow.value=this.dynamicTarget.texture;RT_SHARED.uRtDynamicMatrix.value.copy(this.sun.shadow.matrix);
    const u=this.localQuad.material.uniforms;u.uPosition.value=position.texture[0];u.uNormal.value=position.texture[1];u.uFrame.value=this.frame;
    u.uCacheIrr.value=RT_SHARED.uRtCoreIrr.value;u.uCacheSun.value=RT_SHARED.uRtCoreSun.value;
    const trace=!this.historyValid||this.frame%this.localUpdateStride===0;
    if(trace)this.draw(this.localQuad,this.raw);
    const t=this.temporal.material.uniforms,history=this.history[this.historyIndex];
    t.tCurrent.value=this.raw.texture;t.tHistory.value=this.history[1-this.historyIndex].texture;
    t.tPosition.value=position.texture[0];t.tNormal.value=position.texture[1];t.tPreviousPosition.value=previous.texture[0];t.tPreviousNormal.value=previous.texture[1];
    t.uTexel.value.set(1/this.w,1/this.h);t.uHistory.value=this.historyValid?1:0;t.uReuse.value=trace?0:1;this.draw(this.temporal,history);
    const f=this.filter.material.uniforms;f.tInput.value=history.texture;f.tPosition.value=position.texture[0];f.tNormal.value=position.texture[1];f.uTexel.value.set(1/this.w,1/this.h);
    for(let k=0;k<3;k++){f.uStep.value=1<<k;this.draw(this.filter,this.filters[k%2]);f.tInput.value=this.filters[k%2].texture;}
    RT_SHARED.uRtLocal.value=this.filters[0].texture;RT_SHARED.uRtPosition.value=position.texture[0];RT_SHARED.uRtNormal.value=position.texture[1];RT_SHARED.uRtLocalReady.value=1;
    this.previousVP.multiplyMatrices(this.camera.projectionMatrix,this.camera.matrixWorldInverse);this.previousOrigin.copy(this.origin);
    this.historyValid=true;this.captureIndex=1-index;this.historyIndex=1-this.historyIndex;
  }
  prepare(time) {
    RT_SHARED.uRtEnabled.value=0;RT_SHARED.uRtLocalReady.value=0;
    if(this.pendingFailure){const failure=this.pendingFailure;this.pendingFailure=null;this.fail(failure);}
    if(!this.requested||this.quality==='low'||this.failed)return;
    const r=this.renderer,oldTarget=r.getRenderTarget(),oldColor=r.getClearColor(new THREE.Color()),oldAlpha=r.getClearAlpha(),auto=r.autoClear,shadows=r.shadowMap.autoUpdate;
    const viewport=r.getViewport(new THREE.Vector4()),scissor=r.getScissor(new THREE.Vector4()),scissorTest=r.getScissorTest();
    try {
      if(!this.worker)this.start();if(!this.ready)return;
      this.camera.updateMatrixWorld(true);
      const size=r.getDrawingBufferSize(new THREE.Vector2());this.resize(size.x,size.y);this.requestSnapshot();
      const sky=SHARED.uSkyAmbient.value;
      if(this.lastTime===null||Math.abs(time-this.lastTime)>.25||this.lastSun.distanceTo(SHARED.uSunDir.value)>.015||Math.max(Math.abs(this.lastSky.r-sky.r),Math.abs(this.lastSky.g-sky.g),Math.abs(this.lastSky.b-sky.b))>.2){
        this.resetCaches();this.lastSun.copy(SHARED.uSunDir.value);this.lastSky.copy(SHARED.uSkyAmbient.value);
      }
      this.lastTime=time;this.frame++;this.timer.poll();this.stats.gpuMs=this.timer.ms;
      if(this.frame%120===0&&this.timer.ms!==null){
        const next=Math.min(this.memoryScaleLimit,this.timer.ms>RT_LIMITS.gpuBudget?.25:this.timer.ms<3?.5:this.scale);
        if(next!==this.scale){this.scale=next;this.resize(size.x,size.y);}
        this.tileCount=this.timer.ms>RT_LIMITS.gpuBudget?1:2;
        if(this.scale<=.25&&this.timer.ms>RT_LIMITS.gpuBudget)this.localUpdateStride=2;
        else if(this.timer.ms<3)this.localUpdateStride=1;
        this.stats.localUpdateStride=this.localUpdateStride;
      }
      r.autoClear=false;r.shadowMap.autoUpdate=false;r.setScissorTest(false);
      this.timer.begin();for(let k=0;k<this.tileCount;k++)this.cacheStep();
      RT_SHARED.uRtCamera.value.copy(this.camera.position);
      if(this.snapshot&&Math.abs(this.camera.position.x-this.origin.x)<350&&Math.abs(this.camera.position.z-this.origin.z)<350)this.renderLocal();
      this.timer.end();RT_SHARED.uRtEnabled.value=1;
    }catch(e){this.timer.end();this.fail(e.message);}
    finally {
      r.autoClear=auto;r.shadowMap.autoUpdate=shadows;r.setRenderTarget(oldTarget);r.setViewport(viewport);r.setScissor(scissor);r.setScissorTest(scissorTest);r.setClearColor(oldColor,oldAlpha);
      if(this.pendingFailure){const failure=this.pendingFailure;this.pendingFailure=null;this.fail(failure);}
    }
  }
  releaseResources() {
    this.worker?.terminate();this.worker=null;this.pending=null;this.ready=false;
    for(const t of [...this.textures,...this.screenTargets])t.dispose();this.textures=[];this.screenTargets=[];
    for(const c of this.caches)for(const t of c.pair)t.dispose();this.caches=[];
    for(const q of [this.cacheQuad,this.localQuad,this.temporal,this.filter])if(q){q.material.dispose();q.dispose();}
    this.cacheQuad=this.localQuad=this.temporal=this.filter=null;this.fieldUniforms=null;this.masks=null;
    this.disposeSnapshot(this.snapshot);this.snapshot=null;
    for(const p of this.proxies.values())p.capture.material.dispose();this.proxies.clear();this.captureScene.clear();this.dynamicScene.clear();this.catalog.dispose();
    for(const key of ['uRtCoreIrr','uRtCoreSun','uRtBackIrr','uRtBackSun','uRtLocal','uRtPosition','uRtNormal'])RT_SHARED[key].value=BLACK;
    this.positions=this.history=this.filters=null;this.raw=null;this.w=this.h=0;this.stats.memoryBytes=16*1048576;
  }
  dispose() {this.requested=false;RT_SHARED.uRtEnabled.value=0;this.releaseResources();this.timer.dispose();this.dynamicTarget.dispose();this.depthMaterial.dispose();this.copy.material.dispose();this.copy.dispose();this.unsubscribe?.();}
}
