// Satellite imagery for the pause map: the real 3D city photographed straight down with an orthographic camera.
// Tiles are captured on demand while the map is open (the world is paused then), under fixed late-morning light with sun shadows
// falling to the south-east, no fog, no people and no moving traffic. Two levels: 400 m overview tiles and 100 m close-up tiles.
// Smoothness: (1) captures draw with the game's own shader programs (LinearCapture.js) — drawing to the canvas used to compile a
// second program for every material in view on the first open (a multi-second freeze); (2) a tile is rendered as four quarter
// tiles, one quarter per step, so a map frame never carries a whole 400 m render with its shadow pass; (3) finished tiles are
// kept in IndexedDB for this build of the game, so later sessions open the map with the imagery already there (decoded off the
// main thread by createImageBitmap) instead of capturing it again.
import * as THREE from 'three';
import { updateMaterials } from '../gfx/Materials.js';
import { waterUniforms } from '../world/Water.js';
import { captureToCanvas, neutralFog } from '../gfx/LinearCapture.js';

export const SAT = { x0: -800, z0: -1600, x1: 1200, z1: 1600, px: 512, sizes: [400, 100] };
const SUN_DIR = new THREE.Vector3(-0.42, 0.82, -0.38).normalize(); // light from the north-west (map convention): shadows fall down-right
const MAX_CLOSE = 72; // close-up tiles kept (LRU), ~1 MB each

export class Satellite {
  constructor(game) {
    this.g = game; this.tiles = new Map(); this.queue = []; this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 10, 1600);
    this.stats = { captured: 0, ms: 0, parts: 0, loaded: 0 }; this.job = null; this.loading = new Set(); this.stored = new Set(); this.db = null; this.toSave = []; this.saving = false;
    this.openStore();
  }
  key(l, i, j) { return `${l}|${i}|${j}`; }
  cols(l) { return Math.ceil((SAT.x1 - SAT.x0) / SAT.sizes[l]); } rows(l) { return Math.ceil((SAT.z1 - SAT.z0) / SAT.sizes[l]); }
  // ready tile canvas or null (queued for capture, nearest-to-centre first; a tile kept from an earlier session is loaded instead)
  get(l, i, j, pri = 0) {
    const k = this.key(l, i, j); const t = this.tiles.get(k);
    if (t) { t.used = performance.now(); return t; }
    if (this.loading.has(k)) return null;
    if (this.stored.has(k)) { this.load(k, l, i, j); return null; }
    const q = this.queue.find((x) => x.k === k); if (q) q.pri = pri; else this.queue.push({ k, l, i, j, pri });
    return null;
  }
  beginFrame() { this.queue.length = 0; }
  // capture queued tiles within a time budget (ms): one quarter tile per step, at least one step per call
  pump(budget = 14) {
    if (!this.queue.length && !this.job) { this.flushSave(); return 0; } // the view is complete: now encode finished tiles for IndexedDB, one at a time
    if (!this.g.renderer || !this.g.scene) return 0;
    this.queue.sort((a, b) => a.l - b.l || a.pri - b.pri); const t0 = performance.now(); let n = 0, steps = 0;
    const st = this.enter();
    try {
      while (steps === 0 || performance.now() - t0 < budget) {
        if (!this.job) { let q = null; while (this.queue.length && !q) { const c = this.queue.shift(); if (!this.tiles.has(c.k) && !this.loading.has(c.k)) q = c; } if (!q) break; this.job = this.startTile(q); }
        this.capturePart(this.job); steps++;
        if (this.job.part === 4) { this.finishTile(this.job); this.job = null; n++; }
      }
    } finally { this.leave(st); }
    this.stats.ms += performance.now() - t0; this.stats.captured += n; this.stats.parts += steps; this.evict(); return n;
  }
  evict() {
    const close = [...this.tiles.entries()].filter(([, t]) => t.l === 1); if (close.length <= MAX_CLOSE) return;
    close.sort((a, b) => a[1].used - b[1].used); for (let i = 0; i < close.length - MAX_CLOSE; i++) { const t = close[i][1]; if (t.c && t.c.close) t.c.close(); this.tiles.delete(close[i][0]); }
  }
  // ---------------------------------------------------------------- kept tiles (IndexedDB, per build + quality)
  storeOn() { return typeof indexedDB !== 'undefined' && typeof createImageBitmap === 'function' && (typeof location === 'undefined' || !/[?&]test\b/.test(location.search) || /[?&]satcache\b/.test(location.search)); }
  prefix() { const b = typeof __COLOMBO_BUILD__ !== 'undefined' ? __COLOMBO_BUILD__ : 'dev'; let q = 'high'; try { q = JSON.parse(localStorage.getItem('colombo.settings.v1') || '{}').quality || 'high'; } catch (e) { /* default */ } return `${b}|${q}|`; } // eslint-disable-line no-undef
  openStore() {
    if (!this.storeOn()) return; let req; try { req = indexedDB.open('colombo-satellite', 1); } catch (e) { return; }
    req.onupgradeneeded = () => { req.result.createObjectStore('tiles'); };
    req.onsuccess = () => { this.db = req.result; const pre = this.prefix(); const tx = this.db.transaction('tiles', 'readwrite'); const os = tx.objectStore('tiles'); const kr = os.getAllKeys();
      kr.onsuccess = () => { for (const key of kr.result) { if (typeof key === 'string' && key.startsWith(pre)) this.stored.add(key.slice(pre.length)); else os.delete(key); } }; }; // another build's tiles are dropped
    req.onerror = () => { this.db = null; };
  }
  load(k, l, i, j) {
    if (!this.db) return; this.loading.add(k); const size = SAT.sizes[l]; const fail = () => { this.loading.delete(k); this.stored.delete(k); };
    try { const r = this.db.transaction('tiles', 'readonly').objectStore('tiles').get(this.prefix() + k);
      r.onsuccess = () => { if (!r.result) return fail(); createImageBitmap(r.result).then((bmp) => { this.loading.delete(k); const now = performance.now(); this.tiles.set(k, { c: bmp, l, i, j, x0: SAT.x0 + i * size, z0: SAT.z0 + j * size, size, born: now, used: now }); this.stats.loaded++; }, fail); };
      r.onerror = fail; } catch (e) { fail(); }
  }
  save(k, c) { if (this.db && c.toBlob) { this.toSave.push([k, c]); this.idleSave(); } }
  idleSave() { // also in the browser's idle gaps (between game frames, map open or not), so a quick look at the map is still kept
    if (this.idleQueued || !this.toSave.length) return; this.idleQueued = true;
    const run = () => { this.idleQueued = false; this.flushSave(); }; if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 8000 }); else setTimeout(run, 500);
  }
  flushSave() {
    if (this.saving || !this.toSave.length || !this.db) return; const [k, c] = this.toSave.shift(); const pre = this.prefix(); this.saving = true;
    c.toBlob((blob) => { this.saving = false; this.idleSave(); if (!blob || !this.db) return; try { this.db.transaction('tiles', 'readwrite').objectStore('tiles').put(blob, pre + k); this.stored.add(k); } catch (e) { /* quota / closed: keep it in memory only */ } }, 'image/webp', 0.92);
  }
  // ---------------------------------------------------------------- daylight studio state
  enter() {
    const g = this.g, A = g.atmos, R = g.renderer, S = g.scene; const st = { vis: [], lights: [] };
    st.sun = { col: A.sun.color.clone(), int: A.sun.intensity, pos: A.sun.position.clone(), tgt: A.sun.target.position.clone(), cam: { ...A.sun.shadow.camera }, cast: A.sun.castShadow };
    st.farI = A.sunFar ? A.sunFar.shadow.intensity : 1; if (A.sunFar) A.sunFar.shadow.intensity = 0; A.farOff = true; // the far sun-shadow map holds the game's sun direction round the player: not used under the studio sun
    st.hemi = { col: A.hemi.color.clone(), gnd: A.hemi.groundColor.clone(), int: A.hemi.intensity }; st.amb = A.ambient.intensity;
    st.exp = R.toneMappingExposure; st.fog = S.fog; st.envI = S.environmentIntensity; st.autoShadow = R.shadowMap.autoUpdate;
    st.water = { dir: waterUniforms.uSunDir.value.clone(), col: waterUniforms.uSunColor.value.clone(), night: waterUniforms.uNight.value, rain: waterUniforms.uRain.value, cloud: waterUniforms.uCloud.value, refl: waterUniforms.uReflOn.value };
    st.vp = new THREE.Vector4(); R.getViewport(st.vp); st.sc = new THREE.Vector4(); R.getScissor(st.sc); st.scT = R.getScissorTest(); st.rt = R.getRenderTarget();
    const hide = (o) => { if (o && o.visible) { o.visible = false; st.vis.push(o); } };
    hide(A.sky); hide(A.clouds); hide(A.stars); hide(A.moon); hide(A.moonHalo); hide(A.rain);
    for (const c of S.children) {
      if (c.isPointLight || c.isSpotLight) { st.lights.push([c, c.intensity]); c.intensity = 0; continue; }
      if (c.children && c.children.some((m) => m.isSkinnedMesh)) hide(c); // people
      else if (c.name && c.name.startsWith('train')) hide(c);
    }
    for (const v of globalThis.__liveVehicles || []) if (!v.parked && v.mesh) hide(v.mesh);
    S.traverse((o) => { if ((o.isPointLight || o.isSpotLight) && o.parent !== S) { st.lights.push([o, o.intensity]); o.intensity = 0; } });
    A.sun.color.setRGB(1, 0.96, 0.9); A.sun.intensity = 2.6; /* castShadow left as the quality preset has it: toggling it selects other shader programs (and with the shadow map off it drew nothing anyway) */
    A.hemi.color.setRGB(0.53, 0.66, 0.88); A.hemi.groundColor.setRGB(0.42, 0.36, 0.3); A.hemi.intensity = 0.62; A.ambient.intensity = 0;
    R.toneMappingExposure = 0.86; st.fogBack = neutralFog(S); S.environmentIntensity = 0.6; /* fog kept in the programs, pushed out of range: removing it would compile no-fog variants of everything in view */ R.shadowMap.autoUpdate = true;
    updateMaterials(0, 0, 10.5);
    waterUniforms.uSunDir.value.copy(SUN_DIR); waterUniforms.uSunColor.value.setRGB(1, 0.96, 0.9); waterUniforms.uNight.value = 0; waterUniforms.uRain.value = 0; waterUniforms.uCloud.value = 0.2; waterUniforms.uReflOn.value = 0; // planar reflection is rendered for the game camera: meaningless from overhead
    st.indoorHidden = g.indoor; if (g.indoor && g.world) { st.worldVis = g.world.root.visible; g.world.root.visible = true; }
    if (g._hiddenOut && g._hiddenOut.length) for (const o of g._hiddenOut) { o.visible = true; st.vis.push({ restoreHidden: o }); }
    return st;
  }
  leave(st) {
    const g = this.g, A = g.atmos, R = g.renderer, S = g.scene;
    for (const o of st.vis) { if (o.restoreHidden) o.restoreHidden.visible = false; else o.visible = true; }
    for (const [l, i] of st.lights) l.intensity = i;
    A.sun.color.copy(st.sun.col); A.sun.intensity = st.sun.int; A.sun.position.copy(st.sun.pos); A.sun.target.position.copy(st.sun.tgt); A.sun.target.updateMatrixWorld(); A.sun.castShadow = st.sun.cast;
    const sc = A.sun.shadow.camera; Object.assign(sc, { left: st.sun.cam.left, right: st.sun.cam.right, top: st.sun.cam.top, bottom: st.sun.cam.bottom, near: st.sun.cam.near, far: st.sun.cam.far }); sc.updateProjectionMatrix();
    if (A.sunFar) { A.sunFar.shadow.intensity = st.farI; A.far.dirty = true; } A.farOff = false;
    A.hemi.color.copy(st.hemi.col); A.hemi.groundColor.copy(st.hemi.gnd); A.hemi.intensity = st.hemi.int; A.ambient.intensity = st.amb;
    R.toneMappingExposure = st.exp; st.fogBack(); S.environmentIntensity = st.envI; R.shadowMap.autoUpdate = st.autoShadow; R.shadowMap.needsUpdate = true;
    updateMaterials(A.night, A.indoor ? 0 : A.wet, A.hour);
    waterUniforms.uSunDir.value.copy(st.water.dir); waterUniforms.uSunColor.value.copy(st.water.col); waterUniforms.uNight.value = st.water.night; waterUniforms.uRain.value = st.water.rain; waterUniforms.uCloud.value = st.water.cloud; waterUniforms.uReflOn.value = st.water.refl;
    if (st.worldVis !== undefined) g.world.root.visible = st.worldVis;
    R.setRenderTarget(st.rt); R.setViewport(st.vp); R.setScissor(st.sc); R.setScissorTest(st.scT);
  }
  // ---------------------------------------------------------------- one tile, in four quarters
  startTile(q) {
    const size = SAT.sizes[q.l]; const c = document.createElement('canvas'); c.width = c.height = SAT.px; const ctx = c.getContext('2d'); ctx.imageSmoothingQuality = 'high';
    return { q, size, x0: SAT.x0 + q.i * size, z0: SAT.z0 + q.j * size, part: 0, c, ctx, frame: -1, restarts: 0, solo: false };
  }
  capturePart(J) {
    const g = this.g, R = g.renderer, A = g.atmos, h = J.size / 2;
    if (J.part > 0 && !J.solo && R.info.render.frame !== J.frame) { J.part = 0; J.solo = ++J.restarts > 2; } // the game drew in between (map closed mid-tile): the shared sun shadow is gone, start the tile again
    const px = J.part & 1, pz = J.part >> 1;
    const x0 = J.x0 + px * h, z0 = J.z0 + pz * h, cx = x0 + h / 2, cz = z0 + h / 2;
    // street furniture and trees normally only exist near the player: show the chunks under this quarter
    const W = g.world; const touched = [];
    if (W && W.chunks) for (const c of W.chunks) { if (Math.abs(c.cx - cx) > h / 2 + 80 || Math.abs(c.cz - cz) > h / 2 + 80) continue; touched.push([c, c.props.visible, c.trees ? c.trees.visible : false]); c.props.visible = true; if (c.trees) c.trees.visible = true; }
    const cam = this.cam; cam.left = -h / 2; cam.right = h / 2; cam.top = h / 2; cam.bottom = -h / 2; cam.near = 10; cam.far = 1600;
    cam.position.set(cx, 900, cz); cam.up.set(0, 0, -1); cam.lookAt(cx, 0, cz); cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    // the sun's shadow box covers the WHOLE tile plus its margin of casters, exactly as a whole-tile capture did; it is drawn with the
    // first quarter and reused by the other three (nothing else renders while the map is open), so quartering adds no shadow work
    const tcx = J.x0 + h, tcz = J.z0 + h; const ext = h + J.size / 8 + 70; const sc = A.sun.shadow.camera; sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext; sc.near = 1; sc.far = 1800; sc.updateProjectionMatrix();
    A.sun.position.set(tcx, 0, tcz).addScaledVector(SUN_DIR, 800); A.sun.target.position.set(tcx, 0, tcz); A.sun.target.updateMatrixWorld(); A.sun.updateMatrixWorld();
    R.shadowMap.autoUpdate = J.part === 0 || !!J.solo; R.shadowMap.needsUpdate = false; /* solo: something keeps drawing between quarters, so each quarter draws its own (whole-tile) shadow */
    if (J.part === 0 || J.solo) for (const c of W && W.chunks ? W.chunks : []) { if (Math.abs(c.cx - tcx) > h + 80 || Math.abs(c.cz - tcz) > h + 80 || touched.some((e) => e[0] === c)) continue; touched.push([c, c.props.visible, c.trees ? c.trees.visible : false]); c.props.visible = true; if (c.trees) c.trees.visible = true; } // the whole tile's street furniture casts into the shared shadow
    const pr = R.getPixelRatio(); const bw = R.domElement.width, bh = R.domElement.height; const rs = Math.max(128, Math.floor(Math.max(256, Math.min(1024, bw, bh)) / 2)); const css = rs / pr; // same pixels per metre as a whole-tile render
    const tA = performance.now();
    captureToCanvas(R, g.scene, cam, 0, 0, css, css); // the game's own shader programs (see LinearCapture.js), tone-mapped into the canvas corner
    const hp = SAT.px / 2; const tB = performance.now(); J.ctx.drawImage(R.domElement, 0, bh - rs, rs, rs, px * hp, pz * hp, hp, hp); const tC = performance.now(); this.stats.tRender = (this.stats.tRender || 0) + tB - tA; this.stats.tDraw = (this.stats.tDraw || 0) + tC - tB; // screen up = north (−z): quarter pz 0 is the top half
    for (const [ch, p, t] of touched) { ch.props.visible = p; if (ch.trees) ch.trees.visible = t; }
    J.part++; J.frame = R.info.render.frame;
  }
  finishTile(J) {
    const now = performance.now(); const q = J.q; this.tiles.set(q.k, { c: J.c, l: q.l, i: q.i, j: q.j, x0: J.x0, z0: J.z0, size: J.size, born: now, used: now }); this.save(q.k, J.c);
  }
}
