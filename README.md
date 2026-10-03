# Everest · South Col Expedition

A browser mountaineering simulator built with Three.js (r160, loaded from the jsDelivr CDN). Everything is in one file: `index.html`.

Lead a climb from Everest Base Camp (5,364 m) up the South Col route to the summit of Everest (8,849 m), or take the
Lhotse Couloir branch to Lhotse (8,516 m). To win, reach a summit and get back down to Camp 2 alive. Summiting both
earns a bonus.

## Run

Open `index.html` in a modern desktop browser. You can also serve the folder, for example with `npx http-server .`.
An internet connection is needed to load Three.js.

## Controls

| Key | Action |
| --- | --- |
| W A S D | Move / climb |
| Mouse | Look (click the view to lock the pointer) |
| Shift | Climb faster (more stamina, oxygen and breathing load) |
| E | Enter a camp (rest, oxygen, forecast, save) · clip into, switch or unclip fixed ropes |
| O | Supplemental oxygen on/off · 1–4 or `[` `]` set the flow in L/min |
| V | Third / first person · mouse wheel sets camera distance |
| M | Enlarge the route map |
| Esc | Pause |

## What's modelled

- **Terrain:** a 1025×769 heightmap at 8 m spacing. Summits, cols, camps and the route use true elevations. The map is
  compressed 2× horizontally. The massif is built from ridge lines (Everest SE/W/NE ridges, the Lhotse–Nuptse wall,
  the Lhotse Face) and carved glacier floors (Khumbu Icefall, Western Cwm). Terrain is drawn as 192 chunks with 5 LOD
  levels and skirts, plus a distant backdrop. To use a real DEM, pass
  `?dem=heightmap.png&bounds=S,W,N,E&min=4500&max=8849` (8-bit grayscale).
- **Route:** EBC → Khumbu Icefall (crevasses, ladders, seracs) → C1 6,065 m → C2/ABC 6,400 m → Lhotse Face fixed
  ropes → C3 7,160 m → Yellow Band → Geneva Spur → C4/South Col 7,950 m → Balcony → South Summit → Hillary Step →
  summit. The Lhotse branch leaves at the Yellow Band and climbs the Lhotse Couloir.
- **Physiology:** SpO₂ depends on altitude, acclimatization, exertion and oxygen flow. Low SpO₂ blurs and desaturates
  the view, sways the camera and slows you down. Acclimatization rises with time spent high and recovery is faster
  lower down. Health, stamina, frostbite (wind chill) and exhaustion are tracked.
- **Death zone:** above 8,000 m there is an on-screen warning. Without bottled oxygen, health drains steadily, faster
  higher up and when less acclimatized: about 6 game hours at 8,400 m and about 3–4 near the summit.
- **Oxygen:** 4 L / 300 bar bottles with a 1–4 L/min flow. The HUD shows pressure and time remaining. Bottles add
  weight that slows you, and empty bottles are swapped automatically. Bottles can be taken from or cached at any camp.
- **Weather & time:** 1 real second equals 1 game minute. The sun follows its real path at 28°N in May. Wind,
  temperature and visibility change over time, the jet stream blasts the summit, and a camp forecast shows summit
  windows. Leave C4 around 23:00 and respect the 14:00 turnaround.
- **Hazards:** crevasses (cross on the ladders), slips on steep ground when unclipped (one self-arrest chance per
  fall), frostbite, exhaustion and hypoxia.

Add `?debug` to the URL to enable test keys: `T`/`G` teleport along the route and `K` advances one hour. A small
test API is exposed as `window.__sim`.
