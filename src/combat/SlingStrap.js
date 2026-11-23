// 87th: the long-gun sling strap as ONE continuous strap from swivel to swivel — worn round the body and attached to the gun at
// both ends wherever the gun is (on the back, coming over the shoulder, in the hands).
//
// Before: the strap was a SkinnedMesh glued to the body from buckle to buckle, the tails / buckles a separate rifle-space mesh,
// the rifle on a two-anchor hang. Nothing tied the strap ends to the tails (bend or twist and the two parted: "disconnected
// sections"), and the strap was simply hidden whenever the rifle left the back ("no strap" during every rifle animation).
//
// Now:
//  • the body carries a RING — the sash line over the right shoulder, across the chest, round the left hip and back up the
//    back (found on the bind pose, CarryGear.buildSling), sampled at NB nodes, each skinned to the body with the same
//    dual-quaternion blend the body's own shader uses (computed here on the CPU for these ~180 points only);
//  • the strap is a PATH: rifle swivel U → a free span → the ring nodes from the U attach node round to the L attach node →
//    a free span → rifle swivel L. The attach nodes are TRACKED (searched next to last frame's), so when the rifle travels
//    round the body the strap slides round with it and never changes route abruptly;
//  • the strap mesh (webbing / leather, stitching, shoulder pad, folded-and-stitched ends) and its buckles are built ONCE,
//    straight, in material coordinates (x = metres along the strap, y = off the face, z = across), and bent onto the path in
//    the vertex shader from a tiny float texture of K frames (position, tangent, normal) updated per frame — no vertex
//    upload, no allocation, shadows through a matching depth material, a constant strap length (the ends keep their real
//    size, only the middle takes up any slack).
import * as THREE from 'three';

export const RING_NB = 180; // ring nodes round the torso
const K = 96; // path frames sent to the shader
const SPAN = 12; // samples per free span
const MIN_SPAN = 50; // ring nodes the strap always covers (≈40 cm round the torso)

// ---------------------------------------------------------------------------------------------------- shader patch
const PATH_PARS = /* glsl */ `
uniform highp sampler2D uPathTex; uniform vec4 uPathInfo; uniform vec2 uPathZone; // x = strap length (material), y = fixed end zone, z = path length, w = frames; zone = the adjustable run
vec3 pathTex(int k, int r) { return texelFetch(uPathTex, ivec2(k, r), 0).xyz; }
// material → path distance. The strap is length-adjustable like a real quick-adjust sling: the difference between the path and the
// strap is taken up in ONE plain run of webbing (uPathZone, clear of the pad, the ends and their hardware) — everything else keeps
// its real size; only a shortfall beyond what that run can give is spread along the whole strap
float pathS(float m) {
  float Lm = uPathInfo.x, d = uPathInfo.z - Lm, a = uPathZone.x, b = uPathZone.y, zl = max(1e-3, b - a); float dz = max(d, -0.6 * zl), r = d - dz;
  float s = m <= a ? m : (m >= b ? m + dz : a + (m - a) * (zl + dz) / zl); return s + r * m / Lm;
}
void pathDeform(vec3 p, vec3 n, out vec3 P, out vec3 N) {
  float Lp = uPathInfo.z, Kf = uPathInfo.w; float s = pathS(p.x);
  float f = clamp(s / max(1e-4, Lp), 0.0, 1.0) * (Kf - 1.0); int k = int(min(floor(f), Kf - 2.0)); float t = f - float(k);
  vec3 C = mix(pathTex(k, 0), pathTex(k + 1, 0), t); vec3 T = normalize(mix(pathTex(k, 1), pathTex(k + 1, 1), t));
  vec3 Nn = mix(pathTex(k, 2), pathTex(k + 1, 2), t); Nn = normalize(Nn - T * dot(Nn, T)); vec3 W = cross(T, Nn);
  P = C + Nn * p.y + W * p.z; N = normalize(T * n.x + Nn * n.y + W * n.z);
}
`;
function patchPath(sh, U) {
  sh.uniforms.uPathTex = U.uPathTex; sh.uniforms.uPathInfo = U.uPathInfo; sh.uniforms.uPathZone = U.uPathZone;
  sh.vertexShader = sh.vertexShader.replace('vWsU = uv;', 'vWsU = vec2(uv.x + pathS(position.x) - position.x, uv.y);'); // the weave keeps its pitch where the strap pays out
  sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + PATH_PARS)
    .replace('#include <beginnormal_vertex>', 'vec3 objectNormal; { vec3 pP_; pathDeform( position, normal, pP_, objectNormal ); }\n#ifdef USE_TANGENT\nvec3 objectTangent = vec3( tangent.xyz );\n#endif')
    .replace('#include <begin_vertex>', 'vec3 transformed; { vec3 pN_; pathDeform( position, normal, transformed, pN_ ); }\n#ifdef USE_ALPHAHASH\nvPosition = vec3( position );\n#endif');
}
// a path-bent copy of a (shared) surface material: own uniforms (each strap has its own path), same program for every strap
export function pathMaterial(base, U) {
  const m = base.clone(); const prev = base.onBeforeCompile; const key = (base.customProgramCacheKey ? base.customProgramCacheKey() : base.type) + '|slingPath';
  m.onBeforeCompile = (sh, r) => { if (prev) prev(sh, r); patchPath(sh, U); }; m.customProgramCacheKey = () => key; m.name = (base.name || 'gear') + ':path'; return m;
}
const DEPTH = new Map();
export function pathDepthMaterial(U) {
  const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }); m.onBeforeCompile = (sh) => patchPath(sh, U); m.customProgramCacheKey = () => 'slingPathDepth'; void DEPTH; return m;
}

// ---------------------------------------------------------------------------------------------------- runtime path
const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _w = new THREE.Vector3(), _u = new THREE.Vector3(), _x = new THREE.Vector3();
const _bu = new THREE.Vector3(), _bl = new THREE.Vector3(), _xu = new THREE.Vector3(), _xl = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _e = new THREE.Vector3();
const _rot = new THREE.Matrix4();
const len3 = (x, y, z) => Math.sqrt(x * x + y * y + z * z); // Math.hypot boxes its arguments (allocates per call in V8): not on per-frame paths
export class SlingPath {
  // ring: { P, N (Float32Array NB*3, bind / mesh space), SI (Uint16Array NB*4), SW (Float32Array NB*4) }
  // bars: { U: { p, x }, L: { p, x } } — swivel bar centre and bar axis in RIFLE space; Lm = strap length, E = fixed end zone
  constructor(mesh, ring, bars, Lm, E, slung) {
    this.mesh = mesh; this.ring = ring; this.bars = bars; this.Lm = Lm; this.E = E; this.slung0 = slung; // slung0: { aU, aL } attach nodes with the rifle on the back
    const used = new Set(); for (let j = 0; j < ring.SI.length; j++) if (ring.SW[j] > 0) used.add(ring.SI[j]); this.bones = [...used].sort((a, b) => a - b);
    this.slot = new Int16Array(Math.max(1, (this.bones.at(-1) ?? 0) + 1)).fill(-1); this.bones.forEach((b, i) => { this.slot[b] = i; });
    this.dq = new Float32Array(this.bones.length * 8); // per used bone: real (x y z w), dual (x y z w)
    this.RP = new Float32Array(RING_NB * 3); this.RN = new Float32Array(RING_NB * 3); // skinned ring (mesh space)
    const maxPts = RING_NB + 2 * SPAN + 4; this.pp = new Float32Array(maxPts * 3); this.pn = new Float32Array(maxPts * 3); this.cum = new Float32Array(maxPts);
    this.data = new Float32Array(K * 3 * 4); this.tex = new THREE.DataTexture(this.data, K, 3, THREE.RGBAFormat, THREE.FloatType); this.tex.minFilter = this.tex.magFilter = THREE.NearestFilter; this.tex.generateMipmaps = false; this.tex.needsUpdate = true;
    this.U = { uPathTex: { value: this.tex }, uPathInfo: { value: new THREE.Vector4(Lm, E, Lm, K) }, uPathZone: { value: new THREE.Vector2(E, Lm - E) } }; this.cumR = new Float32Array(RING_NB + 1); this.ringLen = 1;
    this.aU = slung.aU; this.aL = slung.aL; this.fresh = true; this.dirty = false; this.hooked = false; this.target = null; this.slungNow = true; this.len = Lm; this.stretch = 1; this.minClear = 0;
  }
  reset() { this.fresh = true; }
  renderHook() { this.hooked = true; if (!this.dirty || !this.target) return; this.dirty = false; this.update(this.target, this.slungNow); } // once per frame, first draw (shadow or main)
  // CPU dual-quaternion skinning of the ring nodes — the exact blend of HeroRig's DQ_POS / DQ_NORMAL (object space)
  skinRing() {
    const sk = this.mesh.skeleton, bm = this.mesh.bindMatrix, bmi = this.mesh.bindMatrixInverse, D = this.dq;
    for (let i = 0; i < this.bones.length; i++) {
      const b = this.bones[i]; _m.multiplyMatrices(sk.bones[b].matrixWorld, sk.boneInverses[b]); _m2.multiplyMatrices(bmi, _m).multiply(bm);
      const e = _m2.elements; _x.set(e[0], e[1], e[2]).normalize(); _w.set(e[4], e[5], e[6]).normalize(); _u.set(e[8], e[9], e[10]).normalize(); _rot.makeBasis(_x, _w, _u); _q.setFromRotationMatrix(_rot);
      const tx = e[12], ty = e[13], tz = e[14], o = 8 * i; D[o] = _q.x; D[o + 1] = _q.y; D[o + 2] = _q.z; D[o + 3] = _q.w;
      // dual = 0.5 · (t ⊗ r): (t·r.w + t × r.xyz, −t·r.xyz)
      D[o + 4] = 0.5 * (tx * _q.w + (ty * _q.z - tz * _q.y)); D[o + 5] = 0.5 * (ty * _q.w + (tz * _q.x - tx * _q.z)); D[o + 6] = 0.5 * (tz * _q.w + (tx * _q.y - ty * _q.x)); D[o + 7] = -0.5 * (tx * _q.x + ty * _q.y + tz * _q.z);
    }
    const R = this.ring, RP = this.RP, RN = this.RN;
    for (let n = 0; n < RING_NB; n++) {
      let rx = 0, ry = 0, rz = 0, rw = 0, dx = 0, dy = 0, dz = 0, dw = 0, r0 = -1;
      for (let c = 0; c < 4; c++) { const w0 = R.SW[4 * n + c]; if (w0 <= 0) continue; const o = 8 * this.slot[R.SI[4 * n + c]]; let w = w0;
        if (r0 < 0) r0 = o; else if (D[o] * D[r0] + D[o + 1] * D[r0 + 1] + D[o + 2] * D[r0 + 2] + D[o + 3] * D[r0 + 3] < 0) w = -w;
        rx += D[o] * w; ry += D[o + 1] * w; rz += D[o + 2] * w; rw += D[o + 3] * w; dx += D[o + 4] * w; dy += D[o + 5] * w; dz += D[o + 6] * w; dw += D[o + 7] * w; }
      const L = Math.max(1e-6, Math.sqrt(rx * rx + ry * ry + rz * rz + rw * rw)); rx /= L; ry /= L; rz /= L; rw /= L; dx /= L; dy /= L; dz /= L; dw /= L;
      for (let pass = 0; pass < 2; pass++) { const A = pass ? R.N : R.P, O = pass ? RN : RP; const vx = A[3 * n], vy = A[3 * n + 1], vz = A[3 * n + 2];
        // v + 2 r × (r × v + w v)
        const cx = ry * vz - rz * vy + rw * vx, cy = rz * vx - rx * vz + rw * vy, cz = rx * vy - ry * vx + rw * vz;
        let ox = vx + 2 * (ry * cz - rz * cy), oy = vy + 2 * (rz * cx - rx * cz), oz = vz + 2 * (rx * cy - ry * cx);
        if (!pass) { ox += 2 * (rw * dx - dw * rx + (ry * dz - rz * dy)); oy += 2 * (rw * dy - dw * ry + (rz * dx - rx * dz)); oz += 2 * (rw * dz - dw * rz + (rx * dy - ry * dx)); }
        O[3 * n] = ox; O[3 * n + 1] = oy; O[3 * n + 2] = oz; }
    }
  }
  nodeP(i, out) { const j = ((i % RING_NB) + RING_NB) % RING_NB; return out.set(this.RP[3 * j], this.RP[3 * j + 1], this.RP[3 * j + 2]); }
  nodeN(i, out) { const j = ((i % RING_NB) + RING_NB) % RING_NB; return out.set(this.RN[3 * j], this.RN[3 * j + 1], this.RN[3 * j + 2]); }
  // the ring node the strap leaves the body from towards point X: next to last frame's (continuity), close to X and on the side
  // of the body facing it
  // ring arc lengths (this frame's skinned ring): where the strap leaves the body is where a taut strap would — the attach node
  // that makes span + arc shortest (the tangent point round the torso), never one that sends the span into the body
  arcs() { const RP = this.RP, c = this.cumR; c[0] = 0; for (let n = 1; n <= RING_NB; n++) { const j = 3 * (n % RING_NB), i = 3 * (n - 1); c[n] = c[n - 1] + len3(RP[j] - RP[i], RP[j + 1] - RP[i + 1], RP[j + 2] - RP[i + 2]); } this.ringLen = c[RING_NB]; }
  arc(a, b) { const d = this.cumR[b] - this.cumR[a]; return d < 0 ? d + this.ringLen : d; }
  pick(prev, X, win, upper) {
    let best = prev, bc = Infinity;
    for (let d = -win; d <= win; d++) { const i = (((prev + d) % RING_NB) + RING_NB) % RING_NB; this.nodeP(i, _a); this.nodeN(i, _b); _c.subVectors(X, _a); const dist = _c.length(); const face = dist > 1e-5 ? _c.dot(_b) / dist : 1;
      const span = upper ? (this.aL - i + RING_NB) % RING_NB : (i - this.aU + RING_NB) % RING_NB; // the strap stays round the body: never collapses to a loop hanging off the gun
      const cost = dist + (upper ? this.arc(i, this.aL) : this.arc(this.aU, i)) + (face < 0.12 ? (0.12 - face) * (0.02 + dist) * 4 : 0) + Math.abs(d) * 0.0002 + (span < MIN_SPAN ? (MIN_SPAN - span) * 0.05 : 0); if (cost < bc) { bc = cost; best = i; } }
    return best;
  }
  solve(win, iters) { for (let it = 0; it < iters; it++) { this.aL = this.pick(this.aL, _bl, win, false); this.aU = this.pick(this.aU, _bu, win, true); } }
  setZone(a, b) { this.U.uPathZone.value.set(a, b); }
  track(prev, X, win) {
    let best = prev, bc = Infinity;
    for (let d = -win; d <= win; d++) { const i = prev + d; this.nodeP(i, _a); this.nodeN(i, _b); _c.subVectors(X, _a); const dist = _c.length(); const face = dist > 1e-5 ? _c.dot(_b) / dist : 1;
      const cost = dist * (1.6 - 0.6 * face) + Math.abs(d) * 0.0004; if (cost < bc) { bc = cost; best = i; } }
    return ((best % RING_NB) + RING_NB) % RING_NB;
  }
  // per frame: model = the long gun (wherever it is: on the back, in the hands), after the pose and the IK
  update(model, slungNow) {
    this.skinRing(); const inv = _m.copy(this.mesh.matrixWorld).invert(); model.updateWorldMatrix(true, false); _m2.multiplyMatrices(inv, model.matrixWorld);
    const B = this.bars; _bu.copy(B.U.p).applyMatrix4(_m2); _bl.copy(B.L.p).applyMatrix4(_m2); _xu.copy(B.U.x).transformDirection(_m2); _xl.copy(B.L.x).transformDirection(_m2);
    this.arcs(); void slungNow;
    if (this.fresh) { const s = this.slung0; this.aU = this.track(s.aU, _bu, RING_NB / 2); this.aL = this.track(s.aL, _bl, RING_NB / 2); this.solve(30, 4); this.fresh = false; } // nearest nodes anywhere, then pulled taut
    else this.solve(12, 1);
    let span = (this.aL - this.aU + RING_NB) % RING_NB; if (span < 8) { this.aL = (this.aU + 8) % RING_NB; span = 8; } // never fold the strap on itself (pick keeps it ≥ MIN_SPAN in practice)
    this.build(span); this.frames(); return this;
  }
  // polyline: bar U → span → ring arc aU…aL → span → bar L (mesh space), normals = strap face direction
  build(span) {
    const pp = this.pp, pn = this.pn; let n = 0; const push = (p, nr) => { pp[3 * n] = p.x; pp[3 * n + 1] = p.y; pp[3 * n + 2] = p.z; pn[3 * n] = nr.x; pn[3 * n + 1] = nr.y; pn[3 * n + 2] = nr.z; n++; };
    const spanTo = (B0, X0, P3, dArc, N3, fromBar) => { // cubic from the bar (leaving square to the bar axis) to the ring node (along the arc)
      _a.subVectors(P3, B0); const len = _a.length(); _b.copy(_a).addScaledVector(X0, -_a.dot(X0)); if (_b.lengthSq() < 1e-8) _b.copy(_a); _b.normalize();
      _e.crossVectors(_b, X0).normalize(); if (_e.dot(N3) < 0) _e.negate(); // strap face at the bar: square to the bar axis, turned like the body end
      const k = len * 0.36, sag = Math.min(0.05, len * 0.06);
      for (let s = 0; s < SPAN; s++) { const t = fromBar ? s / SPAN : (s + 1) / SPAN; const tt = fromBar ? t : 1 - t; // tt: 0 at the bar, 1 at the ring
        const u = 1 - tt; const b0 = u * u * u, b1 = 3 * u * u * tt, b2 = 3 * u * tt * tt, b3 = tt * tt * tt;
        _c.copy(B0).multiplyScalar(b0 + b1).addScaledVector(_b, k * b1); _d.copy(P3).addScaledVector(dArc, -k); _c.addScaledVector(_d, b2).addScaledVector(P3, b3);
        _c.y -= sag * 4 * tt * (1 - tt); _d.copy(_e).lerp(N3, tt * tt * (3 - 2 * tt)); push(_c, _d); }
    };
    // U end
    this.nodeP(this.aU, _v); this.nodeP(this.aU + 1, _w); _u.subVectors(_w, _v).normalize(); this.nodeN(this.aU, _x);
    spanTo(_bu, _xu, _v, _u, _x, true);
    for (let i = 0; i <= span; i++) { this.nodeP(this.aU + i, _v); this.nodeN(this.aU + i, _x); push(_v, _x); }
    // L end (from the ring out to the bar)
    this.nodeP(this.aL, _v); this.nodeP(this.aL - 1, _w); _u.subVectors(_v, _w).normalize(); this.nodeN(this.aL, _x); _u.negate(); // the span is laid bar → ring: arriving against the arc's direction
    spanTo(_bl, _xl, _v, _u, _x, false); // ring → bar, ending on the bar
    this.n = n;
  }
  // resample the polyline into K frames evenly by length → the texture the shader bends the strap with
  frames() {
    const pp = this.pp, pn = this.pn, n = this.n, cum = this.cum; cum[0] = 0;
    for (let i = 1; i < n; i++) cum[i] = cum[i - 1] + len3(pp[3 * i] - pp[3 * i - 3], pp[3 * i + 1] - pp[3 * i - 2], pp[3 * i + 2] - pp[3 * i - 1]);
    const L = Math.max(1e-3, cum[n - 1]); const D = this.data; let j = 1;
    for (let k = 0; k < K; k++) { const s = (k / (K - 1)) * L; while (j < n - 1 && cum[j] < s) j++; const t = Math.min(1, Math.max(0, (s - cum[j - 1]) / Math.max(1e-6, cum[j] - cum[j - 1])));
      const o = 4 * k; for (let c = 0; c < 3; c++) { D[o + c] = pp[3 * (j - 1) + c] + (pp[3 * j + c] - pp[3 * (j - 1) + c]) * t; D[4 * (2 * K + k) + c] = pn[3 * (j - 1) + c] + (pn[3 * j + c] - pn[3 * (j - 1) + c]) * t; } D[o + 3] = 1; D[4 * (2 * K + k) + 3] = 1; }
    for (let k = 0; k < K; k++) { const a = Math.max(0, k - 1), b = Math.min(K - 1, k + 1); let tx = D[4 * b] - D[4 * a], ty = D[4 * b + 1] - D[4 * a + 1], tz = D[4 * b + 2] - D[4 * a + 2]; const l = len3(tx, ty, tz) || 1; tx /= l; ty /= l; tz /= l;
      const o = 4 * (K + k); D[o] = tx; D[o + 1] = ty; D[o + 2] = tz; D[o + 3] = 0; }
    this.len = L; this.stretch = L / this.Lm; this.U.uPathInfo.value.set(this.Lm, this.E, L, K); this.tex.needsUpdate = true;
  }
  // the bind-pose length of the slung strap (fit time): the same path with the ring unskinned and the rifle on its slot
  static bindLength(ring, bars, Mslot, slung) {
    const fake = Object.create(SlingPath.prototype); fake.RP = ring.P; fake.RN = ring.N; const maxPts = RING_NB + 2 * SPAN + 4; fake.pp = new Float32Array(maxPts * 3); fake.pn = new Float32Array(maxPts * 3); fake.cum = new Float32Array(maxPts);
    _bu.copy(bars.U.p).applyMatrix4(Mslot); _bl.copy(bars.L.p).applyMatrix4(Mslot); _xu.copy(bars.U.x).transformDirection(Mslot); _xl.copy(bars.L.x).transformDirection(Mslot);
    fake.cumR = new Float32Array(RING_NB + 1); fake.arcs(); fake.aU = slung.aU; fake.aL = slung.aL; fake.solve(30, 4); // the same taut solve as at run time: rest length = run-time slung length
    slung.aU = fake.aU; slung.aL = fake.aL; fake.build((fake.aL - fake.aU + RING_NB) % RING_NB);
    let L = 0, mTop = 0, yTop = -Infinity; for (let i = 1; i < fake.n; i++) { L += len3(fake.pp[3 * i] - fake.pp[3 * i - 3], fake.pp[3 * i + 1] - fake.pp[3 * i - 2], fake.pp[3 * i + 2] - fake.pp[3 * i - 1]); if (fake.pp[3 * i + 1] > yTop) { yTop = fake.pp[3 * i + 1]; mTop = L; } }
    return { L, mTop }; // mTop: where the shoulder top falls along the strap (the pad)
  }
}
