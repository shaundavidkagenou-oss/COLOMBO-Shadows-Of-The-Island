// Evening tennis-ball cricket on Galle Face Green: a familiar Colombo scene. Adults only (18+ presets).
// Runs 15:30-18:40 in dry weather when the player is within ~230 m; despawns otherwise (no cost elsewhere).
// One continuous match loop: bowler run-up and overarm delivery, ball pitches and reaches the batter, the batter swings
// (or misses / defends), the ball travels to a fielder who runs to it, collects and throws it back; big hits get applause.
// Walking onto the pitch stops play (the bowler waves you off). Any alarm nearby (gunfire, someone hurt) breaks the game
// up: everyone is handed to the crowd system and scatters like other pedestrians.
import * as THREE from 'three';
import * as L from '../world/Layout.js';
import { plan } from '../world/CityPlan.js';
import { Character } from './Character.js';
import { makeAppearance, isAdultSpec } from './Appearance.js';
import { RNG } from '../core/rng.js';

const HOURS = [15.5, 18.67];
const PITCH = 18.5; // tennis-ball games use a slightly short pitch
const STUMP = new THREE.MeshStandardMaterial({ color: 0xd8c39a, roughness: 0.7 });
const BAT = new THREE.MeshStandardMaterial({ color: 0xc9a46a, roughness: 0.6 });
const GRIP = new THREE.MeshStandardMaterial({ color: 0x1d1d1f, roughness: 0.9 });
const BALL = new THREE.MeshStandardMaterial({ color: 0xd6e84a, roughness: 0.85 });
const smooth = (k) => k * k * (3 - 2 * k);

function stumps() {
  const g = new THREE.Group(); const cyl = new THREE.CylinderGeometry(0.017, 0.017, 0.71, 8);
  for (const x of [-0.11, 0, 0.11]) { const m = new THREE.Mesh(cyl, STUMP); m.position.set(x, 0.355, 0); m.castShadow = true; g.add(m); }
  const bail = new THREE.CylinderGeometry(0.008, 0.008, 0.11, 6); bail.rotateZ(Math.PI / 2);
  for (const x of [-0.055, 0.055]) { const m = new THREE.Mesh(bail, STUMP); m.position.set(x, 0.715, 0); g.add(m); }
  return g;
}
function bat() {
  const g = new THREE.Group(); const blade = new THREE.Mesh(new THREE.BoxGeometry(0.105, 0.56, 0.035), BAT); blade.position.y = -0.5; blade.castShadow = true;
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.3, 8), GRIP); handle.position.y = -0.08; g.add(blade, handle); return g;
}

export class StreetCricket {
  constructor(game) {
    this.g = game; this.active = false; this.people = []; this.stats = { deliveries: 0, hits: 0, sixes: 0, misses: 0, stoppages: 0, scattered: 0 }; this.log = [];
    this.site = this.findSite();
    if (game.crowd) (game.crowd.alarmHooks || (game.crowd.alarmHooks = [])).push((x, z, r, sev) => { if (this.active && this.site && Math.hypot(x - this.site.x, z - this.site.z) < Math.max(r, 30) + 20 && sev >= 1) this.scatter(x, z); });
  }
  // a clear 56 x 56 m patch of the Green: no trees, props, colliders, roads or water
  findSite() {
    const zn = [-600, -409, -660, -240]; let best = null;
    const blocked = (x, z) => L.isWater(x, z) || L.roadAt(x, z) || L.districtAt(x, z)?.name !== 'Galle Face Green';
    const near = (x, z, r) => plan.trees.some((t) => Math.abs(t.x - x) < r && Math.abs(t.z - z) < r) || plan.props.some((p) => Math.abs(p.x - x) < r && Math.abs(p.z - z) < r)
      || plan.colliders.some((c) => c.x1 > x - r && c.x0 < x + r && c.z1 > z - r && c.z0 < z + r);
    for (let z = zn[2] + 40; z <= zn[3] - 40; z += 6) for (let x = zn[0] + 34; x <= zn[1] - 34; x += 6) {
      let ok = !near(x, z, 28); if (!ok) continue;
      for (let a = 0; a < 16 && ok; a++) { const ang = (a / 16) * Math.PI * 2; if (blocked(x + Math.cos(ang) * 28, z + Math.sin(ang) * 28)) ok = false; }
      if (!ok || blocked(x, z)) continue; const d = Math.abs(z + 450); if (!best || d < best.d) best = { x, z, d };
    }
    return best ? { x: best.x, z: best.z } : null;
  }
  note(s) { this.log.push(`${this.g.atmos?.timeString || ''} ${s}`); if (this.log.length > 40) this.log.shift(); }
  ground(x, z) { return this.g.collision.groundAt(x, z, 2); }
  wanted() { const A = this.g.atmos, P = this.g.player; if (!this.site || this.g.indoor) return false; const h = A.hour; return h >= HOURS[0] && h < HOURS[1] && (A.w?.rain || 0) < 0.25 && Math.hypot(P.x - this.site.x, P.z - this.site.z) < 230; }
  P(x, z) { return { x: this.site.x + x, z: this.site.z + z }; } // pitch frame: batter at z +PITCH/2, bowler end at z -PITCH/2
  add(role, seed, preset, x, z, yaw) {
    let spec = makeAppearance(seed, preset ? { preset, sex: 'm' } : { sex: seed % 5 === 0 ? 'f' : 'm', age: 'adult' }); if (!isAdultSpec(spec)) spec = makeAppearance(seed + 7, { sex: 'm', age: 'adult' });
    const ch = new Character(spec); const w = this.P(x, z); ch.root.position.set(w.x, this.ground(w.x, w.z), w.z); ch.root.rotation.y = yaw; this.g.scene.add(ch.root);
    const o = { role, ch, x: w.x, z: w.z, yaw, home: { x: w.x, z: w.z, yaw }, tx: null, tz: null, sp: 0, act: null }; this.people.push(o); return o;
  }
  spawn() {
    const r = new RNG(4100 + (this.g.atmos?.day || 1)); this.r = r; this.active = true; this.state = 'mark'; this.t = 0; this.paused = false;
    const half = PITCH / 2; const g = this.g.scene;
    this.props = new THREE.Group(); const s1 = stumps(), s2 = stumps(); const a = this.P(0, half + 0.6), b = this.P(0, -half - 0.6);
    s1.position.set(a.x, this.ground(a.x, a.z), a.z); s2.position.set(b.x, this.ground(b.x, b.z), b.z); this.props.add(s1, s2); g.add(this.props);
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(0.034, 10, 8), BALL); this.ball.castShadow = true; g.add(this.ball);
    this.batter = this.add('batter', 7101, 'm_fitness', 0.35, half + 0.15, Math.PI); this.batter.act = 'bat';
    this.batMesh = bat(); this.batter.ch.bones.handR.add(this.batMesh); this.batMesh.position.set(0, -0.06, 0.02); this.batMesh.rotation.set(1.35, 0, 0.12); // hands forward at the waist, blade angled down to the crease
    this.bowler = this.add('bowler', 7102, null, -0.4, -half - 9, 0);
    this.keeper = this.add('keeper', 7103, null, 0.2, half + 3.2, Math.PI); this.keeper.act = 'crouch';
    this.runner = this.add('runner', 7104, null, -1.6, -half - 0.4, 0); this.runner.act = 'crossarms';
    const spots = [[-14, 6], [15, 8], [-20, -4], [19, -6], [-8, -16], [9, -18], [0, 24], [-22, 17]];
    this.fielders = spots.map(([x, z], i) => { const f = this.add('fielder', 7110 + i * 3, null, x, z, Math.atan2(-x, half - z)); f.act = i % 3 === 0 ? 'hips' : null; return f; });
    this.watchers = [[-27, 2], [-27.5, 4], [27, -3], [26, 9]].map(([x, z], i) => { const w = this.add('watcher', 7140 + i * 5, null, x, z, Math.atan2(-x, -z)); w.act = i % 2 ? 'crossarms' : 'watch'; return w; });
    this.ballAt = { kind: 'hand', who: this.bowler }; this.fresh = true; this.note(`match on (${this.people.length} adults)`);
  }
  despawn() {
    for (const o of this.people) { o.ch.root.parent?.remove(o.ch.root); o.ch.dispose(); } this.people = [];
    if (this.props) this.g.scene.remove(this.props); if (this.ball) this.g.scene.remove(this.ball); this.props = this.ball = null; this.active = false;
  }
  // gunfire / someone hurt nearby: stop the game, everyone joins the crowd and gets away
  scatter(x, z) {
    if (!this.active) return; this.active = false; const C = this.g.crowd; this.stats.scattered++; this.note('alarm: game breaks up'); // inactive first: adopt() raises its own alarm
    if (this.batMesh) this.batMesh.parent?.remove(this.batMesh);
    const list = this.people; this.people = [];
    for (const o of list) { o.ch.root.parent?.remove(o.ch.root); o.ch.anim.set(null); if (C) C.adopt(o.ch, o.x, o.z, o.yaw, 'flee', { x, z }); else o.ch.dispose(); }
    if (this.props) this.g.scene.remove(this.props); if (this.ball) this.g.scene.remove(this.ball); this.props = this.ball = null; this.cooldown = 600;
  }
  moveTo(o, x, z, sp) { o.tx = x; o.tz = z; o.sp = sp; }
  stepPerson(o, dt) {
    let speed = 0;
    if (o.tx != null) { const dx = o.tx - o.x, dz = o.tz - o.z, d = Math.hypot(dx, dz); if (d < 0.15) { o.tx = null; } else { const v = Math.min(o.sp, d / Math.max(dt, 1e-3)); o.x += (dx / d) * v * dt; o.z += (dz / d) * v * dt; o.yaw = Math.atan2(dx, dz); speed = v; } }
    if (o.faceTo && o.tx == null) { const f = o.faceTo; const want = Math.atan2(f.x - o.x, f.z - o.z); let dy = want - o.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); o.yaw += dy * Math.min(1, dt * 6); }
    const A = o.ch.anim; const act = speed > 0.2 ? (o.carry ? null : null) : o.act; if (A.action !== act && !(o.hold > 0)) A.set(act);
    if (o.hold > 0) o.hold -= dt;
    o.ch.root.position.set(o.x, this.ground(o.x, o.z), o.z); o.ch.root.rotation.y = o.yaw; A.update(dt, speed);
  }
  play(o, act, dur) { o.ch.anim.set(act); o.hold = dur; }
  update(dt) {
    if (this.cooldown > 0) this.cooldown -= dt;
    const want = this.wanted() && !(this.cooldown > 0);
    if (want && !this.active) this.spawn(); else if (!want && this.active) { this.despawn(); return; }
    if (!this.active) return;
    const P = this.g.player, half = PITCH / 2; this.t += dt;
    // a person on the pitch (player on foot, or a vehicle) stops play
    const lx = P.x - this.site.x, lz = P.z - this.site.z; const onPitch = Math.abs(lx) < 2.2 && Math.abs(lz) < half + 3;
    if (onPitch && !this.paused) { this.paused = true; this.stats.stoppages++; this.play(this.bowler, 'beckon', 2.5); this.play(this.batter, 'hips', 2.5); this.note('play stopped: someone on the pitch'); }
    if (this.paused && !onPitch) this.paused = false;
    const ballW = (x, y, z) => this.ball.position.set(x, y, z);
    const handPos = (o) => { const h = o.ch.bones.handR; h.updateWorldMatrix(true, false); const v = new THREE.Vector3(); h.getWorldPosition(v); return v; };
    const bat = this.batter, bow = this.bowler, kp = this.keeper;
    bat.faceTo = this.P(0, -half); kp.faceTo = this.P(0, -half);
    for (const f of this.fielders) if (!f.chasing) f.faceTo = this.P(0, half);
    for (const w of this.watchers) w.faceTo = this.P(0, 0);
    if (!this.paused) switch (this.state) {
      case 'mark': { // bowler walks back to the top of his run-up, ball in hand
        const m = this.P(-0.4, -half - 9); if (bow.tx == null && Math.hypot(bow.x - m.x, bow.z - m.z) > 0.3) this.moveTo(bow, m.x, m.z, 1.4);
        bow.faceTo = this.P(0, half); if (bow.tx == null && this.t > 1.2) { this.state = 'runup'; this.t = 0; const c = this.P(-0.4, -half - 0.3); this.moveTo(bow, c.x, c.z, 4.6); } break; }
      case 'runup': if (bow.tx == null) { this.state = 'deliver'; this.t = 0; this.play(bow, 'bowl', 0.9); } break;
      case 'deliver': if (this.t > 0.42) { // release: ball pitches ~4 m short of the batter and comes up to bat height
        this.state = 'flight'; this.t = 0; const hp = handPos(bow); this.fl = { a: hp, b: new THREE.Vector3(this.P(0.1, half - 4).x, this.ground(0, 0) + 0.04, this.P(0.1, half - 4).z), c: new THREE.Vector3(this.P(0.2, half - 0.2).x, this.ground(0, 0) + 0.7, this.P(0.2, half - 0.2).z), T1: 0.48, T2: 0.2 };
        this.ballAt = { kind: 'air' }; this.stats.deliveries++; const r = this.r.next(); this.outcome = r < 0.5 ? 'hit' : r < 0.62 ? 'six' : r < 0.82 ? 'miss' : 'block'; bat.swingT = 0; } break;
      case 'flight': { const F = this.fl; let p; if (this.t < F.T1) { const k = this.t / F.T1; p = F.a.clone().lerp(F.b, k); p.y = F.a.y + (F.b.y - F.a.y) * k * k; } else { const k = Math.min(1, (this.t - F.T1) / F.T2); p = F.b.clone().lerp(F.c, k); p.y = F.b.y + (F.c.y - F.b.y) * Math.sin(k * Math.PI / 2); }
        ballW(p.x, p.y, p.z);
        if (this.outcome !== 'block' || true) bat.ch.anim.swing = Math.min(1, Math.max(0, (this.t - (F.T1 - 0.18)) / 0.6)) * (this.outcome === 'block' ? 0.55 : 1);
        if (this.t >= F.T1 + F.T2) this.contact(); break; }
      case 'travel': { const F = this.fl; const k = Math.min(1, this.t / F.T); const p = F.a.clone().lerp(F.b, k); p.y = F.a.y + (F.b.y - F.a.y) * k + Math.sin(k * Math.PI) * F.h; if (F.roll && k > 0.55) p.y = Math.max(this.ground(p.x, p.z) + 0.034, p.y); ballW(p.x, Math.max(this.ground(p.x, p.z) + 0.034, p.y), p.z);
        if (bat.ch.anim.swing != null && bat.ch.anim.swing < 1) bat.ch.anim.swing = Math.min(1, bat.ch.anim.swing + dt * 1.6);
        if (k >= 1) { const f = this.target; this.state = 'collect'; this.t = 0; if (f) { this.moveTo(f, F.b.x, F.b.z, 3.6); f.chasing = true; } } break; }
      case 'collect': { const f = this.target; if (!f) { this.state = 'mark'; this.t = 0; break; }
        if (f.tx != null) { ballW(f.tx, this.ground(f.tx, f.tz) + 0.034, f.tz); break; } // ball waits where it stopped until the fielder gets there
        if (!f.got) { f.got = true; this.play(f, 'interact', 0.6); this.t = 0; break; }
        if (this.t > 0.35) { const hp = handPos(f); ballW(hp.x, hp.y - 0.04, hp.z); }
        if (this.t > 0.6) { f.got = false;
          if (f === bow) { this.target = null; f.chasing = false; bat.ch.anim.swing = -1; this.ballAt = { kind: 'hand', who: bow }; this.state = 'mark'; this.t = 0; break; } // fielded off his own bowling
          const hp = handPos(f); const tgt = handPos(bow); tgt.y = Math.max(tgt.y, this.ground(bow.x, bow.z) + 1.2); this.fl = { a: hp, b: tgt, T: Math.max(0.6, hp.distanceTo(tgt) / 16), h: hp.distanceTo(tgt) * 0.12 }; this.state = 'return'; this.t = 0; this.play(f, 'shove', 0.5); }
        break; }
      case 'return': { const F = this.fl; const k = Math.min(1, this.t / F.T); const p = F.a.clone().lerp(F.b, k); p.y += Math.sin(k * Math.PI) * F.h; ballW(p.x, p.y, p.z);
        if (k >= 1) { const f = this.target; if (f) { f.chasing = false; this.moveTo(f, f.home.x, f.home.z, 1.5); } this.target = null; bat.ch.anim.swing = -1; this.state = 'mark'; this.t = 0; this.ballAt = { kind: 'hand', who: bow }; } break; }
    }
    if (this.ballAt.kind === 'hand') { const hp = handPos(this.ballAt.who); ballW(hp.x, hp.y - 0.05, hp.z); }
    if (this.fresh) { this.fresh = false; for (const o of this.people) o.ch.anim.update(0.016, 0); }
    for (const o of this.people) this.stepPerson(o, dt);
  }
  contact() {
    const half = PITCH / 2, bat = this.batter, r = this.r; const from = this.ball.position.clone(); this.t = 0; this.state = 'travel';
    let tx, tz, h, T, roll = false, fielder = null;
    if (this.outcome === 'miss') { this.stats.misses++; const k = this.keeper; tx = k.x; tz = k.z; h = 0.1; T = 0.2; fielder = k; this.play(k, 'interact', 0.5); this.note('beaten! keeper takes it'); }
    else if (this.outcome === 'block') { const p = this.P(r.range(-1.5, 1.5), half - r.range(3, 6)); tx = p.x; tz = p.z; h = 0.05; T = 1.4; roll = true; fielder = this.bowler; }
    else { this.stats.hits++; const six = this.outcome === 'six'; if (six) this.stats.sixes++;
      fielder = this.fielders[Math.floor(r.next() * this.fielders.length)]; const ang = Math.atan2(fielder.x - (this.site.x), fielder.z - (this.site.z + half)); const dist = six ? r.range(34, 44) : Math.hypot(fielder.x - this.site.x, fielder.z - (this.site.z + half)) * r.range(0.8, 1.15);
      tx = this.site.x + Math.sin(ang) * dist; tz = this.site.z + half + Math.cos(ang) * dist; h = six ? dist * 0.42 : r.chance(0.5) ? dist * 0.15 : 0.4; T = six ? 2.4 : dist / 15; roll = !six && h < 1;
      if (six) { for (const o of this.watchers.concat(this.fielders)) if (o !== fielder) this.play(o, 'clap', 2.2); this.note('six! applause'); } }
    this.target = fielder; this.fl = { a: from, b: new THREE.Vector3(tx, this.ground(tx, tz) + 0.034, tz), T, h, roll };
    if (fielder && this.outcome !== 'miss') { this.moveTo(fielder, tx, tz, this.outcome === 'block' ? 2 : 4.2); fielder.chasing = true; }
    if (this.outcome === 'miss') { this.state = 'collect'; this.fl.T = 0.01; fielder.tx = null; }
  }
}
