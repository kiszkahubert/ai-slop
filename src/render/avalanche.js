// Dense flow, slab fragments and powder follow the simulated depth and velocity.
import * as THREE from 'three';
import { mulberry32, makeNoise2D } from '../core/noise.js';

export class AvalancheView {
  constructor(scene) { this.scene=scene; this.event=null; this.group=null; this.timer=0; }
  clear() {
    if(this.group) {
      this.scene.remove(this.group);
      this.group.traverse((o)=>{o.geometry?.dispose();o.material?.map?.dispose();o.material?.dispose();});
    }
    this.group=null; this.event=null;
  }
  create(A) {
    this.clear(); this.event=A; this.group=new THREE.Group(); this.scene.add(this.group);
    // Render on the native DEM vertices so thin snow is not hidden inside coarse triangles.
    const cell=A.field.cell||4,n=Math.ceil(A.size*A.cell/cell)+1,pos=new Float32Array(n*n*3),idx=[];
    const x0=A.field.x0+Math.floor((A.x0-A.field.x0)/cell)*cell,z0=A.field.z0+Math.floor((A.z0-A.field.z0)/cell)*cell;
    this.base=new Float32Array(n*n);this.flowIndex=new Int32Array(n*n);this.flowIndex.fill(-1);this.flowWeights=new Float32Array(n*n*4);
    for(let j=0;j<n;j++) for(let i=0;i<n;i++) {
      const k=j*n+i,x=x0+i*cell,z=z0+j*cell;pos[k*3]=x;pos[k*3+2]=z;
      this.base[k]=pos[k*3+1]=A.field.height(x,z);
      const fx=(x-A.x0)/A.cell-.5,fz=(z-A.z0)/A.cell-.5;
      if(fx>=0&&fz>=0&&fx<A.size-1&&fz<A.size-1) {
        const fi=Math.floor(fx),fj=Math.floor(fz),u=fx-fi,v=fz-fj;this.flowIndex[k]=fj*A.size+fi;
        this.flowWeights.set([(1-u)*(1-v),u*(1-v),(1-u)*v,u*v],k*4);
      }
      if(i<n-1&&j<n-1) idx.push(k,k+n,k+1,k+1,k+n,k+n+1);
    }
    const geometry=new THREE.BufferGeometry(); geometry.setAttribute('position',new THREE.BufferAttribute(pos,3)); geometry.setIndex(idx);
    const material=new THREE.MeshStandardMaterial({color:0xe8eff4,roughness:.95,side:THREE.DoubleSide,vertexColors:true,transparent:true,depthWrite:false});
    // Per-vertex alpha hides dry cells instead of drawing a white sheet over the slope.
    geometry.setAttribute('color',new THREE.BufferAttribute(new Float32Array(n*n*4),4));
    this.surface=new THREE.Mesh(geometry,material); this.surface.receiveShadow=true; this.surface.frustumCulled=false; this.group.add(this.surface);
    const canvas=document.createElement('canvas'); canvas.width=canvas.height=128;
    const ctx=canvas.getContext('2d'),pixels=ctx.createImageData(128,128),noise=makeNoise2D(mulberry32(A.seed+33));
    for(let y=0;y<128;y++) for(let x=0;x<128;x++) {
      const u=(x-64)/64,v=(y-64)/64,r=Math.hypot(u,v),coarse=noise(u*3,v*3),fine=noise(u*10,v*10);
      const alpha=Math.max(0,Math.min(1,(1-r+.22*coarse)*2))*(.35+.25*coarse+.12*fine),k=(y*128+x)*4;
      const shade=230+18*coarse;pixels.data.set([shade,shade+4,Math.min(255,shade+9),Math.max(0,alpha)*255],k);
    }
    ctx.putImageData(pixels,0,0);
    const texture=new THREE.CanvasTexture(canvas),rand=mulberry32(A.seed+811);
    this.clouds=Array.from({length:96},()=>({u:rand(),v:rand(),w:rand(),age:rand()*3,life:2+rand()*3,x:0,y:0,z:0,active:false}));
    this.powder=new THREE.InstancedMesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({color:0xf0f6ff,map:texture,transparent:true,depthWrite:false,side:THREE.DoubleSide,opacity:.4}),this.clouds.length);
    this.powder.frustumCulled=false; this.group.add(this.powder);
    this.chunks=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,0),new THREE.MeshStandardMaterial({color:0xdce8f1,roughness:1,flatShading:true}),64);
    this.chunks.frustumCulled=false; this.chunks.castShadow=true; this.group.add(this.chunks);
    this.fragments=Array.from({length:64},()=>({u:rand(),v:rand(),w:rand(),active:false,x:0,y:0,z:0,angle:0}));
    this.wet=[];this.timer=0;
    this.matrix=new THREE.Matrix4();this.quat=new THREE.Quaternion();this.scale=new THREE.Vector3();this.position=new THREE.Vector3();
  }
  update(dt,physics,camera) {
    const A=physics?.avalanche;
    if(!A) { if(this.event) this.clear(); return; }
    const created=A!==this.event;
    if(created) this.create(A);
    this.timer-=dt;
    if(this.timer<=0) {
      this.timer=1/30;
      const positions=this.surface.geometry.attributes.position,colors=this.surface.geometry.attributes.color;
      for(let k=0;k<this.base.length;k++) {
        const i=this.flowIndex[k],w=k*4,depth=i<0?0:A.h[i]*this.flowWeights[w]+A.h[i+1]*this.flowWeights[w+1]+A.h[i+A.size]*this.flowWeights[w+2]+A.h[i+A.size+1]*this.flowWeights[w+3];
        positions.setY(k,this.base[k]+depth+.035);
        const shade=.88+.1*Math.sin(k*1.93),alpha=Math.min(1,depth/.1);
        colors.setXYZW(k,shade,shade+.015,Math.min(1,shade+.025),alpha);
      }
      positions.needsUpdate=colors.needsUpdate=true;this.surface.geometry.computeVertexNormals();
      this.wet=[];
      if(!A.settled) for(let k=0;k<A.h.length;k+=2) if(A.h[k]>.1&&Math.hypot(A.qx[k],A.qz[k])/A.h[k]>2) this.wet.push(k);
    }
    const wet=this.wet;
    this.quat.copy(camera.quaternion);
    for(let i=0;i<this.clouds.length;i++) {
      const c=this.clouds[i]; c.age+=dt;
      if((dt>0||created) && (!c.active||c.age>c.life) && wet.length) {
        const k=wet[Math.floor(c.u*wet.length)%wet.length]; c.x=A.x0+(k%A.size+c.v)*A.cell; c.z=A.z0+(Math.floor(k/A.size)+c.w)*A.cell;
        c.y=A.field.height(c.x,c.z)+A.h[k]+1+c.w*3; c.vx=A.qx[k]/A.h[k]; c.vz=A.qz[k]/A.h[k]; c.age=0;c.active=true;
      }
      if(c.active) { c.x+=(c.vx||0)*dt*.6;c.z+=(c.vz||0)*dt*.6;c.y+=dt*(1.5+c.v*3); }
      const fade=c.active?Math.max(0,1-c.age/c.life):0,size=(8+c.v*12+c.age*7)*Math.sqrt(fade);
      this.position.set(c.x,c.y,c.z);this.scale.set(size*(1+c.w*.6),size*.65,1);this.matrix.compose(this.position,this.quat,this.scale);this.powder.setMatrixAt(i,this.matrix);
    }
    this.powder.instanceMatrix.needsUpdate=true;
    for(let i=0;i<64;i++) {
      const f=this.fragments[i];let s=A.sample(f.x,f.z);
      if((dt>0||created) && (!f.active || s.depth<.06) && wet.length) {
        const k=wet[Math.floor(f.u*wet.length)%wet.length];
        f.x=A.x0+(k%A.size+.5)*A.cell+(f.v-.5)*A.cell;
        f.z=A.z0+(Math.floor(k/A.size)+.5)*A.cell+(f.w-.5)*A.cell;
        f.active=true;s=A.sample(f.x,f.z);
      }
      if(f.active) { f.x+=s.vx*dt;f.z+=s.vz*dt;f.angle+=Math.hypot(s.vx,s.vz)*dt*.5; }
      const size=f.active&&s.depth>.04?Math.min(1.5,.2+s.depth*.45):0;
      this.position.set(f.x,A.field.height(f.x,f.z)+s.depth+size*.3,f.z);
      this.quat.setFromEuler(new THREE.Euler(f.angle,f.u*6,f.w*6));this.scale.set(size*(1+f.v),size*.6,size);this.matrix.compose(this.position,this.quat,this.scale);this.chunks.setMatrixAt(i,this.matrix);
    }
    this.chunks.instanceMatrix.needsUpdate=true;
  }
}
