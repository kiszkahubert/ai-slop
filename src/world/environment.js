// Sky, sun, moon, stars, headlamp, fog, valley mist and falling / wind-blown snow. Also feeds the shared shader
// uniforms (sun, sky light) and drives the mountain-shadow ray march.
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { clamp, lerp, smoothstep } from '../core/math.js';
import { TERRAIN, VISUALS } from '../config.js';
import { mulberry32 } from '../core/noise.js';
import { sunDirection } from '../sim/weather.js';
import { setupLighting } from '../render/lighting.js';
import { MistLayers, WindSnow } from '../render/atmosphere.js';
import { SHARED } from '../render/shared.js';
import { on } from '../core/events.js';

export class Environment {
  /** opts: { quality (preset), field (core height field), macroShadow (MacroShadow|null) } */
  constructor(scene, renderer, opts) {
    this.scene = scene; this.renderer = renderer;
    scene.fog = new THREE.FogExp2(0xb8c8da, 0.00002);
    this.sky = new Sky();
    // a sphere instead of the default box, drawn just inside the far plane (the box's z = w trick
    // clips whole triangles when combined with the logarithmic depth buffer)
    this.sky.geometry.dispose();
    this.sky.geometry = new THREE.SphereGeometry(1, 48, 24);
    this.sky.material.vertexShader = this.sky.material.vertexShader.replace('gl_Position.z = gl_Position.w;', 'gl_Position.z = gl_Position.w * 0.99999;');
    // Drawn after the other opaque geometry: it never writes depth and sits behind everything, so the same pixels
    // come out, but the depth test now skips its (expensive) scattering shader wherever terrain already covers.
    this.sky.scale.setScalar(40000); this.sky.frustumCulled = false; this.sky.renderOrder = 1e6;
    const u = this.sky.material.uniforms;
    u.turbidity.value = 1.5; u.rayleigh.value = 0.8; u.mieCoefficient.value = 0.003; u.mieDirectionalG.value = 0.85;
    scene.add(this.sky);
    this.stars = this.makeStars(); scene.add(this.stars);

    this.lights = setupLighting(scene, opts.quality);
    Object.assign(this, { sun: this.lights.sun, hemi: this.lights.hemi, moon: this.lights.moon, headlamp: this.lights.headlamp });
    this.mist = new MistLayers(scene, opts.field);
    this.snow = new WindSnow(scene, opts.quality.snowParticles);
    this.macro = opts.macroShadow || null;
    this.sunVec = new THREE.Vector3(); this.lastTime = null; this.adapt = 1;
    this.colors = { day: new THREE.Color(0xb9cbe0), night: new THREE.Color(0x070b14), storm: new THREE.Color(0xa7adb5), dusk: new THREE.Color(0xd9a27a) };
    this.applyQuality(opts.quality);
    on('teleported', () => { this.snapAdapt = true; });   // a new place: no slow adaptation from the old one
  }

  applyQuality(q) {
    this.lights.applyQuality(q);
    this.mist.enabled = q.mist;
    if (this.snow.N !== q.snowParticles) this.snow.build(q.snowParticles);
    if (this.macro) this.macro.enabled = q.macroShadow;
    SHARED.uMacroRect.value.copy(q.macroShadow && this.macro ? this.macro.rect : new THREE.Vector4(0, 0, 0, 0));
    this.lastTime = null;
  }

  makeStars() {
    const n = 3000, pos = new Float32Array(n * 3), r = mulberry32(7);
    for (let i = 0; i < n; i++) {
      const u = r() * 2 - 1, th = r() * Math.PI * 2, s = Math.sqrt(1 - u * u);
      pos.set([s * Math.cos(th) * 40000, Math.abs(u) * 40000 - 3000, s * Math.sin(th) * 40000], i * 3);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const p = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
    p.frustumCulled = false; p.renderOrder = -9; return p;
  }

  /** ctx: { time, weather, env (wind, vis), player {x,y,z}, lampYaw, lampPitch, camera, labels } */
  update(dt, ctx) {
    const { camera, weather, time } = ctx;
    const el = sunDirection(time, this.sunVec), w = weather.sample(time);
    const day = smoothstep(-0.1, 0.12, el), dusk = smoothstep(-0.12, 0.02, el) * (1 - smoothstep(0.05, 0.3, el));
    const u = this.sky.material.uniforms;
    u.sunPosition.value.copy(this.sunVec); u.rayleigh.value = 0.45 + 1.2 * w.S; u.turbidity.value = 1.2 + 8 * w.S;
    this.sky.position.copy(camera.position); this.stars.position.copy(camera.position);
    this.stars.material.opacity = (1 - smoothstep(-0.2, -0.02, el)) * (1 - w.S) * 0.95;
    this.stars.visible = this.stars.material.opacity > 0;           // fully transparent: skip the draw
    const cloud = 1 - 0.7 * w.S, P = ctx.player, eye = ctx.cinematic ? camera.position : P;
    this.sun.intensity = VISUALS.lighting.sun * smoothstep(-0.02, 0.15, el) * cloud;
    this.sun.color.setRGB(1, lerp(0.62, 0.97, smoothstep(0, 0.4, el)), lerp(0.42, 0.92, smoothstep(0, 0.4, el)));
    this.lights.follow(eye, this.sunVec);
    this.hemi.intensity = (VISUALS.lighting.skyNight + VISUALS.lighting.skyDay * day * lerp(1, 1.3, w.S)) * (ctx.cinematic ? 1.25 : 1);
    this.hemi.color.setRGB(lerp(0.25, 0.74, day), lerp(0.3, 0.83, day), lerp(0.5, 1.0, day));
    this.moon.intensity = 0.35 * (1 - day) * (1 - w.S * 0.8);
    // headlamp after dark
    this.headlamp.intensity = !ctx.cinematic && el < 0.03 ? 14 : 0;
    this.headlamp.position.set(P.x, P.y + 1.75, P.z);
    const ly = ctx.lampYaw, lp = ctx.lampPitch;
    this.headlamp.target.position.set(P.x - Math.sin(ly) * 10 * Math.cos(lp), P.y + 1.7 + Math.sin(lp) * 10, P.z - Math.cos(ly) * 10 * Math.cos(lp));
    // shared shader inputs: sun and sky light
    SHARED.uSunDir.value.copy(this.sunVec);
    SHARED.uSunColor.value.copy(this.sun.color).multiplyScalar(this.sun.intensity);
    SHARED.uSkyAmbient.value.copy(this.hemi.color).multiplyScalar(this.hemi.intensity);
    SHARED.uTime.value += dt;
    SHARED.uFlagWind.value = ctx.env.wind;
    // the mountains' shadows: a big jump in time (rest, time of day) recomputes them at once
    if (this.macro && this.macro.enabled) {
      if (this.lastTime === null || Math.abs(time - this.lastTime) > 0.25) this.macro.flush(this.sunVec);
      else this.macro.update(this.sunVec, 16);
    }
    this.lastTime = time;
    // fog from visibility
    this.scene.fog.density = 1.73 / (ctx.env.vis * 1000);
    this.scene.fog.density += this.mist.localDensity(camera.position) * 0.001 * lerp(.35,1,w.S) * (ctx.cinematic ? .25 : 1);
    const fc = this.scene.fog.color, C = this.colors;
    fc.copy(C.night).lerp(C.day, day).lerp(C.dusk, dusk * 0.5 * (1 - w.S)).lerp(C.storm.clone().multiplyScalar(0.15 + 0.85 * day), smoothstep(0.25, 0.8, w.S));
    this.renderer.setClearColor(fc);
    // eye adaptation: standing in a mountain's shadow, exposure opens up over a couple of seconds
    const lit = this.macro ? this.macro.sample(eye.x, eye.z) : 1;
    this.adapt = this.snapAdapt ? lit : this.adapt + (lit - this.adapt) * Math.min(1, dt * 0.8);
    this.snapAdapt = false;
    this.renderer.toneMappingExposure = lerp(0.95, lerp(VISUALS.lighting.exposureShade, VISUALS.lighting.exposureSun, this.adapt), day);
    if (ctx.cinematic) this.renderer.toneMappingExposure *= 1.12;
    this.mist.update(dt, camera.position, w, day, ctx.env.wind, w.dir, fc, this.sun.color, ctx.cinematic ? .25 : 1);
    const spindrift = smoothstep(55, 110, ctx.env.wind) * (eye.y > 7000 ? 0.6 : 0.2);
    this.snow.update(dt, camera.position, clamp(smoothstep(0.25, 0.8, w.S) + spindrift, 0, 1), ctx.env.wind, w.dir, day);
    for (const l of ctx.labels) {
      const u = l.userData;
      if (u.curve) {                       // distant summits sit lower with the curvature of the Earth, like the terrain
        const dx = l.position.x - camera.position.x, dz = l.position.z - camera.position.z;
        l.position.y = u.baseY - (dx * dx + dz * dz) / (2 * TERRAIN.earthRadius);
      }
      const d = l.position.distanceTo(camera.position);
      l.material.opacity = clamp(1.25 - d / (u.range || 4000), 0, 1) * (d < (u.near ?? (u.range ? 6 : 30)) ? 0 : 1) * (ctx.cinematic ? 0 : 1);
    }
    return el;
  }
}
