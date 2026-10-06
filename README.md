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
7. Along the Southeast Ridge over the South Summit and the Hillary Step to the summit.

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

Survival systems are off in free viewing: no hypoxia, cold, natural slips or crevasse deaths. Manual physics experiments
still move the body, with injuries and suffocation disabled. Nothing is saved, so the expedition
you came from stays in your save. Continue it from the title screen. Summits visited in free viewing do not count.

**Exit free viewing — climb on from here** (in the T panel) turns survival systems back on where you stand. It starts
a fresh expedition from that spot, acclimatized as after the usual rotations (up to ~7,000 m), with oxygen on above
7,000 m. Your old save is kept until you next rest or save at a camp. The panel also sets a **walk speed** multiplier
(×1–×16) for getting around quickly; it is a debug aid and only applies in free viewing or with `?debug`.

<details><summary>Easter egg (spoiler)</summary>

Press **X** anywhere to strap on skis and ski down the mountain. Gravity pulls you down the fall line and your edges
hold you along the skis. Steer toward the way you want to go: **W** skates, **A**/**D** carve, **S** snowploughs to a
stop and **Shift** tucks. Press **X** again to take them off once you have slowed down. On a real expedition the
mountain still bites: crevasse crossings follow airborne motion and landing contacts, hit a serac fast and it hurts, and above ~120 km/h
your skis may chatter loose. Skis are off-limits for fixed ropes and the route-following autopilot.

Press **B** to release a small slab on a suitable snow slope roughly 150 m uphill. The Lhotse Face near Camp 3
is a convenient place to try it. Dense snow follows the terrain, spreads, carries the climber and leaves temporary
debris; fragments and powder follow the simulated flow. Releases are manual and do not occur randomly.
In free viewing, **Shift+B** clears the experiment and restores your starting position; **J** starts a test fall.
The **T** panel includes buttons for these experiments.
</details>

## Falls and avalanches

Slips and ski crashes transfer the climber's momentum to an eleven-part articulated body. Contacts with the native
terrain and nearby seracs cause sliding, rolling and impacts; conscious climbers brace, while fatal impacts leave a
limp body that continues moving until it settles. The camera temporarily pulls back during a fall and restores your
chosen view after recovery. Walking off a crevasse edge transfers the current position and velocity into the same
gravity-driven simulation. Ice walls, ledges, closed floors, ladder rails and rungs have physical collisions.

Crevasse locations, lengths, widths and orientations retain their original seeded placements. The openings taper
and have restrained irregular edges. Their **12–35 m depths and occasional 2–6 m ledges are procedural**, not
measurements from the Pléiades DEM. Terrain triangles and boot tracks are cut around the openings; the original
elevation assets remain unchanged. Native-resolution collars preserve the holes at every terrain LOD.

Ladders provide approximately **0.6 m** of actual support. Walking along them is slower, with mild centring
assistance and no sprint; deliberate lateral movement can step off. Autopilot uses bank approach and exit waypoints
in both directions. Skis remain attached during a successful airborne crossing and come off when a tumble starts.
SPACE only brakes against reachable solid material; it cannot catch empty air inside a shaft.

Survivors who settle below the rim remain **Trapped**; an existing fixed-rope catch leaves them **Suspended**.
Their physical pose and normal expedition physiology persist. Neither state automatically rescues or kills them.
Saving, camp interactions and autopilot are unavailable until they reach supported ground; loading the last save
remains available from Escape. Snow bridges, climbing out, new rope elasticity and rescue mechanics are deferred.
Avalanche snow intercepted by an opening is counted as conservative outflow (`escaped`), rather than shaft fill.

Free viewing permits invulnerable physical drops. **Shift+B** returns to the last supported position and clears
the experiment; teleport clears an active fall or ski flight. Return to supported ground before leaving free viewing.
The v2 save format remains unchanged: transient fall states are excluded, and unsupported legacy save or teleport
coordinates are moved to a safe bank. Ladder positions remain valid.

The detailed climber retains its down suit, helmet, axe and oxygen equipment. A pose adapter maps the simulated
segment centres to its joint pivots, keeping equipment attached and the visible axe pick aligned with self-arrest.

Hold **Space** to self-arrest: the axe must reach the slope, the climber must be facing into it and stamina is consumed.
An early arrest works much better on snow than ice; it cannot stop an airborne body. Once stable, the climber blends
back into the walking pose. Clipped falls stay attached to the fixed rope through the harness.

Avalanches can cause impacts and burial during an expedition. Hold **Space** to dig out of shallow, settled burial
(up to 0.6 m of snow over the head). Deep burial immobilizes the climber. Air lasts three game minutes, then health
declines; the HUD shows depth and remaining air. Free viewing remains invulnerable and permits escape or reset.
Pause and camp menus stop simulation. Moving snow and falls block saving; stable v2 expedition saves remain compatible.
Debris and body state are temporary and cleared by loading or teleporting.

Body physics uses Rapier 0.21.0 at a fixed 120 Hz in physical seconds, independent of the accelerated expedition clock.
Snow uses a local 8 m, depth-averaged flow grid with conservative mass/momentum transport, slope gravity and Voellmy
friction (dry friction plus velocity-squared resistance), stepped at 30 Hz with adaptive CFL substeps.
This is a terrain-aware gameplay approximation, not a calibrated avalanche prediction model.

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

## Base Camp and the skyline

**Everest Base Camp** is the tent city of the climbing season. About fifty expedition compounds are spread over the
rubble-covered Khumbu Glacier, along the strip from the Icefall foot (the camp you rest at) to the published Base Camp
position (28.0072°N, 86.8594°E, 5,364 m). Each compound has colour-coded sleeping tents on stone platforms, a dining
dome or mess tent, a stone-walled kitchen under a tarp, a puja altar (lhap-so) strung with prayer flags, toilet tents,
solar panels and fuel barrels. At the trekkers' end (toward Gorak Shep) stands the painted "Everest Base Camp 5364m"
boulder, buried in prayer flags, with a helipad nearby. Compound sites are chosen from the terrain itself: gentle
glacier ground at base-camp altitude, away from the route.

The camps use shared, metre-scale expedition models: shaped sleeping-tent flys with crossing poles, clips, stitched
panels, zipped doors, vestibules and ground skirts; framed geodesic dining shelters and windowed ridge-roof mess
tents; supported tarp kitchens and toilet shelters. Equipment includes hooped drums with sealed lids, oxygen
cylinders with valves and gauges, latched cases, and framed solar-cell panels with stands and cables. Guy lines
are pegged to the actual ground. Shared fabric, paint, plastic, stone and solar textures are generated locally
with color, normal and roughness maps, without additional downloads. These are exterior visual models; camp
interactions, terrain, collision rules and saves are unchanged.

Camp detail follows **Low / Medium / High**: fabric textures are 256 / 512 / 1024 px (smaller equipment maps are
capped at 256–512 px), with fine geometry appearing within about 40 / 80 / 120 m of the camera. Simpler textured
models remain in the distance; a transition margin prevents repeated detail changes at the boundary. Repeated
parts share geometry and materials and are instanced in spatial batches. Quality changes release replaced maps.
For matching camp views and draw-call/triangle comparisons, run `node tools/capture-camps.mjs before medium`
before changes and `node tools/capture-camps.mjs after medium` afterward. Outputs go to `tests/out/`;
`CHROMIUM` can select a browser executable. CPU submission timings are diagnostic, not a hardware FPS benchmark.

**The walk to the Icefall** crosses debris-covered glacier: hummocks, troughs and melt ponds (added to the glacier
surface, which the elevation data shows too smooth here) and clusters of white ice towers that are solid like the
seracs. It ends at **Crampon Point**, where the fixed lines into the Icefall begin. The trail itself, the camp
terraces and the slip-risk surface are unchanged.

**Name tags on the skyline**: every real summit in view carries a tag on its rendered top (snapped to the highest
point of the terrain near its surveyed position, and lowered with the Earth's curvature like the terrain):
Pumori, Lingtren, Khumbutse, Changtse, Kala Patthar, Lhotse Shar, Lobuche East, Cholatse, Taboche, Ama Dablam,
Island Peak, Baruntse, Makalu, Chomo Lonzo, Kangtega, Thamserku, Cho Oyu and Gyachung Kang (plus the route's own
Everest, Lhotse and Nuptse). The peak list is in `src/world/geo.js`.

## Graphics

Choose **Low**, **Medium** or **High** under *Graphics* on the title or pause screen (or add `?quality=low|medium|high` to
the URL). The choice applies immediately, is remembered by the browser, and never touches the simulation: the HUD,
oxygen, route map, compass, camera and controls behave exactly the same at every setting.

| | Low | Medium | High |
|---|---|---|---|
| Terrain textures | 256 px | 512 px, anti-tiling, micro detail | 1024 px, exact gradients (hardware anisotropic filtering) |
| Relief normals / terrain AO | 32 m / 64 m | 16 m / 32 m | 8 m / 16 m |
| Mountain shadows | off | on | on |
| Sun shadow map | 1024², ±40 m | 2048², ±55 m | 4096², ±70 m |
| Post-processing | none (direct ACES) | bloom, vignette, MSAA | + SSAO, + depth of field in free viewing |
| Mist layers, snow particles | off, 1,500 | on, 3,500 | on, 6,000 |

What the renderer does:
- **Terrain**: four procedural layers (dark layered rock, snow with wind-carved sastrugi, ice/firn, moraine gravel),
  each with albedo, normal, roughness and AO, generated at load (no texture files). They are sampled with triplanar
  mapping, so steep faces don't stretch, and blended by altitude, slope and the glacier/rock masks. Every layer is
  sampled at two scales mixed by low-frequency noise (no visible tiling), with micro normals up close. A Sobel normal
  map and horizon AO baked from the elevation model keep distant relief crisp. Snow glints in the sun and glows
  faintly blue in shadow.
- **Light**: the mountains cast real shadows on each other (ray-marched toward the sun a few rows per frame), the
  sun's shadow map is snapped to its texel grid so near shadows stay sharp and never shimmer, and exposure adapts
  when you stand in shadow.
- **Atmosphere**: fog depends on distance *and* altitude, so valleys are hazier than summits and far ranges turn
  blue. Horizontal visibility still matches the HUD. Valley mist banks drift with the wind, and wind-blown snow and
  spindrift streaks scale with the wind shown on the HUD.
- **Climber**: built from rounded shapes on a joint hierarchy: quilted red down suit, harness with carabiners and
  the rope tied in, crampons on tall boots, a pack with the oxygen cylinder, regulator, hose and mask (shown while
  oxygen is on), mirrored goggles, a helmet with the logo decal, and a real ice axe. Animations: walking, a cane axe
  on easy ground, planting it on steep ground, careful steps on ladders, breathing that quickens with hypoxia,
  falls and the skiing stance.

**The helmet logo** is the decal texture `assets/redbull-logo.png` (path: `VISUALS.helmetLogoUrl` in
`src/config.js`). The file in the repo is a neutral "LOGO" stand-in; replace it with your transparent PNG
(about 2:1). If the file is missing, a drawn placeholder is used.

**Tuning** (`VISUALS` in `src/config.js`, no effect on gameplay):
- `terrain.textureTileM` / `microTileM`: texture scale in metres; `normalStrength`, `microNormalStrength`: bumpiness;
  `reliefNormalFade`: where the baked relief normals take over; `aoStrength`; `snowSparkle`; `snowSubsurface`;
  `sastrugiAngleDeg`: prevailing wind that carves the snow.
- `fog.heightFalloff`: how fast haze thins with altitude (0 = plain distance fog); `fog.aerialTint`, `aerialStrength`:
  the blue of distant ranges.
- `post.bloomStrength`, `bloomRadius`, `bloomThreshold`, `vignette`, `aoRadius`, `aoIntensity`, `aoMaxDistance`,
  `dofFocusRange`, `dofMaxBlur`.
- `mist.opacity`, `mist.altitudes`.
- The presets themselves are in `src/render/quality.js`.

## Run

ES modules and the terrain files must be served over HTTP. Opening `index.html` from disk will not work.

```bash
npm install              # Rapier physics + dev tools: http-server, Three.js, Playwright, ESLint
npm start                # serves the folder on http://localhost:8000
npm start -- 3000        # on another port (or PORT=3000 npm start)
# or, without npm: python3 -m http.server 8000   (Windows: python -m http.server 8000)
```

Then open <http://localhost:8000>. By default Three.js r160 and Rapier 0.21.0 are loaded from the jsDelivr CDN. To work fully
offline, open <http://localhost:8000/?localthree> instead, which uses the copy installed in `node_modules`.

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
| Space | Hold during a fall to self-arrest, or dig out of shallow avalanche burial |
| B | Release an avalanche on a suitable uphill snow slope (easter egg) |
| J / Shift+B | Free viewing or debug: test fall / reset physics experiment |
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
    terrainMaterial.js  triplanar rock / snow / ice / moraine layers, Yellow Band, relief normals, snow sparkle,
                      mountain shadows, Earth curvature
    route.js          route model, camps, fixed ropes, landmarks, region names
    props.js          tents, wands, ropes, ladders & crevasses, seracs, Hillary Step, flags, peak name tags
    baseCamp.js       Base Camp tent city, glacier relief, ice towers, melt ponds, Crampon Point
    environment.js    sky, sun path, stars, headlamp, fog, valley mist, wind-blown snow, eye adaptation
  sim/
    game.js           game state, progress, camps, save/load
    physiology.js     SpO₂, acclimatization, death zone, oxygen, frostbite, exhaustion
    player.js         movement, ropes, crevasses, slips & falls, route-following autopilot
    body.js, physics.js articulated body, streamed terrain contacts, rope tether, arrest, impact and burial
    avalanche.js      seeded dense-flow snow simulation and release search
    surface.js        temporary snow-deposit walking surface
    weather.js        jet stream, storms, summit windows, wind / temperature / visibility
    step.js           one simulation tick (also used by the tests)
    debrief.js        expedition telemetry and the end-of-climb analysis / verdicts
  render/
    climber.js        detailed articulated rig, down suit, equipment, walking / physics / recovery poses
    bodyPose.js       world-space physical segment centres to detailed joint pivots; recovery blending
    avalanche.js      simulated snow surface, fragments and powder
    helmet.js         helmet shell, vents, chin strap and the logo decals
    iceAxe.js         ice axe: curved shaft, toothed pick, adze, spike, grip, leash
    camera.js         third / first person camera rig
    quality.js        Low / Medium / High presets
    proceduralTextures.js  generated terrain layers (albedo, normal, roughness, AO), jacket quilting, logo stand-in
    terrainMaps.js    relief normals + horizon AO from the elevation model; the mountains' sun shadows
    lighting.js       sun with stable soft shadows, sky light, moon, headlamp
    atmosphere.js     height + distance fog with aerial perspective, mist layers, snow particles
    postfx.js         SSAO, depth of field, bloom, vignette, ACES tone mapping and sRGB output
    shared.js         uniforms shared by all materials; the mountain-shadow material patch
  ui/                 HUD, route map, screens (title / pause / camp / death / win), toasts
    debrief.js        debrief screen: altitude / SpO₂ / oxygen chart, journal and stats
assets/
  terrain/core.png, backdrop.png, meta.json   heights as RGB (h = (R·256 + G) / 4 m), B = glacier mask
  route.json                                  generated route paths and waypoint tags
  ai-slop-badge.png                           badge above, vibecoded like the rest of it
  redbull-logo.png                            helmet logo decal (a "LOGO" stand-in: replace with your own PNG)
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
npm run test:unit              # node:test: falls, flow, burial, physiology, routes, spatial index, saves
npm run test:terrain           # Python regressions: GeoTIFF alignment, NoData, geoid conversion, asset metadata
npm run verify:terrain         # with source files in dem/: verify encoded heights and complete route coverage
npm run test:e2e               # Playwright: graphics / GPU overflow, physics, hazards, UI, skis, all three expeditions
npm test                       # unit + e2e
node tests/harness.mjs tests/hazards.json   # a single e2e suite
```

The e2e harness serves Three.js and Rapier from `node_modules` (override Three.js with `THREE_DIR`), so it runs
offline. Software (SwiftShader) rendering makes screenshots slow, so each one may take up to `SHOT_TIMEOUT` ms
(default 120000). There is no CI: run `npm run lint` and `npm test` before pushing.

The expedition tests climb the whole route with the game's own autopilot, camp rests and oxygen management, and
must end with a win. The hazard tests check three things:
- **Death zone:** without oxygen at 8,400 m you die (about 5–6 game hours), while 3 L/min keeps you alive.
- **Crevasses:** stepping into one starts a physical fall; impacts determine the outcome, and ladder crossings work.
- **Ropes:** unclipped climbers slip on the Lhotse Face, and clipped ones don't.

Add `?debug` to the URL for test keys: `T`/`G` teleport between waypoints, `K` advances one hour, and `,`/`.`
lower/raise the walk speed (×0.25–×32). `window.__sim`
exposes a small API.
`triggerAvalanche({seed, source})`, `forceFall({velocity, heightOffset})`, `stepPhysics(dt, {arrest})` and
`resetPhysics()` support reproducible physics experiments. `VIDEO=1` records an e2e suite under `tests/out/`.
`crevasseAt(x,z)` returns a stable crevasse ID; `querySupport(position,maxDrop)` returns the actual surface height,
normal and kind, or null for air. `game.P.falling` exposes `crevasseId` and `phase` for reproducible inspection.
`node tools/capture-crevasses.mjs after medium` captures rim, ladder, shaft, daylight, headlamp and distant views
with render-work counters. Repeat with `low` and `high`; images and metrics are written to ignored `tests/out/`.

## Data

Etienne Berthier (2022), *Pléiades DEM of 23 March 2017 – Khumbu region, Nepal*,
[DOI 10.5281/zenodo.6979691](https://doi.org/10.5281/zenodo.6979691), licensed under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The game reprojects, converts heights, resamples and
blends the data; walking-surface edits and local summit caps are additional modifications.

NGA EGM2008 geoid grid, distributed by [PROJ](https://cdn.proj.org/us_nga_README.txt), public domain.

Copernicus GLO-30 DEM © DLR e.V. 2010–2014 and © Airbus Defence and Space GmbH 2014–2018, provided under COPERNICUS
by the European Union and ESA, distributed via the AWS Open Data registry.
