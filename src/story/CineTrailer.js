// OFFICIAL CINEMATIC TRAILER (the second trailer) — the runtime. It is the original trailer's engine (TrailerRuntime: the
// game's own world, traffic, crowd, vehicles, characters, weather and post-processing, driven by an analytic, seekable
// edit) playing the 2:26 edit of CinePlan.js with the score of CineScore.js, plus what this edit needs on top:
//   · the Air Wing helicopter (the game's own PoliceHelicopter: model, rotor, cone, nav lights, strobes, searchlight beam,
//     downwash on trees / grass / people / dust, rotor sound) flown on the edit's paths instead of by its autopilot;
//   · the robbery in the real "Ratnapura Gems & Gold" walk-in store (WalkIn.js + RobberyShops.js): its interior, its push
//     door and its keeper, who puts his hands up; the store's alarm bell;
//   · the train (the game's own Trains.js train, on the real line) placed on its run for the railway shot;
//   · a cinematic lens (LensFX.js): depth of field on the subject and a film shutter's camera motion blur;
//   · playback controls: pause, a scrubbable timeline, full screen, exit — the game is blocked while it plays.
// Nothing here touches saves, settings or the story; when it ends (or Exit), the page reloads to the entry gate.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TrailerRuntime } from './Trailer.js';
import { buildPlan, shotAt, blackAt, posesAt, editTimeOf, pathAt, LENGTH, ACTS } from './CinePlan.js';
import { CineScore } from './CineScore.js';
import { addLens } from '../gfx/LensFX.js';
import { HELIPAD } from '../police/Helicopter.js';
import { Audio } from '../audio/Audio.js';
import * as L from '../world/Layout.js';

const TEST = typeof location !== 'undefined' && new URLSearchParams(location.search).has('test');
const BASE = import.meta.env ? import.meta.env.BASE_URL : './';
const LOGO = `${BASE}assets/brand/sds-logo.jpg`;
const VOICE = `${BASE}assets/voice/t2/`; // the recorded dialogue (49th)
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const sm = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const fmt = (s) => { s = Math.max(0, Math.floor(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
// value of a key list [[t, v], …] at t: linear between keys (numbers) or the last key reached (anything else)
const keyAt = (keys, t) => { if (!keys || !keys.length) return null; if (t <= keys[0][0]) return keys[0][1]; for (let i = 1; i < keys.length; i++) { const [t1, v1] = keys[i]; if (t < t1) { const [t0, v0] = keys[i - 1]; return typeof v0 === 'number' && typeof v1 === 'number' ? lerp(v0, v1, sm((t - t0) / (t1 - t0))) : v0; } } return keys[keys.length - 1][1]; };

// value of a key list of vectors [[t, [x, y, z]], …] at t: eased between keys, held outside
// keyed prop / grip paths: monotone cubic (see CinePlan.pathAt), so a lift flows through its keys instead of stopping at each
const vecAt = pathAt;
const ramp = (t, a, b) => sm((t - a) / (b - a));
const wrapPi = (a) => Math.atan2(Math.sin(a), Math.cos(a));
// the case the keeper hands over (49th): a hard briefcase — one merged mesh, one material (built behind the loading screen).
// Origin = the handle, where the palm closes; the body hangs below it; latches on both faces (symmetric under a half turn,
// so either hand can hold it from its own side of the counter); long side (and the handle) along local x.
function makeCase() {
  const parts = []; const box = (w, h, d, x, y, z, hex) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); const c = new THREE.Color(hex); const n = g.attributes.position.count, col = new Float32Array(n * 3); for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; } g.setAttribute('color', new THREE.BufferAttribute(col, 3)); parts.push(g); };
  box(0.42, 0.32, 0.11, 0, -0.195, 0, 0x1b1c1f); // shell (bottom at −0.355: it stands on the floor / counter top when the handle is 0.355 above it)
  box(0.426, 0.014, 0.116, 0, -0.07, 0, 0x55585e); box(0.426, 0.014, 0.116, 0, -0.33, 0, 0x55585e); // aluminium rims
  box(0.13, 0.02, 0.024, 0, 0, 0, 0x111214); for (const x of [-0.058, 0.058]) box(0.016, 0.034, 0.02, x, -0.02, 0, 0x2a2b2e); // handle + posts
  for (const x of [-0.13, 0.13]) for (const z of [-0.058, 0.058]) box(0.034, 0.022, 0.007, x, -0.075, z, 0xc9a54a); // brass latches
  const geo = mergeGeometries(parts); for (const g of parts) g.dispose();
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.2 })); m.castShadow = true; m.receiveShadow = true; m.name = 'cine-case'; m.frustumCulled = true; return m;
}

// ---------------------------------------------------------------- entry point (Game.playTrailer(2))
export async function runCineTrailer(g) {
  const T = new CineTrailer(g);
  g.gpuWarned = true;
  const w = g.world; T.radii = [w.detailRadius, w.windowRadius]; w.detailRadius = 210; w.windowRadius = 110;
  await g.enterLoading(T.points, [{ label: 'Preparing the cinematic trailer', run: (pr) => T.build(pr) }]);
  return T.start();
}

export class CineTrailer extends TrailerRuntime {
  constructor(g) {
    super(g, buildPlan(), { shotAt, blackAt, posesAt });
    this.LEN = LENGTH; this.heliParked = false; this.alarm = null; this.vy = 0; this.prevHeliY = null;
  }
  // everybody the edit uses (heroes by name, officers by key + seed) and who carries a rifle
  cast() {
    if (this._cast) return this._cast; const heroes = new Set(), officers = new Map(), armed = new Set();
    for (const S of Object.values(this.plan.scenes)) for (const [k, r] of Object.entries(S.peds)) {
      if (r.who === 'officer') officers.set(k, [r.seed || 40, r.role || null, r.look || null]); else heroes.add(r.who);
      if (r.segs.some((q) => q.rifle)) armed.add(r.who === 'officer' ? k : r.who);
    }
    this._cast = { heroes: [...heroes], officers: [...officers.entries()].map(([k, v]) => [k, ...v]), armed: [...armed] }; return this._cast;
  }
  makeScore() { const s = new CineScore(); if (s.ok) { s.build(); s.setVoices(this.plan.voices || [], this.voiceBufs || {}, this.plan.sighs || []); } return s; }
  // behind the loading screen: the cast and the cars (TrailerRuntime.build), then the walk-in stores and the jewellery
  // store's interior + keeper (built now so the loading screen's shader compile covers them)
  async build(pr = () => {}) {
    await super.build((k) => pr(k * 0.9));
    const I = this.g.interiors; try { I.setupWalkIns(); const s = I.walkIn.siteById('rob_jewel'); if (s) { if (!s.room) I.walkIn.buildRoom(s); this.rob = s; s.room.og.visible = true; s.doorObj.setAngle(0); } } catch (e) { console.warn('cinematic trailer: store', e); }
    // Police HQ interior (the OIC's office scene): the game's own room model. Its six ceiling lights stay off for the whole
    // trailer — the office is lit by the walk-in shops' shared light pool, so the scene's light count is always a pre-compiled
    // set (no shader recompile at the cut); shown now so the shader compile covers it
    try { const hq = I.hq || (I.hq = I.build('hq')); this.hq = hq; for (const l of hq.lights || []) l.visible = false; hq.g.visible = true; } catch (e) { console.warn('cinematic trailer: HQ', e); this.hq = null; }
    this.caseMesh = makeCase(); this.g.scene.add(this.caseMesh); this._cg = [0, 0, 0]; this._v1 = new THREE.Vector3(); this._kR = { S: 'R', p: new THREE.Vector3(), q: new THREE.Quaternion(), pole: new THREE.Vector3(), w: 0, knee: 0, maxLean: 0.95, pose: 'grip' }; this._dR = { S: 'R', p: new THREE.Vector3(), q: new THREE.Quaternion(), w: 0, maxLean: 0.35, pose: 'grip' }; this._yq = new THREE.Quaternion(); this._up = new THREE.Vector3(0, 1, 0);
    pr(0.95); await this.loadVoices();
    pr(1);
  }
  async loadVoices() {
    this.voiceBufs = {}; const c = Audio.ctx; if (!c || !this.plan.voices) return;
    await Promise.all(this.plan.voices.map(async (v) => { try { const r = await fetch(VOICE + v.file + '.mp3'); if (!r.ok) throw new Error(r.status); this.voiceBufs[v.file] = await c.decodeAudioData(await r.arrayBuffer()); } catch (e) { console.warn('cinematic trailer: voice', v.file, e); } }));
  }
  start() {
    const p = super.start();
    if (this.hq) this.hq.g.visible = false; if (this.caseMesh) this.caseMesh.visible = false;
    try { this.lens = addLens(this.g.post, this.g.camera); } catch (e) { console.warn('cinematic trailer: lens', e); this.lens = null; }
    if (this.rob) { this.rob.room.og.visible = false; }
    this.buildControls();
    if (TEST) window.__cine = this;
    return p;
  }
  // ---------------------------------------------------------------- input: Space pause · ←/→ seek · F full screen · Esc exit
  bindInput() {
    this.onKey = (e) => {
      if (e.code === 'Escape') { e.preventDefault(); e.stopPropagation(); if (document.fullscreenElement) { /* the browser leaves full screen itself */ return; } this.skip(); return; }
      if (e.code === 'Space' || e.code === 'KeyK') { e.preventDefault(); e.stopPropagation(); this.togglePause(); return; }
      if (e.code === 'ArrowLeft' || e.code === 'KeyJ') { e.preventDefault(); e.stopPropagation(); this.jump(this.e - 5); return; }
      if (e.code === 'ArrowRight' || e.code === 'KeyL') { e.preventDefault(); e.stopPropagation(); this.jump(this.e + 5); return; }
      if (e.code === 'KeyF') { e.preventDefault(); e.stopPropagation(); this.toggleFull(); return; }
      e.stopPropagation(); // the game never sees a key while the trailer plays
    };
    this.onClick = (e) => { if (!e.target.closest || !e.target.closest('.ct-ctl')) { e.stopPropagation(); this.showControls(); } };
    this.onMove = () => this.showControls();
    addEventListener('keydown', this.onKey, true); addEventListener('mousedown', this.onClick, true); addEventListener('mousemove', this.onMove); addEventListener('touchstart', this.onMove, { passive: true });
  }
  unbindInput() { removeEventListener('keydown', this.onKey, true); removeEventListener('mousedown', this.onClick, true); removeEventListener('mousemove', this.onMove); removeEventListener('touchstart', this.onMove); }
  togglePause(force) {
    const want = force ?? !this.paused; if (want === !!this.paused || this.ending || this.done) return; this.paused = want;
    const c = Audio.ctx; if (this.useAudio && c) { if (want) c.suspend?.(); else c.resume?.(); }
    if (!want) this.g.last = performance.now();
    this.ctl && this.ctl.root.classList.toggle('paused', want); this.showControls();
  }
  toggleFull() { const d = document; if (d.fullscreenElement) d.exitFullscreen?.(); else (d.documentElement.requestFullscreen?.({ navigationUI: 'hide' }) || Promise.resolve()).catch(() => {}); }
  // jump to edit time e: the last second is simulated (motion, smoke, animation states settle), the music re-anchored
  jump(e) {
    if (this.ending || this.done) return; e = clamp(e, 0, this.LEN - 0.4); const wasPaused = this.paused; this.paused = true; const S = this.score;
    S.hold = true; this.shot = null; this.sceneId = null; /* re-enter the scene: traffic, crowd and event state rebuilt for the new time */ let t = Math.max(0, e - 1.0); while (t < e - 1e-6) { t = Math.min(e, t + 1 / 30); this.e = t; this.frameAt(t, 1 / 30); }
    this.e = e; S.hold = false;
    if (S.ok) { const now = S.c.currentTime + 0.05; S.rebase(now - e); S.seek(e); this.t0 = now - e; S.endDone = false; }
    for (const c of this.cues) c.done = c.e < e;
    this.paused = wasPaused; this.g.last = performance.now(); this.showControls();
  }
  clock(dt) {
    if (this.paused) return this.e;
    if (this.useAudio) { const lat = Audio.ctx.outputLatency || Audio.ctx.baseLatency || 0; this.e = Math.max(this.e, Audio.ctx.currentTime - this.t0 - lat); }
    else this.e += dt;
    return this.e;
  }
  frame(dt) { super.frame(dt); if (!this.done) { this.updateControls(); if (this.score.endFade) this.score.endFade(this.e); } }
  finish() { if (this.done) return; if (this.g.atmos) this.g.atmos.shadowCaster = null; if (Audio.ctx && Audio.ctx.state === 'suspended') Audio.ctx.resume?.(); this.stopAlarm(); if (document.fullscreenElement && !TEST) document.exitFullscreen?.().catch?.(() => {}); super.finish(); }
  // ---------------------------------------------------------------- scenes
  activateScene(id, shot) {
    super.activateScene(id, shot);
    const S = this.S, wi = this.g.interiors && this.g.interiors.walkIn;
    if (this.rob && wi) { const on = !!S.rob; this.rob.room.og.visible = on; wi.setActive(on ? this.rob.room : null); if (!on) this.rob.doorObj.setAngle(0); this.keeperAct = undefined; }
    this.stopAlarm(); this.prevHeliY = null; this.vy = 0;
    if (!S.heli) this.parkHeli();
    if (this.caseMesh) this.caseMesh.visible = !!(S.rob && S.rob.case);
    // the OIC's office: the HQ room model on, its own staff hidden (the scene's officers are cast), the shared light pool on
    if (this.hq) { const on = !!S.hq; this.hq.g.visible = on; for (const n of this.hq.npcs) n.ch.root.visible = !on; for (const l of this.hq.lights || []) l.visible = false;
      if (on && wi) { wi.poolOn = true; const LT = [[-24.0, 7.72, -201.6, 0xfff1dc, 9, 8.5], [-24.2, 7.72, -199.0, 0xfff1dc, 5, 6], [-24.8, 7.72, -196.6, 0xfff4e4, 7, 7.5]];
        wi.pool.forEach((l, i) => { const d = LT[i]; l.visible = true; if (!d) { l.intensity = 0; l.position.set(-24, -800, -200); return; } l.position.set(d[0], d[1], d[2]); l.color.setHex(d[3]); l.intensity = d[4]; l.distance = d[5]; l.decay = 1.5; }); } }
  }
  sceneHook(P, simT, simDt, e, dt, newShot) {
    const S = this.S;
    if (S.rob && this.rob) this.robbery(S.rob, simT, simDt);
    if (S.hq && this.hq && this.hq.oic) { const k = keyAt(S.hq.door, simT) || 0; this.hq.oic.k = k; this.hq.oic.hinge.rotation.y = -k * Math.PI * 0.5; } // the OIC's door, flung open
    if (S.heli) this.flyHeli(P, simT, simDt, newShot);
  }
  systemsHook(dt, simDt, shot, P) {
    const S = this.S, g = this.g;
    // the train: on its run through the shot (the game's own train on the real line, placed by the edit)
    if (S.train && g.trains && g.trains.trains[0]) { const tr = g.trains.trains[0], q = S.train; tr.dir = q.dir; tr.speed = q.v; tr.state = 'run'; if (!tr.nextStop) tr.nextStop = tr.findNextStop(); tr.sLow = q.s0 + q.dir * q.v * this.simT; tr.place(); tr.group.visible = true; if (tr._cineDir !== tr.dir) { tr._cineDir = tr.dir; tr.updateLamps(); } }
    // the lens: focus on the shot's subject (dof.on: a rig, an actor, the helicopter, the store keeper), shutter per shot
    if (this.lens) {
      let focus = 12, k = 0; const d = shot.dof, cam = g.camera.position;
      if (d) { const q = P[d.on]; if (q && q.vis !== false) { const base = q.seat ? 0.9 : L.groundY(q.x, q.z); const y = d.on === 'heli' ? q.y + 1.2 : q.cy != null ? base + q.cy : S.peds[d.on] ? base + 1.5 : base + 0.9; focus = Math.hypot(q.x - cam.x, y - cam.y, q.z - cam.z); k = d.k; } }
      const night = g.atmos ? g.atmos.night : 0; this.lens.setLens(focus, k, shot.blur ?? (0.32 + 0.1 * night), this.snap);
    }
  }
  // ---------------------------------------------------------------- the robbery: door, keeper, alarm
  robbery(R, t, dt) {
    const s = this.rob, room = s.room; const D = s.doorObj; const a = keyAt(R.door, t) || 0; if (Math.abs(a - D.ang) > 1e-4) D.setAngle(a);
    const kp = room.keeper, C = R.case; if (kp) { const want = keyAt(R.keeper, t); if (want !== this.keeperAct) { this.keeperAct = want; kp.anim.set(want === 'idle' ? null : want); if (want === 'handsup' || want === 'cower' || want === 'flinch') kp.face && kp.face.set && kp.face.set('fear', 30); }
      if (C) { // the keeper turns for the case, crouches, lifts it over the counter and slides it across (one hand on the handle)
        const yW = keyAt(C.keeperYaw, t); const yaw0 = kp.root.rotation.y; kp.root.rotation.y = yW - (room.og ? room.og.rotation.y : 0); const yr = dt > 1e-4 ? wrapPi(kp.root.rotation.y - yaw0) / dt : 0;
        const w = keyAt(C.keeperW, t) || 0; if (w > 0.001) { const K = this._kR; vecAt(C.keeperGrip, t, this._cg); this.robPoint(this._cg, K.p); K.p.y += 0.07; K.w = w; K.knee = keyAt(C.keeperKnee, t) || 0; this.handQ(kp, 0, K.q); const u = ramp(this._cg[1], 0.85, 1.2); K.pole.set(lerp(-0.45, -0.8, u), lerp(-1, 0.2, u), lerp(-0.15, -0.8, u)); /* elbow out and back, level with the hand as it rises (not up by his face) */ kp.anim.reach = K; } else kp.anim.reach = null;
        kp.anim.update(Math.max(dt, 1e-4), 0, clamp(yr, -6, 6)); this.placeCase(C, t, kp);
      } else kp.anim.update(Math.max(dt, 1e-4), 0, 0); }
    // the alarm bell: from the moment he trips it; inside the store first, then the bell box over the street
    const al = R.alarm ? R.alarm.filter((x) => t >= x[0]).pop() : null; if (al) this.ringAlarm(al[1], al[2]); else this.stopAlarm();
  }
  // room frame [lx, h, lz] (h above the store floor) → world
  robPoint(q, out) { const s = this.rob, w = this.plan.robWorld(q[0], q[2]); return out.set(w[0], s.y0 + q[1], w[1]); }
  // the case: keyed (floor → counter top → slid across) while nobody holds it; in a hand it rides with the palm (eased in and
  // out of each grip, so no hand / prop pop); hidden once David is in the car
  placeCase(C, t, kp) {
    const M = this.caseMesh; if (!M) return; const D = this.actors.david;
    const dv = D && D.ch.root.visible && D.ch.root.parent; if (!dv && t > C.davidHold) { M.visible = false; return; } M.visible = true;
    const key = t < 16.9 ? [[0, C.rest]] : t < C.onCounter[0] ? C.keeperGrip : t < C.onCounter[1] ? C.slide : C.davidGrip;
    vecAt(key, t, this._cg); const pos = this.robPoint(this._cg, M.position);
    const palm = (ch, out) => { const h = ch.bones.handR; h.updateWorldMatrix(true, false); out.setFromMatrixPosition(h.matrixWorld); out.y -= 0.075; return out; };
    const kK = ramp(t, C.keeperHold[0], C.keeperHold[0] + 0.15) * (1 - ramp(t, C.keeperHold[1] - 0.15, C.keeperHold[1])); if (kK > 0) pos.lerp(palm(kp, this._v1), kK);
    const kD = dv ? ramp(t, C.davidHold, C.davidHold + 0.28) : 0; if (kD > 0) pos.lerp(palm(D.ch, this._v1), kD);
    // yaw: rigid with the gripping hand (case x = the handle = the hand's thumb axis: case yaw = body yaw − π/2 with the palm in);
    // the case is symmetric under a half turn, so David's blend takes the nearest equivalent angle (no spin)
    const kpYaw = kp.root.rotation.y + (this.rob.room.og ? this.rob.room.og.rotation.y : 0);
    let yaw = t < C.keeperHold[0] ? C.restRy : t < C.keeperHold[1] ? kpYaw - Math.PI / 2 : C.counterRy;
    if (kD > 0) { const yd = D.yaw - Math.PI / 2; yaw = lerp(yaw, yaw + wrapPi(2 * (yd - yaw)) / 2, kD); }
    M.rotation.set(0, yaw, 0); M.updateMatrixWorld();
  }
  pedHook(key, p, o) { // David's right hand onto the case handle (before his pose is solved this frame)
    const C = this.S.rob && this.S.rob.case; if (key !== 'david') return; const A = o.ch.anim;
    if (!C) { if (A.reach === this._dR) A.reach = null; return; }
    const t = this.simT, w = keyAt(C.davidW, t) || 0; if (w > 0.001) { const K = this._dR; vecAt(C.davidGrip, t, this._cg); this.robPoint(this._cg, K.p); K.p.y += 0.07; K.w = w; this.handQ(o.ch, 0, K.q); A.reach = K; } else if (A.reach === this._dR) A.reach = null;
  }
  // world hand orientation for a reach: the bind hand (fingers down, palm inward, thumb forward — hooked round a handle that runs
  // fore-and-aft) turned `off` about the vertical in the body's frame
  handQ(ch, off, out) { ch.root.getWorldQuaternion(out); return out.multiply(this._yq.setFromAxisAngle(this._up, off)); }
  ringAlarm(pos, range) {
    const c = Audio.ctx, S = this.score; if (!c || !S.ok) return;
    if (!this.alarm) { // an electric bell: a bright square tone chopped by the clapper (~19 Hz)
      const o = c.createOscillator(); o.type = 'square'; o.frequency.value = 1180; const o2 = c.createOscillator(); o2.type = 'square'; o2.frequency.value = 1595;
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1700; bp.Q.value = 1.4; const chop = c.createGain(); chop.gain.value = 0;
      const lfo = c.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 19; const lg = c.createGain(); lg.gain.value = 0.5; const off = c.createConstantSource ? c.createConstantSource() : null;
      lfo.connect(lg); lg.connect(chop.gain); if (off) { off.offset.value = 0.5; off.connect(chop.gain); off.start(); }
      const g = c.createGain(); g.gain.value = 0; const pan = c.createStereoPanner ? c.createStereoPanner() : null;
      o.connect(bp); o2.connect(bp); bp.connect(chop); chop.connect(g); if (pan) { g.connect(pan); pan.connect(S.sfx); } else g.connect(S.sfx);
      o.start(); o2.start(); lfo.start(); this.alarm = { o, o2, lfo, off, g, pan };
    }
    const A = this.alarm, [gn, pn] = Audio.spatial ? Audio.spatial(pos[0], pos[1], range) : [0.5, 0]; const now = c.currentTime;
    A.g.gain.setTargetAtTime(0.045 * gn * clamp(this.rate, 0.4, 1), now, 0.05); if (A.pan) A.pan.pan.setTargetAtTime(pn, now, 0.05);
  }
  stopAlarm() { const A = this.alarm; if (!A) return; this.alarm = null; const c = Audio.ctx, t = c.currentTime; A.g.gain.setTargetAtTime(0, t, 0.04); setTimeout(() => { for (const n of [A.o, A.o2, A.lfo, A.off]) try { n && n.stop(); } catch { /* stopped */ } }, 400); }
  // ---------------------------------------------------------------- the Air Wing helicopter
  flyHeli(P, t, dt, newShot) {
    const H = this.g.heli, h = P.heli; if (!H || !h) return; this.heliParked = false;
    const dts = Math.max(dt, 1e-4);
    if (this.prevHeliY != null && dt > 1e-4) { const vy = (h.y - this.prevHeliY) / dts; H.ay = clamp(lerp(H.ay || 0, (vy - this.vy) / dts, Math.min(1, dts * 4)), -6, 6); this.vy = vy; } else H.ay = 0;
    if (dt > 1e-4 && !newShot) H.v.set((h.x - H.p.x) / dts, (h.y - H.p.y) / dts, (h.z - H.p.z) / dts);
    this.prevHeliY = h.y;
    H.p.set(h.x, h.y, h.z); H.yaw = h.yaw; H.pitch = h.pitch; H.roll = h.roll; H.rpm = h.rpm; H.mission = 'chase'; H.forced = false;
    const onPad = h.y < HELIPAD.y + 0.3 && Math.hypot(h.x - HELIPAD.x, h.z - HELIPAD.z) < 1; H.state = onPad ? (h.rpm >= 0.999 ? 'lift' : 'startup') : 'fly';
    // the searchlight: on the scene's target (a car), or on a fixed aim point
    const tg = h.target && P[h.target]; let T = null;
    if (tg) { const sp = tg.speed || 0, hd = tg.hdg ?? tg.yaw ?? 0; T = { x: tg.x, z: tg.z, vx: Math.sin(hd) * sp, vz: Math.cos(hd) * sp, y: L.groundY(tg.x, tg.z) }; }
    else if (h.aim) T = { x: h.aim[0], z: h.aim[2], vx: 0, vz: 0, y: h.aim[1] };
    H.targetOverride = T; H.lightOverride = h.light;
    if (newShot && T) { H.aim.set(T.x, (T.y || 0) + 0.6, T.z); }
    H.t += dt; H.pose(dt); H.lights(dts); H.downwash(dt);
    const A = this.g.atmos; if (A) A.shadowCaster = { cine: true, x: H.p.x, y: H.p.y, z: H.p.z, ground: L.groundY(H.p.x, H.p.z), max: 90 }; // its shadow stays in the per-frame near map (Atmosphere.fitSunShadow)
    const r0 = H.rpm; H.rpm = r0 * clamp(this.rate, 0.5, 1); H.sound(); H.rpm = r0; // slow motion pitches the rotor down with the picture
  }
  parkHeli() {
    const H = this.g.heli; if (this.g.atmos) this.g.atmos.shadowCaster = null; if (!H || this.heliParked) return; this.heliParked = true;
    H.p.set(HELIPAD.x, HELIPAD.y, HELIPAD.z); H.v.set(0, 0, 0); H.yaw = HELIPAD.yaw; H.pitch = 0; H.roll = 0; H.rpm = 0; H.ay = 0; H.state = 'parked'; H.mission = null; H.lightOverride = 0; H.targetOverride = null;
    H.pose(0); H.lights(0.016); H.downwash(0); H.sound();
  }
  // ---------------------------------------------------------------- titles of this edit
  textHTML(t, d) {
    if (t.kind === 'cityTitle') { d.innerHTML = `<div class="ct-city">${t.text}</div><div class="ct-cityline"></div>`; return true; }
    if (t.kind === 'tagline') { d.innerHTML = `<span>${t.text}</span>`; return true; }
    if (t.kind === 'studio') { d.innerHTML = `<img alt="Shaun David Studios logo" draggable="false"><div class="ct-studio">${t.text}</div>`; d.querySelector('img').src = LOGO; return true; }
    return false;
  }
  textAnim(X, t, k) {
    if (t.kind === 'cityTitle') { X.d.style.letterSpacing = `${(0.42 + 0.22 * sm(k)).toFixed(3)}em`; X.d.querySelector('.ct-cityline').style.transform = `scaleX(${sm(k * 1.6).toFixed(3)})`; }
    else if (t.kind === 'tagline') X.d.style.letterSpacing = `${(0.3 + 0.08 * k).toFixed(3)}em`;
    else if (t.kind === 'studio') X.d.style.transform = `scale(${(1.04 - 0.04 * sm(k)).toFixed(4)})`;
  }
  buildOverlay() {
    super.buildOverlay();
    if (this.ov.hint) { this.ov.hint.remove(); this.ov.hint = null; } // replaced by the control bar
    if (!document.getElementById('ct-style')) { const st = document.createElement('style'); st.id = 'ct-style'; st.textContent = CSS; document.head.appendChild(st); }
  }
  // ---------------------------------------------------------------- playback controls (shown on mouse move, hidden while watching)
  buildControls() {
    const root = document.createElement('div'); root.className = 'ct-ctl';
    const acts = ACTS.map(([n, a]) => `<i style="left:${((a / this.LEN) * 100).toFixed(3)}%" title="${n}"></i>`).join('');
    root.innerHTML = `<button class="ct-b ct-play" type="button" aria-label="Pause"><span class="ct-ico"></span></button>
      <div class="ct-time"><b class="ct-cur">0:00</b> / ${fmt(this.LEN)}</div>
      <div class="ct-track" role="slider" aria-label="Seek" tabindex="-1"><div class="ct-fill"></div>${acts}<div class="ct-knob"></div></div>
      <button class="ct-b ct-full" type="button" aria-label="Full screen" title="Full screen (F)"><svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="square"><path d="M1.5 5.5v-4h4M10.5 1.5h4v4M14.5 10.5v4h-4M5.5 14.5h-4v-4"/></svg></button>
      <button class="ct-b ct-exit" type="button" aria-label="Exit trailer">EXIT</button>
      <div class="ct-name">OFFICIAL CINEMATIC TRAILER</div>`;
    this.ov.root.appendChild(root);
    const q = (s) => root.querySelector(s); this.ctl = { root, cur: q('.ct-cur'), fill: q('.ct-fill'), knob: q('.ct-knob'), track: q('.ct-track'), shownAt: performance.now() };
    q('.ct-play').addEventListener('click', (e) => { e.stopPropagation(); this.togglePause(); });
    q('.ct-full').addEventListener('click', (e) => { e.stopPropagation(); this.toggleFull(); });
    q('.ct-exit').addEventListener('click', (e) => { e.stopPropagation(); this.skip(); });
    const tr = this.ctl.track; const at = (ev) => { const r = tr.getBoundingClientRect(); return clamp((ev.clientX - r.left) / r.width, 0, 1) * this.LEN; };
    tr.addEventListener('mousedown', (ev) => { ev.stopPropagation(); ev.preventDefault(); this.scrub = at(ev); this.updateControls(true); const mv = (e2) => { this.scrub = at(e2); this.updateControls(true); }; const up = (e2) => { removeEventListener('mousemove', mv); removeEventListener('mouseup', up); const t = at(e2); this.scrub = null; this.jump(t); }; addEventListener('mousemove', mv); addEventListener('mouseup', up); });
    this.showControls();
  }
  showControls() { if (!this.ctl) return; this.ctl.shownAt = performance.now(); this.ctl.root.classList.add('on'); document.body.classList.add('ct-cursor'); }
  updateControls(force = false) {
    const C = this.ctl; if (!C) return; const e = this.scrub ?? this.e; const k = clamp(e / this.LEN, 0, 1);
    const pct = `${(k * 100).toFixed(2)}%`; if (force || C._pct !== pct) { C._pct = pct; C.fill.style.width = pct; C.knob.style.left = pct; }
    const s = fmt(e); if (C._s !== s) { C._s = s; C.cur.textContent = s; }
    if (!this.paused && this.scrub == null && performance.now() - C.shownAt > 2600 && C.root.classList.contains('on')) { C.root.classList.remove('on'); document.body.classList.remove('ct-cursor'); }
  }
  // sound design cues on the cuts (the score itself is CineScore)
  cueSheet() {
    const S = this.score, c = (e, fn) => this.cues.push({ e, fn, done: false }); const P = this.plan;
    const ed = (scene, t) => editTimeOf(P, scene, t);
    for (const s of P.shots) if (s.act >= 3 && s.dur <= 1.3) c(s.start - 0.2, () => S.whoosh(0.06, 0.45));
    const doorIn = ed('C', 6.8); if (doorIn != null) c(doorIn, () => S.door(0.06));
    const burn = ed('C', 19.5); if (burn != null) { c(burn, () => S.rev(0.26, 2.0)); }
    c(60.0, () => S.rev(0.2, 1.6)); c(77.5, () => S.rev(0.24, 1.8)); c(84.6, () => S.whoosh(0.1, 0.7)); c(114.6, () => S.whoosh(0.1, 0.7)); c(135.4, () => S.whoosh(0.12, 0.8));
  }
  describe() { const d = super.describe(); d.paused = !!this.paused; const H = this.g.heli; if (H && this.S && this.S.heli) d.heli = { p: H.p.toArray().map((x) => +x.toFixed(1)), rpm: +H.rpm.toFixed(2), light: +H.light.toFixed(2), state: H.state }; d.lens = this.lens ? { f: +this.lens.focus.toFixed(2), k: this.lens.k, sh: this.lens.shutter } : null; return d; }
}

const CSS = `
body.ct-cursor.tr-on, body.ct-cursor.tr-on * { cursor: default !important; }
body.ct-cursor.tr-on .ct-track { cursor: pointer !important; }
.tr-cityTitle { position: absolute; left: 0; right: 0; top: 50%; transform: translateY(-50%); text-align: center; }
.tr-cityTitle .ct-city { font-family: 'Cinzel', 'Trajan Pro', Georgia, serif; font-weight: 600; font-size: clamp(44px, 7.6vw, 132px); letter-spacing: inherit; text-indent: .5em; color: #f6efe2; text-shadow: 0 0 40px rgba(0,0,0,.55), 0 2px 6px rgba(0,0,0,.6); }
.tr-cityTitle .ct-cityline { width: 28vw; height: 1px; margin: 1.4vh auto 0; background: linear-gradient(90deg, transparent, rgba(232,163,58,.95), transparent); transform-origin: 50% 50%; }
.tr-tagline { position: absolute; left: 0; right: 0; bottom: calc(var(--bar, 0px) + 9vh); text-align: center; font-family: 'Cinzel', Georgia, serif; font-size: clamp(15px, 1.75vw, 30px); letter-spacing: .3em; color: #f2ead9; text-shadow: 0 0 18px rgba(0,0,0,.8), 0 1px 3px rgba(0,0,0,.8); text-indent: .3em; }
.tr-studio { position: absolute; left: 50%; top: 50%; width: min(36vw, 520px); margin-left: calc(min(36vw, 520px) / -2); transform-origin: 50% 50%; text-align: center; translate: 0 -50%; }
.tr-studio img { width: 62%; height: auto; display: block; margin: 0 auto; border-radius: 4px; }
.tr-studio .ct-studio { margin-top: 2.4vh; font-family: 'Cinzel', Georgia, serif; letter-spacing: .5em; text-indent: .5em; font-size: clamp(12px, 1.2vw, 20px); color: #e9dcc4; }
.ct-ctl { position: absolute; left: 50%; bottom: calc(var(--bar, 0px) + 2.2vh); transform: translate(-50%, 12px); width: min(880px, 92vw); display: grid; grid-template-columns: auto auto 1fr auto auto; grid-template-rows: auto auto; align-items: center; gap: 6px 14px; padding: 12px 16px 10px; background: rgba(6,6,8,.62); border: 1px solid rgba(232,163,58,.28); border-radius: 6px; color: #f1e9da; font: 600 13px/1 system-ui, sans-serif; letter-spacing: .08em; opacity: 0; pointer-events: none; transition: opacity .25s, transform .25s; z-index: 5; backdrop-filter: blur(4px); }
.ct-ctl.on { opacity: 1; pointer-events: auto; transform: translate(-50%, 0); }
.ct-ctl .ct-name { grid-column: 1 / -1; grid-row: 1; font-size: 10px; letter-spacing: .42em; color: rgba(232,163,58,.85); }
.ct-ctl .ct-b { grid-row: 2; height: 30px; min-width: 34px; padding: 0 10px; border: 1px solid rgba(255,240,215,.25); background: rgba(255,255,255,.06); color: inherit; font: inherit; border-radius: 4px; }
.ct-ctl .ct-full { display: inline-flex; align-items: center; justify-content: center; }
.ct-ctl .ct-b:hover { background: rgba(232,163,58,.25); border-color: rgba(232,163,58,.7); }
.ct-ctl .ct-ico { display: inline-block; width: 10px; height: 12px; border-left: 3px solid currentColor; border-right: 3px solid currentColor; box-sizing: border-box; vertical-align: -1px; }
.ct-ctl.paused .ct-ico { width: 0; height: 0; border-right: 0; border-left: 11px solid currentColor; border-top: 7px solid transparent; border-bottom: 7px solid transparent; }
.ct-ctl .ct-time { grid-row: 2; font-variant-numeric: tabular-nums; color: rgba(241,233,218,.8); white-space: nowrap; }
.ct-ctl .ct-time b { color: #fff; }
.ct-ctl .ct-track { grid-row: 2; position: relative; height: 18px; }
.ct-ctl .ct-track::before { content: ''; position: absolute; left: 0; right: 0; top: 8px; height: 3px; background: rgba(255,255,255,.18); border-radius: 2px; }
.ct-ctl .ct-fill { position: absolute; left: 0; top: 8px; height: 3px; width: 0; background: linear-gradient(90deg, #8a5a1c, #ffcf7a); border-radius: 2px; }
.ct-ctl .ct-track i { position: absolute; top: 5px; width: 1px; height: 9px; background: rgba(255,240,215,.45); }
.ct-ctl .ct-knob { position: absolute; top: 3px; width: 13px; height: 13px; margin-left: -6.5px; border-radius: 50%; background: #ffe2a8; box-shadow: 0 0 8px rgba(255,200,110,.8); }
.ct-ctl .ct-exit { letter-spacing: .2em; }
`;
