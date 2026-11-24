// 62nd — run by build-exe.bat before the game build: makes sure everything the Texture Studio saved is in texture-pack/
// and says what will be compiled into the game / the .exe.
//   • a Studio pack zip dropped into texture-pack/ (the Studio's "Export pack (.zip)", or its Save when the browser could not
//     write into a folder) is unpacked when it is newer than texture-pack/manifest.json: manifest.json (the old one goes to
//     backups/) and the texture files (out of the zip's textures/ folder, flattened);
//   • texture files a hand-unzipped pack left in texture-pack/textures/ are moved up next to the manifest;
//   • prints the rules / texture files the build takes, and any texture an enabled rule uses that is not in the folder.
// Exit code 0 always (no pack = the game's own textures); `node tools/texture-pack-prep.mjs [dir]`.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { readManifest, packFiles, buildManifest } from './vite/texturePack.mjs';

const D = path.resolve(process.argv[2] || fileURLToPath(new URL('../texture-pack/', import.meta.url)));
const FILE = /^[0-9a-f]{16,64}\.(png|jpg|webp|gif|avif|bmp|ktx2|dds)$/;
const say = (s) => console.log('      ' + s);

export function readZip(buf) { // → Map(name → Buffer); stored or deflated entries
  let e = -1; for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { e = i; break; }
  if (e < 0) throw new Error('not a zip file'); const n = buf.readUInt16LE(e + 10); let p = buf.readUInt32LE(e + 16); const out = new Map();
  for (let k = 0; k < n; k++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('broken zip directory');
    const method = buf.readUInt16LE(p + 10), csz = buf.readUInt32LE(p + 20), nl = buf.readUInt16LE(p + 28), xl = buf.readUInt16LE(p + 30), cl = buf.readUInt16LE(p + 32), lo = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nl).toString('utf8'); p += 46 + nl + xl + cl; if (name.endsWith('/')) continue;
    const ds = lo + 30 + buf.readUInt16LE(lo + 26) + buf.readUInt16LE(lo + 28); const raw = buf.subarray(ds, ds + csz);
    if (method === 0) out.set(name, Buffer.from(raw)); else if (method === 8) out.set(name, zlib.inflateRawSync(raw)); else throw new Error('unsupported compression in ' + name);
  }
  return out;
}
function backup(dir) { const p = path.join(dir, 'manifest.json'); if (!fs.existsSync(p)) return; const B = path.join(dir, 'backups'); fs.mkdirSync(B, { recursive: true }); fs.copyFileSync(p, path.join(B, 'manifest-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json')); }

export function prep(dir = D) {
  const res = { unpacked: null, moved: 0, rules: 0, textures: 0, missing: [] };
  if (!fs.existsSync(dir)) return res;
  const mp = path.join(dir, 'manifest.json'); const mt = fs.existsSync(mp) ? fs.statSync(mp).mtimeMs : 0;
  const zips = fs.readdirSync(dir).filter((f) => /\.zip$/i.test(f)).map((f) => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs })).sort((a, b) => b.t - a.t);
  if (zips.length && zips[0].t > mt) {
    const z = zips[0]; const files = readZip(fs.readFileSync(path.join(dir, z.f)));
    const mf = files.get('manifest.json') || [...files.entries()].find(([n]) => n.endsWith('/manifest.json'))?.[1];
    if (mf) { const m = JSON.parse(mf.toString('utf8')); if (m && m.format === 'colombo.texture-manifest') {
      for (const [n, b] of files) { const base = n.split('/').pop(); if (FILE.test(base) && !fs.existsSync(path.join(dir, base))) fs.writeFileSync(path.join(dir, base), b); }
      backup(dir); fs.writeFileSync(mp + '.tmp', JSON.stringify(m, null, 1) + '\n'); fs.renameSync(mp + '.tmp', mp); res.unpacked = z.f; } }
  }
  const sub = path.join(dir, 'textures'); if (fs.existsSync(sub)) for (const f of fs.readdirSync(sub)) if (FILE.test(f)) { const to = path.join(dir, f); if (!fs.existsSync(to)) { fs.renameSync(path.join(sub, f), to); res.moved++; } }
  const m = readManifest(dir); if (!m || m.format !== 'colombo.texture-manifest') return res;
  const out = buildManifest(m); const have = new Set(packFiles(dir));
  res.rules = Object.keys(out.rules).length; for (const [h, t] of Object.entries(out.textures)) { if (have.has(h + '.' + t.ext)) res.textures++; else res.missing.push(h + '.' + t.ext); }
  return res;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let r; try { r = prep(); } catch (e) { say('[!] texture-pack: ' + (e.message || e)); process.exit(0); }
  if (r.unpacked) say('Unpacked the Texture Studio pack ' + r.unpacked + ' into texture-pack\\');
  if (r.moved) say('Moved ' + r.moved + ' texture file(s) out of texture-pack\\textures\\');
  if (r.rules) say('Including ' + r.rules + ' Texture Studio replacement(s) and ' + r.textures + ' texture file(s) from texture-pack\\');
  else say('No Texture Studio replacements in texture-pack\\ - the game\'s own textures are used.');
  if (r.missing.length) say('[!] ' + r.missing.length + ' texture file(s) used by the replacements are not in texture-pack\\ (re-save in the Texture Studio): ' + r.missing.slice(0, 6).join(', '));
}
