// Procedural bird models for the three species most often seen in Colombo (original geometry, built in code):
//   crow     — House crow (Corvus splendens): glossy black, grey nape/neck/breast, heavy black bill. Everywhere.
//   pigeon   — Rock / feral pigeon (Columba livia): blue-grey, iridescent green-purple neck, two black wing bars,
//              dark tail band, white rump, orange eye, pink-red legs. Galle Face, Fort, plazas, roof edges.
//   parakeet — Rose-ringed parakeet (Psittacula krameri): bright green, red hooked bill, long graduated blue-green
//              tail; males with a black-and-rose neck ring. Parks and tree-lined streets.
// Every bird is a set of articulated parts (body, head, two-segment wings ×2, tail, legs ×2) built from smooth lofted
// surfaces and individually modelled feathers (vane + raised rachis, tapered, curved, overlapping rows). Parts are
// instanced (Birds.js) and posed per bird per frame. Units: metres; bird space +z forward, +y up, +x = left side.
import * as THREE from 'three';

const lin = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; }; // sRGB hex → linear vertex colour
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const sm = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
const hashf = (i) => { const s = Math.sin(i * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

// ------------------------------------------------------------------ geometry builder
class GB {
  constructor() { this.p = []; this.c = []; this.i = []; }
  get n() { return this.p.length / 3; }
  v(x, y, z, col) { this.p.push(x, y, z); this.c.push(col[0], col[1], col[2]); return this.n - 1; }
  t(a, b, c) { this.i.push(a, b, c); }
  build() { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3)); g.setIndex(this.i); g.computeVertexNormals(); g.computeBoundingSphere(); return g; }
}
// Smooth closed loft through rings {c:[x,y,z], u:[..], v:[..]} (ring point = c + u·cosθ + v·sinθ), shared seam → smooth normals.
// col(k, θ, p) gives the vertex colour; ends are closed with a pole vertex.
function loft(gb, rings, seg, col, { capA = true, capB = true } = {}) {
  const base = gb.n; const N = rings.length;
  for (let k = 0; k < N; k++) { const r = rings[k]; for (let s = 0; s < seg; s++) { const a = (s / seg) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a); const p = [r.c[0] + r.u[0] * ca + r.v[0] * sa, r.c[1] + r.u[1] * ca + r.v[1] * sa, r.c[2] + r.u[2] * ca + r.v[2] * sa]; gb.v(p[0], p[1], p[2], col(k / (N - 1), a, p, k)); } }
  for (let k = 0; k < N - 1; k++) for (let s = 0; s < seg; s++) { const a = base + k * seg + s, b = base + k * seg + ((s + 1) % seg), c = a + seg, d = b + seg; gb.t(a, c, b); gb.t(b, c, d); }
  const pole = (k, flip) => { const r = rings[k]; const dir = k === 0 ? -1 : 1; const nb = rings[k === 0 ? 1 : N - 2]; const dx = r.c[0] - nb.c[0], dy = r.c[1] - nb.c[1], dz = r.c[2] - nb.c[2]; const L = Math.hypot(dx, dy, dz) || 1; const ext = Math.min(Math.hypot(...r.u), Math.hypot(...r.v)) * 0.35; const pc = [r.c[0] + dx / L * ext, r.c[1] + dy / L * ext, r.c[2] + dz / L * ext]; const pi = gb.v(pc[0], pc[1], pc[2], col(k / (N - 1), 0, pc, k)); const o = base + k * seg; for (let s = 0; s < seg; s++) { const a = o + s, b = o + ((s + 1) % seg); if (flip) gb.t(pi, b, a); else gb.t(pi, a, b); } void dir; };
  if (capA) pole(0, false); if (capB) pole(N - 1, true);
}
// tube along a polyline (legs, toes): pts [[x,y,z]...], radii [...]
function tube(gb, pts, radii, seg, colAt) {
  const rings = []; for (let k = 0; k < pts.length; k++) {
    const a = pts[Math.max(0, k - 1)], b = pts[Math.min(pts.length - 1, k + 1)]; let t = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]; const tl = Math.hypot(...t) || 1; t = t.map((q) => q / tl);
    let ref = Math.abs(t[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0]; let u = [t[1] * ref[2] - t[2] * ref[1], t[2] * ref[0] - t[0] * ref[2], t[0] * ref[1] - t[1] * ref[0]]; const ul = Math.hypot(...u) || 1; u = u.map((q) => q / ul);
    const v = [t[1] * u[2] - t[2] * u[1], t[2] * u[0] - t[0] * u[2], t[0] * u[1] - t[1] * u[0]]; const r = radii[k]; rings.push({ c: pts[k], u: u.map((q) => q * r), v: v.map((q) => q * r) });
  }
  loft(gb, rings, seg, (t) => colAt(t));
}
// Ellipsoid-ish closed body along z: prof = [[z, rx, ryTop, ryBottom, yc, xc?]...]; the top/bottom radii differ (birds are deeper below)
function bodyLoft(gb, prof, seg, col) {
  const rings = prof.map(([z, rx, ryt, ryb, yc, xc = 0]) => ({ c: [xc, yc, z], u: [rx, 0, 0], v: [0, (ryt + ryb) / 2, 0], ryt, ryb }));
  const base = gb.n; loft(gb, rings, seg, col);
  // squash the lower half (ryb) vs the upper half (ryt): adjust y of ring vertices after the fact
  for (let k = 0; k < rings.length; k++) { const r = rings[k]; const m = (r.ryt + r.ryb) / 2; for (let s = 0; s < seg; s++) { const vi = base + k * seg + s; const y = gb.p[vi * 3 + 1] - r.c[1]; gb.p[vi * 3 + 1] = r.c[1] + y * (y >= 0 ? r.ryt / m : r.ryb / m); } }
}
// One feather: base point, unit direction `d`, unit surface normal `nrm`; vane widths (inner/outer side), length, downward curl
function feather(gb, base, d, nrm, len, wIn, wOut, curl, col, steps = 7) {
  const side = [d[1] * nrm[2] - d[2] * nrm[1], d[2] * nrm[0] - d[0] * nrm[2], d[0] * nrm[1] - d[1] * nrm[0]]; const idx = [];
  for (let s = 0; s <= steps; s++) {
    const t = s / steps; const prof = t < 0.12 ? 0.35 + 0.65 * (t / 0.12) : Math.pow(Math.max(0, 1 - Math.pow((t - 0.12) / 0.88, 3.2)), 0.5); // quill → full vane → rounded tip
    const along = len * t, drop = curl * len * t * t; const cx = base[0] + d[0] * along - nrm[0] * drop, cy = base[1] + d[1] * along - nrm[1] * drop, cz = base[2] + d[2] * along - nrm[2] * drop;
    const ridge = (wIn + wOut) * 0.09 * prof; const a = wIn * prof, b = wOut * prof; const cc = col(t);
    const L = gb.v(cx + side[0] * a - nrm[0] * ridge * 0.4, cy + side[1] * a - nrm[1] * ridge * 0.4, cz + side[2] * a - nrm[2] * ridge * 0.4, col(t, -1));
    const M = gb.v(cx + nrm[0] * ridge, cy + nrm[1] * ridge, cz + nrm[2] * ridge, cc);
    const R = gb.v(cx - side[0] * b - nrm[0] * ridge * 0.4, cy - side[1] * b - nrm[1] * ridge * 0.4, cz - side[2] * b - nrm[2] * ridge * 0.4, col(t, 1));
    idx.push([L, M, R]);
  }
  for (let s = 0; s < steps; s++) { const [a0, b0, c0] = idx[s], [a1, b1, c1] = idx[s + 1]; gb.t(a0, b0, a1); gb.t(b0, b1, a1); gb.t(b0, c0, b1); gb.t(c0, c1, b1); }
}
// icosphere eye: iris colour ring + black pupil facing `axis`, glossy dark rim
function eye(gb, c, r, axis, iris, pupil = [0.01, 0.01, 0.012], ring = null) {
  const g = new THREE.IcosahedronGeometry(r, 2); const p = g.attributes.position; const base = gb.n; const al = Math.hypot(...axis); const ax = axis.map((q) => q / al);
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); const dt = (x * ax[0] + y * ax[1] + z * ax[2]) / r; const colr = dt > 0.82 ? pupil : dt > 0.5 ? iris : ring && dt > 0.25 ? ring : [0.04, 0.035, 0.03]; gb.v(c[0] + x, c[1] + y, c[2] + z, colr); }
  const ix = g.index ? g.index.array : null; if (ix) for (let i = 0; i < ix.length; i += 3) gb.t(base + ix[i], base + ix[i + 1], base + ix[i + 2]); else for (let i = 0; i < p.count; i += 3) gb.t(base + i, base + i + 1, base + i + 2);
}
const norm = (v) => { const l = Math.hypot(...v) || 1; return v.map((q) => q / l); };
const jitter = (c, i, amt = 0.06) => { const k = 1 + (hashf(i) - 0.5) * amt; return [c[0] * k, c[1] * k, c[2] * k]; };
function mirrorX(geo) { const g = geo.clone(); const p = g.attributes.position; for (let i = 0; i < p.count; i++) p.setX(i, -p.getX(i)); const ix = g.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; } g.index.needsUpdate = true; g.computeVertexNormals(); g.computeBoundingSphere(); return g; }

// ------------------------------------------------------------------ species
// Joint layout (bird space). shoulder: left wing pivot (+x side); innerLen: shoulder → wrist; neck: head pivot; tail: tail
// pivot; hip: left leg pivot; stand: height of the body origin above the feet when standing; pitch: resting body pitch.
export const SPECIES = {
  crow: { name: 'House crow', len: 0.42, shoulder: [0.034, 0.026, 0.035], innerLen: 0.125, neck: [0, 0.03, 0.085], tail: [0, 0.006, -0.088], hip: [0.017, -0.032, -0.004], stand: 0.098, pitch: -0.12, headPitch: 0.1, flapHz: 3.6, glide: 0.45, cruise: 9.5, flee: 5.5, walk: 0.55, hop: true, rough: 0.5 },
  pigeon: { name: 'Rock pigeon', len: 0.32, shoulder: [0.036, 0.024, 0.03], innerLen: 0.105, neck: [0, 0.034, 0.074], tail: [0, 0.008, -0.083], hip: [0.016, -0.038, -0.002], stand: 0.082, pitch: -0.22, headPitch: 0.05, flapHz: 5.8, glide: 0.2, cruise: 12, flee: 3.6, walk: 0.5, bob: true, rough: 0.6 },
  parakeet: { name: 'Rose-ringed parakeet', len: 0.4, shoulder: [0.026, 0.02, 0.026], innerLen: 0.07, neck: [0, 0.026, 0.06], tail: [0, 0.0, -0.062], hip: [0.012, -0.028, 0.004], stand: 0.062, pitch: -0.38, headPitch: 0.25, flapHz: 8, glide: 0.08, cruise: 13, flee: 8, walk: 0.25, rough: 0.5 },
};

function speciesParts(sp) {
  const S = SPECIES[sp]; const P = {};
  // ---- palette
  const pal = sp === 'crow' ? { body: lin('#141418'), gloss: lin('#1c1f2c'), collar: lin('#56575b'), collarLt: lin('#6a6b6f'), wing: lin('#121318'), prim: lin('#0d0d10'), bill: lin('#0b0b0c'), leg: lin('#141414'), iris: lin('#3a2416') }
    : sp === 'pigeon' ? { body: lin('#8b95a2'), back: lin('#9aa3ae'), head: lin('#6f7886'), neckG: lin('#3f8a6a'), neckP: lin('#80548f'), breast: lin('#86808f'), rump: lin('#e4e7ea'), wing: lin('#98a0ab'), bar: lin('#202226'), prim: lin('#4b4f57'), tail: lin('#7f8794'), band: lin('#24262b'), bill: lin('#3a3a3e'), cere: lin('#eef0ec'), leg: lin('#c4515a'), iris: lin('#e2711f') }
      : { body: lin('#5cbf3e'), belly: lin('#a8d85a'), head: lin('#62c847'), cheek: lin('#7fd458'), ringB: lin('#111111'), ringR: lin('#e78aa8'), wing: lin('#47a536'), prim: lin('#2e7a37'), tail: lin('#4fa79c'), tailTip: lin('#d7d86a'), bill: lin('#d0202c'), billLo: lin('#2a1a1a'), leg: lin('#8a8d92'), iris: lin('#f2e9a8'), orbit: lin('#e9a24a') };

  // ---- body (with neck) ----------------------------------------------------------------------------------
  const prof = sp === 'crow' ? [[-0.098, 0.010, 0.008, 0.008, 0.004], [-0.082, 0.024, 0.018, 0.02, 0.004], [-0.06, 0.037, 0.03, 0.035, 0.002], [-0.035, 0.047, 0.04, 0.047, 0], [-0.008, 0.053, 0.046, 0.054, 0], [0.02, 0.054, 0.047, 0.056, 0.002], [0.045, 0.05, 0.044, 0.052, 0.006], [0.066, 0.04, 0.036, 0.042, 0.014], [0.082, 0.03, 0.028, 0.03, 0.024], [0.094, 0.024, 0.023, 0.024, 0.031]]
    : sp === 'pigeon' ? [[-0.092, 0.012, 0.008, 0.009, 0.006], [-0.075, 0.027, 0.02, 0.022, 0.005], [-0.052, 0.042, 0.034, 0.04, 0.002], [-0.025, 0.053, 0.044, 0.054, 0], [0.004, 0.058, 0.048, 0.062, -0.002], [0.03, 0.056, 0.047, 0.062, 0.002], [0.05, 0.046, 0.04, 0.052, 0.01], [0.064, 0.032, 0.03, 0.036, 0.02], [0.075, 0.022, 0.021, 0.024, 0.03], [0.083, 0.018, 0.018, 0.019, 0.037]]
      : [[-0.068, 0.008, 0.006, 0.007, 0.002], [-0.055, 0.018, 0.014, 0.016, 0.002], [-0.036, 0.028, 0.024, 0.029, 0], [-0.014, 0.034, 0.029, 0.036, 0], [0.01, 0.036, 0.031, 0.038, 0.002], [0.03, 0.033, 0.03, 0.034, 0.006], [0.046, 0.026, 0.025, 0.027, 0.013], [0.058, 0.02, 0.02, 0.021, 0.021], [0.066, 0.017, 0.017, 0.018, 0.027]];
  {
    const gb = new GB(); let vi = 0;
    bodyLoft(gb, prof, 22, (t, a, p) => {
      vi++; const up = Math.sin(a), z = p[2]; let c;
      if (sp === 'crow') { const collar = sm(0.048, 0.076, z) * (1 - sm(0.084, 0.095, z) * sm(-0.2, -0.75, up)); c = mix(mix(pal.body, pal.gloss, Math.max(0, up) * 0.6), mix(pal.collar, pal.collarLt, Math.max(0, -up) * 0.5), collar); }
      else if (sp === 'pigeon') { const neck = sm(0.05, 0.068, z) * (1 - 0.35 * sm(0.078, 0.088, z)); const irid = 0.5 + 0.5 * Math.sin(a * 2 + z * 120); c = mix(mix(pal.body, pal.back, Math.max(0, up)), pal.breast, Math.max(0, -up) * sm(0.0, 0.04, z)); c = mix(c, mix(pal.neckG, pal.neckP, irid), neck * 0.62); c = mix(c, pal.head, sm(0.075, 0.085, z)); c = mix(c, pal.rump, sm(-0.05, -0.07, z) * sm(0.2, 0.7, up)); }
      else { c = mix(pal.body, pal.belly, Math.max(0, -up) * 0.85); c = mix(c, pal.head, sm(0.04, 0.06, z)); const ring = sm(0.05, 0.054, z) * (1 - sm(0.06, 0.064, z)); c = mix(c, up < -0.15 ? pal.ringB : up < 0.35 ? mix(pal.ringB, pal.ringR, sm(-0.15, 0.35, up)) : pal.ringR, ring); } // male neck ring: black throat band into a rose collar
      return jitter(c, vi * 7.3, 0.07);
    });
    P.body = gb.build();
  }
  // ---- head (skull + bill + eyes); pivot at the neck joint, looking +z ----------------------------------------
  {
    const gb = new GB(); const hr = sp === 'crow' ? 0.029 : sp === 'pigeon' ? 0.022 : 0.022; const hl = hr * 1.25; const rings = [];
    for (let k = 0; k <= 12; k++) { const t = k / 12; const z = -hl * 0.55 + t * hl * 1.45; const e = Math.sin(Math.PI * Math.min(1, t * 1.02)); const rr = hr * Math.pow(Math.max(0.02, e), 0.62); rings.push({ c: [0, hr * 0.15 + (sp === 'crow' ? 0.004 * t : 0), z], u: [rr * 0.92, 0, 0], v: [0, rr, 0] }); }
    let vi = 0;
    loft(gb, rings, 20, (t, a, p) => {
      vi++; const up = Math.sin(a); let c;
      if (sp === 'crow') c = mix(pal.body, pal.collar, sm(0.25, -0.05, t) * sm(-0.3, 0.4, up) * 0.9); // black face/crown, grey nape behind
      else if (sp === 'pigeon') c = pal.head;
      else { c = mix(pal.head, pal.cheek, Math.max(0, -up) * 0.6 * sm(0.3, 0.8, t)); const ringBand = sm(0.08, 0.02, t) * (1 - sm(0.6, 0.95, up)); c = mix(c, up < -0.1 ? pal.ringB : pal.ringR, ringBand); }
      return jitter(c, vi * 3.1, 0.05);
    });
    // bill: lofted from the face forward; crow heavy and slightly decurved, pigeon short with white cere, parakeet hooked red
    const bl = sp === 'crow' ? 0.05 : sp === 'pigeon' ? 0.02 : 0.026; const bh = sp === 'crow' ? 0.0125 : sp === 'pigeon' ? 0.0052 : 0.0125; const bz0 = hl * 0.7;
    const br = []; for (let k = 0; k <= 12; k++) { const t = k / 12; const hook = sp === 'parakeet' ? -0.95 * bh * Math.pow(t, 2.2) * 1.6 : sp === 'crow' ? -0.35 * bh * t * t : -0.2 * bh * t * t; const r = bh * Math.pow(1 - t, sp === 'parakeet' ? 0.75 : 0.9) + 0.0006; br.push({ c: [0, hr * 0.05 + hook, bz0 + t * bl * (sp === 'parakeet' ? 0.75 : 1)], u: [r * (sp === 'parakeet' ? 0.75 : 0.62), 0, 0], v: [0, r, 0] }); }
    loft(gb, br, 14, (t, a) => { const up = Math.sin(a); if (sp === 'pigeon') return t < 0.32 && up > 0.1 ? pal.cere : pal.bill; if (sp === 'parakeet') return up < -0.4 && t < 0.55 ? pal.billLo : mix(pal.bill, lin('#8a1018'), t * 0.5); return mix(pal.bill, lin('#26262a'), Math.max(0, up) * 0.4); });
    if (sp === 'parakeet') { const lo = []; for (let k = 0; k <= 6; k++) { const t = k / 6; const r = bh * 0.55 * (1 - t) + 0.0005; lo.push({ c: [0, hr * 0.05 - bh * 0.9, bz0 - 0.002 + t * bl * 0.38], u: [r * 0.8, 0, 0], v: [0, r * 0.7, 0] }); } loft(gb, lo, 10, () => pal.billLo); }
    // eyes on the sides of the head (birds see sideways), slightly forward
    const ex = hr * 0.78, ey = hr * 0.33, ez = hl * 0.22; const er = hr * (sp === 'pigeon' ? 0.24 : 0.2);
    for (const sx of [1, -1]) eye(gb, [sx * ex, ey, ez], er, [sx * 0.85, 0.12, 0.5], pal.iris, undefined, sp === 'parakeet' ? pal.orbit : sp === 'pigeon' ? lin('#d7cfc0') : null);
    P.head = gb.build(); P.headLen = hl; P.headR = hr;
  }
  // ---- wings (left; the right wing is the mirror image) --------------------------------------------------------
  const W = sp === 'crow' ? { chord: 0.085, sec: 10, secLen: 0.105, secW: 0.013, hand: 0.06, prim: 10, primLen: 0.19, primW: 0.012, slot: 0.55 }
    : sp === 'pigeon' ? { chord: 0.07, sec: 10, secLen: 0.09, secW: 0.012, hand: 0.055, prim: 10, primLen: 0.165, primW: 0.0115, slot: 0.9 }
      : { chord: 0.052, sec: 9, secLen: 0.066, secW: 0.0092, hand: 0.038, prim: 10, primLen: 0.122, primW: 0.0088, slot: 0.95 };
  const L1 = S.innerLen;
  const wingCol = (kind, i, n) => (t, side = 0) => {
    let c;
    if (sp === 'crow') c = kind === 'prim' ? mix(pal.prim, pal.gloss, 0.25 * (1 - t)) : mix(pal.wing, pal.gloss, 0.4 * (1 - t));
    else if (sp === 'pigeon') { if (kind === 'prim') c = mix(pal.wing, pal.prim, sm(0.35, 0.75, t)); else if (kind === 'sec') c = t > 0.62 && t < 0.86 ? pal.bar : mix(pal.wing, pal.back, 0.3); else if (kind === 'cov') c = t > 0.66 && t < 0.95 ? pal.bar : pal.wing; else c = pal.wing; }
    else c = kind === 'prim' ? mix(pal.wing, pal.prim, sm(0.15, 0.6, t)) : kind === 'sec' ? mix(pal.wing, pal.prim, sm(0.5, 0.9, t) * 0.6) : pal.wing;
    return jitter(side ? mix(c, [0, 0, 0], 0.12) : c, i * 13.7 + t * 5, 0.05);
  };
  {
    const gb = new GB(); // inner wing: arm (covert loft) + secondaries + greater coverts
    const rings = []; for (let k = 0; k <= 8; k++) { const t = k / 8; const half = W.chord * (0.36 - 0.06 * t) * (t < 0.08 ? 0.7 + t * 3.7 : 1); rings.push({ c: [t * L1, 0.002 * Math.sin(t * Math.PI), W.chord * 0.1 - half * 0.25], u: [0, 0, half], v: [0, 0.0065 * (1 - 0.3 * t), 0] }); }
    loft(gb, rings, 14, (t) => jitter(sp === 'pigeon' ? pal.wing : sp === 'crow' ? pal.wing : pal.wing, t * 40, 0.06));
    for (let i = 0; i < W.sec; i++) { const t = (i + 0.5) / W.sec; const x = t * L1 * 0.98; const d = norm([0.08 + 0.32 * t, -0.02, -1]); feather(gb, [x, -0.0012 * i * 0.2, -W.chord * 0.12], d, [0, 1, 0], W.secLen * (0.92 + 0.08 * Math.sin(t * 3)), W.secW * 0.8, W.secW, 0.06, wingCol('sec', i, W.sec)); }
    for (let i = 0; i < W.sec; i++) { const t = (i + 0.3) / W.sec; const x = t * L1 * 0.98; const d = norm([0.12 + 0.2 * t, -0.03, -1]); feather(gb, [x, 0.0032, -W.chord * 0.02], d, [0, 1, 0], W.secLen * 0.48, W.secW * 0.7, W.secW * 0.85, 0.04, wingCol('cov', i, W.sec), 5); }
    for (let i = 0; i < W.sec + 2; i++) { const t = (i + 0.2) / (W.sec + 2); const d = norm([0.1 + 0.25 * t, -0.04, -1]); feather(gb, [t * L1, 0.0058, W.chord * 0.06], d, [0, 1, 0], W.secLen * 0.26, W.secW * 0.6, W.secW * 0.7, 0.03, wingCol('lesser', i, W.sec), 4); }
    P.wingIn = gb.build();
  }
  {
    const gb = new GB(); // outer wing (hand): primary coverts loft + fanned primaries (outermost slotted in crows)
    const rings = []; for (let k = 0; k <= 6; k++) { const t = k / 6; const half = W.chord * (0.3 - 0.14 * t); rings.push({ c: [t * W.hand, 0.001, W.chord * 0.1 - half * 0.25], u: [0, 0, half], v: [0, 0.0055 * (1 - 0.4 * t), 0] }); }
    loft(gb, rings, 12, (t) => jitter(pal.wing, t * 31, 0.06));
    for (let i = 0; i < W.prim; i++) {
      const t = i / (W.prim - 1); const th = -1.32 + 1.12 * Math.pow(t, 0.9); const d = norm([Math.cos(th), -0.015, Math.sin(th)]);
      const len = W.primLen * (0.62 + 0.38 * Math.sin(Math.min(1, t * 1.12) * Math.PI / 2)) * (t > 0.95 ? 0.93 : 1); const slot = 1 - (1 - W.slot) * sm(0.6, 1, t);
      feather(gb, [W.hand * (0.15 + 0.85 * t), -0.0008 * (W.prim - i), -W.chord * 0.05 * (1 - t)], d, [0, 1, 0], len, W.primW * 0.55 * slot, W.primW * slot, 0.05, wingCol('prim', i + 40, W.prim), 8);
    }
    for (let i = 0; i < W.prim - 2; i++) { const t = i / (W.prim - 3); const th = -1.2 + 0.95 * t; const d = norm([Math.cos(th), -0.03, Math.sin(th)]); feather(gb, [W.hand * (0.1 + 0.8 * t), 0.0035, W.chord * 0.02], d, [0, 1, 0], W.primLen * 0.3, W.primW * 0.55, W.primW * 0.75, 0.03, wingCol('cov', i + 80, W.prim), 5); }
    P.wingOut = gb.build();
  }
  P.wingInR = mirrorX(P.wingIn); P.wingOutR = mirrorX(P.wingOut);
  // ---- folded wing (left): a closed wing lying on the flank, built against the body surface ------------------------
  // smooth shoulder coverts, then overlapping rows (greater coverts → secondaries/tertials → primaries) whose tips step
  // back to a point over the tail, exactly like a perched bird's wing. Shown while perched/walking; the articulated
  // open wing takes over in the first instant of take-off.
  {
    const gb = new GB(); const at = (z) => { // body cross-section at z (interpolated from the loft profile)
      let i = 0; while (i < prof.length - 2 && prof[i + 1][0] < z) i++; const a = prof[i], b = prof[i + 1]; const t = Math.min(1, Math.max(0, (z - a[0]) / (b[0] - a[0]))); return { rx: a[1] + (b[1] - a[1]) * t, ryt: a[2] + (b[2] - a[2]) * t, ryb: a[3] + (b[3] - a[3]) * t, yc: a[4] + (b[4] - a[4]) * t }; };
    const surf = (y, z, off) => { const c = at(Math.max(prof[0][0] + 0.004, z)); const ry = y >= c.yc ? c.ryt : c.ryb; const k = Math.min(0.97, Math.abs(y - c.yc) / ry); return Math.max(0.006, c.rx * Math.sqrt(1 - k * k)) + off; };
    const tailLen = sp === 'crow' ? 0.165 : sp === 'pigeon' ? 0.118 : 0.235; const z0 = S.shoulder[2] + 0.012; const zTip = S.tail[2] - tailLen * (sp === 'crow' ? 0.5 : sp === 'pigeon' ? 0.72 : 0.3);
    const yTop = S.shoulder[1] + 0.004, yBot = sp === 'parakeet' ? -0.02 : -0.03;
    const fcol = (kind, i) => (t, side = 0) => { let c;
      if (sp === 'crow') c = kind === 'prim' ? mix(pal.prim, pal.gloss, 0.35 * (1 - t)) : mix(pal.wing, pal.gloss, 0.45 * (1 - t));
      else if (sp === 'pigeon') c = kind === 'prim' ? mix(pal.wing, pal.prim, sm(0.3, 0.8, t)) : kind === 'sec' ? (t > 0.7 && t < 0.92 ? pal.bar : mix(pal.wing, pal.back, 0.2)) : kind === 'gc' ? (t > 0.62 && t < 0.9 ? pal.bar : pal.wing) : pal.wing;
      else c = kind === 'prim' ? mix(pal.wing, pal.prim, sm(0.2, 0.7, t)) : kind === 'sec' ? mix(pal.wing, pal.prim, sm(0.6, 1, t) * 0.5) : pal.wing;
      return jitter(side ? mix(c, [0, 0, 0], 0.1) : c, i * 17.3 + t * 7, 0.05); };
    // a feather lying along the flank from (y, z) back by `len`, sloping by `dy`; follows the body taper; layer = stacking order
    const lie = (y, z, len, dy, w, kind, i, layer) => { const zE = z - len, yE = y + dy; const x0 = surf(y, z, 0.0025 + layer * 0.0016), x1 = surf(yE, zE, 0.0025 + layer * 0.0016); const d = norm([x1 - x0, dy, -len]); const nrm = norm([1, 0.25 + (y - S.shoulder[1]) * 4, (x1 - x0) / len * 0.5]); feather(gb, [x0, y, z], d, nrm, Math.hypot(x1 - x0, dy, len), w * 0.5, w * 0.5, 0.012, fcol(kind, i), 7); };
    const H = yTop - yBot;
    // primaries (bottom layer): stacked, tips stepping back to the wing point
    const np = 8; for (let i = 0; i < np; i++) { const u = i / (np - 1); const y = yBot + H * (0.18 + 0.38 * u); const z = z0 - 0.045 - 0.01 * u; const tip = zTip + (1 - u) * 0.003 + u * 0.03; lie(y, z, z - tip, -H * 0.12 + (0.5 - u) * 0.01, W.primW * 2.2, 'prim', i, 0); }
    // secondaries + tertials over them
    const ns = 8; for (let i = 0; i < ns; i++) { const u = i / (ns - 1); const y = yBot + H * (0.1 + 0.62 * u); const z = z0 - 0.022 - 0.006 * u; const len = (z0 - zTip) * (0.5 + 0.12 * u); lie(y, z, len, -H * 0.12, W.secW * 2.3, 'sec', i, 1 + u * 0.4); }
    for (let i = 0; i < 3; i++) { const y = yTop - H * (0.06 + 0.1 * i); lie(y, z0 - 0.03 - 0.006 * i, (z0 - zTip) * (0.55 - 0.05 * i), -H * 0.04, W.secW * 2.8, 'sec', i + 20, 2.2 + i * 0.1); }
    // greater coverts row
    const ng = 9; for (let i = 0; i < ng; i++) { const u = i / (ng - 1); const y = yBot + H * (0.22 + 0.62 * u); const z = z0 - 0.006 - 0.004 * u; lie(y, z, (z0 - zTip) * 0.24, -H * 0.06, W.secW * 1.9, 'gc', i, 3 + u * 0.3); }
    // smooth shoulder (lesser/median coverts): a thin lens conforming to the flank
    const rings = []; const cz0 = z0 + 0.004, cz1 = z0 - (z0 - zTip) * 0.26;
    for (let k = 0; k <= 10; k++) { const t = k / 10; const z = cz0 + (cz1 - cz0) * t; const h = H * 0.42 * Math.sin(Math.PI * Math.min(1, 0.08 + t * 0.95)) + 0.002; const yc = yTop - H * 0.36 - t * H * 0.04; const x = surf(yc, z, 0.0042); const xT = surf(yc + h, z, 0.0035), xB = surf(yc - h, z, 0.0035); rings.push({ c: [x, yc, z], u: [(xT - xB) / 2, h, 0], v: [0.0016 * Math.sin(Math.PI * t) + 0.0008, 0, 0] }); }
    loft(gb, rings, 14, (t, a) => jitter(sp === 'pigeon' ? mix(pal.wing, pal.back, 0.3) : pal.wing, t * 50 + a, 0.05));
    P.fold = gb.build(); P.foldR = mirrorX(P.fold);
  }
  // ---- tail (fanned rectrices + upper coverts); pivot at the tail base, pointing −z ---------------------------------
  {
    const gb = new GB(); const n = 12; const T = sp === 'crow' ? { len: 0.165, w: 0.016, spread: 0.22 } : sp === 'pigeon' ? { len: 0.118, w: 0.017, spread: 0.3 } : { len: 0.235, w: 0.0105, spread: 0.12 };
    const order = [...Array(n).keys()].sort((a, b) => Math.abs(b - (n - 1) / 2) - Math.abs(a - (n - 1) / 2)); // outer feathers first (underneath)
    for (const i of order) {
      const u = (i - (n - 1) / 2) / ((n - 1) / 2); const th = u * T.spread; const d = norm([Math.sin(th), -0.04, -Math.cos(th)]);
      const len = sp === 'parakeet' ? T.len * (0.36 + 0.64 * Math.pow(1 - Math.abs(u), 2.2)) : sp === 'crow' ? T.len * (1 - 0.1 * u * u) : T.len * (0.97 + 0.03 * u * u);
      const lay = (1 - Math.abs(u)) * 0.003;
      feather(gb, [u * 0.008, lay, 0.006], d, [0, 1, 0], len, T.w * 0.75, T.w * 0.75, 0.025, (t, side = 0) => {
        let c; if (sp === 'crow') c = mix(pal.wing, pal.gloss, 0.35 * (1 - t)); else if (sp === 'pigeon') c = t > 0.8 ? pal.band : Math.abs(u) > 0.9 && side ? pal.rump : pal.tail; else c = mix(pal.tail, pal.tailTip, sm(0.75, 1, t) * (Math.abs(u) > 0.2 ? 1 : 0.3));
        return jitter(c, i * 9.1 + t * 3, 0.05);
      }, 9);
    }
    for (let i = 0; i < 7; i++) { const u = (i - 3) / 3; const d = norm([u * 0.25, -0.02, -1]); feather(gb, [u * 0.012, 0.007, 0.014], d, [0, 1, 0], T.len * 0.34, T.w * 0.8, T.w * 0.8, 0.02, (t) => jitter(sp === 'pigeon' ? mix(pal.rump, pal.tail, t) : sp === 'crow' ? pal.wing : pal.body, i * 5.3 + t, 0.05), 5); }
    P.tail = gb.build();
  }
  // ---- legs (left; tarsus + toes; hip pivot); the right leg is mirrored ---------------------------------------------
  {
    const gb = new GB(); const tar = S.stand + S.hip[1] - 0.006; const r = sp === 'crow' ? 0.0034 : sp === 'pigeon' ? 0.003 : 0.0026; const toeL = sp === 'crow' ? 0.034 : sp === 'pigeon' ? 0.028 : 0.022;
    const lc = () => pal.leg; const knee = [0, -0.012, -0.004], ankle = [0, -tar, 0.004];
    tube(gb, [[0, 0.004, 0], knee, [0, -tar * 0.55, 0.002], ankle], [r * 1.8, r * 1.3, r, r * 1.1], 8, lc);
    const toes = sp === 'parakeet' ? [[0.3, 1], [-0.25, 1], [0.6, -1], [-0.1, -1]] : [[0.42, 1], [0, 1.08], [-0.42, 1], [0, -0.62]];
    for (const [a, l] of toes) { const dir = l > 0 ? [Math.sin(a), 0, Math.cos(a)] : [Math.sin(a) * 0.5, 0, -1]; const L = toeL * Math.abs(l); const p0 = [ankle[0], ankle[1], ankle[2]]; const p1 = [p0[0] + dir[0] * L * 0.5, p0[1] - 0.0035, p0[2] + dir[2] * L * 0.5]; const p2 = [p0[0] + dir[0] * L, p0[1] - 0.004, p0[2] + dir[2] * L]; tube(gb, [p0, p1, p2], [r * 0.85, r * 0.7, r * 0.35], 6, lc); }
    P.leg = gb.build(); P.legR = mirrorX(P.leg);
  }
  return P;
}

const CACHE = {};
export function birdParts(sp) { return CACHE[sp] || (CACHE[sp] = speciesParts(sp)); }
export const PART_NAMES = ['body', 'head', 'wingIn', 'wingOut', 'wingInR', 'wingOutR', 'tail', 'leg', 'legR', 'fold', 'foldR'];
export function triangleCount(sp) { const P = birdParts(sp); return PART_NAMES.reduce((n, k) => n + P[k].index.count / 3, 0); }
