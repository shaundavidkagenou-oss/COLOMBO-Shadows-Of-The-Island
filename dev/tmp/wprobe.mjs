import puppeteer from '/home/user/testenv/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
import chromium from '/home/user/testenv/node_modules/@sparticuz/chromium/build/index.js';
const browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), headless: true, protocolTimeout: 600000, args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'], defaultViewport: { width: 640, height: 360 } });
try { const page = await browser.newPage();
  await page.goto('http://localhost:5199/index.html', { waitUntil: 'domcontentloaded', timeout: 300000 });
  const mods = (process.env.MODS || '/src/world/BuildingGen.js,/src/vehicles/VehicleModels.js,/src/world/CityPlan.js,/src/world/Layout.js,/src/gfx/MeshBuilder.js,/src/actors/Crowd.js').split(',');
  const R = await page.evaluate(async (mods) => { const out = {}; for (const m of mods) { out[m] = await new Promise((res) => { const src = `import(${JSON.stringify(location.origin + m)}).then(() => postMessage('ok'), (e) => postMessage('ERR ' + (e && (e.stack || e.message) || e)));`; const w = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })), { type: 'module' }); w.onmessage = (e) => { res(String(e.data).slice(0, 600)); w.terminate(); }; w.onerror = (e) => { res('onerror ' + (e.message || '')); w.terminate(); }; setTimeout(() => res('timeout'), 120000); }); } return out; }, mods);
  for (const [k, v] of Object.entries(R)) console.log(k, '→', v);
} finally { await browser.close(); }
