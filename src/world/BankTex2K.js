// 77th request: "2k texture the whole bank. Use realistic textures."
//
// Pure pixel generators for the Ceylon Meridian Bank's surfaces at 2048 × 2048: no imports, no DOM, no three.js. Each
// generator fills an RGBA byte array (and, for the surfaces whose relief carries the look, a height field that BankTex.js
// turns into a 1024² normal map). Being pure keeps them testable and benchmarkable in Node (tools/bank-tex2k-test.mjs writes
// them out as PNGs) and lets the game build them in small slices on the loading screen.
//
// Scale: the hall's box faces are UV-mapped in metres (one texture repeat per metre), so a 2048 texture is ~0.5 mm per pixel
// on walls, counters and fittings; the ceiling tile is one 600 mm tile per texture (0.3 mm / px) and the floor granite one
// 0.8 m span (0.4 mm / px). Every generator tiles seamlessly (all noise lattices wrap at the texture edge), and each keeps
// the average colour of the 256² texture it replaces, so the hall keeps its designed colours (the builders tint by vertex
// colour) — only the detail changes.

// ------------------------------------------------------------------------------------------------ primitives
export function rng(seed) { let s = (seed * 2654435761) >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
const sm = (t) => t * t * (3 - 2 * t);
const clamp = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);
// tileable value-noise fBm on a W × H grid: cx × cy lattice cells at the first octave (doubling per octave); result 0..1
export function fbm(W, H, cx, cy, oct, seed, gain = 0.5) {
  const out = new Float32Array(W * H); const r = rng(seed); let amp = 1, tot = 0;
  const x0a = new Int32Array(W), x1a = new Int32Array(W), wxa = new Float32Array(W);
  for (let o = 0; o < oct; o++) {
    const nx = cx << o, ny = cy << o; const L = new Float32Array(nx * ny); for (let i = 0; i < L.length; i++) L[i] = r();
    const sx = nx / W, sy = ny / H;
    for (let x = 0; x < W; x++) { const f = x * sx, i = Math.floor(f); x0a[x] = i % nx; x1a[x] = (i + 1) % nx; wxa[x] = sm(f - i); }
    for (let y = 0; y < H; y++) { const f = y * sy, j = Math.floor(f), t = sm(f - j); const r0 = (j % ny) * nx, r1 = ((j + 1) % ny) * nx, row = y * W;
      for (let x = 0; x < W; x++) { const i0 = x0a[x], i1 = x1a[x], wx = wxa[x]; const a = L[r0 + i0], top = a + (L[r0 + i1] - a) * wx, c = L[r1 + i0], bot = c + (L[r1 + i1] - c) * wx; out[row + x] += amp * (top + (bot - top) * t); } }
    tot += amp; amp *= gain;
  }
  for (let i = 0; i < out.length; i++) out[i] /= tot;
  return out;
}
// stretch a field to 0..1 (value-noise fBm bunches around 0.5)
export function norm(F) { let lo = 1e9, hi = -1e9; for (let i = 0; i < F.length; i++) { const v = F[i]; if (v < lo) lo = v; if (v > hi) hi = v; } const k = 1 / Math.max(1e-6, hi - lo); for (let i = 0; i < F.length; i++) F[i] = (F[i] - lo) * k; return F; }
// bilinear wrap-around resample of a w × h field to W × H
export function up(F, w, h, W, H) {
  if (w === W && h === H) return F; const out = new Float32Array(W * H); const sx = w / W, sy = h / H;
  const x0a = new Int32Array(W), x1a = new Int32Array(W), wxa = new Float32Array(W);
  for (let x = 0; x < W; x++) { const f = x * sx, i = Math.floor(f); x0a[x] = i % w; x1a[x] = (i + 1) % w; wxa[x] = f - i; }
  for (let y = 0; y < H; y++) { const f = y * sy, j = Math.floor(f), t = f - j; const r0 = (j % h) * w, r1 = ((j + 1) % h) * w, row = y * W;
    for (let x = 0; x < W; x++) { const i0 = x0a[x], i1 = x1a[x], wx = wxa[x]; const a = F[r0 + i0], top = a + (F[r0 + i1] - a) * wx, c = F[r1 + i0], bot = c + (F[r1 + i1] - c) * wx; out[row + x] = top + (bot - top) * t; } }
  return out;
}
// stamp a soft-edged line into a height / tone field (wrapping): used for scratches, fissures, pores
function line(F, W, H, x0, y0, x1, y1, val, width = 1) { const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0))); const hw = width / 2;
  for (let s = 0; s <= n; s++) { const x = x0 + (x1 - x0) * s / n, y = y0 + (y1 - y0) * s / n;
    for (let dy = -Math.ceil(hw); dy <= Math.ceil(hw); dy++) for (let dx = -Math.ceil(hw); dx <= Math.ceil(hw); dx++) { const d = Math.hypot(dx, dy); if (d > hw + 0.5) continue; const k = d <= hw - 0.5 ? 1 : hw + 0.5 - d;
      const xi = (((Math.round(x) + dx) % W) + W) % W, yi = (((Math.round(y) + dy) % H) + H) % H; const p = yi * W + xi; const v = val * k; if (Math.abs(v) > Math.abs(F[p])) F[p] = v; } } }
function img(W, H) { return new Uint8ClampedArray(W * H * 4); }
// write RGB from a base colour scaled by a per-pixel tone factor (1 = base), plus optional per-channel offsets
function shade(D, i, r, g, b, k) { const o = i * 4; D[o] = clamp(r * k); D[o + 1] = clamp(g * k); D[o + 2] = clamp(b * k); D[o + 3] = 255; }
// keep the average colour of the texture this one replaces (the hall's vertex colours were tuned against it)
function matchMean(D, r, g, b) { let sr = 0, sg = 0, sb = 0; const n = D.length / 4; for (let i = 0; i < D.length; i += 4) { sr += D[i]; sg += D[i + 1]; sb += D[i + 2]; }
  const kr = r / (sr / n || 1), kg = g / (sg / n || 1), kb = b / (sb / n || 1); for (let i = 0; i < D.length; i += 4) { D[i] = clamp(D[i] * kr); D[i + 1] = clamp(D[i + 1] * kg); D[i + 2] = clamp(D[i + 2] * kb); } }

// ------------------------------------------------------------------------------------------------ surfaces
// Each returns { w, h, rgba, height?, nScale? }. `height` (0..1, full resolution) becomes the normal map.

// wall plaster, emulsion-painted: sand-float grain, a fine roller stipple (orange peel), very soft trowel undulation
export function plaster(W = 2048, seed = 11) {
  const H = W, D = img(W, H), hgt = new Float32Array(W * H); const r = rng(seed);
  const trowel = up(norm(fbm(256, 256, 3, 3, 5, seed + 1)), 256, 256, W, H);
  const peel = up(norm(fbm(1024, 1024, 48, 48, 3, seed + 2, 0.55)), 1024, 1024, W, H);
  for (let i = 0; i < W * H; i++) { const g = r(); const sand = (g - 0.5) * 0.045 + (g > 0.997 ? -0.07 : 0); const p = peel[i] - 0.5;
    hgt[i] = p * 0.75 + (g - 0.5) * 0.35 + (trowel[i] - 0.5) * 0.25; shade(D, i, 246, 244, 240, 1 + (trowel[i] - 0.5) * 0.022 + p * 0.03 + sand); }
  for (let k = 0; k < 1400; k++) { const x = r() * W, y = r() * H; line(hgt, W, H, x, y, x + (r() - 0.5) * 3, y + (r() - 0.5) * 3, -0.6, 1 + r() * 1.5); } // air pits in the skim
  matchMean(D, 244, 243, 239); return { w: W, h: H, rgba: D, height: hgt, nScale: 0.55 };
}
// eggshell paint on joinery / metal: a fine orange peel, near uniform
export function eggshell(base = [246, 246, 244], W = 2048, seed = 21) {
  const H = W, D = img(W, H); const r = rng(seed);
  const peel = up(norm(fbm(1024, 1024, 96, 96, 2, seed + 1)), 1024, 1024, W, H), tone = up(fbm(128, 128, 4, 4, 4, seed + 2), 128, 128, W, H);
  for (let i = 0; i < W * H; i++) shade(D, i, base[0], base[1], base[2], 1 + (peel[i] - 0.5) * 0.028 + (tone[i] - 0.5) * 0.02 + (r() - 0.5) * 0.018);
  for (let k = 0; k < 18; k++) { const y = r() * H, hh = 30 + r() * 120, a = 0.006 + r() * 0.008; for (let yy = 0; yy < hh; yy++) { const row = ((Math.floor(y + yy) % H) + H) % H; const f = Math.sin(Math.PI * yy / hh) * a; for (let x = 0; x < W; x++) { const o = (row * W + x) * 4; D[o] = clamp(D[o] * (1 - f)); D[o + 1] = clamp(D[o + 1] * (1 - f)); D[o + 2] = clamp(D[o + 2] * (1 - f)); } } } // faint roller laps
  return { w: W, h: H, rgba: D };
}
// moulded plastic: spark-eroded satin texture (VDI 3400 ~ 27) + a few light scuffs
export function plastic(W = 2048, seed = 31) {
  const H = W, D = img(W, H), hgt = new Float32Array(W * H); const r = rng(seed);
  const vdi = up(norm(fbm(1024, 1024, 256, 256, 2, seed + 1)), 1024, 1024, W, H), tone = up(fbm(128, 128, 3, 3, 4, seed + 2), 128, 128, W, H);
  for (let i = 0; i < W * H; i++) { const n = (vdi[i] - 0.5) + (r() - 0.5) * 0.5; hgt[i] = n; shade(D, i, 240, 240, 240, 1 + n * 0.05 + (tone[i] - 0.5) * 0.025); }
  const sc = new Float32Array(W * H); for (let k = 0; k < 120; k++) { const x = r() * W, y = r() * H, an = (r() - 0.5) * 0.6, l = 40 + r() * 260; line(sc, W, H, x, y, x + Math.cos(an) * l, y + Math.sin(an) * l, 1, 1 + r()); }
  for (let i = 0; i < W * H; i++) if (sc[i]) { const k = 1 - 0.07 * sc[i]; const o = i * 4; D[o] *= k; D[o + 1] *= k; D[o + 2] *= k; }
  matchMean(D, 242, 242, 242); return { w: W, h: H, rgba: D, height: hgt, nScale: 0.25 };
}
// brushed metal (stainless / brass): streaks along u that vary fast across and slowly along, polishing swirl, long scratches,
// fingerprints and smudges
export function brushed(base = [217, 220, 223], amt = 0.26, W = 2048, seed = 41) {
  const H = W, D = img(W, H); const r = rng(seed);
  const streak = up(norm(fbm(128, 2048, 2, 640, 3, seed + 1, 0.6)), 128, 2048, W, H), fine = up(norm(fbm(512, 2048, 8, 1500, 2, seed + 2)), 512, 2048, W, H);
  const smudge = up(norm(fbm(256, 256, 4, 4, 5, seed + 3)), 256, 256, W, H);
  const rowOff = new Float32Array(H); for (let y = 0; y < H; y++) rowOff[y] = (r() - 0.5);
  const sc = new Float32Array(W * H); for (let k = 0; k < 900; k++) { const x = r() * W, y = r() * H, l = 80 + r() * 900, dy = (r() - 0.5) * 6; line(sc, W, H, x, y, x + l, y + dy, r() < 0.5 ? 1 : -1, 1); }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; const s = (streak[i] - 0.5) * 0.9 + (fine[i] - 0.5) * 0.7 + rowOff[y] * 0.35 + sc[i] * 0.8;
    const sm2 = smudge[i] > 0.72 ? (smudge[i] - 0.72) * 0.18 : 0; shade(D, i, base[0], base[1], base[2], 1 + s * amt * 0.42 - sm2 + (r() - 0.5) * 0.02); }
  for (let k = 0; k < 6; k++) { const cx = r() * W, cy = r() * H, rr = 40 + r() * 50; for (let ring = 0; ring < 14; ring++) { const R = rr * (0.3 + ring * 0.06); for (let a = 0; a < 6.28; a += 1 / R) { const x = Math.round(cx + Math.cos(a) * R * 0.8), y = Math.round(cy + Math.sin(a) * R); const o = ((((y % H) + H) % H) * W + (((x % W) + W) % W)) * 4; D[o] *= 0.985; D[o + 1] *= 0.985; D[o + 2] *= 0.982; } } } // fingerprints (ridge whorls)
  matchMean(D, base[0], base[1], base[2]); return { w: W, h: H, rgba: D };
}
// polished chrome: near flat, faint haze, a scatter of fine hairline scratches in every direction
export function chrome(W = 2048, seed = 51) {
  const H = W, D = img(W, H); const r = rng(seed); const haze = up(norm(fbm(256, 256, 3, 3, 5, seed + 1)), 256, 256, W, H);
  const sc = new Float32Array(W * H); for (let k = 0; k < 700; k++) { const x = r() * W, y = r() * H, an = r() * 6.283, l = 10 + r() * 90; line(sc, W, H, x, y, x + Math.cos(an) * l, y + Math.sin(an) * l, 1, 1); }
  for (let i = 0; i < W * H; i++) shade(D, i, 244, 244, 244, 1 - Math.max(0, haze[i] - 0.6) * 0.12 + sc[i] * 0.05 + (r() - 0.5) * 0.008);
  matchMean(D, 242, 242, 242); return { w: W, h: H, rgba: D };
}
// walnut veneer (crown-cut): warped growth rings — light earlywood darkening into latewood, abrupt at the ring boundary —
// long colour streaks (grey-purple / honey), fine open pores in dashes along the grain, a few mineral flecks
export function walnut(W = 2048, seed = 61) {
  const H = W, D = img(W, H), hgt = new Float32Array(W * H); const r = rng(seed);
  const warp = up(norm(fbm(256, 256, 2, 1, 5, seed + 1)), 256, 256, W, H), warp2 = up(norm(fbm(512, 512, 5, 2, 4, seed + 2)), 512, 512, W, H);
  const streak = up(norm(fbm(256, 512, 12, 1, 4, seed + 3)), 256, 512, W, H), tone = up(norm(fbm(128, 128, 3, 3, 4, seed + 4)), 128, 128, W, H);
  const fibre = up(norm(fbm(1024, 256, 384, 4, 2, seed + 5)), 1024, 256, W, H); // fine fibre lines along the grain
  const RINGS = 30, TAU = Math.PI * 2; // growth rings across one metre of crown-cut veneer
  for (let y = 0; y < H; y++) { const v = y / H; for (let x = 0; x < W; x++) { const i = y * W + x, u = x / W;
    // cathedrals: the ring coordinate bends into arches that drift along the leaf (all terms wrap at the texture edge)
    const arch = Math.cos(TAU * (u * 3 + warp[i] * 0.6)) * (1.4 + Math.sin(TAU * v) * 0.9);
    const ring = u * RINGS + (warp[i] - 0.5) * 6 + (warp2[i] - 0.5) * 1.6 + arch; const f = ring - Math.floor(ring);
    const late = f < 0.7 ? f * 0.25 : f < 0.9 ? 0.175 + (f - 0.7) * 3.6 : 0.895 - (f - 0.9) * 5; // earlywood → narrow dark latewood line → fades
    const st = streak[i] - 0.5; const t = Math.min(1, Math.max(0, 0.32 + late * 0.42 + st * 0.7 + (tone[i] - 0.5) * 0.3 + (fibre[i] - 0.5) * 0.12));
    const R = 140 + (50 - 140) * t, G = 94 + (31 - 94) * t, B = 61 + (20 - 61) * t; const grey = st < -0.15 ? Math.min(0.5, (-0.15 - st) * 1.3) : 0; // grey-purple heartwood streaks
    const o = i * 4, n = 1 + (r() - 0.5) * 0.04; D[o] = clamp((R * (1 - grey) + 78 * grey) * n); D[o + 1] = clamp((G * (1 - grey) + 60 * grey) * n); D[o + 2] = clamp((B * (1 - grey) + 58 * grey) * n); D[o + 3] = 255;
    hgt[i] = -late * 0.12 + (fibre[i] - 0.5) * 0.1; } }
  for (let k = 0; k < 15000; k++) { const x = r() * W, y = r() * H, l = 2 + r() * 6; const dark = 0.62 + r() * 0.22; // open pores: short dark dashes along the grain
    for (let s2 = 0; s2 < l; s2++) { const p = (((Math.round(y + s2)) % H) * W) + (Math.round(x) % W), o = p * 4; const e = s2 === 0 || s2 >= l - 1 ? (1 + dark) / 2 : dark; D[o] *= e; D[o + 1] *= e; D[o + 2] *= e; hgt[p] = -0.8; } }
  matchMean(D, 96, 62, 41); return { w: W, h: H, rgba: D, height: hgt, nScale: 0.35 };
}
// marble: soft clouding, a main system of turbulent veins (tileable sine bands warped by fBm), a crossing secondary set,
// ridged hairline veins and sparkle of the calcite crystals. base / vein colours as RGB arrays.
export function marble(base, vein, { W = 2048, seed = 71, veins = 1, hair = 1, cloud = 0.05, warp = 1, mean = null } = {}) {
  const H = W, D = img(W, H); const r = rng(seed); const N = W / 2, TAU = Math.PI * 2;
  // the vein field at half resolution (veins are a few px wide at 2048 anyway), then resampled
  const T1 = norm(fbm(N, N, 2, 2, 7, seed + 1, 0.55)), T2 = norm(fbm(N, N, 3, 3, 7, seed + 2, 0.55)), T3 = norm(fbm(N, N, 5, 5, 6, seed + 4, 0.6));
  const wid = norm(fbm(N, N, 2, 2, 3, seed + 5)); const V = new Float32Array(N * N);
  for (let y = 0; y < N; y++) { const v = y / N; for (let x = 0; x < N; x++) { const i = y * N + x, u = x / N;
    const s1 = 1 - Math.abs(Math.sin(TAU * (u + 2 * v) + T1[i] * 7.5 * warp)), s2 = 1 - Math.abs(Math.sin(TAU * (3 * u - v) + T2[i] * 9 * warp)), s3 = 1 - Math.abs(Math.sin(TAU * (2 * u + 5 * v) + T3[i] * 14 * warp));
    const e1 = 24 + wid[i] * 140; const p1 = s1 * s1, p1b = p1 * p1; // pow by squaring chains (cheap)
    const main = Math.pow(s1, e1), halo = p1b * p1 * 0.22, sec = Math.pow(s2, 90) * 0.6, hl = Math.pow(s3, 260) * 0.45 * hair;
    V[i] = Math.min(1, (main + sec) * veins + halo * veins + hl); } }
  const Vf = up(V, N, N, W, H), cl = up(norm(fbm(256, 256, 3, 3, 6, seed + 3, 0.6)), 256, 256, W, H);
  for (let i = 0; i < W * H; i++) { const a = Vf[i] * (0.7 + cl[i] * 0.6) > 1 ? 1 : Vf[i] * (0.7 + cl[i] * 0.6); const c = 1 + (cl[i] - 0.5) * cloud * 2 + (r() - 0.5) * 0.025; const o = i * 4;
    D[o] = clamp((base[0] * (1 - a) + vein[0] * a) * c); D[o + 1] = clamp((base[1] * (1 - a) + vein[1] * a) * c); D[o + 2] = clamp((base[2] * (1 - a) + vein[2] * a) * c); D[o + 3] = 255; }
  for (let k = 0; k < 9000; k++) { const o = (((r() * H) | 0) * W + ((r() * W) | 0)) * 4, s = 1.05 + r() * 0.07; D[o] = clamp(D[o] * s); D[o + 1] = clamp(D[o + 1] * s); D[o + 2] = clamp(D[o + 2] * s); } // calcite glints
  if (mean) matchMean(D, mean[0], mean[1], mean[2]); return { w: W, h: H, rgba: D };
}
// upholstery: a 2/2 twill in a heathered (two-tone) yarn; yarn thickness slubs along each thread; fuzz
export function fabric(W = 2048, seed = 81) {
  const H = W, D = img(W, H), hgt = new Float32Array(W * H); const r = rng(seed); const P = 4; // 2 mm per thread crossing (divides 2048: tiles)
  const slubX = new Float32Array(W), slubY = new Float32Array(H); { const fx = norm(fbm(W, 1, 160, 1, 3, seed + 1)), fy = norm(fbm(H, 1, 160, 1, 3, seed + 2)); for (let i = 0; i < W; i++) slubX[i] = fx[i]; for (let j = 0; j < H; j++) slubY[j] = fy[j]; }
  const heather = new Float32Array(W * H); for (let i = 0; i < W * H; i++) heather[i] = r();
  const tone = up(norm(fbm(128, 128, 3, 3, 4, seed + 3)), 128, 128, W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; const cx = Math.floor(x / P), cy = Math.floor(y / P), fx = (x % P + 0.5) / P, fy = (y % P + 0.5) / P;
    const warpUp = ((cx + cy) & 3) < 2; // 2/2 twill: diagonal
    const prof = warpUp ? Math.sin(Math.PI * fx) * (0.7 + 0.3 * Math.sin(Math.PI * fy)) : Math.sin(Math.PI * fy) * (0.7 + 0.3 * Math.sin(Math.PI * fx));
    const slub = warpUp ? slubX[x] : slubY[y]; const h2 = prof * (0.85 + slub * 0.3); hgt[i] = h2;
    const yarn = warpUp ? (heather[cx * 7919 % (W * H)] > 0.5 ? 1.03 : 0.95) : (heather[(cy * 104729 + 13) % (W * H)] > 0.4 ? 1.0 : 0.93);
    shade(D, i, 234, 234, 234, (0.8 + h2 * 0.24) * yarn * (1 + (tone[i] - 0.5) * 0.04) + (r() - 0.5) * 0.06); }
  matchMean(D, 231, 231, 231); return { w: W, h: H, rgba: D, height: hgt, nScale: 0.9 };
}
// glazed ceramic: near white, faint cloud of the glaze, a few pinholes and specks
export function ceramic(W = 2048, seed = 91) {
  const H = W, D = img(W, H); const r = rng(seed); const cl = up(norm(fbm(256, 256, 3, 3, 5, seed + 1)), 256, 256, W, H);
  for (let i = 0; i < W * H; i++) shade(D, i, 251, 251, 250, 1 + (cl[i] - 0.5) * 0.02 + (r() - 0.5) * 0.008);
  for (let k = 0; k < 900; k++) { const o = (((r() * H) | 0) * W + ((r() * W) | 0)) * 4, s = 0.55 + r() * 0.3; D[o] *= s; D[o + 1] *= s; D[o + 2] *= s; }
  matchMean(D, 249, 249, 248); return { w: W, h: H, rgba: D };
}
// mineral-fibre ceiling tile (one 600 mm tile): dense pinholes, worm fissures, a fine fibrous surface; the grid tee at two
// edges with its bevel (the next tile's texture supplies the other two)
export function ceilTile(W = 2048, seed = 101) {
  const H = W, D = img(W, H), hgt = new Float32Array(W * H); const r = rng(seed);
  const fib = up(norm(fbm(1024, 1024, 128, 128, 3, seed + 1, 0.6)), 1024, 1024, W, H), cl = up(norm(fbm(128, 128, 3, 3, 4, seed + 2)), 128, 128, W, H);
  for (let i = 0; i < W * H; i++) hgt[i] = (fib[i] - 0.5) * 0.4 + (r() - 0.5) * 0.15;
  for (let k = 0; k < 2600; k++) { let x = r() * W, y = r() * H, an = r() * 6.283; const n = 3 + (r() * 9) | 0, wd = 1.4 + r() * 2.2, dep = -(0.55 + r() * 0.45); // fissures: short, branching-looking worms 1–2 mm wide
    for (let s = 0; s < n; s++) { an += (r() - 0.5) * 1.5; const nx = x + Math.cos(an) * 5, ny = y + Math.sin(an) * 5; line(hgt, W, H, x, y, nx, ny, dep * (1 - s / (n + 2) * 0.5), wd * (1 - s / (n + 3))); x = nx; y = ny; } }
  for (let k = 0; k < 30000; k++) { const x = r() * W, y = r() * H; line(hgt, W, H, x, y, x, y, -(0.5 + r() * 0.5), 1 + r() * 2); } // pinholes
  const bl = new Float32Array(W * H); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; bl[i] = (hgt[i] * 2 + hgt[y * W + (x + 1) % W] + hgt[y * W + (x - 1 + W) % W] + hgt[((y + 1) % H) * W + x] + hgt[((y - 1 + H) % H) * W + x]) / 6; } // soften the pits' edges
  for (let i = 0; i < W * H; i++) { const h2 = bl[i]; const ao = h2 < -0.15 ? 1 + h2 * 0.32 : 1 + h2 * 0.08; shade(D, i, 238, 237, 232, ao * (1 + (cl[i] - 0.5) * 0.025)); hgt[i] = bl[i]; }
  const tee = Math.round(W * 3 / 256), bev = Math.round(W / 256); // keep the old tile's grid line (3 px of 256) and bevel
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; let k = 0;
    if (x < tee || y < tee) { k = 0.78; hgt[i] = 1; } else if (x < tee + bev * 2 || y < tee + bev * 2) k = 1.1; else if (x > W - bev * 2 || y > H - bev * 2) k = 0.92;
    if (k) { const o = i * 4; if (k === 0.78) { D[o] = 185; D[o + 1] = 183; D[o + 2] = 176; } else { D[o] = clamp(D[o] * k); D[o + 1] = clamp(D[o + 1] * k); D[o + 2] = clamp(D[o + 2] * k); } } }
  matchMean(D, 228, 227, 222); return { w: W, h: H, rgba: D, height: hgt, nScale: 0.8 };
}
// opal light diffuser: a fine micro-prism field, a hair brighter in the middle of each prism
export function diffuser(W = 2048, seed = 111) {
  const H = W, D = img(W, H); const r = rng(seed); const P = 8;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const fx = (x % P + 0.5) / P - 0.5, fy = (((y + ((Math.floor(x / P) & 1) * P / 2)) % P) + 0.5) / P - 0.5; shade(D, y * W + x, 255, 255, 255, 1 - (Math.abs(fx) + Math.abs(fy)) * 0.12 + (r() - 0.5) * 0.02); }
  matchMean(D, 250, 250, 251); return { w: W, h: H, rgba: D };
}
// sanded cement grout bed
export function grout(W = 2048, seed = 121) {
  const H = W, D = img(W, H); const r = rng(seed); const cl = up(norm(fbm(512, 512, 24, 24, 3, seed + 1)), 512, 512, W, H);
  for (let i = 0; i < W * H; i++) { const g = r(); shade(D, i, 230, 228, 224, 0.8 + cl[i] * 0.2 + (g - 0.5) * 0.35 + (g > 0.985 ? 0.15 : 0)); }
  matchMean(D, 224, 222, 218); return { w: W, h: H, rgba: D };
}
// polished granite (cellular grains: feldspar, quartz, biotite mica; irregular grain boundaries, crystal glints)
// pal: [[r,g,b,weight], …] mineral palette; cell: grain size in px
// two crystal layers: coarse feldspar / quartz grains (cellular, warped boundaries, colour zoning inside each crystal) and a
// fine layer whose dark cells are the angular biotite / hornblende grains; a scatter of crystal glints
function cells(W, cell, seed, warpAmt) { const r = rng(seed); const G = Math.round(W / cell), cs = W / G; const px = new Float32Array(G * G), py = new Float32Array(G * G); for (let i = 0; i < G * G; i++) { px[i] = r(); py[i] = r(); }
  const wx = up(fbm(256, 256, 12, 12, 3, seed + 1), 256, 256, W, W), wy = up(fbm(256, 256, 12, 12, 3, seed + 2), 256, 256, W, W); const id = new Int32Array(W * W), edge = new Float32Array(W * W);
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) { const i = y * W + x; const u = (x + (wx[i] - 0.5) * cs * warpAmt) / cs, v = (y + (wy[i] - 0.5) * cs * warpAmt) / cs; const gx = Math.floor(u), gy = Math.floor(v); let d1 = 9, d2 = 9, best = 0;
    for (let oy = -1; oy <= 1; oy++) { const cy = ((gy + oy) % G + G) % G; for (let ox = -1; ox <= 1; ox++) { const cx = ((gx + ox) % G + G) % G, c = cy * G + cx; const dx = gx + ox + px[c] - u, dy = gy + oy + py[c] - v, d = dx * dx + dy * dy; if (d < d1) { d2 = d1; d1 = d; best = c; } else if (d < d2) d2 = d; } }
    id[i] = best; edge[i] = Math.sqrt(d2) - Math.sqrt(d1); }
  return { id, edge, n: G * G };
}
export function granite(pal, { W = 2048, seed = 131, cell = 14, dark = [24, 23, 23], darkFrac = 0.14, mean = null } = {}) {
  const H = W, D = img(W, H); const r = rng(seed); let tw = 0; for (const p of pal) tw += p[3];
  const C = cells(W, cell, seed + 10, 1.8), F = cells(W, Math.max(5, cell * 0.42), seed + 20, 1.2); // the fine (mica) layer (78th: at full resolution — it was blocky at half)
  const kind = new Uint8Array(C.n), vary = new Float32Array(C.n), zone = new Float32Array(C.n); for (let i = 0; i < C.n; i++) { let t = r() * tw, k = 0; while (k < pal.length - 1 && t > pal[k][3]) { t -= pal[k][3]; k++; } kind[i] = k; vary[i] = 0.9 + r() * 0.2; zone[i] = r() * 0.3; }
  const isDark = new Uint8Array(F.n), dv = new Float32Array(F.n); for (let i = 0; i < F.n; i++) { isDark[i] = r() < darkFrac ? 1 : 0; dv[i] = 0.75 + r() * 0.5; }
  const inner = up(norm(fbm(512, 512, 96, 96, 2, seed + 3)), 512, 512, W, H);
  for (let i = 0; i < W * H; i++) { const hi = i, fi = F.id[hi];
    if (isDark[fi] && F.edge[hi] > 0.06) { const k = dv[fi] * (0.85 + inner[i] * 0.3); shade(D, i, dark[0], dark[1], dark[2], k); continue; }
    const c = C.id[i], p = pal[kind[c]]; const e = C.edge[i]; const z = 1 - zone[c] * Math.max(0, 1 - e * 3); const bd = e < 0.04 ? 0.93 + e * 1.75 : 1; // zoned crystals, faint boundaries (polished)
    shade(D, i, p[0], p[1], p[2], vary[c] * z * bd * (0.95 + inner[i] * 0.1)); }
  for (let k = 0; k < 16000; k++) { const o = (((r() * H) | 0) * W + ((r() * W) | 0)) * 4; D[o] = clamp(D[o] + 45); D[o + 1] = clamp(D[o + 1] + 45); D[o + 2] = clamp(D[o + 2] + 45); } // glints
  if (mean) matchMean(D, mean[0], mean[1], mean[2]); return { w: W, h: H, rgba: D };
}
// honed limestone cladding (the facade piers): warm cream, faint bedding, shell fragments and tiny voids
export function limestone(W = 2048, seed = 141) {
  const H = W, D = img(W, H), hgt = new Float32Array(W * H); const r = rng(seed);
  const bed = up(norm(fbm(128, 512, 1, 12, 5, seed + 1)), 128, 512, W, H), cl = up(norm(fbm(256, 256, 4, 4, 5, seed + 2)), 256, 256, W, H);
  for (let i = 0; i < W * H; i++) { const g = r(); hgt[i] = (g - 0.5) * 0.3; shade(D, i, 236, 228, 210, 1 + (bed[i] - 0.5) * 0.05 + (cl[i] - 0.5) * 0.05 + (g - 0.5) * 0.04); }
  for (let k = 0; k < 2600; k++) { const x = r() * W, y = r() * H, an = r() * 6.28, l = 2 + r() * 10; const sc = 0.82 + r() * 0.12; for (let s = 0; s < l; s++) { const o = ((((Math.round(y + Math.sin(an) * s)) % H + H) % H) * W + (((Math.round(x + Math.cos(an) * s)) % W + W) % W)) * 4; D[o] *= sc; D[o + 1] *= sc; D[o + 2] *= sc * 0.97; } } // shell fragments
  for (let k = 0; k < 9000; k++) { const x = r() * W, y = r() * H; line(hgt, W, H, x, y, x, y, -1, 1 + r() * 2.2); } // voids
  for (let i = 0; i < W * H; i++) if (hgt[i] < -0.5) { const o = i * 4; D[o] *= 0.78; D[o + 1] *= 0.77; D[o + 2] *= 0.75; }
  matchMean(D, 228, 220, 204); return { w: W, h: H, rgba: D, height: hgt, nScale: 0.6 };
}

// 78th: roughness of the polished granite floor (green channel = roughness; a linear texture). Large soft patches where
// the polish has dulled a little, a finer cloud, and a few hundred hairline scratches (rougher) — never mirror-smooth.
export function floorRough(W = 1024, seed = 161) {
  const D = img(W, W); const r = rng(seed); const big = up(norm(fbm(128, 128, 3, 3, 4, seed + 1)), 128, 128, W, W), mid = up(norm(fbm(256, 256, 14, 14, 3, seed + 2)), 256, 256, W, W);
  const sc = new Float32Array(W * W); for (let k = 0; k < 700; k++) { const x = r() * W, y = r() * W, an = r() * 6.283, l = 5 + r() * 34; line(sc, W, W, x, y, x + Math.cos(an) * l, y + Math.sin(an) * l, 0.4 + r() * 0.6, 1); }
  for (let i = 0; i < W * W; i++) { const v = 0.17 + (big[i] - 0.5) * 0.07 + (mid[i] - 0.5) * 0.03 + sc[i] * 0.11 + (r() - 0.5) * 0.012; const g = clamp(Math.max(0.06, Math.min(0.42, v)) * 255); const o = i * 4; D[o] = D[o + 1] = D[o + 2] = g; D[o + 3] = 255; }
  return { w: W, h: W, rgba: D, linear: true };
}
// 78th: 2 × 2 box-filter downsample (graphics-quality texture sizes; secondary surfaces at half size)
export function halve(rgba, w, h) { const W2 = w >> 1, H2 = h >> 1, o = new Uint8ClampedArray(W2 * H2 * 4);
  for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) { const a = ((y * 2) * w + x * 2) * 4, b = a + w * 4, d = (y * W2 + x) * 4; for (let c = 0; c < 4; c++) o[d + c] = (rgba[a + c] + rgba[a + 4 + c] + rgba[b + c] + rgba[b + 4 + c] + 2) >> 2; }
  return { w: W2, h: H2, rgba: o }; }
// shrink a generated surface { w, h, rgba, n } until it is at most `size` (its normal map to half of that)
export function fitSize(s, size) { let { w, h, rgba } = s; while (w > size && w > 64) ({ w, h, rgba } = halve(rgba, w, h)); let n = s.n;
  if (n) { let { w: nw, h: nh, rgba: nr } = n; while (nw > Math.max(64, size / 2)) ({ w: nw, h: nh, rgba: nr } = halve(nr, nw, nh)); n = { w: nw, h: nh, rgba: nr }; }
  return { w, h, rgba, n, linear: s.linear }; }

// ------------------------------------------------------------------------------------------------ normal maps
// height (W × H, 0..1-ish) → RGBA normal map at half resolution (tangent space, +Y = +v; the canvas is uploaded flipped,
// so canvas row 0 is v = 1 and a height rising down the canvas is a slope towards −v)
export function normalMap(hgt, W, H, strength = 1, div = 2) {
  const w = W / div, h = H / div, Hd = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let s = 0; for (let j = 0; j < div; j++) for (let i = 0; i < div; i++) s += hgt[(y * div + j) * W + x * div + i]; Hd[y * w + x] = s / (div * div); }
  const D = img(w, h); const k = strength * 2;
  for (let y = 0; y < h; y++) { const ym = ((y - 1 + h) % h) * w, yp = ((y + 1) % h) * w, row = y * w;
    for (let x = 0; x < w; x++) { const xm = (x - 1 + w) % w, xp = (x + 1) % w; const dx = (Hd[row + xp] - Hd[row + xm]) * k, dy = (Hd[yp + x] - Hd[ym + x]) * k;
      const nx = -dx, ny = dy, l = 1 / Math.sqrt(nx * nx + ny * ny + 1); const o = (row + x) * 4; D[o] = (nx * l * 0.5 + 0.5) * 255; D[o + 1] = (ny * l * 0.5 + 0.5) * 255; D[o + 2] = (l * 0.5 + 0.5) * 255; D[o + 3] = 255; } }
  return { w, h, rgba: D };
}

// ------------------------------------------------------------------------------------------------ the bank's set
// key → generator (BankTex.js builds them; the old 256² textures' average colours are kept)
export const BANK_SURFACES = {
  cmbPaint: () => eggshell([246, 246, 244]),
  cmbPlaster: () => plaster(),
  cmbPlastic: () => plastic(),
  cmbSteel: () => brushed([217, 220, 223], 0.26, 2048, 41),
  cmbChrome: () => chrome(),
  cmbBrass: () => brushed([255, 255, 255], 0.18, 2048, 43),
  cmbWalnut: () => walnut(),
  cmbMarble: () => marble([236, 233, 227], [128, 126, 120], { seed: 71, veins: 0.9, hair: 0.8, cloud: 0.045, warp: 0.55, mean: [229, 226, 220] }),
  cmbMarbleDark: () => marble([36, 37, 40], [222, 220, 212], { seed: 73, veins: 0.85, hair: 1, cloud: 0.12, mean: [48, 49, 51] }),
  cmbFabric: () => fabric(),
  cmbGlaze: () => ceramic(),
  cmbCeil: () => ceilTile(),
  cmbDiffuser: () => diffuser(),
  cmbGrout: () => grout(),
  // the hall floor (78th: polished dark-grey granite, "steel grey": charcoal feldspar, smoky quartz, black mica, a few pale
  // grains) — tinted per tile by the floor's colours; its polish varies by the roughness map below
  cmbGranite: () => granite([[66, 66, 68, 3.4], [86, 86, 88, 2.6], [112, 111, 110, 1.0], [148, 146, 142, 0.35]], { seed: 131, cell: 11, dark: [17, 17, 18], darkFrac: 0.27, mean: [72, 72, 74] }),
  // 78th: the floor's polish (linear data, read as roughness): 0.08–0.16 polished stone, duller traffic patches, fine scratches
  cmbGraniteRough: () => floorRough(),
  // the facade: absolute-black granite (stall risers, planters, the entrance apron) and the limestone cladding
  cmbBlackGranite: () => granite([[34, 34, 36, 5], [46, 46, 49, 3], [64, 64, 68, 0.7]], { seed: 151, cell: 9, dark: [16, 16, 17], darkFrac: 0.3, mean: [36, 36, 38] }),
  cmbLimestone: () => limestone(),
};
