return (async()=>{
  const s=__sim,g=s.game,assert=(v,m)=>{if(!v)throw Error(m);};
  const {loadTerrainRock}=await import('/src/render/terrainAssets.js');
  const {groundHeight}=await import('/src/sim/surface.js');
  const rock=await loadTerrainRock();assert(rock?.albedo.width===1024&&rock?.surface.width===1024,'Bundled PBR maps failed to decode');
  const footprints=g.world.routeWear.meshes.reduce((sum,o)=>sum+o.count,0);let flags=0;s.scene.traverse(o=>{
    if(o.userData.rtDynamic&&o.customDepthMaterial){flags++;assert(o.castShadow,'Flag lost contact shadows');}
  });
  assert(footprints>100&&flags>3,'Route wear or animated flags missing');
  const shelves=g.world.routeFeatures.records;assert(shelves.length>5,'Local ridge features missing');
  const r=shelves[0];s.teleport(r.x,r.z);assert(Math.abs(g.P.y-groundHeight(g,r.x,r.z))<.002,'Teleport ignored the shelf');
  g.P.moving=false;s.climber.update(1,g.P,g.S,g.physics);s.climber.group.updateMatrixWorld(true);
  const THREE=await import('three'),feet=[];
  s.climber.group.traverse(o=>{if(o.name==='climber-boot-sole'){
    const p=o.getWorldPosition(new THREE.Vector3());feet.push(p.y-groundHeight(g,p.x,p.z));
  }});
  assert(feet.length===2&&feet.every(h=>Math.abs(h)<.08),'Standing boots do not meet the shelf');
  const mist=s.env.mist,b=mist.banks[0];assert(b&&mist.layers.length===mist.banks.length,'Cloud banks missing');
  const density=mist.localDensity({x:b.x,y:b.y,z:b.z});assert(density>.9,'No fog inside cloud');
  assert(mist.localDensity({x:b.x,y:b.y+b.thickness*2,z:b.z})===0,'Cloud has no vertical boundary');
  const counts=[];
  for(const quality of ['low','high','medium']){
    s.setQuality(quality);await new Promise(requestAnimationFrame);
    assert(mist.enabled===(quality!=='low'),'Mist quality switch failed');
    assert(g.world.routeFeatures.records===shelves,'Quality switch changed support geometry');
    counts.push({quality,texture:s.terrain.mat.userData.uniforms.uAlbedo.value.image.width});
  }
  return {pass:true,footprints,flags,shelves:shelves.length,banks:mist.banks.length,feet,counts};
})();
