// Boat geometry: a lofted hull (stations from transom to stem, real section shapes) and a small parts kit (decks, cockpits,
// prisms, tubes, rails, seats) that every boat model is assembled from. Everything goes into one geometry per boat with a
// surface id per vertex (BoatMaterial.SURF), so a whole boat is one draw call.
// Boat space: +z forward (bow), +x port (left), +y up, y = 0 at the design waterline.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MeshBuilder } from '../gfx/MeshBuilder.js';
import { SURF } from './BoatMaterial.js';

const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const C = (c) => { const k = new THREE.Color(c); return [k.r, k.g, k.b]; };
export { C, lerp, sstep };

export class BoatBuilder {
  constructor() { this.parts = new Map(); this.lights = []; this.boxes = []; }
  mb(surf) { let m = this.parts.get(surf); if (!m) { m = new MeshBuilder(); this.parts.set(surf, m); } return m; }
  light(kind, x, y, z, extra = {}) { this.lights.push({ kind, p: [x, y, z], ...extra }); return this; }
  hit(x0, x1, y0, y1, z0, z1, part = 'hull') { this.boxes.push({ x0, x1, y0, y1, z0, z1, part }); return this; }
  // ---- primitives
  box(surf, col, cx, cy, cz, sx, sy, sz, { rx = 0, ry = 0, rz = 0, bottom = true } = {}) {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(cx, cy, cz), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), new THREE.Vector3(sx, sy, sz));
    const g = bottom ? BOX : BOX_NB; this.mb(surf).geometry(g, m, C(col)); return this;
  }
  // cylinder between two points (radius r0 at a, r1 at b)
  cyl(surf, col, a, b, r0, r1 = r0, seg = 8, caps = true) {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b); const d = B.clone().sub(A); const len = d.length(); if (len < 1e-5) return this;
    const g = cylGeo(r0, r1, seg, caps); const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    const m = new THREE.Matrix4().compose(A, q, new THREE.Vector3(1, len, 1)); this.mb(surf).geometry(g, m, C(col)); return this;
  }
  sphere(surf, col, c, r, sy = 1, seg = 10) { const m = new THREE.Matrix4().compose(new THREE.Vector3(...c), new THREE.Quaternion(), new THREE.Vector3(r, r * sy, r)); this.mb(surf).geometry(sphGeo(seg), m, C(col)); return this; }
  tube(surf, col, pts, r, seg = 6) { for (let i = 0; i < pts.length - 1; i++) this.cyl(surf, col, pts[i], pts[i + 1], r, r, seg, false); for (let i = 1; i < pts.length - 1; i++) this.sphere(surf, col, pts[i], r, 1, 6); return this; }
  quad(surf, col, a, b, c, d) { this.mb(surf).quad(a, b, c, d, [0, 0, 1, 1], C(col)); return this; }
  quad2(surf, col, a, b, c, d) { this.quad(surf, col, a, b, c, d); this.quad(surf, col, d, c, b, a); return this; } // double-sided
  tri(surf, col, a, b, c) { this.mb(surf).quad(a, b, c, c, [0, 0, 1, 1], C(col)); return this; }
  // vertical prism between two plan outlines (same vertex count, CCW seen from above): bottom ring at y0, top ring at y1
  prism(surf, col, bot, top, y0, y1, { cap = true, base = false, sideSurf = null, capSurf = null, capCol = null } = {}) {
    const n = bot.length; let ar = 0; for (let i = 0; i < n; i++) { const p = bot[i], q = bot[(i + 1) % n]; ar += p[0] * q[1] - q[0] * p[1]; } if (ar > 0) { bot = [...bot].reverse(); top = [...top].reverse(); } // side normals outward
    for (let i = 0; i < n; i++) { const j = (i + 1) % n; const a = bot[i], b = bot[j], c = top[j], d = top[i]; this.quad(sideSurf ?? surf, col, [a[0], y0, a[1]], [b[0], y0, b[1]], [c[0], y1, c[1]], [d[0], y1, d[1]]); }
    if (cap) this.poly(capSurf ?? surf, capCol ?? col, top, y1, false);
    if (base) this.poly(surf, col, bot, y0, true);
    return this;
  }
  poly(surf, col, pts, y, down = false) { const m = this.mb(surf); const base = m.vcount; const k = C(col); for (const [x, z] of pts) m.vert(x, y, z, 0, down ? -1 : 1, 0, x, z, k); let cx = 0, cz = 0; for (const [x, z] of pts) { cx += x; cz += z; } cx /= pts.length; cz /= pts.length; const c = m.vert(cx, y, cz, 0, down ? -1 : 1, 0, cx, cz, k);
    // fan from the centroid: outlines here are star-shaped about it (decks, cabin tops)
    let area = 0; for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; area += a[0] * b[1] - b[0] * a[1]; }
    const ji = (area > 0) === !down; for (let i = 0; i < pts.length; i++) { const j = (i + 1) % pts.length; if (ji) m.idx.push(c, base + j, base + i); else m.idx.push(c, base + i, base + j); } // (y-normal of (c,i,j) = −cross2D)
    return this;
  }
  // a band of glass let into a slanted/vertical face: quad slightly proud of the surface along its normal
  // (always pushed OUT of the body it is let into: away from the boat's centre line, or from `from` = [x, z] of a demihull)
  pane(surf, a, b, c, d, out = 0.012, col = '#1a242c', from = null) { const n = new THREE.Vector3().subVectors(new THREE.Vector3(...b), new THREE.Vector3(...a)).cross(new THREE.Vector3().subVectors(new THREE.Vector3(...d), new THREE.Vector3(...a))).normalize();
    const cx = (a[0] + b[0] + c[0] + d[0]) / 4 - (from ? from[0] : 0), cz = (a[2] + b[2] + c[2] + d[2]) / 4 - (from ? from[1] : 0); if (n.x * cx + n.z * cz < 0) n.negate(); n.multiplyScalar(Math.abs(out));
    const o = (p) => [p[0] + n.x, p[1] + n.y, p[2] + n.z]; return this.quad(surf, col, o(a), o(b), o(c), o(d)); }
  geom(surf, col, g, m) { this.mb(surf).geometry(g, m || new THREE.Matrix4(), C(col)); return this; }
  // ---- finish: one geometry, aMat per vertex
  build() {
    const gs = []; for (const [surf, m] of this.parts) { const g = m.build(); if (!g) continue; const a = new Float32Array(g.attributes.position.count).fill(surf); g.setAttribute('aMat', new THREE.BufferAttribute(a, 1)); if (g.index && g.index.array instanceof Uint16Array) g.setIndex(new THREE.Uint32BufferAttribute(Array.from(g.index.array), 1)); gs.push(g); }
    const g = mergeGeometries(gs, false); g.computeBoundingBox(); g.computeBoundingSphere(); return g;
  }
}
const BOX = new THREE.BoxGeometry(1, 1, 1), BOX_NB = BOX; const cylCache = new Map(), sphCache = new Map();
function cylGeo(r0, r1, seg, caps) { const k = `${r0.toFixed(4)}|${r1.toFixed(4)}|${seg}|${caps}`; let g = cylCache.get(k); if (!g) { g = new THREE.CylinderGeometry(r1, r0, 1, seg, 1, !caps); g.translate(0, 0.5, 0); cylCache.set(k, g); } return g; }
function sphGeo(seg) { let g = sphCache.get(seg); if (!g) { g = new THREE.SphereGeometry(1, seg, Math.max(4, seg >> 1)); sphCache.set(seg, g); } return g; }

// ------------------------------------------------------------------------------------------------- the lofted hull
// h: { L, B, T (canoe-body depth at its deepest), Ft, Fm, Fb (freeboard transom / mid / bow), kind: 'chine'|'round',
//      dr0, dr1 (deadrise at transom / forward, rad), chine (fraction of half-beam), tw (half-beam at the transom, fraction),
//      fine (bow taper exponent), forefoot (station where the keel starts to rise), rake (stem rake, m), flare (topside flare,
//      fraction), xOff (centre of a catamaran demihull), tumble, transomRake (m), sheerCurve }
export class Hull {
  constructor(h) { this.h = Object.assign({ kind: 'chine', T: 0.5, Ft: 0.8, Fm: 0.9, Fb: 1.15, dr0: 0.36, dr1: 0.85, chine: 0.86, tw: 0.9, fine: 1.9, forefoot: 0.55, rake: 0.6, flare: 0.08, xOff: 0, tumble: 0, transomRake: 0.1, keelRise: 0.55, maxAt: 0.42, NS: 40 }, h); }
  z(s) { return -this.h.L / 2 + s * this.h.L; }
  hb(s) { const h = this.h; const m = h.maxAt; if (s <= m) { const t = s / m; return (h.B / 2) * (h.tw + (1 - h.tw) * Math.pow(Math.sin((t * Math.PI) / 2), 0.7)); }
    const t = (s - m) / (1 - m); return (h.B / 2) * Math.pow(Math.max(0, 1 - Math.pow(t, h.fine)), 0.62); }
  sheer(s) { const h = this.h; return s < 0.5 ? lerp(h.Ft, h.Fm, sstep(0, 0.5, s)) : lerp(h.Fm, h.Fb, Math.pow((s - 0.5) / 0.5, 1.7)); }
  keel(s) { const h = this.h; const r = Math.max(0, (s - h.forefoot) / (1 - h.forefoot)); return lerp(-h.T, this.sheer(1) * h.keelRise * 0.35, Math.pow(r, 2.1)); } // forefoot curving up ever faster to the stem foot, a little above the waterline (the stem then rakes up to the sheer)
  dr(s) { const h = this.h; return lerp(h.dr0, h.dr1, Math.pow(s, 1.6)); }
  // half section at station s: list of [x, y] from the keel up to the sheer, and the index of the chine
  section(s) {
    const h = this.h, hb = Math.max(0.002, this.hb(s)), sy = this.sheer(s), ky = Math.min(this.keel(s), sy - 0.05); const pts = [];
    if (h.kind === 'chine') {
      const cx = hb * h.chine * (1 - h.flare); const cy = Math.min(ky + cx * Math.tan(this.dr(s)), sy - 0.08);
      for (let i = 0; i <= 5; i++) { const t = i / 5; const x = cx * t; pts.push([x, ky + (cy - ky) * Math.pow(t, 1.12)]); } // bottom: very slightly convex
      pts.push([cx + Math.min(0.05, hb * 0.03), cy]); // spray rail / chine flat
      for (let i = 1; i <= 5; i++) { const t = i / 5; const x = lerp(cx + Math.min(0.05, hb * 0.03), hb, Math.pow(t, 0.75)); pts.push([x, lerp(cy, sy, t)]); }
      return { pts, chine: 6 };
    }
    // round bilge: an elliptic bilge from the canoe-body bottom to the widest waterline, then the topsides to the sheer
    const wl = 0.08, bw = hb * (1 - h.flare); const depth = Math.max(0.05, wl - ky);
    for (let i = 0; i <= 8; i++) { const th = -Math.PI / 2 + (i / 8) * (Math.PI / 2); const c = Math.cos(th), sn = Math.sin(th); pts.push([bw * Math.pow(Math.max(0, c), 0.7), wl + depth * sn]); }
    for (let i = 1; i <= 4; i++) { const t = i / 4; pts.push([lerp(bw, hb + h.tumble * t * (1 - t) * 4, t), lerp(wl, sy, t)]); }
    return { pts, chine: -1 };
  }
  stationZ(s, y, ky, sy) { const h = this.h; let z = this.z(s); const up = (y - ky) / Math.max(0.05, sy - ky); if (s > 0.8) z += h.rake * sstep(0.8, 1, s) * up; if (s < 0.02) z -= h.transomRake * up * (1 - s / 0.02); return z; }
  // the hull skin into the builder (both sides), returns nothing; topsides/bottom are separate smooth surfaces (hard chine)
  build(bb, { surf = SURF.hull, col = '#ffffff', transomCol = null } = {}) {
    const h = this.h, NS = h.NS; const secs = []; for (let i = 0; i <= NS; i++) { const s = Math.pow(i / NS, 1.0); const S = this.section(s); const ky = Math.min(this.keel(s), this.sheer(s) - 0.05), sy = this.sheer(s); secs.push({ s, pts: S.pts.map(([x, y]) => [x, y, this.stationZ(s, y, ky, sy)]), chine: S.chine }); }
    const nP = secs[0].pts.length; const ch = secs[0].chine;
    const grids = ch > 0 ? [[0, ch], [ch, nP - 1]] : [[0, nP - 1]];
    for (const side of [1, -1]) for (const [c0, c1] of grids) {
      const pos = [], idx = []; const W = c1 - c0 + 1;
      for (let i = 0; i <= NS; i++) for (let c = c0; c <= c1; c++) { const p = secs[i].pts[c]; pos.push(h.xOff + side * p[0], p[1], p[2]); }
      for (let i = 0; i < NS; i++) for (let c = 0; c < W - 1; c++) { const a = i * W + c, b = (i + 1) * W + c; if (side > 0) idx.push(a, a + 1, b, b, a + 1, b + 1); else idx.push(a, b, a + 1, b, b + 1, a + 1); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); bb.geom(surf, col, g);
    }
    // transom: fan across the aft section (both sides joined), facing aft
    const t0 = secs[0].pts; const ring = [...t0.map((p) => [h.xOff + p[0], p[1], p[2]]).reverse(), ...t0.slice(1).map((p) => [h.xOff - p[0], p[1], p[2]])];
    const m = bb.mb(transomCol ? SURF.paint : surf); const kc = C(transomCol || col); const base = m.vcount;
    for (const p of ring) m.vert(p[0], p[1], p[2], 0, 0, -1, 0, 0, kc); let tw = 0; for (let i = 0; i < ring.length; i++) { const p = ring[i], q = ring[(i + 1) % ring.length]; tw += p[0] * q[1] - q[0] * p[1]; } /* x-y area: CCW → fan (0, i+1, i) faces −z */ for (let i = 1; i < ring.length - 1; i++) { if (tw > 0) m.idx.push(base, base + i + 1, base + i); else m.idx.push(base, base + i, base + i + 1); }
    this.secs = secs; return this;
  }
  // half-beam of the hull at station s and height y (for fitting decks / rails / lights to the actual skin)
  beamAt(s, y) { const S = this.section(s).pts; for (let i = 0; i < S.length - 1; i++) { const a = S[i], b = S[i + 1]; if ((y - a[1]) * (y - b[1]) <= 0 && Math.abs(b[1] - a[1]) > 1e-6) return lerp(a[0], b[0], (y - a[1]) / (b[1] - a[1])); } return S[S.length - 1][0]; }
  sAt(z) { return Math.min(1, Math.max(0, (z + this.h.L / 2) / this.h.L)); }
  // sheer outline (port side, aft to fore) at stations s0..s1, optionally inset
  outline(s0, s1, inset = 0, n = 16) { const out = []; for (let i = 0; i <= n; i++) { const s = lerp(s0, s1, i / n); out.push([this.h.xOff + Math.max(0, this.hb(s) - inset), this.sheer(s), this.z(s)]); } return out; }
}

// --------------------------------------------------------------------------------------------- decks, cockpits, gunwales
// A deck on the sheer from station s0 to s1 (cambered), its own surface (teak / non-skid / paint)
export function deck(bb, H, s0, s1, { surf = SURF.nonskid, col = '#e9e7e0', inset = 0, camber = 0.04, n = 18, drop = 0 } = {}) {
  const xo = H.h.xOff;
  for (let i = 0; i < n; i++) { const sa = lerp(s0, s1, i / n), sb = lerp(s0, s1, (i + 1) / n); const ha = Math.max(0, H.hb(sa) - inset), hb = Math.max(0, H.hb(sb) - inset); const ya = H.sheer(sa) - drop, yb = H.sheer(sb) - drop; const za = H.z(sa), zb = H.z(sb);
    for (let k = -2; k < 2; k++) { const u0 = k / 2, u1 = (k + 1) / 2; const cy = (u) => camber * (1 - u * u);
      bb.quad(surf, col, [xo + ha * u1, ya + cy(u1), za], [xo + ha * u0, ya + cy(u0), za], [xo + hb * u0, yb + cy(u0), zb], [xo + hb * u1, yb + cy(u1), zb]); } }
}
// A sunken cockpit between stations s0..s1: floor, inner gunwale walls, the gunwale cap, fore and aft bulkheads
export function cockpit(bb, H, s0, s1, floorY, { gw = 0.14, floorSurf = SURF.nonskid, floorCol = '#e6e4dc', wallCol = '#f1f0ea', capSurf = SURF.paint, capCol = '#f4f3ee', aftWall = true, foreWall = true, n = 14, padCol = null } = {}) {
  const xo = H.h.xOff; const pts = [];
  for (let i = 0; i <= n; i++) { const s = lerp(s0, s1, i / n); pts.push({ s, z: H.z(s), hb: H.hb(s), y: H.sheer(s) }); }
  for (let i = 0; i < n; i++) { const a = pts[i], b = pts[i + 1]; const ia = Math.max(0.05, a.hb - gw), ib = Math.max(0.05, b.hb - gw);
    bb.quad(floorSurf, floorCol, [xo - ia, floorY, a.z], [xo + ia, floorY, a.z], [xo + ib, floorY, b.z], [xo - ib, floorY, b.z]); // floor
    for (const sd of [1, -1]) { const A = [xo + sd * ia, floorY, a.z], B = [xo + sd * ib, floorY, b.z], Bt = [xo + sd * ib, b.y, b.z], At = [xo + sd * ia, a.y, a.z];
      if (sd > 0) bb.quad(SURF.paint, wallCol, B, A, At, Bt); else bb.quad(SURF.paint, wallCol, A, B, Bt, At); // inner wall faces the cockpit
      if (padCol) { const pA = [xo + sd * (ia - 0.012), floorY + 0.35, a.z], pB = [xo + sd * (ib - 0.012), floorY + 0.35, b.z]; const pAt = [pA[0], a.y - 0.12, a.z], pBt = [pB[0], b.y - 0.12, b.z]; if (sd > 0) bb.quad(SURF.vinyl, padCol, pB, pA, pAt, pBt); else bb.quad(SURF.vinyl, padCol, pA, pB, pBt, pAt); } // bolster pads
      const oA = [xo + sd * a.hb, a.y, a.z], oB = [xo + sd * b.hb, b.y, b.z]; if (sd > 0) bb.quad(capSurf, capCol, At, Bt, oB, oA); else bb.quad(capSurf, capCol, Bt, At, oA, oB); } }
  const wall = (p, facing) => { const ia = Math.max(0.05, p.hb - gw); const a = [xo - ia, floorY, p.z], b = [xo + ia, floorY, p.z], c = [xo + ia, p.y, p.z], d = [xo - ia, p.y, p.z]; if (facing > 0) bb.quad(SURF.paint, wallCol, a, b, c, d); else bb.quad(SURF.paint, wallCol, b, a, d, c); };
  if (aftWall) wall(pts[0], 1); if (foreWall) wall(pts[n], -1);
}
// stanchions + a top rail (and a mid wire) along the sheer between s0 and s1 on both sides (bow rail when joined at the stem)
export function rail(bb, H, s0, s1, { h = 0.62, inset = 0.06, step = 1.1, joinBow = false, mid = true, r = 0.016, col = '#d9dde0', y = null } = {}) {
  const xo = H.h.xOff; const len = (s1 - s0) * H.h.L; const n = Math.max(2, Math.round(len / step));
  for (const sd of [1, -1]) { const top = [], low = [];
    for (let i = 0; i <= n; i++) { const s = lerp(s0, s1, i / n); const x = xo + sd * Math.max(0.02, H.hb(s) - inset); const yy = y ?? H.sheer(s); const z = H.z(s) + (joinBow && s > 0.97 ? 0 : 0);
      bb.cyl(SURF.steel, col, [x, yy, z], [x, yy + h, z], r * 1.1, r, 6, false); top.push([x, yy + h, z]); low.push([x, yy + h * 0.5, z]); }
    if (joinBow) { const zb = H.z(s1) + 0.12, yb = (y ?? H.sheer(s1)) + h; top.push([xo, yb, zb]); }
    bb.tube(SURF.steel, col, top, r * 1.25, 6); if (mid) bb.tube(SURF.steel, col, low, r * 0.55, 4); }
}
// cushioned seat / bench: base + cushion + optional backrest
export function seat(bb, x, y, z, w, d, { back = 0.45, col = '#ece6d8', base = '#f2f1ec', ry = 0, piping = '#2a3446' } = {}) {
  const c = Math.cos(ry), s = Math.sin(ry); const P = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
  const [bx, bz] = P(0, 0); bb.box(SURF.paint, base, bx, y - 0.2, bz, w, 0.36, d, { ry }); bb.box(SURF.vinyl, col, bx, y + 0.05, bz, w - 0.02, 0.12, d - 0.02, { ry });
  bb.box(SURF.vinyl, piping, bx, y - 0.005, bz, w - 0.01, 0.015, d - 0.01, { ry });
  if (back > 0) { const [kx, kz] = P(0, -d / 2 + 0.06); bb.box(SURF.vinyl, col, kx, y + 0.11 + back / 2, kz, w - 0.04, back, 0.12, { ry, rx: -0.18 }); }
}
// steering wheel (stainless rim, spokes, hub) at p, facing aft-up by tilt; returns the wheel spec the rider's hands use
export function wheel(bb, p, r = 0.19, tilt = 0.9, col = '#d8dcdf') {
  const g = new THREE.TorusGeometry(r, 0.016, 6, 20); const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-tilt, 0, 0)); bb.geom(SURF.steel, col, g, new THREE.Matrix4().compose(new THREE.Vector3(...p), q, new THREE.Vector3(1, 1, 1)));
  for (let k = 0; k < 3; k++) { const a = (k / 3) * Math.PI * 2 + 0.5; const e = new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, 0).applyQuaternion(q); bb.cyl(SURF.steel, col, p, [p[0] + e.x, p[1] + e.y, p[2] + e.z], 0.009, 0.009, 4, false); }
  bb.cyl(SURF.rubber, '#1c1d1f', p, [p[0], p[1] - Math.cos(tilt) * 0.12, p[2] - Math.sin(tilt) * 0.12 * -1], 0.04, 0.04, 8);
  return { p: [...p], r, tilt };
}
// outboard engine (cowling, mid-section, gearcase, skeg, prop) hung on the transom at (x, y, z); size 1 ≈ 250 hp
export function outboard(bb, x, y, z, { size = 1, col = '#f1f1ef', trim = '#1b1c1e' } = {}) {
  const s = size; const cz = z - 0.32 * s;
  bb.box(SURF.paint, col, x, y + 0.42 * s, cz, 0.5 * s, 0.62 * s, 0.68 * s); // cowling
  bb.box(SURF.paint, col, x, y + 0.77 * s, cz - 0.03 * s, 0.44 * s, 0.1 * s, 0.6 * s, { rx: 0.06 }); // cowl top
  bb.box(SURF.rubber, trim, x, y + 0.15 * s, cz + 0.02 * s, 0.52 * s, 0.07 * s, 0.7 * s); // lower cowl seam
  bb.box(SURF.paint, trim, x, y - 0.25 * s, cz + 0.05 * s, 0.2 * s, 0.75 * s, 0.32 * s); // mid-section
  bb.box(SURF.paint, trim, x, y - 0.68 * s, cz + 0.08 * s, 0.16 * s, 0.16 * s, 0.52 * s); // gearcase / anti-ventilation plate
  bb.box(SURF.paint, trim, x, y - 0.6 * s, cz + 0.06 * s, 0.34 * s, 0.025 * s, 0.4 * s);
  bb.box(SURF.paint, trim, x, y - 0.86 * s, cz + 0.02 * s, 0.05 * s, 0.22 * s, 0.22 * s); // skeg
  for (let k = 0; k < 3; k++) { const a = (k / 3) * Math.PI * 2; bb.box(SURF.steel, '#9da3a8', x + Math.cos(a) * 0.1 * s, y - 0.68 * s + Math.sin(a) * 0.1 * s, cz - 0.22 * s, 0.07 * s, 0.17 * s, 0.03 * s, { rz: a }); } // prop blades
  bb.box(SURF.steel, '#8e959b', x, y + 0.05, z - 0.06, 0.14, 0.32, 0.12); // transom bracket
}
// ring of vertical posts + canopy slab (T-top / hardtop) with optional antenna whips
export function canopy(bb, x0, x1, z0, z1, y0, y1, { col = '#f3f3ef', post = '#d7dadc', thick = 0.07, posts = 4, under = '#d9d6cc' } = {}) {
  const xs = posts === 2 ? [0] : [x0 + 0.08, x1 - 0.08]; const zs = [z0 + 0.15, z1 - 0.15];
  for (const xx of posts === 2 ? [(x0 + x1) / 2 - (x1 - x0) * 0.35, (x0 + x1) / 2 + (x1 - x0) * 0.35] : xs) for (const zz of posts === 2 ? [z0 + 0.3] : zs) bb.cyl(SURF.steel, post, [xx, y0, zz], [xx, y1, zz], 0.03, 0.03, 8, false);
  bb.box(SURF.paint, col, (x0 + x1) / 2, y1 + thick / 2, (z0 + z1) / 2, x1 - x0, thick, z1 - z0); bb.box(SURF.vinyl, under, (x0 + x1) / 2, y1 - 0.004, (z0 + z1) / 2, x1 - x0 - 0.06, 0.01, z1 - z0 - 0.06);
}
// a plan outline (half-beam function) → polygon (CCW from above) inset from the hull
export function planPoly(H, s0, s1, inset, n = 10, xo = H.h.xOff) { const P = []; for (let i = 0; i <= n; i++) { const s = lerp(s0, s1, i / n); P.push([xo + Math.max(0.05, H.hb(s) - inset), H.z(s)]); } for (let i = n; i >= 0; i--) { const s = lerp(s0, s1, i / n); P.push([xo - Math.max(0.05, H.hb(s) - inset), H.z(s)]); } return P.reverse(); }
export function scalePoly(P, k, cx = 0, cz = null) { const zc = cz ?? P.reduce((a, p) => a + p[1], 0) / P.length; return P.map(([x, z]) => [cx + (x - cx) * k, zc + (z - zc) * k]); }
export function shrink(P, dx, dzF, dzA) { const zs = P.map((p) => p[1]); const zmin = Math.min(...zs), zmax = Math.max(...zs); return P.map(([x, z]) => [Math.sign(x) * Math.max(0.05, Math.abs(x) - dx), lerp(zmin + dzA, zmax - dzF, (z - zmin) / Math.max(1e-3, zmax - zmin))]); }
