// Official trailer — the edit, as pure data and maths (no three.js, no DOM): every shot's camera, every vehicle's and
// actor's pose is an analytic function of time, so the trailer is deterministic, seekable, and the node test
// (tools/trailer-test.mjs) can check every camera position and driving line against the real city plan.
//
// Two clocks: EDIT time (seconds of trailer, locked to the music) and per-scene SIM time (the world's clock inside a
// scene). Each shot maps its stretch of edit time onto sim time with a rate curve: rate < 1 is slow motion; a shot may
// start at any sim time (cutting to another angle of the same moment, or skipping ahead).
// Axes as in the game: +z forward, +x left, yaw = atan2(x, z).

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const sm = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const smr = (a, b, t) => sm((t - a) / (b - a)); // smooth ramp 0→1 between a and b
const L3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export const LENGTH = 110; // seconds
export const BPM = 120; export const BAR = 2; // 4/4 at 120 bpm: one bar = 2 s (sections and big cuts land on bar lines)

// ---------------------------------------------------------------- monotone cubic interpolation (Fritsch–Carlson)
// keys [[x, y], …] with increasing x. Never overshoots between keys (a car never rolls backwards between two stops).
export function curve(keys) {
  const n = keys.length, X = keys.map((k) => k[0]), Y = keys.map((k) => k[1]);
  const d = []; for (let i = 0; i < n - 1; i++) d.push((Y[i + 1] - Y[i]) / (X[i + 1] - X[i]));
  const m = new Array(n).fill(0);
  if (n > 1) { m[0] = d[0]; m[n - 1] = d[n - 2]; }
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i]; const h = a * a + b * b;
    if (h > 9) { const t = 3 / Math.sqrt(h); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
  }
  const seg = (x) => { let lo = 0, hi = n - 2; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (X[mid] <= x) lo = mid; else hi = mid - 1; } return lo; };
  return {
    keys,
    at(x) {
      if (n === 1) return Y[0]; if (x <= X[0]) return Y[0] + m[0] * (x - X[0]); if (x >= X[n - 1]) return Y[n - 1] + m[n - 1] * (x - X[n - 1]);
      const i = seg(x), h = X[i + 1] - X[i], t = (x - X[i]) / h, t2 = t * t, t3 = t2 * t;
      return (2 * t3 - 3 * t2 + 1) * Y[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * Y[i + 1] + (t3 - t2) * h * m[i + 1];
    },
    d(x) { const e = 1e-3; return (this.at(x + e) - this.at(x - e)) / (2 * e); },
  };
}
const flat = (keys) => { // hold the first/last value outside the keys (curve() extrapolates linearly)
  const c = curve(keys), x0 = keys[0][0], x1 = keys[keys.length - 1][0];
  return { at: (x) => c.at(clamp(x, x0, x1)), d: (x) => (x < x0 || x > x1 ? 0 : c.d(x)) };
};

// ---------------------------------------------------------------- driving lines (centripetal Catmull-Rom, arc-length sampled)
export class Path {
  constructor(pts, step = 0.25) {
    const P = pts.map((p) => [p[0], p[1]]); const n = P.length;
    const ext = [[2 * P[0][0] - P[1][0], 2 * P[0][1] - P[1][1]], ...P, [2 * P[n - 1][0] - P[n - 2][0], 2 * P[n - 1][1] - P[n - 2][1]]];
    const raw = [];
    for (let i = 1; i < ext.length - 2; i++) {
      const p0 = ext[i - 1], p1 = ext[i], p2 = ext[i + 1], p3 = ext[i + 2];
      const tj = (a, b) => Math.pow(Math.hypot(b[0] - a[0], b[1] - a[1]), 0.5) || 1e-4;
      const t0 = 0, t1 = t0 + tj(p0, p1), t2 = t1 + tj(p1, p2), t3 = t2 + tj(p2, p3);
      const N = Math.max(2, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step));
      for (let k = 0; k < N; k++) {
        const t = lerp(t1, t2, k / N); const A = (pa, pb, ta, tb) => [((tb - t) * pa[0] + (t - ta) * pb[0]) / (tb - ta), ((tb - t) * pa[1] + (t - ta) * pb[1]) / (tb - ta)];
        const A1 = A(p0, p1, t0, t1), A2 = A(p1, p2, t1, t2), A3 = A(p2, p3, t2, t3), B1 = A(A1, A2, t0, t2), B2 = A(A2, A3, t1, t3); raw.push(A(B1, B2, t1, t2));
      }
    }
    raw.push(P[n - 1]);
    this.X = raw.map((p) => p[0]); this.Z = raw.map((p) => p[1]); this.S = [0];
    for (let i = 1; i < raw.length; i++) this.S.push(this.S[i - 1] + Math.hypot(this.X[i] - this.X[i - 1], this.Z[i] - this.Z[i - 1]));
    this.length = this.S[this.S.length - 1];
  }
  idx(s) { const S = this.S; let lo = 0, hi = S.length - 2; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (S[mid] <= s) lo = mid; else hi = mid - 1; } return lo; }
  heading(i) { const j = clamp(i, 0, this.X.length - 2); return Math.atan2(this.X[j + 1] - this.X[j], this.Z[j + 1] - this.Z[j]); }
  // position + heading at arc length s (beyond either end: straight on along the end tangent)
  at(s) {
    const n = this.X.length;
    if (s <= 0) { const h = this.heading(0); return { x: this.X[0] + Math.sin(h) * s, z: this.Z[0] + Math.cos(h) * s, hdg: h }; }
    if (s >= this.length) { const h = this.heading(n - 2), e = s - this.length; return { x: this.X[n - 1] + Math.sin(h) * e, z: this.Z[n - 1] + Math.cos(h) * e, hdg: h }; }
    const i = this.idx(s), u = (s - this.S[i]) / Math.max(1e-6, this.S[i + 1] - this.S[i]);
    // heading blended across sample boundaries: no stepping in the yaw of a car on a curve
    const ha = this.heading(i - 1), hb = this.heading(i), hc = this.heading(i + 1); const h0 = ha + wrap(hb - ha) * 0.5, h1 = hb + wrap(hc - hb) * 0.5;
    return { x: lerp(this.X[i], this.X[i + 1], u), z: lerp(this.Z[i], this.Z[i + 1], u), hdg: h0 + wrap(h1 - h0) * u };
  }
  // arc length of the sample nearest to (x, z)
  project(x, z) { let best = 0, bd = 1e18; for (let i = 0; i < this.X.length; i++) { const d = (this.X[i] - x) ** 2 + (this.Z[i] - z) ** 2; if (d < bd) { bd = d; best = i; } } return this.S[best]; }
  curvature(s) { const a = this.at(s - 1).hdg, b = this.at(s + 1).hdg; return wrap(b - a) / 2; }
}

// yaw/pitch/roll ('YXZ', as Vehicle.sync) applied to the local point (0, a, 0): where a body's centre sits relative to its origin
export function rotUp(yaw, pitch, roll, a) {
  const x1 = -a * Math.sin(roll), y1 = a * Math.cos(roll);
  const y2 = y1 * Math.cos(pitch), z2 = y1 * Math.sin(pitch);
  return [x1 * Math.cos(yaw) + z2 * Math.sin(yaw), y2, -x1 * Math.sin(yaw) + z2 * Math.cos(yaw)];
}

// ---------------------------------------------------------------- rigs
// vehicle rig → pose(t): { x, z, yaw, hdg, speed, steer, lat, y?, pitch?, roll?, vis, lights, beacons, smokeR }
function vehicleRig(o) {
  const r = { kind: 'veh', ...o };
  r.pose = (t) => {
    const s = r.s(t), sp = (r.s(t + 0.02) - r.s(t - 0.02)) / 0.04; const p = r.path.at(s + (r.sOff || 0));
    const lat = r.lat ? r.lat.at(t) : 0; const slip = r.slip ? r.slip.at(t) : 0;
    const lx = Math.cos(p.hdg), lz = -Math.sin(p.hdg); // left normal of the heading
    const out = { x: p.x + lx * lat, z: p.z + lz * lat, hdg: p.hdg, yaw: p.hdg + slip, speed: sp, lat, slip,
      steer: Math.abs(slip) > 0.06 ? clamp(-slip * 0.75, -0.6, 0.6) : clamp(Math.atan(r.path.curvature(s + (r.sOff || 0)) * 2.9), -0.55, 0.55),
      vis: r.vis ? r.vis(t) : true, lights: r.lights ? r.lights(t) : false, beacons: r.beacons ? r.beacons(t) : false, smokeR: r.smoke ? r.smoke(t) : 0 };
    if (r.extra) r.extra(t, out);
    return out;
  };
  return r;
}
// a parked / static vehicle that can be blown into the air (flip) at time tE
function staticVehicle(o) {
  const r = { kind: 'veh', ...o };
  r.pose = (t) => {
    const out = { x: r.x, z: r.z, yaw: r.yaw, hdg: r.yaw, speed: 0, steer: 0, lat: 0, slip: 0, vis: r.vis ? r.vis(t) : true, lights: !!r.lightsOn, beacons: r.beacons ? r.beacons(t) : true, smokeR: 0, wreck: false };
    const F = r.flip; if (F && t >= F.t) {
      const tau = t - F.t, T = (2 * F.vy) / 9.8, h = F.h; out.wreck = true; out.speed = 0;
      const k = Math.min(tau, T) / T; // 0..1 through the flight
      const yc = h / 2 + F.vy * Math.min(tau, T) - 4.9 * Math.min(tau, T) ** 2; // centre height above the road
      const bounce = tau > T ? 0.25 * Math.exp(-(tau - T) * 6) * Math.abs(Math.sin((tau - T) * 14)) : 0;
      const pitch = F.pitch * sm(k) + (tau > T ? Math.sin((tau - T) * 9) * Math.exp(-(tau - T) * 5) * 0.06 : 0), roll = F.roll * sm(k), yaw = r.yaw + F.yaw * sm(k);
      const cx = r.x + F.vx * Math.min(tau, T) + (tau > T ? F.vx * 0.15 * (1 - Math.exp(-(tau - T) * 4)) : 0), cz = r.z + F.vz * Math.min(tau, T);
      const up = rotUp(yaw, pitch, roll, h / 2);
      Object.assign(out, { x: cx - up[0], z: cz - up[2], y: yc + bounce - up[1], pitch, roll, yaw, cx, cz, cy: yc + bounce });
    }
    return out;
  };
  return r;
}
// walker / stander rig → pose(t): { x, z, yaw, speed, act, vis, rifle: { draw, aim, target } , seat }
function pedRig(o) {
  const r = { kind: 'ped', ...o };
  r.pose = (t) => {
    const seg = r.segs.find((q) => t < q.t1) || r.segs[r.segs.length - 1];
    if (seg.seat) return { seat: seg.seat, vis: true, act: null, x: 0, z: 0, yaw: 0, speed: 0 };
    if (seg.hidden) return { vis: false, x: 0, z: 0, yaw: 0, speed: 0 };
    let x = seg.x, z = seg.z, yaw = seg.yaw ?? 0, speed = 0;
    if (seg.walk) { const [a, b] = seg.walk, v = seg.v ?? 1.35; const len = Math.hypot(b[0] - a[0], b[1] - a[1]); const d = clamp((t - seg.t0) * v, 0, len); const k = d / len; x = lerp(a[0], b[0], k); z = lerp(a[1], b[1], k); yaw = Math.atan2(b[0] - a[0], b[1] - a[1]); speed = d < len && t >= seg.t0 ? v : 0; }
    return { x, z, yaw, speed, act: typeof seg.act === 'function' ? seg.act(t) : seg.act || null, vis: true, rifle: seg.rifle ? { sling: !!seg.rifle.sling, aim: seg.rifle.aim ? seg.rifle.aim(t) : 0, target: seg.rifle.target || null } : null };
  };
  return r;
}

// ---------------------------------------------------------------- camera helpers: (t, P, u) → { p:[x,y,z], l:[x,y,z], fov, roll, shake }
const dolly = (a, b, fov0 = 45, fov1 = fov0, ease = sm) => (t, P, u) => { const k = ease(u); return { p: L3(a.p, b.p, k), l: L3(a.l, b.l, k), fov: lerp(fov0, fov1, k), roll: lerp(a.roll || 0, b.roll || 0, k) }; };
const fwdRight = (hdg) => ({ fx: Math.sin(hdg), fz: Math.cos(hdg), rx: -Math.cos(hdg), rz: Math.sin(hdg) }); // right = −left
// camera attached to a vehicle's frame (its driving heading, not the sliding body): o = [right, up, fwd], look = [right, up, fwd]
const rigCam = (id, o, look, fov = 42, extra = {}) => (t, P) => { const v = P[id]; const F = fwdRight(v.hdg); const at = (q) => [v.x + F.rx * q[0] + F.fx * q[2], (v.y || 0) + q[1], v.z + F.rz * q[0] + F.fz * q[2]]; return { p: at(o), l: at(look), fov, roll: extra.roll || 0, hand: extra.hand ?? 0.6 }; };

// ---------------------------------------------------------------- the trailer
export function buildPlan() {
  // ======== scene C geometry: Dharmapala Mawatha → (drift) → Galle Road north → roadblock at Galle Face ========
  const arc = []; for (let a = 90; a <= 180; a += 10) arc.push([-391 + 12.4 * Math.cos((a * Math.PI) / 180), 31 + 12.4 * Math.sin((a * Math.PI) / 180)]);
  const tail = [[-403.3, 20], [-402.5, 6], [-401.8, -16], [-401.8, -200], [-401.8, -620], [-401.8, -1000]];
  const H = new Path([[-352, 47.2], [-358, 47.0], [-366, 45.4], [-374, 43.7], [-382, 43.4], ...arc, ...tail]); // the getaway car (pulls out from the kerb)
  const Q = new Path([[-250, 43.4], [-300, 43.4], [-340, 43.4], [-374, 43.4], [-382, 43.4], ...arc, ...tail]); // police (come along Dharmapala Mawatha)
  const sA0 = H.project(-391, 43.4), sA1 = H.project(-403.4, 31), RBZ = -577.5, sRB = H.project(-401.8, RBZ);
  const dQ = Q.project(-391, 43.4) - sA0; // H-coordinates → Q-coordinates (identical after the corner)
  const heroS = curve([[0, 0], [2.0, 0], [4.6, 20], [5.75, sA0 - 1.5], [7.35, sA1], [9.0, sA1 + 28], [12.0, sA1 + 100], [28.3, sRB], [44, sRB + 15.7 * 30]]);
  const lag = flat([[8, 2.6], [12, 2.5], [16, 1.2], [22, 0.8], [27, 1.6], [28, 1.6]]);
  const STOP1 = H.project(-401.8, -546), STOP2 = H.project(-401.8, -510);
  // police 1: approach the corner, then hunt the getaway car (gap closing on the straight), brake hard and spin out at the roadblock
  const p1Keys = [[5.2, sA0 - 62], [6.6, sA0 - 34], [8.35, sA0 - 4]]; for (let t = 8.6; t < 27.3; t += 0.25) p1Keys.push([t, heroS.at(t - lag.at(t))]);
  const b1 = heroS.at(27.3 - 1.6); p1Keys.push([27.3, b1], [28.6, b1 + (STOP1 - b1) * 0.62], [29.8, b1 + (STOP1 - b1) * 0.92], [30.8, STOP1], [44, STOP1]);
  const p1S = curve(p1Keys);
  const p2Keys = [[6.6, sA0 - 62], [8.0, sA0 - 34], [9.75, sA0 - 4]]; for (let t = 10.0; t < 27.4; t += 0.25) p2Keys.push([t, p1S.at(t - 1.4)]);
  const b2 = p1S.at(27.4 - 1.4); p2Keys.push([27.4, b2], [28.6, b2 + (STOP2 - b2) * 0.48], [29.8, b2 + (STOP2 - b2) * 0.8], [30.8, b2 + (STOP2 - b2) * 0.95], [31.6, STOP2], [44, STOP2]);
  const p2S = curve(p2Keys);
  const tE = 27.6; // the roadblock jeep goes up
  const hide = (a, b) => (t) => !(t >= a && t < b);
  const rigsC = {
    hero: vehicleRig({ type: 'praetor', seed: 4, path: H, s: (t) => heroS.at(t), driver: 'dineth',
      slip: flat([[0, 0], [5.45, 0], [5.62, 0.12], [5.85, -0.5], [6.2, -0.68], [7.0, -0.6], [7.5, -0.3], [8.2, -0.05], [8.6, 0]]),
      lights: (t) => t >= 0.6, smoke: (t) => (t >= 2 && t < 3.4 ? 1 : t >= 3.4 && t < 4 ? 1 - (t - 3.4) / 0.6 : 0), vis: hide(35, 99) }),
    pol1: vehicleRig({ type: 'police', seed: 1, path: Q, sOff: dQ, s: (t) => p1S.at(t), driver: 'officer', lights: () => true, beacons: () => true,
      slip: flat([[8.6, 0], [9.2, -0.16], [10.0, -0.24], [10.6, -0.1], [11.2, 0], [28.4, 0], [28.9, 0.35], [29.5, 1.3], [30.1, 2.2], [30.8, 2.55], [44, 2.55]]),
      lat: flat([[28.4, 0], [29.5, -0.7], [30.8, -2.0], [44, -2.0]]), vis: (t) => t > 5 }),
    pol2: vehicleRig({ type: 'police', seed: 2, path: Q, sOff: dQ, s: (t) => p2S.at(t), driver: 'officer', lights: () => true, beacons: () => true,
      slip: flat([[10, 0], [10.6, -0.14], [11.4, -0.2], [12.0, 0], [29.0, 0], [30.2, 0.3], [31.6, 0.42], [44, 0.42]]),
      lat: flat([[0, 0], [13.2, 0], [15.5, -3.4], [26, -3.4], [28, -2.0], [44, -2.0]]), vis: (t) => t > 6 }),
    bus: vehicleRig({ type: 'bus', seed: 1, path: new Path([[-405, -100], [-405, -300], [-405, -500]]), s: (t) => 150 + 9 * (t - 17), driver: 'civ', lights: () => true, vis: (t) => t < 26 }),
    jeepA: staticVehicle({ type: 'policejeep', seed: 1, x: -404.0, z: RBZ, yaw: Math.PI / 2 - 0.25, lightsOn: true, driver: null,
      flip: { t: tE, vy: 8.6, vx: -4.2, vz: -0.9, pitch: -Math.PI, roll: 0.35, yaw: 0.6, h: 1.9 }, beacons: (t) => t < tE }),
    jeepB: staticVehicle({ type: 'policejeep', seed: 2, x: -395.4, z: RBZ - 1.6, yaw: -Math.PI / 2 + 0.3, lightsOn: true,
      flip: { t: 41.0, vy: 2.6, vx: 0.5, vz: -0.3, pitch: 0.18, roll: -0.42, yaw: -0.15, h: 1.9 }, beacons: (t) => t < 41 }),
  };
  const jeepCentre = (t) => { const p = rigsC.jeepA.pose(t); return [p.cx ?? p.x, p.cy ?? 0.95, p.cz ?? p.z]; };
  const officerSeg = (x, z, fire) => [{ t1: tE + 0.15, x, z, yaw: 0, rifle: { aim: () => 1, target: 'hero' }, fire },
    { t1: 35, x, z: z - 0.4, yaw: 0.25, act: (t) => (t < tE + 1.1 ? 'stumble' : 'crouch'), rifle: { aim: () => 0 } }, { t1: 99, hidden: true }];
  const faceJeep = (x, z) => Math.atan2(-404 - x, RBZ - z);
  const pedsC = {
    dineth: pedRig({ who: 'dineth', segs: [{ t1: 35, seat: 'hero' }, { t1: 99, walk: [[-401.3, -589.5], [-401.3, -600]], t0: 40 }] }),
    shashika: pedRig({ who: 'shashika', segs: [{ t1: 35, x: -424.5, z: -566.0, yaw: faceJeep(-424.5, -566.0), rifle: { aim: (t) => (t > 25.2 && t < tE + 0.6 ? 1 : 0.3), target: 'jeepA' } },
      { t1: 99, walk: [[-403.2, -589.9], [-403.2, -600]], t0: 40, rifle: { aim: () => 0 } }] }),
    david: pedRig({ who: 'david', segs: [{ t1: 35, x: -422.4, z: -563.6, yaw: faceJeep(-422.4, -563.6), rifle: { aim: (t) => (t > 25.4 && t < tE + 0.6 ? 1 : 0.3), target: 'jeepA' } },
      { t1: 99, walk: [[-399.4, -589.7], [-399.4, -600]], t0: 40, rifle: { aim: () => 0 } }] }),
    off1: pedRig({ who: 'officer', seed: 41, segs: officerSeg(-394.2, -584.0) }),
    off2: pedRig({ who: 'officer', seed: 42, segs: officerSeg(-397.8, -584.4) }),
    off3: pedRig({ who: 'officer', seed: 43, segs: officerSeg(-391.6, -583.2) }),
  };
  // gunfire: [shooter, from, to, rounds/s, target]
  const bursts = (who, list, rof, target) => list.map(([a, b]) => ({ who, a, b, rof, target }));
  const fireC = [
    ...bursts('off2', [[25.35, 25.75]], 9, 'hero'), ...bursts('off1', [[25.6, 25.95]], 9, 'hero'),
    ...bursts('shashika', [[26.2, 26.55], [26.8, 27.15], [27.28, 27.56]], 9.5, 'jeepA'), ...bursts('david', [[26.4, 26.7], [27.0, 27.3]], 9, 'jeepA'),
  ];
  const eventsC = [{ t: tE, kind: 'blast', at: 'jeepA', power: 1.7, burn: 'jeepA' }, { t: 41.0, kind: 'blast', at: 'jeepB', power: 1.25, burn: 'jeepB' }];

  // ======== scene B: the crew (night) ========
  const rigsB = { car: staticVehicle({ type: 'praetor', seed: 4, x: -352, z: 47.2, yaw: -Math.PI / 2, beacons: () => false, lightsOn: false }) };
  const pedsB = {
    dineth: pedRig({ who: 'dineth', segs: [{ t1: 10, x: -351.0, z: 50.7, yaw: -2.45 }, { t1: 99, walk: [[-401.2, 152], [-401.2, 140]], t0: 20, v: 1.35 }] }),
    shashika: pedRig({ who: 'shashika', segs: [{ t1: 18, walk: [[-340.4, 106], [-340.4, 94]], t0: 10, v: 1.3, rifle: { sling: true } }, { t1: 99, walk: [[-403.0, 152], [-403.0, 140]], t0: 20, rifle: { sling: true } }] }),
    david: pedRig({ who: 'david', segs: [{ t1: 15, hidden: true }, { t1: 20, x: -388.1, z: 216.4, yaw: -Math.PI / 2, act: 'phone' }, { t1: 99, walk: [[-399.4, 152], [-399.4, 140]], t0: 20 }] }),
  };

  // ======== scene A3: Pettah in the rain ========
  const rigsA3 = { tuk: vehicleRig({ type: 'tuktuk', seed: 2, path: new Path([[-230, -903.6], [-60, -903.6]]), s: (t) => 59.75 + 9 * t, driver: 'civ', lights: () => true }) };

  // ---------------------------------------------------------------- scenes (environment + rigs)
  const NIGHT = { hour: 21.3, weather: 'clear', wet: 0.62 };
  const scenes = {
    A1: { env: { hour: 17.85, weather: 'clear', wet: 0 }, focus: [-440, -380], traffic: true }, // the green and Galle Road the camera looks at (not the sea)
    A2: { env: { hour: 17.92, weather: 'cloudy', wet: 0 }, focus: [210, -470], traffic: true },
    A3: { env: { hour: 15.6, weather: 'rain', wet: 1 }, focus: [-150, -904], traffic: true, rigs: rigsA3, clearRoad: [[-235, -55], [-908, -899]] },
    A4: { env: { hour: 18.1, weather: 'clear', wet: 0 }, focus: [-490, -460], traffic: true }, // the promenade behind the camera
    A5: { env: { hour: 18.55, weather: 'clear', wet: 0, toHour: 19.25 }, focus: [-60, -520], traffic: true },
    B: { env: NIGHT, rigs: rigsB, peds: pedsB, traffic: false },
    C: { env: NIGHT, rigs: rigsC, peds: pedsC, fire: fireC, events: eventsC, traffic: false, hideRoadPeds: true, noPeds: [[-400, -578, 75]] }, // nobody strolls through the ambush
    F: { env: { hour: 21.3, weather: 'clear', wet: 0.3 }, focus: [230, -560], traffic: true },
  };
  for (const [id, s] of Object.entries(scenes)) { s.id = id; s.rigs ||= {}; s.peds ||= {}; s.fire ||= []; s.events ||= []; }

  // ---------------------------------------------------------------- the edit
  const S = (scene, start, dur, cam, o = {}) => ({ scene, start, dur, cam, t0: o.t0 ?? 0, rate: o.rate ?? 1, focus: o.focus || null, dip: o.dip || null, name: o.name || '' });
  const shots = [
    // ACT I — the postcard city (sunset → nightfall), cross-dissolves through black
    S('A1', 0.0, 7.5, dolly({ p: [-700, 55, -520], l: [-420, 40, -380] }, { p: [-585, 42, -330], l: [-380, 30, -300] }, 50, 46), { name: 'sea' }),
    S('A2', 7.5, 4.5, dolly({ p: [115, 4, -452], l: [305, 120, -480] }, { p: [165, 6, -466], l: [305, 165, -480] }, 50, 48), { name: 'lotus' }),
    S('A3', 12.0, 4.5, dolly({ p: [-150, 0.8, -900.4], l: [-200, 1.0, -903.6] }, { p: [-152, 0.9, -900.2], l: [-140, 1.0, -903.6] }, 52, 50), { name: 'pettah', focus: [-150, -904] }),
    S('A4', 16.5, 4.5, dolly({ p: [-505, 2.6, -470], l: [-700, 15, -440] }, { p: [-512, 2.8, -455], l: [-700, 12, -430] }, 50, 48), { name: 'promenade', focus: [-505, -462] }),
    S('A5', 21.0, 5.0, dolly({ p: [70, 22, -400], l: [-200, 50, -640] }, { p: [55, 24, -420], l: [-200, 55, -650] }, 52, 50), { name: 'nightfall' }),
    // ACT II — the crew
    S('B', 27.0, 4.5, dolly({ p: [-357.5, 1.0, 46.2], l: [-351.4, 1.5, 50.4] }, { p: [-356.7, 1.12, 46.8], l: [-351.3, 1.55, 50.5] }, 36, 34), { t0: 0, name: 'dineth', focus: [-352, 50] }),
    S('B', 31.5, 4.5, (t, P) => { const z = P.shashika.z; return { p: [-340.6, 0.95, z - 3.7], l: [-340.4, 1.3, z], fov: 38, hand: 0.5 }; }, { t0: 10, rate: 0.8, name: 'shashika', focus: [-340, 100] }),
    S('B', 36.0, 4.5, dolly({ p: [-395.4, 1.5, 212.2], l: [-388.1, 1.62, 216.4] }, { p: [-394.8, 1.52, 212.9], l: [-388.1, 1.62, 216.4] }, 38, 36), { t0: 15, name: 'david', focus: [-390, 215] }),
    S('B', 41.5, 4.5, dolly({ p: [-401.2, 0.85, 143.6], l: [-401.2, 1.3, 151] }, { p: [-401.2, 0.9, 142.8], l: [-401.2, 1.32, 151] }, 38, 37), { t0: 20, rate: 0.5, name: 'trio', focus: [-401, 150] }),
    // ACT III — the getaway
    S('C', 48.0, 2.0, dolly({ p: [-358.6, 0.42, 45.3], l: [-352.6, 0.65, 47.2] }, { p: [-358.1, 0.45, 45.6], l: [-352.6, 0.65, 47.2] }, 34, 33), { t0: 0, name: 'lights', focus: [-352, 47] }),
    S('C', 50.0, 2.5, (t, P) => { const v = P.hero; return { p: [-343.5, 0.75, 44.6], l: [v.x, 0.75, v.z], fov: 40, hand: 0.4 }; }, { t0: 2.0, name: 'launch', focus: [-360, 45] }),
    S('C', 52.5, 5.5, (t, P) => { const v = P.hero; return { p: [-389.2, 0.55, 34.6], l: [v.x, 0.6, v.z], fov: 44, hand: 0.25 }; }, { t0: 5.0, rate: (u) => (u < 0.08 ? 1 : u < 0.2 ? lerp(1, 0.28, smr(0.08, 0.2, u)) : u < 0.75 ? 0.28 : lerp(0.28, 1, smr(0.75, 0.95, u))), name: 'drift', focus: [-395, 38] }),
    S('C', 58.0, 3.0, (t, P, u) => { const v = P.pol1; return { p: L3([-410.6, 7.2, 30.5], [-410.0, 6.6, 32.2], sm(u)), l: [v.x * 0.7 - 398 * 0.3, 0.6, v.z * 0.7 + 36 * 0.3], fov: 46, hand: 0.35 }; }, { t0: 9.8, name: 'police corner', focus: [-398, 38] }),
    S('C', 61.0, 4.5, rigCam('hero', [4.6, 0.95, 0.8], [0, 0.75, 1.2], 40, { hand: 0.8 }), { t0: 12.6, name: 'tracking' }),
    S('C', 65.5, 3.0, rigCam('hero', [0.6, 0.55, 8.0], [0, 0.75, 0], 36, { hand: 0.7 }), { t0: 17.1, name: 'front' }),
    S('C', 68.5, 3.0, rigCam('hero', [3, 30, -16], [0, 0, 14], 50, { hand: 0.3 }), { t0: 20.1, name: 'aerial' }),
    S('C', 71.5, 3.0, dolly({ p: [-396.8, 1.4, -588.8], l: [-401, 1.1, -555] }, { p: [-397.2, 1.38, -587.9], l: [-401, 1.1, -555] }, 40, 37), { t0: 23.1, name: 'roadblock', focus: [-400, -575] }),
    S('C', 74.5, 3.5, (t, P, u) => { const s = P.shashika, j = jeepCentre(t); const dx = j[0] - s.x, dz = j[2] - s.z, d = Math.hypot(dx, dz), fx = dx / d, fz = dz / d; const rx = -fz, rz = fx; const k = sm(u) * 0.25;
      return { p: [s.x - fx * (2.3 - k) + rx * 0.75, 1.72, s.z - fz * (2.3 - k) + rz * 0.75], l: [j[0], 1.05, j[2]], fov: 38, hand: 0.5 }; }, { t0: 26.1, rate: 0.38, name: 'ambush', focus: [-412, -570] }),
    S('C', 78.0, 5.0, dolly({ p: [-390.6, 0.75, -590.0], l: [-402.5, 2.6, -576.5] }, { p: [-390.8, 0.8, -589.4], l: [-402.6, 2.8, -576.0] }, 44, 42), { t0: 27.45, rate: (u) => (u < 0.03 ? 0.9 : u < 0.75 ? lerp(0.9, 0.25, smr(0.03, 0.08, u)) : lerp(0.25, 1, smr(0.75, 1, u))), name: 'explosion', focus: [-400, -578] }),
    S('C', 83.0, 3.0, (t, P, u) => { const v = P.pol1; return { p: L3([-392.6, 1.3, -558.6], [-392.9, 1.28, -558.0], sm(u)), l: [v.x, 0.65, v.z], fov: 40, hand: 0.6 }; }, { t0: 29.0, name: 'spin', focus: [-400, -550] }),
    S('C', 86.0, 6.0, (t, P, u) => { const z = P.dineth.z; return { p: [-401.3, 1.0 + 0.05 * u, lerp(-599.6, -601.4, sm(u))], l: [-401.3, 1.42, z], fov: 36, hand: 0.35 }; }, { t0: 40.0, rate: 0.6, name: 'walk away', focus: [-400, -585] }),
    // FINALE
    S('F', 94.0, 8.0, dolly({ p: [150, 45, -640], l: [305, 140, -480] }, { p: [190, 40, -650], l: [305, 150, -480] }, 46, 44), { name: 'title' }),
  ];
  // the vehicle-tracking shots stream the city around the car
  for (const s of shots) if (!s.focus && s.scene === 'C') s.focusRig = 'hero';
  // precompute edit→sim tables
  for (const s of shots) {
    const N = 240, tab = new Float64Array(N + 1); let acc = 0; tab[0] = 0; const R = typeof s.rate === 'function' ? s.rate : () => s.rate;
    for (let i = 1; i <= N; i++) { const u0 = (i - 1) / N, u1 = i / N; acc += ((R(u0) + R(u1)) / 2) * (s.dur / N); tab[i] = acc; }
    s.simTab = tab; s.simLen = acc;
    s.simAt = (e) => { const u = clamp(e / s.dur, 0, 1) * N, i = Math.min(N - 1, Math.floor(u)); return s.t0 + lerp(tab[i], tab[i + 1], u - i); };
    s.rateAt = (e) => R(clamp(e / s.dur, 0, 1));
  }

  // ---------------------------------------------------------------- picture & words (edit time)
  // black: [from, fullAt, holdTo, clearAt] — fades through black between scenes
  const black = [[-1, -1, 0.6, 2.4], [6.9, 7.45, 7.5, 7.9], [11.5, 11.95, 12.0, 12.35], [16.0, 16.45, 16.5, 16.85], [20.5, 20.95, 21.0, 21.4],
    [25.92, 26.0, 27.0, 27.0], [40.5, 40.5, 41.5, 41.5], [46.0, 46.0, 48.0, 48.25], [92.0, 92.0, 94.0, 95.6], [101.0, 101.9, 120, 120]];
  const texts = [
    { kind: 'vo', a: 2.4, b: 6.6, who: '', text: 'They sell this city on postcards.' },
    { kind: 'vo', a: 8.0, b: 11.4, who: '', text: 'Sunsets on the green. Temple bells. Tea with a smile.' },
    { kind: 'vo', a: 12.6, b: 15.9, who: '', text: 'But when the lights go out…' },
    { kind: 'vo', a: 17.0, b: 20.4, who: '', text: '…Colombo shows you who it really is.' },
    { kind: 'card', a: 26.0, b: 27.0, text: 'THREE MEN.' },
    { kind: 'name', a: 27.6, b: 31.3, text: 'DINETH', sub: 'THE DRIVER' },
    { kind: 'name', a: 32.0, b: 35.8, text: 'SHASHIKA', sub: 'THE MUSCLE' },
    { kind: 'name', a: 36.5, b: 40.3, text: 'DAVID', sub: 'THE BRAINS' },
    { kind: 'vo', a: 37.4, b: 40.3, who: 'David', text: 'Everyone in this city has a price.' },
    { kind: 'card', a: 40.5, b: 41.5, text: 'ONE CITY.' },
    { kind: 'vo', a: 42.2, b: 45.8, who: 'Dineth', text: 'We do this once. We do it right.' },
    { kind: 'card', a: 46.0, b: 48.0, text: 'NO WAY BACK.' },
    { kind: 'vo', a: 48.15, b: 50.0, who: 'David (radio)', text: 'Police are two minutes out.' },
    { kind: 'vo', a: 50.1, b: 52.4, who: 'Dineth', text: 'Then let’s not waste them.' },
    { kind: 'vo', a: 74.8, b: 77.6, who: 'Shashika', text: 'Keep your heads down.' },
    { kind: 'vo', a: 92.5, b: 93.9, who: 'Dineth', text: 'Welcome to Colombo.' },
    { kind: 'title', a: 94.3, b: 101.6 },
    { kind: 'logo', a: 102.4, b: 108.6 },
  ];
  const flashes = [26.0, 48.0, 78.05, 94.0];
  return { LENGTH, scenes, shots, texts, black, flashes, H, Q, sRB, tE, rigsC, pedsC, rigsB, pedsB };
}

// shot at edit time e (the last shot holds until the end)
export function shotAt(plan, e) { let cur = plan.shots[0]; for (const s of plan.shots) if (e >= s.start) cur = s; return cur; }
// black overlay opacity at edit time e
export function blackAt(plan, e) {
  for (const [a, b, c, d] of plan.black) { if (e < a || e > d) continue; if (e < b) return sm((e - a) / Math.max(1e-3, b - a)); if (e <= c) return 1; return 1 - sm((e - c) / Math.max(1e-3, d - c)); }
  return 0;
}
// all rig poses of a scene at sim time t
export function posesAt(scene, t) { const P = {}; for (const [id, r] of Object.entries(scene.rigs)) P[id] = r.pose(t); for (const [id, r] of Object.entries(scene.peds)) P[id] = r.pose(t); return P; }
// edit time of each shot's sim-time window (for the test and the score)
export function simRange(shot) { return [shot.t0, shot.t0 + shot.simLen]; }
// edit time at which a scene's sim time t is first on screen (null if never shown): the score lands its hits on these
export function editTimeOf(plan, scene, t) {
  for (const s of plan.shots) { if (s.scene !== scene || t < s.t0 || t > s.t0 + s.simLen) continue; let lo = 0, hi = s.dur; for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (s.simAt(m) < t) lo = m; else hi = m; } return s.start + (lo + hi) / 2; }
  return null;
}
export const _util = { clamp, lerp, sm, smr, wrap };
