// Accumulates triangles into one indexed BufferGeometry (positions, normals, uvs, colours).
import * as THREE from 'three';
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
  box(cx, cy, cz, sx, sy, sz, { col, uvScale = 1, top = true, bottom = false, rotY = 0, uvRect = null } = {}) {
    const hx = sx / 2, hy = sy / 2, hz = sz / 2;
    const c = Math.cos(rotY), s = Math.sin(rotY);
    const P = (x, y, z) => [cx + x * c + z * s, cy + y, cz - x * s + z * c];
    const U = (len, h) => (uvRect ? uvRect : [0, 0, len / uvScale, h / uvScale]);
    this.quad(P(-hx, -hy, hz), P(hx, -hy, hz), P(hx, hy, hz), P(-hx, hy, hz), U(sx, sy), col);
    this.quad(P(hx, -hy, -hz), P(-hx, -hy, -hz), P(-hx, hy, -hz), P(hx, hy, -hz), U(sx, sy), col);
    this.quad(P(hx, -hy, hz), P(hx, -hy, -hz), P(hx, hy, -hz), P(hx, hy, hz), U(sz, sy), col);
    this.quad(P(-hx, -hy, -hz), P(-hx, -hy, hz), P(-hx, hy, hz), P(-hx, hy, -hz), U(sz, sy), col);
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
// Hold several builders keyed by material name.
export class MultiBuilder {
  constructor() { this.b = new Map(); }
  get(name) { if (!this.b.has(name)) this.b.set(name, new MeshBuilder()); return this.b.get(name); }
  toMeshes(materials, opts = {}) {
    const out = [];
    for (const [name, mb] of this.b) {
      const g = mb.build(); if (!g) continue; const mat = materials[name]; if (!mat) { console.warn('missing material', name); continue; }
      const m = new THREE.Mesh(g, mat); m.castShadow = opts.cast ?? true; m.receiveShadow = opts.receive ?? true; m.matrixAutoUpdate = false; m.updateMatrix(); m.name = name; out.push(m);
    }
    return out;
  }
}
