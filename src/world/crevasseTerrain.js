// Adaptive native-resolution collars, conforming edges and geometric aperture cuts.
import * as THREE from 'three';
import { bounds } from './crevasses.js';

export function buildCrevasseTerrain(f,ch,step,holes) {
  const leaves=[],horizontal=new Map(),vertical=new Map(),c=f.cell;
  const add=(map,key,value)=>{if(!map.has(key))map.set(key,new Set());map.get(key).add(value);};
  const divide=(i,j,nx,nz)=>{
    const box={x0:f.x0+i*c,x1:f.x0+(i+nx)*c,z0:f.z0+j*c,z1:f.z0+(j+nz)*c};
    if((nx>1 || nz>1) && holes.nearby(box,8).length) {
      const xs=nx>1?[Math.floor(nx/2),nx-Math.floor(nx/2)]:[nx],zs=nz>1?[Math.floor(nz/2),nz-Math.floor(nz/2)]:[nz];
      let z=j;for(const dz of zs){let x=i;for(const dx of xs){divide(x,z,dx,dz);x+=dx;}z+=dz;}
    } else {
      leaves.push({i,j,nx,nz});for(const x of [i,i+nx])for(const z of [j,j+nz]){add(horizontal,z,x);add(vertical,x,z);}
    }
  };
  for(let j=ch.j0;j<ch.j1;j+=step)for(let i=ch.i0;i<ch.i1;i+=step)divide(i,j,Math.min(step,ch.i1-i),Math.min(step,ch.j1-j));
  const pos=[],normal=[],gl=[],rk=[];
  const point=(i,j)=>{const x=f.x0+i*c,z=f.z0+j*c;return [x,f.height(x,z),z];};
  const emit=(p,skirt=false)=>{
    pos.push(...p);const slope=f.slope(p[0],p[2],4),n=new THREE.Vector3(-slope.gx,1,-slope.gz).normalize();normal.push(n.x,n.y,n.z);
    const i=Math.max(0,Math.min(f.nx-1,Math.round((p[0]-f.x0)/c))),j=Math.max(0,Math.min(f.nz-1,Math.round((p[2]-f.z0)/c))),k=j*f.nx+i;
    gl.push(f.glacier?f.glacier[k]/255:1);rk.push(f.rock?f.rock[k]/255:0);
    if(skirt){normal.splice(normal.length-3,3,0,1,0);}
  };
  for(const q of leaves) {
    const {i,j,nx,nz}=q,edge=[];
    const xs=(z)=>[...horizontal.get(z)].filter(x=>x>=i&&x<=i+nx).sort((a,b)=>a-b);
    const zs=(x)=>[...vertical.get(x)].filter(z=>z>=j&&z<=j+nz).sort((a,b)=>a-b);
    for(const x of xs(j))edge.push(point(x,j));
    for(const z of zs(i+nx).slice(1))edge.push(point(i+nx,z));
    for(const x of xs(j+nz).toReversed().slice(1))edge.push(point(x,j+nz));
    for(const z of zs(i).toReversed().slice(1,-1))edge.push(point(i,z));
    const center=point(i+nx/2,j+nz/2),list=holes.nearby(bounds(edge));
    // Ordinary cells retain the native two-triangle split. Fans are only needed
    // where an adaptive edge has extra vertices to stitch neighbouring cells.
    const triangles=edge.length===4 ? [[edge[0],edge[3],edge[1]],[edge[1],edge[3],edge[2]]] : edge.map((v,k)=>[center,edge[(k+1)%edge.length],v]);
    for(const triangle of triangles)for(const p of holes.cutTriangle(triangle,list))emit(p);
  }
  const skirt=(a,b)=>{
    if(holes.nearby(bounds([a,b]),.25).length)return;
    const drop=step*c*1.5+20,A=[a[0],a[1]-drop,a[2]],B=[b[0],b[1]-drop,b[2]];
    for(const p of [a,A,b,b,A,B,a,b,A,b,B,A])emit(p,true);
  };
  for(const z of [ch.j0,ch.j1]) {
    const xs=[...horizontal.get(z)].sort((a,b)=>a-b);for(let i=0;i<xs.length-1;i++)skirt(point(xs[i],z),point(xs[i+1],z));
  }
  for(const x of [ch.i0,ch.i1]) {
    const zs=[...vertical.get(x)].sort((a,b)=>a-b);for(let j=0;j<zs.length-1;j++)skirt(point(x,zs[j]),point(x,zs[j+1]));
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(normal,3));
  g.setAttribute('aGlacier',new THREE.Float32BufferAttribute(gl,1));g.setAttribute('aRock',new THREE.Float32BufferAttribute(rk,1));
  g.computeBoundingSphere();g.boundingSphere.radius+=300;return g;
}
