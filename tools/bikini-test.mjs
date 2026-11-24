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

// Whole-body dancers: the bikini is a fitted garment mesh (DancerRig 'dancerWear') cut from her own skin; the skin it fully
// covers is removed from the body's index; the chest secondary motion is a spring per breast bone (DancerRig.breasts).
function dancerBodyChecks(d, sp, ch) {
  const R = ch.dancer, wear = R.wear; const WG = wear?.geometry, C = WG?.attributes.color;
  ok(!!wear && WG.attributes.position.count > 200, `${d.name}: fitted garment mesh present`);
  ok(R.hidden > 50, `${d.name}: covered skin removed under the garments (${R.hidden} tris)`);
  // fabric colour: the garment vertex colours of the fabric group must clearly differ from her skin
  const grp = WG.groups.find((g) => g.materialIndex === 0) || { start: 0, count: WG.index ? WG.index.count : WG.attributes.position.count };
  const idx = WG.index; const S = new THREE.Color(sp.skin); const Sl = S.clone().convertSRGBToLinear(); let far = 0, n = 0;
  for (let k = grp.start; k < grp.start + grp.count; k += 3) { const i = idx ? idx.getX(k) : k; const r = C.getX(i), g = C.getY(i), b = C.getZ(i);
    const dd = Math.min(Math.abs(r - S.r) + Math.abs(g - S.g) + Math.abs(b - S.b), Math.abs(r - Sl.r) + Math.abs(g - Sl.g) + Math.abs(b - Sl.b)); n++; if (dd > 0.25) far++; }
  ok(n > 50 && far / n > 0.9, `${d.name}: garment colour clearly differs from her skin (${far}/${n})`);
  ok(R.br?.length === 2 && ch.bones.breastL && ch.bones.breastR, `${d.name}: breast bones + spring state`);
  const scene = new THREE.Scene(); scene.add(ch.root);
  const pd = new PoleDancer(ch, { x: 0, z: 0, y0: 0, y1: 3.6 }, { seed: d.seed, audience: [0, -3], name: d.name });
  const dt = 1 / 60, M = R.bmax; let bad = 0, maxAbs = 0, maxStep = 0, sum = 0, sum2 = 0, cnt = 0; const prev = [0, 0, 0, 0, 0, 0];
  for (let f = 0; f < 3600; f++) {
    pd.update(dt); scene.updateMatrixWorld(true);
    R.br.forEach((B, j) => { const o = B.lim || [0, 0, 0]; for (let c = 0; c < 3; c++) { const v = o[c]; if (!Number.isFinite(v)) bad++; maxAbs = Math.max(maxAbs, Math.abs(v));
      if (f > 30) maxStep = Math.max(maxStep, Math.abs(v - prev[j * 3 + c])); prev[j * 3 + c] = v; } });
    if (f > 60) { const v = (R.br[0].lim || [0, 0, 0])[1]; sum += v; sum2 += v * v; cnt++; }
  }
  const sd = Math.sqrt(Math.max(0, sum2 / cnt - (sum / cnt) ** 2));
  ok(bad === 0 && maxAbs <= M + 1e-6, `${d.name}: spring offsets finite and within the soft limit (max ${(maxAbs * 1000).toFixed(1)} mm ≤ ${(M * 1000).toFixed(1)})`);
  ok(sd > M * 0.05, `${d.name}: the chest actually moves with the dance (lift std ${(sd * 1000).toFixed(2)} mm)`);
  ok(maxStep < M * 0.6, `${d.name}: no frame-to-frame snapping (max step ${(maxStep * 1000).toFixed(2)} mm)`);
  ch.root.position.set(5, 0, 5); ch.root.rotation.set(0, 0, 0); for (let f = 0; f < 240; f++) { ch.anim.update(dt, 0); R.update(dt); scene.updateMatrixWorld(true); }
  const rest = Math.max(...R.br.flatMap((B) => (B.lim || [0, 0, 0]).map(Math.abs)));
  ok(rest < M * 0.25, `${d.name}: settles at rest when still (${(rest * 1000).toFixed(2)} mm)`);
  if (V) console.log(`${d.name.padEnd(8)} wear ${WG.attributes.position.count} v · hidden ${R.hidden} · fabric ${far}/${n} · lift std ${(sd * 1000).toFixed(2)} mm max ${(maxAbs * 1000).toFixed(1)} step ${(maxStep * 1000).toFixed(2)} rest ${(rest * 1000).toFixed(2)}`);
}

for (const d of DANCERS) {
  const sp = dancerSpec(d); const ch = new Character(sp);
  if (ch.dancer) { dancerBodyChecks(d, sp, ch); continue; } // whole-body MakeHuman dancers (DancerBody.js / DancerRig.js)
  const geo = ch.mesh.geometry; const P = geo.attributes.position, C = geo.attributes.color;
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
