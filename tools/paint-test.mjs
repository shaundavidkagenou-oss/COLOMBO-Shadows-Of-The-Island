// Environment editor (console `paint`) — headless checks of the project format and COMPILE (no browser):
// sample assets (tools/paint-samples.mjs) → a project in a temp paint-pack → compile → validation of references,
// damaged / missing files, instance packing round trip, hidden layers, version handling, and the build-exe.bat prep step.
//   node tools/paint-test.mjs
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import crypto from 'node:crypto'; import { execFileSync } from 'node:child_process';
import * as F from '../src/debug/PaintFormat.js';
import { compileDir, writeCompiled } from './vite/paintPack.mjs';

let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL ' + m); } };
const T = fs.mkdtempSync(path.join(os.tmpdir(), 'paint-test-')); const S = path.join(T, 'samples'); const D = path.join(T, 'paint-pack'); fs.mkdirSync(path.join(D, 'assets'), { recursive: true });
execFileSync(process.execPath, [path.resolve('tools/paint-samples.mjs'), S], { stdio: 'ignore' });
const add = (p) => { const b = fs.readFileSync(path.join(S, p)); const n = crypto.createHash('sha256').update(b).digest('hex') + '.' + F.extOf(p); fs.writeFileSync(path.join(D, 'assets', n), b); return n; };
const g = add('grass/grass_clump.gltf'), bin = add('grass/grass_clump.bin'), alb = add('grass/textures/grass_albedo.png'), nrm = add('grass/grass_normal.png'), ao = add('grass/grass_ao.png'), rgh = add('grass/grass_roughness.png'), rock = add('rock.glb'), moss = add('moss_rock.glb');
const p = F.emptyProject();
p.assets.grass = { id: 'grass', name: 'Grass', layer: 'grass', file: { main: g, files: { 'grass_clump.gltf': g, 'grass_clump.bin': bin } }, materials: [{ name: 'Blades', alphaMode: 'mask', side: 'double', maps: { base: { src: 'model' }, normal: { file: nrm }, ao: { file: ao }, rough: { file: rgh } }, mapNames: { normal: 'grass_normal.png' } }] };
p.assets.rock = { id: 'rock', name: 'Rock', layer: 'rocks', file: { main: rock, files: {} }, materials: [{ name: 'Stone' }] };
p.assets.moss = { id: 'moss', name: 'Moss rock', layer: 'rocks', file: { main: moss, files: {} }, materials: [{ name: 'Stone' }, { name: 'Moss' }] };
const list = []; for (let i = 0; i < 5000; i++) list.push({ u: i + 1, a: i % 50 === 0 ? 'rock' : i % 77 === 0 ? 'moss' : 'grass', l: i % 50 === 0 || i % 77 === 0 ? 'rocks' : 'grass', p: [i * 0.1, 0.15, -i * 0.2], r: [0.01, i * 0.1, -0.02], s: [1, 1.2, 1], c: (i % 7) / 7 - 0.5, t: i % 3 ? null : '#88cc44', k: 1 });
p.instances = F.packInstances(list); const save = () => fs.writeFileSync(path.join(D, 'project.json'), JSON.stringify(p));

// 1. the grass glTF references textures/grass_albedo.png, which is not mapped yet → an error naming it
save(); let r = compileDir(D); ok(!r.report.ok && r.report.errors.some((e) => /grass_albedo/.test(e)), 'missing glTF texture is reported: ' + JSON.stringify(r.report.errors));
// 2. mapped → compiles; every instance and file present
p.assets.grass.file.files['grass_albedo.png'] = alb; save(); r = compileDir(D);
ok(r.report.ok, 'compiles: ' + JSON.stringify(r.report.errors)); ok(r.report.counts.instances === 5000 && r.report.counts.assets === 3, 'counts ' + JSON.stringify(r.report.counts));
ok(r.scene.format === F.SCENE_FORMAT && r.scene.files.length === 8, 'scene files ' + (r.scene.files || []).length);
const u = F.unpackInstances(r.scene.instances); const byU = new Map(u.list.map((o) => [o.u, o]));
ok(u.bad === 0 && u.list.length === 5000, 'round trip ' + u.list.length + ' / bad ' + u.bad); const o7 = byU.get(7), s7 = list[6];
ok(o7 && Math.abs(o7.p[0] - s7.p[0]) < 1e-5 && Math.abs(o7.r[1] - s7.r[1]) < 1e-5 && o7.t === s7.t && byU.get(2).t === null && byU.get(1).t === '#88cc44' && Math.abs(o7.c - s7.c) < 1e-6, 'instance fields survive packing');
// 3. materials: data maps stay data maps, settings and original names survive normalisation
const m = r.scene.assets.grass.materials[0]; ok(m.maps.normal.file === nrm && m.maps.ao.file === ao && m.maps.rough.file === rgh && m.maps.base.src === 'model', 'map refs'); ok(m.alphaMode === 'mask' && m.side === 'double' && m.mapNames.normal === 'grass_normal.png', 'material settings');
ok(F.COLOR_SLOTS.has('base') && F.COLOR_SLOTS.has('emissive') && !F.COLOR_SLOTS.has('normal') && !F.COLOR_SLOTS.has('ao') && !F.COLOR_SLOTS.has('rough') && !F.COLOR_SLOTS.has('metal'), 'only base / emissive are colour (sRGB) maps');
// 4. hidden layers are not compiled
p.layers = F.cleanLayers(p.layers).map((l) => (l.id === 'rocks' ? { ...l, visible: false } : l)); save(); r = compileDir(D);
ok(r.report.ok && r.report.counts.instances === list.filter((q) => q.l === 'grass').length && !r.scene.layers.some((l) => l.id === 'rocks'), 'hidden layer skipped (' + r.report.counts.instances + ')');
p.layers = F.cleanLayers(p.layers).map((l) => ({ ...l, visible: true })); save();
// 5. a damaged file (content no longer matches its sha256 name) and a deleted one are errors
fs.writeFileSync(path.join(D, 'assets', rgh), 'garbage'); r = compileDir(D); ok(!r.report.ok && r.report.errors.some((e) => e.includes(rgh.slice(0, 12)) || /damaged|match/i.test(e)), 'damaged texture reported: ' + JSON.stringify(r.report.errors));
fs.rmSync(path.join(D, 'assets', rgh)); r = compileDir(D); ok(!r.report.ok && r.report.errors.some((e) => /missing|not found/i.test(e)), 'missing texture reported: ' + JSON.stringify(r.report.errors));
p.assets.grass.materials[0].maps.rough = null; save(); r = compileDir(D); ok(r.report.ok, 'ok again after removing the map');
// 6. invalid data never throws; unknown references are dropped with notes
const bad = { format: F.PROJECT_FORMAT, version: 1, assets: { 'bad id!': {}, x: { id: 'x', file: { main: 'nope.glb' } } }, layers: 'nope', instances: [{ a: 'ghost', l: 'grass', n: 3, f: 'AAAA', u: 'AAAA' }, null, 7] };
let n; try { n = F.normalizeProject(bad); ok(true, ''); } catch (e) { ok(false, 'normalizeProject threw ' + e); }
ok(n && n.notes.length > 0 && n.project.layers.length === F.DEFAULT_LAYERS.length && Object.keys(n.project.assets).length <= 1, 'garbage project repaired: ' + JSON.stringify(n && n.notes));
ok(F.normalizeProject({ ...p, version: 99 }).notes.some((t) => /newer/.test(t)), 'newer version noted');
ok(F.normalizeProject(null).project.format === F.PROJECT_FORMAT, 'null → empty project');
// 7. writeCompiled + the build-exe.bat step (tools/paint-pack-prep.mjs) on this folder: exit 0 when ok, 1 on errors
writeCompiled(D, compileDir(D)); ok(fs.existsSync(path.join(D, 'compiled', 'scene.json')) && fs.existsSync(path.join(D, 'compiled', 'report.json')), 'compiled/ written');
const prep = (dir) => { try { execFileSync(process.execPath, [path.resolve('tools/paint-pack-prep.mjs'), dir], { stdio: 'pipe' }); return 0; } catch (e) { return e.status; } };
ok(prep(D) === 0, 'prep exit 0 on a valid project'); fs.rmSync(path.join(D, 'assets', rock)); ok(prep(D) === 1, 'prep exit 1 when a model is missing');
const E = path.join(T, 'empty'); fs.mkdirSync(E); ok(prep(E) === 0, 'prep exit 0 without a project');
fs.rmSync(T, { recursive: true, force: true });
console.log((fail ? 'FAILED ' : 'ok ') + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
