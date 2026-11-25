// Accumulates triangles into one indexed BufferGeometry (positions, normals, uvs, colours).
import * as THREE from 'three';
import { MAT, ensureMat, canCopy, effKey } from './Materials.js';
const _v = new THREE.Vector3(), _n = new THREE.Vector3(), _m3 = new THREE.Matrix3();
export class MeshBuilder {
  constructor() { this.pos = []; this.nor = []; this.uv = []; this.col = []; this.idx = []; this.color = [1, 1, 1]; }
  get vcount() { return this.pos.length / 3; }
  setColor(c) { if (c === undefined || c === null) { this.color = [1, 1, 1]; return this; } if (Array.isArray(c)) this.color = c; else { const k = c.isColor ? c : new THREE.Color(c); this.color = [k.r, k.g, k.b]; } return this; }
  vert(x, y, z, nx, ny, nz, u, v, col) { const c = col || this.color; this.pos.push(x, y, z); this.nor.push(nx, ny, nz); this.uv.push(u, v); this.col.push(c[0], c[1], c[2]); return this.vcount - 1; }
  // quad from 4 corners (counter-clockwise when seen from the front), uv = [u0,v0,u1,v1]
  quad(a, b, c, d, uv = [0, 0, 1, 1], col) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; let l = Math.hypot(nx, ny, nz);
    if (l < 1e-12) { // degenerate edge pair (triangle written as a quad with a repeated corner, e.g. fan caps): use the diagonals (c−a)×(d−b), same orientation
      const px = c[0] - a[0], py = c[1] - a[1], pz = c[2] - a[2], qx = d[0] - b[0], qy = d[1] - b[1], qz = d[2] - b[2];
      nx = py * qz - pz * qy; ny = pz * qx - px * qz; nz = px * qy - py * qx; l = Math.hypot(nx, ny, nz); }
    if (l < 1e-12) { nx = 0; ny = 1; nz = 0; l = 1; } // fully degenerate (zero area): any unit normal, never (0,0,0) — that shades as NaN
    nx /= l; ny /= l; nz /= l;
    const i0 = this.vert(a[0], a[1], a[2], nx, ny, nz, uv[0], uv[1], col), i1 = this.vert(b[0], b[1], b[2], nx, ny, nz, uv[2], uv[1], col);
    const i2 = this.vert(c[0], c[1], c[2], nx, ny, nz, uv[2], uv[3], col), i3 = this.vert(d[0], d[1], d[2], nx, ny, nz, uv[0], uv[3], col);
    this.idx.push(i0, i1, i2, i0, i2, i3); return this;
  }
  // horizontal rectangle facing up (or down)
  // 60th: a flat 3- or 4-corner face (roof slope, hip end, gable) with true world-scale planar UVs: u runs along the first edge
  // P0→P1 (the eave), v up the face away from it, su / sv texture repeats per metre. Unlike quad()'s rectangle UVs, a texture is
  // never sheared on a trapezoid or squeezed into a triangle, and every slope's rows start level at its eave. Same normal +
  // winding as quad() / a fan triangle.
  planar(P, col, su = 0.25, sv = su) {
    const a = P[0], b = P[1], z = P[P.length - 1];
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = z[0] - a[0], vy = z[1] - a[1], vz = z[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    const el = Math.hypot(ux, uy, uz) || 1, ex = ux / el, ey = uy / el, ez = uz / el;
    let cx = 0, cy = 0, cz = 0; for (const p of P) { cx += p[0] / P.length; cy += p[1] / P.length; cz += p[2] / P.length; }
    cx -= a[0]; cy -= a[1]; cz -= a[2]; const d = cx * ex + cy * ey + cz * ez; let tx = cx - ex * d, ty = cy - ey * d, tz = cz - ez * d; const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
    const u0 = a[0] * ex + a[1] * ey + a[2] * ez; const I = P.map((p) => this.vert(p[0], p[1], p[2], nx, ny, nz, (p[0] * ex + p[1] * ey + p[2] * ez - u0) * su, ((p[0] - a[0]) * tx + (p[1] - a[1]) * ty + (p[2] - a[2]) * tz) * sv, col));
    for (let i = 1; i < I.length - 1; i++) this.idx.push(I[0], I[i], I[i + 1]); return this;
  }
  hrect(x0, z0, x1, z1, y, uvScale = 1, col, down = false, uvOff = [0, 0]) {
    const u0 = x0 / uvScale + uvOff[0], u1 = x1 / uvScale + uvOff[0], v0 = -z0 / uvScale + uvOff[1], v1 = -z1 / uvScale + uvOff[1];
    if (!down) this.quad([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], [u0, v1, u1, v0], col);
    else this.quad([x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1], [u0, v0, u1, v1], col);
    return this;
  }
  // horizontal convex polygon facing up, pts = [[x,z],...]; world-space uv like hrect (used for clipped shoreline paving)
  hpoly(pts, y, uvScale = 1, col) {
    if (pts.length < 3) return this;
    let area = 0; for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; area += a[0] * b[1] - b[0] * a[1]; }
    const P = area > 0 ? [pts[0], ...pts.slice(1).reverse()] : pts; // up-facing winding; pts[0] stays the fan origin (star-shaped polys)
    const base = this.vcount;
    for (const [x, z] of P) this.vert(x, y, z, 0, 1, 0, x / uvScale, -z / uvScale, col);
    for (let i = 1; i < P.length - 1; i++) this.idx.push(base, base + i, base + i + 1);
    return this;
  }
  // vertical wall from (x0,z0) to (x1,z1), outward normal on the right-hand side when walking a→b viewed from above (CCW footprint => outward)
  wall(x0, z0, x1, z1, y0, y1, uv, col) { return this.quad([x0, y0, z0], [x1, y0, z1], [x1, y1, z1], [x0, y1, z0], uv, col); }
  // axis-aligned box; uvMode 'world' tiles every `uvScale` metres
  box(cx, cy, cz, sx, sy, sz, { col, uvScale = 1, top = true, bottom = false, rotY = 0, uvRect = null, sides = 15 } = {}) { // sides: bit mask of the four side faces (1 +z, 2 −z, 4 +x, 8 −x), default all
    const hx = sx / 2, hy = sy / 2, hz = sz / 2;
    const c = Math.cos(rotY), s = Math.sin(rotY);
    const P = (x, y, z) => [cx + x * c + z * s, cy + y, cz - x * s + z * c];
    const U = (len, h) => (uvRect ? uvRect : [0, 0, len / uvScale, h / uvScale]);
    if (sides & 1) this.quad(P(-hx, -hy, hz), P(hx, -hy, hz), P(hx, hy, hz), P(-hx, hy, hz), U(sx, sy), col);
    if (sides & 2) this.quad(P(hx, -hy, -hz), P(-hx, -hy, -hz), P(-hx, hy, -hz), P(hx, hy, -hz), U(sx, sy), col);
    if (sides & 4) this.quad(P(hx, -hy, hz), P(hx, -hy, -hz), P(hx, hy, -hz), P(hx, hy, hz), U(sz, sy), col);
    if (sides & 8) this.quad(P(-hx, -hy, -hz), P(-hx, -hy, hz), P(-hx, hy, hz), P(-hx, hy, -hz), U(sz, sy), col);
    if (top) this.quad(P(-hx, hy, hz), P(hx, hy, hz), P(hx, hy, -hz), P(-hx, hy, -hz), U(sx, sz), col);
    if (bottom) this.quad(P(-hx, -hy, -hz), P(hx, -hy, -hz), P(hx, -hy, hz), P(-hx, -hy, hz), U(sx, sz), col);
    return this;
  }
  cylinder(cx, cy, cz, r0, r1, h, seg = 10, { col, caps = true, uvScale = 1 } = {}) {
    const base = this.vcount; const sl = (r0 - r1) / h;
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a); const l = Math.hypot(1, sl);
      this.vert(cx + ca * r0, cy, cz + sa * r0, ca / l, sl / l, sa / l, i / seg * (Math.PI * 2 * r0 / uvScale), 0, col);
      this.vert(cx + ca * r1, cy + h, cz + sa * r1, ca / l, sl / l, sa / l, i / seg * (Math.PI * 2 * r0 / uvScale), h / uvScale, col);
    }
    for (let i = 0; i < seg; i++) { const a = base + i * 2; this.idx.push(a, a + 1, a + 3, a, a + 3, a + 2); }
    if (caps) {
      const ct = this.vert(cx, cy + h, cz, 0, 1, 0, 0.5, 0.5, col);
      const s0 = this.vcount; for (let i = 0; i <= seg; i++) { const a = (i / seg) * Math.PI * 2; this.vert(cx + Math.cos(a) * r1, cy + h, cz + Math.sin(a) * r1, 0, 1, 0, 0.5 + Math.cos(a) * 0.5, 0.5 + Math.sin(a) * 0.5, col); }
      for (let i = 0; i < seg; i++) this.idx.push(ct, s0 + i + 1, s0 + i);
    }
    return this;
  }
  // Append an existing BufferGeometry transformed by matrix (Matrix4), optional colour.
  geometry(g, matrix, col) {
    const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv, gc = g.attributes.color; const base = this.vcount;
    _m3.getNormalMatrix(matrix); const c = col ? (Array.isArray(col) ? col : (() => { const k = new THREE.Color(col); return [k.r, k.g, k.b]; })()) : this.color;
    for (let i = 0; i < p.count; i++) {
      _v.fromBufferAttribute(p, i).applyMatrix4(matrix); _n.set(0, 1, 0); if (n) _n.fromBufferAttribute(n, i).applyMatrix3(_m3).normalize();
      const cc = gc ? [gc.getX(i) * c[0], gc.getY(i) * c[1], gc.getZ(i) * c[2]] : c;
      this.vert(_v.x, _v.y, _v.z, _n.x, _n.y, _n.z, uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0, cc);
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) this.idx.push(base + g.index.getX(i)); else for (let i = 0; i < p.count; i++) this.idx.push(base + i);
    return this;
  }
  build() {
    const g = new THREE.BufferGeometry();
    if (!this.pos.length) return null;
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.vcount > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
}
// 86th — streaming without garbage. A dense chunk's detail / window-joinery job pushed ~0.4-1M vertices per material into plain
// JS arrays; every time one outgrew its storage V8 copied it into a bigger one in large-object space (old generation). Building
// three chunks allocated 3.2 GB (measured): while driving that fed one major (mark-compact) GC after another, 100-600 ms frames.
// The streaming jobs (World.newJob) use pooled builders instead: the same MeshBuilder methods over typed buffers that grow by
// doubling and are kept per material key for the next chunk, so after the first few chunks a job allocates almost nothing.
// Identical output: values land in the same Float32 / Uint32 types the plain arrays were converted to (SliceBuild / build), with
// the same rounding, and nothing in the streaming code reads a vertex back (only .length and push are used).
export class GrowBuf {
  constructor(T, n) { this.T = T; this.a = new T(n); this.length = 0; }
  push(x, y, z, w, u, v) {
    const n = arguments.length, L = this.length; if (L + n > this.a.length) { let c = this.a.length * 2; while (c < L + n) c *= 2; const b = new this.T(c); b.set(this.a.subarray(0, L)); this.a = b; }
    const a = this.a; a[L] = x; if (n > 1) { a[L + 1] = y; if (n > 2) { a[L + 2] = z; if (n > 3) { a[L + 3] = w; if (n > 4) { a[L + 4] = u; if (n > 5) { a[L + 5] = v; for (let i = 6; i < n; i++) a[L + i] = arguments[i]; } } } } }
    this.length = L + n; return this.length;
  }
  view() { return this.a.subarray(0, this.length); }
  // 93rd: a finished buffer handed over by a geometry worker (GeoWorker.js) — exactly sized, owned by this thread now
  static wrap(a) { const g = Object.create(GrowBuf.prototype); g.T = a.constructor; g.a = a; g.length = a.length; return g; }
}
// 93rd: a material's finished buffers as a geometry worker built them (transferred, not copied). It reads like a pooled builder
// to the streaming merge (World.stepJob: .length / .view() / vcount); `owned` lets SliceBuild use the arrays as they are.
export class ArrayBuilder {
  constructor(pos, nor, uv, col, idx) { this.pos = GrowBuf.wrap(pos); this.nor = GrowBuf.wrap(nor); this.uv = GrowBuf.wrap(uv); this.col = GrowBuf.wrap(col); this.idx = GrowBuf.wrap(idx); this.owned = true; }
  get vcount() { return this.pos.length / 3; }
}
// a MultiBuilder-shaped holder of ArrayBuilders (one per material key); release() just lets the buffers go (nothing to pool)
export class ArrayMulti {
  constructor(list) { this.b = new Map(); this.plain = new Map(); for (const e of list) { this.b.set(e.k, new ArrayBuilder(e.pos, e.nor, e.uv, e.col, e.idx)); this.plain.set(e.k, e.plain); } }
  release(k) { this.b.delete(k); }
  releaseAll() { this.b.clear(); }
}
class PooledMeshBuilder extends MeshBuilder {
  constructor() { super(); this.pos = new GrowBuf(Float32Array, 12288); this.nor = new GrowBuf(Float32Array, 12288); this.uv = new GrowBuf(Float32Array, 8192); this.col = new GrowBuf(Float32Array, 12288); this.idx = new GrowBuf(Uint32Array, 24576); }
  reset() { this.pos.length = this.nor.length = this.uv.length = this.col.length = this.idx.length = 0; this.color = [1, 1, 1]; return this; }
  bytes() { return (this.pos.a.length + this.nor.a.length + this.uv.a.length + this.col.a.length + this.idx.a.length) * 4; }
  build() {
    if (!this.pos.length) return null; const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos.view().slice(), 3)); g.setAttribute('normal', new THREE.BufferAttribute(this.nor.view().slice(), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(this.uv.view().slice(), 2)); g.setAttribute('color', new THREE.BufferAttribute(this.col.view().slice(), 3));
    g.setIndex(new THREE.BufferAttribute(this.vcount > 65535 ? this.idx.view().slice() : new Uint16Array(this.idx.view()), 1)); g.computeBoundingSphere(); g.computeBoundingBox(); return g;
  }
}
// one free builder per material key (the next chunk's 'concrete' reuses this chunk's buffers), least recently used dropped
// beyond POOL_CAP bytes of buffers
let POOL_CAP = 160 * 1048576; const pool = new Map(); let poolBytes = 0;
export function setPoolCap(bytes) { POOL_CAP = bytes; } // 93rd: geometry workers keep a smaller pool each (GeoWorker.js)
function takePooled(k) { const b = pool.get(k); if (b) { pool.delete(k); poolBytes -= b.bytes(); return b.reset(); } for (const [k2, b2] of pool) { if (b2.bytes() <= 4 * 1048576) { pool.delete(k2); poolBytes -= b2.bytes(); return b2.reset(); } } return new PooledMeshBuilder(); }
function givePooled(k, b) { if (!(b instanceof PooledMeshBuilder)) return; const old = pool.get(k); if (old === b) return; if (old) { poolBytes -= old.bytes(); pool.delete(k); } b.reset(); pool.set(k, b); poolBytes += b.bytes(); for (const [k2, b2] of pool) { if (poolBytes <= POOL_CAP || b2 === b) break; pool.delete(k2); poolBytes -= b2.bytes(); } }
export function builderPoolStats() { return { builders: pool.size, MB: +(poolBytes / 1048576).toFixed(1) }; }
// Hold several builders keyed by material name.
// 60th — material keys. get(name) accepts a base material ('concrete'), a role ('winFrame'), a building-tagged role
// ('winFrame@b234') or, with a scope, a site's own copy: scope 'Lotus Tower' turns 'concrete' into 'Lotus Tower.concrete'
// (MAT copy made on demand; same textures and look until edited in the Texture Studio; meshes keep the plain name 'concrete' so
// code looking at mesh names is unaffected; Landmarks.js switches `scope` between sites). Each part is merged into the builder
// of the material that draws it (Materials.effKey: unsplit roles fall back to their base → the old draw layout). raw: one
// builder per tag, nothing merged (the Texture Studio's part picker rebuilds a building that way to tell its parts apart).
// 60th: `scope` (Landmarks.js: one per site) tags every copyable material as 'Scope.base' ('Lotus Tower.concrete'). Those parts
// are drawn with the base material (merged, same draw calls as before) until a Texture Studio rule gives that site its own copy:
// split before the build (pack rules, TexRuntime.preload) or live — `live` builders remember which index ranges of each merged
// mesh belong to which tag, and splitLive() moves a tag's ranges into a mesh of its own (shared vertex buffers, +1 draw per split).
const LIVE = new Set();
export class MultiBuilder {
  constructor(scope = null, { raw = false, live = false, pooled = false } = {}) { this.b = new Map(); this.scope = scope; this.raw = raw; this.plain = new Map(); this.seg = live ? new Map() : null; this.pooled = pooled; }
  // pooled builders (streaming jobs): hand a material's buffers back once they have been copied out (SliceBuild done)
  release(k) { const b = this.b.get(k); if (b && this.pooled) { this.b.delete(k); givePooled(k, b); } }
  releaseAll() { if (this.pooled) for (const k of [...this.b.keys()]) this.release(k); }
  tag(name) { if (this.scope && !name.includes('.') && !name.includes('@') && canCopy(name)) return this.scope + '.' + name; return name; }
  key(name) { const t = this.tag(name); return this.raw ? t : effKey(t); }
  get(name) {
    const t = this.tag(name), k = this.raw ? t : effKey(t); let b = this.b.get(k);
    if (!b) { this.b.set(k, (b = this.pooled ? takePooled(k) : new MeshBuilder())); const d = k.indexOf('.'); this.plain.set(k, d > 0 && !k.includes('@') ? k.slice(d + 1) : k); }
    if (this.seg) { let S = this.seg.get(k); if (!S) this.seg.set(k, (S = [])); const L = S[S.length - 1]; if (!L || L[0] !== t) { if (L && L[1] === b.idx.length) S.pop(); const L2 = S[S.length - 1]; if (!L2 || L2[0] !== t) S.push([t, b.idx.length]); } }
    return b;
  }
  // a handle that always draws into get(name) under the CURRENT scope (Landmarks.js keeps conc / paint / metal across sites)
  lazy(name) { const self = this; return new Proxy({}, { get(_, p) { const t = self.get(name); const v = t[p]; return typeof v === 'function' ? v.bind(t) : v; } }); }
  toMeshes(materials, opts = {}) {
    const out = [];
    for (const [name, mb] of this.b) { const n = mb.idx.length; const g = mb.build(); if (!g) continue; const m = meshFor(name, g, materials, opts); if (!m) continue; m.name = this.plain.get(name) || name; if (m.name !== name) m.userData.matKey = name;
      if (this.seg && materials === MAT) { const segs = []; const S = this.seg.get(name) || []; for (let i = 0; i < S.length; i++) { const a = S[i][1], e = i + 1 < S.length ? S[i + 1][1] : n; if (e <= a) continue; const L = segs[segs.length - 1]; if (L && L[0] === S[i][0] && L[1] + L[2] === a) L[2] += e - a; else segs.push([S[i][0], a, e - a]); }
        if (segs.some((x) => x[0] !== name)) { m.userData.segs = segs; LIVE.add(m); } }
      out.push(m); }
    return out;
  }
}
// the tag (e.g. 'Lotus Tower.concrete') of triangle `face` of a live mesh, or null
export function tagOfFace(mesh, face) { const segs = mesh && mesh.userData.segs; if (!segs || face == null) return null; const i = face * 3; for (const s of segs) if (i >= s[1] && i < s[1] + s[2]) return s[0]; return null; }
// move the ranges tagged with `keys` (just split, Materials.markSplit) out of their merged meshes into meshes of their own
export function splitLive(keys) {
  const ks = new Set(keys); let made = 0;
  for (const m of [...LIVE]) {
    const segs = m.userData.segs; if (!segs || !m.parent || !segs.some((x) => ks.has(x[0]))) continue;
    const g = m.geometry, I = g.index.array;
    const sub = (list) => { let len = 0; for (const x of list) len += x[2]; const A = new I.constructor(len); const out = []; let o = 0; for (const x of list) { A.set(I.subarray(x[1], x[1] + x[2]), o); out.push([x[0], o, x[2]]); o += x[2]; } return [A, out]; };
    const byTag = new Map(); for (const x of segs) if (ks.has(x[0])) { if (!byTag.has(x[0])) byTag.set(x[0], []); byTag.get(x[0]).push(x); }
    for (const [t, list] of byTag) { const mat = ensureMat(t); if (!mat) continue; const [A, s2] = sub(list); const ng = new THREE.BufferGeometry(); for (const [an, at] of Object.entries(g.attributes)) ng.setAttribute(an, at); ng.setIndex(new THREE.BufferAttribute(A, 1)); ng.computeBoundingBox(); ng.computeBoundingSphere();
      const nm = new THREE.Mesh(ng, mat); nm.name = m.name; nm.castShadow = m.castShadow; nm.receiveShadow = m.receiveShadow; nm.renderOrder = m.renderOrder; nm.layers.mask = m.layers.mask; nm.matrixAutoUpdate = false; nm.matrix.copy(m.matrix); nm.userData = { matKey: t, segs: s2 };
      m.parent.add(nm); nm.updateMatrixWorld(true); LIVE.add(nm); made++; }
    const keep = segs.filter((x) => !ks.has(x[0]) || !byTag.has(x[0]) || !MAT[x[0]]);
    if (keep.length) { const [A, s2] = sub(keep); g.setIndex(new THREE.BufferAttribute(A, 1)); g.computeBoundingSphere(); m.userData.segs = s2; } else { m.visible = false; m.userData.segs = []; LIVE.delete(m); }
  }
  return made;
}
// material for a builder key: role / scoped / per-building keys are made on demand from MAT (Materials.ensureMat); other
// material tables fall back to the base name ('Scope.paint' → paint)
export function matFor(name, materials) {
  let mat = materials[name]; if (mat) return mat;
  if (materials === MAT) return ensureMat(name);
  const dot = name.lastIndexOf('.'), at = name.lastIndexOf('@b'); const base = at > 0 ? name.slice(0, at) : dot > 0 ? name.slice(dot + 1) : null;
  return base ? matFor(base, materials) : null;
}
export function meshFor(name, g, materials, opts = {}) {
  const mat = matFor(name, materials); if (!mat) { console.warn('missing material', name); return null; }
  const m = new THREE.Mesh(g, mat); m.castShadow = opts.cast ?? true; m.receiveShadow = opts.receive ?? true; m.matrixAutoUpdate = false; m.updateMatrix(); m.name = name;
  if (FOLIAGE.has(name) || FOLIAGE.has(name.slice(name.lastIndexOf('.') + 1))) skipLampShadow(m); // alpha-cut leaves: no coarse street-lamp shadows (see skipLampShadow)
  return m;
}
// MeshBuilder.build() done in slices (identical geometry): a chunk's window frames can be ~1M vertices in ONE material,
// and converting that in one go stalled a frame for 100-250 ms. step() copies until the time budget runs out.
export class SliceBuild {
  constructor(mb) { this.mb = mb; const n = mb.pos.length; this.empty = !n; this.a = 0; this.o = 0;
    this.arr = !n || mb.owned ? [] : [[mb.pos, new Float32Array(n)], [mb.nor, new Float32Array(mb.nor.length)], [mb.uv, new Float32Array(mb.uv.length)], [mb.col, new Float32Array(mb.col.length)], [mb.idx, mb.vcount > 65535 ? new Uint32Array(mb.idx.length) : new Uint16Array(mb.idx.length)]];
    if (n && mb.owned) this.arr = [[mb.pos, mb.pos.a], [mb.nor, mb.nor.a], [mb.uv, mb.uv.a], [mb.col, mb.col.a], [mb.idx, mb.vcount > 65535 ? mb.idx.a : new Uint16Array(mb.idx.length)]]; } // 93rd: worker buffers are used as they are (no copy; same values / types)
  step(t0, budgetMs) {
    while (this.a < this.arr.length) { const [src, dst] = this.arr[this.a]; if (src.a === dst) { this.a++; this.o = 0; continue; } const end = Math.min(src.length, this.o + 131072); if (src instanceof GrowBuf) dst.set(src.a.subarray(this.o, end), this.o); else for (let i = this.o; i < end; i++) dst[i] = src[i]; this.o = end; if (end >= src.length) { this.a++; this.o = 0; } if (performance.now() - t0 > budgetMs) return false; }
    // bounding box, then bounding sphere (the same values computeBoundingBox / computeBoundingSphere give), also in slices
    if (this.empty) return true; const P = this.arr[0][1];
    if (!this.bb) this.bb = { i: 0, mn: [Infinity, Infinity, Infinity], mx: [-Infinity, -Infinity, -Infinity], r2: 0, j: 0, c: null };
    const B = this.bb;
    while (B.i < P.length) { const end = Math.min(P.length, B.i + 196608); for (let i = B.i; i < end; i += 3) { const x = P[i], y = P[i + 1], z = P[i + 2]; if (x < B.mn[0]) B.mn[0] = x; if (y < B.mn[1]) B.mn[1] = y; if (z < B.mn[2]) B.mn[2] = z; if (x > B.mx[0]) B.mx[0] = x; if (y > B.mx[1]) B.mx[1] = y; if (z > B.mx[2]) B.mx[2] = z; } B.i = end; if (performance.now() - t0 > budgetMs) return false; }
    if (!B.c) B.c = new THREE.Box3(new THREE.Vector3(...B.mn), new THREE.Vector3(...B.mx)).getCenter(new THREE.Vector3());
    while (B.j < P.length) { const end = Math.min(P.length, B.j + 196608), c = B.c; for (let i = B.j; i < end; i += 3) { const dx = P[i] - c.x, dy = P[i + 1] - c.y, dz = P[i + 2] - c.z, d = dx * dx + dy * dy + dz * dz; if (d > B.r2) B.r2 = d; } B.j = end; if (performance.now() - t0 > budgetMs) return false; }
    return true;
  }
  geometry() {
    if (this.empty) return null; const A = this.arr.map((x) => x[1]); const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(A[0], 3)); g.setAttribute('normal', new THREE.BufferAttribute(A[1], 3)); g.setAttribute('uv', new THREE.BufferAttribute(A[2], 2)); g.setAttribute('color', new THREE.BufferAttribute(A[3], 3));
    g.setIndex(new THREE.BufferAttribute(A[4], 1)); const B = this.bb;
    if (B && B.c && B.j >= A[0].length) { g.boundingBox = new THREE.Box3(new THREE.Vector3(...B.mn), new THREE.Vector3(...B.mx)); g.boundingSphere = new THREE.Sphere(B.c.clone(), Math.sqrt(B.r2)); } else { g.computeBoundingSphere(); g.computeBoundingBox(); }
    return g;
  }
}

// Alpha-cut foliage (tree crowns, leaf cards) is left out of the street-lamp / headlight shadow maps (shadow cameras tagged
// userData.noFoliage). Those maps are 512 px over a wide cone: leaf cut-outs became a coarse blocky maze that swam as the crowns
// swayed — on shiny facade glass it read as flickering static. Trunks, people, vehicles and props still cast lamp shadows, and
// the sun / moon shadow keeps the foliage. The object is skipped only inside those shadow passes (count / draw range 0, restored
// straight after), so it renders normally everywhere else.
export const FOLIAGE = new Set(['leaves', 'leavesBright', 'palm', 'foliage']);
export function skipLampShadow(o) {
  o.onBeforeShadow = (r, ob, cam, sc, geo) => { if (!sc.userData.noFoliage) return; if (ob.isInstancedMesh) { ob._skipN = ob.count; ob.count = 0; } else { ob._skipN = geo.drawRange.count; geo.drawRange.count = 0; } };
  o.onAfterShadow = (r, ob, cam, sc, geo) => { if (ob._skipN === undefined) return; if (ob.isInstancedMesh) ob.count = ob._skipN; else geo.drawRange.count = ob._skipN; ob._skipN = undefined; };
  return o;
}
