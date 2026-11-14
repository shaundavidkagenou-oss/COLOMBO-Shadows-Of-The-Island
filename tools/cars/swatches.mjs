// node tools/cars/swatches.mjs <src.glb> [scale] : triangles grouped by (material, baked colour) with counts + bounds (palette audits)
import { loadDoc, flatten, linToSrgb } from './lib.mjs';
const [src, scArg] = process.argv.slice(2); const sc = Number(scArg || 1); const parts = await flatten(await loadDoc(src)); const G = new Map();
for (const p of parts) for (let t = 0; t < p.idx.length / 3; t++) { const hex = [0, 1, 2].map((k) => Math.round(linToSrgb(Math.min(1, p.triCol[t * 4 + k])) * 255).toString(16).padStart(2, '0')).join('') + (p.triCol[t * 4 + 3] < 0.99 ? ' a' + p.triCol[t * 4 + 3].toFixed(2) : '');
  const k = p.mat + ' #' + hex; let g = G.get(k); if (!g) G.set(k, (g = { n: 0, lo: [1e9, 1e9, 1e9], hi: [-1e9, -1e9, -1e9] })); g.n++;
  for (const j of [0, 1, 2]) { const v = p.idx[t * 3 + j]; for (let a = 0; a < 3; a++) { const x = p.pos[v * 3 + a] * sc; if (x < g.lo[a]) g.lo[a] = x; if (x > g.hi[a]) g.hi[a] = x; } } }
for (const [k, g] of [...G].sort((a, b) => a[0].localeCompare(b[0]) || b[1].n - a[1].n)) if (g.n >= (Number(process.env.MIN) || 1)) console.log(String(g.n).padStart(7), k.padEnd(36), 'lo', g.lo.map((v) => v.toFixed(2)).join(','), 'hi', g.hi.map((v) => v.toFixed(2)).join(','));
