import './nodeshim.mjs';
const { buildStreetRamps, HUMPS } = await import('../../src/world/StreetRamps.js');
const sr = buildStreetRamps(); let signMeshes = 0; sr.group.traverse((o) => { if (o.isMesh && /sign/i.test(o.name + (o.material && o.material.name || ''))) signMeshes++; });
console.log('humps', HUMPS.length, 'sign colliders', sr.colliders.length, 'per hump', HUMPS.map((h) => (h.signs || []).length).join(','), 'colliders ok', sr.colliders.every((c) => c.h > 2 && c.x1 > c.x0 && c.z1 > c.z0));
