// Environment editor (console `paint`) — right dock: Properties (the selected objects: transform fields, layer, asset swap,
// tint), Asset (import + render settings and the per-material PBR editor with a live 3D preview), Brush (mode, multi-asset
// mix, spacing / density / random rotation + scale / jitter / alignment / slope + height limits, presets).
import * as THREE from 'three';
import * as PF from './PaintFormat.js';
import * as IO from './PaintIO.js';
import { materialFromModel, fileURL } from './PaintAssets.js';
import { Viewport, toast } from './ui.js';
import { h, tb, dock, head, hint, msg, row, xyz, slider, checkRow, selectRow, colorRow, modal, fmtN } from './PaintUI.js';

const DEG = 180 / Math.PI;
const put = (el, ...k) => el.replaceChildren(...k.flat(9).filter((x) => x != null && x !== false));
const SLOT_GUESS = [['normal', /normal|nrm|nor\b|_n\b|norm/i], ['ao', /\bao\b|_ao|ambient|occlusion|occ\b/i], ['rough', /rough|rgh|gloss/i], ['metal', /metal|mtl\b|_m\b/i], ['height', /height|disp|bump|_h\b|depth/i],
  ['alpha', /opacity|alpha|mask|transp|_a\b/i], ['emissive', /emiss|emit|glow|_e\b/i], ['base', /albedo|base.?col|diffuse|diff\b|color|colour|_col|_d\b|_c\b|basecolor/i]];
export const guessSlot = (name) => { const n = PF.baseName(name).replace(/\.[^.]+$/, ''); for (const [s, re] of SLOT_GUESS) if (re.test(n)) return s; return null; };
const BUILTIN_PRESETS = [
  { name: 'Dense grass', settings: { density: 6, spacing: 0.18, rot: 360, tilt: 8, align: 0.8, scaleMin: 0.75, scaleMax: 1.3, heightVar: 0.25, sinkMin: 0, sinkMax: 0.04, jitter: 0, colorVar: 0.6, slopeMax: 45 } },
  { name: 'Mixed ground cover', settings: { density: 2.5, spacing: 0.35, rot: 360, tilt: 6, align: 0.7, scaleMin: 0.7, scaleMax: 1.35, heightVar: 0.2, sinkMin: 0, sinkMax: 0.05, colorVar: 0.5, slopeMax: 40 } },
  { name: 'Scattered rocks', settings: { density: 0.06, spacing: 2.5, rot: 360, tilt: 25, align: 1, scaleMin: 0.5, scaleMax: 1.8, heightVar: 0.3, sinkMin: 0.05, sinkMax: 0.25, colorVar: 0.3, slopeMax: 60 } },
  { name: 'Bushes / shrubs', settings: { density: 0.15, spacing: 1.8, rot: 360, tilt: 4, align: 0.3, scaleMin: 0.7, scaleMax: 1.4, heightVar: 0.2, sinkMin: 0, sinkMax: 0.1, colorVar: 0.4, slopeMax: 35 } },
  { name: 'Trees (sparse)', settings: { density: 0.01, spacing: 7, rot: 360, tilt: 3, align: 0, scaleMin: 0.8, scaleMax: 1.3, heightVar: 0.15, sinkMin: 0.1, sinkMax: 0.3, colorVar: 0.3, slopeMax: 30 } },
];
const MODES = [['paint', 'Paint'], ['erase', 'Erase'], ['replace', 'Replace'], ['scale', 'Scale'], ['ground', 'Re-seat']];

export function buildInspector(E, U) {
  const D = dock('r', [['props', 'Properties'], ['asset', 'Asset'], ['brush', 'Brush']], (id) => { if (id === 'asset') renderAsset(); if (id === 'brush') renderBrush(); if (id === 'props') renderProps(); });
  const I = { dock: D, cur: null, slot: 0, mclip: null };

  // ================================================================ Properties
  const P = D.panes.props; const pHead = h('div'); const pBody = h('div'); P.append(pHead, pBody);
  const fP = xyz('Position', (i, v) => E.setField('p', i, v), { step: 0.1, digits: 3 }), fR = xyz('Rotation °', (i, v) => E.setField('r', i, v), { step: 1, digits: 2 }), fS = xyz('Scale', (i, v) => E.setField('s', i, v), { step: 0.05, digits: 3 });
  const uni = slider('Uniform scale', 1, { min: 0.05, max: 10, step: 0.01, title: 'sets x = y = z on every selected object' }, (v) => E.setProp((o) => { o.s = [v, v, v]; }, 'Scale'));
  const fLayer = selectRow('Layer', [], '', (v) => { if (!E.layer(v)) return; E.setProp((o) => { o.l = v; }, 'Move to layer'); E.ui.renderLayers(); });
  const fAsset = selectRow('Asset', [], '', (v) => { if (!E.P.assets[v]) return; E.setProp((o) => { o.a = v; }, 'Swap asset'); });
  const fTint = colorRow('Tint', '#ffffff', (v) => { clearTimeout(I._tt); I._tt = setTimeout(() => E.setProp((o) => { o.t = v; }, 'Tint'), 120); });
  const fVar = slider('Colour variation', 0, { min: -1, max: 1, step: 0.01 }, (v) => { clearTimeout(I._vt); I._vt = setTimeout(() => E.setProp((o) => { o.c = v; }, 'Colour'), 120); });
  const same = (list, f) => { const v0 = f(list[0]); return list.every((o) => Math.abs(f(o) - v0) < 1e-5) ? v0 : null; };
  function renderProps() {
    const list = E.selectedList();
    if (!list.length) { put(pHead, head('Properties'), hint('Nothing selected. Q = select tool: click an object, Shift / Ctrl+click for more, drag a box, or click a layer in the Layers tab to take the whole group.'), E.tool === 'place' ? msg('Place tool: click the world to place "' + ((E.P.assets[E.placeAsset] || {}).name || '—') + '"', 'info') : null); pBody.style.display = 'none'; return; }
    pBody.style.display = ''; const names = [...new Set(list.map((o) => (E.P.assets[o.a] || {}).name || o.a))];
    put(pHead, head(list.length === 1 ? 'Object #' + list[0].u : fmtN(list.length) + ' objects'), hint(names.slice(0, 4).join(', ') + (names.length > 4 ? ' +' + (names.length - 4) : '') + (list.length > 1 ? ' — edits apply to every selected object (rotate / scale with the gizmo pivot around their centre)' : '') + (list.length === 1 && list[0].k ? ' · painted' : '')));
    fLayer.fill(E.P.layers.map((l) => [l.id, l.name + (l.locked ? ' (locked)' : '')]), same(list, (o) => E.P.layers.findIndex((l) => l.id === o.l)) != null ? list[0].l : ''); fAsset.fill([...(same(list, (o) => (o.a === list[0].a ? 0 : 1)) == null ? [['', '— mixed —']] : []), ...Object.values(E.P.assets).map((a) => [a.id, a.name])], same(list, (o) => (o.a === list[0].a ? 0 : 1)) != null ? list[0].a : '');
    fTint.set(list[0].t || '#ffffff'); fVar.set(+(list[0].c || 0).toFixed(2)); refreshFields(list);
  }
  function refreshFields(list = E.selectedList()) { if (!list.length) return; fP.set([0, 1, 2].map((i) => same(list, (o) => o.p[i]))); fR.set([0, 1, 2].map((i) => { const v = same(list, (o) => o.r[i]); return v == null ? null : v * DEG; })); fS.set([0, 1, 2].map((i) => same(list, (o) => o.s[i]))); }
  pBody.append(head('Transform'), fP, fR, fS, uni,
    h('div', { cls: 'pe-btns' }, tb('Drop to ground', () => E.dropSelToGround(), { key: 'End' }), tb('Reset rotation', () => E.setProp((o) => { o.r = [0, 0, 0]; }, 'Reset rotation')), tb('Reset scale', () => E.setProp((o) => { o.s = [1, 1, 1]; }, 'Reset scale')),
      tb('Random yaw', () => E.setProp((o) => { o.r = [o.r[0], Math.random() * Math.PI * 2, o.r[2]]; }, 'Random yaw')), tb('Align to ground', () => E.setProp((o) => { const [ax, az] = E.alignTo(E.normalAt(o.p[0], o.p[2]), o.r[1], 1); o.r = [ax, o.r[1], az]; }, 'Align'))),
    head('Object'), fLayer, fAsset, fTint, h('div', { cls: 'pe-btns' }, tb('Clear tint', () => E.setProp((o) => { o.t = null; }, 'Clear tint'))), fVar,
    head('Selection'), h('div', { cls: 'pe-btns' }, tb('Duplicate', () => E.duplicate(), { key: 'Ctrl+D' }), tb('Copy', () => E.copy(), { key: 'Ctrl+C' }), tb('Paste', () => E.paste(), { key: 'Ctrl+V' }), tb('Delete', () => E.deleteSel(), { cls: 'danger', key: 'Del' }), tb('Focus', () => E.focusSel(), { key: 'F' }),
      tb('Same asset', () => { const ids = new Set(E.selectedList().map((o) => o.a)); const L = []; for (const o of E.F.objs.values()) if (ids.has(o.a)) L.push(o); E.select(L); }), tb('Edit asset ›', () => { const o = E.selectedList()[0]; if (o) { U.libSel = o.a; I.showAsset(o.a); } })));
  I.refreshSel = (fast) => { if (D.cur !== 'props') return; if (fast) refreshFields(); else renderProps(); };

  // ================================================================ Asset + materials
  const AP = D.panes.asset; let vp = null; const vpBox = h('div', { cls: 'pe-vp' });
  I.showAsset = (id) => { if (I.cur !== id) I.slot = 0; I.cur = id; if (D.cur === 'asset') renderAsset(); };
  const debounce = (k, ms, fn) => { clearTimeout(I['_' + k]); I['_' + k] = setTimeout(fn, ms); };
  const changed = (def, reload = false) => { if (reload) E.F.setAsset(def).then(() => { renderAsset(); syncPreview(); }); else E.F.refreshAsset(def.id); E.markDirty(); debounce('thumb', 1500, () => refreshThumb(def)); };
  const refreshThumb = (def) => U.thumb(def.id).then((u) => { if (u && E.P.assets[def.id] === def) { def.thumb = u; E.ui.renderLib(); } });
  function syncPreview() {
    const A = E.F.assets.get(I.cur); if (!vp) { vp = new Viewport(vpBox, { dist: 3 }); vpBox.querySelector('.ed-vp').style.height = '100%'; vp.objs = []; }
    for (const o of vp.objs) { vp.scene.remove(o); o.geometry.dispose(); } vp.objs = []; if (!A || !A.model) return;
    A.batches.forEach((b, i) => { const p = A.model.parts[i]; const g = new THREE.BufferGeometry(); for (const [k, v] of Object.entries(p.geo.attributes)) g.setAttribute(k, v); g.setIndex(p.geo.index); g.setDrawRange(p.hi[0], p.hi[1]); const m = new THREE.Mesh(g, b.mat); vp.scene.add(m); vp.objs.push(m); });
    const s = A.model.size, r = Math.max(0.1, Math.hypot(s[0], s[1], s[2]) * 0.5); vp.target.set(0, A.model.box.min.y + s[1] * 0.5, 0); vp.dist = r * 2.4; vp.cur = I.cur;
  }
  function renderAsset() {
    const def = E.P.assets[I.cur]; if (!def) { put(AP, head('Asset'), hint('Pick an asset in the Library (or select a placed object and press "Edit asset") to edit its materials and render settings.')); return; }
    const A = E.F.assets.get(def.id); const M = A && A.model; const kids = [];
    const name = h('input', { type: 'text', value: def.name, style: { flex: 1 } }); name.addEventListener('change', () => { def.name = name.value.trim().slice(0, 120) || def.name; E.markDirty(); E.ui.renderLib(); });
    kids.push(head('Asset'), row('Name', name), hint(def.file.name + ' · ' + fmtN(def.stats.tris) + ' tris · ' + def.stats.size.map((v) => v.toFixed(2)).join(' × ') + ' m'), ...(M && M.error ? [msg('Model not loaded: ' + M.error + ' — it shows as a pink box. Re-import the files to fix it.', 'err')] : []), vpBox);
    kids.push(selectRow('Layer', E.P.layers.map((l) => [l.id, l.name]), def.layer, (v) => { def.layer = v; E.markDirty(); E.ui.renderLib(); }, 'default layer for new placements of this asset'),
      h('div', { cls: 'pe-btns' }, tb('Apply the layer\'s render profile', () => { const k = PF.layerKind(E.P.layers, def.layer); const lr = def.render.lodRatio; Object.assign(def.render, PF.defaultRender(k)); changed(def, lr !== def.render.lodRatio); renderAsset(); })));
    kids.push(head('Import'), slider('Scale', def.import.scale, { min: 0.001, max: 100, step: 0.001 }, (v) => { def.import.scale = v; debounce('imp', 500, () => changed(def, true)); }),
      selectRow('Up axis', [['y', 'Y up'], ['z', 'Z up']], def.import.upZ ? 'z' : 'y', (v) => { def.import.upZ = v === 'z'; changed(def, true); }),
      selectRow('Pivot', [['ground', 'Ground'], ['center', 'Centre'], ['origin', 'As modelled']], def.import.pivot, (v) => { def.import.pivot = v; changed(def, true); }));
    const R = def.render;
    kids.push(head('Rendering & performance'), slider('Draw distance (m)', R.draw, { min: 10, max: 1500, step: 5 }, (v) => { R.draw = v; changed(def); }), slider('LOD distance (m)', R.lod, { min: 0, max: 800, step: 5, title: 'beyond this the simplified mesh is drawn' }, (v) => { R.lod = v; changed(def); }),
      slider('LOD triangles kept', R.lodRatio, { min: 0.05, max: 1, step: 0.05 }, (v) => { R.lodRatio = v; debounce('lod', 600, () => changed(def, true)); }), checkRow('Far thinning (ground cover)', R.thin, (v) => { R.thin = v; changed(def); }, 'thin out instances with distance (grass) instead of a hard cut'),
      checkRow('Casts shadows', R.shadow, (v) => { R.shadow = v; changed(def); }), slider('Shadow distance (m)', R.shadowDist, { min: 0, max: 600, step: 5 }, (v) => { R.shadowDist = v; changed(def); }),
      slider('Wind sway', R.wind, { min: 0, max: 1, step: 0.05 }, (v) => { R.wind = v; changed(def); }), checkRow('Solid (collides)', R.solid, (v) => { R.solid = v; changed(def); }), slider('Collider footprint', R.colScale, { min: 0.05, max: 1.5, step: 0.05, title: '× the model footprint (a tree blocks at its trunk)' }, (v) => { R.colScale = v; changed(def); }));
    // ---- materials
    const slots = M ? M.slots : def.materials.map((m) => ({ name: m.name, src: null })); if (I.slot >= slots.length) I.slot = 0;
    kids.push(head('Materials (' + slots.length + ')'));
    if (slots.length > 1) kids.push(h('div', { cls: 'pe-list', style: { maxHeight: '120px' } }, ...slots.map((s, i) => h('div', { cls: 'pe-li' + (i === I.slot ? ' sel' : ''), onclick: () => { I.slot = i; renderAsset(); } }, h('span', { cls: 'n' }, (def.materials[i] && def.materials[i].name) || s.name), h('span', { cls: 'c' }, '#' + (i + 1))))));
    if (slots.length) kids.push(...materialEditor(def, I.slot, M));
    put(AP, ...kids); if (!vp || vp.cur !== def.id || (A && vp.objs.length !== A.batches.length)) { if (A && A.ready) A.ready.then(() => { if (I.cur === def.id) syncPreview(); }); } }
  function cfgOf(def, slot, M) { if (!def.materials[slot]) { while (def.materials.length <= slot) { const k = def.materials.length; def.materials.push(materialFromModel(M && M.slots[k] && M.slots[k].src, M && M.slots[k] ? M.slots[k].name : 'material ' + (k + 1))); } } return def.materials[slot]; }
  function materialEditor(def, slot, M) {
    const cfg = cfgOf(def, slot, M); const src = M && M.slots[slot] ? M.slots[slot].src : null;
    const apply = (reloadMaps = false) => { void reloadMaps; E.F.refreshAsset(def.id, slot); E.markDirty(); debounce('thumb', 1500, () => refreshThumb(def)); };
    const set = (k, v) => { cfg[k] = v; apply(); };
    const srcKey = { base: 'map', normal: 'normalMap', ao: 'aoMap', rough: 'roughnessMap', metal: 'metalnessMap', height: 'displacementMap', alpha: 'alphaMap', emissive: 'emissiveMap' };
    const hasModel = (s) => !!(src && src[srcKey[s]]);
    const loadInto = async (s, file) => {
      if (IO.offline()) { E.ui.notify('Loading textures needs the dev server', 'err'); return; }
      const ext = PF.extOf(file.name); if (!PF.IMAGE_EXTS.includes(ext)) { E.ui.notify(file.name + ': not an image (' + PF.IMAGE_EXTS.join(', ') + ')', 'err'); return; }
      try { const n = await IO.upload(file.name, await file.arrayBuffer()); cfg.maps[s] = { file: n }; cfg.mapNames = { ...(cfg.mapNames || {}), [s]: PF.baseName(file.name) }; apply(true); renderAsset(); }
      catch (e) { E.ui.notify('Texture not imported: ' + ((e && e.message) || e), 'err'); } };
    const pick = (s) => { const i = h('input', { type: 'file', accept: PF.IMAGE_EXTS.map((e) => '.' + e).join(',') + ',.jpeg', style: { display: 'none' } }); i.addEventListener('change', () => { if (i.files[0]) loadInto(s, i.files[0]); i.remove(); }); document.body.append(i); i.click(); };
    const mapRow = (s) => { const r = cfg.maps[s]; const color = PF.COLOR_SLOTS.has(s);
      const th = h('div', { cls: 'th', style: r && r.file ? { backgroundImage: 'url("' + fileURL(r.file) + '")' } : {} }, r && r.src === 'model' ? h('div', { style: { fontSize: '10px', textAlign: 'center', paddingTop: '11px', color: '#8a93a0' } }, 'model') : null);
      const label = r ? (r.src === 'model' ? 'from the model file' : (cfg.mapNames && cfg.mapNames[s]) || r.file.slice(0, 10) + '…') : hasModel(s) ? 'none (the model has one)' : 'none';
      const el = h('div', { cls: 'pe-map', title: color ? 'colour map — sRGB' : 'data map — linear (never colour-managed)' }, th, h('div', { cls: 'inf' }, h('div', { cls: 't' }, PF.MAP_LABEL[s] + ' ', h('span', { style: { color: '#6f7a88', fontWeight: 400, fontSize: '10px' } }, color ? 'sRGB' : 'linear')), h('div', { cls: 's' }, label)),
        tb('Load…', () => pick(s)), hasModel(s) && !(r && r.src === 'model') ? tb('Model', () => { cfg.maps[s] = { src: 'model' }; apply(true); renderAsset(); }, { title: 'use the texture inside the model file' }) : null, r ? h('button', { cls: 'pe-ico', title: 'Remove', onclick: () => { cfg.maps[s] = null; apply(true); renderAsset(); } }, '×') : null);
      el.addEventListener('dragover', (e) => { e.preventDefault(); el.style.borderColor = '#e0a030'; }); el.addEventListener('dragleave', () => { el.style.borderColor = ''; }); el.addEventListener('drop', (e) => { e.preventDefault(); el.style.borderColor = ''; const f = e.dataTransfer.files[0]; if (f) loadInto(s, f); });
      return el; };
    const auto = h('div', { cls: 'pe-drop', style: { padding: '8px' } }, 'Drop several texture maps here — assigned by name (albedo / basecolor, normal, ao, roughness, metallic, height, opacity, emissive)');
    auto.addEventListener('dragover', (e) => { e.preventDefault(); auto.classList.add('over'); }); auto.addEventListener('dragleave', () => auto.classList.remove('over'));
    auto.addEventListener('drop', async (e) => { e.preventDefault(); auto.classList.remove('over'); const files = [...e.dataTransfer.files]; const un = []; for (const f of files) { const s = guessSlot(f.name); if (s) await loadInto(s, f); else un.push(f.name); } if (un.length) E.ui.notify('Not recognised (drop them on a slot instead): ' + un.join(', '), 'warn'); });
    const autoPick = tb('Pick maps…', () => { const i = h('input', { type: 'file', accept: PF.IMAGE_EXTS.map((e) => '.' + e).join(',') + ',.jpeg', style: { display: 'none' } }); i.multiple = true; i.addEventListener('change', async () => { const un = []; for (const f of i.files) { const s = guessSlot(f.name); if (s) await loadInto(s, f); else un.push(f.name); } if (un.length) E.ui.notify('Not recognised: ' + un.join(', ') + ' — use the slot\'s Load…', 'warn'); i.remove(); }); document.body.append(i); i.click(); }, { title: 'choose several maps at once; slots by file name' });
    const mname = h('input', { type: 'text', value: cfg.name, style: { flex: 1 } }); mname.addEventListener('change', () => { cfg.name = mname.value.slice(0, 120); E.markDirty(); });
    const out = [row('Material', mname), auto, h('div', { cls: 'pe-btns' }, autoPick), ...PF.MAP_SLOTS.map(mapRow)];
    out.push(head('Surface'), colorRow('Base colour', cfg.color, (v) => set('color', v)), slider('Roughness', cfg.roughness, { min: 0, max: 1, step: 0.01, title: 'multiplies the roughness map' }, (v) => set('roughness', v)), slider('Metallic', cfg.metalness, { min: 0, max: 1, step: 0.01, title: 'multiplies the metallic map' }, (v) => set('metalness', v)),
      slider('Normal strength', cfg.normalScale, { min: 0, max: 4, step: 0.05 }, (v) => set('normalScale', v)), checkRow('Normal map is DirectX (flip green)', cfg.normalFlipY, (v) => set('normalFlipY', v)), slider('AO intensity', cfg.aoIntensity, { min: 0, max: 2, step: 0.05 }, (v) => set('aoIntensity', v)),
      slider('Displacement', cfg.displacementScale, { min: 0, max: 2, step: 0.01, title: 'height map vertex displacement (needs a dense mesh)' }, (v) => set('displacementScale', v)), slider('Displacement bias', cfg.displacementBias, { min: -1, max: 1, step: 0.01 }, (v) => set('displacementBias', v)),
      colorRow('Emissive', cfg.emissive, (v) => set('emissive', v)), slider('Emissive intensity', cfg.emissiveIntensity, { min: 0, max: 20, step: 0.1 }, (v) => set('emissiveIntensity', v)));
    out.push(head('Opacity'), selectRow('Alpha mode', [['opaque', 'Opaque'], ['mask', 'Alpha test (cut-out — foliage)'], ['blend', 'Alpha blend (glass, soft)']], cfg.alphaMode, (v) => { set('alphaMode', v); renderAsset(); }),
      ...(cfg.alphaMode === 'mask' ? [slider('Alpha cut-off', cfg.alphaTest, { min: 0.01, max: 0.99, step: 0.01 }, (v) => set('alphaTest', v)), checkRow('Alpha to coverage (MSAA)', cfg.alphaToCoverage, (v) => set('alphaToCoverage', v))] : []),
      slider('Opacity', cfg.opacity, { min: 0, max: 1, step: 0.01 }, (v) => set('opacity', v)), selectRow('Faces', [['front', 'Front only'], ['double', 'Double-sided (leaves, grass)']], cfg.side, (v) => set('side', v)));
    out.push(head('UV / tiling'), slider('Repeat U', cfg.repeat[0], { min: 0.01, max: 64, step: 0.01 }, (v) => { cfg.repeat = [v, cfg.repeat[1]]; apply(); }), slider('Repeat V', cfg.repeat[1], { min: 0.01, max: 64, step: 0.01 }, (v) => { cfg.repeat = [cfg.repeat[0], v]; apply(); }),
      slider('Offset U', cfg.offset[0], { min: -1, max: 1, step: 0.01 }, (v) => { cfg.offset = [v, cfg.offset[1]]; apply(); }), slider('Offset V', cfg.offset[1], { min: -1, max: 1, step: 0.01 }, (v) => { cfg.offset = [cfg.offset[0], v]; apply(); }), slider('Rotation (°)', cfg.rotation, { min: -180, max: 180, step: 1 }, (v) => set('rotation', v)));
    out.push(head('Colour adjustments (base colour)'), slider('Hue (°)', cfg.hue, { min: -180, max: 180, step: 1 }, (v) => set('hue', v)), slider('Saturation', cfg.saturation, { min: 0, max: 3, step: 0.01 }, (v) => set('saturation', v)), slider('Brightness', cfg.brightness, { min: 0, max: 3, step: 0.01 }, (v) => set('brightness', v)), slider('Contrast', cfg.contrast, { min: 0, max: 3, step: 0.01 }, (v) => set('contrast', v)));
    out.push(head('Texture sampling'), selectRow('Filtering', [['trilinear', 'Trilinear (smooth)'], ['bilinear', 'Bilinear'], ['nearest', 'Nearest (pixel art)']], cfg.filter, (v) => set('filter', v)), selectRow('Anisotropy', [1, 2, 4, 8, 16].map((v) => [v, v + '×']), cfg.anisotropy, (v) => set('anisotropy', +v)),
      selectRow('Max texture size', [256, 512, 1024, 2048, 4096].map((v) => [v, v + ' px']), cfg.maxSize, (v) => set('maxSize', +v), 'imported images larger than this are downscaled on load (memory)'),
      selectRow('Flip Y', [['auto', 'Auto (format default)'], ['yes', 'Yes'], ['no', 'No']], cfg.flipY == null ? 'auto' : cfg.flipY ? 'yes' : 'no', (v) => set('flipY', v === 'auto' ? null : v === 'yes')));
    out.push(h('div', { cls: 'pe-btns' }, tb('Reset to the model', async () => { if ((await modal('Reset material?', hint('All settings and maps of "' + cfg.name + '" go back to what the model file defines.'), [['Cancel', false], ['Reset', true, 'danger']])) !== true) return; def.materials[slot] = materialFromModel(src, M && M.slots[slot] ? M.slots[slot].name : cfg.name); apply(true); renderAsset(); }),
      tb('Copy', () => { I.mclip = JSON.parse(JSON.stringify(cfg)); toast('Material copied'); }), tb('Paste', () => { if (!I.mclip) { toast('Copy a material first'); return; } def.materials[slot] = PF.cleanMaterial({ ...I.mclip, name: cfg.name }); def.materials[slot].mapNames = I.mclip.mapNames; apply(true); renderAsset(); }),
      tb('Paste to all slots', () => { if (!I.mclip) { toast('Copy a material first'); return; } def.materials = def.materials.map((m) => Object.assign(PF.cleanMaterial({ ...I.mclip, name: m.name }), { mapNames: I.mclip.mapNames })); E.F.refreshAsset(def.id); E.markDirty(); renderAsset(); })));
    out.push(hint('Changes show live in the world and the preview, and are saved with the project (paint-pack/project.json) and compiled into the game.'));
    return out;
  }

  // ================================================================ Brush
  const BP = D.panes.brush;
  I.addToMix = (id) => { const B = E.brush; if (!B.mix.some((m) => m.a === id)) B.mix.push({ a: id, w: 1, s: 1 }); E.markDirty(); D.show('brush'); renderBrush(); E.ui.renderLib(); };
  const fields = {};
  function renderBrush() {
    const B = E.brush; const kids = []; const S = (k, label, o, title) => (fields[k] = slider(label, B[k], { ...o, title }, (v) => { B[k] = v; E.markDirty(); }));
    kids.push(head('Brush'), h('div', { cls: 'pe-btns' }, ...MODES.map(([m, l]) => { const b = tb(l, () => { B.mode = m; if (E.tool !== 'paint') E.setTool('paint'); renderBrush(); E.ui.refreshStatus(true); }); if (B.mode === m) b.classList.add('on'); return b; })),
      hint({ paint: 'Drag over the ground: places the mix up to the density, respecting spacing and limits. Ctrl+drag erases.', erase: 'Removes instances under the brush (scope below).', replace: 'Swaps instances under the brush to random assets of the mix (re-randomised).', scale: 'Grows instances under the brush (hold Shift to shrink).', ground: 'Re-seats instances on the terrain and re-aligns them to the slope.' }[B.mode]),
      E.tool !== 'paint' ? h('div', { cls: 'pe-btns' }, tb('Start painting', () => E.setTool('paint'), { cls: 'primary', key: 'B' })) : null);
    // mix
    kids.push(head('Asset mix'));
    const mix = h('div', { cls: 'pe-list', style: { maxHeight: 'none' } });
    for (const m of B.mix) { const a = E.P.assets[m.a]; if (!a) continue;
      const w = h('input', { type: 'range', min: 0, max: 10, step: 0.1, value: m.w, style: { width: '70px' }, title: 'weight (relative frequency)' }); const wv = h('span', { cls: 'c', style: { width: '26px' } }, m.w.toFixed(1)); w.addEventListener('input', () => { m.w = +w.value; wv.textContent = m.w.toFixed(1); E.markDirty(); });
      const s = h('input', { type: 'number', min: 0.05, max: 20, step: 0.05, value: m.s || 1, style: { width: '52px' }, title: 'scale multiplier for this asset' }); s.addEventListener('change', () => { m.s = Math.max(0.05, +s.value || 1); E.markDirty(); });
      mix.append(h('div', { cls: 'pe-li' }, a.thumb ? h('img', { src: a.thumb, style: { width: '28px', height: '22px', objectFit: 'cover', borderRadius: '3px' } }) : null, h('span', { cls: 'n', title: a.name }, a.name), w, wv, s, h('button', { cls: 'pe-ico', title: 'Remove from the mix', onclick: () => { B.mix.splice(B.mix.indexOf(m), 1); E.markDirty(); renderBrush(); E.ui.renderLib(); } }, '×'))); }
    if (!B.mix.length) mix.append(h('div', { cls: 'pe-hint', style: { padding: '6px' } }, 'Empty — add assets below, or "+ Brush mix" on a library asset. Mix grass, plants, stones and moss rocks: each dab picks randomly by weight, with random rotation, scale and colour, so nothing repeats visibly.'));
    const addSel = h('select', { style: { flex: 1, minWidth: 0 } }, h('option', { value: '' }, '+ add asset to the mix…'), ...Object.values(E.P.assets).filter((a) => !B.mix.some((m) => m.a === a.id)).map((a) => h('option', { value: a.id }, a.name + ' (' + ((E.layer(a.layer) || {}).name || a.layer) + ')')));
    addSel.addEventListener('change', () => { if (addSel.value) I.addToMix(addSel.value); });
    kids.push(mix, h('div', { cls: 'pe-row' }, addSel), selectRow('Target layer', [['auto', 'Each asset\'s own layer'], ...E.P.layers.map((l) => [l.id, l.name])], B.layer, (v) => { B.layer = v; E.markDirty(); }));
    // stroke
    kids.push(head('Stroke'), S('radius', 'Radius (m)', { min: 0.25, max: 100, step: 0.25 }, '[ ] or the mouse wheel'), S('density', 'Density (per m²)', { min: 0.005, max: 40, step: 0.005 }, 'target instances per square metre inside the brush'),
      S('spacing', 'Min spacing (m)', { min: 0, max: 20, step: 0.05 }, 'no two instances of the mix closer than this'), S('maxPerDab', 'Max per dab', { min: 1, max: 5000, step: 1 }), S('strength', 'Strength (erase / edit)', { min: 0.05, max: 1, step: 0.05 }, 'share of the instances under the brush affected per dab'));
    kids.push(head('Randomisation'), S('rot', 'Random rotation (°)', { min: 0, max: 360, step: 1 }), S('tilt', 'Random tilt (°)', { min: 0, max: 45, step: 0.5 }), S('align', 'Surface alignment', { min: 0, max: 1, step: 0.05 }, '0 = upright, 1 = follows the ground slope'),
      S('scaleMin', 'Scale min', { min: 0.05, max: 10, step: 0.01 }), S('scaleMax', 'Scale max', { min: 0.05, max: 10, step: 0.01 }), S('heightVar', 'Height variation ±', { min: 0, max: 1, step: 0.01 }), S('jitter', 'Position jitter (m)', { min: 0, max: 5, step: 0.05 }),
      S('sinkMin', 'Sink min (m)', { min: -1, max: 2, step: 0.01 }, 'pushed into the ground (rocks look embedded)'), S('sinkMax', 'Sink max (m)', { min: -1, max: 2, step: 0.01 }), S('colorVar', 'Colour variation', { min: 0, max: 1, step: 0.01 }));
    kids.push(head('Limits'), S('slopeMin', 'Slope min (°)', { min: 0, max: 90, step: 1 }), S('slopeMax', 'Slope max (°)', { min: 0, max: 90, step: 1 }), S('hMin', 'Height min (m)', { min: -10, max: 300, step: 0.5 }), S('hMax', 'Height max (m)', { min: -10, max: 300, step: 0.5 }),
      checkRow('Avoid water', B.avoidWater, (v) => { B.avoidWater = v; E.markDirty(); }), checkRow('Avoid roads', B.avoidRoads, (v) => { B.avoidRoads = v; E.markDirty(); }), checkRow('Avoid buildings / walls', B.avoidBuildings, (v) => { B.avoidBuildings = v; E.markDirty(); }),
      selectRow('Erase / edit affects', [['mix', 'Assets in the mix'], ['layer', 'The target layer'], ['all', 'Everything unlocked']], B.eraseScope, (v) => { B.eraseScope = v; E.markDirty(); }));
    // presets
    const pre = h('select', { style: { flex: 1, minWidth: 0 } }, h('option', { value: '' }, 'Presets…'), h('optgroup', { label: 'Saved' }, ...E.P.brushes.map((b, i) => h('option', { value: 's' + i }, b.name))), h('optgroup', { label: 'Built-in (settings only)' }, ...BUILTIN_PRESETS.map((b, i) => h('option', { value: 'b' + i }, b.name))));
    pre.addEventListener('change', () => { const v = pre.value; if (!v) return; const p = v[0] === 's' ? E.P.brushes[+v.slice(1)] : BUILTIN_PRESETS[+v.slice(1)]; if (!p) return; const keepMix = !p.settings.mix; Object.assign(B, { ...PF.BRUSH_DEFAULTS, mode: B.mode, mix: B.mix, layer: B.layer }, p.settings); if (keepMix) B.mix = B.mix.slice(); B.mix = (B.mix || []).filter((m) => E.P.assets[m.a]); E.markDirty(); renderBrush(); toast('Preset "' + p.name + '"'); });
    kids.push(head('Presets'), h('div', { cls: 'pe-row' }, pre), h('div', { cls: 'pe-btns' }, tb('Save as preset…', async () => { const n = h('input', { type: 'text', value: 'My brush', style: { width: '100%' } }); const inc = h('input', { type: 'checkbox' }); inc.checked = true;
      if ((await modal('Save brush preset', [row('Name', n), h('label', {}, inc, ' include the asset mix')], [['Cancel', null], ['Save', true, 'primary']])) !== true) return; const s = JSON.parse(JSON.stringify(B)); delete s.mode; if (!inc.checked) delete s.mix; const name = n.value.trim().slice(0, 60) || 'Brush';
      const i = E.P.brushes.findIndex((b) => b.name === name); if (i >= 0) E.P.brushes[i] = { name, settings: s }; else E.P.brushes.push({ name, settings: s }); E.markDirty(); renderBrush(); toast('Preset saved (with the project)'); }),
      tb('Delete preset', () => { const v = pre.value; if (!v || v[0] !== 's') { toast('Choose a saved preset first'); return; } E.P.brushes.splice(+v.slice(1), 1); E.markDirty(); renderBrush(); }), tb('Reset brush', () => { Object.assign(B, { ...PF.BRUSH_DEFAULTS, mix: B.mix, mode: B.mode }); E.markDirty(); renderBrush(); })));
    put(BP, ...kids);
  }
  I.refreshBrush = () => { if (D.cur === 'brush') { if (fields.radius) fields.radius.set(+E.brush.radius.toFixed(2)); const on = BP.querySelectorAll('.pe-btns')[0]; if (on) [...on.children].forEach((b, i) => b.classList.toggle('on', MODES[i] && MODES[i][0] === E.brush.mode)); } E.ui.refreshStatus(true); };
  I.dispose = () => { if (vp) vp.dispose(); };
  return I;
}
