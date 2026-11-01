// Crowd-head test (Node, headless): every face variant × facial-hair / scarf style builds a sane head at both LODs, the
// LOD keeps the same morph set (expressions carry over), every non-protagonist gets one, and the cost rules hold
// (near head shadows follow the body's flag, the distant head casts none, the distant level is much lighter).
import './node-dom-stub.mjs';
globalThis.localStorage ??= { getItem: () => null, setItem: () => {}, removeItem: () => {} };
const { npcHeadGeometry, NPC_MORPHS } = await import('../src/actors/NpcHead.js');
const { Character } = await import('../src/actors/Character.js');
const A = await import('../src/actors/Appearance.js');
const DATA = (await import('../src/actors/npcHeadData.js')).default;
let pass = 0, fail = 0; const ok = (c, msg) => { if (c) pass++; else { fail++; console.log('FAIL', msg); } };

const styles = [{ beard: null, mous: false, hijab: false }, { beard: null, mous: true, hijab: false }, { beard: 'full', mous: true, hijab: false }, { beard: 'goatee', mous: true, hijab: false }, { beard: 'short', mous: false, hijab: false }, { beard: null, mous: false, hijab: true }];
let worst = { hi: 0, lo: 0 }, bad = 0;
for (let v = 0; v < DATA.variants.length; v++) for (const st of styles) {
  const opts = { ...st, hair: [0.02, 0.015, 0.012] }; const g = [npcHeadGeometry(v, opts, 0), npcHeadGeometry(v, opts, 1)];
  for (let li = 0; li < 2; li++) { const G = g[li]; const pos = G.attributes.position.array, n = G.attributes.position.count, ix = G.index.array;
    let finite = true; for (let i = 0; i < pos.length; i++) if (!Number.isFinite(pos[i]) || Math.abs(pos[i]) > 0.3) { finite = false; break; }
    let inRange = true; for (let i = 0; i < ix.length; i++) if (ix[i] >= n) { inRange = false; break; }
    const nm = G.morphAttributes.position.length; const t = ix.length / 3; worst[li ? 'lo' : 'hi'] = Math.max(worst[li ? 'lo' : 'hi'], t);
    if (!finite || !inRange || nm !== NPC_MORPHS.length) { if (bad++ < 5) console.log('bad head', v, JSON.stringify(st), li, { finite, inRange, nm }); } }
  ok(g[1].index.count < g[0].index.count * 0.6, `variant ${v} ${JSON.stringify(st)}: distant LOD is much lighter (${g[1].index.count / 3} vs ${g[0].index.count / 3} tris)`);
}
ok(bad === 0, `all ${DATA.variants.length * styles.length * 2} head geometries finite, indexed in range, ${NPC_MORPHS.length} morphs`);
ok(worst.hi < 8000 && worst.lo < 2600, `triangle budget (worst near ${worst.hi}, distant ${worst.lo})`);

// characters: every crowd person gets the head LOD; protagonists keep their own heads
let civ = 0, withHead = 0, shadowOk = 0, loNoShadow = 0, shared = 0;
for (const pr of A.PRESETS) { const sp = A.makeAppearance(77, { preset: pr.id }); const ch = new Character(sp); civ++;
  const lod = ch.bones.head.children.find((o) => o.name === 'npcHeadLOD'); if (lod && lod.levels.length === 2) withHead++;
  if (ch.head && ch.headLo) { ch.mesh.castShadow = false; const off = ch.head.castShadow === false; ch.mesh.castShadow = true; if (off && ch.head.castShadow === true) shadowOk++;
    if (ch.headLo.castShadow === false) loNoShadow++; if (ch.headLo.morphTargetInfluences === ch.head.morphTargetInfluences && ch.headLo.material === ch.head.material) shared++; }
  ch.dispose(); }
ok(withHead === civ, `every crowd preset gets a two-level head (${withHead}/${civ})`);
ok(shadowOk === civ, `near head shadow follows the body's castShadow (${shadowOk}/${civ})`);
ok(loNoShadow === civ, `distant head casts no shadow of its own (${loNoShadow}/${civ})`);
ok(shared === civ, `LOD levels share material + morph influences (${shared}/${civ})`);
{ const ch = new Character(A.makeAppearance(5, { preset: A.PRESETS[0].id })); ch.face.set && ch.face.set('smile', 2); for (let i = 0; i < 20; i++) ch.face.update ? ch.face.update(1 / 30) : null;
  ok(ch.head.morphTargetInfluences.length === NPC_MORPHS.length, 'morph influence slots match the morph names'); ch.dispose(); }
console.log(`npc-head: ${pass + fail} checks, ${fail} failed`); process.exit(fail ? 1 : 0);
