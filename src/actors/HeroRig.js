// Protagonist rig (Dineth, Shashika, David): the crowd's 23-bone skeleton extended to 70 bones for the three playable
// characters only — 30 finger bones (index/middle/ring/pinky/thumb × 3 joints × 2 hands), upper-arm and forearm twist
// bones, toe bones, and 11 spring-driven secondary-motion bones (open-shirt panels, back hem, loose vest straps, watch fob).
// Also owns the protagonist-only shading: dual-quaternion skinning (no volume collapse at elbows / shoulders / knees),
// a wrapped-light subsurface term tuned for brown skin, rain wetness / exertion sweat, and expression wrinkle normals.
import * as THREE from 'three';
import { clamp, lerp, damp } from '../core/math.js';

export const FINGERS = ['idx', 'mid', 'rng', 'pnk'];
const FINGER_BONES = []; for (const S of ['L', 'R']) { for (const f of [...FINGERS, 'thb']) for (let j = 1; j <= 3; j++) FINGER_BONES.push(f + j + S); }
export const DYN_BONES = ['flapL1', 'flapL2', 'flapR1', 'flapR2', 'hemB1', 'strapA1', 'strapA2', 'strapB1', 'strapB2', 'fob1', 'fob2'];
export const HERO_EXTRA = [...FINGER_BONES, 'armTwistL', 'foreTwistL', 'armTwistR', 'foreTwistR', 'toeL', 'toeR', ...DYN_BONES];
export const HERO_PARENT = { armTwistL: 'armL', foreTwistL: 'foreL', armTwistR: 'armR', foreTwistR: 'foreR', toeL: 'footL', toeR: 'footR',
  flapL1: 'spine', flapL2: 'flapL1', flapR1: 'spine', flapR2: 'flapR1', hemB1: 'spine', strapA1: 'spine', strapA2: 'strapA1', strapB1: 'spine', strapB2: 'strapB1', fob1: 'spine', fob2: 'fob1' };
for (const S of ['L', 'R']) for (const f of [...FINGERS, 'thb']) { HERO_PARENT[f + 1 + S] = 'hand' + S; HERO_PARENT[f + 2 + S] = f + 1 + S; HERO_PARENT[f + 3 + S] = f + 2 + S; }

// Finger layout in the bind pose (relaxed, slightly curled hand hanging at the side). Shared by the geometry builder
// (ring positions + weights) and the skeleton (joint positions), so bones sit exactly in the knuckles they bend.
export function fingerLayout(sp, side, J) {
  const s = sp.height / 1.72; const h = J['hand' + side]; const sx = Math.sign(h[0]); const py = 0.842 * s;
  const fingers = [[0.028, 0.074, 0.0088], [0.011, 0.081, 0.0091], [-0.006, 0.076, 0.0086], [-0.022, 0.061, 0.0076]].map(([fz, L, r0], fi) => {
    let x = h[0] - sx * 0.002, y = py - 0.036, ang = 0.12; const segs = [0.46, 0.3, 0.24]; const joints = [[x, y, fz]]; const angs = [];
    segs.forEach((f0, si) => { const len = L * f0; angs.push(ang); y -= Math.cos(ang) * len; x -= sx * Math.sin(ang) * len; joints.push([x, y, fz]); ang += [0.32, 0.38, 0.3][si]; });
    return { name: FINGERS[fi], fz, L, r0, joints, angs, endAng: ang, segs };
  });
  const tb = [h[0] - sx * 0.008, py + 0.004, 0.03];
  const thumb = [tb, [tb[0] - sx * 0.006, tb[1] - 0.022, tb[2] + 0.012], [tb[0] - sx * 0.009, tb[1] - 0.04, tb[2] + 0.017], [tb[0] - sx * 0.011, tb[1] - 0.056, tb[2] + 0.019]];
  return { fingers, thumb, sx, py };
}

// joint positions (bind pose, model space) of the extra bones
export function heroJoints(sp, J) {
  const s = sp.height / 1.72, w = sp.build; const j = {};
  for (const S of ['L', 'R']) {
    const F = fingerLayout(sp, S, J);
    for (const f of F.fingers) for (let k = 0; k < 3; k++) j[f.name + (k + 1) + S] = f.joints[k];
    for (let k = 0; k < 3; k++) j['thb' + (k + 1) + S] = F.thumb[k];
    const a = J['arm' + S], fo = J['fore' + S], ha = J['hand' + S], ft = J['foot' + S];
    j['armTwist' + S] = a.map((v, i) => lerp(v, fo[i], 0.3)); j['foreTwist' + S] = fo.map((v, i) => lerp(v, ha[i], 0.55));
    j['toe' + S] = [ft[0], 0.03 * s, 0.118];
  }
  const fz = (y) => 0.112 * w + 0.012; // just in front of the shirt surface at waist height
  j.flapL1 = [0.088 * w, 1.04 * s, fz()]; j.flapL2 = [0.09 * w, 0.965 * s, fz() + 0.004];
  j.flapR1 = [-0.088 * w, 1.04 * s, fz()]; j.flapR2 = [-0.09 * w, 0.965 * s, fz() + 0.004];
  j.hemB1 = [0, 1.0 * s, -0.112 * w - 0.01];
  j.strapA1 = [0.085 * w, 1.0 * s, 0.135 * w]; j.strapA2 = [0.085 * w, 0.94 * s, 0.137 * w];
  j.strapB1 = [-0.06 * w, 1.0 * s, 0.135 * w]; j.strapB2 = [-0.06 * w, 0.94 * s, 0.137 * w];
  j.fob1 = [0.012, 1.1 * s, 0.118 * w]; j.fob2 = [0.014, 1.065 * s, 0.121 * w];
  return j;
}

// spring chains: bones in order, tip offset of the last bone (bind, model axes), behaviour
const CHAINS = [
  { bones: ['flapL1', 'flapL2'], tip: [0, -0.075, 0.003], front: true, k: 0.26, damp: 0.16, g: 0.55, max: 0.32 },
  { bones: ['flapR1', 'flapR2'], tip: [0, -0.075, 0.003], front: true, k: 0.26, damp: 0.16, g: 0.55, max: 0.32 },
  { bones: ['hemB1'], tip: [0, -0.09, -0.004], back: true, k: 0.28, damp: 0.16, g: 0.5, max: 0.28 },
  { bones: ['strapA1', 'strapA2'], tip: [0, -0.07, 0], front: true, k: 0.06, damp: 0.07, g: 1, max: 0.9 },
  { bones: ['strapB1', 'strapB2'], tip: [0, -0.07, 0], front: true, k: 0.06, damp: 0.07, g: 1, max: 0.9 },
  { bones: ['fob1', 'fob2'], tip: [0.002, -0.04, 0], front: true, k: 0.03, damp: 0.05, g: 1, max: 1.1 },
];

// ------------------------------------------------------------------ hand poses
// curl per finger [thumb, index, middle, ring, pinky] in radians added to the bind (relaxed) curl at each joint
export const HAND_POSES = {
  relax: [0, 0, 0, 0, 0], open: [-0.25, -0.28, -0.28, -0.26, -0.24], fist: [0.75, 1.25, 1.3, 1.3, 1.25],
  grip: [0.6, 0.32, 1.18, 1.24, 1.2], trigger: [0.6, 0.78, 1.18, 1.24, 1.2], support: [0.45, 0.85, 0.95, 1.0, 0.95],
  mag: [0.65, 0.75, 0.9, 0.95, 0.95], pinch: [0.85, 0.95, 1.3, 1.3, 1.25], point: [0.6, -0.15, 1.3, 1.3, 1.25],
  wheel: [0.45, 0.8, 0.9, 0.95, 0.9], phone: [0.4, 0.6, 0.7, 0.75, 0.75], glove: [0.2, 0.35, 0.4, 0.45, 0.45],
};
const JOINT_SHARE = [0.85, 1.0, 0.7]; // how a finger's curl splits across its three joints

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m = new THREE.Matrix4(), _e = new THREE.Euler();
const qIdent = new THREE.Quaternion();

export class HeroRig {
  constructor(ch) {
    this.ch = ch; this.b = ch.bones; this.cur = { L: [0, 0, 0, 0, 0], R: [0, 0, 0, 0, 0] }; this.want = { L: null, R: null }; this.flick = { L: 0, R: 0 };
    this.chains = CHAINS.map((c) => ({ ...c, bones: c.bones.map((n) => this.b[n]), p: null, prev: null, len: [], off: [] }));
    for (const c of this.chains) { c.bones.forEach((bn, i) => { const nx = c.bones[i + 1]; const o = nx ? nx.position.clone() : new THREE.Vector3(...c.tip); c.off.push(o); c.len.push(o.length()); }); }
    this.toeK = { L: 0, R: 0 }; this.wrinkle = 0; this.wrinkleWant = 0; this.simOn = true;
  }
  // gameplay code sets a hand pose for this frame (weapons, driving…); unset hands fall back to the automatic pose
  hand(S, pose, w = 1) { const p = HAND_POSES[pose] || pose; this.want[S] = { p, w }; }
  thumbFlick(S) { this.flick[S] = 1; } // safety toggle / slide release: a quick thumb press
  reset() { for (const c of this.chains) c.p = null; }
  autoPose(S) {
    const A = this.ch.anim; const act = A.action;
    if (A.seated && A.seatW > 0.5) return A.action === 'drive' || A.drive > 0.5 ? 'wheel' : 'relax';
    if (act === 'point' && S === 'R') return 'point'; if (act === 'handsup' || act === 'signal' || act === 'stretch' || act === 'shrug') return 'open';
    if (act === 'phone' && S === 'R') return 'phone'; if (act === 'text') return 'phone'; if (act === 'umbrella' && S === 'R') return 'fist';
    if (act === 'argue' || act === 'shove') return 'open'; if (act === 'cower' || act === 'flinch') return 'fist'; if (act === 'gloves') return 'glove';
    if (act === 'crossarms' || act === 'hips') return 'support'; if (act === 'comms') return S === 'R' ? 'point' : 'relax'; if (act === 'glance' && S === 'L') return 'open'; if (act === 'straps') return 'fist'; if (act === 'glasses' && S === 'R') return 'pinch'; if (act === 'cover') return 'support'; return null;
  }
  update(dt) {
    const b = this.b; dt = Math.min(dt, 0.05);
    // ---- fingers: blend toward the requested pose (or automatic) at a fast but finite rate (no snapping)
    for (const S of ['L', 'R']) {
      const sx = S === 'L' ? 1 : -1; const want = this.want[S]; const ap = want ? null : this.autoPose(S);
      const tgt = want ? want.p.map((v) => v * want.w) : ap ? HAND_POSES[ap] : HAND_POSES.relax;
      const run = this.ch.anim.runW || 0; const cur = this.cur[S];
      for (let i = 0; i < 5; i++) cur[i] = damp(cur[i], tgt[i] + (want || ap ? 0 : run * 0.45 + 0.05), 16, dt);
      this.flick[S] = Math.max(0, this.flick[S] - dt * 4); const fk = Math.sin(this.flick[S] * Math.PI);
      FINGERS.forEach((f, fi) => { const c = cur[fi + 1]; for (let j = 0; j < 3; j++) { const bn = b[f + (j + 1) + S]; bn.rotation.set(0, (fi - 1.5) * 0.04 * (1 - Math.min(1, c)), -sx * c * JOINT_SHARE[j]); } });
      const t = cur[0]; b['thb1' + S].rotation.set(t * 0.55 + fk * 0.25, 0, -sx * t * 0.45); b['thb2' + S].rotation.set(0, 0, -sx * (t * 0.55 + fk * 0.35)); b['thb3' + S].rotation.set(0, 0, -sx * t * 0.5);
      this.want[S] = null;
    }
    // ---- twist bones (swing–twist split): forearm twist takes half the wrist roll, the upper-arm twist undoes half the
    // arm's roll near the shoulder — skin is spread over the limb instead of collapsing into a "candy wrapper"
    for (const S of ['L', 'R']) {
      twistOf(b['hand' + S].quaternion, _v.copy(b['hand' + S].position).normalize(), _q); b['foreTwist' + S].quaternion.copy(qIdent).slerp(_q, 0.5);
      twistOf(b['arm' + S].quaternion, _v.copy(b['fore' + S].position).normalize(), _q); b['armTwist' + S].quaternion.copy(qIdent).slerp(_q.invert(), 0.5);
    }
    // ---- toes: the planted foot rolls onto its toes at push-off → the toe bone counter-rotates so it stays on the ground
    const rootY = this.ch.root.matrixWorld.elements[13];
    for (const S of ['L', 'R']) {
      const foot = b['foot' + S], toe = b['toe' + S]; foot.updateWorldMatrix(true, false); _v.set(0, 0, 1).transformDirection(foot.matrixWorld); const pitch = Math.asin(clamp(-_v.y, -1, 1));
      _v2.setFromMatrixPosition(foot.matrixWorld); const low = _v2.y - rootY < 0.16 * this.ch.anim.s && !this.ch.anim.seated;
      this.toeK[S] = damp(this.toeK[S], low ? clamp(pitch, 0, 0.9) : 0, 20, dt); toe.rotation.set(-this.toeK[S], 0, 0);
    }
    // ---- expression wrinkles (normal-map blend) follow the face rig's expression
    const fe = this.ch.face ? this.ch.face.expr : 'neutral'; const strong = { angry: 1, fear: 0.8, surprise: 0.7, pain: 1, sad: 0.5, smile: 0.45, talk: 0.25 }[fe] || 0;
    this.wrinkle = damp(this.wrinkle, Math.max(strong, this.wrinkleWant), 6, dt); this.wrinkleWant = 0; if (this.ch.heroU) this.ch.heroU.uWrinkle.value = this.wrinkle;
    // ---- secondary motion: verlet spring chains in world space (gravity, damping, pull back to the animated pose),
    // with a one-sided body collision so panels never swing into the torso
    if (this.simOn) this.simulate(dt);
  }
  simulate(dt) {
    const g = -9.8 * dt * dt;
    for (const c of this.chains) {
      const n = c.bones.length; if (!c.p) { c.p = []; c.prev = []; for (let i = 0; i < n; i++) { c.p.push(new THREE.Vector3()); c.prev.push(new THREE.Vector3()); } c.init = true; }
      for (let i = 0; i < n; i++) {
        const bn = c.bones[i]; bn.quaternion.identity(); bn.updateWorldMatrix(true, false);
        const rest = _v.copy(c.off[i]).applyMatrix4(bn.matrixWorld); const origin = _v2.setFromMatrixPosition(bn.matrixWorld); const p = c.p[i], pv = c.prev[i];
        if (c.init || p.distanceToSquared(rest) > 1) { p.copy(rest); pv.copy(rest); }
        const vx = (p.x - pv.x) * (1 - c.damp), vy = (p.y - pv.y) * (1 - c.damp), vz = (p.z - pv.z) * (1 - c.damp); pv.copy(p); p.x += vx; p.y += vy + g * c.g; p.z += vz;
        const kk = 1 - Math.pow(1 - c.k, dt * 60); p.lerp(rest, kk);
        // one-sided collision in the parent (body) frame: the panel/strap may lift away from the body, never into it
        const par = bn.parent; _m.copy(par.matrixWorld).invert(); const lp = p.clone().applyMatrix4(_m); const lr = rest.clone().applyMatrix4(_m);
        if (c.front && lp.z < lr.z - 0.004) lp.z = lr.z - 0.004; if (c.back && lp.z > lr.z + 0.004) lp.z = lr.z + 0.004; p.copy(lp.applyMatrix4(par.matrixWorld));
        // keep the segment length, then aim the bone at the particle
        const d = p.clone().sub(origin); const L = c.len[i]; if (d.lengthSq() < 1e-10) continue; d.setLength(L); p.copy(origin).add(d);
        const parQ = par.getWorldQuaternion(_q2); const dirLocal = d.applyQuaternion(parQ.invert()).normalize();
        bn.quaternion.setFromUnitVectors(_v.copy(c.off[i]).normalize(), dirLocal); const ang = 2 * Math.acos(Math.min(1, Math.abs(bn.quaternion.w))); if (c.max && ang > c.max) bn.quaternion.slerp(qIdent, 1 - c.max / ang); // swing limit (stiff shirt cotton vs loose straps)
        bn.updateWorldMatrix(false, false); if (c.max && ang > c.max) p.copy(_v.copy(c.off[i]).applyMatrix4(bn.matrixWorld)); // keep the particle consistent with the clamped bone
      }
      c.init = false;
    }
  }
}
// twist component of q about unit axis a
function twistOf(q, a, out) { const d = q.x * a.x + q.y * a.y + q.z * a.z; out.set(a.x * d, a.y * d, a.z * d, q.w); const l = out.length(); if (l < 1e-6) return out.identity(); return out.normalize(); }

// ------------------------------------------------------------------ shading
const DQ_FUNCS = `
vec4 dqQuat(mat3 m) { float t = m[0][0] + m[1][1] + m[2][2]; vec4 q;
  if (t > 0.0) { float s = sqrt(t + 1.0) * 2.0; q = vec4((m[1][2] - m[2][1]) / s, (m[2][0] - m[0][2]) / s, (m[0][1] - m[1][0]) / s, 0.25 * s); }
  else if (m[0][0] > m[1][1] && m[0][0] > m[2][2]) { float s = sqrt(1.0 + m[0][0] - m[1][1] - m[2][2]) * 2.0; q = vec4(0.25 * s, (m[1][0] + m[0][1]) / s, (m[2][0] + m[0][2]) / s, (m[1][2] - m[2][1]) / s); }
  else if (m[1][1] > m[2][2]) { float s = sqrt(1.0 + m[1][1] - m[0][0] - m[2][2]) * 2.0; q = vec4((m[1][0] + m[0][1]) / s, 0.25 * s, (m[2][1] + m[1][2]) / s, (m[2][0] - m[0][2]) / s); }
  else { float s = sqrt(1.0 + m[2][2] - m[0][0] - m[1][1]) * 2.0; q = vec4((m[2][0] + m[0][2]) / s, (m[2][1] + m[1][2]) / s, 0.25 * s, (m[0][1] - m[1][0]) / s); }
  return q; }
void dqFrom(mat4 M, out vec4 r, out vec4 d) { mat3 R = mat3(normalize(M[0].xyz), normalize(M[1].xyz), normalize(M[2].xyz)); r = dqQuat(R); vec3 t = M[3].xyz; d = vec4(0.5 * (t * r.w + cross(t, r.xyz)), -0.5 * dot(t, r.xyz)); }
vec3 dqRot(vec4 r, vec3 v) { return v + 2.0 * cross(r.xyz, cross(r.xyz, v) + r.w * v); }
`;
const DQ_NORMAL = `
#ifdef USE_SKINNING
  vec4 dr0, dd0, dr1, dd1, dr2, dd2, dr3, dd3;
  dqFrom(bindMatrixInverse * boneMatX * bindMatrix, dr0, dd0); dqFrom(bindMatrixInverse * boneMatY * bindMatrix, dr1, dd1);
  dqFrom(bindMatrixInverse * boneMatZ * bindMatrix, dr2, dd2); dqFrom(bindMatrixInverse * boneMatW * bindMatrix, dr3, dd3);
  if (dot(dr1, dr0) < 0.0) { dr1 = -dr1; dd1 = -dd1; } if (dot(dr2, dr0) < 0.0) { dr2 = -dr2; dd2 = -dd2; } if (dot(dr3, dr0) < 0.0) { dr3 = -dr3; dd3 = -dd3; }
  vec4 dqR = dr0 * skinWeight.x + dr1 * skinWeight.y + dr2 * skinWeight.z + dr3 * skinWeight.w;
  vec4 dqD = dd0 * skinWeight.x + dd1 * skinWeight.y + dd2 * skinWeight.z + dd3 * skinWeight.w;
  float dqL = max(length(dqR), 1e-6); dqR /= dqL; dqD /= dqL;
  objectNormal = dqRot(dqR, objectNormal);
  #ifdef USE_TANGENT
    objectTangent = dqRot(dqR, objectTangent);
  #endif
#endif
`;
const DQ_POS = `
#ifdef USE_SKINNING
  transformed = dqRot(dqR, transformed) + 2.0 * (dqR.w * dqD.xyz - dqD.w * dqR.xyz + cross(dqR.xyz, dqD.xyz));
#endif
`;
const SSS_LINE = 'reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseContribution ) * ( 1.0 - F );';
const SSS_ADD = `${SSS_LINE}
  #ifdef HERO_SSS
  { // wrapped diffuse: light bleeds past the terminator through the skin, tinted by blood (deeper red-orange for brown skin)
    float ndlR = dot( geometryNormal, directLight.direction ); float wr = saturate( ( ndlR + 0.5 ) / 1.5 );
    vec3 scat = vec3( 0.92, 0.36, 0.2 );
    reflectedLight.directDiffuse += max( wr * wr - saturate( ndlR ), 0.0 ) * scat * directLight.color * BRDF_Lambert( material.diffuseContribution ) * vSkin * 1.6;
    float back = pow( saturate( dot( geometryViewDir, -directLight.direction ) ), 6.0 ) * ( 1.0 - saturate( ndlR + 0.3 ) );
    reflectedLight.directDiffuse += back * scat * directLight.color * material.diffuseContribution * vSkin * 0.12; // thin-edge translucency (ears, nose)
  }
  #endif`;

// per-character uniforms: wetness (rain on clothes and skin), sweat (exertion / humidity), wrinkle (expression)
export function heroUniforms() { return { uWet: { value: 0 }, uSweat: { value: 0 }, uWrinkle: { value: 0 } }; }
export function patchHeroMaterial(mat, kind, U, prev = null) {
  mat.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    sh.uniforms.uWet = U.uWet; sh.uniforms.uSweat = U.uSweat; sh.uniforms.uWrinkle = U.uWrinkle; if (kind === 'face') sh.uniforms.wrinkleMap = { value: faceNormals().wrinkle };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>\nattribute float aSkin;\nvarying float vSkin;\n${DQ_FUNCS}`)
      .replace('#include <skinnormal_vertex>', DQ_NORMAL).replace('#include <skinning_vertex>', DQ_POS)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\nvSkin = ${kind === 'hair' ? '0.0' : kind === 'face' ? '1.0' : 'aSkin'};`);
    let fs = sh.fragmentShader.replace('#include <common>', `#define HERO_SSS\n#include <common>\nvarying float vSkin;\nuniform float uWet, uSweat, uWrinkle;${kind === 'face' ? '\nuniform sampler2D wrinkleMap;' : ''}`);
    fs = fs.replace('#include <color_fragment>', `#include <color_fragment>\n  diffuseColor.rgb *= mix( 1.0, ${kind === 'hair' ? '0.7' : 'mix( 0.62, 0.92, vSkin )'}, uWet );`);
    fs = fs.replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\n  roughnessFactor = mix( roughnessFactor, ${kind === 'hair' ? '0.3' : 'mix( 0.42, 0.2, vSkin )'}, max( uWet, uSweat * vSkin * 0.85 ) );`);
    if (kind === 'face') fs = fs.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
  #ifdef USE_NORMALMAP_TANGENTSPACE
  { vec3 wN = texture2D( wrinkleMap, vNormalMapUv ).xyz * 2.0 - 1.0; wN.xy *= uWrinkle * 1.4; normal = normalize( normal + tbn * vec3( wN.xy, 0.0 ) ); }
  #endif`);
    sh.fragmentShader = fs;
    // the subsurface term lives inside RE_Direct_Physical (shared chunk): swap the include for a patched copy
    sh.fragmentShader = sh.fragmentShader.replace('#include <lights_physical_pars_fragment>', THREE.ShaderChunk.lights_physical_pars_fragment.replace(SSS_LINE, SSS_ADD));
  };
  mat.customProgramCacheKey = () => 'hero-' + kind + (prev ? '-p' : '');
  return mat;
}

// ------------------------------------------------------------------ face normal maps (procedural, original)
// Head UVs: u wraps around the head (front of the face at u = 0.75, 0.111 per radian, decreasing towards the
// character's left), v = 1 at the crown → 0 under the chin. Base map: skin pores + soft age folds. Wrinkle map:
// expression lines (forehead furrows, frown lines between the brows, crow's feet, deeper nasolabial folds) that are
// blended in by uWrinkle when the character strains, aims, is hurt or angry.
let FN = null;
export function faceNormals() {
  if (FN) return FN; const W = 512, H = 256;
  const make = (heightFn, strength) => {
    if (typeof document === 'undefined') return null;
    const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext && c.getContext('2d'); const img = g && g.createImageData ? g.createImageData(W, H) : null; if (!img || !img.data) return null; // no real canvas (Node tests)
    const hgt = new Float32Array(W * H); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) hgt[y * W + x] = heightFn(x / W, 1 - y / H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; const hx = hgt[y * W + ((x + 1) % W)] - hgt[y * W + ((x - 1 + W) % W)]; const hy = hgt[Math.min(H - 1, y + 1) * W + x] - hgt[Math.max(0, y - 1) * W + x];
      let nx = -hx * strength, ny = hy * strength, nz = 1; const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l; img.data[i * 4] = (nx * 0.5 + 0.5) * 255; img.data[i * 4 + 1] = (ny * 0.5 + 0.5) * 255; img.data[i * 4 + 2] = (nz * 0.5 + 0.5) * 255; img.data[i * 4 + 3] = 255; }
    g.putImageData(img, 0, 0); const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.colorSpace = THREE.NoColorSpace; t.anisotropy = 4; return t;
  };
  const hash = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
  const vnoise = (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi; const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf); return lerp(lerp(hash(xi, yi), hash(xi + 1, yi), u), lerp(hash(xi, yi + 1), hash(xi + 1, yi + 1), u), v); };
  const line = (d, w) => Math.exp(-(d * d) / (w * w)); // soft groove profile
  const fold = (u, v, u0, v0, u1, v1, w) => { const dx = u1 - u0, dy = v1 - v0; const t = clamp(((u - u0) * dx + (v - v0) * dy) / (dx * dx + dy * dy), 0, 1); const px = u0 + dx * t, py = v0 + dy * t; return line(Math.hypot(u - px, (v - py) * 0.5), w) * Math.sin(t * Math.PI) ** 0.6; };
  const base = (u, v) => { let h = (vnoise(u * 170, v * 85) - 0.5) * 0.05 + (vnoise(u * 60, v * 30) - 0.5) * 0.06; // faint skin texture at a frequency the 512px map can resolve (finer 'pores' alias into a crumpled look)
    for (const sx of [-1, 1]) h -= 0.35 * fold(u, v, 0.75 + sx * 0.02, 0.43, 0.75 + sx * 0.042, 0.335, 0.004); // soft nasolabial folds
    return h; };
  const wrink = (u, v) => { let h = 0;
    for (let k = 0; k < 3; k++) { const vv = 0.625 + k * 0.03 + 0.004 * Math.sin(u * 300); if (Math.abs(u - 0.75) < 0.055) h -= line(v - vv, 0.0035) * (1 - Math.abs(u - 0.75) / 0.055) * 1.2; } // forehead furrows
    for (const sx of [-1, 1]) { h -= 1.1 * fold(u, v, 0.75 + sx * 0.005, 0.585, 0.75 + sx * 0.008, 0.55, 0.0022); // frown lines between the brows
      h -= 1.0 * fold(u, v, 0.75 + sx * 0.019, 0.44, 0.75 + sx * 0.046, 0.325, 0.0045); // nasolabial folds deepen
      for (let k = -1; k <= 1; k++) h -= 0.8 * fold(u, v, 0.75 + sx * 0.066, 0.51 + k * 0.012, 0.75 + sx * 0.085, 0.51 + k * 0.028, 0.0022); } // crow's feet
    return h; };
  FN = { base: make(base, 6), wrinkle: make(wrink, 22) }; return FN;
}
