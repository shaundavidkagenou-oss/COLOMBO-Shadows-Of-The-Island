// Crowd / police / service NPC bodies: one continuous anatomical surface (npcBodyData.js, baked from the CC0 MakeHuman
// base mesh by tools/mh/bake-npc-bodies.mjs and fitted to the 23-bone crowd skeleton) with the clothes grown from it as
// garment shells — the same construction as the protagonists (HeroBody.js), sized for a crowd:
//   • four shapes per sex (average / slim / heavy / older) blended per person from build, belly and age band, then scaled
//     to their height and build (the crowd joints are linear in both, so the scale lands every vertex on the skeleton);
//   • shirt / tee / blouse / tunic and trousers / shorts are offset copies of the body (ease per region), relaxed so the
//     cloth bridges hollows, draped from the chest (a shirt hangs, it does not cling to the waist), with turned-under hems;
//     tucked shirts go into the waistband, untucked ones hang over it; skirts, sarongs and sarees keep their own lofts
//     (Character.js) and ride on this surface through ringAt();
//   • the shirt neck conforms to the crowd head's neck (NpcHead.js) so collars and crew necks meet it; dress / uniform
//     shirts get a real folded collar leaf, office shirts a tie;
//   • skin under clothing is removed (nothing can poke through) — and there are no separate leg tubes, so there is no
//     block between the legs: the thighs meet at a real crotch and seat.
// Everything is one SkinnedMesh with the crowd material: no extra draw calls, about the old triangle count.
import DATA from './npcBodyData.js';

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const dec = (s, T) => { const bin = atob(s); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); return new T(u8.buffer); };

/** Everyone who is not a protagonist (they have HeroBody) or a club dancer (DancerBody). `__NO_NPC_BODY`: A/B tests. */
export const hasNpcBody = (sp) => !globalThis.__NO_NPC_BODY && !!sp && !sp.hero && !sp.dancerBody && !!DATA.sexes;

const SH = {};
function shared(sex) {
  if (SH[sex]) return SH[sex];
  const D = DATA.sexes[sex]; const NU = D.nu;
  const idx = dec(D.idx, Uint16Array); const si = dec(D.skinIndex, Uint8Array), sw = dec(D.skinWeight, Uint8Array), nail = dec(D.nail, Uint8Array), part = dec(D.part, Uint8Array);
  const shapes = {}; for (const [k, v] of Object.entries(D.shapes)) { const p = dec(v, Int16Array); const f = new Float32Array(NU * 3); for (let i = 0; i < f.length; i++) f[i] = p[i] * DATA.q; shapes[k] = f; }
  const nbOf = (ix) => { const nb = Array.from({ length: NU }, () => new Set()); for (let t = 0; t < ix.length; t += 3) for (let k = 0; k < 3; k++) { const a = ix[t + k], b = ix[t + (k + 1) % 3]; nb[a].add(b); nb[b].add(a); } return nb.map((q) => Int32Array.from(q)); };
  const idxLo = dec(D.idxLo, Uint16Array);
  const armW = new Float32Array(NU), handW = new Float32Array(NU), legW = new Float32Array(NU), footW = new Float32Array(NU);
  for (let u = 0; u < NU; u++) { armW[u] = part[u * 4] / 255; handW[u] = part[u * 4 + 1] / 255; legW[u] = part[u * 4 + 2] / 255; footW[u] = part[u * 4 + 3] / 255; }
  SH[sex] = { NU, lv: [{ idx, nb: nbOf(idx) }, { idx: idxLo, nb: nbOf(idxLo) }], si, sw, nail, bones: D.bones, shapes, armW, handW, legW, footW };
  return SH[sex];
}
function normalsOf(P, idx, n) {
  const N = new Float32Array(n * 3);
  for (let t = 0; t < idx.length; t += 3) { const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; for (const o of [a, b, c]) { N[o] += nx; N[o + 1] += ny; N[o + 2] += nz; } }
  for (let i = 0; i < n; i++) { const l = Math.hypot(N[i * 3], N[i * 3 + 1], N[i * 3 + 2]) || 1; N[i * 3] /= l; N[i * 3 + 1] /= l; N[i * 3 + 2] /= l; }
  return N;
}

/** Shape mix for a spec: build (0.9 slim … 1.14 heavy), belly, age band. */
export function npcShapeWeights(sp) {
  const b = sp.build ?? 1, bel = sp.belly || 0;
  const heavy = Math.max(sstep(1.02, 1.14, b) * 0.9, clamp(bel * 1.4, 0, 0.9)); let slim = sstep(1.0, 0.9, b) * 0.9 * (1 - heavy);
  let old = sp.band === 'senior' || sp.age === 'elder' ? 0.85 : sp.band === 'mature' ? 0.35 : 0; let hv = heavy;
  const sum = slim + hv + old; if (sum > 1) { slim /= sum; hv /= sum; old /= sum; }
  return { avg: 1 - slim - hv - old, slim, heavy: hv, old };
}

// what the person wears, as shells: top (sleeve, hem height, tucked), legs (trousers / shorts / briefs under a skirt)
function planOf(sp) {
  const o = sp.outfit || 'tee'; const sk = sp.skirt;
  const tucked = !!sp.uniformShirt || o === 'office' || o === 'security' || o === 'national' || o === 'office_f' || (o === 'shirt' && !!sp.longSleeve);
  const midriff = o === 'saree' || !!sp.midriff;
  const hem = midriff ? (sp.cropY ?? (o === 'saree' ? 1.12 : 1.19)) : tucked ? 0.972 : sk ? 0.95 : 0.935;
  const sleeve = sp.sleeveless ? 'none' : sp.longSleeve ? 'long' : 'short';
  const leggings = (o === 'kurta' || o === 'kurti' || o === 'salwar') && sp.bottom && sp.bottom !== sp.skin;
  const legs = sk ? (leggings ? 'trousers' : 'briefs') : sp.shorts ? 'shorts' : 'trousers';
  return { o, tucked, midriff, hem, sleeve, legs, jacket: o === 'jacket' };
}

/**
 * Emit the body + garment shells into the SkinBuilder. ctx: { B (bone name → index), J, NH (npcHeadFit), C (hex → linear rgb) }.
 * Returns { ringAt(y) → {rx, rz, cz}, surfZ(y, x, sgn), wrist(side, y) → {c, rx, rz}, feetBare, stats }.
 */
export function buildNpcGarments(sb, sp, ctx) {
  const sex = sp.sex === 'f' ? 'f' : 'm'; const S0 = shared(sex); const { B, NH, C } = ctx; const NU = S0.NU;
  const lod = sp._lod ? 1 : 0; const S = { ...S0, idx: S0.lv[lod].idx, nb: S0.lv[lod].nb }; // far LOD: the coarse index level over the same vertices
  const { armW, handW, legW } = S;
  const s = sp.height / 1.72, bw = sp.build ?? 1;
  const skin = C(sp.skin), top = C(sp.top || '#d8d4cc'), bottom = C(sp.bottom || '#2b2e36');
  const PL = planOf(sp);
  // ---- body: shape blend → this person's height / build → neck tucked into the head's neck skirt
  const P = new Float32Array(NU * 3); const SW = npcShapeWeights(sp);
  for (const [k, wt] of Object.entries(SW)) { if (wt < 1e-4) continue; const A = S.shapes[k]; for (let i = 0; i < A.length; i++) P[i] += A[i] * wt; }
  const kx = s * bw, ky = s, kz = s * (1 + (bw - 1) * 0.45);
  for (let u = 0; u < NU; u++) { P[u * 3] *= kx; P[u * 3 + 1] *= ky; P[u * 3 + 2] *= kz; }
  const nk = NH.neck; const y0 = nk.y0; const cutY = y0 + 0.04;
  const collarAt = (yy) => { const g = Math.max(0, y0 - yy) * 0.55; const k = lerp(1, 0.86, sstep(y0, y0 + 0.04, yy)); return { cz: nk.cz, rx: (nk.rx + 0.002) * k + g, rz: (nk.rz + 0.002) * k + g }; };
  for (let u = 0; u < NU; u++) { if (armW[u] >= 0.5) continue; const yy = P[u * 3 + 1]; if (yy < y0 - 0.03) continue;
    const E0 = collarAt(Math.min(yy, cutY)); const x = P[u * 3], z = P[u * 3 + 2]; const rn = Math.hypot(x / E0.rx, (z - E0.cz) / E0.rz);
    const t = sstep(y0 - 0.03, y0 + 0.004, yy) * sstep(2.4, 1.5, rn); if (t <= 0) continue; const a = Math.atan2((z - E0.cz) / E0.rz, x / E0.rx);
    P[u * 3] = lerp(x, Math.cos(a) * E0.rx, t); P[u * 3 + 2] = lerp(z, E0.cz + Math.sin(a) * E0.rz, t); P[u * 3 + 1] = Math.min(yy, cutY); }
  const N = normalsOf(P, S.idx, NU);
  // ---- per-vertex weights → game bones
  if (!S0.W) { const Wl = new Array(NU); for (let u = 0; u < NU; u++) { const L = []; for (let k = 0; k < 4; k++) { const w = S0.sw[u * 4 + k] / 255; if (w > 0) L.push([B[S0.bones[S0.si[u * 4 + k]]], w]); } Wl[u] = L; } S0.W = Wl; } // bone indices are global (Character.js B): built once per sex
  const W = S0.W;
  const y = (u) => P[u * 3 + 1];
  // ---- garment extents (model space)
  const yTop = Math.max(y0 + (sp.collar ? 0.026 : 0.006), 1.42 * s);
  const shirtHem = PL.hem * s; const sleeveY = (PL.sleeve === 'long' ? 0.905 : 1.205) * s; const waistY = 0.997 * s;
  const sandals = !!sp.sandals; const boots = !!sp.boots;
  const legHem = PL.legs === 'shorts' ? (sp.shortsY ?? 0.62) * s : PL.legs === 'briefs' ? 0.8 * s : (boots ? 0.165 : sandals ? 0.11 : 0.093) * s;
  const footCut = sandals ? -1 : 0.072 * s; // closed shoes: the foot inside the shoe is not drawn
  const shirtHas = (u, tol) => (armW[u] >= 0.5 ? PL.sleeve !== 'none' && handW[u] < 0.5 && y(u) >= sleeveY - tol : legW[u] < 0.5 && y(u) >= shirtHem - tol);
  const trouserHas = (u, tol) => armW[u] < 0.5 && y(u) <= waistY + tol && y(u) >= legHem - tol;
  const shirtEase = (u) => { if (armW[u] >= 0.5) return PL.sleeve === 'long' ? lerp(0.006, 0.011, sstep(0.95 * s, 1.15 * s, y(u))) : 0.009 + 0.013 * sstep(1.33 * s, 1.215 * s, y(u));
    return 0.0075 + 0.004 * sstep(1.1 * s, 1.0 * s, y(u)) * (PL.tucked ? 1 : 1.3); };
  const trouserEase = (u) => { const yy = y(u); if (PL.legs === 'briefs') return 0.003; if (boots && yy < 0.26 * s) return lerp(0.002, 0.008, sstep(0.17 * s, 0.26 * s, yy));
    return 0.0075 + 0.005 * sstep(0.88 * s, 0.7 * s, yy) + 0.006 * sstep(0.5 * s, 0.18 * s, yy) - 0.002 * sstep(0.93 * s, 0.99 * s, yy); };
  const uv0 = [0.01, 0.51];
  // ---- one garment shell (HeroBody.js construction)
  const shell = (has, ease, col, hemFor, post, colFn = null) => {
    const inG = new Uint8Array(NU); for (let u = 0; u < NU; u++) inG[u] = has(u, 0.013) ? 1 : 0;
    const tris = []; for (let t = 0; t < S.idx.length; t += 3) { const a = S.idx[t], b = S.idx[t + 1], c = S.idx[t + 2]; if (inG[a] && inG[b] && inG[c]) tris.push(a, b, c); }
    const used = new Uint8Array(NU); for (const v of tris) used[v] = 1;
    const edge = new Map(); for (let t = 0; t < tris.length; t += 3) for (let k = 0; k < 3; k++) { const a = tris[t + k], b = tris[t + (k + 1) % 3]; const key = a < b ? a * 65536 + b : b * 65536 + a; edge.set(key, (edge.get(key) || 0) + 1); }
    const bnd = new Uint8Array(NU); const bEdges = [];
    for (let t = 0; t < tris.length; t += 3) for (let k = 0; k < 3; k++) { const a = tris[t + k], b = tris[t + (k + 1) % 3]; const key = a < b ? a * 65536 + b : b * 65536 + a; if (edge.get(key) === 1) { bnd[a] = bnd[b] = 1; bEdges.push(a, b); } }
    const Q = new Float32Array(NU * 3), E = new Float32Array(NU);
    for (let u = 0; u < NU; u++) { if (!used[u]) continue; const e = ease(u); E[u] = e; for (let k = 0; k < 3; k++) Q[u * 3 + k] = P[u * 3 + k] + N[u * 3 + k] * e;
      if (bnd[u]) { const hy = hemFor(u); if (hy != null) Q[u * 3 + 1] = hy; } }
    const T = new Float32Array(NU * 3);
    for (let it = 0; it < 3; it++) { T.set(Q);
      for (let u = 0; u < NU; u++) { if (!used[u] || bnd[u]) continue; let x = 0, yy = 0, z = 0, n = 0; for (const v of S.nb[u]) { if (!used[v]) continue; x += Q[v * 3]; yy += Q[v * 3 + 1]; z += Q[v * 3 + 2]; n++; }
        if (!n) continue; T[u * 3] = lerp(Q[u * 3], x / n, 0.5); T[u * 3 + 1] = lerp(Q[u * 3 + 1], yy / n, 0.5); T[u * 3 + 2] = lerp(Q[u * 3 + 2], z / n, 0.5); }
      Q.set(T);
      for (let u = 0; u < NU; u++) { if (!used[u]) continue; const d = (Q[u * 3] - P[u * 3]) * N[u * 3] + (Q[u * 3 + 1] - P[u * 3 + 1]) * N[u * 3 + 1] + (Q[u * 3 + 2] - P[u * 3 + 2]) * N[u * 3 + 2]; const m = E[u] * 0.75;
        if (d < m) for (let k = 0; k < 3; k++) Q[u * 3 + k] += N[u * 3 + k] * (m - d); } }
    // ragged edges that are not level hems (armholes, openings): smooth them along the boundary (1D Laplacian on the loop)
    { const adj = new Map(); for (let i = 0; i < bEdges.length; i += 2) { const a = bEdges[i], b = bEdges[i + 1]; if (!adj.has(a)) adj.set(a, []); if (!adj.has(b)) adj.set(b, []); adj.get(a).push(b); adj.get(b).push(a); }
      const free = [...adj.keys()].filter((u) => hemFor(u) == null && adj.get(u).length === 2);
      for (let it = 0; it < 4; it++) { const T2 = new Float32Array(free.length * 3); free.forEach((u, k) => { const [a, b] = adj.get(u); for (let c = 0; c < 3; c++) T2[k * 3 + c] = lerp(Q[u * 3 + c], (Q[a * 3 + c] + Q[b * 3 + c]) / 2, 0.5); }); free.forEach((u, k) => { for (let c = 0; c < 3; c++) Q[u * 3 + c] = T2[k * 3 + c]; }); } }
    if (post) post(Q, used, bnd);
    const QN = normalsOf(Q, tris, NU);
    const map = new Int32Array(NU).fill(-1);
    for (let u = 0; u < NU; u++) { if (!used[u]) continue; map[u] = sb.v([Q[u * 3], Q[u * 3 + 1], Q[u * 3 + 2]], [QN[u * 3], QN[u * 3 + 1], QN[u * 3 + 2]], colFn ? colFn(u, Q) : col, uv0, W[u]); }
    for (let t = 0; t < tris.length; t += 3) { if (Q[tris[t] * 3 + 1] > yTop + 0.004 && Q[tris[t + 1] * 3 + 1] > yTop + 0.004 && Q[tris[t + 2] * 3 + 1] > yTop + 0.004) continue; sb.idx.push(map[tris[t]], map[tris[t + 1]], map[tris[t + 2]]); }
    // turned-under hems: every open edge folds back towards the body (thickness at sleeve ends, the shirt tail, trouser cuffs)
    const hc = col.map((v) => v * 0.78);
    if (!lod) for (let i = 0; i < bEdges.length; i += 2) { const a = bEdges[i], b = bEdges[i + 1]; if (Q[a * 3 + 1] > yTop - 0.002 && Q[b * 3 + 1] > yTop - 0.002) continue;
      const ia = [], ib = []; for (const [u, arr] of [[a, ia], [b, ib]]) { const d = E[u] + 0.003; arr.push(sb.v([Q[u * 3] - N[u * 3] * d, Q[u * 3 + 1] - N[u * 3 + 1] * d, Q[u * 3 + 2] - N[u * 3 + 2] * d], [-N[u * 3], -N[u * 3 + 1], -N[u * 3 + 2]], hc, uv0, W[u])); }
      const oa = sb.v([Q[a * 3], Q[a * 3 + 1], Q[a * 3 + 2]], [0, -1, 0], hc, uv0, W[a]), ob = sb.v([Q[b * 3], Q[b * 3 + 1], Q[b * 3 + 2]], [0, -1, 0], hc, uv0, W[b]);
      sb.idx.push(ob, oa, ia[0], ob, ia[0], ib[0]); }
    return { Q, used, map, E };
  };
  // ---- legs: trousers / shorts / briefs (first: a tucked shirt sits inside the waistband)
  const legCol = PL.legs === 'briefs' ? C(sp.skirtCol || sp.bottom || '#333').map((v) => v * 0.7) : bottom;
  // straight-cut legs: per leg, per angular sector round the leg's own axis, from the seat down the cloth radius never
  // drops faster than TAPER per metre of drop, so the trouser falls from the seat / thigh past the knee and calf instead of
  // shrink-wrapping them (the copied body surface read as leggings). Only ever pushed outward.
  const legDrape = (Q, used) => {
    const DY = 0.02, Y1 = 0.8 * s, Y0 = Math.max(legHem, 0.05 * s), NYb = Math.ceil((Y1 - Y0) / DY) + 1, NA = 16, TAPER = PL.legs === 'trousers' ? 0.2 : 0.35; if (NYb < 3) return;
    for (const sx of [1, -1]) {
      const cx = new Float32Array(NYb), cz = new Float32Array(NYb), cn = new Float32Array(NYb);
      for (let u = 0; u < NU; u++) { if (!used[u] || legW[u] < 0.5 || Math.sign(P[u * 3]) !== sx) continue; const j = Math.round((Q[u * 3 + 1] - Y0) / DY); if (j < 0 || j >= NYb) continue; cx[j] += Q[u * 3]; cz[j] += Q[u * 3 + 2]; cn[j]++; }
      for (let j = 0; j < NYb; j++) if (cn[j]) { cx[j] /= cn[j]; cz[j] /= cn[j]; }
      { let lx = 0, lz = 0, ok = false; for (let j = NYb - 1; j >= 0; j--) { if (cn[j]) { lx = cx[j]; lz = cz[j]; ok = true; } else if (ok) { cx[j] = lx; cz[j] = lz; } } }
      const R = new Float32Array(NA * NYb).fill(-1); const pol = (u) => { const fy = clamp((Q[u * 3 + 1] - Y0) / DY, 0, NYb - 1.001), j = Math.floor(fy), t = fy - j; const ax = lerp(cx[j], cx[j + 1], t), az = lerp(cz[j], cz[j + 1], t); const dx = Q[u * 3] - ax, dz = Q[u * 3 + 2] - az; return [Math.hypot(dx, dz), ((Math.atan2(dz, dx) / (2 * Math.PI)) + 1) % 1, ax, az, fy]; };
      for (let u = 0; u < NU; u++) { if (!used[u] || legW[u] < 0.5 || Math.sign(P[u * 3]) !== sx) continue; const [r, a, , , fy] = pol(u); const j = Math.round(fy); const i = Math.floor(a * NA) % NA; if (r > R[j * NA + i]) R[j * NA + i] = r; }
      for (let i = 0; i < NA; i++) for (let j = NYb - 2; j >= 0; j--) { const up = R[(j + 1) * NA + i]; if (up > 0) R[j * NA + i] = Math.max(R[j * NA + i], up - TAPER * DY); }
      { const T2 = new Float32Array(R.length); for (let pass = 0; pass < 2; pass++) { for (let j = 0; j < NYb; j++) for (let i = 0; i < NA; i++) { let m = 0, n = 0; for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) { const jj = j + dj; if (jj < 0 || jj >= NYb) continue; const v = R[jj * NA + (i + di + NA) % NA]; if (v > 0) { const wt = (di ? 1 : 2) * (dj ? 1 : 2); m += v * wt; n += wt; } } T2[j * NA + i] = n ? m / n : -1; } R.set(T2); } } // smooth: a cloth tube, not the max of each bin
      // the inner side (towards the other leg) is capped so the two legs never meet
      for (let u = 0; u < NU; u++) { if (!used[u] || legW[u] < 0.5 || Math.sign(P[u * 3]) !== sx) continue; const [r, a, ax, az, fy] = pol(u); if (r < 1e-4) continue;
        const fa = a * NA, i = Math.floor(fa) % NA, i2 = (i + 1) % NA, j = Math.floor(fy); const g = (jj, ii) => R[Math.min(NYb - 1, jj) * NA + ii]; const tt = lerp(lerp(g(j, i), g(j, i2), fa - Math.floor(fa)), lerp(g(j + 1, i), g(j + 1, i2), fa - Math.floor(fa)), fy - j); if (!(tt > r)) continue;
        const w = sstep(Y1, Y1 - 0.12 * s, Q[u * 3 + 1]); let k = Math.min(lerp(r, tt, w), r + 0.016) / r; const nx = ax + (Q[u * 3] - ax) * k; if (Math.sign(nx) !== sx || Math.abs(nx) < 0.012) k = Math.max(1, (Math.abs(ax) - 0.012) / Math.max(1e-4, Math.abs(Q[u * 3] - ax)));
        Q[u * 3] = ax + (Q[u * 3] - ax) * k; Q[u * 3 + 2] = az + (Q[u * 3 + 2] - az) * k; } }
  };
  const tr = shell(trouserHas, trouserEase, legCol, (u) => (y(u) < 0.9 * s ? legHem : y(u) > 0.9 * s ? waistY : null), (Q, used) => {
    if (PL.legs !== 'briefs') { legDrape(Q, used); // then a short relax of the legs so the pushed-out cloth reads as one smooth tube
      const T = new Float32Array(Q); for (let it = 0; it < 2; it++) { for (let u = 0; u < NU; u++) { if (!used[u] || legW[u] < 0.5 || Q[u * 3 + 1] < legHem + 0.01) continue; let x = 0, yy = 0, z = 0, n = 0; for (const v of S.nb[u]) { if (!used[v]) continue; x += Q[v * 3]; yy += Q[v * 3 + 1]; z += Q[v * 3 + 2]; n++; } if (!n) continue; T[u * 3] = lerp(Q[u * 3], x / n, 0.5); T[u * 3 + 1] = lerp(Q[u * 3 + 1], yy / n, 0.5); T[u * 3 + 2] = lerp(Q[u * 3 + 2], z / n, 0.5); } Q.set(T); }
      for (let u = 0; u < NU; u++) { if (!used[u]) continue; const d = (Q[u * 3] - P[u * 3]) * N[u * 3] + (Q[u * 3 + 1] - P[u * 3 + 1]) * N[u * 3 + 1] + (Q[u * 3 + 2] - P[u * 3 + 2]) * N[u * 3 + 2]; const m = 0.006; if (d < m) for (let k = 0; k < 3; k++) Q[u * 3 + k] += N[u * 3 + k] * (m - d); } }
    if (!boots) return; // tucked into the boot shaft (Character.js boot loft)
    for (let u = 0; u < NU; u++) { if (!used[u] || Q[u * 3 + 1] > 0.215 * s) continue; const ft = ctx.J[P[u * 3] > 0 ? 'footL' : 'footR']; const dx = Q[u * 3] - ft[0], dz = Q[u * 3 + 2] + 0.008; const e = Math.hypot(dx / 0.042, dz / 0.046); if (e > 1) { Q[u * 3] = ft[0] + dx / e; Q[u * 3 + 2] = -0.008 + dz / e; } } });
  // ---- drape: the top hangs from the chest / shoulder blades instead of following the waist in
  const drape = (Q, used) => {
    const NA = 48, DY = 0.015, Y0 = shirtHem - 0.03, Y1 = 1.34 * s, NYb = Math.ceil((Y1 - Y0) / DY) + 1, TAPER = 0.3; if (NYb < 3) return;
    const czB = new Float32Array(NYb), zlo = new Float32Array(NYb).fill(1e9), zhi = new Float32Array(NYb).fill(-1e9);
    for (let u = 0; u < NU; u++) { if (armW[u] >= 0.5 || legW[u] >= 0.5) continue; const j = Math.round((y(u) - Y0) / DY); if (j < 0 || j >= NYb) continue; zlo[j] = Math.min(zlo[j], P[u * 3 + 2]); zhi[j] = Math.max(zhi[j], P[u * 3 + 2]); }
    for (let j = 0; j < NYb; j++) czB[j] = zhi[j] > zlo[j] ? (zlo[j] + zhi[j]) / 2 : NaN;
    { let last = 0; for (let j = NYb - 1; j >= 0; j--) { if (Number.isNaN(czB[j])) czB[j] = last; else last = czB[j]; } }
    const cz = (yy) => { const f = clamp((yy - Y0) / DY, 0, NYb - 1.001), j = Math.floor(f); return lerp(czB[j], czB[j + 1], f - j); };
    const R = new Float32Array(NA * NYb).fill(-1); const polar = (u) => { const yy = Q[u * 3 + 1], dz = Q[u * 3 + 2] - cz(yy), dx = Q[u * 3]; return [Math.hypot(dx, dz), (Math.atan2(dz, dx) / (2 * Math.PI) + 1) % 1, yy]; };
    for (let u = 0; u < NU; u++) { if (!used[u] || armW[u] >= 0.5) continue; const [r, a, yy] = polar(u); const j = Math.round((yy - Y0) / DY); if (j < 0 || j >= NYb) continue; const i = Math.floor(a * NA) % NA; if (r > R[j * NA + i]) R[j * NA + i] = r; }
    for (let i = 0; i < NA; i++) for (let j = NYb - 2; j >= 0; j--) { const up = R[(j + 1) * NA + i]; if (up > 0) R[j * NA + i] = Math.max(R[j * NA + i], up - TAPER * DY); }
    const Rs = new Float32Array(R.length); for (let j = 0; j < NYb; j++) for (let i = 0; i < NA; i++) { let m = 0, n = 0; for (let k = -2; k <= 2; k++) { const v = R[j * NA + (i + k + NA) % NA]; if (v > 0) { m += v * (3 - Math.abs(k)); n += 3 - Math.abs(k); } } Rs[j * NA + i] = n ? m / n : -1; }
    for (let u = 0; u < NU; u++) { if (!used[u] || armW[u] >= 0.5) continue; const [r, a, yy] = polar(u); const w = sstep(1.3 * s, 1.18 * s, yy) * (PL.tucked ? sstep(waistY + 0.01, waistY + 0.07, yy) : 1); if (w <= 0 || r < 1e-4) continue;
      const fy = clamp((yy - Y0) / DY, 0, NYb - 1.001), j = Math.floor(fy), fa = a * NA, i = Math.floor(fa) % NA, i2 = (i + 1) % NA;
      const g = (jj, ii) => Rs[jj * NA + ii]; const t = lerp(lerp(g(j, i), g(j, i2), fa - Math.floor(fa)), lerp(g(j + 1, i), g(j + 1, i2), fa - Math.floor(fa)), fy - j); if (!(t > r)) continue;
      const k = lerp(r, t, w) / r; const c0 = cz(yy); Q[u * 3] *= k; Q[u * 3 + 2] = c0 + (Q[u * 3 + 2] - c0) * k; }
  };
  // bust bridging: fabric spans across the chest instead of wrapping each breast (and the cleavage). Per 1.5 cm height band,
  // the FRONT of the cloth cross-section becomes its upper convex hull in (x, z); vertices are only ever pushed forward.
  const bridge = (Q, used) => {
    const DY = 0.015, Y0 = 1.08 * s, Y1 = 1.44 * s, NYb = Math.ceil((Y1 - Y0) / DY) + 1, BX = 0.012, NXb = 41, X0 = -BX * 20;
    const H = new Float32Array(NYb * NXb).fill(-1e9);
    for (let u = 0; u < NU; u++) { if (!used[u] || armW[u] >= 0.3 || N[u * 3 + 2] < 0.05) continue; const j = Math.round((Q[u * 3 + 1] - Y0) / DY), i = Math.round((Q[u * 3] - X0) / BX); if (j < 0 || j >= NYb || i < 0 || i >= NXb) continue; if (Q[u * 3 + 2] > H[j * NXb + i]) H[j * NXb + i] = Q[u * 3 + 2]; }
    const hull = new Float32Array(NYb * NXb).fill(-1e9);
    for (let j = 0; j < NYb; j++) { const pts = []; for (let i = 0; i < NXb; i++) if (H[j * NXb + i] > -1e8) pts.push([i, H[j * NXb + i]]); if (pts.length < 3) continue;
      const hu = []; for (const p of pts) { while (hu.length >= 2) { const a = hu[hu.length - 2], b = hu[hu.length - 1]; if ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]) >= 0) hu.pop(); else break; } hu.push(p); }
      for (let k = 0; k < hu.length - 1; k++) { const [i0, z0] = hu[k], [i1, z1] = hu[k + 1]; for (let i = i0; i <= i1; i++) hull[j * NXb + i] = z0 + (z1 - z0) * ((i - i0) / Math.max(1, i1 - i0)); } }
    const at = (x, yy) => { const fy = clamp((yy - Y0) / DY, 0, NYb - 1.001), fx = clamp((x - X0) / BX, 0, NXb - 1.001); const j = Math.floor(fy), i = Math.floor(fx); const g = (jj, ii) => hull[jj * NXb + ii]; const a = g(j, i), b = g(j, i + 1), c = g(j + 1, i), d = g(j + 1, i + 1); if (a < -1e8 || b < -1e8 || c < -1e8 || d < -1e8) return -1e9; return lerp(lerp(a, b, fx - i), lerp(c, d, fx - i), fy - j); };
    for (let u = 0; u < NU; u++) { if (!used[u] || armW[u] >= 0.3 || N[u * 3 + 2] < 0.2) continue; const yy = Q[u * 3 + 1]; if (yy < Y0 || yy > Y1) continue; const hz = at(Q[u * 3], yy); if (hz < -1e8) continue;
      const w = sstep(Y0, Y0 + 0.06 * s, yy) * sstep(Y1, Y1 - 0.06 * s, yy) * sstep(0.2, 0.5, N[u * 3 + 2]); if (hz > Q[u * 3 + 2]) Q[u * 3 + 2] = lerp(Q[u * 3 + 2], hz + 0.002, w); }
    // soften: two Laplacian passes on the front of the band, never pulling the cloth back towards the body
    const T = new Float32Array(Q); for (let it = 0; it < 2; it++) { for (let u = 0; u < NU; u++) { if (!used[u] || armW[u] >= 0.3 || N[u * 3 + 2] < 0.2) continue; const yy = Q[u * 3 + 1]; if (yy < Y0 || yy > Y1) continue; let x = 0, y2 = 0, z = 0, n = 0; for (const v of S.nb[u]) { if (!used[v]) continue; x += Q[v * 3]; y2 += Q[v * 3 + 1]; z += Q[v * 3 + 2]; n++; } if (!n) continue; T[u * 3] = lerp(Q[u * 3], x / n, 0.5); T[u * 3 + 1] = lerp(Q[u * 3 + 1], y2 / n, 0.5); T[u * 3 + 2] = Math.max(lerp(Q[u * 3 + 2], z / n, 0.5), P[u * 3 + 2] + 0.006); } Q.set(T); }
  };
  // jacket / hoodie: open front showing the shirt / tee under it (a V widening up the chest)
  const open = PL.jacket || sp.hood; const vY0 = (sp.hood ? 0.96 : 1.02) * s; const halfV = (yy) => (sp.hood ? 0.012 : 0.016) + sstep(vY0, 1.44 * s, yy) * (sp.hood ? 0.026 : 0.05);
  const jacketCol = null;
  // ---- top: neck conformed to the head's neck ellipse; the top edge a level line at yTop
  // the shirt / tee showing in the open front of a jacket or hoodie: a panel under it, a little larger than the opening
  const sh = shell(shirtHas, shirtEase, top, (u) => (armW[u] >= 0.5 ? sleeveY : y(u) < 1.25 * s ? shirtHem : null), (Q, used, bnd) => {
    if (sex === 'f') bridge(Q, used);
    drape(Q, used);
    for (let u = 0; u < NU; u++) { if (!used[u] || armW[u] >= 0.5) continue; const yy = Q[u * 3 + 1]; const t = sstep(yTop - 0.06, yTop - 0.004, yy); if (t <= 0) continue;
      const yc = Math.min(yy, yTop); const E0 = collarAt(yc); const m = 0.006; const rn = Math.hypot(Q[u * 3] / (E0.rx + m), (Q[u * 3 + 2] - E0.cz) / (E0.rz + m)); const tt = t * sstep(2.6, 1.6, rn); if (tt <= 0) continue;
      const a = Math.atan2((Q[u * 3 + 2] - E0.cz) / (E0.rz + m), Q[u * 3] / (E0.rx + m));
      Q[u * 3] = lerp(Q[u * 3], Math.cos(a) * (E0.rx + m), tt); Q[u * 3 + 2] = lerp(Q[u * 3 + 2], E0.cz + Math.sin(a) * (E0.rz + m), tt); Q[u * 3 + 1] = Math.min(yy, yTop); } }, jacketCol);
  // ---- skin: everything not deeply covered (2.5 cm past every garment edge stays, so no gap shows into a sleeve or collar)
  const coveredTorso = (u) => y(u) >= shirtHem + 0.025;
  const coveredLeg = (u) => y(u) <= waistY - 0.02 && y(u) >= legHem + 0.03;
  const hidden = (u) => {
    if (armW[u] >= 0.5) return PL.sleeve !== 'none' && handW[u] < 0.5 && y(u) >= sleeveY + 0.03;
    if (y(u) < footCut) return true;
    if (legW[u] < 0.5) return coveredTorso(u) || coveredLeg(u);
    return coveredLeg(u);
  };
  const glove = sp.gloves ? C(sp.gloves) : null;
  const bmap = new Int32Array(NU).fill(-1); const nailC = skin.map((v, i) => Math.min(1, v * 1.32 + [0.08, 0.05, 0.05][i]));
  const bodyTris = []; for (let t = 0; t < S.idx.length; t += 3) { const a = S.idx[t], b = S.idx[t + 1], c = S.idx[t + 2]; if (hidden(a) && hidden(b) && hidden(c)) continue; if (y(a) > cutY - 0.001 && y(b) > cutY - 0.001 && y(c) > cutY - 0.001) continue; bodyTris.push(a, b, c); }
  for (const u of bodyTris) { if (bmap[u] >= 0) continue; const gl = glove && armW[u] >= 0.5 && (handW[u] >= 0.35 || y(u) < 0.905 * s); const nl = S.nail[u] / 255;
    const col = gl ? glove : nl > 0 ? skin.map((v, i) => lerp(v, nailC[i], nl)) : skin;
    bmap[u] = sb.v([P[u * 3], P[u * 3 + 1], P[u * 3 + 2]], [N[u * 3], N[u * 3 + 1], N[u * 3 + 2]], col, uv0, W[u]); }
  for (const u of bodyTris) sb.idx.push(bmap[u]);
  // ---- surface queries for everything built on top (belts, pockets, plackets, straps, vests, skirts, scarves)
  const out = {};
  const torsoPt = [];
  for (let u = 0; u < NU; u++) { if (armW[u] >= 0.5 || (legW[u] >= 0.5 && P[u * 3 + 1] < 0.86 * s)) continue; const Qs = sh.used[u] && (y(u) >= (PL.tucked ? 0.975 : PL.hem) * s) ? sh.Q : tr.used[u] ? tr.Q : sh.used[u] ? sh.Q : P; torsoPt.push(Qs[u * 3], Qs[u * 3 + 1], Qs[u * 3 + 2]); }
  const ringCache = new Map();
  out.ringAt = (yq) => { const key = Math.round(yq * 500); if (ringCache.has(key)) return ringCache.get(key); let band = 0.015, r = null;
    for (let tries = 0; tries < 4 && !r; tries++, band *= 1.8) { let xm = 0, z0 = 1e9, z1 = -1e9; const pts = [];
      for (let i = 0; i < torsoPt.length; i += 3) { if (Math.abs(torsoPt[i + 1] - yq) > band) continue; xm = Math.max(xm, Math.abs(torsoPt[i])); z0 = Math.min(z0, torsoPt[i + 2]); z1 = Math.max(z1, torsoPt[i + 2]); pts.push(torsoPt[i], torsoPt[i + 2]); }
      if (pts.length < 8) continue; const c = { cz: (z0 + z1) / 2, rx: xm, rz: (z1 - z0) / 2 }; let e = 1; for (let j = 0; j < pts.length; j += 2) e = Math.max(e, Math.hypot(pts[j] / c.rx, (pts[j + 1] - c.cz) / c.rz)); c.rx *= Math.min(e, 1.12); c.rz *= Math.min(e, 1.12); r = c; }
    r = r || { cz: 0, rx: 0.15 * s, rz: 0.1 * s }; ringCache.set(key, r); return r; };
  // front / back cloth height field on a 1.5 cm grid (rasterised outer-layer triangles), for strips laid on the surface
  const GX0 = -0.36, GY0 = 0.7 * s, GD = 0.015, NX = 49, NY = Math.ceil((1.62 * s - GY0) / GD) + 1; const FR = new Float32Array(NX * NY).fill(-1e9), BK = new Float32Array(NX * NY).fill(1e9);
  const raster = (Q, used, keep) => { for (let t = 0; t < S.idx.length; t += 3) { const a = S.idx[t], b = S.idx[t + 1], c = S.idx[t + 2]; if (!used[a] || !used[b] || !used[c] || !keep(a) || !keep(b) || !keep(c)) continue;
      const ax = Q[a * 3], ay = Q[a * 3 + 1], az = Q[a * 3 + 2], bx = Q[b * 3], by = Q[b * 3 + 1], bz = Q[b * 3 + 2], cx = Q[c * 3], cy = Q[c * 3 + 1], cz = Q[c * 3 + 2];
      const i0 = Math.max(0, Math.floor((Math.min(ax, bx, cx) - GX0) / GD)), i1 = Math.min(NX - 1, Math.ceil((Math.max(ax, bx, cx) - GX0) / GD)), j0 = Math.max(0, Math.floor((Math.min(ay, by, cy) - GY0) / GD)), j1 = Math.min(NY - 1, Math.ceil((Math.max(ay, by, cy) - GY0) / GD));
      const den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy); if (Math.abs(den) < 1e-12) continue;
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const px = GX0 + i * GD, py = GY0 + j * GD; const l1 = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / den, l2 = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / den, l3 = 1 - l1 - l2;
        if (l1 < -0.02 || l2 < -0.02 || l3 < -0.02) continue; const z = l1 * az + l2 * bz + l3 * cz; const g = j * NX + i; if (z > FR[g]) FR[g] = z; if (z < BK[g]) BK[g] = z; } } };
  const allP = new Uint8Array(NU).fill(1);
  raster(P, allP, (u) => armW[u] < 0.5 && legW[u] < 0.5); raster(sh.Q, sh.used, (u) => armW[u] < 0.5); raster(tr.Q, tr.used, (u) => y(u) > 0.7 * s);
  // conservative: each cell takes the outermost value of its 3 × 3 neighbourhood, so straps, cords, lanyards and panels laid
  // on the field with a few cm between samples never dip under a curved (chest / bust / flank) cloth surface between them
  for (const [A, sg] of [[FR, 1], [BK, -1]]) { const T = A.slice(); for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) { let m = T[j * NX + i]; for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const jj = j + dj, ii = i + di; if (jj < 0 || ii < 0 || jj >= NY || ii >= NX) continue; const v = T[jj * NX + ii]; if (sg > 0 ? v > m && v > -1e8 : v < m && v < 1e8) m = v; } A[j * NX + i] = m; } }
  out.surfZ = (yq, xq, sgn) => { const fx = clamp((xq - GX0) / GD, 0, NX - 1.001), fy = clamp((yq - GY0) / GD, 0, NY - 1.001); const i = Math.floor(fx), j = Math.floor(fy); const A = sgn > 0 ? FR : BK; const bad = sgn > 0 ? -1e8 : 1e8;
    let acc = 0, ws = 0; for (const [di, dj, w] of [[0, 0, (1 - (fx - i)) * (1 - (fy - j))], [1, 0, (fx - i) * (1 - (fy - j))], [0, 1, (1 - (fx - i)) * (fy - j)], [1, 1, (fx - i) * (fy - j)]]) { const v = A[(j + dj) * NX + i + di]; if (sgn > 0 ? v > bad : v < bad) { acc += v * w; ws += w; } }
    if (ws > 0.05) return acc / ws; const r = out.ringAt(yq); const q = clamp(Math.abs(xq) / r.rx, 0, 0.98); return r.cz + sgn * r.rz * Math.sqrt(1 - q * q); };
  out.wrist = (side, yq) => { const sx = side === 'L' ? 1 : -1; let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9, n = 0;
    for (let u = 0; u < NU; u++) { if (armW[u] < 0.5 || Math.sign(P[u * 3]) !== sx) continue; const Qs = sh.used[u] ? sh.Q : P; if (Math.abs(Qs[u * 3 + 1] - yq) > 0.012) continue; x0 = Math.min(x0, Qs[u * 3]); x1 = Math.max(x1, Qs[u * 3]); z0 = Math.min(z0, Qs[u * 3 + 2]); z1 = Math.max(z1, Qs[u * 3 + 2]); n++; }
    return n ? { c: [(x0 + x1) / 2, yq, (z0 + z1) / 2], rx: (x1 - x0) / 2, rz: (z1 - z0) / 2 } : null; };
  // ---- open front of a jacket / hoodie: the shirt / tee panel showing in a clean V, and raised lapels (jacket) or a zip
  // placket (hoodie) along both edges — laid on the jacket's surface (front height field), like the waistcoat lapels
  if (open) { const ic = C(sp.inner || '#d8d4cc'); const tw = (yy) => (yy > 1.25 * s ? [[B.chest, 1]] : [[B.chest, 0.6], [B.spine, 0.4]]); const y1 = Math.min(yTop - 0.004, 1.43 * s); const NR = lod ? 6 : 16;
    { const Pg = [], Ng = [], Wg = []; for (let r = 0; r <= NR; r++) { const yy = lerp(vY0, y1, r / NR); const hv = halfV(yy); const row = [], nr = [], wr = []; for (let c = 0; c <= 4; c++) { const x = lerp(-hv, hv, c / 4); row.push([x, yy, out.surfZ(yy, x, 1) + 0.0025]); nr.push([0, 0, 1]); wr.push(tw(yy)); } Pg.push(row); Ng.push(nr); Wg.push(wr); }
      sb.grid(Pg, Ng, Wg, ic, ic.map((v) => v * 0.8)); }
    const lc = top.map((v) => v * (sp.hood ? 0.8 : 0.92)); const wd = sp.hood ? 0.008 : 0.028;
    for (const sx of [-1, 1]) { const Pg = [], Ng = [], Wg = []; for (let r = 0; r <= NR; r++) { const t = r / NR; const yy = lerp(vY0 - (sp.hood ? 0.02 : 0.01), y1, t); const x0 = sx * halfV(yy); const w = wd * (sp.hood ? 1 : lerp(0.35, 1, sstep(0, 0.6, t)));
        const cols = [[0, 0.0042], [0.5, 0.0036], [1, 0.0016]].map(([k, dz]) => { const x = x0 + sx * w * k; return [x, yy, out.surfZ(yy, x, 1) + dz]; });
        Pg.push(sx > 0 ? cols : cols.slice().reverse()); Ng.push([[0, 0.05, 1], [0, 0.05, 1], [0, 0.05, 1]]); Wg.push([tw(yy), tw(yy), tw(yy)]); }
      sb.grid(Pg, Ng, Wg, lc, lc.map((v) => v * 0.75)); } }
  // ---- collar leaf (dress / uniform shirts, polos): the shell's top is the stand round the neck; the leaf folds down over it
  // and out over the shoulders to two points at the front
  const collarOn = sp.collar && PL.o !== 'jacket' && PL.sleeve !== undefined;
  // top-down height field of the shirt (shoulders / collar line): collar fitting and draped pieces (saree pallu) use it
  const TG = 0.012, T0 = -0.24, TN = 41; const TOPH = new Float32Array(TN * TN).fill(-1e9);
  for (let u = 0; u < NU; u++) { if (!sh.used[u] || armW[u] >= 0.5) continue; const qx = sh.Q[u * 3], qy = sh.Q[u * 3 + 1], qz = sh.Q[u * 3 + 2]; const i = Math.round((qx - T0) / TG), j = Math.round((qz - T0) / TG);
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) { const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= TN || jj >= TN) continue; const g = jj * TN + ii; if (qy > TOPH[g]) TOPH[g] = qy; } }
  const topAt = (x, z) => { const i = Math.round((x - T0) / TG), j = Math.round((z - T0) / TG); return i < 0 || j < 0 || i >= TN || j >= TN ? -1e9 : TOPH[j * TN + i]; };
  out.topY = topAt;
  if (collarOn) {
    const C0 = collarAt(yTop - 0.012), cz0 = C0.cz; const polo = PL.o === 'polo'; const gap = polo ? 0.3 : 0.17, NC = lod ? 12 : 24; const cw = (t) => [[B.chest, 1 - t], [B.neck, t]];
    const rows = [[0.0015, 0.0078, 0, 0.45], [-0.012, 0.0125, 0.4, 0.25], [-0.03, 0.019, 1, 0.08]];
    const Pg = [], Ng = [], Wg = [];
    rows.forEach(([dy, m, k, nw], ri) => { const row = [], nr = [], wr = [];
      for (let ci = 0; ci <= NC; ci++) { const t = ci / NC; const a = Math.PI / 2 + gap + t * (2 * Math.PI - 2 * gap); const ca = Math.cos(a), sa = Math.sin(a);
        const pt = sstep(0.13, 0.0, Math.min(t, 1 - t)) * k * (polo ? 0.6 : 1);
        let x = ca * (C0.rx + m + 0.01 * pt) + Math.sign(ca) * 0.024 * pt, z = cz0 + sa * (C0.rz + m + 0.01 * pt), yy = yTop + dy - 0.032 * pt;
        if (ri > 0) { yy = Math.max(yy, topAt(x, z) + 0.004); if (sa > 0.2) z = Math.max(z, out.surfZ(yy, x, 1) + 0.0035); else if (sa < -0.2) z = Math.min(z, out.surfZ(yy, x, -1) - 0.0035); }
        row.push([x, yy, z]); nr.push([ca, ri ? 0.7 : 0.15, sa]); wr.push(cw(nw)); }
      Pg.push(row); Ng.push(nr); Wg.push(wr); });
    sb.grid(Pg, Ng, Wg, top, top.map((v) => v * 0.8));
    // necktie (office shirts): knot in the collar gap, blade down the shirt front
    if (sp.tie) { const tc = C(sp.tie); const zS = (yy, x) => out.surfZ(yy, x, 1); const ky = yTop - 0.013; const kf = Math.max(zS(ky, 0), cz0 + C0.rz + 0.006) + 0.003;
      const kt = 0.018, kb = 0.011, kh = 0.028; const quad = (c, w) => { const f = [[0, 1, 2, 3], [5, 4, 7, 6], [4, 0, 3, 7], [1, 5, 6, 2], [3, 2, 6, 7], [4, 5, 1, 0]];
        for (const q of f) { const A = c[q[0]], Bq = c[q[1]], Cq = c[q[2]]; const ux = Bq[0] - A[0], uy = Bq[1] - A[1], uz = Bq[2] - A[2], vx = Cq[0] - A[0], vy = Cq[1] - A[1], vz = Cq[2] - A[2]; const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, l = Math.hypot(nx, ny, nz) || 1;
          const i = q.map((k) => sb.v(c[k], [nx / l, ny / l, nz / l], tc, uv0, w)); sb.idx.push(i[0], i[1], i[2], i[0], i[2], i[3]); } };
      quad([[-kb, ky - kh / 2, kf], [kb, ky - kh / 2, kf], [kt, ky + kh / 2, kf - 0.004], [-kt, ky + kh / 2, kf - 0.004], [-kb, ky - kh / 2, kf - 0.012], [kb, ky - kh / 2, kf - 0.012], [kt, ky + kh / 2, kf - 0.016], [-kt, ky + kh / 2, kf - 0.016]], cw(0.3));
      const ya = ky - kh / 2 + 0.004, yb = 1.1 * s, NR = lod ? 4 : 8; const Pt = [], Nt = [], Wt = [];
      for (let r = 0; r <= NR; r++) { const t = r / NR; const yy = lerp(ya, yb, t); const hw = lerp(0.011, 0.037, sstep(0, 0.75, t)) * (t > 0.9 ? 1 - (t - 0.9) * 5 : 1); const zc = zS(yy, 0) + 0.0028 + 0.004 * (1 - t);
        Pt.push([[-hw, yy, Math.max(zc, zS(yy, -hw) + 0.0025)], [hw, yy, Math.max(zc, zS(yy, hw) + 0.0025)]]); Nt.push([[0, 0.1, 1], [0, 0.1, 1]]); Wt.push(yy > 1.2 * s ? cw(0) : [[B.chest, 0.7], [B.spine, 0.3]]); }
      Pt.push([[0, yb - 0.032, zS(yb - 0.032, 0) + 0.0026], [0, yb - 0.032, zS(yb - 0.032, 0) + 0.0026]]); Nt.push([[0, 0.1, 1], [0, 0.1, 1]]); Wt.push([[B.chest, 0.7], [B.spine, 0.3]]);
      sb.grid(Pt, Nt, Wt, tc, tc.map((v) => v * 0.7)); }
  }
  out.feetBare = sandals; out.yTop = yTop; out.plan = PL;
  out.stats = { shirt: sh.used.reduce((a, b) => a + b, 0), trousers: tr.used.reduce((a, b) => a + b, 0), skinTris: bodyTris.length / 3 };
  return out;
}
