import puppeteer from '/home/user/testenv/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
import chromium from '/home/user/testenv/node_modules/@sparticuz/chromium/build/index.js';
const SEC = +(process.env.SEC || 6), CF = (process.env.CF || 'ABC').split('');
const browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), headless: true, protocolTimeout: 1800000, args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=640,360'], defaultViewport: { width: 640, height: 360 } });
try { const page = await browser.newPage(); const errs = []; page.on('pageerror', (e) => { errs.push(e.message); console.log('ERR', e.message); });
  page.on('console', (m) => { if (/error|warn/i.test(m.type()) && !/GPU stall|WebGL|SwiftShader/i.test(m.text())) console.log('CON', m.type(), m.text().slice(0, 300)); });
  await page.evaluateOnNewDocument(() => { localStorage.setItem('colombo.settings.v1', JSON.stringify({ quality: 'high', showFps: false, cpuWorkers: 'auto' })); });
  await page.goto('http://localhost:5199/?test&quick=play', { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__game && window.__game.mode === 'play', { timeout: 900000, polling: 1000 });
  await new Promise((r) => setTimeout(r, 3000));
  const BT = await page.evaluate(async () => { const B = await import('/src/world/BankTex.js'); const { poolStats, CPU } = await import('/src/core/WorkerPool.js'); const t0 = performance.now(); const p = B.startBankTextures(); const mid = poolStats().map((q) => [q.name, q.size]); const claims = [...CPU.claims]; const n = await p; return { n, ms: Math.round(performance.now() - t0), mid, claims, after: poolStats().map((q) => [q.name, q.size]), claimsAfter: [...CPU.claims] }; });
  console.log('banktex', JSON.stringify(BT));
  if (process.env.SEC !== '0') {
  const R = await page.evaluate(async (SEC, CF) => { const g = window.__game; const t0 = performance.now(); const rep = await g.runBenchmark({ seconds: SEC, warmup: 2, configs: CF, scene: 'cpu' }); const { CPU, poolStats } = await import('/src/core/WorkerPool.js');
    return { wall: Math.round((performance.now() - t0) / 1000), kind: rep && rep.kind, hwc: rep && rep.hardwareConcurrency, scene: rep && rep.scene, res: rep && rep.results.map((r) => ({ id: r.id, cfg: r.config, mode: r.mode, w: r.workers, pool: r.poolSize, fr: r.frames, fps: r.avgFps, p99: r.p99FrameMs, low1: r.low1Fps, o16: r.over16, o33: r.over33, main: r.mainMs, mainP99: r.mainP99Ms, mainMax: r.mainMaxMs, wj: r.workerJobs, wjMs: r.workerJobMs, wjMax: r.workerJobMaxMs })), after: { override: CPU.override, pools: poolStats().map((p) => [p.name, p.size]) }, csvHead: (await import('/src/gfx/Benchmark.js')).toCSV(rep).split('\n')[0], modal: !!document.querySelector('.bench-tab') }; }, SEC, CF);
  console.log(JSON.stringify(R, null, 1)); }
console.log('errors', errs.length);
} finally { await browser.close(); }
