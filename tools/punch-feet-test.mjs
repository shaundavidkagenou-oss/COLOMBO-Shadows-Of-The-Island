// Punch footwork test (Node): during every strike the planted feet stay on the ground — a heel raise pivots on the
// ball of the foot (ankle rises) instead of driving the toes into the pavement. Checked on the three protagonists
// (toe bones) and on a crowd rig.
import './node-dom-stub.mjs';
const THREE = await import('three');
const { Character, HEROES, randomSpec } = await import('../src/actors/Character.js');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const wp = new THREE.Vector3();
const rigs = [['dineth', HEROES.dineth], ['shashika', HEROES.shashika], ['david', HEROES.david], ['crowd', randomSpec(4242, { age: 'adult', sex: 'm' })]];
for (const [name, spec] of rigs) {
  const ch = new Character(spec); const A = ch.anim; const bones = []; ch.root.traverse((o) => { if (o.isBone && /foot|toe/i.test(o.name)) bones.push(o); });
  const low = () => { ch.root.updateMatrixWorld(true); let m = 9; for (const b of bones) { b.getWorldPosition(wp); m = Math.min(m, wp.y); } return m; };
  for (let i = 0; i < 60; i++) A.update(1 / 60, 0); const base = low();
  A.fightOn(true); for (let i = 0; i < 40; i++) A.update(1 / 60, 0); ok(low() > base - 0.01, `${name}: guard stance keeps the feet on the ground`);
  for (const mv of ['jab', 'cross', 'hook', 'upper']) { A.strike(mv); let m = 9; for (let i = 0; i < 50; i++) { A.update(1 / 60, 0); m = Math.min(m, low()); } ok(m > base - 0.01, `${name}: ${mv} — no toe dips into the ground (${((m - base) * 100).toFixed(1)} cm)`); }
}
console.log(`punch-feet: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
