// First-person fists test (Node, headless): the real hero characters in the boxing stance, every technique (jab, cross,
// hook, uppercut, the full combo, the block) at several look pitches. The camera is placed exactly like Player.updateCamera
// (camMode 2: fpEyeLook from the head bone, near plane 0.07). Every hand / finger / thumb bone, and the fist's knuckle
// line, must stay in front of the camera's near plane with room to spare — nothing may sweep through the lens or be cut
// open by the near plane (that was the "hand goes through the camera" and the half-invisible fingers).
// Run: node tools/fp-hands-test.mjs
import './node-dom-stub.mjs';
import * as THREE from 'three';
globalThis.localStorage ??= { getItem: () => null, setItem: () => {}, removeItem: () => {} };
{ const { MAT } = await import('../src/gfx/Materials.js'); Object.setPrototypeOf(MAT, new Proxy({}, { get: (t, k) => { if (typeof k !== 'string') return undefined; if (!t[k]) t[k] = new THREE.MeshStandardMaterial({ vertexColors: true }); return t[k]; } })); }
const { Character } = await import('../src/actors/Character.js');
const { HEROES } = await import('../src/actors/Character.js');
const { COMBO } = await import('../src/actors/Boxing.js');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL', m); } };
const NEAR = 0.07, MIN_FWD = 0.11; const TY = Math.tan((75 / 2) * Math.PI / 180), TX = TY * 16 / 9; // widest default FOV (75°), 16:9 // a finger must be ≥ 11 cm ahead of the lens (4 cm past the near plane: never cut open)
const scene = new THREE.Scene(); const v = new THREE.Vector3(), eye = new THREE.Vector3(), fw = new THREE.Vector3(), up = new THREE.Vector3(), rt = new THREE.Vector3();
const heroes = ['dineth', 'shashika', 'david'].filter((n) => HEROES[n]); // the playable heroes (first person is the player only) ok(heroes.length === 3, `hero specs (${heroes.join(', ')})`);
let worstAll = 9, pitchLogged = false; const FP = process.env.FP_OFF ? false : true; // FP_OFF=1: the stance without the first-person clearance (baseline)
for (const hn of heroes) {
  const ch = new Character(HEROES[hn]); scene.add(ch.root); const A = ch.anim; const s = ch.spec.height / 1.72;
  const handBones = Object.keys(ch.bones).filter((n) => /^hand[LR]$/.test(n) || /^[a-z]+[1-3][LR]$/.test(n)); if (!pitchLogged) { pitchLogged = true; console.log('hand bones:', handBones.join(' ')); }
  const seqs = [['guard', []], ['block', []], ...COMBO.map((m) => [m, [m]]), ['combo', COMBO.concat(COMBO)]];
  for (const pitch of [-0.45, 0, 0.35, 0.7, 1.1]) for (const [name, moves] of seqs) {
    ch.root.position.set(0, 0, 0); ch.root.rotation.set(0, 0, 0); A.fp = FP; A.fpYaw = 0; A.fpPitch = pitch; A.fightOn(true, true); A.fightOn(true); if (A.block) A.block(name === 'block');
    let worst = 9, at = '', t = 0; const dt = 1 / 60; let mi = 0, next = 0.4;
    for (let i = 0; i < 3.2 / dt; i++) { t += dt; if (moves.length && t >= next && mi < moves.length) { A.strike(moves[mi++]); next = t + 0.3; }
      A.update(dt, 0, 0); ch.root.updateMatrixWorld(true);
      const h = ch.bones.head; h.updateWorldMatrix(true, false); const yaw = 0; // character faces +z; camYaw = yaw − π
      eye.setFromMatrixPosition(h.matrixWorld).add(v.set(Math.sin(yaw) * 0.1 * s, 0.075 * s, Math.cos(yaw) * 0.1 * s));
      fw.set(Math.sin(yaw) * Math.cos(pitch), -Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)).normalize(); rt.set(Math.cos(yaw), 0, -Math.sin(yaw)); up.crossVectors(fw, rt).normalize().negate();
      if (t < 0.35) continue; // settle into the stance
      for (const n of handBones) { const b = ch.bones[n]; b.getWorldPosition(v); v.sub(eye); const f = v.dot(fw), x = v.dot(rt), y = v.dot(up);
        // inside (or close to) the view cone and too near → clipped / through the lens
        const inView = Math.abs(x) - 0.025 < Math.max(f, 0) * TX && Math.abs(y) - 0.025 < Math.max(f, 0) * TY; // the real frustum (+ finger thickness)
        if (inView && f < worst) { worst = f; at = `${n} at t=${t.toFixed(2)} (fwd ${(f * 100).toFixed(1)} cm, side ${(x * 100).toFixed(0)}, up ${(y * 100).toFixed(0)})`; } } }
    worstAll = Math.min(worstAll, worst);
    ok(worst >= MIN_FWD, `${hn} ${name} pitch ${pitch}: closest hand point ${at}`);
    A.fightOn(false, true);
  }
  scene.remove(ch.root);
}
console.log(`closest in-view hand point: ${(worstAll * 100).toFixed(1)} cm ahead of the eye (near plane ${NEAR * 100} cm)`);
console.log(`fp-hands: ${pass + fail} checks, ${fail} failed`); process.exit(fail ? 1 : 0);
