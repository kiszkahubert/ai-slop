// Sky, sun, moon, stars, headlamp, fog and falling / wind-blown snow.
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { clamp, lerp, smoothstep, D2R } from '../core/math.js';
import { mulberry32 } from '../core/noise.js';
import { sunDirection } from '../sim/weather.js';

export class Environment {
  constructor(scene, renderer) {
    this.scene = scene; this.renderer = renderer;
    scene.fog = new THREE.FogExp2(0xb8c8da, 0.00002);
    this.sky = new Sky();
    // a sphere instead of the default box, drawn just inside the far plane (the box's z = w trick
    // clips whole triangles when combined with the logarithmic depth buffer)
    this.sky.geometry.dispose();
    this.sky.geometry = new THREE.SphereGeometry(1, 48, 24);
    this.sky.material.vertexShader = this.sky.material.vertexShader.replace('gl_Position.z = gl_Position.w;', 'gl_Position.z = gl_Position.w * 0.99999;');
    this.sky.scale.setScalar(40000); this.sky.frustumCulled = false; this.sky.renderOrder = -10;
    const u = this.sky.material.uniforms;
    u.turbidity.value = 1.5; u.rayleigh.value = 0.8; u.mieCoefficient.value = 0.003; u.mieDirectionalG.value = 0.85;
    scene.add(this.sky);
    this.stars = this.makeStars(); scene.add(this.stars);

    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, { left: -55, right: 55, top: 55, bottom: -55, near: 1, far: 1200 });
    this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.06;
    scene.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xbcd4ff, 0x9a9590, 0.8); scene.add(this.hemi);
    this.moon = new THREE.DirectionalLight(0x8ea6d8, 0); this.moon.position.set(-3000, 6000, 2000); scene.add(this.moon);
    this.headlamp = new THREE.SpotLight(0xfff4e0, 0, 70, 0.55, 0.6, 1.5);
    scene.add(this.headlamp, this.headlamp.target);
    this.snow = this.makeSnow(); scene.add(this.snow.points);
    this.sunVec = new THREE.Vector3();
    this.colors = { day: new THREE.Color(0xb9cbe0), night: new THREE.Color(0x070b14), storm: new THREE.Color(0xa7adb5), dusk: new THREE.Color(0xd9a27a) };
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

  makeSnow() {
    const N = 4000, pos = new Float32Array(N * 3), r = mulberry32(3);
    for (let i = 0; i < N; i++) pos.set([(r() - 0.5) * 70, (r() - 0.5) * 40, (r() - 0.5) * 70], i * 3);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const fc = document.createElement('canvas'); fc.width = fc.height = 32;
    const fg = fc.getContext('2d'), gr = fg.createRadialGradient(16, 16, 0, 16, 16, 16);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,0.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    fg.fillStyle = gr; fg.fillRect(0, 0, 32, 32);
    const points = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.07, map: new THREE.CanvasTexture(fc), transparent: true, opacity: 0, depthWrite: false }));
    points.frustumCulled = false;
    return { points, pos, N, last: new THREE.Vector3() };
  }

  /** ctx: { time, weather, env (wind, vis), player {x,y,z}, lampYaw, lampPitch, camera, labels } */
  update(dt, ctx) {
    const { camera, weather, time } = ctx;
    const el = sunDirection(time, this.sunVec), w = weather.sample(time);
    const day = smoothstep(-0.1, 0.12, el), dusk = smoothstep(-0.12, 0.02, el) * (1 - smoothstep(0.05, 0.3, el));
    const u = this.sky.material.uniforms;
    u.sunPosition.value.copy(this.sunVec); u.rayleigh.value = 0.55 + 1.2 * w.S; u.turbidity.value = 1.3 + 8 * w.S;
    this.sky.position.copy(camera.position); this.stars.position.copy(camera.position);
    this.stars.material.opacity = (1 - smoothstep(-0.2, -0.02, el)) * (1 - w.S) * 0.95;
    const cloud = 1 - 0.7 * w.S, P = ctx.player;
    this.sun.intensity = 3.3 * smoothstep(-0.02, 0.15, el) * cloud;
    this.sun.color.setRGB(1, lerp(0.62, 0.97, smoothstep(0, 0.4, el)), lerp(0.42, 0.92, smoothstep(0, 0.4, el)));
    this.sun.position.set(P.x + this.sunVec.x * 500, P.y + this.sunVec.y * 500, P.z + this.sunVec.z * 500);
    this.sun.target.position.set(P.x, P.y, P.z);
    this.hemi.intensity = 0.12 + 0.75 * day;
    this.hemi.color.setRGB(lerp(0.25, 0.74, day), lerp(0.3, 0.83, day), lerp(0.5, 1.0, day));
    this.moon.intensity = 0.35 * (1 - day) * (1 - w.S * 0.8);
    // headlamp after dark
    this.headlamp.intensity = el < 0.03 ? 14 : 0;
    this.headlamp.position.set(P.x, P.y + 1.75, P.z);
    const ly = ctx.lampYaw, lp = ctx.lampPitch;
    this.headlamp.target.position.set(P.x - Math.sin(ly) * 10 * Math.cos(lp), P.y + 1.7 + Math.sin(lp) * 10, P.z - Math.cos(ly) * 10 * Math.cos(lp));
    // fog from visibility
    this.scene.fog.density = 1.73 / (ctx.env.vis * 1000);
    const fc = this.scene.fog.color, C = this.colors;
    fc.copy(C.night).lerp(C.day, day).lerp(C.dusk, dusk * 0.5 * (1 - w.S)).lerp(C.storm.clone().multiplyScalar(0.15 + 0.85 * day), smoothstep(0.25, 0.8, w.S));
    this.renderer.setClearColor(fc);
    this.renderer.toneMappingExposure = lerp(0.95, 0.6, day);
    this.updateSnow(dt, ctx, w, day);
    for (const l of ctx.labels) {
      const d = l.position.distanceTo(camera.position);
      l.material.opacity = clamp(1.25 - d / 4000, 0, 1) * (d < 30 ? 0 : 1);
    }
    return el;
  }

  updateSnow(dt, ctx, w, day) {
    const s = this.snow, cam = ctx.camera.position;
    const spindrift = smoothstep(55, 110, ctx.env.wind) * (ctx.player.y > 7000 ? 0.6 : 0.2);
    const amount = clamp(smoothstep(0.25, 0.8, w.S) + spindrift, 0, 1);
    s.points.material.opacity = amount * 0.85;
    s.points.material.color.setScalar(lerp(0.35, 1, day));
    if (amount > 0.01) {
      const wd = w.dir * D2R, wv = (ctx.env.wind / 3.6) * 0.6;
      const wx = -Math.sin(wd) * wv, wz = Math.cos(wd) * wv;     // blowing away from the "from" direction
      const dcx = cam.x - s.last.x, dcy = cam.y - s.last.y, dcz = cam.z - s.last.z, p = s.pos;
      for (let i = 0; i < s.N; i++) {
        let x = p[i * 3] - dcx + wx * dt, y = p[i * 3 + 1] - dcy - 1.5 * dt, z = p[i * 3 + 2] - dcz + wz * dt;
        p[i * 3] = ((x + 35) % 70 + 70) % 70 - 35; p[i * 3 + 1] = ((y + 20) % 40 + 40) % 40 - 20; p[i * 3 + 2] = ((z + 35) % 70 + 70) % 70 - 35;
      }
      s.points.geometry.attributes.position.needsUpdate = true;
    }
    s.points.position.copy(cam); s.last.copy(cam);
  }
}
