// 65th request — baked lighting for the stationary city: sky-light occlusion of the building shells, precomputed once when
// the city is generated (no runtime cost: it is written into the shells' vertex colours, which every building material
// already multiplies in).
//
// The sun in this game moves with the clock, so its direct light cannot be baked into lightmaps the way a fixed-sun engine
// would; it stays real-time (crisp near map round the player + the cached far map). What IS static is how much of the sky
// each wall sees: the bottom of a facade in a narrow lane or in a street of tall blocks receives far less skylight / bounce
// than an open seafront or the top floors. That is computed here from the city plan as a 2.5-D height field: from each
// wall vertex, rays fan out over the half space in front of the wall; along each the highest obstruction angle of the
// surrounding buildings is found, and the visible fraction of the sky (∑ (1 − sin θmax) · cos φ / ∑ cos φ) darkens the
// vertex by at most BAKE.strength (k = 1 − strength · (1 − sky)^1.5). Wall quads interpolate it between their corners, so a lane wall shades smoothly from
// its foot to its eaves. Roofs, glass, AO decals and everything that moves are untouched.
export const BAKE = { enabled: true, strength: 0.28, cell: 2, dirs: [-1.31, -0.87, -0.44, 0, 0.44, 0.87, 1.31], steps: [0.7, 1.4, 2.3, 3.5, 5, 7, 10, 14, 19, 26, 36, 50] };
export const BAKE_STATS = { verts: 0, walls: 0, ms: 0, minK: 1, avgK: 0 };

export class SkyBake {
  // buildings: the city plan's ({ x0, x1, z0, z1, h, tower? { inset }, totalH }), groundY, bounds { minX, maxX, minZ, maxZ }
  constructor(buildings, groundY, bounds, cell = BAKE.cell) {
    this.c = cell; this.gy = groundY; this.x0 = bounds.minX - 60; this.z0 = bounds.minZ - 60;
    this.nx = Math.ceil((bounds.maxX + 60 - this.x0) / cell); this.nz = Math.ceil((bounds.maxZ + 60 - this.z0) / cell);
    this.H = new Float32Array(this.nx * this.nz).fill(groundY);
    const fill = (x0, x1, z0, z1, top) => { // cells whose centre lies inside the footprint
      const i0 = Math.max(0, Math.ceil((x0 - this.x0) / cell - 0.5)), i1 = Math.min(this.nx - 1, Math.floor((x1 - this.x0) / cell - 0.5));
      const k0 = Math.max(0, Math.ceil((z0 - this.z0) / cell - 0.5)), k1 = Math.min(this.nz - 1, Math.floor((z1 - this.z0) / cell - 0.5));
      for (let k = k0; k <= k1; k++) for (let i = i0; i <= i1; i++) { const o = k * this.nx + i; if (top > this.H[o]) this.H[o] = top; } };
    for (const b of buildings) { if (!(b.h > 0)) continue; fill(b.x0, b.x1, b.z0, b.z1, groundY + b.h);
      if (b.tower && b.totalH > b.h) { const t = b.tower.inset || 0; fill(b.x0 + t, b.x1 - t, b.z0 + t, b.z1 - t, groundY + b.totalH); } }
  }
  h(x, z) { const i = Math.floor((x - this.x0) / this.c), k = Math.floor((z - this.z0) / this.c); if (i < 0 || k < 0 || i >= this.nx || k >= this.nz) return this.gy; return this.H[k * this.nx + i]; }
  // visible sky fraction (0…1) for a vertical wall point (x, y, z) facing (nx, nz) (unit, horizontal)
  wallSky(x, y, z, nx, nz) {
    const D = BAKE.dirs, S = BAKE.steps; let sum = 0, wsum = 0; const px = x + nx * 0.25, pz = z + nz * 0.25;
    for (let j = 0; j < D.length; j++) { const a = D[j], c = Math.cos(a), s = Math.sin(a); const dx = nx * c - nz * s, dz = nz * c + nx * s; let tmax = 0;
      for (let q = 0; q < S.length; q++) { const d = S[q]; const dh = this.h(px + dx * d, pz + dz * d) - y; if (dh > 0) { const t = dh / Math.hypot(dh, d); if (t > tmax) tmax = t; } }
      sum += (1 - tmax) * c; wsum += c; }
    return wsum > 0 ? sum / wsum : 1;
  }
  // darken the wall vertices of a MultiBuilder (building shells) by their sky occlusion; skip: builder keys left alone
  apply(mb, skip = SKIP) {
    if (!BAKE.enabled) return; const t0 = performance.now(), st = BAKE.strength; let n = 0, ksum = 0;
    for (const [key, b] of mb.b) { if (skip(key)) continue; const P = b.pos, N = b.nor, C = b.col; const nv = P.length / 3;
      for (let i = 0; i < nv; i++) { const ny = N[i * 3 + 1]; if (ny > 0.5 || ny < -0.5) continue; const hx = N[i * 3], hz = N[i * 3 + 2], l = Math.hypot(hx, hz); if (l < 0.3) continue;
        const k = 1 - st * (1 - this.wallSky(P[i * 3], P[i * 3 + 1], P[i * 3 + 2], hx / l, hz / l)) ** 1.5; /* open streets barely change; lanes / street floors darken */ C[i * 3] *= k; C[i * 3 + 1] *= k; C[i * 3 + 2] *= k; n++; ksum += k; if (k < BAKE_STATS.minK) BAKE_STATS.minK = k; } }
    const S = BAKE_STATS; S.avgK = (S.avgK * S.verts + ksum) / Math.max(1, S.verts + n); S.verts += n; S.walls++; S.ms += performance.now() - t0;
  }
}
// AO decals (their alpha is the shading), glass, emissive / lit parts: never darkened
const SKIP_RE = /(^|\.)(ao|glass|emissive|lampHead|pool|winGlass|neon|lit)(@|$)/;
function SKIP(key) { return SKIP_RE.test(key) || key.includes('glass'); } // (glass facades are metallic: their colour is their reflection)
