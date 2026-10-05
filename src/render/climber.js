// Walking poses and physical poses share the eleven articulated body parts.
import * as THREE from 'three';
import { BODY } from '../sim/body.js';
import { clamp } from '../core/math.js';

export function makeClimber(scene) {
  const g=new THREE.Group(), parts=new Map(); scene.add(g);
  const M=(color,options={})=>new THREE.MeshStandardMaterial({color,roughness:.75,...options});
  const suit=M(0xd42a1e),pants=M(0x1d2633),dark=M(0x15171a),boot=M(0xe0b800),metal=M(0x999999,{metalness:.8});
  const mk=(geo,mat,x,y,z,parent)=> { const mesh=new THREE.Mesh(geo,mat); mesh.position.set(x,y,z); mesh.castShadow=mesh.receiveShadow=true; parent.add(mesh); return mesh; };
  for(const def of BODY) {
    const node=new THREE.Group(); g.add(node); parts.set(def.id,node);
    const material=def.id==='head'?M(0xc58c64):def.id==='pelvis'||def.id.startsWith('thigh')||def.id.startsWith('shin')?pants:suit;
    mk(def.half?new THREE.CapsuleGeometry(def.radius,def.half*2,4,10):new THREE.SphereGeometry(def.radius,14,10),material,0,0,0,node);
    if(def.id.startsWith('shin')) mk(new THREE.BoxGeometry(.16,.14,.3),boot,0,-.18,-.04,node);
    if(def.id.startsWith('forearm')) mk(new THREE.SphereGeometry(.08,8,6),dark,0,-.18,0,node);
  }
  const torso=parts.get('torso'),head=parts.get('head');
  mk(new THREE.BoxGeometry(.46,.6,.26),M(0xf2b01e),0,-.05,.27,torso);
  mk(new THREE.CylinderGeometry(.075,.075,.56,10),M(0xe85d10,{metalness:.4}),.14,.07,.44,torso).rotation.z=.1;
  mk(new THREE.SphereGeometry(.16,14,8,0,Math.PI*2,0,Math.PI/2),M(0xf4f4f4,{roughness:.4}),0,.02,.01,head).scale.set(1,.85,1.05);
  mk(new THREE.BoxGeometry(.24,.07,.06),M(0x223355,{metalness:.6,roughness:.2}),0,.01,-.13,head);
  mk(new THREE.CylinderGeometry(.06,.07,.1,10),dark,0,-.09,-.14,head).rotation.x=Math.PI/2;
  const axe=new THREE.Group(); axe.position.set(0,-.18,0); parts.get('forearm1').add(axe);
  mk(new THREE.BoxGeometry(.03,.62,.03),dark,0,-.2,-.05,axe);
  mk(new THREE.BoxGeometry(.03,.04,.28),metal,0,.08,-.05,axe);
  const skis=new THREE.Group(); g.add(skis);
  for(const s of [-1,1]) {
    mk(new THREE.BoxGeometry(.09,.025,1.7),M(0x1f6fd1,{roughness:.35}),.13*s,.03,.05,skis);
    mk(new THREE.BoxGeometry(.09,.025,.18),M(0xf4f4f4),.13*s,.07,-.86,skis).rotation.x=.45;
  }
  const poles=[0,1].map((i)=> {
    const p=new THREE.Group(); p.position.set(0,-.18,0); parts.get(`forearm${i}`).add(p);
    mk(new THREE.CylinderGeometry(.012,.012,1.15,6),dark,0,-.5,.05,p);
    mk(new THREE.CylinderGeometry(.05,.05,.01,10),dark,0,-.95,.05,p); return p;
  });
  const vector=(a)=>new THREE.Vector3(...a), rotation=(x=0,y=0,z=0)=>new THREE.Quaternion().setFromEuler(new THREE.Euler(x,y,z));
  return { group:g, parts,
    update(dt,P,physics) {
      const K=P.ski,physical=P.falling&&physics?.parts.size?physics.pose():null;
      skis.visible=!!K; poles.forEach((p)=>{p.visible=!!K;}); axe.visible=!K;
      if(physical) {
        g.position.set(0,0,0); g.quaternion.identity();
        for(const [id,pose] of Object.entries(physical)) { const node=parts.get(id); node.position.fromArray(pose.p); node.quaternion.fromArray(pose.q); }
        return;
      }
      g.position.set(P.x,P.y,P.z);
      const lean=K?(K.tuck?-.45:K.brake?-.05:-.18):P.moving&&P.grade>.5?-.12:0;
      g.quaternion.setFromEuler(new THREE.Euler(lean,P.facing,0,'YXZ'));
      const sw=Math.sin(P.phase)*(P.moving?.65:0), local={};
      for(const def of BODY) {
        const node=parts.get(def.id); let x=0,z=0;
        if(def.id.startsWith('thigh')) { x=K?-lean*.6:(def.id.endsWith('0')?sw:-sw); z=K&&K.brake?(def.id.endsWith('0')?.12:-.12):0; }
        if(def.id.startsWith('shin')) x=K?.2:Math.max(0,(def.id.endsWith('0')?-sw:sw)*.5);
        if(def.id.startsWith('arm')) x=K?(K.tuck?-1.1:-.35):(def.id.endsWith('0')?-sw*.8:sw*.8-(P.grade>.5?.9:.2));
        if(def.id.startsWith('forearm')) x=K?-.3:-.15;
        const r=rotation(x,0,z);
        if(!def.parent) local[def.id]={p:vector(def.p),q:r};
        else {
          const parent=local[def.parent],pd=BODY.find((d)=>d.id===def.parent),q=parent.q.clone().multiply(r);
          const anchor=vector(def.joint).sub(vector(pd.p)).applyQuaternion(parent.q).add(parent.p);
          const p=vector(def.p).sub(vector(def.joint)).applyQuaternion(q).add(anchor);
          local[def.id]={p,q};
        }
        node.position.copy(local[def.id].p); node.quaternion.copy(local[def.id].q);
      }
      poles.forEach((p)=>{p.rotation.x=K?.tuck?1.9:.5;}); skis.rotation.x=(K?.pitch||0)-lean;
      if(P.recovery) {
        g.updateMatrixWorld(true);
        const poses={},t=clamp(P.recovery.t/.8,0,1),w=t*t*(3-2*t);
        for(const [id,node] of parts) {
          const from=P.recovery.pose[id],to=g.localToWorld(node.position.clone()),rot=g.quaternion.clone().multiply(node.quaternion);
          poses[id]={p:vector(from.p).lerp(to,w),q:new THREE.Quaternion(...from.q).slerp(rot,w)};
        }
        g.position.set(0,0,0); g.quaternion.identity();
        for(const [id,pose] of Object.entries(poses)) { parts.get(id).position.copy(pose.p); parts.get(id).quaternion.copy(pose.q); }
      }
    },
  };
}
