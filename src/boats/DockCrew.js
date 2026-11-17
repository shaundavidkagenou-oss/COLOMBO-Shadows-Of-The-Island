// Fort Harbour Marina — the people who work it (58th). Made once at load with the rest of the marina (no characters are created
// during play):
//   • a security guard by the marina office, watching the gangway; now and then he walks a round to the T-head and back
//   • two dock hands in the marina's navy polos: one goes from berth to berth checking the mooring lines (crouches at the
//     cleat), the other walks the head walkway / spine / T-head and stops at the service pedestals
//   • a boat cleaner working on a finger beside a moored boat (hose in hand), moving on to another boat after a while
// Dock hands and the cleaner work 06:30–18:30; the guard is there round the clock. They walk only on the pontoons (a small
// waypoint graph through the head walkway ↔ spine junction), are animated only near the camera and hidden when far.
import * as THREE from 'three';
import { MARINA } from './Marina.js';
import { Character } from '../actors/Character.js';
import { makeAppearance } from '../actors/Appearance.js';

const FINGERS = 7, PITCH = 11;
const fingerZ = (k) => MARINA.head.z0 - PITCH * k;
const SX = (MARINA.spine.x0 + MARINA.spine.x1) / 2, HZ = (MARINA.head.z0 + MARINA.head.z1) / 2, TZ = (MARINA.tee.z0 + MARINA.tee.z1) / 2;
const J = [SX, HZ]; // the head walkway ↔ spine junction: every walk goes through it
// a place on the pontoons as a path from the junction
const P_OFFICE = () => [[MARINA.office.x0 - 1.2, HZ - 0.2]];
const P_GANG = () => [[MARINA.gang.x0 - 1.2, HZ]];
const P_FINGER = (k, side, along) => { const z = fingerZ(k); const x = side < 0 ? MARINA.spine.x0 - along : MARINA.spine.x1 + along; return [[SX, z + (side < 0 ? 0 : 0)], [x, z]]; };
const P_TEE = (x) => [[SX, TZ], [x, TZ]];
const P_HEAD = (x) => [[x, HZ]];

export class DockCrew {
  constructor(boats) {
    this.B = boats; this.scene = boats.scene; this.col = boats.col; this.t = 0; this.crew = [];
    const navy = { top: '#1f3f66', bottom: '#2c323c', cap: '#1f3f66' };
    const defs = [
      { seed: 9100, o: { outfit: 'security', sex: 'm', band: 'mature' }, job: 'guard' },
      { seed: 9137, o: { outfit: 'polo', sex: 'm', band: 'adult', ...navy }, job: 'lines' },
      { seed: 9171, o: { outfit: 'polo', sex: 'm', band: 'young', ...navy, cap: undefined }, job: 'rounds' },
      { seed: 9203, o: { outfit: 'worker', sex: 'm', band: 'adult' }, job: 'wash' },
    ];
    for (const d of defs) { let sp; try { sp = makeAppearance(d.seed, d.o); } catch (e) { sp = makeAppearance(d.seed, { sex: 'm' }); }
      const ch = new Character(sp); ch.root.visible = false; ch.root.traverse((o) => { if (o.isMesh) o.castShadow = true; }); this.scene.add(ch.root);
      if (d.job === 'wash') { const hose = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.32, 6), new THREE.MeshStandardMaterial({ color: 0x2f6a3a, roughness: 0.6 })); hose.rotation.x = Math.PI / 2; hose.position.set(0, -0.06, 0.12); hose.visible = false; (ch.bones.handR || ch.root).add(hose); ch.hose = hose; }
      const w = { ch, job: d.job, path: [], at: J.slice(), x: J[0], z: J[1], y: MARINA.deckY, yaw: 0, task: null, waitT: 2 + this.crew.length * 3, face: null, act: null, home: null, onDuty: false };
      this.crew.push(w); }
  }
  dayShift() { const A = this.B.g.atmos; const h = A ? A.hour : 12; return h > 6.5 && h < 18.5; }
  // walk from where he is (always via the junction) to the place `pts` (a path from the junction)
  go(w, pts) { const back = (w.route || []).slice().reverse(); w.route = pts.map((p) => p.slice()); w.path = [...back.slice(1), J.slice(), ...w.route.map((p) => p.slice())]; w.act = null; }
  nextTask(w) {
    const r = Math.random(); const B = this.B;
    if (w.job === 'guard') { if (w.task === 'post' && r < 0.35) { w.task = 'round'; this.go(w, P_TEE(MARINA.tee.x0 + 4 + Math.random() * 30)); w.after = 6; }
      else { w.task = 'post'; this.go(w, P_OFFICE()); w.after = 35 + Math.random() * 40; w.face = Math.atan2(MARINA.gang.x0 - (MARINA.office.x0 - 1.2), 0); w.pose = 'hips'; } return; }
    if (w.job === 'lines') { // a berth with a boat in it: crouch at the cleat on her finger
      const full = B.berths.filter((b) => b.boat && !b.boat.away && b.walk); const pick = full.length ? full[Math.floor(Math.random() * full.length)] : null;
      if (pick) { const k = Math.round((MARINA.head.z0 - pick.zc) / PITCH + 0.5); const side = pick.side === 'W' ? -1 : 1; const kk = Math.max(1, Math.min(FINGERS, k)); const zf = fingerZ(kk);
        const along = 3 + Math.random() * 6; const x = side < 0 ? MARINA.spine.x0 - along : MARINA.spine.x1 + along; this.go(w, [[SX, zf], [x, zf]]);
        w.face = Math.atan2(0, pick.zc - zf); w.pose = 'medKneel' /* kneeling at the cleat, hands on the line */; w.after = 7 + Math.random() * 6; }
      else { this.go(w, P_GANG()); w.pose = 'hips'; w.after = 15; w.face = null; } return; }
    if (w.job === 'rounds') { const opts = [() => P_TEE(MARINA.terminal.x + 1), () => P_HEAD(MARINA.head.x0 + 6 + Math.random() * 25), () => P_FINGER(1 + Math.floor(Math.random() * FINGERS), Math.random() < 0.5 ? -1 : 1, 0.4), () => P_TEE(MARINA.tee.x1 - 3), () => P_GANG()];
      this.go(w, opts[Math.floor(Math.random() * opts.length)]()); w.pose = Math.random() < 0.5 ? 'hips' : null; w.after = 8 + Math.random() * 12; w.face = null; return; }
    if (w.job === 'wash') { const full = B.berths.filter((b) => b.boat && !b.boat.away && b.walk && b.boat.mode === 'moored'); const pick = full.length ? full[Math.floor(Math.random() * full.length)] : null;
      if (pick) { const k = Math.max(1, Math.min(FINGERS, Math.round((MARINA.head.z0 - pick.zc) / PITCH + 0.5))); const side = pick.side === 'W' ? -1 : 1; const zf = fingerZ(k); const along = 4 + Math.random() * 4; const x = side < 0 ? MARINA.spine.x0 - along : MARINA.spine.x1 + along;
        this.go(w, [[SX, zf], [x, zf]]); w.face = Math.atan2(0, pick.zc - zf); w.pose = 'pump'; w.after = 40 + Math.random() * 40; }
      else { this.go(w, P_HEAD(MARINA.head.x0 + 10)); w.pose = null; w.after = 20; } }
  }
  update(dt) {
    this.t += dt; const day = this.dayShift(); const cam = this.B.g.camera.position; const near = Math.hypot(cam.x - SX, cam.z + 1240) < 330;
    for (const w of this.crew) {
      const ch = w.ch; const duty = w.job === 'guard' || day;
      if (!duty || !near) { if (ch.root.visible) ch.root.visible = false; if (!duty) { w.path = []; w.route = null; w.x = J[0]; w.z = J[1]; w.waitT = 1 + Math.random() * 4; } continue; } // off shift: gone home (back at the junction next shift); far: not drawn
      if (!ch.root.visible) { ch.root.visible = true; w.y = this.col.groundAt(w.x, w.z, MARINA.deckY + 1, 2); }
      const d = Math.hypot(w.x - cam.x, w.z - cam.z); let speed = 0;
      if (w.path.length) { const p = w.path[0]; const dx = p[0] - w.x, dz = p[1] - w.z, dd = Math.hypot(dx, dz); const v = w.job === 'guard' ? 1.1 : 1.3;
        if (dd < 0.12) { w.path.shift(); if (!w.path.length) w.waitT = w.after || 6; }
        else { const st = Math.min(dd, v * dt); w.x += dx / dd * st; w.z += dz / dd * st; speed = v; w.yaw += wrap(Math.atan2(dx, dz) - w.yaw) * Math.min(1, dt * 7); if (ch.anim.action) ch.anim.set(null); if (ch.hose) ch.hose.visible = false; }
        w.y = this.col.groundAt(w.x, w.z, MARINA.deckY + 1, 2);
      } else { // at the task: face it, hold the pose; then the next one
        if (w.face !== null && w.face !== undefined) w.yaw += wrap(w.face - w.yaw) * Math.min(1, dt * 4);
        if (w.pose && ch.anim.action !== w.pose) ch.anim.set(w.pose); if (ch.hose) ch.hose.visible = w.pose === 'pump';
        w.waitT -= dt; if (w.waitT <= 0) { if (ch.anim.action) ch.anim.set(null); this.nextTask(w); } }
      ch.root.position.set(w.x, w.y, w.z); ch.root.rotation.set(0, w.yaw, 0);
      if (d < 110) ch.anim.update(dt, speed); else if ((w.slow = (w.slow || 0) + dt) > 0.25) { ch.anim.update(w.slow, speed); w.slow = 0; }
    }
  }
  // debug / tests
  info() { return this.crew.map((w) => ({ job: w.job, x: +w.x.toFixed(1), z: +w.z.toFixed(1), vis: w.ch.root.visible, pose: w.ch.anim.action || null, walking: w.path.length > 0 })); }
}
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
