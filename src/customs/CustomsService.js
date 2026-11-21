// STREET CUSTOMS — the workshop at work: entry prompt, the drive-in onto the turntable, the shop session (preview camera, the
// UI in ui/CustomsUI.js, purchases), the turntable turn and the drive-out, the two mechanics and the building's lights.
//
// Drive-in / drive-out are kinematic (Vehicle.kin replaces Vehicle.drive for those seconds): the car follows a cubic Hermite path
// from exactly where it is to the turntable centre, ending straight through the roller door. The path is checked BEFORE the prompt
// is offered — the swept body must clear the door jambs with margin, nothing static or parked may be in the way — so there is no
// teleport, no overlap and the controls come back with the car moving out of the door at walking pace.
// The game keeps running around the workshop the whole time (traffic, time of day, police): the shop is not a separate scene.
import * as THREE from 'three';
import * as L from '../world/Layout.js';
import { CG } from '../world/CustomsGeo.js';
import { profileOf, SHOP_NAME } from './CustomsCatalog.js';
import { restoreInstalled, setPreviewLights } from './CustomsApply.js';
import { Audio } from '../audio/Audio.js';
import { Input } from '../core/Input.js';
import { shutDoorLater } from '../vehicles/DoorRig.js';
import { makeMechanicAppearance } from '../actors/Appearance.js';

const H = L.CUSTOMS_HALL, S = L.CUSTOMS_SLAB;
const ease = (t) => 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, t)));
const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const dampA = (a, b, k, dt) => a + wrapA(b - a) * (1 - Math.exp(-k * dt));
export const REPAIR_PRICE = 800; // the game's existing repair price (Lanka Auto Care)
// preview camera presets: yaw relative to the car's nose (0 = looking at the front), pitch, distance factor, focus
export const VIEWS = { overall: { yaw: 0.72, pitch: 0.26, k: 1 }, front: { yaw: 0, pitch: 0.12, k: 0.95 }, rear: { yaw: Math.PI, pitch: 0.14, k: 0.95 }, side: { yaw: Math.PI / 2, pitch: 0.1, k: 0.9 },
  wheel: { yaw: 1.3, pitch: 0.06, k: 0.42, focus: 'wheel' }, top: { yaw: 0.5, pitch: 0.95, k: 1.05 }, cabin: { yaw: 1.15, pitch: 0.22, k: 0.62 } };
const CAT_VIEW = { exterior: 'overall', paint: 'overall', wheels: 'wheel', lighting: 'front', engine: 'front', turbo: 'front', transmission: 'side', suspension: 'side', brakes: 'wheel', armour: 'overall', exhaust: 'rear', extras: 'overall' };

export class CustomsService {
  constructor(game, geo) {
    this.g = game; this.geo = geo; this.site = geo.site; this.state = 'idle'; this.v = null; this.t = 0; this.promptText = null; this.lightsOn = false;
    this.tt = this.site.toWorld(H.tt[0], H.tt[1]); this.ttYaw = this.site.yawOf(0); this.ctr = this.site.toWorld(0, (H.w0 + H.w1) / 2);
    this.orbit = { yaw: 0.72, pitch: 0.26, dist: 7, tYaw: 0.72, tPitch: 0.26, tDist: 7, focus: null, idle: 0, view: 'overall' };
    this.mech = [new Mechanic(this, 0), new Mechanic(this, 1)]; this.ui = null; this.visits = 0;
    this._v = new THREE.Vector3(); this._l = new THREE.Vector3(); this.camLook = new THREE.Vector3();
  }
  get active() { return this.state !== 'idle'; }
  get uiOpen() { return this.state === 'shop'; }
  local(x, z) { return this.site.toLocal(x, z); }
  world(u, w) { return this.site.toWorld(u, w); }
  // ------------------------------------------------------------------------------------------------ per frame (Game.updatePlay)
  update(dt, { night = 0 } = {}) {
    const g = this.g, P = g.player, cam = g.camera; this.dt = dt;
    const d = Math.hypot(P.x - this.ctr[0], P.z - this.ctr[1]);
    // six ceiling lights: only near the workshop, never together with the Police HQ interior's six (same light count → the shader
    // variant the loading screen compiled), never while a room interior is open
    // …and only while the camera is inside the hall (or a car is being worked on): seen from the street the hall is walled in, so the
    // city around the workshop keeps the normal light set (cheaper fragments, no 8-light variant of every street material)
    const camIn = this.geo.insideHall(cam.position.x, cam.position.z) && cam.position.y < S + H.h; const work = this.state === 'in' || this.state === 'shop' || this.state === 'turn';
    const hq = g.interiors && g.interiors.hq; const on = !g.indoor && !(g.interiors && g.interiors.current) && !(hq && hq.g && hq.g.visible) && d < 120 && (camIn || work);
    if (on !== this.lightsOn) { this.geo.lights.visible = on; this.lightsOn = on; }
    this.geo.update(night, camIn || this.state === 'shop', dt);
    this.doorStep(dt, d);
    for (const m of this.mech) m.stream(d);
    if (this.state === 'idle') { this.promptText = d < 60 ? (P.vehicle ? this.entryCheck() : this.recoveryCheck()) : null; return; }
    this.promptText = null; this.t += dt;
    if (this.state === 'shop') { this.orbitCamera(dt); if (this.ui) this.ui.update(dt); this.workStep(dt); }
    else this.flowCamera(dt);
    // safety: anything that takes the car or the player away mid-session ends it cleanly (wrecked, arrested, script)
    const v = this.v; if (!v || v.disposed || v.wrecked || P.vehicle !== v || (g.health && g.health.busy)) this.abort();
  }
  get prompt() { return this.promptText; }
  // ---- roller door (35th request): opens by itself as a vehicle the shop can take comes up to it (or someone walks up to it on foot,
  // from either side), stays open while a car drives in / out, rolls down while the car is on the turntable; motor + slat rattle.
  doorStep(dt, d) {
    const geo = this.geo; if (!geo.setDoor) return; const P = this.g.player; let want = 0;
    if (this.state === 'in' || this.state === 'turn' || this.state === 'out') want = 1;
    else if (this.state === 'idle' && d < 60) { const v = P.vehicle; const [u, w] = this.local(v ? v.x : P.x, v ? v.z : P.z);
      if (v) { const fx = Math.sin(v.yaw), fz = Math.cos(v.yaw), s = this.site; const fw = fx * s.Wv[0] + fz * s.Wv[1];
        if (Math.abs(u) < H.door + 6 && w > H.w0 - 16 && w < H.w0 + 2 && fw > 0.3 && profileOf(v.type) && !v.wrecked && !((this.g.police && this.g.police.level) > 0)) want = 1; }
      else if (Math.abs(u) < H.door + 1.5 && Math.abs(w - H.w0) < 3.5) want = 1;
      if (this.cooldown > 0) { this.cooldown -= dt; want = 1; } } // the car that just left is still under / near the door
    const k0 = this.doorK ?? 0; const sp = want > k0 ? 0.42 : 0.3; let k = k0 + Math.sign(want - k0) * Math.min(Math.abs(want - k0), sp * dt);
    if (Math.abs(want - k) < 1e-4) k = want; this.doorK = k;
    const moving = k !== k0; if (moving && !this.doorMoving) { const [x, z] = this.world(0, H.w0); Audio.tool && Audio.tool('door', x, z); } if (!moving && this.doorMoving) { const [x, z] = this.world(0, H.w0); Audio.tool && Audio.tool('doorStop', x, z); }
    this.doorMoving = moving; const e = k * k * (3 - 2 * k); geo.setDoor(e); }
  get doorReady() { return (this.doorK ?? 0) > 0.97; }
  // ------------------------------------------------------------------------------------------------ entry
  entryCheck() {
    const g = this.g, P = g.player, v = P.vehicle; if (!v || P.entry || P.exiting || (g.director && g.director.active)) return null;
    const [u, w] = this.local(v.x, v.z); if (Math.abs(u) > L.CUSTOMS_W / 2 - 1 || w < -0.5 || w > H.tt[1] + 1) return null;
    if (!profileOf(v.type)) return `${SHOP_NAME} cannot take this vehicle`;
    if (v.wrecked) return null;
    if ((g.police && g.police.level) > 0) return `${SHOP_NAME}: lose the police first`;
    if (Math.abs(v.speed) > 3) return `Slow down to drive into ${SHOP_NAME}`;
    const path = this.planIn(v); if (!path) return `Line up with the open roller door to drive into ${SHOP_NAME}`;
    if (Input.wasPressed('interact') || (w > H.w0 - 7 && this.doorReady && Math.abs(v.speed) < 3)) { this.begin(v, path); return null; } // 35th: rolling up to the open door takes you in
    return `${g.hud.key('interact')} Enter ${SHOP_NAME}`;
  }
  // on foot at the reception door (yellow walkway): a destroyed owned vehicle is recovered for the insurance excess, all mods intact,
  // into a free customer bay on the forecourt (never on top of a car, a pedestrian or the player)
  recoveryCheck() {
    const g = this.g, P = g.player, G = g.garage; if (!G || P.vehicle || P.entry || (g.director && g.director.active) || (g.health && g.health.busy)) return null;
    const [u, w] = this.local(P.x, P.z); if (Math.abs(u - RECEPTION.u) > 1.6 || w < RECEPTION.w - 2.6 || w > RECEPTION.w + 0.4) return null;
    const r = G.lostList[0]; if (!r) return null; const price = G.recoveryPrice(r), name = G.nameOf(r.type);
    if (!Input.wasPressed('interact')) return `${g.hud.key('interact')} Recover your ${name} · Rs. ${price.toLocaleString('en-US')}`;
    const fail = (msg) => { Audio.ui('fail'); g.hud.notify(SHOP_NAME, msg, 'info', 3); return null; };
    if ((g.police && g.police.level) > 0) return fail('Lose the police first.');
    if (!G.canOwnMore()) return fail('Your garage is full — 12 registered vehicles.');
    if (g.story.state.money < price) return fail(`Not enough money — recovery costs Rs. ${price.toLocaleString('en-US')}.`);
    const bay = this.freeBay(); if (!bay) return fail('The customer bays are full — clear one first.');
    const v = G.recover(r, bay.x, bay.z, bay.yaw); if (!v) return fail('This vehicle cannot be recovered.');
    g.story.pay(-price, `${SHOP_NAME} recovery`); Audio.ui('success'); g.hud.notify(SHOP_NAME, `Your ${name} is back in the customer bays, every modification intact.`, 'info', 4); if (g.autosave) g.autosave();
    return null;
  }
  freeBay() {
    const g = this.g, s = this.site, yaw = s.yawOf(0), T = g.traffic, peds = (g.crowd && g.crowd.peds) || [];
    for (const bu of CG.bays) {
      const [x, z] = s.toWorld(bu, 5.0); const near = (o, r) => o && !o.disposed && Math.hypot(o.x - x, o.z - z) < r;
      if ([...T.vehicles, ...T.parked].some((o) => near(o, 3.4)) || near(g.player, 2.8) || peds.some((p) => near(p, 2.2))) continue;
      return { x, z, yaw };
    }
    return null;
  }
  // Hermite path (site frame) from the vehicle's pose to the turntable centre, nose into the hall; null when no safe path exists
  planIn(v) {
    const s = this.site; const [u0, w0] = this.local(v.x, v.z); const fx = Math.sin(v.yaw), fz = Math.cos(v.yaw);
    const fu = fx * s.U[0] + fz * s.U[1], fw = fx * s.Wv[0] + fz * s.Wv[1]; if (fw < Math.cos(1.22)) return null; // facing the building (≤ 70°)
    const u1 = H.tt[0], w1 = H.tt[1], D = Math.hypot(u1 - u0, w1 - w0); if (D < 0.05) return this.makePath([[u0, w0], [u1, w1]], v);
    for (const [k0, k1] of [[0.9, 1.3], [0.6, 1.7], [1.25, 1.05], [0.45, 2.1]]) {
      const pts = []; const t0u = fu * D * k0, t0w = fw * D * k0, t1u = 0, t1w = D * k1;
      for (let i = 0; i <= 56; i++) { const t = i / 56, t2 = t * t, t3 = t2 * t; const h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + t, h01 = -2 * t3 + 3 * t2, h11 = t3 - t2;
        pts.push([h00 * u0 + h10 * t0u + h01 * u1 + h11 * t1u, h00 * w0 + h10 * t0w + h01 * w1 + h11 * t1w]); }
      const p = this.makePath(pts, v); if (p) return p;
    }
    return null;
  }
  makePath(pts, v) {
    const T = v.T, hw = T.wid / 2, hl = T.len / 2, C = this.g.collision, s = this.site; const path = { pts: [], len: 0 };
    let acc = 0; for (let i = 0; i < pts.length; i++) { const [u, w] = pts[i]; if (i) acc += Math.hypot(u - pts[i - 1][0], w - pts[i - 1][1]); const j = Math.min(pts.length - 1, i + 1), k = Math.max(0, i - 1); const du = pts[j][0] - pts[k][0], dw = pts[j][1] - pts[k][1]; path.pts.push({ u, w, s: acc, a: Math.atan2(du, dw) }); }
    path.len = acc; const start = path.pts[0];
    for (let i = 0; i < path.pts.length; i++) { const p = path.pts[i]; const across = hw * Math.abs(Math.cos(p.a)) + hl * Math.abs(Math.sin(p.a)); // half extent of the body across u
      if (p.w < start.w - 0.4) return null; // never backwards
      if (Math.abs(p.a) > 1.4) return null;
      const front = p.w + hl * Math.cos(p.a), back = p.w - hl * Math.cos(p.a);
      if (front > H.w0 - 0.3 && back < H.w0 + 0.6 && Math.abs(p.u) + across > H.door - 0.3) return null; // body in the doorway: clear of both jambs
      if (back > H.w0 && Math.abs(p.u) + across > H.hu - 1.2) return null; if (front > H.w1 - 2.5) return null;
      if (Math.abs(p.u) + across > L.CUSTOMS_W / 2 - 0.5) return null;
      if (Math.abs(p.w - H.w0) > 1.4 + hl) { const [x, z] = s.toWorld(p.u, p.w); const sa = Math.sin(p.a), ca = Math.cos(p.a); // static colliders along the body axis (the lintel is above the car: skipped near the door)
        for (const o of [-hl * 0.6, 0, hl * 0.6]) { const ox = x + (s.U[0] * sa + s.Wv[0] * ca) * o, oz = z + (s.U[1] * sa + s.Wv[1] * ca) * o; if (C.blocked(ox, oz, hw * 0.85)) return null; } }
    }
    // other vehicles (parked customer cars, someone else's car on the turntable)
    for (const o of this.g.traffic.all()) { if (o === v || o.disposed || o.isTrain) continue; const [ou, ow] = this.local(o.x, o.z); if (ow < -2 || ow > H.w1 || Math.abs(ou) > L.CUSTOMS_W / 2 + 2) continue; const r = Math.max(o.half || 2, o.radius || 1) * 0.85 + Math.max(hw, hl * 0.7);
      for (let i = 0; i < path.pts.length; i += 2) { const p = path.pts[i]; if (Math.hypot(p.u - ou, p.w - ow) < r) return null; } }
    return path;
  }
  at(path, sDist) { const P = path.pts; if (sDist <= 0) return P[0]; if (sDist >= path.len) return P[P.length - 1]; let i = 1; while (i < P.length - 1 && P[i].s < sDist) i++; const a = P[i - 1], b = P[i]; const k = (sDist - a.s) / Math.max(1e-6, b.s - a.s); return { u: a.u + (b.u - a.u) * k, w: a.w + (b.w - a.w) * k, a: a.a + wrapA(b.a - a.a) * k }; }
  // ------------------------------------------------------------------------------------------------ session
  begin(v, path) {
    const g = this.g, P = g.player, cam = g.camera; this.v = v; this.path = path; this.state = 'in'; this.t = 0; this.dur = path.len / 2.3 + 1.2; this.visits++;
    P.control = false; P.camOverride = true; v.brake = false; v.kin = (dt) => this.kinStep(dt); this.v0 = Math.abs(v.speed);
    for (const d of v.mesh.userData.doors || []) if (!d.gone && !d.leaf && Math.abs(d.ang || 0) > 0.01) shutDoorLater(v, d, 0); // a door left swinging is shut as the car rolls in
    this.camSm = false; this.cam0 = cam.position.clone(); this.look0 = cam.position.clone().add(cam.getWorldDirection(new THREE.Vector3()).multiplyScalar(10)); this.camLook.copy(this.look0);
    g.hud.prompt(''); g.hud.notify(SHOP_NAME, 'Drive-in service bay · Performance · Paint · Wheels', 'info', 3); Audio.ui('notify');
    for (const m of this.mech) m.event('arrive');
  }
  // replaces Vehicle.drive while the workshop has the car (Player.updateVehicle calls v.kin)
  kinStep(dt) {
    const v = this.v; if (!v) return; const s = this.site;
    if (this.state === 'in') {
      const k = Math.min(1, this.t / this.dur); const e = ease(k); const p = this.at(this.path, e * this.path.len); const prev = this._prevS ?? 0; const sNow = e * this.path.len;
      this.pose(v, p.u, p.w, p.a, dt); v.speed = dt > 0 ? (sNow - prev) / dt : 0; this._prevS = sNow; v.steer = clamp(wrapA(p.a - (this._prevA ?? p.a)) / Math.max(1e-3, dt) * (v.T.len * 0.6) / Math.max(0.5, Math.abs(v.speed)), -v.T.steer, v.T.steer) * 0.8; this._prevA = p.a;
      if (k >= 1) { v.speed = 0; v.steer = 0; v.brake = true; this._prevS = undefined; this._prevA = undefined; this.openShop(); }
    } else if (this.state === 'shop' || this.state === 'repair') { v.speed = 0; v.steer = damp(v.steer, 0, 6, dt); this.pose(v, H.tt[0], H.tt[1], this.ttAng || 0, dt); v.rev = damp(v.rev || 0, this.revWant || 0, this.revWant ? 5 : 2.5, dt); if (this.revT > 0) { this.revT -= dt; if (this.revT <= 0) this.revWant = 0; } this.turboFx(dt); }
    else if (this.state === 'turn') { const k = Math.min(1, this.t / 3.4); this.ttAng = Math.PI * ease(k); this.geo.turntable.rotation.y = this.ttAng; this.pose(v, H.tt[0], H.tt[1], this.ttAng, dt); v.speed = 0; v.rev = damp(v.rev || 0, 0, 3, dt);
      if (k >= 1) { this.state = 'out'; this.t = 0; this.outLen = H.tt[1] - 5.2; for (const m of this.mech) m.event('wave'); } }
    else if (this.state === 'out') { const D = this.outLen, Tn = D / 2.6 + 0.8; const k = Math.min(1, this.t / Tn); const e = k * k * (2 - k); /* accelerates from rest, leaves at speed */ const w = H.tt[1] - e * D; const prev = this._prevW ?? H.tt[1];
      this.pose(v, H.tt[0], w, Math.PI, dt); v.speed = dt > 0 ? (prev - w) / dt : 0; this._prevW = w; v.brake = false; if (k >= 1) this.handBack(); }
    void s;
  }
  pose(v, u, w, a, dt) { const [x, z] = this.world(u, w); v.x = x; v.z = z; v.yaw = this.site.yawOf(a); v.y = L.groundY(x, z); v.vy = 0; v.air = false; v.lat = 0; v.sync(dt); }
  openShop() {
    const g = this.g, v = this.v; this.state = 'shop'; this.t = 0; this.ttAng = 0; this.geo.turntable.rotation.y = 0; v.lights = v.lights || g.atmos.night > 0.5; this.setView('overall', true);
    if (!this.ui) this.ui = g.makeCustomsUI(this); this.ui.show(v); Audio.ui('success'); for (const m of this.mech) m.event('inspect');
  }
  // the UI asks to leave (Esc / Leave button): undo any preview (free), turntable turn, drive out
  leave() {
    if (this.state !== 'shop') return; const v = this.v; restoreInstalled(v); setPreviewLights(v, false); this.revWant = 0; if (this.ui) this.ui.hide();
    this.work = null; this.state = 'turn'; this.t = 0; this._prevW = undefined; Audio.ui('click'); this.camTurn0 = this.g.camera.position.clone(); this.camLook0 = this.camLook.clone(); for (const m of this.mech) m.event('clear');
  }
  handBack() {
    const g = this.g, P = g.player, v = this.v, cam = g.camera; v.kin = null; this.state = 'idle'; this.t = 0; this._prevW = undefined; v.rev = 0;
    P.camOverride = false; P.control = true; P.camYaw = v.yaw + Math.PI; P.camPos.copy(cam.position); P.idleCam = 2; this.v = null; this.cooldown = 4;
    for (const m of this.mech) m.event('idle'); if (g.autosave) g.autosave();
  }
  abort() { this.work = null; const v = this.v, P = this.g.player; if (this.ui && this.ui.open) this.ui.hide(); if (v && !v.disposed) { try { restoreInstalled(v); setPreviewLights(v, false); } catch (e) { /* vehicle already released */ } v.kin = null; v.rev = 0; }
    this.state = 'idle'; this.v = null; P.camOverride = false; if (!P.cinematic) P.control = true; for (const m of this.mech) m.event('idle'); }
  // ------------------------------------------------------------------------------------------------ preview helpers (UI)
  setView(name, snap = false) { const V = VIEWS[name] || VIEWS.overall; const T = this.v.T; const base = Math.max(4.2, T.len * 0.85 + 2.6); const O = this.orbit; O.view = name; O.tYaw = V.yaw * (name === 'wheel' && this.wheelSide < 0 ? -1 : 1); O.tPitch = V.pitch; O.tDist = base * V.k; O.focus = V.focus || null; O.idle = 0;
    if (snap) { O.yaw = O.tYaw; O.pitch = O.tPitch; O.dist = O.tDist; } }
  viewFor(cat) { return CAT_VIEW[cat] || 'overall'; }
  orbitDrag(dx, dy) { const O = this.orbit; O.tYaw -= dx * 0.006; O.tPitch = clamp(O.tPitch + dy * 0.004, 0.02, 1.1); O.idle = 0; }
  orbitZoom(d) { const O = this.orbit; const T = this.v.T; O.tDist = clamp(O.tDist * (1 + d * 0.0012), Math.max(T.len, T.wid) / 2 + 1.1, 10.5); O.idle = 0; }
  rev(k = 1, sec = 1.6) { this.revWant = k; this.revT = sec; Audio.ui('hover'); }
  turboFx() { const v = this.v; if (!v || !v.tune || !v.tune.turbo) { if (v) v.boost = 0; return; } v.boost = clamp((v.rev || 0) * 1.1 - 0.1, 0, 1); v.throttle = this.revWant ? 1 : 0; }
  repair() { const g = this.g, v = this.v; if (g.story.state.money < REPAIR_PRICE) { Audio.ui('fail'); return false; } g.story.pay(-REPAIR_PRICE, `${SHOP_NAME}: repairs`); if (g.vdamage) g.vdamage.repair(v); v.damage = 0; v.health = 100; v.power = 1; Audio.ui('success'); this.startWork('repair', 'repair', 'Repairing body & mechanicals'); return true; }
  // ---- fitting work (35th request: the mechanics actually do the job). A purchase starts a job: the lead mechanic walks to the right
  // spot and works there (wheel hub with the impact wrench, leaning into the engine bay, under the rear for the exhaust, polishing /
  // spraying along the body), the second takes the other wheels or hands tools; the card shows the job's progress, which only runs
  // while the mechanic is actually on the job (with a fallback so it never hangs).
  startWork(cat, slot, label) {
    const kind = cat === 'wheels' || cat === 'brakes' || cat === 'suspension' || slot === 'tyres' || slot === 'rims' || slot === 'susp' || slot === 'lift' ? 'wheel'
      : cat === 'engine' || cat === 'turbo' || cat === 'transmission' || slot === 'horn' || slot === 'head' ? 'engine'
        : cat === 'exhaust' || slot === 'rearBumper' || slot === 'tail' || slot === 'mudflaps' ? 'rear'
          : cat === 'paint' || slot === 'livery' || slot === 'decal' || slot === 'tint' || slot === 'finish' ? 'paint' : 'body';
    const dur = { wheel: 6.5, engine: 7, rear: 6, paint: 6, body: 5.5 }[kind];
    this.work = { kind, cat, slot, label, t: 0, wait: 0, dur, on: false, side: this.wheelSide || 1 }; for (const m of this.mech) m.event('work');
  }
  get workLabel() { return this.work ? this.work.label : null; }
  get workK() { return this.work ? Math.min(1, this.work.t / this.work.dur) : 0; }
  workStep(dt) { const W = this.work; if (!W) return; W.wait += dt; if ((W.on && (W.kind !== 'wheel' || W.on2 || W.wait > 6)) || W.wait > 9) W.t += dt; // wheel jobs: both fitters at their wheels before the clock runs (bounded, never stalls)
    if (this.ui && this.ui.open) this.ui.workTick(); if (W.t >= W.dur) { this.work = null; for (const m of this.mech) m.event('done'); if (this.ui && this.ui.open) this.ui.workTick(true); } }
  needsRepair(v = this.v) { return !!v && (!!v.vd || v.damage > 0.02 || v.health < 99 || (v.power ?? 1) < 0.99 || !!v.headOut || !!v.tailOut || (v.mesh.userData.doors || []).some((d) => d.gone)); } // VehicleDamage.repair() clears v.vd
  // ------------------------------------------------------------------------------------------------ cameras
  focusPoint(out) { const v = this.v, T = v.T, s = this.site; const [x, z] = this.world(H.tt[0], H.tt[1]); out.set(x, S + Math.max(0.55, (T.hgt || 1.5) * 0.45), z);
    if (this.orbit.focus === 'wheel') { const side = this.wheelSide || 1; const fx = Math.sin(v.yaw), fz = Math.cos(v.yaw); const lx = Math.cos(v.yaw), lz = -Math.sin(v.yaw); out.x += fx * T.len * 0.3 + lx * side * T.wid * 0.5; out.z += fz * T.len * 0.3 + lz * side * T.wid * 0.5; out.y = S + (T.wheelR || 0.32); }
    void s; return out; }
  camPose(yawRel, pitch, dist, out, look) {
    const v = this.v; this.focusPoint(look); const a = v.yaw + yawRel; out.set(look.x + Math.sin(a) * Math.cos(pitch) * dist, look.y + Math.sin(pitch) * dist, look.z + Math.cos(a) * Math.cos(pitch) * dist);
    // stay inside the hall: walls, ceiling, floor
    const [u, w] = this.local(out.x, out.z); const cu = clamp(u, -H.hu + 0.9, H.hu - 0.9), cw = clamp(w, H.w0 + 0.8, H.w1 - 0.8); if (cu !== u || cw !== w) { const [x, z] = this.world(cu, cw); out.x = x; out.z = z; }
    out.y = clamp(out.y, S + 0.45, S + H.h - 1.0); return out;
  }
  orbitCamera(dt) {
    const O = this.orbit, cam = this.g.camera; O.idle += dt; if (O.idle > 8 && O.view === 'overall') O.tYaw += dt * 0.12; // slow showroom turn when left alone
    O.yaw = dampA(O.yaw, O.tYaw, 5, dt); O.pitch = damp(O.pitch, O.tPitch, 5, dt); O.dist = damp(O.dist, O.tDist, 5, dt);
    this.camPose(O.yaw, O.pitch, O.dist, this._v, this._l); cam.position.lerp(this._v, 1 - Math.exp(-dt * 9)); this.camLook.lerp(this._l, 1 - Math.exp(-dt * 9)); cam.lookAt(this.camLook); cam.updateMatrixWorld();
  }
  flowCamera(dt) {
    const cam = this.g.camera, v = this.v; if (!v) return;
    if (this.state === 'in') { // cinematic drive-in (35th request): a low shot on the forecourt watches the car roll up under the rising
      // door; once the car is through, the camera follows it in through the doorway and settles on the turntable view. Blends from the
      // gameplay camera at the start (no cut), every stage eased, the pass through the door is a straight line through the opening.
      const [cu, cw] = this.local(v.x, v.z), hl = v.T.len / 2; const bend = Math.sign(cu || 1) || 1;
      const [ax, az] = this.world(-bend * 4.6, H.w0 - 5.2); const A = this._v.set(ax, S + 0.85, az); // A: low on the forecourt, off to one side
      const [ix, iz] = this.world(-3.4, H.w0 + 3.6); const I = this._l2 || (this._l2 = new THREE.Vector3()); I.set(ix, S + 2.2, iz); // I: inside, behind the car, high
      const [dx, dz] = this.world(-0.8, H.w0 - 1.2); const Dp = this._l3 || (this._l3 = new THREE.Vector3()); Dp.set(dx, S + 1.9, dz); // D: in the doorway line (outside)
      const blend = ease(Math.min(1, this.t / 1.6)); const inside = clamp((cw - hl - H.w0 + 0.6) / 4.0, 0, 1); // 0 until the rear clears the door line
      let pos = A; if (inside > 0) { const q = ease(inside); pos = this._p1 || (this._p1 = new THREE.Vector3()); if (q < 0.5) pos.lerpVectors(A, Dp, q * 2); else pos.lerpVectors(Dp, I, (q - 0.5) * 2); }
      const tgt = this._t1 || (this._t1 = new THREE.Vector3()); tgt.lerpVectors(this.cam0, pos, blend);
      if (this.camSm) cam.position.lerp(tgt, 1 - Math.exp(-dt * 5)); else cam.position.copy(tgt); this.camSm = true;
      this._lk = this._lk || new THREE.Vector3(); this._lk.set(v.x, v.y + 0.8, v.z); this.camLook.lerpVectors(this.look0, this._lk, blend); cam.lookAt(this.camLook); cam.updateMatrixWorld(); return; }
    if (this.state === 'turn') { const k = ease(Math.min(1, this.t / 2.2)); const [x, z] = this.world(5.5, H.w0 + 2.6); this._v.set(x, S + 2.1, z); this._l.set(v.x, v.y + 0.7, v.z); cam.position.lerpVectors(this.camTurn0, this._v, k); this.camLook.lerpVectors(this.camLook0, this._l, k); cam.lookAt(this.camLook); cam.updateMatrixWorld(); return; }
    if (this.state === 'out') { const [x, z] = this.world(6.5, 3.2); this._v.set(x, S + 1.9, z); cam.position.lerp(this._v, 1 - Math.exp(-dt * 2)); this.camLook.lerp(this._l.set(v.x, v.y + 0.8, v.z), 1 - Math.exp(-dt * 6)); cam.lookAt(this.camLook); cam.updateMatrixWorld(); }
  }
}

// ------------------------------------------------------------------------------------------------ mechanics
// Two Street Customs mechanics (navy coveralls, orange shop patch). Crowd pedestrians with a job (like the filling-station
// attendants): the crowd walks, poses and animates them; this decides where they go and what they do. Lead: guides the car in,
// inspects it, works at the diagnostics cart, waves it off. Second: tyre changer / bench, comes to the wheels when they change.
// They keep off the turntable while it turns and out of the drive path.
const RECEPTION = { u: 14.7, w: H.w0 }; // the reception glass door at the end of the yellow walkway (CustomsGeo)
const STANDBY = [-6.4, H.tt[1] + 1.4]; // tyre fitter's stand-by spot beside the turntable during a shop visit (clear of the cameras' sight lines by the shot rule below)
const POSTS = [{ u: CG.cart.u - 0.9, w: CG.cart.w - 0.2, act: 'type', face: [CG.cart.u, CG.cart.w] }, { u: CG.changer.u + 0.9, w: CG.changer.w - 0.9, act: 'interact', face: [CG.changer.u, CG.changer.w] }];
class Mechanic {
  constructor(svc, i) { this.svc = svc; this.i = i; this.p = null; this.mode = 'idle'; this.t = 0; this.target = null; this.act = null; this.face = null; this.spawnN = 0; this.job = { step: (p, dt) => this.step(dt), post: () => {}, interrupt: () => { this.interrupted = true; }, resume: () => { this.interrupted = false; this.go(this.mode); } }; }
  stream(d) { const crowd = this.svc.g.crowd; if (!crowd) return; if (d < 160 && !this.p) this.spawn(); else if (d > 220 && this.p) this.despawn(); if (this.p && this.p.dead) { this.p.job = null; this.p.keep = false; this.p = null; } }
  spawn() {
    const svc = this.svc, crowd = svc.g.crowd, po = POSTS[this.i]; const [x, z] = svc.world(po.u, po.w); const seed = 9001 + this.i * 7717 + this.spawnN++ * 131;
    const sp = makeMechanicAppearance(seed); const node = nearestPedNode(x, z); const p = crowd.makePed(sp, x, z, node);
    Object.assign(p, { x, z, yaw: 0, state: 'job', job: this.job, keep: true, umbrella: false, jog: false, pace: 1.2, target: null, edge: null, mechanic: true }); crowd.place(p); this.p = p; this.go('idle');
  }
  despawn() { const p = this.p; if (!p) return; p.job = null; p.keep = false; if (!p.dead) this.svc.g.crowd.remove(p); this.p = null; }
  // shop events → what to do
  event(e) { if (!this.p) return; if (e === 'arrive') this.go(this.i === 0 ? 'guide' : 'idle'); else if (e === 'inspect') this.go(this.i === 0 ? 'inspect' : 'idle'); else if (e === 'clear') this.go('clear'); else if (e === 'wave') this.go(this.i === 0 ? 'wave' : 'clear'); else if (e === 'work') this.go('work'); else if (e === 'done') { this.go('idle'); if (this.i === 0) this.nod = 1.2; } else if (e === 'focus') this.go('focus'); else if (e === 'nod') { this.nod = 1.2; } else this.go('idle'); }
  go(mode) { this.mode = mode; this.t = 0; this.stage = 0; this.target = null; this.setAct(null); }
  setAct(a) { if (!this.p) return; if (a !== this.act) { this.act = a; const A = this.p.ch.anim; if (a === 'medKneel' || a === 'medLift') { A.holdL = null; A.holdR = null; A.medLean = 0.38; } else { A.medLean = undefined; A.medUp = undefined; } A.holdWL = null; A.holdWR = null; A.set(a); } } // medKneel = knelt, leaning in, hands at work (the fuel attendant's crouch); 'kneel' is the arrest pose
  // car footprint in its own frame: f = forward (sin yaw, cos yaw), l = left (cos yaw, -sin yaw); half sizes include 0.42 m clearance
  carBox() { const v = this.svc.v; if (!v || this.svc.state === 'idle' || v.disposed) return null; return { x: v.x, z: v.z, s: Math.sin(v.yaw), c: Math.cos(v.yaw), hl: v.T.len / 2 + 0.42, hw: v.T.wid / 2 + 0.42 }; }
  toCar(B, x, z) { const dx = x - B.x, dz = z - B.z; return [dx * B.s + dz * B.c, dx * B.c - dz * B.s]; }
  fromCar(B, f, l) { return [B.x + B.s * f + B.c * l, B.z + B.c * f - B.s * l]; }
  pushOut(B, P) { const ef = B.hl - Math.abs(P[0]), el = B.hw - Math.abs(P[1]); return el <= ef ? [P[0], (P[1] >= 0 ? 1 : -1) * (B.hw + 0.02)] : [(P[0] >= 0 ? 1 : -1) * (B.hl + 0.02), P[1]]; }
  crosses(B, A, C) { for (let k = 1; k < 12; k++) { const t = k / 12, f = A[0] + (C[0] - A[0]) * t, l = A[1] + (C[1] - A[1]) * t; if (Math.abs(f) < B.hl - 0.05 && Math.abs(l) < B.hw - 0.05) return true; } return false; }
  // spot beside the car on the turntable: side ±1, along = fraction of half length (+ = front)
  carSpot(side, along, off = 0.75) { const v = this.svc.v; const T = v ? v.T : { len: 4.4, wid: 1.8 }; return [H.tt[0] + side * (T.wid / 2 + off), H.tt[1] + along * T.len / 2]; }
  step(dt) {
    const p = this.p; if (!p || this.interrupted) return { desired: 0 }; this.t += dt; const svc = this.svc; let spot = null, act = null, face = null;
    const po = POSTS[this.i];
    switch (this.mode) {
      case 'idle': if (this.i === 1 && svc.state === 'shop') { spot = STANDBY; act = 'crossarms'; face = [H.tt[0], H.tt[1]]; break; } spot = [po.u, po.w]; act = po.act; face = po.face; break; // while a customer is in the shop the tyre fitter waits by the turntable, ready for wheel work (his tyre-changer post is ~18 m away)
      case 'guide': spot = [-4.2, H.tt[1] + 3.2]; act = 'beckon'; face = [0, H.w0 - 2]; break; // beside the far side of the turntable, waving the car on
      case 'inspect': { const pts = [this.carSpot(-1, 0.75, 0.9), this.carSpot(1, 0.8, 0.9), this.carSpot(1, -0.75, 0.9), [po.u, po.w]]; const k = Math.min(pts.length - 1, Math.floor(this.t / 4.5)); spot = pts[k]; act = k < 3 ? (k === 1 ? 'medKneel' : 'look') : po.act; face = k < 3 ? [H.tt[0], H.tt[1]] : po.face; break; }
      case 'work': { const r = this.workPlan(dt); if (!r) { if (!svc.work) this.go('idle'); spot = [po.u, po.w]; act = po.act; face = po.face; break; } spot = r.spot; act = r.act; face = r.face; this.hands = r.hands; break; }
      case 'focus': { const cat = svc.ui && svc.ui.catId; if (this.i === 0) { if (cat === 'wheels' || cat === 'brakes' || cat === 'suspension') { spot = this.carSpot(-(svc.wheelSide || 1), 0.55, 0.75); act = 'medKneel'; } else if (cat === 'engine' || cat === 'turbo' || cat === 'exhaust') { spot = this.carSpot(-1, cat === 'exhaust' ? -1.1 : 1.1, 0.4); act = 'look'; } else { spot = [po.u, po.w]; act = po.act; } face = act === 'medKneel' || act === 'look' ? [H.tt[0], H.tt[1]] : po.face; } else if (svc.state === 'shop') { spot = STANDBY; act = 'crossarms'; face = [H.tt[0], H.tt[1]]; } else { spot = [po.u, po.w]; act = po.act; face = po.face; } break; }
      case 'clear': spot = this.i === 0 ? [-6.2, H.tt[1] - 1] : [po.u, po.w]; act = this.i === 0 ? 'crossarms' : po.act; face = [0, H.tt[1]]; break; // outside the turntable radius while it turns
      case 'wave': spot = [-5.6, H.w0 + 1.6]; act = this.t < 3.5 ? 'wave' : 'crossarms'; face = [0, H.w0 - 3]; if (this.t > 7) this.go('idle'); break;
    }
    if (this.nod > 0) { this.nod -= dt; act = 'nod'; }
    // route: around the car on the turntable instead of through it
    let [tu, tw] = spot; const v = svc.v;
    if (svc.state === 'shop' && svc.g.camera && this.mode !== 'work') { // never stand in the shot: a spot on the camera → car sight line slides sideways out of it
      const [cu, cw] = svc.local(svc.g.camera.position.x, svc.g.camera.position.z); const ou = H.tt[0], ow = H.tt[1]; const su = ou - cu, sw = ow - cw, L2 = su * su + sw * sw;
      if (L2 > 1) { const t = ((tu - cu) * su + (tw - cw) * sw) / L2; if (t > 0 && t < 0.92) { const qu = cu + su * t, qw = cw + sw * t, L = Math.sqrt(L2); const nu = -sw / L, nw = su / L; const off = (tu - qu) * nu + (tw - qw) * nw; const need = 1.5 + 0.9 * t;
        if (Math.abs(off) < need) { const sg = off >= 0 ? 1 : -1; tu = qu + nu * need * sg; tw = qw + nw * need * sg; } } }
      tu = Math.max(-H.hu + 0.8, Math.min(H.hu - 0.8, tu)); tw = Math.max(H.w0 + 0.8, Math.min(H.w1 - 0.8, tw)); }
    let [x, z] = svc.world(tu, tw); const B = this.carBox();
    if (B) { // the car's real footprint (+ clearance): never stand in it, never walk through it
      const P = this.toCar(B, p.x, p.z); if (Math.abs(P[0]) < B.hl && Math.abs(P[1]) < B.hw) { const o = this.pushOut(B, P); [p.x, p.z] = this.fromCar(B, o[0], o[1]); if (p.ch) p.ch.root.position.set(p.x, p.ch.root.position.y, p.z); }
      let T = this.toCar(B, x, z); if (Math.abs(T[0]) < B.hl && Math.abs(T[1]) < B.hw) { T = this.pushOut(B, T); [x, z] = this.fromCar(B, T[0], T[1]); }
      const Pc = this.toCar(B, p.x, p.z); if (this.crosses(B, Pc, T)) { let best = null, bd = 1e9; for (const sf of [-1, 1]) for (const sl of [-1, 1]) { const c = [sf * (B.hl + 0.25), sl * (B.hw + 0.25)]; if (this.crosses(B, Pc, c) || Math.hypot(c[0] - Pc[0], c[1] - Pc[1]) < 0.3) continue; const dd = Math.hypot(c[0] - Pc[0], c[1] - Pc[1]) + Math.hypot(T[0] - c[0], T[1] - c[1]) + (this.crosses(B, c, T) ? 3 : 0); /* skip the corner we are standing on (stopped there for good before); prefer one with a clear run to the spot */ if (dd < bd) { bd = dd; best = c; } }
        if (best) [x, z] = this.fromCar(B, best[0], best[1]); } }
    const d = Math.hypot(x - p.x, z - p.z);
    if (d > 0.18) { this.setAct(null); p.faceYaw = null; return { desired: Math.min(this.mode === 'work' && d > 2.5 ? 2.6 : 1.25, 0.3 + d * 1.1), tx: x, tz: z, avoid: true, accel: 3 }; } // called to a job: a brisk jog over the longer distances
    if (face) { const [fx, fz] = svc.world(face[0], face[1]); p.faceYaw = Math.atan2(fx - p.x, fz - p.z); }
    this.setAct(act); if (this.mode === 'work' && svc.work) { if (this.i === 0) svc.work.on = true; else svc.work.on2 = true; this.applyHands(dt); } return { desired: 0, tx: null, tz: null, avoid: false };
  }
  // car frame helpers without clearance: f along the car (+ front), l across (+ left), y above the floor
  carPt(f, l, y, out = new THREE.Vector3()) { const v = this.svc.v; const sy = Math.sin(v.yaw), cy = Math.cos(v.yaw); return out.set(v.x + sy * f + cy * l, S + y, v.z + cy * f - sy * l); }
  // where to stand, what pose, and the two hand targets (functions of time) for the current job
  workPlan() {
    const svc = this.svc, W = svc.work, v = svc.v; if (!W || !v) return null; const T = v.T, hl = T.len / 2, hw = T.wid / 2, wr = T.wheelR || 0.32, hg = T.hgt || 1.45; const t = this.t;
    const loc = (f, l) => { const [x, z] = [v.x + Math.sin(v.yaw) * f + Math.cos(v.yaw) * l, v.z + Math.cos(v.yaw) * f - Math.sin(v.yaw) * l]; return svc.local(x, z); };
    const two = W.kind === 'wheel'; if (this.i === 1 && !two) return null; // the second mechanic only joins wheel work (other side)
    const side = (this.i === 0 ? 1 : -1) * (W.side || 1), front = this.i === 0 ? 1 : -1; // the lead works on the side the wheel camera shows
    if (W.kind === 'wheel') { const f = front * hl * 0.62, l = side * (hw + 0.62); const hub = [f, side * (hw - 0.02), wr]; const a = t * 5.5;
      const R = W.on || this.i ? [hub[0] + Math.cos(a) * 0.07, hub[1] + side * 0.12, hub[2] + Math.sin(a) * 0.07] : [hub[0], hub[1] + side * 0.1, hub[2]]; // impact wrench / ratchet circling the nut
      return { spot: loc(f, l), face: loc(f, side * hw * 0.3), act: 'medKneel', lean: 0.18, hands: { L: [hub[0] - 0.16 * front, hub[1] + side * 0.06, hub[2] + 0.17], R }, snd: [['wrench', 2.4], ['ratchet', 3.1]] }; }
    if (W.kind === 'engine') { const f = hl + 0.48; const sweep = Math.sin(t * 1.3) * 0.18, dip = Math.max(0, Math.sin(t * 3.1)) * 0.05;
      return { spot: loc(f, 0.15), face: loc(0, 0.15), act: 'medLift', up: 0.72, hands: { L: [hl - 0.35, 0.22, hg * 0.62], R: [hl - 0.42 - dip, -0.12 + sweep, hg * 0.6 - dip] }, snd: [['ratchet', 2.2], ['clank', 3.7]] }; }
    if (W.kind === 'rear') { const f = -(hl + 0.55), l = -0.35 * (W.side || 1); const a = t * 4.2;
      return { spot: loc(f, l), face: loc(0, l), act: 'medKneel', lean: 0.55, hands: { L: [-hl + 0.12, l + 0.25, 0.32], R: [-hl + 0.18 + Math.cos(a) * 0.05, l - 0.1, 0.26 + Math.sin(a) * 0.05] }, snd: [['wrench', 2.6], ['clank', 4.1]] }; }
    // paint / body: walk slowly along the side, spraying or polishing in circles at waist / shoulder height
    const sideB = -(W.side || 1), along = [0.45, 0, -0.45][Math.floor(t / 2.6) % 3] * hl, /* works one panel, steps to the next */ l = sideB * (hw + 0.62), a = t * (W.kind === 'paint' ? 2.2 : 4.5);
    const y0 = hg * (W.kind === 'paint' ? 0.62 : 0.5);
    return { spot: loc(along, l), face: loc(along, 0), act: 'medLift', up: 0.92, hands: W.kind === 'paint' ? { L: [along - 0.25, sideB * (hw + 0.2), y0 - 0.25], R: [along + Math.sin(a) * 0.3, sideB * (hw + 0.28), y0 + Math.cos(a) * 0.08] } : { L: [along - 0.3, sideB * (hw + 0.01), y0 - 0.05], R: [along + Math.cos(a) * 0.14, sideB * (hw + 0.01), y0 + Math.sin(a) * 0.12] }, snd: W.kind === 'paint' ? [['air', 1.4]] : [['air', 5.5], ['ratchet', 4.4]] };
  }
  applyHands(dt) { const p = this.p, A = p && p.ch && p.ch.anim; const r = this.workPlan(); if (!A || !r) return; const svc = this.svc;
    if (r.lean !== undefined) A.medLean = r.lean; if (r.up !== undefined) A.medUp = r.up;
    this.hL = this.carPt(r.hands.L[0], r.hands.L[1], r.hands.L[2], this.hL || new THREE.Vector3()); this.hR = this.carPt(r.hands.R[0], r.hands.R[1], r.hands.R[2], this.hR || new THREE.Vector3()); A.holdWL = this.hL; A.holdWR = this.hR;
    this.sndT = this.sndT || {}; for (const [k, every] of r.snd) { this.sndT[k] = (this.sndT[k] ?? every * (0.3 + this.i * 0.4)) - dt; if (this.sndT[k] <= 0) { this.sndT[k] = every * (0.8 + Math.random() * 0.4); if (Audio.tool) Audio.tool(k, p.x, p.z); } } void svc; }
}
function nearestPedNode(x, z) { let best = 0, bd = Infinity; const N = L.pedNodes || []; for (let i = 0; i < N.length; i++) { const n = N[i]; const d = (n.x - x) ** 2 + (n.z - z) ** 2; if (d < bd) { bd = d; best = i; } } return best; }
