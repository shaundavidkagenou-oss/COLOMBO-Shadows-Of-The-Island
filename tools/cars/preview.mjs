// node tools/cars/preview.mjs <src.glb> <out-prefix> [--mat] [--filter=regex]
// Prints per-material triangle counts and bounds, writes <out>-views.png (side / front / top, raw source axes, 0.5 m grid;
// red lines = 0). --mat: false colour per material instead of the baked base colour.
import { loadDoc, flatten, bounds, render, stackPNG, trisOf, keyColour } from './lib.mjs';
const [src, out = '/tmp/prev'] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const byMat = process.argv.includes('--mat'); const fArg = process.argv.find((a) => a.startsWith('--filter=')); const filt = fArg ? new RegExp(fArg.slice(9), 'i') : null;
const axArg = process.argv.find((a) => a.startsWith('--axes=')); // e.g. --axes=x,y,z : which source axes are (right-of-side-view, up, depth)
const doc = await loadDoc(src); let parts = await flatten(doc);
{ const B0 = bounds(parts); const big = Math.max(...B0.size); const sc = big > 100 ? 0.001 : big > 20 ? 0.01 : 1; if (sc !== 1) { console.log('scale', sc); for (const p of parts) for (let i = 0; i < p.pos.length; i++) p.pos[i] *= sc; } }
if (filt) parts = parts.filter((p) => filt.test(p.mat + ' ' + p.path.join('/')));
const B = bounds(parts); console.log('bounds lo', B.lo.map((v) => v.toFixed(3)).join(' '), 'hi', B.hi.map((v) => v.toFixed(3)).join(' '), 'size', B.size.map((v) => v.toFixed(3)).join(' '));
const stats = new Map(); for (const p of parts) { const k = p.mat; const s = stats.get(k) || { tris: 0, parts: 0, col: [0, 0, 0], n: 0, lo: [1e9, 1e9, 1e9], hi: [-1e9, -1e9, -1e9], tex: false, alpha: p.alphaMode, metal: p.metal, rough: p.rough, em: p.emissive };
  s.tris += p.idx.length / 3; s.parts++; s.tex ||= !!p.tex; for (let t = 0; t < p.idx.length / 3; t++) { for (let k2 = 0; k2 < 3; k2++) s.col[k2] += p.triCol[t * 4 + k2]; s.n++; }
  const b = bounds([p]); for (let k2 = 0; k2 < 3; k2++) { s.lo[k2] = Math.min(s.lo[k2], b.lo[k2]); s.hi[k2] = Math.max(s.hi[k2], b.hi[k2]); } stats.set(k, s); }
for (const [k, s] of [...stats].sort((a, b) => b[1].tris - a[1].tris)) console.log(String(s.tris).padStart(7), k.padEnd(34).slice(0, 34), 'parts', String(s.parts).padStart(3), s.tex ? 'TEX' : '   ', s.alpha.padEnd(6), 'm', s.metal.toFixed(2), 'r', s.rough.toFixed(2), 'em', s.em.map((v) => v.toFixed(1)).join(','), 'col', s.col.map((v) => (v / s.n).toFixed(2)).join(','), 'lo', s.lo.map((v) => v.toFixed(2)).join(','), 'hi', s.hi.map((v) => v.toFixed(2)).join(','));
const tris = trisOf(parts, byMat ? (p) => keyColour(p.mat) : null);
const ax = axArg ? axArg.slice(7).split(',') : ['z', 'y', 'x']; const A = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] }; const neg = (a) => a.map((v) => -v);
const R = A[ax[0]], U = A[ax[1]], D = A[ax[2]];
const views = [{ right: R, up: U, look: D }, { right: D, up: U, look: neg(R) }, { right: R, up: neg(D), look: neg(U) }];
const px = Number((process.argv.find((a) => a.startsWith('--px=')) || '--px=110').slice(5));
await stackPNG(out + '-views.png', views.map((v) => render(tris, v, { px, lo: B.lo, hi: B.hi })));
console.log('wrote', out + '-views.png');
