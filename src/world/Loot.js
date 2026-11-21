// Physical loot (64th, Phase 1A): what a defeated pedestrian or police officer leaves on the ground — paper money, now and
// then a wallet, a phone or a small bag, and the weapon an armed NPC was actually carrying.
//
// Hooks into what already exists (no second inventory, purse or interaction system):
//   * the defeat: bus 'npcDefeated' — emitted once per incapacitation by Crowd.kill (pedestrians) and
//     PoliceResponse.killOfficer (officers, with the T-56 they carry). One defeat → one drop set (WeakSet of defeated
//     NPC objects + a stable defeat id), whatever re-emits.
//   * money: Story.pay (purse + bank ledger, saved with the story); weapons: the active character's slot in
//     Weapons.inv (owned / mag / reserve — the Shop's rules: an owned weapon takes the rounds up to the carry cap);
//     the prompt: the interact key through Game.updateInteractions; the confirmation: HUD.notify; sounds: Audio.loot
//     (each has a SoundBank slot, "sounds" window).
//   * persistence: nothing new on disk. What was picked up is in the money / weapon inventory the save already holds;
//     loot still lying in the world is not saved and is cleared on load / new game, so a reload can never hand it out
//     twice. (Per-character counters of picked-up belongings ride in story.state.stats.loot, optional for old saves.)
//
// Placement: every item gets a resting spot on walkable ground near the body that is reachable from it without passing a
// wall (Collision.blocked / sweepSolid), flat (not across a kerb or step), not under a vehicle, not in water, inside the
// world and never on top of another item. Each one then leaves the body in a short controlled arc (paper flutters a
// little and comes down slower; bundles, wallet, phone and the rifle land with one small bounce) and lies still.
//
// Rendering: every cash pile and belonging is a part of ONE BatchedMesh (LootArt.js atlas): one draw call + one shadow
// draw for all of them; parts come from and go back to the mesh's instance pool. A dropped rifle is the officer's own
// model (same geometry and shared weapon materials, true scale). Items time out (LOOT.life) but never vanish in front of
// the player: an expired item close by and in view waits until the player has moved on. LOOT.maxItems caps the world total.
import * as THREE from 'three';
import * as L from './Layout.js';
import { WEAPONS } from '../combat/WeaponDefs.js';
import { reserveCap } from '../combat/Shop.js';
import { buildWeaponModel } from '../combat/WeaponModels.js';
import { Audio } from '../audio/Audio.js';
import { Input } from '../core/Input.js';
import { bus as globalBus } from '../core/Events.js';
import { lootAtlas, lootGeometries } from './LootArt.js';

// ------------------------------------------------------------------------------------------------ configuration
// (rupees; for scale: plain tea & rotti Rs. 150, a delivery job Rs. 500–1,500, a Type 56 Rs. 30,000, a store robbery Rs. 100k+)
export const LOOT = {
  maxItems: 40, maxWeapons: 4, maxParts: 220,
  life: { cash: 150, wallet: 180, phone: 180, bag: 180, weapon: 240 }, // seconds an item lies before it may be tidied away
  keepNear: 18, // m: an expired item this close and on screen stays until the player leaves
  dropRadius: 90, // m: a defeat further than this from the player leaves nothing (nobody would ever come for it)
  promptReach: 1.6, gap: 0.2,
  // cash on a defeated person, by who they are (crowd profile): [chance, min, max]
  cash: {
    office: [0.8, 400, 3500], shopper: [0.75, 300, 2500], tourist: [0.85, 1000, 9000], shopkeeper: [0.8, 500, 4000], vendor: [0.8, 150, 1500],
    worker: [0.7, 100, 1200], driver: [0.8, 300, 2200], courier: [0.7, 200, 1200], student: [0.6, 50, 600], retiree: [0.7, 200, 1500],
    resident: [0.7, 200, 1500], fitness: [0.35, 50, 500], medical: [0.6, 300, 2500], medic: [0.5, 200, 1500], security: [0.7, 200, 1500],
    police: [0.35, 200, 1200], default: [0.6, 100, 1000],
  },
  belongings: { wallet: 0.07, phone: 0.05, bag: 0.04 }, // civilians only, at most one; a wallet halves the loose-cash chance
  wallet: [1, 400, 3000], bag: [1, 200, 1800], // cash inside
  // weapons: only what the NPC carries. Officers carry the T-56 (Firefight.arm) → the player's Type 56 slot.
  weapons: { officer: { id: 'type56', chance: 0.6, mag: [8, 30], spare: 0 } },
};
export const cashVariant = (n) => (n <= 300 ? 'folded' : n <= 1500 ? 'loose' : n <= 3500 ? 'bundleS' : n <= 7000 ? 'bundleM' : 'bundleL');
const LABEL = { cash: 'PICK UP CASH', wallet: 'PICK UP WALLET', phone: 'PICK UP PHONE', bag: 'PICK UP BAG' };
const RADIUS = { folded: 0.06, loose: 0.13, bundleS: 0.09, bundleM: 0.12, bundleL: 0.15, wallet: 0.075, phone: 0.085, bag: 0.2 };
const rs = (n) => `Rs. ${Math.round(n).toLocaleString('en-LK')}`;

const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1), _e = new THREE.Euler();
const _box = new THREE.Box3(), _b2 = new THREE.Box3(), _fr = new THREE.Frustum(), _pm = new THREE.Matrix4(), UP = new THREE.Vector3(0, 1, 0);
const smooth = (k) => k * k * (3 - 2 * k);

export class Loot {
  // game: the Game (scene, collision, traffic, story, weapons, hud, player, camera are read when needed). opts: { bus, rand }
  constructor(game, opts = {}) {
    this.g = game; this.rand = opts.rand || Math.random; this.items = new Map(); this.collected = new Set(); this.defeated = new WeakSet(); this.seq = 0; this.iseq = 0;
    this.stats = { defeats: 0, repeats: 0, drops: 0, collected: 0, refused: 0, expired: 0, unplaced: 0, cash: 0 };
    this.checkT = 0; this.failT = 0; this.taking = [];
    const art = lootAtlas(); const G = this.geos = lootGeometries(); let nv = 0, ni = 0; for (const g of Object.values(G)) { nv += g.attributes.position.count; ni += g.index.count; }
    this.mat = new THREE.MeshStandardMaterial({ map: art.map, roughnessMap: art.roughnessMap, roughness: art.roughnessMap ? 1 : 0.85, metalness: 0 }); this.mat.name = 'loot';
    const M = this.mesh = new THREE.BatchedMesh(LOOT.maxParts, nv, ni, this.mat); M.name = 'loot'; M.castShadow = true; M.receiveShadow = true; M.frustumCulled = false; M.visible = false; // per-part culling inside the batch
    this.gid = {}; for (const [k, g] of Object.entries(G)) this.gid[k] = M.addGeometry(g);
    if (game && game.scene) game.scene.add(M);
    const B = opts.bus || globalBus; this.off = B && B.on ? B.on('npcDefeated', (ev) => this.onDefeat(ev)) : null; // one subscription for the life of the game
  }
  dispose() { if (this.off) this.off(); this.off = null; this.clear(); this.mesh.parent?.remove(this.mesh); this.mesh.dispose(); }
  // shader warm-up: the batch's programme (Game.shaderWarmSet) — a throwaway batch with one note
  warmMesh() { const M = new THREE.BatchedMesh(1, this.geos.note1000.attributes.position.count, this.geos.note1000.index.count, this.mat); M.addInstance(M.addGeometry(this.geos.note1000)); M.castShadow = true; M.receiveShadow = true; return M; }

  // ---------------------------------------------------------------------------------------------- defeat → drop set
  onDefeat(ev) {
    const p = ev && ev.p; if (!p || typeof p !== 'object') return null;
    if (this.defeated.has(p)) { this.stats.repeats++; return null; } // the same defeat again (or a second emitter): nothing more
    this.defeated.add(p); const key = 'D' + (++this.seq); this.stats.defeats++;
    const g = this.g; if (this.disabled || (g && g.indoor)) return null;
    const P = g && g.player; if (P && Math.hypot(p.x - P.x, p.z - P.z) > LOOT.dropRadius) return null;
    const plan = this.roll(ev); if (!plan.length) return [];
    const out = []; const y0 = this.footY(p);
    for (const it of plan) { const r = it.kind === 'weapon' ? this.dropWeapon(key, ev, it, y0) : this.dropProp(key, p, it, y0); if (r) out.push(r); }
    if (out.length) this.stats.drops++; this.cap(); return out;
  }
  // what this NPC carries (pure apart from this.rand): [{ kind, amount? , wi?, mag?, spare? }]
  roll(ev) {
    const p = ev.p, out = []; const officer = ev.kind === 'officer'; const prof = officer ? (p.medic ? 'medic' : 'police') : (p.sp && p.sp.profile) || 'default';
    const w = this.carried(ev); if (w && this.rand() < w.cfg.chance) { const [a, b] = w.cfg.mag; out.push({ kind: 'weapon', wi: w.wi, model: w.model, mag: Math.round(a + (b - a) * this.rand()), spare: w.cfg.spare | 0 }); }
    let wallet = false;
    if (!officer) { const r = this.rand(); let acc = 0; for (const k of Object.keys(LOOT.belongings)) { acc += LOOT.belongings[k]; if (r < acc) { out.push(k === 'phone' ? { kind: 'phone' } : { kind: k, amount: this.amount(LOOT[k]) }); wallet = k === 'wallet'; break; } } }
    const C = LOOT.cash[prof] || LOOT.cash.default; if (this.rand() < C[0] * (wallet ? 0.5 : 1)) out.push({ kind: 'cash', amount: this.amount(C) });
    return out;
  }
  // the weapon an NPC really has on them right now (never invented): officers with their rifle; anyone else only if the
  // caller passes ev.weapon = { id, model? } for a weapon that NPC was set up with
  carried(ev) {
    let id = null, model = null, cfg = null;
    if (ev.kind === 'officer' && !ev.p.medic && (ev.rifle || ev.p.rifle)) { cfg = LOOT.weapons.officer; id = cfg.id; model = ev.rifle || ev.p.rifle; }
    else if (ev.weapon && ev.weapon.id) { id = ev.weapon.id; model = ev.weapon.model || null; cfg = LOOT.weapons[ev.weapon.cfg] || { chance: ev.weapon.chance ?? 0.5, mag: ev.weapon.mag || [5, 15], spare: 0 }; }
    if (!id) return null; const wi = WEAPONS.findIndex((w) => w.id === id); return wi < 0 ? null : { wi, model, cfg };
  }
  amount(C) { const lo = C[1], hi = C[2]; const v = lo + (hi - lo) * Math.pow(this.rand(), 1.6); return Math.max(50, Math.round(v / 50) * 50); } // most people carry little, a few a lot

  // ---------------------------------------------------------------------------------------------- placement
  groundAt(x, z, y) { const c = this.g && this.g.collision; return c ? c.groundAt(x, z, y + 0.3, 0.6) : L.surfaceY(x, z); }
  footY(p) { const y = typeof p.y === 'number' && isFinite(p.y) ? p.y : 0; return this.groundAt(p.x, p.z, y); }
  // a free resting spot of radius r near (cx, cz) at ground height ~y0, reachable from there; null if there is none
  spot(cx, cz, y0, r, near, far, body, extra = null) {
    for (let k = 0; k < 28; k++) { const a = this.rand() * Math.PI * 2, f = k < 20 ? far : far * 1.6, d = near + (f - near) * Math.sqrt(this.rand());
      const x = cx + Math.sin(a) * d, z = cz + Math.cos(a) * d; const y = this.valid(x, z, y0, r, cx, cz, body, extra); if (y !== null) return { x, z, y, a }; }
    return null;
  }
  valid(x, z, y0, r, fx, fz, body, extra) {
    const B = L.BOUNDS; if (x < B.minX + 3 || x > B.maxX - 3 || z < B.minZ + 3 || z > B.maxZ - 3) return null;
    const col = this.g && this.g.collision;
    if (col) { if (col.blocked(x, z, r)) return null; if (col.sweepSolid(fx, fz, x, z, y0, 0.3, 1.8) < 1) return null; } else if (L.isWater(x, z)) return null;
    if (L.isWater(x, z) && !(col && col.walkableWater(x, z, y0))) return null;
    const gy = this.groundAt(x, z, y0); if (!isFinite(gy) || Math.abs(gy - y0) > 0.45) return null; // not up on something, not down a drop
    for (const [ox, oz] of [[r, 0], [-r, 0], [0, r], [0, -r]]) if (Math.abs(this.groundAt(x + ox, z + oz, y0) - gy) > 0.025) return null; // flat: never across a kerb edge or a step
    if (extra && !extra(x, z, gy)) return null;
    const T = this.g && this.g.traffic; const vs = T ? (T.all ? T.all() : T.vehicles || []) : [];
    for (const v of vs) { if (Math.abs(v.x - x) > 7 || Math.abs(v.z - z) > 7 || !v.pushOut) continue; if (v.pushOut(x, z, r + 0.05)) return null; } // not under / inside a vehicle
    for (const it of this.items.values()) { if (it.state === 'gone') continue; const d = Math.hypot(it.x - x, it.z - z); if (d < it.r + r + LOOT.gap * 0.5) return null; } // never on top of another item
    if (body) { const bx = -Math.sin(body.yaw), bz = -Math.cos(body.yaw); const t = Math.max(0, Math.min(1.7, (x - body.x) * bx + (z - body.z) * bz)); if (Math.hypot(body.x + bx * t - x, body.z + bz * t - z) < 0.28 + r) return null; } // not under the body
    return gy;
  }

  // ---------------------------------------------------------------------------------------------- items
  newItem(key, kind, x, y, z, r, life) { const it = { id: 'L' + (++this.iseq), defeat: key, kind, x, y, z, r, yaw: 0, parts: [], obj: null, state: 'fly', t: 0, age: 0, life, fly: null }; this.items.set(it.id, it); return it; }
  // cash pile / wallet / phone / bag
  dropProp(key, p, d, y0) {
    const variant = d.kind === 'cash' ? cashVariant(d.amount) : d.kind; const r = RADIUS[variant] || 0.1;
    const s = this.spot(p.x, p.z, y0, r, d.kind === 'cash' ? 0.35 : 0.4, d.kind === 'cash' ? 1.0 : 1.1, { x: p.x, z: p.z, yaw: p.yaw || 0 }); if (!s) { this.stats.unplaced++; return null; }
    const it = this.newItem(key, d.kind, s.x, s.y, s.z, r, LOOT.life[d.kind] || 150); it.amount = d.amount || 0; it.variant = variant; it.yaw = this.rand() * Math.PI * 2;
    for (const [name, m] of this.layout(variant, it)) { const gid = this.gid[name]; if (gid === undefined) continue; const iid = this.mesh.addInstance(gid); it.parts.push({ iid, m }); }
    const paper = variant === 'folded' || variant === 'loose';
    it.fly = { p0: new THREE.Vector3(p.x + (this.rand() - 0.5) * 0.2, y0 + 0.85 + this.rand() * 0.15, p.z + (this.rand() - 0.5) * 0.2), q0: new THREE.Quaternion().setFromEuler(_e.set((this.rand() - 0.5) * 2, this.rand() * 6.3, (this.rand() - 0.5) * 2)),
      T: paper ? 0.62 + this.rand() * 0.25 : 0.38 + this.rand() * 0.12, h: paper ? 0.05 + this.rand() * 0.06 : 0.08 + this.rand() * 0.08, bounce: paper ? 0 : 0.012 + this.rand() * 0.01, spin: (this.rand() - 0.5) * (paper ? 5 : 3), flutter: paper ? 0.035 : 0 };
    this.place(it, 0); return it;
  }
  // local layout of a pile's parts: [[geometry name, Matrix4 (item space, y = 0 on the ground)]]
  layout(v, it) {
    const R = this.rand, out = []; const at = (name, x, y, z, yaw, sy = 1, flip = false) => { _q.setFromEuler(_e.set(flip ? Math.PI : 0, yaw, 0)); out.push([name, new THREE.Matrix4().compose(new THREE.Vector3(x, y + (flip ? 0.0082 : 0), z), _q.clone(), new THREE.Vector3(1, sy, 1))]); };
    const bundle = (den, x, z, yaw, h, y = 0) => at('bundle' + den, x, y, z, yaw, h / 0.01);
    if (v === 'folded') at(it.amount >= 200 ? 'fold100' : 'fold100', 0, 0, 0, 0);
    else if (v === 'loose') { const n = Math.max(2, Math.min(4, Math.round(it.amount / 400))); const big = it.amount >= 1000; for (let i = 0; i < n; i++) { const a = R() * 6.28, d = i ? 0.03 + R() * 0.07 : 0; at(i === 0 && big ? 'note1000' : 'note100', Math.sin(a) * d, i * 0.0009, Math.cos(a) * d, R() * 6.28); } }
    else if (v === 'bundleS') { bundle(100, 0, 0, 0, Math.max(0.0015, it.amount / 100 * 0.0001)); if (R() < 0.6) at('note100', 0.05 + R() * 0.04, 0, 0.05 + R() * 0.03, R() * 6.28); }
    else if (v === 'bundleM') { bundle(100, 0, 0, 0, 0.004); bundle(1000, 0.035 + R() * 0.02, 0.03 + R() * 0.02, 0.4 + R() * 0.5, 0.0025); }
    else if (v === 'bundleL') { bundle(1000, -0.04, 0, 0, 0.005); bundle(1000, 0.045, 0.012, 0.12, 0.004); bundle(5000, 0, 0.004, 1.35 + R() * 0.3, 0.003, 0.0052); at('note1000', 0.02 + R() * 0.05, 0, -0.07 - R() * 0.03, R() * 6.28); }
    else if (v === 'wallet') at('wallet', 0, 0, 0, 0);
    else if (v === 'phone') at('phone', 0, 0, 0, 0, 1, R() < 0.5);
    else if (v === 'bag') { at('bag', 0, 0, 0, 0); at('strap', 0.02, 0, 0.03, 0.3 + R() * 0.6); }
    return out;
  }
  // the dropped weapon: the NPC's own model when it has one (the officer's T-56), else a model built from the definition
  dropWeapon(key, ev, d, y0) {
    if ([...this.items.values()].filter((i) => i.kind === 'weapon' && i.state !== 'gone').length >= LOOT.maxWeapons) this.expireOldest('weapon');
    const p = ev.p, def = WEAPONS[d.wi]; let m = d.model;
    const own = !!m; if (!m) m = buildWeaponModel(def);
    // resting pose: on its side, a random heading; its extent in that pose (visible parts only — the hidden torch / flash do not count)
    const side = this.rand() < 0.5 ? 1 : -1, yaw = this.rand() * Math.PI * 2; const qSide = new THREE.Quaternion().setFromEuler(_e.set(0, 0, side * Math.PI / 2)); const q1 = new THREE.Quaternion().setFromAxisAngle(UP, yaw).multiply(qSide);
    const bb = visibleBox(m, qSide); const half = Math.max(0.12, (bb.max.z - bb.min.z) / 2), halfX = Math.max(0.02, (bb.max.x - bb.min.x) / 2); const fwx = Math.sin(yaw), fwz = Math.cos(yaw);
    const col = this.g && this.g.collision;
    // its whole footprint (length × the width it lies with — the magazine sticks out sideways) clear of walls, flat, reachable
    const ends = (x, z, gy) => { for (const [a, l] of [[1, 0], [-1, 0], [1, 1], [1, -1], [-1, 1], [-1, -1], [0, 1], [0, -1]]) { const ex = x + fwx * half * a + fwz * halfX * l, ez = z + fwz * half * a - fwx * halfX * l;
      if (col && col.blocked(ex, ez, 0.03)) return false; if (Math.abs(this.groundAt(ex, ez, gy) - gy) > 0.04) return false; if (col && col.sweepSolid(x, z, ex, ez, gy, 0.3, 1.8) < 1) return false; } return true; };
    const s = this.spot(p.x, p.z, y0, 0.12, 0.6, 1.3, { x: p.x, z: p.z, yaw: p.yaw || 0 }, ends); if (!s) { this.stats.unplaced++; if (!own) disposeModel(m); return null; }
    const it = this.newItem(key, 'weapon', s.x, s.y, s.z, Math.min(0.5, half), LOOT.life.weapon); it.wi = d.wi; it.mag = d.mag; it.spare = d.spare; it.label = def.name; it.own = own;
    // the model leaves the NPC (its slung / held world transform), true scale; nothing of it fires or lights any more
    if (own) { if (ev.p.rifle === m) ev.p.rifle = null; } // PoliceResponse.disarm then has nothing to remove: the rifle is the loot's now
    m.updateWorldMatrix(true, true); const p0 = new THREE.Vector3(), q0 = new THREE.Quaternion(); m.matrixWorld.decompose(p0, q0, _p);
    if (!own) { p0.set(p.x, y0 + 1.0, p.z); q0.copy(q1); }
    const ud = m.userData || {}; if (ud.flash) ud.flash.visible = false; if (ud.torch) ud.torch.visible = false; if (ud.torchLens) ud.torchLens.visible = false;
    m.matrixAutoUpdate = true; m.scale.set(1, 1, 1); m.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); this.g && this.g.scene && this.g.scene.add(m); it.obj = m;
    // centre of the visible box on the spot (the box was measured about the model origin in the resting rotation)
    it.objLocal = new THREE.Vector3(-(bb.max.x + bb.min.x) / 2, -bb.min.y + 0.002, -(bb.max.z + bb.min.z) / 2).applyQuaternion(qSide.clone().invert()); // (model space)
    it.q1 = q1; it.yaw = yaw; it.fly = { p0, q0, T: 0.45 + this.rand() * 0.15, h: 0.1 + this.rand() * 0.06, bounce: 0.015 + this.rand() * 0.008, spin: 0, flutter: 0 };
    this.place(it, 0); return it;
  }

  // ---------------------------------------------------------------------------------------------- animation / matrices
  // k ∈ [0, ∞): flight time in seconds since the drop. Sets the parts (or the weapon object) to the pose at that time.
  place(it, t) {
    const F = it.fly; let px = it.x, py = it.y, pz = it.z, q = null;
    const qRest = it.kind === 'weapon' ? it.q1 : _q2.setFromAxisAngle(UP, it.yaw);
    if (F && t < F.T + 0.14) {
      const k = Math.min(1, t / F.T), e = smooth(k); const tx = it.x, tz = it.z;
      px = F.p0.x + (tx - F.p0.x) * k; pz = F.p0.z + (tz - F.p0.z) * k; py = F.p0.y + (it.y - F.p0.y) * k * k + F.h * 4 * k * (1 - k); // falls faster as it comes down
      if (F.flutter) { const s = Math.sin(k * Math.PI * 3) * F.flutter * (1 - k); px += s * Math.cos(it.yaw); pz -= s * Math.sin(it.yaw); }
      if (k >= 1 && F.bounce) { const tb = t - F.T; py = it.y + F.bounce * Math.sin(Math.PI * Math.min(1, tb / 0.14)); }
      q = _q.slerpQuaternions(F.q0, qRest, e); if (F.spin) q.premultiply(_q2.setFromAxisAngle(UP, F.spin * (1 - e))); q.normalize();
    } else q = _q.copy(qRest);
    if (it.state === 'take') { const k = Math.min(1, t / 0.25); const P = this.g && this.g.player; if (P) { px += (P.x - px) * 0.35 * k; pz += (P.z - pz) * 0.35 * k; } py += 0.25 * smooth(k); }
    const sc = it.state === 'take' ? 1 - 0.7 * Math.min(1, t / 0.25) : 1;
    if (it.obj) { const o = it.obj; o.quaternion.copy(q); o.scale.setScalar(sc); o.position.set(px, py, pz).add(_p.copy(it.objLocal).applyQuaternion(q)); return; } // the model origin offset so its visible box rests centred on the spot
    _m.compose(_p.set(px, py, pz), q, _s.set(sc, sc, sc));
    for (const pt of it.parts) { _m2.multiplyMatrices(_m, pt.m); this.mesh.setMatrixAt(pt.iid, _m2); }
  }
  update(dt, player) {
    const n = this.items.size; this.vis();
    if (!n) return; dt = Math.min(dt, 0.1); const indoor = !!(this.g && this.g.indoor);
    for (const it of this.items.values()) {
      if (it.obj) it.obj.visible = !indoor;
      if (it.state === 'fly') { it.t += dt; this.place(it, it.t); if (it.t >= it.fly.T + 0.14) { it.state = 'rest'; it.fly = null; this.place(it, 1e9); } }
      else if (it.state === 'take') { it.t += dt; this.place(it, it.t); if (it.t >= 0.25) this.remove(it); }
      else if (it.state === 'rest') it.age += dt;
    }
    this.failT = Math.max(0, this.failT - dt);
    if ((this.checkT -= dt) > 0) return; this.checkT = 0.5; this.expire(player); this.vis();
  }
  vis() { this.mesh.visible = this.items.size > 0 && !(this.g && this.g.indoor) && this.hasParts(); }
  hasParts() { for (const it of this.items.values()) if (it.parts.length) return true; return false; }
  inView(it) { const c = this.g && this.g.camera; if (!c) return false; _pm.multiplyMatrices(c.projectionMatrix, c.matrixWorldInverse); _fr.setFromProjectionMatrix(_pm); return _fr.containsPoint(_p.set(it.x, it.y + 0.05, it.z)); }
  expire(player) {
    const P = player || (this.g && this.g.player);
    for (const it of [...this.items.values()]) { if (it.state !== 'rest' || it.age < it.life) continue; const d = P ? Math.hypot(it.x - P.x, it.z - P.z) : 1e9; if (d < LOOT.keepNear && this.inView(it)) continue; this.remove(it); this.stats.expired++; }
  }
  // over the cap: the oldest resting item goes (one out of view / far first)
  cap() { while (this.items.size > LOOT.maxItems) { if (!this.expireOldest(null)) break; } }
  expireOldest(kind) {
    const P = this.g && this.g.player; let best = null, bs = -1e9;
    for (const it of this.items.values()) { if (kind && it.kind !== kind) continue; if (it.state === 'take') continue; const d = P ? Math.hypot(it.x - P.x, it.z - P.z) : 0; const s = it.age + (this.inView(it) ? 0 : 1000) + d; if (s > bs) { bs = s; best = it; } }
    if (best) { this.remove(best); this.stats.expired++; return true; } return false;
  }
  remove(it) {
    if (!this.items.has(it.id)) return; this.items.delete(it.id);
    for (const pt of it.parts) { try { this.mesh.deleteInstance(pt.iid); } catch (e) { /* already gone */ } } it.parts.length = 0; // back to the batch's pool
    if (it.obj) { it.obj.parent && it.obj.parent.remove(it.obj); disposeModel(it.obj); it.obj = null; }
    it.state = 'gone';
  }
  clear() { for (const it of [...this.items.values()]) this.remove(it); this.mesh.visible = false; } // load / new game: loot is never saved

  // ---------------------------------------------------------------------------------------------- interaction
  // called from Game.updateInteractions (on foot, outside): returns the prompt for the item in reach (or null) and takes it
  // when the interact key is pressed
  interact(P, key) {
    if (!this.items.size || !P) return null; const g = this.g;
    if (P.vehicle || P.boat || P.swim || P.entry || P.exiting || P.climb || P.diveIn || (g && (g.indoor || (g.health && g.health.busy) || (g.phone && g.phone.open) || (g.director && g.director.active)))) return null;
    const it = this.nearest(P); if (!it) return null;
    const label = it.kind === 'weapon' ? `COLLECT WEAPON · ${it.label}` : LABEL[it.kind];
    if (Input.wasPressed('interact')) { const r = this.pickup(it, P); if (r.ok && !(g && g.weapons && g.weapons.drawn) && P.ch && P.ch.anim) P.ch.anim.play('interact', 0.9); if (r.ok && r.plan && !r.plan.partial) return null; }
    return `${key('interact')} ${label}`;
  }
  // the item the player is reaching for: in range, at about the same height, in front rather than behind, not behind a wall
  nearest(P) {
    const col = this.g && this.g.collision; const py = typeof P.y === 'number' ? P.y : 0; const fx = Math.sin(P.yaw || 0), fz = Math.cos(P.yaw || 0); let best = null, bs = 1e9;
    for (const it of this.items.values()) { if (it.state !== 'rest') continue; const dx = it.x - P.x, dz = it.z - P.z, d = Math.hypot(dx, dz); if (d > LOOT.promptReach + it.r * 0.5 || Math.abs(it.y - py) > 1.1) continue;
      if (col && col.raycast(P.x, py + 1.2, P.z, it.x, it.y + 0.06, it.z, 0, false, 0.9) < 0.97) continue; // line of sight from the chest
      const s = d - 0.35 * (dx * fx + dz * fz) / (d || 1); if (s < bs) { bs = s; best = it; } }
    return best;
  }
  // what accepting this item would do, without doing it: { ok, why?, ...plan }
  receivePlan(it) {
    const g = this.g;
    if (it.kind === 'cash' || it.kind === 'wallet' || it.kind === 'bag') { if (!(g && g.story && g.story.state) || !(it.amount > 0)) return { ok: false, why: 'Nothing to take' }; return { ok: true, cash: it.amount }; }
    if (it.kind === 'phone') return g && g.story && g.story.state ? { ok: true } : { ok: false, why: 'Nothing to take' };
    if (it.kind === 'weapon') {
      const inv = g && g.weapons && g.weapons.inv; const slot = inv && inv[it.wi]; const def = WEAPONS[it.wi]; if (!slot || !def) return { ok: false, why: 'You can\'t carry that' };
      const total = Math.max(0, (it.mag | 0) + (it.spare | 0)); const cap = reserveCap(def);
      if (!slot.owned) { const mag = Math.min(def.mag, total); const reserve = Math.min(cap, total - mag); return { ok: true, mode: 'new', mag, reserve, rounds: mag + reserve, partial: false }; }
      const room = cap - slot.reserve; if (room <= 0 || total <= 0) return { ok: false, why: total <= 0 ? `The ${def.name} is empty` : `You can't carry any more ${def.name} rounds` };
      const take = Math.min(room, total); return { ok: true, mode: 'ammo', rounds: take, partial: take < total };
    }
    return { ok: false, why: 'You can\'t carry that' };
  }
  // the pickup, all or nothing: (1) the item exists (2) not already taken (3) the character can take it (4) purse / inventory
  // (5) sound (6) confirmation (7) the item leaves the world (8) marked done. A refusal changes nothing and leaves the item.
  pickup(it, P) {
    if (!it || this.items.get(it.id) !== it) return { ok: false, why: 'gone' };
    if (it.state !== 'rest' || this.collected.has(it.id)) return { ok: false, why: 'taken' };
    const plan = this.receivePlan(it); if (!plan.ok) { this.refuse(it, plan.why); return plan; }
    const partial = !!plan.partial; if (!partial) { this.collected.add(it.id); it.state = 'take'; }
    const snap = this.snapshot(it);
    try { this.commit(it, plan); } catch (e) { this.restore(it, snap); if (!partial) { this.collected.delete(it.id); it.state = 'rest'; } console.warn('loot pickup', e); this.refuse(it, 'Could not pick that up'); return { ok: false, why: 'error' }; }
    Audio.loot && Audio.loot(it.kind === 'cash' ? 'cash' : it.kind === 'weapon' ? 'weapon' : 'item'); this.confirm(it, plan);
    if (partial) { it.mag = Math.max(0, (it.mag | 0) + (it.spare | 0) - plan.rounds); it.spare = 0; } else { it.t = 0; this.stats.collected++; }
    return { ok: true, plan };
  }
  // what a pickup may change, so a failure part-way puts every bit of it back (purse, ledger, counters, the weapon slot)
  snapshot(it) { const S = this.g.story && this.g.story.state; const slot = it.kind === 'weapon' ? this.g.weapons.inv[it.wi] : null;
    return { money: S ? S.money : 0, ledger: S && S.ledger ? S.ledger.slice() : null, stats: S && S.stats ? JSON.stringify(S.stats) : null, slot: slot ? { mag: slot.mag, reserve: slot.reserve, owned: slot.owned } : null }; }
  restore(it, s) { const S = this.g.story && this.g.story.state; if (S) { S.money = s.money; if (s.ledger) S.ledger = s.ledger; if (s.stats) S.stats = JSON.parse(s.stats); } if (s.slot) Object.assign(this.g.weapons.inv[it.wi], s.slot); }
  commit(it, plan) {
    const g = this.g, S = g.story; const st = S.state.stats || (S.state.stats = {}); const T = st.loot || (st.loot = { cash: 0, wallets: 0, phones: 0, bags: 0, weapons: 0 });
    if (it.kind === 'weapon') { const slot = g.weapons.inv[it.wi];
      if (plan.mode === 'new') { slot.owned = true; slot.mag = plan.mag; slot.reserve = plan.reserve; T.weapons = (T.weapons | 0) + 1; } else slot.reserve += plan.rounds;
      if (g.weapons.showHolstered) g.weapons.showHolstered(); if (g.autosave) g.autosave(); return; } // a weapon is on disk straight away, like a purchase
    if (plan.cash) { S.pay(plan.cash, it.kind === 'cash' ? 'Cash picked up' : it.kind === 'wallet' ? 'Cash from a wallet' : 'Cash from a bag', { quiet: true }); T.cash = (T.cash | 0) + plan.cash; this.stats.cash += plan.cash; }
    if (it.kind === 'wallet') T.wallets = (T.wallets | 0) + 1; else if (it.kind === 'phone') T.phones = (T.phones | 0) + 1; else if (it.kind === 'bag') T.bags = (T.bags | 0) + 1;
  }
  confirm(it, plan) {
    const H = this.g && this.g.hud; if (!H) return; const def = WEAPONS[it.wi];
    if (it.kind === 'cash') H.notify(`+ ${rs(plan.cash)}`, 'Cash', 'loot', 2.2);
    else if (it.kind === 'wallet') H.notify('Wallet', `${rs(plan.cash)} inside`, 'loot', 2.6);
    else if (it.kind === 'bag') H.notify('Bag', `${rs(plan.cash)} inside`, 'loot', 2.6);
    else if (it.kind === 'phone') H.notify('Phone', 'Picked up', 'loot', 2.2);
    else if (plan.mode === 'new') H.notify(def.name, `Collected · ${plan.rounds} rounds`, 'loot', 2.8);
    else H.notify(def.name, `+${plan.rounds} rounds${plan.partial ? ' · carrying the maximum' : ''}`, 'loot', 2.6);
  }
  refuse(it, why) { this.stats.refused++; if (this.failT > 0) return; this.failT = 1.2; Audio.loot && Audio.loot('fail'); const H = this.g && this.g.hud; if (H) H.notify('Can\'t take that', why || '', 'loot fail', 2.4); }
}

// bounding box of the visible meshes of a model in rotation q about its origin
function visibleBox(m, q) {
  _box.makeEmpty(); const root = new THREE.Matrix4().makeRotationFromQuaternion(q);
  const walk = (o, M) => { if (!o.visible) return; if (o.isMesh && o.geometry) { if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); _b2.copy(o.geometry.boundingBox).applyMatrix4(M); _box.union(_b2); }
    for (const c of o.children) { if (c.matrixAutoUpdate) c.updateMatrix(); walk(c, new THREE.Matrix4().multiplyMatrices(M, c.matrix)); } };
  walk(m, root); return _box.isEmpty() ? new THREE.Box3(new THREE.Vector3(-0.05, -0.05, -0.4), new THREE.Vector3(0.05, 0.05, 0.4)) : _box.clone();
}
// geometry only (the weapon materials are shared by every gun in the game)
function disposeModel(m) { m.traverse((o) => { if (o.isMesh && o.geometry) o.geometry.dispose(); }); }
