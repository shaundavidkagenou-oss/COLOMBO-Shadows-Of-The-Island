// Environment editor (console `paint`) — the editor frame around the live game view: toolbar, left dock (Library · Import ·
// Layers), right dock (PaintInspector.js: Properties · Asset & materials · Brush), status bar, help, notifications, and the
// file dialogs (Export / Import .zip, COMPILE with the build report).
import * as THREE from 'three';
import * as PF from './PaintFormat.js';
import * as IO from './PaintIO.js';
import { loadModel, materialFromModel, buildMaterial, disposeMaterial, loadImageTexture } from './PaintAssets.js';
import { Viewport, download, toast } from './ui.js';
import { h, tb, dock, head, hint, msg, row, slider, checkRow, selectRow, modal, fmtN, fmtB } from './PaintUI.js';
import { buildInspector } from './PaintInspector.js';

const EXTRA_CSS = `
.pe-notes{position:absolute;top:50px;left:50%;transform:translateX(-50%);display:flex;flex-direction:column;gap:4px;align-items:center;pointer-events:none;z-index:2}
.pe-note{padding:6px 12px;border-radius:5px;background:rgba(23,34,51,.95);color:#cfe0f7;border:1px solid #2f4a6e;max-width:640px;pointer-events:auto;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.4)}
.pe-note.warn{background:rgba(58,46,20,.96);color:#f0d090;border-color:#7a6020}.pe-note.err{background:rgba(58,26,30,.96);color:#ffb0b8;border-color:#8a3a40}.pe-note.ok{background:rgba(22,48,28,.96);color:#a8efb2;border-color:#3f7a4a}
.pe-search{width:100%;margin-bottom:6px}
.pe-root select,.pe-modal select{min-width:0}
.pe-lrow .pe-ico{font-size:10.5px;padding:1px 4px;border:1px solid #2c3442;border-radius:3px;min-width:34px}
.pe-lrow .pe-ico.off{color:#6f7a88}
@media (max-width:1500px){.pe-bar .pe-tb{padding:0 6px}.pe-bar{gap:3px;padding:0 6px}.pe-grp{padding:0 4px}}
@media (max-width:1440px){.pe-grp.edit .opt{display:none}}
.pe-bar{overflow-x:auto;overflow-y:hidden;scrollbar-width:thin}.pe-bar>*{flex:none}
@media (max-width:1500px){.pe-bar .pe-tb kbd{display:none}.pe-logo small{display:none}}
@media (max-width:1280px){.pe-logo{display:none}}
.pe-prog{height:4px;background:#232935;border-radius:2px;overflow:hidden;margin:4px 0}.pe-prog i{display:block;height:100%;background:#e0a030;width:0}
.pe-pend{border:1px solid #2c3442;border-radius:6px;padding:6px;margin:6px 0;background:#141820}.pe-pend.sel{border-color:#e0a030}
.pe-dep{font-size:11px;color:#8a93a0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.pe-dep.miss{color:#ff9aa4}
.pe-lrow{display:flex;align-items:center;gap:5px;padding:5px 6px;border-bottom:1px solid #1a1f28;cursor:pointer}.pe-lrow:hover{background:#1b212c}.pe-lrow.hid .n{opacity:.45}
.pe-lrow .n{flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.pe-lrow .c{color:#8a93a0;font-size:11px;min-width:44px;text-align:right}
.pe-chk{display:flex;flex-direction:column;gap:2px;max-height:200px;overflow:auto;border:1px solid #2c3442;border-radius:5px;padding:6px;margin:6px 0}
.pe-log{white-space:pre-wrap;background:#0e1116;border:1px solid #2c3442;border-radius:5px;padding:6px;max-height:260px;overflow:auto;font:11px ui-monospace,Consolas,monospace;color:#c8d0da}
`;
let extraDone = false;
export const put = (el, ...k) => el.replaceChildren(...k.flat(9).filter((x) => x != null && x !== false));
const GUESS = [[/moss.?rock|rock.?moss|mossy.?(rock|stone)/i, 'rocks'], [/grass|turf|lawn|blade|reed/i, 'grass'], [/moss/i, 'moss'], [/flower|bloom|daisy|lotus|hibisc|orchid|petal/i, 'flowers'],
  [/tree|palm|trunk|branch|log\b/i, 'trees'], [/bush|shrub|hedge/i, 'bushes'], [/rock|stone|boulder|pebble|cliff|gravel/i, 'rocks'], [/plant|fern|weed|leaf|leaves|ivy|clover|ground.?cover|sprout/i, 'smallplants'], [/bench|lamp|fence|crate|barrel|sign|pot|statue|bin\b/i, 'props']];
export const guessLayer = (name) => { for (const [re, l] of GUESS) if (re.test(name)) return l; return 'custom'; };
const slug = (s) => (String(s).toLowerCase().replace(/\.[a-z0-9]+$/, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'asset');
export const LAYER_OPTS = (E) => E.P.layers.map((l) => [l.id, l.name]);

// ---------------------------------------------------------------- thumbnails (the game renderer → a small float target)
const TH = { scene: null, cam: null, rt: null, W: 160, H: 128, buf: null };
export async function makeThumb(E, id) {
  const A = E.F.assets.get(id); if (!A) return null; await A.ready; if (!A.model || !A.batches.length) return null;
  const def = A.def; const files = []; for (const m of def.materials || []) for (const s of PF.MAP_SLOTS) { const r = m.maps[s]; if (r && r.file) files.push(loadImageTexture(r.file, PF.COLOR_SLOTS.has(s), m.maxSize).catch(() => null)); }
  await Promise.all(files); await new Promise((r) => setTimeout(r, 60)); if (!E.F.assets.has(id)) return null;
  const R = E.g.renderer;
  if (!TH.scene) { TH.scene = new THREE.Scene(); const hemi = new THREE.HemisphereLight(0xe4ecff, 0x5a4a3a, 1.6); const sun = new THREE.DirectionalLight(0xfff2dd, 2.6); sun.position.set(3, 6, 4); const rim = new THREE.DirectionalLight(0xbcd0ff, 0.9); rim.position.set(-4, 2, -3); TH.scene.add(hemi, sun, rim); TH.cam = new THREE.PerspectiveCamera(32, TH.W / TH.H, 0.01, 2000); }
  if (!TH.rt) { for (const type of [THREE.FloatType, THREE.HalfFloatType, THREE.UnsignedByteType]) { try { const rt = new THREE.WebGLRenderTarget(TH.W, TH.H, { type, samples: 4 }); TH.rt = rt; TH.type = type; break; } catch { /* next */ } } }
  const meshes = A.batches.map((b, i) => { const p = A.model.parts[i]; const g = new THREE.BufferGeometry(); for (const [k, v] of Object.entries(p.geo.attributes)) g.setAttribute(k, v); g.setIndex(p.geo.index); g.setDrawRange(p.hi[0], p.hi[1]); return new THREE.Mesh(g, b.mat); });
  const grp = new THREE.Group(); grp.add(...meshes); TH.scene.add(grp);
  const box = A.model.box, c = box.getCenter(new THREE.Vector3()), r = Math.max(0.05, box.getSize(new THREE.Vector3()).length() * 0.5); const d = r / Math.sin((TH.cam.fov * Math.PI) / 360) * 0.95;
  TH.cam.position.copy(c).add(new THREE.Vector3(0.75, 0.55, 1).normalize().multiplyScalar(d)); TH.cam.near = d / 50; TH.cam.far = d * 4; TH.cam.updateProjectionMatrix(); TH.cam.lookAt(c);
  const prevT = R.getRenderTarget(), prevC = R.getClearColor(new THREE.Color()), prevA = R.getClearAlpha(), prevDefer = R.deferCompile; let url = null;
  try { R.deferCompile = false; R.setRenderTarget(TH.rt); R.setClearColor(0x2a313d, 1); R.clear(); R.render(TH.scene, TH.cam);
    const n = TH.W * TH.H * 4; const fl = TH.type !== THREE.UnsignedByteType; const buf = TH.type === THREE.FloatType ? new Float32Array(n) : TH.type === THREE.HalfFloatType ? new Uint16Array(n) : new Uint8Array(n); R.readRenderTargetPixels(TH.rt, 0, 0, TH.W, TH.H, buf);
    const cv = document.createElement('canvas'); cv.width = TH.W; cv.height = TH.H; const cx = cv.getContext('2d'); const im = cx.createImageData(TH.W, TH.H);
    const tone = (v) => { v = fl ? v : v / 255; v = v / (1 + v * 0.35); v = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055; return Math.max(0, Math.min(255, Math.round(v * 255))); };
    for (let y = 0; y < TH.H; y++) for (let x = 0; x < TH.W; x++) { const s = ((TH.H - 1 - y) * TH.W + x) * 4, o = (y * TH.W + x) * 4; for (let k = 0; k < 3; k++) { const v = TH.type === THREE.HalfFloatType ? THREE.DataUtils.fromHalfFloat(buf[s + k]) : buf[s + k]; im.data[o + k] = tone(v); } im.data[o + 3] = 255; }
    cx.putImageData(im, 0, 0); url = cv.toDataURL('image/jpeg', 0.82);
  } catch (e) { console.warn('[paint] thumbnail failed', e); }
  finally { R.setRenderTarget(prevT); R.setClearColor(prevC, prevA); R.deferCompile = prevDefer; TH.scene.remove(grp); for (const m of meshes) m.geometry.dispose(); }
  return url;
}

// ---------------------------------------------------------------- file picking / dropped folders
function pickFiles({ accept = '', multiple = true, folder = false } = {}) {
  return new Promise((res) => { const i = h('input', { type: 'file', accept, style: { display: 'none' } }); i.multiple = multiple; if (folder) i.webkitdirectory = true;
    i.addEventListener('change', () => { res([...(i.files || [])]); i.remove(); }); addEventListener('focus', () => setTimeout(() => { if (!i.files || !i.files.length) { res([]); i.remove(); } }, 800), { once: true }); document.body.append(i); i.click(); });
}
async function droppedFiles(dt) {
  const out = []; const items = [...(dt.items || [])].map((it) => it.webkitGetAsEntry && it.webkitGetAsEntry()).filter(Boolean);
  if (!items.length) return [...(dt.files || [])];
  const walk = async (en) => { if (en.isFile) out.push(await new Promise((r, j) => en.file(r, j))); else if (en.isDirectory) { const rd = en.createReader(); let batch; do { batch = await new Promise((r, j) => rd.readEntries(r, j)); for (const c of batch) await walk(c); } while (batch.length); } };
  for (const en of items) await walk(en); return out;
}
// model file + the dropped files → the files it needs ({ need: [names], found: Map(lower basename → File), missing: [names] })
async function dependencies(model, all) {
  const byName = new Map(); for (const f of all) byName.set(PF.baseName(f.name).toLowerCase(), f); const ext = PF.extOf(model.name); const need = new Set();
  const uri = (u) => { if (!u || /^data:/.test(u)) return; need.add(decodeURIComponent(PF.baseName(u.split('?')[0]))); };
  if (ext === 'gltf') { let j; try { j = JSON.parse(await model.text()); } catch { throw new Error(model.name + ' is not valid glTF JSON'); } for (const b of j.buffers || []) uri(b.uri); for (const i of j.images || []) uri(i.uri);
    if ((j.extensionsRequired || []).includes('KHR_draco_mesh_compression')) throw new Error(model.name + ' needs Draco decompression — re-export without Draco (or decompress with gltf-transform)'); }
  else if (ext === 'glb') { const j = PF.glbJSON(new Uint8Array(await model.arrayBuffer())); if (!j) throw new Error(model.name + ' is not a valid GLB file'); for (const b of j.buffers || []) if (b.uri) uri(b.uri); for (const i of j.images || []) uri(i.uri);
    if ((j.extensionsRequired || []).includes('KHR_draco_mesh_compression')) throw new Error(model.name + ' needs Draco decompression — re-export without Draco'); }
  else if (ext === 'obj') { const t = await model.text(); for (const m of t.matchAll(/^mtllib\s+(.+)$/gm)) { const n = m[1].trim(); need.add(PF.baseName(n)); const mf = byName.get(PF.baseName(n).toLowerCase()); if (mf) { const mt = await mf.text(); for (const q of mt.matchAll(/^\s*(?:map_\w+|bump|disp|norm)\s+(?:-\S+\s+\S+\s+)*(.+)$/gim)) need.add(PF.baseName(q[1].trim())); } } }
  else if (ext === 'fbx') { for (const f of all) if (PF.IMAGE_EXTS.includes(PF.extOf(f.name))) need.add(PF.baseName(f.name)); }
  const found = new Map(), missing = []; for (const n of need) { const f = byName.get(n.toLowerCase()); if (f) found.set(n, f); else missing.push(n); }
  return { need: [...need], found, missing };
}

// ---------------------------------------------------------------- the frame
export function buildUI(E) {
  if (!extraDone) { extraDone = true; const s = document.createElement('style'); s.textContent = EXTRA_CSS; document.head.append(s); }
  const U = { libSel: null, place: { yaw: 0, scale: 1, rotRandom: true, scaleRandom: true, align: false }, filter: { q: '', layer: '' } };
  const root = h('div', { cls: 'pe-root' }); document.body.append(root); const notes = h('div', { cls: 'pe-notes' }); root.append(notes);
  U.notify = (t, kind = 'info', ms = kind === 'err' ? 9000 : kind === 'warn' ? 6500 : 2500) => { const n = h('div', { cls: 'pe-note ' + kind, onclick: () => n.remove() }, t); notes.append(n); while (notes.children.length > 4) notes.firstChild.remove(); setTimeout(() => n.remove(), ms); };
  // ---- toolbar
  const T = {}; const tool = (id, label, key, title) => (T[id] = tb(label, () => E.setTool(id), { key, title }));
  const bar = h('div', { cls: 'pe-bar' }, h('div', { cls: 'pe-logo' }, 'ENVIRONMENT EDITOR', h('small', {}, 'Colombo')),
    h('div', { cls: 'pe-grp' }, tool('select', 'Select', 'Q', 'Pick objects (click, Shift add, Ctrl toggle, drag a box)'), tool('move', 'Move', 'W', 'Move the selection (gizmo)'), tool('rotate', 'Rotate', 'E', 'Rotate the selection'), tool('scale', 'Scale', 'R', 'Scale the selection')),
    h('div', { cls: 'pe-grp' }, tool('place', 'Place', 'T', 'Click to place the library asset'), tool('paint', 'Paint', 'B', 'Paint with the brush (Ctrl = erase)')),
    h('div', { cls: 'pe-grp' }, (T.grid = tb('Grid', () => { E.snap.grid = !E.snap.grid; E.applySnap(); U.toolChanged(); }, { key: 'G', title: 'Grid snap' })),
      (T.gridSize = h('select', { title: 'Grid size (m)', style: { height: '28px', width: '66px', flex: 'none' } }, ...[0.1, 0.25, 0.5, 1, 2, 5, 10].map((v) => h('option', { value: v }, v + ' m')))),
      (T.angle = tb('Angle', () => { E.snap.angle = !E.snap.angle; E.applySnap(); U.toolChanged(); }, { title: 'Rotation snap' })),
      (T.angleStep = h('select', { title: 'Rotation step', style: { height: '28px', width: '58px', flex: 'none' } }, ...[5, 15, 30, 45, 90].map((v) => h('option', { value: v }, v + '°')))),
      (T.surface = tb('Surface', () => { E.snap.surface = !E.snap.surface; U.toolChanged(); }, { title: 'Surface snap: placed / moved objects follow the ground and other objects' })),
      (T.space = tb('World', () => { E.snap.space = E.snap.space === 'local' ? 'world' : 'local'; E.applySnap(); U.toolChanged(); }, { title: 'Gizmo axes: world / local (single object)' }))),
    h('div', { cls: 'pe-grp edit' }, tb('Undo', () => E.undo(), { title: 'Undo', key: 'Ctrl+Z' }), tb('Redo', () => E.redo(), { title: 'Redo', key: 'Ctrl+Y' }), tb('Duplicate', () => E.duplicate(), { title: 'Duplicate', key: 'Ctrl+D', cls: 'opt' }), tb('Delete', () => E.deleteSel(), { title: 'Delete', key: 'Del', cls: 'opt' }), tb('Focus', () => E.focusSel(), { title: 'Focus the selection', key: 'F', cls: 'opt' })),
    h('div', { cls: 'pe-sp' }),
    h('div', { cls: 'pe-grp' }, (T.save = tb('Save', () => E.save(), { title: 'Save the project to paint-pack/', key: 'Ctrl+S' })), tb('Export', () => exportDialog(E), { title: 'Export a portable .zip (whole scene or selected layers)' }), tb('Import', () => importDialog(E), { title: 'Import an exported .zip' }),
      tb('COMPILE', () => compileDialog(E), { cls: 'primary', title: 'Save, validate and compile the scene into the game build (build-exe.bat → the .exe)' })),
    h('div', { cls: 'pe-grp' }, tb('?', () => U.toggleHelp(), { key: 'F1', title: 'Help' }), tb('Exit', () => E.close(), { cls: 'danger', title: 'Close the editor (saves, back to the game)' })));
  T.gridSize.value = String(E.snap.gridSize); T.gridSize.addEventListener('change', () => { E.snap.gridSize = +T.gridSize.value; E.snap.grid = true; E.applySnap(); U.toolChanged(); });
  T.angleStep.value = String(E.snap.angleStep); T.angleStep.addEventListener('change', () => { E.snap.angleStep = +T.angleStep.value; E.snap.angle = true; E.applySnap(); U.toolChanged(); });
  root.append(bar);
  // ---- docks
  const left = dock('l', [['lib', 'Library'], ['imp', 'Import'], ['lay', 'Layers']], (id) => { if (id === 'lib') renderLib(); if (id === 'lay') renderLayers(); });
  root.append(left.el); U.left = left;
  U.thumb = (id) => makeThumb(E, id);
  const I = buildInspector(E, U); root.append(I.dock.el); U.right = I.dock; U.showRight = (id) => I.dock.show(id);
  // ---- status
  const st = {}; const status = h('div', { cls: 'pe-status' }, (st.tool = h('span')), (st.cur = h('span')), (st.inst = h('span')), (st.sel = h('span')), (st.snap = h('span')), h('span', { cls: 'pe-sp' }), (st.fps = h('span')), (st.save = h('span'))); root.append(status);
  const help = h('div', { cls: 'pe-help', style: { display: 'none' } }, h('div', {}, h('b', {}, 'Fly '), 'hold the right mouse button + WASD · Q / E down / up · Shift fast · Alt slow · wheel while flying = speed · arrows / PgUp / PgDn also move'),
    h('div', {}, h('b', {}, 'Tools '), 'Q select · W move · E rotate · R scale · T place · B paint · Esc back to select'),
    h('div', {}, h('b', {}, 'Select '), 'click · Shift+click add · Ctrl+click toggle · drag a box · Ctrl+A all · F focus · End drop to ground'),
    h('div', {}, h('b', {}, 'Edit '), 'Ctrl+Z / Ctrl+Y undo / redo · Ctrl+D duplicate · Ctrl+C / Ctrl+V copy / paste at the cursor · Del delete · G grid snap'),
    h('div', {}, h('b', {}, 'Brush '), 'drag to paint · Ctrl+drag erase · X paint / erase · [ ] or wheel = radius · Shift+wheel zoom'),
    h('div', {}, h('b', {}, 'Files '), 'Ctrl+S save (paint-pack/project.json) · COMPILE puts the scene into the game build (build-exe.bat)')); root.append(help);
  U.toggleHelp = () => { help.style.display = help.style.display === 'none' ? '' : 'none'; };
  U.toolChanged = () => { for (const k of ['select', 'move', 'rotate', 'scale', 'place', 'paint']) T[k].classList.toggle('on', E.tool === k); T.grid.classList.toggle('on', E.snap.grid); T.angle.classList.toggle('on', E.snap.angle); T.surface.classList.toggle('on', E.snap.surface); T.space.textContent = E.snap.space === 'local' ? 'Local' : 'World'; U.refreshStatus(true); };
  U.dirty = () => { T.save.classList.toggle('on', E.unsaved); };
  U.refreshStatus = (force) => { const S = E.F.stats; const c = E.cursor;
    st.tool.innerHTML = '<b>' + ({ select: 'Select', move: 'Move', rotate: 'Rotate', scale: 'Scale', place: 'Place', paint: 'Brush · ' + E.brush.mode }[E.tool] || E.tool) + '</b>';
    st.cur.textContent = c ? 'x ' + c.x.toFixed(1) + '  y ' + c.y.toFixed(2) + '  z ' + c.z.toFixed(1) : 'cam ' + E.pos.x.toFixed(0) + ', ' + E.pos.y.toFixed(0) + ', ' + E.pos.z.toFixed(0);
    st.inst.innerHTML = '<b>' + fmtN(S.instances) + '</b> instances · ' + fmtN(S.drawn) + ' drawn · ' + S.visibleCells + '/' + S.cells + ' cells · ' + S.batches + ' batches';
    st.sel.innerHTML = E.sel.size ? '<b>' + fmtN(E.sel.size) + '</b> selected' : '';
    st.snap.textContent = (E.snap.grid ? 'grid ' + E.snap.gridSize + ' m · ' : '') + (E.snap.angle ? E.snap.angleStep + '° · ' : '') + (E.snap.surface ? 'surface' : 'free');
    st.fps.textContent = Math.round(E.fps) + ' fps';
    if (force || E.unsaved !== U._lastUnsaved) { U._lastUnsaved = E.unsaved; st.save.innerHTML = IO.offline() ? '<span class="warn">read-only (no dev server)</span>' : E.unsaved ? '<span class="warn">unsaved changes</span>' : E.savedAt ? '<span class="ok">saved ' + new Date(E.savedAt).toLocaleTimeString() + '</span>' : 'new project'; T.save.classList.toggle('on', E.unsaved); } };
  U.refreshSel = (fast) => { I.refreshSel(fast); };
  U.refreshBrush = () => I.refreshBrush();
  U.refreshCounts = () => { if (left.cur === 'lay') renderLayers(); if (!U._cntT) U._cntT = setTimeout(() => { U._cntT = null; if (left.cur === 'lib') renderLib(); }, 800); };

  // ---------------------------------------------------------------- Library
  const lib = left.panes.lib; const libHead = h('div'); const cards = h('div', { cls: 'pe-cards' }); const libFoot = h('div'); lib.append(libHead, cards, libFoot);
  const q = h('input', { type: 'search', placeholder: 'Search assets…', cls: 'pe-search' }); q.addEventListener('input', () => { U.filter.q = q.value.toLowerCase(); renderLib(); });
  const lf = selectRow('Layer', [['', 'All layers'], ...LAYER_OPTS(E)], '', (v) => { U.filter.layer = v; renderLib(); });
  libHead.append(q, lf);
  const counts = () => { const m = new Map(); for (const o of E.F.objs.values()) m.set(o.a, (m.get(o.a) || 0) + 1); return m; };
  const thumbBusy = new Set();
  function renderLib() {
    lf.fill([['', 'All layers'], ...LAYER_OPTS(E)], U.filter.layer); const n = counts(); const mix = new Set(E.brush.mix.map((m) => m.a));
    const list = Object.values(E.P.assets).filter((a) => (!U.filter.layer || a.layer === U.filter.layer) && (!U.filter.q || a.name.toLowerCase().includes(U.filter.q))).sort((a, b) => a.name.localeCompare(b.name));
    put(cards, ...list.map((a) => { const A = E.F.assets.get(a.id); const bad = A && A.model && A.model.error;
      if (!a.thumb && !thumbBusy.has(a.id) && A) { thumbBusy.add(a.id); makeThumb(E, a.id).then((u) => { thumbBusy.delete(a.id); if (u && E.P.assets[a.id] === a && !a.thumb) { a.thumb = u; renderLib(); } }); }
      const c = h('div', { cls: 'pe-card' + (U.libSel === a.id ? ' sel' : ''), title: a.name + (bad ? '\n! ' + bad : ''), onclick: () => U.selectLib(a.id), ondblclick: () => { U.selectLib(a.id); E.setPlaceAsset(a.id); E.setTool('place'); } },
        a.thumb ? h('img', { src: a.thumb, draggable: false }) : h('div', { cls: 'ph' }, bad ? '!' : '3D'), h('div', { cls: 'nm' }, a.name), h('div', { cls: 'mt' }, (E.layer(a.layer) || {}).name + ' · ' + fmtN(n.get(a.id) || 0) + ' placed'),
        bad ? h('div', { cls: 'bad' }, 'missing') : null, mix.has(a.id) ? h('div', { cls: 'inmix' }, 'brush') : null); return c; }));
    if (!list.length) put(cards, hint(Object.keys(E.P.assets).length ? 'No asset matches.' : 'The library is empty — import models in the Import tab (glTF / GLB with their .bin and textures, OBJ, FBX).'));
    renderLibFoot(n);
  }
  function renderLibFoot(n = counts()) {
    const a = E.P.assets[U.libSel]; if (!a) { put(libFoot, ); return; }
    const P = U.place;
    put(libFoot, head(a.name), hint(fmtN(a.stats.tris) + ' triangles · ' + a.stats.mats + ' material(s) · ' + a.stats.size.map((v) => v.toFixed(2)).join(' × ') + ' m · ' + fmtN(n.get(a.id) || 0) + ' placed'),
      h('div', { cls: 'pe-btns' }, tb('Place', () => { E.setPlaceAsset(a.id); E.setTool('place'); }, { key: 'T' }), tb('+ Brush mix', () => { I.addToMix(a.id); }), tb('Select placed', () => { const L = []; for (const o of E.F.objs.values()) if (o.a === a.id) L.push(o); E.select(L); E.focusSel(); }),
        tb('Edit asset ›', () => U.showRight('asset')), tb('Duplicate', () => duplicateAsset(E, a.id)), tb('Delete', () => deleteAsset(E, a.id), { cls: 'danger' })),
      head('Placement (Place tool)'), checkRow('Random rotation', P.rotRandom, (v) => { P.rotRandom = v; }), slider('Rotation (°)', P.yaw, { min: 0, max: 360, step: 1 }, (v) => { P.yaw = v; }),
      slider('Scale', P.scale, { min: 0.05, max: 10, step: 0.01 }, (v) => { P.scale = v; }), checkRow('Random scale ±15%', P.scaleRandom, (v) => { P.scaleRandom = v; }), checkRow('Align to the surface', P.align, (v) => { P.align = v; }),
      hint('Click in the world to place · Shift+click keeps placing without selecting · snapping from the toolbar'));
  }
  U.selectLib = (id) => { U.libSel = id; if (E.tool === 'place') E.setPlaceAsset(id); renderLib(); I.showAsset(id); };
  U.renderLib = renderLib;

  // ---------------------------------------------------------------- Import
  const imp = left.panes.imp; const drop = h('div', { cls: 'pe-drop' }, 'Drop model files or a folder here', h('div', { cls: 'pe-hint' }, '.glb · .gltf + .bin + textures · .obj + .mtl · .fbx'));
  const pendBox = h('div'); const prog = h('div', { cls: 'pe-prog', style: { display: 'none' } }, h('i')); const vpBox = h('div', { cls: 'pe-vp', style: { display: 'none' } });
  imp.append(head('Import models'), drop, h('div', { cls: 'pe-btns' }, tb('Choose files…', async () => addFiles(await pickFiles({ accept: [...PF.MODEL_EXTS, ...PF.SIDE_EXTS, ...PF.IMAGE_EXTS, 'jpeg'].map((e) => '.' + e).join(',') }))), tb('Choose folder…', async () => addFiles(await pickFiles({ folder: true })))),
    hint('Pick the model together with its .bin and texture files (or the whole folder): references are matched by file name. Files are stored once in paint-pack/assets (content-addressed) — the project keeps relative names only.'), prog, vpBox, pendBox);
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); }); drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', async (e) => { e.preventDefault(); drop.classList.remove('over'); addFiles(await droppedFiles(e.dataTransfer)); });
  const pend = []; let pv = null; let pvSel = null;
  const setProg = (f) => { prog.style.display = f == null ? 'none' : ''; prog.firstChild.style.width = Math.round((f || 0) * 100) + '%'; };
  async function addFiles(files) {
    if (!files.length) return; if (IO.offline()) { U.notify('Importing needs the dev server (npm run dev) — the built game is read-only', 'err'); return; }
    const models = files.filter((f) => PF.MODEL_EXTS.includes(PF.extOf(f.name))); if (!models.length) { U.notify('No model file among the ' + files.length + ' file(s) (need .glb, .gltf, .obj or .fbx). Texture maps are added in the material editor (Asset tab).', 'warn'); return; }
    let k = 0; setProg(0);
    for (const m of models) {
      const p = { file: m, name: PF.baseName(m.name).replace(/\.[^.]+$/, ''), layer: guessLayer(m.name), scale: 1, upZ: false, pivot: 'ground', status: 'reading', error: null, missing: [], def: null, model: null };
      pend.push(p); renderPend();
      try { const dep = await dependencies(m, files); p.missing = dep.missing; const fl = {}; const upl = [[m, true], ...[...dep.found.values()].map((f) => [f, false])]; let main = null;
        for (const [f, isMain] of upl) { const n = await IO.upload(f.name, await f.arrayBuffer()); if (isMain) main = n; else fl[PF.baseName(f.name)] = n; }
        p.file0 = { main, files: fl, name: PF.baseName(m.name) }; await previewLoad(p);
      } catch (e) { p.status = 'error'; p.error = (e && e.message) || String(e); }
      setProg(++k / models.length); renderPend();
    }
    setProg(null); if (pend.length && !pvSel) showPreview(pend.find((p) => p.status === 'ready') || null);
  }
  function makeDef(p) { let id = slug(p.name); for (let k = 2; E.P.assets[id] || pend.some((q) => q !== p && q.def && q.def.id === id); k++) id = slug(p.name) + '_' + k;
    return PF.cleanAsset({ id, name: p.name, layer: p.layer, file: p.file0, import: { scale: p.scale, pivot: p.pivot, upZ: p.upZ }, materials: [], added: new Date().toISOString() }, E.P.layers); }
  async function previewLoad(p) {
    p.status = 'loading'; renderPend(); p.def = makeDef(p); const M = await loadModel(p.def); p.model = M;
    if (M.error) { p.status = 'error'; p.error = 'the model could not be read: ' + M.error + (p.missing.length ? ' (missing: ' + p.missing.join(', ') + ')' : ''); return; }
    p.def.materials = M.slots.map((s) => materialFromModel(s.src, s.name)); p.def.stats = { tris: M.tris | 0, mats: M.slots.length, size: M.size }; p.status = 'ready'; if (pvSel === p) showPreview(p);
  }
  function showPreview(p) {
    pvSel = p; if (pv) { pv.clear(); } if (!p || p.status !== 'ready') { vpBox.style.display = 'none'; renderPend(); return; }
    vpBox.style.display = ''; if (!pv) { const V = new Viewport(vpBox, { dist: 3 }); pv = { V, objs: [], mats: [], clear() { for (const o of this.objs) { V.scene.remove(o); o.geometry.dispose(); } for (const m of this.mats) disposeMaterial(m); this.objs = []; this.mats = []; } }; vpBox.querySelector('.ed-vp').style.height = '100%'; }
    const M = p.model; for (const part of M.parts) { const mat = buildMaterial(p.def.materials[part.slot], M.slots[part.slot].src, M, {}); pv.mats.push(mat); const g = new THREE.BufferGeometry(); for (const [k, v] of Object.entries(part.geo.attributes)) g.setAttribute(k, v); g.setIndex(part.geo.index); g.setDrawRange(part.hi[0], part.hi[1]); const o = new THREE.Mesh(g, mat); pv.V.scene.add(o); pv.objs.push(o); }
    const s = M.size, r = Math.max(0.1, Math.hypot(s[0], s[1], s[2]) * 0.5); pv.V.target.set(0, M.box.min.y + s[1] * 0.5, 0); pv.V.dist = r * 2.6; renderPend();
  }
  function renderPend() {
    put(pendBox, ...(pend.length ? [head('To import (' + pend.length + ')')] : []), ...pend.map((p) => {
      const kind = p.status === 'error' ? 'err' : p.status === 'ready' ? (p.missing.length ? 'warn' : 'ok') : 'info';
      const name = h('input', { type: 'text', value: p.name, style: { flex: 1 } }); name.addEventListener('change', () => { p.name = name.value.trim() || p.name; if (p.def) p.def.name = p.name; });
      const reload = () => { if (p.file0) previewLoad(p).then(() => { renderPend(); if (pvSel === p) showPreview(p); }); };
      const el = h('div', { cls: 'pe-pend' + (pvSel === p ? ' sel' : ''), onclick: (e) => { if (e.target === el || e.target.classList.contains('pe-dep')) showPreview(p); } },
        row('Name', name), selectRow('Layer', LAYER_OPTS(E), p.layer, (v) => { p.layer = v; if (p.def) p.def = { ...PF.cleanAsset({ ...p.def, layer: v, render: null }, E.P.layers), materials: p.def.materials, stats: p.def.stats }; }),
        slider('Import scale', p.scale, { min: 0.001, max: 100, step: 0.001, title: 'unit conversion: 0.01 for centimetre models' }, (v) => { p.scale = v; clearTimeout(p._t); p._t = setTimeout(reload, 400); }),
        selectRow('Up axis', [['y', 'Y up (glTF)'], ['z', 'Z up (3ds Max / Blender raw)']], p.upZ ? 'z' : 'y', (v) => { p.upZ = v === 'z'; reload(); }),
        selectRow('Pivot', [['ground', 'Ground (centre, base at 0)'], ['center', 'Centre'], ['origin', 'As modelled']], p.pivot, (v) => { p.pivot = v; reload(); }),
        msg(p.status === 'error' ? 'Error: ' + p.error : p.status === 'ready' ? 'Ready: ' + fmtN(p.model.tris) + ' triangles · ' + p.model.slots.length + ' material(s) · ' + p.model.size.map((v) => v.toFixed(2)).join(' × ') + ' m' + (p.missing.length ? ' — missing (will render without them): ' + p.missing.join(', ') : '') : p.status + '…', kind),
        h('div', { cls: 'pe-btns' }, tb('Preview', () => showPreview(p)), p.status === 'ready' ? tb('Add to library', () => commitPend(p), { cls: 'primary' }) : null, tb('Remove', () => { pend.splice(pend.indexOf(p), 1); if (pvSel === p) showPreview(null); renderPend(); })));
      return el; }), ...(pend.filter((p) => p.status === 'ready').length > 1 ? [h('div', { cls: 'pe-btns' }, tb('Add all ready', async () => { for (const p of pend.filter((q) => q.status === 'ready')) await commitPend(p, true); }, { cls: 'primary' }))] : []));
  }
  async function commitPend(p, quiet = false) {
    let id = p.def.id; for (let k = 2; E.P.assets[id]; k++) id = slug(p.name) + '_' + k; const def = PF.cleanAsset({ ...p.def, id, name: p.name }, E.P.layers); def.materials = p.def.materials; def.stats = p.def.stats; E.P.assets[def.id] = def; await E.F.setAsset(def);
    pend.splice(pend.indexOf(p), 1); if (pvSel === p) showPreview(null); renderPend(); E.markDirty(); U.libSel = def.id; left.show('lib'); U.selectLib(def.id);
    makeThumb(E, def.id).then((u) => { if (u && E.P.assets[def.id] === def) { def.thumb = u; renderLib(); } });
    if (!quiet) U.notify('"' + def.name + '" added to the library (' + (E.layer(def.layer) || {}).name + ') — click the world to place it, or add it to the brush', 'ok');
    if (E.tool !== 'paint') { E.setPlaceAsset(def.id); E.setTool('place'); }
  }

  // ---------------------------------------------------------------- Layers
  const lay = left.panes.lay; const layList = h('div', { cls: 'pe-list', style: { maxHeight: 'none' } }); const layFoot = h('div');
  lay.append(head('Layers'), hint('Click a layer to select everything on it (Shift adds) — then move / rotate / scale / duplicate it as a group. hide / show and lock / unlock per layer; edit = rename, colour, delete'), layList, layFoot);
  function renderLayers() {
    const n = new Map(); for (const o of E.F.objs.values()) n.set(o.l, (n.get(o.l) || 0) + 1);
    put(layList, ...E.P.layers.map((l) => {
      const eye = h('button', { cls: 'pe-ico' + (l.visible ? '' : ' off'), title: l.visible ? 'Hide' : 'Show', onclick: (e) => { e.stopPropagation(); setLayer(l, { visible: !l.visible }); } }, l.visible ? 'hide' : 'show');
      const lock = h('button', { cls: 'pe-ico' + (l.locked ? '' : ' off'), title: l.locked ? 'Unlock' : 'Lock', onclick: (e) => { e.stopPropagation(); setLayer(l, { locked: !l.locked }); } }, l.locked ? 'unlock' : 'lock');
      const menu = h('button', { cls: 'pe-ico', title: 'More…', onclick: (e) => { e.stopPropagation(); layerMenu(l, n.get(l.id) || 0); } }, 'edit');
      return h('div', { cls: 'pe-lrow' + (l.visible ? '' : ' hid'), title: l.name + ' (' + l.kind + ')', onclick: (e) => { const L = []; for (const o of E.F.objs.values()) if (o.l === l.id) L.push(o); if (!l.visible || l.locked) { toast('Layer is ' + (l.locked ? 'locked' : 'hidden')); return; } E.select(L, e.shiftKey ? 'add' : 'set'); U.notify(fmtN(L.length) + ' selected on ' + l.name, 'info', 1200); } },
        h('span', { cls: 'pe-sw', style: { background: l.color } }), h('span', { cls: 'n' }, l.name), h('span', { cls: 'c' }, fmtN(n.get(l.id) || 0)), eye, lock, menu); }));
    put(layFoot, h('div', { cls: 'pe-btns' }, tb('+ New layer', () => newLayer()), tb('Show all', () => { for (const l of E.P.layers) setLayer(l, { visible: true }, true); renderLayers(); }), tb('Unlock all', () => { for (const l of E.P.layers) setLayer(l, { locked: false }, true); renderLayers(); })));
  }
  function setLayer(l, ch, quiet) { Object.assign(l, ch); if ('visible' in ch) { E.F.setLayerHidden(l.id, !l.visible); } if (!l.visible || l.locked) { for (const o of [...E.sel]) if (o.l === l.id) E.sel.delete(o); E.selChanged(); } E.markDirty(); if (!quiet) renderLayers(); }
  async function layerMenu(l, count) {
    const name = h('input', { type: 'text', value: l.name, style: { width: '100%' } }); const kind = h('select', {}, ...Object.keys(PF.KIND_RENDER).map((k) => h('option', { value: k }, k))); kind.value = l.kind; kind.disabled = !l.custom; const col = h('input', { type: 'color', value: l.color });
    const v = await modal('Layer — ' + l.name, [row('Name', name), row('Kind (render profile for new assets)', kind), row('Colour', col), hint(fmtN(count) + ' instance(s) on this layer.' + (l.custom ? '' : ' Built-in layers cannot be removed.'))],
      [['Delete instances…', 'clear', 'danger'], ...(l.custom ? [['Delete layer', 'del', 'danger']] : []), ['Cancel', null], ['Apply', 'ok', 'primary']]);
    if (v === 'ok') { l.name = name.value.trim().slice(0, 60) || l.name; l.color = col.value; if (l.custom) l.kind = kind.value; E.markDirty(); renderLayers(); U.renderLib(); }
    if (v === 'clear' || v === 'del') {
      if (count && (await modal('Delete ' + fmtN(count) + ' instance(s)?', hint('Everything placed on "' + l.name + '" is removed (Ctrl+Z restores it).'), [['Cancel', false], ['Delete', true, 'danger']])) !== true) return;
      E.begin('Delete layer contents'); for (const o of [...E.F.objs.values()]) if (o.l === l.id) E.delObj(o); E.commit();
      if (v === 'del') { for (const a of Object.values(E.P.assets)) if (a.layer === l.id) a.layer = 'custom'; E.P.layers.splice(E.P.layers.indexOf(l), 1); if (E.brush.layer === l.id) E.brush.layer = 'auto'; E.undoS.length = 0; E.redoS.length = 0; E.markDirty(); }
      E.selChanged(); renderLayers(); U.renderLib();
    }
  }
  async function newLayer() {
    const name = h('input', { type: 'text', value: 'New layer', style: { width: '100%' } }); const kind = h('select', {}, ...Object.keys(PF.KIND_RENDER).map((k) => h('option', { value: k }, k))); kind.value = 'prop'; const col = h('input', { type: 'color', value: '#7aa0e0' });
    if ((await modal('New layer', [row('Name', name), row('Kind', kind), row('Colour', col)], [['Cancel', null], ['Create', true, 'primary']])) !== true) return;
    let id = slug(name.value) || 'layer'; while (E.layer(id)) id = slug(name.value) + '_' + Math.random().toString(36).slice(2, 5);
    E.P.layers.push({ id, name: name.value.trim().slice(0, 60) || id, kind: kind.value, color: col.value, visible: true, locked: false, custom: true }); E.markDirty(); renderLayers();
  }
  U.renderLayers = renderLayers;
  U.dispose = () => { if (pv) { pv.clear(); pv.V.dispose(); } I.dispose(); clearTimeout(U._cntT); root.remove(); };
  left.show('lib'); I.dock.show('props'); U.toolChanged();
  return U;
}

// ---------------------------------------------------------------- library actions
async function duplicateAsset(E, id) {
  const a = E.P.assets[id]; let nid = id + '_v2'; let k = 2; while (E.P.assets[nid]) nid = id + '_v' + ++k;
  const c = JSON.parse(JSON.stringify(a)); c.id = nid; c.name = a.name + ' (variant ' + k + ')'; E.P.assets[nid] = PF.cleanAsset(c, E.P.layers); E.P.assets[nid].materials = c.materials.map((m) => PF.cleanMaterial(m)); E.P.assets[nid].thumb = a.thumb;
  await E.F.setAsset(E.P.assets[nid]); E.markDirty(); E.ui.selectLib(nid); E.ui.notify('Variant created — edit its materials / settings independently (Asset tab)', 'ok');
}
async function deleteAsset(E, id) {
  const a = E.P.assets[id]; let n = 0; for (const o of E.F.objs.values()) if (o.a === id) n++;
  if ((await modal('Delete "' + a.name + '"?', [hint('The asset is removed from the library' + (n ? ' together with its ' + fmtN(n) + ' placed instance(s)' : '') + '. Its files stay in paint-pack/assets (they are only removed when nothing uses them). This cannot be undone with Ctrl+Z.')], [['Cancel', false], ['Delete', true, 'danger']])) !== true) return;
  for (const o of [...E.sel]) if (o.a === id) E.sel.delete(o); E.F.removeAsset(id); delete E.P.assets[id]; E.brush.mix = E.brush.mix.filter((m) => m.a !== id);
  // undo history entries referring to the asset can no longer be applied
  E.undoS.length = 0; E.redoS.length = 0; if (E.placeAsset === id) E.placeAsset = null; E.ui.libSel = null; E.selChanged(); E.markDirty(); E.ui.renderLib(); E.ui.refreshBrush(); E.ui.renderLayers();
}

// ---------------------------------------------------------------- Export / Import / COMPILE dialogs
async function exportDialog(E) {
  const scope = h('select', {}, h('option', { value: 'all' }, 'Whole scene (all layers + the library)'), h('option', { value: 'layers' }, 'Selected layers'), h('option', { value: 'selection' }, 'Selected objects (' + E.sel.size + ')'));
  const n = new Map(); for (const o of E.F.objs.values()) n.set(o.l, (n.get(o.l) || 0) + 1);
  const boxes = E.P.layers.map((l) => { const c = h('input', { type: 'checkbox' }); c.checked = (n.get(l.id) || 0) > 0; c.dataset.id = l.id; return h('label', {}, c, ' ' + l.name + ' (' + fmtN(n.get(l.id) || 0) + ')'); });
  const chk = h('div', { cls: 'pe-chk' }, ...boxes); const lib = h('input', { type: 'checkbox' }); lib.checked = true;
  const v = await modal('Export .zip', [row('Export', scope), hint('Layers (for "Selected layers"):'), chk, h('label', {}, lib, ' include unused library assets (whole scene)'), hint('The .zip holds the models, textures, materials, placements, layers, brush presets and a manifest — import it on any machine.')], [['Cancel', null], ['Export', true, 'primary']]);
  if (v !== true) return; const layers = new Set(boxes.map((b) => b.querySelector('input')).filter((c) => c.checked).map((c) => c.dataset.id));
  E.ui.notify('Packing…', 'info', 1500);
  try { const { blob, manifest } = await IO.exportZip(E, { scope: scope.value, layers, library: lib.checked }); const name = 'colombo-environment-' + new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-') + '.zip'; download(name, blob, 'application/zip');
    E.ui.notify('Exported ' + name + ' — ' + manifest.counts.assets + ' assets, ' + fmtN(manifest.counts.instances) + ' instances, ' + manifest.counts.files + ' files (' + fmtB(blob.size) + ')' + (manifest.missing.length ? ' · ' + manifest.missing.length + ' file(s) were missing and are not inside' : ''), manifest.missing.length ? 'warn' : 'ok'); }
  catch (e) { E.ui.notify('Export failed: ' + ((e && e.message) || e), 'err'); }
}
async function importDialog(E, file = null) {
  if (IO.offline()) { E.ui.notify('Importing needs the dev server (npm run dev)', 'err'); return; }
  if (!file) { const f = await pickFiles({ accept: '.zip', multiple: false }); file = f[0]; } if (!file) return;
  let data; try { data = await IO.readImport(file); } catch (e) { await modal('Import failed', msg((e && e.message) || String(e), 'err'), [['OK', true]]); return; }
  const C = IO.conflicts(E, data); const real = C.filter((c) => !c.identical); const m = data.manifest;
  const mode = h('select', {}, h('option', { value: 'merge' }, 'Merge into the current scene'), h('option', { value: 'replace' }, 'Replace the current placements'));
  const conf = h('select', {}, h('option', { value: 'both' }, 'Keep both (imported get new ids)'), h('option', { value: 'replace' }, 'Replace mine with the imported'), h('option', { value: 'skip' }, 'Keep mine (use my version)'));
  const body = [msg(Object.keys(data.project.assets).length + ' asset(s) · ' + fmtN(data.list.length) + ' instance(s) · ' + data.project.layers.length + ' layer(s) · ' + data.files.size + ' file(s)' + (m ? ' · exported ' + new Date(m.exported).toLocaleString() + ' (' + m.scope + ')' : ''), 'info'),
    ...(data.version < PF.VERSION ? [msg('Older format v' + data.version + ' — converted on import.', 'warn')] : []), ...data.notes.map((t) => msg(t, 'warn')),
    ...(data.missing.length ? [msg(data.missing.length + ' file(s) are missing from the zip — those assets show as pink boxes until re-imported: ' + data.missing.slice(0, 4).join(', '), 'warn')] : []),
    ...(data.damaged.length ? [msg(data.damaged.length + ' file(s) are damaged (checksum mismatch) and were skipped: ' + data.damaged.slice(0, 4).join(', '), 'err')] : []),
    row('Mode', mode), ...(real.length ? [msg(real.length + ' asset id(s) already exist with different content: ' + real.slice(0, 5).map((c) => c.id + ' (yours: ' + c.mine + ')').join(', '), 'warn'), row('On conflict', conf)] : []),
    ...(C.length - real.length ? [hint(C.length - real.length + ' identical asset(s) are shared, not duplicated.')] : [])];
  if ((await modal('Import ' + file.name, body, [['Cancel', null], ['Import', true, 'primary']], { wide: true })) !== true) return;
  try { const r = await IO.applyImport(E, data, { mode: mode.value, conflict: conf.value }); E.ui.renderLib(); E.ui.renderLayers(); E.ui.notify('Imported ' + r.assets + ' asset(s) and ' + fmtN(r.instances) + ' instance(s) — Save to keep them', 'ok'); }
  catch (e) { E.ui.notify('Import failed: ' + ((e && e.message) || e), 'err'); }
}
async function compileDialog(E) {
  if (IO.offline()) { E.ui.notify('COMPILE needs the dev server (npm run dev)', 'err'); return; }
  const build = h('input', { type: 'checkbox' });
  const v = await modal('COMPILE the scene', [hint('Saves the project, validates every asset, model and texture reference, and writes the runtime scene (paint-pack/compiled/scene.json). The game build includes it automatically — npm run build copies it into dist/paint-pack, and build-exe.bat compiles it again and stops on errors, so the .exe shows the scene exactly as placed.'),
    h('label', {}, build, ' also run the production build now (npm run build → dist/, then verify the scene is inside)'), hint('Hidden layers are not compiled.')], [['Cancel', null], ['COMPILE', true, 'primary']]);
  if (v !== true) return;
  if (!(await E.save(true))) return; E.ui.notify('Compiling…', 'info', 1500);
  let r; try { r = await IO.compile(build.checked); } catch (e) { await modal('COMPILE failed', msg((e && e.message) || String(e), 'err'), [['OK', true]]); return; }
  E.report = r.report; E.keep(); const R = r.report || {}; const c = R.counts || {};
  const body = [msg(R.ok ? 'Compiled — ' + fmtN(c.instances) + ' instances · ' + c.assets + ' assets · ' + c.files + ' files (' + fmtB(R.bytes || 0) + ')' : 'FAILED: ' + (R.errors || []).length + ' error(s) — the scene was NOT compiled', R.ok ? 'ok' : 'err'),
    ...(R.errors || []).slice(0, 30).map((t) => msg(t, 'err')), ...(R.warnings || []).slice(0, 30).map((t) => msg(t, 'warn'))];
  const log = h('div', { cls: 'pe-log', style: { display: build.checked && R.ok ? '' : 'none' } }, 'starting the build…'); body.push(log);
  if (R.ok) body.push(hint('Next: run build-exe.bat — the desktop .exe will contain this scene. (Or play now: it is live in the dev game already.)'));
  const done = modal('COMPILE report', body, [['Close', true]], { wide: true });
  if (build.checked && R.ok) { const poll = async () => { if (!log.isConnected) return; try { const b = await IO.buildStatus(); const V = b.verify; const vs = V ? (V.scene ? 'dist/paint-pack/scene.json: ' + fmtN(V.instances) + ' instances, ' + V.files + ' file(s)' + (V.missing.length ? ', ' + V.missing.length + ' MISSING' : ' — all present') : 'scene NOT in dist (' + (V.error || '?') + ')') : ''; log.textContent = (Array.isArray(b.log) ? b.log : String(b.log || '').split('\n')).slice(-40).join('\n') + (b.running ? '\n… building' : '\n' + (b.ok ? 'Build finished — ' + vs : 'Build FAILED')); log.scrollTop = 1e9; if (b.running) setTimeout(poll, 1200); else E.ui.notify(b.ok ? 'Production build finished — dist/ contains the scene' : 'Production build failed — see the COMPILE report', b.ok ? 'ok' : 'err'); } catch (e) { log.textContent += '\n' + e.message; } }; setTimeout(poll, 600); }
  await done;
}
export { exportDialog, importDialog, compileDialog };
