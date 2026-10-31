// Gun shop + fists test (Node, headless): Ceylon Arms Co. catalogue and purchase rules (combat/Shop.js), the debug-state
// defaults, and the pedestrian reaction to punches (Crowd.punched: stumble, third punch in a row knocks down, never through walls).
import './node-dom-stub.mjs';
import * as THREE from 'three';
globalThis.localStorage ??= { getItem: () => null, setItem: () => {}, removeItem: () => {} };
if (!globalThis.addEventListener) globalThis.addEventListener = () => {}; if (!globalThis.navigator) globalThis.navigator = { getGamepads: () => [] }; else if (!navigator.getGamepads) navigator.getGamepads = () => [];
if (!globalThis.window) globalThis.window = globalThis; if (globalThis.document && !document.addEventListener) document.addEventListener = () => {};
{ const { MAT } = await import('../src/gfx/Materials.js'); for (const k of ['paint', 'metal', 'concrete', 'road', 'ballast']) MAT[k] ??= new THREE.MeshStandardMaterial({ vertexColors: true }); }
const { WEAPONS } = await import('../src/combat/Weapons.js');
const Shop = await import('../src/combat/Shop.js');
const S = await import('../src/actors/Squad.js');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };

// catalogue
const cat = Shop.catalogue();
ok(cat.length === 18 && cat.filter((i) => i.kind === 'weapon').length === 9, 'catalogue: nine weapons + nine ammunition packs');
ok(cat.every((i) => Number.isInteger(i.price) && i.price > 0 && i.blurb && i.blurb.length > 20), 'every item has an LKR price and a description');
ok(Shop.CATEGORIES.every((c) => cat.some((i) => i.cat === c.id)), 'every category has stock');
ok(cat.filter((i) => i.cat === 'pistol').every((i) => i.price < cat.find((q) => q.key === 'w:carbine').price), 'handguns cost less than rifles');
for (const w of WEAPONS) { const st = Shop.stats(w); ok(st.length === 5 && st.every(([, v]) => v > 0 && v <= 1), `${w.id} stat bars in 0..1`); }

// purchases for an unarmed member (Shashika's starting kit)
const sh = S.SQUAD_DEFS.find((d) => d.id === 'shashika'); const inv = S.freshInventory(sh); let money = 5000;
const item = (k) => cat.find((i) => i.key === k);
let r = Shop.purchase(item('w:service'), inv, money); ok(!r.ok && r.msg === 'Not enough money' && !inv[1].owned, 'cannot buy what you cannot afford');
r = Shop.purchase(item('a:compact'), inv, money); ok(!r.ok && /first/.test(r.msg), 'ammunition needs the weapon first');
r = Shop.purchase(item('w:compact'), inv, money); ok(r.ok && r.cost === 4500 && inv[0].owned && inv[0].mag === WEAPONS[0].mag && inv[0].reserve === WEAPONS[0].mag * 2, 'buying a weapon: owned, full magazine, two spare magazines');
money -= r.cost;
r = Shop.purchase(item('w:compact'), inv, 1e6); ok(!r.ok && r.msg === 'Already owned', 'a weapon is only bought once');
r = Shop.purchase(item('a:compact'), inv, money); ok(r.ok && r.cost === 380 && inv[0].reserve === WEAPONS[0].mag * 3, 'one pack adds one magazine of rounds');
const cap = Shop.reserveCap(WEAPONS[0]); inv[0].reserve = cap - 4; r = Shop.purchase(item('a:compact'), inv, 1e6); ok(r.ok && inv[0].reserve === cap && r.cost === Math.round(380 * 4 / WEAPONS[0].mag), 'top-up stops at the carry limit and is charged per round');
r = Shop.purchase(item('a:compact'), inv, 1e6); ok(!r.ok && /maximum/.test(r.msg), 'full: no sale');
r = Shop.purchase(item('w:heavy'), inv, 1e6, { wanted: true }); ok(!r.ok && /police/.test(r.msg) && !inv[2].owned, 'no service while wanted');
ok(Shop.quote(item('w:heavy'), inv, 1e6).ok && !inv[2].owned, 'quote never changes the inventory');

// debug state defaults
{ const { newDebugState } = await import('../src/ui/DebugConsole.js'); const D = newDebugState(); ok(D.menuEnabled === false && !D.god && !D.infAmmo && !D.noWanted && !D.freezeTime, 'debug menu and every cheat start disabled'); }

// punches
const CP = await import('../src/world/CityPlan.js'); CP.generatePlan();
const { Crowd } = await import('../src/actors/Crowd.js'); const { Collision } = await import('../src/world/Collision.js');
{ const col = new Collision(); const X = -300, Z = -120; col.add({ x0: X + 1.2, x1: X + 1.4, z0: Z - 20, z1: Z + 20, h: 4, kind: 'wall' });
  const ev = []; const C = new Crowd(new THREE.Scene(), col, { emit: (n) => ev.push(n), on() {} }); C.max = 1; C.prepareSpecs(1);
  const focus = { x: X, z: Z }; const ctx = { simTime: 0, vehicles: [], player: { x: X - 30, z: Z, vehicle: null, ch: null }, bodies: [], hourFactor: 1, hour: 12 }; const dt = 1 / 60;
  for (let i = 0; i < 40 && !C.peds.length; i++) C.update(dt, focus, [0, 1], ctx);
  const p = C.peds[0]; if (!p) ok(false, 'ped spawned'); else {
    p.x = X; p.z = Z; p.y = 0.15; p.keep = true; const src = { x: X - 0.9, z: Z };
    ok(C.punched(p, src) && p.state === 'stumble' && ev.includes('pedPunched'), 'first punch: the pedestrian stumbles back (event emitted)');
    let maxX = -1e9; for (let i = 0; i < 1.5 / dt; i++) { C.update(dt, focus, [0, 1], ctx); maxX = Math.max(maxX, p.x); }
    ok(maxX > X + 0.2 && maxX < X + 1.2 - 0.2, `pushed away from the puncher but not through the wall (max x ${(maxX - X).toFixed(2)})`);
    p.x = X; p.z = Z; C.punched(p, src); ok(p.state === 'stumble', 'second punch: stumble'); C.punched(p, src); ok(p.state === 'down', 'third punch within 6 s: knocked down');
    ok(C.punched(p, src) === false, 'no further punches register on someone already down');
  } }
console.log(`shop: ${pass + fail} checks, ${fail} failed`); process.exit(fail ? 1 : 0);
