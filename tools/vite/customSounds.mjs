// Custom sound pack (console command `sounds` → src/ui/SoundsWindow.js, src/audio/SoundBank.js).
// The project folder `sounds/` holds the player's replacement recordings: `<sound id>.<mp3|wav|ogg>` (e.g. gun.assault.mp3,
// siren.police.wav) plus `sounds.json` (display name + volume per id). This plugin
//   • dev server (`npm run dev`): serves the folder as /custom-sounds/ (manifest.json + files) and accepts the `sounds`
//     window's Save / Remove (POST / DELETE /__colombo/sounds/<id>), writing straight into the folder;
//   • production build (`npm run build`, and so build-exe.bat → the .exe): copies the folder into dist/custom-sounds/ with a
//     manifest, so every built copy of the game — browser build or Windows .exe — starts with those recordings.
// Files whose name is not a known id are ignored (and listed as a warning in the build).
import fs from 'node:fs';
import path from 'node:path';

const EXT = /\.(mp3|wav|ogg)$/i;
const ID = /^[a-z0-9]+(\.[a-z0-9]+)*$/i;
const MIME = { mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg' };
const MAX_BYTES = 40 * 1024 * 1024;

export function scanSounds(dir) {
  const out = {}; if (!fs.existsSync(dir)) return out;
  let meta = {}; try { meta = JSON.parse(fs.readFileSync(path.join(dir, 'sounds.json'), 'utf8')) || {}; } catch { /* none yet */ }
  for (const f of fs.readdirSync(dir)) { if (!EXT.test(f)) continue; const id = f.replace(EXT, ''); if (!ID.test(id)) continue; const m = meta[id] || {};
    out[id] = { file: f, name: m.name || f, vol: typeof m.vol === 'number' ? m.vol : 1 }; }
  return out;
}
function writeMeta(dir, id, entry) {
  const p = path.join(dir, 'sounds.json'); let meta = {}; try { meta = JSON.parse(fs.readFileSync(p, 'utf8')) || {}; } catch { /* new */ }
  if (entry) meta[id] = entry; else delete meta[id]; fs.writeFileSync(p, JSON.stringify(meta, null, 2) + '\n');
}

export default function customSounds({ dir = 'sounds', knownIds = null } = {}) {
  let root = process.cwd(); const abs = () => path.resolve(root, dir);
  return {
    name: 'colombo-custom-sounds',
    configResolved(c) { root = c.root; },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = decodeURIComponent((req.url || '').split('?')[0]); const D = abs();
        try {
          if (url === '/__colombo/sounds' && req.method === 'GET') { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ ok: true, folder: D, sounds: scanSounds(D) })); return; }
          const m = url.match(/^\/__colombo\/sounds\/([^/]+)$/);
          if (m && (req.method === 'POST' || req.method === 'DELETE' || req.method === 'PATCH')) {
            const id = m[1]; if (!ID.test(id)) { res.statusCode = 400; res.end('bad id'); return; }
            const q = new URL(req.url, 'http://x').searchParams; fs.mkdirSync(D, { recursive: true });
            const old = fs.readdirSync(D).filter((f) => EXT.test(f) && f.replace(EXT, '') === id);
            if (req.method === 'DELETE') { for (const f of old) fs.unlinkSync(path.join(D, f)); writeMeta(D, id, null); res.end('{"ok":true}'); return; }
            if (req.method === 'PATCH') { const cur = scanSounds(D)[id]; if (cur) writeMeta(D, id, { name: cur.name, vol: +q.get('vol') || 0 }); res.end('{"ok":true}'); return; }
            const ext = (q.get('ext') || 'mp3').toLowerCase(); if (!MIME[ext]) { res.statusCode = 400; res.end('bad type'); return; }
            const chunks = []; let n = 0; for await (const ch of req) { n += ch.length; if (n > MAX_BYTES) { res.statusCode = 413; res.end('too big'); return; } chunks.push(ch); }
            for (const f of old) fs.unlinkSync(path.join(D, f));
            fs.writeFileSync(path.join(D, id + '.' + ext), Buffer.concat(chunks)); writeMeta(D, id, { name: q.get('name') || id + '.' + ext, vol: +(q.get('vol') ?? 1) });
            res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ ok: true, file: id + '.' + ext })); return;
          }
          if (url === '/custom-sounds/manifest.json') { res.setHeader('content-type', 'application/json'); res.setHeader('cache-control', 'no-cache'); res.end(JSON.stringify({ version: 1, sounds: scanSounds(D) })); return; }
          const f = url.match(/^\/custom-sounds\/([^/]+)$/);
          if (f && EXT.test(f[1])) { const p = path.join(D, path.basename(f[1])); if (fs.existsSync(p)) { res.setHeader('content-type', MIME[f[1].split('.').pop().toLowerCase()]); fs.createReadStream(p).pipe(res); return; } res.statusCode = 404; res.end(); return; }
        } catch (e) { res.statusCode = 500; res.end(String(e && e.message || e)); return; }
        next();
      });
    },
    generateBundle() {
      const D = abs(); const all = scanSounds(D); const sounds = {}; const skipped = [];
      for (const [id, e] of Object.entries(all)) { if (knownIds && !knownIds.has(id)) { skipped.push(e.file); continue; } sounds[id] = e; this.emitFile({ type: 'asset', fileName: 'custom-sounds/' + e.file, source: fs.readFileSync(path.join(D, e.file)) }); }
      this.emitFile({ type: 'asset', fileName: 'custom-sounds/manifest.json', source: JSON.stringify({ version: 1, sounds }, null, 1) });
      const n = Object.keys(sounds).length; if (n) console.log(`\n[custom sounds] ${n} recording(s) from ${dir}/ built into the game: ${Object.keys(sounds).join(', ')}`);
      if (skipped.length) console.warn(`[custom sounds] ignored (file name is not a sound id — see the \`sounds\` window): ${skipped.join(', ')}`);
    },
  };
}
