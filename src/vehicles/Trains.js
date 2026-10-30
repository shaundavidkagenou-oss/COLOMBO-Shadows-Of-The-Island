// Running trains on the coastal / Fort–Maradana line, plus the level-crossing barriers they operate.
// Generic Sri Lanka Railways-style diesel multiple unit (no specific class is claimed): blue body, red waist stripe,
// cream window band, driving cabs at both ends. Cars follow the smooth track path bogie-by-bogie, so they bend
// correctly through curves. Each car exposes the same collision interface as a road Vehicle (x, z, yaw, T.len/T.wid,
// circles(), pushOut()) and is registered in Traffic.obstacles, so the player, pedestrians, AI and player-driven
// vehicles all treat it as a solid, immovable body.
import * as THREE from 'three';
import { MultiBuilder } from '../gfx/MeshBuilder.js';
import { MAT } from '../gfx/Materials.js';
import * as R from '../world/Railway.js';
import { Audio } from '../audio/Audio.js';

export const CAR_LEN = 19.6, CAR_GAP = 1.0, BOGIE = 14, CAR_W = 3.0, N_CARS = 5;
export const TRAIN_LEN = N_CARS * CAR_LEN + (N_CARS - 1) * CAR_GAP;
const VMAX = 15, ACC = 0.55, BRAKE = 0.75, EBRAKE = 1.4, DWELL = 25;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const STEP = 2;

// speed limit per path sample from curvature (lateral ≤ ~0.8 m/s² for comfort)
const VLIM = (() => {
  const n = R.PATH.xs.length, out = new Float32Array(n).fill(VMAX);
  for (let i = 2; i < n - 2; i++) {
    const a = Math.atan2(R.PATH.xs[i] - R.PATH.xs[i - 2], R.PATH.zs[i] - R.PATH.zs[i - 2]), b = Math.atan2(R.PATH.xs[i + 2] - R.PATH.xs[i], R.PATH.zs[i + 2] - R.PATH.zs[i]);
    let d = Math.abs(b - a); if (d > Math.PI) d = 2 * Math.PI - d; const rad = (2 * STEP) / Math.max(1e-4, d);
    out[i] = Math.min(VMAX, Math.sqrt(0.8 * rad));
  }
  return out;
})();
export function speedLimitAt(s) { return VLIM[clamp(Math.round(s / STEP), 0, VLIM.length - 1)]; }

// ---------------------------------------------------------------- shared car geometry (local: +z = car front, y = 0 at rail top)
const COL = { blue: [0.11, 0.27, 0.6], red: [0.74, 0.12, 0.13], cream: [0.9, 0.88, 0.8], roof: [0.55, 0.57, 0.59], under: [0.16, 0.16, 0.17], door: [0.14, 0.22, 0.42], bogie: [0.12, 0.12, 0.12], gang: [0.1, 0.1, 0.1], yellow: [0.92, 0.75, 0.1] };
let PROTO = null;
function makeMaterials() {
  return Object.assign(Object.create(MAT), {
    trainWin: new THREE.MeshStandardMaterial({ color: 0x1a242c, roughness: 0.12, metalness: 0.4, emissive: 0xffdcaa, emissiveIntensity: 0 }),
    trainCabGlass: new THREE.MeshStandardMaterial({ color: 0x10171c, roughness: 0.06, metalness: 0.6 }),
  });
}
function buildCar(cab) {
  const mb = new MultiBuilder(); const P = mb.get('paint'), M = mb.get('metal'), W = mb.get('trainWin'), G = mb.get('trainCabGlass');
  const L2 = CAR_LEN / 2, hw = CAR_W / 2;
  // underframe + bogies + wheels
  P.box(0, 1.12, 0, CAR_W - 0.06, 0.26, CAR_LEN - 0.1, { col: COL.under, bottom: true });
  P.box(0, 0.78, 0, 2.2, 0.45, 6.5, { col: COL.under }); P.box(0, 0.8, 0, 2.5, 0.3, 1.2, { col: [0.22, 0.22, 0.23] });
  const wheel = new THREE.CylinderGeometry(0.46, 0.46, 0.13, 14); wheel.rotateZ(Math.PI / 2);
  for (const bz of [-BOGIE / 2, BOGIE / 2]) {
    P.box(0, 0.6, bz, 2.35, 0.32, 3.1, { col: COL.bogie, bottom: true }); P.box(0, 0.88, bz, 1.6, 0.2, 1.4, { col: COL.bogie });
    for (const az of [-1.3, 1.3]) for (const sx of [-1, 1]) M.geometry(wheel, new THREE.Matrix4().makeTranslation(sx * 0.87, 0.46, bz + az), [0.3, 0.29, 0.28]);
    for (const az of [-1.3, 1.3]) P.box(0, 0.46, bz + az, 1.74, 0.12, 0.12, { col: COL.bogie });
  }
  // body bands
  P.box(0, 1.65, 0, CAR_W, 0.8, CAR_LEN, { col: COL.blue });
  P.box(0, 2.11, 0, CAR_W + 0.01, 0.12, CAR_LEN - 0.02, { col: COL.red });
  P.box(0, 2.66, 0, CAR_W - 0.02, 0.98, CAR_LEN, { col: COL.cream });
  P.box(0, 3.4, 0, CAR_W - 0.04, 0.5, CAR_LEN, { col: COL.cream });
  // roof (stepped camber) + roof equipment
  P.box(0, 3.72, 0, CAR_W - 0.16, 0.16, CAR_LEN - 0.06, { col: COL.roof }); P.box(0, 3.86, 0, CAR_W - 0.7, 0.12, CAR_LEN - 0.2, { col: COL.roof }); P.box(0, 3.95, 0, CAR_W - 1.4, 0.07, CAR_LEN - 0.4, { col: COL.roof });
  for (const z of [-5.5, 5.5]) P.box(0, 4.06, z, 1.3, 0.18, 2.0, { col: [0.7, 0.71, 0.72] });
  // doors (two per side) and windows
  const doorZ = [-L2 + 4.0, L2 - 4.0]; if (cab) doorZ[1] = L2 - 4.6;
  for (const sx of [-1, 1]) {
    for (const dz of doorZ) {
      P.box(sx * (hw + 0.006), 2.15, dz, 0.03, 2.05, 1.35, { col: COL.door });
      for (const lz of [-0.34, 0.34]) W.box(sx * (hw + 0.02), 2.62, dz + lz, 0.02, 0.8, 0.46);
      P.box(sx * (hw + 0.012), 1.17, dz, 0.04, 0.06, 1.35, { col: COL.yellow }); // step edge
    }
    const winEnd = cab ? L2 - 3.0 : L2 - 1.2;
    for (let z = -L2 + 1.2; z < winEnd - 0.6; z += 1.62) { if (doorZ.some((d) => Math.abs(z + 0.65 - d) < 1.35)) continue; W.box(sx * (hw + 0.01), 2.66, z + 0.65, 0.02, 0.82, 1.24); }
  }
  // ends
  if (!cab) P.box(0, 2.3, L2 + 0.26, 1.3, 2.3, 0.52, { col: COL.gang });
  P.box(0, 2.3, -L2 - 0.26, 1.3, 2.3, 0.52, { col: COL.gang }); // rear gangway (cab cars keep one at the inner end)
  if (cab) {
    P.box(0, 1.62, L2 + 0.03, CAR_W - 0.08, 0.86, 0.06, { col: COL.red }); // red front apron
    P.box(0, 1.2, L2 + 0.05, CAR_W - 0.2, 0.18, 0.06, { col: COL.yellow }); // yellow warning band
    G.box(0, 2.78, L2 + 0.02, CAR_W - 0.5, 1.02, 0.04); P.box(0, 2.78, L2 + 0.025, 0.08, 1.02, 0.05, { col: COL.cream }); // windscreen + pillar
    P.box(0, 3.5, L2 + 0.025, CAR_W - 0.1, 0.42, 0.04, { col: COL.cream });
    P.box(0, 0.5, L2 + 0.15, 2.5, 0.55, 0.14, { col: COL.under }); // plough
    P.box(0, 1.05, L2 + 0.35, 0.32, 0.26, 0.7, { col: COL.under }); // coupler
    for (const sx of [-1, 1]) G.box(sx * (hw + 0.012), 2.7, L2 - 1.6, 0.02, 0.8, 1.6); // cab side windows
  }
  return mb;
}
function protoMeshes(cab, mats) { return buildCar(cab).toMeshes(mats, { cast: true, receive: true }); }

function destTexture(st) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 64; const x = c.getContext('2d');
  x.fillStyle = '#0b0b0b'; x.fillRect(0, 0, 512, 64); x.fillStyle = '#ffa31a'; x.textBaseline = 'middle'; x.textAlign = 'center';
  x.font = '700 30px "Noto Sans", Arial, sans-serif'; x.fillText(st.name.toUpperCase(), 256, 20);
  x.font = '400 22px "Noto Sans Sinhala", "Noto Sans Tamil", "Noto Sans", sans-serif'; x.fillText(`${st.si}  ·  ${st.ta}`, 256, 48);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

// ---------------------------------------------------------------- a train car as a collision body
class TrainCar {
  constructor(train, idx) { this.train = train; this.idx = idx; this.isTrain = true; this.immovable = true; this.x = 0; this.z = 0; this.y = R.RAIL_TOP; this.yaw = 0; this.speed = 0; this.T = { len: CAR_LEN, wid: CAR_W, mass: 4e4, entry: 'none', name: 'Train' }; this.half = CAR_LEN / 2; this.radius = CAR_W / 2; this.ai = null; this.parked = false; }
  forward() { return [Math.sin(this.yaw), Math.cos(this.yaw)]; }
  circles() { const [fx, fz] = this.forward(); const n = 9, out = []; for (let i = 0; i < n; i++) { const t = (i / (n - 1) - 0.5) * (CAR_LEN - CAR_W); out.push([this.x + fx * t, this.z + fz * t]); } return out; }
  pushOut(px, pz, r) {
    const [fx, fz] = this.forward(); const dx = px - this.x, dz = pz - this.z; const lz = dx * fx + dz * fz, lx = dx * fz - dz * fx; const hl = CAR_LEN / 2, hw = CAR_W / 2;
    if (Math.abs(lx) >= hw + r || Math.abs(lz) >= hl + r) return null;
    const cx = clamp(lx, -hw, hw), cz = clamp(lz, -hl, hl); const ox = lx - cx, oz = lz - cz; const d = Math.hypot(ox, oz); if (d >= r && d > 0) return null;
    // always leave sideways (off the track) unless clearly beyond an end: a moving train never "carries" someone along in front
    const moving = Math.abs(this.speed) > 0.5; let nlx = lx, nlz = lz;
    if (!moving && Math.abs(lz) > hl - 0.05 && Math.abs(lx) < hw) nlz = Math.sign(lz) * (hl + r); else { nlx = Math.sign(lx || 1) * (hw + r); if (moving) this.train.sys.lastStrike = { t: performance.now(), x: px, z: pz, v: Math.abs(this.speed) }; }
    return { x: this.x + nlx * fz + nlz * fx, z: this.z - nlx * fx + nlz * fz };
  }
  impact() {} bump() {}
}

// ---------------------------------------------------------------- one train
class Train {
  constructor(sys, id, sLow, dir) {
    this.sys = sys; this.id = id; this.sLow = sLow; this.dir = dir; this.speed = 0; this.state = 'dwell'; this.dwell = 6 + id * 9; this.emergency = 0; this.hornCd = 0; this.clackT = 0; this.rumbleT = 0;
    this.group = new THREE.Group(); this.group.name = 'train' + id; sys.scene.add(this.group);
    this.endMats = [0, 1].map(() => ({ head: new THREE.MeshBasicMaterial({ color: 0x222222 }), tail: new THREE.MeshBasicMaterial({ color: 0x220000 }), dest: new THREE.MeshBasicMaterial({ map: sys.destTex[0] }) }));
    this.cars = []; this.bodies = [];
    for (let i = 0; i < N_CARS; i++) {
      const cab = i === 0 || i === N_CARS - 1; const g = new THREE.Group(); const inner = new THREE.Group(); g.add(inner); // inner flips cab car 0 to face −s
      for (const m of cab ? sys.protoCab : sys.protoTrailer) { const mm = new THREE.Mesh(m.geometry, m.material); mm.castShadow = true; mm.receiveShadow = true; inner.add(mm); }
      if (cab) {
        const end = i === 0 ? 0 : 1; const em = this.endMats[end]; const L2 = CAR_LEN / 2;
        for (const sx of [-1, 1]) {
          const h = new THREE.Mesh(sys.lampGeo, em.head); h.position.set(sx * 0.95, 1.55, L2 + 0.07); inner.add(h);
          const t = new THREE.Mesh(sys.tailGeo, em.tail); t.position.set(sx * 1.27, 1.55, L2 + 0.07); inner.add(t);
        }
        const d = new THREE.Mesh(sys.destGeo, em.dest); d.position.set(0, 3.5, L2 + 0.05); inner.add(d);
        if (i === 0) inner.rotation.y = Math.PI;
      }
      this.group.add(g); this.cars.push(g); const b = new TrainCar(this, i); this.bodies.push(b);
    }
    this.nextStop = this.findNextStop(); this.place(); this.updateLamps();
  }
  get front() { return this.dir > 0 ? this.sLow + TRAIN_LEN : this.sLow; }
  get centre() { return this.sLow + TRAIN_LEN / 2; }
  findNextStop() { const S = R.STOPS, c = this.centre; if (this.dir > 0) return S.find((s) => s.s > c + 1) || S[S.length - 1]; for (let i = S.length - 1; i >= 0; i--) if (S[i].s < c - 1) return S[i]; return S[0]; }
  isTerminus(st) { return st === R.STOPS[0] || st === R.STOPS[R.STOPS.length - 1]; }
  updateLamps() {
    const lead = this.dir > 0 ? 1 : 0; const night = this.sys.night;
    this.endMats.forEach((m, e) => { const on = e === lead; m.head.color.setRGB(on ? 1.6 : 0.12, on ? 1.55 : 0.12, on ? 1.4 : 0.12); m.tail.color.setRGB(on ? 0.15 : 1.2 + night * 0.8, on ? 0.02 : 0.05, on ? 0.02 : 0.05); });
    const dst = this.dir > 0 ? R.STOPS[R.STOPS.length - 1] : R.STOPS[0]; const tex = this.sys.destTex[this.dir > 0 ? 1 : 0]; this.endMats.forEach((m) => { if (m.dest.map !== tex) { m.dest.map = tex; m.dest.needsUpdate = true; } }); this.destination = dst;
  }
  place() {
    const pa = {}, pb = {};
    for (let i = 0; i < N_CARS; i++) {
      const s0 = this.sLow + i * (CAR_LEN + CAR_GAP), sa = s0 + (CAR_LEN - BOGIE) / 2, sb = sa + BOGIE; R.sampleAt(sa, pa); R.sampleAt(sb, pb);
      const x = (pa.x + pb.x) / 2, z = (pa.z + pb.z) / 2, yaw = Math.atan2(pb.x - pa.x, pb.z - pa.z);
      const g = this.cars[i]; g.position.set(x, R.RAIL_TOP, z); g.rotation.y = yaw;
      const b = this.bodies[i]; b.x = x; b.z = z; b.yaw = yaw; b.speed = this.speed * this.dir;
    }
  }
  horn(long = false) {
    const c = R.sampleAt(this.front); const [g, pan] = Audio.spatial(c.x, c.z, 260); if (g < 0.015) return; const v = 0.2 * g, d = long ? 1.6 : 0.8;
    for (const [f, k] of [[311, 1], [370, 0.85], [466, 0.55]]) Audio.tone(f, d, { type: 'sawtooth', vol: v * k * 0.5, pan, attack: 0.06 });
  }
  // obstacles on the track ahead of the leading cab (player, player's vehicle, road vehicles): returns clear distance
  obstacleAhead(things) {
    const f = R.sampleAt(this.front); let best = Infinity;
    for (const o of things) {
      if (!o || (o.isTrain && o.train === this)) continue; const rx = o.x - f.x, rz = o.z - f.z; if (Math.abs(rx) > 160 || Math.abs(rz) > 160) continue;
      if ((o.y || 0) > R.RAIL_TOP + 0.35) continue; // on a platform / bridge, not on the rails
      const r = R.nearestS(o.x, o.z); const rad = (o.T ? o.T.wid / 2 : 0.35) + CAR_W / 2 + 0.1; if (r.d > rad) continue;
      let ahead = (r.s - this.front) * this.dir;
      if (o.isTrain) { ahead -= CAR_LEN / 2; if (ahead < -CAR_LEN) continue; if (o.train.dir !== this.dir && o.train.speed > 0.1) ahead /= 2; } // near end of the other car; converging → each gets half the gap
      if (ahead > -2 && ahead < best) best = Math.max(0, ahead);
    }
    return best;
  }
  update(dt, ctx) {
    this.hornCd -= dt;
    if (this.state === 'dwell') {
      this.speed = 0; this.dwell -= dt;
      if (this.dwell <= 0) {
        if (this.isTerminus(this.nextStop) && Math.abs(this.nextStop.s - this.centre) < 3) { const nd = this.nextStop === R.STOPS[0] ? 1 : -1; if (nd !== this.dir) { this.dir = nd; this.reversals = (this.reversals || 0) + 1; this.updateLamps(); } }
        this.state = 'run'; this.nextStop = this.findNextStop(); this.horn(); this.hornCd = 6;
      }
    } else {
      // target speed: line limits over the whole train + braking curve to the next stop, curves ahead and obstacles
      let vt = VMAX; for (let s = this.sLow; s <= this.sLow + TRAIN_LEN; s += STEP * 2) vt = Math.min(vt, speedLimitAt(s));
      for (let k = 2; k < 160; k += 4) { const s = this.front + this.dir * k; if (s < 0 || s > R.PATH.total) break; vt = Math.min(vt, Math.sqrt(speedLimitAt(s) ** 2 + 2 * BRAKE * k)); }
      const rem = (this.nextStop.s - this.centre) * this.dir; vt = Math.min(vt, Math.sqrt(2 * BRAKE * Math.max(0, rem - 0.3)) + (rem > 1.5 ? 0.6 : 0));
      const obs = this.obstacleAhead(ctx.obstacles); this.obstacleDist = obs;
      if (obs < 140) { vt = Math.min(vt, Math.sqrt(2 * EBRAKE * Math.max(0, obs - 6))); if (this.hornCd <= 0) { this.horn(true); this.hornCd = 2.5; } }
      const emergencyBrake = obs < 140 && this.speed > vt + 0.5; this.emergency = emergencyBrake ? 1 : 0;
      this.speed = clamp(vt - this.speed, -(emergencyBrake ? EBRAKE : BRAKE) * 1.3 * dt, ACC * dt) + this.speed; this.speed = Math.max(0, this.speed);
      this.sLow += this.dir * this.speed * dt; this.sLow = clamp(this.sLow, 0, R.PATH.total - TRAIN_LEN);
      // approaching a level crossing: sound the horn
      for (const c of this.sys.crossings) { const a = (c.s - this.front) * this.dir; if (a > 60 && a < 60 + this.speed * dt * 1.01 + 0.01) this.horn(true); }
      if (rem < 0.35 && this.speed < 0.25) { this.state = 'dwell'; this.dwell = this.isTerminus(this.nextStop) ? DWELL + 15 : DWELL; this.speed = 0; this.stoppedAt = this.nextStop.name; this.stops = (this.stops || 0) + 1; }
    }
    this.place();
    // sound: diesel rumble + wheel clacks near the listener
    const c = R.sampleAt(this.centre); const [g] = Audio.spatial(c.x, c.z, 90);
    this.rumbleT -= dt; if (g > 0.03 && this.rumbleT <= 0) { this.rumbleT = 0.35; Audio.noise(0.45, { f: 90 + this.speed * 6, q: 0.6, type: 'lowpass', vol: g * (0.08 + this.speed * 0.012) }); }
    if (this.speed > 2) { this.clackT -= dt * this.speed; if (this.clackT <= 0) { this.clackT = CAR_LEN + CAR_GAP; if (g > 0.05) for (const w of [0, 0.11]) Audio.noise(0.04, { f: 2200, q: 2, vol: g * 0.08, when: w }); } }
  }
}

// ---------------------------------------------------------------- level-crossing barriers
function buildCrossing(sys, c) {
  const g = new THREE.Group(); const mb = new MultiBuilder(); const P = mb.get('paint');
  const sinA = Math.max(0.35, Math.abs(c.ax[0] * c.rdz - c.ax[1] * c.rdx)); const D = (R.DECK_HW + R.RAMP + 1.6) / sinA;
  c.sides = []; c.lampMats = [new THREE.MeshBasicMaterial({ color: 0x220000 }), new THREE.MeshBasicMaterial({ color: 0x220000 })];
  const lamp = new THREE.SphereGeometry(0.11, 10, 8), boomSeg = new THREE.BoxGeometry(0.6, 0.1, 0.07);
  const white = new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.6 }), red = new THREE.MeshStandardMaterial({ color: 0xc81e1e, roughness: 0.6 });
  for (const sd of [-1, 1]) {
    const hx = -sd * c.ax[0], hz = -sd * c.ax[1]; // traffic heading toward the track on this side
    const lx = hz, lz = -hx; // its left (left-hand traffic → barrier post on the left verge)
    const bx = c.x + sd * c.ax[0] * D, bz = c.z + sd * c.ax[1] * D; const off = c.hw + 0.7;
    const px = bx + lx * off, pz = bz + lz * off; const y0 = 0.15;
    // post with counterweight housing + twin red lamps facing the traffic; crossbuck on its own post
    P.box(px, y0 + 0.6, pz, 0.3, 1.2, 0.3, { col: [0.92, 0.92, 0.88] }); P.box(px, y0 + 0.05, pz, 0.6, 0.1, 0.6, { col: [0.5, 0.5, 0.5] });
    P.box(px + lx * 0.1, y0 + 2.2, pz + lz * 0.1, 0.12, 2.2, 0.12, { col: [0.2, 0.2, 0.2] });
    P.box(px + lx * 0.1 - hx * 0.08, y0 + 2.45, pz + lz * 0.1 - hz * 0.08, 1.0, 0.36, 0.08, { col: [0.08, 0.08, 0.08], rotY: Math.atan2(-lz, lx) }); // lamp board across the approach
    for (let k = 0; k < 2; k++) { const m = new THREE.Mesh(lamp, c.lampMats[k]); const t = k ? 0.3 : -0.3; m.position.set(px + lx * (0.1 + t) - hx * 0.15, y0 + 2.45, pz + lz * (0.1 + t) - hz * 0.15); g.add(m); }
    const cb = new THREE.Group(); cb.position.set(px + lx * 0.1 - hx * 0.1, y0 + 3.3, pz + lz * 0.1 - hz * 0.1); cb.rotation.y = Math.atan2(hx, hz);
    for (const a of [Math.PI / 4, -Math.PI / 4]) { const w = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.24, 0.03), white); w.rotation.z = a; cb.add(w); const r2 = new THREE.Mesh(new THREE.BoxGeometry(1.14, 0.1, 0.035), red); r2.rotation.z = a; r2.position.z = -0.003; cb.add(r2); }
    g.add(cb);
    // boom arm: pivots at the post, spans the full carriageway toward the far verge
    const bdx = -lx, bdz = -lz, len = c.hw * 2 + 0.6; const pivot = new THREE.Group(); pivot.position.set(px, y0 + 1.0, pz); pivot.rotation.y = Math.atan2(-bdz, bdx);
    const arm = new THREE.Group(); pivot.add(arm);
    for (let k = 0; k * 0.6 < len; k++) { const m = new THREE.Mesh(boomSeg, k % 2 ? white : red); m.position.x = 0.3 + k * 0.6; m.castShadow = true; arm.add(m); }
    const cw = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.28, 0.22), new THREE.MeshStandardMaterial({ color: 0x333333 })); cw.position.x = -0.45; arm.add(cw);
    arm.rotation.z = Math.PI / 2 * 0.95; g.add(pivot);
    c.sides.push({ arm, px, pz, bdx, bdz, len, knocked: 0 });
  }
  for (const m of mb.toMeshes(MAT)) g.add(m);
  sys.scene.add(g); c.group = g; c.flash = 0; c.closedT = 0; c.bellT = 0;
}

export class Trains {
  constructor(scene, opts = {}) {
    this.scene = scene; this.night = 0; this.crossings = R.CROSSINGS; this.obstacles = [];
    const mats = makeMaterials(); this.mats = mats;
    this.protoCab = protoMeshes(true, mats); this.protoTrailer = protoMeshes(false, mats);
    this.lampGeo = new THREE.BoxGeometry(0.32, 0.2, 0.04); this.tailGeo = new THREE.BoxGeometry(0.16, 0.16, 0.04); this.destGeo = new THREE.PlaneGeometry(1.7, 0.26);
    this.destTex = [destTexture(R.STOPS[0]), destTexture(R.STOPS[R.STOPS.length - 1])];
    // The line is single-track with no passing loops, so ONE train works the full line (Wellawatte ↔ Maradana).
    // A second train in the opposite direction would inevitably meet it head-on; obstacleAhead() also treats other
    // trains as obstacles as a safety net if more are ever added.
    const S = R.STOPS; const n = opts.count ?? 1; this.trains = [];
    const starts = [[S[0].s - TRAIN_LEN / 2, 1], [S[S.length - 1].s - TRAIN_LEN / 2, -1], [S[2].s - TRAIN_LEN / 2, 1]];
    for (let i = 0; i < n; i++) { const [s, d] = starts[i]; const t = new Train(this, i, s, d); t.nextStop = S.reduce((a, b) => (Math.abs(b.s - t.centre) < Math.abs(a.s - t.centre) ? b : a)); this.trains.push(t); }
    for (const c of this.crossings) buildCrossing(this, c);
    this.bodies = this.trains.flatMap((t) => t.bodies);
  }
  // crossing state: closed while a train occupies it or is about to arrive
  updateCrossings(dt, listener) {
    for (const c of this.crossings) {
      let closed = false;
      for (const t of this.trains) {
        if (c.s > t.sLow - 12 && c.s < t.sLow + TRAIN_LEN + 12) { closed = true; break; }
        const ahead = (c.s - t.front) * t.dir; if (ahead <= 0 || ahead > 220) continue;
        if (t.state === 'run' ? ahead / Math.max(t.speed, 4) < 26 : t.dwell < 6) { closed = true; break; }
      }
      c.closed = closed; c.closedT = closed ? c.closedT + dt : 0;
      const want = closed && c.closedT > 3 ? 1 : 0; // lamps flash for 3 s before the booms come down
      c.boom = clamp(c.boom + (want ? dt / 5 : -dt / 4), 0, 1); c.active = closed || c.boom > 0.01;
      c.flash = c.active ? c.flash + dt : 0; const ph = Math.floor(c.flash * 2.4) % 2;
      c.lampMats[0].color.setRGB(c.active && ph === 0 ? 2.2 : 0.14, c.active && ph === 0 ? 0.12 : 0.0, 0.0); c.lampMats[1].color.setRGB(c.active && ph === 1 ? 2.2 : 0.14, c.active && ph === 1 ? 0.12 : 0.0, 0.0);
      for (const sd of c.sides) { sd.knocked = Math.max(0, sd.knocked - dt); const down = sd.knocked > 0 ? 0 : c.boom; const e = down * down * (3 - 2 * down); sd.arm.rotation.z = (Math.PI / 2) * 0.95 * (1 - e); sd.down = e; }
      if (c.active && listener) { c.bellT -= dt; if (c.bellT <= 0) { c.bellT = 0.42; const [g, pan] = Audio.spatial(c.x, c.z, 50); if (g > 0.03) Audio.tone(1350, 0.16, { type: 'triangle', vol: 0.06 * g, pan }); } }
    }
  }
  // AI drivers: distance to a stop line before an active crossing ahead (or Infinity)
  stopDistance(v) {
    const fx = Math.sin(v.yaw), fz = Math.cos(v.yaw); let best = Infinity;
    for (const c of this.crossings) {
      if (!c.active) continue; const rx = c.x - v.x, rz = c.z - v.z; const along = rx * fx + rz * fz; if (along < 0 || along > 60) continue;
      const lat = Math.abs(rx * fz - rz * fx); if (lat > c.hw + 6) continue;
      const sinA = Math.max(0.35, Math.abs(fx * c.rdz - fz * c.rdx)); const stopLine = along - (R.DECK_HW + R.RAMP + 2.5) / sinA - (v.half || 2);
      if (stopLine > -1.5) best = Math.min(best, Math.max(0, stopLine)); // already past the line → keep going and clear the track
    }
    return best;
  }
  // a vehicle driving into a lowered boom knocks it up (non-physical barrier) with a clatter
  checkBooms(v) {
    if (!v) return;
    for (const c of this.crossings) for (const sd of c.sides) {
      if (sd.down < 0.5) continue; const rx = v.x - sd.px, rz = v.z - sd.pz; const t = rx * sd.bdx + rz * sd.bdz; if (t < 0 || t > sd.len) continue;
      const perp = Math.abs(rx * sd.bdz - rz * sd.bdx); if (perp < (v.T ? v.T.len / 2 : 0.4)) { sd.knocked = 6; Audio.noise(0.25, { f: 1800, q: 1.2, vol: 0.18 }); }
    }
  }
  update(dt, { focus, night = 0, player = null, playerVehicle = null, vehicles = [], listener = null } = {}) {
    this.night = night; for (const m of [this.mats.trainWin]) m.emissiveIntensity = night * 0.85;
    const obstacles = [playerVehicle || player, ...vehicles.filter((v) => !v.isTrain && (v.speed || 0) < 1.5), ...(this.trains.length > 1 ? this.bodies : [])];
    for (const t of this.trains) { t.update(dt, { obstacles }); if (t._night !== Math.round(night * 4)) { t._night = Math.round(night * 4); t.updateLamps(); } }
    this.updateCrossings(dt, listener);
    if (playerVehicle) this.checkBooms(playerVehicle);
    // the train is immovable: push vehicles it runs into off the track (AI traffic stops at crossings, so this is a fallback)
    for (const b of this.bodies) {
      if (Math.abs(b.speed) < 0.05) continue;
      for (const v of vehicles) {
        if (v.isTrain || Math.abs(v.x - b.x) > 14 || Math.abs(v.z - b.z) > 14) continue;
        for (const [cx, cz] of v.circles()) { const q = b.pushOut(cx, cz, v.radius || 1); if (q) { v.x += q.x - cx; v.z += q.z - cz; v.speed *= 0.3; if (v.impact) v.impact(Math.abs(b.speed) * 1.5); if (v.sync) v.sync(0); } }
      }
    }
    // LOD: hide trains far from the focus (simulation continues)
    if (focus) for (const t of this.trains) { const c = R.sampleAt(t.centre); t.group.visible = Math.hypot(c.x - focus.x, c.z - focus.z) < 1100; }
  }
}
