# Visual fidelity: issue 13

This pass corrects terrain facing and restores direct-sun occlusion before adding
surface, silhouette, atmosphere and foreground detail. The source Pléiades DEM,
routes, camps, saves and expedition rules remain intact.

## Shading and materials

Triplanar projection reconstruction now retains the signed base normal. Rotated
anti-tiling samples are inverse-transformed before accumulation. Forward terrain
and ray-traced secondary hits share the same sampling implementation.

The macro-shadow callback previously searched for direct-light code before Three
expanded its shader includes. It now expands the lighting chunk explicitly, so
mountain occlusion reaches the sun in both standard props and terrain. Covered RT
pixels replace fallback macro visibility rather than multiplying two visibility
estimates. Stock nearby shadows and the dynamic RT shadow pass still ground boots
and moving flags. Their depth bias is reduced to centimetre scale: the previous
stock bias could skip approximately 35 cm of occlusion, and the RT dynamic bias
approximately 70 cm over the sun camera's 1,400 m range.

Clear daylight hemisphere intensity falls from 1.27 to 0.61 (0.52 daylight plus
0.09 night fill). Sun intensity is 3.6, snow's extra blue fill is 0.22 and exposure adapts
between 0.72 in sun and 0.84 in shade. These controls live together in
`VISUALS.lighting` and `VISUALS.terrain`. Snow grooves occupy isolated wind patches,
with smoother mounds and weaker micro normals elsewhere. Sparkle uses fixed world
facets, a continuous view response and a pixel-footprint fade. Small normal detail
fades before it becomes noise across distant faces.

The rock layer uses Poly Haven's CC0 Marble Cliff 01 photograph, normal,
roughness and AO maps, packed into the existing texture arrays. There are no new
terrain samplers or runtime CDN requests. See
[material attribution and packing](../assets/materials/README.md). This material
describes fractures and ledges; it does not claim to reproduce Everest's geology.
Altitude strata and the Yellow Band tint remain authored. Snow accumulation also
accounts for lee versus windward slope exposure.

## Geometry and foreground

LOD retains distance thresholds and adds the maximum native-vertex error against
the actual coarse triangle mesh, projected through camera FOV and render height.
The error limits are 5 / 3 / 2 pixels for Low / Medium / High. Visible chunks refine
within the existing per-frame construction budget; coarsening uses a margin to
reduce toggling. Chunk endpoints include partial native cells, and bounds retain
isolated ridge spikes. Error measurements and bounds are cached; focal length is
computed once per update. The finest available terrain remains the measured grid.

Small authored snow shelves beside the upper routes add half-metre triangles
and broken crests. The same arrays drive display, triangle support, streamed
Rapier colliders and the nearby static RT snapshot. They do not alter the DEM or
global landscape cache. Teleport, recovery, walking and skiing query the raised
surface. These shelves are local approximations, not surveyed cornices or
overhanging avalanche hazards.

The previous continuous boot ribbon is replaced with alternating compressed
footprints, tread marks and broken crust, instanced in spatial batches. Fixed
ropes are approximately 24 mm in diameter, sag between anchors, and use linear
spans to avoid spline overshoot. Flags have subdivided cloth and wind-driven free
edges. Their display and depth shaders share the same deformation; they are
excluded from static RT geometry and retain moving shadows.

The native articulated climber gains rounded down baffles, a fuller suit profile,
hood and pocket details, and two-link foot placement on supported ground.
Ladder, skiing, recovery and simulated fall poses retain their existing adapters.
Quaternius's openly licensed humanoid rigs were evaluated as a possible starting
point; they still require mountaineering equipment and adaptation to this body,
axe contact and recovery system. Improving the existing rig preserves those
animations and physics bindings without adding another animation runtime.

## Atmosphere

Clear-weather fog has a nearby contrast fade, with stronger blue separation at
distance and less sky Rayleigh wash. Storm visibility retains the existing
optical-length behavior. Localized banks replace terrain-sized flat mist sheets.
Each has a finite horizontal extent and vertical thickness, overlapping soft
billboards, terrain-height boundary fading, opaque depth testing, and wind drift.
Local fog fills the camera's view inside a bank. Low disables the banks.

This is an impostor approximation: bank lighting and the 64 m terrain boundary
are coarse, and transparent billboards cannot reproduce full cloud transport.
Full volumetric clouds remain a later improvement after hardware cost and these
cheaper banks have been assessed.

## Verification and comparisons

```sh
npm ci
npm run build:render
npm run lint
npm run test:unit
npm run test:visual
npm run test:rt
```

The production GLSL flat-normal fixture checks 384 combinations of signed axes,
mixed slopes, anti-tiling, micro detail, rotation blend and snow/rock layers. A
float-target lighting fixture checks a lit face, opposing face and macro-occluded
face under the same sun, then verifies that traced sun visibility replaces macro
visibility rather than applying it twice. Unit fixtures compare shelf triangles to CPU support
and actual Rapier ray casts, retain isolated LOD ridge spikes, validate identical
flag depth deformation and solve leg endpoints. Browser checks decode the bundled
PBR assets and exercise all three quality presets and the cloud volume bounds.

On 6 October 2026, lint and all 89 unit tests passed. The visual browser fixtures
passed 384 normal cases, rendered lit intensity 0.607746 versus 0 on the opposed
and occluded faces, and reproduced 0.607746 / 0 for traced lit / traced shadow.
The live scene contained 16,591 footprints, 65 flag batches, 21 snow shelves and
8 cloud banks. Low / Medium / High decoded the rock at 256 / 512 / 1024 pixels.
The boot contact fixture reduces stock-lit intensity from 0.580224 to 0.451285;
the previous bias gives the same result as removing the boot's shadow entirely.
The production RT dynamic-shadow function also detects the boot (visibility
0.777778 versus 1.0 without the caster). Supported boot soles are within 3 cm of
the shelf surface.

`npm run capture:visual` records summit, ridge, rock-face and camp views at noon,
clear weather, Medium, exposure 0.72 and a fixed camera pose. `RT=1` adds traced
views after actual cache coverage reaches 0.9 at the camera; running frames alone
do not count as coverage. JSON records camera, exposure, quality, renderer, RT
state, cache coverage, frame intervals and CPU submission time beside the images.
There are 60 samples per view (12 with traced lighting on a software renderer).

```sh
VIEW=summit,rock RT=1 SHOTS=tests/out/fidelity-after npm run capture:visual
FIDELITY_ROOT=/absolute/path/to/baseline VIEW=summit,rock RT=1 \
  SHOTS=tests/out/fidelity-before npm run capture:visual
```

The baseline is commit `2e668319def3c6c0007268d29ec0d4f5e6797a62` with its own
runtime files and dependencies. Both views use the same capture script and
exposure so material and lighting changes can be compared directly. This is a
stationary visual comparison, not a performance benchmark. `HARDWARE=1` permits
the browser's hardware renderer; check the recorded renderer before interpreting
frame times. This development environment uses SwiftShader. The earlier RX 6800
XT results in [the RT notes](ray-tracing.md) describe the baseline and must be
remeasured for this revision at 1920×1080. Hardware FPS and motion stability are
not established by software screenshots.

The 26-ray native traversal, off-screen bounce/penumbra and cache-tile RT fixtures
passed. The full lifecycle fixture exceeded its 120-second initialization limit
on SwiftShader, including a reduced-resolution retry. Re-run `npm run test:rt`
on hardware to verify the complete lifecycle and performance of this revision.
