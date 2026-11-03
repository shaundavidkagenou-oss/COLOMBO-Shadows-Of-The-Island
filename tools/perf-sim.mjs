// CPU profile of the per-frame simulation (Node, headless): real Traffic + Crowd at a quality preset's counts around a
// moving focus (driving down Galle Road), timing each subsystem per frame and the heap churn (garbage the GC must collect).
// Run: node --expose-gc tools/perf-sim.mjs [low|medium|high|ultra] [seconds]
import './node-dom-stub.mjs';
import * as THREE from 'three';
globalThis.localStorage ??= { getItem: () => null, setItem: () => {}, removeItem: () => {} };
{ const { MAT } = await import('../src/gfx/Materials.js'); Object.setPrototypeOf(MAT, new Proxy({}, { get: (t, k) => { if (typeof k !== 'string') return undefined; if (!t[k]) t[k] = new THREE.MeshStandardMaterial({ vertexColors: true }); return t[k]; } })); }
const q = process.argv[2] || 'high', SECS = +(process.argv[3] || 40);
const { QUALITY_PRESETS } = await import('../src/core/Settings.js'); const QP = QUALITY_PRESETS[q];
const L = await import('../src/world/Layout.js');
const CP = await import('../src/world/CityPlan.js'); CP.generatePlan();
const { Collision } = await import('../src/world/Collision.js');
const { Traffic } = await import('../src/vehicles/Traffic.js');
const { Crowd } = await import('../src/actors/Crowd.js');
const ACC = {}; if (process.env.WRAP) { const { wrap } = await import('./_wrap.mjs'); wrap(Traffic.prototype, ['bodyGap', 'binBodies', 'spawn', 'addDriver', 'remove', 'updateParked', 'step', 'updateOccupants', 'extend', 'updateDisembark'], 'T', ACC); wrap(Crowd.prototype, Object.getOwnPropertyNames(Crowd.prototype).filter((n) => n !== 'constructor' && n !== 'update'), 'C', ACC); }
const col = new Collision(); col.addAll(CP.plan.colliders);
const scene = new THREE.Scene(); const events = { emit() {}, on() {} };
const C = new Crowd(scene, col, events); C.max = QP.crowd; C.prepareSpecs?.(C.specTarget ? C.specTarget() : 48);
const T = new Traffic(scene, col, events); T.max = QP.traffic; T.crowd = C; { const tw = performance.now(); await T.warmModels([[-392, 700]]); console.log('loading-screen warm', (performance.now() - tw).toFixed(0), 'ms'); }
const focus = { x: -392, z: 700 }; const player = { x: focus.x, z: focus.z, y: 0, vehicle: null, ch: null };
const camDir = new THREE.Vector3(0, 0, -1); const dt = 1 / 60;
const ctx = { simTime: 0, vehicles: [], player, bodies: [], hourFactor: 1, hour: 12, rain: 0, night: 0 };
const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 1400);
const S = { traffic: [], crowd: [], matrix: [], frame: [] }; let t = 0;
const step = (rec, move) => {
  if (move) { focus.z -= 2.5 * dt / 0.08 * 0.5; player.z = focus.z; } // ~15 m/s down Galle Road
  camera.position.set(focus.x, 2, focus.z + 5); camera.lookAt(focus.x, 1.5, focus.z - 10); camera.updateMatrixWorld();
  const a = performance.now(); T.update(dt, focus, camDir, t, C.peds, player); const b = performance.now();
  ctx.simTime = t; ctx.vehicles = T.all ? T.all() : T.vehicles; C.update(dt, focus, camDir, ctx); const c = performance.now();
  scene.updateMatrixWorld(); const d = performance.now(); t += dt;
  if (rec) { S.traffic.push(b - a); S.crowd.push(c - b); S.matrix.push(d - c); S.frame.push(d - a); }
};
for (let i = 0; i < 20 / dt; i++) step(false, false); // fill the city
globalThis.gc?.(); const h0 = process.memoryUsage().heapUsed; let gcs = 0; const { PerformanceObserver } = await import('node:perf_hooks'); let gcMs = 0, gcMax = 0;
const ob = new PerformanceObserver((l) => { for (const e of l.getEntries()) { gcs++; gcMs += e.duration; gcMax = Math.max(gcMax, e.duration); } }); ob.observe({ entryTypes: ['gc'] });
const half = SECS / 2 / dt; for (let i = 0; i < half; i++) step(true, false); for (let i = 0; i < half; i++) step(true, true);
await new Promise((r) => setTimeout(r, 50)); ob.disconnect();
const st = (a) => { const s = [...a].sort((x, y) => x - y); const avg = a.reduce((x, y) => x + y, 0) / a.length; return `avg ${avg.toFixed(2)} p50 ${s[s.length >> 1].toFixed(2)} p95 ${s[Math.floor(s.length * 0.95)].toFixed(2)} p99 ${s[Math.floor(s.length * 0.99)].toFixed(2)} max ${s[s.length - 1].toFixed(2)}`; };
let skinned = 0, meshes = 0; scene.traverse((o) => { if (o.isSkinnedMesh) skinned++; if (o.isMesh) meshes++; });
console.log(`quality ${q}: peds ${C.peds.length}, vehicles ${T.vehicles.length}, meshes ${meshes}, skinned ${skinned}`);
for (const k in S) console.log(k.padEnd(8), st(S[k]), 'ms');
console.log(`GC: ${gcs} collections, ${gcMs.toFixed(0)} ms total, worst ${gcMax.toFixed(1)} ms over ${SECS}s sim; heap now ${((process.memoryUsage().heapUsed - h0) / 1e6).toFixed(1)} MB above start`);
if (process.env.WRAP) for (const [k, e] of Object.entries(ACC).sort((x, y) => y[1].t - x[1].t).slice(0, 25)) console.log(k.padEnd(28), `n ${e.n} total ${e.t.toFixed(0)} ms max ${e.max.toFixed(1)} >4ms ${e.big}`);
process.exit(0);
