// Walk-in shops: GTA-style doors with no button and no fade.
//  • Every shop (except the club, which keeps its own entrance) has a real hinged door in a real opening of its facade
//    (BuildingGen leaves the doorway out of the shopfront wall for these buildings). The door is double-acting: walk into
//    it and the protagonist puts his palm on the push plate (Animator reach IK) and shoves it open as he walks through;
//    behind him it swings back on its closer and settles.
//  • The interior is built in place, inside the shop's own building behind the facade, only when the player comes within
//    range of the door (nothing of it exists before that), and it is only drawn while the door is open or the player is
//    inside — otherwise it is hidden, so a closed shop costs nothing.
//  • Inside, the player is handed to the room's collision model (room box + the doorway corridor + the jambs + the door
//    leaf), the camera is kept in the room / doorway, and the outdoor → indoor light adaptation reuses the Police HQ blend.
//  • Lights: shops share ONE pool of six point lights. While a shop is open the HQ's six interior lights are switched off
//    and the pool takes over, so the scene's light count is always the pre-compiled "+6" set (Game.warmLightSets) and
//    walking into a shop never recompiles shaders.
// Frames: each door has a local frame — facade plane z = 0, street towards +z, interior at z < 0, door centred at x = 0.
import * as THREE from 'three';
import { MultiBuilder } from '../gfx/MeshBuilder.js';
import { MAT } from '../gfx/Materials.js';
import * as L from './Layout.js';

export const DOOR_W = 1.1, DOOR_H = 2.3, REVEAL = 0.22, LEAF_Z = -0.07;
const BUILD_R = 7.5, HIDE_R = 16, FREE_R = 140, R = 0.3;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const C = (h) => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };

// door styles: frame / leaf / push plate colours; glazed leaves show the lit shop through the glass once it is built
export const DOOR_STYLES = {
  timber: { frame: '#3b2a1c', leaf: '#5b3c24', panel: '#4a3019', plate: '#b8964a', glass: 0 },
  timberGlass: { frame: '#3b2a1c', leaf: '#5b3c24', panel: '#4a3019', plate: '#b8964a', glass: 1 },
  alu: { frame: '#2b2d2f', leaf: '#34373a', panel: '#2b2d2f', plate: '#c9c9c5', glass: 1 },
  steel: { frame: '#1c1d1f', leaf: '#232527', panel: '#1c1d1f', plate: '#b9bcbe', glass: 1, grille: 1 },
  bronze: { frame: '#3a2a18', leaf: '#4a3620', panel: '#3a2a18', plate: '#c9a24e', glass: 1 },
  black: { frame: '#121212', leaf: '#161616', panel: '#121212', plate: '#d6d6d2', glass: 1 },
  wicket: { frame: '#3a3f44', leaf: '#59626a', panel: '#4b535a', plate: '#c8c8c4', glass: 0 },
};

// --------------------------------------------------------------------------------------------- the door
export class PushDoor {
  constructor({ x, z, yaw, y0, style = 'alu', hinge = -1, w = DOOR_W, h = DOOR_H }) {
    this.F = { x, z }; this.yaw = yaw; this.y0 = y0; this.w = w; this.h = h; this.hinge = hinge; this.dirX = -hinge; this.style = style;
    this.ang = 0; this.vel = 0; this.engaged = false; this.side = 1; this.reachW = 0; this.cs = Math.cos(yaw); this.sn = Math.sin(yaw);
    this.group = new THREE.Group(); this.group.name = 'walkin-door'; this.group.position.set(x, y0, z); this.group.rotation.y = yaw;
    const S = DOOR_STYLES[style] || DOOR_STYLES.alu; const mb = new MultiBuilder(); const paint = mb.get('paint'), metal = mb.get('metal');
    const hw = w / 2, fr = C(S.frame);
    // architrave on the facade (outside face), jamb + head linings through the wall thickness, threshold
    for (const s of [-1, 1]) { paint.box(s * (hw + 0.05), h / 2 + 0.02, 0.015, 0.1, h + 0.04, 0.03, { col: fr }); paint.box(s * (hw + 0.01), h / 2, -REVEAL / 2, 0.02, h, REVEAL, { col: fr }); }
    paint.box(0, h + 0.07, 0.015, w + 0.2, 0.1, 0.03, { col: fr }); paint.box(0, h + 0.01, -REVEAL / 2, w, 0.02, REVEAL, { col: fr });
    metal.box(0, 0.012, -REVEAL / 2 + 0.03, w + 0.06, 0.024, REVEAL + 0.08, { col: C('#8a8780') }); // brushed threshold plate
    for (const m of mb.toMeshes(MAT, { cast: true, receive: true })) this.group.add(m);
    // leaf: pivot at the hinge jamb, built along +x (hinge left) or −x (hinge right) in leaf space
    this.pivot = new THREE.Group(); this.pivot.position.set(hinge * hw, 0, LEAF_Z); this.group.add(this.pivot);
    const lb = new MultiBuilder(); const lp = lb.get('paint'), lm = lb.get('metal'), lg = lb.get('glass'); const sx = this.dirX, t = 0.045, lw = w - 0.01;
    const X = (u) => sx * u; const lc = C(S.leaf), pc = C(S.panel);
    if (S.glass) { // stiles + rails round a full-height glass panel
      const st = style === 'timberGlass' ? 0.12 : 0.085; lp.box(X(st / 2), h / 2, 0, st, h - 0.01, t, { col: lc }); lp.box(X(lw - st / 2), h / 2, 0, st, h - 0.01, t, { col: lc });
      const bot = style === 'timberGlass' ? 0.9 : 0.24; lp.box(X(lw / 2), bot / 2, 0, lw, bot, t, { col: lc }); lp.box(X(lw / 2), h - 0.06, 0, lw, 0.11, t, { col: lc });
      if (style === 'timberGlass') { lp.box(X(lw / 2), 0.45, t / 2 + 0.004, lw - 0.34, 0.5, 0.012, { col: pc }); lp.box(X(lw / 2), 0.45, -t / 2 - 0.004, lw - 0.34, 0.5, 0.012, { col: pc }); }
      lg.box(X(lw / 2), (bot + h - 0.11) / 2, 0, lw - 2 * st + 0.02, h - 0.11 - bot + 0.02, 0.012);
      if (S.grille) for (let k = 1; k < 5; k++) lm.box(X(st + (lw - 2 * st) * k / 5), (bot + h - 0.11) / 2, t / 2 + 0.012, 0.014, h - 0.11 - bot, 0.014, { col: C('#3c3f42') });
    } else { // panelled leaf: raised panels on both faces
      lp.box(X(lw / 2), h / 2, 0, lw, h - 0.01, t, { col: lc });
      for (const fz of [1, -1]) for (const [py, ph] of [[0.5, 0.62], [1.45, 1.05]]) { lp.box(X(lw / 2), py, fz * (t / 2 + 0.006), lw - 0.26, ph, 0.012, { col: pc }); }
    }
    // push plate on both faces, at the latch side, and a pull handle on the street face
    const px = lw - 0.13; for (const fz of [1, -1]) lm.box(X(px), 1.12, fz * (t / 2 + 0.004), 0.1, 0.3, 0.006, { col: C(S.plate) });
    lm.box(X(px), 1.05, t / 2 + 0.045, 0.024, 0.34, 0.024, { col: C(S.plate) }); for (const yy of [0.9, 1.2]) lm.box(X(px), yy, t / 2 + 0.024, 0.02, 0.02, 0.04, { col: C(S.plate) });
    lm.box(X(0.02), 2.0, t / 2 + 0.02, 0.05, 0.04, 0.04, { col: C('#555') }); // closer arm shoe
    for (const yy of [0.25, h - 0.3]) lm.box(X(0.005), yy, 0, 0.02, 0.1, t + 0.01, { col: C('#9a9890') }); // hinges
    this.leaf = new THREE.Group(); for (const m of lb.toMeshes(MAT, { cast: true, receive: true })) { m.matrixAutoUpdate = true; this.leaf.add(m); } this.pivot.add(this.leaf);
    this.group.updateMatrixWorld(true);
  }
  local(wx, wz) { const dx = wx - this.F.x, dz = wz - this.F.z; return [dx * this.cs - dz * this.sn, dx * this.sn + dz * this.cs]; }
  world(lx, lz) { return [this.F.x + lx * this.cs + lz * this.sn, this.F.z - lx * this.sn + lz * this.cs]; }
  // leaf geometry in the local frame: hinge point, unit direction to the tip, and the outward face normal
  leafLine() { const th = this.ang, hx = this.hinge * this.w / 2; const ux = this.dirX * Math.cos(th), uz = -Math.sin(th); return { hx, hz: LEAF_Z, ux, uz, nx: this.dirX * Math.sin(th), nz: Math.cos(th) }; }
  get open() { return Math.abs(this.ang); }
  setAngle(a) { this.ang = a; this.pivot.rotation.y = a * (this.hinge === -1 ? 1 : -1); }
}

// --------------------------------------------------------------------------------------------- manager
export class WalkIn {
  constructor(game) {
    this.g = game; this.sites = []; this.active = null; this.k = 0; this.pool = []; this.poolOn = false;
    for (let i = 0; i < 6; i++) { const l = new THREE.PointLight(0xfff1dc, 0, 8, 1.5); l.visible = false; l.position.set(0, -800, 0); this.pool.push(l); game.scene && game.scene.add(l); }
  }
  // site: { id, name, door (pavement point {x, z, faceIn}), b (building), style, build(site) → room }
  add(site) {
    const g = this.g; const th = site.door.faceIn; const dx = Math.sin(th), dz = Math.cos(th); // into the shop
    const fx = site.door.x + dx * 1.3, fz = site.door.z + dz * 1.3; const yaw = th + Math.PI; // outward normal
    const y0 = L.groundY ? L.groundY(site.door.x, site.door.z) : L.LAND_Y;
    site.F = { x: fx, z: fz }; site.yaw = yaw; site.y0 = y0; site.cs = Math.cos(yaw); site.sn = Math.sin(yaw);
    site.doorObj = new PushDoor({ x: fx, z: fz, yaw, y0, style: site.style || 'alu', hinge: site.hinge || -1 });
    if (g.scene) g.scene.add(site.doorObj.group);
    site.room = null; this.sites.push(site); return site;
  }
  local(s, wx, wz) { const dx = wx - s.F.x, dz = wz - s.F.z; return [dx * s.cs - dz * s.sn, dx * s.sn + dz * s.cs]; }
  world(s, lx, lz) { return [s.F.x + lx * s.cs + lz * s.sn, s.F.z - lx * s.sn + lz * s.cs]; }
  siteById(id) { return this.sites.find((s) => s.id === id) || null; }
  get room() { return this.active && this.g.player.indoor === this.active.proxy ? this.active : null; }

  // build the interior of a site (first approach), place it in the building, collect its lights
  buildRoom(s) {
    const r = s.build(s); r.site = s; const og = new THREE.Group(); og.name = 'walkin-' + s.id; og.userData.interior = true;
    og.position.set(s.F.x, s.y0, s.F.z); og.rotation.y = s.yaw; og.add(r.g); og.visible = false; this.g.scene.add(og); og.updateMatrixWorld(true); r.og = og;
    // lights the builder placed as PointLights: recorded (local frame) and removed — the shared pool lights the room
    r.lights = r.lights || []; const found = []; r.g.traverse((o) => { if (o.isPointLight) found.push(o); });
    for (const l of found) { const p = l.getWorldPosition(new THREE.Vector3()); og.worldToLocal(p); r.lights.push({ p: [p.x, p.y, p.z], color: l.color.getHex(), i: l.intensity, d: l.distance, decay: l.decay }); l.parent.remove(l); }
    r.lights = r.lights.slice(0, 6);
    for (const o of r.g.children) if (o.isMesh) { o.castShadow = false; } // interior surfaces: receive only (the building shell shades them)
    const x0 = r.bounds.x0, x1 = r.bounds.x1, z0 = r.bounds.z0; const cs = [[x0, z0], [x1, z0], [x0, 1.9], [x1, 1.9]].map(([a, b]) => this.world(s, a, b));
    const wb = { x0: Math.min(...cs.map((p) => p[0])), x1: Math.max(...cs.map((p) => p[0])), z0: Math.min(...cs.map((p) => p[1])), z1: Math.max(...cs.map((p) => p[1])) };
    const self = this; r.H = r.H || 3.2;
    r.proxy = { id: s.id, walkIn: true, site: s, room: r, bounds: wb, y: s.y0, obstacles: [], floorAt: () => s.y0, ceilAt: () => s.y0 + r.H,
      resolve: (nx, nz) => self.resolve(s, nx, nz), camWorld: (tgt, want) => self.clampCam(s, tgt, want) };
    s.room = r; return r;
  }

  // ---- collision inside (local frame): room box ∪ doorway corridor ∪ a strip of pavement, minus jambs / furniture / the leaf
  resolve(s, nx, nz) {
    const r = s.room, D = s.doorObj, hw = D.w / 2; let [x, z] = this.local(s, nx, nz); const front = -REVEAL;
    if (z < front) { x = clamp(x, r.bounds.x0 + R, r.bounds.x1 - R); z = Math.max(z, r.bounds.z0 + R); }
    else if (z < 0.02) { x = clamp(x, -hw + R * 0.85, hw - R * 0.85); } // in the reveal: between the jambs
    else { x = clamp(x, -hw - 1.6, hw + 1.6); z = Math.min(z, 2.2); if (z < R && Math.abs(x) > hw - R * 0.85) z = R; } // pavement strip in front of the facade
    // jamb corners / front wall: from the room side, the front wall (outside the doorway) is solid
    if (z > front - R && z < front + 0.02 && Math.abs(x) > hw - R * 0.85) z = front - R;
    for (let it = 0; it < 2; it++) {
      for (const o of r.obstacles) { if (x > o.x0 - R && x < o.x1 + R && z > o.z0 - R && z < o.z1 + R) { const dl = x - (o.x0 - R), dr = o.x1 + R - x, dt = z - (o.z0 - R), db = o.z1 + R - z; const m = Math.min(dl, dr, dt, db); if (m === dl) x = o.x0 - R; else if (m === dr) x = o.x1 + R; else if (m === dt) z = o.z0 - R; else z = o.z1 + R; } }
      // the door leaf: a segment from the hinge to the tip; the body is pushed off it (it is held open by the closer)
      const Lf = D.leafLine(); const vx = x - Lf.hx, vz = z - Lf.hz; const tt = clamp(vx * Lf.ux + vz * Lf.uz, 0, D.w); const qx = Lf.hx + Lf.ux * tt, qz = Lf.hz + Lf.uz * tt; const dx = x - qx, dz = z - qz, dd = Math.hypot(dx, dz);
      if (dd < R && tt > 0.02) { const side = dd > 1e-4 ? 1 : 0; if (side) { x = qx + dx / dd * R; z = qz + dz / dd * R; } else { const sg = (this.prevSide || 1); x = qx + Lf.nx * R * sg; z = qz + Lf.nz * R * sg; } }
    }
    return { x: this.world(s, x, z)[0], z: this.world(s, x, z)[1] };
  }
  // ---- camera: march from the head to the wanted position; stop before anything solid in the local model
  clampCam(s, tgt, want) {
    const r = s.room, hw = s.doorObj.w / 2, y0 = s.y0, front = -REVEAL; const solid = (lx, ly, lz) => {
      if (ly < y0 + 0.15) return true;
      if (lz < front) return lx < r.bounds.x0 + 0.08 || lx > r.bounds.x1 - 0.08 || lz < r.bounds.z0 + 0.08 || ly > y0 + r.H - 0.1;
      if (lz < 0.03) return Math.abs(lx) > hw - 0.08 || ly > y0 + DOOR_H - 0.08;
      return false; };
    const [ax, az] = this.local(s, tgt.x, tgt.z), [bx, bz] = this.local(s, want.x, want.z); let last = 0; const N = 16;
    for (let i = 1; i <= N; i++) { const t = i / N; if (solid(ax + (bx - ax) * t, tgt.y + (want.y - tgt.y) * t, az + (bz - az) * t)) break; last = t; }
    const t = Math.max(0.05, last - 0.06); want.lerpVectors(tgt, want, t);
  }

  freeRoom(s) {
    const r = s.room; if (!r) return; if (r.onExit && r.inside) r.onExit(); if (r.keeper && r.keeper.dispose) r.keeper.dispose();
    const kit = new Set(); r.og.traverse((o) => { if (o.isMesh && !o.isSkinnedMesh && o.geometry) { o.geometry.dispose(); const m = o.material; if (m && m.userData && m.userData.own) kit.add(m); } });
    for (const m of kit) m.dispose(); // (maps are cached canvas textures — kept)
    r.og.parent && r.og.parent.remove(r.og); s.room = null;
  }
  // ---- per frame (from Interiors.updateSeamless). Returns the indoor light blend (0 street … 1 inside)
  update(dt) {
    const g = this.g, P = g.player; if (!P || !this.sites.length) return 0;
    let best = null, bd = 1e9; for (const s of this.sites) { const d = Math.hypot(P.x - s.F.x, P.z - s.F.z); s.dist = d; if (d < bd) { bd = d; best = s; } }
    if (P.indoor && P.indoor.walkIn) best = P.indoor.site;
    // build on approach (one per frame), hide far rooms
    for (const s of this.sites) { if (!s.room && s.dist < BUILD_R && !P.vehicle && !this.builtThisFrame) { try { this.buildRoom(s); } catch (e) { console.warn('walk-in build', s.id, e); s.build = () => { throw e; }; } this.builtThisFrame = true; } }
    this.builtThisFrame = false;
    // free rooms the player has left far behind (geometry + keeper; the shared kit materials / canvas textures stay cached)
    for (const s of this.sites) { const r = s.room; if (!r || s.dist < FREE_R || P.indoor === r.proxy || this.active === r) continue; this.freeRoom(s); }
    for (const s of this.sites) this.updateDoor(s, dt, P);
    for (const s of this.sites) { const r = s.room; if (!r) continue; const inside = P.indoor === r.proxy; const vis = inside || (s.doorObj.open > 0.015 && s.dist < HIDE_R); r.og.visible = vis; r.visible = vis; }
    // the active site (the one whose room is drawn nearest / that holds the player)
    let act = null; for (const s of this.sites) if (s.room && s.room.visible && (!act || s.dist < act.dist)) act = s; if (P.indoor && P.indoor.walkIn) act = P.indoor.site;
    this.setActive(act ? act.room : null);
    // handover: walking through an open door hands the player to the room model; walking out (or any teleport) releases it
    for (const s of this.sites) { const r = s.room; if (!r) continue; const [lx, lz] = this.local(s, P.x, P.z); const hw = s.doorObj.w / 2;
      if (P.indoor === r.proxy) { if (P.vehicle || lz > 1.45 || (lz > 0.25 && Math.abs(lx) > hw + 0.2) || lz < r.bounds.z0 - 1 || lx < r.bounds.x0 - 1 || lx > r.bounds.x1 + 1 || Math.abs(P.y - s.y0) > 1.5) { P.indoor = null; if (r.onExit) r.onExit(); } }
      else if (!P.indoor && !P.vehicle && s.doorObj.open > 0.8 && Math.abs(lx) < hw - 0.12 && lz > 0 && lz < 1.25 && Math.abs(P.y - s.y0) < 0.6) { P.indoor = r.proxy; if (r.onEnter) r.onEnter(); if (!r.greeted && r.greet) { r.greeted = true; setTimeout(() => r.greet(), 900); } } }
    // room logic (keeper, prompts) with the player in the room's local frame
    if (this.active) { const r = this.active, s = r.site; const [lx, lz] = this.local(s, P.x, P.z); const ly = (P.yaw - s.yaw); this.pl = { x: lx, z: lz, y: P.y - s.y0, yaw: ly, inside: P.indoor === r.proxy, P };
      if (r.update) try { r.update(dt, this.pl); } catch (e) { console.warn('walk-in room update', e); } }
    // light blend: how far inside the player is
    const inR = P.indoor && P.indoor.walkIn ? P.indoor.room : null; let tk = 0; if (inR) { const [, lz] = this.local(inR.site, P.x, P.z); tk = clamp((-lz - 0.1) / 2.2, 0, 1); }
    this.k += (tk - this.k) * Math.min(1, dt * 2.5); return this.k;
  }
  setActive(r) {
    if (r !== this.active) { this.active = r; }
    const on = !!r; const hq = this.g.interiors && this.g.interiors.hq; const hqL = hq && hq.lights ? hq.lights : [];
    if (on !== this.poolOn) { this.poolOn = on; for (const l of this.pool) l.visible = on; for (const l of hqL) l.visible = !on; }
    if (on) { const s = r.site; for (let i = 0; i < 6; i++) { const l = this.pool[i], d = r.lights[i];
      if (!d) { l.intensity = 0; l.position.set(s.F.x, -800, s.F.z); continue; } const [wx, wz] = this.world(s, d.p[0], d.p[2]); l.position.set(wx, s.y0 + d.p[1], wz); l.color.setHex(d.color); l.distance = d.d; l.decay = d.decay; l.intensity = d.i * (r.lightK ?? 1); } }
  }

  // ---- the door: engage when walking into it, push plate under the palm, closer brings it back
  updateDoor(s, dt, P) {
    const D = s.doorObj; const A = P.ch && P.ch.anim; const [lx, lz] = this.local(s, P.x, P.z); const hw = D.w / 2;
    const fwl = this.local(s, s.F.x + Math.sin(P.yaw), s.F.z + Math.cos(P.yaw)); const fx = fwl[0], fz = fwl[1]; // facing in the local frame
    const onFoot = !P.vehicle && !P.entry && !P.exiting && !P.climb && P.control !== false && !P.dead;
    const inZone = onFoot && Math.abs(lx) < hw + 0.5 && lz > -1.15 && lz < 1.15 && Math.abs(P.y - s.y0) < 0.8;
    const side = lz >= LEAF_Z ? 1 : -1; const toward = -side * fz; // > 0: facing the door from this side
    if (!D.engaged && inZone && toward > 0.35 && P.speed > 0.25 && Math.abs(lz - LEAF_Z) < 1.4 && (s.room || s.dist < BUILD_R)) { D.engaged = true; D.side = side; D.t = 0; if (!s.room) { try { this.buildRoom(s); } catch (e) { console.warn('walk-in build', e); } } this.sound(s, 'open'); }
    if (D.engaged) {
      D.t += dt; const d = Math.abs(lz - LEAF_Z); const through = (lz - LEAF_Z) * D.side < -0.35; // passed to the far side
      if (!inZone || through || (d > 1.5 && toward < 0.2)) D.engaged = false;
      // the hand meets the plate at arm's length (~0.75 m from the leaf); from there the body's progress swings the leaf, which
      // is clear of the shoulders by the time he reaches the threshold
      const need = Math.abs(lx) < hw + 0.15 ? sstep(0.78, 0.22, d) * 1.52 : 0.5;
      const tgt = Math.max(need, d < 0.25 ? 1.48 : 0) * D.side; // positive: swings into the shop (pushed from the street)
      const cur = D.ang; const maxW = 2.4 * dt; let nv = cur + clamp(tgt - cur, -maxW, maxW); if (Math.abs(tgt) < Math.abs(cur) && P.speed < 0.2) nv = cur; // standing still: it stays where it is
      D.vel = (nv - cur) / Math.max(dt, 1e-4); D.setAngle(nv); this.prevSide = D.side;
      P.doorSlow = clamp(1.45 / Math.max(1.45, P.baseSpeed || P.speed || 1.45), 0.35, 1); // a hand on the door: a walking pace (~1.45 m/s)
    } else {
      P.doorSlow = this.anyEngaged(s) ? P.doorSlow : 1;
      // closer: a damped spring (a double-acting door swings a little past centre before it settles)
      if (Math.abs(D.ang) > 1e-3 || Math.abs(D.vel) > 1e-3) { const blocked = Math.abs(lx) < hw + 0.1 && Math.abs(lz - LEAF_Z) < 0.55 && onFoot; // someone in the doorway holds it
        if (!blocked) { D.vel += (-16 * D.ang - 6.2 * D.vel) * dt; let a = D.ang + D.vel * dt; if (Math.abs(a) < 0.004 && Math.abs(D.vel) < 0.05) { a = 0; D.vel = 0; this.sound(s, 'shut'); } D.setAngle(a); } else D.vel = 0; }
    }
    // palm on the push plate (unarmed): weight in while the plate is within reach in front of him, out once it swings away
    let want = 0; let wp = null; const armed = !!(this.g.weapons && this.g.weapons.drawn);
    if (D.engaged && A && !armed && Math.abs(D.ang) < 1.25) {
      const Lf = D.leafLine(); const r = D.w - 0.22; const sgn = D.side; const cx = Lf.hx + Lf.ux * r + Lf.nx * (0.03 + 0.025) * sgn, cz = Lf.hz + Lf.uz * r + Lf.nz * (0.03 + 0.025) * sgn;
      const s0 = P.ch.spec ? P.ch.spec.height / 1.72 : 1; const dxp = cx - lx, dzp = cz - lz, dist = Math.hypot(dxp, dzp);
      const reach = sstep(1.35, 0.85, dist) * sstep(1.3, 1.0, Math.abs(D.ang)) * (dxp * fx + dzp * fz > 0.05 ? 1 : 0); // the arm rises as he walks up and stays on the plate while the leaf swings
      if (reach > 0) { want = reach; const [wx, wz] = this.world(s, cx, cz); wp = { x: wx, z: wz, y: s.y0 + 1.08 * s0, nx: -Lf.nx * sgn, nz: -Lf.nz * sgn, lx: dxp, lz: dzp }; }
    }
    if (D.engaged || D === this.reachDoor) {
      this.reachW = clamp((this.reachW || 0) + (want > 0.01 ? dt / 0.22 : -dt / 0.3), 0, 1); const w = this.reachW * (want || this.lastWant || 0); if (want) this.lastWant = want;
      if (A && w > 0.01 && (wp || this.lastWp)) { const q = wp || this.lastWp; this.lastWp = q; this.reachDoor = D; this.applyReach(P, A, s, q, w); }
      else if (A && A.reach && A.reach.door) { A.reach = null; this.reachDoor = null; }
    }
  }
  anyEngaged(except) { return this.sites.some((x) => x !== except && x.doorObj.engaged); }
  // hand target: the wrist a palm-length below the contact point, palm facing the leaf, fingers up
  applyReach(P, A, s, q, w) {
    const ch = P.ch; const fx = Math.sin(P.yaw), fz = Math.cos(P.yaw); const dx = q.x - P.x, dz = q.z - P.z; const right = dx * -fz + dz * fx > 0; // contact on his right side (his right is −x of the body: (−cos yaw, 0, sin yaw))
    const S = right ? 'R' : 'L'; const n = new THREE.Vector3(-q.nx, 0, -q.nz); const nWorld = new THREE.Vector3(n.x * s.cs + n.z * s.sn, 0, -n.x * s.sn + n.z * s.cs).normalize(); // into the leaf (world)
    const up = new THREE.Vector3(0, 1, 0); const fing = up.clone().addScaledVector(nWorld, 0.25).normalize();
    const xAxis = (S === 'R' ? nWorld.clone() : nWorld.clone().negate()); const yAxis = fing.clone().negate(); const zAxis = new THREE.Vector3().crossVectors(xAxis, yAxis).normalize(); xAxis.crossVectors(yAxis, zAxis).normalize();
    const m = new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis); const quat = new THREE.Quaternion().setFromRotationMatrix(m);
    const s0 = ch.spec ? ch.spec.height / 1.72 : 1; const wrist = new THREE.Vector3(q.x, q.y, q.z).addScaledVector(nWorld, -0.028).addScaledVector(fing, -0.085 * s0);
    A.reach = { S, p: wrist, q: quat, w, lean: 0, maxLean: 0.12, pose: 'open', door: true };
  }
  sound(s, kind) { try { const A = this.g.audioRef || null; if (A && A.sfx) A.sfx(kind === 'open' ? 'doorOpen' : 'doorShut'); } catch { /* optional */ } }
  // anything solid between the street and a room for other systems (e.g. the minimap): the open shop the player is in
  isInside() { const P = this.g.player; return !!(P && P.indoor && P.indoor.walkIn); }
}
