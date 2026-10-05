import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BODY } from '../../src/sim/body.js';
import { BodyPoseRig } from '../../src/render/bodyPose.js';

function fixture() {
  const root = new THREE.Group(), nodes = new Map(), pivots = new Map();
  for (const def of BODY) {
    const pivot = def.id === 'head' || !def.parent ? def.p : def.joint;
    const node = new THREE.Group(), parent = def.parent ? nodes.get(def.parent) : root;
    node.position.fromArray(pivot);
    if (def.parent) node.position.sub(new THREE.Vector3(...pivots.get(def.parent)));
    parent.add(node); nodes.set(def.id, node); pivots.set(def.id, pivot);
  }
  return { root, rig: new BodyPoseRig(root, nodes) };
}

function equalPoses(actual, expected) {
  for (const def of BODY) {
    assert.ok(new THREE.Vector3(...actual[def.id].p).distanceTo(new THREE.Vector3(...expected[def.id].p)) < 1e-8, def.id + ' centre');
    assert.ok(1 - Math.abs(new THREE.Quaternion(...actual[def.id].q).dot(new THREE.Quaternion(...expected[def.id].q))) < 1e-8, def.id + ' orientation');
  }
}

test('centre poses survive nested joint pivots and rotated parents', () => {
  const { root, rig } = fixture(); root.position.set(800, 7200, -1300); root.rotation.y = 1.7;
  const poses = Object.fromEntries(BODY.map((d, i) => [d.id, {
    p: [1000 + d.p[0], 8300 + d.p[1], -2200 + d.p[2]],
    q: new THREE.Quaternion().setFromEuler(new THREE.Euler(i * 0.15, 0.8, i * -0.12)).toArray(),
  }]));
  rig.apply(poses); equalPoses(rig.capture(), poses);
  rig.reset(); root.position.set(0, 0, 0); root.quaternion.identity();
  equalPoses(rig.capture(), Object.fromEntries(BODY.map((d) => [d.id, { p: d.p, q: [0, 0, 0, 1] }])));
});

test('recovery joins the last physical pose to the walking pose without an endpoint jump', () => {
  const { root, rig } = fixture(); root.position.set(200, 6500, -500); root.rotation.y = -0.6;
  const walking = rig.capture();
  const from = Object.fromEntries(BODY.map((d) => [d.id, { p: [198 + d.p[0], 6500.1, -500 + d.p[1]], q: [Math.SQRT1_2, 0, 0, Math.SQRT1_2] }]));
  rig.recover(from, 0); equalPoses(rig.capture(), from);
  rig.reset(); root.position.set(200, 6500, -500); root.rotation.y = -0.6;
  rig.recover(from, 1); equalPoses(rig.capture(), walking);
});
