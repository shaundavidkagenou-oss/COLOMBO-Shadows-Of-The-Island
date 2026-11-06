// Trailer test (node): checks the official trailer's edit against the real city plan, frame by frame, for every frame
// that is actually on screen — no driving line, wreck flight, actor or camera passes through a building, pole, tree
// trunk, kerb furniture or another vehicle; the timeline is complete and monotonic; the score's hits land on the
// picture; and the trailer cannot touch the game (no saves / settings / story, lazily loaded only from the gate).
import './node-dom-stub.mjs';
import fs from 'node:fs';
globalThis.localStorage ??= { getItem: () => null, setItem: () => {}, removeItem: () => {} };
globalThis.addEventListener ??= () => {};
const CP = await import('../src/world/CityPlan.js');
const L = await import('../src/world/Layout.js');
const { VTYPES } = await import('../src/vehicles/VehicleModels.js');
const TP = await import('../src/story/TrailerPlan.js');
const { buildPlan, posesAt, editTimeOf, blackAt, LENGTH } = TP;

let pass = 0, fail = 0; const bad = [];
const ok = (c, msg) => { if (c) pass++; else { fail++; if (bad.length < 60) bad.push(msg); } };
const plan = CP.generatePlan();
const P = buildPlan();

// ---------------------------------------------------------------- timeline
ok(P.LENGTH === LENGTH && LENGTH >= 90 && LENGTH <= 150, 'length');
let tEnd = 0;
for (let i = 0; i < P.shots.length; i++) {
  const s = P.shots[i], n = P.shots[i + 1];
  ok(s.dur > 0.5, `shot ${s.name} too short`);
  if (n) { const gap = n.start - (s.start + s.dur); ok(gap > -1e-6, `overlap ${s.name}`); if (gap > 1e-6) { let covered = true; for (let e = s.start + s.dur; e < n.start; e += 0.02) if (blackAt(P, e) < 0.999) covered = false; ok(covered, `gap after ${s.name} not under black`); } }
  let prev = -1e9; for (let k = 0; k <= 200; k++) { const t = s.simAt(s.dur * k / 200); ok(t >= prev - 1e-9, `${s.name} sim time goes backwards`); prev = t; }
  ok(P.scenes[s.scene], `${s.name} unknown scene`); tEnd = Math.max(tEnd, s.start + s.dur);
}
ok(P.shots[0].start === 0, 'starts at 0'); ok(tEnd >= LENGTH - 10, 'picture runs to the end card');
for (const t of P.texts) ok(t.a >= 0 && t.b <= LENGTH && t.b > t.a, `text ${t.text || t.kind} range`);
const eBlast = editTimeOf(P, 'C', P.tE); ok(eBlast !== null && eBlast > 70 && eBlast < 90, `roadblock blast on screen (${eBlast})`);
ok(editTimeOf(P, 'C', 41.0) !== null, 'second jeep blast on screen');
ok(P.shots.some((s) => s.scene === 'C' && s.simAt(0) <= 6.2 && s.simAt(s.dur) >= 5.6), 'the drift is on screen');
// black dips actually reach full black between acts
for (const [a, b] of [[26.2, 26.8], [46.2, 47.8], [92.2, 93.8]]) ok(blackAt(P, (a + b) / 2) > 0.999, `black at ${a}`);

// ---------------------------------------------------------------- world obstacles near the action
const cols = plan.colliders.filter((c) => (c.h ?? 3) >= 0.25);
const trees = plan.trees.map((t) => ({ x: t.x, z: t.z, r: 0.32 * (t.s || 1) }));
const near = (list, x, z, R) => list.filter((c) => (c.x0 !== undefined ? c.x1 > x - R && c.x0 < x + R && c.z1 > z - R && c.z0 < z + R : Math.abs(c.x - x) < R && Math.abs(c.z - z) < R));
const cache = new Map();
const local = (x, z) => { const k = Math.round(x / 40) + ':' + Math.round(z / 40); if (!cache.has(k)) cache.set(k, { c: near(cols, Math.round(x / 40) * 40, Math.round(z / 40) * 40, 60), t: near(trees, Math.round(x / 40) * 40, Math.round(z / 40) * 40, 60) }); return cache.get(k); };
// oriented box (centre, half sizes, yaw) vs axis-aligned box / circle
const obb = (x, z, yaw, hl, hw) => { const fx = Math.sin(yaw), fz = Math.cos(yaw); return { x, z, ax: [[fx, fz], [fz, -fx]], h: [hl, hw] }; };
const corners = (o) => { const r = []; for (const a of [-1, 1]) for (const b of [-1, 1]) r.push([o.x + o.ax[0][0] * o.h[0] * a + o.ax[1][0] * o.h[1] * b, o.z + o.ax[0][1] * o.h[0] * a + o.ax[1][1] * o.h[1] * b]); return r; };
const sat = (A, B) => { for (const ax of [[1, 0], [0, 1], ...A.ax, ...B.ax]) { const pa = corners(A).map((p) => p[0] * ax[0] + p[1] * ax[1]), pb = corners(B).map((p) => p[0] * ax[0] + p[1] * ax[1]); if (Math.max(...pa) < Math.min(...pb) || Math.max(...pb) < Math.min(...pa)) return false; } return true; };
const aabbBox = (c) => ({ x: (c.x0 + c.x1) / 2, z: (c.z0 + c.z1) / 2, ax: [[1, 0], [0, 1]], h: [(c.x1 - c.x0) / 2, (c.z1 - c.z0) / 2] });
const boxCircle = (o, x, z, r) => { const dx = x - o.x, dz = z - o.z; const u = dx * o.ax[0][0] + dz * o.ax[0][1], v = dx * o.ax[1][0] + dz * o.ax[1][1]; const qu = Math.max(-o.h[0], Math.min(o.h[0], u)), qv = Math.max(-o.h[1], Math.min(o.h[1], v)); return (u - qu) ** 2 + (v - qv) ** 2 < r * r; };
const vbox = (rig, p) => { const T = VTYPES[rig.type]; return obb(p.cx ?? p.x, p.cz ?? p.z, p.yaw, T.len / 2 - 0.05, T.wid / 2 - 0.03); };
const vbottom = (rig, p) => (p.cy !== undefined ? p.cy - VTYPES[rig.type].hgt / 2 : 0);

let frames = 0, camChecks = 0; const seen = new Set();
for (const s of P.shots) {
  const S = P.scenes[s.scene]; const N = Math.max(30, Math.ceil(s.dur * 30));
  for (let k = 0; k <= N; k++) {
    const le = s.dur * k / N, e = s.start + le; if (blackAt(P, e) > 0.98) continue; // not on screen
    const t = s.simAt(le), Q = posesAt(S, t); frames++;
    const where = `${s.name} e${e.toFixed(2)} t${t.toFixed(2)}`;
    // vehicles vs world + each other
    const boxes = [];
    for (const [id, rig] of Object.entries(S.rigs)) {
      const p = Q[id]; if (p.vis === false) continue; const B = vbox(rig, p); boxes.push([id, B, rig, p]); const W = local(B.x, B.z); const bot = vbottom(rig, p);
      for (const c of W.c) { if (bot > (c.h ?? 3)) continue; const key = `${s.scene}.${id}.c${c.x0}.${c.z0}`; if (sat(B, aabbBox(c))) { ok(false, `${where}: ${id} hits ${c.kind || 'collider'} ${((c.x0 + c.x1) / 2).toFixed(1)},${((c.z0 + c.z1) / 2).toFixed(1)}`); seen.add(key); } else pass++; }
      for (const tr of W.t) { if (bot > 2.5) continue; ok(!boxCircle(B, tr.x, tr.z, tr.r), `${where}: ${id} hits tree ${tr.x.toFixed(1)},${tr.z.toFixed(1)}`); }
      if (p.y === undefined) ok(Math.abs(L.groundY(p.x, p.z)) < 3, `${where}: ${id} off the ground`);
    }
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) { const [a, A, ra, pa] = boxes[i], [b, B, rb, pb] = boxes[j]; if (Math.abs(vbottom(ra, pa) - vbottom(rb, pb)) > 1.4) continue; ok(!sat(A, B), `${where}: ${a} hits ${b}`); }
    // people vs world and vehicles
    for (const [id] of Object.entries(S.peds)) {
      const p = Q[id]; if (!p.vis || p.seat) continue; const W = local(p.x, p.z);
      for (const c of W.c) ok(!(p.x > c.x0 - 0.25 && p.x < c.x1 + 0.25 && p.z > c.z0 - 0.25 && p.z < c.z1 + 0.25), `${where}: ${id} inside ${c.kind || 'collider'}`);
      for (const tr of W.t) ok(Math.hypot(p.x - tr.x, p.z - tr.z) > tr.r + 0.25, `${where}: ${id} in tree`);
      for (const [vid, B] of boxes) ok(!boxCircle(B, p.x, p.z, 0.3), `${where}: ${id} inside ${vid}`);
    }
    // camera: never inside a building / pole / trunk / car, never under the ground
    const c = s.cam(t, Q, k / N); const [cx, cy, cz] = c.p; camChecks++;
    ok(cy > L.groundY(cx, cz) + 0.1, `${where}: camera under ground`);
    const W = local(cx, cz);
    for (const q of W.c) if (cy < (q.h ?? 3) + 0.3) ok(!(cx > q.x0 - 0.2 && cx < q.x1 + 0.2 && cz > q.z0 - 0.2 && cz < q.z1 + 0.2), `${where}: camera inside ${q.kind || 'collider'} ${q.x0.toFixed(1)},${q.z0.toFixed(1)}`);
    for (const tr of W.t) if (cy < 3) ok(Math.hypot(cx - tr.x, cz - tr.z) > tr.r + 0.2, `${where}: camera in tree`);
    for (const [vid, B, rig, p] of boxes) if (cy < VTYPES[rig.type].hgt + (p.cy ?? 0) + 0.1) ok(!boxCircle(B, cx, cz, 0.2), `${where}: camera inside ${vid}`);
    ok(c.fov > 10 && c.fov < 90, `${where}: fov`);
  }
}
ok(frames > 2000, `frames checked ${frames}`);
{ // the obstacle checks themselves bite: a car parked into a known building / lamp / tree must be flagged
  const W = local(-350, 100), bld = W.c.find((c) => c.x1 > -348 && c.x0 < -347 && c.z0 < 100 && c.z1 > 100);
  ok(bld && sat(obb(-347.5, 100, 0, 2.4, 0.9), aabbBox(bld)), 'self-check: building collider found and hit');
  const lamp = local(-390, 0).c.find((c) => Math.abs((c.x0 + c.x1) / 2 + 390.4) < 0.5 && Math.abs((c.z0 + c.z1) / 2 - 1) < 0.6);
  ok(lamp && sat(obb(-390.4, 1, 0.3, 2.4, 0.9), aabbBox(lamp)), 'self-check: lamp post collider found and hit');
  const tr = local(-412, 20).t.find((q) => Math.hypot(q.x + 411.5, q.z - 19.8) < 0.5); ok(tr && boxCircle(obb(-411.5, 19.8, 0, 2.4, 0.9), tr.x, tr.z, tr.r), 'self-check: tree found and hit');
  console.log('self-check', !!bld, !!lamp, !!tr, 'colliders', cols.length, 'trees', trees.length);
}

// ---------------------------------------------------------------- choreography specifics
const C = P.scenes.C;
{ // the getaway car passes UNDER the airborne roadblock jeep (never through it), the jeep lands clear of the palm
  let minGap = 1e9; for (let t = P.tE; t < P.tE + 2.5; t += 0.01) { const q = posesAt(C, t); const h = q.hero, j = q.jeepA; const d = Math.hypot(h.x - (j.cx ?? j.x), h.z - (j.cz ?? j.z)); if (d < 4.5) minGap = Math.min(minGap, (j.cy ?? 0) - VTYPES.policejeep.hgt / 2 - VTYPES.praetor.hgt); }
  ok(minGap > 0.2, `hero clears the flying jeep (${minGap.toFixed(2)} m)`);
  const end = posesAt(C, 40).jeepA; ok(Math.hypot((end.cx ?? end.x) + 411.5, (end.cz ?? end.z) + 583.5) > 2.6, 'jeep wreck clear of the palm');
  const p1 = posesAt(C, 32).pol1, p2 = posesAt(C, 32).pol2; ok(p1.speed < 0.5 && p2.speed < 0.5, 'police stopped after the blast'); ok(p1.z > -571 && p2.z > -571, 'police stop short of the roadblock');
  let drift = 0; for (let t = 5; t < 8.5; t += 0.05) drift = Math.max(drift, Math.abs(posesAt(C, t).hero.slip)); ok(drift > 0.5, `drift angle ${(drift * 57.3).toFixed(0)} deg`);
  let vmax = 0; for (let t = 9; t < 27; t += 0.1) vmax = Math.max(vmax, posesAt(C, t).hero.speed); ok(vmax > 25 && vmax < 45, `chase speed ${vmax.toFixed(1)} m/s`);
}
// all three heroes appear in the crew scene and the ambush
for (const who of ['dineth', 'shashika', 'david']) { ok(P.scenes.B.peds[who], `${who} in the crew scene`); ok(Object.values(C.peds).some((r) => r.who === who), `${who} in the chase`); }

// ---------------------------------------------------------------- isolation from the game
const src = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const TR = src('src/story/Trailer.js') + src('src/story/TrailerScore.js') + src('src/story/TrailerPlan.js');
for (const w of ['localStorage', 'SaveSystem', 'saveTo(', 'Settings.set', 'story.state', 'indexedDB', 'startMission']) ok(!TR.includes(w), `trailer must not touch ${w}`);
const G = src('src/Game.js'); ok(G.includes("import('./story/Trailer.js')"), 'trailer is lazily imported'); ok(!/^import .*Trailer/m.test(G), 'no static trailer import in Game.js');
ok(!/from '\.\.?\/.*Trailer/.test(src('src/main.js')), 'main.js does not load the trailer');
const H = src('index.html'); ok(H.includes('id="gate-trailer"') && H.includes('WATCH TRAILER') && H.includes('__sdsTrailer'), 'gate WATCH TRAILER button');
ok(src('src/story/Trailer.js').includes('location.reload()'), 'trailer returns to the gate by reloading');

console.log(`trailer-test: ${pass} passed, ${fail} failed · ${frames} on-screen frames, ${camChecks} camera positions checked`);
if (fail) { console.log(bad.join('\n')); process.exit(1); }
