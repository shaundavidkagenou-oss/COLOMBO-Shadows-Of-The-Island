// Dev tool: screenshots of tools/fort-view.  npx vite build tools/fort-view --base ./ --outDir /tmp/fview && serve on PORT
//   node tools/fort-view/shoot.mjs outDir name:query …
import puppeteer from '/home/user/testenv/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
import chromium from '/home/user/testenv/node_modules/@sparticuz/chromium/build/index.js';
const [outDir, ...specs] = process.argv.slice(2); const W = 1280, H = 720;
const browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), headless: true, protocolTimeout: 900000,
  args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', `--window-size=${W},${H}`], defaultViewport: { width: W, height: H } });
try {
  for (const spec of specs) { const i = spec.indexOf(':'); const name = spec.slice(0, i), qs = spec.slice(i + 1); const page = await browser.newPage(); const errs = [];
    page.on('pageerror', (e) => errs.push(String(e.message || e))); page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text()); });
    const t0 = Date.now(); await page.goto(`http://127.0.0.1:${process.env.PORT || 5203}/index.html?w=${W}&h=${H}&${qs}`);
    await page.waitForFunction(() => window.__ready, { timeout: 600000, polling: 500 });
    const r = await page.evaluate(() => window.__result); await page.screenshot({ path: `${outDir}/${name}.png` });
    console.log('shot', name, ((Date.now() - t0) / 1000).toFixed(1) + 's', JSON.stringify(r), errs.slice(0, 4).join(' | ')); await page.close(); }
} catch (e) { console.log('ERR', e.message); } finally { await browser.close(); }
