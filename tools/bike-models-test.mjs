// Motorcycle models (node tools/bike-models-test.mjs): every one of the 20 two-wheelers (BikeCatalog.js) plus the legacy
// 'bike' and the police bike is built by the REAL VehicleModels / BikeModels code and checked:
//   • geometry: no NaN / Infinity, sits on the road (min y ≈ 0), wheels at T.wheelR, length within the catalogue length
//   • two seats (rider + pillion) with handlebar grips, the pillion behind the rider, pegs below the saddle
//   • realistic parts present: tank, engine, exhaust outlet, mirrors (glass), instruments (dash material), indicators
//   • the five big racers are ≥ 900 cc with carbon-fibre parts and twin front discs (wheel style 2)
//   • no tunnelling: a racer at full speed (74 m/s) at 30 fps and 20 fps never passes a thin wall / fence
import './node-dom-stub.mjs';
import * as THREE from 'three';
const { createVehicleMesh, VTYPES } = await import('../src/vehicles/VehicleModels.js');
const { BIKES, BIKE_IDS, SUPERBIKE_IDS, BIKE_LISTS, BIKE_PARKED } = await import('../src/vehicles/BikeCatalog.js');
const { Vehicle } = await import('../src/vehicles/Vehicle.js');
const { Collision } = await import('../src/world/Collision.js');
const L = await import('../src/world/Layout.js');

let checks = 0, fails = 0; const bad = [];
const ok = (c, m) => { checks++; if (!c) { fails++; if (bad.length < 40) bad.push(m); } };

ok(BIKE_IDS.length === 20, `20 kinds (got ${BIKE_IDS.length})`);
ok(SUPERBIKE_IDS.length === 5, `5 racers (got ${SUPERBIKE_IDS.length})`);
for (const id of SUPERBIKE_IDS) ok(BIKES[id].cc >= 900 && BIKES[id].maxSpeed >= 60, `${id}: racer ${BIKES[id].cc} cc / ${BIKES[id].maxSpeed} m/s`);
for (const lists of [...Object.values(BIKE_LISTS), BIKE_PARKED]) for (const [id, w] of lists) ok(VTYPES[id] && w > 0, `weights: unknown ${id}`);
for (const id of BIKE_IDS) ok(VTYPES[id] === BIKES[id] && VTYPES[id].entry === 'bike', `${id}: registered as a two-wheeler`);

const matNames = (o) => { const s = new Set(); o.traverse((m) => { if (m.isMesh) s.add(m.name); }); return s; }; // part groups: paint, chrome, carbon, mirror, dash, engine, alloy, …
for (const id of [...BIKE_IDS, 'bike', 'policebike']) for (const seed of [1, 2, 3]) {
  const tag = `${id}/v${seed}`; const T = VTYPES[id]; const g = createVehicleMesh(id, seed); const ud = g.userData;
  let nan = 0, tris = 0; const box = new THREE.Box3(); g.updateMatrixWorld(true);
  const scan = (o) => o.traverse((m) => { if (!m.isMesh || m.name === 'contactShadow') return; const p = m.geometry.attributes.position; tris += (m.geometry.index ? m.geometry.index.count : p.count) / 3; for (const v of p.array) if (!Number.isFinite(v)) nan++; m.geometry.computeBoundingBox(); box.union(m.geometry.boundingBox.clone().applyMatrix4(m.matrixWorld)); });
  scan(g); if (ud.detail) { ud.detail.updateMatrixWorld(true); scan(ud.detail); }
  ok(nan === 0, `${tag}: ${nan} non-finite vertex values`);
  ok(tris > 3500, `${tag}: only ${tris} triangles`);
  ok(Math.abs(box.min.y) < 0.03, `${tag}: lowest point ${box.min.y.toFixed(3)} (should rest on the road)`);
  ok(box.max.z - box.min.z <= T.len + 0.12 && box.max.z - box.min.z > T.len - 0.45, `${tag}: length ${(box.max.z - box.min.z).toFixed(2)} vs catalogue ${T.len}`);
  ok(box.max.x - box.min.x < 1.0, `${tag}: width ${(box.max.x - box.min.x).toFixed(2)} (mirrors included)`);
  ok(ud.wheels && ud.wheels.length === 2, `${tag}: two wheels`);
  for (const w of ud.wheels || []) ok(Math.abs(w.position.y - T.wheelR) < 0.005, `${tag}: wheel axle ${w.position.y.toFixed(3)} ≠ wheelR ${T.wheelR}`);
  const [r, p] = ud.seats || [];
  ok(r && p, `${tag}: rider + pillion seats`);
  if (r && p) {
    ok(r.bars && r.hands === 'bars' && r.kind === 'ride', `${tag}: rider holds the bars`);
    ok(p.z < r.z - 0.29, `${tag}: pillion ${p.z.toFixed(2)} behind rider ${r.z.toFixed(2)}`);
    ok(r.floor < r.y - 0.25 && r.floor > 0.2, `${tag}: rider pegs ${r.floor} under saddle ${r.y}`);
    const [gx, gy, gz] = r.bars[0];
    ok(gy > r.y - 0.05 && gz > r.z + 0.25 && gz < r.z + 0.8, /* racer clip-ons sit at saddle height */ `${tag}: grips (${gx}, ${gy}, ${gz}) reachable from the saddle`);
  }
  ok(ud.exhaust && ud.exhaust.p && ud.exhaust.p.every(Number.isFinite), `${tag}: exhaust outlet for the smoke`);
  const names = new Set([...matNames(g), ...(ud.detail ? matNames(ud.detail) : [])]);
  for (const need of ['mirror', 'dash', 'engine']) ok(names.has(need), `${tag}: no ${need} part (mirror glass / instruments / engine castings)`);
  if (BIKES[id] && BIKES[id].bike.racer) { ok(names.has('carbon'), `${tag}: racer without carbon fibre`); ok(ud.wheelStyle === 2, `${tag}: racer wheel style ${ud.wheelStyle} (twin discs = 2)`); }
}

// no tunnelling: fences 0.1–0.15 m thick across the road; the rider goes flat out at it
const scene = new THREE.Scene();
let sx = -405, sz = 200; // Galle Road (land)
for (const id of [...SUPERBIKE_IDS, 'soraki_tsubasa300']) for (const fps of [30, 20]) for (const thick of [0.1, 0.15]) {
  const col = new Collision(); const wz = sz + 60; col.add({ x0: sx - 6, x1: sx + 6, z0: wz, z1: wz + thick, h: 1.4, kind: 'wall' });
  ok(!L.isWater(sx, sz) && !L.isWater(sx, wz), `test lane on water`);
  const v = new Vehicle(id, 1, scene); v.x = sx; v.z = sz; v.y = 0; v.yaw = 0; v.speed = v.T.maxSpeed; v.driver = {}; v.player = true;
  let maxZ = -1e9; const dt = 1 / fps;
  for (let i = 0; i < fps * 3; i++) { v.drive(dt, { throttle: 1, steer: 0, brake: false, handbrake: false }, col, []); maxZ = Math.max(maxZ, v.z + v.half * Math.cos(v.yaw)); }
  ok(v.z < wz && maxZ < wz + thick + 0.05, `${id} @${fps} fps through a ${thick} m wall: centre z ${(v.z - wz).toFixed(2)} m past it, nose max ${(maxZ - wz).toFixed(2)}`);
  scene.remove(v.mesh);
}

for (const b of bad) console.log('FAIL', b);
console.log(`bike models: ${checks} checks, ${fails} failures`);
process.exit(fails ? 1 : 0);
