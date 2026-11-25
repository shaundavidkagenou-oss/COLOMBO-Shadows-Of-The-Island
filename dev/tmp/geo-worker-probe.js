// probe worker: build chunk geometry from cloned building data, return per-key hashes
let BG, MB, MATS;
async function init(origin, split) { BG = await import(origin + '/src/world/BuildingGen.js'); MB = await import(origin + '/src/gfx/MeshBuilder.js'); MATS = await import(origin + '/src/gfx/Materials.js'); for (const k of split) MATS.markSplit(k); }
function hashArr(a) { let h = 2166136261 >>> 0; const u = new Uint32Array(a.buffer, a.byteOffset, a.length); for (let i = 0; i < u.length; i++) { h ^= u[i]; h = Math.imul(h, 16777619) >>> 0; } return h + ':' + a.length; }
self.onmessage = async (e) => { const d = e.data; try {
  if (d.init) { await init(d.origin, d.split || []); self.postMessage({ ok: true }); return; }
  const t0 = performance.now(); const mb = new MB.MultiBuilder(null, {}); const mb2 = new MB.MultiBuilder(null, {});
  if (d.kind === 'detail') for (const b of d.bs) BG.buildDetail(b, mb); else for (const b of d.bs) { const ts = BG.windowTasks(b, mb, mb2); for (const t of ts) t(); }
  const ms = performance.now() - t0; const out = {}; for (const [M, tag] of [[mb, 'a'], [mb2, 'b']]) for (const [k, b] of M.b) out[tag + ':' + k] = [hashArr(new Float32Array(b.pos)), hashArr(new Float32Array(b.nor)), hashArr(new Float32Array(b.uv)), hashArr(new Float32Array(b.col)), hashArr(new Uint32Array(b.idx))].join('|');
  self.postMessage({ out, ms, balcs: d.bs.map((b) => (b._balcs ? b._balcs.length : -1)) });
} catch (err) { self.postMessage({ error: String(err && (err.stack || err.message) || err) }); } };
