// node bv.mjs out.jpg "query" [more "out|query" pairs...] — screenshots the boat-view dev tool through the vite dev server
import { createRequire } from 'module'; const require = createRequire('/home/user/testenv/package.json'); const puppeteer = require('puppeteer-core'); const chromium = require('@sparticuz/chromium');
const port = process.env.VPORT || 5198; const jobs = process.argv.slice(2).map((a) => a.split('|'));
const browser = await puppeteer.launch({ executablePath: await (chromium.default || chromium).executablePath(), args: [...(chromium.default || chromium).args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'], headless: true });
for (const [out, qs] of jobs) { const page = await browser.newPage(); const errs = []; page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  const w = /w=(\d+)/.exec(qs)?.[1] || 1200, h = /h=(\d+)/.exec(qs)?.[1] || 800; await page.setViewport({ width: +w, height: +h });
  await page.goto(`http://127.0.0.1:${port}/tools/boat-view/index.html?${qs}`, { waitUntil: 'load', timeout: 180000 }); await page.waitForFunction('window.__ready === true', { timeout: 180000 }).catch(() => errs.push('timeout'));
  const r = await page.evaluate(() => window.__result); const c = await page.$('canvas'); if (c) await c.screenshot({ path: out, type: 'jpeg', quality: 85 }); console.log(out, JSON.stringify(r), errs.slice(0, 3).join(' | ')); await page.close(); }
await browser.close();
