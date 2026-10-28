// Headless smoke test (no browser / GPU needed). Run: npm run test:smoke
// Checks: world generation, road connectivity, key places, characters, vehicles, dialogue data,
// save-slot round trip, mission definitions and a production build.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import * as THREE from 'three';

// ---- minimal DOM/canvas stubs so the procedural modules can run in Node
const ctx2d = new Proxy({}, { get: (t, k) => (k in t ? t[k] : k === 'measureText' ? () => ({ width: 10 }) : k.startsWith?.('create') ? () => ({ addColorStop() {} }) : k === 'getImageData' ? (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }) : () => {}), set: (t, k, v) => ((t[k] = v), true) });
globalThis.document = { createElement: () => ({ width: 1, height: 1, getContext: () => ctx2d, style: {} }) };
const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };

let failed = 0; const results = [];
async function check(name, fn) {
  const t0 = performance.now();
  try { const info = await fn(); results.push(`  PASS  ${name}${info ? ' — ' + info : ''} (${(performance.now() - t0).toFixed(0)} ms)`); }
  catch (e) { failed++; results.push(`  FAIL  ${name} — ${e && e.message ? e.message : e}`); }
}
const assert = (c, msg) => { if (!c) throw new Error(msg); };
const finite = (arr) => { for (let i = 0; i < arr.length; i++) if (!Number.isFinite(arr[i])) return false; return true; };

const { TEX } = await import('../src/gfx/Textures.js');
const { MAT } = await import('../src/gfx/Materials.js');
Object.setPrototypeOf(TEX, new Proxy({}, { get: (t, k) => { if (typeof k !== 'string') return undefined; if (!t[k]) { const tx = new THREE.Texture(); tx.map = tx.emissive = tx.rm = new THREE.Texture(); t[k] = tx; } return t[k]; } }));
Object.setPrototypeOf(MAT, new Proxy({}, { get: (t, k) => { if (typeof k !== 'string') return undefined; if (!t[k]) t[k] = new THREE.MeshStandardMaterial({ name: k }); return t[k]; } }));

const L = await import('../src/world/Layout.js');
const CP = await import('../src/world/CityPlan.js');

await check('City plan generates', () => {
  const p = CP.generatePlan(); assert(p.buildings.length > 1500, `only ${p.buildings.length} buildings`); assert(p.props.length > 1000, 'too few props');
  const styles = new Set(p.buildings.map((b) => b.style)); assert(styles.size >= 8, `only ${styles.size} building styles`);
  return `${p.buildings.length} buildings, ${styles.size} styles, ${p.props.length} props, ${p.trees.length} trees`;
});

await check('Road network is one connected graph', () => {
  const seen = new Set(); const start = L.nodes.find((n) => n.segs.length); const q = [start]; seen.add(start.id);
  const other = (s, n) => { if (s.dir === 'v') return L.nodeAt(s.i, n.j === s.j ? s.j + 1 : s.j); return L.nodeAt(n.i === s.i ? s.i + 1 : s.i, s.j); };
  while (q.length) { const n = q.pop(); for (const s of n.segs) { const m = other(s, n); if (m && !seen.has(m.id)) { seen.add(m.id); q.push(m); } } }
  const live = L.nodes.filter((n) => n.segs.length).length; assert(seen.size === live, `${live - seen.size} junctions unreachable`);
  return `${live} junctions, ${L.segments.length} road segments`;
});

await check('Key story places are reachable (not inside buildings or water)', () => {
  // places targeted directly by objectives + every mission-shop door (shops use the door point, not the PLACES anchor)
  const critical = ['meeting', 'gfPromenade', 'gfKade', 'lotus', 'museum', 'townhall', 'fortStation', 'wellawatte'];
  const pts = critical.map((k) => [k, L.PLACES[k]]).concat(Object.entries(CP.plan.missionShops).map(([k, v]) => ['shop:' + k, v]));
  assert(Object.keys(CP.plan.missionShops).length >= 6, 'mission shops not assigned'); const bad = [];
  for (const [k, p] of pts) { if (!p) { bad.push(k + ' missing'); continue; } if (L.isWater(p.x, p.z)) bad.push(k + ' in water'); for (const c of CP.plan.colliders) if (c.kind === 'building' && p.x > c.x0 && p.x < c.x1 && p.z > c.z0 && p.z < c.z1) { bad.push(k + ' inside building'); break; } }
  assert(!bad.length, bad.join(', ')); return `${pts.length} places/doors ok`;
});

await check('Districts cover the map with real Colombo names', () => {
  const names = new Set(); for (let x = L.BOUNDS.minX; x < L.BOUNDS.maxX; x += 40) for (let z = L.BOUNDS.minZ; z < L.BOUNDS.maxZ; z += 40) { const d = L.districtAt(x, z); if (d) names.add(d.name.split(' · ')[0]); }
  for (const must of ['Fort', 'Pettah', 'Galle Face', 'Kollupitiya', 'Bambalapitiya', 'Wellawatte', 'Borella', 'Maradana', 'Slave Island']) assert([...names].some((n) => n.includes(must)), `${must} missing`);
  return [...names].length + ' districts';
});

await check('World geometry builds without NaN', async () => {
  const { MultiBuilder } = await import('../src/gfx/MeshBuilder.js'); const BG = await import('../src/world/BuildingGen.js');
  const G = await import('../src/world/GroundBuilder.js'); const LM = await import('../src/world/Landmarks.js');
  let tris = 0;
  for (const mb of G.buildGround(() => {})) if (mb) for (const m of mb.toMeshes(MAT)) { assert(finite(m.geometry.attributes.position.array), 'NaN in ground'); tris += m.geometry.index ? m.geometry.index.count / 3 : 0; }
  const lm = LM.buildLandmarks(); lm.group.traverse((o) => { if (o.geometry) assert(finite(o.geometry.attributes.position.array), 'NaN in landmark ' + o.name); });
  for (const ch of CP.plan.byChunk.slice(0, 40)) { const mb = new MultiBuilder(); for (const b of ch.buildings) { BG.buildBase(b, mb); BG.buildDetail(b, mb); } for (const m of mb.toMeshes(MAT)) { assert(finite(m.geometry.attributes.position.array), 'NaN in buildings'); tris += m.geometry.index.count / 3; } }
  return `${(tris / 1e6).toFixed(2)} M triangles sampled`;
});

await check('Characters: 60 varied Sri Lankan pedestrians build cleanly', async () => {
  const C = await import('../src/actors/Character.js'); const outfits = new Set(); let saree = 0, women = 0;
  for (let i = 0; i < 60; i++) { const sp = C.randomSpec(1000 + i); outfits.add(sp.outfit); if (sp.outfit === 'saree') saree++; if (sp.sex === 'f') women++; const g = C.buildBodyGeometry(sp); assert(finite(g.attributes.position.array), 'NaN in body ' + i); assert(g.index.count > 1000, 'body too simple'); }
  for (const k of Object.keys(C.HEROES)) C.buildBodyGeometry(C.HEROES[k]);
  assert(outfits.size >= 6, 'not enough outfit variety'); assert(women >= 15, 'too few women');
  return `${outfits.size} outfit types, ${women} women, ${saree} in saree`;
});

await check('Vehicles: every type builds with wheels and seats', async () => {
  const V = await import('../src/vehicles/VehicleModels.js'); const types = Object.keys(V.VTYPES);
  for (const t of types) { const m = V.createVehicleMesh(t, 7); assert(m.userData.wheels.length >= 2, t + ' wheels'); assert(m.userData.seats.length >= 1, t + ' seats'); m.traverse((o) => { if (o.geometry) assert(finite(o.geometry.attributes.position.array), 'NaN in ' + t); }); }
  for (const must of ['tuktuk', 'bus', 'pbus', 'car', 'bike', 'van', 'lorry', 'taxi']) assert(types.includes(must), must + ' missing');
  return types.join(', ');
});

await check('Ambient dialogue is non-empty and subtitled', async () => {
  const { LINES } = await import('../src/story/Lines.js'); let n = 0, si = 0, ta = 0;
  for (const [k, list] of Object.entries(LINES)) { assert(Array.isArray(list) && list.length, k + ' empty'); for (const l of list) { n++; const text = l.si || l.ta || l.en; assert(text && text.trim(), k + ' blank line'); if (l.si || l.ta) assert(l.tr, `${k}: "${text}" has no English subtitle`); if (l.si) si++; if (l.ta) ta++; } }
  return `${n} lines (${si} Sinhala, ${ta} Tamil, rest English)`;
});

await check('Save slots round-trip', async () => {
  const { SaveSystem } = await import('../src/core/SaveSystem.js');
  SaveSystem.write('1', { story: { mission: { id: 'm2', stage: 1 }, money: 4200 }, player: { x: 1, z: 2, yaw: 0 } });
  const r = SaveSystem.read('1'); assert(r && r.story.money === 4200 && r.story.mission.id === 'm2', 'data mismatch');
  assert(SaveSystem.latest().slot === '1', 'latest() wrong'); return 'ok';
});

await check('Every mission has a stage list', () => {
  const src = readFileSync(new URL('../src/story/Story.js', import.meta.url), 'utf8');
  const ids = [...src.slice(src.indexOf('export const MISSIONS'), src.indexOf('];', src.indexOf('export const MISSIONS'))).matchAll(/id: '(\w+)'/g)].map((m) => m[1]);
  assert(ids.length >= 6, 'too few missions'); const missing = ids.filter((id) => !src.includes(`stages_${id}()`)); assert(!missing.length, 'no stages for ' + missing.join(','));
  return ids.length + ' missions: ' + ids.join(', ');
});

await check('Brand logo asset present', () => { assert(existsSync(new URL('../public/assets/brand/sds-logo.jpg', import.meta.url)), 'logo missing'); return 'public/assets/brand/sds-logo.jpg'; });

if (!process.argv.includes('--no-build')) await check('Production build (vite build)', () => {
  const r = spawnSync('npx', ['vite', 'build'], { cwd: new URL('..', import.meta.url).pathname, encoding: 'utf8' });
  assert(r.status === 0, (r.stderr || r.stdout).split('\n').slice(-6).join(' | ')); assert(existsSync(new URL('../dist/index.html', import.meta.url)), 'dist/index.html missing'); return 'dist/ ok';
});

console.log('\nCOLOMBO: SHADOWS OF THE ISLAND — smoke test\n' + results.join('\n') + `\n\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
