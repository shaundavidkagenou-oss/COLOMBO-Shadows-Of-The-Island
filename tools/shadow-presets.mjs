// Live quality-preset switching through the real Settings screen (production build): starts at Low, then picks Medium,
// High, Ultra and back to Medium in the settings <select> exactly as a player would, rendering frames after each change.
// Reports per preset: renderer shadows on/off, sun castShadow, sun shadow map size, PCF radius, normal bias, shadow box,
// the shadow map actually allocated, the cinematic pass (level, flare / shafts, shaft target size), and console errors; then
// toggles the Lens flare / Light shafts checkboxes.     node tools/shadow-presets.mjs     (PORT env, default 5199)
import puppeteer from '/home/user/testenv/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
import chromium from '/home/user/testenv/node_modules/@sparticuz/chromium/build/index.js';
const browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), headless: true, protocolTimeout: 1800000,
  args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--window-size=800,450'], defaultViewport: { width: 800, height: 450 } });
const errors = [];
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => errors.push(String(e.message || e))); page.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warning') && !/favicon|404|GPU stall|ReadPixels|WebGL-|willReadFrequently/.test(m.text())) errors.push(m.type() + ': ' + m.text().slice(0, 200)); });
  await page.evaluateOnNewDocument(() => { localStorage.setItem('colombo.settings.v1', JSON.stringify({ quality: 'low', showFps: false })); });
  await page.goto('http://localhost:' + (process.env.PORT || 5199) + '/?test&quick=play', { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__game && window.__game.stepSim && window.__game.mode === 'play', { timeout: 900000, polling: 1000 });
  const state = () => page.evaluate(() => { const g = window.__game, s = g.atmos.sun, sh = s.shadow, sc = sh.camera;
    return { rendererShadows: g.renderer.shadowMap.enabled, cast: s.castShadow, mapSize: sh.mapSize.x, allocated: sh.map ? sh.map.width : null, radius: sh.radius, nb: +sh.normalBias.toFixed(3), bias: +sh.bias.toFixed(6), box: [+(sc.right - sc.left).toFixed(1), +(sc.top - sc.bottom).toFixed(1)],
      cine: g.post && g.post.cine ? { level: g.post.cine.level, flare: g.post.cine.flareOn, rays: g.post.cine.raysOn, rays_rt: g.post.cine.rtA ? [g.post.cine.rtA.width, g.post.cine.rtA.height] : null, passes: g.post.composer.passes.length, gradeIsCine: g.post.grade === g.post.cine } : null }; });
  // wait until the game has drawn with the new preset (shadow map re-allocated at the preset size, refitted), max 90 s
  const frames = () => page.evaluate(async () => { const g = window.__game; g.noRender = false; const t0 = performance.now(); await new Promise((r) => setTimeout(r, 4000));
    while (performance.now() - t0 < 90000) { const sh = g.atmos.sun.shadow; if (!g.renderer.shadowMap.enabled || (sh.map && sh.map.width === sh.mapSize.x)) break; await new Promise((r) => setTimeout(r, 1000)); }
    await new Promise((r) => setTimeout(r, 2000)); });
  await frames(); console.log('low (start)', JSON.stringify(await state()));
  for (const q of ['medium', 'high', 'ultra', 'medium']) {
    const ok = await page.evaluate((q) => { const g = window.__game; g.screens.settings(); const sel = [...document.querySelectorAll('select')].find((s) => [...s.options].some((o) => o.value === 'ultra'));
      if (!sel) return false; sel.value = q; sel.dispatchEvent(new Event('change')); return true; }, q);
    await frames(); console.log(q, ok ? '' : '(select NOT found)', JSON.stringify(await state()));
  }
  for (const [label, v] of [['Lens flare', false], ['Light shafts', false], ['Lens flare', true], ['Light shafts', true]]) { // the Phase 2 settings checkboxes
    const ok = await page.evaluate((label, v) => { const g = window.__game; g.screens.settings(); const row = [...document.querySelectorAll('*')].find((e) => e.children.length && e.textContent.trim().startsWith(label) && e.querySelector('input[type=checkbox]') && e.textContent.length < 40);
      const i = row && row.querySelector('input[type=checkbox]'); if (!i) return false; i.checked = v; i.dispatchEvent(new Event('change')); return true; }, label, v);
    await page.evaluate(() => new Promise((r) => setTimeout(r, 1500))); const st = await state(); console.log(label, v, ok ? '' : '(checkbox NOT found)', JSON.stringify(st.cine));
  }
} catch (e) { console.log('ERR', e.message); } finally { await browser.close(); }
console.log('console errors / warnings:', errors.length ? errors.slice(0, 8).join(' | ') : 'none');
