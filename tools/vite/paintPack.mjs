// Environment editor project folder (console `paint`, src/debug/PaintEditor.js) — paint-pack/ next to model-pack/:
//   project.json  assets/<sha256>.<ext>  backups/  trash/  compiled/{scene.json, report.json}   (format: src/debug/PaintFormat.js)
// This plugin
//   • dev server (npm run dev): GET /__colombo/paint (project + file list + last compile report), PUT /__colombo/paint/project
//     (atomic write, previous copy into backups/), POST / DELETE /__colombo/paint/file/<sha256>.<ext> (sha-checked; deletes go to
//     trash/), POST /__colombo/paint/compile (validate → compiled/scene.json + report; { build: true } also runs `vite build` and
//     checks dist/paint-pack), GET /__colombo/paint/build (that build's progress); serves /paint-pack/scene.json (the saved
//     project compiled on the fly, so the game in dev shows exactly what was saved) and /paint-pack/assets/<file>;
//   • production build (npm run build, build-exe.bat → the .exe): compiles the saved project and emits dist/paint-pack/scene.json
//     plus every file it references. tools/paint-pack-prep.mjs (build-exe.bat) runs the same compile first and stops the .exe
//     build with a clear report when something is missing.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { body, json, MIME } from './modelPack.mjs';
import { PROJECT_FORMAT, FILE_RE, extOf, glbJSON, compileProject, normalizeProject, projectFiles } from '../../src/debug/PaintFormat.js';

const MAX_FILE = 512 * 1024 * 1024;
const SHA = new Map(); // file → { m: mtime, s: size, ok }  (content checks are cached until the file changes)
export function readProject(dir) { try { return JSON.parse(fs.readFileSync(path.join(dir, 'project.json'), 'utf8')); } catch { return null; } }
export function assetFiles(dir) { const A = path.join(dir, 'assets'); return fs.existsSync(A) ? fs.readdirSync(A).filter((f) => FILE_RE.test(f)) : []; }
export function fileInfo(dir) {
  return (name) => {
    if (!FILE_RE.test(name)) return { exists: false }; const p = path.join(dir, 'assets', name); let st; try { st = fs.statSync(p); } catch { return { exists: false }; }
    let c = SHA.get(p); if (!c || c.m !== st.mtimeMs || c.s !== st.size) { const ok = crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex') === name.split('.')[0]; SHA.set(p, (c = { m: st.mtimeMs, s: st.size, ok })); }
    return { exists: true, sha: c.ok, bytes: st.size, text: () => fs.readFileSync(p, 'utf8'), json: () => glbJSON(new Uint8Array(fs.readFileSync(p))) };
  };
}
// compile the saved project → { scene, report } (report.ok false = errors). Missing project = nothing to compile (null).
export function compileDir(dir) {
  const raw = readProject(dir); if (!raw) return null;
  const r = compileProject(raw, fileInfo(dir)); const FI = fileInfo(dir); r.report.bytes = r.scene.files.reduce((n, f) => n + (FI(f).bytes || 0), 0); return r;
}
export function writeCompiled(dir, r) {
  const C = path.join(dir, 'compiled'); fs.mkdirSync(C, { recursive: true });
  const w = (n, o) => { const p = path.join(C, n); fs.writeFileSync(p + '.tmp', JSON.stringify(o) + '\n'); fs.renameSync(p + '.tmp', p); };
  w('scene.json', r.scene); w('report.json', { ...r.report, at: new Date().toISOString() });
}
const BUILD = { running: false, log: [], ok: null, verify: null, started: null, ended: null };
function verifyDist(root, dir) { // the files the build put into dist/paint-pack match the compiled scene
  const D = path.join(root, 'dist', 'paint-pack'); const out = { scene: false, files: 0, missing: [] };
  try { const s = JSON.parse(fs.readFileSync(path.join(D, 'scene.json'), 'utf8')); out.scene = true; out.instances = (s.instances || []).reduce((n, g) => n + g.n, 0); for (const f of s.files || []) { if (fs.existsSync(path.join(D, 'assets', f))) out.files++; else out.missing.push(f); } } catch (e) { out.error = String((e && e.message) || e); }
  void dir; return out;
}
function runBuild(root, dir) {
  if (BUILD.running) return false; Object.assign(BUILD, { running: true, log: [], ok: null, verify: null, started: new Date().toISOString(), ended: null });
  const vite = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'); const ch = spawn(process.execPath, [vite, 'build'], { cwd: root, env: { ...process.env, FORCE_COLOR: '0' } });
  const take = (b) => { for (const l of String(b).split(/\r?\n/)) if (l.trim()) { BUILD.log.push(l.slice(0, 400)); if (BUILD.log.length > 400) BUILD.log.shift(); } };
  ch.stdout.on('data', take); ch.stderr.on('data', take);
  ch.on('close', (code) => { BUILD.running = false; BUILD.ok = code === 0; BUILD.ended = new Date().toISOString(); BUILD.verify = verifyDist(root, dir); });
  ch.on('error', (e) => { BUILD.running = false; BUILD.ok = false; take('could not start the build: ' + e.message); });
  return true;
}

export default function paintPack({ dir = 'paint-pack' } = {}) {
  let root = process.cwd(); const abs = () => path.resolve(root, dir);
  return {
    name: 'colombo-paint-pack',
    configResolved(c) { root = c.root; },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = decodeURIComponent((req.url || '').split('?')[0]); if (!url.startsWith('/__colombo/paint') && !url.startsWith('/paint-pack/')) { next(); return; }
        const D = abs();
        try {
          if (url === '/__colombo/paint' && req.method === 'GET') { let report = null; try { report = JSON.parse(fs.readFileSync(path.join(D, 'compiled', 'report.json'), 'utf8')); } catch { /* never compiled */ }
            json(res, { ok: true, folder: D, project: readProject(D), files: assetFiles(D), report }); return; }
          if (url === '/__colombo/paint/project' && req.method === 'PUT') {
            const p = JSON.parse((await body(req, 256 * 1024 * 1024)).toString('utf8'));
            if (!p || p.format !== PROJECT_FORMAT || !(p.version >= 1) || typeof p.assets !== 'object' || !Array.isArray(p.instances)) { res.statusCode = 400; res.end('not a paint project'); return; }
            const { notes } = normalizeProject(p); fs.mkdirSync(D, { recursive: true }); const f = path.join(D, 'project.json');
            if (fs.existsSync(f)) { const B = path.join(D, 'backups'); fs.mkdirSync(B, { recursive: true }); fs.copyFileSync(f, path.join(B, 'project-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json'));
              const old = fs.readdirSync(B).filter((n) => n.startsWith('project-')).sort(); for (const n of old.slice(0, Math.max(0, old.length - 40))) fs.unlinkSync(path.join(B, n)); }
            fs.writeFileSync(f + '.tmp', JSON.stringify(p) + '\n'); fs.renameSync(f + '.tmp', f); // atomic: a crash mid-save never leaves half a file
            const have = new Set(assetFiles(D)); const missing = [...projectFiles(p)].filter((n) => !have.has(n));
            json(res, { ok: true, bytes: fs.statSync(f).size, notes, missing }); return;
          }
          const fm = url.match(/^\/__colombo\/paint\/file\/([^/]+)$/);
          if (fm && (req.method === 'POST' || req.method === 'DELETE')) {
            const name = fm[1]; if (!FILE_RE.test(name)) { res.statusCode = 400; res.end('bad file name'); return; } const A = path.join(D, 'assets'); fs.mkdirSync(A, { recursive: true }); const p = path.join(A, name);
            if (req.method === 'DELETE') { if (fs.existsSync(p)) { const T = path.join(D, 'trash'); fs.mkdirSync(T, { recursive: true }); fs.renameSync(p, path.join(T, name)); } json(res, { ok: true }); return; }
            const buf = await body(req, MAX_FILE); if (crypto.createHash('sha256').update(buf).digest('hex') !== name.split('.')[0]) { res.statusCode = 400; res.end('content does not match its name (sha256)'); return; }
            if (!fs.existsSync(p)) { fs.writeFileSync(p + '.tmp', buf); fs.renameSync(p + '.tmp', p); } json(res, { ok: true, file: name, bytes: buf.length }); return;
          }
          if (url === '/__colombo/paint/compile' && req.method === 'POST') {
            let opt = {}; try { opt = JSON.parse((await body(req, 4096)).toString('utf8') || '{}'); } catch { /* defaults */ }
            const r = compileDir(D); if (!r) { json(res, { ok: false, report: { ok: false, errors: ['nothing saved yet — Save first'], warnings: [], counts: {} } }); return; }
            if (r.report.ok) writeCompiled(D, r); else { fs.mkdirSync(path.join(D, 'compiled'), { recursive: true }); fs.writeFileSync(path.join(D, 'compiled', 'report.json'), JSON.stringify({ ...r.report, at: new Date().toISOString() }) + '\n'); }
            const build = r.report.ok && opt.build ? runBuild(root, D) : false; json(res, { ok: r.report.ok, report: r.report, build, buildBusy: !!opt.build && r.report.ok && !build }); return;
          }
          if (url === '/__colombo/paint/build' && req.method === 'GET') { json(res, { ...BUILD, log: BUILD.log.slice(-60) }); return; }
          if (url === '/paint-pack/scene.json') { const r = compileDir(D); if (!r) { res.statusCode = 404; res.end(); return; } json(res, r.scene); return; }
          const af = url.match(/^\/paint-pack\/assets\/([^/]+)$/);
          if (af && FILE_RE.test(af[1])) { const p = path.join(D, 'assets', af[1]); if (fs.existsSync(p)) { res.setHeader('content-type', MIME[extOf(af[1])] || 'application/octet-stream'); res.setHeader('cache-control', 'no-cache'); fs.createReadStream(p).pipe(res); return; } res.statusCode = 404; res.end(); return; }
        } catch (e) { res.statusCode = e.status || 500; res.end(String((e && e.message) || e)); return; }
        next();
      });
    },
    generateBundle() {
      const D = abs(); const r = compileDir(D); if (!r) return;
      const { scene, report } = r; let n = 0;
      for (const f of scene.files) { const p = path.join(D, 'assets', f); if (fs.existsSync(p)) { this.emitFile({ type: 'asset', fileName: 'paint-pack/assets/' + f, source: fs.readFileSync(p) }); n++; } }
      this.emitFile({ type: 'asset', fileName: 'paint-pack/scene.json', source: JSON.stringify(scene) });
      console.log(`\n[paint pack] ${report.counts.instances} instance(s), ${report.counts.assets} asset(s), ${n} file(s) from ${dir}/ built into the game`);
      for (const w of report.warnings) console.warn('[paint pack] warning: ' + w);
      for (const e of report.errors) console.warn('[paint pack] ERROR: ' + e);
    },
  };
}
