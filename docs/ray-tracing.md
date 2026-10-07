# Hybrid ray-traced lighting

The forward WebGLRenderer still handles geometry, materials, transparent effects, fog, bloom and tone mapping.
The optional lighting service replaces ambient diffuse and static sun visibility on opaque static receivers.
The simulation, height assets and display LODs are unchanged. The feature is off by default and has a separate
remembered preference. Low suspends updates without clearing that preference.

## Geometry and lighting

- Both terrain fields have their native heights and conservative min/max hierarchies on the GPU. The worker
  builds the hierarchies. Rays descend into native triangles only when the bounds overlap. Traversal exhaustion
  preserves existing lighting rather than counting as an unobstructed ray. Backdrop traversal excludes the
  whole core interval, allowing an overlapping near surface to coexist with farther mountain occlusion.
- Progressive landscape caches use 32 m sun visibility / 64 m irradiance samples in the core and 320 m / 512 m
  in the backdrop. Scissored tiles alternate between both fields and prioritize the camera's neighborhood.
  Each update samples a 0.53-degree sun disk, a cosine-weighted diffuse direction and secondary sunlight.
  The irradiance cache includes a bent direction for approximate orientation adjustment, rather than full
  directional spherical harmonics. Distant transport is limited to 2 km for the diffuse bounce and 100 km for sun rays.
- A worker builds a 1024 m static region around an anchor snapped to 128 m. It contains native terrain with
  the same carved apertures, complete cavity walls/floors, canonical detailed camp parts and guy lines,
  and transformed static instances. Display skirts and display LOD transitions are absent from this structure.
  Stale jobs are discarded. Shared vertices are welded while retaining color and UV seams; material attributes
  use half-float GPU textures. Positions and surface capture retain 32-bit precision relative to the anchor.
- Nearby static receivers trace sun rays to 256 m and a diffuse bounce to 128 m. Coverage fades between 80 m
  and 120 m. Terrain secondary hits reuse the authored rock/snow/ice/moraine blend with explicit ray footprints;
  props use their color maps, instance colors and diffuse metalness weights. The diffuse estimator combines
  skylight with secondary sun visibility; it is a practical one-bounce approximation, not a full path tracer.
- The surface pass renders the existing materials' shading normals into a second attachment, with a packed
  geometric normal for ray bias and hemisphere sampling. Normal-map bumps therefore cannot push rays below
  the physical surface and falsely shadow it. Moving opaque geometry
  masks static lighting, and a separate dynamic-only depth map retains climber/fragment shadows. Transparent
  effects remain in the existing forward passes. Stock shadow maps remain outside detailed local coverage.
- Temporal history validates world position and normal, clamps traced samples to the current neighborhood,
  and applies three edge-aware spatial passes. Camera teleports, size/quality changes, region swaps and major
  sun/weather changes invalidate history. Covered terrain replaces its baked horizon AO and blue ambient snow
  term; nearby covered pixels suppress SSAO. Small material/cavity detail remains.

## Stability, strength and debug views

- The landscape caches are running averages of the last 8 updates per texel. They follow the sun as it moves
  and are never thrown away for ordinary sun or sky motion. Only a discontinuity starts them again: a time jump
  of more than an hour (resting at camp) or the sun jumping ~6° between frames (choosing a time of day). Earlier
  versions reset all caches for every ~1° of sun movement, every few seconds of play. The traced lighting then
  dropped out and faded back in, which read as flicker.
- Temporal accumulation keeps 90% history, clamped to the current neighbourhood's mean ± 1.25σ. A min/max
  clamp would discard history with one noisy sample per pixel. Near-camera results are matched to
  full-resolution pixels with tolerances that suit the lower lighting resolution. Strict tests rejected whole
  rows on bumpy ground and caused crawling stripes.
- **Strength** (pause menu: Subtle / Normal / Strong, or `?rtStrength=`; remembered) scales what tracing
  changes relative to an open sky: `ambient = sky · (traced / sky)^k`, with k = 1.0 / 1.5 / 2.2.
  Subtle is the plain physical result. Occluded corners get darker and light bouncing off sunlit snow and
  ice gets brighter as k rises.
- `window.__sim.rayTracing.debugView(n)` shows the per-pixel inputs: 1 blend weight, 2 coverage (red =
  near-camera rays, green = landscape cache), 3 traced ambient light, 4 traced sun visibility; 0 turns it off.
  `setStrength('strong')` changes the strength from the console.

Where the difference shows: in the morning and evening, Base Camp lies in the shadow of the ridge to the east.
Ray-traced sun visibility puts the tents, seracs and flags in shade too, whereas the regular renderer's
32 m mountain-shadow approximation leaves some props sunlit. In shade generally, traced ambient light shows
real occlusion under seracs, between tents and in hollows, plus bounce from sunlit ice. At noon on open snow
the physically correct difference is small; use Strong to make it pronounced.

## Budgets and diagnostics

The local lighting starts at 0.35 of each screen axis, capped at 960×540. Every 60 frames it moves one step
along 0.5 / 0.35 / 0.25 / 0.18 of the screen. With GPU timer queries it steps down above the 5 ms budget and
up below 2.75 ms. Without them, which is common on Linux / Mesa, it uses the smoothed frame interval: down
above 24 ms, up below 17.5 ms. Rays trace every frame: the old every-second-frame reuse is gone, because it
alternated reprojected and fresh pixels. Each pixel casts two rays: the sun ray, and one diffuse bounce
whose own sunlight comes from the landscape cache. Cache tile work also adapts to the same signal.

Main-thread work is kept small:
- The capture scene is rescanned every 20 frames or 15 m; in between only tracked meshes are synced.
- Region lists share each geometry's arrays between instances, so a worker message copies them once.
- Parts smaller than 0.3 m are skipped (pebbles, pegs, guy lines).
- Camp models are detailed within 180 m of the region centre and simple beyond.
- The prop texture atlas is built once.

At Base Camp the region list went from about 2 s to about 55 ms on the main thread.

The allocation estimate has a 256 MiB limit and includes height/hierarchy/mask textures, both cache buffers,
surface/history/filter buffers, BVH/material textures, the dynamic shadow target and an 8 MiB driver allowance.
The memory guard first halves the actual allocated local resolution (including at high-DPI/4K sizes), then
falls back to normal rendering if the scene cannot fit. This can reduce it further than a quarter of the display.
The largest current Base Camp region contains approximately 2.6 million triangles. It takes longer to prepare
than empty terrain. Initial shader compilation and worker setup can cause a first-use hitch; warm measurements
exclude that setup. Other cameras, weather, drivers and scenes can cost more than the benchmark below.

Inspect `window.__sim.rayTracing.stats` (including `scale`, `frameMs`, `gpuMs`, `strength`) and `failed` in the browser console.
`window.__sim.setRayTracing(true/false)` changes the option and persists it. Disposal and failure restore the
original material callbacks and release the lighting worker, textures, structures and render targets.

## Build and verification

Runtime dependencies are pinned to Three.js 0.160.0 and three-mesh-bvh 0.7.6. Rebuild with:

```sh
npm install
npm run build:render
npm run lint
npm run test:unit
npm run test:rt
```

The generated `assets/render/rt-runtime.js` and `rt-worker.js` are committed. The runtime uses the existing
Three.js import map; the worker includes its own Three.js code and needs no import map or remote dependency.
Both regular static serving and `npm run start:offline` with `?localthree` work.

The GPU checks compare native-height intersections to exact CPU reference rays, including a backdrop ridge
behind an overlapping core surface. Separate fixtures verify an off-screen red room's diffuse bounce and
soft sun penumbrae, including half-float material sampling. Lifecycle checks cover the switch, Low suspension,
quality changes, dynamic masks/shadows, region replacement, simulation invariants and failure cleanup.
A small GPU fixture also verifies that a cache update changes exactly its scissored tile.

For a hardware benchmark in PowerShell (set CHROMIUM to an installed Chrome or Playwright browser):

```powershell
$env:HARDWARE='1'
$env:CHROMIUM='C:\Program Files\Google\Chrome\Application\chrome.exe'
$env:W='1920'; $env:H='1080'
$env:Q='?debug&rt=off&localthree'
npm run benchmark:rt
```

The benchmark verifies the actual WebGL renderer, rejects software rendering, warms up for 10 seconds, and
measures 60 seconds each with lighting off/on at Base Camp in Medium, clear weather and noon. It records
frame median/p95, FPS, incremental render time, GPU lighting timing, memory and adaptive settings in
`tests/out/ray-tracing-benchmark.json`. FPS reflects the browser's presentation rate; a 60 FPS result alone
does not measure spare GPU capacity. Use the asynchronous GPU timing to assess lighting cost.

On 6 October 2026, Chrome/ANGLE D3D11 on the Radeon RX 6800 XT measured **60.0 FPS with lighting on**
and approximately 60 FPS off at 1920×1080. Frame p95 with lighting was 17.8 ms. Added lighting GPU time
was **4.7 ms**, within the 5 ms target. The adaptive setting used quarter-resolution local lighting and
ray updates every second frame. The 2.60-million-triangle region used an estimated **248.9 MiB** including
the driver allowance. See [the recorded measurement](ray-tracing-benchmark.json).
The benchmark verifies converged cache coverage at the camera before measuring; the final blend was 1.0.
This is a warm stationary Base Camp measurement; first-use hitches, other locations and movement are not
covered by its FPS result.
