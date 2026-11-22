// 84th request — the roadside mechanic's job as a real workflow (Roadside.planVan delegates here).
//
// Root causes this replaces (80th–83rd):
//  · equipment popped out of a pool at the van's back (Props.get) and vanished into it again (Props.put): there was no van
//    stock, nothing inside the van, and a prop could appear in a hand from nowhere;
//  · the whole fix was one 8–12 s bend at the car's nose with the bonnet only a sound; no assessment, no safety-first gating,
//    no inspection, no completion check, no closing up;
//  · the work time did not depend on the fault beyond a few seconds.
//
// Now
//  · KIT — every service van owns its equipment for life (v.rsKit): toolbox (holding a spanner and a wheel brace), battery
//    booster, work light, trolley jack, spare wheel, warning triangle, two cones. Stowed, each sits in its own slot in the
//    modelled compartment (RearCompartment.js COMPARTMENT_SLOTS), parented to it, so it rides with the van and shows when
//    the doors open. Taken: scene.attach (same world pose) and it glides into the hand over ~0.45 s; placed: put down at the
//    hand; returned: it glides back into its slot. Identity is kept throughout — only the tyre changes owner: the spare
//    becomes the car's wheel and the punctured wheel goes into the spare's slot (it is the van's spare from then on).
//  · STAGES with configurable durations (JOB_DUR, seconds; scaled by RS.workK): dispatch → drive → park → out → assess
//    (driver + walk-round) → safety (triangle, cones; work light at night) → open van → fetch kit → carry → open bonnet →
//    inspect → repair (simple / involved, by fault) → completion check (the driver tries it) → close bonnet → return kit →
//    collect cones → doors shut → drive off. The bonnet is a real raised panel over a lit engine bay; the lead's hands are
//    IK-planted on the bonnet edge while opening / closing and on the bay while working; the spanner is in his hand.
import * as THREE from 'three';
import { COMPARTMENT_SLOTS, compartmentMats, bayUV } from '../vehicles/RearCompartment.js';
import { surfaceY } from '../vehicles/VehicleDamage.js';

export const JOB_DUR = { assess: [8, 15], setup: [8, 15], inspect: [10, 20], simple: [25, 50], involved: [45, 90], cleanup: [10, 20], check: [3, 5] };
export const FAULT_JOB = { battery: 'simple', flat: 'simple', nostart: 'simple', overheat: 'involved', engine: 'involved', mechanical: 'involved' };
const rnd = (r) => r[0] + Math.random() * (r[1] - r[0]);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _q = new THREE.Quaternion();

// ---------------------------------------------------------------- the van's kit
const KIT_KINDS = { toolbox: 'toolbox', battery: 'battery', worklight: 'worklight', jack: 'jack', tyre: 'tyre', triangle: 'triangle', cone0: 'cone', cone1: 'cone', spanner: 'spanner', brace: 'brace' };
const compOf = (v) => v.mesh.userData.rear && v.mesh.userData.rear.cav;
export function vanKit(rs, v) {
  if (v.rsKit) return v.rsKit; const cav = compOf(v); if (!cav) return null; const P = rs.propsOf(); const K = v.rsKit = { v, slots: {}, out: new Set() };
  for (const [slot, kind] of Object.entries(KIT_KINDS)) { const m = P.get(kind); P.live.delete(m); m.userData.slot = slot; m.userData.van = v; K.slots[slot] = m; seatKit(K, m); }
  return K;
}
// into its slot (the toolbox's hand tools ride inside the toolbox, wherever it is)
function seatKit(K, m) {
  const slot = m.userData.slot, S = COMPARTMENT_SLOTS.rsvan[slot]; m.parent?.remove(m); K.out.delete(m); m.rotation.set(0, S.yaw, S.rz || 0); m.scale.set(1, 1, 1);
  if (S.inBox) { const box = K.slots.toolbox; m.position.set(0, 0.06, 0); m.rotation.set(0, 0, 0); m.visible = false; box.add(m); return; }
  m.position.set(S.p[0], S.p[1], S.p[2]); m.visible = true; compOf(K.v).add(m);
}
export function homeKit(v) { const K = v && v.rsKit; if (!K) return 0; let n = 0; for (const m of [...K.out]) { seatKit(K, m); n++; } return n; } // pool reset: every item back in its slot (same objects)
export function kitAt(K, kind) { for (const [slot, m] of Object.entries(K.slots)) if (m && KIT_KINDS[slot] === kind && !K.out.has(m)) return m; return null; }
// out of the van into a mechanic's hand: same object, same world pose, then it glides to the grip (carryPose blends)
export function takeKit(rs, o, K, kind, two = false) {
  const m = K && kitAt(K, kind); if (!m) { const p = rs.propsOf().get(kind); rs.carry(o, p, two); return p; } // (lost kit — should not happen; counted)
  m.updateWorldMatrix(true, false); m.getWorldPosition(_a); rs.g.scene.attach(m); m.visible = true; K.out.add(m); rs.carry(o, m, two); o.carry.from = _a.clone(); o.carry.k = 0; return m;
}
// back into the van: glides from where it is into its slot, then is parented to the compartment
export function stowKit(rs, u, m) {
  const v = u.v, K = v && v.rsKit; if (!m) return; if (!K || m.userData.van !== v) { rs.propsOf().put(m); return; }
  const slot = m.userData.slot; const S = COMPARTMENT_SLOTS.rsvan[slot]; if (S.inBox) { seatKit(K, m); return; }
  const cav = compOf(v); cav.updateWorldMatrix(true, false); _b.set(S.p[0], S.p[1], S.p[2]); cav.localToWorld(_b);
  (u.rs.stowing || (u.rs.stowing = [])).push({ m, from: m.position.clone(), to: _b.clone(), t: 0 }); m.parent !== rs.g.scene && rs.g.scene.attach(m);
}
export function stowStep(rs, u, dt) { const L = u.rs.stowing; if (!L || !L.length) return; const K = u.v.rsKit;
  for (let i = L.length - 1; i >= 0; i--) { const s = L[i]; s.t += dt / 0.45; const k = Math.min(1, s.t); const e = k * k * (3 - 2 * k); s.m.position.lerpVectors(s.from, s.to, e); s.m.position.y += Math.sin(Math.PI * e) * 0.08; if (k >= 1) { seatKit(K, s.m); L.splice(i, 1); } } }
export function stowNow(rs, u) { const L = u.rs.stowing; if (L) { for (const s of L) seatKit(u.v.rsKit, s.m); L.length = 0; } }
// the tyre swap: the spare goes onto the car (back to the prop pool: the car's own wheel shows), the punctured wheel takes its slot
export function swapSpare(rs, K, spare, flat) { if (!K) return; const slot = spare && spare.userData.slot; if (spare) { K.out.delete(spare); delete spare.userData.slot; delete spare.userData.van; rs.propsOf().put(spare); }
  if (flat && slot) { rs.propsOf().live.delete(flat); flat.userData.slot = slot; flat.userData.van = K.v; K.slots[slot] = flat; K.out.add(flat); } }
export function kitReport(v) { const K = v && v.rsKit; if (!K) return null; const r = { stowed: 0, out: K.out.size, slots: Object.keys(K.slots).length, missing: 0 };
  for (const [slot, m] of Object.entries(K.slots)) { if (!m) { r.missing++; continue; } const S = COMPARTMENT_SLOTS.rsvan[slot]; if (!K.out.has(m) && (S.inBox ? m.parent === K.slots.toolbox : m.parent === compOf(v))) r.stowed++; } return r; }

// ---------------------------------------------------------------- the bonnet (a raised panel over a lit engine bay)
let BAY_GEO = null, PAD = null; const PANEL = new Map(), PAINT = new Map();
function bonnetFrame(car) { // vehicle-local: hinge (rear edge) and front edge of the bonnet, from the body's real surface
  const ch = car.T.len / 2, Lb = car.T.len * 0.27; const zf = ch - 0.16, zh = zf - Lb; const yf = surfaceY(car, 0, zf - 0.04), yh = surfaceY(car, 0, zh + 0.03);
  if (yf == null || yh == null || yh < yf - 0.05) return null; return { zf, zh, yf, yh, Lb, w: car.T.wid * 0.78 }; }
export function bonnetOpen(rs, u, car) {
  const R = u.rs; if (R.bonnet) return R.bonnet; if (car.type === 'tuktuk' || car.T.base === 'tuktuk') return null; const F = bonnetFrame(car); if (!F) return null;
  const key = `${Math.round(F.w * 20)}:${Math.round(F.Lb * 20)}`; let pg = PANEL.get(key);
  if (!pg) { pg = new THREE.BoxGeometry(F.w, 0.022, F.Lb, 6, 1, 4); pg.translate(0, 0, F.Lb / 2); const p = pg.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i); p.setY(i, p.getY(i) + (1 - (2 * x / F.w) ** 2) * 0.03); } pg.computeVertexNormals(); PANEL.set(key, pg); }
  const hex = typeof car.mesh.userData.customHex === 'string' ? car.mesh.userData.customHex : typeof car.mesh.userData.color === 'string' ? car.mesh.userData.color : '#8a8f94';
  let pm = PAINT.get(hex); if (!pm) { pm = new THREE.MeshStandardMaterial({ color: new THREE.Color(hex), roughness: 0.35, metalness: 0.35, envMapIntensity: 0.9 }); PAINT.set(hex, pm); }
  if (!BAY_GEO) { BAY_GEO = new THREE.PlaneGeometry(1, 1); BAY_GEO.rotateX(-Math.PI / 2); const [u0, v0, u1, v1] = bayUV(); const uv = BAY_GEO.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0)); }
  const hinge = new THREE.Group(); hinge.position.set(0, F.yh + 0.012, F.zh); const panel = new THREE.Mesh(pg, pm); panel.castShadow = true; hinge.add(panel);
  const under = new THREE.Mesh(BAY_GEO, PAD || (PAD = new THREE.MeshStandardMaterial({ color: 0x1d1e1f, roughness: 0.95 }))); under.scale.set(F.w * 0.96, 1, F.Lb * 0.96); under.rotation.x = Math.PI; under.position.set(0, -0.012, F.Lb / 2); hinge.add(under); // insulation pad (dark)
  const bay = new THREE.Mesh(BAY_GEO, compartmentMats().decal); bay.scale.set(F.w * 0.97, 1, F.Lb * 0.97); const slope = Math.atan2(F.yh - F.yf, F.Lb); bay.rotation.x = slope; bay.position.set(0, (F.yh + F.yf) / 2 + 0.035, (F.zh + F.zf) / 2); bay.visible = false;
  car.mesh.add(hinge, bay); R.bonnet = { hinge, bay, F, k: 0, goal: 1, slope, car }; return R.bonnet;
}
export function bonnetStep(R, dt) { const B = R.bonnet; if (!B) return; B.k += Math.sign(B.goal - B.k) * Math.min(Math.abs(B.goal - B.k), dt / 1.4); const e = B.k * B.k * (3 - 2 * B.k);
  B.hinge.rotation.x = B.slope - e * 1.15; B.bay.visible = B.k > 0.02; B.hinge.visible = true; if (B.k <= 0.001 && B.goal === 0) bonnetGone(R); }
export function bonnetGone(R) { const B = R.bonnet; if (!B) return; B.hinge.parent?.remove(B.hinge); B.bay.parent?.remove(B.bay); R.bonnet = null; }
// world points: the bonnet's front edge (where the hands lift it) and spots in the bay to work at
export function bonnetEdge(R, car) { const B = R.bonnet; if (!B) return null; const e = B.k * B.k * (3 - 2 * B.k); const a = B.slope - e * 1.15; const y = B.F.yh + 0.012 - Math.sin(a) * B.F.Lb, z = B.F.zh + Math.cos(a) * B.F.Lb;
  car.mesh.updateWorldMatrix(true, false); const L = _a.set(0.28, y, z).applyMatrix4(car.mesh.matrixWorld).clone(), Rr = _b.set(-0.28, y, z).applyMatrix4(car.mesh.matrixWorld).clone(); return [{ x: L.x, y: L.y, z: L.z }, { x: Rr.x, y: Rr.y, z: Rr.z }]; }
export function bayPoints(R, car, lx = 0, depth = 0.5) { const F = R.bonnet ? R.bonnet.F : bonnetFrame(car); if (!F) return null; const z = F.zf - F.Lb * depth, y = F.yf + (F.yh - F.yf) * depth - 0.05;
  car.mesh.updateWorldMatrix(true, false); const A = _a.set(lx + 0.22, y, z).applyMatrix4(car.mesh.matrixWorld), a = { x: A.x, y: A.y, z: A.z }; const B = _b.set(lx - 0.22, y, z).applyMatrix4(car.mesh.matrixWorld); return [a, { x: B.x, y: B.y, z: B.z }]; }

// ---------------------------------------------------------------- the hand tool (a spanner / wheel brace in the right hand)
export function toolPose(o) { const m = o.tool; if (!m) return; const h = o.ch.bones && o.ch.bones.handR; if (!h) return; h.updateWorldMatrix(true, false); h.getWorldPosition(_a); h.getWorldQuaternion(_q);
  m.position.copy(_a); m.quaternion.copy(_q); m.visible = true; }
export function takeTool(rs, o, K, kind) { const m = K && K.slots[kind]; if (!m) return null; m.updateWorldMatrix(true, false); m.getWorldPosition(_a); rs.g.scene.attach(m); K.out.add(m); m.visible = true; o.tool = m; return m; }
export function putTool(rs, o) { const m = o.tool; o.tool = null; if (!m) return; const K = m.userData.van && m.userData.van.rsKit; if (K) seatKit(K, m); else rs.propsOf().put(m); }

// ---------------------------------------------------------------- the van job plan
export function planVanJob(rs, u) {
  const R = u.rs, v = u.v, inc = R.inc, car = inc.v, A = u.officers[0], B = u.officers[1] || A; const K = vanKit(rs, v); const fx = Math.sin(v.yaw), fz = Math.cos(v.yaw);
  const ch = car.T.len / 2, cw = car.T.wid / 2; const night = rs.g.atmos && rs.g.atmos.night > 0.4; const kindJob = FAULT_JOB[inc.kind] || 'simple';
  const D = { assess: rnd(JOB_DUR.assess), setup: rnd(JOB_DUR.setup), inspect: rnd(JOB_DUR.inspect), repair: rnd(JOB_DUR[kindJob]), check: rnd(JOB_DUR.check), cleanup: rnd(JOB_DUR.cleanup) }; R.plan = { kind: kindJob, D, stage: 'assess', log: [] };
  const stage = (s) => () => { R.plan.stage = s; R.plan.log.push(`${rs.t.toFixed(1)} ${s}`); };
  const roadC = -(v.T.wid / 2 + 0.25);
  const atRear = (lx) => Object.assign(() => { const p = rs.w(v, lx, -(v.T.len / 2 + 0.55)); return rs.faceTo(p, p.x + fx, p.z + fz); }, { rear: true }); // (Roadside.mech: waits beside the doors until they are open)
  const openVan = (o, lx) => ({ at: atRear(lx), act: 'mechBend', lean: 0.25, dur: 1.4, start: () => { if (!R.rearOpen) { R.rearOpen = true; rs.sound('rs.van.door', v.x - fx * 2.5, v.z - fz * 2.5, 8); } }, wait: () => true });
  const fetch = (o, kind, two = false, lx = 0) => ({ at: atRear(lx), act: 'mechBend', lean: 0.45, dur: 1.1, wait: () => R.rear > 0.85, start: () => { R.rearOpen = true; rs.sound('rs.tools', v.x - fx * 2.5, v.z - fz * 2.5, 8); }, end: () => takeKit(rs, o, K, kind, two) });
  const putAt = (o, at, act, sound, extra = {}) => ({ at, act, lean: 0.25, dur: extra.dur ?? 1.2, end: () => { const m = rs.unCarry(o); if (!m) return; const p = rs.lastAt(o); const fd = extra.fwd ?? 0.45; rs.place(u, m, p.x + Math.sin(p.yaw) * fd, p.z + Math.cos(p.yaw) * fd, p.yaw + (extra.yaw || 0), extra); if (sound) rs.sound(sound, p.x, p.z, 10); if (extra.then) extra.then(m); } });
  // ---- B: safety first. Out, round to the back, doors open, triangle 12 m behind, two cones on the traffic side (setup time)
  const per = D.setup / (night ? 4 : 3);
  B.q.push(openVan(B, 0.35), fetch(B, 'triangle', false, 0.35), putAt(B, () => rs.w(v, roadC + 0.6, -(v.T.len / 2 + 12), Math.PI), 'mechSquat', 'rs.triangle', { yaw: 0, dur: per * 0.5, then: () => { R.safe = true; } }));
  for (const [k, z] of [[0, -(v.T.len / 2 + 3.5)], [1, -(v.T.len / 2 + 7)]]) B.q.push(fetch(B, 'cone', false, 0.35), putAt(B, () => rs.w(v, roadC - 0.1 + k * 0.4, z, Math.PI), 'mechSquat', 'rs.cone', { dur: per * 0.35 }));
  if (night) B.q.push(fetch(B, 'worklight', false, 0.35), putAt(B, () => rs.faceTo(rs.w(car, -(cw + 0.9), ch * 0.4), car.x, car.z), 'mechBend', null, { yaw: 0, dur: per * 0.4 }));
  // ---- A: assess — the driver first (what happened), then a slow walk round the car looking at it
  const drv = () => rs.faceTo(rs.w(car, -(cw + 0.55), 0.3), car.x, car.z);
  A.q.push({ at: drv, act: null, dur: D.assess * 0.45, look: 0.15, start: () => { stage('assess')(); if (inc.own && rs.g.hud && rs.dP(car.x, car.z) < 30) rs.g.hud.notify('Street Customs Roadside', `The mechanic asks what happened — ${FAULTS_LABEL(inc)}.`, 'info', 3); } });
  for (const [lx, lz] of [[-(cw + 0.7), ch + 0.4], [0, ch + 0.8]]) A.q.push({ at: () => rs.faceTo(rs.w(car, lx, lz), car.x, car.z), act: lz > ch + 0.6 ? 'mechBend' : null, lean: 0.25, look: 0.6, dur: D.assess * 0.27 });
  if (inc.kind === 'flat') { planTyre(rs, u, K, A, B, D, stage, fetch, putAt); return; }
  const usePack = inc.kind === 'battery'; const kit = usePack ? 'battery' : 'toolbox';
  // ---- A: to the van for the kit (waits for the scene to be safe), carried to the car's nose, set down beside the wheel
  A.q.push({ ...fetch(A, kit, false, -0.35), wait: () => R.safe && R.rear > 0.85, start: () => { stage('fetch kit')(); R.rearOpen = true; rs.sound('rs.tools', v.x - fx * 2.5, v.z - fz * 2.5, 8); } });
  A.q.push(putAt(A, () => rs.faceTo(rs.w(car, 0.75, ch + 0.5), car.x, car.z), 'mechSquat', usePack ? 'rs.battery' : 'rs.toolbox.open', { yaw: Math.PI / 2, dur: 1.4 }));
  // ---- open the bonnet: hands to the front edge, release, lift; the edge follows the panel up and the hands with it
  const front = (dx = 0) => () => rs.faceTo(rs.w(car, dx, ch + 0.45), car.x, car.z);
  A.q.push({ at: front(0), act: 'mechBend', lean: 0.45, look: 0.5, dur: 2.2, start: () => { stage('open bonnet')(); const b = bonnetOpen(rs, u, car); if (b) b.goal = 1; rs.sound('rs.bonnet.open', car.x + Math.sin(car.yaw) * ch, car.z + Math.cos(car.yaw) * ch, 9); }, holds: () => bonnetEdge(R, car) || bayPoints(R, car) || [null, null] });
  // ---- inspect: torch-and-look over the bay (B helps: holds the light / looks on the other side)
  A.q.push({ at: front(0), act: 'mechBend', lean: 0.65, look: 0.6, dur: D.inspect, start: () => { stage('inspect')(); R.working = true; rs.sound('rs.inspect', car.x, car.z, 8); }, holds: () => bayPoints(R, car, 0.1, 0.35 + 0.15 * Math.sin(rs.t * 0.7)) || [null, null] });
  // 84th: the battery job needs a spanner too (terminal clamps loosened, cleaned, re-tightened round the jump) — B brings the toolbox
  A.q.push({ at: () => rs.faceTo(rs.w(car, 0.75, ch + 0.95), car.x, car.z), act: 'mechSquat', lean: 0.4, dur: 1.2, wait: () => R.props.some((p) => p.m.userData.kind === 'toolbox') || R.done, start: () => rs.sound('rs.toolbox.open', car.x, car.z, 8), end: () => takeTool(rs, A, K, 'spanner') });
  // ---- repair: several working spells at different spots in the bay (the hands move, the spanner works), with pauses to look
  const spells = Math.max(3, Math.round(D.repair / 9)); for (let i = 0; i < spells; i++) { const lx = [0.15, -0.2, 0.32, -0.05][i % 4], dp = [0.45, 0.6, 0.3, 0.7][i % 4];
    A.q.push({ at: front(lx * 0.6), act: 'mechBend', lean: 0.6 + 0.1 * (i % 2), look: 0.6, dur: D.repair / spells * (i % 3 === 2 ? 0.7 : 1), start: i === 0 ? () => { stage('repair')(); } : null, holds: () => bayPoints(R, car, lx, dp) || [null, null],
      every: [usePack ? 3.2 : 2.1, () => rs.sound(usePack ? 'rs.battery' : Math.random() < 0.5 ? 'rs.ratchet' : 'rs.spanner', car.x + Math.sin(car.yaw) * ch, car.z + Math.cos(car.yaw) * ch, 9)] });
    if (i % 3 === 2 && i < spells - 1) A.q.push({ at: front(lx * 0.6 + 0.3), act: null, look: 0.5, dur: 2.5 }); }
  A.q.push({ at: () => rs.faceTo(rs.w(car, 0.75, ch + 0.95), car.x, car.z), act: 'mechSquat', lean: 0.4, dur: 1.0, start: () => putTool(rs, A) });
  // ---- completion check: to the driver's window — "try it now"; the verdict is the car starting (or not)
  const job = rs.faultOf(inc.kind);
  A.q.push({ at: drv, act: null, dur: D.check, look: 0.2, start: () => { stage('check')(); rs.sound(inc.kind === 'battery' || inc.kind === 'nostart' ? 'rs.starter.fail' : 'rs.inspect', car.x, car.z, 8); }, end: () => rs.verdict(u, job) });
  // ---- close the bonnet (hands on the edge as it comes down), pick the kit up, back to the van, into its slot
  A.q.push({ at: front(0), act: 'mechBend', lean: 0.45, dur: 2.0, start: () => { stage('close bonnet')(); if (R.bonnet) R.bonnet.goal = 0; }, end: () => rs.sound('rs.bonnet.close', car.x + Math.sin(car.yaw) * ch, car.z + Math.cos(car.yaw) * ch, 9), holds: () => bonnetEdge(R, car) || [null, null] });
  A.q.push({ at: () => rs.faceTo(rs.w(car, 1.25, ch + 0.5), car.x, car.z), act: 'mechSquat', dur: 1.0, start: () => { stage('return kit')(); rs.sound(usePack ? 'rs.battery' : 'rs.toolbox.close', car.x, car.z, 9); }, end: () => { const kp = R.props.find((p) => p.m.userData.kind === kit); if (kp) { rs.pick(u, kp.m); rs.carry(A, kp.m); } } });
  if (usePack) B.q.push({ ...fetch(B, 'toolbox', false, 0.35), wait: () => R.safe && R.rear > 0.85 }, putAt(B, () => rs.faceTo(rs.w(car, 1.4, ch + 1.2), car.x, car.z), 'mechSquat', 'rs.toolbox.open', { yaw: Math.PI / 2, dur: 1.2 }));
  // ---- B meanwhile: once the bonnet is up, at the other front corner looking in / lighting it for A
  B.q.push({ at: front(0.95), act: 'mechBend', lean: 0.3, look: 0.5, dur: D.inspect * 0.6, wait: () => R.working || R.done, holds: () => { const b = bayPoints(R, car, 0.45, 0.4); return b ? [b[0], null] : [null, null]; } });
  B.q.push({ at: () => rs.faceTo(rs.w(car, cw + 0.9, ch * 0.2), car.x, car.z), act: null, look: 0.3, dur: D.repair * 0.4, wait: () => R.working || R.done });
}
function FAULTS_LABEL(inc) { return { battery: 'a flat battery', flat: 'a flat tyre', overheat: 'it overheated', nostart: 'it will not start', engine: 'the engine cut out', mechanical: 'a mechanical fault' }[inc.kind] || 'a breakdown'; }
// the tyre change: B brings the jack and the toolbox, A the spare; nuts cracked before the car goes up, wheel off, spare on,
// nuts run down, car down, nuts torqued, the punctured wheel into the van as the new spare
function planTyre(rs, u, K, A, B, D, stage, fetch, putAt) {
  const R = u.rs, car = R.inc.v; const w = rs.wheelOf(car, false); const wl = () => { const wp = w.position; const sx = Math.sign(wp.x) || 1; return { lx: wp.x + sx * 0.75, lz: wp.z, sx }; };
  const atWheel = (off = 0) => () => { const q = wl(); const p = rs.w(car, q.lx, q.lz + off); const c = rs.w(car, q.lx - q.sx * 0.8, q.lz + off); return rs.faceTo(p, c.x, c.z); };
  const hub = () => { car.mesh.updateWorldMatrix(true, false); w.updateWorldMatrix(true, false); w.getWorldPosition(_a); return [{ x: _a.x, y: _a.y + 0.08, z: _a.z + 0.05 }, { x: _a.x, y: _a.y - 0.05, z: _a.z - 0.06 }]; };
  const nut = (t) => D.repair * t; const P = rs.propsOf();
  B.q.push(fetch(B, 'jack', false, 0.35), putAt(B, atWheel(0.55), 'mechSquat', 'rs.equipment', { then: () => { R.jackOut = true; } }));
  B.q.push(fetch(B, 'toolbox', false, 0.35), putAt(B, atWheel(1.5), 'mechSquat', 'rs.toolbox.open', { yaw: Math.PI / 2 }));
  A.q.push({ ...fetch(A, 'tyre', true, -0.35), wait: () => R.safe && R.rear > 0.85, start: () => stage('fetch spare')() }, putAt(A, atWheel(-0.9), 'mechSquat', 'rs.tyre', { rz: Math.PI / 2, dy: 0.1 }));
  A.q.push({ at: atWheel(1.1), act: 'mechSquat', dur: 1.0, wait: () => R.props.some((p) => p.m.userData.kind === 'toolbox'), end: () => takeTool(rs, A, K, 'brace') });
  A.q.push({ at: atWheel(0), act: 'mechSquat', lean: 0.5, dur: nut(0.18), start: () => { stage('crack nuts')(); R.working = true; }, holds: hub, every: [1.6, () => rs.sound('rs.wheelnut', car.x, car.z, 9)] });
  A.q.push({ at: atWheel(0.55), act: 'mechSquat', lean: 0.5, dur: 2.6, wait: () => R.jackOut, start: () => { stage('jack up')(); R.jack = { w, k: 0, goal: 1 }; rs.sound('rs.equipment', car.x, car.z, 8); } });
  A.q.push({ at: atWheel(0), act: 'mechSquat', lean: 0.5, dur: nut(0.22), wait: () => R.jack && R.jack.k > 0.95, holds: hub, every: [1.2, () => rs.sound('rs.wheelnut', car.x, car.z, 9)], start: () => stage('wheel off')(),
    end: () => { w.visible = false; const m = P.get('tyre'); const q = wl(); const p = rs.w(car, q.lx - q.sx * 0.15, q.lz + 1.2); rs.place(u, m, p.x, p.z, car.yaw, { rz: Math.PI / 2, dy: 0.1 }); R.flatTyre = m; rs.sound('rs.tyre', p.x, p.z, 9); } });
  A.q.push({ at: atWheel(-0.9), act: 'mechSquat', dur: 1.0, end: () => { const sp = R.props.find((p) => p.m.userData.kind === 'tyre' && p.m !== R.flatTyre); if (sp) { rs.pick(u, sp.m); rs.carry(A, sp.m, true); } } });
  A.q.push({ at: atWheel(0), act: 'mechSquat', lean: 0.5, dur: nut(0.25), every: [1.2, () => rs.sound('rs.wheelnut', car.x, car.z, 9)], holds: hub, start: () => { stage('spare on')(); const m = rs.unCarry(A); swapSpare(rs, K, m, R.flatTyre); w.visible = true; rs.fixTyres(car); rs.sound('rs.tyre', car.x, car.z, 9); }, end: () => { if (R.jack) R.jack.goal = 0; } });
  A.q.push({ at: atWheel(0), act: 'mechSquat', lean: 0.5, dur: nut(0.2), wait: () => !R.jack || R.jack.k < 0.02, holds: hub, start: () => stage('torque')(), every: [1.8, () => rs.sound('rs.wheelnut', car.x, car.z, 9)] });
  A.q.push({ at: atWheel(1.1), act: 'mechSquat', dur: 1.0, start: () => putTool(rs, A), end: () => { R.ok = true; rs.stats.repaired++; R.working = false; R.done = true; stage('check')(); rs.sound('rs.restart', car.x, car.z, 12); } });
  B.q.push({ at: atWheel(0.55), act: 'mechSquat', dur: 1.0, wait: () => R.done, start: () => { stage('return kit')(); if (R.jack) R.jack = null; }, end: () => { const jp = R.props.find((p) => p.m.userData.kind === 'jack'); if (jp) { rs.pick(u, jp.m); rs.carry(B, jp.m); } } });
  A.q.push({ at: () => { const p = R.flatTyre ? { x: R.flatTyre.position.x, z: R.flatTyre.position.z } : atWheel(1.2)(); return rs.faceTo({ x: p.x + Math.sin(car.yaw) * 0.6, z: p.z + Math.cos(car.yaw) * 0.6 }, p.x, p.z); }, act: 'mechSquat', dur: 1.0, end: () => { if (R.flatTyre) { rs.pick(u, R.flatTyre); rs.carry(A, R.flatTyre, true); R.flatTyre = null; } } });
}
