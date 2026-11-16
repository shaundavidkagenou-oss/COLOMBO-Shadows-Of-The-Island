// Breakaway street lamps and traffic signals (52nd request).
// A car that hits a lamp post / signal pole hard enough no longer stops dead against it as if it were a bridge pier: the
// pole shears off its base plate (real highway lamp posts are built to do exactly this), the car loses the momentum the
// pole and the shear take out of it and gets dented where it struck, and the pole goes over — base kicked away along the
// impact, the shaft toppling under gravity, the lamp arm / signal heads twisting round so it comes to rest lying on them
// the way a real one does, bouncing once on the ground with sparks. The light / signal lamps on it go dark, its collider
// is switched off and its instance in the shared InstancedMesh is hidden; a stub of the base stays bolted in place.
// The ground is sampled under the base and under the far end every step (pavement, kerb, road) so the pole never sinks
// into it, and anything tall it falls against (a wall, a tree, a shelter) stops it leaning there instead of passing through.
// Once the player is far away the street is repaired: pole, light, signal and collider come back, the wreck is removed.
//
// Cost: nothing until something breaks; a knocked-down pole is 1-2 meshes sharing the prop geometry and materials.
import * as THREE from 'three';
import * as L from './Layout.js';
import { GEO } from './Props.js';
import { MAT } from '../gfx/Materials.js';
import { VEH_HOOKS } from '../vehicles/Vehicle.js';
import { Audio } from '../audio/Audio.js';

const G = 9.81;
// per type: shaft length (m, base → far end), mass (kg), momentum (kg·m/s) needed to shear the base, half-width of the base
// plate (keeps it out of the ground while it tips), thickness at the far end, and how the parts lie once down
const SPEC = {
  lamp: { len: 8.05, mass: 190, shear: 6800, base: 0.16, tip: 0.07, lie: 'flat' }, // galvanised steel post, LED arm
  lampHeritage: { len: 5.3, mass: 260, shear: 9000, base: 0.25, tip: 0.16, lie: 'along' }, // cast-iron park / heritage lantern post
  signal: { len: 3.35, mass: 120, shear: 5000, base: 0.1, tip: 0.1, lie: 'heads' }, // signal pole with two heads
};
const _m = new THREE.Matrix4(), _zero = new THREE.Matrix4().makeScale(0, 0, 0), _q = new THREE.Quaternion(), _ax = new THREE.Vector3(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3();
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export class PropBreak {
  constructor(game) {
    this.g = game; this.down = []; this.group = new THREE.Group(); this.group.name = 'brokenProps'; game.scene.add(this.group);
    this.stubGeo = new THREE.CylinderGeometry(0.13, 0.15, 0.12, 8); this.stubGeo.translate(0, 0.06, 0);
    VEH_HOOKS.breakProp = (v, c, hit) => this.hit(v, c, hit);
    this.stats = { broken: 0, repaired: 0 };
  }
  // called by Vehicle.step for a breakable pole in the car's path: returns the share of the car's speed it keeps, or 0 if the pole holds
  hit(v, c, hit) {
    const p = c.brk; if (!p || p._down) return 0; const S = SPEC[p.type]; if (!S) return 0;
    const m1 = (v.T && v.T.mass) || 1100; const sp = Math.hypot(hit.vx, hit.vz); if (m1 * sp < S.shear) return 0; // too slow / too light (a scooter at walking pace): the pole holds
    const keep = Math.max(0.55, (m1 / (m1 + S.mass)) - S.shear / (m1 * sp) * 0.12); // momentum shared with the pole + the work of shearing its bolts
    this.knock(p, c, hit.vx, hit.vz, hit.side, sp);
    return keep;
  }
  knock(p, c, vx, vz, side, sp) {
    const S = SPEC[p.type]; p._down = true; c._h = c.h; c.h = 0; this.stats.broken++;
    this.hide(p, true);
    // fall / slide direction: along the car's travel, deflected to the side of the car the pole was on (it glances off the
    // bumper corner and clears the car's path instead of lying across it)
    const fl = Math.hypot(vx, vz) || 1, fx = vx / fl, fz = vz / fl; const sx = fz * side, sz = -fx * side; // side: +1 = the car's left
    let dx = fx * 0.72 + sx * 0.7, dz = fz * 0.72 + sz * 0.7; const dl = Math.hypot(dx, dz); dx /= dl; dz /= dl;
    const root = new THREE.Group(), inner = new THREE.Group(); root.add(inner);
    for (const prt of GEO[p.type]) { const mat = prt.mat === MAT.lampHead ? MAT.metal : prt.mat; const m = new THREE.Mesh(prt.geo, mat); m.castShadow = true; m.receiveShadow = true; inner.add(m); } // the broken lamp's head is dark
    const by = L.LAND_Y; root.position.set(p.x, by, p.z); inner.rotation.y = p.rot || 0; this.group.add(root); /* where Props.js stands it */
    const stub = new THREE.Mesh(this.stubGeo, MAT.metal); stub.position.set(p.x, by, p.z); stub.castShadow = true; this.group.add(stub); // the sheared base plate stays bolted down
    // how the parts lie once down: a lamp's arm and a heritage post's crossbar lie flat (perpendicular to the fall); signal
    // heads end up facing the sky (the bisector of their two faces points back along the fall)
    const r0 = p.rot || 0; let yaw;
    if (S.lie !== 'heads') { const a = S.lie === 'flat' ? Math.atan2(dz, -dx) : Math.atan2(dx, dz); yaw = Math.abs(wrap(a - r0)) < Math.abs(wrap(a + Math.PI - r0)) ? a : a + Math.PI; } // lamp arm (local +z) ⟂ fall; heritage crossbar (local x) ⟂ fall
    else yaw = Math.atan2(-dx, -dz) - Math.PI / 4; // local (1, 0, 1) → −fall direction
    const d = { p, c, root, inner, stub, S, x: p.x, z: p.z, by, dx, dz, th: 0.02, w: 0.55 + 0.035 * sp, vx: dx * sp * 0.42 + fx * sp * 0.1, vz: dz * sp * 0.42 + fz * sp * 0.1, yaw0: r0, dyaw: wrap(yaw - r0), t: 0, hits: 0, rest: false, lean: false };
    d.S = this.clearance(d); this.down.push(d);
    const A = this.g.audio || Audio; if (A && A.ready) { A.debrisHit(p.x, p.z, 1.2); if (A.bulletMetal) A.bulletMetal(p.x, p.z, true); }
    this.sparks(p.x, by + 0.3, p.z, p.type === 'signal' ? 8 : 12); // the cable in the base shorts out
    return d;
  }
  // how far the real parts reach below the shaft's axis once the pole lies flat (LED head, signal heads, base flange): the base
  // half sets how high the base rides, the far half how high the far end lies — so no part of the model ends up in the ground.
  // Measured on this pole's own geometry, once, when it breaks (a few hundred vertices).
  clearance(d) {
    const S = d.S, th0 = d.th; d.th = Math.PI / 2; this.pose(d); d.root.position.set(0, 0, 0); d.root.updateMatrixWorld(true);
    let B = S.base, T = S.tip; const v = _v;
    d.inner.traverse((o) => { if (!o.isMesh) return; const P = o.geometry.attributes.position; for (let i = 0; i < P.count; i++) { v.fromBufferAttribute(P, i).applyMatrix4(o.matrixWorld); const r = v.x * d.dx + v.z * d.dz; if (r < S.len * 0.5) B = Math.max(B, -v.y); else T = Math.max(T, -v.y); } });
    d.th = th0; this.pose(d); d.root.updateMatrixWorld(true);
    return { ...S, base: Math.min(B, 0.6), tip: Math.min(T, 0.6), _drop: [+B.toFixed(3), +T.toFixed(3)] };
  }
  // hide / show the standing pole: its instances in the pooled meshes, its signal lamps, its street light (decal, glow, real light)
  hide(p, off) {
    const W = this.g.world;
    if (W.propPools) for (const P of W.propPools) for (const part of P.parts) { if (!part.props) continue; const i = part.props.indexOf(p); if (i < 0) continue;
      if (off) { part.save = part.save || new Map(); part.save.set(i, part.mat.slice(i * 16, i * 16 + 16)); part.mat.set(_zero.elements, i * 16); } else if (part.save && part.save.has(i)) { part.mat.set(part.save.get(i), i * 16); part.save.delete(i); } }
    for (const ch of W.chunks) if (ch.props) for (const m of ch.props.children) { if (!m.isInstancedMesh || !m.userData.props) continue; const i = m.userData.props.indexOf(p); if (i < 0) continue; // a chunk mesh that was never pooled
      if (off) { m.userData.save = m.userData.save || new Map(); const a = new THREE.Matrix4(); m.getMatrixAt(i, a); m.userData.save.set(i, a); m.setMatrixAt(i, _zero); } else if (m.userData.save && m.userData.save.has(i)) { m.setMatrixAt(i, m.userData.save.get(i)); m.userData.save.delete(i); } m.instanceMatrix.needsUpdate = true; }
    W.propDirty = true;
    if (p._sig) { const { mesh, base } = p._sig; for (let k = 0; k < 6; k++) { if (off) { mesh.getMatrixAt(base + k, _m); (p._sigSave || (p._sigSave = []))[k] = _m.clone(); mesh.setMatrixAt(base + k, _zero); } else if (p._sigSave) mesh.setMatrixAt(base + k, p._sigSave[k]); } mesh.instanceMatrix.needsUpdate = true; }
    if (p._lamp) { const e = p._lamp; const pos = e[5];
      if (off) { e._mesh = e[3]; if (e[3]) { e[3].setMatrixAt(e[4], _zero); e[3].instanceMatrix.needsUpdate = true; } e[3] = null; /* the street-light hand-off restores decals through e[3]: nothing to restore */ for (const ch of W.chunks) { const i = ch.lamps ? ch.lamps.indexOf(e) : -1; if (i >= 0) { ch.lamps.splice(i, 1); e._ch = ch; } } /* no real light / wet glint is handed to it */ if (pos) { pos.setY(e[4], -600); pos.needsUpdate = true; } }
      else { e[3] = e._mesh; if (e._ch && !e._ch.lamps.includes(e)) e._ch.lamps.push(e); if (e[3]) { _m.makeTranslation(e[0], L.ROAD_Y + 0.03, e[2]); e[3].setMatrixAt(e[4], _m); e[3].instanceMatrix.needsUpdate = true; } if (pos) { pos.setY(e[4], e[1]); pos.needsUpdate = true; } } }
    if (W.lampLights) for (const l of W.lampLights) if (p._lamp && l.userData.lamp === p._lamp) { l.intensity = 0; l.userData.k = 0; l.userData.lamp = null; } // the real light on it goes out at once
  }
  sparks(x, y, z, n) { const E = this.g.explosions; if (!E || !E.sparkEmit) return; const gy = L.surfaceY(x, z); for (let i = 0; i < n; i++) E.sparkEmit(_v.set(x, y, z), _v2.set((Math.random() - 0.5) * 6, 0.5 + Math.random() * 4, (Math.random() - 0.5) * 6), 0.15 + Math.random() * 0.35, 0.012, gy + 0.02); E.flush(E.spark); }
  // tallest solid thing at (x, z) a falling pole can rest against (walls, trunks, other poles, shelters) — 0 if none
  obstacle(x, z, self) { const col = this.g.world.collision; let top = 0; for (const c of col.query(x - 0.05, z - 0.05, x + 0.05, z + 0.05)) { if (c === self || !(c.h > 0.6) || c.kind === 'deck' || c.kind === 'platform') continue; if (x < c.x0 || x > c.x1 || z < c.z0 || z > c.z1) continue; top = Math.max(top, (c.y0 || 0) + c.h); } return top; }
  update(dt, focus) {
    if (!this.down.length) return; dt = Math.min(dt, 0.05);
    for (let k = this.down.length - 1; k >= 0; k--) { const d = this.down[k];
      if (focus && Math.hypot(d.x - focus.x, d.z - focus.z) > 230 && d.t > 20) { this.repair(d); this.down.splice(k, 1); continue; } // crews have been: back as it was
      d.t += dt; if (d.rest) continue;
      const n = 3, h = dt / n; for (let s = 0; s < n; s++) this.step(d, h);
      this.pose(d);
    }
  }
  step(d, h) {
    const S = d.S;
    // base slides along the ground (friction), stopped by walls / kerbs it cannot climb and by water
    const sp = Math.hypot(d.vx, d.vz); if (sp > 0) { const ns = Math.max(0, sp - (d.th > 0.6 ? 7 : 4.5) * h); d.vx *= ns / sp; d.vz *= ns / sp; }
    if (sp > 1e-3) { const nx = d.x + d.vx * h, nz = d.z + d.vz * h; const g0 = L.surfaceY(d.x, d.z), g1 = L.surfaceY(nx, nz);
      if (L.isWater(nx, nz) || g1 > g0 + 0.25 || this.obstacle(nx, nz, d.c) > g1 + 0.3) { d.vx *= -0.15; d.vz *= -0.15; } else { d.x = nx; d.z = nz; } }
    // shaft: rigid rod tipping about its base, θ'' = 3g/(2L)·sinθ; the far end may not go below the ground under it
    d.w += (3 * G / (2 * S.len)) * Math.sin(d.th) * h; d.w *= 1 - 0.08 * h; let th = d.th + d.w * h;
    d.by = L.surfaceY(d.x, d.z) + S.base * Math.sin(Math.min(th, Math.PI / 2));
    const tx = d.x + d.dx * S.len * Math.sin(Math.min(th, Math.PI / 2)), tz = d.z + d.dz * S.len * Math.sin(Math.min(th, Math.PI / 2)); const gt = L.surfaceY(tx, tz);
    const thG = Math.PI / 2 + Math.atan2(d.by - (gt + S.tip), S.len); // lying with the far end on the ground there (kerb / road camber)
    // something tall in the way part-way along the shaft: it comes to rest leaning on it
    let thO = 9; for (const f of [0.35, 0.6, 0.85, 1]) { const r = S.len * f; const px = d.x + d.dx * r * Math.sin(th), pz = d.z + d.dz * r * Math.sin(th); const py = d.by + r * Math.cos(th); const top = this.obstacle(px, pz, d.c); if (top > py + 0.05 && top > L.surfaceY(px, pz) + 0.6) { thO = Math.min(thO, d.th); break; } }
    const lim = Math.min(thG, thO);
    if (th >= lim) { th = lim; if (d.w > 0.6) { d.hits++; const tpx = d.x + d.dx * S.len * Math.sin(th), tpz = d.z + d.dz * S.len * Math.sin(th); if (d.hits === 1) { this.sparks(tpx, L.surfaceY(tpx, tpz) + 0.2, tpz, 10); const A = this.g.audio || Audio; if (A && A.ready) A.debrisHit(tpx, tpz, 1.4); } d.w = -d.w * (d.hits === 1 ? 0.22 : 0.1); } else d.w = 0; d.lean = thO < thG; }
    d.th = Math.max(0, th);
    if (d.th >= lim - 1e-3 && Math.abs(d.w) < 0.05 && Math.hypot(d.vx, d.vz) < 0.05) d.rest = true;
  }
  pose(d) {
    const k = Math.min(1, d.th / (Math.PI / 2)); const tw = k * k * (3 - 2 * k); // the shaft twists onto its arm / heads as it goes over
    d.inner.rotation.y = d.yaw0 + d.dyaw * tw;
    _ax.set(d.dz, 0, -d.dx); _q.setFromAxisAngle(_ax, d.th); d.root.quaternion.copy(_q); // up → fall direction
    d.root.position.set(d.x, d.by, d.z);
  }
  // forget fallen poles whose standing props are being rebuilt (MapEditor): remove the wreck without restoring the old instances
  drop(test) { this.down = this.down.filter((d) => { if (!test(d)) return true; this.group.remove(d.root); this.group.remove(d.stub); if (d.c && d.c._h) d.c.h = d.c._h; return false; }); }
    repair(d) { this.group.remove(d.root); this.group.remove(d.stub); d.c.h = d.c._h || 4; d.p._down = false; this.hide(d.p, false); this.stats.repaired++; }
  // debug / tests: knock down the nearest breakable pole to (x, z) as if hit at speed sp heading (vx, vz)
  debugKnock(x, z, sp = 14, yaw = 0) { const col = this.g.world.collision; let best = null, bd = 1e9; for (const c of col.query(x - 30, z - 30, x + 30, z + 30)) { if (!c.brk || c.brk._down || !(c.h > 0)) continue; const dd = Math.hypot((c.x0 + c.x1) / 2 - x, (c.z0 + c.z1) / 2 - z); if (dd < bd) { bd = dd; best = c; } } if (!best) return null; return this.knock(best.brk, best, Math.sin(yaw) * sp, Math.cos(yaw) * sp, 1, sp); }
  info() { return { down: this.down.length, ...this.stats, poles: this.down.map((d) => ({ type: d.p.type, x: +d.x.toFixed(2), z: +d.z.toFixed(2), th: +d.th.toFixed(3), rest: d.rest, lean: d.lean, by: +d.by.toFixed(3), ground: +L.surfaceY(d.x, d.z).toFixed(3) })) }; }
}
