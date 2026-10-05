// Avalanche deposits are transient; the DEM and its provenance remain unchanged.
import { clamp } from '../core/math.js';

export const groundHeight = (g, x, z) => g.physics ? g.physics.groundHeight(x, z) : g.field.height(x, z);

// Match the triangle split in terrain rendering and fall colliders. Bilinear walking
// samples can sit above/below a triangle on a rugged four-metre cell.
export function triangleHeight(field,x,z) {
  if(!field.cell || !field.nx || !field.nz) return field.height(x,z);
  const c=field.cell,i=clamp(Math.floor((x-field.x0)/c),0,field.nx-2),j=clamp(Math.floor((z-field.z0)/c),0,field.nz-2);
  const px=field.x0+i*c,pz=field.z0+j*c,u=clamp((x-px)/c,0,1),v=clamp((z-pz)/c,0,1);
  const a=field.height(px,pz),b=field.height(px+c,pz),d=field.height(px+c,pz+c),e=field.height(px,pz+c);
  return u+v<=1 ? a+(b-a)*u+(e-a)*v : d+(e-d)*(1-u)+(b-d)*(1-v);
}
