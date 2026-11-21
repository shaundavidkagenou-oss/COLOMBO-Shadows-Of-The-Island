// Builds and streams the static city: ground, buildings (base + streamed detail), landmarks, props, trees, water.
import { GRID } from './PowerGrid.js';
import * as THREE from 'three';
import { buildHospital } from './HospitalBuild.js';
import { nightLight } from '../gfx/LightSets.js';
import { MultiBuilder, SliceBuild, meshFor, matFor, FOLIAGE } from '../gfx/MeshBuilder.js';
import { MAT, ROLE_DEFS } from '../gfx/Materials.js';
import { RangeBatch, rangesFor, disposeMesh, splitCells, cellsOfBox } from '../gfx/CellBatch.js';
import { installCull, CULL, CSLOTS, LOD, setLodQuality } from '../gfx/BatchCull.js';
import { OcclusionCuller } from '../gfx/Occlusion.js';
import { SkyBake } from '../gfx/BakeLight.js';
import { buildSkyVis } from '../gfx/SkyVis.js';
import { crownPoints } from './TreeShapes.js';
import { colonnadeArcades } from './BuildingGen.js';
import { GroundDetail, regTrees } from './GroundDetail.js';
import { generatePlan, plan, NCX, NCZ, CHUNK, chunkCenter, refitTreeCrowns, landmarkTreeBoxes } from './CityPlan.js';
import { buildGround } from './GroundBuilder.js';
import { buildBase, buildDetail, buildWall, windowTasks, frontColumns } from './BuildingGen.js';
import { buildLandmarks } from './Landmarks.js';
import { FORT } from './FortStationData.js';
import { buildPropGeometries, buildPropsForChunk, updateSignals, initGlowTexture } from './Props.js';
import { buildTreeGeometries, windUniform } from './Vegetation.js';
import { Forest } from './Forest.js';
import { buildVines, vineFade } from './Vines.js';
import { bootMap, bootMapWorld } from '../debug/boot.js';
import { buildWater, WaterReflection } from './Water.js';
import { buildParks } from './Parks.js';
import { buildParkFeatures } from './ParkFeatures.js';
import { ParkLife } from './ParkLife.js';
import { ROAD_Y } from './Layout.js';
import { GrassField, upgradeGroundGrass } from './Grass.js';
import { Collision } from './Collision.js';
import { buildGunShopFront } from './GunShopFront.js';
import { buildBankFront } from './BankFront.js';
import { buildClubFront } from './ClubFront.js';
import { buildFuelStations } from './FuelStations.js';
import { buildCustoms } from './CustomsGeo.js';
import { buildCityStreets } from './CityStreets.js';
import { buildStreetRamps } from './StreetRamps.js';
import { WetGlints } from '../gfx/WetGlints.js';
import * as L from './Layout.js';
import { RNG } from '../core/rng.js';

const tick = () => new Promise((r) => setTimeout(r, 0));
// 65th: ground parts drawn only near the camera (BatchCull LOD.tiny / LOD.small): drain-grate bars + road studs (centimetre
// detail, sub-pixel beyond ~50 m), manhole covers / collars and kerb-drain sumps (small dark discs and slots)
const GROUND_TINY = new Set(['drainGrate', 'roadStud']), GROUND_SMALL = new Set(['manholeCover', 'manholeCollar', 'drainSump']);
// a chunk's building shells + compound walls, with per-building range marks (each builder's vertex / index count before every
// building, before the walls and at the end): batchStatic cuts the merged meshes back into one piece per building
function buildBaseMarked(ch, sky = null) {
  const mb = new MultiBuilder(); const marks = []; const mark = () => marks.push(new Map([...mb.b].map(([n, b]) => [n, [b.pos.length / 3, b.idx.length]])));
  for (const b of ch.buildings) { mark(); buildBase(b, mb); } mark(); for (const w of ch.walls || []) buildWall(w, mb); mark();
  if (sky) sky.apply(mb); // 65th: baked sky-light occlusion of the walls (BakeLight.js) — colours only, the marks stay valid
  return { mb, marks };
}

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
    // 65th: occlusion data, baked once from the final city plan (OcclusionCuller: every building an occluder; the targets grow
    // to cover the batched pieces as they are made — shells, ground cells, street dressing, streamed detail)
    this.occ = new OcclusionCuller(); this.occ.bake(plan.buildings, L.LAND_Y, L.BOUNDS); CULL.occ = this.occ;
    this.skyBake = new SkyBake(plan.buildings, L.LAND_Y, L.BOUNDS); // 65th: baked skylight occlusion for the building shells (BakeLight.js)
    for (const b of plan.buildings) for (const [px, pz, r] of frontColumns(b)) this.collision.add({ x0: px - r - 0.01, x1: px + r + 0.01, z0: pz - r - 0.01, z1: pz + r + 0.01, h: L.LAND_Y + (b.colonnade ? 4.4 : 2.9), kind: 'pole' }); // villa porch + Fort arcade columns
    progress(0.08, 'Laying roads and pavements'); await tick();
    const ground = buildGround(() => {});
    progress(0.2, 'Raising landmarks'); await tick();
    const lm = buildLandmarks(); this.landmarks = lm; this.root.add(lm.group); this.collision.addAll(lm.colliders);
    if (plan.missionShops.gunshop) { const s = plan.missionShops.gunshop; const f = buildGunShopFront(s, plan.buildings.find((b) => b.id === s.b)); this.root.add(f.group); this.collision.addAll(f.colliders); } // Ceylon Arms Co. shopfront
    if (plan.missionShops.club) { const s = plan.missionShops.club; const f = buildClubFront(s, plan.buildings.find((b) => b.id === s.b)); this.root.add(f.group); this.collision.addAll(f.colliders); } // The Velvet Monsoon club frontage
    if (plan.missionShops.bank) { const s = plan.missionShops.bank; const f = buildBankFront(s, plan.buildings.find((b) => b.id === s.b)); this.bankFront = f; this.root.add(f.group); this.collision.addAll(f.colliders); } // 67th: Ceylon Meridian Bank frontage (BankFront.js)
    { const hb = buildHospital(); this.hospitalBuild = hb; this.root.add(hb.root); this.collision.addAll(hb.colliders); } // 74th: the National Hospital (HospitalBuild.js; runtime: Hospital.js)
    { const fs = buildFuelStations(); this.fuel = fs; this.root.add(fs.group); this.collision.addAll(fs.colliders); } // four filling stations (FuelStations.js)
    { const cs = buildCustoms(); this.customs = cs; this.root.add(cs.group); this.collision.addAll(cs.colliders); } // Street Customs workshop (CustomsGeo.js; service: customs/CustomsService.js)
    { const sr = buildStreetRamps(); this.streetRamps = sr; this.root.add(sr.group); this.collision.addAll(sr.colliders); } // speed humps + stunt jumps / bicycle ramps (StreetRamps.js; ground surfaces via Layout.setRampHook)
    { const fs = buildCityStreets(plan); this.fortStreets = this.cityStreets = fs; this.root.add(fs.group); this.collision.addAll(fs.colliders); } // Colombo Fort benchmark: trilingual street names, billboards, drains, bins (FortStreets.js)
    { // second crown-clearance pass against the landmark buildings (they only exist now): no leaves inside them either
      const boxes = landmarkTreeBoxes(this.collision.list.filter((c) => c.kind === 'landmark' && !c.fuel)).concat(this.fuel.crownBoxes, this.customs.crownBoxes, FORT.clear.map((r) => [r.x0, r.x1, r.z0, r.z1, FORT.shed.eave + FORT.shed.rise + 2])); const planCols = new Set(plan.colliders); const obst = this.collision.list.filter((c) => !planCols.has(c) && !['landmark', 'tree', 'building', 'deck', 'platform'].includes(c.kind) && !c.fuel); const r = refitTreeCrowns(boxes, obst); // + walls / barriers / shopfronts / street furniture built after the plan
      if (r.changed.size) { this.collision.remove((c) => r.changed.has(c)); this.collision.addAll(r.keep); }
      plan.plants = (plan.plants || []).filter((p) => !boxes.some((b) => p.x > b[0] - 0.5 && p.x < b[1] + 0.5 && p.z > b[2] - 0.5 && p.z < b[3] + 0.5)); } // no shrub inside a landmark or forecourt
    { // 79th: sky visibility for location-sensitive indirect daylight (SkyVis.js), baked once from the final plan + landmark volumes
      const CR = new Map(); const crown = (type) => { if (CR.has(type)) return CR.get(type); const P = crownPoints(type) || crownPoints('mara'); let r = 0, top = 0, base = 1e9;
        if (P) for (let i = 0; i < P.length; i += 3) { r = Math.max(r, Math.hypot(P[i], P[i + 2])); top = Math.max(top, P[i + 1]); base = Math.min(base, P[i + 1]); }
        const o = P ? { r: r * 0.85, top, base: Math.min(base, top - 1) } : null; CR.set(type, o); return o; };
      const exempt = L.ZONES.filter((z) => ['hospital', 'slpHQ', 'policeHQ', 'fortstation', 'maradanast'].includes(z.id)).map((z) => z.rect);
      const arcades = []; for (const b of plan.buildings) { const a = colonnadeArcades(b); if (a) arcades.push(a); }
      try { await buildSkyVis({ buildings: plan.buildings, boxes: this.collision.list, trees: plan.trees, crown, exempt, arcades, groundY: L.LAND_Y, yieldFn: tick }); } catch (e) { console.warn('SkyVis bake failed', e); } }
    progress(0.3, 'Street furniture and trees'); await tick();
    buildPropGeometries(); buildTreeGeometries(); initGlowTexture();
    for (let idx = 0; idx < NCX * NCZ; idx++) {
      const ch = plan.byChunk[idx]; const [cx, cz] = chunkCenter(idx);
      const c = { idx, cx, cz, group: new THREE.Group(), detail: null, detailState: 0, props: null, trees: null };
      c.group.name = 'chunk' + idx;
      const gm = ground[idx]; if (gm) for (const m of gm.toMeshes(MAT, { cast: false, receive: true })) c.group.add(m);
      const { mb, marks } = buildBaseMarked(ch, this.skyBake); c.baseMarks = marks;
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
    regTrees(plan.trees); this.groundDetail = new GroundDetail(); this.groundDetail.setQuality(this.quality || quality || 'high'); this.root.add(this.groundDetail.group); // modelled bricks / kerb stones / ballast / rail clips near the camera
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
    for (let i = 0; i < nLights; i++) { const p = new THREE.SpotLight(0xffc98a, 0, 34, 1.08, 0.6, 1.5); p.castShadow = i < shadowed;
      if (p.castShadow) { p.shadow.mapSize.set(512, 512); p.shadow.camera.near = 0.5; p.shadow.camera.far = 30; p.shadow.bias = -0.0008; p.shadow.normalBias = 0.05; p.shadow.autoUpdate = true; p.shadow.needsUpdate = true; p.shadow.camera.userData.noFoliage = true; }
      p.position.set(0, -600, 0); p.target.position.set(0, -601, 0); this.scene.add(nightLight(p)); this.scene.add(p.target); p.userData.lamp = null; p.userData.k = 0; this.lampLights.push(p); } // dark by day: out of the shaders then (LightSets)
    this.glints = new WetGlints(this.scene, 64); this.glints.max = WetGlints.budget(quality); this.glintsOn = true; this._glintSrc = []; // wet-road light streaks (WetGlints.js)
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
  // extra (60th): batch only the building pieces rebuilt since (rebuildForKeys), adding to the existing batches' group
  batchStatic(chunks = this.chunks, extra = false) {
    const SIG = 'position,normal,uv,color'; const groups = new Map(); const occ = this.occ, cs = occ ? occ.cfg.cell : 32;
    for (const c of chunks) { if (!extra || !c.base) c.base = []; const bl = plan.byChunk[c.idx].buildings; for (const m of [...c.group.children]) {
      if (extra && m.userData.layer !== 'bld') continue;
      if (!m.isMesh || m.isInstancedMesh || m.isBatchedMesh || FOLIAGE.has(m.name) || !m.geometry.index || Object.keys(m.geometry.attributes).sort().join(',') !== SIG.split(',').sort().join(',') || Array.isArray(m.material)) continue;
      const key = m.material.uuid + '|' + m.castShadow + m.receiveShadow + '|' + m.renderOrder + '|' + m.layers.mask; let G = groups.get(key);
      const bld = m.userData.layer === 'bld'; const kind = bld ? 'bld' : GROUND_TINY.has(m.name) ? 'tiny' : GROUND_SMALL.has(m.name) ? 'small' : 'cell';
      if (!G) groups.set(key, (G = { mat: m.material, name: m.name, kind, cast: m.castShadow, recv: m.receiveShadow, order: m.renderOrder, layers: m.layers.mask, list: [], nv: 0, ni: 0, np: 0 }));
      // 65th: pieces — building shells one per building (its occlusion target), ground in occlusion-grid cells (identical
      // triangles, just cut apart; each piece is culled on its own: frustum, occlusion, draw distance — BatchCull.js)
      m.updateMatrix(); const g = m.geometry; let pieces = null;
      if (bld && c.baseMarks) { const ranges = rangesFor(c.baseMarks, m.userData.matKey || m.name); let cover = 0; for (const r of ranges) cover += r[3] - r[2];
        if (ranges.length > 1 && cover === g.index.count) { const I = g.index.array, names = Object.keys(g.attributes);
          pieces = ranges.map(([v0, v1, i0, i1, bi]) => { const pg = new THREE.BufferGeometry(); for (const n of names) { const A = g.attributes[n], k = A.itemSize; pg.setAttribute(n, new THREE.BufferAttribute(A.array.subarray(v0 * k, v1 * k), k, A.normalized)); }
            const ix = new (v1 - v0 > 65535 ? Uint32Array : Uint16Array)(i1 - i0); for (let q = i0; q < i1; q++) ix[q - i0] = I[q] - v0; pg.setIndex(new THREE.BufferAttribute(ix, 1));
            let id = bl[bi] ? bl[bi].id : -1; if (id >= 0 && occ) { pg.computeBoundingBox(); const bb = pg.boundingBox.clone().applyMatrix4(m.matrix); if (!occ.growTarget(id, bb.min.x, bb.max.x, bb.min.z, bb.max.z, bb.max.y)) id = -1; } else id = -1;
            return { geo: pg, bid: id, box: null }; }); } }
      if (!pieces && !bld && occ) pieces = splitCells(g, cs, m.matrix).map((p) => ({ geo: p.geo, bid: -1, box: p.box }));
      if (!pieces) pieces = [{ geo: g, bid: -1, box: null }];
      for (const p of pieces) { G.nv += p.geo.attributes.position.count; G.ni += p.geo.index.count; } G.np += pieces.length; G.list.push({ c, m, pieces }); } }
    if (!extra) { this.batched = new THREE.Group(); this.batched.name = 'cityBatched'; this.root.add(this.batched); this.batches = []; }
    for (const G of groups.values()) {
      if (G.list.length < 2) { for (const e of G.list) for (const p of e.pieces) if (p.geo !== e.m.geometry) p.geo.dispose(); continue; } // nothing to gain
      const B = new THREE.BatchedMesh(G.np, G.nv, G.ni, G.mat); B.name = G.name; B.castShadow = G.cast; B.receiveShadow = G.recv; B.renderOrder = G.order; B.layers.mask = G.layers;
      const bid = new Int32Array(G.np).fill(-1), cells = new Int32Array(G.np * CSLOTS).fill(-1), grp = [0];
      for (const { c, m, pieces } of G.list) { for (const p of pieces) { const gid = B.addGeometry(p.geo); const iid = B.addInstance(gid); B.setMatrixAt(iid, m.matrix);
          bid[iid] = p.bid; if (p.box && occ) cellsOfBox(occ, p.box, cells, iid * CSLOTS, p.box[4], false);
          const r = B.getGeometryRangeAt(gid); c.base.push({ name: m.name, batch: B, gid, iid, r, layer: m.userData.layer }); if (p.geo !== m.geometry) p.geo.dispose(); }
        grp.push(B._instanceInfo.length); c.group.remove(m); m.geometry.dispose(); }
      B.computeBoundingSphere(); B.computeBoundingBox(); installCull(B, { kind: G.kind === 'bld' ? 'cell' : G.kind, bid, cells, cellKind: 'ground', grp: Int32Array.from(grp) });
      this.batched.add(B); this.batches.push(B); if (extra) { B.matrixAutoUpdate = false; B.updateMatrixWorld(true); } }
    // read access for code that scans a chunk's ground triangles (grass masks): mesh-like views into the batch buffers
    for (const c of chunks) c.baseViews = c.base.map(({ name, batch, r }) => { const ga = batch.geometry; return { isMesh: true, name, geometry: { attributes: { position: ga.attributes.position, uv: ga.attributes.uv }, index: { array: ga.index.array.subarray(r.indexStart, r.indexStart + r.indexCount) } } }; });
  }
  // 60th (Texture Studio): parts that just got a material of their own (Materials.markSplit) move to it. The buildings concerned
  // are generated again — same generator, same plan, same seeds, so identical geometry — with their parts now merged under the
  // new keys: building shells + compound walls of their chunks (re-batched), and their streamed detail / window joinery (rebuilt
  // as you look at it). keys: the newly split keys ('winFrame' = every building, 'winFrame@b234' = building 234's chunk only).
  // On start, saved rules split their keys before the city is generated, so this only runs while editing.
  rebuildForKeys(keys) {
    const ids = new Set(); let all = false;
    for (const k of keys) { const m = /@b(\d+)$/.exec(k); if (m) ids.add(+m[1]); else if (ROLE_DEFS[k]) all = true; } // (landmark site keys 'Scope.base': MeshBuilder.splitLive)
    const list = all ? this.chunks : this.chunks.filter((c) => plan.byChunk[c.idx].buildings.some((b) => ids.has(b.id)));
    const again = [];
    for (const c of list) {
      const ch = plan.byChunk[c.idx];
      for (const e of c.base || []) if (e.layer === 'bld' && !e.off) { e.batch.setVisibleAt(e.iid, false); e.off = true; } // the batched originals go dark
      if (c.base) c.base = c.base.filter((e) => !e.off);
      for (const m of [...c.group.children]) if (m.isMesh && m.userData.layer === 'bld') { c.group.remove(m); disposeMesh(m); }
      const { mb, marks } = buildBaseMarked(ch, this.skyBake); c.baseMarks = marks;
      for (const m of mb.toMeshes(MAT, { cast: true, receive: true })) { m.userData.layer = 'bld'; if (m.name === 'ao') { m.castShadow = false; m.receiveShadow = false; m.renderOrder = 1; } c.group.add(m); }
      const had = { c, det: !!c.detail, win: !!c.win }; if (had.det || had.win) again.push(had);
      if (this.job && this.job.c === c) this.job = null; if (c.detail) this.disposeDetail(c);
      if (this.wjob && this.wjob.c === c) this.wjob = null; if (c.win) this.disposeWindows(c);
    }
    if (!list.length) return 0;
    this.batchStatic(list, true); for (const c of list) refreshStatic(c.group);
    // the detail / window joinery that was on screen comes straight back on its new materials (no streaming pop-in while editing)
    for (const { c, det, win } of again) { if (det && !c.detail) this.buildDetailFor(c); if (win && !c.win) this.buildWindowsFor(c); }
    // batches whose every instance was replaced: removed (no empty draws left behind)
    this.batches = this.batches.filter((B) => { const I = B._instanceInfo; if (Array.isArray(I) && I.some((i) => i && i.active && i.visible)) return true; this.batched.remove(B); B.dispose(); return false; });
    return list.length;
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
      const part = { P, c, n: m.count, mat: m.instanceMatrix.array.slice(0, m.count * 16), color: col ? m.instanceColor.array.slice(0, m.count * 3) : null, props: m.userData.props || null }; /* props: lamp / signal instances a crash can knock down (PropBreak.js) */ P.total += m.count; P.parts.push(part); c.pooled.push(part); c.props.remove(m); m.dispose(); } }
    this.propGroup = new THREE.Group(); this.propGroup.name = 'propPools'; this.root.add(this.propGroup); this.propPools = [];
    for (const P of pools.values()) { const m = new THREE.InstancedMesh(P.geo, P.mat, P.total); m.count = 0; m.castShadow = P.cast; m.receiveShadow = P.recv; m.renderOrder = P.order; m.layers.mask = P.layers;
      if (P.col) m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(P.total * 3), 3); m.matrixAutoUpdate = false; P.mesh = m; this.propGroup.add(m); this.propPools.push(P); }
    // 65th: per-instance occlusion cells + position (draw distance of the small parts), and the main-camera instance count
    const occ = this.occ, gb = new THREE.Box3(), ib = new THREE.Box3(), M4 = new THREE.Matrix4(); const box = [0, 0, 0, 0];
    for (const P of this.propPools) { const g = P.geo; if (!g.boundingBox) g.computeBoundingBox(); if (!g.boundingSphere) g.computeBoundingSphere(); gb.copy(g.boundingBox);
      P.small = g.boundingSphere.radius < 0.9; P.nNear = P.nMain = P.nOcc = P.nAll = 0; P.gen = -2; P.cls = new Uint8Array(P.total);
      for (const part of P.parts) { part.cells = new Int32Array(part.n * CSLOTS).fill(-1); part.pos = new Float32Array(part.n * 2);
        for (let i = 0; i < part.n; i++) { M4.fromArray(part.mat, i * 16); ib.copy(gb).applyMatrix4(M4); part.pos[i * 2] = M4.elements[12]; part.pos[i * 2 + 1] = M4.elements[14];
          box[0] = ib.min.x; box[1] = ib.max.x; box[2] = ib.min.z; box[3] = ib.max.z; if (occ) cellsOfBox(occ, box, part.cells, i * CSLOTS, ib.max.y, true); } }
      const m = P.mesh; const W = this;
      m.onBeforeRender = function (r, s, cam) { this.count = cam === CULL.camera ? (CULL.occOn && W.occ && P.gen === W.occ.gen ? P.nMain : LOD.enabled ? P.nMain + P.nOcc : P.nAll) : P.nAll; };
      m.onAfterRender = function () { this.count = P.nAll; };
      m.onBeforeShadow = function (r, o, cam, sc) { this.count = sc === CULL.sunCamera && CULL.propNear ? P.nNear : P.nAll; };
      m.onAfterShadow = function () { this.count = P.nAll; }; }
    this._propEye = new THREE.Vector3(0, -1e9, 0); this._propGen = -2; this._propNear = 0;
  }
  // 65th: reorder the shown instances of every pool when the occlusion horizon is replaced or the camera has moved 6 m:
  //   [near the camera (within reach of the sun's crisp shadow box, incl. long low-sun shadows)] [farther, visible]
  //   [farther, hidden behind buildings (OcclusionCuller)] [farther small parts beyond LOD.small]
  // The main camera draws the first two groups (the first three while no horizon is valid), the near sun shadow map only the
  // first (it used to draw all 430 m of instances into its ±35 m box); the far shadow map and the water mirror draw them all.
  // cam: the main camera position; shc: the centre of the sun's crisp shadow box (Atmosphere.fitSunShadow); sunY: sun height
  cullProps(cam, shc = cam, sunY = 0.7) {
    if (!this.propPools || !cam) return; const occ = this.occ; const gen = occ && occ.valid ? occ.gen : -1; const e = this._propEye, h = this._propShc || (this._propShc = new THREE.Vector3(0, -1e9, 0));
    const near = 62 + Math.min(150, 12 / Math.max(0.08, Math.tan(Math.asin(Math.min(0.999, Math.max(0.01, sunY)))))); // box half-diagonal + 6 m slack; 12 m: the tallest prop part
    if (gen === this._propGen && (cam.x - e.x) ** 2 + (cam.z - e.z) ** 2 < 36 && (shc.x - h.x) ** 2 + (shc.z - h.z) ** 2 < 36 && Math.abs(near - this._propNear) < 10) return;
    this._propGen = gen; e.copy(cam); h.copy(shc); this._propNear = near; this.orderProps(false);
  }
  orderProps(bounds) {
    const occ = this.occ, gen = this._propGen, hp = gen >= 0 && occ ? occ.hiddenProp : null, cx = this._propEye.x, cz = this._propEye.z, H = this._propShc || this._propEye, hx = H.x, hz = H.z;
    const near2 = this._propNear ** 2, far2 = LOD.enabled ? LOD.small * LOD.small : Infinity;
    for (const P of this.propPools) { const m = P.mesh; const M = m.instanceMatrix.array, C = m.instanceColor ? m.instanceColor.array : null, cls = P.cls; let n = 0; const k = [0, 0, 0, 0];
      for (const part of P.parts) { if (!part.c.props.visible) continue; const cs = part.cells, ps = part.pos;
        for (let i = 0; i < part.n; i++, n++) { let c = 1; const d2 = (ps[i * 2] - cx) ** 2 + (ps[i * 2 + 1] - cz) ** 2;
          if ((ps[i * 2] - hx) ** 2 + (ps[i * 2 + 1] - hz) ** 2 <= near2) c = 0;
          else if (P.small && d2 > far2) c = 3;
          else if (hp && cs[i * CSLOTS] >= 0) { c = 2; for (let j = 0; j < CSLOTS; j++) { const q = cs[i * CSLOTS + j]; if (q < 0) break; if (hp[q] !== 1) { c = 1; break; } } }
          cls[n] = c; k[c]++; } }
      const w = [0, k[0], k[0] + k[1], k[0] + k[1] + k[2]]; n = 0;
      for (const part of P.parts) { if (!part.c.props.visible) continue;
        for (let i = 0; i < part.n; i++, n++) { const at = w[cls[n]]++; M.set(part.mat.subarray(i * 16, i * 16 + 16), at * 16); if (C) C.set(part.color.subarray(i * 3, i * 3 + 3), at * 3); } }
      P.nNear = k[0]; P.nMain = k[0] + k[1]; P.nOcc = k[2]; P.nAll = n; P.gen = gen; m.count = n; m.visible = n > 0;
      if (n) { m.instanceMatrix.addUpdateRange(0, n * 16); m.instanceMatrix.needsUpdate = true; if (C) { m.instanceColor.addUpdateRange(0, n * 3); m.instanceColor.needsUpdate = true; } if (bounds) m.computeBoundingSphere(); } }
  }
  repackProps() { this.orderProps(true); } // (65th: in the visible / hidden / far order — orderProps)
  // every mesh of a chunk's permanent geometry (batched pieces as views, plus what stayed a separate mesh)
  chunkMeshes(c) { return c.baseViews ? [...c.baseViews, ...c.group.children] : c.group.children; }
  update(dt, focus, camera, atmos) {
    this.t += dt; windUniform.value += dt * (0.6 + (atmos ? atmos.w.wind : 0.3));
    this.signalTimer -= dt; if (this.signalTimer <= 0) { this.signalTimer = 0.25; updateSignals(this.simTime ?? this.t); }
    const fx = focus.x, fz = focus.z; let budget = 1; vineFade.value.x = fx; vineFade.value.y = fz;
    for (const c of this.chunks) {
      const d = Math.max(0, Math.hypot(c.cx - fx, c.cz - fz) - CHUNK * 0.7);
      // every chunk toggle has hysteresis (shown inside R, hidden only beyond R + H): standing or driving along a boundary
      // no longer flips a chunk's props / detail / windows on and off from frame to frame
      { const v = c.props.visible ? d < this.propRadius + 25 : d < this.propRadius; if (v !== c.props.visible) { c.props.visible = v; this.propDirty = true; } }
      if (c.vines) c.vines.visible = c.vines.visible ? d < this.vineRadius + 20 : d < this.vineRadius; /* the vine shader has already dissolved them by then (vineFade) */
      if (d < this.detailRadius || (c.detail && c.detail.visible && d < this.detailRadius + 25)) {
        if (!c.detail && budget > 0 && !this.job) { budget--; this.startDetailJob(c); } /* built over several frames: see stepDetailJob */
        else if (c.detail) c.detail.visible = true;
      } else if (c.detail) { c.detail.visible = false; if (d > this.detailRadius + 300 && !c.keep) this.disposeDetail(c); } /* c.keep: set only by the trailer on the chunks its cuts jump between */
      if (d < this.windowRadius || (c.win && c.win.visible && d < this.windowRadius + 15)) { if (!c.win && budget > 0 && !this.wjob) { budget--; this.wjob = this.newJob(c, 'win'); } else if (c.win) c.win.visible = true; } /* window joinery: also built over several frames */
      else if (c.win) { c.win.visible = false; if (d > this.windowRadius + 120 && !c.keep) this.disposeWindows(c); }
    }
    if (this.propDirty && this.propPools) { this.propDirty = false; this.repackProps(); }
    if (this.forest) this.forest.update(focus, camera);
    if (this.revealQ.length) this.revealStep();
    if (this.job) this.stepDetailJob(this.jobBudgetMs);
    if (this.wjob) this.stepWinJob(this.jobBudgetMs);
    if (this.grass) this.grass.update(dt, focus, atmos ? atmos.w.wind : 0.3);
    if (this.groundDetail && camera) this.groundDetail.update(camera);
    if (this.parks && this.parks.userData.flowers && camera) this.parks.userData.flowers.update(camera.position);
    if (this.parkLife && camera && atmos) this.parkLife.update(dt, atmos, camera);
    // landmark animation
    const an = this.landmarks.anim;
    if (an.lotusBeacon) an.lotusBeacon.visible = (this.t % 1.6) < 0.5; // aviation obstruction light
    if (this.fortStreets && atmos) this.fortStreets.update(atmos.night);
    if (this.bankFront && atmos) this.bankFront.update(atmos.night); // Ceylon Meridian Bank: fascia / signs / hall glow after dark
    if (this.glints && this.glints.mesh && atmos && camera) { // wet-road reflections of the street lamps near the camera
      const src = this._glintSrc; src.length = 0; const on = this.glintsOn !== false && atmos.night > 0.2 && atmos.wet > 0.02 && !(this.indoorK > 0.5);
      if (on) { const cp = camera.position; for (const c of this.chunks) { if (Math.abs(c.cx - cp.x) > 260 || Math.abs(c.cz - cp.z) > 260) continue; for (const p of c.lamps) { const d2 = (p[0] - cp.x) ** 2 + (p[2] - cp.z) ** 2; if (d2 < 140 * 140 && !(GRID.cur && GRID.cur.dim && GRID.cur.levelAt(p[0], p[2]) < 0.5)) src.push([p[0], p[1], p[2], 1.0, 0.79, 0.54, 1.5, d2]); } }
        src.sort((a, b) => a[7] - b[7]); }
      this.glints.update(camera, src, on ? atmos.wet : 0, atmos.night, (x, z) => !!L.roadAt(x, z), ROAD_Y); }
    if (an.lotusUpdate && atmos) an.lotusUpdate(this.t, atmos.night); // Lotus Tower LED show (LotusTower.js)
    if (an.clockTower && atmos) an.clockTower.update(atmos.hour, atmos.night); // Fort clock tower: the hands follow the game clock, dials lit at night
    if (an.fortStation && atmos) an.fortStation.update(atmos.hour, atmos.night, camera && camera.position); // Fort railway station: clocks, red LED clock, signs lit at night
    for (const m of this.landmarks.labels) if (m.emissiveIntensity !== undefined && atmos) m.emissiveIntensity = 0.2 + atmos.night * 0.9;
    // street-lamp point lights near the focus
    if (this.lampLights.length && atmos) {
      const on = atmos.night > 0.3;
      if (on) {
        const near = []; const ci = this.chunks; const cd = camera ? camera.getWorldDirection(this._lampDir || (this._lampDir = new THREE.Vector3())) : null;
        for (const c of ci) { if (Math.abs(c.cx - fx) > 300 || Math.abs(c.cz - fz) > 300) continue; for (const p of c.lamps) { const dx = p[0] - fx, dz = p[2] - fz, d2 = dx * dx + dz * dz; if (d2 > 110 * 110) continue;
          if (GRID.cur && GRID.cur.dim && GRID.cur.levelAt(p[0], p[2]) < 0.02) continue; // (79th: no light for a dead lamp)
          const inView = !cd || d2 < 400 || (dx * cd.x + dz * cd.z) / Math.sqrt(d2) > 0.35; near.push([d2 * (inView ? 1 : 3), p]); } }
        near.sort((a, b) => a[0] - b[0]); const want = new Set(near.slice(0, this.lampLights.length).map((n) => n[1]));
        this.lampFade(dt, want, atmos.night * 44 * (1 - (this.indoorK || 0)) * Math.min(1, Math.max(0, (atmos.night - 0.3) / 0.3)) ** 2); // 35th: ramps up from 0 where the lamps switch on (night 0.3) instead of jumping to 13 // inside a building the street lamps' light no longer passes through its walls
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
      if (det) { this.markJob(J); buildDetail(bs[J.i++], J.B[0]); } else { if (!J.tasks || !J.tasks.length) { this.markJob(J); J.tasks = windowTasks(bs[J.i++], J.B[0], J.B[1]); } const t = J.tasks.shift(); if (t) t(); }
      if (performance.now() - t0 > budgetMs) return false; }
    if (!J.q) { this.markJob(J); J.q = []; J.B.forEach((mb, k) => { for (const name of mb.b.keys()) J.q.push([k, name]); }); }
    while (J.q.length || J.sb || J.rb) { // merge: one material at a time, large ones in slices
      if (J.rb) { if (!J.rb.step(t0, budgetMs)) return false; const B = J.rb.mesh, o = J.rbOpts; J.rb = null; B.name = J.sn; B.castShadow = o.cast; B.receiveShadow = o.receive; B.matrixAutoUpdate = false; B.updateMatrix(); J.meshes.push(B); if ((J.q.length || J.sb) && performance.now() - t0 > budgetMs) return false; continue; }
      if (!J.sb) { const [k, name] = J.q.shift(); J.sb = new SliceBuild(J.B[k].b.get(name)); J.sk = k; J.sn = name; }
      if (!J.sb.step(t0, budgetMs)) return false;
      const g = J.sb.geometry(), k = J.sk; J.sb = null;
      if (g) { const opts = det ? { cast: true, receive: true } : k === 0 ? { cast: false, receive: true } : { cast: false, receive: false };
        // opaque detail / window joinery: one BatchedMesh instance per building (per-building frustum culling, still one draw) — see CellBatch.RangeBatch
        const mat = matFor(J.sn, MAT), ranges = (det || k === 0) && mat && !mat.isShaderMaterial && !FOLIAGE.has(J.sn) && J.sn !== 'pool' && J.sn !== 'lampHead' ? rangesFor(J.marks, J.sn) : null;
        if (ranges && ranges.length >= 3 && g.index.count >= 18000) { const bl = plan.byChunk[J.c.idx].buildings; J.rb = new RangeBatch(g, ranges, mat, { kind: det ? 'detail' : 'win', occ: this.occ, ids: ranges.map((r) => (bl[r[4]] ? bl[r[4]].id : -1)) }); J.rbOpts = opts; /* 65th: + per-building occlusion / LOD (BatchCull.js) */ if (performance.now() - t0 > budgetMs) return false; continue; }
        const m = meshFor(J.sn, g, MAT, opts); if (m) { if (!det && k === 1) m.renderOrder = 2; J.meshes.push(m); } }
      if ((J.q.length || J.sb) && performance.now() - t0 > budgetMs) return false; }
    const c = J.c; if (det ? c.detail : c.win) { for (const m of J.meshes) disposeMesh(m); return true; } // built meanwhile by warm()
    if (det) this.finishDetail(c, J.meshes, !J.sync); else this.finishWindows(c, J.meshes, !J.sync); return true;
  }
  // per-building range marks: each material builder's vertex / index count before every building (+ one at the end)
  markJob(J) { const mb = J.B[0]; (J.marks || (J.marks = [])).push(new Map([...mb.b].map(([n, b]) => [n, [b.pos.length / 3, b.idx.length]]))); }
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
    const J = this.newJob(c, 'detail'); J.sync = true; this.stepJob(J, Infinity); // one-shot (warm / loading): the same job code, unbudgeted
  }
  // near tier: 3D window joinery + reflective panes (see BuildingGen.buildWindows)
  buildWindowsFor(c) {
    if (this.wjob && this.wjob.c === c) { this.stepWinJob(Infinity); if (c.win) return; }
    const J = this.newJob(c, 'win'); J.sync = true; this.stepJob(J, Infinity);
  }
  disposeWindows(c) { c.group.remove(c.win); c.win.traverse((m) => m.geometry && disposeMesh(m)); c.win = null; }
  // after a long jump (teleport / fast travel) release streamed chunk geometry well outside the new streaming radii at once,
  // instead of keeping it until the 630 m hysteresis — keeps memory flat when jumping across the city
  trim(x, z) { let n = 0; for (const c of this.chunks) { const d = Math.max(0, Math.hypot(c.cx - x, c.cz - z) - CHUNK * 0.7); if (c.detail && d > this.detailRadius + 60) { this.disposeDetail(c); n++; } if (c.win && d > this.windowRadius + 40) { this.disposeWindows(c); n++; } } return n; }
  disposeDetail(c) { c.group.remove(c.detail); c.detail.traverse((m) => m.geometry && disposeMesh(m)); c.detail = null; }
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
  // 79th: pole transformers within r of (x, z) (PowerGrid.onBlast) — from the plan's props of the chunks around
  transformersNear(x, z, r) { const out = []; const P = this.plan; if (!P) return out; for (const c of this.chunks) { if (Math.abs(c.cx - x) > 120 || Math.abs(c.cz - z) > 120) continue;
    for (const p of P.byChunk[c.idx].props || []) if (p.type === 'pole' && p.transformer && Math.abs(p.x - x) < r && Math.abs(p.z - z) < r) out.push(p); } return out; }
  lampFade(dt, want, base) {
    const lit = new Set(); const _m = this._lampM || (this._lampM = new THREE.Matrix4());
    const decal = (lamp, on) => { const [x, , z, mesh, i] = lamp; if (!mesh) return; if (on) _m.makeTranslation(x, ROAD_Y + 0.03, z); else _m.makeScale(0, 0, 0); mesh.setMatrixAt(i, _m); mesh.instanceMatrix.needsUpdate = true; };
    for (const l of this.lampLights) { const u = l.userData; if (!u.lamp) continue;
      if (want.has(u.lamp) && base > 0) { u.k = Math.min(1, u.k + dt * 2.2); lit.add(u.lamp); } else { u.k -= dt * 2.2; if (u.k <= 0) { decal(u.lamp, true); u.lamp = null; u.k = 0; } else lit.add(u.lamp); } }
    for (const lamp of want) { if (lit.has(lamp) || base <= 0) continue; const l = this.lampLights.find((q) => !q.userData.lamp); if (!l) break;
      l.userData.lamp = lamp; l.userData.k = 0; decal(lamp, false); l.position.set(lamp[0], lamp[1] - 0.4, lamp[2]); l.target.position.set(lamp[0], ROAD_Y, lamp[2] + 0.001); l.target.updateMatrixWorld(); lit.add(lamp); }
    const G = GRID.cur, pw = G && G.dim ? (lamp) => G.levelAt(lamp[0], lamp[2]) : null; // 79th: a lamp in a district without power goes out with it (and flickers back)
    for (const l of this.lampLights) { const u = l.userData; const I = u.lamp ? base * u.k * (pw ? pw(u.lamp) : 1) : 0; if (l.intensity !== I) l.intensity = I; if (l.castShadow) l.shadow.autoUpdate = I > 0; } /* FPS: an unlit pooled lamp (all day, parked at y -600) no longer re-renders its shadow map every frame */
  }
  setQuality(q) { this.quality = q; setLodQuality(q); /* 65th: BatchCull LOD / draw distances */ if (this.glints) this.glints.max = WetGlints.budget(q); if (this.grass) this.grass.setQuality(q); if (this.groundDetail) this.groundDetail.setQuality(q); if (this.forest) this.forest.setQuality(q); if (this.parkLife) this.parkLife.setQuality(q); if (this.parks && this.parks.userData.flowers) this.parks.userData.flowers.setQuality(q); const s = q === 'low' ? 0.6 : q === 'medium' ? 0.8 : q === 'ultra' ? 1.25 : 1; this.detailRadius = 330 * s; this.windowRadius = q === 'low' ? 0 : q === 'medium' ? 90 : q === 'ultra' ? 210 : 150; this.propRadius = 430 * s; this.treeRadius = 520 * s; }
}
export { plan };
