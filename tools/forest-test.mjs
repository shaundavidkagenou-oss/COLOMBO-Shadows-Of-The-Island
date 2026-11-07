// Vegetation: Greenery placement (trees, shrubs, ferns, weeds), Forest batching / culling / LOD, Vines.
//   node tools/forest-test.mjs
import './node-dom-stub.mjs';
globalThis.localStorage ??= { getItem: () => null, setItem: () => {}, removeItem: () => {} };
const THREE = await import('three');
const { MAT } = await import('../src/gfx/Materials.js'); // stub materials (no WebGL / canvas in node)
Object.setPrototypeOf(MAT, new Proxy({}, { get: (t, k) => { if (typeof k !== 'string') return undefined; if (!t[k]) t[k] = new THREE.MeshStandardMaterial({ name: k, vertexColors: true }); return t[k]; } }));
const CP = await import('../src/world/CityPlan.js');
const L = await import('../src/world/Layout.js');
const { Forest, CELL } = await import('../src/world/Forest.js');
const { buildVines } = await import('../src/world/Vines.js');
const { plantShapes, treeShapes } = await import('../src/world/TreeShapes.js');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };

const t0 = performance.now(); const plan = CP.generatePlan(); const planMs = performance.now() - t0;
console.log('plan', Math.round(planMs), 'ms', plan.stats, plan.greenTreeStats, plan.plantStats);
ok(plan.trees.length > 5000, `many more trees (${plan.trees.length}, was 3529)`);
ok(plan.plants.length > 12000, `ground plants (${plan.plants.length})`);
const TS = treeShapes(), PS = plantShapes();
ok(plan.trees.every((t) => TS[t.type]), 'every tree species has a shape');
ok(plan.plants.every((p) => PS[p.type]), 'every plant type has a shape');
for (const k of ['banana', 'areca', 'mango', 'palm', 'frangipani', 'jak']) ok(plan.trees.some((t) => t.type === k), `garden species ${k} planted`);
for (const k of ['croton', 'hibiscus', 'ixora', 'bougain', 'shrub', 'weed', 'fern']) ok(plan.plants.some((p) => p.type === k), `plant type ${k} present`);

// --- placement: never on a road / pavement / water / rail, never inside a building or wall, off doorsteps and gates
const inRect = (x, z, r, m) => x > r.x0 - m && x < r.x1 + m && z > r.z0 - m && z < r.z1 + m;
const bByCell = new Map(); const key = (x, z) => Math.floor(x / 20) * 100003 + Math.floor(z / 20);
const file = (r, list) => { for (let i = Math.floor(r.x0 / 20); i <= Math.floor(r.x1 / 20); i++) for (let j = Math.floor(r.z0 / 20); j <= Math.floor(r.z1 / 20); j++) { const k = i * 100003 + j; if (!list.has(k)) list.set(k, []); list.get(k).push(r); } };
for (const b of plan.buildings) file(b, bByCell); const wByCell = new Map(); for (const w of plan.walls) file(w, wByCell);
let onRoad = 0, inB = 0, inW = 0, wet = 0, nearDoor = 0, rail = 0, ex = [];
const doors = plan.props.filter((p) => p.type === 'gate').concat(plan.poi.filter((p) => p.type === 'door'));
const dGrid = new Map(); for (const d of doors) { const k = key(d.x, d.z); if (!dGrid.has(k)) dGrid.set(k, []); dGrid.get(k).push(d); }
for (const p of plan.plants) { const r = PS[p.type].r * p.s * 0.8;
  if (L.roadAt(p.x, p.z)) { onRoad++; if (ex.length < 4) ex.push(['road', p.type, p.x.toFixed(1), p.z.toFixed(1)]); }
  if (L.isWater(p.x, p.z)) wet++; if (L.distToRail(p.x, p.z) < 6) rail++;
  if ((bByCell.get(key(p.x, p.z)) || []).some((b) => inRect(p.x, p.z, b, r * 0.5))) { inB++; if (ex.length < 8) ex.push(['bld', p.type, p.x.toFixed(1), p.z.toFixed(1)]); }
  if ((wByCell.get(key(p.x, p.z)) || []).some((w) => inRect(p.x, p.z, w, 0.02))) inW++;
  const near = []; for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) near.push(...(dGrid.get(key(p.x + i * 20, p.z + j * 20)) || []));
  if (near.some((d) => Math.hypot(d.x - p.x, d.z - p.z) < 1.2)) nearDoor++; }
ok(onRoad === 0, `no plant on a road or pavement (${onRoad}) ${JSON.stringify(ex.filter((e) => e[0] === 'road'))}`);
ok(inB === 0, `no plant inside a building (${inB}) ${JSON.stringify(ex.filter((e) => e[0] === 'bld'))}`);
ok(inW === 0, `no plant inside a wall (${inW})`); ok(wet === 0, `no plant in water (${wet})`); ok(rail === 0, `no plant on the railway (${rail})`);
ok(nearDoor === 0, `no plant on a doorstep / gateway (${nearDoor})`);
let tRoad = 0, tB = 0; for (const t of plan.trees) { if (L.roadAt(t.x, t.z)) tRoad++; if ((bByCell.get(key(t.x, t.z)) || []).some((b) => inRect(t.x, t.z, b, -0.05))) tB++; }
ok(tRoad === 0, `no tree trunk on a carriageway (${tRoad})`); ok(tB === 0, `no tree trunk inside a building (${tB})`);
// districts that had no street trees now have a few; garden houses have garden trees
const byD = {}; for (const t of plan.trees) { const d = L.districtIdAt(t.x, t.z); byD[d] = (byD[d] || 0) + 1; }
for (const d of ['pettah', 'maradana', 'kotahena', 'slave', 'wellawatte']) ok((byD[d] || 0) > 5, `${d} has trees (${byD[d] || 0})`);
console.log('trees by district', byD);

// --- Forest: batching, culling, LOD
const t1 = performance.now(); const F = new Forest(plan.trees, plan.plants, 'high'); const fMs = performance.now() - t1;
console.log('forest build', Math.round(fMs), 'ms', F.meshes.length, 'batched meshes', F.stats.instances, 'instances');
ok(F.meshes.length <= 16, `vegetation in ≤16 batched meshes (${F.meshes.length})`); ok(fMs < 1500, `forest builds fast (${Math.round(fMs)} ms)`);
ok(F.meshes.filter((m) => m.castShadow).every((m) => m.name.startsWith('forest:tree')), 'only trees cast shadows');
const scene = new THREE.Scene(); scene.add(F.group); const cam = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 3000);
const frame = (x, z, yaw, lookFar = true) => { cam.position.set(x, L.LAND_Y + 2, z); cam.lookAt(x + Math.sin(yaw) * 10, L.LAND_Y + (lookFar ? 2 : -3), z + Math.cos(yaw) * 10); cam.updateMatrixWorld(); scene.updateMatrixWorld(true);
  F.update({ x, z }, cam); let draws = 0, tris = 0; for (const m of F.meshes) { m.onBeforeRender(null, scene, cam, m.geometry, m.material); draws += m._multiDrawCount; for (let i = 0; i < m._multiDrawCount; i++) tris += m._multiDrawCounts[i] / 3; } return { draws, tris }; };
// a garden district (Cinnamon Gardens) and the quick-play start (Pettah)
const spots = [[-245, 72, 0], [-245, 72, Math.PI], [-140, -891.8, 0], [100, -60, 1.2]];
let maxTris = 0;
for (const [x, z, yaw] of spots) { const r = frame(x, z, yaw); maxTris = Math.max(maxTris, r.tris); console.log(`  view (${x}, ${z}) yaw ${yaw.toFixed(1)}: ${r.draws} instances drawn, ${(r.tris / 1000).toFixed(0)}k tris`); ok(r.draws > 0, `something drawn at (${x}, ${z})`); }
ok(maxTris < 2.6e6, `vegetation triangles per view bounded (${(maxTris / 1e6).toFixed(2)} M)`);
// culling: looking one way vs the other draws different sets; nothing behind the camera beyond one cell
{ const x = -245, z = 72; frame(x, z, 0); const m = F.meshes.find((q) => q.name === 'forest:tree:treeBark') || F.meshes[0]; const seen = new Set(); for (let i = 0; i < m._multiDrawCount; i++) seen.add(m._indirectTexture.image.data[i]);
  const mat = new THREE.Matrix4(), p = new THREE.Vector3(); let behind = 0, far = 0; for (const id of seen) { m.getMatrixAt(id, mat); p.setFromMatrixPosition(mat); const dz = p.z - z; if (dz < -CELL * 1.6) behind++; if (Math.hypot(p.x - x, p.z - z) > F.R[0] + CELL * 1.5) far++; }
  ok(behind === 0, `frustum culling: no trunk drawn well behind the camera (${behind})`); ok(far === 0, `range culling: nothing past the tree range (${far})`); }
// LOD: a cell next to the camera uses the detailed geometry, a far cell the light one
{ const x = -245, z = 72; frame(x, z, 0); const leaves = F.meshes.filter((m) => m.castShadow); let nearHi = 0, nearLo = 0, farHi = 0, farLo = 0; const mat = new THREE.Matrix4(), p = new THREE.Vector3();
  for (const m of leaves) { const GI = m._geometryInfo; const bpe = m.geometry.index.array.BYTES_PER_ELEMENT; const starts = new Map(GI.map((g, i) => [g.start * bpe, i]));
    for (let i = 0; i < m._multiDrawCount; i++) { const id = m._indirectTexture.image.data[i]; m.getMatrixAt(id, mat); p.setFromMatrixPosition(mat); const d = Math.hypot(p.x - x, p.z - z); const gid = starts.get(m._multiDrawStarts[i]);
      const own = m._instanceInfo[id].geometryIndex; const hi = gid === own; if (d < 25) { if (hi) nearHi++; else nearLo++; } else if (d > F.LOD[0] + CELL * 1.5) { if (hi) farHi++; else farLo++; } } }
  console.log('  LOD near hi/lo', nearHi, nearLo, ' far hi/lo', farHi, farLo);
  ok(nearHi > 0 && nearLo === 0, 'near trees use the detailed mesh'); ok(farLo > 0 && farHi <= farLo * 0.02, 'far trees use the light mesh'); }
// ground plants only near: nothing past their range
{ const x = -245, z = 72; frame(x, z, 0); const pm = F.meshes.filter((m) => !m.castShadow); const mat = new THREE.Matrix4(), p = new THREE.Vector3(); let far = 0, n = 0;
  for (const m of pm) for (let i = 0; i < m._multiDrawCount; i++) { m.getMatrixAt(m._indirectTexture.image.data[i], mat); p.setFromMatrixPosition(mat); n++; if (Math.hypot(p.x - x, p.z - z) > F.R[1] + CELL * 1.5) far++; }
  ok(n > 50, `ground plants drawn near a garden house (${n})`); ok(far === 0, `ground plants culled past ${F.R[1]} m (${far})`); }
// the street-lamp shadow cameras skip foliage; the sun shadow draws the trees
{ const sc = new THREE.OrthographicCamera(-100, 100, 100, -100, 1, 800); sc.position.set(-245, 300, 72); sc.lookAt(-245, 0, 72); sc.updateMatrixWorld(); const leaf = F.meshes.find((m) => m.castShadow && /:(leaves|palm)$/.test(m.name));
  leaf.onBeforeShadow(null, leaf, cam, sc, leaf.geometry, null); ok(leaf._multiDrawCount > 0, 'sun shadow draws tree crowns'); sc.userData.noFoliage = true; F.update({ x: -245, z: 72 }, cam); leaf.onBeforeShadow(null, leaf, cam, sc, leaf.geometry, null); ok(leaf._multiDrawCount === 0, 'lamp shadow cameras skip foliage'); }
// per-frame cost: update + fill all meshes for 3 cameras
{ const N = 200; const t = performance.now(); for (let i = 0; i < N; i++) { const x = -245 + i * 1.5, z = 72 + i * 0.5; frame(x, z, i * 0.03); } const ms = (performance.now() - t) / N; console.log('  per-frame CPU (update + 1 camera fill)', ms.toFixed(3), 'ms'); ok(ms < 1.5, `forest CPU per frame small (${ms.toFixed(3)} ms)`); }
// Satellite: forcing a chunk's cells draws them from anywhere
{ const h = F.chunkHandle(-300, 0, 200); h.visible = true; frame(1200, -2400, 0); const m = F.meshes[0]; ok(m._multiDrawCount > 0 || F.meshes.some((q) => q._multiDrawCount > 0), 'forced (satellite) chunk is drawn'); h.visible = false; }
// quality
for (const q of ['low', 'medium', 'high', 'ultra']) { F.setQuality(q); const r = frame(-245, 72, 0); console.log(`  ${q}: ${r.draws} instances, ${(r.tris / 1000).toFixed(0)}k tris`); }

// --- Vines
const chunks = []; for (let idx = 0; idx < CP.NCX * CP.NCZ; idx++) { const [cx, cz] = CP.chunkCenter(idx); chunks.push({ idx, cx, cz, group: new THREE.Group() }); }
const VS = buildVines(plan, chunks); const { warm, ...vs } = VS; console.log('vines', vs); ok(warm && warm.isMesh && warm.geometry.drawRange.count === 0, 'vine shader warm-up mesh draws nothing');
ok(VS.walls > 300 && VS.drapes > 200 && VS.houses > 100 && VS.poles > 50, 'creepers on walls, bougainvillea drapes, house walls and poles');
ok(VS.ms < 3000, `vines build fast (${VS.ms} ms)`); ok(VS.verts < 2.5e6, `vine vertex budget (${VS.verts})`);
const vm = chunks.filter((c) => c.vines); ok(vm.length > 20, `vine meshes in many chunks (${vm.length})`);
ok(vm.every((c) => c.vines.children.every((m) => !m.castShadow && m.geometry.boundingSphere)), 'vines cast no shadows and are frustum-culled per chunk');
ok(vm.every((c) => c.vines.children.length <= 2), 'at most two draws per chunk');
// no vine leaf inside a building (a card centre more than 15 cm inside any footprint)
{ let bad = 0; for (const c of vm) { const pos = c.vines.children[0].geometry.attributes.position.array; for (let i = 0; i < pos.length; i += 12) { const x = (pos[i] + pos[i + 6]) / 2, z = (pos[i + 2] + pos[i + 8]) / 2;
      if ((bByCell.get(key(x, z)) || []).some((b) => inRect(x, z, b, -0.15))) bad++; } } ok(bad === 0, `no vine leaf deep inside a building (${bad})`); }
console.log(`forest: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
