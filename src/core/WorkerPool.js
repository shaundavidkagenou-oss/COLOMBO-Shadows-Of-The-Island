// 93rd — MULTI-CORE: the game's one budget of background compute threads, and the pool class every worker job goes through.
//
// The main thread keeps everything that touches the scene graph, WebGL, the DOM, input and the camera; workers only compute and
// hand back compact results (typed arrays transferred, never copied). The budget is adaptive: navigator.hardwareConcurrency is
// only a hint (a browser may round it, or report logical threads), so the pool takes hwc − 3 threads (main thread, the browser's
// GPU / compositor process, the OS) capped at 4: 12 threads (Ryzen 5 5600X) → 4 workers, 8 → 4, 6 → 3, 4 → 1, 2 → 0 (main-thread
// fallback). Short-lived pools that run while the game is loading (BankTex: the 2K bank surfaces) claim from the same budget,
// so the two never oversubscribe the CPU together. Settings → Graphics → CPU worker threads overrides the count (0 = the
// original main-thread code paths: benchmark A).
//
// Pool protocol (see workerMain below): the main thread posts { id, kind, data } and the worker answers { id, res, ms } or
// { id, err }. Each worker runs one job at a time and the queue stays on the main thread, so priorities are decided at the
// moment a worker becomes free (a chunk the player has meanwhile driven past drops behind the one now in front of them).
const HWC = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 4;
export const CPU = { hwc: HWC, override: null, claims: new Map(), pools: new Set() };
export function autoWorkers(hwc = HWC) { return Math.max(0, Math.min(4, hwc - 3)); }
// threads the game may use for background compute right now (minus what loading-time pools hold)
export function workerBudget() { const want = CPU.override != null ? CPU.override : autoWorkers(); let held = 0; for (const n of CPU.claims.values()) held += n; return Math.max(0, want - held); }
export function setWorkerOverride(n) { CPU.override = n == null || n === 'auto' ? null : Math.max(0, Math.min(6, n | 0)); resizeAll(); }
const resizeAll = () => { for (const p of CPU.pools) if (p.resize) p.resize(); };
export function claimThreads(name, n) { CPU.claims.set(name, n); resizeAll(); }
export function releaseThreads(name) { if (CPU.claims.delete(name)) resizeAll(); } // the threads go back to the long-lived pools
export const canWork = () => typeof Worker !== 'undefined';

const STAT_WINDOW = 2000; // ms: rolling window of the busy / throughput figures in the CPU panel
export class WorkerPool {
  // make(): a new Worker; init: message every new worker gets first (or a function returning it); size: thread count (a number or
  // a function, re-read by resize())
  constructor(name, make, { size = 1, init = null, onLost = null } = {}) {
    this.name = name; this.make = make; this.init = init; this.sizeFn = typeof size === 'function' ? size : () => size; this.onLost = onLost;
    this.workers = []; this.queue = []; this.jobs = new Map(); this.nextId = 1; this.dead = false; this.broken = 0;
    this.stat = { posted: 0, done: 0, failed: 0, cancelled: 0, ms: 0, maxMs: 0, waitMs: 0, maxWait: 0, inMsgs: 0, outMsgs: 0, outBytes: 0, recent: [] };
    CPU.pools.add(this); this.resize();
  }
  get size() { return this.workers.filter((w) => !w.lost).length; }
  resize() { if (this.dead) return; const want = Math.max(0, this.sizeFn() | 0);
    while (this.size < want && this.broken < 3) if (!this.spawn()) break;
    // shrink: idle workers go at once, busy ones once their job is done
    for (const W of this.workers) if (!W.lost && this.size > want) { if (!W.job) this.retire(W); else W.retireAfter = true; }
    if (!want) this.cancel(() => true); // nobody left to run them: their callers fall back to the main thread
    this.pump(); }
  spawn() { let w; try { w = this.make(); } catch (e) { console.warn(this.name + ': no worker', e); this.broken++; return false; }
    const W = { w, job: null, jobs: 0, ms: 0, maxMs: 0, lost: false, born: performance.now(), recent: [], idx: this.workers.length };
    w.onmessage = (e) => this.onMessage(W, e.data);
    w.onerror = (e) => { console.warn(this.name + ' worker error', e.message || e); if (e.preventDefault) e.preventDefault(); this.lose(W, e.message || 'worker error'); };
    w.onmessageerror = () => this.lose(W, 'message error');
    const ini = typeof this.init === 'function' ? this.init() : this.init; if (ini) { w.postMessage({ id: 0, kind: 'init', data: ini }); this.stat.outMsgs++; }
    this.workers.push(W); return true; }
  retire(W) { W.lost = true; try { W.w.terminate(); } catch (e) { /* gone */ } this.workers = this.workers.filter((x) => x !== W); }
  lose(W, why) { if (W.lost) return; this.broken++; const J = W.job; this.retire(W); W.job = null;
    if (J) { this.jobs.delete(J.id); this.stat.failed++; J.reject(new Error(why)); }
    if (this.onLost) this.onLost(why); if (this.broken < 3) this.resize(); else { for (const q of this.queue.splice(0)) { this.stat.failed++; q.reject(new Error('pool broken')); } } }
  // queue a job. prio: a number or a function (re-evaluated whenever a worker frees up; lower first). Resolves with the worker's
  // result; rejects when the pool cannot run it (the caller then does the work on the main thread, as before the pool existed)
  run(kind, data, { transfer = null, prio = 0, bytes = 0 } = {}) {
    if (this.dead || !this.size) return Promise.reject(new Error('no workers'));
    return new Promise((resolve, reject) => { const J = { id: this.nextId++, kind, data, transfer, prio, bytes, resolve, reject, tq: performance.now(), cancelled: false };
      this.queue.push(J); this.stat.posted++; this.pump(); }); }
  // drop queued jobs matching fn (not yet started: they never run); running ones finish and are ignored by their caller
  cancel(fn) { const keep = []; for (const J of this.queue) { if (fn(J.data, J.kind)) { this.stat.cancelled++; J.reject(Object.assign(new Error('cancelled'), { cancelled: true })); } else keep.push(J); } this.queue = keep; }
  // a message to every live worker (state they need before later jobs: a worker handles its messages in order)
  broadcast(kind, data) { for (const W of this.workers) if (!W.lost) { W.w.postMessage({ id: 0, kind, data }); this.stat.outMsgs++; } }
  pump() {
    while (this.queue.length) { const W = this.workers.find((x) => !x.lost && !x.job && !x.retireAfter); if (!W) return;
      let bi = 0, bp = Infinity; for (let i = 0; i < this.queue.length; i++) { const q = this.queue[i]; const p = typeof q.prio === 'function' ? q.prio() : q.prio; if (p < bp) { bp = p; bi = i; } }
      const J = this.queue.splice(bi, 1)[0]; W.job = J; J.t0 = performance.now(); const wait = J.t0 - J.tq; this.stat.waitMs += wait; if (wait > this.stat.maxWait) this.stat.maxWait = wait;
      this.jobs.set(J.id, J); this.stat.outMsgs++; this.stat.outBytes += J.bytes;
      try { W.w.postMessage({ id: J.id, kind: J.kind, data: J.data }, J.transfer || []); } catch (e) { W.job = null; this.jobs.delete(J.id); this.stat.failed++; J.reject(e); }
      J.data = null; } }
  onMessage(W, d) { this.stat.inMsgs++; if (!d || !d.id) return; const J = this.jobs.get(d.id); if (!J) return; this.jobs.delete(d.id); W.job = null;
    const now = performance.now(), ms = d.ms ?? now - J.t0; W.jobs++; W.ms += ms; if (ms > W.maxMs) W.maxMs = ms; W.recent.push([now, ms]);
    const S = this.stat; S.ms += ms; if (ms > S.maxMs) S.maxMs = ms; S.recent.push([now, ms, now - J.tq]);
    if (d.err) { S.failed++; J.reject(new Error(d.err)); } else { S.done++; J.resolve(d.res); }
    if (W.retireAfter) this.retire(W); this.pump(); }
  // figures for the CPU panel. busy = the share of the last 2 s each worker thread spent inside jobs (its own measured job time),
  // not an operating-system per-core load (a browser cannot read that)
  stats() { const now = performance.now(), cut = now - STAT_WINDOW; const S = this.stat; S.recent = S.recent.filter((r) => r[0] >= cut);
    const per = this.workers.map((W) => { W.recent = W.recent.filter((r) => r[0] >= cut); const win = Math.min(STAT_WINDOW, now - W.born); let b = 0; for (const r of W.recent) b += r[1]; return { jobs: W.jobs, busy: win > 0 ? Math.min(1, b / win) : 0, avgMs: W.jobs ? W.ms / W.jobs : 0, maxMs: W.maxMs, running: !!W.job }; });
    let rms = 0, rwait = 0; for (const r of S.recent) { rms += r[1]; rwait += r[2]; }
    return { name: this.name, size: this.size, pending: this.queue.length, running: this.jobs.size, done: S.done, failed: S.failed, cancelled: S.cancelled,
      avgMs: S.done ? S.ms / S.done : 0, maxMs: S.maxMs, avgWait: S.done ? S.waitMs / S.done : 0, maxWait: S.maxWait, perSec: S.recent.length / (STAT_WINDOW / 1000), recentAvgMs: S.recent.length ? rms / S.recent.length : 0,
      recentLatency: S.recent.length ? rwait / S.recent.length : 0, msgsIn: S.inMsgs, msgsOut: S.outMsgs, MBout: S.outBytes / 1048576, per }; }
  dispose() { this.dead = true; for (const q of this.queue.splice(0)) q.reject(new Error('pool closed')); for (const J of this.jobs.values()) J.reject(new Error('pool closed')); this.jobs.clear();
    for (const W of this.workers) { try { W.w.terminate(); } catch (e) { /* gone */ } } this.workers = []; CPU.pools.delete(this); }
}
export function poolStats() { return [...CPU.pools].map((p) => p.stats()); }

// worker side: handlers[kind](data) → result, or { res, transfer } (transfer: the ArrayBuffers to move back). 'init' and other
// broadcast messages (id 0) get no reply.
export function workerMain(handlers) {
  self.onmessage = async (e) => { const { id, kind, data } = e.data || {}; const t0 = performance.now();
    try { const h = handlers[kind]; if (!h) throw new Error('unknown job ' + kind); let out = h(data); if (out && typeof out.then === 'function') out = await out;
      if (!id) return; const ms = performance.now() - t0;
      if (out && out.transfer) self.postMessage({ id, res: out.res, ms }, out.transfer); else self.postMessage({ id, res: out, ms });
    } catch (err) { if (id) self.postMessage({ id, err: String((err && (err.stack || err.message)) || err) }); else console.warn('worker', kind, err); } };
}
