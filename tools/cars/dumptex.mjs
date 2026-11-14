// node tools/cars/dumptex.mjs <src.glb> <outdir> : writes each material's base-colour texture as PNG (for audits)
import { loadDoc } from './lib.mjs'; import sharp from 'sharp'; import fs from 'fs';
const [src, out] = process.argv.slice(2); fs.mkdirSync(out, { recursive: true }); const doc = await loadDoc(src);
for (const m of doc.getRoot().listMaterials()) { const t = m.getBaseColorTexture(); if (!t) continue; const f = `${out}/${m.getName().replace(/[^\w.-]/g, '_')}.png`; await sharp(Buffer.from(t.getImage())).resize(512, 512, { fit: 'inside' }).png().toFile(f); console.log(f, t.getMimeType(), t.getSize()); }
