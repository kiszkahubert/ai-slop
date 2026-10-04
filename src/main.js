// Boot and main loop.
import * as THREE from 'three';
import { FAST_FORWARD, TERRAIN } from './config.js';
import { CoreField, BackdropField } from './world/heightfield.js';
import { loadRoutes, campsFor, CLIMBS } from './world/route.js';
import { PEAKS, alignClimbingSummits } from './world/geo.js';
import { TerrainLOD, coreTerrainOptions, backdropTerrainOptions } from './world/terrain.js';
import { createTerrainMaterial } from './world/terrainMaterial.js';
import { buildProps } from './world/props.js';
import { Environment } from './world/environment.js';
import { makeClimber } from './render/climber.js';
import { CameraRig } from './render/camera.js';
import { game, newGame, restHours, placePlayer, setSpeedMul } from './sim/game.js';
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

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.3, 150000);
camera.rotation.order = 'YXZ';
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });

let env, terrain, backdrop, climber, rig;

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
  field.refine(Object.values(routes), game.camps, 1, CLIMBS.map((c) => top(routes[c.route], c.id)));
  console.log('terrain refined in', Math.round(performance.now() - t0), 'ms');
  game.field = field;
  await step('Building terrain chunks…');
  const mat = createTerrainMaterial();
  terrain = new TerrainLOD(scene, mat, field, coreTerrainOptions());
  backdrop = new TerrainLOD(scene, mat, back, backdropTerrainOptions(field));
  await step('Fixing ropes, ladders and camps…');
  game.world = buildProps(scene, field, routes, game.camps);
  env = new Environment(scene, renderer);
  climber = makeClimber(scene);
  rig = new CameraRig(camera);
  newGame(1);
  initToasts(); initHUD(canvas); initScreens(canvas); initAudio();
  initInput({ onDebugKey: DEBUG ? debugKey : null });
  await step('Pitching tents at Base Camp…');
  rig.update(0, 0, game, climber);
  for (let k = 0; k < 60 && terrain.update(camera.position, 40) > 0; k++);
  backdrop.update(camera.position, 40);
  showTitle();
  requestAnimationFrame(frame);
}

let last = performance.now(), simTime = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now; simTime += dt;
  if (game.mode === 'play') {
    const ctl = manualControl();
    const n = game.auto ? FAST_FORWARD : 1;
    for (let k = 0; k < n && game.mode === 'play'; k++) simStep(dt, ctl);
  }
  climber.update(dt, game.P);
  rig.update(dt, simTime, game, climber);
  game.env.sunEl = env.update(dt, {
    time: game.time, weather: game.weather, env: game.env, player: game.P, camera,
    lampYaw: game.view.fp ? game.view.yaw : game.P.facing, lampPitch: game.view.fp ? game.view.pitch : -0.25,
    labels: [...game.camps.map((c) => c.label), ...game.world.labels],
  });
  terrain.update(camera.position, 3);
  backdrop.update(camera.position, 2);
  if (game.mode === 'play' || game.mode === 'camp') updateHUD(dt);
  updateAudio(dt);
  const tr = performance.now();
  renderer.render(scene, camera);
  api.renderMs = performance.now() - tr;
  api.frameMs = performance.now() - now;
}

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
const api = {
  game, renderer, scene, camera, keys, simStep, teleport, restHours, startAutopilot, interact, nearestRope, toggleSkis, setSpeedMul,
  get rig() { return rig; }, get terrain() { return terrain; }, renderMs: 0, frameMs: 0,
};
window.__sim = api;

boot().catch((e) => { console.error(e); loadMsg.textContent = 'Failed to start: ' + e.message + (location.protocol === 'file:' ? ' — serve the folder over HTTP (see README).' : ''); });
