// Squad-mates' own lives. Outside the missions that bring the three together, the two protagonists you are not playing
// are not followers: each goes back to his own job and keeps at it. Nobody takes orders from the player.
//   Dineth   — drives his hire three-wheeler around the city (a real AI driver in Traffic, picking routes like any tuk)
//   Shashika — mechanic at Lanka Auto Care, Maradana (works between two bays: hands in an engine, gloves, a call)
//   David    — runs a phone-repair stall in Pettah (bent over a handset, texting customers, talking to passers-by)
// Far from the player a squad-mate is abstract (no mesh, no AI cost) and simply "is at work"; near the player he is a
// visible character doing that job. A character you switch away from walks off (out of sight he is back at work), or —
// if you were driving — keeps the vehicle and drives on as an AI driver.
import * as L from '../world/Layout.js';
import { Vehicle } from '../vehicles/Vehicle.js';
import { seatCharacter } from './Seating.js';

export const JOBS = {
  dineth: { kind: 'tuk', label: 'Driving his three-wheeler', at: { x: -150, z: -150 }, color: 1 },
  shashika: { kind: 'work', label: 'At work · Lanka Auto Care', at: L.PLACES.garage, acts: [['interact', 7, 5], ['gloves', 3, 2], ['browse', 4, 3], ['stretch', 3, 1], ['phone', 6, 1.5], ['crossarms', 5, 1.5]] },
  david: { kind: 'work', label: 'At his repair stall · Pettah', at: { x: -70, z: -900 }, acts: [['interact', 7, 5], ['text', 5, 3], ['phone', 6, 2], ['browse', 4, 2], ['talk', 4, 1.5], ['look', 3, 1]] },
};
const NEAR = 150, TUK_SPAWN = 230, TUK_DROP = 320;
const pickW = (list) => { let t = 0; for (const a of list) t += a[2]; let r = Math.random() * t; for (const a of list) { r -= a[2]; if (r <= 0) return a; } return list[0]; };

export class SquadLife {
  constructor(squad) { this.sq = squad; this.g = squad.g; this.spots = {}; }
  job(m) { return JOBS[m.def.id]; }
  label(m) { const l = m.life; if (l && l.drive) return 'Driving'; const j = this.job(m); return j ? j.label : 'Off duty'; }
  // two work spots a few metres apart on walkable pavement by the job's address, each facing the nearest wall
  spotsFor(m) {
    const id = m.def.id; if (this.spots[id]) return this.spots[id]; const j = this.job(m), col = this.g.collision; const out = [];
    const ok = (x, z) => !col.blocked(x, z, 0.45) && col.walkableWater(x, z, 0.2) && !L.roadAt(x, z) && !L.isWater(x, z);
    const face = (x, z) => { let best = null, bd = 9; for (let a = 0; a < 8; a++) { const yaw = a * Math.PI / 4, dx = Math.sin(yaw), dz = Math.cos(yaw); const f = col.raycast(x, 1.0, z, x + dx * 2.5, 1.0, z + dz * 2.5, 0.1); if (f < 1 && f < bd) { bd = f; best = yaw; } } return best ?? 0; };
    for (let r = 0; r < 40 && out.length < 1; r += 1) for (let a = 0; a < 16 && out.length < 1; a++) { const x = j.at.x + Math.cos(a * 0.3927) * r, z = j.at.z + Math.sin(a * 0.3927) * r; if (ok(x, z)) out.push({ x, z, yaw: face(x, z) }); }
    if (!out.length) out.push({ x: j.at.x, z: j.at.z, yaw: 0 });
    const o = out[0]; for (let r = 3; r < 8 && out.length < 2; r += 1) for (let a = 0; a < 12 && out.length < 2; a++) { const x = o.x + Math.cos(a * 0.5236) * r, z = o.z + Math.sin(a * 0.5236) * r; if (ok(x, z) && this.sq.clearLine(o.x, o.z, 0.2, x, z)) out.push({ x, z, yaw: face(x, z) }); }
    for (const s of out) s.y = col.groundAt(s.x, s.z, 1, 2);
    return (this.spots[id] = out);
  }
  hide(m) { if (!m.hidden) { m.hidden = true; m.ch.root.visible = false; } }
  show(m) { const g = this.g; if (m.ch.root.parent !== g.scene && !m.vehicle && !(m.life && (m.life.v || m.life.drive))) { m.ch.root.parent?.remove(m.ch.root); g.scene.add(m.ch.root); } if (m.hidden) { m.hidden = false; m.ch.root.visible = true; } }
  // become abstract at the job (used when far away, on load, or when a mission sends everybody home)
  atWork(m) { const j = this.job(m); m.life = { t: 0, spot: 0, next: 0, act: null }; if (j.kind === 'work') { const s = this.spotsFor(m)[0]; m.x = s.x; m.z = s.z; m.y = s.y; m.yaw = s.yaw; } this.hide(m); }
  // a squad mission starts: drop the job (the tuk goes back to traffic without him) and join up out of sight
  leave(m) { const l = m.life; if (l && (l.v || l.drive)) this.dropVehicle(m, l.v || l.drive); m.life = null; }
  dropVehicle(m, v) {
    const T = this.g.traffic; if (!v) return; if (v.driverChar === m.ch) { v.mesh.remove(m.ch.root); v.driverChar = null; } v.squad = null; v.onRemove = null; v.keep = false;
    const i = T.vehicles.indexOf(v); if (i >= 0) T.vehicles.splice(i, 1); T.remove(v); if (m.life) { m.life.v = null; m.life.drive = null; }
  }
  // the vehicle the player was driving when switching away: the departing character drives on in it
  takeWheel(m, v) {
    const T = this.g.traffic; const ln = T.laneNear(v.x, v.z, v.yaw, 25); m.life = m.life || { t: 0, spot: 0, next: 0, act: null };
    if (!ln) return false; // no road under it: the caller parks it and he gets out
    T.adoptAI(v, ln, { place: false }); v.speed = Math.min(Math.abs(v.speed), 6); v.driverChar = m.ch; v.squad = m; v.onRemove = (mm) => this.lostVehicle(mm);
    const isJob = this.job(m).kind === 'tuk' && v.type === 'tuktuk'; v.keep = isJob; if (isJob) m.life.v = v; else m.life.drive = v; m.hidden = false; m.ch.root.visible = true; return true;
  }
  lostVehicle(m) { if (!m.life) return; m.life.v = null; m.life.drive = null; this.atWork(m); if (this.job(m).kind === 'tuk') { const P = this.g.player; m.x = P.x + 400; m.z = P.z; } }
  // Dineth's three-wheeler joins the traffic on the lane nearest to where he is (abstractly) — out of the camera's view
  spawnTuk(m, force = false) {
    const g = this.g, T = g.traffic; const ln = T.laneNear(m.x, m.z, m.yaw || 0, 400); if (!ln) return null;
    const v = new Vehicle('tuktuk', 9301 + this.job(m).color * 7, g.scene); T.adoptAI(v, ln);
    if (!force && this.sq.inView(v.x, v.y, v.z) && Math.hypot(v.x - g.player.x, v.z - g.player.z) < 120) { const i = T.vehicles.indexOf(v); if (i >= 0) T.vehicles.splice(i, 1); v.dispose(); return null; }
    if (m.ch.root.parent) m.ch.root.parent.remove(m.ch.root); seatCharacter(m.ch, v, v.driverSeat()); m.ch.mesh.castShadow = false; m.ch.root.visible = true; m.hidden = false;
    v.driverChar = m.ch; v.squad = m; v.keep = true; v.onRemove = (mm) => this.lostVehicle(mm); v.speed = v.ai.v0 * 0.5; m.life.v = v; return v;
  }
  update(m, dt, k, bodies) {
    const g = this.g, P = g.player, sq = this.sq, A = m.ch.anim; if (!m.life) this.atWork(m); const l = m.life, j = this.job(m);
    // riding as a passenger when the mission ended: stays aboard until the driver stops and gets out
    if (m.vehicle) { if (P.vehicle !== m.vehicle) sq.disembark(m); else { A.update(dt, 0); return; } }
    const veh = l.v || l.drive; if (veh) { m.x = veh.x; m.z = veh.z; m.y = veh.y; m.yaw = veh.yaw;
      if (Math.hypot(veh.x - P.x, veh.z - P.z) > TUK_DROP && !sq.inView(veh.x, veh.y, veh.z)) { this.dropVehicle(m, veh); if (j.kind === 'tuk') this.hide(m); else this.atWork(m); }
      return; }
    const dP = Math.hypot(m.x - P.x, m.z - P.z);
    if (j.kind === 'tuk') { // on foot (just switched away from, or the mission ended): walks off, then is back on the road
      if (m.hidden) { if (dP < TUK_SPAWN && !g.indoor) this.spawnTuk(m); return; }
      if (dP > 30 || !sq.inView(m.x, m.y, m.z)) { this.hide(m); m.x += Math.sin(m.yaw) * 40; m.z += Math.cos(m.yaw) * 40; return; }
      const ax = m.x + (m.x - P.x) / (dP || 1) * 10, az = m.z + (m.z - P.z) / (dP || 1) * 10; sq.steer(m, dt, ax, az, 1.5, bodies); return;
    }
    if (g.indoor) { this.hide(m); return; }
    const spots = this.spotsFor(m); const s = spots[l.spot % spots.length]; const ds = Math.hypot(s.x - m.x, s.z - m.z);
    if (dP > NEAR) { m.x = s.x; m.z = s.z; m.y = s.y; m.yaw = s.yaw; if (A.action) A.set(null); this.hide(m); return; }
    const wasHidden = m.hidden; this.show(m); if (wasHidden) { m.x = s.x; m.z = s.z; m.y = s.y; m.yaw = s.yaw; sq.syncFollower(m); }
    if (ds > 0.4) { // heading back to work (or over to the other bay)
      if (ds > 15 && !sq.inView(m.x, m.y, m.z)) { m.x = s.x; m.z = s.z; m.y = s.y; m.yaw = s.yaw; sq.syncFollower(m); return; }
      if (A.action && A.action !== 'crouch') A.set(null); sq.steer(m, dt, s.x, s.z, ds > 6 ? 1.6 : 1.1, bodies); return;
    }
    // at the bay / counter: work in short bouts, sometimes move to the other spot
    m.speed = 0; m.yaw = dampAngleTo(m.yaw, s.yaw, dt); l.t += dt;
    if (!A.action || l.t > l.next) { if (spots.length > 1 && l.t > 4 && Math.random() < 0.15) { l.spot++; l.t = 0; l.next = 0; A.set(null); } else { const a = pickW(j.acts); A.play(a[0], a[1]); l.t = 0; l.next = a[1] + 0.5 + Math.random() * 2; } }
    A.update(dt, 0, 0); sq.syncFollower(m);
  }
}
function dampAngleTo(a, b, dt) { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return a + d * (1 - Math.exp(-6 * dt)); }
