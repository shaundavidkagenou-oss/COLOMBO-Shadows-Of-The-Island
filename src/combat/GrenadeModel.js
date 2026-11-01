// Fragmentation hand grenade — original procedural model (generic design, no markings copied from any real product).
// Origin = centre of the body. Parts are separate meshes so the throw can animate them for real:
//   userData.spoon  the curved safety lever along the side (flies off when the grenade leaves the hand)
//   userData.pin    the split pin + pull ring (pulled out by the off hand before the throw)
// Overall ~0.11 m tall, body Ø 0.064 m (a real hand grenade's size).
import * as THREE from 'three';

let MATS = null;
function mats() {
  if (MATS) return MATS;
  // olive-drab painted steel with a faint cast texture (procedural canvas), dark phosphated fuze, bright steel pin/ring
  const cv = document.createElement('canvas'); cv.width = cv.height = 64; const a = cv.getContext('2d');
  a.fillStyle = '#4a5233'; a.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 900; i++) { const v = Math.random(); a.fillStyle = v < 0.5 ? `rgba(30,34,20,${0.08 + v * 0.1})` : `rgba(120,128,90,${(v - 0.5) * 0.12})`; a.fillRect(Math.random() * 64, Math.random() * 64, 1 + Math.random() * 2, 1); }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  MATS = {
    body: new THREE.MeshStandardMaterial({ color: 0xffffff, map: t, roughness: 0.62, metalness: 0.25 }),
    band: new THREE.MeshStandardMaterial({ color: 0xc9a63a, roughness: 0.5, metalness: 0.2 }), // yellow filler band = high-explosive marking
    fuze: new THREE.MeshStandardMaterial({ color: 0x2c2e2a, roughness: 0.45, metalness: 0.7 }),
    spoon: new THREE.MeshStandardMaterial({ color: 0x3f4530, roughness: 0.55, metalness: 0.45 }),
    steel: new THREE.MeshStandardMaterial({ color: 0xc8ccd0, roughness: 0.28, metalness: 0.95 }),
  };
  return MATS;
}

export function buildGrenadeModel() {
  const M = mats(); const g = new THREE.Group(); g.name = 'grenade';
  // body: lathe profile, egg-shaped (fuller at the bottom), radius 0.032
  const prof = []; const N = 18;
  for (let i = 0; i <= N; i++) { const t = i / N; const ang = -Math.PI / 2 + t * Math.PI; const r = Math.cos(ang) * 0.032 * (1 - 0.06 * t); const y = Math.sin(ang) * (t < 0.5 ? 0.034 : 0.031); prof.push(new THREE.Vector2(Math.max(0.0005, r), y)); }
  prof[prof.length - 1].x = 0.0105; // opening for the fuze well
  const body = new THREE.Mesh(new THREE.LatheGeometry(prof, 22), M.body); body.castShadow = true; g.add(body);
  // the yellow marking band and a faint seam where the two halves are joined
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.0318, 0.0022, 6, 28), M.band); band.rotation.x = Math.PI / 2; band.position.y = 0.006; g.add(band);
  // fuze: threaded well, fuze body, striker housing (the lever pivots on it)
  const well = new THREE.Mesh(new THREE.CylinderGeometry(0.0118, 0.0128, 0.012, 14), M.fuze); well.position.y = 0.034; g.add(well);
  const fz = new THREE.Mesh(new THREE.CylinderGeometry(0.0095, 0.0105, 0.022, 14), M.fuze); fz.position.y = 0.049; g.add(fz);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.0096, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), M.fuze); cap.position.y = 0.06; g.add(cap);
  const hinge = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.012, 0.024), M.fuze); hinge.position.set(0.012, 0.052, 0); g.add(hinge);
  // safety lever ("spoon"): a curved strip from the fuze head down the +x side of the body
  const spoon = new THREE.Group(); spoon.name = 'spoon'; spoon.position.set(0.012, 0.058, 0);
  { const pts = []; for (let i = 0; i <= 10; i++) { const t = i / 10; const a = t * 1.35; pts.push(new THREE.Vector3(0.004 + Math.sin(a) * 0.03, -Math.sin(a * 0.95) * 0.002 - t * 0.072, 0)); }
    const curve = new THREE.CatmullRomCurve3(pts); const geo = new THREE.TubeGeometry(curve, 14, 0.0035, 4, false); geo.scale(1, 1, 3.2); // flattened tube = a pressed-steel strip
    const m = new THREE.Mesh(geo, M.spoon); m.castShadow = true; spoon.add(m);
    const lip = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.004, 0.016), M.spoon); lip.position.set(0.003, 0.002, 0); spoon.add(lip); }
  g.add(spoon);
  // safety pin through the striker housing, with its pull ring hanging on the −x side
  const pin = new THREE.Group(); pin.name = 'pin'; pin.position.set(0.006, 0.052, 0);
  { const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.0012, 0.0012, 0.03, 6), M.steel); shaft.rotation.x = Math.PI / 2; pin.add(shaft);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.0115, 0.0014, 6, 22), M.steel); ring.position.set(-0.004, -0.004, 0.026); ring.rotation.set(0.25, 0.9, 0); pin.add(ring); }
  g.add(pin);
  g.userData.spoon = spoon; g.userData.pin = pin; g.userData.radius = 0.034;
  return g;
}
