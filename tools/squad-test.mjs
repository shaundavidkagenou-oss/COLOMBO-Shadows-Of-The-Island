// Squad switching test (Node): the pure parts of the multi-character system — squad definitions and loadouts, transit
// path / duration / cut selection, formation slots, refusal reasons, momentum carry-over, the save v2 → v3 migration and
// mission leads. The live transition, follower AI and takeovers are exercised in the headless browser runs (dev/headless).
import './node-dom-stub.mjs';
// browser globals the input / settings modules touch at import time
if (!globalThis.localStorage) { const m = new Map(); globalThis.localStorage = { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; }
if (!globalThis.addEventListener) globalThis.addEventListener = () => {}; if (!globalThis.navigator) globalThis.navigator = { getGamepads: () => [] }; else if (!navigator.getGamepads) navigator.getGamepads = () => [];
if (!globalThis.window) globalThis.window = globalThis; if (globalThis.document && !document.addEventListener) document.addEventListener = () => {}; if (!globalThis.performance) globalThis.performance = { now: () => Date.now() };
const THREE = await import('three');
const S = await import('../src/actors/Squad.js');
const { WEAPONS } = await import('../src/combat/Weapons.js');
const { HEROES } = await import('../src/actors/Character.js');
const { migrate, SAVE_VERSION } = await import('../src/core/SaveSystem.js');
let fails = 0, n = 0; const ok = (c, msg) => { n++; if (!c) { fails++; console.log('  FAIL', msg); } };

// definitions
ok(S.SQUAD_IDS.join() === 'dineth,shashika,david', 'three protagonists in order');
for (const d of S.SQUAD_DEFS) {
  ok(HEROES[d.id], `${d.id} has a hero spec`); ok(['F1', 'F2', 'F3'].includes(d.key), `${d.id} key`);
  ok(d.loadout.every((id) => WEAPONS.some((w) => w.id === id)) && d.loadout.includes(d.primary), `${d.id} loadout uses real weapons`);
  const inv = S.freshInventory(d); ok(inv.length === 9 && inv.filter((v) => v.owned).length === d.loadout.length, `${d.id} inventory`);
  ok(d.speed > 0.8 && d.speed < 1.2 && d.armor > 0.5 && d.armor <= 1 && d.steady > 0.3 && d.steady <= 1, `${d.id} perks in range`);
}
ok(HEROES.shashika.sex === 'm', 'Shashika is male');
const all = S.SQUAD_DEFS.flatMap((d) => d.loadout); ok(new Set(all).size === 9 && all.length === 9, 'the nine weapons are split between the three, no duplicates');
// transit
const A = new THREE.Vector3(0, 2, 0), B = new THREE.Vector3(40, 2, 10); const [p1, p2, lift] = S.transitControls(A, B);
ok(lift > 0.5 && lift <= 30 && p1.y > A.y && p2.y > B.y, 'transit arcs upward');
ok(S.bezier3(A, p1, p2, B, 0).distanceTo(A) < 1e-9 && S.bezier3(A, p1, p2, B, 1).distanceTo(B) < 1e-9, 'Bezier endpoints');
let prev = A.clone(), mono = true; for (let i = 1; i <= 20; i++) { const p = S.bezier3(A, p1, p2, B, S.easeInOutCubic(i / 20)); if (p.distanceTo(B) > prev.distanceTo(B) + 1e-6) mono = false; prev = p; } ok(mono, 'transit approaches the target monotonically');
ok(S.transitDuration(0) === 0.55 && S.transitDuration(1000) === 1.15 && S.transitDuration(100) > 0.55, 'transit duration 0.55–1.15 s');
ok(S.pickStyle(50, true) === 'transit' && S.pickStyle(300, true) === 'cut' && S.pickStyle(50, false) === 'cut', 'auto style: transit near, cut far / blocked');
ok(S.pickStyle(300, false, 'transit') === 'transit' && S.pickStyle(10, true, 'cut') === 'cut', 'style setting forces');
const far = S.transitControls(new THREE.Vector3(), new THREE.Vector3(5000, 0, 0))[2]; ok(far === 30, 'lift capped at 30 m');
// formation: both slots behind the leader, on opposite sides
for (const yaw of [0, 1, -2.5]) { const fx = Math.sin(yaw), fz = Math.cos(yaw); const s0 = S.formationSlot(0, 0, yaw, 0), s1 = S.formationSlot(0, 0, yaw, 1);
  ok(s0[0] * fx + s0[1] * fz < -1 && s1[0] * fx + s1[1] * fz < -1, `slots behind (yaw ${yaw})`); const rx = Math.cos(yaw), rz = -Math.sin(yaw); ok(Math.sign(s0[0] * rx + s0[1] * rz) !== Math.sign(s1[0] * rx + s1[1] * rz), `slots on both sides (yaw ${yaw})`); }
// refusals
ok(S.switchBlock({}) === null, 'free switch allowed'); ok(S.switchBlock({ locked: true }) === 'Squad not assembled yet', 'locked');
ok(/leads this mission/.test(S.switchBlock({ missionLead: 'David' })), 'mission lead'); ok(S.switchBlock({ vehicle: true }) === null, 'switching inside a vehicle is allowed'); ok(/police/.test(S.switchBlock({ wanted: true })), 'no switching while wanted'); ok(/conversation/.test(S.switchBlock({ dialogue: true })), 'dialogue');
// momentum: starts on the departing heading/speed, ends on the AI's
const m0 = S.momentumBlend({ t: 4, dur: 4, yaw: 1, speed: 5 }, 0, 1), m1 = S.momentumBlend({ t: 0, dur: 4, yaw: 1, speed: 5 }, 0, 1), mh = S.momentumBlend({ t: 2, dur: 4, yaw: 1, speed: 5 }, 0, 1);
ok(Math.abs(m0.yaw - 1) < 1e-9 && m0.speed === 5 && m1.yaw === 0 && m1.speed === 1 && mh.speed > 1 && mh.speed < 5, 'momentum carries over and blends out');
// save migration
ok(SAVE_VERSION === 3, 'save v3'); const v3 = migrate({ version: 2, story: { done: ['m0', 'm1'], health: 70 }, weapons: { inv: WEAPONS.map((w, i) => [i, 10 * i]), sel: 0 } });
ok(v3.squad.unlocked && v3.squad.active === 'dineth' && v3.squad.members.dineth.inv.filter((q) => q[2]).length === 2 && v3.squad.members.dineth.sel === 1, 'v2 → v3: Dineth with his own loadout');
// mission leads
const { MISSIONS } = await import('../src/story/Story.js').catch(() => ({}));
if (MISSIONS) { const list = Array.isArray(MISSIONS) ? MISSIONS : Object.values(MISSIONS); ok(list.length >= 6 && list.every((m) => S.SQUAD_IDS.includes(m.lead)), 'every mission names a squad lead'); ok(new Set(list.map((m) => m.lead)).size === 3, 'each protagonist leads at least one mission'); ok(list.filter((m) => m.squad).length >= 3 && list.some((m) => m.squad === false), 'only some missions bring the squad along'); }
else ok(false, 'Story.js MISSIONS export');
{ const { JOBS } = await import('../src/actors/SquadLife.js'); ok(S.SQUAD_IDS.every((id) => JOBS[id] && JOBS[id].label), 'every protagonist has his own job'); ok(JOBS.dineth.kind === 'tuk', 'Dineth drives a three-wheeler'); }
{ const src = (await import('node:fs')).readFileSync(new URL('../src/actors/Squad.js', import.meta.url), 'utf8'); ok(!/holding position|hold \/ follow/.test(src), 'no hold / follow orders'); }
console.log(`squad: ${n} checks, ${fails} failed`); if (fails) process.exit(1);
