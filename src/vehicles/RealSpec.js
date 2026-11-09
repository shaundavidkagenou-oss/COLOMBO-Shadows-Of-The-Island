// Door spec of a real-car body (tools/cars/build.mjs samples it from the model's door skin; RealModels.js rebuilds it at load):
// the outer skin as a height field |x|(z, y) on a 1 cm grid plus the belt / glass lines per z column. Shared by the offline
// converter and the game so the grasp targets (VehicleModels doorGrab / handleBar) are computed from identical numbers.
// skin |x| at (z, y): bilinear over the filled cells, the nearest filled cell when outside the panel
export function sampleXS(xs, z0, y0, nz, ny, step, z, y) {
  const fz = Math.max(0, Math.min(nz - 1, (z - z0) / step)), fy = Math.max(0, Math.min(ny - 1, (y - y0) / step)); const iz = Math.min(nz - 2, Math.floor(fz)), iy = Math.min(ny - 2, Math.floor(fy)); const tz = fz - iz, ty = fy - iy;
  let s = 0, w = 0; const k00 = (1 - tz) * (1 - ty), k10 = tz * (1 - ty), k01 = (1 - tz) * ty, k11 = tz * ty;
  let v = xs[iy * nz + iz]; if (v > 0) { s += v * k00; w += k00; } v = xs[iy * nz + iz + 1]; if (v > 0) { s += v * k10; w += k10; }
  v = xs[(iy + 1) * nz + iz]; if (v > 0) { s += v * k01; w += k01; } v = xs[(iy + 1) * nz + iz + 1]; if (v > 0) { s += v * k11; w += k11; }
  if (w > 0) return s / w;
  let best = 0, bd = 1e9; const cz = Math.round(fz), cy = Math.round(fy);
  for (let r = 1; r < 40 && !best; r++) for (let dy = -r; dy <= r; dy++) for (let dz = -r; dz <= r; dz++) { const a = cz + dz, b = cy + dy; if (a < 0 || b < 0 || a >= nz || b >= ny) continue; const q = xs[b * nz + a]; if (q > 0 && dz * dz + dy * dy < bd) { bd = dz * dz + dy * dy; best = q; } }
  return best;
}
// per-z-column line (belt top, glass bottom / top), linear between columns
export function sampleCol(arr, z0, n, step, z) { const f = Math.max(0, Math.min(n - 1, (z - z0) / step)); const i = Math.min(n - 2, Math.floor(f)), t = f - i; return arr[i] * (1 - t) + arr[i + 1] * t; }
// the spec object doorGrab / handleBar read (−x orientation: outside = −x, as for the procedural doors)
export function realDoorSpec(sp) {
  const xs = Float32Array.from(sp.xs, (v) => v / 1000); const { z0, y0, nz, ny, step } = sp;
  const col = (a) => (a ? (z) => sampleCol(a, z0, nz, step, z) : null);
  return { real: true, zR: sp.zR, zF: sp.zF, by: sp.by, xc: sp.xc, gw0: sp.gw0, gw1: sp.gw1, winR: sp.winR ?? null, rects: sp.rects,
    skinPt: (z, y) => [-sampleXS(xs, z0, y0, nz, ny, step, z, y), y, z], topAt: col(sp.topA), glY: col(sp.glY), roofY: col(sp.roofY) };
}
