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
      const p = { ch, x: n.x + this.rng.range(-1, 1), z: n.z + this.rng.range(-1, 1), yaw: this.rng.range(-3, 3), speed: 0, state: 'walk', node: n.id, target: null, edge: null, lat: this.rng.range(-0.6, 0.6), pace: this.rng.range(1.15, 1.5) * (sp.age === 'elder' ? 0.75 : sp.age === 'child' ? 1.05 : 1), timer: 0, act: null, react: 0, mood: 0, talkCd: 0, umbrella: this.rng.chance(0.5), crossing: false, id: this.rng.next(), sp };
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
  update(dt, focus, camDir, ctx) {
    this.t += dt; this.frame++; this.simTime = ctx.simTime; this.vehicles = ctx.vehicles; this.rain = ctx.rain > 0.4; this.night = ctx.night;
    const player = ctx.player;
    // spawn / despawn
    for (let i = this.peds.length - 1; i >= 0; i--) { const p = this.peds[i]; if (Math.hypot(p.x - focus.x, p.z - focus.z) > 165 && !p.keep) { this.despawn(p); this.peds.splice(i, 1); } }
    const want = Math.round(this.max * (ctx.hourFactor ?? 1) * (this.rain ? 0.65 : 1));
    let budget = 2; while (this.peds.length < want && budget-- > 0) this.spawn(focus, camDir, this.peds.length < want * 0.5);
    // separation grid
    const grid = new Map(); for (const p of this.peds) { const k = Math.floor(p.x / 3) * 10000 + Math.floor(p.z / 3); let a = grid.get(k); if (!a) grid.set(k, (a = [])); a.push(p); }
    const pv = player.vehicle;
    for (const p of this.peds) {
      const dist = Math.hypot(p.x - focus.x, p.z - focus.z); const lod = dist > 70 ? 3 : dist > 40 ? 2 : 1;
      p.talkCd -= dt; p.react -= dt;
      let desired = 0; let tx = null, tz = null;
      // --- threats: player vehicle approaching fast, or player sprinting into them
      if (pv && Math.abs(pv.speed) > 4) {
        const dx = p.x - pv.x, dz = p.z - pv.z; const d = Math.hypot(dx, dz); const fx = Math.sin(pv.yaw), fz = Math.cos(pv.yaw);
        const along = dx * fx + dz * fz, lat = Math.abs(dx * fz - dz * fx);
        if (d < pv.half + 0.6 && lat < pv.T.wid / 2 + 0.3) { this.knock(p, fx * Math.sign(pv.speed), fz * Math.sign(pv.speed), Math.abs(pv.speed)); }
        else if (along > 0 && along < 14 && lat < 3.2 && p.state !== 'down' && p.state !== 'flee') { p.state = 'dodge'; p.timer = 1.2; const side = (dx * fz - dz * fx) > 0 ? 1 : -1; p.dodge = [fz * side, -fx * side]; p.ch.anim.set(this.rng.chance(0.5) ? 'cower' : null); this.say(p, 'scared', 1); this.events.emit('pedPanic', p); }
      }
      switch (p.state) {
        case 'walk': case 'toPoi': {
          tx = p.target.x; tz = p.target.z; desired = p.pace * (this.rain && !p.umbrellaOpen ? 1.35 : 1);
          if (p.act && p.ch.anim.action !== p.act) p.ch.anim.set(p.act);
          const d = Math.hypot(tx - p.x, tz - p.z);
          if (d < 0.6) {
            if (p.state === 'toPoi') this.startPoi(p);
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
          p.timer -= dt; desired = 0; if (p.poi) p.yaw = dampAngle(p.yaw, p.poi.rot ?? p.yaw, 4, dt);
          if (p.lookAt) p.yaw = dampAngle(p.yaw, Math.atan2(p.lookAt.x - p.x, p.lookAt.z - p.z), 3, dt);
          if (p.poi && p.poi.type === 'busStop' && this.rng.chance(dt * 0.01)) this.say(p, 'bus');
          if (p.poi && p.poi.type === 'chat' && this.rng.chance(dt * 0.02) && dist < 25) this.say(p, 'chat');
          if (p.poi && p.poi.type === 'vendor' && this.rng.chance(dt * 0.03) && dist < 20) this.say(p, 'vendor');
          if (p.timer <= 0) { if (p.poi) { p.poi.used = Math.max(0, p.poi.used - 1); p.poi = null; } p.lookAt = null; p.ch.anim.set(null); p.act = null; p.sit = false; this.pickNext(p); }
          break;
        }
        case 'dodge': { p.timer -= dt; tx = p.x + p.dodge[0] * 3; tz = p.z + p.dodge[1] * 3; desired = 4.5; if (p.timer <= 0) { p.state = this.rng.chance(0.4) ? 'flee' : 'walk'; p.timer = 4; p.ch.anim.set(null); if (p.state === 'walk') this.returnToGraph(p); } break; }
        case 'flee': { p.timer -= dt; const ax = p.x - (player.x), az = p.z - (player.z); const d = Math.hypot(ax, az) || 1; tx = p.x + ax / d * 5; tz = p.z + az / d * 5; desired = 4.2; if (p.timer <= 0) { p.state = 'walk'; this.returnToGraph(p); } break; }
        case 'down': { p.timer -= dt; desired = 0; const k = clamp(1 - Math.abs(p.timer - 1.6) / 1.6, 0, 1); p.ch.mesh.rotation.x = -Math.min(1.45, (2.4 - p.timer) * 4) * (p.timer > 0.6 ? 1 : p.timer / 0.6); p.ch.mesh.position.y = 0.12 * (p.timer > 0.6 ? 1 : p.timer / 0.6); void k; if (p.timer <= 0) { p.ch.mesh.rotation.x = 0; p.ch.mesh.position.y = 0; p.state = this.rng.chance(0.5) ? 'flee' : 'argue'; p.timer = 4; if (p.state === 'argue') { p.ch.anim.set('argue'); this.say(p, 'annoyed', 1); } else this.say(p, 'scared', 1); } break; }
        case 'argue': { p.timer -= dt; desired = 0; p.yaw = dampAngle(p.yaw, Math.atan2(player.x - p.x, player.z - p.z), 5, dt); if (p.timer <= 0) { p.ch.anim.set(null); p.state = 'walk'; this.returnToGraph(p); } break; }
        case 'talkPlayer': { desired = 0; p.yaw = dampAngle(p.yaw, Math.atan2(player.x - p.x, player.z - p.z), 5, dt); p.timer -= dt; if (p.timer <= 0) { p.ch.anim.set(null); p.state = 'walk'; this.returnToGraph(p); } break; }
        case 'shelter': { p.timer -= dt; desired = Math.hypot(p.target.x - p.x, p.target.z - p.z) > 0.6 ? 2.6 : 0; tx = p.target.x; tz = p.target.z; if (desired === 0 && p.ch.anim.action !== 'phone') p.ch.anim.set(this.rng.chance(0.5) ? 'phone' : 'look'); if (!this.rain || p.timer <= 0) { p.ch.anim.set(null); p.state = 'walk'; this.returnToGraph(p); } break; }
      }
      // rain: umbrella or shelter
      if (this.rain && (p.state === 'walk' || p.state === 'toPoi')) { if (p.umbrella) { p.umbrellaOpen = true; if (p.ch.anim.action !== 'umbrella') p.ch.anim.set('umbrella'); } else if (this.rng.chance(dt * 0.15)) { const sh = this.nearPOIs(p.x, p.z, 25).find((q) => q.type === 'busStop' || q.type === 'shop' || q.type === 'door'); if (sh) { p.state = 'shelter'; p.target = { x: sh.x, z: sh.z }; p.timer = 40; } } }
      else if (!this.rain && p.umbrellaOpen) { p.umbrellaOpen = false; if (p.ch.anim.action === 'umbrella') p.ch.anim.set(null); }
      // umbrella prop
      if (p.umbrellaOpen && !p.umbrellaMesh) { p.umbrellaMesh = umbrellaMesh(p.id); p.ch.bones.handR.add(p.umbrellaMesh); } else if (!p.umbrellaOpen && p.umbrellaMesh) { p.umbrellaMesh.parent.remove(p.umbrellaMesh); p.umbrellaMesh = null; }
      // --- player proximity reactions (staggered with a per-ped delay)
      const pd = Math.hypot(player.x - p.x, player.z - p.z);
      if (!pv && pd < 3.5 && p.state !== 'down' && p.react <= 0) {
        p.react = 3 + this.rng.next() * 4;
        if (player.sprinting && pd < 1.6) { setTimeout(() => { if (p.state === 'walk' || p.state === 'idle') { p.lookAt = { x: player.x, z: player.z }; this.say(p, 'annoyed'); } }, 200 + p.id * 900); }
        else if (this.rng.chance(0.25)) p.lookT = 1.5 + this.rng.next() * 1.5;
      }
      if (p.lookT > 0) { p.lookT -= dt; p.ch.anim.look = clamp(wrapAngle(Math.atan2(player.x - p.x, player.z - p.z) - p.yaw), -1.2, 1.2); } else p.ch.anim.look *= 0.9;
      // --- steering
      let vx = 0, vz = 0;
      if (tx !== null && desired > 0) { const dx = tx - p.x, dz = tz - p.z; const d = Math.hypot(dx, dz) || 1; vx = (dx / d) * desired; vz = (dz / d) * desired; }
      // separation
      if (lod < 3 && (vx || vz)) {
        const gi = Math.floor(p.x / 3), gj = Math.floor(p.z / 3);
        for (let i = gi - 1; i <= gi + 1; i++) for (let j = gj - 1; j <= gj + 1; j++) { const a = grid.get(i * 10000 + j); if (!a) continue; for (const o of a) { if (o === p) continue; const dx = p.x - o.x, dz = p.z - o.z; const d2 = dx * dx + dz * dz; if (d2 < 0.81 && d2 > 1e-4) { const d = Math.sqrt(d2); vx += (dx / d) * (0.9 - d) * 2.2; vz += (dz / d) * (0.9 - d) * 2.2; } } }
        if (!pv) { const dx = p.x - player.x, dz = p.z - player.z; const d2 = dx * dx + dz * dz; if (d2 < 1.2 && d2 > 1e-4) { const d = Math.sqrt(d2); vx += (dx / d) * (1.1 - d) * 3; vz += (dz / d) * (1.1 - d) * 3; } }
      }
      const sp = Math.hypot(vx, vz);
      if (sp > 0.05) { p.yaw = dampAngle(p.yaw, Math.atan2(vx, vz), 6, dt); p.x += vx * dt; p.z += vz * dt; }
      if (lod === 1 && sp > 0.05 && (this.frame + (p.id * 10 | 0)) % 4 === 0) { const r = this.collision.resolveCircle(p.x, p.z, 0.3, p.y || 0.15, 0.3); p.x = r.x; p.z = r.z; }
      p.speed = sp;
      // idle animation variety while walking (phone/texting walkers)
      if (p.state === 'walk' && !p.act && this.rng.chance(dt * 0.01)) p.act = this.rng.chance(0.5) ? 'text' : 'phone';
      if (p.state === 'walk' && p.act && this.rng.chance(dt * 0.05)) { p.act = null; p.ch.anim.set(null); }
      // animate (lower rate when far)
      if (lod === 1 || (this.frame + (p.id * 7 | 0)) % lod === 0) {
        p.ch.anim.update(dt * (lod === 1 ? 1 : lod), p.state === 'down' ? 0 : sp, 0);
        if (p.sit) p.ch.root.position.y = p.y + 0.0;
      }
      p.y = lod === 1 ? this.collision.groundAt(p.x, p.z, (p.y || 0.15)) : (p.y || 0.15);
      p.ch.root.position.set(p.x, p.y, p.z); p.ch.root.rotation.y = p.yaw;
      p.ch.mesh.castShadow = dist < 45;
    }
  }
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
  returnToGraph(p) { let best = null, bd = 1e9; for (const n of L.pedNodes) { if (this.comp[n.id] !== this.mainComp) continue; const d = (n.x - p.x) ** 2 + (n.z - p.z) ** 2; if (d < bd) { bd = d; best = n; } } if (best) { p.node = best.id; p.nextNode = best.id; p.target = { x: best.x, z: best.z }; p.state = 'walk'; p.edge = null; } }
  knock(p, fx, fz, speed) {
    if (p.state === 'down') return; p.state = 'down'; p.timer = 2.4; p.ch.anim.set(null); p.x += fx * Math.min(3, speed * 0.25); p.z += fz * Math.min(3, speed * 0.25); p.yaw = Math.atan2(-fx, -fz) + Math.PI;
    this.events.emit('pedHit', p); this.say(p, 'scared', 2);
  }
  // ---- player-initiated interactions
  nearest(x, z, r = 2.5) { let b = null, bd = r * r; for (const p of this.peds) { if (p.state === 'down') continue; const d = (p.x - x) ** 2 + (p.z - z) ** 2; if (d < bd) { bd = d; b = p; } } return b; }
  interact(p, kind, player) {
    if (kind === 'talk') { p.state = 'talkPlayer'; p.timer = 4; p.ch.anim.set('talk'); p.talkCd = 0; this.say(p, this.rng.chance(0.3) ? 'directions' : 'greet', 1); }
    else if (kind === 'wave') { p.state = 'talkPlayer'; p.timer = 2.5; p.ch.anim.set('wave'); p.talkCd = 0; this.say(p, 'greet', 1); }
    else if (kind === 'insult') { p.talkCd = 0; if (this.rng.chance(0.6) && p.sp.age !== 'child' && p.sp.age !== 'elder') { p.state = 'argue'; p.timer = 4; p.ch.anim.set('argue'); this.say(p, 'annoyed', 1); } else { p.state = 'flee'; p.timer = 3; this.say(p, 'scared', 1); } }
    else if (kind === 'shove') { p.talkCd = 0; const dx = p.x - player.x, dz = p.z - player.z, d = Math.hypot(dx, dz) || 1; p.x += dx / d * 0.6; p.z += dz / d * 0.6; p.ch.anim.set('stumble'); p.state = 'argue'; p.timer = 3.5; setTimeout(() => { if (p.state === 'argue') p.ch.anim.set(this.rng.chance(0.5) ? 'argue' : 'point'); }, 700); this.say(p, 'shoved', 1); if (this.rng.chance(0.3)) setTimeout(() => { p.state = 'flee'; p.timer = 3; }, 1500); }
    else if (kind === 'photo') { if (this.rng.chance(0.6)) { p.state = 'talkPlayer'; p.timer = 3; p.ch.anim.set(this.rng.chance(0.5) ? 'wave' : 'handsup'); } }
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
