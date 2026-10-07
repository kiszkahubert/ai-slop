import * as THREE from 'three';
import { MeshBVH, SAH } from 'three-mesh-bvh';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildHeightHierarchy } from './heightHierarchy.js';
import { CrevasseField, overlaps } from '../../world/crevasses.js';

let fields;
function adapter(f) {
  return { ...f,
    heightAt(i,j) { return f.h[Math.max(0,Math.min(f.nz-1,j))*f.nx+Math.max(0,Math.min(f.nx-1,i))]; },
    height(x,z) {
      const fx=Math.max(0,Math.min(f.nx-1.0001,(x-f.x0)/f.cell)),fz=Math.max(0,Math.min(f.nz-1.0001,(z-f.z0)/f.cell));
      const i=Math.floor(fx),j=Math.floor(fz),u=fx-i,v=fz-j,k=j*f.nx+i;
      const a=f.h[k],b=f.h[k+1],c=f.h[k+f.nx],d=f.h[k+f.nx+1];
      return u+v<=1?a+(b-a)*u+(c-a)*v:d+(c-d)*(1-u)+(b-d)*(1-v);
    },
  };
}
export function buildRegion(field, origin, meshes, apertures = []) {
  const f=adapter(field),half=512,box={x0:origin[0]-half,x1:origin[0]+half,z0:origin[1]-half,z1:origin[1]+half};
  const holes={nearby(b,pad=0){return apertures.filter(cv=>overlaps(cv.box,b,pad));},cutTriangle:CrevasseField.prototype.cutTriangle};
  const p=[],colors=[],uv=[];
  const emit=(point,color,coord,fade=0,groundNormal=0)=>{p.push(point[0]-origin[0],point[1],point[2]-origin[1]);colors.push(...color);uv.push(...coord,fade,groundNormal);};
  const i0=Math.max(0,Math.floor((box.x0-f.x0)/f.cell)),i1=Math.min(f.nx-1,Math.ceil((box.x1-f.x0)/f.cell));
  const j0=Math.max(0,Math.floor((box.z0-f.z0)/f.cell)),j1=Math.min(f.nz-1,Math.ceil((box.z1-f.z0)/f.cell));
  const point=(i,j)=>[f.x0+i*f.cell,f.heightAt(i,j),f.z0+j*f.cell];
  for(let j=j0;j<j1;j++) for(let i=i0;i<i1;i++) {
    const a=point(i,j),b=point(i+1,j),c=point(i,j+1),d=point(i+1,j+1);
    const nearby=holes.nearby({x0:a[0],x1:d[0],z0:a[2],z1:d[2]});
    for(const tri of [[a,c,b],[b,c,d]]) for(const v of (nearby.length?holes.cutTriangle(tri,nearby):tri)) emit(v,[1,1,1,-1],[0,0]);
  }
  const v=new THREE.Vector3(),matrix=new THREE.Matrix4();
  for(const m of meshes) {
    matrix.fromArray(m.matrix);const pos=m.position,index=m.index,count=index?index.length:pos.length/3;
    for(let k=0;k<count;k++) {
      const i=index?index[k]:k;v.fromArray(pos,i*3).applyMatrix4(matrix);
      const color=m.color.slice();
      if(m.vertexColor)for(let c=0;c<3;c++)color[c]*=m.vertexColor[i*3+c];
      // Negative layers below -1 distinguish ice ground data from terrain (-1).
      // Reuse spare colour/UV channels; extra samplers would exceed the local shader's GPU budget.
      if(m.iceGround)for(let c=0;c<3;c++)color[c]=m.iceGround[i*4+c];
      if(m.iceGround)color[3]=-m.color[3]-1;
      emit(v.toArray(),color,m.uv?Array.from(m.uv.subarray(i*2,i*2+2)):[0,0],m.iceGround?.[i*4+3]||0,m.iceGroundNormal||0);
    }
    if(p.length/9>3000000)throw new Error('Nearby geometry exceeds the 3,000,000 triangle budget');
  }
  let geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(p,3));
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,4));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,4));
  // The terrain and model seams share vertices. Welding all attributes retains material
  // boundaries and UV seams while avoiding three copies of every terrain vertex on the GPU.
  const welded=mergeVertices(geometry,1e-4);geometry.dispose();geometry=welded;
  const bvh=new MeshBVH(geometry,{strategy:SAH,maxDepth:28,maxLeafTris:6,verbose:false});
  const serialized=MeshBVH.serialize(bvh,{cloneBuffers:false});
  return { origin, box, serialized, position:geometry.attributes.position.array,color:geometry.attributes.color.array,uv:geometry.attributes.uv.array,
    triangles:geometry.index.count/3 };
}

globalThis.onmessage=({data})=>{
  try {
    if(data.type==='init') {
      fields=data.fields;
      const hierarchies=fields.map(f=>buildHeightHierarchy(f));
      globalThis.postMessage({type:'hierarchies',hierarchies},hierarchies.map(h=>h.atlas.buffer));
    } else if(data.type==='region') {
      const result=buildRegion(fields[0],data.origin,data.meshes,data.apertures);
      const transfer=[result.position.buffer,result.color.buffer,result.uv.buffer,result.serialized.index.buffer,...result.serialized.roots];
      globalThis.postMessage({type:'region',id:data.id,result},transfer);
    }
  } catch(e) {globalThis.postMessage({type:'error',id:data.id,message:e.message});}
};
