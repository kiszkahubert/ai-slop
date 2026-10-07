return (async()=>{
  const s=__sim,c=s.game.field,l=s.terrain.f,assert=(v,m)=>{if(!v)throw Error(m);};
  assert(c!==l&&s.rayTracing.field===l,'Gameplay and lighting must use their respective fields');
  assert(l.nx===4001&&l.nz===3081&&c.h.length===11065921,'Unexpected landscape dimensions');
  let mismatches=0;const oi=Math.round((c.x0-l.x0)/l.cell),oj=Math.round((c.z0-l.z0)/l.cell);
  for(let j=0;j<c.nz;j++)for(let i=0;i<c.nx;i++){
    const k=j*c.nx+i,p=(j+oj)*l.nx+i+oi;
    if(c.h[k]!==l.h[p]||c.glacier[k]!==l.glacier[p]||c.rock[k]!==l.rock[p])mismatches++;
  }
  assert(mismatches===0,'Landscape altered the climbing surface');
  const join=s.backdropTerrain.chunks.filter(ch=>ch.join);
  assert(join.length>0&&join.every(ch=>ch.level===0),'Backdrop boundary must stay native');
  assert(s.backdropTerrain.o.clipInside===l&&!s.backdropTerrain.o.hideInside,'Backdrop must be clipped, not depressed');
  const u=s.terrain.mat.userData.uniforms,disposed=[];
  for(const quality of ['high','low','medium']){
    const old=u.uRelief.value;let released=false;old.addEventListener('dispose',()=>{released=true;});
    s.setQuality(quality);assert(released&&u.uRelief.value!==old,'Quality switch retained obsolete relief');disposed.push(released);
    const rect=u.uReliefRect.value;assert(rect.x<c.x0&&rect.y<c.z0,'Quality switch reverted to core-only relief');
    await new Promise(r=>setTimeout(r,150));
  }
  return {pass:true,mismatches,nodes:l.h.length,joinedChunks:join.length,disposed,simulationNodes:c.h.length};
})();
