// Protagonist bodies (Dineth, Shashika, David): one continuous anatomical body (heroBodyData.js, baked from the CC0
// MakeHuman base mesh by tools/mh/bake-hero-bodies.mjs and FITTED to the existing 70-bone hero skeleton) with the clothes
// grown from it as real garment shells instead of elliptical tubes:
//   • shirt / tee and trousers are offset copies of the body surface (ease per region: fitted chest, looser sleeve hems,
//     straight-cut trouser legs), relaxed with a few Laplacian passes so the cloth bridges hollows (no painted-on abs),
//     then pushed back out to a minimum ease so nothing ever sinks into the skin;
//   • hems are snapped to clean horizontal lines and turned under (a hem strip folding back towards the body), so sleeve
//     ends, the shirt tail and trouser cuffs have thickness instead of a paper edge;
//   • the shirt neck conforms to the baked head's neck (HeroHead.js collar ellipse), so collars and crew necks meet it;
//   • skin under clothing is removed (nothing to poke through), the rest — neck base, arms, real hands with knuckles,
//     fingers and nails — is the anatomical surface with the protagonists' skin shading.
// Shading detail is procedural on the GPU (clothShader): woven cotton / denim twill / suiting micro-relief faded by pixel
// footprint, compression folds at the waist, elbows, knees and the trouser stack over the shoes, side / in / out seams with
// stitching, denim wear, a cotton rim sheen; on the skin, forearm and hand veins, pores and tone variation.
import * as THREE from 'three';
import DATA from './heroBodyData.js';

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const dec = (s, T) => { const bin = atob(s); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); return new T(u8.buffer); };

export const hasHeroBody = (sp) => !globalThis.__NO_HERO_BODY && !!(sp && sp.hero && sp.mh && DATA.heroes && DATA.heroes[sp.mh]); // (__NO_HERO_BODY: tests comparing against the old procedural body)

let SHARED = null;
function shared() {
  if (SHARED) return SHARED;
  const NU = DATA.nu; const idx = dec(DATA.idx, Uint16Array); const si = dec(DATA.skinIndex, Uint8Array), sw = dec(DATA.skinWeight, Uint8Array); const nail = dec(DATA.nail, Uint8Array);
  const nb = Array.from({ length: NU }, () => new Set()); for (let t = 0; t < idx.length; t += 3) for (let k = 0; k < 3; k++) { const a = idx[t + k], b = idx[t + (k + 1) % 3]; nb[a].add(b); nb[b].add(a); }
  SHARED = { NU, idx, si, sw, nail, nb: nb.map((s) => Int32Array.from(s)), bones: DATA.bones }; return SHARED;
}
const BASE = new Map();
function base(sp) {
  if (BASE.has(sp.mh)) return BASE.get(sp.mh);
  const S = shared(), H = DATA.heroes[sp.mh]; const p16 = dec(H.pos, Int16Array); const P = new Float32Array(S.NU * 3); for (let i = 0; i < P.length; i++) P[i] = p16[i] * H.q;
  const b = { P, N: normalsOf(P, S.idx, S.NU) }; BASE.set(sp.mh, b); return b;
}
function normalsOf(P, idx, n) {
  const N = new Float32Array(n * 3);
  for (let t = 0; t < idx.length; t += 3) { const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; for (const o of [a, b, c]) { N[o] += nx; N[o + 1] += ny; N[o + 2] += nz; } }
  for (let i = 0; i < n; i++) { const l = Math.hypot(N[i * 3], N[i * 3 + 1], N[i * 3 + 2]) || 1; N[i * 3] /= l; N[i * 3 + 1] /= l; N[i * 3 + 2] /= l; }
  return N;
}

// garment ids (aCloth.x): 1 shirt body, 3 shirt sleeve, 2 trousers, 4 skin, 0 everything else (accessories, shoes…)
export const CLOTH = { SHIRT: 1, TROUSERS: 2, SLEEVE: 3, SKIN: 4 };

/**
 * Emit the body + garment shells into the SkinBuilder. ctx: { B (bone name → index), J, NK (heroHeadFit), C (hex → linear rgb) }.
 * Returns { ringAt(y) → {rx, rz, cz}, surfZ(y, x, sgn), wrist(side, y) → {c, rx, rz} }.
 */
export function buildHeroGarments(sb, sp, ctx) {
  const S = shared(), Bd = base(sp); const { B, J, NK, C } = ctx; const NU = S.NU; const P = Bd.P, N = Bd.N;
  const s = sp.height / 1.72;
  const skin = C(sp.skin), top = C(sp.top), bottom = C(sp.bottom); const glove = sp.tacGloves ? C(sp.tacGloves) : null;
  const open = sp.kit === 'openShirt'; const longSleeve = !!sp.longSleeve; const boots = !!sp.boots;
  // ---- per-vertex weights → game bones, body part shares
  const W = new Array(NU), armW = new Float32Array(NU), handW = new Float32Array(NU), legW = new Float32Array(NU);
  for (let u = 0; u < NU; u++) { const L = []; for (let k = 0; k < 4; k++) { const w = S.sw[u * 4 + k] / 255; if (w <= 0) continue; const nm = S.bones[S.si[u * 4 + k]]; L.push([B[nm], w]);
      if (/^(arm|fore|hand|armTwist|foreTwist|idx|mid|rng|pnk|thb)/.test(nm)) armW[u] += w; if (/^(hand|idx|mid|rng|pnk|thb)/.test(nm)) handW[u] += w; if (/^(thigh|shin|foot|toe)/.test(nm)) legW[u] += w; }
    W[u] = L; }
  const y = (u) => P[u * 3 + 1];
  // ---- garment extents (model space)
  const cutY = NK.cutY; const yTop = open ? cutY + 0.034 : Math.max(cutY + 0.03, 1.5 * s);
  const shirtHem = (open ? 0.985 : 0.972) * s; const sleeveY = (longSleeve ? 0.905 : 1.205) * s; const waistY = 0.997 * s; const hemY = (boots ? 0.165 : 0.093) * s;
  const torso = (u) => armW[u] < 0.5 && legW[u] < 0.5;
  const shirtHas = (u, tol) => (armW[u] >= 0.5 ? handW[u] < 0.5 && y(u) >= sleeveY - tol : legW[u] < 0.5 && y(u) >= shirtHem - tol);
  const trouserHas = (u, tol) => armW[u] < 0.5 && y(u) <= waistY + tol && y(u) >= hemY - tol;
  // ---- ease (offset along the body normal)
  const shirtEase = (u) => { if (armW[u] >= 0.5) return longSleeve ? lerp(0.006, 0.011, sstep(0.95 * s, 1.15 * s, y(u))) : 0.009 + 0.013 * sstep(1.33 * s, 1.215 * s, y(u));
    return 0.0075 + 0.004 * sstep(1.1 * s, 1.0 * s, y(u)) * (open ? 1.3 : 1); };
  const trouserEase = (u) => { const yy = y(u); if (boots && yy < 0.26 * s) return lerp(0.002, 0.008, sstep(0.17 * s, 0.26 * s, yy));
    return 0.0065 + 0.0035 * sstep(0.85 * s, 0.7 * s, yy) + 0.012 * sstep(0.5 * s, 0.18 * s, yy) - 0.002 * sstep(0.93 * s, 0.99 * s, yy); };
  const uv0 = [0.01, 0.51];
  const out = {};
  // ---- one garment shell
  const shell = (has, ease, id, col, hemFor, post) => {
    const inG = new Uint8Array(NU); for (let u = 0; u < NU; u++) inG[u] = has(u, 0.013) ? 1 : 0;
    const tris = []; for (let t = 0; t < S.idx.length; t += 3) { const a = S.idx[t], b = S.idx[t + 1], c = S.idx[t + 2]; if (inG[a] && inG[b] && inG[c]) tris.push(a, b, c); }
    const used = new Uint8Array(NU); for (const v of tris) used[v] = 1;
    const edge = new Map(); for (let t = 0; t < tris.length; t += 3) for (let k = 0; k < 3; k++) { const a = tris[t + k], b = tris[t + (k + 1) % 3]; const key = a < b ? a * 65536 + b : b * 65536 + a; edge.set(key, (edge.get(key) || 0) + 1); }
    const bnd = new Uint8Array(NU); const bEdges = [];
    for (let t = 0; t < tris.length; t += 3) for (let k = 0; k < 3; k++) { const a = tris[t + k], b = tris[t + (k + 1) % 3]; const key = a < b ? a * 65536 + b : b * 65536 + a; if (edge.get(key) === 1) { bnd[a] = bnd[b] = 1; bEdges.push(a, b); } }
    const Q = new Float32Array(NU * 3), E = new Float32Array(NU);
    for (let u = 0; u < NU; u++) { if (!used[u]) continue; const e = ease(u); E[u] = e; for (let k = 0; k < 3; k++) Q[u * 3 + k] = P[u * 3 + k] + N[u * 3 + k] * e;
      if (bnd[u]) { const hy = hemFor(u); if (hy != null) Q[u * 3 + 1] = hy; } }
    // relax (interior only), then restore a minimum ease
    const T = new Float32Array(NU * 3);
    for (let it = 0; it < 4; it++) { T.set(Q);
      for (let u = 0; u < NU; u++) { if (!used[u] || bnd[u]) continue; let x = 0, yy = 0, z = 0, n = 0; for (const v of S.nb[u]) { if (!used[v]) continue; x += Q[v * 3]; yy += Q[v * 3 + 1]; z += Q[v * 3 + 2]; n++; }
        if (!n) continue; T[u * 3] = lerp(Q[u * 3], x / n, 0.55); T[u * 3 + 1] = lerp(Q[u * 3 + 1], yy / n, 0.55); T[u * 3 + 2] = lerp(Q[u * 3 + 2], z / n, 0.55); }
      Q.set(T);
      for (let u = 0; u < NU; u++) { if (!used[u]) continue; const d = (Q[u * 3] - P[u * 3]) * N[u * 3] + (Q[u * 3 + 1] - P[u * 3 + 1]) * N[u * 3 + 1] + (Q[u * 3 + 2] - P[u * 3 + 2]) * N[u * 3 + 2]; const m = E[u] * 0.7;
        if (d < m) for (let k = 0; k < 3; k++) Q[u * 3 + k] += N[u * 3 + k] * (m - d); } }
    if (post) post(Q, used);
    const QN = normalsOf(Q, tris, NU);
    const map = new Int32Array(NU).fill(-1);
    for (let u = 0; u < NU; u++) { if (!used[u]) continue; const sid = id === CLOTH.SHIRT && armW[u] >= 0.5 ? CLOTH.SLEEVE : id; sb.clv = [sid, 0];
      map[u] = sb.v([Q[u * 3], Q[u * 3 + 1], Q[u * 3 + 2]], [QN[u * 3], QN[u * 3 + 1], QN[u * 3 + 2]], col, uv0, W[u]); }
    for (let t = 0; t < tris.length; t += 3) { const a = map[tris[t]], b = map[tris[t + 1]], c = map[tris[t + 2]]; if (Q[tris[t] * 3 + 1] > yTop + 0.004 && Q[tris[t + 1] * 3 + 1] > yTop + 0.004 && Q[tris[t + 2] * 3 + 1] > yTop + 0.004) continue; sb.idx.push(a, b, c); }
    // turned-under hems: every open edge folds back towards the body by the local ease (+3 mm), slightly darker
    const hc = col.map((v) => v * 0.78);
    for (let i = 0; i < bEdges.length; i += 2) { const a = bEdges[i], b = bEdges[i + 1]; if (Q[a * 3 + 1] > yTop - 0.002 && Q[b * 3 + 1] > yTop - 0.002) continue;
      const ia = [], ib = []; for (const [u, arr] of [[a, ia], [b, ib]]) { const d = E[u] + 0.003; sb.clv = [0, 0]; arr.push(sb.v([Q[u * 3] - N[u * 3] * d, Q[u * 3 + 1] - N[u * 3 + 1] * d, Q[u * 3 + 2] - N[u * 3 + 2] * d], [-N[u * 3], -N[u * 3 + 1], -N[u * 3 + 2]], hc, uv0, W[u])); }
      sb.clv = [0, 0]; const oa = sb.v([Q[a * 3], Q[a * 3 + 1], Q[a * 3 + 2]], [0, -1, 0], hc, uv0, W[a]), ob = sb.v([Q[b * 3], Q[b * 3 + 1], Q[b * 3 + 2]], [0, -1, 0], hc, uv0, W[b]);
      sb.idx.push(ob, oa, ia[0], ob, ia[0], ib[0]); }
    sb.clv = [0, 0];
    return { Q, used, map };
  };
  // ---- trousers (first: the tucked shirt sits inside the waistband)
  const tr = shell(trouserHas, trouserEase, CLOTH.TROUSERS, bottom, (u) => (y(u) < 0.5 * s ? hemY : y(u) > 0.9 * s ? waistY : null), (Q, used) => {
    if (!boots) return; // tucked into the boot shaft (Character.js boot loft: centre [foot x, −0.008], 4.5 × 4.9 cm)
    for (let u = 0; u < NU; u++) { if (!used[u] || Q[u * 3 + 1] > 0.215 * s) continue; const ft = J[P[u * 3] > 0 ? 'footL' : 'footR']; const dx = Q[u * 3] - ft[0], dz = Q[u * 3 + 2] + 0.008; const e = Math.hypot(dx / 0.042, dz / 0.046); if (e > 1) { Q[u * 3] = ft[0] + dx / e; Q[u * 3 + 2] = -0.008 + dz / e; } } });
  // ---- shirt / tee: neck conformed to the head's collar ellipse; the top edge is a level line at yTop
  const sh = shell(shirtHas, shirtEase, CLOTH.SHIRT, top, (u) => (armW[u] >= 0.5 ? sleeveY : y(u) < 1.2 * s ? shirtHem : null), (Q, used) => {
    for (let u = 0; u < NU; u++) { if (!used[u] || armW[u] >= 0.5) continue; const yy = Q[u * 3 + 1]; const t = sstep(cutY - 0.045, cutY + 0.004, yy); if (t <= 0) continue;
      const yc = Math.min(yy, yTop); const E0 = NK.collarAt(yc + 0.012); const m = 0.006; const a = Math.atan2((Q[u * 3 + 2] - E0.cz) / (E0.rz + m), Q[u * 3] / (E0.rx + m));
      const tx = Math.cos(a) * (E0.rx + m), tz = E0.cz + Math.sin(a) * (E0.rz + m); Q[u * 3] = lerp(Q[u * 3], tx, t); Q[u * 3 + 2] = lerp(Q[u * 3 + 2], tz, t); Q[u * 3 + 1] = Math.min(yy, yTop); } });
  // ---- skin: everything not deeply covered (2.5 cm past every garment edge stays, so no gap shows into a sleeve or collar)
  const hidden = (u) => (armW[u] >= 0.5 ? handW[u] < 0.5 && y(u) >= sleeveY + 0.03 : legW[u] < 0.5 ? y(u) >= shirtHem + 0.025 || (y(u) <= waistY - 0.02 && y(u) >= hemY) : y(u) <= waistY - 0.02 && y(u) >= hemY + 0.03) || (armW[u] < 0.5 && y(u) < hemY + 0.03);
  const bmap = new Int32Array(NU).fill(-1); const nailC = skin.map((v, i) => Math.min(1, v * 1.32 + [0.08, 0.05, 0.05][i]));
  const bodyTris = []; for (let t = 0; t < S.idx.length; t += 3) { const a = S.idx[t], b = S.idx[t + 1], c = S.idx[t + 2]; if (hidden(a) && hidden(b) && hidden(c)) continue; if (y(a) > cutY && y(b) > cutY && y(c) > cutY) continue; bodyTris.push(a, b, c); }
  for (const u of bodyTris) { if (bmap[u] >= 0) continue; const gl = glove && armW[u] >= 0.5 && (handW[u] >= 0.35 || y(u) < 0.905 * s); const nl = S.nail[u] / 255;
    const col = gl ? glove : nl > 0 ? skin.map((v, i) => lerp(v, nailC[i], nl)) : skin; sb.clv = [gl ? 0 : CLOTH.SKIN, 0];
    bmap[u] = sb.v([P[u * 3], Math.min(P[u * 3 + 1], cutY - 0.001), P[u * 3 + 2]], [N[u * 3], N[u * 3 + 1], N[u * 3 + 2]], col, uv0, W[u]); }
  for (const u of bodyTris) sb.idx.push(bmap[u]);
  sb.clv = [0, 0];
  // ---- surface queries for the accessories built on top (plackets, pockets, belt, vest, waistcoat, shirt tail)
  const torsoPt = []; // [x, y, z] of the outermost torso layer
  for (let u = 0; u < NU; u++) { if (armW[u] >= 0.5 || legW[u] >= 0.5 && P[u * 3 + 1] < 0.86 * s) continue; const Qs = sh.used[u] && y(u) >= (open ? 0.99 : 0.975) * s ? sh.Q : tr.used[u] ? tr.Q : sh.used[u] ? sh.Q : null; if (!Qs) continue; torsoPt.push(Qs[u * 3], Qs[u * 3 + 1], Qs[u * 3 + 2]); }
  const ringCache = new Map();
  out.ringAt = (yq) => { const key = Math.round(yq * 500); if (ringCache.has(key)) return ringCache.get(key); let band = 0.012, r = null;
    for (let tries = 0; tries < 4 && !r; tries++, band *= 1.8) { let xm = 0, z0 = 1e9, z1 = -1e9; const pts = [];
      for (let i = 0; i < torsoPt.length; i += 3) { if (Math.abs(torsoPt[i + 1] - yq) > band) continue; xm = Math.max(xm, Math.abs(torsoPt[i])); z0 = Math.min(z0, torsoPt[i + 2]); z1 = Math.max(z1, torsoPt[i + 2]); pts.push(torsoPt[i], torsoPt[i + 2]); }
      if (pts.length < 8) continue; const c = { cz: (z0 + z1) / 2, rx: xm, rz: (z1 - z0) / 2 }; let e = 1; for (let j = 0; j < pts.length; j += 2) e = Math.max(e, Math.hypot(pts[j] / c.rx, (pts[j + 1] - c.cz) / c.rz)); c.rx *= Math.min(e, 1.12); c.rz *= Math.min(e, 1.12); r = c; }
    r = r || { cz: 0, rx: 0.15, rz: 0.1 }; ringCache.set(key, r); return r; };
  // front / back cloth height field on a 1 cm grid (rasterised shell triangles), for strips laid on the surface
  const GX0 = -0.36, GY0 = 0.7 * s, GD = 0.01, NX = 73, NY = Math.ceil((1.62 * s - GY0) / GD) + 1; const FR = new Float32Array(NX * NY).fill(-1e9), BK = new Float32Array(NX * NY).fill(1e9);
  const raster = (Q, used, keep) => { for (let t = 0; t < S.idx.length; t += 3) { const a = S.idx[t], b = S.idx[t + 1], c = S.idx[t + 2]; if (!used[a] || !used[b] || !used[c] || !keep(a) || !keep(b) || !keep(c)) continue;
      const ax = Q[a * 3], ay = Q[a * 3 + 1], az = Q[a * 3 + 2], bx = Q[b * 3], by = Q[b * 3 + 1], bz = Q[b * 3 + 2], cx = Q[c * 3], cy = Q[c * 3 + 1], cz = Q[c * 3 + 2];
      const i0 = Math.max(0, Math.floor((Math.min(ax, bx, cx) - GX0) / GD)), i1 = Math.min(NX - 1, Math.ceil((Math.max(ax, bx, cx) - GX0) / GD)), j0 = Math.max(0, Math.floor((Math.min(ay, by, cy) - GY0) / GD)), j1 = Math.min(NY - 1, Math.ceil((Math.max(ay, by, cy) - GY0) / GD));
      const den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy); if (Math.abs(den) < 1e-12) continue;
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const px = GX0 + i * GD, py = GY0 + j * GD; const l1 = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / den, l2 = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / den, l3 = 1 - l1 - l2;
        if (l1 < -0.02 || l2 < -0.02 || l3 < -0.02) continue; const z = l1 * az + l2 * bz + l3 * cz; const g = j * NX + i; if (z > FR[g]) FR[g] = z; if (z < BK[g]) BK[g] = z; } } };
  raster(sh.Q, sh.used, (u) => armW[u] < 0.5); raster(tr.Q, tr.used, (u) => y(u) > 0.7 * s);
  out.surfZ = (yq, xq, sgn) => { const fx = clamp((xq - GX0) / GD, 0, NX - 1.001), fy = clamp((yq - GY0) / GD, 0, NY - 1.001); const i = Math.floor(fx), j = Math.floor(fy); const A = sgn > 0 ? FR : BK; const bad = sgn > 0 ? -1e8 : 1e8;
    let acc = 0, ws = 0; for (const [di, dj, w] of [[0, 0, (1 - (fx - i)) * (1 - (fy - j))], [1, 0, (fx - i) * (1 - (fy - j))], [0, 1, (1 - (fx - i)) * (fy - j)], [1, 1, (fx - i) * (fy - j)]]) { const v = A[(j + dj) * NX + i + di]; if (sgn > 0 ? v > bad : v < bad) { acc += v * w; ws += w; } }
    if (ws > 0.05) return acc / ws; const r = out.ringAt(yq); const q = clamp(Math.abs(xq) / r.rx, 0, 0.98); return r.cz + sgn * r.rz * Math.sqrt(1 - q * q); };
  // sleeve / wrist cross-section (cuffs, glove cuffs) on the outermost layer at height yq
  out.wrist = (side, yq) => { const sx = side === 'L' ? 1 : -1; let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9, n = 0;
    for (let u = 0; u < NU; u++) { if (armW[u] < 0.5 || Math.sign(P[u * 3]) !== sx) continue; const Qs = sh.used[u] ? sh.Q : P; if (Math.abs(Qs[u * 3 + 1] - yq) > 0.008) continue; x0 = Math.min(x0, Qs[u * 3]); x1 = Math.max(x1, Qs[u * 3]); z0 = Math.min(z0, Qs[u * 3 + 2]); z1 = Math.max(z1, Qs[u * 3 + 2]); n++; }
    return n ? { c: [(x0 + x1) / 2, yq, (z0 + z1) / 2], rx: (x1 - x0) / 2, rz: (z1 - z0) / 2 } : null; };
  // the tee panel of the open shirt: x normalised by the opening half-width (0.367 · chest half-width), interpolated per pixel
  if (open) { const ca = sb.cl; for (let u = 0; u < NU; u++) { const v = sh.map[u]; if (v < 0 || armW[u] >= 0.5) continue; const yy = sh.Q[u * 3 + 1]; const hw = 0.367 * out.ringAt(Math.max(Math.min(yy, 1.43 * s), 1.0 * s)).rx; ca[v * 2 + 1] = sh.Q[u * 3] / hw; } }
  out.stats = { shirt: sh.used.reduce((a, b) => a + b, 0), trousers: tr.used.reduce((a, b) => a + b, 0), skinTris: bodyTris.length / 3 };
  return out;
}

// ------------------------------------------------------------------ shading: fabric + skin micro / meso detail
// Chained in front of HeroRig.patchHeroMaterial (kind 'body'). Detail is computed from the BIND-pose position and normal
// (stable under animation), heights are in metres and turned into normals with screen-space derivatives, and every
// sub-millimetre pattern fades out by its pixel footprint so nothing shimmers.
export function clothShader(opts) {
  const U = { uInner: { value: new THREE.Color(opts.inner || '#e8e4da') }, uOpen: { value: opts.open ? 1 : 0 }, uS: { value: opts.s || 1 }, uDenim: { value: opts.denim ? 1 : 0 }, uStitch: { value: new THREE.Color(opts.stitch || '#b8873e') } };
  return (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 aCloth;\nvarying vec2 vCloth;\nvarying vec3 vBP;\nvarying vec3 vBN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCloth = aCloth; vBP = position; vBN = normal;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec2 vCloth; varying vec3 vBP; varying vec3 vBN;
uniform vec3 uInner; uniform float uOpen; uniform float uS; uniform float uDenim; uniform vec3 uStitch;
float hbH; float hbAO;
float hbHash( vec3 p ) { p = fract( p * 0.3183099 + 0.1 ); p *= 17.0; return fract( p.x * p.y * p.z * ( p.x + p.y + p.z ) ); }
float hbNoise( vec3 x ) { vec3 i = floor( x ); vec3 f = fract( x ); f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( mix( hbHash( i ), hbHash( i + vec3( 1.0, 0.0, 0.0 ) ), f.x ), mix( hbHash( i + vec3( 0.0, 1.0, 0.0 ) ), hbHash( i + vec3( 1.0, 1.0, 0.0 ) ), f.x ), f.y ),
              mix( mix( hbHash( i + vec3( 0.0, 0.0, 1.0 ) ), hbHash( i + vec3( 1.0, 0.0, 1.0 ) ), f.x ), mix( hbHash( i + vec3( 0.0, 1.0, 1.0 ) ), hbHash( i + vec3( 1.0, 1.0, 1.0 ) ), f.x ), f.y ), f.z ); }
float hbRidge( vec3 x ) { return 1.0 - abs( 2.0 * hbNoise( x ) - 1.0 ); }
float hbFade( float period, float px ) { return 1.0 - smoothstep( 0.35 * period, 0.9 * period, px ); }
vec3 hbBump( vec3 pos, vec3 n, float h ) { vec3 dpx = dFdx( pos ), dpy = dFdy( pos ); float hx = dFdx( h ), hy = dFdy( h );
  vec3 r1 = cross( dpy, n ), r2 = cross( n, dpx ); float det = dot( dpx, r1 ); vec3 g = sign( det ) * ( hx * r1 + hy * r2 ); return normalize( abs( det ) * n - g ); }`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
  hbH = 0.0; hbAO = 1.0;
  {
    float idc = floor( vCloth.x + 0.5 ); vec3 bp = vBP / uS; vec3 bn = normalize( vBN ); float px = length( fwidth( vBP ) ) * 0.7;
    vec3 tng = normalize( cross( vec3( 0.0, 1.0, 0.0 ), bn ) + vec3( 1e-4, 0.0, 0.0 ) ); vec2 cu = vec2( dot( vBP, tng ), vBP.y );
    float ndv = abs( dot( normalize( vNormal ), normalize( vViewPosition ) ) );
    if ( idc == 1.0 || idc == 3.0 ) {
      // open shirt: the tee shows between the front edges; soft shadow on the tee under the shirt panels
      if ( uOpen > 0.5 && idc == 1.0 && vBP.z > 0.0 && abs( vCloth.y ) < 1.0 && bp.y > 0.99 ) {
        float e = abs( vCloth.y ); diffuseColor.rgb = uInner * ( 1.0 - 0.32 * smoothstep( 0.6, 1.0, e ) );
        hbH += 0.0009 * hbRidge( vec3( vBP.x * 60.0, vBP.y * 9.0, 2.0 ) ) * smoothstep( 1.08, 1.02, bp.y );
        float rib = hbFade( 0.0012, px ); hbH += 0.00006 * rib * sin( cu.x * 5236.0 );
      } else {
        // plain-weave cotton: two crossing thread waves (1.1 mm), slub streaks, colour flecks
        float P = 0.0011; float f = hbFade( P, px );
        hbH += 0.00009 * f * ( sin( cu.x * 6.2832 / P ) * 0.5 + 0.5 ) * ( sin( cu.y * 6.2832 / P ) * 0.5 + 0.5 );
        diffuseColor.rgb *= 1.0 + 0.07 * ( hbNoise( vec3( cu.x * 420.0, cu.y * 26.0, 1.7 ) ) - 0.5 ) * hbFade( 0.004, px );
        diffuseColor.rgb *= 1.0 + 0.04 * ( hbNoise( vec3( cu * 2400.0, 0.3 ) ) - 0.5 ) * f;
        // drape: long soft vertical folds from the chest down; compression folds where the shirt is tucked / belted
        hbH += 0.0035 * hbNoise( vec3( cu.x * 13.0, bp.y * 2.4, 4.1 ) );
        float waist = idc == 1.0 ? exp( -pow( ( bp.y - 1.0 ) / 0.045, 2.0 ) ) : 0.0;
        float wf = hbRidge( vec3( cu.x * 7.0, bp.y * 48.0, 7.3 ) ); hbH += 0.0035 * waist * wf; hbAO *= 1.0 - 0.22 * waist * ( 1.0 - wf );
        // sleeves: elbow creases (long sleeve), shoulder-to-armpit diagonals, hem fullness
        if ( idc == 3.0 ) { float elb = exp( -pow( ( bp.y - 1.12 ) / 0.06, 2.0 ) ); float ef = hbRidge( vec3( cu.x * 9.0, bp.y * 40.0 + cu.x * 6.0, 2.9 ) );
          hbH += 0.003 * elb * ef; hbAO *= 1.0 - 0.25 * elb * ( 1.0 - ef );
          float arm = smoothstep( 1.36, 1.28, bp.y ) * smoothstep( 1.18, 1.26, bp.y ); float af = hbRidge( vec3( cu.x * 16.0 + bp.y * 22.0, bp.y * 9.0, 5.5 ) );
          hbH += 0.0022 * arm * af; hbAO *= 1.0 - 0.15 * arm * ( 1.0 - af );
          // underarm seam (faces the body)
          float nx = -bn.x * sign( vBP.x ); float sd = acos( clamp( nx, -1.0, 1.0 ) ) * 0.05; float seam = smoothstep( 0.0016, 0.0004, sd );
          hbH -= 0.0004 * seam; hbAO *= 1.0 - 0.18 * seam * hbFade( 0.004, px ); }
        // side seams of the shirt body
        if ( idc == 1.0 ) { float sd = acos( clamp( abs( bn.x ), 0.0, 1.0 ) ) * 0.13; float seam = smoothstep( 0.002, 0.0005, sd ) * step( abs( bn.y ), 0.6 );
          hbH -= 0.0004 * seam; hbAO *= 1.0 - 0.18 * seam * hbFade( 0.004, px ); }
      }
      diffuseColor.rgb *= 1.0 + 0.16 * pow( 1.0 - ndv, 3.0 ); // cotton fibres catch light at grazing angles
    } else if ( idc == 2.0 ) {
      float legSide = sign( vBP.x ); float nxo = bn.x * legSide; float ang = atan( bn.z, nxo ); // 0 = outer seam, ±π = inseam
      if ( uDenim > 0.5 ) {
        // 3/1 right-hand twill (1.9 mm diagonal wales), white weft flecks, ring-spun slub streaks, wear on thighs / knees, whiskers
        float P = 0.0019; float f = hbFade( P, px ); float d = cu.x * 0.454 + cu.y * 0.891; float tw = sin( d * 6.2832 / P ) * 0.5 + 0.5;
        hbH += 0.00012 * f * tw;
        diffuseColor.rgb = mix( diffuseColor.rgb, diffuseColor.rgb * 1.55 + 0.035, 0.22 * f * smoothstep( 0.55, 0.95, tw ) );
        float slub = hbNoise( vec3( cu.x * 240.0, bp.y * 7.0, 3.3 ) ); diffuseColor.rgb *= 0.9 + 0.2 * slub * hbFade( 0.006, px ) + 0.1 * ( 1.0 - hbFade( 0.006, px ) ) * 0.5;
        float front = smoothstep( 0.1, 0.8, bn.z );
        float wear = front * ( exp( -pow( ( bp.y - 0.72 ) / 0.12, 2.0 ) ) * 0.8 + exp( -pow( ( bp.y - 0.5 ) / 0.04, 2.0 ) ) * 0.7 ) * ( 0.75 + 0.5 * hbNoise( vec3( vBP * 30.0 ) ) );
        float whisk = front * smoothstep( 0.9, 0.82, bp.y ) * smoothstep( 0.78, 0.84, bp.y ) * smoothstep( 0.6, 0.97, hbRidge( vec3( cu.x * 18.0, bp.y * 70.0 - cu.x * 25.0 * legSide, 9.1 ) ) );
        diffuseColor.rgb = mix( diffuseColor.rgb, diffuseColor.rgb * 1.75 + vec3( 0.025, 0.03, 0.045 ), clamp( wear * 0.55 + whisk * 0.45, 0.0, 0.8 ) );
        hbH -= 0.0012 * whisk;
      } else {
        float P = 0.0010; float f = hbFade( P, px ); float d = cu.x * 0.707 + cu.y * 0.707; hbH += 0.00006 * f * ( sin( d * 6.2832 / P ) * 0.5 + 0.5 );
        diffuseColor.rgb *= 1.0 + 0.05 * ( hbNoise( vec3( cu.x * 300.0, bp.y * 12.0, 8.0 ) ) - 0.5 ) * hbFade( 0.005, px );
      }
      // folds: stack over the shoes, behind the knees, at the crotch; soft vertical drape
      float stack = smoothstep( 0.3, 0.1, bp.y ); float sf = hbRidge( vec3( cu.x * 8.0, bp.y * 34.0 + cu.x * 4.0, 1.9 ) );
      hbH += 0.0045 * stack * sf; hbAO *= 1.0 - 0.3 * stack * ( 1.0 - sf );
      float knee = exp( -pow( ( bp.y - 0.5 ) / 0.05, 2.0 ) ) * ( 0.35 + 0.65 * smoothstep( 0.2, -0.6, bn.z ) ); float kf = hbRidge( vec3( cu.x * 10.0, bp.y * 52.0, 6.6 ) );
      hbH += 0.003 * knee * kf; hbAO *= 1.0 - 0.22 * knee * ( 1.0 - kf );
      float crotch = smoothstep( 0.86, 0.8, bp.y ) * smoothstep( 0.7, 0.8, bp.y ) * smoothstep( -0.2, -0.8, cos( ang ) ); float cf = hbRidge( vec3( cu.x * 20.0 + bp.y * 30.0, bp.y * 12.0, 4.4 ) );
      hbH += 0.0025 * crotch * cf; hbAO *= 1.0 - 0.2 * crotch * ( 1.0 - cf );
      hbH += 0.003 * hbNoise( vec3( cu.x * 11.0, bp.y * 1.6, 2.2 ) );
      // out- and in-seams with a double row of stitching (gold on denim)
      if ( bp.y < 0.9 ) { float r = 0.065; float dO = abs( ang ) * r, dI = ( 3.14159 - abs( ang ) ) * r; float dS = min( dO, dI );
        float groove = smoothstep( 0.0018, 0.0003, dS ); hbH -= 0.0005 * groove; hbAO *= 1.0 - 0.25 * groove * hbFade( 0.005, px );
        float stF = hbFade( 0.004, px ); float dash = step( 0.42, fract( vBP.y / 0.0038 ) );
        float st = ( smoothstep( 0.0007, 0.0002, abs( dS - 0.0035 ) ) + smoothstep( 0.0007, 0.0002, abs( dS - 0.0062 ) ) * step( dO, dI ) ) * dash * stF;
        diffuseColor.rgb = mix( diffuseColor.rgb, uDenim > 0.5 ? uStitch : diffuseColor.rgb * 0.7, clamp( st, 0.0, 1.0 ) * 0.85 ); hbH += 0.00012 * st; }
      diffuseColor.rgb *= 1.0 + 0.1 * pow( 1.0 - ndv, 3.0 );
    } else if ( idc == 4.0 ) {
      // skin: tone variation, pores, forearm / hand veins, darker elbows and knuckle creases
      diffuseColor.rgb *= 0.955 + 0.09 * hbNoise( vBP * 22.0 );
      hbH += 0.00005 * hbNoise( vBP * 1500.0 ) * hbFade( 0.0008, px );
      float armR = smoothstep( 0.16, 0.2, abs( bp.x ) ) * smoothstep( 1.2, 1.12, bp.y ) * smoothstep( 0.76, 0.8, bp.y );
      if ( armR > 0.0 ) {
        // soft raised veins (3–4 mm wide), broken into runs by a low-frequency mask, never an etched network
        float v1 = hbRidge( vec3( vBP.x * 24.0, vBP.y * 4.6, vBP.z * 24.0 ) ); float runs = smoothstep( 0.42, 0.68, hbNoise( vBP * 8.0 + 5.3 ) );
        float vein = smoothstep( 0.8, 0.965, v1 ) * runs;
        float hand = smoothstep( 0.9, 0.86, bp.y ); float back = smoothstep( 0.1, 0.6, bn.x * sign( vBP.x ) );
        float inner = smoothstep( 0.0, 0.5, bn.z - bn.x * sign( vBP.x ) * 0.4 );
        float k = armR * mix( 0.55 * max( inner, 0.4 ), 1.0 * back, hand );
        hbH += 0.0007 * vein * k; diffuseColor.rgb = mix( diffuseColor.rgb, diffuseColor.rgb * vec3( 0.88, 0.91, 0.98 ), 0.3 * vein * k );
        float elb = exp( -pow( ( bp.y - 1.12 ) / 0.035, 2.0 ) ) * smoothstep( 0.0, -0.6, bn.z ); diffuseColor.rgb *= 1.0 - 0.1 * elb * hbNoise( vBP * 300.0 );
        // fine forearm hair
        float hair = step( 0.82, hbNoise( vec3( vBP.x * 2600.0, vBP.y * 700.0, vBP.z * 2600.0 ) ) ) * hbFade( 0.0007, px ) * smoothstep( 0.86, 0.95, bp.y ) * ( 0.4 + 0.6 * back );
        diffuseColor.rgb *= 1.0 - 0.18 * hair;
      }
    }
    diffuseColor.rgb *= hbAO;
  }`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
  normal = hbBump( - vViewPosition, normal, hbH );`);
  };
}
