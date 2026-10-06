// Physical fall runtime. Walking stays kinematic; a fall hands the articulated body
// to Rapier. Physics runs in metres/seconds, never in the expedition's accelerated clock.
import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { BODY, FALL, AXE_PICK, surfaceType } from './body.js';
import { Avalanche, findRelease, AVALANCHE } from './avalanche.js';
import { TIME_SCALE } from '../config.js';
import { clamp } from '../core/math.js';
import { emit, toast } from '../core/events.js';
import { hypF, packLoad } from './physiology.js';
import { triangleHeight, querySupport } from './surface.js';

let ready;
export const initPhysics = () => ready ||= RAPIER.init();
const V = (a) => new THREE.Vector3(...a);
const q = new THREE.Quaternion(), rv = new THREE.Vector3(), av = new THREE.Vector3();
const key = (x,z) => `${x},${z}`;

export class PhysicsScene {
  constructor(game, { die = () => {} } = {}) {
    this.g = game; this.die = die; this.accum = 0; this.time = 0;
    this.world = null; this.avalanche = null; this.parts = new Map(); this.tiles = new Map();
    this.poses = {}; this.previous = {}; this.events = []; this.burial = null; this.preTrigger = null;
  }
  note(type, data = {}) {
    this.events.push({ type, t: this.time, ...data });
    if (this.events.length>128) this.events.shift();
    if (!this.g.free) emit(type, data);
  }
  groundHeight(x,z) {
    return Math.max(this.g.field.height(x,z),this.g.world?.routeFeatures?.sample(x,z)?.height??-Infinity)+(!this.g.world?.crevasseField?.at(x,z) && this.avalanche?.settled ? this.avalanche.sample(x,z).depth : 0);
  }
  contactHeight(x,z,y=this.g.P.y+1) {
    if(this.g.world?.crevasseField?.at(x,z))return querySupport(this.g,{x,y,z},100)?.height ?? -Infinity;
    return Math.max(triangleHeight(this.g.field,x,z),this.g.world?.routeFeatures?.sample(x,z)?.height??-Infinity)+(this.avalanche?.settled ? this.avalanche.sample(x,z).depth : 0);
  }
  disposeBody() {
    this.world?.free(); this.queue?.free(); this.world=null; this.queue=null;
    this.parts.clear(); this.tiles.clear(); this.poses={}; this.previous={}; this.accum=0;
  }
  reset() {
    this.disposeBody(); this.avalanche=null; this.burial=null; this.preTrigger=null;
    this.events=[]; this.time=0;
    this.g.P.falling=null; this.g.P.recovery=null; this.g.P.velocity=null; this.corpseSettled=false;
  }
  resetExperiment() {
    if (!this.g.free && !this.g.debug) return false;
    const before=this.preTrigger || (this.g.P.ski?.air && this.g.P.lastSupported ? {P:this.g.P.lastSupported,view:this.g.view}:null);
    this.reset();
    if (before) { Object.assign(this.g.P,before.P); Object.assign(this.g.view,before.view); }
    if(this.g.P.ski)Object.assign(this.g.P.ski,{air:null,u:0,w:0,speed:0});
    const safe=this.g.world?.crevasseField?.safePosition(this.g.P.x,this.g.P.z);
    if(safe)Object.assign(this.g.P,safe);
    if(!this.g.world?.crevasseField?.at(this.g.P.x,this.g.P.z))this.g.P.y=this.groundHeight(this.g.P.x,this.g.P.z);
    this.g.auto=null; emit('teleported');
    toast('Snow and fall experiment reset.', 'info', 3);
    return true;
  }
  triggerAvalanche({ source = null, seed = this.g.S.seed ?? 1, ...options } = {}) {
    const { P, field }=this.g;
    if (P.falling || (this.avalanche && !this.avalanche.settled)) { toast('Let this experiment finish first.', 'warn', 3); return false; }
    if (this.avalanche?.sample(P.x,P.z).depth>.2 && !this.g.free && !this.g.debug) { toast('Move off the deposited snow before another release.', 'warn', 3); return false; }
    const release=source || findRelease(field,P.x,P.z);
    if (!release) { toast('No suitable snow slope uphill here. Try the Lhotse Face or Nuptse north face.', 'info', 4); return false; }
    this.preTrigger={ P:{ x:P.x,y:this.groundHeight(P.x,P.z),z:P.z,facing:P.facing,clipped:P.clipped },view:{...this.g.view} };
    this.avalanche=new Avalanche(field,release,{seed,crevasseField:this.g.world?.crevasseField,...options});
    this.burial=null; this.g.auto=null;
    this.note('avalanche',{ x:release.x,z:release.z,volume:this.avalanche.initialVolume });
    toast('A slab fractures uphill. Watch the slope!', 'warn', 5);
    return true;
  }
  testFall() {
    if(!this.g.free && !this.g.debug) return false;
    const {P,field}=this.g,s=field.slope(P.x,P.z,16),m=s.mag;
    const v=P.velocity && Math.hypot(P.velocity.x,P.velocity.z)>1 ? P.velocity : {
      x:m>.05?-s.gx/m*2:-Math.sin(P.facing)*2,
      y:m>.05?-m*2:0,
      z:m>.05?-s.gz/m*2:-Math.cos(P.facing)*2,
    };
    return this.startFall({reason:'slip',velocity:v,heightOffset:.25});
  }
  startFall({ velocity = null, heightOffset = 0, region = 'mountainside', reason = 'slip' } = {}) {
    const { P,S }=this.g;
    if (P.falling) return false;
    this.disposeBody(); this.burial=null;
    if(!this.preTrigger && (this.g.free || this.g.debug)) this.preTrigger={P:{x:P.x,y:P.y,z:P.z,facing:P.facing,clipped:P.clipped,...(reason==='crevasse'?P.lastSupported:{})},view:{...this.g.view}};
    this.origin={x:P.x,y:this.groundHeight(P.x,P.z),z:P.z};
    this.deposit=this.avalanche?.settled ? this.avalanche : null;
    this.world=new RAPIER.World({x:0,y:-FALL.gravity,z:0});
    this.world.timestep=FALL.dt;
    this.world.integrationParameters.numSolverIterations=8;
    this.world.integrationParameters.maxCcdSubsteps=4;
    this.queue=new RAPIER.EventQueue(true);
    const yaw=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),P.facing);
    const v=velocity || P.velocity || {x:0,y:0,z:0};
    for (const def of BODY) {
      const p=V(def.p).applyQuaternion(yaw); p.y+=P.y-this.origin.y+heightOffset;
      const rb=this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(p.x,p.y,p.z).setRotation(yaw)
        .setLinvel(v.x||0,v.y||0,v.z||0).setLinearDamping(.04).setAngularDamping(.6).setCcdEnabled(true));
      const desc=def.half ? RAPIER.ColliderDesc.capsule(def.half,def.radius):RAPIER.ColliderDesc.ball(def.radius);
      const mass=def.mass+(def.id==='torso'?packLoad(S):0);
      // Multiplying by the terrain coefficient preserves snow/ice/rock differences.
      // Joint bounds constrain the pose; overlapping clothing capsules skip self-contact.
      const collider=this.world.createCollider(desc.setMass(mass).setFriction(1).setFrictionCombineRule(RAPIER.CoefficientCombineRule.Multiply).setRestitution(FALL.restitution)
        .setCollisionGroups(0x00010002).setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS),rb);
      this.parts.set(def.id,{def,rb,collider,mass,impactAt:-1,pre:new THREE.Vector3()});
      if (def.parent) {
        const parent=this.parts.get(def.parent), a=V(def.joint).sub(V(parent.def.p)), b=V(def.joint).sub(V(def.p));
        const data=def.hinge ? RAPIER.JointData.revolute(a,b,{x:1,y:0,z:0}):RAPIER.JointData.spherical(a,b);
        const joint=this.world.createImpulseJoint(data,parent.rb,rb,true); joint.setContactsEnabled(false);
        if(def.hinge) joint.setLimits(...def.hinge);
        this.parts.get(def.id).joint=joint;
      }
    }
    // A trip starts a small rotation; subsequent rotation comes from contacts and inertia.
    if(reason==='slip') this.parts.get('torso').rb.applyTorqueImpulse({x:-Math.cos(P.facing)*2,y:0,z:Math.sin(P.facing)*2},true);
    this.streamTerrain();
    this.ropeAnchor=null;
    if(P.clipped>=0) {
      const points=this.g.world.ropes[P.clipped]?.pts || [];
      let p=null,d=Infinity;
      for(const point of points) { const dd=Math.hypot(point.x-P.x,point.z-P.z); if(dd<d) { d=dd; p=point; } }
      if(p) {
        this.ropeAnchor={...p};
        const anchor=this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(p.x-this.origin.x,p.y-this.origin.y,p.z-this.origin.z));
        this.world.createImpulseJoint(RAPIER.JointData.rope(3,{x:0,y:0,z:0},{x:0,y:0,z:0}),anchor,this.parts.get('pelvis').rb,true);
      }
    }
    P.falling={t:0,startY:P.y,maxV:0,region,reason,phase:'falling',crevasseId:this.g.world?.crevasseField?.at(P.x,P.z)?.id ?? null,arresting:false,incapacitated:false,impact:0};
    P.recovery=null;
    P.ski=null; P.onLadder=false; P.moving=false; P.sprint=false; this.g.auto=null;
    this.still=0; this.deadStill=0; this.axeContact=0; this.dugOut=false; this.corpseSettled=false; this.capture(); this.previous=this.poses;
    if(!this.g.free) { S.falls++; emit('fall',region,P.y); }
    this.note('knockdown',{reason});
    toast(reason==='avalanche'?'Caught in moving snow!':reason==='crevasse'?'Falling into a crevasse!':'You fell — hold SPACE to self-arrest.', 'warn', 4);
    return true;
  }
  streamTerrain() {
    const deposit=this.avalanche?.settled ? this.avalanche : null;
    if(this.deposit!==deposit) {
      for(const tile of this.tiles.values()) for(const c of tile.colliders) this.world.removeCollider(c,true);
      this.tiles.clear(); this.deposit=deposit;
    }
    const {field,P}=this.g, cell=field.cell || 4, cells=Math.max(4,Math.round(128/cell)), size=cells*cell;
    const cx=Math.floor((P.x-field.x0)/size),cz=Math.floor((P.z-field.z0)/size);
    for(const [name,tile] of this.tiles) if(Math.abs(tile.cx-cx)>1 || Math.abs(tile.cz-cz)>1) {
      for(const c of tile.colliders) this.world.removeCollider(c,true); this.tiles.delete(name);
    }
    for(let j=cz-1;j<=cz+1;j++) for(let i=cx-1;i<=cx+1;i++) {
      const name=key(i,j); if(this.tiles.has(name)) continue;
      const x0=field.x0+i*size,z0=field.z0+j*size,positions=[],buckets={snow:[],ice:[],rock:[]};
      for(let z=0;z<=cells;z++) for(let x=0;x<=cells;x++){
        const wx=x0+x*cell,wz=z0+z*cell;
        // Local shelves have their own exact colliders below; do not smear them
        // into the four-metre terrain collision grid.
        const h=field.height(wx,wz)+(deposit&&!this.g.world?.crevasseField?.at(wx,wz)?deposit.sample(wx,wz).depth:0);
        positions.push(wx-this.origin.x,h-this.origin.y,wz-this.origin.z);
      }
      for(let z=0;z<cells;z++) for(let x=0;x<cells;x++) {
        const a=z*(cells+1)+x,b=a+1,c=a+cells+1,d=c+1;
        buckets[surfaceType(field,x0+(x+.5)*cell,z0+(z+.5)*cell)].push(a,c,b,b,c,d);
      }
      const colliders=[];
      for(const r of this.g.world?.routeFeatures?.records||[])if(r.x>=x0&&r.x<x0+size&&r.z>=z0&&r.z<z0+size){
        const vertices=Float32Array.from(r.position,(value,k)=>value-[this.origin.x,this.origin.y,this.origin.z][k%3]);
        if(deposit)for(let k=0;k<vertices.length;k+=3)vertices[k+1]+=deposit.sample(r.position[k],r.position[k+2]).depth;
        colliders.push(this.world.createCollider(RAPIER.ColliderDesc.trimesh(vertices,r.index).setFriction(FALL.friction.snow).setRestitution(FALL.restitution).setCollisionGroups(0x00020001)));
      }
      const holes=this.g.world?.crevasseField,candidates=holes?.nearby({x0,x1:x0+size,z0,z1:z0+size})||[];
      for(const [type,idx] of Object.entries(buckets)) if(idx.length) {
        let vertices=positions,indices=idx;
        if(candidates.length) {
          vertices=[];
          for(let k=0;k<idx.length;k+=3) {
            const tri=idx.slice(k,k+3).map(index=>[positions[index*3]+this.origin.x,positions[index*3+1]+this.origin.y,positions[index*3+2]+this.origin.z]);
            for(const p of holes.cutTriangle(tri,candidates))vertices.push(p[0]-this.origin.x,p[1]-this.origin.y,p[2]-this.origin.z);
          }
          indices=Array.from({length:vertices.length/3},(_,k)=>k);
        }
        if(indices.length)colliders.push(this.world.createCollider(RAPIER.ColliderDesc.trimesh(new Float32Array(vertices),new Uint32Array(indices))
          .setFriction(FALL.friction[type]).setRestitution(FALL.restitution).setCollisionGroups(0x00020001)));
      }
      for(const cv of candidates)if(cv.x>=x0 && cv.x<x0+size && cv.z>=z0 && cv.z<z0+size) {
        const vertices=cv.geometry.flatMap(p=>[p[0]-this.origin.x,p[1]-this.origin.y,p[2]-this.origin.z]);
        colliders.push(this.world.createCollider(RAPIER.ColliderDesc.trimesh(new Float32Array(vertices),new Uint32Array(Array.from({length:vertices.length/3},(_,k)=>k)))
          .setFriction(FALL.friction.ice).setCollisionGroups(0x00020001).setRestitution(FALL.restitution)));
        for(const part of cv.ladderParts||[])colliders.push(this.world.createCollider(RAPIER.ColliderDesc.cuboid(...part.half)
          .setTranslation(part.center.x-this.origin.x,part.center.y-this.origin.y,part.center.z-this.origin.z).setRotation(part.rotation).setFriction(.5).setCollisionGroups(0x00020001)));
      }
      // Static seracs close enough to this tile to matter during a tumble.
      for(const list of this.g.world?.seracGrid?.values() || []) for(const s of list) {
        if(s.x<x0 || s.x>=x0+size || s.z<z0 || s.z>=z0+size) continue;
        colliders.push(this.world.createCollider(RAPIER.ColliderDesc.ball(s.r).setTranslation(s.x-this.origin.x,field.height(s.x,s.z)+s.r*.5-this.origin.y,s.z-this.origin.z)
          .setFriction(.5).setCollisionGroups(0x00020001)));
      }
      this.tiles.set(name,{cx:i,cz:j,colliders});
    }
  }
  capture() {
    this.poses={};
    for(const [id,{rb}] of this.parts) {
      const p=rb.translation(),r=rb.rotation();
      this.poses[id]={ p:[p.x+this.origin.x,p.y+this.origin.y,p.z+this.origin.z], q:[r.x,r.y,r.z,r.w] };
    }
  }
  pose(alpha=this.accum/FALL.dt) {
    const out={};
    for(const [id,p] of Object.entries(this.poses)) {
      const prev=this.previous[id]||p;
      const rot=new THREE.Quaternion(...prev.q).slerp(new THREE.Quaternion(...p.q),clamp(alpha,0,1));
      out[id]={p:p.p.map((v,i)=>prev.p[i]+(v-prev.p[i])*clamp(alpha,0,1)),q:rot.toArray()};
    }
    return out;
  }
  muscles(dt, arrest) {
    const f=this.g.P.falling, conscious=!f.incapacitated && this.g.mode!=='dead';
    for(const part of this.parts.values()) {
      const {def,rb,joint}=part; if(!def.parent) continue;
      const parent=this.parts.get(def.parent).rb;
      if(def.hinge) {
        joint.configureMotorPosition(conscious ? (def.id.startsWith('forearm')?-.65:.25):0,conscious?14:0,conscious?3:1);
        joint.setMotorMaxForce(conscious?35:0);
      } else {
        q.copy(parent.rotation()).invert().multiply(new THREE.Quaternion().copy(rb.rotation()));
        if(q.w<0) q.set(-q.x,-q.y,-q.z,-q.w);
        const angle=2*Math.acos(clamp(q.w,-1,1)), sin=Math.sqrt(Math.max(1e-10,1-q.w*q.w));
        rv.set(q.x,q.y,q.z).multiplyScalar(angle/sin);
        const w1=parent.angvel(),w2=rb.angvel();
        av.set(w2.x-w1.x,w2.y-w1.y,w2.z-w1.z).applyQuaternion(new THREE.Quaternion().copy(parent.rotation()).invert());
        const target=def.id.startsWith('arm')?(arrest?1.25:.5):0;
        const torque=new THREE.Vector3();
        for(let axis=0;axis<3;axis++) {
          const value=rv.getComponent(axis), limit=def.limits[axis], excess=value-clamp(value,-limit,limit);
          const active=conscious?6:0,goal=axis===0?target:0;
          torque.setComponent(axis,clamp(-90*excess-active*(value-goal)-.8*av.getComponent(axis),-80,80)*dt);
        }
        torque.applyQuaternion(parent.rotation()); rb.applyTorqueImpulse(torque,true); parent.applyTorqueImpulse(torque.clone().negate(),true);
      }
    }
  }
  arrest(dt, requested) {
    const {P,S,field}=this.g,f=P.falling;
    f.arresting=false;
    this.axeContact=Math.max(0,this.axeContact-dt);
    if(!requested || f.incapacitated || this.g.mode==='dead' || S.stamina<=0 || this.burial?.cover>0) { this.axeContact=0; return; }
    const arm=this.parts.get('forearm1').rb, p=arm.translation();
    // Match the visible pick at the head of the axe, held in the right hand.
    const tip=new THREE.Vector3(...AXE_PICK).applyQuaternion(arm.rotation()).add(p);
    const x=tip.x+this.origin.x,z=tip.z+this.origin.z,y=tip.y+this.origin.y;
    const torso=this.parts.get('torso').rb, prone=new THREE.Vector3(0,0,-1).applyQuaternion(torso.rotation());
    // The axe must reach the snow and face into the slope. No braking in mid-air.
    const holes=this.g.world?.crevasseField,ice=holes?.contact({x,y,z},.3);
    const gap=ice?ice.distance:y-this.contactHeight(x,z,y+.2);
    if(gap<.3 && prone.y<.5) this.axeContact=.2;
    if(gap>.6 || gap<-.3 || prone.y>.6 || !this.axeContact) return;
    const v=torso.linvel(), speed=Math.hypot(v.x,v.y,v.z); if(speed<.01) return;
    const material=ice?'ice':surfaceType(field,x,z), grip=material==='ice'?.18:material==='rock'?.12:1;
    const strength=FALL.arrestForce*grip*hypF(S)*clamp(S.stamina/20,0,1)/(1+(speed/15)**2);
    const mass=[...this.parts.values()].reduce((sum,p)=>sum+p.mass,0);
    const impulse=Math.min(strength*dt,mass*speed*.25);
    for(const part of this.parts.values()) part.rb.applyImpulse({x:-v.x/speed*impulse*part.mass/mass,y:-v.y/speed*impulse*part.mass/mass,z:-v.z/speed*impulse*part.mass/mass},true);
    S.stamina=Math.max(0,S.stamina-FALL.arrestStamina*dt); f.arresting=true;
  }
  brace(dt, requested) {
    const {P,S,field}=this.g,f=P.falling;
    if(!requested || f.incapacitated || this.g.mode==='dead' || S.stamina<=0 || this.burial) return;
    const torso=this.parts.get('torso').rb,p=torso.translation(),x=p.x+this.origin.x,z=p.z+this.origin.z;
    if(p.y+this.origin.y>this.contactHeight(x,z,p.y+this.origin.y)+.8) return;
    // Use ground contact to roll onto the stomach before planting the pick.
    // This is a bounded bracing torque, never a pose snap or an airborne rotation.
    const s=field.slope(x,z,8),normal=new THREE.Vector3(-s.gx,1,-s.gz).normalize();
    const axis=new THREE.Vector3(0,1,0).applyQuaternion(torso.rotation());
    const target=normal.addScaledVector(axis,-normal.dot(axis)).normalize();
    const back=new THREE.Vector3(0,0,1).applyQuaternion(torso.rotation());
    const angle=Math.atan2(axis.dot(new THREE.Vector3().crossVectors(back,target)),back.dot(target)),w=torso.angvel();
    const effort=clamp(80*angle-12*axis.dot(w),-180,180)*hypF(S)*clamp(S.stamina/20,0,1);
    const impulse=axis.multiplyScalar(effort*dt);
    torso.applyTorqueImpulse(impulse.clone().multiplyScalar(.6),true);
    this.parts.get('pelvis').rb.applyTorqueImpulse(impulse.multiplyScalar(.4),true);
    S.stamina=Math.max(0,S.stamina-2*dt);
  }
  snowForces(dt) {
    const A=this.avalanche; if(!A || A.settled) return;
    for(const part of this.parts.values()) {
      const p=part.rb.translation(),x=p.x+this.origin.x,z=p.z+this.origin.z,y=p.y+this.origin.y;
      if(this.g.world?.crevasseField?.at(x,z))continue;
      const s=A.sample(x,z), surface=triangleHeight(this.g.field,x,z)+s.depth;
      const submerged=clamp((surface-y+part.def.radius)/(2*part.def.radius),0,1);
      if(s.depth<.04 || !submerged) continue;
      const sl=this.g.field.slope(x,z,8),targetY=sl.gx*s.vx+sl.gz*s.vz,v=part.rb.linvel();
      const relative=new THREE.Vector3(s.vx-v.x,targetY-v.y,s.vz-v.z),speed=relative.length();
      const rate=.5*AVALANCHE.rho*(part.def.radius*4*(part.def.half+part.def.radius))*submerged*speed/part.mass;
      // Implicit drag approaches the flow velocity without numerical overshoot.
      part.rb.applyImpulse(relative.multiplyScalar(part.mass*(rate*dt/(1+rate*dt))),true);
    }
  }
  updateBurial(dt, arrest) {
    const A=this.avalanche; if(!A) return;
    const head=this.parts.get('head').rb.translation(),x=head.x+this.origin.x,z=head.z+this.origin.z;
    const snow=this.g.world?.crevasseField?.at(x,z)?{depth:0}:A.sample(x,z),cover=triangleHeight(this.g.field,x,z)+snow.depth-(head.y+this.origin.y+.1);
    if(snow.depth>.1 && (cover>.1 || (this.burial && cover>-.05))) {
      if(!this.burial) { this.burial={cover,air:180,shallow:cover<=.6}; this.note('burial',{depth:cover}); }
      Object.assign(this.burial,{cover,shallow:cover<=.6});
      if(A.settled) {
        for(const {rb} of this.parts.values()) rb.setBodyType(RAPIER.RigidBodyType.Fixed,true);
        if(arrest && (cover<=.6 || this.g.free)) for(const {rb} of this.parts.values()) {
          const p=rb.translation(); rb.setTranslation({x:p.x,y:p.y+dt*.25,z:p.z},true);
        }
      }
      if(!this.g.free && this.g.mode==='play') {
        this.burial.air=Math.max(0,this.burial.air-dt*TIME_SCALE);
        if(this.burial.air===0) this.g.S.health-=20/60*dt*TIME_SCALE;
        if(this.g.S.health<=0) this.fatal('Buried in avalanche debris — the air ran out.');
      }
    } else if(this.burial) {
      this.note('escaped-burial'); this.burial=null;
      this.dugOut=!!A.settled;
      for(const {rb} of this.parts.values()) rb.setBodyType(RAPIER.RigidBodyType.Dynamic,true);
    }
  }
  fatal(cause) {
    if(this.g.free || this.g.mode==='dead') return;
    if(this.g.P.falling) this.g.P.falling.incapacitated=true;
    this.die(cause);
  }
  step(dt, control = {}) {
    if(this.g.P.recovery) { this.g.P.recovery.t+=dt; if(this.g.P.recovery.t>.8) this.g.P.recovery=null; }
    if(!this.hasMotion()) return;
    this.accum+=dt;
    while(this.accum>=FALL.dt-1e-9) {
      this.time+=FALL.dt; this.avalanche?.step(FALL.dt);
      if(!this.g.P.falling && this.avalanche && !this.avalanche.settled && this.g.mode==='play') {
        const {P}=this.g,s=this.avalanche.sample(P.x,P.z);
        if(s.depth>.12 && s.depth*Math.hypot(s.vx,s.vz)>1) {
          // startFall resets the body accumulator; preserve the elapsed scene time.
          const accumulated=this.accum;
          this.startFall({reason:'avalanche',velocity:P.velocity}); this.accum=accumulated;
        }
      }
      if(this.g.P.falling && this.world && !this.corpseSettled) this.tick(FALL.dt,!!control?.arrest);
      this.accum-=FALL.dt;
    }
    this.accum=Math.max(0,this.accum);
  }
  hasMotion() { return (this.g.P.falling && !['trapped','suspended'].includes(this.g.P.falling.phase) && !this.corpseSettled) || (this.avalanche && !this.avalanche.settled); }
  tick(dt, arrest) {
    const {P,S}=this.g,f=P.falling; f.t+=dt; f.impact*=Math.exp(-dt*8);
    // Pin buried bodies before installing solid deposit colliders, avoiding an ejection.
    if(this.avalanche?.settled) this.updateBurial(0,false);
    this.streamTerrain();
    for(const part of this.parts.values()) part.pre.copy(part.rb.linvel());
    this.brace(dt,arrest); this.muscles(dt,arrest); this.arrest(dt,arrest); this.snowForces(dt);
    this.previous=this.poses; this.world.step(this.queue);
    this.queue.drainContactForceEvents((e)=> {
      if([...this.parts.values()].filter((p)=>p.collider.handle===e.collider1()||p.collider.handle===e.collider2()).length===2) return;
      const part=[...this.parts.values()].find((p)=>p.collider.handle===e.collider1()||p.collider.handle===e.collider2());
      if(!part || this.dugOut || f.t<.12 || f.t-part.impactAt<.2) return;
      const n=e.maxForceDirection(),vn=Math.abs(part.pre.x*n.x+part.pre.y*n.y+part.pre.z*n.z);
      if(vn<3 || e.totalForceMagnitude()*dt<part.mass*.8) return;
      part.impactAt=f.t;
      // A feet-first collision transmits the rest of the body's momentum too.
      const effectiveMass=Math.max(part.mass,Math.min(70+packLoad(S),e.totalForceMagnitude()*dt/vn));
      const energy=.5*effectiveMass*Math.max(0,vn*vn-9),weight=part.def.id==='head'?4:part.def.id==='torso'?1.3:.8;
      const damage=energy*.018*weight;
      f.impact=clamp(vn/15,0,1); this.note('impact',{part:part.def.id,speed:vn,damage});
      if(!this.g.free && this.g.mode==='play') { S.health-=damage; if(S.health<=0) this.fatal(`Fatal impact during a fall on the ${f.region}.`); }
    });
    this.updateBurial(dt,arrest); this.capture();
    const pelvis=this.parts.get('pelvis').rb, p=pelvis.translation(),v=pelvis.linvel();
    if(this.g.mode==='play') S.distance+=Math.hypot(p.x+this.origin.x-P.x,p.z+this.origin.z-P.z);
    P.x=p.x+this.origin.x; P.z=p.z+this.origin.z; P.y=p.y+this.origin.y-.91;
    f.maxV=Math.max(f.maxV,Math.hypot(v.x,v.y,v.z));
    const moving=[...this.parts.values()].map(({rb,mass})=>{const v=rb.linvel();return {mass,speed:Math.hypot(v.x,v.y,v.z)};});
    const speed=Math.max(...moving.map((p)=>p.speed));
    // Small hand motions while bracing must not keep a stationary climber helpless.
    const bodySpeed=Math.sqrt(moving.reduce((sum,p)=>sum+p.mass*p.speed*p.speed,0)/moving.reduce((sum,p)=>sum+p.mass,0));
    const angularSpeed=Math.max(...[...this.parts.values()].map(({rb})=>{const w=rb.angvel();return Math.hypot(w.x,w.y,w.z);}));
    const holes=this.g.world?.crevasseField,cv=holes?.at(P.x,P.z),below=cv && P.y<this.g.field.height(P.x,P.z)-.4;
    const suspended=below && this.ropeAnchor && Math.hypot(p.x+this.origin.x-this.ropeAnchor.x,p.y+this.origin.y-this.ropeAnchor.y,p.z+this.origin.z-this.ropeAnchor.z)>2.65;
    const contact=p.y+this.origin.y-this.contactHeight(P.x,P.z,p.y+this.origin.y)<1.3 || suspended;
    const snow=this.avalanche?.sample(P.x,P.z);
    this.still=contact && bodySpeed<FALL.recoverySpeed && speed<1.5 && !this.burial && (!snow || Math.hypot(snow.vx,snow.vz)<.4)?this.still+dt:0;
    if(this.g.mode==='dead') {
      this.deadStill=speed<.15 && angularSpeed<.25?this.deadStill+dt:0;
      if(this.deadStill>2) { this.corpseSettled=true; for(const {rb} of this.parts.values()) rb.sleep(); }
    }
    if((this.still>FALL.recoveryDelay || this.dugOut) && this.g.mode==='play') {
      if(below) {
        f.phase=suspended?'suspended':'trapped';f.crevasseId=cv.id;P.velocity=null;
        for(const {rb} of this.parts.values())rb.sleep();this.note(f.phase,{id:cv.id});
        toast(suspended?'Suspended from the fixed line.':'Trapped below the crevasse rim. No rescue equipment is available.', 'warn', 5);return;
      }
      // Recovery requires real standing support. A rim or wall contact must not
      // restore the walking avatar above an empty aperture.
      const support=querySupport(this.g,{x:P.x,y:this.dugOut&&!cv?this.groundHeight(P.x,P.z):p.y+this.origin.y,z:P.z},1.5);
      if(!support || support.kind==='cavity')return;
      const pose=this.pose(1), wasArrest=f.arresting, height=support.height;
      this.disposeBody(); P.falling=null; P.y=height; P.velocity=null; P.recovery={pose,t:0};
      this.note('recovered'); toast(wasArrest?'Self-arrest — stopped with the ice axe.':'You stopped. Find stable ground and clip in.', 'warn', 4);
    }
    const field=this.g.field;
    if(this.g.mode==='play' && (P.x<field.x0+10 || P.x>field.x1-10 || P.z<field.z0+10 || P.z>field.z1-10)) this.fatal('Fell beyond the climbing area.');
  }
}
