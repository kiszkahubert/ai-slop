return (async()=>{
  const W=window.__sim,g=W.game,h=g.world.crevasseField,out={count:h.records.length,crossings:[],falls:[]};
  document.getElementById('gl').requestPointerLock=()=>Promise.resolve();
  g.free=true;g.mode='play';W.setSpeedMul(1);
  out.degenerate=0;out.meshesFinite=true;
  const inspect=(geometry)=>{
    const p=geometry.attributes.position,index=geometry.index,n=index?index.count:p.count;
    for(let k=0;k<n;k+=3) {
      const ids=[0,1,2].map(i=>index?index.getX(k+i):k+i),v=ids.map(i=>[p.getX(i),p.getY(i),p.getZ(i)]);
      out.meshesFinite &&=v.flat().every(Number.isFinite);
      const a=v[1].map((x,i)=>x-v[0][i]),b=v[2].map((x,i)=>x-v[0][i]);
      if(Math.hypot(a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0])<1e-8)out.degenerate++;
    }
  };
  for(const m of g.world.crevasseVisuals.root.children)inspect(m.geometry);
  for(const ch of W.terrain.chunks)if(h.nearby(ch,8).length)for(const m of ch.meshes)if(m)inspect(m.geometry);
  const cv=h.records.find(c=>c.ladder),vx=-cv.uz,vz=cv.ux;
  const point=(u,v)=>({x:cv.x+cv.ux*u+vx*v,z:cv.z+cv.uz*u+vz*v});
  // Actual deck, both directions, every authored route crossing.
  for(const c of h.records.filter(c=>c.ladder))for(const side of [-1,1]) {
    const x=-c.uz,z=c.ux,ext=c.w/2+1.7;W.teleport(c.x+x*ext*side,c.z+z*ext*side);g.mode='play';
    let ladder=false;
    for(let k=0;k<700;k++){W.simStep(1/30,{dx:-x*side,dz:-z*side});ladder ||=g.P.onLadder;if(g.P.falling)break;const v=h.local(c,g.P.x,g.P.z).v;if(v*side<-ext)break;}
    out.crossings.push({id:c.id,side,ladder,fell:!!g.P.falling,crossed:h.local(c,g.P.x,g.P.z).v*side<-c.w/2});
  }
  W.teleport(cv.x,cv.z);g.mode='play';
  for(let k=0;k<30&&!g.P.falling;k++)W.simStep(1/30,{dx:cv.ux,dz:cv.uz});
  out.stepOff=g.P.falling?.reason==='crevasse';
  const saved=localStorage.getItem('everestSim.v2.save'),gameModule=await import('./src/sim/game.js');
  g.free=false;gameModule.save(true);out.saveKept=localStorage.getItem('everestSim.v2.save')===saved;g.free=true;
  out.exitBlocked=gameModule.exitFreeViewing()===false&&g.free;
  W.resetPhysics();out.resetSupported=!!W.querySupport(g.P,.6)&&!g.P.falling;
  const start=point(8,-cv.w/2-1.5);W.teleport(start.x,start.z);W.setSpeedMul(32);
  W.simStep(.2,{dx:vx,dz:vz,sprint:true});out.swept=g.P.falling?.reason==='crevasse';W.setSpeedMul(1);
  // High horizontal momentum can carry the body onto the far bank. Test a
  // stationary drop separately, keeping the swept-entry assertion above.
  W.teleport(cv.x,cv.z);g.P.x=point(8,0).x;g.P.z=point(8,0).z;g.P.y=g.field.height(g.P.x,g.P.z);g.P.clipped=-1;g.P.velocity=null;
  W.simStep(1/120,{dx:0,dz:0});
  for(let i=0;i<2400;i++)W.stepPhysics(1/120);
  out.trapped=['trapped','suspended'].includes(g.P.falling?.phase);out.invulnerable=g.S.health===100;out.finite=Object.values(g.physics.pose()).every(p=>[...p.p,...p.q].every(Number.isFinite));
  g.mode='paused';
  const fallSnapshot=JSON.stringify({P:g.P,S:g.S,pose:g.physics.pose(),colliders:[...g.physics.parts.values()].map(p=>p.collider.handle)});
  for(const quality of ['low','high','medium'])W.setQuality(quality);
  out.qualityFallKept=fallSnapshot===JSON.stringify({P:g.P,S:g.S,pose:g.physics.pose(),colliders:[...g.physics.parts.values()].map(p=>p.collider.handle)});g.mode='play';
  g.free=false;const initialTime=g.time,initialOxygen=g.S.spo2;
  for(let i=0;i<300;i++)W.simStep(1/30,{dx:0,dz:0});
  out.physiology=g.time>initialTime&&g.S.spo2<initialOxygen&&!!g.P.falling;g.free=true;
  W.rig.free=null;W.rig.update(.1,0,g,W.climber);out.cameraBelow=W.camera.position.y<g.field.height(g.P.x,g.P.z)-.3;
  g.mode='paused';const y=g.P.y,time=g.time;await new Promise(r=>setTimeout(r,100));out.pauseKept=g.P.y===y&&g.time===time;
  W.teleport(start.x,start.z);out.teleportCleared=!g.P.falling&&g.physics.world===null;
  g.P.ski={air:{vx:2,vy:-1,vz:0},u:2,w:0,speed:2};g.P.lastSupported={...start,y:g.field.height(start.x,start.z)};
  W.resetPhysics();out.flightReset=!g.P.ski.air&&!!W.querySupport(g.P,.6);
  g.P.ski.air={vx:2,vy:-1,vz:0};W.teleport(cv.x,cv.z);out.flightTeleport=!g.P.ski.air&&W.querySupport(g.P,.6)?.kind==='ladder';g.P.ski=null;
  const legacy=JSON.parse(saved);legacy.P.x=point(8,0).x;legacy.P.z=point(8,0).z;
  localStorage.setItem('everestSim.v2.save',JSON.stringify(legacy));out.loaded=gameModule.load();out.safeLegacy=!!W.querySupport(g.P,.6);localStorage.setItem('everestSim.v2.save',saved);
  g.free=true;
  W.triggerAvalanche({source:{x:cv.x,z:cv.z},size:16,cell:4,width:24,length:24,seed:41});
  W.avalancheView.update(0,g.physics,W.camera);
  const snowMesh=W.avalancheView.surface.geometry,sp=snowMesh.attributes.position;
  out.snowOpen=true;
  for(let i=0;i<sp.count;i+=3){const x=(sp.getX(i)+sp.getX(i+1)+sp.getX(i+2))/3,z=(sp.getZ(i)+sp.getZ(i+1)+sp.getZ(i+2))/3;if(h.at(x,z))out.snowOpen=false;}
  for(let i=0;i<90;i++)g.physics.avalanche.step(1/30);
  out.snowEscaped=g.physics.avalanche.escaped>0&&g.physics.avalanche.sample(point(8,0).x,point(8,0).z).depth===0;
  // Descending all Icefall ladders under autopilot, including the opposite waypoint order.
  g.free=true;g.mode='play';const c1=g.routes.main.point('c1');W.teleport(c1.x,c1.z);
  out.autoStarted=W.startAutopilot({direction:-1,nonstop:true,routeName:'main'});
  for(let i=0;i<120000&&g.auto&&!g.P.falling;i++)W.simStep(1/30,{dx:0,dz:0});
  out.autoReturned=!g.auto&&!g.P.falling&&g.routes.main.nearest(g.P.x,g.P.z).s<5;
  g.mode='paused';
  const manager=g.world.crevasseVisuals,{QUALITY_PRESETS}=await import('./src/render/quality.js');
  let released=0;for(const t of Object.values(manager.textures))t.addEventListener('dispose',()=>released++);
  const pose=JSON.stringify(g.P),placements=JSON.stringify(h.records.map(c=>[c.x,c.z,c.w,c.len,c.depth]));
  const resources=[];for(const quality of ['low','high','medium','low','high','medium']) {
    manager.applyQuality(QUALITY_PRESETS[quality]);manager.update(W.camera);W.renderer.render(W.scene,W.camera);resources.push(W.renderer.info.memory.textures);
  }
  out.released=released;out.stableResources=resources[2]===resources[5];out.stateKept=pose===JSON.stringify(g.P)&&placements===JSON.stringify(h.records.map(c=>[c.x,c.z,c.w,c.len,c.depth]));
  out.resources=resources;
  // Two identical travel cycles may populate existing terrain/camp caches on
  // the first pass; the second must keep the allocated geometry count bounded.
  const cycles=[];
  for(let cycle=0;cycle<2;cycle++) {
    for(const c of [h.records[0],h.records[15],h.records[0]]) {
      W.teleport(c.x,c.z);W.rig.update(0,0,g,W.climber);
      for(let i=0;i<30;i++)W.terrain.update(W.camera.position,40);
      manager.update(W.camera);g.world.campVisuals.update(W.camera,true);W.renderer.render(W.scene,W.camera);
    }
    cycles.push(W.renderer.info.memory.geometries);
  }
  out.travelResources=cycles;out.travelBounded=cycles[0]===cycles[1];return out;
})();
