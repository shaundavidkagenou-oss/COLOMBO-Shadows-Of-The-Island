// Downloads the MakeHuman (MPFB2) CC0 assets that the hero-head bake needs into dev/mh-cache/ (git-ignored).
// Source: github.com/makehumancommunity/mpfb2 — the assets (base mesh, targets, rigs, textures) are CC0 1.0
// (see LICENSE.ASSETS.md in that repository). Only data files are fetched; none of MPFB's GPL program code is used.
// Usage: node tools/mh/fetch-makehuman.mjs   (needs the GitHub CLI `gh`, authenticated)
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFile } from 'node:child_process';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const OUT = path.join(ROOT, 'dev/mh-cache'); const REPO = 'makehumancommunity/mpfb2'; const BR = 'master';
// via the GitHub CLI (uses the sandbox/system certificate store and the existing gh login)
const api = (u) => new Promise((res, rej) => execFile('gh', ['api', u], { maxBuffer: 256 * 1024 * 1024 }, (e, out) => (e ? rej(e) : res(JSON.parse(out)))));
export const WANT = [
  '3dobjs/base.obj', 'mesh_metadata/basemesh_vertex_groups.json',
  ...['african', 'asian', 'caucasian'].map((e) => `targets/macrodetails/${e}-male-young.target.gz`),
  /^targets\/(expression|nose|mouth|chin|cheek|eyebrows|eyes|head|ears|forehead|neck)\//,
  'rigs/standard/weights.default.json', 'rigs/standard/rig.default.json',
  /^targets\/macrodetails\/universal-male-young-(average|max)muscle-(average|min)weight\.target\.gz$/,
  /^uv_layers\/(face_solid|lips_solid|eyelids_solid|scalp_solid|eyes_wide_solid)\.json\.gz$/,
];
const tree = (await api(`repos/${REPO}/git/trees/${BR}?recursive=1`)).tree.filter((e) => e.type === 'blob' && e.path.startsWith('src/mpfb/data/'));
const pick = tree.filter((e) => { const p = e.path.slice('src/mpfb/data/'.length); return WANT.some((w) => (typeof w === 'string' ? w === p : w.test(p))); });
let n = 0, bytes = 0;
const queue = [...pick]; const work = async () => { for (let e; (e = queue.shift());) {
  const rel = e.path.slice('src/mpfb/data/'.length); const dst = path.join(OUT, rel.replace(/\.gz$/, ''));
  if (fs.existsSync(dst)) { n++; continue; }
  const b = await api(`repos/${REPO}/git/blobs/${e.sha}`); let buf = Buffer.from(b.content, 'base64'); if (rel.endsWith('.gz')) buf = zlib.gunzipSync(buf);
  fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.writeFileSync(dst, buf); n++; bytes += buf.length;
} };
await Promise.all(Array.from({ length: 8 }, work));
fs.writeFileSync(path.join(OUT, 'SOURCE.txt'), `MakeHuman / MPFB2 assets (CC0 1.0 Universal), https://github.com/${REPO} (${BR}), fetched ${new Date().toISOString()}\n`);
console.log(`makehuman cache: ${n}/${pick.length} files in ${path.relative(ROOT, OUT)} (${(bytes / 1e6).toFixed(1)} MB new)`);
