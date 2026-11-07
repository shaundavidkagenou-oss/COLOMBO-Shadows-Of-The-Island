// Crowd heads: anatomical faces for every non-protagonist character (civilians, staff, police), built from the CC0
// MakeHuman-derived data baked by tools/mh/bake-npc-heads.mjs (28 face variants: local men / women from young adults to
// elders, plus European and East Asian visitors).
//
// Cost model (why this is cheap enough for a crowd):
//  • one plain THREE.Mesh per person, rigid on the head bone (no extra skinning): ~3.7k triangles incl. eyes / teeth near
//    the camera, a ~1.2k-triangle LOD beyond ~11 m (npcHeadDataLo.js; same face, masks and morphs) that casts no shadow of
//    its own — a distant crowd head is one extra draw call;
//  • geometry is shared by everyone with the same variant + facial-hair style + hair colour + scarf (a few dozen in a
//    whole session); eyeballs, teeth, inner mouth, beard / moustache shells are all in that one geometry → one draw call;
//  • the per-person look (skin, lip colour, brows, lash line, stubble, iris, pottu) is uniforms on a small material whose
//    shader program is shared by every crowd head;
//  • expressions are 12 morph targets + 2 gaze morphs (eyeballs rotate inside the sockets), driven by FaceRig only
//    within ~28 m like before.
import * as THREE from 'three';
import DATA from './npcHeadData.js';
import DATA_LO from './npcHeadDataLo.js'; // distance LOD: same variants / landmarks / masks / morphs, ~1/3 of the triangles
const SETS = [DATA, DATA_LO];

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const dec = (s) => { if (typeof atob === 'function') { const b = atob(s); const u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; } return Uint8Array.from(Buffer.from(s, 'base64')); };
const hashU = (n) => { let h = (n | 0) * 2654435761; h ^= h >>> 15; h = Math.imul(h, 2246822519); h ^= h >>> 13; return (h >>> 0) / 4294967296; };
export const NPC_MORPHS = [...DATA.morphNames, 'lookL', 'lookR'];
const PER_SEX = DATA.variants.length / 2;

const SH = [null, null];
function shared(li = 0) {
  if (SH[li]) return SH[li]; const D = SETS[li];
  const N = D.verts, nSkin = D.skinVerts; const parts = D.idx.map((s) => new Uint16Array(dec(s).buffer));
  const masks = {}; for (const k in D.masks) { const u = dec(D.masks[k]); const f = new Float32Array(N); for (let i = 0; i < N; i++) f[i] = u[i] / 255; masks[k] = f; }
  const morphs = {}; for (const sx in D.morphs) { morphs[sx] = {}; for (const n in D.morphs[sx]) { const m = D.morphs[sx][n]; morphs[sx][n] = { i: new Uint16Array(dec(m.i).buffer), d: new Int16Array(dec(m.d).buffer) }; } }
  let N0 = 0; for (let p = 0; p < 3; p++) for (const v of parts[p]) N0 = Math.max(N0, v + 1); // verts ≥ N0: the neck skirt
  const part = new Uint8Array(N); for (let p = 1; p < 3; p++) for (const v of parts[p]) part[v] = p; for (let i = N0; i < N; i++) part[i] = 3;
  SH[li] = { N, nSkin, N0, parts, masks, morphs, part }; return SH[li];
}

// ---- which face a person gets: sex, age and (for visitors) origin; otherwise spread by seed
const EA_FACES = new Set([6, 17]), EU_FACES = new Set([7, 18]);
export function npcVariant(sp) {
  const base = sp.sex === 'f' ? PER_SEX : 0;
  if (EU_FACES.has(sp.faceV)) return base + 12; if (EA_FACES.has(sp.faceV)) return base + 13;
  const y = sp.ageYears ?? (sp.age === 'elder' ? 68 : 32);
  const pool = y >= 58 ? [3, 7, 11] : y >= 38 ? [1, 5, 9] : [0, 2, 4, 6, 8, 10];
  return base + pool[Math.floor(hashU((sp.seed || 1) * 31 + 7) * pool.length)];
}

// ---- placement on the body (body / bind space, metres) — same proportions rule as the protagonists' heads
const FITS = new Map();
export function npcHeadFit(sp) {
  const v = npcVariant(sp); const key = v + '|' + sp.height; if (FITS.has(key)) return FITS.get(key);
  const L = DATA.variants[v].L; const s = sp.height / 1.72; const k = Math.sqrt(sp.height / 1.76) * 1.04;
  const o = [0, 1.75 * s - k * L.crown, -k * L.neck.cz + 0.004];
  const T = (p) => [o[0] + k * p[0], o[1] + k * p[1], o[2] + k * p[2]];
  const f = { v, k, o, T, L, hc: T(L.ell.c), hr: L.ell.r.map((r) => r * k), eyeL: T(L.eyeL), eyeR: T(L.eyeR), er: L.er * k, lobeL: T(L.lobe), lobeR: T([-L.lobe[0], L.lobe[1], L.lobe[2]]), ear: k * L.ear[0],
    nose: T(L.nose), mouth: T(L.mouth), chin: T(L.chin), brow: o[2] + k * L.brow, crown: o[1] + k * L.crown,
    neck: { y0: o[1] + k * L.neck.y0, yf: o[1] + k * L.neck.yf, y1: o[1] + k * L.neck.y1, cz: o[2] + k * L.neck.cz, rx: k * L.neck.rx, rz: k * L.neck.rz } };
  FITS.set(key, f); return f;
}

function vertexNormals(pos, idx, N) {
  const n = new Float32Array(N * 3);
  for (let t = 0; t < idx.length; t += 3) { const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2], vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; for (const o of [a, b, c]) { n[o] += nx; n[o + 1] += ny; n[o + 2] += nz; } }
  for (let i = 0; i < N; i++) { const l = Math.hypot(n[i * 3], n[i * 3 + 1], n[i * 3 + 2]) || 1; n[i * 3] /= l; n[i * 3 + 1] /= l; n[i * 3 + 2] /= l; }
  return n;
}

// eyeball: a lathe of rings from the pupil backwards (only the front ~110° is ever visible), slight corneal bulge
// [angle from the gaze axis, kind, shade]  kind: 0 pupil, 1 iris (tinted by the person's iris colour), 2 sclera
const EYE_RINGS = [[0.15, 0, 1], [0.2, 1, 0.65], [0.33, 1, 1], [0.43, 1, 0.75], [0.5, 1, 0.35], [0.56, 2, 0.9], [0.8, 2, 1], [1.15, 2, 0.92], [1.55, 2, 0.7], [1.95, 2, 0.45]];
const EYE_LON = 14;
const EYE_RINGS_LO = [[0.15, 0, 1], [0.33, 1, 0.9], [0.5, 1, 0.35], [0.56, 2, 0.9], [1.0, 2, 0.95], [1.6, 2, 0.6]], EYE_LON_LO = 8;

const GEOS = new Map();
// opts: { beard: null|'full'|'short'|'goatee', mous: bool, hijab: bool, hair: [r,g,b] linear }; li: 0 full, 1 distance LOD
export function npcHeadGeometry(v, opts, li = 0) {
  const hk = opts.hair.map((c) => Math.round(c * 40)).join(',');
  const key = [li, v, opts.beard || '-', opts.mous ? 1 : 0, opts.hijab ? 1 : 0, hk].join('|'); let g = GEOS.get(key); if (g) return g;
  const s = shared(li); const D = SETS[li]; const V = D.variants[v]; const RINGS = li ? EYE_RINGS_LO : EYE_RINGS, LON = li ? EYE_LON_LO : EYE_LON; const L = V.L; const N = s.N, M = s.masks;
  const qp = new Int16Array(dec(V.pos).buffer); const P = new Float32Array(N * 3); for (let i = 0; i < N * 3; i++) P[i] = qp[i] * V.q;
  const ec = L.ell.c, er = L.ell.r;
  if (opts.hijab) for (let i = 0; i < s.nSkin; i++) { const m = M.ears[i]; if (m < 0.04) continue; // ears folded flat under the scarf
    const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2]; const q = (x / er[0]) ** 2 + ((y - ec[1]) / er[1]) ** 2 + ((z - ec[2]) / er[2]) ** 2; if (q <= 0.96) continue;
    const k = 0.975 / Math.sqrt(q), w = sstep(0.04, 0.35, m); P[i * 3] = x + (x * k - x) * w; P[i * 3 + 1] = y + (ec[1] + (y - ec[1]) * k - y) * w; P[i * 3 + 2] = z + (ec[2] + (z - ec[2]) * k - z) * w; }
  const skinIdx = s.parts[0]; const NS = vertexNormals(P, skinIdx, N);

  // facial hair shell: the masked skin, pushed out along the normals (thicker on the chin), sharing the skin's morphs
  const fm = new Float32Array(N); let anyHair = false;
  if (opts.beard || opts.mous) { anyHair = true; const mx = L.mouth;
    for (let i = 0; i < s.N0; i++) { if (s.part[i] !== 0) continue; let m = 0; const x = P[i * 3], y = P[i * 3 + 1];
      if (opts.beard === 'full' || opts.beard === 'short') m = M.beard[i];
      else if (opts.beard === 'goatee') m = M.beard[i] * (1 - sstep(0.018, 0.03, Math.abs(x))) * (1 - sstep(mx[1] - 0.012, mx[1] - 0.002, y));
      if (opts.mous || opts.beard === 'full' || opts.beard === 'goatee') m = Math.max(m, M.mous[i]); fm[i] = m * (1 - sstep(0.06, 0.2, M.lips[i])); } } // never over the lips
  // shell vertices: the masked skin, subdivided once (PN-style curved midpoints); below the mask edge the shell dives under
  // the skin, so the visible beard / moustache outline is a smooth curve rather than the coarse triangle edges
  const SV = [], sOf = new Map(), shellTri = [];
  const sBase = (i) => { if (!sOf.has(i)) { sOf.set(i, SV.length); SV.push({ p: [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]], n: [NS[i * 3], NS[i * 3 + 1], NS[i * 3 + 2]], m: fm[i], a: i, b: i }); } return sOf.get(i); };
  const sMid = (i, j) => { const key = -(i < j ? i * 65536 + j : j * 65536 + i) - 1; if (sOf.has(key)) return sOf.get(key); const A = SV[sBase(i)], Bv = SV[sBase(j)];
    const d = A.p.map((v, k) => Bv.p[k] - v), dn = A.n.map((v, k) => v - Bv.n[k]); const sag = -(d[0] * dn[0] + d[1] * dn[1] + d[2] * dn[2]) / 8; let nn = A.n.map((v, k) => v + Bv.n[k]); const l = Math.hypot(...nn) || 1; nn = nn.map((v) => v / l);
    const id = SV.length; SV.push({ p: A.p.map((v, k) => (v + Bv.p[k]) / 2 + nn[k] * sag), n: nn, m: (A.m + Bv.m) / 2, a: i, b: j }); sOf.set(key, id); return id; };
  if (anyHair) for (let t = 0; t < skinIdx.length; t += 3) { const a = skinIdx[t], b = skinIdx[t + 1], c = skinIdx[t + 2]; if (Math.max(fm[a], fm[b], fm[c]) < 0.05) continue;
    const A = sBase(a), Bb = sBase(b), Cc = sBase(c); if (li) { shellTri.push(A, Bb, Cc); continue; } /* LOD: no subdivision */ const ab = sMid(a, b), bc = sMid(b, c), ca = sMid(c, a); shellTri.push(A, ab, ca, ab, Bb, bc, ca, bc, Cc, ab, bc, ca); }
  const NH = SV.length; const NE = 1 + RINGS.length * LON; const NT = N + NH + NE * 2;
  const pos = new Float32Array(NT * 3); pos.set(P);
  const col = new Float32Array(NT * 3), aF = new Float32Array(NT * 4), aG = new Float32Array(NT * 4);
  const tooth = [0.065, 0.058, 0.048], inner = [0.05, 0.016, 0.014];
  for (let i = 0; i < N; i++) { const ao = M.ao[i]; const p = s.part[i];
    if (p === 1 || p === 2) { // teeth: occluded enamel fading into the mouth, seated a little back behind the resting lip gap
      P[i * 3 + 2] -= 0.002; pos[i * 3 + 2] = P[i * 3 + 2];
      const dz = clamp((L.mouth[2] - 0.012 - P[i * 3 + 2]) / 0.03, 0, 1), k = (1 - 0.8 * dz) * (p === 2 ? 0.7 : 1); /* lips rest slightly parted: the teeth read as a shadowed slit, not a white sheet */ col.set(tooth.map((c) => c * k), i * 3); aF[i * 4 + 3] = 1; aG[i * 4 + 3] = 0.12; continue; }
    const inn = M.inner[i]; col.set(inner, i * 3); /* colour = the raw colour only (skin verts: the cavity colour), so blends never pick up grey */
    aF[i * 4] = M.lips[i] * (1 - inn); aF[i * 4 + 1] = ao; aF[i * 4 + 2] = M.beard[i]; aF[i * 4 + 3] = inn;
    aG[i * 4] = M.lash[i]; aG[i * 4 + 1] = M.mous[i]; }
  const hc = opts.hair; const hairK = opts.beard === 'short' ? 0.0022 : opts.beard === "full" ? 0.0034 : 0.002;
  for (let j = 0; j < NH; j++) { const S0 = SV[j], o = N + j; const m = S0.m;
    const chinK = sstep(L.mouth[1] - 0.02, L.chin[1] + 0.01, S0.p[1]); const th = lerp(-0.0016, hairK + (opts.beard === 'full' ? 0.003 * chinK : opts.beard === 'goatee' ? 0.0025 * chinK : 0), sstep(0.1, 0.65, m));
    for (let k = 0; k < 3; k++) pos[o * 3 + k] = S0.p[k] + S0.n[k] * th;
    const n = 0.78 + 0.34 * hashU(j * 7 + 3); col.set(hc.map((c) => Math.min(1, c * n * 0.92 + 0.004)), o * 3); aF[o * 4 + 3] = 1; aG[o * 4 + 3] = 0.08; }
  // eyeballs
  const eyeR = L.er * 0.93; const eyeC = [L.eyeL, L.eyeR]; const sclera = [0.8, 0.76, 0.72], pupil = [0.012, 0.01, 0.01];
  const eyeTri = [];
  eyeC.forEach((c, e) => { const b = N + NH + e * NE;
    const put = (vi, th, ph, ring) => { const bul = 1 + 0.035 * Math.cos(Math.min(th, 0.6) / 0.6 * Math.PI * 0.5) ** 2; const r = eyeR * bul; const o = (b + vi) * 3;
      pos[o] = c[0] + r * Math.sin(th) * Math.cos(ph); pos[o + 1] = c[1] + r * Math.sin(th) * Math.sin(ph); pos[o + 2] = c[2] + r * Math.cos(th);
      const [, kind, sh] = ring; const a = (b + vi) * 4; aF[a + 3] = 1; aG[a + 3] = 1;
      if (kind === 0) col.set(pupil, o); else if (kind === 1) { col.set([sh, sh, sh], o); aG[a + 2] = 1; } else col.set(sclera.map((x) => x * sh), o); };
    put(0, 0, 0, RINGS[0]);
    RINGS.forEach((ring, ri) => { for (let j = 0; j < LON; j++) put(1 + ri * LON + j, ring[0], (j / LON) * Math.PI * 2, ring); });
    for (let j = 0; j < LON; j++) eyeTri.push(b, b + 1 + j, b + 1 + (j + 1) % LON);
    for (let ri = 0; ri < RINGS.length - 1; ri++) for (let j = 0; j < LON; j++) { const a0 = b + 1 + ri * LON + j, a1 = b + 1 + ri * LON + (j + 1) % LON, b0 = a0 + LON, b1 = a1 + LON; eyeTri.push(a0, b0, a1, a1, b0, b1); } });
  const shellIdx = shellTri.map((v2) => N + v2);
  const index = new Uint16Array(skinIdx.length + s.parts[1].length + s.parts[2].length + s.parts[3].length + shellIdx.length + eyeTri.length);
  let off = 0; for (const a of [skinIdx, s.parts[1], s.parts[2], s.parts[3], shellIdx, eyeTri]) { index.set(a, off); off += a.length; }
  g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aF', new THREE.BufferAttribute(aF, 4)); g.setAttribute('aG', new THREE.BufferAttribute(aG, 4)); g.setIndex(new THREE.BufferAttribute(index, 1));
  g.computeVertexNormals();
  // morphs: expression units (sparse, per sex) — the facial-hair shell follows its skin; gaze turns the eyeballs
  const mor = [];
  for (const name of D.morphNames) { const d = new Float32Array(NT * 3); const m = s.morphs[V.sex][name];
    for (let j = 0; j < m.i.length; j++) { const i = m.i[j]; for (let k = 0; k < 3; k++) d[i * 3 + k] = m.d[j * 3 + k] * 2e-6; }
    for (let j = 0; j < NH; j++) { const { a, b } = SV[j]; for (let k = 0; k < 3; k++) d[(N + j) * 3 + k] = (d[a * 3 + k] + d[b * 3 + k]) / 2; }
    mor.push(new THREE.BufferAttribute(d, 3)); }
  for (const a of [0.34, -0.34]) { const d = new Float32Array(NT * 3); const ca = Math.cos(a), sa = Math.sin(a);
    eyeC.forEach((c, e) => { const b = N + NH + e * NE; for (let vi = 0; vi < NE; vi++) { const o = (b + vi) * 3; const x = pos[o] - c[0], z = pos[o + 2] - c[2]; d[o] = x * ca + z * sa - x; d[o + 2] = -x * sa + z * ca - z; } });
    mor.push(new THREE.BufferAttribute(d, 3)); }
  g.morphAttributes.position = mor; g.morphTargetsRelative = true;
  g.computeBoundingSphere(); g.boundingSphere.radius += 0.02;
  // forehead point for a pottu: front of the skin between the brows
  let pz = -1, py = L.brow != null ? 0.024 : 0.024; for (let i = 0; i < s.nSkin; i++) { const x = P[i * 3], y = P[i * 3 + 1]; if (Math.abs(x) < 0.006 && Math.abs(y - py) < 0.006 && P[i * 3 + 2] > pz) pz = P[i * 3 + 2]; }
  g.userData.pottu = [0, py, pz]; g.userData.tris = index.length / 3; g.userData.v = v;
  GEOS.set(key, g); return g;
}

// ---- material: one per person (uniforms), one shader program for every crowd head
function patch(sh) {
  Object.assign(sh.uniforms, this.userData.u);
  sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 aF; attribute vec4 aG; varying vec4 vF; varying vec4 vG; varying vec3 vHL;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvF = aF; vG = aG; vHL = position;');
  sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uLip; uniform vec3 uHair; uniform vec3 uIris; uniform vec4 uK; uniform vec4 uPot; uniform vec4 uBr; varying vec4 vF; varying vec4 vG; varying vec3 vHL;')
    .replace('#include <color_fragment>', `#include <color_fragment>
      { float ao = vF.y; vec3 sk = diffuse * ao;
        float stub = clamp(vF.z * uK.z + vG.y * uK.w, 0.0, 0.8); sk = mix(sk, mix(sk, uHair, 0.75) * 0.9, stub);   // shaved-beard shadow
        sk = mix(sk, uLip * ao, smoothstep(0.08, 0.6, vF.x));                                                  // lips
        { float t = (abs(vHL.x) - (uBr.x - uBr.z * 1.05)) / (uBr.z * 2.45); float tc = clamp(t, 0.0, 1.0);          // brows: tapered arch above each eye
          float yb = uBr.y + uBr.z * (1.32 + 0.22 * sin(3.14159 * tc * 0.85) - 0.3 * max(tc - 0.6, 0.0)); float hw = uBr.z * (0.3 - 0.14 * tc) * uBr.w;
          float bm = (1.0 - smoothstep(0.45, 1.1, abs(vHL.y - yb) / hw)) * smoothstep(-0.14, 0.03, t) * (1.0 - smoothstep(0.88, 1.08, t)) * step(-0.03, vHL.z);
          bm *= 0.86 + 0.08 * sin(vHL.x * 2300.0 + vHL.y * 900.0) + 0.06 * sin(vHL.x * 3700.0 - vHL.y * 1500.0);
          sk = mix(sk, uHair * (0.75 + 0.25 * ao), clamp(bm * uK.x, 0.0, 0.94)); }
        sk = mix(sk, uHair * 0.35, clamp(vG.x * uK.y, 0.0, 1.0));                                              // lash line
        float pd = length(vHL - uPot.xyz); sk = mix(sk, vec3(0.42, 0.015, 0.03), (1.0 - smoothstep(uPot.w * 0.7, uPot.w, pd)) * step(0.0001, uPot.w));
        vec3 raw = mix(vColor.rgb, uIris * vColor.r, vG.z);
        diffuseColor.rgb = mix(sk, raw, vF.w); }`)
    .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.42, smoothstep(0.2, 0.8, vF.x) * (1.0 - vF.w)); roughnessFactor = mix(roughnessFactor, 0.1, vG.w * vF.w);');
}
const cacheKey = () => 'npcHead3';
const C3 = (h) => new THREE.Color(h);
// sp: appearance spec; fv: FACE_VARIANTS entry (or null); geo: from npcHeadGeometry
export function npcHeadMaterial(sp, fv, geo) {
  const f = sp.sex === 'f'; const skin = C3(sp.skin || '#8d5a3b'); const hair = C3(sp.hairColor || '#15100c');
  const lipBase = skin.clone().multiply(new THREE.Color(0.74, 0.5, 0.5));
  const lip = fv?.lips ? lipBase.clone().lerp(C3(fv.lips), f ? 0.55 : 0.3) : lipBase; if (sp.age === 'elder') lip.lerp(skin.clone().multiplyScalar(0.8), 0.35);
  const brow = hair.clone(); if (hair.r > 0.2) brow.lerp(C3('#3a3632'), 0.3); // grey / white hair: brows a little darker than the hair
  const bw = fv?.browW ?? (f ? 0.85 : 1.05); const stub = f ? 0 : (fv?.stubble ?? (sp.beard ? 0.9 : sp.age === 'adult' ? 0.3 : 0.15));
  const pottu = !!fv?.pottu && sp.hair !== 'hijab' && geo.userData.pottu[2] > 0;
  const u = { uLip: { value: lip }, uHair: { value: brow }, uIris: { value: C3(fv?.iris || '#3a2414').multiplyScalar(1.15) },
    uK: { value: new THREE.Vector4(0.78 * bw, f ? 0.95 : 0.7, 0.42 * stub + (sp.beard ? 0.2 : 0), 0.38 * stub + (sp.beard || sp.moustache ? 0.2 : 0)) },
    uBr: { value: new THREE.Vector4(Math.abs(DATA.variants[geo.userData.v].L.eyeL[0]), DATA.variants[geo.userData.v].L.eyeL[1], DATA.variants[geo.userData.v].L.er, (f ? 0.8 : 1) * clamp(bw, 0.75, 1.3)) },
    uPot: { value: pottu ? new THREE.Vector4(geo.userData.pottu[0], geo.userData.pottu[1], geo.userData.pottu[2] + 0.001, 0.0042) : new THREE.Vector4(0, 0, 0, 0) } };
  const m = new THREE.MeshStandardMaterial({ color: skin, vertexColors: true, roughness: 0.6, metalness: 0 });
  m.userData.u = u; m.onBeforeCompile = patch; m.customProgramCacheKey = cacheKey; m.name = 'npcHead';
  return m;
}

export function npcHeadOpts(sp) {
  const beard = sp.goatee ? 'goatee' : sp.beard ? (sp.beardShort ? 'short' : 'full') : null; const c = new THREE.Color(sp.hairColor || '#15100c');
  return { beard, mous: !!sp.moustache, hijab: sp.hair === 'hijab', hair: [c.r, c.g, c.b] };
}
// the variant's skin surface (head-local metres) — the body builder grows the hair cap from it so hair sits exactly on the scalp
const SCALPS = new Map();
export function npcScalp(v) {
  let r = SCALPS.get(v); if (r) return r; const s = shared(); const V = DATA.variants[v]; const qp = new Int16Array(dec(V.pos).buffer);
  const P = new Float32Array(s.N * 3); for (let i = 0; i < s.N * 3; i++) P[i] = qp[i] * V.q;
  r = { P, Nrm: vertexNormals(P, s.parts[0], s.N), tris: s.parts[0], N0: s.N0, part: s.part, ears: s.masks.ears, L: V.L }; SCALPS.set(v, r); return r;
}
export function npcHeadStats() { return { geometries: GEOS.size, verts: DATA.verts, variants: DATA.variants.length }; }
