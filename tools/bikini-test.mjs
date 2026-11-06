// Club dancers' stage bikinis and chest secondary motion (world/ClubCast.js dancerSpec, actors/Character.js sp.bikini /
// sp.bustSpring / updateBust). For each of the four dancers:
//   outfit   the whole bust is covered by the top (every vertex the bust shapes is top-coloured), the midriff, upper chest,
//            shoulders and arms are bare, the briefs cover the hips; the top is a real garment colour (never skin-like)
//   spring   60 s of pole dancing at 60 fps: the two morph influences stay finite and within ±1, actually move with the
//            dance, never jump between frames, and settle back to rest when she stands still
// Run: node tools/bikini-test.mjs
import './node-dom-stub.mjs';
globalThis.addEventListener ??= () => {}; globalThis.removeEventListener ??= () => {}; globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} }; globalThis.navigator ??= { getGamepads: () => [] };
const THREE = await import('three');
const { Character } = await import('../src/actors/Character.js');
const { PoleDancer } = await import('../src/actors/PoleDance.js');
const { DANCERS, dancerSpec } = await import('../src/world/ClubCast.js');

let checks = 0, fails = 0; const ok = (c, msg) => { checks++; if (!c) { fails++; console.log('FAIL', msg); } };
const V = !!process.env.V; const col = (h) => new THREE.Color(h).convertSRGBToLinear();
const near = (g, i, c) => Math.abs(g.getX(i) - c.r) + Math.abs(g.getY(i) - c.g) + Math.abs(g.getZ(i) - c.b) < 0.02;

for (const d of DANCERS) {
  const sp = dancerSpec(d); const ch = new Character(sp); const geo = ch.mesh.geometry; const P = geo.attributes.position, C = geo.attributes.color;
  const s = sp.height / 1.72; const cSkin = col(sp.skin);
  const pick = (c) => { let n = 0; for (let i = 0; i < C.count; i++) if (near(C, i, c)) n++; return n; };
  // whichever encoding Character.js uses (linear or sRGB), use the one that matches vertices
  const enc = pick(cSkin) > pick(new THREE.Color(sp.skin)) ? col : (h) => new THREE.Color(h);
  const T = enc(sp.top), S = enc(sp.skin), Bc = enc(sp.bottom);
  ok(Math.abs(T.r - S.r) + Math.abs(T.g - S.g) + Math.abs(T.b - S.b) > 0.25, `${d.name}: top colour clearly differs from her skin`);
  const M = geo.morphAttributes.position; ok(M && M.length === 2, `${d.name}: chest morph targets present`); if (!M) continue;
  ok(ch.bust && ch.mesh.morphTargetInfluences?.length === 2, `${d.name}: spring state + influences`);
  let bust = 0, bustCov = 0, worst = 1; let mid = 0, midSkin = 0, upper = 0, upperSkin = 0, hip = 0, hipBot = 0;
  for (let i = 0; i < P.count; i++) {
    const wB = M[0].getY(i) / 0.013, x = P.getX(i), y = P.getY(i) / s, z = P.getZ(i);
    if (wB > 0.3) { bust++; if (near(C, i, T)) bustCov++; else worst = Math.min(worst, y); }
    if (Math.abs(x) < 0.08 && z > 0.04 && y > 1.0 && y < 1.125) { mid++; if (near(C, i, S)) midSkin++; }
    if (Math.abs(x) < 0.1 && z > 0.03 && y > 1.40 && y < 1.44) { upper++; if (near(C, i, S)) upperSkin++; }
    if (Math.abs(x) < 0.12 && y > 0.875 && y < 0.925 && Math.abs(z) > 0.05) { hip++; if (near(C, i, Bc)) hipBot++; }
  }
  ok(bust >= 8 && bustCov === bust, `${d.name}: bust covered by the top (${bustCov}/${bust}${bustCov < bust ? `, uncovered at y ${worst.toFixed(3)}` : ''})`);
  ok(mid > 4 && midSkin / mid > 0.9, `${d.name}: bare midriff (${midSkin}/${mid})`);
  ok(upper > 4 && upperSkin / upper > 0.9, `${d.name}: bare upper chest (${upperSkin}/${upper})`);
  ok(hip > 4 && hipBot / hip > 0.9, `${d.name}: briefs cover the hips (${hipBot}/${hip})`);

  // spring: dance for 60 s
  const scene = new THREE.Scene(); scene.add(ch.root);
  const pd = new PoleDancer(ch, { x: 0, z: 0, y0: 0, y1: 3.6 }, { seed: d.seed, audience: [0, -3], name: d.name });
  const dt = 1 / 60; const inf = ch.mesh.morphTargetInfluences; let bad = 0, maxStep = 0, sum = 0, sum2 = 0, n = 0, maxAbs = 0; const prev = [0, 0];
  for (let f = 0; f < 3600; f++) {
    pd.update(dt); scene.updateMatrixWorld(true);
    for (let k = 0; k < 2; k++) { const v = inf[k]; if (!Number.isFinite(v)) bad++; maxAbs = Math.max(maxAbs, Math.abs(v)); if (f > 30) maxStep = Math.max(maxStep, Math.abs(v - prev[k])); prev[k] = v; }
    if (f > 60) { sum += inf[0]; sum2 += inf[0] * inf[0]; n++; }
  }
  const sd = Math.sqrt(Math.max(0, sum2 / n - (sum / n) ** 2));
  ok(bad === 0 && maxAbs <= 1, `${d.name}: influences finite and within ±1 (max ${maxAbs.toFixed(2)})`);
  ok(sd > 0.03, `${d.name}: the chest actually moves with the dance (lift std ${sd.toFixed(3)})`);
  ok(maxStep < 0.3, `${d.name}: no frame-to-frame snapping (max step ${maxStep.toFixed(3)})`);
  // standing still upright: settles to rest
  ch.root.position.set(5, 0, 5); ch.root.rotation.set(0, 0, 0); for (let f = 0; f < 240; f++) { ch.anim.update(dt, 0); scene.updateMatrixWorld(true); }
  ok(Math.abs(inf[0]) < 0.12 && Math.abs(inf[1]) < 0.12, `${d.name}: settles at rest when still (${inf[0].toFixed(3)}, ${inf[1].toFixed(3)})`);
  if (V) console.log(`${d.name.padEnd(8)} bust verts ${bust} covered ${bustCov} · midriff ${midSkin}/${mid} · chest ${upperSkin}/${upper} · hips ${hipBot}/${hip} · lift std ${sd.toFixed(3)} max ${maxAbs.toFixed(2)} step ${maxStep.toFixed(3)}`);
}
console.log(`bikini: ${checks} checks, ${fails} failed`);
process.exit(fails ? 1 : 0);
