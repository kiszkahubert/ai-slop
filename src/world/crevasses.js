// Authored hazard footprints, procedural cavities and shared geometric queries.
// The measured height field is never modified. All coordinates are metres.
import * as THREE from 'three';
import { mulberry32 } from '../core/noise.js';

const EPS = 1e-7, CELL = 64;
const cross = (a,b,p) => (b[0]-a[0])*(p[2]-a[2])-(b[2]-a[2])*(p[0]-a[0]);
const area = (p) => p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+a[0]*b[2]-b[0]*a[2];},0)/2;
export const bounds = (p) => ({x0:Math.min(...p.map(v=>v[0])),x1:Math.max(...p.map(v=>v[0])),z0:Math.min(...p.map(v=>v[2])),z1:Math.max(...p.map(v=>v[2]))});
export const overlaps = (a,b,pad=0) => a.x0<=b.x1+pad && a.x1>=b.x0-pad && a.z0<=b.z1+pad && a.z1>=b.z0-pad;

function halfPlane(poly,a,b,sign) {
  const out=[];
  for(let i=0;i<poly.length;i++) {
    const p=poly[i],q=poly[(i+1)%poly.length],dp=cross(a,b,p)*sign,dq=cross(a,b,q)*sign;
    if(dp>=-EPS) out.push(p);
    if((dp>EPS && dq<-EPS)||(dp<-EPS && dq>EPS)) {
      const t=dp/(dp-dq);out.push(p.map((v,k)=>v+(q[k]-v)*t));
    }
  }
  return out.filter((p,i)=>!i || Math.hypot(p[0]-out[i-1][0],p[2]-out[i-1][2])>EPS);
}

// Partition a polygon into the pieces outside a convex aperture strip.
export function subtractConvex(poly,cut) {
  let inside=poly;const out=[],sign=area(cut)>0?1:-1;
  for(let i=0;i<cut.length && inside.length>=3;i++) {
    const a=cut[i],b=cut[(i+1)%cut.length],piece=halfPlane(inside,a,b,-sign);
    if(piece.length>=3 && Math.abs(area(piece))>EPS) out.push(piece);
    inside=halfPlane(inside,a,b,sign);
  }
  return out;
}

function triangles(poly,out) {
  for(let i=1;i<poly.length-1;i++) if(Math.abs(area([poly[0],poly[i],poly[i+1]]))>EPS && packedTriangle(poly[0],poly[i],poly[i+1])) out.push(poly[0],poly[i],poly[i+1]);
}
function addTri(out,a,b,c) {
  if(packedTriangle(a,b,c))out.push(a,b,c);
}
function packedTriangle(a,b,c) {
  // Native-grid intersections can create submillimetre slivers. At mountain
  // coordinates these collapse when uploaded as Float32; omit them everywhere.
  const ax=Math.fround(b[0])-Math.fround(a[0]),ay=Math.fround(b[1])-Math.fround(a[1]),az=Math.fround(b[2])-Math.fround(a[2]);
  const bx=Math.fround(c[0])-Math.fround(a[0]),by=Math.fround(c[1])-Math.fround(a[1]),bz=Math.fround(c[2])-Math.fround(a[2]);
  return Math.hypot(ay*bz-az*by,az*bx-ax*bz,ax*by-ay*bx)>1e-6;
}

function cavity(cv,field,stride=1) {
  const out=[],rows=cv.rimRows;
  const profiles=stride>1 ? [[0,1],[cv.depth,.20]] : cv.ledge ? [[0,1],[cv.ledge,0.96],[cv.ledge,0.60],[cv.ledge+.5,0.60],[cv.depth*.65,0.42],[cv.depth,0.20]] : [[0,1],[cv.depth*.18,.91],[cv.depth*.6,.55],[cv.depth,.20]];
  const point=(r,side,depth,scale)=>{
    const v=r.center+side*r.half*scale,x=cv.x+cv.ux*r.u-cv.uz*v,z=cv.z+cv.uz*r.u+cv.ux*v;
    return [x,field.height(x,z)-depth,z];
  };
  for(let k=0;k<rows.length-1;k++) {
    const a=rows[k],b=rows[k+1];
    for(const side of [-1,1]) for(let j=0;j<profiles.length-1;j++) {
      const [d,s]=profiles[j],[e,t]=profiles[j+1],p=point(a,side,d,s),q=point(b,side,d,s),r=point(a,side,e,t),v=point(b,side,e,t);
      addTri(out,p,r,q);addTri(out,q,r,v);
    }
    const p=point(a,-1,cv.depth,.2),q=point(a,1,cv.depth,.2),r=point(b,-1,cv.depth,.2),s=point(b,1,cv.depth,.2);
    addTri(out,p,q,r);addTri(out,q,s,r);
  }
  for(const row of [rows[0],rows.at(-1)]) {
    const fractions=[0,...gridSplits(point(row,-1,0,1),point(row,1,0,1),field),1].sort((a,b)=>a-b);
    for(let k=0;k<fractions.length-1;k++)for(let j=0;j<profiles.length-1;j++) {
      const [d,s]=profiles[j],[e,t]=profiles[j+1],lo=fractions[k]*2-1,hi=fractions[k+1]*2-1;
      const a=point(row,lo,d,s),b=point(row,hi,d,s),c=point(row,lo,e,t),v=point(row,hi,e,t);
      addTri(out,a,c,b);addTri(out,b,c,v);
    }
  }
  return out;
}

function gridSplits(a,b,field) {
  const values=new Set(),cell=field.cell;if(!cell)return [];
  const split=(p,q)=>{
    if(Math.abs(q-p)<EPS)return;
    for(let k=Math.floor(Math.min(p,q)/cell)+1;k*cell<Math.max(p,q)-EPS;k++) {
      const t=(k*cell-p)/(q-p);if(t>EPS && t<1-EPS)values.add(t);
    }
  };
  split(a[0]-field.x0,b[0]-field.x0);split(a[2]-field.z0,b[2]-field.z0);
  split(a[0]+a[2]-field.x0-field.z0,b[0]+b[2]-field.x0-field.z0);return [...values];
}

// Add intersections with native grid edges and triangle diagonals. Between these
// points the DEM is planar, so wall tops coincide with the cut terrain exactly.
function rimRows(cv,field) {
  const out=[];if(!field.cell)return cv.rows;
  for(let k=0;k<cv.rows.length-1;k++) {
    const a=cv.rows[k],b=cv.rows[k+1],values=new Set([0]);
    for(const side of [-1,1]) {
      const p=r=>[cv.x+cv.ux*r.u-cv.uz*(r.center+side*r.half),0,cv.z+cv.uz*r.u+cv.ux*(r.center+side*r.half)];
      for(const t of gridSplits(p(a),p(b),field))values.add(t);
    }
    for(const t of [...values].sort((a,b)=>a-b))out.push({u:a.u+(b.u-a.u)*t,center:a.center+(b.center-a.center)*t,half:a.half+(b.half-a.half)*t});
  }
  out.push(cv.rows.at(-1));return out;
}

export class CrevasseField {
  constructor(field,placements,seed=5) {
    this.field=field;this.records=placements;this.grid=new Map();
    placements.forEach((cv,index)=>{
      cv.id=`crevasse-${index}`;const random=mulberry32(seed+index*7919+19037);
      cv.depth=12+random()*23;cv.ledge=random()<.3?2+random()*4:0;cv.rows=[];cv.strips=[];
      const n=Math.ceil(cv.len/2);
      for(let k=0;k<=n;k++) {
        const u=(k/n-.5)*cv.len,taper=1-.85*Math.pow(Math.abs(k/n-.5)*2,3);
        const center=(random()-.5)*cv.w*.025*taper;
        cv.rows.push({u,center,half:cv.w/2*taper*(.96+.04*random())-Math.abs(center)});
      }
      const point=(r,side)=>[cv.x+cv.ux*r.u-cv.uz*(r.center+side*r.half),0,cv.z+cv.uz*r.u+cv.ux*(r.center+side*r.half)];
      for(let k=0;k<n;k++) {
        const p=[point(cv.rows[k],-1),point(cv.rows[k+1],-1),point(cv.rows[k+1],1),point(cv.rows[k],1)];
        cv.strips.push({poly:p,...bounds(p)});
      }
      cv.outline=[...cv.rows.map(r=>point(r,-1)),...cv.rows.toReversed().map(r=>point(r,1))];
      cv.rimRows=rimRows(cv,field);
      cv.box=bounds(cv.outline);cv.geometry=cavity(cv,field);cv.farGeometry=cavity(cv,field,4);
      if(cv.ladder) {
        const v={x:-cv.uz,z:cv.ux},ext=cv.w/2+1.3;
        cv.ladderA={x:cv.x-v.x*ext,z:cv.z-v.z*ext};cv.ladderB={x:cv.x+v.x*ext,z:cv.z+v.z*ext};
        for(const p of [cv.ladderA,cv.ladderB]) p.y=field.height(p.x,p.z)+.14;
        cv.ladderParts=this.makeLadder(cv);
      }
      for(let z=Math.floor(cv.box.z0/CELL);z<=Math.floor(cv.box.z1/CELL);z++) for(let x=Math.floor(cv.box.x0/CELL);x<=Math.floor(cv.box.x1/CELL);x++) {
        const key=x+','+z;if(!this.grid.has(key))this.grid.set(key,[]);this.grid.get(key).push(cv);
      }
    });
  }
  nearby(box,pad=0) {
    const out=new Set();
    for(let z=Math.floor((box.z0-pad)/CELL);z<=Math.floor((box.z1+pad)/CELL);z++) for(let x=Math.floor((box.x0-pad)/CELL);x<=Math.floor((box.x1+pad)/CELL);x++) {
      for(const cv of this.grid.get(x+','+z)||[]) if(overlaps(cv.box,box,pad))out.add(cv);
    }
    return [...out];
  }
  local(cv,x,z) {const dx=x-cv.x,dz=z-cv.z;return {u:dx*cv.ux+dz*cv.uz,v:-dx*cv.uz+dz*cv.ux};}
  at(x,z) {
    for(const cv of this.grid.get(Math.floor(x/CELL)+','+Math.floor(z/CELL))||[]) {
      const {u,v}=this.local(cv,x,z);if(Math.abs(u)>=cv.len/2)continue;
      const k=Math.min(cv.rows.length-2,Math.floor((u/cv.len+.5)*(cv.rows.length-1))),a=cv.rows[k],b=cv.rows[k+1],t=(u-a.u)/(b.u-a.u);
      if(Math.abs(v-(a.center+(b.center-a.center)*t))<a.half+(b.half-a.half)*t-EPS)return cv;
    }
    return null;
  }
  cutTriangle(tri,candidates=this.nearby(bounds(tri))) {
    let pieces=[tri];
    for(const cv of candidates) for(const strip of cv.strips) {
      if(!overlaps(bounds(tri),strip))continue;
      pieces=pieces.flatMap(p=>overlaps(bounds(p),strip)?subtractConvex(p,strip.poly):[p]);
      if(!pieces.length)return [];
    }
    const out=[];for(const p of pieces)triangles(p,out);return out;
  }
  ladderSupport(x,z,y=Infinity,maxDrop=Infinity) {
    for(const cv of this.nearby({x0:x-.7,x1:x+.7,z0:z-.7,z1:z+.7},2)) {
      if(!cv.ladder)continue;const {u,v}=this.local(cv,x,z),ext=cv.w/2+1.3;
      if(Math.abs(u)>.30 || Math.abs(v)>ext)continue;
      const height=cv.ladderA.y+(cv.ladderB.y-cv.ladderA.y)*(v+ext)/(2*ext)+.045;
      const grade=(cv.ladderB.y-cv.ladderA.y)/(2*ext),length=Math.hypot(grade,1);
      if(height<=y+.25 && y-height<=maxDrop) return {height,normal:{x:cv.uz*grade/length,y:1/length,z:-cv.ux*grade/length},kind:'ladder',id:cv.id};
    }
    return null;
  }
  makeLadder(cv) {
    const A=new THREE.Vector3(cv.ladderA.x,cv.ladderA.y,cv.ladderA.z),B=new THREE.Vector3(cv.ladderB.x,cv.ladderB.y,cv.ladderB.z),dir=B.clone().sub(A),len=dir.length();dir.normalize();
    const side=new THREE.Vector3(cv.ux,0,cv.uz),up=side.clone().cross(dir).normalize();if(up.y<0)up.negate();
    const sideN=dir.clone().cross(up).normalize(),rotation=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(dir,up,sideN));
    const out=[];
    for(const o of [-.3,.3])out.push({center:A.clone().lerp(B,.5).addScaledVector(sideN,o),half:[len/2,.035,.025],rotation});
    for(let t=.15;t<len;t+=.32)out.push({center:A.clone().addScaledVector(dir,t).add(new THREE.Vector3(0,.01,0)),half:[.02,.02,.31],rotation});
    return out;
  }
  ray(origin,direction,maxDistance,candidates=null) {
    const o=new THREE.Vector3(origin.x,origin.y,origin.z),d=new THREE.Vector3(direction.x,direction.y,direction.z).normalize(),end=o.clone().addScaledVector(d,maxDistance);
    const list=candidates||this.nearby(bounds([o.toArray(),end.toArray()]),1),ray=new THREE.Ray(o,d);let best=null;
    for(const cv of list)for(let i=0;i<cv.geometry.length;i+=3) {
      const a=new THREE.Vector3(...cv.geometry[i]),b=new THREE.Vector3(...cv.geometry[i+1]),c=new THREE.Vector3(...cv.geometry[i+2]),p=ray.intersectTriangle(a,b,c,false,new THREE.Vector3());
      if(!p)continue;const distance=p.distanceTo(o);if(distance>maxDistance || (best && distance>=best.distance))continue;
      const normal=b.clone().sub(a).cross(c.clone().sub(a)).normalize();if(normal.dot(d)>0)normal.negate();
      best={distance,height:p.y,point:p,normal,kind:'ice',id:cv.id};
    }
    for(const cv of list)for(const part of cv.ladderParts||[]) {
      const inverse=part.rotation.clone().invert(),localO=o.clone().sub(part.center).applyQuaternion(inverse),localD=d.clone().applyQuaternion(inverse),half=new THREE.Vector3(...part.half);
      const p=new THREE.Ray(localO,localD).intersectBox(new THREE.Box3(half.clone().negate(),half),new THREE.Vector3());
      if(!p)continue;const distance=p.distanceTo(localO);if(distance>maxDistance || (best && distance>=best.distance))continue;
      const point=p.applyQuaternion(part.rotation).add(part.center);best={distance,height:point.y,point,normal:new THREE.Vector3(0,1,0),kind:'ladder',id:cv.id};
    }
    return best;
  }
  safePosition(x,z) {
    const ladder=this.ladderSupport(x,z);if(ladder)return {x,y:ladder.height,z};
    const cv=this.at(x,z);if(!cv)return {x,y:this.field.height(x,z),z};
    let best=null,distance=Infinity;
    // Project onto the real edge, also considering neighbouring openings so a
    // bank chosen beside an overlapping footprint is actually safe.
    for(const c of this.nearby(cv.box,1))for(let i=0;i<c.outline.length;i++) {
      const a=c.outline[i],b=c.outline[(i+1)%c.outline.length],dx=b[0]-a[0],dz=b[2]-a[2],length=Math.hypot(dx,dz);
      const t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[2])*dz)/(length*length)));
      const px=a[0]+dx*t+dz/length*.65,pz=a[2]+dz*t-dx/length*.65,d=Math.hypot(px-x,pz-z);
      if(d<distance && !this.at(px,pz)){distance=d;best={x:px,y:this.field.height(px,pz),z:pz};}
    }
    return best;
  }
  contact(point,maxDistance=.3) {
    let best=null;const p=new THREE.Vector3(point.x,point.y,point.z);
    for(const cv of this.nearby({x0:p.x-maxDistance,x1:p.x+maxDistance,z0:p.z-maxDistance,z1:p.z+maxDistance})) {
      for(let i=0;i<cv.geometry.length;i+=3) {
        const t=new THREE.Triangle(...cv.geometry.slice(i,i+3).map(v=>new THREE.Vector3(...v))),hit=t.closestPointToPoint(p,new THREE.Vector3()),distance=hit.distanceTo(p);
        if(distance<=maxDistance && (!best || distance<best.distance))best={distance,point:hit,normal:t.getNormal(new THREE.Vector3()),kind:'ice',id:cv.id};
      }
    }
    return best;
  }
}
