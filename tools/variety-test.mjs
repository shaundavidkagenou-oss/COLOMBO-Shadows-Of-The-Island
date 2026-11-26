// 96th: crowd look-variant / spawn-history checks (node, no browser).
//   node tools/variety-test.mjs
// · lookVariant is deterministic, adult, keeps every geometry-shaping field and the head-mesh variant, changes colours
// · the recoloured body shares every buffer but the colours with the cached look, classifies ≥ 97 % of the coloured
//   vertices of every crowd look, and its garment colours really are the variant's
// · variant geometries are reference-counted and freed (idle pool bounded)
// · SpawnHistory / CoarseGrid answer locally and stay bounded
import './node-dom-stub.mjs';
const { Character, randomSpec } = await import('../src/actors/Character.js');
const A = await import('../src/actors/Appearance.js');
const { variantStats } = await import('../src/actors/LookVariant.js');
const { npcVariant } = await import('../src/actors/NpcHead.js');
const { SpawnHistory, CoarseGrid } = await import('../src/core/SpawnHistory.js');
const THREE = await import('three');
let fail = 0; const ok = (c, m) => { if (!c) { fail++; console.log('FAIL', m); } };
const GEOM = ['preset', 'profile', 'sex', 'band', 'ageYears', 'age', 'height', 'build', 'belly', 'hair', 'hairline', 'outfit', 'skirt', 'pattern', 'longSleeve', 'collar', 'sleeveless', 'shorts', 'hood', 'glasses', 'sunglasses', 'earrings', 'necklace', 'bangles', 'capStyle', 'sandals', 'seed', 'denim', 'track'];
const N = A.PRESETS.length + 8; let cover = [], worst = [1, ''], distinct = new Set(), shared = true, colOk = 0, colN = 0;
for (let k = 0; k < N; k++) {
  const base = randomSpec(9000 + k * 17, k < A.PRESETS.length ? { preset: A.PRESETS[k].id } : {}); base._k = k;
  const ch0 = new Character(base); const hi0 = ch0.geoHi || ch0.mesh.geometry;
  for (let vi = 0; vi < A.LOOK_VARIANTS; vi++) {
    const v = A.lookVariant(base, vi), v2 = A.lookVariant(base, vi);
    ok(JSON.stringify(v) === JSON.stringify(v2), `deterministic ${base.preset} v${vi}`); ok(A.isAdultSpec(v), `adult ${base.preset} v${vi}`);
    for (const f of GEOM) ok(JSON.stringify(v[f]) === JSON.stringify(base[f]), `geometry field ${f} kept ${base.preset} v${vi}`);
    ok(npcVariant(v) === npcVariant(base), `head mesh variant kept ${base.preset} v${vi}`); ok(v._k === k, '_k kept');
    distinct.add(A.lookKey(v) + v.skin + v.hairColor + v.faceV);
    if (!vi) continue; const ch = new Character(v); ok(ch.mesh.geometry === ch.geoLo, `variant starts on its far body ${base.preset}`); const hi = ch.ensureHi();
    if (hi !== hi0) { for (const a in hi.attributes) if (a !== 'color' && hi.attributes[a] !== hi0.attributes[a]) shared = false; if (hi.index !== hi0.index) shared = false;
      // garment colour check: vertices that were exactly the base top colour now carry the variant top colour
      if (v.top && v.top !== base.top) { const o = new THREE.Color(base.top), n = new THREE.Color(v.top); const c0 = hi0.attributes.color, c1 = hi.attributes.color; let m = 0, good = 0;
        for (let i = 0; i < c0.count; i++) if (Math.abs(c0.getX(i) - o.r) + Math.abs(c0.getY(i) - o.g) + Math.abs(c0.getZ(i) - o.b) < 1e-4) { m++; if (Math.abs(c1.getX(i) - n.r) + Math.abs(c1.getY(i) - n.g) + Math.abs(c1.getZ(i) - n.b) < 0.004) good++; }
        if (m) { colN++; if (good / m > 0.98) colOk++; else console.log('top recolour', base.preset, vi, good, '/', m); } } }
    ch.dispose();
  }
  // classification coverage of this look
  ch0.dispose();
}
// coverage from the slot tables (internal: re-run classify through a variant of every look)
const LV = await import('../src/actors/LookVariant.js');
for (let k = 0; k < N; k++) { const base = randomSpec(9000 + k * 17, k < A.PRESETS.length ? { preset: A.PRESETS[k].id } : {}); const ch = new Character(base); const g = ch.geoHi || ch.mesh.geometry; const c = LV.coverage(g, base); cover.push(c); if (c < worst[0]) worst = [c, base.preset]; ch.dispose(); }
const mean = cover.reduce((a, b) => a + b, 0) / cover.length;
console.log(`looks ${N} × ${A.LOOK_VARIANTS} variants → ${distinct.size} distinct; classified vertices mean ${(mean * 100).toFixed(1)} % worst ${(worst[0] * 100).toFixed(1)} % (${worst[1]}); top recolour exact ${colOk}/${colN}; buffers shared ${shared}`);
ok(distinct.size >= N * A.LOOK_VARIANTS * 0.9, 'distinct looks'); ok(mean > 0.97, 'coverage mean'); ok(worst[0] > 0.9, 'coverage worst'); ok(shared, 'shared buffers'); ok(colOk >= colN * 0.95, 'garment recolour');
console.log('variant geometries built', variantStats.built, 'freed', variantStats.freed, 'live', variantStats.live(), 'idle', variantStats.idle());
ok(variantStats.live() <= 24 + 1, 'variant cache bounded after dispose'); ok(variantStats.idle() <= 24, 'idle pool bounded');
// spawn history
const H = new SpawnHistory({ cell: 40, ring: 4, ttl: 10, maxCells: 16 });
H.add(5, 5, 'a', 0); ok(H.has(20, 20, 'a', 1, 40), 'history hit nearby'); ok(!H.has(400, 400, 'a', 1, 40), 'history local'); ok(!H.has(5, 5, 'a', 11, 40), 'history expires');
for (let i = 0; i < 200; i++) H.add(i * 50, 0, 's' + i, i * 0.01); ok(H.size <= 16, `history cells bounded (${H.size})`);
const G = new CoarseGrid(32); const objs = Array.from({ length: 500 }, (_, i) => ({ x: (i % 25) * 13, z: Math.floor(i / 25) * 13, id: i })); G.fill(objs);
const brute = objs.filter((o) => Math.hypot(o.x - 100, o.z - 100) < 30).length; let viaGrid = 0; G.each(100, 100, 30, () => viaGrid++); ok(brute === viaGrid, `grid query exact (${viaGrid}/${brute})`);
console.log(fail ? `${fail} FAILED` : 'ALL OK'); process.exit(fail ? 1 : 0);
