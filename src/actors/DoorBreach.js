// 73rd: breaching a shop door (middle mouse, on foot, facing a closed walk-in door from the street).
// He squares up to it — a short step to the latch side, an arm's length off the leaf — and drives a front kick (chamber, heel
// into the leaf beside the lock, recoil, foot down: Character 'doorKick'). A glazed aluminium / black shopfront door bursts on
// the first kick; a heavy door (steel, the bank's bronze doors, a timber wicket) takes the first one — a dead thud, the frame
// rattles, dust off the jamb — and goes on the second. The latch tears out, the leaf slams round to its stop and hangs there
// with its closer broken (WalkIn.breach: no closer for a while). The bang carries: people inside flinch and cower (each room's
// own reaction — the bank's customers, staff and guard; a shop keeper), people on the pavement turn and react (Crowd.alarm).
// Costs nothing until it happens (no per-frame work, no new materials or meshes).
import { Input } from '../core/Input.js';

const KICK_T = 1.05, IMPACT_T = 0.4;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export function findBreach(W, P) {
  if (!W || !P.control || P.vehicle || P.indoor || P.entry || P.exiting || P.climb || P.swim || !P.grounded || P.dead || P.cover) return null;
  let best = null, bd = 9;
  for (const s of W.sites) { if (s.dist > 3.2) continue; const D = s.doorObj; if (!D || Math.abs(D.ang) > 0.08 || D.breachT > 0) continue; const [lx, lz] = W.local(s, P.x, P.z); const hw = D.w / 2;
    if (Math.abs(lx) > hw + 0.6 || lz < 0.15 || lz > 2.4 || Math.abs(P.y - s.y0) > 0.6) continue;
    const fw = W.local(s, s.F.x + Math.sin(P.yaw), s.F.z + Math.cos(P.yaw)); const toward = -fw[1]; const camF = W.local(s, s.F.x + Math.sin(P.camYaw + Math.PI), s.F.z + Math.cos(P.camYaw + Math.PI));
    if (toward < 0.35 && -camF[1] < 0.5) continue; const d = Math.hypot(lx, lz); if (d < bd) { bd = d; best = s; } }
  return best;
}
export function startBreach(W, P, s) {
  const D = s.doorObj; const latch = -D.hinge * (D.w / 2 - 0.3); const sc = P.ch.spec ? P.ch.spec.height / 1.72 : 1;
  const stance = { lx: latch * 0.55, lz: 0.72 * sc }; const [x, z] = W.world(s, stance.lx, stance.lz);
  P.breach = { W, s, ph: 'set', t: 0, n: 0, x, z, yaw: wrap(s.yaw + Math.PI), hit: false }; P.speed = 0; P.sprinting = false; P.crouching = false;
  return P.breach;
}
// one frame of it; returns false once it is over (or called off) and the normal on-foot update carries on
export function updateBreach(P, dt) {
  const B = P.breach, A = P.ch.anim; B.t += dt;
  if (!P.control || P.vehicle || P.dead || P.entry) { endBreach(P); return false; }
  if (B.ph === 'set') { // square up: a couple of short steps onto the stance, turning to the door
    const dx = B.x - P.x, dz = B.z - P.z, d = Math.hypot(dx, dz); const sp = Math.min(1.25, d / Math.max(dt, 1e-4)), k = d > 1e-4 ? Math.min(1, (sp * dt) / d) : 0;
    let nx = P.x + dx * k, nz = P.z + dz * k; const r = P.collision.resolveCircle(nx, nz, 0.3, P.y, 0.45, 1.75); nx = r.x; nz = r.z; P.speed = Math.hypot(nx - P.x, nz - P.z) / Math.max(dt, 1e-4); P.x = nx; P.z = nz;
    const y0 = P.yaw; P.yaw += wrap(B.yaw - P.yaw) * (1 - Math.exp(-12 * dt)); A.update(dt, P.speed > 0.1 ? P.speed : 0, wrap(P.yaw - y0) / Math.max(dt, 1e-4));
    if ((d < 0.06 && Math.abs(wrap(B.yaw - P.yaw)) < 0.08) || B.t > 1.1) { B.ph = 'kick'; B.t = 0; B.hit = false; A.play('doorKick', KICK_T); A.kickN = B.n; }
  } else if (B.ph === 'kick') {
    P.speed = 0; P.yaw += wrap(B.yaw - P.yaw) * (1 - Math.exp(-14 * dt));
    if (!B.hit && B.t >= IMPACT_T) { B.hit = true; B.n++; const out = B.W.breach(B.s, B.n, P); P.shake = Math.max(P.shake || 0, out === 'burst' ? 0.75 : 0.45); B.out = out;
      const bx = -Math.sin(P.yaw) * 0.05, bz = -Math.cos(P.yaw) * 0.05; const r = P.collision.resolveCircle(P.x + bx, P.z + bz, 0.3, P.y, 0.45, 1.75); P.x = r.x; P.z = r.z; } // the kick drives him back off it a touch
    A.update(dt, 0, 0);
    if (B.t >= KICK_T) { if (B.out === 'hold' && B.n < 3) { B.ph = 'reset'; B.t = 0; } else { endBreach(P); P.sync(); return false; } }
  } else if (B.ph === 'reset') { A.update(dt, 0, 0); if (B.t > 0.22) { B.ph = 'kick'; B.t = 0; B.hit = false; A.play('doorKick', KICK_T); A.kickN = B.n; } } // set again — and the second one
  P.grounded = true; A.air = 0; const g = P.collision.groundAt(P.x, P.z, P.y, 0.5); P.y += (g - P.y) * Math.min(1, dt * 20); P.sync();
  if (A.stepped) { A.stepped = false; if (P.speed > 0.3) P.events.emit('footstep', { x: P.x, z: P.z, sprint: false }); }
  return true;
}
export function endBreach(P) { const A = P.ch.anim; if (A.action === 'doorKick') A.set(null); P.breach = null; }
export const breachPressed = () => Input.mousePressed.has(1);
