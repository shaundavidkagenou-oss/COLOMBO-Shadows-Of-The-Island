// Ragdoll test (Node, headless): bodies collapse / are thrown by a car / hit a wall / take a shot and must stay finite,
// settle and sleep, stay above the ground and out of walls, keep every limb its length, bend knees the right way, and the
// bones must follow the particles. The scripted paths (log roll onto the back, sit up, crouch, stand) end exactly on their
// key poses and hand the character back to the Animator cleanly.
import './node-dom-stub.mjs';
{ let ms = +(process.env.SEED || 1); Math.random = () => ((ms = (ms * 48271) % 2147483647) / 2147483647); } // seeded: a failure is reproducible (SEED=n)
globalThis.localStorage ??= { getItem: () => null, setItem: () => {}, removeItem: () => {} };
const THREE = await import('three');
const { Character } = await import('../src/actors/Character.js');
const A = await import('../src/actors/Appearance.js');
const { RagdollWorld, Keys, supineFrame, rollAngle, rotateAbout, RAG_N } = await import('../src/actors/Ragdoll.js');
let pass = 0, fail = 0; const ok = (c, msg) => { if (c) pass++; else { fail++; console.log('FAIL', msg); } };
const I = Object.fromEntries(RAG_N.map((n, i) => [n, i]));
// flat ground at y = 0 with a wall (box) for x > WALL
const WALL = 2.2;
const col = { groundAt: () => 0, resolveCircle: (x, z, r) => (x + r > WALL ? { x: WALL - r, z, hit: true } : { x, z, hit: false }) };
const scene = new THREE.Scene();
const make = (spec) => { const ch = new Character(spec); scene.add(ch.root); ch.root.position.set(0, 0, 0); ch.anim.update(1 / 60, 0); ch.root.updateMatrixWorld(true); return ch; };
const finite = (r) => r.p.every((p) => Number.isFinite(p.x + p.y + p.z)) && Object.values(r.ch.bones).every((b) => Number.isFinite(b.quaternion.x + b.quaternion.y + b.quaternion.z + b.quaternion.w));
const RADS = [0.11, 0.12, 0.06, 0.1, 0.06, 0.06, 0.045, 0.045, 0.04, 0.04, 0.08, 0.08, 0.06, 0.06, 0.05, 0.05];
const segs = [['shL', 'elL'], ['elL', 'wrL'], ['shR', 'elR'], ['elR', 'wrR'], ['hipL', 'knL'], ['knL', 'anL'], ['hipR', 'knR'], ['knR', 'anR'], ['neck', 'head'], ['pelvis', 'chest']];
function check(label, r, steps, opts = {}) {
  const W = r.world; let nanAt = -1, minY = 9, maxStretch = 0, sleptAt = -1;
  for (let i = 0; i < steps; i++) { W.update(1 / 60, opts.vehicles || null); if (nanAt < 0 && !finite(r)) nanAt = i; for (let k = 0; k < r.p.length; k++) minY = Math.min(minY, r.p[k].y - RADS[k] * r.s);
    for (const [a, c] of segs) { const L0 = r.rest[I[a]].distanceTo(r.rest[I[c]]); maxStretch = Math.max(maxStretch, Math.abs(r.p[I[a]].distanceTo(r.p[I[c]]) - L0) / L0); }
    if (sleptAt < 0 && r.asleep) sleptAt = i; }
  ok(nanAt < 0, `${label}: finite throughout (NaN at step ${nanAt})`);
  ok(minY > -0.02, `${label}: never sinks into the ground (lowest skin point ${minY.toFixed(3)} m)`);
  ok(maxStretch < 0.08, `${label}: limbs keep their length (worst ${(maxStretch * 100).toFixed(1)} %)`);
  ok(sleptAt >= 0, `${label}: settles and sleeps (asleep at ${(sleptAt / 60).toFixed(2)} s)`);
  ok(r.pelvis().y < 0.32, `${label}: ends lying on the ground (pelvis ${r.pelvis().y.toFixed(2)} m)`);
  // bones follow the particles: world joint positions of the skinned skeleton vs particles
  r.ch.root.updateMatrixWorld(true); const b = r.ch.bones; let worst = 0;
  for (const [n, bn] of [['wrL', 'handL'], ['wrR', 'handR'], ['anL', 'footL'], ['anR', 'footR'], ['elL', 'foreL'], ['knR', 'shinR'], ['neck', 'neck']]) worst = Math.max(worst, b[bn].getWorldPosition(new THREE.Vector3()).distanceTo(r.p[I[n]]));
  ok(worst < 0.09, `${label}: skeleton matches the particles (worst joint ${(worst * 100).toFixed(1)} cm)`);
  // knees forward relative to the torso
  const P = r.p; const X = P[I.hipL].clone().sub(P[I.hipR]), Y = P[I.chest].clone().sub(P[I.pelvis]); const F = new THREE.Vector3().crossVectors(X, Y).normalize(); let badKnee = 0;
  for (const sd of ['L', 'R']) { const H = P[I['hip' + sd]], K = P[I['kn' + sd]], An = P[I['an' + sd]]; const ax = An.clone().sub(H); const t = Math.max(0, Math.min(1, K.clone().sub(H).dot(ax) / ax.lengthSq())); const o = K.clone().sub(H.clone().addScaledVector(ax, t)); if (o.dot(F) < -0.03) badKnee++; }
  ok(badKnee === 0, `${label}: knees bend forward`);
  return { sleptAt, nanAt };
}
const specs = [A.makeAppearance(11), A.makeAppearance(42, { sex: 'f' }), A.makeAppearance(77), A.makeMedicAppearance(5), A.makePoliceAppearance(9)];
let perfN = 0, perfT = 0;
for (let si = 0; si < specs.length; si++) {
  const W = new RagdollWorld(col);
  { const ch = make(specs[si]); const r = W.add(ch); check(`#${si} collapse`, r, 420); scene.remove(ch.root); }
  { const ch = make(specs[si]); const r = W.add(ch, { vel: [0, 2.6, 9], legK: 1.2, upK: 0.7 }); check(`#${si} car knock`, r, 600); scene.remove(ch.root); }
  { const ch = make(specs[si]); ch.root.position.x = 0.6; ch.root.updateMatrixWorld(true); const r = W.add(ch, { vel: [8, 1.5, 0] }); check(`#${si} thrown at a wall`, r, 600); ok(r.p.every((p, k) => p.x <= WALL + 0.01), `#${si} wall: no particle inside the wall`); scene.remove(ch.root); }
  { const ch = make(specs[si]); const r = W.add(ch); r.impulse(0, 0, -5, r.part('chest').clone()); check(`#${si} shot in the chest`, r, 480); ok(r.pelvis().z < 0.1, `#${si} shot: falls away from the shot`); scene.remove(ch.root); }
  { const ch = make(specs[si]); const r = W.add(ch, { vel: [0, 0, 3] }); for (let i = 0; i < 300; i++) W.update(1 / 60);
    const t0 = performance.now(); r.wake(); for (let i = 0; i < 60; i++) { r.wake(); r.step(1 / 60); } perfT += performance.now() - t0; perfN += 60;
    // scripted: log roll onto the back → supine → sit up → crouch → stand → hand back to the Animator
    for (let i = 0; i < 120; i++) W.update(1 / 60);
    const ang = rollAngle(r); const snap = r.snapshot(); const P0 = r.pelvis().clone().setY(0.15); const ax = r.part('chest').clone().sub(r.pelvis()).setY(0).normalize();
    let done = 0; r.play((k, out) => rotateAbout(snap, P0, ax, ang * k, out), 0.9, () => done++);
    for (let i = 0; i < 70 && !done; i++) W.update(1 / 60);
    ok(done === 1, `#${si} roll finished`); const after = rollAngle(r); ok(Math.abs(after) < 0.45, `#${si} roll: body ends face up (residual ${after.toFixed(2)} rad from ${ang.toFixed(2)})`);
    const fr = supineFrame(r); const sup = Keys.toWorld(Keys.supine(r.rest), fr.x, fr.z, fr.yaw, col); r.blendTo(sup, 0.6, () => done++, { hold: true }); for (let i = 0; i < 50; i++) W.update(1 / 60);
    let err = 0; for (let i = 0; i < r.p.length; i++) err = Math.max(err, r.p[i].distanceTo(sup[i])); ok(err < 0.05, `#${si} supine key reached (${(err * 100).toFixed(1)} cm)`);
    let stage = 0; const seq = ['sit', 'crouch', 'stand']; const go = () => { if (stage >= seq.length) { stage++; return; } const key = Keys.toWorld(Keys[seq[stage]](r.rest), fr.x, fr.z, fr.yaw, col); stage++; r.blendTo(key, 0.9, go); }; go();
    for (let i = 0; i < 240 && stage <= seq.length; i++) W.update(1 / 60);
    const st = Keys.toWorld(Keys.stand(r.rest), fr.x, fr.z, fr.yaw, col); err = 0; for (let i = 0; i < r.p.length; i++) err = Math.max(err, r.p[i].distanceTo(st[i]));
    ok(stage === 4 && err < 0.05, `#${si} gets up: standing key reached (${(err * 100).toFixed(1)} cm, stage ${stage})`); ok(finite(r), `#${si} get-up stays finite`);
    ok(r.pelvis().y > 0.8, `#${si} standing: pelvis at hip height (${r.pelvis().y.toFixed(2)} m)`);
    r.release(); ok(!ch.rag && W.list.length === 0, `#${si} released to the Animator`); ch.anim.update(1 / 60, 0); ok(Object.values(ch.bones).every((b) => Number.isFinite(b.quaternion.w)), `#${si} Animator drives the bones again`);
    scene.remove(ch.root); }
}
// two bodies on the same spot never pass through each other: one already lying there (settled), a second collapsing onto
// it; and two knocked down at the same moment falling across each other. Deepest capsule overlap between the bodies.
{ const CAPS = [['pelvis', 'chest', 0.17], ['chest', 'neck', 0.15], ['neck', 'head', 0.11], ['shL', 'elL', 0.06], ['shR', 'elR', 0.06], ['elL', 'wrL', 0.05], ['elR', 'wrR', 0.05], ['hipL', 'knL', 0.09], ['hipR', 'knR', 0.09], ['knL', 'anL', 0.065], ['knR', 'anR', 0.065]];
  const sd = (p0, p1, q0, q1) => { let best = 9; for (let i = 0; i <= 8; i++) { const a = p0.clone().lerp(p1, i / 8); for (let j = 0; j <= 8; j++) best = Math.min(best, a.distanceTo(q0.clone().lerp(q1, j / 8))); } return best; };
  const overlap = (A, B) => { let worst = 0; for (const [a0, a1, ra] of CAPS) for (const [b0, b1, rb] of CAPS) { const d = sd(A.p[I[a0]], A.p[I[a1]], B.p[I[b0]], B.p[I[b1]]); worst = Math.max(worst, ra * A.s + rb * B.s - d); } return worst; };
  for (const [label, setup] of [['falls onto a body already lying there', 'onto'], ['two knocked down together, across each other', 'cross']]) {
    const W = new RagdollWorld({ groundAt: () => 0, resolveCircle: (x, z) => ({ x, z, hit: false }) }); const c1 = make(specs[0]); c1.root.position.set(-5, 0, 0); c1.root.updateMatrixWorld(true);
    const r1 = W.add(c1, setup === 'cross' ? { vel: [2.5, 0.5, 0] } : {}); if (setup === 'onto') for (let i = 0; i < 600 && !r1.asleep; i++) W.update(1 / 60, null);
    const c2 = make(specs[1]); c2.root.position.set(setup === 'onto' ? r1.pelvis().x : -4, 0, setup === 'onto' ? r1.pelvis().z - 0.3 : 0.4); c2.root.rotation.y = Math.PI / 2; c2.root.updateMatrixWorld(true);
    const r2 = W.add(c2, setup === 'cross' ? { vel: [-2.5, 0.5, 0] } : { vel: [0, 0, 1.2] }); let worst = 0, end = 0, minY = 9, nan = false;
    for (let i = 0; i < 900; i++) { W.update(1 / 60, null); const o = overlap(r1, r2); if (i > 6) worst = Math.max(worst, o); end = o; for (const r of [r1, r2]) for (let k = 0; k < r.p.length; k++) { minY = Math.min(minY, r.p[k].y - RADS[k] * r.s); if (!Number.isFinite(r.p[k].x + r.p[k].y + r.p[k].z)) nan = true; } }
    ok(!nan, `bodies ${label}: finite`); ok(end < 0.02, `bodies ${label}: lying apart / on top, not inside each other (overlap at rest ${(end * 100).toFixed(1)} cm)`);
    ok(worst < 0.05, `bodies ${label}: never sink into each other while falling (deepest ${(worst * 100).toFixed(1)} cm)`); ok(minY > -0.02, `bodies ${label}: neither is pushed into the ground (${minY.toFixed(3)} m)`);
    ok(r1.asleep && r2.asleep, `bodies ${label}: both settle (${r1.asleep}, ${r2.asleep})`); console.log(`  two bodies, ${label}: deepest ${(worst * 100).toFixed(1)} cm, at rest ${(end * 100).toFixed(1)} cm, pushes ${W.stats.bodyPush || 0}`);
    scene.remove(c1.root); scene.remove(c2.root); } }
const per = perfT / perfN; ok(per < 0.6, `cost per awake ragdoll step ${per.toFixed(3)} ms`);
console.log(`ragdoll-test: ${pass} passed, ${fail} failed (awake step ${per.toFixed(3)} ms)`); process.exit(fail ? 1 : 0);
