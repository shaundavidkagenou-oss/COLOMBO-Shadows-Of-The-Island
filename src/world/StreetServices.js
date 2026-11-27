// Street services (features 37 / 38 / 39): the people who keep Colombo's pavements passable, and the bins they keep.
//
//  · street sweepers work a beat along the pavement of a busy street (a chain of sidewalk-graph nodes walked out and back)
//    in the municipal-cleaner look, pushing a hand cart and sweeping with a broom — bending to it every few metres, then
//    walking on. They keep the corporation's hours (early morning and late afternoon), and their brushes are heard
//    positionally while they work.
//  · litter bins are the bins the city already built (CityStreets.js: collider.bin). Each one fills through the day at the
//    rate the businesses around it are being used (Business.footfall), so a Pettah corner bin is full by lunchtime and a
//    side-street bin is still empty at midnight.
//  · a refuse lorry works a collection round in the evening: it pulls into the kerb near a cluster of full bins, the loader
//    walks them empty one after the other, then the lorry rejoins the traffic and drives on. The bins it emptied stay empty
//    until people fill them again.
//
// The sweepers and the loader are ordinary crowd people in the 'job' state, so they are shoved, frightened, arrested and
// killed like anyone else, and the crowd's collision and personal space apply to them. Nothing here runs beyond the
// player's neighbourhood: a sweeper beyond ACTIVE_R is released back to the street, and the round only starts nearby.
import * as THREE from 'three';
import * as L from './Layout.js';
import { plan } from './CityPlan.js';
import { makeAppearance } from '../actors/Appearance.js';
import { RNG } from '../core/rng.js';
import { Vehicle } from '../vehicles/Vehicle.js';
import { Audio } from '../audio/Audio.js';

const ACTIVE_R = 130, DROP_R = 190;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const CART = new THREE.BoxGeometry(0.52, 0.42, 0.72);
const BROOM = new THREE.BoxGeometry(0.05, 1.05, 0.05);
const HAND = new THREE.Vector3(-0.14, -0.12, 0.30); // chest space: the hand on the broom shaft
const ELBOW = new THREE.Vector3(-0.8, -1, 0.2).normalize();
const SWEEP_HOURS = [[5.5, 11.5], [15.5, 18.5]];

function inShift(h) { for (const [a, b] of SWEEP_HOURS) if (h >= a && h < b) return true; return false; }

// ------------------------------------------------------------------------------------------------ one sweeper
class Sweeper {
  constructor(sys, beat, seed) {
    this.sys = sys; this.beat = beat; this.seed = seed; this.p = null; this.i = 1; this.dir = 1; this.phase = 'walk'; this.t = 0; this.cart = null; this.broom = null; this.sweepT = 0;
    this.job = { step: (p, dt, ctx, lod) => this.step(p, dt), post: () => this.post(), interrupt: () => this.drop(), resume: () => { this.phase = 'walk'; } };
  }
  get alive() { const p = this.p; return !!(p && !p.dead && p.ch.crowdPed === p); }
  spawn() {
    const C = this.sys.crowd, b = this.beat[0]; if (!C) return;
    const sp = makeAppearance(this.seed, { preset: this.seed % 2 ? 'm_cmc_cleaner' : 'f_cmc_cleaner' });
    const p = C.makePed(sp, b.x, b.z, b.node); if (!p) return;
    Object.assign(p, { x: b.x, z: b.z, state: 'job', job: this.job, keep: true, pace: 0.95, umbrella: false, jog: false, edge: null, route: null, target: null });
    C.place(p); this.p = p; this.attach(); this.sys.stats.crew++;
  }
  attach() {
    const p = this.p; if (!p || !p.ch.bones || !p.ch.bones.chest) return;
    const cart = new THREE.Mesh(CART, this.sys.matCart); cart.castShadow = true; cart.name = 'sweepCart'; cart.position.set(0, -0.42, 0.62); p.ch.bones.chest.add(cart); this.cart = cart;
    const broom = new THREE.Mesh(BROOM, this.sys.matBroom); broom.castShadow = true; broom.name = 'sweepBroom'; broom.position.set(-0.26, -0.3, 0.4); broom.rotation.z = 0.35; p.ch.bones.chest.add(broom); this.broom = broom;
    const A = p.ch.anim; A.ik = { R: HAND, qR: null, wR: 1, poleR: ELBOW, L: null };
  }
  detach() { for (const m of [this.cart, this.broom]) if (m && m.parent) m.parent.remove(m); this.cart = this.broom = null; if (this.p) this.p.ch.anim.ik = null; }
  drop() { this.detach(); this.phase = 'walk'; }
  release() {
    const p = this.p; this.p = null; this.detach(); if (!p) return; this.sys.stats.crew--;
    p.job = null; p.keep = false; if (p.ch.crowdPed === p && !p.dead) { p.state = 'walk'; this.sys.crowd.returnToGraph(p); }
  }
  step(p, dt) {
    this.t += dt; const A = p.ch.anim, S = this.sys;
    if (!inShift(S.hour) || !this.alive) { // off shift: walk off the beat, then hand them back to the street
      if (this.phase !== 'leave') { this.drop(); this.phase = 'leave'; this.t = 0; }
      const e = this.beat[this.beat.length - 1];
      const r = this.moveTo(e.x, e.z, 1.05); if (r) return r;
      S.wantRelease(this); return { desired: 0, tx: null, tz: null, avoid: false };
    }
    if (this.phase === 'leave') { this.attach(); this.phase = 'walk'; }
    const q = this.beat[this.i];
    switch (this.phase) {
      case 'walk': {
        if (A.action === 'interact' || A.action === 'sweep') A.set(null);
        const r = this.moveTo(q.x, q.z, 0.95);
        if (r) { this.sweepT -= dt; return r; }
        // reached a beat point: sweep here for a moment, then go on
        this.phase = 'sweep'; this.t = 0; A.set('interact'); S.stats.sweeps++; return { desired: 0, tx: null, tz: null, avoid: false };
      }
      case 'sweep': {
        p.faceYaw = Math.atan2(q.x - p.x, q.z - p.z);
        if (!A.action || A.action !== 'interact') A.set('interact');
        this.sys.sweepSound(p, dt);
        if (this.t > 3.4 + (this.seed % 5) * 0.35) {
          p.faceYaw = null; this.i += this.dir;
          if (this.i >= this.beat.length) { this.dir = -1; this.i = this.beat.length - 2; }
          if (this.i < 0) { this.dir = 1; this.i = 1; }
          this.phase = 'walk'; if (A.action === 'interact') A.set(null);
        }
        return { desired: 0, tx: null, tz: null, avoid: false };
      }
      default: this.phase = 'walk'; return { desired: 0, tx: null, tz: null, avoid: false };
    }
  }
  moveTo(x, z, speed) {
    const p = this.p, d = Math.hypot(x - p.x, z - p.z);
    if (d < 0.4) return null;
    return { desired: Math.min(speed, 0.3 + d), tx: x, tz: z, avoid: d > 1.0, accel: 2.5 };
  }
  post() { const p = this.p; if (!p) return; if (this.broom && p.ch.anim.ik == null) p.ch.anim.ik = { R: HAND, qR: null, wR: 1, poleR: ELBOW, L: null }; }
}

// ------------------------------------------------------------------------------------------------ one collection round
class RefuseRun {
  constructor(sys, bins, seed) {
    this.sys = sys; this.bins = bins; this.seed = seed; this.phase = 'drive'; this.t = 0; this.truck = null; this.loader = null; this.bi = 0; this.done = 0;
    this.job = { step: (p, dt) => this.stepLoader(p, dt), post: () => {}, interrupt: () => { this.phase = 'abort'; }, resume: () => { this.phase = 'load'; } };
  }
  start() {
    const S = this.sys, T = S.g.traffic; if (!T) return false;
    const b0 = this.bins[0]; const ln = T.laneNear(b0.x, b0.z, 0, 30); if (!ln) return false;
    try {
      const v = new Vehicle('lorry', 7300 + this.seed, S.scene);
      ln.s = clamp(ln.s, 4, ln.piece.len - 8);
      T.adoptAI(v, ln, { v0: 6 }); T.addDriver(v); v.speed = 0; v.hold = true; v.refuse = true; v.brake = true;
      this.truck = v;
      // the loader steps out of the cab and works the bins
      const C = S.crowd; if (!C) return false;
      const sp = makeAppearance(9400 + this.seed, { preset: 'm_cmc_cleaner' });
      const p = C.makePed(sp, v.x + 1.4, v.z + 0.6, C.nearestNode(v.x, v.z)?.id ?? b0.node);
      if (p) { Object.assign(p, { state: 'job', job: this.job, keep: true, pace: 1.1, umbrella: false, jog: false, edge: null, route: null }); this.loader = p; C.place(p); }
      this.phase = 'load'; this.t = 0; S.stats.runs++;
      return true;
    } catch (e) { console.warn('[street services] refuse truck', e); return false; }
  }
  stepLoader(p, dt) {
    this.t += dt;
    if (this.phase === 'abort' || this.bi >= this.bins.length) { // back to the cab
      const d = Math.hypot(p.x - this.truck.x, p.z - this.truck.z);
      if (d < 2.0 || this.t > 90) { this.end(); return { desired: 0, tx: null, tz: null, avoid: false }; }
      return { desired: 1.15, tx: this.truck.x + 1.2, tz: this.truck.z + 0.4, avoid: d > 1.2, accel: 2.5 };
    }
    const b = this.bins[this.bi]; const d = Math.hypot(p.x - b.x, p.z - b.z); this.dist = d;
    // the bin itself is solid, so "at the bin" is within arm's reach of it, not standing in it
    if (d > 1.35) { this.emptying = 0; return { desired: d > 2.2 ? 1.2 : 0.85, tx: b.x, tz: b.z, avoid: d > 1.6, accel: 2.5 }; }
    p.faceYaw = Math.atan2(b.x - p.x, b.z - p.z);
    const A = p.ch.anim; if (process.env.DSRV) console.log('DSRV', d.toFixed(2), 'emp', this.emptying?.toFixed(2), 'bi', this.bi, 't', this.t.toFixed(1), 'fill', b.fill.toFixed(2)); if (A && !A.action) A.set('interact');
    this.emptying = (this.emptying || 0) + dt;
    if (this.emptying > 2.6) {
      b.fill = 0; b.emptiedAt = this.sys.day; this.done++; this.sys.stats.binsEmptied++;
      this.sys.binSound(b); this.emptying = 0; this.bi++;
      if (this.bi >= this.bins.length) A.set(null);
    }
    return { desired: 0, tx: null, tz: null, avoid: false };
  }
  step(dt) { // the truck holds at the kerb while the loader works, then rejoins the traffic
    this.t += dt; if (this.truck && this.truck.disposed) { this.truck = null; this.end(); return; }
    if (this.truck) { this.truck.speed = 0; this.truck.hold = this.phase === 'load' || this.phase === 'abort'; this.truck.brake = true; }
    if (this.phase === 'load' && (this.bi >= this.bins.length || this.t > 110)) this.phase = 'finish';
    if (this.phase === 'finish') { if (this.truck) { this.truck.hold = false; this.truck.brake = false; this.truck.refuse = false; } this.end(false); }
  }
  end(dropLoader = true) {
    const S = this.sys;
    if (this.loader) { const p = this.loader; this.loader = null; p.job = null; p.keep = false; if (p.ch.crowdPed === p && !p.dead) { p.state = 'walk'; S.crowd.returnToGraph(p); } }
    if (this.truck) { const v = this.truck; this.truck = null; v.hold = false; v.refuse = false; if (!v.ai) { S.g.traffic.remove(v); } } // (with ai it drives on; without one it is taken out of the world)
    this.phase = 'done'; S.run = null;
  }
}

// ------------------------------------------------------------------------------------------------ the service
export class StreetServices {
  constructor(game) {
    this.g = game; this.crowd = game.crowd; this.scene = game.scene; this.collision = game.collision;
    this.bins = []; this.beats = []; this.crew = []; this.run = null; this.hour = 12; this.day = 1; this.t = 0; this.frame = 0; this.seed = 1;
    this.matCart = new THREE.MeshStandardMaterial({ color: 0x2c6b3f, roughness: 0.8, metalness: 0.1 });
    this.matBroom = new THREE.MeshStandardMaterial({ color: 0x9a6a42, roughness: 0.95 });
    this.matBin = new THREE.MeshStandardMaterial({ color: 0x1b4a28, roughness: 0.72, metalness: 0.15 });
    this.stats = { crew: 0, sweeps: 0, runs: 0, binsEmptied: 0, fill: 0, released: 0 };
    this.fillT = 0; this.runDay = 0; this.sweepT = 0;
  }
  // during loading: read the bins the city built, work out the beats (all deterministic)
  prewarm() {
    const t0 = performance.now(); this.seed = 1;
    this.bins = this.collision.list.filter((c) => c.bin).map((c, i) => ({ id: i, x: (c.x0 + c.x1) / 2, z: (c.z0 + c.z1) / 2, fill: 0, rate: 0, emptiedAt: -9, c }));
    if (!this.bins.length) this.synthBins(); // (a city without the street-dressing bins: put some where the shops are)
    this.pickBeats(); this.prewarmMs = performance.now() - t0; return this.prewarmMs;
  }
  // fallback: bins on the pavement outside busy shops, 45 m apart, solid and visible (one instanced mesh, one draw call)
  synthBins() {
    const r2 = new RNG(45429);
    const spots = []; const shops = plan.poi.filter((q) => q.type === 'shop');
    for (let t = 0; t < 900 && spots.length < 70; t++) {
      const q = shops[r2.int(0, shops.length - 1)]; if (!q) continue;
      let best = null, bd = Infinity; for (const n of L.pedNodes) { const d = (n.x - q.x) ** 2 + (n.z - q.z) ** 2; if (d < bd) { bd = d; best = n; } }
      if (!best || bd > 400) continue;
      const x = best.x, z = best.z; if (this.collision.blocked(x, z, 0.55) || L.roadAt(x, z)) continue;
      if (spots.some(([a, b]) => Math.hypot(a - x, b - z) < 45)) continue; if (L.isWater(x, z)) continue;
      spots.push([x, z]);
    }
    if (!spots.length) return;
    const geo = new THREE.CylinderGeometry(0.27, 0.3, 0.9, 10, 1, false); geo.translate(0, 0.45, 0);
    const mesh = new THREE.InstancedMesh(geo, this.matBin, spots.length); mesh.name = 'litter-bins'; mesh.castShadow = true; mesh.receiveShadow = true;
    const m = new THREE.Matrix4(), q4 = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1), v3 = new THREE.Vector3();
    spots.forEach(([x, z], i) => { m.compose(v3.set(x, L.LAND_Y, z), q4.identity(), sc); mesh.setMatrixAt(i, m); this.collision.add({ x0: x - 0.3, x1: x + 0.3, z0: z - 0.3, z1: z + 0.3, h: 0.95, kind: 'prop', bin: true });
      this.bins.push({ id: i, x, z, fill: 0, rate: 0.06, emptiedAt: -9, c: null }); });
    mesh.instanceMatrix.needsUpdate = true; this.scene.add(mesh); this.binMesh = mesh;
  }
  // a beat: twelve sidewalk-graph nodes out from a busy street corner (kept on the pavement, never along a road)
  pickBeats() {
    const rng = new RNG(0x5eed);
    const busy = plan.poi.filter((q) => q.type === 'shop').map((q) => q);
    const out = [];
    for (let k = 0; k < 4; k++) {
      let best = null, bd = -1;
      for (let t = 0; t < 60; t++) {
        const q = busy[rng.int(0, busy.length - 1)]; if (!q) continue;
        let n = null, nd = Infinity; for (const pn of L.pedNodes) { const d = (pn.x - q.x) ** 2 + (pn.z - q.z) ** 2; if (d < nd) { nd = d; n = pn; } }
        if (!n || nd > 900) continue; if (out.some((b) => Math.hypot(b[0].x - n.x, b[0].z - n.z) < 260)) continue;
        if (nd > bd) { bd = nd; best = n; }
      }
      if (!best) continue;
      const beat = [{ x: best.x, z: best.z, node: best.id }]; let cur = best, last = -1;
      for (let s = 0; s < 13; s++) {
        const opts = cur.edges.map((id) => L.pedEdges[id]).filter((e) => e && e.type !== 'cross' && e.id !== last); if (!opts.length) break;
        const e = opts[rng.int(0, opts.length - 1)]; const o = L.pedNodes[e.a === cur.id ? e.b : e.a]; if (!o) break;
        beat.push({ x: o.x, z: o.z, node: o.id }); last = e.id; cur = o;
      }
      if (beat.length >= 6) out.push(beat);
    }
    this.beats = out;
  }
  // how fast the bins here fill: the business around them, cached every half minute of game time
  refreshRates() {
    const B = this.g.crowd && this.g.crowd.biz;
    for (const b of this.bins) {
      let f = 0.06; // a pavement bin always collects something
      if (B && this.crowd) { let n = 0; for (const q of this.crowd.nearPOIs(b.x, b.z, 26)) { if (q.type !== 'shop' && q.type !== 'vendor') continue; f += B.footfall(q) * 0.16; if (++n > 6) break; } }
      b.rate = f;
    }
  }
  wantRelease(w) { const i = this.crew.indexOf(w); if (i >= 0) this.crew.splice(i, 1); w.release(); this.stats.released++; }
  sweepSound(p, dt) { // the brush, positionally, in strokes
    if (!Audio.live) return; this.sweepT -= dt; if (this.sweepT > 0) return; this.sweepT = 0.42 + Math.random() * 0.2;
    const A = Audio.at(p.x, p.z, 7); if (A.g < 0.02) return;
    Audio.noise(0.16, { f: 1700 + Math.random() * 900, q: 0.7, vol: 0.035 * A.g, pan: A.pan, lp: A.lp });
  }
  binSound(b) { const A = Audio.at(b.x, b.z, 8); if (A.g < 0.02) return; Audio.noise(0.22, { f: 640, q: 1.2, vol: 0.05 * A.g, pan: A.pan }); Audio.tone(180, 0.2, { type: 'triangle', vol: 0.03 * A.g, pan: A.pan }); }
  // ------------------------------------------------------------------ per frame
  update(dt, focus, ctx) {
    this.t += dt; this.frame++; this.hour = ctx.hour ?? this.hour; this.day = ctx.day ?? this.day;
    // bins fill (four passes a second is plenty for a slow number)
    this.fillT += dt;
    if (this.fillT > 0.25) {
      const k = this.fillT; this.fillT = 0;
      if (this.frame % 120 === 0) this.refreshRates();
      let busy = 0;
      for (const b of this.bins) { const d = Math.hypot(b.x - focus.x, b.z - focus.z); if (d > 160) continue; b.fill = Math.min(1, b.fill + b.rate * 0.0022 * k * (1 - b.fill * 0.35)); busy += b.fill; }
      this.stats.fill = this.bins.length ? +(this.bins.reduce((a, b) => a + b.fill, 0) / this.bins.length).toFixed(3) : 0;
      void busy;
    }
    // sweepers exist only on their beats near the player
    const near = this.beats.map((beat) => [Math.hypot(beat[0].x - focus.x, beat[0].z - focus.z), beat]).sort((a, b) => a[0] - b[0]);
    const have = new Set(this.crew.map((w) => w.beat));
    for (const [d, beat] of near) {
      const w = this.crew.find((q) => q.beat === beat);
      if (d < ACTIVE_R && !w && inShift(this.hour)) { const s = new Sweeper(this, beat, 6600 + beat[0].node * 31); s.spawn(); if (s.p) { this.crew.push(s); } }
      else if (w && (d > DROP_R || !inShift(this.hour))) this.wantRelease(w);
    }
    void have;
    // the evening round: one collection per in-game day, somewhere near the player
    if (!this.run && this.hour > 20.4 && this.hour < 22.6 && this.runDay !== this.day) {
      const cand = this.bins.filter((b) => b.fill > 0.45 && Math.hypot(b.x - focus.x, b.z - focus.z) < 150);
      if (cand.length >= 1) {
        cand.sort((a, b) => (a.fill === b.fill ? 0 : b.fill - a.fill));
        const group = []; for (const b of cand.slice(0, 5)) group.push(b); { const run = new RefuseRun(this, group, this.day * 17 + group[0].id); if (run.start()) { this.run = run; this.runDay = this.day; } }
      }
    }
    if (this.run) { const r = this.run; r.step(dt); if (this.run === r && r.phase === 'done') this.run = null; }
  }
  info() { return { crew: this.crew.length, bins: this.bins.length, fill: this.stats.fill, run: this.run ? this.run.phase : null, day: this.runDay }; }
  serialize() { return { v: 1, day: this.runDay, bins: this.bins.map((b) => +b.fill.toFixed(3)) }; }
  restore(d) { if (!d) return; this.runDay = d.day || 0; if (d.bins && d.bins.length === this.bins.length) for (let i = 0; i < this.bins.length; i++) this.bins[i].fill = clamp(d.bins[i] || 0, 0, 1); }
}
