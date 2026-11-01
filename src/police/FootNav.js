// Foot navigation for police officers: grid A* over the static collision (0.5 m cells) with vehicles as obstacles.
// Officers used to steer greedily straight at their goal and take the first free side-step, which flip-flopped from
// frame to frame against a wall (the 'police go crazy behind a compound wall' bug) and stuttered between running and
// standing in tight spots beside their own car (the 'officer looks lagged after getting out' bug).
//
// Low walls (≤ 2.05 m above the ground, thin, not a building, pole or gate) can be climbed, as the player can: such a
// crossing is an expensive straight edge in the search, executed by the officer as a vault. When the goal is truly
// unreachable (inside a building, on a roof), the plan ends at the closest reachable cell and says so (reached=false).
// No allocations of THREE objects; cells are cached per plan so each collision query runs once.

const CELL = 0.5;
const CLIMB_MAX = 2.05;
const DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.4142], [1, -1, 1.4142], [-1, 1, 1.4142], [-1, -1, 1.4142]];

// minimal binary heap keyed by f
class Heap {
  constructor() { this.a = []; }
  push(n) { const a = this.a; a.push(n); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (a[p].f <= n.f) break; a[i] = a[p]; i = p; } a[i] = n; }
  pop() { const a = this.a; const top = a[0]; const last = a.pop(); if (a.length) { let i = 0; const n = a.length; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < n && a[l].f < (m === i ? last.f : a[m].f)) m = l; if (r < n && a[r].f < (m === i ? last.f : a[m].f)) m = r; if (m === i) break; a[i] = a[m]; i = m; } a[i] = last; } return top; }
  get size() { return this.a.length; }
}

export class FootNav {
  // col: Collision; vehicles(): iterable of vehicles (x, z, yaw, half, T.wid)
  constructor(col, vehicles) { this.col = col; this.vehicles = vehicles; this.stats = { plans: 0, direct: 0, expanded: 0, vaults: 0, unreachable: 0, ms: 0 }; this.maxExpand = 3000; }

  // ---- obstacles
  nearCars(x0, z0, x1, z1) { const out = []; for (const v of this.vehicles()) { if (!v || v.isTrain || !v.T) continue; const r = (v.half || v.T.len / 2) + 1; if (v.x + r < x0 || v.x - r > x1 || v.z + r < z0 || v.z - r > z1) continue; out.push(v); } return out; }
  inCar(cars, x, z, pad = 0.25) { for (const v of cars) { const fx = Math.sin(v.yaw), fz = Math.cos(v.yaw), rx = x - v.x, rz = z - v.z; if (Math.abs(rx * fx + rz * fz) < (v.half || v.T.len / 2) + pad && Math.abs(rx * fz - rz * fx) < (v.T.wid || 1.7) / 2 + pad) return true; } return false; }
  // 0 free · 1 climbable low wall · 2 blocked
  cellKind(x, z, cars) {
    if (this.inCar(cars, x, z)) return 2;
    if (!this.col.blocked(x, z, 0.28)) return 0;
    const g = this.col.groundAt(x, z, 0.3, 0.3); let any = false;
    for (const c of this.col.query(x - 0.3, z - 0.3, x + 0.3, z + 0.3)) {
      if (c.h < 0.5 || c.walkUnder || c.kind === 'deck' || c.kind === 'platform') continue;
      if (x + 0.28 <= c.x0 || x - 0.28 >= c.x1 || z + 0.28 <= c.z0 || z - 0.28 >= c.z1) continue; any = true;
      const top = (c.y0 || 0) + c.h - g, thin = Math.min(c.x1 - c.x0, c.z1 - c.z0) <= 0.7;
      if (c.kind === 'building' || c.kind === 'pole' || c.kind === 'tree' || top > CLIMB_MAX || !thin) return 2;
    }
    return any ? 1 : 2; // blocked by water etc. → not climbable
  }
  wallTop(x, z) { let t = 0; for (const c of this.col.query(x - 0.3, z - 0.3, x + 0.3, z + 0.3)) { if (x + 0.3 <= c.x0 || x - 0.3 >= c.x1 || z + 0.3 <= c.z0 || z - 0.3 >= c.z1) continue; t = Math.max(t, (c.y0 || 0) + c.h); } return t; }

  // straight walk between two points is clear of walls and cars (sampled every 0.3 m)
  lineClear(ax, az, bx, bz, cars) {
    const d = Math.hypot(bx - ax, bz - az); const n = Math.max(1, Math.ceil(d / 0.3));
    for (let i = 1; i <= n; i++) { const t = i / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t; if (this.col.blocked(x, z, 0.26) || (cars && this.inCar(cars, x, z, 0.2))) return false; }
    return true;
  }

  // plan from (sx,sz) to (gx,gz). Returns { pts:[{x,z,vault?:{x,z,top}}], reached, ex, ez }
  plan(sx, sz, gx, gz) {
    const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now()); this.stats.plans++;
    const M = 14; let x0 = Math.min(sx, gx) - M, x1 = Math.max(sx, gx) + M, z0 = Math.min(sz, gz) - M, z1 = Math.max(sz, gz) + M;
    const CAP = 90; if (x1 - x0 > CAP) { const c = (sx + gx) / 2; x0 = c - CAP / 2; x1 = c + CAP / 2; } if (z1 - z0 > CAP) { const c = (sz + gz) / 2; z0 = c - CAP / 2; z1 = c + CAP / 2; }
    const W = Math.ceil((x1 - x0) / CELL), H = Math.ceil((z1 - z0) / CELL); const cars = this.nearCars(x0, z0, x1, z1);
    const kind = new Int8Array(W * H).fill(-1); const K = (i, j) => { const k = j * W + i; if (kind[k] < 0) kind[k] = this.cellKind(x0 + (i + 0.5) * CELL, z0 + (j + 0.5) * CELL, cars); return kind[k]; };
    const ci = (x) => Math.max(0, Math.min(W - 1, Math.floor((x - x0) / CELL))), cj = (z) => Math.max(0, Math.min(H - 1, Math.floor((z - z0) / CELL)));
    let si = ci(sx), sj = cj(sz); const gi = ci(gx), gj = cj(gz);
    if (K(si, sj) !== 0) { // starting inside a padded footprint (door spot beside the car): nearest free cell
      let found = false; for (let r = 1; r <= 4 && !found; r++) for (let dj = -r; dj <= r && !found; dj++) for (let di = -r; di <= r; di++) { if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue; const i = si + di, j = sj + dj; if (i < 0 || j < 0 || i >= W || j >= H) continue; if (K(i, j) === 0) { si = i; sj = j; found = true; break; } }
    }
    const h = (i, j) => { const dx = Math.abs(i - gi), dz = Math.abs(j - gj); return (Math.max(dx, dz) + 0.4142 * Math.min(dx, dz)); };
    const g = new Float32Array(W * H).fill(Infinity), from = new Int32Array(W * H).fill(-1), vault = new Uint8Array(W * H); const closed = new Uint8Array(W * H);
    const open = new Heap(); const s0 = sj * W + si; g[s0] = 0; open.push({ k: s0, f: h(si, sj) }); let best = s0, bh = h(si, sj), n = 0, goalK = -1;
    while (open.size && n < this.maxExpand) {
      const cur = open.pop(); const k = cur.k; if (closed[k]) continue; closed[k] = 1; n++;
      const i = k % W, j = (k / W) | 0; const hh = h(i, j); if (hh < bh) { bh = hh; best = k; } if (i === gi && j === gj) { goalK = k; break; }
      for (const [di, dj, c] of DIRS) {
        const ni = i + di, nj = j + dj; if (ni < 0 || nj < 0 || ni >= W || nj >= H) continue; const nk = K(ni, nj);
        if (nk === 0) { if (di && dj && (K(i + di, j) !== 0 || K(i, j + dj) !== 0)) continue; /* no corner cutting */ const q = nj * W + ni, ng = g[k] + c; if (ng < g[q]) { g[q] = ng; from[q] = k; vault[q] = 0; open.push({ k: q, f: ng + h(ni, nj) }); } continue; }
        if (nk !== 1 || (di && dj)) continue;
        // climb: straight across ≤ 4 cells of low wall to the first free cell beyond
        for (let s = 2; s <= 5; s++) { const vi = i + di * s, vj = j + dj * s; if (vi < 0 || vj < 0 || vi >= W || vj >= H) break; const vk = K(vi, vj); if (vk === 2) break; if (vk === 0) { const q = vj * W + vi, ng = g[k] + s + 9; if (ng < g[q]) { g[q] = ng; from[q] = k; vault[q] = 1; open.push({ k: q, f: ng + h(vi, vj) }); } break; } }
      }
    }
    this.stats.expanded += n; const end = goalK >= 0 ? goalK : best; const reached = goalK >= 0; if (!reached) this.stats.unreachable++;
    const cells = []; for (let k = end; k >= 0; k = from[k]) cells.push(k); cells.reverse();
    const pts = []; for (let a = 0; a < cells.length; a++) { const k = cells[a]; const x = x0 + ((k % W) + 0.5) * CELL, z = z0 + (((k / W) | 0) + 0.5) * CELL; if (vault[k] && pts.length) { const p = pts[pts.length - 1]; const mx = (p.x + x) / 2, mz = (p.z + z) / 2; p.vault = { x, z, top: this.wallTop(mx, mz) }; this.stats.vaults++; } pts.push({ x, z }); }
    if (reached && pts.length) { pts[pts.length - 1] = { x: gx, z: gz }; }
    // string-pull: drop waypoints that a straight walk can skip (never across a climb)
    const out = []; let a = 0; while (a < pts.length) { out.push(pts[a]); if (pts[a].vault) { a++; continue; } let b = a + 1; while (b + 1 < pts.length && !pts[b].vault && this.lineClear(pts[a].x, pts[a].z, pts[b + 1].x, pts[b + 1].z, cars)) b++; a = b; }
    this.stats.ms += (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
    const e = out[out.length - 1] || { x: sx, z: sz };
    return { pts: out, reached, ex: e.x, ez: e.z, gx, gz };
  }
}
