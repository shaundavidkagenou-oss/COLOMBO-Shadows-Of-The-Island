// Procedural texture library. Everything is painted at load time on canvases so the game
// ships with zero third-party art. Textures are tileable where they repeat.
import * as THREE from 'three';
import { RNG } from '../core/rng.js';
import { fbm, vnoise } from '../core/noise.js';

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
function speckle(ctx, w, h, n, colors, rng, size = [0.5, 1.6]) {
  for (let k = 0; k < n; k++) { ctx.fillStyle = rng.pick(colors); const s = rng.range(size[0], size[1]); ctx.fillRect(rng.next() * w, rng.next() * h, s, s); }
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
  grime(ctx, size, size, { scale: 6, amount: 0.22, seed: 3 });
  speckle(ctx, size, size, size * size * 0.05, ['#5c5c5e', '#353537', '#6b6a66', '#2d2d2f', '#58544d'], rng, [0.6, 1.8]);
  // patch repairs
  for (let k = 0; k < 4; k++) { ctx.fillStyle = rng.pick(['rgba(30,30,32,0.45)', 'rgba(80,80,82,0.3)']); const pw = rng.range(40, 160), ph = rng.range(30, 120); ctx.fillRect(rng.next() * size, rng.next() * size, pw, ph); }
  // cracks
  ctx.strokeStyle = 'rgba(20,20,20,0.55)'; ctx.lineWidth = 1.2;
  for (let k = 0; k < 14; k++) {
    let x = rng.next() * size, y = rng.next() * size; ctx.beginPath(); ctx.moveTo(x, y);
    for (let s = 0; s < 12; s++) { x += rng.range(-14, 14); y += rng.range(-14, 14); ctx.lineTo(x, y); }
    ctx.stroke();
  }
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
  return { map, rough: toTex(r, { srgb: false }) };
}
function pavers(size, base = ['#8d5a4a', '#7e4c3e', '#9a6a58', '#86817a', '#78736c'], seed = 5) {
  const c = canvas(size, size), ctx = c.getContext('2d'), rng = new RNG(seed);
  ctx.fillStyle = '#5a5550'; ctx.fillRect(0, 0, size, size);
  // interlocking "unipave" bricks in herringbone-ish rows
  const bw = size / 8, bh = size / 16;
  for (let row = 0; row < 16; row++) for (let col = -1; col < 9; col++) {
    const off = (row % 2) * bw * 0.5; const x = col * bw + off, y = row * bh;
    const tone = rng.pick(base); ctx.fillStyle = tone;
    ctx.beginPath();
    const w = bw - 3, h = bh - 3, n = bh * 0.18;
    ctx.moveTo(x + 1.5, y + 1.5); ctx.lineTo(x + w * 0.33, y + 1.5); ctx.lineTo(x + w * 0.5, y + 1.5 + n); ctx.lineTo(x + w * 0.66, y + 1.5); ctx.lineTo(x + w + 1.5, y + 1.5);
    ctx.lineTo(x + w + 1.5, y + h + 1.5); ctx.lineTo(x + w * 0.66, y + h + 1.5); ctx.lineTo(x + w * 0.5, y + h + 1.5 + n); ctx.lineTo(x + w * 0.33, y + h + 1.5); ctx.lineTo(x + 1.5, y + h + 1.5); ctx.closePath(); ctx.fill();
  }
  grime(ctx, size, size, { scale: 5, amount: 0.3, seed: seed + 1 });
  speckle(ctx, size, size, size * 30, ['rgba(0,0,0,0.25)', 'rgba(255,255,255,0.08)'], rng);
  return toTex(c);
}
function concrete(size, tone = '#9b968d', seed = 7, joints = true) {
  const c = canvas(size, size), ctx = c.getContext('2d'), rng = new RNG(seed);
  ctx.fillStyle = tone; ctx.fillRect(0, 0, size, size);
  grime(ctx, size, size, { scale: 4, amount: 0.25, seed });
  grime(ctx, size, size, { scale: 16, amount: 0.1, seed: seed + 3 });
  speckle(ctx, size, size, size * 40, ['rgba(0,0,0,0.12)', 'rgba(255,255,255,0.08)'], rng);
  if (joints) { ctx.strokeStyle = 'rgba(40,38,35,0.5)'; ctx.lineWidth = 2; ctx.strokeRect(0, 0, size, size); ctx.beginPath(); ctx.moveTo(size / 2, 0); ctx.lineTo(size / 2, size); ctx.moveTo(0, size / 2); ctx.lineTo(size, size / 2); ctx.stroke(); }
  return toTex(c);
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
  grime(ctx, size, size, { scale: 8, amount: 0.15, seed: 41 });
  speckle(ctx, size, size, size * 60, ['rgba(90,70,40,0.25)', 'rgba(255,250,235,0.2)'], new RNG(41));
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
  return { albedo, emis, rm, a, e, r };
}
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
  const bw = W / 4, fh = H / 2;
  for (let fl = 0; fl < 2; fl++) {
    const y0 = fl * fh;
    a.fillStyle = '#e4d9c2'; a.fillRect(0, y0 + fh - 10, W, 10); // string course
    a.fillStyle = 'rgba(0,0,0,0.12)'; a.fillRect(0, y0 + fh - 2, W, 2);
    for (let b = 0; b < 4; b++) {
      const x0 = b * bw; a.fillStyle = '#e9dfca'; a.fillRect(x0, y0, 10, fh); a.fillStyle = 'rgba(0,0,0,0.08)'; a.fillRect(x0 + 10, y0, 2, fh); // pilaster
      const ww = bw * 0.46, wh = fh * 0.62, wx = x0 + (bw - ww) / 2, wy = y0 + fh * 0.18;
      // arch surround
      a.fillStyle = '#d9cdb3'; a.beginPath(); a.moveTo(wx - 6, wy + wh + 4); a.lineTo(wx - 6, wy + ww * 0.5); a.arc(wx + ww / 2, wy + ww * 0.5, ww / 2 + 6, Math.PI, 0); a.lineTo(wx + ww + 6, wy + wh + 4); a.fill();
      a.save(); a.beginPath(); a.moveTo(wx, wy + wh); a.lineTo(wx, wy + ww * 0.5); a.arc(wx + ww / 2, wy + ww * 0.5, ww / 2, Math.PI, 0); a.lineTo(wx + ww, wy + wh); a.closePath(); a.clip();
      const shut = rng.next();
      if (shut < 0.45) { // green louvred shutters
        a.fillStyle = rng.pick(['#2f5d45', '#3a6b52', '#5b4632', '#29495e']); a.fillRect(wx, wy, ww, wh);
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
  return f;
}
function facadeBrick(W, H, seed) {
  const f = facadeBase(W, H), rng = new RNG(seed); const { a, e, r } = f;
  a.fillStyle = '#9a4535'; a.fillRect(0, 0, W, H);
  for (let y = 0; y < H; y += 6) for (let x = (y / 6) % 2 ? -6 : 0; x < W; x += 13) { a.fillStyle = rng.pick(['#a24a38', '#8f3e30', '#b0573f', '#943f33']); a.fillRect(x, y, 12, 5); }
  const bw = W / 4, fh = H / 2;
  for (let fl = 0; fl < 2; fl++) for (let b = 0; b < 4; b++) {
    const x0 = b * bw, y0 = fl * fh; const ww = bw * 0.48, wh = fh * 0.6, wx = x0 + (bw - ww) / 2, wy = y0 + fh * 0.2;
    a.fillStyle = '#efe7d6'; a.fillRect(wx - 7, wy - 12, ww + 14, wh + 22); a.fillRect(x0, y0 + fh - 8, bw, 8);
    glassGrad(a, wx, wy, ww, wh); a.strokeStyle = '#f4efe4'; a.lineWidth = 3; a.strokeRect(wx, wy, ww, wh);
    a.beginPath(); a.moveTo(wx + ww / 2, wy); a.lineTo(wx + ww / 2, wy + wh); a.stroke();
    r.fillStyle = 'rgb(255,50,0)'; r.fillRect(wx, wy, ww, wh); windowLights(e, rng, wx, wy, ww, wh, 0.55);
  }
  grime(a, W, H, { scale: 5, amount: 0.15, seed: seed + 3 });
  return f;
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
    if (type < 0.2) { // closed wooden shutters
      a.fillStyle = rng.pick(['#6b4a2e', '#3f5f6e', '#4f6b3c', '#8a5a3a']); a.fillRect(wx, wy, ww, wh);
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
      glassGrad(a, x0 + bw * 0.2, y0 + fh * 0.15, bw * 0.6, fh * 0.75, '#3c474b', '#111618'); r.fillStyle = 'rgb(255,60,0)'; r.fillRect(x0 + bw * 0.2, y0 + fh * 0.15, bw * 0.6, fh * 0.75);
      windowLights(e, rng, x0 + bw * 0.2, y0 + fh * 0.15, bw * 0.6, fh * 0.75, 0.5);
      a.fillStyle = '#d7d2c7'; a.fillRect(x0 + 2, y0 + fh * 0.6, bw - 4, fh * 0.35);
      a.fillStyle = 'rgba(0,0,0,0.15)'; a.fillRect(x0 + 2, y0 + fh * 0.93, bw - 4, 4);
      if (rng.chance(0.5)) for (let k = 0; k < 4; k++) { a.fillStyle = rng.pick(['#c33', '#36c', '#ec3', '#fff', '#3a3', '#c6c']); a.fillRect(x0 + 6 + k * 14, y0 + fh * 0.48, 10, rng.range(12, 22)); } // laundry
    } else {
      const ww = bw * 0.5, wh = fh * 0.45, wx = x0 + bw * 0.25, wy = y0 + fh * 0.25;
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
    a.fillStyle = '#5a3a22'; a.fillRect(wx - 4, wy - 4, ww + 8, wh + 8);
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
  grime(a, W, H, { scale: 6, amount: 0.3, seed, color: [140, 80, 40], bias: -0.1 }); // rust
  stains(a, W, H, rng, 30, 'rgba(110,60,30,A)');
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
    a.fillStyle = '#e8e4da'; a.fillRect(x, y, cw, cellH);
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
      const [ix, iy, iw, ih] = inner(0.08); const col0 = rng.pick(['#8c9294', '#6f8a7a', '#7a8a9a', '#9a8f78']);
      for (let sy = iy; sy < iy + ih; sy += 5) { const g = a.createLinearGradient(0, sy, 0, sy + 5); g.addColorStop(0, shade(col0, 1.15)); g.addColorStop(1, shade(col0, 0.75)); a.fillStyle = g; a.fillRect(ix, sy, iw, 5); }
      a.fillStyle = 'rgba(60,40,20,0.35)'; for (let k = 0; k < 4; k++) a.fillRect(ix + rng.range(0, iw), iy + ih * rng.range(0.4, 1), rng.range(10, 30), 3);
      a.fillStyle = '#333'; a.fillRect(ix + iw / 2 - 8, iy + ih - 10, 16, 6);
      if (rng.chance(0.6)) { a.fillStyle = rng.pick(['#e9e2c0', '#f5f5f5', '#f1c40f']); a.fillRect(ix + rng.range(10, iw - 60), iy + rng.range(20, ih - 50), 44, 30); a.fillStyle = '#222'; a.font = 'bold 9px "Barlow Condensed", sans-serif'; a.fillText('TO LET', ix + 30, iy + 60); }
    } else if (row === 2) { // electronics / phones — bright glass
      const [ix, iy, iw, ih] = inner(); const g = a.createLinearGradient(0, iy, 0, iy + ih); g.addColorStop(0, '#dfe8ee'); g.addColorStop(1, '#8fa2ad'); a.fillStyle = g; a.fillRect(ix, iy, iw, ih);
      e.fillStyle = '#e6f2ff'; e.fillRect(ix, iy, iw, ih);
      for (let k = 0; k < 10; k++) { a.fillStyle = rng.pick(['#111', '#333', '#2a2a2a']); a.fillRect(ix + 8 + (k % 5) * iw / 5, iy + ih * 0.3 + Math.floor(k / 5) * ih * 0.25, iw / 6, ih * 0.16); e.fillStyle = rng.pick(['#4af', '#f4a', '#fd4', '#5f8']); e.fillRect(ix + 10 + (k % 5) * iw / 5, iy + ih * 0.31 + Math.floor(k / 5) * ih * 0.25, iw / 6 - 4, ih * 0.13); }
      a.fillStyle = 'rgba(255,255,255,0.25)'; a.beginPath(); a.moveTo(ix, iy); a.lineTo(ix + iw * 0.3, iy); a.lineTo(ix, iy + ih * 0.6); a.fill();
      a.strokeStyle = '#999'; a.lineWidth = 3; a.strokeRect(ix, iy, iw, ih); a.beginPath(); a.moveTo(ix + iw / 2, iy); a.lineTo(ix + iw / 2, iy + ih); a.stroke();
    } else if (row === 3) { // produce / grocery
      const [ix, iy, iw, ih] = inner(); darkInterior(ix, iy, iw, ih, '#ffe0a0');
      for (let k = 0; k < 7; k++) { a.fillStyle = '#c2a36e'; a.fillRect(ix + k * iw / 7 + 2, iy + ih * 0.62, iw / 7 - 4, ih * 0.36); a.fillStyle = rng.pick(['#d33', '#e83', '#ec2', '#5a2', '#8b4513', '#f5f0e0']); a.beginPath(); a.ellipse(ix + k * iw / 7 + iw / 14, iy + ih * 0.63, iw / 16, ih * 0.06, 0, 0, 7); a.fill(); }
      for (let k = 0; k < 3; k++) { a.fillStyle = '#d9b520'; for (let b = 0; b < 6; b++) { a.beginPath(); a.ellipse(ix + 30 + k * iw / 3 + (b % 2) * 8, iy + 18 + b * 7, 6, 3, 0.5, 0, 7); a.fill(); } } // bananas
    } else if (row === 4) { // colonial arcade
      a.fillStyle = '#efe6d4'; a.fillRect(x, y, cw, cellH);
      a.fillStyle = '#1e1a16'; a.beginPath(); const ax = x + cw * 0.12, aw = cw * 0.76; a.moveTo(ax, y + cellH); a.lineTo(ax, y + cellH * 0.45); a.arc(ax + aw / 2, y + cellH * 0.45, aw / 2, Math.PI, 0); a.lineTo(ax + aw, y + cellH); a.fill();
      e.fillStyle = '#f7d79a'; e.globalAlpha = 0.55; e.beginPath(); e.moveTo(ax + 10, y + cellH); e.lineTo(ax + 10, y + cellH * 0.5); e.arc(ax + aw / 2, y + cellH * 0.5, aw / 2 - 10, Math.PI, 0); e.lineTo(ax + aw - 10, y + cellH); e.fill(); e.globalAlpha = 1;
      a.fillStyle = '#d8ccb4'; a.fillRect(x, y, cw * 0.1, cellH); a.fillRect(x + cw * 0.9, y, cw * 0.1, cellH);
    } else if (row === 5) { // office lobby
      const [ix, iy, iw, ih] = inner(0.05); glassGrad(a, ix, iy, iw, ih, '#6a7f88', '#22323a'); e.fillStyle = '#c8d8e8'; e.globalAlpha = 0.6; e.fillRect(ix, iy, iw, ih); e.globalAlpha = 1;
      a.strokeStyle = '#bfc4c6'; a.lineWidth = 4; a.strokeRect(ix, iy, iw, ih); for (let k = 1; k < 4; k++) { a.beginPath(); a.moveTo(ix + k * iw / 4, iy); a.lineTo(ix + k * iw / 4, iy + ih); a.stroke(); }
    } else if (row === 6) { // compound wall + gate
      a.fillStyle = '#ece6d8'; a.fillRect(x, y + cellH * 0.45, cw, cellH * 0.55); a.fillStyle = '#7a9c66'; a.fillRect(x, y, cw, cellH * 0.45);
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
  return { map: toTex(A), emissive: toTex(E) };
}

// ----------------------------------------------------------------------------- signage atlas
// Trilingual (English / Sinhala / Tamil) shop signs, as commonly seen across Colombo.
export const SIGN_COLS = 4, SIGN_ROWS = 16;
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
];
function signAtlas(cw = 512) {
  const ch = cw / 4, W = cw * SIGN_COLS, H = ch * SIGN_ROWS;
  const A = canvas(W, H), E = canvas(W, H), a = A.getContext('2d'), e = E.getContext('2d'); const rng = new RNG(303);
  e.fillStyle = '#000'; e.fillRect(0, 0, W, H);
  const n = SIGN_COLS * SIGN_ROWS;
  for (let k = 0; k < n; k++) {
    const s = SIGNS[k % SIGNS.length]; const x = (k % SIGN_COLS) * cw, y = Math.floor(k / SIGN_COLS) * ch;
    const variant = Math.floor(k / SIGNS.length);
    a.save(); a.beginPath(); a.rect(x, y, cw, ch); a.clip();
    const bg = variant === 1 ? shade(s.bg, 0.8) : s.bg;
    const g = a.createLinearGradient(0, y, 0, y + ch); g.addColorStop(0, shade(bg, 1.15)); g.addColorStop(1, shade(bg, 0.85)); a.fillStyle = g; a.fillRect(x, y, cw, ch);
    a.strokeStyle = s.fg; a.globalAlpha = 0.6; a.lineWidth = cw * 0.008; a.strokeRect(x + cw * 0.012, y + ch * 0.06, cw * 0.976, ch * 0.88); a.globalAlpha = 1;
    a.fillStyle = s.fg; a.textAlign = 'center'; a.textBaseline = 'middle';
    a.font = `700 ${Math.floor(ch * 0.36)}px "Barlow Condensed", "Manrope", sans-serif`;
    a.fillText(s.en.toUpperCase(), x + cw / 2, y + ch * 0.36, cw * 0.92);
    a.font = `600 ${Math.floor(ch * 0.2)}px "Noto Sans Sinhala", sans-serif`;
    a.fillText(s.si, x + cw * 0.3, y + ch * 0.74, cw * 0.42);
    a.font = `600 ${Math.floor(ch * 0.17)}px "Noto Sans Tamil", sans-serif`;
    a.fillText(s.ta, x + cw * 0.72, y + ch * 0.74, cw * 0.42);
    a.font = `500 ${Math.floor(ch * 0.11)}px "Manrope", sans-serif`; a.globalAlpha = 0.7;
    a.fillText(`☎ 011 2${rng.int(100, 999)} ${rng.int(100, 999)}`, x + cw / 2, y + ch * 0.92); a.globalAlpha = 1;
    a.restore();
    grimeRect(a, x, y, cw, ch, rng);
    // illuminated signs (about half) glow at night
    if (k % 3 !== 2) { e.save(); e.globalAlpha = 0.85; e.drawImage(A, x, y, cw, ch, x, y, cw, ch); e.restore(); }
  }
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
  return toTex(c);
}
function corrugated(size, tone = '#9aa0a2', rust = true) {
  const c = canvas(size, size), ctx = c.getContext('2d');
  for (let x = 0; x < size; x += size / 32) { const g = ctx.createLinearGradient(x, 0, x + size / 32, 0); g.addColorStop(0, shade(tone, 1.2)); g.addColorStop(0.5, shade(tone, 0.7)); g.addColorStop(1, shade(tone, 1.2)); ctx.fillStyle = g; ctx.fillRect(x, 0, size / 32, size); }
  if (rust) grime(ctx, size, size, { scale: 5, amount: 0.5, seed: 71, color: [120, 60, 30], bias: -0.08 });
  return toTex(c);
}
function roofConcrete(size) {
  const t = concrete(size, '#8f8a80', 81, false); const ctx = t.image.getContext('2d');
  grime(ctx, size, size, { scale: 4, amount: 0.4, seed: 82, color: [40, 45, 35], bias: -0.05 });
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
function leafCluster(size, hues = ['#2f5a1e', '#3d6e26', '#4c7f2e', '#28501a', '#5c8c38']) {
  const c = canvas(size, size), ctx = c.getContext('2d'), rng = new RNG(121);
  for (let k = 0; k < 260; k++) {
    const a = rng.next() * Math.PI * 2, r = Math.sqrt(rng.next()) * size * 0.45; const x = size / 2 + Math.cos(a) * r, y = size / 2 + Math.sin(a) * r;
    ctx.fillStyle = rng.pick(hues); ctx.beginPath(); ctx.ellipse(x, y, rng.range(5, 10), rng.range(3, 5), rng.next() * 3, 0, 7); ctx.fill();
  }
  return toTex(c, { repeat: false });
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
export function faceTexture({ female = false, stubble = 0.0, size = 256, brow = '#1a1410', lips = '#8a4a40', seed = 1 } = {}) {
  const c = canvas(size * 2, size), ctx = c.getContext('2d');
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, size * 2, size);
  const fx = size * 1.5, ey = size * 0.47; // face centre column
  const S = size / 256;
  // soft shading for eye sockets
  for (const sx of [-1, 1]) { const g = ctx.createRadialGradient(fx + sx * 21 * S, ey, 2, fx + sx * 21 * S, ey, 22 * S); g.addColorStop(0, 'rgba(120,90,80,0.35)'); g.addColorStop(1, 'rgba(120,90,80,0)'); ctx.fillStyle = g; ctx.fillRect(fx + sx * 21 * S - 24 * S, ey - 24 * S, 48 * S, 48 * S); }
  for (const sx of [-1, 1]) {
    const x = fx + sx * 20 * S;
    ctx.fillStyle = '#f4efe8'; ctx.beginPath(); ctx.ellipse(x, ey, 9 * S, 4.6 * S, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#2a1a10'; ctx.beginPath(); ctx.arc(x, ey, 4.2 * S, 0, 7); ctx.fill();
    ctx.fillStyle = '#050505'; ctx.beginPath(); ctx.arc(x, ey, 2 * S, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.beginPath(); ctx.arc(x + 1.5 * S, ey - 1.5 * S, 1.1 * S, 0, 7); ctx.fill();
    ctx.strokeStyle = female ? '#0a0605' : 'rgba(30,18,12,0.8)'; ctx.lineWidth = (female ? 2.4 : 1.4) * S; ctx.beginPath(); ctx.ellipse(x, ey, 9.5 * S, 5 * S, 0, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke();
    ctx.fillStyle = brow; ctx.beginPath(); ctx.moveTo(x - 11 * S * sx * -1, ey - 11 * S); ctx.quadraticCurveTo(x, ey - (female ? 16 : 15) * S, x + 11 * S * sx, ey - (female ? 12 : 10) * S); ctx.lineTo(x + 11 * S * sx, ey - (female ? 10.5 : 8) * S); ctx.quadraticCurveTo(x, ey - (female ? 13.5 : 12) * S, x - 11 * S * sx * -1, ey - 9 * S); ctx.fill();
  }
  // nose shadow + lips
  ctx.fillStyle = 'rgba(110,70,55,0.35)'; ctx.beginPath(); ctx.ellipse(fx, ey + 24 * S, 7 * S, 3 * S, 0, 0, 7); ctx.fill();
  ctx.fillStyle = lips; ctx.beginPath(); ctx.moveTo(fx - 12 * S, ey + 38 * S); ctx.quadraticCurveTo(fx, ey + 33 * S, fx + 12 * S, ey + 38 * S); ctx.quadraticCurveTo(fx, ey + 45 * S, fx - 12 * S, ey + 38 * S); ctx.fill();
  ctx.strokeStyle = 'rgba(60,25,20,0.7)'; ctx.lineWidth = 1.2 * S; ctx.beginPath(); ctx.moveTo(fx - 12 * S, ey + 38 * S); ctx.quadraticCurveTo(fx, ey + 39 * S, fx + 12 * S, ey + 38 * S); ctx.stroke();
  if (female) { ctx.fillStyle = 'rgba(180,30,40,0.9)'; ctx.beginPath(); ctx.arc(fx, ey - 14 * S, 1.8 * S, 0, 7); ctx.fill(); } // pottu (worn by some)
  if (stubble > 0) {
    const rng = new RNG(seed);
    ctx.fillStyle = `rgba(25,18,14,${0.25 * stubble})`;
    ctx.beginPath(); ctx.ellipse(fx, ey + 48 * S, 34 * S, 26 * S, 0, 0, Math.PI); ctx.fill();
    ctx.beginPath(); ctx.ellipse(fx, ey + 33 * S, 15 * S, 4 * S, 0, 0, 7); ctx.fill();
    for (let k = 0; k < 500 * stubble; k++) { ctx.fillStyle = `rgba(20,14,10,${0.35 * stubble})`; const a = rng.range(0.1, Math.PI - 0.1), r = rng.range(14, 36) * S; ctx.fillRect(fx + Math.cos(a) * r, ey + 30 * S + Math.sin(a) * r * 0.8, 1, 1); }
  }
  grime(ctx, size * 2, size, { scale: 6, amount: 0.05, seed: 171 + seed });
  const t = toTex(c, { repeat: false }); t.wrapS = THREE.RepeatWrapping; return t;
}

// ----------------------------------------------------------------------------- build all
export async function buildTextures(quality = 'high', progress = () => {}) {
  const hi = quality === 'high' || quality === 'ultra';
  const FW = hi ? 1024 : 512, FH = FW / 2, S = hi ? 1024 : 512;
  const steps = [
    ['asphalt', () => { const a = asphalt(S); TEX.asphalt = a.map; TEX.asphaltRough = a.rough; }],
    ['pavers', () => { TEX.pavers = pavers(512); TEX.paversGrey = pavers(512, ['#8a8780', '#7d7a73', '#96928a', '#6f6c66'], 6); }],
    ['concrete', () => { TEX.concrete = concrete(512); TEX.roofConcrete = roofConcrete(512); }],
    ['grass', () => { TEX.grass = grass(512, 21, 0.3); TEX.lawn = grass(512, 22, 0.08); TEX.laterite = laterite(512); TEX.sand = sand(512); TEX.rocks = rocks(512); }],
    ['facades: colonial', () => { TEX.f_colonial = facadeColonial(FW, FH, 201); TEX.f_brick = facadeBrick(FW, FH, 202); }],
    ['facades: modern', () => { TEX.f_glass = facadeGlass(FW, FH, 203); TEX.f_glass2 = facadeGlass(FW, FH, 213, ['#8fa9b0', '#3c5560']); TEX.f_office = facadeOffice(FW, FH, 204); TEX.f_hotel = facadeHotel(FW, FH, 208); }],
    ['facades: shophouses', () => { TEX.f_shop = facadeShophouse(FW, FH, 205); TEX.f_shop2 = facadeShophouse(FW, FH, 215); TEX.f_apartment = facadeApartment(FW, FH, 206); }],
    ['facades: homes', () => { TEX.f_villa = facadeVilla(FW, FH, 207); TEX.f_warehouse = facadeWarehouse(FW / 2, FH / 2, 209); }],
    ['shopfronts', () => { TEX.shops = shopAtlas(hi ? 256 : 128); }],
    ['signage', () => { TEX.signs = signAtlas(hi ? 512 : 256); }],
    ['roofs', () => { TEX.roofTiles = roofTiles(512); TEX.corrugated = corrugated(256); TEX.corrugatedBlue = corrugated(256, '#5a7d9a', false); }],
    ['water & light', () => {
      TEX.waterNormal = waterNormal(256);
      TEX.glow = radial(128, [[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(255,255,255,0.5)'], [1, 'rgba(255,255,255,0)']]);
      TEX.pool = radial(128, [[0, 'rgba(255,255,255,0.9)'], [0.5, 'rgba(255,255,255,0.35)'], [1, 'rgba(255,255,255,0)']]);
    }],
    ['foliage', () => { TEX.palm = palmFrond(512); TEX.leaves = leafCluster(256); TEX.leavesBright = leafCluster(256, ['#4a7a2a', '#5f9236', '#6fa040', '#3e6a22', '#86b04e']); }],
    ['fabrics', () => { TEX.plaid = fabricPlaid(256); TEX.saree = fabricSaree(256); TEX.batik = fabricBatik(256); TEX.weave = fabricWeave(128); }],
  ];
  for (let i = 0; i < steps.length; i++) {
    progress(i / steps.length, steps[i][0]);
    steps[i][1]();
    await new Promise((r) => setTimeout(r, 0));
  }
  // facade wrappers → textures
  for (const k of Object.keys(TEX)) if (k.startsWith('f_') && TEX[k].albedo) {
    const f = TEX[k]; TEX[k] = { map: toTex(f.albedo), emissive: toTex(f.emis), rm: toTex(f.rm, { srgb: false }) };
  }
  progress(1, 'textures ready');
  return TEX;
}
