// Headless check for the post-expedition debrief screen: die of hypoxia near the Balcony,
// open the debrief, and verify the chart, verdicts, journal and stats rendered.
// (wrapped in an async function so the file also parses for ESLint: the harness awaits the result)
return (async () => {
  const W = window.__sim, g = W.game, R = g.routes.main;
  W.teleport(R.point('balcony').x, R.point('balcony').z);
  g.S.tanks = []; g.S.o2on = false; g.S.health = 14; g.S.spo2 = 55; g.S.accl = 5200;
  let t = 0;
  while (t < 300 && g.mode === 'play') { W.simStep(0.5, { dx: 0, dz: 0 }); t += 0.5; }
  const died = g.mode === 'dead';
  await new Promise((r) => setTimeout(r, 1100));           // showDeath waits 700 ms
  document.getElementById('btnDeadDebrief').click();
  await new Promise((r) => setTimeout(r, 250));
  const cv = document.getElementById('dbChart'), px = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
  const base = [px[0], px[1], px[2]];
  let drawn = false;
  for (let i = 0; i < px.length; i += 388) {
    if (px[i] !== base[0] || px[i + 1] !== base[1] || px[i + 2] !== base[2]) { drawn = true; break; }
  }
  const r = {
    died,
    screenVisible: !document.getElementById('scrDebrief').classList.contains('hidden'),
    verdicts: document.querySelectorAll('#dbVerdict .vd').length,
    journal: document.querySelectorAll('#dbJournal .evt').length,
    stats: document.querySelectorAll('#dbStats .stat').length,
    chartDrawn: drawn,
    title: document.getElementById('dbTitle').textContent,
    subtitle: document.getElementById('dbSub').textContent.slice(0, 60),
  };
  r.ok = died && r.screenVisible && r.verdicts >= 1 && r.journal >= 3 && r.stats >= 8 && r.chartDrawn;
  return r;
})();
