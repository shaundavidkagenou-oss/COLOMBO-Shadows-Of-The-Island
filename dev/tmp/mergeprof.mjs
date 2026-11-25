import puppeteer from '/home/user/testenv/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
import chromium from '/home/user/testenv/node_modules/@sparticuz/chromium/build/index.js';
const browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), headless: true, protocolTimeout: 1800000, args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=640,360'], defaultViewport: { width: 640, height: 360 } });
try { const page = await browser.newPage(); page.on('pageerror', (e) => console.log('ERR', e.message));
  await page.evaluateOnNewDocument(() => { localStorage.setItem('colombo.settings.v1', JSON.stringify({ quality: 'high', showFps: false, cpuWorkers: 1 })); });
  await page.goto('http://localhost:5199/?test&quick=play', { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__game && window.__game.stepSim && window.__game.mode === 'play', { timeout: 900000, polling: 1000 });
  const R = await page.evaluate(async () => { const g = window.__game; g.noRender = true; const W = g.world; const { plan } = await import('/src/world/CityPlan.js'); const GJ = await import('/src/world/GeoJobs.js');
    const CB = await import('/src/gfx/CellBatch.js'); const MB = await import('/src/gfx/MeshBuilder.js'); const THREE = window.__THREE;
    const T = {}; const wrap = (obj, name, tag) => { const f = obj[name]; obj[name] = function (...a) { const t = performance.now(); try { return f.apply(this, a); } finally { T[tag] = (T[tag] || 0) + performance.now() - t; } }; };
    wrap(CB.RangeBatch.prototype, 'step', 'rangeStep'); wrap(MB.SliceBuild.prototype, 'step', 'sliceStep'); wrap(THREE.BatchedMesh.prototype, 'addGeometry', 'addGeometry'); wrap(THREE.BatchedMesh.prototype, 'computeBoundingBox', 'bmBox'); wrap(THREE.BatchedMesh.prototype, 'computeBoundingSphere', 'bmSphere');
    wrap(THREE.BufferGeometry.prototype, 'computeBoundingBox', 'geoBox'); wrap(THREE.BufferGeometry.prototype, 'computeBoundingSphere', 'geoSphere'); wrap(W, 'finishWindows', 'finishW'); wrap(W, 'finishDetail', 'finishD');
    const out = { wr: W.windowRadius }; for (const ci of [19, 18]) { const c = W.chunks.find((q) => q.idx === ci); const bs = plan.byChunk[ci].buildings; W.geoForget(c); if (c.win) W.disposeWindows(c); if (c.detail) W.disposeDetail(c);
      for (const kind of ['detail', 'win']) { for (const k in T) delete T[k]; const res = await GJ.submitGeo(kind, bs, () => 0); const t = performance.now(); const J = GJ.jobFromWorker(c, kind, bs, res); J.sync = true; W.stepJob(J, Infinity); const tot = performance.now() - t;
        out[ci + kind] = { tot: Math.round(tot), ...Object.fromEntries(Object.entries(T).map(([k, v]) => [k, Math.round(v)])) }; } }
    return out; });
  console.log(JSON.stringify(R));
} finally { await browser.close(); }
