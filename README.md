# Everest · South Col Expedition

<p align="center">
  <img src="assets/ai-slop-badge.png" alt="This is a certified AI SLOP" width="480">
</p>

> **Certified AI slop.** This simulator was vibecoded by a large language model that has never been above sea level
> and believes "acclimatization" is an Italian appetizer. The Pléiades elevation model is real and
> serious; everything wrapped around it was hallucinated and shipped without a human checking
> whether the crevasses are load-bearing. The mountain is real. The code is vibecoded slop. If it kills you, that's a
> feature.

A browser mountaineering simulator of the Everest–Lhotse massif, built with Three.js (r160, loaded from the jsDelivr CDN).

The mountain is real. The climbing area uses the **4 m Pléiades DEM acquired on 23 March 2017**
([Berthier, 2022](https://doi.org/10.5281/zenodo.6979691)) at true scale: 15.4 × 11.5 km around the route,
plus 92 × 82 km of the surrounding Himalaya on the horizon. Copernicus GLO-30 fills gaps in the stereo data
and supplies the distant landscape. All three climbing routes are within Pléiades coverage.

The renderer keeps the native 4 m grid: it adds no procedural height noise or artificial ridge profile.
A narrow boot track, camp terraces and local summit caps support gameplay. Summit endpoints are located
from the new DEM and capped locally to their surveyed elevations.
Slip exposure retains its 30 m sampling span so resolved ice bumps do not change the meaning of face steepness.
Ladder fissures are fitted to the regenerated path to keep nearby bends clear of unprotected crossings.

The route follows the actual line of the South Col route:

1. Base Camp.
2. East-southeast up the Khumbu Icefall, with ladders over the crevasses.
3. Up the north side of the Western Cwm to Camps 1 and 2.
4. Up the Lhotse Face to Camp 3.
5. Left across the Yellow Band and over the Geneva Spur to the South Col (Camp 4).
6. The Triangular Face to the Balcony.
7. Along the Southeast Ridge over the South Summit, the cornice traverse and the Hillary Step to the summit.

The Lhotse branch turns right at the Yellow Band, goes to Lhotse Camp 4 and climbs the Reiss Couloir.

The **Nuptse branch** leaves Camp 2, crosses the Western Cwm and climbs the north face via Nuptse High Camp
(about 6,800 m) and the north rib to the main summit (7,861 m). Follow the **purple wands and fixed ropes**;
at Camp 2, press **E** and choose **Climb Nuptse**. Descending it returns to Camp 2.
The 2.67 km line is authored for gameplay using least-cost paths over the DEM. The Cwm approach and north rib
are inspired by [published ascent accounts](https://publications.americanalpineclub.org/articles/12200440702/Asia-Nepal-Malahangur-Asia-Nepal-Khumbu-Nuptse-North-Face-The-Crystal-Snake);
the path, fixed ropes and camp are not a surveyed climbing itinerary.

To win, stand on Everest (8,849 m), Lhotse (8,516 m) or Nuptse (7,861 m) and get back down to Camp 2 alive.
Everest and Lhotse together retain their bonus; all three summits earn an additional bonus. Older saves gain
Nuptse progress and high-camp stock while preserving the existing expedition.

## Free viewing

To look around, choose **Free viewing** on the title screen, or open the **Base Camp** menu (E) during an expedition.
You can teleport to any camp (Base Camp, Camps 1–4, Lhotse Camp 4), the Icefall, the Yellow Band, the Balcony, the
South Summit, the Hillary Step, Nuptse's north face, high camp and north rib, or any of the three summits.
Press **T** at any time to reopen the panel. It
also sets the time of day (sunrise, noon, sunset, night) and can force clear skies.

Survival systems are off in free viewing: no hypoxia, cold, falls or crevasses. Nothing is saved, so the expedition
you came from stays in your save. Continue it from the title screen. Summits visited in free viewing do not count.

**Exit free viewing — climb on from here** (in the T panel) turns survival systems back on where you stand. It starts
a fresh expedition from that spot, acclimatized as after the usual rotations (up to ~7,000 m), with oxygen on above
7,000 m. Your old save is kept until you next rest or save at a camp. The panel also sets a **walk speed** multiplier
(×1–×16) for getting around quickly; it is a debug aid and only applies in free viewing or with `?debug`.

<details><summary>Easter egg (spoiler)</summary>

Press **X** anywhere to strap on skis and ski down the mountain. Gravity pulls you down the fall line and your edges
hold you along the skis. Steer toward the way you want to go: **W** skates, **A**/**D** carve, **S** snowploughs to a
stop and **Shift** tucks. Press **X** again to take them off once you have slowed down. On a real expedition the
mountain still bites: take a crevasse too slowly and you drop in, hit a serac fast and it hurts, and above ~120 km/h
your skis may chatter loose. Skis are off-limits for fixed ropes and the route-following autopilot.
</details>

## The dead of the route (checkpoints)

Seven markers along the South Col route recall people who died there. Each is a **checkpoint**: on an expedition, reaching one
tells their story and saves your progress, unless you are too badly hurt (health 30 or less) to carry on from there. In free
viewing the story is told but nothing is saved. They appear as ◆ on the route map and as ⚑ in the debrief journal.

Only deaths with a documented place on or beside the route are included, and the positions are approximate: each marker is
placed by landmark or reported altitude. Where remains are still reported on the mountain, a shrouded figure lies off the trail.
Where a body was recovered, carried off by the wind or never found, the spot has a cairn and prayer flags instead.

| Marker | Where | Shown as |
|---|---|---|
| Base Camp avalanche, 25 April 2015 (earthquake avalanche off Pumori, at least 19 dead) | Base Camp | cairn |
| Icefall avalanche, 18 April 2014 (16 Nepali guides; 3 never recovered) | "Popcorn Field", Khumbu Icefall | cairn |
| Babu Chiri Sherpa, 29 April 2001 (crevasse fall; recovered) | near Camp 2 | cairn |
| Yasuko Namba, 11 May 1996 (brought down in 1997) | South Col | cairn |
| Hannelore Schmatz, 1979 (carried off by the wind years later) | ~8,300 m, Triangular Face | cairn |
| Scott Fischer, 11 May 1996 (shrouded and moved off the trail by Anatoli Boukreev) | near the Balcony, ~8,400 m | shrouded figure |
| Rob Hall, 11 May 1996 (reported to remain there) | South Summit | shrouded figure |

Sources: Wikipedia articles on the 1996 Mount Everest disaster, Scott Fischer, Rob Hall and the South Summit, Hannelore Schmatz,
Yasuko Namba, Babu Chiri Sherpa, and the 2014 and 2015 Mount Everest avalanches; the American Alpine Journal note on the death
of Babu Chiri; Explorersweb ("Looking Back: In 1979, the First Woman Dies on Everest"). Accounts differ on some details, such
as the 2015 death toll at Base Camp (19–24) and the present state of individual remains. The texts stick to what the sources agree on.

## Debrief

When the expedition ends — summit and descent to Camp 2, or death on the mountain — the end screen offers a
**Debrief**. It records altitude, SpO₂ and oxygen telemetry during the climb and shows:

- an altitude profile coloured by blood-oxygen level, with the death zone, camps, summits, slips and the point of
death marked, an oxygen strip along the bottom and a hover tooltip for any moment;
- verdicts on turnaround discipline, oxygen use in the death zone, hypoxia, acclimatization, frostbite and falls;
- a decision-by-decision journal of camps, rests, oxygen changes, bottle swaps and slips;
- the key numbers of the expedition and its score.

## Run

ES modules and the terrain files must be served over HTTP. Opening `index.html` from disk will not work.

```bash
npm install              # dev tools: http-server, three (for offline use), Playwright, ESLint
npm start                # serves the folder on http://localhost:8080
# or, without npm: python3 -m http.server 8080   (Windows: python -m http.server 8080)
```

Then open <http://localhost:8080>. By default Three.js r160 is loaded from the jsDelivr CDN. To work fully
offline, open <http://localhost:8080/?localthree> instead, which uses the copy installed in `node_modules`.

## Controls

| Key | Action |
| --- | --- |
| W A S D | Walk / climb |
| Mouse | Look (click the view to lock the pointer) |
| Shift | Climb faster (more stamina, oxygen and breathing load) |
| E | Enter a camp (rest, oxygen, forecast, save) · clip into, switch or unclip fixed ropes |
| F | Follow the marked route up or down (the way you face) with time ×4, stopping at camps. Any movement key takes back control |
| Shift+F | Same, without stopping at camps (e.g. all the way down from the summit to Camp 2… and on to Base Camp) |
| O | Oxygen on/off · 1–4 or `[` `]` flow in L/min |
| V | Third / first person · mouse wheel sets camera distance |
| M | Enlarge the route map |
| T | Free viewing only: teleport to a camp or summit, set the time of day, weather and walk speed, or exit and climb on from where you stand |
| Esc | Pause |

## Project layout

```
index.html            page shell and HUD markup
css/style.css
src/
  main.js             boot and main loop
  config.js           tuning constants (time scale, speeds, oxygen, slip angle…)
  input.js, audio.js
  core/               math helpers, seeded noise, event bus, spatial index
  world/
    geo.js            lat/lon ↔ world projection (origin = Everest summit), named peaks
    heightfield.js    loads the native 4 m terrain, levels the boot track and camp terraces,
                      preserves the measured surface for face slopes, adds rock shading masks
    terrain.js        chunked LOD terrain with skirts (core + backdrop)
    terrainMaterial.js  snow / blue ice / rock / Yellow Band / debris shading, detail normals, Earth curvature
    route.js          route model, camps, fixed ropes, landmarks, region names
    props.js          tents, wands, ropes, ladders & crevasses, seracs, Hillary Step, cornice, flags
    environment.js    sky, sun path, stars, headlamp, fog, snow
  sim/
    game.js           game state, progress, camps, save/load
    physiology.js     SpO₂, acclimatization, death zone, oxygen, frostbite, exhaustion
    player.js         movement, ropes, crevasses, slips & falls, route-following autopilot
    weather.js        jet stream, storms, summit windows, wind / temperature / visibility
    step.js           one simulation tick (also used by the tests)
    debrief.js        expedition telemetry and the end-of-climb analysis / verdicts
  render/             climber model, camera rig
  ui/                 HUD, route map, screens (title / pause / camp / death / win), toasts
    debrief.js        debrief screen: altitude / SpO₂ / oxygen chart, journal and stats
assets/
  terrain/core.png, backdrop.png, meta.json   heights as RGB (h = (R·256 + G) / 4 m), B = glacier mask
  route.json                                  generated route paths and waypoint tags
  ai-slop-badge.png                           badge above, vibecoded like the rest of it
tools/                Pléiades asset pipeline (Python), frozen Copernicus fallback, interpreter picker
tests/                Playwright harness + gameplay tests; tests/unit/ node:test suites
```

## Rebuilding the terrain and route

```bash
python -m pip install numpy scipy pillow pyproj
mkdir dem
curl -L --fail "https://zenodo.org/api/records/6979691/files/Khumbu_2017-03-23_DEM_4m.tif/content" -o dem/Khumbu_2017-03-23_DEM_4m.tif
curl -L --fail "https://cdn.proj.org/us_nga_egm08_25.tif" -o dem/us_nga_egm08_25.tif
npm run build-assets
# To regenerate only the Nuptse branch on the shipped Pléiades terrain:
npm run build-route:nuptse
```

`tools/run-python.mjs` picks whichever interpreter really works (`python3`, `python` or the Windows `py -3`
launcher). On Windows, `python3` is often only the Microsoft Store stub. Use `curl.exe` in Windows PowerShell
if `curl` is an alias. The source rasters are ignored by Git; they are not needed to run the already-built game.

`build_pleiades_assets.py` verifies the Zenodo file checksum, respects pixel-centre georeferencing and NoData,
converts the source heights to EGM2008 using the NGA geoid grid, and samples a native 4 m core. It blends into
the frozen original assets in `tools/terrain-fallback` over 40 m at data boundaries. The archived file is **4 m**,
even though the associated paper describes a 2 m version.

The input vertical CRS is unspecified in the archive. The pipeline explicitly interprets its heights as WGS84
ellipsoidal, consistent with Ames Stereo Pipeline output and the observed Everest height, and applies `H = h - N`.
This is an interpretation of the source, not an independent survey validation. Source checksums, the transformation,
fallback hashes, coverage and runtime settings are recorded in `assets/terrain/meta.json`.

Routes are generated by least-cost pathfinding on an 8 m planning surface; rendering still uses the 4 m terrain.
The summit ridge comes directly from the DEM rather than the old imposed profile. The Balcony is found near
8,400 m on that crest, and summit endpoints follow the finer terrain's local maxima.

The older Copernicus-only builder remains available as `npm run build-assets:copernicus`, requiring the four
GLO-30 tiles listed in `tools/build_assets.py` and Python packages `tifffile` and `imagecodecs`. It overwrites the
active assets, so use it only when deliberately restoring the legacy terrain.

## Tests and lint

```bash
npm run lint                   # ESLint (eslint.config.js)
npm run test:unit              # fast node:test suites: physiology, weather, route model, spatial index, saves
npm run test:terrain           # Python regressions: GeoTIFF alignment, NoData, geoid conversion, asset metadata
npm run verify:terrain         # with source files in dem/: verify encoded heights and complete route coverage
npm run test:e2e               # Playwright: hazards, UI, free viewing, skis, full Everest, Lhotse and Nuptse expeditions
npm test                       # unit + e2e
node tests/harness.mjs tests/hazards.json   # a single e2e suite
```

The e2e harness serves three.js from `node_modules` when it is installed (override with `THREE_DIR`), so it runs
offline. Software (SwiftShader) rendering makes screenshots slow, so each one may take up to `SHOT_TIMEOUT` ms
(default 120000). GitHub Actions runs lint, the unit and Python terrain tests, then the e2e suites, on every push and pull request
(`.github/workflows/ci.yml`).

The expedition tests climb the whole route with the game's own autopilot, camp rests and oxygen management, and
must end with a win. The debrief test kills the climber through the physiology system and checks that the debrief
screen, chart, verdicts, journal and stats all render. The hazard tests check three things:
- **Death zone:** without oxygen at 8,400 m you die (about 5–6 game hours), while 3 L/min keeps you alive.
- **Crevasses:** stepping into one kills you, and the ladder crossing works.
- **Ropes:** unclipped climbers slip on the Lhotse Face, and clipped ones don't.

Add `?debug` to the URL for test keys: `T`/`G` teleport between waypoints, `K` advances one hour, and `,`/`.`
lower/raise the walk speed (×0.25–×32). `window.__sim`
exposes a small API.

## Data

Etienne Berthier (2022), *Pléiades DEM of 23 March 2017 – Khumbu region, Nepal*,
[DOI 10.5281/zenodo.6979691](https://doi.org/10.5281/zenodo.6979691), licensed under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The game reprojects, converts heights, resamples and
blends the data; walking-surface edits and local summit caps are additional modifications.

NGA EGM2008 geoid grid, distributed by [PROJ](https://cdn.proj.org/us_nga_README.txt), public domain.

Copernicus GLO-30 DEM © DLR e.V. 2010–2014 and © Airbus Defence and Space GmbH 2014–2018, provided under COPERNICUS
by the European Union and ESA, distributed via the AWS Open Data registry.
