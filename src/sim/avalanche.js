// A bounded, depth-averaged dense snow flow on terrain-following coordinates.
// Conservative Rusanov fluxes carry mass/momentum; a bed-gradient source drives gravity.
// Voellmy resistance: dry friction + velocity-squared drag. Powder is rendered separately.
import { clamp } from '../core/math.js';
import { mulberry32 } from '../core/noise.js';
import { surfaceType } from './body.js';

export const AVALANCHE = { cell: 8, size: 128, depth: .8, width: 60, length: 30, rho: 300, mu: .22, xi: 1200 };

export function findRelease(field, x, z) {
  let px = x, pz = z, best = null;
  for (let d = 0; d <= 400; d += 8) {
    // A broad uphill gradient avoids following a four-metre ice lump.
    const s = field.slope(px, pz, 16), a = Math.atan(s.mag)*180/Math.PI;
    if (d >= 100 && a >= 30 && a <= 50 && field.height(px,pz) > 5700 && surfaceType(field,px,pz)!=='rock') best = { x: px, z: pz };
    if (best && d >= 152) break;
    if (s.mag < .02) break;
    px += s.gx/s.mag*8; pz += s.gz/s.mag*8;
    if (px < field.x0+80 || px > field.x1-80 || pz < field.z0+80 || pz > field.z1-80) break;
  }
  return best;
}

export class Avalanche {
  constructor(field, source, options = {}) {
    Object.assign(this, AVALANCHE, options);
    this.field = field; this.source = source; this.seed = options.seed ?? 1;
    const n = this.size, count = n*n, s = field.slope(source.x,source.z,16);
    const down = Math.hypot(s.gx,s.gz);
    this.dx = down>.001?-s.gx/down:0; this.dz = down>.001?-s.gz/down:1;
    // Leave more domain below the fracture than above it.
    this.x0 = source.x + this.dx*n*this.cell*.2 - n*this.cell/2;
    this.z0 = source.z + this.dz*n*this.cell*.2 - n*this.cell/2;
    this.bed = new Float64Array(count); this.h = new Float64Array(count);
    this.qx = new Float64Array(count); this.qz = new Float64Array(count);
    this.dh = new Float64Array(count); this.dqx = new Float64Array(count); this.dqz = new Float64Array(count);
    this.gn = new Float64Array(count);
    const random = mulberry32(this.seed);
    for (let j=0;j<n;j++) for (let i=0;i<n;i++) {
      const k=j*n+i, x=this.x0+(i+.5)*this.cell, z=this.z0+(j+.5)*this.cell;
      this.bed[k] = field.height(x,z);
      const slope = field.slope(x,z,8).mag;
      this.gn[k] = 9.81/(1+slope*slope);
      const rx=x-source.x, rz=z-source.z, along=rx*this.dx+rz*this.dz, across=-rx*this.dz+rz*this.dx;
      if ((along/(this.length/2))**2+(across/(this.width/2))**2 < 1) this.h[k]=this.depth*(.9+.2*random());
    }
    this.initialVolume = this.volume(); this.escaped = 0;
    this.t = 0; this.quiet = 0; this.settled = false; this.accum = 0; this.maxSpeed = 0; this.maxWave = 4;
  }

  volume() { return this.h.reduce((a,b)=>a+b,0)*this.cell*this.cell; }
  sample(x,z) {
    const fx=(x-this.x0)/this.cell-.5, fz=(z-this.z0)/this.cell-.5;
    if (fx<0 || fz<0 || fx>this.size-1 || fz>this.size-1) return { depth:0, vx:0, vz:0 };
    const i=Math.min(this.size-2,Math.floor(fx)), j=Math.min(this.size-2,Math.floor(fz)), u=fx-i,v=fz-j;
    let depth=0,qx=0,qz=0;
    for (const [k,w] of [[j*this.size+i,(1-u)*(1-v)],[j*this.size+i+1,u*(1-v)],[(j+1)*this.size+i,(1-u)*v],[(j+1)*this.size+i+1,u*v]]) {
      depth+=this.h[k]*w; qx+=this.qx[k]*w; qz+=this.qz[k]*w;
    }
    return { depth, vx: depth>.02?qx/depth:0, vz:depth>.02?qz/depth:0 };
  }

  step(dt) {
    this.t += dt;
    if (this.settled) return;
    this.accum += dt;
    while (this.accum >= 1/30-1e-9) {
      let remaining=1/30;
      while (remaining>1e-8) {
        const hdt=Math.min(remaining,.35*this.cell/Math.max(1,this.maxWave));
        this.integrate(hdt); remaining-=hdt;
      }
      this.accum-=1/30;
      this.quiet=this.maxSpeed<.15 ? this.quiet+1/30:0;
      if (this.t>3 && this.quiet>1.5) { this.settled=true; this.qx.fill(0); this.qz.fill(0); break; }
    }
  }

  integrate(dt) {
    const n=this.size, H=this.h, X=this.qx, Z=this.qz, B=this.bed, dh=this.dh,dqx=this.dqx,dqz=this.dqz;
    dh.fill(0); dqx.fill(0); dqz.fill(0);
    const flux=(a,b,axis) => {
      const la=a>=0, rb=b>=0, ka=la?a:b,kb=rb?b:a;
      const ha=la?H[a]:0,hb=rb?H[b]:0;
      const l=ha,r=hb,gn=(this.gn[ka]+this.gn[kb])/2;
      const ua=ha>.001?X[ka]/ha:0, va=ha>.001?Z[ka]/ha:0,ub=hb>.001?X[kb]/hb:0,vb=hb>.001?Z[kb]/hb:0;
      const al=axis===0?ua:va,ar=axis===0?ub:vb;
      const speed=Math.max(Math.abs(al)+Math.sqrt(gn*l),Math.abs(ar)+Math.sqrt(gn*r));
      const fm=((l*al+r*ar)-speed*(r-l))*.5;
      const fx=((l*al*ua+r*ar*ub)-speed*(r*ub-l*ua))*.5+(axis===0?gn*(l*l+r*r)/4:0);
      const fz=((l*al*va+r*ar*vb)-speed*(r*vb-l*va))*.5+(axis===1?gn*(l*l+r*r)/4:0);
      const scale=dt/this.cell;
      if (la) { dh[a]-=fm*scale; dqx[a]-=fx*scale; dqz[a]-=fz*scale; }
      if (rb) { dh[b]+=fm*scale; dqx[b]+=fx*scale; dqz[b]+=fz*scale; }
      if (!la) this.escaped-=fm*dt*this.cell;
      if (!rb) this.escaped+=fm*dt*this.cell;
    };
    for(let j=0;j<n;j++) for(let i=0;i<=n;i++) flux(i>0?j*n+i-1:-1,i<n?j*n+i:-1,0);
    for(let j=0;j<=n;j++) for(let i=0;i<n;i++) flux(j>0?(j-1)*n+i:-1,j<n?j*n+i:-1,1);
    this.maxSpeed=0; this.maxWave=1;
    for(let k=0;k<H.length;k++) {
      const i=k%n,j=Math.floor(k/n),left=i>0?k-1:k,right=i<n-1?k+1:k,up=j>0?k-n:k,down=j<n-1?k+n:k;
      const gx=(B[right]-B[left])/((right-left||1)*this.cell),gz=(B[down]-B[up])/(((down-up)/n||1)*this.cell);
      dqx[k]-=this.gn[k]*H[k]*gx*dt; dqz[k]-=this.gn[k]*H[k]*gz*dt;
      H[k]=Math.max(0,H[k]+dh[k]); X[k]+=dqx[k]; Z[k]+=dqz[k];
      if(H[k]<.001) { X[k]=Z[k]=0; continue; }
      const speed=Math.hypot(X[k],Z[k])/H[k];
      // Solve quadratic drag implicitly, so drag cannot reverse or overshoot the flow.
      const slowed=Math.max(0,speed-this.mu*this.gn[k]*dt), drag=9.81*dt/(this.xi*Math.max(.05,H[k]));
      const v=2*slowed/(1+Math.sqrt(1+4*drag*slowed));
      const factor=speed>1e-8?clamp(v/speed,0,1):0; X[k]*=factor; Z[k]*=factor;
      if(H[k]>.02) this.maxSpeed=Math.max(this.maxSpeed,v);
      this.maxWave=Math.max(this.maxWave,v+Math.sqrt(this.gn[k]*H[k]));
    }
  }
}
