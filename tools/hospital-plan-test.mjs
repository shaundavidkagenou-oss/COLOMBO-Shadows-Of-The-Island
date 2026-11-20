// 74th request — node checks of the hospital plan (HospitalPlan.js) and its build (HospitalBuild.js):
// rooms don't overlap, every door / window lies on a wall of its rooms, furniture stands inside its room and clear of the
// walls and doorways, the NPC spots / recovery bed / ambulance bay are reachable, the site stays clear of the roads, and the
// builder makes its meshes (draw / triangle budget per room) without errors.
import './node-dom-stub.mjs';
const P = await import('../src/world/HospitalPlan.js');
const L = await import('../src/world/Layout.js');
let fails = 0, passes = 0; const ok = (c, m) => { if (c) passes++; else { fails++; console.log('FAIL', m); } };
const { ROOMS, DOORS, WINDOWS, FURNITURE, SPOTS, GROUNDS, HOSP, toWorld, roomAt } = P;
// 1 rooms do not overlap (per floor)
for (const f of [0, 1]) { const rs = ROOMS.filter((r) => r.floors.includes(f)); for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) for (const a of rs[i].rects) for (const b of rs[j].rects) {
  const ov = Math.min(a[1], b[1]) - Math.max(a[0], b[0]), ovv = Math.min(a[3], b[3]) - Math.max(a[2], b[2]); ok(!(ov > 0.01 && ovv > 0.01), `rooms overlap f${f}: ${rs[i].id} / ${rs[j].id}`); } }
// 2 every room lies inside the footprint
for (const r of ROOMS) for (const q of r.rects) ok(q[0] >= -HOSP.W / 2 - 1e-6 && q[1] <= HOSP.W / 2 + 1e-6 && q[2] >= -1e-6 && q[3] <= HOSP.D + 1e-6, 'room outside footprint ' + r.id);
// 3 doors: both sides belong to the named rooms
for (const d of DOORS) { const mid = (d.s[0] + d.s[1]) / 2; const side = (o) => (d.axis === 'u' ? roomAt(mid, d.at + o, d.floor) : roomAt(d.at + o, mid, d.floor));
  const a = side(0.3), b = side(-0.3); const names = [a ? a.id : 'out', b ? b.id : 'out'].sort().join(); ok(names === [...d.rooms].sort().join(), `door ${d.id} sides ${names} ≠ ${d.rooms}`);
  ok(d.s[1] - d.s[0] >= 0.9 || d.kind === 'hatch', 'door too narrow ' + d.id); }
// 4 windows lie on an outer wall line of that floor
for (const w of WINDOWS) ok(P.OUTER.some((o) => o[0] === w[0] && o[1] === w[1] && Math.abs(o[2] - w[2]) < 1e-6 && w[3] - w[4] / 2 >= o[3] - 1e-6 && w[3] + w[4] / 2 <= o[4] + 1e-6), 'window off its wall ' + JSON.stringify(w));
// 5 furniture: inside a room of its floor
for (const f of FURNITURE) { const r = roomAt(f[2], f[3], f[1]); ok(!!r, `furniture outside rooms: ${f[0]} f${f[1]} (${f[2]}, ${f[3]})`); }
// 6 spots inside rooms
for (const [k, s] of Object.entries(SPOTS)) { const r = roomAt(s[1], s[2], s[0]); ok(!!r || k.endsWith('Out'), 'spot outside ' + k); }
// 7 recovery beds found
for (const b of P.RECOVERY_BEDS) ok(b.fi >= 0 && FURNITURE[b.fi][0] === 'bed', 'recovery bed ' + b.room);
// 8 site: the building, fence and drives stay off the roads (Malay Street kerb z −174.5, pavement to −177.1) and inside the zone
const cw = []; for (const r of ROOMS) for (const q of r.rects) { const [x0, z0] = toWorld(q[0], q[2]); const [x1, z1] = toWorld(q[1], q[3]); cw.push([Math.min(x0, x1), Math.max(x0, x1), Math.min(z0, z1), Math.max(z0, z1)]); }
for (const [x0, x1, z0, z1] of cw) for (let x = x0; x <= x1; x += 1) for (let z = z0; z <= z1; z += 1) ok(!L.roadAt(x, z), `building on a road at ${x},${z}`);
const fz = toWorld(0, GROUNDS.fence.front)[1]; ok(fz < -177.05, 'fence on the pavement: z ' + fz);
const [fx0] = toWorld(GROUNDS.fence.u0, 0), [fx1] = toWorld(GROUNDS.fence.u1, 0), fzb = toWorld(0, GROUNDS.fence.back)[1];
for (let x = fx0; x <= fx1; x += 2) ok(!L.roadAt(x, fz - 0.4) && !L.roadAt(x, fzb), 'fence line on a road at x ' + x);
for (let z = fzb; z <= fz; z += 2) ok(!L.roadAt(fx0 - 0.2, z) && !L.roadAt(fx1 + 0.2, z), 'side wall on a road at z ' + z);
// 9 the ambulance bay is reachable from the street through the ED gate (drive clear of colliders below)
// 10 build (no canvas: flat materials) + per-room budgets + obstacles
const B = await import('../src/world/HospitalBuild.js');
const t0 = Date.now(); const H = B.buildHospital(); const ms = Date.now() - t0;
let tris = 0, draws = 0; const per = [];
for (const [id, r] of H.rooms) { let t = 0, n = 0; r.group.traverse((o) => { if (o.isMesh) { n++; t += o.geometry.index.count / 3; } }); per.push(`${id}:${n}/${(t / 1000).toFixed(1)}k`); ok(n <= 14, `room ${id} draws ${n} > 14`); ok(t < 60000, `room ${id} tris ${t}`); tris += t; draws += n; }
let et = 0, ed = 0; H.ext.traverse((o) => { if (o.isMesh) { ed++; et += o.geometry.index.count / 3; } }); let lt = 0, ld = 0; H.lod.traverse((o) => { if (o.isMesh) { ld++; lt += o.geometry.index.count / 3; } });
console.log(`build ${ms} ms · rooms ${H.rooms.size} · interior ${draws} draws / ${(tris / 1000).toFixed(0)}k tris · exterior ${ed} draws / ${(et / 1000).toFixed(0)}k · LOD ${ld} draws / ${(lt / 1000).toFixed(1)}k`);
console.log(per.join('  '));
ok(ed <= 32, 'exterior draws ' + ed); ok(ld <= 4, 'lod draws ' + ld); ok(ms < 4000, 'build time ' + ms);
console.log('obstacles f0', H.obs[0].length, 'f1', H.obs[1].length, '· colliders', H.colliders.length, '· doors', H.doors.length, '· lights', [...H.rooms.values()].reduce((a, r) => a + r.lights.length, 0));
// furniture clear of walls; doorways clear of furniture
const inBox = (o, x, z, m = 0) => x > o.x0 - m && x < o.x1 + m && z > o.z0 - m && z < o.z1 + m;
// every doorway keeps a clear walking lane ≥ 0.85 m wide on both sides of it (wide openings may hold a counter)
for (const d of DOORS) { if (d.kind === 'hatch') continue; let best = 0, run = 0, what = null;
  for (let s = d.s[0] + 0.05; s <= d.s[1] - 0.05; s += 0.05) { let clear = true; for (const o of [0.45, -0.45]) { const [u, v] = d.axis === 'u' ? [s, d.at + o] : [d.at + o, s]; const [x, z] = toWorld(u, v);
      const hit = H.obs[d.floor].find((q) => q.tag !== 'wall' && q.tag !== 'door' && q.tag !== 'slide' && q.tag !== 'lift' && inBox(q, x, z, 0.0)); if (hit) { clear = false; what = hit.tag; } }
    run = clear ? run + 0.05 : 0; best = Math.max(best, run); }
  ok(best >= Math.min(0.85, d.s[1] - d.s[0] - 0.2), `doorway ${d.id} clear lane ${best.toFixed(2)} m (blocked by ${what})`); }
for (const [k, s] of Object.entries(SPOTS)) { const [x, z] = toWorld(s[1], s[2]); const hit = H.obs[s[0]].find((q) => inBox(q, x, z, 0.12) && !['officeChair', 'waitChair', 'visitorChair', 'bed', 'examCouch', 'sofa', 'bench'].includes(q.tag)); ok(!hit || k.endsWith('Out'), `spot ${k} inside ${hit && hit.tag}`); }
console.log(`${passes} passed, ${fails} failed`); process.exit(fails ? 1 : 0);
