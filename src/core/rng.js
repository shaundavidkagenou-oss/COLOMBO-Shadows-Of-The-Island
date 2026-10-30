// Deterministic random helpers (mulberry32) so the city is identical on every run.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function hash2(x, y, s = 0) {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export class RNG {
  constructor(seed = 1) { this.r = mulberry32(seed); }
  next() { return this.r(); }
  range(a, b) { return a + (b - a) * this.r(); }
  int(a, b) { return Math.floor(a + (b - a + 1) * this.r()); }
  pick(arr) { return arr[Math.floor(this.r() * arr.length)]; }
  chance(p) { return this.r() < p; }
  weighted(items) { // [[item, weight], ...]
    let t = 0; for (const [, w] of items) t += w;
    let v = this.r() * t;
    for (const [it, w] of items) { if ((v -= w) <= 0) return it; }
    return items[items.length - 1][0];
  }
}
