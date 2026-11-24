// 79th: objective image metrics for lighting work (no image libraries: a small PNG decoder on zlib).
//   node tools/img-stats.mjs a.png [b.png …]   → per image: mean luma, p5 / p50 / p95, clipped (≥ 250) and crushed (≤ 5) shares,
//   local contrast (mean |luma − 9×9 box mean|), saturation and the luma spread between the image's left / right / top /
//   bottom thirds (how differently lit the parts of the frame are). Luma in display sRGB 0–255.
import fs from 'fs';
import zlib from 'zlib';

export function decodePNG(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a png');
  let o = 8, w = 0, h = 0, bd = 0, ct = 0; const idat = [];
  while (o < buf.length) { const len = buf.readUInt32BE(o), type = buf.toString('ascii', o + 4, o + 8), d = buf.subarray(o + 8, o + 8 + len);
    if (type === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); bd = d[8]; ct = d[9]; if (d[12]) throw new Error('interlaced png'); }
    else if (type === 'IDAT') idat.push(d); else if (type === 'IEND') break; o += 12 + len; }
  if (bd !== 8) throw new Error('bit depth ' + bd); const ch = { 2: 3, 6: 4, 0: 1, 4: 2 }[ct]; if (!ch) throw new Error('colour type ' + ct);
  const raw = zlib.inflateSync(Buffer.concat(idat)), stride = w * ch, out = new Uint8Array(w * h * 4); let prev = new Uint8Array(stride), cur = new Uint8Array(stride);
  for (let y = 0; y < h; y++) { const f = raw[y * (stride + 1)], row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) { const a = i >= ch ? cur[i - ch] : 0, b = prev[i], c = i >= ch ? prev[i - ch] : 0; let v = row[i];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1; else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      cur[i] = v & 255; }
    for (let x = 0; x < w; x++) { const s = x * ch, d = (y * w + x) * 4; if (ch >= 3) { out[d] = cur[s]; out[d + 1] = cur[s + 1]; out[d + 2] = cur[s + 2]; } else { out[d] = out[d + 1] = out[d + 2] = cur[s]; } out[d + 3] = 255; }
    const t = prev; prev = cur; cur = t; }
  return { w, h, rgba: out };
}
export function stats({ w, h, rgba }) {
  const Y = new Float32Array(w * h); let sat = 0;
  for (let i = 0; i < w * h; i++) { const r = rgba[i * 4], g = rgba[i * 4 + 1], b = rgba[i * 4 + 2]; Y[i] = 0.2126 * r + 0.7152 * g + 0.0722 * b; const mx = Math.max(r, g, b), mn = Math.min(r, g, b); sat += mx > 0 ? (mx - mn) / mx : 0; }
  const s = Float32Array.from(Y).sort(), q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  let clip = 0, crush = 0, sum = 0; for (const v of Y) { sum += v; if (v >= 250) clip++; if (v <= 5) crush++; }
  // local contrast on a 4× downsample (9×9 box there ≈ 36 px here)
  const W = w >> 2, H = h >> 2, D = new Float32Array(W * H); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let a = 0; for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) a += Y[(y * 4 + j) * w + x * 4 + i]; D[y * W + x] = a / 16; }
  let lc = 0, n = 0; for (let y = 4; y < H - 4; y++) for (let x = 4; x < W - 4; x++) { let a = 0; for (let j = -4; j <= 4; j++) for (let i = -4; i <= 4; i++) a += D[(y + j) * W + x + i]; lc += Math.abs(D[y * W + x] - a / 81); n++; }
  const third = (x0, x1, y0, y1) => { let a = 0, c = 0; for (let y = Math.floor(y0 * h); y < y1 * h; y++) for (let x = Math.floor(x0 * w); x < x1 * w; x++) { a += Y[y * w + x]; c++; } return a / c; };
  const parts = [third(0, 1 / 3, 0, 1), third(2 / 3, 1, 0, 1), third(0, 1, 0, 1 / 3), third(0, 1, 2 / 3, 1)];
  return { mean: +(sum / Y.length).toFixed(1), p5: +q(0.05).toFixed(0), p50: +q(0.5).toFixed(0), p95: +q(0.95).toFixed(0), clip: +(100 * clip / Y.length).toFixed(2), crush: +(100 * crush / Y.length).toFixed(2), localC: +(lc / n).toFixed(2), sat: +(sat / (w * h)).toFixed(3), spread: +(Math.max(...parts) - Math.min(...parts)).toFixed(1) };
}
if (process.argv[1] && process.argv[1].endsWith('img-stats.mjs')) {
  for (const f of process.argv.slice(2)) { try { console.log(f.split('/').pop().padEnd(34), JSON.stringify(stats(decodePNG(fs.readFileSync(f))))); } catch (e) { console.log(f, 'ERR', e.message); } }
}
