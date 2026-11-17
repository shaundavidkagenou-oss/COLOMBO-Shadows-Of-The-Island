// Gun modelling kit: the 27 firearms are DRAWN, not stacked from boxes. Every part is authored in millimetres in a side-view
// "drawing frame" (z towards the muzzle, y up, the bore on y = 0) from reference photographs of the real weapon, then:
//   slab()   — a side profile (outline with filleted corners, optional holes) extruded across x with a ROUNDED bevel, so
//              slides, frames, receivers, magazines, stocks and grip panels have the real silhouette and soft machined /
//              moulded edges; normals are creased (smooth over curves and bevels, sharp only on real corners)
//   lathe()  — turned parts along the bore: barrels with steps, muzzle devices, gas blocks, sight hoods, scope tubes
//   tube()   — a swept rounded section (WeaponLoft.sweep) for round grips, handguards and cheek pieces
//   rail()   — a picatinny rail with its cross slots
// then the finished gun is moved so its grip lands where the hands expect it (grip-solver frame: origin = grip point,
// +z = muzzle, +y = up) and userData (muzzle, sight, hold surfaces, moving parts) is derived from the same drawing.
import * as THREE from 'three';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { boxShape } from './GripSolver.js';
import { sweep, latheZ } from './WeaponLoft.js';

export const MM = 0.001;
const V2 = (x, y) => new THREE.Vector2(x, y);

// outline points [z, y, r?] in mm: r = fillet (tangent length) at that corner; { arc: [cz, cy, R, a0, a1], n } inserts an arc
export function outline(pts, seg = 5) {
  const P = []; const N = pts.length;
  for (let i = 0; i < N; i++) { const p = pts[i];
    if (p.arc) { const [cz, cy, R, a0, a1] = p.arc; const n = p.n || 10; for (let k = 0; k <= n; k++) { const a = a0 + (a1 - a0) * k / n; P.push([cz + Math.cos(a) * R, cy + Math.sin(a) * R]); } continue; }
    const r = p[2] || 0; if (!r) { P.push([p[0], p[1]]); continue; }
    const pa = pts[(i - 1 + N) % N], pb = pts[(i + 1) % N]; const A = pa.arc ? end(pa, 1) : pa, B = pb.arc ? end(pb, 0) : pb;
    const da = [A[0] - p[0], A[1] - p[1]], db = [B[0] - p[0], B[1] - p[1]]; const la = Math.hypot(...da) || 1, lb = Math.hypot(...db) || 1; const rr = Math.min(r, la * 0.49, lb * 0.49);
    const p0 = [p[0] + da[0] / la * rr, p[1] + da[1] / la * rr], p1 = [p[0] + db[0] / lb * rr, p[1] + db[1] / lb * rr];
    for (let k = 0; k <= seg; k++) { const t = k / seg, u = 1 - t; P.push([u * u * p0[0] + 2 * u * t * p[0] + t * t * p1[0], u * u * p0[1] + 2 * u * t * p[1] + t * t * p1[1]]); } }
  return P;
}
function end(p, which) { const [cz, cy, R, a0, a1] = p.arc; const a = which ? a1 : a0; return [cz + Math.cos(a) * R, cy + Math.sin(a) * R]; }
const area = (P) => { let s = 0; for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; };

// extruded side profile. w = width across x (mm), cx = centre x (mm), bev = edge radius (mm), holes = outlines cut through
export function slab(pts, w, opts = {}) {
  const bev = Math.min(opts.bev ?? Math.min(2, w * 0.22), w * 0.45); let P = outline(pts, opts.seg || 5); if (area(P) < 0) P = P.reverse();
  const sh = new THREE.Shape(P.map(([z, y]) => V2(z * MM, y * MM)));
  for (const h of opts.holes || []) { let H = outline(h, opts.seg || 5); if (area(H) > 0) H = H.reverse(); sh.holes.push(new THREE.Path(H.map(([z, y]) => V2(z * MM, y * MM)))); }
  const depth = Math.max(0.0002, (w - 2 * bev) * MM);
  const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: bev > 0.05, bevelThickness: bev * MM, bevelSize: bev * MM, bevelOffset: -bev * MM, bevelSegments: opts.bseg || 3, curveSegments: 4, steps: 1 });
  g.translate(0, 0, -depth / 2); g.rotateY(-Math.PI / 2); g.translate((opts.cx || 0) * MM, 0, 0); // shape x → +z, extrusion → x
  if (opts.taper) { const p = g.attributes.position; const [y0, y1, k] = opts.taper; for (let i = 0; i < p.count; i++) { const y = p.getY(i) / MM; const t = Math.min(1, Math.max(0, (y - y0) / (y1 - y0))); p.setX(i, (opts.cx || 0) * MM + (p.getX(i) - (opts.cx || 0) * MM) * (1 + (k - 1) * t)); } }
  return crease(g, opts.crease);
}
export function crease(g, ang = 52) { g.deleteAttribute('uv'); const c = toCreasedNormals(g, THREE.MathUtils.degToRad(ang)); g.dispose(); return c; }
// turned part on the bore line (or at height y, side offset x): profile [[z, r], …] in mm
export function lathe(prof, y = 0, x = 0, seg = 24) { return latheZ(prof.map(([z, r]) => [z * MM, r * MM]), y * MM, x * MM, seg); }
// swept rounded section, stations in mm ({ z, y, hw, hd, n, … } as WeaponLoft.sweep)
export function tube(st, opts = {}) { return sweep(st.map((s) => ({ ...s, z: s.z * MM, y: s.y * MM, hw: s.hw * MM, hd: s.hd * MM, x: (s.x || 0) * MM })), opts); }
// plain box in mm (small hardware only)
export function bx(w, h, d, x, y, z, rx = 0) { const g = new THREE.BoxGeometry(w * MM, h * MM, d * MM); if (rx) g.rotateX(rx); g.translate(x * MM, y * MM, z * MM); return g; }
export function cyl(r, len, x, y, z, axis = 'x', seg = 12) { const g = new THREE.CylinderGeometry(r * MM, r * MM, len * MM, seg); if (axis === 'x') g.rotateZ(Math.PI / 2); else if (axis === 'z') g.rotateX(Math.PI / 2); g.translate(x * MM, y * MM, z * MM); return g; }
// picatinny rail on top at height y (mm, base), from z0 to z1, width 21.2
export function rail(z0, z1, y, w = 21.2) {
  const L = z1 - z0; const parts = [slab([[0, 0], [L, 0], [L, 3.2, 0.6], [L - 0.8, 4.4, 0.4], [0.8, 4.4, 0.4], [0, 3.2, 0.6]].map(([z, yy, r]) => [z0 + z, y + yy, r]), w, { bev: 0.8 })];
  // the recoil grooves: 5.23 mm slots on a 10 mm pitch, cut across the top (modelled as raised crossbars between them)
  for (let z = z0 + 3; z < z1 - 6; z += 10) parts.push(slab([[z, y + 4.4], [z + 4.77, y + 4.4], [z + 4.77, y + 6.2, 0.5], [z, y + 6.2, 0.5]], w, { bev: 0.6 }));
  return parts;
}
// serrations: n grooves cut into a slide side — modelled as thin raised ribs proud of the side by `h` mm
export function serrations(z0, z1, n, y0, y1, xs, h = 0.6, lean = 0) {
  const out = []; const p = (z1 - z0) / n; for (let i = 0; i < n; i++) { const z = z0 + i * p; for (const s of [1, -1]) out.push(slab([[z, y0], [z + p * 0.45, y0], [z + p * 0.45 + lean, y1], [z + lean, y1]], h * 2, { cx: s * xs, bev: 0.25, seg: 1 })); }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// hold surfaces (GripSolver): the grip box from the front / back strap lines of the drawing, plus trigger, guard, frame
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
export function gripBox(front, back, w, rr = 7) { // front / back: [[z, y] top, [z, y] bottom] in mm
  const ax = [(front[0][0] - front[1][0] + back[0][0] - back[1][0]) / 2, (front[0][1] - front[1][1] + back[0][1] - back[1][1]) / 2]; const L = Math.hypot(...ax); const u = [ax[0] / L, ax[1] / L]; // up the grip
  const c = [(front[0][0] + front[1][0] + back[0][0] + back[1][0]) / 4, (front[0][1] + front[1][1] + back[0][1] + back[1][1]) / 4];
  const along = (p) => (p[0] - c[0]) * u[0] + (p[1] - c[1]) * u[1]; const across = (p) => (p[0] - c[0]) * u[1] - (p[1] - c[1]) * u[0];
  const hl = Math.max(...[...front, ...back].map((p) => Math.abs(along(p)))); const hd = (Math.abs(across(front[0]) + across(front[1])) / 2 + Math.abs(across(back[0]) + across(back[1])) / 2) / 2;
  const rake = Math.atan2(u[0], u[1]); return { c, rake, h: [w / 2, hl, hd], rr };
}
export function holdFrom(spec, off) { // spec in mm (drawing frame); off = drawing → model offset (m)
  const T = (z, y, x = 0) => V3(x * MM + off.x, y * MM + off.y, z * MM + off.z);
  const gb = spec.grip; const grip = boxShape(T(gb.c[0], gb.c[1]), gb.rake, gb.h.map((v) => v * MM), gb.rr * MM);
  const t = spec.trigger; // trigger blade: pivot [z, y], face point
  const blade = boxShape(T(t.z + 1.5, t.y - 7), -0.25, [0.002, 0.008, 0.002], 0.001); const trig = T(t.z + 3, t.y - 9);
  const g = spec.guard; const shapes = [grip, blade];
  if (g) shapes.push(boxShape(T((g.z0 + g.z1) / 2, g.yb), 0, [g.w / 2 * MM, 0.002, (g.z1 - g.z0) / 2 * MM], 0.001), boxShape(T(g.z1, (g.yb + g.yt) / 2), 0, [g.w / 2 * MM, (g.yt - g.yb) / 2 * MM, 0.0025], 0.001));
  for (const b of spec.blocks || []) shapes.push(boxShape(T(b[0], b[1]), b[5] || 0, [b[2] / 2 * MM, b[3] / 2 * MM, b[4] / 2 * MM], 0.002));
  const P = (p) => (p ? T(p[0], p[1], p[2] || 0) : null);
  return { grip, trig, trigBlade: blade, shapes, thumbR: P(spec.thumbR) || V3(grip.h[0] + 0.007, trig.y + 0.01, grip.c.z - 0.006), thumbL: P(spec.thumbL), fore: spec.fore ? { c: T(spec.fore[0], spec.fore[1]), X: V3(1, 0, 0), Y: V3(0, 1, 0), Z: V3(0, 0, 1), h: [spec.fore[2] / 2 * MM, spec.fore[3] / 2 * MM, 0.09], rr: Math.min(spec.fore[4] || 10, spec.fore[2] / 2, spec.fore[3] / 2) * MM } : null, foreAngle: spec.foreAngle, wrap: spec.wrap };
}

// Parts in the drawing frame, merged per material at the end and shifted into the grip frame
export class Kit {
  constructor() { this.by = new Map(); this.groups = new Map(); }
  add(mat, ...gs) { return this.to('body', mat, ...gs); }
  to(group, mat, ...gs) { if (!this.groups.has(group)) this.groups.set(group, new Map()); const by = this.groups.get(group); if (!by.has(mat)) by.set(mat, []); for (const g of gs.flat()) { if (!g) continue; const n = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(n.attributes)) if (!['position', 'normal'].includes(k)) n.deleteAttribute(k); if (!n.attributes.normal) n.computeVertexNormals(); by.get(mat).push(n); } return this; }
  build(off) { // → { body: Group, slide: Group, mag: Group, bolt: Group, … } with geometry shifted by off (m)
    const out = {}; for (const [name, by] of this.groups) { const grp = new THREE.Group(); grp.name = name;
      for (const [mat, gs] of by) { const merged = mergeFlat(gs); merged.translate(off.x, off.y, off.z); merged.computeBoundingSphere(); const m = new THREE.Mesh(merged, mat); m.castShadow = true; m.receiveShadow = true; grp.add(m); }
      out[name] = grp; }
    return out;
  }
}
function mergeFlat(list) { let n = 0; for (const g of list) n += g.attributes.position.count; const P = new Float32Array(n * 3), N = new Float32Array(n * 3); let o = 0;
  for (const g of list) { P.set(g.attributes.position.array, o * 3); N.set(g.attributes.normal.array, o * 3); o += g.attributes.position.count; g.dispose(); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2)); return g; }
