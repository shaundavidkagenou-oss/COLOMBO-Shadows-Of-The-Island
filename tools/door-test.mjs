// Door test (Node): every door of every vehicle with real doors (driver, front passenger, rear pair, van slider), all colours/variants.
//  0. shut doors are baked into the body meshes; a moving door comes out onto its pivot and its triangles leave the body view
//  1. nothing of the fixed body (paint, trim, chrome, glass, decals, LOD detail kit) is left inside the closed door's volume
//     — that leftover panel is what read as a "second driver door" when the door swung open
//  2. the door skin sits on the body surface (closed door flush with the body around the opening, within a few mm)
//  3. the door swings clear of the front wing / A-pillar over its whole travel
//  4. the doorway is open (no interior trim across it) so the occupant can pass
import './node-dom-stub.mjs';
import * as THREE from 'three';
const { createVehicleMesh, VTYPES } = await import('../src/vehicles/VehicleModels.js');
const { allDoorsLive, setDoorLive, poseDoor, syncDoors } = await import('../src/vehicles/DoorRig.js');
// triangles a mesh actually draws (geometry groups when the body is a view that skips live doors)
function* tris(m) { const I = m.geometry.index, P = m.geometry.attributes.position; const n = I ? I.count : P.count; const gr = m.geometry.groups.length ? m.geometry.groups : [{ start: 0, count: n }];
  for (const q of gr) for (let t = q.start; t < q.start + q.count; t += 3) yield I ? [I.getX(t), I.getX(t + 1), I.getX(t + 2)] : [t, t + 1, t + 2]; }
function visVerts(m) { const s = new Set(); for (const t of tris(m)) for (const i of t) s.add(i); return s; }
const kinds = {}; let nDoors = 0;
let fails = 0, checks = 0; const bad = [];
const ok = (c, msg) => { checks++; if (!c) { fails++; bad.push(msg); } };
const v3 = new THREE.Vector3();
for (const type of Object.keys(VTYPES).filter((t) => !process.env.TYPES || process.env.TYPES.split(',').includes(t))) for (let seed = 1; seed <= 6; seed++) {
  const g = createVehicleMesh(type, seed); const ud = g.userData; if (!ud.door) continue;
  // 0. bake / live switching
  const bodyOf = (name) => g.children.find((m) => m.isMesh && m.name === name);
  { const P0 = bodyOf('paint'); const full = P0.geometry.index.count; ok(P0.geometry === ud.bake.shared.paint && ud.doors.every((d) => !d.live && !d.pivot.visible && !d.pivot.children.length), `${type}#${seed}: shut doors not baked`);
    const d0 = ud.doors[ud.doors.length - 1]; d0.ang = 0.3; poseDoor(d0); syncDoors(ud); const r = ud.bake.ranges.paint.doors.find((q) => q.door === d0.i); const drawn = P0.geometry.groups.reduce((a, q) => a + q.count, 0);
    ok(d0.live && d0.pivot.visible && d0.pivot.children.length > 0 && drawn === full - (r.i1 - r.i0), `${type}#${seed}: opening door ${d0.role} not taken out of the body (${drawn}/${full})`);
    const pp = d0.pivot.children.find((m) => m.name === 'paint'); ok(pp && pp.geometry.attributes.position.count === r.v1 - r.v0, `${type}#${seed}: pivot geometry != baked door`);
    d0.ang = 0; d0.vel = 0; poseDoor(d0); syncDoors(ud); ok(!d0.live && P0.geometry === ud.bake.shared.paint, `${type}#${seed}: shut door not folded back into the body`); }
  allDoorsLive(ud, true); g.updateMatrixWorld(true);
  for (const door of ud.doors) { nDoors++; kinds[door.role + (door.side > 0 ? '+' : '-')] = (kinds[door.role + (door.side > 0 ? '+' : '-')] || 0) + 1;
  const pv = door.pivot; const W = VTYPES[type].wid / 2; const s = door.side, mx = (x) => (s < 0 ? x : -x), tag = `${type}#${seed} ${door.role}${s > 0 ? '+' : '-'}`;
  const allPivots = ud.doors.map((d) => d.pivot);
  // closed door volume = bounds of the door's painted shell (model space)
  const box = new THREE.Box3(); for (const m of pv.children) if (m.material && m.geometry && (m.geometry.attributes.position)) { const gb = m.geometry.clone(); gb.applyMatrix4(m.matrixWorld); gb.computeBoundingBox(); if (m.name !== 'glass' && gb.boundingBox.max.y < 1.3) box.union(gb.boundingBox); else if (door.cab && m.name === 'paint') { const P = gb.attributes.position; for (let i = 0; i < P.count; i++) if (P.getY(i) < 1.85) box.expandByPoint(v3.fromBufferAttribute(P, i)); } } // lorry cab door: the panel below the belt (its window frame rises to the roof)
  const paintM = pv.children.find((m) => m.name === 'paint') || pv.children[0];
  const inner = box.clone(); inner.min.addScalar(0.012); inner.max.addScalar(-0.012);
  // 1. fixed surfaces inside the door volume (outboard part: between the skin and the door card)
  const fixed = []; g.traverse((o) => { if (!o.isMesh) return; let p = o; while (p) { if (allPivots.includes(p)) return; p = p.parent; } if (o.parent && o.parent.userData && o.parent.userData.spin) return; fixed.push(o); });
  // enclosed = door skin outboard of the point AND door shell (card/edge) inboard of it, along x
  const rcE = new THREE.Raycaster(); const dm = pv.children.filter((m) => m.name !== 'glass'); for (const m of dm) m.material.side = THREE.DoubleSide;
  const enclosed = (p) => { rcE.set(p, new THREE.Vector3(s, 0, 0)); rcE.far = 0.4; const out = rcE.intersectObjects(dm, false).length > 0; if (!out) return false; rcE.set(p, new THREE.Vector3(-s, 0, 0)); rcE.far = 0.2; return rcE.intersectObjects(dm, false).length > 0; };
  let inside = 0; const where = [];
  for (const m of fixed) { const P = m.geometry.attributes.position; const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    m.updateMatrixWorld(true); const mw = m.matrixWorld;
    for (const [ia, ib, ic] of tris(m)) {
      a.fromBufferAttribute(P, ia).applyMatrix4(mw); b.fromBufferAttribute(P, ib).applyMatrix4(mw); c.fromBufferAttribute(P, ic).applyMatrix4(mw);
      v3.copy(a).add(b).add(c).multiplyScalar(1 / 3); if (inner.containsPoint(v3) && new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).length() > 1e-7 && enclosed(v3)) { inside++; if (where.length < 3) where.push(`${m.name || m.parent.name}@${v3.x.toFixed(3)},${v3.y.toFixed(3)},${v3.z.toFixed(3)}`); } } }
  ok(inside === 0, `${tag}: ${inside} fixed triangles inside the closed door (${where.join(' ')})`);
  // 2. flush: the door's outermost skin points vs the body's outermost points just ahead of / behind the opening, same height
  const bodyPaint = g.children.find((m) => m.isMesh && m.name === 'paint'); const BP = bodyPaint.geometry.attributes.position; const BV = visVerts(bodyPaint);
  const dp = paintM.geometry.attributes.position; let worst = 0, n2 = 0;
  for (const yy of [0.55, 0.7, ...(door.cab ? [1.06] : []), ...(door.rects || []).filter((r) => r[2] > 0.6).map((r) => r[2] + 0.12)]) { for (const [zEdge, dir] of [[box.max.z, 1], [box.min.z, -1]]) { // + just above a notched (cab-over) opening's raised bottom
    let xb = 0, yb = yy; for (const i of BV) { const z = BP.getZ(i), y = BP.getY(i); if (Math.abs(y - yy) < 0.06 && (z - zEdge) * dir > (door.cab ? -0.001 : 0.002) && (z - zEdge) * dir < 0.08 && mx(BP.getX(i)) < xb) { xb = mx(BP.getX(i)); yb = y; } }
    // door skin at the SAME height as the body sample (outermost skin x interpolated over y): bodies with a shoulder curve
    // change x quickly with height, so comparing points up to 6 cm apart in y would report a step that is not there
    const skin = []; for (let i = 0; i < dp.count; i++) { v3.fromBufferAttribute(dp, i).applyMatrix4(paintM.matrixWorld); if (Math.abs(v3.y - yb) < (door.cab ? 1.3 : 0.1) && (zEdge - v3.z) * dir < 0.08 && (zEdge - v3.z) * dir >= 0) skin.push([v3.y, mx(v3.x)]); }
    let xd = 0; { const lo = skin.filter((p) => p[0] <= yb).sort((p, q) => q[0] - p[0] || p[1] - q[1])[0], hi = skin.filter((p) => p[0] >= yb).sort((p, q) => p[0] - q[0] || p[1] - q[1])[0];
      const outer = (yv) => Math.min(...skin.filter((p) => Math.abs(p[0] - yv) < 1e-4).map((p) => p[1]));
      if (lo && hi) { const xl = outer(lo[0]), xh = outer(hi[0]); xd = hi[0] - lo[0] > 1e-4 ? xl + (xh - xl) * (yb - lo[0]) / (hi[0] - lo[0]) : Math.min(xl, xh); } }
    if (xb < 0 && xd < 0) { worst = Math.max(worst, Math.abs(xb - xd)); n2++; } } }
  ok(n2 >= ((door.rects || []).length > 1 ? 1 : 2) && worst < 0.006, `${tag}: door skin not flush with the body (step ${(worst * 1000).toFixed(1)} mm, samples ${n2})`);
  // 3. swing clearance: no door point pushes forward into the wing (ahead of the opening, inboard of the body side)
  //    (only points that move forward of where they sit when closed and end up ahead of the opening, inside the body side)
  const closedZ = new Map(); for (const m of pv.children) { const P = m.geometry.attributes.position; const zs = new Float32Array(P.count); for (let i = 0; i < P.count; i++) zs[i] = v3.fromBufferAttribute(P, i).applyMatrix4(m.matrixWorld).z; closedZ.set(m, zs); }
  let hit = 0;
  if (!door.slide) { for (let k = 1; k <= 10; k++) { door.ang = k / 10; poseDoor(door); pv.updateMatrixWorld(true);
    for (const m of pv.children) { const P = m.geometry.attributes.position, zs = closedZ.get(m); for (let i = 0; i < P.count; i++) { v3.fromBufferAttribute(P, i).applyMatrix4(m.matrixWorld); if (v3.z > zs[i] + 0.004 && v3.z > box.max.z + 0.004 && mx(v3.x) > -W + 0.02 && v3.y < box.max.y) hit++; } } } }
  else { // sliding: once it has stepped out it runs back along the side, outboard of the body panels behind the opening
    const prof = new Map(); const key = (y, z) => Math.round(y / 0.05) + ',' + Math.round(z / 0.05); for (const i of BV) { const x = mx(BP.getX(i)); const k = key(BP.getY(i), BP.getZ(i)); if (!prof.has(k) || x < prof.get(k)) prof.set(k, x); }
    for (let k = 2; k <= 10; k++) { door.ang = k / 10; poseDoor(door); pv.updateMatrixWorld(true);
      for (const m of pv.children) { if (m.name === 'glass') continue; const P = m.geometry.attributes.position; for (let i = 0; i < P.count; i++) { v3.fromBufferAttribute(P, i).applyMatrix4(m.matrixWorld); if (v3.z > box.min.z - 0.01 || v3.y > box.max.y - 0.05 || v3.y < box.min.y + 0.05) continue; const b = prof.get(key(v3.y, v3.z)); if (b !== undefined && mx(v3.x) > b + 0.004) hit++; } } } }
  door.ang = 0; poseDoor(door); pv.updateMatrixWorld(true); ok(hit === 0, `${tag}: door travel runs into the body (${hit} points)`);
  // 4. doorway open: a 0.3 m wide passage through the opening midway, from outside to the seat, hits nothing fixed except the sill (below)
  const rc = new THREE.Raycaster(); const zc = (box.min.z + box.max.z) / 2; let blocked = 0;
  // passage from outside to the driver seat's outer edge, starting from the door's own bottom edge at this z (doors notched
  // around a wheel arch — cab-over vans — have a higher bottom edge over the wheel)
  const near = ud.seats.filter((q) => q.x * s > 0.1).sort((p, q) => Math.abs(p.z - zc) - Math.abs(q.z - zc))[0]; const edge = near ? Math.max(0.62, Math.abs(near.x) + 0.26) : 0.62;
  const rcz = (door.rects || []).find((r) => zc >= r[0] && zc <= r[1]); const yBot = rcz ? rcz[2] : box.min.y; // bottom of the opening at this z
  for (const yy of [yBot + 0.25, yBot + 0.4]) { rc.set(new THREE.Vector3(s * (W + 0.6), yy, zc), new THREE.Vector3(-s, 0, 0)); rc.far = W + 0.6 - edge; const hits = rc.intersectObjects(fixed, false).filter((h) => h.object.name !== 'glass'); if (hits.length) { blocked++; if (process.env.DBG) console.log(tag, yy.toFixed(2), zc.toFixed(2), hits.map((h) => (h.object.name || h.object.parent?.name) + '@' + h.point.x.toFixed(2)).join(' ')); } }
  ok(blocked === 0, `${tag}: doorway blocked by a fixed surface`);
  }
  allDoorsLive(ud, false);
}
console.log('doors per kind:', JSON.stringify(kinds), 'total', nDoors);
console.log(`door test: ${checks} checks, ${fails} failed`); for (const b of bad) console.log('  ' + b);
process.exit(fails ? 1 : 0);
