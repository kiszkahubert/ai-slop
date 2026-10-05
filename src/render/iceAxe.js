// Mountaineering ice axe: slightly curved aluminium shaft, forged steel head with a drooping, toothed pick and a
// flat adze, a bottom spike, a rubber grip and a wrist leash. Origin = the head, where the climber's hand holds it
// in the self-belay grip: the shaft hangs down (-y), the pick points forward (-z), the adze back (+z).
import * as THREE from 'three';

export function createIceAxe({ envMap = null } = {}) {
  const g = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: 0xc9ccd2, metalness: 1.0, roughness: 0.34, envMap, envMapIntensity: 1 });
  const alu = new THREE.MeshStandardMaterial({ color: 0x2f6fd0, metalness: 0.85, roughness: 0.38, envMap, envMapIntensity: 0.8 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x1b1d20, roughness: 0.92 });
  const leashMat = new THREE.MeshStandardMaterial({ color: 0xe0471f, roughness: 0.8 });
  const L = 0.66;

  // shaft: a gentle curve toward the pick near the head
  const shaftCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, -0.01, 0), new THREE.Vector3(0, -0.12, 0.004), new THREE.Vector3(0, -0.4, 0.006), new THREE.Vector3(0, -L + 0.06, 0),
  ]);
  const shaft = new THREE.Mesh(new THREE.TubeGeometry(shaftCurve, 24, 0.0135, 10, false), alu);
  shaft.scale.set(1, 1, 1.35);                       // oval section
  // grip near the spike end
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.0165, 0.0165, 0.14, 12), rubber);
  grip.position.y = -L + 0.16; grip.scale.z = 1.3;
  // spike
  const spike = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.06, 10), steel);
  spike.rotation.x = Math.PI; spike.position.y = -L + 0.03; spike.scale.z = 1.25;

  // head body
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 0.05), steel);
  head.position.y = 0.0;
  // pick: profile drawn in the (z forward, y up) plane, extruded 6 mm thick
  const pick = new THREE.Shape();
  pick.moveTo(0, 0.018);
  pick.quadraticCurveTo(0.09, 0.02, 0.19, -0.035);                  // top edge, drooping toward the tip
  pick.lineTo(0.195, -0.05);                                        // tip
  const teeth = 7, step = 0.15 / teeth;
  for (let i = 0; i < teeth; i++) {                                 // toothed underside, from the tip back toward the head
    const x = 0.195 - i * step, y = -0.05 + i * step * 0.2;
    pick.lineTo(x - step * 0.65, y + 0.007);                         // tooth flank
    pick.lineTo(x - step, y + step * 0.2);                           // tooth point
  }
  pick.lineTo(0.02, -0.02); pick.lineTo(0, -0.018); pick.lineTo(0, 0.018);
  const extrude = { depth: 0.006, bevelEnabled: true, bevelThickness: 0.0012, bevelSize: 0.001, bevelSegments: 1, curveSegments: 16 };
  const pickGeo = new THREE.ExtrudeGeometry(pick, extrude);
  pickGeo.translate(0, 0, -0.003);
  const pickMesh = new THREE.Mesh(pickGeo, steel);
  pickMesh.rotation.y = Math.PI / 2;                                // shape x -> world -z (forward)
  // adze: a flat blade going back, widening and curving slightly down
  const adze = new THREE.Shape();
  adze.moveTo(-0.012, 0); adze.lineTo(0.012, 0); adze.lineTo(0.024, 0.085); adze.lineTo(-0.024, 0.085); adze.lineTo(-0.012, 0);
  const adzeGeo = new THREE.ExtrudeGeometry(adze, { ...extrude, depth: 0.004 });
  const adzeMesh = new THREE.Mesh(adzeGeo, steel);
  adzeMesh.rotation.x = Math.PI / 2 + 0.25;                         // shape y -> world +z (back), drooping
  adzeMesh.position.set(0, 0.012, 0.02);
  // wrist leash: a loop from the head down to a slider on the shaft
  const leashCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.01, -0.02, 0.01), new THREE.Vector3(0.06, -0.12, 0.03), new THREE.Vector3(0.07, -0.26, 0.0),
    new THREE.Vector3(0.03, -0.33, -0.03), new THREE.Vector3(0.005, -0.3, -0.01),
  ]);
  const leash = new THREE.Mesh(new THREE.TubeGeometry(leashCurve, 24, 0.0045, 6, false), leashMat);
  const slider = new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.004, 6, 14), steel);
  slider.rotation.x = Math.PI / 2; slider.position.y = -0.3;

  for (const m of [shaft, grip, spike, head, pickMesh, adzeMesh, leash, slider]) { m.castShadow = true; g.add(m); }
  g.userData.metals = [steel, alu];
  g.userData.pickTip = new THREE.Vector3(0, -0.05, -0.195);
  return g;
}
