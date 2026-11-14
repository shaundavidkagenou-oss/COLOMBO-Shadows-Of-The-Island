// Second-trailer test (node): checks the OFFICIAL CINEMATIC TRAILER's edit (src/story/CinePlan.js) against the real city
// plan, frame by frame, for every frame that is on screen — no camera, car, helicopter or actor inside a building, pole,
// tree or another car; the timeline is exactly 2:26, gap-free, monotonic, cut on the beat; every act is present with what
// the brief asks of it; and the trailer cannot touch the game (no saves / settings / story, lazily loaded from the gate).
import './node-dom-stub.mjs';
import fs from 'node:fs';
globalThis.localStorage ??= { getItem: () => null, setItem: () => {}, removeItem: () => {} };
globalThis.addEventListener ??= () => {};
const CP = await import('../src/world/CityPlan.js');
const L = await import('../src/world/Layout.js');
const { VTYPES } = await import('../src/vehicles/VehicleModels.js');
const { crownPoints } = await import('../src/world/TreeShapes.js');
const { buildPlan, posesAt, blackAt, LENGTH, BEAT, ACTS } = await import('../src/story/CinePlan.js');

let pass = 0, fail = 0; const bad = [];
const ok = (c, msg) => { if (c) pass++; else { fail++; bad.push(msg); } };
const plan = CP.generatePlan();
const P = buildPlan();

// ---------------------------------------------------------------- timeline: exactly 146 s, gap-free, on the beat
ok(LENGTH === 146 && P.LENGTH === 146, 'length is exactly 2:26 (146 s)');
let tEnd = 0;
for (let i = 0; i < P.shots.length; i++) {
  const s = P.shots[i], n = P.shots[i + 1];
  ok(s.dur >= 1.2 - 1e-9, `shot ${s.name} too short`);
  if (n) ok(Math.abs(n.start - (s.start + s.dur)) < 1e-6, `gap / overlap after ${s.name}`);
  ok(Math.abs(s.start / BEAT - Math.round(s.start / BEAT)) < 1e-6, `${s.name} cut on the beat (${s.start})`);
  let prev = -1e9; for (let k = 0; k <= 200; k++) { const t = s.simAt(s.dur * k / 200); ok(t >= prev - 1e-9, `${s.name} sim time goes backwards`); prev = t; }
  ok(P.scenes[s.scene], `${s.name} unknown scene`); tEnd = Math.max(tEnd, s.start + s.dur);
}
ok(P.shots[0].start === 0, 'starts at 0'); ok(Math.abs(tEnd - 136) < 1e-6, `picture runs to the reveal (${tEnd})`);
for (let e = 136.0; e <= 146; e += 0.05) ok(blackAt(P, e) > 0.999, `reveal is on black (${e.toFixed(2)})`);
ok(blackAt(P, 0.5) > 0.999, 'opens on black');
for (const t of P.texts) ok(t.a >= 0 && t.b <= LENGTH && t.b > t.a, `text ${t.text || t.kind} range`);
const txt = (k) => P.texts.find((t) => t.kind === k);
ok(txt('cityTitle') && txt('cityTitle').text === 'COLOMBO' && txt('cityTitle').b < 25, 'Act I: "COLOMBO"');
ok(txt('tagline') && txt('tagline').text === 'A CITY WITH A THOUSAND STORIES' && txt('tagline').a > txt('cityTitle').b && txt('tagline').b <= 25, 'Act I: the tagline after the title');
ok(txt('title') && txt('title').a >= 136 && txt('studio') && txt('studio').text === 'SHAUN DAVID STUDIOS' && txt('studio').a > txt('title').b && txt('studio').b < 146, 'Act VI: title, then the studio');
// acts: boundaries and content
ok(JSON.stringify(ACTS.map((a) => a[1])) === JSON.stringify([0, 25, 55, 85, 115, 136]), 'act boundaries');
const inAct = (i) => P.shots.filter((s) => s.act === i);
for (let i = 0; i < 5; i++) ok(inAct(i).length >= 4, `act ${i + 1} has shots`);
ok(inAct(4).length === 8, `the finale is eight shots (${inAct(4).length})`);
const names = P.shots.map((s) => s.name).join('|');
for (const w of ['lotus', 'sea', 'pettah', 'street customs', 'train', 'buddha', 'inside', 'keeper', 'reaction', 'liftoff', 'heli', 'searchlight', 'police', 'best shot']) ok(names.includes(w), `a shot of: ${w}`);
// no repeated footage: no two shots show the same scene at overlapping sim time from (nearly) the same camera
for (let i = 0; i < P.shots.length; i++) for (let j = i + 1; j < P.shots.length; j++) {
  const a = P.shots[i], b = P.shots[j]; if (a.scene !== b.scene) continue; const ov = Math.min(a.t0 + a.simLen, b.t0 + b.simLen) - Math.max(a.t0, b.t0); if (ov <= 0) continue;
  const t = Math.max(a.t0, b.t0) + ov / 2, Q = posesAt(P.scenes[a.scene], t); const ca = a.cam(t, Q, 0.5), cb = b.cam(t, Q, 0.5);
  ok(Math.hypot(ca.p[0] - cb.p[0], ca.p[1] - cb.p[1], ca.p[2] - cb.p[2]) > 4, `repeated footage: ${a.name} / ${b.name}`);
}
// night acts are night, Act I/II are day
for (const s of P.shots) { const h = P.scenes[s.scene].env.hour; if (s.act >= 2) ok(h > 19.5 || h < 5, `${s.name} is a night shot`); else ok(h > 6 && h < 19.2, `${s.name} is a day / dusk shot`); }

// ---------------------------------------------------------------- world obstacles
const cols = plan.colliders.filter((c) => (c.h ?? 3) >= 0.25);
const trees = plan.trees.map((t) => ({ x: t.x, z: t.z, r: 0.32 * (t.s || 1), t }));
const crownCache = new Map();
const crownWorld = (t) => { if (crownCache.has(t)) return crownCache.get(t); const Q = crownPoints(t.type); const out = []; if (Q) { const c = Math.cos(t.yaw || 0), sn = Math.sin(t.yaw || 0), hs = (t.s || 1) * (t.sq || 1), vs = (t.s || 1) * (t.sy || 1); for (let i = 0; i < Q.length; i += 3) { const lx = Q[i] * hs, ly = Q[i + 1] * vs, lz = Q[i + 2] * hs; out.push(t.x + lx * c + lz * sn, ly, t.z - lx * sn + lz * c); } } const a = new Float32Array(out); crownCache.set(t, a); return a; };
const foliageAtLens = (p, l, fov, list) => { const dx = l[0] - p[0], dy = l[1] - p[1], dz = l[2] - p[2], dl = Math.hypot(dx, dy, dz) || 1; const cosH = Math.cos(Math.min(1.2, (fov * Math.PI / 180) * 0.95));
  for (const tr of list) { if (Math.hypot(tr.x - p[0], tr.z - p[2]) > 16) continue; const W = crownWorld(tr.t); for (let i = 0; i < W.length; i += 3) { const vx = W[i] - p[0], vy = W[i + 1] - p[1], vz = W[i + 2] - p[2]; const d = Math.hypot(vx, vy, vz); if (d < 1.0) return `${tr.t.type} ${tr.x.toFixed(1)},${tr.z.toFixed(1)} at ${d.toFixed(2)} m`; if (d < 4.5 && (vx * dx + vy * dy + vz * dz) / (d * dl) > cosH) return `${tr.t.type} ${tr.x.toFixed(1)},${tr.z.toFixed(1)} in view at ${d.toFixed(2)} m`; } } return null; };
const near = (list, x, z, R) => list.filter((c) => (c.x0 !== undefined ? c.x1 > x - R && c.x0 < x + R && c.z1 > z - R && c.z0 < z + R : Math.abs(c.x - x) < R && Math.abs(c.z - z) < R));
const cache = new Map();
const local = (x, z) => { const k = Math.round(x / 40) + ':' + Math.round(z / 40); if (!cache.has(k)) cache.set(k, { c: near(cols, Math.round(x / 40) * 40, Math.round(z / 40) * 40, 60), t: near(trees, Math.round(x / 40) * 40, Math.round(z / 40) * 40, 60) }); return cache.get(k); };
const obb = (x, z, yaw, hl, hw) => { const fx = Math.sin(yaw), fz = Math.cos(yaw); return { x, z, ax: [[fx, fz], [fz, -fx]], h: [hl, hw] }; };
const corners = (o) => { const r = []; for (const a of [-1, 1]) for (const b of [-1, 1]) r.push([o.x + o.ax[0][0] * o.h[0] * a + o.ax[1][0] * o.h[1] * b, o.z + o.ax[0][1] * o.h[0] * a + o.ax[1][1] * o.h[1] * b]); return r; };
const sat = (A, B) => { for (const ax of [[1, 0], [0, 1], ...A.ax, ...B.ax]) { const pa = corners(A).map((p) => p[0] * ax[0] + p[1] * ax[1]), pb = corners(B).map((p) => p[0] * ax[0] + p[1] * ax[1]); if (Math.max(...pa) < Math.min(...pb) || Math.max(...pb) < Math.min(...pa)) return false; } return true; };
const aabbBox = (c) => ({ x: (c.x0 + c.x1) / 2, z: (c.z0 + c.z1) / 2, ax: [[1, 0], [0, 1]], h: [(c.x1 - c.x0) / 2, (c.z1 - c.z0) / 2] });
const boxCircle = (o, x, z, r) => { const dx = x - o.x, dz = z - o.z; const u = dx * o.ax[0][0] + dz * o.ax[0][1], v = dx * o.ax[1][0] + dz * o.ax[1][1]; const qu = Math.max(-o.h[0], Math.min(o.h[0], u)), qv = Math.max(-o.h[1], Math.min(o.h[1], v)); return (u - qu) ** 2 + (v - qv) ** 2 < r * r; };
const vbox = (rig, p) => { const T = VTYPES[rig.type]; return obb(p.cx ?? p.x, p.cz ?? p.z, p.yaw, T.len / 2 - 0.05, T.wid / 2 - 0.03); };
// the walk-in jewellery store: inside its room (and its doorway) the building's shell colliders do not apply — the room's own
// furniture does (local frame → world: (53.03 + lx, −747.1 + lz); the room is x −3.5…3.5, z −9.72…−0.24, the door at z 0)
const RB = { x0: -3.5, x1: 3.5, z0: -9.72, z1: 1.3 }; const ROBS = [[-1.92, 0.72, -8.44, -7.8], [-3.27, -2.63, -6.89, -3.65], [2.59, 3.31, -9.61, -8.93], [1.69, 2.41, -3.12, -0.21], [2.05, 3.5, -3.2, -3.04]];
const inRoom = (x, z, m = 0) => { const lx = x - 53.03, lz = z + 747.1; return lx > RB.x0 + m && lx < RB.x1 - m && lz > RB.z0 + m && lz < (lz > -0.3 ? 1.3 : RB.z1) && (lz < -0.3 || Math.abs(lx) < 0.75); };
const inRoomBox = (x, z) => { const lx = x - 53.03, lz = z + 747.1; return lx > -3.5 && lx < 3.5 && lz > -9.72 && lz < 0.05; };
const roomHit = (x, z, r) => { const lx = x - 53.03, lz = z + 747.1; if (lx < RB.x0 + r || lx > RB.x1 - r || lz < RB.z0 + r) return 'room wall'; for (const o of ROBS) if (lx > o[0] - r && lx < o[1] + r && lz > o[2] - r && lz < o[3] + r) return 'room furniture'; return null; };

let frames = 0, camChecks = 0;
for (const s of P.shots) {
  const S = P.scenes[s.scene]; const N = Math.max(30, Math.ceil(s.dur * 30));
  for (let k = 0; k <= N; k++) {
    const le = s.dur * k / N, e = s.start + le; if (blackAt(P, e) > 0.98) continue;
    const t = s.simAt(le), Q = posesAt(S, t); frames++;
    const where = `${s.name} e${e.toFixed(2)} t${t.toFixed(2)}`;
    const boxes = [];
    for (const [id, rig] of Object.entries(S.rigs)) {
      const p = Q[id]; if (p.vis === false) continue; const B = vbox(rig, p); boxes.push([id, B, rig, p]); const W = local(B.x, B.z);
      for (const c of W.c) ok(!sat(B, aabbBox(c)), `${where}: ${id} hits ${c.kind || 'collider'} ${((c.x0 + c.x1) / 2).toFixed(1)},${((c.z0 + c.z1) / 2).toFixed(1)}`);
      for (const tr of W.t) ok(!boxCircle(B, tr.x, tr.z, tr.r), `${where}: ${id} hits tree ${tr.x.toFixed(1)},${tr.z.toFixed(1)}`);
      ok(L.roadAt(p.x, p.z) || L.customsSurfaceAt?.(p.x, p.z) != null || (S.id === 'CU'), `${where}: ${id} off the road (${p.x.toFixed(1)}, ${p.z.toFixed(1)})`);
    }
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) { const [a, A] = boxes[i], [b, B] = boxes[j]; ok(!sat(A, B), `${where}: ${a} hits ${b}`); }
    for (const [id] of Object.entries(S.peds)) {
      const p = Q[id]; if (!p.vis || p.seat) continue;
      if (S.rob && inRoom(p.x, p.z)) { const h = roomHit(p.x, p.z, 0.22); ok(!h, `${where}: ${id} in the ${h}`); continue; }
      const W = local(p.x, p.z);
      for (const c of W.c) ok(!(p.x > c.x0 - 0.25 && p.x < c.x1 + 0.25 && p.z > c.z0 - 0.25 && p.z < c.z1 + 0.25), `${where}: ${id} inside ${c.kind || 'collider'} ${c.x0.toFixed(1)},${c.z0.toFixed(1)}`);
      for (const tr of W.t) ok(Math.hypot(p.x - tr.x, p.z - tr.z) > tr.r + 0.25, `${where}: ${id} in tree`);
      for (const [vid, B] of boxes) ok(!boxCircle(B, p.x, p.z, 0.3), `${where}: ${id} inside ${vid}`);
    }
    // the helicopter: clear of every roof and object under its rotor (except standing on the HQ pad)
    if (Q.heli) { const h = Q.heli; const onPad = Math.hypot(h.x + 9, h.z + 194) < 6 && h.y >= 16.5; /* standing on / climbing straight up off the helipad */ if (!onPad) { let top = -10; for (const c of near(cols, h.x, h.z, 7)) if (c.x1 > h.x - 6.5 && c.x0 < h.x + 6.5 && c.z1 > h.z - 6.5 && c.z0 < h.z + 6.5) top = Math.max(top, c.h ?? 3); if (Math.hypot(h.x + 9, h.z + 194) < 40) top = Math.max(top, 17.6); if (Math.hypot(h.x - 305, h.z + 480) < 36) top = 400; ok(h.y - top > 3, `${where}: helicopter ${h.y.toFixed(1)} m over ${top.toFixed(1)} m`); } }
    // camera: never inside a building / pole / trunk / car / the helicopter; inside the store, inside its room
    const c = s.cam(t, Q, k / N); const [cx, cy, cz] = c.p; camChecks++;
    ok(cy > L.groundY(cx, cz) + 0.1, `${where}: camera under ground`);
    if (S.rob && inRoomBox(cx, cz)) { const h = roomHit(cx, cz, 0.15); ok(!h && cy < 3.1, `${where}: camera in the ${h || 'ceiling'}`); }
    else {
      const W = local(cx, cz);
      for (const q of W.c) if (cy < (q.h ?? 3) + 0.3) ok(!(cx > q.x0 - 0.2 && cx < q.x1 + 0.2 && cz > q.z0 - 0.2 && cz < q.z1 + 0.2), `${where}: camera inside ${q.kind || 'collider'} ${q.x0.toFixed(1)},${q.z0.toFixed(1)} h${(q.h ?? 3).toFixed(1)}`);
      for (const tr of W.t) if (cy < 3) ok(Math.hypot(cx - tr.x, cz - tr.z) > tr.r + 0.2, `${where}: camera in tree`);
      const hit = foliageAtLens(c.p, c.l, c.fov || 45, W.t); ok(!hit, `${where}: leaves at the lens (${hit})`);
    }
    for (const [vid, B, rig, p] of boxes) if (cy < VTYPES[rig.type].hgt + 0.1) ok(!boxCircle(B, cx, cz, 0.25), `${where}: camera inside ${vid}`);
    if (Q.heli) ok(Math.hypot(cx - Q.heli.x, cy - Q.heli.y - 1.5, cz - Q.heli.z) > 7.5, `${where}: camera in the rotor`);
    ok(c.fov > 10 && c.fov < 90, `${where}: fov`);
  }
}
ok(frames > 3000, `frames checked ${frames}`);
// choreography specifics
{ const C = P.scenes.C; const kp = posesAt(C, 12).keeperPt; ok(kp && Math.hypot(kp.x - P.KEEP[0], kp.z - P.KEEP[1]) < 0.05, 'the keeper point is the store keeper');
  const car = posesAt(C, 10).crew; ok(car.speed < 0.2 && Math.abs(car.x - 58) < 0.5, 'the crew car waits outside the store');
  ok(P.scenes.C.rob.keeper.some(([, a]) => a === 'handsup'), 'the keeper puts his hands up');
  let vmax = 0; for (let t = 0; t < 22; t += 0.1) vmax = Math.max(vmax, posesAt(P.scenes.GF, t).crew.speed); ok(vmax > 25 && vmax < 45, `pursuit speed ${vmax.toFixed(1)} m/s`);
  const hp = posesAt(P.scenes.E, 2).heli, hq = posesAt(P.scenes.E, 12).heli; ok(Math.hypot(hp.x + 9, hp.z + 194) < 0.5 && hq.y > 35, 'the helicopter lifts off the HQ pad');
  const heliShots = P.shots.filter((s) => P.scenes[s.scene].heli && /heli|liftoff|searchlight|galle face wide/.test(s.name)); ok(heliShots.reduce((a, s) => a + s.dur, 0) >= 15, 'the helicopter gets a major cinematic moment (≥ 15 s)'); }

// ---------------------------------------------------------------- isolation from the game
const src = (p) => { try { return fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8'); } catch { ok(false, `missing ${p}`); return ''; } };
const TR = ['src/story/CineTrailer.js', 'src/story/CinePlan.js', 'src/story/CineScore.js', 'src/gfx/LensFX.js'].map(src).join('\n');
for (const w of ['localStorage', 'SaveSystem', 'saveTo(', 'Settings.set', 'story.state', 'indexedDB', 'startMission']) ok(!TR.includes(w), `second trailer must not touch ${w}`);
const G = src('src/Game.js'); ok(G.includes("import('./story/CineTrailer.js')"), 'second trailer is lazily imported'); ok(!/^import .*CineTrailer/m.test(G), 'no static import of the second trailer');
const H = src('index.html');
ok(H.includes('id="gate-trailer"') && H.includes('ORIGINAL TRAILER'), 'gate: the original trailer button (ORIGINAL TRAILER)');
ok(H.includes('id="gate-trailer2"') && H.includes('OFFICIAL CINEMATIC TRAILER'), 'gate: the second button (OFFICIAL CINEMATIC TRAILER)');
ok(/extends TrailerRuntime/.test(src('src/story/CineTrailer.js')) && /super\.finish\(\)/.test(src('src/story/CineTrailer.js')) && src('src/story/Trailer.js').includes('location.reload()'), 'second trailer returns to the gate by reloading (TrailerRuntime.finish)');

console.log(`trailer2-test: ${pass} passed, ${fail} failed · ${frames} on-screen frames, ${camChecks} camera positions checked`);
if (fail) { console.log(bad.join('\n')); process.exit(1); }
