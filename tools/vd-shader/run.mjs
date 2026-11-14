// Runs the vehicle-damage shader check (tools/vd-shader) in headless Chrome: PORT (default 5203) serves the build.
//   node tools/vd-shader/run.mjs outDir [stages=0,1,2,3]
import puppeteer from '/home/user/testenv/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
import chromium from '/home/user/testenv/node_modules/@sparticuz/chromium/build/index.js';
import fs from 'node:fs';
const [outDir = '/tmp/vdsh-shots', stages = '0,1,2,3', types = '', view = ''] = process.argv.slice(2); fs.mkdirSync(outDir, { recursive: true }); const W = 1280, H = 720; let bad = 0;
const browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), headless: true, protocolTimeout: 900000,
  args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', `--window-size=${W},${H}`], defaultViewport: { width: W, height: H } });
try {
  for (const s of stages.split(',')) { const page = await browser.newPage(); const errs = []; page.on('pageerror', (e) => errs.push('pageerror: ' + (e.message || e))); page.on('console', (m) => { if (m.type() === 'error' || /THREE\.WebGL/.test(m.text())) errs.push(m.text().slice(0, 600)); });
    const t0 = Date.now(); await page.goto(`http://127.0.0.1:${process.env.PORT || 5203}/index.html?stage=${s}${types ? '&types=' + types : ''}${view ? '&view=' + view : ''}`, { waitUntil: 'load', timeout: 300000 });
    await page.waitForFunction(() => window.__ready, { timeout: 800000, polling: 1000 }); const R = await page.evaluate(() => window.__result); await page.screenshot({ path: `${outDir}/stage${s}${view ? '_' + view : ''}.png` });
    const all = [...R.errors, ...errs, ...R.glErrs.map((e) => 'gl error ' + e)]; bad += all.length;
    console.log(`stage ${s} (${((Date.now() - t0) / 1000).toFixed(0)} s): programs ${R.programs}, calls ${R.calls}, tris ${R.tris}, wrecked ${R.wrecked}, burning ${R.burning}, pieces ${R.bodies}, stats ${JSON.stringify(R.stats)}`); for (const e of all.slice(0, 12)) console.log('   ERR', e); await page.close(); }
} catch (e) { console.log('ERR', e.message); bad++; } finally { await browser.close(); }
console.log(`vd-shader: ${bad} errors`);
