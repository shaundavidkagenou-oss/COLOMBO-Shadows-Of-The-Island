// 68th: the PRODUCTION path of the model tools — what build-exe.bat ships.
// Writes a small model-pack (weapon part colour + texture + stats, vehicle handling) and dev-lock.json,
// runs `vite build` into a temp folder, serves it with `vite preview` (the same static files the .exe serves)
// and checks in a headless browser that:
//   - the pack (manifest + referenced texture) is in the build, the editors and the secret code are not
//   - the game applies the pack on start (weapon part colour + texture, magazine size, handling)
//   - with dev-lock.json the console never opens; typing the secret code in the game brings it back
// model-pack/ and dev-lock.json are restored afterwards.
//   node tools/model-pack-dist-test.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import sharp from 'sharp';
import { emptyManifest } from './vite/modelPack.mjs';
import puppeteer from '/home/user/testenv/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
import chromium from '/home/user/testenv/node_modules/@sparticuz/chromium/build/index.js';

const ROOT = new URL('../', import.meta.url).pathname; const PACK = ROOT + 'model-pack/'; const ASIDE = ROOT + 'model-pack.dist-aside'; const LOCK = ROOT + 'dev-lock.json';
const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'colombo-dist-')); const PORT = +(process.env.PORT || 5198);
let fails = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };
if (fs.existsSync(ASIDE)) throw new Error(ASIDE + ' exists — a previous run did not finish; move it back to model-pack/ first');
const lock0 = fs.existsSync(LOCK) ? fs.readFileSync(LOCK) : null;
fs.renameSync(PACK, ASIDE); fs.mkdirSync(PACK, { recursive: true });
let server = null, browser = null;
try {
  // a 64² orange/black checker texture, named by its sha256 like an upload
  const raw = Buffer.alloc(64 * 64 * 3); for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) { const i = (y * 64 + x) * 3; const on = ((x >> 3) + (y >> 3)) & 1; raw[i] = on ? 255 : 10; raw[i + 1] = on ? 140 : 10; raw[i + 2] = on ? 0 : 10; }
  const png = await sharp(raw, { raw: { width: 64, height: 64, channels: 3 } }).png().toBuffer(); const TEX = crypto.createHash('sha256').update(png).digest('hex') + '.png';
  fs.writeFileSync(PACK + TEX, png);
  const m = emptyManifest(); m.created = m.modified = new Date().toISOString(); m.files[TEX] = { name: 'checker.png', size: png.length, kind: 'image' };
  m.weapons.type56 = { parts: { 'p:#6/#0': { color: '#ffffff', map: TEX } }, stats: { mag: 41 } };
  m.vehicles.car = { handling: { maxSpeed: 44.5 } };
  fs.writeFileSync(PACK + 'manifest.json', JSON.stringify(m, null, 1));
  fs.writeFileSync(LOCK, JSON.stringify({ locked: true }));
  execFileSync('npx', ['vite', 'build', '--outDir', OUT, '--emptyOutDir'], { cwd: ROOT, stdio: 'pipe' });
  const bm = JSON.parse(fs.readFileSync(path.join(OUT, 'model-pack/manifest.json'), 'utf8'));
  ok(bm.weapons.type56 && bm.vehicles.car, 'manifest is in the build (dist/model-pack/manifest.json)');
  ok(fs.existsSync(path.join(OUT, 'model-pack', TEX)), 'the referenced texture is in the build');
  const js = fs.readdirSync(path.join(OUT, 'assets')).filter((f) => f.endsWith('.js')).map((f) => fs.readFileSync(path.join(OUT, 'assets', f), 'utf8')).join('\n');
  ok(!js.includes('SHAUNDEVACTIVATION') && !js.includes('shaundevactivation'), 'secret code is not in the bundle');
  ok(!/Model tools — |Create texture/.test(js), 'model tools / texture maker are not in the build');

  server = spawn('npx', ['vite', 'preview', '--outDir', OUT, '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], { cwd: ROOT, stdio: 'pipe', detached: true });
  for (let i = 0; i < 60; i++) { try { if ((await fetch(`http://127.0.0.1:${PORT}/`)).ok) break; } catch { /* starting */ } await new Promise((r) => setTimeout(r, 500)); }
  browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), headless: true, protocolTimeout: 1800000, args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'], defaultViewport: { width: 1280, height: 720 } });
  const p = await browser.newPage(); const logs = []; const errs = [];
  p.on('console', (c) => { logs.push(c.text()); }); p.on('pageerror', (e) => errs.push(String(e.message || e)));
  const boot = async () => { await p.goto(`http://127.0.0.1:${PORT}/?test&quick=play`, { waitUntil: 'domcontentloaded', timeout: 300000 }); await p.waitForFunction(() => window.__game && window.__game.mode === 'play', { timeout: 900000, polling: 1000 }); };
  await boot(); await new Promise((r) => setTimeout(r, 4000));
  ok(logs.some((l) => /\[model tools\] applied: 1 weapons, 1 vehicles/.test(l)), 'the built game applies the pack on start');
  const r = await p.evaluate(async () => {
    const g = window.__game; const out = {}; const m = g.weapons.models[17]; out.name = m.name; const mesh = m.children[6] && m.children[6].children[0];
    for (let i = 0; i < 4; i++) { /* the pack textures are preloaded at boot: a weapon built now has them within a second */ const mat = mesh && (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material); if (mat && mat.map && mat.map.userData.packFile) break; await new Promise((res) => setTimeout(res, 250)); }
    const mat = mesh && (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material); out.colour = mat && mat.color.getHexString(); out.tex = mat && mat.map && mat.map.userData.packFile; out.texW = mat && mat.map && mat.map.image && mat.map.image.width; out.diag = { mesh: !!mesh, isMesh: mesh && mesh.isMesh, n6: m.children.length, entry: !!m.userData.__wEntry, orig: !!(mesh && mesh.userData.__origMat), matName: mat && mat.name, matType: mat && mat.type };
    const con = g.debugCon; con.toggle(true); out.hidden = con.con.classList.contains('hidden'); con.toggle(false);
    for (const k of 'SHAUNDEVACTIVATION123$123$') document.body.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })); await new Promise((res) => setTimeout(res, 600));
    con.toggle(true); out.back = !con.con.classList.contains('hidden'); con.toggle(false); return out;
  });
  console.log('game', JSON.stringify(r));
  for (const l of logs) if (/model tools|texture|warn/i.test(l)) console.log('  [page] ' + l.slice(0, 300));
  ok(r.name === 'weapon-type56', 'weapon index 17 is the Type 56');
  ok(r.colour === 'ffffff' && r.tex && r.texW === 64, 'its part has the pack texture + colour in the built game');
  ok(r.hidden, 'dev-lock.json build: the console does not open');
  ok(r.back, 'the secret code typed in the game brings the console back');
  await boot(); const r2 = await p.evaluate(() => { const con = window.__game.debugCon; con.toggle(true); const v = !con.con.classList.contains('hidden'); con.toggle(false); return v; });
  ok(r2, 'it stays unlocked after a restart (this copy)');
  ok(!errs.length, 'no page errors ' + errs.slice(0, 3).join(' | '));
} catch (e) { ok(false, 'run: ' + (e.stack || e)); } finally {
  try { if (browser) await browser.close(); } catch { /* */ }
  try { if (server) process.kill(-server.pid); } catch { /* */ }
  fs.rmSync(PACK, { recursive: true, force: true }); fs.renameSync(ASIDE, PACK);
  if (lock0) fs.writeFileSync(LOCK, lock0); else fs.rmSync(LOCK, { force: true });
  fs.rmSync(OUT, { recursive: true, force: true });
}
console.log(fails ? `# ${fails} failed` : '# all passed'); process.exit(fails ? 1 : 0);
