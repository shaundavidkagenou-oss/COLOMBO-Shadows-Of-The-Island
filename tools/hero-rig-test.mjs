// Protagonist rig test (Node): builds Dineth, Shashika and David with the real builder / skeleton / Animator / HeroRig
// and checks: bone count (55+), clean skin weights, finite geometry, the shader patch anchors exist in three's chunks,
// dual-quaternion skinning keeps elbow / knee volume where linear blend skinning collapses, every finger and the
// thumb articulate, and the secondary-motion bones (shirt flaps, straps, fob) swing and settle without blowing up.
import './node-dom-stub.mjs';
const THREE = await import('three');
const { Character, HEROES } = await import('../src/actors/Character.js');
const { HERO_EXTRA, DYN_BONES } = await import('../src/actors/HeroRig.js');

let fails = 0; const ok = (c, msg) => { if (!c) { fails++; console.log('  FAIL', msg); } };
const v = new THREE.Vector3(), w = new THREE.Vector3();

// CPU mirror of the shader's dual-quaternion blend (same maths as DQ_FUNCS / DQ_NORMAL / DQ_POS in HeroRig.js)
function skinDQ(mesh, i, out) {
  const g = mesh.geometry, sk = mesh.skeleton; const si = g.attributes.skinIndex, sw = g.attributes.skinWeight; const base = new THREE.Vector3().fromBufferAttribute(g.attributes.position, i);
  let r0 = null; const R = new THREE.Quaternion(0, 0, 0, 0), D = new THREE.Quaternion(0, 0, 0, 0); const M = new THREE.Matrix4(), t = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  for (let k = 0; k < 4; k++) { const wt = sw.getComponent(i, k); if (wt <= 0) continue; const bi = si.getComponent(i, k);
    M.fromArray(sk.boneMatrices, bi * 16); M.premultiply(mesh.bindMatrixInverse).multiply(mesh.bindMatrix); M.decompose(t, q, s);
    if (!r0) r0 = q.clone(); else if (q.dot(r0) < 0) q.set(-q.x, -q.y, -q.z, -q.w);
    const d = [0.5 * (t.x * q.w + (t.y * q.z - t.z * q.y)), 0.5 * (t.y * q.w + (t.z * q.x - t.x * q.z)), 0.5 * (t.z * q.w + (t.x * q.y - t.y * q.x)), -0.5 * (t.x * q.x + t.y * q.y + t.z * q.z)];
    R.x += q.x * wt; R.y += q.y * wt; R.z += q.z * wt; R.w += q.w * wt; D.x += d[0] * wt; D.y += d[1] * wt; D.z += d[2] * wt; D.w += d[3] * wt; }
  const L = Math.hypot(R.x, R.y, R.z, R.w); R.x /= L; R.y /= L; R.z /= L; R.w /= L; D.x /= L; D.y /= L; D.z /= L; D.w /= L;
  const rv = new THREE.Vector3(R.x, R.y, R.z); const c1 = new THREE.Vector3().crossVectors(rv, base).addScaledVector(base, R.w); const c2 = new THREE.Vector3().crossVectors(rv, c1);
  out.copy(base).addScaledVector(c2, 2);
  const dv = new THREE.Vector3(D.x, D.y, D.z); const tr = dv.clone().multiplyScalar(R.w).addScaledVector(rv, -D.w).add(new THREE.Vector3().crossVectors(rv, dv)).multiplyScalar(2);
  return out.add(tr).applyMatrix4(mesh.bindMatrix).applyMatrix4(mesh.matrixWorld);
}

for (const id of ['dineth', 'shashika', 'david']) {
  const sp = HEROES[id]; ok(sp && sp.hero, `${id}: spec exists`); const ch = new Character(sp); const m = ch.mesh, g = m.geometry; const nb = m.skeleton.bones.length;
  console.log(`${id}: ${g.attributes.position.count} verts, ${nb} bones`);
  ok(nb >= 55, `${id}: ${nb} bones (need 55+)`); ok(nb === 23 + HERO_EXTRA.length, `${id}: bone count matches the hero list`);
  const pos = g.attributes.position, si = g.attributes.skinIndex, swt = g.attributes.skinWeight; let bad = 0, badW = 0, badI = 0; const used = new Set();
  for (let i = 0; i < pos.count; i++) { if (!Number.isFinite(pos.getX(i) + pos.getY(i) + pos.getZ(i))) bad++; let sum = 0; for (let k = 0; k < 4; k++) { const wt = swt.getComponent(i, k); sum += wt; if (wt > 0) { const b = si.getComponent(i, k); if (b >= nb) badI++; used.add(b); } } if (Math.abs(sum - 1) > 0.01) badW++; }
  ok(bad === 0, `${id}: ${bad} non-finite vertices`); ok(badW === 0, `${id}: ${badW} vertices with weights not summing to 1`); ok(badI === 0, `${id}: ${badI} out-of-range bone indices`);
  const fingerBones = HERO_EXTRA.filter((n) => /^(idx|mid|rng|pnk|thb)[123][LR]$/.test(n)); const unused = fingerBones.filter((n) => !used.has(m.skeleton.bones.findIndex((b) => b.name === n)));
  ok(unused.length === 0, `${id}: finger bones without skin: ${unused.join(',')}`);
  for (const n of ['toeL', 'toeR', 'foreTwistL', 'foreTwistR', 'armTwistL', 'armTwistR']) ok(used.has(m.skeleton.bones.findIndex((b) => b.name === n)), `${id}: ${n} skins nothing`);
  const dyn = { dineth: ['flapL1', 'flapL2', 'flapR1', 'flapR2', 'hemB1'], shashika: ['strapA1', 'strapA2', 'strapB1', 'strapB2'], david: ['fob1', 'fob2'] }[id];
  for (const n of dyn) ok(used.has(m.skeleton.bones.findIndex((b) => b.name === n)), `${id}: dynamic bone ${n} skins nothing`);
  ok(!!g.attributes.aSkin, `${id}: aSkin attribute`); const sk = g.attributes.aSkin.array.reduce((a, b) => a + b, 0) / pos.count; ok(sk > 0.05 && sk < 0.8, `${id}: skin fraction ${sk.toFixed(2)}`);

  // shader patch: run onBeforeCompile on three's real standard shader and check each replacement landed
  if (id === 'dineth') for (const [mat, kind] of [[m.material[0], 'body'], [m.material[1], 'face'], [m.material[2], 'hair']]) {
    const sh = { vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader, uniforms: {} }; mat.onBeforeCompile(sh, null);
    const vs = sh.vertexShader, fs = sh.fragmentShader;
    ok(vs.includes('dqFrom(') && !vs.includes('#include <skinning_vertex>') && !vs.includes('#include <skinnormal_vertex>'), `${kind}: DQ skinning patched`);
    ok(fs.includes('thin-edge translucency') || fs.includes('HERO_SSS'), `${kind}: SSS block present`); ok(!fs.includes('#include <lights_physical_pars_fragment>'), `${kind}: physical lights chunk inlined`);
    ok(fs.includes('vSkin * 0.12'), `${kind}: SSS line replaced inside RE_Direct_Physical`); ok(fs.includes('uWet'), `${kind}: wetness layer`);
    if (kind === 'face') ok(fs.includes('wrinkleMap'), 'face: wrinkle normal blend'); if (kind === 'hair') ok(fs.includes('uWet') && sh.uniforms.uWet, 'hair: chained onto the Kajiya-Kay patch');
  }

  // DQ vs LBS at a hard elbow and knee bend: ring vertices around the joint, mean distance to the joint centre
  const A = ch.anim; A.set(null); for (let i = 0; i < 10; i++) A.update(1 / 60, 0);
  const bendTest = (upper, lower, setBend) => {
    const ib = m.skeleton.bones.findIndex((b) => b.name === lower), ia = m.skeleton.bones.findIndex((b) => b.name === upper); const ring = [];
    for (let i = 0; i < pos.count; i++) { let wa = 0, wb = 0; for (let k = 0; k < 4; k++) { const b = si.getComponent(i, k), wt = swt.getComponent(i, k); if (b === ia) wa += wt; if (b === ib) wb += wt; } if (wa > 0.25 && wb > 0.25) ring.push(i); }
    setBend(); ch.root.updateMatrixWorld(true); m.skeleton.update(); const jc = ch.bones[lower].getWorldPosition(new THREE.Vector3());
    let lbs = 0, dq = 0; for (const i of ring) { m.getVertexPosition(i, v); v.applyMatrix4(m.matrixWorld); lbs += v.distanceTo(jc); skinDQ(m, i, w); dq += w.distanceTo(jc); }
    return { n: ring.length, lbs: lbs / ring.length, dq: dq / ring.length };
  };
  const rest = bendTest('armR', 'foreR', () => {}); const el = bendTest('armR', 'foreR', () => { ch.bones.foreR.rotation.set(-2.3, 0, 0); });
  ch.bones.foreR.rotation.set(0, 0, 0); const kr = bendTest('thighL', 'shinL', () => {}); const kn = bendTest('thighL', 'shinL', () => { ch.bones.shinL.rotation.set(2.2, 0, 0); }); ch.bones.shinL.rotation.set(0, 0, 0);
  console.log(`  elbow 132°: ring ${el.n} verts, radius rest ${(rest.dq * 100).toFixed(2)}cm → LBS ${(el.lbs * 100).toFixed(2)}cm (${(el.lbs / rest.lbs * 100).toFixed(0)}%), DQ ${(el.dq * 100).toFixed(2)}cm (${(el.dq / rest.dq * 100).toFixed(0)}%)`);
  console.log(`  knee 126°:  ring ${kn.n} verts, radius rest ${(kr.dq * 100).toFixed(2)}cm → LBS ${(kn.lbs * 100).toFixed(2)}cm (${(kn.lbs / kr.lbs * 100).toFixed(0)}%), DQ ${(kn.dq * 100).toFixed(2)}cm (${(kn.dq / kr.dq * 100).toFixed(0)}%)`);
  ok(el.n > 10 && kn.n > 10, `${id}: joint rings found`); ok(el.dq / rest.dq > 0.85 && el.dq > el.lbs * 1.05, `${id}: DQ elbow keeps volume`); ok(kn.dq / kr.dq > 0.85 && kn.dq > kn.lbs * 1.05, `${id}: DQ knee keeps volume`);

  // fingers: fist vs open — each digit's tip vertex must move noticeably relative to the hand bone
  const tipOf = (n) => { const bi = m.skeleton.bones.findIndex((b) => b.name === n); let best = -1, by = 1e9; for (let i = 0; i < pos.count; i++) for (let k = 0; k < 4; k++) if (si.getComponent(i, k) === bi && swt.getComponent(i, k) > 0.99 && pos.getY(i) < by) { by = pos.getY(i); best = i; } return best; };
  const tips = ['idx3R', 'mid3R', 'rng3R', 'pnk3R', 'thb3R'].map((n) => [n, tipOf(n)]);
  const measure = (pose) => { for (let f = 0; f < 40; f++) { ch.rig.hand('R', pose); A.update(1 / 60, 0); } ch.root.updateMatrixWorld(true); m.skeleton.update(); const inv = ch.bones.handR.matrixWorld.clone().invert(); return tips.map(([, i]) => skinDQ(m, i, new THREE.Vector3()).applyMatrix4(inv)); };
  const pOpen = measure('open'), pFist = measure('fist'); const hp0 = new THREE.Vector3(); // tip positions in hand space; the thumb curls across the palm, so test displacement rather than distance to the wrist
  tips.forEach(([n], k) => { const d = pOpen[k].distanceTo(pFist[k]); ok(d > (n.startsWith('thb') ? 0.02 : 0.04), `${id}: ${n} articulates (moves ${(d * 100).toFixed(1)}cm open→fist)`); ok(pFist[k].length() < pOpen[k].length() + 0.005, `${id}: ${n} closes towards the palm`); });
  console.log(`  tip travel open→fist (cm): ${tips.map(([n], k) => `${n.slice(0, 3)} ${(pOpen[k].distanceTo(pFist[k]) * 100).toFixed(1)}`).join('  ')}`);

  // secondary motion: jog forward 3 s then stop 3 s — dynamic bones must move while jogging, stay bounded, then settle
  let maxA = 0, finite = true; const ang = () => dyn.reduce((a, n) => { const q = ch.bones[n].quaternion; if (!Number.isFinite(q.w)) finite = false; return Math.max(a, 2 * Math.acos(Math.min(1, Math.abs(q.w)))); }, 0);
  for (let f = 0; f < 180; f++) { ch.root.position.z += 3.2 / 60; A.update(1 / 60, 3.2); ch.root.updateMatrixWorld(true); maxA = Math.max(maxA, ang()); }
  for (let f = 0; f < 180; f++) { A.update(1 / 60, 0); ch.root.updateMatrixWorld(true); }
  const endA = ang(); console.log(`  dynamic bones: max swing while jogging ${(maxA * 57.3).toFixed(1)}°, after stopping ${(endA * 57.3).toFixed(1)}°`);
  ok(finite, `${id}: dynamic bones finite`); ok(maxA > 0.03, `${id}: dynamic bones swing while moving`); ok(maxA < 1.6, `${id}: dynamic bones bounded`); ok(endA < maxA, `${id}: dynamic bones settle`);
  ch.dispose();
}
console.log(fails ? `hero-rig: ${fails} failed` : 'hero-rig: all passed'); process.exit(fails ? 1 : 0);
