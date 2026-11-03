// Vehicle interpenetration test (Node, headless): real Traffic (High preset count) + parked vehicles around several busy
// parts of the city; every frame every pair of vehicle bodies (oriented boxes, true length × width) is checked and the
// penetration depth measured. Reports the worst cases with what each vehicle was doing (lane piece, turn, lane change,
// parked, pulling out...). Run: node tools/vehicle-overlap-test.mjs [seconds per area]   (VO_DBG=1 for every event)
import './node-dom-stub.mjs';
import * as THREE from 'three';
globalThis.localStorage ??= { getItem: () => null, setItem: () => {}, removeItem: () => {} };
{ const { MAT } = await import('../src/gfx/Materials.js'); Object.setPrototypeOf(MAT, new Proxy({}, { get: (t, k) => { if (typeof k !== 'string') return undefined; if (!t[k]) t[k] = new THREE.MeshStandardMaterial({ vertexColors: true }); return t[k]; } })); }
const SECS = +(process.argv[2] || 120);
const CP = await import('../src/world/CityPlan.js'); CP.generatePlan();
const { Collision } = await import('../src/world/Collision.js');
const { Traffic } = await import('../src/vehicles/Traffic.js');
const col = new Collision(); col.addAll(CP.plan.colliders);
// penetration depth of two oriented rectangles (0 = touching or apart)
const corners = (x, z, yaw, hw, hl) => { const c = Math.cos(yaw), s = Math.sin(yaw); return [[-hw, -hl], [hw, -hl], [hw, hl], [-hw, hl]].map(([lx, lz]) => [x + c * lx + s * lz, z - s * lx + c * lz]); };
const pen = (A, B) => { let best = Infinity; for (const P of [A, B]) for (let i = 0; i < 4; i++) { const a = P[i], b = P[(i + 1) % 4]; let nx = b[1] - a[1], nz = a[0] - b[0]; const l = Math.hypot(nx, nz); nx /= l; nz /= l; let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity; for (const q of A) { const d = q[0] * nx + q[1] * nz; a0 = Math.min(a0, d); a1 = Math.max(a1, d); } for (const q of B) { const d = q[0] * nx + q[1] * nz; b0 = Math.min(b0, d); b1 = Math.max(b1, d); } const o = Math.min(a1 - b0, b1 - a0); if (o <= 0) return 0; best = Math.min(best, o); } return best; };
const what = (v) => { if (v.parked) return 'parked'; if (v.free) return 'free(knocked)'; const ai = v.ai; if (!ai) return 'noAI'; const p = ai.pieces && ai.pieces[0]; return `${p ? p.type + (p.type === 'line' ? ':L' + p.lane : '') : '?'}${ai.rejoin ? '+rejoin' : ''}${ai.hdg ? '+lc' : ''}${ai.detour ? '+detour' : ''}${ai.fuel ? '+fuel' : ''}${ai.stopped ? '+stopped' : ''}${ai.pullOut ? '+pullout' : ''} v=${v.speed.toFixed(1)}`; };
const AREAS = [['Galle Rd Kollupitiya', -392, 300], ['Galle Rd Bambalapitiya', -400, 800], ['Fort / Pettah', -150, -700], ['Borella', 600, 450], ['Maradana', 400, -450], ['Town Hall', 150, 100]];
let worstAll = 0, stall = 0; const summary = [];
for (const [name, x, z] of AREAS.filter((a) => !process.env.VO_AREA || a[0].includes(process.env.VO_AREA))) {
  const scene = new THREE.Scene(); const events = { emit() {}, on() {} }; const T = new Traffic(scene, col, events); T.max = 46;
  const focus = { x, z }; const player = { x, z, y: 0, vehicle: null, ch: null }; const camDir = new THREE.Vector3(0, 0, -1); const dt = 1 / 30;
  const prevPen = new Map(); let t = 0, frames = 0, overlapFrames = 0, events_ = 0, spSum = 0, spN = 0, maxBlock = 0; const blocked = new Map(); const worst = []; const live = new Map();
  for (let i = 0; i < SECS / dt; i++) {
    T.update(dt, focus, camDir, t, [], player); t += dt;
    if (t < 15) continue; frames++;
    const vs = T.vehicles.concat(T.parked || []); for (const v of vs) if (v._seen === undefined) v._seen = t; let any = false; const seen = new Set();
    for (let a = 0; a < vs.length; a++) for (let b = a + 1; b < vs.length; b++) { const A = vs[a], B = vs[b]; if (Math.abs(A.x - B.x) > 14 || Math.abs(A.z - B.z) > 14) continue; if (A.parked && B.parked) continue;
      const d = pen(corners(A.x, A.z, A.yaw, A.T.wid / 2, A.T.len / 2), corners(B.x, B.z, B.yaw, B.T.wid / 2, B.T.len / 2)); if (d < 0.02) continue;
      any = true; const key = A.id + ':' + B.id; seen.add(key); const e = live.get(key); if (!e) { events_++; const ev = { d, t, a: `${A.type}#${A.id} ${what(A)}`, b: `${B.type}#${B.id} ${what(B)}`, at: `(${A.x.toFixed(0)},${A.z.toFixed(0)})` }; live.set(key, ev); worst.push(ev); if (process.env.VO_DBG) console.log('  +', name, ev.d.toFixed(2), ev.a, '|', ev.b, ev.at, 'ages', (t - (A._seen ?? t)).toFixed(1), (t - (B._seen ?? t)).toFixed(1), 'prev', prevPen.get(key)?.toFixed(3), 'blockA', A.ai && A.ai.bodyBlock ? A.ai.bodyBlock.id : '-', 'hdg', A.ai && (A.ai.hdg || 0).toFixed(2), 'lat', A.ai && (A.ai.lat || 0).toFixed(2), 'latW', A.ai && A.ai.latWant); } else if (d > e.d) { e.d = d; e.a = `${A.type}#${A.id} ${what(A)}`; e.b = `${B.type}#${B.id} ${what(B)}`; } }
    for (const k of [...live.keys()]) if (!seen.has(k)) live.delete(k);
    if (process.env.VO_DBG) { prevPen.clear();    for (let a = 0; a < vs.length; a++) for (let b = a + 1; b < vs.length; b++) { const A = vs[a], B = vs[b]; if (Math.abs(A.x - B.x) > 14 || Math.abs(A.z - B.z) > 14) continue; prevPen.set(A.id + ':' + B.id, pen(corners(A.x, A.z, A.yaw, A.T.wid / 2, A.T.len / 2), corners(B.x, B.z, B.yaw, B.T.wid / 2, B.T.len / 2))); } }
    if (any) overlapFrames++;
    for (const v of T.vehicles) { if (!v.ai) continue; spSum += v.speed; spN++; if (v.ai.bodyBind && v.speed < 0.3) { blocked.set(v, (blocked.get(v) || 0) + dt); maxBlock = Math.max(maxBlock, blocked.get(v)); if (process.env.VO_DBG && Math.abs(blocked.get(v) - 15) < dt / 2) { const o = v.ai.bodyBlock; console.log('  STALL', name, `${v.type}#${v.id} ${what(v)}`, 'by', `${o.type}#${o.id} ${what(o)}`, `at (${v.x.toFixed(1)},${v.z.toFixed(1)}) yaw ${v.yaw.toFixed(2)} other (${o.x.toFixed(1)},${o.z.toFixed(1)}) yaw ${o.yaw.toFixed(2)} stuck ${v.ai.stuck.toFixed(1)} otherBlock ${o.ai && o.ai.bodyBlock ? o.ai.bodyBlock.id : '-'}`); } } else blocked.delete(v); }
  }
  worst.sort((p, q) => q.d - p.d); const w = worst[0] ? worst[0].d : 0; worstAll = Math.max(worstAll, w);
  console.log(`${name}: ${events_} overlap events (>2 cm), ${(100 * overlapFrames / frames).toFixed(1)}% of frames, worst ${(w * 100).toFixed(0)} cm; mean traffic speed ${(spSum / Math.max(1, spN) * 3.6).toFixed(1)} km/h; longest standstill caused only by the body guard ${maxBlock.toFixed(1)} s`); stall = Math.max(stall, maxBlock);
  for (const e of worst.slice(0, 6)) console.log(`    ${(e.d * 100).toFixed(0)} cm  ${e.a}  |  ${e.b}  at ${e.at} t=${e.t.toFixed(1)}`);
  summary.push([name, events_, w]);
}
const bad = summary.filter((s) => s[2] > 0.1); if (stall > 40) bad.push(['gridlock (a vehicle stood ' + stall.toFixed(0) + ' s behind a body)']);
console.log(bad.length ? `FAIL: vehicles interpenetrate by more than 10 cm in ${bad.map((s) => s[0]).join(', ')}` : `PASS: no vehicle body sinks more than 10 cm into another (worst ${(worstAll * 100).toFixed(0)} cm)`);
process.exit(bad.length ? 1 : 0);
