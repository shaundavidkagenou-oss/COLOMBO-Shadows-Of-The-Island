// Procedural texture library. Everything is painted at load time on canvases so the game
// ships with zero third-party art. Textures are tileable where they repeat.
import * as THREE from 'three';
import { RNG } from '../core/rng.js';
import { fbm, vnoise } from '../core/noise.js';

export const FACADE_WINDOWS = {};
export const TEX = {};
let maxAniso = 4;
export function setAniso(a) { maxAniso = a; }

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function toTex(c, { repeat = true, srgb = true, mips = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = maxAniso; t.generateMipmaps = mips;
  t.minFilter = mips ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}
// ---------------------------------------------------------------------------------------------------------------------------
// Procedural NORMAL MAPS. Each surface generator paints a height field (grey canvas, light = high) in step with its albedo —
// the same bricks, joints, cracks and patches, drawn in the same loop iterations so the albedo's RNG sequence (and therefore the
// albedo itself) is untouched — and heightToNormal turns it into a tangent-space normal map: a 3×3 Sobel gradient of the
// luminance with wrap-around sampling (tileable heights give seamless normals), OpenGL convention (+Y = +v, the convention
// three.js expects, also for the derivative tangent frame used when geometry has no tangents). Linear colour space, mipmapped,
// anisotropic like the albedo. `flat` (optional Float32Array, 1 = keep relief, 0 = flat) masks areas that must stay smooth
// (window glass on facades). `strength` is the relief: the slope a one-step height change makes across one texel.
export function heightToNormal(src, { strength = 2, wrap = true, flat = null } = {}) {
  const w = src.width, h = src.height; const sd = src.getContext('2d').getImageData(0, 0, w, h).data; const H = new Float32Array(w * h);
  for (let i = 0, j = 0; i < H.length; i++, j += 4) H[i] = (sd[j] * 0.299 + sd[j + 1] * 0.587 + sd[j + 2] * 0.114) / 255;
  const c = canvas(w, h), ctx = c.getContext('2d'), img = ctx.createImageData(w, h), d = img.data; const k = strength / 8; // Sobel weights sum to 8 per unit slope
  const X = (x) => (wrap ? (x + w) % w : Math.min(w - 1, Math.max(0, x))), Y = (y) => (wrap ? (y + h) % h : Math.min(h - 1, Math.max(0, y)));
  for (let y = 0; y < h; y++) { const r0 = Y(y - 1) * w, r1 = y * w, r2 = Y(y + 1) * w;
    for (let x = 0; x < w; x++) { const xl = X(x - 1), xr = X(x + 1);
      const tl = H[r0 + xl], t = H[r0 + x], tr = H[r0 + xr], l = H[r1 + xl], r = H[r1 + xr], bl = H[r2 + xl], b = H[r2 + x], br = H[r2 + xr];
      const m = flat ? flat[r1 + x] : 1; const gx = (tr + 2 * r + br - tl - 2 * l - bl) * k * m, gy = (bl + 2 * b + br - tl - 2 * t - tr) * k * m; // gy: canvas y runs down = −v
      const nx = -gx, ny = gy, inv = 1 / Math.sqrt(nx * nx + ny * ny + 1); const i = (r1 + x) * 4;
      d[i] = (nx * inv * 0.5 + 0.5) * 255; d[i + 1] = (ny * inv * 0.5 + 0.5) * 255; d[i + 2] = (inv * 0.5 + 0.5) * 255; d[i + 3] = 255; } }
  ctx.putImageData(img, 0, 0); return toTex(c, { srgb: false });
}
// height canvas helpers: a grey canvas, a wrap-around box blur (bevels / rounded edges), and additive tileable relief noise
function heightCanvas(w, h = w, v = 128) { const c = canvas(w, h), x = c.getContext('2d'); x.fillStyle = `rgb(${v},${v},${v})`; x.fillRect(0, 0, w, h); return c; }
function blurHeight(c, r = 1) {
  const w = c.width, h = c.height, x = c.getContext('2d'), img = x.getImageData(0, 0, w, h), d = img.data; const a = new Float32Array(w * h), b = new Float32Array(w * h);
  for (let i = 0; i < a.length; i++) a[i] = d[i * 4]; const n = 2 * r + 1;
  for (let y = 0; y < h; y++) for (let xx = 0; xx < w; xx++) { let s = 0; for (let k = -r; k <= r; k++) s += a[y * w + (xx + k + w) % w]; b[y * w + xx] = s / n; }
  for (let y = 0; y < h; y++) for (let xx = 0; xx < w; xx++) { let s = 0; for (let k = -r; k <= r; k++) s += b[((y + k + h) % h) * w + xx]; const v = s / n; const i = (y * w + xx) * 4; d[i] = d[i + 1] = d[i + 2] = v; }
  x.putImageData(img, 0, 0); return c;
}
const hash2 = (x, y, s) => { let q = (x * 374761393 + y * 668265263 + s * 2147483647) | 0; q = Math.imul(q ^ (q >>> 13), 1274126177); return ((q ^ (q >>> 16)) >>> 0) / 4294967296; };
// add relief noise to a height canvas: fbm (tileable, `scale` cells per tile) and per-texel grain (aggregate / sand / plaster pits)
function reliefNoise(c, { scale = 16, amp = 30, oct = 3, seed = 1, grain = 0, grainSeed = 7 } = {}) {
  const w = c.width, h = c.height, x = c.getContext('2d'), img = x.getImageData(0, 0, w, h), d = img.data;
  for (let y = 0; y < h; y++) for (let xx = 0; xx < w; xx++) { const i = (y * w + xx) * 4; let v = d[i];
    if (amp) v += (fbm((xx / w) * scale, (y / h) * scale, oct, seed, scale) - 0.5) * 2 * amp; if (grain) v += (hash2(xx, y, grainSeed) - 0.5) * 2 * grain;
    v = Math.max(0, Math.min(255, v)); d[i] = d[i + 1] = d[i + 2] = v; }
  x.putImageData(img, 0, 0); return c;
}
// Multiply a canvas by tileable fbm noise (cheap way to add grime / variation).
function grime(ctx, w, h, { scale = 8, amount = 0.25, seed = 1, oct = 4, bias = 0, color = null } = {}) {
  const img = ctx.getImageData(0, 0, w, h); const d = img.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const n = fbm((x / w) * scale, (y / h) * scale, oct, seed, scale);
    const f = 1 - amount * (n - 0.5 + bias) * 2;
    const i = (y * w + x) * 4;
    if (color) { const k = Math.max(0, (n - 0.5 + bias) * 2) * amount; d[i] = d[i] * (1 - k) + color[0] * k; d[i + 1] = d[i + 1] * (1 - k) + color[1] * k; d[i + 2] = d[i + 2] * (1 - k) + color[2] * k; }
    else { d[i] *= f; d[i + 1] *= f; d[i + 2] *= f; }
  }
  ctx.putImageData(img, 0, 0);
}
// hx / hcols (optional): draw the same specks into a height canvas, height colour picked by the same index (same RNG calls)
function speckle(ctx, w, h, n, colors, rng, size = [0.5, 1.6], hx = null, hcols = null) {
  for (let k = 0; k < n; k++) { const col = rng.pick(colors); ctx.fillStyle = col; const s = rng.range(size[0], size[1]); const x = rng.next() * w, y = rng.next() * h; ctx.fillRect(x, y, s, s);
    if (hx) { hx.fillStyle = hcols[colors.indexOf(col)]; hx.fillRect(x, y, s, s); } }
}
function stains(ctx, w, h, rng, count, color, vertical = true) {
  for (let k = 0; k < count; k++) {
    const x = rng.next() * w, y = rng.next() * h * 0.6; const len = rng.range(h * 0.1, h * 0.5); const wd = rng.range(4, 18);
    const g = ctx.createLinearGradient(0, y, 0, y + len);
    g.addColorStop(0, color.replace('A', '0.0')); g.addColorStop(0.15, color.replace('A', '0.22')); g.addColorStop(1, color.replace('A', '0'));
    ctx.fillStyle = g; ctx.fillRect(x, y, wd, vertical ? len : wd);
  }
}

// ----------------------------------------------------------------------------- ground
function asphalt(size) {
  const c = canvas(size, size), ctx = c.getContext('2d'), rng = new RNG(11);
  ctx.fillStyle = '#4a4a4c'; ctx.fillRect(0, 0, size, size);
  // height: gentle wear undulation + exposed aggregate (light specks = stones standing proud, dark = pits) + raised repair
  // patches with a lip + sunken cracks; drawn with the albedo's own random values so the albedo is unchanged
  const hc = reliefNoise(heightCanvas(size), { scale: 6, amp: 14, oct: 3, seed: 13 }), hx = hc.getContext('2d');
  grime(ctx, size, size, { scale: 6, amount: 0.22, seed: 3 });
  speckle(ctx, size, size, size * size * 0.05, ['#5c5c5e', '#353537', '#6b6a66', '#2d2d2f', '#58544d'], rng, [0.6, 1.8], hx, ['rgba(255,255,255,0.2)', 'rgba(0,0,0,0.24)', 'rgba(255,255,255,0.25)', 'rgba(0,0,0,0.28)', 'rgba(255,255,255,0.16)']);
  // patch repairs
  for (let k = 0; k < 4; k++) { const pc = rng.pick(['rgba(30,30,32,0.45)', 'rgba(80,80,82,0.3)']); ctx.fillStyle = pc; const pw = rng.range(40, 160), ph = rng.range(30, 120); const px = rng.next() * size, py = rng.next() * size; ctx.fillRect(px, py, pw, ph);
    for (const [ox, oy] of [[0, 0], [-size, 0], [0, -size], [-size, -size]]) { hx.fillStyle = 'rgba(255,255,255,0.07)'; hx.fillRect(px + ox, py + oy, pw, ph); hx.strokeStyle = 'rgba(0,0,0,0.3)'; hx.lineWidth = 2; hx.strokeRect(px + ox, py + oy, pw, ph); } } // wrapped: seamless
  // cracks
  ctx.strokeStyle = 'rgba(20,20,20,0.55)'; ctx.lineWidth = 1.2; hx.strokeStyle = 'rgba(0,0,0,0.6)'; hx.lineWidth = 1.6; hx.lineJoin = 'round';
  for (let k = 0; k < 14; k++) {
    let x = rng.next() * size, y = rng.next() * size; ctx.beginPath(); ctx.moveTo(x, y); const pts = [[x, y]];
    for (let s = 0; s < 12; s++) { x += rng.range(-14, 14); y += rng.range(-14, 14); ctx.lineTo(x, y); pts.push([x, y]); }
    ctx.stroke(); hx.beginPath(); pts.forEach(([px, py], i) => (i ? hx.lineTo(px, py) : hx.moveTo(px, py))); hx.stroke();
  }
  blurHeight(hc, 1);
  // oil stains
  for (let k = 0; k < 6; k++) { const x = rng.next() * size, y = rng.next() * size, r = rng.range(8, 30); const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, 'rgba(10,10,12,0.35)'); g.addColorStop(1, 'rgba(10,10,12,0)'); ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2); }
  const map = toTex(c);
  // roughness (G) — puddle-prone smoother patches
  const r = canvas(size / 2, size / 2), rc = r.getContext('2d'); const img = rc.createImageData(size / 2, size / 2);
  for (let y = 0; y < size / 2; y++) for (let x = 0; x < size / 2; x++) {
    const n = fbm(x / (size / 2) * 5, y / (size / 2) * 5, 4, 77, 5); const i = (y * size / 2 + x) * 4;
    img.data[i] = 255; img.data[i + 1] = Math.floor(255 * (0.62 + 0.38 * n)); img.data[i + 2] = 0; img.data[i + 3] = 255;
  }
  rc.putImageData(img, 0, 0);
  return { map, rough: toTex(r, { srgb: false }), height: hc };
}
function pavers(size, base = ['#8d5a4a', '#7e4c3e', '#9a6a58', '#86817a', '#78736c'], seed = 5) {
  const c = canvas(size, size), ctx = c.getContext('2d'), rng = new RNG(seed);
  ctx.fillStyle = '#5a5550'; ctx.fillRect(0, 0, size, size);
  // height: sanded joints sit low, each paver is a slightly domed block (bevelled by the blur) at its own settled height
  const hc = heightCanvas(size, size, 40), hx = hc.getContext('2d');
  // interlocking "unipave" bricks in herringbone-ish rows
  const bw = size / 8, bh = size / 16;
  for (let row = 0; row < 16; row++) for (let col = -1; col < 9; col++) {
    const off = (row % 2) * bw * 0.5; const x = col * bw + off, y = row * bh;
    const tone = rng.pick(base); ctx.fillStyle = tone;
    const w = bw - 3, h = bh - 3, n = bh * 0.18;
    const path = (q) => { q.beginPath(); q.moveTo(x + 1.5, y + 1.5); q.lineTo(x + w * 0.33, y + 1.5); q.lineTo(x + w * 0.5, y + 1.5 + n); q.lineTo(x + w * 0.66, y + 1.5); q.lineTo(x + w + 1.5, y + 1.5);
      q.lineTo(x + w + 1.5, y + h + 1.5); q.lineTo(x + w * 0.66, y + h + 1.5); q.lineTo(x + w * 0.5, y + h + 1.5 + n); q.lineTo(x + w * 0.33, y + h + 1.5); q.lineTo(x + 1.5, y + h + 1.5); q.closePath(); };
    path(ctx); ctx.fill();
    const hv = Math.round(176 + (hash2(((col % 8) + 8) % 8, row, seed) - 0.5) * 34); hx.fillStyle = `rgb(${hv},${hv},${hv})`; path(hx); hx.fill(); // col -1 ≡ col 7 (wraps)
  }
  blurHeight(hc, 1); blurHeight(hc, 1); // rounded arrises
  reliefNoise(hc, { scale: 32, amp: 7, oct: 2, seed: seed + 9, grain: 9 }); // pressed-concrete surface
  grime(ctx, size, size, { scale: 5, amount: 0.3, seed: seed + 1 });
  speckle(ctx, size, size, size * 30, ['rgba(0,0,0,0.25)', 'rgba(255,255,255,0.08)'], rng, undefined, hx, ['rgba(0,0,0,0.12)', 'rgba(255,255,255,0.08)']);
  const t = toTex(c); t.userData.height = hc; return t;
}
function concrete(size, tone = '#9b968d', seed = 7, joints = true) {
  const c = canvas(size, size), ctx = c.getContext('2d'), rng = new RNG(seed);
  ctx.fillStyle = tone; ctx.fillRect(0, 0, size, size);
  // height: broad trowel / float undulation, fine sand-and-cement grain, air-void pits, sawn joints
  const hc = reliefNoise(heightCanvas(size), { scale: 4, amp: 10, oct: 3, seed: seed + 5 }), hx = hc.getContext('2d');
  reliefNoise(hc, { scale: 24, amp: 9, oct: 3, seed: seed + 6, grain: 12, grainSeed: seed });
  grime(ctx, size, size, { scale: 4, amount: 0.25, seed });
  grime(ctx, size, size, { scale: 16, amount: 0.1, seed: seed + 3 });
  speckle(ctx, size, size, size * 40, ['rgba(0,0,0,0.12)', 'rgba(255,255,255,0.08)'], rng, undefined, hx, ['rgba(0,0,0,0.3)', 'rgba(255,255,255,0.12)']);
  if (joints) { ctx.strokeStyle = 'rgba(40,38,35,0.5)'; ctx.lineWidth = 2; ctx.strokeRect(0, 0, size, size); ctx.beginPath(); ctx.moveTo(size / 2, 0); ctx.lineTo(size / 2, size); ctx.moveTo(0, size / 2); ctx.lineTo(size, size / 2); ctx.stroke();
    hx.strokeStyle = 'rgba(0,0,0,0.7)'; hx.lineWidth = 3; hx.strokeRect(0, 0, size, size); hx.beginPath(); hx.moveTo(size / 2, 0); hx.lineTo(size / 2, size); hx.moveTo(0, size / 2); hx.lineTo(size, size / 2); hx.stroke(); }
  blurHeight(hc, 1);
  const t = toTex(c); t.userData.height = hc; return t;
}
function grass(size, seed = 21, worn = 0.25) {
  const c = canvas(size, size), ctx = c.getContext('2d'), rng = new RNG(seed);
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const n = fbm(x / size * 6, y / size * 6, 5, seed, 6), m = fbm(x / size * 3, y / size * 3, 3, seed + 9, 3);
    const soil = Math.max(0, (m - (1 - worn)) * 4);
    let r = 58 + n * 50, g = 92 + n * 60, b = 34 + n * 22;
    r = r * (1 - soil) + (132 + n * 30) * soil; g = g * (1 - soil) + (98 + n * 20) * soil; b = b * (1 - soil) + (66 + n * 14) * soil;
    const i = (y * size + x) * 4; img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  ctx.globalAlpha = 0.35;
  for (let k = 0; k < size * 14; k++) { ctx.strokeStyle = rng.pick(['#3e6b25', '#7aa04a', '#5a8a35', '#2f5520']); const x = rng.next() * size, y = rng.next() * size; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + rng.range(-1.5, 1.5), y - rng.range(2, 5)); ctx.stroke(); }
  ctx.globalAlpha = 1;
  return toTex(c);
}
function hedgeTex(size) { // clipped hedge: dense overlapping small leaves with depth shading and a few gaps
  const c = canvas(size, size), ctx = c.getContext('2d'), rng = new RNG(71);
  ctx.fillStyle = '#1d3514'; ctx.fillRect(0, 0, size, size);
  for (let k = 0; k < size * 9; k++) {
    const x = rng.next() * size, y = rng.next() * size, l = rng.range(3, 6.5), a = rng.next() * Math.PI * 2, t = rng.next();
    const g = Math.round(70 + t * 70), r = Math.round(30 + t * 40), b = Math.round(18 + t * 22);
    ctx.fillStyle = `rgb(${r},${g},${b})`; ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.beginPath(); ctx.ellipse(0, 0, l, l * 0.45, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,220,0.12)'; ctx.fillRect(-l * 0.8, -0.4, l * 1.6, 0.8); ctx.restore();
  }
  return toTex(c);
}
function laterite(size) { // red Sri Lankan soil mixed with grass
  const c = canvas(size, size), ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const n = fbm(x / size * 7, y / size * 7, 5, 31, 7), m = fbm(x / size * 3, y / size * 3, 3, 32, 3);
    const gr = Math.min(1, Math.max(0, (m - 0.42) * 3));
    const i = (y * size + x) * 4;
    img.data[i] = (150 + n * 50) * (1 - gr) + (70 + n * 40) * gr;
    img.data[i + 1] = (92 + n * 35) * (1 - gr) + (100 + n * 50) * gr;
    img.data[i + 2] = (64 + n * 20) * (1 - gr) + (40 + n * 20) * gr; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return toTex(c);
}
function sand(size) {
  const c = canvas(size, size), ctx = c.getContext('2d');
  ctx.fillStyle = '#cdb68e'; ctx.fillRect(0, 0, size, size);
  // height: trodden, wind-scalloped sand — soft hummocks, fine ripples and loose grains
  const hc = reliefNoise(heightCanvas(size), { scale: 6, amp: 26, oct: 4, seed: 43 }), hx = hc.getContext('2d');
  { const g = hx.getImageData(0, 0, size, size), d = g.data; for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) { const i = (y * size + x) * 4; const wob = fbm((x / size) * 4, (y / size) * 4, 2, 44, 4) * 6;
    const rip = Math.sin(((y / size) * 22 + wob) * Math.PI * 2) * 11 * fbm((x / size) * 3, (y / size) * 3, 2, 45, 3); d[i] = d[i + 1] = d[i + 2] = Math.max(0, Math.min(255, d[i] + rip)); } hx.putImageData(g, 0, 0); } // 22 ripples / tile: integer → seamless
  grime(ctx, size, size, { scale: 8, amount: 0.15, seed: 41 });
  speckle(ctx, size, size, size * 60, ['rgba(90,70,40,0.25)', 'rgba(255,250,235,0.2)'], new RNG(41), undefined, hx, ['rgba(255,255,255,0.18)', 'rgba(255,255,255,0.12)']);
  blurHeight(hc, 1);
  const t = toTex(c); t.userData.height = hc; return t;
}
// railway ballast: packed angular crushed granite (≈30–60 mm stones at 1 tile per metre)
function ballast(size) {
  const c = canvas(size, size), ctx = c.getContext('2d'), rng = new RNG(77);
  ctx.fillStyle = '#4a4744'; ctx.fillRect(0, 0, size, size);
  for (let k = 0; k < 2600; k++) {
    const x = rng.next() * size, y = rng.next() * size, r = rng.range(6, 15); const n = rng.int(5, 7); const t = rng.int(88, 150), warm = rng.int(-6, 10);
    for (const [ox, oy] of [[0, 0], [size, 0], [-size, 0], [0, size], [0, -size]]) {
      if (x + ox < -r || x + ox > size + r || y + oy < -r || y + oy > size + r) continue;
      ctx.beginPath(); for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + rng.next() * 0.6, rr = r * rng.range(0.6, 1.1); const px = x + ox + Math.cos(a) * rr, py = y + oy + Math.sin(a) * rr; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); } ctx.closePath();
      const g = ctx.createLinearGradient(x + ox - r, y + oy - r, x + ox + r, y + oy + r); g.addColorStop(0, `rgb(${t + 28 + warm},${t + 26},${t + 22 - warm})`); g.addColorStop(1, `rgb(${t - 30 + warm},${t - 31},${t - 33 - warm})`);
      ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = 'rgba(20,18,16,0.55)'; ctx.lineWidth = 1.2; ctx.stroke();
    }
  }
  return toTex(c);
}
function rocks(size) {
  const c = canvas(size, size), ctx = c.getContext('2d'), rng = new RNG(51);
  ctx.fillStyle = '#4c4a46'; ctx.fillRect(0, 0, size, size);
  for (let k = 0; k < 90; k++) { const x = rng.next() * size, y = rng.next() * size, r = rng.range(10, 40); const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 1, x, y, r); const t = rng.int(70, 120); g.addColorStop(0, `rgb(${t + 30},${t + 26},${t + 20})`); g.addColorStop(1, `rgb(${t - 40},${t - 42},${t - 45})`); ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, y, r, r * rng.range(0.6, 1), rng.next() * 3, 0, 7); ctx.fill(); }
  return toTex(c);
}

// ----------------------------------------------------------------------------- facades
// Each facade tile = 4 window bays x 2 floors. Walls are painted near-white so per-building
// vertex colours can tint the paint while windows/frames keep their own colours.
const LIT = ['#ffe3a8', '#ffd58a', '#fff4dc', '#e8f2ff', '#d9ecff', '#ffcf7a'];
function facadeBase(W, H) {
  const albedo = canvas(W, H), emis = canvas(W, H), rm = canvas(W, H);
  const a = albedo.getContext('2d'), e = emis.getContext('2d'), r = rm.getContext('2d');
  e.fillStyle = '#000'; e.fillRect(0, 0, W, H);
  r.fillStyle = 'rgb(255,235,0)'; r.fillRect(0, 0, W, H); // rough wall, not metal
  _win = []; _win.W = W; _win.H = H;
  return { albedo, emis, rm, a, e, r, windows: _win };
}
// Every painted window is also recorded (tile-normalised, v up) so BuildingGen can dress the same openings with real 3D
// joinery (reveals, sills, frames, glazing bars, glass panes, security grills) that line up exactly with the texture.
let _win = [];
function recWin(x, y, w, h, kind, o = {}) { _win.push({ u0: x / _win.W, u1: (x + w) / _win.W, v0: 1 - (y + h) / _win.H, v1: 1 - y / _win.H, kind, ...o }); }
function windowLights(e, rng, x, y, w, h, p = 0.45) {
  if (rng.next() > p) return;
  const col = rng.pick(LIT); const g = e.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, col); g.addColorStop(1, shade(col, 0.6)); e.fillStyle = g; e.fillRect(x, y, w, h);
  if (rng.chance(0.5)) { e.fillStyle = 'rgba(0,0,0,0.55)'; e.fillRect(x + w * rng.range(0.1, 0.6), y + h * 0.2, w * 0.25, h * 0.8); } // silhouette/curtain
}
function shade(hex, k) { const c = new THREE.Color(hex); c.multiplyScalar(k); return '#' + c.getHexString(); }
function glassGrad(ctx, x, y, w, h, top = '#3d5560', bot = '#16222a') { const g = ctx.createLinearGradient(x, y, x + w * 0.3, y + h); g.addColorStop(0, top); g.addColorStop(0.55, bot); g.addColorStop(1, shade(top, 0.8)); ctx.fillStyle = g; ctx.fillRect(x, y, w, h); }

function facadeColonial(W, H, seed) {
  const f = facadeBase(W, H), rng = new RNG(seed); const { a, e, r } = f;
  a.fillStyle = '#f1e9d8'; a.fillRect(0, 0, W, H);
  // height (half resolution): lime-plaster wall with the painted mouldings raised — string courses, pilasters, arch
  // surrounds and sills — so they catch the light and cast their own shading; panes are flattened via the rm mask
  const hs = 0.5, hc = heightCanvas(W * hs, H * hs, 110), hx = hc.getContext('2d'); hx.scale(hs, hs);
  const bw = W / 4, fh = H / 2;
  for (let fl = 0; fl < 2; fl++) {
    const y0 = fl * fh;
    a.fillStyle = '#e4d9c2'; a.fillRect(0, y0 + fh - 10, W, 10); // string course
    a.fillStyle = 'rgba(0,0,0,0.12)'; a.fillRect(0, y0 + fh - 2, W, 2);
    hx.fillStyle = 'rgb(190,190,190)'; hx.fillRect(0, y0 + fh - 10, W, 10); hx.fillStyle = 'rgb(160,160,160)'; hx.fillRect(0, y0 + fh - 3, W, 3);
    for (let b = 0; b < 4; b++) {
      const x0 = b * bw; a.fillStyle = '#e9dfca'; a.fillRect(x0, y0, 10, fh); a.fillStyle = 'rgba(0,0,0,0.08)'; a.fillRect(x0 + 10, y0, 2, fh); // pilaster
      hx.fillStyle = 'rgb(176,176,176)'; hx.fillRect(x0, y0, 10, fh - 10);
      const ww = bw * 0.46, wh = fh * 0.62, wx = x0 + (bw - ww) / 2, wy = y0 + fh * 0.18;
      // arch surround
      a.fillStyle = '#d9cdb3'; a.beginPath(); a.moveTo(wx - 6, wy + wh + 4); a.lineTo(wx - 6, wy + ww * 0.5); a.arc(wx + ww / 2, wy + ww * 0.5, ww / 2 + 6, Math.PI, 0); a.lineTo(wx + ww + 6, wy + wh + 4); a.fill();
      hx.fillStyle = 'rgb(168,168,168)'; hx.beginPath(); hx.moveTo(wx - 6, wy + wh + 4); hx.lineTo(wx - 6, wy + ww * 0.5); hx.arc(wx + ww / 2, wy + ww * 0.5, ww / 2 + 6, Math.PI, 0); hx.lineTo(wx + ww + 6, wy + wh + 4); hx.fill();
      hx.fillStyle = 'rgb(96,96,96)'; hx.beginPath(); hx.moveTo(wx, wy + wh); hx.lineTo(wx, wy + ww * 0.5); hx.arc(wx + ww / 2, wy + ww * 0.5, ww / 2, Math.PI, 0); hx.lineTo(wx + ww, wy + wh); hx.fill(); // reveal (recessed opening)
      hx.fillStyle = 'rgb(200,200,200)'; hx.fillRect(wx - 8, wy + wh, ww + 16, 6); // sill
      a.save(); a.beginPath(); a.moveTo(wx, wy + wh); a.lineTo(wx, wy + ww * 0.5); a.arc(wx + ww / 2, wy + ww * 0.5, ww / 2, Math.PI, 0); a.lineTo(wx + ww, wy + wh); a.closePath(); a.clip();
      const shut = rng.next();
      recWin(wx, wy, ww, wh, shut < 0.45 ? 'shutter' : 'sash', { arch: (wy + ww * 0.5 - wy) / wh, frame: '#efe6d2', bar: 0.45 });
      if (shut < 0.45) { // green louvred shutters
        a.fillStyle = rng.pick(['#2f5d45', '#3a6b52', '#5b4632', '#29495e']); a.fillRect(wx, wy, ww, wh); _win[_win.length - 1].shut = a.fillStyle;
        a.fillStyle = 'rgba(0,0,0,0.28)'; for (let ly = wy + 4; ly < wy + wh; ly += 5) a.fillRect(wx, ly, ww, 1.5);
        a.fillStyle = 'rgba(0,0,0,0.5)'; a.fillRect(wx + ww / 2 - 1, wy, 2, wh);
        r.fillStyle = 'rgb(255,200,0)';
      } else {
        glassGrad(a, wx, wy, ww, wh, '#41545c', '#151d22');
        a.strokeStyle = '#efe6d2'; a.lineWidth = 3; a.strokeRect(wx, wy, ww, wh); a.beginPath(); a.moveTo(wx + ww / 2, wy); a.lineTo(wx + ww / 2, wy + wh); a.moveTo(wx, wy + wh * 0.45); a.lineTo(wx + ww, wy + wh * 0.45); a.stroke();
        r.fillStyle = 'rgb(255,40,0)'; r.fillRect(wx, wy, ww, wh);
        windowLights(e, rng, wx, wy, ww, wh, 0.5);
      }
      a.restore();
      a.fillStyle = '#d4c7ab'; a.fillRect(wx - 8, wy + wh, ww + 16, 6); // sill
    }
  }
  grime(a, W, H, { scale: 6, amount: 0.18, seed: seed + 2, bias: -0.05 });
  stains(a, W, H, rng, 18, 'rgba(70,60,40,A)');
  hx.setTransform(1, 0, 0, 1, 0, 0); blurHeight(hc, 1); plasterRelief(hc, seed);
  f.height = hc; f.relief = 2.2; return f;
}
// hand-floated lime / cement render: soft trowel waves, sand grain, the odd hairline crack (height canvas, in place)
function plasterRelief(hc, seed) {
  reliefNoise(hc, { scale: 10, amp: 6, oct: 3, seed: seed + 31 }); reliefNoise(hc, { scale: 48, amp: 5, oct: 2, seed: seed + 32, grain: 7, grainSeed: seed + 33 });
  const hx = hc.getContext('2d'), w = hc.width, h = hc.height, rng = new RNG(seed + 34); hx.strokeStyle = 'rgba(0,0,0,0.16)'; hx.lineWidth = 1;
  for (let k = 0; k < 4; k++) { let x = rng.next() * w, y = rng.next() * h; hx.beginPath(); hx.moveTo(x, y); for (let s = 0; s < 6; s++) { x += rng.range(-9, 9); y += rng.range(2, 11); hx.lineTo(x, y); } hx.stroke(); }
  return hc;
}
function facadeBrick(W, H, seed) {
  const f = facadeBase(W, H), rng = new RNG(seed); const { a, e, r } = f;
  a.fillStyle = '#9a4535'; a.fillRect(0, 0, W, H);
  // height: recessed mortar joints, every brick its own slightly uneven face; the plastered window surrounds and floor bands
  // stand proud of the brickwork (smooth); glass is flattened later through the facade's rm mask
  const hc = heightCanvas(W, H, 52), hx = hc.getContext('2d');
  for (let y = 0; y < H; y += 6) for (let x = (y / 6) % 2 ? -6 : 0; x < W; x += 13) { a.fillStyle = rng.pick(['#a24a38', '#8f3e30', '#b0573f', '#943f33']); a.fillRect(x, y, 12, 5);
    const hv = Math.round(168 + (hash2(x, y, seed) - 0.5) * 30); hx.fillStyle = `rgb(${hv},${hv},${hv})`; hx.fillRect(x, y, 12, 5); }
  reliefNoise(hc, { scale: 96, amp: 6, oct: 2, seed: seed + 4, grain: 10 }); // fired-clay texture, chipped arrises
  const bw = W / 4, fh = H / 2;
  for (let fl = 0; fl < 2; fl++) for (let b = 0; b < 4; b++) {
    const x0 = b * bw, y0 = fl * fh; const ww = bw * 0.48, wh = fh * 0.6, wx = x0 + (bw - ww) / 2, wy = y0 + fh * 0.2;
    a.fillStyle = '#efe7d6'; a.fillRect(wx - 7, wy - 12, ww + 14, wh + 22); a.fillRect(x0, y0 + fh - 8, bw, 8);
    hx.fillStyle = 'rgb(214,214,214)'; hx.fillRect(wx - 7, wy - 12, ww + 14, wh + 22); hx.fillRect(x0, y0 + fh - 8, bw, 8);
    recWin(wx, wy, ww, wh, 'sash', { frame: '#f4efe4', bar: 0 }); glassGrad(a, wx, wy, ww, wh); a.strokeStyle = '#f4efe4'; a.lineWidth = 3; a.strokeRect(wx, wy, ww, wh);
    a.beginPath(); a.moveTo(wx + ww / 2, wy); a.lineTo(wx + ww / 2, wy + wh); a.stroke();
    r.fillStyle = 'rgb(255,50,0)'; r.fillRect(wx, wy, ww, wh); windowLights(e, rng, wx, wy, ww, wh, 0.55);
  }
  grime(a, W, H, { scale: 5, amount: 0.15, seed: seed + 3 });
  f.height = hc; f.relief = 2.2; return f;
}
function facadeGlass(W, H, seed, tint = ['#5f8a9a', '#24414e']) {
  const f = facadeBase(W, H), rng = new RNG(seed); const { a, e, r } = f;
  const g = a.createLinearGradient(0, 0, W, H); g.addColorStop(0, tint[0]); g.addColorStop(0.5, tint[1]); g.addColorStop(1, tint[0]); a.fillStyle = g; a.fillRect(0, 0, W, H);
  grime(a, W, H, { scale: 3, amount: 0.15, seed: seed + 1 });
  r.fillStyle = 'rgb(255,25,200)'; r.fillRect(0, 0, W, H);
  const cols = 8, rows = 4;
  for (let rr = 0; rr < rows; rr++) for (let cc = 0; cc < cols; cc++) {
    const x = cc * W / cols, y = rr * H / rows;
    a.fillStyle = `rgba(255,255,255,${rng.range(0, 0.06)})`; a.fillRect(x, y, W / cols, H / rows);
    windowLights(e, rng, x + 2, y + 3, W / cols - 4, H / rows - 8, 0.55);
  }
  a.fillStyle = '#c9d3d6'; r.fillStyle = 'rgb(255,120,255)';
  for (let cc = 0; cc <= cols; cc++) { a.fillRect(cc * W / cols - 1.5, 0, 3, H); r.fillRect(cc * W / cols - 1.5, 0, 3, H); }
  for (let rr = 0; rr <= rows; rr++) { a.fillStyle = '#aeb9bd'; a.fillRect(0, rr * H / rows - 4, W, 7); r.fillRect(0, rr * H / rows - 4, W, 7); }
  e.fillStyle = 'rgba(0,0,0,1)'; for (let rr = 0; rr <= rows; rr++) e.fillRect(0, rr * H / rows - 4, W, 7);
  return f;
}
// ---- façade variants (15th pass): every common style now has 2–3 distinct looks so a street never repeats one block
// 1980s Colombo office: raw beige concrete grid, deep-set punched windows, vertical sun fins between bays
function facadeOffice2(W, H, seed) {
  const f = facadeBase(W, H), rng = new RNG(seed); const { a, e, r } = f;
  a.fillStyle = '#d9cfbd'; a.fillRect(0, 0, W, H);
  const bw = W / 4, fh = H / 2;
  for (let fl = 0; fl < 2; fl++) { const y0 = fl * fh;
    a.fillStyle = '#cbbfaa'; a.fillRect(0, y0 + fh * 0.04, W, fh * 0.14); a.fillStyle = 'rgba(0,0,0,0.22)'; a.fillRect(0, y0 + fh * 0.18, W, 5); // spandrel band + shadow
    for (let b = 0; b < 4; b++) { const x0 = b * bw; const ww = bw * 0.72, wh = fh * 0.6, wx = x0 + (bw - ww) / 2, wy = y0 + fh * 0.24;
      a.fillStyle = 'rgba(0,0,0,0.32)'; a.fillRect(wx - 4, wy - 4, ww + 8, wh + 8); // deep reveal
      glassGrad(a, wx, wy, ww, wh, '#56666c', '#1a2226'); r.fillStyle = 'rgb(255,50,0)'; r.fillRect(wx, wy, ww, wh);
      recWin(wx, wy, ww, wh, 'sash', { frame: '#b8b2a6', bar: 0.5 }); windowLights(e, rng, wx, wy, ww, wh, 0.5);
      a.fillStyle = '#e4dccb'; a.fillRect(x0 - 6, y0, 12, fh); a.fillStyle = 'rgba(0,0,0,0.28)'; a.fillRect(x0 + 6, y0, 5, fh); // sun fin + its shadow
      if (rng.chance(0.3)) { const ax = wx + rng.range(0, ww - 30); a.fillStyle = '#ecece8'; a.fillRect(ax, wy + wh + 6, 30, 15); a.fillStyle = '#9a9a96'; for (let k = 0; k < 5; k++) a.fillRect(ax + 3, wy + wh + 8 + k * 2.4, 24, 1); } } }
  grime(a, W, H, { scale: 5, amount: 0.34, seed: seed + 2, bias: 0.04 }); stains(a, W, H, rng, 46, 'rgba(60,55,45,A)');
  grime(a, W, H, { scale: 9, amount: 0.22, seed: seed + 6, color: [70, 80, 60], bias: -0.1 }); // monsoon streaks
  return f;
}
// 2000s office: grey aluminium composite cladding, continuous ribbon of green-tinted glazing, thin mullions
function facadeOffice3(W, H, seed) {
  const f = facadeBase(W, H), rng = new RNG(seed); const { a, e, r } = f;
  a.fillStyle = '#9ea3a6'; a.fillRect(0, 0, W, H); r.fillStyle = 'rgb(255,120,160)'; r.fillRect(0, 0, W, H); // satin metal panels
  const fh = H / 2;
  for (let fl = 0; fl < 2; fl++) { const y0 = fl * fh;
    for (let x = 0; x < W; x += W / 16) { a.fillStyle = 'rgba(0,0,0,0.12)'; a.fillRect(x, y0, 2, fh * 0.32); } // panel joints
    const gy = y0 + fh * 0.34, gh = fh * 0.58; glassGrad(a, 0, gy, W, gh, '#4f6e68', '#14211f'); r.fillStyle = 'rgb(255,35,0)'; r.fillRect(0, gy, W, gh);
    for (let b = 0; b < 8; b++) windowLights(e, rng, b * W / 8 + 3, gy, W / 8 - 6, gh, 0.5);
    for (let b = 0; b <= 8; b++) { a.fillStyle = '#5c6266'; a.fillRect(b * W / 8 - 2, gy, 4, gh); }
    a.fillStyle = '#c6cacc'; a.fillRect(0, gy - 3, W, 3); a.fillStyle = 'rgba(0,0,0,0.3)'; a.fillRect(0, gy + gh, W, 3); }
  grime(a, W, H, { scale: 7, amount: 0.14, seed: seed + 2 });
  return f;
}
// newer apartment block: full-width balconies with glass/steel railings, sliding doors, louvred service windows, AC condensers
function facadeApartment2(W, H, seed) {
  const f = facadeBase(W, H), rng = new RNG(seed); const { a, e, r } = f;
  a.fillStyle = '#f1eee6'; a.fillRect(0, 0, W, H);
  const bw = W / 4, fh = H / 2;
  for (let fl = 0; fl < 2; fl++) { const y0 = fl * fh;
    for (let b = 0; b < 4; b++) { const x0 = b * bw;
      if (b !== 3) { const dx = x0 + bw * 0.1, dw = bw * 0.8, dy = y0 + fh * 0.12, dh = fh * 0.78;
        glassGrad(a, dx, dy, dw, dh, '#46555a', '#121a1d'); r.fillStyle = 'rgb(255,50,0)'; r.fillRect(dx, dy, dw, dh); windowLights(e, rng, dx, dy, dw, dh, 0.5);
        recWin(dx, dy, dw, dh, 'door', { frame: '#cfcfcc', bar: -1 });
        a.fillStyle = '#5a5a5a'; a.fillRect(dx + dw / 2 - 1.5, dy, 3, dh); // sliding-door meeting stile
      } else { const wx = x0 + bw * 0.28, ww = bw * 0.44, wy = y0 + fh * 0.3, wh = fh * 0.34; a.fillStyle = '#d9d5cc'; a.fillRect(wx, wy, ww, wh);
        a.fillStyle = 'rgba(0,0,0,0.35)'; for (let y = wy + 3; y < wy + wh; y += 5) a.fillRect(wx + 2, y, ww - 4, 2); } // louvred bathroom window
    }
    a.fillStyle = 'rgba(210,225,230,0.35)'; a.fillRect(0, y0 + fh * 0.62, bw * 3, fh * 0.3); // glass balustrade
    a.fillStyle = '#8c8f91'; a.fillRect(0, y0 + fh * 0.61, bw * 3, 3); a.fillRect(0, y0 + fh * 0.9, bw * 3, 4);
    for (let x = 6; x < bw * 3; x += 46) a.fillRect(x, y0 + fh * 0.61, 2.5, fh * 0.3);
    a.fillStyle = '#e8e4da'; a.fillRect(0, y0 + fh * 0.92, W, fh * 0.08); a.fillStyle = 'rgba(0,0,0,0.25)'; a.fillRect(0, y0 + fh * 0.92 - 3, W, 3); // slab edge
    if (rng.chance(0.7)) { const ax = rng.range(8, bw * 3 - 40); a.fillStyle = '#efefea'; a.fillRect(ax, y0 + fh * 0.66, 34, 20); a.fillStyle = '#7d7d79'; a.beginPath(); a.arc(ax + 13, y0 + fh * 0.66 + 10, 7, 0, 7); a.fill(); }
    if (rng.chance(0.5)) for (let k = 0; k < 5; k++) { a.fillStyle = rng.pick(['#c33', '#36c', '#ec3', '#fff', '#3a3', '#c6c', '#222']); a.fillRect(bw * rng.range(0.2, 2.6), y0 + fh * 0.5, 9, rng.range(10, 20)); } }
  grime(a, W, H, { scale: 6, amount: 0.2, seed: seed + 2 }); stains(a, W, H, rng, 22, 'rgba(70,70,60,A)');
  return f;
}
// old Pettah / Slave Island shophouse upper floors: arched windows, louvred timber shutters, moulded cornice, flaking lime-wash
function facadeShop3(W, H, seed) {
  const f = facadeBase(W, H), rng = new RNG(seed); const { a, e, r } = f;
  a.fillStyle = '#ece4d2'; a.fillRect(0, 0, W, H);
  const bw = W / 4, fh = H / 2;
  for (let fl = 0; fl < 2; fl++) { const y0 = fl * fh;
    a.fillStyle = '#ddd2bc'; a.fillRect(0, y0 + fh * 0.02, W, fh * 0.07); a.fillStyle = 'rgba(0,0,0,0.25)'; a.fillRect(0, y0 + fh * 0.09, W, 4); // cornice
    for (let b = 0; b < 4; b++) { const x0 = b * bw; const ww = bw * 0.48, wh = fh * 0.56, wx = x0 + (bw - ww) / 2, wy = y0 + fh * 0.28; const rad = ww / 2;
      a.fillStyle = 'rgba(0,0,0,0.14)'; a.beginPath(); a.moveTo(wx - 6, wy + wh + 4); a.lineTo(wx - 6, wy); a.arc(wx + rad, wy, rad + 6, Math.PI, 0); a.lineTo(wx + ww + 6, wy + wh + 4); a.fill(); // arch surround
      const shut = rng.next() < 0.45; const sc = rng.pick(['#3f6b52', '#2f5a6a', '#6b4a2e', '#5d6e3a', '#7a3b2e']);
      a.save(); a.beginPath(); a.moveTo(wx, wy + wh); a.lineTo(wx, wy); a.arc(wx + rad, wy, rad, Math.PI, 0); a.lineTo(wx + ww, wy + wh); a.closePath(); a.clip();
      if (shut) { a.fillStyle = sc; a.fillRect(wx, wy - rad, ww, wh + rad); a.fillStyle = 'rgba(0,0,0,0.3)'; for (let y = wy - rad + 3; y < wy + wh; y += 4) a.fillRect(wx, y, ww, 1.4); a.fillRect(wx + ww / 2 - 1, wy - rad, 2, wh + rad); }
      else { glassGrad(a, wx, wy - rad, ww, wh + rad, '#3b4447', '#101416'); r.fillStyle = 'rgb(255,60,0)'; r.fillRect(wx, wy, ww, wh); a.fillStyle = 'rgba(240,235,220,0.85)'; a.fillRect(wx + ww / 2 - 1.5, wy - rad, 3, wh + rad); a.fillRect(wx, wy + wh * 0.45, ww, 3); }
      a.restore();
      recWin(wx, wy, ww, wh, shut ? 'shutter' : 'sash', { frame: '#efe8d8', bar: 0.45 }); if (shut) _win[_win.length - 1].shut = sc; else windowLights(e, rng, wx, wy, ww, wh, 0.45);
      a.fillStyle = 'rgba(0,0,0,0.2)'; a.fillRect(wx - 8, wy + wh + 3, ww + 16, 5); // sill
      if (rng.chance(0.35)) { a.fillStyle = 'rgba(150,140,120,0.5)'; a.beginPath(); a.ellipse(x0 + rng.range(6, bw - 6), y0 + rng.range(fh * 0.2, fh * 0.9), rng.range(6, 16), rng.range(4, 10), 0, 0, 7); a.fill(); } // flaked plaster
    } }
  grime(a, W, H, { scale: 5, amount: 0.38, seed: seed + 2 }); stains(a, W, H, rng, 52, 'rgba(60,50,35,A)');
  grime(a, W, H, { scale: 10, amount: 0.3, seed: seed + 5, color: [80, 92, 62], bias: -0.1 });
  return f;
}
function facadeOffice(W, H, seed) {
  const f = facadeBase(W, H), rng = new RNG(seed); const { a, e, r } = f;
  a.fillStyle = '#d8d2c6'; a.fillRect(0, 0, W, H);
  const bw = W / 4, fh = H / 2;
  for (let fl = 0; fl < 2; fl++) {
    const y0 = fl * fh;
    glassGrad(a, 0, y0 + fh * 0.22, W, fh * 0.56, '#4a5d66', '#18242b');
    r.fillStyle = 'rgb(255,40,0)'; r.fillRect(0, y0 + fh * 0.22, W, fh * 0.56);
    for (let b = 0; b < 8; b++) windowLights(e, rng, b * W / 8 + 2, y0 + fh * 0.22, W / 8 - 4, fh * 0.56, 0.5);
    for (let b = 0; b <= 8; b++) { a.fillStyle = '#cfc9bc'; a.fillRect(b * W / 8 - 5, y0, 10, fh); a.fillStyle = 'rgba(0,0,0,0.18)'; a.fillRect(b * W / 8 + 5, y0, 3, fh); }
    a.fillStyle = 'rgba(0,0,0,0.25)'; a.fillRect(0, y0 + fh * 0.78, W, 4);
  }
  grime(a, W, H, { scale: 6, amount: 0.25, seed: seed + 2, bias: 0.05 });
  stains(a, W, H, rng, 24, 'rgba(50,50,45,A)');
  return f;
}
function facadeShophouse(W, H, seed) {
  const f = facadeBase(W, H), rng = new RNG(seed); const { a, e, r } = f;
  a.fillStyle = '#f2efe8'; a.fillRect(0, 0, W, H);
  const bw = W / 4, fh = H / 2;
  for (let fl = 0; fl < 2; fl++) for (let b = 0; b < 4; b++) {
    const x0 = b * bw, y0 = fl * fh; const type = rng.next();
    const ww = bw * rng.range(0.42, 0.6), wh = fh * rng.range(0.42, 0.55), wx = x0 + (bw - ww) / 2, wy = y0 + fh * 0.22;
    a.fillStyle = 'rgba(0,0,0,0.10)'; a.fillRect(wx - 5, wy - 5, ww + 10, wh + 10);
    recWin(wx, wy, ww, wh, type < 0.2 ? 'shutter' : 'grill', { frame: '#d8d8d2', bar: 0.5 });
    if (type < 0.2) { // closed wooden shutters
      a.fillStyle = rng.pick(['#6b4a2e', '#3f5f6e', '#4f6b3c', '#8a5a3a']); a.fillRect(wx, wy, ww, wh); _win[_win.length - 1].shut = a.fillStyle;
      a.fillStyle = 'rgba(0,0,0,0.3)'; a.fillRect(wx + ww / 2 - 1, wy, 2, wh);
    } else {
      glassGrad(a, wx, wy, ww, wh, '#3a4448', '#121719'); r.fillStyle = 'rgb(255,60,0)'; r.fillRect(wx, wy, ww, wh);
      if (rng.chance(0.4)) { a.fillStyle = rng.pick(['rgba(200,80,90,0.7)', 'rgba(230,200,120,0.7)', 'rgba(120,160,200,0.7)']); a.fillRect(wx, wy, ww * 0.3, wh); } // curtain
      windowLights(e, rng, wx, wy, ww, wh, 0.5);
      a.strokeStyle = '#2b2b2b'; a.lineWidth = 1.5; // security grill
      for (let gx = wx + 6; gx < wx + ww; gx += 7) { a.beginPath(); a.moveTo(gx, wy); a.lineTo(gx, wy + wh); a.stroke(); }
      a.beginPath(); a.moveTo(wx, wy + wh / 2); a.lineTo(wx + ww, wy + wh / 2); a.stroke();
    }
    a.fillStyle = 'rgba(0,0,0,0.18)'; a.fillRect(wx - 6, wy + wh + 2, ww + 12, 4);
    if (rng.chance(0.25)) { // AC unit
      const ax = x0 + rng.range(4, bw - 34); a.fillStyle = '#e6e6e2'; a.fillRect(ax, y0 + fh * 0.8, 30, 16); a.fillStyle = '#9a9a96'; for (let k = 0; k < 5; k++) a.fillRect(ax + 3, y0 + fh * 0.8 + 3 + k * 2.5, 24, 1); }
    if (rng.chance(0.2)) { a.fillStyle = 'rgba(0,0,0,0.25)'; a.fillRect(x0 + rng.range(0, bw), y0, 3, fh); } // drainpipe
  }
  grime(a, W, H, { scale: 6, amount: 0.3, seed: seed + 2, bias: 0.0 });
  stains(a, W, H, rng, 40, 'rgba(60,55,40,A)');
  grime(a, W, H, { scale: 10, amount: 0.25, seed: seed + 5, color: [90, 100, 70], bias: -0.12 }); // monsoon mould
  return f;
}
function facadeApartment(W, H, seed) {
  const f = facadeBase(W, H), rng = new RNG(seed); const { a, e, r } = f;
  a.fillStyle = '#efece4'; a.fillRect(0, 0, W, H);
  const bw = W / 4, fh = H / 2;
  for (let fl = 0; fl < 2; fl++) for (let b = 0; b < 4; b++) {
    const x0 = b * bw, y0 = fl * fh;
    if (b % 2 === 0) { // balcony with door
      recWin(x0 + bw * 0.2, y0 + fh * 0.15, bw * 0.6, fh * 0.75, 'door', { frame: '#e9e9e6', bar: -1 });
      glassGrad(a, x0 + bw * 0.2, y0 + fh * 0.15, bw * 0.6, fh * 0.75, '#3c474b', '#111618'); r.fillStyle = 'rgb(255,60,0)'; r.fillRect(x0 + bw * 0.2, y0 + fh * 0.15, bw * 0.6, fh * 0.75);
      windowLights(e, rng, x0 + bw * 0.2, y0 + fh * 0.15, bw * 0.6, fh * 0.75, 0.5);
      a.fillStyle = '#d7d2c7'; a.fillRect(x0 + 2, y0 + fh * 0.6, bw - 4, fh * 0.35);
      a.fillStyle = 'rgba(0,0,0,0.15)'; a.fillRect(x0 + 2, y0 + fh * 0.93, bw - 4, 4);
      if (rng.chance(0.5)) for (let k = 0; k < 4; k++) { a.fillStyle = rng.pick(['#c33', '#36c', '#ec3', '#fff', '#3a3', '#c6c']); a.fillRect(x0 + 6 + k * 14, y0 + fh * 0.48, 10, rng.range(12, 22)); } // laundry
    } else {
      const ww = bw * 0.5, wh = fh * 0.45, wx = x0 + bw * 0.25, wy = y0 + fh * 0.25;
      recWin(wx, wy, ww, wh, 'sash', { frame: '#f4f4f2', bar: -1 });
      glassGrad(a, wx, wy, ww, wh); r.fillStyle = 'rgb(255,60,0)'; r.fillRect(wx, wy, ww, wh); windowLights(e, rng, wx, wy, ww, wh, 0.5);
      a.strokeStyle = '#fafafa'; a.lineWidth = 2; a.strokeRect(wx, wy, ww, wh);
    }
  }
  grime(a, W, H, { scale: 6, amount: 0.25, seed: seed + 2 });
  stains(a, W, H, rng, 30, 'rgba(70,70,60,A)');
  return f;
}
function facadeVilla(W, H, seed) {
  const f = facadeBase(W, H), rng = new RNG(seed); const { a, e, r } = f;
  a.fillStyle = '#f6f3ec'; a.fillRect(0, 0, W, H);
  const bw = W / 4, fh = H / 2;
  for (let fl = 0; fl < 2; fl++) for (let b = 0; b < 4; b++) {
    const x0 = b * bw, y0 = fl * fh; const ww = bw * 0.55, wh = fh * 0.55, wx = x0 + (bw - ww) / 2, wy = y0 + fh * 0.2;
    recWin(wx, wy, ww, wh, 'sash', { frame: '#5a3a22', bar: 1 / 3 }); a.fillStyle = '#5a3a22'; a.fillRect(wx - 4, wy - 4, ww + 8, wh + 8);
    glassGrad(a, wx, wy, ww, wh, '#4a5458', '#1a1f22'); r.fillStyle = 'rgb(255,50,0)'; r.fillRect(wx, wy, ww, wh);
    windowLights(e, rng, wx, wy, ww, wh, 0.4);
    a.strokeStyle = '#5a3a22'; a.lineWidth = 3; a.beginPath(); a.moveTo(wx + ww / 2, wy); a.lineTo(wx + ww / 2, wy + wh); a.moveTo(wx, wy + wh / 3); a.lineTo(wx + ww, wy + wh / 3); a.stroke();
  }
  grime(a, W, H, { scale: 6, amount: 0.12, seed: seed + 2 });
  grime(a, W, H, { scale: 9, amount: 0.2, seed: seed + 4, color: [100, 110, 80], bias: -0.18 });
  return f;
}
function facadeHotel(W, H, seed) {
  const f = facadeBase(W, H), rng = new RNG(seed); const { a, e, r } = f;
  a.fillStyle = '#f4f1ea'; a.fillRect(0, 0, W, H);
  const fh = H / 2;
  for (let fl = 0; fl < 2; fl++) {
    const y0 = fl * fh;
    glassGrad(a, 0, y0 + fh * 0.1, W, fh * 0.65, '#55707a', '#1b2a31'); r.fillStyle = 'rgb(255,30,60)'; r.fillRect(0, y0 + fh * 0.1, W, fh * 0.65);
    for (let b = 0; b < 8; b++) windowLights(e, rng, b * W / 8 + 3, y0 + fh * 0.1, W / 8 - 6, fh * 0.65, 0.55);
    a.fillStyle = '#ebe7dd'; a.fillRect(0, y0 + fh * 0.72, W, fh * 0.28);
    a.fillStyle = 'rgba(120,140,150,0.6)'; a.fillRect(0, y0 + fh * 0.72, W, 3);
    for (let b = 0; b <= 4; b++) { a.fillStyle = '#e0dbcf'; a.fillRect(b * W / 4 - 4, y0, 8, fh); }
  }
  grime(a, W, H, { scale: 5, amount: 0.1, seed: seed + 2 });
  return f;
}
function facadeWarehouse(W, H, seed) {
  const f = facadeBase(W, H), rng = new RNG(seed); const { a, r } = f;
  a.fillStyle = '#d8d8d4'; a.fillRect(0, 0, W, H);
  for (let x = 0; x < W; x += 8) { const g = a.createLinearGradient(x, 0, x + 8, 0); g.addColorStop(0, '#f0f0ec'); g.addColorStop(0.5, '#b8b8b2'); g.addColorStop(1, '#f0f0ec'); a.fillStyle = g; a.fillRect(x, 0, 8, H); }
  r.fillStyle = 'rgb(255,120,160)'; r.fillRect(0, 0, W, H);
  grime(a, W, H, { scale: 6, amount: 0.18, seed, color: [128, 92, 66], bias: -0.1 }); // restrained rust: maintained port sheds, not derelict
  stains(a, W, H, rng, 30, 'rgba(96,70,50,A)'); // same draw count (same RNG use), browner-grey run-off instead of orange
  return f;
}

// ----------------------------------------------------------------------------- shopfront atlas
// 8 rows x 4 variants. Each cell = one ground-floor shop (≈5 m wide, 4.2 m tall).
export const SHOP_ROWS = { textile: 0, shutter: 1, electronics: 2, produce: 3, arcade: 4, lobby: 5, gate: 6, cafe: 7 };
function shopAtlas(cw = 256) {
  const W = cw * 4, H = cw * 8;
  const A = canvas(W, H), E = canvas(W, H), a = A.getContext('2d'), e = E.getContext('2d'); const rng = new RNG(99);
  e.fillStyle = '#000'; e.fillRect(0, 0, W, H);
  const cellH = cw;
  for (let row = 0; row < 8; row++) for (let col = 0; col < 4; col++) {
    const x = col * cw, y = row * cellH; a.save(); a.beginPath(); a.rect(x, y, cw, cellH); a.clip();
    a.fillStyle = '#d0cabd'; a.fillRect(x, y, cw, cellH); // settled plaster surround (was near-white #e8e4da: the ground floor read brighter than the weathered walls above)
    const inner = (top = 0.12) => { const ix = x + cw * 0.06, iy = y + cellH * top, iw = cw * 0.88, ih = cellH * (0.98 - top); return [ix, iy, iw, ih]; };
    const darkInterior = (ix, iy, iw, ih, lit = '#fff1cf') => {
      const g = a.createLinearGradient(0, iy, 0, iy + ih); g.addColorStop(0, '#2a2622'); g.addColorStop(1, '#4a4038'); a.fillStyle = g; a.fillRect(ix, iy, iw, ih);
      const ge = e.createLinearGradient(0, iy, 0, iy + ih); ge.addColorStop(0, lit); ge.addColorStop(1, shade(lit, 0.35)); e.fillStyle = ge; e.fillRect(ix, iy, iw, ih);
    };
    if (row === 0) { // textile shop with fabric bolts and hanging garments
      const [ix, iy, iw, ih] = inner(); darkInterior(ix, iy, iw, ih);
      for (let k = 0; k < 9; k++) for (let s = 0; s < 5; s++) { a.fillStyle = `hsl(${rng.int(0, 360)},${rng.int(40, 80)}%,${rng.int(30, 60)}%)`; a.fillRect(ix + 6 + k * (iw - 12) / 9, iy + ih * 0.25 + s * ih * 0.12, (iw - 12) / 9 - 3, ih * 0.1); e.fillStyle = 'rgba(0,0,0,0.5)'; e.fillRect(ix + 6 + k * (iw - 12) / 9, iy + ih * 0.25 + s * ih * 0.12, (iw - 12) / 9 - 3, ih * 0.1); }
      for (let k = 0; k < 6; k++) { a.fillStyle = `hsl(${rng.int(0, 360)},70%,50%)`; a.beginPath(); const hx = ix + 10 + k * iw / 6; a.moveTo(hx, iy + 4); a.lineTo(hx + 18, iy + 4); a.lineTo(hx + 22, iy + ih * 0.22); a.lineTo(hx - 4, iy + ih * 0.22); a.fill(); }
    } else if (row === 1) { // roller shutter
      const [ix, iy, iw, ih] = inner(0.08); const col0 = rng.pick(['#7d8284', '#62796c', '#6c7a88', '#877e6a']); // dulled galvanised / painted steel
      for (let sy = iy; sy < iy + ih; sy += 5) { const g = a.createLinearGradient(0, sy, 0, sy + 5); g.addColorStop(0, shade(col0, 1.06)); g.addColorStop(1, shade(col0, 0.74)); a.fillStyle = g; a.fillRect(ix, sy, iw, 5); }
      a.fillStyle = 'rgba(60,40,20,0.35)'; for (let k = 0; k < 4; k++) a.fillRect(ix + rng.range(0, iw), iy + ih * rng.range(0.4, 1), rng.range(10, 30), 3);
      a.fillStyle = '#333'; a.fillRect(ix + iw / 2 - 8, iy + ih - 10, 16, 6);
      if (rng.chance(0.6)) { a.fillStyle = rng.pick(['#d9d2b2', '#dcdad4', '#d8b23a']); a.fillRect(ix + rng.range(10, iw - 60), iy + rng.range(20, ih - 50), 44, 30); a.fillStyle = '#222'; a.font = 'bold 9px "Barlow Condensed", sans-serif'; a.fillText('TO LET', ix + 30, iy + 60); }
    } else if (row === 2) { // electronics / phones — bright glass
      const [ix, iy, iw, ih] = inner(); const g = a.createLinearGradient(0, iy, 0, iy + ih); g.addColorStop(0, '#bcc6cc'); g.addColorStop(1, '#7c8d97'); a.fillStyle = g; a.fillRect(ix, iy, iw, ih);
      e.fillStyle = '#e6f2ff'; e.fillRect(ix, iy, iw, ih);
      for (let k = 0; k < 10; k++) { a.fillStyle = rng.pick(['#111', '#333', '#2a2a2a']); a.fillRect(ix + 8 + (k % 5) * iw / 5, iy + ih * 0.3 + Math.floor(k / 5) * ih * 0.25, iw / 6, ih * 0.16); e.fillStyle = rng.pick(['#4af', '#f4a', '#fd4', '#5f8']); e.fillRect(ix + 10 + (k % 5) * iw / 5, iy + ih * 0.31 + Math.floor(k / 5) * ih * 0.25, iw / 6 - 4, ih * 0.13); }
      a.fillStyle = 'rgba(255,255,255,0.14)'; a.beginPath(); a.moveTo(ix, iy); a.lineTo(ix + iw * 0.3, iy); a.lineTo(ix, iy + ih * 0.6); a.fill();
      a.strokeStyle = '#999'; a.lineWidth = 3; a.strokeRect(ix, iy, iw, ih); a.beginPath(); a.moveTo(ix + iw / 2, iy); a.lineTo(ix + iw / 2, iy + ih); a.stroke();
    } else if (row === 3) { // produce / grocery
      const [ix, iy, iw, ih] = inner(); darkInterior(ix, iy, iw, ih, '#ffe0a0');
      for (let k = 0; k < 7; k++) { a.fillStyle = '#c2a36e'; a.fillRect(ix + k * iw / 7 + 2, iy + ih * 0.62, iw / 7 - 4, ih * 0.36); a.fillStyle = rng.pick(['#d33', '#e83', '#ec2', '#5a2', '#8b4513', '#f5f0e0']); a.beginPath(); a.ellipse(ix + k * iw / 7 + iw / 14, iy + ih * 0.63, iw / 16, ih * 0.06, 0, 0, 7); a.fill(); }
      for (let k = 0; k < 3; k++) { a.fillStyle = '#d9b520'; for (let b = 0; b < 6; b++) { a.beginPath(); a.ellipse(ix + 30 + k * iw / 3 + (b % 2) * 8, iy + 18 + b * 7, 6, 3, 0.5, 0, 7); a.fill(); } } // bananas
    } else if (row === 4) { // colonial arcade
      a.fillStyle = '#d8cfbd'; a.fillRect(x, y, cw, cellH);
      a.fillStyle = '#1e1a16'; a.beginPath(); const ax = x + cw * 0.12, aw = cw * 0.76; a.moveTo(ax, y + cellH); a.lineTo(ax, y + cellH * 0.45); a.arc(ax + aw / 2, y + cellH * 0.45, aw / 2, Math.PI, 0); a.lineTo(ax + aw, y + cellH); a.fill();
      e.fillStyle = '#f7d79a'; e.globalAlpha = 0.55; e.beginPath(); e.moveTo(ax + 10, y + cellH); e.lineTo(ax + 10, y + cellH * 0.5); e.arc(ax + aw / 2, y + cellH * 0.5, aw / 2 - 10, Math.PI, 0); e.lineTo(ax + aw - 10, y + cellH); e.fill(); e.globalAlpha = 1;
      a.fillStyle = '#c6baa3'; a.fillRect(x, y, cw * 0.1, cellH); a.fillRect(x + cw * 0.9, y, cw * 0.1, cellH);
    } else if (row === 5) { // office lobby
      const [ix, iy, iw, ih] = inner(0.05); glassGrad(a, ix, iy, iw, ih, '#6a7f88', '#22323a'); e.fillStyle = '#c8d8e8'; e.globalAlpha = 0.6; e.fillRect(ix, iy, iw, ih); e.globalAlpha = 1;
      a.strokeStyle = '#bfc4c6'; a.lineWidth = 4; a.strokeRect(ix, iy, iw, ih); for (let k = 1; k < 4; k++) { a.beginPath(); a.moveTo(ix + k * iw / 4, iy); a.lineTo(ix + k * iw / 4, iy + ih); a.stroke(); }
    } else if (row === 6) { // compound wall + gate
      a.fillStyle = '#d3ccbd'; a.fillRect(x, y + cellH * 0.45, cw, cellH * 0.55); a.fillStyle = '#7a9c66'; a.fillRect(x, y, cw, cellH * 0.45);
      for (let k = 0; k < 20; k++) { a.fillStyle = rng.pick(['#4d7a3a', '#6a9a50', '#3b6a2c', '#88b060']); a.beginPath(); a.arc(x + rng.next() * cw, y + rng.next() * cellH * 0.45, rng.range(8, 20), 0, 7); a.fill(); }
      if (col % 2 === 0) { a.fillStyle = '#2b2b2b'; a.fillRect(x + cw * 0.3, y + cellH * 0.35, cw * 0.4, cellH * 0.65); a.fillStyle = '#555'; for (let gx = x + cw * 0.32; gx < x + cw * 0.68; gx += 8) a.fillRect(gx, y + cellH * 0.37, 3, cellH * 0.6); }
      grime(a, W, H, { scale: 4, amount: 0, seed: 1 });
    } else { // tea kade / bakery
      const [ix, iy, iw, ih] = inner(); darkInterior(ix, iy, iw, ih, '#fff0c8');
      a.fillStyle = '#c9d6dc'; a.fillRect(ix + 6, iy + ih * 0.55, iw - 12, ih * 0.3); e.fillStyle = '#fff6d8'; e.fillRect(ix + 6, iy + ih * 0.55, iw - 12, ih * 0.3);
      for (let k = 0; k < 14; k++) { a.fillStyle = rng.pick(['#c8892f', '#b26a1e', '#e0b060', '#a0522d']); a.beginPath(); a.ellipse(ix + 14 + (k % 7) * (iw - 24) / 7, iy + ih * 0.62 + Math.floor(k / 7) * ih * 0.12, 7, 4, 0, 0, 7); a.fill(); } // short eats
      a.fillStyle = '#2f4f3f'; a.fillRect(ix + iw * 0.1, iy + ih * 0.08, iw * 0.35, ih * 0.3); a.fillStyle = '#f0f0e0'; for (let k = 0; k < 5; k++) a.fillRect(ix + iw * 0.13, iy + ih * 0.12 + k * 8, iw * 0.25, 2);
    }
    a.restore();
  }
  grime(a, W, H, { scale: 24, amount: 0.15, seed: 101 });
  // night glare: the lit window used to be one flat bright gradient over the whole opening, so at night the glow swamped what
  // is painted inside (shelves, menu boards, goods) and the window read as a blank cream panel. The glow is now modulated by the
  // window's own picture, lifted so dark interiors still glow (~45%) while the contents stay readable
  { const M = canvas(W, H), m = M.getContext('2d'); m.drawImage(A, 0, 0); m.globalCompositeOperation = 'screen'; m.fillStyle = 'rgb(115,115,115)'; m.fillRect(0, 0, W, H);
    e.globalCompositeOperation = 'multiply'; e.drawImage(M, 0, 0); e.globalCompositeOperation = 'source-over'; }
  return { map: toTex(A), emissive: toTex(E) };
}

// ----------------------------------------------------------------------------- signage atlas
// Trilingual (English / Sinhala / Tamil) shop signs, as commonly seen across Colombo.
export const SIGN_COLS = 8, SIGN_ROWS = 16; // 128 signs: the hand-made list + generated local businesses (no repeats nearby)
export const SIGNS = [
  { en: 'Fathima Textiles', si: 'රෙදි සාප්පුව', ta: 'ஜவுளிக் கடை', bg: '#7a1f2b', fg: '#ffe9b0', kind: 'textile', mission: 'fathima' },
  { en: 'Selvaraj Electronics', si: 'විදුලි උපකරණ', ta: 'மின் உபகரணங்கள்', bg: '#0d3b66', fg: '#ffffff', kind: 'electronics', mission: 'selvaraj' },
  { en: 'Bandara Spice Stores', si: 'කුළුබඩු', ta: 'மசாலாப் பொருட்கள்', bg: '#b5651d', fg: '#fff7e0', kind: 'produce', mission: 'bandara' },
  { en: 'Lucky Tea Kade', si: 'තේ කඩේ', ta: 'தேநீர்க் கடை', bg: '#1f5f3a', fg: '#fff3c4', kind: 'cafe', mission: 'kade' },
  { en: 'Sri Lakshmi Textiles', si: 'රෙදි සාප්පුව', ta: 'ஜவுளிக் கடை', bg: '#c0392b', fg: '#fff', kind: 'textile' },
  { en: 'New Ceylon Electricals', si: 'විදුලි උපකරණ', ta: 'மின் உபகரணங்கள்', bg: '#f1c40f', fg: '#1a1a1a', kind: 'electronics' },
  { en: 'Gamage Hardware', si: 'හාඩ්වෙයාර්', ta: 'வன்பொருள்', bg: '#2c3e50', fg: '#f39c12', kind: 'shutter' },
  { en: 'Royal Bakery', si: 'බේකරිය', ta: 'பேக்கரி', bg: '#8e44ad', fg: '#fff', kind: 'cafe' },
  { en: 'Nawaz Hotel', si: 'හෝටලය', ta: 'உணவகம்', bg: '#16a085', fg: '#fff', kind: 'cafe' },
  { en: 'Ranjith Pharmacy', si: 'ෆාමසි', ta: 'மருந்தகம்', bg: '#27ae60', fg: '#fff', kind: 'electronics' },
  { en: 'Raja Jewellers', si: 'රන් භාණ්ඩ', ta: 'தங்க நகை மாளிகை', bg: '#3b2a0a', fg: '#f5d76e', kind: 'electronics' },
  { en: 'Lanka Mobile Centre', si: 'ජංගම දුරකථන', ta: 'கைத்தொலைபேசி', bg: '#e74c3c', fg: '#fff', kind: 'electronics' },
  { en: 'Mihira Fruit Stall', si: 'පලතුරු', ta: 'பழங்கள்', bg: '#d35400', fg: '#fff', kind: 'produce' },
  { en: 'Senanayake Book Shop', si: 'පොත් හල', ta: 'புத்தகசாலை', bg: '#1a5276', fg: '#fdfefe', kind: 'electronics' },
  { en: 'Super Shoe Palace', si: 'සපත්තු', ta: 'காலணிகள்', bg: '#212121', fg: '#ff5252', kind: 'textile' },
  { en: 'Thilak Lottery', si: 'ලොතරැයි', ta: 'லொத்தர்', bg: '#f9e79f', fg: '#7b241c', kind: 'shutter' },
  { en: 'Hameed Brothers', si: 'රෙදි සාප්පුව', ta: 'ஜவுளிக் கடை', bg: '#0b5345', fg: '#f7dc6f', kind: 'textile' },
  { en: 'Kandiah & Sons', si: 'කුළුබඩු', ta: 'மசாலாப் பொருட்கள்', bg: '#922b21', fg: '#fdebd0', kind: 'produce' },
  { en: 'Perera Stores', si: 'එළවළු', ta: 'காய்கறிகள்', bg: '#145a32', fg: '#fff', kind: 'produce' },
  { en: 'Silva Motor Spares', si: 'හාඩ්වෙයාර්', ta: 'வன்பொருள்', bg: '#566573', fg: '#fff', kind: 'shutter' },
  { en: 'Al-Ameen Kottu', si: 'කොත්තු', ta: 'உணவகம்', bg: '#1b2631', fg: '#f4d03f', kind: 'cafe' },
  { en: 'Jaffna Cool Bar', si: 'කෑම', ta: 'உணவகம்', bg: '#5dade2', fg: '#0b2545', kind: 'cafe' },
  { en: 'Island Sarees', si: 'රෙදි සාප්පුව', ta: 'புடவை', bg: '#76448a', fg: '#f9e79f', kind: 'textile' },
  { en: 'Colombo Cut Saloon', si: 'කොළඹ', ta: 'கொழும்பு', bg: '#283747', fg: '#fff', kind: 'shutter' },
  { en: 'Ayubowan Bath Kade', si: 'බත් කඩේ', ta: 'உணவகம்', bg: '#b03a2e', fg: '#fff', kind: 'cafe' },
  { en: 'Wijesinghe Pharmacy', si: 'ඔසුසල', ta: 'மருந்தகம்', bg: '#117864', fg: '#fff', kind: 'electronics' },
  { en: 'Star Electricals', si: 'විදුලි උපකරණ', ta: 'மின் உபகரணங்கள்', bg: '#212f3d', fg: '#5dade2', kind: 'electronics' },
  { en: 'Fazal Textiles', si: 'රෙදි සාප්පුව', ta: 'ஜவுளி', bg: '#a93226', fg: '#fff', kind: 'textile' },
  { en: 'Ganesh Jewellery', si: 'රන් භාණ්ඩ', ta: 'நகைகள்', bg: '#4a235a', fg: '#f7dc6f', kind: 'electronics' },
  { en: 'Saman Hardware', si: 'හාඩ්වෙයාර්', ta: 'வன்பொருள்', bg: '#d4ac0d', fg: '#1b2631', kind: 'shutter' },
  { en: 'Pettah Rice Mart', si: 'බත් කඩේ', ta: 'உணவகம்', bg: '#7d6608', fg: '#fff', kind: 'produce' },
  { en: 'Vasantham Cafe', si: 'තේ කඩේ', ta: 'தேநீர்க் கடை', bg: '#0e6251', fg: '#fdfefe', kind: 'cafe' },
  { en: 'Ceylon Threads', si: 'රෙදි සාප්පුව', ta: 'ஜவுளி', bg: '#17202a', fg: '#e5be72', kind: 'textile', mission: 'tailor' },
  { en: 'Lanka Auto Care', si: 'ගරාජය', ta: 'கராஜ்', bg: '#1c2833', fg: '#f39c12', kind: 'shutter', mission: 'garage' },
  { en: 'Ceylon Arms Co.', si: 'ගිනි අවි', ta: 'துப்பாக்கிக் கடை', bg: '#141414', fg: '#d9b25a', kind: 'shutter', mission: 'gunshop' },
];
// ---- generated local businesses: owner / brand name + a trade whose Sinhala and Tamil words come from the vetted list above
// (no machine transliteration of names: the Sinhala/Tamil lines name the trade, as on many real Colombo shopfronts)
const TRADES = [
  ['textile', 'Textiles', 'රෙදි සාප්පුව', 'ஜவுளிக் கடை', 'spool'], ['textile', 'Fashions', 'රෙදි සාප්පුව', 'ஜவுளி', 'shirt'], ['textile', 'Sarees', 'රෙදි සාප්පුව', 'புடவை', 'shirt'], ['textile', 'Shoe Palace', 'සපත්තු', 'காலணிகள்', 'shoe'],
  ['electronics', 'Electronics', 'විදුලි උපකරණ', 'மின் உபகரணங்கள்', 'bolt'], ['electronics', 'Electricals', 'විදුලි උපකරණ', 'மின் உபகரணங்கள்', 'bolt'], ['electronics', 'Pharmacy', 'ඔසුසල', 'மருந்தகம்', 'cross'],
  ['electronics', 'Jewellers', 'රන් භාණ්ඩ', 'நகைகள்', 'gem'], ['electronics', 'Mobile Centre', 'ජංගම දුරකථන', 'கைத்தொலைபேசி', 'phone'], ['electronics', 'Book Shop', 'පොත් හල', 'புத்தகசாலை', 'book'],
  ['cafe', 'Bakery', 'බේකරිය', 'பேக்கரி', 'bread'], ['cafe', 'Hotel', 'හෝටලය', 'உணவகம்', 'plate'], ['cafe', 'Tea Kade', 'තේ කඩේ', 'தேநீர்க் கடை', 'cup'], ['cafe', 'Bath Kade', 'බත් කඩේ', 'உணவகம்', 'plate'], ['cafe', 'Kottu', 'කොත්තු', 'உணவகம்', 'plate'],
  ['shutter', 'Hardware', 'හාඩ්වෙයාර්', 'வன்பொருள்', 'wrench'], ['shutter', 'Motor Spares', 'හාඩ්වෙයාර්', 'வன்பொருள்', 'gear'], ['shutter', 'Lottery', 'ලොතරැයි', 'லொத்தர்', 'star'],
  ['produce', 'Spice Stores', 'කුළුබඩු', 'மசாலாப் பொருட்கள்', 'chili'], ['produce', 'Stores', 'එළවළු', 'காய்கறிகள்', 'fruit'], ['produce', 'Fruit Stall', 'පලතුරු', 'பழங்கள்', 'fruit'],
];
const OWNERS = ['Perera', 'Fernando', 'De Silva', 'Jayasinghe', 'Gunawardena', 'Dissanayake', 'Herath', 'Ratnayake', 'Wickrama', 'Senaratne', 'Amarasekara', 'Nimal', 'Sunil', 'Chaminda', 'Rizwan', 'Farook',
  'Ismail', 'Mohideen', 'Hassan', 'Kumar', 'Sivakumar', 'Nadarajah', 'Thambiah', 'Krishna', 'Shanmuga', 'New Lanka', 'Sri Devi', 'Royal', 'Golden', 'City', 'Pearl', 'Lotus', 'Serendib', 'Ruhuna',
  'Kelani', 'Diamond', 'Sunrise', 'Asoka', 'Lakmini', 'Udaya', 'Mahesh', 'Nuwan', 'Saman', 'Rohana', 'Anura', 'Nirmala', 'Fathima', 'Zainab', 'Malkanthi', 'Thilini', 'Priya', 'Lanka', 'Union', 'Liberty', 'Galaxy', 'Supreme'];
const PALETTE = [['#7a1f2b', '#ffe9b0'], ['#0d3b66', '#ffffff'], ['#1f5f3a', '#fff3c4'], ['#c0392b', '#ffffff'], ['#f1c40f', '#1a1a1a'], ['#2c3e50', '#f39c12'], ['#8e44ad', '#ffffff'], ['#16a085', '#ffffff'],
  ['#e74c3c', '#ffffff'], ['#1a5276', '#fdfefe'], ['#212121', '#ff5252'], ['#0b5345', '#f7dc6f'], ['#922b21', '#fdebd0'], ['#ffffff', '#b0151e'], ['#fdf6e3', '#0b4f8a'], ['#ffd400', '#0a0a0a'], ['#00695c', '#ffffff'], ['#4a148c', '#ffd54f']];
{ const rng = new RNG(4242); const seen = new Set(SIGNS.map((q) => q.en)); const N = SIGN_COLS * SIGN_ROWS;
  for (let guard = 0; SIGNS.length < N && guard < 5000; guard++) { const t = TRADES[rng.int(0, TRADES.length - 1)], o = OWNERS[rng.int(0, OWNERS.length - 1)]; const en = rng.chance(0.15) ? `${o} & Sons ${t[1]}`.replace(' & Sons Stores', ' & Sons') : `${o} ${t[1]}`;
    if (seen.has(en)) continue; seen.add(en); const [bg, fg] = PALETTE[rng.int(0, PALETTE.length - 1)]; SIGNS.push({ en, si: t[2], ta: t[3], bg, fg, kind: t[0], icon: t[4], gen: true }); } }
const ICON_OF = (s) => s.icon || (/Pharm/.test(s.en) ? 'cross' : /Jewel/.test(s.en) ? 'gem' : /Mobile/.test(s.en) ? 'phone' : /Book/.test(s.en) ? 'book' : /Bakery/.test(s.en) ? 'bread' : /Tea|Cafe/.test(s.en) ? 'cup'
  : /Hotel|Kottu|Kade|Bar|Rice/.test(s.en) ? 'plate' : /Hardware/.test(s.en) ? 'wrench' : /Motor|Auto/.test(s.en) ? 'gear' : /Lottery/.test(s.en) ? 'star' : /Spice|Sons/.test(s.en) ? 'chili' : /Fruit|Stores/.test(s.en) ? 'fruit'
  : /Shoe/.test(s.en) ? 'shoe' : /Electr/.test(s.en) ? 'bolt' : 'spool');
// simple flat pictograms (drawn in the current fillStyle/strokeStyle) centred at cx, cy with radius r
function drawIcon(a, kind, cx, cy, r) {
  a.save(); a.translate(cx, cy); a.lineWidth = r * 0.14; a.lineCap = 'round'; a.lineJoin = 'round'; const P = () => a.beginPath();
  switch (kind) {
    case 'cross': a.fillRect(-r * 0.25, -r * 0.8, r * 0.5, r * 1.6); a.fillRect(-r * 0.8, -r * 0.25, r * 1.6, r * 0.5); break;
    case 'gem': P(); a.moveTo(-r * 0.8, -r * 0.25); a.lineTo(-r * 0.45, -r * 0.7); a.lineTo(r * 0.45, -r * 0.7); a.lineTo(r * 0.8, -r * 0.25); a.lineTo(0, r * 0.85); a.closePath(); a.fill(); break;
    case 'phone': a.fillRect(-r * 0.42, -r * 0.85, r * 0.84, r * 1.7); a.clearRect(-r * 0.3, -r * 0.65, r * 0.6, r * 1.15); break;
    case 'book': P(); a.moveTo(0, -r * 0.5); a.quadraticCurveTo(-r * 0.5, -r * 0.8, -r * 0.9, -r * 0.55); a.lineTo(-r * 0.9, r * 0.6); a.quadraticCurveTo(-r * 0.5, r * 0.35, 0, r * 0.65); a.quadraticCurveTo(r * 0.5, r * 0.35, r * 0.9, r * 0.6); a.lineTo(r * 0.9, -r * 0.55); a.quadraticCurveTo(r * 0.5, -r * 0.8, 0, -r * 0.5); a.fill(); break;
    case 'bread': P(); a.ellipse(0, 0, r * 0.9, r * 0.5, 0, 0, Math.PI * 2); a.fill(); break;
    case 'cup': P(); a.moveTo(-r * 0.6, -r * 0.2); a.lineTo(r * 0.5, -r * 0.2); a.lineTo(r * 0.35, r * 0.7); a.lineTo(-r * 0.45, r * 0.7); a.closePath(); a.fill(); P(); a.arc(r * 0.6, r * 0.15, r * 0.22, -Math.PI / 2, Math.PI / 2); a.stroke(); for (const x of [-0.3, 0, 0.3]) { P(); a.moveTo(r * x, -r * 0.4); a.quadraticCurveTo(r * (x + 0.15), -r * 0.6, r * x, -r * 0.85); a.stroke(); } break;
    case 'plate': P(); a.arc(0, 0, r * 0.65, 0, Math.PI * 2); a.stroke(); P(); a.arc(0, 0, r * 0.35, 0, Math.PI * 2); a.fill(); a.fillRect(-r * 0.98, -r * 0.6, r * 0.1, r * 1.2); a.fillRect(r * 0.88, -r * 0.6, r * 0.1, r * 1.2); break;
    case 'wrench': a.rotate(-0.7); a.fillRect(-r * 0.12, -r * 0.4, r * 0.24, r * 1.25); P(); a.arc(0, -r * 0.55, r * 0.34, 0, Math.PI * 2); a.fill(); a.clearRect(-r * 0.1, -r * 0.95, r * 0.2, r * 0.4); break;
    case 'gear': for (let k = 0; k < 8; k++) { a.save(); a.rotate(k * Math.PI / 4); a.fillRect(-r * 0.14, -r * 0.88, r * 0.28, r * 0.4); a.restore(); } P(); a.arc(0, 0, r * 0.58, 0, Math.PI * 2); a.fill(); break;
    case 'star': P(); for (let k = 0; k < 10; k++) { const rr = k % 2 ? r * 0.38 : r * 0.88, ang = -Math.PI / 2 + k * Math.PI / 5; a.lineTo(Math.cos(ang) * rr, Math.sin(ang) * rr); } a.closePath(); a.fill(); break;
    case 'chili': P(); a.moveTo(-r * 0.8, -r * 0.4); a.quadraticCurveTo(r * 0.2, -r * 0.2, r * 0.75, r * 0.7); a.quadraticCurveTo(-r * 0.1, r * 0.25, -r * 0.7, -r * 0.05); a.closePath(); a.fill(); a.fillRect(-r * 0.95, -r * 0.6, r * 0.25, r * 0.12); break;
    case 'fruit': for (const [x, y, rr] of [[-0.35, 0.2, 0.42], [0.35, 0.2, 0.42], [0, -0.3, 0.4]]) { P(); a.arc(r * x, r * y, r * rr, 0, Math.PI * 2); a.fill(); } break;
    case 'shoe': P(); a.moveTo(-r * 0.85, -r * 0.35); a.lineTo(-r * 0.35, -r * 0.35); a.quadraticCurveTo(-r * 0.1, r * 0.05, r * 0.5, r * 0.1); a.quadraticCurveTo(r * 0.9, r * 0.2, r * 0.9, r * 0.5); a.lineTo(-r * 0.85, r * 0.5); a.closePath(); a.fill(); break;
    case 'shirt': P(); a.moveTo(-r * 0.3, -r * 0.8); a.lineTo(-r * 0.9, -r * 0.4); a.lineTo(-r * 0.65, 0); a.lineTo(-r * 0.45, -r * 0.1); a.lineTo(-r * 0.45, r * 0.85); a.lineTo(r * 0.45, r * 0.85); a.lineTo(r * 0.45, -r * 0.1); a.lineTo(r * 0.65, 0); a.lineTo(r * 0.9, -r * 0.4); a.lineTo(r * 0.3, -r * 0.8); a.quadraticCurveTo(0, -r * 0.5, -r * 0.3, -r * 0.8); a.fill(); break;
    case 'bolt': P(); a.moveTo(r * 0.2, -r * 0.9); a.lineTo(-r * 0.5, r * 0.1); a.lineTo(-r * 0.02, r * 0.1); a.lineTo(-r * 0.25, r * 0.9); a.lineTo(r * 0.5, -r * 0.15); a.lineTo(r * 0.02, -r * 0.15); a.closePath(); a.fill(); break;
    default: P(); a.arc(0, 0, r * 0.7, 0, Math.PI * 2); a.stroke(); P(); a.arc(0, 0, r * 0.25, 0, Math.PI * 2); a.fill();
  }
  a.restore();
}
// Shop fascia signs in five real-world styles: painted panel, back-lit lightbox with a coloured band, split colour block,
// Sinhala-led board, dark acrylic with lit lettering. Phone numbers use Colombo 011 numbers; about two thirds glow at night.
function signAtlas(cw = 512) {
  const ch = cw / 4, W = cw * SIGN_COLS, H = ch * SIGN_ROWS;
  const A = canvas(W, H), E = canvas(W, H), a = A.getContext('2d'), e = E.getContext('2d'); const rng = new RNG(303);
  e.fillStyle = '#000'; e.fillRect(0, 0, W, H);
  const n = SIGN_COLS * SIGN_ROWS; const EN = (k) => `700 ${Math.floor(k)}px "Barlow Condensed", "Manrope", sans-serif`, SIN = (k) => `600 ${Math.floor(k)}px "Noto Sans Sinhala", "Noto Sans Tamil", sans-serif`, TAM = (k) => `600 ${Math.floor(k)}px "Noto Sans Tamil", sans-serif`;
  for (let k = 0; k < n; k++) {
    const s = SIGNS[k % SIGNS.length]; const x = (k % SIGN_COLS) * cw, y = Math.floor(k / SIGN_COLS) * ch; const style = s.mission ? 0 : (k * 7 + 3) % 5; const icon = ICON_OF(s);
    const phone = `011 2${rng.int(100, 999)} ${rng.int(100, 999)}`;
    a.save(); a.beginPath(); a.rect(x, y, cw, ch); a.clip(); a.textBaseline = 'middle';
    if (style === 0) { // painted panel with border
      const g = a.createLinearGradient(0, y, 0, y + ch); g.addColorStop(0, shade(s.bg, 1.15)); g.addColorStop(1, shade(s.bg, 0.85)); a.fillStyle = g; a.fillRect(x, y, cw, ch);
      a.strokeStyle = s.fg; a.globalAlpha = 0.6; a.lineWidth = cw * 0.008; a.strokeRect(x + cw * 0.012, y + ch * 0.06, cw * 0.976, ch * 0.88); a.globalAlpha = 1;
      a.fillStyle = s.fg; a.textAlign = 'center'; a.font = EN(ch * 0.36); a.fillText(s.en.toUpperCase(), x + cw / 2, y + ch * 0.36, cw * 0.92);
      a.font = SIN(ch * 0.2); a.fillText(s.si, x + cw * 0.3, y + ch * 0.74, cw * 0.42); a.font = TAM(ch * 0.17); a.fillText(s.ta, x + cw * 0.72, y + ch * 0.74, cw * 0.42);
      a.font = `500 ${Math.floor(ch * 0.11)}px "Manrope", sans-serif`; a.globalAlpha = 0.7; a.fillText('☎ ' + phone, x + cw / 2, y + ch * 0.92); a.globalAlpha = 1;
    } else if (style === 1) { // lightbox: white face, brand colour lettering, colour band with the trade in Sinhala / Tamil, icon roundel
      a.fillStyle = '#f7f5ef'; a.fillRect(x, y, cw, ch); a.fillStyle = s.bg === '#ffffff' || s.bg === '#fdf6e3' ? s.fg : s.bg; a.fillRect(x, y + ch * 0.66, cw, ch * 0.34);
      a.beginPath(); a.arc(x + ch * 0.36, y + ch * 0.34, ch * 0.26, 0, Math.PI * 2); a.fill(); a.fillStyle = '#ffffff'; drawIcon(a, icon, x + ch * 0.36, y + ch * 0.34, ch * 0.17);
      a.fillStyle = s.bg === '#ffffff' || s.bg === '#fdf6e3' ? s.fg : s.bg; a.textAlign = 'left'; a.font = EN(ch * 0.4); a.fillText(s.en.toUpperCase(), x + ch * 0.72, y + ch * 0.35, cw - ch * 0.8);
      a.fillStyle = '#ffffff'; a.font = SIN(ch * 0.19); a.fillText(s.si, x + ch * 0.2, y + ch * 0.83, cw * 0.4); a.textAlign = 'right'; a.font = TAM(ch * 0.15); a.fillText(s.ta, x + cw - ch * 0.2, y + ch * 0.83, cw * 0.4);
    } else if (style === 2) { // split block: colour square with icon | name panel, phone strip
      a.fillStyle = s.fg === '#ffffff' || s.fg === '#fff' ? '#1b1b1b' : s.fg; a.fillRect(x, y, cw, ch); a.fillStyle = s.bg; a.fillRect(x, y, ch * 1.05, ch);
      a.beginPath(); a.moveTo(x + ch * 1.05, y); a.lineTo(x + ch * 1.3, y); a.lineTo(x + ch * 1.05, y + ch); a.fill(); a.fillStyle = s.fg; drawIcon(a, icon, x + ch * 0.52, y + ch * 0.5, ch * 0.32);
      a.fillStyle = s.bg === '#ffffff' ? '#b0151e' : '#ffffff'; if (a.fillStyle === s.fg) a.fillStyle = '#ffffff'; a.textAlign = 'left';
      a.font = EN(ch * 0.38); a.fillText(s.en.toUpperCase(), x + ch * 1.35, y + ch * 0.34, cw - ch * 1.45); a.font = SIN(ch * 0.18); a.fillText(s.si + '  ·  ' + s.ta, x + ch * 1.35, y + ch * 0.68, cw - ch * 1.45);
      a.font = `600 ${Math.floor(ch * 0.12)}px "Manrope", sans-serif`; a.globalAlpha = 0.8; a.fillText('☎ ' + phone, x + ch * 1.35, y + ch * 0.9); a.globalAlpha = 1;
    } else if (style === 3) { // Sinhala-led board (trade in big Sinhala, English name below, Tamil at the side)
      const g = a.createLinearGradient(x, 0, x + cw, 0); g.addColorStop(0, shade(s.bg, 0.9)); g.addColorStop(1, shade(s.bg, 1.2)); a.fillStyle = g; a.fillRect(x, y, cw, ch);
      a.fillStyle = s.fg; a.fillRect(x, y + ch * 0.04, cw, ch * 0.03); a.fillRect(x, y + ch * 0.93, cw, ch * 0.03); a.textAlign = 'left';
      a.font = SIN(ch * 0.36); a.fillText(s.si, x + cw * 0.04, y + ch * 0.36, cw * 0.6); a.textAlign = 'right'; a.font = TAM(ch * 0.17); a.fillText(s.ta, x + cw * 0.96, y + ch * 0.32, cw * 0.32);
      a.textAlign = 'left'; a.font = EN(ch * 0.27); a.fillText(s.en.toUpperCase(), x + cw * 0.04, y + ch * 0.74, cw * 0.7); a.globalAlpha = 0.85; drawIcon(a, icon, x + cw * 0.88, y + ch * 0.7, ch * 0.18); a.globalAlpha = 1;
    } else { // dark acrylic, lettering in the brand colour (lit), thin keyline
      a.fillStyle = '#121416'; a.fillRect(x, y, cw, ch); const lc = s.bg === '#212121' || s.bg === '#1b2631' || s.bg === '#17202a' ? s.fg : (s.bg === '#ffffff' || s.bg === '#fdf6e3' ? s.fg : s.bg);
      a.strokeStyle = lc; a.lineWidth = ch * 0.025; a.strokeRect(x + ch * 0.06, y + ch * 0.08, cw - ch * 0.12, ch * 0.84); a.fillStyle = lc; a.textAlign = 'center';
      a.font = EN(ch * 0.42); a.fillText(s.en.toUpperCase(), x + cw / 2, y + ch * 0.4, cw * 0.86); a.fillStyle = '#e8e8e8'; a.font = SIN(ch * 0.17); a.fillText(s.si, x + cw * 0.32, y + ch * 0.76, cw * 0.4); a.font = TAM(ch * 0.14); a.fillText(s.ta, x + cw * 0.7, y + ch * 0.76, cw * 0.4);
    }
    a.restore();
    grimeRect(a, x, y, cw, ch, rng);
    // illuminated signs glow at night: lightboxes and acrylic always, painted boards about half the time
    if (style === 1 || style === 4 || k % 3 !== 2) { e.save(); e.globalAlpha = style === 1 ? 0.95 : 0.85; e.drawImage(A, x, y, cw, ch, x, y, cw, ch); e.restore(); }
  }
  fadeCanvas(A, 0.85, [190, 182, 166], 0.05); // daylight face only: night illumination (E) unchanged
  return { map: toTex(A, { repeat: false }), emissive: toTex(E, { repeat: false }) };
}
function grimeRect(a, x, y, w, h, rng) { for (let k = 0; k < 6; k++) { a.fillStyle = `rgba(40,30,20,${rng.range(0.05, 0.18)})`; a.fillRect(x + rng.next() * w, y + rng.next() * h * 0.3, rng.range(3, 10), h * rng.range(0.2, 0.8)); } }

// ----------------------------------------------------------------------------- roofs, misc
function roofTiles(size) { // Calicut / terracotta tiles
  const c = canvas(size, size), ctx = c.getContext('2d'), rng = new RNG(61);
  ctx.fillStyle = '#7a3b24'; ctx.fillRect(0, 0, size, size);
  const rw = size / 16, rh = size / 12;
  for (let r = 0; r < 12; r++) for (let k = 0; k < 17; k++) {
    const x = k * rw - (r % 2) * rw / 2, y = r * rh; const t = rng.pick(['#a5502f', '#97462a', '#b45c36', '#8a3f25', '#7a3a24']);
    const g = ctx.createLinearGradient(x, 0, x + rw, 0); g.addColorStop(0, shade(t, 0.7)); g.addColorStop(0.5, shade(t, 1.15)); g.addColorStop(1, shade(t, 0.7)); ctx.fillStyle = g; ctx.fillRect(x + 1, y, rw - 2, rh - 2);
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(x + 1, y + rh - 4, rw - 2, 3);
  }
  grime(ctx, size, size, { scale: 5, amount: 0.3, seed: 62, color: [40, 40, 30], bias: -0.05 });
  // height: each half-round Calicut tile is a barrel (sin across), rising towards its lower lip where it overlaps the course
  // below (the albedo's dark strip under the lip), 1-px gaps between tiles; same 16 × 12 lattice → tiles seamlessly
  const hc = heightCanvas(size), hx = hc.getContext('2d'), g = hx.getImageData(0, 0, size, size), d = g.data;
  for (let y = 0; y < size; y++) { const row = Math.floor(y / rh), v = (y - row * rh) / rh;
    for (let x = 0; x < size; x++) { const xs = x + (row % 2) * rw / 2; const col = Math.floor(xs / rw), u = (xs - col * rw) / rw; const i = (y * size + x) * 4;
      const gap = u * rw < 1 || u * rw > rw - 1 || v * rh > rh - 2; const jit = (hash2(((col % 16) + 16) % 16, row, 61) - 0.5) * 16;
      const hv = gap ? 18 : 34 + 150 * Math.pow(Math.sin(Math.PI * u), 0.65) + 56 * v + jit; d[i] = d[i + 1] = d[i + 2] = Math.max(0, Math.min(255, hv)); d[i + 3] = 255; } }
  hx.putImageData(g, 0, 0); blurHeight(hc, 1); reliefNoise(hc, { scale: 32, amp: 5, oct: 2, seed: 63, grain: 6 });
  const t = toTex(c); t.userData.height = hc; return t;
}
function corrugated(size, tone = '#9aa0a2', rust = true) {
  const c = canvas(size, size), ctx = c.getContext('2d');
  for (let x = 0; x < size; x += size / 32) { const g = ctx.createLinearGradient(x, 0, x + size / 32, 0); g.addColorStop(0, shade(tone, 1.2)); g.addColorStop(0.5, shade(tone, 0.7)); g.addColorStop(1, shade(tone, 1.2)); ctx.fillStyle = g; ctx.fillRect(x, 0, size / 32, size); }
  if (rust) grime(ctx, size, size, { scale: 5, amount: 0.5, seed: 71, color: [120, 60, 30], bias: -0.08 });
  // height: the sheet's sinusoidal profile (crests where the albedo is lightest, 32 per tile) + rust blistering on old sheets
  const hc = heightCanvas(size), hx = hc.getContext('2d'), g = hx.getImageData(0, 0, size, size), d = g.data, p = size / 32;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) { const i = (y * size + x) * 4; d[i] = d[i + 1] = d[i + 2] = 128 + 92 * Math.cos((2 * Math.PI * (x + 0.5)) / p); }
  hx.putImageData(g, 0, 0); if (rust) reliefNoise(hc, { scale: 24, amp: 6, oct: 2, seed: 72, grain: 5 });
  const t = toTex(c); t.userData.height = hc; return t;
}
function roofConcrete(size) {
  const t = concrete(size, '#8f8a80', 81, false); const ctx = t.image.getContext('2d');
  grime(ctx, size, size, { scale: 4, amount: 0.4, seed: 82, color: [40, 45, 35], bias: -0.05 });
  reliefNoise(t.userData.height, { scale: 8, amp: 8, oct: 3, seed: 83 }); // weathered screed: ponding hollows and lumps
  t.needsUpdate = true; return t;
}
function waterNormal(size) {
  const c = canvas(size, size), ctx = c.getContext('2d'); const img = ctx.createImageData(size, size); const h = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) h[y * size + x] = fbm(x / size * 8, y / size * 8, 5, 91, 8);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const hl = h[y * size + ((x - 1 + size) % size)], hr = h[y * size + ((x + 1) % size)], hu = h[((y - 1 + size) % size) * size + x], hd = h[((y + 1) % size) * size + x];
    let nx = (hl - hr) * 6, ny = (hu - hd) * 6, nz = 1; const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    const i = (y * size + x) * 4; img.data[i] = (nx * 0.5 + 0.5) * 255; img.data[i + 1] = (ny * 0.5 + 0.5) * 255; img.data[i + 2] = (nz * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0); return toTex(c, { srgb: false });
}
function radial(size, stops) { const c = canvas(size, size), ctx = c.getContext('2d'); const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2); for (const [o, col] of stops) g.addColorStop(o, col); ctx.fillStyle = g; ctx.fillRect(0, 0, size, size); return toTex(c, { repeat: false }); }
function palmFrond(size) { // alpha-tested leaflets
  const c = canvas(size, size / 2), ctx = c.getContext('2d'), rng = new RNG(111); const h = size / 2;
  ctx.strokeStyle = '#6b5a2a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(size, h / 2); ctx.stroke();
  for (let k = 4; k < size - 6; k += 5) {
    const t = k / size; const len = h * 0.48 * Math.sin(Math.PI * Math.min(1, t * 1.1 + 0.05)) + 4;
    for (const s of [-1, 1]) { ctx.strokeStyle = rng.pick(['#3f6b22', '#4f7d2a', '#5a8a30', '#355e1c', '#6b8f3a']); ctx.lineWidth = rng.range(2.2, 3.4); ctx.beginPath(); ctx.moveTo(k, h / 2); ctx.quadraticCurveTo(k + len * 0.35, h / 2 + s * len * 0.6, k + len * 0.55, h / 2 + s * len); ctx.stroke(); }
  }
  const t = toTex(c, { repeat: false }); return t;
}
// A sprig of real leaves (alpha-cut card): a forked twig with pointed-oval leaves along each branch, every leaf with a lit and a
// shaded half either side of its midrib, a darker rim and a pale midrib; leaves overlap toward the middle, leaving natural gaps
// at the edge (no disc of blobs). shape: 'oval' (mango / rain tree / bo-like), 'small' (dense small leaves: ficus, hedges, creepers)
function leafCluster(size, hues = ['#2f5a1e', '#3d6e26', '#4c7f2e', '#28501a', '#5c8c38'], seed = 121, shape = 'oval') {
  const c = canvas(size, size), ctx = c.getContext('2d'), rng = new RNG(seed); const S = size / 256, C = size / 2;
  const shade = (hex, k) => { const n = parseInt(hex.slice(1), 16); const f = (v) => Math.max(0, Math.min(255, Math.round(v * k))); return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`; };
  const leaf = (x, y, ang, len, wid, hue, dk = 1) => { ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    // each half shaded base→tip (the stalk end sits deeper in the cluster), leaves lower in the stack darker (self-shadow)
    const half = (sg, k) => { const g = ctx.createLinearGradient(0, 0, len, 0); g.addColorStop(0, shade(hue, k * dk * 0.72)); g.addColorStop(0.55, shade(hue, k * dk)); g.addColorStop(1, shade(hue, k * dk * 1.08));
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0, 0); ctx.bezierCurveTo(len * 0.25, sg * wid * 1.05, len * 0.7, sg * wid * 0.9, len, 0); ctx.closePath(); ctx.fill(); };
    half(-1, 1.12); half(1, 0.82); // light catches one side of the fold
    if (len > 18 * S) { ctx.strokeStyle = shade(hue, 1.25 * dk); ctx.lineWidth = 0.5 * S; ctx.globalAlpha = 0.55; ctx.beginPath(); // secondary veins
      for (let t = 0.2; t < 0.85; t += 0.16) for (const sg of [-1, 1]) { ctx.moveTo(len * t, 0); ctx.lineTo(len * (t + 0.12), sg * wid * 0.75 * Math.sin(Math.PI * (t + 0.06))); }
      ctx.stroke(); ctx.globalAlpha = 1; }
    ctx.strokeStyle = shade(hue, 0.6); ctx.lineWidth = 0.9 * S; ctx.beginPath(); ctx.moveTo(0, 0); ctx.bezierCurveTo(len * 0.25, -wid * 1.05, len * 0.7, -wid * 0.9, len, 0); ctx.bezierCurveTo(len * 0.7, wid * 0.9, len * 0.25, wid * 1.05, 0, 0); ctx.stroke();
    ctx.strokeStyle = shade(hue, 1.45); ctx.lineWidth = 0.8 * S; ctx.beginPath(); ctx.moveTo(len * 0.04, 0); ctx.lineTo(len * 0.9, 0); ctx.stroke();
    ctx.restore(); };
  const twig = (x0, y0, x1, y1, w) => { ctx.strokeStyle = '#4a3a26'; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); };
  const nB = shape === 'small' ? 9 : 6; const leaves = [];
  for (let b = 0; b < nB; b++) { const a = (b / nB) * Math.PI * 2 + rng.range(-0.25, 0.25); const L = size * rng.range(0.3, 0.42); const ex = C + Math.cos(a) * L, ey = C + Math.sin(a) * L;
    twig(C + Math.cos(a) * size * 0.04, C + Math.sin(a) * size * 0.04, ex, ey, 1.6 * S);
    const nL = shape === 'small' ? 10 : 6; for (let k = 0; k < nL; k++) { const t = 0.2 + 0.8 * (k / (nL - 1)); const px = C + Math.cos(a) * L * t, py = C + Math.sin(a) * L * t;
      for (const sg of k === nL - 1 ? [0] : [-1, 1]) { const la = a + sg * rng.range(0.5, 0.95); const len = (shape === 'small' ? rng.range(11, 17) : rng.range(26, 40)) * S * (1.05 - 0.3 * t * (shape === 'small' ? 0 : 1)); const wid = len * (shape === 'small' ? rng.range(0.32, 0.42) : rng.range(0.2, 0.3));
        if (Math.hypot(px + Math.cos(la) * len - C, py + Math.sin(la) * len - C) > size * 0.49) continue; leaves.push([px, py, la, len, wid, rng.pick(hues), rng.next()]); } } }
  leaves.sort((p, q) => p[6] - q[6]); for (const l of leaves) leaf(l[0], l[1], l[2], l[3], l[4], l[5], 0.72 + 0.34 * l[6]);
  return toTex(c, { repeat: false });
}
// banana leaf (u across the blade, v along it): wide blade, pale midrib, fine parallel veins sweeping out to the edge, torn
// slits running in from the edge along the veins (alpha), browned tattered margins
function bananaLeaf(w, h) {
  const c = canvas(w, h), ctx = c.getContext('2d'), rng = new RNG(171); const cx = w / 2;
  ctx.clearRect(0, 0, w, h);
  const halfW = (v) => w * 0.47 * Math.pow(Math.sin(Math.PI * Math.min(1, v * 1.04 + 0.02)), 0.55);
  for (const sg of [-1, 1]) { ctx.beginPath(); ctx.moveTo(cx, 0); for (let i = 0; i <= 40; i++) { const v = i / 40; ctx.lineTo(cx + sg * halfW(v), v * h); } ctx.lineTo(cx, h); ctx.closePath();
    const g = ctx.createLinearGradient(cx, 0, cx + sg * w * 0.5, 0); g.addColorStop(0, sg < 0 ? '#5f9a34' : '#4f8a2c'); g.addColorStop(0.85, sg < 0 ? '#6aa63c' : '#5a9532'); g.addColorStop(1, '#8a8a3a'); ctx.fillStyle = g; ctx.fill(); }
  ctx.lineWidth = 1; for (let y = 4; y < h; y += 3) { for (const sg of [-1, 1]) { ctx.strokeStyle = `rgba(${sg < 0 ? '40,80,20' : '30,66,16'},${rng.range(0.25, 0.5)})`; ctx.beginPath(); ctx.moveTo(cx, y); ctx.quadraticCurveTo(cx + sg * w * 0.2, y + 6, cx + sg * halfW(y / h), y + 14); ctx.stroke(); } }
  ctx.globalCompositeOperation = 'destination-out'; // tears along the veins
  for (let k = 0; k < 26; k++) { const sg = rng.chance(0.5) ? -1 : 1, y = rng.range(0.1, 0.95) * h, d = rng.range(0.3, 0.92); ctx.lineWidth = rng.range(1.2, 2.6); ctx.beginPath(); ctx.moveTo(cx + sg * halfW(y / h) * 1.05, y + 14); ctx.quadraticCurveTo(cx + sg * halfW(y / h) * (1 - d * 0.5), y + 8, cx + sg * halfW(y / h) * (1 - d), y + 3); ctx.stroke(); }
  ctx.globalCompositeOperation = 'source-atop'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(120,96,40,0.55)'; // dry margin
  for (const sg of [-1, 1]) { ctx.beginPath(); for (let i = 0; i <= 40; i++) { const v = i / 40; ctx.lineTo(cx + sg * halfW(v), v * h); } ctx.stroke(); }
  ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = '#b8c87a'; ctx.fillRect(cx - 2.5, 0, 5, h); ctx.fillStyle = 'rgba(60,90,30,0.5)'; ctx.fillRect(cx + 1.5, 0, 1.5, h); // midrib
  return toTex(c, { repeat: false });
}
// tree bark (tiles): vertical fissured ridges with lichen flecks, grey-brown; palm trunk: horizontal leaf-scar rings
function barkTex(size, palm = false) {
  const c = canvas(size, size), ctx = c.getContext('2d'), rng = new RNG(palm ? 183 : 181);
  ctx.fillStyle = palm ? '#8a7d68' : '#6e5e4c'; ctx.fillRect(0, 0, size, size);
  if (palm) { for (let r = 0; r < 8; r++) { const y = (r + 0.5) * size / 8; ctx.fillStyle = 'rgba(40,32,24,0.55)'; ctx.fillRect(0, y - 2, size, 4); ctx.fillStyle = 'rgba(200,190,170,0.18)'; ctx.fillRect(0, y + 2, size, 3);
      for (let x = 0; x < size; x += 4) { ctx.fillStyle = `rgba(${rng.chance(0.5) ? '60,50,38' : '150,140,120'},${rng.range(0.05, 0.2)})`; ctx.fillRect(x, y - size / 16 + rng.range(0, 6), 3, rng.range(6, size / 10)); } } }
  else { for (let k = 0; k < 70; k++) { const x = rng.range(0, size), w = rng.range(2, 6); ctx.strokeStyle = `rgba(35,26,18,${rng.range(0.35, 0.7)})`; ctx.lineWidth = w; ctx.beginPath(); let px = x; ctx.moveTo(px, 0); for (let y = 0; y <= size; y += 16) { px += rng.range(-3, 3); ctx.lineTo(px, y); } ctx.stroke();
      ctx.strokeStyle = `rgba(170,150,125,${rng.range(0.08, 0.2)})`; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x + w, 0); ctx.lineTo(x + w + rng.range(-4, 4), size); ctx.stroke(); }
    for (let k = 0; k < 60; k++) { ctx.fillStyle = `rgba(${rng.chance(0.6) ? '150,160,120' : '190,190,170'},${rng.range(0.12, 0.3)})`; ctx.beginPath(); ctx.ellipse(rng.range(0, size), rng.range(0, size), rng.range(2, 7), rng.range(1.5, 5), 0, 0, 7); ctx.fill(); } }
  return toTex(c, { repeat: true });
}
function fabricPlaid(size, seed = 131) { // sarong check (grayscale, tinted per instance)
  const c = canvas(size, size), ctx = c.getContext('2d'), rng = new RNG(seed);
  ctx.fillStyle = '#d8d8d8'; ctx.fillRect(0, 0, size, size);
  const bands = [];
  for (let k = 0; k < 6; k++) bands.push([rng.range(0, size), rng.range(4, 20), rng.range(0.35, 0.8)]);
  for (const [p, w, d] of bands) { ctx.fillStyle = `rgba(0,0,0,${1 - d})`; ctx.fillRect(p, 0, w, size); ctx.fillRect(0, p, size, w); }
  ctx.fillStyle = 'rgba(255,255,255,0.35)'; for (let k = 0; k < 3; k++) { const p = rng.range(0, size); ctx.fillRect(p, 0, 2, size); ctx.fillRect(0, p, size, 2); }
  return toTex(c);
}
function fabricSaree(size) { // body with paisley-ish dots and a rich border near the hem (v=0)
  const c = canvas(size, size), ctx = c.getContext('2d'), rng = new RNG(141);
  ctx.fillStyle = '#e8e8e8'; ctx.fillRect(0, 0, size, size);
  for (let k = 0; k < 120; k++) { ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.beginPath(); ctx.arc(rng.next() * size, rng.next() * size * 0.8, rng.range(2, 4), 0, 7); ctx.fill(); }
  const g = ctx.createLinearGradient(0, size * 0.82, 0, size); g.addColorStop(0, '#f0d27a'); g.addColorStop(0.3, '#b8862b'); g.addColorStop(0.6, '#f6e3a1'); g.addColorStop(1, '#8a5a1a');
  ctx.fillStyle = g; ctx.fillRect(0, size * 0.84, size, size * 0.16);
  ctx.fillStyle = '#7a1f1f'; for (let x = 0; x < size; x += 16) { ctx.beginPath(); ctx.moveTo(x, size * 0.9); ctx.lineTo(x + 8, size * 0.86); ctx.lineTo(x + 16, size * 0.9); ctx.lineTo(x + 8, size * 0.94); ctx.fill(); }
  return toTex(c);
}
function fabricBatik(size) {
  const c = canvas(size, size), ctx = c.getContext('2d'), rng = new RNG(151);
  ctx.fillStyle = '#e0e0e0'; ctx.fillRect(0, 0, size, size);
  for (let k = 0; k < 26; k++) { const x = rng.next() * size, y = rng.next() * size, r = rng.range(8, 26); ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 3; ctx.beginPath(); for (let a = 0; a < 7; a += 0.5) { const rr = r * (0.6 + 0.4 * Math.sin(a * 3)); ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } ctx.closePath(); ctx.stroke(); ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fill(); }
  grime(ctx, size, size, { scale: 8, amount: 0.15, seed: 152 });
  return toTex(c);
}
function fabricWeave(size) { // subtle weave for normal-less fabric detail (as roughness-ish albedo mod)
  const c = canvas(size, size), ctx = c.getContext('2d'); ctx.fillStyle = '#f2f2f2'; ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = 'rgba(0,0,0,0.06)'; for (let k = 0; k < size; k += 2) { ctx.fillRect(k, 0, 1, size); ctx.fillRect(0, k, size, 1); }
  grime(ctx, size, size, { scale: 8, amount: 0.08, seed: 161 });
  return toTex(c);
}
// Face texture painted on the head sphere (u wraps around, front of face at u=0.75 for our head UVs).
// faceAtlas() stacks FACE_FRAMES expression frames vertically; a character shows one frame via texture offset.
export const FACE_FRAMES = ['neutral', 'blink', 'smile', 'talk', 'surprise', 'fear', 'concern', 'angry', 'lookL', 'lookR'];
const FACE_EX = { // eye openness, pupil x, brow raise, brow tilt (+ = worried/inner up, − = angry), mouth open, smile (−1 frown .. 1)
  neutral: { eye: 1, px: 0, brow: 0, tilt: 0, open: 0, smile: 0.05 }, blink: { eye: 0, px: 0, brow: -0.1, tilt: 0, open: 0, smile: 0.05 },
  smile: { eye: 0.78, px: 0, brow: 0.2, tilt: 0.1, open: 0.15, smile: 1 }, talk: { eye: 1, px: 0, brow: 0.25, tilt: 0, open: 0.55, smile: 0.1 },
  surprise: { eye: 1.35, px: 0, brow: 1, tilt: 0.25, open: 0.75, smile: 0 }, fear: { eye: 1.3, px: 0, brow: 0.8, tilt: 1, open: 0.4, smile: -0.5 },
  concern: { eye: 0.9, px: 0, brow: 0.3, tilt: 0.9, open: 0, smile: -0.45 }, angry: { eye: 0.75, px: 0, brow: -0.6, tilt: -1, open: 0.1, smile: -0.7 },
  lookL: { eye: 1, px: 1, brow: 0.05, tilt: 0, open: 0, smile: 0.05 }, lookR: { eye: 1, px: -1, brow: 0.05, tilt: 0, open: 0, smile: 0.05 },
};
function drawFace(ctx, oy, size, { female, stubble, brow, lips, seed, v }, ex) {
  const fx = size * 1.5, ey = oy + size * 0.47; const S = size / 256; v = v || {};
  const EW = v.eyeW || 1, ESP = v.eyeSp || 1, BW = v.browW || 1, BA = v.browArch || 1, LW = v.lipW || 1, LF = v.lipFull || 1, NW = v.noseW || 1;
  // soft shading for eye sockets, cheekbones and under-lip
  for (const sx of [-1, 1]) { const g = ctx.createRadialGradient(fx + sx * 21 * S, ey, 2, fx + sx * 21 * S, ey, 22 * S); g.addColorStop(0, 'rgba(120,90,80,0.32)'); g.addColorStop(1, 'rgba(120,90,80,0)'); ctx.fillStyle = g; ctx.fillRect(fx + sx * 21 * S - 24 * S, ey - 24 * S, 48 * S, 48 * S); }
  for (const sx of [-1, 1]) { const g = ctx.createRadialGradient(fx + sx * 30 * S, ey + 22 * S, 1, fx + sx * 30 * S, ey + 22 * S, 20 * S); g.addColorStop(0, female ? 'rgba(200,110,100,0.14)' : 'rgba(150,90,70,0.08)'); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(fx + sx * 30 * S - 22 * S, ey, 44 * S, 44 * S); }
  const eh = 4.6 * S * ex.eye * (v.eyeH || 1);
  for (const sx of [-1, 1]) {
    const x = fx + sx * 20 * ESP * S;
    if (ex.eye > 0.12) {
      ctx.save(); ctx.beginPath(); ctx.ellipse(x, ey, 9 * EW * S, eh, 0, 0, 7); ctx.clip();
      ctx.fillStyle = '#f2ece4'; ctx.fillRect(x - 10 * EW * S, ey - 8 * S, 20 * EW * S, 16 * S);
      const ix = x + ex.px * 4 * S; ctx.fillStyle = '#2a1a10'; ctx.beginPath(); ctx.arc(ix, ey + 0.3 * S, 4.3 * S, 0, 7); ctx.fill();
      ctx.fillStyle = v.iris || '#4a2c18'; ctx.beginPath(); ctx.arc(ix, ey + 0.3 * S, 3.2 * S, 0, 7); ctx.fill();
      ctx.fillStyle = '#050505'; ctx.beginPath(); ctx.arc(ix, ey + 0.3 * S, (ex.eye > 1.2 ? 1.5 : 2) * S, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.beginPath(); ctx.arc(ix + 1.5 * S, ey - 1.4 * S, 1.1 * S, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(60,35,25,0.35)'; ctx.fillRect(x - 10 * EW * S, ey - eh, 20 * EW * S, 1.6 * S); // lid shadow
      ctx.restore();
      ctx.strokeStyle = female ? '#0a0605' : 'rgba(30,18,12,0.85)'; ctx.lineWidth = (female ? 2.4 : 1.5) * S; ctx.beginPath(); ctx.ellipse(x, ey, 9.5 * EW * S, eh + 0.5 * S, 0, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke();
      ctx.strokeStyle = 'rgba(90,55,45,0.35)'; ctx.lineWidth = 1 * S; ctx.beginPath(); ctx.ellipse(x, ey - 1 * S, 10 * EW * S, eh + 3 * S, 0, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke(); // crease
    } else { // closed: lid line with lashes
      ctx.strokeStyle = female ? '#0a0605' : 'rgba(30,18,12,0.85)'; ctx.lineWidth = (female ? 2.2 : 1.6) * S; ctx.beginPath(); ctx.moveTo(x - 9 * EW * S, ey); ctx.quadraticCurveTo(x, ey + 3 * S, x + 9 * EW * S, ey); ctx.stroke();
    }
    // brows: whole brow raised by ex.brow, inner end (towards the nose) tilted by ex.tilt
    const by = ey - (female ? 12.5 : 11) * S - ex.brow * 3.5 * S; const inner = x - sx * 11 * S, outer = x + sx * 11 * S; const iy = by - ex.tilt * 3.2 * S, oyb = by + 1.5 * S + ex.tilt * 0.8 * S;
    ctx.fillStyle = brow; ctx.beginPath(); ctx.moveTo(inner, iy); ctx.quadraticCurveTo(x, by - 3.6 * BA * S, outer, oyb); ctx.lineTo(outer, oyb + (female ? 1.6 : 2.4) * BW * S); ctx.quadraticCurveTo(x, by - (0.6 + (BA - 1) * 3) * S, inner, iy + (female ? 2.4 : 3.4) * BW * S); ctx.fill();
  }
  // nose shadow
  ctx.fillStyle = 'rgba(110,70,55,0.35)'; ctx.beginPath(); ctx.ellipse(fx, ey + 24 * S, 7 * NW * S, 3 * S, 0, 0, 7); ctx.fill();
  for (const sx of [-1, 1]) { ctx.fillStyle = 'rgba(70,40,30,0.4)'; ctx.beginPath(); ctx.ellipse(fx + sx * 4 * NW * S, ey + 25 * S, 1.6 * S, 1.1 * S, 0, 0, 7); ctx.fill(); }
  // mouth: corners lift with smile; open mouth shows the dark interior and upper teeth
  const my = ey + 38 * S, mw = (12 * LW + ex.smile * 2 + ex.open * -1.5) * S, cy = my - ex.smile * 3.2 * S, op = ex.open * 9 * S;
  if (op > 1.5 * S) {
    ctx.fillStyle = '#3a1210'; ctx.beginPath(); ctx.moveTo(fx - mw, cy); ctx.quadraticCurveTo(fx, my - 2 * S - op * 0.15, fx + mw, cy); ctx.quadraticCurveTo(fx, my + op * 1.1, fx - mw, cy); ctx.fill();
    ctx.fillStyle = 'rgba(240,236,226,0.95)'; ctx.beginPath(); ctx.moveTo(fx - mw * 0.7, cy + 0.6 * S); ctx.quadraticCurveTo(fx, my - 1 * S, fx + mw * 0.7, cy + 0.6 * S); ctx.lineTo(fx + mw * 0.6, cy + 2.4 * S); ctx.quadraticCurveTo(fx, my + 1.4 * S, fx - mw * 0.6, cy + 2.4 * S); ctx.fill();
    ctx.strokeStyle = lips; ctx.lineWidth = 2.6 * S; ctx.beginPath(); ctx.moveTo(fx - mw, cy); ctx.quadraticCurveTo(fx, my - 2.5 * S - op * 0.15, fx + mw, cy); ctx.quadraticCurveTo(fx, my + op * 1.1 + 1 * S, fx - mw, cy); ctx.stroke();
  } else {
    ctx.fillStyle = lips; ctx.beginPath(); ctx.moveTo(fx - mw, cy); ctx.quadraticCurveTo(fx - 4 * S, my - 5 * S, fx, my - 3.6 * S); ctx.quadraticCurveTo(fx + 4 * S, my - 5 * S, fx + mw, cy); ctx.quadraticCurveTo(fx, my + 7 * LF * S - ex.smile * 1.5 * S, fx - mw, cy); ctx.fill();
    ctx.strokeStyle = 'rgba(60,25,20,0.75)'; ctx.lineWidth = 1.3 * S; ctx.beginPath(); ctx.moveTo(fx - mw, cy); ctx.quadraticCurveTo(fx, my + 1 * S + ex.smile * 1.5 * S, fx + mw, cy); ctx.stroke();
    if (ex.smile > 0.5) for (const sx of [-1, 1]) { ctx.strokeStyle = 'rgba(90,50,40,0.35)'; ctx.lineWidth = 1 * S; ctx.beginPath(); ctx.arc(fx + sx * (mw + 4 * S), cy - 1 * S, 5 * S, sx > 0 ? Math.PI * 0.6 : Math.PI * -0.6, sx > 0 ? Math.PI * 1.3 : Math.PI * 0.4, sx < 0); ctx.stroke(); }
  }
  if (v.lines > 0) { // age lines: forehead, nasolabial folds, crow's feet (soft, non-caricatured)
    const a = 0.22 * v.lines; ctx.lineWidth = 1.1 * S; ctx.strokeStyle = `rgba(80,45,35,${a})`;
    for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.moveTo(fx - 22 * S, ey - (27 + k * 6) * S); ctx.quadraticCurveTo(fx, ey - (30 + k * 6) * S, fx + 22 * S, ey - (27 + k * 6) * S); ctx.stroke(); }
    for (const sx of [-1, 1]) { ctx.beginPath(); ctx.moveTo(fx + sx * 9 * S, ey + 22 * S); ctx.quadraticCurveTo(fx + sx * 17 * S, ey + 32 * S, fx + sx * 15 * S, ey + 42 * S); ctx.stroke();
      for (let k = -1; k <= 1; k++) { ctx.beginPath(); ctx.moveTo(fx + sx * 31 * ESP * S, ey + k * 2.5 * S); ctx.lineTo(fx + sx * 36 * ESP * S, ey + k * 4 * S); ctx.stroke(); } }
  }
  if (v.eyeW ? !!v.pottu : (female && seed % 2 === 0)) { ctx.fillStyle = 'rgba(180,30,40,0.9)'; ctx.beginPath(); ctx.arc(fx, ey - 14 * S - ex.brow * 2 * S, 1.8 * S, 0, 7); ctx.fill(); } // pottu (worn by some)
  if (stubble > 0) {
    const rng = new RNG(seed);
    ctx.fillStyle = `rgba(25,18,14,${0.25 * stubble})`;
    ctx.beginPath(); ctx.ellipse(fx, ey + 48 * S, 34 * S, 26 * S, 0, 0, Math.PI); ctx.fill();
    ctx.beginPath(); ctx.ellipse(fx, ey + 33 * S, 15 * S, 4 * S, 0, 0, 7); ctx.fill();
    for (let k = 0; k < 500 * stubble; k++) { ctx.fillStyle = `rgba(20,14,10,${0.35 * stubble})`; const a = rng.range(0.1, Math.PI - 0.1), r = rng.range(14, 36) * S; ctx.fillRect(fx + Math.cos(a) * r, ey + 30 * S + Math.sin(a) * r * 0.8, 1, 1); }
  }
}
export function faceAtlas({ female = false, stubble = 0.0, size = 256, brow = '#1a1410', lips = '#8a4a40', seed = 1, v = null } = {}) {
  const N = FACE_FRAMES.length; const c = canvas(size * 2, size * N), ctx = c.getContext('2d');
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, size * 2, size * N);
  // canvas row 0 is the top of the texture (flipY): frame i occupies v ∈ [1-(i+1)/N, 1-i/N]
  FACE_FRAMES.forEach((name, i) => drawFace(ctx, i * size, size, { female, stubble, brow, lips, seed, v }, FACE_EX[name]));
  grime(ctx, size * 2, size * N, { scale: 6, amount: 0.04, seed: 171 + seed });
  const t = toTex(c, { repeat: false }); t.wrapS = THREE.RepeatWrapping; t.repeat.set(1, 1 / N); return t;
}
export function faceTexture(opts = {}) { return faceAtlas(opts); }

// ----------------------------------------------------------------------------- build all
// TEX[key] carries its height canvas in userData → TEX['n_' + key] (the canvas is dropped afterwards)
function bakeNormal(key, strength) { const t = TEX[key]; if (!t || !t.userData.height) return; TEX['n_' + key] = heightToNormal(t.userData.height, { strength }); delete t.userData.height; }
// Facade relief: brick / colonial paint their own height field; the other rendered (plastered / cement-washed) styles get a
// hand-floated render relief and the warehouse its cladding profile, all at half the facade resolution. Window glass is
// held perfectly flat (rm green < 90 = glass in every facade generator) so the interior mapping and reflections stay clean.
const PLASTER_FACADES = { f_shop: 2, f_shop2: 2, f_shop3: 2, f_apartment: 2, f_apartment2: 2, f_villa: 2, f_hotel: 1.8, f_office: 1.6, f_office2: 1.6 };
function facadeNormal(k, f) {
  let hc = f.height, strength = f.relief || 2;
  if (!hc && PLASTER_FACADES[k]) { hc = plasterRelief(heightCanvas(f.albedo.width / 2, f.albedo.height / 2, 128), k.length * 7 + f.albedo.width); strength = PLASTER_FACADES[k]; }
  if (!hc && k === 'f_warehouse') { const w = f.albedo.width / 2, h = f.albedo.height / 2; hc = heightCanvas(w, h); const x = hc.getContext('2d'), g = x.getImageData(0, 0, w, h), d = g.data;
    for (let y = 0; y < h; y++) for (let xx = 0; xx < w; xx++) { const i = (y * w + xx) * 4; d[i] = d[i + 1] = d[i + 2] = 128 + 90 * Math.cos((2 * Math.PI * (xx + 0.5)) / 4); } // albedo ribs: 8 px → 4 px here
    x.putImageData(g, 0, 0); reliefNoise(hc, { scale: 16, amp: 6, oct: 2, seed: 97 }); strength = 1.4; }
  if (!hc) return null; // glass / metal-panel curtain walls: smooth by design
  const w = hc.width, h = hc.height, rm = document.createElement('canvas'); rm.width = w; rm.height = h; const rx = rm.getContext('2d'); rx.drawImage(f.rm, 0, 0, w, h);
  const rd = rx.getImageData(0, 0, w, h).data, flat = new Float32Array(w * h); for (let i = 0; i < flat.length; i++) flat[i] = rd[i * 4 + 1] < 90 ? 0 : 1;
  return heightToNormal(hc, { strength, flat });
}
// Stage 1 colour (36th): the rendered facades were painted near-white (#f2efe8…#f6f3ec) so the per-building paint could
// tint them — at full brightness that multiplies out to a chalk-white, plastic-looking wall. Settle the render to a real
// aged cement / lime-plaster value with a slight warm-grey cast. Glass (rm green < 90) is left exactly as painted.
const PLASTER_BASE = { f_shop: 0.9, f_shop2: 0.9, f_shop3: 0.92, f_apartment: 0.9, f_apartment2: 0.92, f_villa: 0.92, f_hotel: 0.93, f_office: 0.94, f_office2: 0.94, f_colonial: 0.92 };
function weatherPlaster(f, k) {
  const w = f.albedo.width, h = f.albedo.height, a = f.albedo.getContext('2d'), img = a.getImageData(0, 0, w, h), d = img.data;
  const rx = document.createElement('canvas'); rx.width = w; rx.height = h; const rc = rx.getContext('2d'); rc.drawImage(f.rm, 0, 0, w, h); const rd = rc.getImageData(0, 0, w, h).data;
  for (let i = 0; i < d.length; i += 4) { if (rd[i + 1] < 90) continue; d[i] = d[i] * k; d[i + 1] = d[i + 1] * (k - 0.012); d[i + 2] = d[i + 2] * (k - 0.035); }
  a.putImageData(img, 0, 0);
}
// faded shop signs: sun-bleached paint / vinyl (slightly desaturated, a touch of dust) — the lettering is untouched in shape
function fadeCanvas(c, sat = 0.82, dust = [196, 188, 172], dk = 0.06) {
  const x = c.getContext('2d'), img = x.getImageData(0, 0, c.width, c.height), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const l = 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2];
    for (let j = 0; j < 3; j++) d[i + j] = (l + (d[i + j] - l) * sat) * (1 - dk) + dust[j] * dk; }
  x.putImageData(img, 0, 0);
}
export async function buildTextures(quality = 'high', progress = () => {}) {
  const hi = quality === 'high' || quality === 'ultra';
  const FW = hi ? 1024 : 512, FH = FW / 2, S = hi ? 1024 : 512;
  const steps = [
    ['asphalt', () => { const a = asphalt(S); TEX.asphalt = a.map; TEX.asphaltRough = a.rough; TEX.n_asphalt = heightToNormal(a.height, { strength: S > 512 ? 5 : 3.5 }); }],
    ['pavers', () => { TEX.pavers = pavers(512); TEX.paversGrey = pavers(512, ['#8a8780', '#7d7a73', '#96928a', '#6f6c66'], 6); bakeNormal('pavers', 4); bakeNormal('paversGrey', 4); }],
    ['concrete', () => { TEX.concrete = concrete(512); TEX.roofConcrete = roofConcrete(512); bakeNormal('concrete', 3); bakeNormal('roofConcrete', 3); }],
    ['grass', () => { TEX.grass = grass(512, 21, 0.3); TEX.lawn = grass(512, 22, 0.08); TEX.laterite = laterite(512); TEX.hedge = hedgeTex(256); TEX.sand = sand(512); bakeNormal('sand', 3); TEX.rocks = rocks(512); TEX.ballast = ballast(512); }],
    ['facades: colonial', () => { TEX.f_colonial = facadeColonial(FW, FH, 201); TEX.f_brick = facadeBrick(FW, FH, 202); }],
    ['facades: modern', () => { TEX.f_glass = facadeGlass(FW, FH, 203); TEX.f_glass2 = facadeGlass(FW, FH, 213, ['#8fa9b0', '#3c5560']); TEX.f_office = facadeOffice(FW, FH, 204); TEX.f_hotel = facadeHotel(FW, FH, 208); }],
    ['facades: variants', () => { TEX.f_office2 = facadeOffice2(FW, FH, 224); TEX.f_office3 = facadeOffice3(FW, FH, 234); TEX.f_glass3 = facadeGlass(FW, FH, 223, ['#8e8068', '#2c251c']); TEX.f_apartment2 = facadeApartment2(FW, FH, 226); TEX.f_shop3 = facadeShop3(FW, FH, 225); }],
    ['facades: shophouses', () => { TEX.f_shop = facadeShophouse(FW, FH, 205); TEX.f_shop2 = facadeShophouse(FW, FH, 215); TEX.f_apartment = facadeApartment(FW, FH, 206); }],
    ['facades: homes', () => { TEX.f_villa = facadeVilla(FW, FH, 207); TEX.f_warehouse = facadeWarehouse(FW / 2, FH / 2, 209); }],
    ['shopfronts', () => { TEX.shops = shopAtlas(hi ? 256 : 128); }],
    ['signage', () => { TEX.signs = signAtlas(hi ? 400 : 256); }],
    ['roofs', () => { TEX.roofTiles = roofTiles(512); TEX.corrugated = corrugated(256); TEX.corrugatedBlue = corrugated(256, '#5a7d9a', false); bakeNormal('roofTiles', 3); bakeNormal('corrugated', 2.4); }],
    ['water & light', () => {
      TEX.waterNormal = waterNormal(256);
      TEX.glow = radial(128, [[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(255,255,255,0.5)'], [1, 'rgba(255,255,255,0)']]);
      TEX.pool = radial(128, [[0, 'rgba(255,255,255,0.9)'], [0.5, 'rgba(255,255,255,0.35)'], [1, 'rgba(255,255,255,0)']]);
    }],
    ['foliage', () => { TEX.palm = palmFrond(512); TEX.leaves = leafCluster(512); TEX.leavesBright = leafCluster(512, ['#4a7a2a', '#5f9236', '#6fa040', '#3e6a22', '#86b04e'], 123); TEX.leavesSmall = leafCluster(256, ['#2c5a1c', '#3a6a24', '#47782c', '#2a4f18', '#55863a'], 127, 'small'); TEX.banana = bananaLeaf(128, 512); TEX.bark = barkTex(256); TEX.palmBark = barkTex(256, true); }],
    ['fabrics', () => { TEX.plaid = fabricPlaid(256); TEX.saree = fabricSaree(256); TEX.batik = fabricBatik(256); TEX.weave = fabricWeave(128); }],
  ];
  for (let i = 0; i < steps.length; i++) {
    progress(i / steps.length, steps[i][0]);
    steps[i][1]();
    await new Promise((r) => setTimeout(r, 0));
  }
  // facade wrappers → textures
  for (const k of Object.keys(TEX)) if (k.startsWith('f_') && TEX[k].albedo) {
    const f = TEX[k]; if (PLASTER_BASE[k]) weatherPlaster(f, PLASTER_BASE[k]); TEX[k] = { map: toTex(f.albedo), emissive: toTex(f.emis), rm: toTex(f.rm, { srgb: false }), normal: facadeNormal(k, f) }; FACADE_WINDOWS[k] = f.windows;
  }
  progress(1, 'textures ready');
  return TEX;
}
