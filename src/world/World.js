// Builds and streams the static city: ground, buildings (base + streamed detail), landmarks, props, trees, water.
import * as THREE from 'three';
import { MultiBuilder, SliceBuild, meshFor, FOLIAGE } from '../gfx/MeshBuilder.js';
import { MAT } from '../gfx/Materials.js';
import { generatePlan, plan, NCX, NCZ, CHUNK, chunkCenter, refitTreeCrowns, landmarkTreeBoxes } from './CityPlan.js';
import { buildGround } from './GroundBuilder.js';
import { buildBase, buildDetail, buildWall, buildWindows, windowTasks, frontColumns } from './BuildingGen.js';
import { buildLandmarks } from './Landmarks.js';
import { buildPropGeometries, buildPropsForChunk, updateSignals, initGlowTexture } from './Props.js';
import { buildTreeGeometries, windUniform } from './Vegetation.js';
import { Forest } from './Forest.js';
import { buildVines } from './Vines.js';
import { bootMap, bootMapWorld } from '../debug/boot.js';
import { buildWater, WaterReflection } from './Water.js';
import { buildParks } from './Parks.js';
import { buildParkFeatures } from './ParkFeatures.js';
import { ParkLife } from './ParkLife.js';
import { ROAD_Y } from './Layout.js';
import { GrassField, upgradeGroundGrass } from './Grass.js';
import { Collision } from './Collision.js';
import { buildGunShopFront } from './GunShopFront.js';
import { buildClubFront } from './ClubFront.js';
import { buildFuelStations } from './FuelStations.js';
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
    this.detailRadius = 330; this.job = null; this.wjob = null; this.revealQ = []; this.jobBudgetMs = 2.5; this.windowRadius = 150; this.propRadius = 430; this.treeRadius = 520; this.vineRadius = 240;
    this.lampLights = [];
  }
  async build(progress = () => {}, quality = 'high') {
    progress(0.0, 'Planning Colombo'); await tick();
    generatePlan(); await bootMap(plan); // saved map-editor edits (src/debug, only loaded when some were saved)
    this.plan = plan; this.collision.addAll(plan.colliders);
    for (const b of plan.buildings) for (const [px, pz, r] of frontColumns(b)) this.collision.add({ x0: px - r - 0.01, x1: px + r + 0.01, z0: pz - r - 0.01, z1: pz + r + 0.01, h: L.LAND_Y + (b.colonnade ? 4.4 : 2.9), kind: 'pole' }); // villa porch + Fort arcade columns
    progress(0.08, 'Laying roads and pavements'); await tick();
    const ground = buildGround(() => {});
    progress(0.2, 'Raising landmarks'); await tick();
    const lm = buildLandmarks(); this.landmarks = lm; this.root.add(lm.group); this.collision.addAll(lm.colliders);
    if (plan.missionShops.gunshop) { const s = plan.missionShops.gunshop; const f = buildGunShopFront(s, plan.buildings.find((b) => b.id === s.b)); this.root.add(f.group); this.collision.addAll(f.colliders); } // Ceylon Arms Co. shopfront
    if (plan.missionShops.club) { const s = plan.missionShops.club; const f = buildClubFront(s, plan.buildings.find((b) => b.id === s.b)); this.root.add(f.group); this.collision.addAll(f.colliders); } // The Velvet Monsoon club frontage
    { const fs = buildFuelStations(); this.fuel = fs; this.root.add(fs.group); this.collision.addAll(fs.colliders); } // four filling stations (FuelStations.js)
    { // second crown-clearance pass against the landmark buildings (they only exist now): no leaves inside them either
      const boxes = landmarkTreeBoxes(this.collision.list.filter((c) => c.kind === 'landmark' && !c.fuel)).concat(this.fuel.crownBoxes); const r = refitTreeCrowns(boxes);
      if (r.changed.size) { this.collision.remove((c) => r.changed.has(c)); this.collision.addAll(r.keep); }
      plan.plants = (plan.plants || []).filter((p) => !boxes.some((b) => p.x > b[0] - 0.5 && p.x < b[1] + 0.5 && p.z > b[2] - 0.5 && p.z < b[3] + 0.5)); } // no shrub inside a landmark or forecourt
    progress(0.3, 'Street furniture and trees'); await tick();
    buildPropGeometries(); buildTreeGeometries(); initGlowTexture();
    for (let idx = 0; idx < NCX * NCZ; idx++) {
      const ch = plan.byChunk[idx]; const [cx, cz] = chunkCenter(idx);
      const c = { idx, cx, cz, group: new THREE.Group(), detail: null, detailState: 0, props: null, trees: null };
      c.group.name = 'chunk' + idx;
      const gm = ground[idx]; if (gm) for (const m of gm.toMeshes(MAT, { cast: false, receive: true })) c.group.add(m);
      const mb = new MultiBuilder(); for (const b of ch.buildings) buildBase(b, mb); for (const w of ch.walls || []) buildWall(w, mb);
      for (const m of mb.toMeshes(MAT, { cast: true, receive: true })) { m.userData.layer = 'bld'; if (m.name === 'ao') { m.castShadow = false; m.receiveShadow = false; m.renderOrder = 1; } c.group.add(m); }
      c.props = buildPropsForChunk(ch); c.props.visible = false; c.group.add(c.props);
      c.lamps = c.props.userData.lamps || [];
      this.root.add(c.group); this.chunks.push(c);
      if (idx % 6 === 0) { progress(0.3 + 0.55 * idx / (NCX * NCZ), 'Building districts'); await tick(); }
    }
    // every tree, palm, banana clump, shrub, fern and weed: a few batched meshes with cell culling + LOD (Forest.js)
    this.forest = new Forest(plan.trees, plan.plants || [], quality || 'high'); this.root.add(this.forest.group);
    for (const c of this.chunks) c.trees = this.forest.chunkHandle(c.cx - CHUNK / 2, c.cz - CHUNK / 2, CHUNK);
    this.vines = buildVines(plan, this.chunks); this.root.add(this.vines.warm); // creepers up compound walls and house walls, bougainvillea over the copings (Vines.js)
    this.parks = buildParks(MAT); this.root.add(this.parks);
    this.parkFeatures = buildParkFeatures(MAT); this.root.add(this.parkFeatures.group); // Viharamahadevi Park: golden Buddha, lily ponds + bridges, play area + Jet Provost, Cenotaph, railing
    this.parkLife = new ParkLife(this, this.parkFeatures, quality); this.root.add(this.parkLife.group); // fireflies, fountain water, fruit bats, oil lamps
    upgradeGroundGrass(MAT.grass, 0.8); upgradeGroundGrass(MAT.lawn, 0.3);
    this.grass = new GrassField(this, this.collision); this.grass.setQuality(this.quality || 'high'); this.root.add(this.grass.mesh);
    progress(0.86, 'Filling the ocean and Beira Lake'); await tick();
    this.water = buildWater(); this.root.add(this.water); this.waterRefl = new WaterReflection(this.water);
    progress(0.9, 'Outer suburbs'); await tick();
    this.buildOuterRing(); this.buildBoundary();
    // point-light pool for nearby street lamps at night (fixed count to avoid shader recompiles)
    // Street lamps near the camera are real lights: a downward spotlight (the lamp's optic throws light onto the road and
    // pavement, not sideways through walls) that lights people, cars and kerbs; on high/ultra the two nearest also cast real
    // shadows. That lamp's painted light-pool decal is hidden while it has a real light; distant lamps keep the decal as LOD.
    // Fixed count, created once (no shader recompiles); assignments fade over a quarter second instead of popping.
    const nLights = quality === 'low' ? 3 : quality === 'medium' ? 6 : quality === 'ultra' ? 10 : 8; const shadowed = quality === 'high' || quality === 'ultra' ? 2 : 0;
    for (let i = 0; i < nLights; i++) { const p = new THREE.SpotLight(0xffc98a, 0, 30, 1.05, 0.55, 1.6); p.castShadow = i < shadowed;
      if (p.castShadow) { p.shadow.mapSize.set(512, 512); p.shadow.camera.near = 0.5; p.shadow.camera.far = 30; p.shadow.bias = -0.0008; p.shadow.normalBias = 0.05; p.shadow.autoUpdate = true; p.shadow.needsUpdate = true; p.shadow.camera.userData.noFoliage = true; }
      p.position.set(0, -600, 0); p.target.position.set(0, -601, 0); this.scene.add(p); this.scene.add(p.target); p.userData.lamp = null; p.userData.k = 0; this.lampLights.push(p); }
    // FPS: the city geometry never moves, so its ~9k scene nodes are frozen — matrices are computed once here instead of
    // every frame (updateMatrixWorld skips these subtrees). Visual output is identical.
    this.batchStatic(); this.poolProps();
    for (const c of this.chunks) freezeStatic(c.group); freezeStatic(this.parks); freezeStatic(this.outer); freezeStatic(this.batched);
    await bootMapWorld(this); // saved map-editor objects (primitives, painted textures)
    progress(1, 'City ready');
  }
  // The edge of the playable map is a solid, visible boundary — never an invisible wall at the end of a street.
  // Streets no longer run into the edge (Layout drops those segments, so they end in T-junctions with the perimeter
  // roads), and the edge blocks stop EDGE_SETBACK short of it. In that gap:
  //  * east (x = maxX): a plastered compound wall with pillars and coping, 3 m high, behind the last row of buildings;
  //  * north (z = minZ, east of the harbour): a concrete quay face down to the water and a seafront parapet;
  //  * south: the far embankment wall of the Dehiwala Canal (the real city boundary), rising out of the water.
  // Each one's collider sits in front of the old bounds clamp, so the player is always stopped by something visible.
  // Both railway lines run off the edge past their terminus stations: they end at buffer stops in front of the wall.
  buildBoundary() {
    const mb = new MultiBuilder(); const conc = mb.get('concrete'); const metal = mb.get('metal'); const B = L.BOUNDS, LY = L.LAND_Y;
    const C = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
    const plaster = C('#e2dccb'), grime = C('#8f897c'), cap = C('#c9c2b1'), quay = C('#9a968c');
    const colliders = [];
    // a wall run along x (dir 'x') or z (dir 'z'); y from yb to LY + h; split into 40 m pieces for the collision grid
    const run = (dir, a0, a1, c0, c1, h, yb = LY, outer = null) => {
      const t = c1 - c0, cc = (c0 + c1) / 2, len = a1 - a0, ac = (a0 + a1) / 2, top = LY + h;
      const bx = (al, l, y, hh, tt, col) => dir === 'x' ? conc.box(al, y, cc, l, hh, tt, { col, uvScale: 2 }) : conc.box(cc, y, al, tt, hh, l, { col, uvScale: 2 });
      bx(ac, len, (yb + top) / 2, top - yb, t, plaster);
      bx(ac, len, LY + 0.2, 0.4, t + 0.04, grime); // splash band at the foot, 2 cm proud each side
      bx(ac, len + 0.06, top + 0.05, 0.1, t + 0.14, cap); // coping
      for (let a = a0; a <= a1 + 0.01; a += 5) bx(Math.min(a1 - 0.25, Math.max(a0 + 0.25, a)), 0.5, (Math.max(yb, LY) + top + 0.18) / 2, top + 0.18 - Math.max(yb, LY), t + 0.16, plaster); // pillars every 5 m
      for (let a = a0; a < a1; a += 40) { const b = Math.min(a1, a + 40); const o = outer || [c0, c1]; colliders.push(dir === 'x' ? { x0: a, x1: b, z0: o[0], z1: o[1], h: top, kind: 'wall', id: 'boundary' } : { x0: o[0], x1: o[1], z0: a, z1: b, h: top, kind: 'wall', id: 'boundary' }); }
    };
    const ex0 = B.maxX - L.EDGE_SETBACK + 0.05, ex1 = ex0 + 0.4; // east wall line
    const nz1 = B.minZ + L.EDGE_SETBACK - 0.05, nz0 = nz1 - 0.4; // north parapet line
    const canal = L.CANALS[L.CANALS.length - 1]; const sz0 = canal.z1 - 2.6, sz1 = sz0 + 0.4; // south: inside the canal's far edge
    // east: on land from the north parapet to the canal, then rising out of the canal bed across it
    run('z', nz0, canal.z0, ex0, ex1, 3.0, LY, [ex0, B.maxX + 1]);
    run('z', canal.z0, sz1, ex0, ex1, 3.0, -2.6, [ex0, B.maxX + 1]);
    // north: quay face from the harbour quay (x 230) to the east wall + a 1.15 m seafront parapet
    for (let x = 230; x < ex0; x += 4) { const x1 = Math.min(ex0, x + 4); conc.quad([x1, -2.6, B.minZ], [x, -2.6, B.minZ], [x, LY, B.minZ], [x1, LY, B.minZ], [0, 0, (x1 - x) / 4, 0.8], quay); } // wound to face −z (the water)
    run('x', 230, ex0, nz0, nz1, 1.15, LY, [B.minZ - 1, nz1]);
    // south: the canal's far embankment wall, from the coast to the east wall
    const sx0 = L.coastX(canal.z1) + 1; run('x', sx0, ex1, sz0, sz1, 2.4, -2.6, [sz0, B.maxZ + 1]);
    // buffer stops where the two lines meet the boundary (trains terminate at Maradana / Wellawatte, well short of them)
    const buffer = (x, z, yaw) => { const cs = Math.cos(yaw), sn = Math.sin(yaw); const P = (u, v) => [x + u * cs + v * sn, z - u * sn + v * cs];
      for (const v of [-0.75, 0.75]) { const [px, pz] = P(0, v); metal.box(px, LY + 0.55, pz, 0.25, 1.1, 0.25, { col: C('#3a3d40') }); }
      const [bxx, bzz] = P(0, 0); const along = Math.abs(cs) > 0.5; metal.box(bxx, LY + 0.95, bzz, along ? 0.3 : 2.4, 0.32, along ? 2.4 : 0.3, { col: C('#c8302a') });
      for (const v of [-0.6, 0, 0.6]) { const [qx, qz] = P(-0.16, v); metal.box(qx, LY + 0.95, qz, along ? 0.02 : 0.3, 0.33, along ? 0.3 : 0.02, { col: C('#f2f0ea') }); }
      colliders.push({ x0: bxx - 1.3, x1: bxx + 1.3, z0: bzz - 1.3, z1: bzz + 1.3, h: LY + 1.15, kind: 'wall' }); };
    const railEast = L.RAIL[L.RAIL.length - 1], railSouth = L.RAIL[0];
    if (railEast[0] >= B.maxX - 1) buffer(ex0 - 4, railEast[1], 0);
    if (railSouth[1] >= B.maxZ - 1) buffer(railSouth[0], sz0 - 4, -Math.PI / 2);
    const g = new THREE.Group(); g.name = 'boundary'; for (const m of mb.toMeshes(MAT, { cast: true, receive: true })) g.add(m); this.boundary = g; this.root.add(g);
    this.collision.addAll(colliders);
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
  // GPU batching: the permanent city geometry (ground + building shells of every chunk) used to be one mesh per material
  // per chunk — ~600 separate draw commands the CPU had to prepare in the main pass alone, again for the sun shadow and
  // the water mirror. They are moved into one THREE.BatchedMesh per material (+ render settings): the CPU now only culls
  // each chunk's piece against the camera and the GPU draws every visible piece of that material in ONE multi-draw call.
  // Identical geometry, materials and shadows; only the number of CPU→GPU commands changes. Foliage keeps its own meshes
  // (street-lamp shadows skip it per draw), and the streamed detail / window meshes stay per chunk.
  batchStatic() {
    const SIG = 'position,normal,uv,color'; const groups = new Map();
    for (const c of this.chunks) { c.base = []; for (const m of [...c.group.children]) {
      if (!m.isMesh || m.isInstancedMesh || m.isBatchedMesh || FOLIAGE.has(m.name) || !m.geometry.index || Object.keys(m.geometry.attributes).sort().join(',') !== SIG.split(',').sort().join(',') || Array.isArray(m.material)) continue;
      const key = m.material.uuid + '|' + m.castShadow + m.receiveShadow + '|' + m.renderOrder + '|' + m.layers.mask; let G = groups.get(key);
      if (!G) groups.set(key, (G = { mat: m.material, name: m.name, cast: m.castShadow, recv: m.receiveShadow, order: m.renderOrder, layers: m.layers.mask, list: [], nv: 0, ni: 0 }));
      G.list.push({ c, m }); G.nv += m.geometry.attributes.position.count; G.ni += m.geometry.index.count; } }
    this.batched = new THREE.Group(); this.batched.name = 'cityBatched'; this.root.add(this.batched); this.batches = [];
    for (const G of groups.values()) {
      if (G.list.length < 2) continue; // nothing to gain
      const B = new THREE.BatchedMesh(G.list.length, G.nv, G.ni, G.mat); B.name = G.name; B.castShadow = G.cast; B.receiveShadow = G.recv; B.renderOrder = G.order; B.layers.mask = G.layers;
      for (const { c, m } of G.list) { m.updateMatrix(); const gid = B.addGeometry(m.geometry); const iid = B.addInstance(gid); B.setMatrixAt(iid, m.matrix);
        const r = B.getGeometryRangeAt(gid); c.base.push({ name: m.name, batch: B, gid, iid, r, layer: m.userData.layer }); c.group.remove(m); m.geometry.dispose(); }
      B.computeBoundingSphere(); B.computeBoundingBox(); this.batched.add(B); this.batches.push(B); }
    // read access for code that scans a chunk's ground triangles (grass masks): mesh-like views into the batch buffers
    for (const c of this.chunks) c.baseViews = c.base.map(({ name, batch, r }) => { const ga = batch.geometry; return { isMesh: true, name, geometry: { attributes: { position: ga.attributes.position, uv: ga.attributes.uv }, index: { array: ga.index.array.subarray(r.indexStart, r.indexStart + r.indexCount) } } }; });
  }
  // GPU instancing across chunks: each chunk had its own InstancedMesh per prop part (bollard, railing, pole, stall
  // canopy…) — ~220 draws in the main pass. One shared InstancedMesh per part now holds the instances of every chunk
  // within prop range (the same chunks that used to be shown), repacked only when a chunk enters / leaves that range.
  poolProps() {
    const pools = new Map(); const own = THREE.Object3D.prototype.onBeforeShadow;
    for (const c of this.chunks) { c.pooled = []; for (const m of [...c.props.children]) {
      if (!m.isInstancedMesh || m.userData.dynamic || !m.frustumCulled || Array.isArray(m.material) || m.onBeforeShadow !== own || m.count === 0) continue;
      const col = !!m.instanceColor; const key = m.geometry.uuid + '|' + m.material.uuid + '|' + m.castShadow + m.receiveShadow + '|' + m.renderOrder + '|' + col + '|' + m.layers.mask;
      let P = pools.get(key); if (!P) pools.set(key, (P = { geo: m.geometry, mat: m.material, cast: m.castShadow, recv: m.receiveShadow, order: m.renderOrder, col, layers: m.layers.mask, total: 0, parts: [] }));
      const part = { P, c, n: m.count, mat: m.instanceMatrix.array.slice(0, m.count * 16), color: col ? m.instanceColor.array.slice(0, m.count * 3) : null }; P.total += m.count; P.parts.push(part); c.pooled.push(part); c.props.remove(m); m.dispose(); } }
    this.propGroup = new THREE.Group(); this.propGroup.name = 'propPools'; this.root.add(this.propGroup); this.propPools = [];
    for (const P of pools.values()) { const m = new THREE.InstancedMesh(P.geo, P.mat, P.total); m.count = 0; m.castShadow = P.cast; m.receiveShadow = P.recv; m.renderOrder = P.order; m.layers.mask = P.layers;
      if (P.col) m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(P.total * 3), 3); m.matrixAutoUpdate = false; P.mesh = m; this.propGroup.add(m); this.propPools.push(P); }
  }
  // pack the instances of the chunks whose props are shown into the shared meshes (only when that set changes)
  repackProps() {
    for (const P of this.propPools) { const m = P.mesh; let n = 0; const M = m.instanceMatrix.array, C = m.instanceColor ? m.instanceColor.array : null;
      for (const part of P.parts) { if (!part.c.props.visible) continue; M.set(part.mat, n * 16); if (C) C.set(part.color, n * 3); n += part.n; }
      m.count = n; m.visible = n > 0; m.instanceMatrix.needsUpdate = true; if (C) m.instanceColor.needsUpdate = true; if (n) m.computeBoundingSphere(); }
  }
  // every mesh of a chunk's permanent geometry (batched pieces as views, plus what stayed a separate mesh)
  chunkMeshes(c) { return c.baseViews ? [...c.baseViews, ...c.group.children] : c.group.children; }
  update(dt, focus, camera, atmos) {
    this.t += dt; windUniform.value += dt * (0.6 + (atmos ? atmos.w.wind : 0.3));
    this.signalTimer -= dt; if (this.signalTimer <= 0) { this.signalTimer = 0.25; updateSignals(this.simTime ?? this.t); }
    const fx = focus.x, fz = focus.z; let budget = 1;
    for (const c of this.chunks) {
      const d = Math.max(0, Math.hypot(c.cx - fx, c.cz - fz) - CHUNK * 0.7);
      { const v = d < this.propRadius; if (v !== c.props.visible) { c.props.visible = v; this.propDirty = true; } }
      if (c.vines) c.vines.visible = d < this.vineRadius;
      if (d < this.detailRadius) {
        if (!c.detail && budget > 0 && !this.job) { budget--; this.startDetailJob(c); } /* built over several frames: see stepDetailJob */
        else if (c.detail) c.detail.visible = true;
      } else if (c.detail) { c.detail.visible = false; if (d > this.detailRadius + 300 && !c.keep) this.disposeDetail(c); } /* c.keep: set only by the trailer on the chunks its cuts jump between */
      if (d < this.windowRadius) { if (!c.win && budget > 0 && !this.wjob) { budget--; this.wjob = this.newJob(c, 'win'); } else if (c.win) c.win.visible = true; } /* window joinery: also built over several frames */
      else if (c.win) { c.win.visible = false; if (d > this.windowRadius + 120 && !c.keep) this.disposeWindows(c); }
    }
    if (this.propDirty && this.propPools) { this.propDirty = false; this.repackProps(); }
    if (this.forest) this.forest.update(focus, camera);
    if (this.revealQ.length) this.revealStep();
    if (this.job) this.stepDetailJob(this.jobBudgetMs);
    if (this.wjob) this.stepWinJob(this.jobBudgetMs);
    if (this.grass) this.grass.update(dt, focus, atmos ? atmos.w.wind : 0.3);
    if (this.parks && this.parks.userData.flowers && camera) this.parks.userData.flowers.update(camera.position);
    if (this.parkLife && camera && atmos) this.parkLife.update(dt, atmos, camera);
    // landmark animation
    const an = this.landmarks.anim;
    if (an.lotusBeacon) an.lotusBeacon.visible = (this.t % 1.6) < 0.5; // aviation obstruction light
    if (an.lotus && atmos) { an.lotus.opacity = atmos.night * (0.5 + Math.sin(this.t * 0.8) * 0.15); const hue = (0.83 + Math.sin(this.t * 0.05) * 0.12 + 1) % 1; an.lotus.color.setHSL(hue, 0.85, 0.55); an.lotus.visible = atmos.night > 0.02; } if (an.lotusStem && an.lotus) { an.lotusStem.color.copy(an.lotus.color); an.lotusStem.opacity = Math.min(1, an.lotus.opacity * 1.1); an.lotusStem.visible = an.lotus.visible; }
    for (const m of this.landmarks.labels) if (m.emissiveIntensity !== undefined && atmos) m.emissiveIntensity = 0.2 + atmos.night * 0.9;
    // street-lamp point lights near the focus
    if (this.lampLights.length && atmos) {
      const on = atmos.night > 0.3;
      if (on) {
        const near = []; const ci = this.chunks; const cd = camera ? camera.getWorldDirection(this._lampDir || (this._lampDir = new THREE.Vector3())) : null;
        for (const c of ci) { if (Math.abs(c.cx - fx) > 300 || Math.abs(c.cz - fz) > 300) continue; for (const p of c.lamps) { const dx = p[0] - fx, dz = p[2] - fz, d2 = dx * dx + dz * dz; if (d2 > 110 * 110) continue;
          const inView = !cd || d2 < 400 || (dx * cd.x + dz * cd.z) / Math.sqrt(d2) > 0.35; near.push([d2 * (inView ? 1 : 3), p]); } }
        near.sort((a, b) => a[0] - b[0]); const want = new Set(near.slice(0, this.lampLights.length).map((n) => n[1]));
        this.lampFade(dt, want, atmos.night * 34 * (1 - (this.indoorK || 0))); // inside a building the street lamps' light no longer passes through its walls
      } else this.lampFade(dt, new Set(), 0);
    }
  }
  // Streaming without frame hitches: a dense chunk (Pettah / Fort: ~200 buildings) took 100-250 ms to build in one frame.
  // The job builds a few buildings per frame within a time budget, then merges one material per frame. Every building
  // seeds its own RNG, so the result is identical to the one-shot build (same meshes, same order) - only spread out.
  startDetailJob(c) { this.job = this.newJob(c, 'detail'); }
  newJob(c, kind) { return { c, kind, i: 0, B: kind === 'detail' ? [new MultiBuilder()] : [new MultiBuilder(), new MultiBuilder()], q: null, meshes: [] }; }
  stepDetailJob(budgetMs = 3) { const done = this.stepJob(this.job, budgetMs); if (done) this.job = null; return done; }
  stepWinJob(budgetMs = 3) { const done = this.stepJob(this.wjob, budgetMs); if (done) this.wjob = null; return done; }
  // advance a streaming job; true when finished (result attached to the chunk)
  stepJob(J, budgetMs) {
    if (!J) return true; const t0 = performance.now(); const bs = plan.byChunk[J.c.idx].buildings; const det = J.kind === 'detail';
    while (J.i < bs.length || (J.tasks && J.tasks.length)) { // generate: one building (detail) / one facade (windows) at a time
      if (det) buildDetail(bs[J.i++], J.B[0]); else { if (!J.tasks || !J.tasks.length) J.tasks = windowTasks(bs[J.i++], J.B[0], J.B[1]); const t = J.tasks.shift(); if (t) t(); }
      if (performance.now() - t0 > budgetMs) return false; }
    if (!J.q) { J.q = []; J.B.forEach((mb, k) => { for (const name of mb.b.keys()) J.q.push([k, name]); }); }
    while (J.q.length || J.sb) { // merge: one material at a time, large ones in slices
      if (!J.sb) { const [k, name] = J.q.shift(); J.sb = new SliceBuild(J.B[k].b.get(name)); J.sk = k; J.sn = name; }
      if (!J.sb.step(t0, budgetMs)) return false;
      const g = J.sb.geometry(), k = J.sk; J.sb = null;
      if (g) { const m = meshFor(J.sn, g, MAT, det ? { cast: true, receive: true } : k === 0 ? { cast: false, receive: true } : { cast: false, receive: false }); if (m) { if (!det && k === 1) m.renderOrder = 2; J.meshes.push(m); } }
      if ((J.q.length || J.sb) && performance.now() - t0 > budgetMs) return false; }
    const c = J.c; if (det ? c.detail : c.win) { for (const m of J.meshes) m.geometry.dispose(); return true; } // built meanwhile by warm()
    if (det) this.finishDetail(c, J.meshes, true); else this.finishWindows(c, J.meshes, true); return true;
  }
  finishWindows(c, meshes, staged = false) { const g = new THREE.Group(); g.name = 'windows' + c.idx; for (const m of meshes) g.add(m); c.win = g; c.group.add(g); refreshStatic(c.group); if (staged) this.stage(meshes); }
  // streamed meshes appear over the next frames within a vertex budget: the GPU uploads a mesh's buffers the first time it is
  // drawn, and a whole chunk's merged materials (several MB) arriving in one frame was a visible hitch while driving
  stage(meshes) { for (const m of meshes) { m.visible = false; this.revealQ.push(m); } }
  revealStep(maxVerts = 90000) { let n = 0; while (this.revealQ.length) { const m = this.revealQ.shift(); if (!m.parent || !m.geometry || !m.geometry.attributes.position) continue; m.visible = true; n += m.geometry.attributes.position.count; if (n >= maxVerts) break; } }
  finishDetail(c, meshes, staged = false) {
    const g = new THREE.Group(); for (const m of meshes) { if (m.name === 'pool' || m.name === 'lampHead') { m.castShadow = false; m.receiveShadow = false; } g.add(m); }
    c.detail = g; c.group.add(g); refreshStatic(c.group); if (staged) this.stage(meshes);
  }
  buildDetailFor(c) {
    if (this.job && this.job.c === c) { this.stepDetailJob(Infinity); if (c.detail) return; }
    const ch = plan.byChunk[c.idx]; const mb = new MultiBuilder();
    for (const b of ch.buildings) buildDetail(b, mb);
    this.finishDetail(c, mb.toMeshes(MAT, { cast: true, receive: true }));
  }
  // near tier: 3D window joinery + reflective panes (see BuildingGen.buildWindows)
  buildWindowsFor(c) {
    if (this.wjob && this.wjob.c === c) { this.stepWinJob(Infinity); if (c.win) return; }
    const ch = plan.byChunk[c.idx]; const solid = new MultiBuilder(), glass = new MultiBuilder();
    for (const b of ch.buildings) buildWindows(b, solid, glass);
    const meshes = [...solid.toMeshes(MAT, { cast: false, receive: true })]; for (const m of glass.toMeshes(MAT, { cast: false, receive: false })) { m.renderOrder = 2; meshes.push(m); }
    this.finishWindows(c, meshes);
  }
  disposeWindows(c) { c.group.remove(c.win); c.win.traverse((m) => m.geometry && m.geometry.dispose()); c.win = null; }
  // after a long jump (teleport / fast travel) release streamed chunk geometry well outside the new streaming radii at once,
  // instead of keeping it until the 630 m hysteresis — keeps memory flat when jumping across the city
  trim(x, z) { let n = 0; for (const c of this.chunks) { const d = Math.max(0, Math.hypot(c.cx - x, c.cz - z) - CHUNK * 0.7); if (c.detail && d > this.detailRadius + 60) { this.disposeDetail(c); n++; } if (c.win && d > this.windowRadius + 40) { this.disposeWindows(c); n++; } } return n; }
  disposeDetail(c) { c.group.remove(c.detail); c.detail.traverse((m) => m.geometry && m.geometry.dispose()); c.detail = null; }
  // Force detail around a point (used before cinematics / after teleport)
  warm(x, z) { for (const c of this.chunks) { const d = Math.hypot(c.cx - x, c.cz - z) - CHUNK * 0.7; if (!c.detail && d < this.detailRadius) this.buildDetailFor(c); if (!c.win && d < this.windowRadius) this.buildWindowsFor(c); } }
  // same as warm(), one chunk per frame with progress (used by the enter-game loading screen)
  async warmAsync(points, progress = () => {}) {
    const need = this.chunks.filter((c) => !c.detail && points.some(([x, z]) => Math.hypot(c.cx - x, c.cz - z) - CHUNK * 0.7 < this.detailRadius));
    for (let i = 0; i < need.length; i++) { const c = need[i]; if (!c.detail) this.buildDetailFor(c); if (!c.win && points.some(([x, z]) => Math.hypot(c.cx - x, c.cz - z) - CHUNK * 0.7 < this.windowRadius)) this.buildWindowsFor(c); progress((i + 1) / need.length); if (i % 2 === 1) await new Promise((r) => requestAnimationFrame(r)); }
    progress(1); return need.length;
  }
  // hand real lights to the wanted lamps: lights on lamps no longer wanted fade out and are freed (decal restored), free lights
  // fade in on newly wanted lamps (decal hidden); lamps that stay wanted keep their light (no flicker from re-sorting)
  lampFade(dt, want, base) {
    const lit = new Set(); const _m = this._lampM || (this._lampM = new THREE.Matrix4());
    const decal = (lamp, on) => { const [x, , z, mesh, i] = lamp; if (!mesh) return; if (on) _m.makeTranslation(x, ROAD_Y + 0.03, z); else _m.makeScale(0, 0, 0); mesh.setMatrixAt(i, _m); mesh.instanceMatrix.needsUpdate = true; };
    for (const l of this.lampLights) { const u = l.userData; if (!u.lamp) continue;
      if (want.has(u.lamp) && base > 0) { u.k = Math.min(1, u.k + dt * 4); lit.add(u.lamp); } else { u.k -= dt * 4; if (u.k <= 0) { decal(u.lamp, true); u.lamp = null; u.k = 0; } else lit.add(u.lamp); } }
    for (const lamp of want) { if (lit.has(lamp) || base <= 0) continue; const l = this.lampLights.find((q) => !q.userData.lamp); if (!l) break;
      l.userData.lamp = lamp; l.userData.k = 0; decal(lamp, false); l.position.set(lamp[0], lamp[1] - 0.4, lamp[2]); l.target.position.set(lamp[0], ROAD_Y, lamp[2] + 0.001); l.target.updateMatrixWorld(); lit.add(lamp); }
    for (const l of this.lampLights) { const u = l.userData; const I = u.lamp ? base * u.k : 0; if (l.intensity !== I) l.intensity = I; if (l.castShadow) l.shadow.autoUpdate = I > 0; } /* FPS: an unlit pooled lamp (all day, parked at y -600) no longer re-renders its shadow map every frame */
  }
  setQuality(q) { this.quality = q; if (this.grass) this.grass.setQuality(q); if (this.forest) this.forest.setQuality(q); if (this.parkLife) this.parkLife.setQuality(q); if (this.parks && this.parks.userData.flowers) this.parks.userData.flowers.setQuality(q); const s = q === 'low' ? 0.6 : q === 'medium' ? 0.8 : q === 'ultra' ? 1.25 : 1; this.detailRadius = 330 * s; this.windowRadius = q === 'low' ? 0 : q === 'medium' ? 90 : q === 'ultra' ? 210 : 150; this.propRadius = 430 * s; this.treeRadius = 520 * s; }
}
export { plan };
