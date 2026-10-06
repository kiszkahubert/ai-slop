export class GpuTimer {
  constructor(gl){this.gl=gl;this.ext=gl.getExtension('EXT_disjoint_timer_query_webgl2');this.pending=[];this.current=null;this.ms=null;}
  begin(){if(!this.ext||this.pending.length>=4)return;this.current=this.gl.createQuery();this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT,this.current);}
  end(){if(!this.current)return;this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);this.pending.push(this.current);this.current=null;}
  poll(){if(!this.ext)return null;const gl=this.gl;if(gl.getParameter(this.ext.GPU_DISJOINT_EXT)){for(const q of this.pending)gl.deleteQuery(q);this.pending=[];this.ms=null;return null;}
    while(this.pending.length&&gl.getQueryParameter(this.pending[0],gl.QUERY_RESULT_AVAILABLE)){const q=this.pending.shift(),ms=gl.getQueryParameter(q,gl.QUERY_RESULT)/1e6;gl.deleteQuery(q);this.ms=this.ms===null?ms:this.ms*.85+ms*.15;}return this.ms;}
  dispose(){if(this.current)this.end();for(const q of this.pending)this.gl.deleteQuery(q);this.pending=[];}
}
