// Exercise the real detailed rig: body centres, equipment, axe contact and recovery camera.
return (async () => {
  const W = window.__sim, g = W.game, C = W.climber, THREE = await import('three');
  const { AXE_PICK } = await import('./src/sim/body.js');
  const maxError = (poses) => Math.max(...Object.entries(poses).map(([id, p]) =>
    C.bodyParts.get(id).getWorldPosition(new THREE.Vector3()).distanceTo(new THREE.Vector3(...p.p))));
  const c3 = g.routes.main.point('c3'); g.mode = 'play'; W.teleport(c3.x, c3.z);
  W.forceFall({ heightOffset: 2, velocity: { x: 1, y: -2, z: 3 } });
  for (let i = 0; i < 120; i++) W.stepPhysics(1 / 120);
  const pose = g.physics.pose();
  g.S.o2on = true; C.update(0.016, g.P, g.S, g.physics);
  const out = { parts: C.bodyParts.size, error: maxError(pose), oxygen: C.parts.o2.visible && C.parts.mask.visible, helmet: C.parts.helmet.children.length > 0 };
  const pick = C.parts.axe.localToWorld(C.parts.axe.userData.pickTip.clone());
  const expected = new THREE.Vector3(...AXE_PICK).applyQuaternion(new THREE.Quaternion(...pose.forearm1.q)).add(new THREE.Vector3(...pose.forearm1.p));
  out.pickError = pick.distanceTo(expected);
  g.S.o2on = false; C.update(0, g.P, g.S, g.physics); out.oxygenOff = !C.parts.o2.visible && !C.parts.mask.visible;
  W.resetPhysics(); W.teleport(c3.x, c3.z); g.P.recovery = { pose, t: 0 }; g.view.fp = true;
  C.update(0, g.P, g.S, g.physics); out.recoveryStart = maxError(pose);
  W.rig.update(0.016, 0, g, C); out.recoveryVisible = C.group.visible;
  out.cameraError = W.rig.target.distanceTo(C.bodyParts.get('pelvis').getWorldPosition(new THREE.Vector3()));
  g.P.recovery.t = 0.8; C.update(0, g.P, g.S, g.physics);
  const end = C.bodyParts.get('pelvis').getWorldPosition(new THREE.Vector3());
  g.P.recovery = null; C.update(0, g.P, g.S, g.physics);
  out.recoveryEnd = end.distanceTo(C.bodyParts.get('pelvis').getWorldPosition(new THREE.Vector3()));
  W.rig.update(0.016, 0, g, C); out.firstPerson = !C.group.visible && g.view.fp;
  g.view.fp = false; g.mode = 'paused';
  return out;
})();
