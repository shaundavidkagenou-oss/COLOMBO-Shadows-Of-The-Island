// MakeHuman base-mesh helpers for the offline hero-head bake (reads the CC0 data cached by fetch-makehuman.mjs).
import fs from 'node:fs';
import path from 'node:path';
export const CACHE = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../dev/mh-cache');
// base.obj → positions (Float64, decimetres, y up, facing +z), uvs, faces [{v:[...], t:[...], g:groupName}]
export function loadBase() {
  const txt = fs.readFileSync(path.join(CACHE, '3dobjs/base.obj'), 'utf8'); const P = [], T = [], F = []; let g = '';
  for (const line of txt.split('\n')) { const s = line.trim().split(/\s+/);
    if (s[0] === 'v') P.push(+s[1], +s[2], +s[3]); else if (s[0] === 'vt') T.push(+s[1], +s[2]); else if (s[0] === 'g') g = s[1];
    else if (s[0] === 'f') { const v = [], t = []; for (const c of s.slice(1)) { const [a, b] = c.split('/'); v.push(+a - 1); t.push(b ? +b - 1 : -1); } F.push({ v, t, g }); } }
  return { P: Float64Array.from(P), T: Float32Array.from(T), F };
}
// .target → sparse deltas [[index, dx, dy, dz]...]
export function loadTarget(rel) { const p = path.join(CACHE, 'targets', rel.endsWith('.target') ? rel : rel + '.target'); if (!fs.existsSync(p)) throw new Error('missing target ' + rel);
  return fs.readFileSync(p, 'utf8').split('\n').filter((l) => l.trim() && !l.startsWith('#')).map((l) => l.trim().split(/\s+/).map(Number)); }
export function applyTarget(P, tgt, w) { if (!w) return; for (const [i, x, y, z] of tgt) { P[i * 3] += x * w; P[i * 3 + 1] += y * w; P[i * 3 + 2] += z * w; } }
export const groupVerts = (F, test) => { const s = new Set(); for (const f of F) if (test(f.g)) for (const v of f.v) s.add(v); return s; };
