// 75th: visual review of the National Hospital garden (real renders in headless SwiftShader): the fountain, the benches and
// the people on them, the hedges / shrubs / trees, the facade planters. Prints the draw calls of each view and counts.
//   PORT=5204 node tools/garden-shots.mjs [outDir=dev/tmp/garden] [quality=medium]
import puppeteer from '/home/user/testenv/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
import chromium from '/home/user/testenv/node_modules/@sparticuz/chromium/build/index.js';
import fs from 'node:fs';
const [OUT = 'dev/tmp/garden', Q = 'medium'] = process.argv.slice(2); fs.mkdirSync(OUT, { recursive: true });
const browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), headless: true, protocolTimeout: 1800000,
  args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--window-size=960,540'], defaultViewport: { width: 960, height: 540 } });
const errors = [];
// plan coordinates (u east, v behind the street facade): cam [u, y, v] → look [u, y, v]
const SHOTS = [
  { name: '75-garden-path', cam: [4.5, 1.75, 31], look: [-1, 1.0, 50] },
  { name: '75-garden-bench', cam: [1.6, 1.45, 36.6], look: [-2.0, 0.7, 39.8] },
  { name: '75-garden-wheelchair', cam: [0.4, 1.25, 42.2], look: [-1.8, 0.5, 40.4] },
  { name: '75-garden-fountain', cam: [3.6, 1.6, 42.0], look: [0, 0.7, 46] },
  { name: '75-garden-lawn', cam: [-14, 1.8, 28], look: [-36, 1.5, 50] },
  { name: '75-garden-east', cam: [8, 1.8, 40], look: [30, 1.5, 60] },
  { name: '75-hosp-planters', cam: [-11, 1.6, -5.5], look: [-18, 0.6, -0.5] },
];
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => errors.push(String(e.message || e).slice(0, 300))); page.on('console', (m) => { if (m.type() === 'error' && !/favicon|404/.test(m.text())) errors.push(m.text().slice(0, 200)); });
  await page.evaluateOnNewDocument((q) => { localStorage.setItem('colombo.settings.v1', JSON.stringify({ quality: q, showFps: false })); }, Q);
  await page.goto('http://localhost:' + (process.env.PORT || 5204) + '/?test&quick=play', { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__game && window.__game.stepSim && window.__game.mode === 'play', { timeout: 900000, polling: 1000 });
  const setup = await page.evaluate(async () => { const g = window.__game, P = g.player; g.noRender = true; g.story.cancelAll(); g.story.running = null; g.atmos.hour = 9.5;
    g.atmos.setWeather && g.atmos.setWeather('clear', true); g.atmos.wet = 0; g.hud.show(false);
    const H = g.hospital; const [x, z] = H.toWorld(0, 33); P.teleport(x, z, 0); g.world.warm(x, z); await g.stepSim(30, 0.1);
    const trees = g.world.plan.trees.filter((t) => t.x > 600 && t.x < 720 && t.z > -300 && t.z < -170).map((t) => t.type);
    return { trees, gardenChars: H.garden.charCount, shown: H.garden.shown, people: H.garden.people.map((p) => [p.ch.root.visible, +p.ch.root.position.y.toFixed(3)]) }; });
  console.log('setup', JSON.stringify(setup));
  for (const s of SHOTS) {
    const r = await page.evaluate(async (s) => { const g = window.__game, P = g.player, H = g.hospital; const [px, pz] = H.toWorld(0, 33);
      for (let i = 0; i < 20; i++) { P.x = px; P.z = pz; await g.stepSim(1, 0.1); }
      const [cx, cz] = H.toWorld(s.cam[0], s.cam[2]), [lx, lz] = H.toWorld(s.look[0], s.look[2]); const y0 = H.FLOOR_Y[0];
      P.camOverride = true; g.camera.position.set(cx, y0 + s.cam[1], cz); g.camera.lookAt(lx, y0 + s.look[1], lz); g.camera.updateMatrixWorld();
      g.noRender = false; let calls = 0; for (let k = 0; k < 3; k++) { g.scene.updateMatrixWorld(); g.renderer.info.reset(); if (g.post) g.post.render(1 / 60); else g.renderer.render(g.scene, g.camera); calls = g.renderer.info.render.calls; }
      const url = g.renderer.domElement.toDataURL('image/png'); g.noRender = true; P.camOverride = false;
      const w = H.garden.walker; return { url, calls, walker: [+w.x.toFixed(1), +w.z.toFixed(1)], upd: H.garden.stats.updates };
    }, s);
    if (r.url) { fs.writeFileSync(`${OUT}/${s.name}.png`, Buffer.from(r.url.split(',')[1], 'base64')); delete r.url; }
    console.log('shot', s.name, JSON.stringify(r));
  }
} catch (e) { console.log('ERR', (e.stack || e.message).split('\n').slice(0, 4).join(' / ')); } finally { await Promise.race([browser.close(), new Promise((r) => setTimeout(r, 10000))]); try { browser.process() && browser.process().kill('SIGKILL'); } catch (e) { /* gone */ } }
console.log('errors:', errors.slice(0, 6).join(' | ') || 'none');
