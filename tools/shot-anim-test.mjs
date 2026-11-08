// Shooting body reaction test (Node): the REAL Animator in the weapon stance. Each shot (Animator.shotKick) rocks the torso back and
// it settles like a body absorbing recoil; the head stays on the sights (moves far less than the chest); bigger weapons kick harder
// (sniper > rifle > pistol); rifles drive the firing shoulder back (chest yaw); sustained automatic fire stays bounded; nothing at all
// happens to a body that is not shooting.
// Run: node tools/shot-anim-test.mjs
import './node-dom-stub.mjs';
globalThis.localStorage ??= { getItem: () => null, setItem: () => {}, removeItem: () => {} };
const THREE = await import('three');
const { Character, randomSpec } = await import('../src/actors/Character.js');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL', m); } };
const dt = 1 / 60, deg = (r) => (r * 180) / Math.PI;
// a kicked body and an identical control body, updated in lockstep with the same (fixed) randomness: the difference is the kick alone
Math.random = () => 0.5;
const mk = () => new Character(randomSpec(91, { age: 'adult', sex: 'm' })); const ch = mk(), ctl = mk();
const qW = (c, bone) => { c.root.updateMatrixWorld(true); return bone.getWorldQuaternion(new THREE.Quaternion()); };
const yawOf = (q) => { const f = new THREE.Vector3(0, 0, 1).applyQuaternion(q); return Math.atan2(f.x, f.z); };
const both = (fn) => { fn(ch.anim); fn(ctl.anim); };
function settle(aim = true) { both((A) => { A.sk = null; A.aim = aim ? { pitch: 0.05, twist: 0.5, w: 1, headDown: 0.12 } : null; for (let i = 0; i < 90; i++) A.update(dt, 0, 0); }); }
function shot(cls, frames = 60, shots = 1, every = 6) {
  settle(); let pc = 0, ph = 0, py = 0, settleF = -1; const trace = [];
  for (let f = 0; f < frames; f++) { if (f % every === 0 && f / every < shots) ch.anim.shotKick(cls, 1); both((A) => A.update(dt, 0, 0));
    const c = qW(ch, ch.bones.chest), h = qW(ch, ch.bones.head), c0 = qW(ctl, ctl.bones.chest), h0 = qW(ctl, ctl.bones.head);
    const dc = deg(c.angleTo(c0)), dh = deg(h.angleTo(h0)); const dy = deg(yawOf(c) - yawOf(c0)); trace.push(dc); pc = Math.max(pc, dc); ph = Math.max(ph, dh); py = Math.max(py, Math.abs(dy)); }
  const last = (shots - 1) * every; for (let f = last; f < frames; f++) if (trace[f] < 0.3 && settleF < 0 && trace.slice(f).every((v) => v < 0.3)) settleF = f - last;
  return { pc, ph, py, settle: settleF * dt, end: trace[frames - 1] };
}
const P = shot('pistol'), R = shot('rifle'), S = shot('sniper');
for (const [n, r] of [['pistol', P], ['rifle', R], ['sniper', S]]) console.log(`  ${n}: chest peak ${r.pc.toFixed(2)}°, head ${r.ph.toFixed(2)}°, shoulder yaw ${r.py.toFixed(2)}°, settles in ${r.settle.toFixed(2)} s`);
ok(P.pc > 1 && P.pc < 5, 'pistol torso rock ' + P.pc.toFixed(2)); ok(R.pc > P.pc && S.pc > R.pc, 'kick order sniper > rifle > pistol'); ok(S.pc < 12, 'sniper rock too big ' + S.pc.toFixed(2));
for (const [n, r] of [['pistol', P], ['rifle', R], ['sniper', S]]) { ok(r.ph < r.pc * 0.5, `${n}: head not steadier than the chest (${r.ph.toFixed(2)} vs ${r.pc.toFixed(2)})`); ok(r.settle > 0.05 && r.settle < 0.6, `${n}: settle time ${r.settle.toFixed(2)} s`); ok(r.end < 0.3, `${n}: did not return`); }
ok(R.py > P.py * 1.5 && R.py > 0.5, `rifle shoulder drive ${R.py.toFixed(2)} vs pistol ${P.py.toFixed(2)}`);
const AUTO = shot('rifle', 150, 12, 6); console.log(`  rifle auto 12 rounds @ 10/s: chest peak ${AUTO.pc.toFixed(2)}°, head ${AUTO.ph.toFixed(2)}°, settles ${AUTO.settle.toFixed(2)} s after the last`);
ok(AUTO.pc < 9, 'automatic fire not bounded ' + AUTO.pc.toFixed(2)); ok(AUTO.end < 0.3, 'automatic fire did not settle');
// not aiming: a stray kick does nothing (only applied in the weapon stance)
{ settle(false); ch.anim.shotKick('sniper', 1); let m = 0; for (let i = 0; i < 10; i++) { both((A) => A.update(dt, 0, 0)); m = Math.max(m, deg(qW(ch, ch.bones.chest).angleTo(qW(ctl, ctl.bones.chest)))); } ok(m < 0.05, 'kick moved a body that is not aiming ' + m.toFixed(3)); }
console.log(`shot-anim-test: ${pass + fail} checks, ${fail} failed`); process.exit(fail ? 1 : 0);
