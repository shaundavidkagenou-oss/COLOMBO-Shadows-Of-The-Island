// Screenshots of dev/normals.html (surface relief bench): node tools/normals-bench.mjs outDir "view:sun:nm[:az]" …   (PORT env, default 5197)
import puppeteer from '/home/user/testenv/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
import chromium from '/home/user/testenv/node_modules/@sparticuz/chromium/build/index.js';
import fs from 'fs';
const [outDir = '/tmp/nb', ...cases] = process.argv.slice(2); fs.mkdirSync(outDir, { recursive: true });
const browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), headless: true, protocolTimeout: 600000,
  args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--window-size=1280,720'], defaultViewport: { width: 1280, height: 720 } });
try {
  for (const c of cases) { const [view, sun, nm, az = 35, i = ''] = c.split(':'); const page = await browser.newPage(); const errs = [];
    page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
    await page.goto(`http://localhost:${process.env.PORT || 5197}/dev/normals.html?view=${view}&sun=${sun}&nm=${nm}&az=${az}${i !== '' ? '&i=' + i : ''}`, { waitUntil: 'domcontentloaded', timeout: 300000 });
    await page.waitForFunction(() => window.__ready, { timeout: 300000, polling: 500 });
    const f = `${outDir}/${view}${i}-${sun}-${az}-${nm === '0' ? 'off' : 'on'}.png`; await page.screenshot({ path: f }); console.log('shot', f, errs.slice(0, 3).join(' | ')); await page.close(); }
} catch (e) { console.log('ERR', e.message); } finally { await browser.close(); }
