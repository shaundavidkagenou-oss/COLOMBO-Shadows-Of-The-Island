// Boats on the water: Fort Harbour Marina (Marina.js) with its moored boats and the owners who come down, take one out
// and bring it back; the player's berth and fleet (bought on the Global sites, delivered the next day, switched at the
// berth's service pedestal); riding any boat you own (or one spawned from the debug menu); the harbour police patrol
// (1–2 boats, mornings and nights, with no wanted level; blue/red beacons on at night); the night lamps of every boat
// (BoatLamps, one draw call) and the wakes (BoatWater.Wakes, one draw call).
// Everything heavy is made at load: the marina, the moored fleet, the two police boats and a small pool of people for them.
import * as THREE from 'three';
import * as L from '../world/Layout.js';
import { Boat } from './Boat.js';
import { BOATS, YACHT_IDS, BOAT_IDS, JETSKI_IDS, boatName } from './BoatCatalog.js';
import { boatModel } from './BoatModels.js';
import { Wakes, waterAt } from './BoatWater.js';
import { BoatLamps } from './BoatLamps.js';
import { MARINA, buildMarina, marinaBerths, berthRoute, walkRoute } from './Marina.js';
import { Character } from '../actors/Character.js';
import { makeAppearance, makePoliceAppearance } from '../actors/Appearance.js';
import { Input } from '../core/Input.js';
import { Audio } from '../audio/Audio.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const rs = (n) => `Rs. ${Math.round(n).toLocaleString('en-LK')}`;
const OUTBOARD = new Set(['cc', 'rib', 'offshore', 'police', 'bowrider']);
const COMPANY = { yacht: 'Ceylon Blue Yacht Brokers', boat: 'Lanka Marine Mart', jetski: 'Wave Rider Lanka' };
export const BOAT_COMPANY = COMPANY;
// the harbour police patrol: a loop through the harbour and down the Fort / Galle Face coast (all clear of the moored ships,
// the crane booms and the marina)
const PATROL = [[150, -1320], [20, -1300], [-120, -1290], [-300, -1290], [-470, -1300], [-600, -1240], [-640, -1050], [-640, -800], [-620, -500], [-640, -200], [-700, -400], [-700, -900], [-560, -1400], [-300, -1420], [0, -1450], [120, -1390]];
const PATROL_HOURS = (h) => (h >= 6 && h < 11) || h >= 19 || h < 4.5; // morning watch and the night watch
const AWAY_PT = { x: 60, z: -1560 }; // where boats go when they head out of the harbour (out of sight)

let _seed = 1; const rnd = () => { _seed = (_seed * 16807) % 2147483647; return (_seed - 1) / 2147483646; };
const _v = new THREE.Vector3(), _m = new THREE.Matrix4(), _fr = new THREE.Frustum(), _sz = new THREE.Vector2(), _lit = new THREE.Color();

export class Boats {
  constructor(g) {
    this.g = g; this.scene = g.scene; this.col = g.collision; this.t = 0;
    this.group = new THREE.Group(); this.group.name = 'boats'; this.scene.add(this.group);
    this.wakes = new Wakes(this.group); this.lamps = new BoatLamps(this.scene);
    this.marina = buildMarina(this.scene, this.col);
    this.rects = this.marina.colliders.filter((c) => c.kind === 'deck' || c.kind === 'pole' || c.kind === 'building');
    this.all = []; this.ride = null; this.owners = []; this.police = []; this.prompt = null;
    this.berths = marinaBerths().map((b) => ({ ...b, boat: null }));
    _seed = 7741; this.fillMarina();
    // people: harbour police officers (2 per boat) and three skippers (owners taking their boat out) — made now, not mid-game
    this.people = { police: [], civ: [] };
    for (let i = 0; i < 4; i++) { const sp = makePoliceAppearance(7700 + i * 29, 'patrol', { sex: 'm', band: i % 2 ? 'adult' : 'young' }); this.people.police.push(this.person(sp)); }
    for (let i = 0; i < 3; i++) { const sp = makeAppearance(8800 + i * 37, { sex: 'm', band: i === 2 ? 'mature' : 'adult' }); this.people.civ.push(this.person(sp)); }
    for (let i = 0; i < 2; i++) { const b = this.add('police36', { role: 'police', mode: 'drive', x: AWAY_PT.x, z: AWAY_PT.z }); b.root.visible = false; b.active = false; this.police.push(b); }
    this.eventT = 50 + rnd() * 40; this.patrolN = 1 + (rnd() < 0.5 ? 1 : 0); this.patrolDay = -1; this.slipBoat = null;
    this.wind = 0.4;
  }
  person(spec) { const ch = new Character(spec); ch.root.visible = false; ch.root.traverse((o) => { if (o.isMesh) o.castShadow = true; }); ch.busy = false; this.scene.add(ch.root); return ch; }
  add(id, o = {}) { const b = new Boat(id, o); b.role = o.role || 'civ'; this.group.add(b.root); this.all.push(b); b.onWreck = (bb, by) => this.wrecked(bb, by); return b; }
  remove(b) { const i = this.all.indexOf(b); if (i >= 0) this.all.splice(i, 1); this.wakes.drop(b); b.dispose(); }
  // ---------------------------------------------------------------------------------------------------- the moored fleet
  fits(id, B) { const M = boatModel(id); return M.len <= B.maxLen + 0.3 && M.halfBeam * 2 < (B.side === 'Q' ? 9 : 8.8); }
  fillMarina() {
    const want = { W: ['dondra26', 'kalpitiya21', 'galle58', 'negombo23', 'unawatuna24', 'beruwala23', 'hikkaduwa30', 'dondra26', 'kalpitiya21'], E: ['ruhunu39', 'mirissa46', 'trinco44', 'weligama40', 'hikkaduwa30', 'negombo23', 'mirissa46'], Q: ['meridian72', 'halcyon52'] };
    const cols = [{}, { hull: '#f1f0ea' }, { hull: '#e9e4d6' }, { hull: '#1f2f45', sheer: '#1f2f45' }, { hull: '#f3f3f0', sheer: '#7a1f24' }, { hull: '#dfe6ea' }];
    for (const B of this.berths) {
      if (B.side !== 'Q' && rnd() < 0.2) continue; // a few empty berths (boats out)
      const list = want[B.side]; let id = null; for (let k = 0; k < 6 && !id; k++) { const c = list[Math.floor(rnd() * list.length)]; if (this.fits(c, B)) id = c; } if (!id) continue;
      const M = boatModel(id); const x = B.x(M.len, M.halfBeam); const col = BOATS[id].cat === 'boat' && rnd() < 0.6 ? cols[Math.floor(rnd() * cols.length)] : undefined;
      const b = this.add(id, { role: 'moored', mode: 'moored', x, z: B.zc, yaw: B.yaw, col, berth: { x, z: B.zc, yaw: B.yaw } }); b.home = B; B.boat = b; b.cabinNight = rnd() < 0.35; // some owners aboard in the evening (cabin lit)
    }
  }
  // ---------------------------------------------------------------------------------------------------- the player's fleet (story.state.boats)
  state() { const S = this.g.story.state; if (!S.boats) S.boats = { slip: false, owned: [], active: null, pending: [], uid: 1 }; return S.boats; }
  owns(id) { return this.state().owned.some((o) => o.id === id) || this.state().pending.some((o) => o.id === id); }
  buyBerth(free = false) {
    const st = this.state(); if (st.slip) return { ok: false, msg: 'You already hold ' + MARINA.slipName + '.' };
    const S = this.g.story.state; if (!free && S.money < MARINA.berthPrice) return { ok: false, msg: `Not enough money (${rs(MARINA.berthPrice)}).` };
    if (!free) this.g.story.pay(-MARINA.berthPrice, MARINA.name + ' · ' + MARINA.slipName); st.slip = true;
    this.g.story.message(MARINA.name, `Welcome aboard! ${MARINA.slipName} (the T-head alongside berth, up to 42 m) is yours. Shore power, water and 24 h security included. Boats you buy are delivered straight to your berth.`);
    return { ok: true, msg: `${MARINA.slipName} at ${MARINA.name} is yours.` };
  }
  order(id, free = false) {
    const d = BOATS[id]; if (!d) return { ok: false, msg: 'Unknown boat.' }; const st = this.state(); const S = this.g.story.state;
    if (!st.slip) return { ok: false, msg: `You need a berth first — buy ${MARINA.slipName} at ${MARINA.name} (fortharbourmarina.lk).` };
    if (this.owns(id)) return { ok: false, msg: `You already own a ${boatName(id)}.` };
    if (!free && S.money < d.price) return { ok: false, msg: `Not enough money: ${rs(d.price)} needed.` };
    if (!free) this.g.story.pay(-d.price, `${COMPANY[d.cat] || 'Boat dealer'} · ${boatName(id)}`);
    const A = this.g.atmos; st.pending.push({ id, uid: st.uid++, day: A ? A.day : 1, slept: false });
    this.g.story.message(COMPANY[d.cat] || 'Boat dealer', `Thank you for your purchase! Your ${boatName(id)} is being prepared and will be delivered to ${MARINA.slipName}, ${MARINA.name} soon — we will text you when she is in.`);
    Audio.ui && Audio.ui('notify'); return { ok: true, msg: `Ordered: ${boatName(id)}. Delivery to ${MARINA.slipName}.` };
  }
  onRest() { for (const p of this.state().pending) p.slept = true; this.deliver(); } // slept (Game.restUntil)
  deliver(force = false) {
    const st = this.state(); const A = this.g.atmos; const day = A ? A.day : 1; const keep = [];
    for (const p of st.pending) { if (force || p.slept || day > p.day) { st.owned.push({ id: p.id, uid: p.uid }); const d = BOATS[p.id];
      this.g.story.message(COMPANY[d.cat] || 'Boat dealer', `Delivered: your ${boatName(p.id)} is at ${MARINA.slipName}, ${MARINA.name}${p.insured ? ' (insurance replacement)' : ''}. Keys are with the marina office. Use the service pedestal on the T-head to switch between your boats. Enjoy the water!`);
      if (!st.active) st.active = p.uid; this.g.hud && this.g.hud.notify(COMPANY[d.cat] || 'Boat dealer', `${boatName(p.id)} delivered to your berth`, 'info', 5); } else keep.push(p); }
    st.pending = keep; this.syncSlip();
  }
  activeEntry() { const st = this.state(); return st.owned.find((o) => o.uid === st.active) || null; }
  // the owned boat at the berth: (re)made when the active one changes; the one you are riding is never pulled from under you
  syncSlip() {
    const e = this.activeEntry(); const cur = this.slipBoat;
    if (cur && (!e || cur.uid !== e.uid)) { if (!this.ride || this.ride.b !== cur) this.remove(cur); this.slipBoat = null; }
    if (e && !this.slipBoat) { const M = boatModel(e.id); const s = MARINA.slip(M.len, M.halfBeam);
      const b = this.add(e.id, { role: 'owned', mode: 'moored', x: s.x, z: s.z, yaw: s.yaw, berth: { x: s.x, z: s.z, yaw: s.yaw } }); b.uid = e.uid; b.owned = true; this.slipBoat = b; }
  }
  switchNext() { const st = this.state(); if (st.owned.length < 1) return null; const i = st.owned.findIndex((o) => o.uid === st.active); const n = st.owned[(i + 1) % st.owned.length]; st.active = n.uid;
    if (this.slipBoat && this.slipBoat.uid === n.uid && this.slipBoat.mode !== 'moored') { this.remove(this.slipBoat); this.slipBoat = null; } /* bring it back to the berth */
    this.syncSlip(); return n; }
  wrecked(b, by) {
    const E = this.g.explosions; if (E && E.blast) { const e = b.model.engines[0] || [0, 0.4, -b.len * 0.4]; const p = b.worldPoint([e[0], e[1] + 0.3, e[2]], new THREE.Vector3()); try { E.blast(p, { power: clamp(b.len / 12, 0.55, 1.4) }); } catch (err) { console.warn('boat blast', err); } }
    if (b.role === 'police' && by === 'player' && this.g.police && !this.g.debug?.noWanted) this.g.police.addHeat(2, 'destroying a police boat', 'A police boat was destroyed.');
    if (b.owned) { const st = this.state(); const o = st.owned.find((q) => q.uid === b.uid); if (o) { st.owned = st.owned.filter((q) => q !== o); if (st.active === o.uid) st.active = null;
      st.pending.push({ id: o.id, uid: st.uid++, day: this.g.atmos ? this.g.atmos.day : 1, slept: false, insured: true });
      this.g.story.message(COMPANY[BOATS[o.id].cat] || 'Boat dealer', `We are sorry to hear your ${boatName(o.id)} was lost. She is insured: a replacement will be delivered to ${MARINA.slipName} tomorrow.`); } }
    if (b === this.slipBoat) this.slipBoat = null;
  }
  // ---------------------------------------------------------------------------------------------------- water / obstacles
  wet(x, z, r) { if (x < -1850 || z < -2600 || z > 1650) return false; for (const [dx, dz] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]]) { const px = x + dx, pz = z + dz; if (!L.isSea(px, pz) || L.inLake(px, pz)) return false; } return true; }
  static ships() { return [[-340, -180, -1236, -1208], [-25, 105, -1236, -1208]]; } // moored container ships (no colliders of their own)
  blockedAt(x, z, r, self) {
    if (!this.wet(x, z, r)) return true;
    for (const c of this.rects) if (x > c.x0 - r && x < c.x1 + r && z > c.z0 - r && z < c.z1 + r) return true;
    for (const s of Boats.ships()) if (x > s[0] - r && x < s[1] + r && z > s[2] - r && z < s[3] + r) return true;
    if (z > -1192 - r && z < -1180 && x < 230) for (let k = 0; k < 7; k++) { const cx = -430 + 92 * k; if (Math.abs(x - cx) < 9 + r) return true; } // crane legs on the quay apron
    for (const o of this.all) { if (o === self || !o.root.visible || o.mode === 'sunk' || o.away) continue; const R = (o.len + (self ? self.len : 0)) * 0.6 + 2; if (Math.abs(o.x - x) > R || Math.abs(o.z - z) > R) continue;
      for (const [ox, oz, orr] of o.circles()) if ((ox - x) ** 2 + (oz - z) ** 2 < (orr + r) ** 2) return true; }
    return false;
  }
  blocked(b) { for (const [x, z, r] of b.circles()) if (this.blockedAt(x, z, r, b)) return true; return false; }
  // open water for a boat of this size near (x, z): ahead of the player first, then round in rings
  findWater(x, z, yaw, id) {
    const M = boatModel(id); const n = Math.max(2, Math.ceil(M.len / (M.halfBeam * 2.2))); const r = M.halfBeam * 0.95 + 0.6;
    const ok = (px, pz, a) => { const s = Math.sin(a), c = Math.cos(a); for (let i = 0; i < n; i++) { const lz = -M.len * 0.45 + (M.len * 0.9 * i) / (n - 1); if (this.blockedAt(px + lz * s, pz + lz * c, r, null)) return false; } return true; };
    for (let d = 4 + M.halfBeam; d < 160; d += 3) for (let k = 0; k < 16; k++) { const a = yaw + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 8); const px = x + Math.sin(a) * d, pz = z + Math.cos(a) * d; for (const h of [a + Math.PI / 2, a, a - Math.PI / 2]) if (ok(px, pz, h)) return { x: px, z: pz, yaw: h }; }
    return null;
  }
  // ---------------------------------------------------------------------------------------------------- debug / spawning
  spawnNear(id, P, own = false) {
    const p = this.findWater(P.x, P.z, P.yaw, id); if (!p) return null;
    const b = this.add(id, { role: id === 'police36' ? 'debugPolice' : 'free', mode: 'drive', x: p.x, z: p.z, yaw: p.yaw }); b.free = true; b.owned = own; return b;
  }
  // ---------------------------------------------------------------------------------------------------- view helpers
  frustum() { const c = this.g.camera; _m.multiplyMatrices(c.projectionMatrix, c.matrixWorldInverse); _fr.setFromProjectionMatrix(_m); }
  seen(x, y, z, r = 2, far = 320) { const c = this.g.camera.position; const d = Math.hypot(x - c.x, z - c.z); if (d > far) return false; _v.set(x, y, z); return _fr.intersectsSphere({ center: _v, radius: r }); }
  camDist(x, z) { const c = this.g.camera.position; return Math.hypot(x - c.x, z - c.z); }
  // ---------------------------------------------------------------------------------------------------- AI helm
  pilot(b, dt) {
    const R = b.route; if (!R || !R.length) return { thr: 0, steer: 0 };
    if (b._pyT !== this.t) { b._yr = dt > 0 ? wrap(b.yaw - (b._py ?? b.yaw)) / dt : 0; b._py = b.yaw; b._pyT = this.t; } // yaw rate (once per step, not per recursive call)
    const w = R[0]; let dx = w.x - b.x, dz = w.z - b.z; let d = Math.hypot(dx, dz); const rev = !!w.rev;
    if (w.line && !rev) { const [ux, uz] = w.line, nx = -uz, nz = ux; const along = dx * ux + dz * uz, cross = (b.x - w.x) * nx + (b.z - w.z) * nz, c = clamp(cross * 0.35, -0.7, 0.7); d = Math.max(0, along); dx = ux - nx * c; dz = uz - nz * c; } // lined-up legs: follow the berth's centreline (steer back onto it), not a beeline that swings wide past it
    const reach = w.r ?? (w.stop ? 1.6 : rev ? 2.2 : Math.max(5, b.len * 0.7));
    if (d < reach) { R.shift(); if (!R.length) { b.unjams = 0; return { thr: 0, steer: 0, done: true }; } return this.pilot(b, dt); }
    const want = rev ? Math.atan2(-dx, -dz) : Math.atan2(dx, dz); const err = wrap(want - b.yaw);
    const inMarina = b.x > 140 && b.x < 232 && b.z > -1300 && b.z < -1185;
    const vmax = w.v ?? (inMarina ? 2.4 : b.role === 'police' ? 7 : Math.min(9, b.def.max * 0.6));
    let steer = clamp(err * 2.4 - (inMarina && !rev ? (b._yr || 0) * 1.6 : 0), -1, 1); if (rev && b.u < -0.3) steer = -steer; /* in the marina the swing is checked as it nears the heading: a pivot used to carry a long hull 45° past it, bow onto the next finger */
    const sp = rev ? -b.u : b.u; let target = vmax * clamp(1.25 - Math.abs(err) * 0.85, rev ? 0.4 : 0.22, 1); if (w.stop || rev) target = Math.min(target, 0.4 + d * 0.3);
    let thr = clamp((target - sp) * 0.9, -1, 1); if (rev) thr = -thr;
    const pivot = inMarina && !rev && Math.abs(err) > 0.5 ? (w.turn && Math.abs(err) > 1.2 ? w.turn : Math.sign(err)) : 0; if (pivot) { thr = Math.min(thr, 0.25); if (w.turn) steer = pivot; } /* w.turn: which way to swing (the bow away from a wall) */ /* tight corners at the berths: turn on the spot first */
    // stuck behind something (another boat crossing): back off a little, then try again
    b.slowT = Math.abs(b.u) < 0.3 ? (b.slowT || 0) + dt : 0; /* read by the owner logic: hemmed in for long → it gives up gracefully */
    b.stuckT = (Math.abs(b.u) < 0.25 && Math.abs(thr) > 0.3) ? (b.stuckT || 0) + dt : 0;
    // 52nd: jammed on a finger pier / the neighbour while swinging into a berth off its centreline (a wide catamaran used to grind
    // there for up to a minute): back straight out along the berth's axis to a point on the centreline, then come in square
    // (also a pivot turn the finger / neighbour blocks: no way on, no swing — the thrust is too low for stuckT)
    b.stallT = inMarina && Math.abs(b.u) < 0.15 && Math.abs(b._yr || 0) < 0.02 && (Math.abs(thr) > 0.1 || pivot) ? (b.stallT || 0) + dt : 0;
    if (w.unjam && (b.stuckT > 3 || b.stallT > 3)) { R.shift(); b.stuckT = 0; b.stallT = 0; return this.pilot(b, dt); } // can't back out either: give that up, carry on
    if (inMarina && w.line && (b.stuckT > 2.5 || b.stallT > 3) && !rev && (b.unjams || 0) < 4) { const [ux, uz] = w.line; // only on the lined-up berth legs: elsewhere the normal stuck reverse does
      const t = (b.x - w.x) * ux + (b.z - w.z) * uz, back = Math.max(4, b.len * 0.35); // the boat's foot on the berth's centreline, then a few metres further out
      R.unshift({ x: w.x + ux * (t - back), z: w.z + uz * (t - back), rev: true, r: 1.5, v: 1.0, unjam: true }); b.unjams = (b.unjams || 0) + 1; b.stuckT = 0; b.stallT = 0; return this.pilot(b, dt); }
    if (b.stuckT > 4) { thr = -thr; steer = -steer; if (b.stuckT > 6) b.stuckT = 0; }
    return { thr, steer, pivot };
  }
  // ---------------------------------------------------------------------------------------------------- owners at the marina
  freeCiv() { return this.people.civ.find((c) => !c.busy) || null; }
  walkSpot() { const pts = [[232.5, -1186], [232.5, -1295], [232.5, -1240]]; for (const p of pts) if (!this.seen(p[0], 1, p[1], 1.5, 260)) return p; return null; }
  startDeparture(B) {
    const b = B.boat; const ch = this.freeCiv(); if (!b || !ch || b.owner) return false;
    const near = this.camDist(MARINA.gangTop.x, MARINA.gangTop.z) < 420;
    if (!near) { b.away = true; b.root.visible = false; b.awayT = 240 + rnd() * 300; return true; } // nobody watching: it simply went out
    const sp = this.walkSpot(); if (!sp) return false; ch.busy = true;
    const path = B.walk ? [sp, ...walkRoute(B)] : [sp, [231.4, B.zc]];
    const O = { ch, b, B, stage: 'walk', path: path.map((p) => [p[0], p[1]]), x: sp[0], z: sp[1], y: this.col.groundAt(sp[0], sp[1], 2, 3), t: 0 };
    ch.root.visible = true; ch.anim.standUp(); ch.anim.set(null); b.owner = O; this.owners.push(O); return true;
  }
  startArrival(b) {
    const B = b.home; const ch = this.freeCiv(); if (!B || !ch) return false;
    const M = b.model; const out = berthRoute(B, M.len); const back = out.slice().reverse().filter((p) => !p.rev).map((p) => ({ x: p.x, z: p.z }));
    const bx = B.x(M.len, M.halfBeam);
    if (B.side === 'Q') { back.pop(); back.pop(); /* not the swing off the wall */ const tx = Math.min(bx - 4, 228 - M.len / 2); back.push({ x: tx, z: B.zc + M.len * 0.2, v: 1.5, r: 3 }, { x: tx, z: B.zc - M.len * 0.25, stop: true, turn: -1 }); } // down the fairway bow first, turn round beside the berth (thrusters), the lines walk her in
    else { const sd = B.side === 'W' ? -1 : 1; const zs = B.zc - Math.max(0, M.len / 2 + M.halfBeam + 1 - (MARINA.head.z0 - B.zc)); /* the inner slot: swing short of the head walkway, the centreline leg takes up the offset */ back.push({ x: bx + sd * (M.len * 0.6 + 8), z: zs, v: 1.6, r: 1.2 }, { x: bx + sd * (M.len * 0.6 + 1), z: B.zc, v: 1.0, r: 1.0, line: [-sd, 0] }, { x: bx, z: B.zc, stop: true, line: [-sd, 0] }); } // lined up on the slot first, then straight in
    // a slow boat (a cruising catamaran makes ~5 knots) starts at the harbour-entrance waypoint instead of 250 m out when nobody can
    // see it appear there — arrivals took up to four minutes
    if (b.def && b.def.max < 6 && back.length > 4) { const nx = back[1]; if (!this.seen(nx.x, 1, nx.z, M.len, 900) || this.camDist(nx.x, nx.z) >= 500) back.shift(); }
    const st = back.shift(); if (this.seen(st.x, 1, st.z, M.len, 900) && this.camDist(st.x, st.z) < 500) return false; // never pops into view
    ch.busy = true; b.away = false; b.root.visible = true; b.mode = 'drive'; b.place(st.x, st.z, Math.atan2(back[0].x - st.x, back[0].z - st.z), true); b.route = back;
    this.seat(ch, b, b.model.seat); const O = { ch, b, B, stage: 'inbound', t: 0 }; b.owner = O; this.owners.push(O); return true;
  }
  seat(ch, b, seat) { if (ch.root.parent !== b.root) { ch.root.parent && ch.root.parent.remove(ch.root); b.root.add(ch.root); } ch.root.visible = true; ch.root.position.set(seat.x, seat.y, seat.z); ch.root.rotation.set(0, 0, 0); ch.anim.mocapOff = true; ch.anim.sitIn(seat, 1); ch.anim.update(1 / 30, 0, 0); }
  unseat(ch, x, y, z, yaw) { if (ch.root.parent !== this.scene) { ch.root.parent && ch.root.parent.remove(ch.root); this.scene.add(ch.root); } ch.anim.standUp(); ch.anim.mocapOff = false; ch.root.position.set(x, y, z); ch.root.rotation.set(0, yaw, 0); }
  release(O) { const ch = O.ch; this.unseat(ch, 0, -50, 0, 0); ch.root.visible = false; ch.busy = false; if (O.b && O.b.owner === O) O.b.owner = null; O.done = true; }
  updateOwner(O, dt) {
    const ch = O.ch, b = O.b; O.t += dt;
    if (O.stage === 'walk' || O.stage === 'walkOut') {
      const p = O.path[0]; if (!p) { if (O.stage === 'walk') { O.stage = 'board'; O.t = 0; O.from = [O.x, O.y, O.z]; } else { if (!this.seen(O.x, O.y + 1, O.z, 1, 200) || O.t > 90) this.release(O); } return; }
      const dx = p[0] - O.x, dz = p[1] - O.z, d = Math.hypot(dx, dz); const v = 1.35;
      if (d < 0.15) { O.path.shift(); return; } const st = Math.min(d, v * dt); O.x += (dx / d) * st; O.z += (dz / d) * st;
      O.y = this.col.groundAt(O.x, O.z, O.y + 1.2, 1.5); const yaw = Math.atan2(dx, dz); let a = wrap(yaw - ch.root.rotation.y); ch.root.rotation.y += a * Math.min(1, dt * 8);
      ch.root.position.set(O.x, O.y, O.z); if (this.camDist(O.x, O.z) < 90) ch.anim.update(dt, v); return;
    }
    if (O.stage === 'board') { // step aboard (down off the pontoon / quay onto the deck) and sit at the helm
      const k = Math.min(1, O.t / 1.4); const seat = b.model.seat; const wp = b.worldPoint([seat.x, seat.y, seat.z], _v);
      if (k < 1) { ch.root.position.set(O.from[0] + (wp.x - O.from[0]) * k, O.from[1] + (wp.y - O.from[1]) * k + Math.sin(k * Math.PI) * 0.35, O.from[2] + (wp.z - O.from[2]) * k); ch.anim.update(dt, k < 0.8 ? 1.0 : 0); return; }
      this.seat(ch, b, seat); O.stage = 'aboard'; O.t = 0; return;
    }
    if (O.stage === 'aboard') { if (O.t > 4) { const M = b.model; b.mode = 'drive'; b.route = berthRoute(O.B, M.len).map((p) => ({ ...p })); b.route.push({ x: AWAY_PT.x, z: AWAY_PT.z }); O.B.boat = null; O.stage = 'outbound'; if (b.sails.length) b.setSailsVisible(false); } return; }
    if (O.stage === 'outbound') { if (!b.route || !b.route.length || (b.slowT > 25 && !this.seen(b.x, 2, b.z, b.len, 400)) || (b.z < -1420 && this.camDist(b.x, b.z) > 260 && !this.seen(b.x, 2, b.z, b.len, 600))) { b.away = true; b.root.visible = false; b.mode = 'moored'; b.awayT = 300 + rnd() * 420; O.B.boat = b; /* the berth is still hers */ this.release(O); } return; }
    if (O.stage === 'inbound') { if (b.slowT > 25 && b.route && b.route.length) { const B = O.B; if (Math.hypot(b.x - B.x(b.len, b.model.halfBeam), b.z - B.zc) < 35) b.route.length = 0; else if (!this.seen(b.x, 2, b.z, b.len, 500)) { const w = b.route[0]; b.place(w.x, w.z, b.yaw, true); b.slowT = 0; } } /* hemmed in: the lines / a nudge from the marina RIB */
      if (!b.route || !b.route.length) { const B = O.B, M = b.model; const x = B.x(M.len, M.halfBeam); b.berth = { x: b.x, z: b.z, yaw: B.yaw }; O.to = { x, z: B.zc }; b.mode = 'moored'; B.boat = b; O.stage = 'moor'; O.t = 0; } return; }
    if (O.stage === 'moor') { const bb = b.berth, dx = O.to.x - bb.x, dz = O.to.z - bb.z, dd = Math.hypot(dx, dz); if (dd > 0.02) { const st = Math.min(dd, 0.7 * dt); bb.x += (dx / dd) * st; bb.z += (dz / dd) * st; O.t = 0; } /* thrusters + lines walk her alongside */
      if (O.t > 4) { const B = O.B; const tgt = B.walk ? B.walk : [231.4, B.zc]; const y = this.col.groundAt(tgt[0], tgt[1], 2, 3);
      this.unseat(ch, tgt[0], y, tgt[1], 0); O.x = tgt[0]; O.z = tgt[1]; O.y = y; const wr = B.walk ? walkRoute(B).slice().reverse().slice(1) : []; const sp = this.walkSpot() || [232.5, -1186]; O.path = [...wr, sp].map((p) => [p[0], p[1]]); O.stage = 'walkOut'; O.t = 0; b.owner = null; } }
  }
  updateMarinaLife(dt) {
    this.eventT -= dt; for (const b of this.all) if (b.away && b.awayT !== undefined) b.awayT -= dt;
    if (this.eventT > 0) return; this.eventT = 70 + rnd() * 110;
    const back = this.all.find((b) => b.away && b.awayT <= 0 && b.home && !b.owner);
    if (back) { if (this.camDist(MARINA.gangTop.x, MARINA.gangTop.z) > 420) { back.away = false; back.root.visible = true; back.mode = 'moored'; const M = back.model, B = back.home; const x = B.x(M.len, M.halfBeam); back.berth = { x, z: B.zc, yaw: B.yaw }; back.place(x, B.zc, B.yaw, true); } else this.startArrival(back); return; }
    const out = this.all.filter((b) => b.mode === 'moored' && b.home && !b.away && !b.owner && !b.wrecked && b.root.visible).length; if (out < 6) return;
    const cand = this.berths.filter((B) => B.boat && !B.boat.away && !B.boat.owner && !B.boat.wrecked && B.boat.mode === 'moored'); if (cand.length) this.startDeparture(cand[Math.floor(rnd() * cand.length)]);
  }
  // ---------------------------------------------------------------------------------------------------- harbour police
  updatePatrol(dt) {
    const A = this.g.atmos; const h = A ? A.hour : 12; const stars = this.g.police && this.g.police.stars ? this.g.police.stars() : 0;
    if (A && A.day !== this.patrolDay) { this.patrolDay = A.day; this.patrolN = 1 + (rnd() < 0.5 ? 1 : 0); }
    const want = this.forcePatrol ? 2 : stars === 0 && PATROL_HOURS(h) ? this.patrolN : 0;
    this.police.forEach((b, i) => {
      if (b.wrecked) { if (b.mode === 'sunk' && !this.seen(b.x, 1, b.z, 10, 900)) { this.respawnPolice(i); } return; }
      if (i < want && !b.active) { // come on watch: appear at a patrol point the camera can't see
        const pts = PATROL.map((p, k) => ({ p, k, d: this.camDist(p[0], p[1]) })).filter((q) => q.d > 160 && !this.seen(q.p[0], 2, q.p[1], 8, 1200)).sort((a, b2) => a.d - b2.d);
        const pick = pts[Math.min(pts.length - 1, Math.floor(rnd() * 3))]; if (!pick) return;
        b.active = true; b.leaving = false; b.root.visible = true; b.mode = 'drive'; b.away = false; const nx = PATROL[(pick.k + 1) % PATROL.length]; b.place(pick.p[0], pick.p[1], Math.atan2(nx[0] - pick.p[0], nx[1] - pick.p[1]), true); b.pk = (pick.k + 1) % PATROL.length; b.dir = 1;
        b.route = [{ x: nx[0], z: nx[1] }]; this.crewUp(b, i);
      } else if (i < want && b.active && b.leaving) { b.leaving = false; b.route = null; /* back on watch before she was out of sight: carry on patrolling */
      } else if (i >= want && b.active && !b.leaving) { b.leaving = true; b.route = [{ x: AWAY_PT.x, z: AWAY_PT.z }]; }
      if (!b.active) return;
      if (!b.route || !b.route.length) { if (b.leaving) { this.stowPolice(b); return; } b.pk = (b.pk + b.dir + PATROL.length) % PATROL.length; if (rnd() < 0.08) b.dir = -b.dir; const p = PATROL[b.pk]; b.route = [{ x: p[0] + (rnd() - 0.5) * 40, z: p[1] + (rnd() - 0.5) * 40 }]; }
      if (b.leaving && this.camDist(b.x, b.z) > 280 && !this.seen(b.x, 2, b.z, 10, 900)) this.stowPolice(b);
    });
  }
  crewUp(b, i) { const M = b.model; const a = this.people.police[i * 2], c = this.people.police[i * 2 + 1]; this.seat(a, b, M.seat); if (M.crew[0]) this.seat(c, b, M.crew[0]); else c.root.visible = false; b.crewChars = [a, c]; }
  stowPolice(b) { b.active = false; b.leaving = false; b.root.visible = false; b.mode = 'moored'; b.berth = { x: AWAY_PT.x, z: AWAY_PT.z, yaw: 0 }; b.place(AWAY_PT.x, AWAY_PT.z, 0, true); for (const ch of b.crewChars || []) { this.unseat(ch, 0, -50, 0, 0); ch.root.visible = false; } b.crewChars = null; }
  respawnPolice(i) { const old = this.police[i]; this.stowPolice(old); this.remove(old); const b = this.add('police36', { role: 'police', mode: 'drive', x: AWAY_PT.x, z: AWAY_PT.z }); b.root.visible = false; b.active = false; this.police[i] = b; }
  // ---------------------------------------------------------------------------------------------------- riding
  nearestBoard(P) {
    let best = null, bd = 3.2;
    for (const b of this.all) { if (!b.root.visible || b.mode === 'sunk' || b.wrecked || b.owner || (b.role === 'police' && b.active)) continue; if (Math.abs(b.x - P.x) > b.len + 6 || Math.abs(b.z - P.z) > b.len + 6) continue;
      const bp = b.worldPoint(b.model.board, _v); const d = Math.hypot(bp.x - P.x, bp.z - P.z); if (d < bd && Math.abs(bp.y - P.y) < 2.6) { bd = d; best = b; } }
    return best;
  }
  canDrive(b) { return b.owned || b.free || b.role === 'owned'; }
  interact(P, key) {
    if (this.ride) return this.rideInteract(P, key);
    if (P.vehicle || P.entry || P.exiting) return null;
    // marina office counter: buy the berth
    { const c = MARINA.office.counter; if (Math.hypot(P.x - c.x, P.z - c.z) < 1.6 && Math.abs(P.y - MARINA.deckY) < 1) { const st = this.state();
      if (!st.slip) { if (Input.wasPressed('interact')) { const r = this.buyBerth(); this.g.hud.notify(MARINA.name, r.msg, r.ok ? 'info' : 'warn', 4); } return `${key('interact')} Buy ${MARINA.slipName} — ${rs(MARINA.berthPrice)}`; }
      return `${MARINA.name} · ${MARINA.slipName} is yours · ${st.owned.length} boat${st.owned.length === 1 ? '' : 's'} owned`; } }
    // the berth's service pedestal: switch boats / bring yours back
    { const T = MARINA.terminal; const st = this.state(); if (st.slip && Math.hypot(P.x - T.x, P.z - T.z) < 1.8 && Math.abs(P.y - MARINA.deckY) < 1.2) {
      if (!st.owned.length) return st.pending.length ? `${MARINA.slipName} · delivery on its way` : `${MARINA.slipName} · no boats yet — order one on Global`;
      const cur = this.activeEntry(); const nx = st.owned[(st.owned.findIndex((o) => o.uid === st.active) + 1) % st.owned.length];
      const away = this.slipBoat && this.slipBoat.mode !== 'moored'; const one = st.owned.length === 1;
      if (Input.wasPressed('interact') && !(this.slipBoat && this.slipBoat.driverP)) { const n = this.switchNext(); if (n) this.g.hud.notify(MARINA.slipName, `${boatName(n.id)} is alongside`, 'info', 3); }
      return one ? `${key('interact')} ${away || !this.slipBoat ? 'Bring back' : 'Re-moor'} your ${boatName(cur ? cur.id : nx.id)}` : `${key('interact')} Switch boat: ${boatName(nx.id)} (now ${cur ? boatName(cur.id) : 'none'})`; } }
    const b = this.nearestBoard(P); if (!b) return null;
    if (!this.canDrive(b)) return b.role === 'police' ? 'Harbour police boat' : `${boatName(b.id)} · moored (not yours)`;
    if (Input.wasPressed('enter')) this.board(P, b);
    return `${key('enter')} Board ${boatName(b.id)}`;
  }
  board(P, b) {
    const ch = P.ch; const seat = b.model.seat; this.g.weapons?.forceHolster?.();
    const from = b.root.worldToLocal(ch.root.getWorldPosition(new THREE.Vector3()));
    ch.root.parent && ch.root.parent.remove(ch.root); b.root.add(ch.root); ch.root.position.copy(from);
    if (b.mode === 'moored') { b.mode = 'drive'; b.berth = null; } b.free = b.free || false; b.player = true; b.driverP = true; if (b.role === 'debugPolice') b.lightsOn = true;
    this.ride = { b, stage: 'in', t: 0, from: from.clone(), seat, sails: b.sailsUp }; P.boat = b; P.control = true; P.camYaw = b.yaw + Math.PI; if (P.swim || P.diveIn) { P.swimBreath = P.swim ? P.swim.breath : P.swimBreath; P.swim = null; P.diveIn = null; } ch.anim.set(null);
  }
  rideInteract(P, key) {
    const R = this.ride, b = R.b; if (R.stage !== 'ride') return null; const kn = Math.abs(b.speed) * 1.944;
    if (Input.wasPressed('enter')) { if (Math.abs(b.speed) > 2.2) this.g.hud.notify('Slow down', 'Slow the boat down to get off.', 'info', 1.5); else this.leave(P); return null; }
    if (b.sails.length && Input.wasPressed('interact')) { b.setSailsVisible(!b.sailsUp); this.g.hud.notify(boatName(b.id), b.sailsUp ? 'Sails up — the wind drives her when it allows' : 'Sails furled', 'info', 2); }
    if (Input.wasPressed('lights')) { b.navOff = !b.navOff; this.g.hud.notify(boatName(b.id), b.navOff ? 'Navigation lights off' : 'Navigation lights on', 'info', 1.5); }
    if (Input.wasPressed('horn')) Audio.horn && Audio.horn(b.len > 14 ? 'bus' : 'car', b.x, b.z);
    const hp = Math.round((b.hp / b.maxHp) * 100);
    return `${kn.toFixed(0)} kn · hull ${hp}%${b.sails.length ? ` · ${key('interact')} ${b.sailsUp ? 'Furl' : 'Hoist'} sails` : ''} · ${key('enter')} Get off`;
  }
  // get off: onto the pontoon / quay / any deck within reach, otherwise into the water beside her
  leave(P) {
    const R = this.ride, b = R.b; const M = b.model; let spot = null;
    for (const side of [1, -1]) for (const lz of [0, -M.len * 0.25, M.len * 0.25, -M.len * 0.45]) { const [x, z] = b.local(side * (M.halfBeam + 0.9), lz); const y = this.col.groundAt(x, z, MARINA.deckY + 1.5, 2.5);
      if (y > -0.6 && Math.abs(y - b.y) < 2.6) { spot = { x, y, z }; break; } if (spot) break; }
    if (!spot) { const [x, z] = b.local(M.halfBeam + 1.2, -M.len * 0.2); spot = { x, y: waterAt(x, z).y - 0.6, z, water: true }; }
    R.stage = 'out'; R.t = 0; R.to = spot; R.fromW = P.ch.root.getWorldPosition(new THREE.Vector3());
  }
  endRide(P, spot) {
    const R = this.ride; if (!R) return; const b = R.b; const ch = P.ch; ch.root.parent && ch.root.parent.remove(ch.root); this.scene.add(ch.root);
    ch.anim.standUp(); b.player = false; b.driverP = false; this.ride = null;
    if (P.boat === b) { P.boat = null; if (spot) { P.x = spot.x; P.z = spot.z; P.y = spot.y; } P.yaw = b.yaw; P.vy = 0; P.grounded = !spot || !spot.water; P.sync && P.sync(); }
    if (b.owned && b === this.slipBoat) { const s = MARINA.slip(b.len, b.model.halfBeam); if (Math.hypot(b.x - s.x, b.z - s.z) < 8) { b.mode = 'moored'; b.berth = { x: s.x, z: s.z, yaw: s.yaw }; } } // left at her own berth: tie her up
  }
  updateRide(dt, P) {
    const R = this.ride; if (!R) return; const b = R.b; const ch = P.ch;
    if (P.boat !== b || P.ch.root.parent !== b.root && R.stage !== 'out') { // the player was moved (respawn, cutscene, teleport): let go of the boat
      if (P.boat === b) P.boat = null; b.player = false; b.driverP = false; this.ride = null; return; }
    R.t += dt; const seat = R.seat;
    if (R.stage === 'in') { const k = Math.min(1, R.t / 1.1); const e = k * k * (3 - 2 * k);
      ch.root.position.set(R.from.x + (seat.x - R.from.x) * e, R.from.y + (seat.y - R.from.y) * e + Math.sin(k * Math.PI) * 0.3, R.from.z + (seat.z - R.from.z) * e); ch.root.rotation.set(0, wrap(Math.atan2(seat.x - R.from.x, seat.z - R.from.z) * (1 - e)), 0);
      ch.anim.sitIn(seat, Math.max(0.001, e)); if (k >= 1) { ch.root.position.set(seat.x, seat.y, seat.z); ch.root.rotation.set(0, 0, 0); ch.anim.sitIn(seat, 1); R.stage = 'ride'; this.g.hud.notify(boatName(b.id), `W/S throttle · A/D steer${b.sails.length ? ' · E sails' : ''} · ${this.g.hud.key ? this.g.hud.key('lights') : 'H'} lights`, 'info', 4); }
      b.update(dt, { thr: 0, steer: 0 }, this.env(b)); return; }
    if (R.stage === 'out') { const k = Math.min(1, R.t / 0.9); const to = R.to; const lp = b.root.worldToLocal(_v.set(to.x, to.y, to.z));
      const e = k * k * (3 - 2 * k); ch.root.position.set(seat.x + (lp.x - seat.x) * e, seat.y + (lp.y - seat.y) * e + Math.sin(k * Math.PI) * 0.35, seat.z + (lp.z - seat.z) * e); ch.anim.sitIn(seat, Math.max(0.001, 1 - e));
      b.update(dt, { thr: 0, steer: 0 }, this.env(b)); if (k >= 1) this.endRide(P, to); return; }
    const c = P.control && !this.g.phone?.open;
    const thr = c ? clamp((Input.isDown('forward') ? 1 : 0) - (Input.isDown('back') ? 1 : 0) + Input.pad.rt - Input.pad.lt, -1, 1) : 0;
    const steer = c ? clamp((Input.isDown('left') ? 1 : 0) - (Input.isDown('right') ? 1 : 0) - Input.pad.lx, -1, 1) : 0;
    b.update(dt, { thr, steer }, this.env(b));
    if (b.lastImpact && performance.now() - b.lastImpact.t < 60) { P.shake = Math.min(1, b.lastImpact.v / 14); b.lastImpact = null; }
    if (b.wrecked && b.sink > 0.45) { this.leave(P); R.to = { ...R.to, water: true }; } // going down: over the side
  }
  env(b) { const c = this.g.camera.position; return { E: this.g.explosions, wakes: this.wakes, blocked: (bb) => this.blocked(bb), near: Math.hypot(b.x - c.x, b.z - c.z), wind: this.wind, t: this.t }; }
  // ---------------------------------------------------------------------------------------------------- lights
  lightsFor(b, night) {
    const st = { nav: null, anchor: false, deck: false, uwl: false, beacon: null, cabin: 0 };
    const t = this.t; const flash = (ph) => (i) => { const q = (t * 1.6 + ph + i * 0.06) % 1; return q < 0.12 || (q > 0.2 && q < 0.32) ? 1 : 0.04; }; // double-flash, the two colours alternating
    if (b.mode === 'drive' && !b.wrecked) {
      if (b.role === 'police' || b.role === 'debugPolice') { st.nav = night > 0.25 ? 'motor' : null; if (night > 0.25 || (b.role === 'debugPolice' && b.lightsOn)) st.beacon = { b: flash(0), r: flash(0.5) }; st.deck = false; }
      else { const lit = night > 0.25 && !b.navOff; st.nav = lit ? (b.sails.length && b.sailsUp ? 'sail' : 'motor') : null; st.cabin = night > 0.3 ? 0.6 : 0; }
    } else if (b.mode === 'moored') {
      if (b.owned) { st.deck = night > 0.3; st.cabin = night > 0.3 ? 0.8 : 0; st.uwl = night > 0.4 && b.def.cat === 'yacht'; }
      else if (b.cabinNight && night > 0.35) { st.cabin = 0.7; st.deck = b.def.cat === 'yacht'; }
    } else if (b.mode === 'anchored') st.anchor = night > 0.25;
    return st;
  }
  // ---------------------------------------------------------------------------------------------------- frame
  update(dt, P) {
    const g = this.g, A = g.atmos; this.t += dt; const night = A ? A.night : 0; this.wind = A && A.w ? clamp(A.w.wind ?? 0.4, 0, 1) : 0.4;
    this.frustum(); this.deliverCheck();
    if (this.state().slip && !this.slipBoat) this.syncSlip();
    this.updateRide(dt, P);
    this.updateMarinaLife(dt); this.updatePatrol(dt);
    for (const O of this.owners) this.updateOwner(O, dt); if (this.owners.some((o) => o.done)) this.owners = this.owners.filter((o) => !o.done);
    const cam = g.camera.position;
    for (const b of this.all) {
      if (this.ride && this.ride.b === b) { b.setLights(this.lightsFor(b, night), night); continue; }
      if (!b.root.visible || b.away) continue; const d = Math.hypot(b.x - cam.x, b.z - cam.z);
      if (b.mode === 'drive') { const ctl = b.route ? this.pilot(b, dt) : { thr: 0, steer: 0 }; b.update(dt, ctl, this.env(b)); }
      else if (d < 420 || b.wrecked) { b.acc = (b.acc || 0) + dt; if (d < 140 || b.acc > 0.25) { b.update(b.acc, null, this.env(b)); b.acc = 0; } }
      b.setLights(this.lightsFor(b, night), night);
      for (const ch of b.crewChars || []) { const near = d < 150; ch.root.visible = near; if (near && d < 60) ch.anim.update(dt, 0, 0); }
      if (b.owner && b.owner.ch && b.owner.ch.root.parent === b.root) { const near = d < 150; b.owner.ch.root.visible = near; if (near && d < 60) b.owner.ch.anim.update(dt, 0, 0); }
    }
    this.wakes.update(dt, _lit.setRGB(0.03, 0.035, 0.05).multiplyScalar(night));
    // lamps (night): every visible boat within range + the marina's pontoon lights
    const H = g.renderer ? g.renderer.getDrawingBufferSize(_sz).y : 720; this.lamps.begin(g.camera, H, this.t);
    let deck = null, dd = 1e9, bea = null, bd = 1e9;
    if (night > 0.02) {
      for (const b of this.all) { if (!b.root.visible || b.away || b.mode === 'sunk') continue; const d = Math.hypot(b.x - cam.x, b.z - cam.z); if (d > 2500) continue; this.lamps.addBoat(b, b.lights, night);
        if (b.lights.deck && d < dd && d < 120) { const dl = b.model.lights.find((l) => l.kind === 'deck'); if (dl) { dd = d; deck = { p: b.worldPoint(dl.p, new THREE.Vector3()) }; } }
        if (b.lights.beacon && d < bd && d < 220) { const bl = b.model.lights.find((l) => l.kind === 'beaconB'); if (bl) { bd = d; const k = b.lights.beacon.b(0) > 0.5 ? 1 : b.lights.beacon.r(0) > 0.5 ? -1 : 0; bea = { p: b.worldPoint([bl.p[0], bl.p[1] + 0.2, bl.p[2]], new THREE.Vector3()), k: Math.abs(k), col: k >= 0 ? new THREE.Color(0.2, 0.35, 1) : new THREE.Color(1, 0.12, 0.08) }; } } }
      if (this.camDist(190, -1240) < 900) this.lamps.addStatic(this.marina.lamps, night);
    }
    this.lamps.end(); this.lamps.pool(deck, bea, night);
  }
  // a save was loaded / a new game started: the story state changed under us
  onLoad() {
    if (this.ride) { const P = this.g.player; if (P.boat === this.ride.b) P.boat = null; this.ride.b.player = false; this.ride.b.driverP = false; this.ride = null; }
    if (this.slipBoat) { this.remove(this.slipBoat); this.slipBoat = null; }
    for (const b of this.all.slice()) if (b.free) this.remove(b);
    this.syncSlip();
  }
  deliverCheck() { const st = this.state(); if (!st.pending.length) return; const day = this.g.atmos ? this.g.atmos.day : 1; if (st.pending.some((p) => p.slept || day > p.day)) this.deliver(); }
  // engine voices for Audio (the player's boat first, then the nearest running ones)
  voices(P) { const out = []; if (this.ride) out.push(this.ride.b); const c = this.g.camera.position;
    for (const b of this.all) { if (out.length >= 3) break; if (b === (this.ride && this.ride.b) || b.mode !== 'drive' || !b.root.visible || b.wrecked) continue; if (Math.hypot(b.x - c.x, b.z - c.z) < 140) out.push(b); } return out; }
  // bullets (combat/Weapons.trace): nearest boat hit along the ray
  rayHit(o, d, tMin, tMax) { let best = null; for (const b of this.all) { if (!b.root.visible || b.away) continue; const h = b.rayHit(o, d, tMin, best ? best.t : tMax); if (h) { h.boat = b; best = h; } } return best; }
  // debug helpers
  info() { const st = this.state(); return `${this.all.filter((b) => b.root.visible && !b.away).length} boats on the water · berth ${st.slip ? 'owned' : 'not owned'} · ${st.owned.length} owned · ${st.pending.length} on order · police ${this.police.filter((b) => b.active).length}`; }
}
export { YACHT_IDS, BOAT_IDS, JETSKI_IDS, OUTBOARD };
