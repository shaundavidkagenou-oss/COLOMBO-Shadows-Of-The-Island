import './nodeshim.mjs';
const L = await import('../../src/world/Layout.js');
const { CLOCK_TOWER: T } = await import('../../src/world/ClockTower.js');
const hits = []; for (let x = T.x - 3.2; x <= T.x + 3.2; x += 0.4) for (let z = T.z - 3.2; z <= T.z + 3.2; z += 0.4) { const r = L.roadAt(x, z); if (r) hits.push([x.toFixed(1), z.toFixed(1)]); }
console.log('tower footprint road cells', hits.length, hits.slice(0, 5));
const [gx0, gx1, gz0, gz1] = T.garden; let gh = 0; for (let x = gx0; x <= gx1; x += 0.5) for (let z = gz0; z <= gz1; z += 0.5) if (L.roadAt(x, z)) gh++;
console.log('garden road cells', gh);
// nearest road edge distances from the tower centre in 4 directions
for (const [dx, dz, n] of [[1, 0, 'E'], [-1, 0, 'W'], [0, 1, 'S'], [0, -1, 'N']]) { let d = 0; while (d < 60 && !L.roadAt(T.x + dx * d, T.z + dz * d)) d += 0.25; console.log(n, 'road at', d, 'm'); }
console.log('tp place', L.PLACES ? '' : '', JSON.stringify(L.LANDMARKS ? L.LANDMARKS.clockTower : null));
