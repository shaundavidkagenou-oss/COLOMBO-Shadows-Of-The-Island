// Model tools test (Node, 68th): the pieces of models-weapons / model-player / model-vehicles / model-npc and the
// developer lock that run without a browser —
//   DevLock.feed (the secret code), Retarget.autoMap (Mixamo / CMU BVH / Blender names), ModelEdit part keys + edits,
//   ModelRuntime: weapon / vehicle part edits through the build hooks, weapon stats + vehicle handling (and their reset),
//   NPC rules (match / chance / look), AnimRuntime per-character clip targets, the model-pack Vite plugin (dev routes,
//   referenced files), and that the production build leaves the model tools out.
import './node-dom-stub.mjs';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const THREE = await import('three');
let fails = 0; const ok = (c, msg) => { if (!c) fails++; console.log(`${c ? 'ok' : 'not ok'} - ${msg}`); };

// ---------------------------------------------------------------- DevLock
{ const { DevLock, codeHash } = await import('../src/debug/DevLock.js');
  DevLock.locked = true; const type = (s) => { let r = false; for (const k of s) r = DevLock.feed(k) || r; return r; };
  ok(!type('SHAUNDEVACTIVATION123$123') && DevLock.locked, 'devlock: one character short of the code stays locked');
  ok(type('$') && !DevLock.locked, 'devlock: the full code unlocks');
  DevLock.locked = true; ok(type('xxshaundevactivation123$123$') && !DevLock.locked, 'devlock: lower case and leading noise still unlock');
  DevLock.locked = true; ok(!type('DoneShaun$123$') && DevLock.locked, 'devlock: the lock command typed in the game does not unlock');
  ok(!type('Shift') && !type('Enter'), 'devlock: named keys are ignored');
  ok(typeof codeHash('a') === 'number' && codeHash('SHAUNDEVACTIVATION123$123$') !== codeHash('SHAUNDEVACTIVATION123$123%'), 'devlock: hash separates near codes');
  const src = fs.readFileSync(new URL('../src/debug/DevLock.js', import.meta.url), 'utf8').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
  ok(!src.includes('SHAUNDEVACTIVATION'), 'devlock: the code is only in comments (a built game holds just its hash)'); }

// ---------------------------------------------------------------- Retarget.autoMap
{ const { autoMap, MAP_BONES } = await import('../src/debug/Retarget.js');
  const mixamo = ['mixamorig:Hips', 'mixamorig:Spine', 'mixamorig:Spine1', 'mixamorig:Spine2', 'mixamorig:Neck', 'mixamorig:Head', ...['Left', 'Right'].flatMap((s) => ['Shoulder', 'Arm', 'ForeArm', 'Hand', 'UpLeg', 'Leg', 'Foot', 'ToeBase'].map((b) => `mixamorig:${s}${b}`))];
  const m = autoMap(mixamo); ok(MAP_BONES.every((g) => m[g]), `retarget: Mixamo maps all ${MAP_BONES.length} bones`);
  ok(m.spine === 'mixamorig:Spine' && m.chest === 'mixamorig:Spine2' && m.armL === 'mixamorig:LeftArm' && m.foreR === 'mixamorig:RightForeArm' && m.thighL === 'mixamorig:LeftUpLeg' && m.shinR === 'mixamorig:RightLeg', 'retarget: Mixamo spine chain / arms / legs land on the right bones');
  const cmu = ['Hips', 'LowerBack', 'Spine', 'Spine1', 'Neck', 'Neck1', 'Head', 'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand', 'LHipJoint', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'RHipJoint', 'RightUpLeg', 'RightLeg', 'RightFoot'];
  const c = autoMap(cmu); const nc = MAP_BONES.filter((g) => c[g]).length; ok(nc >= 17 && c.thighL === 'LeftUpLeg' && c.foreL === 'LeftForeArm', `retarget: CMU BVH maps ${nc}/${MAP_BONES.length}`);
  const rig = ['pelvis', 'spine_01', 'spine_03', 'neck_01', 'head', 'clavicle_l', 'upperarm_l', 'lowerarm_l', 'hand_l', 'clavicle_r', 'upperarm_r', 'lowerarm_r', 'hand_r', 'thigh_l', 'calf_l', 'foot_l', 'thigh_r', 'calf_r', 'foot_r'];
  const u = autoMap(rig); const nu = MAP_BONES.filter((g) => u[g]).length; ok(nu >= 17 && u.armR === 'upperarm_r' && u.shinL === 'calf_l', `retarget: Unreal-style names map ${nu}/${MAP_BONES.length}`);
  ok(new Set(Object.values(u)).size === Object.values(u).length, 'retarget: no model bone used twice'); }

// ---------------------------------------------------------------- ModelEdit
const ME = await import('../src/debug/ModelEdit.js');
{ const root = new THREE.Group(); const a = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ name: 'paint', color: 0xff0000 })); a.name = 'body'; const b = new THREE.Mesh(new THREE.BoxGeometry(), [new THREE.MeshStandardMaterial({ name: 'glass' }), new THREE.MeshStandardMaterial({ name: 'paint' })]); b.name = 'door';
  const sub = new THREE.Group(); sub.add(b); root.add(a, sub);
  const parts = ME.listParts(root); ok(parts.length === 3, 'model edit: one part per mesh material slot (' + parts.length + ')');
  const kb = parts.find((p) => p.mesh === b && p.slot === 1).key; ok(/@1$/.test(kb) && ME.pathOf(b, root) === kb.split('@')[0], 'model edit: multi-material key = path@slot');
  const root2 = root.clone(); ok(ME.listParts(root2).map((p) => p.key).join() === parts.map((p) => p.key).join(), 'model edit: keys are the same on a rebuilt copy');
  const E = { ['m:paint']: { color: '#00ff00' }, ['p:' + kb]: { color: '#0000ff' }, ['n:door']: { roughness: 0.2 } };
  ok(ME.editFor(E, kb, b, b.material[1]).color === '#0000ff', 'model edit: exact part beats material and name');
  ok(ME.editFor(E, parts.find((p) => p.mesh === a).key, a, a.material).color === '#00ff00', 'model edit: material name applies to other meshes');
  ok(ME.editFor(E, parts.find((p) => p.mesh === b && p.slot === 0).key, b, b.material[0]).roughness === 0.2, 'model edit: mesh name applies to its other slots');
  const n = await ME.applyParts(root, Object.assign({}, E, { ['p:' + ME.pathOf(a, root)]: { hide: true } }));
  ok(n === 3 && a.material.visible === false && b.material[1].color.getHexString() === '0000ff' && b.material[0].roughness === 0.2, 'model edit: applyParts hides / recolours the right slots');
  ok(a.userData.__origMat && a.userData.__origMat.color.getHexString() === 'ff0000', 'model edit: original material kept aside (never modified)');
  ME.resetParts(root); ok(a.material.color.getHexString() === 'ff0000' && b.material[1].name === 'paint' && !a.userData.__origMat, 'model edit: resetParts restores the originals'); }

// ---------------------------------------------------------------- ModelRuntime through the game's own builders
const MR = await import('../src/debug/ModelRuntime.js'); const { HOOKS } = await import('../src/core/Hooks.js');
const { WEAPONS } = await import('../src/combat/WeaponDefs.js'); const { buildWeaponModel } = await import('../src/combat/WeaponModels.js');
const { VTYPES, createVehicleMesh } = await import('../src/vehicles/VehicleModels.js');
const empty = (await import('../src/debug/ModelPack.js')).empty;
const settle = () => new Promise((r) => setTimeout(r, 20));
{ const pack = empty(); const def = WEAPONS.find((d) => d.id === 'type56'); const g0 = buildWeaponModel(def); const p0 = ME.listParts(g0); const target = p0[0];
  pack.weapons.type56 = { parts: { ['p:' + target.key]: { color: '#12ab34' } }, stats: { mag: 45 }, shell: { color: '#a0a0a0', scale: 1.5 } };
  const mag0 = def.mag; await MR.setPack(pack); ok(typeof HOOKS.weapon === 'function', 'runtime: weapon build hook installed');
  ok(def.mag === 45, 'runtime: weapon stats applied to the shared def (' + mag0 + ' → ' + def.mag + ')');
  const g = buildWeaponModel(def); await settle(); const t = ME.listParts(g).find((p) => p.key === target.key);
  ok(t && t.mesh.material !== target.mat && (Array.isArray(t.mesh.material) ? t.mesh.material[t.slot] : t.mesh.material).color.getHexString() === '12ab34', 'runtime: a weapon part recoloured on a fresh build');
  ok(g.userData.shellProto && g.userData.shellProto.isObject3D, 'runtime: custom spent-case prototype attached');
  await MR.setPack(empty()); ok(def.mag === mag0, 'runtime: removing the edit restores the weapon stats');
  const v0 = Object.keys(VTYPES).find((k) => k === 'car') || Object.keys(VTYPES)[0]; const T = VTYPES[v0]; const sp0 = T.maxSpeed;
  const pk2 = empty(); pk2.vehicles[v0] = { handling: { maxSpeed: 99, colors: ['#112233'] }, parts: { 'm:__nothing__': { color: '#ffffff' } } }; await MR.setPack(pk2);
  ok(T.maxSpeed === 99 && T.colors.length === 1, 'runtime: vehicle handling + paint colours applied');
  const vm = createVehicleMesh(v0, 3); ok(vm && vm.userData.__vEntry === pk2.vehicles[v0], 'runtime: vehicle build hook sees its entry');
  await MR.setPack(empty()); ok(T.maxSpeed === sp0 && T.colors.length > 1, 'runtime: vehicle handling restored'); }

// NPC rules
{ const pack = empty(); pack.npcs.rules = [{ id: 'r1', on: true, match: { who: 'police' }, look: { top: '#ff00ff' } }, { id: 'r2', on: true, match: { who: 'f' }, chance: 0.5, look: { heightK: 1.1 } }, { id: 'r3', on: false, match: { who: 'all' }, look: { top: '#000000' } }];
  await MR.setPack(pack); const cop = { seed: 1, police: true, sex: 'm', top: '#776655' }; const s = MR.specFor(cop);
  ok(s.top === '#ff00ff' && cop.top === '#776655', 'npc rules: police look applied to a copy (the spec is not changed)');
  ok(!MR.ruleMatches(pack.npcs.rules[2], cop), 'npc rules: a switched-off rule never matches');
  let hit = 0; for (let i = 0; i < 400; i++) if (MR.ruleMatches(pack.npcs.rules[1], { seed: i, sex: 'f' })) hit++; ok(hit > 140 && hit < 260, `npc rules: chance 0.5 → ${hit}/400 women`);
  ok(MR.ruleMatches(pack.npcs.rules[1], { seed: 7, sex: 'f' }) === MR.ruleMatches(pack.npcs.rules[1], { seed: 7, sex: 'f' }), 'npc rules: the same NPC always gets the same answer');
  ok(!MR.ruleMatches(pack.npcs.rules[0], { seed: 1, hero: true, police: true }), 'npc rules: heroes are never matched by NPC rules');
  await MR.setPack(empty()); }

// ---------------------------------------------------------------- AnimRuntime targets
{ const AR = await import('../src/debug/AnimRuntime.js'); const { Character, HEROES } = await import('../src/actors/Character.js');
  const hero = new Character(HEROES.david); const ids = AR.targetsOf(hero); ok(ids[0] === 'hero:david' && ids.includes('heroes'), 'anim targets: a hero → hero:david, heroes (' + ids.join(' ') + ')');
  AR.ANIM.targets = { 'hero:david': { idle: { quat: true, n: 2, fps: 30, length: 1 / 30, q: {}, hip: [] } }, heroes: { walk: { quat: true, n: 2, fps: 30, length: 1 / 30, q: {}, hip: [] } } };
  ok(AR.clipFor(hero, 'idle') === AR.ANIM.targets['hero:david'].idle && AR.clipFor(hero, 'walk') === AR.ANIM.targets.heroes.walk, 'anim targets: own clip first, then the group');
  AR.ANIM.targets['hero:david'].idle.off = true; ok(AR.clipFor(hero, 'idle') !== AR.ANIM.targets['hero:david'].idle, 'anim targets: a clip switched off falls back to the game animation');
  AR.ANIM.targets = {}; }

// ---------------------------------------------------------------- model-pack plugin (dev routes on a temporary project)
{ const { default: modelPack, referencedFiles, buildManifest } = await import('./vite/modelPack.mjs'); const { createServer } = await import('vite');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mp-')); fs.writeFileSync(path.join(tmp, 'index.html'), '<!doctype html>');
  const srv = await createServer({ root: tmp, configFile: false, logLevel: 'silent', plugins: [modelPack()], server: { port: 0, host: '127.0.0.1' } }); await srv.listen(); const port = srv.httpServer.address().port; const U = (p) => `http://127.0.0.1:${port}${p}`;
  try {
    const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8cfc0f01f0005000201a5f2f58a0000000049454e44ae426082', 'hex');
    const name = (await import('node:crypto')).createHash('sha256').update(png).digest('hex') + '.png';
    let r = await fetch(U('/__colombo/models/file/' + name), { method: 'POST', body: png }); ok(r.ok && fs.existsSync(path.join(tmp, 'model-pack', name)), 'plugin: upload stored as model-pack/<sha256>.png');
    r = await fetch(U('/__colombo/models/file/' + 'a'.repeat(64) + '.png'), { method: 'POST', body: png }); ok(!r.ok, 'plugin: a file whose name is not its hash is refused (' + r.status + ')');
    r = await fetch(U('/__colombo/models/file/../../evil.png'), { method: 'POST', body: png }); ok(!r.ok && !fs.existsSync(path.join(tmp, '..', 'evil.png')), 'plugin: path traversal refused');
    const m = { format: 'colombo.model-manifest', version: 1, files: { [name]: { name: 'x.png', kind: 'image' } }, weapons: { type56: { parts: { 'm:wood': { map: name } } } }, heroes: {}, vehicles: {}, npcs: { rules: [] }, anims: {}, textures: {}, objects: {}, map: null };
    r = await fetch(U('/__colombo/models/manifest'), { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(m) }); ok(r.ok, 'plugin: manifest saved');
    r = await fetch(U('/__colombo/models')); const j = await r.json(); ok(j.manifest && j.manifest.weapons.type56 && j.files.includes(name), 'plugin: manifest + files read back');
    r = await fetch(U('/model-pack/' + name)); ok(r.ok && Buffer.from(await r.arrayBuffer()).equals(png), 'plugin: dev server serves the pack file');
    ok(referencedFiles(buildManifest(m)).has(name), 'plugin: referenced files are found for the build');
    r = await fetch(U('/__colombo/devlock'), { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"locked":true}' }); ok(r.ok && JSON.parse(fs.readFileSync(path.join(tmp, 'dev-lock.json'), 'utf8')).locked === true, 'plugin: DoneShaun writes dev-lock.json');
    r = await fetch(U('/__colombo/devlock'), { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"locked":false}' }); ok(r.ok && !(await (await fetch(U('/__colombo/devlock'))).json()).locked, 'plugin: the secret code clears it');
    m.weapons = {}; await fetch(U('/__colombo/models/manifest'), { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(m) });
    ok(fs.existsSync(path.join(tmp, 'model-pack', 'backups')) && fs.readdirSync(path.join(tmp, 'model-pack', 'backups')).length >= 1, 'plugin: the previous manifest is backed up on save');
  } finally { await srv.close(); fs.rmSync(tmp, { recursive: true, force: true }); } }

// ---------------------------------------------------------------- production build leaves the tools out (needs dist/)
{ const D = new URL('../dist/assets/', import.meta.url); if (fs.existsSync(D)) { const all = fs.readdirSync(D).filter((f) => f.endsWith('.js')).map((f) => fs.readFileSync(new URL(f, D), 'utf8')).join('\n');
    ok(!all.includes('Pose fixes (degrees') && !all.includes('In hand — third person') && !all.includes('Choose a texture'), 'build: ModelStudio is not in the production bundle');
    ok(!all.includes('Create new…') || !all.includes('2×2 tiled'), 'build: TextureMaker is not in the production bundle');
    ok(!all.includes('SHAUNDEVACTIVATION'), 'build: the secret code is not readable in the bundle'); }
  else console.log('# dist/ missing: build checks skipped'); }

console.log(fails ? `# ${fails} failed` : '# all passed'); process.exit(fails ? 1 : 0);
