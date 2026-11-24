// Model pack (68th — model tools: models-weapons / model-player / model-vehicles / model-npc, uploaded map models, imported
// animations, created textures). The project folder `model-pack/` holds that work as real files:
//   manifest.json          versioned document (colombo.model-manifest): file library + every override (map objects, weapons,
//                          heroes, vehicles, NPCs, animation clips, material / texture edits)
//   <sha256>.<ext>         uploaded files byte-for-byte (models: glb gltf bin obj mtl fbx stl ply dae 3mf usdz; animations: bvh;
//                          images: png jpg webp gif avif bmp tga ktx2)
//   backups/               the previous manifest on every save (last 40) — no save can lose earlier work
//   trash/                 files removed from the library (moved, never deleted)
// The folder stays out of git (.gitignore), like texture-pack/: large binaries do not belong in the repository.
// This plugin
//   • dev server (npm run dev): serves /model-pack/ and accepts the tools' saves (GET /__colombo/models, PUT
//     /__colombo/models/manifest, POST / DELETE /__colombo/models/file/<name>) straight into the folder;
//   • production build (npm run build, build-exe.bat → the .exe): copies the manifest and every file it references into
//     dist/model-pack/, so every built copy starts with the edits. The tools themselves are not in that build.
//   • dev lock (console `DoneShaun$123$`): dev-lock.json in the project root. While it says locked, builds are made with the
//     console + Texture Studio hidden (__COLOMBO_DEVLOCK__ = true); only the secret code typed in the game shows them again.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const MODEL_EXT = ['glb', 'gltf', 'bin', 'obj', 'mtl', 'fbx', 'stl', 'ply', 'dae', '3mf', 'usdz', 'bvh', 'png', 'jpg', 'webp', 'gif', 'avif', 'bmp', 'tga', 'ktx2'];
const FILE = new RegExp('^[0-9a-f]{16,64}\\.(' + MODEL_EXT.join('|') + ')$');
export const MIME = { glb: 'model/gltf-binary', gltf: 'model/gltf+json', bin: 'application/octet-stream', obj: 'text/plain', mtl: 'text/plain', fbx: 'application/octet-stream', stl: 'model/stl', ply: 'application/octet-stream', dae: 'model/vnd.collada+xml', '3mf': 'application/vnd.ms-package.3dmanufacturing-3dmodel+xml', usdz: 'model/vnd.usdz+zip', bvh: 'text/plain', png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', avif: 'image/avif', bmp: 'image/bmp', tga: 'image/x-tga', ktx2: 'image/ktx2' };
const MAX_BYTES = 256 * 1024 * 1024;
export const FORMAT = 'colombo.model-manifest';
export const emptyManifest = () => ({ format: FORMAT, version: 1, created: null, modified: null, files: {}, map: null, weapons: {}, heroes: {}, vehicles: {}, npcs: { rules: [] }, anims: {}, textures: {}, objects: {} });

export function readManifest(dir) { try { return JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')); } catch { return null; } }
export function packFiles(dir) { return fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => FILE.test(f)) : []; }
// every "<hash>.<ext>" string anywhere in the document = a file the game needs
export function referencedFiles(m) { const out = new Set(); const walk = (v) => { if (typeof v === 'string') { if (FILE.test(v)) out.add(v); } else if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { if (FILE.test(k)) out.add(k); walk(x); } }; walk(m); return out; }
// what a build ships: the document without editor-only data (thumbnails)
export function buildManifest(m) { const out = JSON.parse(JSON.stringify(m)); for (const f of Object.values(out.files || {})) if (f) delete f.thumb; for (const t of Object.values(out.textures || {})) if (t) delete t.thumb; return out; }
export function readLock(root) { try { const j = JSON.parse(fs.readFileSync(path.join(root, 'dev-lock.json'), 'utf8')); return !!(j && j.locked); } catch { return false; } }
export async function body(req, limit) { const chunks = []; let n = 0; for await (const ch of req) { n += ch.length; if (n > limit) throw Object.assign(new Error('too big'), { status: 413 }); chunks.push(ch); } return Buffer.concat(chunks); }
export const json = (res, o) => { res.setHeader('content-type', 'application/json'); res.setHeader('cache-control', 'no-cache'); res.end(JSON.stringify(o)); };

export default function modelPack({ dir = 'model-pack' } = {}) {
  let root = process.cwd(); const abs = () => path.resolve(root, dir);
  return {
    name: 'colombo-model-pack',
    config(c) { const r = c.root ? path.resolve(c.root) : process.cwd(); return { define: { __COLOMBO_DEVLOCK__: JSON.stringify(readLock(r)) } }; },
    configResolved(c) { root = c.root; },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = decodeURIComponent((req.url || '').split('?')[0]); const D = abs();
        try {
          if (url === '/__colombo/devlock') {
            const p = path.join(root, 'dev-lock.json');
            if (req.method === 'POST') { const j = JSON.parse((await body(req, 4096)).toString('utf8') || '{}'); if (j.locked) fs.writeFileSync(p, JSON.stringify({ locked: true, at: new Date().toISOString(), note: 'console + Texture Studio hidden (DoneShaun$123$). Delete this file or type the secret code in the game to show them again.' }, null, 1) + '\n'); else if (fs.existsSync(p)) fs.unlinkSync(p); json(res, { ok: true, locked: readLock(root) }); return; }
            json(res, { ok: true, locked: readLock(root) }); return;
          }
          if (url === '/__colombo/models' && req.method === 'GET') { json(res, { ok: true, folder: D, manifest: readManifest(D), files: packFiles(D) }); return; }
          if (url === '/__colombo/models/manifest' && req.method === 'PUT') {
            const m = JSON.parse((await body(req, 64 * 1024 * 1024)).toString('utf8'));
            if (!m || m.format !== FORMAT || !(m.version >= 1) || typeof m.files !== 'object') { res.statusCode = 400; res.end('not a model manifest'); return; }
            fs.mkdirSync(D, { recursive: true }); const p = path.join(D, 'manifest.json');
            if (fs.existsSync(p)) { const B = path.join(D, 'backups'); fs.mkdirSync(B, { recursive: true }); fs.copyFileSync(p, path.join(B, 'manifest-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json'));
              const old = fs.readdirSync(B).filter((f) => f.startsWith('manifest-')).sort(); for (const f of old.slice(0, Math.max(0, old.length - 40))) fs.unlinkSync(path.join(B, f)); }
            fs.writeFileSync(p + '.tmp', JSON.stringify(m, null, 1) + '\n'); fs.renameSync(p + '.tmp', p); // atomic
            json(res, { ok: true }); return;
          }
          const fm = url.match(/^\/__colombo\/models\/file\/([^/]+)$/);
          if (fm && (req.method === 'POST' || req.method === 'DELETE')) {
            const name = fm[1]; if (!FILE.test(name)) { res.statusCode = 400; res.end('bad file name'); return; } fs.mkdirSync(D, { recursive: true }); const p = path.join(D, name);
            if (req.method === 'DELETE') { if (fs.existsSync(p)) { const T = path.join(D, 'trash'); fs.mkdirSync(T, { recursive: true }); fs.renameSync(p, path.join(T, name)); } json(res, { ok: true }); return; }
            const buf = await body(req, MAX_BYTES); const hex = name.split('.')[0]; if (!crypto.createHash('sha256').update(buf).digest('hex').startsWith(hex)) { res.statusCode = 400; res.end('content does not match its name (sha256)'); return; } if (!fs.existsSync(p)) { fs.writeFileSync(p + '.tmp', buf); fs.renameSync(p + '.tmp', p); } // content-addressed: an existing file is identical
            json(res, { ok: true, file: name, bytes: buf.length }); return;
          }
          if (url === '/model-pack/manifest.json') { json(res, readManifest(D) || emptyManifest()); return; }
          const f = url.match(/^\/model-pack\/([^/]+)$/);
          if (f && FILE.test(f[1])) { const p = path.join(D, f[1]); if (fs.existsSync(p)) { res.setHeader('content-type', MIME[f[1].split('.').pop()] || 'application/octet-stream'); res.setHeader('cache-control', 'no-cache'); fs.createReadStream(p).pipe(res); return; } res.statusCode = 404; res.end(); return; }
        } catch (e) { res.statusCode = e.status || 500; res.end(String((e && e.message) || e)); return; }
        next();
      });
    },
    generateBundle() {
      const D = abs(); const m = readManifest(D); if (!m || m.format !== FORMAT) return;
      const out = buildManifest(m); const files = new Set(packFiles(D)); const need = referencedFiles(out); const missing = []; let n = 0;
      for (const name of need) { if (files.has(name)) { this.emitFile({ type: 'asset', fileName: 'model-pack/' + name, source: fs.readFileSync(path.join(D, name)) }); n++; } else missing.push(name); }
      this.emitFile({ type: 'asset', fileName: 'model-pack/manifest.json', source: JSON.stringify(out) });
      console.log(`\n[model pack] manifest + ${n} file(s) from ${dir}/ built into the game`);
      if (missing.length) console.warn(`[model pack] ${missing.length} referenced file(s) missing from ${dir}/: ${missing.slice(0, 12).join(', ')}`);
      if (readLock(root)) console.log('[dev lock] dev-lock.json says locked: this build hides the console and the Texture Studio (secret code shows them)');
    },
  };
}
