// Life around Johns Private Girls' School (fictional) — adults only. A security guard at the gate hut, teachers in
// sarees and kurtas, the principal, the office clerk and the sick-room nurse (corridor rounds, chatting on the office veranda), and the 1:30 pm dismissal: the iron gates
// swing open, teachers and the principal stand at the gate, parents wait on the Horton Place pavement, and school vans
// ("SCHOOL SERVICE" boards) wait on the inner drive, then leave one by one through the gate and join the westbound
// kerb lane of Horton Place as normal traffic. People and vans only appear when the player is not looking at the spot.
import * as THREE from 'three';
import { Character } from './Character.js';
import { makeAppearance } from './Appearance.js';
import { Vehicle } from '../vehicles/Vehicle.js';
import { linePiece, evalPiece } from '../vehicles/Traffic.js';
import { clamp } from '../core/math.js';
import * as L from '../world/Layout.js';
import { SCHOOL } from '../world/JohnsSchool.js';
import { SchoolGuard, isNight, inCompound } from './SchoolGuard.js';

const CX = 294, CZ = 358, NEAR = 230, FAR = 290;
const hm = (h, m) => h + m / 60;
export const DISMISSAL = hm(13, 30);
const GATE_OPEN = [[hm(7, 0), hm(7, 58)], [hm(12, 44), hm(14, 12)]], STAFF = [7, 15.5], AT_GATE = [[hm(7, 12), hm(7, 50)], [hm(13, 20), hm(14, 8)]];
const inWin = (h, W) => W.some(([a, b]) => h >= a && h < b);
// the school run: parents' cars pull up at the Horton Place kerb (westbound kerb lane, either side of the gate) around the
// 7:30 drop-off and the 1:30 pick-up, wait with the driver at the wheel, then pull out — the kerb lane narrows and traffic queues
export const SCHOOL_RUN = [[hm(7, 8), hm(7, 52)], [hm(13, 12), hm(13, 58)]];
const KERB = [244, 248.8, 253.6, 258.4, 280.6, 285.4, 290.2, 295], KERB_Z = 326.35, LANE_Z = 325.1;
const PARENT_CARS = ['car', 'sedan', 'suv', 'car', 'van', 'sedan'];
const SPINE = 268.9; // walking line inside the compound (gate path), clear of columns
let signMat = null;
function schoolSign() { if (signMat) return signMat; const c = document.createElement('canvas'); c.width = 512; c.height = 96; const x = c.getContext('2d');
  x.fillStyle = '#f2c230'; x.fillRect(0, 0, 512, 96); x.strokeStyle = '#111'; x.lineWidth = 6; x.strokeRect(3, 3, 506, 90); x.fillStyle = '#111'; x.font = '700 58px "Barlow Condensed", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('SCHOOL SERVICE', 256, 50);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; signMat = new THREE.MeshStandardMaterial({ map: t, roughness: 0.7 }); return signMat; }

export class SchoolLife {
  constructor(game) { this.g = game; this.active = false; this.people = []; this.vans = []; this.gate = 0; this.lastHour = null; this.stats = { departed: 0, handovers: 0 }; this.log = []; this.done = new Set(); this.wicket = 1; this.guard = new SchoolGuard(this); }
  note(s) { this.log.push(`${this.g.atmos.timeString || ''} ${s}`); if (this.log.length > 40) this.log.shift(); }
  inView(x, z) { if (this.fresh) return false; /* first pass after the player arrives: everything may be placed */ const P = this.g.player, cam = this.g.camera; const d = Math.hypot(x - P.x, z - P.z); if (d > 75) return false; const v = new THREE.Vector3(); cam.getWorldDirection(v); return ((x - cam.position.x) * v.x + (z - cam.position.z) * v.z) / (Math.hypot(x - cam.position.x, z - cam.position.z) || 1) > 0.35; }
  groundAt(x, z) { const c = this.g.collision; return c && c.groundAt ? c.groundAt(x, z, 1.2, 0.6) : L.groundY(x, z); }
  update(dt) {
    const g = this.g, P = g.player, h = g.atmos.hour; const d = Math.hypot(P.x - CX, P.z - CZ);
    if (!this.active && d < NEAR) this.spawn(); else if (this.active && d > FAR && !this.vans.some((v) => v.drive)) this.despawn();
    if (this.lastHour != null && this.lastHour < DISMISSAL && h >= DISMISSAL && h < DISMISSAL + 0.5 && d < 170) g.hud.notify(SCHOOL.name, '1:30 pm — school is over. Teachers see everyone off at the gate; parents and school vans gather on Horton Place.', 'info', 5);
    if (this.lastHour != null && h < this.lastHour - 12) this.done.clear(); // new day
    if (this.lastHour != null && this.lastHour < hm(7, 25) && h >= hm(7, 25) && h < hm(7, 50) && d < 170) g.hud.notify(SCHOOL.name, '7:30 am — the school run: the gates are open, staff greet arrivals and parents\' cars and school vans crowd the Horton Place kerb.', 'info', 5);
    this.lastHour = h;
    // gates
    const want = inWin(h, GATE_OPEN) || this.vanDriving() ? 1 : 0;
    this.gate = clamp(this.gate + Math.sign(want - this.gate) * dt / 2.4, 0, 1); const e = (1 - Math.cos(this.gate * Math.PI)) / 2;
    const an = g.world?.landmarks?.anim || {}; if (an.schoolGate) { an.schoolGate[0].rotation.y = -e * Math.PI / 2; an.schoolGate[1].rotation.y = e * Math.PI / 2; }
    if (this.gateColl === undefined) this.gateColl = (g.collision?.list || []).find((c) => c.id === 'schoolGate') || null; if (this.gateColl) this.gateColl.h = this.gate > 0.5 ? 0 : 2.15;
    if (this.gateOpenColl === undefined) this.gateOpenColl = (g.collision?.list || []).filter((c) => c.id === 'schoolGateOpenL' || c.id === 'schoolGateOpenR'); for (const c of this.gateOpenColl) c.h = this.gate > 0.5 ? 2.15 : 0; // swung-open leaves are solid where they rest
    // pedestrian wicket: open by day; at night only for someone the watchman let in, or from the inside (see SchoolGuard)
    const wk = this.guard.wicketOpen(P, h) ? 1 : 0; this.wicket = clamp(this.wicket + Math.sign(wk - this.wicket) * dt / 1.1, 0, 1); const ew = (1 - Math.cos(this.wicket * Math.PI)) / 2;
    if (an.schoolWicket) an.schoolWicket.rotation.y = -ew * Math.PI / 2;
    if (this.wkColl === undefined) this.wkColl = (g.collision?.list || []).find((c) => c.id === 'schoolWicket') || null; if (this.wkColl) this.wkColl.h = this.wicket > 0.6 ? 0 : 2.15;
    if (this.wkOpenColl === undefined) this.wkOpenColl = (g.collision?.list || []).find((c) => c.id === 'schoolWicketOpen') || null; if (this.wkOpenColl) this.wkOpenColl.h = this.wicket > 0.6 ? 2.15 : 0;
    if (!this.active) { if (this.guard.present) this.guard.despawn(); return; }
    this.guard.update(dt, h, P);
    // daytime visitors are greeted by the day guard and asked to sign the book
    const ins = inCompound(P.x, P.z) && !P.vehicle; if (ins && this.wasIn === false && !isNight(h) && this.has('guard') && this.greetDay !== g.atmos.day && !g.director.active) { this.greetDay = g.atmos.day; g.hud.subtitle('Security', 'Good day. Visitors please sign the book at the security hut.', '', 3.2); } this.wasIn = ins;
    this.schedule(h);
    for (const p of this.people) this.updatePerson(p, dt, P, h);
    this.people = this.people.filter((p) => !p.gone);
    for (const v of this.vans) this.updateVan(v, dt, h);
    this.vans = this.vans.filter((v) => !v.gone);
  }
  // ---------------------------------------------------------------- cast
  addPerson(key, spec, x, z, yaw, act, extra = {}) { const ch = new Character(spec); const p = Object.assign({ key, ch, x, z, yaw, act, acc: 0, path: null, sp: 1.25 }, extra); ch.root.rotation.y = yaw; if (act) ch.anim.set(act); this.g.scene.add(ch.root); this.place(p); this.people.push(p); for (let k = 0; k < 20; k++) ch.anim.update(0.05, 0); return p; }
  place(p) { p.ch.root.position.set(p.x, this.groundAt(p.x, p.z), p.z); }
  vanDriving() { return this.vans.some((q) => q.drive && !q.kerb); } // school vans using the gate (parents' kerb cars never do)
  has(key) { return this.people.some((p) => p.key === key) || this.vans.some((v) => v.key === key); }
  staffDefs() { return [
    { key: 'tA', spec: { preset: 'f_teacher', sex: 'f' }, seed: 31, home: { x: 300, z: 371.4, yaw: -Math.PI / 2, act: null, patrol: [257, 322] }, gate: { x: 269.6, z: 333.2, yaw: Math.PI, act: 'look' } },
    { key: 'tB', spec: { preset: 'f_bank_saree', sex: 'f' }, seed: 37, home: { x: 267.4, z: 351.2, yaw: 0, act: 'talk' }, gate: { x: 272.4, z: 333.0, yaw: Math.PI, act: 'talk' } },
    { key: 'tC', spec: { preset: 'f_teacher', sex: 'f' }, seed: 43, home: { x: 267.4, z: 352.6, yaw: Math.PI, act: 'listen' }, gate: { x: 274.6, z: 333.4, yaw: Math.PI, act: 'look' } },
    { key: 'pr', spec: { preset: 'f_teacher', sex: 'f', band: 'mature' }, seed: 53, home: { x: 267.3, z: 347.5, yaw: Math.PI / 2, act: 'look' }, gate: { x: 271.2, z: 334.6, yaw: Math.PI, act: 'listen' } },
    // more adult women on the staff: the school office clerk and the sick-room nurse stay at their posts during dismissal;
    // a fourth teacher joins gate duty
    { key: 'of', spec: { preset: 'f_professional', sex: 'f' }, seed: 61, home: { x: 267.3, z: 345.2, yaw: Math.PI / 2, act: 'phone' }, gate: { x: 267.3, z: 345.2, yaw: Math.PI / 2, act: 'phone' } },
    { key: 'nr', spec: { preset: 'f_nurse', sex: 'f' }, seed: 67, home: { x: 267.4, z: 349.4, yaw: Math.PI / 2, act: 'look' }, gate: { x: 267.4, z: 349.4, yaw: Math.PI / 2, act: 'look' } },
    { key: 'tD', spec: { preset: 'f_kurti', sex: 'f' }, seed: 71, home: { x: 267.4, z: 354.0, yaw: Math.PI, act: 'talk' }, gate: { x: 276.8, z: 333.2, yaw: Math.PI, act: 'look' } },
  ]; }
  parentSpots() { return [[258, 328.4, 0, 'phone'], [260.4, 328.0, Math.PI / 2, 'talk'], [261.6, 328.0, -Math.PI / 2, 'listen'], [264.2, 328.6, 0, 'look'], [280.2, 328.3, 0, 'text'], [283, 328.0, Math.PI / 2, 'talk'], [284.2, 328.0, -Math.PI / 2, 'talk'], [288, 328.5, 0, 'phone'], [291.2, 328.2, 0, 'look']]; }
  schedule(h) {
    const P = this.g.player;
    // guard
    if (h >= 6 && h < 19 && !this.has('guard') && !this.inView(261.0, 333.6)) this.addPerson('guard', makeAppearance(611, { preset: 'm_security' }), 261.0, 333.6, Math.PI / 2, 'look');
    else if (isNight(h)) { const dg = this.people.find((q) => q.key === 'guard'); if (dg && !this.inView(dg.x, dg.z)) this.remove(dg); } // day guard off duty; the night watchman takes over
    // teachers and principal
    const staffOn = h >= STAFF[0] && h < STAFF[1], atGate = inWin(h, AT_GATE);
    for (const s of this.staffDefs()) { const p = this.people.find((q) => q.key === s.key);
      if (!p && staffOn) { const post = atGate ? s.gate : s.home; if (!this.inView(post.x, post.z)) { const np = this.addPerson(s.key, makeAppearance(s.seed, s.spec), post.x, post.z, post.yaw, post.act, { def: s, state: atGate ? 'gate' : 'home', patrol: atGate ? null : s.home.patrol, sp: 1.15 }); np.pause = 2; } }
      else if (p && !staffOn) { if (!p.leaving) { p.leaving = true; this.walk(p, [[SPINE, p.z], [SPINE, 333.5], [271, 331.5], [271, 328.2], [200, 328.2]], null); } }
      else if (p && !p.leaving) { const want = atGate ? 'gate' : 'home'; if (p.state !== want) { p.state = want; const post = s[want]; p.patrol = want === 'home' ? s.home.patrol : null; this.walk(p, [[SPINE, p.z], [SPINE, post.z], [post.x, post.z]], post); } } }
    // parents on the pavement (13:04 → leave 13:34…14:03)
    this.parentSpots().forEach(([x, z, yaw, act], i) => { const key = 'par' + i, arr = hm(13, 4) + i * 1.4 / 60, leave = hm(13, 34) + i * 3.6 / 60;
      const p = this.people.find((q) => q.key === key);
      if (!p && h >= arr && h < leave && !this.done.has(key)) { const spec = makeAppearance(7001 + i * 13, { age: 'adult', exclude: ['m_tourist_eu', 'm_tourist_ea'] }); const dir = x < 271 ? -1 : 1;
        if (!this.fresh && h < arr + 0.02 && Math.hypot(P.x - x, P.z - z) < 140) { const sx = 271 + dir * 60; if (!this.inView(sx, 328.2)) { const np = this.addPerson(key, spec, sx, 328.2, -dir * Math.PI / 2, null, { home: { x, z, yaw, act } }); this.walk(np, [[x, 328.2], [x, z]], { x, z, yaw, act }); } }
        else if (!this.inView(x, z)) this.addPerson(key, spec, x, z, yaw, act, { home: { x, z, yaw, act } }); }
      else if (p && h >= leave && !p.leaving) { p.leaving = true; this.done.add(key); const dir = x < 271 ? -1 : 1; this.walk(p, [[x, 328.2], [271 + dir * 75, 328.2]], null); } });
    // school vans: waiting on the inner drive 12:46 →, leaving one by one from 13:44
    // (arriving while the player is around: they drive in from Horton Place through the gate; otherwise they are already parked)
    SCHOOL.vanBays.forEach(([bx, bz], i) => { const key = 'van' + i, arr = hm(12, 46) + i * 2.5 / 60, dep = hm(13, 44) + i * 4 / 60;
      if (h >= arr && h < dep && !this.done.has(key) && !this.has(key)) { const near = Math.hypot(P.x - CX, P.z - CZ) < 160;
        if (!this.fresh && near && h < hm(13, 25) && this.gate > 0.9 && !this.vanDriving()) this.arriveVan(key, i, bx, bz); else if (!this.inView(bx, bz)) this.addVan(key, i, bx, bz); }
      const v = this.vans.find((q) => q.key === key); if (v && !v.drive && !v.arriving && h >= dep && this.gate > 0.9 && !this.vanDriving()) this.departVan(v); });
    // morning drop-off: the same vans drive in 7:02 →, stop at the bays, and leave again 7:34 → (the girls themselves are not shown)
    SCHOOL.vanBays.forEach(([bx, bz], i) => { const key = 'mvan' + i, arr = hm(7, 2) + i * 2.5 / 60, dep = hm(7, 34) + i * 3 / 60;
      if (h >= arr && h < dep && !this.done.has(key) && !this.has(key)) { const near = Math.hypot(P.x - CX, P.z - CZ) < 160;
        if (!this.fresh && near && h < hm(7, 26) && this.gate > 0.9 && !this.vanDriving()) this.arriveVan(key, i, bx, bz); else if (!this.inView(bx, bz)) this.addVan(key, i, bx, bz); }
      const v = this.vans.find((q) => q.key === key); if (v && !v.drive && !v.arriving && h >= dep && this.gate > 0.9 && !this.vanDriving()) this.departVan(v); });
    this.kerbRun(h, P);
    this.fresh = false;
  }
  walk(p, pts, post) { p.path = pts.map(([x, z]) => [x, z]); p.post = post; p.ch.anim.set(null); }
  updatePerson(p, dt, P, h) {
    let speed = 0;
    if (!p.path && p.patrol && (p.pause = (p.pause || 0) - dt) <= 0) { const tx = Math.abs(p.x - p.patrol[0]) < 1 ? p.patrol[1] : p.patrol[0]; p.path = [[tx, p.z]]; p.post = null; p.ch.anim.set(null); }
    if (p.path) { const [tx, tz] = p.path[0]; const dx = tx - p.x, dz = tz - p.z, dd = Math.hypot(dx, dz);
      if (dd < 0.12) { p.path.shift(); if (!p.path.length) { p.path = null; if (p.leaving) { this.remove(p); return; } const post = p.post || p.home; if (post) { p.yaw = post.yaw; p.ch.root.rotation.y = post.yaw; p.ch.anim.set(post.act || null); } p.pause = 4 + Math.random() * 4; } }
      else { const st = Math.min(dd, p.sp * dt); p.x += (dx / dd) * st; p.z += (dz / dd) * st; speed = p.sp; const want = Math.atan2(dx, dz); let a = want - p.ch.root.rotation.y; a = Math.atan2(Math.sin(a), Math.cos(a)); p.ch.root.rotation.y += a * Math.min(1, dt * 8); }
      this.place(p); }
    const d = Math.hypot(p.x - P.x, p.z - P.z); p.acc += dt; const rate = d < 45 ? 0 : d < 120 ? 0.15 : 0.5; if (p.acc >= rate) { p.ch.anim.update(Math.min(p.acc, 0.25), speed); p.acc = 0; }
  }
  remove(p) { p.gone = true; p.ch.root.parent?.remove(p.ch.root); p.ch.dispose && p.ch.dispose(); }
  // ---------------------------------------------------------------- vans
  makeVan(i, x, z, yaw) { const T = this.g.traffic; const v = new Vehicle('van', 5150 + i * 977, this.g.scene); v.place(x, z, yaw); v.parked = true; v.keep = true; v.school = true; T.parked.push(v);
    const m = schoolSign(); for (const [lz, ry] of [[1.55, 0], [-2.3, Math.PI]]) { const s = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 0.22), m); s.position.set(0, ry ? 1.55 : 2.14, lz); s.rotation.y = ry; v.mesh.add(s); } return v; }
  standDriver(o) { const v = o.v, i = o.i; o.drv = this.addPerson(o.key + 'drv', makeAppearance(8101 + i * 17, { sex: 'm', age: 'adult', exclude: ['m_tourist_eu', 'm_tourist_ea', 'm_fitness'] }), v.x - 0.9, v.z + 1.55, i % 2 ? 0 : Math.PI, i % 2 ? 'talk' : 'phone'); } // right-hand drive: driver's door on the south side
  addVan(key, i, bx, bz) { const v = this.makeVan(i, bx, bz, Math.PI / 2); const o = { key, v, i, drive: null }; this.standDriver(o); this.vans.push(o); this.note(`${key} waiting`); }
  arriveVan(key, i, bx, bz) { const v = this.makeVan(i, 352, 325.0, -Math.PI / 2); this.g.traffic.addDriver(v); const o = { key, v, i, arriving: true, bay: [bx, bz] };
    o.drive = { wp: 0, sp: 3, route: [[300, 325.0], [279, 325.0], [273.8, 326.4], [271.8, 329.8], [272.6, 333.4], [276.5, 336.2], [280, 337], [bx, bz]], end: 'park' }; this.vans.push(o); this.note(`${key} arriving`); }
  departVan(o) { const T = this.g.traffic, v = o.v; if (o.drv) this.remove(o.drv); T.addDriver(v); this.done.add(o.key);
    o.drive = { wp: 0, sp: 0, route: [[318, 337], [322.5, 335.6], [323, 333.2], [319, 332.5], [300, 332.5], [278, 332.5], [273.5, 332.0], [271.2, 329.8], [270.4, 327.6], [267.5, 325.6]], end: 'traffic' }; this.note(`${o.key} leaving`); }
  // ---------------------------------------------------------------- parents' cars at the kerb (school run)
  kerbRun(h, P) {
    const on = inWin(h, SCHOOL_RUN); this.kerbCd = (this.kerbCd ?? 0) - (this.g.dt || 0.05);
    for (const o of this.vans) if (o.kerb && !o.drive && o.stopT !== undefined && (o.stopT -= this.g.dt || 0.05) <= 0) { o.stopT = undefined; o.drive = { wp: 0, sp: 0, route: [[o.v.x - 5, LANE_Z + 0.4], [o.v.x - 11, LANE_Z]], end: 'traffic' }; this.note(`${o.key} pulling out`); }
    if (!on || this.kerbCd > 0) return; this.kerbCd = 5 + Math.random() * 6;
    const used = new Set(this.vans.filter((o) => o.kerb).map((o) => o.spot)); const free = KERB.map((x, i) => i).filter((i) => !used.has(i)); if (!free.length) return;
    const i = free[Math.floor(Math.random() * free.length)], x = KERB[i]; const n = (this.kerbN = (this.kerbN || 0) + 1); const key = 'kerb' + n;
    const T = this.g.traffic; const busy = (bx, bz, r) => T.all().some((v) => Math.hypot(v.x - bx, v.z - bz) < r);
    const type = PARENT_CARS[n % PARENT_CARS.length];
    if (!this.fresh && Math.hypot(P.x - x, P.z - KERB_Z) < 150 && !this.inView(x + 34, LANE_Z) && !busy(x + 34, LANE_Z, 9)) { // drives in along the kerb lane and pulls over
      const v = this.makeCar(type, n, x + 34, LANE_Z); T.addDriver(v); this.vans.push({ key, v, i: n, kerb: true, spot: i, drive: { wp: 0, sp: 4, route: [[x + 8, LANE_Z + 0.3], [x, KERB_Z]], end: 'kerb' } }); this.note(`${key} pulling in`); }
    else if (!this.inView(x, KERB_Z) && !busy(x, KERB_Z, 4.5)) { const v = this.makeCar(type, n, x, KERB_Z); T.addDriver(v); this.vans.push({ key, v, i: n, kerb: true, spot: i, drive: null, stopT: 20 + Math.random() * 30 }); this.note(`${key} waiting at the kerb`); }
  }
  makeCar(type, n, x, z) { const v = new Vehicle(type, 7700 + n * 389, this.g.scene); v.place(x, z, -Math.PI / 2); v.parked = true; v.keep = true; v.school = true; this.g.traffic.parked.push(v); return v; }
  handPiece() { const near = (x, z) => L.nodes.find((n) => n && Math.abs(n.x - x) < 1 && Math.abs(n.z - z) < 1); const from = near(300, 320), to = near(240, 320); if (!from || !to) return null;
    const seg = L.segments.find((s) => s.dir === 'h' && Math.abs(s.z0 - 320) < 1 && Math.min(s.x0, s.x1) <= 241 && Math.max(s.x0, s.x1) >= 299); if (!seg) return null; return linePiece(seg, from, to, 1); }
  updateVan(o, dt, h) {
    const v = o.v; if (!o.drive) return;
    const D = o.drive, [tx, tz] = D.route[D.wp]; const dx = tx - v.x, dz = tz - v.z, dd = Math.hypot(dx, dz);
    const want = Math.atan2(dx, dz); let a = want - v.yaw; a = Math.atan2(Math.sin(a), Math.cos(a)); const turn = Math.abs(a);
    const road = D.end === 'park' && D.wp < 2; D.sp = Math.min(D.sp + dt * (road ? 3 : 1.6), turn > 0.5 ? 2.2 : road ? 7.5 : 3.6); if (road && D.wp === 1 && dd < 14) D.sp = Math.min(D.sp, 2.4 + dd * 0.35); /* slow for the left turn into the gate */ v.yaw += clamp(a, -dt * 1.5, dt * 1.5); v.x += Math.sin(v.yaw) * D.sp * dt; v.z += Math.cos(v.yaw) * D.sp * dt; v.speed = D.sp; v.steer = clamp(a, -0.5, 0.5); v.place(v.x, v.z, v.yaw);
    if (dd < (D.wp === D.route.length - 1 && D.end === 'park' ? 0.35 : 1.0)) { D.wp++; if (D.wp >= D.route.length) { if (D.end === 'kerb') { o.drive = null; v.speed = 0; v.steer = 0; v.place(v.x, v.z, -Math.PI / 2); o.stopT = 20 + Math.random() * 30; this.note(`${o.key} stopped at the kerb`); } else if (D.end === 'park') { o.drive = null; o.arriving = false; v.speed = 0; v.steer = 0; v.place(o.bay[0], o.bay[1], Math.PI / 2); if (v.driverChar) { v.driverChar.root.parent?.remove(v.driverChar.root); v.driverChar.dispose(); v.driverChar = null; } this.standDriver(o); this.note(`${o.key} parked`); } else this.handover(o); } }
  }
  handover(o) { const T = this.g.traffic, v = o.v; const pi = T.parked.indexOf(v); if (pi >= 0) T.parked.splice(pi, 1); const piece = this.handPiece();
    if (piece) { let best = 0, bd = 1e9; for (let s = 0; s <= piece.len; s += 0.5) { const [x, z] = evalPiece(piece, s); const dd = Math.hypot(x - v.x, z - v.z); if (dd < bd) { bd = dd; best = s; } }
      v.parked = false; v.ai = { pieces: [piece], s: best, v0: 8.5, stuck: 0, honkCd: 0, bumped: 0, aggressive: 1 }; v.yaw = Math.atan2(piece.d[0], piece.d[1]); T.extend(v); T.vehicles.push(v); this.stats.handovers++; this.note(`${o.key} joined Horton Place traffic`); }
    else { v.parked = true; T.parked.push(v); }
    v.keep = false; o.gone = true; this.stats.departed++; }
  // ---------------------------------------------------------------- streaming
  spawn() { this.active = true; this.fresh = true; this.gateColl = undefined; this.note('spawn'); }
  despawn() { this.guard.despawn(); for (const p of this.people) this.remove(p); this.people = []; const T = this.g.traffic; for (const o of this.vans) { const i = T.parked.indexOf(o.v); if (i >= 0) T.parked.splice(i, 1); if (o.v.driverChar) { o.v.driverChar.root.parent?.remove(o.v.driverChar.root); o.v.driverChar.dispose(); } o.v.dispose(); } this.vans = []; this.active = false; this.note('despawn'); }
}
