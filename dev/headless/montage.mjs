// montage PNGs into a grid using puppeteer canvas
import puppeteer from 'puppeteer-core'; import chromium from '@sparticuz/chromium'; import fs from 'fs';
const [out, cols, ...files] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: await chromium.executablePath(), args: chromium.args, headless: true });
const p = await b.newPage(); const imgs = files.map(f => 'data:image/png;base64,' + fs.readFileSync(f).toString('base64'));
const data = await p.evaluate(async (imgs, cols) => { const ims = await Promise.all(imgs.map(s => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = s; })));
  const w = ims[0].width / 2, h = ims[0].height / 2, rows = Math.ceil(ims.length / cols); const c = document.createElement('canvas'); c.width = w * cols; c.height = h * rows; const g = c.getContext('2d');
  ims.forEach((im, k) => g.drawImage(im, (k % cols) * w, Math.floor(k / cols) * h, w, h)); return c.toDataURL('image/png'); }, imgs, +cols);
fs.writeFileSync(out, Buffer.from(data.split(',')[1], 'base64')); await b.close();
