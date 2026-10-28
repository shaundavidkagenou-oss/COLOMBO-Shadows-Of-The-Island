// Headless scenario runner (development only — not part of the game build).
// Usage (from a folder with puppeteer-core@23 + @sparticuz/chromium@131 installed; see dev/headless/README.md):
//   LD_LIBRARY_PATH=/tmp/al2023/lib:/tmp node play.mjs "http://localhost:5173/?test&quick=play" scenario.json 960 540 [outDir]
// scenario.json = [{ label, js, wait?, shot? }]; `js` is the body of an async function receiving g = window.__game.
// Each step's return value is printed; `shot` saves a PNG (after `wait` ms) into outDir (default /tmp).
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import fs from 'fs';
import path from 'path';

const [url, scen, W = '960', H = '540', outDir = '/tmp'] = process.argv.slice(2);
const steps = JSON.parse(fs.readFileSync(scen, 'utf8'));
const errors = []; let lastError = null;
const browser = await puppeteer.launch({
  executablePath: await chromium.executablePath(), headless: true, protocolTimeout: 900000,
  args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', `--window-size=${W},${H}`],
  defaultViewport: { width: +W, height: +H },
});
try {
  const page = await browser.newPage(); await page.setCacheEnabled(false);
  page.on('pageerror', (e) => { errors.push(String(e.message || e)); lastError = String(e.stack || e); });
  page.on('console', (m) => { if (m.type() === 'error') { const t = m.text(); if (!/favicon|404/.test(t)) errors.push(t); } });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__game && window.__game.stepSim && window.__game.mode === 'play', { timeout: 600000, polling: 1000 });
  for (const st of steps) {
    let res;
    for (let attempt = 0; attempt < 2; attempt++) {
      try { res = await page.evaluate(new Function('return (async () => { const g = window.__game; ' + st.js + ' })();')); break; }
      catch (e) { if (attempt || !/timed out/i.test(String(e))) { res = 'ERROR ' + String(e.message || e).split('\n')[0]; break; } }
    }
    console.log(st.label, JSON.stringify(res));
    if (st.shot) { await new Promise((r) => setTimeout(r, st.wait || 1500)); const f = path.join(outDir, st.shot); await page.screenshot({ path: f }); console.log('shot', st.shot); }
  }
} finally { await browser.close(); }
console.log('errors:', errors.length ? errors.slice(0, 8).join(' | ') : 'none'); console.log('lastError', lastError ? lastError.split('\n').slice(0, 3).join(' ') : 'none');
