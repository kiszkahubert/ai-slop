// The dead of the South Col route, as checkpoints. Only deaths with a documented place on or beside the route
// are included; positions are approximate (placed along the route by landmark or reported altitude).
// Where a body is still reported on the mountain it is shown as a shrouded figure off the trail; where it was
// recovered, carried away or never found, the spot carries a cairn and prayer flags instead.
// Sources: published accounts of each death (see the README); counts follow the most widely reported figures.

/**
 * at: where along a route — { route, tag, offset } (metres along the route from a tag), or { route, elevation, after }
 * (the first point at or above that altitude past a tag). side: metres off the trail (+ to the right going uphill).
 * kind: 'body' (remains reported in place) | 'memorial'.
 */
export const MEMORIALS = [
  {
    id: 'ebc2015', kind: 'memorial', title: 'Base Camp avalanche, 2015', at: { route: 'main', tag: 'ebc', offset: 70 }, side: 30,
    text: '25 April 2015: the Gorkha earthquake shook an avalanche off Pumori that tore through Base Camp. At least 19 people '
      + 'died here, the deadliest day in the history of Everest.',
  },
  {
    id: 'icefall2014', kind: 'memorial', title: 'Icefall avalanche, 2014', at: { route: 'main', tag: 'icefall_mid', offset: -150 }, side: 9,
    text: '18 April 2014, 06:45: an ice avalanche swept the "Popcorn Field" of the Icefall and killed sixteen Nepali guides '
      + 'carrying loads for the expeditions above. Thirteen were recovered; three were never found and lie in the ice.',
  },
  {
    id: 'babuchiri', kind: 'memorial', title: 'Babu Chiri Sherpa', at: { route: 'main', tag: 'c2', offset: 35 }, side: -26,
    text: 'Babu Chiri Sherpa: ten times on the summit, 21 hours on top without bottled oxygen in 1999, and a 16 h 56 min '
      + 'ascent from Base Camp in 2000. On 29 April 2001 he fell into a crevasse near Camp 2; he was recovered the next morning.',
  },
  {
    id: 'namba', kind: 'memorial', title: 'Yasuko Namba', at: { route: 'main', tag: 'c4', offset: 45 }, side: 22,
    text: 'Yasuko Namba, Japan: at 47 the oldest woman then to have climbed Everest, on 10 May 1996. Caught in the storm on '
      + 'the descent, she died on the South Col within a few hundred metres of the tents. She was brought down in 1997.',
  },
  {
    id: 'schmatz', kind: 'memorial', title: 'Hannelore Schmatz', at: { route: 'main', elevation: 8300, after: 'c4' }, side: 6,
    text: 'Hannelore Schmatz, Germany: the fourth woman to summit Everest, in 1979. Benighted on the descent at about '
      + '8,300 m, she sat down against her pack and died, the first woman to die high on Everest. For two decades '
      + 'climbers passed her here, until the wind carried her down the Kangshung Face.',
  },
  {
    id: 'fischer', kind: 'body', title: 'Scott Fischer', at: { route: 'main', tag: 'balcony', offset: 40 }, side: 9,
    text: 'Scott Fischer, USA, leader of Mountain Madness. He collapsed near the Balcony at about 8,400 m on the descent in '
      + 'the storm of 10 May 1996. Anatoli Boukreev later shrouded him and moved him off the trail, with his family\'s blessing.',
  },
  {
    id: 'hall', kind: 'body', title: 'Rob Hall', at: { route: 'main', tag: 'southsummit', offset: 8 }, side: 5,
    text: 'Rob Hall, New Zealand, leader of Adventure Consultants. He stayed high with his client Doug Hansen as the 10 May '
      + '1996 storm hit, survived the night at the South Summit and spoke to his wife Jan Arnold by radio and satellite '
      + 'phone before he died on 11 May. His body remains near the South Summit; Hansen and guide Andy Harris were never found.',
  },
];

/** World positions for the memorials on the given routes and terrain. */
export function placeMemorials(routes, field) {
  const out = [];
  for (const m of MEMORIALS) {
    const route = routes[m.at.route];
    if (!route) continue;
    let s;
    if (m.at.elevation !== undefined) {
      const s0 = m.at.after ? route.s(m.at.after) : 0;
      s = route.L;
      for (let q = s0; q < route.L; q += 2) { const p = route.at(q); if (field.height(p.x, p.z) >= m.at.elevation) { s = q; break; } }
    } else s = route.s(m.at.tag) + (m.at.offset || 0);
    const p = route.at(s), x = p.x - p.dz * m.side, z = p.z + p.dx * m.side;
    out.push({ ...m, s, x, z, y: field.height(x, z), heading: Math.atan2(-p.dx, -p.dz) });
  }
  return out;
}

export const CHECKPOINT_RADIUS = 25;
