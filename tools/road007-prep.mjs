// 63rd request: turns the user's Road007 2K PBR set (Color / NormalGL / Roughness / Displacement) into the game's road
// textures.  node tools/road007-prep.mjs [sourceDir=dev/tmp/road007] [outDir=public/assets/road]
//
// The source is a two-lane carriageway strip with its lane lines painted in (solid white edge lines at ~7 % / ~92 % of the
// width, a dashed centre line at 50 %). The game paints its own markings per road class (dual carriageways: double centre
// line + lane dashes + edge lines; main roads: centre dashes + yellow edges; side streets: centre dashes; lanes: none; zebra
// crossings and stop lines at junctions), at every road width from 6.5 m to 18 m — baked lines could never line up with those.
// So the painted lines are lifted OUT of all four maps (each line band is replaced by clean asphalt from elsewhere in the same
// image, with a feathered seam, the same donor pixels in every map so colour / relief / roughness stay registered), leaving the
// user's asphalt: its aggregate, mottling, relief and roughness. The set tiles seamlessly on both axes (checked: edge-to-edge
// differences equal neighbouring-pixel differences), so the result does too.
//
// Outputs (512², the project's texture budget; JPEG):
//   road007_color.jpg   sRGB albedo, with a light cavity term from the displacement (pits a touch darker)
//   road007_normal.jpg  OpenGL tangent normal (three.js convention, no green flip)
//   road007_rough.jpg   roughness in the G channel (three.js reads G), from the Roughness map
//   road007_paint.jpg   road-marking paint: worn thermoplastic over this asphalt (white, with the asphalt's own pits and
//                       wear showing through; the marking meshes tint it white or yellow)
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const [src = 'dev/tmp/road007', out = 'public/assets/road'] = process.argv.slice(2);
const find = (k) => { const f = fs.readdirSync(src).find((n) => new RegExp(`_${k}\\.(jpe?g|png)$`, 'i').test(n)); if (!f) throw new Error(`no *_${k} map in ${src}`); return path.join(src, f); };
const load = async (k, ch) => { const { data, info } = await sharp(find(k)).removeAlpha().toColourspace(ch === 1 ? 'b-w' : 'srgb').raw().toBuffer({ resolveWithObject: true }); if (info.channels !== ch) throw new Error(k + ' channels ' + info.channels); return { d: data, W: info.width, H: info.height, ch }; };
const C = await load('Color', 3), N = await load('NormalGL', 3), R = await load('Roughness', 1), D = await load('Displacement', 1);
const W = C.W, H = C.H; for (const m of [N, R, D]) if (m.W !== W || m.H !== H) throw new Error('map sizes differ');

// 1. find the painted bands: columns whose mean luminance stands clearly above the asphalt
const lum = new Float64Array(W); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 3; lum[x] += (C.d[i] * 0.3 + C.d[i + 1] * 0.59 + C.d[i + 2] * 0.11) / H; }
const mean = lum.reduce((a, b) => a + b) / W; const bands = []; let s = -1;
for (let x = 0; x <= W; x++) { const hi = x < W && lum[x] > mean + 10; if (hi && s < 0) s = x; if (!hi && s >= 0) { if (x - s >= 4) bands.push([s, x - 1]); s = -1; } }
if (bands.length < 1 || bands.length > 6) throw new Error('unexpected line layout: ' + JSON.stringify(bands));
const M = Math.round(W * 0.01); // overspray / grime margin around each line
console.log('painted bands (px):', bands.map((b) => b.join('–')).join(', '), 'margin', M);

// 2. replace every band by asphalt from a clean donor strip (shifted across and down, wrapping), feathered over F px
const F = Math.round(W * 0.03); const clean = (x) => bands.every(([a, b]) => x < a - M - F - 2 || x > b + M + F + 2);
const wrap = (v, n) => ((v % n) + n) % n;
for (const [a, b] of bands) {
  const x0 = a - M - F, x1 = b + M + F; let dx = 0;
  for (const cand of [W * 0.16, -W * 0.16, W * 0.27, -W * 0.27, W * 0.38, -W * 0.38].map(Math.round)) { let okd = true; for (let x = x0; x <= x1; x++) if (!clean(wrap(x + cand, W))) { okd = false; break; } if (okd) { dx = cand; break; } }
  if (!dx) throw new Error('no clean donor strip for band ' + a + '–' + b);
  const dy = Math.round(H * 0.379);
  for (let x = x0; x <= x1; x++) {
    const e = Math.min(x - x0, x1 - x) / F; const t = e >= 1 ? 1 : e * e * (3 - 2 * e); const xs = wrap(x + dx, W), xd = wrap(x, W);
    for (let y = 0; y < H; y++) { const ys = wrap(y + dy, H); const id = y * W + xd, is = ys * W + xs;
      for (const m of [C, N, R, D]) for (let c = 0; c < m.ch; c++) m.d[id * m.ch + c] = Math.round(m.d[id * m.ch + c] * (1 - t) + m.d[is * m.ch + c] * t); }
  }
  console.log(`band ${a}–${b}: donor dx ${dx} dy ${dy}, feather ${F}px`);
}
// the source also carries faint lengthwise wear streaks (whole columns a few levels lighter / smoother: the wheel paths of its
// two lanes). On the game's grid, with roads running both ways at every width, those turn into stripes repeating every 4 m —
// so every map is flattened per column and per row (each column / row mean is pulled to the image mean; the game lays its own
// per-lane wheel-path wear on top, GroundBuilder.roadWear)
for (const m of [C, N, R, D]) for (let c = 0; c < m.ch; c++) {
  for (let pass = 0; pass < 2; pass++) { const n = pass ? H : W, acc = new Float64Array(n); let g = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const v = m.d[(y * W + x) * m.ch + c]; acc[pass ? y : x] += v; g += v; }
    g /= W * H; for (let k = 0; k < n; k++) acc[k] = acc[k] / (pass ? W : H) - g;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * m.ch + c; m.d[i] = Math.max(0, Math.min(255, Math.round(m.d[i] - acc[pass ? y : x]))); } }
}
// renormalise the blended normals
for (let i = 0; i < W * H; i++) { const x = N.d[i * 3] / 127.5 - 1, y = N.d[i * 3 + 1] / 127.5 - 1, z = N.d[i * 3 + 2] / 127.5 - 1; const l = Math.hypot(x, y, z) || 1; N.d[i * 3] = Math.round((x / l + 1) * 127.5); N.d[i * 3 + 1] = Math.round((y / l + 1) * 127.5); N.d[i * 3 + 2] = Math.round((z / l + 1) * 127.5); }
{ const l2 = new Float64Array(W); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 3; l2[x] += (C.d[i] * 0.3 + C.d[i + 1] * 0.59 + C.d[i + 2] * 0.11) / H; }
  const m2 = l2.reduce((a, b) => a + b) / W; let mx = 0; for (let x = 0; x < W; x++) mx = Math.max(mx, Math.abs(l2[x] - m2)); console.log('after: max column deviation', mx.toFixed(1), '(lines were', (Math.max(...lum) - mean).toFixed(1) + ')'); if (mx > 8) throw new Error('lines still visible'); }

// 3. cavity: displacement pits darken the albedo a little (the eye reads aggregate depth from it at a distance)
let dm = 0; for (let i = 0; i < W * H; i++) dm += D.d[i]; dm /= W * H; let dsd = 0; for (let i = 0; i < W * H; i++) dsd += (D.d[i] - dm) ** 2; dsd = Math.sqrt(dsd / (W * H)) || 1;
const col = Buffer.alloc(W * H * 3); for (let i = 0; i < W * H; i++) { const z = Math.max(-2.5, Math.min(2.5, (D.d[i] - dm) / dsd)); const k = 1 + 0.06 * z; for (let c = 0; c < 3; c++) col[i * 3 + c] = Math.max(0, Math.min(255, Math.round(C.d[i * 3 + c] * k))); }
const rough = Buffer.alloc(W * H * 3); for (let i = 0; i < W * H; i++) { rough[i * 3] = 255; rough[i * 3 + 1] = R.d[i]; rough[i * 3 + 2] = 0; }
// 4. paint: worn white thermoplastic over this asphalt — the pits (low displacement) and a scatter of worn grains show the
//    asphalt through; the paint film itself carries a faint grain of its own (from the colour map's mottling)
const paint = Buffer.alloc(W * H * 3); let cm = 0; for (let i = 0; i < W * H; i++) cm += C.d[i * 3 + 1]; cm /= W * H;
const blur = (src, r) => { const t = new Float32Array(W * H), o = new Float32Array(W * H); for (let y = 0; y < H; y++) { let acc = 0; for (let k = -r; k <= r; k++) acc += src[y * W + wrap(k, W)]; for (let x = 0; x < W; x++) { t[y * W + x] = acc / (2 * r + 1); acc += src[y * W + wrap(x + r + 1, W)] - src[y * W + wrap(x - r, W)]; } }
  for (let x = 0; x < W; x++) { let acc = 0; for (let k = -r; k <= r; k++) acc += t[wrap(k, H) * W + x]; for (let y = 0; y < H; y++) { o[y * W + x] = acc / (2 * r + 1); acc += t[wrap(y + r + 1, H) * W + x] - t[wrap(y - r, H) * W + x]; } } return o; };
const Dlow = blur(D.d, Math.round(W / 80)); let hsd = 0; for (let i = 0; i < W * H; i++) hsd += (D.d[i] - Dlow[i]) ** 2; hsd = Math.sqrt(hsd / (W * H)) || 1;
for (let i = 0; i < W * H; i++) { const z = (D.d[i] - Dlow[i]) / hsd; const grain = (C.d[i * 3 + 1] - cm) / 40; let wear = Math.max(0, Math.min(1, (-z - 1.5) / 1.0)) * 0.85; wear = Math.max(wear, Math.max(0, Math.min(1, (-grain - 1.25) / 0.6)) * 0.8);
  const base = 238 + grain * 9; for (let c = 0; c < 3; c++) paint[i * 3 + c] = Math.max(0, Math.min(255, Math.round(base * (1 - wear) + C.d[i * 3 + c] * 1.1 * wear))); }

fs.mkdirSync(out, { recursive: true });
const raw = { raw: { width: W, height: H, channels: 3 } };
await sharp(col, raw).resize(512, 512, { kernel: 'lanczos3' }).jpeg({ quality: 90, chromaSubsampling: '4:4:4' }).toFile(path.join(out, 'road007_color.jpg'));
await sharp(N.d, raw).resize(512, 512, { kernel: 'lanczos3' }).jpeg({ quality: 92, chromaSubsampling: '4:4:4' }).toFile(path.join(out, 'road007_normal.jpg'));
await sharp(rough, raw).resize(512, 512, { kernel: 'lanczos3' }).jpeg({ quality: 90, chromaSubsampling: '4:4:4' }).toFile(path.join(out, 'road007_rough.jpg'));
// paint: the same 4 m tile as the asphalt (the marking meshes have 1 m uvs; Textures.js repeats it ×0.25), so the paint's pits
// sit on the asphalt's own pits wherever a line is painted
await sharp(paint, raw).resize(512, 512, { kernel: 'lanczos3' }).jpeg({ quality: 90, chromaSubsampling: '4:4:4' }).toFile(path.join(out, 'road007_paint.jpg'));
for (const f of fs.readdirSync(out)) console.log(f, (fs.statSync(path.join(out, f)).size / 1024).toFixed(0) + ' KB');
