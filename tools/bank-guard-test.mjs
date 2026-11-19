// 73rd: the bank security officer's pump shotgun (BankGuardGun.js), in Node: slung and idle while calm (nothing runs); the
// player walks into the hall wanted → he turns on him, draws (right hand over the shoulder, then both hands), shoulders it,
// warns, then fires buckshot — nine traced pellets, damage by the pellets that land — racks the pump after every shot (the
// fore-end really travels, the hull flies out and comes to rest on the floor), reloads the tube shell by shell when it runs dry,
// fires sooner at an armed player, never with someone in the line, and stands down / slings it when the wanted level is gone.
import './node-dom-stub.mjs';
const THREE = await import('three');
globalThis.localStorage ??= { getItem: () => null, setItem: () => {}, removeItem: () => {} };
const M = await import('../src/gfx/Materials.js');
M.MAT.paint ||= new THREE.MeshStandardMaterial({ vertexColors: true }); M.MAT.emissive ||= new THREE.MeshBasicMaterial({ vertexColors: true });
const { buildBankInterior } = await import('../src/world/BankInterior.js');
const { GUARD_GUN, rayHall, rayBody, pelletDamage, lineBlocked } = await import('../src/world/BankGuardGun.js');
const { BANK_GUARD, bankVoiceDefs } = await import('../src/audio/VoiceDefs.js');
const { SOUND_DEFS } = await import('../src/audio/SoundBank.js');
const { Audio } = await import('../src/audio/Audio.js');
let pass = 0, fail = 0; const ok = (c, m) => { console.log((c ? '  PASS ' : '  FAIL ') + m); c ? pass++ : fail++; };

// ---- pure parts
{ const B = { xL: -7, xR: 7, z0: -14, zF: -0.5, H: 3.6 }; const o = { x: 0, y: 1.4, z: -6 };
  const h1 = rayHall(o, { x: 1, y: 0, z: 0 }, B, [], 0); ok(h1.kind === 'wall' && Math.abs(h1.t - 7) < 1e-6 && h1.nx === -1, `rayHall: east wall at ${h1.t} m`);
  const h2 = rayHall(o, new THREE.Vector3(0, -1, 1).normalize(), B, [], 0); ok(h2.kind === 'floor' && Math.abs(h2.t - 1.4 * Math.SQRT2) < 1e-6, `rayHall: floor at ${h2.t.toFixed(3)} m`);
  const h3 = rayHall({ x: 0, y: 0.8, z: -6 }, { x: 0, y: 0, z: -1 }, B, [{ x0: -1, x1: 1, z0: -9, z1: -8 }], 1); ok(h3.kind === 'obs' && Math.abs(h3.t - 2) < 1e-6 && h3.nz === 1, `rayHall: the counter (obstacle box) at ${h3.t} m, facing the shot`);
  const h4 = rayHall({ x: 0, y: 1.4, z: -6 }, { x: 0, y: 0, z: -1 }, B, [{ x0: 1e5, x1: 1e5 + 1, z0: -9, z1: -8 }], 1); ok(h4.kind === 'wall', 'rayHall: a hidden part (obstacle parked far away) stops nothing');
  ok(Math.abs(rayBody(o, { x: 0, y: 0, z: 1 }, 0, -2, 0, 1.8, 0.3, 50) - 3.7) < 1e-6 && rayBody(o, { x: 0, y: 0, z: 1 }, 0.5, -2, 0, 1.8, 0.3, 50) < 0, 'rayBody: hits a body on the line, misses one 0.5 m off it');
  ok(pelletDamage(3) === GUARD_GUN.pelletDmg && Math.abs(pelletDamage(25) - GUARD_GUN.farDmg) < 1e-9 && pelletDamage(15) < pelletDamage(8), `pellets: ${pelletDamage(3)} at 3 m, ${pelletDamage(15).toFixed(1)} at 15 m, ${pelletDamage(25).toFixed(1)} at 25 m`);
  ok(lineBlocked(0, 0, 0, 6, [{ x: 0.2, z: 3 }]) && !lineBlocked(0, 0, 0, 6, [{ x: 1.2, z: 3 }]) && !lineBlocked(0, 0, 0, 6, [{ x: 0, z: 8 }]), 'check fire: someone in the line blocks the shot; someone beside it or behind the target does not');
  ok(SOUND_DEFS.some((d) => d.id === 'gun.shotgun' && d.cat === 'Bank') && SOUND_DEFS.some((d) => d.id === 'gun.pump') && SOUND_DEFS.some((d) => d.id === 'gun.sgLoad') && new Set(SOUND_DEFS.map((d) => d.id)).size === SOUND_DEFS.length, 'sounds board → Bank: the shot (+3 variations), the pump (+3), a shell loaded; no duplicate ids');
  ok(bankVoiceDefs().filter((d) => d.bank === 'guard').length === BANK_GUARD.length, `dialogs window → Bank staff: the security officer's ${BANK_GUARD.length} lines`); }

// ---- in the hall
const snd = []; for (const f of ['shotgun', 'shotgunPump', 'shotgunShell']) Audio[f] = (x, z) => snd.push({ f, x, z, t: T });
let T = 0, stars = 0; const subs = [], dmg = [], decals = [], alarms = [];
const game = { clock: 0, hud: { key: () => '[E]', subtitle: (w, t) => subs.push({ t: T, w, text: t }), notify: () => {}, hurt: () => {} },
  police: { stars: () => stars, busy: false }, health: { busy: false, damage: (n, c) => dmg.push({ n, c, t: T }) },
  weapons: { drawn: false, fx: [], tracer: () => {}, puff: () => {}, sparks: () => {}, decal: (p, d, k) => decals.push(k) }, crowd: { alarm: () => alarms.push(T) } };
const room = buildBankInterior(game, null); const gun = room.guardGun; const gd = room.stand.guard; const ch = gd.ch; const m = gun.m;
let meshes = 0; m.traverse((o) => { if (o.isMesh && o.parent !== m.userData.flash) meshes++; }); ok(meshes <= 12, `the shotgun is ${meshes} meshes (one per material) — drawn only with the hall`);
ok(m.parent === ch.bones.chest, 'the shotgun is on the guard (chest bone: slung across his back)');
const pl = { x: -1.2, z: gd.z - 4.2, y: 0, yaw: 0, inside: false, P: { speed: 0, crouching: false } }; const dt = 1 / 30;
const step = (n, f) => { for (let i = 0; i < n; i++) { T += dt; game.clock = T; room.update(dt, pl); if (f && f(i) === true) return i; } return -1; };
const slung0 = m.matrix.clone();
step(150); ok(gun.stats.draws === 0 && !gun.alert && m.matrix.equals(slung0) && !(ch.anim.ik && ch.anim.ik.rifle), 'calm (player outside): the gun stays slung, no draw, no IK');
pl.inside = true; step(90); ok(gun.stats.draws === 0, 'calm (player inside, not wanted): still slung — he keeps to his routine');
// wanted, inside
stars = 2; const t0 = T; let tDraw = -1, tFire = -1, maxPump = 0, grip = 1, supD = 1, faceErr = 9, muzAng = 9;
const hand = new THREE.Vector3(), tgt = new THREE.Vector3(), mz = new THREE.Vector3(), mzd = new THREE.Vector3();
let scared = -1; step(30 * 30, () => { if (scared < 0 && gun.stats.shots >= 1) scared = room.stand.tellers.filter((t) => t.duty === 'on' && t.stunT > 0).length + [room.stand.recep, room.stand.mgr, room.stand.sup].filter((p) => p && p.duty === 'on' && p.stunT > 0).length; if (tDraw < 0 && gun.draw >= 1) tDraw = T - t0; if (tFire < 0 && gun.stats.shots > 0) tFire = T - t0; maxPump = Math.max(maxPump, -m.userData.pump.position.z);
  if (gun.aim > 0.99 && gun.pumpT < 0 && gun.loadT < 0) { room.g.updateMatrixWorld(true); ch.bones.handR.getWorldPosition(hand); tgt.setFromMatrixPosition(m.matrixWorld); grip = Math.min(grip, hand.distanceTo(tgt));
    ch.bones.handL.getWorldPosition(hand); const loc = hand.clone().applyMatrix4(m.matrixWorld.clone().invert()); const off = Math.hypot(loc.x, loc.y - m.userData.support.y) + Math.max(0, 0.272 - loc.z, loc.z - 0.47); supD = Math.min(supD, off);
    faceErr = Math.min(faceErr, Math.abs(Math.atan2(Math.sin(ch.root.rotation.y - Math.atan2(pl.x - gd.x, pl.z - gd.z)), Math.cos(ch.root.rotation.y - Math.atan2(pl.x - gd.x, pl.z - gd.z)))));
    mz.copy(m.userData.muzzle).applyMatrix4(m.matrixWorld); mzd.set(0, 0, 1).transformDirection(m.matrixWorld); const toP = new THREE.Vector3(pl.x, 1.2, pl.z).applyMatrix4(room.g.matrixWorld).sub(mz).normalize(); muzAng = Math.min(muzAng, Math.acos(Math.min(1, mzd.dot(toP))) * 180 / Math.PI); }
  return gun.stats.shots >= 8; });
const warn = subs.find((s) => s.text === BANK_GUARD[0]);
ok(tDraw > 0.5 && tDraw < 1.3, `wanted + inside: he draws (sling → both hands) in ${tDraw.toFixed(2)} s`);
ok(!!warn && warn.w === 'Security officer', `he shouts the warning: "${warn && warn.text}"`);
ok(faceErr < 0.15, `he faces the player (${(faceErr * 180 / Math.PI).toFixed(1)}° off)`);
ok(grip < 0.06 && supD < 0.06, `hands on the gun: firing hand ${(grip * 100).toFixed(1)} cm from the grip; support wrist ${(supD * 100).toFixed(1)} cm from the fore-end (≤ 6 cm: the palm and fingers on it)`);
ok(muzAng < 9, `shouldered and aimed: the barrel points ${muzAng.toFixed(1)}° off the player's chest`);
ok(tFire > GUARD_GUN.warn && tFire < 4, `first shot after the warning: ${tFire.toFixed(2)} s`);
ok(gun.stats.shots >= 8, `${gun.stats.shots} shots, ${gun.stats.pellets} pellets`);
ok(dmg.length > 0 && dmg.every((d) => d.c === 'shot by the bank guard') && dmg.every((d) => d.n <= GUARD_GUN.pellets * GUARD_GUN.pelletDmg + 1e-6), `the player is hit by ${dmg.length} of ${gun.stats.shots} shots (${dmg.map((d) => d.n.toFixed(1)).join(', ')} hp)`);
{ const shots = snd.filter((s) => s.f === 'shotgun').length, pumps = snd.filter((s) => s.f === 'shotgunPump').length, shells = snd.filter((s) => s.f === 'shotgunShell').length;
  ok(shots === gun.stats.shots && pumps >= shots - 1, `sounds: ${shots} shots, ${pumps} pumps, ${shells} shells loaded`);
  ok(shells >= 2 && gun.stats.loads === shells, `the tube ran dry after ${GUARD_GUN.tube + 1} and he reloaded shell by shell (${gun.stats.loads} loaded)`); }
ok(Math.abs(maxPump - m.userData.pumpTravel) < 0.005, `the fore-end racks back ${(maxPump * 100).toFixed(1)} cm and home`);
{ const hs = gun.hulls.filter((h) => h.m.visible); ok(hs.length >= Math.min(6, gun.stats.pumps - 1) && hs.filter((h) => h.rest).every((h) => Math.abs(h.m.position.y - 0.0106) < 1e-4) && hs.some((h) => h.rest), `empty hulls: ${hs.length} on the floor (${hs.filter((h) => h.rest).length} come to rest)`); }
ok(subs.some((s) => s.text === BANK_GUARD[2]), 'after his first shot: "Stay down! Do not move!"');
ok(scared >= 3, `the shot frightens the staff (${scared} duck / cower)`);
ok(alarms.length >= 1, `the shots alarm the street (${alarms.length})`);
// armed player: line 2, and he fires sooner
// a running target further away: pellets go wide and mark the hall
{ const d0 = dmg.length, s0b = gun.stats.shots; pl.x = -5.5; pl.z = gd.z - 7.3; pl.P.speed = 6; step(30 * 8); pl.P.speed = 0;
  ok(decals.length > 0, `a running target ${Math.hypot(pl.x - gd.x, pl.z - gd.z).toFixed(1)} m away: ${gun.stats.shots - s0b} shots, ${dmg.length - d0} hit (${dmg.slice(d0).map((d) => d.n.toFixed(1)).join(', ')} hp); stray pellets mark the hall (${decals.length}: ${[...new Set(decals)].join(', ')})`); }
stars = 0; step(30 * 6); pl.inside = false; step(30 * 2); ok(!gun.alert && gun.draw === 0 && !(ch.anim.ik && ch.anim.ik.rifle) && subs.some((s) => s.text === BANK_GUARD[3]), 'wanted gone: he stands down ("Everyone stay calm…"), slings it, his routine back');
ok(gun.tube === GUARD_GUN.tube && gun.chamber && gun.hulls.every((h) => !h.m.visible), 'slung again: the tube topped up, the hulls swept up');
ok(gun.step(dt, pl) === false, 'calm again: step() does nothing');
pl.x = -1.2; pl.z = gd.z - 4.2; game.weapons.drawn = true; stars = 3; pl.inside = true; const s0 = gun.stats.shots, t1 = T; let tF2 = -1; step(30 * 6, () => { if (gun.stats.shots > s0) { tF2 = T - t1; return true; } });
ok(tF2 > 0 && tF2 < tFire - 0.6 && subs.some((s) => s.text === BANK_GUARD[1]), `armed player: "Drop the weapon!…" and the first shot sooner (${tF2.toFixed(2)} s vs ${tFire.toFixed(2)} s)`);
// check fire: someone steps into the line → he holds fire (waits for a clear shot), then fires once the line is clear
{ const bodies0 = gun.opts.bodies; gun.opts.bodies = () => [{ x: (gd.x + pl.x) / 2, z: (gd.z + pl.z) / 2 }]; const h0 = gun.stats.holds, s1 = gun.stats.shots; step(30 * 4);
  ok(gun.stats.shots === s1 && gun.stats.holds > h0, `someone in the line: no shot in 4 s (${gun.stats.holds - h0} holds)`);
  gun.opts.bodies = bodies0; step(30 * 4); ok(gun.stats.shots > s1, 'line clear again: he fires'); }
console.log(fail ? `bank-guard: ${pass} passed, ${fail} failed` : `ALL PASS (${pass})`); process.exit(fail ? 1 : 0);
