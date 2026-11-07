// Debug editors (src/debug): the parts that can run headless.
//   boot      with nothing saved, start-up loads none of the editor modules and patches nothing (no cost in normal play)
//   map       edits on the generated plan (move / resize / re-floor / delete / add buildings, trees, props, walls, plants,
//             placed objects) keep arrays, chunk lists and colliders consistent; the saved edit document applied to a freshly
//             generated plan in a NEW process reproduces exactly the edited city; edited chunks / forest rebuild without errors
//   anim      override clips: additive + replace keys land on the bones, clip speed scales the animation clock, bone scales
//             reset when the clip stops, save → load round trip
//   npc       custom NPCs: per-bone proportions + vertex paint applied to every Character built from the custom spec
//             (without touching the shared cached geometry), crowd spawn pool weights, adults only
// Run: node tools/editor-test.mjs
import './node-dom-stub.mjs';
globalThis.addEventListener ??= () => {}; globalThis.removeEventListener ??= () => {}; globalThis.navigator ??= { getGamepads: () => [] };
const LS = new Map(); globalThis.localStorage = { getItem: (k) => (LS.has(k) ? LS.get(k) : null), setItem: (k, v) => LS.set(k, String(v)), removeItem: (k) => LS.delete(k) };
import { execFileSync } from 'node:child_process';
import { writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const THREE = await import('three');
const { MAT } = await import('../src/gfx/Materials.js');
Object.setPrototypeOf(MAT, new Proxy({}, { get: (t, k) => { if (typeof k !== 'string') return undefined; if (!t[k]) t[k] = new THREE.MeshStandardMaterial({ name: k, vertexColors: true }); return t[k]; } }));
const CP = await import('../src/world/CityPlan.js');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;
const TMP = '/tmp/editor-test-edits.json';

// signature of the edited objects (both phases compute it the same way)
function signature(plan, eids) {
  const all = new Map(); for (const arr of ['buildings', 'trees', 'props', 'walls', 'plants']) for (const o of plan[arr] || []) if (o._eid) all.set(o._eid, o);
  const out = { counts: ['buildings', 'trees', 'props', 'walls', 'plants'].map((k) => (plan[k] || []).length), cols: plan.colliders.length, objs: {} };
  for (const id of eids) { const o = all.get(id); out.objs[id] = o ? JSON.stringify(['x0', 'x1', 'z0', 'z1', 'floors', 'h', 'totalH', 'x', 'z', 's', 'type', 'style', 'color', 'rot', 'yaw'].map((k) => (typeof o[k] === 'number' ? Math.round(o[k] * 1000) / 1000 : o[k] ?? null))) : 'deleted'; }
  return out;
}
function consistent(plan, MR) {
  let bad = 0; const idx = new Set();
  for (const [arr, bk] of Object.values(MR.KINDS)) { if (!bk) continue; for (const o of plan[arr]) { const [x, z] = o.x0 !== undefined ? [(o.x0 + o.x1) / 2, (o.z0 + o.z1) / 2] : [o.x, o.z]; const ci = CP.chunkIndex(x, z); if (ci >= 0 && !plan.byChunk[ci][bk].includes(o)) bad++; } }
  for (const ch of plan.byChunk) for (const bk of ['buildings', 'trees', 'props', 'walls']) for (const o of ch[bk] || []) { if (idx.has(o)) bad++; idx.add(o); }
  for (const b of plan.buildings) { const c = plan.colliders.filter((q) => q.b === b); if (c.length !== 1 || !near(c[0].x0, b.x0) || !near(c[0].z1, b.z1) || !near(c[0].h, b.totalH)) bad++; }
  for (const t of plan.trees) if (t.col && !plan.colliders.includes(t.col)) bad++;
  return bad;
}

if (process.env.PHASE === 'B') {
  // ---- a new process = a new game start: generate, apply the saved document, compare
  const MR = await import('../src/debug/MapRuntime.js'); const plan = CP.generatePlan(); const { assignIds } = await import('../src/debug/boot.js'); assignIds(plan);
  const D = JSON.parse(readFileSync(TMP, 'utf8')); const n = MR.applyEdits(plan, D.edits);
  const sig = signature(plan, D.eids); process.stdout.write(JSON.stringify({ n, sig, bad: consistent(plan, MR) }));
  process.exit(0);
}

// ---------------------------------------------------------------- boot: nothing saved → nothing loaded / patched
const { Character, Animator } = await import('../src/actors/Character.js');
const updBefore = Animator.prototype.update, headBefore = Character.prototype.attachNpcHead;
const boot = await import('../src/debug/boot.js');
const plan = CP.generatePlan();
await boot.bootMap(plan); ok(plan.buildings.every((b) => b._eid === 'b:' + b.id) && plan.trees.every((t, i) => t._eid === 't:' + i), 'boot: plan objects get stable ids right after generation');
const fakeGame = { crowd: { specs: [] } }; await boot.bootRuntime(fakeGame);
ok(Animator.prototype.update === updBefore && Character.prototype.attachNpcHead === headBefore, 'boot: no saved edits → Animator / Character are not patched (editor code not run)');
ok(JSON.stringify(boot.savedFlags()) === '{}', 'boot: no saved flags');
await boot.storeSet('x', { a: 1 }); ok((await boot.storeGet('x')).a === 1, 'store: set / get (memory fallback without IndexedDB)'); await boot.storeDel('x'); ok((await boot.storeGet('x')) === undefined, 'store: delete');

// ---------------------------------------------------------------- map
const MR = await import('../src/debug/MapRuntime.js');
ok(consistent(plan, MR) === 0, 'map: generated plan is consistent before editing');
const pickB = plan.buildings.filter((b) => !Object.values(plan.missionShops || {}).some((s) => s && s.b === b.id));
const b1 = pickB[100], b2 = pickB[200], b3 = pickB[300], t1 = plan.trees[50], t2 = plan.trees[60], p1 = plan.props[40], w1 = plan.walls[30], pl1 = plan.plants[70];
const eids = [b1, b2, b3, t1, t2, p1, w1, pl1].map((o) => o._eid);
const E = MR.MAP.edits; const record = (o) => { E.mods[o._eid] = Object.fromEntries(MR.FIELDS[MR.kindOf(o)].filter((k) => o[k] !== undefined).map((k) => [k, o[k]])); };
// move a building 30 m across chunks + add floors
const oldC = CP.chunkIndex((b1.x0 + b1.x1) / 2, (b1.z0 + b1.z1) / 2);
let out = MR.setFields(plan, b1, { x0: b1.x0 + 230, x1: b1.x1 + 230, floors: b1.floors + 3 }); record(b1);
const newC = CP.chunkIndex((b1.x0 + b1.x1) / 2, (b1.z0 + b1.z1) / 2);
ok(oldC !== newC && out.chunks.has(oldC) && out.chunks.has(newC), 'map: a moved building reports both chunks for rebuild');
ok(!plan.byChunk[oldC].buildings.includes(b1) && plan.byChunk[newC].buildings.includes(b1), 'map: moved building changes chunk list');
ok(near(b1.h, b1.floors * CP.FLOOR_H + (b1.groundRow != null ? CP.GROUND_H - CP.FLOOR_H : 0)), 'map: floors → height recomputed');
const bc = plan.colliders.find((c) => c.b === b1); ok(bc && near(bc.x0, b1.x0) && near(bc.h, b1.totalH), 'map: building collider follows');
MR.setFields(plan, b2, { style: 'office', color: '#3366aa', roof: 'flat' }); record(b2);
out = MR.removeObj(plan, b3); E.mods[b3._eid] = { del: true }; ok(!plan.buildings.includes(b3) && !plan.colliders.some((c) => c.b === b3) && out.removed.length === 1, 'map: deleted building leaves arrays, chunk and colliders');
MR.setFields(plan, t1, { x: t1.x + 3, s: 1.4, type: 'mango' }); record(t1); ok(near(t1.col.x0, t1.x - 0.35 * 1.4), 'map: tree collider follows move + scale');
out = MR.removeObj(plan, t2); E.mods[t2._eid] = { del: true }; ok(!plan.trees.includes(t2) && !plan.colliders.includes(t2.col), 'map: deleted tree + trunk collider gone');
MR.setFields(plan, p1, { x: p1.x + 1.5, rot: 1.1 }); record(p1);
MR.setFields(plan, w1, { h: 3.1 }); record(w1); ok(plan.colliders.some((c) => c.kind === 'wall' && near(c.h, 3.1) && near(c.x0, w1.x0)), 'map: wall collider height follows');
MR.removeObj(plan, pl1); E.mods[pl1._eid] = { del: true };
// added objects (templated like the editor does)
const tpl = JSON.parse(JSON.stringify(pickB[400], (k, v) => (k.startsWith('_') || ['col', 'id', 'h', 'totalH'].includes(k) ? undefined : v))); delete tpl.tower;
const addB = { ...tpl, x0: -300, x1: -285, z0: -100, z1: -88, uid: 'ub1', k: 'b' }; const addT = { type: 'palm', x: -310, z: -95, s: 1.1, yaw: 0.3, uid: 'ut1', k: 't' };
const addW = { x0: -320, x1: -310, z0: -80, z1: -79.8, h: 2, col: '#e8e0d0', uid: 'uw1', k: 'w' }; const addP = { type: plan.props[0].type, x: -305, z: -90, rot: 0, uid: 'up1', k: 'p' };
const addPrim = { uid: 'uq1', k: 'prim', shape: 'ramp', x: -300, y: 0, z: -70, sx: 4, sy: 1, sz: 6, color: '#888888', solid: true };
for (const d of [addB, addT, addW, addP, addPrim]) { E.added.push(d); const r = MR.createObj(plan, d); if (d.k !== 'prim') ok(r.obj && r.obj._eid === 'a:' + d.uid, 'map: added ' + d.k + ' gets an id'); }
eids.push('a:ub1', 'a:ut1', 'a:uw1', 'a:up1');
ok(consistent(plan, MR) === 0, 'map: plan still consistent after all edits');
const pc = MR.primCollider(addPrim); ok(pc && pc.x1 - pc.x0 > 3.9 && pc.h >= 1, 'map: solid placed object has a collider');
for (const s of MR.PRIM_SHAPES) { const g = MR.primMesh({ ...addPrim, shape: s }); ok(g.geometry.attributes.position.count > 0 && g.geometry.attributes.uv, 'map: object shape ' + s + ' builds with UVs'); }
// rebuilding edited chunks / forest works on the edited plan
const { MultiBuilder } = await import('../src/gfx/MeshBuilder.js'); const { buildBase, buildWall } = await import('../src/world/BuildingGen.js'); const { buildPropGeometries, buildPropsForChunk } = await import('../src/world/Props.js');
const { buildTreeGeometries } = await import('../src/world/Vegetation.js'); const { Forest } = await import('../src/world/Forest.js');
buildPropGeometries(); buildTreeGeometries();
let rebuildErr = null; const t0 = performance.now();
try { for (const ci of [oldC, newC, CP.chunkIndex(-300, -95)]) { const ch = plan.byChunk[ci]; const mb = new MultiBuilder(); for (const b of ch.buildings) buildBase(b, mb); for (const w of ch.walls || []) buildWall(w, mb); const ms = mb.toMeshes(MAT, { cast: true, receive: true }); if (!ms.length) throw new Error('no meshes'); buildPropsForChunk(ch); } } catch (e) { rebuildErr = e; }
const chunkMs = (performance.now() - t0) / 3;
ok(!rebuildErr, 'map: edited chunks rebuild (buildings, walls, props) ' + (rebuildErr ? rebuildErr.stack : ''));
const t1f = performance.now(); let forest = null; try { forest = new Forest(plan.trees, plan.plants, 'high'); } catch (e) { console.log(e); } const forestMs = performance.now() - t1f;
ok(forest && forest.group.children.length > 0, 'map: forest rebuilds from the edited tree / plant lists');
console.log(`map: chunk rebuild ${chunkMs.toFixed(0)} ms each, forest rebuild ${forestMs.toFixed(0)} ms`);
// save → new process → identical
await MR.saveMap(); ok(boot.savedFlags().map === true, 'map: save sets the start-up flag');
const sigA = signature(plan, eids); writeFileSync(TMP, JSON.stringify({ edits: JSON.parse(JSON.stringify(E)), eids }));
const resB = JSON.parse(execFileSync(process.execPath, [fileURLToPath(import.meta.url)], { env: { ...process.env, PHASE: 'B' }, maxBuffer: 1 << 26 }).toString());
ok(resB.bad === 0, 'map: reloaded plan consistent (' + resB.bad + ')');
ok(JSON.stringify(resB.sig.counts) === JSON.stringify(sigA.counts), `map: reload object counts match ${JSON.stringify(resB.sig.counts)} vs ${JSON.stringify(sigA.counts)}`);
ok(resB.sig.cols === sigA.cols, `map: reload collider count matches (${resB.sig.cols} vs ${sigA.cols})`);
for (const id of eids) ok(resB.sig.objs[id] === sigA.objs[id], `map: reloaded ${id} identical  ${resB.sig.objs[id]} vs ${sigA.objs[id]}`);

// ---------------------------------------------------------------- anim
const AR = await import('../src/debug/AnimRuntime.js'); AR.install();
const ch = new Character({ ...(await import('../src/actors/Appearance.js')).makeAppearance(77), ageYears: 30 });
const run = (n = 30) => { for (let i = 0; i < n; i++) ch.anim.update(1 / 60, 0, 0); };
AR.ANIM.enabled = false; run(); const base = ch.bones.spine.rotation.x, baseT = ch.anim.t;
AR.ANIM.enabled = true; const clip = AR.newClip('idle'); clip.tracks.spine = [{ t: 0, x: 0.3, y: 0, z: 0 }]; AR.ANIM.clips.idle = clip; run(1);
ok(AR.keyOf(ch.anim) === 'idle', 'anim: state detected as idle');
const spineAdd = ch.bones.spine.rotation.x; AR.ANIM.enabled = false; run(1); const spineOff = ch.bones.spine.rotation.x;
ok(near(spineAdd - spineOff, 0.3, 0.02), `anim: additive key lands (+${(spineAdd - spineOff).toFixed(3)} rad)`);
AR.ANIM.enabled = true; clip.mode = 'replace'; clip.tracks.armL = [{ t: 0, x: 1.0, y: 0.2, z: -0.4 }, { t: 1, x: -0.5, y: 0, z: 0 }]; run(1);
ok(near(ch.bones.spine.rotation.x, 0.3, 1e-6), 'anim: replace mode sets the keyed rotation exactly at weight 1');
const s = AR.sample(clip.tracks.armL, 0.5, 2, true, { x: 0, y: 0, z: 0 }); ok(near(s.x, 0.25, 1e-6), 'anim: sampling interpolates between keys');
const s2 = AR.sample(clip.tracks.armL, 1.5, 2, true, { x: 0, y: 0, z: 0 }); ok(near(s2.x, 0.25, 1e-6), 'anim: looping clip wraps last → first key');
clip.speed = 2; const t0a = ch.anim.t; run(60); ok(near(ch.anim.t - t0a, 2, 0.05), `anim: clip speed ×2 runs the clock twice as fast (${(ch.anim.t - t0a).toFixed(2)} s in 1 s)`);
clip.speed = 1; clip.scale = { head: [1.4, 1.4, 1.4] }; run(1); ok(near(ch.bones.head.scale.x, 1.4), 'anim: bone scale applied');
delete AR.ANIM.clips.idle; run(1); ok(near(ch.bones.head.scale.x, 1), 'anim: bone scale resets when the clip is gone');
void base; void baseT;
AR.ANIM.clips.walk = AR.newClip('walk'); AR.ANIM.clips.walk.tracks.head = [{ t: 0.5, x: 0.1, y: 0, z: 0 }]; await AR.saveAnims(); const saved = JSON.stringify(AR.ANIM.clips); AR.ANIM.clips = {};
await AR.loadSavedAnims(); ok(JSON.stringify(AR.ANIM.clips) === saved && boot.savedFlags().anim === true, 'anim: save → load round trip');

// ---------------------------------------------------------------- npc
const NR = await import('../src/debug/NpcRuntime.js'); NR.install();
const { makeAppearance } = await import('../src/actors/Appearance.js');
const spec = { ...makeAppearance(4242), ageYears: 34, _custom: 'cTest' };
const plain = new Character({ ...spec, _custom: undefined }); const cachedGeo = plain.mesh.geometry; const colN = cachedGeo.getAttribute('color').array.length;
const painted = new Float32Array(colN); for (let i = 0; i < colN; i += 3) { painted[i] = 0.9; painted[i + 1] = 0.1; painted[i + 2] = 0.2; }
const fakeAttr = { array: painted };
NR.NPCS.list = [{ id: 'cTest', name: 'Test', weight: 3, spec, bones: { head: [1.2, 1.1, 1.2], thighL: [1, 1.15, 1] }, vpaint: NR.b64FromColors(fakeAttr), fabric: null }];
const cc = new Character(spec);
ok(near(cc.bones.head.scale.x, 1.2) && near(cc.bones.thighL.scale.y, 1.15), 'npc: per-bone proportions applied on build');
const ca = cc.mesh.geometry.getAttribute('color').array; ok(near(ca[0], 0.9, 0.003) && near(ca[colN - 1], 0.2, 0.003), 'npc: vertex paint applied');
ok(cc.mesh.geometry !== cachedGeo, 'npc: painted NPC has its own geometry');
const again = new Character({ ...spec, _custom: undefined }); ok(!near(again.mesh.geometry.getAttribute('color').array[0], 0.9, 0.003) || again.mesh.geometry.getAttribute('color').array[1] > 0.2, 'npc: shared geometry of ordinary NPCs untouched');
const game = { crowd: { specs: [makeAppearance(1), makeAppearance(2)] } }; NR.addToCrowd(game); ok(game.crowd.specs.filter((x) => x._custom === 'cTest').length === 3 && game.crowd.specs.length === 5, 'npc: custom NPC joins the spawn pool with its weight');
NR.addToCrowd(game); ok(game.crowd.specs.length === 5, 'npc: re-adding replaces (no duplicates)');
await NR.saveNpcs(game); NR.NPCS.list = []; await NR.loadSavedNpcs(game); ok(NR.NPCS.list.length === 1 && boot.savedFlags().npc === true, 'npc: save → load round trip');
const src = readFileSync(new URL('../src/debug/NpcEditor.js', import.meta.url), 'utf8'); ok(/ageYears = Math\.max\(18/.test(src) && /ageYears: \{ min: 18/.test(src), 'npc: editor clamps age to 18+');

console.log(`editor-test: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
