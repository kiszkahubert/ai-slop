// Check the terrain actually loaded by the browser, including the native walking surface.
const g = window.__sim.game, f = g.field, routes = g.routes;
const peak = (r) => { const p = r.pts.at(-1); return f.height(p.x, p.z); };
const junction = routes.main.point('yellowband'), branch = routes.lhotse.point('yellowband');
const sample = f.height(-7000, 3000), source = f.base.height(-7000, 3000);
return fetch('assets/terrain/meta.json').then((response) => response.json()).then((meta) => ({
  cell: f.cell, nodes: f.h.length, baseCell: f.base.cell,
  everest: peak(routes.main), lhotse: peak(routes.lhotse),
  measuredOffTrack: sample === source,
  balcony: f.height(routes.main.point('balcony').x, routes.main.point('balcony').z),
  connected: Math.hypot(junction.x - branch.x, junction.z - branch.z) < 0.01,
  source: meta.provenance.doi, proceduralDetail: f.proceduralDetail,
}));
