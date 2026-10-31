// Street life: what people in Colombo do besides walking somewhere. They stop at the roadside for a cigarette, read the
// paper at a bus stop or on a bench, take a phone call, go for a run, walk out as a couple (holding hands, a hug and a
// kiss), and now and then two men square up in the street. A fight is reported by a bystander; a Sri Lanka Police patrol
// car comes, the officers break it up, handcuff both men and drive them away (PoliceResponse.civilCall). Non-graphic.
//
// The people are ordinary crowd pedestrians (Crowd.js) in the 'scene' state; poses come from the shared rig
// (Character.js actions smoke / paper / guard / cuffed / hold + lean). Props are small shared meshes in the hands.
import * as THREE from 'three';
import * as L from '../world/Layout.js';
import { clamp, lerp, dampAngle, wrapAngle } from '../core/math.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _q = new THREE.Quaternion();
const _v4 = new THREE.Vector3(), _q2 = new THREE.Quaternion(), _s = new THREE.Vector3(), _s2 = new THREE.Vector3(), _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _ax = new THREE.Vector3(1, 0, 0);
const PHONE_IN_HAND = new THREE.Vector3(0.024, -0.078, 0.008), PHONE_EAR_ROT = Math.atan2(0.6, -0.8); // in the palm; at the ear: screen to the cheek, bottom towards the mouth
const sm = (k) => { k = clamp(k, 0, 1); return k * k * (3 - 2 * k); };
const PAGE_W = 0.28, PAGE_H = 0.4, PAGE_V = 0.22; // newspaper leaf size (m) and the V the two leaves make toward the reader

// ------------------------------------------------------------------ props
let RES = null;
function canvasTex(w, h, draw) {
  try { if (typeof document === 'undefined') return null; const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext && c.getContext('2d'); if (!g || !g.fillRect) return null; draw(g, w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; } catch (e) { return null; }
}
// newspaper pages (original, fictional title; real English headlines, body text drawn as column rules seen from afar)
function pageTex(kind) {
  return canvasTex(256, 366, (g, w, h) => {
    g.fillStyle = '#ebe7dc'; g.fillRect(0, 0, w, h);
    const ink = '#232323', rule = (x, y, ww) => { g.fillStyle = 'rgba(40,40,40,0.55)'; g.fillRect(x, y, ww, 2); };
    const cols = (x0, y0, x1, y1, n) => { const cw = (x1 - x0 - (n - 1) * 8) / n; for (let c = 0; c < n; c++) for (let y = y0; y < y1; y += 6) rule(x0 + c * (cw + 8), y, cw * (y % 42 === 0 ? 0.7 : 1)); };
    g.fillStyle = ink; g.textAlign = 'center';
    const fit = (txt, px, y, max = w - 22) => { let f = px; do { g.font = `bold ${f}px Georgia, serif`; f--; } while (g.measureText(txt).width > max && f > 8); g.fillText(txt, w / 2, y); };
    if (kind === 'front') {
      fit('THE CEYLON LANTERN', 27, 36); g.fillRect(12, 46, w - 24, 2); g.font = '10px Georgia, serif'; g.fillText('COLOMBO  ·  DAILY  ·  Rs. 70', w / 2, 60); g.fillRect(12, 66, w - 24, 1);
      fit('MONSOON RAINS RETURN', 21, 94); fit('TO THE WEST COAST', 21, 118);
      g.fillStyle = '#7d7a72'; g.fillRect(14, 130, 130, 92); g.fillStyle = '#9b978d'; g.fillRect(20, 136, 118, 54); cols(152, 132, w - 14, 222, 1); cols(14, 232, w - 14, h - 14, 3);
    } else {
      fit(kind === 'sport' ? 'LIONS CLINCH THE SERIES' : 'PORT CITY WORKS', 18, 30); fit(kind === 'sport' ? 'IN A THRILLING FINISH' : 'MOVE TO NEXT PHASE', 18, 52);
      g.fillStyle = '#88857c'; g.fillRect(w - 128, 66, 114, 80); cols(14, 68, w - 140, 146, 2); cols(14, 158, w - 14, h - 60, 3); g.fillStyle = '#8f8b81'; g.fillRect(14, h - 52, w - 28, 38);
    }
  });
}
function res() {
  if (RES) return RES;
  const std = (c, r = 0.6, m = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
  const page = (kind) => { const t = pageTex(kind); const m = new THREE.MeshStandardMaterial({ color: t ? 0xffffff : 0xe2ded2, map: t, roughness: 0.92 }); return m; };
  RES = {
    // cigarette along local +x (filter end) … −x (lit end); 84 mm
    cigPaper: new THREE.CylinderGeometry(0.0042, 0.0042, 0.06, 8).rotateZ(Math.PI / 2).translate(-0.011, 0, 0),
    cigFilter: new THREE.CylinderGeometry(0.0043, 0.0043, 0.022, 8).rotateZ(Math.PI / 2).translate(0.03, 0, 0),
    cigTip: new THREE.CylinderGeometry(0.0041, 0.0041, 0.004, 8).rotateZ(Math.PI / 2).translate(-0.043, 0, 0),
    white: std(0xf1efe8, 0.85), filter: std(0xc58a45, 0.75), flame: new THREE.MeshBasicMaterial({ color: 0xffb04a, transparent: true, opacity: 0.9, depthWrite: false }), flameGeo: new THREE.ConeGeometry(0.006, 0.026, 8).translate(0, 0.013, 0),
    // phone: 146 × 71 × 8.5 mm, screen on the side away from the palm
    phoneBody: new THREE.BoxGeometry(0.0085, 0.146, 0.071), phoneScreen: new THREE.PlaneGeometry(0.065, 0.136).rotateY(Math.PI / 2).translate(0.0044, 0, 0),
    phoneMat: std(0x16181b, 0.35, 0.4), screenMat: new THREE.MeshStandardMaterial({ color: 0x0c1218, roughness: 0.15, metalness: 0.1, emissive: 0x1d3550, emissiveIntensity: 0.35 }),
    // newspaper leaf: two back-to-back planes hinged at the fold (x = 0), extending toward −x (right leaf) or +x (left)
    leafGeo: new THREE.PlaneGeometry(PAGE_W, PAGE_H), front: page('front'), inside: page('inside'), sport: page('sport'),
    smokeTex: canvasTex(64, 64, (g, w, h) => { const gr = g.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2); gr.addColorStop(0, 'rgba(235,235,235,0.9)'); gr.addColorStop(0.5, 'rgba(225,225,225,0.35)'); gr.addColorStop(1, 'rgba(220,220,220,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }),
  };
  return RES;
}
function cigarette() {
  const R = res(); const g = new THREE.Group(); g.add(new THREE.Mesh(R.cigPaper, R.white), new THREE.Mesh(R.cigFilter, R.filter));
  const emb = new THREE.MeshBasicMaterial({ color: 0x2a2a2a }); const tip = new THREE.Mesh(R.cigTip, emb); g.add(tip); g.userData.ember = emb;
  const fl = new THREE.Mesh(R.flameGeo, R.flame); fl.position.set(-0.05, 0.0, 0); fl.visible = false; g.add(fl); g.userData.flame = fl;
  g.position.set(0.018, -0.112, 0.01); // between the index and middle fingers (hand space: −y along the fingers, +x palm side)
  return g;
}
function phoneProp() { const R = res(); const g = new THREE.Group(); g.add(new THREE.Mesh(R.phoneBody, R.phoneMat), new THREE.Mesh(R.phoneScreen, R.screenMat)); g.position.copy(PHONE_IN_HAND); return g; }
function newspaper() {
  const R = res(); const g = new THREE.Group(); g.position.set(0, -0.035, 0.335); // chest space, in front of the reader
  const leaf = (sideX, inner, outer) => { const h = new THREE.Group(); const a = new THREE.Mesh(R.leafGeo, inner), b = new THREE.Mesh(R.leafGeo, outer);
    a.position.set(sideX * PAGE_W / 2, 0, -0.0008); a.rotation.y = Math.PI; b.position.set(sideX * PAGE_W / 2, 0, 0.0008); h.add(a, b); h.rotation.y = sideX * PAGE_V; return h; };
  const left = leaf(1, R.inside, R.front), right = leaf(-1, R.inside, R.inside); g.add(left, right); g.userData.right = right; return g;
}
// soft smoke puffs (exhaled / rising from the ember): a small shared pool of billboards
class Smoke {
  constructor(scene) { this.scene = scene; this.pool = []; this.live = []; this.ok = !!res().smokeTex; }
  puff(x, y, z, vx, vy, vz, s0, s1, a0, life) {
    if (!this.ok || !this.scene) return; let sp = this.pool.pop();
    if (!sp) { if (this.live.length > 60) return; sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: res().smokeTex, color: 0xdedede, transparent: true, depthWrite: false, opacity: 0 })); sp.renderOrder = 3; this.scene.add(sp); }
    sp.visible = true; sp.position.set(x, y, z); sp.userData = { vx, vy, vz, s0, s1, a0, life, t: 0 }; sp.scale.setScalar(s0); this.live.push(sp);
  }
  update(dt) { for (let i = this.live.length - 1; i >= 0; i--) { const sp = this.live[i], u = sp.userData; u.t += dt; const k = u.t / u.life; if (k >= 1) { sp.visible = false; this.live.splice(i, 1); this.pool.push(sp); continue; }
    sp.position.x += u.vx * dt; sp.position.y += u.vy * dt; sp.position.z += u.vz * dt; u.vx *= 1 - dt * 0.8; u.vz *= 1 - dt * 0.8; sp.scale.setScalar(lerp(u.s0, u.s1, Math.sqrt(k))); sp.material.opacity = u.a0 * (1 - k) * Math.min(1, u.t * 6); } }
  clear() { for (const sp of [...this.live, ...this.pool]) sp.parent?.remove(sp); this.live = []; this.pool = []; }
}
// world point → chest-space IK target (unscaled) for a character
function chestTarget(ch, wp, out) { const c = ch.bones.chest; c.updateWorldMatrix(true, false); out.copy(wp); c.worldToLocal(out); return out.multiplyScalar(1 / (ch.anim.s || 1)); }

// ------------------------------------------------------------------ StreetLife
export class StreetLife {
  constructor(crowd) {
    this.C = crowd; this.rng = crowd.rng; this.smoke = new Smoke(crowd.scene); this.fights = []; this.couples = []; this.t = 0;
    this.fightCd = 90 + this.rng.next() * 120; this.coupleCd = 20 + this.rng.next() * 30;
    this.stats = { smoke: 0, paper: 0, call: 0, jog: 0, couple: 0, kiss: 0, fight: 0, reported: 0, handed: 0, lipErr: 0 };
  }
  get police() { return this.C.police || null; }
  // ---------------------------------------------------------------- solo activities
  // At a graph node on the way: sometimes stop for a smoke / a phone call / a look at the paper at the building side of the pavement.
  maybeStop(p) {
    if (p.jog || p.partner || p.keep || this.C.rain || p.sit) return false; const r = this.rng, h = this.C.hour ?? 12;
    const k = r.weighted([['smoke', h >= 6 && h < 23 && p.sp.age !== 'elder' ? 0.04 : 0], ['call', 0.03], ['paper', h >= 6 && h < 12 ? 0.025 : 0.01], [null, 1]]); if (!k) return false;
    const n = L.pedNodes[p.node]; if (!n) return false;
    // stand off the walking line, toward the buildings (away from the kerb), facing the street
    const c = L.cellAt(n.x, n.z); let ax = 0, az = 0; if (c) { ax = Math.sign(c.cx - n.x) * 0.9; az = Math.sign(c.cz - n.z) * 0.9; }
    const spot = { x: n.x + ax * (0.5 + r.next() * 0.6), z: n.z + az * (0.5 + r.next() * 0.6) }; if (this.C.collision.blocked(spot.x, spot.z, 0.3) || L.roadAt(spot.x, spot.z)) { spot.x = n.x; spot.z = n.z; }
    this.startSolo(p, k, spot, Math.atan2(-ax, -az)); return true;
  }
  // POI hook (Crowd.startPoi): read the paper or take a call at a bus stop / on a bench, smoke outside a shop
  atPoi(p, q) {
    if (p.jog || p.partner) return false; const r = this.rng;
    if (q.type === 'busStop' && r.chance(0.22)) { this.startSolo(p, r.chance(0.55) ? 'paper' : 'call', { x: p.x, z: p.z }, q.rot ?? p.yaw, { dur: 20 + r.next() * 30 }); return true; }
    if (q.type === 'bench' && r.chance(0.35)) { p.benchRead = { t: 0, phase: 'sit' }; return false; } // sit first, then the paper comes out (step())
    if (q.type === 'shop' && r.chance(0.08) && p.sp.age !== 'elder') { this.startSolo(p, 'smoke', { x: p.x, z: p.z }, (q.rot ?? p.yaw) + Math.PI, { dur: 30 + r.next() * 30 }); return true; }
    return false;
  }
  startSolo(p, kind, spot, yaw, o = {}) {
    const r = this.rng; p.state = 'scene'; p.act = null; p.ch.anim.set(null);
    p.scene = { kind, solo: true, t: 0, dur: o.dur ?? (kind === 'smoke' ? 35 + r.next() * 40 : kind === 'paper' ? 30 + r.next() * 40 : 20 + r.next() * 30), spot, yaw, phase: 'go', pt: 0, next: 0 };
    this.stats[kind]++;
  }
  endSolo(p, interrupted = false) {
    const S = p.scene; if (!S) return; const A = p.ch.anim; this.dropProps(p, interrupted); A.smokeK = 0; A.smokeLight = 0; A.paperFlip = 0; p.faceYaw = undefined;
    p.scene = null; p.ch.face.talking = false; if (A.action === 'smoke' || A.action === 'paper' || A.action === 'phone') A.set(null);
    if (!interrupted) { p.state = 'walk'; p.via = null; p.toKerb = false; this.C.returnToGraph(p); }
  }
  dropProps(p) { for (const k of ['cig', 'paper']) if (p[k]) { p[k].parent?.remove(p[k]); p[k] = null; } }
  // per frame for a person in the 'scene' state: returns steering { desired, tx, tz, avoid }
  step(p, dt, ctx) {
    const S = p.scene; if (!S) { p.state = 'walk'; this.C.returnToGraph(p); return { desired: 0 }; }
    if (S.kind === 'follow') return this.stepFollow(p, dt);
    if (S.kind === 'couple') return this.stepCouple(p, dt);
    if (S.kind === 'fight') return this.stepFight(p, dt, ctx);
    const A = p.ch.anim, r = this.rng; S.t += dt;
    if (S.phase === 'go') { const d = Math.hypot(S.spot.x - p.x, S.spot.z - p.z); if (d > 0.35 && S.t < 6) return { desired: Math.min(p.pace, 0.4 + d), tx: S.spot.x, tz: S.spot.z, avoid: true }; S.phase = 'begin'; S.pt = 0; }
    p.faceYaw = S.yaw; S.pt += dt;
    if (S.kind === 'smoke') this.stepSmoke(p, S, dt, ctx);
    else if (S.kind === 'paper') this.stepPaper(p, S, dt);
    else if (S.kind === 'call') { if (A.action !== 'phone' && A.action !== 'look') A.set('phone'); p.ch.face.talking = A.action === 'phone' && Math.sin(S.t * 0.9) > -0.3; if (S.pt > 6 && r.chance(dt * 0.05)) { A.set(A.action === 'phone' ? 'look' : 'phone'); S.pt = 0; } if (A.action === 'look' && S.pt > 1.6) A.set('phone'); if (S.t > S.dur) this.endSolo(p); }
    return { desired: 0 };
  }
  // cigarette: take one out → light it (cupped hands, a little flame) → drags with a glowing ember and exhaled smoke → drop it
  stepSmoke(p, S, dt, ctx) {
    const A = p.ch.anim; if (A.action !== 'smoke') A.set('smoke');
    const R = this.C.focus ? Math.hypot(p.x - this.C.focus.x, p.z - this.C.focus.z) : 0; const near = R < 28;
    if (S.phase === 'begin') { A.smokeK = 0; if (S.pt > 0.9) { p.cig = cigarette(); p.ch.bones.handR.add(p.cig); S.phase = 'light'; S.pt = 0; } return; }
    const emb = p.cig && p.cig.userData.ember;
    if (S.phase === 'light') { A.smokeK = sm(S.pt / 0.9); A.smokeLight = sm(S.pt / 0.9) * (1 - sm((S.pt - 2.2) / 0.6)); const lit = S.pt > 1.1; if (p.cig) p.cig.userData.flame.visible = S.pt > 1.0 && S.pt < 2.0; if (emb && lit) emb.color.setRGB(1.6, 0.42, 0.08);
      if (S.pt > 2.0 && S.pt - dt <= 2.0 && near) this.exhale(p, 2); if (S.pt > 2.8) { S.phase = 'rest'; S.pt = 0; S.next = 3 + this.rng.next() * 4; } return; }
    if (S.phase === 'rest') { A.smokeK = Math.max(0, (A.smokeK || 0) - dt / 0.9); if (emb) { const f = 0.75 + Math.sin(S.t * 7.3) * 0.06; emb.color.setRGB(1.4 * f, 0.36 * f, 0.07 * f); } if (near && this.rng.chance(dt * 1.6)) this.wisp(p);
      if (S.t > S.dur) { S.phase = 'drop'; S.pt = 0; } else if (S.pt > S.next) { S.phase = 'drag'; S.pt = 0; } return; }
    if (S.phase === 'drag') { const up = sm(S.pt / 0.9), hold = S.pt > 0.9 && S.pt < 2.2; A.smokeK = S.pt < 2.2 ? up : 1 - sm((S.pt - 2.2) / 0.9); if (emb) { const g = hold ? 2.6 : 1.4; emb.color.setRGB(g, g * 0.27, g * 0.05); }
      if (S.pt > 2.5 && S.pt - dt <= 2.5 && near) this.exhale(p, 3); if (S.pt > 3.2) { S.phase = 'rest'; S.pt = 0; S.next = 4 + this.rng.next() * 6; } return; }
    if (S.phase === 'drop') { A.smokeK = 0; if (S.pt > 0.5 && p.cig) { p.cig.parent?.remove(p.cig); p.cig = null; } if (S.pt > 1.0) this.endSolo(p); }
  }
  mouthWorld(p, out) { const h = p.ch.bones.head; h.updateWorldMatrix(true, false); const s = p.ch.anim.s || 1; return h.localToWorld(out.set(0, 0.035 * s, 0.1 * s)); }
  exhale(p, n) { const m = this.mouthWorld(p, _v3); const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw); for (let i = 0; i < n; i++) this.smoke.puff(m.x + fx * 0.05, m.y - 0.02, m.z + fz * 0.05, fx * (0.35 + i * 0.05), 0.08 + i * 0.03, fz * (0.35 + i * 0.05), 0.05, 0.42 + i * 0.1, 0.32, 2.2 + i * 0.4); }
  wisp(p) { if (!p.cig) return; p.cig.updateWorldMatrix(true, false); const w = p.cig.localToWorld(_v3.set(-0.045, 0, 0)); this.smoke.puff(w.x, w.y + 0.01, w.z, (this.rng.next() - 0.5) * 0.04, 0.22, (this.rng.next() - 0.5) * 0.04, 0.012, 0.12, 0.14, 2.0); }
  // after the pose update (near people only): put the filter exactly on the lips (closed loop on a per-person offset)
  post(p) {
    const S = p.scene; const A = p.ch.anim;
    if (S && S.kind === 'smoke' && p.cig && (A.smokeK || 0) > 0.85 && (A.smokeLight || 0) < 0.05) {
      p.cig.updateWorldMatrix(true, false); const tip = p.cig.localToWorld(_v.set(0.041, 0, 0)); const m = this.mouthWorld(p, _v2);
      const err = m.distanceTo(tip); this.stats.lipErr = err; chestTarget(p.ch, m, m); chestTarget(p.ch, tip, tip); const a = A.smokeAdj || (A.smokeAdj = new THREE.Vector3());
      a.addScaledVector(m.sub(tip), 0.6); a.clampScalar(-0.14, 0.14);
    }
    if (p.phone && A.action === 'phone') this.postPhone(p); else if (p.phone && p.phone.parent !== p.ch.bones.handR) this.backToHand(p);
    if (S && S.kind === 'couple') this.postCouple(p);
    if (p.holdFor) this.postHold(p);
  }
  // on a call the phone lies against the ear: closed loop on the phone centre → beside the head (half width + 6 mm), a bit forward
  phoneSpot(p, out) { const sp = p.ch.spec, hw = (sp.sex === 'f' ? 0.083 : 0.088) * ((sp.head && sp.head.w) ?? 1); return out.set(-(hw + 0.006), 0.03, 0.025); } /* centre between the ear (top end) and the corner of the mouth (bottom end) */
  postPhone(p) { // the phone rests against the ear (head space) and the hand's IK chases its grip point; during the blend-in it glides hand → ear
    const A = p.ch.anim, h = p.ch.bones.head, hand = p.ch.bones.handR, ph = p.phone; h.updateWorldMatrix(true, false); hand.updateWorldMatrix(true, false);
    _m.compose(_v3.copy(PHONE_IN_HAND), _q.identity(), _s.set(1, 1, 1)).premultiply(hand.matrixWorld).decompose(_v, _q, _s); // where the phone would be in the hand
    _m2.compose(this.phoneSpot(p, _v2), _q2.setFromAxisAngle(_ax, PHONE_EAR_ROT), _s2.set(1, 1, 1)).premultiply(h.matrixWorld).decompose(_v2, _q2, _s2); // at the ear
    this.stats.phoneErr = _v.distanceTo(_v2); const w = sm((A.actionW - 0.5) / 0.4);
    const a = A.phoneAdj || (A.phoneAdj = new THREE.Vector3()); { const g = _v3.copy(_v2), c = _v4.copy(_v); chestTarget(p.ch, g, g); chestTarget(p.ch, c, c); a.addScaledVector(g.sub(c), 0.7); a.clampScalar(-0.2, 0.2); }
    if (ph.parent !== h) h.add(ph);
    _v.lerp(_v2, w); _q.slerp(_q2, w); _m.compose(_v, _q, _s); _m.premultiply(_m2.copy(h.matrixWorld).invert()); _m.decompose(ph.position, ph.quaternion, ph.scale);
  }
  backToHand(p) { const ph = p.phone; p.ch.bones.handR.add(ph); ph.position.copy(PHONE_IN_HAND); ph.quaternion.identity(); ph.scale.set(1, 1, 1); }

  // newspaper: unfold, read (head scanning down the columns), turn a page every so often, fold it and move on
  stepPaper(p, S, dt) {
    const A = p.ch.anim; if (S.phase === 'begin') { if (S.pt > 0.3 && !p.paper) { p.paper = newspaper(); p.paper.scale.set(0.4, 1, 1); p.ch.bones.chest.add(p.paper); A.set('paper'); } if (p.paper) p.paper.scale.x = lerp(0.4, 1, sm((S.pt - 0.3) / 0.6)); if (S.pt > 0.9) { S.phase = 'read'; S.pt = 0; S.next = 7 + this.rng.next() * 8; } return; }
    const right = p.paper && p.paper.userData.right;
    if (S.phase === 'read') { A.paperFlip = 0; if (right) right.rotation.y = -PAGE_V; if (S.t > S.dur) { S.phase = 'fold'; S.pt = 0; } else if (S.pt > S.next) { S.phase = 'flip'; S.pt = 0; } return; }
    if (S.phase === 'flip') { const u = S.pt / 0.9; A.paperFlip = u < 1 ? u : Math.min(2, 1 + (S.pt - 0.9) / 0.7); if (right) right.rotation.y = u < 1 ? -PAGE_V + sm(u) * (2 * PAGE_V + Math.PI + 0.04) : PAGE_V + Math.PI + 0.04;
      if (S.pt > 1.6) { A.paperFlip = 0; if (right) right.rotation.y = -PAGE_V; S.phase = 'read'; S.pt = 0; S.next = 8 + this.rng.next() * 9; } return; } // the turned page now matches the left leaf: resetting it is invisible
    if (S.phase === 'fold') { if (p.paper) p.paper.scale.x = lerp(1, 0.35, sm(S.pt / 0.5)); if (S.pt > 0.5) { if (p.paper) { p.paper.parent?.remove(p.paper); p.paper = null; } A.set(null); } if (S.pt > 0.9) this.endSolo(p); }
  }
  // reading on a bench: the person is sitting (Crowd 'idle' at a bench POI) — the legs stay seated while the arms hold the paper
  benchStep(p, dt) {
    const B = p.benchRead; if (!B) return; const A = p.ch.anim; B.t += dt;
    if (B.phase === 'sit') { if (B.t > 2.5 && p.sit) { A.seated = true; p.paper = newspaper(); p.paper.scale.set(0.4, 1, 1); p.ch.bones.chest.add(p.paper); A.set('paper'); B.phase = 'open'; B.t = 0; this.stats.paper++; } return; }
    if (B.phase === 'open') { if (p.paper) p.paper.scale.x = lerp(0.4, 1, sm(B.t / 0.6)); if (B.t > 0.6) { B.phase = 'read'; B.t = 0; B.next = 8 + this.rng.next() * 8; } return; }
    const right = p.paper && p.paper.userData.right;
    if (B.phase === 'read') { if (p.timer < 2.2) { B.phase = 'fold'; B.t = 0; } else if (B.t > B.next) { B.phase = 'flip'; B.t = 0; } return; }
    if (B.phase === 'flip') { const u = B.t / 0.9; A.paperFlip = u < 1 ? u : Math.min(2, 1 + (B.t - 0.9) / 0.7); if (right) right.rotation.y = u < 1 ? -PAGE_V + sm(u) * (2 * PAGE_V + Math.PI + 0.04) : PAGE_V + Math.PI + 0.04; if (B.t > 1.6) { A.paperFlip = 0; if (right) right.rotation.y = -PAGE_V; B.phase = 'read'; B.t = 0; B.next = 9 + this.rng.next() * 9; } return; }
    if (B.phase === 'fold') { if (p.paper) p.paper.scale.x = lerp(1, 0.35, sm(B.t / 0.5)); if (B.t > 0.5 && p.paper) { p.paper.parent?.remove(p.paper); p.paper = null; A.set('sit'); } if (B.t > 1.6) { A.seated = false; p.benchRead = null; } } // arms back to the sit pose BEFORE the seated flag drops: no leg snap
  }
  benchEnd(p) { if (!p.benchRead) return; if (p.paper) { p.paper.parent?.remove(p.paper); p.paper = null; } p.ch.anim.seated = false; p.ch.anim.paperFlip = 0; p.benchRead = null; }
  // phone prop whenever someone is on a call or texting (walking or standing)
  props(p, lod) {
    const want = lod < 3 && (p.ch.anim.action === 'phone' || p.ch.anim.action === 'text');
    if (want && !p.phone) { p.phone = phoneProp(); p.ch.bones.handR.add(p.phone); } else if (!want && p.phone) { p.phone.parent?.remove(p.phone); p.phone = null; }
  }
  // ---------------------------------------------------------------- couples
  spawnCouple(ctx) {
    const C = this.C, r = this.rng, f = C.focus; if (!f) return false; const specs = C.specs.filter((s) => s.age !== 'elder' && !s.cap); /* a cap brim would hit the partner's face in a kiss */ const m = specs.filter((s) => s.sex === 'm'), w = specs.filter((s) => s.sex === 'f'); if (!m.length || !w.length) return false;
    const cand = C.nodesNear(f.x, f.z, 120).filter((n) => { const d = Math.hypot(n.x - f.x, n.z - f.z); return d > 45 && d < 110 && !C.visible({ x: n.x, z: n.z }); }); if (!cand.length) return false;
    const n = r.pick(cand); // a place to go together: a lawn or a bench, reachable on foot
    const spots = C.nearPOIs(n.x, n.z, 160).filter((q) => (q.type === 'lawn' || q.type === 'bench') && C.poiNode(q) !== null && C.comp[C.poiNode(q)] === C.mainComp); if (!spots.length) return false;
    const q = r.pick(spots); const path = C.route(n.id, C.poiNode(q)); if (!path || path.cost > 260) return false; // a short stroll to a bench / the grass
    const a = C.makePed(r.pick(m), n.x, n.z, n.id), b = C.makePed(r.pick(w), n.x + 0.6, n.z, n.id); if (!a || !b) { if (a) C.remove(a); if (b) C.remove(b); return false; }
    const pace = 1.05 + r.next() * 0.15; a.pace = b.pace = pace; a.jog = b.jog = false; a.partner = b; b.partner = a; a.route = path; a.goalPoi = null; a.coupleSpot = q; a.state = 'walk'; C.pickNext(a);
    b.state = 'scene'; b.scene = { kind: 'follow', lead: a, t: 0 }; const cp = { a, b, spot: q, t: 0 }; this.couples.push(cp); this.stats.couple++; return true;
  }
  stepFollow(p, dt) { // walk beside the partner, hand in hand
    const S = p.scene, Ld = S.lead; if (!Ld || !this.C.peds.includes(Ld)) { p.scene = null; p.partner = null; p.state = 'walk'; this.C.returnToGraph(p); return { desired: 0 }; }
    const fx = Math.sin(Ld.yaw), fz = Math.cos(Ld.yaw); let tx = Ld.x - fz * 0.56 - fx * 0.05, tz = Ld.z + fx * 0.56 - fz * 0.05; // on the leader's right, a step behind
    const dl = Math.hypot(Ld.x - p.x, Ld.z - p.z); if (dl > 1.6 || this.C.collision.blocked(tx, tz, 0.25) || (!Ld.crossing && L.roadAt(tx, tz))) { tx = Ld.x - fx * 0.75; tz = Ld.z - fz * 0.75; } // lagging / no room beside: fall in behind
    const d = Math.hypot(tx - p.x, tz - p.z); const ls = Math.hypot(Ld.vx || 0, Ld.vz || 0); p.holdFor = d < 0.5 && ls > 0.3 ? Ld : null; Ld.holdFor = p.holdFor ? p : null;
    p.crossing = !!Ld.crossing || (p.crossing && !!L.roadAt(p.x, p.z)); if (Ld.state === 'scene' && Ld.scene && Ld.scene.kind === 'couple') return { desired: 0 };
    return { desired: d < 0.08 ? 0 : clamp(ls + d * 1.8, 0, 2.4), tx, tz, avoid: false, accel: 4 };
  }
  postHold(p) { // hand-holding: inner hands meet halfway between the two, at hand height
    const o = p.holdFor; const A = p.ch.anim; if (!o || A.action && A.action !== 'hold') { if (A.action === 'hold') A.set(null); A.holdL = A.holdR = null; return; }
    const side = ((o.x - p.x) * Math.cos(p.yaw) - (o.z - p.z) * Math.sin(p.yaw)) > 0 ? 'L' : 'R'; // partner on my left (+x local) or right
    const y = (p.y || 0.15) + 0.86 * (p.ch.anim.s || 1); _v.set((p.x + o.x) / 2 + Math.sin(p.yaw) * 0.06, y, (p.z + o.z) / 2 + Math.cos(p.yaw) * 0.06);
    const t = chestTarget(p.ch, _v, new THREE.Vector3()); if (side === 'L') { A.holdL = t; A.holdR = null; } else { A.holdR = t; A.holdL = null; } if (A.action !== 'hold') A.set('hold');
  }
  coupleArrive(p) { // the leader reached the spot: walk onto it together, then a hug and a kiss
    const cp = this.couples.find((c) => c.a === p); if (!cp) return false; const b = cp.b; const q = cp.spot; p.coupleSpot = null;
    const n = L.pedNodes[p.node]; const sx = q.type === 'bench' ? q.x + Math.sin(q.rot || 0) * 1.1 : q.x, sz = q.type === 'bench' ? q.z + Math.cos(q.rot || 0) * 1.1 : q.z;
    const dir = Math.atan2(sx - n.x, sz - n.z) + Math.PI / 2; // they end up facing each other across the line they arrived on
    cp.c = { x: sx, z: sz, dir, gap: 0.36 }; cp.t = 0; cp.phase = 'meet'; cp.lean = 0;
    for (const [o, sd] of [[p, -1], [b, 1]]) { o.state = 'scene'; o.scene = { kind: 'couple', cp, side: sd }; o.holdFor = null; o.ch.anim.set(null); }
    return true;
  }
  stepCouple(p, dt) {
    const S = p.scene, cp = S.cp; const other = cp.a === p ? cp.b : cp.a; if (!this.C.peds.includes(other)) { this.endCouple(cp, true); return { desired: 0 }; }
    if (cp.a === p) { cp.t += dt; const r = this.rng;
      if (cp.phase === 'meet' && cp.t > 6) { cp.phase = 'hug'; cp.t = 0; }
      else if (cp.phase === 'hug' && cp.t > 2.2) { cp.phase = 'kiss'; cp.t = 0; this.stats.kiss++; }
      else if (cp.phase === 'kiss' && cp.t > 2.6) { cp.phase = 'hold'; cp.t = 0; }
      else if (cp.phase === 'hold' && cp.t > 2.5) { cp.phase = 'talk'; cp.t = 0; cp.dur = 10 + r.next() * 12; }
      else if (cp.phase === 'talk' && cp.t > cp.dur) { this.endCouple(cp, false); return { desired: 0 }; } }
    const hx = Math.sin(cp.c.dir), hz = Math.cos(cp.c.dir); const gap = cp.phase === 'talk' || cp.phase === 'meet' ? 0.75 : cp.c.gap;
    const tx = cp.c.x + hx * S.side * gap / 2, tz = cp.c.z + hz * S.side * gap / 2; const d = Math.hypot(tx - p.x, tz - p.z);
    p.faceYaw = d < 0.6 || cp.phase !== 'meet' ? Math.atan2(other.x - p.x, other.z - p.z) : undefined;
    const A = p.ch.anim; if (cp.phase === 'talk') { if (!['talk', 'listen'].includes(A.action)) A.set(p === cp.a ? 'talk' : 'listen'); p.chatT = (p.chatT ?? 2) - dt; if (p.chatT <= 0) { p.chatT = 2 + this.rng.next() * 3; A.set(A.action === 'talk' ? 'listen' : 'talk'); p.ch.face.talking = A.action === 'talk'; if (A.action === 'listen' && this.rng.chance(0.5)) p.ch.face.set('smile', 2); } }
    else if (cp.phase !== 'meet') { if (A.action !== 'hold') A.set('hold'); p.ch.face.set('smile', 0.5); }
    return { desired: d > (cp.phase === 'meet' ? 0.04 : 0.015) ? Math.min(0.9, d * 2.5) : 0, tx, tz, avoid: false, accel: 3 }; /* close in to the embrace spacing (a 4 cm stop each left kisses 7 cm apart) */
  }
  postCouple(p) { // embrace: arms around the partner; kiss: heads lean in until the faces meet (tilted to opposite sides)
    const S = p.scene, cp = S.cp, A = p.ch.anim; const other = cp.a === p ? cp.b : cp.a; const ph = cp.phase;
    if (ph === 'meet' || ph === 'talk' || !other.ch) { A.nearLean = null; A.holdL = A.holdR = null; return; }
    const ob = other.ch.bones; ob.chest.updateWorldMatrix(true, false); const s = other.ch.anim.s || 1; const lead = p === cp.a;
    const hi = lead ? 0.04 : 0.12, back = -0.075 * s, w = 0.16 * s; // the man's hands at her back, hers higher up on his shoulders
    A.holdL = chestTarget(p.ch, ob.chest.localToWorld(_v.set(-w, hi * s - 0.05 * s, back)), A.holdL || new THREE.Vector3());
    A.holdR = chestTarget(p.ch, ob.chest.localToWorld(_v.set(w, hi * s - 0.05 * s, back)), A.holdR || new THREE.Vector3());
    const kiss = ph === 'kiss' ? sm(cp.t / 0.7) * (1 - sm((cp.t - 1.9) / 0.6)) : 0;
    if (lead) { // closed loop on the MOUTHS: v brings them level (taller bends down, shorter tilts up), f closes the gap
      const ma = this.mouthWorld(p, _v2), mb = this.mouthWorld(other, _v3); const dy = ma.y - mb.y, dh = Math.hypot(ma.x - mb.x, ma.z - mb.z);
      cp.tall ??= cp.a.ch.spec.height >= cp.b.ch.spec.height ? 'a' : 'b'; const want = kiss > 0.02; const dyT = cp.tall === 'a' ? dy : -dy; /* role fixed once: re-deciding each frame flipped it on overshoot and v ran away */
      cp.v = clamp((cp.v || 0) + (want ? dyT * 1.5 * kiss : -0.02), 0, 0.8); cp.f = clamp((cp.f || 0) + (want ? (dh - 0.03) * 1.2 * kiss : -0.02), 0, 0.65); cp.mouthD = ma.distanceTo(mb); }
    const tall = (cp.tall === 'a') === lead; const v = cp.v || 0, f = cp.f || 0;
    const hugHead = ph === 'hug' || ph === 'hold' ? 1 : 0; // in the embrace the shorter one rests the head to one side, the taller looks down
    A.nearLean = { s: 0.07 + f * 0.25, c: 0.03 + f * 0.1, p: (tall ? v * 0.45 + 0.12 * hugHead : -v * 0.85) + f * 0.25, r: (lead ? 0.18 : -0.18) * kiss + (tall ? 0 : 0.14 * hugHead), y: tall ? 0 : 0.45 * hugHead * (1 - kiss) };
  }
  endCouple(cp, broken) {
    this.couples = this.couples.filter((c) => c !== cp); for (const o of [cp.a, cp.b]) { if (!o || !o.ch) continue; const A = o.ch.anim; A.nearLean = null; A.holdL = A.holdR = null; if (A.action === 'hold' || A.action === 'talk' || A.action === 'listen') A.set(null); o.faceYaw = undefined; o.ch.face.talking = false; }
    const a = cp.a, b = cp.b; if (broken) { for (const o of [a, b]) { if (!o) continue; o.partner = null; o.scene = null; o.holdFor = null; if (o.state === 'scene') { o.state = 'walk'; this.C.returnToGraph(o); } } return; }
    a.scene = null; a.state = 'walk'; a.lastEdge = null; this.C.returnToGraph(a); b.scene = { kind: 'follow', lead: a, t: 0 }; b.state = 'scene'; this.couples.push({ a, b, spot: null, t: 0, walking: true });
  }
  // ---------------------------------------------------------------- street fights
  startFight(ctx) {
    const C = this.C, f = C.focus, P = ctx.player; if (!f || !P) return false; const pol = this.police; if (pol && (pol.level > 0 || (pol.civil && pol.civil.length))) return false;
    const ok = (p) => p.state === 'walk' && !p.partner && !p.jog && !p.keep && !p.scene && p.sp.age !== 'elder' && p.sp.sex === 'm' && !p.crossing && !L.roadAt(p.x, p.z);
    const cand = C.peds.filter((p) => ok(p) && Math.hypot(p.x - f.x, p.z - f.z) > 14 && Math.hypot(p.x - f.x, p.z - f.z) < 60 && Math.hypot(p.x - P.x, p.z - P.z) > 12);
    for (const a of cand) { const b = cand.find((o) => o !== a && Math.hypot(o.x - a.x, o.z - a.z) < 9 && Math.hypot(o.x - a.x, o.z - a.z) > 1.5 && !C.crossesRoad(a.x, a.z, o.x, o.z) && !C.collision.blocked((a.x + o.x) / 2, (a.z + o.z) / 2, 0.3)); if (!b) continue; // same pavement, nothing between them
      const F = { a, b, phase: 'confront', t: 0, x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, turn: 0, hitT: 0, called: false, callT: 5 + this.rng.next() * 4, alarmT: 0, unit: null, stopped: false, handed: false, ended: false, life: this, dur: 40 + this.rng.next() * 20 };
      for (const [p, sd] of [[a, 0], [b, 1]]) { if (p.poi) { p.poi.used = Math.max(0, p.poi.used - 1); p.poi = null; } p.state = 'scene'; p.scene = { kind: 'fight', F, side: sd }; p.act = null; p.ch.anim.set(null); p.keep = true; }
      this.fights.push(F); this.stats.fight++; this.C.speak(b, 'annoyed', 1, 2.2); return true; }
    return false;
  }
  stepFight(p, dt, ctx) {
    const S = p.scene, F = S.F; const o = S.side ? F.a : F.b; const A = p.ch.anim; const r = this.rng;
    if (!this.C.peds.includes(o)) { this.endFight(F, 'gone'); return { desired: 0 }; }
    const dx = o.x - p.x, dz = o.z - p.z, d = Math.hypot(dx, dz) || 1; p.faceYaw = Math.atan2(dx, dz);
    if (F.stopped) { if (A.action !== 'handsup') A.set('handsup'); p.ch.face.mood = 'concern'; return { desired: 0 }; } // police: "Stop!" — hands up, waiting
    if (F.phase === 'confront') { if (S.side === 0) { F.ct = (F.ct || 0) + dt; if (F.ct > 12) { this.endFight(F, 'fizzled'); return { desired: 0 }; } } if (S.side === 1) { if (d > 1.25) return { desired: 1.6, tx: o.x, tz: o.z, avoid: false }; } else if (d > 1.25) return { desired: 0 };
      if (d <= 1.3) { F.phase = 'argue'; F.t = 0; } return { desired: 0 }; }
    if (F.phase === 'argue') { if (A.action !== 'argue' && A.action !== 'point') A.set(r.chance(0.6) ? 'argue' : 'point'); p.ch.face.set('angry', 1); p.ch.face.mood = 'angry';
      if (S.side === 0) { F.t += dt; if (r.chance(dt * 0.25)) this.C.speak(r.chance(0.5) ? F.a : F.b, r.chance(0.5) ? 'annoyed' : 'shoved', 1, 2.2); if (F.t > 5.5) { F.phase = 'shove'; F.t = 0; this.C.alarm(F.x, F.z, 26, 1, F.a); } }
      return d > 1.4 ? { desired: 0.6, tx: o.x, tz: o.z, avoid: false } : d < 0.95 ? { desired: 0.5, tx: p.x - dx / d, tz: p.z - dz / d, avoid: false } : { desired: 0 }; }
    if (F.phase === 'shove') { if (S.side === 1) { F.t += dt; if (F.t < 0.1) A.set('shove'); if (F.t > 0.3 && !F.shoved) { F.shoved = true; o.ch.anim.set('stumble'); o.vx = -dx / d * 2.0; o.vz = -dz / d * 2.0; } if (F.t > 1.6) { F.phase = 'brawl'; F.t = 0; F.next = 0.8; } } return { desired: 0 }; }
    if (F.phase === 'brawl') { // guard up, close in; one throws, the other takes it (or covers up) and is pushed back a step; pauses to circle
      if (S.side === 0) { F.t += dt; F.hitT += dt; F.alarmT -= dt; if (F.alarmT <= 0) { F.alarmT = 9; this.C.alarm(F.x, F.z, 28, 1, F.a); }
        if (F.hitT > F.next) { F.hitT = 0; F.next = 1.1 + r.next() * 1.6; const att = r.chance(0.5) ? F.a : F.b, def = att === F.a ? F.b : F.a; att.ch.anim.punchSide = r.chance(0.5) ? 1 : -1; att.ch.anim.set('punch'); att.ch.anim.actionT = 0; F.pending = { def, t: 0.2, att, block: r.chance(0.35) }; }
        if (F.pending) { F.pending.t -= dt; if (F.pending.t <= 0) { const { def, att, block } = F.pending; F.pending = null; const ex = def.x - att.x, ez = def.z - att.z, el = Math.hypot(ex, ez) || 1; def.ch.anim.set(block ? 'cover' : 'hit'); def.ch.anim.actionT = 0; def.vx = ex / el * (block ? 0.8 : 1.6); def.vz = ez / el * (block ? 0.8 : 1.6); if (!block && r.chance(0.3)) this.C.speak(def, 'scared', 0, 1.2); } }
        if (F.t > F.dur && (!F.unit || F.t > F.dur + 60)) { this.endFight(F, 'tired'); return { desired: 0 }; } }
      const busy = ['punch', 'hit', 'cover', 'stumble'].includes(A.action) && A.actionT < 0.55; if (!busy && A.action !== 'guard') A.set('guard'); p.ch.face.mood = 'angry';
      const want = 1.05; if (busy) return { desired: 0 };
      return d > want + 0.2 ? { desired: 0.9, tx: o.x, tz: o.z, avoid: false, accel: 3 } : d < want - 0.25 ? { desired: 0.6, tx: p.x - dx / d, tz: p.z - dz / d, avoid: false } : { desired: 0 }; }
    return { desired: 0 };
  }
  endFight(F, why) {
    F.ended = true; F.why = why; this.fights = this.fights.filter((f) => f !== F); for (const p of [F.a, F.b]) { if (!p || F.handed) continue; if (!p.scene || p.scene.F !== F) continue; p.scene = null; p.keep = false; p.faceYaw = undefined; p.ch.anim.set(null); p.ch.face.mood = 'neutral';
      if (this.C.peds.includes(p)) { const o = p === F.a ? F.b : F.a; const ax = p.x - o.x, az = p.z - o.z, d = Math.hypot(ax, az) || 1; if (p.state === 'scene') p.state = 'walk'; this.C.react(p, 'recover', 4 + this.rng.next() * 2, { fleeDir: [ax / d, az / d] }); } }
  }
  // per-frame scheduling: fights get reported and policed, couples appear, the smoke drifts
  update(dt, ctx) {
    this.t += dt; this.smoke.update(dt); const h = this.C.hour ?? 12;
    this.coupleCd -= dt; if (this.coupleCd <= 0) { this.coupleCd = 40 + this.rng.next() * 50; if (!this.C.rain && h >= 8 && h < 22 && this.couples.length < 2) this.spawnCouple(ctx); }
    this.couples = this.couples.filter((cp) => this.C.peds.includes(cp.a) && this.C.peds.includes(cp.b) || (this.endCouple(cp, true), false));
    this.fightCd -= dt; if (this.fightCd <= 0) { this.fightCd = 150 + this.rng.next() * 180; if (h >= 9 && h < 23 && !this.fights.length) this.startFight(ctx); }
    for (const F of this.fights.slice()) this.updateFight(F, dt, ctx);
  }
  updateFight(F, dt, ctx) {
    F.x = (F.a.x + F.b.x) / 2; F.z = (F.a.z + F.b.z) / 2;
    if (!F.called && (F.phase === 'brawl' || F.phase === 'shove')) { F.callT -= dt; if (F.callT <= 0) { F.called = true; // a bystander phones 119
      const w = this.C.peds.filter((p) => p !== F.a && p !== F.b && this.C.isRoutine(p.state) && !p.scene && Math.hypot(p.x - F.x, p.z - F.z) < 30 && Math.hypot(p.x - F.x, p.z - F.z) > 5).sort((a, b) => Math.hypot(a.x - F.x, a.z - F.z) - Math.hypot(b.x - F.x, b.z - F.z))[0];
      if (w && !F.recall) { this.C.react(w, 'watch', 7, { lookAt: { x: F.x, z: F.z } }); w.ch.anim.set('phone'); this.C.speak(w, 'report', 1, 3); }
      const pol = this.police; if (pol && pol.civilCall) { const u = pol.civilCall({ x: F.x, z: F.z, kind: 'fight', F, road: L.roadNameAt ? L.roadNameAt(F.x, F.z) : '' }); if (u) { F.unit = u; this.stats.reported++; } else { F.recall = (F.recall || 0) + 1; if (F.recall < 6) { F.called = false; F.callT = 4; } } } } } // no car could be sent this moment: they try again
  }
  // the police took both men: they are no longer crowd pedestrians
  handOver(F) { F.handed = true; this.fights = this.fights.filter((f) => f !== F); for (const p of [F.a, F.b]) { p.scene = null; p.faceYaw = undefined; this.C.release(p); } this.stats.handed++; }
  // a reaction / the player interrupts someone mid-activity
  interrupt(p) {
    const S = p.scene; if (!S) { this.benchEnd(p); return; }
    if (S.solo) this.endSolo(p, true);
    else if (S.kind === 'fight') { if (!S.F.stopped) this.endFight(S.F, 'interrupted'); }
    else if (S.kind === 'couple') this.endCouple(S.cp, true);
    else { p.scene = null; if (p.partner) { p.partner.partner = null; p.partner.holdFor = null; } p.partner = null; p.holdFor = null; }
    p.scene = null; p.faceYaw = undefined; if (p.state === 'scene') this.C.returnToGraph(p); // always leaves with a valid walk target
  }
  forget(p) { // despawned / released
    this.dropProps(p); if (p.phone) { p.phone.parent?.remove(p.phone); p.phone = null; } if (p.partner && p.partner.partner === p) { const o = p.partner; o.partner = null; if (o.scene && (o.scene.kind === 'follow' || o.scene.kind === 'couple')) { o.scene = null; o.ch.anim.nearLean = null; o.ch.anim.holdL = o.ch.anim.holdR = null; if (o.state === 'scene') { o.state = 'walk'; this.C.returnToGraph(o); } } }
    p.partner = null; this.couples = this.couples.filter((c) => c.a !== p && c.b !== p);
    for (const F of this.fights.slice()) if ((F.a === p || F.b === p) && !F.handed) this.endFight(F, 'gone');
  }
  clear() { this.smoke.clear(); this.fights = []; this.couples = []; }
}
export { cigarette, newspaper, phoneProp, chestTarget }; // dev/streetlife.html poses them directly
