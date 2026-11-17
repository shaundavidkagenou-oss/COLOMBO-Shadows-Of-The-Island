// 59th — Texture Studio end-to-end (headless Chromium + the dev server, which provides the project-folder storage):
// opens the Studio from the pause menu, picks a real BUILDING facade, a ROAD, a VEHICLE and a PROP by raycasting the screen,
// imports generated PNGs into the library (content hash, dedupe, 1024 px → 512 px GPU copy), replaces textures and
// material settings in place (shared material objects and shader patches kept, originals untouched), tiling / colour /
// undo / redo / restore, "Make unique" on one prop, a zip pack round trip, saves to texture-pack/, then RELOADS the game
// and checks that every replacement is back (including a vehicle spawned after the restart).
// texture-pack/ is moved aside during the test and put back afterwards (the user's own work is never touched).
//   node tools/texture-studio-test.mjs        PORT env (default 5199) — needs `npm run dev`-style server on that port
import fs from 'node:fs';
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
    out.rules = Object.keys(RT.S.manifest.rules).length; out.errors = [...RT.S.errors.entries()];
    return out;
  }, (r) => { ok(r.runtime, 'after a restart the texture runtime loads by itself (texture-pack/manifest.json has rules)'); ok(r.building, 'building facade replacement back after restart (texture, 512 px, tiling, roughness)'); ok(r.road, 'road base colour + normal map back after restart');
    ok(r.vehicle, 'vehicle: a car of that type spawned after the restart gets the paint texture + metalness' + (r.spawnErr ? ' (' + r.spawnErr + ')' : '')); ok(r.prop, 'unique prop copy recreated on the same object after restart'); ok(!r.errors.length, 'no apply errors ' + JSON.stringify(r.errors)); }, T);

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
