// Pedestrian simulation: sidewalk graph navigation, signalised crossings, points of interest (shops, benches, bus stops,
// vendors, chats), random idle animations, groups, rain behaviour, vehicle avoidance, and reactions to the player.
import * as THREE from 'three';
import * as L from '../world/Layout.js';
import { plan } from '../world/CityPlan.js';
import { Character, randomSpec } from './Character.js';
import { RNG } from '../core/rng.js';
import { clamp, lerp, dampAngle, wrapAngle } from '../core/math.js';
import { LINES, pick } from '../story/Lines.js';

const IDLE_ACTS = [['phone', 3], ['text', 3], ['look', 2], ['stretch', 0.6], ['talk', 1], ['dance', 0.35], ['wave', 0.6], ['clap', 0.25], [null, 4]];
export class Crowd {
  constructor(scene, collision, events) {
    this.scene = scene; this.collision = collision; this.events = events; this.peds = []; this.rng = new RNG(31337); this.max = 70; this.t = 0;
    this.specs = []; this.poiGrid = new Map(); this.frame = 0;
    for (const p of plan.poi) { const k = this.key(p.x, p.z); let a = this.poiGrid.get(k); if (!a) this.poiGrid.set(k, (a = [])); a.push(p); }
    this.mainComp = this.largestComponent();
  }
  key(x, z) { return Math.floor(x / 40) * 1000 + Math.floor(z / 40); }
  prepareSpecs(n = 40) { for (let i = 0; i < n; i++) { const sp = randomSpec(9000 + i * 17); this.specs.push(sp); new Character(sp).dispose(); } } // pre-build geometry
  largestComponent() { // spawn only on the main connected component so peds never get trapped
    const comp = new Int32Array(L.pedNodes.length).fill(-1); let best = -1, bestN = 0, c = 0;
    for (const n of L.pedNodes) { if (comp[n.id] >= 0) continue; const st = [n.id]; comp[n.id] = c; let cnt = 0; while (st.length) { const id = st.pop(); cnt++; for (const e of L.pedNodes[id].edges) { const E = L.pedEdges[e]; const o = E.a === id ? E.b : E.a; if (comp[o] < 0) { comp[o] = c; st.push(o); } } } if (cnt > bestN) { bestN = cnt; best = c; } c++; }
    this.comp = comp; return best;
  }
  setDensity(d) { this.max = Math.round(15 + d * 90); }
  nearPOIs(x, z, r = 40) { const out = []; const i0 = Math.floor((x - r) / 40), i1 = Math.floor((x + r) / 40), j0 = Math.floor((z - r) / 40), j1 = Math.floor((z + r) / 40); for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const a = this.poiGrid.get(i * 1000 + j); if (a) for (const p of a) if ((p.x - x) ** 2 + (p.z - z) ** 2 < r * r) out.push(p); } return out; }
  // walk-graph nodes near a point (spatial grid, cached per 20 m focus cell)
  nodesNear(x, z, r) {
    if (!this.nodeGrid) { this.nodeGrid = new Map(); for (const n of L.pedNodes) { if (this.comp[n.id] !== this.mainComp) continue; const k = this.key(n.x, n.z); let a = this.nodeGrid.get(k); if (!a) this.nodeGrid.set(k, (a = [])); a.push(n); } }
    const ck = `${Math.floor(x / 20)},${Math.floor(z / 20)},${r}`; if (this._nearKey === ck) return this._near;
    const out = []; const i0 = Math.floor((x - r) / 40), i1 = Math.floor((x + r) / 40), j0 = Math.floor((z - r) / 40), j1 = Math.floor((z + r) / 40);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const a = this.nodeGrid.get(i * 1000 + j); if (a) for (const n of a) out.push(n); }
    this._nearKey = ck; this._near = out; return out;
  }
  spawn(focus, camDir, near) {
    const cand = this.nodesNear(focus.x, focus.z, 130); if (!cand.length) return null;
    for (let tries = 0; tries < 12; tries++) {
      const n = cand[Math.floor(this.rng.next() * cand.length)];
      const d = Math.hypot(n.x - focus.x, n.z - focus.z); if (d > (near ? 70 : 130) || d < (near ? 8 : 40)) continue;
      if (!near && camDir && d < 90) { const dot = ((n.x - focus.x) * camDir.x + (n.z - focus.z) * camDir.z) / d; if (dot > 0.55) continue; }
      const nightF = this.night || 0; const sp = this.specs[Math.floor(this.rng.next() * this.specs.length)];
      if (nightF > 0.7 && (sp.age === 'child' || sp.outfit === 'school_girl' || sp.outfit === 'school_boy') && this.rng.chance(0.85)) continue;
      const ch = new Character(sp); this.scene.add(ch.root);
      const p = { ch, x: n.x + this.rng.range(-1, 1), z: n.z + this.rng.range(-1, 1), yaw: this.rng.range(-3, 3), speed: 0, state: 'walk', node: n.id, target: null, edge: null, lat: this.rng.range(-0.6, 0.6), pace: this.rng.range(1.15, 1.5) * (sp.age === 'elder' ? 0.75 : sp.age === 'child' ? 1.05 : 1), timer: 0, act: null, react: 0, mood: 0, talkCd: 0, umbrella: this.rng.chance(0.5), crossing: false, id: this.rng.next(), sp, temper: this.rng.next(), vx: 0, vz: 0, stuckT: 0, stuckN: 0 };
      this.pickNext(p); this.peds.push(p); this.place(p); return p;
    }
  }
  place(p) { p.y = this.collision.groundAt(p.x, p.z, 0.2); p.ch.root.position.set(p.x, p.y, p.z); p.ch.root.rotation.y = p.yaw; }
  pickNext(p) {
    // chance to visit a POI near the current node
    if (this.rng.chance(0.28)) {
      const pois = this.nearPOIs(p.x, p.z, 30).filter((q) => q.used < (q.type === 'chat' ? 3 : q.type === 'busStop' ? 5 : 1) && (q.type !== 'lawn' || !this.rain));
      if (pois.length) { const q = this.rng.pick(pois); q.used++; p.poi = q; p.target = { x: q.x + this.rng.range(-0.4, 0.4), z: q.z + this.rng.range(-0.4, 0.4) }; p.state = 'toPoi'; return; }
    }
    const n = L.pedNodes[p.node]; if (!n || !n.edges.length) { p.state = 'idle'; p.timer = 5; return; }
    let opts = n.edges.filter((e) => e !== p.lastEdge); if (!opts.length) opts = n.edges;
    const e = L.pedEdges[this.rng.pick(opts)]; const o = e.a === n.id ? e.b : e.a; const on = L.pedNodes[o];
    p.edge = e; p.lastEdge = e.id; p.nextNode = o; const dx = on.x - n.x, dz = on.z - n.z, len = Math.hypot(dx, dz) || 1;
    const lat = e.type === 'cross' ? p.lat * 0.5 : p.lat * Math.min(1, (n.walkW || 2) * 0.35);
    p.target = { x: on.x + (dz / len) * lat, z: on.z - (dx / len) * lat };
    if (e.type === 'cross') { p.state = 'waitCross'; p.timer = 0; } else p.state = 'walk';
  }
  canCross(p) {
    const e = p.edge; const node = L.nodes[e.node]; if (node && node.signal) return L.pedSignal(node, e.axis, this.simTime);
    // unsignalised: look for approaching vehicles
    const mx = (L.pedNodes[e.a].x + L.pedNodes[e.b].x) / 2, mz = (L.pedNodes[e.a].z + L.pedNodes[e.b].z) / 2;
    for (const v of this.vehicles) { const dx = mx - v.x, dz = mz - v.z; const d = Math.hypot(dx, dz); if (d > 35) continue; const closing = (dx * Math.sin(v.yaw) + dz * Math.cos(v.yaw)) / (d || 1); if (closing > 0.3 && v.speed > 1.5 && d / Math.max(v.speed, 0.1) < 5) return false; }
    return true;
  }
  say(p, cat, prio = 0) { if (p.talkCd > 0) return; p.talkCd = 6 + this.rng.next() * 6; const line = pick(LINES[cat], () => this.rng.next()); this.events.emit('npcLine', { ped: p, line, prio }); }
  // ------------------------------------------------------------------ routine vs reaction
  // Routine states: walk, toPoi, waitCross, idle, shelter. Reaction states overlay them; the routine is saved and
  // restored afterwards (or the ped rejoins the walk graph if it ended up elsewhere), so nobody stays stuck reacting.
  isRoutine(st) { return st === 'walk' || st === 'toPoi' || st === 'waitCross' || st === 'idle' || st === 'shelter'; }
  react(p, state, timer, extra = {}) {
    if (this.isRoutine(p.state)) p.routine = { state: p.state, target: p.target, node: p.node, nextNode: p.nextNode, edge: p.edge, poi: p.poi, x: p.x, z: p.z, timer: p.timer };
    if (p.sit) { p.sit = false; }
    p.state = state; p.timer = timer; p.rt = 0; Object.assign(p, extra); p.ch.anim.set(null);
  }
  endReaction(p) {
    const r = p.routine; p.routine = null; p.ch.anim.set(null); p.act = null; p.lookAt = null; p.ch.face.mood = 'neutral'; p.ch.face.talking = false; p.lookT = 0;
    if (r && Math.hypot(r.x - p.x, r.z - p.z) < 4 && r.state !== 'idle') { p.state = r.state === 'shelter' ? 'walk' : r.state; p.target = r.target; p.node = r.node; p.nextNode = r.nextNode; p.edge = r.edge; p.poi = r.state === 'toPoi' ? r.poi : null; if (r.poi && r.state !== 'toPoi') r.poi.used = Math.max(0, r.poi.used - 1); if (p.state === 'waitCross') p.timer = 0; }
    else { if (r && r.poi) r.poi.used = Math.max(0, r.poi.used - 1); p.poi = null; this.returnToGraph(p); }
    p.stuckN = 0; p.stuckT = 0;
  }
  speak(p, cat, prio = 0, dur = 2.2) { const before = p.talkCd; this.say(p, cat, prio); if (p.talkCd !== before) { p.ch.face.talking = true; p.talkFor = dur; } }
  // A disturbance at (x,z): sev 1 = scuffle/shouting, 2 = gunfire, 3 = someone hit nearby. Each witness reacts after its
  // own delay and picks its own response; panic directions are spread so the crowd scatters rather than herding.
  alarm(x, z, r, sev, src = null) {
    for (const p of this.peds) {
      if (p.state === 'down' || p === src) continue; const d = Math.hypot(p.x - x, p.z - z); if (d > r) continue;
      const delay = 0.15 + this.rng.next() * (sev >= 2 ? 0.7 : 1.3) + d * 0.04;
      if (!p.pending || p.pending.sev < sev) p.pending = { t: delay, sev, x, z, d };
    }
  }
  witness(p, w) {
    if (w.sev === 0) return; // just a glance (handled where it was queued)
    const r = this.rng; const awayX = p.x - w.x, awayZ = p.z - w.z; const dd = Math.hypot(awayX, awayZ) || 1; const fearful = p.sp.age === 'child' || p.sp.age === 'elder' || p.temper < 0.3;
    if (w.sev === 1) {
      if (!this.isRoutine(p.state)) return;
      const k = r.weighted([['look', 5], ['watch', 3], ['film', p.sp.age === 'teen' || p.sp.age === 'adult' ? 1 : 0], ['comment', 1.5], ['avoid', 1.5]]);
      p.ch.face.set(r.chance(0.5) ? 'surprise' : 'concern', 1.8);
      if (k === 'look') { p.lookT = 1.5 + r.next() * 2; p.lookAtPt = { x: w.x, z: w.z }; }
      else if (k === 'watch' || k === 'film') { this.react(p, 'watch', 3 + r.next() * 4, { lookAt: { x: w.x, z: w.z } }); if (k === 'film') p.ch.anim.set('photo'); else if (r.chance(0.3)) this.speak(p, 'witness'); p.ch.face.mood = 'concern'; }
      else if (k === 'comment') { p.lookT = 2; p.lookAtPt = { x: w.x, z: w.z }; this.speak(p, 'witness'); }
      else { this.react(p, 'flee', 2 + r.next() * 2, { fleeDir: this.spread(awayX / dd, awayZ / dd, 1.0), fleeSp: 1.9 + r.next() * 0.6 }); }
      return;
    }
    // gunfire / violence
    if (p.state === 'cower' || p.state === 'flee') { p.timer = Math.max(p.timer, 3); return; }
    const k = r.weighted([['flee', fearful ? 6 : 4.5], ['cower', fearful ? 3 : 2], ['freeze', 1.2], ['report', w.d > 15 ? 1.5 : 0.5], ['film', w.d > 25 ? 0.4 : 0]]);
    p.ch.face.set('fear', 3); p.ch.face.mood = 'fear';
    if (k === 'flee') { this.react(p, 'flee', 4 + r.next() * 6, { fleeDir: this.spread(awayX / dd, awayZ / dd, 1.1), fleeSp: 3.2 + r.next() * 2.4 }); if (r.chance(0.3)) this.speak(p, 'panic', 1); }
    else if (k === 'cower') this.react(p, 'cower', 1.8 + r.next() * 3);
    else if (k === 'freeze') { this.react(p, 'watch', 0.8 + r.next() * 1.2, { lookAt: { x: w.x, z: w.z }, after: 'flee' }); p.ch.face.set('surprise', 1.5); }
    else if (k === 'report') { this.react(p, 'report', 6 + r.next() * 4, { fleeDir: this.spread(awayX / dd, awayZ / dd, 0.8) }); }
    else { this.react(p, 'watch', 3, { lookAt: { x: w.x, z: w.z } }); p.ch.anim.set('photo'); }
  }
  spread(x, z, a) { const t = (this.rng.next() - 0.5) * 2 * a; const c = Math.cos(t), s = Math.sin(t); return [x * c - z * s, x * s + z * c]; }
  // non-graphic hit (weapon): flinch, maybe fall and stay down for a while, then get up and get away
  hitPed(p, dx, dz, power = 1) {
    if (p.state === 'down') { p.timer = Math.max(p.timer, 4); return; }
    p.knockedByCar = false; p.hits = (p.hits || 0) + power; p.vx = (p.vx || 0) + dx * 1.5; p.vz = (p.vz || 0) + dz * 1.5;
    if (p.hits >= 1.5 || power >= 1.5) { this.react(p, 'down', 7 + this.rng.next() * 5, { yaw: Math.atan2(-dx, -dz) }); p.downT = 0; p.ch.face.set('fear', 6); this.events.emit('pedHit', p); }
    else { this.react(p, 'hit', 0.7); p.ch.anim.set('hit'); p.ch.face.set('fear', 4); this.speak(p, 'scared', 2); }
    this.alarm(p.x, p.z, 30, 3, p);
  }
  update(dt, focus, camDir, ctx) {
    this.t += dt; this.frame++; this.simTime = ctx.simTime; this.vehicles = ctx.vehicles; this.rain = ctx.rain > 0.4; this.night = ctx.night;
    const player = ctx.player; this.camDir = camDir; this.focus = focus;
    // spawn / despawn (despawn only far away / out of view)
    for (let i = this.peds.length - 1; i >= 0; i--) { const p = this.peds[i]; if ((Math.hypot(p.x - focus.x, p.z - focus.z) > 165 && !p.keep) || p.recycle) { this.despawn(p); this.peds.splice(i, 1); } }
    const want = Math.round(this.max * (ctx.hourFactor ?? 1) * (this.rain ? 0.65 : 1));
    let budget = 2; while (this.peds.length < want && budget-- > 0) this.spawn(focus, camDir, this.peds.length < want * 0.5);
    // neighbour grid (2 m cells)
    const grid = new Map(); for (const p of this.peds) { const k = Math.floor(p.x / 2) * 10000 + Math.floor(p.z / 2); let a = grid.get(k); if (!a) grid.set(k, (a = [])); a.push(p); }
    const pv = player.vehicle;
    // nearby vehicles (incl. parked) as obstacles
    const vnear = []; for (const v of this.vehicles || []) if (Math.abs(v.x - focus.x) < 80 && Math.abs(v.z - focus.z) < 80) vnear.push(v); if (pv) vnear.push(pv);
    for (const p of this.peds) {
      const dist = Math.hypot(p.x - focus.x, p.z - focus.z); const lod = dist > 70 ? 3 : dist > 40 ? 2 : 1;
      p.talkCd -= dt; p.react -= dt; if (p.talkFor > 0) { p.talkFor -= dt; if (p.talkFor <= 0 && !['talk', 'argue', 'phone'].includes(p.ch.anim.action)) p.ch.face.talking = false; }
      if (p.pending) { p.pending.t -= dt; if (p.pending.t <= 0) { const w = p.pending; p.pending = null; this.witness(p, w); } }
      let desired = 0; let tx = null, tz = null; let accel = 2.5; let avoid = true;
      // --- threats: player vehicle approaching fast
      if (pv && Math.abs(pv.speed) > 4) {
        const dx = p.x - pv.x, dz = p.z - pv.z; const d = Math.hypot(dx, dz); const fx = Math.sin(pv.yaw), fz = Math.cos(pv.yaw);
        const along = dx * fx + dz * fz, lat = Math.abs(dx * fz - dz * fx);
        if (d < pv.half + 0.6 && lat < pv.T.wid / 2 + 0.3) { this.knock(p, fx * Math.sign(pv.speed), fz * Math.sign(pv.speed), Math.abs(pv.speed)); }
        else if (along > 0 && along < 14 && lat < 3.2 && p.state !== 'down' && p.state !== 'flee' && p.state !== 'dodge') { const side = (dx * fz - dz * fx) > 0 ? 1 : -1; this.react(p, 'dodge', 0.9 + this.rng.next() * 0.5, { dodge: [fz * side, -fx * side] }); p.ch.anim.set(this.rng.chance(0.35) ? 'cower' : null); p.ch.face.set('fear', 2.5); this.speak(p, 'scared', 1); this.events.emit('pedPanic', p); }
      }
      p.rt = (p.rt || 0) + dt;
      switch (p.state) {
        case 'walk': case 'toPoi': {
          tx = p.target.x; tz = p.target.z; desired = p.pace * (this.rain && !p.umbrellaOpen ? 1.35 : 1);
          if (p.act && p.ch.anim.action !== p.act) p.ch.anim.set(p.act);
          const d = Math.hypot(tx - p.x, tz - p.z);
          if (d < 1.4) desired *= clamp(d / 1.4, 0.45, 1); // ease in to targets
          if (d < 0.6 || (p.state === 'toPoi' && d < 1.6 && p.stuckT > 0.6)) {
            p.stuckN = 0; if (p.state === 'toPoi') this.startPoi(p);
            else { p.node = p.nextNode; p.crossing = false; this.pickNext(p); }
          }
          break;
        }
        case 'waitCross': {
          const n = L.pedNodes[p.node]; tx = n.x; tz = n.z; desired = Math.hypot(tx - p.x, tz - p.z) > 0.5 ? p.pace : 0; p.timer += dt;
          if (desired === 0) { const on = L.pedNodes[p.nextNode]; p.yaw = dampAngle(p.yaw, Math.atan2(on.x - p.x, on.z - p.z), 4, dt); if (p.timer > 4 && !p.ch.anim.action && this.rng.chance(0.01)) p.ch.anim.set('text'); }
          if (this.canCross(p) && p.timer > 0.4 + p.id) { p.state = 'walk'; p.crossing = true; p.ch.anim.set(null); }
          break;
        }
        case 'idle': {
          p.timer -= dt; desired = 0; avoid = false; if (p.poi) p.yaw = dampAngle(p.yaw, p.poi.rot ?? p.yaw, 4, dt);
          if (p.lookAt) { p.yaw = dampAngle(p.yaw, Math.atan2(p.lookAt.x - p.x, p.lookAt.z - p.z), 3, dt); }
          if (p.poi && p.poi.type === 'busStop' && this.rng.chance(dt * 0.01)) this.speak(p, 'bus');
          if (p.poi && p.poi.type === 'chat') { // turn-taking: one talks (gestures, mouth), the other listens (nods), eye contact
            p.chatT = (p.chatT ?? this.rng.next() * 3) - dt; if (p.chatT <= 0) { p.speaking = !p.speaking; p.chatT = 2 + this.rng.next() * 4; p.ch.anim.set(p.speaking ? 'talk' : 'listen'); p.ch.face.talking = p.speaking; if (!p.speaking && this.rng.chance(0.3)) p.ch.face.set('smile', 1.5); }
            if (p.lookAt) p.ch.anim.look = clamp(wrapAngle(Math.atan2(p.lookAt.x - p.x, p.lookAt.z - p.z) - p.yaw), -1, 1);
            if (p.speaking && this.rng.chance(dt * 0.03) && dist < 25) this.speak(p, 'chat');
          }
          if (p.poi && p.poi.type === 'vendor' && this.rng.chance(dt * 0.03) && dist < 20) { this.speak(p, 'vendor'); p.ch.face.set('smile', 2); }
          if (p.timer <= 0) { if (p.poi) { p.poi.used = Math.max(0, p.poi.used - 1); p.poi = null; } p.lookAt = null; p.ch.anim.set(null); p.ch.face.talking = false; p.act = null; p.sit = false; p.speaking = false; this.pickNext(p); }
          break;
        }
        case 'shelter': { p.timer -= dt; desired = Math.hypot(p.target.x - p.x, p.target.z - p.z) > 0.6 ? 2.6 : 0; tx = p.target.x; tz = p.target.z; if (desired === 0 && p.ch.anim.action !== 'phone' && p.ch.anim.action !== 'look') p.ch.anim.set(this.rng.chance(0.5) ? 'phone' : 'look'); if (!this.rain || p.timer <= 0) { p.ch.anim.set(null); p.state = 'walk'; this.returnToGraph(p); } break; }
        // ---- reactions
        case 'dodge': { p.timer -= dt; tx = p.x + p.dodge[0] * 3; tz = p.z + p.dodge[1] * 3; desired = 4.2; accel = 9; avoid = false; if (p.timer <= 0) { if (this.rng.chance(0.35)) { p.state = 'flee'; p.timer = 2 + this.rng.next() * 2; p.fleeDir = this.spread(p.dodge[0], p.dodge[1], 0.6); p.fleeSp = 3; p.ch.anim.set(null); } else this.endReaction(p); } break; }
        case 'flee': { p.timer -= dt; const fd = p.fleeDir || (() => { const ax = p.x - player.x, az = p.z - player.z, d = Math.hypot(ax, az) || 1; return [ax / d, az / d]; })(); tx = p.x + fd[0] * 5; tz = p.z + fd[1] * 5; desired = p.fleeSp || 4; accel = 6;
          if (p.timer <= 0) { p.state = 'recover'; p.timer = 3 + this.rng.next() * 3; p.ch.face.mood = 'concern'; } break; }
        case 'recover': { // calm down: walk on briskly, glance back over the shoulder, then back to routine
          p.timer -= dt; const fd = p.fleeDir || [Math.sin(p.yaw), Math.cos(p.yaw)]; tx = p.x + fd[0] * 4; tz = p.z + fd[1] * 4; desired = p.pace * 1.15; p.ch.anim.look = Math.sin(p.rt * 1.3) > 0.6 ? 1.0 : 0;
          if (p.timer <= 0) { if (this.rng.chance(0.25)) this.speak(p, 'recover'); this.endReaction(p); } break; }
        case 'cower': { p.timer -= dt; desired = 0; if (p.ch.anim.action !== 'cower' && p.ch.anim.action !== 'handsup') p.ch.anim.set('cower'); if (p.timer <= 0) { p.ch.anim.set(null); p.state = 'flee'; p.timer = 3 + this.rng.next() * 3; p.fleeSp = 3 + this.rng.next() * 1.5; if (!p.fleeDir) p.fleeDir = this.spread(Math.sin(p.yaw + Math.PI), Math.cos(p.yaw + Math.PI), 1.2); } break; }
        case 'watch': { p.timer -= dt; desired = 0; avoid = false; if (p.lookAt) p.yaw = dampAngle(p.yaw, Math.atan2(p.lookAt.x - p.x, p.lookAt.z - p.z), 4, dt); if (p.timer <= 0) { if (p.after === 'flee') { p.after = null; p.state = 'flee'; p.timer = 3 + this.rng.next() * 4; p.fleeSp = 3.5; const ax = p.x - p.lookAt.x, az = p.z - p.lookAt.z, d = Math.hypot(ax, az) || 1; p.fleeDir = this.spread(ax / d, az / d, 1); p.ch.anim.set(null); } else this.endReaction(p); } break; }
        case 'report': { // move a little away, then phone the police
          p.timer -= dt; if (p.rt < 2.2) { const fd = p.fleeDir; tx = p.x + fd[0] * 4; tz = p.z + fd[1] * 4; desired = 3; accel = 5; } else { desired = 0; if (p.ch.anim.action !== 'phone') { p.ch.anim.set('phone'); this.speak(p, 'report', 1, 3); this.events.emit('pedReport', { x: p.x, z: p.z }); } }
          if (p.timer <= 0) this.endReaction(p); break; }
        case 'hit': { p.timer -= dt; desired = 0; if (p.timer <= 0) { p.state = 'flee'; p.timer = 5 + this.rng.next() * 4; p.fleeSp = 3 + this.rng.next(); const ax = p.x - player.x, az = p.z - player.z, d = Math.hypot(ax, az) || 1; p.fleeDir = this.spread(ax / d, az / d, 0.7); p.ch.anim.set(null); } break; }
        case 'down': { // fall (mesh tips over), lie still, then get up and stagger away — no injury detail
          p.timer -= dt; p.downT = (p.downT || 0) + dt; desired = 0; avoid = false;
          const fall = clamp(p.downT / 0.55, 0, 1), rise = clamp(1 - p.timer / 0.9, 0, 1); const k = fall * (1 - rise);
          p.ch.mesh.rotation.x = -1.45 * (k * k * (3 - 2 * k)); p.ch.mesh.position.y = 0.12 * k;
          if (p.timer <= 0) { p.ch.mesh.rotation.x = 0; p.ch.mesh.position.y = 0; p.hits = 0; p.downT = 0;
            if (p.knockedByCar && p.temper > 0.55 && p.sp.age !== 'child' && this.rng.chance(0.6)) { this.react(p, 'confront', 3.5); p.ch.anim.set('argue'); p.ch.face.set('angry', 4); this.speak(p, 'annoyed', 1); }
            else { p.state = 'flee'; p.timer = 3 + this.rng.next() * 3; p.fleeSp = 2.6 + this.rng.next(); const ax = p.x - player.x, az = p.z - player.z, d = Math.hypot(ax, az) || 1; p.fleeDir = this.spread(ax / d, az / d, 0.8); this.speak(p, 'scared', 1); }
            p.knockedByCar = false; }
          break; }
        case 'stumble': { // shoved: momentum carries them, arms flail; then a temper-dependent response
          p.timer -= dt; desired = 0; accel = 4; avoid = false;
          if (p.timer <= 0) {
            const r = this.rng; const kid = p.sp.age === 'child', old = p.sp.age === 'elder';
            const k = r.weighted([['confront', kid ? 0 : p.temper * 4], ['complain', 2.5], ['flee', kid || old ? 3 : (1 - p.temper) * 2], ['report', old ? 1.5 : 0.6], ['shrug', 1.2]]);
            if (k === 'confront') { this.react(p, 'confront', 3 + r.next() * 2.5); p.ch.anim.set(r.chance(0.5) ? 'argue' : 'point'); p.ch.face.set('angry', 5); p.ch.face.mood = 'angry'; this.speak(p, 'shoved', 1, 2.5); }
            else if (k === 'complain') { this.react(p, 'complain', 3.5 + r.next() * 2); p.ch.face.set('concern', 4); this.speak(p, 'annoyed', 1); }
            else if (k === 'flee') { const ax = p.x - player.x, az = p.z - player.z, d = Math.hypot(ax, az) || 1; this.react(p, 'flee', 2.5 + r.next() * 2, { fleeDir: this.spread(ax / d, az / d, 0.6), fleeSp: 3 + r.next() }); p.ch.face.set('fear', 3); this.speak(p, 'scared', 1); }
            else if (k === 'report') { const ax = p.x - player.x, az = p.z - player.z, d = Math.hypot(ax, az) || 1; this.react(p, 'report', 7, { fleeDir: [ax / d, az / d] }); p.ch.face.set('angry', 3); }
            else { this.react(p, 'shrugOff', 1.4); p.ch.anim.set('shrug'); p.ch.face.set('concern', 2); }
          }
          break; }
        case 'confront': { // face the player, step closer, gesture; back off if the player leaves
          p.timer -= dt; const dx = player.x - p.x, dz = player.z - p.z, d = Math.hypot(dx, dz); p.yaw = dampAngle(p.yaw, Math.atan2(dx, dz), 5, dt); avoid = false;
          if (d > 1.5 && d < 6) { tx = player.x; tz = player.z; desired = 1.1; } if (d > 9) p.timer = Math.min(p.timer, 0.3);
          if (p.timer <= 0) { p.ch.face.mood = 'neutral'; this.endReaction(p); } break; }
        case 'complain': { // complain over the shoulder while walking away
          p.timer -= dt; const ax = p.x - player.x, az = p.z - player.z, d = Math.hypot(ax, az) || 1; tx = p.x + ax / d * 4; tz = p.z + az / d * 4; desired = p.pace * 1.1; p.ch.anim.look = clamp(wrapAngle(Math.atan2(-ax, -az) - p.yaw), -1.3, 1.3) * (Math.sin(p.rt * 2) > 0 ? 1 : 0.3);
          if (p.timer <= 0) this.endReaction(p); break; }
        case 'shrugOff': { p.timer -= dt; desired = 0; if (p.timer <= 0) { if (this.rng.chance(0.4)) this.speak(p, 'okay'); this.endReaction(p); } break; }
        case 'argue': { p.timer -= dt; desired = 0; avoid = false; p.yaw = dampAngle(p.yaw, Math.atan2(player.x - p.x, player.z - p.z), 5, dt); if (p.timer <= 0) this.endReaction(p); break; }
        case 'talkPlayer': { desired = 0; avoid = false; p.yaw = dampAngle(p.yaw, Math.atan2(player.x - p.x, player.z - p.z), 5, dt); p.ch.anim.look = 0; p.timer -= dt; if (p.timer <= 0) this.endReaction(p); break; }
      }
      // rain: umbrella or shelter
      if (this.rain && (p.state === 'walk' || p.state === 'toPoi')) { if (p.umbrella) { p.umbrellaOpen = true; if (p.ch.anim.action !== 'umbrella') p.ch.anim.set('umbrella'); } else if (this.rng.chance(dt * 0.15)) { const sh = this.nearPOIs(p.x, p.z, 25).find((q) => q.type === 'busStop' || q.type === 'shop' || q.type === 'door'); if (sh) { p.state = 'shelter'; p.target = { x: sh.x, z: sh.z }; p.timer = 40; p.ch.face.set('concern', 2); } } }
      else if ((!this.rain || !this.isRoutine(p.state)) && p.umbrellaOpen) { p.umbrellaOpen = false; if (p.ch.anim.action === 'umbrella') p.ch.anim.set(null); }
      if (p.umbrellaOpen && !p.umbrellaMesh) { p.umbrellaMesh = umbrellaMesh(p.id); p.ch.bones.handR.add(p.umbrellaMesh); } else if (!p.umbrellaOpen && p.umbrellaMesh) { p.umbrellaMesh.parent.remove(p.umbrellaMesh); p.umbrellaMesh = null; }
      // --- player proximity: staggered glances, annoyance at sprinting past (per-ped delays, no setTimeout)
      const pd = Math.hypot(player.x - p.x, player.z - p.z);
      if (!pv && pd < 3.5 && this.isRoutine(p.state) && p.react <= 0) {
        p.react = 3 + this.rng.next() * 4;
        if (player.sprinting && pd < 1.6) { p.pending = { t: 0.2 + p.id * 0.8, sev: 0, x: player.x, z: player.z, d: pd }; p.lookT = 1.5; p.lookAtPt = null; if (this.rng.chance(0.5)) this.speak(p, 'annoyed'); p.ch.face.set('angry', 1.5); }
        else if (this.rng.chance(0.25)) { p.lookT = 1.2 + this.rng.next() * 1.5; p.lookAtPt = null; if (this.rng.chance(0.3)) p.ch.face.set('smile', 1.2); }
      }
      if (p.lookT > 0) { p.lookT -= dt; const L2 = p.lookAtPt || player; p.ch.anim.look = clamp(wrapAngle(Math.atan2(L2.x - p.x, L2.z - p.z) - p.yaw), -1.2, 1.2); } else if (p.state !== 'idle' && p.state !== 'recover' && p.state !== 'complain') p.ch.anim.look *= 0.9;
      // --- steering: seek → anticipatory avoidance (keep left) → walls → smoothed acceleration
      let dvx = 0, dvz = 0; const fx0 = Math.sin(p.yaw), fz0 = Math.cos(p.yaw);
      if (tx !== null && desired > 0) { const dx = tx - p.x, dz = tz - p.z; const d = Math.hypot(dx, dz) || 1; dvx = (dx / d) * desired; dvz = (dz / d) * desired; }
      p.vx = p.vx || 0; p.vz = p.vz || 0;
      let blockedBy = null;
      if (lod < 3 && avoid && desired > 0) {
        const dir = [dvx / desired, dvz / desired]; const lx = dir[1], lz = -dir[0]; // own left
        let slow = 1, side = 0; const gi = Math.floor(p.x / 2), gj = Math.floor(p.z / 2);
        const consider = (o, ox, oz, ovx, ovz, rad) => {
          const rx = ox - p.x, rz = oz - p.z; const d = Math.hypot(rx, rz); if (d > 4.5 || d < 1e-4) return;
          const ahead = rx * dir[0] + rz * dir[1]; if (ahead < -0.3) return;
          // time to closest approach
          const wvx = ovx - dvx, wvz = ovz - dvz; const w2 = wvx * wvx + wvz * wvz; const tca = w2 > 1e-4 ? clamp(-(rx * wvx + rz * wvz) / w2, 0, 3) : 0;
          const cx = rx + wvx * tca, cz = rz + wvz * tca; const miss = Math.hypot(cx, cz);
          if (miss < rad && tca < 2.5) { const lat = rx * lx + rz * lz; const k = (1 - tca / 2.5) * (rad - miss) / rad; side += (lat > 0.05 ? -1 : 1) * k * 1.4 + 0.5 * k; // pass on the left
            const sameDir = (ovx * dir[0] + ovz * dir[1]); if (ahead < 1.3 && Math.abs(lat) < 0.55) { slow = Math.min(slow, sameDir > 0.2 ? clamp(sameDir / desired, 0.2, 1) : clamp((d - 0.55) / 0.9, 0, 1)); if (slow < 0.35) blockedBy = o; } }
          if (d < rad * 0.9) { dvx -= rx / d * (rad * 0.9 - d) * 2.5; dvz -= rz / d * (rad * 0.9 - d) * 2.5; }
        };
        for (let i = gi - 2; i <= gi + 2; i++) for (let j = gj - 2; j <= gj + 2; j++) { const a = grid.get(i * 10000 + j); if (!a) continue; for (const o of a) if (o !== p) consider(o, o.x, o.z, o.vx || 0, o.vz || 0, 0.75); }
        if (!pv) consider(player, player.x, player.z, Math.sin(player.yaw) * (player.speed || 0), Math.cos(player.yaw) * (player.speed || 0), 0.85);
        dvx = dvx * slow + lx * side * desired * 0.8; dvz = dvz * slow + lz * side * desired * 0.8;
        // wall feeler: probe ahead; if solid, steer to the freer side
        if (lod === 1 || (this.frame + (p.id * 13 | 0)) % 3 === 0) {
          const fl = 0.85; const ahx = p.x + dir[0] * fl, ahz = p.z + dir[1] * fl;
          if (this.collision.blocked(ahx, ahz, 0.25)) { const L1 = !this.collision.blocked(p.x + (dir[0] + lx) * 0.7, p.z + (dir[1] + lz) * 0.7, 0.25), R1 = !this.collision.blocked(p.x + (dir[0] - lx) * 0.7, p.z + (dir[1] - lz) * 0.7, 0.25); const s2 = L1 && !R1 ? 1 : R1 && !L1 ? -1 : (p.wallSide || 1); p.wallSide = s2; dvx += lx * s2 * desired; dvz += lz * s2 * desired; }
        }
      }
      // vehicles: steer around and never overlap (moving or parked)
      if (p.state !== 'down') for (const v of vnear) { if (Math.abs(v.x - p.x) > 7 || Math.abs(v.z - p.z) > 7) continue; for (const [cx, cz] of v.circles()) { const dx = p.x - cx, dz = p.z - cz; const d = Math.hypot(dx, dz), m = v.radius + 0.3; if (d < m + 0.8 && d > 1e-4 && desired > 0) { const k = (m + 0.8 - d) / 0.8; dvx += dx / d * k * 1.6; dvz += dz / d * k * 1.6; } if (d < m && d > 1e-4) { p.x = cx + dx / d * m; p.z = cz + dz / d * m; } } }
      if (p.stuckSide > 0) { p.stuckSide -= dt; dvx = p.sideDir[0] * 1.0; dvz = p.sideDir[1] * 1.0; }
      // smoothed acceleration (people do not change velocity instantly)
      const dsx = dvx - p.vx, dsz = dvz - p.vz; const dl = Math.hypot(dsx, dsz); const curSp = Math.hypot(p.vx, p.vz), tgtSp = Math.hypot(dvx, dvz);
      const maxDv = (tgtSp < curSp ? Math.max(accel, 3.5) : accel) * dt * (lod === 1 ? 1 : 1);
      if (dl > maxDv) { p.vx += dsx / dl * maxDv; p.vz += dsz / dl * maxDv; } else { p.vx = dvx; p.vz = dvz; }
      const sp = Math.hypot(p.vx, p.vz); const prevYaw = p.yaw;
      if (sp > 0.05) { const turnK = p.state === 'flee' || p.state === 'dodge' ? 9 : 5; if (p.state !== 'down' && p.state !== 'stumble') p.yaw = dampAngle(p.yaw, Math.atan2(p.vx, p.vz), turnK * clamp(sp, 0.4, 1.5), dt); }
      const ox = p.x, oz = p.z; p.x += p.vx * dt; p.z += p.vz * dt;
      // collision every frame near the camera, every 2nd at mid range, every 4th far
      if (sp > 0.02 && (lod === 1 || (this.frame + (p.id * 10 | 0)) % (lod === 2 ? 2 : 4) === 0)) { const r = this.collision.resolveCircle(p.x, p.z, 0.28, p.y || 0.15, 0.3); if (r.hit) { const cx = r.x - p.x, cz = r.z - p.z, cl = Math.hypot(cx, cz); if (cl > 1e-4) { const vn = (p.vx * cx + p.vz * cz) / cl; if (vn < 0) { p.vx -= cx / cl * vn; p.vz -= cz / cl * vn; } } } p.x = r.x; p.z = r.z; }
      const moved = Math.hypot(p.x - ox, p.z - oz) / Math.max(dt, 1e-4); p.speed = moved;
      // --- stuck detection & staged recovery: sidestep → rejoin graph → new route → (off-screen only) recycle
      if (desired > 0.3 && p.state !== 'confront') {
        if (moved < desired * 0.25 && !(blockedBy && blockedBy !== player && p.stuckT < 3)) p.stuckT = (p.stuckT || 0) + dt; else p.stuckT = Math.max(0, (p.stuckT || 0) - dt * 2);
        if (blockedBy === player) { p.blockT = (p.blockT || 0) + dt; if (p.blockT > 1.4) { p.blockT = -4; this.speak(p, 'excuse', 0); p.ch.face.set('concern', 1.5); p.lookT = 1.2; p.lookAtPt = null; } } else p.blockT = Math.max(0, (p.blockT || 0) - dt);
        if (p.stuckT > 1.3) {
          p.stuckT = 0; p.stuckN = (p.stuckN || 0) + 1; const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
          if (p.stuckN === 1) { const sL = !this.collision.blocked(p.x + fz * 0.8, p.z - fx * 0.8, 0.25); p.sideDir = sL ? [fz, -fx] : [-fz, fx]; p.stuckSide = 0.8; }
          else if (p.stuckN === 2) { if (p.state === 'toPoi' && p.poi) { p.poi.used = Math.max(0, p.poi.used - 1); p.poi = null; } this.returnToGraph(p, true); }
          else if (p.stuckN === 3) { if (this.isRoutine(p.state)) { this.pickNext(p); } else this.endReaction(p); }
          else { const vis = this.visible(p); if (!vis && !p.keep) p.recycle = true; else { p.stuckN = 1; this.returnToGraph(p, true); } }
        }
      } else p.stuckT = 0;
      // idle animation variety while walking (phone/texting walkers)
      if (p.state === 'walk' && !p.act && this.rng.chance(dt * 0.01)) p.act = this.rng.chance(0.5) ? 'text' : 'phone';
      if (p.state === 'walk' && p.act && this.rng.chance(dt * 0.05)) { p.act = null; p.ch.anim.set(null); }
      // animate (lower rate when far); pass the real turn rate for lean
      const turnRate = wrapAngle(p.yaw - prevYaw) / Math.max(dt, 1e-4);
      if (lod === 1 || (this.frame + (p.id * 7 | 0)) % lod === 0) p.ch.anim.update(dt * (lod === 1 ? 1 : lod), p.state === 'down' ? 0 : sp, lod === 1 ? turnRate : 0);
      p.y = lod === 1 ? this.collision.groundAt(p.x, p.z, (p.y || 0.15)) : (p.y || 0.15);
      p.ch.root.position.set(p.x, p.y, p.z); p.ch.root.rotation.y = p.yaw;
      p.ch.mesh.castShadow = dist < 45;
    }
  }
  visible(p) { const f = this.focus, c = this.camDir; const dx = p.x - f.x, dz = p.z - f.z, d = Math.hypot(dx, dz); if (d > 60) return false; if (!c) return true; return (dx * c.x + dz * c.z) / (d || 1) > 0.2 || d < 12; }
  startPoi(p) {
    const q = p.poi; p.state = 'idle'; p.timer = this.rng.range(8, 30); p.yaw = q.rot ?? p.yaw;
    const A = p.ch.anim;
    switch (q.type) {
      case 'bench': A.set('sit'); p.sit = true; p.timer = this.rng.range(15, 45); break;
      case 'shop': A.set(this.rng.chance(0.6) ? 'browse' : 'look'); break;
      case 'vendor': A.set(q.cart ? 'talk' : 'browse'); p.timer = q.cart ? 120 : 15; break;
      case 'busStop': A.set(this.rng.weighted([['phone', 2], ['text', 2], ['look', 2], [null, 2]])); p.timer = this.rng.range(20, 60); break;
      case 'chat': A.set('talk'); p.timer = this.rng.range(15, 40); { const others = this.peds.filter((o) => o !== p && o.poi === q); if (others.length) p.lookAt = others[0]; } break;
      case 'lawn': A.set(this.rng.weighted([['stretch', 1], ['sit', 2], ['phone', 1], ['photo', 0.6], ['dance', 0.3]])); p.sit = A.action === 'sit'; break;
      case 'door': A.set(null); p.timer = 2; this.enterBuilding(p); break;
      default: A.set(this.rng.weighted(IDLE_ACTS));
    }
  }
  enterBuilding(p) { // fade into the doorway; respawn logic will replace them
    p.state = 'idle'; p.timer = 1.0; p.vanish = true; setTimeout(() => { const i = this.peds.indexOf(p); if (i >= 0) { this.despawn(p); this.peds.splice(i, 1); } }, 900);
  }
  returnToGraph(p, needClear = false) {
    const cand = []; for (const n of this.nodesNear(p.x, p.z, 60)) { const d = (n.x - p.x) ** 2 + (n.z - p.z) ** 2; cand.push([d, n]); }
    if (!cand.length) for (const n of L.pedNodes) if (this.comp[n.id] === this.mainComp) cand.push([(n.x - p.x) ** 2 + (n.z - p.z) ** 2, n]);
    cand.sort((a, b) => a[0] - b[0]); let best = cand[0] && cand[0][1];
    for (const [, n] of cand.slice(0, 8)) { let ok = true; for (const t of [0.33, 0.66]) if (this.collision.blocked(lerp(p.x, n.x, t), lerp(p.z, n.z, t), 0.25)) { ok = false; break; } if (ok && (!needClear || Math.hypot(n.x - p.x, n.z - p.z) > 0.8)) { best = n; break; } }
    if (best) { p.node = best.id; p.nextNode = best.id; p.target = { x: best.x, z: best.z }; p.state = 'walk'; p.edge = null; }
  }
  knock(p, fx, fz, speed) {
    if (p.state === 'down') return; this.react(p, 'down', 2.4 + Math.min(3, speed * 0.2), { yaw: Math.atan2(-fx, -fz) }); p.downT = 0; p.knockedByCar = true;
    p.vx = fx * Math.min(5, speed * 0.4); p.vz = fz * Math.min(5, speed * 0.4); p.ch.face.set('fear', 4);
    this.events.emit('pedHit', p); this.speak(p, 'scared', 2); this.alarm(p.x, p.z, 14, 1, p);
  }
  // ---- player-initiated interactions
  nearest(x, z, r = 2.5) { let b = null, bd = r * r; for (const p of this.peds) { if (p.state === 'down') continue; const d = (p.x - x) ** 2 + (p.z - z) ** 2; if (d < bd) { bd = d; b = p; } } return b; }
  interact(p, kind, player) {
    const face = p.ch.face; p.talkCd = 0;
    if (kind === 'talk') { this.react(p, 'talkPlayer', 4); p.ch.anim.set('talk'); face.set('smile', 1.5); this.speak(p, this.rng.chance(0.3) ? 'directions' : 'greet', 1, 2.5); }
    else if (kind === 'wave') { this.react(p, 'talkPlayer', 2.5); p.ch.anim.set('wave'); face.set('smile', 2.5); this.speak(p, 'greet', 1); }
    else if (kind === 'insult') { if (this.rng.chance(0.6) && p.sp.age !== 'child' && p.sp.age !== 'elder') { this.react(p, 'argue', 4); p.ch.anim.set('argue'); face.set('angry', 4); this.speak(p, 'annoyed', 1, 2.5); } else { const ax = p.x - player.x, az = p.z - player.z, d = Math.hypot(ax, az) || 1; this.react(p, 'flee', 3, { fleeDir: this.spread(ax / d, az / d, 0.5), fleeSp: 2.6 }); face.set('fear', 2); this.speak(p, 'scared', 1); } }
    else if (kind === 'shove') {
      const dx = p.x - player.x, dz = p.z - player.z, d = Math.hypot(dx, dz) || 1;
      this.react(p, 'stumble', 0.75 + this.rng.next() * 0.35); p.vx = dx / d * 2.4; p.vz = dz / d * 2.4; p.ch.anim.set('stumble'); face.set('surprise', 1.2);
      this.alarm(p.x, p.z, 12, 1, p);
    }
    else if (kind === 'photo') { if (this.rng.chance(0.6)) { this.react(p, 'talkPlayer', 3); p.ch.anim.set(this.rng.chance(0.5) ? 'wave' : 'handsup'); face.set('smile', 3); } }
  }
  // a weapon is pointed at this pedestrian: hands up and freeze, back away, or run — varied, never a herd
  threaten(p, src) {
    if (!p || p.state === 'down' || p.state === 'flee' || p.state === 'cower' || p.threatCd > performance.now()) return; p.threatCd = performance.now() + 2500;
    const ax = p.x - src.x, az = p.z - src.z, d = Math.hypot(ax, az) || 1; const r = this.rng.next();
    p.ch.face.set('fear', 4); p.lookAt = { x: src.x, z: src.z };
    if (r < 0.45) { this.react(p, 'cower', 2.5 + this.rng.next() * 2.5, { after: 'flee', fleeDir: this.spread(ax / d, az / d, 0.6) }); p.ch.anim.set('handsup'); this.speak(p, 'scared', 2, 2.5); }
    else if (r < 0.8 || d < 4) { this.react(p, 'flee', 5 + this.rng.next() * 4, { fleeDir: this.spread(ax / d, az / d, 0.6), fleeSp: 3.4 + this.rng.next() * 1.4 }); this.speak(p, 'panic', 2); }
    else { this.react(p, 'report', 6); }
    this.alarm(p.x, p.z, 9, 1, p);
  }
  // turn an existing character (e.g. a driver pulled out of a vehicle) into a pedestrian with a reaction
  adopt(ch, x, z, yaw, reaction = 'flee', from = null) {
    this.scene.add(ch.root); ch.root.position.set(x, this.collision.groundAt(x, z, 0.5), z); ch.root.rotation.set(0, yaw, 0); ch.anim.set(null); ch.mesh.castShadow = true;
    const sp = ch.spec; const p = { ch, x, z, yaw, speed: 0, state: 'walk', node: 0, target: { x, z }, edge: null, lat: 0, pace: 1.3, timer: 0, act: null, react: 0, mood: 0, talkCd: 0, umbrella: false, crossing: false, id: this.rng.next(), sp, temper: reaction === 'confront' ? 0.9 : 0.3, vx: 0, vz: 0, stuckT: 0, stuckN: 0 };
    this.returnToGraph(p); this.peds.push(p); p.y = ch.root.position.y;
    const ax = from ? x - from.x : -Math.sin(yaw), az = from ? z - from.z : -Math.cos(yaw), d = Math.hypot(ax, az) || 1;
    if (reaction === 'confront') { this.react(p, 'confront', 4); p.ch.anim.set('argue'); ch.face.set('angry', 4); this.speak(p, 'shoved', 2, 2.5); }
    else { this.react(p, 'flee', 4 + this.rng.next() * 3, { fleeDir: this.spread(ax / d, az / d, 0.5), fleeSp: 3.2 }); ch.face.set('fear', 3); this.speak(p, 'scared', 2); }
    this.alarm(x, z, 14, 1, p); return p;
  }
  despawn(p) { if (p.poi) p.poi.used = Math.max(0, p.poi.used - 1); this.scene.remove(p.ch.root); p.ch.dispose(); }
  clear() { for (const p of this.peds) this.despawn(p); this.peds = []; }
}
let umbrellaGeos = null;
function umbrellaMesh(seed) {
  if (!umbrellaGeos) { const can = new THREE.ConeGeometry(0.55, 0.22, 10, 1, true); can.translate(0, 0.62, 0); const stick = new THREE.CylinderGeometry(0.008, 0.008, 0.72, 4); stick.translate(0, 0.25, 0); umbrellaGeos = { can, stick, mats: ['#1a1a1a', '#1d3f8a', '#8c1c2c', '#2a5a3a', '#6a2a7a'].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, side: THREE.DoubleSide })) }; }
  const g = new THREE.Group(); const m = new THREE.Mesh(umbrellaGeos.can, umbrellaGeos.mats[Math.floor(seed * 5) % 5]); m.castShadow = true; g.add(m, new THREE.Mesh(umbrellaGeos.stick, umbrellaGeos.mats[0])); g.position.set(0, -0.05, 0.02); g.rotation.x = 2.4; // hand axis in the umbrella pose → canopy points up
  return g;
}
