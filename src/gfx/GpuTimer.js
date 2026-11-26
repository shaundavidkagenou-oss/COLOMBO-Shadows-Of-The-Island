// 91st: GPU time per frame from EXT_disjoint_timer_query_webgl2 — for the in-game benchmark (Benchmark.js) only; nothing runs
// while no benchmark is measuring. TIME_ELAPSED queries cannot overlap, so a frame is a chain of sections, each its own query
// (begin('scene') … end(), then the SGSR pass's begin('sgsr') … end()); the frame's GPU time is their sum.
// Nothing ever waits on the GPU: results are read frames later, only once QUERY_RESULT_AVAILABLE says so (no synchronous
// readback, no stall). A GPU_DISJOINT event (clock change, power state, context trouble) makes the frames in flight meaningless:
// they are dropped and counted. Without the extension (some browsers / drivers hide it) every result is null — reported as
// "unavailable", never estimated. Query objects are pooled; a lost context throws them all away (they belong to the old context).
export class GpuTimer {
  constructor(gl) {
    this.gl = gl; this.ext = gl ? gl.getExtension('EXT_disjoint_timer_query_webgl2') : null; this.ok = !!this.ext;
    this.pool = []; this.open = null; this.cur = null; this.pending = []; this.done = []; this.disjoint = 0; this.lost = false;
    this.onLost = () => { this.lost = true; this.pool.length = 0; this.pending.length = 0; this.open = null; this.cur = null; };
    if (gl && gl.canvas && gl.canvas.addEventListener) gl.canvas.addEventListener('webglcontextlost', this.onLost);
  }
  get available() { return this.ok && !this.lost; }
  frameBegin() { if (!this.available) return; this.end(); this.cur = { sec: [] }; }
  begin(label) { if (!this.available || !this.cur || this.open) return; const gl = this.gl; const q = this.pool.pop() || gl.createQuery(); gl.beginQuery(this.ext.TIME_ELAPSED_EXT, q); this.open = { q, label }; }
  end() { if (!this.open) return; this.gl.endQuery(this.ext.TIME_ELAPSED_EXT); if (this.cur) this.cur.sec.push(this.open); else this.pool.push(this.open.q); this.open = null; }
  frameEnd(tag) { if (!this.available || !this.cur) return; this.end(); if (this.cur.sec.length) { this.cur.tag = tag; this.pending.push(this.cur); } this.cur = null; this.poll(); }
  // non-blocking: collects every frame whose queries have all finished
  poll() {
    if (!this.available || !this.pending.length) return; const gl = this.gl, ext = this.ext;
    if (gl.getParameter(ext.GPU_DISJOINT_EXT)) { this.disjoint += this.pending.length; for (const f of this.pending) for (const s of f.sec) this.pool.push(s.q); this.pending.length = 0; return; }
    while (this.pending.length) {
      const f = this.pending[0]; if (!f.sec.every((s) => gl.getQueryParameter(s.q, gl.QUERY_RESULT_AVAILABLE))) break;
      const r = { tag: f.tag, total: 0 }; for (const s of f.sec) { const ms = gl.getQueryParameter(s.q, gl.QUERY_RESULT) / 1e6; r[s.label] = (r[s.label] || 0) + ms; r.total += ms; this.pool.push(s.q); }
      this.done.push(r); this.pending.shift();
    }
  }
  take() { const d = this.done; this.done = []; return d; }
  dispose() { if (this.gl && this.gl.canvas && this.gl.canvas.removeEventListener) this.gl.canvas.removeEventListener('webglcontextlost', this.onLost); if (!this.lost && this.gl) { for (const q of this.pool) this.gl.deleteQuery(q); for (const f of this.pending) for (const s of f.sec) this.gl.deleteQuery(s.q); } this.pool.length = 0; this.pending.length = 0; }
}
