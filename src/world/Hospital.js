// 74th request — the National Hospital at runtime (g.hospital). The building itself is static data + geometry
// (HospitalPlan.js / HospitalBuild.js, built once at load by World); this file makes it a place:
//   • seamless entry: walking through the automatic doors hands the player to the building's own floor / obstacle model
//     (P.indoor = this.room — two floors, the stair flight, the lift), the city keeps running outside, the outdoor →
//     indoor light adaptation is the Police HQ / walk-in blend (Game seamK)
//   • visibility: the exterior shell is one merged set per material with a 3-draw far LOD; inside, only the rooms that can
//     be seen are drawn — the player's room, the rooms seen through open portals (HospitalPlan.visibleRooms) and the
//     camera's room; nothing of the other floor unless you are on the stairs / in the lift. From the street only the
//     glazed front rooms (lobby, ED) are drawn, and only near. Hospital staff are hidden with their rooms.
//   • lights: no light of its own — the walk-in shops' pool of six point lights (WalkIn.setActive) is lent to the hospital
//     while nobody is in a shop, placed at the six nearest ceiling panels of the rooms on screen (no shader recompiles)
//   • doors: automatic sliding entrances (people and the player), hinged room doors (interact key; staff open them as they
//     walk through; a closer brings them back), the ED / ward doubles held open, the lift (call, ride, doors, chime)
//   • staff and visitors: receptionist, ward nurse, ED nurse, doctor, a waiting visitor and a ward patient — one Character
//     each, made once and reused (no spawning), simple routines on fixed routes; animation / AI by distance tiers
//   • recovery after death / collapse: the player wakes in a private room bed; a nurse or doctor at the bedside speaks one
//     of four lines (never the same twice running) and the bill is issued through the bank (story/HospitalBilling.js)
import * as THREE from 'three';
import { Character } from '../actors/Character.js';
import { makeAppearance } from '../actors/Appearance.js';
import { routine } from '../actors/Routine.js';
import { seatTopFor } from './ClubCast.js';
import { MeshBuilder } from '../gfx/MeshBuilder.js';
import { Input } from '../core/Input.js';
import { HOSP, Y0, FLOOR_Y, toWorld, toLocal, ROOM, FURNITURE, STAIR, LIFT, SPOTS, BEDSIDE, RECOVERY_BEDS, BED, roomAt, visibleRooms, inRect } from './HospitalPlan.js';
import { itemFrame, COL } from './HospitalKit.js';
import { HospitalSound } from '../audio/HospitalAudio.js';
import { RECOVERY_LINES, RECEPTION_LINES } from '../audio/HospitalSoundDefs.js';
import { hospitalState, admit, billRecovery, invoiceText } from '../story/HospitalBilling.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const sstep = (k) => { k = clamp(k, 0, 1); return k * k * (3 - 2 * k); };
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const turn = (a, b, k) => a + wrap(b - a) * Math.min(1, k);
const R = 0.3; // player radius inside
const LOD_FAR = 175, LOD_NEAR = 155, INT_FAR = 70, NPC_FULL = 22, NPC_LOW = 60;
const charYaw = (itemYaw) => Math.PI - itemYaw; // item facing (sin y, −cos y) → Character yaw (faces (sin a, cos a))
const S2 = (k) => SPOTS[k];
const bodyH = (ch) => (ch.spec && ch.spec.height) || 1.7;

// ------------------------------------------------------------------ adjustable seats (the npc-tagged chairs)
// the kit leaves the seat + back off these chairs; here they are one instanced shell per room and type, raised / lowered
// to whoever sits (seat top = seatTopFor(sitter): no body is ever scaled or sunk to fit a chair)
function shellGeo(kind) {
  const b = new MeshBuilder();
  if (kind === 'office') { b.box(0, -0.035, 0.02, 0.48, 0.07, 0.46, { col: COL.navy, bottom: true }); b.box(0, 0.33, -0.22, 0.44, 0.5, 0.06, { col: COL.navy }); b.box(0, 0.12, -0.22, 0.05, 0.2, 0.03, { col: COL.dark }); b.box(0, -0.22, 0, 0.05, 0.3, 0.05, { col: COL.dark }); }
  else { b.box(0, -0.025, 0.02, 0.5, 0.05, 0.44, { col: COL.seat, bottom: true }); b.box(0, 0.275, -0.2, 0.5, 0.42, 0.05, { col: COL.seat }); b.box(0.27, 0.135, 0, 0.04, 0.03, 0.36, { col: COL.dark }); b.box(0, -0.2, -0.05, 0.05, 0.32, 0.05, { col: COL.steel }); }
  return b.build();
}

export class Hospital {
  constructor(game) {
    const g = (this.g = game); const hb = (this.hb = game.world.hospitalBuild);
    this.rooms = hb.rooms; this.doors = hb.doors; this.sliders = hb.sliders; this.obs = hb.obs;
    this.doorById = Object.fromEntries(this.doors.map((D) => [D.id, D]));
    this.open = {}; for (const D of this.doors) { this.open[D.id] = D.k; D.hold = 0; if (D.closedBox && D.obs) D.obs.closed = true; }
    this.lift = { floor: 0, target: 0, state: 'idle', t: 0, doors: [0, 0], want: [0, 0], ride: false };
    this.vis = new Set(); this.visKey = ''; this.curRoom = null; this.camRoom = null; this.k = 0; this.lodFar = false; this.wantsPool = false;
    this.stats = { frames: 0, roomsDrawn: 0, enters: 0, exits: 0, recoveries: 0, ms: 0 };
    this.prompt = ''; this.near = null; this.seat = null; this.lying = null; this.recovering = null; this.talkCd = 0; this.recLine = 0; this.phoneT = 70;
    this.srcs = [{ key: 'chat', id: 'hosp.chatter', x: 0, z: 0, ref: 5, lvl: 1, on: true }, { key: 'mon', id: 'hosp.monitor', x: 0, z: 0, ref: 3, lvl: 1, on: true }];
    { const [x, z] = toWorld(-1.2, 7.0); this.srcs[0].x = x; this.srcs[0].z = z; const [mx, mz] = toWorld(-6.0, 0.6); this.srcs[1].x = mx; this.srcs[1].z = mz; }
    this.toWorld = toWorld; this.toLocal = toLocal; this.FLOOR_Y = FLOOR_Y; this.plan = { SPOTS, STAIR, LIFT, BED, FURNITURE }; // (tools / tests)
    this.room = this.makeRoom(); this.buildSeats(); this.makePeople();
    if (g.interiors && g.interiors.walkIn) g.interiors.walkIn.ext = this;
  }
  // ================================================================ the player's indoor model (Player.js P.indoor hooks)
  makeRoom() {
    const H = this; const b = this.hb.bounds;
    return {
      id: 'hospital', hospital: true, multiFloor: true, seamless: true, D: { name: HOSP.name }, y: Y0, H: HOSP.H, bounds: { x0: b.x0, x1: b.x1, z0: b.z0, z1: b.z1 },
      floorIndex: (y) => (y > Y0 + HOSP.H * 0.5 ? 1 : 0),
      // obstacles of the floor whose walls apply at (u, v, y): on the stair flight the ground-floor set (its walls + the rail)
      obsAt(u, v, y) { if (u > STAIR.u0 - 0.1 && u < STAIR.u1 + 0.05 && v > STAIR.v0 - 0.4 && v <= STAIR.v1) return H.obs[0]; return H.obs[this.floorIndex(y)]; },
      obsFor(y) { return H.obs[this.floorIndex(y)]; },
      resolve(nx, nz) { const P = H.g.player; const [u, v] = toLocal(nx, nz); const list = this.obsAt(u, v, P.y); let x = nx, z = nz;
        for (let pass = 0; pass < 2; pass++) for (const o of list) { if (o.top < P.y + 0.3 || o.x0 > 1e8) continue; if (x > o.x0 - R && x < o.x1 + R && z > o.z0 - R && z < o.z1 + R) {
          const dl = x - (o.x0 - R), dr = o.x1 + R - x, dt = z - (o.z0 - R), db = o.z1 + R - z; const m = Math.min(dl, dr, dt, db); if (m === dl) x = o.x0 - R; else if (m === dr) x = o.x1 + R; else if (m === dt) z = o.z0 - R; else z = o.z1 + R; } }
        return { x, z }; },
      floorAt(x, z, y) { const [u, v] = toLocal(x, z);
        if (inRect([LIFT.u0, LIFT.u1, LIFT.v0 - 0.2, LIFT.v1], u, v)) return FLOOR_Y[H.lift.floor];
        if (u > STAIR.u0 - 0.05 && u < STAIR.u1 + 0.05 && v >= STAIR.v0) { const s = H.stairAt(u, v); if (s != null) return s; }
        return y > Y0 + HOSP.H * 0.5 ? FLOOR_Y[1] : FLOOR_Y[0]; },
      ceilAt(y) { const f = this.floorIndex(y); return FLOOR_Y[f] + HOSP.CEIL - 0.12; },
      // the camera: kept under the ceiling and in front of the first wall / tall item between the player and where it wants to be
      camWorld(tgt, want) { const P = H.g.player; const fl = this.floorAt(P.x, P.z, P.y); want.y = clamp(want.y, fl + 0.45, fl + HOSP.CEIL - 0.15);
        const [u, v] = toLocal(P.x, P.z); const list = this.obsAt(u, v, P.y); const n = 16; let last = 0; const r = 0.18;
        for (let k = 1; k <= n; k++) { const t = k / n; const x = tgt.x + (want.x - tgt.x) * t, z = tgt.z + (want.z - tgt.z) * t, yy = tgt.y + (want.y - tgt.y) * t; let hit = false;
          for (const o of list) { if (o.x0 > 1e8 || yy > o.top + 0.05) continue; if (x > o.x0 - r && x < o.x1 + r && z > o.z0 - r && z < o.z1 + r) { if (o.tag !== 'wall' && o.tag !== 'door' && o.tag !== 'slide' && o.tag !== 'lift' && o.tag !== 'stairRail' && o.top < fl + 1.6) continue; hit = true; break; } }
          if (hit) break; last = t; }
        if (last < 1) { const k = Math.max(0, last - 0.02); want.x = tgt.x + (want.x - tgt.x) * k; want.z = tgt.z + (want.z - tgt.z) * k; want.y = tgt.y + (want.y - tgt.y) * k; } },
    };
  }
  // the flight: a continuous ramp under the treads (the treads are drawn stepped; feet follow the nosing line)
  stairAt(u, v) { if (u < STAIR.u0 - 0.05 || u > STAIR.u1 + 0.05 || v < STAIR.v0) return null; if (v > STAIR.v1) return FLOOR_Y[1]; return Y0 + ((v - STAIR.v0) / (STAIR.v1 - STAIR.v0)) * HOSP.H; }
  // ================================================================ seats
  buildSeats() {
    this.seats = {}; const byRoom = new Map(); const mats = this.hb.mats;
    FURNITURE.forEach((f) => { const x = f[5]; if (!x || !x.npc) return; const [type, fl, u, v, yaw] = f; const F = itemFrame(u, v, yaw, FLOOR_Y[fl]); const kind = type === 'officeChair' ? 'office' : 'wait';
      const [sx, sz] = F.P(0, -0.04); const desk = kind === 'office'; const [ax, az] = F.P(0, desk ? -0.62 : 0.62); const [au, av] = toLocal(ax, az);
      const room = roomAt(u, v, fl); const s = { key: x.npc, kind, floor: fl, u, v, x: sx, z: sz, yaw: charYaw(yaw), app: [fl, au, av], room: room.id, top: kind === 'office' ? 0.47 : 0.44, occ: null, mesh: null, i: 0 };
      this.seats[x.npc] = s; const k = room.id + ':' + kind; if (!byRoom.has(k)) byRoom.set(k, []); byRoom.get(k).push(s); });
    const q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), pv = new THREE.Vector3(), m4 = new THREE.Matrix4(); this._m4 = { q, one, pv, m4 };
    for (const [k, list] of byRoom) { const [rid, kind] = k.split(':'); const im = new THREE.InstancedMesh(shellGeo(kind), kind === 'office' ? mats.h_fabric : mats.h_plastic, list.length);
      im.name = 'hosp-seat-' + k; im.castShadow = false; im.receiveShadow = true; list.forEach((s, i) => { s.mesh = im; s.i = i; }); this.rooms.get(rid).group.add(im); for (const s of list) this.setTop(s, s.top); }
  }
  setTop(s, top) { const { q, one, pv, m4 } = this._m4; s.top = clamp(top, 0.25, 0.6); q.setFromAxisAngle(pv.set(0, 1, 0), s.yaw); const cx = s.x + Math.sin(s.yaw) * 0.04, cz = s.z + Math.cos(s.yaw) * 0.04;
    s.mesh.setMatrixAt(s.i, m4.compose(pv.set(cx, FLOOR_Y[s.floor] + s.top, cz), q, one)); s.mesh.instanceMatrix.needsUpdate = true; s.mesh.computeBoundingSphere(); }
  // ================================================================ people
  makePeople() {
    const B = (i) => { const r = FURNITURE.find((f) => f[0] === 'bed' && f[5] && f[5].ward === i); return r; };
    const face = (k) => { const b = B(k); return [b[2], b[3]]; };
    const ck = (spot, at, t, act = 'look') => ({ go: [spot], act, face: at, t });
    this.people = [];
    const add = (key, spec, home, script, o = {}) => { const ch = new Character(spec); ch.root.visible = false; this.g.scene.add(ch.root);
      const p = Object.assign({ key, ch, f: home[0], u: home[1], v: home[2], yaw: 0, speed: 0, script, si: -1, step: null, t: 0, acc: 0, tier: 'off', path: null, pi: 0, wait: 0, seat: null, busy: null, rnd: Math.random }, o);
      this.people.push(p); this.place(p); return p; };
    // receptionist: at her desk all day — files, the phone, the queue
    this.rec = add('rec', makeAppearance(7401, { preset: 'f_office_young', sex: 'f' }), S2('recDesk'), [{ sit: 'rec', t: [1e9, 1e9], desk: true }]);
    // ward nurse: the station, then rounds of the ward beds
    this.nurse = add('nurse', makeAppearance(7413, { preset: 'f_nurse', sex: 'f' }), S2('wardNurseStation'), [
      { sit: 'station', t: [25, 45], desk: true }, { go: ['nursesGap', 'wardGap', 'wardAisleE'] }, ck('wardBed2', face(2), [6, 9]), ck('wardBed1', face(1), [8, 12], 'talk'),
      { go: ['wardMid'] }, ck('wardBed4', face(4), [6, 9]), { go: ['wardAisleW'] }, ck('wardBed0', face(0), [6, 9]), { go: ['wardAisleW', 'wardMid', 'wardAisleE', 'wardGap', 'nursesGap'] }]);
    // ED nurse: triage desk, checks the bays
    this.edNurse = add('edNurse', makeAppearance(7429, { preset: 'f_nurse', sex: 'f' }), S2('edDesk'), [
      { sit: 'ed', t: [30, 60], desk: true }, { go: ['edBack', 'edMid'] }, ck('edBay1', [14.6, 1.45], [6, 9]), ck('edBay2', [17.6, 1.45], [5, 8]), { go: ['edMid', 'edBack'] }]);
    // doctor: consultation room; now and then a ward round
    this.doctor = add('doctor', makeAppearance(7437, { preset: 'm_doctor', sex: 'm' }), S2('consultDesk'), [
      { sit: 'doctor', t: [50, 110], desk: true }, { go: ['consultDoorIn', 'consultDoorOut', 'corr1Ward', 'wardIn', 'wardMid'] }, ck('wardBed4', face(4), [9, 14], 'talk'),
      ck('wardBed1', face(1), [8, 12], 'talk'), { go: ['wardMid', 'wardIn', 'corr1Ward', 'consultDoorOut', 'consultDoorIn'] }]);
    // a waiting visitor: the queue, the pharmacy hatch, back to the seat
    this.visitor = add('visitor', makeAppearance(7451, { preset: 'm_retiree', sex: 'm' }), [0, -9.0, 2.92], [
      { sit: 'visitor', t: [35, 80] }, { go: ['lobbyMid'] }, { go: ['lobbyQueue'], act: 'talk', face: [-1.5, 6.0], t: [6, 9], talkTo: 'rec' }, { go: ['lobbyMid', 'lobbyBack', 'lobbyHatchApp'] },
      { go: ['lobbyHatch'], act: 'look', face: [-14.5, 4.5], t: [5, 8] }, { go: ['lobbyHatchApp', 'lobbyBack', 'visitorApp'] }]);
    // a patient in the ward (bed 1), resting
    { const b = B(1); this.patient = add('patient', makeAppearance(7463, { preset: 'm_office_mid', sex: 'm' }), [1, b[2], b[3]], null, { lieBed: b }); this.setLying(this.patient.ch, b, 1); }
    for (const p of this.people) if (p.script) this.nextStep(p, true);
  }
  get charCount() { return this.people.length; }
  place(p) { const [x, z] = toWorld(p.u, p.v); p.ch.root.position.set(x, FLOOR_Y[p.f], z); if (!p.lieBed) p.ch.root.rotation.y = p.yaw; }
  // a bed's pose: supine on the mattress, head at the bed head (−facing); feet at the root
  bedFrame(b) { const [, fl, u, v, yaw] = b; const F = itemFrame(u, v, yaw, FLOOR_Y[fl]); const fx = Math.sin(yaw), fz = -Math.cos(yaw); return { F, fl, fx, fz, cx: F.ox, cz: F.oz, yaw, top: FLOOR_Y[fl] + BED.top }; }
  setLying(ch, b, k = 1) { const fr = this.bedFrame(b); const h = bodyH(ch); const r = ch.root; r.rotation.order = 'YXZ';
    r.rotation.set(-Math.PI / 2 * k, Math.atan2(-fr.fx, -fr.fz) + Math.PI, 0); r.position.set(fr.cx + fr.fx * (h * 0.5 - 0.06), fr.top + 0.11, fr.cz + fr.fz * (h * 0.5 - 0.06)); return fr; }
  unLie(ch) { ch.root.rotation.order = 'XYZ'; ch.root.rotation.x = 0; ch.root.rotation.z = 0; }
  // ---------------------------------------------------------------- the routine interpreter
  nextStep(p, first = false) {
    p.si = (p.si + 1) % p.script.length; const s = p.script[p.si]; p.step = s; p.t = 0; p.phase = null;
    if (s.go) { p.path = s.go.map((k) => (typeof k === 'string' ? spotOf(k) : k)); p.pi = 0; p.phase = 'walk'; }
    if (s.sit) { const st = this.seats[s.sit]; p.seat = st; if (first) { this.sitNow(p, st); p.phase = 'seated'; p.dur = this.dur(s.t); } else { p.path = [st.app]; p.pi = 0; p.phase = 'walk'; } }
    else if (!s.go) p.phase = 'act';
  }
  dur(t) { return t[0] + Math.random() * (t[1] - t[0]); }
  sitNow(p, st) { st.occ = p; this.setTop(st, seatTopFor(p.ch)); const [u, v] = toLocal(st.x, st.z); p.u = u; p.v = v; p.f = st.floor; p.yaw = st.yaw; this.place(p); p.ch.anim.set(null); p.ch.anim.seated = true; }
  updatePerson(p, dt, full) {
    const A = p.ch.anim; const s = p.step; p.t += dt; let speed = 0;
    if (p.busy) { p.busy(dt); return; }
    if (p.phase === 'walk') {
      const tg = p.path[p.pi]; const du = tg[1] - p.u, dv = tg[2] - p.v; const d = Math.hypot(du, dv);
      const P = this.g.player; const [pu, pv] = toLocal(P.x, P.z); const pf = P.y > Y0 + HOSP.H * 0.5 ? 1 : 0; let block = false;
      if (pf === p.f && Math.abs(pu - p.u) < 1.2 && Math.abs(pv - p.v) < 1.2) { const ah = ((pu - p.u) * du + (pv - p.v) * dv) / Math.max(d, 1e-3); if (ah > 0 && ah < 0.95 && Math.hypot(pu - p.u, pv - p.v) < 0.75) block = true; }
      if (block) { p.wait += dt; if (p.wait > 4) block = false; } else p.wait = 0;
      if (d < 0.06) { p.pi++; if (p.pi >= p.path.length) { p.path = null; if (s.sit) { p.phase = 'sit'; p.t = 0; p.from = [p.u, p.v]; } else if (s.act) { p.phase = 'act'; p.t = 0; p.dur = this.dur(s.t); } else this.nextStep(p); } }
      else if (!block) { const sp = 1.2; const st = Math.min(d, sp * dt); p.u += du / d * st; p.v += dv / d * st; speed = sp; const wy = Math.atan2(du, -dv); p.yaw = turn(p.yaw, wy, dt * 8); }
      this.place(p);
    } else if (p.phase === 'sit') { const st = p.seat; if (p.t < dt * 1.5) { st.occ = p; this.setTop(st, seatTopFor(p.ch)); A.set('sit'); }
      const [su, sv] = toLocal(st.x, st.z); const e = sstep(p.t / 0.8); p.u = p.from[0] + (su - p.from[0]) * e; p.v = p.from[1] + (sv - p.from[1]) * e; p.yaw = turn(p.yaw, st.yaw, dt * 8); this.place(p);
      if (p.t >= 0.9) { A.seated = true; A.set(null); p.phase = 'seated'; p.t = 0; p.dur = this.dur(s.t); } }
    else if (p.phase === 'seated') { routine(p, p.ch, dt, s.desk ? 'desk' : 'stand'); A.seated = true; if (p.t >= p.dur) { p.phase = 'rise'; p.t = 0; p.from = [p.u, p.v]; } }
    else if (p.phase === 'rise') { const st = p.seat; if (p.t < dt * 1.5) { A.seated = null; p._rtn = null; A.set('rise'); if (p.ch.face) p.ch.face.talking = false; }
      const e = sstep(p.t / 0.7); p.u = p.from[0] + (st.app[1] - p.from[0]) * e; p.v = p.from[1] + (st.app[2] - p.from[1]) * e; this.place(p);
      if (p.t >= 0.75) { A.set(null); st.occ = null; p.seat = null; this.nextStep(p); } }
    else if (p.phase === 'act') { if (s.face) p.yaw = turn(p.yaw, Math.atan2(s.face[0] - p.u, -(s.face[1] - p.v)), dt * 5); this.place(p); if (A.action !== s.act) A.set(s.act); if (p.ch.face) p.ch.face.talking = s.act === 'talk';
      if (s.talkTo === 'rec' && this.rec && !this.rec.busy) { const r = this.rec.ch.anim; if (r.action !== 'talk') r.set('talk'); this.rec._rtn = null; }
      if (p.t >= (p.dur || 5)) { A.set(null); if (p.ch.face) p.ch.face.talking = false; this.nextStep(p); } }
    if (full || p.acc >= 0.16) { A.update(Math.min(full ? dt : p.acc, 0.25), speed); p.acc = 0; } else p.acc += dt;
    if (A.stepped) { A.stepped = false; if (this.inside && full) { const [x, z] = toWorld(p.u, p.v); HospitalSound.step(x, z); } }
  }
  npcTiers() { const o = { full: 0, low: 0, off: 0 }; for (const p of this.people) o[p.tier]++; return o; }
  // ================================================================ per frame — returns the indoor light blend (0…1)
  update(dt) {
    const t0 = performance.now(); const g = this.g, P = g.player, cam = g.camera; if (!P || !cam) return 0; this.stats.frames++;
    const [pu, pv] = toLocal(P.x, P.z); const b = this.hb.bounds; const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
    const camD = Math.hypot(cam.position.x - cx, cam.position.z - cz), pD = Math.hypot(P.x - cx, P.z - cz);
    // ---- hand-over between the city and the building model
    const pf = P.y > Y0 + HOSP.H * 0.5 ? 1 : 0; const inFoot = !!roomAt(pu, pv, pf);
    if (P.indoor === this.room) { if (P.vehicle || (!inFoot && !this.recovering && !this.lying && !this.seat) || P.y < Y0 - 1.5) { P.indoor = null; this.stats.exits++; this.onExit(); } }
    else if (!P.indoor && !P.vehicle && !(g.interiors && g.interiors.current) && inFoot && Math.abs(P.y - FLOOR_Y[0]) < 0.7) { P.indoor = this.room; this.stats.enters++; }
    const inside = (this.inside = P.indoor === this.room);
    // ---- exterior LOD (hysteresis: no flicker at the threshold; the far massing matches the near shell's silhouette)
    if (!this.lodFar && camD > LOD_FAR) this.lodFar = true; else if (this.lodFar && camD < LOD_NEAR) this.lodFar = false;
    this.hb.ext.visible = !this.lodFar || inside; this.hb.lod.visible = this.lodFar && !inside;
    // ---- doors, lift
    this.updateDoors(dt, P, pu, pv, pf, inside);
    this.updateLift(dt, P, pu, pv, pf, inside);
    // ---- which rooms are drawn
    this.updateVisibility(P, pu, pv, pf, inside, pD);
    // ---- people (AI + animation tiers; nothing at all for people in rooms that are not drawn and far away)
    const intOn = this.hb.interior.visible;
    for (const p of this.people) { const [x, z] = toWorld(p.u, p.v); const d = Math.hypot(x - P.x, z - P.z); const shown = intOn && this.vis.has(roomAt(p.u, p.v, p.f)?.id);
      p.ch.root.visible = shown; p.tier = shown && d < NPC_FULL ? 'full' : (shown || d < NPC_LOW) ? 'low' : 'off';
      if (p.tier === 'off') { p.bg = (p.bg || 0) + dt; if (p.bg < 1) continue; const bd = Math.min(p.bg, 1.5); p.bg = 0; if (p.script && !this.recovering) this.updatePerson(p, bd, false); continue; }
      if (p.lieBed) { if (p.tier === 'full' || (p.acc += dt) > 0.2) { p.ch.anim.update(p.tier === 'full' ? dt : p.acc, 0); p.acc = 0; this.setLying(p.ch, p.lieBed, 1); } continue; }
      if (p.script || p.busy) this.updatePerson(p, dt, p.tier === 'full'); }
    // ---- reception phone now and then
    if (inside && pf === 0) { this.phoneT -= dt; if (this.phoneT <= 0) { this.phoneT = 80 + Math.random() * 90; const r = this.rec; if (r && !r.busy) { const [x, z] = toWorld(r.u, r.v); HospitalSound.phone(x, z); r._rtn = { kind: 'desk', t: 9, act: 'phone', n: 0 }; r.ch.anim.set('phone'); } } }
    // ---- sound
    HospitalSound.listen(P.x, P.z); const near = inside || pD < 30; if (near !== HospitalSound.on) HospitalSound.ambience(near);
    this.srcs[0].on = pf === 0; this.srcs[1].on = pf === 1; HospitalSound.tick(dt, inside, this.srcs, P.camYaw ?? 0);
    // ---- prompts (Game.updateInteractions asks interact())
    this.talkCd = Math.max(0, this.talkCd - dt);
    if (this.recovering) this.recovering.step(dt);
    if (this.lying) this.setLying(P.ch, this.lying.bed, 1);
    if (this.seat && this.seat.player) P.ch.anim.seated = true;
    // ---- light blend
    const tk = inside ? 1 : 0; this.k += (tk - this.k) * Math.min(1, dt * 2.2); this.wantsPool = intOn && (inside || pD < 40);
    this.stats.ms = performance.now() - t0; return this.k;
  }
  onExit() { if (this.seat) this.standUp(true); }
  // ---------------------------------------------------------------- visibility
  updateVisibility(P, pu, pv, pf, inside, pD) {
    const I = this.hb.interior; let key = '';
    if (inside) { const r = roomAt(pu, pv, pf); this.curRoom = r || this.curRoom; const [cu, cv] = toLocal(this.g.camera.position.x, this.g.camera.position.z); const cf = this.g.camera.position.y > Y0 + HOSP.H ? 1 : 0; this.camRoom = roomAt(cu, cv, cf) || this.curRoom;
      key = 'i' + (this.curRoom ? this.curRoom.id : '') + '|' + (this.camRoom ? this.camRoom.id : '') + '|' + pf; }
    else { this.curRoom = null; const front = pv < 0 && pD < INT_FAR; const edSide = pu > 15 && pD < 45; key = 'o' + (front ? 'f' : '') + (edSide || this.doorById.edEntrance?.k > 0.1 ? 'e' : '') + (pD < 28 && front ? 'c' : ''); }
    for (const D of this.doors) key += D.kind === 'swing' || D.kind === 'lift' ? (this.open[D.id] > 0.12 ? '1' : '0') : '';
    if (key === this.visKey) return; this.visKey = key; const vis = this.vis; vis.clear();
    if (inside) { const f = pf; const add = (id) => { if (!id) return; for (const r of visibleRooms(id, this.open)) { const R2 = ROOM[r]; const cross = id === 'stairs' || id === 'lift'; if (cross || R2.floors.includes(f)) vis.add(r); } };
      add(this.curRoom && this.curRoom.id); if (this.camRoom && this.camRoom !== this.curRoom) add(this.camRoom.id); }
    else { if (key.includes('f')) vis.add('lobby'); if (key.includes('e')) vis.add('ed'); if (key.includes('c')) vis.add('corr0'); }
    I.visible = vis.size > 0; let n = 0; for (const [id, r] of this.rooms) { const on = vis.has(id); r.group.visible = on; if (on) n++; } this.stats.roomsDrawn = n;
  }
  visibleRooms() { return [...this.vis]; }
  placeName() { const r = this.curRoom; return r ? `${HOSP.name} · ${r.name}` : HOSP.name; }
  outsidePos() { const [x, z] = toWorld(-6, -4.5); return { x, z, yaw: 0 }; }
  // loading screen: every room drawn once (programs, uploads) with the light pool on — no hitch at the doors
  async precompile(compile) { const W = this.g.interiors && this.g.interiors.walkIn; const I = this.hb.interior; const prev = I.visible; I.visible = true; for (const [, r] of this.rooms) r.group.visible = true; for (const p of this.people) p.ch.root.visible = true;
    const pw = this.wantsPool; this.wantsPool = true; if (W) W.setActive(null);
    try { await compile(this.hb.root); for (const p of this.people) await compile(p.ch.root); } finally { this.wantsPool = pw; if (W) W.setActive(null); I.visible = prev; for (const [, r] of this.rooms) r.group.visible = false; for (const p of this.people) p.ch.root.visible = false; this.visKey = ''; } }
  // the light pool (WalkIn.setActive asks while no shop is open): the six nearest ceiling panels of the drawn rooms
  fillPool(pool, P) {
    const c = []; const pf = P.y > Y0 + HOSP.H * 0.5 ? 1 : 0; for (const id of this.vis) { const r = this.rooms.get(id); for (const l of r.lights) { if (l.f !== pf && !this.inside) continue; if (this.inside && l.f !== pf && id !== 'stairs') continue; c.push(l); } }
    c.sort((a, b) => Math.hypot(a.x - P.x, a.z - P.z) - Math.hypot(b.x - P.x, b.z - P.z));
    for (let i = 0; i < pool.length; i++) { const L = pool[i], d = c[i]; if (!d) { L.intensity = 0; L.position.set(P.x, -800, P.z); continue; }
      L.position.set(d.x, d.y, d.z); L.color.setHex(0xf4f7ff); L.distance = this.inside ? d.d + 1.5 : Math.max(1.5, d.wallD + 0.3); L.decay = 1.4; L.intensity = 7.5 * (0.5 + 0.5 * this.k); }
  }
  // ---------------------------------------------------------------- doors
  updateDoors(dt, P, pu, pv, pf, inside) {
    // sliding entrances: open for anyone on foot within ~2.8 m (either side)
    for (const S of this.sliders) { const [x, , z] = S.centre; let want = !P.vehicle && Math.abs(P.y - FLOOR_Y[0]) < 1.2 && Math.hypot(P.x - x, P.z - z) < 2.8 ? 1 : 0;
      if (!want) for (const p of this.people) { const [px, pz] = toWorld(p.u, p.v); if (p.f === 0 && Math.hypot(px - x, pz - z) < 2.4) { want = 1; break; } }
      if (!want && this.g.police && this.g.police.ems) for (const u of this.g.police.ems.units) for (const o of u.officers) if (o.mode === 'foot' && Math.hypot(o.x - x, o.z - z) < 2.6) want = 1;
      const was = S.k; S.k += Math.sign(want - S.k) * Math.min(Math.abs(want - S.k), dt / 0.9); if ((was === 0 && S.k > 0) || (was === 1 && S.k < 1)) HospitalSound.slide(x, z);
      const e = sstep(S.k); for (const lf of S.leaves) { const h = lf.userData.home, d = lf.userData.dir; lf.position.set(h.x + d[0] * lf.userData.travel * e, h.y, h.z + d[2] * lf.userData.travel * e); }
      const passable = S.k > 0.7; S.coll.h = passable ? 0 : S.hFull; if (S.obs) { if (passable) { S.obs.x0 = S.obs.x1 = 1e9; } else Object.assign(S.obs, S.closedBox); }
      this.open[S.d.id] = S.k; }
    // hinged doors: interact (player) / staff walking through; the closer shuts them after a while with nobody in the way
    for (const D of this.doors) { if (D.kind !== 'swing') continue; const [cx, , cz] = D.centre; let users = false;
      for (const p of this.people) { if (p.f !== D.d.floor || p.phase !== 'walk') continue; const [px, pz] = toWorld(p.u, p.v); if (Math.hypot(px - cx, pz - cz) < 1.5) { users = true; break; } }
      const pNear = Math.abs(P.y - D.fy) < 1.2 && Math.hypot(P.x - cx, P.z - cz) < 1.0;
      if (users) { D.want = 1; D.hold = 3; } else if (D.want && !pNear) { D.hold -= dt; if (D.hold <= 0 && !D.pin) D.want = 0; }
      const was = D.k; D.k += Math.sign(D.want - D.k) * Math.min(Math.abs(D.want - D.k), dt / 0.85);
      if (was === 0 && D.k > 0) HospitalSound.door(cx, cz, true); if (was > 0 && D.k === 0) HospitalSound.door(cx, cz, false);
      const e = sstep(D.k); if (D.leaves[0]) D.leaves[0].rotation.y = D.base + D.swingSign * e * Math.PI * 0.5;
      if (D.obs) { if (D.k > 0.85) { D.obs.x0 = D.obs.x1 = 1e9; } else Object.assign(D.obs, D.closedBox); }
      this.open[D.id] = D.k; }
  }
  // ---------------------------------------------------------------- lift
  updateLift(dt, P, pu, pv, pf, inside) {
    const L = this.lift; const inCar = inside && inRect([LIFT.u0, LIFT.u1, LIFT.v0 - 0.15, LIFT.v1], pu, pv);
    if (L.state === 'closing') { L.t += dt; if (L.t > LIFT.doorT) { L.state = 'travel'; L.t = 0; const [x, z] = toWorld(-15.25, 13); HospitalSound.liftMotor(x, z); } }
    else if (L.state === 'travel') { L.t += dt; if (inCar && P.ch) P.ch.root.position.y += Math.sin(L.t * 40) * 0.0015; if (L.t > 3.6) { L.floor = L.target; if (inCar) { P.y = FLOOR_Y[L.floor]; P.vy = 0; } L.state = 'open'; L.t = 0; const [x, z] = toWorld(-15.25, 11.6); HospitalSound.liftDing(x, z); HospitalSound.liftDoors(x, z); this.visKey = ''; } }
    else if (L.state === 'open') { L.t += dt; if (L.t > 7 && !inCar) { L.state = 'idle'; HospitalSound.liftDoors(...toWorld(-15.25, 11.6)); } }
    for (const f of [0, 1]) { const want = (L.state === 'open' && L.floor === f) ? 1 : 0; const D = this.doorById['lift' + f]; if (!D) continue; D.k += Math.sign(want - D.k) * Math.min(Math.abs(want - D.k), dt / LIFT.doorT);
      const e = sstep(D.k); for (const lf of D.leaves) { const h = lf.userData.home, d = lf.userData.dir; lf.position.set(h.x + d[0] * D.w * 0.48 * e, h.y, h.z + d[2] * D.w * 0.48 * e); }
      if (D.obs) { if (D.k > 0.8) { D.obs.x0 = D.obs.x1 = 1e9; } else Object.assign(D.obs, D.closedBox); } this.open[D.id] = D.k; }
    this.inCar = inCar;
  }
  callLift(f) { const L = this.lift; if (L.state === 'travel' || L.state === 'closing') return; if (L.floor === f) { if (L.state !== 'open') HospitalSound.liftDoors(...toWorld(-15.25, 11.6)); L.state = 'open'; L.t = 0; return; } L.target = f; L.state = 'closing'; L.t = 0; HospitalSound.liftDoors(...toWorld(-15.25, 11.6)); }
  // ================================================================ interactions (Game.updateInteractions)
  interact(P, key) {
    if (P.indoor !== this.room || this.recovering) return null; const I = key || ((a) => (this.g.hud && this.g.hud.key ? this.g.hud.key(a) : 'E'));
    const press = () => Input.wasPressed('interact');
    const [pu, pv] = toLocal(P.x, P.z); const pf = P.y > Y0 + HOSP.H * 0.5 ? 1 : 0;
    if (this.lying) { if (press()) this.getOffBed(); return `${I('interact')} Get up`; }
    if (this.seat) { if (press()) this.standUp(); return `${I('interact')} Stand up`; }
    const L = this.lift;
    if (this.inCar) { if (L.state === 'travel' || L.state === 'closing') return null; const to = 1 - L.floor; if (press()) { L.target = to; L.state = 'closing'; L.t = 0; HospitalSound.liftDoors(P.x, P.z); } return `${I('interact')} Lift — ${to ? 'First floor (wards)' : 'Ground floor (exit)'}`; }
    { const [lx, lz] = toWorld((LIFT.doorU0 + LIFT.doorU1) / 2, 11.6); if (Math.hypot(P.x - lx, P.z - lz) < 1.5 && L.state !== 'open') { if (press()) this.callLift(pf); return `${I('interact')} Call the lift`; } }
    // hinged doors
    let best = null, bd = 1.6; for (const D of this.doors) { if (D.kind !== 'swing' || D.d.floor !== pf) continue; const d = Math.hypot(P.x - D.centre[0], P.z - D.centre[2]); if (d < bd) { bd = d; best = D; } }
    if (best) { const open = best.want > 0; if (press()) { best.want = open ? 0 : 1; best.hold = 8; } return `${I('interact')} ${open ? 'Close' : 'Open'} door — ${best.d.name}${best.d.staff ? ' (staff only)' : ''}`; }
    if (pf === 0) {
      const rc = S2('recCounter'); if (Math.hypot(pu - rc[1], pv - rc[2]) < 1.3) { if (press() && this.talkCd <= 0) this.receptionTalk(); return `${I('interact')} Speak to the receptionist`; }
      const ph = S2('lobbyHatch'); if (Math.hypot(pu - ph[1], pv - ph[2]) < 1.2) { const hp = this.g.health ? this.g.health.hp : 100; const cost = 800; if (press()) this.pharmacy(cost); return hp < 100 ? `${I('interact')} Pharmacy — painkillers & dressings (Rs. ${cost.toLocaleString('en-LK')})` : 'Pharmacy — you are not hurt'; }
      if (Math.hypot(pu - 4.6, pv - 4.0) < 1.1) { if (press()) { const [x, z] = toWorld(4.6, 4.0); HospitalSound.water(x, z); } return `${I('interact')} Water cooler — a cup of water`; }
      for (const [su, sv] of [[-4.2, 0.3], [20.8, 6.5], [-8.0, 11.45]]) if (Math.hypot(pu - su, pv - sv) < 0.9) { if (press()) { const [x, z] = toWorld(su, sv); HospitalSound.sanitizer(x, z); } return `${I('interact')} Hand sanitiser`; }
      for (const k of ['seatA', 'seatB']) { const s = this.seats[k]; if (!s || s.occ) continue; if (Math.hypot(pu - s.app[1], pv - s.app[2]) < 0.8) { if (press()) this.sitDown(s); return `${I('interact')} Sit down`; } }
    }
    // beds (free ones: not the patient's, not mid-recovery)
    for (const f of FURNITURE) { if (f[0] !== 'bed' || f[1] !== pf || f === (this.patient && this.patient.lieBed)) continue; const fr = this.bedFrame(f); const side = Math.hypot(P.x - fr.cx, P.z - fr.cz); if (side < 1.35) { if (press()) this.lieDown(f); return `${I('interact')} Lie down on the bed`; } }
    return null;
  }
  receptionTalk() { const r = this.rec; const i = this.recLine++ % RECEPTION_LINES.length; const [x, z] = toWorld(r.u, r.v); const d = HospitalSound.voice('hosp.reception' + (i + 1), x, z);
    this.g.hud.subtitle('Receptionist', RECEPTION_LINES[i], '', Math.max(3.5, d + 0.4)); this.talkCd = Math.max(3.5, d); r._rtn = { kind: 'desk', t: Math.max(3.5, d), act: 'talk', n: 0 }; r.ch.anim.set('talk'); if (r.ch.face) r.ch.face.talking = true; }
  pharmacy(cost) { const g = this.g, S = g.story, Hh = g.health; if (!Hh || Hh.hp >= 100) return; if (S.state.money < cost) { g.hud.notify('Pharmacy', 'Not enough cash with you.', 'warn', 3); return; }
    S.pay(-cost, `Pharmacy — ${HOSP.name}`); Hh.hp = Math.min(100, Hh.hp + 50); g.hud.notify('Pharmacy', `Painkillers and dressings · Rs. ${cost.toLocaleString('en-LK')}`, 'info', 3); }
  // ---- sitting on a waiting seat (held in place: P.posed; the shell set to the player's own seat height)
  sitDown(s) { const P = this.g.player; s.occ = 'player'; s.player = true; this.seat = s; this.setTop(s, seatTopFor(P.ch)); P.posed = { x: s.x, y: FLOOR_Y[s.floor], z: s.z, yaw: s.yaw }; P.ch.anim.set('sit'); P.ch.anim.seated = true; P.speed = 0; }
  standUp(quiet = false) { const P = this.g.player, s = this.seat; if (!s) return; this.seat = null; s.occ = null; s.player = false; P.ch.anim.seated = null; P.posed = null; if (!quiet) P.ch.anim.set('rise');
    const [x, z] = toWorld(s.app[1], s.app[2]); P.x = x; P.z = z; P.sync && P.sync(); setTimeout(() => { if (P.ch.anim.action === 'rise') P.ch.anim.set(null); }, 700); }
  // ---- lying on a bed (and getting off on the open side)
  lieDown(bed, quiet = false) { const P = this.g.player; const fr = this.bedFrame(bed); this.lying = { bed }; P.posed = { x: fr.cx, y: fr.top, z: fr.cz, yaw: fr.yaw }; P.speed = 0; P.ch.anim.set(null); P.ch.anim.seated = null; this.setLying(P.ch, bed, 1); if (!quiet) HospitalSound.bed(fr.cx, fr.cz); }
  getOffBed() { const P = this.g.player; const L = this.lying; if (!L) return; const fr = this.bedFrame(L.bed); this.lying = null; this.unLie(P.ch); const sp = this.bedSide(L.bed, false); P.posed = null; P.x = sp.x; P.z = sp.z; P.y = FLOOR_Y[fr.fl]; P.yaw = sp.yaw + Math.PI; P.sync && P.sync(); HospitalSound.bed(fr.cx, fr.cz); }
  // a free spot beside a bed: speaker = the BEDSIDE spot (by the head, facing the patient); else the getting-off spot (mid-bed)
  bedSide(bed, speaker) { const fr = this.bedFrame(bed); const rx = Math.cos(fr.yaw), rz = Math.sin(fr.yaw); const obs = this.obs[fr.fl];
    const along = speaker ? -(BED.len / 2 - BEDSIDE.along) : 0; const off = speaker ? BEDSIDE.side : BED.wid / 2 + 0.45;
    for (const sg of [-1, 1]) { const x = fr.cx + fr.fx * along + rx * off * sg, z = fr.cz + fr.fz * along + rz * off * sg; if (!obs.some((o) => o.x0 < 1e8 && o.tag !== 'bed' && x > o.x0 - 0.25 && x < o.x1 + 0.25 && z > o.z0 - 0.25 && z < o.z1 + 0.25)) return { x, z, yaw: Math.atan2(fr.cx + fr.fx * along - x, fr.cz + fr.fz * along - z) }; }
    const x = fr.cx + rx * off, z = fr.cz + rz * off; return { x, z, yaw: Math.atan2(fr.cx - x, fr.cz - z) };
  }
  // ---- inside placement (tests / teleports)
  placeInside(P, x, z, floor = 0) { if (P.teleport) P.teleport(x, z, P.yaw || 0); P.y = FLOOR_Y[floor]; P.vy = 0; P.indoor = this.room; this.visKey = ''; this.update(0.016); }
  // ================================================================ recovery (Health.hospitalise → here, screen black)
  // returns when control is back. hp etc. are restored by the caller; this places the player on the bed, runs the
  // wake-up cinematic, the bedside line and the bill.
  async recover(health, { cause = '', ambulance = false, rid = null } = {}) {
    const g = this.g, P = g.player, S = g.story; const st = hospitalState(S.state); this.stats.recoveries++;
    if (this.seat) this.standUp(true); if (this.lying) this.getOffBed();
    const pick = RECOVERY_BEDS.find((b) => b.fi >= 0) || RECOVERY_BEDS[0]; const bed = FURNITURE[pick.fi]; const fr = this.bedFrame(bed); this.recBed = bed;
    // the bed: the player in it, the room door open, the room drawn, the light pool lent
    P.teleport && P.teleport(fr.cx, fr.cz, fr.yaw); P.indoor = this.room; this.lieDown(bed, true); this.visKey = ''; g.world && g.world.warm && g.world.warm(fr.cx, fr.cz);
    const door = this.doorById[pick.room === 'private2' ? 'p2Door' : 'p1Door']; if (door) { door.want = 1; door.k = 1; door.hold = 30; }
    // the speaker: one of the four lines, never the one used last time
    let li = Math.floor(Math.random() * RECOVERY_LINES.length); if (li === st.lastLine) li = (li + 1 + Math.floor(Math.random() * (RECOVERY_LINES.length - 1))) % RECOVERY_LINES.length; st.lastLine = li;
    const line = RECOVERY_LINES[li]; const who = line.role === 'doctor' ? this.doctor : this.nurse; const spot = this.bedSide(bed, true);
    if (who.seat) { who.seat.occ = null; who.seat = null; } who.ch.anim.seated = null; who.ch.anim.set(null); who._rtn = null; const [su, sv] = toLocal(spot.x, spot.z); who.f = fr.fl; who.u = su; who.v = sv; who.yaw = spot.yaw; this.place(who);
    who.busy = () => { who.ch.anim.update(this.g.dt || 0.016, 0); }; // held at the bedside until the line is done
    const camP = new THREE.Vector3(), camL = new THREE.Vector3(); const head = { x: fr.cx - fr.fx * (BED.len / 2 - 0.35), z: fr.cz - fr.fz * (BED.len / 2 - 0.35) };
    P.cinematic = true; P.control = false; this.update(0.016);
    const rec = (this.recovering = { t: 0, step: () => {} }); const T = 6.5; // 5–8 s cinematic
    const rx = Math.cos(fr.yaw), rz = Math.sin(fr.yaw); const sgS = Math.sign((spot.x - fr.cx) * rx + (spot.z - fr.cz) * rz) || 1;
    rec.step = (dt) => { rec.t += dt; const k = Math.min(1, rec.t / T); // slow push-in from the foot of the bed, over the bed, to the face
      camP.set(fr.cx + fr.fx * (1.9 - 1.1 * k) + rx * sgS * (0.9 - 0.3 * k), fr.top + 1.55 - 0.35 * k, fr.cz + fr.fz * (1.9 - 1.1 * k) + rz * sgS * (0.9 - 0.3 * k));
      camL.set(head.x + (spot.x - head.x) * 0.15 * sstep((rec.t - T) / 2), fr.top + 0.25, head.z + (spot.z - head.z) * 0.15 * sstep((rec.t - T) / 2));
      g.camera.position.copy(camP); g.camera.lookAt(camL); g.camera.updateMatrixWorld(); };
    rec.step(0); await g.hud.fade(0, 1.2);
    await health.wait(T - 1.2);
    // wake up: open eyes, sit up on the bed edge facing the speaker, stand
    if (P.ch.face && P.ch.face.set) P.ch.face.set('pain', 3); HospitalSound.bed(fr.cx, fr.cz);
    await this.animateWake(bed, spot, sgS);
    // the line, spoken by the nurse / doctor beside the bed
    who.ch.anim.set('talk'); if (who.ch.face) who.ch.face.talking = true; const [wx, wz] = toWorld(who.u, who.v); const vd = HospitalSound.voice('hosp.line' + (li + 1), wx, wz);
    g.hud.subtitle(line.who, line.text, '', Math.max(4, vd + 0.5)); await health.wait(Math.max(3.6, vd + 0.3));
    who.ch.anim.set(null); if (who.ch.face) who.ch.face.talking = false;
    // the bill (one invoice per admission — HospitalBilling refuses a second one)
    const id = rid || admit(S.state); const bill = billRecovery(g, id, { ambulance, cause }); const inv = bill.invoice; HospitalSound.printer(wx, wz);
    g.hud.notify(`${inv.hospital} — invoice ${inv.no}`, invoiceText(inv).split('\n').slice(2).join(' · '), inv.outstanding ? 'warn' : 'info', 9);
    if (S.message) S.message(inv.hospital, invoiceText(inv));
    // control back: the camera returns behind the player; the speaker goes back to work (walks out of the room)
    this.recovering = null; P.cinematic = false; P.control = true; P.camYaw = P.yaw + Math.PI;
    who.busy = null; this.walkBack(who, pick.room);
    return { invoice: inv, line: li };
  }
  animateWake(bed, spot, sgS) { const P = this.g.player; const fr = this.bedFrame(bed); const rx = Math.cos(fr.yaw), rz = Math.sin(fr.yaw);
    return new Promise((res) => { const rec = this.recovering; let t = 0; const top = Math.max(0.25, seatTopFor(P.ch)); const old = rec.step;
      const sx = fr.cx + rx * sgS * (BED.wid / 2 - 0.12) - fr.fx * 0.05, sz = fr.cz + rz * sgS * (BED.wid / 2 - 0.12) - fr.fz * 0.05; const sideYaw = Math.atan2(rx * sgS, rz * sgS);
      rec.step = (dt) => { old(dt); t += dt; const r = P.ch.root;
        if (t < 1.6) { const k = sstep(t / 1.6); // sit up and swing the legs over the side
          this.lying = null; P.ch.anim.seated = k > 0.35 ? true : null; r.rotation.order = 'YXZ'; const y0 = Math.atan2(fr.fx, fr.fz); r.rotation.set(-Math.PI / 2 * (1 - k), y0 + wrap(sideYaw - y0) * k, 0);
          const lx = fr.cx + fr.fx * (bodyH(P.ch) * 0.5 - 0.06), lz = fr.cz + fr.fz * (bodyH(P.ch) * 0.5 - 0.06), ly = fr.top + 0.11; r.position.set(lx + (sx - lx) * k, ly + (fr.top - top - ly) * k, lz + (sz - lz) * k); }
        else if (t < 2.5) { this.unLie(P.ch); r.rotation.y = sideYaw; P.ch.anim.seated = true; r.position.set(sx, fr.top - top, sz); }
        else if (t < 3.3) { if (P.ch.anim.seated) { P.ch.anim.seated = null; P.ch.anim.set('rise'); } const k = sstep((t - 2.5) / 0.8); const ox = sx + rx * sgS * 0.45, oz = sz + rz * sgS * 0.45; r.position.set(sx + (ox - sx) * k, fr.top - top + (FLOOR_Y[fr.fl] - fr.top + top) * k, sz + (oz - sz) * k); r.rotation.y = sideYaw; }
        else { P.ch.anim.set(null); const ox = sx + rx * sgS * 0.45, oz = sz + rz * sgS * 0.45; P.posed = null; P.x = ox; P.z = oz; P.y = FLOOR_Y[fr.fl]; P.yaw = Math.atan2(spot.x - ox, spot.z - oz); P.sync && P.sync(); rec.step = old; res(); }
      };
      }); }
  // after the recovery the speaker walks out to the corridor and resumes their routine
  walkBack(p, roomId) { const dU = (roomId === 'private2' ? 14 : 7) + 3.0;
    const back = p === this.doctor ? [[1, dU, 14.0], [1, dU, 12.3], [1, dU, 10.3], spotOf('consultDoorOut'), spotOf('consultDoorIn')] : [[1, dU, 14.0], [1, dU, 12.3], [1, dU, 10.3], spotOf('nursesBack1'), spotOf('nursesBack2')];
    p.si = p.script.length - 1; p.step = { go: true }; p.path = back; p.pi = 0; p.phase = 'walk'; } // on arrival nextStep → step 0 (back to the chair)
}
// named spots used by the routes (HospitalPlan.SPOTS + a few route corners checked by tools/hospital-npc-test.mjs)
const EXTRA = { wardBed1: [1, -5.8, 2.0], edBack: [0, 11.8, 7.4], lobbyBack: [0, -6.0, 5.6], lobbyHatchApp: [0, -12.6, 5.6], visitorApp: [0, -9.0, 4.9], nursesBack1: [1, 9.7, 8.9], nursesBack2: [1, 9.7, 6.6] };
export function spotOf(k) { return SPOTS[k] || EXTRA[k]; }
export const ROUTE_SPOTS = EXTRA;
