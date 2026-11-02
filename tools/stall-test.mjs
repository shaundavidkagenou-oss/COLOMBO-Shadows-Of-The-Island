// Street stall test (Node, headless): ten distinct modelled stall types, each inside the stall collider footprint
// (2.2 x 1.24 m, canopy may overhang a little above head height), sitting on the ground, within a vertex budget,
// and neighbouring stalls never share a type.
import './node-dom-stub.mjs';
import * as THREE from 'three';
const S = await import('../src/world/Stalls.js');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const types = S.buildStallGeometries(new THREE.MeshStandardMaterial());
ok(types.length === 10 && S.STALL_TYPES === 10, 'ten stall types');
const sigs = new Set();
types.forEach((parts, t) => {
  const body = parts[0].geo; ok(!!body, `type ${t} has a body`); if (!body) return; body.computeBoundingBox(); const b = body.boundingBox;
  ok(b.min.x > -1.2 && b.max.x < 1.2 && b.min.z > -0.72 && b.max.z < 0.72, `type ${t} body inside the footprint (${b.min.x.toFixed(2)}..${b.max.x.toFixed(2)}, ${b.min.z.toFixed(2)}..${b.max.z.toFixed(2)})`);
  ok(b.min.y > -0.01, `type ${t} does not sink into the pavement (${b.min.y.toFixed(3)})`); ok(b.max.y < 2.7, `type ${t} height (${b.max.y.toFixed(2)})`);
  let v = 0; for (const p of parts) if (p.geo) { v += p.geo.attributes.position.count; ok(!Number.isNaN(p.geo.boundingSphere.radius), `type ${t} finite geometry`); }
  ok(v < 16000, `type ${t} vertex budget (${v})`);
  const c = parts.find((p) => p.mat && p.mat !== parts[0].mat && !p.noShadow); ok(!!c, `type ${t} has a canopy`);
  if (c) { c.geo.computeBoundingBox(); ok(c.geo.boundingBox.min.y > 1.7, `type ${t} canopy is above head height (${c.geo.boundingBox.min.y.toFixed(2)})`); }
  sigs.add(`${v}|${b.max.y.toFixed(2)}`);
});
ok(sigs.size === 10, 'every type is a different model');
for (let salt = 0; salt < 10; salt++) for (let i = 0; i < 60; i++) ok(S.stallType(i, salt) !== S.stallType(i + 1, salt) && S.stallType(i, salt) !== S.stallType(i + 2, salt), 'neighbours differ');
const seen = new Set(); for (let i = 0; i < 10; i++) seen.add(S.stallType(i, 3)); ok(seen.size === 10, 'every type is used');
console.log(`stall-test: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
