// 77th: benchmark the bank's 2048² surface generators (src/world/BankTex2K.js) in Node and write them out as PNGs
// (dev/tmp/tex77/<key>.png, plus <key>-n.png normal maps) for inspection. Checks: size, tiling (edge continuity), mean colour,
// time per texture.  Usage: node tools/bank-tex2k-test.mjs [key,key…] [--crop]
import { BANK_SURFACES, normalMap } from '../src/world/BankTex2K.js';
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
const OUT = 'dev/tmp/tex77'; mkdirSync(OUT, { recursive: true });
const crc = (() => { const T = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; T[n] = c; } return (b) => { let c = -1; for (let i = 0; i < b.length; i++) c = T[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; }; })();
function png(path, w, h, rgba, scale = 1) { // optional box downscale for a preview
  if (scale > 1) { const W = w / scale, H = h / scale, d = new Uint8Array(W * H * 4); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) for (let c = 0; c < 4; c++) { let s = 0; for (let j = 0; j < scale; j++) for (let i = 0; i < scale; i++) s += rgba[((y * scale + j) * w + x * scale + i) * 4 + c]; d[(y * W + x) * 4 + c] = s / (scale * scale); } rgba = d; w = W; h = H; }
  const raw = Buffer.alloc((w * 4 + 1) * h); for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1); }
  const chunk = (t, d) => { const len = Buffer.alloc(4); len.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 6; ih[10] = 0; ih[11] = 0; ih[12] = 0;
  writeFileSync(path, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', deflateSync(raw, { level: 3 })), chunk('IEND', Buffer.alloc(0))]));
}
const only = (process.argv[2] && !process.argv[2].startsWith('--')) ? process.argv[2].split(',') : null; const crop = process.argv.includes('--crop');
let fails = 0, total = 0;
for (const [key, gen] of Object.entries(BANK_SURFACES)) { if (only && !only.includes(key)) continue;
  const t0 = performance.now(); const s = gen(); let t1 = performance.now(); let n = null; if (s.height) { n = normalMap(s.height, s.w, s.h, s.nScale || 1); } const t2 = performance.now(); total += t2 - t0;
  const D = s.rgba, W = s.w, H = s.h; let m = [0, 0, 0]; for (let i = 0; i < D.length; i += 4) { m[0] += D[i]; m[1] += D[i + 1]; m[2] += D[i + 2]; } m = m.map((v) => Math.round(v / (W * H)));
  // tiling: mean abs difference across the wrap seam vs across an interior line (a seam should look like any other line)
  const diff = (x0, x1) => { let d = 0; for (let y = 0; y < H; y++) for (let c = 0; c < 3; c++) d += Math.abs(D[(y * W + x0) * 4 + c] - D[(y * W + x1) * 4 + c]); return d / (H * 3); };
  const seam = diff(W - 1, 0), inner = diff(W / 2 - 1, W / 2); const edged = key === 'cmbCeil'; /* one ceiling tile per texture: its grid tee + bevel are meant to sit on the edges */ const ok = W === 2048 && H === 2048 && (edged || seam < inner * 2.5 + 2); if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${key.padEnd(16)} ${W}x${H} mean ${m.join(',').padEnd(12)} seam ${seam.toFixed(1)} vs ${inner.toFixed(1)}  ${(t1 - t0).toFixed(0)} ms${n ? ` + normal ${n.w}² ${(t2 - t1).toFixed(0)} ms` : ''}`);
  png(`${OUT}/${key}.png`, W, H, D, 4); if (crop) { const c = new Uint8ClampedArray(512 * 512 * 4); for (let y = 0; y < 512; y++) c.set(D.subarray((y * W) * 4, (y * W + 512) * 4), y * 512 * 4); png(`${OUT}/${key}-crop.png`, 512, 512, c); }
  if (n) png(`${OUT}/${key}-n.png`, n.w, n.h, n.rgba, 2);
}
console.log(`total ${total.toFixed(0)} ms, ${fails} failed`); process.exit(fails ? 1 : 0);
