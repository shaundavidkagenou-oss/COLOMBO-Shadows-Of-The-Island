// 92nd — STREET RACING: the rival driver. It only produces the three inputs the player has — throttle (−1 brake … 1),
// steer (−1 … 1) and handbrake — and hands them to the car's own Vehicle.drive(), the player's physics: same top speed,
// acceleration curve, binary brakes (12 m/s²), tyre grip limit (11.5 m/s² lateral on a car), steering rate and collision
// response. No speed / grip multipliers, no teleport, no catch-up help. Difficulty changes how the driver DRIVES:
//
//   aLat   — share of the tyres' grip it dares to use in a corner (corner speed = √(aLat·grip·R))
//   brake  — the deceleration it trusts when it plans a braking point (lower = brakes earlier)
//   line   — how much of the racing line it uses (0 = centre of the road, 1 = full outside–apex–outside)
//   react  — perception delay on its speed plan (s) and how far ahead it looks for traffic
//   smooth — steering / throttle smoothing (a jerky driver loses time and stability)
//   slip   — chance per corner of a misjudged braking point (runs wide, recovers)
//   gap    — side clearance it wants when passing (aggression within the rules: never steers INTO a car)
//
// Personalities shift those numbers a little (safe / aggressive / consistent). Expensive decisions (traffic scan, choice
// of a passing side) run every 0.12–0.25 s, staggered per driver; the per-frame work is an index walk along precomputed
// arrays plus a pure-pursuit steer — no path search, no raycasts.
import { STEP, nearestIdx, lateral } from './RaceRoutes.js';
import * as L from '../world/Layout.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const wrapA = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

export const DIFFICULTY = {
  easy: { label: 'Easy', aLat: 0.68, brake: 7.0, line: 0.45, react: 0.42, smooth: 3.2, slip: 0.16, gap: 1.6, scan: 0.25, look: 55, pass: 0.35, rivals: 4 },
  normal: { label: 'Normal', aLat: 0.79, brake: 8.6, line: 0.7, react: 0.3, smooth: 4.5, slip: 0.08, gap: 1.25, scan: 0.2, look: 70, pass: 0.55, rivals: 5 },
  hard: { label: 'Hard', aLat: 0.9, brake: 10.2, line: 0.92, react: 0.18, smooth: 6.5, slip: 0.025, gap: 0.95, scan: 0.15, look: 90, pass: 0.75, rivals: 5 },
  expert: { label: 'Expert', aLat: 0.965, brake: 11.1, line: 1.0, react: 0.1, smooth: 8.5, slip: 0.006, gap: 0.8, scan: 0.12, look: 110, pass: 0.9, rivals: 6 },
};
export const PERSONALITY = {
  safe: { label: 'Safe', aLat: -0.025, brake: -0.5, gap: 0.45, pass: -0.25, slip: -0.3 },
  aggressive: { label: 'Aggressive', aLat: 0.012, brake: 0.35, gap: -0.2, pass: 0.25, slip: 0.35 },
  consistent: { label: 'Consistent', aLat: 0, brake: 0, gap: 0, pass: 0, slip: -0.6, smooth: 1.5 },
};

export class RaceDriver {
  constructor(v, route, diff, persona, seed = 1) {
    this.v = v; this.R = route; this.seed = seed; this.rnd = mulberry(seed * 9301 + 49297);
    const D = DIFFICULTY[diff] || DIFFICULTY.normal, Pp = PERSONALITY[persona] || PERSONALITY.consistent;
    this.diff = diff; this.persona = persona;
    this.k = { aLat: clamp(D.aLat + (Pp.aLat || 0), 0.5, 0.985), brake: clamp(D.brake + (Pp.brake || 0), 5, 11.6), line: D.line, react: D.react, smooth: D.smooth + (Pp.smooth || 0), slip: Math.max(0, D.slip * (1 + (Pp.slip || 0))), gap: Math.max(0.6, D.gap + (Pp.gap || 0)), scan: D.scan, look: D.look, pass: clamp(D.pass + (Pp.pass || 0), 0.1, 1) };
    this.idx = -1; this.lap = 0; this.prog = 0; this.done = false; this.tact = 0; this.tactWant = 0; this.cap = Infinity; this.capT = 0; this.scanT = this.rnd() * this.k.scan;
    this.steer = 0; this.thr = 0; this.rev = 0; this.stuckT = 0; this.slipK = 1; this.slipUntil = -1; this.offT = 0;
    this.stats = { top: 0, mistakes: 0, recoveries: 0, offRoad: 0 };
  }
  // per-driver plan: own line (racing line × line usage) → its curvature → corner speeds → braking (backwards) pass
  prepare() {
    const R = this.R, N = R.N, v = this.v, T = v.T, K = v.tune; const k = this.k;
    const grip = (T.entry === 'bike' ? 9.3 : T.mass > 3000 ? 6.5 : 11.5) * (K ? K.grip : 1); const top = T.maxSpeed * (K ? K.top : 1);
    const half = T.wid / 2 + 0.75; this.top = top; this.grip = grip; this.wb = T.len * 0.62; // line margin 0.75: tracking error, mirrors off the kerb and its poles
    const off = (this.off = new Float32Array(N)); for (let i = 0; i < N; i++) off[i] = clamp(R.off[i] * k.line, -(R.hw[i] - half), R.hw[i] - half);
    const x = new Float32Array(N), z = new Float32Array(N); for (let i = 0; i < N; i++) { x[i] = R.cx[i] + R.nx[i] * off[i]; z[i] = R.cz[i] + R.nz[i] * off[i]; }
    const vp = (this.vp = new Float32Array(N)); const hd = new Float32Array(N); for (let i = 0; i < N; i++) { const a = R.at(i - 1), b = R.at(i + 1); hd[i] = Math.atan2(x[b] - x[a], z[b] - z[a]); }
    const lk = (this.lk = new Float32Array(N)); this.lhd = hd; // signed curvature of its own line (feed-forward for the steering)
    for (let i = 0; i < N; i++) { let s = 0, ss = 0; for (let d = -3; d <= 3; d++) { const a = R.at(i + d - 1), b = R.at(i + d + 1); const c = wrapA(hd[b] - hd[a]) / Math.max(0.5, Math.hypot(x[b] - x[a], z[b] - z[a])); s += Math.abs(c); ss += c; } const kap = s / 7; lk[i] = ss / 7; vp[i] = Math.min(top, kap > 1e-5 ? Math.sqrt(k.aLat * grip / kap) : top); }
    // braking: from every corner backwards with the deceleration this driver trusts (two turns round a loop)
    for (let pass = 0; pass < (R.loop ? 2 : 1); pass++) for (let i = N - 2; i >= 0; i--) { const j = R.loop ? (i + 1) % N : i + 1; const lim = Math.sqrt(vp[j] * vp[j] + 2 * k.brake * STEP); if (vp[i] > lim) vp[i] = lim; if (R.loop && i === 0) { const lim0 = Math.sqrt(vp[0] * vp[0] + 2 * k.brake * STEP); if (vp[N - 1] > lim0) vp[N - 1] = lim0; } }
    this.idx = nearestIdx(R, v.x, v.z); return this;
  }
  // race progress in samples (laps × N + samples past the start line)
  progress() { return this.prog; }
  track() { const R = this.R, v = this.v, N = R.N; const prev = this.idx; this.idx = nearestIdx(R, v.x, v.z, prev, 8); this.prog = trackProgress(this, R, this.idx); }
  // every few tenths: who is ahead within the look distance, where they will be, which side is free
  scan(ctx) {
    const R = this.R, v = this.v, k = this.k, me = this.idx; const sp = Math.max(4, Math.abs(v.speed)); const look = Math.min(k.look, 18 + sp * 2.4);
    const myHalf = v.T.wid / 2; const lat0 = lateral(R, me, v.x, v.z); const lim = R.hw[me] - myHalf - 0.3;
    const C = 11; const cost = this._cost || (this._cost = new Float32Array(C)); for (let c = 0; c < C; c++) { const o = -lim + (2 * lim * c) / (C - 1); cost[c] = Math.abs(o - this.off[R.at(me + Math.round(look * 0.5 / STEP))]) * 0.35 + Math.abs(o - this.tact) * 0.15; }
    let cap = Infinity;
    let capBy = null;
    const consider = (o, half, oSpeed, oYaw, isRival) => {
      const dx = o.x - v.x, dz = o.z - v.z; const d = Math.hypot(dx, dz); if (d > look + 8 || d < 0.1) return;
      const j = nearestIdx(R, o.x, o.z, R.at(me + Math.round(d / STEP)), 10); let ds = ((j - me + R.N) % R.N) * STEP; if (ds > R.N * STEP / 2) ds -= R.N * STEP; if (ds < -4 || ds > look) return;
      const n = lateral(R, j, o.x, o.z); if (Math.abs(n) > R.hw[j] + 0.6) return; // off the carriageway (pavement, kerb bay, forecourt)
      const need = half + myHalf + k.gap * (isRival ? 1 : 1.35); // more room for civilians (they do not expect us)
      const oLen = o.T ? o.T.len / 2 : 0.4; if (ds < (v.T.len / 2 + oLen) * 0.9) { // alongside: never steer into it (no braking for it)
        if (ds > -(v.T.len / 2 + oLen)) for (let c = 0; c < C; c++) { const oc = -lim + (2 * lim * c) / (C - 1); if (Math.abs(oc - n) < need - 0.3 && Math.sign(oc - lat0) === Math.sign(n - lat0)) cost[c] += 25; }
        return; }
      const along = oSpeed * Math.cos(wrapA(oYaw - R.hd[j]));
      const want = this.vp[j]; // what this driver would do at that point: only something slower than that is in the way
      const overlap = Math.abs(lat0 - n) < need;
      if (along > want - 1.5 && along > sp - 2) { if (ds < 9 && overlap && ds > 0) { if (along < cap) { cap = along; capBy = o; } } return; } // as fast as we want to go: just never into its back
      let free = false; for (let c = 0; c < C; c++) { const oc = -lim + (2 * lim * c) / (C - 1); if (Math.abs(oc - n) < need) cost[c] += 40 + (look - ds); else free = true; }
      // no side free, or too close to switch lanes before reaching it: hold back to its speed with a gap
      const stopD = Math.max(0, (sp * sp - Math.max(0, along) ** 2) / (2 * k.brake)) + 5 + sp * k.react;
      if ((!free && ds < stopD + 25) || (overlap && ds < stopD)) { const vc = Math.max(0, along) + Math.max(0, (ds - 7) * 0.45); if (vc < cap) { cap = vc; capBy = o; } }
    };
    const B = ctx.bins; if (B) { const R0 = look + 8; const i0 = Math.floor((v.x - R0) / 24), i1 = Math.floor((v.x + R0) / 24), j0 = Math.floor((v.z - R0) / 24), j1 = Math.floor((v.z + R0) / 24);
      for (let i = i0; i <= i1; i++) for (let jj = j0; jj <= j1; jj++) { const a = B.get((i * 4096 + jj) | 0); if (!a) continue; for (const o of a) { if (o === v || !o.T) continue; const isRival = !!o.raceDriver || o === ctx.playerV; consider(o, o.T.wid / 2, o.free ? Math.hypot(o.free.vx, o.free.vz) : Math.abs(o.speed || 0), o.yaw, isRival); } } }
    const peds = ctx.peds; if (peds) for (const p of peds) { if (Math.abs(p.x - v.x) > look || Math.abs(p.z - v.z) > look || p.dead || !(p.crossing || L.roadAt(p.x, p.z))) continue; consider(p, 0.6, 0, 0, false); } // people on the carriageway (crossing): always given room / a stop
    let best = 0; for (let c = 1; c < C; c++) if (cost[c] < cost[best]) best = c; this.tactWant = -lim + (2 * lim * best) / (C - 1) - this.off[R.at(me + 6)];
    this.cap = cap; this.capBy = capBy;
  }
  // per frame: inputs for Vehicle.drive
  update(dt, ctx) {
    const v = this.v, R = this.R, k = this.k; this.track(); const sp = v.speed; this.stats.top = Math.max(this.stats.top, sp);
    if ((this.scanT -= dt) <= 0) { this.scanT = k.scan; this.scan(ctx); }
    this.tact += (this.tactWant - this.tact) * Math.min(1, dt * 1.6);
    const i = this.idx; const lat = lateral(R, i, v.x, v.z); const off = Math.abs(lat) > R.hw[i] + 1;
    if (off) { this.offT += dt; if (this.offT > 0.5 && !this._offC) { this._offC = true; this.stats.offRoad++; } } else { this.offT = 0; this._offC = false; }
    // ---- recovery: stuck against something / facing the wrong way → back out, turn, go
    const hdErr = wrapA(R.hd[i] - v.yaw); const wrongWay = Math.abs(hdErr) > 1.9;
    if (this.rev > 0) { this.rev -= dt; const st = clamp(-hdErr * 1.5, -1, 1); return this.out(dt, -0.8, -st, false); }
    if (this.thr > 0.4 && Math.abs(sp) < 1.2 && !ctx.holding) this.stuckT += dt; else this.stuckT = Math.max(0, this.stuckT - dt * 2);
    if (this.stuckT > 1.1 || (wrongWay && Math.abs(sp) < 3)) { this.stuckT = 0; this.rev = 1.1 + this.rnd() * 0.5; this.stats.recoveries++; return this.out(dt, -0.8, 0, false); }
    // ---- steering: feed-forward on its line's curvature a little ahead (covers the steering lag) + heading and
    // cross-track feedback (a linearised pure pursuit over a preview length that grows with speed)
    const steerMax = v.T.steer * (v.tune ? v.tune.steer : 1) * (1 - 0.65 * clamp(Math.abs(sp) / v.T.maxSpeed, 0, 1)); // Vehicle.drive's own steering range at this speed
    const half = v.T.wid / 2, limI = R.hw[i] - half - 0.2; const oT = clamp(this.off[i] + this.tact, -limI, limI); const ce = lat - oT; const tau = 0.2; const yawP = v.yaw + ((sp * Math.tan(v.steer || 0)) / this.wb) * tau; // where the nose will point once the wheels have caught up
    const Lh = clamp(6 + Math.abs(sp) * 0.8, 6, 40); const pI = R.at(i + Math.round((Math.abs(sp) * tau) / STEP)); const psi = wrapA(this.lhd[pI] - yawP);
    const kc = this.lk[pI] * 1.25 + (2 * psi) / Lh - (1 * clamp(ce, -6, 6)) / (Lh * Lh);
    let st = clamp(Math.atan(kc * this.wb) / Math.max(0.05, steerMax), -1, 1); if (sp < 0) st = -st; if (wrongWay) st = hdErr > 0 ? 1 : -1;
    // at the edge of the carriageway and still drifting out: lift (the tyres were asked for more than they have)
    const latV = sp * Math.sin(wrapA(v.yaw - R.hd[i])); const nearEdge = Math.abs(lat) > R.hw[i] - half - 0.5 && Math.sign(latV) === Math.sign(lat) && Math.abs(latV) > 0.8;
    // ---- speed: the plan a reaction time ahead, a misjudged corner now and then, traffic / rival cap
    const lead = R.at(i + Math.max(1, Math.round((Math.abs(sp) * k.react) / STEP))); let vt = this.vp[lead];
    if (ctx.t > this.slipUntil) { const nxt = R.at(i + Math.round((Math.abs(sp) * 2.2) / STEP)); if (this.vp[nxt] < sp - 6 && this.vp[i] > sp - 1 && !this._inBrake) { this._inBrake = true; if (this.rnd() < k.slip) { this.slipK = 1.07 + this.rnd() * 0.07; this.slipUntil = ctx.t + 2.6; this.stats.mistakes++; } else this.slipK = 1; } else if (this.vp[nxt] >= sp - 1) this._inBrake = false; }
    if (ctx.t < this.slipUntil) vt *= this.slipK;
    if (off) vt = Math.min(vt, 14); if (nearEdge) vt = Math.min(vt, sp - 3); if (this.cap < vt) vt = this.cap; if (ctx.holding) vt = 0;
    const e = vt - sp; let thr; if (e > 0.4) thr = clamp(e * 0.5, 0.25, 1); else if (e < -0.9) thr = -1; else thr = e > 0 ? 0.15 : 0;
    return this.out(dt, thr, st, false);
  }
  out(dt, thr, st, hb) { const s = this.k.smooth; this.steer += (st - this.steer) * Math.min(1, dt * s * 4); this.thr = thr < 0 ? thr : this.thr + (thr - this.thr) * Math.min(1, dt * s * 1.2); return { throttle: this.thr, steer: this.steer, handbrake: hb }; }
}
// progress relative to the start line: u = samples past it (0 … N−1); a wrap of u is a lap. Cars on the grid sit just
// behind the line (u ≈ N − few) and start on lap −1, so their progress is a small negative number.
export function trackProgress(o, R, idx) { const N = R.N; const u = (idx - R.startI + N) % N; if (o._u === undefined) { o.lap = u > N / 2 ? -1 : 0; } else if (o._u > N * 0.75 && u < N * 0.25) o.lap++; else if (o._u < N * 0.25 && u > N * 0.75) o.lap--; o._u = u; return o.lap * N + u; }
function mulberry(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
