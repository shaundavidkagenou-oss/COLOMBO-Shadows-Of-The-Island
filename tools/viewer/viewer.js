// Dev tool: renders one vehicle model from four angles (rider view, left, right 3/4 front, rear 3/4) under a daylight sky
// environment, so model work can be checked in seconds without loading the whole city.
//   /index.html?type=soraki_rr1000&seed=1&w=1280&h=720
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { createVehicleMesh, VTYPES } from '../../src/vehicles/VehicleModels.js';
import { setVehicleLOD, setRealLevel } from '../../src/vehicles/Vehicle.js';
import { allDoorsLive } from '../../src/vehicles/DoorRig.js';
import { preloadRealModels } from '../../src/vehicles/RealModels.js';
import { modelFloor } from '../../src/world/FloorKit.js';
import { buildT56, buildWeaponModel } from '../../src/combat/WeaponModels.js';
import { WEAPONS } from '../../src/combat/WeaponDefs.js';
import { Character, randomSpec } from '../../src/actors/Character.js';
import { applySeatPose, seatLocal } from '../../src/actors/Seating.js';

const q = new URLSearchParams(location.search); const type = q.get('type') || 'soraki_rr1000', seed = +(q.get('seed') || 1);
const W = +(q.get('w') || 1280), H = +(q.get('h') || 720);
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); renderer.setSize(W, H); renderer.setPixelRatio(1);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.shadowMap.enabled = true; renderer.setScissorTest(true);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0xa9bccb);
const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.9;
scene.add(new THREE.HemisphereLight(0xdfe8f0, 0x6a6258, 0.8));
const sun = new THREE.DirectionalLight(0xfff2e0, 2.6); sun.position.set(4, 7, 3); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3 }); scene.add(sun);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshStandardMaterial({ color: 0x77777a, roughness: 0.95 })); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
const floors = q.get('floors'); // floor preview: &floors=redoxide,ceramic,terrazzo,wood — each a 2.4 m patch seen low, under raking light
if (floors) { ground.visible = false; const ks = floors.split(','); const cw = Math.ceil(Math.sqrt(ks.length)), rw = Math.ceil(ks.length / cw), fw = Math.floor(W / cw), fh = Math.floor(H / rw);
  const fc = new THREE.PerspectiveCamera(45, fw / fh, 0.02, 50); sun.position.set(-3, 2.2, -2);
  ks.forEach((k, i) => { const f = modelFloor({ kind: k, seed: 4 + i }, -1.2, -1.2, 1.2, 1.2, 0); f.position.x = i * 10; scene.add(f); f.traverse((o) => { if (o.isMesh) o.receiveShadow = true; });
    const chair = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.45, 0.4), new THREE.MeshStandardMaterial({ color: 0x8a5a34, roughness: 0.6 })); chair.position.set(i * 10 + 0.5, 0.225, -0.3); chair.castShadow = true; scene.add(chair);
    sun.target.position.set(i * 10, 0, 0); sun.position.set(i * 10 - 3, 2.2, -2); sun.target.updateMatrixWorld(); sun.shadow.camera.updateProjectionMatrix();
    fc.position.set(i * 10 - 0.2, 0.7, 1.15); fc.lookAt(i * 10 + 0.1, 0, -0.3); const x = (i % cw) * fw, y = H - (Math.floor(i / cw) + 1) * fh; renderer.setViewport(x, y, fw, fh); renderer.setScissor(x, y, fw, fh); renderer.render(scene, fc); });
  window.__ready = true; throw new Error('floor preview done'); }
const wpn = q.get('weapon'); // weapon preview: &weapon=t56|<weapon id>&views=left,right,front34,rear34,muzzle,grip,top
if (wpn) { ground.visible = false; scene.background = new THREE.Color(0x8d9aa6);
  const w = wpn === 't56' ? buildT56() : buildWeaponModel(WEAPONS.find((d) => d.id === wpn)); scene.add(w); w.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  const bb = new THREE.Box3().setFromObject(w), c = bb.getCenter(new THREE.Vector3()), L = bb.max.z - bb.min.z;
  const WC = { left: [[L * 1.05, 0.02, c.z], c], right: [[-L * 1.05, 0.02, c.z], c], front34: [[-L * 0.6, L * 0.25, c.z + L * 0.75], c], rear34: [[L * 0.55, L * 0.22, c.z - L * 0.75], c],
    top: [[0.25, L * 1.1, c.z], c], muzzle: [[0.16, 0.12, bb.max.z + 0.1], new THREE.Vector3(0, 0.08, bb.max.z - 0.12)], grip: [[0.32, 0.02, 0.0], new THREE.Vector3(0, 0.0, 0.0)],
    stock: [[0.3, 0.06, bb.min.z + 0.1], new THREE.Vector3(0, 0.0, bb.min.z + 0.14)], mag: [[-0.3, -0.06, 0.12], new THREE.Vector3(0, -0.06, 0.12)] };
  const vs = (q.get('views') || 'left,right,front34,rear34').split(','); const cl = vs.length > 1 ? 2 : 1, rw = Math.ceil(vs.length / cl), vw = Math.floor(W / cl), vh = Math.floor(H / rw);
  const cam = new THREE.PerspectiveCamera(36, vw / vh, 0.01, 20);
  vs.forEach((v, i) => { const [p, t] = WC[v] || WC.left; cam.position.set(...p); cam.lookAt(t); cam.updateProjectionMatrix(); const x = (i % cl) * vw, y = H - (Math.floor(i / cl) + 1) * vh; renderer.setViewport(x, y, vw, vh); renderer.setScissor(x, y, vw, vh); renderer.render(scene, cam); });
  window.__ready = true; throw new Error('weapon preview done'); }
if (q.get('nowarp')) globalThis.__noBodyWarp = true; if (q.get('bw')) globalThis.__bwMask = +q.get('bw'); // A/B: the body shape field (BodyShape.js) off
if (q.get('nofit')) globalThis.__noShellFit = true; if (q.get('noreal')) globalThis.__noRealCars = true; else await preloadRealModels((t) => fetch(`assets/vehicles/${t}.glb`).then((r) => r.arrayBuffer())); // real-car bodies (RealModels.js); &noreal=1 = procedural A/B
const g = createVehicleMesh(type, seed); scene.add(g); if (g.userData.detail) { g.add(g.userData.detail); setVehicleLOD(g.userData, true); }
if (q.get('lod') && g.userData.real) setRealLevel(g.userData, +q.get('lod'));
if (q.get('open')) { allDoorsLive(g.userData); for (const d of g.userData.doors || []) { if (d.slide) continue; d.ang = +q.get('open'); d.pivot.rotation.y = d.max * d.ang * (d.side < 0 ? 1 : -1); } g.updateMatrixWorld(true); } // &open=0..1: every hinged door swung open // &lod=1|2: the real body's distance meshes
g.traverse((o) => { if (o.isMesh && o.name !== 'contactShadow') { o.castShadow = true; o.receiveShadow = true; } });
const hide = (q.get('hide') || '').split(',').filter(Boolean); if (hide.length) g.traverse((o) => { if (o.isMesh && hide.includes(o.name)) o.visible = false; }); // isolate parts: &hide=paint,interior
console.log('parts', [...new Set((() => { const n = []; g.traverse((o) => o.isMesh && n.push(o.name)); return n; })())].join(','));
// &rider=<height>: seat a crowd adult on the driver's seat with the game's own seat pose (checks knees / legs against the bodywork)
if (q.get('rider')) { const h = +q.get('rider') > 1 ? +q.get('rider') : 1.75; const sp = { ...randomSpec(7, { sex: 'm' }), height: h, build: 1.0 }; const ch = new Character(sp);
  const seat = g.userData.seats[0]; ch.root.position.set(seat.x, seat.y, seat.z); scene.add(ch.root);
  applySeatPose({ ch, root: ch.root, s: h / 1.72, ankle: 0.085 * h / 1.72, seatW: 1, seatL: seatLocal(seat), t: 0, seed: 0.3, vehSpeed: 0, seatLookT: 9, steer: 0 }, 0.016); ch.root.updateMatrixWorld(true); }
const T = VTYPES[type]; const L = T.len;
const views = (q.get('views') || 'rider,left,front34,rear34').split(',');
const CAM = { rider: [[0.05, 1.5, -0.62], [0, 0.9, 0.5]], left: [[2.6, 0.75, 0], [0, 0.6, 0]], right: [[-2.6, 0.75, 0], [0, 0.6, 0]], front34: [[-1.7, 1.1, L * 0.95], [0, 0.65, 0.1]],
  rear34: [[1.6, 1.15, -L * 0.95], [0, 0.65, -0.1]], top: [[0, 3.2, 0.01], [0, 0.5, 0]], engine: [[1.1, 0.6, 0.15], [0, 0.45, 0.05]], cockpit: [[0.0, 1.25, -0.2], [0, 0.95, 0.45]], sideFar: [[L * 1.45, 0.95, 0], [0, 0.7, 0]], f34far: [[-L * 0.75, 1.55, L * 1.05], [0, 0.65, 0.2]], r34far: [[L * 0.75, 1.6, -L * 1.05], [0, 0.65, -0.2]], topFar: [[0.01, L * 1.6, 0], [0, 0.5, 0]], frontFar: [[0, 1.0, L * 1.3], [0, 0.7, 0]], rearFar: [[0, 1.05, -L * 1.3], [0, 0.7, 0]], lowF34: [[-L * 0.55, 0.55, L * 0.75], [0, 0.55, 0.3]], wheel: [[0.9, 0.45, L * 0.32], [0, 0.32, L * 0.32]], wheelOut: [[1.75, 0.42, L * 0.29], [0.6, 0.34, L * 0.29]], cabin: [[0.0, 1.12, -1.05], [0, 0.92, 0.6]], roofSide: [[2.4, 2.1, 0.2], [0, 1.2, 0]], doorWide: [[3.4, 1.5, -0.6], [0.5, 0.65, -0.1]], topFar: [[0.01, 7.5, 0], [0, 0, 0]], noseR: [[-1.0, 1.0, L * 0.5 + 0.9], [-0.55, 0.7, L * 0.5 - 0.3]], pillarL: [[2.0, 1.5, 0.6], [0.4, 1.2, 0.3]] };
const cols = views.length > 1 ? 2 : 1, rows = Math.ceil(views.length / cols); const vw = Math.floor(W / cols), vh = Math.floor(H / rows);
const cam = new THREE.PerspectiveCamera(40, vw / vh, 0.02, 100);
views.forEach((v, i) => { const [p, t] = CAM[v] || CAM.left; cam.position.set(...p); cam.lookAt(...t); cam.fov = v === 'cockpit' || v === 'cabin' || v === 'engine' || v === 'wheel' ? 50 : 40; cam.updateProjectionMatrix();
  const x = (i % cols) * vw, y = H - (Math.floor(i / cols) + 1) * vh; renderer.setViewport(x, y, vw, vh); renderer.setScissor(x, y, vw, vh); renderer.render(scene, cam); });
window.__ready = true;
