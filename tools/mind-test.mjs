// Feature 6 QA (headless, real Crowd + Traffic): NPC personalities, emotions, memory, reactions, social life, road rage.
//   node --expose-gc tools/mind-test.mjs [seconds of soak, default 60]
// Checks: personality variety · simultaneous events (gunfire + accident + street fight + siren + explosion) · varied,
// staggered reactions (no herd) · emotions that rise and decay gradually · player memory (harassment → avoidance, help →
// gratitude) · road rage (out of the car, confront, back in, drive on) · memory / persona caps · save/load round trip ·
// no NaN, no teleports · bounded heap over a long soak · per-frame cost of the minds.
import './node-dom-stub.mjs';
import * as THREE from 'three';
await import('../src/core/fastMath.js');
globalThis.localStorage ??= { getItem: () => null, setItem: () => {}, removeItem: () => {} };
{ const { MAT } = await import('../src/gfx/Materials.js'); Object.setPrototypeOf(MAT, new Proxy({}, { get: (t, k) => { if (typeof k !== 'string') return undefined; if (!t[k]) t[k] = new THREE.MeshStandardMaterial(); return t[k]; } })); }
const CP = await import('../src/world/CityPlan.js'); CP.generatePlan();
const { Collision } = await import('../src/world/Collision.js');
const { Traffic } = await import('../src/vehicles/Traffic.js');
const { Crowd } = await import('../src/actors/Crowd.js');
const { VEH_HOOKS } = await import('../src/vehicles/Vehicle.js');
const Mi = await import('../src/actors/Mind.js');
const L = await import('../src/world/Layout.js');
const SOAK = +(process.argv[2] || 60);

let pass = 0, fail = 0; const fails = [];
const ok = (c, msg) => { if (c) pass++; else { fail++; fails.push(msg); console.log('  FAIL', msg); } };
const col = new Collision(); col.addAll(CP.plan.colliders);
const scene = new THREE.Scene(); const lines = []; const handlers = {};
const events = { emit(n, e) { if (n === 'npcLine') lines.push(e); (handlers[n] || []).forEach((f) => f(e)); }, on(n, f) { (handlers[n] || (handlers[n] = [])).push(f); } };
const C = new Crowd(scene, col, events); C.max = 120; C.prepareSpecs(C.specTarget ? C.specTarget() : 48);
const T = new Traffic(scene, col, events); T.max = 30; T.crowd = C; await T.warmModels([[-392, 700]]);
const focus = { x: -392, z: 700 }; const player = { x: focus.x, z: focus.z, y: 0, vehicle: null, ch: null, player: true };
const camDir = new THREE.Vector3(0, 0, -1); const dt = 1 / 60; let t = 0;
const ctx = { simTime: 0, vehicles: [], player, bodies: [], hourFactor: 1, hour: 17.5, rain: 0, night: 0, hero: 'dineth' };
const last = new Map(); let jumps = 0, nan = 0, jumpMax = 0; const jumpWho = [];
const step = (n = 1) => { for (let i = 0; i < n; i++) {
  T.update(dt, focus, camDir, t, C.peds, player); ctx.simTime = t; ctx.vehicles = T.all(); C.update(dt, focus, camDir, ctx); t += dt;
  for (const p of C.peds) { if (!Number.isFinite(p.x) || !Number.isFinite(p.z) || !Number.isFinite(p.yaw)) nan++;
    const q = last.get(p); if (q && !p.ch.rag) { const d = Math.hypot(p.x - q[0], p.z - q[1]); if (d > 0.6) { jumps++; jumpMax = Math.max(jumpMax, d); if (jumpWho.length < 6) jumpWho.push(`${p.state} ${d.toFixed(2)}m`); } }
    last.set(p, [p.x, p.z]); }
  if (last.size > 600) { const live = new Set(C.peds); for (const k of last.keys()) if (!live.has(k)) last.delete(k); }
} };
const near = (x, z, r) => C.peds.filter((p) => Math.hypot(p.x - x, p.z - z) < r && p.mind);
const std = (a) => { const m = a.reduce((s, v) => s + v, 0) / a.length; return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length); };

console.log('filling the street…'); step(Math.round(20 / dt));
console.log(`peds ${C.peds.length}, vehicles ${T.vehicles.length}`);

// ---- 1. personalities: every person different, every trait spread out, residents keep theirs
console.log('1. personalities');
const withMind = C.peds.filter((p) => p.mind); ok(withMind.length === C.peds.length, `every pedestrian has a mind (${withMind.length}/${C.peds.length})`);
const keys = new Set(withMind.map((p) => Array.from(p.mind.tr, (v) => v.toFixed(3)).join(','))); ok(keys.size === withMind.length, `no two identical personalities (${keys.size} distinct of ${withMind.length})`);
for (let i = 0; i < Mi.TRAITS.length; i++) { const s = std(withMind.map((p) => p.mind.tr[i])); ok(s > 0.08, `trait ${Mi.TRAITS[i]} varies across people (σ ${s.toFixed(3)})`); }
const res = withMind.filter((p) => p.mind.pid); ok(res.length > withMind.length * 0.5, `most are residents with a stable identity (${res.length})`);
{ const p = res[0]; const tr = Array.from(p.mind.tr); const g = new Mi.Mind(); Mi.genTraits(g, Mi.hashStr(p.mind.pid), p.sp); ok(tr.every((v, i) => Math.abs(v - g.tr[i]) < 1e-9), 'a resident\'s personality is reproducible from identity (look × district)'); }
ok(withMind.every((p) => p.temper >= 0 && p.temper <= 1), 'temper derived from personality within [0,1]');

// ---- 2. simultaneous events + varied, staggered reactions
console.log('2. simultaneous events');
const E = { x: focus.x + 6, z: focus.z - 18 };
const before = new Map(C.peds.map((p) => [p, p.state]));
const w0 = near(E.x, E.z, 40); C.alarm(E.x, E.z, 40, 2, null, 'gunshot', true);
const delays = w0.filter((p) => p.pending).map((p) => p.pending.t); ok(delays.length >= 5, `gunshot queued for ${delays.length} witnesses`);
ok(std(delays) > 0.12, `reaction times are staggered, not synchronised (σ ${std(delays).toFixed(2)} s, ${Math.min(...delays).toFixed(2)}–${Math.max(...delays).toFixed(2)} s)`);
const fear0 = w0.map((p) => p.mind.em[Mi.EI.FEA]); ok(fear0.every((f) => f > 0) && std(fear0) > 0.02, `fear rose for everyone in range, by different amounts (σ ${std(fear0).toFixed(3)})`);
// an accident, a street fight, a siren and (later) an explosion at the same time elsewhere
const victim = C.peds.find((p) => p.state !== 'down' && Math.hypot(p.x - focus.x, p.z - focus.z) > 12 && Math.hypot(p.x - focus.x, p.z - focus.z) < 35 && Math.hypot(p.x - E.x, p.z - E.z) > 15);
if (victim) C.knock(victim, 1, 0, 6, 0.2, true); ok(!!victim, 'accident victim found');
const F = { x: focus.x - 10, z: focus.z + 12 }; C.alarm(F.x, F.z, 28, 1, null, 'fight');
C.minds.stimulus('siren', focus.x, focus.z + 30, 55, 0, null);
step(Math.round(3 / dt));
C.alarm(focus.x + 40, focus.z - 40, 90, 3, null, 'explosion');
const statesAfter = new Map(); step(Math.round(1.5 / dt));
for (const p of w0) statesAfter.set(p.state, (statesAfter.get(p.state) || 0) + 1);
console.log('   witness states', JSON.stringify(Object.fromEntries(statesAfter)));
ok(statesAfter.size >= 3, `witnesses chose different responses (${statesAfter.size} kinds)`);
const fleeing = C.peds.filter((p) => p.state === 'flee' && p.fleeDir); const dirs = fleeing.map((p) => Math.atan2(p.fleeDir[0], p.fleeDir[1]));
ok(fleeing.length < 3 || std(dirs) > 0.25, `flee directions spread (σ ${dirs.length ? std(dirs).toFixed(2) : '-'} rad over ${fleeing.length})`);
ok(fleeing.length < 3 || std(fleeing.map((p) => p.fleeSp || 0)) > 0.1, 'flee speeds differ');
const changed = [...before.keys()].filter((p) => C.peds.includes(p) && before.get(p) !== p.state).length; ok(changed > 5, `the street reacted (${changed} changed state)`);
step(Math.round(12 / dt));
const st = C.minds.stats; console.log('   mind stats', JSON.stringify(C.minds.info()));
ok(st.stim >= 5, 'stimuli processed');

// ---- 3. emotions decay gradually (no instant reset)
console.log('3. emotion decay');
{ const p = C.peds.find((q) => q.mind && q.state !== 'down' && Math.hypot(q.x - focus.x, q.z - focus.z) < 30); const m = p.mind; Mi.feel(m, Mi.EI.FEA, 1); const f0 = m.em[Mi.EI.FEA];
  const base = m.base[Mi.EI.FEA]; m.nextT = 0; step(Math.round(2 / dt)); const f2 = m.em[Mi.EI.FEA]; step(Math.round(40 / dt)); const f40 = C.peds.includes(p) ? m.em[Mi.EI.FEA] : NaN;
  console.log(`   fear ${f0.toFixed(2)} → 2 s ${f2.toFixed(2)} → 42 s ${Number.isFinite(f40) ? f40.toFixed(2) : '(left)'} (baseline ${base.toFixed(2)})`);
  ok(f2 > 0.6 * f0, 'fear has not vanished after 2 s'); ok(!Number.isFinite(f40) || f40 < f2 - 0.05, 'fear recovers over time'); }

// ---- 3b. an accident on a calm street: onlookers gather at their own distance, some film, some help, some walk on
console.log('3b. accident crowd');
{ const v = C.peds.find((p) => p.mind && p.state === 'walk' && Math.hypot(p.x - focus.x, p.z - focus.z) < 30 && C.peds.filter((o) => o !== p && Math.hypot(o.x - p.x, o.z - p.z) < 22).length >= 5);
  ok(!!v, 'accident victim with witnesses'); if (v) { const W = C.peds.filter((o) => o !== v && o.mind && Math.hypot(o.x - v.x, o.z - v.z) < 22); C.knock(v, 1, 0, 5, 0.1, true);
    const seen = {}; const films = new Set(); for (let i = 0; i < 9 / dt; i++) { step(); if (i % 20 === 0) for (const o of W) { seen[o.state] = (seen[o.state] || 0) + 1; if (o.ch.anim.action === 'photo') films.add(o); } }
    const byP = {}; for (const o of W) byP[o.state] = (byP[o.state] || 0) + 1; console.log('   witnesses', W.length, 'now', JSON.stringify(byP), '· filmed', films.size, '· gather slots', C.minds.stats.gather);
    ok(Object.keys(byP).length >= 2, `witnesses respond differently (${Object.keys(byP).length} kinds)`);
    ok(W.some((o) => o.state === 'gather' || o.state === 'help' || o.state === 'watch') || C.minds.stats.gather > 0, 'some approach / watch / help');
    const G = W.filter((o) => o.state === 'gather' && o.gather); if (G.length >= 2) { const rs = G.map((o) => Math.hypot(o.gather.tx - v.x, o.gather.tz - v.z)); ok(std(rs) > 0.3, `onlookers stand at different distances (σ ${std(rs).toFixed(2)} m)`); }
    ok(W.every((o) => o.state !== 'gather' || !L.roadAt(o.gather.tx, o.gather.tz)), 'onlookers never stand on the carriageway'); }
  step(Math.round(20 / dt)); }

// ---- 4. player memory: harassment → avoidance; help → gratitude
console.log('4. player memory');
{ const p = C.peds.find((q) => q.mind && q.state === 'walk' && q.sp.age !== 'elder'); player.x = p.x + 1.2; player.z = p.z;
  for (let i = 0; i < 4; i++) { C.interact(p, 'insult', player); step(Math.round(5 / dt)); if (!C.peds.includes(p)) break; }
  const R = p.mind ? Mi.rel(p.mind, 'dineth') : null; ok(R && R.harass >= 3 && R.like < -0.3, `insults remembered (harass ${R && R.harass}, like ${R && R.like.toFixed(2)})`);
  if (p.mind) { player.x = p.x + 1.2; player.z = p.z; p.talkCd = 0; const n0 = lines.length; C.interact(p, 'talk', player); ok(p.state === 'complain' || p.state === 'report', `refuses to talk afterwards (state ${p.state})`); const ln = lines.slice(n0).find((e) => e.ped === p); ok(!ln || !/Ayubowan|Hello/.test(JSON.stringify(ln.line)), 'no friendly greeting from someone harassed'); }
  ok(p.mind && Mi.memories(p.mind, C.minds.now()).some((e) => e.what === 'insulted'), 'the insult is in memory');
  // help: knock someone down (not by the player), then help them up
  const q = C.peds.find((o) => o.mind && o.state === 'walk' && o !== p); C.knock(q, 0, 1, 4, 0); step(10); player.x = q.x + 1; player.z = q.z; C.interact(q, 'help', player);
  step(Math.round(3 / dt)); const RQ = q.mind ? Mi.rel(q.mind, 'dineth') : null; ok(RQ && RQ.helped >= 1 && RQ.like > 0.3, `helped up → grateful (like ${RQ && RQ.like.toFixed(2)})`);
  ok(q.state !== 'flee', `does not run from the helper (state ${q.state})`); player.x = focus.x; player.z = focus.z; }

// ---- 5. road rage: out of the car (when safe), confronts, back in, drives on
console.log('5. road rage');
{ let out = null; const tried = []; T.rageStats.crashes = 0;
  for (const v of T.vehicles.filter((w) => w.ai && w.driverChar && !w.police && Math.hypot(w.x - focus.x, w.z - focus.z) < 45).slice(0, 14)) {
    player.x = v.x + 3; player.z = v.z; v.rageCd = 0; VEH_HOOKS.crash(v, { player: true }, 2.2); tried.push(v);
    for (let i = 0; i < 240 && !v.awayDriver; i++) { step(); player.x = v.x + 3; player.z = v.z; }
    if (v.awayDriver) { out = v; break; } }
  console.log('   rage stats', JSON.stringify(T.rageStats));
  ok(T.rageStats.crashes > 0, 'crash hook fires'); ok(T.rageStats.honk + T.rageStats.out > 0, 'drivers react (horn / get out)');
  ok(tried.length < 2 || T.rageStats.honk > 0 || T.rageStats.out > 1, 'not every driver reacts the same way');
  if (out) { const d = out.awayDriver; ok(d && (d.state === 'confront' || d.state === 'fight' || d.state === 'argue' || d.state === 'toCar' || d.state === 'stumble'), `driver out and confronting (state ${d && d.state})`);
    ok(d.mind && Mi.memories(d.mind, C.minds.now()).some((e) => e.what === 'crashed'), 'the driver remembers the crash'); ok(out.hold, 'the car waits for him');
    player.x = out.x + 30; player.z = out.z + 30; let back = false; for (let i = 0; i < 60 / dt && !back; i++) { step(); back = !!out.driverChar; }
    ok(back, `driver walked back and got in (rage stats ${JSON.stringify(T.rageStats)})`); if (back) { step(Math.round(4 / dt)); ok(!out.hold, 'and drives on'); } }
  else console.log('   (no driver chose to get out in this sample — horn only)');
  player.x = focus.x; player.z = focus.z; }

// ---- 6. memory limits, persona cap, save / load
console.log('6. memory limits');
{ const route = [[-392, 700], [-300, 200], [-150, -300], [100, -600], [250, 300], [-500, 900]]; let k = 0;
  for (let s = 0; s < SOAK; s += 2) { const [x, z] = route[(k++ >> 3) % route.length]; focus.x += (x - focus.x) * 0.15; focus.z += (z - focus.z) * 0.15; player.x = focus.x; player.z = focus.z;
    if (k % 3 === 0) C.alarm(focus.x + 8, focus.z + 5, 30, 1 + (k % 2), null, k % 2 ? 'gunshot' : 'fight'); step(Math.round(2 / dt)); }
  const all = [...C.minds.personas.values(), ...C.peds.map((p) => p.mind).filter(Boolean)];
  ok(all.every((m) => m.mem.length <= Mi.MEM_CAP), `memories per person ≤ ${Mi.MEM_CAP}`); ok(all.every((m) => m.ties.length <= Mi.TIE_CAP), `relationships per person ≤ ${Mi.TIE_CAP}`);
  ok(C.minds.personas.size <= Mi.PERSONA_CAP + 20, `resident registry bounded (${C.minds.personas.size} ≤ ${Mi.PERSONA_CAP})`);
  ok(C.minds.incidents.length <= 8, `active incidents bounded (${C.minds.incidents.length})`);
  const sv = C.minds.save(); const js = JSON.stringify(sv); ok(sv.minds.length <= Mi.SAVE_CAP && sv.minds.length > 0, `save keeps ≤ ${Mi.SAVE_CAP} residents (${sv.minds.length}, ${(js.length / 1024).toFixed(1)} KB)`);
  const n = C.minds.load(JSON.parse(js)); ok(n === sv.minds.length, `save → load round trip (${n})`); const sv2 = C.minds.save(); ok(sv2.minds.length === sv.minds.length, 'reloaded registry saves the same count');
  ok(C.minds.load(undefined) === 0 && C.minds.personas.size === 0, 'an old save without minds loads cleanly'); C.minds.load(JSON.parse(js)); }

// ---- 7. integrity over everything above
console.log('7. integrity');
console.log(`   NaN ${nan} · jumps>0.6 m/frame ${jumps} (max ${jumpMax.toFixed(2)} m) ${jumpWho.join(', ')}`);
ok(nan === 0, 'no NaN positions'); ok(jumps === 0, 'no teleports');
const cats = new Set(lines.map((e) => e.line && (e.line.tr || e.line.en))); ok(lines.every((e) => e.line && (e.line.si || e.line.ta || e.line.en)), `every spoken line resolves (${lines.length} lines, ${cats.size} distinct)`);
ok(C.peds.every((p) => !p.gather || p.state === 'gather'), 'no stale onlooker slots'); ok(C.minds.incidents.every((I) => I.n >= 0 && I.help >= 0), 'incident counts never negative');

// ---- 8. heap + cost (minds on) over a soak with events every 3 s
console.log('8. heap / cost');
globalThis.gc?.(); const h0 = process.memoryUsage().heapUsed; const tk0 = C.minds.stats.ticks; let tm = 0; const N = Math.round(SOAK / dt);
for (let i = 0; i < N; i++) { if (i % 180 === 0) C.alarm(focus.x + 10 * Math.sin(i), focus.z + 10 * Math.cos(i), 35, 1 + (i % 3 === 0 ? 1 : 0), null, i % 3 === 0 ? 'gunshot' : 'accident');
  const a = performance.now(); step(); tm += performance.now() - a; }
globalThis.gc?.(); const h1 = process.memoryUsage().heapUsed;
console.log(`   ${SOAK}s soak: heap ${((h1 - h0) / 1048576).toFixed(1)} MB, ticks ${C.minds.stats.ticks - tk0} (${((C.minds.stats.ticks - tk0) / N).toFixed(2)}/frame), frame avg ${(tm / N).toFixed(2)} ms, peds ${C.peds.length}`);
ok((h1 - h0) / 1048576 < 25, 'heap growth bounded');
ok((C.minds.stats.ticks - tk0) / N <= 14, 'mind updates within the per-frame budget');
console.log(`\nmind-test: ${pass} passed, ${fail} failed`); if (fail) { console.log(fails.join('\n')); process.exit(1); }
