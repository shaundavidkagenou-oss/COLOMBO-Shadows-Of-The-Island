// 93rd — geometry worker: a city chunk's streamed detail (parapets, cornices, balconies, signs, roof clutter…) and window joinery
// (frames, surrounds, shutters, grilles, glass, curtains, balcony life) generated off the main thread. The SAME generator code
// (BuildingGen.js) runs on a structured clone of the chunk's building records with the same per-building seeds, so the result
// is bit-identical to the main-thread build (tools/cpu-workers-test.mjs compares every buffer); the worker returns one exactly
// sized set of typed arrays per material key (transferred) plus the per-building range marks and the records the generator
// writes back onto a building (its balcony slots, roof footprints, sign spans; the window tier's balcony / curtain anchors).
// No scene graph, no materials, no WebGL here: the main thread merges the buffers into meshes over several frames (World.stepJob).
// BuildingGen first: importing it before CityPlan / Layout avoids their module-initialisation cycle (FLOOR_H) in a worker.
import { buildDetail, windowTasks } from './BuildingGen.js';
import { MultiBuilder, setPoolCap } from '../gfx/MeshBuilder.js';
import { markSplit } from '../gfx/Materials.js';
import { FACADE_WINDOWS } from '../gfx/Textures.js';
import { geoWorkerMode, takeAnchors, statsSnap } from './BalconyLife.js';
import { workerMain } from '../core/WorkerPool.js';
import { rangesFor, rangePre } from '../gfx/CellBatch.js';
import { setLeafMesh } from './LeafMesh.js';

setPoolCap(64 * 1048576); geoWorkerMode(); // each worker reuses up to 64 MB of builder buffers between chunks (no GC storms)
const split = (keys) => { for (const k of keys || []) markSplit(k); };
// building fields the generator writes (BuildingGen: buildDetail) — copied back onto the main thread's records
const OUT_KEYS = ['_balcs', '_roofObs', '_signSpans', 'signIdx'];
function pack(B) { const out = [], transfer = [];
  for (const mb of B) { const list = [];
    for (const [k, b] of mb.b) { const e = { k, plain: mb.plain.get(k), pos: b.pos.view().slice(), nor: b.nor.view().slice(), uv: b.uv.view().slice(), col: b.col.view().slice(), idx: b.idx.view().slice() };
      transfer.push(e.pos.buffer, e.nor.buffer, e.uv.buffer, e.col.buffer, e.idx.buffer); list.push(e); }
    mb.releaseAll(); out.push(list); }
  return { out, transfer }; }
const mark = (mb, marks) => marks.push(new Map([...mb.b].map(([n, b]) => [n, [b.pos.length / 3, b.idx.length]]))); // = World.markJob
// per-building batch data (CellBatch.rangePre) of every material of builder 0 big enough to become a RangeBatch on the main thread
// (World.stepJob / batchPlan: ≥ 18000 indices, ≥ 3 buildings; the main thread still decides, and ignores what it does not use)
function pres(mb, marks, detail, transfer) { const end = [...marks]; mark(mb, end); const out = {};
  for (const [k, b] of mb.b) { if (b.idx.length < 18000) continue; const ranges = rangesFor(end, k); if (ranges.length < 3) continue;
    const P = rangePre(b.pos.view(), b.idx.view(), ranges, detail); out[k] = P; transfer.push(P.idx.buffer, P.coarse.buffer, P.vbox.buffer, P.gb.buffer, P.gs.buffer); }
  return out; }
workerMain({
  init(d) { Object.assign(FACADE_WINDOWS, d.facadeWindows || {}); split(d.split); setLeafMesh(d.leafMesh); }, // 95th: same foliage build as the main thread (hedges / sprigs)
  split(d) { split(d); },
  detail({ bs }) { const mb = new MultiBuilder(null, { pooled: true }), marks = [];
    for (const b of bs) { mark(mb, marks); buildDetail(b, mb); }
    const extra = [], pre = pres(mb, marks, true, extra); const { out, transfer } = pack([mb]); transfer.push(...extra); const recs = bs.map((b) => { const r = {}; for (const k of OUT_KEYS) if (b[k] !== undefined) r[k] = b[k]; return r; });
    return { res: { B: out, marks, recs, pre }, transfer }; },
  win({ bs }) { const B = [new MultiBuilder(null, { pooled: true }), new MultiBuilder(null, { pooled: true })], marks = []; const s0 = statsSnap();
    for (const b of bs) { mark(B[0], marks); const ts = windowTasks(b, B[0], B[1]); for (const t of ts) if (t) t(); }
    const s1 = statsSnap(), stats = {}; for (const k in s1) stats[k] = s1[k] - s0[k];
    const anchors = takeAnchors(bs.map((b) => b.id)); const extra = [], pre = pres(B[0], marks, false, extra); const { out, transfer } = pack(B); transfer.push(...extra);
    return { res: { B: out, marks, anchors, stats, pre }, transfer }; },
});
