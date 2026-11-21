// National Hospital — body holding room (75th request). A modest single-storey annex in the yard behind the ambulance bay
// (not a mortuary block): tiled walls and floor, a stainless two-row body refrigerator (3 × 2 doors) against the back
// wall, a steel body trolley, a hand-wash sink, a shelf of folded sheets, a fluorescent panel, a drain in the floor; the
// condensing unit on the outside wall and NO ENTRY / staff-only plates by the door.
//   • The ambulance crew wheel a covered body straight from the van into the room, slide it across onto the trolley and
//     take their empty cot back to the van (EMS.js: atBay → 'room', 'transfer', 'back', 'restow').
//   • Later the attendant walks out of the emergency entrance to the room, opens the door, pushes the body off the trolley
//     into the refrigerator (the door swings open; the sheet slides into the dark compartment), closes it, walks out and
//     back into the ED. Nothing vanishes in view: the sheet goes into the compartment behind its door.
//   • The player can never enter: the doorway always has a collider (the door opens only for staff), and walking up to it
//     shows "No entry · Authorised staff only".
// Cost: the shell, interior and fittings are merged into the hospital's exterior meshes (HospitalBuild.buildGrounds) —
// only the tile lining and the plates add a material there; the swinging door leaf and the refrigerator door are two
// small meshes, the attendant one pre-built character shown only while he works.
import * as THREE from 'three';
import { Character } from '../actors/Character.js';
import { makeAppearance } from '../actors/Appearance.js';
import { MultiBuilder } from '../gfx/MeshBuilder.js';
import { toWorld, Y0 } from './HospitalPlan.js';
import { hospitalMatTable, C, plateUV } from './HospitalKit.js';
import { HospitalSound } from '../audio/HospitalAudio.js';

// plan frame (u east, v behind the street facade; HospitalPlan.toWorld). Annex outer walls u 23.2…28.4, v 11…17.6.
export const BODY_ROOM = Object.freeze({ u0: 23.2, u1: 28.4, v0: 11.0, v1: 17.6, h: 3.0, t: 0.2, door: [24.6, 26.0], doorH: 2.2,
  cot: [25.3, 13.4], trolley: [26.0, 13.4], fridgeFront: 15.3, slot: [25.63, 26.37], slotY: [0.55, 1.25] });
const R = BODY_ROOM; const X = (u) => toWorld(u, 0)[0], Z = (v) => toWorld(0, v)[1];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const sm = (k) => { k = clamp(k, 0, 1); return k * k * (3 - 2 * k); };
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const yawTo = (dx, dz) => Math.atan2(dx, dz);

// the static room into the hospital's exterior builder E (shell, lining, fittings) + colliders
export function buildBodyRoom(E, colliders) {
  const T = R.t, H = R.h, y = Y0; const WHITE = C('#f1efe9'), PLINTH = C('#8f8b84'), TILE = C('#e9ecec'), FLOOR = C('#b9bdbf'), STEEL = C('#c8cbce'), DARK = C('#1b1d1f');
  const wall = (u0, u1, v0, v1, y0 = 0, y1 = H, col = WHITE) => E('h_render').box(X((u0 + u1) / 2), y + (y0 + y1) / 2, Z((v0 + v1) / 2), u1 - u0, y1 - y0, v1 - v0, { col });
  const col = (u0, u1, v0, v1, top) => colliders.push({ x0: X(u0), x1: X(u1), z0: Z(v1), z1: Z(v0), h: y + top, kind: 'landmark', id: 'hospBodyRoom' });
  // shell: four walls (door gap in the north wall), plinth band, flat roof slab with a parapet and a drip edge
  wall(R.u0, R.u0 + T, R.v0, R.v1); wall(R.u1 - T, R.u1, R.v0, R.v1); wall(R.u0, R.u1, R.v1 - T, R.v1);
  wall(R.u0, R.door[0], R.v0, R.v0 + T); wall(R.door[1], R.u1, R.v0, R.v0 + T); wall(R.door[0], R.door[1], R.v0, R.v0 + T, R.doorH, H);
  for (const [a, b, c, d] of [[R.u0 - 0.02, R.u1 + 0.02, R.v0 - 0.02, R.v0 + 0.02], [R.u0 - 0.02, R.u1 + 0.02, R.v1 - 0.02, R.v1 + 0.02], [R.u0 - 0.02, R.u0 + 0.02, R.v0, R.v1], [R.u1 - 0.02, R.u1 + 0.02, R.v0, R.v1]]) {
    if (a < R.door[1] && b > R.door[0] && c < R.v0 + 0.05) { wall(a, R.door[0], c, d, 0, 0.35, PLINTH); wall(R.door[1], b, c, d, 0, 0.35, PLINTH); } else wall(a, b, c, d, 0, 0.35, PLINTH); }
  E('h_render').box(X((R.u0 + R.u1) / 2), y + H + 0.1, Z((R.v0 + R.v1) / 2), R.u1 - R.u0 + 0.2, 0.2, R.v1 - R.v0 + 0.2, { col: C('#e4e1da'), bottom: true });
  for (const [a, b, c, d] of [[R.u0 - 0.1, R.u1 + 0.1, R.v0 - 0.1, R.v0 + 0.05], [R.u0 - 0.1, R.u1 + 0.1, R.v1 - 0.05, R.v1 + 0.1], [R.u0 - 0.1, R.u0 + 0.05, R.v0, R.v1], [R.u1 - 0.05, R.u1 + 0.1, R.v0, R.v1]])
    E('h_render').box(X((a + b) / 2), y + H + 0.38, Z((c + d) / 2), b - a, 0.36, d - c, { col: C('#ece9e2') });
  E('h_render').hrect(X(R.u0), Z(R.v1), X(R.u1), Z(R.v0), y + H + 0.205, 1, C('#8a8f93')); // roof membrane
  // door frame (steel), canopy hood over the door
  E('h_metal').box(X(R.door[0] - 0.03), y + R.doorH / 2, Z(R.v0 - 0.01), 0.06, R.doorH, 0.24, { col: STEEL }); E('h_metal').box(X(R.door[1] + 0.03), y + R.doorH / 2, Z(R.v0 - 0.01), 0.06, R.doorH, 0.24, { col: STEEL });
  E('h_metal').box(X((R.door[0] + R.door[1]) / 2), y + R.doorH + 0.03, Z(R.v0 - 0.01), R.door[1] - R.door[0] + 0.12, 0.06, 0.24, { col: STEEL });
  E('h_render').box(X((R.door[0] + R.door[1]) / 2), y + R.doorH + 0.55, Z(R.v0 - 0.45), R.door[1] - R.door[0] + 1.0, 0.1, 0.9, { col: C('#e4e1da'), bottom: true });
  // plates: name over the door, NO ENTRY + STAFF ONLY beside it (both faces of nothing: on the wall, facing −v)
  const plate = (u, h, w, ph, label) => { const zz = Z(R.v0) + 0.012; const x0 = X(u - w / 2), x1 = X(u + w / 2); E('h_signs').quad([x0, y + h - ph / 2, zz], [x1, y + h - ph / 2, zz], [x1, y + h + ph / 2, zz], [x0, y + h + ph / 2, zz], plateUV(label)); }; // faces −v (the yard)
  plate((R.door[0] + R.door[1]) / 2, R.doorH + 0.28, 1.1, 0.42, 'Body Holding Room'); plate(R.door[1] + 0.55, 1.55, 0.7, 0.35, 'No Entry'); plate(R.door[1] + 0.55, 1.15, 0.7, 0.35, 'Staff Only');
  // condensing unit for the refrigerator on the outside east wall, its pipes running up into the wall
  { const u = R.u1 + 0.32, v = 15.6; E('h_metal').box(X(u), y + 0.55, Z(v), 0.55, 0.75, 0.95, { col: C('#d7d9db') }); E('h_plastic').box(X(u + 0.28), y + 0.58, Z(v), 0.01, 0.6, 0.6, { col: DARK });
    E('h_metal').box(X(u), y + 0.12, Z(v), 0.6, 0.06, 1.0, { col: C('#7d8287') }); E('h_metal').box(X(u - 0.18), y + 1.4, Z(v - 0.3), 0.04, 1.0, 0.04, { col: C('#b0b4b8') }); E('h_metal').box(X(u - 0.08), y + 1.4, Z(v - 0.3), 0.03, 1.0, 0.03, { col: C('#202020') }); }
  E('h_metal').box(X(R.u0 - 0.01), y + 2.4, Z(13.0), 0.02, 0.36, 0.36, { col: C('#a9adb1') }); // exhaust fan grille (west wall)
  // inside: white tiles to 2 m on every wall (gap at the door), grey tiled floor with a drain, paint above, the light panel
  const ui0 = R.u0 + T, ui1 = R.u1 - T, vi0 = R.v0 + T, vi1 = R.v1 - T;
  const tile = (u0, u1, v0, v1) => E('h_tile').box(X((u0 + u1) / 2), y + 1.0, Z((v0 + v1) / 2), Math.max(0.01, u1 - u0), 2.0, Math.max(0.01, v1 - v0), { col: TILE, top: false });
  tile(ui0, ui0 + 0.01, vi0, vi1); tile(ui1 - 0.01, ui1, vi0, vi1); tile(ui0, ui1, vi1 - 0.01, vi1); tile(ui0, R.door[0], vi0, vi0 + 0.01); tile(R.door[1], ui1, vi0, vi0 + 0.01);
  E('h_tile').hrect(X(ui0), Z(vi1), X(ui1), Z(vi0), y + 0.012, 2, FLOOR); E('h_metal').box(X(25.6), y + 0.016, Z(14.2), 0.22, 0.008, 0.22, { col: C('#6d7276') });
  E('h_light').box(X(25.6), y + H - 0.02, Z(13.6), 1.25, 0.03, 0.32, {}); E('h_metal').box(X(25.6), y + H - 0.005, Z(13.6), 1.32, 0.02, 0.38, { col: STEEL });
  // the body refrigerator: 3 columns × 2 rows of insulated doors on a grilled plinth; column 3's lower door is the one
  // that opens (a separate mesh, HospitalBodyRoom) — behind it a dark compartment face
  { const f = R.fridgeFront, d = vi1 - f; const u0 = R.slot[0] - 1.48, u1 = R.slot[1];
    E('h_metal').box(X((u0 + u1) / 2), y + 1.05, Z(f + 0.06 + (d - 0.06) / 2), u1 - u0, 2.1, d - 0.06, { col: STEEL });
    E('h_plastic').box(X((u0 + u1) / 2), y + 0.27, Z(f + 0.03), u1 - u0 - 0.04, 0.4, 0.02, { col: C('#2a2d30') }); // plinth grille
    for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) { const a = u0 + i * 0.74 + 0.01, b = a + 0.72, yb = j === 0 ? R.slotY[0] : 1.32, yt = j === 0 ? R.slotY[1] : 2.02;
      if (i === 2 && j === 0) { E('h_plastic').box(X((a + b) / 2), y + (yb + yt) / 2, Z(f + 0.06), b - a, yt - yb, 0.02, { col: C('#0d0f10') }); continue; } // the open-able compartment (dark inside)
      E('h_metal').box(X((a + b) / 2), y + (yb + yt) / 2, Z(f + 0.03), b - a, yt - yb, 0.05, { col: C('#d3d6d9') }); E('h_metal').box(X(b - 0.07), y + (yb + yt) / 2, Z(f - 0.01), 0.03, 0.22, 0.04, { col: C('#9ea3a8') }); }
    E('h_plastic').box(X(u0 + 0.4), y + 2.08, Z(f + 0.04), 0.16, 0.06, 0.01, { col: C('#0f3a1c') }); E('h_light').box(X(u0 + 0.4), y + 2.08, Z(f + 0.035), 0.1, 0.03, 0.005, {}); // temperature display
    col(u0, u1, f, vi1, 2.1); }
  // the steel body trolley under column 3 (top = the cot's top, 0.85 m: the body slides straight across and in)
  { const [tu, tv] = R.trolley; const L = 2.0, W = 0.62, top = 0.85;
    E('h_metal').box(X(tu), y + top - 0.02, Z(tv), W, 0.03, L, { col: STEEL }); for (const s of [-1, 1]) { E('h_metal').box(X(tu + s * W / 2), y + top + 0.01, Z(tv), 0.02, 0.05, L, { col: STEEL }); E('h_metal').box(X(tu), y + top + 0.01, Z(tv + s * L / 2), W, 0.05, 0.02, { col: STEEL }); }
    E('h_metal').box(X(tu), y + 0.3, Z(tv), W - 0.08, 0.02, L - 0.2, { col: C('#b8bcc0') });
    for (const su of [-1, 1]) for (const sv of [-1, 1]) { E('h_metal').box(X(tu + su * (W / 2 - 0.04)), y + (top + 0.1) / 2, Z(tv + sv * (L / 2 - 0.08)), 0.035, top - 0.12, 0.035, { col: STEEL }); E('h_plastic').box(X(tu + su * (W / 2 - 0.04)), y + 0.05, Z(tv + sv * (L / 2 - 0.08)), 0.04, 0.09, 0.09, { col: DARK }); }
    col(tu - W / 2, tu + W / 2, tv - L / 2, tv + L / 2, top); }
  // hand-wash sink on its cabinet (west wall), paper towels, a shelf of folded sheets
  { const u = ui0 + 0.3, v = 12.5; E('h_plastic').box(X(u), y + 0.42, Z(v), 0.58, 0.84, 1.1, { col: C('#eef0f0') }); E('h_metal').box(X(u), y + 0.87, Z(v), 0.6, 0.04, 1.12, { col: STEEL }); E('h_metal').box(X(u + 0.02), y + 0.85, Z(v), 0.4, 0.02, 0.45, { col: C('#9aa0a4') });
    E('h_metal').box(X(u - 0.2), y + 1.05, Z(v), 0.03, 0.32, 0.03, { col: STEEL }); E('h_metal').box(X(u - 0.1), y + 1.2, Z(v), 0.2, 0.025, 0.025, { col: STEEL }); E('h_plastic').box(X(ui0 + 0.07), y + 1.45, Z(v + 0.75), 0.12, 0.34, 0.28, { col: C('#f6f6f4') }); }
  { const u = ui0 + 0.22, v0 = 13.9, v1 = 14.9; for (const vv of [v0, v1]) for (const uu of [u - 0.18, u + 0.18]) E('h_metal').box(X(uu), y + 0.9, Z(vv), 0.025, 1.8, 0.025, { col: STEEL });
    for (const h of [0.25, 0.75, 1.25, 1.75]) E('h_metal').box(X(u), y + h, Z((v0 + v1) / 2), 0.4, 0.02, v1 - v0, { col: STEEL });
    for (const h of [0.76, 1.26]) for (let k = 0; k < 3; k++) E('h_plastic').box(X(u), y + h + 0.06 + (k % 2) * 0.005, Z(v0 + 0.18 + k * 0.32), 0.32, 0.1 + (k % 2) * 0.02, 0.28, { col: C(k === 1 ? '#e8edf2' : '#f7f7f5') }); }
  // walls: solid round the annex (the doorway has its own always-closed collider for the player, HospitalBodyRoom)
  col(R.u0, R.u0 + T, R.v0, R.v1, H); col(R.u1 - T, R.u1, R.v0, R.v1, H); col(R.u0, R.u1, R.v1 - T, R.v1, H); col(R.u0, R.door[0], R.v0, R.v0 + T, H); col(R.door[1], R.u1, R.v0, R.v0 + T, H);
  col(R.door[0], R.door[1], R.v0 - 0.05, R.v0 + T, R.doorH + 0.8); // the doorway: closed for the player at all times
  col(R.u1, R.u1 + 0.62, 15.1, 16.1, 0.95); // condensing unit
  // a paved apron from the ambulance drive to the door
  E('h_render').hrect(X(R.door[0] - 0.8), Z(R.v0), X(R.door[1] + 1.2), Z(8.4), y + 0.008, 1, C('#cfcbc3'));
}

// the live parts: door leaf, refrigerator door, the bodies kept here, the attendant
export class HospitalBodyRoom {
  constructor(h) {
    this.h = h; this.g = h.g; const mats = hospitalMatTable(); this.group = new THREE.Group(); this.group.name = 'hospBodyRoom';
    const mb = new MultiBuilder(); const w = R.door[1] - R.door[0] - 0.04, hh = R.doorH - 0.03; // the leaf drawn about its hinge (local +x along the leaf, 0 = hinge)
    mb.get('h_door').box(w / 2, hh / 2, 0, w, hh, 0.05, { col: C('#e6e4df') }); mb.get('h_metal').box(w / 2, 0.15, -0.027, w - 0.06, 0.28, 0.006, { col: C('#bfc3c7') }); mb.get('h_metal').box(w / 2, 0.15, 0.027, w - 0.06, 0.28, 0.006, { col: C('#bfc3c7') });
    mb.get('h_metal').box(w - 0.12, 1.1, -0.04, 0.1, 0.3, 0.012, { col: C('#c9ccd0') }); mb.get('h_metal').box(w - 0.12, 1.1, 0.04, 0.1, 0.3, 0.012, { col: C('#c9ccd0') }); // push plates
    mb.get('h_metal').box(w - 0.02, hh - 0.08, 0.06, 0.04, 0.04, 0.05, { col: C('#555a5e') }); // closer arm
    this.leaf = new THREE.Group(); for (const m of mb.toMeshes(mats, { cast: true, receive: true })) this.leaf.add(m);
    this.leaf.position.set(X(R.door[0] + 0.02), Y0 + 0.01, Z(R.v0 + 0.1)); this.group.add(this.leaf); // closed: local +x along +u (= world +x); opens inwards (+v = world −z)
    const fb = new MultiBuilder(); const fw = R.slot[1] - R.slot[0] - 0.02, fh = R.slotY[1] - R.slotY[0] - 0.02;
    fb.get('h_metal').box(fw / 2, 0, 0, fw, fh, 0.05, { col: C('#d3d6d9') }); fb.get('h_metal').box(fw - 0.07, 0, -0.04, 0.03, 0.22, 0.04, { col: C('#9ea3a8') });
    this.fdoor = new THREE.Group(); for (const m of fb.toMeshes(mats, { cast: false, receive: true })) this.fdoor.add(m);
    this.fdoor.position.set(X(R.slot[0] + 0.01), Y0 + (R.slotY[0] + R.slotY[1]) / 2, Z(R.fridgeFront + 0.03)); this.group.add(this.fdoor);
    this.g.scene.add(this.group);
    this.doorK = 0; this.fK = 0; this.staff = 0; this.kept = []; this.noteT = 0; this.stats = { received: 0, stored: 0, attendantRuns: 0 };
    const [cx, cz] = toWorld((R.door[0] + R.door[1]) / 2, R.v0); this.doorX = cx; this.doorZ = cz;
    // the attendant (pre-built, hidden until there is work)
    const ch = new Character(makeAppearance(7521, { preset: 'm_office_mid', sex: 'm' })); ch.root.visible = false; this.g.scene.add(ch.root);
    this.att = { ch, x: 0, z: 0, yaw: 0, state: 'idle', path: null, pi: 0, t: 0, wait: 30, acc: 0 };
  }
  // plan → world helpers / points
  W(u, v) { const [x, z] = toWorld(u, v); return { x, z }; }
  get lane() { return 23.9; } // the crew's lane between the building and the ambulance's side
  get points() { return { out: this.W(R.cot[0], R.v0 - 0.9), door: this.W(R.cot[0], R.v0 + 0.1), cot: this.W(R.cot[0], R.cot[1]), trolley: this.W(R.trolley[0], R.trolley[1]) }; }
  // EMS: is the crew at / in the doorway (the door opens for them)
  want(x, z) { if (Math.hypot(x - this.doorX, z - this.doorZ) < 3.2) this.staff = 0.5; }
  // EMS: the sheet (with the body under it) slides from the cot across onto the trolley; k 0…1; done → the room keeps it
  transfer(sheet, k, from) { const p = this.points.trolley; const kk = sm(k); sheet.position.set(from.x + (p.x - from.x) * kk, from.y + Math.sin(kk * Math.PI) * 0.06, from.z + (p.z - from.z) * kk); }
  receive(sheet) { this.g.scene.attach(sheet); const p = this.points.trolley; sheet.position.x = p.x; sheet.position.z = p.z; this.kept.push(sheet); this.stats.received++; if (this.att.state === 'idle') this.att.wait = Math.min(this.att.wait, 25 + Math.random() * 20); }
  // the attendant's run
  setPath(pts) { const a = this.att; a.path = pts.map(([u, v]) => this.W(u, v)); a.pi = 0; }
  update(dt) {
    const g = this.g, P = g.player; if (!P) return; const d = Math.hypot(P.x - this.doorX, P.z - this.doorZ); const near = d < 60;
    // no entry: a note when the player walks up to the door
    this.noteT -= dt; if (d < 1.6 && this.noteT <= 0 && !P.vehicle) { g.hud && g.hud.notify && g.hud.notify('No entry', 'Body holding room · authorised staff only', 'warn', 3); this.noteT = 12; }
    this.attUpdate(dt, near);
    // door: opens while staff are at it (crew / attendant), closes behind them
    const want = this.staff > 0 ? 1 : 0; this.staff = Math.max(0, this.staff - dt); const was = this.doorK; this.doorK = clamp(this.doorK + Math.sign(want - this.doorK) * dt / 1.1, 0, 1);
    if (was === 0 && this.doorK > 0) HospitalSound.door(this.doorX, this.doorZ, true); if (was > 0 && this.doorK === 0) HospitalSound.door(this.doorX, this.doorZ, false);
    this.leaf.rotation.y = sm(this.doorK) * 1.75; // swings inwards (+v)
    this.fdoor.rotation.y = -sm(this.fK) * 1.9; // the compartment door swings out (−v)
    this.group.visible = near;
  }
  attUpdate(dt, near) {
    const a = this.att, H = this.h, B = H.emsBay; if (!B) return; const ch = a.ch; let speed = 0;
    const edSeen = !!(H.inside && H.vis && H.vis.has('corr0')); // he appears / leaves in the main corridor, only while the player cannot see it
    switch (a.state) {
      case 'idle': if (!this.kept.length) return; if ((a.wait -= dt) > 0 || edSeen) return; // he comes when nobody watches the ED from inside
        this.setPath([[6.0, 10.3], [8.6, 10.3], [14.0, 5.0], [19.6, 3.8], [22.3, 3.8], [24.4, 9.4], [R.cot[0], R.v0 - 0.6], [R.cot[0], 12.0], [R.trolley[0], 11.85]]); a.x = a.path[0].x; a.z = a.path[0].z; a.yaw = Math.PI / 2; a.state = 'walk'; a.next = 'push'; ch.root.visible = true; this.stats.attendantRuns++; break;
      case 'walk': { const tg = a.path[a.pi]; const dx = tg.x - a.x, dz = tg.z - a.z, dd = Math.hypot(dx, dz); if (dd < 0.08) { a.pi++; if (a.pi >= a.path.length) { a.state = a.next; a.t = 0; } break; }
        speed = 1.15; const st = Math.min(dd, speed * dt); a.x += dx / dd * st; a.z += dz / dd * st; a.yaw += wrap(yawTo(dx, dz) - a.yaw) * Math.min(1, dt * 6); this.want(a.x, a.z); break; }
      case 'push': { a.t += dt; a.yaw += wrap(yawTo(0, -1) - a.yaw) * Math.min(1, dt * 5); // facing +v (world −z) at the trolley's head end
        if (a.t > 0.6 && a.t < 1.6) this.fK = clamp((a.t - 0.6) / 1.0, 0, 1); const s = this.kept[0];
        if (s && a.t > 1.6) { const k = sm((a.t - 1.6) / 3.0); const p = this.points.trolley; const end = this.W(R.trolley[0], R.fridgeFront + 1.05); s.position.x = p.x + (end.x - p.x) * k; s.position.z = p.z + (end.z - p.z) * k; s.scale.x = 1 - 0.18 * Math.min(1, k * 3); }
        if (a.t > 4.8 && s) { s.parent?.remove(s); s.traverse((q) => { if (q.isMesh) { q.geometry.dispose(); for (const m of [].concat(q.material)) m.dispose(); } }); this.kept.shift(); this.stats.stored++; }
        if (a.t > 4.8) this.fK = clamp(1 - (a.t - 4.8) / 1.0, 0, 1);
        if (a.t > 6.2) { if (this.kept.length) { a.t = 0.5; break; } this.setPath([[R.cot[0], 12.0], [R.cot[0], R.v0 - 0.7], [24.4, 9.4], [22.3, 3.8], [19.6, 3.8], [14.0, 5.0], [8.6, 10.3], [6.0, 10.3]]); a.state = 'walk'; a.next = 'gone'; } break; }
      case 'gone': if (edSeen) break; ch.root.visible = false; a.state = 'idle'; a.wait = 30; break;
    }
    if (a.state !== 'idle') { ch.root.position.set(a.x, Y0, a.z); ch.root.rotation.y = a.yaw; if (near) { if ((a.acc += dt) > (Math.hypot(this.g.player.x - a.x, this.g.player.z - a.z) < 25 ? 0 : 0.2)) { ch.anim.update(Math.min(0.25, a.acc), speed); a.acc = 0; } } }
  }
  // the ED sliding doors open for him (Hospital.js)
  nearSlide(x, z) { const a = this.att; return a.state !== 'idle' && a.ch.root.visible && Math.hypot(a.x - x, a.z - z) < 2.4; }
  get charCount() { return 1; }
}
