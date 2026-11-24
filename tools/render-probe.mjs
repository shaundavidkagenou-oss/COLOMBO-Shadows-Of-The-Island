// Black-screen guard (headless Chromium + SwiftShader): opens the game, reaches the requested mode and checks that frames
// are actually drawn — the canvas is read back and its mean brightness / spread reported — plus every page error.
//   node tools/render-probe.mjs [play|trailer|gate] [outPrefix]     PORT env = server port (default 5199)
// play    — ?test&quick=play: free play on Main Street (player camera)
// warm    — ?test&quick=play&warm=1: free play after the REAL enter-game loading (streaming, vehicle warm, shader compile)
// new     — ?test&quick=new: NEW GAME — the enter-game loading, then the opening cinematic and play
// enter   — free play, then the real enter-game loading (menu → NEW GAME / LOAD) run in the page, then the player camera
// trailer — ?test&quick=trailer: the in-engine trailer (its own camera)
// EVAL env = a JS expression printed with every sample (state dumps while chasing a fault)
// gate    — the real flow: ENTER GAME → studio intro / loading → menu → NEW GAME → opening, no test shortcuts
import puppeteer from '/home/user/testenv/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
import chromium from '/home/user/testenv/node_modules/@sparticuz/chromium/build/index.js';
const [MODE = 'play', OUT = '/tmp/probe'] = process.argv.slice(2);
const W = 800, H = 450; const PORT = process.env.PORT || 5199;
const browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), headless: true, protocolTimeout: 1800000,
  args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', `--window-size=${W},${H}`], defaultViewport: { width: W, height: H } });
const errors = []; const logs = [];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let bad = 0;
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => errors.push('pageerror: ' + String(e.message || e) + (e.stack ? ' @ ' + e.stack.split('\n').slice(1, 3).join(' ') : '')));
  page.on('console', (m) => { const t = m.text(); if (m.type() === 'error' && !/favicon/.test(t)) errors.push('console: ' + t); else if (/COLOMBO|real-car|warn/i.test(t) || m.type() === 'warning') logs.push(m.type() + ': ' + t); });
  page.on('requestfailed', (r) => errors.push('request failed: ' + r.url() + ' ' + (r.failure() && r.failure().errorText)));
  page.on('response', (r) => { if (r.status() >= 400 && !/favicon/.test(r.url())) errors.push('HTTP ' + r.status() + ' ' + r.url()); });
  await page.evaluateOnNewDocument(() => { localStorage.setItem('colombo.settings.v1', JSON.stringify({ quality: 'low', showFps: false })); });
  const url = `http://localhost:${PORT}/` + (MODE === 'gate' ? '' : MODE === 'enter' ? '?test&quick=play' : MODE === 'warm' ? '?test&quick=play&warm=1' : `?test&quick=${MODE}`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 300000 });
  const t0 = Date.now();
  if (MODE === 'gate') { // the real player flow
    await page.waitForSelector('#gate button', { timeout: 60000 }); const btn = await page.$$eval('#gate button', (b) => b.map((x) => x.textContent.trim())); console.log('gate buttons:', btn.join(' | '));
    await page.evaluate(() => { const b = [...document.querySelectorAll('#gate button')].find((x) => /ENTER/i.test(x.textContent)); b.click(); });
    // studio intro + loading, then the menu: wait for the game object and the menu mode
    await page.waitForFunction(() => window.__game && /menu/.test(window.__game.mode || ''), { timeout: 1500000, polling: 2000 }).catch(() => {});
    console.log('mode after load:', await page.evaluate(() => window.__game && window.__game.mode), ((Date.now() - t0) / 1000).toFixed(0) + 's');
  } else {
    await page.waitForFunction((m) => window.__game && window.__game.mode === m, { timeout: 1500000, polling: 2000 }, MODE === 'warm' || MODE === 'new' || MODE === 'enter' ? 'play' : MODE).catch(() => {});
    console.log('mode:', await page.evaluate(() => window.__game && window.__game.mode), ((Date.now() - t0) / 1000).toFixed(0) + 's');
    if (MODE === 'enter') { // menu → NEW GAME / LOAD: the real enter-game loading runs, then the player camera takes over
      await page.evaluate(async () => { const g = window.__game; await g.enterLoading([[-140, -891.8]]); g.mode = 'play'; g.world.warm(-140, -892); g.player.teleport(-140, -891.8, Math.PI / 2); g.player.cinematic = false; g.player.control = true; g.hud.show(true); g.hud.fade(0, 0.3); });
      console.log('enterLoading done', ((Date.now() - t0) / 1000).toFixed(0) + 's'); }
  }
  for (let k = 0; k < 3; k++) {
    await wait(MODE === 'trailer' ? 9000 : 5000);
    const st = await page.evaluate(() => { const g = window.__game; if (!g || !g.renderer) return { err: 'no game/renderer' };
      const c = g.renderer.domElement; const gl = g.renderer.getContext();
      // read back what the last frame left on the canvas (preserveDrawingBuffer may be off: draw one more frame first)
      try { if (g.post && g.post.render) g.post.render(0.016); else g.renderer.render(g.scene, g.camera); } catch (e) { return { err: 'render threw: ' + e.message }; }
      const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight; const px = new Uint8Array(w * h * 4); gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      let s = 0, s2 = 0, n = 0; for (let i = 0; i < px.length; i += 4 * 37) { const l = (px[i] + px[i + 1] + px[i + 2]) / 3; s += l; s2 += l * l; n++; }
      const m = s / n; const cam = g.camera; const info = g.renderer.info.render;
      const vp = new (window.__THREE.Vector4)(); g.renderer.getViewport(vp);
      return { viewport: vp.toArray(), scissor: g.renderer.getScissorTest(), mean: +m.toFixed(1), sd: +Math.sqrt(Math.max(0, s2 / n - m * m)).toFixed(1), canvas: [c.width, c.height, getComputedStyle(c).display, getComputedStyle(c).visibility, getComputedStyle(c).opacity],
        mode: g.mode, cam: [cam.position.x, cam.position.y, cam.position.z].map((v) => +v.toFixed(1)), near: cam.near, far: cam.far, fov: cam.fov, aspect: +cam.aspect.toFixed(3), calls: info.calls, tris: info.triangles,
        camNaN: [cam.position.x, cam.position.y, cam.position.z, cam.quaternion.x, cam.quaternion.w].some((v) => !Number.isFinite(v)), fade: g.hud && g.hud.fadeEl ? getComputedStyle(g.hud.fadeEl).opacity : null, frames: g.frameNo ?? null };
    });
    if (process.env.EVAL) console.log('eval', k, await page.evaluate((src) => { try { return JSON.stringify((0, eval)(src)); } catch (e) { return 'threw ' + e.message; } }, process.env.EVAL));
    console.log('sample', k, JSON.stringify(st)); if (st.err || st.mean < 6 || st.sd < 3) bad++;
    await page.screenshot({ path: `${OUT}-${MODE}-${k}.png` });
  }
} catch (e) { console.log('ERR', e.message); bad++; } finally {
  console.log('logs:', logs.slice(0, 12).join(' | ') || 'none');
  console.log('errors:', errors.length ? errors.slice(0, 10).join('\n  ') : 'none'); await browser.close();
  console.log(bad ? `render-probe ${MODE}: BLACK/BROKEN (${bad} bad samples)` : `render-probe ${MODE}: frames drawn`); process.exit(bad ? 1 : 0); }
