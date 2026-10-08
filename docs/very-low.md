# Very Low graphics

Select **Very Low** on the title or pause screen, or launch with `?quality=verylow`.
The browser remembers the choice. It applies without a reload.

The preset targets the fragment-shading, bandwidth and draw-submission costs that remain in Low:

- Terrain uses a separate `MeshLambertMaterial`: altitude, slope, glacier and exposed-rock masks determine
  vertex colours. Lighting runs at vertices, with no terrain fragment textures, triplanar normal mapping,
  micro detail, PBR reflections or snow sparkle. The Yellow Band, ice/debris regions and snow remain distinguishable.
- Scenery uses reversible Lambert material substitutions. Instancing, colours, transparent cutouts and decals
  remain available. Ice retains a pale blue tint and cavities retain their baked depth colours. Surface detail
  maps and opaque PBR effects are omitted. Camp detail and decorative footprints are disabled.
- No sun shadow rendering, terrain depth prepass, bloom, SSAO, depth of field, mist, snow particles or scattering
  sky. The atmosphere's clear colour supplies the sky; sun, moon, sky ambient light, headlamp and weather fog remain.
- Ray tracing stays paused even when requested through a saved preference or `?rt=on`. Switching to Very Low
  terminates its worker and releases its caches/snapshots; returning to Medium/High can initialize it again.
- The drawing buffer starts at half the CSS viewport size, limited to 960 × 540 regardless of display DPR.
  Sustained rendered-frame intervals above 45 ms reduce resolution in steps to half that initial size.
  Four sampling windows below 28 ms are required for an upward step. A 30 fps cap does not cause oscillation.
  Menus, HUD and minimap retain native display resolution.
- Shorter terrain LOD distance bands and a 12-pixel projected-error allowance reduce terrain mesh detail.
  Native crevasse collars, boundary joins and authored support geometry retain their existing construction.
  Settled terrain skips repeated LOD/cache scans until camera pose, lens or graphics settings change.

Default-framebuffer antialiasing is disabled at renderer creation because WebGL context MSAA cannot be changed
live. Medium/High retain their 4-sample scene targets. Low now also renders without default-framebuffer MSAA.

Rendering changes do not edit the DEM, routes, collider placements, physics rates, physiology or saves.
Very Low intentionally loses texture detail, fine near-object decoration, specular reflections, shadows and
atmospheric particles. The reduced 3D resolution produces visibly softer edges; UI text stays sharp.

## Validation and benchmark

`npm run test:unit` covers resolution limits/adaptation, reversible substitutions, terrain shader construction
and stationary LOD invalidation. `npm run test:verylow` checks actual WebGL compilation, title-screen selection,
persistence, render-pass/shadow state, saved ray tracing, switching through every preset, unchanged ice/camp
placements and support queries, and an expedition with the HUD running.

Run `npm run benchmark:verylow` on the thin client. Use `HARDWARE=1` on Windows to select ANGLE/D3D11,
`CHROMIUM` to select a browser executable, and `W`/`H` to set the viewport. The script reports the actual renderer
so software rendering can be identified. It writes `tests/out/very-low-benchmark.json`.

The benchmark uses fixed noon/clear-weather cameras at Base Camp, Camp 3 and the summit, settles terrain LOD,
then samples 60 rendered frames per preset after discarding 10 warmup frames (`?benchmarkFrames=20` can shorten
a run). The normal draw loop is suspended during measurement. Reading one output pixel completes all submitted
passes before wall-clock timing ends, preventing a backlog of queued frames. Disjoint-checked GPU timer queries
also report GPU time when supported. Draw/triangle counters include every pass. Adaptive resolution is held at
its initial scale for comparable results. Benchmark FPS includes synchronous readback and animation-frame
scheduling; it is not a guarantee of gameplay FPS, which also includes simulation and browser compositing.
Actual thin-client performance requires running this on that machine.

## Recorded software-renderer comparison

On 8 October 2026, Chromium/ANGLE with the SwiftShader Vulkan software renderer completed a 1280 × 720
comparison with 20 sampled frames per preset/location after 10 warmup frames. Very Low rendered at 640 × 360;
adaptive resolution was disabled for this comparison. The hardware thin client was not available for testing.

| Location | Medium GPU ms | Low GPU ms | Very Low GPU ms | Medium / Very Low | Low / Very Low |
|---|---:|---:|---:|---:|---:|
| Base Camp | 4484.5 | 1566.8 | 308.8 | 14.5× | 5.1× |
| Camp 3 | 5932.0 | 1782.6 | 264.5 | 22.4× | 6.7× |
| Everest summit | 4075.5 | 1255.2 | 246.5 | 16.5× | 5.1× |

Draw calls fell from 676 / 987 / 768 on Medium to 367 / 473 / 360 on Very Low.
The reductions demonstrate substantially less rendering work; they do not establish a target-device FPS.
[Full measurements](very-low-benchmark.json) retain GPU/wall timings, synchronized benchmark FPS, buffers,
draw calls, triangle counts and renderer identification.

Validation passed: ESLint; 123 unit tests; the complete `npm test` gameplay/flyby suite with screenshots
skipped; the separate Very Low WebGL/HUD/nighttime checks with a screenshot; active ray-tracing release/restart
checks at 640 × 360; and the flyby suite booting directly into Very Low.
