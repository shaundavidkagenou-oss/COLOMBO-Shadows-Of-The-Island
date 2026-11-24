// Texture Studio packs: a plain .zip (manifest.json + textures/<hash>.<ext>) — written uncompressed (images are already
// compressed), read back stored or deflated (any zip tool can re-pack it). Used by the Studio's Export / Import pack.
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
export function crc32(u8) { let c = 0xffffffff; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function dosTime(d) { return { time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate() }; }
// files: [{ name, data: Uint8Array }] → Blob (application/zip)
export function writeZip(files) {
  const enc = new TextEncoder(); const parts = []; const central = []; let off = 0; const { time, date } = dosTime(new Date());
  for (const f of files) {
    const name = enc.encode(f.name); const data = f.data; const crc = crc32(data);
    const lh = new DataView(new ArrayBuffer(30)); lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true); lh.setUint16(10, time, true); lh.setUint16(12, date, true); lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
    parts.push(new Uint8Array(lh.buffer), name, data);
    const ch = new DataView(new ArrayBuffer(46)); ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true); ch.setUint16(12, time, true); ch.setUint16(14, date, true); ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, name.length, true); ch.setUint32(42, off, true);
    central.push(new Uint8Array(ch.buffer), name); off += 30 + name.length + data.length;
  }
  const csize = central.reduce((n, p) => n + p.length, 0); const end = new DataView(new ArrayBuffer(22)); end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, csize, true); end.setUint32(16, off, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: 'application/zip' });
}
// Blob/ArrayBuffer → Map(name → Blob)
export async function readZip(input) {
  const buf = input instanceof ArrayBuffer ? input : await input.arrayBuffer(); const v = new DataView(buf); const u = new Uint8Array(buf); const dec = new TextDecoder();
  let e = -1; for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 65557); i--) if (v.getUint32(i, true) === 0x06054b50) { e = i; break; }
  if (e < 0) throw new Error('not a zip file'); const n = v.getUint16(e + 10, true); let p = v.getUint32(e + 16, true); const out = new Map();
  for (let k = 0; k < n; k++) {
    if (v.getUint32(p, true) !== 0x02014b50) throw new Error('broken zip directory'); const method = v.getUint16(p + 10, true), csz = v.getUint32(p + 20, true), nl = v.getUint16(p + 28, true), xl = v.getUint16(p + 30, true), cl = v.getUint16(p + 32, true), lo = v.getUint32(p + 42, true);
    const name = dec.decode(u.subarray(p + 46, p + 46 + nl)); p += 46 + nl + xl + cl; if (name.endsWith('/')) continue;
    const ds = lo + 30 + v.getUint16(lo + 26, true) + v.getUint16(lo + 28, true); const raw = u.slice(ds, ds + csz);
    if (method === 0) out.set(name, new Blob([raw]));
    else if (method === 8) { if (typeof DecompressionStream !== 'function') throw new Error('this browser cannot read compressed zips — re-pack without compression'); out.set(name, await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).blob()); }
    else throw new Error('unsupported zip compression in ' + name);
  }
  return out;
}
