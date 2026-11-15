#!/usr/bin/env node
// COLOMBO: Shadows of the Island: export the OFFICIAL CINEMATIC TRAILER to an MP4 file.
//
// It plays the real trailer (the game's own CineTrailer, nothing pre-rendered) in Chrome or Edge, but frame-locked: the game
// does NOT run in real time. Every video frame i is one simulation + render step at edit time exactly i / fps, captured
// losslessly-enough (JPEG q97, or PNG with --lossless) and encoded by ffmpeg (H.264 High, CRF 16, slow preset). However long
// a frame takes to draw, nothing is skipped or stutters, so the file is perfectly smooth at the chosen frame rate.
// The sound is the trailer's own score, dialogue and effects rendered by an OfflineAudioContext that is advanced to each
// frame's time before the frame runs (src/story/CineTrailer.js exportHook), then muxed as AAC 320 kb/s.
//
// Usage (export-trailer-mp4.bat does the build + install and passes its arguments here):
//   node tools/trailer-export/export.mjs [--fps 60] [--width 1920] [--height 1080] [--quality ultra|high|medium|low]
//        [--crf 16] [--preset slow] [--lossless] [--out file.mp4] [--dist dist] [--browser path\to\chrome.exe] [--show]
//        [--frames N]   (only the first N frames: a quick test of the pipeline)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url)); const ROOT = path.resolve(HERE, '..', '..');
// ------------------------------------------------------------------ options
const argv = process.argv.slice(2); const opt = {};
for (let i = 0; i < argv.length; i++) { const a = argv[i]; if (!a.startsWith('--')) continue; const k = a.slice(2); const n = argv[i + 1]; if (n === undefined || n.startsWith('--')) opt[k] = true; else { opt[k] = n; i++; } }
if (opt.help || opt.h) { console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 15).map((l) => l.replace(/^\/\/ ?/, '')).join('\n')); process.exit(0); }
const FPS = Math.max(24, Math.min(120, +(opt.fps || 60)));
const W = Math.max(640, Math.round(+(opt.width || 1920) / 2) * 2), H = Math.max(360, Math.round(+(opt.height || 1080) / 2) * 2);
const QUALITY = ['low', 'medium', 'high', 'ultra'].includes(opt.quality) ? opt.quality : 'ultra'; // ultra: 1.5x pixel ratio, supersampled to the frame
const CRF = String(Math.max(0, Math.min(30, +(opt.crf ?? 16)))); const PRESET = typeof opt.preset === 'string' ? opt.preset : 'slow';
const LOSSLESS = !!opt.lossless; const FMT = LOSSLESS ? 'png' : 'jpeg';
const DIST = path.resolve(ROOT, typeof opt.dist === 'string' ? opt.dist : 'dist');
const OUT = path.resolve(process.cwd(), typeof opt.out === 'string' ? opt.out : `COLOMBO-Official-Cinematic-Trailer-${H}p${FPS}.mp4`);
const LIMIT = opt.frames ? Math.max(1, +opt.frames) : 0;

const die = (msg) => { console.error('\n[ERROR] ' + msg); process.exit(1); };
if (!fs.existsSync(path.join(DIST, 'index.html'))) die(`No game build in ${DIST}. Build it first (npm run build) or run export-trailer-mp4.bat.`);

// ------------------------------------------------------------------ tools: browser, ffmpeg, puppeteer
let puppeteer; try { puppeteer = (await import('puppeteer-core')).default; } catch { die('puppeteer-core is not installed: run  npm install --prefix tools/trailer-export  (export-trailer-mp4.bat does this).'); }
let FFMPEG = process.env.FFMPEG_PATH || null;
if (!FFMPEG) { try { FFMPEG = (await import('@ffmpeg-installer/ffmpeg')).default.path; } catch { /* not installed */ } } // a static ffmpeg build shipped inside the npm package (no download step)
if (!FFMPEG || !fs.existsSync(FFMPEG)) FFMPEG = 'ffmpeg';
if (spawnSync(FFMPEG, ['-hide_banner', '-version']).status !== 0) die('ffmpeg was not found (@ffmpeg-installer/ffmpeg is not installed and there is no ffmpeg on PATH). Run  npm install --prefix tools/trailer-export  or set FFMPEG_PATH to an ffmpeg executable.');

function findBrowser() {
  if (typeof opt.browser === 'string') return opt.browser;
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const E = process.env; const c = [];
  if (process.platform === 'win32') {
    for (const base of [E.PROGRAMFILES, E['PROGRAMFILES(X86)'], E.LOCALAPPDATA].filter(Boolean)) c.push(path.join(base, 'Google', 'Chrome', 'Application', 'chrome.exe'));
    for (const base of [E['PROGRAMFILES(X86)'], E.PROGRAMFILES].filter(Boolean)) c.push(path.join(base, 'Microsoft', 'Edge', 'Application', 'msedge.exe'));
  } else if (process.platform === 'darwin') c.push('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', '/Applications/Chromium.app/Contents/MacOS/Chromium');
  else for (const n of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge']) { const r = spawnSync('which', [n]); if (r.status === 0) c.push(String(r.stdout).trim()); }
  return c.find((p) => p && fs.existsSync(p)) || null;
}
const BROWSER = findBrowser(); if (!BROWSER) die('Neither Google Chrome nor Microsoft Edge was found. Install Chrome, or pass --browser "C:\\path\\to\\chrome.exe".');

// ------------------------------------------------------------------ the game build, served locally (127.0.0.1 only)
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.ico': 'image/x-icon', '.wasm': 'application/wasm', '.ktx2': 'image/ktx2' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(DIST, path.normalize(p).replace(/^([/\\])+/, '')); if (!f.startsWith(DIST)) { res.writeHead(403); return res.end(); }
  fs.stat(f, (err, st) => { if (err || !st.isFile()) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream', 'Content-Length': st.size }); fs.createReadStream(f).pipe(res); });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r)); const PORT = server.address().port;

// ------------------------------------------------------------------ the browser (GPU, never throttled)
const extra = (process.env.EXPORT_BROWSER_ARGS || '').split(' ').filter(Boolean);
const browser = await puppeteer.launch({ executablePath: BROWSER, headless: !opt.show, protocolTimeout: 0, defaultViewport: { width: W, height: H, deviceScaleFactor: 1 },
  args: [`--window-size=${W},${H}`, '--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
    '--autoplay-policy=no-user-gesture-required', '--mute-audio', '--hide-scrollbars', '--force-device-scale-factor=1', '--no-first-run', '--no-default-browser-check', ...extra] });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'colombo-trailer-')); const VIDEO = path.join(tmp, 'video.mp4'), WAV = path.join(tmp, 'audio.wav');
let exitCode = 0;
const cleanup = async () => { try { await browser.close(); } catch { /* closed */ } server.close(); try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* in use */ } };
process.on('SIGINT', async () => { console.log('\nCancelled.'); await cleanup(); process.exit(130); });
try {
  const page = await browser.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message || e).split('\n')[0]));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|404/.test(m.text())) errors.push(m.text().slice(0, 300)); });
  // the game's own quality preset at full resolution for this browser profile (a fresh one: no saved game is touched)
  await page.evaluateOnNewDocument((q) => { try { localStorage.setItem('colombo.settings.v1', JSON.stringify({ quality: q, resolutionScale: 1, showFps: false, subtitles: true })); } catch { /* storage */ } }, QUALITY);
  console.log(`COLOMBO: Shadows of the Island  -  OFFICIAL CINEMATIC TRAILER  ->  MP4\n  ${W}x${H} @ ${FPS} fps, "${QUALITY}" graphics, H.264 CRF ${CRF} (${PRESET}), ${LOSSLESS ? 'PNG' : 'JPEG q97'} frames\n  browser: ${BROWSER}\n  output:  ${OUT}\n`);
  await page.goto(`http://127.0.0.1:${PORT}/?test&quick=trailer2&export=1`, { waitUntil: 'domcontentloaded', timeout: 0 });
  // loading: the city, the cast, the cars and the shader warm-up (as behind the game's loading screen)
  const t0 = Date.now(); let lastP = '';
  for (;;) {
    const s = await page.evaluate(() => ({ ready: !!window.__export, p: window.__progress ? `${Math.round(window.__progress[0] * 100)}%  ${window.__progress[1] || ''}` : '' })).catch(() => ({ ready: false, p: '' }));
    if (s.ready) break; if (errors.length > 20) throw new Error('the game failed to load: ' + errors.slice(0, 3).join(' | '));
    if (s.p !== lastP) { lastP = s.p; process.stdout.write(`\r  loading ${s.p.slice(0, 70).padEnd(70)}`); }
    if (Date.now() - t0 > 3600e3) throw new Error('the game did not finish loading within an hour'); await new Promise((r) => setTimeout(r, 500));
  }
  const info = await page.evaluate(() => { const gl = window.__game.renderer.getContext(); const x = gl.getExtension('WEBGL_debug_renderer_info'); return { gpu: x ? gl.getParameter(x.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), len: window.__export.len, audio: window.__export.audio }; });
  console.log(`\r  loaded in ${((Date.now() - t0) / 1000).toFixed(0)} s. GPU: ${info.gpu}${' '.repeat(30)}`);
  if (/swiftshader|llvmpipe|software/i.test(info.gpu)) console.log('  [!] The browser is rendering in software (no GPU): the export will be slow. Try --show (a visible window) or update the graphics driver.');
  if (!info.audio) console.log('  [!] No offline audio in this browser: the MP4 will have no sound.');
  // ---------------------------------------------------------------- frames -> ffmpeg (video only; the sound is muxed after)
  const N = LIMIT ? Math.min(LIMIT, Math.round(info.len * FPS)) : Math.round(info.len * FPS);
  const scale = LOSSLESS ? 'scale=out_range=tv:out_color_matrix=bt709' : 'scale=in_range=full:in_color_matrix=bt601:out_range=tv:out_color_matrix=bt709';
  const ff = spawn(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', LOSSLESS ? 'png' : 'mjpeg', '-i', '-',
    '-vf', `${scale},format=yuv420p`, '-c:v', 'libx264', '-preset', PRESET, '-crf', CRF, '-profile:v', 'high', '-g', String(FPS * 2), '-bf', '2',
    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv', '-r', String(FPS), '-movflags', '+faststart', VIDEO], { stdio: ['pipe', 'inherit', 'inherit'] });
  const ffDone = once(ff, 'exit'); let ffErr = null; ff.stdin.on('error', (e) => { ffErr = e; });
  const tS = Date.now(); let shot = '';
  for (let i = 0; i < N; i++) {
    const r = await page.evaluate((i, fps) => window.__export.step(i, fps), i, FPS);
    if (r.shot) shot = r.shot;
    const img = await page.screenshot({ type: FMT, ...(LOSSLESS ? {} : { quality: 97 }), optimizeForSpeed: true, captureBeyondViewport: false });
    if (ffErr) throw new Error('ffmpeg stopped: ' + ffErr.message);
    if (!ff.stdin.write(img)) await once(ff.stdin, 'drain');
    if (i % 15 === 0 || i === N - 1) { const el = (Date.now() - tS) / 1000, rate = (i + 1) / Math.max(el, 1e-3), eta = (N - i - 1) / rate;
      process.stdout.write(`\r  frame ${String(i + 1).padStart(5)}/${N}  ${r.e.toFixed(2).padStart(6)} s  ${shot.slice(0, 22).padEnd(22)}  ${rate.toFixed(1)} frames/s  ~${Math.floor(eta / 60)}m ${String(Math.round(eta % 60)).padStart(2, '0')}s left   `); }
  }
  ff.stdin.end(); const [code] = await ffDone; if (code !== 0) throw new Error('ffmpeg failed to encode the video (exit ' + code + ')');
  console.log(`\n  video encoded (${((Date.now() - tS) / 60000).toFixed(1)} min)`);
  // ---------------------------------------------------------------- the sound, then the final file
  let haveAudio = false;
  if (info.audio) {
    const n = await page.evaluate(() => window.__export.finishAudio()); const fd = fs.openSync(WAV, 'w'); const CH = 4 << 20;
    for (let o = 0; o < n; o += CH) fs.writeSync(fd, Buffer.from(await page.evaluate((o, s) => window.__export.wavChunk(o, s), o, CH), 'base64'));
    fs.closeSync(fd); haveAudio = n > 44; console.log(`  sound rendered (${(n / 1048576).toFixed(1)} MB PCM)`);
  }
  const dur = (N / FPS).toFixed(4);
  const mux = spawnSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', '-i', VIDEO, ...(haveAudio ? ['-i', WAV, '-map', '0:v', '-map', '1:a', '-c:a', 'aac', '-b:a', '320k', '-ar', '48000'] : []),
    '-c:v', 'copy', '-t', dur, '-movflags', '+faststart', '-metadata', 'title=COLOMBO: Shadows of the Island - Official Cinematic Trailer', '-metadata', 'artist=Shaun David Studios', OUT], { stdio: 'inherit' });
  if (mux.status !== 0) throw new Error('ffmpeg failed to write the MP4');
  const mb = fs.statSync(OUT).size / 1048576;
  console.log(`\n  DONE: ${OUT}\n  ${dur} s, ${W}x${H}, ${FPS} fps, ${mb.toFixed(0)} MB${haveAudio ? ', with sound' : ', no sound'}${errors.length ? `\n  (${errors.length} browser console error(s); first: ${errors[0]})` : ''}`);
} catch (e) { exitCode = 1; console.error('\n[ERROR] ' + (e && e.message || e)); }
await cleanup(); process.exit(exitCode);
