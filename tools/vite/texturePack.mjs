// Texture pack (59th — the Texture Studio, src/debug/TextureStudio.js + src/debug/TexRuntime.js).
// The project folder `texture-pack/` holds the Studio's work as real files:
//   manifest.json          versioned manifest: texture library (content hashes, names, categories) + replacement rules
//   <sha256>.<ext>         the imported images, byte-for-byte as picked (png / jpg / webp / gif / avif / bmp / ktx2 / dds)
//   backups/               the previous manifest every time it is saved (last 30), so no save can lose earlier work
//   trash/                 texture files removed from the library (moved, never deleted)
// The folder is kept out of git (.gitignore) — large images do not belong in the repository; share them with the Studio's
// "Export pack (.zip)" or host them (manifest "asset base URL").
// This plugin
//   • dev server (`npm run dev`): serves the folder as /texture-pack/ (manifest.json — empty when there is none — and the
//     files) and accepts the Studio's saves (GET /__colombo/textures, PUT /__colombo/textures/manifest,
//     POST / DELETE /__colombo/textures/file/<hash>.<ext>), writing straight into the folder;
//   • production build (`npm run build`, build-exe.bat → the .exe): copies the manifest (without thumbnails) and every
//     texture an enabled rule uses into dist/texture-pack/, so every built copy starts with those replacements. The Studio
//     itself is not in that build (src/debug/boot.js TEXTURE_STUDIO).
import fs from 'node:fs';
import path from 'node:path';

const FILE = /^[0-9a-f]{16,64}\.(png|jpg|webp|gif|avif|bmp|ktx2|dds)$/;
const MIME = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', avif: 'image/avif', bmp: 'image/bmp', ktx2: 'image/ktx2', dds: 'application/octet-stream' };
const MAX_BYTES = 64 * 1024 * 1024;
const FORMAT = 'colombo.texture-manifest';
const empty = () => ({ format: FORMAT, version: 1, created: null, modified: null, assetBase: '', textures: {}, rules: {} });

export function readManifest(dir) { try { return JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')); } catch { return null; } }
export function packFiles(dir) { return fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => FILE.test(f)) : []; }
// what a build ships: enabled rules + the textures they use (thumbnails dropped)
export function buildManifest(m) {
  const out = { ...empty(), created: m.created || null, modified: m.modified || null, assetBase: m.assetBase || '' }; const used = new Set();
  for (const [k, r] of Object.entries(m.rules || {})) { if (!r || r.enabled === false) continue; out.rules[k] = r; for (const s of Object.values(r.slots || {})) if (s && s.tex) used.add(s.tex); }
  for (const h of used) { const t = m.textures && m.textures[h]; if (t) { const { thumb, ...rest } = t; void thumb; out.textures[h] = rest; } }
  return out;
}
async function body(req, limit) { const chunks = []; let n = 0; for await (const ch of req) { n += ch.length; if (n > limit) throw Object.assign(new Error('too big'), { status: 413 }); chunks.push(ch); } return Buffer.concat(chunks); }

export default function texturePack({ dir = 'texture-pack' } = {}) {
  let root = process.cwd(); const abs = () => path.resolve(root, dir);
  return {
    name: 'colombo-texture-pack',
    configResolved(c) { root = c.root; },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = decodeURIComponent((req.url || '').split('?')[0]); const D = abs();
        try {
          if (url === '/__colombo/textures' && req.method === 'GET') { res.setHeader('content-type', 'application/json'); res.setHeader('cache-control', 'no-cache'); res.end(JSON.stringify({ ok: true, folder: D, manifest: readManifest(D), files: packFiles(D) })); return; }
          if (url === '/__colombo/textures/manifest' && req.method === 'PUT') {
            const txt = (await body(req, 32 * 1024 * 1024)).toString('utf8'); const m = JSON.parse(txt);
            if (!m || m.format !== FORMAT || !(m.version >= 1) || typeof m.rules !== 'object' || typeof m.textures !== 'object') { res.statusCode = 400; res.end('not a texture manifest'); return; }
            fs.mkdirSync(D, { recursive: true }); const p = path.join(D, 'manifest.json');
            if (fs.existsSync(p)) { const B = path.join(D, 'backups'); fs.mkdirSync(B, { recursive: true }); fs.copyFileSync(p, path.join(B, 'manifest-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json'));
              const old = fs.readdirSync(B).filter((f) => f.startsWith('manifest-')).sort(); for (const f of old.slice(0, Math.max(0, old.length - 30))) fs.unlinkSync(path.join(B, f)); }
            fs.writeFileSync(p + '.tmp', JSON.stringify(m, null, 1) + '\n'); fs.renameSync(p + '.tmp', p); // atomic: a crash mid-write never leaves a broken manifest
            res.setHeader('content-type', 'application/json'); res.end('{"ok":true}'); return;
          }
          const fm = url.match(/^\/__colombo\/textures\/file\/([^/]+)$/);
          if (fm && (req.method === 'POST' || req.method === 'DELETE')) {
            const name = fm[1]; if (!FILE.test(name)) { res.statusCode = 400; res.end('bad file name'); return; } fs.mkdirSync(D, { recursive: true }); const p = path.join(D, name);
            if (req.method === 'DELETE') { if (fs.existsSync(p)) { const T = path.join(D, 'trash'); fs.mkdirSync(T, { recursive: true }); fs.renameSync(p, path.join(T, name)); } res.end('{"ok":true}'); return; }
            const buf = await body(req, MAX_BYTES); if (!fs.existsSync(p)) { fs.writeFileSync(p + '.tmp', buf); fs.renameSync(p + '.tmp', p); } // content-addressed: an existing file is identical
            res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ ok: true, file: name, bytes: buf.length })); return;
          }
          if (url === '/texture-pack/manifest.json') { res.setHeader('content-type', 'application/json'); res.setHeader('cache-control', 'no-cache'); res.end(JSON.stringify(readManifest(D) || empty())); return; }
          const f = url.match(/^\/texture-pack\/([^/]+)$/);
          if (f && FILE.test(f[1])) { const p = path.join(D, f[1]); if (fs.existsSync(p)) { res.setHeader('content-type', MIME[f[1].split('.').pop()]); res.setHeader('cache-control', 'no-cache'); fs.createReadStream(p).pipe(res); return; } res.statusCode = 404; res.end(); return; }
        } catch (e) { res.statusCode = e.status || 500; res.end(String((e && e.message) || e)); return; }
        next();
      });
    },
    generateBundle() {
      const D = abs(); const m = readManifest(D); if (!m || m.format !== FORMAT) return;
      const out = buildManifest(m); const files = new Set(packFiles(D)); const missing = [];
      for (const [h, t] of Object.entries(out.textures)) { const name = h + '.' + t.ext; if (files.has(name)) this.emitFile({ type: 'asset', fileName: 'texture-pack/' + name, source: fs.readFileSync(path.join(D, name)) }); else missing.push(name); }
      this.emitFile({ type: 'asset', fileName: 'texture-pack/manifest.json', source: JSON.stringify(out) });
      const n = Object.keys(out.rules).length; if (n) console.log(`\n[texture pack] ${n} replacement rule(s), ${Object.keys(out.textures).length - missing.length} texture file(s) from ${dir}/ built into the game`);
      if (missing.length) console.warn(`[texture pack] ${missing.length} texture(s) not in ${dir}/ — the game loads them from the asset base URL (${out.assetBase || 'none set!'}): ${missing.join(', ')}`);
    },
  };
}
