// Club dancers' clothes, hair and secondary motion (DancerBody.js builds the body itself).
//
// Garments are FITTED to each dancer's own body rather than being separate shapes stuck on top: every piece is cut out of
// her actual skin surface along an exact contour (the zero line of a garment field is traced through the skin triangles,
// so the edge is a clean curve, not a vertex staircase), lifted off the skin by the fabric thickness and closed with a rim
// strip down to the skin at its edges. Each piece inherits the skin's own bone weights (interpolated along the cut edge) and
// is skinned with the same dual-quaternion skinning, so it moves exactly with the body — including the breast bones, which
// is what lets the bikini cups move with the breast springs. Skin the garment fully covers is removed from the body's index,
// so it can never show through.
//
//   bikini      triangle cups around each breast (cup size follows her own bust), an under-band and halter straps traced
//               over the shoulders to a knot at the nape; low-rise briefs with high-cut legs; Opal's top is sequinned
//   skirts      cloth simulation (Verlet): a ring of cloth hanging from the hips with stretch / bend constraints and
//               collisions with her hips, thighs, shins and the pole. Ruby: flared chiffon mini; Saffron: pleated mini;
//               Opal: wrap sarong with a slit over the left leg; Jade: a beaded fringe belt (independent strand chains)
//   shoes       platform stilettos: a platform cut from her own sole (level under the ball and toes when the foot is on the
//               heel), a stiletto at the angle that is vertical when worn, a heel counter, toe strap and ankle strap
//   hair        a scalp layer cut along a hairline, lifted by the style's volume, with soft alpha-tested strand layers, plus a
//               hanging hair mass shaped by what it rests on (it falls straight below the widest point of the head, then over
//               the shoulders and back); Jade's ponytail is a simulated strand chain
//   breasts     per-breast damped spring driven by the chest's specific force (acceleration minus gravity, relative to
//               standing upright) and its angular velocity: frequency and travel follow the bust size, soft-limited
//   fingers     relaxed curl, closing round the pole when the pole dance takes hold of it
import * as THREE from 'three';
import { dancerBody, dancerShared, DANCER_BONES } from './DancerBody.js';
import { patchHeroMaterial, poseVec, HAND_POSES } from './HeroRig.js';
import { hairMaterial, iblScale } from './HeroHead.js';
// fill the empty bins of a polar radius table (rows of NA angles): circular linear interpolation between the nearest filled
// bins of the same row; rows with almost nothing copy the nearest usable row
function fillTable(R, NA, NY) {
  const good = []; for (let iy = 0; iy < NY; iy++) { const row = R.subarray(iy * NA, iy * NA + NA); const f = []; for (let i = 0; i < NA; i++) if (row[i] > 0) f.push(i); good.push(f.length >= 6);
    if (f.length < 6) continue; for (let k = 0; k < f.length; k++) { const a = f[k], b = f[(k + 1) % f.length]; const span = (b - a + NA) % NA || NA; for (let j = 1; j < span; j++) row[(a + j) % NA] = lerp(row[a], row[b], j / span); } }
  for (let iy = 0; iy < NY; iy++) if (!good[iy]) { let best = -1; for (let d = 1; d < NY && best < 0; d++) { if (iy - d >= 0 && good[iy - d]) best = iy - d; else if (iy + d < NY && good[iy + d]) best = iy + d; } if (best >= 0) R.copyWithin(iy * NA, best * NA, best * NA + NA); }
}

const BI = Object.fromEntries(DANCER_BONES.map((n, i) => [n, i]));
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t; const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; const scl = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; const crs = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const nrm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const tangentize = (v, n) => nrm(sub(v, scl(n, dot(v, n))));
const hash = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };
const lin = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
const tab = (T, x) => { if (x <= T[0][0]) return T[0][1]; for (let i = 1; i < T.length; i++) if (x <= T[i][0]) { const a = T[i - 1], b = T[i]; return lerp(a[1], b[1], (x - a[0]) / (b[0] - a[0])); } return T[T.length - 1][1]; };
const ARM = new Set(['armL', 'foreL', 'handL', 'armR', 'foreR', 'handR'].map((n) => BI[n])); for (const n of DANCER_BONES) if (/^(idx|mid|rng|pnk|thb)\d/.test(n)) ARM.add(BI[n]);

// ---------------------------------------------------------------- body context
const ctxCache = new Map();
export function bodyCtx(id) {
  if (ctxCache.has(id)) return ctxCache.get(id);
  const B = dancerBody(id), S = dancerShared(); const NU = B.P.length / 3;
  const tri = new Uint16Array(S.idx[0].length); for (let k = 0; k < tri.length; k++) tri[k] = S.orig[S.idx[0][k]];
  const wmap = (u) => { const m = new Map(); for (let k = 0; k < 4; k++) { const w = S.skw[u * 4 + k] / 255; if (w > 0) m.set(S.ski[u * 4 + k], (m.get(S.ski[u * 4 + k]) || 0) + w); } return m; };
  const wb = (u, ...names) => { let w = 0; for (let k = 0; k < 4; k++) { const b = S.ski[u * 4 + k]; for (const n of names) if (BI[n] === b) w += S.skw[u * 4 + k] / 255; } return w; };
  const warm = (u) => { let w = 0; for (let k = 0; k < 4; k++) if (ARM.has(S.ski[u * 4 + k])) w += S.skw[u * 4 + k] / 255; return w; };
  const C = { id, B, S, P: B.P, N: B.N, NU, tri, wmap, wb, warm, J: B.J, L: B.L, mask: S.masks };
  ctxCache.set(id, C); return C;
}
const top4 = (m) => { const e = [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4); let s = 0; for (const x of e) s += x[1]; const i = [0, 0, 0, 0], w = [0, 0, 0, 0]; e.forEach((x, k) => { i[k] = x[0]; w[k] = x[1] / (s || 1); }); if (!e.length) w[0] = 1; return { i, w }; };
const blendW = (a, b, t) => { const m = new Map(); for (const [k, v] of a) m.set(k, v * (1 - t)); for (const [k, v] of b) m.set(k, (m.get(k) || 0) + v * t); return m; };
const boneW = (pairs) => new Map(pairs.filter((p) => p[1] > 0).map(([n, w]) => [BI[n], w]));

// skinned geometry accumulator (vertex colour + hair attributes)
class Acc {
  constructor(ng) { this.p = []; this.n = []; this.c = []; this.si = []; this.sw = []; this.flow = []; this.root = []; this.layer = []; this.groups = Array.from({ length: ng }, () => []); }
  get count() { return this.p.length / 3; }
  v(p, n, w, col, o = {}) { this.p.push(p[0], p[1], p[2]); this.n.push(n[0], n[1], n[2]); this.c.push(col[0], col[1], col[2]); this.si.push(...w.i); this.sw.push(...w.w);
    const f = o.flow || [0, -1, 0]; this.flow.push(f[0], f[1], f[2]); const r = o.root || p; this.root.push(r[0], r[1], r[2]); this.layer.push(o.layer || 0); return this.count - 1; }
  tri(g, a, b, c) { this.groups[g].push(a, b, c); }
  geometry(hair = false) {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3)); g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.si, 4)); g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.sw, 4));
    g.setAttribute('aSkin', new THREE.Float32BufferAttribute(new Float32Array(this.count), 1));
    if (hair) { g.setAttribute('aFlow', new THREE.Float32BufferAttribute(this.flow, 3)); g.setAttribute('aRoot', new THREE.Float32BufferAttribute(this.root, 3)); g.setAttribute('aLayer', new THREE.Float32BufferAttribute(this.layer, 1)); }
    const idx = []; let s = 0; this.groups.forEach((t, m) => { for (const i of t) idx.push(i); g.addGroup(s, t.length, m); s += t.length; });
    g.setIndex(this.count > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.9, 0), 1.3); return g;
  }
}

// ---------------------------------------------------------------- exact-contour shell
// f: per-vertex field (m), > 0 inside. o: { acc, g, col(p) | rgb, off(rec) → offset vector | th (m) | th(rec), rimIn,
// hide: Set of skin-triangle ordinals to drop, hideMargin, attrs(rec, outP) → hair attributes, rim: bool }
export function shell(C, f, o) {
  const { P, N, tri } = C; const A = o.acc; const ids = new Map(); const rec = [];
  const V = (u) => { let i = ids.get(u); if (i === undefined) { i = rec.length; ids.set(u, i); rec.push({ p: [P[u * 3], P[u * 3 + 1], P[u * 3 + 2]], n: [N[u * 3], N[u * 3 + 1], N[u * 3 + 2]], w: C.wmap(u), f: f[u], u }); } return i; };
  const E = (a, b) => { const key = -(Math.min(a, b) * 65536 + Math.max(a, b)) - 1; let i = ids.get(key); if (i !== undefined) return i;
    const t = f[a] / (f[a] - f[b]); const pa = [P[a * 3], P[a * 3 + 1], P[a * 3 + 2]], pb = [P[b * 3], P[b * 3 + 1], P[b * 3 + 2]];
    const na = [N[a * 3], N[a * 3 + 1], N[a * 3 + 2]], nb = [N[b * 3], N[b * 3 + 1], N[b * 3 + 2]];
    i = rec.length; ids.set(key, i); rec.push({ p: lerp3(pa, pb, t), n: nrm(lerp3(na, nb, t)), w: blendW(C.wmap(a), C.wmap(b), t), f: 0, u: t < 0.5 ? a : b }); return i; };
  const faces = [], bnd = [];
  for (let k = 0; k < tri.length; k += 3) { const t3 = [tri[k], tri[k + 1], tri[k + 2]]; const fi = [f[t3[0]], f[t3[1]], f[t3[2]]]; const inn = fi.map((v) => v > 0); const ni = inn[0] + inn[1] + inn[2]; if (!ni) continue;
    if (o.hide && Math.min(fi[0], fi[1], fi[2]) > (o.hideMargin ?? 0.006)) o.hide.add(k / 3);
    if (ni === 3) { faces.push([V(t3[0]), V(t3[1]), V(t3[2])]); continue; }
    const poly = [], on = [];
    for (let e = 0; e < 3; e++) { const a = t3[e], b = t3[(e + 1) % 3]; if (inn[e]) { poly.push(V(a)); on.push(false); } if (inn[e] !== inn[(e + 1) % 3]) { poly.push(E(a, b)); on.push(true); } }
    for (let q = 1; q + 1 < poly.length; q++) faces.push([poly[0], poly[q], poly[q + 1]]);
    for (let q = 0; q < poly.length; q++) { const r = (q + 1) % poly.length; if (on[q] && on[r]) bnd.push([poly[q], poly[r]]); } }
  const off = o.off || ((r) => scl(r.n, typeof o.th === 'function' ? o.th(r) : o.th));
  const colOf = typeof o.col === 'function' ? o.col : () => o.col;
  const outP = rec.map((r) => add(r.p, off(r))); const base = A.count;
  rec.forEach((r, i) => A.v(outP[i], r.n, top4(r.w), colOf(r.p, r), o.attrs ? o.attrs(r, outP[i]) : undefined));
  for (const [a, b, c] of faces) A.tri(o.g, base + a, base + b, base + c);
  if (o.rim !== false) { const ri = o.rimIn ?? 0.0004;
    for (const [a, b] of bnd) { const ra = rec[a], rb = rec[b]; const on = nrm(add(scl(nrm(crs(sub(rb.p, ra.p), nrm(add(ra.n, rb.n)))), 1), scl(nrm(add(ra.n, rb.n)), 0.25)));
      const at = o.attrs ? o.attrs(ra, outP[a]) : undefined, bt = o.attrs ? o.attrs(rb, outP[b]) : undefined;
      const ia = A.v(add(ra.p, scl(ra.n, ri)), on, top4(ra.w), colOf(ra.p, ra), at), ib = A.v(add(rb.p, scl(rb.n, ri)), on, top4(rb.w), colOf(rb.p, rb), bt);
      const oa = A.v(outP[a], on, top4(ra.w), colOf(ra.p, ra), at), ob = A.v(outP[b], on, top4(rb.w), colOf(rb.p, rb), bt);
      A.tri(o.g, ia, ib, ob); A.tri(o.g, ia, ob, oa); } }
  return { rec, bnd, faces, outP, base };
}
// signed distance (m) to a 3-D polyline lying on the body (> 0 within half-width hw)
const segDist = (p, a, b) => { const ab = sub(b, a); const t = clamp(dot(sub(p, a), ab) / (dot(ab, ab) || 1), 0, 1); return Math.hypot(...sub(p, add(a, scl(ab, t)))); };
function onSurface(C, q, filt) { let best = -1, bd = 1e9; const P = C.P; for (let u = 0; u < C.NU; u++) { if (filt && !filt(u)) continue; const d = (P[u * 3] - q[0]) ** 2 + (P[u * 3 + 1] - q[1]) ** 2 + (P[u * 3 + 2] - q[2]) ** 2; if (d < bd) { bd = d; best = u; } } return [P[best * 3], P[best * 3 + 1], P[best * 3 + 2]]; }
function surfacePath(C, guide, per, filt) { const out = []; for (let i = 0; i + 1 < guide.length; i++) for (let k = 0; k < per; k++) out.push(onSurface(C, lerp3(guide[i], guide[i + 1], k / per), filt)); out.push(onSurface(C, guide[guide.length - 1], filt));
  // smooth (vertex snapping is ~3 mm jagged) and re-snap
  for (let it = 0; it < 3; it++) for (let i = 1; i + 1 < out.length; i++) out[i] = lerp3(out[i], lerp3(out[i - 1], out[i + 1], 0.5), 0.6);
  return out; }
const polyDist = (p, path) => { let d = 1e9; for (let i = 0; i + 1 < path.length; i++) d = Math.min(d, segDist(p, path[i], path[i + 1])); return d; };

// ---------------------------------------------------------------- wardrobe per dancer
// cup: triangle in the front view around the bust tip — h (apex above the tip), wi / wo (half-width of the base inward /
// outward), base (y of the base line relative to the under-bust line); briefs: front / back rise above the hip joint, leg
// cut height at the side; skirt / fringe parameters
export const WEAR = {
  ruby: { cup: { h: 0.085, wi: 0.075, wo: 0.085, base: 0.004 }, rise: [0.03, 0.045], cutSide: 0.07, cupPad: 0.0032, skirt: { kind: 'flare', len: 0.27, flare: 1.85, cols: 60, rows: 11, top: 0.035 }, fabric: 'satin', fin: 'gold' },
  jade: { cup: { h: 0.07, wi: 0.062, wo: 0.07, base: 0.006 }, rise: [0.025, 0.04], cutSide: 0.075, cupPad: 0.0026, fringe: { n: 84, nodes: 7, len: 0.2, top: 0.03 }, fabric: 'lycra', fin: 'gold' },
  opal: { cup: { h: 0.066, wi: 0.06, wo: 0.066, base: 0.006 }, rise: [0.03, 0.045], cutSide: 0.07, cupPad: 0.0026, skirt: { kind: 'sarong', len: 0.5, flare: 1.16, cols: 56, rows: 13, top: 0.03, slit: 0.62, slitTop: 0.13 }, fabric: 'sequin', fin: 'silver' },
  saffron: { cup: { h: 0.1, wi: 0.085, wo: 0.095, base: 0.002 }, rise: [0.035, 0.05], cutSide: 0.065, cupPad: 0.0036, skirt: { kind: 'pleat', len: 0.25, flare: 1.4, cols: 64, rows: 10, top: 0.035 }, fabric: 'satin', fin: 'gold' },
};
const G = { fabric: 0, shoe: 1, metal: 2, sole: 3 };
function buildWear(C, sp, W) {
  const A = new Acc(4); const hide = new Set(); const { P, N, NU, J, L } = C; const f = new Float32Array(NU);
  const top = lin(sp.top), bottom = lin(sp.bottom || sp.top), shoe = lin(sp.shoes || '#101010'), sole = lin(sp.sole || '#0b0b0d');
  const vary = (c, k = 0.06) => (p) => { const n = 1 + (hash(Math.round(p[0] * 300), Math.round(p[1] * 300) + Math.round(p[2] * 300) * 7) - 0.5) * k; return [c[0] * n, c[1] * n, c[2] * n]; };
  // ---- bikini top: two cups ∪ under-band ∪ halter straps
  const ub = L.underBustY; const tips = [L.bustTip[0][0] > 0 ? L.bustTip[0] : L.bustTip[1], L.bustTip[0][0] > 0 ? L.bustTip[1] : L.bustTip[0]];
  const cupF = (u, T, sx) => { const x = P[u * 3], y = P[u * 3 + 1], z = P[u * 3 + 2];
    if (z < T[2] - 0.11 || N[u * 3 + 2] < -0.3 || C.warm(u) > 0.15 || C.wb(u, 'head', 'neck') > 0.3) return -1;
    const cu = W.cup; const A2 = [T[0] - sx * 0.006, T[1] + cu.h], by = ub + cu.base, Bi = [T[0] - sx * cu.wi, by], Bo = [T[0] + sx * cu.wo, by];
    // signed distance to each side (positive towards the opposite corner), sides gently bulged so the cup follows the
    // round of the breast instead of being a flat triangle
    const side = (P0, P1, P2, bul) => { const dx = P1[0] - P0[0], dy = P1[1] - P0[1], l = Math.hypot(dx, dy); const sg = Math.sign(dx * (P2[1] - P0[1]) - dy * (P2[0] - P0[0]));
      const t = clamp(((x - P0[0]) * dx + (y - P0[1]) * dy) / (l * l), 0, 1); return ((dx * (y - P0[1]) - dy * (x - P0[0])) / l) * sg + bul * 4 * t * (1 - t); };
    return Math.min(side(Bi, A2, Bo, 0.009), side(A2, Bo, Bi, 0.012), y - by); };
  const neckJ = J.neck; const strap = [0, 1].map((k) => { const T = tips[k], sx = k === 0 ? 1 : -1; const cu = W.cup;
    const filt = (u) => C.warm(u) < 0.1 && C.wb(u, 'head') < 0.4;
    return surfacePath(C, [[T[0] - sx * 0.006, T[1] + cu.h - 0.004, T[2]], [sx * 0.055, lerp(T[1] + cu.h, neckJ[1], 0.55), T[2] - 0.03], [sx * 0.045, neckJ[1] - 0.005, neckJ[2] + 0.045], [sx * 0.055, neckJ[1] + 0.02, neckJ[2] - 0.005], [sx * 0.025, neckJ[1] + 0.015, neckJ[2] - 0.055], [0, neckJ[1] + 0.012, neckJ[2] - 0.06]], 10, filt); });
  // back tie of the band and the halter knot are slightly raised (a bow)
  for (let u = 0; u < NU; u++) { const x = P[u * 3], y = P[u * 3 + 1], z = P[u * 3 + 2]; const p = [x, y, z];
    let v = Math.max(cupF(u, tips[0], 1), cupF(u, tips[1], -1));
    if (C.warm(u) < 0.2 && C.wb(u, 'head', 'neck') < 0.5) { const yb = ub + W.cup.base - 0.004 + (z < 0 ? 0.012 * sstep(0, -0.08, z) : 0); v = Math.max(v, 0.0055 - Math.abs(y - yb)); }
    if (y > ub && C.warm(u) < 0.15) for (const s of strap) v = Math.max(v, 0.0058 - polyDist(p, s));
    f[u] = v; }
  const cupTh = (r) => { const T = r.p[0] > 0 ? tips[0] : tips[1]; const d = Math.hypot(r.p[0] - T[0], r.p[1] - T[1]); return 0.0014 + W.cupPad * sstep(0.09, 0.0, d) * (r.p[2] > T[2] - 0.08 ? 1 : 0); };
  shell(C, f, { acc: A, g: G.fabric, col: vary(top), th: cupTh, hide, hideMargin: 0.007 });
  // ---- briefs: front / back rise, high-cut leg lines, gusset
  const hy = J.hips[1], tL = J.thighL;
  for (let u = 0; u < NU; u++) { const x = P[u * 3], y = P[u * 3 + 1], z = P[u * 3 + 2]; if (C.warm(u) > 0.1 || y > hy + 0.12 || y < hy - 0.2) { f[u] = -1; continue; }
    const rise = hy + lerp(W.rise[0], W.rise[1], sstep(0.04, -0.06, z)); const fTop = rise - y;
    const ax = Math.abs(x), sideX = Math.abs(tL[0]) + 0.085; const cy = tL[1] - 0.075, sy = hy + W.rise[0] - W.cutSide * 0.35;
    // leg line from the crotch up to the side of the hip (high cut); covers more at the back (seat)
    const dx = sideX, dy = sy - cy, l = Math.hypot(dx, dy); let fLeg = (dx * (y - cy) - dy * ax) / l; // > 0 above / inside the crotch → hip line
    fLeg += 0.55 * Math.max(0, -z - 0.02) * sstep(0.02, 0.1, ax) - 0.25 * Math.max(0, z - 0.03);
    const fG = 0.024 - ax; const v = Math.min(fTop, Math.max(fLeg, y < tL[1] - 0.02 ? fG : -1)); f[u] = v; }
  shell(C, f, { acc: A, g: G.fabric, col: vary(bottom), th: 0.0013, hide, hideMargin: 0.007 });
  // ---- waistband for the skirt / fringe belt (at the skirt's top line)
  const sk = W.skirt || W.fringe; if (sk) { const yt = hy + sk.top;
    for (let u = 0; u < NU; u++) { const y = P[u * 3 + 1]; f[u] = C.warm(u) > 0.1 ? -1 : 0.009 - Math.abs(y - (yt - 0.006)); }
    shell(C, f, { acc: A, g: W.fringe ? G.metal : G.fabric, col: W.fringe ? [1, 1, 1] : vary(bottom, 0.03), th: 0.0028, hide, hideMargin: 0.004 }); }
  // ---- shoes
  for (const S of ['L', 'R']) { const ft = J['foot' + S], tj = J['toe' + S]; const H = L.heel; const sx = S === 'L' ? 1 : -1;
    const isFoot = (u) => C.wb(u, 'foot' + S, 'toe' + S) > 0.5 && P[u * 3] * sx > 0;
    // platform (bottom-facing skin of foot + toes): flattened onto the platform plane — level in the foot frame behind the
    // toes, and in the toes' own (flexed) frame ahead of them, so it lies flat on the floor when the foot is on the heel
    for (let u = 0; u < NU; u++) f[u] = isFoot(u) && P[u * 3 + 1] < 0.06 ? -N[u * 3 + 1] - 0.3 : -1;
    const c = Math.cos(H.pitch), sn = Math.sin(H.pitch); const ballZ = H.ballZ; const soleY = H.sole;
    const platOff = (r) => { const p = r.p; const wt = (() => { let w = 0; for (const [b, x] of r.w) if (b === BI['toe' + S]) w += x; return clamp(w, 0, 1); })();
      const thick = 0.006 + (H.plat - 0.006) * sstep(ballZ - 0.085, ballZ - 0.03, p[2]); const yF = soleY - thick;
      const qf = [p[0], Math.min(p[1], yF), p[2]];
      // toes: undo the flex about the toe joint, flatten, redo
      const dy = p[1] - tj[1], dz = p[2] - tj[2]; const fy = dy * c - dz * sn, fz = dy * sn + dz * c; const fy2 = Math.min(fy, soleY - H.plat - tj[1]); const qt = [p[0], tj[1] + fy2 * c + fz * sn, tj[2] - fy2 * sn + fz * c];
      return sub(lerp3(qf, qt, wt), p).map((v, i) => v + r.n[i] * 0.0006); };
    shell(C, f, { acc: A, g: G.sole, col: sole, off: platOff, hide, hideMargin: 0.004, rimIn: 0.0008 });
    // heel counter + toe strap + ankle strap + back strap
    for (let u = 0; u < NU; u++) { if (!(C.wb(u, 'foot' + S, 'toe' + S, 'shin' + S) > 0.5 && P[u * 3] * sx > 0) || P[u * 3 + 1] > ft[1] + 0.05) { f[u] = -1; continue; }
      const y = P[u * 3 + 1], z = P[u * 3 + 2], x = P[u * 3]; const bottom = -N[u * 3 + 1] - 0.3; if (bottom > 0 && y < 0.06) { f[u] = -1; continue; }
      const counter = Math.min(H.heelZ + 0.055 - z, 0.042 - y);
      const toeStrap = 0.011 - Math.abs(z - (ballZ + 0.004));
      const ankle = 0.0055 - Math.abs(y - (ft[1] + 0.022));
      const back = Math.min(0.0055 - Math.abs(x - ft[0]), (ft[2] - 0.02) - z, ft[1] + 0.025 - y);
      f[u] = Math.max(counter, C.wb(u, 'shin' + S) > 0.6 ? -1 : toeStrap, ankle, back); }
    shell(C, f, { acc: A, g: G.shoe, col: shoe, th: 0.0018, hide, hideMargin: 0.005 });
    // stiletto: from under the heel along the direction that is vertical once the foot is pitched
    const ht = H.heelTop, dir = H.dir; const w = top4(boneW([['foot' + S, 1]])); const base = A.count; const R = 10;
    for (let i = 0; i <= 5; i++) { const t = i / 5, Ls = H.heelLen * t; const r = lerp(0.0135, 0.0045, Math.pow(t, 0.75)); const cy = ft[1] + ht[0] + dir[0] * Ls, cz = ft[2] + ht[1] + dir[1] * Ls;
      for (let k = 0; k < R; k++) { const a = (k / R) * Math.PI * 2; const ox = Math.cos(a) * r, oz = Math.sin(a) * r * 1.15; const n = nrm([Math.cos(a), 0, Math.sin(a)]);
        A.v([ft[0] + ox, cy - oz * dir[1] * 0.0, cz + oz], n, w, i === 5 ? sole : shoe); } }
    for (let i = 0; i < 5; i++) for (let k = 0; k < R; k++) { const a = base + i * R + k, b = base + i * R + ((k + 1) % R), c2 = a + R, d = b + R; A.tri(G.shoe, a, c2, d); A.tri(G.shoe, a, d, b); }
    const tip = A.v([ft[0], ft[1] + ht[0] + dir[0] * (H.heelLen + 0.001), ft[2] + ht[1] + dir[1] * (H.heelLen + 0.001)], [0, -1, 0], w, sole); for (let k = 0; k < R; k++) A.tri(G.sole, base + 5 * R + k, tip, base + 5 * R + ((k + 1) % R)); }
  return { A, hide };
}

// ---------------------------------------------------------------- hair
const HAIRLINE = [[0, 0.056], [0.3, 0.055], [0.52, 0.053], [0.78, 0.049], [1.02, 0.044], [1.22, 0.026], [1.34, -0.004], [1.5, -0.008], [1.6, 0.012], [1.9, 0.018], [2.25, 0.0], [2.6, -0.045], [3.2, -0.075]];
const HAIR = {
  // cap volume (m) on top / at the sides, mass: end height (relative to landmarks), coverage angle, thickness, waves
  long: { top: 0.009, side: 0.011, part: true, mass: { end: (L, J, a) => L.underBustY + 0.005 + 0.05 * Math.pow(Math.abs(a - Math.PI) / 1.9, 2), edge: [1.28, 2.15], th: 0.016, gap: 0.009, wave: 0 } },
  shoulder: { top: 0.01, side: 0.013, part: true, mass: { end: (L, J, a) => J.neck[1] - 0.075 + 0.02 * Math.pow(Math.abs(a - Math.PI) / 2.1, 2), edge: [1.05, 1.35], th: 0.018, gap: 0.01, wave: 0.0045 } },
  bob: { top: 0.012, side: 0.015, part: false, mass: { end: (L) => L.eyeL[1] - 0.088, edge: [0.92, 0.92], th: 0.02, gap: 0.011, wave: 0, tuck: true } },
  ponytail: { top: 0.0035, side: 0.004, part: false, sleek: true, tail: true },
};
export function buildHair(C, sp) {
  const st = HAIR[sp.hair] || HAIR.long; const A = new Acc(2); const { P, NU, J, L } = C; const f = new Float32Array(NU);
  const ey = L.eyeL[1], cz = L.eyeL[2] - 0.085; const col = lin(sp.hairColor || '#120c08');
  const vary = (p) => { const n = 0.96 + 0.05 * Math.sin(p[0] * 61 + p[1] * 23) * Math.sin(p[2] * 47 - p[1] * 31); return [col[0] * n, col[1] * n, col[2] * n]; }; // smooth tone variation (per-vertex noise banded the mass)
  const tie = [0, ey + 0.075, cz - 0.075];
  for (let u = 0; u < NU; u++) { const x = P[u * 3], y = P[u * 3 + 1], z = P[u * 3 + 2]; if (C.wb(u, 'head', 'neck') < 0.6 || y < ey - 0.1) { f[u] = -1; continue; }
    const a = Math.abs(Math.atan2(x, z - cz)); f[u] = (y - ey) - tab(HAIRLINE, a) - (st.tail && C.mask.ears[u] > 170 ? 1 : 0); } // ears: only the pulled-back style leaves them bare; the others cover them
  const thick = (r, extra = 0) => { const p = r.p; const a = Math.abs(Math.atan2(p[0], p[2] - cz)); const hy = p[1] - ey;
    let t = lerp(st.side, st.top, sstep(0.02, 0.07, hy)); if (st.part && hy > 0.05 && p[2] > cz - 0.04) t -= 0.0045 * Math.exp(-((p[0] / 0.005) ** 2)) * sstep(0.05, 0.075, hy);
    return 0.0011 + extra + t * sstep(0.0, st.sleek ? 0.006 : 0.02, r.f) * (a > 2.4 && hy < 0 ? 1 : 1); };
  const flowOf = (r, op) => { const p = r.p; let d; if (st.tail) d = sub(tie, p); else if (st.part) d = [Math.sign(p[0] || 1) * 0.8, -0.6, (p[2] - cz) * 4]; else d = [p[0], -0.5, (p[2] - cz) * 2]; return tangentize(d, r.n); };
  shell(C, f, { acc: A, g: 0, col: vary, th: (r) => thick(r), attrs: (r, op) => ({ flow: flowOf(r, op), root: op, layer: 0 }), rimIn: 0.0003 });
  for (const [lay, ex] of [[0.5, 0.0016], [1, 0.0032]]) shell(C, f, { acc: A, g: 1, col: vary, th: (r) => thick(r, ex), attrs: (r, op) => ({ flow: flowOf(r, op), root: op, layer: lay }), rim: false });
  // hanging mass: radius table of the body round the head's vertical axis; the hair falls straight down from the widest
  // point above (cumulative max going down) and rests on the shoulders and back below the neck
  const M = st.mass; if (M) {
    const NA = 120, y0 = L.underBustY - 0.08, y1 = ey + 0.04, dy = 0.005, NY = Math.ceil((y1 - y0) / dy) + 1; const R = new Float32Array(NA * NY);
    for (let u = 0; u < NU; u++) { if (C.warm(u) > 0.25) continue; const x = P[u * 3], y = P[u * 3 + 1], z = P[u * 3 + 2]; if (y < y0 || y > y1) continue; const a = (Math.atan2(x, z - cz) + Math.PI * 2) % (Math.PI * 2);
      const ia = Math.floor(a / (Math.PI * 2) * NA) % NA, iy = Math.round((y - y0) / dy); const r = Math.hypot(x, z - cz); if (r > R[iy * NA + ia]) R[iy * NA + ia] = r; }
    fillTable(R, NA, NY);
    const Rs = new Float32Array(NA * NY); for (let iy = 0; iy < NY; iy++) for (let ia = 0; ia < NA; ia++) { let s = 0; for (let k = -2; k <= 2; k++) s += R[iy * NA + (ia + k + NA) % NA]; Rs[iy * NA + ia] = s / 5; }
    const Rb = (a, y) => { const fa = (((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2) * NA, ia = Math.floor(fa) % NA, ib = (ia + 1) % NA, ta = fa - Math.floor(fa); const fy = clamp((y - y0) / dy, 0, NY - 1.001), iy = Math.floor(fy), ty = fy - iy;
      const g = (i, j) => Rs[j * NA + i]; return lerp(lerp(g(ia, iy), g(ib, iy), ta), lerp(g(ia, iy + 1), g(ib, iy + 1), ta), ty); };
    const shY = J.armL[1] + 0.03; const edgeA = (y) => lerp(M.edge[1], M.edge[0], sstep(shY - 0.02, J.neck[1] + 0.02, y));
    const NC = 64, NR = 34; const yTop = ey + 0.01; const rows = []; const grid = [];
    for (let c = 0; c <= NC; c++) { const u = c / NC; const col0 = []; let Rh = 0; const jit = 0;
      for (let r = 0; r <= NR; r++) { const v = r / NR; const a0 = edgeA(yTop); const aMid = lerp(a0, Math.PI * 2 - a0, u); const yEnd = M.end(L, J, aMid) + jit * (M.tuck ? 0.2 : 1);
        const y = lerp(yTop, yEnd, v); const ea = edgeA(y); const a = lerp(ea, Math.PI * 2 - ea, u);
        Rh = Math.max(Rh - 0.0005, Rb(a, y) + M.gap); let Ro = Rh + M.wave * Math.sin(y * 70 + u * 9) * sstep(yTop - 0.03, yTop - 0.08, y);
        if (M.tuck) Ro -= 0.009 * sstep(0.8, 1, v); const edge = sstep(0, 0.12, u) * sstep(1, 0.88, u); // thin, soft side edges and ends (no box edge)
        const Rin = Rb(a, y) + 0.002; Ro = Math.max(Rin + 0.004, lerp(Rin + 0.005, Ro, edge)); const Ri = Math.max(Rin, Ro - M.th * edge * (1 - 0.8 * sstep(0.7, 1, v)));
        col0.push({ a, y, Ro, Ri }); }
      grid.push(col0); }
    const wOf = (y) => { const hn = J.neck[1]; const wh = sstep(hn - 0.01, hn + 0.06, y); const wc = 1 - sstep(shY - 0.05, hn - 0.01, y); return top4(boneW([['head', wh], ['neck', Math.max(0, 1 - wh - wc)], ['chest', wc]])); };
    // soft strand layers just outside the mass (alpha-tested), slightly longer at the ends so the cut is wispy, not a hard line
    for (const [lay, ex] of [[0.5, 0.0018], [1, 0.0036]]) { const ids = []; for (let c = 0; c <= NC; c++) for (let r = 0; r <= NR; r++) { const g = grid[c][r]; const R0 = g.Ro + ex; const p = [Math.sin(g.a) * R0, g.y - (r === NR ? 0.012 * lay : 0), cz + Math.cos(g.a) * R0];
        ids.push(A.v(p, nrm([Math.sin(g.a), 0.15, Math.cos(g.a)]), wOf(g.y), vary(p), { flow: [0, -1, 0], root: [Math.sin(g.a) * g.Ro, g.y, cz + Math.cos(g.a) * g.Ro], layer: lay })); }
      for (let c = 0; c < NC; c++) for (let r = 0; r < NR; r++) { const a = ids[c * (NR + 1) + r], b = ids[(c + 1) * (NR + 1) + r]; A.tri(1, a, a + 1, b + 1); A.tri(1, a, b + 1, b); } }
    const vid = []; for (const side of [0, 1]) { const ids = []; for (let c = 0; c <= NC; c++) for (let r = 0; r <= NR; r++) { const g = grid[c][r]; const R0 = side ? g.Ri : g.Ro; const p = [Math.sin(g.a) * R0, g.y, cz + Math.cos(g.a) * R0];
        const n = side ? [-Math.sin(g.a), 0, -Math.cos(g.a)] : [Math.sin(g.a), 0.15, Math.cos(g.a)]; ids.push(A.v(p, nrm(n), wOf(g.y), vary(p), { flow: [0, -1, 0], root: p, layer: 0 })); } vid.push(ids); }
    const id = (s, c, r) => vid[s][c * (NR + 1) + r];
    for (let c = 0; c < NC; c++) for (let r = 0; r < NR; r++) { A.tri(0, id(0, c, r), id(0, c, r + 1), id(0, c + 1, r + 1)); A.tri(0, id(0, c, r), id(0, c + 1, r + 1), id(0, c + 1, r)); A.tri(0, id(1, c, r), id(1, c + 1, r + 1), id(1, c, r + 1)); A.tri(0, id(1, c, r), id(1, c + 1, r), id(1, c + 1, r + 1)); }
    for (let c = 0; c < NC; c++) { A.tri(0, id(0, c, NR), id(1, c, NR), id(1, c + 1, NR)); A.tri(0, id(0, c, NR), id(1, c + 1, NR), id(0, c + 1, NR)); }
    for (let r = 0; r < NR; r++) { A.tri(0, id(0, 0, r), id(1, 0, r), id(1, 0, r + 1)); A.tri(0, id(0, 0, r), id(1, 0, r + 1), id(0, 0, r + 1)); A.tri(0, id(0, NC, r), id(0, NC, r + 1), id(1, NC, r + 1)); A.tri(0, id(0, NC, r), id(1, NC, r + 1), id(1, NC, r)); }
  }
  return { A, tie, cz };
}

// ---------------------------------------------------------------- materials
const FABRIC_GLSL = `
float fbHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }`;
function fabricPatch(kind) {
  return (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vRestF;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvRestF = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vRestF;' + FABRIC_GLSL)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      ${kind === 'sequin' ? `{ vec3 q = vRestF * 420.0; vec3 cell = floor(q); vec3 j = vec3(fbHash(cell), fbHash(cell + 7.1), fbHash(cell + 3.3)) - 0.5;
        float fw = length(fwidth(q)); normal = normalize(normal + j * 0.9 * (1.0 - smoothstep(0.5, 1.2, fw))); }`
      : kind === 'lycra' ? `{ float w = sin(vRestF.y * 5200.0) * 0.5 + sin((vRestF.x + vRestF.z) * 5200.0) * 0.5; float fw = fwidth(vRestF.y * 5200.0); vec3 dpx = dFdx(-vViewPosition), dpy = dFdy(-vViewPosition);
        float h = w * 0.00002 * (1.0 - smoothstep(0.6, 1.6, fw)); vec3 r1 = cross(dpy, normal), r2 = cross(normal, dpx); float det = dot(dpx, r1); normal = normalize(abs(det) * normal - sign(det) * (dFdx(h) * r1 + dFdy(h) * r2)); }` : ''}`);
  };
}
function wearMaterials(W, U) {
  const fin = W.fin === 'silver' ? 0xd8d8de : 0xd9a441;
  const fab = W.fabric === 'sequin' ? new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.32, metalness: 0.55, clearcoat: 0.3 })
    : new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: W.fabric === 'satin' ? 0.36 : 0.5, metalness: 0, sheen: 1, sheenRoughness: 0.35, sheenColor: new THREE.Color(0xffffff).multiplyScalar(0.5) });
  const shoe = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.18, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.08 });
  const metal = new THREE.MeshStandardMaterial({ color: fin, roughness: 0.22, metalness: 1 });
  const sole = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0 });
  const tag = W.fabric; const mats = [fab, shoe, metal, sole];
  mats.forEach((m, i) => { patchHeroMaterial(m, 'body', U, i === 0 ? fabricPatch(tag) : null); const k = m.customProgramCacheKey; m.customProgramCacheKey = () => k() + '|dw' + i + (i === 0 ? tag : ''); });
  return mats;
}

// ---------------------------------------------------------------- cloth (Verlet)
const _m4 = new THREE.Matrix4(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
class Cloth {
  // pts: rest positions in hips-local space (row 0 pinned), cons: [i, j, rest, stiffness, mode (0 both, 1 stretch only)]
  constructor(n, pinned) { this.n = n; this.p = new Float32Array(n * 3); this.o = new Float32Array(n * 3); this.rest = new Float32Array(n * 3); this.pin = pinned; this.cons = []; this.ok = false; }
}
function collide(p, i, caps, pole, hipT) {
  let x = p[i * 3], y = p[i * 3 + 1], z = p[i * 3 + 2];
  for (const c of caps) { const ax = c.b[0] - c.a[0], ay = c.b[1] - c.a[1], az = c.b[2] - c.a[2]; const l2 = ax * ax + ay * ay + az * az || 1; let t = ((x - c.a[0]) * ax + (y - c.a[1]) * ay + (z - c.a[2]) * az) / l2; t = clamp(t, 0, 1);
    const qx = c.a[0] + ax * t, qy = c.a[1] + ay * t, qz = c.a[2] + az * t; let dx = x - qx, dy = y - qy, dz = z - qz; const d = Math.hypot(dx, dy, dz); const r = lerp(c.ra, c.rb, t);
    if (d < r) { if (d < 1e-6) { dx = 0; dy = 0; dz = 1; } const k = r / (d || 1); x = qx + dx * k; y = qy + dy * k; z = qz + dz * k; } }
  if (hipT) { // the hip / seat surface: radius table in hips space
    const e = hipT.inv.elements; const lx = e[0] * x + e[4] * y + e[8] * z + e[12], ly = e[1] * x + e[5] * y + e[9] * z + e[13], lz = e[2] * x + e[6] * y + e[10] * z + e[14];
    if (ly > hipT.y0 && ly < hipT.y1) { const a = Math.atan2(lx, lz - hipT.cz); const r = hipT.R(a, ly) + 0.006; const d = Math.hypot(lx, lz - hipT.cz);
      if (d < r) { const k = r / (d || 1); const nx = lx * k, nz = hipT.cz + (lz - hipT.cz) * k; const m = hipT.m.elements; x = m[0] * nx + m[4] * ly + m[8] * nz + m[12]; y = m[1] * nx + m[5] * ly + m[9] * nz + m[13]; z = m[2] * nx + m[6] * ly + m[10] * nz + m[14]; } } }
  if (pole) { const dx = x - pole.x, dz = z - pole.z, d = Math.hypot(dx, dz); if (y > pole.y0 && y < pole.y1 && d < pole.r) { const k = pole.r / (d || 1); x = pole.x + dx * k; z = pole.z + dz * k; } }
  p[i * 3] = x; p[i * 3 + 1] = y; p[i * 3 + 2] = z;
}

// ---------------------------------------------------------------- the rig
export class DancerRig {
  constructor(ch, id) {
    this.ch = ch; this.id = id; const sp = ch.spec; const C = bodyCtx(id); this.C = C; const W = WEAR[id] || WEAR.ruby; this.W = W; const U = ch.heroU;
    const body = ch.mesh; const skel = body.skeleton;
    // ---- garments
    const { A, hide } = buildWear(C, sp, W); const geo = A.geometry(); this.wearMats = wearMaterials(W, U);
    const wear = new THREE.SkinnedMesh(geo, this.wearMats); wear.name = 'dancerWear'; body.add(wear); wear.bind(skel, body.bindMatrix); wear.castShadow = true; wear.receiveShadow = false; this.wear = wear;
    this.hideSkin(body.geometry, hide); this.hidden = hide.size;
    // ---- hair
    const Hh = buildHair(C, sp); const hg = Hh.A.geometry(true); this.hairMats = [hairMaterial('volume', { freq: 2600 }), hairMaterial('fur', { freq: 2600 })]; for (const m of this.hairMats) iblScale(m, 0.28, 0.9, 0.6);
    const hair = new THREE.SkinnedMesh(hg, this.hairMats); hair.name = 'dancerHair'; body.add(hair); hair.bind(skel, body.bindMatrix); hair.castShadow = true; this.hair = hair;
    // ---- jewellery: hoop earrings (rigid on the head)
    this.extra = [];
    if (sp.earrings) { const metal = this.wearMats[2]; const hb = ch.bones.head, jh = C.J.head; const tg = new THREE.TorusGeometry(0.0105, 0.0011, 6, 28); this.extra.push(tg);
      for (const sx of [1, -1]) { let lo = null; for (let u = 0; u < C.NU; u++) if (C.mask.ears[u] > 150 && C.P[u * 3] * sx > 0 && (!lo || C.P[u * 3 + 1] < lo[1])) lo = [C.P[u * 3], C.P[u * 3 + 1], C.P[u * 3 + 2]];
        if (!lo) continue; const m = new THREE.Mesh(tg, new THREE.MeshStandardMaterial({ color: metal.color, roughness: 0.2, metalness: 1 })); this.extra.push(m.material);
        m.position.set(lo[0] + sx * 0.001 - jh[0], lo[1] - 0.0102 - jh[1], lo[2] - jh[2]); m.rotation.y = Math.PI / 2; hb.add(m); } }
    // ---- cloth: skirt / fringe / ponytail
    const hipsJ = C.J.hips; this.hipT = this.hipTable(C);
    this.caps = []; for (const S of ['L', 'R']) { this.caps.push({ bA: ch.bones['thigh' + S], bB: ch.bones['shin' + S], ...this.limbR(C, 'thigh' + S, C.J['thigh' + S], C.J['shin' + S]) }, { bA: ch.bones['shin' + S], bB: ch.bones['foot' + S], ...this.limbR(C, 'shin' + S, C.J['shin' + S], C.J['foot' + S]) }); }
    for (const c of this.caps) { c.a = [0, 0, 0]; c.b = [0, 0, 0]; }
    this.hull = { a: [0, 0, 0], b: [0, 0, 0], ra: 0, rb: 0 }; // between the thighs: fabric spans across both legs
    if (W.skirt) this.skirt = this.makeSkirt(C, W.skirt, hipsJ, sp);
    if (W.fringe) this.fringe = this.makeFringe(C, W.fringe, hipsJ);
    if (HAIR[sp.hair]?.tail) this.tail = this.makeTail(C, Hh, sp);
    // ---- breasts: spring per side; frequency and travel from the bust's size
    const T = C.L.bustTip; const size = clamp((((T[0][2] - C.J.breastL[2]) - 0.045) / 0.035), 0, 1) * 0.5 + clamp((T[0][2] - 0.12) / 0.07, 0, 1) * 0.5; this.bustSize = size;
    this.br = ['L', 'R'].map((S) => { const b = ch.bones['breast' + S]; return { b, rest: b.position.clone(), o: [0, 0, 0], v: [0, 0, 0], lever: Math.max(0.035, (T[0][2] - C.J.breastL[2])) }; });
    this.bw = 2 * Math.PI * lerp(2.6, 1.8, size); this.bz = 0.2; this.bmax = lerp(0.011, 0.024, size); this.bG = lerp(0.5, 0.75, size);
    this.prev = null; this.acc = new THREE.Vector3(); this.vel = new THREE.Vector3(); this.qPrev = new THREE.Quaternion(); this.wAng = new THREE.Vector3();
    // ---- fingers: rotation axis per joint from the fitted hand (curl moves the finger towards the palm)
    this.fing = {}; for (const S of ['L', 'R']) this.fing[S] = this.fingerAxes(C, S);
    this.grip = { L: 0, R: 0 }; this.t = 0;
  }
  hideSkin(geo, hide) {
    if (geo.userData.hidden || !hide.size) return; const ix = geo.index.array; const nSkin = geo.userData.skinTris; const keep = []; for (let k = 0; k < nSkin; k += 3) if (!hide.has(k / 3)) keep.push(ix[k], ix[k + 1], ix[k + 2]);
    const rest = Array.from(ix.slice(nSkin)); const all = keep.concat(rest); const d = nSkin - keep.length;
    geo.setIndex(new (ix instanceof Uint32Array ? THREE.Uint32BufferAttribute : THREE.Uint16BufferAttribute)(all, 1));
    geo.groups.forEach((g, i) => { if (i === 0) g.count = keep.length; else g.start -= d; }); geo.userData.skinTris = keep.length; geo.userData.hidden = hide.size;
  }
  // radius of a limb round its bone axis (90th percentile per segment), for the cloth collision capsules
  limbR(C, bone, a, b) { const ab = sub(b, a), l2 = dot(ab, ab); const bins = [[], [], []];
    for (let u = 0; u < C.NU; u++) { if (C.wb(u, bone) < 0.6) continue; const p = [C.P[u * 3], C.P[u * 3 + 1], C.P[u * 3 + 2]]; const t = dot(sub(p, a), ab) / l2; if (t < 0 || t > 1) continue; const q = add(a, scl(ab, t)); bins[Math.min(2, Math.floor(t * 3))].push(Math.hypot(...sub(p, q))); }
    const pc = (v) => { if (!v.length) return 0.05; v.sort((x, y) => x - y); return v[Math.floor(v.length * 0.9)]; }; return { ra: pc(bins[0]) + 0.006, rb: pc(bins[2]) + 0.006 }; }
  // hips / seat surface table in hips-bone space (cloth collision above the hip joints)
  hipTable(C) { const J = C.J, hy = J.hips; const y0 = J.thighL[1] - 0.02, y1 = hy[1] + 0.09, NA = 64, NY = 12, dy = (y1 - y0) / (NY - 1); const R = new Float32Array(NA * NY); const cz = -0.01;
    for (let u = 0; u < C.NU; u++) { if (C.warm(u) > 0.2) continue; const x = C.P[u * 3], y = C.P[u * 3 + 1], z = C.P[u * 3 + 2]; if (y < y0 || y > y1) continue; const a = (Math.atan2(x, z - cz) + Math.PI * 2) % (Math.PI * 2);
      const ia = Math.floor(a / (Math.PI * 2) * NA) % NA, iy = Math.round((y - y0) / dy); const r = Math.hypot(x, z - cz); if (r > R[iy * NA + ia]) R[iy * NA + ia] = r; }
    fillTable(R, NA, NY);
    const fn = (a, y) => { const fa = (((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2) * NA; const ia = Math.floor(fa) % NA, ib = (ia + 1) % NA, ta = fa - Math.floor(fa); const fy = clamp((y - y0) / dy, 0, NY - 1.001), iy = Math.floor(fy), ty = fy - iy;
      const g = (i, j) => R[j * NA + i]; return lerp(lerp(g(ia, iy), g(ib, iy), ta), lerp(g(ia, iy + 1), g(ib, iy + 1), ta), ty); };
    // in hips-local coordinates (hips bone origin at the hips joint)
    return { R: (a, ly) => fn(a, ly + hy[1]), y0: y0 - hy[1], y1: y1 - hy[1], cz: cz - hy[2], inv: new THREE.Matrix4(), m: new THREE.Matrix4(), Rw: fn }; }
  makeSkirt(C, K, hipsJ, sp) {
    const NC = K.cols, NR = K.rows; const yt = hipsJ[1] + K.top; const Rw = this.hipT.Rw; const n = NC * NR; const cl = new Cloth(n, NC); cl.NC = NC; cl.NR = NR; const dy = K.len / (NR - 1);
    const thighR = Math.max(this.caps[0].ra, 0.07); const Rlow = (a, y) => (y > C.J.thighL[1] ? Rw(a, y) : Math.max(Rw(a, C.J.thighL[1]), Math.abs(C.J.thighL[0]) + thighR));
    for (let c = 0; c < NC; c++) { const a = (c / NC) * Math.PI * 2; const r0 = Rw(a, yt) + 0.004; let r = r0;
      for (let rr = 0; rr < NR; rr++) { const y = yt - rr * dy; const fl = r0 * (1 + (K.flare - 1) * Math.pow(rr / (NR - 1), 0.85)); r = Math.max(fl, Math.min(Rlow(a, y), 0.3) + 0.01, r * (rr ? 1 : 0)); const i = rr * NC + c;
        cl.rest[i * 3] = Math.sin(a) * r - hipsJ[0]; cl.rest[i * 3 + 1] = y - hipsJ[1]; cl.rest[i * 3 + 2] = Math.cos(a) * r - 0.01 - hipsJ[2]; } }
    this.pinSkin(C, cl, hipsJ);
    const R3 = (i) => [cl.rest[i * 3], cl.rest[i * 3 + 1], cl.rest[i * 3 + 2]]; const dist = (i, j) => Math.hypot(...sub(R3(i), R3(j)));
    const open = (c, rr) => K.slit != null && rr * dy > K.slitTop && c === NC - 1; // the sarong's slit: no ring link across it
    const slitC = K.slit != null ? Math.round(((Math.PI * 0.5 - K.slit + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2) * NC) : 0;
    const col = (c) => (c + slitC) % NC; // columns re-indexed so the slit sits between the last and the first
    cl.cmap = Array.from({ length: NC }, (_, c) => col(c));
    for (let rr = 0; rr < NR; rr++) for (let k = 0; k < NC; k++) { const i = rr * NC + col(k), j = rr * NC + col(k + 1); if (!open(k, rr)) cl.cons.push([i, j, dist(i, j), 1, 1]);
      if (rr + 1 < NR) cl.cons.push([i, i + NC, dist(i, i + NC), 1, 0]); if (rr + 2 < NR) cl.cons.push([i, i + 2 * NC, dist(i, i + 2 * NC), 0.25, 0]);
      if (rr + 1 < NR && !open(k, rr)) { cl.cons.push([i, j + NC, dist(i, j + NC), 0.3, 1]); }
      const j2 = rr * NC + col(k + 2); if (rr > 0 && !open(k, rr) && !open(k + 1, rr) && k + 2 <= NC + 1) cl.cons.push([i, j2, dist(i, j2), 0.18, 0]); } // ring bending: holds the flare
    // render mesh: (NC + 1) columns (the seam duplicated; the slit left open), pleats as an alternating offset
    const NCr = NC + 1; const g = new THREE.BufferGeometry(); const pos = new Float32Array(NCr * NR * 3); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(NCr * NR * 3), 3));
    const uv = new Float32Array(NCr * NR * 2); for (let rr = 0; rr < NR; rr++) for (let k = 0; k < NCr; k++) { uv[(rr * NCr + k) * 2] = k / NC; uv[(rr * NCr + k) * 2 + 1] = 1 - rr / (NR - 1); } g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    const idx = []; for (let rr = 0; rr + 1 < NR; rr++) for (let k = 0; k < NC; k++) { if (K.slit != null && k === NC - 1 && rr * dy > K.slitTop - dy) continue; const a = rr * NCr + k, b = a + 1, c2 = a + NCr, d = c2 + 1; idx.push(a, c2, d, a, d, b); } g.setIndex(idx);
    const base = new THREE.Color(sp.bottom || sp.top); if (K.kind === 'flare') base.lerp(new THREE.Color(0xffffff), 0.06);
    const mat = new THREE.MeshPhysicalMaterial({ color: base, side: THREE.DoubleSide, roughness: K.kind === 'flare' ? 0.55 : 0.42, sheen: 1, sheenRoughness: 0.3, sheenColor: new THREE.Color(0xffffff).multiplyScalar(0.6), });
    const mesh = new THREE.Mesh(g, mat); mesh.frustumCulled = false; mesh.castShadow = true; mesh.name = 'dancerSkirt'; mesh.renderOrder = 1; this.ch.root.add(mesh);
    cl.mesh = mesh; cl.kind = K.kind; cl.NCr = NCr; cl.slit = K.slit != null; return cl;
  }
  // pinned row: each point skinned like the nearest body vertex (linear blend of its bones), so the waistband line follows
  // the lower back and hips exactly as the skin under it does
  pinSkin(C, cl, hipsJ) { cl.pw = []; for (let i = 0; i < cl.pin; i++) { const q = [cl.rest[i * 3] + hipsJ[0], cl.rest[i * 3 + 1] + hipsJ[1], cl.rest[i * 3 + 2] + hipsJ[2]]; let best = -1, bd = 1e9;
      for (let u = 0; u < C.NU; u++) { if (C.warm(u) > 0.1) continue; const d = (C.P[u * 3] - q[0]) ** 2 + (C.P[u * 3 + 1] - q[1]) ** 2 + (C.P[u * 3 + 2] - q[2]) ** 2; if (d < bd) { bd = d; best = u; } }
      const w = top4(C.wmap(best)); cl.pw.push({ q, w }); } cl.pinPrev = new Float32Array(cl.pin * 3); cl.pinCur = new Float32Array(cl.pin * 3); }
  pinUpdate(cl) { const sk = this.ch.mesh.skeleton; const bm = sk.bones, bi = sk.boneInverses; cl.pinPrev.set(cl.pinCur);
    cl.pw.forEach((P, i) => { let x = 0, y = 0, z = 0; for (let k = 0; k < 4; k++) { const w = P.w.w[k]; if (!w) continue; _m4.multiplyMatrices(bm[P.w.i[k]].matrixWorld, bi[P.w.i[k]]); _v.set(P.q[0], P.q[1], P.q[2]).applyMatrix4(_m4); x += _v.x * w; y += _v.y * w; z += _v.z * w; }
      cl.pinCur[i * 3] = x; cl.pinCur[i * 3 + 1] = y; cl.pinCur[i * 3 + 2] = z; }); }
  makeFringe(C, K, hipsJ) {
    const NF = K.n, NS = K.nodes; const yt = hipsJ[1] + K.top - 0.008; const Rw = this.hipT.Rw; const cl = new Cloth(NF * NS, NF); cl.NC = NF; cl.NR = NS; const dl = K.len / (NS - 1);
    for (let c = 0; c < NF; c++) { const a = (c / NF) * Math.PI * 2; const r0 = Rw(a, yt) + 0.005;
      for (let s = 0; s < NS; s++) { const i = s * NF + c; const r = r0 + 0.004 * s; cl.rest[i * 3] = Math.sin(a) * r - hipsJ[0]; cl.rest[i * 3 + 1] = yt - s * dl - hipsJ[1]; cl.rest[i * 3 + 2] = Math.cos(a) * r - 0.01 - hipsJ[2]; } }
    this.pinSkin(C, cl, hipsJ);
    for (let s = 0; s + 1 < NS; s++) for (let c = 0; c < NF; c++) { const i = s * NF + c; cl.cons.push([i, i + NF, dl, 1, 0]); }
    // ribbons of beads: 2 verts per node
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NF * NS * 2 * 3), 3)); g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(NF * NS * 2 * 3), 3));
    const idx = []; for (let c = 0; c < NF; c++) for (let s = 0; s + 1 < NS; s++) { const a = (c * NS + s) * 2; idx.push(a, a + 2, a + 3, a, a + 3, a + 1); } g.setIndex(idx);
    const mat = new THREE.MeshStandardMaterial({ color: 0xd9a441, roughness: 0.25, metalness: 1, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(g, mat); mesh.frustumCulled = false; mesh.castShadow = true; mesh.name = 'dancerFringe'; this.ch.root.add(mesh); cl.mesh = mesh; cl.kind = 'fringe'; return cl;
  }
  makeTail(C, Hh, sp) {
    const NS = 10, len = 0.36; const hj = C.J.head; const cl = new Cloth(NS, 1); cl.NC = 1; cl.NR = NS; const dl = len / (NS - 1);
    const t0 = Hh.tie; const hipsJ = C.J.hips;
    for (let s = 0; s < NS; s++) { const a = s / (NS - 1); cl.rest[s * 3] = t0[0] - hipsJ[0]; cl.rest[s * 3 + 1] = t0[1] - hipsJ[1] - s * dl * 0.92; cl.rest[s * 3 + 2] = t0[2] - 0.02 - s * dl * 0.38 * (1 - a * 0.6) - hipsJ[2]; }
    for (let s = 0; s + 1 < NS; s++) cl.cons.push([s, s + 1, dl, 1, 0]); for (let s = 0; s + 2 < NS; s++) cl.cons.push([s, s + 2, dl * 1.95, 0.35, 0]);
    cl.tieLocal = new THREE.Vector3(t0[0] - hj[0], t0[1] - hj[1], t0[2] - hj[2]); cl.dirLocal = new THREE.Vector3(0, -0.35, -1).normalize();
    const RING = 12; const g = new THREE.BufferGeometry(); const nv = NS * RING + 1; g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(nv * 3), 3)); g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nv * 3), 3));
    const col = lin(sp.hairColor || '#120c08'); const cols = new Float32Array(nv * 3); for (let i = 0; i < nv; i++) { const k = 0.85 + 0.3 * hash(i, 3); cols[i * 3] = col[0] * k; cols[i * 3 + 1] = col[1] * k; cols[i * 3 + 2] = col[2] * k; } g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    g.setAttribute('aFlow', new THREE.BufferAttribute(new Float32Array(nv * 3), 3)); const root = new Float32Array(nv * 3); for (let i = 0; i < nv; i++) { root[i * 3] = (i % RING) * 0.004; root[i * 3 + 1] = Math.floor(i / RING) * 0.04; root[i * 3 + 2] = 0; } g.setAttribute('aRoot', new THREE.BufferAttribute(root, 3)); g.setAttribute('aLayer', new THREE.BufferAttribute(new Float32Array(nv), 1));
    const idx = []; for (let s = 0; s + 1 < NS; s++) for (let k = 0; k < RING; k++) { const a = s * RING + k, b = s * RING + ((k + 1) % RING); idx.push(a, a + RING, b + RING, a, b + RING, b); } const tip = NS * RING; for (let k = 0; k < RING; k++) idx.push((NS - 1) * RING + k, tip, (NS - 1) * RING + ((k + 1) % RING)); g.setIndex(idx);
    const mesh = new THREE.Mesh(g, this.hairMats[0]); mesh.frustumCulled = false; mesh.castShadow = true; mesh.name = 'dancerPonytail'; this.ch.root.add(mesh); cl.mesh = mesh; cl.kind = 'tail'; cl.RING = RING;
    // hair tie (fabric, rigid on the head)
    const tg = new THREE.TorusGeometry(0.014, 0.0045, 8, 20); const tm = new THREE.Mesh(tg, new THREE.MeshStandardMaterial({ color: new THREE.Color(sp.top), roughness: 0.6 })); this.extra.push(tg, tm.material);
    tm.position.copy(cl.tieLocal); tm.lookAt(tm.position.clone().add(cl.dirLocal)); this.ch.bones.head.add(tm);
    return cl;
  }
  fingerAxes(C, S) { const J = C.J; const sx = S === 'L' ? 1 : -1; const out = {};
    const palmN = nrm([-sx, 0, 0.12]); // palm faces the thigh (midline), slightly forward
    for (const f of ['idx', 'mid', 'rng', 'pnk', 'thb']) { const ax = []; for (let j = 1; j <= 3; j++) { const a = J[f + j + S], b = j < 3 ? J[f + (j + 1) + S] : add(J[f + 3 + S], sub(J[f + 3 + S], J[f + 2 + S])); const d = nrm(sub(b, a));
        const n = f === 'thb' ? nrm([-sx * 0.35, 0, -0.94]) : palmN; ax.push(new THREE.Vector3(...nrm(crs(d, n)))); } out[f] = ax; }
    return out; }
  // ---------------------------------------------------------------- per frame (after the animation pose)
  update(dt) {
    if (!(dt > 0)) return; const ch = this.ch; ch.root.updateMatrixWorld(true); this.t += dt;
    const pole = this.poleWorld(); this.fingers(dt, pole); this.breasts(dt);
    const hips = ch.bones.hips; const big = dt > 0.1 || !this.prevHips; if (!this.prevHips) this.prevHips = new THREE.Matrix4();
    for (const c of this.caps) { c.bA.getWorldPosition(_v); c.a[0] = _v.x; c.a[1] = _v.y; c.a[2] = _v.z; c.bB.getWorldPosition(_v); c.b[0] = _v.x; c.b[1] = _v.y; c.b[2] = _v.z; }
    { const [tL, sL, tR, sR] = [this.caps[0], this.caps[1], this.caps[2], this.caps[3]]; const H = this.hull; const wT = Math.hypot(...sub(tL.a, tR.a)) / 2, wK = Math.hypot(...sub(tL.b, tR.b)) / 2;
      for (let k = 0; k < 3; k++) { H.a[k] = (tL.a[k] + tR.a[k]) / 2; H.b[k] = (tL.b[k] + tR.b[k]) / 2; } H.ra = wT + tL.ra * 0.75; H.rb = wK + tL.rb * 0.7; H.on = wK < 0.17; }
    this.hipT.m.copy(hips.matrixWorld); this.hipT.inv.copy(hips.matrixWorld).invert();
    for (const cl of [this.skirt, this.fringe, this.tail]) if (cl) this.sim(cl, dt, big, pole);
    this.prevHips.copy(hips.matrixWorld);
  }
  poleWorld() { const ch = this.ch, pd = ch.poleDancer; if (!(pd && pd.pole && ch.root.parent)) return null; const g = ch.root.parent; _v.set(pd.pole.x, 0, pd.pole.z).applyMatrix4(g.matrixWorld); _v2.set(0, 0, 0).applyMatrix4(g.matrixWorld);
    return { x: _v.x, z: _v.z, y0: pd.pole.y0 + _v2.y - 0.1, y1: pd.pole.y1 + _v2.y, r: 0.026 + 0.005, R: 0.0225 }; }
  // fingers closing on the pole: each joint curls as far as it can while the next joint (or the finger tip) stays on the pole
  // surface — the hand wraps the actual pole instead of a fixed fist pose that would sink into it
  wrap(S, pole, out, base = null) { const b = this.ch.bones, F = this.fing[S]; const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
    for (const [fi, f] of ['idx', 'mid', 'rng', 'pnk', 'thb'].entries()) { const R = pole.R + (f === 'thb' ? 0.013 : 0.0105); const lim = f === 'thb' ? [0.9, 0.9, 0.9] : [1.5, 1.7, 1.2];
      for (let j = 0; j < 3; j++) { const bone = b[f + (j + 1) + S]; const child = j < 2 ? b[f + (j + 2) + S] : null;
        const endW = () => { bone.updateMatrixWorld(true); if (child) return child.getWorldPosition(tmp); return bone.localToWorld(tmp.copy(bone.position).setLength(f === 'thb' ? 0.026 : 0.024)); }; // tip: continues the bone's own (curled) axis
        const clear = (a) => { bone.quaternion.setFromAxisAngle(F[f][j], a); const e = endW(); return Math.hypot(e.x - pole.x, e.z - pole.z) >= R; };
        let lo = -0.3, hi = lim[j];
        if (base && base[fi * 3 + j] === null) { bone.updateMatrixWorld(true); out[fi * 3 + j] = null; continue; }
        if (base) { const a0 = base[fi * 3 + j]; lo = a0; if (!clear(a0)) { lo = null; for (let k = 1; k <= 8 && lo === null; k++) { if (clear(a0 + k * 0.18)) lo = a0 + k * 0.18; else if (clear(a0 - k * 0.12)) lo = a0 - k * 0.12; } if (lo === null) lo = Math.min(lim[j], a0 + 1.4); } }
        else if (clear(hi)) lo = hi; else if (!clear(lo)) hi = lo; else for (let it = 0; it < 7; it++) { const m = (lo + hi) / 2; if (clear(m)) lo = m; else hi = m; }
        bone.quaternion.setFromAxisAngle(F[f][j], lo); out[fi * 3 + j] = lo; bone.updateMatrixWorld(true);
        if (!clear(lo)) { // the curl axis can't take it out (thumb on the palm side): swing the segment radially away from the pole
          const p0 = bone.getWorldPosition(new THREE.Vector3()), e = endW().clone(), seg = e.clone().sub(p0).normalize(); const rad = new THREE.Vector3(p0.x - pole.x, 0, p0.z - pole.z).normalize();
          const k = seg.clone().cross(rad); if (k.lengthSq() > 1e-8) { k.normalize(); const qp = bone.parent.getWorldQuaternion(new THREE.Quaternion()), qpi = qp.clone().invert(), base = bone.quaternion.clone();
            for (let th = 0.12; th <= 1.8; th += 0.12) { bone.quaternion.copy(qpi).multiply(_q2.setFromAxisAngle(k, th)).multiply(qp).multiply(base); if (Math.hypot(endW().x - pole.x, endW().z - pole.z) >= R) break; } }
          out[fi * 3 + j] = null; bone.updateMatrixWorld(true); } } } }
  fingers(dt, pole) {
    const b = this.ch.bones; const hg = this.ch.handGrip; const NAMES = ['idx', 'mid', 'rng', 'pnk', 'thb'];
    const angles = (v) => { const pv = poseVec(v, 1); const a = pv.slice(0, 12); for (let j = 0; j < 3; j++) a.push(pv[12] * [0.5, 0.7, 0.6][j]); return a; };
    const relax = [0.12, 0.22, 0.26, 0.3, 0.34];
    for (const S of ['L', 'R']) { const want = hg ? (hg[S] ? 1 : 0) : 0; this.grip[S] += (want - this.grip[S]) * (1 - Math.exp(-dt / 0.09));
      const g = this.grip[S]; const F = this.fing[S];
      const hw = b['hand' + S].getWorldPosition(_v3), near = pole && Math.hypot(hw.x - pole.x, hw.z - pole.z) < 0.25 && hw.y > pole.y0 - 0.1 && hw.y < pole.y1 + 0.1;
      let fin;
      if (near && g > 0.02) { const w = new Array(15); this.wrap(S, pole, w); const r0 = angles(relax); fin = w.map((x, i) => (x === null ? null : lerp(r0[i], x, g))); } // closing on the pole
      else fin = angles(relax.map((r, i) => lerp(r, HAND_POSES.grip[i] + 0.05, g)));
      // null = a joint the contact solve had to swing off its curl axis: keep its solved rotation
      NAMES.forEach((f, fi) => { for (let j = 0; j < 3; j++) { const a = fin[fi * 3 + j]; if (a !== null) b[f + (j + 1) + S].quaternion.setFromAxisAngle(F[f][j], a); } });
      // whatever the grip state (closing, opening, released and travelling round the pole), nothing ends up inside the pole
      if (near) { b['hand' + S].updateMatrixWorld(true); this.wrap(S, pole, new Array(15), fin); } }
  }
  breasts(dt) {
    const ch = this.ch, chest = ch.bones.chest; const e = chest.matrixWorld.elements; const p = _v.set(e[12], e[13], e[14]); chest.getWorldQuaternion(_q);
    if (!this.prev || dt > 0.1) { this.prev = p.clone(); this.vel.set(0, 0, 0); this.acc.set(0, 0, 0); this.qPrev.copy(_q); this.wAng.set(0, 0, 0); return; }
    const vel = _v2.copy(p).sub(this.prev).divideScalar(dt); const a = vel.clone().sub(this.vel).divideScalar(dt); this.vel.copy(vel); this.prev.copy(p);
    if (a.length() > 30) a.setLength(30); this.acc.lerp(a, 1 - Math.exp(-dt / 0.03));
    // angular velocity (world) from the chest's rotation change
    _q2.copy(this.qPrev).invert().premultiply(_q); if (_q2.w < 0) { _q2.x *= -1; _q2.y *= -1; _q2.z *= -1; _q2.w *= -1; } const s = Math.sqrt(Math.max(0, 1 - _q2.w * _q2.w)); const ang = 2 * Math.acos(clamp(_q2.w, -1, 1));
    const w = s > 1e-6 ? new THREE.Vector3(_q2.x / s, _q2.y / s, _q2.z / s).multiplyScalar(ang / dt) : new THREE.Vector3(); if (w.length() > 12) w.setLength(12); this.wAng.lerp(w, 1 - Math.exp(-dt / 0.03)); this.qPrev.copy(_q);
    // specific force in the chest frame: −(a − g); at rest upright that is (0, +9.81, 0) — the spring's rest state
    const inv = _q.clone().invert(); const fsp = this.acc.clone().negate().add(new THREE.Vector3(0, -9.81, 0)).applyQuaternion(inv); fsp.y += 9.81;
    const wl = this.wAng.clone().applyQuaternion(inv);
    const W0 = this.bw, Z = this.bz, Gk = this.bG, M = this.bmax; const n = Math.max(1, Math.ceil(dt / (1 / 240))), h = dt / n;
    for (const B of this.br) { const r = [0, 0, B.lever]; const cen = crs([wl.x, wl.y, wl.z], crs([wl.x, wl.y, wl.z], r)); // centripetal (−ω×(ω×r) is the felt outward push)
      const F = [fsp.x * Gk - cen[0] * 0.5, fsp.y * Gk - cen[1] * 0.5, fsp.z * Gk * 0.5 - cen[2] * 0.3];
      for (let k = 0; k < n; k++) for (let c = 0; c < 3; c++) { B.v[c] += (-W0 * W0 * B.o[c] - 2 * Z * W0 * B.v[c] + F[c]) * h; B.o[c] += B.v[c] * h; }
      for (let c = 0; c < 3; c++) if (!Number.isFinite(B.o[c])) { B.o = [0, 0, 0]; B.v = [0, 0, 0]; }
      const o = B.o.map((x) => M * Math.tanh(x / M)); B.lim = o;
      B.b.position.set(B.rest.x + o[0] * 0.4, B.rest.y + o[1] * 0.4, B.rest.z + o[2] * 0.5);
      B.b.rotation.set(-o[1] * 0.6 / B.lever, o[0] * 0.6 / B.lever, 0); }
    ch.bones.breastL.updateMatrixWorld(true); ch.bones.breastR.updateMatrixWorld(true);
  }
  sim(cl, dt, big, pole) {
    const hips = this.ch.bones.hips; const NC = cl.NC; const p = cl.p, o = cl.o;
    const pinW = (i, m, out) => { _v.set(cl.rest[i * 3], cl.rest[i * 3 + 1], cl.rest[i * 3 + 2]); if (cl.kind === 'tail') { _v.copy(cl.tieLocal).applyMatrix4(this.ch.bones.head.matrixWorld); } else _v.applyMatrix4(m); out[i * 3] = _v.x; out[i * 3 + 1] = _v.y; out[i * 3 + 2] = _v.z; };
    if (big || !cl.ok) { for (let i = 0; i < cl.n; i++) { _v.set(cl.rest[i * 3], cl.rest[i * 3 + 1], cl.rest[i * 3 + 2]).applyMatrix4(hips.matrixWorld); p[i * 3] = o[i * 3] = _v.x; p[i * 3 + 1] = o[i * 3 + 1] = _v.y; p[i * 3 + 2] = o[i * 3 + 2] = _v.z; }
      if (cl.kind === 'tail') { const h = this.ch.bones.head.matrixWorld; const t = cl.tieLocal.clone().applyMatrix4(h); const d = cl.dirLocal.clone().transformDirection(h); for (let s = 0; s < cl.n; s++) { const q = t.clone().addScaledVector(d, s * 0.04 * 0.4).add(new THREE.Vector3(0, -s * 0.036, 0)); p[s * 3] = o[s * 3] = q.x; p[s * 3 + 1] = o[s * 3 + 1] = q.y; p[s * 3 + 2] = o[s * 3 + 2] = q.z; } }
      if (cl.pw) { this.pinUpdate(cl); cl.pinPrev.set(cl.pinCur); } cl.ok = true; for (let k = 0; k < 30; k++) this.step(cl, 1 / 120, pole, hips.matrixWorld, hips.matrixWorld); this.render(cl); return; }
    if (cl.pw) this.pinUpdate(cl); const n = Math.min(4, Math.max(1, Math.ceil(dt / (1 / 100)))); const h = dt / n; const m0 = this.prevHips, m1 = hips.matrixWorld;
    for (let k = 0; k < n; k++) { const t = (k + 1) / n; this.step(cl, h, pole, m0, m1, t); }
    this.render(cl);
  }
  step(cl, h, pole, m0, m1, t = 1) {
    const p = cl.p, o = cl.o, n = cl.n, pin = cl.pin; const damp = cl.kind === 'tail' ? 0.985 : cl.kind === 'fringe' ? 0.975 : 0.97; const g = -9.81 * h * h;
    // pinned row follows the hips (interpolated over the sub-steps), tail root follows the head
    if (cl.kind === 'tail') { _v.copy(cl.tieLocal).applyMatrix4(this.ch.bones.head.matrixWorld); p[0] = _v.x; p[1] = _v.y; p[2] = _v.z; const d = _v2.copy(cl.dirLocal).transformDirection(this.ch.bones.head.matrixWorld); cl.dirW = d; }
    else if (cl.pw) { for (let i = 0; i < pin; i++) for (let c = 0; c < 3; c++) p[i * 3 + c] = lerp(cl.pinPrev[i * 3 + c], cl.pinCur[i * 3 + c], t); }
    else { for (let i = 0; i < pin; i++) { _v.set(cl.rest[i * 3], cl.rest[i * 3 + 1], cl.rest[i * 3 + 2]); const a = _v.clone().applyMatrix4(m0), b = _v.applyMatrix4(m1); p[i * 3] = lerp(a.x, b.x, t); p[i * 3 + 1] = lerp(a.y, b.y, t); p[i * 3 + 2] = lerp(a.z, b.z, t); } }
    for (let i = pin; i < n; i++) { const x = p[i * 3], y = p[i * 3 + 1], z = p[i * 3 + 2]; p[i * 3] += (x - o[i * 3]) * damp; p[i * 3 + 1] += (y - o[i * 3 + 1]) * damp + g; p[i * 3 + 2] += (z - o[i * 3 + 2]) * damp; o[i * 3] = x; o[i * 3 + 1] = y; o[i * 3 + 2] = z; }
    if (cl.kind === 'tail' && cl.dirW) { const d = cl.dirW; p[3] = p[0] + d.x * 0.036; p[4] = p[1] + d.y * 0.036; p[5] = p[2] + d.z * 0.036; } // the tie holds the first segment's direction
    const head = this.ch.bones.head; let hc = null; if (cl.kind === 'tail') { hc = _v2.set(0, 0.075, -0.02).applyMatrix4(head.matrixWorld).clone(); }
    for (let it = 0; it < 4; it++) {
      for (const [i, j, rest, k, mode] of cl.cons) { const dx = p[j * 3] - p[i * 3], dy = p[j * 3 + 1] - p[i * 3 + 1], dz = p[j * 3 + 2] - p[i * 3 + 2]; const d = Math.hypot(dx, dy, dz) || 1e-9;
        if (mode === 1 && d < rest && d > rest * 0.8) continue; // ring / shear: resists stretching, lets the cloth gather a little
        const diff = ((d - rest) / d) * k; const wi = i < cl.pin ? 0 : 1, wj = j < cl.pin ? 0 : 1; const s = wi + wj; if (!s) continue;
        const cx = dx * diff / s, cy = dy * diff / s, cz = dz * diff / s; if (wi) { p[i * 3] += cx; p[i * 3 + 1] += cy; p[i * 3 + 2] += cz; } if (wj) { p[j * 3] -= cx; p[j * 3 + 1] -= cy; p[j * 3 + 2] -= cz; } }
      const caps = cl.kind === 'tail' || !this.hull.on ? this.caps : this.capsHull || (this.capsHull = [...this.caps, this.hull]);
      for (let i = cl.pin; i < n; i++) { collide(p, i, caps, pole, cl.kind === 'tail' ? null : this.hipT);
        if (hc) { const dx = p[i * 3] - hc.x, dy = p[i * 3 + 1] - hc.y, dz = p[i * 3 + 2] - hc.z, d = Math.hypot(dx, dy, dz), R = 0.105; if (d < R) { const k2 = R / (d || 1); p[i * 3] = hc.x + dx * k2; p[i * 3 + 1] = hc.y + dy * k2; p[i * 3 + 2] = hc.z + dz * k2; } } }
      if (cl.kind === 'tail') { const ch = this.ch.bones.chest; _v.set(0, 0.2, -0.13).applyMatrix4(ch.matrixWorld); for (let i = 1; i < n; i++) { const dx = p[i * 3] - _v.x, dy = p[i * 3 + 1] - _v.y, dz = p[i * 3 + 2] - _v.z, d = Math.hypot(dx, dy, dz); if (d < 0.1) { const k2 = 0.1 / (d || 1); p[i * 3] = _v.x + dx * k2; p[i * 3 + 1] = _v.y + dy * k2; p[i * 3 + 2] = _v.z + dz * k2; } } }
    }
  }
  render(cl) {
    const root = this.ch.root; _m4.copy(root.matrixWorld).invert(); const e = _m4.elements; const p = cl.p; const g = cl.mesh.geometry; const P = g.attributes.position.array;
    const L = (i, out, k) => { const x = p[i * 3], y = p[i * 3 + 1], z = p[i * 3 + 2]; out[k] = e[0] * x + e[4] * y + e[8] * z + e[12]; out[k + 1] = e[1] * x + e[5] * y + e[9] * z + e[13]; out[k + 2] = e[2] * x + e[6] * y + e[10] * z + e[14]; };
    if (cl.kind === 'fringe') { const NF = cl.NC, NS = cl.NR, Nn = g.attributes.normal.array; const tmp = [0, 0, 0];
      for (let c = 0; c < NF; c++) for (let s = 0; s < NS; s++) { const i = s * NF + c; L(i, tmp, 0); const a = (c / NF) * Math.PI * 2; const tx = Math.cos(a) * 0.0018, tz = -Math.sin(a) * 0.0018; const k = (c * NS + s) * 6;
        P[k] = tmp[0] - tx; P[k + 1] = tmp[1]; P[k + 2] = tmp[2] - tz; P[k + 3] = tmp[0] + tx; P[k + 4] = tmp[1]; P[k + 5] = tmp[2] + tz; for (let q = 0; q < 2; q++) { Nn[k + q * 3] = Math.sin(a); Nn[k + q * 3 + 1] = 0; Nn[k + q * 3 + 2] = Math.cos(a); } }
      g.attributes.position.needsUpdate = true; g.attributes.normal.needsUpdate = true; return; }
    if (cl.kind === 'tail') { const RING = cl.RING, NS = cl.NR; const F = g.attributes.aFlow.array, Nn = g.attributes.normal.array; const c = [], t = [];
      for (let s = 0; s < NS; s++) { const q = [0, 0, 0]; L(s, q, 0); c.push(q); }
      for (let s = 0; s < NS; s++) t.push(nrm(sub(c[Math.min(NS - 1, s + 1)], c[Math.max(0, s - 1)])));
      let ref = [1, 0, 0]; for (let s = 0; s < NS; s++) { const T = t[s]; let bx = nrm(crs(T, crs(ref, T))); if (!Number.isFinite(bx[0])) bx = [1, 0, 0]; ref = bx; const by = crs(T, bx); const u = s / (NS - 1);
        const r = 0.017 * (1 - 0.7 * u) * (1 + 0.35 * Math.sin(Math.PI * Math.min(1, u * 2.4))) + 0.003;
        for (let k = 0; k < RING; k++) { const a = (k / RING) * Math.PI * 2; const nx = bx[0] * Math.cos(a) * 1.0 + by[0] * Math.sin(a) * 0.8, ny = bx[1] * Math.cos(a) + by[1] * Math.sin(a) * 0.8, nz = bx[2] * Math.cos(a) + by[2] * Math.sin(a) * 0.8; const j = (s * RING + k) * 3;
          P[j] = c[s][0] + nx * r; P[j + 1] = c[s][1] + ny * r; P[j + 2] = c[s][2] + nz * r; const nn = nrm([nx, ny, nz]); Nn[j] = nn[0]; Nn[j + 1] = nn[1]; Nn[j + 2] = nn[2]; F[j] = T[0]; F[j + 1] = T[1]; F[j + 2] = T[2]; } }
      const tip = NS * RING * 3, lt = c[NS - 1], T = t[NS - 1]; P[tip] = lt[0] + T[0] * 0.012; P[tip + 1] = lt[1] + T[1] * 0.012; P[tip + 2] = lt[2] + T[2] * 0.012; Nn[tip] = T[0]; Nn[tip + 1] = T[1]; Nn[tip + 2] = T[2]; F[tip] = T[0]; F[tip + 1] = T[1]; F[tip + 2] = T[2];
      g.attributes.position.needsUpdate = true; g.attributes.normal.needsUpdate = true; g.attributes.aFlow.needsUpdate = true; return; }
    // skirt
    const NC = cl.NC, NR = cl.NR, NCr = cl.NCr; const tmp = [0, 0, 0];
    for (let r = 0; r < NR; r++) for (let k = 0; k < NCr; k++) { const c = cl.cmap[k % NC]; L(r * NC + c, tmp, 0); const j = (r * NCr + k) * 3; P[j] = tmp[0]; P[j + 1] = tmp[1]; P[j + 2] = tmp[2]; }
    g.computeVertexNormals();
    if (cl.kind === 'pleat') { const Nn = g.attributes.normal.array; for (let r = 1; r < NR; r++) for (let k = 0; k < NCr; k++) { const j = (r * NCr + k) * 3; const d = (k % 2 ? 1 : -1) * 0.0042 * (0.35 + 0.65 * r / (NR - 1)); P[j] += Nn[j] * d; P[j + 1] += Nn[j + 1] * d; P[j + 2] += Nn[j + 2] * d; } g.computeVertexNormals(); }
    g.attributes.position.needsUpdate = true;
  }
  dispose() {
    for (const m of [...this.wearMats, ...this.hairMats]) m.dispose(); this.wear.geometry.dispose(); this.hair.geometry.dispose();
    for (const cl of [this.skirt, this.fringe, this.tail]) if (cl) { cl.mesh.geometry.dispose(); if (cl.kind !== 'tail') cl.mesh.material.dispose(); cl.mesh.removeFromParent(); }
    for (const x of this.extra) if (x.dispose) x.dispose();
  }
}
