// Filling-station test (Node, headless).
// 1. Forecourt paths, every station × every bay × car / longest van / tuk / motorbike: smooth (turning radius within the
//    vehicle's lock), and the swept body never touches a wall, planter, pylon, island, dispenser, column, kerb pole — nor a
//    vehicle already standing at any other bay; it starts on the kerb lane and merges back onto it exactly.
// 2. Live: real Traffic + Crowd + FuelService around a station: vehicles turn in, stop at the bay, are fuelled by an
//    attendant (live nozzle out of its boot, display counting, nozzle back), pay and leave; no two vehicles overlap.
// 3. Robustness: a car knocked out of its bay mid-fuelling (nozzle falls, is picked up and hung back; bay released);
//    an attendant killed mid-service (body stays a dead crowd person, nozzle drops; the other attendant takes over).
import './node-dom-stub.mjs';
import * as THREE from 'three';
{ let ms = +(process.env.SEED || 1); Math.random = () => ((ms = (ms * 48271) % 2147483647) / 2147483647); } // seeded: a failure is reproducible (SEED=n)
globalThis.localStorage ??= { getItem: () => null, setItem: () => {}, removeItem: () => {} };
{ const { MAT } = await import('../src/gfx/Materials.js'); Object.setPrototypeOf(MAT, new Proxy({}, { get: (t, k) => { if (typeof k !== 'string') return undefined; if (!t[k]) t[k] = new THREE.MeshStandardMaterial({ vertexColors: true }); return t[k]; } })); }
const L = await import('../src/world/Layout.js');
const CP = await import('../src/world/CityPlan.js'); CP.generatePlan();
const { Collision } = await import('../src/world/Collision.js');
const { buildFuelStations, FuelService, BAYS, buildPath, fuelPoints } = await import('../src/world/FuelStations.js');
const { FS, SPOUT_TIP } = await import('../src/world/FuelStationGeo.js');
const { Traffic } = await import('../src/vehicles/Traffic.js');
const { Vehicle } = await import('../src/vehicles/Vehicle.js');
const { Crowd } = await import('../src/actors/Crowd.js');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const quick = process.argv.includes('--quick');

const col = new Collision(); col.addAll(CP.plan.colliders); const built = buildFuelStations(); col.addAll(built.colliders);
ok(built.stations.length === 4, '4 stations built'); ok(built.colliders.every((c) => [c.x0, c.x1, c.z0, c.z1, c.h].every(Number.isFinite)), 'finite colliders');
// nothing of the city plan (props, trees, walls, kiosks) left on a forecourt
for (const s of L.FUEL_SITES) { const r = s.rect; const stray = CP.plan.colliders.filter((c) => !c.fuel && c.x1 > r[0] + 0.3 && c.x0 < r[1] - 0.3 && c.z1 > r[2] + 0.3 && c.z0 < r[3] - 0.3 && c.kind !== 'building'); ok(!stray.length, `${s.id}: forecourt clear of city props (${stray.map((c) => c.kind).join(',')})`);
  const trees = CP.plan.trees.filter((t) => t.x > r[0] && t.x < r[1] && t.z > r[2] && t.z < r[3]); ok(!trees.length, `${s.id}: no tree on the lot`); }

// ---------------------------------------------------------------- 1. paths
const scene = new THREE.Scene(); const T0 = new Traffic(scene, col, { emit() {}, on() {} }); T0.max = 0;
const svc0 = new FuelService(built, { crowd: { peds: [], makePed() {}, place() {}, remove() {} }, traffic: T0, scene, player: null });
const KINDS = ['sedan', 'taurex', 'tuktuk', 'bike'];
const obb = (x, z, yaw, hw, hl) => { const c = Math.cos(yaw), s = Math.sin(yaw); return [[-hw, -hl], [hw, -hl], [hw, hl], [-hw, hl]].map(([lx, lz]) => [x + c * lx + s * lz, z - s * lx + c * lz]); };
const sat = (A, B) => { for (const P of [A, B]) for (let i = 0; i < 4; i++) { const a = P[i], b = P[(i + 1) % 4]; const nx = b[1] - a[1], nz = a[0] - b[0]; let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity; for (const q of A) { const d = q[0] * nx + q[1] * nz; a0 = Math.min(a0, d); a1 = Math.max(a1, d); } for (const q of B) { const d = q[0] * nx + q[1] * nz; b0 = Math.min(b0, d); b1 = Math.max(b1, d); } if (a1 < b0 || b1 < a0) return false; } return true; };
const boxPoly = (c) => [[c.x0, c.z0], [c.x1, c.z0], [c.x1, c.z1], [c.x0, c.z1]];
let worstR = Infinity, worstClr = Infinity;
for (const st of svc0.stations) {
  const site = st.site;
  for (const kind of KINDS) for (const bay of BAYS) for (const slotN of [0, 1]) {
    const v = new Vehicle(kind, 3, scene); const small = v.T.entry === 'tuk' || v.T.entry === 'bike'; if (bay.small && !small) { v.dispose?.(); continue; }
    // the vehicle on the kerb lane at the start of the station's line, heading along it
    const ln = { type: "line", seg: site.seg, lane: st.kerbLane, d: [site.U[0], site.U[1]] }; const u0 = (kind === "sedan" || kind === "bike") ? st.lineU0 - 4 : st.uLatest(v); // earliest (still crossing the junction) and latest turn-in points
    const [x0, z0] = site.toWorld(u0, st.wRoad); v.place(x0, z0, Math.atan2(site.U[0], site.U[1])); v.ai = { pieces: [ln], s: 0, lat: 0, hdg: 0 };
    // occupy the bay in front when testing the rear slot (worst case: the longest van)
    const others = []; if (slotN === 1) { const fr = new Vehicle('taurex', 9, scene); const fake = { v: fr, phase: 'service', uStop: 4.4 }; const [fx, fz] = site.toWorld(4.4, FS.lanes[bay.lane]); fr.place(fx, fz, Math.atan2(site.U[0], site.U[1])); st.lanes[bay.lane][0] = fake; others.push(fr); }
    const f = { st, v, bay, slotN, side: bay.side, phase: 'approach' }; const built1 = st.buildVisit(f); ok(built1, `${site.id} ${kind} ${bay.id}/${slotN}: visit path built`); if (!built1) { st.lanes[bay.lane] = [null, null]; continue; }
    // vehicles standing at every OTHER lane's bays (front + rear, longest van) — the path must clear them
    for (const ln2 of ['A', 'B', 'C']) { if (ln2 === bay.lane) continue; if (ln2 === 'C') { for (const u of [3.0, -1.6]) { const o = new Vehicle('tuktuk', 4, scene); const [ox, oz] = site.toWorld(u, FS.lanes.C); o.place(ox, oz, Math.atan2(site.U[0], site.U[1])); others.push(o); } continue; }
      for (const u of [4.4, -1.6]) { const o = new Vehicle('taurex', 4, scene); const [ox, oz] = site.toWorld(u, FS.lanes[ln2]); o.place(ox, oz, Math.atan2(site.U[0], site.U[1])); others.push(o); } }
    const rMin = small ? 2.2 : Math.max(4.3, v.T.len * 0.9); let where = '', minR = Infinity, hit = null, hitV = null, clr = Infinity;
    for (const P of [f.entry, f.exit]) {
      for (let i = 0; i < P.poly.length; i++) { if (P.kap[i] > 1e-4 && 1 / P.kap[i] < minR) { minR = 1 / P.kap[i]; where = `${P === f.entry ? 'entry' : 'exit'} u ${P.loc[i][0].toFixed(1)} w ${P.loc[i][1].toFixed(1)}`; } }
      for (let s = 0; s <= P.len; s += 0.25) { const q = evalAt(P, s); const hw = v.T.wid / 2 + 0.05, hl = v.T.len / 2 + 0.05; const B = obb(q[0], q[1], q[2], hw, hl);
        const cs = col.query(q[0] - 4, q[1] - 4, q[0] + 4, q[1] + 4);
        for (const c of cs) { const base = c.y0 || 0; if (base > v.T.hgt + 0.3) continue; if ((c.y0 !== undefined ? c.y0 + c.h : c.h) <= L.groundY(q[0], q[1]) + 0.12) continue; if (c.kind === 'deck' || c.kind === 'platform') continue; if (sat(B, boxPoly(c))) { hit = hit || `${c.kind} at s=${s.toFixed(1)} (${q[0].toFixed(1)},${q[1].toFixed(1)}) h=${c.h.toFixed(2)}`; } }
        for (const o of others) { if (P === f.exit && o === others[0] && slotN === 1) continue; /* the car in front: the rear car waits for it to leave (leader gap) */ const O = obb(o.x, o.z, o.yaw, o.T.wid / 2 + 0.15, o.T.len / 2 + 0.15); if (sat(B, O)) hitV = hitV || `${o.type} at s=${s.toFixed(1)}`; }
      }
    }
    worstR = Math.min(worstR, small ? Infinity : minR);
    ok(minR >= rMin, `${site.id} ${kind} ${bay.id}/${slotN}: tightest radius ${minR.toFixed(2)} m ≥ ${rMin.toFixed(2)} @ ${where}`);
    ok(!hit, `${site.id} ${kind} ${bay.id}/${slotN}: swept body clear of walls/kerb furniture/islands (${hit})`);
    ok(!hitV, `${site.id} ${kind} ${bay.id}/${slotN}: clear of vehicles at the other bays (${hitV})`);
    const a = f.entry.poly[0]; ok(Math.hypot(a[0] - v.x, a[1] - v.z) < 1e-6 && Math.abs(Math.atan2(Math.sin(a[2] - v.yaw), Math.cos(a[2] - v.yaw))) < 1e-6, `${site.id} ${kind}: path starts exactly at the car`);
    const e = f.exit.poly[f.exit.poly.length - 1], [eu, ew] = site.toLocal(e[0], e[1]); ok(Math.abs(ew - st.wRoad) < 1e-6 && Math.abs(Math.atan2(Math.sin(e[2] - Math.atan2(site.U[0], site.U[1])), Math.cos(e[2] - Math.atan2(site.U[0], site.U[1])))) < 1e-6 && eu < st.lineU1, `${site.id} ${kind}: exit merges onto the kerb lane, aligned, before the junction`);
    const r0 = f.rest; ok(Math.hypot(r0.p0[0] - e[0], r0.p0[1] - e[1]) < 1e-6 && r0.len > 0.5, `${site.id}: remainder line continues from the merge point`);
    // the filler faces its dispenser within hose reach
    const fp = fuelPoints(v, bay.side); const [bu, bw] = site.toLocal(...site.toWorld(f.uStop, FS.lanes[bay.lane])); const fu = bu + fp.fill[2], fw = bw + fp.fill[0]; const face = f.face; const du = face.du, dw = FS.islands[bay.island] + bay.fs * 0.26;
    ok(Math.hypot(fu - du, fw - dw) < 3.0, `${site.id} ${kind} ${bay.id}/${slotN}: filler within hose reach (${Math.hypot(fu - du, fw - dw).toFixed(2)} m)`);
    clr = Math.min(clr, Math.abs(fw - dw)); worstClr = Math.min(worstClr, clr);
    if (slotN === 1) st.lanes[bay.lane][0] = null; st.releaseBay(f); st.lanes[bay.lane] = [null, null];
    for (const o of others) { o.dispose?.(); scene.remove(o.mesh); } v.dispose?.(); scene.remove(v.mesh);
  }
}
console.log(`paths: tightest car radius ${worstR.toFixed(2)} m`);
function evalAt(P, s) { const c = P.cum, q = Math.max(0, Math.min(s, P.len)); let lo = 0, hi = c.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (c[m] <= q) lo = m; else hi = m; } const a = P.poly[lo], b = P.poly[hi], k = (q - c[lo]) / Math.max(1e-6, c[hi] - c[lo]); return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]; }

// ---------------------------------------------------------------- 2/3. live
if (!quick) for (const si of (process.env.FUEL_ST ? process.env.FUEL_ST.split(',').map(Number) : [0, 3])) {
  const sc = new THREE.Scene(); const events = { emit() {}, on() {} }; const T = new Traffic(sc, col, events); T.max = 48;
  const C = new Crowd(sc, col, events); C.max = 6; C.prepareSpecs?.(6);
  const site = L.FUEL_SITES[si]; const [fx, fz] = site.toWorld(0, 10); const focus = { x: fx, z: fz }; const player = { x: fx + 400, z: fz, vehicle: null, ch: null };
  const svc = new FuelService(built, { crowd: C, traffic: T, scene: sc, player }); const st = svc.stations[si];
  const ctx = { simTime: 0, vehicles: [], player, bodies: [], hourFactor: 1, hour: 12 }; const dt = 1 / 30; let t = 0;
  let spoutErr = 0; let overlap = null, maxDisp = 0, liveSeen = 0, nozzleSeenInCar = false, atPump = 0, orderSeq = [[], []];
  let trace = false, lastTr = '', lastKnock = 1e9;
  const tick = () => { if (trace) { const tr = st.att.map((a) => `${a.phase}${a.noz ? '[' + a.noz.mode + ']' : ''}${a.p ? '' : '(none)'}${a.gone ? 'G' : ''}`).join(' | ') + ' loose:' + st.loose.map((n) => n.mode).join(',') + ' visits:' + st.visits.map((f) => f.phase).join(','); if (tr !== lastTr) { console.log('TR', t.toFixed(1), tr); lastTr = tr; }  if (t < lastKnock + 1.2) for (const a of st.att) if (a.noz) console.log('  NZ', t.toFixed(2), a.phase, a.noz.mode, 'pos', a.noz.pos.toArray().map((q) => q.toFixed(2)).join(','), 'gP', a.noz.groundP ? a.noz.groundP.toArray().map((q) => q.toFixed(2)).join(',') : '-', 'from', a.noz.fromP.toArray().map((q) => q.toFixed(2)).join(','), 't', a.noz.t.toFixed(2), 'dur', a.noz.dur); if (Math.round(t * 30) % 30 === 0) for (const a of st.att) if (a.p && /toNozzle|toHolsterLoose/.test(a.phase)) { const [u, w] = site.toLocal(a.p.x, a.p.z); const g = a.noz && a.noz.pos; const gl = g ? site.toLocal(g.x, g.z) : [0, 0]; console.log('  POS', a.phase, 'u', u.toFixed(2), 'w', w.toFixed(2), 'noz', gl.map((q) => q.toFixed(2)).join(','), 'route', JSON.stringify((a.route || []).map(([x, z]) => site.toLocal(x, z).map((q) => +q.toFixed(2)))), 'stuck', a.stuckT.toFixed(1), 'stall', (a.stallT || 0).toFixed(1), 'state', a.p.state); } } t += dt; ctx.simTime = t; T.update(dt, focus, [0, 1], t, C.peds, null); ctx.vehicles = T.all(); C.update(dt, focus, [0, 1], ctx); svc.update(dt, { focus, night: 0 });
    // overlap between vehicles on/near this forecourt
    const vs = T.vehicles.filter((v) => { const [u, w] = site.toLocal(v.x, v.z); return Math.abs(u) < 30 && w > -site.walk - 1 && w < 30; });
    for (let i = 0; i < vs.length; i++) for (let j = i + 1; j < vs.length; j++) { const a = vs[i], b = vs[j]; if (a.free || b.free) continue; if (sat(obb(a.x, a.z, a.yaw, a.T.wid / 2 - 0.05, a.T.len / 2 - 0.05), obb(b.x, b.z, b.yaw, b.T.wid / 2 - 0.05, b.T.len / 2 - 0.05))) overlap = overlap || `${a.type}/${b.type} t=${t.toFixed(1)}`; }
    for (const a of st.att) { if (a.noz) { liveSeen++; if (a.noz.mode === 'car') nozzleSeenInCar = true; if (a.noz.mode === 'car' && a.task && a.noz.settled()) { const f = a.task, P = f.pts.fill, c = Math.cos(f.v.yaw), sn = Math.sin(f.v.yaw); const fx = f.v.x + c * P[0] + sn * P[2], fz = f.v.z - sn * P[0] + c * P[2]; const tip = SPOUT_TIP.clone().applyQuaternion(a.noz.quat).add(a.noz.pos); spoutErr = Math.max(spoutErr, Math.hypot(tip.x - fx, tip.z - fz, tip.y - ((f.v.y || 0) + P[1]))); } } if (a.phase === 'fuel') atPump++; const q = orderSeq[a.idx]; if (a.task && q[q.length - 1] !== a.phase) q.push(a.phase); }
    for (const f of st.visits) if (f.phase === 'wait' || f.phase === 'service') { const [u, w] = site.toLocal(f.v.x, f.v.z); maxDisp = Math.max(maxDisp, Math.abs(w - FS.lanes[f.bay.lane])); }
  };
  const SIM = 420; for (let i = 0; i < SIM / dt; i++) { tick(); if (process.env.FUEL_DBG && i % 300 === 0) { const rows = []; for (const v of T.vehicles) { const ai = v.ai; if (!ai) continue; const k = ai.pieces.slice(0, 3).findIndex((pc) => st.isOurLine(pc)); if (k < 0) continue; const [u, w] = site.toLocal(v.x, v.z); rows.push(`${v.type}/${v.T.entry} k${k} u${u.toFixed(0)} lat${(ai.lat || 0).toFixed(2)} hdg${(ai.hdg || 0).toFixed(2)} fl${['fuel', 'free', 'rejoin', 'chase', 'emergency', 'route', 'goal', 'stopped'].filter((q) => ai[q] || v[q]).join('+')}`); } console.log('t', t.toFixed(0), 'nextT', st.nextT.toFixed(1), 'idle', (st.idleT || 0).toFixed(0), 'hint', !!T.spawnHint, 'up', !!st.upstream, 'nveh', T.vehicles.length, rows.join(' ; ')); } }
  const S = svc.stats; console.log(`${site.id}: dispatched ${S.dispatched}, entered ${S.entered}, served ${S.served}, aborted ${S.aborted}, attendants ${st.att.filter((a) => a.p).length}`);
  ok(st.att.filter((a) => a.p && !a.dead).length === 2, `${site.id}: two attendants on duty`);
  ok(st.att.every((a) => !a.p || a.p.sp.ageYears >= 18), `${site.id}: attendants are adults`);
  ok(S.entered >= 3, `${site.id}: vehicles turn in to refuel (${S.entered})`); ok(S.served >= 2, `${site.id}: vehicles fuelled and paid (${S.served})`);
  ok(nozzleSeenInCar && atPump > 0, `${site.id}: nozzle lifted and in the filler while the pump runs`);
  ok(spoutErr < 0.06, `${site.id}: the spout tip sits in the car's filler neck while fuelling (max error ${spoutErr.toFixed(3)} m)`);
  ok(!overlap, `${site.id}: no two vehicles overlap on the forecourt (${overlap})`); ok(maxDisp < 0.35, `${site.id}: vehicles stop in their lane (max offset ${maxDisp.toFixed(2)} m)`);
  const full = /toWindow>talk>toPump>preset>lift>toFiller>insert>fuel>remove>toHolster>holster>toWindow2>pay/; const seq = orderSeq.map((q) => q.join('>')).find((q) => full.test(q)) || orderSeq.map((q) => q.join('>')).join(' || '); ok(full.test(seq), `${site.id}: full service sequence (${seq.slice(0, 220)})`);
  // ---- knock a car out of its bay while it is being fuelled
  let f = null; for (let i = 0; i < 120 / dt && !f; i++) { tick(); f = st.visits.find((q) => q.phase === 'service' && q.noz && q.noz.mode === 'car' && q.att && q.att.phase === 'fuel'); }
  ok(!!f, `${site.id}: found a car being fuelled to knock`);
  if (f) { trace = !!process.env.FUEL_TRACE; lastKnock = t - 0.1; const v = f.v, slot = f.slot; globalThis.__knocked = v; v.shove(3.2 * Math.sin(v.yaw), 3.2 * Math.cos(v.yaw), 0.4); /* the game own knock (a car or explosion hitting it) */ ok(!!v.free, `${site.id}: shove knocks the car loose`); let dropped = false; for (let i = 0; i < 3 / dt; i++) { tick(); if (st.att.some((a) => a.noz && a.noz.mode === 'ground') || st.loose.some((n) => n.mode === 'ground')) dropped = true; }
    ok(f.phase === 'out' || !st.visits.includes(f), `${site.id}: knocked car leaves the visit (phase ${f.phase})`); ok(dropped, `${site.id}: the nozzle falls out of the knocked car`);
    ok(st.lanes[f.bay.lane].every((q) => q !== f) && slot.busy !== f, `${site.id}: bay and dispenser released`);
    const k0 = [v.x, v.z]; for (let i = 0; i < 40 / dt; i++) tick(); ok(!st.att.some((a) => a.noz && a.noz.mode === 'ground') && !st.loose.length, `${site.id}: dropped nozzle picked up and hung back`);
    const kMoved = Math.hypot(v.x - k0[0], v.z - k0[1]); ok((svc.stats.replanned || 0) >= 1 && (kMoved > 4 || !T.vehicles.includes(v)), `${site.id}: the knocked car re-plans a way out and drives off the forecourt (moved ${kMoved.toFixed(1)} m, replanned ${svc.stats.replanned || 0})`); }
  // ---- kill an attendant mid-service
  let a = null; for (let i = 0; i < 300 / dt && !a; i++) { tick(); /* (customers come from passing traffic: allow for a quiet spell) */ a = st.att.find((q) => q.p && q.task && (q.phase === 'fuel' || q.phase === 'toFiller')); }
  ok(!!a, `${site.id}: found an attendant at work to kill`);
  if (a) { const p = a.p, f2 = a.task; C.kill(p); for (let i = 0; i < 2 / dt; i++) tick();
    ok(p.dead && C.peds.includes(p), `${site.id}: the attendant dies like any crowd person (body stays)`); ok(a.gone && !a.p && svc.stats.attendantsKilled >= 1, `${site.id}: station registers the dead attendant`);
    ok(!p.ch.anim.holdWR && !p.ch.anim.holdWL, `${site.id}: dead attendant lets go (no IK targets)`);
    const other = st.att.find((q) => q !== a); let taken = false; for (let i = 0; i < 40 / dt; i++) { tick(); if (f2.att === other || f2.phase === 'out' || !st.visits.includes(f2)) taken = true; }
    ok(taken, `${site.id}: the other attendant takes over (or the driver leaves)`);
    const served0 = svc.stats.served; for (let i = 0; i < 160 / dt; i++) { tick(); if (process.env.FUEL_DBG2 && i % Math.round(10 / dt) === 0) { const S2 = svc.stats; console.log(`  t+${(i * dt).toFixed(0)} visits ${st.visits.map((q) => q.phase + (q.att ? '@' + q.att.phase : '') + (q.phase === 'approach' ? `[u ${site.toLocal(q.v.x, q.v.z)[0].toFixed(1)} w ${site.toLocal(q.v.x, q.v.z)[1].toFixed(1)} uLate ${st.uLatest(q.v).toFixed(1)} spd ${q.v.speed.toFixed(1)} k ${q.v.ai.pieces.indexOf(q.line)} lat ${(q.v.ai.lat || 0).toFixed(2)} hdg ${(q.v.ai.hdg || 0).toFixed(3)} rejoin ${!!q.v.ai.rejoin} lead ${q.v.ai.lead ? 'y' : 'n'} bind ${!!q.v.ai.bodyBind} blk ${q.v.ai.bodyBlock ? `${q.v.ai.bodyBlock.type}${q.v.ai.bodyBlock.free ? '/free' : ''}${q.v.ai.bodyBlock.parked ? '/parked' : ''}${q.v.ai.bodyBlock === globalThis.__knocked ? '/KNOCKED' : ''}${q.v.ai.bodyBlock.ai ? ` spd ${q.v.ai.bodyBlock.speed.toFixed(1)} p0 ${q.v.ai.bodyBlock.ai.pieces[0].type} stuck ${(q.v.ai.bodyBlock.ai.stuck || 0).toFixed(0)} KN[u ${site.toLocal(q.v.ai.bodyBlock.x, q.v.ai.bodyBlock.z)[0].toFixed(1)} w ${site.toLocal(q.v.ai.bodyBlock.x, q.v.ai.bodyBlock.z)[1].toFixed(1)} lat ${(q.v.ai.bodyBlock.ai.lat || 0).toFixed(2)} hdg ${(q.v.ai.bodyBlock.ai.hdg || 0).toFixed(2)} s ${q.v.ai.bodyBlock.ai.s.toFixed(1)}/${q.v.ai.bodyBlock.ai.pieces[0].len.toFixed(1)} rej ${!!q.v.ai.bodyBlock.ai.rejoin} fuelvisit ${q.v.ai.bodyBlock.ai.fuel ? q.v.ai.bodyBlock.ai.fuel.phase : '-'} B2 ${q.v.ai.bodyBlock.ai.bodyBlock ? Object.keys(q.v.ai.bodyBlock.ai.bodyBlock).slice(0, 12).join('.') + ' parked ' + q.v.ai.bodyBlock.ai.bodyBlock.parked + ' u ' + site.toLocal(q.v.ai.bodyBlock.ai.bodyBlock.x, q.v.ai.bodyBlock.ai.bodyBlock.z).map((n) => n.toFixed(1)).join(',') : '-'}] blk2 ${q.v.ai.bodyBlock.ai.bodyBlock ? q.v.ai.bodyBlock.ai.bodyBlock.type + (q.v.ai.bodyBlock.ai.bodyBlock === globalThis.__knocked ? '/KNOCKED' : '') : '-'}` : ' noai'}${q.v.ai.bodyBlock.ai && q.v.ai.bodyBlock.ai.fuel ? '/fuel:' + q.v.ai.bodyBlock.ai.fuel.phase : ''}@${Math.hypot(q.v.ai.bodyBlock.x - q.v.x, q.v.ai.bodyBlock.z - q.v.z).toFixed(1)}` : '-'} stopD ${svc.stopDist(q.v, q.v.ai).toFixed(1)} p0 ${q.v.ai.pieces[0].type}${q.v.ai.pieces[0].turn ? ':' + q.v.ai.pieces[0].turn : ''} s ${q.v.ai.s.toFixed(1)}/${q.v.ai.pieces[0].len.toFixed(1)} stuck ${(q.v.ai.stuck || 0).toFixed(0)} sig ${q.v.ai.pieces[0].to && q.v.ai.pieces[0].to.signal ? 'Y' : 'n'} res ${(() => { const pc = q.v.ai.pieces[0]; const r = pc.to && T.res.get(pc.to.id); if (!r) return '-'; const h = T.vehicles.find((w) => w.id === r.id); return h ? `${h.type} age ${(t - r.t).toFixed(1)} spd ${h.speed.toFixed(1)} free ${!!h.free} p0 ${h.ai ? h.ai.pieces[0].type + ':' + (h.ai.pieces[0].turn || '') : 'noai'} stopped ${h.ai ? !!h.ai.stopped : '-'} fuel ${h.ai && h.ai.fuel ? h.ai.fuel.phase : '-'} bind ${h.ai ? !!h.ai.bodyBind : '-'} blk ${h.ai && h.ai.bodyBlock ? h.ai.bodyBlock.type + (h.ai.bodyBlock === q.v ? '=ME' : '') : '-'} rev ${h.ai ? (h.ai.reverse || 0).toFixed(1) : '-'}` : 'gone ' + (t - r.t).toFixed(1); })()}]` : '')).join(',') || '-'} | other ${other.p ? other.phase + (other.task ? '*' : '') : 'none'} | disp ${S2.dispatched} ent ${S2.entered} srv ${S2.served} abt ${S2.aborted}`); } } ok(svc.stats.served > served0, `${site.id}: the station keeps serving with one attendant`);
    ok(!st.att.find((q) => q === a).p, `${site.id}: no instant replacement while the player is near`);
    focus.x += 400; for (let i = 0; i < 2 / dt; i++) tick(); focus.x -= 400; for (let i = 0; i < 2 / dt; i++) tick(); ok(st.att.filter((q) => q.p && !q.p.dead).length === 2, `${site.id}: staffed again after the player has left and come back`); }
}
console.log(`fuel stations: ${pass + fail} checks, ${fail} failed`); process.exit(fail ? 1 : 0);
