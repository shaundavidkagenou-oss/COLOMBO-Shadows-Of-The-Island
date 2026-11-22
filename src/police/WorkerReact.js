// 84th: the emergency / service crews (1990 ambulance medics — EMS.js, Street Customs roadside mechanics — Roadside.js) as
// people the player can actually hurt, and who react like people.
//
// Root cause of "they don't register damage": both job systems move their unit out of PoliceResponse.units into their own
// list (ems.units / rs.units), and the shot test (Weapons.trace) and the fists (Weapons.punchHit) only looked at the crowd and
// at PoliceResponse.foot, which is built from units + civil — so a medic or a mechanic on foot was in no hit list at all.
// Nothing was flagged invulnerable; they were simply never tested. PoliceResponse.workers is now built beside .foot from the
// two job lists, and a hit goes through workerHit (never officerHit: hurting a medic is an assault on a civilian, not on a
// police officer). Story protection is kept: a worker with o.protected (or a unit with u.protected) ignores hits.
//
// Reactions (non-graphic, varied per person — a stable style per character, a human reaction delay):
//   hit           flinch + stagger back (never into a wall or a car); hp runs down — at 0 the person goes down for good (ragdoll)
//   every style   stops work at once (hands off the tools / the cot), warns the colleague, and the job is called off:
//                 the ambulance crew abandons the call, the roadside unit stands down (both pack up / leave as usual afterwards)
//   flee          runs 20–35 m away from the threat, then waits (looking back) until it is calm
//   cover         gets behind the own vehicle on the side away from the threat and crouches there
//   freeze        hands up facing the threat for a few seconds, then flees
//   call          backs off ~12 m and phones 119 (a witness report → wanted level, as for any civilian assault)
// Bystanders: every hit and every flinch raises a crowd alarm at the spot (Crowd.alarm), so passers-by scatter as usual.
// Calm = no new threat for WR.calm seconds and the player more than 18 m away; then they return to the vehicle (PoliceResponse
// 'return' mode → the cab), and the job systems take the unit away.
// 84th (tested): a weapon's dmg is in the crowd's units (Crowd.hitPed: 1.2 accumulated = down; PM pistol 0.6, heavy 1.2) — the first
// version took it off 100 hp as-is (a pistol round = 0.6 hp, less than a punch). gunK maps 1.2 → 100 hp: two light rounds or one heavy
// one put a worker down, the same as a civilian. Punches (FIGHT_MOVES dmg ~10–20) stay at 0.45/pt: a sustained beating, not one jab.
export const WR = { hp: 100, gunK: 100 / 1.2, punchK: 0.45, stagger: 0.32, calm: 14, fleeD: [20, 35], callT: 6, warnR: 30, alarmR: 22 };
const STYLES = ['flee', 'cover', 'flee', 'call', 'freeze', 'cover'];
const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
let STATS = null;
export function workerStats() { return STATS || (STATS = { hits: 0, punches: 0, down: 0, alarms: 0, calls: 0, flee: 0, cover: 0, freeze: 0, call: 0, protectedHits: 0 }); }

// the workers on foot (rebuilt each frame by PoliceResponse.update into a reused array)
export function collectWorkers(pr, out) {
  out.length = 0; for (const L of [pr.ems && pr.ems.units, pr.rs && pr.rs.units]) { if (!L) continue; for (const u of L) for (const o of u.officers) if (o.mode === 'foot' || o.mode === 'return' || o.mode === 'down') out.push(o); }
  return out;
}
function styleOf(o, u) { if (!o.wStyle) { const i = u ? Math.max(0, u.officers.indexOf(o)) : 0; const base = ((u ? u.id : 0) * 3 + 1) % STYLES.length; let s = STYLES[(base + i * 1) % STYLES.length]; if (i > 0 && u && u.officers[0].wStyle === s) s = STYLES[(base + i + 1) % STYLES.length]; o.wStyle = s; } return o.wStyle; } // stable per person, the two of a crew never alike
function unitOf(pr, o) { for (const L of [pr.ems && pr.ems.units, pr.rs && pr.rs.units]) { if (!L) continue; for (const u of L) if (u.officers.includes(o)) return u; } return null; }

// a round / a punch landed on worker o (dx, dz: the blow's direction). Returns false if it did not register (protected / gone)
export function workerHit(pr, o, dx, dz, dmg, how = 'gun') {
  const S = workerStats(); if (!o || o.dead || o.mode === 'seated') return false; const u = unitOf(pr, o);
  if (o.protected || (u && u.protected)) { S.protectedHits++; return false; }
  o.hp = (o.hp ?? WR.hp) - dmg * (how === 'punch' ? WR.punchK : WR.gunK); if (how === 'punch') S.punches++; else S.hits++;
  const g = pr.g, col = g.collision; let nx = o.x + dx * WR.stagger, nz = o.z + dz * WR.stagger; if (col) { const r = col.resolveCircle(nx, nz, 0.3, o.y || 0.15, 0.3); nx = r.x; nz = r.z; }
  if (!pr.carAt(nx, nz)) { o.x = nx; o.z = nz; } o.ch.face?.set?.('fear', 3);
  const A = o.ch.anim; if (A) { A.holdWL = A.holdWR = null; A.set('flinch'); }
  if (u && pr.rs && pr.rs.units.includes(u)) dropHeld(pr, o, u);
  const P = g.player; alarmUnit(pr, u, P.x, P.z, o, how === 'punch' ? 'assault' : 'shot');
  g.crowd?.alarm?.(o.x, o.z, WR.alarmR, 2, null, how === 'punch' ? 'fight' : 'gunshot', true);
  pr.reason = 'assault on an emergency worker'; pr.crime?.(o.x, o.z, 'assault');
  if (o.hp <= 0) downWorker(pr, o, u, dx, dz);
  return true;
}
// whatever a mechanic had in his hands is set down where he stands (it stays one of the unit's props: packed up later, never lost)
function dropHeld(pr, o, u) { const RS = pr.rs; if (!o.carry || !u.rs) return; const m = RS.unCarry(o); if (m) RS.place(u, m, m.position.x, m.position.z, o.yaw, m.userData.kind === 'tyre' ? { rz: Math.PI / 2, dy: 0.1 } : {}); }
// the whole crew learns of it (the one hit at once, the others after a reaction delay) and the job is called off
export function alarmUnit(pr, u, tx, tz, hitO = null, why = 'shot') {
  if (!u) return; const S = workerStats(); const first = !u.wAlarm; u.wAlarm = { t: pr.t, x: tx, z: tz, why };
  for (const o of u.officers) { if (o.dead || o.mode === 'seated') continue; const R = o.react || (o.react = { st: null, t: 0, delay: 0 });
    R.tx = tx; R.tz = tz; R.last = pr.t; if (!R.st) { R.st = 'onset'; R.t = 0; R.delay = o === hitO ? 0.05 : 0.2 + Math.random() * 0.45; } }
  if (first) { S.alarms++; const E = pr.ems; if (E && E.units.includes(u)) { E.say?.('attacked', 'EMT'); if (u.e && u.e.ph !== 'leave' && u.e.ph !== 'bay' && u.e.ph !== 'parked') E.abort(u, 'crew attacked'); }
    const RS = pr.rs; if (RS && RS.units.includes(u)) { RS.note?.(`unit ${u.id}: crew attacked — job abandoned`); if (u.rs) { u.rs.attacked = true; u.rs.working = false; } } }
}
// a gunshot / explosion near a working crew (no hit): the same reactions (Weapons → PoliceResponse.gunfire → here)
export function disturbance(pr, x, z, r = 26) {
  for (const L of [pr.ems && pr.ems.units, pr.rs && pr.rs.units]) { if (!L) continue; for (const u of L) { const o0 = u.officers.find((o) => o.mode === 'foot'); if (!o0) continue; if (Math.hypot(o0.x - x, o0.z - z) < r) alarmUnit(pr, u, pr.g.player.x, pr.g.player.z, null, 'gunfire'); } }
}
function downWorker(pr, o, u, dx, dz) {
  const S = workerStats(); if (o.dead) return; S.down++; o.dead = true; o.mode = 'dead'; o.react = null; const A = o.ch.anim; if (A) { A.ik = null; A.holdWL = A.holdWR = null; A.set('down'); } o.ch.face?.set?.('blink', 1e9);
  if (u) { if (pr.rs && pr.rs.units.includes(u)) dropHeld(pr, o, u); u.officers = u.officers.filter((q) => q !== o); }
  const R = pr.g.ragdolls; if (R && o.ch.root.parent && !o.ch.rag) R.add(o.ch, { vel: [dx * 1.6, 0, dz * 1.6] });
  pr.bodies.push({ o, ch: o.ch, x: o.x, z: o.z, t: 0 }); pr.note(`${u && u.ems ? 'medic' : 'mechanic'} down`);
}
// per frame for a worker with o.react (PoliceResponse.updateOfficer, before the job scripts): true = this frame is handled here
export function reactOfficer(pr, o, u, dt) {
  const R = o.react; if (!R || !R.st || o.mode === 'down') return false; const A = o.ch.anim, g = pr.g, P = g.player, S = workerStats(); R.t += dt;
  const away = Math.atan2(o.x - R.tx, o.z - R.tz); const dP = Math.hypot(P.x - o.x, P.z - o.z); const calm = pr.t - R.last > WR.calm && dP > 18;
  const face = (yaw) => { o.yaw += angDiff(yaw, o.yaw) * Math.min(1, dt * 6); pr.placeOfficer(o); };
  if (o.mode === 'return') o.mode = 'foot'; // the job scripts' walk to the cab waits until the reaction is over
  switch (R.st) {
    case 'onset': if (A.action !== 'flinch') A.set('flinch'); face(Math.atan2(R.tx - o.x, R.tz - o.z)); pr.animOfficer(o, dt, 0);
      if (R.t > R.delay + 0.35) { R.style = styleOf(o, u); S[R.style]++; R.st = R.style; R.t = 0; A.set(null); o.path = null; o.q = []; o.want = null; if (o.carry && pr.rs && u && u.rs) dropHeld(pr, o, u);
        if (R.style === 'flee' || R.style === 'call') { const d = R.style === 'call' ? 12 : WR.fleeD[0] + Math.random() * (WR.fleeD[1] - WR.fleeD[0]); const a = away + (Math.random() - 0.5) * 0.9; R.gx = o.x + Math.sin(a) * d; R.gz = o.z + Math.cos(a) * d; }
        if (R.style === 'cover') { const v = u && u.v; if (v) { const fx = Math.sin(v.yaw), fz = Math.cos(v.yaw); const rx = fz, rz = -fx; const side = ((R.tx - v.x) * rx + (R.tz - v.z) * rz) > 0 ? -1 : 1; const off = (v.T.wid || 1.8) / 2 + 0.75; const along = Math.max(-v.half + 0.6, Math.min(v.half - 0.6, (o.x - v.x) * fx + (o.z - v.z) * fz)); R.gx = v.x + rx * side * off + fx * along; R.gz = v.z + rz * side * off + fz * along; } else R.style = R.st = 'flee'; }
        pr.note(`worker reacts: ${R.style}`); }
      return true;
    case 'freeze': if (A.action !== 'handsup') A.set('handsup'); face(Math.atan2(R.tx - o.x, R.tz - o.z)); pr.animOfficer(o, dt, 0);
      if (R.t > 3 + Math.random() * 0.02) { R.st = 'flee'; R.t = 0; A.set(null); const a = away; R.gx = o.x + Math.sin(a) * 25; R.gz = o.z + Math.cos(a) * 25; } return true;
    case 'flee': case 'call': case 'cover': {
      const d = Math.hypot(R.gx - o.x, R.gz - o.z);
      if (d > 0.6 && R.t < 25) { if (A.action && A.action !== 'cover') A.set(null); const sp = pr.moveTo(o, R.gx, R.gz, R.st === 'cover' ? 3.0 : 3.8, dt); pr.animOfficer(o, dt, sp); return true; }
      if (R.st === 'cover') { if (A.action !== 'cover') A.set('cover'); face(Math.atan2(R.tx - o.x, R.tz - o.z)); }
      else if (R.st === 'call') { if (A.action !== 'phone') A.set('phone'); face(away + Math.PI); R.ct = (R.ct || 0) + dt; if (R.ct > WR.callT && !R.called) { R.called = true; S.calls++; pr.reason = 'assault on an emergency worker'; pr.report({ kind: 'assault', x: o.x, z: o.z }); } }
      else { if (A.action !== 'look') A.set('look'); face(away + Math.PI); }
      pr.animOfficer(o, dt, 0);
      if (calm) { R.st = 'done'; A.set(null); o.react = null; o.mode = 'foot'; o.goal = null; o.want = null; o.q = []; o.placedT = 0; } return true; } // the job system takes over again (EMS: recover the cot / leave; roadside: pack up)
  }
  return false;
}
