// Builds the ground layer per chunk: asphalt, markings, sidewalks, kerbs, lots, shoreline, railway.
import * as THREE from 'three';
import * as L from './Layout.js';
import { chunkIndex, NCX, NCZ } from './CityPlan.js';
import { MultiBuilder } from '../gfx/MeshBuilder.js';
import { RNG, hash2 } from '../core/rng.js';

const RY = L.ROAD_Y, LY = L.LAND_Y;
const WHITE = [0.93, 0.93, 0.9], YELLOW = [0.93, 0.76, 0.12];
const lotMaterial = (cell) => {
  const zn = L.zoneAt(cell.cx, cell.cz);
  if (zn) { if (['vmpark', 'museum', 'townhall'].includes(zn.id)) return 'lawn'; if (zn.id === 'gangaramaya' || zn.id === 'kovil') return 'sand'; return 'concrete'; }
  const st = L.DISTRICTS[cell.district].style;
  return { villa: 'lawn', residential: 'laterite', lake: 'lawn', green: 'grass', port: 'concrete' }[st] || 'concrete';
};
// Sutherland–Hodgman clip of a small polygon against land (= !isWater), boundary found by bisection.
function clipLand(pts) {
  const land = pts.map(([x, z]) => !L.isWater(x, z));
  if (land.every(Boolean)) return pts; if (!land.some(Boolean)) return [];
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length], la = land[i], lb = land[(i + 1) % pts.length];
    if (la) out.push(a);
    if (la !== lb) { let lo = 0, hi = 1; for (let k = 0; k < 14; k++) { const m = (lo + hi) / 2; const l = !L.isWater(a[0] + (b[0] - a[0]) * m, a[1] + (b[1] - a[1]) * m); if (l === la) lo = m; else hi = m; } const m = (lo + hi) / 2; out.push([a[0] + (b[0] - a[0]) * m, a[1] + (b[1] - a[1]) * m]); }
  }
  return out;
}
const kerbStriped = (seg, x, z) => { const d = L.districtIdAt(x, z); return seg.level <= 1 && ['fort', 'gftowers', 'gfgreen', 'pettah', 'kollupitiya', 'beira'].includes(d); };

export function buildGround(progress) {
  const chunks = []; for (let i = 0; i < NCX * NCZ; i++) chunks.push(new MultiBuilder());
  const at = (x, z) => { let c = chunkIndex(x, z); if (c < 0) { const cx = Math.max(0, Math.min(NCX - 1, Math.floor((x - L.BOUNDS.minX) / 200))), cz = Math.max(0, Math.min(NCZ - 1, Math.floor((z - L.BOUNDS.minZ) / 200))); c = cz * NCX + cx; } return chunks[c]; };

  // ---------------- roads
  for (const s of L.segments) {
    const mx = (s.x0 + s.x1) / 2, mz = (s.z0 + s.z1) / 2; const mb = at(mx, mz);
    const road = mb.get('road'), mk = mb.get('marking');
    if (s.dir === 'v') {
      const n0 = L.nodeAt(s.i, s.j), n1 = L.nodeAt(s.i, s.j + 1);
      const za = s.z0 + n0.hwH, zb = s.z1 - n1.hwH; if (zb <= za) continue;
      road.hrect(s.x0 - s.hw, za, s.x0 + s.hw, zb, RY, 10);
      markings(mk, s, 'v', za, zb, n0, n1);
      if (s.bridge) bridge(mb, s, 'v');
    } else {
      const n0 = L.nodeAt(s.i, s.j), n1 = L.nodeAt(s.i + 1, s.j);
      const xa = s.x0 + n0.hwV, xb = s.x1 - n1.hwV; if (xb <= xa) continue;
      road.hrect(xa, s.z0 - s.hw, xb, s.z0 + s.hw, RY, 10);
      markings(mk, s, 'h', xa, xb, n0, n1);
    }
  }
  for (const n of L.nodes) if (n.segs.length) {
    const hv = n.hwV || n.hwH * 0.0, hh = n.hwH || 0;
    if (hv > 0 && hh > 0) at(n.x, n.z).get('road').hrect(n.x - hv, n.z - hh, n.x + hv, n.z + hh, RY, 10);
  }
  progress && progress(0.3);

  // ---------------- cells: sidewalks, lots, kerbs
  for (const c of L.cells) {
    if (c.water) continue;
    const mb = at(c.cx, c.cz); const lotMat = lotMaterial(c);
    const [lx0, lx1, lz0, lz1] = c.land; if (lx1 - lx0 < 0.5 || lz1 - lz0 < 0.5) continue;
    const walkMat = ['fort', 'gftowers', 'cinnamon', 'kollupitiya'].includes(c.district) ? 'walkGrey' : 'walk';
    const wT = c.T ? c.T.walk : 0, wB = c.B ? c.B.walk : 0, wL = c.L ? c.L.walk : 0, wR = c.R ? c.R.walk : 0;
    let rTL = 0, rTR = 0, rBL = 0, rBR = 0; const K = mb.get('kerb');
    if (!c.partial) {
      const W = mb.get(walkMat);
      // rounded kerb corners where two roads meet (radius limited by both footpaths)
      const rad = (a, b) => (a && b ? Math.min(a, b, 3.2) * 0.92 : 0);
      rTL = rad(c.T && wT, c.L && wL); rTR = rad(c.T && wT, c.R && wR); rBL = rad(c.B && wB, c.L && wL); rBR = rad(c.B && wB, c.R && wR);
      if (wT) { W.hrect(lx0 + rTL, lz0, lx1 - rTR, lz0 + wT, LY, 2); if (rTL) W.hrect(lx0, lz0 + rTL, lx0 + rTL, lz0 + wT, LY, 2); if (rTR) W.hrect(lx1 - rTR, lz0 + rTR, lx1, lz0 + wT, LY, 2); }
      if (wB) { W.hrect(lx0 + rBL, lz1 - wB, lx1 - rBR, lz1, LY, 2); if (rBL) W.hrect(lx0, lz1 - wB, lx0 + rBL, lz1 - rBL, LY, 2); if (rBR) W.hrect(lx1 - rBR, lz1 - wB, lx1, lz1 - rBR, LY, 2); }
      const corner = (ox, oz, sx, sz, r) => { // quarter-disc paving + asphalt fill + curved kerb
        if (!r) return; const cx = ox + sx * r, cz = oz + sz * r, N = 8, arc = [];
        for (let k = 0; k <= N; k++) { const t = (k / N) * Math.PI / 2; arc.push([cx - sx * r * Math.cos(t), cz - sz * r * Math.sin(t)]); }
        W.hpoly([[cx, cz], ...arc], LY, 2); mb.get('road').hpoly([[ox, oz], ...arc], L.ROAD_Y, 10);
        for (let k = 0; k < N; k++) { const a = arc[k], b = arc[k + 1]; const kc = [0.78, 0.77, 0.74];
          K.wall(a[0], a[1], b[0], b[1], RY - 0.02, LY, [0, 0, 0.4, 0.1], kc); K.wall(b[0], b[1], a[0], a[1], RY - 0.02, LY, [0, 0, 0.4, 0.1], kc); }
      };
      corner(lx0, lz0, 1, 1, rTL); corner(lx1, lz0, -1, 1, rTR); corner(lx0, lz1, 1, -1, rBL); corner(lx1, lz1, -1, -1, rBR);
      if (wL) W.hrect(lx0, lz0 + wT, lx0 + wL, lz1 - wB, LY, 2);
      if (wR) W.hrect(lx1 - wR, lz0 + wT, lx1, lz1 - wB, LY, 2);
      const g = mb.get(lotMat); const [a, b, cc, d] = [lx0 + wL, lx1 - wR, lz0 + wT, lz1 - wB];
      if (b > a && d > cc) g.hrect(a, cc, b, d, LY, lotMat === 'concrete' ? 6 : 8, lotMat === 'concrete' ? [0.82, 0.8, 0.76] : null);
    } else {
      // partial: grid-sample and drop water quads; shoreline walls hide the steps
      // tiles straddling the shore are clipped exactly against the water boundary (bisection on isWater),
      // so lake/coast paving follows the true curve instead of a 2.5 m staircase.
      const step = 2.5; const W = mb.get(walkMat), g = mb.get(lotMat), sand = mb.get('rocks');
      for (let x = lx0; x < lx1 - 0.01; x += step) for (let z = lz0; z < lz1 - 0.01; z += step) {
        const x2 = Math.min(lx1, x + step), z2 = Math.min(lz1, z + step);
        const poly = clipLand([[x, z], [x2, z], [x2, z2], [x, z2]]); if (poly.length < 3) continue;
        let qx = 0, qz = 0; for (const p of poly) { qx += p[0]; qz += p[1]; } qx /= poly.length; qz /= poly.length;
        const full = poly.length === 4 && poly[0][0] === x && poly[2][0] === x2;
        const inWalk = (wT && qz < lz0 + wT) || (wB && qz > lz1 - wB) || (wL && qx < lx0 + wL) || (wR && qx > lx1 - wR);
        const promenade = c.district === 'gfgreen' && qx < L.coastX(qz) + 13;
        const shore = !promenade && L.isSea(qx - 9, qz) && qz > -240;
        const target = inWalk || promenade ? W : shore ? sand : g;
        const tc = target === g && lotMat === 'concrete' ? [0.82, 0.8, 0.76] : (target === sand ? [0.9, 0.88, 0.85] : null);
        if (full) target.hrect(x, z, x2, z2, LY, target === W ? 2 : 8, tc); else target.hpoly(poly, LY, target === W ? 2 : 8, tc);
      }
    }
    // kerbs facing roads (shortened where a corner is rounded)
    const kerb = (x0, z0, x1, z1, seg) => {
      const len = Math.hypot(x1 - x0, z1 - z0); if (len < 0.1) return;
      const striped = kerbStriped(seg, (x0 + x1) / 2, (z0 + z1) / 2);
      const n = striped ? Math.max(1, Math.round(len)) : 1;
      for (let k = 0; k < n; k++) {
        const t0 = k / n, t1 = (k + 1) / n; const ax = x0 + (x1 - x0) * t0, az = z0 + (z1 - z0) * t0, bx = x0 + (x1 - x0) * t1, bz = z0 + (z1 - z0) * t1;
        if (L.isWater((ax + bx) / 2, (az + bz) / 2)) continue;
        const col = striped ? (k % 2 ? [0.12, 0.12, 0.12] : [0.95, 0.95, 0.92]) : [0.78, 0.77, 0.74];
        K.wall(ax, az, bx, bz, RY - 0.02, LY, [0, 0, (len / n) / 2, 0.1], col);
      }
    };
    // walls oriented so the face points toward the road (CCW rules of MeshBuilder.wall)
    if (c.T) kerb(lx1 - rTR, lz0, lx0 + rTL, lz0, c.T);
    if (c.B) kerb(lx0 + rBL, lz1, lx1 - rBR, lz1, c.B);
    if (c.L) kerb(lx0, lz0 + rTL, lx0, lz1 - rBL, c.L);
    if (c.R) kerb(lx1, lz1 - rBR, lx1, lz0 + rTR, c.R);
  }
  progress && progress(0.6);

  // ---------------- shoreline: seawall + boulders, harbour quay, lake embankment, canals
  const rng = new RNG(77);
  const boulder = new THREE.IcosahedronGeometry(1, 0); const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3(), E = new THREE.Euler();
  for (let z = -1000; z < 1370; z += 3) {
    const x = L.coastX(z), x2 = L.coastX(z + 3); const mb = at(x + 10, z);
    mb.get('concrete').quad([x, -2.5, z], [x2, -2.5, z + 3], [x2, LY + 0.55, z + 3], [x, LY + 0.55, z], [0, 0, 1.5, 1.4], [0.7, 0.68, 0.64]);
    mb.get('concrete').quad([x, LY + 0.55, z], [x2, LY + 0.55, z + 3], [x2 + 0.6, LY + 0.55, z + 3], [x + 0.6, LY + 0.55, z], [0, 0, 1.5, 0.3], [0.8, 0.78, 0.74]);
    if (Math.floor(z / 3) % 1 === 0) for (let k = 0; k < 2; k++) {
      P.set(x - rng.range(0.5, 6), rng.range(-1.4, -0.2), z + rng.range(0, 3)); E.set(rng.next() * 3, rng.next() * 3, rng.next() * 3); Q.setFromEuler(E); const s = rng.range(0.9, 2.0); S.set(s, s * rng.range(0.6, 0.9), s);
      M.compose(P, Q, S); mb.get('rocks').geometry(boulder, M, [rng.range(0.75, 1), rng.range(0.72, 0.95), 0.9]);
    }
  }
  // promenade railing along Galle Face
  for (let z = -655; z < -245; z += 2.5) { const x = L.coastX(z) + 0.4; const mb = at(x + 10, z); mb.get('metal').box(x, LY + 1.05, z, 0.08, 1.0, 0.08, { col: [0.2, 0.2, 0.2] }); mb.get('metal').box(x, LY + 1.5, z + 1.25, 0.06, 0.06, 2.5, { col: [0.25, 0.25, 0.25] }); }
  // harbour quay walls
  for (let x = L.coastX(-1180); x < 230; x += 4) { const mb = at(x, -1170); mb.get('concrete').quad([x + 4, -2.5, -1180], [x, -2.5, -1180], [x, LY + 0.4, -1180], [x + 4, LY + 0.4, -1180], [0, 0, 2, 1.4], [0.6, 0.6, 0.58]); if (Math.floor(x / 4) % 5 === 0) mb.get('metal').cylinder(x, LY, -1181, 0.25, 0.2, 0.6, 8, { col: [0.15, 0.15, 0.15] }); }
  for (let z = -1300; z < -1180; z += 4) { const mb = at(235, z); mb.get('concrete').quad([230, -2.5, z], [230, -2.5, z + 4], [230, LY + 0.4, z + 4], [230, LY + 0.4, z], [0, 0, 2, 1.4], [0.6, 0.6, 0.58]); }
  // Beira Lake embankment
  for (let e = 0; e < L.LAKE.length; e++) {
    const [cx, cz, rx, rz] = L.LAKE[e]; const n = Math.ceil((Math.PI * (rx + rz)) / 3);
    for (let k = 0; k < n; k++) {
      const a0 = (k / n) * Math.PI * 2, a1 = ((k + 1) / n) * Math.PI * 2;
      const p0 = [cx + Math.cos(a0) * rx, cz + Math.sin(a0) * rz], p1 = [cx + Math.cos(a1) * rx, cz + Math.sin(a1) * rz];
      const mid = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2];
      let inside = false; for (let o = 0; o < L.LAKE.length; o++) if (o !== e) { const [ox, oz, orx, orz] = L.LAKE[o]; const dx = (mid[0] - ox) / orx, dz = (mid[1] - oz) / orz; if (dx * dx + dz * dz < 0.98) inside = true; }
      if (inside) continue;
      const mb = at(mid[0], mid[1]);
      mb.get('concrete').quad([p1[0], -1.6, p1[1]], [p0[0], -1.6, p0[1]], [p0[0], LY + 0.3, p0[1]], [p1[0], LY + 0.3, p1[1]], [0, 0, 1.5, 1], [0.74, 0.72, 0.68]);
      mb.get('concrete').quad([p0[0], -1.6, p0[1]], [p1[0], -1.6, p1[1]], [p1[0], LY + 0.3, p1[1]], [p0[0], LY + 0.3, p0[1]], [0, 0, 1.5, 1], [0.74, 0.72, 0.68]); // lake-facing side
      const ox = Math.cos((a0 + a1) / 2), oz = Math.sin((a0 + a1) / 2);
      { const cq = [[p1[0], LY + 0.3, p1[1]], [p0[0], LY + 0.3, p0[1]], [p0[0] + ox * 0.9, LY + 0.3, p0[1] + oz * 0.9], [p1[0] + ox * 0.9, LY + 0.3, p1[1] + oz * 0.9]];
        mb.get('concrete').quad(cq[0], cq[1], cq[2], cq[3], [0, 0, 1.5, 0.3], [0.82, 0.8, 0.76]); mb.get('concrete').quad(cq[3], cq[2], cq[1], cq[0], [0, 0, 1.5, 0.3], [0.82, 0.8, 0.76]);
        // coping's inner riser down to the paving so the 0.15 m step reads as a kerb
        mb.get('concrete').quad([p0[0] + ox * 0.9, LY, p0[1] + oz * 0.9], [p1[0] + ox * 0.9, LY, p1[1] + oz * 0.9], [p1[0] + ox * 0.9, LY + 0.3, p1[1] + oz * 0.9], [p0[0] + ox * 0.9, LY + 0.3, p0[1] + oz * 0.9], [0, 0, 1.5, 0.1], [0.78, 0.76, 0.72]);
        mb.get('concrete').quad([p1[0] + ox * 0.9, LY, p1[1] + oz * 0.9], [p0[0] + ox * 0.9, LY, p0[1] + oz * 0.9], [p0[0] + ox * 0.9, LY + 0.3, p0[1] + oz * 0.9], [p1[0] + ox * 0.9, LY + 0.3, p1[1] + oz * 0.9], [0, 0, 1.5, 0.1], [0.78, 0.76, 0.72]); }
      if (k % 2 === 0) mb.get('metal').box(p0[0] + ox * 0.4, LY + 0.85, p0[1] + oz * 0.4, 0.08, 1.0, 0.08, { col: [0.25, 0.27, 0.25] });
      mb.get('metal').quad([p1[0] + ox * 0.4, LY + 1.25, p1[1] + oz * 0.4], [p0[0] + ox * 0.4, LY + 1.25, p0[1] + oz * 0.4], [p0[0] + ox * 0.4, LY + 1.33, p0[1] + oz * 0.4], [p1[0] + ox * 0.4, LY + 1.33, p1[1] + oz * 0.4], [0, 0, 1, 1], [0.25, 0.27, 0.25]);
    }
  }
  // canals
  for (const cn of L.CANALS) for (let x = -520; x < 900; x += 4) {
    const mb = at(x + 2, cn.z0 - 5);
    mb.get('concrete').quad([x, -2, cn.z0], [x + 4, -2, cn.z0], [x + 4, LY + 0.2, cn.z0], [x, LY + 0.2, cn.z0], [0, 0, 2, 1], [0.62, 0.6, 0.56]);
    if (cn.z1 < 1400) mb.get('concrete').quad([x + 4, -2, cn.z1], [x, -2, cn.z1], [x, LY + 0.2, cn.z1], [x + 4, LY + 0.2, cn.z1], [0, 0, 2, 1], [0.62, 0.6, 0.56]);
  }
  progress && progress(0.8);

  // ---------------- railway: ballast, sleepers, rails
  const R = L.RAIL;
  for (let i = 0; i < R.length - 1; i++) {
    const [ax, az] = R[i], [bx, bz] = R[i + 1]; const len = Math.hypot(bx - ax, bz - az); const dx = (bx - ax) / len, dz = (bz - az) / len; const nx = -dz, nz = dx;
    for (let t = 0; t < len; t += 6) {
      const t2 = Math.min(len, t + 6); const x0 = ax + dx * t, z0 = az + dz * t, x1 = ax + dx * t2, z1 = az + dz * t2;
      const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2; if (L.isWater(mx, mz) && !L.inCanal(mz)) continue;
      const mb = at(mx, mz); const onRoad = !!L.roadAt(mx, mz);
      const by = onRoad ? RY + 0.02 : LY + 0.22;
      if (!onRoad) {
        mb.get('concrete').quad([x0 + nx * 2.2, by, z0 + nz * 2.2], [x0 - nx * 2.2, by, z0 - nz * 2.2], [x1 - nx * 2.2, by, z1 - nz * 2.2], [x1 + nx * 2.2, by, z1 + nz * 2.2], [0, 0, 2, 3], [0.42, 0.4, 0.38]);
        mb.get('concrete').quad([x0 + nx * 3.0, LY, z0 + nz * 3.0], [x0 + nx * 2.2, by, z0 + nz * 2.2], [x1 + nx * 2.2, by, z1 + nz * 2.2], [x1 + nx * 3.0, LY, z1 + nz * 3.0], [0, 0, 0.5, 3], [0.38, 0.36, 0.34]);
        mb.get('concrete').quad([x0 - nx * 2.2, by, z0 - nz * 2.2], [x0 - nx * 3.0, LY, z0 - nz * 3.0], [x1 - nx * 3.0, LY, z1 - nz * 3.0], [x1 - nx * 2.2, by, z1 - nz * 2.2], [0, 0, 0.5, 3], [0.38, 0.36, 0.34]);
        for (let s = t; s < t2; s += 0.75) { const sx = ax + dx * s, sz = az + dz * s; mb.get('concrete').box(sx, by + 0.06, sz, 0.26, 0.12, 2.5, { col: [0.55, 0.52, 0.48], rotY: Math.atan2(dx, dz) + Math.PI / 2, top: true }); }
      }
      for (const off of [-0.72, 0.72]) {
        const yy = by + (onRoad ? 0.0 : 0.16);
        mb.get('metal').quad([x0 + nx * (off - 0.04), yy + 0.1, z0 + nz * (off - 0.04)], [x0 + nx * (off + 0.04), yy + 0.1, z0 + nz * (off + 0.04)], [x1 + nx * (off + 0.04), yy + 0.1, z1 + nz * (off + 0.04)], [x1 + nx * (off - 0.04), yy + 0.1, z1 + nz * (off - 0.04)], [0, 0, 1, 1], [0.75, 0.72, 0.7]);
        mb.get('metal').quad([x0 + nx * (off + 0.04), yy, z0 + nz * (off + 0.04)], [x0 + nx * (off + 0.04), yy + 0.1, z0 + nz * (off + 0.04)], [x1 + nx * (off + 0.04), yy + 0.1, z1 + nz * (off + 0.04)], [x1 + nx * (off + 0.04), yy, z1 + nz * (off + 0.04)], [0, 0, 1, 1], [0.35, 0.3, 0.28]);
      }
    }
  }
  progress && progress(1);
  return chunks;
}

function markings(mk, s, dir, a, b, n0, n1) {
  const cx = s.x0, cz = s.z0; const len = b - a; if (len < 2) return;
  const strip = (off, t0, t1, w, col) => { // along-road strip at lateral offset
    if (dir === 'v') mk.hrect(cx + off - w / 2, a + t0, cx + off + w / 2, a + t1, RY + 0.012, 1, col);
    else mk.hrect(a + t0, cz + off - w / 2, a + t1, cz + off + w / 2, RY + 0.012, 1, col);
  };
  const across = (t, w, o0, o1, col) => { // across-road bar at position t
    if (dir === 'v') mk.hrect(cx + o0, a + t - w / 2, cx + o1, a + t + w / 2, RY + 0.012, 1, col);
    else mk.hrect(a + t - w / 2, cz + o0, a + t + w / 2, cz + o1, RY + 0.012, 1, col);
  };
  const dashed = (off, dash, gap, w, col, s0 = 0, s1 = len) => { for (let t = s0 + 1; t < s1 - dash; t += dash + gap) strip(off, t, t + dash, w, col); };
  const junction0 = n0.segs.length >= 3, junction1 = n1.segs.length >= 3;
  const cw = 3.4, gapCW = 0.8; const s0 = junction0 && s.level <= 2 ? gapCW + cw + 1.2 : 0, s1 = junction1 && s.level <= 2 ? len - (gapCW + cw + 1.2) : len;
  if (s.level === 0) {
    strip(-0.15, s0, s1, 0.12, WHITE); strip(0.15, s0, s1, 0.12, WHITE);
    dashed(-4.3, 3, 6, 0.12, WHITE, s0, s1); dashed(4.3, 3, 6, 0.12, WHITE, s0, s1);
    strip(-(s.hw - 0.4), 0, len, 0.15, WHITE); strip(s.hw - 0.4, 0, len, 0.15, WHITE);
  } else if (s.level === 1) { dashed(0, 3, 5, 0.12, WHITE, s0, s1); strip(-(s.hw - 0.35), 0, len, 0.12, YELLOW); strip(s.hw - 0.35, 0, len, 0.12, YELLOW); }
  else if (s.level === 2) dashed(0, 2, 6, 0.1, WHITE, s0, s1);
  if (s.crossing) { /* keep level crossings clear of zebra */ }
  // yellow pedestrian crossings + stop lines (left-hand traffic: approach lane is on the left of travel)
  const zebra = (t0, dirSign) => {
    const w = s.w - 0.6, n = Math.floor(w / 1.0);
    for (let k = 0; k < n; k++) { const o = -w / 2 + k * 1.0 + 0.25; if (dir === 'v') mk.hrect(cx + o, a + t0, cx + o + 0.5, a + t0 + cw, RY + 0.013, 1, YELLOW); else mk.hrect(a + t0, cz + o, a + t0 + cw, cz + o + 0.5, RY + 0.013, 1, YELLOW); }
    const stopT = dirSign > 0 ? t0 + cw + 0.9 : t0 - 0.9;
    // traffic travelling toward node0 (decreasing coordinate) is on its left: for 'v' moving north, left = west (-x). For 'h' moving west, left = south (+z).
    if (dir === 'v') across(stopT, 0.35, dirSign > 0 ? -s.hw + 0.3 : 0, dirSign > 0 ? 0 : s.hw - 0.3, WHITE);
    else across(stopT, 0.35, dirSign > 0 ? 0 : -s.hw + 0.3, dirSign > 0 ? s.hw - 0.3 : 0, WHITE);
  };
  if (junction0 && s.level <= 2 && !s.crossing) zebra(gapCW, 1);
  if (junction1 && s.level <= 2 && !s.crossing) zebra(len - gapCW - cw, -1);
}

function bridge(mb, s, dir) {
  for (const cn of L.CANALS) {
    if (!(s.z0 < cn.z1 && s.z1 > cn.z0)) continue;
    const z0 = cn.z0 - 1, z1 = cn.z1 + 1, x = s.x0;
    for (const side of [-1, 1]) {
      const xa = x + side * s.hw, xb = x + side * (s.hw + s.walk);
      mb.get('walk').hrect(Math.min(xa, xb), z0, Math.max(xa, xb), z1, LY, 2);
      mb.get('concrete').box(x + side * (s.hw + s.walk + 0.15), LY + 0.6, (z0 + z1) / 2, 0.3, 1.2, z1 - z0, { col: [0.85, 0.84, 0.8] });
      mb.get('kerb').wall(side < 0 ? xa : xa, side < 0 ? z1 : z0, xa, side < 0 ? z0 : z1, RY - 0.02, LY, [0, 0, 1, 0.1], [0.8, 0.78, 0.75]);
    }
    mb.get('concrete').box(x, -0.5, (z0 + z1) / 2, s.w + s.walk * 2 + 0.6, 1.0, z1 - z0, { col: [0.6, 0.58, 0.55], top: false, bottom: true });
  }
}
