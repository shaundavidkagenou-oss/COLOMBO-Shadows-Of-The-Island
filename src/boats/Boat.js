// One boat in the world: its model (one draw call for the body, one per sail), its floating / planing physics on the real
// wave surface, steering, collisions, damage, the sails that tear when shot, the wreck that burns and sinks.
// Physics (per frame, arcade-honest but with the real behaviours):
//   * the hull samples the sea at bow, stern and both sides (BoatWater.waterAt — the same Gerstner waves the GPU draws), and
//     heave / pitch / roll follow that surface through damped springs sized to the hull (a jetski jitters on a chop, a 39 m
//     yacht rises slowly over the same swell); a fast hull that runs off a crest leaves the water and lands with a slam
//   * planing hulls climb a resistance hump with the bow up (most trim just below planing speed), then level off and rise
//     onto the plane; displacement hulls (the sailing yachts, the superyacht) squat a little and never plane
//   * thrust from the engines (reverse is weaker), rudder / outboard / jet authority grows with flow and (for a jet) throttle,
//     the keel resists sideslip — planing boats skid in a hard turn and bank into it, displacement boats heel outward
//   * sails: drive depends on the true wind angle (nothing in the 40° no-go zone), the boom eases out as the wind comes aft,
//     the boat heels to leeward; holes and tears (BoatMaterial sail shader) cost drive
import * as THREE from 'three';
import { BOATS } from './BoatCatalog.js';
import { boatModel, sailGeometry } from './BoatModels.js';
import { boatUniforms, boatMaterial, sailMaterial, MAX_HOLES } from './BoatMaterial.js';
import { waterAt, spray } from './BoatWater.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const dampTo = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
export const WIND = { x: 0.93, z: -0.37 }; // where the air is going: the south-west monsoon blows from the WSW onto the coast
let UID = 1;
const _w = { y: 0, dx: 0, dz: 0, a: 0 }, _ray = new THREE.Raycaster(), _m = new THREE.Matrix4(), _o = new THREE.Vector3(), _d = new THREE.Vector3(), _p = new THREE.Vector3();

export class Boat {
  constructor(id, o = {}) {
    const d = (this.def = BOATS[id]); if (!d) throw new Error('boat ' + id); this.id = id; const M = (this.model = boatModel(id));
    this.uid = o.uid || `${id}-${Date.now().toString(36)}-${UID++}`; this.role = o.role || 'npc';
    const c = { ...d.col, ...(o.col || {}) }; const Ft = M.H.h.Ft;
    this.U = boatUniforms({ hull: c.hull, boot: c.boot || c.hull, anti: c.anti || c.hull, sheer: c.sheer || c.hull, wl: d.cat === 'jetski' ? -9 : 0.03, bootTop: d.cat === 'jetski' ? -9 : 0.15,
      sheerLo: c.sheer && c.sheer !== c.hull ? Ft - 0.17 : 9, sheerHi: c.sheer && c.sheer !== c.hull ? Ft - 0.07 : 9, cabinCol: o.cabinCol });
    this.mat = boatMaterial(this.U);
    this.root = new THREE.Group(); this.root.name = 'boat:' + id; this.root.rotation.order = 'YXZ';
    this.mesh = new THREE.Mesh(M.geo, this.mat); this.mesh.name = 'boatBody'; this.mesh.castShadow = true; this.mesh.receiveShadow = true; this.root.add(this.mesh);
    // sails (+ the boom / yards swinging with the main), furled while moored
    this.sails = []; for (let i = 0; i < M.sails.length; i++) { const s = M.sails[i]; const piv = new THREE.Group(); piv.position.set(s.pivot[0], s.pivot[1], s.pivot[2]); this.root.add(piv);
      const sm = sailMaterial(s.col || '#f1ede2'); const g = sailGeometry(s); const mesh = new THREE.Mesh(g, sm); mesh.name = 'sail'; mesh.position.set(s.tack[0] - s.pivot[0], s.tack[1] - s.pivot[1], s.tack[2] - s.pivot[2]); mesh.castShadow = true; piv.add(mesh);
      this.sails.push({ def: s, piv, mesh, mat: sm, U: sm.userData.U, holes: 0, tear: 0, ang: 0 }); }
    if (M.sparGeo && this.sails[0]) { const sp = new THREE.Mesh(M.sparGeo, this.mat); sp.castShadow = true; this.sails[0].piv.add(sp); this.spar = sp; }
    this.setSailsVisible(false);
    // state
    this.x = o.x || 0; this.z = o.z || 0; this.yaw = o.yaw || 0; this.u = 0; this.v = 0; this.r = 0; this.y = -0.95; this.vy = 0; this.pitch = 0; this.pv = 0; this.roll = 0; this.rv = 0;
    this.mode = o.mode || 'moored'; this.berth = o.berth || null; this.thr = 0; this.steer = 0; this.air = false; this.plane = 0;
    this.maxHp = d.hp; this.hp = d.hp; this.engine = 1; this.wrecked = false; this.sink = 0; this.burn = 0; this.lastHit = null;
    this.lights = { nav: null, anchor: false, deck: false, uwl: false, beacon: null, cabin: 0 };
    this.driver = null; this.riders = []; this.T = { len: M.len, entry: 'boat', steer: 1 }; this.type = 'boat'; this.speed = 0; this.camDist = clamp(M.len * 0.9 + 4, 6.5, 34); this.camHeight = clamp(M.height * 0.45 + 1.2, 1.6, 9);
    this.sprayAcc = 0; this.wasAir = false; this.horn = 0;
    this.place(this.x, this.z, this.yaw, true);
  }
  get len() { return this.model.len; }
  setSailsVisible(on) { this.sailsUp = on; for (const s of this.sails) { s.mesh.visible = on; if (!on) { s.ang = 0; s.piv.rotation.y = 0; } } } // furled: in-mast main / roller jib, boom on the centreline
  place(x, z, yaw, snap = false) { this.x = x; this.z = z; this.yaw = yaw; if (snap) { const w = waterAt(x, z, _w); this.y = w.y; this.vy = 0; this.pitch = this.roll = this.pv = this.rv = 0; this.u = this.v = this.r = 0; } this.sync(); }
  sync() { const R = this.root; R.position.set(this.x, this.y, this.z); R.rotation.set(-this.pitch, this.yaw, this.roll); R.updateMatrixWorld(true); }
  fwd() { return [Math.sin(this.yaw), Math.cos(this.yaw)]; }
  // boat-space point → world (x, z only, ignores pitch / roll)
  local(lx, lz) { const s = Math.sin(this.yaw), c = Math.cos(this.yaw); return [this.x + lz * s + lx * c, this.z + lz * c - lx * s]; }
  worldPoint(p, out = new THREE.Vector3()) { return out.set(p[0], p[1], p[2]).applyMatrix4(this.root.matrixWorld); }
  circles() { const M = this.model; const n = clamp(Math.ceil(M.len / (M.halfBeam * 2.2)), 2, 9); const r = M.halfBeam * 0.95; const out = []; for (let i = 0; i < n; i++) { const lz = -M.len * 0.42 + (M.len * 0.84 * i) / (n - 1); const [x, z] = this.local(this.model.cat ? 0 : 0, lz); out.push([x, z, r]); } return out; }
  // ---------------------------------------------------------------------------------------------------------- update
  // ctl: { thr, steer } (only while driven) · env: { dt, E, wakes, blocked(x, z, r) → bool, near (camera distance), wind }
  update(dt, ctl, env) {
    const d = this.def, M = this.model; dt = Math.min(dt, 0.05);
    if (this.mode === 'sunk') return;
    const driven = this.mode === 'drive' && !this.wrecked; const thr = driven && ctl ? clamp(ctl.thr, -1, 1) : 0, st = driven && ctl ? clamp(ctl.steer, -1, 1) : 0; this.thr = thr; this.steer = st;
    const [fx, fz] = this.fwd(); const px = Math.cos(this.yaw), pz = -Math.sin(this.yaw); const au = Math.abs(this.u);
    const wind = env.wind ?? 0.5;
    // ---- horizontal motion
    if (this.mode === 'moored' || this.mode === 'anchored') {
      const B = this.berth; if (B) { const k = this.mode === 'anchored' ? 0.05 : 0.6; const swing = this.mode === 'anchored' ? Math.atan2(-WIND.x, -WIND.z) : B.yaw; // at anchor the bow swings head to wind
        this.x = dampTo(this.x, B.x + Math.sin(env.t * 0.21 + B.x) * 0.12, k, dt); this.z = dampTo(this.z, B.z + Math.cos(env.t * 0.17 + B.z) * 0.12, k, dt); let dy = swing - this.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); this.yaw += dy * (1 - Math.exp(-(this.mode === 'anchored' ? 0.05 : 0.8) * dt)); }
      this.u = this.v = this.r = 0;
    } else {
      // thrust: engines, and on a sailing boat the sails when the wind allows
      const alive = !this.wrecked && this.engine > 0.05; let F = 0;
      const eng = alive ? (thr >= 0 ? thr * d.acc : thr * d.acc * 0.5) * (0.45 + 0.55 * this.engine) : 0;
      this.sailF = 0;
      if (this.sails.length && this.sailsUp) {
        const twa = Math.acos(clamp(-(fx * WIND.x + fz * WIND.z), -1, 1)); // angle between the bow and where the wind comes from
        let health = 0; for (const s of this.sails) health += clamp(1 - s.holes * 0.035 - s.tear * 1.2, 0, 1); health /= this.sails.length;
        this.sailF = sstep(0.68, 1.15, twa) * (0.72 + 0.28 * Math.sin(twa)) * (0.45 + 0.75 * wind) * health;
        const side = Math.sign(-(px * WIND.x + pz * WIND.z)) || 1; // +1: wind on the port side → sails out to starboard
        const out = clamp((twa - 0.55) * 0.62, 0.1, 1.25); for (const s of this.sails) { const want = -side * (s.def.jib ? out * 0.55 : s.def.square ? out * 0.9 : out); s.ang = dampTo(s.ang, want, 1.6, dt); s.piv.rotation.y = s.ang; s.U.uSide.value = -side; }
        this.windSide = side;
      }
      if (this.sails.length && this.sailsUp && thr > 0) F = Math.max(thr * d.acc * this.sailF * 1.15, eng * 0.6); else F = eng;
      const k = Math.max(1e-3, d.acc - 0.06 * d.max) / (d.max * d.max); /* terminal speed = the catalogue's top speed */ const hump = d.plane ? d.acc * 0.42 * Math.exp(-(((au - 0.78 * d.plane) / (0.35 * d.plane)) ** 2)) : 0;
      const dmgMax = 0.55 + 0.45 * (this.hp / this.maxHp);
      this.u += (F * dmgMax - k * this.u * au - 0.06 * this.u - hump * Math.sign(this.u) * (Math.abs(F) > 0 ? 1 : 0.3)) * dt;
      if (this.wrecked) this.u *= Math.exp(-0.8 * dt);
      this.plane = d.plane ? sstep(0.65 * d.plane, 1.25 * d.plane, au) : 0;
      const lat = M.ski ? 1.15 : this.plane > 0.5 ? 1.6 : 3.6; const slip = M.ski ? 0.32 : 0.06 + 0.2 * this.plane;
      this.v += (-this.v * lat - this.u * this.r * slip) * dt;
      // steering authority: rudder / outboard / jet
      let auth = clamp((au + Math.abs(thr) * (M.ski ? 3.2 : 1.6)) / 4.5, 0, 1); if (M.ski) auth *= 0.3 + 0.7 * Math.abs(thr);
      const rT = st * d.turn * auth * (this.u < -0.3 ? -1 : 1) * (this.air ? 0.1 : 1); const yr = 2.4 * clamp(9 / M.len, 0.35, 1.6);
      this.r = dampTo(this.r, rT, yr, dt); this.yaw += this.r * dt;
      // move + collide (land, quays, ships, pontoons, other boats)
      const vx = fx * this.u + px * this.v, vz = fz * this.u + pz * this.v; const ox = this.x, oz = this.z; this.x += vx * dt; this.z += vz * dt;
      if (env.blocked && env.blocked(this)) { const imp = Math.hypot(vx, vz); this.x = ox; this.z = oz; this.u *= -0.25; this.v *= 0.2; this.r *= 0.4;
        if (imp > 3.5) { this.damage((imp - 3) * 4 * clamp(M.len / 10, 0.5, 2), 'hull', null, 'crash'); this.lastImpact = { t: performance.now(), v: imp }; } }
    }
    this.speed = this.u;
    // ---- vertical: the wave surface under the hull
    const hl = M.len * 0.38, hb = M.halfBeam * 0.8; let a = this.local(0, hl); const yb = waterAt(a[0], a[1], _w).y; a = this.local(0, -hl); const ys = waterAt(a[0], a[1], _w).y;
    a = this.local(hb, 0); const yp = waterAt(a[0], a[1], _w).y; a = this.local(-hb, 0); const yst = waterAt(a[0], a[1], _w).y; const yc = (yb + ys + yp + yst) * 0.25;
    const au2 = Math.abs(this.u); const lift = this.plane * Math.min(0.32, M.draft * 0.45);
    const trim = d.plane ? 0.12 * Math.exp(-(((au2 / d.plane - 0.8) / 0.35) ** 2)) + 0.03 * this.plane : 0.012 * (au2 / d.max);
    if (this.wrecked) { this.sink = Math.min(1, this.sink + dt / clamp(M.len * 1.6, 12, 60)); if (this.sink >= 1) { this.mode = 'sunk'; this.root.visible = false; return; } }
    const yT = yc + lift - this.sink * (M.height + M.draft + 0.6) * sstep(0.15, 1, this.sink);
    const wn = clamp(12 / Math.sqrt(M.len), 1.4, 7);
    const fall = this.prevYC === undefined ? 0 : (yc - this.prevYC) / dt; this.prevYC = yc; // the sea dropping away under a fast hull (past a crest)
    const wasAir = this.air; this.air = (this.y > yT + 0.22 && fall < -1.5 - M.len * 0.06 && Math.abs(this.u) > 6) || (this.air && this.y > yT + 0.02);
    if (!this.air) this.vy += (wn * wn * (yT - this.y) - 2 * (0.38 + 0.25 * this.plane) * wn * this.vy) * dt; /* a planing hull rides over the chop (more damped) */ else this.vy -= 9.81 * dt;
    this.y += this.vy * dt;
    if (wasAir && !this.air && this.vy < -2.2) { this.slam = Math.min(1, -this.vy / 7); if (env.E && env.near < 140) { const [sx, sz] = this.local(0, M.len * 0.1); spray(env.E, sx, yc + 0.2, sz, this.u * Math.sin(this.yaw) * 0.3, 2.5 + this.slam * 4, this.u * Math.cos(this.yaw) * 0.3, Math.round(10 + this.slam * 20), clamp(M.halfBeam, 0.7, 2.2), yc); } }
    // pitch / roll springs
    const pT = Math.atan2(yb - ys, hl * 2) + trim + this.sink * 0.28; const rollW = Math.atan2(yp - yst, hb * 2);
    let lean = 0; if (M.ski) lean = clamp(-this.r * this.u * 0.035, -0.5, 0.5); else if (this.plane > 0.2) lean = clamp(-this.r * this.u * 0.022 * this.plane, -0.3, 0.3); else lean = clamp(this.r * this.u * 0.012, -0.12, 0.12);
    const heel = this.sailsUp && this.sailF ? (this.windSide || 1) * this.sailF * (M.cat ? 0.06 : 0.28) : 0;
    const rT = clamp(rollW * 0.85 + lean + heel + (this.wrecked ? this.sink * 0.35 : 0), -0.75, 0.75);
    const wp = wn * 0.9, wr = wn * (M.cat ? 0.9 : 0.62); const kp = this.air ? 0.12 : 1;
    this.pv += (wp * wp * (pT - this.pitch) * kp - 2 * 0.45 * wp * this.pv) * dt - (this.air ? 0.35 * dt : 0); this.pitch += this.pv * dt;
    this.rv += (wr * wr * (rT - this.roll) * kp - 2 * (M.ski ? 0.6 : 0.24) * wr * this.rv) * dt; this.roll += this.rv * dt;
    this.U.uFend.value = this.mode === 'moored' ? 1 : 0;
    this.sync();
    // ---- water reaction: wake, bow spray, jet rooster tail, prop wash; damage smoke / fire
    if (env.wakes && this.mode === 'drive' && !this.air) { const [sx, sz] = this.local(0, -M.len * 0.5); env.wakes.feed(this, sx, sz, this.yaw, this.u, M.halfBeam, dt); }
    if (env.E && env.near < 130 && !this.air && this.mode !== 'moored' && this.mode !== 'anchored') {
      this.sprayAcc += dt * (au2 > 5 ? 18 * (0.4 + this.plane) : au2 > 2 && Math.abs(this.thr) > 0.6 ? 6 : 0);
      while (this.sprayAcc >= 1) { this.sprayAcc -= 1; const k = M.ski ? 0.25 : 0.62;
        for (const sd of [1, -1]) { const [bx, bz] = this.local(sd * M.halfBeam * 0.9, M.len * (k - 0.5) * 0.9 + M.len * 0.12); const out = Math.min(4, au2 * 0.16); spray(env.E, bx, yc + 0.08, bz, px * sd * out + fx * au2 * 0.2, 0.8 + au2 * 0.09, pz * sd * out + fz * au2 * 0.2, 1, clamp(M.halfBeam * 0.5, 0.35, 1.3), yc); }
        if (M.ski && au2 > 7) { const [rx, rz] = this.local(0, -M.len * 0.55); spray(env.E, rx, yc + 0.1, rz, -fx * au2 * 0.35, 3 + au2 * 0.18, -fz * au2 * 0.35, 1, 0.8, yc); } // the jet's rooster tail
        else if (au2 < 4 && Math.abs(this.thr) > 0.6) { const [rx, rz] = this.local(0, -M.len * 0.52); spray(env.E, rx, yc + 0.05, rz, -fx * 2 * Math.sign(this.thr), 0.6, -fz * 2 * Math.sign(this.thr), 1, 0.6, yc); } } }
    if (env.E && env.near < 260) { const hk = this.hp / this.maxHp; if (hk < 0.4 && !this.sink) { const e = M.engines[0] || [0, 0.4, -M.len * 0.4]; const p = this.worldPoint([e[0], e[1] + 0.4, e[2]], _p); this.smokeAcc = (this.smokeAcc || 0) + dt * (hk < 0.15 ? 9 : 4);
        while (this.smokeAcc >= 1) { this.smokeAcc -= 1; env.E.emit(env.E.smoke, 1, p, _d.set((Math.random() - 0.5) * 0.6, 1.4 + Math.random(), (Math.random() - 0.5) * 0.6), 4 + Math.random() * 3, 0.5, 2.4 + 1.6 * (0.4 - hk), 1, 0.9, 1.2, [hk < 0.15 ? 0.08 : 0.3, 0.25, yc]); } env.E.flush(env.E.smoke);
        if (hk < 0.15) env.E.burn(p, 0.5, yc, dt); } else if (this.wrecked && this.sink < 0.55) { const p = this.worldPoint([0, M.height * 0.3, 0], _p); env.E.burn(p, 0.9 * (1 - this.sink), yc, dt); } }
    for (const s of this.sails) s.U.uTime.value = env.t;
  }
  // ---------------------------------------------------------------------------------------------------------- damage
  damage(n, part = 'hull', point = null, by = null) {
    if (this.wrecked) return; const k = part === 'engine' ? 1.6 : part === 'cabin' ? 0.75 : part === 'mast' ? 0.25 : 1; this.hp -= n * k; if (part === 'engine') this.engine = Math.max(0, this.engine - n / (this.maxHp * 0.6));
    this.U.uDamage.value = clamp(1 - this.hp / this.maxHp, 0, 1); this.lastHit = { t: performance.now(), by };
    if (this.hp <= 0) this.wreck(by);
  }
  wreck(by) { if (this.wrecked) return; this.wrecked = true; this.hp = 0; this.engine = 0; this.U.uDamage.value = 1; this.mode = this.mode === 'moored' || this.mode === 'anchored' ? this.mode : 'drive'; this.onWreck && this.onWreck(this, by); }
  sailHit(i, uv) {
    const s = this.sails[i]; if (!s) return; const H = s.U.uHoles.value; const r = 0.012 + Math.random() * 0.012;
    if (s.holes < MAX_HOLES) { H[s.holes].set(uv.x, uv.y, r); } else { const j = Math.floor(Math.random() * MAX_HOLES); H[j].set(uv.x, uv.y, r * 1.4); }
    s.holes++; if (s.holes > 5) s.tear = Math.min(0.9, s.tear + 0.035 + Math.random() * 0.03); s.U.uTear.value = s.tear;
  }
  // ---------------------------------------------------------------------------------------------------------- bullets
  // nearest hit of a ray (o, d world, unit d) within [tMin, tMax]: hull / cabin / engine boxes in boat space and the sail cloth
  rayHit(o, d, tMin, tMax) {
    if (this.mode === 'sunk' || !this.root.visible) return null; const M = this.model;
    const cx = this.x - o.x, cz = this.z - o.z; const t0 = cx * d.x + cz * d.z; const qx = o.x + d.x * t0 - this.x, qz = o.z + d.z * t0 - this.z; const R = M.len * 0.55 + 2; if (qx * qx + qz * qz > R * R || t0 < tMin - R || t0 > tMax + R) return null;
    _m.copy(this.root.matrixWorld).invert(); _o.copy(o).applyMatrix4(_m); _d.copy(d).transformDirection(_m);
    let best = null;
    for (const b of M.boxes) { let lo = tMin, hi = tMax; let ok = true;
      for (const [oo, dd, a0, a1] of [[_o.x, _d.x, b.x0, b.x1], [_o.y, _d.y, b.y0, b.y1], [_o.z, _d.z, b.z0, b.z1]]) { if (Math.abs(dd) < 1e-9) { if (oo < a0 || oo > a1) { ok = false; break; } continue; } let ta = (a0 - oo) / dd, tb = (a1 - oo) / dd; if (ta > tb) [ta, tb] = [tb, ta]; lo = Math.max(lo, ta); hi = Math.min(hi, tb); if (lo > hi) { ok = false; break; } }
      if (ok && (!best || lo < best.t)) best = { t: lo, part: b.part === 'mast' ? 'mast' : b.part }; }
    if (this.sails.length && this.sailsUp) { _ray.set(o, d); _ray.near = tMin; _ray.far = best ? best.t : tMax;
      for (let i = 0; i < this.sails.length; i++) { const s = this.sails[i]; if (!s.mesh.visible) continue; const h = _ray.intersectObject(s.mesh, false)[0]; if (h && h.uv && (!best || h.distance < best.t)) best = { t: h.distance, part: 'sail', sail: i, uv: h.uv.clone() }; } }
    return best;
  }
  // ---------------------------------------------------------------------------------------------------------- lights
  setLights(L, night) {
    this.lights = L; const U = this.U; const navOn = !!L.nav;
    U.uLamps.value = (navOn || L.anchor ? 1 : 0) * (0.15 + 0.85 * night); U.uCabin.value = L.cabin * night; U.uUwl.value = L.uwl ? night : 0;
    if (L.beacon) { U.uBeacon.value.set(L.beacon.b(0), L.beacon.r(0)); } else U.uBeacon.value.set(0, 0);
  }
  dispose() { for (const s of this.sails) { s.mesh.geometry.dispose(); s.mat.dispose(); } this.mat.dispose(); if (this.root.parent) this.root.parent.remove(this.root); }
}
