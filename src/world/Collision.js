// Static collision: AABB colliders (buildings, walls, poles, landmarks) in a 10 m spatial hash.
// Walkable tops ('deck', 'platform', low colliders) raise the ground; water blocks walkers.
import * as L from './Layout.js';

const CELL = 10;
const SURFACE = new Set(['deck', 'platform']);
export class Collision {
  constructor() { this.grid = new Map(); this.list = []; this.dynamic = []; this._q = []; this._stamp = 0; }
  key(i, j) { return i * 100003 + j; }
  add(c) {
    c._s = 0; this.list.push(c);
    const i0 = Math.floor(c.x0 / CELL), i1 = Math.floor(c.x1 / CELL), j0 = Math.floor(c.z0 / CELL), j1 = Math.floor(c.z1 / CELL);
    if ((i1 - i0 + 1) * (j1 - j0 + 1) > 4000) { (this.big || (this.big = [])).push(c); return; }
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const k = this.key(i, j); let a = this.grid.get(k); if (!a) this.grid.set(k, (a = [])); a.push(c); }
  }
  addAll(arr) { for (const c of arr) this.add(c); }
  remove(pred) { // rebuild without matching colliders
    const keep = this.list.filter((c) => !pred(c)); this.grid.clear(); this.list = []; this.big = []; for (const c of keep) this.add(c);
  }
  query(x0, z0, x1, z1) {
    const out = this._q; out.length = 0; const st = ++this._stamp;
    const i0 = Math.floor(x0 / CELL), i1 = Math.floor(x1 / CELL), j0 = Math.floor(z0 / CELL), j1 = Math.floor(z1 / CELL);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const a = this.grid.get(this.key(i, j)); if (a) for (const c of a) if (c._s !== st) { c._s = st; out.push(c); } }
    if (this.big) for (const c of this.big) if (c.x1 > x0 && c.x0 < x1 && c.z1 > z0 && c.z0 < z1) out.push(c);
    return out;
  }
  // Height of walkable ground at (x,z) for something whose feet are at y (decks above feet+step are ignored).
  // faces: the raised copings along the seawall / lake are part of the terrain height, so by default they count as floor
  // wherever x,z falls on them; with faces = true a coping top out of reach from y (more than `step` above) is a face, and
  // the ground there is the land at its foot (ragdoll joints swung against the seawall stay beside it, not snapped on top)
  groundAt(x, z, y = 0, step = 0.6, faces = false) {
    let g = L.surfaceY(x, z); // terrain or the paving laid on it
    if (faces && g > y + step) { const cp = L.copingAt(x, z); if (cp !== null && g === cp) g = L.LAND_Y; }
    for (const c of this.query(x, z, x, z)) {
      if (x < c.x0 || x > c.x1 || z < c.z0 || z > c.z1) continue;
      if (SURFACE.has(c.kind) || c.h <= step + 0.05) { const top = c.y0 !== undefined ? c.y0 + c.h : c.h; if (top <= y + step && top > g) g = top; }
    }
    return g;
  }
  walkableWater(x, z, y) { // water (and the railings along it) blocks unless a deck/bridge is underfoot
    if (!L.isWater(x, z)) { if (!L.beyondRailing(x, z)) return true; for (const c of this.query(x, z, x, z)) if (SURFACE.has(c.kind) && x >= c.x0 && x <= c.x1 && z >= c.z0 && z <= c.z1) return true; return false; }
    if (L.bridgeWalkAt(x, z)) return true;
    for (const c of this.query(x, z, x, z)) if (SURFACE.has(c.kind) && x >= c.x0 && x <= c.x1 && z >= c.z0 && z <= c.z1) return true;
    return false;
  }
  // Push a circle (feet height y) out of solid colliders. Returns {x,z,hit}.
  resolveCircle(x, z, r, y = 0, step = 0.45, height = 1.8, opts = {}) {
    let hit = false;
    for (let it = 0; it < 3; it++) {
      let moved = false;
      for (const c of this.query(x - r, z - r, x + r, z + r)) {
        if (SURFACE.has(c.kind)) continue;
        const base = c.y0 || 0, top = base + c.h;
        if (top <= y + step) continue; // can step onto / over it
        if (base > y + height) continue; // overhead (shelter roofs etc.)
        if (c.walkUnder && !opts.vehicle) continue;
        const px = Math.max(c.x0, Math.min(x, c.x1)), pz = Math.max(c.z0, Math.min(z, c.z1));
        let dx = x - px, dz = z - pz; const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        if (c.front && x > c.x0 - r && x < c.x1 + r && z > c.z0 - r && z < c.z1 + r && ((x - (c.x0 + c.x1) / 2) * c.front[0] + (z - (c.z0 + c.z1) / 2) * c.front[1] > -0.05 || d2 < 1e-8)) {
          // a bench: whoever is in it (sitting, getting up) steps out by the seat front, never through the backrest
          const fx = c.front[0], fz = c.front[1]; const tx = fx > 1e-6 ? (c.x1 + r - x) / fx : fx < -1e-6 ? (c.x0 - r - x) / fx : Infinity, tz = fz > 1e-6 ? (c.z1 + r - z) / fz : fz < -1e-6 ? (c.z0 - r - z) / fz : Infinity;
          const t = Math.min(tx, tz) + 0.001; if (t > 0 && t < 2) { x += fx * t; z += fz * t; hit = moved = true; continue; }
        }
        if (d2 < 1e-8) { // centre inside box: push out the shortest way
          // the nearest side can be a seam shared with the next building of a terrace row: pushing out there lands inside the
          // neighbour, which pushes straight back (people ended up walking inside a block of shops). Take the nearest side
          // that leads into the open; if every side is shut in, the nearest one as before.
          const sides = [[x - c.x0, c.x0 - r, z], [c.x1 - x, c.x1 + r, z], [z - c.z0, x, c.z0 - r], [c.z1 - z, x, c.z1 + r]].sort((a, b) => a[0] - b[0]);
          const pick = sides.find((sd) => !this.solidAt(sd[1], sd[2], c, y, step, height, opts)) || sides[0]; x = pick[1]; z = pick[2];
        } else { const d = Math.sqrt(d2); x = px + (dx / d) * r; z = pz + (dz / d) * r; }
        hit = moved = true;
      }
      if (!moved) break;
    }
    // world bounds
    const B = L.BOUNDS; const nx = Math.max(B.minX + 2, Math.min(B.maxX - 2, x)), nz = Math.max(B.minZ + 2, Math.min(B.maxZ - 2, z));
    if (nx !== x || nz !== z) hit = true;
    return { x: nx, z: nz, hit };
  }
  // first entry of the segment a→b (plan view) into a box that resolveCircle treats as solid at height y: fraction t in [0,1]
  // (1 = no entry; on a hit, this.sweepHit holds the entered face's outward normal and plane). Boxes that already contain a are skipped (that is resolveCircle's job). Ragdoll joints use it so a
  // limb can never pass through a thin compound wall and come out on the far side.
  sweepSolid(ax, az, bx, bz, y = 0, step = 0.45, height = 1.8) {
    let best = 1; const dx = bx - ax, dz = bz - az; if (dx * dx + dz * dz < 1e-10) return 1; const hit = this.sweepHit || (this.sweepHit = { nx: 0, nz: 0, face: 0, axis: 0 });
    for (const c of this.query(Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz))) {
      if (SURFACE.has(c.kind) || !(c.h > 0) || c.walkUnder) continue; const base = c.y0 || 0; if (base + c.h <= y + step || base > y + height) continue;
      if (ax > c.x0 && ax < c.x1 && az > c.z0 && az < c.z1) continue;
      let t0 = 0, t1 = best, ax0 = -1;
      if (Math.abs(dx) < 1e-9) { if (ax <= c.x0 || ax >= c.x1) continue; } else { let ta = (c.x0 - ax) / dx, tb = (c.x1 - ax) / dx; if (ta > tb) { const q = ta; ta = tb; tb = q; } if (ta > t0) { t0 = ta; ax0 = 0; } t1 = Math.min(t1, tb); }
      if (Math.abs(dz) < 1e-9) { if (az <= c.z0 || az >= c.z1) continue; } else { let ta = (c.z0 - az) / dz, tb = (c.z1 - az) / dz; if (ta > tb) { const q = ta; ta = tb; tb = q; } if (ta > t0) { t0 = ta; ax0 = 1; } t1 = Math.min(t1, tb); }
      if (t0 < t1 && t0 < best) { best = t0; // the face entered: its outward normal (towards a) and its plane coordinate
        if (ax0 === 0) { hit.axis = 0; hit.nx = dx > 0 ? -1 : 1; hit.nz = 0; hit.face = dx > 0 ? c.x0 : c.x1; } else { hit.axis = 1; hit.nx = 0; hit.nz = dz > 0 ? -1 : 1; hit.face = dz > 0 ? c.z0 : c.z1; } }
    }
    return this.sweepCoping(ax, az, dx, dz, y, step, best, hit);
  }
  // the seawall / lake copings are terrain height, not boxes: a segment starting off one that runs into a coping top more
  // than `step` above y meets its face (marched in 10 cm steps, the crossing bisected; the normal points to the open side)
  sweepCoping(ax, az, dx, dz, y, step, best, hit) {
    const cop = (x, z) => { const c = L.copingAt(x, z); return c !== null && c > y + step && L.surfaceY(x, z) === c; };
    if (cop(ax, az)) return best; const len = Math.hypot(dx, dz), n = Math.max(1, Math.ceil(len * best / 0.1)); let t0 = 0;
    for (let i = 1; i <= n; i++) { const t = best * i / n; if (!cop(ax + dx * t, az + dz * t)) { t0 = t; continue; }
      let lo = t0, hi = t; for (let k = 0; k < 6; k++) { const m = (lo + hi) * 0.5; if (cop(ax + dx * m, az + dz * m)) hi = m; else lo = m; }
      const px = ax + dx * lo, pz = az + dz * lo; let nx = 0, nz = 0; for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4, cx = Math.cos(a), cz = Math.sin(a); if (!cop(px + cx * 0.08, pz + cz * 0.08)) { nx += cx; nz += cz; } }
      const nl = Math.hypot(nx, nz); if (nl < 1e-6) { nx = -dx / len; nz = -dz / len; } else { nx /= nl; nz /= nl; }
      hit.axis = 2; hit.nx = nx; hit.nz = nz; hit.px = px; hit.pz = pz; hit.face = 0; return lo; }
    return best;
  }
  // is (x, z) inside another box that resolveCircle treats as solid at this height (used to pick a clear way out)
  solidAt(x, z, except, y = 0, step = 0.45, height = 1.8, opts = {}) {
    for (const c of this.query(x - 0.01, z - 0.01, x + 0.01, z + 0.01)) { if (c === except || SURFACE.has(c.kind)) continue; const base = c.y0 || 0; if (base + c.h <= y + step || base > y + height || (c.walkUnder && !opts.vehicle)) continue; if (x > c.x0 && x < c.x1 && z > c.z0 && z < c.z1) return true; }
    return false;
  }
  // Segment vs boxes (3D, boxes from y0 to y0+h). Returns fraction t in [0,1] of the first hit, or 1.
  raycast(ax, ay, az, bx, by, bz, pad = 0.2, all = false, minH = 2.2) {
    let best = 1; const dx = bx - ax, dy = by - ay, dz = bz - az;
    for (const c of this.query(Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz))) {
      if (!all && c.h < minH && c.kind !== 'landmark') continue; // ignore small things (bullets pass all=true; the camera passes a lower minH so it also stops at compound walls)
      if (c.h <= 0) continue; // disabled (open gates, raised booms)
      const base = c.y0 || 0;
      let t0 = 0, t1 = best;
      const slab = (o, d, mn, mx) => { if (Math.abs(d) < 1e-9) return o >= mn && o <= mx; let ta = (mn - o) / d, tb = (mx - o) / d; if (ta > tb) [ta, tb] = [tb, ta]; t0 = Math.max(t0, ta); t1 = Math.min(t1, tb); return t0 <= t1; };
      if (slab(ax, dx, c.x0 - pad, c.x1 + pad) && slab(az, dz, c.z0 - pad, c.z1 + pad) && slab(ay, dy, base - pad, base + c.h + pad)) best = Math.min(best, t0);
    }
    return best;
  }
  // Point inside any solid collider (used for spawn validation)
  blocked(x, z, r = 0.5) {
    if (L.isWater(x, z) && !this.walkableWater(x, z, 0)) return true;
    for (const c of this.query(x - r, z - r, x + r, z + r)) { if (SURFACE.has(c.kind) || c.h < 0.5 || c.walkUnder) continue; if (x + r > c.x0 && x - r < c.x1 && z + r > c.z0 && z - r < c.z1) return true; }
    return false;
  }
}
