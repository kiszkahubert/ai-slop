return (async () => {
  const deadline = performance.now()+180000;
  while (!window.__sim || __sim.game.mode !== 'title') {
    if (performance.now() > deadline) throw Error('Full-resolution reload did not finish');
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  const s = __sim;
  if (s.quality !== 'verylow' || !s.veryLowFullResolution) throw Error('Reload lost the full-resolution preference');
  if (s.renderer.getPixelRatio() !== devicePixelRatio || s.postfx.q.adaptiveResolution) throw Error('Reload booted with resolution reduction');
  for (const box of document.querySelectorAll('[data-very-low-full-resolution]')) {
    if (!box.checked) throw Error('Reloaded checkbox lost the preference');
  }
  document.querySelector('#scrTitle [data-very-low-full-resolution]').click();
  if (s.veryLowFullResolution || s.renderer.domElement.width > 960 || s.renderer.domElement.height > 540) throw Error('Reduced resolution failed after reload');
  return {ok:true,reloaded:true};
})();
