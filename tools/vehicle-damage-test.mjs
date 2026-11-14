// Vehicle damage test (Node): VehicleDamage on real vehicles (real-model cars, procedural car / van / bus / tuk-tuk, a bike)
//   • bullets: exact hits against the body proxy — side window shatters on the first hit and the round goes through (exit
//     point on the far side), the windscreen cracks per hit and falls out after 8, body hits leave holes and cost health,
//     a shot at a wheel bursts the tyre and the corner drops (dropFit), a shot over the roof misses
//   • engine bay: number of rifle hits until the engine catches fire (expected 10-30), then the fire → explosion
//   • dents: a 16 m/s front hit moves front vertices inward, never the rear; door pivot meshes match the dented body
//   • repair restores the original shared geometry / glass; dispose frees the private buffers
//   • explosion: wreck thrown up, lands, comes to rest with the body on / above the road; doors / wheels / panels flung
//   • chassis: braking dives the nose (+pitch), accelerating squats (-pitch), a left turn rolls the top to the right (+roll)
//   • shaders: every chunk the damage / tyre / char materials patch exists in three's shaders (patch applied exactly once)
// Run: node tools/vehicle-damage-test.mjs   (V=1 details, TYPES=a,b)
import './node-dom-stub.mjs';
import * as THREE from 'three';
globalThis.localStorage ??= { getItem: () => null, setItem: () => {}, removeItem: () => {} };
{ const { MAT } = await import('../src/gfx/Materials.js'); Object.setPrototypeOf(MAT, new Proxy({}, { get: (t, k) => { if (typeof k !== 'string') return undefined; if (!t[k]) t[k] = new THREE.MeshStandardMaterial({ vertexColors: true }); return t[k]; } })); }
const { Vehicle, CHASSIS } = await import('../src/vehicles/Vehicle.js');
const { VTYPES } = await import('../src/vehicles/VehicleModels.js');
const { VehicleDamage, _vdTesting } = await import('../src/vehicles/VehicleDamage.js');
const { tyreMaterial } = await import('../src/vehicles/TyreMaterial.js');
const Vb = !!process.env.V;
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; if (fail < 60) console.log('  FAIL', m); } };
const scene = new THREE.Scene(); const camera = new THREE.PerspectiveCamera(); camera.position.set(0, 2, 0);
const fx = { emit() {}, sparkEmit() {}, flush() {}, burn() { fx.burns++; }, blast(p, o) { fx.blasts.push([p.clone(), o.power]); }, burners: [], burns: 0, blasts: [], fire: {}, smoke: {}, spark: {} };
const traffic = { vehicles: [], parked: [], release(v) { if (!this.parked.includes(v)) this.parked.push(v); }, dropPax(v) { v.pax = []; }, abandon(v) { v.abandoned = true; return true; } };
const hurt = []; const game = { scene, camera, explosions: fx, traffic, collision: null, player: { x: 9999, z: 9999 }, crowd: { alarm() {} }, health: { damage(n) { hurt.push(n); } }, hud: { notify() {} } };
const VD = new VehicleDamage(game);
const want = process.env.TYPES ? process.env.TYPES.split(',') : ['ventra', 'raiden', 'vanta', 'car', 'van', 'bus', 'tuktuk', 'suv'];
const types = want.filter((t) => VTYPES[t]); const bikeT = Object.keys(VTYPES).find((t) => VTYPES[t].entry === 'bike'); if (!process.env.TYPES && bikeT) types.push(bikeT);
const X0 = 0, Z0 = 0; const W = (v, x, y, z) => new THREE.Vector3(x, y, z).applyMatrix4(v.mesh.matrixWorld);
const shoot = (v, from, to, def = { cls: 'rifle', dmg: 0.75 }) => { const o = from.clone(); const d = to.clone().sub(o).normalize(); return VD.bullet(v, o, d, def, { by: 'test' }); };
const fresh = (type, seed = 1) => { const v = new Vehicle(type, seed, scene); v.place(X0, Z0, 0.3); v.sync(0); v.mesh.updateMatrixWorld(true); return v; };
// a point on the body side the proxy really has there (not through an open wheel arch / under a load bed), away from the tyres
const bodyAim = (v, zs, ys) => { const P = _vdTesting.proxyOf(v); const R = v.T.wheelR; const Wh = v.mesh.userData.wheels || []; for (const zf of zs) for (const y of ys) { const z = zf * v.T.len / 2; if (Wh.some((w) => Math.abs(w.position.z - z) < R * 1.25 && y < w.position.y + R * 1.2)) continue; const L = P ? P.ray(new THREE.Vector3(v.T.wid / 2 + 3, y, z), new THREE.Vector3(-1, 0, 0), 10, []) : null; if (!P || (L[0] && L[0].tag === 0)) return [z, y]; } return [zs[0] * v.T.len / 2, ys[0]]; };
const rows = [];
for (const type of types) {
  const T = VTYPES[type]; const bike = T.entry === 'bike'; const tag = type; let v = fresh(type); const hw = T.wid / 2, hl = T.len / 2, H = T.hgt || 1.4; const ud = v.mesh.userData;
  const row = { type };
  // ---- side window: glass, shatters, bullet goes through
  if (!bike) {
    const P = (await import('../src/vehicles/VehicleDamage.js'))._vdTesting.proxyOf(v); ok(P && P.n > 50, `${tag}: hit proxy built (${P && P.n} tris)`); row.tris = P ? P.n : 0; row.panes = P ? P.panes.length : 0; ok(P && P.panes.length >= (type === 'tuktuk' ? 1 : 3), `${tag}: glass panes found (${P && P.panes.length})`);
    // aim at the centroid of the pane's largest glass triangle (a box centre can sit on a pillar)
    const aim = (pi) => { let best = -1, ba = 0; for (let t = 0; t < P.n; t++) { if (P.pane[t] !== pi) continue; const i = t * 9, A = P.tris; const e1 = new THREE.Vector3(A[i + 3] - A[i], A[i + 4] - A[i + 1], A[i + 5] - A[i + 2]), e2 = new THREE.Vector3(A[i + 6] - A[i], A[i + 7] - A[i + 1], A[i + 8] - A[i + 2]); const ar = e1.cross(e2).length(); if (ar > ba) { ba = ar; best = t; } } const i = best * 9, A = P.tris; const c = [(A[i] + A[i + 3] + A[i + 6]) / 3, (A[i + 1] + A[i + 4] + A[i + 7]) / 3, (A[i + 2] + A[i + 5] + A[i + 8]) / 3]; const n = P.panes[pi].n; c.n = n; return c; };
    const along = (c, k = 2.5, dx = 0, dy = 0) => [W(v, c[0] + c.n[0] * k + dx, c[1] + c.n[1] * k + dy, c[2] + c.n[2] * k), W(v, c[0] + dx, c[1] + dy, c[2])]; // straight at the pane, along its normal
    // a side window: the pane facing straight out with the most glass; try its triangles (largest first) until one is not behind trim
    const sideI = P.panes.reduce((b, p, i) => (p.kind === 1 && Math.abs(p.n[0]) > 0.85 && (b < 0 || p.tris > P.panes[b].tris) ? i : b), -1); const side = P.panes[sideI];
    const aims = (pi) => { const L0 = []; for (let t = 0; t < P.n; t++) if (P.pane[t] === pi) { const i = t * 9, A = P.tris; const e1 = new THREE.Vector3(A[i + 3] - A[i], A[i + 4] - A[i + 1], A[i + 5] - A[i + 2]), e2 = new THREE.Vector3(A[i + 6] - A[i], A[i + 7] - A[i + 1], A[i + 8] - A[i + 2]); const c = [(A[i] + A[i + 3] + A[i + 6]) / 3, (A[i + 1] + A[i + 4] + A[i + 7]) / 3, (A[i + 2] + A[i + 5] + A[i + 8]) / 3]; c.n = P.panes[pi].n; c.a = e1.cross(e2).length(); L0.push(c); } return L0.sort((a, b) => b.a - a.a); };
    const sides = P.panes.map((p, i) => i).filter((i) => P.panes[i].kind === 1 && Math.abs(P.panes[i].n[0]) > 0.85).sort((a, b) => P.panes[b].tris - P.panes[a].tris);
    if (side) { let c = null; for (const q of sides.flatMap((i) => aims(i).slice(0, 6))) { const [o, t] = along(q); const L1 = P.ray(o.clone().applyMatrix4(v.mesh.matrixWorld.clone().invert()), t.clone().sub(o).normalize().transformDirection(v.mesh.matrixWorld.clone().invert()), 10, []); if (L1[0] && L1[0].tag === 1) { c = q; break; } } c = c || aim(sideI); const R = shoot(v, ...along(c));
      ok(R && R.kind === 'glass', `${tag}: side window hit is glass (${R && R.kind})`); ok(R && R.exit && R.pass > 0.5, `${tag}: round goes through the side window and out (pass ${R && R.pass?.toFixed(2)})`);
      const G = v.vd.glass; ok(G && G.broken.some((b) => b), `${tag}: side window shattered on the first hit`); }
    const ws = P.panes[0]; if (ws && ws.kind === 0 && type !== 'tuktuk') { const inv = v.mesh.matrixWorld.clone().invert(); const wc = aims(0).slice(0, 16).find((q) => { const [o, t] = along(q); const L1 = P.ray(o.clone().applyMatrix4(inv), t.clone().sub(o).normalize().transformDirection(inv), 10, []); return L1[0] && L1[0].tag === 1 && P.pane[L1[0].tri] === 0; }) || aim(0); let broke = -1; for (let i = 1; i <= 9; i++) { const dx = (i % 3 - 1) * 0.04, dy = (Math.floor(i / 3) - 1) * 0.03; const R = shoot(v, ...along(wc, 2.5, dx, dy)); if (i === 1) ok(R && R.kind === 'glass', `${tag}: windscreen hit is glass (${R && R.kind})`); if (v.vd.glass.broken[0] && broke < 0) broke = i; }
      ok(broke === 8, `${tag}: laminated windscreen holds 7 hits, falls out at the 8th (${broke})`); row.ws = broke; }
    // ---- over the roof: a miss
    ok(shoot(v, W(v, hw + 3, H + 0.6, 0), W(v, 0, H + 0.6, 0)) === null, `${tag}: shot over the roof misses`);
    // ---- body hit low on a door
    const h0 = v.health; const [lz, ly] = bodyAim(v, [-0.05, 0.1, -0.2, 0.25, -0.35], [0.55, 0.65, 0.75, 0.45, 0.85]); const R = shoot(v, W(v, hw + 3, ly, lz), W(v, 0, ly, lz)); ok(R && R.kind === 'body', `${tag}: low side shot hits the body (${R && R.kind})`); ok(v.health < h0, `${tag}: body hit costs health (${h0} → ${v.health})`); ok(v.vd.nHole >= 1 && v.vd.holes && v.vd.holes.count >= 1, `${tag}: bullet hole decal placed`);
  } else { const R = shoot(v, W(v, 3, 0.7, 0), W(v, 0, 0.7, 0)); ok(R && R.kind !== 'glass', `${tag}: bike body hit (${R && R.kind})`); }
  // ---- tyre
  { const w = ud.wheels[0]; const c = w.position; const R = shoot(v, W(v, c.x + Math.sign(c.x || 1) * 3, c.y, c.z), W(v, c.x, c.y, c.z)); ok(R && R.kind === 'tyre', `${tag}: shot at the wheel bursts the tyre (${R && R.kind})`); ok(v.dropFit && v.dropFit.h > 0, `${tag}: body drops on the flat corner (${v.dropFit && v.dropFit.h.toFixed(3)})`);
    if (!bike) { const sx = Math.sign(c.x || 1), sz = Math.sign(c.z || 1); ok(Math.sign(v.dropFit.r) === -sx || Math.abs(v.dropFit.r) < 1e-4, `${tag}: rolls toward the flat side`); ok(Math.sign(v.dropFit.p) === sz, `${tag}: pitches toward the flat end`); } }
  // ---- dents (front hit) + door pivots match the body
  if (!bike) {
    const before = new Map(); for (const e of VD.deformables(v)) { const g = e.kind === 'bake' ? ud.bake.shared[e.name] : e.mesh.geometry; before.set(e.name + e.mesh.uuid, g.attributes.position.array.slice()); }
    const [fx_, fz_] = v.forward(); VD.onImpact(v, 16, { nx: -fx_, nz: -fz_, t: hl });
    let movedF = 0, movedR = 0, inward = 0; for (const e of VD.deformables(v)) { const g = e.kind === 'bake' ? ud.bake.shared[e.name] : e.mesh.geometry; const a = before.get(e.name + e.mesh.uuid), b = g.attributes.position.array; if (!a || a.length !== b.length) continue;
      for (let i = 0; i < a.length; i += 3) { const dz = b[i + 2] - a[i + 2]; if (Math.abs(dz) > 1e-4 || Math.abs(b[i] - a[i]) > 1e-4) { if (a[i + 2] > 0) movedF++; else movedR++; if (dz < 0) inward++; } } }
    ok(movedF > 20, `${tag}: front crash dents the front (${movedF} vertices)`); ok(movedR === 0, `${tag}: rear untouched by a front crash (${movedR})`); ok(inward >= movedF * 0.9, `${tag}: dent pushes inward (${inward}/${movedF})`); row.dentV = movedF;
    const B = ud.bake; if (B) { let checked = 0, bad = 0; for (const d of ud.doors) { for (const m of d.pivot.children) { const R0 = B.ranges[m.name], r = R0 && R0.doors.find((q) => q.door === d.i); if (!r || m.geometry.userData.vdOwner !== v) continue; const S = B.shared[m.name].attributes.position.array, P2 = m.geometry.attributes.position.array; for (let j = 0; j < P2.length; j += 3) { checked++; if (Math.abs(P2[j] + d.hx - S[r.v0 * 3 + j]) > 1e-5 || Math.abs(P2[j + 2] + d.hz - S[r.v0 * 3 + j + 2]) > 1e-5) bad++; } } }
      ok(bad === 0, `${tag}: door pivot meshes follow the dented body (${bad}/${checked} off)`); }
    // scrape
    const cs = VD.stats.scrapes; VD.onImpact(v, 0, { nx: -Math.cos(v.yaw), nz: Math.sin(v.yaw), t: 0, slide: 6, scrapeOnly: true }); ok(VD.stats.scrapes === cs + 1, `${tag}: wall grind scrapes the paint`);
  }
  // ---- repair
  if (!bike) { VD.repair(v); const B = ud.bake; let shared = true; for (const e of VD.deformables(v)) { const g = e.kind === 'bake' ? B.shared[e.name] : e.mesh.geometry; if (g.userData.vdOwner) shared = false; } ok(shared, `${tag}: repair restores the original shared geometry`); ok(v.health === 100 && !v.dropFit && !v.vd, `${tag}: repair resets health / tyres / state`);
    const gm = B ? B.meshes.glass : v.mesh.getObjectByName('glass'); if (gm) { const m = Array.isArray(gm.material) ? gm.material[0] : gm.material; ok(!m.userData.vdOff, `${tag}: repair puts the original glass back`); } }
  // ---- engine bay: rifle hits until fire
  if (!bike) { v.dispose(); v = fresh(type, 2); let n = 0; const sg = _vdTesting.rearEngine(v) ? -1 : 1; const [ez, ey] = bodyAim(v, [0.6, 0.72, 0.84, 0.92, 0.5].map((f) => f * sg), [0.8, 0.7, 0.6, 0.5, 0.9, 0.4, 1.0]);
    while (!v.burning && n < 80) { n++; const R = shoot(v, W(v, hw + 3, ey, ez), W(v, 0, ey, ez)); if (n === 1) ok(R && R.zone === 'engine', `${tag}: shot into the engine bay hits the engine (${R && (R.zone || R.kind)})`); }
    if (Vb) console.log(`  ${tag} engine shot height ${ey}`); row.engineHits = n; ok(n >= 10 && n <= (_vdTesting.heavyType(v) ? 45 : 32), `${tag}: rifle hits to set the engine on fire (${n})`); ok(v.damage > 0.7, `${tag}: heavy engine damage → smoke (damage ${v.damage.toFixed(2)})`);
    const F = v.vd.fire; ok(F && F.T >= 6 && F.T <= 9, `${tag}: fire burns 6-9 s before the tank goes (${F && F.T.toFixed(1)})`); }
  // ---- explosion + wreck
  { if (bike) VD.ignite(v, 0.5, 'test', 'engine'); fx.blasts.length = 0; const nb = VD.bodies.length; let t = 0; let maxLift = 0; while (!v.wrecked && t < 12) { VD.update(1 / 30); t += 1 / 30; } ok(v.wrecked, `${tag}: burning vehicle explodes (after ${t.toFixed(1)} s)`); ok(fx.blasts.length === 1, `${tag}: one blast at the vehicle`);
    row.debris = VD.bodies.length - nb; ok(VD.bodies.length > nb || bike, `${tag}: pieces flung (${VD.bodies.length - nb})`); ok(v.wreck && v.wreck.vy > 0, `${tag}: shell thrown up`);
    if (!v.wreck) { ok(false, `${tag}: no wreck to follow`); v.dispose(); continue; } t = 0; while (!(v.wreck.rest) && t < 12) { VD.update(1 / 60); t += 1 / 60; maxLift = Math.max(maxLift, v.wreckLift); } row.air = maxLift.toFixed(2); row.rest = t.toFixed(1); row.roll = (v.roll / Math.PI * 180).toFixed(0);
    ok(v.wreck.rest, `${tag}: wreck comes to rest (${t.toFixed(1)} s)`); ok(maxLift > (bike ? 0.3 : (T.mass || 0) > 3000 ? 0.1 : 1), `${tag}: shell leaves the ground (max lift ${maxLift.toFixed(2)} m)`);
    v.mesh.updateMatrixWorld(true); const bb = new THREE.Box3(); for (const name of ['paint']) { const u2 = v.mesh.userData; const m = (u2.bake && u2.bake.meshes[name]) || v.mesh.getObjectByName(name); if (m) bb.expandByObject(m, true); } if (!v.mesh.userData.bake) v.mesh.traverse((o) => { if (o.isMesh && o.visible && !/contactShadow|headPool/.test(o.name)) bb.union(new THREE.Box3().setFromObject(o, true)); }); { const cs = v.mesh.getObjectByName('contactShadow'); if (cs) ok(cs.visible === (Math.abs(v.roll) < 0.25), `${tag}: ground shadow only under an upright wreck`); } const gy = v.y; if (!bb.isEmpty()) { ok(bb.min.y > gy - (bike ? 0.08 : 0.05) && bb.min.y < gy + (_vdTesting.heavyType(v) ? 0.95 : 0.6), `${tag}: wreck rests on the road (body bottom ${(bb.min.y - gy).toFixed(2)} m)`); row.bottom = (bb.min.y - gy).toFixed(2); }
    let restB = 0; for (let k = 0; k < 400; k++) VD.update(1 / 30); for (const b of VD.bodies) { if (b.rest) restB++; ok(b.obj.position.y > -0.5 && b.obj.position.y < 3, `${tag}: debris piece lies on the road (${b.obj.position.y.toFixed(2)})`); } ok(restB === VD.bodies.length, `${tag}: every piece settles (${restB}/${VD.bodies.length})`);
    ok(VD.repair(v) === false, `${tag}: a wreck cannot be repaired`); }
  v.dispose(); for (const b of VD.bodies) b.obj.parent?.remove(b.obj); VD.bodies.length = 0; rows.push(row);
}
// ---- chassis springs
{ CHASSIS.focus = null; const v = fresh('car'); v.speed = 20; v.sync(1 / 60); for (let i = 0; i < 40; i++) { v.speed -= 8 / 60; v.sync(1 / 60); } ok(v.pitch > 0.01, `chassis: braking dives the nose (pitch ${v.pitch.toFixed(3)})`); const dive = v.pitch;
  for (let i = 0; i < 240; i++) v.sync(1 / 60); ok(Math.abs(v.pitch - v.tPitch) < 0.01, `chassis: settles after braking (${v.pitch.toFixed(3)})`); ok(dive < 0.07, `chassis: dive within a family car's range (${dive.toFixed(3)} rad)`);
  for (let i = 0; i < 40; i++) { v.speed += 4 / 60; v.sync(1 / 60); } ok(v.pitch < -0.004, `chassis: accelerating squats (pitch ${v.pitch.toFixed(3)})`);
  for (let i = 0; i < 240; i++) v.sync(1 / 60); v.speed = 15; for (let i = 0; i < 50; i++) { v.yaw += 0.5 / 60; v.sync(1 / 60); } ok(v.roll > 0.01, `chassis: left turn rolls the body out of the turn (roll ${v.roll.toFixed(3)})`); v.dispose(); }
// ---- shaders: every patched chunk exists
{ const geo = new THREE.TorusGeometry(0.3, 0.1, 8, 24); geo.rotateY(Math.PI / 2); const mats = [['tyre', tyreMaterial(geo), 'standard'], ['glass', VD.warmGroup().children[0].material, 'physical'], ['char', VD.warmGroup().children[1].material, 'standard']];
  for (const [nm, m, lib] of mats) { const s = { uniforms: {}, vertexShader: THREE.ShaderLib[lib].vertexShader, fragmentShader: THREE.ShaderLib[lib].fragmentShader }; const v0 = s.vertexShader, f0 = s.fragmentShader; m.onBeforeCompile(s);
    ok(s.vertexShader !== v0 && s.fragmentShader !== f0, `${nm}: shader patched`); ok(!/#include <(color_fragment|begin_vertex|common)>[\s\S]*#include <\1>/.test(s.fragmentShader.replace(/^/, '')), `${nm}: chunks patched once`); ok(m.customProgramCacheKey().startsWith('vd-'), `${nm}: one shared program key`); } }
console.log('\n type      tris  panes  ws  dentV  engineHits  debris  air(m)  rest(s)  roll  bottom');
for (const r of rows) console.log(` ${r.type.padEnd(9)} ${String(r.tris ?? '-').padStart(5)}  ${String(r.panes ?? '-').padStart(5)}  ${String(r.ws ?? '-').padStart(2)}  ${String(r.dentV ?? '-').padStart(5)}  ${String(r.engineHits ?? '-').padStart(10)}  ${String(r.debris ?? '-').padStart(6)}  ${String(r.air).padStart(6)}  ${String(r.rest).padStart(7)}  ${String(r.roll).padStart(4)}  ${r.bottom ?? '-'}`);
console.log(`\nvehicle-damage: ${pass} passed, ${fail} failed`); if (Vb) console.log(VD.stats); process.exit(fail ? 1 : 0);
