// 66th request — object pooling for police units. The squad cars / jeeps and their two-officer crews are built while the
// game loads (enter-game loading screen) and kept out of the scene: not drawn, not simulated, not in any traffic,
// collision or body list. A wanted level / patrol / roadblock / street-fight call takes a unit from the pool and places it
// where it starts; when the unit leaves, despawns or is recycled, the car is reset (repaired, doors shut on the latch,
// beacons off, every per-chase field cleared) and goes back with its surviving crew still seated. Officers who were on foot
// go back as spares. Nothing is created or destroyed while police are out.
//   Built at load: POOL.police cars + POOL.policejeep jeeps (each with 2 seated officers carrying their slung T-56) and
//   POOL.spare officers that replace casualties. If the pool runs dry mid-chase the request waits (a dispatch retries a
//   moment later, a roadblock is skipped) — no car is built. Before the pool exists (the Node tests) the old build path runs.
//   A car that cannot be reused (burnt out / burning, someone dead in a seat, taken by the player, abandoned where its crew
//   died, towed) leaves the pool; replacements are built only when nobody is wanted (after POOL.calmAfter s of calm, one
//   every POOL.refillGap s), so the pool is back to full size before the next chase.
//   73rd: one ambulance with its two-medic crew is pooled the same way (EMS.js answers the player's 119 calls with it), and
//   while wanted a lost car is replaced by the car alone (≈1 ms — its crew comes off the spare bench): building an officer
//   (a whole skinned body, 30–100 ms) mid-chase was a visible hitch. Everything in the pool, with the slung rifles, their
//   flash / torch parts and a hand torch per officer, is shader-compiled and GPU-uploaded on the loading screen (warmGroup).
import { trolleyOf, seatTrolley } from './EMS.js';
import { homeKit } from './RoadsideJob.js';
import * as THREE from 'three';
import { Vehicle, LIVE_VEHICLES } from '../vehicles/Vehicle.js';
import { Character } from '../actors/Character.js';
import { seatCharacter } from '../actors/Seating.js';
import { resetDoors } from '../vehicles/DoorRig.js';

export const POOL = { enabled: true, police: 7, policejeep: 3, ambulance: 1, rsvan: 2, flatbed: 1, spare: 5, refillGap: 2.0, calmAfter: 6, wantedLow: 2, wantedGap: 9 }; // wantedLow / wantedGap: 69th, see update
export const POOL_TYPES = ['police', 'policejeep']; // the police units (they stand in for each other)
// + the EMS ambulance (never swapped with a police car); 80th: + the roadside service vans and the flatbed (Roadside.js)
export const CIV_KIND = { ambulance: true, rsvan: 'rsvan', flatbed: 'flatbed' }; // crewSpec's `ems` argument per civilian type
const ALL_TYPES = [...POOL_TYPES, ...Object.keys(CIV_KIND)];

// the two crew seats of a police vehicle: the driver and the passenger seat nearest him (front passenger)
export function crewSeats(seats) {
  const di = seats.findIndex((q) => q.driver);
  const pi = seats.map((q, i) => i).filter((i) => i !== di).sort((i, j) => Math.abs(seats[i].z - seats[di].z) - Math.abs(seats[j].z - seats[di].z))[0];
  return [di, pi];
}
// object-valued fields a pooled car keeps across uses (everything else added during a chase is dropped on release)
// 84th: + the ambulance's one cot (EMS v.trolley) and a service van's equipment (RoadsideJob v.rsKit) — they belong to the vehicle for
// life. reset() used to delete them: the next call built a second cot / kit while the first one still sat in the compartment
// (the repeat-call "duplicated trolley": two cots in one van, both orphaned)
const KEEP = new Set(['T', 'mesh', 'scene', 'sus', 'poolEntry', 'trolley', 'rsKit']);

export class UnitPool {
  // pr: PoliceResponse; crewSpec(id, k, ems): the crew look (PoliceResponse.crewSpec, passed in: no import cycle)
  constructor(pr, crewSpec) {
    this.pr = pr; this.crewSpec = crewSpec; this.free = { police: [], policejeep: [], ambulance: [], rsvan: [], flatbed: [] }; this.out = new Set(); this.spare = []; this.nextId = 0;
    this.ready = false; this.calmT = 0; this.refillT = 0;
    this.stats = { built: 0, spareBuilt: 0, acquired: 0, released: 0, swapped: 0, misses: 0, crewFromSpare: 0, crewBuilt: 0, toSpare: 0, discarded: 0, lost: 0, refilled: 0, builtWanted: 0 };
  }
  get g() { return this.pr.g; }
  size(type) { let n = this.free[type].length; for (const e of this.out) if (e.type === type) n++; return n; }
  freeCount() { return this.free.police.length + this.free.policejeep.length; }
  // ---------------------------------------------------------------- building (loading screen / calm refill only)
  stash(v) { v.mesh.parent?.remove(v.mesh); LIVE_VEHICLES.delete(v); v.pooled = true; }
  unstash(v) { this.g.scene.add(v.mesh); LIVE_VEHICLES.add(v); v.pooled = false; }
  makeRec(look, k, ems = false) {
    const ch = new Character(this.crewSpec(look, k, ems)); ch.mesh.castShadow = false;
    const tmp = { ch }; if (!ems && this.pr.ff && this.pr.ff.arm) this.pr.ff.arm(tmp); // the slung T-56 lives on the body (chest bone) from now on
    let torchM = null; if (!ems && this.pr.ff && this.pr.ff.handTorch) { torchM = this.pr.ff.handTorch(ch); } // 73rd: the night hand torch, built now (not at its first use mid-chase)
    this.stats.crewBuilt++; if (this.ready && this.pr.level > 0) this.stats.crewBuiltWanted = (this.stats.crewBuiltWanted || 0) + 1; return { ch, rifle: tmp.rifle || null, rp: tmp.rp || null, torchM };
  }
  // crew: false = the car alone (73rd: a replacement while wanted; acquire seats spares in it)
  build(type, crew = true) {
    const id = this.nextId++; const v = new Vehicle(type, 3000 + id * 7, this.g.scene); this.stash(v); v.keep = true; const ems = CIV_KIND[type] || false;
    const fresh = {}; for (const k of Object.keys(v)) { const x = v[k]; if (x === null || (typeof x !== 'object' && typeof x !== 'function')) fresh[k] = x; } // the new car's own plain state (restored on release)
    const seats = v.mesh.userData.seats; const cs = crewSeats(seats); const e = { id, type, v, fresh, seats: cs, crew: [null, null] };
    if (crew) cs.forEach((si, k) => { if (si === undefined || si < 0) return; const r = this.makeRec(id, k, ems); seatCharacter(r.ch, v, seats[si]); e.crew[k] = r; });
    if (type === 'ambulance') trolleyOf(v); // 84th: its one cot, built with it on the loading screen (stable id, never rebuilt)
    v.poolEntry = e; this.free[type].push(e); this.stats.built++; if (this.pr.level > 0) this.stats.builtWanted++; return e;
  }
  buildSpare() { const n = this.stats.spareBuilt++; const r = this.makeRec(1000 + n, n % 2); this.spare.push(r); return r; }
  // enter-game loading: fill the pool (yields between units so the loading bar moves); idempotent
  async prepare(progress = null, yieldFn = null) {
    const todo = []; for (const t of ALL_TYPES) for (let n = this.size(t); n < POOL[t]; n++) todo.push(t); for (let n = this.spare.length; n < POOL.spare; n++) todo.push('spare');
    for (let i = 0; i < todo.length; i++) { try { if (todo[i] === 'spare') this.buildSpare(); else this.build(todo[i]); } catch (e) { console.warn('police pool', e); } if (progress) progress((i + 1) / todo.length); if (yieldFn) await yieldFn(); }
    this.ready = true; return todo.length;
  }
  // the pooled cars (out of the scene) for the shader / GPU-upload warm-up at load
  meshes() { const out = []; for (const t of ALL_TYPES) for (const e of this.free[t]) out.push(e.v.mesh); return out; }
  // 73rd: everything a unit shows when it appears / its crew gets out, laid out in front of the loading camera for one compile +
  // one drawn frame (Game.warmPolice): the cars with their seated crews, the spare officers, every officer's rifle with its
  // muzzle flash and rail torch, the hand torches. Programs that were first built when a unit drove into view (a frame drop
  // when cops arrived) are compiled here instead; geometry / textures are uploaded. restore() puts everything back.
  warmGroup(cam) {
    const grp = new THREE.Group(); grp.name = 'policeWarm'; const undo = [];
    const f = new THREE.Vector3(); cam.getWorldDirection(f); f.y = 0; f.normalize(); const r = new THREE.Vector3(-f.z, 0, f.x); let i = 0;
    const slot = (o) => { const row = Math.floor(i / 5), col = (i % 5) - 2; i++; o.position.copy(cam.position).addScaledVector(f, 9 + row * 5).addScaledVector(r, col * 3.2); o.position.y = cam.position.y - 1.6; };
    const show = (o) => { if (o && !o.visible) { o.visible = true; undo.push(() => { o.visible = false; }); } };
    const rec = (q) => { if (!q) return; if (q.rifle) { show(q.rifle); show(q.rifle.userData.flash); show(q.rifle.userData.torch); } if (q.torchM) show(q.torchM); };
    for (const t of ALL_TYPES) for (const e of this.free[t]) { const m = e.v.mesh; const p0 = m.position.clone(); grp.add(m); slot(m); m.updateMatrixWorld(true); undo.push(() => { m.position.copy(p0); m.parent?.remove(m); }); e.crew.forEach(rec); }
    for (const q of this.spare) { const root = q.ch.root; const par = root.parent; grp.add(root); slot(root); rec(q); undo.push(() => { root.parent?.remove(root); if (par) par.add(root); }); }
    grp.userData.restore = () => { for (let k = undo.length - 1; k >= 0; k--) undo[k](); grp.parent?.remove(grp); }; return grp;
  }
  // ---------------------------------------------------------------- acquire / release
  // a ready unit placed at (x, z, yaw) with its crew seated, or null (pool empty). The other type stands in when one runs out.
  acquire(type, x, z, yaw) {
    if (!POOL.enabled || !this.ready) return null; const ems = CIV_KIND[type] || false;
    let list = this.free[type]; if (ems && (!list || !list.length)) { this.stats.misses++; return null; }
    if (!list || !list.length) { const alt = POOL_TYPES.find((t) => t !== type && this.free[t].length); if (!alt) { this.stats.misses++; return null; } list = this.free[alt]; this.stats.swapped++; }
    const e = list.pop(); const v = e.v; this.unstash(v); v.place(x, z, yaw); v.speed = 0;
    const seats = v.mesh.userData.seats;
    for (let k = 0; k < 2; k++) { const si = e.seats[k]; if (si === undefined || si < 0 || e.crew[k]) continue;
      let r = ems ? null : this.spare.pop(); if (r) this.stats.crewFromSpare++; else r = this.makeRec(e.id, k, ems); // (a medic who died is rebuilt: rare) // (a spare is always there unless more officers died than POOL.spare)
      seatCharacter(r.ch, v, seats[si]); e.crew[k] = r; }
    this.out.add(e); this.stats.acquired++; return e;
  }
  // a unit's vehicle comes back (PoliceResponse.removeUnit). true = the car and every living officer went back to the pool:
  // the caller must not dispose anything. false = not a pooled car / cannot be reused (the caller disposes as before).
  release(u) {
    const v = u && u.v; const e = v && v.poolEntry; if (!e || !this.out.has(e)) return false;
    if (v.player || v.disposed || v.wrecked || v.burning || (v.vd && v.vd.fire) || (v.deadOcc && v.deadOcc.length) || v.towing || v.towedBy || v.abandoned) { this.out.delete(e); v.poolEntry = null; this.stats.discarded++; return false; }
    const keep = [null, null]; const kept = new Set();
    for (const o of u.officers) { if (o.dead || !o.ch || o.ch.disposed || o.ch.rag) continue; // (the dead belong to the bodies list)
      const rec = { ch: o.ch, rifle: o.rifle || null, rp: o.rp || null, torchM: o.torchM || null }; kept.add(o.ch);
      const k = o.k; if (k >= 0 && k < 2 && !keep[k]) keep[k] = rec; else if (CIV_KIND[e.type]) this.drop(rec); else this.toSpare(rec); } // (an officer on foot goes back into his own seat: the unit is removed out of view / behind the arrest fade)
    for (const ch of v.pax || []) if (!kept.has(ch) && !ch.disposed) { ch.root.parent?.remove(ch.root); ch.dispose(); } // detainees still in the back
    if (v.driverChar && !kept.has(v.driverChar) && !v.driverChar.disposed) { v.driverChar.root.parent?.remove(v.driverChar.root); v.driverChar.dispose(); }
    this.reset(e);
    const seats = v.mesh.userData.seats;
    for (let k = 0; k < 2; k++) { const r = keep[k]; if (!r) continue; if (this.dirty(r.ch)) { this.drop(r); keep[k] = null; continue; } this.clean(r); seatCharacter(r.ch, v, seats[e.seats[k]]); }
    e.crew = keep; this.stash(v); this.out.delete(e); this.free[e.type].push(e); this.stats.released++; return true;
  }
  // an officer back to the spare bench (off the scene graph), or disposed when the bench is full / he is bloodied
  toSpare(r) { r.ch.root.parent?.remove(r.ch.root); if (this.dirty(r.ch) || this.spare.length >= POOL.spare + 2) { this.drop(r); return; } this.clean(r); this.spare.push(r); this.stats.toSpare++; }
  dirty(ch) { return !!ch.bloodMat; } // a wounded officer is not sent out again as a fresh crew
  drop(r) { r.ch.root.parent?.remove(r.ch.root); r.ch.dispose(); }
  clean(r) {
    const ch = r.ch, A = ch.anim; if (A) { A.ik = null; A.aim = null; A.board = null; A.duck = 0; if (A.set) A.set(null); if (A.standUp) A.standUp(); }
    if (ch.capOff && this.g.caps && this.g.caps.restore) this.g.caps.restore(ch); // the cap that fell off stays where it lies; he gets his own back
    if (r.torchM) r.torchM.visible = false;
    if (r.rifle) { const m = r.rifle; m.visible = false; if (m.userData.flash) m.userData.flash.visible = false; if (m.userData.torch) m.userData.torch.visible = false; if (r.rp) { r.rp.draw = 0; r.rp.aim = 0; r.rp.kick = 0; r.rp.flashT = 0; m.matrix.copy(r.rp.slingM); } }
  }
  // the car back to the state it was built in: repaired, doors on the latch, beacons / lamps off, per-chase fields gone
  reset(e) {
    const v = e.v, g = this.g; if (g.vdamage && g.vdamage.repair) g.vdamage.repair(v);
    resetDoors(v); for (const w of v.mesh.userData.wheels || []) if (w.userData) { w.userData.flat = false; w.userData.drop = 0; }
    if (v.beacons) v.beacons(false); if (v.trolley && v.trolley.state !== 'stowed') seatTrolley(v); if (v.trolley) v.trolley.sheet = false; if (v.rsKit) homeKit(v); // nothing left lying in the street
    for (const k of Object.keys(v)) { if (k in e.fresh) v[k] = e.fresh[k]; else if (!KEEP.has(k)) delete v[k]; }
    v.sus.r = v.sus.rv = v.sus.h = v.sus.hv = 0; v.keep = true; v.poolEntry = e; v.pooled = false; v.pax = []; v.paxPlan = []; v.driverChar = null;
  }
  // ---------------------------------------------------------------- per frame (cheap): forget cars that left for good; refill while calm
  update(dt) {
    for (const e of this.out) { const v = e.v; if (v.poolEntry !== e || v.disposed || v.player || !v.police) { this.out.delete(e); if (v.poolEntry === e) v.poolEntry = null; this.stats.lost++; } } // (Roadside units keep v.police = u too)
    if (!this.ready || !POOL.enabled) return;
    const pr = this.pr; this.calmT = pr.level > 0 || pr.busy || pr.cine ? 0 : this.calmT + dt; this.refillT -= dt;
    // 69th: a long fight that burns / wrecks / loses cars must not run the pool dry (the police would simply stop coming): while
    // wanted and down to POOL.wantedLow free cars, one replacement car every POOL.wantedGap s (a single car off the scene graph)
    if (this.calmT < POOL.calmAfter) { if (pr.level > 0 && this.refillT <= 0 && this.freeCount() < POOL.wantedLow) { const t = POOL_TYPES.find((q) => this.size(q) < POOL[q]); if (t) { const t0 = performance.now(); this.build(t, false); this.stats.refilled++; this.stats.wantedBuildMs = Math.max(this.stats.wantedBuildMs || 0, performance.now() - t0); this.refillT = POOL.wantedGap; } } return; }
    if (this.refillT > 0) return;
    const need = ALL_TYPES.find((t) => this.size(t) < POOL[t]); // a car lost for good (burnt out, stolen, abandoned)
    if (need) { this.build(need); this.stats.refilled++; this.refillT = POOL.refillGap; return; }
    // officers: enough spares for every empty seat in the free cars plus POOL.spare more — so the next chase builds nobody
    let empty = 0; for (const t of POOL_TYPES) for (const e of this.free[t]) for (let k = 0; k < 2; k++) if (e.seats[k] >= 0 && !e.crew[k]) empty++;
    for (const t of Object.keys(CIV_KIND)) for (const e of this.free[t]) for (let k = 0; k < 2; k++) if (e.seats[k] >= 0 && !e.crew[k]) { const r = this.makeRec(e.id, k, CIV_KIND[t]); seatCharacter(r.ch, e.v, e.v.mesh.userData.seats[e.seats[k]]); e.crew[k] = r; this.stats.refilled++; this.refillT = POOL.refillGap * 0.5; return; } // a medic lost: rebuilt while calm
    if (this.spare.length < POOL.spare + empty) { this.buildSpare(); this.stats.refilled++; this.refillT = POOL.refillGap * 0.5; }
  }
}
