// 73rd: the end / start of banking hours (BankShift.js), in Node (no street: the leavers walk off along the pavement, the
// arrivals walk in — the car / three-wheeler legs need the city and are covered by tools/bank-shift-shots.mjs in the browser).
// Checks: everyone on duty gets up (the counter officers' chairs roll back), says goodbye to a co-worker who answers, walks out
// through the staff door (its leaf swings open) and the front door, past the guard (goodnight both ways), never through a
// desk / wall / partition (every hall position clear of the static obstacles), never through each other; then the reverse:
// everyone walks back in, greets, and ends up seated (or standing at the supervisor's spot) where they started.
import './node-dom-stub.mjs';
const THREE = await import('three');
const M = await import('../src/gfx/Materials.js');
M.MAT.paint ||= new THREE.MeshStandardMaterial({ vertexColors: true }); M.MAT.emissive ||= new THREE.MeshBasicMaterial({ vertexColors: true });
const { buildBankInterior, BANK_ROOM } = await import('../src/world/BankInterior.js');
const { BankSound } = await import('../src/audio/BankAudio.js');
const { gridPath } = await import('../src/world/BankShift.js');
for (const f of ['ring', 'ringStop', 'handset', 'chair', 'say', 'step', 'beep']) BankSound[f] = () => 0;
let pass = 0, fail = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); c ? pass++ : fail++; };
const realTimeout = globalThis.setTimeout; globalThis.setTimeout = (f) => 0; // (talking faces: no timers in the test)
let T = 0; const subs = []; const game = { clock: 0, hud: { key: () => '[E]', subtitle: (w, t) => subs.push({ t: T, w, text: t }), notify: () => {} } };
const room = buildBankInterior(game, null); room.staffOn = () => true; const S = room.shift; const dt = 1 / 30;
const pl = { x: 5.0, z: -1.5, y: 0, yaw: Math.PI, inside: true };
const run = (sec, until) => { for (let i = 0; i < sec / dt; i++) { T += dt; game.clock = T; room.update(dt, pl); probe(); if (process.env.DBG && i % 150 === 0) console.log(T.toFixed(0), S.people.map((p) => `${p.role.slice(0, 6)}:${p.duty}${p.walker ? `@${p.walker.x.toFixed(1)},${p.walker.z.toFixed(1)} ${p.walker.phase} ${p.walker.cmd ? Object.keys(p.walker.cmd).filter((k) => k !== 't').join('/') : '-'}` : ''}`).join(' | ')); if (until && until()) return true; } return false; };
const homes = S.people.map((p) => p.ch.root.position.clone());
const ZF = -0.22, Z = (d) => ZF - d; const stat = room.obstacles.slice(0, room.obstacles.length); // static + dynamic (dyn are npc:true)
let bad = 0, badAt = '', close = 1e9, doorMax = 0, minZ = { }, maxZ = {}, wentOut = new Set();
const inObs = (x, z) => stat.some((o) => !o.npc && x > o.x0 + 0.02 && x < o.x1 - 0.02 && z > o.z0 + 0.02 && z < o.z1 - 0.02);
function probe() {
  const door = room.g.children.find((o) => o.name === 'bank-staff-door'); if (door) doorMax = Math.max(doorMax, Math.abs(door.rotation.y));
  const w = S.crew.filter((c) => c.on && c.x < 900); for (const c of w) { const p = c.staff; const near = (a) => a && Math.hypot(c.x - a[0], c.z - a[1]) < 0.75;
    if (c.phase === 'hall' && c.z > Z(8.3) && c.z < Z(0.6) && !near(p.seatP) && !near(p.standP) && !near(p.spotP) && inObs(c.x, c.z)) { bad++; badAt = `${p.role} at ${c.x.toFixed(2)},${c.z.toFixed(2)}`; }
    if (c.z > 0.3) wentOut.add(p); }
  for (let i = 0; i < w.length; i++) for (let j = i + 1; j < w.length; j++) { if (w[i].cmd && w[i].cmd.fn) continue; const d = Math.hypot(w[i].x - w[j].x, w[i].z - w[j].z); if (w[i].cmd && w[i].cmd.walk && w[j].cmd && w[j].cmd.walk) close = Math.min(close, d); }
}
run(1);
ok(S.people.every((p) => p.duty === 'on' && p.ch.root.visible), `during banking hours all ${S.people.length} staff are at work`);
// ---- a grid path through the hall from the receptionist's chair to the door, clear of the desk
{ const pth = gridPath([2.3, Z(4.5)], [-0.6, Z(1.35)], (x, z) => !inObs(x, z), -6.7, 6.7, Z(8.36), Z(0.45)); ok(pth.length >= 1 && pth.length < 12, `grid path through the hall: ${pth.length} waypoints`); }
// ---- closing time
S.leaveNow(); const chairBack = []; const tellers = room.stand.tellers;
const doneLeave = run(260, () => { for (const t of tellers) if (Math.abs(t.chair.position.z - t.chairZ) > 0.1) chairBack.push(t); return S.people.every((p) => p.duty === 'off'); });
ok(doneLeave, `closing: everyone has gone home (${(T).toFixed(0)} s; stats ${JSON.stringify(S.stats)})`);
ok(new Set(chairBack).size === tellers.length, `each counter officer's chair rolled back as she got up (${new Set(chairBack).size}/${tellers.length})`);
const byes = subs.filter((s) => /that's me|off now|bye all|Good night\. I'll/i.test(s.text)), backs = subs.filter((s) => /Go safely|see you tomorrow\.|take care|Mind the traffic/i.test(s.text));
ok(S.stats.byes >= 5 && byes.length >= 2 && backs.length >= 3, `goodbyes to co-workers: ${S.stats.byes} (${byes.length} within earshot of the player, as subtitles), answered: ${backs.length}`);
const gn = subs.filter((s) => /Good night, aiya|Bye aiya/.test(s.text)), gr = subs.filter((s) => s.w === 'Security officer' && /Good night, (sir|madam)/.test(s.text));
ok(gn.length >= 5 && gr.length >= 5, `goodnight to the guard as they pass: ${gn.length}, the guard answers: ${gr.length}`);
ok(doorMax > 1.2, `the staff door swung open for them (${doorMax.toFixed(2)} rad)`);
ok(wentOut.size === S.people.length, `all ${wentOut.size} went out through the front door onto the pavement`);
ok(bad === 0, `nobody walked through a desk, wall or partition in the hall${bad ? ' — ' + badAt : ''}`);
ok(close > 0.35, `walkers never overlapped (closest pair ${close.toFixed(2)} m)`);
ok(S.people.every((p) => !p.ch.root.visible), 'all hidden once out of the scene');
// ---- opening time
subs.length = 0; bad = 0; close = 1e9; doorMax = 0; S.arriveNow();
const doneArr = run(300, () => S.people.every((p) => p.duty === 'on'));
ok(doneArr, `opening: everyone is back at work (${JSON.stringify(S.stats)})`);
const at = S.people.map((p, i) => p.ch.root.position.distanceTo(homes[i])); ok(at.every((d) => d < 0.05), `each at their own desk / spot (max ${Math.max(...at).toFixed(3)} m)`);
ok(S.people.filter((p) => p.seatP).every((p) => p.ch.anim.seated), 'the seated staff are seated');
ok(subs.filter((s) => /Good morning, aiya/.test(s.text)).length >= 5 && subs.some((s) => s.w === 'Security officer' && /Good morning/.test(s.text)), 'good morning to the guard, and back');
ok(bad === 0, `coming in: nobody walked through anything${bad ? ' — ' + badAt : ''}`);
ok(doorMax > 1.2, 'the staff door opened for the counter staff coming in');
S.release(); globalThis.setTimeout = realTimeout; void BANK_ROOM;
console.log(fail ? `${fail} FAILED, ${pass} passed` : `ALL PASS (${pass})`); process.exit(fail ? 1 : 0);
