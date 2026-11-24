// Modelled floors (node tools/floor-kit-test.mjs): FloorKit lays real tiles / bays / boards; for every kind and a few room
// sizes it checks that the pieces cover the room (joints only), none crosses the walls, the tops sit 0.8–2.5 mm above the
// walk height (feet never sink, nothing to trip on), the chamfered solids are finite with upward tops, terrazzo gets its
// brass divider strips and timber boards have staggered butt joints. Also checks the hero rooms use it.
import './node-dom-stub.mjs';
import * as THREE from 'three';
import { readFileSync } from 'fs';
const { modelFloor } = await import('../src/world/FloorKit.js');

let checks = 0, fails = 0; const bad = [];
const ok = (c, m) => { checks++; if (!c) { fails++; if (bad.length < 30) bad.push(m); } };
const KINDS = ['ceramic', 'checker', 'redoxide', 'terrazzo', 'wood', 'granite', 'concrete'];
const ROOMS = [[-1.65, -2.05, 1.65, 2.05], [0, 0, 7, 11], [-2.2, -1.3, 2.4, 1.9]];
const m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
for (const kind of KINDS) for (const [x0, z0, x1, z1] of ROOMS) {
  const Y = 0.3; const g = modelFloor({ kind, seed: 5 }, x0, z0, x1, z1, Y); const tag = `${kind} ${(x1 - x0).toFixed(1)}×${(z1 - z0).toFixed(1)}`;
  let area = 0, n = 0, out = 0, nan = 0, yMin = 1e9, yMax = -1e9, strips = 0; const rows = new Map();
  g.traverse((o) => {
    if (!o.isInstancedMesh) return; const pos = o.geometry.attributes.position, nor = o.geometry.attributes.normal;
    for (const v of pos.array) if (!Number.isFinite(v)) nan++;
    if (o.material.metalness === 1) { strips += o.count; return; } // brass divider strips
    o.geometry.computeBoundingBox(); const bb = o.geometry.boundingBox; let up = 0; for (let i = 0; i < nor.count; i++) if (nor.getY(i) > 0.99) up++; ok(up >= 4, `${tag}: piece has no upward top face`);
    for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, m); m.decompose(p, q, s); const w = (bb.max.x - bb.min.x) * s.x, d = (bb.max.z - bb.min.z) * s.z; area += w * d; n++;
      if (p.x - w / 2 < x0 - 0.002 || p.x + w / 2 > x1 + 0.002 || p.z - d / 2 < z0 - 0.002 || p.z + d / 2 > z1 + 0.002) out++;
      const top = p.y + bb.max.y * s.y - Y; yMin = Math.min(yMin, top); yMax = Math.max(yMax, top);
      if (kind === 'wood') { const k = (x1 - x0) <= (z1 - z0) ? +p.x.toFixed(3) : +p.z.toFixed(3); const a = (x1 - x0) <= (z1 - z0) ? p.z - d / 2 : p.x - w / 2; if (!rows.has(k)) rows.set(k, []); rows.get(k).push(a); } }
  });
  const room = (x1 - x0) * (z1 - z0);
  ok(nan === 0, `${tag}: ${nan} non-finite vertices`);
  ok(n > 0 && n === g.userData.pieces, `${tag}: ${n} pieces (userData ${g.userData.pieces})`);
  ok(area / room > 0.97 && area / room <= 1.0001, `${tag}: pieces cover ${(100 * area / room).toFixed(1)} % of the floor (joints only)`);
  ok(out === 0, `${tag}: ${out} pieces cross the walls`);
  ok(yMin >= 0.0008 && yMax <= 0.0025, `${tag}: tops ${(yMin * 1000).toFixed(2)}–${(yMax * 1000).toFixed(2)} mm above the walk height`);
  if (kind === 'terrazzo') ok(strips > 0, `${tag}: no brass divider strips`);
  if (kind === 'wood') { // neighbouring rows: butt joints at least 15 cm apart (staggered, not a grid)
    const ks = [...rows.keys()].sort((a, b) => a - b); let aligned = 0, pairs = 0;
    for (let i = 1; i < ks.length; i++) { const A = rows.get(ks[i - 1]).filter((v) => v > z0 + 0.05 && v > x0 + 0.05), B = rows.get(ks[i]).filter((v) => v > z0 + 0.05 && v > x0 + 0.05);
      for (const a of A) { pairs++; if (B.some((b) => Math.abs(a - b) < 0.15)) aligned++; } }
    ok(pairs === 0 || aligned / pairs < 0.3, `${tag}: ${aligned}/${pairs} butt joints line up with the next row`);
  }
}
// cut pieces at opposite walls are equal (set out from the centre line, as a tiler does)
{ const g = modelFloor({ kind: 'ceramic', size: 0.5 }, -1.65, -2.05, 1.65, 2.05, 0); const xs = []; g.traverse((o) => { if (o.isInstancedMesh && o.material.metalness !== 1) { o.geometry.computeBoundingBox(); const bb = o.geometry.boundingBox; for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, m); m.decompose(p, q, s); xs.push([p.x, bb.max.x - bb.min.x]); } } });
  const left = xs.filter(([x]) => x < -1.4).map(([, w]) => w), right = xs.filter(([x]) => x > 1.4).map(([, w]) => w);
  ok(left.length && right.length && Math.abs(Math.max(...left) - Math.max(...right)) < 0.003, `ceramic: wall cuts ${Math.max(...left).toFixed(3)} vs ${Math.max(...right).toFixed(3)}`); }
// holes (an inlay / a stairwell): no piece overlaps the hole, the rest of the floor stays covered
for (const kind of ['ceramic', 'wood', 'terrazzo']) { const H0 = [-0.7, -0.9, 0.95, 0.6]; const g = modelFloor({ kind, seed: 9, holes: [H0] }, -2, -2.5, 2, 2.5, 0); let area = 0, over = 0;
  g.traverse((o) => { if (!o.isInstancedMesh || o.material.metalness === 1) return; o.geometry.computeBoundingBox(); const bb = o.geometry.boundingBox; for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, m); m.decompose(p, q, s); const w = (bb.max.x - bb.min.x) * s.x, d = (bb.max.z - bb.min.z) * s.z; area += w * d;
    const ox = Math.min(p.x + w / 2, H0[2]) - Math.max(p.x - w / 2, H0[0]), oz = Math.min(p.z + d / 2, H0[3]) - Math.max(p.z - d / 2, H0[1]); if (ox > 0.001 && oz > 0.001) over++; } });
  const room = 4 * 5 - (H0[2] - H0[0]) * (H0[3] - H0[1]); ok(over === 0, `${kind} hole: ${over} pieces overlap it`); ok(area / room > 0.96 && area / room < 1.0001, `${kind} hole: covers ${(100 * area / room).toFixed(1)} % of the rest`); }
// the hero rooms lay modelled floors (no flat floor plane left)
{ const src = readFileSync(new URL('../src/world/HeroRooms.js', import.meta.url), 'utf8'); ok(/modelFloor\(/.test(src), 'HeroRooms: uses modelFloor'); ok(!/k\.plane\('floor'/.test(src), "HeroRooms: flat 'floor' plane still drawn"); }

for (const b of bad) console.log('FAIL', b);
console.log(`floor kit: ${checks} checks, ${fails} failures`);
process.exit(fails ? 1 : 0);
