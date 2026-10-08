// Boot and main loop.
import * as THREE from 'three';
import { FAST_FORWARD, TERRAIN } from './config.js';
import { CoreField, BackdropField } from './world/heightfield.js';
import { createLandscapeField } from './world/landscape.js';
import { loadRoutes, campsFor, CLIMBS } from './world/route.js';
import { PEAKS, alignClimbingSummits } from './world/geo.js';
import { TerrainLOD, coreTerrainOptions, backdropTerrainOptions } from './world/terrain.js';
import { createTerrainMaterial, updateTerrainMaterial } from './world/terrainMaterial.js';
import { buildProps } from './world/props.js';
import { planBaseCamp } from './world/baseCamp.js';
import { Environment } from './world/environment.js';
import { createClimber } from './render/climber.js';
import { qualitySettings, initialQuality, rememberQuality, setCurrentQuality, renderPixelRatio, veryLowFullResolution, rememberVeryLowFullResolution } from './render/quality.js';
import { createSimpleTerrainMaterial, LowGraphics } from './render/lowGraphics.js';
import { LowResolution } from './render/lowResolution.js';
import { createTerrainLayerTextures, createMacroNoiseTexture } from './render/proceduralTextures.js';
import { loadTerrainRock } from './render/terrainAssets.js';
import { createReliefTexture, MacroShadow } from './render/terrainMaps.js';
import { installAtmosphericFog } from './render/atmosphere.js';
import { setupPostProcessing } from './render/postfx.js';
import { FRAME_CAPS, FramePacer, initialFrameCap, rememberFrameCap } from './render/framePacing.js';
import { RayTracingLighting } from './render/rayTracing/lighting.js';
import { SHARED, patchSceneMaterials } from './render/shared.js';
import { on, emit } from './core/events.js';
import { smoothstep } from './core/math.js';
import { CameraRig } from './render/camera.js';
import { game, newGame, restHours, placePlayer, setSpeedMul, die, refreshConditions } from './sim/game.js';
import { updateFlyby, startFlyby, skipStop, stopFlyby, replayFlyby, flybyPreview } from './sim/flyby.js';
import { PhysicsScene, initPhysics } from './sim/physics.js';
import { AvalancheView } from './render/avalanche.js';
import { querySupport } from './sim/surface.js';
import { toggleSkis } from './sim/ski.js';
import { simStep } from './sim/step.js';
import { stepPhysiology } from './sim/physiology.js';
import { startAutopilot, interact, nearestRope } from './sim/player.js';
import { initInput, manualControl, keys } from './input.js';
import { initAudio, updateAudio } from './audio.js';
import { initToasts } from './ui/toast.js';
import { initHUD, updateHUD } from './ui/hud.js';
import { initScreens, showTitle } from './ui/screens.js';

const params = new URLSearchParams(location.search);
const DEBUG = params.has('debug');
game.debug = DEBUG;
const canvas = document.getElementById('gl');
const loadMsg = document.getElementById('loadMsg');
const step = (t) => new Promise((r) => { loadMsg.textContent = t; setTimeout(r, 20); });

let qualityName = initialQuality(), quality = qualitySettings(qualityName);
setCurrentQuality(qualityName);
installAtmosphericFog();
// Context MSAA cannot be toggled live. Medium/High use their multisampled scene target;
// the two direct-render presets avoid hidden default-framebuffer MSAA costs.
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, logarithmicDepthBuffer: true, powerPreference: 'high-performance' });
const resolution = new LowResolution();
renderer.setPixelRatio(renderPixelRatio(quality, innerWidth, innerHeight, devicePixelRatio));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = quality.shadows !== false;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.3, 150000);
camera.rotation.order = 'YXZ';
const resize = () => {
  renderer.setPixelRatio(renderPixelRatio(quality, innerWidth, innerHeight, devicePixelRatio, resolution.scale));
  renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  if (postfx) { const s = renderer.getDrawingBufferSize(new THREE.Vector2()); postfx.setSize(s.x, s.y); }
};
addEventListener('resize', resize);

let env, terrain, backdrop, landscape, climber, rig, avalancheView, postfx, terrainMat, relief, layerSize, reliefKey, rayTracing, rock;
const simpleTerrainMat = createSimpleTerrainMaterial();
let lowGraphics;
const terrainView = () => ({ camera, height: renderer.domElement.height, pixelError: quality.terrainError, distanceScale: quality.lodDistanceScale || 1 });

async function boot() {
  await step('Loading the Pléiades elevation model…');
  const meta = await (await fetch(TERRAIN.metaUrl)).json();
  const [field, back, routes] = await Promise.all([CoreField.load(meta), BackdropField.load(meta), loadRoutes()]);
  alignClimbingSummits(routes);
  game.routes = routes; game.backdrop = back;
  game.camps = campsFor(routes);
  await step('Preparing the native 4 m terrain and boot track…');
  const t0 = performance.now();
  const top = (r, id) => ({ ...r.pts[r.pts.length - 1], e: PEAKS.find((p) => p.id === id).e });
  const basePlan = planBaseCamp(field, routes);
  field.refine(Object.values(routes), game.camps, 1, CLIMBS.map((c) => top(routes[c.route], c.id)), { pads: basePlan.pads, relief: basePlan.relief });
  console.log('terrain refined in', Math.round(performance.now() - t0), 'ms');
  game.field = field;
  landscape = createLandscapeField(field, back);
  await step('Painting rock, snow and ice…');
  rock = await loadTerrainRock();
  const layers = createTerrainLayerTextures(quality.textureSize, renderer.capabilities.getMaxAnisotropy(), rock);
  layerSize = quality.textureSize;
  await step('Shading the relief…');
  relief = createReliefTexture(landscape, quality.reliefCell, quality.aoCell); reliefKey = quality.reliefCell + '/' + quality.aoCell;
  const macroShadow = new MacroShadow(landscape, 32);
  SHARED.uMacroShadow.value = macroShadow.texture;
  await step('Building terrain chunks…');
  terrainMat = createTerrainMaterial({
    layers, macroNoise: createMacroNoiseTexture(), relief: relief.texture, reliefRect: relief.rect,
    microDetail: quality.microDetail, antiTiling: quality.textureSize >= 512, exactGradients: quality.exactGradients,
  });
  await step('Fixing ropes, ladders and camps…');
  game.world = buildProps(scene, field, routes, game.camps, { backdrop: back, basePlan, quality, anisotropy: renderer.capabilities.getMaxAnisotropy(), terrainMaterial: terrainMat });
  terrain = new TerrainLOD(scene, terrainMat, landscape, { ...coreTerrainOptions(), crevasses: game.world.crevasseField });
  backdrop = new TerrainLOD(scene, terrainMat, back, backdropTerrainOptions(landscape));
  await step('Preparing fall and snow physics…');
  await initPhysics();
  game.physics = new PhysicsScene(game, { die });
  avalancheView = new AvalancheView(scene);
  env = new Environment(scene, renderer, { quality, field, macroShadow });
  climber = createClimber(scene, { renderer });
  climber.group.userData.rtDynamic = true;
  patchSceneMaterials(scene);                 // mountain shadows on props and the climber too
  lowGraphics = new LowGraphics(scene, game.world);
  lowGraphics.apply(!!quality.simpleScenery);
  terrain.setMaterial(quality.simpleTerrain ? simpleTerrainMat : terrainMat);
  backdrop.setMaterial(quality.simpleTerrain ? simpleTerrainMat : terrainMat);
  postfx = setupPostProcessing(renderer, scene, camera, quality);
  rayTracing = new RayTracingLighting(renderer, scene, camera, { field: landscape, back, world: game.world, terrainMaterial: terrainMat, sun: env.sun, quality: qualityName });
  // A shader/driver failure must leave ordinary rendering available.
  const shaderError = renderer.debug.onShaderError;
  renderer.debug.onShaderError = (...args) => {
    if (rayTracing.requested && rayTracing.ready) {
      const [gl, program, vertex, fragment] = args;
      console.warn('Ray-traced lighting shader:', gl.getProgramInfoLog(program), gl.getShaderInfoLog(vertex), gl.getShaderInfoLog(fragment));
      rayTracing.pendingFailure = 'GPU rejected a lighting shader'; return;
    }
    if (shaderError) shaderError(...args);
    else { const [gl, program, vertex, fragment] = args; console.error('Shader compilation failed:', gl.getProgramInfoLog(program), gl.getShaderInfoLog(vertex), gl.getShaderInfoLog(fragment)); }
  };
  rig = new CameraRig(camera);
  game.rig = rig;                           // the flyby starts from wherever the camera last was
  newGame(1);
  initToasts(); initHUD(canvas); initScreens(canvas); initAudio();
  initInput({ onDebugKey: DEBUG ? debugKey : null });
  await step('Pitching tents at Base Camp…');
  rig.update(0, 0, game, climber);
  game.world.campVisuals.update(camera);
  game.world.crevasseVisuals.update(camera);
  // Coarse meshes already cover the view. Avoid eagerly measuring/building every visible native chunk
  // before the first frame, especially on a slow CPU; normal frame budgets finish the refinement.
  for (let k = 0; k < 8 && terrain.update(camera.position, 40, terrainView(), 4) > 0; k++);
  backdrop.update(camera.position, 40, terrainView(), 2);
  showTitle();
  requestAnimationFrame(frame);
}

let last = performance.now(), simTime = 0, frameCap = initialFrameCap();
const pacer = new FramePacer(FRAME_CAPS[frameCap].fps);
const MENUS = new Set(['title', 'paused', 'camp', 'won']);
let labels = null, labelSources = null;
function frame(now) {
  requestAnimationFrame(frame);
  const menu = MENUS.has(game.mode);
  if (!pacer.due(now, menu)) return;          // frame-rate limit: skip this display refresh entirely
  rayTracing.paceMs = pacer.idleMs(menu);
  const interval = now - last;
  if (quality.adaptiveResolution && resolution.sample(interval)) resize();
  const dt = Math.min(0.05, interval / 1000); last = now; simTime += dt;
  if (game.mode === 'play') {
    if (game.flyby) {
      updateFlyby(dt);                      // cinematic flight: the camera flies, the climber waits
    } else {
      const ctl = manualControl();
      const n = game.auto ? FAST_FORWARD : 1;
      for (let k = 0; k < n && game.mode === 'play'; k++) simStep(dt, ctl);
    }
  }
  if (game.mode === 'dead' && game.physics?.hasMotion()) game.physics.step(dt);
  climber.update(dt, game.P, game.S, game.physics);
  rig.update(dt, simTime, game, climber);
  avalancheView.update(game.mode==='play'||game.mode==='dead'?dt:0, game.physics, camera);
  if (avalancheView.group) avalancheView.group.userData.rtDynamic = true;
  game.world.campVisuals.update(camera);
  game.world.crevasseVisuals.update(camera);
  const viewerEnv = game.flyby?.env || game.env;
  game.env.sunEl = env.update(dt, {
    time: game.time, weather: game.weather, env: viewerEnv, player: game.P, camera,
    cinematic: !!game.flyby && !game.flyby.restored,
    lampYaw: game.view.fp ? game.view.yaw : game.P.facing, lampPitch: game.view.fp ? game.view.pitch : -0.25,
    labels: currentLabels(),
  });
  climber.setDaylight(smoothstep(-0.1, 0.12, game.env.sunEl));
  const lodView = terrainView();
  // Meshes are built in time slices (a few ms per frame) so a detailed or crevasse-cut chunk never stalls a frame
  terrain.update(camera.position, 3, lodView, 4);
  backdrop.update(camera.position, 2, lodView, 2);
  prepareFlyby(now, lodView);
  if ((game.mode === 'play' || game.mode === 'camp' || game.mode === 'paused') && !game.flyby) updateHUD(dt);
  updateAudio(dt);
  const tr = performance.now();
  const firstPerson = game.view.fp && !game.P.falling && !game.P.recovery;
  rayTracing.prepare(game.time);
  postfx.render({ free: game.free, focus: game.flyby && !game.flyby.restored ? 400 : firstPerson ? 30 : rig.dist });
  api.renderMs = performance.now() - tr;
  api.frameMs = performance.now() - now;
}

const flybyCamera = camera.clone();
let lastFlybyPrepare = 0, flybyPrepareTurn = 0;
on('flybyEnd', () => { terrain?.cancelPrepare(); backdrop?.cancelPrepare(); });
function prepareFlyby(now, view) {
  const f = game.flyby;
  if (!f || now - lastFlybyPrepare < 15 || (f.fade < .99 && api.frameMs > 14)) return;
  const pose = flybyPreview(6);
  if (!pose) return;
  lastFlybyPrepare = now;
  flybyCamera.position.fromArray(pose.pos); flybyCamera.lookAt(...pose.look);
  flybyCamera.fov = pose.fov; flybyCamera.aspect = camera.aspect; flybyCamera.updateProjectionMatrix();
  const start = performance.now();
  // Alternate jobs so a single frame never warms several expensive assets at once.
  let built = 0;
  if (flybyPrepareTurn++ % 3 === 2) built = game.world.campVisuals.prepare(flybyCamera);
  else built = (flybyPrepareTurn % 3 === 1 ? terrain : backdrop).prepare(flybyCamera, view).built;
  const elapsed = performance.now() - start;
  f.prefetch.built += built; f.prefetch.ms += elapsed;
  f.prefetch.maxMs = Math.max(f.prefetch.maxMs, elapsed); f.prefetch.jobs++;
}

/** Camp and summit name tags, rebuilt only when the camps or the world change (not every frame). */
function currentLabels() {
  if (!labels || labelSources[0] !== game.camps || labelSources[1] !== game.world.labels || labelSources[2] !== game.camps.length) {
    labels = [...game.camps.map((c) => c.label), ...game.world.labels];
    labelSources = [game.camps, game.world.labels, game.camps.length];
  }
  return labels;
}
function setFrameCap(name) {
  if (!FRAME_CAPS[name]) return false;
  frameCap = name; rememberFrameCap(name); pacer.setFps(FRAME_CAPS[name].fps);
  return true;
}
on('setFrameCap', setFrameCap);

// ---------------- debugging / automated tests
const all = () => Object.values(game.routes).flatMap((r) => r.pts.filter((_, i) => Object.values(r.tags).includes(i)));
let dbgIdx = 0;
const teleport = (x, z) => placePlayer(x, z);
const SPEEDS = [0.25, 0.5, 1, 2, 4, 8, 16, 32];
function debugKey(code) {
  if (code === 'Comma' || code === 'Period') {       // walk speed
    const i = SPEEDS.findIndex((v) => v >= game.speedMul);
    setSpeedMul(SPEEDS[Math.max(0, Math.min(SPEEDS.length - 1, (i < 0 ? SPEEDS.length - 1 : i) + (code === 'Period' ? 1 : -1)))]);
  }
  if (code === 'KeyT' || code === 'KeyG') {
    const pts = all(); dbgIdx = Math.max(0, Math.min(pts.length - 1, dbgIdx + (code === 'KeyT' ? 1 : -1)));
    teleport(pts[dbgIdx].x, pts[dbgIdx].z);
  }
  if (code === 'KeyK') { game.time += 1; stepPhysiology(game, 1, { moving: false, sprint: false, grade: 0 }); }
}
// ---------------- graphics quality: applied live, nothing in the simulation changes
function setQuality(name) {
  const q = qualitySettings(name);
  if (!q || !terrainMat) return false;
  lowGraphics.apply(false); // restore shared source materials before changing their texture sets
  qualityName = name; quality = q; rememberQuality(name); setCurrentQuality(name);
  resolution.reset();
  renderer.shadowMap.enabled = q.shadows !== false;
  resize();
  env.applyQuality(q);
  postfx.configure(q);
  game.world.campVisuals.applyQuality(q);
  game.world.crevasseVisuals.applyQuality(q);
  game.world.iceVisuals.applyQuality(q);
  game.world.campVisuals.update(camera, true);
  const opts = { microDetail: q.microDetail, antiTiling: q.textureSize >= 512, exactGradients: q.exactGradients };
  if (layerSize !== q.textureSize) { opts.layers = createTerrainLayerTextures(q.textureSize, renderer.capabilities.getMaxAnisotropy(), rock); layerSize = q.textureSize; }
  if (reliefKey !== q.reliefCell + '/' + q.aoCell) {
    relief = createReliefTexture(landscape, q.reliefCell, q.aoCell); reliefKey = q.reliefCell + '/' + q.aoCell;
    opts.relief = relief.texture; opts.reliefRect = relief.rect;
  }
  updateTerrainMaterial(terrainMat, opts);
  terrain.setMaterial(q.simpleTerrain ? simpleTerrainMat : terrainMat);
  backdrop.setMaterial(q.simpleTerrain ? simpleTerrainMat : terrainMat);
  lowGraphics.apply(!!q.simpleScenery);
  rayTracing?.configure(name);
  return true;
}
on('setQuality', setQuality);
function setVeryLowFullResolution(value) {
  rememberVeryLowFullResolution(value);
  if (qualityName === 'verylow') {
    quality = qualitySettings(qualityName);
    resolution.reset();
    if (postfx) postfx.configure(quality);
    resize();
  }
  emit('veryLowFullResolutionChanged');
}
on('setVeryLowFullResolution', setVeryLowFullResolution);
on('setRayTracing', value => rayTracing?.setEnabled(value));
on('setRayTracingStrength', name => rayTracing?.setStrength(name));

const api = {
  game, renderer, scene, camera, keys, simStep, teleport, restHours, startAutopilot, interact, nearestRope, toggleSkis, setSpeedMul, setQuality,
  get quality() { return qualityName; }, get frameCap() { return frameCap; }, setFrameCap, get postfx() { return postfx; }, get climber() { return climber; }, get env() { return env; },
  get veryLowFullResolution() { return veryLowFullResolution(); }, setVeryLowFullResolution,
  get rayTracing() { return rayTracing; }, setRayTracing: value => rayTracing?.setEnabled(value),
  triggerAvalanche: (options) => game.physics.triggerAvalanche(options),
  forceFall: (options) => game.physics.startFall({ reason: 'test', ...options }),
  resetPhysics: () => { const ok = game.physics.resetExperiment(); refreshConditions(); return ok; },
  stepPhysics: (dt, control) => game.physics.step(dt, control),
  get avalancheView() { return avalancheView; },
  crevasseAt: (x,z) => game.world.crevasseField.at(x,z)?.id ?? null,
  querySupport: (position,maxDrop) => querySupport(game,position,maxDrop),
  get rig() { return rig; }, get terrain() { return terrain; }, get backdropTerrain() { return backdrop; }, renderMs: 0, frameMs: 0,
  resolution,
  startFlyby, skipStop, stopFlyby: (reason) => stopFlyby(reason), updateFlyby, replayFlyby, flybyPreview,
};
window.__sim = api;

boot().catch((e) => { console.error(e); loadMsg.textContent = 'Failed to start: ' + e.message + (location.protocol === 'file:' ? ' — serve the folder over HTTP (see README).' : ''); });
