// dev helper: contact sheet of viewer shots (left half of each = side view), 3 per row
import sharp from 'sharp';
const [out, half, ...files] = process.argv.slice(2); const W = 640, H = 360; const cols = 3, rows = Math.ceil(files.length / cols);
const tiles = await Promise.all(files.map(async (f) => (half === 'L' ? sharp(f).extract({ left: 0, top: 0, width: 640, height: 720 }) : half === 'R' ? sharp(f).extract({ left: 640, top: 0, width: 640, height: 720 }) : sharp(f)).resize(W, H, { fit: 'contain', background: '#8d9aa6' }).png().toBuffer()));
await sharp({ create: { width: W * cols, height: H * rows, channels: 3, background: '#8d9aa6' } }).composite(tiles.map((b, i) => ({ input: b, left: (i % cols) * W, top: Math.floor(i / cols) * H }))).png().toFile(out);
