// Official trailer — the runtime. Plays the edit in TrailerPlan.js inside the real game world: the real streets, the real
// day/night + weather system, the real traffic and pedestrians in Act I, the game's own vehicles, characters, rifles,
// tyre smoke, explosions and headlight beams. Only loaded when "WATCH TRAILER" is clicked on the entry gate (a separate
// lazily-imported chunk), and it never touches a save, a setting or the story state: when it ends (or is skipped) the
// page reloads back to the entry gate, so the game itself always starts from exactly the state it would have without it.
//
// No lights or materials are created while it plays (that would recompile every shader mid-trailer): every actor is
// built behind the loading screen, before the shader compile; muzzle flashes, fire light and the police light-bar spill
// reuse the game's existing light pools.
import * as THREE from 'three';
import { buildPlan, shotAt, blackAt, posesAt, editTimeOf, LENGTH } from './TrailerPlan.js';
import { TrailerScore } from './TrailerScore.js';
import { Vehicle, setHeadPoolNight } from '../vehicles/Vehicle.js';
import { setVehicleNight } from '../vehicles/VehicleModels.js';
import { Character, HEROES } from '../actors/Character.js';
import { makePoliceAppearance } from '../actors/Appearance.js';
import { seatCharacter } from '../actors/Seating.js';
import { gatherBodies } from '../actors/Bodies.js';
import { Firefight } from '../police/Firefight.js';
import { POLICE_T56 } from '../combat/WeaponDefs.js';
import { Audio } from '../audio/Audio.js';
import * as L from '../world/Layout.js';

const TEST = typeof location !== 'undefined' && new URLSearchParams(location.search).has('test');
const LOGO = `${import.meta.env ? import.meta.env.BASE_URL : './'}assets/brand/sds-logo.jpg`;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const sm = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const FF = Firefight.prototype;

// ---------------------------------------------------------------- entry point (Game.playTrailer)
export async function runTrailer(g) {
  const T = new TrailerRuntime(g);
  g.gpuWarned = true; // no "integrated graphics" toast over the opening shot (the game shows it when actually entering play)
  // streaming: the loading screen builds the city detail for Act I and the crew scene only; while the trailer plays, a
  // rolling window (prewarm) builds the locations of the next ~14 s of shots in the background with the world's own
  // incremental jobs, pins them, and frees the ones behind — memory stays near free play's, every cut lands on a
  // finished street. Radii are a little tighter than free play's; the page reloads afterwards, so the game keeps its own.
  const w = g.world; T.radii = [w.detailRadius, w.windowRadius]; w.detailRadius = 210; w.windowRadius = 110;
  await g.enterLoading(T.points, [{ label: 'Casting the trailer', run: (pr) => T.build(pr) }]);
  return T.start();
}

export class TrailerRuntime {
  constructor(g) {
    this.g = g; this.plan = buildPlan(); this.e = 0; this.shot = null; this.sceneId = null; this.fired = new Set(); this.lastSim = -1; this.done = false;
    this.shake = 0; this.fireAcc = {}; this.cues = []; this.prevD = {}; this.proxies = []; this._v = new THREE.Vector3(); this._d = new THREE.Vector3();
    // where the world must be fully streamed: every shot, and the whole getaway route (those chunks are pinned: chunk.keep)
    // per shot: where its camera starts / ends / looks
    this.shotPts = this.plan.shots.map((s) => { const S = this.plan.scenes[s.scene], out = []; for (const u of [0, 0.5, 1]) { const t = s.t0 + s.simLen * u, c = s.cam(t, posesAt(S, t), u); out.push([c.p[0], c.p[2]], [(c.p[0] + c.l[0]) / 2, (c.p[2] + c.l[2]) / 2]); } if (s.focus) out.push(s.focus); return out; });
    // the first shot's location first (the loading screen's shader compile looks from points[0])
    this.points = this.needPts(0, 46.5).map((p) => [Math.round(p[0]), Math.round(p[1])]);
  }
  needPts(e0, e1) { const pts = []; this.plan.shots.forEach((s, i) => { if (s.start < e1 && s.start + s.dur > e0) pts.push(...this.shotPts[i]); }); const ded = []; for (const p of pts) if (!ded.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < 60)) ded.push(p); return ded; }
  // rolling streaming window (see runTrailer): pin + pre-build the next shots' chunks, free the ones no longer needed
  prewarm(e, f) {
    const w = this.g.world; if ((this.pwT = (this.pwT || 0) - 1) > 0) return; this.pwT = 10;
    // build ahead for the next 16 s of shots; keep (never free) whatever the next 32 s still need
    const pts = this.needPts(Math.max(0, e - 0.5), e + 16).concat([[f.x, f.z]]), later = this.needPts(e + 16, e + 32), R = w.detailRadius, WR = w.windowRadius; let freed = 0;
    for (const c of w.chunks) {
      let dmin = 1e9; for (const [x, z] of pts) dmin = Math.min(dmin, Math.hypot(c.cx - x, c.cz - z) - 140);
      const near = dmin < R; c.keep = near || later.some(([x, z]) => Math.hypot(c.cx - x, c.cz - z) - 140 < R);
      if (c.keep && !near) continue;
      if (near) { if (!c.detail && !w.job) w.startDetailJob(c); if (!c.win && !w.wjob && dmin < WR) w.wjob = w.newJob(c, 'win'); }
      else if (freed < 2 && Math.hypot(c.cx - f.x, c.cz - f.z) - 140 > R + 40 && (c.detail || c.win) && (!w.job || w.job.c !== c) && (!w.wjob || w.wjob.c !== c)) { if (c.detail) w.disposeDetail(c); if (c.win) w.disposeWindows(c); freed++; }
    }
  }
  // ---------------------------------------------------------------- cast & vehicles (behind the loading screen, before the shader compile)
  async build(pr = () => {}) {
    const g = this.g, P = this.plan, scene = g.scene;
    const tick = () => new Promise((r) => setTimeout(r, 0));
    const actor = (spec) => { const ch = new Character(spec); scene.add(ch.root); return { ch, mode: 'foot', x: 0, y: 0, z: 0, yaw: 0, sees: true, cineAim: false, _draw: false, _tp: { x: 0, y: 1, z: 0 } }; };
    this.actors = {};
    for (const id of ['dineth', 'shashika', 'david']) { this.actors[id] = actor(HEROES[id]); pr(0.1 + 0.1 * Object.keys(this.actors).length); await tick(); }
    for (const [k, seed] of [['off1', 41], ['off2', 42], ['off3', 43]]) { this.actors[k] = actor(makePoliceAppearance(7700 + seed, 'patrol', { sex: 'm' })); await tick(); }
    pr(0.5);
    for (const k of ['shashika', 'david', 'off1', 'off2', 'off3']) { const o = this.actors[k]; FF.arm.call(null, o); o.ff = { g: { camera: g.camera }, armed: () => !!o._draw, targetPoint: () => o._tp }; o.rifle.userData.flash.visible = true; /* compiled with the scene, hidden again at start */ }
    // vehicles: one per scene rig (scene key + rig id); seated police / bus drivers stay put for the whole trailer
    this.vehicles = new Map();
    for (const [sid, S] of Object.entries(P.scenes)) for (const [id, r] of Object.entries(S.rigs)) {
      const v = new Vehicle(r.type, r.seed, scene); v.keep = true; v.trailer = true; const p0 = r.pose(0); v.place(p0.x, p0.z, p0.yaw); v.lights = true; v.sync(0); // headlight decal created now (compiled)
      if (r.driver === 'officer') { const ch = new Character(makePoliceAppearance(7100 + this.vehicles.size * 7, 'patrol', { sex: 'm' })); seatCharacter(ch, v, v.driverSeat()); ch.mesh.castShadow = false; v.driverChar = ch; }
      else if (r.driver === 'civ') g.traffic.addDriver(v);
      this.vehicles.set(sid + '.' + id, { v, r, sid, id }); await tick();
    }
    pr(0.85);
    // compile primers for the shared effect materials used by the gunfight (tracer, spark sprite)
    const W = g.weapons; this.primers = [];
    if (W && W.tracerGeo) { const t = new THREE.Mesh(W.tracerGeo, W.tracerMat); t.position.set(-400, 1, -560); const s = new THREE.Sprite(W.sparkMat); s.position.set(-400, 1, -560); s.scale.setScalar(0.01); scene.add(t); scene.add(s); this.primers.push(t, s); }
    pr(1);
  }
  // ---------------------------------------------------------------- start
  start() {
    const g = this.g, P = g.player;
    for (const m of this.primers) m.parent?.remove(m);
    for (const k of ['shashika', 'david', 'off1', 'off2', 'off3']) this.actors[k].rifle.userData.flash.visible = false;
    g.mode = 'trailer'; g.paused = false; g.director.active = false; g.hud.show(false); g.hud.bars(false); g.hud.clearSubtitle?.();
    P.cinematic = true; P.control = false; if (P.ch) { P.ch.root.visible = false; P.ch.noBody = true; } P.x = 1e5; P.z = 1e5; // the player is not part of the trailer
    this.orig = { traffic: g.traffic.max, crowd: g.crowd.max, fov: g.camera.fov };
    this.buildOverlay();
    Audio.setMusic('none');
    this.score = new TrailerScore(); this.score.build({ blast: editTimeOf(this.plan, 'C', this.plan.tE) ?? 78.17 });
    this.useAudio = !TEST && this.score.ok && Audio.ctx.state === 'running';
    this.t0 = this.score.ok ? Audio.ctx.currentTime + 0.3 : 0; this.score.start(this.t0); this.e = this.useAudio ? -0.3 : 0;
    this.cueSheet();
    // skip: Esc / Enter / Space / click (not the click that started it)
    const t0 = performance.now();
    this.onKey = (e) => { if (['Escape', 'Enter', 'Space', 'NumpadEnter'].includes(e.code)) { e.preventDefault(); this.skip(); } };
    this.onClick = () => { if (performance.now() - t0 > 1200) this.skip(); };
    this.onMove = () => { this.hintT = performance.now(); };
    addEventListener('keydown', this.onKey, true); addEventListener('mousedown', this.onClick, true); addEventListener('mousemove', this.onMove);
    this.hintT = performance.now();
    g.hud.fade(0, 0.01); g.last = performance.now();
    g.trailerHook = (dt) => this.frame(dt);
    if (TEST) window.__trailer = this;
    return new Promise((r) => (this.resolve = r));
  }
  skip() { if (this.ending || this.done) return; this.ending = performance.now(); this.score.fadeOut(0.6); }
  finish() {
    if (this.done) return; this.done = true; this.score.stopLoops(); this.score.fadeOut(0.3);
    removeEventListener('keydown', this.onKey, true); removeEventListener('mousedown', this.onClick, true); removeEventListener('mousemove', this.onMove);
    this.ov.black.style.opacity = '1';
    if (TEST) { window.__trailerDone = true; this.g.trailerHook = () => {}; this.resolve?.(); return; }
    setTimeout(() => location.reload(), 450); // back to the entry gate: the game starts exactly as if the trailer was never played
  }
  // ---------------------------------------------------------------- per frame
  clock(dt) {
    if (this.paused) return this.e;
    if (this.useAudio) { const lat = Audio.ctx.outputLatency || Audio.ctx.baseLatency || 0; this.e = Math.max(this.e, Audio.ctx.currentTime - this.t0 - lat); }
    else this.e += dt;
    return this.e;
  }
  frame(dt) {
    const e = this.clock(dt);
    if (this.ending) { const k = (performance.now() - this.ending) / 600; this.ov.black.style.opacity = String(Math.max(blackAt(this.plan, e), sm(k))); if (k >= 1) return this.finish(); }
    if (e >= LENGTH) return this.finish();
    this.frameAt(Math.max(0, e), dt);
  }
  // test hook: jump to edit time e (steps the last `pre` seconds so smoke / fire / animation states are right), then hold
  seek(e, pre = 1.5, dt = 1 / 30) { this.paused = true; this.e = Math.max(0, e - pre); this.score.seek(e + 1e3); this.shot = null; while (this.e < e - 1e-6) { this.e = Math.min(e, this.e + dt); this.frameAt(this.e, dt); } return this.describe(); }
  frameAt(e, dt) {
    const plan = this.plan;
    // the shot on screen; during a full black the next shot is set up early (scene switch + traffic settle hidden)
    let shot = shotAt(plan, e); const bk = blackAt(plan, e);
    if (bk > 0.999) { const i = plan.shots.indexOf(shot), nx = plan.shots[i + 1]; if (nx && nx.start - e < 2.6 && nx.start > e) shot = nx; }
    const newShot = shot !== this.shot;
    if (newShot) { if (shot.scene !== this.sceneId) this.activateScene(shot.scene, shot); this.shot = shot; this.snap = true; }
    const S = this.S, le = e - shot.start, u = clamp(le / shot.dur, 0, 1); this.eNow = e;
    const simT = shot.simAt(le), rate = shot.rateAt(le);
    let simDt = !newShot && simT >= this.lastSim ? simT - this.lastSim : dt * rate; simDt = clamp(simDt, 0, 0.1);
    if (newShot && simT > this.lastSim + 0.5) this.skipEvents(simT - 0.3); // a forward jump in sim time: no burst of stale gunshots
    this.lastSim = simT; this.simT = simT; this.rate = rate;
    const P = posesAt(S, simT); this.P = P;
    this.applyVehicles(P, simT, simDt);
    this.applyPeds(P, simT, simDt, e);
    this.events(P, simT);
    this.camera(shot, P, simT, u, e, dt);
    this.systems(dt, simDt, shot, P, u);
    this.audioFx(P, simT, rate, simDt);
    this.overlay(e, bk);
    for (const c of this.cues) if (!c.done && e >= c.e) { c.done = true; if (e - c.e < 0.3) c.fn(); }
    this.score.update(e);
    this.snap = false;
  }
  // ---------------------------------------------------------------- scenes
  activateScene(id, shot) {
    const g = this.g, S = this.plan.scenes[id]; this.sceneId = id; this.S = S; this.fired = new Set(); this.lastSim = -1; this.fireAcc = {}; this.prevD = {};
    for (const o of this.vehicles.values()) { const on = o.sid === id; if (on && !o.v.mesh.parent) g.scene.add(o.v.mesh); else if (!on && o.v.mesh.parent) o.v.mesh.parent.remove(o.v.mesh); }
    const used = new Set(Object.values(S.peds).map((r) => (r.who === 'officer' ? null : r.who)).filter(Boolean)); for (const k of Object.keys(S.peds)) if (this.actors[k]) used.add(k);
    for (const [k, o] of Object.entries(this.actors)) { const on = used.has(k); if (!on) { o.ch.root.parent?.remove(o.ch.root); o.parentV = null; } else if (!o.ch.root.parent) g.scene.add(o.ch.root); }
    // light & weather of the scene
    const A = g.atmos, env = S.env; A.hour = env.hour; A.forceWeather(env.weather); A.setWeather(env.weather, true); A.wet = env.wet;
    // traffic: the action scenes run on closed streets (no AI traffic, nothing parked on the driving lines)
    const T = g.traffic; for (const v of T.vehicles) T.remove(v); T.vehicles.length = 0;
    T.max = S.traffic ? this.orig.traffic : 0;
    const R = this.reservedRects(id); T.reserved = R.length ? (p) => R.some((r) => p.x > r[0] && p.x < r[1] && p.z > r[2] && p.z < r[3]) : null;
    T.parkedTimer = 0; // re-evaluate the parked cars now (reserved spots are cleared)
    const f = this.focusOf(shot, posesAt(S, shot.t0));
    // let the street life settle around the new camera before the black lifts
    const cam = g.camera, c = shot.cam(shot.t0, posesAt(S, shot.t0), 0); cam.position.set(c.p[0], c.p[1], c.p[2]); cam.lookAt(c.l[0], c.l[1], c.l[2]); cam.updateMatrixWorld();
    const camDir = cam.getWorldDirection(new THREE.Vector3());
    const band = S.clearRoad ? [S.clearRoad[0][0], S.clearRoad[0][1], S.clearRoad[1][0], S.clearRoad[1][1]] : null;
    for (let i = 0; i < (S.traffic ? 36 : 2); i++) { T.update(0.1, f, camDir, g.clock, g.crowd.peds, g.ghost); if (band) this.clearRect(band, true); g.crowd.update(0.1, f, camDir, { simTime: g.clock, vehicles: T.all(), rain: A.w.rain, night: A.night, player: g.ghost, hourFactor: g.hourFactor(), hour: A.hour, police: null }); }
    this.cleanPeds(true);
  }
  reservedRects(id) {
    if (id === 'C') return [[-414, -386, -720, 62], [-414, -230, 36, 51]];
    if (id === 'B') return [[-366, -338, 40, 56], [-348, -332, 80, 115], [-398, -383, 203, 228], [-412, -390, 128, 162]];
    return [];
  }
  focusOf(shot, P) {
    if (shot.focus) return { x: shot.focus[0], z: shot.focus[1] };
    if (shot.focusRig && P[shot.focusRig]) return { x: P[shot.focusRig].x, z: P[shot.focusRig].z };
    const sf = this.plan.scenes[shot.scene].focus; if (sf) return { x: sf[0], z: sf[1] }; // where the street life is (not a point out at sea)
    const c = shot.cam(shot.t0, P, 0); const dx = c.l[0] - c.p[0], dz = c.l[2] - c.p[2], d = Math.hypot(dx, dz) || 1, k = Math.min(d / 2, 150) / d;
    return { x: c.p[0] + dx * k, z: c.p[2] + dz * k };
  }
  veh(id) { return this.vehicles.get(this.sceneId + '.' + id); }
  // ---------------------------------------------------------------- vehicles
  applyVehicles(P, t, dt) {
    for (const [id] of Object.entries(this.S.rigs)) {
      const o = this.veh(id), v = o.v, p = P[id];
      v.mesh.visible = p.vis !== false; if (!v.mesh.visible) continue;
      const psp = v.speed;
      v.x = p.x; v.z = p.z; v.yaw = p.yaw; v.speed = p.speed; v.y = L.groundY(p.x, p.z) + (p.y || 0);
      v.steer = this.snap ? p.steer : v.steer + (p.steer - v.steer) * Math.min(1, dt * 10);
      const acc = dt > 1e-4 && !this.snap ? (p.speed - psp) / dt : 0; o.acc = (o.acc ?? 0) + (clamp(acc, -14, 10) - (o.acc ?? 0)) * Math.min(1, dt * 6);
      const hdgRate = dt > 1e-4 && !this.snap ? wrap(p.hdg - (o.hdg ?? p.hdg)) / dt : 0; o.hdg = p.hdg;
      if (p.pitch === undefined) { v.pitch = clamp(-o.acc * 0.0032, -0.04, 0.045); v.roll = clamp(p.speed * hdgRate * 0.0045, -0.07, 0.07); } else { v.pitch = p.pitch; v.roll = p.roll; }
      v.lights = !!p.lights; v.brake = o.acc < -2.5 && p.speed > 0.5; if (o.r.type === 'police' || o.r.type === 'policejeep') v.beacons(!!p.beacons, t);
      const slipK = p.speed > 3 ? clamp((Math.abs(p.slip || 0) - 0.12) / 0.3, 0, 1) : 0; // drifting: rears pour smoke, fronts scrub a little
      if (p.smokeR > 0 || slipK > 0) { v.tireSmoke = { r: Math.max((p.smokeR || 0) * 1.5, slipK * 2.0), f: slipK * 0.9, launch: 0 }; /* >1 = denser, bigger, longer-lived puffs (a trailer-only request; the game's own driving never asks for more than 1) */ v.wheelRot += (p.smokeR || 0) * dt * 55; }
      v.sync(dt);
      const ch = v.driverChar; if (ch && ch !== this.actors.dineth.ch) { const A = ch.anim; A.steer = v.steer / (v.T.steer || 0.5); A.vehSpeed = v.speed; A.brakeLean = clamp(-o.acc * 0.012, -0.06, 0.08); A.cornerLean = clamp(-A.steer * v.speed * 0.004, -0.06, 0.06); A.update(Math.max(dt, 1e-4), 0); }
    }
  }
  // ---------------------------------------------------------------- people
  applyPeds(P, t, dt, e) {
    const g = this.g;
    for (const [key, r] of Object.entries(this.S.peds)) {
      const o = this.actors[r.who === 'officer' ? key : r.who] || this.actors[key]; if (!o) continue; const p = P[key], ch = o.ch, A = ch.anim;
      if (!p.vis) { ch.root.visible = false; continue; } ch.root.visible = true;
      if (p.seat) {
        const vo = this.veh(p.seat), v = vo.v; if (o.parentV !== v) { seatCharacter(ch, v, v.driverSeat()); o.parentV = v; v.driverChar = ch; o.mode = 'seated'; }
        A.steer = v.steer / (v.T.steer || 0.5); A.vehSpeed = v.speed; A.brakeLean = clamp(-(vo.acc || 0) * 0.012, -0.06, 0.08); A.cornerLean = clamp(-A.steer * v.speed * 0.004, -0.06, 0.06);
        if (o.rifle) o.rifle.visible = false; A.update(Math.max(dt, 1e-4), 0); continue;
      }
      if (o.parentV || ch.root.parent !== g.scene) { if (o.parentV && o.parentV.driverChar === ch) o.parentV.driverChar = null; ch.root.parent?.remove(ch.root); A.standUp(); g.scene.add(ch.root); o.parentV = null; o.mode = 'foot'; this.snapPed = true; }
      const y = g.collision.groundAt(p.x, p.z, 0.4); const yawRate = this.snap || dt < 1e-4 ? 0 : wrap(p.yaw - o.yaw) / dt;
      o.x = p.x; o.z = p.z; o.y = y; o.yaw = p.yaw; ch.root.position.set(p.x, y, p.z); ch.root.rotation.set(0, p.yaw, 0); ch.yaw = p.yaw;
      if ((p.act || null) !== (A.action || null) && !(p.act == null && A.action === 'talk')) A.set(p.act || null);
      // rifle: hidden / slung / low ready / aimed at the target (the police rifle-handling rig, Firefight.pose)
      if (o.rifle) {
        if (!p.rifle) { o.rifle.visible = false; A.ik = null; A.aim = null; }
        else {
          o.rifle.visible = true; o._draw = !p.rifle.sling; o.cineAim = !p.rifle.sling && p.rifle.aim > 0.5; o.mode = 'foot';
          const tg = p.rifle.target && P[p.rifle.target]; if (tg) { o._tp.x = tg.cx ?? tg.x; o._tp.y = L.groundY(tg.x, tg.z) + (tg.cy ?? 0.9); o._tp.z = tg.cz ?? tg.z; } else { o._tp.x = p.x + Math.sin(p.yaw) * 10; o._tp.y = 1.2; o._tp.z = p.z + Math.cos(p.yaw) * 10; }
          if (this.snap || this.snapPed) { o.rp.draw = o._draw ? 1 : 0; o.rp.aim = o.cineAim ? 1 : 0; }
          FF.pose.call(o.ff, o, Math.max(dt, 1e-4));
        }
      }
      // talking: lips move on the speaker's VO lines
      if (ch.face) { const vo = this.plan.texts.find((x) => x.kind === 'vo' && e >= x.a && e <= x.b && x.who && x.who.toLowerCase().startsWith(r.who)); ch.face.talking = !!vo; }
      A.update(Math.max(dt, 1e-4), p.speed, yawRate);
    }
    this.snapPed = false;
  }
  // ---------------------------------------------------------------- gunfire, blasts, fires
  skipEvents(upTo) { const S = this.S; S.events.forEach((ev, i) => { if (ev.t < upTo) this.fired.add('e' + i); }); this.shotsOf(S).forEach((s, i) => { if (s.t < upTo) this.fired.add('s' + i); }); }
  shotsOf(S) { if (!S._shots) { S._shots = []; for (const f of S.fire) for (let t = f.a; t < f.b; t += 1 / f.rof) S._shots.push({ t, who: f.who, target: f.target }); S._shots.sort((a, b) => a.t - b.t); } return S._shots; }
  events(P, t) {
    const S = this.S;
    this.shotsOf(S).forEach((s, i) => { const k = 's' + i; if (this.fired.has(k) || s.t > t) return; this.fired.add(k); if (t - s.t < 0.25) this.fireShot(s, P); });
    S.events.forEach((ev, i) => { const k = 'e' + i; if (this.fired.has(k) || ev.t > t) return; this.fired.add(k); if (t - ev.t < 0.3 && ev.kind === 'blast') this.blast(ev, P); });
    // burning wrecks: flames + a smoke column for as long as the scene runs (sim time, so slow motion slows the fire too)
    for (const ev of S.events) if (ev.burn && t >= ev.t) this.burn(ev.burn, P[ev.burn], t - ev.t);
  }
  fireShot(s, P) {
    const g = this.g, o = this.actors[s.who]; if (!o || !o.rifle || !o.rifle.visible || !o.ch.root.visible) return; const W = g.weapons;
    const mz = FF.muzzle.call(null, o, new THREE.Vector3()); const tg = P[s.target]; if (!tg) return;
    const gy = L.groundY(tg.x, tg.z); const aim = new THREE.Vector3(tg.cx ?? tg.x, gy + (tg.cy ?? 0.85), tg.cz ?? tg.z);
    const spread = s.target === 'hero' ? 1.6 : 0.45; aim.x += (Math.random() - 0.5) * spread; aim.y += (Math.random() - 0.3) * spread * 0.5; aim.z += (Math.random() - 0.5) * spread;
    const dir = aim.clone().sub(mz).normalize(); const far = aim.clone().addScaledVector(dir, s.target === 'hero' && Math.random() < 0.6 ? 25 : 0); // misses fly on past a moving car
    const ud = o.rifle.userData; if (ud.flash) { ud.flash.visible = true; ud.flash.rotation.z = Math.random() * 3; ud.flash.scale.setScalar(0.85 + Math.random() * 0.35); o.rp.flashT = 0.05; } o.rp.kick = 1;
    if (W) { W.tracer(mz, far, POLICE_T56); if (far.distanceToSquared(aim) < 0.01) W.sparks(aim, dir); W.flashLight.position.copy(mz); W.flashLight.intensity = 6; W.flashT = 0.05; }
    const [gn, pan] = Audio.spatial ? Audio.spatial(mz.x, mz.z, 60) : [0.5, 0]; const d = this.g.camera.position.distanceTo(mz); this.score.gun(Math.max(0.12, gn), pan, this.rate, d);
    if (far.distanceToSquared(aim) < 0.01) { const [g2, p2] = Audio.spatial ? Audio.spatial(aim.x, aim.z, 30) : [0.3, 0]; this.score.ping(g2, p2); }
  }
  blast(ev, P) {
    const g = this.g, p = P[ev.at]; if (!p) return; const gy = L.groundY(p.x, p.z);
    const c = new THREE.Vector3(p.cx ?? p.x, gy + 0.7, p.cz ?? p.z); g.explosions.blast(c, { power: ev.power, noDamage: true });
    const d = g.camera.position.distanceTo(c); this.shake = Math.max(this.shake, clamp(14 / (d + 4), 0, 1.2) * ev.power);
    const k = clamp(1 - d / 34, 0, 1) * 0.75; if (k > 0.05) { Audio.concuss(k); g.post?.concuss?.(k * 0.6); }
  }
  burn(key, p, age) {
    if (!p || p.vis === false) return; const E = this.g.explosions, dt = Math.max(0, this.simDtLast || 0); const gy = L.groundY(p.x, p.z);
    const cx = p.cx ?? p.x, cy = gy + (p.cy ?? 0.95), cz = p.cz ?? p.z; const k = age < 1.2 ? 1.6 : 1; const yaw = p.yaw || 0, fx = Math.sin(yaw), fz = Math.cos(yaw);
    const A = (this.fireAcc[key] = (this.fireAcc[key] || 0) + dt * 26 * k); let n = Math.floor(A); this.fireAcc[key] = A - n; const V = this._v, Q = new THREE.Vector3();
    while (n-- > 0) { const along = (Math.random() - 0.5) * 3.4, side = (Math.random() - 0.5) * 1.4; Q.set(cx + fx * along + fz * side, cy + Math.random() * 0.5, cz + fz * along - fx * side); V.set((Math.random() - 0.5) * 0.8, 1 + Math.random() * 1.4, (Math.random() - 0.5) * 0.8);
      E.emit(E.fire, 0, Q, V, 0.55 + Math.random() * 0.6, 0.45 + Math.random() * 0.35, 1.2 + Math.random() * 0.9, 0, 2.6, 2.2, [0.75, 0.75 + Math.random() * 0.3, gy]);
      if (Math.random() < 0.3) { Q.y += 0.8; V.set((Math.random() - 0.5) * 0.6, 1.5 + Math.random() * 1.5, (Math.random() - 0.5) * 0.6); E.emit(E.smoke, 1, Q, V, 6 + Math.random() * 4, 1.0 + Math.random() * 0.6, 4.5 + Math.random() * 2.5, 1, 0.9 + Math.random() * 0.4, 1.3, [0.1 + Math.random() * 0.08, 0.25, gy]); }
      if (Math.random() < 0.05) E.sparkEmit(Q, V.set((Math.random() - 0.5) * 3, 3 + Math.random() * 4, (Math.random() - 0.5) * 3), 0.8 + Math.random() * 0.8, 0.02, gy + 0.02); }
    E.flush(E.fire); E.flush(E.smoke); E.flush(E.spark);
    (this.fires || (this.fires = [])).push({ x: cx, y: cy + 1.1, z: cz });
  }
  // ---------------------------------------------------------------- camera
  camera(shot, P, t, u, e, dt) {
    const cam = this.g.camera, c = shot.cam(t, P, u); const hand = c.hand ?? 0.3;
    // handheld drift (deterministic, edit time) + explosion shake (decays)
    const n1 = Math.sin(e * 1.13 + 0.7) * 0.6 + Math.sin(e * 2.71 + 2.1) * 0.3 + Math.sin(e * 5.3 + 1.1) * 0.1, n2 = Math.sin(e * 0.93 + 4.1) * 0.6 + Math.sin(e * 2.33 + 0.4) * 0.3 + Math.sin(e * 4.7) * 0.1, n3 = Math.sin(e * 1.61 + 2.9) * 0.7 + Math.sin(e * 3.7) * 0.3;
    this.shake = Math.max(0, this.shake - dt * 1.4); const sk = this.shake * this.shake;
    const px = c.p[0] + n1 * 0.035 * hand + (Math.random() - 0.5) * 0.3 * sk, py = c.p[1] + n2 * 0.025 * hand + (Math.random() - 0.5) * 0.25 * sk, pz = c.p[2] + n3 * 0.035 * hand + (Math.random() - 0.5) * 0.3 * sk;
    const gy = L.groundY(px, pz); cam.position.set(px, Math.max(py, gy + 0.18), pz);
    cam.up.set(0, 1, 0); cam.lookAt(c.l[0] + n2 * 0.06 * hand + (Math.random() - 0.5) * 0.5 * sk, c.l[1] + n1 * 0.04 * hand + (Math.random() - 0.5) * 0.4 * sk, c.l[2] + n3 * 0.06 * hand);
    const roll = (c.roll || 0) + n3 * 0.004 * hand + (Math.random() - 0.5) * 0.03 * sk; if (roll) cam.rotateZ(roll);
    const fov = c.fov || 45; if (Math.abs(cam.fov - fov) > 1e-3) { cam.fov = fov; cam.updateProjectionMatrix(); }
    cam.updateMatrixWorld(); this.camLook = c.l;
  }
  // ---------------------------------------------------------------- the living world around the shot
  systems(dt, simDt, shot, P, u) {
    const g = this.g, A = g.atmos, cam = g.camera, S = this.S, env = S.env; this.simDtLast = simDt;
    A.hour = env.toHour ? lerp(env.hour, env.toHour, sm(u)) : env.hour; A.wet = env.wet; if (A.forced !== env.weather) A.forceWeather(env.weather);
    const f = this.focusOf(shot, P); const fv = this._fv || (this._fv = new THREE.Vector3()); fv.set(f.x, 0, f.z);
    g.clock += dt; g.world.simTime = g.clock; this.prewarm(this.eNow, f); g.world.update(dt, f, cam, A); A.update(dt, fv, cam, dt); setVehicleNight(A.night); setHeadPoolNight(A.night);
    const camDir = cam.getWorldDirection(this._d);
    const T = g.traffic; T.night = A.night; T.weatherRain = A.w.rain; if (S.clearRoad) this.clearRect([S.clearRoad[0][0], S.clearRoad[0][1], S.clearRoad[1][0], S.clearRoad[1][1]]);
    T.update(simDt, f, camDir, g.clock, g.crowd.peds, g.ghost);
    g.trains.update(simDt, { focus: f, night: A.night, vehicles: T.all(), listener: true });
    g.crowd.update(simDt, f, camDir, { simTime: g.clock, vehicles: T.all(), rain: A.w.rain, night: A.night, player: g.ghost, hourFactor: g.hourFactor(), hour: A.hour, bodies: gatherBodies(g.scene), police: null });
    this.cleanPeds(false);
    this.fires = this.fires || []; g.explosions.update(simDt);
    // fire light: the game's single explosion light, handed to the nearest burning wreck whenever no blast flash is using it
    const E = g.explosions; if (!E.flashes.length && this.fires.length && A.night > 0.3) { let best = null, bd = 1e9; for (const q of this.fires) { const d = (q.x - cam.position.x) ** 2 + (q.z - cam.position.z) ** 2; if (d < bd) { bd = d; best = q; } } if (bd < 160 * 160) { const fl = 0.75 + 0.25 * Math.sin(g.clock * 23) * Math.sin(g.clock * 13.7) + 0.1 * Math.random(); E.light.position.set(best.x, best.y, best.z); E.light.intensity = 46 * fl; E.light.distance = 20; } }
    this.fires = [];
    if (g.vsmoke) g.vsmoke.update(simDt);
    if (g.weapons) g.weapons.fxUpdate(simDt);
    const used = this.beaconSpill(P, this.simT, A.night); this.keyLight(shot, P, A.night, used);
    // engines heard from the camera (pitched down in slow motion), plus nearby traffic
    const near = []; let i = 0;
    for (const [id] of Object.entries(S.rigs)) { const v = this.veh(id).v; if (!v.mesh.visible || v.T.rail) continue; const q = this.proxies[i] || (this.proxies[i] = { x: 0, z: 0, speed: 0, type: '' }); i++; q.x = v.x; q.z = v.z; q.speed = v.speed * clamp(this.rate, 0.35, 1); q.type = v.type; q.d = (v.x - cam.position.x) ** 2 + (v.z - cam.position.z) ** 2; near.push(q); }
    near.sort((a, b) => a.d - b.d); for (const o of T.vehicles) { if (near.length >= 6) break; if ((o.x - cam.position.x) ** 2 + (o.z - cam.position.z) ** 2 < 45 * 45) near.push(o); }
    Audio.update(dt, { listener: { x: cam.position.x, z: cam.position.z, yaw: Math.atan2(camDir.x, camDir.z) }, night: A.night, rain: A.w.rain, wind: A.w.wind, traffic: S.traffic ? T.vehicles.length : 6, vehicles: near.slice(0, 6), indoor: false });
  }
  // police light-bar spill on the road: two of the (idle) police torch spotlights, recoloured red / blue in step with the bar
  beaconSpill(P, t, night) {
    const rig = this.g.flashRig; if (!rig) return; const cam = this.g.camera.position; const list = [];
    if (night > 0.35) for (const [id] of Object.entries(this.S.rigs)) { const o = this.veh(id), v = o.v; if (!v.beaconsOn || !v.mesh.visible) continue; const d = (v.x - cam.x) ** 2 + (v.z - cam.z) ** 2; if (d < 70 * 70) list.push([d, v]); }
    list.sort((a, b) => a[0] - b[0]); let used = 0;
    rig.spots.forEach((s, i) => {
      const it = i < 2 ? list[i] : null; if (!it) { if (s.intensity && !s.isKey) s.intensity = 0; return; } used = i + 1; s.isKey = false;
      const v = it[1], ph = (t * 2.4) % 1, on = (t * 9.6) % 1 < 0.5; const blue = ph < 0.5;
      s.color.setHex(blue ? 0x2a5cff : 0xff2a22); s.intensity = on ? 34 : 2; s.angle = 1.15; s.penumbra = 1; s.distance = 17; s.decay = 1.6;
      const fx = Math.sin(v.yaw), fz = Math.cos(v.yaw); s.position.set(v.x - fx * 0.2, (v.y || 0) + 2.1, v.z - fz * 0.2); s.target.position.set(v.x + fx * 1.5, v.y || 0, v.z + fz * 1.5); s.target.updateMatrixWorld();
    });
    return used;
  }
  // night close-ups: a soft warm key from above the camera's shoulder onto the subject (motivated by the street lamps), so
  // faces read at night instead of going to silhouette. Uses the first torch spotlight the light bars are not using.
  keyLight(shot, P, night, used) {
    const rig = this.g.flashRig; if (!rig) return; const KEY = { dineth: ['dineth'], shashika: ['shashika'], david: ['david'], trio: ['dineth', 0.75], ambush: ['shashika'], 'walk away': ['dineth', 0.7] };
    for (const s of rig.spots) if (s.isKey) { s.intensity = 0; s.isKey = false; }
    const k = KEY[shot.name], s = rig.spots[used]; if (!k || !s || night < 0.35) return; const p = P[k[0]]; if (!p || !p.vis || p.seat) return;
    const cam = this.g.camera.position, gy = this.g.collision.groundAt(p.x, p.z, 0.4); let dx = cam.x - p.x, dz = cam.z - p.z; const d = Math.hypot(dx, dz) || 1; dx /= d; dz /= d;
    s.isKey = true; s.color.setHex(0xffd9b0); s.intensity = 16 * clamp((night - 0.35) / 0.3, 0, 1); s.angle = k[1] || 0.42; s.penumbra = 1; s.distance = 14; s.decay = 1.4;
    s.position.set(p.x + dx * 3.2 - dz * 1.4, gy + 3.4, p.z + dz * 3.2 + dx * 1.4); s.target.position.set(p.x, gy + 1.25, p.z); s.target.updateMatrixWorld();
  }
  // keep the crowd out of the action: nobody on the closed roads near the cars, nobody walking through a close-up
  cleanPeds(all) {
    const g = this.g, C = g.crowd, cam = g.camera.position, L2 = this.camLook; if (!C || !C.peds) return; const S = this.S; const cars = [];
    for (const [id] of Object.entries(S.rigs)) { const v = this.veh(id).v; if (v.mesh.parent && v.mesh.visible) cars.push(v); }
    for (const p of C.peds.slice()) {
      let bad = false;
      if (S.hideRoadPeds && L.roadAt(p.x, p.z)) for (const v of cars) { if ((p.x - v.x) ** 2 + (p.z - v.z) ** 2 < 45 * 45) { bad = true; break; } }
      if (!bad) for (const v of cars) { if ((p.x - v.x) ** 2 + (p.z - v.z) ** 2 < 4.5 * 4.5) { bad = true; break; } }
      if (!bad) for (const o of Object.values(this.actors)) { if (!o.ch.root.parent || o.parentV) continue; if ((p.x - o.x) ** 2 + (p.z - o.z) ** 2 < 2.2 * 2.2) { bad = true; break; } }
      if (!bad && S.noPeds) for (const [x, z, r] of S.noPeds) if ((p.x - x) ** 2 + (p.z - z) ** 2 < r * r) { bad = true; break; }
      if (!bad && L2) { const dx = L2[0] - cam.x, dz = L2[2] - cam.z, len = Math.hypot(dx, dz); if (len > 0.5 && len < 40) { const k = clamp(((p.x - cam.x) * dx + (p.z - cam.z) * dz) / (len * len), 0, 1); const qx = cam.x + dx * k - p.x, qz = cam.z + dz * k - p.z; if (qx * qx + qz * qz < 1.0 && k * len < len - 0.5) bad = true; } }
      if (bad && (all || !this.visible(p) || (S.noPeds && this.inZone(p, S.noPeds)))) C.remove(p); else if (bad && Math.hypot(p.x - cam.x, p.z - cam.z) < 12) C.remove(p);
    }
  }
  inZone(p, Z) { return Z.some(([x, z, r]) => (p.x - x) ** 2 + (p.z - z) ** 2 < r * r); }
  visible(p) { const cam = this.g.camera; const v = this._v.set(p.x, (p.y || 0) + 1, p.z).project(cam); return v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1; }
  clearRect(r, all = false) { const T = this.g.traffic, cam = this.g.camera.position; for (let i = T.vehicles.length - 1; i >= 0; i--) { const v = T.vehicles[i]; if (!(v.x > r[0] && v.x < r[1] && v.z > r[2] && v.z < r[3])) continue; const d = Math.hypot(v.x - cam.x, v.z - cam.z); if (all || !this.visible(v) || d > 90 || d < 14) { T.remove(v); T.vehicles.splice(i, 1); } } }
  // ---------------------------------------------------------------- live sound: screeching tyres, sirens with Doppler, whooshes on the big cuts
  audioFx(P, t, rate, dt) {
    const cam = this.g.camera.position; let scr = 0, scrPan = 0;
    for (const [id] of Object.entries(this.S.rigs)) {
      const o = this.veh(id), v = o.v, p = P[id]; if (!v.mesh.visible) { if (o.r.type === 'police') this.score.siren(id, false, 0, 0, 1, t, rate); continue; }
      const [gn, pan] = Audio.spatial ? Audio.spatial(v.x, v.z, 30) : [0.5, 0];
      const slipRate = Math.abs(p.slip || 0) > 0.1 && p.speed > 3 ? clamp((Math.abs(p.slip) - 0.1) / 0.35, 0, 1) : 0; const brake = o.acc < -7 && p.speed > 4 ? 0.6 : 0; const burn = p.smokeR || 0;
      const k = Math.max(slipRate, brake, burn) * gn; if (k > scr) { scr = k; scrPan = pan; }
      if (o.r.type === 'police') { const d = Math.hypot(v.x - cam.x, v.z - cam.z); const pd = this.prevD[id] ?? d; const vr = dt > 1e-4 ? clamp((d - pd) / dt, -60, 60) : 0; this.prevD[id] = d; const dop = clamp(343 / (343 + vr), 0.85, 1.18); this.score.siren(id, !!p.beacons && this.simT > 4.5, gn, pan, dop, t, rate); }
    }
    this.score.screech(scr, scrPan, rate);
  }
  cueSheet() {
    const S = this.score, c = (e, fn) => this.cues.push({ e, fn, done: false });
    c(48.55, () => S.door(0.08)); c(50.0, () => S.rev(0.28, 2.2)); c(51.1, () => S.rev(0.22, 1.4));
    for (const e of [58.0, 61.0, 65.5, 68.5, 71.5]) c(e - 0.25, () => S.whoosh(0.07, 0.55));
    c(83.0, () => S.whoosh(0.09, 0.7));
  }
  // ---------------------------------------------------------------- overlay: letterbox, fades, flashes, titles
  buildOverlay() {
    if (!document.getElementById('tr-style')) { const st = document.createElement('style'); st.id = 'tr-style'; st.textContent = CSS; document.head.appendChild(st); }
    const root = document.createElement('div'); root.className = 'tr-root'; document.body.classList.add('tr-on');
    root.innerHTML = `<div class="tr-black"></div><div class="tr-flash"></div><div class="tr-bar t"></div><div class="tr-bar b"></div><div class="tr-texts"></div><div class="tr-hint">Esc · Skip trailer</div>`;
    this.g.ui.appendChild(root);
    const q = (s) => root.querySelector(s); this.ov = { root, black: q('.tr-black'), flash: q('.tr-flash'), bars: [q('.tr-bar.t'), q('.tr-bar.b')], hint: q('.tr-hint'), texts: [] };
    const box = q('.tr-texts');
    for (const t of this.plan.texts) {
      const d = document.createElement('div'); d.className = 'tr-t tr-' + t.kind; d.style.opacity = '0';
      if (t.kind === 'card') d.innerHTML = `<span>${t.text}</span>`;
      else if (t.kind === 'name') d.innerHTML = `<div class="nm">${t.text}</div><div class="ln"></div><div class="sb">${t.sub}</div>`;
      else if (t.kind === 'vo') d.innerHTML = (t.who ? `<b>${t.who}</b>` : '') + `<span>${t.text}</span>`;
      else if (t.kind === 'title') d.innerHTML = '<div class="tt">COLOMBO</div><div class="ts"><i></i>SHADOWS OF THE ISLAND<i></i></div>';
      else if (t.kind === 'logo') d.innerHTML = `<img alt="Shaun David Studios logo" draggable="false"><div class="lp">A SHAUN DAVID STUDIOS PRODUCTION</div><div class="lc">COLOMBO: Shadows of the Island · Captured in engine</div>`;
      if (t.kind === 'logo') d.querySelector('img').src = LOGO;
      box.appendChild(d); this.ov.texts.push({ t, d, op: -1 });
    }
    this.layoutBars(); this.onResize = () => this.layoutBars(); addEventListener('resize', this.onResize);
  }
  layoutBars() { const W = innerWidth, H = innerHeight; const h = Math.max(0, (H - W / 2.39) / 2); for (const b of this.ov.bars) b.style.height = `${Math.round(h)}px`; this.ov.root.style.setProperty('--bar', `${Math.round(h)}px`); }
  overlay(e, bk) {
    const O = this.ov; const set = (el, k, v) => { if (el['_' + k] !== v) { el['_' + k] = v; el.style[k] = v; } };
    set(O.black, 'opacity', bk.toFixed(3));
    let fl = 0; for (const f of this.plan.flashes) { const x = e - f; if (x >= 0 && x < 0.6) fl = Math.max(fl, Math.pow(1 - x / 0.6, 2.2)); }
    set(O.flash, 'opacity', fl.toFixed(3));
    set(O.hint, 'opacity', performance.now() - this.hintT < 3500 && e < 100 ? '0.55' : '0');
    for (const X of O.texts) {
      const t = X.t; let a = 0; if (e >= t.a - 0.05 && e <= t.b + 0.5) { const fi = t.kind === 'card' ? 0.08 : t.kind === 'vo' ? 0.2 : 0.45, fo = t.kind === 'card' ? 0.12 : 0.4; a = Math.min(sm((e - t.a) / fi), 1 - sm((e - t.b) / fo)); }
      const op = a.toFixed(3); if (op !== X.op) { X.op = op; X.d.style.opacity = op; X.d.style.visibility = a > 0.001 ? 'visible' : 'hidden'; }
      if (a <= 0.001) continue; const k = clamp((e - t.a) / (t.b - t.a), 0, 1);
      if (t.kind === 'card') X.d.style.letterSpacing = `${(0.62 - 0.12 * k).toFixed(3)}em`;
      else if (t.kind === 'name') { X.d.style.transform = `translate3d(${(-14 * (1 - sm(k * 4))).toFixed(1)}px,0,0)`; X.d.querySelector('.ln').style.transform = `scaleX(${sm(k * 3).toFixed(3)})`; }
      else if (t.kind === 'title') X.d.style.transform = `scale(${(1.07 - 0.07 * sm(k)).toFixed(4)})`;
      else if (t.kind === 'logo') X.d.style.transform = `scale(${(1.03 - 0.03 * sm(k)).toFixed(4)})`;
    }
  }
  describe() { const s = this.shot; return { e: +this.e.toFixed(3), shot: s && s.name, scene: this.sceneId, sim: +(this.simT || 0).toFixed(3), cam: this.g.camera.position.toArray().map((x) => +x.toFixed(2)) }; }
}

const CSS = `
body.tr-on, body.tr-on * { cursor: none !important; }
.tr-root { position: absolute; inset: 0; z-index: 60; pointer-events: none; overflow: hidden; --bar: 0px; }
.tr-black { position: absolute; inset: 0; background: #000; opacity: 1; }
.tr-flash { position: absolute; inset: 0; background: radial-gradient(ellipse at center, #fffaf0 0%, #fff3dc 55%, #f2dcb4 100%); opacity: 0; mix-blend-mode: screen; }
.tr-bar { position: absolute; left: 0; right: 0; background: #000; } .tr-bar.t { top: 0; } .tr-bar.b { bottom: 0; }
.tr-texts { position: absolute; inset: 0; }
.tr-t { position: absolute; visibility: hidden; will-change: opacity, transform; }
.tr-card { inset: 0; display: grid; place-items: center; font: 700 clamp(34px, 6.2vw, 96px) 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: .6em; color: #f4efe6; text-shadow: 0 0 40px rgba(232,163,58,.25); }
.tr-card span { padding-left: .6em; }
.tr-name { left: 7vw; bottom: calc(var(--bar) + 9vh); color: #f4efe6; }
.tr-name .nm { font: 700 clamp(46px, 8.4vw, 132px) 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: .12em; line-height: .9; text-shadow: 0 6px 34px rgba(0,0,0,.6); }
.tr-name .ln { height: 2px; width: min(30vw, 420px); margin: .7em 0 .55em; background: linear-gradient(90deg, #e8a33a, rgba(232,163,58,0)); transform-origin: left; transform: scaleX(0); }
.tr-name .sb { font: 600 clamp(14px, 1.55vw, 24px) 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: .55em; color: #ffcf7a; }
.tr-vo { left: 0; right: 0; bottom: max(3.2vh, calc(var(--bar) * .5 - 1.1em)); text-align: center; font: italic 500 clamp(15px, 1.6vw, 25px) 'Manrope', system-ui, sans-serif; color: #f4efe6; text-shadow: 0 2px 10px rgba(0,0,0,.9); }
.tr-vo b { display: block; font: 600 clamp(10px, .9vw, 14px) 'Barlow Condensed', sans-serif; font-style: normal; letter-spacing: .4em; color: #e8a33a; margin-bottom: .45em; text-transform: uppercase; }
.tr-title { inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; }
.tr-title .tt { font: 700 clamp(64px, 14vw, 220px) 'Cormorant Garamond', Georgia, serif; letter-spacing: .14em; padding-left: .14em; line-height: .9; background: linear-gradient(180deg, #fff9ee 0%, #e9d3ab 46%, #9a7444 54%, #f1d9a6 100%); -webkit-background-clip: text; background-clip: text; color: transparent; filter: drop-shadow(0 8px 36px rgba(0,0,0,.75)); }
.tr-title .ts { display: flex; align-items: center; gap: 1.1em; margin-top: .6em; font: 600 clamp(14px, 2vw, 30px) 'Barlow Condensed', sans-serif; letter-spacing: .58em; padding-left: .58em; color: #e8a33a; text-shadow: 0 2px 16px rgba(0,0,0,.8); }
.tr-title .ts i { display: block; width: clamp(30px, 8vw, 120px); height: 1px; background: linear-gradient(90deg, transparent, #e8a33a); } .tr-title .ts i:last-child { transform: scaleX(-1); }
.tr-logo { inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; }
.tr-logo img { width: min(26vw, 30vh); height: auto; display: block; }
.tr-logo .lp { margin-top: 3.2vh; font: 600 clamp(13px, 1.4vw, 21px) 'Barlow Condensed', sans-serif; letter-spacing: .5em; padding-left: .5em; color: #f4efe6; }
.tr-logo .lc { margin-top: 1.4vh; font: 500 clamp(10px, .9vw, 13px) 'Manrope', sans-serif; letter-spacing: .3em; color: rgba(244,239,230,.5); text-transform: uppercase; }
.tr-hint { position: absolute; right: 3vw; bottom: calc(var(--bar) * .5 - .6em); font: 600 12px 'Barlow Condensed', sans-serif; letter-spacing: .3em; text-transform: uppercase; color: #f4efe6; opacity: 0; transition: opacity .6s ease; }
`;
