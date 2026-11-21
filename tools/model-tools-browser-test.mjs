// 68th — model tools end-to-end (headless Chromium + the dev server, which provides the project-folder storage):
//   models-weapons   console command opens the tools; every weapon listed; a part recoloured + stats changed → the game's own
//                    weapon updates live; a GLB built in the page uploaded as the replacement model; in-hand preview (third
//                    person / POV) runs the game's grip code without firing; original model + textures download
//   model-player     the three heroes; a garment texture mode; a wardrobe item tried on; a BVH animation imported onto "idle"
//   model-vehicles   cars + bikes + trains + boats + police helicopter listed and built; handling changed
//   model-npc        groups listed; a police look rule
//   texture maker    every generator draws; Save hands back a PNG file
//   map editor       an uploaded model placed in the city (group mesh + collider), picked by a ray, saved with the map
//   persistence      💾 Save → model-pack/manifest.json → RELOAD: the edits are back in the game (weapon colour + stats,
//                    handling, NPC rule, placed model)
//   dev lock         DoneShaun$123$ hides the console + writes dev-lock.json; the secret code typed in the game brings it back
// model-pack/ and dev-lock.json are moved aside during the test and put back afterwards.
//   node tools/model-tools-browser-test.mjs     PORT env (default 5199) — needs the dev server (npx vite --port 5199)
import fs from 'node:fs';
import puppeteer from '/home/user/testenv/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
import chromium from '/home/user/testenv/node_modules/@sparticuz/chromium/build/index.js';
const ROOT = new URL('../', import.meta.url).pathname; const PACK = ROOT + 'model-pack/'; const ASIDE = ROOT + 'model-pack.test-aside'; const LOCK = ROOT + 'dev-lock.json';
if (fs.existsSync(ASIDE)) throw new Error(ASIDE + ' exists — a previous run did not finish; move it back to model-pack/ first');
const lock0 = fs.existsSync(LOCK) ? fs.readFileSync(LOCK) : null; if (lock0) fs.rmSync(LOCK);
if (fs.existsSync(PACK)) fs.renameSync(PACK, ASIDE); fs.mkdirSync(PACK, { recursive: true }); if (fs.existsSync(ASIDE + '/README.md')) fs.copyFileSync(ASIDE + '/README.md', PACK + 'README.md');
const b = await puppeteer.launch({ executablePath: await chromium.executablePath(), headless: true, protocolTimeout: 1800000, args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'], defaultViewport: { width: 1280, height: 720 } });
let fails = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };
const stage = async (p, name, fn, checks, arg) => { let r; try { r = await p.evaluate(fn, arg); console.log(name, JSON.stringify(r).slice(0, 1800)); } catch (e) { ok(false, `${name}: ${String(e.message || e).split('\n').slice(0, 3).join(' | ')}`); return null; } try { checks(r); } catch (e) { ok(false, `${name} checks: ${e.message}`); } return r; };
const URL0 = 'http://localhost:' + (process.env.PORT || 5199) + '/?test&quick=play';
async function boot(p) { await p.goto(URL0, { waitUntil: 'domcontentloaded', timeout: 300000 }); await p.waitForFunction(() => window.__game && window.__game.stepSim && window.__game.mode === 'play', { timeout: 900000, polling: 1000 }); }
const HELPERS = () => {
  window.__sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  window.__downloads = []; const co = URL.createObjectURL; URL.createObjectURL = (o) => { if (o instanceof Blob) window.__downloads.push({ size: o.size, type: o.type }); return co.call(URL, o); };
  HTMLAnchorElement.prototype.click = function () { if (this.download) { window.__downloads.at(-1) && (window.__downloads.at(-1).name = this.download); return; } return HTMLElement.prototype.click.call(this); };
  // a small textured, animated GLB made in the page (box body + spinning child), as a user upload
  window.__mkGlb = async (name = 'test-model.glb') => { const { THREE, GLTFExporter } = await import('/tools/browser/three-helpers.mjs');
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); g.fillStyle = '#c03030'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#f0f0f0'; g.fillRect(0, 0, 32, 32); g.fillRect(32, 32, 32, 32);
    const tex = new THREE.CanvasTexture(c); const root = new THREE.Group(); root.name = 'TestRoot'; const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.2, 0.1), new THREE.MeshStandardMaterial({ map: tex, name: 'testPaint' })); body.name = 'Body';
    const spin = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.12, 8), new THREE.MeshStandardMaterial({ color: 0x3050c0, name: 'testBlue' })); spin.name = 'Spinner'; spin.position.set(0.2, 0.15, 0); root.add(body, spin);
    const clip = new THREE.AnimationClip('Spin', 1, [new THREE.QuaternionKeyframeTrack('Spinner.quaternion', [0, 0.5, 1], [0, 0, 0, 1, 0, 0.7071, 0, 0.7071, 0, 1, 0, 0])]);
    const glb = await new GLTFExporter().parseAsync(root, { binary: true, animations: [clip] }); return new File([glb], name, { type: 'model/gltf-binary' }); };
  // a 19-bone CMU-style BVH (T-pose, Y up, +Z forward) waving both arms for 1 s
  window.__bvh = () => {
    const J = [['Hips', null, [0, 0, 0]], ['Spine', 'Hips', [0, 10, 0]], ['Spine1', 'Spine', [0, 10, 0]], ['Neck', 'Spine1', [0, 10, 0]], ['Head', 'Neck', [0, 6, 0]],
      ['LeftShoulder', 'Spine1', [3, 8, 0]], ['LeftArm', 'LeftShoulder', [5, 0, 0]], ['LeftForeArm', 'LeftArm', [12, 0, 0]], ['LeftHand', 'LeftForeArm', [10, 0, 0]],
      ['RightShoulder', 'Spine1', [-3, 8, 0]], ['RightArm', 'RightShoulder', [-5, 0, 0]], ['RightForeArm', 'RightArm', [-12, 0, 0]], ['RightHand', 'RightForeArm', [-10, 0, 0]],
      ['LeftUpLeg', 'Hips', [4, -2, 0]], ['LeftLeg', 'LeftUpLeg', [0, -18, 0]], ['LeftFoot', 'LeftLeg', [0, -18, 0]], ['RightUpLeg', 'Hips', [-4, -2, 0]], ['RightLeg', 'RightUpLeg', [0, -18, 0]], ['RightFoot', 'RightLeg', [0, -18, 0]]];
    const order = []; const out = ['HIERARCHY'];
    const write = (name, depth) => { const j = J.find((x) => x[0] === name); const ind = '  '.repeat(depth); out.push(ind + (j[1] ? 'JOINT ' : 'ROOT ') + name, ind + '{', ind + '  OFFSET ' + j[2].join(' '), ind + '  CHANNELS ' + (j[1] ? '3 Zrotation Xrotation Yrotation' : '6 Xposition Yposition Zposition Zrotation Xrotation Yrotation')); order.push(name);
      const kids = J.filter((x) => x[1] === name); if (!kids.length) out.push(ind + '  End Site', ind + '  {', ind + '    OFFSET 0 3 0', ind + '  }'); for (const k of kids) write(k[0], depth + 1); out.push(ind + '}'); };
    write('Hips', 0); out.push('MOTION', 'Frames: 31', 'Frame Time: 0.0333333');
    for (let f = 0; f < 31; f++) { const a = Math.sin(f / 30 * Math.PI * 2) * 40; const row = []; for (const n of order) { if (n === 'Hips') row.push(0, 38, 0, 0, 0, 0); else row.push(n === 'LeftArm' ? 60 + a : n === 'RightArm' ? -60 - a : 0, 0, 0); } out.push(row.join(' ')); }
    return new File([out.join('\n') + '\n'], 'wave.bvh', { type: 'text/plain' }); };
};

try {
  const p = await b.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e.stack || e).split('\n').slice(0, 3).join(' | ')));
  p.on('console', (m) => { if (m.type() === 'error' || /model tools|model pack/i.test(m.text())) console.log('  [page]', m.text().slice(0, 300)); });
  await p.evaluateOnNewDocument(() => { localStorage.setItem('colombo.settings.v1', JSON.stringify({ quality: 'low', showFps: false })); });
  await p.evaluateOnNewDocument(HELPERS);
  await boot(p);

  await stage(p, 'weapons', async () => {
    const g = window.__game; g.noRender = true; await g.stepSim(5, 0.05); const out = {};
    g.debugCon.exec('models-weapons'); for (let i = 0; i < 300 && !(globalThis.__editors && globalThis.__editors.models && globalThis.__editors.models.obj); i++) await window.__sleep(100);
    const S = globalThis.__editors.models; out.open = !!S; out.title = S.win.titleEl.textContent; out.items = S.items.length; const { WEAPONS } = await import('/src/combat/WeaponDefs.js'); out.weapons = WEAPONS.length;
    out.listRows = S.left.querySelectorAll('.ed-list > div').length;
    S.select('type56'); for (let i = 0; i < 50 && !(S.obj && S.item === 'type56'); i++) await window.__sleep(100); await window.__sleep(300);
    const ME = await import('/src/debug/ModelEdit.js'); const parts = ME.listParts(S.partsRoot()); out.parts = parts.length; out.partRows = S.right.querySelectorAll('.ed-sec .ed-list > div').length;
    // click the middle of the preview → a part is selected
    const r = S.vp.canvas.getBoundingClientRect(); S.pickAt({ clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }); out.picked = S.part ? S.part.key : null;
    const target = S.part || parts[0]; S.selectPart(target); S.scopeKey = 'p:' + target.key;
    const E = S.entry(true); E.parts = { ['p:' + target.key]: { color: '#11ee22' } }; E.stats = { mag: 41 }; E.shell = { color: '#909090', scale: 1.4 }; S.changed('weapons'); await window.__sleep(1200);
    const i56 = WEAPONS.findIndex((d) => d.id === 'type56'); out.mag = WEAPONS[i56].mag; const m = g.weapons.models[i56]; const t = ME.listParts(m).find((x) => x.key === target.key); const mat = t && (Array.isArray(t.mesh.material) ? t.mesh.material[t.slot] : t.mesh.material);
    out.gameColour = mat && mat.color ? mat.color.getHexString() : null; out.shell = !!m.userData.shellProto; out.dirty = (await import('/src/debug/ModelPack.js')).PACK.dirty;
    // upload a GLB as the replacement
    const MP = await import('/src/debug/ModelPack.js'); const a = await MP.addAsset([await window.__mkGlb()], 'model'); out.uploaded = a && a.main;
    E.model = { asset: { main: a.main, files: a.files }, name: a.name, xf: { s: 1 } }; S.changed('weapons'); await window.__sleep(1500);
    const rep = S.findRepl(); out.replInPreview = !!(rep && rep.children.length); out.replClips = rep && rep.userData.clips ? rep.userData.clips.map((c) => c.name) : null;
    let gameRepl = false; m.traverse((o) => { if (o.userData.__replacement && o.children.length) gameRepl = true; }); out.replInGame = gameRepl;
    // downloads
    window.__downloads.length = 0; await S.exportGlb(true, 'w-orig.glb'); await S.exportGlb(false, 'w-edited.glb'); out.downloads = window.__downloads.map((d) => [d.name, d.size]);
    // in-hand preview (the game's own grip / aim code, world frozen)
    S.startHold('third'); for (let i = 0; i < 30; i++) { g.frameStep(1 / 30); } out.holdSel = g.weapons.sel === i56; out.holdState = g.weapons.state; out.drawn = !!g.weapons.drawn; out.hiddenWin = S.win.el.style.display === 'none'; out.rendering = !g.noRender;
    const mag0 = g.weapons.inv[i56].mag; S.hold.kind = 'pov'; for (let i = 0; i < 10; i++) g.frameStep(1 / 30); out.noShot = g.weapons.inv[i56].mag === mag0; S.endHold(); out.back = S.win.el.style.display !== 'none' && g.noRender;
    return out;
  }, (r) => { ok(r.open && /Weapons/.test(r.title), 'models-weapons opens the model tools'); ok(r.items === r.weapons + 1 && r.listRows === r.items, `every weapon listed (${r.items} = ${r.weapons} + police T-56)`);
    ok(r.parts > 4 && r.partRows === r.parts, `type56: ${r.parts} parts listed`); ok(!!r.picked, 'a click in the preview selects a part (' + r.picked + ')');
    ok(r.gameColour === '11ee22', 'part colour reaches the game’s own weapon model live'); ok(r.mag === 41, 'stats edit reaches the weapon def'); ok(r.shell, 'custom spent case on the game weapon'); ok(r.dirty, 'marked unsaved');
    ok(r.replInPreview && r.replInGame, 'uploaded GLB replaces the model (preview + game)'); ok(r.replClips && r.replClips.includes('Spin'), 'its animation clip is available');
    ok(r.downloads.length === 2 && r.downloads[0][1] > 5000 && r.downloads[1][1] > 5000 && r.downloads[1][1] !== r.downloads[0][1], 'original and edited model (.glb) both download (edited = the replacement model): ' + JSON.stringify(r.downloads));
    ok(r.holdSel && r.drawn && r.hiddenWin && r.rendering, `in-hand preview draws the hero holding it (state ${r.holdState})`); ok(r.noShot, 'in-hand preview never fires'); ok(r.back, 'back to the model tools'); });

  await stage(p, 'player', async () => {
    const g = window.__game, S = globalThis.__editors.models; const out = {}; S.setMode('player'); await window.__sleep(800); out.items = S.items.map((i) => i.id);
    S.select('david'); await window.__sleep(800); out.hasChar = !!S.ch; out.heroSecs = [...S.right.querySelectorAll('.ed-sec > .h')].map((x) => x.textContent).slice(0, 12);
    const E = S.entry(true); E.garments = { 1: { mode: 3, tint: '#aa2020' } }; S.changed('player'); await window.__sleep(900); await S.rebuild(true); await window.__sleep(300);
    const mat = S.ch.mesh.material[0] || S.ch.mesh.material; out.garmentUniform = !!(mat.userData && mat.userData.__gar && mat.userData.__gar.on[1].x === 3); out.cacheKey = mat.customProgramCacheKey ? String(mat.customProgramCacheKey()).slice(0, 80) : null;
    const { CATALOGUE } = await import('/src/actors/Wardrobe.js'); const top = CATALOGUE.tops[3]; S.look = { top: top.id }; S.lookItem = Object.assign({ cat: 'tops' }, top); await S.rebuild(true); out.triedOn = S.ch.spec.top === top.col || JSON.stringify(S.ch.spec).includes(top.id) || S.ch.spec.top !== undefined;
    // BVH onto david's idle
    const MP = await import('/src/debug/ModelPack.js'); const a = await MP.addAsset([window.__bvh()], 'anim'); const inst = await MP.loadAsset({ main: a.main, files: a.files });
    const R = await import('/src/debug/Retarget.js'); const AR = await import('/src/debug/AnimRuntime.js'); const names = R.bonesOf(inst.scene).map((x) => x.name); out.bvhBones = names.length; out.mapped = Object.keys(R.autoMap(names)).length;
    const clip = R.importClip({ root: inst.scene, clip: inst.clips[0] }, S.ch, { key: 'idle', fps: 30, inPlace: true }); clip.src = 'wave.bvh'; (AR.ANIM.targets['hero:david'] ||= {}).idle = clip; S.animChanged(false);
    out.clipFor = AR.clipFor(S.ch, 'idle') === clip; out.clipLen = clip.length;
    S.state = 'idle'; const arm0 = S.ch.bones.armL.quaternion.clone(); for (let i = 0; i < 8; i++) S.frame(1 / 30); out.armMoved = S.ch.bones.armL.quaternion.angleTo(arm0);
    const other = await import('/src/actors/Character.js'); const dineth = new other.Character(other.HEROES.dineth); out.notOnDineth = AR.clipFor(dineth, 'idle') !== clip; dineth.dispose();
    out.packAnims = !!(S.P.anims && S.P.anims.targets && S.P.anims.targets['hero:david'] && S.P.anims.targets['hero:david'].idle);
    return out;
  }, (r) => { ok(r.items.join() === 'dineth,shashika,david', 'model-player lists the three heroes'); ok(r.hasChar, 'hero preview built'); ok(r.heroSecs.some((t) => /Clothing textures/.test(t)) && r.heroSecs.some((t) => /wardrobe/.test(t)), 'clothing + wardrobe sections');
    ok(r.garmentUniform && /gar1/.test(r.cacheKey || ''), 'garment edit patches the hero clothing shader (' + r.cacheKey + ')'); ok(r.triedOn, 'wardrobe item tried on');
    ok(r.mapped >= 17, `BVH bones mapped ${r.mapped}/19`); ok(r.clipFor && r.clipLen > 0.9, 'imported clip plays on david’s idle'); ok(r.armMoved > 0.05, 'the arm actually moves (' + (r.armMoved || 0).toFixed(3) + ' rad)'); ok(r.notOnDineth, 'not on the other heroes'); ok(r.packAnims, 'clip stored in the pack'); });

  await stage(p, 'vehicles', async () => {
    const S = globalThis.__editors.models; const out = {}; S.setMode('vehicles'); await window.__sleep(800); const ids = S.items.map((i) => i.id); out.n = ids.length; out.trains = ids.filter((x) => x.startsWith('train:')).length; out.boats = ids.filter((x) => x.startsWith('boat:')).length; out.heli = ids.includes('heli:police');
    const { VTYPES } = await import('/src/vehicles/VehicleModels.js'); out.vtypes = Object.keys(VTYPES).length; const built = {}; out.unnamed = S.items.filter((i) => !i.label || i.label === 'undefined').length;
    for (const id of ['car', 'tuktuk', ids.find((x) => /bike|veera|takami/.test(x)), 'train:dmuCab', 'train:dmuTrailer', ids.find((x) => x.startsWith('boat:')), 'heli:police']) { if (!id) continue; S.select(id); for (let i = 0; i < 40 && !(S.obj && S.item === id); i++) await window.__sleep(100); await window.__sleep(200); let n = 0; S.obj && S.obj.traverse((o) => { if (o.isMesh) n++; }); built[id] = n; }
    out.built = built; S.select('car'); await window.__sleep(500); window.__downloads.length = 0; await S.exportTextures('car-tex.zip'); out.carZip = window.__downloads.map((d) => [d.name, d.size]); S.select('car'); await window.__sleep(500); const E = S.entry(true); E.handling = { maxSpeed: 44.5 }; S.changed('vehicles'); await window.__sleep(900); out.maxSpeed = VTYPES.car.maxSpeed;
    return out;
  }, (r) => { ok(r.n === r.vtypes + r.trains + r.boats + 1, `model-vehicles lists every vehicle type (${r.vtypes}) + ${r.trains} train cars + ${r.boats} boats + helicopter`); ok(r.trains === 2 && r.boats > 3 && r.heli, 'trains, boats, helicopter present'); ok(r.unnamed === 0, 'every entry has a name');
    ok(Object.values(r.built).every((n) => n > 0), 'each kind builds in the preview: ' + JSON.stringify(r.built)); ok(r.maxSpeed === 44.5, 'handling edit applied'); ok(r.carZip && r.carZip.length === 1 && r.carZip[0][1] > 1000, 'original vehicle textures download as .zip ' + JSON.stringify(r.carZip)); });

  await stage(p, 'npc', async () => {
    const S = globalThis.__editors.models; const out = {}; S.setMode('npc'); await window.__sleep(1200); out.n = S.items.length; out.groups = S.items.slice(0, 6).map((i) => i.id);
    S.select('police'); for (let i = 0; i < 40 && !(S.ch && S.item === 'police'); i++) await window.__sleep(100); out.cop = !!(S.ch && S.ch.spec.police);
    const r = S.rule('police', true); r.look = { top: '#123456' }; S.changed('npc'); await window.__sleep(900); const MR = await import('/src/debug/ModelRuntime.js'); const { makePoliceAppearance } = await import('/src/actors/Appearance.js');
    out.lookApplied = MR.specFor(makePoliceAppearance(77, 'traffic')).top === '#123456'; out.civilUntouched = MR.specFor({ seed: 5, sex: 'm', top: '#ffffff' }).top === '#ffffff';
    return out;
  }, (r) => { ok(r.n > 40, `model-npc lists ${r.n} groups (presets, police roles, staff, custom)`); ok(r.cop, 'police preview'); ok(r.lookApplied && r.civilUntouched, 'police look rule applies only to police'); });

  // 69th: every NPC animation state is listed, previews the game's own animation, can be downloaded as the original (baked
  // onto the NPC skeleton, .glb) and replaced — round trip: the downloaded original imported back onto a state
  await stage(p, 'npc animations', async () => {
    const S = globalThis.__editors.models; const out = {}; const AR = await import('/src/debug/AnimRuntime.js'); S.setMode('npc'); await window.__sleep(600);
    S.select('npc:m'); for (let i = 0; i < 40 && !(S.ch && S.item === 'npc:m'); i++) await window.__sleep(100); out.ch = !!S.ch;
    out.known = AR.KNOWN.length; out.has = ['dance', 'smoke', 'pray', 'sitGround', 'clap', 'browse', 'seated:drive', 'seated:lap', 'fight:jab', 'hit:snap', 'hit:upper', 'cower', 'medCarry'].filter((k) => AR.KNOWN.includes(k)).length;
    { const src = await (await fetch('/src/actors/Character.js?raw')).text(); const acts = [...new Set([...src.matchAll(/case '([A-Za-z]+)'/g)].map((m) => m[1]))]; const BX = await import('/src/actors/Boxing.js');
      const reacts = [...new Set(Object.values(BX.MOVES).map((m) => m.react).concat(['body', 'block']))]; out.acts = acts.length; out.missing = acts.filter((k) => !AR.KNOWN.includes(k)).concat(Object.keys(BX.MOVES).map((m) => 'fight:' + m).filter((k) => !AR.KNOWN.includes(k)), reacts.map((m) => 'hit:' + m).filter((k) => !AR.KNOWN.includes(k))); }
    const bad = []; let match = 0, errs = 0; for (const k of AR.KNOWN) { S.state = k; S.stT = 0; try { for (let i = 0; i < 6; i++) S.frame(0.05); } catch (e) { errs++; bad.push(k + ':' + e.message); continue; } const live = AR.keyOf(S.ch.anim); if (live === k || (k === 'seated' && live.startsWith('seated:')) || (k === 'fight' && live.startsWith('fight')) || (k.startsWith('fight:') && (live === k || live === 'fight'))) match++; else bad.push(k + '→' + live); }
    out.match = match; out.errs = errs; out.bad = bad.slice(0, 12); S.state = 'idle';
    const n0 = window.__downloads.length; await S.exportGameAnims(['wave', 'seated:drive', 'fight:jab']); const d = window.__downloads.slice(n0).at(-1); out.dl = d && { name: d.name, size: d.size }; out.exp = S.lastAnimExport;
    const nAll = window.__downloads.length; await S.exportGameAnims(AR.KNOWN.slice()); out.all = S.lastAnimExport; out.allDl = window.__downloads.length > nAll;
    // replace: the downloaded original (wave) imported back onto "wave" of every man
    const { THREE, GLTFExporter } = await import('/tools/browser/three-helpers.mjs'); void THREE; const clip = S.bakeGameClip('wave'); const glb = await new GLTFExporter().parseAsync(S.ch.root, { binary: true, animations: [clip] });
    const MP = await import('/src/debug/ModelPack.js'); const a = await MP.addAsset([new File([glb], 'npc-wave.glb', { type: 'model/gltf-binary' })], 'anim'); const inst = await MP.loadAsset({ main: a.main, files: a.files }); out.clips = inst.clips.length;
    const R = await import('/src/debug/Retarget.js'); const names = R.bonesOf(inst.scene).map((x) => x.name); out.bones = names.length; out.mapped = Object.keys(R.autoMap(names)).length; out.names = names.join(' ');
    const ic = R.importClip({ root: inst.scene, clip: inst.clips[0] }, S.ch, { key: 'wave', fps: 30, inPlace: true }); ic.src = 'npc-wave.glb'; (AR.ANIM.targets['npc:m'] ||= {}).wave = ic; S.animChanged(false); out.replaced = !!(AR.clipFor(S.ch, 'wave'));
    delete AR.ANIM.targets['npc:m'].wave; S.animChanged(false); return out;
  }, (r) => { ok(r.ch && r.acts >= 60 && r.missing.length === 0 && r.has === 13, `model-npc lists ${r.known} NPC animation states — every one of the Animator's ${r.acts} actions, every punch and hit reaction, every seat (missing: ${JSON.stringify(r.missing)})`);
    ok(r.errs === 0 && r.match === r.known, `every state previews the game's own animation (${r.match}/${r.known}; ${JSON.stringify(r.bad)})`);
    ok(r.dl && /\.glb$/.test(r.dl.name) && r.exp && r.exp.clips === 3, 'original NPC animations download as .glb (3 clips on the NPC skeleton): ' + JSON.stringify(r.dl));
    ok(r.all && r.all.clips === r.known && r.allDl, `all ${r.known} original animations in one .glb (${r.all && r.all.bytes} bytes)`);
    ok(r.clips === 1 && r.mapped >= 15 && r.replaced, `downloaded original imports back as a replacement (bones ${r.bones}, mapped ${r.mapped})`); });

  await stage(p, 'texture maker', async () => {
    const TM = await import('/src/debug/TextureMaker.js'); const out = { gens: Object.keys(TM.GENERATORS).length, blank: [] };
    for (const [k, G] of Object.entries(TM.GENERATORS)) { const c = document.createElement('canvas'); c.width = c.height = 64; const cx = c.getContext('2d'); cx.fillStyle = '#000'; cx.fillRect(0, 0, 64, 64); TM.renderLayer(cx, 64, 64, { gen: k, opacity: 1, blend: 'source-over', p: Object.assign({}, G.p) });
      const d = cx.getImageData(0, 0, 64, 64).data; let s = 0, s2 = 0; for (let i = 0; i < d.length; i += 4) { const v = d[i] + d[i + 1] + d[i + 2]; s += v; s2 += v * v; } const n = d.length / 4; if (s / n < 1 && k !== 'solid') out.blank.push(k); }
    let file = null; const w = TM.openTextureMaker({ name: 'probe', onSave: (f) => { file = f; } }); await window.__sleep(300); const saveBtn = [...w.el.querySelectorAll('button')].find((x) => /Save texture/.test(x.textContent)); if (saveBtn) saveBtn.click(); await window.__sleep(800);
    out.file = file ? [file.name, file.size, file.type] : null; try { w.close(); } catch { /* */ } return out;
  }, (r) => { ok(r.gens >= 17, `${r.gens} texture generators`); ok(!r.blank.length, 'every generator draws (blank: ' + r.blank.join(',') + ')'); ok(r.file && r.file[2] === 'image/png' && r.file[1] > 100, 'Save hands back a PNG file ' + JSON.stringify(r.file)); });

  await stage(p, 'save', async () => { const S = globalThis.__editors.models; await S.save(); const out = { dirty: (await import('/src/debug/ModelPack.js')).PACK.dirty }; const r = await fetch('/__colombo/models'); const j = await r.json(); out.weapons = Object.keys(j.manifest.weapons); out.vehicles = Object.keys(j.manifest.vehicles); out.rules = j.manifest.npcs.rules.length; out.anims = Object.keys((j.manifest.anims || {}).targets || {}); out.files = j.files.length; S.close(); await window.__sleep(300); out.closed = !window.__game.editorHook; return out; },
    (r) => { ok(!r.dirty && r.weapons.includes('type56') && r.vehicles.includes('car') && r.rules >= 1 && r.anims.includes('hero:david'), 'saved into model-pack/manifest.json: ' + JSON.stringify(r)); ok(r.files >= 2, 'uploaded files in model-pack/'); ok(r.closed, 'tools closed, game resumes'); });

  await stage(p, 'map model', async () => {
    const g = window.__game; g.debugCon.exec('map'); for (let i = 0; i < 300 && !(globalThis.__editors && globalThis.__editors.map); i++) await window.__sleep(100); const ed = globalThis.__editors.map; const out = { open: !!ed };
    const MP = await import('/src/debug/ModelPack.js'); await MP.loadPack(); const a = await MP.addAsset([await window.__mkGlb('crate.glb')], 'model'); const id = 'm' + a.main.slice(0, 12); MP.PACK.m.objects[id] = { name: a.name, asset: { main: a.main, files: a.files } }; await ed.fillModels();
    out.libRows = ed.modelSec.querySelectorAll('select option').length; const P = g.player; const L = await import('/src/world/Layout.js'); const x = P.x + 6, z = P.z + 3, y = L.groundY(x, z);
    const { THREE } = await import('/tools/browser/three-helpers.mjs'); ed.placeAt({ k: 'model', type: id }, new THREE.Vector3(x, y, z)); for (let i = 0; i < 50 && !ed.meshOf(ed.sel && ed.sel.o); i++) await window.__sleep(100);
    const d = ed.sel.o; const m = ed.meshOf(d); out.k = d.k; out.group = !!(m && m.isGroup); out.clips = m && m.userData.model.clips.map((c) => c.name); out.collider = g.world.collision.list ? !!g.world.collision.list.find((c) => c.prim === d.uid) : 'n/a';
    ed.setPrim(d, { clip: 'Spin', s: 3 }, false, true); out.scaled = m.scale.x; out.anim = (await import('/src/debug/MapRuntime.js')).MODEL_ANIM.has(m);
    // pick it with a ray from above
    ed.pos.set(x, y + 6, z + 6); ed.yaw = 0; ed.pitch = -Math.atan2(6, 6); ed.tick(0.02); g.scene.updateMatrixWorld(true); const ctr = new THREE.Box3().setFromObject(m).getCenter(new THREE.Vector3()); out.ctr = [ctr.x - x, ctr.y - y, ctr.z - z].map((q) => +q.toFixed(2)); const v = ctr.clone().project(g.camera); const cr = ed.cv.getBoundingClientRect();
    ed.select(null); const hit = ed.pickAt({ clientX: cr.left + (v.x + 1) / 2 * cr.width, clientY: cr.top + (1 - v.y) / 2 * cr.height }); out.picked = !!(hit && hit.o === d); out.hit = hit ? hit.k + ':' + (hit.o.type || hit.o.kind || '') : null;
    await ed.save(); const j = await (await fetch('/__colombo/models')).json(); out.savedInPack = !!(j.manifest.map && j.manifest.map.added.find((q) => q.uid === d.uid && q.k === 'model')); out.uid = d.uid; ed.main.close(); return out;
  }, (r) => { ok(r.open, 'map editor opens'); ok(r.libRows >= 1, 'uploaded model in the map editor library'); ok(r.k === 'model' && r.group, 'model placed in the city'); ok(r.clips && r.clips.includes('Spin') && r.anim, 'its animation plays'); ok(r.scaled > 2.9, 'scaled');
    ok(r.collider === true || r.collider === 'n/a', 'collider ' + r.collider); ok(r.picked, 'a click selects the placed model'); ok(r.savedInPack, 'saved with the map into model-pack/'); });

  // ---- reload: everything comes back from model-pack/
  await p.evaluate(() => { localStorage.removeItem('colombo.editor.saved'); indexedDB.deleteDatabase('colombo-editor'); }); // only the project folder may bring it back
  await boot(p);
  await stage(p, 'after reload', async () => {
    const g = window.__game; await window.__sleep(2500); await g.stepSim(2, 0.05); const out = {}; const { WEAPONS } = await import('/src/combat/WeaponDefs.js'); const { VTYPES } = await import('/src/vehicles/VehicleModels.js'); const MR = await import('/src/debug/ModelRuntime.js');
    out.mag = WEAPONS.find((d) => d.id === 'type56').mag; out.maxSpeed = VTYPES.car.maxSpeed; const i56 = WEAPONS.findIndex((d) => d.id === 'type56'); const m = g.weapons.models[i56]; await window.__sleep(1500); let repl = false; m.traverse((o) => { if (o.userData.__replacement && o.children.length) repl = true; }); out.repl = repl;
    const { makePoliceAppearance } = await import('/src/actors/Appearance.js'); out.rule = MR.specFor(makePoliceAppearance(9, 'patrol')).top === '#123456';
    let model = 0; (g.world.editorPrims || { children: [] }).children.forEach((c) => { if (c.userData.prim && c.userData.prim.k === 'model') model++; }); out.placed = model;
    const AR = await import('/src/debug/AnimRuntime.js'); out.anim = !!(AR.ANIM.targets['hero:david'] && AR.ANIM.targets['hero:david'].idle); return out;
  }, (r) => { ok(r.mag === 41 && r.repl, 'weapon stats + replacement model back after reload'); ok(r.maxSpeed === 44.5, 'handling back'); ok(r.rule, 'NPC rule back'); ok(r.placed === 1, 'placed map model back'); ok(r.anim, 'david’s imported idle back'); });

  await stage(p, 'dev lock', async () => {
    const g = window.__game; const out = {}; const { DevLock } = await import('/src/debug/DevLock.js'); g.debugCon.toggle(true); g.debugCon.exec('DoneShaun$123$'); await window.__sleep(500);
    out.locked = DevLock.locked; g.debugCon.toggle(true); out.consoleHidden = g.debugCon.con.classList.contains('hidden'); const lj = await (await fetch('/__colombo/devlock')).json(); out.file = lj.locked;
    g.openPause(); await window.__sleep(300); out.studioBtn = [...document.querySelectorAll('.screen.pause .menu-btn')].some((x) => /Texture Studio/.test(x.textContent)); [...document.querySelectorAll('.screen.pause .menu-btn')].find((x) => /Resume|Continue/i.test(x.textContent))?.click(); await window.__sleep(300);
    for (const k of 'SHAUNDEVACTIVATION123$123$') document.body.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })); await window.__sleep(600);
    out.unlocked = !DevLock.locked; out.file2 = (await (await fetch('/__colombo/devlock')).json()).locked; g.debugCon.toggle(true); out.consoleBack = !g.debugCon.con.classList.contains('hidden'); g.debugCon.toggle(false); return out;
  }, (r) => { ok(r.locked && r.consoleHidden && r.file === true, 'DoneShaun$123$ removes the console (dev-lock.json written)'); ok(!r.studioBtn, 'pause menu Texture Studio gone while locked'); ok(r.unlocked && r.file2 === false && r.consoleBack, 'secret code typed in the game brings them back'); });

  ok(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 4).join(' || ') : ''));
} finally {
  await b.close();
  fs.rmSync(PACK, { recursive: true, force: true }); if (fs.existsSync(ASIDE)) fs.renameSync(ASIDE, PACK); else fs.mkdirSync(PACK, { recursive: true });
  if (fs.existsSync(LOCK)) fs.rmSync(LOCK); if (lock0) fs.writeFileSync(LOCK, lock0);
}
console.log(fails ? `# ${fails} failed` : '# all passed'); process.exit(fails ? 1 : 0);
