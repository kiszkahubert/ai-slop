// Rapier poses use segment centres in world space; the detailed rig uses joint pivots.
import * as THREE from 'three';
import { BODY } from '../sim/body.js';

export class BodyPoseRig {
  constructor(root, pivots) {
    this.root = root;
    this.parts = new Map();
    this.bindings = BODY.map((def) => {
      const node = pivots.get(def.id);
      const pivot = def.id === 'head' || !def.parent ? def.p : def.joint;
      const offset = new THREE.Vector3(...def.p).sub(new THREE.Vector3(...pivot));
      const centre = new THREE.Group(); centre.position.copy(offset); node.add(centre);
      this.parts.set(def.id, centre);
      return { id: def.id, node, offset, position: node.position.clone(), rotation: node.quaternion.clone() };
    });
  }

  reset() {
    for (const b of this.bindings) { b.node.position.copy(b.position); b.node.quaternion.copy(b.rotation); }
  }

  capture() {
    this.root.updateMatrixWorld(true);
    return Object.fromEntries([...this.parts].map(([id, node]) => [id, {
      p: node.getWorldPosition(new THREE.Vector3()).toArray(),
      q: node.getWorldQuaternion(new THREE.Quaternion()).toArray(),
    }]));
  }

  apply(poses) {
    this.root.position.set(0, 0, 0); this.root.quaternion.identity();
    // Parents precede children in BODY. Convert each centre to its pivot, then into
    // the current parent frame; assigning world rotations directly would twist limbs twice.
    for (const b of this.bindings) {
      const pose = poses[b.id], q = new THREE.Quaternion(...pose.q);
      const pivot = new THREE.Vector3(...pose.p).sub(b.offset.clone().applyQuaternion(q));
      const parent = b.node.parent;
      parent.updateWorldMatrix(true, false);
      b.node.position.copy(parent.worldToLocal(pivot));
      b.node.quaternion.copy(parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(q));
    }
    this.root.updateMatrixWorld(true);
  }

  recover(from, weight) {
    const target = this.capture(), poses = {};
    for (const id of this.parts.keys()) {
      poses[id] = {
        p: new THREE.Vector3(...from[id].p).lerp(new THREE.Vector3(...target[id].p), weight).toArray(),
        q: new THREE.Quaternion(...from[id].q).slerp(new THREE.Quaternion(...target[id].q), weight).toArray(),
      };
    }
    this.apply(poses);
  }
}
