const sharp = require('sharp'); const fs = require('fs');
(async () => { const names = fs.readdirSync('/tmp/new52').filter((f) => f.endsWith('.png') && fs.existsSync('/tmp/old52/' + f));
  for (const f of names) { const W = 640, H = 360; const a = await sharp('/tmp/old52/' + f).resize(W, H).toBuffer(), b = await sharp('/tmp/new52/' + f).resize(W, H).toBuffer();
    const lab = (t) => Buffer.from(`<svg width="${W}" height="28"><rect width="${W}" height="28" fill="#000" opacity="0.7"/><text x="10" y="20" font-family="sans-serif" font-size="16" fill="#fff">${t}</text></svg>`);
    await sharp({ create: { width: W * 2 + 6, height: H, channels: 3, background: '#222' } }).composite([{ input: a, left: 0, top: 0 }, { input: lab('BEFORE (8d5d84a)'), left: 0, top: 0 }, { input: b, left: W + 6, top: 0 }, { input: lab('AFTER (52nd)'), left: W + 6, top: 0 }]).jpeg({ quality: 82 }).toFile('dev/ref/p52/' + f.replace('.png', '.jpg'));
    console.log(f); } })();
