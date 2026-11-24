// 59th — Texture Studio end-to-end (headless Chromium + the dev server, which provides the project-folder storage):
// opens the Studio from the pause menu, picks a real BUILDING facade, a ROAD, a VEHICLE and a PROP by raycasting the screen,
// imports generated PNGs into the library (content hash, dedupe, 1024 px → 512 px GPU copy), replaces textures and
// material settings in place (shared material objects and shader patches kept, originals untouched), tiling / colour /
// undo / redo / restore, "Make unique" on one prop, a zip pack round trip, saves to texture-pack/, then RELOADS the game
// and checks that every replacement is back (including a vehicle spawned after the restart).
// 61st: a PBR texture SET sorted into slots by file name (diffuse, DirectX normal, roughness, ARM, displacement) made into a
// CREATED MATERIAL, used by two parts and edited once for both; Height / Bump and Displacement slots (displacement defaults);
// "Texture size" linked across all slots; "Visible" (remove surfaces); OBJECT SIZE on a mesh (kept after the restart) and on
// one instance (hidden + reset); replace a texture everywhere (+ undo); and the production pack (buildManifest) keeping all of it.
// texture-pack/ is moved aside during the test and put back afterwards (the user's own work is never touched).
//   node tools/texture-studio-test.mjs        PORT env (default 5199) — needs `npm run dev`-style server on that port
import fs from 'node:fs';
import { buildManifest } from './vite/texturePack.mjs';
import puppeteer from '/home/user/testenv/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
import chromium from '/home/user/testenv/node_modules/@sparticuz/chromium/build/index.js';
const PACK = new URL('../texture-pack/', import.meta.url).pathname; const ASIDE = PACK.replace(/\/$/, '') + '.test-aside';
if (fs.existsSync(ASIDE)) throw new Error(ASIDE + ' exists — a previous run did not finish; move it back to texture-pack/ first');
if (fs.existsSync(PACK)) fs.renameSync(PACK, ASIDE); fs.mkdirSync(PACK, { recursive: true }); if (fs.existsSync(ASIDE + '/README.md')) fs.copyFileSync(ASIDE + '/README.md', PACK + 'README.md');
const b = await puppeteer.launch({ executablePath: await chromium.executablePath(), headless: true, protocolTimeout: 1800000, args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'], defaultViewport: { width: 960, height: 540 } });
let fails = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };
const stage = async (p, name, fn, checks, arg) => { let r; try { r = await p.evaluate(fn, arg); console.log(name, JSON.stringify(r).slice(0, 1500)); } catch (e) { ok(false, `${name}: ${String(e.message || e).split('\n').slice(0, 3).join(' | ')}`); return null; } try { checks(r); } catch (e) { ok(false, name + ' checks threw ' + e.message); } return r; };
const URL0 = 'http://localhost:' + (process.env.PORT || 5199) + '/?test&quick=play';
async function boot(p) {
  await p.goto(URL0, { waitUntil: 'domcontentloaded', timeout: 300000 });
  await p.waitForFunction(() => window.__game && window.__game.stepSim && window.__game.mode === 'play', { timeout: 900000, polling: 1000 });
}
// page helpers (installed on every load)
const HELPERS = () => {
  window.__T = window.__T || {};
  window.__mkPng = async (w, hh, seed) => { const c = document.createElement('canvas'); c.width = w; c.height = hh; const g = c.getContext('2d'); const hue = (seed * 67) % 360; g.fillStyle = `hsl(${hue},55%,45%)`; g.fillRect(0, 0, w, hh); g.fillStyle = `hsl(${(hue + 180) % 360},60%,70%)`; for (let i = 0; i < 16; i++) for (let j = 0; j < 16; j++) if ((i + j) % 2) g.fillRect((i * w) / 16, (j * hh) / 16, w / 16, hh / 16); g.fillStyle = '#fff'; g.font = `bold ${w / 6}px sans-serif`; g.fillText('T' + seed, w / 8, hh / 2);
    const blob = await new Promise((r) => c.toBlob(r, 'image/png')); return new File([blob], 'test-' + seed + '.png', { type: 'image/png' }); };
  // aim the studio camera at a world point from a position and pick the screen centre
  window.__aimPick = async (ed, from, at) => { ed.pos.set(from[0], from[1], from[2]); const v = { x: at[0] - from[0], y: at[1] - from[1], z: at[2] - from[2] }; const L = Math.hypot(v.x, v.y, v.z); ed.yaw = Math.atan2(-v.x, -v.z); ed.pitch = Math.asin(v.y / L);
    const g = window.__game; g.world.warm(at[0], at[2]); for (let i = 0; i < 6; i++) ed.tick(0.05); g.scene.updateMatrixWorld(true); const r = ed.cv.getBoundingClientRect(); ed.pick(r.left + r.width / 2, r.top + r.height / 2, false); return ed.hits; };
};

try {
  const p = await b.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e.stack || e).split('\n').slice(0, 3).join(' | ')));
  await p.evaluateOnNewDocument(() => { localStorage.setItem('colombo.settings.v1', JSON.stringify({ quality: 'low', showFps: false })); localStorage.removeItem('colombo.texstudio.settings'); });
  await p.evaluateOnNewDocument(HELPERS);
  await boot(p);

  await stage(p, 'open', async () => {
    const g = window.__game; g.noRender = true; await g.stepSim(10, 0.05); const out = {};
    // the pause menu's dev-only button
    g.openPause(); await new Promise((r) => setTimeout(r, 300)); const btn = [...document.querySelectorAll('.screen.pause .menu-btn')].find((x) => x.textContent === 'Texture Studio'); out.pauseBtn = !!btn;
    if (btn) btn.click(); for (let i = 0; i < 100 && !(globalThis.__editors && globalThis.__editors.textures); i++) await new Promise((r) => setTimeout(r, 100));
    const ed = globalThis.__editors && globalThis.__editors.textures; out.open = !!ed; out.wins = [...document.querySelectorAll('.ed-win .ed-title span')].map((s) => s.textContent).filter((t) => /Texture/.test(t));
    const RT = window.__texRuntime; out.backend = RT.S.backend.kind; out.editorHook = !!g.editorHook; out.paused = g.paused; out.rules0 = Object.keys(RT.S.manifest.rules).length;
    return out;
  }, (r) => { ok(r.pauseBtn, 'pause menu has the dev-only "Texture Studio" button'); ok(r.open && r.wins.length === 2, `studio opens with its two windows (${r.wins.join(', ')})`); ok(r.backend === 'folder', 'storage = project folder (dev server)'); ok(r.editorHook && !r.paused, 'studio session owns the frame (world frozen, still drawn)'); ok(r.rules0 === 0, 'starts with no rules'); });

  await stage(p, 'building', async () => {
    const g = window.__game, ed = globalThis.__editors.textures, RT = window.__texRuntime, L = window.__L; const out = {}; const P = g.player;
    // a tall generated building near the player; look at each side from outside until a facade (merged city batch) is hit
    const { plan } = await import('/src/world/CityPlan.js'); const cands = plan.buildings.filter((q) => q.totalH > 9 && Math.hypot((q.x0 + q.x1) / 2 - P.x, (q.z0 + q.z1) / 2 - P.z) < 260).slice(0, 25);
    let hit = null, bd = null;
    for (const q of cands) { const cx = (q.x0 + q.x1) / 2, cz = (q.z0 + q.z1) / 2, gy = L.groundY(cx, cz), y = gy + Math.min(q.totalH * 0.55, 9);
      for (const [fx, fz] of [[cx, q.z1 + 9], [cx, q.z0 - 9], [q.x1 + 9, cz], [q.x0 - 9, cz]]) { const hits = await window.__aimPick(ed, [fx, y, fz], [cx, y, cz]); const h0 = hits.find((it) => it.obj.isBatchedMesh && /^mat:f_/.test(RT.keyOf([].concat(it.obj.material)[it.idx], it.obj, it.idx)));
        if (h0 && h0 === hits[0]) { ed.select(h0); if (ed.building() === q) { hit = h0; bd = q; break; } } }
      if (hit) break; }
    out.found = !!hit; if (!hit) return out;
    const m = ed.m, key = ed.key; out.key = key; out.batched = ed.sel.obj.isBatchedMesh; out.building = bd.id; out.style = bd.style;
    const orig = m.map, origRep = orig.repeat.clone(), origImg = orig.image, origOBC = m.onBeforeCompile; out.users = RT.usersOf(m).meshes;
    out.leftHasBuilding = /Building/.test(ed.left.body.textContent) && /b:/.test(ed.left.body.textContent);
    const f = await window.__mkPng(1024, 1024, 1); const imp = await RT.importFile(f, { category: 'Building' }); out.hash = imp.hash; out.libW = imp.meta.w;
    const imp2 = await RT.importFile(await window.__mkPng(1024, 1024, 1), {}); out.dedupe = imp2.dup && imp2.hash === imp.hash;
    await ed.assign(imp.hash, 'map');
    const { MAT } = await import('/src/gfx/Materials.js');
    out.sameMaterial = MAT[key.slice(4)] === m && [].concat(ed.sel.obj.material)[0] === m; out.newMap = m.map !== orig && /^texstudio:/.test(m.map.name); out.gpuW = m.map.image.width; out.gpuH = m.map.image.height;
    out.origKept = RT.originalOf(m).slots.map === orig && orig.image === origImg && orig.repeat.equals(origRep); out.uvKept = m.map.repeat.equals(origRep) && m.map.wrapS === orig.wrapS; out.patchKept = m.onBeforeCompile === origOBC;
    out.srgb = m.map.colorSpace === orig.colorSpace; out.sharesSource = (() => { const st = RT.S; void st; return true; })();
    // tiling (same texture object, new UV transform) · colour adjustment (new GPU copy) · settings · undo / redo
    const t0 = m.map; await ed.slotEdit('tiling', (s) => { s.repeat = [origRep.x * 2, origRep.y * 2]; }); out.tiling = m.map === t0 && Math.abs(m.map.repeat.x - origRep.x * 2) < 1e-6;
    await ed.slotEdit('colour', (s) => { s.adjust = { bright: 0.1, contrast: 0, sat: -0.5, hue: 0, tint: '#ffffff', invert: false }; }); out.adjusted = m.map !== t0 && m.map.repeat.x === origRep.x * 2;
    const r0 = m.roughness; await ed.edit('rough', (x) => { x.props.roughness = 0.37; }); out.rough = Math.abs(m.roughness - 0.37) < 1e-6;
    await ed.undo(); out.undoRough = Math.abs(m.roughness - r0) < 1e-6; await ed.redo(); out.redoRough = Math.abs(m.roughness - 0.37) < 1e-6;
    // hold-to-compare shows the original and puts the replacement back
    const cur = m.map; ed.startPeek(); out.peekOrig = m.map === orig; ed.endPeek(); out.peekBack = m.map === cur;
    out.preview = !!ed.pvO && ed.pvO.isConnected && /Replacement/.test(ed.pvNcap.textContent);
    window.__T.building = { key, hash: imp.hash, w: m.map.image.width, rep: origRep.x * 2 }; out.err = RT.S.errors.get(key) || null;
    return out;
  }, (r) => { ok(r.found, `a building facade picked on screen (building b:${r.building}, ${r.style}, ${r.key})`); if (!r.found) return; ok(r.batched && r.leftHasBuilding, 'merged city batch → the generated building is identified (b:id + blue box)');
    ok(r.libW === 1024 && r.dedupe, 'library keeps the 1024 px original; importing the same file again reuses it (hash dedupe)'); ok(r.sameMaterial && r.newMap, 'texture replaced IN PLACE on the shared material (material object unchanged)');
    ok(r.gpuW === 512 && r.gpuH === 512, `GPU copy limited to 512 px (${r.gpuW}×${r.gpuH})`); ok(r.origKept && r.uvKept && r.patchKept && r.srgb, 'original texture untouched + backed up; UV tiling, wrap, colour space and the shader patch preserved');
    ok(r.tiling, 'tiling edit updates the same texture (no reload)'); ok(r.adjusted, 'colour adjustment makes a new GPU copy, tiling kept'); ok(r.rough && r.undoRough && r.redoRough, 'material setting + undo + redo'); ok(r.peekOrig && r.peekBack, 'hold-to-compare shows the original, then the replacement again'); ok(r.preview, 'side-by-side preview shows original | replacement'); ok(!r.err, 'no apply errors ' + (r.err || '')); });

  await stage(p, 'road', async () => {
    const g = window.__game, ed = globalThis.__editors.textures, RT = window.__texRuntime, L = window.__L; const P = g.player; const out = {};
    const segs = L.segments.filter((s) => !s.bridge && s.w >= 9).sort((a, c) => Math.hypot((a.x0 + a.x1) / 2 - P.x, (a.z0 + a.z1) / 2 - P.z) - Math.hypot((c.x0 + c.x1) / 2 - P.x, (c.z0 + c.z1) / 2 - P.z)).slice(0, 12);
    let hit = null;
    for (const s of segs) { const mx = (s.x0 + s.x1) / 2, mz = (s.z0 + s.z1) / 2; const ox = s.dir === 'v' ? s.w * 0.22 : 0, oz = s.dir === 'h' ? s.w * 0.22 : 0; const gy = L.groundY(mx + ox, mz + oz);
      const hits = await window.__aimPick(ed, [mx + ox + 0.3, gy + 7, mz + oz + 0.3], [mx + ox, gy, mz + oz]); const h0 = hits.find((it) => /road|asphalt/i.test(RT.keyOf([].concat(it.obj.material)[it.idx], it.obj, it.idx)));
      if (h0) { ed.select(h0); hit = h0; break; } }
    out.found = !!hit; if (!hit) return out; const m = ed.m; out.key = ed.key; out.obj = hit.obj.name || hit.obj.type; out.front = ed.hits.indexOf(hit);
    const orig = m.map; const f = await window.__mkPng(512, 512, 2); const imp = await RT.importFile(f, { category: 'Road' }); await ed.assign(imp.hash, 'map');
    out.applied = m.map !== orig && /^texstudio:/.test(m.map.name) && m.map.repeat.equals(orig.repeat);
    // normal map slot as well (per-map replacement), green flipped
    const n0 = m.normalMap; const imp2 = await RT.importFile(await window.__mkPng(256, 256, 3), { category: 'Road' }); ed.slot = 'normalMap'; await ed.assign(imp2.hash, 'normalMap'); await ed.slotEdit('flip green', (s) => { s.flipGreen = true; });
    out.normal = m.normalMap && m.normalMap !== n0 && m.normalMap.colorSpace !== 'srgb'; out.wet = (await import('/src/gfx/Materials.js')).wetTarget(m) ? 'weather-driven' : 'static';
    await ed.edit('rough', (x) => { x.props.roughness = 0.8; }); const { wetTarget } = await import('/src/gfx/Materials.js'); const w = wetTarget(m); out.wetDry = w ? w[1] : null;
    window.__T.road = { key: ed.key, hash: imp.hash, nhash: imp2.hash }; out.err = RT.S.errors.get(ed.key) || null;
    return out;
  }, (r) => { ok(r.found, `a road picked on screen (${r.key}, mesh ${r.obj}, hit #${r.front})`); if (!r.found) return; ok(r.applied, 'road base colour replaced, road UV tiling kept'); ok(r.normal, 'road normal map replaced separately (linear colour space, DirectX green flip)'); ok(r.wet !== 'weather-driven' || Math.abs(r.wetDry - 0.8) < 1e-6, `roughness on a weather-driven material edits its dry value (${r.wet}, dry ${r.wetDry})`); ok(!r.err, 'no apply errors ' + (r.err || '')); });

  await stage(p, 'vehicle', async () => {
    const g = window.__game, ed = globalThis.__editors.textures, RT = window.__texRuntime, L = window.__L; const out = {};
    const all = [...(g.traffic.parked || []), ...(g.traffic.vehicles || [])].filter((v) => v && v.mesh && v.mesh.visible && !v.boat); let hit = null, veh = null;
    for (const v of all.slice(0, 20)) { const gy = L.groundY(v.x, v.z); const a = (v.yaw || 0) + Math.PI / 2; const hits = await window.__aimPick(ed, [v.x + Math.sin(a) * 6, gy + 1.1, v.z + Math.cos(a) * 6], [v.x, gy + 0.55, v.z]);
      const h0 = hits.find((it) => RT.vehOf(it.obj) === v.mesh && /paint/.test(RT.keyOf([].concat(it.obj.material)[it.idx], it.obj, it.idx))); if (h0) { ed.select(h0); hit = h0; veh = v; break; } }
    out.found = !!hit; if (!hit) return out; const shared = ed.m; out.key = ed.key; out.type = veh.type;
    const imp = await RT.importFile(await window.__mkPng(512, 256, 4), { category: 'Vehicle' }); await ed.assign(imp.hash, 'map');
    const m = ed.m; out.ownCopy = m !== shared && hit.obj.material === m && !shared.map; out.uiFollows = ed.key === out.key;
    out.applied = !!m.map && /^texstudio:/.test(m.map.name); out.aspect = m.map.image.width + 'x' + m.map.image.height;
    await ed.edit('metal', (x) => { x.props.metalness = 0.55; }); out.metal = Math.abs(m.metalness - 0.55) < 1e-6;
    // other vehicles: those of another type keep their own paint
    const other = all.find((v) => v.type !== veh.type); let otherPaint = null; if (other) other.mesh.traverse((o) => { if (!otherPaint && o.isMesh && o.name === 'paint') otherPaint = [].concat(o.material)[0]; }); out.sameTypeOthers = all.filter((v) => v !== veh && v.type === veh.type).length;
    let samePaint = null; const twin = all.find((v) => v !== veh && v.type === veh.type); if (twin) twin.mesh.traverse((o) => { if (!samePaint && o.isMesh && o.name === 'paint') samePaint = [].concat(o.material)[0]; }); out.twinGotIt = !twin || samePaint === m;
    out.copy = !(await import('/src/vehicles/VehicleModels.js')).vehicleMaterials().mats.vpaint.map; let bakeOk = true; if (veh.mesh.userData.bake) bakeOk = veh.mesh.userData.bake.mats.paint === m; out.bake = bakeOk;
    out.otherUntouched = !otherPaint || !otherPaint.map || !/^texstudio:/.test(otherPaint.map.name);
    window.__T.veh = { key: ed.key, type: veh.type, hash: imp.hash }; out.err = RT.S.errors.get(ed.key) || null;
    return out;
  }, (r) => { ok(r.found, `a vehicle picked on screen (${r.type}, ${r.key})`); if (!r.found) return; ok(r.applied, `vehicle paint texture applied (${r.aspect}, aspect kept)`); ok(r.metal, 'vehicle material setting (metalness)'); ok(r.ownCopy && r.uiFollows, 'the vehicle type got its own copy of the shared paint; the studio follows it'); ok(r.otherUntouched && r.copy, 'vehicles of other types (and the shared vehicle paint) are not affected'); ok(r.twinGotIt && r.bake, `same type shares the copy (${r.sameTypeOthers} other ${r.type}), door-pivot material (bake.mats) follows`); ok(!r.err, 'no apply errors ' + (r.err || '')); });

  await stage(p, 'prop', async () => {
    const g = window.__game, ed = globalThis.__editors.textures, RT = window.__texRuntime; const out = {};
    // a static prop mesh with a shared material (used by more than one mesh) in the fuel stations / gun shop / street furniture
    // candidates: small static meshes whose material is shared by several meshes; the first one that is the FRONT hit when looked at
    const cands = []; RT.scan(); const T3 = window.__THREE;
    for (const name of ['fuel-stations', 'gunshop-front', 'club-front', 'street-customs', 'city-streets', 'landmarks']) { const grp = g.scene.getObjectByName(name); if (!grp) continue;
      grp.traverse((o) => { if (cands.length > 60 || !o.isMesh || o.isInstancedMesh || o.isBatchedMesh || Array.isArray(o.material) || !o.visible) return; const m = o.material; if (!m.isMeshStandardMaterial) return; if (RT.usersOf(m).meshes < 2 || !RT.canMakeUnique(o)) return;
        o.updateWorldMatrix(true, false); const bb = new T3.Box3().setFromObject(o); const sz = bb.getSize(new T3.Vector3()); if (sz.length() > 0.4 && sz.length() < 7) cands.push([o, bb.getCenter(new T3.Vector3()), sz]); }); }
    let target = null, c = null, h0 = null;
    for (const [o, cc, sz] of cands) { const d = Math.max(2.2, sz.length() * 1.2); for (const [dx, dz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) { const hits = await window.__aimPick(ed, [cc.x + dx * d * 0.7, cc.y + d * 0.5, cc.z + dz * d * 0.7], [cc.x, cc.y, cc.z]); if (hits[0] && hits[0].obj === o) { target = o; c = cc; h0 = hits[0]; break; } } if (target) break; }
    out.found = !!target; out.cands = cands.length; if (!target) return out;
    out.picked = !!h0; ed.select(h0);
    const shared = ed.m; out.obj = target.name || target.parent.name; out.sharedKey = ed.key; out.users = RT.usersOf(shared).meshes;
    await ed.makeUnique(); out.uniqueKey = ed.key; out.cloneOnMesh = target.material !== shared && target.material === ed.m; out.otherStillShared = RT.usersOf(shared).objects.some((o) => o !== target && o.material === shared);
    const imp = await RT.importFile(await window.__mkPng(256, 256, 5), { category: 'Prop' }); await ed.assign(imp.hash, 'map'); RT.scan();
    out.applied = /^texstudio:/.test(target.material.map?.name || ''); out.sharedUntouched = !shared.map || !/^texstudio:/.test(shared.map.name);
    out.patch = target.material.onBeforeCompile === shared.onBeforeCompile;
    window.__T.prop = { key: ed.key, path: ed.key.slice(4).split('|')[0], hash: imp.hash }; out.err = RT.S.errors.get(ed.key) || null;
    return out;
  }, (r) => { ok(r.found, `a shared-material prop found (${r.obj}, ${r.users} users, ${r.sharedKey})`); if (!r.found) return; ok(r.picked, 'the prop is picked by clicking it on screen'); ok(r.cloneOnMesh && r.otherStillShared, `"Make unique": only this mesh gets a copy (${r.uniqueKey}); the others keep the shared material`);
    ok(r.applied && r.sharedUntouched && r.patch, 'texture on the unique copy only; shared material unchanged; shader patch kept'); ok(!r.err, 'no apply errors ' + (r.err || '')); });

  await stage(p, '61st', async () => {
    const g = window.__game, ed = globalThis.__editors.textures, RT = window.__texRuntime; const out = {}; const T3 = window.__THREE; const { ensureMat } = await import('/src/gfx/Materials.js');
    const names = ['Bricks_diff_1k.png', 'Bricks_nor_dx_1k.png', 'Bricks_rough_1k.png', 'Bricks_arm_1k.png', 'Bricks_disp_1k.png', 'Bricks_preview.png']; const list = [];
    for (let i = 0; i < names.length; i++) { const f = await window.__mkPng(i === 0 ? 1024 : 256, i === 0 ? 1024 : 256, 20 + i); const n = names[i]; const cls = RT.classifyTexture(n); if (!cls) { list.push({ name: n, cls: null }); continue; } const r = await RT.importFile(new File([f], n, { type: 'image/png' }), {}); list.push({ name: n, cls, hash: r.hash }); }
    const H = Object.fromEntries(list.filter((x) => x.hash).map((x) => [x.name.split('_')[1], x.hash]));
    out.both = Object.keys(RT.setSlots(list, 'both').slots).sort().join(',');
    // 1. texture set → a new created material (the studio switches to editing it; the prop's unique copy is remembered)
    const prevKey = ed.key; const res = await ed.applySet(list, true, names); const uk = res.key; const ur = RT.getRule(uk); const S = ur.slots;
    out.umName = ur.label; out.editing = ed.key === uk && ed.umBack && ed.umBack.key === prevKey; out.skipped = res.skipped;
    out.setOk = S.map.tex === H.diff && S.normalMap.tex === H.nor && !!S.normalMap.flipGreen && S.roughnessMap.tex === H.rough && S.aoMap.tex === H.arm && S.metalnessMap.tex === H.arm && S.bumpMap.tex === H.disp && !S.displacementMap && ur.props.roughness === 1 && ur.props.metalness === 1;
    const pm = RT.materialsFor(uk)[0]; out.preview = !!pm && /^texstudio:/.test(pm.map?.name || '') && !!pm.bumpMap && !!pm.aoMap;
    await ed.edit('bump', (x) => { x.props.bumpScale = 2; });
    out.ui = /Materials \(created\)/.test(ed.right.body.textContent) && ed.right.body.textContent.includes(ur.label) && /Load texture set/.test(ed.left.body.textContent) && /Edited \(/.test(ed.right.body.textContent);
    // 2. used by the prop (unique copy) and by every lamp pole
    await ed.useMaterial(uk); const propM = RT.materialsFor(window.__T.prop.key)[0]; out.propUses = ed.key === window.__T.prop.key && RT.getRule(ed.key).use === uk && /^texstudio:/.test(propM.map?.name || '') && !!propM.bumpMap && Math.abs(propM.bumpScale - 2) < 1e-6 && !!propM.normalMap;
    ed.editRule('mat:lampPole'); const lp = ensureMat('lampPole'); out.lpEditing = ed.key === 'mat:lampPole' && ed.m === lp; await ed.useMaterial(uk);
    out.lpUses = RT.getRule('mat:lampPole').use === uk && /^texstudio:/.test(lp.map?.name || '') && !!lp.bumpMap && lp.vertexColors === false;
    // 3. edit the created material once → both parts follow
    ed.editMaterial(uk); await ed.edit('colour', (x) => { x.props.color = '#ff8800'; }); out.bothFollow = propM.color.getHexString() === 'ff8800' && lp.color.getHexString() === 'ff8800';
    ed.backFromMaterial(); out.back = ed.key === 'mat:lampPole';
    // 4. displacement slot on the lamp poles' own rule (on top of the material): safe defaults
    ed.slot = 'displacementMap'; await ed.assign(H.disp, 'displacementMap'); const lr = RT.getRule('mat:lampPole');
    out.disp = !!lp.displacementMap && Math.abs(lp.displacementScale - 0.03) < 1e-6 && Math.abs(lp.displacementBias + 0.015) < 1e-6 && lr.props.displacementScale === 0.03 && lr.use === uk;
    // 5. texture size, linked across every slot (the material's maps keep their images)
    ed.slot = 'map'; const base = ed.defaultSlot('map').repeat || [1, 1]; await ed.uvEdit('texture size', (sr, sk) => { const d = ed.defaultSlot(sk); const b2 = d.repeat || [1, 1]; sr.repeat = [b2[0] / 2, b2[1] / 2]; });
    out.linked = ['map', 'normalMap', 'roughnessMap', 'aoMap', 'bumpMap', 'displacementMap'].every((k) => lp[k] && Math.abs(lp[k].repeat.x - base[0] / 2) < 1e-6) && /^texstudio:/.test(lp.map.name) && RT.getRule('mat:lampPole').slots.map.tex == null;
    out.lpMapSame = lp.map.source === propM.map.source; // still the material's image (one upload)
    // 6. remove the surfaces (Visible off) and put them back
    await ed.edit('hide', (x) => { x.props.visible = false; }); out.hidden = lp.visible === false; await ed.undo(); out.shown = lp.visible === true;
    // 7. object size: the prop mesh ×1.5 (kept), one instance of an instanced mesh hidden then reset
    RT.scan(); const mesh = RT.usersOf(propM).objects[0]; const s0 = mesh.scale.toArray(); const pt = mesh.getWorldPosition(new T3.Vector3());
    ed.select({ obj: mesh, inst: null, batch: null, idx: 0, point: pt, dist: 5 }); const t = ed.sizeTarget(); const xk = RT.xfKey(t.node, t.inst);
    out.sizeUi = /Object size/.test(ed.left.body.textContent); await ed.xfEdit(xk, t, 'size', (x) => { x.scale = [1.5, 1.5, 1.5]; });
    out.scaled = Math.abs(mesh.scale.x - s0[0] * 1.5) < 1e-6 && Math.abs(mesh.scale.y - s0[1] * 1.5) < 1e-6;
    // street props are drawn from shared pools repacked as chunks stream: keyed by chunk + part + index, kept across repacks
    const P = (g.world.propPools || []).find((q) => q.mesh.visible && q.mesh.count > 6); out.inst = !!P;
    if (P) { const im = P.mesh; const W = g.world; const dec = (arr, o = 0) => { const m = new T3.Matrix4().fromArray(arr, o); const sc = new T3.Vector3(), pp = new T3.Vector3(); m.decompose(pp, new T3.Quaternion(), sc); return { sc, pp }; };
      // (the studio keeps streaming chunks while it is open, so the packed index of a prop can change between two reads: the
      // checks read the chunk part's own matrices, which every repack copies)
      const pick = (i) => { const m = new T3.Matrix4(); im.getMatrixAt(i, m); ed.select({ obj: im, inst: i, batch: null, idx: 0, point: new T3.Vector3().setFromMatrixPosition(m), dist: 5 }); const t = ed.sizeTarget(); return { t, k: RT.xfKey(t.node, t.inst, t.at), loc: t.at }; };
      const A = pick(2); out.poolKey = A.k; const orig = A.loc.part.mat.slice(A.loc.local * 16, A.loc.local * 16 + 16);
      await ed.xfEdit(A.k, A.t, 'hide object', (x) => { x.hidden = true; }); const st = RT.xfState(A.k); const h = dec(st.part.mat, st.local * 16);
      W.repackProps(); const pk = RT.xfState(A.k).inst; const inMesh = pk == null || (() => { const m = new T3.Matrix4(); im.getMatrixAt(pk, m); return m.elements.every((v, j) => Math.abs(v - st.part.mat[st.local * 16 + j]) < 1e-5); })();
      out.instHidden = /^xf:pool:\d+:\d+\|i\d+$/.test(A.k) && st.part === A.loc.part && [0, 4, 8].every((c) => Math.hypot(st.part.mat[st.local * 16 + c], st.part.mat[st.local * 16 + c + 1], st.part.mat[st.local * 16 + c + 2]) < 1e-6) && /* three's decompose reports 1 for a zero matrix: columns read directly */ h.pp.distanceTo(dec(orig).pp) < 1e-4 && inMesh;
      await RT.setRule(A.k, null, { label: 'reset size' }); out.instBack = A.loc.part.mat.slice(A.loc.local * 16, A.loc.local * 16 + 16).every((v, j) => v === orig[j]) && !RT.getRule(A.k);
      const B = pick(3); const sx = dec(B.loc.part.mat, B.loc.local * 16).sc.x;
      await ed.xfEdit(B.k, B.t, 'size', (x) => { x.scale = [2, 2, 2]; }); W.repackProps(); W.repackProps(); const s2 = RT.xfState(B.k);
      out.poolScaled = Math.abs(dec(s2.part.mat, s2.local * 16).sc.x - sx * 2) < 1e-4; window.__T.pool = { k: B.k, sx }; }
    // 8. replace a texture everywhere (+ undo)
    const other = H.preview || list.find((x) => x.hash && x.hash !== H.diff).hash; const n = await RT.replaceTextureEverywhere(H.diff, other); out.replaced = n >= 1 && RT.getRule(uk).slots.map.tex === other; await ed.undo(); out.replaceUndo = RT.getRule(uk).slots.map.tex === H.diff;
    // 9. the manifest keeps it all (sanitize round trip)
    const sm = RT.sanitizeManifest(RT.exportManifest(false)); out.sanitized = sm.rules[uk] && sm.rules['mat:lampPole'].use === uk && sm.rules[xk] && sm.rules[xk].scale[0] === 1.5 && sm.rules['mat:lampPole'].props.displacementScale === 0.03;
    await RT.saveNow(); window.__T.u61 = { uk, xk, s0, lpRep: base[0] / 2 }; out.errs = [...RT.S.errors.entries()].filter(([k]) => k === uk || k === xk || k === 'mat:lampPole');
    return out;
  }, (r) => { ok(r.setOk && r.skipped.join() === 'Bricks_preview.png', `texture set sorted by file name: diffuse → Base Color, nor_dx → Normal (green flipped), rough → Roughness, arm → AO + Metallic, disp → Height / Bump (${r.umName})`);
    ok(r.both === 'aoMap,bumpMap,displacementMap,map,metalnessMap,normalMap,roughnessMap', 'height maps can go to bump, displacement or both (' + r.both + ')');
    ok(r.editing && r.preview && r.ui, 'the set becomes a created material, edited in the studio (preview material with every map; listed under Materials (created) / Edited)');
    ok(r.propUses && r.lpEditing && r.lpUses, 'the created material is used by the prop\'s unique copy and by every lamp pole (per-object tint switched off for the photo texture)');
    ok(r.bothFollow && r.back, 'editing the created material once changes both parts');
    ok(r.disp, 'Displacement slot: map applied with safe defaults (scale 0.03 m, bias −0.015 m), on top of the created material');
    ok(r.linked && r.lpMapSame, '"Texture size ×2" tiles every slot together (base colour, normal, roughness, AO, bump, displacement) and keeps the material\'s images');
    ok(r.hidden && r.shown, '"Visible" off removes the surfaces; undo brings them back');
    ok(r.sizeUi && r.scaled, 'object size: the prop mesh scaled ×1.5');
    ok(r.inst && r.instHidden && r.instBack, `object size on one street prop of a shared pool (${r.poolKey}): hidden in place, reset puts the exact matrix back`); ok(r.poolScaled, 'a street prop scaled ×2 stays scaled through a pool repack');
    ok(r.replaced && r.replaceUndo, 'replace a texture everywhere it is used, undo');
    ok(r.sanitized, 'manifest round trip keeps created materials, "use", object sizes and the new settings'); ok(!r.errs.length, 'no apply errors ' + JSON.stringify(r.errs)); });

  await stage(p, '62nd', async () => {
    // pavements: no brick pavers / modelled bricks any more; clicking a footpath edits the pavement type itself; the joint grass
    // is the shared MAT.paveGrass (replaceable); Save to game writes texture-pack/ (dev server) or a picked folder (OPFS stand-in)
    const g = window.__game, ed = globalThis.__editors.textures, RT = window.__texRuntime; const T3 = window.__THREE; const out = {}; const { MAT } = await import('/src/gfx/Materials.js'); const { TEX } = await import('/src/gfx/Textures.js');
    out.texOld = !!(TEX.pavers || TEX.paversGrey); out.texNew = !!(TEX.pave1 && TEX.pave2 && TEX.jointGrass && TEX.n_pave1 && TEX.n_pave2); out.maps = MAT.walk.map === TEX.pave1 && MAT.walkGrey.map === TEX.pave2 && MAT.paveGrass.map === TEX.jointGrass;
    out.labels = [MAT.walk.name, MAT.walkGrey.name, MAT.paveGrass.name];
    const gd = window.__groundDetail; gd.setQuality('medium'); // the test runs on 'low' (ground detail off there)
    // a footpath point: straight down onto the pavement material, in the middle of a slab (x, z = k·0.5 + 0.25)
    const rc = new T3.Raycaster(); const objs = []; g.scene.traverse((o) => { if (o.isMesh && !o.isInstancedMesh && !o.isSkinnedMesh && o.visible) objs.push(o); });
    const P = g.player; let spot = null; g.world.warm(P.x, P.z);
    for (let r = 2; r < 60 && !spot; r += 1) for (let a = 0; a < 24 && !spot; a++) { const x = Math.round((P.x + Math.cos(a / 24 * 6.283) * r - 0.25) * 2) / 2 + 0.25, z = Math.round((P.z + Math.sin(a / 24 * 6.283) * r - 0.25) * 2) / 2 + 0.25;
      rc.set(new T3.Vector3(x, 40, z), new T3.Vector3(0, -1, 0)); const hs = []; for (const o of objs) { try { o.raycast(rc, hs); } catch { /* odd geometry (null index) */ } } hs.sort((q, w) => q.distance - w.distance); const h = hs[0]; if (!h) continue; const m = [].concat(h.object.material)[h.face && Array.isArray(h.object.material) ? h.face.materialIndex : 0]; if (m === MAT.walk || m === MAT.walkGrey) spot = { x, z, y: h.point.y, grey: m === MAT.walkGrey }; }
    out.spot = spot; if (!spot) return out;
    await window.__aimPick(ed, [spot.x + 0.01, spot.y + 1.6, spot.z + 2.2], [spot.x, spot.y, spot.z]);
    for (let i = 0; i < 40; i++) gd.update(ed.cam); // build the detail tiles around the studio camera
    await window.__aimPick(ed, [spot.x + 0.01, spot.y + 1.6, spot.z + 2.2], [spot.x, spot.y, spot.z]);
    const want = spot.grey ? 'mat:walkGrey' : 'mat:walk'; out.key = ed.key; out.hit0 = ed.hits[0] && (ed.hits[0].obj.isInstancedMesh ? 'instanced:' + [].concat(ed.hits[0].obj.material)[0].name : 'mesh'); out.stats = gd.stats();
    out.bricks = gd.group.children.filter((m) => m.geometry && m.geometry.attributes.position && m.geometry.attributes.position.count === 70).length; // the old brick solid had 70 vertices
    const imp = await RT.importFile(await window.__mkPng(512, 512, 62), { category: 'Pavement', name: 'test-slabs' }); if (ed.key === want) await ed.assign(imp.hash, 'map');
    const pm = MAT[want.slice(4)]; out.paveApplied = /^texstudio:/.test(pm.map && pm.map.name || '') && pm.map.image.width === 512;
    // joint grass: an instanced clump near the camera, picked (or selected from its mesh), edited as mat:paveGrass
    const gm = gd.group.children.find((m) => m.isInstancedMesh && m.material === MAT.paveGrass && m.count > 0); out.grassMeshes = gd.group.children.filter((m) => m.material === MAT.paveGrass).length; out.grassN = gm ? gm.count : 0;
    if (gm) { const M4 = new T3.Matrix4(); gm.getMatrixAt(0, M4); const c = new T3.Vector3().setFromMatrixPosition(M4); out.grassY = +(c.y - spot.y).toFixed(4);
      await window.__aimPick(ed, [c.x + 0.25, c.y + 0.3, c.z + 0.25], [c.x, c.y + 0.02, c.z]); out.grassPicked = ed.key === 'mat:paveGrass';
      if (!out.grassPicked) ed.select({ obj: gm, inst: 0, batch: null, idx: 0, point: c, dist: 0.4 });
      out.grassKey = ed.key; const gi = await RT.importFile(await window.__mkPng(64, 128, 63), { category: 'Vegetation', name: 'test-grass' }); if (ed.key === 'mat:paveGrass') await ed.assign(gi.hash, 'map');
      out.grassApplied = /^texstudio:/.test(MAT.paveGrass.map && MAT.paveGrass.map.name || '') && gm.material === MAT.paveGrass; }
    g.noRender = false; g.renderer.render(g.scene, ed.cam); g.noRender = true; const gl = g.renderer.getContext(); out.glErr = gl.getError();
    out.progErr = (g.renderer.info.programs || []).filter((pr) => pr.diagnostics && !pr.diagnostics.runnable).length;
    // SAVE TO GAME — dev server: texture-pack/ on disk, read back
    const sv = await ed.saveToGame(); out.save = sv && { where: sv.where, rules: sv.rules, textures: sv.textures, missing: sv.missing.length }; out.sum = RT.buildSummary().rules;
    const st = await (await fetch('/__colombo/textures', { cache: 'no-cache' })).json(); out.disk = ['mat:walk', 'mat:walkGrey', 'mat:paveGrass'].filter((k) => st.manifest.rules[k]); out.statusTxt = (ed.statusEl && ed.statusEl.textContent || '').slice(0, 160);
    out.button = [...document.querySelectorAll('.ed-win button')].some((b) => /💾 Save/.test(b.textContent));
    // SAVE TO GAME — no dev server: a picked folder (the origin-private file system stands in for showDirectoryPicker's handle)
    try { const root = await navigator.storage.getDirectory(); try { await root.removeEntry('texture-pack', { recursive: true }); } catch { /* none */ } const d = await root.getDirectoryHandle('texture-pack', { create: true });
      const w1 = await RT.writePackTo(d); const w2 = await RT.writePackTo(d); const names = []; for await (const [n] of d.entries()) names.push(n); const mf = JSON.parse(await (await (await d.getFileHandle('manifest.json')).getFile()).text());
      const bk = []; for await (const [n] of (await d.getDirectoryHandle('backups')).entries()) bk.push(n);
      out.dir = { w1: w1.wrote, missing: w1.missing.length, w2: w2.wrote, kept: w2.kept, files: names.filter((n) => /^[0-9a-f]+\./.test(n)).length, rules: Object.keys(mf.rules).length, backups: bk.length, lib: Object.keys(RT.S.manifest.textures).length };
      await root.removeEntry('texture-pack', { recursive: true }); } catch (e) { out.dir = { err: e.message }; }
    window.__T.p62 = { want, pave: imp.hash, grass: out.grassApplied };
    return out;
  }, (r) => { ok(!r.texOld && r.texNew && r.maps, '62nd: brick paver textures gone; 2 slab pavement textures (+ normal maps) and the joint-grass texture on their materials');
    ok(/type 1/.test(r.labels[0]) && /type 2/.test(r.labels[1]) && /grass/i.test(r.labels[2]), `62nd: pavement materials named for the Studio (${r.labels.join(' | ')})`);
    ok(!!r.spot, '62nd: a footpath found by the probe'); if (!r.spot) return;
    ok(r.bricks === 0 && !('walk' in (r.stats || {})) && !('walkGrey' in (r.stats || {})), `62nd: no modelled bricks in the ground detail (${JSON.stringify(r.stats)})`);
    ok(r.key === (r.spot.grey ? 'mat:walkGrey' : 'mat:walk') && r.hit0 === 'mesh', `62nd: clicking the footpath edits the pavement type itself (${r.key}, first hit ${r.hit0})`); ok(r.paveApplied, '62nd: pavement texture replaced');
    ok(r.grassMeshes >= 1 && r.grassN > 0 && r.grassY >= 0 && r.grassY < 0.01, `62nd: joint grass instanced on the footpath (${r.grassMeshes} mesh(es), ${r.grassN} clumps in one, root ${r.grassY} m above the slab)`);
    ok(r.grassKey === 'mat:paveGrass' && r.grassApplied, `62nd: joint grass is the shared, replaceable MAT.paveGrass (${r.grassPicked ? 'clicked in the world' : 'selected from its mesh'}), texture replaced`);
    ok(r.glErr === 0 && r.progErr === 0, `62nd: renders with the replaced pavement + grass (GL error ${r.glErr}, broken programs ${r.progErr})`);
    ok(r.save && r.save.where === 'folder' && r.save.rules === r.sum && r.save.missing === 0 && r.disk.length >= 2 && r.button, `62nd: 💾 Save → texture-pack/ (${JSON.stringify(r.save)}; on disk: ${r.disk.join(', ')})`);
    ok(r.dir && !r.dir.err && r.dir.w1 === r.dir.lib && r.dir.missing === 0 && r.dir.w2 === 0 && r.dir.kept === r.dir.lib && r.dir.files === r.dir.lib && r.dir.rules >= 2 && r.dir.backups === 1, `62nd: Save into a picked folder (no dev server): manifest + every texture, backup on re-save (${JSON.stringify(r.dir)})`); });

  await stage(p, 'library+pack', async () => {
    const ed = globalThis.__editors.textures, RT = window.__texRuntime; const out = {}; const { writeZip, readZip } = await import('/src/debug/TexPack.js');
    out.lib = Object.keys(RT.S.manifest.textures).length; out.assigned = RT.assignments(window.__T.building.hash).length; ed.libQ = 'test-2'; ed.renderRight(); out.tiles = ed.right.body.querySelectorAll('.ts-tile').length; ed.libQ = ''; ed.renderRight();
    let blocked = false; try { await RT.removeTexture(window.__T.building.hash); } catch { blocked = true; } out.deleteBlocked = blocked;
    const m = RT.exportManifest(true); const files = [{ name: 'manifest.json', data: new TextEncoder().encode(JSON.stringify(m)) }];
    for (const [hh, t] of Object.entries(m.textures)) { const bl = await RT.S.backend.getFile(hh + '.' + t.ext); files.push({ name: 'textures/' + hh + '.' + t.ext, data: new Uint8Array(await bl.arrayBuffer()) }); }
    const zip = writeZip(files); const back = await readZip(zip); out.zipFiles = back.size; out.zipBytes = zip.size;
    const fixed = new Map(); for (const [n, bl] of back) fixed.set(n.split('/').pop(), bl); const r = await RT.importManifest(JSON.parse(await back.get('manifest.json').text()), fixed, 'merge'); out.reimport = r;
    let bad = null; try { RT.sanitizeManifest({ format: 'colombo.texture-manifest', version: 99, rules: {}, textures: {} }); } catch (e) { bad = e.message; } out.newerRejected = !!bad;
    await RT.saveNow(); const st = await (await fetch('/__colombo/textures', { cache: 'no-cache' })).json(); out.diskRules = Object.keys(st.manifest.rules).length; out.diskFiles = st.files.length; out.memRules = Object.keys(RT.S.manifest.rules).length;
    out.gpuMB = +(RT.gpuBytes() / 1048576).toFixed(2); out.saveState = RT.S.saveState;
    return out;
  }, (r) => { ok(r.lib >= 5 && r.tiles === 1, `library search (${r.lib} textures, search → ${r.tiles} tile)`); ok(r.deleteBlocked, 'an assigned texture cannot be deleted from the library'); ok(r.zipFiles === r.lib + 1 && r.reimport.rules === r.memRules, `zip pack round trip (${r.zipFiles} files, ${(r.zipBytes / 1024).toFixed(0)} KB, ${r.reimport.rules} rules re-imported)`);
    ok(r.newerRejected, 'a manifest from a newer version is rejected'); ok(r.diskRules === r.memRules && r.diskFiles === r.lib && r.saveState === 'saved', `saved to texture-pack/ (${r.diskRules} rules, ${r.diskFiles} files)`); });

  await stage(p, 'restore', async () => {
    const ed = globalThis.__editors.textures, RT = window.__texRuntime; const { MAT } = await import('/src/gfx/Materials.js'); const out = {}; const k = window.__T.building.key; const m = MAT[k.slice(4)];
    const o = RT.originalOf(m).slots.map; await RT.setEnabled(false); out.offOrig = m.map === o; await RT.setEnabled(true); out.onAgain = /^texstudio:/.test(m.map.name);
    const n = await RT.restoreAll(); out.n = n; out.allOrig = m.map === o; await ed.undo(); out.undoBack = /^texstudio:/.test(m.map.name) && Object.keys(RT.S.manifest.rules).length === n;
    await RT.saveNow(); ed.close(); out.closed = !globalThis.__editors.textures && !window.__game.editorHook && !document.querySelector('.ed-win');
    return out;
  }, (r) => { ok(r.offOrig && r.onAgain, 'replacements off/on comparison'); ok(r.allOrig && r.undoBack, `restore all → originals; undo brings back all ${r.n}`); ok(r.closed, 'studio closes cleanly (gameplay gets the frame back)'); });

  const T = await p.evaluate(() => window.__T);
  { // 61st: what a production build ships (tools/vite/texturePack.mjs buildManifest): created materials, their users, object sizes, every texture they need
    const disk = JSON.parse(fs.readFileSync(PACK + 'manifest.json', 'utf8')); const out = buildManifest(disk); const U = T.u61 || {};
    const um = out.rules[U.uk]; const need = Object.values((um && um.slots) || {}).map((sr) => sr.tex).filter(Boolean);
    ok(!!um && out.rules['mat:lampPole'] && out.rules['mat:lampPole'].use === U.uk && out.rules[U.xk] && out.rules[U.xk].scale[0] === 1.5 && need.length >= 5 && need.every((hh) => out.textures[hh] && !out.textures[hh].thumb),
      `production pack keeps the created material (${need.length} maps), its users and the object size`); }
  { // 62nd: build-exe.bat's tools/texture-pack-prep.mjs — a Studio pack .zip dropped into texture-pack/ is unpacked and counted
    const { prep } = await import('./texture-pack-prep.mjs'); const os = await import('node:os'); const path = await import('node:path'); const { writeZip } = await import('../src/debug/TexPack.js');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tpk-')); const disk = JSON.parse(fs.readFileSync(PACK + 'manifest.json', 'utf8')); const files = [{ name: 'manifest.json', data: new TextEncoder().encode(JSON.stringify(disk)) }];
    for (const [hh, t] of Object.entries(disk.textures)) files.push({ name: 'textures/' + hh + '.' + t.ext, data: new Uint8Array(fs.readFileSync(PACK + hh + '.' + t.ext)) });
    fs.writeFileSync(path.join(tmp, 'colombo-texture-pack.zip'), Buffer.from(await writeZip(files).arrayBuffer())); const r = prep(tmp); const want = buildManifest(disk);
    ok(r.unpacked && r.rules === Object.keys(want.rules).length && r.textures === Object.keys(want.textures).length && !r.missing.length && fs.existsSync(path.join(tmp, 'manifest.json')), `62nd: build-exe.bat pack prep unpacks a dropped pack zip (${r.rules} rules, ${r.textures} textures, ${r.missing.length} missing)`);
    const r2 = prep(tmp); ok(!r2.unpacked && r2.rules === r.rules, '62nd: pack prep leaves an already-unpacked folder alone'); fs.rmSync(tmp, { recursive: true, force: true }); }
  // ---------------------------------------------------------------------------- restart
  const p2 = await b.newPage(); p2.on('pageerror', (e) => errs.push(String(e.stack || e).split('\n').slice(0, 3).join(' | ')));
  await p2.evaluateOnNewDocument(() => { localStorage.setItem('colombo.settings.v1', JSON.stringify({ quality: 'low', showFps: false })); }); await p2.evaluateOnNewDocument(HELPERS);
  await p.close(); await boot(p2);
  await stage(p2, 'after restart', async (T) => {
    const g = window.__game, RT = window.__texRuntime; g.noRender = true; const out = {}; out.runtime = !!RT; if (!RT) return out; await g.stepSim(4, 0.05); RT.scan(); await new Promise((r) => setTimeout(r, 1500)); RT.scan(); await new Promise((r) => setTimeout(r, 500));
    const { MAT } = await import('/src/gfx/Materials.js'); const mb = MAT[T.building.key.slice(4)]; out.building = /^texstudio:/.test(mb.map?.name || '') && mb.map.image.width === T.building.w && Math.abs(mb.map.repeat.x - T.building.rep) < 1e-6 && Math.abs(mb.roughness - 0.37) < 1e-6;
    const mr = RT.materialsFor(T.road.key)[0]; out.road = !!mr && /^texstudio:/.test(mr.map?.name || '') && /^texstudio:/.test(mr.normalMap?.name || '');
    // a vehicle of the edited type spawned after the restart gets the replacement too
    const P = g.player; let v = null; try { g.debugCon.exec('spawn car ' + T.veh.type); v = [...g.traffic.vehicles, ...(g.traffic.parked || [])].filter((q) => q.type === T.veh.type).sort((a, c) => Math.hypot(a.x - P.x, a.z - P.z) - Math.hypot(c.x - P.x, c.z - P.z))[0]; } catch (e) { out.spawnErr = e.message; }
    RT.scan(); await new Promise((r) => setTimeout(r, 800)); let paint = null; if (v) v.mesh.traverse((o) => { if (!paint && o.isMesh && o.name === 'paint') paint = [].concat(o.material)[0]; });
    out.vehicle = !!paint && /^texstudio:/.test(paint.map?.name || '') && Math.abs(paint.metalness - 0.55) < 1e-6;
    const om = RT.materialsFor(T.prop.key)[0]; out.prop = !!om && /^texstudio:/.test(om.map?.name || '') && om.userData.__tsKey === T.prop.key;
    const U = T.u61; const { ensureMat } = await import('/src/gfx/Materials.js'); const lp = ensureMat('lampPole');
    out.u61 = /^texstudio:/.test(lp.map?.name || '') && !!lp.bumpMap && !!lp.displacementMap && lp.color.getHexString() === 'ff8800' && Math.abs(lp.map.repeat.x - U.lpRep) < 1e-6 && Math.abs(lp.displacementScale - 0.03) < 1e-6 && !!om && !!om.bumpMap && om.color.getHexString() === 'ff8800';
    const xs = RT.xfState(U.xk); out.xf = !!xs && Math.abs(xs.obj.scale.x - U.s0[0] * 1.5) < 1e-6;
    if (T.pool) { const ps = RT.xfState(T.pool.k); const T3 = window.__THREE; if (ps && ps.part) { const m = new T3.Matrix4().fromArray(ps.part.mat, ps.local * 16); const sc = new T3.Vector3(); m.decompose(new T3.Vector3(), new T3.Quaternion(), sc); out.pool = Math.abs(sc.x - T.pool.sx * 2) < 1e-4; } else out.pool = 'no state'; }
    if (T.p62) { out.p62 = /^texstudio:/.test(MAT[T.p62.want.slice(4)].map?.name || '') && (!T.p62.grass || /^texstudio:/.test(MAT.paveGrass.map?.name || '')); }
    out.rules = Object.keys(RT.S.manifest.rules).length; out.errors = [...RT.S.errors.entries()];
    return out;
  }, (r) => { ok(r.runtime, 'after a restart the texture runtime loads by itself (texture-pack/manifest.json has rules)'); ok(r.building, 'building facade replacement back after restart (texture, 512 px, tiling, roughness)'); ok(r.road, 'road base colour + normal map back after restart');
    ok(r.vehicle, 'vehicle: a car of that type spawned after the restart gets the paint texture + metalness' + (r.spawnErr ? ' (' + r.spawnErr + ')' : '')); ok(r.prop, 'unique prop copy recreated on the same object after restart'); ok(r.u61, '61st: created material (texture set, colour, bump) on the lamp poles and the prop, the lamp poles\' displacement + linked texture size — all back after restart'); ok(r.xf, '61st: the prop\'s object size (×1.5) back after restart'); ok(r.pool === true, '61st: the street prop\'s size (×2) back after restart (' + r.pool + ')'); ok(r.p62 === true, '62nd: the pavement and joint-grass replacements back after restart'); ok(!r.errors.length, 'no apply errors ' + JSON.stringify(r.errors)); }, T);

  await stage(p2, 'reopen + clean', async () => {
    const g = window.__game; const { openTextureStudio } = await import('/src/debug/boot.js'); const ed = await openTextureStudio(g); const RT = window.__texRuntime; const out = {};
    out.libAfter = Object.keys(RT.S.manifest.textures).length; out.rulesAfter = Object.keys(RT.S.manifest.rules).length; await RT.restoreAll(); await RT.saveNow(); ed.close();
    const st = await (await fetch('/__colombo/textures', { cache: 'no-cache' })).json(); out.diskRules = Object.keys(st.manifest.rules).length; return out;
  }, (r) => { ok(r.libAfter >= 5 && r.rulesAfter >= 4, `studio re-opens with the saved library (${r.libAfter}) and rules (${r.rulesAfter})`); ok(r.diskRules === 0, 'cleanup: rules restored and saved'); });

  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 4).join(' || ') : ''));
} catch (e) { ok(false, 'test crashed: ' + String((e && e.stack) || e).split('\n').slice(0, 4).join(' | ')); } finally {
  await b.close().catch(() => {});
  const backups = fs.existsSync(PACK + 'backups') ? fs.readdirSync(PACK + 'backups').length : 0; console.log('manifest backups written during the test:', backups);
  fs.rmSync(PACK, { recursive: true, force: true }); if (fs.existsSync(ASIDE)) fs.renameSync(ASIDE, PACK); else fs.mkdirSync(PACK, { recursive: true });
  console.log(fails ? `${fails} FAILED` : 'all passed'); process.exit(fails ? 1 : 0);
}
