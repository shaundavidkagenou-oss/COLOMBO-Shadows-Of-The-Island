// CPU profile of the per-frame simulation (Node, headless): real Traffic + Crowd at a quality preset's counts around a
// moving focus (driving down Galle Road), timing each subsystem per frame and the heap churn (garbage the GC must collect).
// Run: node --expose-gc tools/perf-sim.mjs [low|medium|high|ultra] [seconds]
import './node-dom-stub.mjs';
import * as THREE from 'three';
if (!process.env.NOFH) await import('../src/core/fastMath.js'); // the game's non-allocating Math.hypot (NOFH=1: built-in)
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
const VS = process.env.NOVS ? null : await import('../src/gfx/ViewSkip.js'); // the game's view skipping (NOVS=1: every person/vehicle posed and transformed every frame)
const sun = new THREE.DirectionalLight(); sun.target.position.set(0, 0, 0); sun.position.set(-0.42, 0.82, -0.38).multiplyScalar(100); // late-morning sun, as the game's 11:00
const S = { traffic: [], crowd: [], matrix: [], frame: [] }; let t = 0;
const step = (rec, move) => {
  if (move) { focus.z -= 2.5 * dt / 0.08 * 0.5; player.z = focus.z; } // ~15 m/s down Galle Road
  camera.position.set(focus.x, 2, focus.z + 5); camera.lookAt(focus.x, 1.5, focus.z - 10); camera.updateMatrixWorld();
  if (VS) VS.refreshView(camera, sun, 0);
  const a = performance.now(); T.update(dt, focus, camDir, t, C.peds, player); const b = performance.now();
  ctx.simTime = t; ctx.vehicles = T.all ? T.all() : T.vehicles; C.update(dt, focus, camDir, ctx); const c = performance.now();
  if (VS) { VS.holdVehicles(T.all ? T.all() : T.vehicles, null); VS.updateSceneMatrices(scene); } else scene.updateMatrixWorld(); const d = performance.now(); t += dt;
  if (rec) { S.traffic.push(b - a); S.crowd.push(c - b); S.matrix.push(d - c); S.frame.push(d - a); }
};
for (let i = 0; i < 20 / dt; i++) step(false, false); // fill the city
globalThis.gc?.(); const h0 = process.memoryUsage().heapUsed; let gcs = 0; const { PerformanceObserver } = await import('node:perf_hooks'); let gcMs = 0, gcMax = 0;
const ob = new PerformanceObserver((l) => { for (const e of l.getEntries()) { gcs++; gcMs += e.duration; gcMax = Math.max(gcMax, e.duration); } }); ob.observe({ entryTypes: ['gc'] });
if (process.env.STATIC) { // which nodes ever change their local transform (per kind), over 6 s of the measured scene
  const sig = (o) => [o.position.x, o.position.y, o.position.z, o.quaternion._x, o.quaternion._y, o.quaternion._z, o.quaternion._w, o.scale.x, o.scale.y, o.scale.z].join(',');
  const vm = new Set([...(T.all ? T.all() : T.vehicles), ...(T.parked || [])].map((v) => v.mesh)); const kind = (o) => { let q = o; while (q.parent && q.parent !== scene) q = q.parent; return vm.has(q) ? 'veh' : 'char'; };
  const first = new Map(), moved = new Set(); scene.traverse((o) => { if (o.parent && o.parent !== scene) first.set(o, sig(o)); });
  for (let i = 0; i < 360; i++) { step(false, i > 180); for (const [o, s0] of first) if (!moved.has(o) && sig(o) !== s0) moved.add(o); }
  const agg = {}; for (const [o] of first) { if (!o.parent) continue; const k = kind(o) + (o.isBone ? ':bone' : ':node') + (o.matrixAutoUpdate ? '' : ':manual'); agg[k] = agg[k] || [0, 0]; agg[k][0]++; if (moved.has(o)) agg[k][1]++; }
  console.log('STATIC [kind: nodes, of which moved]', JSON.stringify(agg));
  const names = {}; for (const [o] of first) if (!o.parent || moved.has(o) || !o.matrixAutoUpdate || o.isBone) continue; else { const k = kind(o) + ':' + (o.name || o.type) + '<' + (o.parent.name || o.parent.type); names[k] = (names[k] || 0) + 1; }
  console.log('never-moving auto nodes by name:', Object.entries(names).sort((a, b) => b[1] - a[1]).slice(0, 40).map((e) => e.join('=')).join('  '));
  const mv = {}; for (const o of moved) { if (o.isBone) continue; const k = kind(o) + ':' + (o.name || o.type) + '<' + (o.parent.name || o.parent.type); mv[k] = (mv[k] || 0) + 1; } console.log('moving non-bone nodes:', Object.entries(mv).sort((a, b) => b[1] - a[1]).slice(0, 30).map((e) => e.join('=')).join('  ')); }
let hprof = null; if (process.env.HPROF) { const inspector = await import('node:inspector'); hprof = new inspector.Session(); hprof.connect(); hprof.p = (m, p) => new Promise((r) => hprof.post(m, p, (e, x) => r(x))); await hprof.p('HeapProfiler.enable'); await hprof.p('HeapProfiler.startSampling', { samplingInterval: 4096, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true }); } // HPROF=n: who allocates during the measured frames (garbage = GC pauses)
let prof = null; if (process.env.PROF) { const inspector = await import('node:inspector'); prof = new inspector.Session(); prof.connect(); const post = (m, p) => new Promise((r) => prof.post(m, p, (e, x) => r(x))); prof.p = post; await post('Profiler.enable'); await post('Profiler.setSamplingInterval', { interval: 100 }); await post('Profiler.start'); } // PROF=n: top-n self time of the measured frames only (no loading/warm-up)
const half = SECS / 2 / dt; for (let i = 0; i < half; i++) step(true, false); for (let i = 0; i < half; i++) step(true, true);
await new Promise((r) => setTimeout(r, 50)); ob.disconnect();
if (hprof) { const { profile } = await hprof.p('HeapProfiler.stopSampling'); const self = new Map(); let tot = 0; const walk = (n) => { const cf = n.callFrame; const k = `${cf.functionName || '(anon)'} ${cf.url.split('/').slice(-2).join('/')}:${cf.lineNumber + 1}`; self.set(k, (self.get(k) || 0) + n.selfSize); tot += n.selfSize; for (const c of n.children) walk(c); }; walk(profile.head);
  console.log('ALLOC (measured frames, sampled bytes allocated incl. collected, ' + (tot / 1e6).toFixed(0) + ' MB):'); [...self].sort((a, b) => b[1] - a[1]).slice(0, +process.env.HPROF || 30).forEach(([k, t]) => console.log('  ' + (100 * t / tot).toFixed(1).padStart(5) + '%  ' + (t / 1e6).toFixed(1).padStart(6) + ' MB  ' + k)); }
if (prof) { const { profile } = await prof.p('Profiler.stop'); const byId = new Map(profile.nodes.map((n) => [n.id, n])); const self = new Map(); let tot = 0; profile.samples.forEach((sid, i) => { const d = profile.timeDeltas[i] || 0; const cf = byId.get(sid).callFrame; const k = `${cf.functionName || '(anon)'} ${cf.url.split('/').slice(-2).join('/')}:${cf.lineNumber + 1}`; self.set(k, (self.get(k) || 0) + d); tot += d; });
  console.log('PROFILE (measured frames, self time):'); [...self].sort((a, b) => b[1] - a[1]).slice(0, +process.env.PROF || 30).forEach(([k, t]) => console.log('  ' + (100 * t / tot).toFixed(1).padStart(5) + '%  ' + k)); }
const st = (a) => { const s = [...a].sort((x, y) => x - y); const avg = a.reduce((x, y) => x + y, 0) / a.length; return `avg ${avg.toFixed(2)} p50 ${s[s.length >> 1].toFixed(2)} p95 ${s[Math.floor(s.length * 0.95)].toFixed(2)} p99 ${s[Math.floor(s.length * 0.99)].toFixed(2)} max ${s[s.length - 1].toFixed(2)}`; };
if (process.env.OPTST) { const { Character } = await import('../src/actors/Character.js'); const st = (f) => { const v = eval('%GetOptimizationStatus(f)'); return ((v & 32) ? 'TURBOFAN' : (v & 16) ? 'optimized(other)' : (v & 256) ? 'maglev?' : 'NOT optimized') + ' (' + v.toString(2) + ')'; };
  const ch = C.peds[0] && C.peds[0].ch; console.log('OPT Crowd.update', st(C.update), '| Traffic.step', st(T.step), '| Traffic.update', st(T.update), '| Character.update(anim)', ch ? st(Object.getPrototypeOf(ch.anim).update) : '-', '| Math.hypot builtin'); }
let skinned = 0, meshes = 0; scene.traverse((o) => { if (o.isSkinnedMesh) skinned++; if (o.isMesh) meshes++; });
console.log(`quality ${q}: peds ${C.peds.length}, vehicles ${T.vehicles.length}, meshes ${meshes}, skinned ${skinned}`);
for (const k in S) console.log(k.padEnd(8), st(S[k]), 'ms');
console.log(`GC: ${gcs} collections, ${gcMs.toFixed(0)} ms total, worst ${gcMax.toFixed(1)} ms over ${SECS}s sim; heap now ${((process.memoryUsage().heapUsed - h0) / 1e6).toFixed(1)} MB above start`);
if (process.env.WRAP) for (const [k, e] of Object.entries(ACC).sort((x, y) => y[1].t - x[1].t).slice(0, 25)) console.log(k.padEnd(28), `n ${e.n} total ${e.t.toFixed(0)} ms max ${e.max.toFixed(1)} >4ms ${e.big}`);
{ /* where the per-frame matrix work goes: objects per top-level owner */ const vm = new Set([...(T.all ? T.all() : T.vehicles), ...(T.parked || [])].map((v) => v.mesh || v.v?.mesh).filter(Boolean)); const cnt = (o) => { let n = 0; o.traverse(() => n++); return n; }; let veh = 0, ch = 0, bones = 0, other = 0, all = 0; for (const c of scene.children) { const n = cnt(c); all += n; if (vm.has(c)) veh += n; else { let b = 0; c.traverse((q) => { if (q.isBone) b++; }); if (b) { ch += n; bones += b; } else other += n; } } console.log(`objects ${all}: characters ${ch} (bones ${bones}), vehicles ${veh} in ${vm.size}, other ${other}`); }
process.exit(0);
