// 83rd request: 2048 × 2048 master textures for the new close-up asset families (balcony laundry / curtains / household
// things, bird feathers, vehicle cabin + tyre detail, road grime on paint, rain on vehicle glass).
//
// Pure pixel generators: no imports beyond the bank's noise primitives, no DOM, no three.js, the same way BankTex2K.js works.
// tools/tex2k-build.mjs runs them in Node, writes PNGs and encodes them to KTX2 / Basis Universal with basisu (ETC1S for
// colour, UASTC + RDO + Zstandard for normal / data maps) into public/assets/tex2k/. At run time src/gfx/TexLib.js loads the
// .ktx2 files through three's KTX2Loader, which detects what the GPU supports (BC7 / BC1-3 on a GTX 1660, ETC2 / ASTC
// elsewhere) and transcodes to it. If the files cannot be loaded, TexLib builds the same generators at reduced size instead.
//
// Layouts (every map tiles or is a set of padded tiles so mipmaps do not bleed across designs):
//   fabCol   4 × 4 tiles of 512²  sRGB  RGB colour, A opacity        16 garment / curtain designs (garment UV 0..1 per tile)
//   fabNrm   2 × 2 tiles of 1024² lin.  RG normal, B roughness, A height  weave: plain cotton, twill / denim, terry, satin
//   hhCol    4 × 4 tiles of 512²  sRGB  RGB colour, A opacity        pots, plastics, leaves, flowers, steel, timber, pegs
//   hhNrm    4 × 4 tiles of 512²  lin.  RG normal, B roughness, A metalness
//   feaNrm   one tileable 2048²   lin.  RG normal, B roughness, A tone (overlapping feather rows with rachis and barbs)
//   vehDet   2 × 2 tiles of 1024² lin.  RG normal, B roughness, A cavity   seat cloth, leather, dash plastic, tyre / carpet
//   grime    one tileable 2048²   lin.  R dust, G road grime / drip streaks, B fine scratches, A dried water spots
//   rainNrm  one tileable 2048²   lin.  RG normal of droplets, B droplet coverage, A per-droplet random (appear threshold)
import { rng, fbm, norm, up } from '../world/BankTex2K.js';

const cl = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);
const sat = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const mix = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = sat((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const fract = (x) => x - Math.floor(x);
const hash2 = (x, y, s = 0) => fract(Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453);
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

// wrap-around height field → normal xy (−1..1) via central differences
function slope(H, W, x, y, k) { const xm = (x - 1 + W) % W, xp = (x + 1) % W, ym = (y - 1 + W) % W, yp = (y + 1) % W; return [-(H[y * W + xp] - H[y * W + xm]) * k, (H[yp * W + x] - H[ym * W + x]) * k]; }
// height (+ optional B, A fields 0..1) of a T × T tile → RGBA bytes written into the atlas at (ox, oy)
function packTile(D, W, ox, oy, T, H, strength, B, A) {
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) { const [dx, dy] = slope(H, T, x, y, strength); const l = 1 / Math.sqrt(dx * dx + dy * dy + 1); const i = y * T + x, o = ((oy + y) * W + ox + x) * 4;
    D[o] = (dx * l * 0.5 + 0.5) * 255; D[o + 1] = (dy * l * 0.5 + 0.5) * 255; D[o + 2] = B ? cl(B[i] * 255) : 128; D[o + 3] = A ? cl(A[i] * 255) : 255; }
}
// a colour tile: fn(u, v, x, y) → [r, g, b, a] (0..255)
function colTile(D, W, ox, oy, T, fn) { for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) { const c = fn((x + 0.5) / T, (y + 0.5) / T, x, y); const o = ((oy + y) * W + ox + x) * 4; D[o] = cl(c[0]); D[o + 1] = cl(c[1]); D[o + 2] = cl(c[2]); D[o + 3] = cl(c[3] ?? 255); } }
const fieldT = (T, cells, oct, seed, gain) => norm(fbm(T, T, cells, cells, oct, seed, gain));

// ------------------------------------------------------------------------------------------------ fabric colour atlas
// 16 designs (index = ty * 4 + tx). Garments map their whole cut to one tile; the weave itself is in fabNrm (finer, tiled).
export const FAB = { shirtWhite: 0, shirtCheck: 1, sarongBatik: 2, sarongPlaid: 3, denim: 4, uniform: 5, saree: 6, sheetFloral: 7, sheetStripe: 8, towel: 9, tshirtKid: 10, trousersDark: 11, curtainLace: 12, curtainDamask: 13, curtainFloral: 14, curtainNet: 15 };
export const FAB_ROUGH = [0.86, 0.84, 0.8, 0.82, 0.78, 0.86, 0.42, 0.8, 0.8, 0.95, 0.85, 0.8, 0.74, 0.7, 0.8, 0.7]; // per design (also baked in fabNrm B as weave modulation)
export function fabCol(W = 2048, seed = 501) {
  const D = new Uint8ClampedArray(W * W * 4), T = W / 4; const n1 = fieldT(T, 6, 5, seed, 0.55), n2 = fieldT(T, 24, 3, seed + 1, 0.5), fine = new Float32Array(T * T); const r = rng(seed + 2); for (let i = 0; i < fine.length; i++) fine[i] = r();
  const N = (x, y) => n1[y * T + x], F = (x, y) => fine[y * T + x], M = (x, y) => n2[y * T + x];
  const thread = (x, y, a = 10) => (F(x, y) - 0.5) * a + (M(x, y) - 0.5) * a * 0.8; // yarn-level tone jitter
  const flower = (u, v, cells, sd, petals = 5) => { // scattered 5-petal flowers: returns [petal, centre, leaf] masks
    let pe = 0, ce = 0, le = 0; const gx = u * cells, gy = v * cells; const ix = Math.floor(gx), iy = Math.floor(gy);
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) { const cx = ix + i, cy = iy + j; const wx = ((cx % cells) + cells) % cells, wy = ((cy % cells) + cells) % cells; if (hash2(wx, wy, sd + 9) < 0.25) continue;
      const px = cx + 0.2 + 0.6 * hash2(wx, wy, sd), py = cy + 0.2 + 0.6 * hash2(wx, wy, sd + 1), rr = 0.18 + 0.14 * hash2(wx, wy, sd + 2), rot = hash2(wx, wy, sd + 3) * 6.283;
      const dx = gx - px, dy = gy - py, d = Math.hypot(dx, dy), a = Math.atan2(dy, dx) + rot; const shape = rr * (0.62 + 0.38 * Math.abs(Math.cos(a * petals / 2)));
      pe = Math.max(pe, smooth(shape, shape * 0.86, d)); ce = Math.max(ce, smooth(rr * 0.24, rr * 0.16, d));
      const lx = dx * Math.cos(rot + 1) + dy * Math.sin(rot + 1), ly = -dx * Math.sin(rot + 1) + dy * Math.cos(rot + 1); const lf = (lx - rr * 1.25) ** 2 / (rr * rr * 0.36) + ly * ly / (rr * rr * 0.06); le = Math.max(le, smooth(1, 0.7, lf) * (1 - pe)); }
    return [pe, ce, le]; };
  const designs = [
    // 0 white cotton shirt: off-white with a faint self stripe (yarn-dyed), sun-faded unevenly
    (u, v, x, y) => { const s = 0.5 + 0.5 * Math.sin(u * 6.283 * 46); const k = 236 + s * 4 + thread(x, y, 6) - N(x, y) * 8; return [k, k, k - 4, 255]; },
    // 1 blue gingham check shirt
    (u, v, x, y) => { const cx = (Math.floor(u * 34) & 1), cy = (Math.floor(v * 34) & 1); const lv = cx + cy; const base = lv === 2 ? hex('#2f5d9c') : lv === 1 ? hex('#8fa9d0') : hex('#edf0f4'); const t = thread(x, y, 9); return [base[0] + t, base[1] + t, base[2] + t, 255]; },
    // 2 batik sarong: wax-resist floral on indigo / brown with the crackle veins where the wax broke
    (u, v, x, y) => { const [pe, ce, le] = flower(u, v, 5, 21, 6); const crack = smooth(0.035, 0.0, Math.abs(N(x, y) - 0.5 + (M(x, y) - 0.5) * 0.25)) * 0.8; const band = smooth(0.06, 0.05, Math.abs(v - 0.12)) + smooth(0.06, 0.05, Math.abs(v - 0.88));
      let c = hex('#1f3a66'); c = c.map((q, k) => mix(q, hex('#7a4a22')[k], band)); c = c.map((q, k) => mix(q, hex('#d9a441')[k], pe * 0.9)); c = c.map((q, k) => mix(q, hex('#f3e6c8')[k], ce)); c = c.map((q, k) => mix(q, hex('#4f6a3a')[k], le * 0.8)); c = c.map((q) => q * (1 - crack * 0.55)); const t = thread(x, y, 8); return [c[0] + t, c[1] + t, c[2] + t, 255]; },
    // 3 men's plaid sarong: red / green / navy check, twill mixing where the stripes cross
    (u, v, x, y) => { const st = (q) => { const p = fract(q * 6); return p < 0.18 ? 0 : p < 0.26 ? 1 : p < 0.3 ? 2 : p < 0.55 ? 3 : p < 0.6 ? 1 : 4; }; const pal = [hex('#8e1b1f'), hex('#1d3b2a'), hex('#e9d8a6'), hex('#2a2f55'), hex('#b8322b')];
      const a = pal[st(u)], b = pal[st(v)]; const tw = ((x + y) >> 1) & 1; const c = tw ? a : b; const m = a.map((q, k) => (q + b[k]) / 2); const t = thread(x, y, 8); return [mix(c[0], m[0], 0.35) + t, mix(c[1], m[1], 0.35) + t, mix(c[2], m[2], 0.35) + t, 255]; },
    // 4 denim trousers: indigo twill with slub streaks, faded at the thighs and knees (garment v), seam shadow lines
    (u, v, x, y) => { const tw = ((x + y) % 4) < 2 ? 1 : 0.86; const slub = M(x, Math.floor(y / 6)) ; const fade = smooth(0.25, 0.0, Math.abs(v - 0.45)) * 0.35 + smooth(0.12, 0.0, Math.abs(v - 0.75)) * 0.25 + (N(x, y) - 0.5) * 0.2;
      const base = hex('#24375f'); const light = hex('#7f93b8'); const k = sat(fade + (slub - 0.5) * 0.25); const seam = smooth(0.012, 0.0, Math.abs(u - 0.5)) * 0.35; return base.map((q, i) => mix(q, light[i], k) * tw * (1 - seam) + thread(x, y, 6)).concat(255); },
    // 5 school uniform white (bleached, slightly blue-white)
    (u, v, x, y) => { const k = 243 + thread(x, y, 5) - N(x, y) * 6; return [k - 3, k - 1, k + 2, 255]; },
    // 6 silk saree: magenta body with sheen bands, gold zari border with a woven paisley row along the bottom edge
    (u, v, x, y) => { const border = v > 0.8; const sheen = 0.85 + 0.15 * Math.sin(v * 40 + N(x, y) * 6); let c = hex('#a3195b').map((q) => q * sheen);
      const bt = smooth(0.795, 0.805, v); if (border) { const pu = fract(u * 9), pv = (v - 0.8) / 0.2; const pais = smooth(0.3, 0.26, Math.hypot(pu - 0.5, pv - 0.5) * (1 + 0.6 * Math.sin(Math.atan2(pv - 0.5, pu - 0.5) * 2))); const lines = smooth(0.02, 0, Math.abs(pv - 0.12)) + smooth(0.02, 0, Math.abs(pv - 0.9));
        const gold = hex('#d4a640').map((q) => q * (0.8 + 0.25 * F(x, y))); c = c.map((q, k) => mix(q, gold[k], sat(bt * (0.55 + pais * 0.45 + lines)))); }
      const butta = smooth(0.02, 0.01, Math.hypot(fract(u * 14 + (Math.floor(v * 14) & 1) * 0.5) - 0.5, fract(v * 14) - 0.5) - 0.06) * (v < 0.78 ? 1 : 0); c = c.map((q, k) => mix(q, hex('#e2b85a')[k], butta * 0.8)); const t = thread(x, y, 6); return [c[0] + t, c[1] + t, c[2] + t, 255]; },
    // 7 floral bedsheet: pastel ground with roses and leaves
    (u, v, x, y) => { const [pe, ce, le] = flower(u, v, 7, 31, 5); let c = hex('#f1e4ef'); c = c.map((q, k) => mix(q, hex('#d9687e')[k], pe)); c = c.map((q, k) => mix(q, hex('#f6d36b')[k], ce)); c = c.map((q, k) => mix(q, hex('#6e9e63')[k], le)); const t = thread(x, y, 7) - N(x, y) * 6; return [c[0] + t, c[1] + t, c[2] + t, 255]; },
    // 8 striped bedsheet
    (u, v, x, y) => { const p = fract(u * 7); const c = p < 0.42 ? hex('#7fb2d6') : p < 0.5 ? hex('#f3f3ee') : p < 0.58 ? hex('#e8c35e') : hex('#f3f3ee'); const t = thread(x, y, 7) - N(x, y) * 5; return [c[0] + t, c[1] + t, c[2] + t, 255]; },
    // 9 towel: solid with a dobby band near each end and a woven label; terry loops make the tone grainy
    (u, v, x, y) => { const band = smooth(0.035, 0.025, Math.abs(v - 0.1)) + smooth(0.035, 0.025, Math.abs(v - 0.9)); const c = hex('#d9544a').map((q) => q * (1 - band * 0.3)); const g = (F(x, y) - 0.5) * 30 + (M(x, y) - 0.5) * 16; return [c[0] + g, c[1] + g, c[2] + g, 255]; },
    // 10 child's T-shirt: yellow with a printed star and stripe, print slightly cracked
    (u, v, x, y) => { const dx = u - 0.5, dy = v - 0.42, a = Math.atan2(dy, dx), d = Math.hypot(dx, dy); const star = smooth(0.012, 0, d - 0.16 * (0.55 + 0.45 * Math.cos(a * 5 - 1.57) ** 2)); const crack = F(x, y) > 0.93 ? 0.5 : 0; let c = hex('#f2c230'); c = c.map((q, k) => mix(q, hex('#2b4fa0')[k], star * (1 - crack))); const st = smooth(0.012, 0, Math.abs(v - 0.7) - 0.02); c = c.map((q, k) => mix(q, hex('#e9eef5')[k], st)); const t = thread(x, y, 7); return [c[0] + t, c[1] + t, c[2] + t, 255]; },
    // 11 dark office trousers (charcoal, faint pinstripe, shine on the seat)
    (u, v, x, y) => { const pin = smooth(0.15, 0.0, Math.abs(fract(u * 40) - 0.5) * 2 - 0.85) * 10; const k = 46 + pin + thread(x, y, 5) + N(x, y) * 10; return [k, k + 1, k + 4, 255]; },
    // 12 lace curtain: white floral lattice; holes are mostly transparent (A)
    (u, v, x, y) => { const gx = fract(u * 12), gy = fract(v * 16); const d = Math.hypot(gx - 0.5, gy - 0.5); const ring = smooth(0.05, 0.02, Math.abs(d - 0.32)); const petal = smooth(0.04, 0.0, Math.abs(d - 0.18 * (0.7 + 0.3 * Math.cos(Math.atan2(gy - 0.5, gx - 0.5) * 6)))); const grid = smooth(0.035, 0.0, Math.min(Math.abs(gx - 0.5), Math.abs(gy - 0.5)) - 0.015);
      const mesh = ((x % 3) === 0 || (y % 3) === 0) ? 0.55 : 0.25; const a = Math.max(mesh, ring, petal, grid * 0.8); const hem = smooth(0.06, 0.05, v) + smooth(0.94, 0.95, v); const k = 246 + thread(x, y, 4); return [k, k, k - 2, 255 * Math.max(a, hem)]; },
    // 13 heavy damask curtain: maroon tone-on-tone motif, sun-bleached towards the window side (u)
    (u, v, x, y) => { const pu = fract(u * 4), pv = fract(v * 5); const m = Math.abs(Math.sin((pu - 0.5) * 9 + Math.cos(pv * 6.283) * 1.5)) * smooth(0.48, 0.3, Math.hypot(pu - 0.5, pv - 0.5)); const fade = (1 - u) * 0.18 + (N(x, y) - 0.5) * 0.08;
      const c = hex('#6e1a22').map((q, k) => mix(q * (0.85 + m * 0.3), hex('#a3646a')[k], fade)); const t = thread(x, y, 5); return [c[0] + t, c[1] + t, c[2] + t, 255]; },
    // 14 floral printed cotton curtain (cream with blue and red flowers)
    (u, v, x, y) => { const [pe, ce, le] = flower(u, v, 6, 41, 5); let c = hex('#efe4c8'); c = c.map((q, k) => mix(q, (hash2(Math.floor(u * 6), Math.floor(v * 6), 2) > 0.5 ? hex('#4c6fae') : hex('#c4473c'))[k], pe)); c = c.map((q, k) => mix(q, hex('#f0c75a')[k], ce)); c = c.map((q, k) => mix(q, hex('#5f8a55')[k], le)); const t = thread(x, y, 6) - N(x, y) * 8; return [c[0] + t, c[1] + t, c[2] + t, 255]; },
    // 15 sheer net curtain: hexagonal tulle, about half see-through
    (u, v, x, y) => { const hx = u * 90, hy = v * 90 * 1.1547; const row = Math.floor(hy); const ox = (row & 1) * 0.5; const fx = fract(hx + ox) - 0.5, fy = fract(hy) - 0.5; const e = Math.max(Math.abs(fx) * 1.0, Math.abs(fx) * 0.5 + Math.abs(fy) * 0.866); const a = smooth(0.36, 0.46, e); const k = 247 + thread(x, y, 3); return [k, k, k, 255 * (0.22 + a * 0.6)]; },
  ];
  for (let i = 0; i < 16; i++) colTile(D, W, (i % 4) * T, Math.floor(i / 4) * T, T, designs[i]);
  return { w: W, h: W, rgba: D, srgb: true };
}

// ------------------------------------------------------------------------------------------------ fabric weave normals
// tiles (2 × 2 of 1024): 0 plain cotton weave, 1 twill / denim, 2 terry loops, 3 satin / silk
export function fabNrm(W = 2048, seed = 511) {
  const D = new Uint8ClampedArray(W * W * 4), T = W / 2; const r = rng(seed);
  const slub = up(norm(fbm(256, 256, 32, 32, 3, seed + 1)), 256, 256, T, T);
  // 0 plain weave: over-under, 8 px per crossing (fabric UVs repeat it ~10× per garment → ~0.4 mm threads at close range)
  { const H = new Float32Array(T * T), B = new Float32Array(T * T); const P = 8; for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) { const cx = Math.floor(x / P), cy = Math.floor(y / P), fx = (x % P + 0.5) / P, fy = (y % P + 0.5) / P; const up1 = ((cx + cy) & 1) === 0;
      const h = up1 ? Math.sin(Math.PI * fx) * (0.6 + 0.4 * Math.sin(Math.PI * fy)) : Math.sin(Math.PI * fy) * (0.6 + 0.4 * Math.sin(Math.PI * fx)); const i = y * T + x; H[i] = h * (0.85 + slub[i] * 0.3); B[i] = 0.8 + (1 - h) * 0.12 + (r() - 0.5) * 0.04; }
    packTile(D, W, 0, 0, T, H, 1.6, B, H); }
  // 1 twill 2/1 diagonal (denim, sarong, trousers)
  { const H = new Float32Array(T * T), B = new Float32Array(T * T); const P = 6; for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) { const cx = Math.floor(x / P), cy = Math.floor(y / P), fx = (x % P + 0.5) / P, fy = (y % P + 0.5) / P; const up1 = ((cx - cy) % 3 + 3) % 3 < 2;
      const h = up1 ? Math.sin(Math.PI * fx) : Math.sin(Math.PI * fy) * 0.8; const i = y * T + x; H[i] = h * (0.8 + slub[(y * 7 % T) * T + x] * 0.4); B[i] = 0.76 + (1 - h) * 0.1 + (r() - 0.5) * 0.04; }
    packTile(D, W, T, 0, T, H, 1.4, B, H); }
  // 2 terry: random loop bumps over a ground weave
  { const H = new Float32Array(T * T), B = new Float32Array(T * T); const loops = 26000; for (let k = 0; k < loops; k++) { const cx = r() * T, cy = r() * T, rad = 2.2 + r() * 2.4; const x0 = Math.floor(cx - rad - 1), y0 = Math.floor(cy - rad - 1);
      for (let y = y0; y <= cy + rad + 1; y++) for (let x = x0; x <= cx + rad + 1; x++) { const d = Math.hypot(x - cx, y - cy) / rad; if (d > 1) continue; const xi = ((x % T) + T) % T, yi = ((y % T) + T) % T, i = yi * T + xi; const h = Math.sqrt(1 - d * d) * (0.7 + 0.3 * Math.abs(Math.cos(d * 4))); if (h > H[i]) H[i] = h; } }
    for (let i = 0; i < T * T; i++) B[i] = 0.93 + (1 - H[i]) * 0.05; packTile(D, W, 0, T, T, H, 1.1, B, H); }
  // 3 satin: long weft floats, very fine ridges, glossy (low roughness) with sheen variation
  { const H = new Float32Array(T * T), B = new Float32Array(T * T); const P = 3; for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) { const fy = (y % P + 0.5) / P; const i = y * T + x; const tie = ((Math.floor(x / 10) * 3 + Math.floor(y / P)) % 5) === 0 && (x % 10) < 2 ? -0.4 : 0;
      H[i] = Math.sin(Math.PI * fy) * 0.35 + tie + slub[i] * 0.15; B[i] = 0.4 + slub[i] * 0.12 + (tie ? 0.15 : 0); }
    packTile(D, W, T, T, T, H, 0.9, B, H); }
  return { w: W, h: W, rgba: D, srgb: false };
}

// ------------------------------------------------------------------------------------------------ household atlas
export const HH = { terracotta: 0, glazed: 1, plasticRed: 2, plasticWhite: 3, croton: 4, areca: 5, bougain: 6, soil: 7, galv: 8, railPaint: 9, timber: 10, pegs: 11, alu: 12, mat: 13, basil: 14, plasticBlue: 15 };
export function hhCol(W = 2048, seed = 601) { return household(W, seed).col; }
export function hhNrm(W = 2048, seed = 601) { return household(W, seed).nrm; }
const _hhCache = new Map();
function household(W, seed) {
  const key = W + ':' + seed; if (_hhCache.has(key)) return _hhCache.get(key);
  const T = W / 4, C = new Uint8ClampedArray(W * W * 4), Nn = new Uint8ClampedArray(W * W * 4); const r = rng(seed);
  const n1 = fieldT(T, 8, 5, seed, 0.55), n2 = fieldT(T, 40, 3, seed + 3, 0.5); const fine = new Float32Array(T * T); for (let i = 0; i < fine.length; i++) fine[i] = r();
  const leaf = (u, v, w0, tipK, vein) => { // a leaf blade along v (stem at v = 0): returns [mask, midrib, side-vein]
    const half = w0 * Math.sin(Math.PI * Math.pow(sat(v), tipK)) ; const d = Math.abs(u - 0.5); const m = smooth(half, half - 0.012, d); const rib = smooth(0.012, 0.004, d) * m; const sv = smooth(0.08, 0.0, Math.abs(fract((v - d * 0.9) * vein) - 0.5) - 0.42) * m * smooth(0.0, 0.05, d); return [m, rib, sv]; };
  const tiles = [
    // 0 terracotta: fired clay, mottled, pitted, white salt bloom low down, darker wet rim of soil at the top
    { col: (u, v, x, y, i) => { const k = 0.85 + n1[i] * 0.25 + (fine[i] - 0.5) * 0.08; const salt = smooth(0.7, 1.0, v) * smooth(0.55, 0.75, n2[i]) * 0.5; return [mix(176 * k, 225, salt), mix(98 * k, 220, salt), mix(62 * k, 210, salt)]; }, h: (i) => n2[i] * 0.4 + (fine[i] > 0.985 ? -0.6 : 0), rough: (i) => 0.86 + fine[i] * 0.08, metal: 0 },
    // 1 glazed blue ceramic pot: glossy glaze with pooled darker glaze and crazing
    { col: (u, v, x, y, i) => { const pool = n1[i]; const craze = smooth(0.02, 0, Math.abs(n2[i] - 0.5)) * 0.25; return [26 + pool * 30 - craze * 20, 70 + pool * 50 - craze * 30, 120 + pool * 60 - craze * 30]; }, h: (i) => smooth(0.02, 0, Math.abs(n2[i] - 0.5)) * -0.2, rough: (i) => 0.12 + n1[i] * 0.08, metal: 0 },
    // 2 red plastic (buckets, basins): slightly faded, flow lines, scuffs
    { col: (u, v, x, y, i) => { const f = n1[i] * 0.15; return [190 - f * 120 + (fine[i] - 0.5) * 6, 32 + f * 40, 38 + f * 40]; }, h: (i) => n2[i] * 0.08 + (fine[i] > 0.997 ? -0.3 : 0), rough: (i) => 0.42 + n1[i] * 0.2, metal: 0 },
    // 3 white moulded plastic (chairs): greyed with dirt in the texture, faint mould grain
    { col: (u, v, x, y, i) => { const d = smooth(0.55, 0.95, n1[i]) * 40; const k = 232 - d + (fine[i] - 0.5) * 5; return [k, k - 1, k - 4]; }, h: (i) => (fine[i] - 0.5) * 0.06 + n2[i] * 0.05, rough: (i) => 0.5 + smooth(0.55, 0.95, n1[i]) * 0.3, metal: 0 },
    // 4 croton leaf: variegated green / yellow / red with veins (alpha cut-out)
    { col: (u, v, x, y, i) => { const [m, rib, sv] = leaf(u, v, 0.32, 0.8, 9); const vr = smooth(0.45, 0.75, n2[i]); const base = [mix(46, 190, vr), mix(92, 160, vr), mix(30, 40, vr)]; const red = smooth(0.6, 0.9, n1[i]); return [mix(base[0], 170, red) + rib * 120 + sv * 60, mix(base[1], 48, red) + rib * 90 + sv * 50, base[2] + rib * 20, m * 255]; },
      h: (i, u, v) => { const [m, rib, sv] = leaf(u, v, 0.32, 0.8, 9); return m * 0.3 - rib * 0.3 - sv * 0.12; }, rough: () => 0.45, metal: 0 },
    // 5 areca / long palm-like blade
    { col: (u, v, x, y, i) => { const [m, rib, sv] = leaf(u, v, 0.18, 1.2, 18); const k = 0.8 + n1[i] * 0.35; return [56 * k + rib * 80, 112 * k + rib * 70, 40 * k + sv * 20, m * 255]; }, h: (i, u, v) => { const [m, rib, sv] = leaf(u, v, 0.18, 1.2, 18); return m * 0.2 - rib * 0.25 - sv * 0.15; }, rough: () => 0.5, metal: 0 },
    // 6 bougainvillea: papery magenta bracts in threes with cream flower tubes
    { col: (u, v, x, y, i) => { let a = 0, tube = 0; for (let k = 0; k < 3; k++) { const ang = k * 2.094 + 0.3; const cx = 0.5 + Math.cos(ang) * 0.17, cy = 0.5 + Math.sin(ang) * 0.17; const dx = u - cx, dy = v - cy; const rr = Math.hypot(dx * Math.cos(ang) + dy * Math.sin(ang), (-dx * Math.sin(ang) + dy * Math.cos(ang)) * 1.5); a = Math.max(a, smooth(0.2, 0.18, rr)); }
      tube = smooth(0.05, 0.03, Math.hypot(u - 0.5, v - 0.5)); const vein = smooth(0.1, 0, Math.abs(fract(Math.atan2(v - 0.5, u - 0.5) * 4) - 0.5) - 0.4) * 30; return [mix(196 - vein, 236, tube), mix(34, 228, tube), mix(118 - vein * 0.5, 196, tube), a * 255]; }, h: (i, u, v) => smooth(0.25, 0, Math.hypot(u - 0.5, v - 0.5)) * 0.3, rough: () => 0.55, metal: 0 },
    // 7 potting soil with grit
    { col: (u, v, x, y, i) => { const g = fine[i] > 0.9 ? 40 : 0; const k = 0.7 + n2[i] * 0.4; return [62 * k + g, 46 * k + g * 0.9, 34 * k + g * 0.8]; }, h: (i) => n2[i] * 0.6 + (fine[i] > 0.9 ? 0.4 : 0), rough: () => 0.96, metal: 0 },
    // 8 galvanised steel (racks, buckets): spangle crystals, white rust
    { col: (u, v, x, y, i) => { const cell = hash2(Math.floor(u * 22 + n1[i] * 2), Math.floor(v * 22 + n2[i] * 2), 5); const k = 150 + cell * 50; const wr = smooth(0.7, 0.9, n1[i]) * 40; return [k + wr, k + 4 + wr, k + 8 + wr]; }, h: (i) => n2[i] * 0.06, rough: (i, u, v) => 0.3 + hash2(Math.floor(u * 22), Math.floor(v * 22), 5) * 0.25 + smooth(0.7, 0.9, n1[i]) * 0.3, metal: 0.95 },
    // 9 painted mild steel (railings): green enamel, chipped to rust at edges
    { col: (u, v, x, y, i) => { const chip = smooth(0.62, 0.66, n2[i] * 0.6 + n1[i] * 0.4); const rust = [118 + fine[i] * 30, 62 + fine[i] * 12, 34]; const paint = [38 + n1[i] * 12, 72 + n1[i] * 14, 52 + n1[i] * 8]; return paint.map((q, k) => mix(q, rust[k], chip)); }, h: (i) => -smooth(0.62, 0.66, n2[i] * 0.6 + n1[i] * 0.4) * 0.3 + (fine[i] - 0.5) * 0.04, rough: (i) => mix(0.45, 0.9, smooth(0.62, 0.66, n2[i] * 0.6 + n1[i] * 0.4)), metal: 0 },
    // 10 weathered timber (stools, plant stands)
    { col: (u, v, x, y, i) => { const gr = Math.sin((u + n1[i] * 0.08) * 160) * 0.5 + 0.5; const k = 0.75 + gr * 0.2 + n2[i] * 0.1; return [128 * k, 98 * k, 70 * k]; }, h: (i, u) => Math.sin((u + n1[i] * 0.08) * 160) * 0.2 + n2[i] * 0.1, rough: () => 0.85, metal: 0 },
    // 11 clothes pegs / line: horizontal strips of plastic colours (pegs pick a row)
    { col: (u, v, x, y, i) => { const P = [hex('#e23d3d'), hex('#2f7fd6'), hex('#f0c419'), hex('#33a852'), hex('#f7f7f2'), hex('#e86fb1'), hex('#7a4bd1'), hex('#1b1b1b')]; const c = P[Math.min(7, Math.floor(v * 8))]; const s = (fine[i] - 0.5) * 8; return [c[0] + s, c[1] + s, c[2] + s]; }, h: (i) => n2[i] * 0.04, rough: () => 0.38, metal: 0 },
    // 12 brushed aluminium (window frames, rack tubes)
    { col: (u, v, x, y, i) => { const b = fine[(y * T + ((x * 13) % T)) % (T * T)] * 12; const k = 178 + b + n1[i] * 10; return [k, k + 2, k + 5]; }, h: (i) => fine[i] * 0.03, rough: (i) => 0.32 + n1[i] * 0.1, metal: 1 },
    // 13 woven plastic mat
    { col: (u, v, x, y, i) => { const w = ((Math.floor(u * 64) + Math.floor(v * 64)) & 1); const c = w ? hex('#2e8a7a') : hex('#e9dfc4'); return [c[0], c[1], c[2]]; }, h: (i, u, v) => { const w = ((Math.floor(u * 64) + Math.floor(v * 64)) & 1); return w ? Math.sin(fract(u * 64) * Math.PI) * 0.4 : Math.sin(fract(v * 64) * Math.PI) * 0.4; }, rough: () => 0.6, metal: 0 },
    // 14 basil / tulsi sprig: small oval leaves around a stem (alpha)
    { col: (u, v, x, y, i) => { let a = 0, rib = 0; for (let k = 0; k < 7; k++) { const t = 0.1 + k * 0.12, side = (k & 1) ? 1 : -1; const cx = 0.5 + side * 0.13, cy = t; const dx = (u - cx) / 0.12, dy = (v - cy) / 0.06; const d = dx * dx + dy * dy; a = Math.max(a, smooth(1, 0.8, d)); rib = Math.max(rib, smooth(0.15, 0, Math.abs(v - cy)) * smooth(1, 0.5, d)); }
      const stem = smooth(0.018, 0.008, Math.abs(u - 0.5)) * (v < 0.95 ? 1 : 0); a = Math.max(a, stem); return [44 + rib * 40 + stem * 30, 96 + rib * 40, 34 + stem * 10, a * 255]; }, h: () => 0.2, rough: () => 0.5, metal: 0 },
    // 15 blue plastic (water drums, laundry baskets)
    { col: (u, v, x, y, i) => { const f = n1[i] * 0.2; return [30 + f * 60, 90 + f * 50, 170 + f * 30]; }, h: (i) => n2[i] * 0.06, rough: (i) => 0.4 + n1[i] * 0.15, metal: 0 },
  ];
  tiles.forEach((t, k) => { const ox = (k % 4) * T, oy = Math.floor(k / 4) * T; const H = new Float32Array(T * T), B = new Float32Array(T * T), A = new Float32Array(T * T);
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) { const i = y * T + x, u = (x + 0.5) / T, v = (y + 0.5) / T; const c = t.col(u, v, x, y, i); const o = ((oy + y) * W + ox + x) * 4; C[o] = cl(c[0]); C[o + 1] = cl(c[1]); C[o + 2] = cl(c[2]); C[o + 3] = cl(c[3] ?? 255);
      H[i] = t.h(i, u, v); B[i] = sat(t.rough(i, u, v)); A[i] = t.metal; }
    packTile(Nn, W, ox, oy, T, H, 6, B, A); });
  const out = { col: { w: W, h: W, rgba: C, srgb: true }, nrm: { w: W, h: W, rgba: Nn, srgb: false } }; _hhCache.set(key, out); return out;
}

// ------------------------------------------------------------------------------------------------ feathers
// overlapping rows of contour feathers: each a rounded vane with a raised rachis and angled barbs; tone darkens where the
// next row overlaps. Tileable (rows and columns divide the size). Applied in object space (triplanar) on the bird parts.
export function feaNrm(W = 2048, seed = 701) {
  const D = new Uint8ClampedArray(W * W * 4), H = new Float32Array(W * W), B = new Float32Array(W * W), A = new Float32Array(W * W); const cols = 32, rows = 48; const cw = W / cols, rh = W / rows; const r = rng(seed); const jit = new Float32Array(cols * rows * 2); for (let i = 0; i < jit.length; i++) jit[i] = r();
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) { let best = -1, bt = 0, bb = 0;
    const ry = Math.floor(y / rh); for (let dr = 0; dr <= 2; dr++) { const row = ry - dr; const wr = ((row % rows) + rows) % rows; const ox = (row & 1) * 0.5 * cw; const cx0 = Math.floor((x - ox) / cw);
      for (let dc = -1; dc <= 1; dc++) { const col = cx0 + dc, wc = ((col % cols) + cols) % cols; const j = (wr * cols + wc) * 2; const fx = col * cw + ox + cw * 0.5 + (jit[j] - 0.5) * cw * 0.15, fy = row * rh; // feather base at (fx, fy), tip at fy + 2.6 rh
        const lx = (x - fx) / (cw * 0.62), ly = (y - fy) / (rh * 2.6); if (ly < 0 || ly > 1) continue; const half = Math.sin(Math.PI * Math.pow(ly, 0.7)) * 0.95; if (Math.abs(lx) > half) continue;
        const h = ly * 0.7 + 0.3 - Math.abs(lx) * 0.25; const rach = smooth(0.06, 0.0, Math.abs(lx)) * 0.12; const barb = Math.sin((ly * 60 - Math.abs(lx) * 40) * 1.0) * 0.035 * (1 - smooth(0.85, 1, ly));
        const z = h + rach + barb + dr * 0.0; const order = row; if (order > best) { best = order; bt = z; bb = ly; } } }
    const i = y * W + x; H[i] = bt; B[i] = 0.55 + (1 - bb) * 0.15 + (r() - 0.5) * 0.04; A[i] = 0.55 + bb * 0.45; }
  // unify: height relative to row order makes steps at each overlap — exactly the shadowed edge of the next feather
  packTile(D, W, 0, 0, W, H, 2.2, B, A); return { w: W, h: W, rgba: D, srgb: false };
}

// ------------------------------------------------------------------------------------------------ vehicle detail
// 2 × 2 tiles of 1024: 0 seat cloth (woven velour with a fine pattern), 1 leather grain, 2 moulded dash plastic stipple,
// 3 tyre rubber / carpet pile (rubber micro grain with moulding lines)
export function vehDet(W = 2048, seed = 801) {
  const D = new Uint8ClampedArray(W * W * 4), T = W / 2; const r = rng(seed);
  // 0 seat cloth
  { const H = new Float32Array(T * T), B = new Float32Array(T * T), A = new Float32Array(T * T); const P = Math.max(2, Math.round(6 * W / 2048)); for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) { const i = y * T + x; const cx = Math.floor(x / P), cy = Math.floor(y / P); const fx = (x % P + 0.5) / P, fy = (y % P + 0.5) / P; const up1 = ((cx + cy) & 1) === 0;
      const motif = Math.sin(x / T * 6.283 * 24) * Math.sin(y / T * 6.283 * 24) > 0.6 ? 0.25 : 0; const h = (up1 ? Math.sin(Math.PI * fx) : Math.sin(Math.PI * fy)) * 0.6 + motif + r() * 0.15; H[i] = h; B[i] = 0.9 - motif * 0.1; A[i] = 0.75 + h * 0.25; }
    packTile(D, W, 0, 0, T, H, 1.4, B, A); }
  // 1 leather: cellular pebble grain + creases
  { const H = new Float32Array(T * T), B = new Float32Array(T * T), A = new Float32Array(T * T); const S = 96; const px = new Float32Array(S * S * 2); for (let i = 0; i < px.length; i++) px[i] = r(); const cr = up(norm(fbm(128, 128, 6, 6, 4, seed + 5)), 128, 128, T, T); const cs = T / S;
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) { const gx = x / cs, gy = y / cs, ix = Math.floor(gx), iy = Math.floor(gy); let d1 = 9, d2 = 9;
      for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) { const cx = ix + k, cy = iy + j; const wx = ((cx % S) + S) % S, wy = ((cy % S) + S) % S; const q = (wy * S + wx) * 2; const dx = cx + px[q] - gx, dy = cy + px[q + 1] - gy; const d = dx * dx + dy * dy; if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d; }
      const edge = Math.sqrt(d2) - Math.sqrt(d1); const i = y * T + x; const crease = smooth(0.03, 0.0, Math.abs(cr[i] - 0.5)) * 0.6; H[i] = smooth(0.0, 0.35, edge) * 0.5 - crease; B[i] = 0.55 + (1 - smooth(0, 0.35, edge)) * 0.15 + crease * 0.2; A[i] = 0.7 + smooth(0, 0.35, edge) * 0.3 - crease * 0.3; }
    packTile(D, W, T, 0, T, H, 2.0, B, A); }
  // 2 dash plastic stipple (fine random bumps, low gloss)
  { const H = up(norm(fbm(256, 256, 64, 64, 2, seed + 7)), 256, 256, T, T), B = new Float32Array(T * T), A = new Float32Array(T * T); for (let i = 0; i < T * T; i++) { H[i] = H[i] * 0.5 + r() * 0.12; B[i] = 0.62 + H[i] * 0.12; A[i] = 0.85 + H[i] * 0.15; } packTile(D, W, 0, T, T, H, 1.6, B, A); }
  // 3 rubber: micro grain, moulding vent spew lines, sidewall ribs every ~1/16
  { const g = up(norm(fbm(256, 256, 96, 96, 2, seed + 9)), 256, 256, T, T), H = new Float32Array(T * T), B = new Float32Array(T * T), A = new Float32Array(T * T); for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) { const i = y * T + x; const rib = smooth(0.06, 0.0, Math.abs(fract(y / T * 16) - 0.5) - 0.44) * 0.3; const spew = (hash2(Math.floor(x / 9), Math.floor(y / 9), 3) > 0.985 && Math.abs((x % 9) - 4) < 1) ? 0.4 : 0;
      H[i] = g[i] * 0.3 + rib + spew; B[i] = 0.82 + g[i] * 0.1; A[i] = 0.8 + g[i] * 0.2; } packTile(D, W, T, T, T, H, 1.5, B, A); }
  return { w: W, h: W, rgba: D, srgb: false };
}

// ------------------------------------------------------------------------------------------------ grime / wear on paint
export function grime(W = 2048, seed = 901) {
  const D = new Uint8ClampedArray(W * W * 4); const r = rng(seed);
  const dust = norm(fbm(W, W, 8, 8, 6, seed, 0.6)), speck = new Float32Array(W * W); for (let i = 0; i < speck.length; i++) speck[i] = r();
  const streakX = norm(fbm(W, 1, 220, 1, 3, seed + 1)), streakN = up(norm(fbm(256, 64, 32, 4, 4, seed + 2)), 256, 64, W, W); // drips: tall, thin
  const scr = new Float32Array(W * W); for (let k = 0; k < 2600; k++) { // fine wash swirls / scratches
    let x = r() * W, y = r() * W, a = r() * 6.283; const len = (20 + r() * 160) * W / 2048, curl = (r() - 0.5) * 0.02, v = 0.3 + r() * 0.7; for (let s = 0; s < len; s++) { a += curl; x += Math.cos(a); y += Math.sin(a); const xi = ((Math.round(x) % W) + W) % W, yi = ((Math.round(y) % W) + W) % W; scr[yi * W + xi] = Math.max(scr[yi * W + xi], v); } }
  const spots = new Float32Array(W * W); for (let k = 0; k < 900; k++) { const cx = r() * W, cy = r() * W, rad = Math.max(1, (3 + r() * 14) * W / 2048); for (let y = Math.floor(cy - rad); y <= cy + rad; y++) for (let x = Math.floor(cx - rad); x <= cx + rad; x++) { const d = Math.hypot(x - cx, y - cy) / rad; if (d > 1) continue; const xi = ((x % W) + W) % W, yi = ((y % W) + W) % W; const ring = smooth(0.7, 0.95, d) * smooth(1, 0.95, d) + (1 - d) * 0.15; spots[yi * W + xi] = Math.max(spots[yi * W + xi], ring); } }
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) { const i = y * W + x, o = i * 4; const dd = sat(dust[i] * 0.85 + (speck[i] > 0.97 ? 0.25 : 0)); const st = sat(smooth(0.55, 0.85, streakX[x]) * (0.4 + streakN[i] * 0.6) + smooth(0.6, 0.9, dust[(i * 7) % (W * W)]) * 0.3);
    D[o] = dd * 255; D[o + 1] = st * 255; D[o + 2] = scr[i] * 255; D[o + 3] = spots[i] * 255; }
  return { w: W, h: W, rgba: D, srgb: false };
}

// ------------------------------------------------------------------------------------------------ rain droplets on glass
export function rainNrm(W = 2048, seed = 1001) {
  const D = new Uint8ClampedArray(W * W * 4), H = new Float32Array(W * W), M = new Float32Array(W * W), Rn = new Float32Array(W * W); const r = rng(seed);
  const drop = (cx, cy, rad, id, elong) => { const ry = rad * elong; for (let y = Math.floor(cy - ry - 1); y <= cy + ry + 1; y++) for (let x = Math.floor(cx - rad - 1); x <= cx + rad + 1; x++) { const dx = (x - cx) / rad, dy = (y - cy) / ry; const d2 = dx * dx + dy * dy; if (d2 > 1) continue;
      const xi = ((x % W) + W) % W, yi = ((y % W) + W) % W, i = yi * W + xi; const h = Math.sqrt(1 - d2) * rad * 0.08; if (h > H[i]) { H[i] = h; M[i] = 1; Rn[i] = id; } } };
  const k8 = W / 2048; // 84th: sizes are relative to the 2048 master (the 256² fallback drew every drop 8× too large: grey blotches)
  for (let k = 0; k < 60000; k++) { const t = r(); drop(r() * W, r() * W, Math.max(0.35, (0.8 + t * t * 2.2) * k8), r(), 1); } // mist
  for (let k = 0; k < 7000; k++) { const t = r(); drop(r() * W, r() * W, Math.max(0.5, (2.5 + t * t * t * 13) * k8), r(), 1 + (r() < 0.12 ? r() * 1.4 : 0)); } // drops, a few run (elongated)
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) { const i = y * W + x, o = i * 4; const xm = (x - 1 + W) % W, xp = (x + 1) % W, ym = ((y - 1 + W) % W) * W, yp = ((y + 1) % W) * W; const dx = -(H[y * W + xp] - H[y * W + xm]) * 3, dy = (H[yp + x] - H[ym + x]) * 3; const l = 1 / Math.sqrt(dx * dx + dy * dy + 1);
    D[o] = (dx * l * 0.5 + 0.5) * 255; D[o + 1] = (dy * l * 0.5 + 0.5) * 255; D[o + 2] = M[i] * 255; D[o + 3] = M[i] ? Rn[i] * 255 : 0; }
  return { w: W, h: W, rgba: D, srgb: false };
}

// key → generator (+ how basisu encodes it). Sizes are the masters; TexLib's fallback builds them smaller.
export const TEX2K = {
  fabCol: { gen: fabCol, srgb: true, alpha: true },
  fabNrm: { gen: fabNrm, srgb: false },
  hhCol: { gen: hhCol, srgb: true, alpha: true },
  hhNrm: { gen: hhNrm, srgb: false },
  feaNrm: { gen: feaNrm, srgb: false }, // 84th: wired — birds (Birds.js via DetailMaps)
  vehDet: { gen: vehDet, srgb: false }, // 84th: wired — vehicle cabin + rubber (VehicleModels via DetailMaps)
  grime: { gen: grime, srgb: false }, // 84th: wired — painted bodies (VehicleWeather.grimePatch)
  rainNrm: { gen: rainNrm, srgb: false }, // 84th: wired — vehicle glass (VehicleWeather.patchGlassRain)
};
