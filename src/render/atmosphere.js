// Atmosphere: height-and-distance fog with aerial perspective (installed into three's fog shader chunks, so every
// material gets it), valley mist layers, and wind-blown snow scaled to the wind the HUD shows.
import * as THREE from 'three';
import { VISUALS } from '../config.js';
import { clamp, lerp, smoothstep, D2R } from '../core/math.js';
import { mulberry32 } from '../core/noise.js';
import { fbm } from './proceduralTextures.js';

/**
 * Fog = exp2 fog over the ray's optical length through air that thins with altitude. Looking horizontally it is
 * exactly the old fog (so the HUD visibility still means what it says), looking down into valleys it is thicker and
 * looking up at summits thinner. Distant ranges shift toward a hazy blue (aerial perspective).
 * Call once, before anything is rendered.
 */
export function installAtmosphericFog() {
  const F = VISUALS.fog, f = (v) => v.toFixed(6), tint = `vec3(${F.aerialTint.map(f).join(', ')})`;
  THREE.ShaderChunk.fog_pars_vertex = `#ifdef USE_FOG
    varying float vFogDepth;
    varying vec3 vFogWorld;
  #endif`;
  THREE.ShaderChunk.fog_vertex = `#ifdef USE_FOG
    vFogDepth = - mvPosition.z;
    vFogWorld = transpose( mat3( viewMatrix ) ) * ( mvPosition.xyz - viewMatrix[ 3 ].xyz );
  #endif`;
  THREE.ShaderChunk.fog_pars_fragment = `#ifdef USE_FOG
    uniform vec3 fogColor;
    varying float vFogDepth;
    varying vec3 vFogWorld;
    #ifdef FOG_EXP2
      uniform float fogDensity;
    #else
      uniform float fogNear;
      uniform float fogFar;
    #endif
  #endif`;
  THREE.ShaderChunk.fog_fragment = `#ifdef USE_FOG
    #ifdef FOG_EXP2
      vec3 fogRay = vFogWorld - cameraPosition;
      float fogL = length( fogRay );
      float fogDy = fogRay.y * ${f(F.heightFalloff)};
      // optical length through air whose density falls off exponentially with height above the camera
      float fogEff = abs( fogDy ) > 1e-4 ? fogL * ( 1.0 - exp( - clamp( fogDy, -20.0, 20.0 ) ) ) / fogDy : fogL;
      float fogFactor = 1.0 - exp( - fogDensity * fogDensity * fogEff * fogEff );
      fogFactor *= mix(smoothstep(120.0,1800.0,fogL),1.0,smoothstep(.00005,.00012,fogDensity));
      // aerial perspective: far haze turns blue (scaled with the brightness of the sky, so nights stay dark)
      float fogLum = dot( fogColor, vec3( 0.299, 0.587, 0.114 ) );
      vec3 fogTint = mix( fogColor, ${tint} * fogLum * 1.15, ${f(F.aerialStrength)} * smoothstep( 0.15, 0.9, fogFactor ) );
      gl_FragColor.rgb = mix( gl_FragColor.rgb, fogTint, fogFactor );
    #else
      float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
      gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
    #endif
  #endif`;
}

/** Coarse height texture of the core terrain (16-bit packed in RG) used to fade mist where it meets the ground. */
function heightTexture(field, cell = 64) {
  const k = Math.max(1, Math.round(cell / field.cell)), n = Math.floor((field.nx - 1) / k) + 1, m = Math.floor((field.nz - 1) / k) + 1;
  const data = new Uint8Array(n * m * 4);
  for (let j = 0; j < m; j++) for (let i = 0; i < n; i++) {
    const v = Math.round(clamp(field.heightAt(i * k, j * k) - 3000, 0, 65535 / 8) * 8), o = (j * n + i) * 4;   // 1/8 m steps from 3,000 m
    data[o] = v >> 8; data[o + 1] = v & 255; data[o + 3] = 255;
  }
  const t = new THREE.DataTexture(data, n, m, THREE.RGBAFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true;
  const d = k * field.cell;
  return { texture: t, rect: new THREE.Vector4(field.x0 - d / 2, field.z0 - d / 2, 1 / (n * d), 1 / (m * d)) };
}

function mistNoiseTexture() {
  const S = 256, r = mulberry32(5), a = fbm(S, 4, r, 6), data = new Uint8Array(S * S * 4);
  for (let i = 0; i < S * S; i++) { const v = smoothstep(0.42, 0.78, a[i]) * 255; data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = 255; data[i * 4 + 3] = v; }
  const t = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true; t.needsUpdate = true;
  return t;
}

/** Localized banks made from overlapping soft spherical impostors. Each bank
 * occupies a finite 3D region, depth-tests against opaque terrain and samples the
 * DEM at its soft ground boundary. Inside a bank, localDensity supplies fog. */
export class MistLayers {
  constructor(scene, field) {
    this.group = new THREE.Group(); scene.add(this.group);
    const noise=mistNoiseTexture(),ht=heightTexture(field),rand=mulberry32(51);
    this.layers=[];this.banks=[];
    for(const alt of VISUALS.mist.altitudes){
      const candidates=[];
      for(let j=0;j<field.nz;j+=Math.max(1,Math.round(1000/field.cell)))for(let i=0;i<field.nx;i+=Math.max(1,Math.round(1000/field.cell))){
        if(field.heightAt(i,j)<alt-160)candidates.push({x:field.x0+i*field.cell,z:field.z0+j*field.cell,key:rand()});
      }
      candidates.sort((a,b)=>a.key-b.key);
      let count=0;
      for(const p of candidates){
        if(count>=4)break;
        if(this.banks.some(b=>Math.hypot(b.x-p.x,b.z-p.z)<1800))continue;
        const bank={x:p.x,z:p.z,y:alt,radius:1100+rand()*400,thickness:220+rand()*130};this.banks.push(bank);count++;
        const mat=new THREE.ShaderMaterial({transparent:true,depthWrite:false,fog:false,uniforms:{
          uNoise:{value:noise},uHeight:{value:ht.texture},uRect:{value:ht.rect},uOffset:{value:new THREE.Vector2()},uColor:{value:new THREE.Color()},uOpacity:{value:0},uCam:{value:new THREE.Vector3()},
        },vertexShader:`
          #include <common>
          #include <logdepthbuf_pars_vertex>
          varying vec2 vCloudUV;varying vec3 vCloudWorld;
          void main(){
            vec4 centre=modelMatrix*instanceMatrix*vec4(0,0,0,1);
            vec2 size=vec2(length(instanceMatrix[0].xyz),length(instanceMatrix[1].xyz));
            vec2 offset=position.xy*size;
            vCloudUV=uv;vCloudWorld=centre.xyz+transpose(mat3(viewMatrix))*vec3(offset,0);
            vec4 mvPosition=viewMatrix*centre;mvPosition.xy+=offset;
            gl_Position=projectionMatrix*mvPosition;
            #include <logdepthbuf_vertex>
          }`,fragmentShader:`
          #include <common>
          #include <logdepthbuf_pars_fragment>
          uniform sampler2D uNoise,uHeight;uniform vec4 uRect;uniform vec2 uOffset;uniform vec3 uColor,uCam;uniform float uOpacity;
          varying vec2 vCloudUV;varying vec3 vCloudWorld;
          void main(){
            #include <logdepthbuf_fragment>
            vec2 q=vCloudUV*2.0-1.0;float r=dot(q,q);if(r>=1.0)discard;
            vec2 uv=(vCloudWorld.xz+uOffset)*.00065;
            float n=texture2D(uNoise,uv).a*.6+texture2D(uNoise,uv*2.7+.31).a*.4;
            vec2 huv=(vCloudWorld.xz-uRect.xy)*uRect.zw;float ground=3000.0;
            if(all(greaterThan(huv,vec2(0)))&&all(lessThan(huv,vec2(1)))){vec4 h=texture2D(uHeight,huv);ground=(h.r*255.0*256.0+h.g*255.0)/8.0+3000.0;}
            float intersection=smoothstep(-15.0,100.0,vCloudWorld.y-ground);
            float density=sqrt(1.0-r)*smoothstep(0.0,.6,n)*intersection;
            float near=smoothstep(20.0,180.0,length(vCloudWorld-uCam));
            float alpha=(1.0-exp(-density*uOpacity))*near;
            if(alpha<=0.0)discard;      // blending nothing leaves the pixel as it was: skip the blend
            vec3 light=uColor*mix(.72,1.12,smoothstep(.1,.95,vCloudUV.y));
            gl_FragColor=vec4(light,alpha);
          }`});
        const mesh=new THREE.InstancedMesh(new THREE.PlaneGeometry(1,1),mat,14),matrix=new THREE.Matrix4();
        for(let k=0;k<14;k++){
          const angle=rand()*Math.PI*2,rad=Math.sqrt(rand())*bank.radius*.6;
          const centre=new THREE.Vector3(p.x+Math.cos(angle)*rad,alt+(rand()-.5)*bank.thickness,p.z+Math.sin(angle)*rad);
          matrix.compose(centre,new THREE.Quaternion(),new THREE.Vector3(bank.radius*(.65+rand()*.45),bank.thickness*(1+rand()*.8),1));mesh.setMatrixAt(k,matrix);
        }
        mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();mesh.boundingSphere.radius+=bank.radius;
        mesh.renderOrder=2;this.group.add(mesh);this.layers.push(mesh);
      }
    }
    this.enabled=true;this.drift=new THREE.Vector2();
  }
  localDensity(camera){
    if(!this.enabled)return 0;
    let density=0;
    for(const b of this.banks){const d=Math.hypot((camera.x-this.drift.x-b.x)/b.radius,(camera.z-this.drift.y-b.z)/b.radius,(camera.y-b.y)/(b.thickness*.65));
      density=Math.max(density,1-smoothstep(.45,1,d));}
    return density;
  }
  update(dt,cam,w,day,wind,windDirDeg,fogColor,sunColor,strength=1){
    this.group.visible=this.enabled;if(!this.enabled)return;
    const wd=windDirDeg*D2R,v=wind/3.6*.2*dt;
    this.drift.x+=Math.sin(wd)*v;this.drift.y-=Math.cos(wd)*v;
    this.group.position.set(this.drift.x,0,this.drift.y);
    for(const m of this.layers){const u=m.material.uniforms;u.uCam.value.copy(cam);u.uOffset.value.copy(this.drift).multiplyScalar(-1);
      u.uOpacity.value=VISUALS.mist.opacity*lerp(.5,1.5,smoothstep(.1,.7,w.S))*strength;
      u.uColor.value.copy(fogColor).lerp(sunColor,.22*day).multiplyScalar(lerp(.18,1.08,day));
    }
  }
}

/** Falling and wind-blown snow around the camera: soft flakes plus streaks that lengthen with the wind. */
export class WindSnow {
  constructor(scene, count) {
    this.scene = scene; this.build(count);
  }
  build(count) {
    if (this.points) { this.scene.remove(this.points, this.lines); this.points.geometry.dispose(); this.lines.geometry.dispose(); }
    const N = this.N = count, r = mulberry32(3), pos = this.pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) pos.set([(r() - 0.5) * 70, (r() - 0.5) * 40, (r() - 0.5) * 70], i * 3);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const fc = document.createElement('canvas'); fc.width = fc.height = 32;
    const fg = fc.getContext('2d'), gr = fg.createRadialGradient(16, 16, 0, 16, 16, 16);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,0.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    fg.fillStyle = gr; fg.fillRect(0, 0, 32, 32);
    this.points = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.07, map: new THREE.CanvasTexture(fc), transparent: true, opacity: 0, depthWrite: false }));
    this.points.frustumCulled = false;
    // a third of the flakes also draw as streaks (motion blur of fast spindrift)
    this.NL = Math.floor(N / 3); this.lpos = new Float32Array(this.NL * 6);
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.BufferAttribute(this.lpos, 3));
    this.lines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
    this.lines.frustumCulled = false;
    this.scene.add(this.points, this.lines);
    this.last = new THREE.Vector3();
  }
  /** amount 0..1 (snowfall + spindrift), wind in km/h as shown on the HUD, windDir: degrees it blows from */
  update(dt, cam, amount, wind, windDirDeg, day) {
    const p = this.pos, mat = this.points.material;
    mat.opacity = amount * 0.85; mat.color.setScalar(lerp(0.35, 1, day));
    const streak = smoothstep(30, 90, wind);
    this.lines.material.opacity = amount * streak * 0.35; this.lines.material.color.setScalar(lerp(0.35, 1, day));
    // fully transparent flakes or streaks draw nothing: skip them (and keep them out of the GPU's way)
    this.points.visible = mat.opacity > 0; this.lines.visible = this.lines.material.opacity > 0;
    if (amount > 0.01) {
      const wd = windDirDeg * D2R, wv = (wind / 3.6) * 0.6;
      const wx = -Math.sin(wd) * wv, wz = Math.cos(wd) * wv;            // blowing away from the "from" direction
      const dcx = cam.x - this.last.x, dcy = cam.y - this.last.y, dcz = cam.z - this.last.z;
      for (let i = 0; i < this.N; i++) {
        const x = p[i * 3] - dcx + wx * dt, y = p[i * 3 + 1] - dcy - (1.5 - streak * 0.8) * dt + Math.sin(i + cam.x * 0.01) * streak * dt, z = p[i * 3 + 2] - dcz + wz * dt;
        p[i * 3] = ((x + 35) % 70 + 70) % 70 - 35; p[i * 3 + 1] = ((y + 20) % 40 + 40) % 40 - 20; p[i * 3 + 2] = ((z + 35) % 70 + 70) % 70 - 35;
      }
      this.points.geometry.attributes.position.needsUpdate = true;
      if (streak > 0.01) {
        const L = 0.045, lp = this.lpos;                                    // streak = 45 ms of travel
        for (let i = 0; i < this.NL; i++) {
          const k = i * 3, o = i * 6;
          lp[o] = p[k]; lp[o + 1] = p[k + 1]; lp[o + 2] = p[k + 2];
          lp[o + 3] = p[k] - wx * L; lp[o + 4] = p[k + 1]; lp[o + 5] = p[k + 2] - wz * L;
        }
        this.lines.geometry.attributes.position.needsUpdate = true;
      }
    }
    this.points.position.copy(cam); this.lines.position.copy(cam); this.last.copy(cam);
  }
}
