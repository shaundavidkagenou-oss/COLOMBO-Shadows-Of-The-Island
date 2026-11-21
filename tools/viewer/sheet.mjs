// Dev tool: screenshot a local HTML contact sheet (node tools/viewer/sheet.mjs sheet.html out.png W H)
import puppeteer from '/home/user/testenv/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
import chromium from '/home/user/testenv/node_modules/@sparticuz/chromium/build/index.js';
const [file, out, W = '1920', H = '720'] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: await chromium.executablePath(), headless: true, args: chromium.args, defaultViewport: { width: +W, height: +H } });
const p = await b.newPage(); await p.goto('file://' + file, { waitUntil: 'load' }); await p.screenshot({ path: out }); await b.close();
