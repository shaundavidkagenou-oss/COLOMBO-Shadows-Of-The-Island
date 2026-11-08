// Dev tool: renders one vehicle model from four angles (rider view, left, right 3/4 front, rear 3/4) under a daylight sky
// environment, so model work can be checked in seconds without loading the whole city.
//   /index.html?type=soraki_rr1000&seed=1&w=1280&h=720
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { createVehicleMesh, VTYPES } from '../../src/vehicles/VehicleModels.js';
import { setVehicleLOD } from '../../src/vehicles/Vehicle.js';
import { modelFloor } from '../../src/world/FloorKit.js';

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
const g = createVehicleMesh(type, seed); scene.add(g); if (g.userData.detail) { g.add(g.userData.detail); setVehicleLOD(g.userData, true); }
g.traverse((o) => { if (o.isMesh && o.name !== 'contactShadow') { o.castShadow = true; o.receiveShadow = true; } });
const hide = (q.get('hide') || '').split(',').filter(Boolean); if (hide.length) g.traverse((o) => { if (o.isMesh && hide.includes(o.name)) o.visible = false; }); // isolate parts: &hide=paint,interior
console.log('parts', [...new Set((() => { const n = []; g.traverse((o) => o.isMesh && n.push(o.name)); return n; })())].join(','));
const T = VTYPES[type]; const L = T.len;
const views = (q.get('views') || 'rider,left,front34,rear34').split(',');
const CAM = { rider: [[0.05, 1.5, -0.62], [0, 0.9, 0.5]], left: [[2.6, 0.75, 0], [0, 0.6, 0]], right: [[-2.6, 0.75, 0], [0, 0.6, 0]], front34: [[-1.7, 1.1, L * 0.95], [0, 0.65, 0.1]],
  rear34: [[1.6, 1.15, -L * 0.95], [0, 0.65, -0.1]], top: [[0, 3.2, 0.01], [0, 0.5, 0]], engine: [[1.1, 0.6, 0.15], [0, 0.45, 0.05]], cockpit: [[0.0, 1.25, -0.2], [0, 0.95, 0.45]], wheel: [[0.9, 0.45, L * 0.32], [0, 0.32, L * 0.32]] };
const cols = views.length > 1 ? 2 : 1, rows = Math.ceil(views.length / cols); const vw = Math.floor(W / cols), vh = Math.floor(H / rows);
const cam = new THREE.PerspectiveCamera(40, vw / vh, 0.02, 100);
views.forEach((v, i) => { const [p, t] = CAM[v] || CAM.left; cam.position.set(...p); cam.lookAt(...t); cam.fov = v === 'cockpit' || v === 'engine' || v === 'wheel' ? 50 : 40; cam.updateProjectionMatrix();
  const x = (i % cols) * vw, y = H - (Math.floor(i / cols) + 1) * vh; renderer.setViewport(x, y, vw, vh); renderer.setScissor(x, y, vw, vh); renderer.render(scene, cam); });
window.__ready = true;
