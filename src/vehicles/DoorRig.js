// Runtime side of the car doors (VehicleModels builds them).
// Shut doors cost nothing extra: their geometry is baked into the body meshes (one draw call per material, as before).
// The moment a door moves it goes "live": the body meshes of that vehicle switch to a view of the shared geometry that
// skips the door's triangles (geometry groups over the same buffers — nothing is copied), and the door's own meshes on
// its hinge pivot appear. Once it is shut again it is folded back into the body. Hinged doors swing about the front
// edge; the van's sliding door steps out 15 cm (clear of its own shell depth) and runs back along the body side.
import * as THREE from 'three';

// pose a door from its normalised opening d.ang (0 shut .. 1 open)
export function poseDoor(d) {
  const k = Math.max(0, d.ang || 0);
  if (d.slide) { const out = Math.min(1, k / 0.18), back = Math.max(0, (k - 0.12) / 0.88); d.pivot.position.set(d.hx + d.side * 0.15 * out, 0, d.hz - (d.len + 0.05) * back); d.pivot.rotation.y = 0; return; }
  d.pivot.rotation.y = d.max * k * (d.side < 0 ? 1 : -1);
}
const isOpen = (d) => (d.slide ? (d.ang || 0) > 1e-4 : Math.abs(d.pivot.rotation.y) > 1e-5 || (d.ang || 0) > 1e-4);
// per frame (Vehicle LOD pass): fold shut doors into the body, bring moving ones out
export function syncDoors(ud) {
  const D = ud.doors; if (!D || !D.length) return;
  for (const d of D) { if (d.slide) poseDoor(d); const o = isOpen(d); if (o !== d.live) setDoorLive(ud, d, o); }
}
export function setDoorLive(ud, d, on) {
  d.live = on; const B = ud.bake; if (!B) return;
  if (on && !d.pivot.children.length) for (const [name, geo] of B.pivotGeos(d.i)) { const m = new THREE.Mesh(geo, B.mats[name]); m.name = name; m.castShadow = name === 'paint'; m.receiveShadow = name === 'paint'; if (name === 'glass') m.renderOrder = 2; d.pivot.add(m); }
  d.pivot.visible = on; const hidden = new Set(ud.doors.filter((x) => x.live).map((x) => x.i));
  for (const name in B.ranges) {
    const R = B.ranges[name], mesh = B.meshes[name]; if (!mesh || !R.doors.some((r) => r.door === d.i)) continue;
    if (!R.doors.some((r) => hidden.has(r.door))) { mesh.geometry = B.shared[name]; mesh.material = B.mats[name]; continue; }
    let view = mesh.userData.view; const src = B.shared[name];
    if (!view) { view = new THREE.BufferGeometry(); for (const k in src.attributes) view.setAttribute(k, src.attributes[k]); view.setIndex(src.index); view.boundingSphere = src.boundingSphere; view.boundingBox = src.boundingBox; mesh.userData.view = view; } // shares the buffers: never dispose it
    view.clearGroups(); const iv = [[0, R.body], ...R.doors.filter((r) => !hidden.has(r.door)).map((r) => [r.i0, r.i1])].filter(([a, b]) => b > a);
    const merged = []; for (const [a, b] of iv) { const l = merged[merged.length - 1]; if (l && l[1] === a) l[1] = b; else merged.push([a, b]); }
    for (const [a, b] of merged) view.addGroup(a, b - a, 0);
    mesh.geometry = view; mesh.material = [B.mats[name]];
  }
}
// tests / tools: bring every door out (their meshes on the pivots), or fold them all back
export function allDoorsLive(ud, on = true) { for (const d of ud.doors || []) setDoorLive(ud, d, on); }
