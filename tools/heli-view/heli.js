// Dev tool: the police helicopter model (game code: vehicles/HeliModel.js, with its crew) under daylight, no city.
//   /index.html?view=side|front|q3|rear|top|cock|cockf|low&w=1200&h=800&rpm=0..1&crew=0&dist=metres
//   → window.__result { errors, calls, tris } (the second frame: distance LODs decide on the first)
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { buildHeliModel } from '../../src/vehicles/HeliModel.js';

const q = new URLSearchParams(location.search); const W = +(q.get('w') || 1200), H = +(q.get('h') || 800); const view = q.get('view') || 'q3';
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); renderer.setSize(W, H); renderer.setPixelRatio(1);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.shadowMap.enabled = true; document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0xa9bccb);
const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.8;
scene.add(new THREE.HemisphereLight(0xdfe8f0, 0x6a6258, 0.7));
const sun = new THREE.DirectionalLight(0xfff2e0, 2.6); sun.position.set(6, 12, 8); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10 }); scene.add(sun);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshStandardMaterial({ color: 0x77777a, roughness: 0.95 })); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
const errors = []; let M = null;
try { M = buildHeliModel({ reg: '4R-SLP' }); scene.add(M.group); if (M.crew) M.crew.visible = q.get('crew') !== '0'; if (M.updateCrew) M.updateCrew(1 / 30); } catch (e) { errors.push(e.message + ' ' + (e.stack || '').split('\n')[1]); }
if (M && +q.get('rpm') > 0.5) { M.disc.visible = true; M.discMat.opacity = 0.16; for (const b of M.blades) b.visible = false; }
scene.updateMatrixWorld(true);
const cam = new THREE.PerspectiveCamera(30, W / H, 0.05, 300);
const V = { side: [[-22, 3, 0], [0, 2, 0]], front: [[0, 2.4, 20], [0, 1.9, 0]], q3: [[-12, 5, 14], [0, 1.8, 0.5]], rear: [[10, 5, -16], [0, 2, -2]], top: [[0.1, 30, 0], [0, 0, 0]],
  cock: [[-3.2, 2.1, 7.2], [0, 1.6, 3.8]], cockf: [[0, 2.0, 9.0], [0, 1.6, 3.8]], low: [[-14, 0.8, 9], [0, 2.4, 0]] }[view] || [[-12, 5, 14], [0, 1.8, 0.5]];
cam.position.set(...V[0]); cam.lookAt(...V[1]); if (view.startsWith('cock')) { cam.fov = 26; cam.updateProjectionMatrix(); }
if (q.get('dist')) { const t = new THREE.Vector3(...V[1]); const d = cam.position.clone().sub(t); cam.position.copy(t).addScaledVector(d, +q.get('dist') / d.length()); }
renderer.render(scene, cam); renderer.render(scene, cam);
const info = renderer.info; window.__result = { errors, calls: info.render.calls, tris: info.render.triangles };
window.__ready = true;
