return (async()=>{
  const W=window.__sim,g=W.game,out={};W.rig.free=null;W.resetPhysics();g.mode='play';
  const key=(code,shiftKey=false)=>{window.dispatchEvent(new KeyboardEvent('keydown',{code,shiftKey}));window.dispatchEvent(new KeyboardEvent('keyup',{code,shiftKey}));};
  const wait=()=>new Promise((resolve)=>setTimeout(resolve,300));
  const start={x:g.P.x,z:g.P.z};
  key('KeyJ');out.manualFall=!!g.P.falling&&g.physics.parts.size===11;
  key('Escape');const fallTime=g.P.falling.t;await wait();
  out.fallPaused=g.mode==='paused'&&g.P.falling.t===fallTime;
  document.getElementById('btnResume').click();key('KeyB',true);
  out.resetFall=!g.P.falling&&Math.hypot(g.P.x-start.x,g.P.z-start.z)<.01;
  key('KeyB');const A=g.physics.avalanche;
  key('Escape');const snowTime=A.t;await wait();
  out.snowPaused=g.mode==='paused'&&A.t===snowTime;
  document.getElementById('btnResume').click();key('KeyB',true);
  out.resetSnow=!g.physics.avalanche;
  key('KeyT');document.querySelector('[data-act="test-fall"]').click();
  out.menuFall=g.mode==='play'&&!!g.P.falling;
  key('KeyB',true);return out;
})();
