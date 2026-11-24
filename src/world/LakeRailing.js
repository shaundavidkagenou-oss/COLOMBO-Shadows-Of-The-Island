// 89th request — the Beira Lake promenade railing, rebuilt like the real one: a painted steel balustrade on the embankment
// coping — square posts every ~1.5 m on base plates with capped tops, a flat top rail, a second rail just under it, a bottom
// rail, and slim square balusters at 11 cm centres between them (the 79th–88th railing was a post every ~6 m and two bars).
//
//   railRuns()            the railing's line: chords of each lake ellipse 0.4 m out from the water, clipped where two ellipses
//                         meet (exactly as the coping / wall), with the Seema Malaka walkway entrance left open
//   buildRailFrame(at)    posts, rails, caps and the walkway bollards into the ground chunks' merged meshes (MultiBuilder 'lakeRailing')
//   buildLakeBalusters()  the balusters: ~12 k slim bars, so they are INSTANCED (one 16-vertex bar, a matrix each) in ~40 m arc
//                         buckets, each bucket a THREE.LOD that drops the bars beyond ~100 m (where a 16 mm bar is far below a pixel
//                         and would only shimmer). Near the lake that is 2–6 extra draw calls of a few hundred bars; elsewhere none.
//                         No shadows from the bars (thin; the rails and posts do cast).
// Collision is Layout.railPush (vehicles: Vehicle.drive / Traffic.stepFree) and Layout.beyondRailing (walkers).
import * as THREE from 'three';
import { MeshBuilder } from '../gfx/MeshBuilder.js';
import { MAT, ensureMat } from '../gfx/Materials.js';
import { LAND_Y, lakeRailRuns, seemaBollards } from './Layout.js';

export const RAIL = { postH: 1.08, postW: 0.065, postStep: 1.55, topY: 1.06, top2Y: 0.955, botY: 0.13, balW: 0.016, balStep: 0.11, col: [0.045, 0.06, 0.052] };
const COPING_Y = (e) => LAND_Y + 0.3 + e * 0.002; // the coping top under the railing (GroundBuilder: yc)

export const railRuns = lakeRailRuns;

// posts / rails / caps into the ground chunks (at(x, z) → the chunk's MultiBuilder)
export function buildRailFrame(at) {
  const R = RAIL, col = R.col, capCol = [0.06, 0.075, 0.066];
  for (const r of railRuns()) {
    const yc = COPING_Y(r.e); const mb = at((r.ax + r.bx) / 2, (r.az + r.bz) / 2).get('lakeRailing');
    const dx = r.bx - r.ax, dz = r.bz - r.az, l = Math.hypot(dx, dz), ry = -Math.atan2(dz, dx);
    // posts: at the run's start (the next run's start is this one's end), plus evenly between; and at a free end
    const np = Math.max(1, Math.round(l / R.postStep)); const posts = []; for (let i = 0; i < np; i++) posts.push(i / np); if (r.endB) posts.push(1);
    for (const t of posts) { const px = r.ax + dx * t, pz = r.az + dz * t; const w = (t === 0 && r.endA) || (t === 1 && r.endB) ? R.postW * 1.25 : R.postW;
      mb.box(px, yc + R.postH / 2, pz, w, R.postH, w, { col, rotY: ry, top: false });
      mb.box(px, yc + 0.006, pz, 0.13, 0.012, 0.13, { col, rotY: ry }); // base plate (anchor bolts read from the texture)
      mb.box(px, yc + R.postH + 0.012, pz, w + 0.022, 0.024, w + 0.022, { col: capCol, rotY: ry }); // cap plate
      pyramid(mb, px, yc + R.postH + 0.024, pz, (w + 0.012) / 2, 0.045, ry, capCol); } // pyramid finial
    // rails (a hair past each post so the joints never open on the curve)
    const L2 = l + 0.04, mx = (r.ax + r.bx) / 2, mz = (r.az + r.bz) / 2;
    mb.box(mx, yc + R.topY, mz, L2, 0.04, 0.06, { col, rotY: ry, bottom: true });
    mb.box(mx, yc + R.top2Y, mz, L2, 0.028, 0.03, { col, rotY: ry, bottom: true });
    mb.box(mx, yc + R.botY, mz, L2, 0.03, 0.035, { col, rotY: ry, bottom: true });
  }
  // the Seema Malaka walkway entrance: two steel bollards across it (closed to vehicles, open to people; solid in Layout.railPush)
  for (const [xs, z] of seemaBollards()) { const mb = at(xs, z).get('lakeRailing'); const yc = COPING_Y(2);
    mb.cylinder(xs, yc, z, 0.075, 0.075, 0.92, 12, { col: R.col }); mb.cylinder(xs, yc + 0.92, z, 0.075, 0.03, 0.05, 12, { col: R.col });
    mb.cylinder(xs, yc + 0.72, z, 0.077, 0.077, 0.07, 12, { col: [0.75, 0.74, 0.7], caps: false }); } // reflective band
}

// a square pyramid (half-width h, height ht) turned by rotY like the post under it
function pyramid(mb, x, y, z, h, ht, rotY, col) { const c = Math.cos(rotY), s = Math.sin(rotY); const P = (a, b) => [x + a * c + b * s, y, z - a * s + b * c]; const T = [x, y + ht, z];
  const C = [P(-h, h), P(h, h), P(h, -h), P(-h, -h)]; for (let i = 0; i < 4; i++) mb.quad(C[i], C[(i + 1) % 4], T, T, [0, 0, 1, 1], col); }
// the balusters: instanced, bucketed along the line, each bucket a LOD (bars → nothing beyond 110 m from the bucket centre)
export function buildLakeBalusters() {
  const R = RAIL, group = new THREE.Group(); group.name = 'lakeBalusters';
  const bh = R.top2Y - R.botY - 0.01; const mb = new MeshBuilder(); mb.box(0, 0, 0, R.balW, bh, R.balW, { col: R.col, top: false }); const geo = mb.build(); geo.translate(0, R.botY + 0.005 + bh / 2, 0);
  const mat = MAT.lakeRailing || ensureMat('lakeRailing');
  const items = []; for (const r of railRuns()) { const dx = r.bx - r.ax, dz = r.bz - r.az, l = Math.hypot(dx, dz); const n = Math.floor(l / R.balStep); if (n < 1) continue; const off = (l - (n - 1) * R.balStep) / 2; const ry = -Math.atan2(dz, dx);
    for (let i = 0; i < n; i++) { const t = (off + i * R.balStep) / l; // skip a bar that would sit inside a post
      const along = t * l, ps = l / Math.max(1, Math.round(l / R.postStep)); const dp = along % ps; if (dp < R.postW * 0.8 || ps - dp < R.postW * 0.8) continue;
      items.push([r.ax + dx * t, COPING_Y(r.e), r.az + dz * t, ry]); } }
  // bucket by position (≈40 m cells) — neighbours along the line fall in the same cell
  const B = new Map(); for (const it of items) { const k = Math.floor(it[0] / 40) + ':' + Math.floor(it[2] / 40); let a = B.get(k); if (!a) B.set(k, (a = [])); a.push(it); }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0);
  for (const a of B.values()) { let cx = 0, cz = 0; for (const it of a) { cx += it[0]; cz += it[2]; } cx /= a.length; cz /= a.length;
    const im = new THREE.InstancedMesh(geo, mat, a.length); im.name = 'lakeBalusters'; im.castShadow = false; im.receiveShadow = true;
    a.forEach((it, i) => { p.set(it[0] - cx, it[1], it[2] - cz); q.setFromAxisAngle(up, it[3]); m4.compose(p, q, s); im.setMatrixAt(i, m4); });
    im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); im.computeBoundingBox && im.computeBoundingBox();
    const lod = new THREE.LOD(); lod.position.set(cx, 0, cz); lod.addLevel(im, 0); lod.addLevel(new THREE.Object3D(), 110); lod.name = 'lakeBalusterLOD'; group.add(lod); }
  group.userData.count = items.length; group.userData.buckets = B.size;
  return group;
}
