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
console.log(out.join('\n')); console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
