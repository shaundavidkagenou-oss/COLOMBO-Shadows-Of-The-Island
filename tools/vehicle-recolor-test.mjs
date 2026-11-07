// Vehicle look cache test (Node, headless): every vehicle type × body variant × paint colour, built the fast way (one probe
// build per type + variant, recoloured per paint colour) must be identical to a direct build with that colour — same
// buckets, positions, normals, UVs, indices, metadata (wheels, seats, doors) and vertex colours.
// Run: node tools/vehicle-recolor-test.mjs
import './node-dom-stub.mjs';
import * as THREE from 'three';
globalThis.localStorage ??= { getItem: () => null, setItem: () => {}, removeItem: () => {} };
{ const { MAT } = await import('../src/gfx/Materials.js'); Object.setPrototypeOf(MAT, new Proxy({}, { get: (t, k) => { if (typeof k !== 'string') return undefined; if (!t[k]) t[k] = new THREE.MeshStandardMaterial({ vertexColors: true }); return t[k]; } })); }
const VM = await import('../src/vehicles/VehicleModels.js');
const { RNG } = await import('../src/core/rng.js');
let fails = 0, looks = 0; const bad = [];
const same = (a, b, eps) => { if (!a && !b) return true; if (!a || !b || a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > eps) return false; return true; };
const meta = (m) => JSON.stringify({ wheels: m.wheels, seats: m.seats, steerWheel: m.steerWheel, doors: m.doors, wheelStyle: m.wheelStyle, busDoor: m.busDoor });
// find a seed that yields each colour + variant, so the real cache path (ensureModel via createVehicleMesh) is exercised
const seedFor = (type, color, variant) => { const T = VM.VTYPES[type]; for (let s = 1; s < 200000; s++) { const r = new RNG(s); if (r.pick(T.colors) === color && r.int(0, 3) === variant) return s; } return -1; };
const t0 = performance.now(); let tFast = 0, tDirect = 0;
for (const type of Object.keys(VM.VTYPES)) for (let variant = 0; variant < 4; variant++) for (const color of VM.VTYPES[type].colors) {
  looks++; const seed = seedFor(type, color, variant); if (seed < 0) { bad.push(`${type}/${color}/${variant}: no seed`); fails++; continue; }
  let a = performance.now(); const g = VM.createVehicleMesh(type, seed); tFast += performance.now() - a;
  a = performance.now(); const D = VM.directModel(type, color, variant); tDirect += performance.now() - a;
  const worn = g.userData && false; // dirt is applied after either path, compare the clean geometry
  const fastGeos = []; g.traverse((o) => { if (o.isMesh && o.parent === g && !o.userData.wheel) fastGeos.push([o.name, o.geometry]); });
  const det = g.getObjectByName('detail'); const fastD = det ? det.children.map((o) => [o.name, o.geometry]) : [];
  const cmp = (A, B, tag) => { const names = (x) => x.map((q) => q[0]).join(','); const Bf = B.filter((q) => A.some((p) => p[0] === q[0]));
    if (names(A.filter((q) => B.some((p) => p[0] === q[0]))) !== names(Bf)) return `${tag} bucket order`;
    for (const [n, ga] of A) { const e = B.find((q) => q[0] === n); if (!e) continue; const gb = e[1];
      for (const at of ['position', 'normal', 'uv']) if (!same(ga.attributes[at]?.array, gb.attributes[at]?.array, 0)) return `${tag}.${n}.${at}`;
      if (!same(ga.index?.array, gb.index?.array, 0)) return `${tag}.${n}.index`;
      const wornBucket = n === 'paint' || n === 'canvas'; if (!wornBucket && !same(ga.attributes.color?.array, gb.attributes.color?.array, 1e-6)) return `${tag}.${n}.color`; }
    return null; };
  let err = cmp(fastGeos, D.geos, 'geo') || cmp(fastD, D.dgeos, 'detail');
  // paint/canvas colours: compare against the direct build before dirt (re-derive the clean recolour through a fresh mesh of a non-worn path is not possible, so check via the shape cache directly)
  if (!err) { const cl = VM.cleanLook(type, color, variant); err = cmp(cl.geos, D.geos, 'clean') || cmp(cl.dgeos, D.dgeos, 'cleanD'); }
  if (!err && meta(VM.cleanLook(type, color, variant).m) !== meta(D.m)) err = 'metadata';
  if (err) { fails++; if (bad.length < 20) bad.push(`${type}/${color}/v${variant}: ${err}`); }
}
console.log(`${looks} looks checked in ${((performance.now() - t0) / 1000).toFixed(1)} s; shape builds ${VM.shapeCacheSize()}; fast path ${(tFast / looks).toFixed(2)} ms/look avg (incl. first shape builds), direct build ${(tDirect / looks).toFixed(2)} ms/look`);
for (const b of bad) console.log('  FAIL', b);
console.log(fails ? `FAILED: ${fails} looks differ` : 'PASS: every recoloured look is identical to a direct build');
process.exit(fails ? 1 : 0);
