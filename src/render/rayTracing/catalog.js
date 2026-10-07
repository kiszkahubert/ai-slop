import * as THREE from 'three';
import { patchRayTracingMaterial } from './materials.js';
import { RT_LIMITS } from './settings.js';
import { iceGroundDescriptor } from '../iceGround.js';

export function isDynamic(o) { for(let p=o;p;p=p.parent)if(p.userData.rtDynamic)return true;return false; }
export function isVisible(o) { for(let p=o;p;p=p.parent)if(!p.visible)return false;return true; }
export function eligible(o) {return o.isMesh && !isDynamic(o) && !Array.isArray(o.material) && o.material.isMeshStandardMaterial && !o.material.transparent;}

export class SceneCatalog {
  constructor(scene,world) {this.scene=scene;this.world=world;this.textureLayers=new Map();this.materialTextures=[];this.textureOwners=[];this.array=null;this.arrayCount=-1;this.originals=new Map();this.shared=new Map();}
  patch() {this.scene.traverse(o=>{if(eligible(o)){
    if(!this.originals.has(o.material))this.originals.set(o.material,{callback:o.material.onBeforeCompile,key:o.material.customProgramCacheKey});
    patchRayTracingMaterial(o.material);
  }});}
  restore(){for(const [mat,base] of this.originals){mat.onBeforeCompile=base.callback;mat.customProgramCacheKey=base.key;delete mat.userData.rtPatched;delete mat.userData.rtBaseCallback;mat.dispose();mat.needsUpdate=true;}this.originals.clear();}
  layer(map,owner) {if(!map)return 0;if(this.textureLayers.has(map))return this.textureLayers.get(map)+1;
    const existing=this.textureOwners.findIndex(m=>m?.map===map);if(existing>=0){this.textureLayers.set(map,existing);return existing+1;}
    const i=this.materialTextures.length;if(i>=32)throw new Error('Too many static colour textures');
    this.textureLayers.set(map,i);this.materialTextures.push(map);this.textureOwners.push(owner);return i+1;}
  /** Per geometry/material arrays, built once and shared by every instance (a message copies a shared array once). */
  sharedArrays(geo,mat) {
    let byMat=this.shared.get(geo);if(!byMat)this.shared.set(geo,byMat=new Map());
    let a=byMat.get(mat);if(a)return a;
    const pos=geo.attributes.position,normalColour=geo.attributes.color;let vertexColor=null,uv=null;
    if(mat.vertexColors&&normalColour){vertexColor=new Float32Array(pos.count*3);for(let i=0;i<pos.count;i++){vertexColor[i*3]=normalColour.getX(i);vertexColor[i*3+1]=normalColour.getY(i);vertexColor[i*3+2]=normalColour.getZ(i);}}
    if(geo.attributes.uv){const src=geo.attributes.uv;uv=new Float32Array(src.count*2);mat.map?.updateMatrix();const v=new THREE.Vector2();
      for(let i=0;i<src.count;i++){v.set(src.getX(i),src.getY(i));if(mat.map)v.applyMatrix3(mat.map.matrix);uv[i*2]=v.x;uv[i*2+1]=v.y;}}
    a={position:pos.array,index:geo.index?.array,vertexColor,uv};byMat.set(mat,a);return a;
  }
  descriptor(geo,mat,matrix,tint=new THREE.Color(1,1,1),mesh,instance=0) {
    const color=mat.color.clone().multiply(tint).multiplyScalar(1-(mat.metalness||0)),a=this.sharedArrays(geo,mat);
    const ground=mat.userData.iceBlend&&mesh?iceGroundDescriptor(mesh,matrix,instance):{};
    return {position:a.position,index:a.index,color:[...color.toArray(),this.layer(mat.map,mat)],vertexColor:a.vertexColor,uv:a.uv,matrix:matrix.toArray(),...ground};
  }
  region(origin) {
    const result=[],box=new THREE.Box3(new THREE.Vector3(origin[0]-512,-10000,origin[1]-512),new THREE.Vector3(origin[0]+512,20000,origin[1]+512));
    const matrix=new THREE.Matrix4(),sphere=new THREE.Sphere(),tint=new THREE.Color();this.scene.updateMatrixWorld(true);
    // Pebbles, pegs and other small parts barely change the light but dominate the triangle count.
    const add=(geo,mat,m,t=new THREE.Color(1,1,1),keepSmall=false,mesh,instance)=>{
      if(!geo.boundingSphere)geo.computeBoundingSphere();sphere.copy(geo.boundingSphere).applyMatrix4(m);
      if(!keepSmall&&sphere.radius<RT_LIMITS.minPrimitiveRadius){this.skipped++;return;}
      if(box.intersectsSphere(sphere))result.push(this.descriptor(geo,mat,m,t,mesh,instance));
    };
    this.skipped=0;
    const camp=this.world.campVisuals,cv=this.world.crevasseVisuals;
    this.scene.traverse(o=>{
      if(!eligible(o)||o.material.userData.rtTerrain||o.parent===camp.root||o.parent===cv.root)return;
      if(!o.geometry.attributes.position)return;
      if(o.isInstancedMesh){for(let i=0;i<o.count;i++){o.getMatrixAt(i,matrix);matrix.premultiply(o.matrixWorld);tint.setRGB(1,1,1);if(o.instanceColor)o.getColorAt(i,tint);add(o.geometry,o.material,matrix,tint,false,o,i);}}
      else add(o.geometry,o.material,o.matrixWorld);
    });
    // Camp parts are independent of the display LOD and current instance counts: the detailed model near the
    // region's centre (where per-pixel rays start), the simple one for the distant occluders beyond.
    for(const r of camp.records){if(Math.abs(r.x-origin[0])>540||Math.abs(r.z-origin[1])>540)continue;
      const level=Math.hypot(r.x-origin[0],r.z-origin[1])<RT_LIMITS.detailRadius?1:0;
      for(const part of camp.models[r.kind][level].parts){const mat=camp.materials[part.surface];
        const mode=['dark','metal','whiteStone','solar','glass','label'].includes(part.surface)?'fixed':part.surface==='accent'||part.surface==='door'?'accent':'main';
        add(part.geometry,mat,r.matrix,mode==='fixed'?new THREE.Color(1,1,1):r[mode==='accent'?'accent':'color']);}
      this.skipped+=r.guys.length;                                 // guy lines and pegs: too thin to shade anything
    }
    for(const r of this.world.crevasseField.records){if(!box.intersectsBox(new THREE.Box3(new THREE.Vector3(r.box.x0,-10000,r.box.z0),new THREE.Vector3(r.box.x1,20000,r.box.z1))))continue;
      const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(r.geometry.flat(),3));
      const uv=[];
      for(let i=0;i<r.geometry.length;i+=3){
        const a=new THREE.Vector3(...r.geometry[i]),n=new THREE.Vector3(...r.geometry[i+1]).sub(a).cross(new THREE.Vector3(...r.geometry[i+2]).sub(a));
        const axis=Math.abs(n.y)>Math.max(Math.abs(n.x),Math.abs(n.z))?1:Math.abs(n.x)>Math.abs(n.z)?0:2;
        const u=axis===0?2:0,v=axis===1?2:1,offset=[Math.floor(r.geometry[i][u]/4),Math.floor(r.geometry[i][v]/4)];
        for(const p of r.geometry.slice(i,i+3))uv.push(p[u]/4-offset[0],p[v]/4-offset[1]);
      }
      g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
      add(g,cv.material,new THREE.Matrix4(),undefined,true);g.dispose();
    }
    return result;
  }
  makeTextureArray() {
    if(this.array&&this.arrayCount===this.materialTextures.length)return this.array;   // unchanged since last time
    this.array?.dispose();this.arrayCount=this.materialTextures.length;const size=256,count=Math.max(1,this.materialTextures.length),data=new Uint8Array(size*size*count*4);data.fill(255);
    const canvas=document.createElement('canvas');canvas.width=canvas.height=size;const ctx=canvas.getContext('2d',{willReadFrequently:true});
    this.materialTextures.forEach((t,i)=>{
      t=this.textureOwners[i]?.map||t;
      const img=t.image;ctx.clearRect(0,0,size,size);
      if(img.data){const src=document.createElement('canvas');src.width=img.width;src.height=img.height;
        const c=src.getContext('2d');c.putImageData(new ImageData(new Uint8ClampedArray(img.data),img.width,img.height),0,0);ctx.drawImage(src,0,0,size,size);
      }else ctx.drawImage(img,0,0,size,size);
      const pixels=ctx.getImageData(0,0,size,size).data;
      for(let y=0;y<size;y++)data.set(pixels.subarray(y*size*4,(y+1)*size*4),(i*size*size+(t.flipY?size-1-y:y)*size)*4);
    });
    const t=new THREE.DataArrayTexture(data,size,size,count);t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;
    t.minFilter=THREE.LinearFilter;t.magFilter=THREE.LinearFilter;t.needsUpdate=true;this.array=t;return t;
  }
  invalidateTextures() {
    this.arrayCount = -1; this.textureLayers.clear();
    this.materialTextures = this.materialTextures.map((t, i) => this.textureOwners[i]?.map || t);
    this.materialTextures.forEach((t, i) => this.textureLayers.set(t, i));
  }
  dispose(){this.restore();this.array?.dispose();this.array=null;this.arrayCount=-1;this.shared.clear();this.textureLayers.clear();this.materialTextures=[];this.textureOwners=[];}
}
