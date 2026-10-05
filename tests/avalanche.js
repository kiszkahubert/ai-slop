const W=window.__sim,g=W.game,out={};
g.mode='play';
const c3=g.routes.main.point('c3');W.teleport(c3.x,c3.z);
out.started=W.triggerAvalanche({seed:87});
if(!out.started)return out;
const A=g.physics.avalanche;let caught=false,peak=0,caughtAt=null;
const start={x:g.P.x,z:g.P.z};
out.maxDepth=0;
for(let i=0;i<30*60;i++) {
  W.simStep(1/30,{dx:0,dz:0});caught ||= !!g.P.falling;peak=Math.max(peak,A.maxSpeed);
  if(caught && caughtAt===null) caughtAt=i;
  out.maxDepth=Math.max(out.maxDepth,A.sample(start.x,start.z).depth);
  if(caught && i>caughtAt+60) break;
}
out.caught=caught;out.peak=peak;out.massError=Math.abs(A.volume()+A.escaped-A.initialVolume);
out.invulnerable=g.S.health===100&&g.mode==='play';out.displacement=Math.hypot(g.P.x-start.x,g.P.z-start.z);
out.finite=[...A.h,...A.qx,...A.qz].every(Number.isFinite);
out.events=g.physics.events.map((e)=>e.type);out.source=A.source;
W.rig.free={pos:[A.source.x+100,g.field.height(A.source.x,A.source.z)+100,A.source.z+100],look:[A.source.x+A.dx*100,g.field.height(A.source.x+A.dx*100,A.source.z+A.dz*100),A.source.z+A.dz*100]};
g.mode='paused';
return out;
