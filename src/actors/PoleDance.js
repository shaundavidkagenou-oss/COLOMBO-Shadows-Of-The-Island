// Pole dancing for the club dancers (world/Club.js). Original procedural choreography built from standard pole-dance
// fundamentals — no motion capture or animation from any other game:
//   walk    the slow catwalk "pole walk" on heels round the pole, inside hand on the pole, outside arm extended
//   spin    a fireman spin: both hands on the pole, knees tucked, the body swings round it and lands
//   hook    a front hook spin: inside knee hooked round the pole, outside leg extended
//   wave    body waves facing the pole, both hands up on it, with a slow dip
//   slide   back to the pole, arms up behind: slide down into a knees-together side crouch and roll back up
//   pose    a contrapposto pose beside the pole, the free hand runs up through the hair and sweeps out
// Every hand on the pole is solved with two-bone arm IK onto the pole surface (palm facing it, thumb along it), every
// foot with two-bone leg IK onto the stage, standing on the platform heels of the outfit (Character.heelFit). Moves
// cross-fade on a pose vector, so nothing snaps; walks before facing moves are sized so the dancer ends up facing the
// audience (or a tipping customer) without sliding round the pole.
import * as THREE from 'three';
import { solveArmIK, heelFit } from './Character.js';

const TAU = Math.PI * 2;
const sm = (x) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
const seg = (t, a, b) => Math.max(0, Math.min(1, (t - a) / (b - a)));
const bump = (t, a, b, c, d) => sm(seg(t, a, b)) * (1 - sm(seg(t, c, d))); // 0 → 1 (a..b) … 1 → 0 (c..d)
const lerp = (a, b, t) => a + (b - a) * t;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
export const POLE_R = 0.0225; // 45 mm stage pole
const FADE = { walk: 0.8, spin: 0.6, hook: 0.6, wave: 1.0, slide: 1.0, pose: 0.9 }; // cross-fade into each move (s)

// ---------------------------------------------------------------- pose vector helpers
function blendPose(A, B, k, arc = null, path = '') { // same shape; angles named *yaw blend on the short arc (arc(): kept on one arc for a whole fade)
  const out = {};
  for (const key in B) {
    const a = A[key], b = B[key]; if (a === undefined) { out[key] = b; continue; }
    if (typeof b === 'number') out[key] = /yaw$/i.test(key) ? a + (arc ? arc(path + key, a, b) : wrap(b - a)) * k : lerp(a, b, k);
    else if (Array.isArray(b)) out[key] = b.map((v, i) => lerp(a[i], v, k));
    else if (b && typeof b === 'object') out[key] = blendPose(a, b, k, arc, path + key + '.');
    else out[key] = k < 0.5 ? a : b;
  }
  return out;
}
const norm3 = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };

// ---------------------------------------------------------------- the dancer
export class PoleDancer {
  // ch: Character (wearing heels); pole: { x, z, y0 (stage top), y1 } in the parent group's space; opts: { seed, audience: [x, z] }
  constructor(ch, pole, opts = {}) {
    this.ch = ch; ch.poleDancer = this; this.pole = pole; this.seed = opts.seed || 1; this.rnd = mulberry(this.seed * 977 + 13);
    this.audience = opts.audience || [pole.x, pole.z + 5]; this.name = opts.name || 'Dancer';
    const sp = ch.spec, s = sp.height / 1.72; this.s = s; this.hf = heelFit(sp);
    this.H = ch.hipY + (this.hf.ankleH - 0.085 * s) - 0.012 * s; // pelvis height standing on the heels, knees soft
    // arm length relative to the body the moves were designed on (shoulder → wrist ≈ 0.532·s): grip heights are rescaled about
    // the shoulder so a shorter-armed body still reaches the pole (1 for the crowd body)
    const bl = (n) => ch.bones[n]?.position.length() || 0; this.armK = Math.min(1.12, (bl('foreL') + bl('handL')) / (0.532 * s)) || 1;
    this.t = 0; this.phi = this.rnd() * TAU; this.dir = this.rnd() < 0.5 ? 1 : -1; this.queue = []; this.move = null; this.prev = null; this.fadeT = 1;
    this.attn = null; this.look = null; this.smileT = 2 + this.rnd() * 6; this.cur = null; this.tips = 0;
    this.lastPose = null; this.debug = { reach: [0, 0], floor: 0 };
    ch.anim.postPose = (b, dt) => this.apply(b, dt); this.elb = {}; this.kn = {}; // last elbow / knee directions (limb-parent space): keep the IK continuous
    this.next();
  }
  // a customer tipped: she turns to them for the next couple of moves and smiles
  tipped(x, z, amount) { this.attn = { x, z, t: 16 }; this.tips += amount; this.ch.face?.set('smile', 3); }
  get facingTarget() { const a = this.attn ? [this.attn.x, this.attn.z] : this.audience; return Math.atan2(a[0] - this.pole.x, a[1] - this.pole.z); }
  // ---------------------------------------------------------------- sequencing
  next() {
    const prev = this.move; const r = this.rnd;
    if (prev) { this.phi = prev.phiEnd ?? this.phi; }
    let kind;
    if (!prev) kind = 'walk';
    else if (prev.kind !== 'walk') kind = 'walk';
    else if (prev.then) kind = prev.then;
    else { const pool = ['spin', 'hook', 'wave', 'slide', 'pose', 'spin', 'slide', 'pose'].filter((k) => k !== this.lastKind); kind = pool[Math.floor(r() * pool.length)]; }
    if (kind === 'walk' && prev && prev.kind !== 'walk') { // after a move: walk on, and maybe straight into a facing move
      if (prev.kind === 'wave' || prev.kind === 'slide' || prev.kind === 'pose') this.dir = r() < 0.5 ? 1 : -1;
      const pool = ['spin', 'hook', 'wave', 'slide', 'pose', 'spin', 'pose', 'slide'].filter((k) => k !== prev.kind && k !== this.lastKind);
      let then = this.attn ? (r() < 0.6 ? 'pose' : 'slide') : pool[Math.floor(r() * pool.length)];
      this.move = this.makeWalk(then); this.lastKind = prev.kind;
    } else if (kind === 'walk') this.move = this.makeWalk(null);
    else this.move = this.makeMove(kind);
    this.move.t0 = this.t; this.prev = prev; this.fadeT = 0;
  }
  makeWalk(then) {
    const R0 = 0.5, step = 0.36 / R0; let n; let target = null;
    const faceAng = this.facingTarget; // where the next move must face
    if (then === 'slide') target = faceAng; else if (then === 'pose') target = faceAng - this.dir * (Math.PI / 2 - 0.5); else if (then === 'wave') target = faceAng + Math.PI;
    let delta;
    if (target != null) { delta = ((this.dir * (target - this.phi)) % TAU + TAU) % TAU; if (delta < 2.2) delta += TAU; }
    else delta = step * (6 + Math.floor(this.rnd() * 6));
    n = Math.max(3, Math.round(delta / step)); if (n % 2) n++; // even: ends on the same foot it started with
    const d = delta / n; const T = 0.6;
    return { kind: 'walk', dur: n * T, n, d, T, R0, phi0: this.phi, phiEnd: this.phi + this.dir * delta, dir: this.dir, then, target };
  }
  makeMove(kind) {
    const dir = this.dir, phi0 = this.phi;
    if (kind === 'spin') { const D = TAU * (0.8 + 0.15 * this.rnd()); return { kind, dur: 3.2, phi0, D, phiEnd: phi0 + dir * D, dir }; }
    if (kind === 'hook') { const D = TAU * (0.7 + 0.15 * this.rnd()); return { kind, dur: 3.0, phi0, D, phiEnd: phi0 + dir * D, dir }; }
    if (kind === 'wave') return { kind, dur: 6.0, phi0, phiEnd: phi0, dir };
    if (kind === 'slide') return { kind, dur: 7.2, phi0, phiEnd: phi0, dir, side: this.rnd() < 0.5 ? 1 : -1 };
    return { kind: 'pose', dur: 4.8, phi0, phiEnd: phi0, dir };
  }
  // ---------------------------------------------------------------- per frame
  update(dt) {
    this.t += dt; if (this.attn && (this.attn.t -= dt) <= 0) this.attn = null;
    if ((this.smileT -= dt) <= 0) { this.smileT = 5 + this.rnd() * 9; this.ch.face?.set('smile', 2.2 + this.rnd() * 2); }
    const M = this.move; if (this.t - M.t0 >= M.dur) this.next();
    const m = this.move, lt = this.t - m.t0; this.fadeT = Math.min(1, lt / FADE[m.kind]);
    let P = this.pose(m, lt);
    if (this.fadeT < 1 && this.prev) P = this.blend(this.pose(this.prev, this.prev.dur), P, sm(this.fadeT));
    this.cur = P;
    const r = this.ch.root; r.position.set(P.rx, this.pole.y0, P.rz); r.rotation.set(0, P.yaw, 0);
    this.ch.anim.update(dt, 0);
  }
  // Cross-fade two poses. The root goes round the pole in polar coordinates (stepping in towards the pole only once she has
  // mostly turned, so the body never sweeps through it) and a hand that stays on the pole slides round its surface rather
  // than cutting through it.
  blend(A, B, k) {
    // angle differences are unwrapped against the previous frame of the same fade: as the incoming move travels on, the
    // blend never switches to the other way round (which would jump the body or a hand across)
    const fd = this._fd && this._fd.t0 === this.move.t0 ? this._fd : (this._fd = { t0: this.move.t0, d: {} });
    const arc = (key, a, b) => { let d = wrap(b - a); const p = fd.d[key]; if (p !== undefined) d += TAU * Math.round((p - d) / TAU); fd.d[key] = d; return d; };
    const out = blendPose(A, B, k, arc); const px = this.pole.x, pz = this.pole.z;
    const rA = Math.hypot(A.rx - px, A.rz - pz), rB = Math.hypot(B.rx - px, B.rz - pz), aA = Math.atan2(A.rx - px, A.rz - pz), aB = Math.atan2(B.rx - px, B.rz - pz);
    const r = lerp(rA, rB, rB < rA ? k * k : k), an = aA + arc('root', aA, aB) * k; out.rx = px + Math.sin(an) * r; out.rz = pz + Math.cos(an) * r;
    for (const S of ['L', 'R']) { const ha = A.h[S], hb = B.h[S], off = POLE_R + 0.021;
      if (!ha.grip !== !hb.grip) { // taking hold of the pole / letting go: the hand keeps clear of the pole until it closes on it
        // the hand turns to its grip orientation early (palm to the pole), then closes in radially
        const kg = hb.grip ? k : 1 - k, G = hb.grip ? hb : ha, F = hb.grip ? ha : hb, h = out.h[S]; h.grip = kg > 0.98 ? 1 : 0;
        const ko = sm(Math.min(1, kg / 0.6)); const n = norm3(F.n.map((v, i) => lerp(v, G.n[i], ko))); let up = F.up.map((v, i) => lerp(v, G.up[i], ko));
        const dn = up[0] * n[0] + up[1] * n[1] + up[2] * n[2]; up = norm3(up.map((v, i) => v - dn * n[i])); h.n = n; h.up = up;
        const fing = S === 'L' ? cross(up, n) : cross(n, up); const need = off + 0.1 * (1 - kg);
        // path: free position → 12 cm out along the grip's radial line → in to the grip (so it never wraps round the pole)
        const gr = norm3([G.pc[0] - px, 0, G.pc[2] - pz]), ap = [G.pc[0] + gr[0] * 0.12, G.pc[1], G.pc[2] + gr[2] * 0.12];
        if (kg < 0.75) { // free position ↔ approach point; where the straight line comes near the pole it is pushed out round it
          h.pc = F.pc.map((v, i) => lerp(v, ap[i], sm(kg / 0.75))); const qx = h.pc[0] - px, qz = h.pc[2] - pz, ql = Math.hypot(qx, qz), rMin = off + 0.1;
          if (ql < rMin) { const a = ql > 1e-4 ? Math.atan2(qx, qz) : Math.atan2(out.rx - px, out.rz - pz); h.pc[0] = px + Math.sin(a) * rMin; h.pc[2] = pz + Math.cos(a) * rMin; }
        } else h.pc = ap.map((v, i) => lerp(v, G.pc[i], sm((kg - 0.75) / 0.25)));
        const dx = h.pc[0] - px, dz = h.pc[2] - pz, dl = Math.hypot(dx, dz);
        if (dl < need && dl > 1e-6) { const e = need / dl - 1; h.pc[0] += dx * e; h.pc[2] += dz * e; }
        h.p = h.pc.map((v, i) => v - fing[i] * 0.05 * this.s * kg);
        continue; }
      if (!(ha.grip && hb.grip)) continue; const s = this.s;
      const ga = Math.atan2(ha.pc[0] - px, ha.pc[2] - pz), gb = Math.atan2(hb.pc[0] - px, hb.pc[2] - pz), g = ga + arc('g' + S, ga, gb) * k, y = lerp(ha.pc[1], hb.pc[1], k);
      const pc = [px + Math.sin(g) * off, y, pz + Math.cos(g) * off]; const fa = ha.pc.map((v, i) => (v - ha.p[i]) / (0.05 * s)), fb = hb.pc.map((v, i) => (v - hb.p[i]) / (0.05 * s));
      const n = [-Math.sin(g), 0, -Math.cos(g)]; let f = fa.map((v, i) => lerp(v, fb[i], k)); const fn = f[0] * n[0] + f[2] * n[2]; f = norm3([f[0] - fn * n[0], f[1], f[2] - fn * n[2]]);
      // a big change of grip (round the pole, along it, or turning the hand over) is a release and re-grab: the palm lifts
      // straight off the pole, travels round it clear of the surface and comes back in along the new grip's radial line
      const turn = Math.acos(Math.max(-1, Math.min(1, (fa[0] * fb[0] + fa[1] * fb[1] + fa[2] * fb[2]) / (Math.hypot(...fa) * Math.hypot(...fb) || 1))));
      const big = Math.min(1, (Math.abs(wrap(gb - ga)) + 2 * Math.abs(hb.pc[1] - ha.pc[1]) + 0.6 * turn) / 0.5);
      if (big > 0.05) { // go round the side of the pole nearer her body (the arm reaches round the near side, never across the far one)
        const ra2 = Math.atan2(out.rx - px, out.rz - pz); let dg = wrap(gb - ga); const alt = dg > 0 ? dg - TAU : dg + TAU;
        const far = wrap(ra2 + Math.PI - ga); if (dg > 0 ? far > 0 && far < dg : far < 0 && far > dg) dg = alt; // the short way passes behind the pole: go the other way
        { const key = 'dg' + S, p = fd.d[key]; if (p !== undefined && Math.abs(dg - p) > Math.PI) dg = p; fd.d[key] = dg; } // decided once per fade
        const kt = sm(seg(k, 0.3, 0.7)), g2 = ga + dg * kt, lift = 0.1 * big * (k < 0.3 ? sm(k / 0.3) : k > 0.7 ? 1 - sm((k - 0.7) / 0.3) : 1);
        pc[0] = px + Math.sin(g2) * (off + lift); pc[2] = pz + Math.cos(g2) * (off + lift); pc[1] = lerp(ha.pc[1], hb.pc[1], kt); n[0] = -Math.sin(g2); n[2] = -Math.cos(g2);
        f = fa.map((v, i) => lerp(v, fb[i], kt)); const fn2 = f[0] * n[0] + f[2] * n[2]; f = norm3([f[0] - fn2 * n[0], f[1], f[2] - fn2 * n[2]]); }
      const h = out.h[S]; h.pc = pc; h.n = n; h.p = pc.map((v, i) => v - f[i] * 0.05 * s); h.grip = big > 0.05 && k > 0.05 && k < 0.95 ? 0 : 1;
      let up = h.up; const d = up[0] * f[0] + up[1] * f[1] + up[2] * f[2]; up = [up[0] - d * f[0], up[1] - d * f[1], up[2] - d * f[2]]; const e = up[0] * n[0] + up[2] * n[2]; h.up = norm3([up[0] - e * n[0], up[1], up[2] - e * n[2]]); }
    return out;
  }
  // body frame (root at (rx, rz) facing yaw) → parent-group coordinates; y is absolute (stage top = pole.y0)
  B(P, bx, by, bz) { const c = Math.cos(P.yaw), s = Math.sin(P.yaw); return [P.rx + bx * c + bz * s, this.pole.y0 + by, P.rz - bx * s + bz * c]; }
  dirB(P, bx, by, bz) { const c = Math.cos(P.yaw), s = Math.sin(P.yaw); return [bx * c + bz * s, by, -bx * s + bz * c]; }
  // A hand on the pole at height h (above the stage). The (mitten) hand continues the forearm line from the shoulder, the
  // palm pressed flat on the pole and the fingers wrapping round it: palm normal n is horizontal and ⟂ to that line, thumb
  // up or down — whichever keeps the hand on its own side of the pole (a left hand never reaches round to the right of it).
  // The shoulder is estimated from the posture already set in P (hip, hr, sp, ch), so call this after the posture lines.
  grip(h, side, P) {
    const px = this.pole.x, pz = this.pole.z, s = this.s, sx = side === 'L' ? 1 : -1;
    const lean = P.hr[0] + P.sp[0] + P.ch[0], tw = P.hr[1] + P.sp[1] + P.ch[1], Ls = 0.46 * s, w = 0.175 * s;
    const sh = this.B(P, P.hip[0] + sx * w * Math.cos(tw), P.hip[1] + Ls * Math.cos(lean), P.hip[2] + Ls * Math.sin(lean) - sx * w * Math.sin(tw));
    const shY = sh[1] - this.pole.y0; h = shY + (h - shY) * (this.armK || 1);
    const bx = this.dirB(P, 1, 0, 0), y = this.pole.y0 + h, off = POLE_R + 0.025; let best = null;
    for (const uy of [1, -1]) {
      let a = norm3([px - sh[0], y - sh[1], pz - sh[2]]), n = null, pc = null;
      for (let it = 0; it < 3; it++) { const ah = norm3([a[0], 0, a[2]]); n = side === 'L' ? cross(ah, [0, uy, 0]) : cross([0, uy, 0], ah);
        pc = [px - n[0] * off, y, pz - n[2] * off]; a = norm3([pc[0] - sh[0], pc[1] - sh[1], pc[2] - sh[2]]); }
      const lat = (pc[0] - px) * bx[0] + (pc[2] - pz) * bx[2];
      const fing = a; let up = [0, uy, 0]; const d = up[1] * fing[1]; up = norm3([-d * fing[0], uy - d * fing[1], -d * fing[2]]);
      const c = { p: [pc[0] - fing[0] * 0.05 * s, pc[1] - fing[1] * 0.05 * s, pc[2] - fing[2] * 0.05 * s], n, up, el: this.dirB(P, sx * 0.6, -0.8, -0.1), grip: 1, pc, lat };
      if (!best || sx * lat > sx * best.lat + 1e-4) best = c; }
    delete best.lat; return best;
  }
  radial(phi) { return [Math.sin(phi), 0, Math.cos(phi)]; }
  lookYaw(P, tx, tz) { const a = Math.atan2(tx - P.rx, tz - P.rz); return Math.max(-1.1, Math.min(1.1, wrap(a - P.yaw))); }
  // ---------------------------------------------------------------- choreography
  base(P) { // neutral fields shared by every move
    return Object.assign(P, { hip: [0, this.H, 0], hr: [0, 0, 0], sp: [0, 0, 0], ch: [0, 0, 0], nk: [0, 0, 0], hd: [0, 0, 0] });
  }
  pose(m, t) {
    const s = this.s, px = this.pole.x, pz = this.pole.z, H = this.H; const hf = this.hf;
    const P = this.base({ rx: 0, rz: 0, yaw: 0 }); const dir = m.dir, side = dir > 0 ? 'L' : 'R', oside = dir > 0 ? 'R' : 'L';
    const lookAt = this.attn ? [this.attn.x, this.attn.z] : this.audience;
    let fIn, fOut, hIn, hOut; // inner (pole-side) / outer limbs
    if (m.kind === 'walk') {
      const { T, d, R0, phi0 } = m; const tt = Math.min(t, m.dur - 1e-4); const i = Math.floor(tt / T), u = tt / T - i;
      const phi = phi0 + dir * d * (tt / T); P.rx = px + Math.sin(phi) * R0; P.rz = pz + Math.cos(phi) * R0; P.yaw = phi + dir * Math.PI / 2;
      const tan = (a) => [Math.cos(a) * dir, 0, -Math.sin(a) * dir]; // travel direction at angle a
      const plant = (a, k, lift, pt) => { const rr = R0 + (k === 0 ? 0.03 : -0.03); const tg = tan(a); const ra = this.radial(a);
        return { p: [px + ra[0] * rr + tg[0] * 0.05, this.pole.y0 + lift, pz + ra[2] * rr + tg[2] * 0.05], yaw: Math.atan2(tg[0], tg[2]) + (k === 0 ? dir : -dir) * 0.1, pitch: pt, knee: norm3([tg[0], 0.25, tg[2]]) }; };
      const feet = [0, 1].map((k) => { const swing = (i + k) % 2 === 0; // k 0 = inner foot
        if (!swing) return plant(phi0 + dir * d * (i + 0.5), k, 0, hf.pitch);
        const us = sm(u); const a = phi0 + dir * d * (i - 0.5 + 2 * us); const lift = 0.075 * Math.sin(Math.PI * u);
        return plant(a, k, lift, hf.pitch + 0.42 * Math.sin(Math.PI * u)); });
      fIn = feet[0]; fOut = feet[1];
      const sw = Math.sin(Math.PI * tt / T), cw = Math.cos(Math.PI * tt / T);
      P.hip = [-dir * 0.035 * sw, H - 0.012 + 0.01 * Math.abs(sw), 0.0]; P.hr = [0.02, dir * 0.13 * cw, -dir * 0.1 * sw];
      P.sp = [-0.05, -0.5 * P.hr[1], 0.5 * dir * 0.1 * sw - dir * 0.05]; P.ch = [-0.07, -0.45 * P.hr[1], 0.3 * dir * 0.1 * sw]; P.nk = [0.02, 0, 0];
      const ra = this.radial(phi); hIn = this.grip(1.6 * s + 0.06, side, P); hIn.el = norm3([ra[0], -0.8, ra[2]]);
      const k2 = Math.sin(TAU * tt / (4 * T)); const outX = -dir * 0.46 * s; hOut = { p: this.B(P, outX, 1.04 * s + 0.12 * k2, 0.1 + 0.08 * k2), n: [0, -1, 0], up: this.dirB(P, 0, 0, 1), el: this.dirB(P, -dir * 0.2, -0.4, -1) };
      P.hd = [0.05, 0, 0]; const ly = this.lookYaw(P, lookAt[0], lookAt[1]); P.nk[1] = ly * 0.45; P.hd[1] = ly * 0.45;
    } else if (m.kind === 'spin' || m.kind === 'hook') {
      const hook = m.kind === 'hook'; const D = m.D; const T = m.dur;
      const prep = sm(seg(t, 0, 0.55)), air = bump(t, 0.55, 0.85, T - 0.95, T - 0.55), land = seg(t, T - 0.95, T);
      // angle: slow while stepping in, fast in the air (easing out), settling on landing
      const prog = 0.08 * seg(t, 0, 0.55) + 0.84 * sm(seg(t, 0.55, T - 0.6) ** 0.8) + 0.08 * seg(t, T - 0.6, T);
      const phi = m.phi0 + dir * D * prog; const rIn = hook ? 0.32 : 0.36; const r = lerp(lerp(0.5, rIn, prep), 0.5, sm(land));
      P.rx = px + Math.sin(phi) * r; P.rz = pz + Math.cos(phi) * r; P.yaw = phi + dir * Math.PI / 2 - dir * 0.3 * air;
      const ra = this.radial(phi);
      const tuckY = H + 0.05 * air - 0.44 - 0.04 * air; // feet tucked under the hips, well above the stage
      const stand = (k) => { const bx = (k === 0 ? dir : -dir) * 0.1; const q = this.B(P, bx, 0, 0.04); return { p: q, yaw: P.yaw + (k === 0 ? dir : -dir) * 0.12, pitch: hf.pitch, knee: norm3(this.dirB(P, 0, 0.3, 1)) }; };
      const tuck = (k) => { let q; let pitch = 1.15; let knee = this.dirB(P, 0, 0.5, 1);
        if (!hook) q = this.B(P, (k === 0 ? dir : -dir) * 0.04, tuckY + (k === 0 ? 0.03 : 0), 0.24 + (k === 0 ? 0.02 : 0));
        else if (k === 0) { q = this.B(P, dir * 0.02, 0.5 * s, -0.12); knee = norm3(this.dirB(P, dir, 0.2, 0.5)); pitch = 0.9; } // hooked: thigh passes IN FRONT of the pole (knee toward it and forward), so the pole sits in the knee pit and the calf wraps behind it
        else { q = this.B(P, -dir * 0.18, 0.32 * s, 0.5); pitch = 1.25; knee = this.dirB(P, -dir * 0.3, 0.6, 0.6); } // outside leg long and pointed
        return { p: q, yaw: P.yaw, pitch, knee: norm3(knee) }; };
      const kAir = sm(seg(t, 0.45, 0.8)) * (1 - sm(seg(t, T - 0.85, T - 0.5)));
      fIn = blendPose(stand(0), tuck(0), kAir); fOut = blendPose(stand(1), tuck(1), kAir);
      const absorb = bump(t, T - 0.75, T - 0.5, T - 0.4, T - 0.05) * 0.08;
      P.hip = [0, H - 0.03 * air - absorb + 0.03 * bump(t, 0.4, 0.55, 0.6, 0.8), 0]; P.hr = [hook ? -0.1 * air : -0.25 * air, 0, 0];
      P.sp = [-0.06 * air, 0, dir * 0.16 * air]; P.ch = [-0.12 * air, 0, dir * 0.08 * air]; P.nk = [-0.1 * air, 0, 0]; P.hd = [-0.15 * air, 0, dir * 0.12 * air];
      const ly = this.lookYaw(P, lookAt[0], lookAt[1]) * (1 - air); P.nk[1] += ly * 0.45; P.hd[1] += ly * 0.45;
      // hands: the inner one slides up high for the swing and back down for the landing; the outer one reaches across lower
      const up = sm(seg(t, 0, 0.5)) * (1 - sm(seg(t, T - 1.15, T - 0.45)));
      hIn = this.grip(lerp(1.6 * s + 0.06, (hook ? 1.96 : 1.9) * s, up), side, P); hIn.el = norm3([ra[0], -0.6, ra[2]]);
      const low = this.grip(lerp(1.45 * s, hook ? 1.2 * s : 1.36 * s, up), oside, P); low.el = this.dirB(P, -dir * 0.3, -0.6, 0.5);
      const freeOut = { p: this.B(P, -dir * 0.45 * s, 1.05 * s, 0.12), n: [0, -1, 0], up: this.dirB(P, 0, 0, 1), el: this.dirB(P, -dir * 0.2, -0.4, -1), grip: 0 }; freeOut.pc = freeOut.p;
      const gk = bump(t, 0.3, 0.65, T - 1.05, T - 0.6); /* takes hold once the fade-in (0.6 s) is over */ hOut = blendPose(freeOut, low, gk); hOut.grip = gk > 0.98 ? 1 : 0;
    } else if (m.kind === 'wave') {
      const phi = m.phi0; const r = 0.38; P.rx = px + Math.sin(phi) * r; P.rz = pz + Math.cos(phi) * r; P.yaw = phi + Math.PI;
      const g = sm(seg(t, 0, 0.6)) * (1 - sm(seg(t, m.dur - 0.5, m.dur)));
      const ph = TAU * t / 1.2, drop = 0.16 * s * bump(t, 2.4, 3.3, 4.2, 5.4);
      const a = 0.16 * g;
      P.ch = [a * Math.sin(ph) + drop * 0.6, 0, 0]; P.sp = [a * 0.6 * Math.sin(ph - 0.9) + drop * 0.5, 0, 0.04 * Math.sin(ph / 2) * g];
      P.hip = [0.02 * Math.sin(ph / 2) * g, H - 0.022 - 0.03 * (0.5 + 0.5 * Math.sin(ph - 2.4)) * g - drop, 0.04 * Math.sin(ph - 1.8) * g - drop * 0.6];
      P.hr = [-0.12 * Math.sin(ph - 1.8) * g - drop * 0.4, 0.05 * Math.sin(ph / 2) * g, 0.06 * Math.sin(ph / 2) * g];
      P.nk = [-0.5 * P.ch[0], 0, 0]; P.hd = [-0.25 * P.ch[0] - 0.08 * g, 0.12 * Math.sin(ph / 4) * g, 0.1 * Math.sin(ph / 2) * g];
      const ft = (k) => { const bx = k * 0.115, q = this.B(P, bx, 0, 0.03); return { p: q, yaw: P.yaw + k * 0.16, pitch: hf.pitch, knee: norm3(this.dirB(P, k * 0.12, 0.2, 1)) }; };
      fIn = ft(dir > 0 ? 1 : -1); fOut = ft(dir > 0 ? -1 : 1);
      // both hands up the pole; they slide down with her through the dip
      hIn = this.grip(lerp(1.6 * s, 1.72 * s, g) - drop * 2, 'L', P); hIn.el = this.dirB(P, 0.7, -0.6, 0);
      hOut = this.grip(lerp(1.48 * s, 1.6 * s, g) - drop * 2, 'R', P); hOut.el = this.dirB(P, -0.7, -0.6, 0);
      if (side === 'R') { const tmp = hIn; hIn = hOut; hOut = tmp; }
    } else if (m.kind === 'slide') {
      const phi = m.phi0; const r = 0.235; P.rx = px + Math.sin(phi) * r; P.rz = pz + Math.cos(phi) * r; P.yaw = phi; // back to the pole, facing out
      const T = m.dur; const sd = m.side;
      const down = sm(seg(t, 1.2, 3.6)) * (1 - sm(seg(t, 4.8, 6.9))); // slide down / roll back up
      const roll = bump(t, 4.8, 5.5, 6.2, 6.9); // hips lead the way up, chest follows
      const g = sm(seg(t, 0, 0.6)) * (1 - sm(seg(t, T - 0.5, T)));
      const circ = bump(t, 0, 0.4, 1.0, 1.4) + bump(t, 3.4, 3.8, 4.5, 4.9) * 0.6; const ca = TAU * t / 1.2;
      const lowY = 0.52 * s; const hy = lerp(H - 0.015, lowY, down);
      P.hip = [0.03 * Math.sin(ca) * circ + sd * 0.04 * down, hy, 0.03 * Math.cos(ca) * circ + 0.1 * down + 0.04 * roll];
      P.hr = [0.06 * down + 0.16 * roll, sd * 0.35 * down, 0.08 * Math.sin(ca) * circ];
      P.sp = [-0.04 + 0.12 * down + 0.04 * roll, -sd * 0.18 * down, 0]; P.ch = [-0.05 + 0.05 * down - 0.04 * roll - 0.08 * bump(t, 5.6, 6.3, 6.6, 7.0), -sd * 0.12 * down, 0];
      P.nk = [0.04 - 0.12 * roll, sd * 0.1 * down, 0]; P.hd = [-0.06 + 0.12 * Math.sin(TAU * t / 2.4) * bump(t, 3.6, 4.0, 4.6, 5.0), 0, 0.12 * Math.sin(TAU * t / 2.4) * bump(t, 3.4, 3.8, 4.6, 5.0)];
      const knA = sd * 0.75 * down; // knees together, turned to one side
      const ftf = (k) => { const bx = k * 0.1 + sd * 0.06 * down - k * 0.04 * down, q = this.B(P, bx, 0, 0.12 + 0.06 * down); return { p: q, yaw: P.yaw + k * 0.12 * (1 - down) + knA * 0.7, pitch: hf.pitch + 0.15 * down, knee: norm3(this.dirB(P, Math.sin(knA) + k * 0.1 * (1 - down), 0.25, Math.cos(knA))) }; };
      fIn = ftf(dir > 0 ? 1 : -1); fOut = ftf(dir > 0 ? -1 : 1);
      const ly = this.lookYaw(P, lookAt[0], lookAt[1]) * (1 - down * 0.5); P.nk[1] += ly * 0.4; P.hd[1] += ly * 0.4;
      // arms up behind the head on the pole; the hands slide down and up with her shoulders
      const shY = hy + 0.46 * s; const hh = shY + 0.3 * s, hh2 = hh - 0.08;
      const gL = this.grip(lerp(1.5 * s, hh, g), 'L', P); gL.el = this.dirB(P, 0.8, 0.15, 0.3);
      const gR = this.grip(lerp(1.42 * s, hh2, g), 'R', P); gR.el = this.dirB(P, -0.8, 0.15, 0.3);
      hIn = side === 'L' ? gL : gR; hOut = side === 'L' ? gR : gL;
    } else { // pose: contrapposto beside the pole, the free hand through the hair
      const phi = m.phi0; const r = 0.42; P.rx = px + Math.sin(phi) * r; P.rz = pz + Math.cos(phi) * r; P.yaw = phi + dir * (Math.PI / 2 - 0.5);
      const ra = this.radial(phi); const T = m.dur;
      const sway = Math.sin(TAU * t / 2.4) * bump(t, 3.4, 3.8, T - 0.4, T);
      const wIn = dir; // body-x sign of the inner (pole) side
      P.hip = [wIn * 0.05 - wIn * 0.06 * Math.max(0, -sway), H - 0.02, 0.01]; P.hr = [0.02, -wIn * 0.12, wIn * 0.12 * (1 - 1.6 * Math.max(0, -sway)) + 0.04 * sway];
      P.sp = [-0.06, wIn * 0.08, -wIn * 0.06]; P.ch = [-0.1, wIn * 0.06, -wIn * 0.04];
      const hair = bump(t, 0.2, 1.4, 2.4, 3.2), back = bump(t, 1.2, 1.8, 2.4, 2.9);
      P.nk = [-0.15 * back, 0, wIn * 0.12 * hair]; P.hd = [-0.18 * back + 0.06, 0, wIn * 0.14 * hair];
      const ly = this.lookYaw(P, lookAt[0], lookAt[1]) * (1 - hair * 0.7); P.nk[1] += ly * 0.45; P.hd[1] += ly * 0.45;
      fIn = { p: this.B(P, wIn * 0.1, 0, 0.0), yaw: P.yaw + wIn * 0.18, pitch: hf.pitch, knee: norm3(this.dirB(P, wIn * 0.15, 0.2, 1)) };
      fOut = { p: this.B(P, -wIn * 0.03, 0.02, 0.13), yaw: P.yaw + wIn * 0.15, pitch: hf.pitch + 0.42, knee: norm3(this.dirB(P, wIn * 0.45, 0.25, 1)) };
      hIn = this.grip(1.5 * s, side, P); hIn.el = norm3([ra[0] * 1.3, -0.7, ra[2] * 1.3]);
      // free hand: up the side → into the hair at the back of the head → down the nape → out wide → rests on the hip
      // [time, wrist (body frame), palm normal, thumb direction] — fingers follow from the hand frame (up in the hair, forward on the hip)
      const ox = -wIn; const K = [
        // 5th column: elbow direction (body frame) — out and down at the sides, raised out to the side while the hand is in the
        // hair, so the elbow swings smoothly up and back down instead of flipping when the hand passes the shoulder
        [0.0, [ox * 0.2 * s, 0.92 * s, 0.05], [-ox, 0, 0], [0, 0, 1], [ox * 0.8, -0.3, -0.3]],
        [0.7, [ox * 0.2 * s, 1.3 * s, 0.26], [-ox, 0, 0], [0, 0.6, 0.8], [ox * 0.8, -0.45, 0]], // up in front of the shoulder (never through it)
        [1.3, [ox * 0.115 * s, 1.6 * s, -0.03], [-ox, 0, 0], [0, 0, -1], [ox * 0.85, 0.45, 0.15]],
        [2.2, [ox * 0.075 * s, 1.46 * s, -0.095], [0, 0, 1], [-ox, 0, 0], [ox * 0.9, 0.3, 0.1]],
        [3.1, [ox * 0.5 * s, 1.12 * s, 0.14], [0, -1, 0], [0, 0, 1], [ox * 0.6, -0.6, -0.4]],
        [3.9, [ox * 0.205 * s, 0.99 * s, 0.03], [-ox, 0, 0], [0, 1, 0], [ox * 0.8, -0.3, -0.3]],
        [T, [ox * 0.205 * s, 0.99 * s, 0.03], [-ox, 0, 0], [0, 1, 0], [ox * 0.8, -0.3, -0.3]]];
      let k = 0; while (k < K.length - 2 && K[k + 1][0] < t) k++; const a = K[k], b = K[k + 1]; const u = sm(seg(t, a[0], b[0]));
      const bp = a[1].map((v, i) => lerp(v, b[1][i], u)), bn = a[2].map((v, i) => lerp(v, b[2][i], u)), bu = a[3].map((v, i) => lerp(v, b[3][i], u)), be = a[4].map((v, i) => lerp(v, b[4][i], u));
      hOut = { p: this.B(P, bp[0], bp[1], bp[2]), n: norm3(this.dirB(P, ...bn)), up: norm3(this.dirB(P, ...bu)), el: norm3(this.dirB(P, ...be)) };
    }
    P.f = dir > 0 ? { L: fIn, R: fOut } : { L: fOut, R: fIn };
    P.h = side === 'L' ? { L: hIn, R: hOut } : { L: hOut, R: hIn };
    for (const S of ['L', 'R']) { const h = P.h[S]; if (h.grip === undefined) h.grip = 0; if (!h.pc) h.pc = h.p.slice(); }
    return P;
  }
  // ---------------------------------------------------------------- bones (Animator.postPose)
  apply(b, dt = 1 / 60) {
    const P = this.cur; if (!P) return; const g = this.ch.root.parent; if (!g) return; this.ch.handGrip = { L: P.h.L.grip, R: P.h.R.grip }; /* fingers close round the pole (DancerRig) */ this.maxSwivel = 10 * Math.min(0.1, dt || 1 / 60); // fastest an elbow / knee may swing round its limb axis (rad per frame) const g = this.ch.root.parent; if (!g) return;
    b.hips.position.set(P.hip[0], P.hip[1], P.hip[2]); b.hips.rotation.set(P.hr[0], P.hr[1], P.hr[2]);
    b.spine.rotation.set(P.sp[0], P.sp[1], P.sp[2]); b.chest.rotation.set(P.ch[0], P.ch[1], P.ch[2]); b.neck.rotation.set(P.nk[0], P.nk[1], P.nk[2]); b.head.rotation.set(P.hd[0], P.hd[1], P.hd[2]);
    if (b.shL) b.shL.rotation.set(0, 0, 0); if (b.shR) b.shR.rotation.set(0, 0, 0);
    g.updateWorldMatrix(true, false); const gq = g.getWorldQuaternion(_gq);
    for (const S of ['L', 'R']) this.leg(b, S, P.f[S], g, gq);
    let i = 0; for (const S of ['L', 'R']) { this.arm(b, S, P.h[S], g, gq, i++); }
  }
  leg(b, S, F, g, gq) {
    const th = b['thigh' + S], sh = b['shin' + S], ft = b['foot' + S], par = th.parent;
    // foot orientation (parent-group space): yaw, then pitch toe-down; ankle = ball − R·ball offset
    _q1.setFromEuler(_e.set(F.pitch, F.yaw, 0, 'YXZ')); const bo = _v1.set(this.hf.ball[0], this.hf.ball[1], this.hf.ball[2]).applyQuaternion(_q1);
    const ankle = _v2.set(F.p[0] - bo.x, F.p[1] - bo.y, F.p[2] - bo.z); g.localToWorld(ankle);
    par.updateWorldMatrix(true, false); const parQ = par.getWorldQuaternion(_q2);
    const tp = par.worldToLocal(_v3.copy(ankle)).sub(th.position);
    const u1 = sh.position, u2 = ft.position, L1 = u1.length(), L2 = u2.length();
    const dl = tp.length(); this.debug.legStretch = Math.max(this.debug.legStretch || 0, dl - (L1 + L2));
    const d = Math.min(Math.max(dl, Math.abs(L1 - L2) + 1e-3), L1 + L2 - 1e-4);
    const flex = Math.PI - Math.acos(Math.max(-1, Math.min(1, (L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2))));
    const shinQ = _q3.setFromAxisAngle(_X, flex);
    const h = _v4.copy(u2).applyQuaternion(shinQ).add(u1);
    const thQ = _q4.setFromUnitVectors(h.normalize(), _v5.copy(tp).normalize());
    const axis = _v5; const e = _v6.copy(u1).applyQuaternion(thQ); const pole = _v7.set(F.knee[0], F.knee[1], F.knee[2]).applyQuaternion(gq).applyQuaternion(_q5.copy(parQ).invert());
    const kp = this.kn[S]; if (kp) limitSwivel(pole, kp, _v9.copy(tp).normalize(), this.maxSwivel); // knee: no flip when the hip→ankle line swings past the pole
    e.addScaledVector(axis, -e.dot(axis)); pole.addScaledVector(axis, -pole.dot(axis));
    if (e.lengthSq() > 1e-10 && pole.lengthSq() > 1e-10) { e.normalize(); pole.normalize(); const ang = Math.atan2(_v8.crossVectors(e, pole).dot(axis), e.dot(pole)); thQ.premultiply(_q5.setFromAxisAngle(axis, ang)); }
    th.quaternion.copy(thQ); sh.quaternion.copy(shinQ); (this.kn[S] || (this.kn[S] = new THREE.Vector3())).copy(u1).applyQuaternion(thQ).normalize();
    sh.updateWorldMatrix(true, false); const want = _q6.copy(gq).multiply(_q1); const shW = sh.getWorldQuaternion(_q7); ft.quaternion.copy(shW.invert().multiply(want));
  }
  // how far the forearm sinks into the pole (m, > 0 = inside): the forearm as a tapered tube (elbow r 4.2 cm → 2.9 cm at
  // 80 % of the way to the wrist; the last bit next to a gripping hand is the hand's business)
  foreHit(b, S, g) {
    const fo = b['fore' + S], hd = b['hand' + S]; fo.updateWorldMatrix(true, true); const e = g.worldToLocal(fo.getWorldPosition(_w3)), wx = e.x, wy = e.y, wz = e.z;
    const h = g.worldToLocal(hd.getWorldPosition(_w3)); const px = this.pole.x, pz = this.pole.z, s = this.s || 1; let worst = -9;
    for (let k = 0; k <= 8; k++) { const t = (k / 8) * 0.8, x = wx + (h.x - wx) * t, y = wy + (h.y - wy) * t, z = wz + (h.z - wz) * t; if (y < this.pole.y0 || y > this.pole.y1) continue;
      worst = Math.max(worst, POLE_R + (0.055 + (0.038 - 0.055) * (t / 0.8)) * s - Math.hypot(x - px, z - pz)); }
    return worst;
  }
  arm(b, S, Hd, g, gq, i) {
    const chest = b.chest; chest.updateWorldMatrix(true, false);
    // a released hand never cuts through the pole (cross-fades blend one hold point into the next in a straight line): its wrist
    // target is eased radially out to at least rMin from the pole axis (soft knee, so nothing snaps)
    let hx = Hd.p[0], hz = Hd.p[2];
    if (Hd.grip < 0.5) { const dx = hx - this.pole.x, dz = hz - this.pole.z, r = Math.hypot(dx, dz), rMin = POLE_R + 0.075 * (this.s || 1), k = 2 * rMin;
      if (r < k && r > 1e-5) { const rn = r + (k - r) * (k - r) / (2 * k); hx = this.pole.x + dx * rn / r; hz = this.pole.z + dz * rn / r; } }
    const tw = g.localToWorld(_v1.set(hx, Hd.p[1], hz)); const target = chest.worldToLocal(_v2.copy(tw));
    // a free hand never folds the arm shut on the shoulder joint (hand-to-hair / hand-to-chest touches): with the arm folded the
    // elbow direction is undefined and swings round in a frame. Soft knee: beyond k the target is untouched, below it is eased out
    if (Hd.grip < 0.5) { const shC = chest.worldToLocal(b['arm' + S].getWorldPosition(_w4)); const dv = _w5.copy(target).sub(shC); const d = dv.length();
      const L = b['fore' + S].position.length() + b['hand' + S].position.length(), k = 0.8 * L; if (d < k && d > 1e-6) { target.copy(shC).addScaledVector(dv, (d + (k - d) * (k - d) / (2 * k)) / d); tw.copy(chest.localToWorld(_w6.copy(target))); } }
    // hand frame from palm normal n and thumb direction (parent-group space) → chest space
    const n = _v3.set(Hd.n[0], Hd.n[1], Hd.n[2]).normalize(); const up = _v4.set(Hd.up[0], Hd.up[1], Hd.up[2]); up.addScaledVector(n, -up.dot(n)); if (up.lengthSq() < 1e-6) up.set(0, 1, 0); up.normalize();
    const X = S === 'L' ? _v5.copy(n).negate() : _v5.copy(n); const Z = up; const Y = _v6.crossVectors(Z, X);
    _m.makeBasis(X, Y, Z); const qL = _q1.setFromRotationMatrix(_m); const qW = _q2.copy(gq).multiply(qL);
    const chestQi = chest.getWorldQuaternion(_q3).invert(); const qC = _q4.copy(chestQi).multiply(qW);
    // the wrist never snaps: when the grip changes from thumb-up to thumb-down (or a new hold starts) the hand turns toward its
    // new orientation at a bounded rate (~11 rad/s) instead of flipping in one frame
    { const H = this.hq || (this.hq = {}); const dt = (this.maxSwivel || 0.17) / 10; if (!H[S]) H[S] = qC.clone(); else { H[S].rotateTowards(qC, 11 * dt); qC.copy(H[S]); } }
    const par = b['arm' + S].parent; par.updateWorldMatrix(true, false); const parQi = par.getWorldQuaternion(_q5).invert();
    const pole = _v7.set(Hd.el[0], Hd.el[1], Hd.el[2]).applyQuaternion(gq).applyQuaternion(parQi);
    const ep = this.elb[S]; if (ep) { const ax = par.worldToLocal(_v9.copy(tw)).sub(b['arm' + S].position).normalize(); limitSwivel(pole, ep, ax, this.maxSwivel); } // elbow: a hand passing close to the shoulder never flips it
    solveArmIK(b, S, target, qC, 1, pole);
    // forearm clear of the pole: if the forearm (elbow → just short of the wrist) comes within its own radius of the pole,
    // swivel the elbow round the shoulder→hand line (the hand stays exactly where it is) by the smallest angle that clears it
    { const F = this.fsw || (this.fsw = {}); const cur = F[S] || 0; let tgt = 0;
      if (this.foreHit(b, S, g) > 0 || cur) { const ax = par.worldToLocal(_w1.copy(tw)).sub(b['arm' + S].position).normalize(); const p0 = _w2.copy(pole); let best = null;
        for (const da of [0, 0.08, -0.08, 0.16, -0.16, 0.26, -0.26, 0.4, -0.4, 0.6, -0.6, 0.8, -0.8, 1.1, -1.1]) { if (da) { pole.copy(p0).applyAxisAngle(ax, da); solveArmIK(b, S, target, qC, 1, pole); } const hit = this.foreHit(b, S, g); if (!best || hit < best.hit - 1e-4) best = { da, hit }; if (hit <= 0) break; }
        tgt = best.da; const step = this.maxSwivel * 0.6; const nw = cur + Math.max(-step, Math.min(step, tgt - cur)); F[S] = Math.abs(nw) < 1e-4 ? 0 : nw; // eased, never snapped
        pole.copy(p0).applyAxisAngle(ax, F[S]); solveArmIK(b, S, target, qC, 1, pole); } }
    // a released hand (fingered rigs) never sinks its knuckles into the pole: tilt it at the wrist, the smallest angle that clears
    if (Hd.grip < 0.5 && b['mid1' + S]) { const hd = b['hand' + S]; hd.updateWorldMatrix(true, false); const kn = () => g.worldToLocal(hd.localToWorld(_w4.copy(b['mid1' + S].position)));
      const pr = this.pole, rq = POLE_R + 0.026; const c0 = kn(); if (c0.y > pr.y0 && c0.y < pr.y1 && Math.hypot(c0.x - pr.x, c0.z - pr.z) < rq) {
        const wr = g.worldToLocal(hd.getWorldPosition(_w5)); const fd = _w6.copy(c0).sub(wr).normalize(); const out = _v9.set(wr.x - pr.x, 0, wr.z - pr.z).normalize();
        const kAx = fd.clone().cross(out); if (kAx.lengthSq() > 1e-8) { kAx.normalize(); const gq2 = g.getWorldQuaternion(new THREE.Quaternion()); const kW = kAx.applyQuaternion(gq2);
          const pq = hd.parent.getWorldQuaternion(new THREE.Quaternion()), pqi = pq.clone().invert(), base = hd.quaternion.clone(), rot = new THREE.Quaternion();
          for (let th = 0.1; th <= 1.6; th += 0.1) { hd.quaternion.copy(pqi).multiply(rot.setFromAxisAngle(kW, th)).multiply(pq).multiply(base); hd.updateWorldMatrix(false, false); const c = kn(); if (Math.hypot(c.x - pr.x, c.z - pr.z) >= rq) break; } } } }
    (this.elb[S] || (this.elb[S] = new THREE.Vector3())).copy(b['fore' + S].position).applyQuaternion(b['arm' + S].quaternion).normalize();
    if (Hd.grip > 0.5) { b['hand' + S].updateWorldMatrix(true, false); const hw = b['hand' + S].getWorldPosition(_v8); g.worldToLocal(hw); this.debug.reach[i] = Math.hypot(hw.x - Hd.p[0], hw.y - Hd.p[1], hw.z - Hd.p[2]); } else this.debug.reach[i] = 0;
  }
}
const _gq = new THREE.Quaternion(), _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion(), _q4 = new THREE.Quaternion(), _q5 = new THREE.Quaternion(), _q6 = new THREE.Quaternion(), _q7 = new THREE.Quaternion();
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3(), _v5 = new THREE.Vector3(), _v6 = new THREE.Vector3(), _v7 = new THREE.Vector3(), _v8 = new THREE.Vector3();
const _X = new THREE.Vector3(1, 0, 0), _e = new THREE.Euler(), _m = new THREE.Matrix4(), _v9 = new THREE.Vector3(), _w1 = new THREE.Vector3(), _w2 = new THREE.Vector3(), _w3 = new THREE.Vector3(), _w4 = new THREE.Vector3(), _w5 = new THREE.Vector3(), _w6 = new THREE.Vector3();
// Two-bone IK swivel continuity: if the wanted elbow/knee direction (pole) is more than `max` radians round the limb axis
// from where the joint was last frame, swing it only `max` that way this frame. Slow changes pass through untouched.
function limitSwivel(pole, prev, axis, max) {
  axis = _w3.copy(axis);
  const a = _w1.copy(pole).addScaledVector(axis, -pole.dot(axis)), p = _w2.copy(prev).addScaledVector(axis, -prev.dot(axis));
  if (a.lengthSq() < 1e-8 || p.lengthSq() < 1e-8) return; a.normalize(); p.normalize();
  const ang = Math.atan2(_v9.crossVectors(p, a).dot(axis), p.dot(a)); if (Math.abs(ang) <= max) return;
  const st = Math.sign(ang) * max, c = Math.cos(st), s = Math.sin(st); pole.copy(p).multiplyScalar(c).addScaledVector(_v9.crossVectors(axis, p), s);
}
function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function mulberry(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
