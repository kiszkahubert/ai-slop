// Integration checks on the shipped DEM and the rendered articulated climber.
const W=window.__sim,g=W.game,out={};
const c3=g.routes.main.point('c3');
W.teleport(c3.x+12,c3.z);
const slope=g.field.slope(g.P.x,g.P.z,4),d=slope.mag||1;
const v={x:-slope.gx/d*4,y:-d*4,z:-slope.gz/d*4};
out.fallStarted=W.forceFall({heightOffset:2,velocity:v});
for(let i=0;i<144;i++)W.simStep(1/120,{dx:0,dz:0});
const pose=g.physics.pose(1);
out.parts=Object.keys(pose).length;out.finite=Object.values(pose).every((p)=>[...p.p,...p.q].every(Number.isFinite));
out.airborne=g.P.y-g.field.height(g.P.x,g.P.z);
g.mode='paused';
return out;
