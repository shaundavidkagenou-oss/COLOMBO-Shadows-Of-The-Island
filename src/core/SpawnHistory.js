// 96th: local spawn memory for crowd / traffic variety. "Was this look (or model) put down near here a moment ago?" —
// answered from a coarse grid of cells, each holding a tiny ring of the last few spawns (signature + time), so a spawn
// checks the 3×3 cells around it and never scans every NPC / vehicle in the city. Bounded in every direction: RING
// entries a cell, entries expire after `ttl` seconds, and at most MAX_CELLS cells (the stalest are dropped, so driving
// across the whole map leaves no trail). No objects are kept alive: only strings and numbers.
export class SpawnHistory {
  constructor({ cell = 40, ring = 8, ttl = 120, maxCells = 256 } = {}) { this.cell = cell; this.ring = ring; this.ttl = ttl; this.maxCells = maxCells; this.cells = new Map(); this.checks = 0; }
  key(i, j) { return i * 65536 + j; }
  // remember a spawn of `sig` at (x, z), time t (seconds)
  add(x, z, sig, t) {
    const i = Math.floor(x / this.cell), j = Math.floor(z / this.cell), k = this.key(i, j); let c = this.cells.get(k);
    if (!c) { if (this.cells.size >= this.maxCells) this.prune(t, true); c = { s: new Array(this.ring).fill(null), t: new Float64Array(this.ring).fill(-1e9), n: 0, last: t }; this.cells.set(k, c); }
    c.s[c.n % this.ring] = sig; c.t[c.n % this.ring] = t; c.n++; c.last = t;
  }
  // was `sig` spawned within roughly `r` metres (the cells overlapping that radius) in the last ttl seconds?
  has(x, z, sig, t, r = this.cell) {
    this.checks++; const C = this.cell, i0 = Math.floor((x - r) / C), i1 = Math.floor((x + r) / C), j0 = Math.floor((z - r) / C), j1 = Math.floor((z + r) / C);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const c = this.cells.get(this.key(i, j)); if (!c) continue;
      for (let q = 0; q < this.ring; q++) if (c.s[q] === sig && t - c.t[q] < this.ttl) return true; }
    return false;
  }
  // drop expired cells (and, when full, the stalest quarter)
  prune(t, force = false) {
    for (const [k, c] of this.cells) if (t - c.last > this.ttl) this.cells.delete(k);
    if (force && this.cells.size >= this.maxCells) { const a = [...this.cells].sort((p, q) => p[1].last - q[1].last); for (let n = 0; n < a.length / 4; n++) this.cells.delete(a[n][0]); }
  }
  clear() { this.cells.clear(); }
  get size() { return this.cells.size; }
}

// A coarse live-object grid rebuilt in one pass (call fill() once a frame with whatever moves): "who is within ~r m of
// here" for spawn decisions looks at a few cells only. Arrays are reused frame to frame (no per-frame garbage).
export class CoarseGrid {
  constructor(cell = 32) { this.cell = cell; this.m = new Map(); this.frame = 0; }
  fill(list) { const m = this.m; if (++this.frame % 600 === 0) m.clear(); else for (const a of m.values()) a.length = 0;
    for (const o of list) { const k = Math.floor(o.x / this.cell) * 65536 + Math.floor(o.z / this.cell); let a = m.get(k); if (!a) m.set(k, (a = [])); a.push(o); } }
  add(o) { const k = Math.floor(o.x / this.cell) * 65536 + Math.floor(o.z / this.cell); let a = this.m.get(k); if (!a) this.m.set(k, (a = [])); a.push(o); }
  // first object within r of (x, z) that passes test (or null)
  find(x, z, r, test) { const C = this.cell, i0 = Math.floor((x - r) / C), i1 = Math.floor((x + r) / C), j0 = Math.floor((z - r) / C), j1 = Math.floor((z + r) / C), r2 = r * r;
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const a = this.m.get(i * 65536 + j); if (!a) continue; for (const o of a) if ((o.x - x) ** 2 + (o.z - z) ** 2 < r2 && test(o)) return o; }
    return null; }
  each(x, z, r, fn) { const C = this.cell, i0 = Math.floor((x - r) / C), i1 = Math.floor((x + r) / C), j0 = Math.floor((z - r) / C), j1 = Math.floor((z + r) / C), r2 = r * r;
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const a = this.m.get(i * 65536 + j); if (!a) continue; for (const o of a) if ((o.x - x) ** 2 + (o.z - z) ** 2 < r2) fn(o); } }
}
