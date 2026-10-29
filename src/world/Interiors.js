// Walk-in interiors for story shops and Kavindu's room. Built beneath the street (y = -40) and entered through a fade.
import * as THREE from 'three';
import { MultiBuilder } from '../gfx/MeshBuilder.js';
import { MAT } from '../gfx/Materials.js';
import { plan } from './CityPlan.js';
import { RNG } from '../core/rng.js';
import { Character, randomSpec, HEROES } from '../actors/Character.js';
import { buildHQInterior, HQ_DEF } from './HQInterior.js';
import { HQ } from './PoliceHQ.js';

const Y = -40; const C = (h) => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };
const DEFS = {
  kade: { name: 'Lucky Tea Kade', w: 7, d: 9, wall: '#d9c9a0', floor: '#8a5a3a', keeper: { seed: 4242, sex: 'm', age: 'elder', outfit: 'shirt', top: '#f2f2ee' }, line: 'Plain tea? Milk tea? Sit, sit.' },
  fathima: { name: 'Fathima Textiles', w: 7, d: 11, wall: '#e8d8c0', floor: '#a08a6a', keeper: HEROES.fathima, line: 'Silk from Kandy, cotton from Jaffna. Touch, feel the quality.' },
  selvaraj: { name: 'Selvaraj Electronics', w: 6, d: 10, wall: '#cfd8dc', floor: '#6b7a80', keeper: HEROES.selvaraj, line: 'Phones, radios, fans. If it is broken, I can fix it.' },
  bandara: { name: 'Bandara Spice Stores', w: 7, d: 10, wall: '#e0c890', floor: '#7a5a3a', keeper: HEROES.bandara, line: 'Cinnamon, cardamom, goraka. The real thing, not supermarket dust.' },
  tailor: { name: 'Ceylon Threads', w: 6, d: 9, wall: '#d8d0e0', floor: '#5a4a5a', keeper: { seed: 611, sex: 'f', age: 'adult', outfit: 'saree', top: '#6a2a7a', skirt: 'ankle', skirtCol: '#6a2a7a', pattern: 1, hair: 'bun' }, line: 'A new jacket? I can have it ready before the rain stops.' },
  garage: { name: 'Lanka Auto Care', w: 12, d: 14, wall: '#9aa0a6', floor: '#4a4a4a', keeper: { seed: 733, sex: 'm', age: 'adult', outfit: 'worker', top: '#5a6b3a', cap: '#1f2a3a' }, line: 'Engine, brakes, paint. Tuk or Benz, same care.' },
  room: { name: "Kavindu's room", w: 5, d: 6, wall: '#c8d0c0', floor: '#7a6a5a', keeper: null, line: '' },
};
export class Interiors {
  constructor(game) { this.g = game; this.current = null; this.built = new Map(); this.doors = []; this.fan = null; }
  setupDoors(roomPos) {
    this.doors = Object.entries(plan.missionShops).map(([id, s]) => ({ id, x: s.x, z: s.z, rot: s.rot, faceIn: s.faceIn }));
    if (roomPos) this.doors.push({ id: 'room', x: roomPos[0], z: roomPos[1], rot: 0, faceIn: Math.PI });
    // the Police HQ has no door prompt: it is walked into through its automatic doors (see updateSeamless)
  }
  nearDoor(x, z) { for (const d of this.doors) if (Math.hypot(d.x - x, d.z - z) < 2.2) return d; return null; }
  build(id, door) {
    if (this.built.has(id)) return this.built.get(id);
    if (id === 'hq') { const room = buildHQInterior(this.g, door || { id: 'hq', ...HQ.door }, HQ.interior); this.built.set(id, room); return room; }
    const D = DEFS[id]; const mb = new MultiBuilder(); const rng = new RNG(id.length * 97 + 5);
    const cx = door.x, cz = door.z - 200; // offset in z so rooms don't overlap the shop's own geometry footprint
    const x0 = cx - D.w / 2, x1 = cx + D.w / 2, z0 = cz - D.d, z1 = cz; const H = id === 'garage' ? 5 : 3.2;
    const paint = mb.get('paint'), conc = mb.get('concrete'); const wallC = C(D.wall);
    conc.hrect(x0, z0, x1, z1, Y, 1.2, C(D.floor));
    paint.hrect(x0, z0, x1, z1, Y + H, 1, C('#f2efe8'), true);
    // walls with inward-facing normals (normal = (-dz, dx) of the a→b direction)
    paint.wall(x0, z0, x1, z0, Y, Y + H, [0, 0, 1, 1], wallC); paint.wall(x0, z1, x0, z0, Y, Y + H, [0, 0, 1, 1], wallC); paint.wall(x1, z1, x0, z1, Y, Y + H, [0, 0, 1, 1], wallC); paint.wall(x1, z0, x1, z1, Y, Y + H, [0, 0, 1, 1], wallC);
    paint.box(cx, Y + 1.1, z1 - 0.06, 1.4, 2.2, 0.08, { col: C('#6b4a2a') }); // door
    const obstacles = []; const ob = (bx, bz, w, d) => obstacles.push({ x0: bx - w / 2, x1: bx + w / 2, z0: bz - d / 2, z1: bz + d / 2 });
    // furnishing per type
    const shelf = (sx, sz, w, d, h, fill) => { paint.box(sx, Y + h / 2, sz, w, h, d, { col: C('#5a3a22') }); for (let lvl = 0.4; lvl < h - 0.2; lvl += 0.45) for (let t = -w / 2 + 0.15; t < w / 2 - 0.1; t += 0.22) fill(sx + (d < w ? t : 0), Y + lvl + 0.12, sz + (d < w ? 0 : t)); ob(sx, sz, w, d); };
    if (id === 'fathima' || id === 'tailor') {
      const cols = ['#b0233a', '#e07b1a', '#1b6b6b', '#6a2a7a', '#c72f6c', '#2c4f9e', '#d4a12a', '#0f7a4a', '#f2efe6'];
      shelf(x0 + 0.35, cz - D.d / 2, 0.6, D.d - 2, 2.4, (x, y, z) => paint.cylinder(x, y - 0.1, z, 0.08, 0.08, 0.5, 6, { col: C(rng.pick(cols)) }));
      shelf(x1 - 0.35, cz - D.d / 2, 0.6, D.d - 2, 2.4, (x, y, z) => paint.cylinder(x, y - 0.1, z, 0.08, 0.08, 0.5, 6, { col: C(rng.pick(cols)) }));
      paint.box(cx, Y + 0.5, z0 + 2, 3, 1, 0.8, { col: C('#7a5a3a') }); ob(cx, z0 + 2, 3, 0.8);
      if (id === 'tailor') { paint.box(cx + 1.6, Y + 0.75, cz - 3, 0.9, 0.05, 0.6, { col: C('#3a3a3a') }); paint.cylinder(cx - 1.4, Y, cz - 4, 0.18, 0.12, 1.5, 8, { col: C('#d8c8b0') }); }
    } else if (id === 'selvaraj') {
      shelf(x0 + 0.3, cz - D.d / 2, 0.5, D.d - 2, 2.2, (x, y, z) => paint.box(x, y, z, 0.2, 0.18, 0.18, { col: C(rng.pick(['#222', '#333', '#c0c4c8', '#1d3f8a', '#b51f1f'])) }));
      shelf(x1 - 0.3, cz - D.d / 2, 0.5, D.d - 2, 2.2, (x, y, z) => paint.box(x, y, z, 0.2, 0.15, 0.15, { col: C(rng.pick(['#222', '#e8e8e4', '#555', '#2a5a3a'])) }));
      paint.box(cx, Y + 0.5, z0 + 1.8, 3.4, 1, 0.7, { col: C('#3a4a55') }); ob(cx, z0 + 1.8, 3.4, 0.7); mb.get('glass').box(cx, Y + 1.0, z0 + 1.8, 3.4, 0.02, 0.7);
      for (let i = 0; i < 4; i++) mb.get('emissive').box(cx - 1.2 + i * 0.8, Y + 1.7, z0 + 0.06, 0.6, 0.4, 0.04, { col: [0.2 + i * 0.15, 0.5, 0.9] });
    } else if (id === 'bandara') {
      const sp = ['#b5651d', '#d4a12a', '#8a2a1a', '#e0c070', '#5a3a1a', '#c04020'];
      for (let i = 0; i < 10; i++) { const sx = x0 + 0.9 + (i % 5) * ((D.w - 1.8) / 4), sz = cz - 2 - Math.floor(i / 5) * 3; paint.cylinder(sx, Y, sz, 0.32, 0.28, 0.7, 10, { col: C('#c8b088') }); paint.cylinder(sx, Y + 0.7, sz, 0.27, 0.05, 0.12, 10, { col: C(rng.pick(sp)) }); ob(sx, sz, 0.7, 0.7); }
      shelf(cx, z0 + 0.35, D.w - 1, 0.5, 2.4, (x, y, z) => paint.cylinder(x, y - 0.1, z, 0.07, 0.07, 0.22, 6, { col: C(rng.pick(sp)) }));
      paint.box(x1 - 1.2, Y + 0.5, z1 - 2, 1.6, 1, 0.7, { col: C('#6b4a2a') }); ob(x1 - 1.2, z1 - 2, 1.6, 0.7);
    } else if (id === 'kade') {
      paint.box(cx, Y + 0.55, z0 + 1.2, D.w - 1, 1.1, 0.8, { col: C('#5a3a22') }); ob(cx, z0 + 1.2, D.w - 1, 0.8);
      paint.cylinder(cx - 1.5, Y + 1.1, z0 + 1.2, 0.25, 0.25, 0.5, 10, { col: C('#b8bcc0') }); // tea urn
      for (const [tx, tz] of [[cx - 1.5, cz - 4.5], [cx + 1.5, cz - 4.5], [cx - 1.5, cz - 2], [cx + 1.5, cz - 2]]) { paint.box(tx, Y + 0.72, tz, 1.1, 0.06, 0.8, { col: C('#d8d0c0') }); paint.box(tx, Y + 0.36, tz, 0.08, 0.72, 0.08, { col: C('#555') }); for (const s of [-0.75, 0.75]) paint.box(tx + s, Y + 0.22, tz, 0.35, 0.44, 0.35, { col: C('#b51f1f') }); ob(tx, tz, 1.5, 0.9); }
      mb.get('signs').quad([cx - 1.5, Y + 2.0, z0 + 0.05], [cx + 1.5, Y + 2.0, z0 + 0.05], [cx + 1.5, Y + 2.7, z0 + 0.05], [cx - 1.5, Y + 2.7, z0 + 0.05], [0.75, 1 - 4 / 16, 1.0, 1 - 3 / 16]);
    } else if (id === 'garage') {
      paint.box(x0 + 0.6, Y + 0.9, cz - D.d / 2, 1, 1.8, D.d - 3, { col: C('#b51f1f') }); ob(x0 + 0.6, cz - D.d / 2, 1, D.d - 3);
      for (let i = 0; i < 6; i++) paint.cylinder(x1 - 0.8, Y + i * 0.22, z0 + 1 + (i % 2) * 0.1, 0.32, 0.32, 0.2, 12, { col: C('#151515') }); ob(x1 - 0.8, z0 + 1, 0.8, 0.8);
      paint.box(cx, Y + 0.05, cz - 6, 2.4, 0.1, 4.6, { col: C('#c9a227') });
    } else if (id === 'room') {
      paint.box(x0 + 1, Y + 0.25, z0 + 1.2, 1.8, 0.5, 2.1, { col: C('#e8e0d0') }); ob(x0 + 1, z0 + 1.2, 1.8, 2.1);
      paint.box(x1 - 0.5, Y + 0.4, z0 + 0.6, 0.9, 0.8, 0.6, { col: C('#6b4a2a') }); ob(x1 - 0.5, z0 + 0.6, 0.9, 0.6);
      paint.box(x1 - 0.06, Y + 1.6, cz - 3, 0.04, 0.9, 1.2, { col: C('#f2efe6') }); // calendar/photos on wall
    }
    // ceiling fan + tube light
    const g = new THREE.Group(); for (const m of mb.toMeshes(MAT, { cast: false, receive: true })) g.add(m);
    const fan = new THREE.Group(); fan.position.set(cx, Y + H - 0.35, cz - D.d / 2); const bladeG = new THREE.BoxGeometry(1.1, 0.02, 0.12); const bm = new THREE.MeshStandardMaterial({ color: 0xe8e4dc, roughness: 0.6 });
    for (let i = 0; i < 3; i++) { const b = new THREE.Mesh(bladeG, bm); b.rotation.y = (i / 3) * Math.PI * 2; b.position.set(Math.cos(-(i / 3) * Math.PI * 2) * 0.55, 0, Math.sin(-(i / 3) * Math.PI * 2) * 0.55); fan.add(b); } g.add(fan);
    const tube = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.05, 0.08), new THREE.MeshBasicMaterial({ color: 0xffffff })); tube.position.set(cx, Y + H - 0.05, z0 + 0.3); g.add(tube);
    const light = new THREE.PointLight(0xfff1dc, 18, Math.max(D.w, D.d) * 1.6, 1.4); light.position.set(cx, Y + H - 0.6, cz - D.d / 2); g.add(light);
    const amb = new THREE.PointLight(0xffe0c0, 6, 12, 1.5); amb.position.set(cx, Y + 1.5, z1 - 1.5); g.add(amb);
    g.visible = false; this.g.scene.add(g);
    const room = { id, D, g, fan, bounds: { x0: x0 + 0.3, x1: x1 - 0.3, z0: z0 + 0.3, z1: z1 - 0.3 }, obstacles, spawn: [cx, z1 - 1.2], keeperPos: [cx + (id === 'garage' ? 2 : 0.6), z0 + (id === 'kade' ? 2.1 : 2.8)], y: Y, door };
    this.built.set(id, room); return room;
  }
  async enter(door) {
    const g = this.g; const room = this.build(door.id, door); await g.hud.fade(1, 0.5);
    this.prev = { x: g.player.x, z: g.player.z, yaw: g.player.yaw }; room.g.visible = true; this.current = room;
    if (room.D.keeper && !room.keeperCh) { const spec = room.D.keeper.height ? room.D.keeper : randomSpec(room.D.keeper.seed, room.D.keeper); const ch = new Character(spec); ch.root.position.set(room.keeperPos[0], Y, room.keeperPos[1]); room.g.add(ch.root); room.keeperCh = ch; }
    g.player.indoor = room; g.player.x = room.spawn[0]; g.player.z = room.spawn[1]; g.player.y = Y; g.player.yaw = Math.PI; g.player.camYaw = 0; g.player.sync(); g.player.snapCamera();
    g.setIndoor(true); await g.hud.fade(0, 0.5); g.hud.notify(room.D.name, room.id === 'hq' && !this.hqNoted ? HQ_DEF.note : '', 'info', room.id === 'hq' && !this.hqNoted ? 6 : 2.5); if (room.id === 'hq') this.hqNoted = true;
    if (room.D.line) setTimeout(() => g.hud.subtitle(room.D.name.split(' ')[0] === 'Lucky' ? 'Siri' : room.D.name, room.D.line, '', 3.5), 600);
  }
  async exit() {
    const g = this.g; const room = this.current; if (!room) return; await g.hud.fade(1, 0.5);
    room.g.visible = false; this.current = null; g.player.indoor = null; const d = room.door; // door point already sits on the pavement in front of the shop
    g.player.teleport(d.x, d.z, d.faceIn + Math.PI); g.setIndoor(false); await g.hud.fade(0, 0.5);
  }
  // ------------------------------------------------ walk-in Police HQ (no fade, no teleport, no button)
  // The interior lives inside the real building. Walking through the doorway hands the player to the room's floor/obstacle model
  // (stairs, two storeys, camera clamp) while the city keeps running outside; walking back out hands control back to the world.
  updateSeamless(dt) {
    const g = this.g, P = g.player; const r = this.hq || (this.hq = this.build('hq'));
    const d = Math.hypot(P.x - HQ.interior.x, P.z - (r.front + r.depth / 2));
    r.g.visible = !this.current && d < 150; // enclosed by the shell: only drawn when it could be seen through the doors/windows
    if (r.g.visible && d < 70) r.update(dt, P);
    // automatic doors: open for the player (on foot) and anyone walking up to them
    const ex = HQ.interior.x, ez = r.front - 0.2; let want = !P.vehicle && Math.abs(P.x - ex) < 3 && Math.abs(P.z - ez) < 3.4 ? 1 : 0;
    if (!want) for (const p of g.hqLife?.people || []) if (p.ch?.root && Math.abs(p.ch.root.position.x - ex) < 2.6 && Math.abs(p.ch.root.position.z - ez) < 2.8) { want = 1; break; }
    this.doorK = (this.doorK || 0) + Math.sign(want - (this.doorK || 0)) * Math.min(Math.abs(want - (this.doorK || 0)), dt / 0.7);
    const leaves = g.world?.landmarks?.anim?.hqDoors; if (leaves) { const e = (1 - Math.cos(this.doorK * Math.PI)) / 2; for (const lf of leaves) lf.position.x = lf.userData.home + lf.userData.dir * lf.userData.w * 0.95 * e; }
    // hand-over between the world and the room model
    if (P.indoor === r) { if (P.z < r.front - 0.05 || P.vehicle) P.indoor = null; }
    else if (!P.indoor && !P.vehicle && !this.current && P.z > r.front + 0.3 && P.z < r.front + r.depth && P.x > r.bounds.x0 && P.x < r.bounds.x1 && P.y > r.y - 0.6 && P.y < r.y + 2 * r.H) P.indoor = r;
    // how "inside" the camera is: drives the light blend in Game (eased so stepping through the door is a smooth adaptation)
    const tk = P.indoor === r ? Math.min(1, Math.max(0, (P.z - r.front + 0.3) / 3.5)) : 0; this.seamK = (this.seamK || 0) + (tk - (this.seamK || 0)) * Math.min(1, dt * 2.5);
    return this.seamK;
  }
  update(dt) {
    const r = this.current; if (!r) return null; if (r.fan) r.fan.rotation.y += dt * 9; if (r.update) r.update(dt, this.g.player); if (r.keeperCh) { const p = this.g.player; r.keeperCh.root.rotation.y = Math.atan2(p.x - r.keeperPos[0], p.z - r.keeperPos[1]); r.keeperCh.anim.update(dt, 0); }
    const p = this.g.player; if (p.y < r.y + 1 && Math.hypot(p.x - r.spawn[0], p.z - (r.spawn[1] + 0.6)) < 1.3) return 'exit'; return null;
  }
}
