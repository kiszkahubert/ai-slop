import * as THREE from 'three';

export function footprintTextures(size=128) {
  const color=new Uint8Array(size*size*4),normal=new Uint8Array(size*size*4),height=new Float32Array(size*size);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const u=x/(size-1)*2-1,v=y/(size-1)*2-1,r=Math.hypot(u/.78,v/.91);
    const mask=1-THREE.MathUtils.smoothstep(r,.78,1),tread=Math.sin(v*45+Math.sin(u*11)*.6)*.5+.5;
    const crust=Math.sin(x*1.7+y*2.9)*Math.sin(y*.83+x*.39);
    const h=-mask*(.13+.035*tread)+Math.exp(-(((r-.9)/.065)**2))*(.045+.025*crust),k=y*size+x;
    height[k]=h;const c=mask*(.72+.1*tread)+(1-mask)*.98;
    color.set([220*c,233*c,247*c,Math.round(mask*230+Math.exp(-(((r-.9)/.09)**2))*25)],k*4);
  }
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const h=(a,b)=>height[Math.max(0,Math.min(size-1,b))*size+Math.max(0,Math.min(size-1,a))];
    const n=new THREE.Vector3((h(x-1,y)-h(x+1,y))*20,(h(x,y-1)-h(x,y+1))*20,1).normalize();
    normal.set([Math.round((n.x*.5+.5)*255),Math.round((n.y*.5+.5)*255),Math.round((n.z*.5+.5)*255),255],(y*size+x)*4);
  }
  const make=(bytes,srgb)=>{const t=new THREE.DataTexture(bytes,size,size);t.colorSpace=srgb?THREE.SRGBColorSpace:THREE.NoColorSpace;
    t.generateMipmaps=true;t.minFilter=THREE.LinearMipmapLinearFilter;t.magFilter=THREE.LinearFilter;t.needsUpdate=true;return t;};
  return {map:make(color,true),normalMap:make(normal,false)};
}

export function buildRouteWear(scene,field,routes,holes) {
  const maps=footprintTextures(),material=new THREE.MeshStandardMaterial({...maps,roughness:.95,alphaTest:.12,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});
  material.normalScale.set(.45,.45);
  const geometry=new THREE.PlaneGeometry(.18,.34).rotateX(-Math.PI/2),batches=new Map(),up=new THREE.Vector3(0,1,0),matrix=new THREE.Matrix4();
  for(const route of Object.values(routes))for(let s=1;s<route.L;s+=.78){
    const p=route.at(s),side=Math.floor(s/.78)%2?1:-1,x=p.x-p.dz*.14*side,z=p.z+p.dx*.14*side;
    if(field.height(x,z)<5900||holes.nearby({x0:x-.2,x1:x+.2,z0:z-.2,z1:z+.2}).length)continue;
    const slope=field.slope(x,z,.4);if(slope.mag>1.05)continue;
    const n=new THREE.Vector3(-slope.gx,1,-slope.gz).normalize(),q=new THREE.Quaternion().setFromUnitVectors(up,n);
    q.multiply(new THREE.Quaternion().setFromAxisAngle(up,Math.atan2(-p.dx,-p.dz)+side*.06));
    matrix.compose(new THREE.Vector3(x,field.height(x,z)+.018,z),q,new THREE.Vector3(1,1,1));
    const key=`${Math.floor(x/128)},${Math.floor(z/128)}`;if(!batches.has(key))batches.set(key,[]);batches.get(key).push(matrix.clone());
  }
  const meshes=[];
  for(const matrices of batches.values()){
    const mesh=new THREE.InstancedMesh(geometry,material,matrices.length);matrices.forEach((m,i)=>mesh.setMatrixAt(i,m));
    mesh.instanceMatrix.needsUpdate=true;mesh.receiveShadow=true;mesh.computeBoundingSphere();scene.add(mesh);meshes.push(mesh);
  }
  return {meshes,material,maps};
}
