// 74th — memory over repeated hospital visits: in (lobby) → upstairs (ward) → out (street), N rounds, rendering on, with
// the hospital's own meshes / geometries counted apart from the city (traffic, pedestrians, streamed props).
//   PORT=5200 ROUNDS=8 node tools/hospital-memprobe.mjs
import puppeteer from '/home/user/testenv/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
import chromium from '/home/user/testenv/node_modules/@sparticuz/chromium/build/index.js';
const browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), headless: true, protocolTimeout: 1800000,
  args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info', '--js-flags=--expose-gc', '--window-size=640,360'], defaultViewport: { width: 640, height: 360 } });
const errors = [];
try {
  const page = await browser.newPage(); page.on('pageerror', (e) => errors.push(String(e.message || e).slice(0, 300)));
  await page.evaluateOnNewDocument(() => { localStorage.setItem('colombo.settings.v1', JSON.stringify({ quality: 'medium', showFps: false })); });
  await page.goto('http://localhost:' + (process.env.PORT || 5200) + '/?test&quick=play', { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__game && window.__game.stepSim && window.__game.mode === 'play', { timeout: 900000, polling: 1000 });
  await page.evaluate(() => { const g = window.__game; g.story.cancelAll(); g.story.running = null; g.atmos.hour = 11; });
  const N = +(process.env.ROUNDS || 8);
  for (let i = 0; i < N; i++) {
    const m = await page.evaluate(async () => { const g = window.__game, P = g.player, H = g.hospital;
      H.placeInside(P, 655, -195, 0); await g.stepSim(20, 0.05); H.placeInside(P, 652, -194, 1); await g.stepSim(20, 0.05); P.teleport(660, -150, Math.PI); g.world.warm(660, -150); await g.stepSim(20, 0.05);
      if (window.gc) window.gc(); const R = g.renderer; const geos = new Set(); let hm = 0; g.world.hospitalBuild.root.traverse((q) => { if (q.isMesh) { hm++; geos.add(q.geometry); } });
      let sm = 0; g.scene.traverse((q) => { if (q.isMesh) sm++; });
      return { heapMB: +(performance.memory.usedJSHeapSize / 1048576).toFixed(1), geometries: R.info.memory.geometries, textures: R.info.memory.textures, programs: R.info.programs.length,
        hospMeshes: hm, hospGeos: geos.size, hospChars: H.charCount, sceneMeshes: sm, traffic: g.traffic.vehicles.length, peds: g.crowd.peds.length, ems: g.ems ? (g.ems.units || []).length : null }; });
    console.log('round ' + (i + 1) + ' ' + JSON.stringify(m));
  }
} catch (e) { errors.push('ERR ' + String(e).slice(0, 300)); }
console.log('errors:', errors.join(' | ') || 'none');
await browser.close();
