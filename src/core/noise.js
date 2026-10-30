// Small value-noise / fbm toolkit used for procedural textures.
import { hash2 } from './rng.js';
function smooth(t) { return t * t * (3 - 2 * t); }
export function vnoise(x, y, seed = 0, period = 0) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const P = (a) => (period ? ((a % period) + period) % period : a);
  const a = hash2(P(xi), P(yi), seed), b = hash2(P(xi + 1), P(yi), seed);
  const c = hash2(P(xi), P(yi + 1), seed), d = hash2(P(xi + 1), P(yi + 1), seed);
  const u = smooth(xf), v = smooth(yf);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x, y, oct = 4, seed = 0, period = 0) {
  let s = 0, amp = 0.5, f = 1, norm = 0;
  for (let i = 0; i < oct; i++) {
    s += amp * vnoise(x * f, y * f, seed + i * 17, period ? period * f : 0);
    norm += amp; amp *= 0.5; f *= 2;
  }
  return s / norm;
}
