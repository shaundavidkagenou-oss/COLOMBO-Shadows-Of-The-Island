// Idle-routine test (Node, headless): people who keep a post (desk staff, guards, people chatting, cart vendors) vary what
// they do over time; desk staff stay seated (hips never rise) while they type / phone / glance up; chats alternate turns.
import './node-dom-stub.mjs';
import * as THREE from 'three';
globalThis.localStorage ??= { getItem: () => null, setItem: () => {}, removeItem: () => {} };
{ const { MAT } = await import('../src/gfx/Materials.js'); for (const k of ['paint', 'metal', 'concrete', 'road', 'ballast']) MAT[k] ??= new THREE.MeshStandardMaterial({ vertexColors: true }); }
const { Character, randomSpec } = await import('../src/actors/Character.js'); const { routine, ROUTINE_KINDS } = await import('../src/actors/Routine.js');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647); const v = new THREE.Vector3();
for (const kind of ROUTINE_KINDS) {
  const ch = new Character(randomSpec(40 + kind.length, { age: 'adult' })); const p = {}; const seen = new Set(); let hipMin = 9, hipMax = -9, turns = 0, last = null;
  if (kind === 'desk') { ch.anim.set('sit'); for (let i = 0; i < 60; i++) ch.anim.update(0.05, 0); }
  for (let i = 0; i < 120 * 20; i++) { const a = routine(p, ch, 0.05, kind, rnd); seen.add(a); if (a !== last) { turns++; last = a; } ch.anim.update(0.05, 0); ch.root.updateMatrixWorld(true);
    if (kind === 'desk' && i > 40) { v.setFromMatrixPosition(ch.bones.hips.matrixWorld); hipMin = Math.min(hipMin, v.y); hipMax = Math.max(hipMax, v.y); } }
  ok(seen.size >= 3, `${kind}: varied activity over 2 min (${[...seen].join(', ')})`);
  ok(turns >= 6, `${kind}: changes what they do regularly (${turns} changes in 2 min)`);
  if (kind === 'desk') ok(hipMax - hipMin < 0.03, `desk: stays seated through every change (hip height range ${(hipMax - hipMin).toFixed(3)} m)`);
}
console.log(`routine: ${pass + fail} checks, ${fail} failed`); process.exit(fail ? 1 : 0);
