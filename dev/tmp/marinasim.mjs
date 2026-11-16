// node harness: owners' departures / arrivals, the player's throttle & steering in open water (Boats.pilot + Boats.blocked on the real marina colliders)
import * as THREE from 'three';
import './nodeshim.mjs';
import { Boat } from '../../src/boats/Boat.js';
import { boatModel } from '../../src/boats/BoatModels.js';
import { buildMarina, marinaBerths, berthRoute } from '../../src/boats/Marina.js';
import { waterUniforms } from '../../src/world/Water.js';
globalThis.addEventListener = () => {}; globalThis.window = globalThis; const ctx2d = new Proxy({}, { get: (t, k) => (k in t ? t[k] : k === 'measureText' ? () => ({ width: 10 }) : k === 'createLinearGradient' || k === 'createRadialGradient' ? () => ({ addColorStop() {} }) : k === 'getImageData' ? (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }) : () => {}), set: (t, k, v) => { t[k] = v; return true; } });
globalThis.document = globalThis.document || { createElement: () => ({ getContext: () => ctx2d, style: {}, width: 1, height: 1 }), addEventListener() {} };
const { Boats } = await import('../../src/boats/Boats.js');
const F = Object.create(Boats.prototype); F.marina = buildMarina(new THREE.Scene(), { addAll() {} }); F.rects = F.marina.colliders.filter((c) => c.kind === 'deck' || c.kind === 'pole' || c.kind === 'building');
F.all = []; F.g = { camera: { position: { x: 0, z: 0 } } }; F.t = 0; F.wind = 0.4;
const berths = marinaBerths(); const mode = process.argv[2] || 'depart';
const env = (b) => ({ E: null, wakes: null, blocked: (bb) => F.blocked(bb), near: 999, wind: 0.4, t: F.t });
const fill = { W: process.env.FW || 'kalpitiya21', E: process.env.FE || 'ruhunu39', Q: 'halcyon52' };
for (const B of berths) { const id = B.side === 'Q' && B.maxLen < 20 ? 'halcyon52' : B.side === 'Q' ? 'meridian72' : fill[B.side]; const M = boatModel(id); const x = B.x(M.len, M.halfBeam); const b = new Boat(id, { mode: 'moored', x, z: B.zc, yaw: B.yaw, berth: { x, z: B.zc, yaw: B.yaw } }); b.home = B; F.all.push(b); }
if (mode === 'depart') {
  const which = (process.argv[3] || 'W3,E4,Q1').split(',');
  for (const name of which) { const b = F.all.find((q) => q.home.id === name || q.home.name === name); if (!b) { console.log('no berth', name, berths.map((q) => q.id || q.name).join(' ')); continue; }
    b.mode = 'drive'; b.route = berthRoute(b.home, b.len).map((p) => ({ ...p })); const log = []; let t = 0, done = false;
    for (let i = 0; i < 20 * 300 && !done; i++) { const dt = 0.05; t += dt; F.t = t; waterUniforms.uTime.value = t; for (const o of F.all) if (o !== b) o.update(dt, null, env(o)); const c = F.pilot(b, dt); if (c.done) done = true; b.update(dt, c, env(b));
      if (i % 100 === 0) log.push(`${t.toFixed(0)}s (${b.x.toFixed(1)},${b.z.toFixed(1)}) u${b.u.toFixed(1)} yaw${(b.yaw * 57.3).toFixed(0)} wp${b.route.length} hp${b.hp.toFixed(0)}`); }
    console.log(name, b.id, done ? 'DONE' : 'NOT DONE', t.toFixed(0) + 's'); console.log('  ' + log.join('\n  '));
    b.mode = 'moored'; b.place(b.berth.x, b.berth.z, b.berth.yaw, true); }
}
if (mode === 'drive') {
  for (const id of (process.argv[3] || 'dondra26,mirissa46,wjgti,meridian72').split(',')) { const b = new Boat(id, { mode: 'drive', x: 60, z: -1400, yaw: -Math.PI / 2 }); let t = 0, maxV = 0; const y0 = b.yaw; let turned = 0;
    for (let i = 0; i < 20 * 13; i++) { const dt = 0.05; t += dt; waterUniforms.uTime.value = t; const steer = t > 10 ? 1 : 0; const yb = b.yaw; b.update(dt, { thr: 1, steer }, env(b)); if (t > 10) turned += Math.atan2(Math.sin(b.yaw - yb), Math.cos(b.yaw - yb)); maxV = Math.max(maxV, b.u); }
    console.log(id.padEnd(11), `v10 ${maxV.toFixed(1)} m/s (${(maxV * 1.944).toFixed(0)} kn) max ${b.def.max} · turn ${(Math.abs(turned) * 57.3 / 3).toFixed(1)}°/s at speed · hp ${b.hp}`); }
}
if (mode === 'arrive') {
  F.freeCiv = () => ({ busy: false }); F.seat = () => {}; F.seen = () => false; F.camDist = () => 9999; F.owners = [];
  for (const name of (process.argv[3] || 'W3,E4,Q1,Q2').split(',')) { const b = F.all.find((q) => q.home.id === name); const B = b.home; b.away = true;
    if (!F.startArrival(b)) { console.log(name, 'startArrival false'); continue; } const log = []; let t = 0, done = false;
    for (let i = 0; i < 20 * 400 && !done; i++) { const dt = 0.05; t += dt; F.t = t; waterUniforms.uTime.value = t; const c = F.pilot(b, dt); if (c.done || !b.route.length) done = true; b.update(dt, c, env(b)); if (i % 200 === 0) log.push(`${t.toFixed(0)}s (${b.x.toFixed(1)},${b.z.toFixed(1)}) u${b.u.toFixed(1)} yaw${(b.yaw * 57.3).toFixed(0)} wp${b.route.length} hp${b.hp.toFixed(0)}`); }
    const M = b.model; const bx = B.x(M.len, M.halfBeam); const arr = [b.x.toFixed(1), b.z.toFixed(1), (b.yaw * 57.3).toFixed(0)]; b.berth = { x: b.x, z: b.z, yaw: B.yaw }; b.mode = 'moored'; for (let i = 0; i < 20 * 30; i++) { const bb = b.berth, dx = bx - bb.x, dz = B.zc - bb.z, dd = Math.hypot(dx, dz); if (dd > 0.02) { const st = Math.min(dd, 0.7 * 0.05); bb.x += (dx / dd) * st; bb.z += (dz / dd) * st; } b.update(0.05, null, env(b)); } console.log('  arrived at', arr.join(' '));
    console.log(name, b.id, done ? 'ARRIVED' : 'NOT ARRIVED', t.toFixed(0) + 's', 'final', b.x.toFixed(1), b.z.toFixed(1), (b.yaw * 57.3).toFixed(0), 'berth', bx.toFixed(1), B.zc, (B.yaw * 57.3).toFixed(0)); console.log('  ' + log.join('\n  ')); }
}
if (mode === 'patrol') {
  const src = (await import('fs')).readFileSync('../../src/boats/Boats.js', 'utf8'); const PATROL = eval(src.match(/const PATROL = (\[\[.*?\]\]);/)[1]);
  const b = new Boat('police36', { mode: 'drive', x: PATROL[0][0], z: PATROL[0][1], yaw: 0 }); b.role = 'police'; let k = 1; b.route = [{ x: PATROL[1][0], z: PATROL[1][1] }]; let t = 0; const log = [];
  for (let i = 0; i < 20 * 900; i++) { const dt = 0.05; t += dt; waterUniforms.uTime.value = t; const c = F.pilot(b, dt); if (!b.route.length) { k = (k + 1) % PATROL.length; b.route = [{ x: PATROL[k][0], z: PATROL[k][1] }]; log.push(`${t.toFixed(0)}s reached → wp${k}`); } b.update(dt, c, env(b)); if (b.slowT > 10) { log.push(`${t.toFixed(0)}s STUCK at (${b.x.toFixed(0)},${b.z.toFixed(0)}) going to wp${k} ${PATROL[k]}`); break; } }
  console.log(log.join('\n'));
}
