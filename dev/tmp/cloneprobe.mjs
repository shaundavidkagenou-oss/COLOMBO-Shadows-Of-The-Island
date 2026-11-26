import puppeteer from '/home/user/testenv/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
import chromium from '/home/user/testenv/node_modules/@sparticuz/chromium/build/index.js';
const browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), headless: true, protocolTimeout: 1800000, args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=640,360'], defaultViewport: { width: 640, height: 360 } });
try { const page = await browser.newPage(); page.on('pageerror', (e) => console.log('ERR', e.message));
  await page.evaluateOnNewDocument(() => { localStorage.setItem('colombo.settings.v1', JSON.stringify({ quality: 'low', showFps: false, cpuWorkers: 1 })); });
  await page.goto('http://localhost:5199/?test&quick=play', { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__game && window.__game.stepSim && window.__game.mode === 'play', { timeout: 900000, polling: 1000 });
  const R = await page.evaluate(async () => { const g = window.__game; g.noRender = true; const { plan } = await import('/src/world/CityPlan.js');
    const out = []; const byN = plan.byChunk.map((c, i) => [i, c.buildings.length]).sort((a, b) => b[1] - a[1]).slice(0, 4);
    const w = new Worker(URL.createObjectURL(new Blob(['onmessage=()=>{}'], { type: 'text/javascript' })));
    for (const [ci, n] of byN) { const bs = plan.byChunk[ci].buildings; let t = performance.now(); const c = structuredClone(bs); const tc = performance.now() - t; t = performance.now(); w.postMessage({ bs }); const tp = performance.now() - t;
      t = performance.now(); const js = JSON.stringify(bs); const tj = performance.now() - t; const keys = {}; for (const b of bs) for (const k in b) { const v = b[k]; const s = JSON.stringify(v); keys[k] = (keys[k] || 0) + (s ? s.length : 0); }
      out.push({ ci, n, cloneMs: +tc.toFixed(1), postMs: +tp.toFixed(1), jsonKB: Math.round(js.length / 1024), jsonMs: +tj.toFixed(1), top: Object.entries(keys).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => k + ':' + Math.round(v / 1024)) }); }
    return out; });
  console.log(JSON.stringify(R, null, 1));
} finally { await browser.close(); }
