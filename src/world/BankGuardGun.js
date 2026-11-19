// 73rd: the Ceylon Meridian Bank security officer's 12-gauge pump-action shotgun.
//
// Calm: the gun hangs on its sling across his back (muzzle up over the right shoulder) and he keeps to his usual guard
// routine — nothing here runs while he is calm and the gun is slung (no allocations, no rays, no IK).
// Alert — the player is inside the banking hall while wanted: he turns on the player, reaches over his shoulder for the
// sling, brings the gun round into both hands, shoulders it and shouts a warning ("Stop! Security! …"; "Drop it! …" when
// the player has a gun out, and fires sooner). Then he fires aimed shots: nine pellets of buckshot per shell, each one
// traced through the hall (walls, floor, ceiling, the counter and furniture, the player); a hit costs health by how many
// pellets land and how far they flew. Every shot is followed by the pump — fore-end racked back and forward, the empty red
// hull spinning out of the port and bouncing on the granite. Four in the tube plus one chambered; when the tube runs dry
// he thumbs shells in one at a time from his belt (the support hand goes to the belt, then to the loading port) and racks
// one in. He never fires with a customer or a colleague in the line (he waits for a clear shot instead).
// Wanted over, or the player gone from the hall for a few seconds: he lowers the gun, tells the hall to stay calm, slings
// it again and tops the tube up.
//
// Pose: the same rig as the police officers' rifles (Firefight.pose — chest-space weapon matrix, shoulder pocket per body
// (Pocket.js), arm IK with the support hand on the fore-end, which follows the pump). Sounds: Audio.shotgun / shotgunPump /
// shotgunShell (sounds board → Bank: own recordings or the built-in synth); lines: dialogs window → Bank staff → Security.
import * as THREE from 'three';
import { buildShotgun } from '../combat/WeaponModels.js';
import { pocketFor, protractFor, protractLFor, elbowPole } from '../combat/Pocket.js';
import { Audio } from '../audio/Audio.js';
import { bloomHotAt } from '../gfx/BloomHot.js';
import { clamp, lerp } from '../core/math.js';

export const GUARD_GUN = { tube: 4, pellets: 9, spread: 0.024, pelletDmg: 4.5, farDmg: 1.8, near: 6, far: 25, cycle: 1.0, pumpIn: 0.24, pumpDur: 0.44, load: 0.62, draw: 0.75,
  warn: 1.6, warnArmed: 0.55, calm: 3.2, obsH: 1.02, range: 40 };
// (his four lines are VoiceDefs.BANK_GUARD — dialogs window → Bank staff; BankInterior says them)

const sm = (x) => { const t = clamp(x, 0, 1); return t * t * (3 - 2 * t); };
const seg = (t, a, b) => clamp((t - a) / (b - a), 0, 1);
const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const qE = (x, y, z) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z));
const Q_GRIP = qE(-0.8, 0, 0), Q_SUP = qE(0.1, 0, -Math.PI / 2);
const gauss = (r) => (r() + r() + r() - 1.5) * 1.15;

// ---------------------------------------------------------------- pure geometry (unit-tested in tools/bank-guard-test.mjs)
// nearest hit of a ray (room-local frame) in the banking hall: its shell (walls / floor / ceiling) and the furniture boxes
// (obstacle footprints up to the counter-top height). Returns { t, kind: 'wall' | 'floor' | 'ceil' | 'obs' | 'none', n }.
export function rayHall(o, d, B, obs, nObs, maxT = GUARD_GUN.range) {
  let t = maxT, kind = 'none', nx = 0, ny = 0, nz = 0;
  if (d.x > 1e-6) { const s = (B.xR - o.x) / d.x; if (s > 0 && s < t) { t = s; kind = 'wall'; nx = -1; ny = 0; nz = 0; } } else if (d.x < -1e-6) { const s = (B.xL - o.x) / d.x; if (s > 0 && s < t) { t = s; kind = 'wall'; nx = 1; ny = 0; nz = 0; } }
  if (d.z > 1e-6) { const s = (B.zF - o.z) / d.z; if (s > 0 && s < t) { t = s; kind = 'wall'; nx = 0; ny = 0; nz = -1; } } else if (d.z < -1e-6) { const s = (B.z0 - o.z) / d.z; if (s > 0 && s < t) { t = s; kind = 'wall'; nx = 0; ny = 0; nz = 1; } }
  if (d.y < -1e-6) { const s = -o.y / d.y; if (s > 0 && s < t) { t = s; kind = 'floor'; nx = 0; ny = 1; nz = 0; } } else if (d.y > 1e-6) { const s = (B.H - o.y) / d.y; if (s > 0 && s < t) { t = s; kind = 'ceil'; nx = 0; ny = -1; nz = 0; } }
  const H = B.obsH ?? GUARD_GUN.obsH;
  for (let i = 0; i < nObs; i++) { const b = obs[i]; if (b.x0 > 1e4) continue; // (a hidden part's obstacle is parked far away)
    let t0 = 0, t1 = t, ax = 0; const S = [[o.x, d.x, b.x0, b.x1], [o.y, d.y, 0, H], [o.z, d.z, b.z0, b.z1]]; let ok = true;
    for (let k = 0; k < 3; k++) { const [p, v, lo, hi] = S[k]; if (Math.abs(v) < 1e-9) { if (p < lo || p > hi) { ok = false; break; } continue; } let a = (lo - p) / v, c = (hi - p) / v; if (a > c) { const q = a; a = c; c = q; } if (a > t0) { t0 = a; ax = k; } if (c < t1) t1 = c; if (t0 > t1) { ok = false; break; } }
    if (ok && t0 > 0.05 && t0 < t) { t = t0; kind = 'obs'; nx = ax === 0 ? -Math.sign(d.x) : 0; ny = ax === 1 ? -Math.sign(d.y) : 0; nz = ax === 2 ? -Math.sign(d.z) : 0; } }
  return { t, kind, nx, ny, nz };
}
// ray vs an upright body (cylinder from y0 to y1, radius r); returns the distance along the ray or −1
export function rayBody(o, d, x, z, y0, y1, r, maxT) {
  const dh2 = d.x * d.x + d.z * d.z; if (dh2 < 1e-9) return -1; const rx = x - o.x, rz = z - o.z; const tc = (rx * d.x + rz * d.z) / dh2; const cx = o.x + d.x * tc - x, cz = o.z + d.z * tc - z;
  const h2 = cx * cx + cz * cz; if (h2 > r * r) return -1; const t = tc - Math.sqrt((r * r - h2) / dh2); if (t < 0.05 || t > maxT) return -1; const y = o.y + d.y * t; return y >= y0 && y <= y1 ? t : -1;
}
// damage of one buckshot pellet after flying d metres
export const pelletDamage = (d) => (d <= GUARD_GUN.near ? GUARD_GUN.pelletDmg : lerp(GUARD_GUN.pelletDmg, GUARD_GUN.farDmg, clamp((d - GUARD_GUN.near) / (GUARD_GUN.far - GUARD_GUN.near), 0, 1)));
// is anyone (other than the target) standing within 0.42 m of the line from the muzzle to the target?
export function lineBlocked(ox, oz, tx, tz, bodies) {
  const ax = tx - ox, az = tz - oz, L2 = ax * ax + az * az || 1; for (const b of bodies) { const t = ((b.x - ox) * ax + (b.z - oz) * az) / L2; if (t < 0.04 || t > 0.97) continue; const px = ox + ax * t - b.x, pz = oz + az * t - b.z; if (px * px + pz * pz < 0.42 * 0.42) return true; } return false;
}

// ---------------------------------------------------------------- shared look (created once)
let LOOK = null;
function look() {
  if (LOOK) return LOOK; let map = null;
  if (typeof document !== 'undefined' && document.createElement) { try { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext && c.getContext('2d'); if (x && x.createRadialGradient) { const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,248,215,1)'); gr.addColorStop(0.22, 'rgba(255,196,90,0.92)'); gr.addColorStop(1, 'rgba(255,110,20,0)'); x.fillStyle = gr; x.fillRect(0, 0, 64, 64); map = new THREE.CanvasTexture(c); } } catch (e) { map = null; } }
  const hull = new THREE.CylinderGeometry(0.0106, 0.0106, 0.068, 10, 1); hull.rotateX(Math.PI / 2); const P = hull.attributes.position; const col = new Float32Array(P.count * 3);
  for (let i = 0; i < P.count; i++) { const brass = P.getZ(i) < -0.018; col.set(brass ? [0.72, 0.56, 0.26] : [0.62, 0.07, 0.06], i * 3); } hull.setAttribute('color', new THREE.BufferAttribute(col, 3));
  LOOK = { flashGeo: new THREE.PlaneGeometry(1, 1), flashMat: new THREE.MeshBasicMaterial({ map, color: 0xffd08a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
    hullGeo: hull, hullMat: new THREE.MeshStandardMaterial({ name: 'Shotgun hull', vertexColors: true, roughness: 0.55, metalness: 0.15 }) };
  return LOOK;
}
// the shotgun on its sling across the back, muzzle up over the right shoulder (chest space)
function slungMatrix() {
  const d = new THREE.Vector3(-0.4, 0.9, -0.04).normalize(); const x = new THREE.Vector3(0, 0, -1); const y = new THREE.Vector3().crossVectors(d, x).normalize(); const xx = new THREE.Vector3().crossVectors(y, d).normalize();
  const M = new THREE.Matrix4().makeBasis(xx, y, d); const mid = new THREE.Vector3(0.02, 0.0, -0.2); const off = new THREE.Vector3(0, 0.03, 0.17).applyMatrix4(new THREE.Matrix4().extractRotation(M)); M.setPosition(mid.sub(off)); return M;
}

// ---------------------------------------------------------------- the guard's gun
// opts: { game, g (the hall group), gd (stand.guard), B: { xL, xR, z0, zF, H }, obs, nObs, bodies(): [{x,z}] (customers + staff,
//         room-local), say(lineIndex), fright(), rng }
export function makeGuardGun(opts) {
  const { game, g, gd, B, obs } = opts; const rng = opts.rng || Math.random; const ch = gd.ch, A = ch.anim;
  const m = buildShotgun(); m.name = 'CMB · guard shotgun'; m.matrixAutoUpdate = false; m.traverse((q) => { if (q.isMesh) q.castShadow = false; });
  const L = look(); const fl = new THREE.Group(); for (let i = 0; i < 3; i++) { const q = new THREE.Mesh(L.flashGeo, L.flashMat); if (i < 2) { q.scale.set(0.13, 0.36, 1); q.position.z = 0.15; q.rotation.x = Math.PI / 2; q.rotation.y = i * Math.PI / 2; } else q.scale.set(0.24, 0.24, 1); fl.add(q); }
  fl.position.copy(m.userData.muzzle); fl.visible = false; m.add(fl); const ud = m.userData; ud.flash = fl;
  const slingM = slungMatrix(); m.matrix.copy(slingM); ch.bones.chest.add(m);
  const S = { m, draw: 0, aim: 0, kick: 0, flashT: 0, alert: false, calmT: 0, aimT: 0, cd: 0, holdT: 0, tube: GUARD_GUN.tube, chamber: true, pumpIn: -1, pumpT: -1, loadT: -1, loadDone: false, said: -1, saidT: 0, slung: true,
    stats: { draws: 0, shots: 0, pellets: 0, hits: 0, dmg: 0, holds: 0, pumps: 0, loads: 0, standDowns: 0, warnings: 0 }, hulls: [], pole: new THREE.Vector3() };
  const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _o = new THREE.Vector3(), _d = new THREE.Vector3(), _pk = new THREE.Vector3(), _inv = new THREE.Matrix4();
  const wanted = () => !!(game.police && game.police.stars && game.police.stars() > 0 && !game.police.busy);
  const playerArmed = () => !!(game.weapons && game.weapons.drawn);
  const worldOf = (lx, ly, lz, out) => { g.updateWorldMatrix(true, false); return out.set(lx, ly, lz).applyMatrix4(g.matrixWorld); };

  // ---- one shot of buckshot from the muzzle at the player (room-local frame)
  function fire(pl) {
    m.updateWorldMatrix(true, false); const mzW = _w.copy(ud.muzzle).applyMatrix4(m.matrixWorld); _inv.copy(g.matrixWorld).invert(); const o = _o.copy(mzW).applyMatrix4(_inv);
    const P = pl.P || game.player || {}; const crouch = !!P.crouching; const py = pl.y || 0; const top = py + (crouch ? 1.2 : 1.78);
    const tx = pl.x, ty = py + (crouch ? 0.82 : 1.22), tz = pl.z; const dist = Math.hypot(tx - o.x, tz - o.z);
    const mv = P.speed || 0; let sigma = 0.1 + dist * 0.022 + mv * 0.06; if (!S.alertShots) sigma *= 1.5; // aim error at the target (m): the first shot is the hastiest
    const aim = new THREE.Vector3(tx, ty, tz); const fwd = aim.clone().sub(o).normalize(); const right = new THREE.Vector3(fwd.z, 0, -fwd.x).normalize(); const up = new THREE.Vector3().crossVectors(right, fwd);
    aim.addScaledVector(right, gauss(rng) * sigma).addScaledVector(up, gauss(rng) * sigma * 0.8); const dir = aim.sub(o).normalize(); const r2 = new THREE.Vector3(dir.z, 0, -dir.x).normalize(), u2 = new THREE.Vector3().crossVectors(r2, dir);
    let hits = 0, marks = 0; const W = game.weapons; const fx = !!(W && W.fx); const dirW = dir.clone().transformDirection(g.matrixWorld);
    for (let i = 0; i < GUARD_GUN.pellets; i++) {
      _d.copy(dir).addScaledVector(r2, gauss(rng) * GUARD_GUN.spread).addScaledVector(u2, gauss(rng) * GUARD_GUN.spread).normalize();
      const h = rayHall(o, _d, B, obs, opts.nObs, GUARD_GUN.range); const tp = pl.inside ? rayBody(o, _d, pl.x, pl.z, py + 0.05, top, 0.3, h.t) : -1;
      if (tp >= 0) { hits++; continue; }
      if (fx && h.kind !== 'none' && marks < 4) { marks++; const p = worldOf(o.x + _d.x * h.t + h.nx * 0.004, o.y + _d.y * h.t + h.ny * 0.004, o.z + _d.z * h.t + h.nz * 0.004, new THREE.Vector3()); const dw = _d.clone().transformDirection(g.matrixWorld);
        if (h.kind === 'floor') W.decal(p, dw, 'ground'); else { const nW = new THREE.Vector3(h.nx, h.ny, h.nz).transformDirection(g.matrixWorld); W.decal(p, nW.multiplyScalar(-1), 'world'); } if (marks <= 2) W.puff(p, h.kind === 'floor' ? 0x9d978c : 0xd9d3c7, 2); }
    }
    S.stats.shots++; S.alertShots = (S.alertShots || 0) + 1; S.stats.pellets += GUARD_GUN.pellets; S.kick = 1; S.chamber = false; S.spent = true; S.pumpIn = GUARD_GUN.pumpIn; S.cd = GUARD_GUN.cycle + rng() * 0.45;
    if (A.shotKick) A.shotKick('rifle', 1.6);
    // muzzle: flash, the bloom hot-spot, a grey cloud of gas rolling off the muzzle
    fl.visible = true; fl.rotation.z = rng() * 3; fl.scale.setScalar(0.9 + rng() * 0.3); S.flashT = 0.045; bloomHotAt(mzW.x, mzW.y, mzW.z);
    if (fx) { W.puff(mzW.clone().addScaledVector(dirW, 0.12), 0xa8a8a4, 3); }
    Audio.shotgun && Audio.shotgun(mzW.x, mzW.z);
    if (hits > 0) { const dmg = hits * pelletDamage(dist); S.stats.hits++; S.stats.dmg += dmg; const pw = worldOf(tx, ty, tz, new THREE.Vector3());
      if (!(game.blood && game.blood.spray && game.blood.spray(pw, dirW, Math.min(1, hits / 6))) && fx) W.puff(pw, 0x8a8478, 2);
      if (game.health && game.health.damage) game.health.damage(dmg, 'shot by the bank guard'); }
    if (game.crowd && game.crowd.alarm) game.crowd.alarm(mzW.x, mzW.z, 90, 2, null, 'gunshot'); if (game.birds && game.birds.scare) game.birds.scare(mzW.x, mzW.z, 40);
    if (S.alertShots === 1) { if (opts.fright) opts.fright(); say(2); }
    return hits;
  }
  // the empty hull out of the ejection port, onto the floor (room-local)
  function ejectHull() {
    let h = S.hulls.find((q) => !q.m.visible); if (!h) { if (S.hulls.length >= 6) h = S.hulls.shift(); else h = { m: new THREE.Mesh(L.hullGeo, L.hullMat), v: new THREE.Vector3(), s: new THREE.Vector3() }; h.m.castShadow = false; h.m.name = 'CMB · shotgun hull'; g.add(h.m); S.hulls.push(h); }
    m.updateWorldMatrix(true, false); _inv.copy(g.matrixWorld).invert(); const p = _v.copy(ud.eject).applyMatrix4(m.matrixWorld).applyMatrix4(_inv); h.m.position.copy(p); h.m.visible = true; h.rest = false;
    const side = new THREE.Vector3(-1, 0.7, -0.15).transformDirection(m.matrixWorld).transformDirection(_inv); h.v.copy(side).multiplyScalar(1.6 + rng() * 0.8); h.s.set((rng() - 0.5) * 30, (rng() - 0.5) * 30, (rng() - 0.5) * 10); h.bounce = 0;
  }
  function stepHulls(dt) {
    for (const h of S.hulls) { if (!h.m.visible || h.rest) continue; h.v.y -= 9.8 * dt; h.m.position.addScaledVector(h.v, dt); h.m.rotation.x += h.s.x * dt; h.m.rotation.y += h.s.y * dt; h.m.rotation.z += h.s.z * dt;
      if (h.m.position.y < 0.0106) { h.m.position.y = 0.0106; if (h.v.y < -0.6 && h.bounce < 3) { h.v.y *= -0.32; h.v.x *= 0.6; h.v.z *= 0.6; h.s.multiplyScalar(0.5); h.bounce++; } else { h.rest = true; h.m.rotation.set(0, h.m.rotation.y, 0); } } }
  }
  function say(i) { if (S.said === i && S.saidT > 0) return; S.said = i; S.saidT = 3; S.stats.warnings++; if (opts.say) opts.say(i); }

  // ---- weapon pose (body / chest space), before the animator update (as Firefight.pose)
  function pose(dt) {
    const aw = sm(S.aim), k = sm(S.draw);
    if (S.flashT > 0) { S.flashT -= dt; if (S.flashT <= 0) fl.visible = false; }
    S.kick = Math.max(0, S.kick - dt * 9);
    if (k <= 0.001) { if (!S.slung) { S.slung = true; m.matrix.copy(slingM); m.matrixWorldNeedsUpdate = true; ud.pump.position.z = 0; if (A.ik && A.ik.rifle) { A.ik = null; A.aim = null; } } return; }
    S.slung = false; const pl = opts.pl || {}; const ey = 1.45; const pitch = aw > 0.05 ? clamp(Math.atan2(((pl.y || 0) + 1.1) - ey, Math.max(0.5, Math.hypot(pl.x - gd.x, pl.z - gd.z))), -0.7, 0.5) : -0.1;
    A.aim = { pitch: pitch * aw - 0.05 * (1 - aw), twist: 0.5, w: Math.max(aw, 0.65) * k, headDown: 0.12 * aw, protractR: protractFor(ch) * aw, protractL: protractLFor(ch) * aw };
    const POCKET = pocketFor(ch, m, _pk); const lowQ = qE(0.62, 0.06, 0.2); const butt = new THREE.Vector3(POCKET.x - 0.02, POCKET.y - 0.03, POCKET.z); const low = butt.sub(new THREE.Vector3(0, 0, ud.buttZ).applyQuaternion(lowQ));
    const aimP = new THREE.Vector3(POCKET.x, POCKET.y - ud.support.y, POCKET.z - ud.buttZ); const pos = low.clone().lerp(aimP, aw); let rx = lerp(0.62, 0, aw), ry = lerp(0.06, 0, aw), rz = lerp(0.2, 0, aw);
    pos.z -= 0.05 * S.kick; rx -= 0.16 * S.kick; pos.y += 0.01 * S.kick;
    // the pump: fore-end back 9 cm and home again; loading: the gun rolled to show its loading port, the hand belt → port
    let pumpOff = 0; if (S.pumpT >= 0) { const r = S.pumpT / GUARD_GUN.pumpDur; pumpOff = ud.pumpTravel * (sm(seg(r, 0, 0.42)) - sm(seg(r, 0.55, 0.95))); }
    ud.pump.position.z = -pumpOff; let supTo = null, supK = 0;
    if (S.loadT >= 0) { const r = (S.loadT % GUARD_GUN.load) / GUARD_GUN.load; rz += 0.55; rx += 0.18; supTo = r < 0.45 ? 'belt' : 'port'; supK = r < 0.45 ? sm(seg(r, 0.05, 0.4)) : sm(seg(r, 0.45, 0.72)) * (1 - sm(seg(r, 0.9, 1))); }
    const body = new THREE.Matrix4().compose(pos, new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), new THREE.Vector3(1, 1, 1));
    let chestM = new THREE.Matrix4().multiplyMatrices(new THREE.Matrix4().makeRotationY(0.5), body);
    if (k < 0.999) { const a = new THREE.Vector3(), aq = new THREE.Quaternion(), b = new THREE.Vector3(), bq = new THREE.Quaternion(), sc = new THREE.Vector3(); slingM.decompose(a, aq, sc); chestM.decompose(b, bq, sc); chestM = new THREE.Matrix4().compose(a.lerp(b, k), aq.slerp(bq, k), new THREE.Vector3(1, 1, 1)); }
    m.matrix.copy(chestM); m.matrixWorldNeedsUpdate = true;
    const wQ = new THREE.Quaternion().setFromRotationMatrix(chestM); const grip = new THREE.Vector3().applyMatrix4(chestM); let sup = new THREE.Vector3(ud.support.x, ud.support.y, ud.support.z - pumpOff).applyMatrix4(chestM);
    const belt = new THREE.Vector3(0.16, -0.4, 0.06).applyMatrix4(new THREE.Matrix4().makeRotationY(0.5)); const port = ud.loadPort.clone().applyMatrix4(chestM);
    if (supTo === 'belt') sup.lerp(belt, supK); else if (supTo === 'port') sup = belt.clone().lerp(port, supK);
    const b = ch.bones; b.shL.updateMatrix(); const sh = b.armL.position.clone().applyMatrix4(b.shL.matrix); const armMax = (b.foreL.position.length() + b.handL.position.length()) * 0.98 + 0.05; const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(wQ);
    if (!supTo) for (let it = 0; it < 6; it++) { const dd = sup.distanceTo(sh); if (dd <= armMax) break; sup.addScaledVector(fwd, -Math.min(0.06, (dd - armMax) * 1.05)); }
    const wR = k < 0.35 ? sm(k / 0.35) : 1, wL = sm(seg(k, 0.55, 1));
    A.ik = { R: grip, qR: wQ.clone().multiply(Q_GRIP), wR, L: wL > 0.01 ? sup : null, qL: wQ.clone().multiply(Q_SUP), wL, rifle: true, poleR: elbowPole(aw * k, S.pole) };
  }

  // ---- per frame; returns true while the gun has the guard (BankInterior then skips his routine)
  S.step = (dt, pl, onDuty = true) => {
    opts.pl = pl; if (S.saidT > 0) S.saidT -= dt; const hot = S.hulls.length ? (stepHulls(dt), true) : false; void hot;
    const want = onDuty && pl && pl.inside && wanted() && !(game.health && game.health.busy);
    if (want) { if (!S.alert) { S.alert = true; S.stats.draws++; S.aimT = 0; S.said = -1; S.alertShots = 0; if (A.action) A.set(null); A.seated = false; } S.calmT = 0; }
    else if (S.alert) { S.calmT += dt; if (S.calmT > GUARD_GUN.calm) { S.alert = false; S.stats.standDowns++; say(3); } }
    if (!S.alert && S.draw <= 0 && S.slung && S.pumpT < 0 && S.loadT < 0) return false; // calm and slung: nothing to do
    gd.stunT = 0; gd.stunA = 0; // trained: a kicked-in door doesn't freeze him
    // face the player (or back to the post when standing down)
    const ry = ch.root.rotation.y; const tgt = S.alert && pl ? Math.atan2(pl.x - gd.x, pl.z - gd.z) : gd.yaw0; ch.root.rotation.y = ry + angDiff(tgt, ry) * Math.min(1, dt * (S.alert ? 7 : 2.5));
    S.draw = clamp(S.draw + (S.alert ? dt / GUARD_GUN.draw : -dt / 0.8), 0, 1);
    const facing = Math.abs(angDiff(tgt, ch.root.rotation.y)) < 0.25; const aiming = S.alert && S.draw > 0.85 && S.loadT < 0;
    S.aim = clamp(S.aim + (aiming ? dt * 5 : -dt * 3.5), 0, 1);
    if (S.alert && S.draw > 0.3 && S.said < 0) say(playerArmed() ? 1 : 0); else if (S.alert && S.said === 0 && playerArmed() && S.saidT < 2.2) say(1);
    // pump / load cycle (runs to the end even while standing down)
    if (S.pumpIn >= 0) { S.pumpIn -= dt; if (S.pumpIn < 0) { S.pumpT = 0; S.stats.pumps++; S.pumpHull = !!S.spent; const p = worldOf(gd.x, 1.2, gd.z, _v); Audio.shotgunPump && Audio.shotgunPump(p.x, p.z); } }
    if (S.pumpT >= 0) { S.pumpT += dt; if (S.pumpHull && S.pumpT > GUARD_GUN.pumpDur * 0.4) { S.pumpHull = false; S.spent = false; ejectHull(); }
      if (S.pumpT >= GUARD_GUN.pumpDur) { S.pumpT = -1; if (S.tube > 0) { S.tube--; S.chamber = true; } else if (!S.chamber) S.loadT = 0; } } // a dry tube: the pump comes back empty → load
    if (S.loadT >= 0) { const before = Math.floor(S.loadT / GUARD_GUN.load + 0.28); S.loadT += dt; const after = Math.floor(S.loadT / GUARD_GUN.load + 0.28); let stop = S.tube >= GUARD_GUN.tube;
      if (after > before && S.tube < GUARD_GUN.tube) { S.tube++; S.stats.loads++; const p = worldOf(gd.x, 1.2, gd.z, _v); Audio.shotgunShell && Audio.shotgunShell(p.x, p.z); // the shell goes in as the thumb reaches the port
        const close = pl && pl.inside && Math.hypot(pl.x - gd.x, pl.z - gd.z) < 5; stop = S.tube >= GUARD_GUN.tube || (S.alert && close && S.tube >= 2); }
      if (stop && (after > before || S.tube >= GUARD_GUN.tube)) { S.loadT = -1; if (!S.chamber) S.pumpIn = 0.15; } }
    // fire
    if (S.alert && aiming && S.aim > 0.92 && facing) { S.aimT += dt; S.cd -= dt; S.holdT -= dt;
      const warnT = playerArmed() ? GUARD_GUN.warnArmed : GUARD_GUN.warn;
      if (S.chamber && S.pumpT < 0 && S.pumpIn < 0 && S.loadT < 0 && S.aimT > warnT && S.cd <= 0 && S.holdT <= 0 && pl.inside) {
        const bodies = opts.bodies ? opts.bodies() : []; if (lineBlocked(gd.x, gd.z, pl.x, pl.z, bodies)) { S.holdT = 0.5; S.stats.holds++; } else fire(pl); } }
    else if (S.alert) S.aimT = Math.min(S.aimT, 0.3);
    if (!S.alert && S.draw <= 0 && S.tube < GUARD_GUN.tube && S.loadT < 0 && S.pumpIn < 0 && S.pumpT < 0) { S.tube = GUARD_GUN.tube; S.chamber = true; for (const h of S.hulls) h.m.visible = false; } // slung again: topped up out of sight (the hulls swept up)
    pose(dt);
    return S.alert || S.draw > 0;
  };
  S.reset = () => { S.alert = false; S.draw = 0; S.aim = 0; S.pumpIn = -1; S.pumpT = -1; S.loadT = -1; S.tube = GUARD_GUN.tube; S.chamber = true; S.said = -1; fl.visible = false; for (const h of S.hulls) h.m.visible = false; pose(0); };
  S.dispose = () => { m.parent && m.parent.remove(m); for (const h of S.hulls) h.m.parent && h.m.parent.remove(h.m); S.hulls.length = 0; if (A.ik && A.ik.rifle) { A.ik = null; A.aim = null; } };
  S.fire = fire; S.opts = opts; // (tests)
  return S;
}
