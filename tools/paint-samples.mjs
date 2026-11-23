// Test assets for the environment editor (console `paint`): writes small but real glTF assets with PBR texture sets, the
// kind downloaded from asset sites — used by tools/paint-test.mjs and handy for trying the editor.
//   grass/   grass_clump.gltf + grass_clump.bin + textures/grass_albedo.png (alpha cut-out), and the separate maps
//            grass_normal.png, grass_ao.png, grass_roughness.png (assigned in the material editor)
//   rock.glb       one material, base colour + normal embedded
//   moss_rock.glb  two materials (stone + moss cap) — a multi-material asset
//   plant.gltf     leaf cards + .bin + leaf texture
// `node tools/paint-samples.mjs [outDir]` (default dev/tmp/paint-samples)
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { Document, NodeIO } from '@gltf-transform/core';

const OUT = path.resolve(process.argv[2] || 'dev/tmp/paint-samples'); fs.mkdirSync(path.join(OUT, 'grass', 'textures'), { recursive: true });
let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
async function png(w, h, ch, fn) { const b = Buffer.alloc(w * h * ch); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const v = fn(x / w, y / h); for (let c = 0; c < ch; c++) b[(y * w + x) * ch + c] = Math.max(0, Math.min(255, Math.round(v[c] * 255))); } return sharp(b, { raw: { width: w, height: h, channels: ch } }).png().toBuffer(); }
const hash = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
const vnoise = (x, y) => { const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j; const a = hash(i, j), b = hash(i + 1, j), c = hash(i, j + 1), d = hash(i + 1, j + 1); const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy); return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; };
const fbm = (x, y) => vnoise(x, y) * 0.5 + vnoise(x * 2.1, y * 2.1) * 0.25 + vnoise(x * 4.3, y * 4.3) * 0.125 + vnoise(x * 8.7, y * 8.7) * 0.0625;

// grass blade atlas: 8 blades across, alpha cut-out (u across, v up from the root at the bottom of the image)
const blade = (u, v) => { const k = Math.floor(u * 8), c = (k + 0.5) / 8 + (hash(k, 1) - 0.5) * 0.03, top = 0.55 + hash(k, 2) * 0.43; const t = 1 - v; const w = 0.045 * (1 - t / top) * (0.6 + hash(k, 3) * 0.6); const bend = (hash(k, 4) - 0.5) * 0.06 * t * t; return { inside: t < top && Math.abs(u - c - bend) < w, t: t / top, k, d: (u - c - bend) / Math.max(w, 1e-3) }; };
const albedo = await png(256, 256, 4, (u, v) => { const b = blade(u, v); const g = 0.55 + 0.35 * b.t; return b.inside ? [0.18 * g + hash(b.k, 5) * 0.06, 0.42 * g + 0.08, 0.12 * g, 1] : [0.2, 0.35, 0.1, 0]; });
const gnormal = await png(256, 256, 3, (u, v) => { const b = blade(u, v); return b.inside ? [0.5 + b.d * 0.35, 0.5, 1] : [0.5, 0.5, 1]; });
const gao = await png(256, 256, 3, (u, v) => { const b = blade(u, v); const a = b.inside ? 0.35 + 0.65 * Math.min(1, b.t * 1.6) : 1; return [a, a, a]; });
const grough = await png(256, 256, 3, (u, v) => { const b = blade(u, v); const r = b.inside ? 0.55 + 0.3 * Math.abs(b.d) : 1; return [r, r, r]; });
const stoneC = await png(256, 256, 3, (u, v) => { const n = fbm(u * 8, v * 8); const g = 0.32 + n * 0.35; return [g * 1.02, g, g * 0.95]; });
const stoneN = await png(256, 256, 3, (u, v) => { const e = 1 / 256, n = fbm(u * 8, v * 8), nx = fbm((u + e) * 8, v * 8) - n, ny = fbm(u * 8, (v + e) * 8) - n; return [0.5 - nx * 6, 0.5 - ny * 6, 1]; });
const mossC = await png(256, 256, 3, (u, v) => { const n = fbm(u * 14, v * 14); return [0.16 + n * 0.12, 0.3 + n * 0.25, 0.08 + n * 0.06]; });
const leafC = await png(256, 256, 4, (u, v) => { const x = (u - 0.5) * 2, y = v; const w = Math.sin(Math.PI * y) * 0.85; const inside = Math.abs(x) < w && y > 0.02 && y < 0.98; const vein = Math.abs(x) < 0.03 ? 0.75 : 1; return [0.15 * vein, 0.45 * vein + fbm(u * 9, v * 9) * 0.1, 0.12, inside ? 1 : 0]; });
fs.writeFileSync(path.join(OUT, 'grass', 'textures', 'grass_albedo.png'), albedo);
fs.writeFileSync(path.join(OUT, 'grass', 'grass_normal.png'), gnormal); fs.writeFileSync(path.join(OUT, 'grass', 'grass_ao.png'), gao); fs.writeFileSync(path.join(OUT, 'grass', 'grass_roughness.png'), grough);

function prim(doc, buf, P, N, U, I, mat) {
  const acc = (t, arr) => doc.createAccessor().setType(t).setArray(arr).setBuffer(buf);
  const p = doc.createPrimitive().setAttribute('POSITION', acc('VEC3', new Float32Array(P))).setAttribute('NORMAL', acc('VEC3', new Float32Array(N))).setAttribute('TEXCOORD_0', acc('VEC2', new Float32Array(U))).setIndices(acc('SCALAR', new Uint16Array(I))).setMaterial(mat); return p;
}
function cards(n, w, hgt, spread, lean) { const P = [], N = [], U = [], I = []; for (let c = 0; c < n; c++) { const a = (c / n) * Math.PI + rnd() * 0.3, ox = (rnd() - 0.5) * spread, oz = (rnd() - 0.5) * spread, ca = Math.cos(a), sa = Math.sin(a), h = hgt * (0.75 + rnd() * 0.5), l = (rnd() - 0.5) * lean;
  const v0 = P.length / 3; const pts = [[-w / 2, 0], [w / 2, 0], [w / 2 + l, h], [-w / 2 + l, h]]; const uv = [[0, 1], [1, 1], [1, 0], [0, 0]];
  pts.forEach(([x, y], i) => { P.push(ox + x * ca, y, oz + x * sa); N.push(-sa * 0.5, 0.85, ca * 0.5); U.push(uv[i][0], uv[i][1]); }); I.push(v0, v0 + 1, v0 + 2, v0, v0 + 2, v0 + 3); } return { P, N, U, I }; }
function rockGeo(r, seg, squash) { const P = [], N = [], U = [], I = []; for (let j = 0; j <= seg; j++) { const th = (j / seg) * Math.PI; for (let i = 0; i <= seg * 2; i++) { const ph = (i / (seg * 2)) * Math.PI * 2; const nx = Math.sin(th) * Math.cos(ph), ny = Math.cos(th), nz = Math.sin(th) * Math.sin(ph); const k = 1 + (fbm(nx * 2 + 5, nz * 2 + ny * 3) - 0.45) * 0.55; P.push(nx * r * k, (ny * squash + squash * 0.8) * r * k, nz * r * k); N.push(nx, ny, nz); U.push(i / (seg * 2) * 2, j / seg); } }
  for (let j = 0; j < seg; j++) for (let i = 0; i < seg * 2; i++) { const a = j * (seg * 2 + 1) + i, b = a + seg * 2 + 1; I.push(a, b, a + 1, a + 1, b, b + 1); } return { P, N, U, I }; }

const io = new NodeIO();
{ // grass clump (.gltf + .bin + external texture)
  const doc = new Document(); const buf = doc.createBuffer().setURI('grass_clump.bin'); const tex = doc.createTexture('grass_albedo').setURI('textures/grass_albedo.png').setMimeType('image/png').setImage(albedo);
  const mat = doc.createMaterial('GrassBlades').setBaseColorTexture(tex).setAlphaMode('MASK').setAlphaCutoff(0.5).setDoubleSided(true).setRoughnessFactor(0.8).setMetallicFactor(0);
  const g = cards(7, 0.55, 0.55, 0.35, 0.18); const mesh = doc.createMesh('grass').addPrimitive(prim(doc, buf, g.P, g.N, g.U, g.I, mat));
  doc.createScene().addChild(doc.createNode('GrassClump').setMesh(mesh)); await io.write(path.join(OUT, 'grass', 'grass_clump.gltf'), doc);
}
{ // rock (glb, embedded textures)
  const doc = new Document(); const buf = doc.createBuffer(); const c = doc.createTexture('stone').setImage(stoneC).setMimeType('image/png'), n = doc.createTexture('stoneN').setImage(stoneN).setMimeType('image/png');
  const mat = doc.createMaterial('Stone').setBaseColorTexture(c).setNormalTexture(n).setRoughnessFactor(0.9).setMetallicFactor(0);
  const g = rockGeo(0.6, 14, 0.7); doc.createScene().addChild(doc.createNode('Rock').setMesh(doc.createMesh('rock').addPrimitive(prim(doc, buf, g.P, g.N, g.U, g.I, mat)))); fs.writeFileSync(path.join(OUT, 'rock.glb'), await io.writeBinary(doc));
}
{ // moss rock: two materials
  const doc = new Document(); const buf = doc.createBuffer(); const c = doc.createTexture('stone').setImage(stoneC).setMimeType('image/png'), m = doc.createTexture('moss').setImage(mossC).setMimeType('image/png');
  const stone = doc.createMaterial('MossRockStone').setBaseColorTexture(c).setRoughnessFactor(0.92).setMetallicFactor(0), moss = doc.createMaterial('MossCap').setBaseColorTexture(m).setRoughnessFactor(1).setMetallicFactor(0);
  const g = rockGeo(0.8, 14, 0.6); const lo = [], hi = []; for (let t = 0; t < g.I.length; t += 3) { const y = (g.P[g.I[t] * 3 + 1] + g.P[g.I[t + 1] * 3 + 1] + g.P[g.I[t + 2] * 3 + 1]) / 3; (y > 0.75 ? hi : lo).push(g.I[t], g.I[t + 1], g.I[t + 2]); }
  const mesh = doc.createMesh('mossrock').addPrimitive(prim(doc, buf, g.P, g.N, g.U, lo, stone)).addPrimitive(prim(doc, buf, g.P, g.N, g.U, hi, moss));
  doc.createScene().addChild(doc.createNode('MossRock').setMesh(mesh)); fs.writeFileSync(path.join(OUT, 'moss_rock.glb'), await io.writeBinary(doc));
}
{ // plant (.gltf + .bin + texture next to it)
  const doc = new Document(); const buf = doc.createBuffer().setURI('plant.bin'); const tex = doc.createTexture('leaf').setURI('leaf.png').setMimeType('image/png').setImage(leafC);
  const mat = doc.createMaterial('Leaves').setBaseColorTexture(tex).setAlphaMode('MASK').setAlphaCutoff(0.4).setDoubleSided(true).setRoughnessFactor(0.7).setMetallicFactor(0);
  const g = cards(9, 0.35, 0.8, 0.2, 0.5); doc.createScene().addChild(doc.createNode('Plant').setMesh(doc.createMesh('plant').addPrimitive(prim(doc, buf, g.P, g.N, g.U, g.I, mat)))); await io.write(path.join(OUT, 'plant.gltf'), doc);
}
console.log('paint samples written to ' + OUT); for (const f of fs.readdirSync(OUT, { recursive: true })) console.log('  ' + f);
