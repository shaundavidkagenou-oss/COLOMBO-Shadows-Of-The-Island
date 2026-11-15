// Shoulder pocket per body (49th request: "Shashika's gun goes through his shoulder").
// The long-gun hold poses (player weapons, Weapons.js; police / trailer rifle rig, Firefight.js) seat the butt of the stock
// at a fixed right-shoulder pocket in body space at the chest. That point was tuned on an average build in a shirt; on a
// broad chest under a tactical vest (Shashika: build 1.18 + plate carrier) the torso stands several cm further forward
// there, so the stock disappeared into the vest and shoulder (and on every build the butt sat 2–5 cm inside the chest).
//
// Shouldered, the weapon is rigid in chest space (both hold rigs parent it to the chest bone and the aim pitch / stance
// twist rotate the chest itself), so the torso surface the stock meets can be measured once per body from the bind pose:
// every torso-skinned vertex is taken into that frame (chest-bone local, stance twist undone) and the pocket is moved
// forward until no torso vertex lies inside the stock's cross-section behind the butt. Outfit changes rebuild the body
// geometry → re-measured. The arm side is handled by the hold itself (protracted firing shoulder + elbow out, see
// Character.update / Firefight.elbowPole), so only chest / spine / neck vertices count here.
import * as THREE from 'three';

export const POCKET = new THREE.Vector3(-0.11, 0.1, 0.07); // reference pocket, body space (character faces +z, its right side is −x)
export const STANCE_TWIST = 0.5; // long-gun bladed stance (Animator aim.twist): body space = RotY(−twist) · chest space
// stock cross-section: the butt plate is ~4–5 cm wide; its height range comes from the weapon itself (stockSpan)
const HALF_W = 0.025, DEPTH = 0.16, COMPRESS = 0.004 /* cloth pressed by the butt */, MAX_DZ = 0.12;
const Y0 = -0.14, NB = 28, BIN = 0.01; // need profile: 1 cm height bins from 14 cm below to 14 cm above the pocket
// candidate pockets further out towards the shoulder joint (m, −x = the body's right): over a vest / broad pectoral the
// surface falls away towards the deltoid, so a slightly wider pocket needs less forward travel (and keeps the grip in reach)
const DXS = [0, -0.01, -0.02, -0.03], DX_COST = 0.6;
const TORSO = /^(chest|spine|neck)$/;
const _inv = new THREE.Matrix4(), _tw = new THREE.Matrix4(), _v = new THREE.Vector3(), _bb = new THREE.Box3();

// per height bin: how far forward of the pocket the torso surface stands inside the stock's width (m)
function measure(ch) {
  const chest = ch.bones && ch.bones.chest; const prof = DXS.map(() => new Float32Array(NB)); if (!chest) return prof;
  _tw.makeRotationY(-STANCE_TWIST);
  ch.root.traverse((m) => {
    if (!m.isSkinnedMesh || !m.visible || !m.skeleton) return; const sk = m.skeleton; const ci = sk.bones.indexOf(chest); if (ci < 0) return;
    // bind-space vertex → chest-bone local (boneInverses = inverse bind world of the bone; bindMatrix maps mesh → bind world)
    _inv.multiplyMatrices(sk.boneInverses[ci], m.bindMatrix); _inv.premultiply(_tw);
    const g = m.geometry, P = g.attributes.position, SI = g.attributes.skinIndex, SW = g.attributes.skinWeight; if (!P || !SI || !SW) return;
    for (let i = 0; i < P.count; i++) {
      let bb = 0, bw = -1; for (let c = 0; c < 4; c++) { const w = SW.getComponent(i, c); if (w > bw) { bw = w; bb = SI.getComponent(i, c); } }
      const b = sk.bones[bb]; if (!b || !TORSO.test(b.name)) continue;
      _v.fromBufferAttribute(P, i).applyMatrix4(_inv); const dx = _v.x - POCKET.x, dy = _v.y - POCKET.y, dz = _v.z - POCKET.z;
      if (dz < -0.02 || dz > DEPTH) continue; const k = Math.floor((dy - Y0) / BIN); if (k < 0 || k >= NB) continue;
      for (let j = 0; j < DXS.length; j++) if (Math.abs(dx - DXS[j]) <= HALF_W && dz > prof[j][k]) prof[j][k] = dz;
    }
  });
  return prof;
}
function key(ch) { let k = ''; ch.root.traverse((m) => { if (m.isSkinnedMesh && m.visible) k += m.geometry.uuid; }); return k; }
function profile(ch) {
  const t = (ch._pocketT = (ch._pocketT || 0) + 1);
  if (!ch._pocketProf || t % 60 === 1) { const k = key(ch); if (ch._pocketKey !== k) { ch._pocketKey = k; ch._pocketProf = measure(ch); } }
  return ch._pocketProf;
}
// height span of the weapon's butt end relative to the pocket line (the hold puts grip-origin y at pocket.y − support.y)
export function stockSpan(m) {
  const ud = m.userData; if (ud._stockSpan) return ud._stockSpan; m.updateMatrixWorld(true); const inv = new THREE.Matrix4().copy(m.matrixWorld).invert(); _bb.makeEmpty();
  m.traverse((q) => { if (!q.isMesh || !q.geometry || !q.geometry.attributes.position) return; const P = q.geometry.attributes.position; const M = new THREE.Matrix4().multiplyMatrices(inv, q.matrixWorld);
    for (let i = 0; i < P.count; i++) { _v.fromBufferAttribute(P, i).applyMatrix4(M); if (_v.z < ud.buttZ + DEPTH) _bb.expandByPoint(_v); } });
  const sy = ud.support ? ud.support.y : 0; return (ud._stockSpan = _bb.isEmpty() ? [-0.09, 0.05] : [_bb.min.y - sy, _bb.max.y - sy]);
}
// forward offset (m) of this body's shoulder pocket for a stock spanning [lo, hi] (m, relative to the pocket height)
// returns [dx, dz]: the cheapest candidate (forward travel + DX_COST × sideways shift)
export function pocketOffset(ch, span = [-0.09, 0.05]) {
  if (!ch || !ch.root) return [0, 0]; const P = profile(ch); const a = Math.max(0, Math.floor((span[0] - Y0) / BIN)), b = Math.min(NB - 1, Math.floor((span[1] - Y0) / BIN));
  let best = null, bc = 1e9; for (let j = 0; j < DXS.length; j++) { let need = 0; for (let k = a; k <= b; k++) if (P[j][k] > need) need = P[j][k]; const dz = Math.min(MAX_DZ, Math.max(0, need - COMPRESS)); const c = dz - DX_COST * DXS[j]; if (c < bc - 1e-4) { bc = c; best = [DXS[j], dz]; } }
  ch._pocketDz = best[1]; return best;
}
export function pocketDz(ch, span) { return pocketOffset(ch, span)[1]; }
// the pocket for this body and weapon model (written into out)
export function pocketFor(ch, model, out = new THREE.Vector3()) { const o = pocketOffset(ch, model ? stockSpan(model) : undefined); out.copy(POCKET); out.x += o[0]; out.z += o[1]; return out; }
// firing-shoulder protraction (rad) that keeps the grip in reach when the pocket had to move forward
// support shoulder: the forend moved forward with the pocket, so the left clavicle reaches forward by the same distance (≈ 0.15 m/rad)
export function protractLFor(ch) { return Math.min(0.5, (ch && ch._pocketDz || 0) * 7); }
export function protractFor(ch) { return 0.3 + Math.min(0.3, Math.max(0, (ch && ch._pocketDz || 0) - 0.03) * 6); }
// firing-arm elbow direction (arm parent space) for IK: the default pole (down, a little out) ran the forearm along the
// stock; a shouldered long gun is held with the elbow out to the side
export function elbowPole(k, out = new THREE.Vector3()) { return out.set(-0.45 - 0.55 * k, -1 + 0.3 * k, -0.15 + 0.05 * k); }
