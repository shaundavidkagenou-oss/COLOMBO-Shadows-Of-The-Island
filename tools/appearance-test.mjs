// Appearance / adult-only acceptance test (Node, no browser).
//  1. every preset × 8 seeds builds a valid skinned mesh (finite positions, weights sum to 1)
//  2. no spawn route can produce a minor: random requests, explicit child/teen requests, and the exact option sets used by
//     the crowd, traffic drivers/passengers, story NPCs and shop keepers
//  3. presets are distinct (outfit family / hair / facial hair / accessories / age band / sex signature) — at least 40
//  4. variation inside a preset (two seeds of the same preset differ in face, head shape, height and colours)
import './node-dom-stub.mjs';
const { Character, randomSpec, buildBodyGeometry, HEROES } = await import('../src/actors/Character.js');
const { PRESETS, FACE_VARIANTS, isAdultSpec, lookKey, makeAppearance } = await import('../src/actors/Appearance.js');
let fails = 0, checks = 0; const out = []; const ok = (c, msg) => { checks++; if (!c) { fails++; out.push('FAIL ' + msg); } };
// 1. geometry
let verts = 0;
for (const p of PRESETS) for (let k = 0; k < 8; k++) {
  const sp = randomSpec(1000 + k * 977, { preset: p.id }); ok(sp.preset === p.id, `${p.id}: preset honoured`); ok(isAdultSpec(sp), `${p.id}#${k}: adult (${sp.ageYears}y, ${sp.height.toFixed(2)} m)`);
  const g = buildBodyGeometry(sp); const pos = g.attributes.position.array, sw = g.attributes.skinWeight.array; verts += pos.length / 3;
  let finite = true; for (let i = 0; i < pos.length; i++) if (!Number.isFinite(pos[i])) { finite = false; break; } ok(finite, `${p.id}#${k}: finite geometry`);
  let wOk = true; for (let i = 0; i < sw.length; i += 4) { const t = sw[i] + sw[i + 1] + sw[i + 2] + sw[i + 3]; if (Math.abs(t - 1) > 1e-3) { wOk = false; break; } } ok(wOk, `${p.id}#${k}: skin weights normalised`);
  let maxY = 0; for (let i = 1; i < pos.length; i += 3) maxY = Math.max(maxY, pos[i]); ok(maxY > 1.4 && maxY < 2.1, `${p.id}#${k}: plausible adult height ${maxY.toFixed(2)}`);
  if (k === 0) { const ch = new Character(sp); ok(!!ch.mesh && ch.face, `${p.id}: Character builds`); ch.dispose(); }
}
// 2. no minors on any route
const routes = { random: (i) => randomSpec(i * 7 + 3), askChild: (i) => randomSpec(i, { age: 'child' }), askTeen: (i) => randomSpec(i, { age: 'teen', sex: i % 2 ? 'f' : 'm' }),
  crowdPool: (i) => randomSpec(9000 + i * 17, i < PRESETS.length ? { preset: PRESETS[i].id } : {}), trafficDriver: (i) => randomSpec(5000 + i * 13, { sex: i % 5 === 0 ? 'f' : 'm', age: 'adult' }),
  trafficPax: (i) => randomSpec(90000 + i * 41, { age: 'adult' }), storyElder: (i) => randomSpec(4242 + i, { sex: 'm', age: 'elder', outfit: 'shirt', top: '#f2f2ee' }),
  keeperSaree: (i) => randomSpec(611 + i, { seed: 611, sex: 'f', age: 'adult', outfit: 'saree', top: '#6a2a7a', skirt: 'ankle', skirtCol: '#6a2a7a', pattern: 1, hair: 'bun' }), keeperWorker: (i) => randomSpec(733 + i, { seed: 733, sex: 'm', age: 'adult', outfit: 'worker', top: '#5a6b3a', cap: '#1f2a3a' }) };
const ages = []; for (const [name, fn] of Object.entries(routes)) { let bad = 0; for (let i = 0; i < 400; i++) { const sp = fn(i); ages.push(sp.ageYears); if (!isAdultSpec(sp)) bad++; } ok(bad === 0, `route ${name}: ${bad} non-adult specs`); }
for (const h of Object.values(HEROES)) ok(h.age === 'adult' || h.age === 'elder', `hero ${h.seed} adult`);
// forced outfit must not leak preset clothing (e.g. a skirt under a forced worker outfit)
{ const sp = routes.keeperWorker(5); ok(!sp.skirt && sp.outfit === 'worker' && sp.hair !== 'hijab', 'forced outfit drops preset skirt/scarf'); }
// 3. distinct presets
const sig = (p) => [p.sex, p.band, p.o, (p.hair || []).join('/'), (p.fh || []).join('/'), Object.keys(p.acc || {}).sort().join('+'), p.ft, p.skinSet || 'lk', p.profile, p.bottom || '', p.shorts ? 'sh' : '', p.long ? 'long' : '', p.uniform || ''].join('|');
const sigs = new Set(PRESETS.map(sig)); ok(sigs.size === PRESETS.length && PRESETS.length >= 40, `distinct presets: ${sigs.size} of ${PRESETS.length}`);
const ids = new Set(PRESETS.map((p) => p.id)); ok(ids.size === PRESETS.length, 'unique preset ids');
// 4. variation within a preset
let varied = 0; for (const p of PRESETS) { const a = makeAppearance(11, { preset: p.id }), b = makeAppearance(12345, { preset: p.id }); const d = [a.faceV !== b.faceV, Math.abs(a.height - b.height) > 0.01, Math.abs(a.head.jaw - b.head.jaw) > 0.01, a.skin !== b.skin, lookKey(a) !== lookKey(b), a.hair !== b.hair]; if (d.filter(Boolean).length >= 3) varied++; }
ok(varied >= PRESETS.length - 2, `variation inside presets: ${varied}/${PRESETS.length}`);
const usedFaces = new Set(); for (const p of PRESETS) for (let k = 0; k < 8; k++) usedFaces.add(makeAppearance(k * 31 + 7, { preset: p.id }).faceV);
const outfits = new Set(PRESETS.map((p) => p.o)); const modern = PRESETS.filter((p) => !['saree', 'sarong', 'national', 'abaya', 'salwar', 'kurta'].includes(p.o)).reduce((t, p) => t + p.w, 0) / PRESETS.reduce((t, p) => t + p.w, 0);
console.log(out.slice(0, 30).join('\n'));
console.log(`presets ${PRESETS.length} (distinct ${sigs.size}) · outfit families ${outfits.size} · face variants used ${usedFaces.size}/${FACE_VARIANTS.length} · modern-clothing share of the street mix ${(modern * 100).toFixed(0)}% · min age ${Math.min(...ages)} · avg verts ${(verts / PRESETS.length / 8).toFixed(0)}`);
console.log(`${checks} checks, ${fails} failures`); process.exit(fails ? 1 : 0);
