// Protagonist head + footwear test (Node, no GPU): builds Dineth, Shashika and David and checks the MakeHuman-based
// head mesh (finite data, closed neck down to the collar cut, morph targets, blink driving, eyes, glasses,
// brown-black (not blue) hair colours) and the parametric hero shoes (on the ground, outward normals at the toe).
import './node-dom-stub.mjs';
const { Character, HEROES } = await import('../src/actors/Character.js');
const { heroHeadFit } = await import('../src/actors/HeroHead.js');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };

for (const id of ['dineth', 'shashika', 'david']) {
  const sp = HEROES[id]; const ch = new Character(sp); const g = ch.head.geometry; const P = g.attributes.position.array, N = g.attributes.normal.array;
  ok(g.attributes.position.count > 8000, `${id}: head has real resolution (${g.attributes.position.count} verts)`);
  ok(P.every(Number.isFinite) && N.every(Number.isFinite), `${id}: finite positions/normals`);
  ok(g.morphAttributes.position.length === 14, `${id}: 14 morph targets`);
  ok(g.morphAttributes.position.every((m) => m.array.every(Number.isFinite)), `${id}: finite morph deltas`);
  ok(ch.eyes.length === 2, `${id}: two eyeballs`);
  ok(!!ch.glasses === !!sp.glasses, `${id}: glasses only where specified`);
  ok(ch.head.material.length === g.groups.length, `${id}: one material per group`);
  // neck: the head reaches down to the level cut (no throat hole above the collar): every skin column ends at cutY
  const F = heroHeadFit(sp); let minY = 1e9; for (let i = 1; i < P.length; i += 3) minY = Math.min(minY, P[i]);
  ok(Math.abs(minY - F.cutY) < 0.003, `${id}: head skin reaches the collar cut (${minY.toFixed(3)} vs ${F.cutY.toFixed(3)})`);
  // throat front is skin (vertices exist in front of the neck centre between cut and chin)
  let throat = 0; const zc = F.section.cz + 0.01; for (let i = 0; i < P.length; i += 3) if (P[i + 1] > F.cutY + 0.02 && P[i + 1] < F.cutY + 0.07 && P[i + 2] > zc + 0.03 && Math.abs(P[i]) < 0.02) throat++;
  ok(throat > 10, `${id}: throat front present (${throat})`);
  // hair / beard / brow colours are brown-black, never blue-dominant
  const C = g.attributes.color.array; const hairKeys = ['hair', 'hairFur', 'brow', 'beardBase', 'fur']; let blue = 0, n = 0;
  g.groups.forEach((gr, gi) => { const key = ch.head.userData.keys ? ch.head.userData.keys[gi] : null; if (key && !hairKeys.includes(key)) return; if (!key && gi === 0) return;
    for (let t = gr.start; t < gr.start + gr.count; t++) { const v = g.index.array[t]; n++; if (C[v * 3 + 2] > C[v * 3] * 1.05) blue++; } });
  ok(n > 0 && blue / n < 0.02, `${id}: hair colours not blue (${blue}/${n})`);
  // blink drives the lids
  for (let k = 0; k < 20; k++) { ch.face.blink = 0.06; ch.face.update(1 / 60); }
  ok(Math.max(...ch.head.morphTargetInfluences) > 0.3, `${id}: blink drives the morphs`);
  // shoes: sole on the ground, toe reaches forward, toe-tip normals point outwards (no inverted faces)
  const bg = ch.mesh.geometry, BP = bg.attributes.position.array, BN = bg.attributes.normal.array; let low = 1e9, maxZ = -1e9, nz = 0, cnt = 0;
  for (let i = 0; i < BP.length; i += 3) { if (BP[i + 1] < 0.2) { low = Math.min(low, BP[i + 1]); maxZ = Math.max(maxZ, BP[i + 2]); }
    if (BP[i + 1] < 0.08 && BP[i + 2] > 0.16) { nz += BN[i + 2]; cnt++; } }
  ok(Math.abs(low) < 0.004, `${id}: shoe sole on the ground (${low.toFixed(4)})`);
  ok(maxZ > 0.165 && maxZ < 0.2, `${id}: shoe length plausible (toe z ${maxZ.toFixed(3)})`);
  ok(cnt > 50 && nz / cnt > 0.3, `${id}: toe normals face forward (${cnt}, ${(nz / Math.max(1, cnt)).toFixed(2)})`);
  ch.dispose();
}
console.log(`hero-head-test: ${pass} passed, ${fail} failed`); if (fail) process.exit(1);
