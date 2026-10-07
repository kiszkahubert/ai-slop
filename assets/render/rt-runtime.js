import{BufferAttribute as Bi,Box3 as In,FrontSide as Pn}from"three";var ze=Math.pow(2,-24),Ct=Symbol("SKIP_GENERATION");import{BufferAttribute as zn}from"three";function fe(n){return n.index?n.index.count:n.attributes.position.count}function Z(n){return fe(n)/3}function ue(n,e=ArrayBuffer){return n>65535?new Uint32Array(new e(4*n)):new Uint16Array(new e(2*n))}function Ve(n,e){if(!n.index){let t=n.attributes.position.count,i=e.useSharedArrayBuffer?SharedArrayBuffer:ArrayBuffer,r=ue(t,i);n.setIndex(new zn(r,1));for(let c=0;c<t;c++)r[c]=c}}function pe(n){let e=Z(n),t=n.drawRange,i=t.start/3,r=(t.start+t.count)/3,c=Math.max(0,i),s=Math.min(e,r)-c;return[{offset:Math.floor(c),count:Math.floor(s)}]}function me(n){if(!n.groups||!n.groups.length)return pe(n);let e=[],t=new Set,i=n.drawRange,r=i.start/3,c=(i.start+i.count)/3;for(let a of n.groups){let o=a.start/3,p=(a.start+a.count)/3;t.add(Math.max(r,o)),t.add(Math.min(c,p))}let s=Array.from(t.values()).sort((a,o)=>a-o);for(let a=0;a<s.length-1;a++){let o=s[a],p=s[a+1];e.push({offset:Math.floor(o),count:Math.floor(p-o)})}return e}function Oe(n){if(n.groups.length===0)return!1;let e=Z(n),t=me(n).sort((c,s)=>c.offset-s.offset),i=t[t.length-1];i.count=Math.min(e-i.offset,i.count);let r=0;return t.forEach(({count:c})=>r+=c),e!==r}function Ut(n,e,t,i,r){let c=1/0,s=1/0,a=1/0,o=-1/0,p=-1/0,f=-1/0,u=1/0,l=1/0,m=1/0,T=-1/0,w=-1/0,y=-1/0;for(let d=e*6,x=(e+t)*6;d<x;d+=6){let h=n[d+0],g=n[d+1],A=h-g,b=h+g;A<c&&(c=A),b>o&&(o=b),h<u&&(u=h),h>T&&(T=h);let B=n[d+2],v=n[d+3],_=B-v,P=B+v;_<s&&(s=_),P>p&&(p=P),B<l&&(l=B),B>w&&(w=B);let E=n[d+4],S=n[d+5],I=E-S,F=E+S;I<a&&(a=I),F>f&&(f=F),E<m&&(m=E),E>y&&(y=E)}i[0]=c,i[1]=s,i[2]=a,i[3]=o,i[4]=p,i[5]=f,r[0]=u,r[1]=l,r[2]=m,r[3]=T,r[4]=w,r[5]=y}function He(n,e=null,t=null,i=null){let r=n.attributes.position,c=n.index?n.index.array:null,s=Z(n),a=r.normalized,o;e===null?(o=new Float32Array(s*6*4),t=0,i=s):(o=e,t=t||0,i=i||s);let p=r.array,f=r.offset||0,u=3;r.isInterleavedBufferAttribute&&(u=r.data.stride);let l=["getX","getY","getZ"];for(let m=t;m<t+i;m++){let T=m*3,w=m*6,y=T+0,d=T+1,x=T+2;c&&(y=c[y],d=c[d],x=c[x]),a||(y=y*u+f,d=d*u+f,x=x*u+f);for(let h=0;h<3;h++){let g,A,b;a?(g=r[l[h]](y),A=r[l[h]](d),b=r[l[h]](x)):(g=p[y+h],A=p[d+h],b=p[x+h]);let B=g;A<B&&(B=A),b<B&&(B=b);let v=g;A>v&&(v=A),b>v&&(v=b);let _=(v-B)/2,P=h*2;o[w+P+0]=B+_,o[w+P+1]=_+(Math.abs(B)+_)*ze}}return o}function N(n,e,t){return t.min.x=e[n],t.min.y=e[n+1],t.min.z=e[n+2],t.max.x=e[n+3],t.max.y=e[n+4],t.max.z=e[n+5],t}function de(n){let e=-1,t=-1/0;for(let i=0;i<3;i++){let r=n[i+3]-n[i];r>t&&(t=r,e=i)}return e}function xe(n,e){e.set(n)}function ye(n,e,t){let i,r;for(let c=0;c<3;c++){let s=c+3;i=n[c],r=e[c],t[c]=i<r?i:r,i=n[s],r=e[s],t[s]=i>r?i:r}}function Bt(n,e,t){for(let i=0;i<3;i++){let r=e[n+2*i],c=e[n+2*i+1],s=r-c,a=r+c;s<t[i]&&(t[i]=s),a>t[i+3]&&(t[i+3]=a)}}function st(n){let e=n[3]-n[0],t=n[4]-n[1],i=n[5]-n[2];return 2*(e*t+t*i+i*e)}var K=32,On=(n,e)=>n.candidate-e.candidate,J=new Array(K).fill().map(()=>({count:0,bounds:new Float32Array(6),rightCacheBounds:new Float32Array(6),leftCacheBounds:new Float32Array(6),candidate:0})),Rt=new Float32Array(6);function qe(n,e,t,i,r,c){let s=-1,a=0;if(c===0)s=de(e),s!==-1&&(a=(e[s]+e[s+3])/2);else if(c===1)s=de(n),s!==-1&&(a=Hn(t,i,r,s));else if(c===2){let o=st(n),p=1.25*r,f=i*6,u=(i+r)*6;for(let l=0;l<3;l++){let m=e[l],y=(e[l+3]-m)/K;if(r<K/4){let d=[...J];d.length=r;let x=0;for(let g=f;g<u;g+=6,x++){let A=d[x];A.candidate=t[g+2*l],A.count=0;let{bounds:b,leftCacheBounds:B,rightCacheBounds:v}=A;for(let _=0;_<3;_++)v[_]=1/0,v[_+3]=-1/0,B[_]=1/0,B[_+3]=-1/0,b[_]=1/0,b[_+3]=-1/0;Bt(g,t,b)}d.sort(On);let h=r;for(let g=0;g<h;g++){let A=d[g];for(;g+1<h&&d[g+1].candidate===A.candidate;)d.splice(g+1,1),h--}for(let g=f;g<u;g+=6){let A=t[g+2*l];for(let b=0;b<h;b++){let B=d[b];A>=B.candidate?Bt(g,t,B.rightCacheBounds):(Bt(g,t,B.leftCacheBounds),B.count++)}}for(let g=0;g<h;g++){let A=d[g],b=A.count,B=r-A.count,v=A.leftCacheBounds,_=A.rightCacheBounds,P=0;b!==0&&(P=st(v)/o);let E=0;B!==0&&(E=st(_)/o);let S=1+1.25*(P*b+E*B);S<p&&(s=l,p=S,a=A.candidate)}}else{for(let h=0;h<K;h++){let g=J[h];g.count=0,g.candidate=m+y+h*y;let A=g.bounds;for(let b=0;b<3;b++)A[b]=1/0,A[b+3]=-1/0}for(let h=f;h<u;h+=6){let b=~~((t[h+2*l]-m)/y);b>=K&&(b=K-1);let B=J[b];B.count++,Bt(h,t,B.bounds)}let d=J[K-1];xe(d.bounds,d.rightCacheBounds);for(let h=K-2;h>=0;h--){let g=J[h],A=J[h+1];ye(g.bounds,A.rightCacheBounds,g.rightCacheBounds)}let x=0;for(let h=0;h<K-1;h++){let g=J[h],A=g.count,b=g.bounds,v=J[h+1].rightCacheBounds;A!==0&&(x===0?xe(b,Rt):ye(b,Rt,Rt)),x+=A;let _=0,P=0;x!==0&&(_=st(Rt)/o);let E=r-x;E!==0&&(P=st(v)/o);let S=1+1.25*(_*x+P*E);S<p&&(s=l,p=S,a=g.candidate)}}}}else console.warn(`MeshBVH: Invalid build strategy value ${c} used.`);return{axis:s,pos:a}}function Hn(n,e,t,i){let r=0;for(let c=e,s=e+t;c<s;c++)r+=n[c*6+i*2];return r/t}var ot=class{constructor(){this.boundingData=new Float32Array(6)}};function Xe(n,e,t,i,r,c){let s=i,a=i+r-1,o=c.pos,p=c.axis*2;for(;;){for(;s<=a&&t[s*6+p]<o;)s++;for(;s<=a&&t[a*6+p]>=o;)a--;if(s<a){for(let f=0;f<3;f++){let u=e[s*3+f];e[s*3+f]=e[a*3+f],e[a*3+f]=u}for(let f=0;f<6;f++){let u=t[s*6+f];t[s*6+f]=t[a*6+f],t[a*6+f]=u}s++,a--}else return s}}function Ye(n,e,t,i,r,c){let s=i,a=i+r-1,o=c.pos,p=c.axis*2;for(;;){for(;s<=a&&t[s*6+p]<o;)s++;for(;s<=a&&t[a*6+p]>=o;)a--;if(s<a){let f=n[s];n[s]=n[a],n[a]=f;for(let u=0;u<6;u++){let l=t[s*6+u];t[s*6+u]=t[a*6+u],t[a*6+u]=l}s++,a--}else return s}}function C(n,e){return e[n+15]===65535}function U(n,e){return e[n+6]}function R(n,e){return e[n+14]}function H(n){return n+8}function O(n,e){return e[n+6]}function ct(n,e){return e[n+7]}var je,_t,zt,Ze,kn=Math.pow(2,32);function Vt(n){return"count"in n?1:1+Vt(n.left)+Vt(n.right)}function Ke(n,e,t){return je=new Float32Array(t),_t=new Uint32Array(t),zt=new Uint16Array(t),Ze=new Uint8Array(t),he(n,e)}function he(n,e){let t=n/4,i=n/2,r="count"in e,c=e.boundingData;for(let s=0;s<6;s++)je[t+s]=c[s];if(r)if(e.buffer){let s=e.buffer;Ze.set(new Uint8Array(s),n);for(let a=n,o=n+s.byteLength;a<o;a+=32){let p=a/2;C(p,zt)||(_t[a/4+6]+=t)}return n+s.byteLength}else{let s=e.offset,a=e.count;return _t[t+6]=s,zt[i+14]=a,zt[i+15]=65535,n+32}else{let s=e.left,a=e.right,o=e.splitAxis,p;if(p=he(n+32,s),p/4>kn)throw new Error("MeshBVH: Cannot store child pointer greater than 32 bits.");return _t[t+6]=p/4,p=he(p,a),_t[t+7]=o,p}}function Gn(n,e){let t=(n.index?n.index.count:n.attributes.position.count)/3,i=t>2**16,r=i?4:2,c=e?new SharedArrayBuffer(t*r):new ArrayBuffer(t*r),s=i?new Uint32Array(c):new Uint16Array(c);for(let a=0,o=s.length;a<o;a++)s[a]=a;return s}function qn(n,e,t,i,r){let{maxDepth:c,verbose:s,maxLeafTris:a,strategy:o,onProgress:p,indirect:f}=r,u=n._indirectBuffer,l=n.geometry,m=l.index?l.index.array:null,T=f?Ye:Xe,w=Z(l),y=new Float32Array(6),d=!1,x=new ot;return Ut(e,t,i,x.boundingData,y),g(x,t,i,y),x;function h(A){p&&p(A/w)}function g(A,b,B,v=null,_=0){if(!d&&_>=c&&(d=!0,s&&(console.warn(`MeshBVH: Max depth of ${c} reached when generating BVH. Consider increasing maxDepth.`),console.warn(l))),B<=a||_>=c)return h(b+B),A.offset=b,A.count=B,A;let P=qe(A.boundingData,v,e,b,B,o);if(P.axis===-1)return h(b+B),A.offset=b,A.count=B,A;let E=T(u,m,e,b,B,P);if(E===b||E===b+B)h(b+B),A.offset=b,A.count=B;else{A.splitAxis=P.axis;let S=new ot,I=b,F=E-b;A.left=S,Ut(e,I,F,S.boundingData,y),g(S,I,F,y,_+1);let M=new ot,V=E,$=B-F;A.right=M,Ut(e,V,$,M.boundingData,y),g(M,V,$,y,_+1)}return A}}function We(n,e){let t=n.geometry;e.indirect&&(n._indirectBuffer=Gn(t,e.useSharedArrayBuffer),Oe(t)&&!e.verbose&&console.warn('MeshBVH: Provided geometry contains groups that do not fully span the vertex contents while using the "indirect" option. BVH may incorrectly report intersections on unrendered portions of the geometry.')),n._indirectBuffer||Ve(t,e);let i=e.useSharedArrayBuffer?SharedArrayBuffer:ArrayBuffer,r=He(t),c=e.indirect?pe(t):me(t);n._roots=c.map(s=>{let a=qn(n,r,s.offset,s.count,e),o=Vt(a),p=new i(32*o);return Ke(0,a,p),p})}import{Vector3 as tt,Matrix4 as Je,Line3 as Qe}from"three";import{Vector3 as Xn}from"three";var q=class{constructor(){this.min=1/0,this.max=-1/0}setFromPointsField(e,t){let i=1/0,r=-1/0;for(let c=0,s=e.length;c<s;c++){let o=e[c][t];i=o<i?o:i,r=o>r?o:r}this.min=i,this.max=r}setFromPoints(e,t){let i=1/0,r=-1/0;for(let c=0,s=t.length;c<s;c++){let a=t[c],o=e.dot(a);i=o<i?o:i,r=o>r?o:r}this.min=i,this.max=r}isSeparated(e){return this.min>e.max||e.min>this.max}};q.prototype.setFromBox=(function(){let n=new Xn;return function(t,i){let r=i.min,c=i.max,s=1/0,a=-1/0;for(let o=0;o<=1;o++)for(let p=0;p<=1;p++)for(let f=0;f<=1;f++){n.x=r.x*o+c.x*(1-o),n.y=r.y*p+c.y*(1-p),n.z=r.z*f+c.z*(1-f);let u=t.dot(n);s=Math.min(u,s),a=Math.max(u,a)}this.min=s,this.max=a}})();var yr=(function(){let n=new q;return function(t,i){let r=t.points,c=t.satAxes,s=t.satBounds,a=i.points,o=i.satAxes,p=i.satBounds;for(let f=0;f<3;f++){let u=s[f],l=c[f];if(n.setFromPoints(l,a),u.isSeparated(n))return!1}for(let f=0;f<3;f++){let u=p[f],l=o[f];if(n.setFromPoints(l,r),u.isSeparated(n))return!1}}})();import{Triangle as Wn,Vector3 as X,Line3 as at,Sphere as $n,Plane as Jn}from"three";import{Vector3 as rt,Vector2 as Yn,Plane as jn,Line3 as Zn}from"three";var Kn=(function(){let n=new rt,e=new rt,t=new rt;return function(r,c,s){let a=r.start,o=n,p=c.start,f=e;t.subVectors(a,p),n.subVectors(r.end,r.start),e.subVectors(c.end,c.start);let u=t.dot(f),l=f.dot(o),m=f.dot(f),T=t.dot(o),y=o.dot(o)*m-l*l,d,x;y!==0?d=(u*l-T*m)/y:d=0,x=(u+d*l)/m,s.x=d,s.y=x}})(),vt=(function(){let n=new Yn,e=new rt,t=new rt;return function(r,c,s,a){Kn(r,c,n);let o=n.x,p=n.y;if(o>=0&&o<=1&&p>=0&&p<=1){r.at(o,s),c.at(p,a);return}else if(o>=0&&o<=1){p<0?c.at(0,a):c.at(1,a),r.closestPointToPoint(a,!0,s);return}else if(p>=0&&p<=1){o<0?r.at(0,s):r.at(1,s),c.closestPointToPoint(s,!0,a);return}else{let f;o<0?f=r.start:f=r.end;let u;p<0?u=c.start:u=c.end;let l=e,m=t;if(r.closestPointToPoint(u,!0,e),c.closestPointToPoint(f,!0,t),l.distanceToSquared(u)<=m.distanceToSquared(f)){s.copy(l),a.copy(u);return}else{s.copy(f),a.copy(m);return}}}})(),$e=(function(){let n=new rt,e=new rt,t=new jn,i=new Zn;return function(c,s){let{radius:a,center:o}=c,{a:p,b:f,c:u}=s;if(i.start=p,i.end=f,i.closestPointToPoint(o,!0,n).distanceTo(o)<=a||(i.start=p,i.end=u,i.closestPointToPoint(o,!0,n).distanceTo(o)<=a)||(i.start=f,i.end=u,i.closestPointToPoint(o,!0,n).distanceTo(o)<=a))return!0;let w=s.getPlane(t);if(Math.abs(w.distanceToPoint(o))<=a){let d=w.projectPoint(o,e);if(s.containsPoint(d))return!0}return!1}})();var Qn=1e-15;function Ae(n){return Math.abs(n)<Qn}var k=class extends Wn{constructor(...e){super(...e),this.isExtendedTriangle=!0,this.satAxes=new Array(4).fill().map(()=>new X),this.satBounds=new Array(4).fill().map(()=>new q),this.points=[this.a,this.b,this.c],this.sphere=new $n,this.plane=new Jn,this.needsUpdate=!0}intersectsSphere(e){return $e(e,this)}update(){let e=this.a,t=this.b,i=this.c,r=this.points,c=this.satAxes,s=this.satBounds,a=c[0],o=s[0];this.getNormal(a),o.setFromPoints(a,r);let p=c[1],f=s[1];p.subVectors(e,t),f.setFromPoints(p,r);let u=c[2],l=s[2];u.subVectors(t,i),l.setFromPoints(u,r);let m=c[3],T=s[3];m.subVectors(i,e),T.setFromPoints(m,r),this.sphere.setFromPoints(this.points),this.plane.setFromNormalAndCoplanarPoint(a,e),this.needsUpdate=!1}};k.prototype.closestPointToSegment=(function(){let n=new X,e=new X,t=new at;return function(r,c=null,s=null){let{start:a,end:o}=r,p=this.points,f,u=1/0;for(let l=0;l<3;l++){let m=(l+1)%3;t.start.copy(p[l]),t.end.copy(p[m]),vt(t,r,n,e),f=n.distanceToSquared(e),f<u&&(u=f,c&&c.copy(n),s&&s.copy(e))}return this.closestPointToPoint(a,n),f=a.distanceToSquared(n),f<u&&(u=f,c&&c.copy(n),s&&s.copy(a)),this.closestPointToPoint(o,n),f=o.distanceToSquared(n),f<u&&(u=f,c&&c.copy(n),s&&s.copy(o)),Math.sqrt(u)}})();k.prototype.intersectsTriangle=(function(){let n=new k,e=new Array(3),t=new Array(3),i=new q,r=new q,c=new X,s=new X,a=new X,o=new X,p=new X,f=new at,u=new at,l=new at,m=new X;function T(w,y,d){let x=w.points,h=0,g=-1;for(let A=0;A<3;A++){let{start:b,end:B}=f;b.copy(x[A]),B.copy(x[(A+1)%3]),f.delta(s);let v=Ae(y.distanceToPoint(b));if(Ae(y.normal.dot(s))&&v){d.copy(f),h=2;break}let _=y.intersectLine(f,m);if(!_&&v&&m.copy(b),(_||v)&&!Ae(m.distanceTo(B))){if(h<=1)(h===1?d.start:d.end).copy(m),v&&(g=h);else if(h>=2){(g===1?d.start:d.end).copy(m),h=2;break}if(h++,h===2&&g===-1)break}}return h}return function(y,d=null,x=!1){this.needsUpdate&&this.update(),y.isExtendedTriangle?y.needsUpdate&&y.update():(n.copy(y),n.update(),y=n);let h=this.plane,g=y.plane;if(Math.abs(h.normal.dot(g.normal))>1-1e-10){let A=this.satBounds,b=this.satAxes;t[0]=y.a,t[1]=y.b,t[2]=y.c;for(let _=0;_<4;_++){let P=A[_],E=b[_];if(i.setFromPoints(E,t),P.isSeparated(i))return!1}let B=y.satBounds,v=y.satAxes;e[0]=this.a,e[1]=this.b,e[2]=this.c;for(let _=0;_<4;_++){let P=B[_],E=v[_];if(i.setFromPoints(E,e),P.isSeparated(i))return!1}for(let _=0;_<4;_++){let P=b[_];for(let E=0;E<4;E++){let S=v[E];if(c.crossVectors(P,S),i.setFromPoints(c,e),r.setFromPoints(c,t),i.isSeparated(r))return!1}}return d&&(x||console.warn("ExtendedTriangle.intersectsTriangle: Triangles are coplanar which does not support an output edge. Setting edge to 0, 0, 0."),d.start.set(0,0,0),d.end.set(0,0,0)),!0}else{let A=T(this,g,u);if(A===1&&y.containsPoint(u.end))return d&&(d.start.copy(u.end),d.end.copy(u.end)),!0;if(A!==2)return!1;let b=T(y,h,l);if(b===1&&this.containsPoint(l.end))return d&&(d.start.copy(l.end),d.end.copy(l.end)),!0;if(b!==2)return!1;if(u.delta(a),l.delta(o),a.dot(o)<0){let I=l.start;l.start=l.end,l.end=I}let B=u.start.dot(a),v=u.end.dot(a),_=l.start.dot(a),P=l.end.dot(a),E=v<_,S=B<P;return B!==P&&_!==v&&E===S?!1:(d&&(p.subVectors(u.start,l.start),p.dot(a)>0?d.start.copy(u.start):d.start.copy(l.start),p.subVectors(u.end,l.end),p.dot(a)<0?d.end.copy(u.end):d.end.copy(l.end)),!0)}}})();k.prototype.distanceToPoint=(function(){let n=new X;return function(t){return this.closestPointToPoint(t,n),t.distanceTo(n)}})();k.prototype.distanceToTriangle=(function(){let n=new X,e=new X,t=["a","b","c"],i=new at,r=new at;return function(s,a=null,o=null){let p=a||o?i:null;if(this.intersectsTriangle(s,p))return(a||o)&&(a&&p.getCenter(a),o&&p.getCenter(o)),0;let f=1/0;for(let u=0;u<3;u++){let l,m=t[u],T=s[m];this.closestPointToPoint(T,n),l=T.distanceToSquared(n),l<f&&(f=l,a&&a.copy(n),o&&o.copy(T));let w=this[m];s.closestPointToPoint(w,n),l=w.distanceToSquared(n),l<f&&(f=l,a&&a.copy(w),o&&o.copy(n))}for(let u=0;u<3;u++){let l=t[u],m=t[(u+1)%3];i.set(this[l],this[m]);for(let T=0;T<3;T++){let w=t[T],y=t[(T+1)%3];r.set(s[w],s[y]),vt(i,r,n,e);let d=n.distanceToSquared(e);d<f&&(f=d,a&&a.copy(n),o&&o.copy(e))}}return Math.sqrt(f)}})();var z=class{constructor(e,t,i){this.isOrientedBox=!0,this.min=new tt,this.max=new tt,this.matrix=new Je,this.invMatrix=new Je,this.points=new Array(8).fill().map(()=>new tt),this.satAxes=new Array(3).fill().map(()=>new tt),this.satBounds=new Array(3).fill().map(()=>new q),this.alignedSatBounds=new Array(3).fill().map(()=>new q),this.needsUpdate=!1,e&&this.min.copy(e),t&&this.max.copy(t),i&&this.matrix.copy(i)}set(e,t,i){this.min.copy(e),this.max.copy(t),this.matrix.copy(i),this.needsUpdate=!0}copy(e){this.min.copy(e.min),this.max.copy(e.max),this.matrix.copy(e.matrix),this.needsUpdate=!0}};z.prototype.update=(function(){return function(){let e=this.matrix,t=this.min,i=this.max,r=this.points;for(let p=0;p<=1;p++)for(let f=0;f<=1;f++)for(let u=0;u<=1;u++){let l=1*p|2*f|4*u,m=r[l];m.x=p?i.x:t.x,m.y=f?i.y:t.y,m.z=u?i.z:t.z,m.applyMatrix4(e)}let c=this.satBounds,s=this.satAxes,a=r[0];for(let p=0;p<3;p++){let f=s[p],u=c[p],l=1<<p,m=r[l];f.subVectors(a,m),u.setFromPoints(f,r)}let o=this.alignedSatBounds;o[0].setFromPointsField(r,"x"),o[1].setFromPointsField(r,"y"),o[2].setFromPointsField(r,"z"),this.invMatrix.copy(this.matrix).invert(),this.needsUpdate=!1}})();z.prototype.intersectsBox=(function(){let n=new q;return function(t){this.needsUpdate&&this.update();let i=t.min,r=t.max,c=this.satBounds,s=this.satAxes,a=this.alignedSatBounds;if(n.min=i.x,n.max=r.x,a[0].isSeparated(n)||(n.min=i.y,n.max=r.y,a[1].isSeparated(n))||(n.min=i.z,n.max=r.z,a[2].isSeparated(n)))return!1;for(let o=0;o<3;o++){let p=s[o],f=c[o];if(n.setFromBox(p,t),f.isSeparated(n))return!1}return!0}})();z.prototype.intersectsTriangle=(function(){let n=new k,e=new Array(3),t=new q,i=new q,r=new tt;return function(s){this.needsUpdate&&this.update(),s.isExtendedTriangle?s.needsUpdate&&s.update():(n.copy(s),n.update(),s=n);let a=this.satBounds,o=this.satAxes;e[0]=s.a,e[1]=s.b,e[2]=s.c;for(let l=0;l<3;l++){let m=a[l],T=o[l];if(t.setFromPoints(T,e),m.isSeparated(t))return!1}let p=s.satBounds,f=s.satAxes,u=this.points;for(let l=0;l<3;l++){let m=p[l],T=f[l];if(t.setFromPoints(T,u),m.isSeparated(t))return!1}for(let l=0;l<3;l++){let m=o[l];for(let T=0;T<4;T++){let w=f[T];if(r.crossVectors(m,w),t.setFromPoints(r,e),i.setFromPoints(r,u),t.isSeparated(i))return!1}}return!0}})();z.prototype.closestPointToPoint=(function(){return function(e,t){return this.needsUpdate&&this.update(),t.copy(e).applyMatrix4(this.invMatrix).clamp(this.min,this.max).applyMatrix4(this.matrix),t}})();z.prototype.distanceToPoint=(function(){let n=new tt;return function(t){return this.closestPointToPoint(t,n),t.distanceTo(n)}})();z.prototype.distanceToBox=(function(){let n=["x","y","z"],e=new Array(12).fill().map(()=>new Qe),t=new Array(12).fill().map(()=>new Qe),i=new tt,r=new tt;return function(s,a=0,o=null,p=null){if(this.needsUpdate&&this.update(),this.intersectsBox(s))return(o||p)&&(s.getCenter(r),this.closestPointToPoint(r,i),s.closestPointToPoint(i,r),o&&o.copy(i),p&&p.copy(r)),0;let f=a*a,u=s.min,l=s.max,m=this.points,T=1/0;for(let y=0;y<8;y++){let d=m[y];r.copy(d).clamp(u,l);let x=d.distanceToSquared(r);if(x<T&&(T=x,o&&o.copy(d),p&&p.copy(r),x<f))return Math.sqrt(x)}let w=0;for(let y=0;y<3;y++)for(let d=0;d<=1;d++)for(let x=0;x<=1;x++){let h=(y+1)%3,g=(y+2)%3,A=d<<h|x<<g,b=1<<y|d<<h|x<<g,B=m[A],v=m[b];e[w].set(B,v);let P=n[y],E=n[h],S=n[g],I=t[w],F=I.start,M=I.end;F[P]=u[P],F[E]=d?u[E]:l[E],F[S]=x?u[S]:l[E],M[P]=l[P],M[E]=d?u[E]:l[E],M[S]=x?u[S]:l[E],w++}for(let y=0;y<=1;y++)for(let d=0;d<=1;d++)for(let x=0;x<=1;x++){r.x=y?l.x:u.x,r.y=d?l.y:u.y,r.z=x?l.z:u.z,this.closestPointToPoint(r,i);let h=r.distanceToSquared(i);if(h<T&&(T=h,o&&o.copy(i),p&&p.copy(r),h<f))return Math.sqrt(h)}for(let y=0;y<12;y++){let d=e[y];for(let x=0;x<12;x++){let h=t[x];vt(d,h,i,r);let g=i.distanceToSquared(r);if(g<T&&(T=g,o&&o.copy(i),p&&p.copy(r),g<f))return Math.sqrt(g)}}return Math.sqrt(T)}})();var et=class{constructor(e){this._getNewPrimitive=e,this._primitives=[]}getPrimitive(){let e=this._primitives;return e.length===0?this._getNewPrimitive():e.pop()}releasePrimitive(e){this._primitives.push(e)}};var Te=class extends et{constructor(){super(()=>new k)}},G=new Te;import{Box3 as ei}from"three";var we=class{constructor(){this.float32Array=null,this.uint16Array=null,this.uint32Array=null;let e=[],t=null;this.setBuffer=i=>{t&&e.push(t),t=i,this.float32Array=new Float32Array(i),this.uint16Array=new Uint16Array(i),this.uint32Array=new Uint32Array(i)},this.clearBuffer=()=>{t=null,this.float32Array=null,this.uint16Array=null,this.uint32Array=null,e.length!==0&&this.setBuffer(e.pop())}}},D=new we;var nt,ft,lt=[],Ht=new et(()=>new ei);function tn(n,e,t,i,r,c){nt=Ht.getPrimitive(),ft=Ht.getPrimitive(),lt.push(nt,ft),D.setBuffer(n._roots[e]);let s=ge(0,n.geometry,t,i,r,c);D.clearBuffer(),Ht.releasePrimitive(nt),Ht.releasePrimitive(ft),lt.pop(),lt.pop();let a=lt.length;return a>0&&(ft=lt[a-1],nt=lt[a-2]),s}function ge(n,e,t,i,r=null,c=0,s=0){let{float32Array:a,uint16Array:o,uint32Array:p}=D,f=n*2;if(C(f,o)){let l=U(n,p),m=R(f,o);return N(n,a,nt),i(l,m,!1,s,c+n,nt)}else{let P=function(S){let{uint16Array:I,uint32Array:F}=D,M=S*2;for(;!C(M,I);)S=H(S),M=S*2;return U(S,F)},E=function(S){let{uint16Array:I,uint32Array:F}=D,M=S*2;for(;!C(M,I);)S=O(S,F),M=S*2;return U(S,F)+R(M,I)},l=H(n),m=O(n,p),T=l,w=m,y,d,x,h;if(r&&(x=nt,h=ft,N(T,a,x),N(w,a,h),y=r(x),d=r(h),d<y)){T=m,w=l;let S=y;y=d,d=S,x=h}x||(x=nt,N(T,a,x));let g=C(T*2,o),A=t(x,g,y,s+1,c+T),b;if(A===2){let S=P(T),F=E(T)-S;b=i(S,F,!0,s+1,c+T,x)}else b=A&&ge(T,e,t,i,r,c,s+1);if(b)return!0;h=ft,N(w,a,h);let B=C(w*2,o),v=t(h,B,d,s+1,c+w),_;if(v===2){let S=P(w),F=E(w)-S;_=i(S,F,!0,s+1,c+w,h)}else _=v&&ge(w,e,t,i,r,c,s+1);return!!_}}import{Vector3 as en}from"three";var St=new en,be=new en;function nn(n,e,t={},i=0,r=1/0){let c=i*i,s=r*r,a=1/0,o=null;if(n.shapecast({boundsTraverseOrder:f=>(St.copy(e).clamp(f.min,f.max),St.distanceToSquared(e)),intersectsBounds:(f,u,l)=>l<a&&l<s,intersectsTriangle:(f,u)=>{f.closestPointToPoint(e,St);let l=e.distanceToSquared(St);return l<a&&(be.copy(St),a=l,o=u),l<c}}),a===1/0)return null;let p=Math.sqrt(a);return t.point?t.point.copy(be):t.point=be.clone(),t.distance=p,t.faceIndex=o,t}import{Vector3 as W,Vector2 as Pt,Triangle as Gt,DoubleSide as ni,BackSide as ii}from"three";var ut=new W,pt=new W,mt=new W,qt=new Pt,Xt=new Pt,Yt=new Pt,rn=new W,sn=new W,on=new W,jt=new W;function ri(n,e,t,i,r,c,s,a){let o;if(c===ii?o=n.intersectTriangle(i,t,e,!0,r):o=n.intersectTriangle(e,t,i,c!==ni,r),o===null)return null;let p=n.origin.distanceTo(r);return p<s||p>a?null:{distance:p,point:r.clone()}}function si(n,e,t,i,r,c,s,a,o,p,f){ut.fromBufferAttribute(e,c),pt.fromBufferAttribute(e,s),mt.fromBufferAttribute(e,a);let u=ri(n,ut,pt,mt,jt,o,p,f);if(u){i&&(qt.fromBufferAttribute(i,c),Xt.fromBufferAttribute(i,s),Yt.fromBufferAttribute(i,a),u.uv=Gt.getInterpolation(jt,ut,pt,mt,qt,Xt,Yt,new Pt)),r&&(qt.fromBufferAttribute(r,c),Xt.fromBufferAttribute(r,s),Yt.fromBufferAttribute(r,a),u.uv1=Gt.getInterpolation(jt,ut,pt,mt,qt,Xt,Yt,new Pt)),t&&(rn.fromBufferAttribute(t,c),sn.fromBufferAttribute(t,s),on.fromBufferAttribute(t,a),u.normal=Gt.getInterpolation(jt,ut,pt,mt,rn,sn,on,new W),u.normal.dot(n.direction)>0&&u.normal.multiplyScalar(-1));let l={a:c,b:s,c:a,normal:new W,materialIndex:0};Gt.getNormal(ut,pt,mt,l.normal),u.face=l,u.faceIndex=c}return u}function dt(n,e,t,i,r,c,s){let a=i*3,o=a+0,p=a+1,f=a+2,u=n.index;n.index&&(o=u.getX(o),p=u.getX(p),f=u.getX(f));let{position:l,normal:m,uv:T,uv1:w}=n.attributes,y=si(t,l,m,T,w,o,p,f,e,c,s);return y?(y.faceIndex=i,r&&r.push(y),y):null}import{Vector2 as Xr,Vector3 as Yr,Triangle as jr}from"three";function L(n,e,t,i){let r=n.a,c=n.b,s=n.c,a=e,o=e+1,p=e+2;t&&(a=t.getX(a),o=t.getX(o),p=t.getX(p)),r.x=i.getX(a),r.y=i.getY(a),r.z=i.getZ(a),c.x=i.getX(o),c.y=i.getY(o),c.z=i.getZ(o),s.x=i.getX(p),s.y=i.getY(p),s.z=i.getZ(p)}function cn(n,e,t,i,r,c,s,a){let{geometry:o,_indirectBuffer:p}=n;for(let f=i,u=i+r;f<u;f++)dt(o,e,t,f,c,s,a)}function an(n,e,t,i,r,c,s){let{geometry:a,_indirectBuffer:o}=n,p=1/0,f=null;for(let u=i,l=i+r;u<l;u++){let m;m=dt(a,e,t,u,null,c,s),m&&m.distance<p&&(f=m,p=m.distance)}return f}function ln(n,e,t,i,r,c,s){let{geometry:a}=t,{index:o}=a,p=a.attributes.position;for(let f=n,u=e+n;f<u;f++){let l;if(l=f,L(s,l*3,o,p),s.needsUpdate=!0,i(s,l,r,c))return!0}return!1}function fn(n,e=null){e&&Array.isArray(e)&&(e=new Set(e));let t=n.geometry,i=t.index?t.index.array:null,r=t.attributes.position,c,s,a,o,p=0,f=n._roots;for(let l=0,m=f.length;l<m;l++)c=f[l],s=new Uint32Array(c),a=new Uint16Array(c),o=new Float32Array(c),u(0,p),p+=c.byteLength;function u(l,m,T=!1){let w=l*2;if(a[w+15]===65535){let d=s[l+6],x=a[w+14],h=1/0,g=1/0,A=1/0,b=-1/0,B=-1/0,v=-1/0;for(let _=3*d,P=3*(d+x);_<P;_++){let E=i[_],S=r.getX(E),I=r.getY(E),F=r.getZ(E);S<h&&(h=S),S>b&&(b=S),I<g&&(g=I),I>B&&(B=I),F<A&&(A=F),F>v&&(v=F)}return o[l+0]!==h||o[l+1]!==g||o[l+2]!==A||o[l+3]!==b||o[l+4]!==B||o[l+5]!==v?(o[l+0]=h,o[l+1]=g,o[l+2]=A,o[l+3]=b,o[l+4]=B,o[l+5]=v,!0):!1}else{let d=l+8,x=s[l+6],h=d+m,g=x+m,A=T,b=!1,B=!1;e?A||(b=e.has(h),B=e.has(g),A=!b&&!B):(b=!0,B=!0);let v=A||b,_=A||B,P=!1;v&&(P=u(d,m,A));let E=!1;_&&(E=u(x,m,A));let S=P||E;if(S)for(let I=0;I<3;I++){let F=d+I,M=x+I,V=o[F],$=o[F+3],gt=o[M],bt=o[M+3];o[l+I]=V<gt?V:gt,o[l+I+3]=$>bt?$:bt}return S}}}function Y(n,e,t,i,r){let c,s,a,o,p,f,u=1/t.direction.x,l=1/t.direction.y,m=1/t.direction.z,T=t.origin.x,w=t.origin.y,y=t.origin.z,d=e[n],x=e[n+3],h=e[n+1],g=e[n+3+1],A=e[n+2],b=e[n+3+2];return u>=0?(c=(d-T)*u,s=(x-T)*u):(c=(x-T)*u,s=(d-T)*u),l>=0?(a=(h-w)*l,o=(g-w)*l):(a=(g-w)*l,o=(h-w)*l),c>o||a>s||((a>c||isNaN(c))&&(c=a),(o<s||isNaN(s))&&(s=o),m>=0?(p=(A-y)*m,f=(b-y)*m):(p=(b-y)*m,f=(A-y)*m),c>f||p>s)?!1:((p>c||c!==c)&&(c=p),(f<s||s!==s)&&(s=f),c<=r&&s>=i)}function un(n,e,t,i,r,c,s,a){let{geometry:o,_indirectBuffer:p}=n;for(let f=i,u=i+r;f<u;f++){let l=p?p[f]:f;dt(o,e,t,l,c,s,a)}}function pn(n,e,t,i,r,c,s){let{geometry:a,_indirectBuffer:o}=n,p=1/0,f=null;for(let u=i,l=i+r;u<l;u++){let m;m=dt(a,e,t,o?o[u]:u,null,c,s),m&&m.distance<p&&(f=m,p=m.distance)}return f}function mn(n,e,t,i,r,c,s){let{geometry:a}=t,{index:o}=a,p=a.attributes.position;for(let f=n,u=e+n;f<u;f++){let l;if(l=t.resolveTriangleIndex(f),L(s,l*3,o,p),s.needsUpdate=!0,i(s,l,r,c))return!0}return!1}function dn(n,e,t,i,r,c,s){D.setBuffer(n._roots[e]),Be(0,n,t,i,r,c,s),D.clearBuffer()}function Be(n,e,t,i,r,c,s){let{float32Array:a,uint16Array:o,uint32Array:p}=D,f=n*2;if(C(f,o)){let l=U(n,p),m=R(f,o);cn(e,t,i,l,m,r,c,s)}else{let l=H(n);Y(l,a,i,c,s)&&Be(l,e,t,i,r,c,s);let m=O(n,p);Y(m,a,i,c,s)&&Be(m,e,t,i,r,c,s)}}var oi=["x","y","z"];function xn(n,e,t,i,r,c){D.setBuffer(n._roots[e]);let s=_e(0,n,t,i,r,c);return D.clearBuffer(),s}function _e(n,e,t,i,r,c){let{float32Array:s,uint16Array:a,uint32Array:o}=D,p=n*2;if(C(p,a)){let u=U(n,o),l=R(p,a);return an(e,t,i,u,l,r,c)}else{let u=ct(n,o),l=oi[u],T=i.direction[l]>=0,w,y;T?(w=H(n),y=O(n,o)):(w=O(n,o),y=H(n));let x=Y(w,s,i,r,c)?_e(w,e,t,i,r,c):null;if(x){let A=x.point[l];if(T?A<=s[y+u]:A>=s[y+u+3])return x}let g=Y(y,s,i,r,c)?_e(y,e,t,i,r,c):null;return x&&g?x.distance<=g.distance?x:g:x||g||null}}import{Box3 as ci,Matrix4 as ai}from"three";var Zt=new ci,xt=new k,yt=new k,Et=new ai,yn=new z,Kt=new z;function hn(n,e,t,i){D.setBuffer(n._roots[e]);let r=ve(0,n,t,i);return D.clearBuffer(),r}function ve(n,e,t,i,r=null){let{float32Array:c,uint16Array:s,uint32Array:a}=D,o=n*2;if(r===null&&(t.boundingBox||t.computeBoundingBox(),yn.set(t.boundingBox.min,t.boundingBox.max,i),r=yn),C(o,s)){let f=e.geometry,u=f.index,l=f.attributes.position,m=t.index,T=t.attributes.position,w=U(n,a),y=R(o,s);if(Et.copy(i).invert(),t.boundsTree)return N(n,c,Kt),Kt.matrix.copy(Et),Kt.needsUpdate=!0,t.boundsTree.shapecast({intersectsBounds:x=>Kt.intersectsBox(x),intersectsTriangle:x=>{x.a.applyMatrix4(i),x.b.applyMatrix4(i),x.c.applyMatrix4(i),x.needsUpdate=!0;for(let h=w*3,g=(y+w)*3;h<g;h+=3)if(L(yt,h,u,l),yt.needsUpdate=!0,x.intersectsTriangle(yt))return!0;return!1}});for(let d=w*3,x=(y+w)*3;d<x;d+=3){L(xt,d,u,l),xt.a.applyMatrix4(Et),xt.b.applyMatrix4(Et),xt.c.applyMatrix4(Et),xt.needsUpdate=!0;for(let h=0,g=m.count;h<g;h+=3)if(L(yt,h,m,T),yt.needsUpdate=!0,xt.intersectsTriangle(yt))return!0}}else{let f=n+8,u=a[n+6];return N(f,c,Zt),!!(r.intersectsBox(Zt)&&ve(f,e,t,i,r)||(N(u,c,Zt),r.intersectsBox(Zt)&&ve(u,e,t,i,r)))}}import{Matrix4 as li,Vector3 as $t}from"three";var Wt=new li,Se=new z,It=new z,fi=new $t,ui=new $t,pi=new $t,mi=new $t;function An(n,e,t,i={},r={},c=0,s=1/0){e.boundingBox||e.computeBoundingBox(),Se.set(e.boundingBox.min,e.boundingBox.max,t),Se.needsUpdate=!0;let a=n.geometry,o=a.attributes.position,p=a.index,f=e.attributes.position,u=e.index,l=G.getPrimitive(),m=G.getPrimitive(),T=fi,w=ui,y=null,d=null;r&&(y=pi,d=mi);let x=1/0,h=null,g=null;return Wt.copy(t).invert(),It.matrix.copy(Wt),n.shapecast({boundsTraverseOrder:A=>Se.distanceToBox(A),intersectsBounds:(A,b,B)=>B<x&&B<s?(b&&(It.min.copy(A.min),It.max.copy(A.max),It.needsUpdate=!0),!0):!1,intersectsRange:(A,b)=>{if(e.boundsTree)return e.boundsTree.shapecast({boundsTraverseOrder:v=>It.distanceToBox(v),intersectsBounds:(v,_,P)=>P<x&&P<s,intersectsRange:(v,_)=>{for(let P=v,E=v+_;P<E;P++){L(m,3*P,u,f),m.a.applyMatrix4(t),m.b.applyMatrix4(t),m.c.applyMatrix4(t),m.needsUpdate=!0;for(let S=A,I=A+b;S<I;S++){L(l,3*S,p,o),l.needsUpdate=!0;let F=l.distanceToTriangle(m,T,y);if(F<x&&(w.copy(T),d&&d.copy(y),x=F,h=S,g=P),F<c)return!0}}}});{let B=Z(e);for(let v=0,_=B;v<_;v++){L(m,3*v,u,f),m.a.applyMatrix4(t),m.b.applyMatrix4(t),m.c.applyMatrix4(t),m.needsUpdate=!0;for(let P=A,E=A+b;P<E;P++){L(l,3*P,p,o),l.needsUpdate=!0;let S=l.distanceToTriangle(m,T,y);if(S<x&&(w.copy(T),d&&d.copy(y),x=S,h=P,g=v),S<c)return!0}}}}}),G.releasePrimitive(l),G.releasePrimitive(m),x===1/0?null:(i.point?i.point.copy(w):i.point=w.clone(),i.distance=x,i.faceIndex=h,r&&(r.point?r.point.copy(d):r.point=d.clone(),r.point.applyMatrix4(Wt),w.applyMatrix4(Wt),r.distance=w.sub(r.point).length(),r.faceIndex=g),i)}function Tn(n,e=null){e&&Array.isArray(e)&&(e=new Set(e));let t=n.geometry,i=t.index?t.index.array:null,r=t.attributes.position,c,s,a,o,p=0,f=n._roots;for(let l=0,m=f.length;l<m;l++)c=f[l],s=new Uint32Array(c),a=new Uint16Array(c),o=new Float32Array(c),u(0,p),p+=c.byteLength;function u(l,m,T=!1){let w=l*2;if(a[w+15]===65535){let d=s[l+6],x=a[w+14],h=1/0,g=1/0,A=1/0,b=-1/0,B=-1/0,v=-1/0;for(let _=d,P=d+x;_<P;_++){let E=3*n.resolveTriangleIndex(_);for(let S=0;S<3;S++){let I=E+S;I=i?i[I]:I;let F=r.getX(I),M=r.getY(I),V=r.getZ(I);F<h&&(h=F),F>b&&(b=F),M<g&&(g=M),M>B&&(B=M),V<A&&(A=V),V>v&&(v=V)}}return o[l+0]!==h||o[l+1]!==g||o[l+2]!==A||o[l+3]!==b||o[l+4]!==B||o[l+5]!==v?(o[l+0]=h,o[l+1]=g,o[l+2]=A,o[l+3]=b,o[l+4]=B,o[l+5]=v,!0):!1}else{let d=l+8,x=s[l+6],h=d+m,g=x+m,A=T,b=!1,B=!1;e?A||(b=e.has(h),B=e.has(g),A=!b&&!B):(b=!0,B=!0);let v=A||b,_=A||B,P=!1;v&&(P=u(d,m,A));let E=!1;_&&(E=u(x,m,A));let S=P||E;if(S)for(let I=0;I<3;I++){let F=d+I,M=x+I,V=o[F],$=o[F+3],gt=o[M],bt=o[M+3];o[l+I]=V<gt?V:gt,o[l+I+3]=$>bt?$:bt}return S}}}function wn(n,e,t,i,r,c,s){D.setBuffer(n._roots[e]),Pe(0,n,t,i,r,c,s),D.clearBuffer()}function Pe(n,e,t,i,r,c,s){let{float32Array:a,uint16Array:o,uint32Array:p}=D,f=n*2;if(C(f,o)){let l=U(n,p),m=R(f,o);un(e,t,i,l,m,r,c,s)}else{let l=H(n);Y(l,a,i,c,s)&&Pe(l,e,t,i,r,c,s);let m=O(n,p);Y(m,a,i,c,s)&&Pe(m,e,t,i,r,c,s)}}var di=["x","y","z"];function gn(n,e,t,i,r,c){D.setBuffer(n._roots[e]);let s=Ee(0,n,t,i,r,c);return D.clearBuffer(),s}function Ee(n,e,t,i,r,c){let{float32Array:s,uint16Array:a,uint32Array:o}=D,p=n*2;if(C(p,a)){let u=U(n,o),l=R(p,a);return pn(e,t,i,u,l,r,c)}else{let u=ct(n,o),l=di[u],T=i.direction[l]>=0,w,y;T?(w=H(n),y=O(n,o)):(w=O(n,o),y=H(n));let x=Y(w,s,i,r,c)?Ee(w,e,t,i,r,c):null;if(x){let A=x.point[l];if(T?A<=s[y+u]:A>=s[y+u+3])return x}let g=Y(y,s,i,r,c)?Ee(y,e,t,i,r,c):null;return x&&g?x.distance<=g.distance?x:g:x||g||null}}import{Box3 as xi,Matrix4 as yi}from"three";var Jt=new xi,ht=new k,At=new k,Ft=new yi,bn=new z,Qt=new z;function Bn(n,e,t,i){D.setBuffer(n._roots[e]);let r=Ie(0,n,t,i);return D.clearBuffer(),r}function Ie(n,e,t,i,r=null){let{float32Array:c,uint16Array:s,uint32Array:a}=D,o=n*2;if(r===null&&(t.boundingBox||t.computeBoundingBox(),bn.set(t.boundingBox.min,t.boundingBox.max,i),r=bn),C(o,s)){let f=e.geometry,u=f.index,l=f.attributes.position,m=t.index,T=t.attributes.position,w=U(n,a),y=R(o,s);if(Ft.copy(i).invert(),t.boundsTree)return N(n,c,Qt),Qt.matrix.copy(Ft),Qt.needsUpdate=!0,t.boundsTree.shapecast({intersectsBounds:x=>Qt.intersectsBox(x),intersectsTriangle:x=>{x.a.applyMatrix4(i),x.b.applyMatrix4(i),x.c.applyMatrix4(i),x.needsUpdate=!0;for(let h=w,g=y+w;h<g;h++)if(L(At,3*e.resolveTriangleIndex(h),u,l),At.needsUpdate=!0,x.intersectsTriangle(At))return!0;return!1}});for(let d=w,x=y+w;d<x;d++){let h=e.resolveTriangleIndex(d);L(ht,3*h,u,l),ht.a.applyMatrix4(Ft),ht.b.applyMatrix4(Ft),ht.c.applyMatrix4(Ft),ht.needsUpdate=!0;for(let g=0,A=m.count;g<A;g+=3)if(L(At,g,m,T),At.needsUpdate=!0,ht.intersectsTriangle(At))return!0}}else{let f=n+8,u=a[n+6];return N(f,c,Jt),!!(r.intersectsBox(Jt)&&Ie(f,e,t,i,r)||(N(u,c,Jt),r.intersectsBox(Jt)&&Ie(u,e,t,i,r)))}}import{Matrix4 as hi,Vector3 as ee}from"three";var te=new hi,Fe=new z,Dt=new z,Ai=new ee,Ti=new ee,wi=new ee,gi=new ee;function _n(n,e,t,i={},r={},c=0,s=1/0){e.boundingBox||e.computeBoundingBox(),Fe.set(e.boundingBox.min,e.boundingBox.max,t),Fe.needsUpdate=!0;let a=n.geometry,o=a.attributes.position,p=a.index,f=e.attributes.position,u=e.index,l=G.getPrimitive(),m=G.getPrimitive(),T=Ai,w=Ti,y=null,d=null;r&&(y=wi,d=gi);let x=1/0,h=null,g=null;return te.copy(t).invert(),Dt.matrix.copy(te),n.shapecast({boundsTraverseOrder:A=>Fe.distanceToBox(A),intersectsBounds:(A,b,B)=>B<x&&B<s?(b&&(Dt.min.copy(A.min),Dt.max.copy(A.max),Dt.needsUpdate=!0),!0):!1,intersectsRange:(A,b)=>{if(e.boundsTree){let B=e.boundsTree;return B.shapecast({boundsTraverseOrder:v=>Dt.distanceToBox(v),intersectsBounds:(v,_,P)=>P<x&&P<s,intersectsRange:(v,_)=>{for(let P=v,E=v+_;P<E;P++){let S=B.resolveTriangleIndex(P);L(m,3*S,u,f),m.a.applyMatrix4(t),m.b.applyMatrix4(t),m.c.applyMatrix4(t),m.needsUpdate=!0;for(let I=A,F=A+b;I<F;I++){let M=n.resolveTriangleIndex(I);L(l,3*M,p,o),l.needsUpdate=!0;let V=l.distanceToTriangle(m,T,y);if(V<x&&(w.copy(T),d&&d.copy(y),x=V,h=I,g=P),V<c)return!0}}}})}else{let B=Z(e);for(let v=0,_=B;v<_;v++){L(m,3*v,u,f),m.a.applyMatrix4(t),m.b.applyMatrix4(t),m.c.applyMatrix4(t),m.needsUpdate=!0;for(let P=A,E=A+b;P<E;P++){let S=n.resolveTriangleIndex(P);L(l,3*S,p,o),l.needsUpdate=!0;let I=l.distanceToTriangle(m,T,y);if(I<x&&(w.copy(T),d&&d.copy(y),x=I,h=P,g=v),I<c)return!0}}}}}),G.releasePrimitive(l),G.releasePrimitive(m),x===1/0?null:(i.point?i.point.copy(w):i.point=w.clone(),i.distance=x,i.faceIndex=h,r&&(r.point?r.point.copy(d):r.point=d.clone(),r.point.applyMatrix4(te),w.applyMatrix4(te),r.distance=w.sub(r.point).length(),r.faceIndex=g),i)}function vn(){return typeof SharedArrayBuffer<"u"}import{Box3 as Nt,Matrix4 as bi}from"three";var Mt=new D.constructor,ne=new D.constructor,it=new et(()=>new Nt),Tt=new Nt,wt=new Nt,De=new Nt,Me=new Nt,Ne=!1;function Sn(n,e,t,i){if(Ne)throw new Error("MeshBVH: Recursive calls to bvhcast not supported.");Ne=!0;let r=n._roots,c=e._roots,s,a=0,o=0,p=new bi().copy(t).invert();for(let f=0,u=r.length;f<u;f++){Mt.setBuffer(r[f]),o=0;let l=it.getPrimitive();N(0,Mt.float32Array,l),l.applyMatrix4(p);for(let m=0,T=c.length;m<T&&(ne.setBuffer(c[f]),s=j(0,0,t,p,i,a,o,0,0,l),ne.clearBuffer(),o+=c[m].length,!s);m++);if(it.releasePrimitive(l),Mt.clearBuffer(),a+=r[f].length,s)break}return Ne=!1,s}function j(n,e,t,i,r,c=0,s=0,a=0,o=0,p=null,f=!1){let u,l;f?(u=ne,l=Mt):(u=Mt,l=ne);let m=u.float32Array,T=u.uint32Array,w=u.uint16Array,y=l.float32Array,d=l.uint32Array,x=l.uint16Array,h=n*2,g=e*2,A=C(h,w),b=C(g,x),B=!1;if(b&&A)f?B=r(U(e,d),R(e*2,x),U(n,T),R(n*2,w),o,s+e,a,c+n):B=r(U(n,T),R(n*2,w),U(e,d),R(e*2,x),a,c+n,o,s+e);else if(b){let v=it.getPrimitive();N(e,y,v),v.applyMatrix4(t);let _=H(n),P=O(n,T);N(_,m,Tt),N(P,m,wt);let E=v.intersectsBox(Tt),S=v.intersectsBox(wt);B=E&&j(e,_,i,t,r,s,c,o,a+1,v,!f)||S&&j(e,P,i,t,r,s,c,o,a+1,v,!f),it.releasePrimitive(v)}else{let v=H(e),_=O(e,d);N(v,y,De),N(_,y,Me);let P=p.intersectsBox(De),E=p.intersectsBox(Me);if(P&&E)B=j(n,v,t,i,r,c,s,a,o+1,p,f)||j(n,_,t,i,r,c,s,a,o+1,p,f);else if(P)if(A)B=j(n,v,t,i,r,c,s,a,o+1,p,f);else{let S=it.getPrimitive();S.copy(De).applyMatrix4(t);let I=H(n),F=O(n,T);N(I,m,Tt),N(F,m,wt);let M=S.intersectsBox(Tt),V=S.intersectsBox(wt);B=M&&j(v,I,i,t,r,s,c,o,a+1,S,!f)||V&&j(v,F,i,t,r,s,c,o,a+1,S,!f),it.releasePrimitive(S)}else if(E)if(A)B=j(n,_,t,i,r,c,s,a,o+1,p,f);else{let S=it.getPrimitive();S.copy(Me).applyMatrix4(t);let I=H(n),F=O(n,T);N(I,m,Tt),N(F,m,wt);let M=S.intersectsBox(Tt),V=S.intersectsBox(wt);B=M&&j(_,I,i,t,r,s,c,o,a+1,S,!f)||V&&j(_,F,i,t,r,s,c,o,a+1,S,!f),it.releasePrimitive(S)}}return B}var ie=new z,En=new In,_i={strategy:0,maxDepth:40,maxLeafTris:10,useSharedArrayBuffer:!1,setBoundingBox:!0,onProgress:null,indirect:!1,verbose:!0},re=class n{static serialize(e,t={}){t={cloneBuffers:!0,...t};let i=e.geometry,r=e._roots,c=e._indirectBuffer,s=i.getIndex(),a;return t.cloneBuffers?a={roots:r.map(o=>o.slice()),index:s?s.array.slice():null,indirectBuffer:c?c.slice():null}:a={roots:r,index:s?s.array:null,indirectBuffer:c},a}static deserialize(e,t,i={}){i={setIndex:!0,indirect:!!e.indirectBuffer,...i};let{index:r,roots:c,indirectBuffer:s}=e,a=new n(t,{...i,[Ct]:!0});if(a._roots=c,a._indirectBuffer=s||null,i.setIndex){let o=t.getIndex();if(o===null){let p=new Bi(e.index,1,!1);t.setIndex(p)}else o.array!==r&&(o.array.set(r),o.needsUpdate=!0)}return a}get indirect(){return!!this._indirectBuffer}constructor(e,t={}){if(e.isBufferGeometry){if(e.index&&e.index.isInterleavedBufferAttribute)throw new Error("MeshBVH: InterleavedBufferAttribute is not supported for the index attribute.")}else throw new Error("MeshBVH: Only BufferGeometries are supported.");if(t=Object.assign({..._i,[Ct]:!1},t),t.useSharedArrayBuffer&&!vn())throw new Error("MeshBVH: SharedArrayBuffer is not available.");this.geometry=e,this._roots=null,this._indirectBuffer=null,t[Ct]||(We(this,t),!e.boundingBox&&t.setBoundingBox&&(e.boundingBox=this.getBoundingBox(new In))),this.resolveTriangleIndex=t.indirect?i=>this._indirectBuffer[i]:i=>i}refit(e=null){return(this.indirect?Tn:fn)(this,e)}traverse(e,t=0){let i=this._roots[t],r=new Uint32Array(i),c=new Uint16Array(i);s(0);function s(a,o=0){let p=a*2,f=c[p+15]===65535;if(f){let u=r[a+6],l=c[p+14];e(o,f,new Float32Array(i,a*4,6),u,l)}else{let u=a+32/4,l=r[a+6],m=r[a+7];e(o,f,new Float32Array(i,a*4,6),m)||(s(u,o+1),s(l,o+1))}}}raycast(e,t=Pn,i=0,r=1/0){let c=this._roots,s=this.geometry,a=[],o=t.isMaterial,p=Array.isArray(t),f=s.groups,u=o?t.side:t,l=this.indirect?wn:dn;for(let m=0,T=c.length;m<T;m++){let w=p?t[f[m].materialIndex].side:u,y=a.length;if(l(this,m,w,e,a,i,r),p){let d=f[m].materialIndex;for(let x=y,h=a.length;x<h;x++)a[x].face.materialIndex=d}}return a}raycastFirst(e,t=Pn,i=0,r=1/0){let c=this._roots,s=this.geometry,a=t.isMaterial,o=Array.isArray(t),p=null,f=s.groups,u=a?t.side:t,l=this.indirect?gn:xn;for(let m=0,T=c.length;m<T;m++){let w=o?t[f[m].materialIndex].side:u,y=l(this,m,w,e,i,r);y!=null&&(p==null||y.distance<p.distance)&&(p=y,o&&(y.face.materialIndex=f[m].materialIndex))}return p}intersectsGeometry(e,t){let i=!1,r=this._roots,c=this.indirect?Bn:hn;for(let s=0,a=r.length;s<a&&(i=c(this,s,e,t),!i);s++);return i}shapecast(e){let t=G.getPrimitive(),i=this.indirect?mn:ln,{boundsTraverseOrder:r,intersectsBounds:c,intersectsRange:s,intersectsTriangle:a}=e;if(s&&a){let u=s;s=(l,m,T,w,y)=>u(l,m,T,w,y)?!0:i(l,m,this,a,T,w,t)}else s||(a?s=(u,l,m,T)=>i(u,l,this,a,m,T,t):s=(u,l,m)=>m);let o=!1,p=0,f=this._roots;for(let u=0,l=f.length;u<l;u++){let m=f[u];if(o=tn(this,u,c,s,r,p),o)break;p+=m.byteLength}return G.releasePrimitive(t),o}bvhcast(e,t,i){let{intersectsRanges:r,intersectsTriangles:c}=i,s=G.getPrimitive(),a=this.geometry.index,o=this.geometry.attributes.position,p=this.indirect?T=>{let w=this.resolveTriangleIndex(T);L(s,w*3,a,o)}:T=>{L(s,T*3,a,o)},f=G.getPrimitive(),u=e.geometry.index,l=e.geometry.attributes.position,m=e.indirect?T=>{let w=e.resolveTriangleIndex(T);L(f,w*3,u,l)}:T=>{L(f,T*3,u,l)};if(c){let T=(w,y,d,x,h,g,A,b)=>{for(let B=d,v=d+x;B<v;B++){m(B),f.a.applyMatrix4(t),f.b.applyMatrix4(t),f.c.applyMatrix4(t),f.needsUpdate=!0;for(let _=w,P=w+y;_<P;_++)if(p(_),s.needsUpdate=!0,c(s,f,_,B,h,g,A,b))return!0}return!1};if(r){let w=r;r=function(y,d,x,h,g,A,b,B){return w(y,d,x,h,g,A,b,B)?!0:T(y,d,x,h,g,A,b,B)}}else r=T}return Sn(this,e,t,r)}intersectsBox(e,t){return ie.set(e.min,e.max,t),ie.needsUpdate=!0,this.shapecast({intersectsBounds:i=>ie.intersectsBox(i),intersectsTriangle:i=>ie.intersectsTriangle(i)})}intersectsSphere(e){return this.shapecast({intersectsBounds:t=>e.intersectsBox(t),intersectsTriangle:t=>t.intersectsSphere(e)})}closestPointToGeometry(e,t,i={},r={},c=0,s=1/0){return(this.indirect?_n:An)(this,e,t,i,r,c,s)}closestPointToPoint(e,t={},i=0,r=1/0){return nn(this,e,t,i,r)}getBoundingBox(e){return e.makeEmpty(),this._roots.forEach(i=>{N(0,new Float32Array(i),En),e.union(En)}),e}};import{DataTexture as Ln,FloatType as Li,UnsignedIntType as Ci,RGBAFormat as Ui,RGIntegerFormat as Ri,NearestFilter as le,BufferAttribute as zi}from"three";import{DataTexture as vi,FloatType as se,IntType as Le,UnsignedIntType as oe,ByteType as Fn,UnsignedByteType as Dn,ShortType as Si,UnsignedShortType as Pi,RedFormat as Ei,RGFormat as Ii,RGBAFormat as Ce,RedIntegerFormat as Fi,RGIntegerFormat as Di,RGBAIntegerFormat as Ue,NearestFilter as Mn}from"three";function Mi(n){switch(n){case 1:return"R";case 2:return"RG";case 3:return"RGBA";case 4:return"RGBA"}throw new Error}function Ni(n){switch(n){case 1:return Ei;case 2:return Ii;case 3:return Ce;case 4:return Ce}}function Nn(n){switch(n){case 1:return Fi;case 2:return Di;case 3:return Ue;case 4:return Ue}}var ce=class extends vi{constructor(){super(),this.minFilter=Mn,this.magFilter=Mn,this.generateMipmaps=!1,this.overrideItemSize=null,this._forcedType=null}updateFrom(e){let t=this.overrideItemSize,i=e.itemSize,r=e.count;if(t!==null){if(i*r%t!==0)throw new Error("VertexAttributeTexture: overrideItemSize must divide evenly into buffer length.");e.itemSize=t,e.count=r*i/t}let c=e.itemSize,s=e.count,a=e.normalized,o=e.array.constructor,p=o.BYTES_PER_ELEMENT,f=this._forcedType,u=c;if(f===null)switch(o){case Float32Array:f=se;break;case Uint8Array:case Uint16Array:case Uint32Array:f=oe;break;case Int8Array:case Int16Array:case Int32Array:f=Le;break}let l,m,T,w,y=Mi(c);switch(f){case se:T=1,m=Ni(c),a&&p===1?(w=o,y+="8",o===Uint8Array?l=Dn:(l=Fn,y+="_SNORM")):(w=Float32Array,y+="32F",l=se);break;case Le:y+=p*8+"I",T=a?Math.pow(2,o.BYTES_PER_ELEMENT*8-1):1,m=Nn(c),p===1?(w=Int8Array,l=Fn):p===2?(w=Int16Array,l=Si):(w=Int32Array,l=Le);break;case oe:y+=p*8+"UI",T=a?Math.pow(2,o.BYTES_PER_ELEMENT*8-1):1,m=Nn(c),p===1?(w=Uint8Array,l=Dn):p===2?(w=Uint16Array,l=Pi):(w=Uint32Array,l=oe);break}u===3&&(m===Ce||m===Ue)&&(u=4);let d=Math.ceil(Math.sqrt(s))||1,x=u*d*d,h=new w(x),g=e.normalized;e.normalized=!1;for(let A=0;A<s;A++){let b=u*A;h[b]=e.getX(A)/T,c>=2&&(h[b+1]=e.getY(A)/T),c>=3&&(h[b+2]=e.getZ(A)/T,u===4&&(h[b+3]=1)),c>=4&&(h[b+3]=e.getW(A)/T)}e.normalized=g,this.internalFormat=y,this.format=m,this.type=l,this.image.width=d,this.image.height=d,this.image.data=h,this.needsUpdate=!0,this.dispose(),e.itemSize=i,e.count=r}},ae=class extends ce{constructor(){super(),this._forcedType=oe}};var Lt=class extends ce{constructor(){super(),this._forcedType=se}};var Re=class{constructor(){this.index=new ae,this.position=new Lt,this.bvhBounds=new Ln,this.bvhContents=new Ln,this._cachedIndexAttr=null,this.index.overrideItemSize=3}updateFrom(e){let{geometry:t}=e;if(Oi(e,this.bvhBounds,this.bvhContents),this.position.updateFrom(t.attributes.position),e.indirect){let i=e._indirectBuffer;if(this._cachedIndexAttr===null||this._cachedIndexAttr.count!==i.length)if(t.index)this._cachedIndexAttr=t.index.clone();else{let r=ue(fe(t));this._cachedIndexAttr=new zi(r,1,!1)}Vi(t,i,this._cachedIndexAttr),this.index.updateFrom(this._cachedIndexAttr)}else this.index.updateFrom(t.index)}dispose(){let{index:e,position:t,bvhBounds:i,bvhContents:r}=this;e&&e.dispose(),t&&t.dispose(),i&&i.dispose(),r&&r.dispose()}};function Vi(n,e,t){let i=t.array,r=n.index?n.index.array:null;for(let c=0,s=e.length;c<s;c++){let a=3*c,o=3*e[c];for(let p=0;p<3;p++)i[a+p]=r?r[o+p]:o+p}}function Oi(n,e,t){let i=n._roots;if(i.length!==1)throw new Error("MeshBVHUniformStruct: Multi-root BVHs not supported.");let r=i[0],c=new Uint16Array(r),s=new Uint32Array(r),a=new Float32Array(r),o=r.byteLength/32,p=2*Math.ceil(Math.sqrt(o/2)),f=new Float32Array(4*p*p),u=Math.ceil(Math.sqrt(o)),l=new Uint32Array(2*u*u);for(let m=0;m<o;m++){let T=m*32/4,w=T*2,y=T;for(let d=0;d<3;d++)f[8*m+0+d]=a[y+0+d],f[8*m+4+d]=a[y+3+d];if(C(w,c)){let d=R(w,c),x=U(T,s),h=4294901760|d;l[m*2+0]=h,l[m*2+1]=x}else{let d=4*O(T,s)/32,x=ct(T,s);l[m*2+0]=x,l[m*2+1]=d}}e.image.data=f,e.image.width=p,e.image.height=p,e.format=Ui,e.type=Li,e.internalFormat="RGBA32F",e.minFilter=le,e.magFilter=le,e.generateMipmaps=!1,e.needsUpdate=!0,e.dispose(),t.image.data=l,t.image.width=u,t.image.height=u,t.format=Ri,t.type=Ci,t.internalFormat="RG32UI",t.minFilter=le,t.magFilter=le,t.generateMipmaps=!1,t.needsUpdate=!0,t.dispose()}var Cn=`

// A stack of uint32 indices can can store the indices for
// a perfectly balanced tree with a depth up to 31. Lower stack
// depth gets higher performance.
//
// However not all trees are balanced. Best value to set this to
// is the trees max depth.
#ifndef BVH_STACK_DEPTH
#define BVH_STACK_DEPTH 60
#endif

#ifndef INFINITY
#define INFINITY 1e20
#endif

// Utilities
uvec4 uTexelFetch1D( usampler2D tex, uint index ) {

	uint width = uint( textureSize( tex, 0 ).x );
	uvec2 uv;
	uv.x = index % width;
	uv.y = index / width;

	return texelFetch( tex, ivec2( uv ), 0 );

}

ivec4 iTexelFetch1D( isampler2D tex, uint index ) {

	uint width = uint( textureSize( tex, 0 ).x );
	uvec2 uv;
	uv.x = index % width;
	uv.y = index / width;

	return texelFetch( tex, ivec2( uv ), 0 );

}

vec4 texelFetch1D( sampler2D tex, uint index ) {

	uint width = uint( textureSize( tex, 0 ).x );
	uvec2 uv;
	uv.x = index % width;
	uv.y = index / width;

	return texelFetch( tex, ivec2( uv ), 0 );

}

vec4 textureSampleBarycoord( sampler2D tex, vec3 barycoord, uvec3 faceIndices ) {

	return
		barycoord.x * texelFetch1D( tex, faceIndices.x ) +
		barycoord.y * texelFetch1D( tex, faceIndices.y ) +
		barycoord.z * texelFetch1D( tex, faceIndices.z );

}

void ndcToCameraRay(
	vec2 coord, mat4 cameraWorld, mat4 invProjectionMatrix,
	out vec3 rayOrigin, out vec3 rayDirection
) {

	// get camera look direction and near plane for camera clipping
	vec4 lookDirection = cameraWorld * vec4( 0.0, 0.0, - 1.0, 0.0 );
	vec4 nearVector = invProjectionMatrix * vec4( 0.0, 0.0, - 1.0, 1.0 );
	float near = abs( nearVector.z / nearVector.w );

	// get the camera direction and position from camera matrices
	vec4 origin = cameraWorld * vec4( 0.0, 0.0, 0.0, 1.0 );
	vec4 direction = invProjectionMatrix * vec4( coord, 0.5, 1.0 );
	direction /= direction.w;
	direction = cameraWorld * direction - origin;

	// slide the origin along the ray until it sits at the near clip plane position
	origin.xyz += direction.xyz * near / dot( direction, lookDirection );

	rayOrigin = origin.xyz;
	rayDirection = direction.xyz;

}
`;var Un=`

#ifndef TRI_INTERSECT_EPSILON
#define TRI_INTERSECT_EPSILON 1e-5
#endif

// Raycasting
bool intersectsBounds( vec3 rayOrigin, vec3 rayDirection, vec3 boundsMin, vec3 boundsMax, out float dist ) {

	// https://www.reddit.com/r/opengl/comments/8ntzz5/fast_glsl_ray_box_intersection/
	// https://tavianator.com/2011/ray_box.html
	vec3 invDir = 1.0 / rayDirection;

	// find intersection distances for each plane
	vec3 tMinPlane = invDir * ( boundsMin - rayOrigin );
	vec3 tMaxPlane = invDir * ( boundsMax - rayOrigin );

	// get the min and max distances from each intersection
	vec3 tMinHit = min( tMaxPlane, tMinPlane );
	vec3 tMaxHit = max( tMaxPlane, tMinPlane );

	// get the furthest hit distance
	vec2 t = max( tMinHit.xx, tMinHit.yz );
	float t0 = max( t.x, t.y );

	// get the minimum hit distance
	t = min( tMaxHit.xx, tMaxHit.yz );
	float t1 = min( t.x, t.y );

	// set distance to 0.0 if the ray starts inside the box
	dist = max( t0, 0.0 );

	return t1 >= dist;

}

bool intersectsTriangle(
	vec3 rayOrigin, vec3 rayDirection, vec3 a, vec3 b, vec3 c,
	out vec3 barycoord, out vec3 norm, out float dist, out float side
) {

	// https://stackoverflow.com/questions/42740765/intersection-between-line-and-triangle-in-3d
	vec3 edge1 = b - a;
	vec3 edge2 = c - a;
	norm = cross( edge1, edge2 );

	float det = - dot( rayDirection, norm );
	float invdet = 1.0 / det;

	vec3 AO = rayOrigin - a;
	vec3 DAO = cross( AO, rayDirection );

	vec4 uvt;
	uvt.x = dot( edge2, DAO ) * invdet;
	uvt.y = - dot( edge1, DAO ) * invdet;
	uvt.z = dot( AO, norm ) * invdet;
	uvt.w = 1.0 - uvt.x - uvt.y;

	// set the hit information
	barycoord = uvt.wxy; // arranged in A, B, C order
	dist = uvt.z;
	side = sign( det );
	norm = side * normalize( norm );

	// add an epsilon to avoid misses between triangles
	uvt += vec4( TRI_INTERSECT_EPSILON );

	return all( greaterThanEqual( uvt, vec4( 0.0 ) ) );

}

bool intersectTriangles(
	// geometry info and triangle range
	sampler2D positionAttr, usampler2D indexAttr, uint offset, uint count,

	// ray
	vec3 rayOrigin, vec3 rayDirection,

	// outputs
	inout float minDistance, inout uvec4 faceIndices, inout vec3 faceNormal, inout vec3 barycoord,
	inout float side, inout float dist
) {

	bool found = false;
	vec3 localBarycoord, localNormal;
	float localDist, localSide;
	for ( uint i = offset, l = offset + count; i < l; i ++ ) {

		uvec3 indices = uTexelFetch1D( indexAttr, i ).xyz;
		vec3 a = texelFetch1D( positionAttr, indices.x ).rgb;
		vec3 b = texelFetch1D( positionAttr, indices.y ).rgb;
		vec3 c = texelFetch1D( positionAttr, indices.z ).rgb;

		if (
			intersectsTriangle( rayOrigin, rayDirection, a, b, c, localBarycoord, localNormal, localDist, localSide )
			&& localDist < minDistance
		) {

			found = true;
			minDistance = localDist;

			faceIndices = uvec4( indices.xyz, i );
			faceNormal = localNormal;

			side = localSide;
			barycoord = localBarycoord;
			dist = localDist;

		}

	}

	return found;

}

bool intersectsBVHNodeBounds( vec3 rayOrigin, vec3 rayDirection, sampler2D bvhBounds, uint currNodeIndex, out float dist ) {

	uint cni2 = currNodeIndex * 2u;
	vec3 boundsMin = texelFetch1D( bvhBounds, cni2 ).xyz;
	vec3 boundsMax = texelFetch1D( bvhBounds, cni2 + 1u ).xyz;
	return intersectsBounds( rayOrigin, rayDirection, boundsMin, boundsMax, dist );

}

// use a macro to hide the fact that we need to expand the struct into separate fields
#define	bvhIntersectFirstHit(		bvh,		rayOrigin, rayDirection, faceIndices, faceNormal, barycoord, side, dist	)	_bvhIntersectFirstHit(		bvh.position, bvh.index, bvh.bvhBounds, bvh.bvhContents,		rayOrigin, rayDirection, faceIndices, faceNormal, barycoord, side, dist	)

bool _bvhIntersectFirstHit(
	// bvh info
	sampler2D bvh_position, usampler2D bvh_index, sampler2D bvh_bvhBounds, usampler2D bvh_bvhContents,

	// ray
	vec3 rayOrigin, vec3 rayDirection,

	// output variables split into separate variables due to output precision
	inout uvec4 faceIndices, inout vec3 faceNormal, inout vec3 barycoord,
	inout float side, inout float dist
) {

	// stack needs to be twice as long as the deepest tree we expect because
	// we push both the left and right child onto the stack every traversal
	int ptr = 0;
	uint stack[ BVH_STACK_DEPTH ];
	stack[ 0 ] = 0u;

	float triangleDistance = INFINITY;
	bool found = false;
	while ( ptr > - 1 && ptr < BVH_STACK_DEPTH ) {

		uint currNodeIndex = stack[ ptr ];
		ptr --;

		// check if we intersect the current bounds
		float boundsHitDistance;
		if (
			! intersectsBVHNodeBounds( rayOrigin, rayDirection, bvh_bvhBounds, currNodeIndex, boundsHitDistance )
			|| boundsHitDistance > triangleDistance
		) {

			continue;

		}

		uvec2 boundsInfo = uTexelFetch1D( bvh_bvhContents, currNodeIndex ).xy;
		bool isLeaf = bool( boundsInfo.x & 0xffff0000u );

		if ( isLeaf ) {

			uint count = boundsInfo.x & 0x0000ffffu;
			uint offset = boundsInfo.y;

			found = intersectTriangles(
				bvh_position, bvh_index, offset, count,
				rayOrigin, rayDirection, triangleDistance,
				faceIndices, faceNormal, barycoord, side, dist
			) || found;

		} else {

			uint leftIndex = currNodeIndex + 1u;
			uint splitAxis = boundsInfo.x & 0x0000ffffu;
			uint rightIndex = boundsInfo.y;

			bool leftToRight = rayDirection[ splitAxis ] >= 0.0;
			uint c1 = leftToRight ? leftIndex : rightIndex;
			uint c2 = leftToRight ? rightIndex : leftIndex;

			// set c2 in the stack so we traverse it later. We need to keep track of a pointer in
			// the stack while we traverse. The second pointer added is the one that will be
			// traversed first
			ptr ++;
			stack[ ptr ] = c2;

			ptr ++;
			stack[ ptr ] = c1;

		}

	}

	return found;

}
`;var Rn=`
struct BVH {

	usampler2D index;
	sampler2D position;

	sampler2D bvhBounds;
	usampler2D bvhContents;

};
`;var ki=Rn;var Gi=`
	${Cn}
	${Un}
`;export{Lt as FloatVertexAttributeTexture,re as MeshBVH,Re as MeshBVHUniformStruct,Gi as shaderIntersectFunction,ki as shaderStructs};
