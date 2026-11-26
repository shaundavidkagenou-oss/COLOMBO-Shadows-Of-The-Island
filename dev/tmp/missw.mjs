import puppeteer from '/home/user/testenv/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
import chromium from '/home/user/testenv/node_modules/@sparticuz/chromium/build/index.js';
const browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), headless: true, protocolTimeout: 1800000, args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=640,360'], defaultViewport: { width: 640, height: 360 } });
try { const page = await browser.newPage(); page.on('pageerror', (e) => console.log('ERR', e.message));
  await page.evaluateOnNewDocument(() => { localStorage.setItem('colombo.settings.v1', JSON.stringify({ quality: 'low', showFps: false, cpuWorkers: 0 })); });
  await page.goto('http://localhost:5199/?test&quick=play', { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__game && window.__game.stepSim && window.__game.mode === 'play', { timeout: 900000, polling: 1000 });
  const R = await page.evaluate(async () => { const g = window.__game; g.noRender = true; const W = g.world; const { plan } = await import('/src/world/CityPlan.js');
    const P = g.player; const out = []; for (let k = 0; k < 40; k++) { g.updatePlay(1 / 30); await new Promise((r) => setTimeout(r, 0)); }
    for (const c of W.chunks) { const d = Math.max(0, Math.hypot(c.cx - P.x, c.cz - P.z) - 200 * 0.7); if (d < W.windowRadius && !c.win) out.push({ idx: c.idx, d: +d.toFixed(1), n: plan.byChunk[c.idx].buildings.length, det: !!c.detail, keep: !!c.keep, wjob: W.wjob && W.wjob.c === c }); }
    return { p: [P.x, P.z], wr: W.windowRadius, out, wjob: W.wjob ? W.wjob.c.idx : null }; });
  console.log(JSON.stringify(R));
} finally { await browser.close(); }
