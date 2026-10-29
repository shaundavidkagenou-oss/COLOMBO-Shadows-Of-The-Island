// Builds and streams the static city: ground, buildings (base + streamed detail), landmarks, props, trees, water.
import * as THREE from 'three';
import { MultiBuilder } from '../gfx/MeshBuilder.js';
import { MAT } from '../gfx/Materials.js';
import { generatePlan, plan, NCX, NCZ, CHUNK, chunkCenter } from './CityPlan.js';
import { buildGround } from './GroundBuilder.js';
import { buildBase, buildDetail, buildWall, buildWindows } from './BuildingGen.js';
import { buildLandmarks } from './Landmarks.js';
import { buildPropGeometries, buildPropsForChunk, updateSignals, initGlowTexture } from './Props.js';
import { buildTreeGeometries, buildTreesForChunk, windUniform } from './Vegetation.js';
import { buildWater, WaterReflection } from './Water.js';
import { buildParks } from './Parks.js';
import { GrassField, upgradeGroundGrass } from './Grass.js';
import { Collision } from './Collision.js';
import * as L from './Layout.js';
import { RNG } from '../core/rng.js';

const tick = () => new Promise((r) => setTimeout(r, 0));

// static subtree: compute world matrices once, then skip it in the per-frame scene.updateMatrixWorld traversal
function freezeStatic(g) { if (!g) return; g.updateMatrixWorld(true); g.traverse((o) => { o.matrixAutoUpdate = false; }); g.updateMatrixWorld = function (force) { if (this.userData.mwDirty || force === 'static') { this.userData.mwDirty = false; THREE.Object3D.prototype.updateMatrixWorld.call(this, true); } }; }
function refreshStatic(g) { g.traverse((o) => { o.matrixAutoUpdate = false; }); g.userData.mwDirty = true; }
export class World {
  constructor(scene) {
    this.scene = scene; this.root = new THREE.Group(); this.root.name = 'world'; scene.add(this.root);
    this.collision = new Collision(); this.chunks = []; this.detailQueue = []; this.signalTimer = 0; this.t = 0;
    this.detailRadius = 330; this.windowRadius = 150; this.propRadius = 430; this.treeRadius = 520;
    this.lampLights = [];
  }
  async build(progress = () => {}, quality = 'high') {
    progress(0.0, 'Planning Colombo'); await tick();
    generatePlan();
    this.plan = plan; this.collision.addAll(plan.colliders);
    progress(0.08, 'Laying roads and pavements'); await tick();
    const ground = buildGround(() => {});
    progress(0.2, 'Raising landmarks'); await tick();
    const lm = buildLandmarks(); this.landmarks = lm; this.root.add(lm.group); this.collision.addAll(lm.colliders);
    progress(0.3, 'Street furniture and trees'); await tick();
    buildPropGeometries(); buildTreeGeometries(); initGlowTexture();
    for (let idx = 0; idx < NCX * NCZ; idx++) {
      const ch = plan.byChunk[idx]; const [cx, cz] = chunkCenter(idx);
      const c = { idx, cx, cz, group: new THREE.Group(), detail: null, detailState: 0, props: null, trees: null };
      c.group.name = 'chunk' + idx;
      const gm = ground[idx]; if (gm) for (const m of gm.toMeshes(MAT, { cast: false, receive: true })) c.group.add(m);
      const mb = new MultiBuilder(); for (const b of ch.buildings) buildBase(b, mb); for (const w of ch.walls || []) buildWall(w, mb);
      for (const m of mb.toMeshes(MAT, { cast: true, receive: true })) { if (m.name === 'ao') { m.castShadow = false; m.receiveShadow = false; m.renderOrder = 1; } c.group.add(m); }
      c.props = buildPropsForChunk(ch); c.props.visible = false; c.group.add(c.props);
      c.trees = buildTreesForChunk(ch); if (c.trees) { c.trees.visible = false; c.group.add(c.trees); }
      c.lamps = c.props.userData.lamps || [];
      this.root.add(c.group); this.chunks.push(c);
      if (idx % 6 === 0) { progress(0.3 + 0.55 * idx / (NCX * NCZ), 'Building districts'); await tick(); }
    }
    this.parks = buildParks(MAT); this.root.add(this.parks);
    upgradeGroundGrass(MAT.grass, 0.8); upgradeGroundGrass(MAT.lawn, 0.3);
    this.grass = new GrassField(this, this.collision); this.grass.setQuality(this.quality || 'high'); this.root.add(this.grass.mesh);
    progress(0.86, 'Filling the ocean and Beira Lake'); await tick();
    this.water = buildWater(); this.root.add(this.water); this.waterRefl = new WaterReflection(this.water);
    progress(0.9, 'Outer suburbs'); await tick();
    this.buildOuterRing();
    // point-light pool for nearby street lamps at night (fixed count to avoid shader recompiles)
    const nLights = quality === 'low' ? 0 : quality === 'medium' ? 3 : 5;
    for (let i = 0; i < nLights; i++) { const p = new THREE.PointLight(0xffc98a, 0, 28, 1.6); p.castShadow = false; this.scene.add(p); this.lampLights.push(p); }
    // FPS: the city geometry never moves, so its ~9k scene nodes are frozen — matrices are computed once here instead of
    // every frame (updateMatrixWorld skips these subtrees). Visual output is identical.
    for (const c of this.chunks) freezeStatic(c.group); freezeStatic(this.parks); freezeStatic(this.outer);
    progress(1, 'City ready');
  }
  // Low-detail skyline beyond the playable bounds (Dehiwala, Rajagiriya, Kelaniya) so the horizon isn't empty.
  buildOuterRing() {
    const mb = new MultiBuilder(); const rng = new RNG(4242); const B = L.BOUNDS;
    const styles = ['f_apartment', 'f_shop', 'f_office', 'f_villa', 'f_shop2', 'f_glass'];
    const place = (x, z, w, d, h, st) => {
      const m = mb.get(st), roof = mb.get('roofFlat'); const x0 = x - w / 2, x1 = x + w / 2, z0 = z - d / 2, z1 = z + d / 2;
      const tint = [0.85 + rng.next() * 0.15, 0.82 + rng.next() * 0.15, 0.78 + rng.next() * 0.15]; const v1 = h / 6.6;
      m.wall(x0, z1, x1, z1, 0, h, [0, 0, w / 12.8, v1], tint); m.wall(x1, z1, x1, z0, 0, h, [0, 0, d / 12.8, v1], tint);
      m.wall(x1, z0, x0, z0, 0, h, [0, 0, w / 12.8, v1], tint); m.wall(x0, z0, x0, z1, 0, h, [0, 0, d / 12.8, v1], tint);
      roof.hrect(x0, z0, x1, z1, h, 8);
    };
    const ground = mb.get('grass');
    // east band
    ground.hrect(B.maxX, B.minZ - 200, B.maxX + 900, B.maxZ + 400, L.LAND_Y - 0.05, 40);
    ground.hrect(-400, B.maxZ, B.maxX, B.maxZ + 400, L.LAND_Y - 0.05, 40);
    for (let x = B.maxX + 15; x < B.maxX + 850; x += rng.range(22, 40)) for (let z = B.minZ - 150; z < B.maxZ + 350; z += rng.range(22, 45)) {
      if (rng.chance(0.25)) continue; const far = (x - B.maxX) / 850; const h = rng.chance(0.08) ? rng.range(30, 80) : rng.range(6, 18) * (1 - far * 0.3);
      place(x, z, rng.range(10, 20), rng.range(10, 22), h, rng.pick(styles));
    }
    for (let x = -380; x < B.maxX; x += rng.range(22, 40)) for (let z = B.maxZ + 15; z < B.maxZ + 350; z += rng.range(22, 45)) { if (rng.chance(0.3)) continue; place(x, z, rng.range(10, 20), rng.range(10, 20), rng.range(6, 16), rng.pick(styles)); }
    const g = new THREE.Group(); for (const m of mb.toMeshes(MAT, { cast: false, receive: false })) g.add(m); this.outer = g; this.root.add(g);
    // invisible boundary handled by Collision bounds clamp
  }
  // Called each frame with the focus (player/camera) position.
  update(dt, focus, camera, atmos) {
    this.t += dt; windUniform.value += dt * (0.6 + (atmos ? atmos.w.wind : 0.3));
    this.signalTimer -= dt; if (this.signalTimer <= 0) { this.signalTimer = 0.25; updateSignals(this.simTime ?? this.t); }
    const fx = focus.x, fz = focus.z; let budget = 1;
    for (const c of this.chunks) {
      const d = Math.max(0, Math.hypot(c.cx - fx, c.cz - fz) - CHUNK * 0.7);
      c.props.visible = d < this.propRadius;
      if (c.trees) c.trees.visible = d < this.treeRadius;
      if (d < this.detailRadius) {
        if (!c.detail && budget > 0) { budget--; this.buildDetailFor(c); }
        else if (c.detail) c.detail.visible = true;
      } else if (c.detail) { c.detail.visible = false; if (d > this.detailRadius + 300) this.disposeDetail(c); }
      if (d < this.windowRadius) { if (!c.win && budget > 0) { budget--; this.buildWindowsFor(c); } else if (c.win) c.win.visible = true; }
      else if (c.win) { c.win.visible = false; if (d > this.windowRadius + 120) this.disposeWindows(c); }
    }
    if (this.grass) this.grass.update(dt, focus, atmos ? atmos.w.wind : 0.3);
    // landmark animation
    const an = this.landmarks.anim;
    if (an.lotusBeacon) an.lotusBeacon.visible = (this.t % 1.6) < 0.5; // aviation obstruction light
    if (an.lotus && atmos) { an.lotus.opacity = atmos.night * (0.5 + Math.sin(this.t * 0.8) * 0.15); const hue = (0.83 + Math.sin(this.t * 0.05) * 0.12 + 1) % 1; an.lotus.color.setHSL(hue, 0.85, 0.55); an.lotus.visible = atmos.night > 0.02; } if (an.lotusStem && an.lotus) { an.lotusStem.color.copy(an.lotus.color); an.lotusStem.opacity = Math.min(1, an.lotus.opacity * 1.1); an.lotusStem.visible = an.lotus.visible; }
    for (const m of this.landmarks.labels) if (m.emissiveIntensity !== undefined && atmos) m.emissiveIntensity = 0.2 + atmos.night * 0.9;
    // street-lamp point lights near the focus
    if (this.lampLights.length && atmos) {
      const on = atmos.night > 0.3;
      if (on) {
        const near = []; const ci = this.chunks;
        for (const c of ci) { if (Math.abs(c.cx - fx) > 300 || Math.abs(c.cz - fz) > 300) continue; for (const p of c.lamps) { const d2 = (p[0] - fx) ** 2 + (p[2] - fz) ** 2; if (d2 < 120 * 120) near.push([d2, p]); } }
        near.sort((a, b) => a[0] - b[0]);
        this.lampLights.forEach((l, i) => { const n = near[i]; if (n) { l.position.set(n[1][0], n[1][1] - 0.4, n[1][2]); l.intensity = atmos.night * 30; } else l.intensity = 0; });
      } else this.lampLights.forEach((l) => (l.intensity = 0));
    }
  }
  buildDetailFor(c) {
    const ch = plan.byChunk[c.idx]; const mb = new MultiBuilder();
    for (const b of ch.buildings) buildDetail(b, mb);
    const g = new THREE.Group(); for (const m of mb.toMeshes(MAT, { cast: true, receive: true })) g.add(m);
    c.detail = g; c.group.add(g); refreshStatic(c.group);
  }
  // near tier: 3D window joinery + reflective panes (see BuildingGen.buildWindows)
  buildWindowsFor(c) {
    const ch = plan.byChunk[c.idx]; const solid = new MultiBuilder(), glass = new MultiBuilder();
    for (const b of ch.buildings) buildWindows(b, solid, glass);
    const g = new THREE.Group(); g.name = 'windows' + c.idx;
    for (const m of solid.toMeshes(MAT, { cast: false, receive: true })) g.add(m);
    for (const m of glass.toMeshes(MAT, { cast: false, receive: false })) { m.renderOrder = 2; g.add(m); }
    c.win = g; c.group.add(g); refreshStatic(c.group);
  }
  disposeWindows(c) { c.group.remove(c.win); c.win.traverse((m) => m.geometry && m.geometry.dispose()); c.win = null; }
  disposeDetail(c) { c.group.remove(c.detail); c.detail.traverse((m) => m.geometry && m.geometry.dispose()); c.detail = null; }
  // Force detail around a point (used before cinematics / after teleport)
  warm(x, z) { for (const c of this.chunks) { const d = Math.hypot(c.cx - x, c.cz - z) - CHUNK * 0.7; if (!c.detail && d < this.detailRadius) this.buildDetailFor(c); if (!c.win && d < this.windowRadius) this.buildWindowsFor(c); } }
  // same as warm(), one chunk per frame with progress (used by the enter-game loading screen)
  async warmAsync(points, progress = () => {}) {
    const need = this.chunks.filter((c) => !c.detail && points.some(([x, z]) => Math.hypot(c.cx - x, c.cz - z) - CHUNK * 0.7 < this.detailRadius));
    for (let i = 0; i < need.length; i++) { const c = need[i]; if (!c.detail) this.buildDetailFor(c); if (!c.win && points.some(([x, z]) => Math.hypot(c.cx - x, c.cz - z) - CHUNK * 0.7 < this.windowRadius)) this.buildWindowsFor(c); progress((i + 1) / need.length); if (i % 2 === 1) await new Promise((r) => requestAnimationFrame(r)); }
    progress(1); return need.length;
  }
  setQuality(q) { this.quality = q; if (this.grass) this.grass.setQuality(q); const s = q === 'low' ? 0.6 : q === 'medium' ? 0.8 : q === 'ultra' ? 1.25 : 1; this.detailRadius = 330 * s; this.windowRadius = q === 'low' ? 0 : q === 'medium' ? 90 : q === 'ultra' ? 210 : 150; this.propRadius = 430 * s; this.treeRadius = 520 * s; }
}
export { plan };
