// Weapon selection + hold test (Node): the REAL Weapons / Animator / HeroRig / GripSolver code on a hero with a stub
// game. Checks that
//  · long guns come straight into the hands (never via the back sling) and swaps are fast (no full put-away wait);
//  · a pistol drawn from empty hands still comes from the hip holster;
//  · fast mouse-wheel flicks count every notch, settle quickly, and a click while scrolling picks the highlighted weapon
//    without firing / drawing the old one; changing your mind mid-draw retargets at once; scrolling back to the weapon
//    being put away brings it straight back up;
//  · the solved hands touch the weapon: trigger pad on the trigger, thumbs where they belong, both wrists reached by the
//    arm IK when aiming, and finger joints that stay inside the HeroRig limits.
import './node-dom-stub.mjs';
const el = () => ({ style: { setProperty() {}, removeProperty() {} }, classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, appendChild(c) { return c; }, append() {}, remove() {}, setAttribute() {}, querySelector: () => el(), querySelectorAll: () => [], addEventListener() {}, children: [], innerHTML: '', textContent: '', getContext: () => null, width: 1, height: 1 });
const doc = globalThis.document; const ce = doc.createElement; doc.createElement = (t) => Object.assign(ce(t), el(), { getContext: ce(t).getContext });
doc.body = el(); doc.addEventListener = () => {}; doc.querySelector = () => el(); globalThis.addEventListener = globalThis.addEventListener || (() => {}); globalThis.localStorage = globalThis.localStorage || { getItem: () => null, setItem() {}, removeItem() {} };
const THREE = await import('three');
const { Character, HEROES } = await import('../src/actors/Character.js');
const { Weapons, WEAPONS } = await import('../src/combat/Weapons.js');
const { Input } = await import('../src/core/Input.js');
const { Player } = await import('../src/actors/Player.js');
const { holdFor } = await import('../src/combat/GripSolver.js');

let fails = 0, passes = 0; const ok = (c, msg) => { if (c) passes++; else { fails++; console.log('  FAIL', msg); } };
const ch = new Character(HEROES[process.env.HERO || 'dineth']); const scene = new THREE.Scene(); scene.add(ch.root);
const P = { ch, x: 0, y: 0, z: 0, yaw: 0, camYaw: -Math.PI, camPitch: 0, camMode: 0, speed: 0, stamina: 1, position: ch.root.position, rotation: ch.root.rotation };
P.fpEyeLook = Player.prototype.fpEyeLook.bind(P);
const game = { player: P, scene, camera: new THREE.PerspectiveCamera(), hud: { root: el() }, crowd: { peds: [] }, police: null, debug: null, collision: { raycast: () => 1, groundAt: () => 0, query: () => [] }, timeSlow: 1, birds: null, traffic: { all: () => [] }, blood: null, health: null };
const W = new Weapons(game); P.weapons = W; const A = ch.anim; const STEP = 1 / 60;
const frame = () => { W.update(STEP, true); A.update(STEP, 0); Input.endFrame(); };
const run = (sec, each) => { for (let t = 0; t < sec; t += STEP) { frame(); if (each) each(); } };
const until = (pred, max = 3) => { let t = 0; while (t < max && !pred()) { frame(); t += STEP; } return t; };
run(0.3);

// ---- 1. rifle from empty hands: in the hands, never on the back sling while drawing
W.select(3); ok(W.state === 'equip' && W.drawMode === 'hands', `rifle draw is in-hand (state ${W.state}, mode ${W.drawMode})`);
let onBack = false; const t1 = until(() => { if (W.models[3].parent === W.holsterR && W.models[3].visible) onBack = true; return W.state === 'ready'; });
ok(!onBack, 'rifle never drawn from the back sling'); ok(t1 < 0.45, `rifle up in ${t1.toFixed(2)} s (< 0.45)`);
ok(W.models[3].parent === W.inHand && W.models[3].visible, 'rifle in the hands when ready');

// ---- 2. swap rifle → pistol: quick put-away in the hands, pistol straight into the hands
W.select(1); ok(W.state === 'holster' && W.drawMode === 'hands', 'rifle put-away happens in the hands during a swap');
let backAgain = false; const t2 = until(() => { if (W.models[3].parent === W.holsterR && W.models[3].visible && W.state !== 'none') backAgain = true; return W.state === 'ready' && W.cur === 1; });
ok(!backAgain, 'rifle not shown on the back during the swap'); ok(t2 < 0.6, `rifle → pistol swap in ${t2.toFixed(2)} s (< 0.6)`);

// ---- 3. changed mind mid-draw: retarget instantly, no put-away
W.select(4); until(() => W.state === 'equip', 1); run(0.08); ok(W.state === 'equip' && W.cur === 4, 'drawing the assault rifle');
W.select(5); ok(W.state === 'equip' && W.cur === 5 && !W.models[4].visible, 'mid-draw selection switches straight to the new weapon');
const t3 = until(() => W.state === 'ready'); ok(W.cur === 5 && t3 < 0.45, `battle rifle ready ${t3.toFixed(2)} s after retarget`);

// ---- 4. fast scroll: three notches in one frame step three owned weapons; settles in ≈0.1 s
const ring = [-1, ...WEAPONS.map((_, k) => k).filter((k) => W.inv[k].owned)]; const want = ring[(ring.indexOf(5) + 3) % ring.length];
Input.wheel = 3; frame(); ok(W.scrollTarget === want, `3 wheel notches → target ${W.scrollTarget} (want ${want})`);
const t4 = until(() => W.scrollTarget == null, 1); ok(t4 <= 0.12, `scroll commits after ${t4.toFixed(2)} s`); ok(W.state === 'holster' && W.next === want, 'commit starts the swap to the scrolled weapon');
until(() => W.state === 'ready'); ok(W.cur === want, `scrolled weapon (${want}) ends up in the hands (cur ${W.cur})`);

// ---- 5. click while the scroll is pending: picks it now, does not fire
const mag0 = W.inv[W.cur].mag; Input.wheel = -1; frame(); const pick = W.scrollTarget; ok(pick != null, 'scroll pending');
Input.mousePressed.add(0); Input.mouseButtons.add(0); frame(); ok(W.scrollTarget == null && (W.next === pick || W.cur === pick), 'click commits the highlighted weapon immediately');
run(0.1); ok(W.inv[want].mag === mag0, 'the click did not fire the old weapon'); Input.mouseButtons.delete(0); frame();
until(() => W.state === 'ready'); ok(W.cur === pick, `clicked weapon (${pick}) drawn`);

// ---- 6. scrolling back to the weapon being put away brings it straight back up
const keep = W.cur; W.select(keep === 3 ? 4 : 3); run(0.06); ok(W.state === 'holster', 'putting away');
W.select(keep); ok(W.state === 'equip' && W.cur === keep && W.next === -1, 'back to the same weapon: raised again, no swap');
until(() => W.state === 'ready'); ok(W.cur === keep, 'same weapon ready');

// ---- 7. pistol from empty hands still comes out of the hip holster
W.holster(); until(() => W.state === 'none'); W.select(1); ok(W.drawMode === 'hip', 'pistol from empty hands: hip-holster draw');
until(() => W.state === 'ready'); ok(W.cur === 1, 'pistol ready');

// ---- 8. holds: contact + IK reach when aiming, for every weapon
const b = ch.bones; const v = new THREE.Vector3();
for (let i = 0; i < 9; i++) {
  const h = holdFor(ch, W.models[i]); ok(!!h, `${WEAPONS[i].id}: hold solved`); if (!h) continue;
  ok(h.R.trigErr < 0.025, `${WEAPONS[i].id}: trigger pad ${(h.R.trigErr * 100).toFixed(1)} cm from the trigger`);
  ok(h.R.thumbErr < 0.025, `${WEAPONS[i].id}: firing thumb ${(h.R.thumbErr * 100).toFixed(1)} cm from its spot`);
  if (h.L.thumbErr != null) ok(h.L.thumbErr < 0.025, `${WEAPONS[i].id}: support thumb ${(h.L.thumbErr * 100).toFixed(1)} cm from its spot`);
  const all = [...h.R.ready.f, ...h.L.pose.f].flat(); ok(all.every((a) => a > -0.6 && a < 1.8), `${WEAPONS[i].id}: finger joints within limits`);
  W.select(i); Input.mouseButtons.add(2); until(() => W.state === 'ready' && W.aimW > 0.99 && W.cur === i); run(0.2); Input.mouseButtons.delete(2);
  const m = W.models[i]; ch.root.updateMatrixWorld(true); m.updateWorldMatrix(true, false);
  const slide = WEAPONS[i].cls === 'pistol' ? 0 : W._supSlide || 0; // long guns: the support hand may slide back along the forend (still on it)
  const tL = h.L.wrist.clone().add(new THREE.Vector3(0, 0, -slide)).applyMatrix4(m.matrixWorld);
  const eR = h.R.wrist.clone().applyMatrix4(m.matrixWorld).distanceTo(b.handR.getWorldPosition(v)), eL = tL.distanceTo(b.handL.getWorldPosition(v));
  ok(eR < 0.03 && eL < 0.03, `${WEAPONS[i].id}: aimed — wrists on their holds (R ${(eR * 100).toFixed(1)} cm, L ${(eL * 100).toFixed(1)} cm, slide ${(slide * 100).toFixed(0)} cm)`);
  if (h.L && m.userData.hold.fore) { const f = m.userData.hold.fore; const zHand = f.c.z - slide; ok(zHand > f.c.z - 0.2, `${WEAPONS[i].id}: support hand still on the forend / receiver (slid ${(slide * 100).toFixed(0)} cm)`); }
}
// ---- the weapon card never shows a gun's ammunition while fists are picked (scroll highlight, wheel, switching to fists)
{ const nodes = {}; W.el.card.querySelector = (q) => nodes[q] || (nodes[q] = { textContent: '', innerHTML: '', classList: { add() {}, remove() {}, toggle() {} } });
  const ammo = () => nodes['.wc-ammo b'].textContent + ' ' + nodes['.wc-ammo span'].textContent, card = () => `[${nodes['.wc-name'].innerHTML.replace(/<[^>]*>/g, '')}] ${ammo().trim()} · ${nodes['.wc-state'].textContent}`;
  const gun = WEAPONS.findIndex((d, k) => W.inv[k].owned && d.cls === 'pistol'); W.select(gun); until(() => W.state === 'ready' && W.cur === gun); run(0.1);
  ok(/\d/.test(ammo()), `armed: card shows the ammunition (${card()})`);
  let ring = [-1, ...WEAPONS.map((_, k) => k).filter((k) => W.inv[k].owned)]; let notches = (ring.indexOf(-1) - ring.indexOf(gun) + ring.length) % ring.length; Input.wheel = notches; frame();
  ok(W.scrollTarget === -1, `scrolled to fists (target ${W.scrollTarget})`); ok(!/\d/.test(ammo()) && /Fists/.test(card()), `scrolled to fists: no ammunition on the card (${card()})`);
  let seen = ''; run(0.6, () => { if (/\d/.test(ammo())) seen = card(); }); ok(!seen, `while the gun is put away for fists: no ammunition shown (${seen || card()})`);
  ok(W.cur === -1 && W.sel === -1, `fists in hand (cur ${W.cur}, sel ${W.sel})`);
  W.select(gun); until(() => W.state === 'ready' && W.cur === gun); run(0.1); W.wheelUpdate(); W.wheelSel = -1; W.hudUpdate(STEP); ok(!/\d/.test(ammo()), `weapon wheel on fists: no ammunition on the card (${card()})`); W.wheelClose(true); run(0.6, () => { if (/\d/.test(ammo())) seen = card(); }); ok(!seen && W.cur === -1, `wheel → fists: no ammunition while switching (${seen || card()})`);
}
console.log(`weapon-switch-test: ${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
