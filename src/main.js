// Boot and main loop.
import * as THREE from 'three';
import { FAST_FORWARD, TERRAIN } from './config.js';
import { CoreField, BackdropField } from './world/heightfield.js';
import { loadRoutes, campsFor } from './world/route.js';
import { TerrainLOD, coreTerrainOptions, backdropTerrainOptions } from './world/terrain.js';
import { createTerrainMaterial } from './world/terrainMaterial.js';
import { buildProps } from './world/props.js';
import { Environment } from './world/environment.js';
import { makeClimber } from './render/climber.js';
import { CameraRig } from './render/camera.js';
import { game, newGame, restHours } from './sim/game.js';
import { simStep } from './sim/step.js';
import { stepPhysiology } from './sim/physiology.js';
import { startAutopilot, interact, nearestRope } from './sim/player.js';
import { initInput, manualControl, keys } from './input.js';
import { initAudio, updateAudio } from './audio.js';
import { initToasts } from './ui/toast.js';
import { initHUD, updateHUD, resetHUD } from './ui/hud.js';
import { initScreens, showTitle } from './ui/screens.js';

const params = new URLSearchParams(location.search);
const DEBUG = params.has('debug');
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
  await step('Loading the Copernicus GLO-30 elevation model…');
  const meta = await (await fetch(TERRAIN.metaUrl)).json();
  const [field, back, routes] = await Promise.all([CoreField.load(meta), BackdropField.load(meta), loadRoutes()]);
  game.routes = routes; game.backdrop = back;
  game.camps = campsFor(routes);
  await step('Refining the terrain to 7.5 m and kicking in the boot track…');
  const t0 = performance.now();
  field.refine([routes.main, routes.lhotse], game.camps);
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
const all = () => [...game.routes.main.pts.filter((_, i) => Object.values(game.routes.main.tags).includes(i)), ...game.routes.lhotse.pts.slice(-1)];
let dbgIdx = 0;
function teleport(x, z) { const P = game.P; P.x = x; P.z = z; P.y = game.field.height(x, z); P.falling = null; game.S.maxAlt = Math.max(game.S.maxAlt, P.y); resetHUD(); }
function debugKey(code) {
  if (code === 'KeyT' || code === 'KeyG') {
    const pts = all(); dbgIdx = Math.max(0, Math.min(pts.length - 1, dbgIdx + (code === 'KeyT' ? 1 : -1)));
    teleport(pts[dbgIdx].x, pts[dbgIdx].z);
  }
  if (code === 'KeyK') { game.time += 1; stepPhysiology(game, 1, { moving: false, sprint: false, grade: 0 }); }
}
const api = {
  game, renderer, scene, camera, keys, simStep, teleport, restHours, startAutopilot, interact, nearestRope,
  get rig() { return rig; }, get terrain() { return terrain; }, renderMs: 0, frameMs: 0,
};
window.__sim = api;

boot().catch((e) => { console.error(e); loadMsg.textContent = 'Failed to start: ' + e.message + (location.protocol === 'file:' ? ' — serve the folder over HTTP (see README).' : ''); });
