// 60th — own materials per part, end to end (headless Chromium + the dev server's project-folder storage):
//   • a click on a generated building finds the PART (facade wall / window frame / surround / roof / compound wall) and offers
//     "every building" / "only building #id" / base material;
//   • a per-building facade texture changes that ONE building: the others with the same facade keep theirs, and the building's
//     own painted windows keep the original window art (facade window layer, InteriorMapping.js);
//   • tile roofs: world-scale planar UVs (one repeat per 4 m, rows level with every eave, no shear) on hip AND gable roofs;
//   • a photo texture on the street-lamp poles is shown as the picture (per-object tint off, metalness lowered — not black),
//     also for rules saved before the 60th;
//   • lamp poles, compound walls, porch floors, parapets each have their own material (concrete split by use);
//   • save → reload: the per-building material is split before the city is generated and comes back with its texture.
// Screenshots: dev/ref/60-*.png.  texture-pack/ is moved aside during the test and put back afterwards.
//   node tools/material-split-test.mjs        PORT env (default 5199) — needs the dev server on that port
import fs from 'node:fs';
import puppeteer from '/home/user/testenv/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
import chromium from '/home/user/testenv/node_modules/@sparticuz/chromium/build/index.js';
const ROOT = new URL('../', import.meta.url).pathname; const PACK = ROOT + 'texture-pack/'; const ASIDE = ROOT + 'texture-pack.test-aside';
const SHOTS = process.env.SHOTS !== '0';
if (fs.existsSync(ASIDE)) throw new Error(ASIDE + ' exists — a previous run did not finish; move it back to texture-pack/ first');
if (fs.existsSync(PACK)) fs.renameSync(PACK, ASIDE); fs.mkdirSync(PACK, { recursive: true }); if (fs.existsSync(ASIDE + '/README.md')) fs.copyFileSync(ASIDE + '/README.md', PACK + 'README.md');
const b = await puppeteer.launch({ executablePath: await chromium.executablePath(), headless: true, protocolTimeout: 1800000, args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'], defaultViewport: { width: 1280, height: 720 } });
let fails = 0, oks = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (c) oks++; else fails++; };
const stage = async (p, name, fn, checks, arg) => { let r; try { r = await p.evaluate(fn, arg); console.log(name, JSON.stringify(r).slice(0, 1600)); } catch (e) { ok(false, `${name}: ${String(e.message || e).split('\n').slice(0, 3).join(' | ')}`); return null; } try { checks(r); } catch (e) { ok(false, name + ' checks: ' + e.message); } return r; };
const URL0 = 'http://localhost:' + (process.env.PORT || 5199) + '/?test&quick=play';
async function boot(p) {
  await p.goto(URL0, { waitUntil: 'domcontentloaded', timeout: 300000 });
  await p.waitForFunction(() => window.__game && window.__game.stepSim && window.__game.mode === 'play', { timeout: 900000, polling: 1000 });
}
const HELPERS = () => {
  window.__T = window.__T || {};
  // test images: a checker with a label, and a terracotta tile photo stand-in (horizontal courses: shows how a roof is mapped)
  window.__png = async (c, name) => { const blob = await new Promise((r) => c.toBlob(r, 'image/png')); return new File([blob], name, { type: 'image/png' }); };
  window.__mkPng = async (w, hh, seed) => { const c = document.createElement('canvas'); c.width = w; c.height = hh; const g = c.getContext('2d'); const hue = (seed * 67) % 360; g.fillStyle = `hsl(${hue},55%,45%)`; g.fillRect(0, 0, w, hh); g.fillStyle = `hsl(${(hue + 180) % 360},60%,70%)`; for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) if ((i + j) % 2) g.fillRect((i * w) / 8, (j * hh) / 8, w / 8, hh / 8); g.fillStyle = '#fff'; g.font = `bold ${w / 6}px sans-serif`; g.fillText('T' + seed, w / 8, hh / 2); return window.__png(c, 'test-' + seed + '.png'); };
  window.__mkTiles = async () => { const c = document.createElement('canvas'); c.width = c.height = 512; const g = c.getContext('2d'); g.fillStyle = '#5a2414'; g.fillRect(0, 0, 512, 512);
    for (let r = 0; r < 8; r++) for (let k = -1; k < 9; k++) { const x = k * 64 + (r % 2) * 32, y = r * 64; const gr = g.createLinearGradient(x, 0, x + 64, 0); const t = 0.85 + 0.15 * Math.sin(r * 7 + k * 3); gr.addColorStop(0, `rgb(${120 * t | 0},${46 * t | 0},${26 * t | 0})`); gr.addColorStop(0.5, `rgb(${196 * t | 0},${86 * t | 0},${52 * t | 0})`); gr.addColorStop(1, `rgb(${110 * t | 0},${42 * t | 0},${24 * t | 0})`); g.fillStyle = gr; g.beginPath(); g.moveTo(x + 3, y + 4); g.lineTo(x + 61, y + 4); g.lineTo(x + 61, y + 58); g.quadraticCurveTo(x + 32, y + 66, x + 3, y + 58); g.closePath(); g.fill(); }
    return window.__png(c, 'red-tiles.png'); };
  window.__aimPick = async (ed, from, at, sx = 0.5, sy = 0.5) => { ed.pos.set(from[0], from[1], from[2]); const v = { x: at[0] - from[0], y: at[1] - from[1], z: at[2] - from[2] }; const L = Math.hypot(v.x, v.y, v.z); ed.yaw = Math.atan2(-v.x, -v.z); ed.pitch = Math.asin(v.y / L);
    const g = window.__game; g.world.warm(at[0], at[2]); for (let i = 0; i < 6; i++) ed.tick(0.05); g.scene.updateMatrixWorld(true); const r = ed.cv.getBoundingClientRect(); ed.pick(r.left + r.width * sx, r.top + r.height * sy, false); return ed.hits; };
  window.__drawers = (m) => { let n = 0; window.__game.scene.traverse((o) => { if (o.material === m) n++; }); return n; };
};
const shot = async (p, name) => { if (!SHOTS) return; await p.evaluate(async () => { const ed = globalThis.__editors.textures; for (let i = 0; i < 4; i++) ed.tick(0.05); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); }); await p.screenshot({ path: ROOT + 'dev/ref/' + name }); console.log('shot dev/ref/' + name); };

try {
  const p = await b.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e.stack || e).split('\n').slice(0, 3).join(' | ')));
  p.on('console', (m) => { const t = m.text(); if (/window layer patch|\[texture studio\].*(fail|error)/i.test(t)) errs.push(t.slice(0, 300)); });
  await p.evaluateOnNewDocument(() => { localStorage.setItem('colombo.settings.v1', JSON.stringify({ quality: 'high', showFps: false })); localStorage.removeItem('colombo.texstudio.settings'); });
  await p.evaluateOnNewDocument(HELPERS);
  await boot(p);

  await stage(p, 'open', async () => {
    const g = window.__game; await g.stepSim(10, 0.05); g.openPause(); await new Promise((r) => setTimeout(r, 300));
    const btn = [...document.querySelectorAll('.screen.pause .menu-btn')].find((x) => x.textContent === 'Texture Studio'); if (btn) btn.click();
    for (let i = 0; i < 100 && !(globalThis.__editors && globalThis.__editors.textures); i++) await new Promise((r) => setTimeout(r, 100));
    const M = await import('/src/gfx/Materials.js');
    // concrete split by use + street parts: their own material objects (same look, separately editable)
    const own = ['compoundWall', 'wallCoping', 'porchFloor', 'bldParapet', 'bldPlinth', 'winSurround', 'lampPole', 'utilityPole', 'manholeCover', 'signPost', 'bench'].map((k) => [k, M.ensureMat(k)]);
    return { open: !!globalThis.__editors.textures, distinct: own.every(([k, m]) => m && m !== M.MAT[M.parentKey(k)]) && new Set(own.map(([, m]) => m)).size === own.length,
      concreteOwn: own.filter(([k]) => M.parentKey(k) === 'concrete').map(([k]) => k), lampDrawn: window.__drawers(M.MAT.lampPole), leavesShared: !M.splittable('leaves@b1') };
  }, (r) => { ok(r.open, 'Texture Studio opens'); ok(r.distinct, `each part kind has its own material (concrete: ${r.concreteOwn.join(', ')})`); ok(r.lampDrawn > 0, `street lamp poles are drawn with their own material (${r.lampDrawn} draw objects)`); ok(r.leavesShared, 'leaves stay one universal material'); });

  const B = await stage(p, 'building parts', async () => {
    const g = window.__game, ed = globalThis.__editors.textures, RT = window.__texRuntime, P = g.player, L = window.__L; const out = {};
    const M = await import('/src/gfx/Materials.js'); const { plan } = await import('/src/world/CityPlan.js');
    // a building with windows near the player, seen from outside; its facade style must be shared by other buildings
    const cands = plan.buildings.filter((q) => q.totalH > 8 && q.totalH < 30 && Math.hypot((q.x0 + q.x1) / 2 - P.x, (q.z0 + q.z1) / 2 - P.z) < 200).slice(0, 30);
    let bd = null, view = null;
    for (const q of cands) { const cx = (q.x0 + q.x1) / 2, cz = (q.z0 + q.z1) / 2, gy = L.groundY(cx, cz), y = gy + Math.min(q.totalH * 0.5, 7);
      for (const [fx, fz] of [[cx, q.z1 + 11], [cx, q.z0 - 11], [q.x1 + 11, cz], [q.x0 - 11, cz]]) { await window.__aimPick(ed, [fx, y, fz], [cx, y, cz]); if (ed.part && ed.part.building === q && /^f_/.test(ed.part.tag || '')) { bd = q; view = [[fx, y, fz], [cx, y, cz]]; break; } }
      if (bd) break; }
    out.found = !!bd; if (!bd) return out;
    out.building = bd.id; out.tag = ed.part.tag; out.opts = ed.partOptions(ed.part).map((o) => o.k); out.autoKey = ed.key; out.partUi = /Part/.test(ed.left.body.textContent);
    // every part on this side of the building: a grid of clicks over the screen
    const tags = new Set(); for (let i = 0; i <= 10; i++) for (let j = 0; j <= 8; j++) { await window.__aimPick(ed, view[0], view[1], 0.1 + 0.8 * i / 10, 0.1 + 0.8 * j / 8); if (ed.part && ed.part.tag) tags.add(ed.part.tag); }
    out.tags = [...tags];
    window.__T.b = { id: bd.id, tag: out.tag, view, style: bd.style };
    return out;
  }, (r) => { ok(r.found, `a generated building's facade picked as a part (b:${r.building}, ${r.tag})`); if (!r.found) return;
    ok(r.opts && r.opts.includes(r.tag) && r.opts.includes(r.tag.replace(/@b\d+$/, '')), `part options: every building / only this building (${(r.opts || []).join(' | ')})`); ok(r.partUi, 'the Part section is shown');
    ok(r.tags.some((t) => /^win(Frame|Surround|Glass|Shutter|Grill)@b/.test(t)), `window parts are their own parts (${r.tags.filter((t) => /^win/.test(t)).join(', ')})`); });

  if (B && B.found) await stage(p, 'per-building wall', async () => {
    const g = window.__game, ed = globalThis.__editors.textures, RT = window.__texRuntime, T = window.__T.b; const out = {};
    const M = await import('/src/gfx/Materials.js'); const base = T.tag.replace(/@b\d+$/, ''); const baseM = M.MAT[base]; const origMap = baseM.map;
    await window.__aimPick(ed, T.view[0], T.view[1]); out.reTag = ed.part && ed.part.tag; ed.choosePart(T.tag);
    out.key = ed.key; out.label = M.materialLabel(T.tag);
    const imp = await RT.importFile(await window.__mkPng(512, 512, 7), { category: 'Building' }); await ed.assign(imp.hash, 'map');
    const own = M.MAT[T.tag]; out.own = !!own && own !== baseM; out.ownDrawn = window.__drawers(own); out.ownMap = /^texstudio:/.test(own.map && own.map.name || '');
    out.baseUntouched = baseM.map === origMap && !/^texstudio:/.test(baseM.map.name || ''); out.baseDrawn = window.__drawers(baseM); // other buildings with this facade
    const W = M.facadeWindowLayer(own); out.winLayer = !!W && W.uWinMap.value === origMap && own.map !== W.uWinMap.value; out.patch = own.onBeforeCompile === baseM.onBeforeCompile;
    window.__T.wall = { key: T.tag, hash: imp.hash }; out.err = RT.S.errors.get(ed.key) || null;
    return out;
  }, (r) => { ok(r.key === 'mat:' + B.tag && r.own && r.ownDrawn > 0 && r.ownMap, `"Only building #${B.building}": its facade gets its own material + the new texture (${r.label}, ${r.ownDrawn} draw objects)`);
    ok(r.baseUntouched && r.baseDrawn > 0, `the other buildings with the same facade keep the original texture (${r.baseDrawn} draw objects)`);
    ok(r.winLayer && r.patch, "the building's painted windows keep the original window art (window layer reads the original facade map)"); ok(!r.err, 'no texture errors'); });
  if (B && B.found) await shot(p, '60-per-building-wall.png');

  if (B && B.found) await stage(p, 'window parts', async () => {
    const ed = globalThis.__editors.textures, RT = window.__texRuntime, T = window.__T.b; const out = {}; const M = await import('/src/gfx/Materials.js');
    // find a window frame / surround by clicking over the facade, give THIS building's surrounds their own texture
    let tag = null; for (let i = 0; i <= 10 && !tag; i++) for (let j = 0; j <= 8 && !tag; j++) { await window.__aimPick(ed, T.view[0], T.view[1], 0.1 + 0.8 * i / 10, 0.1 + 0.8 * j / 8); const t = ed.part && ed.part.tag; if (t && /^win(Surround|Frame)@b/.test(t)) tag = t; }
    out.tag = tag; if (!tag) return out; const role = tag.replace(/@b\d+$/, '');
    out.opts = ed.partOptions(ed.part).map((o) => o.k); ed.choosePart(tag); out.key = ed.key;
    const imp = await RT.importFile(await window.__mkPng(256, 256, 8), { category: 'Building' }); await ed.assign(imp.hash, 'map');
    const own = M.MAT[tag]; out.ownDrawn = window.__drawers(own); out.ownMap = /^texstudio:/.test(own.map && own.map.name || ''); out.roleUntouched = !M.MAT[role].map || !/^texstudio:/.test(M.MAT[role].map.name || '');
    out.wallStill = /^texstudio:/.test(M.MAT[T.tag].map.name || ''); // the wall edit is not touched by the window edit
    out.parentUntouched = !/^texstudio:/.test((M.MAT[M.parentKey(role)].map || {}).name || '');
    window.__T.win = { key: tag };
    return out;
  }, (r) => { ok(!!r.tag, `a window part of that building clicked (${r.tag})`); if (!r.tag) return; ok(r.ownDrawn > 0 && r.ownMap, `its window ${/Surround/.test(r.tag) ? 'surrounds' : 'frames'} get their own texture (${r.key})`); ok(r.roleUntouched && r.parentUntouched, "other buildings' windows + the base paint/concrete untouched"); ok(r.wallStill, 'walls and windows are edited independently'); });

  await stage(p, 'roof uvs', async () => {
    const out = {}; const { plan } = await import('/src/world/CityPlan.js'); const { MultiBuilder } = await import('/src/gfx/MeshBuilder.js'); const { buildBase } = await import('/src/world/BuildingGen.js');
    // UV gradient per triangle: |grad u| = |grad v| = 0.25 / m, perpendicular (no shear), u level along the eave (horizontal)
    const check = (geo) => { const P = geo.attributes.position.array, U = geo.attributes.uv.array, I = geo.index.array; let n = 0, bad = 0, worst = 0;
      for (let t = 0; t < I.length; t += 3) { const [a, b2, c] = [I[t], I[t + 1], I[t + 2]]; const e1 = [P[b2 * 3] - P[a * 3], P[b2 * 3 + 1] - P[a * 3 + 1], P[b2 * 3 + 2] - P[a * 3 + 2]], e2 = [P[c * 3] - P[a * 3], P[c * 3 + 1] - P[a * 3 + 1], P[c * 3 + 2] - P[a * 3 + 2]];
        const du1 = U[b2 * 2] - U[a * 2], dv1 = U[b2 * 2 + 1] - U[a * 2 + 1], du2 = U[c * 2] - U[a * 2], dv2 = U[c * 2 + 1] - U[a * 2 + 1];
        const nrm = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]]; const nl = Math.hypot(...nrm); if (nl < 1e-6 || Math.abs(nrm[1] / nl) < 0.05 || nrm[1] < 0) continue; // sloped, up-facing faces (no soffits)
        // solve grad u, grad v in the triangle plane: dX = du * Tu + dv * Tv  ->  T = inverse of the uv jacobian
        const det = du1 * dv2 - du2 * dv1; if (Math.abs(det) < 1e-9) { bad++; continue; }
        const Tu = e1.map((x, i) => (x * dv2 - e2[i] * dv1) / det), Tv = e1.map((x, i) => (e2[i] * du1 - x * du2) / det); // metres per 1 u / 1 v
        const lu = Math.hypot(...Tu), lv = Math.hypot(...Tv), cos = Math.abs(Tu[0] * Tv[0] + Tu[1] * Tv[1] + Tu[2] * Tv[2]) / (lu * lv);
        const err = Math.max(Math.abs(lu - 4) / 4, Math.abs(lv - 4) / 4, cos, Math.abs(Tu[1]) / lu); worst = Math.max(worst, err); n++; if (err > 0.02) bad++; }
      return { n, bad, worst: +worst.toFixed(4) }; };
    for (const [kind, mat] of [['tile', 'roofTiles'], ['corrugated', 'corrugated']]) { const bs = plan.buildings.filter((q) => q.roof === kind).slice(0, 25); let agg = { n: 0, bad: 0, worst: 0, bld: bs.length };
      for (const q of bs) { const keep = { s: q._signSpans && q._signSpans.slice(), i: q.signIdx }; const mb = new MultiBuilder(null, { raw: true }); try { buildBase(q, mb); } finally { q._signSpans = keep.s; q.signIdx = keep.i; } const B = mb.b.get(mat + '@b' + q.id); if (!B) continue; const geo = B.build(); if (!geo) continue; const c = check(geo); agg.n += c.n; agg.bad += c.bad; agg.worst = Math.max(agg.worst, c.worst); }
      out[kind] = agg; }
    const t = plan.buildings.find((q) => q.roof === 'tile'); window.__T.roof = t && { id: t.id, x: (t.x0 + t.x1) / 2, z: (t.z0 + t.z1) / 2, w: t.x1 - t.x0, d: t.z1 - t.z0, h: t.totalH };
    return out;
  }, (r) => { ok(r.tile.n > 0 && r.tile.bad === 0, `tile roofs (hip): every slope + hip end mapped at 4 m per repeat, no shear, courses level with the eave (${r.tile.n} faces on ${r.tile.bld} buildings, worst error ${r.tile.worst})`); ok(r.corrugated.n > 0 && r.corrugated.bad === 0, `gable roofs (corrugated): same world-scale mapping (${r.corrugated.n} faces, worst ${r.corrugated.worst})`); });

  await stage(p, 'roof texture', async () => {
    const g = window.__game, ed = globalThis.__editors.textures, RT = window.__texRuntime, L = window.__L, T = window.__T.roof; const out = {}; if (!T) return out;
    const M = await import('/src/gfx/Materials.js'); const gy = L.groundY(T.x, T.z), top = gy + T.h; const s = Math.max(T.w, T.d);
    let hit = false; for (const [dx, dz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) { await window.__aimPick(ed, [T.x + dx * s * 0.9, top + s * 0.75, T.z + dz * s * 0.9], [T.x, top + 1, T.z]); if (ed.part && /^roofTiles/.test(ed.part.tag || '')) { hit = true; break; } }
    out.hit = hit; out.tag = ed.part && ed.part.tag; if (!hit) return out; out.opts = ed.partOptions(ed.part).map((o) => o.k);
    ed.choosePart(ed.part.tag); const imp = await RT.importFile(await window.__mkTiles(), { category: 'Roof' }); await ed.assign(imp.hash, 'map');
    const own = M.MAT[ed.part.tag]; out.ownDrawn = window.__drawers(own); out.applied = /^texstudio:/.test(own.map && own.map.name || ''); out.baseUntouched = !/^texstudio:/.test(M.MAT.roofTiles.map.name || '');
    return out;
  }, (r) => { ok(r.hit, `a tile roof clicked as its own part (${r.tag})`); if (!r.hit) return; ok(r.ownDrawn > 0 && r.applied && r.baseUntouched, 'a red-tile texture applied to that roof only'); });
  await shot(p, '60-tile-roof.png');

  await stage(p, 'lamp pole', async () => {
    const g = window.__game, ed = globalThis.__editors.textures, RT = window.__texRuntime, P = g.player, T3 = window.__THREE; const out = {}; const M = await import('/src/gfx/Materials.js');
    const pole = M.MAT.lampPole; let mesh = null; g.scene.traverse((o) => { if (!mesh && o.isInstancedMesh && o.material === pole && o.count > 0) mesh = o; });
    out.found = !!mesh; if (!mesh) return out; const m4 = new T3.Matrix4(), v = new T3.Vector3(); let best = null, bd = 1e9;
    for (let i = 0; i < mesh.count; i++) { mesh.getMatrixAt(i, m4); v.setFromMatrixPosition(m4).applyMatrix4(mesh.matrixWorld); const d = Math.hypot(v.x - P.x, v.z - P.z); if (d < bd) { bd = d; best = v.clone(); } }
    let hit = null; for (const [dx, dz] of [[2.6, 1.2], [-2.6, 1.2], [1.2, -2.6], [-1.2, 2.6]]) { const hs = await window.__aimPick(ed, [best.x + dx, best.y + 2.4, best.z + dz], [best.x, best.y + 2.2, best.z]); hit = hs.find((h) => h.obj.material === pole && h === hs[0]); if (hit) break; }
    out.picked = !!hit; if (!hit) return out; ed.select(hit); out.key = ed.key; const before = { vc: pole.vertexColors, metal: pole.metalness };
    const imp = await RT.importFile(await window.__mkPng(256, 512, 9), { category: 'Prop' }); await ed.assign(imp.hash, 'map');
    out.before = before; out.after = { vc: pole.vertexColors, metal: pole.metalness, rough: pole.roughness }; out.applied = /^texstudio:/.test(pole.map && pole.map.name || '');
    out.metalUntouched = !M.MAT.metal.map && M.MAT.metal.vertexColors === true; // the shared metal (railings, rooftop plant…) is not affected
    // what the pole looks like: mean brightness of the picked pixels around the screen centre (a black pole reads ~0)
    window.__T.lampHash = imp.hash;
    return out;
  }, (r) => { ok(r.found && r.picked, `a street lamp pole clicked (${r.key})`); if (!r.picked) return; ok(r.key === 'mat:lampPole', 'lamp poles have their own material (not the shared metal)');
    ok(r.applied && r.after.vc === false && r.after.metal <= 0.3 + 1e-6, `texture shown as the picture: per-object tint off, metalness ${r.before.metal} → ${r.after.metal} (was: black)`); ok(r.metalUntouched, 'the shared metal material is untouched'); });
  await shot(p, '60-lamp-pole.png');

  await stage(p, 'landmark site', async () => {
    const g = window.__game, ed = globalThis.__editors.textures, RT = window.__texRuntime, T3 = window.__THREE; const out = {}; const M = await import('/src/gfx/Materials.js');
    const lm = g.scene.getObjectByName('landmarks'); const count = () => { let n = 0; lm.traverse((o) => { if (o.isMesh && o.visible) n++; }); return n; }; out.meshes0 = count();
    // a merged landmark mesh (one per material for every site) and one site's part of it
    const live = []; lm.traverse((o) => { if (o.isMesh && o.userData.segs && new Set(o.userData.segs.map((x) => x[0])).size > 2) live.push(o); });
    out.live = live.length; let found = null;
    for (const m of live) { const P = m.geometry.attributes.position, N = m.geometry.attributes.normal, I = m.geometry.index.array; m.updateMatrixWorld(true);
      for (const sg of m.userData.segs) { if (/Fort Railway|Port cranes/.test(sg[0]) || sg[2] < 300) continue;
        for (let k = 0; k < 6 && !found; k++) { const f = sg[1] + 3 * Math.floor((sg[2] / 3) * (k + 0.5) / 6); const c = new T3.Vector3(), n = new T3.Vector3(); for (let j = 0; j < 3; j++) { c.add(new T3.Vector3().fromBufferAttribute(P, I[f + j])); n.add(new T3.Vector3().fromBufferAttribute(N, I[f + j])); } c.multiplyScalar(1 / 3).applyMatrix4(m.matrixWorld); n.normalize();
          const from = c.clone().addScaledVector(n, 7).add(new T3.Vector3(0, 0.5, 0)); await window.__aimPick(ed, from.toArray(), c.toArray()); if (ed.part && ed.part.tag === sg[0] && ed.hits[0] && ed.hits[0].obj === m) found = { m, tag: sg[0] }; }
        if (found) break; }
      if (found) break; }
    out.found = !!found; if (!found) return out; const tag = found.tag, base = M.parentKey(tag); out.tag = tag; out.key = ed.key; out.opts = ed.partOptions(ed.part).map((o) => o.k);
    out.meshes0 = count(); const baseMap = M.MAT[base].map; const imp = await RT.importFile(await window.__mkPng(256, 256, 11), { category: 'Building' }); await ed.assign(imp.hash, 'map');
    out.meshes1 = count(); const own = M.MAT[tag]; out.ownDrawn = window.__drawers(own); out.applied = /^texstudio:/.test(own.map && own.map.name || ''); out.baseUntouched = M.MAT[base].map === baseMap;
    out.mergedKeepsOthers = found.m.visible && found.m.userData.segs.every((x) => x[0] !== tag) && found.m.userData.segs.length > 0;
    return out;
  }, (r) => { ok(r.found, `a landmark site's part clicked inside the merged landmark mesh (${r.tag}; ${r.live} merged meshes hold several sites)`); if (!r.found) return;
    ok(r.key === 'mat:' + r.tag && r.opts[0] === r.tag, `it is edited as that site's own material by default (${r.opts.join(' | ')})`);
    ok(r.ownDrawn === 1 && r.applied && r.baseUntouched && r.mergedKeepsOthers, 'only that site changes: its triangles move to a mesh of their own, the other sites stay merged on the base material');
    ok(r.meshes1 === r.meshes0 + 1, `exactly one extra draw for the split (${r.meshes0} → ${r.meshes1} landmark meshes)`); });
  await shot(p, '60-landmark-site.png');

  await stage(p, 'legacy rule', async () => {
    const RT = window.__texRuntime; const M = await import('/src/gfx/Materials.js'); const out = {};
    // a pre-60th rule: only a colour texture on a plain vertex-coloured material (no settings) → shown as the picture
    const r = RT.newRule('mat:bark', 'bark', null); r.slots.map = { tex: window.__T.lampHash }; await RT.setRule('mat:bark', r, { label: 'legacy' });
    out.vc = M.MAT.bark.vertexColors; out.applied = /^texstudio:/.test(M.MAT.bark.map && M.MAT.bark.map.name || ''); out.ruleProps = RT.getRule('mat:bark').props;
    await RT.setRule('mat:bark', null, { label: 'remove' }); out.restored = M.MAT.bark.vertexColors === true && !M.MAT.bark.map;
    return out;
  }, (r) => { ok(r.applied && r.vc === false && r.restored, 'rules saved before the 60th (texture only) also show the picture, and remove cleanly'); });

  await stage(p, 'save', async () => { const RT = window.__texRuntime; await RT.saveNow(); const st = await (await fetch('/__colombo/textures', { cache: 'no-cache' })).json(); return { rules: Object.keys(st.manifest.rules) }; },
    (r) => { ok(r.rules.length >= 3, `saved to texture-pack/ (${r.rules.join(', ')})`); });

  // ---- restart: the per-building / part keys are split before the city is generated
  await boot(p);
  await stage(p, 'after restart', async () => {
    const g = window.__game; await g.stepSim(20, 0.05); const RT = window.__texRuntime; for (let i = 0; i < 80 && !(RT && RT.S.ready); i++) await new Promise((r) => setTimeout(r, 250));
    const M = await import('/src/gfx/Materials.js'); const T = window.__T.b ? window.__T.b : null; const out = { rules: Object.keys(RT.S.manifest.rules) };
    for (const k of out.rules) { const mk = k.slice(4); const m = M.MAT[mk]; out[mk] = m ? { drawn: window.__drawers(m), tex: /^texstudio:/.test(m.map && m.map.name || ''), vc: m.vertexColors } : null; }
    for (const k of out.rules) { const mk = k.slice(4), base = M.parentKey(mk); if (base && M.MAT[base]) out[mk].baseTex = /^texstudio:/.test(M.MAT[base].map && M.MAT[base].map.name || ''); }
    void T; return out;
  }, (r) => { const ks = r.rules.map((k) => k.slice(4)); ok(ks.length >= 3, `rules back after restart (${ks.join(', ')})`);
    for (const k of ks) { const x = r[k]; ok(x && x.tex && (x.drawn > 0 || /^win/.test(k)) && !x.baseTex, `${k}: own material, texture applied, drawn (${x && x.drawn}) — its base material untouched`); }
    if (r.lampPole) ok(r.lampPole.vc === false, 'lamp pole texture still shown as the picture after restart'); });
  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 3).join(' || ') : ''));
} catch (e) { ok(false, 'test crashed: ' + String((e && e.stack) || e).split('\n').slice(0, 4).join(' | ')); } finally {
  await b.close();
  fs.rmSync(PACK, { recursive: true, force: true }); if (fs.existsSync(ASIDE)) fs.renameSync(ASIDE, PACK); else fs.mkdirSync(PACK, { recursive: true });
}
console.log(fails ? `${fails} FAILED, ${oks} ok` : `all passed (${oks})`); process.exit(fails ? 1 : 0);
