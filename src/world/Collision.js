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
  groundAt(x, z, y = 0, step = 0.6) {
    let g = L.groundY(x, z);
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
        if (d2 < 1e-8) { // centre inside box: push out the shortest way
          const l = x - c.x0, rr = c.x1 - x, t = z - c.z0, b = c.z1 - z; const m = Math.min(l, rr, t, b);
          if (m === l) x = c.x0 - r; else if (m === rr) x = c.x1 + r; else if (m === t) z = c.z0 - r; else z = c.z1 + r;
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
