// Police service caps that come off. A peaked cap (Appearance.js police roles: patrol, traffic, supervisor, gate sentry) is
// skinned to its own 'cap' bone (Character.js); knocking it off folds the baked cap away (bone scale → 0, inside the skull)
// and drops an exact loose copy of it — same triangles, colours and material, cut out of the officer's own body geometry
// once per body build — into a small rigid-body simulation:
//   * mass 0.18 kg, inertia from the cap's own extent, air drag + a light flutter torque while it tumbles through the air;
//   * contacts at ~22 support points of the real cap shape (band rim, crown edge, visor tip) against the ground / paving /
//     kerbs (Collision.groundAt): impulse with restitution (a felt-and-plastic cap bounces low), Coulomb friction and rolling
//     resistance, so it lands, skips, rolls on its rim in an arc and wobbles flat — crown up or upside down, as it happens;
//   * walls push it back (resolveCircle), it floats where it falls into the harbour / lake / canal, a moving car flicks it
//     away (pushOut + the car's speed), and a resting cap sleeps (no cost) until something wakes it.
// Triggers: going down as a ragdoll (shot dead, knocked down, hit by a car, blown over — the head's own velocity), a blast
// nearby, a heavy punch to the head, a bullet through the cap. An officer who gets back up carries on bare-headed (the cap stays
// where it fell — no pop back onto the head; pickUp is there for a scripted pick-up). At most 12 loose caps; a resting one far from the player is tidied away after a few minutes.
import * as THREE from 'three';
import { ObjectAudio } from '../audio/ObjectAudio.js';
import * as Lay from '../world/Layout.js';
import { getBodyMaterial, getNpcBodyMaterial } from './Character.js';

const MAX = 12, MASS = 0.18, G = 9.81;
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _r = new THREE.Vector3(), _n = new THREE.Vector3(), _t = new THREE.Vector3(), _j = new THREE.Vector3();
const _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _m3 = new THREE.Matrix3(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
const shapes = new WeakMap(); // body geometry → { geo, matIndex, pts: Vector3[], com, inv: Vector3 (inverse inertia, body axes) }

export const hasCap = (ch) => !!(ch && ch.spec && ch.spec.capStyle === 'peaked' && ch.bones && ch.bones.cap);

// the officer's own cap, cut out of his body geometry: every triangle whose three vertices are fully skinned to the cap bone
function capShape(ch) {
  const src = ch.geoHi || ch.mesh.geometry; let S = shapes.get(src); if (S) return S;
  const bones = ch.mesh.skeleton.bones, ci = bones.indexOf(ch.bones.cap); if (ci < 0) return null;
  const si = src.attributes.skinIndex, sw = src.attributes.skinWeight; const nv = src.attributes.position.count;
  const on = new Uint8Array(nv); for (let v = 0; v < nv; v++) for (let k = 0; k < 4; k++) if (si.getComponent(v, k) === ci && sw.getComponent(v, k) > 0.5) { on[v] = 1; break; }
  const idx = src.index ? src.index.array : null; const nt = (idx ? idx.length : nv) / 3; const tri = []; const grp = new Map();
  const groupOf = (t) => { for (const g of src.groups) if (t * 3 >= g.start && t * 3 < g.start + g.count) return g.materialIndex || 0; return 0; };
  for (let t = 0; t < nt; t++) { const a = idx ? idx[t * 3] : t * 3, b = idx ? idx[t * 3 + 1] : t * 3 + 1, c = idx ? idx[t * 3 + 2] : t * 3 + 2; if (on[a] && on[b] && on[c]) { tri.push(a, b, c); const gi = groupOf(t); grp.set(gi, (grp.get(gi) || 0) + 1); } }
  if (tri.length < 30) return null;
  // bind-pose origin of the cap bone (the loose cap is built round it, then re-centred on its centre of mass)
  const bind = new THREE.Matrix4().copy(ch.mesh.skeleton.boneInverses[ci]).invert(); const o = new THREE.Vector3().setFromMatrixPosition(bind);
  const used = [...new Set(tri)]; const remap = new Map(used.map((v, i) => [v, i])); const geo = new THREE.BufferGeometry();
  for (const [name, att] of Object.entries(src.attributes)) { if (name === 'skinIndex' || name === 'skinWeight') continue;
    const n = att.itemSize, out = new Float32Array(used.length * n); used.forEach((v, i) => { for (let k = 0; k < n; k++) out[i * n + k] = att.getComponent(v, k); });
    geo.setAttribute(name, new THREE.BufferAttribute(out, n)); }
  const P = geo.attributes.position; const com = new THREE.Vector3(); for (let i = 0; i < P.count; i++) com.add(_p.fromBufferAttribute(P, i).sub(o)); com.divideScalar(P.count);
  for (let i = 0; i < P.count; i++) { _p.fromBufferAttribute(P, i).sub(o).sub(com); P.setXYZ(i, _p.x, _p.y, _p.z); }
  geo.setIndex(tri.map((v) => remap.get(v))); geo.computeBoundingSphere(); geo.computeBoundingBox();
  // support points: the vertex furthest along each of 26 directions (cube corners, edges, faces) — the cap's real outline
  const pts = []; for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) { if (!x && !y && !z) continue; _n.set(x, y, z).normalize(); let best = -1e9, bi = 0;
    for (let i = 0; i < P.count; i++) { const d = P.getX(i) * _n.x + P.getY(i) * _n.y + P.getZ(i) * _n.z; if (d > best) { best = d; bi = i; } } const q = new THREE.Vector3().fromBufferAttribute(P, bi); if (!pts.some((u) => u.distanceToSquared(q) < 1e-6)) pts.push(q); }
  const bb = geo.boundingBox, dx = bb.max.x - bb.min.x, dy = bb.max.y - bb.min.y, dz = bb.max.z - bb.min.z; // a thin-walled shell: a bit more inertia than a solid box of the same extent
  const I = (a, b) => (MASS / 9) * (a * a + b * b); const inv = new THREE.Vector3(1 / I(dy, dz), 1 / I(dx, dz), 1 / I(dx, dy));
  let mi = 0, mc = -1; for (const [k, c] of grp) if (c > mc) { mc = c; mi = k; }
  S = { geo, matIndex: mi, pts, com, inv, r: Math.max(dx, dz) / 2 }; shapes.set(src, S); return S;
}

export class LooseCaps {
  constructor(scene, collision) { this.scene = scene; this.col = collision; this.list = []; this.stats = { knocked: 0, picked: 0 }; }
  // knock ch's cap off. vel: world velocity of the head (m/s) the cap leaves with; spin: extra tumble (rad/s)
  knock(ch, vel, spin = 6) {
    if (!hasCap(ch) || ch.capOff || !ch.root.parent) return null; const S = capShape(ch); if (!S) return null;
    const cb = ch.bones.cap; ch.root.updateMatrixWorld(true); cb.updateWorldMatrix(true, false);
    // the shared body material (never a wounded officer's own blood copy, which goes when he is cleared away)
    const src = ch.geoHi || ch.mesh.geometry, mats = ch.mesh.material;
    const mat = S.matIndex === 0 && !ch.heroMats ? (src.userData.npcBody && src.attributes.aFab ? getNpcBodyMaterial() : getBodyMaterial()) : Array.isArray(mats) ? mats[S.matIndex] || mats[0] : mats;
    const mesh = new THREE.Mesh(S.geo, mat); mesh.castShadow = true; mesh.receiveShadow = true; mesh.name = 'looseCap';
    cb.matrixWorld.decompose(_p, _q, _s); const pos = _p.clone().add(S.com.clone().applyQuaternion(_q)); mesh.position.copy(pos); mesh.quaternion.copy(_q);
    this.scene.add(mesh); cb.scale.setScalar(1e-4); ch.capOff = true; // the baked cap folds into a point inside the skull
    const v = vel ? new THREE.Vector3(vel.x || 0, vel.y || 0, vel.z || 0) : new THREE.Vector3();
    const w = new THREE.Vector3((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 2).multiplyScalar(spin);
    const c = { mesh, S, v, w, owner: ch, asleep: false, still: 0, age: 0, contact: false, flut: Math.random() * 10 };
    this.list.push(c); this.stats.knocked++; ch._looseCap = c;
    while (this.list.length > MAX) { const old = this.list.find((q) => q.asleep && q.owner !== ch) || this.list[0]; this.drop(old); }
    return c;
  }
  // an officer back on his feet: his cap back on his head if it lies within reach (else he carries on without it)
  pickUp(ch, reach = 3.5) {
    const c = ch._looseCap; if (!ch.capOff) return false; ch.root.getWorldPosition(_p);
    if (!c || !this.list.includes(c) || c.mesh.position.distanceTo(_p) > reach) return false;
    this.drop(c); this.restore(ch); this.stats.picked++; return true;
  }
  restore(ch) { if (!ch || !ch.bones || !ch.bones.cap) return; ch.bones.cap.scale.setScalar(1); ch.capOff = false; ch._looseCap = null; }
  drop(c) { const i = this.list.indexOf(c); if (i >= 0) this.list.splice(i, 1); c.mesh.parent && c.mesh.parent.remove(c.mesh); if (c.owner && c.owner._looseCap === c) c.owner._looseCap = null; }
  // blast at (x, y, z): caps on heads within reach come off (direction away from the blast), loose ones are thrown
  blast(x, y, z, radius, peds) {
    for (const c of this.list) { const d = c.mesh.position.distanceTo(_p.set(x, y, z)); if (d > radius) continue; const k = (1 - d / radius) * 14; _v.copy(c.mesh.position).sub(_p).normalize(); c.v.addScaledVector(_v, k); c.v.y += k * 0.6; c.w.addScaledVector(_w.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5), k * 3); c.asleep = false; c.still = 0; }
    if (peds) for (const ch of peds) { if (!hasCap(ch) || ch.capOff) continue; ch.bones.head.getWorldPosition(_r); const d = _r.distanceTo(_p.set(x, y, z)); if (d > radius * 1.25) continue;
      const k = (1 - d / (radius * 1.25)) * 12 + 2; _v.copy(_r).sub(_p).setY(0).normalize(); this.knock(ch, { x: _v.x * k, y: 2 + k * 0.5, z: _v.z * k }, 10); }
  }
  // a bullet / punch to the head: dir is the hit direction (world, unit), strength in m/s given to the cap
  hit(ch, dir, strength = 4) { return this.knock(ch, { x: dir.x * strength, y: 1.2 + Math.abs(dir.y || 0) * strength * 0.3, z: dir.z * strength }, 8); }

  update(dt, vehicles, player) {
    if (!this.list.length) return; dt = Math.min(dt, 1 / 20);
    for (const c of this.list.slice()) {
      c.age += dt; const m = c.mesh;
      if (player && c.asleep && c.age > 180 && Math.hypot(m.position.x - player.x, m.position.z - player.z) > 60) { this.drop(c); continue; }
      if (c.asleep && vehicles) for (const vh of vehicles) { if (Math.abs(vh.speed || 0) < 0.5 || Math.abs(vh.x - m.position.x) > 6 || Math.abs(vh.z - m.position.z) > 6) continue; if (vh.pushOut && vh.pushOut(m.position.x, m.position.z, c.S.r + 0.05)) { c.asleep = false; c.still = 0; break; } }
      if (c.asleep) continue;
      const n = 3, h = dt / n; for (let i = 0; i < n; i++) this.step(c, h, vehicles);
    }
  }
  step(c, h, vehicles) {
    const m = c.mesh, S = c.S, p = m.position, v = c.v, w = c.w;
    // gravity, air: drag on the light shell, and a flutter torque while it falls fast (the brim catching the air)
    v.y -= G * h; const sp = v.length(); const air = c.contact ? 0 : 0.9 + 0.35 * sp; v.multiplyScalar(Math.exp(-air * h * 0.35));
    if (!c.contact && sp > 2) { c.flut += h * 9; w.x += Math.sin(c.flut) * 6 * h; w.z += Math.cos(c.flut * 1.3) * 6 * h; }
    w.multiplyScalar(Math.exp(-(c.contact ? 2.2 : 0.35) * h));
    p.addScaledVector(v, h); const wl = w.length(); if (wl > 1e-6) { _q.setFromAxisAngle(_n.copy(w).divideScalar(wl), wl * h); m.quaternion.premultiply(_q).normalize(); }
    // contacts against the ground under every support point
    c.contact = false; _m.makeRotationFromQuaternion(m.quaternion); _m3.setFromMatrix4(_m); let pen = 0;
    const water = Lay.isWater(p.x, p.z) && !(Lay.bridgeWalkAt && Lay.bridgeWalkAt(p.x, p.z)); const wy = water ? (Lay.inCanal && Lay.inCanal(p.z) && !(Lay.inLake && Lay.inLake(p.x, p.z)) ? -1.0 : Lay.inLake && Lay.inLake(p.x, p.z) ? -0.55 : -0.9) : null;
    for (const lp of S.pts) {
      _r.copy(lp).applyMatrix3(_m3); const px = p.x + _r.x, py = p.y + _r.y, pz = p.z + _r.z;
      let g = this.col ? this.col.groundAt(px, pz, py, 0.25) : 0; if (wy !== null && wy > g) g = wy;
      if (py >= g) continue; c.contact = true; pen = Math.max(pen, g - py);
      if (wy !== null && g === wy) continue; // floating: the surface carries it (below), no bounce
      // impulse at the contact point (normal +y), restitution e, Coulomb friction mu
      _w.copy(w).cross(_r).add(v); const vn = _w.y; if (vn >= 0) continue;
      if (vn < -2 && !c._thud) { c._thud = true; ObjectAudio.fall(px, pz, -vn, c, true); } // 76th: the first hard landing (Interactive objects → Object falling)
      const e = Math.abs(vn) > 1.2 ? 0.28 : 0, mu = 0.55;
      const kN = this.kAlong(_n.set(0, 1, 0), _r, _m3, S.inv); const jn = (-(1 + e) * vn) / kN; this.apply(c, _j.set(0, jn, 0), _r, _m3);
      _w.copy(w).cross(_r).add(v); _t.set(_w.x, 0, _w.z); const vt = _t.length();
      if (vt > 1e-5) { _t.divideScalar(vt); const kT = this.kAlong(_t, _r, _m3, S.inv); const jt = Math.min(vt / kT, mu * jn); this.apply(c, _j.copy(_t).multiplyScalar(-jt), _r, _m3); }
    }
    if (pen > 0) { p.y += pen * (wy !== null ? 0.15 : 0.8); if (wy !== null) { v.y *= 0.9; v.x *= 0.995; v.z *= 0.995; w.multiplyScalar(0.97); } }
    if (c.contact) { w.multiplyScalar(0.985); // rolling resistance of the band on the paving
      if (v.lengthSq() < 0.09 && w.lengthSq() < 2.5) { const k = Math.exp(-7 * h); w.multiplyScalar(k); v.x *= k; v.z *= k; } } // settling: felt and plastic soak up the last rocking (no endless wobble on the rim)
    // walls / kerb faces: push back out, lose most of the horizontal speed
    if (this.col && this.col.resolveCircle) { const q = this.col.resolveCircle(p.x, p.z, S.r * 0.8, p.y, 0.12, 0.3); if (q && q.hit) { const nx = q.x - p.x, nz = q.z - p.z, l = Math.hypot(nx, nz) || 1; const vd = (v.x * nx + v.z * nz) / l; if (vd < 0) { v.x -= 1.4 * vd * nx / l; v.z -= 1.4 * vd * nz / l; } p.x = q.x; p.z = q.z; } }
    // a moving car flicks it on
    if (vehicles) for (const vh of vehicles) { if (Math.abs(vh.x - p.x) > 5 || Math.abs(vh.z - p.z) > 5 || !vh.pushOut) continue; const q = vh.pushOut(p.x, p.z, S.r + 0.03); if (!q) continue;
      const dx = q.x - p.x, dz = q.z - p.z, l = Math.hypot(dx, dz) || 1; const s = Math.max(1, Math.abs(vh.speed || 0) * 1.15); v.x = dx / l * s; v.z = dz / l * s; v.y = Math.max(v.y, Math.min(4, s * 0.3)); w.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(s * 2); p.x = q.x; p.z = q.z; }
    // sleeping: at rest on something for half a second
    if (c.contact && v.lengthSq() < 0.008 && w.lengthSq() < 0.12) { c.still += h; if (c.still > 0.5) { c.asleep = true; v.set(0, 0, 0); w.set(0, 0, 0); } } else c.still = 0;
    if (!(p.y > -50)) { p.y = (this.col ? this.col.groundAt(p.x, p.z, 50, 100) : 0) + 0.1; v.set(0, 0, 0); } // safety net: never through the world
  }
  // effective mass term n·((I⁻¹ (r×n)) × r) + 1/m with I⁻¹ in world axes (R diag R^T)
  kAlong(n, r, R, inv) { _s.copy(r).cross(n); this.invI(_s, R, inv); _s.cross(r); return 1 / MASS + _s.dot(n); }
  invI(x, R, inv) { const e = R.elements; // x → R diag(inv) Rᵀ x
    const a = e[0] * x.x + e[1] * x.y + e[2] * x.z, b = e[3] * x.x + e[4] * x.y + e[5] * x.z, c = e[6] * x.x + e[7] * x.y + e[8] * x.z;
    const A = a * inv.x, B = b * inv.y, C = c * inv.z; x.set(e[0] * A + e[3] * B + e[6] * C, e[1] * A + e[4] * B + e[7] * C, e[2] * A + e[5] * B + e[8] * C); return x; }
  apply(c, J, r, R) { c.v.addScaledVector(J, 1 / MASS); _p.copy(r).cross(J); this.invI(_p, R, c.S.inv); c.w.add(_p); }
}
