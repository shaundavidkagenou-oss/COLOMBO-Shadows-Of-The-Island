// Road surface regression test (63rd request).  node tools/road-surface-test.mjs
//  1. Road007 textures: the four game maps exist, are ≤ 512², the painted lane lines are gone from the albedo (the game paints
//     its own markings per road class), and the tile still wraps seamlessly on both axes.
//  2. No z-fighting in the ground layer: no two overlapping surfaces lie in the same plane unless they are pixel-identical
//     (same material, same vertex colour, horizontal and world-uv'd). Checked over every chunk of GroundBuilder (asphalt, wear
//     overlay, markings, zebra crossings, stop lines, manholes, drains, pavements, kerbs, lots, shoreline, railway):
//       • up-facing horizontal faces: overlapping faces within 0.25 mm of each other's height with a different material or tint
//         (the crossing / stop-line / edge-line / repair-patch / manhole-collar / bridge-footway flicker);
//       • axis-aligned vertical faces in the same plane, any material (the overlapping railway sleepers).
//  3. Layer order on the carriageway: zebra above stop lines above lane lines above the manhole collar above the wear overlay.
import './node-dom-stub.mjs';
import * as THREE from 'three';
import fs from 'fs';
import sharp from 'sharp';
globalThis.localStorage ??= { getItem: () => null, setItem: () => {}, removeItem: () => {} };
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log('ok  ', m); } else { fail++; console.log('FAIL', m); } };

// ---------------------------------------------------------------- 1. textures
const DIR = new URL('../public/assets/road/', import.meta.url).pathname;
{ const files = ['road007_color.jpg', 'road007_normal.jpg', 'road007_rough.jpg', 'road007_paint.jpg']; const meta = [];
  for (const f of files) { const p = DIR + f; if (!fs.existsSync(p)) { meta.push(null); continue; } meta.push(await sharp(p).metadata()); }
  ok(meta.every((m) => m && m.width <= 512 && m.height <= 512), `Road007 maps present and ≤ 512² (${meta.map((m, i) => files[i] + ' ' + (m ? m.width + '×' + m.height : 'missing')).join(', ')})`);
  if (meta[0]) { const { data, info } = await sharp(DIR + files[0]).greyscale().raw().toBuffer({ resolveWithObject: true }); const W = info.width, H = info.height;
    const col = new Float64Array(W); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) col[x] += data[y * W + x] / H; const m = col.reduce((a, b) => a + b) / W; let dev = 0; for (const v of col) dev = Math.max(dev, Math.abs(v - m));
    ok(dev < 6, `no painted lane lines left in the asphalt albedo (max column deviation ${dev.toFixed(1)} levels; the source lines were ~108)`);
    let edge = 0, inner = 0; for (let y = 0; y < H; y++) { edge += Math.abs(data[y * W] - data[y * W + W - 1]); inner += Math.abs(data[y * W + W / 2] - data[y * W + W / 2 + 1]); }
    let edgeV = 0, innerV = 0; for (let x = 0; x < W; x++) { edgeV += Math.abs(data[x] - data[(H - 1) * W + x]); innerV += Math.abs(data[(H / 2) * W + x] - data[(H / 2 + 1) * W + x]); }
    ok(edge / H < (inner / H) * 1.6 + 1 && edgeV / W < (innerV / W) * 1.6 + 1, `the tile wraps seamlessly (edge step ${(edge / H).toFixed(1)} / ${(edgeV / W).toFixed(1)} vs neighbouring pixels ${(inner / H).toFixed(1)} / ${(innerV / W).toFixed(1)})`); }
}

// ---------------------------------------------------------------- 2. coplanar overlaps in the ground layer
const { MAT } = await import('../src/gfx/Materials.js');
Object.setPrototypeOf(MAT, new Proxy({}, { get: (t, k) => { if (typeof k !== 'string') return undefined; if (!t[k]) { t[k] = new THREE.MeshStandardMaterial({ vertexColors: true }); t[k].name = k; } return t[k]; } }));
const CP = await import('../src/world/CityPlan.js'); CP.generatePlan();
const { buildGround } = await import('../src/world/GroundBuilder.js');
const L = await import('../src/world/Layout.js');
const chunks = buildGround(() => {});
const EPS = 0.00025, YMAX = 1.2;
const tris = []; // [planeOffset, min u, max u, min v, max v, a2, b2, c2, material, colour, orientation]
const yOf = {}; // layer heights seen per material on the carriageway
for (const ch of chunks) for (const mesh of ch.toMeshes(MAT, {})) {
  const name = mesh.userData.matKey || mesh.name, g = mesh.geometry, P = g.attributes.position, C = g.attributes.color, I = g.index; const n = I ? I.count : P.count;
  const get = (i) => [P.getX(i), P.getY(i), P.getZ(i)];
  for (let t = 0; t < n; t += 3) { const ia = I ? I.getX(t) : t, ib = I ? I.getX(t + 1) : t + 1, ic = I ? I.getX(t + 2) : t + 2; const a = get(ia), b = get(ib), c = get(ic);
    if (Math.max(a[1], b[1], c[1]) > YMAX) continue;
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], wx = c[0] - a[0], wy = c[1] - a[1], wz = c[2] - a[2]; let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx; const nl = Math.hypot(nx, ny, nz); if (nl < 1e-6) continue; nx /= nl; ny /= nl; nz /= nl;
    let ax; if (ny > 0.999) ax = 1; else if (Math.abs(ny) < 0.01 && Math.abs(nx) > 0.999) ax = 0; else if (Math.abs(ny) < 0.01 && Math.abs(nz) > 0.999) ax = 2; else continue;
    const sgn = Math.sign(ax === 1 ? ny : ax === 0 ? nx : nz); const P2 = (p) => (ax === 1 ? [p[0], p[2]] : ax === 0 ? [p[2], p[1]] : [p[0], p[1]]); const A2 = P2(a), B2 = P2(b), C2 = P2(c);
    const col = C ? [C.getX(ia), C.getY(ia), C.getZ(ia)].map((q) => q.toFixed(2)).join(',') : '';
    if (ax === 1 && L.roadAt((a[0] + b[0] + c[0]) / 3, (a[2] + b[2] + c[2]) / 3)) (yOf[name] ||= new Set()).add(+a[1].toFixed(4));
    tris.push([a[ax], Math.min(A2[0], B2[0], C2[0]), Math.max(A2[0], B2[0], C2[0]), Math.min(A2[1], B2[1], C2[1]), Math.max(A2[1], B2[1], C2[1]), A2, B2, C2, name, col, ax * 2 + (sgn > 0 ? 1 : 0)]); } }
const GS = 4, G = new Map(); tris.forEach((t, i) => { for (let x = Math.floor(t[1] / GS); x <= Math.floor(t[2] / GS); x++) for (let z = Math.floor(t[3] / GS); z <= Math.floor(t[4] / GS); z++) { const k = (x * 100003 + z) * 8 + t[10]; let a = G.get(k); if (!a) G.set(k, (a = [])); a.push(i); } });
const inT = (px, pz, t) => { const [a, b, c] = [t[5], t[6], t[7]]; const d1 = (b[0] - a[0]) * (pz - a[1]) - (b[1] - a[1]) * (px - a[0]), d2 = (c[0] - b[0]) * (pz - b[1]) - (c[1] - b[1]) * (px - b[0]), d3 = (a[0] - c[0]) * (pz - c[1]) - (a[1] - c[1]) * (px - c[0]); const e = 1e-7; return (d1 > e && d2 > e && d3 > e) || (d1 < -e && d2 < -e && d3 < -e); };
const seen = new Set(); const hor = {}, ver = {}; const ex = {};
for (const [, arr] of G) for (let p = 0; p < arr.length; p++) for (let q = p + 1; q < arr.length; q++) { const i = arr[p], j = arr[q], A = tris[i], B = tris[j];
  if (A[10] !== B[10] || Math.abs(A[0] - B[0]) >= EPS) continue; const horiz = A[10] === 3; if (horiz && A[8] === B[8] && A[9] === B[9]) continue; // horizontal, world-uv'd, same tint: identical pixels
  const x0 = Math.max(A[1], B[1]), x1 = Math.min(A[2], B[2]), z0 = Math.max(A[3], B[3]), z1 = Math.min(A[4], B[4]); if (x1 - x0 < 0.01 || z1 - z0 < 0.01) continue;
  const key = Math.min(i, j) * 1e7 + Math.max(i, j); if (seen.has(key)) continue; seen.add(key);
  let hit = false; for (let u = 0.1; u < 1 && !hit; u += 0.2) for (let w = 0.1; w < 1 && !hit; w += 0.2) { const px = x0 + (x1 - x0) * u, pz = z0 + (z1 - z0) * w; if (inT(px, pz, A) && inT(px, pz, B)) hit = true; }
  if (!hit) continue; const k = [A[8], B[8]].sort().join(' × '); const S = horiz ? hor : ver; S[k] = (S[k] || 0) + 1; ex[k] ||= [+x0.toFixed(2), +z0.toFixed(2), +A[0].toFixed(4)]; }
const fmt = (S) => Object.entries(S).map(([k, v]) => `${k} ${v} e.g. ${JSON.stringify(ex[k])}`).join('; ');
ok(Object.keys(hor).length === 0, `no coplanar overlapping ground surfaces (road, wear overlay, markings, crossings, manholes, drains, pavements, lots) ${fmt(hor) || '(0 of ' + tris.filter((t) => t[10] === 3).length + ' faces)'}`);
ok(Object.keys(ver).length === 0, `no coplanar overlapping walls in the ground layer (kerbs, copings, railway sleepers) ${fmt(ver) || '(0 of ' + tris.filter((t) => t[10] !== 3).length + ' faces)'}`);

// ---------------------------------------------------------------- 3. carriageway layer order
{ const RY = L.ROAD_Y, mx = (k) => Math.max(...(yOf[k] || [-1])), mn = (k) => Math.min(...(yOf[k] || [99]));
  const mk = [...(yOf.marking || [])].sort(); const tint = mx('roadTint'), collar = mx('manholeCollar');
  ok(mk.length >= 3 && mn('marking') > tint && mn('marking') > collar && collar > tint && mn('roadTint') > RY, `layers: asphalt ${RY} < wear ≤ ${tint.toFixed(4)} < manhole collar ${collar.toFixed(4)} < markings ${mk.map((v) => v.toFixed(4)).join(' / ')} (lines / stop lines / zebra)`); }

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
