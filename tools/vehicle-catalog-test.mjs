// Vehicle catalogue test (Node): the 40 Sri Lankan street vehicles (10 SUVs + 30 others) sold under fictional makes.
// 1. no real manufacturer / model name anywhere in the catalogue + style sources (strings AND comments)
// 2. every model builds in 4 variants, dimensions match the spec, triangle budget is respected
// 3. seating: seat count matches, one right-hand driver seat with a steering wheel, every occupant sits inside the
//    cabin width, rear-row knees clear the front seat backs, exits are outside the body
// 4. the models are actually reachable in game: traffic / parked weights, display names, brand emblems
import './node-dom-stub.mjs';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
const { createVehicleMesh, VTYPES } = await import('../src/vehicles/VehicleModels.js');
const { CATALOG, BRANDS, SUV_IDS, OTHER_IDS, TRAFFIC_W, PARKED_W, displayName } = await import('../src/vehicles/VehicleCatalog.js');
const { makeSkeleton } = await import('../src/actors/Character.js');
const { applySeatPose, seatLocal } = await import('../src/actors/Seating.js');
let fails = 0, checks = 0; const bad = [];
const ok = (c, msg) => { checks++; if (!c) { fails++; bad.push(msg); } };

// ---------------------------------------------------------------- 1. fictional names only
const REAL = ['toyota', 'nissan', 'honda', 'suzuki', 'mitsubishi', 'mazda', 'isuzu', 'mahindra', 'tata', 'hyundai', 'kia', 'bmw', 'mercedes', 'benz', 'audi\\b', 'perodua', 'proton', 'ford', 'land ?rover', 'defender', 'prado', 'land ?cruiser', 'montero', 'pajero', 'hilux', 'navara', 'vitz', 'aqua', 'prius', 'axio', 'premio', 'allion', 'alto', 'wagon ?r\\b', 'swift', 'hijet', 'dayz', 'vezel', 'civic', 'x-trail', 'hiace', 'bolero', 'scorpio', 'nano', 'batta', 'canter', 'dyna', 'kwid', 'bezza', 'axia', 'myvi', 'celerio', 'raize', 'rav4', 'harrier', 'outlander', 'fortuner', 'sportage', 'tucson', 'd-max', 'triton', 'jimny', 'gypsy', 'thar', 'corolla', 'revo', 'dolphin', 'morris', 'daihatsu', 'maruti', 'ignis', 'voxy', 'dimo', 'camry', 'lancer', 'subaru', 'chevrolet', 'peugeot', 'renault', 'volkswagen', 'skoda', 'byd', 'chery', 'lexus', 'datsun', 'opel', 'volvo', 'jeep', 'leyland', 'ashok', 'eicher', 'bajaj', 'piaggio'];
const realRx = new RegExp('\\b(' + REAL.join('|') + ')', 'i');
for (const f of ['src/vehicles/VehicleCatalog.js', 'src/vehicles/VehicleStyle.js']) {
  readFileSync(new URL('../' + f, import.meta.url), 'utf8').split('\n').forEach((line, i) => { const m = line.match(realRx); ok(!m, `${f}:${i + 1} real name "${m && m[0]}"`); });
}
for (const [id, b] of Object.entries(BRANDS)) ok(!realRx.test(b.name) && !realRx.test(id), `brand ${b.name} is a real name`);
for (const [id, T] of Object.entries(CATALOG)) { ok(!realRx.test(T.model) && !realRx.test(displayName(id, T)) && !realRx.test(T.ref || ''), `${id}: real name in model/ref`); ok(BRANDS[T.make], `${id}: unknown make ${T.make}`); }

// ---------------------------------------------------------------- 2. builds, dimensions, budget
ok(SUV_IDS.length === 10, `expected 10 SUVs, got ${SUV_IDS.length}`); ok(OTHER_IDS.length === 30, `expected 30 other vehicles, got ${OTHER_IDS.length}`);
ok(new Set([...SUV_IDS, ...OTHER_IDS]).size === 40 && Object.keys(CATALOG).length === 40, 'catalogue ids are not 40 unique models');
for (const id of SUV_IDS) ok(CATALOG[id].family === 'suv', `${id} listed as SUV but family ${CATALOG[id].family}`);
const tri = (o) => (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
const P = (b, n) => new THREE.Vector3().setFromMatrixPosition(b[n].matrixWorld);
for (const id of Object.keys(CATALOG)) {
  const T = VTYPES[id]; ok(T === CATALOG[id], `${id} not registered in VTYPES`);
  if (T.body) ok(Math.abs(T.body.top[0][0] * 2 - T.len) < 0.06, `${id}: body length ${(T.body.top[0][0] * 2).toFixed(2)} vs spec ${T.len}`);
  for (let v = 0; v < 4; v++) {
    let g; try { g = createVehicleMesh(id, v); } catch (e) { ok(false, `${id}/v${v} build error ${e.message}`); continue; }
    g.updateMatrixWorld(true); const bb = new THREE.Box3(), bbH = new THREE.Box3(); let n = 0, nanV = 0;
    g.traverse((o) => { if (!o.isMesh) return; n += tri(o); const pa = o.geometry.attributes.position.array; for (let i = 0; i < pa.length; i++) if (!Number.isFinite(pa[i])) { nanV++; break; } if (o.name === 'paint' && o.parent === g) { const v3 = new THREE.Vector3(); for (let i = 0; i < pa.length; i += 3) { v3.set(pa[i], pa[i + 1], pa[i + 2]).applyMatrix4(o.matrixWorld); if (v3.y > 0.3 && v3.y < 0.75) bb.expandByPoint(v3); else bbH.expandByPoint(v3); } } });
    ok(nanV === 0, `${id}/v${v}: NaN vertices`); ok(n < 48000, `${id}/v${v}: ${Math.round(n)} triangles (budget 48k)`);
    if (v === 0) {
      const sz = bb.getSize(new THREE.Vector3()); bbH.union(bb); const szA = bbH.getSize(new THREE.Vector3());
      if (!bb.isEmpty()) { ok(szA.z > T.len - 0.1 && szA.z < T.len + 0.4, `${id}: painted length ${szA.z.toFixed(2)} vs ${T.len}`); if (T.truck) ok(T.truck.cabW * 2 <= T.wid + 0.01 && T.truck.deckW * 2 <= T.wid + 0.01, `${id}: cab/deck wider than spec`); else ok(sz.x > T.wid - 0.12 && sz.x < T.wid + 0.1, `${id}: painted width ${sz.x.toFixed(2)} vs ${T.wid}`); ok(bbH.max.y < T.hgt + 0.12 && bbH.max.y > T.hgt - 0.25, `${id}: painted height ${bbH.max.y.toFixed(2)} vs ${T.hgt}`); }
      // ------------------------------------------------------------ 3. seating
      const seats = g.userData.seats; ok(seats.length === T.seats, `${id}: ${seats.length} seats vs spec ${T.seats}`);
      const drv = seats.filter((s) => s.driver); ok(drv.length === 1 && drv[0].wheel && drv[0].x < 0, `${id}: needs exactly one right-hand (−x) driver seat with a wheel`);
      const innerHalf = T.wid / 2 - 0.1; const zFront = Math.max(...seats.map((s) => s.z));
      for (const [si, s] of seats.entries()) {
        ok(Math.abs(s.x) + 0.2 <= innerHalf + 0.001, `${id} seat${si}: x ${s.x.toFixed(2)} too close to the side (inner half-width ${innerHalf.toFixed(2)})`);
        ok(s.y > s.floor + 0.08 && s.roof > s.y + 0.75, `${id} seat${si}: cushion/floor/roof heights implausible`);
        ok(Math.abs(s.exit[0]) > T.wid / 2 + 0.2 || Math.abs(s.exit[1]) > T.len / 2, `${id} seat${si}: exit point inside the body`);
        ok(Math.abs(s.z) < T.len / 2 - 0.3, `${id} seat${si}: seat outside the cabin length`);
        if (s.z < zFront - 0.3) { // rear-row occupant: a tall adult's knees must clear the front seat back (cushion z − 0.30)
          const height = 1.88, sp = { sex: 'm', height, build: 1.08 }; const { bones } = makeSkeleton(sp, 'kt' + si); const b = Object.fromEntries(bones.map((x) => [x.name, x]));
          const root = new THREE.Group(); const mesh = new THREE.Group(); root.add(mesh); mesh.add(bones[0]); root.position.set(s.x, s.y, s.z);
          const k = height / 1.72; applySeatPose({ ch: { bones: b, root, spec: sp }, s: k, ankle: 0.085 * k, seatW: 1, seatL: seatLocal(s), t: 0, seed: 0.3, vehSpeed: 0, seatLookT: 9, steer: 0 }, 0.016); root.updateMatrixWorld(true);
          const ahead = seats.filter((o) => o.z > s.z + 0.3).reduce((m, o) => Math.min(m, o.z), 99);
          for (const kn of ['shinL', 'shinR']) ok(P(b, kn).z + 0.06 < ahead - 0.3, `${id} seat${si}: knee z ${(P(b, kn).z + 0.06).toFixed(2)} hits the seat back at ${(ahead - 0.3).toFixed(2)}`);
        }
      }
    }
  }
}
// ---------------------------------------------------------------- 4. reachable in game
const allW = new Set([...Object.keys(TRAFFIC_W.default), ...Object.keys(TRAFFIC_W.port || {}), ...Object.keys(TRAFFIC_W.cinnamon || {}), ...Object.keys(PARKED_W)]);
for (const id of Object.keys(CATALOG)) ok(allW.has(id), `${id}: never spawns (missing from traffic / parked weights)`);
for (const id of Object.keys({ ...TRAFFIC_W.default, ...PARKED_W })) ok(CATALOG[id], `weight for unknown model ${id}`);
console.log(bad.slice(0, 60).join('\n'));
console.log(`vehicle catalogue: ${Object.keys(CATALOG).length} models (${SUV_IDS.length} SUVs), ${checks} checks, ${fails} failures`);
process.exit(fails ? 1 : 0);
