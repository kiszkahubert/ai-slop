import { PhysicsScene } from '../../src/sim/physics.js';

export function fixture({slope=0,type='snow',free=true}={}) {
  const field={x0:-1024,z0:-1024,x1:1024,z1:1024,cell:4,nx:513,nz:513,height:(x,z)=>6000-slope*z,
    slope:()=>({gx:0,gz:-slope,mag:slope}),surfaceType:()=>type,glacierAt:()=>1};
  const g={field,free,mode:'play',auto:null,view:{fp:true,yaw:0,pitch:-.15,dist:7},
    P:{x:0,y:6000,z:0,facing:0,clipped:-1,falling:null,velocity:null},
    S:{health:100,stamina:100,spo2:95,exh:0,tanks:[],seed:7,falls:0,distance:0},world:{ropes:[],seracGrid:new Map()}};
  g.physics=new PhysicsScene(g,{die:(cause)=>{g.mode='dead';g.S.cause=cause;}});return g;
}
export const step=(g,t,hz=60,arrest=false)=>{for(let i=0;i<Math.round(t*hz);i++)g.physics.step(1/hz,{arrest});};
