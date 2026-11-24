// Spawn / parking acceptance test (node tools/spawn-test.mjs) on the REAL Traffic class:
//  A. the player walks / drives / looks around (focus + camera direction) for several minutes of play:
//     · no moving vehicle is ever created in view (camera cone or < 22 m) or closer than 45 m (except the 2 s fresh window
//       right after loading);
//     · no parked vehicle is built in view closer than SPOT_SEEN (145 m);
//     · no parked or moving vehicle is removed while in view (closer than 275 m);
//  B. a parked car taken by the player leaves its spot empty for 24 in-game hours, even when the player goes away and comes
//     back (fresh fill), and the spot is used again on a later day;
//  C. people come and park: an AI car / tuk / bike / van in the kerb lane of a local street picks a free spot ahead, slows,
//     follows a smooth S onto it (never off the road, never into another body, gentle steering), stops ON the spot, becomes
//     a parked vehicle there and the driver gets out calmly (handed to the crowd); the spot keeps that vehicle for the day.
import './node-dom-stub.mjs';
import * as THREE from 'three';
globalThis.localStorage ??= { getItem: () => null, setItem: () => {}, removeItem: () => {} };
{ const { MAT } = await import('../src/gfx/Materials.js'); for (const k of ['paint', 'metal', 'concrete', 'road', 'ballast']) MAT[k] ??= new THREE.MeshStandardMaterial({ vertexColors: true }); }
const L = await import('../src/world/Layout.js');
const CP = await import('../src/world/CityPlan.js'); CP.generatePlan(); const { plan } = CP; // the world generates the plan (kerb spots) once at start-up
const TR = await import('../src/vehicles/Traffic.js');
const { Traffic, linePiece, segNodes, evalPiece, SPOT_SEEN } = TR;
const { Vehicle } = await import('../src/vehicles/Vehicle.js');
const { updateDoorClosers } = await import('../src/vehicles/DoorRig.js');
const V = !!process.env.V;
// game clock for the per-frame build budgets (Traffic throttles first-time model builds by performance.now(): the test runs
// many times faster than real time, so give it the clock of a 60 fps game instead of the wall clock)
let CLOCK = 0; performance.now = () => CLOCK; const tick = (dt) => { CLOCK += dt * 1000; };
let pass = 0, fail = 0; const fails = []; const keys = new Set();
const ok = (c, m) => { if (c) pass++; else { fail++; const k = m.replace(/-?[0-9.]+/g, '#'); if (!keys.has(k) && fails.length < 40) { keys.add(k); fails.push(m); } } };
const collision = { groundAt: (x, z) => L.groundY(x, z), resolveCircle: (x, z) => ({ x, z, hit: false }), blocked: () => false, raycast: () => 1, query: () => [] };
const events = { emit() {}, on() {} };
const seenBy = (f, c, x, z) => { const dx = x - f.x, dz = z - f.z, d = Math.hypot(dx, dz); if (d < 22) return true; if (d > 330) return false; const cl = Math.hypot(c.x, c.z) || 1; return (dx * c.x + dz * c.z) / (cl * d) > 0.38; };

// ---------------------------------------------------------------- A. view rules while moving around
{
  const T = new Traffic(new THREE.Scene(), collision, events); const adopted = []; T.crowd = { adopt: (ch) => { adopted.push(ch); ch.dispose?.(); } };
  // route: Kollupitiya → north up the coast → east → spin the camera on the spot → south (km of streets, all kinds of turns)
  const legs = [{ dir: [0, -1], sp: 11, t: 40 }, { dir: [1, 0], sp: 9, t: 30 }, { spin: 1.3, t: 20 }, { dir: [0, 1], sp: 1.4, t: 30 }, { dir: [-1, 0], sp: 14, t: 30 }, { spin: -0.8, t: 15 }];
  const f = { x: -405.4, z: 314 }; let cam = { x: 0, z: -1 }, t = 0; const DT = 0.1; T.gameH = 24 + 9;
  let prevV = new Map(), prevP = new Map(); const st = { movBorn: 0, parkBorn: 0, movGone: 0, parkGone: 0, minBornD: 1e9, minParkSeenD: 1e9, parkedMax: 0, arrived: 0 };
  for (const leg of legs) for (let k = 0; k < leg.t / DT; k++) {
    if (leg.spin) { const a = Math.atan2(cam.x, cam.z) + leg.spin * DT; cam = { x: Math.sin(a), z: Math.cos(a) }; } else { f.x += leg.dir[0] * leg.sp * DT; f.z += leg.dir[1] * leg.sp * DT; cam = { x: leg.dir[0], z: leg.dir[1] }; }
    T.gameH += DT / 60; // one game hour per real minute
    T.update(DT, { x: f.x, z: f.z }, cam, t, [], null); updateDoorClosers(DT); t += DT; tick(DT);
    const fresh = t < 2.3; const nowV = new Map(), nowP = new Map();
    for (const v of T.vehicles) { nowV.set(v, true); if (!prevV.has(v) && !prevP.has(v)) { st.movBorn++; const d = Math.hypot(v.x - f.x, v.z - f.z); st.minBornD = Math.min(st.minBornD, d);
      if (!fresh) { ok(d >= 45, `moving vehicle created ${d.toFixed(1)} m from the player (t ${t.toFixed(1)})`); ok(!seenBy(f, cam, v.x, v.z), `moving vehicle created in view at ${d.toFixed(1)} m (t ${t.toFixed(1)})`); } } }
    for (const v of T.parked) { nowP.set(v, true); if (!prevP.has(v)) { if (prevV.has(v)) { st.arrived++; continue; } /* drove in and parked: it was already there */ st.parkBorn++; const d = Math.hypot(v.x - f.x, v.z - f.z); if (seenBy(f, cam, v.x, v.z)) st.minParkSeenD = Math.min(st.minParkSeenD, d);
      if (!fresh) ok(!(d < SPOT_SEEN && seenBy(f, cam, v.x, v.z)), `parked vehicle built in view at ${d.toFixed(1)} m (t ${t.toFixed(1)})`); } }
    for (const [v] of prevV) if (!nowV.has(v) && !nowP.has(v)) { st.movGone++; const d = Math.hypot(v.x - f.x, v.z - f.z); ok(!(d < 275 && seenBy(f, cam, v.x, v.z)), `moving ${v.type} removed in view at ${d.toFixed(1)} m (t ${t.toFixed(1)})`); }
    for (const [v] of prevP) if (!nowP.has(v) && !nowV.has(v)) { st.parkGone++; const d = Math.hypot(v.x - f.x, v.z - f.z); ok(!(d < 275 && seenBy(f, cam, v.x, v.z)), `parked ${v.type} removed in view at ${d.toFixed(1)} m (t ${t.toFixed(1)})`); }
    st.parkedMax = Math.max(st.parkedMax, T.parked.length); prevV = nowV; prevP = nowP;
  }
  ok(st.movBorn > 20, `traffic keeps spawning out of view (${st.movBorn} vehicles)`); ok(st.parkBorn > 20, `parked vehicles still fill the streets (${st.parkBorn} built, up to ${st.parkedMax} at once)`);
  console.log(`A  ${t.toFixed(0)} s: moving born ${st.movBorn} (nearest ${st.minBornD.toFixed(0)} m) gone ${st.movGone}; parked built ${st.parkBorn} (nearest in-cone ${st.minParkSeenD.toFixed(0)} m) gone ${st.parkGone}; drove in & parked ${st.arrived} (${JSON.stringify(T.parkStats || {})}), ${adopted.length} people got out`);
  for (const v of [...T.vehicles, ...T.parked]) v.dispose?.();
}

// ---------------------------------------------------------------- B. a vacated spot stays empty for a day
{
  const T = new Traffic(new THREE.Scene(), collision, events); T.crowd = { adopt: (ch) => ch.dispose?.() }; T.max = 0;
  const f0 = { x: -337.3, z: 406 }; const cam = { x: 0, z: 1 }; T.gameH = 48 + 10; let t = 0; const run = (sec, f, c = cam) => { for (let k = 0; k < sec / 0.1; k++) { T.update(0.1, f, c, t, [], null); t += 0.1; tick(0.1); } };
  run(6, f0); const v = T.parked.slice().sort((a, b) => Math.hypot(a.x - f0.x, a.z - f0.z) - Math.hypot(b.x - f0.x, b.z - f0.z))[0];
  ok(!!v && !!v.spot, `a parked vehicle near the player to take (${T.parked.length} parked)`);
  if (v && v.spot) { const spot = v.spot; T.takeOver(v); v.place(spot.x + 400, spot.z, 0); // the player drives it away
    const empty = (why) => ok(!T.parkedSet.has(spot) && !T.parked.some((o) => o.spot === spot), `vacated spot stays empty: ${why}`);
    run(3, f0); empty('right away, player standing there');
    run(3, { x: f0.x, z: f0.z }, { x: 0, z: -1 }); empty('player looks away');
    T.gameH += 6; run(3, { x: f0.x + 600, z: f0.z }); run(3, f0); empty('6 game hours later, after going away and coming back (fresh fill)');
    T.gameH += 17; run(3, { x: f0.x + 600, z: f0.z }); run(3, f0); empty('23 game hours later');
    T.gameH += 1.5; run(3, { x: f0.x + 600, z: f0.z }); const st = T.spots.get(spot); ok(st && st.until <= T.gameH, `after 24 game hours the spot is free to be used again (until ${st && st.until.toFixed(1)}, now ${T.gameH.toFixed(1)})`);
    // on a later day the spot follows the normal daily occupancy again: over 10 days it gets a vehicle at least once
    let used = 0; for (let d = 0; d < 10; d++) { T.gameH += 24; run(1, { x: f0.x + 600, z: f0.z }); run(3, f0); if (T.parkedSet.has(spot)) used++; }
    ok(used > 0, `the spot is used again on later days (${used}/10 days)`); console.log(`B  vacated spot (${spot.x.toFixed(1)}, ${spot.z.toFixed(1)}): empty for 24 h, used again on ${used}/10 later days`); }
  for (const o of [...T.vehicles, ...T.parked]) o.dispose?.();
}

// ---------------------------------------------------------------- C. people drive in and park
{
  const corners = (x, z, yaw, hl, hw) => { const fx = Math.sin(yaw), fz = Math.cos(yaw); return [[1, 1], [1, -1], [-1, -1], [-1, 1]].map(([l, w]) => [x + fx * hl * l + fz * hw * w, z + fz * hl * l - fx * hw * w]); };
  const overlap = (A, B) => { const ca = corners(A.x, A.z, A.yaw, A.T.len / 2, A.T.wid / 2), cb = corners(B.x, B.z, B.yaw, B.T.len / 2, B.T.wid / 2);
    for (const poly of [ca, cb]) for (let i = 0; i < 4; i++) { const [x0, z0] = poly[i], [x1, z1] = poly[(i + 1) % 4]; const nx = z1 - z0, nz = x0 - x1; const pa = ca.map(([x, z]) => x * nx + z * nz), pb = cb.map(([x, z]) => x * nx + z * nz); if (Math.max(...pa) < Math.min(...pb) - 0.02 || Math.max(...pb) < Math.min(...pa) - 0.02) return false; } return true; };
  // local street segments that have kerb spots on at least one side
  const bySeg = new Map(); for (const p of plan.parking) { if (!bySeg.has(p.seg)) bySeg.set(p.seg, []); bySeg.get(p.seg).push(p); }
  const types = ['car', 'tuktuk', 'bike', 'van', 'sedan', 'car', 'tuktuk', 'bike']; const cases = []; const T0 = new Traffic(new THREE.Scene(), collision, events);
  for (const seg of T0.flowSegs) { if (seg.level < 1 || seg.level > 2 || seg.crossing || !bySeg.has(seg.id)) continue; const [a, b] = segNodes(seg);
    for (const [from, to] of [[a, b], [b, a]]) { const P = linePiece(seg, from, to, seg.level <= 1 ? 1 : 0); const nx = P.d[1], nz = -P.d[0];
      const mine = bySeg.get(seg.id).filter((p) => (p.x - from.x) * nx + (p.z - from.z) * nz > 0).map((p) => [(p.x - P.p0[0]) * P.d[0] + (p.z - P.p0[1]) * P.d[1], p]).filter(([al]) => al > 30 && al < P.len - 4);
      if (mine.length) cases.push({ seg, from, to, P, spots: mine }); } }
  for (const v of T0.vehicles) v.dispose?.();
  const pickN = Math.min(16, cases.length); const res = []; let parkedOK = 0;
  for (let ci = 0; ci < pickN; ci++) {
    const c = cases[Math.floor((ci * cases.length) / pickN)]; const type = types[ci % types.length];
    const T = new Traffic(new THREE.Scene(), collision, events); T.max = 0; const adopted = []; T.crowd = { adopt: (ch, x, z, yaw, why) => adopted.push({ ch, x, z, why }) };
    T.gameH = 24 * 3 + 11; const today = 3;
    // every spot on this kerb is free today; a parked car on the spot BEYOND the target and one 15 m behind the kerb gap (for the body checks)
    const [al0, target] = c.spots[0]; for (const [, p] of c.spots) T.spots = T.spots || new Map(); for (const p of plan.parking) if (p.seg === c.seg.id) T.spots.set(p, { day: today, occ: false, until: -1 });
    const P = c.P; const s0 = Math.max(1, al0 - 28 - (ci % 3) * 8); const ln = { piece: P, s: s0, seg: c.seg };
    const v = new Vehicle(type, 100 + ci, T.scene); T.adoptAI(v, ln, { v0: 9 }); v.speed = 7; T.addDriver(v);
    const f = { x: target.x - P.d[0] * 10 + P.d[1] * 9, z: target.z - P.d[1] * 10 - P.d[0] * 9 }; const cam = { x: -P.d[0], z: -P.d[1] }; // a pedestrian across the street, looking back up the road
    let lastSp = 9, decAt = '', t = 0, started = false, done = false, maxYawRate = 0, maxOff = -9, prevYaw = v.yaw, maxDecel = 0, prevSp = v.speed, touched = false, minSp = 9;
    const hw = c.seg.hw; const segC = (x, z) => { const [a] = segNodes(c.seg); return Math.abs(c.seg.dir === 'h' ? z - a.z : x - a.x); };
    for (let k = 0; k < 60 * 30 && !done; k++) { const DT = 1 / 30; if (!started) T.arriveT = 0; T.update(DT, f, cam, t, [], null); updateDoorClosers(DT); t += DT; tick(DT);
      if (v.ai && v.ai.park) started = true; if (!started && k > 60) break;
      if (started && T.vehicles.includes(v)) { const yr = Math.abs(Math.atan2(Math.sin(v.yaw - prevYaw), Math.cos(v.yaw - prevYaw))) / DT; maxYawRate = Math.max(maxYawRate, yr); { const dc = (prevSp - v.speed) / DT; if (dc > maxDecel) { maxDecel = dc; decAt = `${prevSp.toFixed(2)}→${v.speed.toFixed(2)} on ${v.ai.pieces[0].type}${v.ai.pieces[0].park ? '(park)' : ''} rem ${(v.ai.pieces[0].len - v.ai.s).toFixed(2)} t ${t.toFixed(2)} bodyG ${(v.ai.bodyG ?? -1).toFixed?.(2)} blk ${v.ai.bodyBlock ? v.ai.bodyBlock.type + (v.ai.bodyBlock.parked ? "(p)" : "") + " " + Math.hypot(v.ai.bodyBlock.x - v.x, v.ai.bodyBlock.z - v.z).toFixed(1) : "-"} bumped ${v.ai.bumped}`; } }
        const edge = segC(v.x, v.z) + Math.abs(Math.sin(v.yaw - Math.atan2(P.d[0], P.d[1]))) * v.T.len / 2 + v.T.wid / 2; maxOff = Math.max(maxOff, edge - hw); minSp = Math.min(minSp, v.speed); }
      if (started && T.vehicles.includes(v)) lastSp = v.speed; prevYaw = v.yaw; prevSp = v.speed; for (const o of T.parked) if (o !== v && overlap(v, o)) touched = true;
      if (v.parked && !(v.disembarking && v.disembarking.length)) done = true; }
    const spot = v.spot; const st = spot && T.spots.get(spot); const tag = `${type} on ${c.seg.name || c.seg.id} L${c.seg.level}`;
    ok(started, `${tag}: the driver picks a free kerb spot ahead`);
    if (started) { ok(v.parked && !!spot && T.parked.includes(v) && !T.vehicles.includes(v), `${tag}: ends up parked on a spot (${t.toFixed(1)} s)`);
      if (spot) { const e = Math.hypot(v.x - spot.x, v.z - spot.z), ey = Math.abs(Math.atan2(Math.sin(v.yaw - spot.yaw), Math.cos(v.yaw - spot.yaw))); ok(e < 0.06 && ey < 0.03, `${tag}: stops ON the spot (${e.toFixed(2)} m, ${(ey * 57.3).toFixed(1)}°)`);
        ok(st && st.occ && st.look && st.look.type === type && !st.claim, `${tag}: the spot keeps this vehicle for the day`); }
      ok(maxOff < 0.05, `${tag}: body stays on the road while pulling in (edge ${maxOff.toFixed(2)} m past the kerb line)`);
      ok(maxYawRate < 0.55, `${tag}: gentle steering into the spot (peak ${maxYawRate.toFixed(2)} rad/s)`); ok(maxDecel < 4.5, `${tag}: no emergency stop (peak ${maxDecel.toFixed(1)} m/s²)`);
      ok(!touched, `${tag}: never touches another parked body`);
      ok(lastSp < 0.2, `${tag}: rolls to a stop on the spot (last moving speed ${lastSp.toFixed(2)} m/s)`);
      ok(adopted.length >= 1 && adopted.every((a) => a.why === 'calm'), `${tag}: the driver gets out calmly and walks off (${adopted.length} out, ${adopted.map((a) => a.why).join(',')})`);
      ok(!v.driverChar && T.paxCount === 0 && !T.leaving.includes(v), `${tag}: no one left inside, bookkeeping cleared`);
      if (v.parked && spot) parkedOK++; }
    res.push(`${tag.padEnd(34)} ${started ? (v.parked ? 'parked' : 'NOT parked') : 'no spot'}  ${t.toFixed(1)} s  yaw-rate ${maxYawRate.toFixed(2)}  decel ${maxDecel.toFixed(1)}  edge ${maxOff.toFixed(2)}  out ${adopted.length}  [${decAt}]`);
    for (const a of adopted) a.ch.dispose?.(); for (const o of [...T.vehicles, ...T.parked]) o.dispose?.();
  }
  ok(parkedOK >= pickN - 1, `cars park in most cases (${parkedOK}/${pickN})`);
  if (V) for (const r of res) console.log('   ', r); console.log(`C  ${parkedOK}/${pickN} drove in and parked (${cases.length} kerbs available)`);
}
console.log(`spawn-test: ${pass} passed, ${fail} failed`); for (const m of fails) console.log('  FAIL', m);
process.exit(fail ? 1 : 0);
