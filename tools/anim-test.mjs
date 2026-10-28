// Animator test (Node): gestures return to neutral smoothly (no single-frame pop) for every unarmed action,
// timed play() ends on simulation time, and seated → standing restores the standing hips height.
import './node-dom-stub.mjs';
const { Character, randomSpec } = await import('../src/actors/Character.js');
const ch = new Character(randomSpec(4242, { age: 'adult', sex: 'm' })); const A = ch.anim; const b = ch.bones; let fails = 0; const out = [];
const armAng = () => b.armR.quaternion.angleTo(b.armR.quaternion.clone().identity()) + b.armL.quaternion.angleTo(b.armL.quaternion.clone().identity()) + b.foreR.quaternion.angleTo(b.foreR.quaternion.clone().identity());
for (const act of ['talk', 'wave', 'phone', 'point', 'crossarms', 'hips', 'watch', 'alert', 'argue', 'clap', 'handsup', 'text']) {
  A.set(null); for (let i = 0; i < 90; i++) A.update(1 / 60, 0); A.set(act); for (let i = 0; i < 90; i++) A.update(1 / 60, 0);
  let prev = armAng(); const start = prev; A.set(null); let maxStep = 0; for (let i = 0; i < 40; i++) { A.update(1 / 60, 0); const a = armAng(); maxStep = Math.max(maxStep, Math.abs(a - prev)); prev = a; }
  const total = Math.max(1e-3, Math.abs(start - prev)); const ratio = maxStep / total; const ok = ratio < 0.12 || total < 0.05; if (!ok) fails++; out.push(`${ok ? 'ok  ' : 'FAIL'} ${act.padEnd(10)} return to neutral: total ${total.toFixed(2)} rad, largest single-frame step ${(ratio * 100).toFixed(1)}% of it`);
}
A.set(null); for (let i = 0; i < 60; i++) A.update(1 / 60, 0); A.play('watch', 1.0); let t = 0; while (A.action && t < 200) { A.update(1 / 60, 0); t++; }
{ const ok = t >= 59 && t <= 62; if (!ok) fails++; out.push(`${ok ? 'ok  ' : 'FAIL'} play('watch', 1.0s) ended after ${t} frames of 1/60 s`); }
const seat = { x: 0, y: 0.5, z: 0, floor: 0.3, fz: 0.6, fx: 0.12, roof: 1.4, lean: -0.2, hands: 'lap', kind: 'sit' };
A.sitIn(seat, 1); for (let i = 0; i < 10; i++) A.update(1 / 60, 0); const seatedY = b.hips.position.y; A.standUp(); for (let i = 0; i < 30; i++) A.update(1 / 60, 0);
{ const ok = seatedY < 0.15 && Math.abs(b.hips.position.y - ch.hipY) < 0.04; if (!ok) fails++; out.push(`${ok ? 'ok  ' : 'FAIL'} seated hips ${seatedY.toFixed(3)} → standing hips ${b.hips.position.y.toFixed(3)} (bind ${ch.hipY.toFixed(3)})`); }
// gait: vertical bob within human range (walk ≈ 2–5 cm, run ≤ 9 cm), no single-frame hip jumps, stance foot neither sinks nor floats
{ const THREE = await import('three'); const wp = new THREE.Vector3();
  for (const [label, spd, maxPP] of [['walk 1.4 m/s', 1.4, 0.055], ['brisk 2.0 m/s', 2.0, 0.065], ['run 5 m/s', 5, 0.095]]) for (const seed of [4242, 77, 913]) {
    const c = new Character(randomSpec(seed, { age: 'adult' })); const An = c.anim; for (let i = 0; i < 90; i++) An.update(1 / 60, spd);
    let lo = 9, hi = -9, jump = 0, prev = null, sinkMax = 0, floatMax = 0;
    for (let i = 0; i < 240; i++) { An.update(1 / 60, spd); c.root.updateMatrixWorld(true); const y = c.bones.hips.position.y; lo = Math.min(lo, y); hi = Math.max(hi, y); if (prev !== null) jump = Math.max(jump, Math.abs(y - prev)); prev = y;
      const ank = [c.bones.footL.getWorldPosition(wp).y, c.bones.footR.getWorldPosition(wp.clone()).y]; if (spd < 3) An.legState.forEach((l, k) => { if (l.contact && l.u > 0.12 && l.u < 0.66) { const e = ank[k] - An.ankle; sinkMax = Math.max(sinkMax, -e); floatMax = Math.max(floatMax, e); } }); /* flat-foot stance only (heel strike / heel-off excluded) */ }
    const pp = hi - lo; const ok = pp <= maxPP && pp >= (spd < 3 ? 0.012 : 0.02) && jump < 0.012 && sinkMax < 0.015 && floatMax < 0.015; if (!ok) fails++;
    out.push(`${ok ? 'ok  ' : 'FAIL'} ${label} seed ${seed}: hip bob ${(pp * 100).toFixed(1)} cm (≤ ${(maxPP * 100).toFixed(1)}), max frame step ${(jump * 1000).toFixed(1)} mm${spd < 3 ? `, stance ankle sink ${(sinkMax * 100).toFixed(1)} cm / float ${(floatMax * 100).toFixed(1)} cm` : ''}`); c.dispose && c.dispose(); } }
console.log(out.join('\n')); console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
