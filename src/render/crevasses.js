import * as THREE from 'three';
import { patchMacroShadow } from './shared.js';
import { makeNoise2D, mulberry32 } from '../core/noise.js';

function iceTextures(size) {
  const color=new Uint8Array(size*size*4),rough=new Uint8Array(size*size*4),normal=new Uint8Array(size*size*4);
  const noise=makeNoise2D(mulberry32(73019));
  for(let y=0;y<size;y++)for(let x=0;x<size;x++) {
    const k=(y*size+x)*4,u=x/size,v=y/size,coarse=noise(u*5,v*5),fine=noise(u*40,v*40),band=Math.sin(v*Math.PI*6+coarse*.7);
    const s=coarse*.035+fine*.012+band*.006;color.set([Math.round(186+s*255),Math.round(216+s*180),Math.round(232+s*120),255],k);
    const roughness=170+Math.round(fine*15);rough.set([roughness,roughness,roughness,255],k);normal.set([128+Math.round(fine*5),128+Math.round(coarse*4),254,255],k);
  }
  const make=(data,srgb=false)=>{const t=new THREE.DataTexture(data,size,size);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.generateMipmaps=true;t.minFilter=THREE.LinearMipmapLinearFilter;t.magFilter=THREE.LinearFilter;t.colorSpace=srgb?THREE.SRGBColorSpace:THREE.NoColorSpace;t.needsUpdate=true;return t;};
  return {map:make(color,true),normalMap:make(normal),roughnessMap:make(rough)};
}
function geometry(records,far) {
  const p=[],colors=[],uv=[];
  for(const cv of records) {
    const vertices=far?cv.farGeometry:cv.geometry;
    for(let i=0;i<vertices.length;i+=3) {
      const a=new THREE.Vector3(...vertices[i]),n=new THREE.Vector3(...vertices[i+1]).sub(a).cross(new THREE.Vector3(...vertices[i+2]).sub(a));
      const axis=Math.abs(n.y)>Math.max(Math.abs(n.x),Math.abs(n.z))?1:Math.abs(n.x)>Math.abs(n.z)?0:2;
      for(const v of vertices.slice(i,i+3)) {
        p.push(...v);const depth=Math.max(0,cv.fieldHeight(v[0],v[2])-v[1]),light=Math.max(.10,Math.exp(-depth*.13));
        colors.push(light,light,Math.min(1,light*1.06));uv.push(v[axis===0?2:0]/4,v[axis===1?2:1]/4);
      }
    }
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.computeVertexNormals();g.computeBoundingSphere();return g;
}
export class CrevasseVisuals {
  constructor(scene,field,quality={textureSize:512}) {
    this.field=field;this.root=new THREE.Group();this.root.name='Crevasse cavities';scene.add(this.root);this.groups=[];
    this.material=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.55,metalness:0,vertexColors:true,side:THREE.DoubleSide});patchMacroShadow(this.material);
    const cells=new Map();
    for(const cv of field.records) {
      cv.fieldHeight=(x,z)=>field.field.height(x,z);const key=Math.floor(cv.x/512)+','+Math.floor(cv.z/512);
      if(!cells.has(key))cells.set(key,[]);cells.get(key).push(cv);
    }
    for(const records of cells.values()) {
      const meshes=[true,false].map(far=>{const m=new THREE.Mesh(geometry(records,far),this.material);m.receiveShadow=true;m.castShadow=true;this.root.add(m);return m;});
      this.groups.push({records,meshes,level:0});meshes[1].visible=false;
    }
    this.applyQuality(quality);
  }
  update(camera) {
    for(const g of this.groups) {
      const distance=Math.min(...g.records.map(cv=>Math.hypot(Math.max(cv.box.x0-camera.position.x,0,camera.position.x-cv.box.x1),Math.max(cv.box.z0-camera.position.z,0,camera.position.z-cv.box.z1))));
      const level=distance<this.radius*(g.level?1.1:.9)?1:0;
      if(level!==g.level){g.meshes[g.level].visible=false;g.meshes[level].visible=true;g.level=level;}
    }
  }
  applyQuality(q) {
    this.radius=q.textureSize>=1024?240:q.textureSize>=512?160:80;
    if(this.size===q.textureSize)return;for(const t of Object.values(this.textures||{}))t.dispose();
    this.size=q.textureSize;this.textures=iceTextures(this.size);Object.assign(this.material,this.textures);this.material.needsUpdate=true;
  }
  stats(){return {batches:this.groups.length,textures:3,textureSize:this.size};}
  dispose(){for(const g of this.groups)for(const m of g.meshes)m.geometry.dispose();for(const t of Object.values(this.textures))t.dispose();this.material.dispose();this.root.removeFromParent();}
}
