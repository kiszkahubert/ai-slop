// Adaptive native-resolution collars, conforming edges and geometric aperture cuts.
import * as THREE from 'three';
import { bounds } from './crevasses.js';

export function buildCrevasseTerrain(f,ch,step,holes) {
  const job=buildCrevasseTerrainJob(f,ch,step,holes);let result;
  do {result=job.next();} while(!result.done);
  return result.value;
}

export function* buildCrevasseTerrainJob(f,ch,step,holes) {
  const leaves=[],horizontal=new Map(),vertical=new Map(),c=f.cell;
  const add=(map,key,value)=>{if(!map.has(key))map.set(key,new Set());map.get(key).add(value);};
  function* divide(i,j,nx,nz) {
    const box={x0:f.x0+i*c,x1:f.x0+(i+nx)*c,z0:f.z0+j*c,z1:f.z0+(j+nz)*c};
    if((nx>1 || nz>1) && holes.nearby(box,8).length) {
      const xs=nx>1?[Math.floor(nx/2),nx-Math.floor(nx/2)]:[nx],zs=nz>1?[Math.floor(nz/2),nz-Math.floor(nz/2)]:[nz];
      let z=j;for(const dz of zs){let x=i;for(const dx of xs){yield* divide(x,z,dx,dz);x+=dx;}z+=dz;}
    } else {
      leaves.push({i,j,nx,nz});for(const x of [i,i+nx])for(const z of [j,j+nz]){add(horizontal,z,x);add(vertical,x,z);}
      if(leaves.length%32===0)yield;
    }
  }
  for(let j=ch.j0;j<ch.j1;j+=step)for(let i=ch.i0;i<ch.i1;i+=step)yield* divide(i,j,Math.min(step,ch.i1-i),Math.min(step,ch.j1-j));
  // Written straight into growable Float32Arrays (no conversion pass when the mesh is complete)
  const grow=(size)=>({a:new Float32Array(size),n:0});
  const pos=grow(3<<12),normal=grow(3<<12),gl=grow(1<<12),rk=grow(1<<12);
  const put=(b,x,y,z)=>{
    if(b.n+3>b.a.length){const a=new Float32Array(b.a.length*2);a.set(b.a);b.a=a;}
    b.a[b.n++]=x;if(y!==undefined){b.a[b.n++]=y;b.a[b.n++]=z;}
  };
  // Grid points are shared by up to eight triangles: each is created once and its normal is computed once
  // (keyed by the point itself; aperture cuts create new points, which are computed as they come).
  const points=new Map(),normals=new Map(),n=new THREE.Vector3();
  const point=(i,j)=>{
    const key=i*2*1048576+j*2;let p=points.get(key);
    if(!p){const x=f.x0+i*c,z=f.z0+j*c;p=[x,f.height(x,z),z];points.set(key,p);}
    return p;
  };
  const emit=(p,skirt=false)=>{
    put(pos,p[0],p[1],p[2]);
    if(skirt)put(normal,0,1,0);
    else {
      let v=normals.get(p);
      if(!v){const slope=f.slope(p[0],p[2],4);n.set(-slope.gx,1,-slope.gz).normalize();v=[n.x,n.y,n.z];normals.set(p,v);}
      put(normal,v[0],v[1],v[2]);
    }
    const i=Math.max(0,Math.min(f.nx-1,Math.round((p[0]-f.x0)/c))),j=Math.max(0,Math.min(f.nz-1,Math.round((p[2]-f.z0)/c))),k=j*f.nx+i;
    put(gl,f.glacier?f.glacier[k]/255:1);put(rk,f.rock?f.rock[k]/255:0);
  };
  // Each row's (column's) edge vertices sorted once; a cell takes the run between its corners.
  const sortedCache=new Map();
  const sorted=(map,key)=>{
    let byKey=sortedCache.get(map);if(!byKey)sortedCache.set(map,byKey=new Map());
    let list=byKey.get(key);if(!list)byKey.set(key,list=[...map.get(key)].sort((a,b)=>a-b));
    return list;
  };
  const lowerBound=(list,v)=>{let lo=0,hi=list.length;while(lo<hi){const m=(lo+hi)>>1;if(list[m]<v)lo=m+1;else hi=m;}return lo;};
  const within=(list,lo,hi)=>list.slice(lowerBound(list,lo),lowerBound(list,hi+1e-9));
  let processed=0;
  for(const q of leaves) {
    const {i,j,nx,nz}=q,edge=[];
    const xs=(z)=>within(sorted(horizontal,z),i,i+nx);
    const zs=(x)=>within(sorted(vertical,x),j,j+nz);
    for(const x of xs(j))edge.push(point(x,j));
    for(const z of zs(i+nx).slice(1))edge.push(point(i+nx,z));
    for(const x of xs(j+nz).toReversed().slice(1))edge.push(point(x,j+nz));
    for(const z of zs(i).toReversed().slice(1,-1))edge.push(point(i,z));
    const center=point(i+nx/2,j+nz/2),list=holes.nearby(bounds(edge));
    // Ordinary cells retain the native two-triangle split. Fans are only needed
    // where an adaptive edge has extra vertices to stitch neighbouring cells.
    const triangles=edge.length===4 ? [[edge[0],edge[3],edge[1]],[edge[1],edge[3],edge[2]]] : edge.map((v,k)=>[center,edge[(k+1)%edge.length],v]);
    for(const triangle of triangles)for(const p of holes.cutTriangle(triangle,list))emit(p);
    if(++processed%32===0)yield;
  }
  const skirt=(a,b)=>{
    if(holes.nearby(bounds([a,b]),.25).length)return;
    const drop=step*c*1.5+20,A=[a[0],a[1]-drop,a[2]],B=[b[0],b[1]-drop,b[2]];
    for(const p of [a,A,b,b,A,B,a,b,A,b,B,A])emit(p,true);
  };
  for(const z of [ch.j0,ch.j1]) {
    const xs=sorted(horizontal,z);for(let i=0;i<xs.length-1;i++)skirt(point(xs[i],z),point(xs[i+1],z));
    yield;
  }
  for(const x of [ch.i0,ch.i1]) {
    const zs=sorted(vertical,x);for(let j=0;j<zs.length-1;j++)skirt(point(x,zs[j]),point(x,zs[j+1]));
    yield;
  }
  yield;
  const g=new THREE.BufferGeometry(),attr=(b,size)=>new THREE.BufferAttribute(b.a.slice(0,b.n),size);
  g.setAttribute('position',attr(pos,3));g.setAttribute('normal',attr(normal,3));
  g.setAttribute('aGlacier',attr(gl,1));g.setAttribute('aRock',attr(rk,1));
  g.computeBoundingSphere();g.boundingSphere.radius+=300;return g;
}
