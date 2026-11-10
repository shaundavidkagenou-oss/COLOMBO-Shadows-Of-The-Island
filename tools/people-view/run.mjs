// node tools/people-view/run.mjs outDir "set=police&view=front" ["set=civ&view=legs" …]   (serve the build on PORT first)
import puppeteer from '/home/user/testenv/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
import chromium from '/home/user/testenv/node_modules/@sparticuz/chromium/build/index.js';
import fs from 'fs';
const [outDir, ...qs] = process.argv.slice(2); fs.mkdirSync(outDir, { recursive: true });
const browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), headless: true, protocolTimeout: 900000,
  args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--window-size=1600,900'], defaultViewport: { width: 1600, height: 900 } });
try { for (const qq of qs) { const page = await browser.newPage(); const errs = []; page.on('pageerror', (e) => errs.push(String(e.message || e))); page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  const t0 = Date.now(); await page.goto(`http://127.0.0.1:${process.env.PORT || 5204}/index.html?${qq}`, { waitUntil: 'domcontentloaded' }); await page.waitForFunction(() => window.__ready, { timeout: 600000, polling: 500 });
  const r = await page.evaluate(() => window.__result); const name = qq.replace(/[&=,]/g, '_'); await (await page.$('canvas')).screenshot({ path: `${outDir}/${name}.png` });
  console.log(name, ((Date.now() - t0) / 1000).toFixed(0) + 's', JSON.stringify(r), errs.slice(0, 3).join(' | ')); await page.close(); } }
finally { await browser.close(); }
