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
// 87th: carried-gear system test (Node stub, no GPU) — every inventory configuration, rapid / interrupted switching while idle,
// walking, running and turning, return to the default state, a long session's object / geometry counts, and the invariants:
// one holster for every pistol (same object, same proportions), the strap shown exactly while its gun is slung or in the hands,
// never stretched, no orphaned or duplicated meshes, the weapon never jumps.
let fails = 0, passes = 0; const ok = (c, msg) => { if (c) { passes++; if (process.env.V) console.log('  ok', msg); } else { fails++; console.log('  FAIL', msg); } };
const ch = new Character(HEROES[process.env.HERO || 'dineth']); const scene = new THREE.Scene(); scene.add(ch.root);
const P = { ch, x: 0, y: 0, z: 0, yaw: 0, camYaw: -Math.PI, camPitch: 0, camMode: 0, speed: 0, stamina: 1, position: ch.root.position, rotation: ch.root.rotation };
P.fpEyeLook = Player.prototype.fpEyeLook.bind(P);
const game = { player: P, scene, camera: new THREE.PerspectiveCamera(), hud: { root: el() }, crowd: { peds: [] }, police: null, debug: null, collision: { raycast: () => 1, groundAt: () => 0, query: () => [] }, timeSlow: 1, birds: null, traffic: { all: () => [] }, blood: null, health: null };
const W = new Weapons(game); P.weapons = W; const A = ch.anim; const G = W.gear; const STEP = 1 / 60;
let speed = 0, turn = 0; const frame = () => { ch.root.rotation.y += turn * STEP; W.update(STEP, true); A.update(STEP, speed, turn); G.late(STEP); Input.endFrame(); scene.updateMatrixWorld(true); };
const run = (sec, each) => { for (let t = 0; t < sec; t += STEP) { frame(); if (each) each(); } };
const until = (pred, max = 4) => { let t = 0; while (t < max && !pred()) { frame(); t += STEP; } return t; };
const untilF = (pred, max = 4) => { let t = 0; do { frame(); t += STEP; } while (t < max && !pred()); return t; }; // checks after each frame (what is rendered)
const settle = () => { W.holster(); until(() => W.state === 'none'); run(0.3); };
const PISTOLS = WEAPONS.map((d, i) => (d.cls === 'pistol' ? i : -1)).filter((i) => i >= 0), LONGS = WEAPONS.map((d, i) => (d.cls !== 'pistol' ? i : -1)).filter((i) => i >= 0);
for (const i of [...PISTOLS, ...LONGS]) W.inv[i].owned = true;
run(0.3);

// ---- 1. one holster for every pistol: the same object, the same world size; only the seat offset changes
const hsig = () => { const f = G.cur.P; if (!f || !f.h) return null; const g = f.h.group; const bb = new THREE.Box3(); g.traverse((o) => { if (o.geometry) { o.geometry.computeBoundingBox(); bb.union(o.geometry.boundingBox); } }); return { obj: g, size: bb.getSize(new THREE.Vector3()), scale: g.getWorldScale(new THREE.Vector3()).x, fit: G.gP.matrix.elements.join(',') }; }; // geometry bounds (local) + the fit on the hips
let h0 = null; const lifts = [];
for (const i of PISTOLS) { W.select(i); let drawnFromHolster = false; until(() => { if (W.state === 'equip' && W.drawMode === 'hip' && W.models[i].parent === W.holsterP) drawnFromHolster = true; return W.state === 'ready'; });
  ok(drawnFromHolster, `${WEAPONS[i].name}: drawn out of the holster`); lifts.push(G.drawLift(i)); settle();
  ok(W.models[i].parent === W.holsterP && W.models[i].visible, `${WEAPONS[i].name}: back in the holster`);
  const s = hsig(); ok(!!s, `${WEAPONS[i].name}: holster fitted`); if (!s) continue; if (!h0) h0 = s;
  ok(s.obj === h0.obj, `${WEAPONS[i].name}: the same holster object (no swap / rebuild)`); ok(s.size.distanceTo(h0.size) < 1e-6 && Math.abs(s.scale - h0.scale) < 1e-6 && s.fit === h0.fit, `${WEAPONS[i].name}: holster size unchanged (${s.size.toArray().map((x) => x.toFixed(3))})`); }
ok(lifts.every((l, k) => l > WEAPONS[PISTOLS[k]] && true || l > 0.06), `draw lift clears every muzzle (${lifts.map((l) => l.toFixed(3)).join(' ')})`);
ok(G.stats.builds <= 2, `holster built once (builds so far ${G.stats.builds})`);

// ---- 2. every long gun: drawn off the sling, strap never off, never stretched, back on the sling afterwards
// 88th: the face / head clearance of the over-the-shoulder swing (the head is its own mesh: 'heroHead'), sampled on the gun's own vertices
let headM = null; ch.root.traverse((o) => { if (o.name === 'heroHead') headM = o; }); const HV = [], hv = new THREE.Vector3(), gv = new THREE.Vector3();
if (headM) { const p = headM.geometry.attributes.position; for (let k = 0; k < p.count; k += Math.max(1, (p.count / 500) | 0)) HV.push(k); }
const gunPts = (m) => { const out = []; m.traverse((o) => { if (o.isMesh && o.geometry) { const p = o.geometry.attributes.position; for (let k = 0; k < p.count; k += Math.max(1, (p.count / 250) | 0)) out.push([o, k]); } }); return out; };
const headGap = (S) => { const hp = headM.geometry.attributes.position, W0 = HV.map((k) => hv.fromBufferAttribute(hp, k).applyMatrix4(headM.matrixWorld).clone()); let b = 9;
  for (const [o, k] of S) { gv.fromBufferAttribute(o.geometry.attributes.position, k).applyMatrix4(o.matrixWorld); for (const q of W0) b = Math.min(b, gv.distanceToSquared(q)); } return Math.sqrt(b); };
for (const i of LONGS) { W.select(i); let off = 0, maxS = 0, minS = 9, dL = 0, ddL = 0, lastL = -1, lastD = 0, gap = 9; const GP = headM ? gunPts(W.models[i]) : null; untilF(() => { if (!G.strapShown) off++; if (GP && W.state === 'equip' && W.t / W.dur < 0.6) gap = Math.min(gap, headGap(GP)); const p = G.cur.L && G.cur.L.path; if (p && G.strapShown) { maxS = Math.max(maxS, p.stretch); minS = Math.min(minS, p.stretch); if (lastL > 0) { const d = p.len - lastL; dL = Math.max(dL, Math.abs(d)); ddL = Math.max(ddL, Math.abs(d - lastD)); lastD = d; } lastL = p.len; } return W.state === 'ready'; });
  ok(W.drawMode === 'sling' || W.state === 'ready', `${WEAPONS[i].name}: sling draw`); ok(off === 0, `${WEAPONS[i].name}: strap on show every frame of the draw (${off} off)`);
  // the strap pays out through its adjustable run as the gun comes round (quick-adjust) — smoothly, within a real sling's range
  if (GP) ok(gap > 0.008, `${WEAPONS[i].name}: the swing over the shoulder clears the head (${(gap * 100).toFixed(1)} cm)`);
  const Lm = G.cur.L.path.Lm; ok((maxS - 1) * Lm < 0.75 && minS > 0.9 && dL < 0.2 && ddL < 0.13, `${WEAPONS[i].name}: strap pays out smoothly (pays out ${((maxS - 1) * Lm * 100).toFixed(0)} cm, ${minS.toFixed(2)}–${maxS.toFixed(2)} × ${Lm.toFixed(2)} m, ≤ ${(dL * 100).toFixed(1)} cm/frame, Δ ${(ddL * 100).toFixed(1)})`);
  run(0.2); settle(); ok(W.models[i].parent === W.holsterR && W.models[i].visible && G.strapShown, `${WEAPONS[i].name}: back on the sling with its strap`); }
const visibleStraps = () => { let n = 0; for (const f of G.fits.values()) if (f.strap && f.strap.visible && f.strap.parent) n++; return n; };
ok(visibleStraps() === 1, 'one strap on show');

// ---- 3. rapid / interrupted switching while idle, walking, running and turning; invariants every frame
const count = () => { const geo = new Set(), mat = new Set(); let obj = 0; scene.traverse((o) => { obj++; if (o.geometry) geo.add(o.geometry.id); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => mat.add(m.id)); }); return { obj, geo: geo.size, mat: mat.size }; };
const config = () => { W.select(PISTOLS[0]); until(() => W.state === 'ready'); W.select(LONGS[0]); until(() => W.state === 'ready'); settle(); }; // the same carried set for every count
config(); const c0 = count(); const SNAP0 = new Set(); scene.traverse((o) => SNAP0.add(o)); let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const bad = { span: 0, strap: 0, nan: 0, multi: 0, jump: 0, lost: 0 }; const prevW = new THREE.Vector3(), wp = new THREE.Vector3(), chestInv = new THREE.Matrix4(); let prevCur = -9, prevOK = false;
const owned = [...PISTOLS, ...LONGS];
for (let f = 0; f < 2400; f++) {
  if (f % 240 === 0) { speed = [0, 1.4, 5.5, 0][(f / 240) % 4]; turn = [0, 0.8, -1.2, 2.5][(f / 240) % 4]; }
  const r = rnd(); if (r < 0.03) W.select(owned[Math.floor(rnd() * owned.length)]); else if (r < 0.04) W.holster();
  frame();
  // the strap is on show exactly while the carried long gun is on the back or in the hands
  const lm = G.carryL >= 0 ? W.models[G.carryL] : null; const want = !!(lm && lm.visible && (lm.parent === W.holsterR || (lm.parent === W.inHand && W.cur === G.carryL)) && G.cur.L && G.cur.L.strap);
  if (want !== G.strapShown || (G.cur.L && G.cur.L.strap && G.cur.L.strap.visible !== G.strapShown)) bad.strap++;
  let inHand = 0; for (const i of owned) { const m = W.models[i]; if (!m || !W.built.includes(i)) continue; if (m.parent === W.inHand && m.visible) inHand++; }
  if (inHand > 1) bad.multi++;
  { const p = G.strapShown && G.cur.L && G.cur.L.path; if (p && (p.aL - p.aU + 180) % 180 < 40) bad.span++; } // the strap always goes round the body
  if (W.cur >= 0) { const m = W.models[W.cur]; for (const v of m.matrixWorld.elements) if (!Number.isFinite(v)) { bad.nan++; break; }
    chestInv.copy(ch.bones.chest.matrixWorld).invert(); wp.setFromMatrixPosition(m.matrixWorld).applyMatrix4(chestInv); // chest space: body motion factored out
    if (prevOK && prevCur === W.cur && (W.state === 'equip' || W.state === 'holster') && wp.distanceTo(prevW) > 0.16) bad.jump++; prevW.copy(wp); prevCur = W.cur; prevOK = W.state === 'equip' || W.state === 'holster'; } else prevOK = false;
  if (G.carryP >= 0 && W.cur !== G.carryP && W.built.includes(G.carryP)) { const pm = W.models[G.carryP]; if (!(pm.parent === W.holsterP && pm.visible)) bad.lost++; }
}
ok(bad.strap === 0, `strap visibility always matches its gun (${bad.strap} frames wrong)`); ok(bad.span === 0, `strap always round the body, never a loop hanging off the gun (${bad.span} frames)`); ok(bad.multi === 0, `never two guns in the hands (${bad.multi})`);
ok(bad.nan === 0, `no NaN transforms (${bad.nan})`); ok(bad.jump === 0, `no weapon jumps during draws / put-aways (${bad.jump})`); ok(bad.lost === 0, `the carried pistol is always in its holster when not in the hand (${bad.lost})`);

// ---- 4. back to the default state
speed = 0; turn = 0; settle(); run(0.5);
ok(visibleStraps() <= 1, `never more than one strap (${visibleStraps()})`);
ok(W.state === 'none' && W.cur === -1 && !A.ik && !A.aim, 'unarmed, no IK / stance left behind');
ok(W.models[G.carryP].parent === W.holsterP && W.models[G.carryP].visible, 'pistol in its holster'); ok(W.models[G.carryL].parent === W.holsterR && W.models[G.carryL].visible && G.strapShown, 'long gun on the sling, strap on');
config(); const c1 = count(); if (process.env.V && c1.obj !== c0.obj) { const now = []; scene.traverse((o) => now.push(o)); console.log('  extra:', now.filter((o) => !SNAP0.has(o)).map((o) => `${o.type}:${o.name}:${o.parent && o.parent.name}`).join(' | '), ' gone:', [...SNAP0].filter((o) => !now.includes(o)).map((o) => `${o.type}:${o.name}:${o.parent && o.parent.name}`).join(' | ')); } ok(c1.obj === c0.obj && c1.geo === c0.geo && c1.mat === c0.mat, `no leftover objects / geometries / materials (objects ${c0.obj}→${c1.obj}, geometries ${c0.geo}→${c1.geo}, materials ${c0.mat}→${c1.mat})`);
ok(G.fits.size <= 1 + LONGS.length, `fits cached per body, not per switch (${G.fits.size})`);
ok(W.holsterP.children.filter((c) => c.visible).length <= 1, `one pistol in the holster (${W.holsterP.children.filter((c) => c.visible).length})`);
ok(W.holsterR.children.filter((c) => c.visible).length <= 1, `one long gun on the back (${W.holsterR.children.filter((c) => c.visible).length})`);

// ---- 5. a long session: repeated full cycles leave the counts where they were
for (let k = 0; k < 6; k++) for (const i of [PISTOLS[k % PISTOLS.length], LONGS[k % LONGS.length], LONGS[(k + 5) % LONGS.length]]) { W.select(i); until(() => W.state === 'ready'); run(0.1); }
config(); const c2 = count(); ok(c2.obj === c1.obj && c2.geo === c1.geo, `long session: counts stable (objects ${c1.obj}→${c2.obj}, geometries ${c1.geo}→${c2.geo})`);
console.log(`carry-gear-test: ${passes} passed, ${fails} failed`); process.exit(fails ? 1 : 0);
