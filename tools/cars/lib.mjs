// Real-car asset pipeline: shared helpers (Node only, offline). Loads a source GLB with gltf-transform (Draco / meshopt /
// quantized / texture-transform inputs all decoded), flattens the scene into world-space triangle "parts" (one per primitive,
// with its node path, material and per-vertex base colour sampled from the base-colour texture), and rasterizes simple
// orthographic previews to PNG for measuring a model (wheel centres, door seams, lamp positions).
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import draco3d from 'draco3dgltf';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';

let ioP = null;
export async function getIO() {
  if (!ioP) ioP = (async () => { await MeshoptDecoder.ready; await MeshoptEncoder.ready;
    return new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule(), 'draco3d.encoder': await draco3d.createEncoderModule(), 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder }); })();
  return ioP;
}
export async function loadDoc(path) { return (await getIO()).read(path); }

const texCache = new Map();
async function decodeTexture(tex) {
  if (!tex) return null; if (texCache.has(tex)) return texCache.get(tex);
  const img = tex.getImage(); let out = null;
  if (img) { try { const { data, info } = await sharp(Buffer.from(img)).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); out = { w: info.width, h: info.height, data }; } catch (e) { console.warn('texture decode failed', tex.getName(), e.message); } }
  texCache.set(tex, out); return out;
}
// bilinear-free nearest sample with repeat wrap (good enough for baking a colour per vertex)
export function sampleTex(t, u, v, out) {
  if (!t) { out[0] = out[1] = out[2] = out[3] = 1; return out; }
  let x = u - Math.floor(u), y = v - Math.floor(v); const px = Math.min(t.w - 1, (x * t.w) | 0), py = Math.min(t.h - 1, (y * t.h) | 0); const i = (py * t.w + px) * 4;
  out[0] = srgbToLin(t.data[i] / 255); out[1] = srgbToLin(t.data[i + 1] / 255); out[2] = srgbToLin(t.data[i + 2] / 255); out[3] = t.data[i + 3] / 255; return out;
}
export const srgbToLin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
export const linToSrgb = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);

// average texture colour over a triangle (3 corners + centroid), linear
function triTexColour(t, uv, a, b, c, out) {
  if (!t || !uv) { out[0] = out[1] = out[2] = out[3] = 1; return out; }
  const s = [0, 0, 0, 0], q = [0, 0, 0, 0]; const pts = [[1, 0, 0], [0, 1, 0], [0, 0, 1], [1 / 3, 1 / 3, 1 / 3], [0.6, 0.2, 0.2], [0.2, 0.6, 0.2], [0.2, 0.2, 0.6]];
  for (const [wa, wb, wc] of pts) { sampleTex(t, uv[a * 2] * wa + uv[b * 2] * wb + uv[c * 2] * wc, uv[a * 2 + 1] * wa + uv[b * 2 + 1] * wb + uv[c * 2 + 1] * wc, q); for (let k = 0; k < 4; k++) s[k] += q[k]; }
  for (let k = 0; k < 4; k++) out[k] = s[k] / pts.length; return out;
}

// flatten: one part per triangle primitive, positions/normals in world space (the scene's own units and axes)
export async function flatten(doc) {
  const parts = []; const root = doc.getRoot(); const scene = root.getDefaultScene() || root.listScenes()[0];
  const visit = async (node, path) => {
    const p2 = [...path, node.getName()]; const mesh = node.getMesh();
    if (mesh) { const M = node.getWorldMatrix(); const N = normalMatrix(M); const det = det3(M);
      for (const prim of mesh.listPrimitives()) { if (prim.getMode() !== 4) continue; const pa = prim.getAttribute('POSITION'); if (!pa) continue;
        const n = pa.getCount(); const pos = new Float32Array(n * 3); const tmp = [0, 0, 0];
        for (let i = 0; i < n; i++) { pa.getElement(i, tmp); const [x, y, z] = tmp; pos[i * 3] = M[0] * x + M[4] * y + M[8] * z + M[12]; pos[i * 3 + 1] = M[1] * x + M[5] * y + M[9] * z + M[13]; pos[i * 3 + 2] = M[2] * x + M[6] * y + M[10] * z + M[14]; }
        const na = prim.getAttribute('NORMAL'); let nrm = null; if (na) { nrm = new Float32Array(n * 3); for (let i = 0; i < n; i++) { na.getElement(i, tmp); const [x, y, z] = tmp; let a = N[0] * x + N[3] * y + N[6] * z, b = N[1] * x + N[4] * y + N[7] * z, c = N[2] * x + N[5] * y + N[8] * z; const l = Math.hypot(a, b, c) || 1; nrm[i * 3] = a / l; nrm[i * 3 + 1] = b / l; nrm[i * 3 + 2] = c / l; } }
        const mat = prim.getMaterial(); const bct = mat && mat.getBaseColorTexture(); const info = mat && mat.getBaseColorTextureInfo();
        const uvName = 'TEXCOORD_' + (info ? info.getTexCoord() : 0); const ua = prim.getAttribute(uvName); let uv = null;
        if (ua) { uv = new Float32Array(n * 2); const t2 = [0, 0]; for (let i = 0; i < n; i++) { ua.getElement(i, t2); uv[i * 2] = t2[0]; uv[i * 2 + 1] = t2[1]; } }
        const ca = prim.getAttribute('COLOR_0'); let vcol = null; if (ca) { vcol = new Float32Array(n * 4); const t4 = [1, 1, 1, 1]; for (let i = 0; i < n; i++) { t4[3] = 1; ca.getElement(i, t4); vcol.set([t4[0], t4[1], t4[2], ca.getElementSize() === 4 ? t4[3] : 1], i * 4); } }
        const ia = prim.getIndices(); let idx; if (ia) idx = Uint32Array.from(ia.getArray()); else idx = Uint32Array.from({ length: n }, (_, i) => i);
        if (det < 0) for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
        const tex = await decodeTexture(bct);
        // per-triangle base colour (factor × texture average × vertex colour), linear RGBA
        const bf = mat ? mat.getBaseColorFactor() : [1, 1, 1, 1]; const tc = new Float32Array(idx.length / 3 * 4); const c4 = [0, 0, 0, 0];
        for (let t = 0; t < idx.length / 3; t++) { const a = idx[t * 3], b = idx[t * 3 + 1], c = idx[t * 3 + 2]; triTexColour(tex, uv, a, b, c, c4);
          let vr = 1, vg = 1, vb = 1; if (vcol) { vr = (vcol[a * 4] + vcol[b * 4] + vcol[c * 4]) / 3; vg = (vcol[a * 4 + 1] + vcol[b * 4 + 1] + vcol[c * 4 + 1]) / 3; vb = (vcol[a * 4 + 2] + vcol[b * 4 + 2] + vcol[c * 4 + 2]) / 3; }
          tc[t * 4] = bf[0] * c4[0] * vr; tc[t * 4 + 1] = bf[1] * c4[1] * vg; tc[t * 4 + 2] = bf[2] * c4[2] * vb; tc[t * 4 + 3] = bf[3] * c4[3]; }
        parts.push({ path: p2, node: node.getName(), mesh: mesh.getName(), mat: mat ? mat.getName() : '', matObj: mat, alphaMode: mat ? mat.getAlphaMode() : 'OPAQUE', metal: mat ? mat.getMetallicFactor() : 0, rough: mat ? mat.getRoughnessFactor() : 1,
          emissive: mat ? mat.getEmissiveFactor() : [0, 0, 0], hasEmissiveTex: !!(mat && mat.getEmissiveTexture()), transmission: !!(mat && mat.getExtension('KHR_materials_transmission')), doubleSided: !!(mat && mat.getDoubleSided()), bf, pos, nrm, uv, idx, triCol: tc, tex });
      } }
    for (const ch of node.listChildren()) await visit(ch, p2);
  };
  for (const n of scene.listChildren()) await visit(n, []);
  return parts;
}
function det3(m) { return m[0] * (m[5] * m[10] - m[6] * m[9]) - m[4] * (m[1] * m[10] - m[2] * m[9]) + m[8] * (m[1] * m[6] - m[2] * m[5]); }
function normalMatrix(m) { // inverse transpose of the upper 3×3 (column-major in, column-major 3×3 out)
  const a = m[0], b = m[1], c = m[2], d = m[4], e = m[5], f = m[6], g = m[8], h = m[9], i = m[10];
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g; const det = a * A + b * B + c * C || 1;
  const inv = [A, -(b * i - c * h), b * f - c * e, B, a * i - c * g, -(a * f - c * d), C, -(a * h - b * g), a * e - b * d].map((v) => v / det);
  // inv is (row-major) inverse; transpose → column-major normal matrix
  return [inv[0], inv[3], inv[6], inv[1], inv[4], inv[7], inv[2], inv[5], inv[8]];
}

export function bounds(parts, filter = () => true) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const p of parts) { if (!filter(p)) continue; const used = new Uint8Array(p.pos.length / 3); for (const i of p.idx) used[i] = 1; for (let i = 0; i < used.length; i++) if (used[i]) for (let k = 0; k < 3; k++) { const v = p.pos[i * 3 + k]; if (v < lo[k]) lo[k] = v; if (v > hi[k]) hi[k] = v; } }
  return { lo, hi, size: hi.map((v, k) => v - lo[k]) };
}

// ---- tiny software rasterizer for previews ----
// view: { name, right: [x,y,z] axis shown left→right, up: axis shown bottom→top, look: viewing direction (towards the scene) }
// tris: { a,b,c (vec3), col [r,g,b] linear }
export function render(tris, view, { px = 120, pad = 0.15, grid = 0.5, lo, hi } = {}) {
  const dot = (p, ax) => p[0] * ax[0] + p[1] * ax[1] + p[2] * ax[2];
  const corners = []; for (const x of [lo[0], hi[0]]) for (const y of [lo[1], hi[1]]) for (const z of [lo[2], hi[2]]) corners.push([x, y, z]);
  const u0 = Math.min(...corners.map((p) => dot(p, view.right))) - pad, u1 = Math.max(...corners.map((p) => dot(p, view.right))) + pad;
  const v0 = Math.min(...corners.map((p) => dot(p, view.up))) - pad, v1 = Math.max(...corners.map((p) => dot(p, view.up))) + pad;
  const W = Math.ceil((u1 - u0) * px), H = Math.ceil((v1 - v0) * px); const img = new Uint8Array(W * H * 3).fill(255); const zb = new Float32Array(W * H).fill(Infinity);
  const L = norm([0.35, 0.8, 0.5]);
  for (const t of tris) {
    const P = [t.a, t.b, t.c].map((p) => [(dot(p, view.right) - u0) * px, (v1 - dot(p, view.up)) * px, dot(p, view.look)]);
    const e1 = sub(t.b, t.a), e2 = sub(t.c, t.a); const n = norm(cross(e1, e2)); const sh = 0.35 + 0.65 * Math.abs(dot(n, L)); const facing = dot(n, view.look) < 0;
    const col = t.col.map((c) => Math.round(255 * Math.min(1, linToSrgb(Math.min(1, c * sh * (facing ? 1 : 0.8))))));
    const minX = Math.max(0, Math.floor(Math.min(P[0][0], P[1][0], P[2][0]))), maxX = Math.min(W - 1, Math.ceil(Math.max(P[0][0], P[1][0], P[2][0])));
    const minY = Math.max(0, Math.floor(Math.min(P[0][1], P[1][1], P[2][1]))), maxY = Math.min(H - 1, Math.ceil(Math.max(P[0][1], P[1][1], P[2][1])));
    const area = (P[1][0] - P[0][0]) * (P[2][1] - P[0][1]) - (P[2][0] - P[0][0]) * (P[1][1] - P[0][1]); if (Math.abs(area) < 1e-9) continue;
    for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) { const sx = x + 0.5, sy = y + 0.5;
      const w0 = ((P[1][0] - sx) * (P[2][1] - sy) - (P[2][0] - sx) * (P[1][1] - sy)) / area, w1 = ((P[2][0] - sx) * (P[0][1] - sy) - (P[0][0] - sx) * (P[2][1] - sy)) / area, w2 = 1 - w0 - w1;
      if (w0 < 0 || w1 < 0 || w2 < 0) continue; const z = w0 * P[0][2] + w1 * P[1][2] + w2 * P[2][2]; const k = y * W + x; if (z >= zb[k]) continue; zb[k] = z; img[k * 3] = col[0]; img[k * 3 + 1] = col[1]; img[k * 3 + 2] = col[2]; }
  }
  if (grid) { // metre grid: thin grey every grid m, red at 0, darker every 1 m (drawn only over the background)
    for (let x = 0; x < W; x++) { const u = u0 + (x + 0.5) / px; const r = Math.round(u / grid) * grid; if (Math.abs(u - r) * px < 0.5) { const strong = Math.abs(r) < 1e-6 ? 2 : Math.abs(r - Math.round(r)) < 1e-6 ? 1 : 0; for (let y = 0; y < H; y++) gpx(img, zb, W, x, y, strong); } }
    for (let y = 0; y < H; y++) { const v = v1 - (y + 0.5) / px; const r = Math.round(v / grid) * grid; if (Math.abs(v - r) * px < 0.5) { const strong = Math.abs(r) < 1e-6 ? 2 : Math.abs(r - Math.round(r)) < 1e-6 ? 1 : 0; for (let x = 0; x < W; x++) gpx(img, zb, W, x, y, strong); } }
  }
  return { W, H, img, u0, v1, px };
}
function gpx(img, zb, W, x, y, strong) { const k = y * W + x; if (zb[k] !== Infinity) { if (strong === 2) { img[k * 3] = 255; img[k * 3 + 1] = 0; img[k * 3 + 2] = 0; } return; } const c = strong === 2 ? [255, 60, 60] : strong ? [150, 150, 150] : [210, 210, 210]; img[k * 3] = c[0]; img[k * 3 + 1] = c[1]; img[k * 3 + 2] = c[2]; }
export async function savePNG(path, r) { await sharp(Buffer.from(r.img), { raw: { width: r.W, height: r.H, channels: 3 } }).png().toFile(path); }
export async function stackPNG(path, rs, gap = 8) { const W = Math.max(...rs.map((r) => r.W)); const H = rs.reduce((s, r) => s + r.H + gap, 0); const img = new Uint8Array(W * H * 3).fill(40); let y0 = 0;
  for (const r of rs) { for (let y = 0; y < r.H; y++) img.set(r.img.subarray(y * r.W * 3, (y + 1) * r.W * 3), ((y0 + y) * W) * 3); y0 += r.H + gap; }
  await sharp(Buffer.from(img), { raw: { width: W, height: H, channels: 3 } }).png().toFile(path); }
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

// all triangles of the given parts as render records; colour(part, tri) → [r,g,b] linear (default: baked base colour)
export function trisOf(parts, colour) {
  const out = []; for (const p of parts) for (let t = 0; t < p.idx.length / 3; t++) { const g = (i) => [p.pos[i * 3], p.pos[i * 3 + 1], p.pos[i * 3 + 2]]; const a = p.idx[t * 3], b = p.idx[t * 3 + 1], c = p.idx[t * 3 + 2];
    out.push({ a: g(a), b: g(b), c: g(c), col: colour ? colour(p, t) : [p.triCol[t * 4], p.triCol[t * 4 + 1], p.triCol[t * 4 + 2]] }); }
  return out;
}
// distinct false colour per key (material audit previews)
export function keyColour(key) { let h = 2166136261; for (const ch of String(key)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); const hue = ((h >>> 0) % 360) / 360; return hsl(hue, 0.65, 0.5); }
function hsl(h, s, l) { const f = (n) => { const k = (n + h * 12) % 12; const a = s * Math.min(l, 1 - l); return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); }; return [f(0), f(8), f(4)].map(srgbToLin); }
