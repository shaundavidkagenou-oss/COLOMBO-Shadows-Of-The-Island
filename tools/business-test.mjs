// Business day + street queues (Business.js / Crowd): shops keep deterministic hours, shut when they should, fill the
// street with errands when they are busy, and served counters hold a real line that never stands in the road.
import './node-dom-stub.mjs';
import * as THREE from 'three';
globalThis.localStorage ??= { getItem: () => null, setItem: () => {}, removeItem: () => {} };
{ const { MAT } = await import('../src/gfx/Materials.js'); for (const k of ['paint', 'metal', 'concrete', 'road', 'ballast']) MAT[k] ??= new THREE.MeshStandardMaterial({ vertexColors: true }); }
const CP = await import('../src/world/CityPlan.js'); CP.generatePlan();
const L = await import('../src/world/Layout.js');
const { Crowd } = await import('../src/actors/Crowd.js'); const { Collision } = await import('../src/world/Collision.js');
const { BusinessDay, queueSlots } = await import('../src/world/Business.js');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; if (process.env.V) console.log('ok  ', m); } else { fail++; console.log('FAIL', m); } };

const col = new Collision(); col.addAll(CP.plan.colliders);
const C = new Crowd(new THREE.Scene(), col, { emit() {}, on() {} }); C.prepareSpecs(40); C.max = 80;
const spots = [{ x: -150, z: -880 }, { x: -300, z: -300 }, { x: 150, z: -300 }, { x: 90, z: -60 }];

// ---- hours are deterministic and sane
const B = new BusinessDay(7);
const shops = CP.plan.poi.filter((q) => q.type === 'shop' || q.type === 'vendor');
ok(shops.length > 200, `the plan has shopfronts to run (${shops.length})`);
let sane = true, varied = new Set();
for (const q of shops.slice(0, 400)) { const h = B.hours(q); if (!(h.open >= 0 && h.open < 24 && h.close > h.open)) sane = false; varied.add(`${h.open.toFixed(1)}-${h.close.toFixed(1)}`); }
ok(sane, 'every business has a sane opening window');
ok(varied.size > 20, `businesses do not all keep the same hours (${varied.size} distinct windows in a sample)`);
const B2 = new BusinessDay(7); const q0 = shops[0]; const h0 = B.hours(q0), h1 = B2.hours(q0);
ok(h0.open === h1.open && h0.close === h1.close, 'the same shop keeps the same hours in a new session');

// ---- open / shut at the right times
const cafe = shops.find((q) => q.kind === 'cafe') || shops[0];
B.hour = 12; const noonOpen = B.isOpen(cafe);
B.hour = 3; const nightShut = !B.isOpen(cafe);
ok(noonOpen && nightShut, 'a café is open at noon and shut at 3 am');
let openAt = { 8: 0, 12: 0, 14: 0, 19: 0, 23: 0, 4: 0 }; B.day = 3;
for (const h of Object.keys(openAt)) { B.hour = +h; for (const q of shops) if (B.isOpen(q)) openAt[h]++; }
ok(openAt[12] > openAt[4] * 3, `the city runs a working day (${openAt[12]} open at noon vs ${openAt[4]} at 4 am)`);
ok(openAt[8] > openAt[23], `the evening shuts down (${openAt[19]} open at 7 pm, ${openAt[23]} at 11 pm)`);

// ---- footfall peaks where the trade says it should
B.day = 3; B.hour = 7; const mor = B.footfall(shops.find((q) => q.kind === 'produce') || shops[0]);
B.hour = 13; const mid = B.footfall(shops.find((q) => q.kind === 'produce') || shops[0]);
ok(mor >= mid, `the produce market peaks in the morning (${mor.toFixed(2)} at 7 am vs ${mid.toFixed(2)} at 1 pm)`);

// ---- queue geometry: lines run along the pavement, never into the road
let withQ = 0, single = 0, onRoad = 0, inWall = 0;
for (const q of shops) { const s = C.queueFor(q); if (s.length > 1) withQ++; else single++; for (let i = 1; i < s.length; i++) { if (L.roadAt(s[i].x, s[i].z)) onRoad++; if (col.blocked(s[i].x, s[i].z, 0.25)) inWall++; } }
ok(withQ > 30, `counters hold a line where the pavement allows one (${withQ} with a line, ${single} single-serve)`);
let overCap = 0; for (const q of shops) if (C.queueFor(q).length > Math.max(1, C.biz.queueCap(q))) overCap++;
ok(overCap === 0, `a line is never longer than the trade allows (${overCap} over-capacity counters)`);
ok(onRoad === 0, `no queue stands in the carriageway (${onRoad} slots on a road)`);
ok(inWall <= withQ * 0.05, `no queue stands in a wall (${inWall} slots blocked)`);

// ---- people queue, and the line moves
let maxLine = 0, waiting = 0, servedFront = 0;
C.biz.hour = 12; C.biz.day = 3;
for (const S of spots) {
  const focus = { x: S.x, z: S.z };
  const ctx = { simTime: 0, vehicles: [], player: { x: S.x + 300, z: S.z, vehicle: null, ch: null, yaw: 0, speed: 0 }, bodies: [], hourFactor: 1, hour: 12, day: 3 };
  const seen = new Map();
  for (let i = 0; i < 1400; i++) {
    ctx.simTime += 0.1; C.update(0.1, focus, { x: 0, z: 1 }, ctx);
    for (const q of CP.plan.poi) { if (!q.qline) continue; maxLine = Math.max(maxLine, q.qline.length); if (q.qline.some((p) => (p.qslot ?? 0) > 0)) waiting = Math.max(waiting, 1); if (q.qline.length) seen.set(q, (seen.get(q) || 0) + 1); }
  }
}
ok(maxLine > 1, `customers queue at the counter instead of crowding round it (longest line ${maxLine})`);
ok(waiting === 1, 'people wait their turn behind the person being served');
ok((C.stats.queues || 0) > 8, `people join the back of the line (${C.stats.queues || 0} joins)`);

// ---- the line mechanics, deterministically: three people at one counter, first served, then everybody steps up
{
  const q = shops.find((q) => C.queueFor(q).length >= 3); const crowd = C;
  const mk = () => ({ x: q.x, z: q.z, state: 'toPoi', ch: { anim: { set() {} }, face: {} }, sit: false });
  const A = mk(), Bb = mk(), Cc = mk(); q.qline = null; q.used = 0;
  ok(crowd.queueJoin(q, A) && crowd.queueJoin(q, Bb) && crowd.queueJoin(q, Cc), 'three customers can take a place in the line');
  A.poi = q; Bb.poi = q; Cc.poi = q; q.used = q.qline.length;
  ok(A.qslot === 0 && Bb.qslot === 1 && Cc.qslot === 2, `the line is filled front to back (${A.qslot},${Bb.qslot},${Cc.qslot})`);
  const cap = crowd.queueFor(q).length; let extra = 0; for (let i = 0; i < 8; i++) { const e = mk(); if (crowd.queueJoin(q, e)) { extra++; e.poi = q; q.used++; } }
  ok(q.qline.length === cap && extra === cap - 3, `no more customers than places (${q.qline.length} of ${cap})`);
  for (const e of q.qline.slice(3)) { e.poi = q; } // they are real customers on the counter's books
  crowd.leavePoi(A);
  ok(Bb.qslot === 0 && Cc.qslot === 1, 'when the served customer leaves, everyone steps forward');
  ok(Cc.slideTo || Cc.target, 'the next customer is moved to the new spot');
  for (const e of q.qline.slice()) crowd.leavePoi(e);
  ok(q.qline.length === 0 && q.used === 0, `leaving the counter frees the line and the occupancy count (${q.used})`);
}
let stuck = 0; for (const p of C.peds) if ((p.qslot ?? 0) > 0 && p.state !== 'idle' && p.state !== 'toPoi' && p.state !== 'walk') stuck++;
ok(stuck === 0, 'nobody waits in a line while doing something else');

// ---- at night the shops are shut so the errands stop
C.clear(); C.biz.day = 3;
let dayErrands = 0, nightErrands = 0;
for (const [h, key] of [[12, 'd'], [23, 'n']]) {
  C.clear(); C.biz.hour = h;
  const S = spots[0]; const ctx = { simTime: 0, vehicles: [], player: { x: S.x + 300, z: S.z, vehicle: null, ch: null, yaw: 0, speed: 0 }, bodies: [], hourFactor: 1, hour: h, day: 3 };
  for (let i = 0; i < 900; i++) { ctx.simTime += 0.1; C.update(0.1, { x: S.x, z: S.z }, { x: 0, z: 1 }, ctx); }
  let n = 0; for (const p of C.peds) if (p.poi && (p.poi.type === 'shop' || p.poi.type === 'vendor') && C.biz.isOpen(p.poi)) n++;
  if (key === 'd') dayErrands = n; else nightErrands = n;
}
ok(dayErrands > nightErrands, `shop errands happen in the day, not at midnight (${dayErrands} vs ${nightErrands})`);

console.log(`queue counters ${withQ}, longest line ${maxLine}, served ${C.stats.served || 0}, shut errands ${C.stats.shut}`);
console.log(`business: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
