// Dev tool: screenshot the model viewer (tools/viewer) for one or more vehicle types.
//   npx vite build tools/viewer --outDir /tmp/bview && (serve /tmp/bview on PORT) && node tools/viewer/shoot.mjs outDir type[:views] …
import puppeteer from '/home/user/testenv/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
import chromium from '/home/user/testenv/node_modules/@sparticuz/chromium/build/index.js';
const [outDir, ...types] = process.argv.slice(2); const W = 1280, H = 720;
const browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), headless: true, protocolTimeout: 600000,
  args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', `--window-size=${W},${H}`], defaultViewport: { width: W, height: H } });
try {
  for (const spec of types) { const [type, views, seed, hide] = spec.split(':'); const page = await browser.newPage(); const errs = [];
    page.on('pageerror', (e) => errs.push(String(e.message || e))); page.on('console', (m) => { if (m.type() === 'error' || m.text().startsWith('parts')) errs.push(m.text()); });
    const t0 = Date.now(); await page.goto(`http://127.0.0.1:${process.env.PORT || 5202}/index.html?${type.startsWith('floors=') ? type : 'type=' + type}&seed=${seed || 1}&w=${W}&h=${H}${views ? '&views=' + views : ''}${hide ? '&hide=' + hide : ''}`, { waitUntil: 'load', timeout: 300000 });
    await page.waitForFunction(() => window.__ready, { timeout: 300000, polling: 500 });
    const name = `${type.replace('floors=', 'floors_').replace(/,/g, '-')}${views ? '_' + views.replace(/,/g, '-') : ''}${seed ? '_s' + seed : ''}${hide ? '_h' + hide.replace(/,/g, '-') : ''}`; await page.screenshot({ path: `${outDir}/${name}.png` });
    console.log('shot', name, ((Date.now() - t0) / 1000).toFixed(1) + 's', errs.slice(0, 3).join(' | ')); await page.close(); }
} catch (e) { console.log('ERR', e.message); } finally { await browser.close(); }
