// FPS: people and vehicles that cannot be seen are not re-posed or re-transformed every frame.
//
// Profiled (tools/perf-sim.mjs high, CPU profile): Object3D.updateMatrixWorld was the single largest per-frame cost — 21 % of all
// CPU time — walking ~8,800 nodes (≈23 bones and the clothing/hair of each of 170 pedestrians, ≈58 nodes per vehicle), and three.js
// walked the whole graph again for each extra render of a frame (the water reflection). About two thirds of those people and cars
// are behind or beside the camera at any moment.
//
// A person or vehicle counts as out of view only when it is outside the camera's horizontal field of view plus a 20° turning
// margin AND farther from the edge of that view than the longest shadow the sun (or, at night, a lamp) can currently throw — so
// nothing that is on screen, or whose shadow is, is affected. Those are posed every 4th frame instead of every frame
// (Crowd.js), and on the other frames their subtree is skipped in the frame's single matrix pass. The frame's matrix pass runs
// once, before the main render; the water-reflection render and the composer reuse it (scene.matrixWorldAutoUpdate is off only
// around them). Explicit updateMatrixWorld()/updateWorldMatrix() calls made by game code (headlight aiming, IK, blood, muzzle
// flashes, ragdolls) are never held: the hold applies only inside that one pass, and only for the frame it was set in.
import * as THREE from 'three';

const UMW = THREE.Object3D.prototype.updateMatrixWorld;
export const HOLD = { on: false, frame: 1 };
function heldUMW(force) { if (HOLD.on && this._heldF === HOLD.frame) return; UMW.call(this, force); }
// make an object (a person's root, a vehicle body) skippable by the frame pass
export function holdable(o) { if (o && o.updateMatrixWorld !== heldUMW) o.updateMatrixWorld = heldUMW; }
// skip this object's subtree in this frame's matrix pass (expires by itself next frame)
export function holdThisFrame(o) { if (o) { holdable(o); o._heldF = HOLD.frame; } }
// the frame's one matrix pass
export function updateSceneMatrices(scene) { HOLD.on = true; try { scene.updateMatrixWorld(); } finally { HOLD.on = false; HOLD.frame++; } }
// render(s) that reuse the pass above instead of walking the graph again
export function withMatricesDone(scene, fn) { const a = scene.matrixWorldAutoUpdate; scene.matrixWorldAutoUpdate = false; try { fn(); } finally { scene.matrixWorldAutoUpdate = a; } }

export const VIEW = { ok: false, x: 0, z: 0, fx: 0, fz: 1, edge: Math.PI, reach: 30 };
const _d = new THREE.Vector3();
// camera (last frame's: the 20° margin covers a turn within one frame), sun light (shadow length), night (lamps throw long shadows)
export function setView(camera, sun, night) {
  if (!camera) { VIEW.ok = false; return; }
  camera.getWorldDirection(_d); const h = Math.hypot(_d.x, _d.z);
  if (h < 0.8) { VIEW.ok = false; return; } // looking steeply up or down: the view covers every direction around the camera
  const hf = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov || 60) / 2 / (camera.zoom || 1)) * (camera.aspect || 1.78));
  VIEW.edge = hf / 2 + THREE.MathUtils.degToRad(20); if (VIEW.edge >= Math.PI * 0.95) { VIEW.ok = false; return; }
  VIEW.x = camera.position.x; VIEW.z = camera.position.z; VIEW.fx = _d.x / h; VIEW.fz = _d.z / h;
  let reach = 30;
  if (sun && !(night > 0.25)) { _d.copy(sun.position).sub(sun.target.position).normalize(); const el = Math.max(Math.asin(Math.min(1, Math.max(-1, _d.y))), THREE.MathUtils.degToRad(4)); reach = Math.min(30, 2.4 / Math.tan(el)); }
  VIEW.reach = reach; VIEW.ok = true;
}
// out of view (with margins) for something of radius r at (x, z)
export function offView(x, z, r = 1) {
  if (!VIEW.ok) return false;
  const dx = x - VIEW.x, dz = z - VIEW.z, d = Math.hypot(dx, dz); const need = r + VIEW.reach + 2;
  if (d < need) return false;
  const a = Math.acos(Math.max(-1, Math.min(1, (dx * VIEW.fx + dz * VIEW.fz) / d))); const gap = a - VIEW.edge;
  if (gap <= 0) return false;
  return (gap >= Math.PI / 2 ? d : d * Math.sin(gap)) > need;
}
// vehicles: held 3 frames in 4 while out of view, unless a real headlight beam, its painted light pool or the player is on it
export function holdVehicles(list, playerVehicle) {
  if (!VIEW.ok || !list) return 0; let n = 0;
  for (const v of list) {
    if (!v || !v.mesh || v === playerVehicle) continue;
    const ud = v.mesh.userData; if (ud.realBeam || (ud.headPool && ud.headPool.visible)) continue;
    if (((HOLD.frame + (v.id | 0)) & 3) === 0) continue; // its turn to catch up
    if (!offView(v.x, v.z, (v.half || 2.5) + 1)) continue;
    holdThisFrame(v.mesh); n++;
  }
  return n;
}
// end of the frame's updates: the view from the camera as it will be drawn. If it jumped since the marks of this frame were made
// (a cutscene cut, a teleport, a fast turn beyond the margin), this frame's holds are dropped so nothing is drawn stale.
const COS15 = Math.cos(THREE.MathUtils.degToRad(15));
export function refreshView(camera, sun, night) {
  const ok = VIEW.ok, x = VIEW.x, z = VIEW.z, fx = VIEW.fx, fz = VIEW.fz;
  setView(camera, sun, night);
  if (ok && (!VIEW.ok || Math.hypot(VIEW.x - x, VIEW.z - z) > 4 || VIEW.fx * fx + VIEW.fz * fz < COS15)) HOLD.frame++;
}
