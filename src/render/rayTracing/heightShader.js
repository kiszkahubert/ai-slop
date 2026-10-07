// Traverses conservative blocks, then intersects the native grid's two triangles.
// -1 = miss, -2 = work limit exhausted (never treated as visible sky).
export const HEIGHT_TRACE = `
uniform sampler2D uHeight0, uHeight1, uBounds0, uBounds1;
uniform vec4 uGrid0,uGrid1; // x0,z0,cell,unused
uniform ivec2 uGridSize0,uGridSize1;
uniform ivec4 uLevels0[12],uLevels1[12];
uniform int uLevelCount0,uLevelCount1;
float fieldHeight(int f,ivec2 ij) {
  return f==0?texelFetch(uHeight0,clamp(ij,ivec2(0),uGridSize0-1),0).r:texelFetch(uHeight1,clamp(ij,ivec2(0),uGridSize1-1),0).r;
}
vec4 fieldGrid(int f){return f==0?uGrid0:uGrid1;}
ivec2 fieldSize(int f){return f==0?uGridSize0:uGridSize1;}
vec3 fieldPoint(int f,ivec2 ij){vec4 g=fieldGrid(f);return vec3(g.x+float(ij.x)*g.z,fieldHeight(f,ij),g.y+float(ij.y)*g.z);}
float surfaceHeight(int f,vec2 xz) {
  vec4 g=fieldGrid(f);vec2 q=clamp((xz-g.xy)/g.z,vec2(0),vec2(fieldSize(f)-1)-0.0001);ivec2 i=ivec2(floor(q));vec2 t=fract(q);
  float a=fieldHeight(f,i),b=fieldHeight(f,i+ivec2(1,0)),c=fieldHeight(f,i+ivec2(0,1)),d=fieldHeight(f,i+1);
  return t.x+t.y<=1.0?a+(b-a)*t.x+(c-a)*t.y:d+(c-d)*(1.0-t.x)+(b-d)*(1.0-t.y);
}
vec3 fieldNormal(int f,vec2 xz){float c=fieldGrid(f).z;return normalize(vec3(surfaceHeight(f,xz-vec2(c,0))-surfaceHeight(f,xz+vec2(c,0)),2.0*c,surfaceHeight(f,xz-vec2(0,c))-surfaceHeight(f,xz+vec2(0,c))));}
float triangleDistance(vec3 ro,vec3 rd,vec3 a,vec3 b,vec3 c) {
  vec3 e=b-a,f=c-a,p=cross(rd,f);float det=dot(e,p);if(abs(det)<1e-8)return 1e20;
  vec3 v=ro-a;float u=dot(v,p)/det;if(u< -0.00001||u>1.00001)return 1e20;
  vec3 q=cross(v,e);float w=dot(rd,q)/det;if(w< -0.00001||u+w>1.00001)return 1e20;
  float t=dot(f,q)/det;return t>=0.0?t:1e20;
}
float traceField(int f,vec3 ro,vec3 rd,float start,float limit) {
  vec4 g=fieldGrid(f);ivec2 size=fieldSize(f);vec2 end=g.xy+vec2(size-1)*g.z;
  vec2 inv=vec2(abs(rd.x)<1e-8?1e20:1.0/rd.x,abs(rd.z)<1e-8?1e20:1.0/rd.z);
  vec2 a=(g.xy-ro.xz)*inv,b=(end-ro.xz)*inv;
  if(abs(rd.x)<1e-8 && (ro.x<g.x||ro.x>end.x))return -1.0;
  if(abs(rd.z)<1e-8 && (ro.z<g.y||ro.z>end.y))return -1.0;
  float t=max(start,max(min(a.x,b.x),min(a.y,b.y))),last=min(limit,min(max(a.x,b.x),max(a.y,b.y)));
  if(t>last)return -1.0;
  int top=(f==0?uLevelCount0:uLevelCount1)-1,level=top;
  for(int iter=0;iter<192;iter++) {
    if(t>last)return -1.0;
    float block=4.0*exp2(float(level)),metres=block*g.z;
    vec2 at=ro.xz+rd.xz*(t+0.002);ivec2 cell=ivec2(floor((at-g.xy)/metres));
    ivec4 meta=f==0?uLevels0[level]:uLevels1[level];
    cell=clamp(cell,ivec2(0),meta.xy-1);
    vec2 heights=f==0?texelFetch(uBounds0,cell+ivec2(0,meta.z),0).rg:texelFetch(uBounds1,cell+ivec2(0,meta.z),0).rg;
    vec2 edge=g.xy+(vec2(cell)+step(vec2(0),rd.xz))*metres;
    vec2 leave=(edge-ro.xz)*inv;
    if(abs(rd.x)<1e-8)leave.x=1e20;if(abs(rd.z)<1e-8)leave.y=1e20;
    float stop=min(last,min(leave.x,leave.y));
    float h0=ro.y+rd.y*t,h1=ro.y+rd.y*stop;
    if(max(h0,h1)<heights.x-0.001||min(h0,h1)>heights.y+0.001) {
      if(stop>=last)return -1.0;
      t=stop+max(.003,abs(stop)*.00000012);level=min(top,level+1);continue;
    }
    if(level>0){level--;continue;}
    float nearest=1e20;
    for(int z=0;z<4;z++)for(int x=0;x<4;x++) {
      ivec2 i=cell*4+ivec2(x,z);if(any(greaterThanEqual(i,size-1)))continue;
      vec3 A=fieldPoint(f,i),B=fieldPoint(f,i+ivec2(1,0)),C=fieldPoint(f,i+ivec2(0,1)),D=fieldPoint(f,i+1);
      float d0=triangleDistance(ro,rd,A,C,B),d1=triangleDistance(ro,rd,B,C,D);
      if(d0>=t-0.004 && d0<=stop+0.004)nearest=min(nearest,d0);
      if(d1>=t-0.004 && d1<=stop+0.004)nearest=min(nearest,d1);
    }
    if(nearest<1e19)return nearest;
    if(stop>=last)return -1.0;
    t=stop+max(.003,abs(stop)*.00000012);level=min(top,1);
  }
  return -2.0;
}
float traceLandscape(vec3 ro,vec3 rd,float start,float limit,out int field) {
  float a=traceField(0,ro,rd,start,limit),b=-1.0;field=0;
  // Subtract the entire core interval before tracing the backdrop. Dropping just its first
  // hit would also lose a farther mountain behind that overlapping surface.
  vec2 inv=vec2(abs(rd.x)<1e-8?1e20:1.0/rd.x,abs(rd.z)<1e-8?1e20:1.0/rd.z);
  vec2 max0=uGrid0.xy+vec2(uGridSize0-1)*uGrid0.z;
  vec2 t0=(uGrid0.xy-ro.xz)*inv,t1=(max0-ro.xz)*inv;
  float enter=max(min(t0.x,t1.x),min(t0.y,t1.y)),leave=min(max(t0.x,t1.x),max(t0.y,t1.y));
  bool crosses=leave>=enter;
  if(abs(rd.x)<1e-8&&(ro.x<uGrid0.x||ro.x>max0.x))crosses=false;
  if(abs(rd.z)<1e-8&&(ro.z<uGrid0.y||ro.z>max0.y))crosses=false;
  if(!crosses||leave<start||enter>limit)b=traceField(1,ro,rd,start,limit);
  else {
    float before=enter>start?traceField(1,ro,rd,start,min(limit,enter-.01)):-1.0;
    float after=leave<limit?traceField(1,ro,rd,max(start,leave+.01),limit):-1.0;
    b=before>=0.0?before:after;
    if(before== -2.0||after== -2.0)b=-2.0;
  }
  if(b>=0.0&&(a<0.0||b<a)){field=1;return b;}if(a>=0.0)return a;
  return a== -2.0||b== -2.0?-2.0:-1.0;
}
`;

export const RANDOM_GLSL = `
float rand(vec2 p,float seed){return fract(sin(dot(p,vec2(12.9898,78.233))+seed*19.193)*43758.5453);}
vec3 tangent(vec3 n){return normalize(cross(abs(n.y)<0.95?vec3(0,1,0):vec3(1,0,0),n));}
vec3 hemisphere(vec3 n,vec2 r){vec3 t=tangent(n),b=cross(n,t);float a=r.x*6.2831853,s=sqrt(r.y);return normalize(t*cos(a)*s+b*sin(a)*s+n*sqrt(1.0-r.y));}
vec3 sunSample(vec3 sun,vec2 r){vec3 t=tangent(sun),b=cross(sun,t);float a=r.x*6.2831853,s=sqrt(r.y)*0.00465;return normalize(sun+s*(t*cos(a)+b*sin(a)));}
`;
