// Protagonist hats (wardrobe): built in head-local space (eye level y = 0, +z forward, metres) round the head's hat-fit
// map (HeroHead.js hatMap — the outermost skin + flattened-hair surface per direction from a centre in the skull), so every
// crown encloses the head and hair under it; nothing can poke through. Rigid child of the head bone like the glasses (the
// first-person head collapse hides it too). One mesh + one material per hat; fabric grain from a tiny shared canvas
// texture (map + bump), no extra texture memory to speak of.
import * as THREE from 'three';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const hex = (h) => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };
const mul = (c, k) => c.map((v) => v * k);

// ---- fabric grain textures (128², generated once)
const TEX = {};
function grain(kind) {
  if (TEX[kind]) return TEX[kind];
  const N = 128; const cv = typeof document !== 'undefined' ? document.createElement('canvas') : null; if (!cv) return null; cv.width = cv.height = N; const g = cv.getContext('2d'); const im = g.createImageData(N, N);
  let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { let v = 0.8;
    if (kind === 'twill') { const d = (x + y * 2) % 8; v = 0.72 + 0.2 * (d < 4 ? d / 4 : (8 - d) / 4) + 0.08 * rnd(); }
    else if (kind === 'felt') v = 0.78 + 0.16 * rnd() * rnd() + 0.06 * Math.sin(x * 0.7 + y * 0.3) * rnd();
    else if (kind === 'straw') { const bx = Math.floor(x / 8), by = Math.floor(y / 8); const over = (bx + by) % 2 === 0; const t = over ? (y % 8) / 8 : (x % 8) / 8; v = 0.62 + 0.3 * Math.sin(t * Math.PI) + 0.08 * rnd(); if ((over ? x % 8 : y % 8) === 0) v *= 0.7; }
    else if (kind === 'knit') { const col = x % 8; const ch = Math.abs(((y + (col < 4 ? col : 8 - col)) % 6) - 3) / 3; v = (col === 0 || col === 4 ? 0.55 : 0.8) + 0.18 * ch + 0.05 * rnd(); }
    const c = Math.round(clamp(v, 0, 1) * 255); const i = (y * N + x) * 4; im.data[i] = im.data[i + 1] = im.data[i + 2] = c; im.data[i + 3] = 255; }
  g.putImageData(im, 0, 0); const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.NoColorSpace; t.anisotropy = 2; TEX[kind] = t; return t;
}

// ---- geometry accumulator
class G {
  constructor() { this.p = []; this.n = []; this.c = []; this.uv = []; this.i = []; }
  v(p, n, c, uv) { this.p.push(p[0], p[1], p[2]); const l = Math.hypot(n[0], n[1], n[2]) || 1; this.n.push(n[0] / l, n[1] / l, n[2] / l); this.c.push(c[0], c[1], c[2]); this.uv.push(uv[0], uv[1]); return this.p.length / 3 - 1; }
  // grid of rows P[r][c] (points), colour fn, closed in c?; normals from the surface, flipped to face away from ctr(r, c)
  grid(P, colFn, closed, out, uvFn) {
    const R = P.length, Cn = P[0].length; const base = this.p.length / 3; const at = (r, c) => P[clamp(r, 0, R - 1)][closed ? (c + Cn) % Cn : clamp(c, 0, Cn - 1)];
    for (let r = 0; r < R; r++) for (let c = 0; c < Cn; c++) { const a = at(r, c + 1), b = at(r, c - 1), u = at(r + 1, c), d = at(r - 1, c);
      const tx = [a[0] - b[0], a[1] - b[1], a[2] - b[2]], ty = [u[0] - d[0], u[1] - d[1], u[2] - d[2]]; let n = [tx[1] * ty[2] - tx[2] * ty[1], tx[2] * ty[0] - tx[0] * ty[2], tx[0] * ty[1] - tx[1] * ty[0]];
      const o = out(r, c, P[r][c]); if (n[0] * o[0] + n[1] * o[1] + n[2] * o[2] < 0) n = n.map((x) => -x); if (Math.hypot(...n) < 1e-12) n = o;
      this.v(P[r][c], n, colFn(r, c), uvFn ? uvFn(r, c) : [c / Cn, r / R]); }
    const cols = closed ? Cn : Cn - 1;
    for (let r = 0; r < R - 1; r++) for (let c = 0; c < cols; c++) { const c2 = (c + 1) % Cn; const a = base + r * Cn + c, b = base + r * Cn + c2, cc = base + (r + 1) * Cn + c, d = base + (r + 1) * Cn + c2;
      // orient each quad along its vertex normals
      const pa = P[r][c], pb = P[r][c2], pc = P[r + 1][c]; const e1 = [pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]], e2 = [pc[0] - pa[0], pc[1] - pa[1], pc[2] - pa[2]]; const fn = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      const na = [this.n[a * 3], this.n[a * 3 + 1], this.n[a * 3 + 2]]; if (fn[0] * na[0] + fn[1] * na[1] + fn[2] * na[2] >= 0) this.i.push(a, b, cc, b, d, cc); else this.i.push(a, cc, b, b, cc, d); }
  }
  geometry() { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2)); g.setIndex(this.i); g.computeBoundingSphere(); return g; }
}

// ---- the fitted head dome
function domeOf(M) {
  const { NA, NE, E0, E1, c, R } = M;
  const Rat = (th, el) => { const fi = (((th / (2 * Math.PI)) + 1) % 1) * NA - 0.5, fj = clamp((el - E0) / (E1 - E0) * NE - 0.5, 0, NE - 1.001); const i0 = Math.floor(fi), j0 = Math.floor(fj), ti = fi - i0, tj = fj - j0;
    const g = (i, j) => R[j * NA + ((i % NA) + NA) % NA]; return lerp(lerp(g(i0, j0), g(i0 + 1, j0), ti), lerp(g(i0, j0 + 1), g(i0 + 1, j0 + 1), ti), tj); };
  const pt = (th, el, r) => [c[0] + r * Math.cos(el) * Math.sin(th), c[1] + r * Math.sin(el), c[2] + r * Math.cos(el) * Math.cos(th)];
  const elAtY = (th, y, m = 0) => { let el = 0; for (let k = 0; k < 6; k++) el = Math.asin(clamp((y - c[1]) / (Rat(th, el) + m), -0.99, 0.999)); return el; };
  // horizontal radius of the dome at height y on azimuth th (0 above the top)
  const rhoAt = (th, y, m = 0) => { const top = c[1] + Rat(th, Math.PI / 2) + m; if (y >= top) return 0; const el = elAtY(th, y, m); return (Rat(th, el) + m) * Math.cos(el); };
  const topY = (m = 0) => c[1] + Rat(0, Math.PI / 2) + m;
  return { Rat, pt, elAtY, rhoAt, topY, c };
}
// band line round the head (head-local y): above the brows at the front, over the ears, onto the occiput at the back
function bandY(M, th, front = 0.052, back = -0.03) { const t = Math.pow((1 - Math.cos(th)) / 2, 1.2); let y = lerp(front, back, t); const side = sstep(0.9, 1.25, Math.abs(th)) * sstep(2.4, 2.0, Math.abs(th)); return Math.max(y, lerp(-1, M.earTop + 0.007, side)); }

// slab (stiff brim / visor): grid of mid-surface points + up normals → top, bottom and the outer edge
function slab(geo, P, Nup, thick, colTop, colBot, colEdge, closed, uvFn) {
  const R = P.length; const off = (r, c, s) => { const p = P[r][c], n = Nup[r][c]; return [p[0] + n[0] * thick * 0.5 * s, p[1] + n[1] * thick * 0.5 * s, p[2] + n[2] * thick * 0.5 * s]; };
  geo.grid(P.map((row, r) => row.map((_, c) => off(r, c, 1))), colTop, closed, (r, c) => Nup[r][c], uvFn);
  geo.grid(P.map((row, r) => row.map((_, c) => off(r, c, -1))), colBot, closed, (r, c) => Nup[r][c].map((x) => -x), uvFn);
  const last = R - 1; const Cn = P[0].length; const ctr = P[0].reduce((a, p) => [a[0] + p[0] / Cn, a[1] + p[1] / Cn, a[2] + p[2] / Cn], [0, 0, 0]);
  geo.grid([P[last].map((_, c) => off(last, c, 1)), P[last].map((_, c) => off(last, c, -1))], () => colEdge, closed, (r, c) => { const p = P[last][c]; return [p[0] - ctr[0], 0, p[2] - ctr[2]]; });
  if (!closed) for (const c of [0, Cn - 1]) geo.grid(P.map((row, r) => [off(r, c, 1), off(r, c, -1)]), () => colEdge, false, () => (c === 0 ? [-Math.cos(0), 0, 0] : [1, 0, 0]));
}

const MATS = new Map();
function hatMaterial(kind) {
  const key = kind; if (MATS.has(key)) return MATS.get(key);
  const tex = grain(kind === 'panama' ? 'straw' : kind === 'beanie' ? 'knit' : kind === 'fedora' || kind === 'trilby' ? 'felt' : 'twill');
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: kind === 'panama' ? 0.78 : kind === 'beanie' ? 0.97 : kind === 'fedora' || kind === 'trilby' ? 0.9 : 0.86, metalness: 0, map: tex, bumpMap: tex, bumpScale: kind === 'panama' ? 1.2 : 0.6, side: THREE.FrontSide });
  m.name = 'hat-' + kind; MATS.set(key, m); return m;
}

// ---- build
// hat: { kind, col, band }, M: hatMap from the head
export function buildHat(hat, M) {
  if (!hat || !M) return null;
  const D = domeOf(M); const geo = new G(); const col = hex(hat.col || '#222'), bandC = hex(hat.band || '#151515');
  const NA = hat.kind === 'beanie' ? 128 : 72; const kind = hat.kind;
  const ths = Array.from({ length: NA }, (_, i) => (i / NA) * Math.PI * 2 - Math.PI);
  const uvA = (r, c, NR) => [c / NA * 6, r / NR * 1.5];
  if (kind === 'cap' || kind === 'snap' || kind === 'beanie' || kind === 'bucket' || kind === 'flat') {
    const m = kind === 'beanie' ? 0.0055 : kind === 'bucket' ? 0.0055 : 0.0045; const NJ = 18;
    const by = (th) => (kind === 'beanie' ? bandY(M, th, 0.046, -0.04) : kind === 'bucket' ? bandY(M, th, 0.046, -0.022) : kind === 'flat' ? bandY(M, th, 0.05, -0.018) : bandY(M, th));
    const capTop = D.topY(m) + (kind === 'bucket' ? 0.01 : kind === 'flat' ? 0.004 : 0.0);
    const rows = []; for (let j = 0; j <= NJ; j++) { const row = []; for (let i = 0; i < NA; i++) { const th = ths[i]; const el0 = D.elAtY(th, by(th), m); const t = j / NJ; const el = lerp(el0, Math.PI / 2 - 0.02, Math.pow(t, 0.92));
      let r = D.Rat(th, el) + m; const front = sstep(1.3, 0.25, Math.abs(th));
      if (kind === 'snap') r += 0.011 * front * sstep(0.15, 0.7, t) * sstep(1.0, 0.75, t); // structured high front panels
      if (kind === 'cap') r += 0.004 * front * sstep(0.1, 0.6, t) * sstep(1.0, 0.7, t);
      if (kind === 'flat') r += 0.022 * front * Math.pow(Math.sin(Math.PI * clamp(t * 1.1, 0, 1)), 0.8); // flat cap: crown pulled forward over the peak
      if (kind === 'beanie') { r += 0.0007 * (i % 2) + 0.005 * sstep(0.55, 1.0, t); if (t < 0.24) r += 0.0042; } // ribs, slouch, turned-up cuff
      let p = D.pt(th, el, r); if (p[1] > capTop && (kind === 'bucket' || kind === 'flat')) p = [p[0], capTop + (p[1] - capTop) * 0.25, p[2]]; // flat-topped crowns
      row.push(p); } rows.push(row); }
    const seam = (i) => { const th = ths[i]; const k = ((th / (Math.PI / 3)) % 1 + 1) % 1; return Math.min(k, 1 - k) < 0.02; };
    geo.grid(rows, (r, c) => { let k = 1; if ((kind === 'cap' || kind === 'snap') && seam(c) && r > 0) k = 0.72; if (kind === 'beanie' && r <= 4) k = 0.93; if (kind === 'beanie' && r === 4) k = 0.78; if (kind === 'bucket' && (r === 3 || r === 6)) k = 0.8;
      if ((kind === 'cap' || kind === 'snap') && Math.abs(ths[c]) > 2.85 && r <= 3) k = r === 0 ? 0.3 : 0.25; return mul(col, k); }, true, (r, c, p) => [p[0] - D.c[0], p[1] - D.c[1] + 0.02, p[2] - D.c[2]], (r, c) => uvA(r, c, NJ));
    // top button (caps)
    if (kind === 'cap' || kind === 'snap') { const tp = D.pt(0, Math.PI / 2, D.Rat(0, Math.PI / 2) + m); const btn = []; for (let j = 0; j <= 3; j++) { const row = []; for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; const rr = 0.0075 * Math.cos(j / 3 * Math.PI / 2); row.push([tp[0] + Math.cos(a) * rr, tp[1] + 0.0025 * Math.sin(j / 3 * Math.PI / 2) + 0.0005, tp[2] + Math.sin(a) * rr]); } btn.push(row); }
      geo.grid(btn, () => col, true, (r, c, p) => [p[0] - tp[0], 0.5, p[2] - tp[2]]); }
    // peak / visor
    if (kind === 'cap' || kind === 'snap' || kind === 'flat') { const span = kind === 'flat' ? 0.85 : 0.98, Lc = kind === 'flat' ? 0.042 : kind === 'snap' ? 0.078 : 0.074; const NCv = 24, NRv = 4; const P = [], Nn = [];
      for (let r = 0; r <= NRv; r++) { const row = [], nr = []; for (let c = 0; c <= NCv; c++) { const th = lerp(-span, span, c / NCv); const el0 = D.elAtY(th, by(th), m); const b = D.pt(th, el0, D.Rat(th, el0) + m + 0.001); const q = th / span;
        const L = Lc * Math.pow(Math.max(0, 1 - q * q), 0.5) + 0.004; const t = r / NRv; const out = L * t; const curve = kind === 'cap' ? 0.014 * q * q * t : 0; const tilt = kind === 'flat' ? 0.42 : kind === 'snap' ? 0.06 : 0.17;
        row.push([b[0] + Math.sin(th) * out, b[1] - out * tilt - curve - 0.0015, b[2] + Math.cos(th) * out]); nr.push([0, 1, 0]); } P.push(row); Nn.push(nr); }
      const under = kind === 'snap' ? hex('#2f4a36') : mul(col, 0.7); slab(geo, P, Nn, 0.0032, () => col, () => under, mul(col, 0.8), false); }
    // snapback adjuster
    if (kind === 'snap' || kind === 'cap') { const th = Math.PI; const el0 = D.elAtY(th, by(th), m); const b = D.pt(th, el0, D.Rat(th, el0) + m); const P = [], Nn = [];
      for (let r = 0; r <= 1; r++) { const row = [], nr = []; for (let c = 0; c <= 6; c++) { const x = lerp(-0.026, 0.026, c / 6); row.push([x, b[1] + 0.004 + r * 0.011, b[2] - 0.0025]); nr.push([0, 0, -1]); } P.push(row); Nn.push(nr); }
      slab(geo, P, Nn, 0.002, () => hex('#18181a'), () => hex('#18181a'), hex('#101012'), false); }
    // bucket brim (soft, sloping, stitched)
    if (kind === 'bucket') { const NRb = 4; const P = [], Nn = []; for (let r = 0; r <= NRb; r++) { const row = [], nr = []; for (let i = 0; i < NA; i++) { const th = ths[i]; const el0 = D.elAtY(th, by(th), m); const b = D.pt(th, el0, D.Rat(th, el0) + m + 0.0005); const t = r / NRb; const W = 0.052 * t;
        row.push([b[0] + Math.sin(th) * W, b[1] - W * 0.62 - 0.002, b[2] + Math.cos(th) * W]); nr.push([Math.sin(th) * 0.5, 0.85, Math.cos(th) * 0.5]); } P.push(row); Nn.push(nr); }
      slab(geo, P, Nn, 0.0028, (r) => mul(col, r % 2 ? 0.86 : 0.97), () => mul(col, 0.8), mul(col, 0.85), true, (r, c) => [c / NA * 8, r / NRb]); }
  } else { // fedora / trilby / panama: a designed crown (tapered oval, teardrop crease, front pinch), ribbon band, stiff brim
    const Hc = kind === 'trilby' ? 0.098 : kind === 'panama' ? 0.108 : 0.112, Wb = kind === 'trilby' ? 0.038 : kind === 'panama' ? 0.064 : 0.058, m = 0.006;
    const by = (th) => bandY(M, th, 0.044, 0.0);
    const rho0 = ths.map((th) => D.rhoAt(th, by(th), m) + 0.002); const yb = ths.map((th) => by(th));
    const yTopMin = D.topY(m + 0.006); const NS = 10, NT = 7; const rows = [];
    const yTopAt = (i) => Math.max(yb[i] + Hc, yTopMin);
    for (let j = 0; j <= NS; j++) { const row = []; for (let i = 0; i < NA; i++) { const th = ths[i]; const t = j / NS; const y = lerp(yb[i], yTopAt(i), t);
      const pinch = 0.14 * t * t * Math.exp(-(((Math.abs(th) - 0.5) / 0.28) ** 2)) * (Math.cos(th) > 0 ? 1 : 0);
      let r = rho0[i] * (1 - 0.1 * t) * (1 - pinch); r = Math.max(r, D.rhoAt(th, y, m) + 0.002); row.push([Math.sin(th) * r, y, D.c[2] + Math.cos(th) * r]); } rows.push(row); }
    for (let k = 1; k <= NT; k++) { const row = []; const sk = 1 - k / NT; for (let i = 0; i < NA; i++) { const th = ths[i]; const top = rows[NS][i]; const r0 = Math.hypot(top[0], top[2] - D.c[2]); const r = r0 * Math.max(sk, 0.001);
      const crease = (kind === 'panama' ? 0.012 : 0.02) * (1 - sk * sk) * (0.55 + 0.45 * Math.abs(Math.cos(th))) * sstep(0.0, 0.35, 1 - sk); let y = yTopAt(i) - crease + 0.004 * Math.sin(sk * Math.PI);
      y = Math.max(y, yTopMin - 0.002 + (D.rhoAt(th, y, m) > r ? 0.006 : 0)); row.push([Math.sin(th) * r, y, D.c[2] + Math.cos(th) * r]); } rows.push(row); }
    geo.grid(rows, (r) => (r === NS ? mul(col, 0.95) : col), true, (r, c, p) => (r <= NS ? [p[0], 0, p[2] - D.c[2]] : [0, 1, 0]), (r, c) => uvA(r, c, NS + NT));
    // ribbon band (+ bow on the left side)
    { const bh = kind === 'trilby' ? 0.026 : 0.032; const B = []; for (let r = 0; r <= 2; r++) { const row = []; for (let i = 0; i < NA; i++) { const th = ths[i]; const y = yb[i] + (r / 2) * bh; const t = (y - yb[i]) / (yTopAt(i) - yb[i]); const p = rows[0][i]; const r0 = Math.hypot(p[0], p[2] - D.c[2]) * (1 - 0.1 * t) + 0.0016; row.push([Math.sin(th) * r0, y, D.c[2] + Math.cos(th) * r0]); } B.push(row); }
      geo.grid(B, () => bandC, true, (r, c, p) => [p[0], 0, p[2] - D.c[2]], (r, c) => [c / NA * 30, r]);
      const iL = Math.round((Math.PI / 2 + Math.PI) / (2 * Math.PI) * NA) % NA; const pb = B[1][iL]; const P = [[[pb[0] + 0.0022, pb[1] - 0.009, pb[2] + 0.012], [pb[0] + 0.0022, pb[1] - 0.009, pb[2] - 0.012]], [[pb[0] + 0.0022, pb[1] + 0.009, pb[2] + 0.012], [pb[0] + 0.0022, pb[1] + 0.009, pb[2] - 0.012]]];
      slab(geo, P, [[[1, 0, 0], [1, 0, 0]], [[1, 0, 0], [1, 0, 0]]], 0.003, () => mul(bandC, 0.9), () => bandC, mul(bandC, 0.8), false); }
    // brim: snap (front down / back up) for the fedora, stingy flipped-up back for the trilby, flat wide straw brim
    { const NRb = 4; const P = [], Nn = []; for (let r = 0; r <= NRb; r++) { const row = [], nr = []; for (let i = 0; i < NA; i++) { const th = ths[i]; const p = rows[0][i]; const t = r / NRb; const W = Wb * t; const cf = Math.max(0, Math.cos(th)), cb = Math.max(0, -Math.cos(th));
        const dy = kind === 'trilby' ? (-0.008 * cf * cf + 0.022 * cb * cb) * t * t : kind === 'panama' ? (-0.011 * cf * cf - 0.004 * cb * cb + 0.002 * Math.sin(th) ** 2) * t * t : (-0.013 * cf * cf + 0.014 * cb * cb + 0.004 * Math.sin(th) ** 2) * t * t;
        row.push([p[0] + Math.sin(th) * W, p[1] + 0.001 + dy, p[2] + Math.cos(th) * W]); nr.push([0, 1, 0]); } P.push(row); Nn.push(nr); }
      slab(geo, P, Nn, kind === 'panama' ? 0.0026 : 0.0034, (r) => (kind === 'fedora' && r === NRb ? mul(col, 0.75) : col), () => mul(col, 0.9), kind === 'panama' ? mul(col, 0.8) : mul(col, 0.7), true, (r, c) => [c / NA * 10, r / NRb * 1.2]); }
  }
  const mesh = new THREE.Mesh(geo.geometry(), hatMaterial(kind)); mesh.castShadow = true; mesh.receiveShadow = true; mesh.name = 'heroHat';
  return mesh;
}
