// 65th request — occlusion culling: anything standing fully behind the city's buildings is skipped by the renderer.
//
// three.js has no occlusion culling of its own (it only frustum-culls), and the GPU hardware occlusion queries it could use
// cost a draw call each and answer a frame late. The city is 2.5-D — every building is a solid box standing on flat ground —
// which allows an exact, cheap test on the CPU: an "occlusion horizon" (Downs, Möller & Séquin 2001, "Occlusion horizons for
// driving through urban scenery").
//
//  · BAKE (once, when the city is generated — and again only if the map editor changes it): every building of the city plan
//    becomes occluder pieces (its footprint cut into pieces at most OCC_CFG.piece m long, so a long terrace row still hides
//    what is close behind its near end) and a target box (footprint + margin, up to its roof + OCC_CFG.margin.top for water
//    tanks, signs and parapets). The ground is cut into OCC_CFG.cell-metre cells (target boxes for street props / alleys).
//  · HORIZON (when the camera has moved): from the camera, OCC_CFG.rays rays fan out over the full circle (so turning the
//    camera never needs a new one); along each ray the horizon is the upper staircase of (distance, elevation angle) of the
//    building fronts it meets. Each building is first "shrunk" by ε (footprint inset by ε, roof lowered by ε): by the occluder-
//    shrinking theorem (Wonka, Wimmer & Schmalstieg 2000) everything found hidden is then hidden from EVERY camera position
//    within ε of where the horizon was computed — the result stays valid while the camera moves inside that sphere, and the
//    culler simply stops culling (draws everything) if the camera ever leaves it before the next horizon is ready.
//  · TEST: a target is hidden only if, on every ray across it (and the ray just outside each of its edges), its highest point
//    along that ray is below the horizon built by fronts nearer than its nearest point.
// Only the main camera's colour pass is culled. Shadow maps (a building out of sight can still throw its shadow into view),
// the water mirror, cinematic and map-capture cameras are never affected.
export const OCC_CFG = {
  enabled: true,
  rays: 2048,            // horizon resolution (0.18° per ray)
  K: 6,                  // horizon steps kept per ray
  range: 700,            // occluders / targets considered (m)
  piece: 24,             // occluder piece length (m)
  cell: 32,              // ground / prop cell size (m)
  epsMin: 0.75, epsMax: 6, epsSpeed: 0.16, // validity radius ε = clamp(epsMin + speed · epsSpeed)
  refresh: 0.55,         // recompute once the camera is refresh·ε from the horizon's eye
  maxAge: 0.5,           // …or after this many seconds (doors / streaming do not matter: buildings never move)
  budgetMs: 1.0,         // CPU time per frame spent building the next horizon (a full one takes ~3–5 ms: 3–6 frames)
  lead: 0.1,             // the next horizon is built round where the camera will be this many seconds ahead
  margin: { xz: 0.35, top: 3.5, elev: 0.0015, dist: 0.25 },
};
export const OCC_STATS = { updates: 0, ms: 0, msAvg: 0, msMax: 0, occluders: 0, targets: 0, testedB: 0, hiddenB: 0, testedC: 0, hiddenC: 0, active: false, skippedFrames: 0, frames: 0, sliceMax: 0 };
const TAU = Math.PI * 2;

export class OcclusionCuller {
  constructor(cfg = OCC_CFG) {
    this.cfg = cfg; this.R = cfg.rays; this.K = cfg.K;
    // two horizons: the front one is in use, the back one is being built (time-sliced over a few frames, see step())
    const mk = () => ({ T: new Float32Array(this.R * this.K), E: new Float32Array(this.R * this.K), N: new Uint8Array(this.R), x: 0, y: -1e9, z: 0, eps: 0 });
    this.front = mk(); this.back = mk(); this.eye = this.front; this.job = null; this.valid = false; this.age = 1e9;
    this.nO = 0; this.nB = 0; this.nC = 0; this.hiddenB = new Uint8Array(0); this.hiddenCell = new Uint8Array(0); this.hiddenProp = new Uint8Array(0);
  }
  // ---------------------------------------------------------------- bake
  // buildings: [{ id, x0, x1, z0, z1, h (wall top above ground), totalH (incl. roof) }], groundY: ground level
  bake(buildings, groundY, bounds) {
    const C = this.cfg, P = C.piece; const occ = [], own = [], fp = []; let maxId = 0;
    for (const b of buildings) { maxId = Math.max(maxId, b.id | 0); const top = groundY + (b.h || b.totalH || 0); if (!(top > groundY + 2)) continue;
      const w = b.x1 - b.x0, d = b.z1 - b.z0; if (w < 1 || d < 1) continue; const bi = fp.length / 4; fp.push(b.x0, b.x1, b.z0, b.z1);
      const nx = Math.max(1, Math.ceil(w / P)), nz = Math.max(1, Math.ceil(d / P));
      for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) { occ.push(b.x0 + w * i / nx, b.x0 + w * (i + 1) / nx, b.z0 + d * k / nz, b.z0 + d * (k + 1) / nz, top); own.push(bi); }
      if (b.tower && b.totalH > b.h + 2) { const t = b.tower.inset || 0, tx0 = b.x0 + t, tx1 = b.x1 - t, tz0 = b.z0 + t, tz1 = b.z1 - t, tw = tx1 - tx0, td = tz1 - tz0; // a tower on its podium
        if (tw > 1 && td > 1) { const mx = Math.max(1, Math.ceil(tw / P)), mz = Math.max(1, Math.ceil(td / P)); for (let i = 0; i < mx; i++) for (let k = 0; k < mz; k++) { occ.push(tx0 + tw * i / mx, tx0 + tw * (i + 1) / mx, tz0 + td * k / mz, tz0 + td * (k + 1) / mz, groundY + b.totalH); own.push(bi); } } } }
    this.occ = new Float32Array(occ); this.nO = occ.length / 5;
    // each piece's building (footprint list fp): a building the camera is in (or within ε + 0.5 m of) hides nothing — it is
    // hollow (rooms, shops, the HQ), and whatever stands inside it must stay visible from in there
    this.own = Int32Array.from(own); this.fp = new Float32Array(fp); this.nFp = fp.length / 4; this.inside = new Uint8Array(this.nFp); this.insideL = [];
    // targets: one box per building id (index = id)
    this.nB = maxId + 1; this.tgt = new Float32Array(this.nB * 6).fill(NaN); const m = C.margin;
    for (const b of buildings) { const o = (b.id | 0) * 6; this.tgt.set([b.x0 - m.xz, b.x1 + m.xz, b.z0 - m.xz, b.z1 + m.xz, groundY - 0.5, groundY + Math.max(b.totalH || 0, b.h || 0) + m.top], o); }
    this.hiddenB = new Uint8Array(this.nB); this._hiddenB = new Uint8Array(this.nB);
    // ground cells (alleys, pavements, street props): heights filled in by setCellTop
    const cs = C.cell; this.bounds = bounds; this.cx0 = Math.floor(bounds.minX / cs) * cs; this.cz0 = Math.floor(bounds.minZ / cs) * cs;
    this.ncx = Math.ceil((bounds.maxX - this.cx0) / cs); this.ncz = Math.ceil((bounds.maxZ - this.cz0) / cs); this.nC = this.ncx * this.ncz;
    this.cellTop = new Float32Array(this.nC).fill(groundY + 0.6); this.propTop = new Float32Array(this.nC).fill(NaN); this.groundY = groundY;
    this.hiddenCell = new Uint8Array(this.nC); this.hiddenProp = new Uint8Array(this.nC); this._hiddenCell = new Uint8Array(this.nC); this._hiddenProp = new Uint8Array(this.nC);
    OCC_STATS.occluders = this.nO; OCC_STATS.targets = buildings.length; this.valid = false; this.job = null;
  }
  // a batched piece of building `id` (detail, joinery, shell) reaches beyond its footprint (balconies, signs, AO skirts): its
  // target box grows to cover it, so "hidden" always means its real geometry is hidden (takes effect at the next horizon)
  growTarget(id, x0, x1, z0, z1, top) {
    if (!(id >= 0) || id >= this.nB) return false; const T = this.tgt, o = id * 6, m = this.cfg.margin.xz; if (T[o] !== T[o]) return false;
    if (x0 - m < T[o]) T[o] = x0 - m; if (x1 + m > T[o + 1]) T[o + 1] = x1 + m; if (z0 - m < T[o + 2]) T[o + 2] = z0 - m; if (z1 + m > T[o + 3]) T[o + 3] = z1 + m; if (top + 0.3 > T[o + 5]) T[o + 5] = top + 0.3; return true;
  }
  // a ground piece standing in cell c: the cell's ground box reaches its top
  raiseCell(c, top) { if (c >= 0 && c < this.nC && top + 0.2 > this.cellTop[c]) this.cellTop[c] = top + 0.2; }
  raiseProp(c, top) { if (c >= 0 && c < this.nC && !(this.propTop[c] >= top)) this.propTop[c] = top; }
  cellOf(x, z) { const cs = this.cfg.cell; const i = Math.floor((x - this.cx0) / cs), k = Math.floor((z - this.cz0) / cs); if (i < 0 || k < 0 || i >= this.ncx || k >= this.ncz) return -1; return k * this.ncx + i; }
  // a prop / street-furniture piece standing in a cell: the cell's prop box reaches its top
  addPropTop(x, z, top) { const c = this.cellOf(x, z); if (c < 0) return -1; if (!(this.propTop[c] >= top)) this.propTop[c] = top; return c; }
  // ---------------------------------------------------------------- horizon
  // the upper staircase H(D) = max elevation of fronts nearer than D, per ray (hz = a horizon buffer)
  insert(hz, r, t, e) {
    const K = this.K, o = r * K, T = hz.T, E = hz.E; let n = hz.N[r];
    // dominated by a nearer, higher (or equal) step?
    for (let j = 0; j < n; j++) { if (T[o + j] <= t && E[o + j] >= e) return; }
    // drop steps it dominates (farther and lower), keep the order by distance
    let w = 0; for (let j = 0; j < n; j++) { if (T[o + j] >= t && E[o + j] <= e) continue; T[o + w] = T[o + j]; E[o + w] = E[o + j]; w++; } n = w;
    let p = n; while (p > 0 && T[o + p - 1] > t) p--;
    if (n === K) { // full: merge away the step that adds the least (lowering the staircase there = conservative)
      let best = -1, gain = Infinity; for (let j = 0; j < n; j++) { const g = E[o + j] - (j > 0 ? E[o + j - 1] : -10); if (g < gain) { gain = g; best = j; } }
      const gNew = e - (p > 0 ? E[o + p - 1] : -10); if (gNew <= gain) return; // the new step is the least useful one
      for (let j = best; j < n - 1; j++) { T[o + j] = T[o + j + 1]; E[o + j] = E[o + j + 1]; } n--; if (best < p) p--; }
    for (let j = n; j > p; j--) { T[o + j] = T[o + j - 1]; E[o + j] = E[o + j - 1]; } T[o + p] = t; E[o + p] = e; hz.N[r] = n + 1;
  }
  // H(D): highest step strictly nearer than D (−∞ when none)
  H(hz, r, D) { const K = this.K, o = r * K, n = hz.N[r], T = hz.T, E = hz.E; let h = -Infinity; for (let j = 0; j < n; j++) { if (T[o + j] < D) { if (E[o + j] > h) h = E[o + j]; } else break; } return h; }
  // synchronous: compute the horizon round (ex, ey, ez), valid for eyes within eps, classify all targets and make it current
  compute(ex, ey, ez, eps) { this.begin(ex, ey, ez, eps); this.step(Infinity); }
  // start building a horizon in the back buffer (step() advances it; it becomes current when complete)
  begin(ex, ey, ez, eps) {
    const hz = this.back; hz.N.fill(0); hz.x = ex; hz.y = ey; hz.z = ez; hz.eps = eps;
    const F = this.fp, IN = this.inside, L = this.insideL; for (const i of L) IN[i] = 0; L.length = 0; const m = eps + 0.5;
    for (let i = 0; i < this.nFp; i++) { const o = i * 4; if (ex > F[o] - m && ex < F[o + 1] + m && ez > F[o + 2] - m && ez < F[o + 3] + m) { IN[i] = 1; L.push(i); } }
    this.job = { ph: 0, i: 0, ms: 0, frames: 0, nb: 0, tb: 0, nc: 0, tc: 0 };
  }
  // advance the job for about budgetMs (checked every few dozen items); returns true when it completed (and was swapped in)
  step(budgetMs) {
    const J = this.job; if (!J) return false; const t0 = performance.now(), tEnd = t0 + budgetMs; J.frames++;
    const C = this.cfg, R = this.R, A = R / TAU, O = this.occ, range = C.range, hz = this.back, ex = hz.x, ey = hz.y, ez = hz.z, eps = hz.eps;
    // phase 0: occluders → horizon
    while (J.ph === 0) {
      const qEnd = Math.min(this.nO, J.i + 48);
      const own = this.own, IN = this.inside;
      for (let q = J.i; q < qEnd; q++) { const o = q * 5; if (IN[own[q]]) continue;
        const x0 = O[o] + eps, x1 = O[o + 1] - eps, z0 = O[o + 2] + eps, z1 = O[o + 3] - eps, top = O[o + 4] - eps;
        if (x1 <= x0 || z1 <= z0) continue;
        const dx = Math.max(x0 - ex, 0, ex - x1), dz = Math.max(z0 - ez, 0, ez - z1); const dmin = Math.sqrt(dx * dx + dz * dz);
        if (dmin > range || dmin < 0.3) continue; // too far, or the camera is inside / touching it (inside a building: it hides nothing)
        if (top <= ey && dmin > 60 && (top - ey) / dmin < -0.35) continue; // far below the eye (aerial views): hides nothing worth the rays
        // angular span of the box seen from the eye (< π since the eye is outside)
        const ac = Math.atan2((z0 + z1) / 2 - ez, (x0 + x1) / 2 - ex); let lo = Infinity, hi = -Infinity;
        for (let c = 0; c < 4; c++) { const px = c & 1 ? x1 : x0, pz = c & 2 ? z1 : z0; let a = Math.atan2(pz - ez, px - ex) - ac; if (a > Math.PI) a -= TAU; else if (a < -Math.PI) a += TAU; if (a < lo) lo = a; if (a > hi) hi = a; }
        const r0 = Math.ceil((ac + lo) * A), r1 = Math.floor((ac + hi) * A);
        for (let rr = r0; rr <= r1; rr++) { const r = ((rr % R) + R) % R; const th = rr / A; const cx = Math.cos(th), cz = Math.sin(th);
          // slab entry distance
          let tn = 0, tf = Infinity;
          if (Math.abs(cx) < 1e-9) { if (ex < x0 || ex > x1) continue; } else { let a = (x0 - ex) / cx, b = (x1 - ex) / cx; if (a > b) { const s = a; a = b; b = s; } if (a > tn) tn = a; if (b < tf) tf = b; }
          if (Math.abs(cz) < 1e-9) { if (ez < z0 || ez > z1) continue; } else { let a = (z0 - ez) / cz, b = (z1 - ez) / cz; if (a > b) { const s = a; a = b; b = s; } if (a > tn) tn = a; if (b < tf) tf = b; }
          if (tf < tn || tn <= 0.3) continue;
          this.insert(hz, r, tn, (top - ey) / tn); }
      }
      J.i = qEnd; if (qEnd >= this.nO) { J.ph = 1; J.i = 0; }
      if (performance.now() > tEnd) return this._pause(J, t0);
    }
    // phase 1: building targets
    const T = this.tgt, hb = this._hiddenB;
    while (J.ph === 1) {
      const iEnd = Math.min(this.nB, J.i + 64);
      for (let i = J.i; i < iEnd; i++) { const o = i * 6; if (T[o] !== T[o]) { hb[i] = 0; continue; } const h = this.boxTest(hz, T[o], T[o + 1], T[o + 2], T[o + 3], T[o + 5], range); hb[i] = h === 1 ? 1 : 0; if (h !== 2) { J.tb++; if (h === 1) J.nb++; } }
      J.i = iEnd; if (iEnd >= this.nB) { J.ph = 2; J.i = 0; }
      if (performance.now() > tEnd) return this._pause(J, t0);
    }
    // phase 2: ground / prop cells (by rows)
    const cs = C.cell, HC = this._hiddenCell, HP = this._hiddenProp;
    while (J.ph === 2) {
      const k = J.i;
      for (let i = 0; i < this.ncx; i++) { const c = k * this.ncx + i, x0 = this.cx0 + i * cs, z0 = this.cz0 + k * cs;
        const g = this.boxTest(hz, x0, x0 + cs, z0, z0 + cs, this.cellTop[c], range); HC[c] = g === 1 ? 1 : 0;
        const pt = this.propTop[c]; const p = pt === pt ? (g === 1 ? this.boxTest(hz, x0 - 1, x0 + cs + 1, z0 - 1, z0 + cs + 1, pt + 0.3, range) : 0) : g; HP[c] = p === 1 ? 1 : 0;
        if (g !== 2) { J.tc++; if (p === 1) J.nc++; } }
      J.i++; if (J.i >= this.ncz) { J.ph = 3; break; }
      if (performance.now() > tEnd) return this._pause(J, t0);
    }
    // complete: swap in
    J.ms += performance.now() - t0; this.job = null;
    let t = this.front; this.front = this.back; this.back = t; this.eye = this.front;
    t = this.hiddenB; this.hiddenB = this._hiddenB; this._hiddenB = t; t = this.hiddenCell; this.hiddenCell = this._hiddenCell; this._hiddenCell = t; t = this.hiddenProp; this.hiddenProp = this._hiddenProp; this._hiddenProp = t;
    this.valid = true; this.age = 0; this.gen = (this.gen | 0) + 1;
    const S = OCC_STATS; S.updates++; S.ms = J.ms; S.frames = J.frames; S.msAvg = S.msAvg ? S.msAvg * 0.95 + J.ms * 0.05 : J.ms; S.msMax = Math.max(S.msMax, J.ms); S.testedB = J.tb; S.hiddenB = J.nb; S.testedC = J.tc; S.hiddenC = J.nc;
    return true;
  }
  _pause(J, t0) { const d = performance.now() - t0; J.ms += d; OCC_STATS.sliceMax = Math.max(OCC_STATS.sliceMax || 0, d); return false; }
  // 1 = hidden, 0 = visible, 2 = beyond range (not tested: visible) — against horizon hz from its eye
  boxTest(hz, x0, x1, z0, z1, top, range = this.cfg.range) {
    const ex = hz.x, ey = hz.y, ez = hz.z, M = this.cfg.margin, R = this.R, A = R / TAU;
    const dx = Math.max(x0 - ex, 0, ex - x1), dz = Math.max(z0 - ez, 0, ez - z1); const dmin = Math.sqrt(dx * dx + dz * dz);
    if (dmin > range) return 2; if (dmin < 1) return 0; // the camera is in / at it
    const fx = Math.max(Math.abs(x0 - ex), Math.abs(x1 - ex)), fz = Math.max(Math.abs(z0 - ez), Math.abs(z1 - ez)); const dmax = Math.sqrt(fx * fx + fz * fz);
    const ac = Math.atan2((z0 + z1) / 2 - ez, (x0 + x1) / 2 - ex); let lo = Infinity, hi = -Infinity;
    for (let c = 0; c < 4; c++) { const px = c & 1 ? x1 : x0, pz = c & 2 ? z1 : z0; let a = Math.atan2(pz - ez, px - ex) - ac; if (a > Math.PI) a -= TAU; else if (a < -Math.PI) a += TAU; if (a < lo) lo = a; if (a > hi) hi = a; }
    const r0 = Math.floor((ac + lo) * A), r1 = Math.ceil((ac + hi) * A); const above = top >= ey;
    for (let rr = r0; rr <= r1; rr++) { const r = ((rr % R) + R) % R; const th = rr / A; const cx = Math.cos(th), cz = Math.sin(th);
      let tn = 0, tf = Infinity, hit = true;
      if (Math.abs(cx) < 1e-9) { if (ex < x0 || ex > x1) hit = false; } else { let a = (x0 - ex) / cx, b = (x1 - ex) / cx; if (a > b) { const s = a; a = b; b = s; } if (a > tn) tn = a; if (b < tf) tf = b; }
      if (hit) { if (Math.abs(cz) < 1e-9) { if (ez < z0 || ez > z1) hit = false; } else { let a = (z0 - ez) / cz, b = (z1 - ez) / cz; if (a > b) { const s = a; a = b; b = s; } if (a > tn) tn = a; if (b < tf) tf = b; } }
      if (!hit || tf < tn) { tn = dmin; tf = dmax; } // the rays just outside its edges: whole-box bounds
      const D = Math.max(tn, dmin); const e = above ? (top - ey) / D : (top - ey) / Math.max(tf, D);
      if (!(this.H(hz, r, D - M.dist) > e + M.elev)) return 0; }
    return 1;
  }
  boxHiddenRaw(x0, x1, z0, z1, top, range) { return this.boxTest(this.front, x0, x1, z0, z1, top, range); }
  // ---------------------------------------------------------------- runtime
  // is the current horizon usable for a camera at p? (inside its validity sphere)
  validAt(p) { if (!this.valid) return false; const e = this.front, dx = p.x - e.x, dy = p.y - e.y, dz = p.z - e.z; return dx * dx + dy * dy + dz * dz < e.eps * e.eps; }
  // call once per frame before rendering. vel: the camera's velocity (m/s, THREE.Vector3-like) — the next horizon is built
  // round where the camera will be when it is ready (about C.lead s ahead); budgetMs: CPU time per frame for building it
  update(camera, dt, vel = null, budgetMs = this.cfg.budgetMs) {
    const C = this.cfg; this.age += dt; if (!C.enabled || !this.nO) { this.valid = false; this.job = null; OCC_STATS.active = false; return; }
    const p = camera.position; const sp = vel ? Math.hypot(vel.x, vel.y, vel.z) : 0; const e = this.front;
    if (!this.job) {
      const dx = p.x - e.x, dy = p.y - e.y, dz = p.z - e.z; const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (!this.valid || d > e.eps * C.refresh || this.age > C.maxAge) {
        const eps = Math.min(C.epsMax, C.epsMin + sp * C.epsSpeed); const L = sp > 0.2 ? Math.min(C.lead, (eps * 0.5) / sp) : 0;
        this.begin(p.x + (vel ? vel.x * L : 0), p.y + (vel ? vel.y * L : 0), p.z + (vel ? vel.z * L : 0), eps);
      }
    }
    if (this.job) this.step(this.valid && this.validAt(p) ? budgetMs : budgetMs * 2); // nothing usable meanwhile: hurry
    OCC_STATS.active = this.validAt(p);
  }
  invalidate() { this.valid = false; this.job = null; }
  // building / cell queries for the main camera at p (false when the horizon is not valid there)
  buildingHidden(id, p) { return this.valid && this.hiddenB[id] === 1 && (!p || this.validAt(p)); }
  // any box (people, vehicles): hidden from the horizon's eye (call only when validAt(camera))
  boxHidden(x0, x1, z0, z1, top) { return this.valid && this.boxTest(this.front, x0, x1, z0, z1, top) === 1; }
}
