// 83rd: build the 2048² master textures (src/gfx/Tex2K.js) → PNG → KTX2 / Basis Universal (public/assets/tex2k/*.ktx2).
// Colour maps: ETC1S (quality 255, mipmaps, sRGB). Normal / data maps: UASTC level 2 + RDO + Zstandard, linear, mipmaps.
// Previews (512²) go to dev/tmp/tex83/ for inspection. Needs the basisu encoder: BASISU=<path> or the `basisu` npm package (prebuilt binaries).
//   node tools/tex2k-build.mjs [key,key...] [--png-only]
import { writeFileSync, mkdirSync, statSync, existsSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { TEX2K } from '../src/gfx/Tex2K.js';

const OUT = 'public/assets/tex2k', TMP = '/tmp/tex2k', PREV = 'dev/tmp/tex83'; for (const d of [OUT, TMP, PREV]) mkdirSync(d, { recursive: true });
const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc = (b) => { let c = -1; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
function png(path, w, h, rgba, scale = 1) {
  if (scale > 1) { const W = w / scale, H = h / scale, d = new Uint8Array(W * H * 4); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) for (let c = 0; c < 4; c++) { let s = 0; for (let j = 0; j < scale; j++) for (let i = 0; i < scale; i++) s += rgba[((y * scale + j) * w + x * scale + i) * 4 + c]; d[(y * W + x) * 4 + c] = s / (scale * scale); } rgba = d; w = W; h = H; }
  const raw = Buffer.alloc((w * 4 + 1) * h); for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1); }
  const chunk = (t, d) => { const len = Buffer.alloc(4); len.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 6;
  writeFileSync(path, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', deflateSync(raw, { level: 4 })), chunk('IEND', Buffer.alloc(0))]));
}
function basisuBin() { if (process.env.BASISU && existsSync(process.env.BASISU)) return process.env.BASISU; const req = createRequire(import.meta.url); let dir; try { dir = req.resolve('basisu/package.json').replace(/package\.json$/, ''); } catch { return null; }
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64'; const p = `${dir}bin/${process.platform === 'win32' ? 'win' : process.platform === 'darwin' ? 'darwin' : 'linux'}/${arch}/basisu${process.platform === 'win32' ? '.exe' : ''}`; return existsSync(p) ? p : null; }
const only = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2].split(',') : null; const pngOnly = process.argv.includes('--png-only');
const bin = pngOnly ? null : basisuBin(); if (!pngOnly && !bin) { console.error('basisu encoder not found: set BASISU=/path/to/basisu (from `npm pack basisu`) or npm i -D basisu'); process.exit(1); }
const manifest = {};
for (const [key, spec] of Object.entries(TEX2K)) { if (only && !only.includes(key)) continue; if (!only && spec.ship === false && !process.argv.includes('--all')) continue; // only atlases a material uses
  const t0 = performance.now(); const s = spec.gen(2048); const t1 = performance.now();
  const p = `${TMP}/${key}.png`; png(p, s.w, s.h, s.rgba); png(`${PREV}/${key}.png`, s.w, s.h, s.rgba, 4);
  { const c = new Uint8Array(512 * 512 * 4); for (let y = 0; y < 512; y++) c.set(s.rgba.subarray((y * s.w) * 4, (y * s.w + 512) * 4), y * 512 * 4); png(`${PREV}/${key}-crop.png`, 512, 512, c); }
  let bytes = 0;
  if (bin) { const out = `${OUT}/${key}.ktx2`;
    const args = spec.srgb ? ['-ktx2', '-mipmap', '-q', '255', '-comp_level', '2'] : ['-ktx2', '-mipmap', '-uastc', '-uastc_level', '2', '-uastc_rdo_l', '1.5', '-linear', '-mip_linear'];
    if (spec.srgb) args.push('-mip_srgb'); execFileSync(bin, [...args, '-file', p, '-output_file', out], { stdio: 'pipe' }); bytes = statSync(out).size; }
  manifest[key] = { size: 2048, srgb: !!spec.srgb, alpha: !!spec.alpha, codec: spec.srgb ? 'ETC1S' : 'UASTC+RDO+zstd', bytes };
  console.log(`${key.padEnd(8)} gen ${(t1 - t0).toFixed(0)} ms  ${bytes ? (bytes / 1024).toFixed(0) + ' KB ktx2' : '(png only)'}`);
}
if (!only && !pngOnly) writeFileSync(`${OUT}/manifest.json`, JSON.stringify(manifest, null, 1));
