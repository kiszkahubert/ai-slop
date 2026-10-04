# Everest · South Col Expedition

<p align="center">
  <img src="assets/ai-slop-badge.png" alt="This is a certified AI SLOP" width="480">
</p>

> **Certified AI slop.** This simulator was vibecoded by a large language model that has never been above sea level
> and believes "acclimatization" is an Italian appetizer. The Copernicus elevation model is real, surveyed and
> serious; everything wrapped around it was hallucinated and shipped without a human checking
> whether the crevasses are load-bearing. The mountain is real. The code is vibecoded slop. If it kills you, that's a
> feature.

A browser mountaineering simulator of the Everest–Lhotse massif, built with Three.js (r160, loaded from the jsDelivr CDN).

The mountain is real. The terrain is the **Copernicus GLO-30** elevation model at true scale: 15.4 × 11.5 km around
the route, plus 92 × 82 km of the surrounding Himalaya on the horizon. Summit elevations are corrected to their
surveyed values.

The route follows the actual line of the South Col route:

1. Base Camp.
2. East-southeast up the Khumbu Icefall, with ladders over the crevasses.
3. Up the north side of the Western Cwm to Camps 1 and 2.
4. Up the Lhotse Face to Camp 3.
5. Left across the Yellow Band and over the Geneva Spur to the South Col (Camp 4).
6. The Triangular Face to the Balcony.
7. Along the Southeast Ridge over the South Summit, the cornice traverse and the Hillary Step to the summit.

The Lhotse branch turns right at the Yellow Band, goes to Lhotse Camp 4 and climbs the Reiss Couloir.

To win, stand on Everest (8,849 m) or Lhotse (8,516 m) and get back down to Camp 2 alive. Doing both earns a bonus.

## Free viewing

To look around, choose **Free viewing** on the title screen, or open the **Base Camp** menu (E) during an expedition.
You can teleport to any camp (Base Camp, Camps 1–4, Lhotse Camp 4), the Icefall, the Yellow Band, the Balcony, the
South Summit, the Hillary Step, or the summits of Everest and Lhotse. Press **T** at any time to reopen the panel. It
also sets the time of day (sunrise, noon, sunset, night) and can force clear skies.

Survival systems are off in free viewing: no hypoxia, cold, falls or crevasses. Nothing is saved, so the expedition
you came from stays in your save. Continue it from the title screen. Summits visited in free viewing do not count.

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
| T | Free viewing only: teleport to a camp or summit, set the time of day and weather |
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
    heightfield.js    loads the DEM tiles, refines 15 m → 7.5 m, levels the boot track, camp terraces,
                      couloir walls / Geneva Spur rock mask
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
  render/             climber model, camera rig
  ui/                 HUD, route map, screens (title / pause / camp / death / win), toasts
assets/
  terrain/core.png, backdrop.png, meta.json   heights as RGB (h = (R·256 + G) / 4 m), B = glacier mask
  route.json                                  generated route paths and waypoint tags
  ai-slop-badge.png                           badge above, vibecoded like the rest of it
tools/                asset pipeline (Python) + run-python.mjs (cross-platform interpreter picker)
tests/                Playwright harness + gameplay tests; tests/unit/ node:test suites
```

## Rebuilding the terrain and route

```bash
pip install numpy scipy tifffile imagecodecs pillow
mkdir dem && cd dem
for t in N27_00_E086_00 N28_00_E086_00 N27_00_E087_00 N28_00_E087_00; do
  curl -O "https://copernicus-dem-30m.s3.amazonaws.com/Copernicus_DSM_COG_10_${t}_DEM/Copernicus_DSM_COG_10_${t}_DEM.tif"
  mv "Copernicus_DSM_COG_10_${t}_DEM.tif" "${t}.tif"
done
cd .. && npm run build-assets          # = node tools/run-python.mjs tools/build_assets.py --dem ./dem
```

`tools/run-python.mjs` picks whichever interpreter really works (`python3`, `python` or the Windows `py -3`
launcher). On Windows, `python3` is often only the Microsoft Store stub. On Windows, use PowerShell's
`Invoke-WebRequest` or Git Bash for the download loop above, and `python -m pip install …` for the dependencies.

`build_assets.py` samples the DEM onto the game grids and restores the summit elevations. It raises only the upper
part of each mountain, so the DEM's ridges stay intact. It also traces the Southeast Ridge crest and gives it the
true South Summit, Hillary Step and summit profile. Finally it generates the route by least-cost pathfinding over the
real slopes between surveyed waypoints.

## Tests and lint

```bash
npm run lint                   # ESLint (eslint.config.js)
npm run test:unit              # fast node:test suites: physiology, weather, route model, spatial index, saves
npm run test:e2e               # Playwright: hazards, UI flows, free viewing, full Everest and Lhotse expeditions
npm test                       # unit + e2e
node tests/harness.mjs tests/hazards.json   # a single e2e suite
```

The e2e harness serves three.js from `node_modules` when it is installed (override with `THREE_DIR`), so it runs
offline. Software (SwiftShader) rendering makes screenshots slow, so each one may take up to `SHOT_TIMEOUT` ms
(default 120000). GitHub Actions runs lint and the unit tests, then the e2e suites, on every push and pull request
(`.github/workflows/ci.yml`).

The expedition tests climb the whole route with the game's own autopilot, camp rests and oxygen management, and
must end with a win. The hazard tests check three things:
- **Death zone:** without oxygen at 8,400 m you die (about 5–6 game hours), while 3 L/min keeps you alive.
- **Crevasses:** stepping into one kills you, and the ladder crossing works.
- **Ropes:** unclipped climbers slip on the Lhotse Face, and clipped ones don't.

Add `?debug` to the URL for test keys: `T`/`G` teleport between waypoints and `K` advances one hour. `window.__sim`
exposes a small API.

## Data

Copernicus GLO-30 DEM © DLR e.V. 2010–2014 and © Airbus Defence and Space GmbH 2014–2018, provided under COPERNICUS
by the European Union and ESA, distributed via the AWS Open Data registry.
