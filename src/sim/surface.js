// Avalanche deposits are transient; the DEM and its provenance remain unchanged.
import { clamp } from '../core/math.js';

export const groundHeight = (g, x, z) => g.physics ? g.physics.groundHeight(x, z) : g.field.height(x, z);

/** Actual support below the feet. Null means open air, never an invented glacier lid. */
export function querySupport(g,position,maxDrop=.5) {
  const {x,y,z}=position,holes=g.world?.crevasseField;
  const ladder=holes?.ladderSupport(x,z,y,maxDrop);if(ladder)return ladder;
  const cv=holes?.at(x,z);
  if(cv) {
    if(y>g.field.height(x,z)-1 && maxDrop<1)return null;
    const hit=holes.ray({x,y:y+.2,z},{x:0,y:-1,z:0},maxDrop+.2,[cv]);
    return hit ? {...hit,kind:'cavity'} : null;
  }
  const height=groundHeight(g,x,z);
  if(height>y+.25 || y-height>maxDrop)return null;
  const slope=g.field.slope(x,z,4),l=Math.hypot(slope.gx,1,slope.gz);
  return {height,normal:{x:-slope.gx/l,y:1/l,z:-slope.gz/l},kind:'terrain',id:null};
}

// Sample the entire displacement, including high debug speeds and ski trajectories.
export function sweepSupport(g,a,b) {
  const length=Math.hypot(b.x-a.x,b.z-a.z),n=Math.max(1,Math.ceil(length/.15));let last={...a};
  const base=g.field.height(a.x,a.z);
  for(let i=1;i<=n;i++) {
    const t=i/n,x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t,y=a.y+g.field.height(x,z)-base;
    const support=g.world?.crevasseField?.ladderSupport(x,z) || querySupport(g,{x,y,z},.55);
    if(!support || support.kind==='cavity')return {x,y,z,t,last,cv:g.world.crevasseField?.at(x,z)};
    last={x,y:support.height,z};
  }
  return {support:querySupport(g,last,.55),last};
}

// Match the triangle split in terrain rendering and fall colliders. Bilinear walking
// samples can sit above/below a triangle on a rugged four-metre cell.
export function triangleHeight(field,x,z) {
  if(!field.cell || !field.nx || !field.nz) return field.height(x,z);
  const c=field.cell,i=clamp(Math.floor((x-field.x0)/c),0,field.nx-2),j=clamp(Math.floor((z-field.z0)/c),0,field.nz-2);
  const px=field.x0+i*c,pz=field.z0+j*c,u=clamp((x-px)/c,0,1),v=clamp((z-pz)/c,0,1);
  const a=field.height(px,pz),b=field.height(px+c,pz),d=field.height(px+c,pz+c),e=field.height(px,pz+c);
  return u+v<=1 ? a+(b-a)*u+(e-a)*v : d+(e-d)*(1-u)+(b-d)*(1-v);
}
