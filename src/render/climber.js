// The climber, built from rounded shapes on an Object3D skeleton:
//   root (feet, faces -z) > body > pelvis > spine > chest > neck > head (helmet, goggles, oxygen mask)
//                                         chest > shoulder > elbow > wrist (gloves; the right hand holds the ice axe)
//                                 pelvis > hip > knee > ankle (boots with crampons)
// High-altitude down suit with quilted baffles (normal map), harness with carabiners and the rope tied in, a pack
// with the oxygen cylinder, regulator and hose (shown while oxygen is on). Animated walking and climbing, planting
// the axe on steep ground, careful steps on ladders, idle breathing that quickens with hypoxia, falls, and the
// skiing stance of the easter egg.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createHelmet } from './helmet.js';
import { createIceAxe } from './iceAxe.js';
import { createPuffyNormalMap } from './proceduralTextures.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/** A small sky-to-snow gradient environment for reflections on metal, goggles and the oxygen bottle. */
function makeEnvMap(renderer) {
  if (!renderer) return null;
  const s = new THREE.Scene();
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    vertexShader: 'varying vec3 vD; void main() { vD = normalize( position ); gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }',
    fragmentShader: `varying vec3 vD; void main() {
      float y = vD.y;
      vec3 sky = mix( vec3( 0.85, 0.92, 1.0 ), vec3( 0.18, 0.36, 0.78 ), smoothstep( 0.0, 0.7, y ) );
      vec3 snow = mix( vec3( 0.95, 0.96, 1.0 ), vec3( 0.55, 0.58, 0.64 ), smoothstep( 0.0, -0.6, y ) );
      vec3 c = y > 0.0 ? sky : snow;
      c += vec3( 6.0, 5.6, 5.0 ) * pow( max( dot( vD, normalize( vec3( 0.4, 0.6, -0.3 ) ) ), 0.0 ), 400.0 );
      gl_FragColor = vec4( c, 1.0 );
    }`,
  });
  s.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), mat));
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(s, 0.02);
  pm.dispose(); mat.dispose();
  return rt.texture;
}

export function createClimber(scene, { renderer = null } = {}) {
  const envMap = makeEnvMap(renderer);
  const puffy = createPuffyNormalMap(8), puffyLegs = puffy.clone(); puffyLegs.repeat.set(1, 1.6); puffyLegs.needsUpdate = true;
  const puffyArms = puffy.clone(); puffyArms.repeat.set(2, 1.4); puffyArms.needsUpdate = true;
  const fabric = (color, map, o = {}) => new THREE.MeshPhysicalMaterial({
    color, roughness: 0.55, metalness: 0, normalMap: map, normalScale: new THREE.Vector2(0.9, 0.9),
    sheen: 0.55, sheenRoughness: 0.45, sheenColor: new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.5), ...o,
  });
  const M = {
    jacket: fabric(0xc61f18, puffy),
    sleeves: fabric(0xc61f18, puffyArms),
    pants: fabric(0x1b2130, puffyLegs, { roughness: 0.6 }),
    trim: new THREE.MeshStandardMaterial({ color: 0x15181d, roughness: 0.8 }),
    glove: new THREE.MeshStandardMaterial({ color: 0x23262b, roughness: 0.85 }),
    boot: new THREE.MeshStandardMaterial({ color: 0xf0a51c, roughness: 0.45 }),
    sole: new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.9 }),
    metal: new THREE.MeshStandardMaterial({ color: 0xc3c7cd, metalness: 1, roughness: 0.35, envMap }),
    pack: new THREE.MeshStandardMaterial({ color: 0x3f6aa8, roughness: 0.8 }),
    strap: new THREE.MeshStandardMaterial({ color: 0x2a2f38, roughness: 0.85 }),
    bottle: new THREE.MeshStandardMaterial({ color: 0xe0621a, metalness: 0.35, roughness: 0.32, envMap }),
    hose: new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.55 }),
    mask: new THREE.MeshStandardMaterial({ color: 0x2b2e33, roughness: 0.75 }),
    valve: new THREE.MeshStandardMaterial({ color: 0xff7a1a, roughness: 0.5 }),
    balaclava: new THREE.MeshStandardMaterial({ color: 0x30343c, roughness: 0.9 }),
    lens: new THREE.MeshPhysicalMaterial({ color: 0xd9962b, metalness: 1, roughness: 0.08, envMap, iridescence: 0.6, iridescenceIOR: 1.6, clearcoat: 1 }),
    rope: new THREE.MeshStandardMaterial({ color: 0x1fa38a, roughness: 0.9 }),
    skin: new THREE.MeshStandardMaterial({ color: 0xc58c64, roughness: 0.7 }),
  };
  const add = (parent, geo, mat, x = 0, y = 0, z = 0, shadow = true) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = shadow; m.receiveShadow = shadow; parent.add(m); return m;
  };
  const grp = (parent, x = 0, y = 0, z = 0) => { const o = new THREE.Group(); o.position.set(x, y, z); parent.add(o); return o; };
  const tube = (pts, r, mat, parent) => add(parent, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p))), 24, r, 8, false), mat);

  const root = new THREE.Group(); root.rotation.order = 'YXZ';
  const body = grp(root);
  const pelvis = grp(body, 0, 0.95, 0);
  // ---------------- hips, harness, rope
  add(pelvis, new THREE.SphereGeometry(1, 20, 14), M.pants).scale.set(0.175, 0.13, 0.13);
  const harness = add(pelvis, new THREE.TorusGeometry(0.18, 0.016, 8, 32), M.strap, 0, 0.05, 0); harness.rotation.x = Math.PI / 2; harness.scale.set(1.04, 0.78, 1);
  const biner = new THREE.TorusGeometry(0.022, 0.0045, 6, 18);
  for (const [x, z, ry] of [[-0.12, -0.11, 0.6], [0.13, -0.1, -0.6], [0.17, 0.02, -1.4], [-0.17, 0.03, 1.4]]) {
    const b = add(pelvis, biner, M.metal, x, -0.01, z); b.scale.set(0.62, 1, 1); b.rotation.y = ry;
  }
  add(pelvis, new THREE.SphereGeometry(0.024, 10, 8), M.rope, 0, 0.02, -0.15);                       // figure-eight tie-in
  tube([[0, 0.02, -0.15], [0.03, -0.08, -0.19], [0.08, -0.2, -0.13], [0.12, -0.26, -0.02], [0.16, -0.22, 0.1]], 0.0085, M.rope, pelvis);
  // ---------------- torso: quilted jacket (lathe), pack, straps
  const spine = grp(pelvis, 0, 0.06, 0);
  const chest = grp(spine, 0, 0.0, 0);
  const torsoProfile = [[0.15, 0], [0.18, 0.05], [0.198, 0.15], [0.212, 0.27], [0.218, 0.37], [0.205, 0.45], [0.165, 0.505], [0.09, 0.53], [0.06, 0.535]]
    .map(([r, y]) => new THREE.Vector2(r, y));
  const torso = add(chest, new THREE.LatheGeometry(torsoProfile, 28), M.jacket); torso.scale.set(1.06, 1, 0.74);
  add(chest, new THREE.CylinderGeometry(0.075, 0.09, 0.07, 18), M.jacket, 0, 0.54, 0);           // collar
  add(chest, new THREE.BoxGeometry(0.012, 0.42, 0.01), M.trim, 0, 0.27, -0.158);                   // zip
  const pack = grp(chest, 0, 0.27, 0.235);
  add(pack, new RoundedBoxGeometry(0.36, 0.5, 0.2, 4, 0.05), M.pack);
  add(pack, new RoundedBoxGeometry(0.34, 0.09, 0.22, 3, 0.04), M.pack, 0, 0.27, -0.005);           // lid
  add(pack, new RoundedBoxGeometry(0.07, 0.24, 0.1, 3, 0.025), M.pack, -0.2, -0.08, 0.02);         // side pocket
  add(pack, new THREE.BoxGeometry(0.3, 0.02, 0.012), M.strap, 0, 0.1, 0.104);                      // compression strap
  add(pack, new THREE.BoxGeometry(0.3, 0.02, 0.012), M.strap, 0, -0.1, 0.104);
  for (const s of [-1, 1]) {
    tube([[0.1 * s, 0.5, 0.13], [0.13 * s, 0.56, 0.0], [0.14 * s, 0.47, -0.15], [0.12 * s, 0.3, -0.172], [0.11 * s, 0.12, -0.158]], 0.011, M.strap, chest).scale.set(1, 1, 0.6);
  }
  add(chest, new THREE.BoxGeometry(0.22, 0.022, 0.012), M.strap, 0, 0.36, -0.178);                // sternum strap
  // oxygen: cylinder in the pack, regulator, hose over the left shoulder to the mask
  const o2 = grp(chest);
  const bottleProfile = [[0, -0.25], [0.05, -0.245], [0.058, -0.22], [0.058, 0.18], [0.05, 0.22], [0.03, 0.245], [0.014, 0.255], [0.014, 0.28], [0, 0.28]].map(([r, y]) => new THREE.Vector2(r, y));
  add(o2, new THREE.LatheGeometry(bottleProfile, 20), M.bottle, 0.09, 0.33, 0.29);
  add(o2, new THREE.CylinderGeometry(0.022, 0.022, 0.05, 12), M.metal, 0.09, 0.64, 0.29);         // regulator
  add(o2, new THREE.CylinderGeometry(0.018, 0.018, 0.012, 14), M.metal, 0.12, 0.64, 0.29).rotation.z = Math.PI / 2;   // gauge
  tube([[0.09, 0.66, 0.29], [0.02, 0.74, 0.2], [-0.12, 0.66, 0.06], [-0.14, 0.62, -0.06], [-0.08, 0.66, -0.15], [-0.02, 0.73, -0.17]], 0.009, M.hose, o2);
  // ---------------- head: balaclava, goggles, oxygen mask, helmet
  const neck = grp(chest, 0, 0.53, 0);
  add(neck, new THREE.CylinderGeometry(0.05, 0.06, 0.08, 14), M.balaclava, 0, 0.03, 0);
  const head = grp(neck, 0, 0.15, 0);
  add(head, new THREE.SphereGeometry(0.105, 24, 18), M.balaclava).scale.set(0.95, 1.08, 1.0);
  add(head, new THREE.SphereGeometry(0.04, 12, 10), M.skin, 0, -0.01, -0.085).scale.set(1.2, 0.6, 0.5);   // cheeks between goggles and buff
  const gogFrame = add(head, new THREE.CylinderGeometry(0.112, 0.112, 0.052, 32, 1, true, Math.PI * 0.62, Math.PI * 0.76), M.trim, 0, 0.022, 0.0);
  gogFrame.scale.set(1, 1, 1.02);
  add(head, new THREE.CylinderGeometry(0.117, 0.117, 0.042, 32, 1, true, Math.PI * 0.66, Math.PI * 0.68), M.lens, 0, 0.022, 0.0);
  add(head, new THREE.CylinderGeometry(0.108, 0.108, 0.02, 32, 1, true, -Math.PI * 0.4, Math.PI * 0.8), M.strap, 0, 0.03, 0.0);   // goggle strap
  const mask = grp(head, 0, -0.05, -0.08);
  const maskProfile = [[0.0, 0.07], [0.022, 0.068], [0.04, 0.05], [0.058, 0.02], [0.062, 0.0]].map(([r, y]) => new THREE.Vector2(r, y));
  const mk = add(mask, new THREE.LatheGeometry(maskProfile, 20), M.mask); mk.rotation.x = -Math.PI / 2; mk.scale.set(1.1, 1, 0.9);
  add(mask, new THREE.CylinderGeometry(0.016, 0.018, 0.022, 12), M.valve, 0, -0.005, -0.07).rotation.x = Math.PI / 2;
  const helmet = createHelmet(); helmet.position.set(0, 0.035, 0.005); head.add(helmet);
  // ---------------- arms
  const arms = [-1, 1].map((s) => {
    const shoulder = grp(chest, 0.235 * s, 0.445, 0);
    add(shoulder, new THREE.SphereGeometry(0.078, 16, 12), M.jacket);
    add(shoulder, new THREE.CapsuleGeometry(0.066, 0.2, 6, 14), M.sleeves, 0, -0.15, 0);
    const elbow = grp(shoulder, 0, -0.29, 0);
    add(elbow, new THREE.CapsuleGeometry(0.056, 0.18, 6, 14), M.sleeves, 0, -0.12, 0);
    add(elbow, new THREE.CylinderGeometry(0.06, 0.055, 0.05, 14), M.trim, 0, -0.235, 0);           // glove cuff
    const wrist = grp(elbow, 0, -0.27, 0);
    add(wrist, new RoundedBoxGeometry(0.085, 0.105, 0.065, 3, 0.03), M.glove, 0, -0.045, -0.005);
    add(wrist, new THREE.CapsuleGeometry(0.018, 0.04, 4, 8), M.glove, -0.045 * s, -0.035, -0.03).rotation.z = 0.5 * s;   // thumb
    return { shoulder, elbow, wrist };
  });
  const axe = createIceAxe({ envMap }); axe.position.set(0, -0.06, -0.01); arms[1].wrist.add(axe);
  // ---------------- legs, boots, crampons
  const spikes = [];
  for (const [x, z] of [[-0.04, -0.15], [0.04, -0.15], [-0.05, -0.06], [0.05, -0.06], [-0.05, 0.02], [0.05, 0.02], [-0.045, 0.1], [0.045, 0.1], [-0.04, 0.14], [0.04, 0.14]]) {
    spikes.push(new THREE.ConeGeometry(0.007, 0.032, 6).rotateX(Math.PI).translate(x, -0.1, z - 0.03));
  }
  for (const x of [-0.022, 0.022]) spikes.push(new THREE.ConeGeometry(0.007, 0.05, 6).rotateX(-Math.PI / 2).translate(x, -0.082, -0.225));   // front points
  spikes.push(new THREE.BoxGeometry(0.11, 0.008, 0.31).translate(0, -0.083, -0.04));                 // frame
  spikes.push(new THREE.BoxGeometry(0.008, 0.035, 0.008).translate(-0.055, -0.07, 0.05));            // heel bail
  spikes.push(new THREE.BoxGeometry(0.008, 0.035, 0.008).translate(0.055, -0.07, 0.05));
  const cramponGeo = mergeGeometries(spikes);
  const legs = [-1, 1].map((s) => {
    const hip = grp(pelvis, 0.095 * s, -0.03, 0);
    add(hip, new THREE.CapsuleGeometry(0.086, 0.28, 6, 14), M.pants, 0, -0.21, 0);
    const knee = grp(hip, 0, -0.43, 0);
    add(knee, new THREE.CapsuleGeometry(0.07, 0.26, 6, 14), M.pants, 0, -0.19, 0);
    const ankle = grp(knee, 0, -0.42, 0);
    add(ankle, new THREE.CylinderGeometry(0.074, 0.068, 0.2, 16), M.boot, 0, 0.07, 0.0);                    // cuff / gaiter
    add(ankle, new THREE.CylinderGeometry(0.076, 0.076, 0.03, 16), M.trim, 0, 0.16, 0.0);                   // gaiter top
    add(ankle, new RoundedBoxGeometry(0.122, 0.1, 0.3, 3, 0.04), M.boot, 0, -0.025, -0.045);
    add(ankle, new RoundedBoxGeometry(0.128, 0.022, 0.31, 2, 0.008), M.sole, 0, -0.07, -0.045);
    add(ankle, new THREE.BoxGeometry(0.13, 0.012, 0.012), M.strap, 0, -0.005, -0.12);                       // crampon strap
    add(ankle, cramponGeo, M.metal);
    return { hip, knee, ankle };
  });
  // ---------------- easter egg: skis and poles
  const skis = grp(root);
  const skiMat = new THREE.MeshStandardMaterial({ color: 0x1f6fd1, roughness: 0.35 }), tipMat = new THREE.MeshStandardMaterial({ color: 0xf4f4f4, roughness: 0.4 });
  for (const s of [-1, 1]) {
    add(skis, new RoundedBoxGeometry(0.09, 0.025, 1.7, 2, 0.01), skiMat, 0.11 * s, 0.03, 0.05);
    add(skis, new RoundedBoxGeometry(0.09, 0.025, 0.18, 2, 0.01), tipMat, 0.11 * s, 0.07, -0.86).rotation.x = 0.45;
  }
  const poles = arms.map(({ wrist }) => {
    const p = grp(wrist, 0, -0.05, 0);
    add(p, new THREE.CylinderGeometry(0.009, 0.009, 1.15, 8), M.metal, 0, -0.52, 0);
    add(p, new THREE.CylinderGeometry(0.045, 0.045, 0.008, 12), M.trim, 0, -0.97, 0);
    return p;
  });
  scene.add(root);

  // ---------------- animation
  let t = 0, mv = 0, steepS = 0;
  const reflective = [M.metal, M.bottle, M.lens, ...axe.userData.metals];
  return {
    group: root,
    /** day: 0 at night, 1 in daylight (dims reflections of the static environment map) */
    setDaylight(day) { for (const m of reflective) m.envMapIntensity = 0.12 + 0.88 * day; },
    update(dt, P, S = null) {
      t += dt;
      root.position.set(P.x, P.y, P.z);
      root.rotation.y += Math.atan2(Math.sin(P.facing - root.rotation.y), Math.cos(P.facing - root.rotation.y)) * Math.min(1, dt * 10);
      const K = P.ski;
      skis.visible = !!K; poles.forEach((p) => { p.visible = !!K; }); axe.visible = !K;
      const oxy = !!(S && S.o2on && S.tanks && S.tanks.length);
      o2.visible = oxy; mask.visible = oxy;
      // breathing: faster and deeper as blood oxygen falls or when working hard
      const spo2 = S ? S.spo2 : 95;
      const rate = 0.22 + 0.4 * smooth(95, 55, spo2) + 0.18 * mv, br = Math.sin(t * Math.PI * 2 * rate);
      const depth = 0.012 + 0.02 * smooth(95, 55, spo2);
      chest.scale.set(1 + depth * 0.5 * br, 1 + depth * 0.4 * br, 1 + depth * br);
      head.rotation.x = 0.04 * br * smooth(90, 60, spo2);
      mv += ((P.moving ? 1 : 0) - mv) * Math.min(1, dt * 6);
      const [L, R] = legs, [AL, AR] = arms;
      for (const l of legs) l.hip.rotation.z = 0;
      root.rotation.x = 0;
      if (K) {                       // skiing: knees bent, leaning forward, poles back; deeper in a tuck, snowplough to brake
        const crouch = K.tuck ? 1 : K.brake ? 0.35 : 0.55;
        body.rotation.x += ((K.tuck ? -0.5 : -0.2) - body.rotation.x) * Math.min(1, dt * 6);
        body.position.y = -0.16 * crouch;
        for (const l of legs) { l.hip.rotation.x = 0.55 * crouch + 0.2; l.knee.rotation.x = -1.0 * crouch - 0.15; l.ankle.rotation.x = 0.45 * crouch; }
        L.hip.rotation.z = K.brake ? -0.14 : 0; R.hip.rotation.z = K.brake ? 0.14 : 0;
        for (const a of arms) { a.shoulder.rotation.x = K.tuck ? 1.0 : 0.35; a.elbow.rotation.x = K.tuck ? 1.3 : 0.55; }
        poles.forEach((p) => { p.rotation.x = K.tuck ? -1.9 : -0.75; });
        skis.rotation.x = K.pitch;
        return;
      }
      if (P.falling) {               // tumbling
        root.rotation.x = 1.2;
        body.rotation.x = 0; body.position.y = 0;
        AL.shoulder.rotation.x = 2.4 + Math.sin(t * 9) * 0.4; AR.shoulder.rotation.x = 2.1 + Math.cos(t * 8) * 0.4;
        AL.elbow.rotation.x = AR.elbow.rotation.x = 0.4;
        L.hip.rotation.x = 0.6 + Math.sin(t * 7) * 0.3; R.hip.rotation.x = 0.2 - Math.sin(t * 7) * 0.3;
        L.knee.rotation.x = R.knee.rotation.x = -0.8;
        axe.rotation.x = 0;
        return;
      }
      // walking and climbing
      const ph = P.phase, s = Math.sin(ph), c = Math.cos(ph);
      steepS += ((P.moving ? smooth(0.35, 0.9, P.grade) : 0) - steepS) * Math.min(1, dt * 3);
      const ladder = P.onLadder ? 1 : 0, amp = (0.5 - 0.22 * ladder) * mv;
      L.hip.rotation.x = s * amp + 0.35 * steepS; R.hip.rotation.x = -s * amp + 0.35 * steepS;
      L.knee.rotation.x = -(Math.max(0, -c) * 0.85 * mv + 0.06 + 0.5 * steepS);
      R.knee.rotation.x = -(Math.max(0, c) * 0.85 * mv + 0.06 + 0.5 * steepS);
      L.ankle.rotation.x = -(L.hip.rotation.x + L.knee.rotation.x) * 0.7;
      R.ankle.rotation.x = -(R.hip.rotation.x + R.knee.rotation.x) * 0.7;
      body.rotation.x = -0.3 * steepS - 0.04 * mv;
      body.position.y = Math.abs(s) * 0.03 * mv - 0.06 * steepS;
      // left arm: swings, or holds the fixed rope / ladder rail
      const roped = P.clipped >= 0 || ladder;
      AL.shoulder.rotation.x = roped ? 0.85 + s * 0.08 * mv : -s * 0.42 * mv + 0.05;
      AL.elbow.rotation.x = roped ? 0.75 : 0.22 + 0.2 * mv;
      AL.shoulder.rotation.z = -0.08;
      // right arm and the axe: a walking cane on easy ground, planted in the slope ahead on steep ground
      const plant = Math.sin(ph * 0.5);                                   // one plant every two steps
      const walkArm = 0.12 + s * 0.34 * mv, steepArm = 0.95 + 0.45 * Math.max(0, plant);
      AR.shoulder.rotation.x = walkArm + (steepArm - walkArm) * steepS + (ladder ? 0.6 : 0);
      AR.elbow.rotation.x = 0.3 + 0.35 * steepS;
      AR.shoulder.rotation.z = 0.08;
      axe.rotation.x = -(AR.shoulder.rotation.x + AR.elbow.rotation.x) + 0.12 + 0.55 * steepS + 0.12 * s * mv;
    },
  };
}

/** Kept for older callers. */
export const makeClimber = createClimber;
