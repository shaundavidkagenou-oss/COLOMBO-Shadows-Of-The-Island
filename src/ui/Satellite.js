// Satellite imagery for the pause map: the real 3D city photographed straight down with an orthographic camera.
// Tiles are captured on demand while the map is open (the world is paused then), under fixed late-morning light with sun shadows
// falling to the south-east, no fog, no people and no moving traffic. Two levels: 400 m overview tiles and 100 m close-up tiles.
import * as THREE from 'three';
import { updateMaterials } from '../gfx/Materials.js';
import { waterUniforms } from '../world/Water.js';

export const SAT = { x0: -800, z0: -1600, x1: 1200, z1: 1600, px: 512, sizes: [400, 100] };
const SUN_DIR = new THREE.Vector3(-0.42, 0.82, -0.38).normalize(); // light from the north-west (map convention): shadows fall down-right
const MAX_CLOSE = 72; // close-up tiles kept (LRU), ~1 MB each

export class Satellite {
  constructor(game) {
    this.g = game; this.tiles = new Map(); this.queue = []; this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 10, 1600);
    this.stats = { captured: 0, ms: 0 };
  }
  key(l, i, j) { return `${l}|${i}|${j}`; }
  cols(l) { return Math.ceil((SAT.x1 - SAT.x0) / SAT.sizes[l]); } rows(l) { return Math.ceil((SAT.z1 - SAT.z0) / SAT.sizes[l]); }
  // ready tile canvas or null (queued for capture, nearest-to-centre first)
  get(l, i, j, pri = 0) {
    const k = this.key(l, i, j); const t = this.tiles.get(k);
    if (t) { t.used = performance.now(); return t; }
    if (!this.queue.some((q) => q.k === k)) this.queue.push({ k, l, i, j, pri }); else { const q = this.queue.find((q) => q.k === k); q.pri = pri; }
    return null;
  }
  beginFrame() { this.queue.length = 0; }
  // capture queued tiles within a time budget (ms)
  pump(budget = 14) {
    if (!this.queue.length || !this.g.renderer || !this.g.scene) return 0;
    this.queue.sort((a, b) => a.l - b.l || a.pri - b.pri); const t0 = performance.now(); let n = 0;
    const st = this.enter();
    try { while (this.queue.length && (n === 0 || performance.now() - t0 < budget)) { const q = this.queue.shift(); if (this.tiles.has(q.k)) continue; this.capture(q); n++; } }
    finally { this.leave(st); }
    this.stats.ms += performance.now() - t0; this.stats.captured += n; this.evict(); return n;
  }
  evict() {
    const close = [...this.tiles.entries()].filter(([, t]) => t.l === 1); if (close.length <= MAX_CLOSE) return;
    close.sort((a, b) => a[1].used - b[1].used); for (let i = 0; i < close.length - MAX_CLOSE; i++) this.tiles.delete(close[i][0]);
  }
  // ---------------------------------------------------------------- daylight studio state
  enter() {
    const g = this.g, A = g.atmos, R = g.renderer, S = g.scene; const st = { vis: [], lights: [] };
    st.sun = { col: A.sun.color.clone(), int: A.sun.intensity, pos: A.sun.position.clone(), tgt: A.sun.target.position.clone(), cam: { ...A.sun.shadow.camera }, cast: A.sun.castShadow };
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
    A.sun.color.setRGB(1, 0.96, 0.9); A.sun.intensity = 2.6; A.sun.castShadow = true;
    A.hemi.color.setRGB(0.53, 0.66, 0.88); A.hemi.groundColor.setRGB(0.42, 0.36, 0.3); A.hemi.intensity = 0.62; A.ambient.intensity = 0;
    R.toneMappingExposure = 0.86; S.fog = null; S.environmentIntensity = 0.6; R.shadowMap.autoUpdate = true;
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
    A.hemi.color.copy(st.hemi.col); A.hemi.groundColor.copy(st.hemi.gnd); A.hemi.intensity = st.hemi.int; A.ambient.intensity = st.amb;
    R.toneMappingExposure = st.exp; S.fog = st.fog; S.environmentIntensity = st.envI; R.shadowMap.autoUpdate = st.autoShadow; R.shadowMap.needsUpdate = true;
    updateMaterials(A.night, A.indoor ? 0 : A.wet, A.hour);
    waterUniforms.uSunDir.value.copy(st.water.dir); waterUniforms.uSunColor.value.copy(st.water.col); waterUniforms.uNight.value = st.water.night; waterUniforms.uRain.value = st.water.rain; waterUniforms.uCloud.value = st.water.cloud; waterUniforms.uReflOn.value = st.water.refl;
    if (st.worldVis !== undefined) g.world.root.visible = st.worldVis;
    R.setRenderTarget(st.rt); R.setViewport(st.vp); R.setScissor(st.sc); R.setScissorTest(st.scT);
  }
  // ---------------------------------------------------------------- one tile
  capture(q) {
    const g = this.g, R = g.renderer, A = g.atmos, size = SAT.sizes[q.l];
    const x0 = SAT.x0 + q.i * size, z0 = SAT.z0 + q.j * size, cx = x0 + size / 2, cz = z0 + size / 2;
    // street furniture and trees normally only exist near the player: show the chunks under this tile
    const W = g.world;
    const touched = [];
    if (W && W.chunks) for (const c of W.chunks) { if (Math.abs(c.cx - cx) > size / 2 + 80 || Math.abs(c.cz - cz) > size / 2 + 80) continue; touched.push([c, c.props.visible, c.trees ? c.trees.visible : false]); c.props.visible = true; if (c.trees) c.trees.visible = true; }
    const cam = this.cam; cam.left = -size / 2; cam.right = size / 2; cam.top = size / 2; cam.bottom = -size / 2; cam.near = 10; cam.far = 1600;
    cam.position.set(cx, 900, cz); cam.up.set(0, 0, -1); cam.lookAt(cx, 0, cz); cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    const ext = size / 2 * 1.25 + 70; const sc = A.sun.shadow.camera; sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext; sc.near = 1; sc.far = 1800; sc.updateProjectionMatrix();
    A.sun.position.set(cx, 0, cz).addScaledVector(SUN_DIR, 800); A.sun.target.position.set(cx, 0, cz); A.sun.target.updateMatrixWorld(); A.sun.updateMatrixWorld();
    const pr = R.getPixelRatio(); const bw = R.domElement.width, bh = R.domElement.height; const rs = Math.max(256, Math.min(1024, bw, bh)); const css = rs / pr;
    R.setRenderTarget(null); R.setScissorTest(true); R.setViewport(0, 0, css, css); R.setScissor(0, 0, css, css);
    R.render(g.scene, cam);
    const c = document.createElement('canvas'); c.width = c.height = SAT.px; const ctx = c.getContext('2d'); ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(R.domElement, 0, bh - rs, rs, rs, 0, 0, SAT.px, SAT.px);
    for (const [ch, p, t] of touched) { ch.props.visible = p; if (ch.trees) ch.trees.visible = t; }
    this.tiles.set(q.k, { c, l: q.l, i: q.i, j: q.j, x0, z0, size, born: performance.now(), used: performance.now() });
  }
}
