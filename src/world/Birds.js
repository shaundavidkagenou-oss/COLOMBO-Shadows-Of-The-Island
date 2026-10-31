// Birds of Colombo: house crows (everywhere), rock pigeons (Galle Face, Fort, plazas, roof edges) and rose-ringed
// parakeets (parks and tree-lined streets). Models: BirdModels.js (articulated, instanced: 9 parts × 3 species = 27 draw
// calls for any number of birds). Behaviour per bird: walk / peck / look about on the ground, perch on wall tops,
// parapets and tree crowns, take off when the player, a moving vehicle or gunfire comes near (flocks go up together),
// fly with species-specific flapping (crows flap-glide, pigeons clatter up, parakeets dash in fast straight lines),
// flare and land. Night: they roost and only move if disturbed. Indoors: hidden.
import * as THREE from 'three';
import * as L from './Layout.js';
import { plan } from './CityPlan.js';
import { SPECIES, birdParts, PART_NAMES } from './BirdModels.js';
import { crownPoints } from './TreeShapes.js';

const SP = ['crow', 'pigeon', 'parakeet'];
const MAXN = { crow: 26, pigeon: 34, parakeet: 14 };
const PIGEON_SPOTS = [[-470, -440, 150], [-385, -903, 90], [-35, -645, 70], [-112, -300, 60], [245, -30, 70], [-128, -893, 80], [90, 110, 60]]; // Galle Face, clock tower, Fort station, Seema Malaka, Town Hall, Pettah, museum
const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const rnd = (a, b) => a + Math.random() * (b - a);

// ------------------------------------------------------------------ posing (pure): pose → 9 local part matrices in world space
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();
const MX = new THREE.Matrix4().makeScale(-1, 1, 1);
const FOLD = {}; // per species: folded wing basis quaternion + pivots
function foldData(sp) {
  if (FOLD[sp]) return FOLD[sp]; const S = SPECIES[sp]; const P = birdParts(sp); P.body.computeBoundingBox(); const rx = P.body.boundingBox.max.x;
  const X = new THREE.Vector3(-0.17, -0.1, -1).normalize(); const Zr = new THREE.Vector3(-0.38, 1, 0).normalize(); const Z = Zr.sub(X.clone().multiplyScalar(Zr.dot(X))).normalize(); const Y = new THREE.Vector3().crossVectors(Z, X);
  const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z)); const out = Y.clone().negate();
  return (FOLD[sp] = { q, pivot: new THREE.Vector3(rx + 0.004, S.shoulder[1] + 0.006, S.shoulder[2]), out, X });
}
// writes 11 matrices (PART_NAMES order) into `mats`. spread < 0.5: the folded-wing meshes; above: the articulated open wings unfold
export function poseBird(sp, p, mats) {
  const S = SPECIES[sp]; const F = foldData(sp); const open = p.spread >= 0.5; const sprd = open ? Math.min(1, (p.spread - 0.5) * 2) : 0;
  const body = mats[0]; _e.set(p.pitch, p.yaw, p.roll, 'YXZ'); _q.setFromEuler(_e); body.compose(_v.set(p.x, p.y, p.z), _q, _s.set(1, 1, 1));
  // head
  _e.set(p.headPitch, p.headYaw, 0, 'YXZ'); _q.setFromEuler(_e); _m.compose(_v.set(S.neck[0], S.neck[1] + (p.headUp || 0), S.neck[2] + (p.headFwd || 0)), _q, _s.set(1, 1, 1)); mats[1].multiplyMatrices(body, _m);
  // wings (left computed, right mirrored)
  const inL = new THREE.Matrix4(), outL = new THREE.Matrix4();
  { _e.set(0, p.sweep, p.flap, 'ZYX'); _q2.setFromEuler(_e); _q.copy(F.q).slerp(_q2, sprd); const piv = _v.set(S.shoulder[0], S.shoulder[1], S.shoulder[2]).lerp(F.pivot, 1 - sprd).clone();
    const sx = 0.55 + 0.45 * sprd, sz = 0.72 + 0.28 * sprd; inL.compose(piv, _q, _s.set(sx, 1, sz));
    const wrist = new THREE.Vector3(S.innerLen * sx, 0, 0).applyQuaternion(_q).add(piv).addScaledVector(F.out, 0.0035 * (1 - sprd));
    _e.set(0, p.sweepOut, p.flapOut, 'ZYX'); _q2.setFromEuler(_e); const qo = _q.clone().multiply(new THREE.Quaternion().slerp(_q2, sprd)); outL.compose(wrist, qo, _s.set(1, 1, 0.3 + 0.7 * sprd)); }
  if (!open) { inL.makeScale(0, 0, 0); outL.makeScale(0, 0, 0); }
  mats[9].copy(body); mats[10].copy(body); if (open) { mats[9].multiply(_m.makeScale(0, 0, 0)); mats[10].copy(mats[9]); }
  mats[2].multiplyMatrices(body, inL); mats[3].multiplyMatrices(body, outL);
  mats[4].multiplyMatrices(body, _m.multiplyMatrices(MX, inL).multiply(MX)); mats[5].multiplyMatrices(body, _m.multiplyMatrices(MX, outL).multiply(MX));
  // tail
  _e.set(p.tailPitch || 0, 0, 0, 'XYZ'); /* + raises the tail */ _q.setFromEuler(_e); _m.compose(_v.set(S.tail[0], S.tail[1], S.tail[2]), _q, _s.set(p.tailFan || 1, 1, 1)); mats[6].multiplyMatrices(body, _m);
  // legs: stay vertical in world while standing (compensate body pitch); tucked up and back in flight
  const tuck = p.tuck || 0; const legL = new THREE.Matrix4();
  for (const [k, sw, sx] of [[7, p.legL || 0, 1], [8, p.legR || 0, -1]]) { _e.set(-p.pitch + sw + tuck * 1.25, 0, 0, 'XYZ'); _q.setFromEuler(_e); const sc = 1 - tuck * 0.45; legL.compose(_v.set(S.hip[0] * sx, S.hip[1] + tuck * 0.012, S.hip[2]), _q, _s.set(sc, sc, sc)); mats[k].multiplyMatrices(body, legL); }
}
export function restPose(sp) { const S = SPECIES[sp]; return { x: 0, y: S.stand, z: 0, yaw: 0, pitch: S.pitch, roll: 0, spread: 0, flap: 0, sweep: 0, flapOut: 0, sweepOut: 0, headYaw: 0, headPitch: S.headPitch, headFwd: 0, tailPitch: sp === 'parakeet' ? 0.45 : 0, tailFan: sp === 'crow' ? 0.62 : 0.45, legL: 0, legR: 0, tuck: 0 }; }

// wing pose for a flap phase φ (0..1): downstroke 0..0.55, upstroke with the hand partly folded
export function flapPose(sp, ph, amp = 1) {
  const down = ph < 0.55; const k = down ? ph / 0.55 : (ph - 0.55) / 0.45; const e = 0.5 - 0.5 * Math.cos(Math.PI * k);
  const flap = (down ? 0.95 - 1.55 * e : -0.6 + 1.55 * e) * amp; const lag = (down ? 0.4 - 0.9 * e : -0.5 + 0.9 * e) * amp;
  return { flap, flapOut: lag * 0.6, sweep: down ? 0.05 : 0.25 * Math.sin(Math.PI * k) * amp, sweepOut: down ? 0.1 : 0.85 * Math.sin(Math.PI * k) * amp };
}

// ------------------------------------------------------------------ system
export class Birds {
  constructor(game) {
    this.g = game; this.root = new THREE.Group(); this.root.name = 'birds'; game.scene.add(this.root); this.birds = []; this.cd = 0; this.t = 0; this.mats = Array.from({ length: 11 }, () => new THREE.Matrix4()); this.stats = { spawned: 0, takeoffs: 0, landings: 0 };
    this.meshes = {}; this.count = {};
    for (const sp of SP) {
      const P = birdParts(sp); const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: SPECIES[sp].rough, metalness: 0, side: THREE.DoubleSide, envMapIntensity: sp === 'crow' ? 1.3 : 0.8 });
      this.meshes[sp] = PART_NAMES.map((n) => { const m = new THREE.InstancedMesh(P[n], mat, MAXN[sp]); m.count = 0; m.castShadow = true; m.receiveShadow = false; m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.name = `bird:${sp}:${n}`; this.root.add(m); return m; });
    }
    this.treeTop = {}; for (const t of ['palm', 'rain', 'mara', 'mango', 'jak', 'bo', 'frangipani']) { const pts = crownPoints(t); let my = 0; for (let i = 1; i < pts.length; i += 3) my = Math.max(my, pts[i]); this.treeTop[t] = my; }
    game.events?.on?.('gunshot', (e) => this.scare(e?.x ?? game.player.x, e?.z ?? game.player.z, 45));
  }
  // ---------------------------------------------------------------- spots
  habitat(sp, x, z) {
    if (sp === 'pigeon') return PIGEON_SPOTS.some(([px, pz, r]) => Math.hypot(x - px, z - pz) < r);
    if (sp === 'parakeet') { const zn = L.zoneAt ? L.zoneAt(x, z) : null; return (zn && /park|garden|green/i.test(zn.kind || zn.type || zn.name || '')) || /cinnamon|havelock/.test(L.districtIdAt(x, z) || ''); }
    return true;
  }
  groundSpot(x, z) { const C = this.g.collision; if (L.isWater(x, z) || L.roadAt(x, z) || C.blocked(x, z, 0.25)) return null; const y = C.groundAt ? C.groundAt(x, z, L.LAND_Y + 0.5) : L.groundY(x, z); if (!(Math.abs(y - L.groundY(x, z)) < 0.6)) return null; return { x, y, z, kind: 'ground' }; }
  perchSpot(sp, cx, cz, R) {
    const opts = [];
    if (sp !== 'pigeon') for (const t of plan.trees) { if (Math.abs(t.x - cx) > R || Math.abs(t.z - cz) > R) continue; if (sp === 'parakeet' || Math.random() < 0.5) opts.push(() => { const top = this.treeTop[t.type] || 9; return { x: t.x + rnd(-0.6, 0.6), y: L.LAND_Y + top * t.s * (t.sy || 1) * 0.97, z: t.z + rnd(-0.6, 0.6), kind: 'tree' }; }); }
    if (sp !== 'parakeet') {
      for (const w of plan.walls || []) { if (Math.abs((w.x0 + w.x1) / 2 - cx) > R || Math.abs((w.z0 + w.z1) / 2 - cz) > R) continue; opts.push(() => { const along = w.x1 - w.x0 > w.z1 - w.z0; const x = along ? rnd(w.x0 + 0.3, w.x1 - 0.3) : (w.x0 + w.x1) / 2, z = along ? (w.z0 + w.z1) / 2 : rnd(w.z0 + 0.3, w.z1 - 0.3); return { x, y: L.LAND_Y + w.h + 0.1, z, kind: 'wall', yaw: along ? (Math.random() < 0.5 ? Math.PI / 2 : -Math.PI / 2) : (Math.random() < 0.5 ? 0 : Math.PI) }; }); }
      for (const b of plan.buildings) { if (b.roof === 'tile' || Math.abs((b.x0 + b.x1) / 2 - cx) > R || Math.abs((b.z0 + b.z1) / 2 - cz) > R || b.h > 22) continue; opts.push(() => { const e = Math.floor(Math.random() * 4); const th = 0.125; const x = e < 2 ? rnd(b.x0 + 0.5, b.x1 - 0.5) : e === 2 ? b.x0 + th : b.x1 - th, z = e >= 2 ? rnd(b.z0 + 0.5, b.z1 - 0.5) : e === 0 ? b.z0 + th : b.z1 - th; return { x, y: L.LAND_Y + b.h + (b.style === 'villa' ? 0.5 : 0.9), z, kind: 'roof', yaw: [Math.PI, 0, -Math.PI / 2, Math.PI / 2][e] }; }); }
    }
    if (!opts.length) return null; return opts[Math.floor(Math.random() * opts.length)]();
  }
  // ---------------------------------------------------------------- spawning
  spawnAround(sp, P) {
    const cam = this.g.camera; const cd = new THREE.Vector3(); cam.getWorldDirection(cd);
    for (let tries = 0; tries < 12; tries++) {
      const a = Math.random() * Math.PI * 2, r = rnd(35, 105); const x = P.x + Math.cos(a) * r, z = P.z + Math.sin(a) * r; if (!this.habitat(sp, x, z)) continue;
      const vis = ((x - cam.position.x) * cd.x + (z - cam.position.z) * cd.z) / (Math.hypot(x - cam.position.x, z - cam.position.z) || 1) > 0.5 && r < 70; if (vis) continue; // appear out of view
      const night = this.g.atmos ? this.g.atmos.night : 0; const perch = sp === 'parakeet' || night > 0.5 || Math.random() < (sp === 'pigeon' ? 0.25 : 0.45);
      const spot = perch ? this.perchSpot(sp, x, z, 14) : this.groundSpot(x, z); if (!spot) continue;
      const flock = sp === 'pigeon' ? (spot.kind === 'ground' ? Math.floor(rnd(5, 11)) : Math.floor(rnd(2, 5))) : sp === 'parakeet' ? Math.floor(rnd(1, 4)) : Math.floor(rnd(1, 3));
      let made = 0; for (let k = 0; k < flock && this.countOf(sp) < MAXN[sp]; k++) {
        let s = spot; if (k > 0) { if (spot.kind === 'ground') s = this.groundSpot(spot.x + rnd(-2.5, 2.5), spot.z + rnd(-2.5, 2.5)); else s = spot.kind === 'tree' ? { ...spot, x: spot.x + rnd(-1.2, 1.2), z: spot.z + rnd(-1.2, 1.2) } : spot.kind === 'wall' || spot.kind === 'roof' ? this.alongEdge(spot, k) : null; }
        if (!s) continue; this.add(sp, s); made++;
      }
      if (made) return true;
    }
    return false;
  }
  alongEdge(s, k) { const d = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * rnd(0.35, 0.6); const ax = Math.abs(Math.sin(s.yaw || 0)) < 0.5 ? 1 : 0; return { ...s, x: s.x + (ax ? 0 : d), z: s.z + (ax ? d : 0) }; }
  countOf(sp) { let n = 0; for (const b of this.birds) if (b.sp === sp) n++; return n; }
  add(sp, spot) {
    const S = SPECIES[sp]; const b = { sp, S, x: spot.x, z: spot.z, y: spot.y + S.stand, yaw: spot.yaw ?? Math.random() * Math.PI * 2, pitch: S.pitch, roll: 0, state: spot.kind === 'ground' ? 'ground' : 'perch', spot, t: rnd(0, 5), act: 'idle', actT: rnd(0.5, 3), ph: Math.random(), walkPh: 0, head: { yaw: 0, pitch: S.headPitch, fwd: 0 }, vx: 0, vy: 0, vz: 0, speed: 0, spread: 0, tuck: 0, leave: rnd(20, 70), goal: null, alarm: 0 };
    this.birds.push(b); this.stats.spawned++; return b;
  }
  scare(x, z, r) { for (const b of this.birds) if (Math.hypot(b.x - x, b.z - z) < r && (b.state === 'ground' || b.state === 'perch')) { b.alarm = Math.max(b.alarm, 0.01 + Math.random() * 0.35); b.from = { x, z }; } }
  // ---------------------------------------------------------------- update
  update(dt) {
    const g = this.g; this.t += dt; const P = g.player; const indoor = !!g.indoor; this.root.visible = !indoor; if (indoor) return;
    const night = g.atmos ? g.atmos.night : 0; const rain = g.atmos && g.atmos.w ? g.atmos.w.rain : 0;
    // populations follow the player (fewer at night / in heavy rain)
    this.cd -= dt; if (this.cd <= 0) { this.cd = 0.4; const k = (night > 0.6 ? 0.45 : 1) * (1 - rain * 0.5);
      for (const sp of SP) { const want = Math.round(MAXN[sp] * k * (sp === 'crow' ? 0.8 : 1)); const have = this.countOf(sp); if (have > want + 3) { const P0 = P; const far = this.birds.find((b) => b.sp === sp && Math.hypot(b.x - P0.x, b.z - P0.z) > 60 && b.state !== 'fly'); if (far) far.state = 'gone'; } /* thin out (night, rain) away from the player */ if (have < want && (sp !== 'pigeon' || this.habitat('pigeon', P.x, P.z) || PIGEON_SPOTS.some(([x, z, r]) => Math.hypot(P.x - x, P.z - z) < r + 110))) this.spawnAround(sp, P); }
      this.birds = this.birds.filter((b) => Math.hypot(b.x - P.x, b.z - P.z) < 170); }
    // threats: the player (running = bigger bubble), moving vehicles
    const src = P.vehicle || P; const pSpeed = P.vehicle ? Math.abs(P.vehicle.speed) : P.speed || 0; const vehs = g.traffic ? g.traffic.vehicles : [];
    for (const b of this.birds) {
      const d = Math.hypot(b.x - src.x, b.z - src.z), dy = b.y - (src.y || 0);
      if (b.state === 'ground' || b.state === 'perch') {
        const bubble = b.S.flee * (pSpeed > 4 ? 1.6 : pSpeed > 1.8 ? 1.25 : 0.85) * (b.state === 'perch' ? 0.6 : 1) * (night > 0.6 ? 0.6 : 1);
        if (d < bubble && Math.abs(dy) < 4) { b.alarm = b.alarm || 0.02; b.from = { x: src.x, z: src.z }; }
        if (b.state === 'ground' && !b.alarm) for (const v of vehs) { if (Math.abs(v.x - b.x) > 9 || Math.abs(v.z - b.z) > 9 || Math.abs(v.speed || 0) < 2) continue; b.alarm = 0.05; b.from = { x: v.x, z: v.z }; break; }
      }
      this.step(b, dt, night);
    }
    // flock contagion: a bird taking off alarms its neighbours a moment later
    for (const b of this.birds) if (b.state === 'takeoff' && b.t < dt * 1.5) for (const o of this.birds) if (o !== b && o.sp === b.sp && !o.alarm && (o.state === 'ground' || o.state === 'perch') && Math.hypot(o.x - b.x, o.z - b.z) < 7) { o.alarm = rnd(0.08, 0.45); o.from = b.from; }
    this.render();
  }
  takeoff(b) { b.state = 'takeoff'; b.t = 0; b.alarm = 0; const away = b.from ? Math.atan2(b.x - b.from.x, b.z - b.from.z) : b.yaw; b.yaw = away + rnd(-0.6, 0.6); b.speed = 2; b.vy = b.sp === 'pigeon' ? 3.2 : 2.6; b.goal = null; this.stats.takeoffs++; }
  pickGoal(b) {
    const P = this.g.player; const sp = b.sp; const fromP = Math.atan2(b.x - P.x, b.z - P.z);
    for (let k = 0; k < 10; k++) {
      const a = (b.from ? fromP : b.yaw) + rnd(-1.3, 1.3), r = rnd(25, 75); const x = b.x + Math.sin(a) * r, z = b.z + Math.cos(a) * r; if (Math.hypot(x - P.x, z - P.z) < 18 || !this.habitat(sp, x, z) && sp !== 'crow') continue;
      const s = (sp === 'parakeet' || Math.random() < 0.55) ? this.perchSpot(sp, x, z, 12) : this.groundSpot(x, z); if (!s || Math.hypot(s.x - P.x, s.z - P.z) < 16) continue;
      const cruise = Math.max(s.y + 5, L.LAND_Y + rnd(10, 18)); const C = this.g.collision; if (C.raycast && C.raycast(b.x, cruise, b.z, s.x, cruise, s.z, 0.3) < 0.98) continue;
      return { ...s, cruise };
    }
    return null;
  }
  step(b, dt, night) {
    const S = b.S; b.t += dt;
    if (b.state === 'ground' || b.state === 'perch') {
      if (b.alarm) { b.alarm -= dt; if (b.alarm <= 0) { this.takeoff(b); return; } }
      b.leave -= dt * (night > 0.6 ? 0.1 : 1); if (b.leave <= 0) { b.leave = rnd(25, 80); b.from = null; this.takeoff(b); return; }
      b.actT -= dt; if (b.actT <= 0) { const r = Math.random(); b.act = b.state === 'perch' ? (r < 0.5 ? 'look' : r < 0.8 ? 'idle' : 'preen') : r < 0.35 ? 'walk' : r < 0.7 ? 'peck' : r < 0.85 ? 'look' : (S.hop ? 'hop' : 'walk'); b.actT = b.act === 'peck' ? rnd(1.2, 3) : rnd(1.5, 4.5); if (b.act === 'walk' || b.act === 'hop') { b.wyaw = b.yaw + rnd(-1.6, 1.6); } b.lookYaw = rnd(-1.1, 1.1); }
      b.spread = Math.max(0, b.spread - dt * 5); b.tuck = Math.max(0, b.tuck - dt * 4); b.speed = 0; let moving = 0;
      if (b.state === 'ground' && (b.act === 'walk' || b.act === 'hop')) {
        b.yaw += angDiff(b.wyaw, b.yaw) * Math.min(1, dt * 3); const sp = b.act === 'hop' ? S.walk * 1.8 : S.walk; const nx = b.x + Math.sin(b.yaw) * sp * dt, nz = b.z + Math.cos(b.yaw) * sp * dt;
        if (this.groundSpot(nx, nz) && (b.act !== 'hop' || Math.sin(b.t * 9) > 0)) { b.x = nx; b.z = nz; moving = sp; } else b.wyaw = b.yaw + Math.PI * rnd(0.6, 1.4);
      }
      b.walkPh += moving * dt * (b.sp === 'pigeon' ? 14 : 10);
      const ground = b.state === 'perch' ? b.spot.y : L.groundY(b.x, b.z); const hop = b.act === 'hop' && moving ? Math.max(0, Math.sin(b.t * 9)) * 0.05 : 0;
      b.y = ground + S.stand + hop - (b.act === 'peck' ? 0.006 : 0); b.pitch = S.pitch + (b.act === 'peck' ? 0.35 * Math.max(0, Math.sin(b.t * 5)) : 0);
      // head: pigeons bob (hold-thrust) while walking; pecking dips; looking turns
      const pk = b.act === 'peck' ? Math.max(0, Math.sin(b.t * 5)) : 0; const bob = S.bob && moving ? ((b.walkPh % 1) < 0.5 ? -0.012 : 0.014) : 0;
      b.head.yaw += ((b.act === 'look' ? b.lookYaw * Math.sign(Math.sin(b.t * 0.9)) : b.act === 'preen' ? 2.2 : 0) - b.head.yaw) * Math.min(1, dt * (b.act === 'look' ? 9 : 4));
      b.head.pitch += ((b.act === 'preen' ? 1.1 : S.headPitch + pk * 1.25) - b.head.pitch) * Math.min(1, dt * 10); b.head.fwd += (bob + pk * 0.012 - b.head.fwd) * Math.min(1, dt * 16);
      b.legs = moving ? [Math.sin(b.walkPh * Math.PI * 2) * 0.45, -Math.sin(b.walkPh * Math.PI * 2) * 0.45] : [0, 0]; b.flapPose = null; return;
    }
    if (b.state === 'takeoff') { // burst of deep fast beats, legs pushing off then tucking
      b.spread = Math.min(1, b.spread + dt * 7); b.tuck = Math.min(1, b.t / 0.5); b.ph = (b.ph + dt * S.flapHz * 1.35) % 1; b.flapPose = flapPose(b.sp, b.ph, 1.1);
      b.speed = Math.min(S.cruise * 0.7, b.speed + dt * 9); b.vy = Math.max(1.2, b.vy - dt * 1.5); b.x += Math.sin(b.yaw) * b.speed * dt; b.z += Math.cos(b.yaw) * b.speed * dt; b.y += b.vy * dt; b.pitch = -0.35;
      b.head.pitch += (0 - b.head.pitch) * Math.min(1, dt * 8); b.head.yaw *= 0.8; b.head.fwd = 0;
      if (b.t > 0.7) { b.state = 'fly'; b.t = 0; b.goal = this.pickGoal(b); if (!b.goal) b.goal = { x: b.x + Math.sin(b.yaw) * 60, z: b.z + Math.cos(b.yaw) * 60, y: L.LAND_Y + 14, cruise: L.LAND_Y + 18, kind: 'away' }; }
      return;
    }
    if (b.state === 'fly') {
      const G = b.goal; const dx = G.x - b.x, dz = G.z - b.z, dh = Math.hypot(dx, dz); const want = Math.atan2(dx, dz); const turn = angDiff(want, b.yaw);
      const tr = b.sp === 'parakeet' ? 2.4 : 1.6; b.yaw += Math.max(-tr * dt, Math.min(tr * dt, turn)); b.roll += (-Math.max(-0.7, Math.min(0.7, turn * 1.2)) - b.roll) * Math.min(1, dt * 4);
      const final = dh < 14 && G.kind !== 'away'; const ty = final ? G.y + S.stand + dh * 0.32 : G.cruise; b.vy += ((ty - b.y) * 1.2 - b.vy) * Math.min(1, dt * 2.5);
      const tSp = final ? Math.max(2.2, dh * 0.75) : S.cruise; b.speed += (tSp - b.speed) * Math.min(1, dt * 1.5);
      b.x += Math.sin(b.yaw) * b.speed * dt; b.z += Math.cos(b.yaw) * b.speed * dt; b.y += b.vy * dt; b.pitch = -b.vy * 0.06;
      // flap / glide: crows alternate flap bouts with glides, parakeets flap almost constantly (with brief closed-wing bounds)
      const gl = S.glide; const cyc = (b.t * 0.35 + b.ph * 0.1) % 1; const gliding = !final && b.vy < 0.8 && cyc < gl; if (gliding) { b.flapPose = { flap: b.sp === 'crow' ? 0.12 : 0.05, flapOut: 0.05, sweep: 0.08, sweepOut: 0.12 }; b.spread = Math.min(1, b.spread + dt * 4); }
      else { b.ph = (b.ph + dt * S.flapHz * (final ? 1.25 : 1)) % 1; b.flapPose = flapPose(b.sp, b.ph, final ? 1.1 : 0.9); b.spread = 1; }
      b.tuck = final && dh < 5 ? Math.max(0, b.tuck - dt * 3) : 1; b.head.pitch += (0.05 - b.head.pitch) * Math.min(1, dt * 6); b.head.yaw = 0; b.head.fwd = 0;
      if (G.kind === 'away' && dh < 8) { b.state = 'gone'; }
      if (final && dh < 0.6 && Math.abs(b.y - (G.y + S.stand)) < 0.5) { b.state = 'land'; b.t = 0; }
      if (b.t > 25) { b.goal = this.pickGoal(b) || b.goal; b.t = 0; }
      return;
    }
    if (b.state === 'land') { // flare: body up, wings forward with fast shallow beats, tail fanned, legs out
      const G = b.goal; b.ph = (b.ph + dt * S.flapHz * 1.4) % 1; b.flapPose = flapPose(b.sp, b.ph, 0.7); b.flapPose.sweep = -0.25; b.pitch = -0.7; b.tuck = 0;
      b.x += (G.x - b.x) * Math.min(1, dt * 6); b.z += (G.z - b.z) * Math.min(1, dt * 6); b.y += (G.y + S.stand - b.y) * Math.min(1, dt * 8); b.speed *= 0.8;
      if (b.t > 0.45) { b.state = G.kind === 'ground' ? 'ground' : 'perch'; b.spot = G; b.t = 0; b.act = 'look'; b.actT = rnd(1, 3); b.roll = 0; b.yaw = G.yaw ?? b.yaw; this.stats.landings++; }
      return;
    }
  }
  // ---------------------------------------------------------------- instanced output
  render() {
    const cnt = { crow: 0, pigeon: 0, parakeet: 0 }; this.birds = this.birds.filter((b) => b.state !== 'gone'); const mats = this.mats;
    for (const b of this.birds) {
      const i = cnt[b.sp]++; if (i >= MAXN[b.sp]) continue; const S = b.S; const fp = b.flapPose || { flap: 0, flapOut: 0, sweep: 0, sweepOut: 0 };
      const flying = b.state === 'fly' || b.state === 'takeoff' || b.state === 'land';
      poseBird(b.sp, { x: b.x, y: b.y, z: b.z, yaw: b.yaw, pitch: b.pitch, roll: flying ? b.roll : 0, spread: b.spread, flap: fp.flap, flapOut: fp.flapOut, sweep: fp.sweep, sweepOut: fp.sweepOut, headYaw: b.head.yaw, headPitch: b.head.pitch, headFwd: b.head.fwd, tailPitch: flying ? (b.state === 'land' ? -0.35 : 0.03) : (b.act === 'peck' ? 0.25 : 0.05) + (b.sp === 'parakeet' ? (b.state === 'ground' ? 0.45 : -0.1) : 0), tailFan: b.state === 'land' || b.state === 'takeoff' ? 1.7 : flying ? 1.25 : b.sp === 'crow' ? 0.62 : 0.45, legL: b.legs ? b.legs[0] : 0, legR: b.legs ? b.legs[1] : 0, tuck: b.tuck }, mats);
      const ms = this.meshes[b.sp]; for (let k = 0; k < 11; k++) ms[k].setMatrixAt(i, mats[k]);
    }
    for (const sp of SP) { const n = Math.min(cnt[sp], MAXN[sp]); for (const m of this.meshes[sp]) { m.count = n; m.instanceMatrix.needsUpdate = true; } }
  }
}
