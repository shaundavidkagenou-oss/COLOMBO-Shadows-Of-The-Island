// Pause-map open cost in the real game (headless Chromium): opens the full-screen map at a spot, records every animation frame
// while it is open (frame interval, shader programs compiled, satellite tiles captured) and the first frames after closing it.
//   node tools/map-open-probe.mjs [quality] [x z] [openSeconds]      PORT env = server port (default 5199), W/H env = viewport
// Reports: frames, worst / p95 frame interval, programs compiled during open and after close, tiles captured, capture ms.
// SwiftShader rasterises on the CPU, so absolute intervals are far slower than a real GPU; compare runs (before / after).
import puppeteer from '/home/user/testenv/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
import chromium from '/home/user/testenv/node_modules/@sparticuz/chromium/build/index.js';
const [Q = 'medium', X = '-392', Z = '700', SECS = '40'] = process.argv.slice(2);
const W = +(process.env.W || 960), H = +(process.env.H || 540);
const browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), headless: true, protocolTimeout: 1800000,
  args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', `--window-size=${W},${H}`], defaultViewport: { width: W, height: H } });
const errors = [];
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => errors.push(String(e.message || e))); page.on('console', (m) => { if (m.type() === 'error' && !/favicon|404/.test(m.text())) errors.push(m.text()); });
  await page.evaluateOnNewDocument((q) => { localStorage.setItem('colombo.settings.v1', JSON.stringify({ quality: q, showFps: false })); }, Q);
  const url = 'http://localhost:' + (process.env.PORT || 5199) + '/?test&quick=play' + (process.env.WARM ? '&warm=1' : '') + (process.env.PERSIST ? '&satcache=1' : '');
  for (let run = 0; run < (process.env.PERSIST ? 2 : 1); run++) { // PERSIST=1: a second session (page reload, same browser profile) opens the map again
  if (run === 1) { await page.evaluate(() => { const S = window.__game.hud.satellite; for (const t of S.tiles.values()) if (t.c && t.c.close) t.c.close(); S.tiles.clear(); S.job = null; S.stats.captured = 0; S.stats.parts = 0; S.stats.ms = 0; }); console.log('session 2 = in-memory tiles dropped, IndexedDB kept (what a fresh launch of the same build sees)'); }
  if (run === 0) { await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__game && window.__game.mode === 'play', { timeout: 900000, polling: 1000 });
  await page.evaluate(async (x, z) => { const g = window.__game; g.world.warm(x, z); g.player.teleport(x, z, 0); g.atmos.hour = 11; g.atmos.forceWeather('clear'); g.atmos.setWeather('clear', true); await g.stepSim(40, 0.05); }, +X, +Z);
  await new Promise((r) => setTimeout(r, 8000)); } // the live loop settles (this view's shaders)
  const res = await page.evaluate(async (secs) => {
    const g = window.__game, R = g.renderer, S = g.hud.satellite; const rec = (window.__rec = { open: [], after: [] });
    const p0 = R.info.programs.length; let phase = 'open', last = performance.now();
    const tick = () => { if (!rec[phase]) return; const now = performance.now(); rec[phase].push([now - last, R.info.programs.length]); last = now; if (phase !== 'done') requestAnimationFrame(tick); };
    const c0 = S ? S.stats.captured : 0, m0 = S ? S.stats.ms : 0; g.toggleMap(true); requestAnimationFrame(tick);
    await new Promise((r) => setTimeout(r, secs * 1000));
    const p1 = R.info.programs.length; const c1 = S ? S.stats.captured - c0 : 0, ms = S ? S.stats.ms - m0 : 0; const ready = g.hud.mapView.satReady;
    phase = 'after'; g.toggleMap(false); await new Promise((r) => setTimeout(r, 6000)); phase = 'done';
    const st = (a) => { const v = a.map((q) => q[0]).sort((x, y) => x - y); return { n: v.length, avg: +(v.reduce((x, y) => x + y, 0) / Math.max(1, v.length)).toFixed(1), p95: +(v[Math.floor(v.length * 0.95)] || 0).toFixed(1), max: +(v[v.length - 1] || 0).toFixed(1), over100: v.filter((q) => q > 100).length }; };
    return { programsBefore: p0, compiledWhileOpen: p1 - p0, compiledAfterClose: R.info.programs.length - p1, tilesCaptured: c1, quarterSteps: S ? S.stats.parts : 0, tilesLoadedFromStore: S ? S.stats.loaded : 0, tRender: S ? Math.round(S.stats.tRender || 0) : 0, tDraw: S ? Math.round(S.stats.tDraw || 0) : 0, stored: S ? S.stored.size : 0, captureMs: Math.round(ms), satReady: ready, open: st(rec.open), afterClose: st(rec.after) };
  }, +SECS);
  console.log(`session ${run + 1}:`, JSON.stringify(res)); if (process.env.PERSIST) await new Promise((r) => setTimeout(r, 3000)); // let the last toBlob → IndexedDB writes land
  }
} catch (e) { console.log('ERR', e.message); } finally { console.log('errors:', errors.length ? errors.slice(0, 6).join(' | ') : 'none'); await browser.close(); }
