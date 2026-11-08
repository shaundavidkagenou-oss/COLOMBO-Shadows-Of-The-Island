// Unarmed combat animation layer (player, street fighters, NPCs who fight back). Applied by the Animator on top of the
// locomotion pose: an orthodox boxing stance (bladed ~26°, knees soft, lead foot forward, hands at the chin, chin tucked),
// four real techniques driven by keyframed body mechanics and arm IK, a high block, and directional hit reactions.
//
// Coordinates: targets are in the character's ROOT space for a 1.72 m person (x = character's left, y = up from the feet,
// z = forward) and are scaled by height. Legs come from a two-bone solve so the feet stay planted in the stance.
//
// Non-graphic: reactions are balance / head movement only, no injury detail.
import * as THREE from 'three';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const sm = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const easeOut = (t) => { t = clamp(t, 0, 1); return 1 - (1 - t) * (1 - t) * (1 - t); };
// keyframe track: [[t, v], …] (v number or array). Fast-out strikes use easeOut on the segments flagged with 'o'.
function track(K, t) {
  if (t <= K[0][0]) return K[0][1]; const n = K.length; if (t >= K[n - 1][0]) return K[n - 1][1];
  for (let i = 1; i < n; i++) if (t <= K[i][0]) { const a = K[i - 1], b = K[i]; let u = (t - a[0]) / (b[0] - a[0]); u = b[2] === 'o' ? easeOut(u) : sm(u);
    if (typeof a[1] === 'number') return lerp(a[1], b[1], u); const out = []; for (let j = 0; j < a[1].length; j++) out.push(lerp(a[1][j], b[1][j], u)); return out; }
  return K[n - 1][1];
}

// ---- the stance (orthodox: left hand / left foot lead)
const GUARD = {
  hipYaw: -0.45, spineYaw: 0.12, chestYaw: 0.08, lean: 0.12, drop: 0.06, fwd: 0.0, chin: 0.1,
  L: [0.09, 1.37, 0.37], R: [-0.1, 1.37, 0.27], poleL: [-0.12, -1, 0.2], poleR: [0.12, -1, 0.2],
};
// moves: dur (s), hit (impact time), side (striking hand), reach (m, centre to centre), dmg (relative), react (victim reaction)
export const MOVES = {
  jab: { dur: 0.34, hit: 0.11, side: 'L', reach: 1.25, dmg: 14, react: 'snap', pow: 0.7, label: 'jab' },
  cross: { dur: 0.44, hit: 0.15, side: 'R', reach: 1.3, dmg: 24, react: 'snap', label: 'cross' },
  hook: { dur: 0.48, hit: 0.19, side: 'L', reach: 1.1, dmg: 30, react: 'hook', dir: 1, label: 'lead hook' },
  upper: { dur: 0.5, hit: 0.21, side: 'R', reach: 1.0, dmg: 34, react: 'upper', label: 'uppercut' },
};
export const COMBO = ['jab', 'cross', 'hook', 'upper'];
// per-move curves (time in seconds). Each returns partial overrides of the guard parameters.
const G = GUARD;
const CURVES = {
  jab: {
    L: [[0, G.L], [0.035, [0.1, 1.46, 0.31]], [0.11, [0.04, 1.5, 0.62], 'o'], [0.145, [0.04, 1.5, 0.61]], [0.3, G.L]],
    R: [[0, G.R], [0.11, [-0.09, 1.49, 0.2]], [0.3, G.R]],
    poleL: [[0, G.poleL], [0.11, [0.7, -0.8, 0.1]], [0.3, G.poleL]],
    twL: [[0, 0], [0.04, 0], [0.11, -1.35, 'o'], [0.15, -1.35], [0.3, 0]],
    hipYaw: [[0, G.hipYaw], [0.11, -0.55], [0.3, G.hipYaw]], chestYaw: [[0, G.chestYaw], [0.11, -0.2], [0.3, G.chestYaw]],
    fwd: [[0, 0], [0.11, 0.035], [0.3, 0]], lean: [[0, G.lean], [0.11, 0.26], [0.3, G.lean]], kneeL: [[0, 0], [0.11, 0.1], [0.3, 0]],
    headZ: [[0, 0], [0.11, -0.1], [0.3, 0]],
  },
  cross: {
    R: [[0, G.R], [0.05, [-0.11, 1.46, 0.2]], [0.15, [-0.03, 1.5, 0.66], 'o'], [0.19, [-0.03, 1.5, 0.65]], [0.4, G.R]],
    L: [[0, G.L], [0.15, [0.08, 1.49, 0.25]], [0.4, G.L]],
    poleR: [[0, G.poleR], [0.15, [-0.7, -0.8, 0.1]], [0.4, G.poleR]],
    twR: [[0, 0], [0.06, 0], [0.15, 1.35, 'o'], [0.19, 1.35], [0.4, 0]],
    hipYaw: [[0, G.hipYaw], [0.04, -0.5], [0.15, 0.1, 'o'], [0.2, 0.08], [0.4, G.hipYaw]], chestYaw: [[0, G.chestYaw], [0.15, 0.32, 'o'], [0.4, G.chestYaw]],
    fwd: [[0, 0], [0.15, 0.05], [0.4, 0]], lean: [[0, G.lean], [0.15, 0.36], [0.4, G.lean]],
    heelR: [[0, 0], [0.05, 0], [0.15, 0.55], [0.22, 0.5], [0.4, 0]], pivR: [[0, 0], [0.15, -0.35], [0.4, 0]], kneeL: [[0, 0], [0.15, 0.14], [0.4, 0]], kneeR: [[0, 0], [0.15, 0.12], [0.4, 0]],
    headZ: [[0, 0], [0.15, 0.08], [0.4, 0]],
  },
  hook: {
    L: [[0, G.L], [0.08, [0.17, 1.45, 0.29]], [0.19, [-0.06, 1.5, 0.42], 'o'], [0.23, [-0.07, 1.5, 0.4]], [0.44, G.L]],
    R: [[0, G.R], [0.19, [-0.09, 1.5, 0.19]], [0.44, G.R]],
    poleL: [[0, G.poleL], [0.08, [0.9, -0.1, -0.3]], [0.19, [1, 0.35, -0.35]], [0.25, [1, 0.3, -0.3]], [0.44, G.poleL]],
    twL: [[0, 0], [0.19, -0.5], [0.44, 0]],
    hipYaw: [[0, G.hipYaw], [0.08, -0.32], [0.19, -0.95, 'o'], [0.24, -0.92], [0.44, G.hipYaw]], chestYaw: [[0, G.chestYaw], [0.08, 0.18], [0.19, -0.42, 'o'], [0.44, G.chestYaw]],
    lean: [[0, G.lean], [0.19, 0.18], [0.44, G.lean]], drop: [[0, G.drop], [0.08, 0.09], [0.19, 0.07], [0.44, G.drop]],
    heelL: [[0, 0], [0.08, 0], [0.19, 0.4], [0.44, 0]], pivL: [[0, 0], [0.19, 0.4], [0.44, 0]], kneeL: [[0, 0], [0.08, 0.12], [0.44, 0]],
    headZ: [[0, 0], [0.19, -0.08], [0.44, 0]],
  },
  upper: {
    R: [[0, G.R], [0.09, [-0.14, 1.16, 0.3]], [0.21, [-0.03, 1.45, 0.53], 'o'], [0.25, [-0.03, 1.46, 0.51]], [0.46, G.R]],
    L: [[0, G.L], [0.21, [0.08, 1.5, 0.25]], [0.46, G.L]],
    poleR: [[0, G.poleR], [0.09, [-0.3, -1, 0.1]], [0.21, [-0.15, -1, 0.7]], [0.46, G.poleR]],
    twR: [[0, 0], [0.09, -0.4], [0.21, -0.75], [0.46, 0]],
    hipYaw: [[0, G.hipYaw], [0.09, -0.58], [0.21, 0.05, 'o'], [0.46, G.hipYaw]], chestYaw: [[0, G.chestYaw], [0.09, -0.12], [0.21, 0.3, 'o'], [0.46, G.chestYaw]],
    drop: [[0, G.drop], [0.09, 0.15], [0.21, 0.02, 'o'], [0.46, G.drop]], lean: [[0, G.lean], [0.09, 0.3], [0.21, 0.02], [0.46, G.lean]],
    heelR: [[0, 0], [0.09, 0.1], [0.21, 0.5], [0.46, 0]], pivR: [[0, 0], [0.21, -0.3], [0.46, 0]], kneeR: [[0, 0], [0.09, 0.15], [0.21, 0], [0.46, 0]], kneeL: [[0, 0], [0.09, 0.18], [0.21, 0.04], [0.46, 0]],
  },
};
const BLOCK = { L: [0.075, 1.53, 0.2], R: [-0.075, 1.53, 0.19], poleL: [0.05, -1, 0.9], poleR: [-0.05, -1, 0.9], chin: 0.28, lean: 0.2, drop: 0.08 };
// reactions (victim): head / trunk offsets over time — dir = +1 turns the head to the victim's left
const REACT = {
  snap: { dur: 1.35 }, hook: { dur: 1.5 }, upper: { dur: 1.6 }, body: { dur: 1.55 }, block: { dur: 0.35 },
};
// where the hurt hand goes (arm raise, arm swing inward, elbow flex, wrist): tuned with tools/clutch-test.mjs so the palm
// lands ON the jaw / mouth / chin / ribs of the real rig instead of hovering beside the face
// p: wrist target in that bone's frame (metres at body scale 1; written for the hand named, struck from the right — a
// blow from the left mirrors x), pole: elbow direction, wr / wz: wrist bend, w: weight. The arm is solved by IK every
// frame (Character.solveArmIK), so the palm follows the head as it drops / turns and fits every body size.
export const CLUTCH = {
  snap: { R: { bone: 'head', p: [-0.02, -0.03, 0.18], pole: [-0.5, -1, -0.1], wr: 0.05 } }, // palm over the mouth
  hook: { R: { bone: 'head', p: [-0.15, 0.02, 0.1], pole: [-0.6, -1, -0.2], wr: 0.3, wz: -0.2 } }, // palm on the struck jaw
  upper: { R: { bone: 'head', p: [-0.035, -0.06, 0.19], pole: [-0.45, -1, -0.1], wr: 0.05 }, L: { bone: 'chest', p: [0.1, 0.02, 0.2], pole: [0.5, -1, -0.2], wr: 0, w: 0.6 } }, // hand cupping the chin, the other half up
  body: { L: { bone: 'chest', p: [0.195, 0, 0.085], pole: [0.5, -1, 0], wr: -0.25 }, R: { bone: 'spine', p: [-0.005, 0.12, 0.065], pole: [-0.5, -1, 0], wr: -0.33, w: 0.7 } }, // over the ribs / the stomach
};
export function reactDur(kind) { return (REACT[kind] || REACT.snap).dur; }

const _v = new THREE.Vector3(), _pole = new THREE.Vector3(), _inv = new THREE.Matrix4(), _hc = new THREE.Vector3(), _fw = new THREE.Vector3(), _lt = new THREE.Vector3(), _bw = new THREE.Vector3();
// high block: wrists placed from the HEAD (not fixed root-space points). The block leans the trunk, tucks the chin and turns
// the hips, which carries the head forward; fixed targets ended up inside the skull. Forearms stand upright in front of the
// face, fists at brow height, clear of the nose / forehead by a few centimetres for every build.
const BLOCK_HEAD = { fwd: 0.235, side: 0.08, up: -0.035 };
// every wrist target (guard, block, the non-punching hand while the body turns into a punch, hook / uppercut arcs) is kept
// outside the head grown by a fist + forearm margin; a target inside is pushed straight out of it.
const HEAD_R = [0.085, 0.115, 0.1], HAND_PAD = 0.1;
const _ax = new THREE.Vector3(), _ay = new THREE.Vector3(), _az = new THREE.Vector3(), _d = new THREE.Vector3();
function keepClear(v, hc, s) { _d.subVectors(v, hc); const x = _d.dot(_ax) / ((HEAD_R[0] + HAND_PAD) * s), y = _d.dot(_ay) / ((HEAD_R[1] + HAND_PAD) * s), z = _d.dot(_az) / ((HEAD_R[2] + HAND_PAD) * s);
  const e = Math.hypot(x, y, z); if (e >= 1) return; if (e < 1e-4) { v.addScaledVector(_az, (HEAD_R[2] + HAND_PAD) * s); return; } v.copy(hc).addScaledVector(_d, 1 / e); }
// first person (Player sets an.fp / fpYaw / fpPitch): the camera sits just in front of the face (Player.fpEyeLook), so a
// wrist target that is fine in third person (the rear hand at the chin, the lead hand coming back from a hook while the
// body leans in) puts the fist on — or through — the lens, and fingers inside the 7 cm near plane are cut open. Keep each
// wrist at least FP_CLEAR ahead of the eye along the view line wherever it is near the line of sight (fading out to the side).
const FP_CLEAR = 0.24, _fe = new THREE.Vector3(), _fl = new THREE.Vector3(), _fd = new THREE.Vector3();
function fpClear(an, b, v, s) {
  const yaw = an.fpYaw ?? an.ch.root.rotation.y, pitch = an.fpPitch || 0; _fe.setFromMatrixPosition(b.head.matrixWorld); _fe.x += Math.sin(yaw) * 0.1 * s; _fe.y += 0.075 * s; _fe.z += Math.cos(yaw) * 0.1 * s;
  _fl.set(Math.sin(yaw) * Math.cos(pitch), -Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)); _fd.subVectors(v, _fe); const f = _fd.dot(_fl), need = FP_CLEAR * s; if (f >= need) return;
  const perp = Math.sqrt(Math.max(0, _fd.lengthSq() - f * f)), k = 1 - sm((perp - 0.2 * s) / (0.16 * s)); if (k > 0) v.addScaledVector(_fl, (need - f) * k);
}
function legSolve(A, B, f, H) { // foot offset f (forward, hip-local) and drop H (hip joint → ankle): thigh angle (−fwd), knee flex
  const D = clamp(Math.hypot(f, H), 0.2, A + B - 1e-3); const alpha = Math.acos(clamp((A * A + D * D - B * B) / (2 * A * D), -1, 1));
  const kn = Math.PI - Math.acos(clamp((A * A + B * B - D * D) / (2 * A * B), -1, 1)); return [-(Math.atan2(f, H) + alpha), kn];
}

// called once per frame from Animator.update (after locomotion / actions, before the skirt / face / rig)
export function applyFight(an, dt, solveArmIK, seated) {
  const F = an.fight; if (!F) return; const b = an.ch.bones, s = an.s;
  F.w = clamp(F.w + (F.on && !seated ? dt * 7 : -dt * 3.2), 0, 1); F.blk = clamp(F.blk + (F.blockOn && F.w > 0.2 ? dt * 10 : -dt * 6), 0, 1);
  if (F.move) { F.mt += dt; if (F.mt >= MOVES[F.move].dur) { F.move = null; F.mt = 0; } }
  if (F.react) { F.rt += dt; if (F.rt >= reactDur(F.react)) F.react = null; }
  F.t = (F.t || 0) + dt;
  const w = sm(F.w); if (w > 0.001 && !seated) stance(an, F, b, s, w, solveArmIK);
  if (F.react && !seated) reaction(an, F, b, s, solveArmIK);
}

function stance(an, F, b, s, w, solveArmIK) {
  const C = F.move ? CURVES[F.move] : null, mt = F.mt; const get = (k) => (C && C[k] ? track(C[k], mt) : GUARD[k] ?? 0);
  const blk = F.move ? 0 : sm(F.blk); const legW = w * (1 - an.locoW * 0.85); const bob = Math.sin(F.t * 5.2 + an.seed * 6) * 0.012 * (1 - an.locoW);
  let hipYaw = get('hipYaw'), spineYaw = GUARD.spineYaw, chestYaw = get('chestYaw'), lean = get('lean'), drop = get('drop'), fwd = C && C.fwd ? track(C.fwd, mt) : 0, chin = GUARD.chin;
  if (blk > 0) { lean = lerp(lean, BLOCK.lean, blk); drop = lerp(drop, BLOCK.drop, blk); chin = lerp(chin, BLOCK.chin, blk); hipYaw = lerp(hipYaw, -0.25, blk); }
  hipYaw *= 1 - an.locoW * 0.5;
  // trunk
  const L = (bone, ax, v, k = w) => { bone.rotation[ax] = lerp(bone.rotation[ax], v, k); };
  L(b.hips, 'y', hipYaw); L(b.hips, 'x', 0, legW); L(b.hips, 'z', 0, legW);
  b.hips.position.y = lerp(b.hips.position.y, an.ch.hipY - (drop + bob) * s, legW); b.hips.position.z = lerp(b.hips.position.z, fwd * s, w); b.hips.position.x = lerp(b.hips.position.x, 0, legW);
  L(b.spine, 'y', spineYaw); L(b.spine, 'x', lean * 0.6); L(b.spine, 'z', 0); L(b.chest, 'y', chestYaw); L(b.chest, 'x', lean * 0.4); L(b.chest, 'z', 0);
  const trunk = hipYaw + spineYaw + chestYaw; const hz = C && C.headZ ? track(C.headZ, mt) : 0;
  L(b.neck, 'x', chin - lean * 0.55); L(b.neck, 'y', -trunk * 0.55); L(b.neck, 'z', hz); L(b.head, 'y', -trunk * 0.45); L(b.head, 'x', chin * 0.3 - lean * 0.25); L(b.head, 'z', 0);
  // legs: planted stance via two-bone solve (lead foot forward, rear foot back, slightly wide), heel pivots on the power shots
  if (legW > 0.001) {
    const A = an.a, B = an.b; const H = A + B - (drop + bob + 0.012) * s;
    const kL = C && C.kneeL ? track(C.kneeL, mt) : 0, kR = C && C.kneeR ? track(C.kneeR, mt) : 0;
    const heelL = C && C.heelL ? track(C.heelL, mt) : 0, heelR = C && C.heelR ? track(C.heelR, mt) : 0, pivL = C && C.pivL ? track(C.pivL, mt) : 0, pivR = C && C.pivR ? track(C.pivR, mt) : 0;
    /* a heel raise pivots on the ball of the foot: the ankle rises instead of the toes digging into the ground */
    const lift = (h) => (h > 0 ? (0.12 * Math.sin(h) + 0.085 * (1 - Math.cos(h))) * s : 0);
    const [thL, knL] = legSolve(A, B, (0.2 - fwd) * s, H - kL * 0.05 * s - lift(heelL)), [thR, knR] = legSolve(A, B, (-0.17 - fwd) * s, H - kR * 0.05 * s - lift(heelR));
    const hk = (bone, v) => { bone.rotation.x = lerp(bone.rotation.x, v, legW); };
    hk(b.thighL, thL); hk(b.shinL, knL); hk(b.footL, -(thL + knL) + heelL); hk(b.thighR, thR); hk(b.shinR, knR); hk(b.footR, -(thR + knR) + heelR);
    b.thighL.rotation.z = lerp(b.thighL.rotation.z, -0.07, legW); b.thighR.rotation.z = lerp(b.thighR.rotation.z, 0.07, legW);
    b.thighL.rotation.y = lerp(b.thighL.rotation.y, pivL, legW); b.thighR.rotation.y = lerp(b.thighR.rotation.y, pivR + 0.25, legW); // rear foot turned out ~15°
  }
  // arms: IK to root-space wrist targets, elbow poles, forearm twist (corkscrew) on the straight punches
  const root = an.ch.root; b.chest.updateWorldMatrix(true, false); _inv.copy(b.chest.matrixWorld).invert();
  const bobA = Math.sin(F.t * 2.6 + an.seed * 5) * 0.012;
  { b.head.updateWorldMatrix(true, false); const hm = b.head.matrixWorld; _hc.set(0, 0.08 * s, 0.02 * s).applyMatrix4(hm); _ax.set(1, 0, 0).transformDirection(hm); _ay.set(0, 1, 0).transformDirection(hm); _az.set(0, 0, 1).transformDirection(hm);
    _fw.copy(_az); _fw.y = 0; if (_fw.lengthSq() < 1e-6) _fw.set(0, 0, 1).transformDirection(root.matrixWorld); _fw.normalize(); _lt.set(_fw.z, 0, -_fw.x); }
  for (const S of ['L', 'R']) {
    let tg = get(S), pole = get('pole' + S); if (blk > 0) { tg = tg.map((v, i) => lerp(v, BLOCK[S][i], blk)); pole = pole.map((v, i) => lerp(v, BLOCK['pole' + S][i], blk)); }
    const moving = C && MOVES[F.move].side === S; const y = tg[1] + (moving ? 0 : bobA * (S === 'L' ? 1 : -1));
    _v.set(tg[0] * s, y * s, tg[2] * s); root.localToWorld(_v);
    if (blk > 0) { const H = BLOCK_HEAD; _bw.copy(_hc).addScaledVector(_fw, H.fwd * s).addScaledVector(_lt, (S === 'L' ? H.side : -H.side) * s); _bw.y += H.up * s; _v.lerp(_bw, blk); }
    keepClear(_v, _hc, s); if (an.fp) fpClear(an, b, _v, s); _v.applyMatrix4(_inv);
    solveArmIK(b, S, _v, null, w, _pole.set(pole[0], pole[1], pole[2]));
    const tw = C && C['tw' + S] ? track(C['tw' + S], mt) : 0; const hand = b['hand' + S];
    hand.rotation.x = lerp(hand.rotation.x, moving ? 0.05 : -0.25, w); hand.rotation.z = lerp(hand.rotation.z, 0, w); hand.rotation.y = lerp(hand.rotation.y, tw, w);
  }
}

const _cv = new THREE.Vector3(), _cp = new THREE.Vector3(), _ci = new THREE.Matrix4();
function reaction(an, F, b, s, solveArmIK) {
  const k = F.react, t = F.rt, d = F.rdir || 1, P = clamp(F.rpow ?? 1, 0.3, 1.6), dur = reactDur(k);
  // a real blow is a chain, not one offset: the head is hit first and whips on its own (the neck is a spring: it lags,
  // overshoots and rings out), the trunk follows ~40 ms later, the startle flares both arms for a moment, a heavy blow
  // buckles the knees (the hips drop and come back), and once the shock passes a hand goes up to where it hurts (jaw /
  // mouth / ribs) and comes down again while they recover. Fighters in a guard keep their hands up (no clutching).
  const env = (on, decay, lag = 0) => { const u = t - lag; if (u <= 0) return 0; return u < on ? easeOut(u / on) : Math.exp(-(u - on) * decay) * Math.cos((u - on) * 5.5); };
  const ring = (lag, decay, f) => { const u = t - lag; if (u <= 0) return 0; return Math.exp(-u * decay) * Math.sin(u * f); }; // spring whip (starts at 0, sharp)
  const hold = (a0, a1) => sm((t - a0) / 0.22) * (1 - sm((t - (dur - a1)) / a1)); // 0 → 1 → 0 over the reaction
  const guard = (F.w || 0) > 0.3; const heavy = clamp((P - 0.75) / 0.6, 0, 1);
  const flare = t < 0.35 ? Math.sin(Math.min(1, t / 0.35) * Math.PI) * (0.5 + 0.5 * P) : 0;
  if (!guard && k !== 'block') { b.armL.rotation.z += 0.28 * flare; b.armR.rotation.z -= 0.28 * flare; b.armL.rotation.x -= 0.22 * flare; b.armR.rotation.x -= 0.22 * flare; b.foreL.rotation.x -= 0.35 * flare; b.foreR.rotation.x -= 0.35 * flare; }
  if (k !== 'block' && heavy > 0) { // knees give: a short sag on both legs, then the legs catch the weight again
    const bk = (t < 0.12 ? easeOut(t / 0.12) : Math.exp(-(t - 0.12) * 3.2)) * heavy;
    b.thighL.rotation.x -= 0.22 * bk; b.thighR.rotation.x -= 0.18 * bk; b.shinL.rotation.x += 0.45 * bk; b.shinR.rotation.x += 0.38 * bk; b.footL.rotation.x -= 0.22 * bk; b.footR.rotation.x -= 0.18 * bk; b.hips.position.y -= 0.065 * s * bk; }
  const clutch = (side, c, w, flip = false) => { if (guard || w <= 0 || !c || !solveArmIK) return; w *= c.w ?? 1; const m = flip ? -1 : 1; const bn = b[c.bone];
    bn.updateWorldMatrix(true, false); _cv.set(c.p[0] * m * s, c.p[1] * s, c.p[2] * s).applyMatrix4(bn.matrixWorld); // wrist target, world
    b.chest.updateWorldMatrix(true, false); _ci.copy(b.chest.matrixWorld).invert(); _cv.applyMatrix4(_ci);
    solveArmIK(b, side, _cv, null, Math.min(1, w), _cp.set(c.pole[0] * m, c.pole[1], c.pole[2])); const hd = b['hand' + side]; hd.rotation.x += (c.wr || 0) * w; hd.rotation.z += (c.wz || 0) * m * w; };
  const C = CLUTCH[k] || {}; const sd = d > 0 ? 'R' : 'L'; // one-sided clutches: the hand on the struck side, mirrored for a blow from the left
  if (k === 'snap') { const e = env(0.06, 4.2) * P, e2 = env(0.08, 3.4, 0.04) * P, wh = ring(0.02, 6, 17) * P;
    b.neck.rotation.x -= 0.2 * e + 0.12 * wh; b.head.rotation.x -= 0.3 * e + 0.16 * wh; b.spine.rotation.x -= 0.16 * e2; b.chest.rotation.x -= 0.1 * e2; b.head.rotation.z += 0.08 * e * d; b.hips.position.z -= 0.05 * s * Math.max(0, e2);
    const h = hold(0.3, 0.55); b.head.rotation.x += 0.12 * h; b.neck.rotation.x += 0.08 * h; clutch(sd, C.R, h, d < 0); } // hand to the mouth, the head comes down to it
  else if (k === 'hook') { const e = env(0.07, 3.6) * P, e2 = env(0.09, 3.0, 0.045) * P, wh = ring(0.02, 5.5, 15) * P;
    b.neck.rotation.y += (0.3 * e + 0.14 * wh) * d; b.head.rotation.y += (0.34 * e + 0.2 * wh) * d; b.head.rotation.z += (0.22 * e + 0.1 * wh) * d; b.chest.rotation.y += 0.28 * e2 * d; b.spine.rotation.z += 0.12 * e2 * d; b.hips.position.y -= 0.03 * s * Math.max(0, e2);
    const h = hold(0.32, 0.6); b.head.rotation.z -= 0.1 * h * d; b.neck.rotation.y -= 0.12 * h * d; clutch(sd, C.R, h, d < 0); } // palm over the struck jaw
  else if (k === 'upper') { const e = env(0.08, 3.2) * P, e2 = env(0.1, 2.8, 0.05) * P, wh = ring(0.03, 5, 14) * P;
    b.neck.rotation.x -= 0.3 * e + 0.15 * wh; b.head.rotation.x -= 0.42 * e + 0.2 * wh; b.spine.rotation.x -= 0.22 * e2; b.chest.rotation.x -= 0.12 * e2; if (t < 0.25) { b.footL.rotation.x += 0.2 * Math.sin(t / 0.25 * Math.PI); b.footR.rotation.x += 0.2 * Math.sin(t / 0.25 * Math.PI); }
    const h = hold(0.38, 0.6); b.head.rotation.x += 0.18 * h; b.neck.rotation.x += 0.1 * h; clutch('R', C.R, h); clutch('L', C.L, h); } // both hands come up to the chin
  else if (k === 'body') { const e = (t < 0.1 ? easeOut(t / 0.1) : Math.exp(-(t - 0.1) * 2.4)) * P; b.spine.rotation.x += 0.42 * e; b.chest.rotation.x += 0.2 * e; b.neck.rotation.x += 0.15 * e; b.hips.position.z -= 0.05 * s * e; b.hips.position.y -= 0.04 * s * e;
    const h = hold(0.15, 0.6); b.spine.rotation.x += 0.12 * h; clutch('L', C.L, h); clutch('R', C.R, h); } // doubled over, arms wrapped over the ribs
  else if (k === 'block') { const e = env(0.05, 6) * P; b.spine.rotation.x -= 0.1 * e; b.chest.rotation.y += 0.08 * e * d; b.hips.position.z -= 0.03 * s * Math.max(0, e); }
}

// ---- Animator helpers (state lives on anim.fight)
export function fightState(an) { return an.fight || (an.fight = { w: 0, on: false, move: null, mt: 0, react: null, rt: 0, rdir: 1, rpow: 1, blk: 0, blockOn: false, t: Math.random() * 10 }); }
export function moveRemaining(an) { const F = an.fight; return F && F.move ? MOVES[F.move].dur - F.mt : 0; }
