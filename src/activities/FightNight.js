// 92nd: an underground fight night — a rope ring in a yard, work lamps, a ring of spectators, a referee and a card of
// three bouts. The fight itself is FightAI.Bout (footwork, strikes on the animation's impact frame, knock-downs, rounds,
// the cards); this file is the presentation and the player's part (watch, predict, the ringside cameras).
//
// Cost model: everything is built in prepare() while the player is still 150–300 m away — the dressing in one go (a few
// dozen boxes and cylinders on shared materials), the people one per frame through the shared BUILDS token. Nothing is
// built while the bout is on. The venue lamps borrow the WalkIn light pool (ActivityManager), so the scene's light count —
// and with it every shader program — never changes. Effects come from fixed pools (sweat, dust) that are only shown.
// No alarm and no police call: this is an organised event, not a street brawl. Gunfire near it breaks it up like the
// cricket on the Green (everyone is handed to the crowd and scatters).
import * as THREE from 'three';
import { Character } from '../actors/Character.js';
import { makeAppearance, isAdultSpec } from '../actors/Appearance.js';
import { BUILDS } from '../core/FrameBudget.js';
import { Audio } from '../audio/Audio.js';
import { SoundBank as SB } from '../audio/SoundBank.js';
import { Bout, odds, STYLES } from './FightAI.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const ROSTER = [
  { id: 'nuwan', name: 'Nuwan "Anchor" Perera', style: 'brawler', power: 0.86, speed: 0.5, chin: 0.78, cardio: 0.55, defence: 0.42, iq: 0.45, preset: 'm_labourer', seed: 9101 },
  { id: 'ruwan', name: 'Ruwan Silva', style: 'boxer', power: 0.6, speed: 0.82, chin: 0.6, cardio: 0.78, defence: 0.72, iq: 0.7, preset: 'm_gym', seed: 9112 },
  { id: 'imran', name: 'Imran "Quiet" Hassan', style: 'counter', power: 0.66, speed: 0.68, chin: 0.56, cardio: 0.62, defence: 0.86, iq: 0.82, preset: 'm_fitness', seed: 9123 },
  { id: 'kasun', name: 'Kasun Jayasuriya', style: 'brawler', power: 0.78, speed: 0.58, chin: 0.66, cardio: 0.5, defence: 0.45, iq: 0.5, preset: 'm_mechanic', seed: 9134 },
  { id: 'dilan', name: 'Dilan "Dock" Fernando', style: 'boxer', power: 0.68, speed: 0.7, chin: 0.7, cardio: 0.66, defence: 0.6, iq: 0.62, preset: 'm_construction', seed: 9145 },
  { id: 'tharindu', name: 'Tharindu Wijesinghe', style: 'counter', power: 0.58, speed: 0.74, chin: 0.62, cardio: 0.72, defence: 0.78, iq: 0.74, preset: 'm_hoodie', seed: 9156 },
  { id: 'ravi', name: 'Ravi Kumar', style: 'brawler', power: 0.82, speed: 0.55, chin: 0.58, cardio: 0.6, defence: 0.38, iq: 0.42, preset: 'm_road_crew', seed: 9167 },
  { id: 'sanjay', name: 'Sanjay "Lightning" de Mel', style: 'boxer', power: 0.55, speed: 0.9, chin: 0.5, cardio: 0.8, defence: 0.66, iq: 0.68, preset: 'm_gym', seed: 9178 },
];
const ROPE = new THREE.MeshStandardMaterial({ color: 0xb8302a, roughness: 0.7 });
const POST = new THREE.MeshStandardMaterial({ color: 0x2b2d30, roughness: 0.5, metalness: 0.6 });
const CANVAS = new THREE.MeshStandardMaterial({ color: 0x5b5a55, roughness: 0.95 });
const DRUM = new THREE.MeshStandardMaterial({ color: 0x3d5a78, roughness: 0.6, metalness: 0.35 });
const CRATE = new THREE.MeshStandardMaterial({ color: 0x8a6a42, roughness: 0.9 });
const LAMP = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xffe2b0, emissiveIntensity: 3, roughness: 0.4 });
const TARP = new THREE.MeshStandardMaterial({ color: 0x2f4a3a, roughness: 0.9, side: THREE.DoubleSide });
const FX = new THREE.MeshBasicMaterial({ color: 0xdfe6ea, transparent: true, opacity: 0.7, depthWrite: false });
const DUST = new THREE.MeshBasicMaterial({ color: 0x9a8f7c, transparent: true, opacity: 0.45, depthWrite: false });
const RING = 5.4, HALF = RING / 2;

export class FightNight {
  constructor(mgr, ev) { this.m = mgr; this.g = mgr.g; this.ev = ev; this.site = ev.site; this.people = []; this.queue = []; this.ready = false; this.bout = null; this.boutI = 0; this.cardT = 0; this.stats = { bouts: 0, hits: 0, downs: 0, built: 0, buildMs: 0, stepMaxMs: 0 }; this.log = []; this.pick = 0; this.cam = 0; this.lights = []; }
  note(s) { this.log.push(`${this.g.atmos?.timeString || ''} ${s}`); if (this.log.length > 40) this.log.shift(); }
  ground(x, z) { return this.g.collision.groundAt(x, z, 2); }
  W(lx, lz) { const s = this.site, c = Math.cos(s.yaw), n = Math.sin(s.yaw); return { x: s.x + lx * c + lz * n, z: s.z - lx * n + lz * c }; }
  // ---- prepare: the dressing now, the people queued (one per frame)
  prepare() {
    const t0 = performance.now(); const g = (this.root = new THREE.Group()); const s = this.site; const y0 = this.ground(s.x, s.z);
    g.position.set(s.x, y0, s.z); g.rotation.y = s.yaw; this.g.scene.add(g);
    const box = (w, h, d, m, x, y, z, ry = 0) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.rotation.y = ry; o.castShadow = h > 0.3; o.receiveShadow = true; g.add(o); return o; };
    const cyl = (r, h, m, x, y, z) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 12), m); o.position.set(x, y, z); o.castShadow = true; g.add(o); return o; };
    box(RING + 0.6, 0.04, RING + 0.6, CANVAS, 0, 0.02, 0); // a tarp over the yard's concrete, the ring floor
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl(0.06, 1.35, POST, sx * HALF, 0.675, sz * HALF);
    for (const h of [0.45, 0.8, 1.15]) { box(RING, 0.035, 0.035, ROPE, 0, h, HALF); box(RING, 0.035, 0.035, ROPE, 0, h, -HALF); box(0.035, 0.035, RING, ROPE, HALF, h, 0); box(0.035, 0.035, RING, ROPE, -HALF, h, 0); }
    // around it: oil drums, crates (seats for some), two work lamps on stands, a tarpaulin lean-to
    const r = this.m.rng(this.ev.seed); for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + 0.4; cyl(0.29, 0.88, DRUM, Math.cos(a) * 6.6, 0.44, Math.sin(a) * 6.6); }
    for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2 + 1.1; box(0.9, 0.5, 0.6, CRATE, Math.cos(a) * 5.6, 0.25, Math.sin(a) * 5.6, a + r() * 0.3); }
    this.lampPts = []; for (const [lx, lz] of [[-4.6, -4.6], [4.6, 4.6]]) { cyl(0.04, 3.2, POST, lx, 1.6, lz); const h = box(0.42, 0.28, 0.16, LAMP, lx * 0.93, 3.25, lz * 0.93, Math.atan2(-lx, -lz)); h.castShadow = false; const w = this.W(lx * 0.9, lz * 0.9); this.lampPts.push({ x: w.x, y: y0 + 3.2, z: w.z }); }
    { const t = box(4, 0.03, 2.6, TARP, 0, 2.5, -7.4); t.rotation.x = 0.25; box(0.05, 2.5, 0.05, POST, -1.9, 1.25, -6.4); box(0.05, 2.5, 0.05, POST, 1.9, 1.25, -6.4); }
    // effect pools: sweat spray (heavy shots) and canvas dust (knock-downs) — fixed meshes, only shown / moved
    const sg = new THREE.SphereGeometry(0.018, 5, 4), dg = new THREE.SphereGeometry(0.09, 6, 4);
    this.fx = []; for (let i = 0; i < 18; i++) { const o = new THREE.Mesh(i < 12 ? sg : dg, i < 12 ? FX : DUST); o.visible = false; o.frustumCulled = false; this.g.scene.add(o); this.fx.push({ o, t: 0, life: 0, vx: 0, vy: 0, vz: 0, dust: i >= 12 }); }
    // people: two fighters per bout come from the card, a referee, the spectators
    const card = this.ev.card; this.card = card.map((b) => [ROSTER.find((f) => f.id === b[0]), ROSTER.find((f) => f.id === b[1])]);
    const want = new Set(); for (const [a, b] of this.card) { want.add(a); want.add(b); }
    for (const f of want) this.queue.push({ role: 'fighter', f, spec: makeAppearance(f.seed, { preset: f.preset, sex: 'm' }) });
    this.queue.push({ role: 'ref', spec: makeAppearance(9301, { preset: 'm_security', sex: 'm' }) });
    const n = this.m.crowdSize(); for (let i = 0; i < n; i++) { const seed = this.ev.seed * 31 + i * 7; let sp = makeAppearance(seed, { sex: i % 6 === 0 ? 'f' : 'm', age: 'adult' }); if (!isAdultSpec(sp)) sp = makeAppearance(seed + 3, { sex: 'm', age: 'adult' }); this.queue.push({ role: 'fan', i, n, spec: sp }); }
    this.stats.buildMs += performance.now() - t0; this.note(`venue dressed, ${this.queue.length} people queued`);
  }
  // one person per frame (shared BUILDS token); returns true when everything is built
  build(fresh = false) {
    while (this.queue.length) {
      if (!BUILDS.can(fresh)) return false; const q = this.queue.shift(); const t0 = performance.now(); BUILDS.spend();
      const ch = new Character(q.spec); ch.root.visible = true; this.g.scene.add(ch.root); const o = { role: q.role, ch, x: 0, z: 0, yaw: 0, act: null, hold: 0, f: q.f || null };
      if (q.role === 'fan') { // around the ring, 3.4–5 m out, facing it; a few on the crates
        const a = (q.i / q.n) * Math.PI * 2 + (q.i % 2) * 0.12; const rr = HALF + 1.0 + (q.i % 3) * 0.55; const lx = Math.cos(a) * rr * 1.05, lz = Math.sin(a) * rr; const w = this.W(lx, lz); o.x = w.x; o.z = w.z; o.home = { x: w.x, z: w.z }; o.act = ['watch', 'crossarms', 'hips', 'watch', 'point'][q.i % 5];
      } else if (q.role === 'ref') { const w = this.W(0, HALF - 0.7); o.x = w.x; o.z = w.z; this.ref = o; }
      else { const w = this.W((this.people.filter((p) => p.role === 'fighter').length % 2 ? 1 : -1) * (HALF + 1.6), -3.8); o.x = w.x; o.z = w.z; o.home = { x: w.x, z: w.z }; o.act = 'crossarms'; }
      this.people.push(o); this.stats.built++; this.stats.buildMs += performance.now() - t0; if (fresh) continue; return !this.queue.length;
    }
    this.ready = true; return true;
  }
  fighterOf(f) { return this.people.find((p) => p.role === 'fighter' && p.f === f); }
  fans() { return this.people.filter((p) => p.role === 'fan'); }
  // ---- the card: bout i starts with an intro (predictions open), then rounds; a short break between bouts
  // benchmark F: the card from the top (the same seeded first bout), fighters back to their posts
  restart() { if (this.bout && this.pa) for (const p of [this.pa, this.pb]) { p.ch.anim.fightOn(false, true); p.ch.anim.set(null); p.hold = 0; } this.bout = null; this.boutI = 0; this.cardT = 6; this.pick = 0; this.staked = 0; for (const q of this.fx || []) { q.life = 0; q.o.visible = false; } }
  startBout(i) {
    const [fa, fb] = this.card[i % this.card.length]; const s = this.site; const recs = this.m.save.fighters;
    this.bout = new Bout(fa, fb, this.m.rng(this.ev.seed * 7 + i), { rounds: 3, roundT: this.m.roundT, restT: 8, half: HALF, cx: s.x, cz: s.z, yaw: s.yaw });
    this.pa = this.fighterOf(fa); this.pb = this.fighterOf(fb); for (const p of [this.pa, this.pb]) { p.act = null; p.ch.anim.set(null); }
    this.bout.a.x = this.pa.x; this.bout.a.z = this.pa.z; this.bout.b.x = this.pb.x; this.bout.b.z = this.pb.z; // they walk in from where they stood
    const [oa, ob, pa] = odds(fa, fb, recs[fa.id], recs[fb.id]); this.odds = [oa, ob]; this.favA = pa; this.pick = 0; this.staked = 0; this.boutI = i;
    this.stats.bouts++; this.note(`bout ${i + 1}: ${fa.name} (${STYLES[fa.style].label}, ${oa}) v ${fb.name} (${STYLES[fb.style].label}, ${ob})`);
    if (this.m.near(this.site, 40)) this.g.hud.notify(`Bout ${i + 1} of ${this.card.length}`, `${fa.name} v ${fb.name}`, 'info', 4);
  }
  predictOpen() { return this.bout && this.bout.phase === 'intro'; }
  // the player's prediction (free points, never money): E cycles none → red corner → blue corner
  cyclePick() { if (!this.predictOpen()) return; const S = this.m.save; this.pick = (this.pick + 1) % 3; const stake = this.m.stake(); if (this.pick && S.points < stake && !this.staked) { this.pick = 0; this.g.hud.notify('Not enough points', `A prediction costs ${stake} points.`, 'info', 2.5); return; }
    if (this.pick && !this.staked) { S.points -= stake; this.staked = stake; } if (!this.pick && this.staked) { S.points += this.staked; this.staked = 0; } Audio.ui('click'); }
  settle(res) {
    const S = this.m.save; const [fa, fb] = [this.bout.a.f, this.bout.b.f]; const rec = (f) => S.fighters[f.id] || (S.fighters[f.id] = { w: 0, l: 0, d: 0, ko: 0 });
    if (res.winner) { const w = res.winner.f, l = res.loser.f; rec(w).w++; rec(l).l++; if (res.how === 'KO' || res.how === 'TKO') rec(w).ko++; } else { rec(fa).d++; rec(fb).d++; }
    if (this.pick && this.staked) { const mine = this.pick === 1 ? fa : fb; const won = res.winner && res.winner.f === mine; const pay = won ? Math.round(this.staked * this.odds[this.pick - 1]) : res.winner ? 0 : this.staked;
      S.points += pay; S.predictions = (S.predictions || 0) + 1; if (won) S.correct = (S.correct || 0) + 1;
      this.g.hud.notify(won ? 'Prediction right' : res.winner ? 'Prediction wrong' : 'Draw — points back', won ? `+${pay} points (${S.points} total)` : `${S.points} points`, won ? 'success' : 'info', 4); }
    this.pick = 0; this.staked = 0;
  }
  // ---- presentation of the bout's events
  sfx(kind, x, z, pow = 0.5) { const P = this.g.player; const d = Math.hypot(x - P.x, z - P.z); const k = clamp(1 - d / 70, 0, 1); if (k <= 0) return; const pan = clamp(Math.sin(Math.atan2(x - P.x, z - P.z) - (P.camYaw ?? 0) - Math.PI), -0.9, 0.9) * 0.6;
    if (kind === 'hit') SB.play('punch.hit', k * (0.6 + pow), pan, 0, { rate: 0.9 + Math.random() * 0.2 }) || Audio.noise(0.07, { f: 260 + pow * 300, q: 0.7, vol: 0.22 * k * (0.5 + pow), type: 'lowpass', pan });
    else if (kind === 'block') SB.play('punch.taken', k * 0.5, pan, 0, {}) || Audio.noise(0.05, { f: 700, q: 1.2, vol: 0.08 * k, pan });
    else if (kind === 'swing') SB.play('punch.swing', k * 0.35, pan, 0, { rate: 1.05 }) || Audio.noise(0.06, { f: 1300, q: 0.8, vol: 0.025 * k, pan });
    else if (kind === 'bell') { for (let i = 0; i < 3; i++) Audio.tone(1480, 0.9, { type: 'sine', vol: 0.12 * k, when: i * 0.32, verb: true, pan }); }
    else if (kind === 'cheer') SB.play('ce.crowd.cheer', k * pow, pan, 0, {}) || Audio.noise(1.4 * pow + 0.4, { f: 900, q: 0.4, vol: 0.12 * k * pow, attack: 0.15, pan, verb: true });
    else if (kind === 'gasp') SB.play('ce.crowd.gasp', k * 0.7, pan, 0, {}) || Audio.noise(0.6, { f: 600, q: 0.5, vol: 0.07 * k, attack: 0.05, pan });
  }
  spray(x, y, z, dir, n, dust) { let k = 0; for (const p of this.fx) { if (p.life > 0 || p.dust !== dust) continue; p.o.visible = true; p.o.position.set(x, y, z); const a = dir + (Math.random() - 0.5) * 1.6; const sp = dust ? 0.6 + Math.random() * 0.6 : 1.4 + Math.random() * 1.6; p.vx = Math.sin(a) * sp; p.vz = Math.cos(a) * sp; p.vy = dust ? 0.3 + Math.random() * 0.4 : 0.8 + Math.random() * 1.2; p.life = p.t = dust ? 1.1 : 0.45; if (++k >= n) break; } }
  react(fans, act, dur, share) { for (const f of fans) if (Math.random() < share) { f.ch.anim.set(act); f.hold = dur * (0.7 + Math.random() * 0.6); } }
  drain() {
    const B = this.bout; const fans = this.fans();
    for (const e of B.events) {
      const F = e.who, P = F === B.a ? this.pa : F === B.b ? this.pb : null;
      if (e.type === 'swing' && P) { P.ch.anim.strike(e.move); this.sfx('swing', P.x, P.z); }
      else if (e.type === 'hit' || e.type === 'down') { const O = F.opp, Q = O === B.a ? this.pa : this.pb; this.stats.hits++;
        Q.ch.anim.takeHit(O.react ? O.react.kind === 'down' ? 'hook' : O.react.kind : 'snap', O.react && O.react.dir ? 1 : -1, clamp(e.pow * 3, 0.4, 1.4)); this.sfx('hit', Q.x, Q.z, e.pow);
        if (e.pow > 0.2) { const hy = this.ground(Q.x, Q.z) + 1.62; this.spray(Q.x, hy, Q.z, Math.atan2(Q.x - P.x, Q.z - P.z), 5, false); this.react(fans, 'pump', 1.2, 0.35); this.m.shake(0.12 * e.pow); }
        if (e.kind === 'stagger') { Q.ch.anim.set('stumble'); Q.hold = 0.9; this.sfx('gasp', Q.x, Q.z); }
        if (e.type === 'down') { this.stats.downs++; Q.ch.anim.fightOn(false, true); Q.ch.anim.set('collapse'); Q.hold = 99; this.spray(Q.x, this.ground(Q.x, Q.z) + 0.1, Q.z, 0, 6, true); this.sfx('cheer', Q.x, Q.z, 1); this.react(fans, 'pump', 3, 0.8); this.note(`${O.f.name} down (${e.move})`); } }
      else if (e.type === 'block' && P) { const Q = F === B.a ? this.pb : this.pa; Q.ch.anim.takeHit('block', 1, 0.6); this.sfx('block', Q.x, Q.z); }
      else if (e.type === 'count') { if (this.ref) { this.ref.ch.anim.set('signal'); this.ref.hold = 0.6; } }
      else if (e.type === 'up' && P) { P.ch.anim.set('rise'); P.hold = 1.2; P.ch.anim.fightOn(true); this.sfx('cheer', P.x, P.z, 0.6); this.note(`${F.f.name} beats the count`); }
      else if (e.type === 'bell') { this.sfx('bell', this.site.x, this.site.z); if (e.round) this.note(`round ${e.round}`); if (e.round === 1) this.react(fans, 'clap', 2, 0.6); }
      else if (e.type === 'result') { const R = B.result; this.react(fans, 'clap', 4, 0.9); this.sfx('cheer', this.site.x, this.site.z, 1); const txt = R.winner ? `${R.winner.f.name} wins (${R.how}${R.how === 'KO' || R.how === 'TKO' ? `, round ${R.round}` : ''})` : 'Draw';
        this.note(txt + ' · cards ' + R.cards.map((c) => c.join('-')).join(' ')); if (this.m.near(this.site, 40)) this.g.hud.notify('Result', txt, 'info', 5); this.settle(R);
        for (const p of [this.pa, this.pb]) { p.ch.anim.fightOn(false); } if (R.winner) { const W = R.winner === B.a ? this.pa : this.pb; W.ch.anim.set('pump'); W.hold = 3; } this.cardT = 0; }
    }
    B.events.length = 0;
  }
  update(dt) {
    if (!this.ready) return; const t0 = performance.now(); const P = this.g.player;
    const nearK = Math.hypot(P.x - this.site.x, P.z - this.site.z); const far = nearK > 120; // far: the card keeps its clock, no poses / effects
    if (!this.bout) { this.cardT += dt; if (this.cardT > 6) this.startBout(0); }
    else if (this.bout.phase === 'over') { this.cardT += dt; if (this.cardT > 14) { for (const p of [this.pa, this.pb]) { p.act = 'crossarms'; p.ch.anim.set(null); p.ch.anim.fightOn(false, true); } this.startBout(this.boutI + 1); } }
    const B = this.bout; if (B) { B.step(dt); this.drain(); }
    // fighters follow the bout; everyone poses
    if (B) for (const [F, p] of [[B.a, this.pa], [B.b, this.pb]]) { p.x = F.x; p.z = F.z; p.yaw = F.yaw; p.walk = F.walk; p.animK = F.animK; if (B.phase === 'fight' && !(p.hold > 0)) p.ch.anim.fightOn(true); p.ch.anim.block(!!F.block && B.phase === 'fight'); }
    if (this.ref && B) { const mx = (B.a.x + B.b.x) / 2, mz = (B.a.z + B.b.z) / 2; const ax = B.b.x - B.a.x, az = B.b.z - B.a.z, al = Math.hypot(ax, az) || 1; const tx = mx - (az / al) * 1.5, tz = mz + (ax / al) * 1.5; // beside the action, off the line between them
      const R = this.ref; const dx = tx - R.x, dz = tz - R.z, d = Math.hypot(dx, dz); const v = d > 0.3 ? Math.min(1.4, d) : 0; if (v) { R.x += (dx / d) * v * dt; R.z += (dz / d) * v * dt; } R.walk = v; R.yaw = Math.atan2(mx - R.x, mz - R.z); }
    for (const f of this.fans()) { f.yaw = Math.atan2(this.site.x - f.x, this.site.z - f.z); }
    for (const p of this.people) {
      if (p.hold > 0) { p.hold -= dt; if (p.hold <= 0 && p.role !== 'fighter') p.ch.anim.set(p.act); else if (p.hold <= 0 && p.role === 'fighter') p.ch.anim.set(B && B.phase === 'over' ? 'hips' : null); }
      else if (p.role !== 'fighter' && p.ch.anim.action !== p.act && p.act !== undefined && !(p.role === 'ref')) p.ch.anim.set(p.act);
      if (B && p.role === 'fighter' && p !== this.pa && p !== this.pb && p.ch.anim.action !== 'crossarms') p.ch.anim.set('crossarms'); // the men on later on the card wait by the tarp
      p.ch.root.position.set(p.x, this.ground(p.x, p.z), p.z); p.ch.root.rotation.y = p.yaw;
      if (!far) p.ch.anim.update(dt * (p.animK ?? 1), p.walk || 0);
    }
    if (!far) for (const q of this.fx) { if (q.life <= 0) continue; q.life -= dt; const o = q.o; if (q.life <= 0) { o.visible = false; continue; } q.vy -= (q.dust ? 0.4 : 9.8) * dt; o.position.x += q.vx * dt; o.position.y += q.vy * dt; o.position.z += q.vz * dt; if (q.dust) { q.vx *= 0.96; q.vz *= 0.96; o.scale.setScalar(1 + (1 - q.life / q.t) * 2.5); } }
    const ms = performance.now() - t0; if (ms > this.stats.stepMaxMs) this.stats.stepMaxMs = ms; this.stats.lastMs = ms;
  }
  // venue lamps for the borrowed WalkIn pool: two warm floods over the ring + a dim fill
  fillPool(pool) { const pts = this.lampPts || []; for (let i = 0; i < pool.length; i++) { const L = pool[i], d = pts[i]; if (!d) { L.intensity = 0; L.position.set(this.site.x, -800, this.site.z); continue; } L.position.set(d.x, d.y, d.z); L.color.setHex(0xffd9a0); L.distance = 16; L.decay = 1.3; L.intensity = 18; } }
  // gunfire / an explosion nearby: the night breaks up, everyone becomes a crowd pedestrian and gets away
  scatter(x, z) { const C = this.g.crowd; const list = this.people; this.people = []; this.note('alarm: the crowd scatters');
    for (const o of list) { o.ch.root.parent?.remove(o.ch.root); o.ch.anim.fightOn(false, true); o.ch.anim.set(null); if (C && C.adopt) C.adopt(o.ch, o.x, o.z, o.yaw, 'flee', { x, z }); else o.ch.dispose(); } this.bout = null; this.scattered = true; }
  cleanup() { for (const o of this.people) { o.ch.root.parent?.remove(o.ch.root); o.ch.dispose(); } this.people = []; this.queue = [];
    if (this.root) { this.g.scene.remove(this.root); this.root.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); this.root = null; }
    for (const p of this.fx || []) this.g.scene.remove(p.o); this.fx = []; this.bout = null; this.ready = false; }
}
