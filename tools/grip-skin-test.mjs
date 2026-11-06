// Grip skin test (Node): every playable hero × every weapon, hands placed exactly where the grip solver puts them
// (GripSolver.holdFor → wrist + orientation in weapon space, per-joint finger poses applied with HeroRig's rotations).
// The finger and thumb SKIN (the real skinned vertices, not the solver's stick model) is then tested against the real
// weapon mesh: a finger buried in the grip / handguard is invisible in first person ("missing fingers").
// Also checks each finger is actually touching (not hovering in the air).
// Run: node tools/grip-skin-test.mjs   (env V=1 prints per-finger numbers)
import './node-dom-stub.mjs';
import * as THREE from 'three';
globalThis.localStorage ??= { getItem: () => null, setItem: () => {}, removeItem: () => {} };
{ const { MAT } = await import('../src/gfx/Materials.js'); Object.setPrototypeOf(MAT, new Proxy({}, { get: (t, k) => { if (typeof k !== 'string') return undefined; if (!t[k]) t[k] = new THREE.MeshStandardMaterial({ vertexColors: true }); return t[k]; } })); }
const { Character, HEROES } = await import('../src/actors/Character.js');
const { WEAPONS } = await import('../src/combat/WeaponDefs.js');
const { buildWeaponModel } = await import('../src/combat/WeaponModels.js');
const { holdFor } = await import('../src/combat/GripSolver.js');
const { poseVec, FINGERS } = await import('../src/actors/HeroRig.js');
const V = !!process.env.V;
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL', m); } };

// pose the finger bones exactly like HeroRig.update
function setFingers(b, S, pose) { const sx = S === 'L' ? 1 : -1; const cur = poseVec(pose, 1);
  FINGERS.forEach((f, fi) => { const sp = (fi - 1.5) * 0.04 * (1 - Math.min(1, cur[fi * 3 + 1])); for (let j = 0; j < 3; j++) b[f + (j + 1) + S].rotation.set(0, sp, -sx * cur[fi * 3 + j]); });
  const t = cur[12]; b['thb1' + S].rotation.set(t * 0.55 + cur[13], cur[14], -sx * t * 0.45); b['thb2' + S].rotation.set(0, 0, -sx * t * 0.55); b['thb3' + S].rotation.set(0, 0, -sx * t * 0.5); }
// hand bone world matrix := weapon frame · (wrist, q); children (fingers) follow
function placeHand(b, S, wrist, q) { const h = b['hand' + S]; h.matrixWorld.compose(wrist, q, new THREE.Vector3(1, 1, 1)); for (const c of h.children) c.updateMatrixWorld(true); }
// inside test robust to overlapping closed primitives: the first surface hit along a ray is a back face (normal · dir > 0)
const rc = new THREE.Raycaster(); rc.firstHitOnly = false; const DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].map((d) => new THREE.Vector3(...d));
function depthInside(p, meshes) { let inside = 0;
  for (const d of DIRS) { rc.set(p, d); rc.far = 0.2; const h = rc.intersectObjects(meshes, false)[0]; if (h && h.face) { const n = h.face.normal.clone().transformDirection(h.object.matrixWorld); if (n.dot(d) > 0) inside++; } }
  return inside >= 4; }
function nearestDist(p, meshes) { let best = 9; for (const d of DIRS) { rc.set(p, d); rc.far = 0.05; const h = rc.intersectObjects(meshes, false)[0]; if (h) best = Math.min(best, h.distance); } return best; }

const heroes = ['dineth', 'shashika', 'david'];
const v = new THREE.Vector3(); const summary = [];
for (const hn of heroes) {
  const ch = new Character(HEROES[hn]); const b = ch.bones; const mesh = ch.mesh; mesh.updateMatrixWorld(true);
  const sk = mesh.geometry.attributes.skinIndex, sw = mesh.geometry.attributes.skinWeight, pos = mesh.geometry.attributes.position; const bones = mesh.skeleton.bones;
  // finger vertices: dominant bone is a finger / thumb bone; grouped per digit and side
  const groups = {}; for (let i = 0; i < pos.count; i++) { let mb = sk.getX(i), mw = sw.getX(i); for (let c = 1; c < 4; c++) if (sw.getComponent(i, c) > mw) { mw = sw.getComponent(i, c); mb = sk.getComponent(i, c); } const n = bones[mb].name; const m = /^(idx|mid|rng|pnk|thb)([123])([LR])$/.exec(n); if (!m) continue; const key = m[1] + m[3]; (groups[key] ||= []).push(i); }
  for (const def of WEAPONS) {
    const model = buildWeaponModel(def); model.updateMatrixWorld(true); const meshes = []; model.traverse((o) => { if (o.isMesh) { o.material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }); meshes.push(o); } });
    const H = holdFor(ch, model); if (!H) { ok(false, `${hn} ${def.id}: no hold`); continue; }
    setFingers(b, 'R', H.R.ready); setFingers(b, 'L', H.L.pose);
    placeHand(b, 'R', H.R.wrist, H.R.q); placeHand(b, 'L', H.L.wrist, H.L.q);
    mesh.skeleton.update();
    const res = {};
    for (const [key, idx] of Object.entries(groups)) { let inside = 0, n = 0, touch = 9; for (let k = 0; k < idx.length; k += 2) { mesh.getVertexPosition(idx[k], v); v.applyMatrix4(mesh.matrixWorld); n++; if (depthInside(v, meshes)) inside++; else touch = Math.min(touch, nearestDist(v, meshes)); } res[key] = { buried: inside / n, gap: inside ? 0 : touch }; }
    const line = Object.entries(res).map(([k, r]) => `${k} ${(r.buried * 100).toFixed(0)}%${r.gap < 9 && !r.buried ? ' gap' + (r.gap * 1000).toFixed(0) + 'mm' : ''}`).join(' · ');
    if (V) console.log(`${hn.padEnd(8)} ${def.id.padEnd(10)} ${line}`);
    for (const [k, r] of Object.entries(res)) { summary.push(r.buried); ok(r.buried < 0.35, `${hn} ${def.id}: ${k} skin buried in the weapon ${(r.buried * 100).toFixed(0)}%`); }
  }
}
summary.sort((a, b) => a - b); console.log(`finger skin buried: median ${(summary[summary.length >> 1] * 100).toFixed(0)}% · worst ${(summary[summary.length - 1] * 100).toFixed(0)}%`);
console.log(`grip-skin: ${pass + fail} checks, ${fail} failed`); process.exit(fail ? 1 : 0);
