// The great seated golden Buddha of Viharamahadevi Park (Town Hall end), sculpted as one smooth signed-distance form
// (SdfMesh): Sri Lankan samadhi posture (virasana, right leg over the left with the right sole turned up, hands resting
// in the lap in dhyana mudra), robe over the left shoulder with the right shoulder bare, the robe's edge and its fine
// parallel folds as soft raised lines, the sanghati fold over the left shoulder, long ear lobes, downcast half-closed
// eyes, gentle lips, snail-shell curls over the head and the ushnisha, and the flame finial (siraspata) that marks Sri
// Lankan Buddha images. Local frame: seated on y = 0, facing +z, metres (about 5.6 m to the tip of the finial).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ellipsoid as E, roundCone as RC, chain, sdfMesh } from '../gfx/SdfMesh.js';

const CRANIUM = { c: [0, 4.08, -0.29], r: [0.46, 0.56, 0.52] }, USH = { c: [0, 4.66, -0.3], r: [0.26, 0.19, 0.26] };
const mir = (p, s) => [p[0] * s, p[1], p[2]];

function bodyPrims() {
  const A = [];
  // seat: robe-covered lap, thighs to the wide knees, left shin tucked beneath, right shin over it and its upturned sole
  A.push(E([0, 0.42, 0.22], [1.95, 0.44, 1.02], 0.3));
  for (const s of [-1, 1]) A.push(RC([s * 0.6, 0.72, -0.3], [s * 1.98, 0.48, 0.86], 0.6, 0.46, 0.25));
  A.push(...chain([[2.0, 0.42, 1.0], [0.9, 0.36, 1.16], [-0.4, 0.34, 1.1], [-1.25, 0.32, 0.86]], [0.4, 0.35, 0.31, 0.27], 0.2));
  A.push(...chain([[-2.0, 0.6, 0.98], [-1.0, 0.8, 1.04], [0.1, 0.94, 0.86], [0.78, 1.0, 0.6]], [0.42, 0.36, 0.3, 0.25], 0.18));
  A.push(E([1.1, 1.02, 0.52], [0.5, 0.14, 0.26], 0.12, [0, -0.45, -0.05]));                  // right foot, sole up
  for (let k = 0; k < 5; k++) A.push(E([1.53 - k * 0.035, 1.05, 0.72 - k * 0.075], [0.07 - k * 0.006, 0.055, 0.05], 0.02));
  // torso: broad chest, slim waist, rounded shoulders
  A.push(E([0, 0.86, -0.38], [1.0, 0.5, 0.68], 0.3), E([0, 1.55, -0.29], [0.84, 0.72, 0.58], 0.35), E([0, 2.32, -0.3], [1.06, 0.78, 0.6], 0.35));
  for (const s of [-1, 1]) A.push(E([s * 0.44, 2.46, 0.06], [0.42, 0.3, 0.2], 0.25));
  A.push(RC([-0.98, 2.84, -0.32], [0.98, 2.84, -0.32], 0.32, 0.32, 0.35));
  for (const s of [-1, 1]) A.push(E([s * 1.1, 2.74, -0.3], [0.36, 0.4, 0.38], 0.2));
  A.push(RC([0, 2.95, -0.33], [0, 3.56, -0.28], 0.31, 0.29, 0.15));                         // neck
  // arms down to the hands resting in the lap (the robed left a little fuller)
  for (const s of [-1, 1]) { const f = s > 0 ? 1.07 : 1; A.push(...chain([[s * 1.1, 2.78, -0.32], [s * 1.3, 1.78, -0.13], [s * 0.56, 1.18, 0.55]], [0.32 * f, 0.26 * f, 0.17], 0.12)); }
  A.push(E([0.1, 1.12, 0.66], [0.4, 0.085, 0.24], 0.05, [0, 0.08, 0]), E([-0.05, 1.21, 0.68], [0.4, 0.085, 0.24], 0.04, [0, -0.08, 0]));
  for (const s of [-1, 1]) A.push(...chain([[s * 0.3, 1.24, 0.5], [s * 0.15, 1.32, 0.47], [s * 0.03, 1.35, 0.49]], [0.05, 0.045, 0.04], 0.03));
  // head: cranium, jaw, chin, ushnisha, ears with the long lobes
  A.push(E(CRANIUM.c, CRANIUM.r, 0.2), E([0, 3.76, -0.2], [0.37, 0.36, 0.42], 0.2), E([0, 3.53, 0.06], [0.14, 0.09, 0.1], 0.1), E(USH.c, USH.r, 0.12));
  for (const s of [-1, 1]) { A.push(E([s * 0.47, 3.98, -0.31], [0.062, 0.27, 0.15], 0.05, [0, 0, s * 0.05])); A.push(...chain([[s * 0.49, 3.86, -0.3], [s * 0.505, 3.68, -0.28], [s * 0.5, 3.52, -0.265]], [0.06, 0.066, 0.074], 0.1)); } // long ear flowing into the stretched lobe
  // face: soft brow arches into the nose, downcast lids, nose, lips
  for (const s of [-1, 1]) A.push(...chain([mir([0.36, 4.12, 0.05], s), mir([0.27, 4.185, 0.15], s), mir([0.15, 4.2, 0.21], s), mir([0.04, 4.165, 0.232], s)], [0.008, 0.016, 0.016, 0.012], 0.05));
  A.push(RC([0, 4.1, 0.215], [0, 3.91, 0.262], 0.035, 0.055, 0.05), E([0, 3.877, 0.255], [0.085, 0.045, 0.055], 0.04));
  for (const s of [-1, 1]) A.push(E([s * 0.17, 4.03, 0.17], [0.125, 0.06, 0.055], 0.05, [0.25, s * 0.38, 0]));
  A.push(E([0, 3.735, 0.205], [0.1, 0.026, 0.04], 0.02), E([0, 3.69, 0.198], [0.085, 0.028, 0.04], 0.02));
  return A;
}
function bodyCuts() {
  const C = [];
  for (const s of [-1, 1]) C.push(RC(mir([0.065, 4.0, 0.222], s), mir([0.28, 4.012, 0.155], s), 0.009, 0.007, 0.012)); // closed-eye line under the lids
  C.push(...chain([[-0.105, 3.724, 0.222], [-0.05, 3.714, 0.233], [0, 3.712, 0.237], [0.05, 3.714, 0.233], [0.105, 3.724, 0.222]], [0.004, 0.007, 0.008, 0.007, 0.004], 0.01)); // the line of the lips, corners lifted in a faint smile
  for (const y of [3.28, 3.38]) { const P = []; for (let k = 0; k <= 12; k++) { const a = Math.PI * 0.18 + k / 12 * Math.PI * 0.64; P.push([Math.cos(a) * 0.31, y, -0.305 + Math.sin(a) * 0.3]); } C.push(...chain(P, P.map((_, i) => (i === 0 || i === 12 ? 0.003 : 0.009)), 0.012)); } // the neck's beauty lines, as soft grooves
  for (let k = 0; k < 3; k++) C.push(RC([-0.3, 1.3, 0.58 + k * 0.075], [0.32, 1.3, 0.6 + k * 0.075], 0.012, 0.012, 0.012)); // fingers of the upper hand
  return C;
}
// the robe lines are laid on the sculpted surface: march out from the body axis until the field changes sign
function onSurface(field, y, a, off) { const ox = 0, oz = -0.3, dx = Math.cos(a), dz = Math.sin(a); let lo = 0, hi = 1.6;
  for (let i = 0; i < 26; i++) { const m = (lo + hi) / 2; if (field(ox + dx * m, y, oz + dz * m) < 0) lo = m; else hi = m; } const r = (lo + hi) / 2 + off; return [ox + dx * r, y, oz + dz * r]; }
function robePrims(field) {
  const A = []; const line = (P, r, k) => A.push(...chain(P, P.map((_, i) => (i === 0 || i === P.length - 1 ? r * 0.25 : r)), k)); // tapered: lines fade out at their ends
  const EDGE = [[3.12, 0.1], [3.0, 0.62], [2.74, 1.1], [2.42, 1.5], [2.14, 1.92], [1.96, 2.35], [1.9, 2.7]]; // left shoulder → under the right breast → right flank
  const smooth = (C, n) => { const cv = new THREE.CatmullRomCurve3(C.map(([y, a]) => new THREE.Vector3(y, a, 0))); return cv.getPoints(n).map((v) => [v.x, v.y]); };
  { const P = smooth(EDGE, 24).map(([y, a]) => onSurface(field, y, a, -0.022)); A.push(...chain(P, P.map((_, i) => (i > 20 ? 0.05 - (i - 20) * 0.008 : 0.05)), 0.05)); }
  for (let k = 1; k <= 2; k++) line(smooth(EDGE.slice(1), 20).map(([y, a]) => onSurface(field, y - k * 0.3, a - k * 0.15, -0.022)), 0.032, 0.04); // soft folds sweeping below it
  { const P = []; for (let k = 0; k <= 5; k++) { const t = k / 5; P.push(onSurface(field, 3.05 - t * 1.2, 0.3 + Math.min(1, t * 1.6) * 0.6, -0.035)); } A.push(...chain(P, P.map((_, i) => (i === 5 ? 0.025 : 0.055)), 0.1)); } // sanghati fold over the left shoulder
  // robe hem across the shins and folds over the lap
  line([[-2.36, 0.56, 1.12], [-1.4, 0.8, 1.27], [-0.3, 0.97, 1.1], [0.6, 1.03, 0.85], [0.92, 1.05, 0.66]], 0.03, 0.025);
  for (let k = 0; k < 6; k++) { const x0 = -1.9 + k * 0.62; line([[x0, 0.82 - Math.abs(x0) * 0.08, 0.45], [x0 * 1.05, 0.74, 0.98], [x0 * 1.07, 0.52, 1.24]], 0.016, 0.015); }
  return A;
}
function curlsGeometry(f = 1) {
  const parts = []; const curl = f >= 1 ? new THREE.SphereGeometry(0.038, 6, 4) : new THREE.SphereGeometry(0.05, 4, 3); curl.deleteAttribute('uv');
  const put = (C, n, th, scale) => { for (let i = 0; i < n; i++) { const yy = 1 - (i + 0.5) / n * 2, rr = Math.sqrt(1 - yy * yy), ph = i * 2.39996; const nx = Math.cos(ph) * rr, nz = Math.sin(ph) * rr;
    if (yy < th(nx, nz)) continue; const g = curl.clone(); g.scale(scale, scale * 0.8, scale); g.translate(C.c[0] + nx * (C.r[0] + 0.012), C.c[1] + yy * (C.r[1] + 0.012), C.c[2] + nz * (C.r[2] + 0.012)); parts.push(g); } };
  put(CRANIUM, Math.round(900 * f), (nx, nz) => 0.2 + 0.28 * Math.max(0, nz) + 0.06 * (1 - Math.abs(nz)), 1);  // hairline high over the brow, lower at the back
  put(USH, Math.round(220 * f), () => -0.35, 0.85);
  const fl = new THREE.LatheGeometry([[0.0, 0], [0.12, 0.02], [0.15, 0.1], [0.125, 0.22], [0.085, 0.36], [0.05, 0.52], [0.022, 0.66], [0.0, 0.78]].map(([r, y]) => new THREE.Vector2(r, y)), 24);
  fl.deleteAttribute('uv'); fl.translate(USH.c[0], USH.c[1] + 0.13, USH.c[2]); parts.push(fl);
  const col = new THREE.TorusGeometry(0.12, 0.03, 8, 24); col.rotateX(Math.PI / 2); col.translate(USH.c[0], USH.c[1] + 0.15, USH.c[2]); col.deleteAttribute('uv'); parts.push(col);
  return mergeGeometries(parts, false);
}
// Sculpt the statue (used by tools/bake-buddha.mjs; too slow to run at load). Close up the head is meshed on a finer grid
// than the body: two meshes overlapping at the neck, the head 6 mm proud so the body's top edge stays hidden under it.
export function sculptBuddha(hBody = 0.045, hHead = 0.03, split = 3.28) {
  const adds = bodyPrims(), cuts = bodyCuts();
  const field = (x, y, z) => { let d = 1e9; for (const p of adds) { const v = p.d(x, y, z); const k = p.k; const hh = Math.max(k - Math.abs(d - v), 0) / k; d = Math.min(d, v) - hh * hh * k * 0.25; } return d; };
  const all = adds.concat(robePrims(field));
  if (!hHead) return [sdfMesh({ min: [-2.65, -0.02, -1.15], max: [2.65, 4.9, 1.65], h: hBody, adds: all, cuts, floorY: 0 })];
  const body = sdfMesh({ min: [-2.65, -0.02, -1.15], max: [2.65, split + 0.1, 1.65], h: hBody, adds: all, cuts, floorY: 0, ceilY: split });
  const head = sdfMesh({ min: [-0.75, split - 0.1, -0.95], max: [0.75, 4.9, 0.55], h: hHead, adds: all, cuts, floorY: split - 0.16, grow: 0.006 }); // overlaps the body's top edge (hidden in the neck groove)
  return [body, head];
}
// quantised mesh codec for the baked data: positions uint16 in the bounding box, normals octahedral int8, quads uint16
const b64 = (u8) => (globalThis.Buffer ? globalThis.Buffer.from(u8).toString('base64') : btoa(String.fromCharCode(...u8)));
const unb64 = (s) => { const bin = atob(s); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };
export function encodeMesh(g) {
  const P = g.attributes.position.array, N = g.attributes.normal.array, I = g.index.array, n = P.length / 3; if (n > 65535) throw new Error('too many vertices');
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]; for (let i = 0; i < n; i++) for (let a = 0; a < 3; a++) { lo[a] = Math.min(lo[a], P[i * 3 + a]); hi[a] = Math.max(hi[a], P[i * 3 + a]); }
  const q = new Uint16Array(n * 3), on = new Int8Array(n * 2);
  for (let i = 0; i < n; i++) { for (let a = 0; a < 3; a++) q[i * 3 + a] = Math.round((P[i * 3 + a] - lo[a]) / (hi[a] - lo[a] || 1) * 65535);
    let x = N[i * 3], y = N[i * 3 + 1], z = N[i * 3 + 2]; const l = Math.abs(x) + Math.abs(y) + Math.abs(z) || 1; x /= l; y /= l; z /= l;
    if (z < 0) { const ox = x; x = (1 - Math.abs(y)) * Math.sign(ox || 1); y = (1 - Math.abs(ox)) * Math.sign(y || 1); }
    on[i * 2] = Math.round(x * 127); on[i * 2 + 1] = Math.round(y * 127); }
  const quads = new Uint16Array(I.length / 6 * 4); // each quad in its winding order (surface nets emits both orientations)
  for (let t = 0, o = 0; t < I.length; t += 6, o += 4) { const w = I[t + 4] === I[t + 2] ? [I[t], I[t + 1], I[t + 2], I[t + 5]] : [I[t], I[t + 4], I[t + 1], I[t + 2]]; quads.set(w, o); }
  return { lo, hi, p: b64(new Uint8Array(q.buffer)), n: b64(new Uint8Array(on.buffer)), q: b64(new Uint8Array(quads.buffer)) };
}
export function decodeMesh(m) {
  const q = new Uint16Array(unb64(m.p).buffer), on = new Int8Array(unb64(m.n).buffer), quads = new Uint16Array(unb64(m.q).buffer); const n = q.length / 3;
  const P = new Float32Array(n * 3), N = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { for (let a = 0; a < 3; a++) P[i * 3 + a] = m.lo[a] + q[i * 3 + a] / 65535 * (m.hi[a] - m.lo[a]);
    let x = on[i * 2] / 127, y = on[i * 2 + 1] / 127; let z = 1 - Math.abs(x) - Math.abs(y); if (z < 0) { const ox = x; x = (1 - Math.abs(y)) * Math.sign(ox || 1); y = (1 - Math.abs(ox)) * Math.sign(y || 1); }
    const l = Math.hypot(x, y, z) || 1; N[i * 3] = x / l; N[i * 3 + 1] = y / l; N[i * 3 + 2] = z / l; }
  const idx = new Uint16Array(quads.length / 4 * 6);
  for (let k = 0, o = 0; k < quads.length; k += 4, o += 6) { const a = quads[k], b = quads[k + 1], c = quads[k + 2], d = quads[k + 3]; idx.set([a, b, c, a, c, d], o); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.BufferAttribute(N, 3)); g.setIndex(new THREE.BufferAttribute(idx, 1)); return g;
}
// the statue geometry for the game: baked sculpt + the curls and the flame finial (built here, cheap). lod 'hi' | 'lo'
export function buddhaGeometry(data, lod = 'hi') {
  const parts = data[lod].map(decodeMesh); parts.push(curlsGeometry(lod === 'hi' ? 1 : 0.45));
  return mergeGeometries(parts, false);
}
// the double-lotus throne under the image: a moulded drum between a ring of upturned and a ring of downturned petals,
// each a broad rounded petal leaning outward with a pointed tip (built at load: plain geometry, ~10k triangles)
export function lotusThroneGeometry(r = 2.75, h = 1.1) {
  const parts = [];
  const drum = new THREE.LatheGeometry([[0, 0], [r * 0.9, 0], [r * 0.9, 0.12], [r * 0.82, 0.2], [r * 0.8, h * 0.5], [r * 0.82, h - 0.2], [r * 0.88, h - 0.1], [r * 0.88, h], [0, h]].map(([x, y]) => new THREE.Vector2(x, y)), 56);
  parts.push(drum);
  const n = 30;
  for (const up of [1, -1]) for (let k = 0; k < n; k++) { const a = (k + (up > 0 ? 0 : 0.5)) / n * Math.PI * 2;
    const yc = h * 0.5 + up * h * 0.25, rc = r * 0.9;
    const pe = new THREE.SphereGeometry(1, 10, 7); pe.scale(0.27, 0.34, 0.08); pe.rotateX(up * 0.45); pe.translate(0, 0, rc); pe.rotateY(Math.PI / 2 - a); pe.translate(0, yc, 0); parts.push(pe);
    const tip = new THREE.ConeGeometry(0.06, 0.2, 8); if (up < 0) tip.rotateX(Math.PI); tip.rotateX(up * 0.6); tip.translate(0, up * 0.36, rc + 0.17); tip.rotateY(Math.PI / 2 - a); tip.translate(0, yc, 0); parts.push(tip); }
  return mergeGeometries(parts.map((g) => { const q = g.index ? g.toNonIndexed() : g; q.deleteAttribute('uv'); return q; }), false);
}
export const BUDDHA_SEAT_H = 1.1; // throne height (the image sits on top)
