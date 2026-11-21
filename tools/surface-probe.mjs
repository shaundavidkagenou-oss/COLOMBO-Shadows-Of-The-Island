// 76th: quick check of the footstep surface detector against the world layout (node tools/surface-probe.mjs)
const L = await import('../src/world/Layout.js');
const S = await import('../src/audio/Surface.js');
const out = {}; let n = 0;
for (let i = 0; i < 4000; i++) { const x = L.BOUNDS.minX + Math.random() * (L.BOUNDS.maxX - L.BOUNDS.minX), z = L.BOUNDS.minZ + Math.random() * (L.BOUNDS.maxZ - L.BOUNDS.minZ); if (L.isWater(x, z)) continue; const s = S.surfaceAt(x, z); out[s] = (out[s] || 0) + 1; n++; }
console.log('samples', n, out);
console.log('wet', S.wetSurface('asphalt', 0.8), S.wetSurface('grass', 0.8), S.wetSurface('wood', 0.8), S.wetSurface('asphalt', 0.1));
console.log('indoor', S.floorOf({ hospital: true }), S.floorOf({ room: { g: { userData: { floorKind: 'wood' } } } }), S.floorOf({ id: 'garage' }), S.floorOf({ room: { g: { userData: { floorKind: 'granite' } } } }));
