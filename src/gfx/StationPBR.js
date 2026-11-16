// Station surface materials (55th request: "the whole station looks plastic … make the textures hyper realistic").
//
// One layered PBR material for the whole Colombo Fort station (and the train cars): every surface picks one of LAYERS —
// weathered lime-washed plaster, eggshell paint, gloss-painted cast iron with chips and rust, brushed stainless steel,
// varnished timber, terracotta pavers, polished terrazzo, concrete, glass mosaic, carriage enamel with grime streaks,
// greasy underframe steel, rubber, vitreous enamel, woven upholstery, vinyl, brass, galvanised steel, painted timber.
//   • the layer index rides in the vertex colour (r + 2·layer; the shader splits it again), so ONE mesh / ONE draw call
//     draws every layer — the station had paint, metal and kerb meshes before; now it has one (fewer draw calls)
//   • textures: two DataArrayTextures, 512 × 512 per layer (albedo-detail + metalness; normal xy + roughness + cavity AO),
//     generated procedurally once (tileable fBm, cells, scattered chips) — no texture is larger than 512²
//   • UVs are box-projected from the position and normal at merge time, in metres × a per-layer scale, so nothing
//     stretches (a 19 m carriage side gets the same texel density as a bench slat)
//   • the albedo layer is a detail multiplier around 1 on top of the vertex colour, so the authored colours stay
// The interior light (InteriorLight.js) is applied on top: sky visibility under the roofs + the fluorescent tubes.
import * as THREE from 'three';
import { patchInterior } from './InteriorLight.js';

export const LAYERS = ['plaster', 'paint', 'iron', 'steel', 'wood', 'pavers', 'terrazzo', 'concrete', 'mosaic', 'carPaint', 'under', 'rubber', 'enamel', 'fabric', 'vinyl', 'brass', 'galv', 'timberPaint'];
export const L = Object.fromEntries(LAYERS.map((n, i) => [n, i]));
// metres per texture repeat (box projection)
const SCALE = { plaster: 2.4, paint: 2.0, iron: 1.2, steel: 0.8, wood: 1.1, pavers: 2.4, terrazzo: 1.6, concrete: 2.6, mosaic: 1.2, carPaint: 2.6, under: 1.4, rubber: 0.8, enamel: 1.2, fabric: 0.45, vinyl: 1.8, brass: 0.4, galv: 1.6, timberPaint: 1.2 };
const N = 512;

// ---------------------------------------------------------------- tileable noise
function hash(x, y, s) { let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
// fBm field (N × N, tileable): period P cells at the first octave
function fbm(P, oct, seed, gain = 0.5) {
  const out = new Float32Array(N * N); let amp = 1, tot = 0;
  for (let o = 0; o < oct; o++) { const p = P << o; if (p > N) break; const lat = new Float32Array(p * p); for (let j = 0; j < p; j++) for (let i = 0; i < p; i++) lat[j * p + i] = hash(i, j, seed + o * 7919);
    const cs = N / p;
    for (let y = 0; y < N; y++) { const fy = y / cs, y0 = Math.floor(fy), ty = fy - y0, sy = ty * ty * (3 - 2 * ty), r0 = (y0 % p) * p, r1 = ((y0 + 1) % p) * p;
      for (let x = 0; x < N; x++) { const fx = x / cs, x0 = Math.floor(fx), tx = fx - x0, sx = tx * tx * (3 - 2 * tx), c0 = x0 % p, c1 = (x0 + 1) % p;
        const a = lat[r0 + c0] + (lat[r0 + c1] - lat[r0 + c0]) * sx, b = lat[r1 + c0] + (lat[r1 + c1] - lat[r1 + c0]) * sx; out[y * N + x] += (a + (b - a) * sy) * amp; } }
    tot += amp; amp *= gain; }
  for (let i = 0; i < out.length; i++) out[i] /= tot; return out;
}
// anisotropic fBm (stretched along x: streaks / grain / brushing): cells px × py
function fbmAniso(px, py, oct, seed) {
  const out = new Float32Array(N * N); let amp = 1, tot = 0;
  for (let o = 0; o < oct; o++) { const qx = px << o, qy = py << o; if (qx > N || qy > N) break; const lat = new Float32Array(qx * qy); for (let j = 0; j < qy; j++) for (let i = 0; i < qx; i++) lat[j * qx + i] = hash(i, j, seed + o * 104729);
    const cx = N / qx, cy = N / qy;
    for (let y = 0; y < N; y++) { const fy = y / cy, y0 = Math.floor(fy), ty = fy - y0, sy = ty * ty * (3 - 2 * ty), r0 = (y0 % qy) * qx, r1 = ((y0 + 1) % qy) * qx;
      for (let x = 0; x < N; x++) { const fx = x / cx, x0 = Math.floor(fx), tx = fx - x0, sx = tx * tx * (3 - 2 * tx), c0 = x0 % qx, c1 = (x0 + 1) % qx;
        const a = lat[r0 + c0] + (lat[r0 + c1] - lat[r0 + c0]) * sx, b = lat[r1 + c0] + (lat[r1 + c1] - lat[r1 + c0]) * sx; out[y * N + x] += (a + (b - a) * sy) * amp; } }
    tot += amp; amp *= 0.5; }
  for (let i = 0; i < out.length; i++) out[i] /= tot; return out;
}
const sm = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const cl = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

// ---------------------------------------------------------------- the layers
// each painter fills: alb (r,g,b detail multipliers around 1), met, h (height 0..1), rough, ao
function paintLayers() {
  const F1 = fbm(4, 6, 11), F2 = fbm(16, 5, 23), F3 = fbm(64, 3, 37), F4 = fbm(8, 6, 41), S1 = fbmAniso(24, 2, 4, 53), S2 = fbmAniso(2, 96, 3, 61);
  const at = (F, x, y) => F[((y + N) % N) * N + ((x + N) % N)];
  const layers = [];
  const make = (fill) => { const A = new Float32Array(N * N * 3), M = new Float32Array(N * N), H = new Float32Array(N * N), R = new Float32Array(N * N), O = new Float32Array(N * N).fill(1); fill({ A, M, H, R, O }); return { A, M, H, R, O }; };
  const set = (A, i, r, g, b) => { A[i * 3] = r; A[i * 3 + 1] = g; A[i * 3 + 2] = b; };
  // cells (tiles / pavers): returns per-pixel {id, edge distance in px}
  const cells = (nx, ny, stagger) => { const id = new Int32Array(N * N), ed = new Float32Array(N * N); const cw = N / nx, ch = N / ny;
    for (let y = 0; y < N; y++) { const row = Math.floor(y / ch); const off = stagger && row % 2 ? cw / 2 : 0; for (let x = 0; x < N; x++) { const xx = (x + off) % N, col = Math.floor(xx / cw); id[y * N + x] = row * 1000 + col; ed[y * N + x] = Math.min(xx - col * cw, (col + 1) * cw - xx, y - row * ch, (row + 1) * ch - y); } }
    return { id, ed }; };

  // 0 plaster: lime-washed render — soft blotches, brush marks, fine grit, hairline cracks, dirt streaks running down
  layers.push(make(({ A, H, R, O }) => { for (let i = 0; i < N * N; i++) { const x = i % N, y = (i / N) | 0; const crack = sm(0.012, 0.0, Math.abs(F2[i] - 0.5)) * sm(0.55, 0.75, F1[i]); const streak = sm(0.55, 0.8, at(S2, x, y)) * 0.6;
    const v = 0.955 + 0.06 * (F1[i] - 0.5) + 0.05 * (F3[i] - 0.5) - 0.025 * streak - 0.22 * crack - 0.04 * sm(0.6, 0.9, F4[i]); set(A, i, v * 1.0, v * 0.99, v * 0.965);
    H[i] = 0.5 + 0.07 * (F3[i] - 0.5) + 0.09 * (F2[i] - 0.5) + 0.12 * (F1[i] - 0.5) - 0.25 * crack; /* 55th: smooth painted render with a soft undulation — the old grit read as rough stucco */ R[i] = 0.9 + 0.08 * (F3[i] - 0.5); O[i] = 1 - 0.5 * crack; } }));
  // 1 paint: eggshell wall / board paint — faint roller texture, scuffs
  layers.push(make(({ A, H, R }) => { for (let i = 0; i < N * N; i++) { const scuff = sm(0.7, 0.85, F4[i]) * 0.5; const v = 0.98 + 0.03 * (F1[i] - 0.5) + 0.02 * (F3[i] - 0.5) - 0.05 * scuff; set(A, i, v, v, v * 0.99); H[i] = 0.5 + 0.06 * (F3[i] - 0.5) + 0.04 * (F1[i] - 0.5); R[i] = 0.55 + 0.12 * (F1[i] - 0.5) + 0.15 * scuff; } }));
  // 2 iron: gloss-painted cast iron, layers of old paint, chips to rust at the edges, rust bleeding
  layers.push(make(({ A, M, H, R, O }) => { for (let i = 0; i < N * N; i++) { const chip = sm(0.66, 0.7, F2[i] * 0.7 + F3[i] * 0.3), rust = sm(0.6, 0.85, F4[i]) * 0.5 + chip;
    const v = 0.97 + 0.05 * (F1[i] - 0.5); const r = v * (1 - chip) + chip * 1.55, g = v * (1 - chip) + chip * 0.95, b = v * (1 - chip) + chip * 0.6; set(A, i, r * (1 - 0.15 * rust) + 0.12 * rust, g * (1 - 0.2 * rust), b * (1 - 0.3 * rust));
    M[i] = 0.15 * chip; H[i] = 0.55 + 0.25 * (F3[i] - 0.5) - 0.35 * chip; R[i] = 0.38 + 0.1 * (F1[i] - 0.5) + 0.45 * chip + 0.15 * rust; O[i] = 1 - 0.25 * chip; } }));
  // 3 steel: brushed stainless, directional grain, finger smudges
  layers.push(make(({ A, M, H, R }) => { for (let i = 0; i < N * N; i++) { const g = S1[i], smudge = sm(0.6, 0.8, F1[i]) * 0.5; const v = 0.94 + 0.12 * (g - 0.5) - 0.05 * smudge; set(A, i, v, v * 1.005, v * 1.01); M[i] = 1; H[i] = 0.5 + 0.1 * (g - 0.5); R[i] = 0.28 + 0.14 * (g - 0.5) + 0.18 * smudge; } }));
  // 4 wood: varnished teak-like timber — growth rings along the board, pores, worn varnish
  layers.push(make(({ A, H, R, O }) => { for (let i = 0; i < N * N; i++) { const x = i % N, y = (i / N) | 0; const t = y / N * 22 + (at(F1, x, y) - 0.5) * 6 + (at(S1, x, y) - 0.5) * 1.5; const ring = t - Math.floor(t); const late = sm(0.55, 0.95, ring) * (1 - sm(0.95, 1.0, ring));
    const pore = sm(0.62, 0.7, at(S1, (x * 3) % N, (y * 2) % N)) * 0.4, wear = sm(0.68, 0.85, F4[i]);
    const v = 1.04 - 0.22 * late - 0.08 * pore + 0.05 * (F3[i] - 0.5) + 0.06 * wear; set(A, i, v * 1.03, v * 0.98, v * 0.9); H[i] = 0.5 - 0.25 * late - 0.3 * pore; R[i] = 0.42 + 0.1 * late + 0.25 * wear; O[i] = 1 - 0.2 * pore; } }));
  // 5 pavers: terracotta / cement pavers 30 cm (8 × 8 per 2.4 m), sanded joints, each slab its own shade, grime, pits
  { const C = cells(8, 8, false); layers.push(make(({ A, H, R, O }) => { for (let i = 0; i < N * N; i++) { const e = C.ed[i], id = C.id[i]; const joint = sm(3.2, 1.4, e); const s = hash(id, 3, 5), s2 = hash(id, 9, 7); const pit = sm(0.8, 0.9, F3[i]) * 0.6;
    const v = (0.9 + 0.18 * (s - 0.5) + 0.08 * (F2[i] - 0.5) - 0.12 * sm(0.62, 0.85, F1[i]) - 0.1 * pit) * (1 - 0.45 * joint); set(A, i, v * (1 + 0.05 * (s2 - 0.5)), v, v * (1 - 0.05 * (s2 - 0.5)));
    H[i] = 0.62 - 0.5 * joint + 0.1 * (F3[i] - 0.5) - 0.2 * pit + 0.06 * (s - 0.5); R[i] = 0.82 + 0.12 * joint - 0.12 * sm(0.62, 0.85, F1[i]); O[i] = 1 - 0.5 * joint; } })); }
  // 6 terrazzo: polished cement with marble chips (white, grey, black, ochre), worn traffic lanes duller
  layers.push(make(({ A, H, R }) => { const chip = new Float32Array(N * N * 3).fill(-1); const r = rng(77);
    for (let k = 0; k < 5200; k++) { const cx = r() * N, cy = r() * N, rad = 1.2 + r() * r() * 5.5, tone = [[1.18, 1.16, 1.1], [0.62, 0.62, 0.62], [0.32, 0.31, 0.3], [1.1, 0.95, 0.75], [0.85, 0.84, 0.82]][(r() * 5) | 0]; const ax = 0.6 + r() * 0.8;
      for (let dy = -Math.ceil(rad); dy <= Math.ceil(rad); dy++) for (let dx = -Math.ceil(rad * ax); dx <= Math.ceil(rad * ax); dx++) { if ((dx / ax) ** 2 + dy * dy > rad * rad) continue; const x = ((Math.floor(cx) + dx) % N + N) % N, y = ((Math.floor(cy) + dy) % N + N) % N, j = (y * N + x) * 3; chip[j] = tone[0]; chip[j + 1] = tone[1]; chip[j + 2] = tone[2]; } }
    for (let i = 0; i < N * N; i++) { const base = 0.97 + 0.05 * (F2[i] - 0.5); const has = chip[i * 3] >= 0; const wear = sm(0.55, 0.8, F1[i]);
      set(A, i, has ? chip[i * 3] : base, has ? chip[i * 3 + 1] : base * 0.99, has ? chip[i * 3 + 2] : base * 0.97); H[i] = 0.5 + 0.04 * (F3[i] - 0.5); R[i] = 0.16 + 0.22 * wear + 0.05 * (F3[i] - 0.5); } }));
  // 7 concrete: cast concrete / stone coping — pitting, form marks, dark weathering
  layers.push(make(({ A, H, R, O }) => { for (let i = 0; i < N * N; i++) { const pit = sm(0.78, 0.86, F3[i]); const v = 0.95 + 0.14 * (F1[i] - 0.5) + 0.08 * (F2[i] - 0.5) - 0.18 * pit - 0.1 * sm(0.6, 0.85, F4[i]); set(A, i, v, v * 0.99, v * 0.97); H[i] = 0.55 + 0.2 * (F2[i] - 0.5) + 0.15 * (F3[i] - 0.5) - 0.4 * pit; R[i] = 0.9 - 0.05 * F1[i]; O[i] = 1 - 0.4 * pit; } }));
  // 8 mosaic: 25 mm glass / ceramic mosaic (48 per 1.2 m), each tessera its own shade, grout lines
  { const C = cells(48, 48, false); layers.push(make(({ A, H, R, O }) => { for (let i = 0; i < N * N; i++) { const e = C.ed[i], id = C.id[i]; const grout = sm(1.4, 0.4, e), s = hash(id, 1, 2); const v = (0.88 + 0.26 * (s - 0.5) + (s > 0.93 ? 0.18 : 0)) * (1 - grout) + grout * 1.35;
    set(A, i, v, v * (1 + 0.04 * (hash(id, 4, 4) - 0.5)), v); H[i] = 0.6 - 0.5 * grout + 0.05 * (F3[i] - 0.5); R[i] = 0.22 + 0.65 * grout + 0.08 * F1[i]; O[i] = 1 - 0.35 * grout; } })); }
  // 9 carPaint: carriage enamel — orange-peel, grime collecting and rain streaks running down, faded patches
  layers.push(make(({ A, H, R }) => { for (let i = 0; i < N * N; i++) { const x = i % N, y = (i / N) | 0; const streak = sm(0.55, 0.85, at(S2, x, y)); const dirt = sm(0.5, 0.85, F1[i]) * 0.5 + streak * 0.35;
    const v = 0.99 + 0.03 * (F2[i] - 0.5) - 0.13 * dirt; set(A, i, v * (1 - 0.02 * dirt), v * (1 - 0.04 * dirt), v * (1 - 0.08 * dirt)); H[i] = 0.5 + 0.12 * (F3[i] - 0.5); R[i] = 0.34 + 0.32 * dirt + 0.05 * (F3[i] - 0.5); } }));
  // 10 under: underframe / bogie steel — grease, brake dust, rust
  layers.push(make(({ A, M, H, R, O }) => { for (let i = 0; i < N * N; i++) { const rust = sm(0.55, 0.8, F4[i]), grease = sm(0.5, 0.75, F2[i]); const v = 0.9 + 0.3 * (F1[i] - 0.5) - 0.25 * grease;
    set(A, i, v * (1 + 0.45 * rust), v * (1 + 0.12 * rust), v * (1 - 0.15 * rust)); M[i] = 0.55 - 0.4 * rust - 0.2 * grease; H[i] = 0.5 + 0.3 * (F3[i] - 0.5) + 0.15 * rust; R[i] = 0.6 + 0.3 * rust - 0.25 * grease; O[i] = 1 - 0.2 * grease; } }));
  // 11 rubber / plastic: fine stipple, satin
  layers.push(make(({ A, H, R }) => { for (let i = 0; i < N * N; i++) { const v = 0.97 + 0.06 * (F3[i] - 0.5) + 0.03 * (F1[i] - 0.5); set(A, i, v, v, v); H[i] = 0.5 + 0.3 * (F3[i] - 0.5); R[i] = 0.72 + 0.1 * (F2[i] - 0.5); } }));
  // 12 enamel: vitreous enamel / gloss signboard / clock dial rim — near-mirror gloss, a few chips
  layers.push(make(({ A, H, R }) => { for (let i = 0; i < N * N; i++) { const chip = sm(0.74, 0.76, F2[i] * 0.6 + F3[i] * 0.4); const v = 1.0 + 0.015 * (F1[i] - 0.5) - 0.6 * chip; set(A, i, v, v, v); H[i] = 0.5 - 0.3 * chip; R[i] = 0.12 + 0.05 * F1[i] + 0.5 * chip; } }));
  // 13 fabric: woven upholstery / cotton — twill weave, fuzz
  layers.push(make(({ A, H, R, O }) => { for (let i = 0; i < N * N; i++) { const x = i % N, y = (i / N) | 0; const w = Math.sin((x + y) * Math.PI / 4) * 0.5 + 0.5, wf = Math.sin((x - y * 0.5) * Math.PI / 8); const v = 0.95 + 0.08 * (w - 0.5) + 0.05 * (F3[i] - 0.5) + 0.02 * wf;
    set(A, i, v, v, v); H[i] = 0.5 + 0.35 * (w - 0.5); R[i] = 0.93; O[i] = 0.9 + 0.1 * w; } }));
  // 14 vinyl: office sheet vinyl — speckle, scuff marks, satin
  layers.push(make(({ A, H, R }) => { const r = rng(5); const sp = new Float32Array(N * N); for (let k = 0; k < 9000; k++) sp[((r() * N) | 0) * N + ((r() * N) | 0)] = r() > 0.5 ? 0.25 : -0.2;
    for (let i = 0; i < N * N; i++) { const scuff = sm(0.72, 0.9, at(S1, i % N, (i / N) | 0)) * sm(0.5, 0.7, F1[i]); const v = 0.97 + sp[i] + 0.05 * (F2[i] - 0.5) - 0.12 * scuff; set(A, i, v, v, v * 0.98); H[i] = 0.5; R[i] = 0.45 + 0.2 * scuff + 0.05 * F3[i]; } }));
  // 15 brass: clock bezels, fittings — polished with tarnish in the hollows
  layers.push(make(({ A, M, H, R }) => { for (let i = 0; i < N * N; i++) { const tarn = sm(0.5, 0.8, F2[i]); const v = 1.02 - 0.25 * tarn + 0.05 * (F3[i] - 0.5); set(A, i, v, v * (1 - 0.05 * tarn), v * (1 - 0.15 * tarn)); M[i] = 1 - 0.3 * tarn; H[i] = 0.5 + 0.05 * (F3[i] - 0.5); R[i] = 0.24 + 0.35 * tarn; } }));
  // 16 galv: galvanised steel — spangle crystals, white rust, dull
  { const C = cells(14, 11, true); layers.push(make(({ A, M, H, R }) => { for (let i = 0; i < N * N; i++) { const s = hash(C.id[i], 5, 9), wr = sm(0.6, 0.85, F1[i]); const v = 0.92 + 0.12 * (s - 0.5) + 0.12 * wr; set(A, i, v, v, v * 1.01); M[i] = 0.85 - 0.5 * wr; H[i] = 0.5 + 0.06 * (s - 0.5); R[i] = 0.42 + 0.15 * (s - 0.5) + 0.35 * wr; } })); }
  // 17 timberPaint: painted timber (window frames, shutters, kiosks) — grain showing through the paint, brush strokes, wear
  layers.push(make(({ A, H, R, O }) => { for (let i = 0; i < N * N; i++) { const x = i % N, y = (i / N) | 0; const t = y / N * 18 + (at(F1, x, y) - 0.5) * 5; const ring = t - Math.floor(t); const grain = sm(0.6, 0.95, ring) * 0.6; const brush = at(S1, x, (y * 3) % N); const wear = sm(0.7, 0.88, F4[i]);
    const v = 0.98 - 0.05 * grain + 0.04 * (brush - 0.5) - 0.18 * wear; set(A, i, v * (1 + 0.1 * wear), v, v * (1 - 0.12 * wear)); H[i] = 0.5 - 0.06 * grain + 0.05 * (brush - 0.5) - 0.08 * wear; R[i] = 0.5 + 0.1 * grain + 0.3 * wear; O[i] = 1 - 0.1 * grain; } }));
  return layers;
}

let _tex = null;
function buildTextures() {
  if (_tex) return _tex;
  const layers = paintLayers(), n = layers.length;
  const alb = new Uint8Array(N * N * 4 * n), nrm = new Uint8Array(N * N * 4 * n);
  layers.forEach((ly, l) => { const o = l * N * N * 4; const { A, M, H, R, O } = ly;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const i = y * N + x, j = o + i * 4;
      alb[j] = Math.round(cl(A[i * 3] * 0.5) * 255); alb[j + 1] = Math.round(cl(A[i * 3 + 1] * 0.5) * 255); alb[j + 2] = Math.round(cl(A[i * 3 + 2] * 0.5) * 255); alb[j + 3] = Math.round(cl(M[i]) * 255);
      const hx = (H[y * N + ((x + 1) % N)] - H[y * N + ((x + N - 1) % N)]) * 6, hy = (H[((y + 1) % N) * N + x] - H[((y + N - 1) % N) * N + x]) * 6; const nz = 1 / Math.hypot(hx, hy, 1);
      nrm[j] = Math.round((-hx * nz * 0.5 + 0.5) * 255); nrm[j + 1] = Math.round((-hy * nz * 0.5 + 0.5) * 255); nrm[j + 2] = Math.round(cl(R[i]) * 255); nrm[j + 3] = Math.round(cl(O[i]) * 255); } });
  const mk = (data) => { const t = new THREE.DataArrayTexture(data, N, N, n); t.format = THREE.RGBAFormat; t.type = THREE.UnsignedByteType; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = true; t.anisotropy = 4; t.colorSpace = THREE.NoColorSpace; t.needsUpdate = true; return t; };
  _tex = { alb: mk(alb), nrm: mk(nrm) }; return _tex;
}

// ---------------------------------------------------------------- the material
const _mats = new Map();
export function stationMaterial(opts = {}) {
  const key = JSON.stringify(opts); if (_mats.has(key)) return _mats.get(key);
  const T = buildTextures();
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 1, side: opts.side || THREE.FrontSide, envMapIntensity: opts.env ?? 0.9 });
  m.name = 'stationPBR';
  const U = { uLAlb: { value: T.alb }, uLNrm: { value: T.nrm }, uLNS: { value: opts.normal ?? 1.0 } };
  m.onBeforeCompile = (sh) => { Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vLUv; flat varying float vLL;')
      .replace('#include <color_vertex>', '#if defined( USE_COLOR )\n  float lL = floor(color.r * 0.5); vColor = vec4(color.r - 2.0 * lL, color.g, color.b, 1.0); vLL = lL;\n#endif')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvLUv = uv;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nprecision highp sampler2DArray;\nuniform sampler2DArray uLAlb; uniform sampler2DArray uLNrm; uniform float uLNS;\nvarying vec2 vLUv; flat varying float vLL;\nvec4 lA; vec4 lN;')
      .replace('#include <color_fragment>', '#include <color_fragment>\n{ lA = texture(uLAlb, vec3(vLUv, vLL)); lN = texture(uLNrm, vec3(vLUv, vLL)); diffuseColor.rgb *= lA.rgb * 2.0; }')
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = roughness * lN.b;')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = metalness * lA.a;')
      .replace('#include <normal_fragment_maps>', `{ vec3 q0 = dFdx(-vViewPosition), q1 = dFdy(-vViewPosition); vec2 st0 = dFdx(vLUv), st1 = dFdy(vLUv); vec3 Nn = normal;
  vec3 q1p = cross(q1, Nn), q0p = cross(Nn, q0); vec3 Tt = q1p * st0.x + q0p * st1.x, Bt = q1p * st0.y + q0p * st1.y; float det = max(dot(Tt, Tt), dot(Bt, Bt)); float sc = det == 0.0 ? 0.0 : inversesqrt(det);
  vec2 nxy = (lN.rg * 2.0 - 1.0) * uLNS; vec3 mn = vec3(nxy, sqrt(max(0.0, 1.0 - dot(nxy, nxy)))); normal = normalize(Tt * (mn.x * sc) + Bt * (mn.y * sc) + Nn * mn.z); }`)
      .replace('#include <aomap_fragment>', '#include <aomap_fragment>\nreflectedLight.indirectDiffuse *= lN.a; reflectedLight.indirectSpecular *= lN.a;');
  };
  m.customProgramCacheKey = () => 'stationPBR1';
  if (opts.interior !== false) patchInterior(m);
  _mats.set(key, m); return m;
}

// ---------------------------------------------------------------- building with layers
// A MultiBuilder whose keys are layer names; merge() → one BufferGeometry (box-projected uv, layer in colour.r).
export function mergeLayered(mbLayers, { scale = 1 } = {}) {
  const parts = []; let vtot = 0, itot = 0;
  for (const [name, b] of mbLayers.b) { const l = L[name]; if (l === undefined || !b.pos.length) continue; parts.push([l, b]); vtot += b.pos.length / 3; itot += b.idx.length; }
  if (!vtot) return null;
  const P = new Float32Array(vtot * 3), Nn = new Float32Array(vtot * 3), UV = new Float32Array(vtot * 2), C = new Float32Array(vtot * 3), I = vtot > 65535 ? new Uint32Array(itot) : new Uint16Array(itot);
  let vo = 0, io = 0;
  for (const [l, b] of parts) { const s = 1 / (SCALE[LAYERS[l]] * scale), n = b.pos.length / 3; const sh = (l * 0.137) % 1; // per-layer uv offset so neighbouring layers don't line up
    for (let i = 0; i < n; i++) { const x = b.pos[i * 3], y = b.pos[i * 3 + 1], z = b.pos[i * 3 + 2], nx = b.nor[i * 3], ny = b.nor[i * 3 + 1], nz = b.nor[i * 3 + 2]; const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
      const k = vo + i; P[k * 3] = x; P[k * 3 + 1] = y; P[k * 3 + 2] = z; Nn[k * 3] = nx; Nn[k * 3 + 1] = ny; Nn[k * 3 + 2] = nz;
      let u, v; if (ay >= ax && ay >= az) { u = x; v = z; } else if (ax >= az) { u = nx > 0 ? -z : z; v = y; } else { u = nz > 0 ? x : -x; v = y; }
      UV[k * 2] = u * s + sh; UV[k * 2 + 1] = v * s + sh;
      C[k * 3] = Math.min(1, Math.max(0, b.col[i * 3])) + 2 * l; C[k * 3 + 1] = b.col[i * 3 + 1]; C[k * 3 + 2] = b.col[i * 3 + 2]; }
    for (let j = 0; j < b.idx.length; j++) I[io + j] = b.idx[j] + vo; vo += n; io += b.idx.length; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.BufferAttribute(Nn, 3)); g.setAttribute('uv', new THREE.BufferAttribute(UV, 2)); g.setAttribute('color', new THREE.BufferAttribute(C, 3)); g.setIndex(new THREE.BufferAttribute(I, 1));
  g.computeBoundingSphere(); g.computeBoundingBox(); return g;
}

// A builder facade that routes each call to a layer picked from the colour (default layer otherwise) — lets the existing
// station code keep calling paint.box(…, { col }) / B(paint, …, '#hex') while every surface lands on a real material.
export class LayerRouter {
  constructor(lmb, def, pick = null) { this.lmb = lmb; this.def = def; this.pick = pick; }
  _b(col) { const n = (this.pick && col && this.pick(col)) || this.def; return this.lmb.get(n); }
  box(cx, cy, cz, sx, sy, sz, o = {}) { this._b(o.col).box(cx, cy, cz, sx, sy, sz, o); return this; }
  cylinder(cx, cy, cz, r0, r1, h, seg, o = {}) { this._b(o.col).cylinder(cx, cy, cz, r0, r1, h, seg, o); return this; }
  quad(a, b, c, d, uv, col) { this._b(col).quad(a, b, c, d, uv, col); return this; }
  geometry(g, m, col) { this._b(col).geometry(g, m, col); return this; }
  hrect(...a) { this._b(a[6]).hrect(...a); return this; }
  get vcount() { return this.lmb.get(this.def).vcount; }
  vert(...a) { return this.lmb.get(this.def).vert(...a); }
}
export const colKey = (c) => (Array.isArray(c) ? c.map((v) => Math.round(v * 255)).join(',') : String(c));
