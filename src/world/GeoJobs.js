// 93rd — main-thread side of the geometry workers (GeoWorker.js): owns the pool, keeps the workers' material split set and
// facade window layouts in step with the main thread, and turns a worker's answer into a streaming job whose generate phase is
// already done (World.stepJob then only merges it into meshes, in slices, exactly as before).
import { WorkerPool, workerBudget, canWork } from '../core/WorkerPool.js';
import { SPLIT } from '../gfx/Materials.js';
import { FACADE_WINDOWS } from '../gfx/Textures.js';
import { ArrayMulti } from '../gfx/MeshBuilder.js';
import { leafMeshOn } from './LeafMesh.js';
import { putAnchors, addStats, balconyMats, dropAnchors } from './BalconyLife.js';

let POOL = null, sentSplit = 0, off = false;
const facadesReady = () => { for (const k in FACADE_WINDOWS) return true; return false; };
// the geometry pool, created on first use once the facade textures exist (null: main-thread streaming, as before)
export function geoPool() {
  if (POOL && !POOL.dead && POOL.size) return POOL; if (off || !canWork() || !facadesReady() || workerBudget() <= 0) return null;
  if (POOL && !POOL.dead && !POOL.size) { POOL.resize(); return POOL.size ? POOL : null; }
  sentSplit = SPLIT.size;
  POOL = new WorkerPool('geometry', () => new Worker(new URL('./GeoWorker.js', import.meta.url), { type: 'module' }), {
    size: () => workerBudget(), // the game's thread budget, minus what loading-time pools (BankTex) still hold
    init: () => ({ facadeWindows: FACADE_WINDOWS, split: [...SPLIT], leafMesh: leafMeshOn() }) });
  if (!POOL.size) { POOL.dispose(); POOL = null; } return POOL;
}
export function geoPoolStats() { return POOL && !POOL.dead ? POOL.stats() : null; }
export function disableGeoWorkers(v = true) { off = v; if (v && POOL) { POOL.dispose(); POOL = null; } }
// a material split after the workers started (Texture Studio): tell them before their next job
function syncSplit() { if (SPLIT.size === sentSplit) return; const keys = [...SPLIT].slice(sentSplit); sentSplit = SPLIT.size; POOL.broadcast('split', keys); }
export const splitVersion = () => SPLIT.size;
// generate a chunk's detail / window joinery in a worker. prio(): lower runs first (distance to the player now)
// The building records go by structured clone (a dense chunk: ~100 KB) without what the job never reads: detail starts every
// building's balcony slots afresh (BuildingGen.buildDetail: b._balcs = [] first); the window tier reads the balcony slots only
// (roof footprints / sign spans are detail's: the base build adds roof footprints too, so detail jobs keep them)
const SKIP = { detail: new Set(['_balcs']), win: new Set(['_roofObs', '_signSpans']) };
function lean(bs, kind) { const S = SKIP[kind]; return bs.map((b) => { const o = {}; for (const k in b) if (!S.has(k)) o[k] = b[k]; return o; }); }
export function submitGeo(kind, bs, prio) { const P = geoPool(); if (!P) return Promise.reject(new Error('no geometry workers')); syncSplit();
  return P.run(kind, { bs: lean(bs, kind) }, { prio }); }
export function cancelGeo() { if (POOL) POOL.cancel(() => true); }
// a worker's answer → a World streaming job at its merge phase. Detail: the records buildDetail writes onto each building are
// copied onto the main thread's records now (the window tier reads its balcony slots); windows: balcony / curtain anchors and
// the dressing counters are filed when the chunk's joinery is attached (apply), as the main-thread build would have done.
export function jobFromWorker(c, kind, bs, res) {
  balconyMats(); // the cloth / prop materials the merge draws with (made once, main thread)
  const J = { c, kind, i: bs.length, B: res.B.map((l) => new ArrayMulti(l)), q: null, meshes: [], marks: res.marks, tasks: null, worker: true, pre: res.pre || null };
  if (kind === 'detail') res.recs.forEach((r, i) => { if (bs[i]) Object.assign(bs[i], r); });
  else J.apply = () => { dropAnchors(bs); putAnchors(res.anchors); addStats(res.stats); };
  return J;
}
