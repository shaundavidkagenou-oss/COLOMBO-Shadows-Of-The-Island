// Photographic-style procedural surfaces (35th request): the Street Customs workshop's grimy painted block walls and its oil-stained
// concrete floor, and a fissured, lichen-flecked tree bark. Each generator paints an albedo, a height field (→ tangent normal map
// through Textures.heightToNormal) and a roughness map (G channel) in the same pass, so stains, joints and plates line up in all
// three. Tileable: anisotropic value noise with an integer period per axis. Browser only (canvas); Node callers get null.
import * as THREE from 'three';
import { heightToNormal } from './Textures.js';
import { RNG } from '../core/rng.js';

const hasDOM = () => typeof document !== 'undefined' && !!document.createElement;
function cv(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function tex(c, srgb = true) { const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = 8; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.needsUpdate = true; return t; }
// integer hash → [0, 1)
const H = (x, y, s) => { let q = (x * 374761393 + y * 668265263 + s * 1442695041) | 0; q = Math.imul(q ^ (q >>> 13), 1274126177); return ((q ^ (q >>> 16)) >>> 0) / 4294967296; };
const sm = (t) => t * t * (3 - 2 * t);
// tileable value noise: periods px, py (cells)
function vn(x, y, px, py, s) { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi; const X0 = ((xi % px) + px) % px, X1 = (X0 + 1) % px, Y0 = ((yi % py) + py) % py, Y1 = (Y0 + 1) % py;
  const a = H(X0, Y0, s), b = H(X1, Y0, s), c = H(X0, Y1, s), d = H(X1, Y1, s); const u = sm(xf), v = sm(yf); return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; }
function fb(x, y, px, py, s, oct = 4) { let t = 0, a = 0.5, n = 0, f = 1; for (let i = 0; i < oct; i++) { t += a * vn(x * f, y * f, px * f, py * f, s + i * 31); n += a; a *= 0.5; f *= 2; } return t / n; }
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const mix = (a, b, t) => a + (b - a) * t;
const hex = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };
// write float buffers (0..1) into canvases
function put(c, R, G, B) { const x = c.getContext('2d'), img = x.createImageData(c.width, c.height), d = img.data; for (let i = 0, j = 0; i < R.length; i++, j += 4) { d[j] = clamp01(R[i]) * 255; d[j + 1] = clamp01(G ? G[i] : R[i]) * 255; d[j + 2] = clamp01(B ? B[i] : R[i]) * 255; d[j + 3] = 255; } x.putImageData(img, 0, 0); return c; }
function blobs(rng, n, w, h, rMin, rMax) { const out = []; for (let i = 0; i < n; i++) out.push({ x: rng.range(0, w), y: rng.range(0, h), r: rng.range(rMin, rMax), s: rng.int(1, 9999), k: rng.range(0.5, 1) }); return out; }
// distance-to-blob with a noisy edge, wrapped (tileable): 1 inside → 0 outside
function blobAt(b, x, y, w, h, wob = 0.45) { let dx = x - b.x, dy = y - b.y; if (dx > w / 2) dx -= w; else if (dx < -w / 2) dx += w; if (dy > h / 2) dy -= h; else if (dy < -h / 2) dy += h;
  const d = Math.hypot(dx, dy) / b.r; if (d > 1.6) return 0; const a = Math.atan2(dy, dx); const e = 1 + wob * (vn(Math.cos(a) * 2 + 3, Math.sin(a) * 2 + 3, 64, 64, b.s) - 0.5) * 2 + 0.25 * (vn(x * 0.08, y * 0.08, 1e6, 1e6, b.s + 7) - 0.5);
  return clamp01((e - d) / 0.18); }

// ------------------------------------------------------------------------------------------------ workshop wall
// One tile = wallH × wallH metres (u repeats along the wall, v runs floor → eaves exactly once, so the floor splash band, the dado
// and the roof-leak streaks sit at their real heights). Painted 400 × 200 mm concrete block: dark grey dado to 1.2 m with chipped
// paint, worn off-white above; tyre-spray grime along the floor, trolley scuffs, hand smudges, oil splatter, water / rust streaks.
export function garageWallTextures(wallH = 6.9, size = 512, seed = 3501) {
  if (!hasDOM()) return null; const W = size, Hh = size, rng = new RNG(seed); const N = W * Hh; const R = new Float32Array(N), G = new Float32Array(N), B = new Float32Array(N), Ht = new Float32Array(N), Ro = new Float32Array(N);
  const pxm = Hh / wallH; const rows = Math.round(wallH / 0.2), rowH = Hh / rows; const cols = Math.max(4, Math.round(wallH / 0.4)), colW = W / cols;
  const upper = hex('#9f998e'), dado = hex('#3c4247'), block = hex('#8e8b84'), grime = hex('#2e2a24'), rust = hex('#6b4a2c'), oil = hex('#15120e');
  const streaks = []; for (let i = 0; i < 40; i++) streaks.push({ x: rng.range(0, W), w: rng.range(1.5, 9), len: rng.range(0.25, 0.9), k: rng.range(0.25, 0.75), rust: rng.chance(0.35), s: rng.int(1, 9999) });
  const smudges = blobs(rng, 16, W, Hh, 0.06 * pxm, 0.16 * pxm).map((b) => Object.assign(b, { y: Hh - rng.range(0.7, 1.7) * pxm }));
  const splat = blobs(rng, 90, W, Hh, 0.004 * pxm, 0.02 * pxm).map((b) => Object.assign(b, { y: Hh - rng.range(0.02, 0.9) * pxm * rng.next() }));
  const scuffs = []; for (let i = 0; i < 18; i++) scuffs.push({ x: rng.range(0, W), y: Hh - rng.range(0.25, 1.05) * pxm, len: rng.range(0.15, 0.9) * pxm, th: rng.range(1, 3.5), k: rng.range(0.25, 0.7) });
  const dadoY = Hh - 1.2 * pxm;
  for (let y = 0; y < Hh; y++) { const hM = (Hh - y) / pxm; /* metres above the floor */ const row = Math.floor(y / rowH), off = (row % 2) * colW * 0.5;
    for (let x = 0; x < W; x++) { const i = y * W + x;
      // block joints (recessed mortar) + per-block tone
      const lx = ((x + off) % colW + colW) % colW, ly = y - row * rowH; const jd = Math.min(lx, colW - lx, ly, rowH - ly); const joint = clamp01(1 - (jd - 0.6) / 1.4); const bt = H(Math.floor((x + off) / colW) % cols, row, seed) - 0.5;
      const n1 = fb(x / W * 6, y / Hh * 6, 6, 6, seed + 1, 5), n2 = fb(x / W * 24, y / Hh * 24, 24, 24, seed + 2, 3), grain = H(x, y, seed + 3) - 0.5;
      const inDado = y > dadoY ? 1 : 0; const edge = clamp01(1 - Math.abs(y - dadoY) / 1.5); // a crisp paint line, slightly darker
      // chipped paint on the dado (block shows through), more of it near the floor and at block arrises
      const chipN = fb(x / W * 14 + 7, y / Hh * 14, 14, 14, seed + 4, 4); const chip = inDado ? clamp01((chipN - 0.68 + (1 - clamp01(hM / 1.2)) * 0.08 + joint * 0.05) / 0.03) : clamp01((chipN - 0.8) / 0.02) * 0.6;
      let c = inDado ? dado.slice() : upper.slice(); const tone = 1 + bt * 0.05 + (n1 - 0.5) * 0.16 + grain * 0.03; c = c.map((v) => v * tone);
      if (chip > 0) { const bc = block.map((v) => v * (0.9 + n2 * 0.2)); c = c.map((v, k) => mix(v, bc[k], chip)); }
      c = c.map((v) => v * (1 - joint * (inDado ? 0.16 : 0.17)) * (1 - edge * 0.3));
      // general age grime (blotchy), heavier low down and under the eaves
      const g0 = clamp01((fb(x / W * 3, y / Hh * 3, 3, 3, seed + 5, 5) - 0.3) * 1.5) * 0.42 + clamp01((fb(x / W * 11, y / Hh * 11, 11, 11, seed + 15, 3) - 0.5) * 2.5) * 0.14 + clamp01(1 - hM / 2.2) * 0.18 + clamp01(1 - hM / 0.6) * (0.55 + 0.3 * n2) + clamp01((hM - (wallH - 0.9)) / 0.9) * 0.35 * n1;
      let gk = clamp01(g0); let rough = inDado ? 0.62 : 0.8; rough = mix(rough, 0.92, chip);
      // roof-leak / rust streaks from the top, fraying as they run down
      for (const s of streaks) { let dx = x - s.x; if (dx > W / 2) dx -= W; else if (dx < -W / 2) dx += W; const wob = (vn(y / Hh * 9, s.s, 9, 1e6, s.s) - 0.5) * 8; const ax = Math.abs(dx + wob); if (ax > s.w * 1.6) continue; const t = y / Hh; if (t > s.len) continue;
        const k = clamp01(1 - ax / s.w) * (1 - t / s.len) * s.k * (0.6 + 0.4 * vn(x * 0.5, y * 0.05, 1e6, 1e6, s.s)); if (s.rust) c = c.map((v, q) => mix(v, rust[q], k * 0.6)); else gk = Math.max(gk, k * 0.7); }
      for (const b of smudges) { const k = blobAt(b, x, y, W, Hh, 0.6); if (k) gk = Math.max(gk, k * 0.35 * b.k); }
      for (const s of scuffs) { let dx = x - s.x; if (dx > W / 2) dx -= W; else if (dx < -W / 2) dx += W; if (dx < 0 || dx > s.len) continue; const dy = Math.abs(y - s.y - dx * 0.04); if (dy > s.th) continue; gk = Math.max(gk, (1 - dy / s.th) * s.k * (0.5 + 0.5 * n2)); }
      let oilK = 0; for (const b of splat) { const k = blobAt(b, x, y, W, Hh, 0.3); if (k > oilK) oilK = k; }
      c = c.map((v, q) => mix(v, grime[q], gk)); if (oilK) { c = c.map((v, q) => mix(v, oil[q], oilK * 0.85)); rough = mix(rough, 0.35, oilK); }
      rough = mix(rough, 0.95, gk * 0.4);
      R[i] = c[0]; G[i] = c[1]; B[i] = c[2]; Ro[i] = rough;
      Ht[i] = 0.55 - joint * 0.22 - chip * 0.12 + grain * 0.05 + (n2 - 0.5) * 0.08; } }
  const a = put(cv(W, Hh), R, G, B), h = put(cv(W, Hh), Ht), r = put(cv(W, Hh), Ro);
  return { map: tex(a), normal: heightToNormal(h, { strength: 3 }), rough: tex(r, false) };
}

// ------------------------------------------------------------------------------------------------ workshop floor
// One tile = 4 × 4 m (one saw-cut slab). Power-floated concrete gone grey-brown with use: trowel mottling, exposed fines,
// a hairline crack or two, tyre scrub, and old engine-oil stains soaked in (dark, a softer halo, slightly glossier).
export function garageFloorTextures(size = 512, seed = 3511) {
  if (!hasDOM()) return null; const W = size, N = W * W, rng = new RNG(seed); const R = new Float32Array(N), G = new Float32Array(N), B = new Float32Array(N), Ht = new Float32Array(N), Ro = new Float32Array(N);
  const base = hex('#67635b'), dark = hex('#35302a'), oil = hex('#1a1612'), oilHalo = hex('#4a4136'), tyre = hex('#2a2826');
  const stains = blobs(rng, 4, W, W, 50, 120); const drips = blobs(rng, 10, W, W, 1.5, 4); // the tile repeats every 4 m: only faint, large, old soaking here — the distinct fresh stains are placed decals (CustomsGeo)
  const marks = []; for (let i = 0; i < 7; i++) marks.push({ cx: rng.range(0, W), cy: rng.range(0, W), r: rng.range(W * 0.3, W * 1.2), a0: rng.range(0, 6.28), span: rng.range(0.25, 0.7), w: rng.range(5, 11), k: rng.range(0.12, 0.3) });
  const cracks = []; for (let i = 0; i < 3; i++) { let x = rng.range(0, W), y = rng.range(0, W), a = rng.range(0, 6.28); const pts = []; for (let k = 0; k < 60; k++) { pts.push([x, y]); a += rng.range(-0.5, 0.5); x += Math.cos(a) * 3; y += Math.sin(a) * 3; } cracks.push(pts); }
  const crackMap = new Float32Array(N); for (const pts of cracks) for (const [px, py] of pts) for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const X = ((Math.round(px) + dx) % W + W) % W, Y = ((Math.round(py) + dy) % W + W) % W; const k = clamp01(1 - Math.hypot(dx, dy) / 2.2); crackMap[Y * W + X] = Math.max(crackMap[Y * W + X], k); }
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) { const i = y * W + x;
    const n1 = fb(x / W * 5, y / W * 5, 5, 5, seed + 1, 5), n2 = fb(x / W * 32, y / W * 32, 32, 32, seed + 2, 2), g = H(x, y, seed + 3), g2 = H(x, y, seed + 9);
    const jd = Math.min(x, W - 1 - x, y, W - 1 - y); const joint = clamp01(1 - (jd - 0.5) / 1.5); const spall = joint > 0 ? 0 : clamp01(1 - (jd - 1) / 3) * clamp01((n2 - 0.6) * 4);
    let c = base.map((v) => v * (0.86 + n1 * 0.26 + (g - 0.5) * 0.06)); // trowel mottling + fines
    if (g2 > 0.985) c = c.map((v) => v * 1.25); else if (g2 < 0.02) c = c.map((v) => v * 0.65); // aggregate flecks
    let rough = 0.82 + (n2 - 0.5) * 0.1;
    let dk = clamp01((fb(x / W * 2, y / W * 2, 2, 2, seed + 4, 4) - 0.35) * 1.1) * 0.5 + clamp01((fb(x / W * 9, y / W * 9, 9, 9, seed + 11, 3) - 0.55) * 2) * 0.2; // traffic-worn dirt, large + small scale
    for (const m of marks) { let dx = x - m.cx, dy = y - m.cy; if (dx > W / 2) dx -= W; else if (dx < -W / 2) dx += W; if (dy > W / 2) dy -= W; else if (dy < -W / 2) dy += W; const d = Math.abs(Math.hypot(dx, dy) - m.r); if (d > m.w) continue;
      let a = Math.atan2(dy, dx) - m.a0; a = ((a % 6.283) + 6.283) % 6.283; if (a > m.span) continue; const k = (1 - d / m.w) * m.k * Math.sin(Math.PI * a / m.span) * (0.6 + 0.4 * n2); c = c.map((v, q) => mix(v, tyre[q], k)); rough = mix(rough, 0.7, k); }
    // soaked-in oil: a soft radial field per stain, broken up by two octaves of warped noise and thresholded with a wide ramp, so the
    // edges feather and fray into the concrete like real absorbed oil (no crisp splat outlines); drips are small and faint
    const wn = fb(x / W * 7 + 1.3, y / W * 7, 7, 7, seed + 12, 4), wn2 = fb(x / W * 22, y / W * 22, 22, 22, seed + 13, 3); let field = 0;
    for (const b of stains) { let dx = x - b.x, dy = y - b.y; if (dx > W / 2) dx -= W; else if (dx < -W / 2) dx += W; if (dy > W / 2) dy -= W; else if (dy < -W / 2) dy += W; const d = Math.hypot(dx, dy) / b.r; if (d < 1.8) field = Math.max(field, (1 - d / 1.8) ** 1.5 * b.k); }
    let st = clamp01((field * (0.55 + 0.9 * wn) - 0.32) / 0.5) * (0.35 + 0.2 * wn2), halo = clamp01((field * (0.6 + 0.8 * wn) - 0.12) / 0.5);
    for (const b of drips) { const k = blobAt(b, x, y, W, W, 0.5); if (k * 0.55 > st) st = k * 0.55 * (0.7 + 0.3 * wn2); }
    c = c.map((v, q) => mix(v, dark[q], dk)); c = c.map((v, q) => mix(v, oilHalo[q], halo * 0.4)); c = c.map((v, q) => mix(v, oil[q], st * (0.7 + 0.25 * n2)));
    rough = mix(rough, 0.8, halo * 0.3); rough = mix(rough, 0.7, st); // absorbed oil darkens far more than it shines (only fresh spills are glossy)
    const ck = crackMap[i]; c = c.map((v) => v * (1 - joint * 0.6 - ck * 0.5 - spall * 0.15));
    R[i] = c[0]; G[i] = c[1]; B[i] = c[2]; Ro[i] = rough; Ht[i] = 0.6 - joint * 0.4 - ck * 0.3 - spall * 0.15 + (g - 0.5) * 0.04 + (n2 - 0.5) * 0.05; }
  const a = put(cv(W, W), R, G, B), h = put(cv(W, W), Ht), r = put(cv(W, W), Ro);
  return { map: tex(a), normal: heightToNormal(h, { strength: 2.5 }), rough: tex(r, false) };
}

// fresh engine-oil spill (alpha decal, not tiled): a dark pool with a lighter brown thin rim and satellite drops
export function oilSpillTexture(size = 256, seed = 3521) {
  if (!hasDOM()) return null; const W = size, N = W * W, rng = new RNG(seed); const R = new Float32Array(N), G = new Float32Array(N), B = new Float32Array(N), A = new Float32Array(N);
  const main = { x: W / 2, y: W / 2, r: W * 0.3, s: seed, k: 1 }; const sat = blobs(rng, 9, W, W, W * 0.015, W * 0.06).map((b) => { const a = rng.range(0, 6.28), d = rng.range(0.32, 0.46) * W; b.x = W / 2 + Math.cos(a) * d; b.y = W / 2 + Math.sin(a) * d; return b; });
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) { const i = y * W + x; let k = blobAt(main, x, y, 1e9, 1e9, 0.6); for (const b of sat) k = Math.max(k, blobAt(b, x, y, 1e9, 1e9, 0.3));
    const core = clamp01((k - 0.35) / 0.4), n = vn(x * 0.06, y * 0.06, 1e6, 1e6, seed); const c = [mix(0.27, 0.05, core) * (0.9 + 0.2 * n), mix(0.2, 0.04, core) * (0.9 + 0.2 * n), mix(0.12, 0.03, core)];
    R[i] = c[0]; G[i] = c[1]; B[i] = c[2]; A[i] = k * mix(0.55, 0.96, core); }
  const c = cv(W, W), x = c.getContext('2d'), img = x.createImageData(W, W), d = img.data; for (let i = 0, j = 0; i < N; i++, j += 4) { d[j] = R[i] * 255; d[j + 1] = G[i] * 255; d[j + 2] = B[i] * 255; d[j + 3] = clamp01(A[i]) * 255; } x.putImageData(img, 0, 0);
  const t = tex(c); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t;
}

// ------------------------------------------------------------------------------------------------ tree bark
// One tile ≈ 1.2 m around × 2.4 m up the trunk. Corky, deeply fissured bark (rain tree / mango / jak): long anastomosing vertical
// ridges split into plates by short cross-breaks, dark fissures between, sun-bleached grey ridge tops over warm brown, crusty
// pale-grey and yellow-green lichen, damp dark streaks. The height field is strong, so the normal map carries real relief.
export function barkTextures(size = 512, seed = 3531) {
  if (!hasDOM()) return null; const W = size, Hh = size, N = W * Hh; const R = new Float32Array(N), G = new Float32Array(N), B = new Float32Array(N), Ht = new Float32Array(N);
  const fiss = hex('#1a140f'), deep = hex('#3e3227'), mid = hex('#5d5043'), top = hex('#7f7466'), lichA = hex('#959985'), lichB = hex('#9ea463'), damp = hex('#2e2a22');
  for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) { const i = y * W + x; const u = x / W, v = y / Hh;
    // domain-warped, vertically stretched ridges: 9 ridges around, wandering
    const wx = (fb(u * 3, v * 2, 3, 2, seed + 1, 3) - 0.5) * 0.9 + (fb(u * 8, v * 5, 8, 5, seed + 2, 2) - 0.5) * 0.25;
    const rv = vn((u + wx * 0.12) * 9, v * 2.2, 9, 2, seed + 3) * 0.7 + vn((u + wx * 0.12) * 18, v * 4.4, 18, 4, seed + 4) * 0.3;
    const ridge = 1 - Math.abs(rv * 2 - 1); // 1 on a ridge crest, 0 in a fissure
    const plates = vn(u * 9 + wx, v * 7, 9, 7, seed + 5); const crossBreak = clamp01(1 - Math.abs(plates - 0.5) / 0.035) * clamp01((ridge - 0.25) * 3); // short horizontal breaks across the ridges
    const fine = fb(u * 48, v * 24, 48, 24, seed + 6, 3), grain = H(x, y, seed + 7) - 0.5;
    let h = Math.pow(ridge, 0.65) * (1 - crossBreak * 0.6) * (0.85 + 0.3 * fine); const fissure = clamp01(1 - h / 0.22);
    let c = h > 0.6 ? mid.map((q, k) => mix(q, top[k], clamp01((h - 0.6) / 0.35))) : deep.map((q, k) => mix(q, mid[k], clamp01((h - 0.2) / 0.4)));
    c = c.map((q, k) => mix(q, fiss[k], fissure)); c = c.map((q) => q * (0.9 + fine * 0.2 + grain * 0.06));
    const lich = clamp01((fb(u * 6, v * 4, 6, 4, seed + 8, 4) - 0.62) / 0.06) * clamp01(h * 1.6 - 0.3); const lich2 = clamp01((fb(u * 10 + 3, v * 7, 10, 7, seed + 9, 3) - 0.7) / 0.05) * clamp01(h * 1.6 - 0.4);
    c = c.map((q, k) => mix(q, lichA[k] * (0.85 + 0.3 * fine), lich * 0.85)); c = c.map((q, k) => mix(q, lichB[k] * (0.85 + 0.3 * fine), lich2 * 0.7));
    const dmp = clamp01((fb(u * 4, v * 1, 4, 1, seed + 10, 3) - 0.55) * 3) * 0.45; c = c.map((q, k) => mix(q, damp[k], dmp));
    R[i] = c[0]; G[i] = c[1]; B[i] = c[2]; Ht[i] = h * 0.85 + lich * 0.06 + grain * 0.04; }
  const a = put(cv(W, Hh), R, G, B), h = put(cv(W, Hh), Ht);
  return { map: tex(a), normal: heightToNormal(h, { strength: 5 }) };
}
