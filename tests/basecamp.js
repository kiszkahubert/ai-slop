// Base Camp: a tent city of expedition compounds, ice towers on the walk to Crampon Point (never on the trail),
// name tags on the real summits around, and the route still walkable from camp up past Crampon Point.
// (wrapped in an async function so the file also parses for ESLint: the harness awaits the result)
return (async () => {
  const W = window.__sim, g = W.game, m = g.routes.main, out = {};
  out.camp = g.world.baseCamp;
  const tags = g.world.labels.filter((l) => l.userData.curve);
  out.peakTags = tags.length;
  out.crampon = g.world.labels.some((l) => l.userData.range === 900);
  // no ice tower within reach of the trail
  let blocked = 0;
  for (const list of g.world.seracGrid.values()) for (const s of list) {
    const n = m.nearestWithin(s.x, s.z, 60);
    if (n && n.s < m.s('ebc') + 360 && n.d < s.r + 2) blocked++;
  }
  out.towersOnTrail = blocked;
  // follow the route up from Base Camp, past Crampon Point
  W.teleport(m.at(m.s('ebc') + 20).x, m.at(m.s('ebc') + 20).z);
  const a = m.at(m.s('ebc') + 60), b = m.at(m.s('ebc') + 61);
  g.view.yaw = Math.atan2(-(b.x - a.x), -(b.z - a.z));
  W.startAutopilot({ nonstop: true });
  let t = 0;
  while (t < 900 && g.mode === 'play' && (m.nearestWithin(g.P.x, g.P.z, 80)?.s || 0) < m.s('ebc') + 330) { W.simStep(0.1, null); t += 0.1; }
  out.reached = Math.round(m.nearestWithin(g.P.x, g.P.z, 80)?.s || 0);
  out.target = Math.round(m.s('ebc') + 330);
  out.mode = g.mode;
  return out;
})();
