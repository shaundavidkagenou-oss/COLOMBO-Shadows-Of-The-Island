// 95th: vegetation memory census (headless Chromium, the real game): GPU-side geometry bytes per material (sum of every
// unique BufferGeometry's attributes + index in the scene — BatchedMesh stores count once), the JS heap, and the renderer's
// geometry / texture counts. Run against the baseline and the modified build to compare.
//   PORT=5199 node tools/veg-mem.mjs [label]
import puppeteer from '/home/user/testenv/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
import chromium from '/home/user/testenv/node_modules/@sparticuz/chromium/build/index.js';
const PORT = process.env.PORT || 5199, LABEL = process.argv[2] || 'run';
const browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), headless: true, protocolTimeout: 1800000,
  args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info', '--window-size=640,360'], defaultViewport: { width: 640, height: 360 } });
try {
  const page = await browser.newPage();
  page.on('error', (e) => console.log('PAGE CRASH', String(e))); page.on('pageerror', (e) => console.log('pageerror', String(e.message || e).slice(0, 300))); page.on('console', (m) => { if (m.type() === 'error') console.log('console', m.text().slice(0, 200)); }); page.on('framenavigated', (f) => { if (f === page.mainFrame()) console.log('navigated', f.url()); });
  await page.evaluateOnNewDocument(() => localStorage.setItem('colombo.settings.v1', JSON.stringify({ quality: 'medium', showFps: false })));
  await page.goto(`http://localhost:${PORT}/?test&quick=play`, { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__game && window.__game.stepSim && window.__game.mode === 'play', { timeout: 900000, polling: 1000 });
  const R = await page.evaluate(async () => {
    const g = window.__game; g.noRender = true; await g.stepSim(20, 0.05);
    const seen = new Set(), by = {}; let total = 0;
    const bytes = (geo) => { let b = 0; const at = geo.attributes || {}; for (const k in at) { const a = at[k]; b += (a && a.array ? a.array.byteLength : 0); } if (geo.index && geo.index.array) b += geo.index.array.byteLength; return b; };
    g.scene.traverse((o) => { try { if (!o.geometry || seen.has(o.geometry)) return; seen.add(o.geometry); const m = Array.isArray(o.material) ? o.material[0] : o.material; const k = (m && m.name) || (o.name || '?'); const b = bytes(o.geometry); by[k] = (by[k] || 0) + b; total += b; } catch { /* skip */ } });
    const top = Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 14).map(([k, b]) => [k, +(b / 1048576).toFixed(1)]);
    const info = g.renderer.info.memory;
    return { totalMB: +(total / 1048576).toFixed(1), heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(0) : null, geometries: info.geometries, textures: info.textures, top };
  });
  console.log(LABEL, JSON.stringify(R));
} catch (e) { console.log('ERR', e); }
await browser.close();
