// 71st: the bank's back-office phone call, in Node (no browser): the ring → an officer gets up (the chair's get-up sound at the
// start of the rise) → walks to the credenza → picks up (the ring stops on the pick-up sound) → the nine call lines in order
// over about a minute, the handset at the ear and the hand on it → hangs up → walks back → sits, landing on the seat at the
// sitting-down recording's seated moment (1.3 s for variation 1, 1.0 s for 2 and 3). No pops: the hips never jump in a frame.
import './node-dom-stub.mjs';
const THREE = await import('three');
const M = await import('../src/gfx/Materials.js');
M.MAT.paint ||= new THREE.MeshStandardMaterial({ vertexColors: true }); M.MAT.emissive ||= new THREE.MeshBasicMaterial({ vertexColors: true });
const { buildBankInterior } = await import('../src/world/BankInterior.js');
const { BankSound, CHAIR_SEATED_AT, RING_LEN } = await import('../src/audio/BankAudio.js');
const { BANK_CALL } = await import('../src/audio/VoiceDefs.js');
let pass = 0, fail = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); c ? pass++ : fail++; };
for (const variant of [1, 2, 3]) {
  let T = 0; const ev = [];
  for (const f of ['ring', 'ringStop', 'handset', 'chair', 'say']) { BankSound[f] = (...a) => { ev.push({ t: T, f, a }); return f === 'chair' ? (a[0] === 'down' ? variant : 1) : f === 'say' ? 0 : true; }; }
  const subs = []; const game = { clock: 0, hud: { key: () => '[E]', subtitle: (w, t) => subs.push({ t: T, w, text: t }), notify: () => {} } };
  const room = buildBankInterior(game, null); room.staffOn = () => true;
  const pl = { x: -2, z: -7.4, y: 0, yaw: Math.PI, inside: true }; const dt = 1 / 30;
  for (let i = 0; i < 30; i++) { T += dt; game.clock = T; room.update(dt, pl); }
  ok(room.ringNow(), `v${variant}: the phone rings`); const who = room.call.who, ch = who.ch; const hips = ch.bones.hips || ch.bones.pelvis || ch.root; const hp = new THREE.Vector3(), hp0 = new THREE.Vector3();
  const head = new THREE.Vector3(), hand = new THREE.Vector3(); const hm = room.g.children.find((o) => o.name === 'bank-call-handset');
  let maxJump = 0, vPrev = null, prevSt = '', tSit = 0, tLand = -1, earMax = 0, handMax = 0, tPick = -1, tRing = T, maxHipsY = 0; const seat0 = ch.root.position.clone(); ch.root.updateMatrixWorld(true); const seatY = ch.bones.hips.getWorldPosition(new THREE.Vector3()).y;
  ch.root.updateMatrixWorld(true); hips.getWorldPosition(hp0);
  for (let i = 0; i < 30 * 120; i++) { T += dt; game.clock = T; room.update(dt, pl); const st = room.call.st; ch.root.updateMatrixWorld(true); hips.getWorldPosition(hp); { const v = hp.clone().sub(hp0); if (vPrev && !/^(walk|walkBack|face|faceDesk|turnBack)$/.test(st)) { const j = v.distanceTo(vPrev); if (j > 0.012 && process.env.DBG) console.log("jerk", st, (T - tRing).toFixed(2), j.toFixed(3), ch.anim.action, ch.anim.sitW); maxJump = Math.max(maxJump, j); } vPrev = v; } hp0.copy(hp);
    if (st === 'sit' && tLand < 0 && hp.y < seatY + 0.004 && room.call.t > 0.1) tLand = room.call.t; maxHipsY = Math.max(maxHipsY, hp.y);
    if (st !== prevSt) { if (st === 'sit') tSit = T; prevSt = st; }
    if (st === 'call') { hm.updateMatrixWorld(true); const e = new THREE.Vector3().applyMatrix4(hm.matrixWorld); ch.bones.head.getWorldPosition(head); ch.bones.handR.getWorldPosition(hand); earMax = Math.max(earMax, e.distanceTo(head)); handMax = Math.max(handMax, e.distanceTo(hand)); }
    if (st === 'idle' && i > 10) break; }
  const pick = ev.find((e) => e.f === 'handset' && e.a[0] === true), put = ev.find((e) => e.f === 'handset' && e.a[0] === false), up = ev.find((e) => e.f === 'chair' && e.a[0] === 'up'), down = ev.find((e) => e.f === 'chair' && e.a[0] === 'down');
  const stop = ev.filter((e) => e.f === 'ringStop' && !e.a[0]).find((e) => pick && Math.abs(e.t - pick.t) < 1e-6);
  ok(!!up && !!pick && pick.t - tRing < RING_LEN, `v${variant}: got up (chair sound at ${up && (up.t - tRing).toFixed(2)} s) and picked up ${pick && (pick.t - tRing).toFixed(1)} s into the ${RING_LEN} s ring`);
  ok(!!stop, `v${variant}: the ring stops on the pick-up`);
  const lines = subs.filter((s) => /phone/.test(s.w)); const span = lines.length ? (put.t - pick.t) : 0;
  ok(lines.length === BANK_CALL.length && lines.every((s, i) => s.text === BANK_CALL[i]), `v${variant}: ${lines.length} call lines, in order`);
  ok(span > 45 && span < 80, `v${variant}: the call lasts ${span.toFixed(1)} s (about a minute)`);
  ok(earMax < 0.16 && handMax < 0.13, `v${variant}: handset at the ear (≤ ${earMax.toFixed(3)} m from the head bone), the hand on it (≤ ${handMax.toFixed(3)} m)`);
  // the descent ends at the recording's seated moment: the hips reach the seat height then
  const landAt = down ? CHAIR_SEATED_AT[variant] : NaN; ok(!!down && Math.abs(tLand - landAt) < 0.05, `v${variant}: the hips land on the seat ${tLand.toFixed(2)} s into the sitting-down sound (its seated moment: ${landAt} s)`);
  ok(maxJump < 0.012, `v${variant}: no pops — the hips' frame-to-frame velocity changes by at most ${(maxJump * 1000).toFixed(1)} mm/frame (getting up, the phone, sitting down)`);
  ok(ch.root.position.distanceTo(seat0) < 0.02 && ch.anim.seated, `v${variant}: back on the chair (${ch.root.position.distanceTo(seat0).toFixed(3)} m from where she sat), seated`);
}
console.log(fail ? `${fail} FAILED, ${pass} passed` : `ALL PASS (${pass})`); process.exit(fail ? 1 : 0);
