// Loot test (Node, headless) — 64th, Phase 1A: physical cash / belongings / NPC weapon drops (src/world/Loot.js).
// The 17 required checks, each a numbered group below:
//   1 no weapon without eligible equipment · 2 an armed NPC can drop its weapon · 3 drops rest on valid ground · 4 never inside
//   walls (or under a car) · 5 cash is a physical object · 6 cash is collectable · 7 the balance is right · 8 a weapon is
//   collectable · 9 the inventory receives it · 10 a refused pickup leaves the object · 11 a double interaction gives nothing twice ·
//   12 a repeated defeat gives nothing twice · 13 expired objects are cleaned up · 14 the inventory still works · 15 NPC behaviour
//   still works · 16 combat is unchanged · 17 save / load never duplicates.
import './node-dom-stub.mjs';
import * as THREE from 'three';
import crypto from 'crypto';
const store = new Map(); globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k), key: (i) => [...store.keys()][i] ?? null, get length() { return store.size; } };
if (!globalThis.addEventListener) globalThis.addEventListener = () => {}; if (!globalThis.navigator) globalThis.navigator = { getGamepads: () => [] }; else if (!navigator.getGamepads) navigator.getGamepads = () => [];
if (globalThis.document && !document.addEventListener) document.addEventListener = () => {};
{ const { MAT } = await import('../src/gfx/Materials.js'); for (const k of ['paint', 'metal', 'concrete', 'road', 'ballast']) MAT[k] ??= new THREE.MeshStandardMaterial({ vertexColors: true }); }
const CP = await import('../src/world/CityPlan.js'); CP.generatePlan();
const Lay = await import('../src/world/Layout.js');
const { Collision } = await import('../src/world/Collision.js');
const { Events } = await import('../src/core/Events.js');
const { Loot, LOOT, cashVariant } = await import('../src/world/Loot.js');
const { lootGeometries, NOTE } = await import('../src/world/LootArt.js');
const { WEAPONS, POLICE_T56 } = await import('../src/combat/WeaponDefs.js');
const { buildT56 } = await import('../src/combat/WeaponModels.js');
const Shop = await import('../src/combat/Shop.js');
const { Story } = await import('../src/story/Story.js');
const { Input } = await import('../src/core/Input.js');
const { SaveSystem, SAVE_VERSION } = await import('../src/core/SaveSystem.js');
const { Weapons } = await import('../src/combat/Weapons.js');
const { Crowd } = await import('../src/actors/Crowd.js');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const T56 = WEAPONS.findIndex((w) => w.id === 'type56');

// a deterministic random source per run
const rng = (seed) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
// a small game: real Story.pay / ledger, the weapon inventory the squad uses, a HUD that records notifications
function makeGame(col, opts = {}) {
  const notes = []; const scene = new THREE.Scene(); const vehicles = opts.vehicles || [];
  const g = { scene, collision: col, traffic: { all: () => vehicles }, indoor: false, notes, hud: { notify: (t, b, k) => notes.push([t, b, k]) }, autosaves: 0 };
  g.autosave = () => { g.autosaves++; };
  const story = Object.create(Story.prototype); story.g = g; story.state = Story.freshState(); g.story = story;
  g.weapons = { inv: WEAPONS.map(() => ({ mag: 0, reserve: 0, owned: false })), sel: -1, drawn: false, showHolstered() {} };
  g.player = { x: 0, z: 0, y: 0, yaw: 0, ch: null };
  const cam = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 500); g.camera = cam;
  return g;
}
function lookAt(g, x, y, z) { const P = g.player; g.camera.position.set(P.x - Math.sin(P.yaw) * 3, (P.y || 0) + 2, P.z - Math.cos(P.yaw) * 3); g.camera.lookAt(x, y, z); g.camera.updateMatrixWorld(true); }
const settle = (L, g, s = 2) => { for (let i = 0; i < s * 60; i++) L.update(1 / 60, g.player); };
const press = () => Input.pressed.add(Input.code('interact')); const unpress = () => Input.pressed.clear();
const key = (a) => `[${a}]`;
const ped = (x, z, profile = 'office', extra = {}) => ({ x, z, y: Lay.surfaceY(x, z), yaw: 0.3, sp: { profile }, ...extra });
function officer(scene, x, z, withRifle = true) { const chest = new THREE.Object3D(); chest.position.set(x, Lay.surfaceY(x, z) + 1.3, z); scene.add(chest); const o = { x, z, y: Lay.surfaceY(x, z), yaw: 1.1, medic: false, rifle: null };
  if (withRifle) { const m = buildT56(); m.matrixAutoUpdate = false; m.position.set(0.1, 0, -0.15); m.updateMatrix(); chest.add(m); o.rifle = m; } return o; }
// an open, flat stretch of the map (any colliders a test needs are added to its own Collision)
const X = -300, Z = -120; const G0 = Lay.surfaceY(X, Z);
ok(!Lay.isWater(X, Z), 'test site is on land');

// ---------------------------------------------------------------------------------------------------------------- 1
{ const bus = new Events(); const g = makeGame(new Collision()); g.player.x = X + 30; g.player.z = Z + 45; const L = new Loot(g, { bus, rand: rng(1) });
  let weapons = 0, cash = 0; const profiles = Object.keys(LOOT.cash);
  for (let i = 0; i < 600; i++) { const r = L.onDefeat({ kind: 'ped', p: ped(X + (i % 20) * 3, Z + Math.floor(i / 20) * 3, profiles[i % profiles.length]) }) || []; for (const it of r) { if (it.kind === 'weapon') weapons++; if (it.kind === 'cash') cash++; } }
  ok(weapons === 0 && cash > 50, `1: 600 unarmed pedestrians: no weapon drops (${weapons}), cash from many (${cash})`);
  L.clear(); const med = officer(g.scene, X, Z, false); med.medic = true; LOOT.weapons.officer.chance = 1; bus.emit('npcDefeated', { kind: 'officer', p: med, rifle: null });
  const noRifle = officer(g.scene, X + 5, Z, false); bus.emit('npcDefeated', { kind: 'officer', p: noRifle, rifle: null });
  ok(![...L.items.values()].some((i) => i.kind === 'weapon'), '1: a medic / an officer without a rifle never drops a weapon (chance forced to 1)');
  const w = L.roll({ kind: 'ped', p: ped(X, Z), weapon: { id: 'no-such-gun', chance: 1 } }); ok(!w.some((i) => i.kind === 'weapon'), '1: an unknown weapon id is never invented');
  LOOT.weapons.officer.chance = 0.6; L.dispose(); }

// ---------------------------------------------------------------------------------------------------------------- 2, 3, 5
let shared = null;
{ const bus = new Events(); const col = new Collision(); const g = makeGame(col); g.player.x = X + 60; g.player.z = Z + 30; const L = new Loot(g, { bus, rand: rng(7) }); LOOT.weapons.officer.chance = 1;
  const o = officer(g.scene, X, Z); const rifle = o.rifle; bus.emit('npcDefeated', { kind: 'officer', p: o, rifle });
  const wi = [...L.items.values()].find((i) => i.kind === 'weapon');
  ok(!!wi && wi.wi === T56 && wi.obj === rifle && o.rifle === null, '2: an officer drops the T-56 he carried: the same model, mapped to the Type 56 slot, taken off him');
  ok(wi && wi.obj.parent === g.scene && wi.mag >= 8 && wi.mag <= 30, '2: the rifle is a world object with a partly used magazine (8–30)');
  let n = 0; for (let k = 0; k < 200; k++) { const oo = officer(g.scene, X + 40 + (k % 10) * 6, Z + Math.floor(k / 10) * 6); LOOT.weapons.officer.chance = 0.6; const r = L.onDefeat({ kind: 'officer', p: oo, rifle: oo.rifle }); if (r && r.some((i) => i.kind === 'weapon')) n++; L.clear(); }
  ok(n > 80 && n < 160, `2: with the configured chance (0.6) about 60 % of officers drop it (${n}/200) — not every NPC`);
  L.clear(); LOOT.weapons.officer.chance = 1;
  const o2 = officer(g.scene, X, Z); g.player.x = X - 1.2; g.player.z = Z; g.player.yaw = Math.PI / 2; bus.emit('npcDefeated', { kind: 'officer', p: o2, rifle: o2.rifle }); const p0 = ped(X + 0.2, Z + 0.5, 'tourist'); for (let k = 0; k < 6; k++) bus.emit('npcDefeated', { kind: 'ped', p: ped(X + 0.3 * k, Z + 0.5 + 0.2 * k, 'tourist') });
  const flying = [...L.items.values()].some((i) => i.state === 'fly'); settle(L, g, 2);
  ok(flying && [...L.items.values()].every((i) => i.state === 'rest'), '3: items leave the body in a short arc, then rest');
  const m = new THREE.Matrix4(), v = new THREE.Vector3(); let worst = 0, minY = 1e9, maxY = -1e9;
  for (const it of L.items.values()) { const gy = Lay.surfaceY(it.x, it.z); worst = Math.max(worst, Math.abs(it.y - gy));
    for (const pt of it.parts) { L.mesh.getMatrixAt(pt.iid, m); v.setFromMatrixPosition(m); minY = Math.min(minY, v.y - gy); maxY = Math.max(maxY, v.y - gy); } }
  ok(worst < 0.005, `3: every item rests at ground height (worst ${worst.toFixed(4)} m)`); ok(minY > -0.002 && maxY < 0.02, `3: parts lie on the ground, none sunk or floating (${minY.toFixed(4)}…${maxY.toFixed(4)} m)`);
  { const wit = [...L.items.values()].find((i) => i.kind === 'weapon'); const b = new THREE.Box3(); wit.obj.updateMatrixWorld(true); wit.obj.traverseVisible((q) => { if (q.isMesh) { q.geometry.computeBoundingBox(); b.union(q.geometry.boundingBox.clone().applyMatrix4(q.matrixWorld)); } });
    const gy = Lay.surfaceY(wit.x, wit.z); ok(Math.abs(b.min.y - gy) < 0.01, `3: the rifle lies on the ground (lowest point ${(b.min.y - gy).toFixed(3)} m)`);
    const len = b.max.clone().sub(b.min); ok(Math.max(len.x, len.z) > 0.8 && Math.max(len.x, len.z) < 1.1 && len.y < 0.1 && wit.obj.scale.x === 1, `3: … on its side at true scale (${Math.max(len.x, len.z).toFixed(2)} m long, ${len.y.toFixed(3)} m high)`); }
  const pos = [...L.items.values()].map((i) => `${i.x.toFixed(3)},${i.z.toFixed(3)}`); ok(new Set(pos).size === pos.length, '3: no two items share coordinates');
  // 5: physical cash
  const G = lootGeometries(); const size = (gg) => { gg.computeBoundingBox(); return gg.boundingBox.getSize(new THREE.Vector3()); };
  const n1 = size(G.note1000), b1 = size(G.bundle1000);
  ok(Math.abs(n1.x - NOTE.len) < 0.003 && Math.abs(n1.z - NOTE.wid) < 0.003 && n1.y < 0.006, `5: a note is 150 × 70 mm paper (${(n1.x * 1000).toFixed(0)} × ${(n1.z * 1000).toFixed(0)} × ${(n1.y * 1000).toFixed(1)} mm)`);
  ok(b1.x < 0.16 && b1.z < 0.08, '5: a bundle is note-sized');
  ok(L.mesh.isBatchedMesh && L.mat.isMeshStandardMaterial && L.mat.emissive.getHex() === 0 && !L.mat.transparent && L.mesh.castShadow, '5: cash is lit, shadow-casting geometry (no sprite, icon or glow)');
  const vars = new Set([100, 600, 2500, 5000, 9000].map(cashVariant)); ok(vars.size === 5, '5: five visual variants: folded note, loose notes, small / medium bundle, large collection');
  { let allParts = true; for (const [a, vname] of [[100, 'folded'], [800, 'loose'], [2500, 'bundleS'], [5000, 'bundleM'], [9000, 'bundleL']]) { const parts = L.layout(vname, { amount: a }); allParts = allParts && parts.length >= 1 && parts.every(([nm]) => L.gid[nm] !== undefined); } ok(allParts, '5: every variant is built from real note / bundle geometry'); }
  ok(Object.values(G).every((gg) => { const nrm = gg.attributes.normal; return gg.index && gg.attributes.uv && nrm; }), '5: every loot geometry has positions, normals and UVs (one batch)');
  { const top = (gg) => { const N = gg.attributes.normal, P = gg.attributes.position; let up = 0, upY = -1e9; for (let i = 0; i < N.count; i++) if (P.getY(i) > upY) { upY = P.getY(i); up = N.getY(i); } return up; }; ok(['note100', 'bundle1000', 'wallet', 'phone', 'strap'].every((k) => top(G[k]) > 0.5), '5: the top faces point up (visible, lit from above)'); }
  shared = { bus, g, L }; LOOT.weapons.officer.chance = 0.6; }

// ---------------------------------------------------------------------------------------------------------------- 4
{ const col = new Collision(); const W1 = X + 0.55, W0 = X - 0.9; col.add({ x0: W1, x1: W1 + 0.25, z0: Z - 15, z1: Z + 15, h: 3, kind: 'wall' }); col.add({ x0: W0 - 0.25, x1: W0, z0: Z - 15, z1: Z + 15, h: 3, kind: 'wall' }); col.add({ x0: X - 0.2, x1: X + 0.2, z0: Z + 2.2, z1: Z + 2.5, h: 1.2, kind: 'wall' });
  const car = { x: X, z: Z - 2.6, pushOut(px, pz, r) { return Math.abs(px - this.x) < 0.9 + r && Math.abs(pz - this.z) < 2.2 + r ? { x: px, z: pz } : null; } };
  const bus = new Events(); const g = makeGame(col, { vehicles: [car] }); g.player.x = X; g.player.z = Z; const L = new Loot(g, { bus, rand: rng(3) }); LOOT.weapons.officer.chance = 1; LOOT.cash.office[0] = 1;
  let n = 0, bad = 0, under = 0, through = 0, weapons = 0;
  for (let k = 0; k < 150; k++) { const z = Z - 1 + (k % 5) * 0.5; const p = k % 3 === 0 ? officer(g.scene, X, z) : ped(X + (k % 2 ? 0.2 : -0.3), z, 'office'); bus.emit('npcDefeated', { kind: k % 3 === 0 ? 'officer' : 'ped', p, rifle: p.rifle });
    for (const it of L.items.values()) { n++; if (it.kind === 'weapon') weapons++; if (col.blocked(it.x, it.z, Math.min(it.r, 0.1)) || it.x > W1 || it.x < W0) { bad++; console.log('bad', it.kind, it.x - X, it.z - Z, it.r); } if (car.pushOut(it.x, it.z, 0.02)) under++; if (col.sweepSolid(p.x, p.z, it.x, it.z, it.y, 0.3, 1.8) < 1) through++;
      if (it.kind === 'weapon') { const b = new THREE.Box3(); it.state = 'rest'; it.fly = null; L.place(it, 1e9); it.obj.updateMatrixWorld(true); it.obj.traverseVisible((q) => { if (q.isMesh) { q.geometry.computeBoundingBox(); b.union(q.geometry.boundingBox.clone().applyMatrix4(q.matrixWorld)); } }); if (b.max.x > W1 + 0.005 || b.min.x < W0 - 0.005) { bad++; console.log('badW', b.min.x - X, b.max.x - X, it.x - X, it.yaw); } } }
    L.clear(); }
  ok(n > 100 && weapons > 20, `4: ${n} drops (${weapons} rifles) placed beside bodies in a 1.45 m alley between two walls`);
  ok(bad === 0, `4: none inside or through a wall (${bad})`); ok(under === 0, `4: none under the parked car (${under})`); ok(through === 0, `4: every item is reachable from the body without crossing a wall (${through})`);
  // a body against a wall with no room at all: nothing is spawned rather than something invalid
  const tight = new Collision(); for (const [x0, x1, z0, z1] of [[X - 0.3, X - 0.1, Z - 3, Z + 3], [X + 0.1, X + 0.3, Z - 3, Z + 3], [X - 0.3, X + 0.3, Z + 0.15, Z + 0.4], [X - 0.3, X + 0.3, Z - 0.4, Z - 0.15]]) tight.add({ x0, x1, z0, z1, h: 3, kind: 'wall' });
  const g2 = makeGame(tight); g2.player.x = X; g2.player.z = Z; const L2 = new Loot(g2, { bus: new Events(), rand: rng(5) }); L2.onDefeat({ kind: 'ped', p: ped(X, Z, 'office') }); ok(L2.items.size === 0 && L2.stats.unplaced >= 1, '4: a body walled in on all sides leaves nothing rather than a drop inside a wall');
  // water: nothing lands in the harbour
  let wx = null; for (let x = -500; x < 900 && wx === null; x += 5) if (Lay.isWater(x, 0) && !Lay.isWater(x - 1.5, 0)) wx = x; if (wx !== null) { const g3 = makeGame(new Collision()); g3.player.x = wx; g3.player.z = 0; const L3 = new Loot(g3, { bus: new Events(), rand: rng(9) }); for (let k = 0; k < 40; k++) L3.onDefeat({ kind: 'ped', p: ped(wx - 1.5, 0, 'tourist') }); ok([...L3.items.values()].every((i) => !Lay.isWater(i.x, i.z)), '4: nothing lands in water beside a quay'); L3.dispose(); }
  LOOT.weapons.officer.chance = 0.6; LOOT.cash.office[0] = 0.8; L.dispose(); L2.dispose(); }

// ---------------------------------------------------------------------------------------------------------------- 6, 7, 8, 9, 10, 11
{ const { g, L } = shared; L.clear(); const bus = new Events(); const L2 = new Loot(g, { bus, rand: rng(11) }); L.dispose();
  const money0 = g.story.state.money; LOOT.cash.tourist[0] = 1; LOOT.belongings.wallet = 0; LOOT.belongings.phone = 0; LOOT.belongings.bag = 0;
  bus.emit('npcDefeated', { kind: 'ped', p: ped(X, Z, 'tourist') }); settle(L2, g, 2);
  const cash = [...L2.items.values()].find((i) => i.kind === 'cash'); g.player.x = cash.x - 0.8; g.player.z = cash.z; g.player.y = cash.y; g.player.yaw = Math.PI / 2; lookAt(g, cash.x, cash.y, cash.z);
  const pr = L2.interact(g.player, key); ok(/PICK UP CASH/.test(pr || ''), `6: in reach the prompt reads "PICK UP CASH" (${pr})`);
  g.player.x = cash.x - 4; ok(L2.interact(g.player, key) === null, '6: the prompt disappears out of reach'); g.player.x = cash.x - 0.8;
  press(); L2.interact(g.player, key); unpress(); const notes = g.notes.length;
  ok(g.story.state.money === money0 + cash.amount, `7: the purse grows by exactly the amount (${money0} → ${g.story.state.money}, +${cash.amount})`);
  ok(g.story.state.ledger[0] && g.story.state.ledger[0].n === cash.amount && /Cash/.test(g.story.state.ledger[0].why) && g.story.state.ledger[0].bal === g.story.state.money, '7: the bank ledger records the pick-up and the new balance');
  ok(g.notes.some(([t, , k]) => k === 'loot' && t === `+ Rs. ${cash.amount.toLocaleString('en-LK')}`), '7: a small confirmation in the game\'s currency format');
  // 11: pressing again while it is being picked up, and a direct second pickup: nothing more
  press(); L2.interact(g.player, key); unpress(); const r2 = L2.pickup(cash, g.player);
  ok(!r2.ok && g.story.state.money === money0 + cash.amount && g.notes.length === notes, '11: a second interaction / pickup of the same cash pays nothing');
  settle(L2, g, 0.5); ok(!L2.items.has(cash.id) && cash.parts.length === 0 && L2.pickup(cash, g.player).ok === false, '6: the collected cash leaves the world (its parts go back to the pool) and cannot be collected again');
  // wallet with cash inside
  LOOT.belongings.wallet = 1; const m1 = g.story.state.money; bus.emit('npcDefeated', { kind: 'ped', p: ped(X + 3, Z, 'office') }); settle(L2, g, 2); const wal = [...L2.items.values()].find((i) => i.kind === 'wallet');
  ok(!!wal, '7: a wallet can drop'); if (wal) { const r = L2.pickup(wal, g.player); ok(r.ok && g.story.state.money === m1 + wal.amount + 0 && g.story.state.stats.loot.wallets === 1, `7: the wallet\'s cash (${wal.amount}) is added once`); }
  LOOT.belongings.wallet = 0; LOOT.belongings.phone = 1; bus.emit('npcDefeated', { kind: 'ped', p: ped(X + 6, Z, 'office') }); settle(L2, g, 2); const ph = [...L2.items.values()].find((i) => i.kind === 'phone' && i.state === 'rest');
  if (ph) { g.player.x = ph.x - 0.8; g.player.z = ph.z; lookAt(g, ph.x, ph.y, ph.z); const pp = L2.interact(g.player, key); ok(/PICK UP PHONE/.test(pp || ''), '6: a phone reads "PICK UP PHONE"'); const mm = g.story.state.money; L2.pickup(ph, g.player); ok(g.story.state.money === mm && g.story.state.stats.loot.phones === 1, '7: a phone is a collectible (no money, counted)'); } else ok(false, 'phone dropped');
  LOOT.belongings.phone = 0.05; LOOT.belongings.wallet = 0.07; LOOT.belongings.bag = 0.04; LOOT.cash.tourist[0] = 0.85;
  // 8 / 9: the weapon
  LOOT.weapons.officer.chance = 1; const o = officer(g.scene, X + 10, Z); bus.emit('npcDefeated', { kind: 'officer', p: o, rifle: o.rifle }); settle(L2, g, 2);
  const w = [...L2.items.values()].find((i) => i.kind === 'weapon'); g.player.x = w.x - 0.9; g.player.z = w.z; g.player.yaw = Math.PI / 2; lookAt(g, w.x, w.y, w.z);
  const pw = L2.interact(g.player, key); ok(/COLLECT WEAPON · Type 56/.test(pw || ''), `8: the prompt reads "COLLECT WEAPON · Type 56" (${pw})`);
  const slot = g.weapons.inv[T56]; ok(!slot.owned, '9: (before: Type 56 not owned)'); const autos = g.autosaves;
  press(); L2.interact(g.player, key); unpress(); ok(slot.owned && slot.mag === Math.min(WEAPONS[T56].mag, w.mag) && slot.reserve === 0 && g.autosaves === autos + 1, `9: the Type 56 slot is owned with the dropped magazine's ${w.mag} rounds (saved like a purchase)`);
  settle(L2, g, 0.5); ok(!L2.items.has(w.id) && !w.obj, '8: the collected rifle leaves the world');
  ok(g.weapons.inv.filter((s) => s.owned).length === 1, '9: no other slot changed');
  // second rifle: an owned weapon takes the rounds into the reserve, up to the carry cap; what does not fit stays in the gun on the ground
  const o2 = officer(g.scene, X + 14, Z); bus.emit('npcDefeated', { kind: 'officer', p: o2, rifle: o2.rifle }); settle(L2, g, 2); const w2 = [...L2.items.values()].find((i) => i.kind === 'weapon');
  const cap = Shop.reserveCap(WEAPONS[T56]); slot.reserve = cap - 5; const total0 = w2.mag + w2.spare; const r5 = L2.pickup(w2, g.player);
  ok(r5.ok && slot.reserve === cap && L2.items.has(w2.id) && w2.state === 'rest' && r5.plan.rounds === 5 && w2.mag === total0 - 5, `9: owned: +5 rounds to the cap, the rest stays in the rifle on the ground (${w2.mag} left)`);
  // 10: full → refused, the rifle stays, nothing changes
  const before = JSON.stringify(g.weapons.inv), money = g.story.state.money, nn = g.notes.length; L2.failT = 0; const rf = L2.pickup(w2, g.player);
  ok(!rf.ok && /carry any more/.test(rf.why) && JSON.stringify(g.weapons.inv) === before && g.story.state.money === money, '10: at the carry cap the pickup is refused and nothing changes');
  ok(L2.items.has(w2.id) && w2.state === 'rest' && w2.obj && w2.obj.parent === g.scene && g.notes.length === nn + 1 && g.notes.at(-1)[2] === 'loot fail', '10: the rifle stays in the world, a short refusal is shown');
  { const S0 = g.story; g.story = null; const L3 = L2; bus.emit('npcDefeated', { kind: 'ped', p: ped(X + 20, Z, 'tourist') }); settle(L3, g, 2); const c = [...L3.items.values()].find((i) => i.kind === 'cash'); g.story = S0;
    if (c) { const st = g.story; g.story = { state: null }; const r = L3.pickup(c, g.player); g.story = st; ok(!r.ok && L3.items.has(c.id) && c.state === 'rest', '10: a pickup that cannot be accepted (no purse) leaves the cash where it lies'); } }
  { const c = [...L2.items.values()].find((i) => i.kind === 'cash' && i.state === 'rest'); if (c) { const S = g.story; const m0 = S.state.money; const realPay = S.pay, warn = console.warn; S.pay = function (n) { this.state.money += n; this.state.ledger.unshift({ n }); throw new Error('purse offline'); }; console.warn = () => {}; const led = S.state.ledger.length; const r = L2.pickup(c, g.player); S.pay = realPay; console.warn = warn; ok(S.state.ledger.length === led, '10: … the half-written ledger entry is taken back too'); ok(!r.ok && S.state.money === m0 && L2.items.has(c.id) && c.state === 'rest' && !L2.collected.has(c.id), '10: an error part-way rolls the pickup back (atomic): balance unchanged, cash still there'); } }
  LOOT.weapons.officer.chance = 0.6; shared.L = L2; shared.bus = bus; }

// ---------------------------------------------------------------------------------------------------------------- 12
{ const { g, L, bus } = shared; L.clear(); const p = ped(X, Z, 'tourist'); LOOT.cash.tourist[0] = 1; bus.emit('npcDefeated', { kind: 'ped', p }); const n1 = L.items.size; bus.emit('npcDefeated', { kind: 'ped', p }); L.onDefeat({ kind: 'ped', p });
  ok(n1 >= 1 && L.items.size === n1 && L.stats.repeats === 2, '12: the same defeat reported again drops nothing more');
  // the real crowd: kill() twice → one event
  const bus2 = new Events(); let ev = 0; bus2.on('npcDefeated', () => ev++); const col = new Collision(); const C = new Crowd(new THREE.Scene(), col, bus2); C.max = 1; C.prepareSpecs(1);
  const focus = { x: X, z: Z }; const ctx = { simTime: 0, vehicles: [], player: { x: X - 30, z: Z, vehicle: null, ch: null }, bodies: [], hourFactor: 1, hour: 12 };
  for (let i = 0; i < 60 && !C.peds.length; i++) C.update(1 / 30, focus, [0, 1], ctx); const cp = C.peds[0];
  if (cp) { cp.x = X; cp.z = Z; cp.keep = true; C.kill(cp); C.kill(cp); C.hitPed && C.hitPed(cp, 1, 0, 2); ok(ev === 1 && cp.dead && cp.state === 'down', `12: Crowd.kill emits one defeat however often it is called (${ev})`); shared.crowd = { C, cp, ctx, focus, bus2 }; } else ok(false, 'crowd ped spawned');
  LOOT.cash.tourist[0] = 0.85; }

// ---------------------------------------------------------------------------------------------------------------- 13
{ const { g, L, bus } = shared; L.clear(); LOOT.cash.office[0] = 1; for (let k = 0; k < 6; k++) bus.emit('npcDefeated', { kind: 'ped', p: ped(X + k * 3, Z, 'office') }); settle(L, g, 2);
  const n0 = L.items.size, inst0 = L.mesh.instanceCount; ok(n0 >= 6 && inst0 >= 6, `13: (${n0} items, ${inst0} batch parts)`);
  g.player.x = X + 7; g.player.z = Z - 1.5; g.player.yaw = 0; lookAt(g, X + 7, G0, Z); for (const it of L.items.values()) it.age = 1e4; L.checkT = 0; L.update(1 / 60, g.player);
  const kept = L.items.size; ok(kept > 0 && kept < n0, `13: expired items far away or out of view are tidied away, those in front of the player stay (${n0} → ${kept})`);
  g.player.x = X + 200; g.player.z = Z + 200; L.checkT = 0; L.update(1 / 60, g.player); ok(L.items.size === 0 && L.mesh.instanceCount === 0 && !L.mesh.visible, '13: once the player has left, they go too; every batch part back in the pool, the batch hidden');
  g.player.x = X; g.player.z = Z; for (let k = 0; k < 80; k++) bus.emit('npcDefeated', { kind: 'ped', p: ped(X + (k % 10) * 3, Z + Math.floor(k / 10) * 3, 'office') }); ok(L.items.size <= LOOT.maxItems, `13: never more than ${LOOT.maxItems} items in the world (${L.items.size})`);
  { L.clear(); LOOT.weapons.officer.chance = 1; for (let k = 0; k < 7; k++) { const o = officer(g.scene, X + k * 4, Z + 10); bus.emit('npcDefeated', { kind: 'officer', p: o, rifle: o.rifle }); } ok([...L.items.values()].filter((i) => i.kind === 'weapon').length <= LOOT.maxWeapons, '13: at most four rifles lie around'); LOOT.weapons.officer.chance = 0.6; }
  { L.clear(); bus.emit('npcDefeated', { kind: 'ped', p: ped(X, Z, 'office') }); settle(L, g, 2); for (const it of L.items.values()) it.age = it.life - 1; L.checkT = 0; L.update(0.016, g.player); ok(L.items.size >= 1, '13: nothing goes before its lifetime (no drops vanishing too fast)'); }
  { g.indoor = true; L.update(0.016, g.player); ok(!L.mesh.visible, '13: hidden while the player is indoors'); g.indoor = false; L.update(0.016, g.player); ok(L.mesh.visible, '13: back outside, visible again'); }
  { let subs = 0; const fake = { on: (n, f) => { subs++; return () => { subs--; }; } }; const Lx = new Loot(g, { bus: fake }); ok(subs === 1, '13: one bus subscription per loot system'); Lx.dispose(); ok(subs === 0, '13: … removed on dispose'); }
  LOOT.cash.office[0] = 0.8; }

// ---------------------------------------------------------------------------------------------------------------- 14
{ const { g } = shared; const inv = g.weapons.inv; const cat = Shop.catalogue(); const item = cat.find((i) => i.key === 'w:assault'); const r = Shop.purchase(item, inv, 1e6, {});
  ok(r.ok && inv[item.slot].owned && inv[item.slot].reserve === item.w.mag * 2, '14: the gun shop still sells into the same inventory');
  const ammo = cat.find((i) => i.key === 'a:type56'); const ra = Shop.quote(ammo, inv, 1e6, {}); ok(!ra.ok && ra.full, '14: the shop sees the Type 56 rounds picked up (at the carry cap)');
  const sv = Weapons.prototype.save.call({ inv, sel: T56, g: {}, heat: 0 }); const fresh = { inv: WEAPONS.map(() => ({ mag: 0, reserve: 0, owned: false })), sel: -1, forceHolster() {}, showHolstered() {}, g: {} }; fresh.inv[T56].owned = true; fresh.inv[item.slot].owned = true;
  Weapons.prototype.load.call(fresh, sv); ok(fresh.inv[T56].reserve === inv[T56].reserve && fresh.inv[T56].mag === inv[T56].mag, '14: Weapons.save / load carry the picked-up rounds'); }

// ---------------------------------------------------------------------------------------------------------------- 15
{ const { C, cp, ctx, focus } = shared.crowd; let threw = null; try { for (let i = 0; i < 150; i++) C.update(1 / 30, focus, [0, 1], ctx); } catch (e) { threw = e; }
  ok(!threw && cp.dead && cp.state === 'down', `15: the crowd keeps simulating with a defeated pedestrian (${threw ? threw.message : 'ok'})`);
  ok(C.nearest(cp.x, cp.z, 3) !== cp, '15: Crowd.nearest still skips people on the ground');
  const col = new Collision(); const bus3 = new Events(); const C2 = new Crowd(new THREE.Scene(), col, bus3); C2.max = 1; C2.prepareSpecs(1); const ctx2 = { ...ctx }; for (let i = 0; i < 60 && !C2.peds.length; i++) C2.update(1 / 30, focus, [0, 1], ctx2);
  const q = C2.peds[0]; if (q) { q.keep = true; const x0 = q.x; C2.knock(q, 1, 0, 5, 0.2); for (let i = 0; i < 30; i++) C2.update(1 / 30, focus, [0, 1], ctx2); ok(!q.dead && q.state === 'down', '15: a low-speed knock-down still only floors (the loot hooks only incapacitation)'); }
  // police: killOfficer without the loot system still disarms (the rifle comes off), with it the rifle becomes loot
  const { PoliceResponse } = await import('../src/police/PoliceResponse.js'); const pr = Object.create(PoliceResponse.prototype); const scene = new THREE.Scene();
  pr.g = { scene, ragdolls: null, player: { x: X, z: Z } }; pr.bodies = []; pr.stats = {}; pr.note = () => {}; pr.abandonUnit = () => {}; let disarmed = 0; pr.ff = { disarm: (o) => { disarmed++; if (o.rifle) { o.rifle.parent?.remove(o.rifle); o.rifle = null; } } };
  const mkO = () => { const o = officer(scene, X, Z); o.ch = { rag: null, root: new THREE.Object3D(), anim: { ik: 1, aim: 1, set() {}, board: null }, face: { set() {} } }; o.unit = null; return o; };
  const o1 = mkO(); const r1 = o1.rifle; pr.killOfficer(o1); ok(o1.dead && disarmed === 1 && !r1.parent && o1.rifle === null, '15: an officer goes down and is disarmed as before');
  const gL = makeGame(new Collision()); gL.scene = scene; gL.player.x = X; gL.player.z = Z; const { bus } = await import('../src/core/Events.js'); const Lg = new Loot(gL, { bus, rand: rng(2) }); LOOT.weapons.officer.chance = 1;
  const o2 = mkO(); const r2 = o2.rifle; pr.killOfficer(o2); ok(o2.dead && r2.parent === scene && [...Lg.items.values()].some((i) => i.obj === r2), '15: with the loot system his T-56 stays in the world as a pickup');
  pr.killOfficer(o2); ok([...Lg.items.values()].filter((i) => i.kind === 'weapon').length === 1, '15: killOfficer on a dead officer adds nothing'); Lg.dispose(); LOOT.weapons.officer.chance = 0.6; }

// ---------------------------------------------------------------------------------------------------------------- 16
{ const h = crypto.createHash('sha256').update(JSON.stringify([WEAPONS, POLICE_T56])).digest('hex');
  ok(h === '147c055fc63350292f871d90e39a5bb08aff36c42197c1598b612f10728d0d7a', '16: every weapon definition (27 + police T-56: damage, rate, spread, recoil, magazines) is exactly as before');
  const src = (await import('fs')).readFileSync(new URL('../src/world/Loot.js', import.meta.url), 'utf8');
  ok(!/\.fire\(|applyHit|\.dmg\s*=|\.rof\s*=|\.recoil\s*=|cb\.mag/.test(src), '16: the loot code never touches firing, damage, recoil or the officers\' combat state');
  const { C } = shared.crowd; const bus4 = new Events(); const C3 = new Crowd(new THREE.Scene(), new Collision(), bus4); C3.max = 1; C3.prepareSpecs(1); const { ctx, focus } = shared.crowd; for (let i = 0; i < 60 && !C3.peds.length; i++) C3.update(1 / 30, focus, [0, 1], ctx);
  const q = C3.peds[0]; if (q) { q.keep = true; C3.hitPed(q, 1, 0, 1.0); const one = q.dead; C3.hitPed(q, 1, 0, 0.3); ok(!one && q.dead, '16: a pedestrian still goes down for good on the same hit total as before (1.2)'); } else ok(false, 'C3 ped'); }

// ---------------------------------------------------------------------------------------------------------------- 17
{ const { g, L, bus } = shared; L.clear(); LOOT.cash.office[0] = 1; const p = ped(X, Z, 'office'); bus.emit('npcDefeated', { kind: 'ped', p }); settle(L, g, 2);
  const c = [...L.items.values()].find((i) => i.kind === 'cash'); L.pickup(c, g.player); settle(L, g, 0.5); const money = g.story.state.money, inv = JSON.stringify(g.weapons.inv.map((s) => [s.mag, s.reserve, s.owned]));
  // an uncollected drop at save time
  bus.emit('npcDefeated', { kind: 'ped', p: ped(X + 5, Z, 'office') }); settle(L, g, 2); const pending = L.items.size; ok(pending >= 1, '17: (a drop still lying in the world when the game is saved)');
  SaveSystem.write('1', { story: g.story.serialize(), weapons: Weapons.prototype.save.call({ inv: g.weapons.inv, sel: -1, g: {}, heat: 0 }) });
  // more play after the save: pick up the pending drop, then load the save
  for (const it of [...L.items.values()]) L.pickup(it, g.player); const afterMoney = g.story.state.money; ok(afterMoney > money, '17: (picked up after saving)');
  const d = SaveSystem.read('1'); g.story.restore(d.story); L.clear(); const w2 = { inv: WEAPONS.map(() => ({ mag: 0, reserve: 0, owned: false })), sel: -1, forceHolster() {}, showHolstered() {}, g: {} }; g.weapons.inv.forEach((s, i) => { w2.inv[i].owned = s.owned; }); Weapons.prototype.load.call(w2, d.weapons);
  ok(g.story.state.money === money, `17: the loaded purse is the saved one: collected cash kept, the later pickup not doubled (${g.story.state.money})`);
  ok(JSON.stringify(w2.inv.map((s) => [s.mag, s.reserve, s.owned])) === inv, '17: the loaded weapon inventory is the saved one (no duplicated rifle / rounds)');
  ok(L.items.size === 0 && L.mesh.instanceCount === 0, '17: no loot survives a load (nothing can be picked up twice)');
  bus.emit('npcDefeated', { kind: 'ped', p }); ok(L.items.size === 0, '17: the saved defeat re-reported after loading rewards nothing');
  const raw = JSON.parse(store.get('colombo.save.1')); ok(raw.version === SAVE_VERSION && SAVE_VERSION === 5, '17: current save format version (v5 since the 67th bank account; loot itself added no migration)');
  { const old = Story.freshState(); delete old.stats.loot; g.story.restore({ ...old, money: 1000 }); bus.emit('npcDefeated', { kind: 'ped', p: ped(X + 9, Z, 'office') }); settle(L, g, 2); const cc = [...L.items.values()].find((i) => i.kind === 'cash'); const r = cc && L.pickup(cc, g.player); ok(r && r.ok && g.story.state.money === 1000 + cc.amount && g.story.state.stats.loot.cash === cc.amount, '17: an old save (no loot counters) picks up cash fine'); }
  LOOT.cash.office[0] = 0.8; }

// ---------------------------------------------------------------------------------------------------------------- economy / budget
{ const L = new Loot(makeGame(new Collision()), { bus: new Events(), rand: rng(21) }); let sum = 0, n = 0; for (let k = 0; k < 4000; k++) { const prof = Object.keys(LOOT.cash)[k % 17]; for (const it of L.roll({ kind: 'ped', p: { x: 0, z: 0, sp: { profile: prof } } })) if (it.amount) { sum += it.amount; n++; } }
  const avg = sum / 4000; ok(avg > 300 && avg < 2500, `economy: a defeated pedestrian is worth Rs. ${avg.toFixed(0)} on average (a delivery job pays Rs. 500–1,500; a Type 56 costs Rs. 30,000)`);
  const G = lootGeometries(); let nv = 0; for (const gg of Object.values(G)) nv += gg.attributes.position.count; ok(nv < 3000, `budget: all loot geometry together is ${nv} vertices in one batch (one draw call)`); L.dispose(); }

console.log(`loot: ${pass + fail} checks, ${fail} failed`); process.exit(fail ? 1 : 0);
