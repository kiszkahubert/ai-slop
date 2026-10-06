// Small authored snow shelves over the measured terrain. The same vertex arrays
// drive display meshes, support queries, Rapier colliders and static RT snapshots.
import * as THREE from 'three';

export function cornicePatch(field, p, length=9, width=4, amplitude=1.2) {
  const nx=Math.ceil(length/.5)+1,nz=Math.ceil(width/.5)+1,position=new Float32Array(nx*nz*3),heights=new Float32Array(nx*nz),index=[];
  const ux=p.dx,uz=p.dz,vx=-uz,vz=ux;
  for(let j=0;j<nz;j++)for(let i=0;i<nx;i++){
    const u=i/(nx-1),v=j/(nz-1),a=(u-.5)*length,b=(v-.5)*width;
    const x=p.x+ux*a+vx*b,z=p.z+uz*a+vz*b;
    // A broad shelf rises to a sharp broken lee edge, then joins the DEM.
    const ridge=Math.pow(Math.sin(Math.PI*u),2)*Math.pow(Math.sin(Math.PI*v),.65);
    const broken=.8+.2*Math.sin(u*29+p.x*.1)*Math.sin(u*11+p.z*.1);
    const h=field.height(x,z)+amplitude*ridge*broken,k=j*nx+i;
    heights[k]=h;position.set([x,h,z],k*3);
    if(i<nx-1&&j<nz-1){const a=k,b=k+1,c=k+nx,d=c+1;index.push(a,c,b,b,c,d);}
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(position,3));
  geometry.setIndex(index);geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();
  const b=geometry.boundingBox;
  return {geometry,position,index:new Uint32Array(index),heights,nx,nz,length,width,ux,uz,vx,vz,x:p.x,z:p.z,box:{x0:b.min.x,x1:b.max.x,z0:b.min.z,z1:b.max.z}};
}

export function sampleCornice(record,x,z) {
  const dx=x-record.x,dz=z-record.z,u=(dx*record.ux+dz*record.uz)/record.length+.5,v=(dx*record.vx+dz*record.vz)/record.width+.5;
  if(u<0||v<0||u>1||v>1)return null;
  const fx=u*(record.nx-1),fz=v*(record.nz-1),i=Math.min(record.nx-2,Math.floor(fx)),j=Math.min(record.nz-2,Math.floor(fz)),a=fx-i,b=fz-j,k=j*record.nx+i;
  const ids=a+b<=1?[k,k+record.nx,k+1]:[k+1,k+record.nx,k+record.nx+1];
  const h=record.heights,height=a+b<=1?h[k]+(h[k+1]-h[k])*a+(h[k+record.nx]-h[k])*b:h[k+record.nx+1]+(h[k+record.nx]-h[k+record.nx+1])*(1-a)+(h[k+1]-h[k+record.nx+1])*(1-b);
  const points=ids.map(id=>new THREE.Vector3().fromArray(record.position,id*3));
  const normal=points[1].clone().sub(points[0]).cross(points[2].clone().sub(points[0])).normalize();
  return {height,normal:{x:normal.x,y:normal.y,z:normal.z},kind:'cornice',id:record.id};
}

export class RouteFeatures {
  constructor(scene,field,routes,holes) {
    this.records=[];
    const material=new THREE.MeshStandardMaterial({color:0xdce5ef,roughness:.92});
    for(const [name,route] of Object.entries(routes))for(let s=Math.max(0,route.L-400);s<route.L-25;s+=45){
      const p=route.at(s);if(field.height(p.x,p.z)<7750)continue;
      const side=s%90<45?1:-1;
      const centre={...p,x:p.x-p.dz*4.2*side,z:p.z+p.dx*4.2*side};
      const record=cornicePatch(field,centre,9,4,1.1);
      if(holes?.nearby(record.box,2).length){record.geometry.dispose();continue;}
      record.id=`${name}-snow-edge-${Math.round(s)}`;
      const mesh=new THREE.Mesh(record.geometry,material);mesh.castShadow=mesh.receiveShadow=true;
      scene.add(mesh);record.mesh=mesh;this.records.push(record);
    }
  }
  sample(x,z) {
    let best=null;
    for(const r of this.records){if(x<r.box.x0||x>r.box.x1||z<r.box.z0||z>r.box.z1)continue;
      const hit=sampleCornice(r,x,z);if(hit&&(!best||hit.height>best.height))best=hit;
    }
    return best;
  }
}
