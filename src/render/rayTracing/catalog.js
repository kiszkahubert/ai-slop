import * as THREE from 'three';
import { patchRayTracingMaterial } from './materials.js';

export function isDynamic(o) { for(let p=o;p;p=p.parent)if(p.userData.rtDynamic)return true;return false; }
export function isVisible(o) { for(let p=o;p;p=p.parent)if(!p.visible)return false;return true; }
export function eligible(o) {return o.isMesh && !isDynamic(o) && !Array.isArray(o.material) && o.material.isMeshStandardMaterial && !o.material.transparent;}

export class SceneCatalog {
  constructor(scene,world) {this.scene=scene;this.world=world;this.textureLayers=new Map();this.materialTextures=[];this.textureOwners=[];this.array=null;this.originals=new Map();}
  patch() {this.scene.traverse(o=>{if(eligible(o)){
    if(!this.originals.has(o.material))this.originals.set(o.material,{callback:o.material.onBeforeCompile,key:o.material.customProgramCacheKey});
    patchRayTracingMaterial(o.material);
  }});}
  restore(){for(const [mat,base] of this.originals){mat.onBeforeCompile=base.callback;mat.customProgramCacheKey=base.key;delete mat.userData.rtPatched;delete mat.userData.rtBaseCallback;mat.dispose();mat.needsUpdate=true;}this.originals.clear();}
  layer(map,owner) {if(!map)return 0;if(this.textureLayers.has(map))return this.textureLayers.get(map)+1;
    const existing=this.textureOwners.findIndex(m=>m?.map===map);if(existing>=0){this.textureLayers.set(map,existing);return existing+1;}
    const i=this.materialTextures.length;if(i>=32)throw new Error('Too many static colour textures');
    this.textureLayers.set(map,i);this.materialTextures.push(map);this.textureOwners.push(owner);return i+1;}
  descriptor(geo,mat,matrix,tint=new THREE.Color(1,1,1)) {
    const pos=geo.attributes.position;const normalColour=geo.attributes.color;
    const color=mat.color.clone().multiply(tint).multiplyScalar(1-(mat.metalness||0));
    let vertexColor=null,uv=null;
    if(mat.vertexColors&&normalColour){vertexColor=new Float32Array(pos.count*3);for(let i=0;i<pos.count;i++)vertexColor.set([normalColour.getX(i),normalColour.getY(i),normalColour.getZ(i)],i*3);}
    if(geo.attributes.uv){const a=geo.attributes.uv;uv=new Float32Array(a.count*2);mat.map?.updateMatrix();const v=new THREE.Vector2();
      for(let i=0;i<a.count;i++){v.set(a.getX(i),a.getY(i));if(mat.map)v.applyMatrix3(mat.map.matrix);uv.set(v.toArray(),i*2);}}
    return {position:pos.array,index:geo.index?.array,color:[...color.toArray(),this.layer(mat.map,mat)],vertexColor,uv,matrix:matrix.toArray()};
  }
  region(origin) {
    const result=[],box=new THREE.Box3(new THREE.Vector3(origin[0]-512,-10000,origin[1]-512),new THREE.Vector3(origin[0]+512,20000,origin[1]+512));
    const matrix=new THREE.Matrix4(),sphere=new THREE.Sphere(),tint=new THREE.Color();this.scene.updateMatrixWorld(true);
    const add=(geo,mat,m,t=new THREE.Color(1,1,1))=>{
      if(!geo.boundingSphere)geo.computeBoundingSphere();sphere.copy(geo.boundingSphere).applyMatrix4(m);
      if(box.intersectsSphere(sphere))result.push(this.descriptor(geo,mat,m,t));
    };
    const camp=this.world.campVisuals,cv=this.world.crevasseVisuals;
    this.scene.traverse(o=>{
      if(!eligible(o)||o.material.userData.rtTerrain||o.parent===camp.root||o.parent===cv.root)return;
      if(!o.geometry.attributes.position)return;
      if(o.isInstancedMesh){for(let i=0;i<o.count;i++){o.getMatrixAt(i,matrix);matrix.premultiply(o.matrixWorld);tint.setRGB(1,1,1);if(o.instanceColor)o.getColorAt(i,tint);add(o.geometry,o.material,matrix,tint);}}
      else add(o.geometry,o.material,o.matrixWorld);
    });
    // Canonical detailed camp parts are independent of display LOD and current instance counts.
    for(const r of camp.records){if(Math.abs(r.x-origin[0])>540||Math.abs(r.z-origin[1])>540)continue;
      for(const part of camp.models[r.kind][1].parts){const mat=camp.materials[part.surface];
        const mode=['dark','metal','whiteStone','solar','glass','label'].includes(part.surface)?'fixed':part.surface==='accent'||part.surface==='door'?'accent':'main';
        add(part.geometry,mat,r.matrix,mode==='fixed'?new THREE.Color(1,1,1):r[mode==='accent'?'accent':'color']);}
      for(const guy of r.guys){for(const segment of guy.segments)add(camp.ropeGeometry,camp.ropeMaterial,segment);add(camp.pegGeometry,camp.pegMaterial,guy.peg);}
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
      add(g,cv.material,new THREE.Matrix4());g.dispose();
    }
    return result;
  }
  makeTextureArray() {
    this.array?.dispose();const size=256,count=Math.max(1,this.materialTextures.length),data=new Uint8Array(size*size*count*4);data.fill(255);
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
  dispose(){this.restore();this.array?.dispose();this.array=null;this.textureLayers.clear();this.materialTextures=[];this.textureOwners=[];}
}
