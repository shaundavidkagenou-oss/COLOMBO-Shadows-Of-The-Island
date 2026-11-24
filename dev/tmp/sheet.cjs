const sharp = require('/home/user/testenv/node_modules/sharp'); const [out, cols, ...files] = process.argv.slice(2);
(async () => { const W = 640, H = 420, C = +cols, R = Math.ceil(files.length / C); const comp = files.map((f, i) => ({ input: f, left: (i % C) * W, top: Math.floor(i / C) * H }));
  await sharp({ create: { width: W * C, height: H * R, channels: 3, background: '#000' } }).composite(comp).jpeg({ quality: 80 }).toFile(out); console.log(out); })();
