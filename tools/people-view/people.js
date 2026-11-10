// Dev tool: a line-up of game characters (police roles, civilians, a protagonist for reference) under daylight, rendered with
// the game's own Character code, so body / clothing work can be judged without loading the city.
//   /index.html?set=police|civ|mix&view=front|back|side|legs|face&w=1600&h=900&walk=0.4
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Character, HEROES } from '../../src/actors/Character.js';
import { makePoliceAppearance, makeAppearance, PRESETS } from '../../src/actors/Appearance.js';

const q = new URLSearchParams(location.search); const W = +(q.get('w') || 1600), H = +(q.get('h') || 900); const view = q.get('view') || 'front'; const set = q.get('set') || 'police';
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); renderer.setSize(W, H); renderer.setPixelRatio(1);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.shadowMap.enabled = true; document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0xa9bccb);
const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.8;
scene.add(new THREE.HemisphereLight(0xdfe8f0, 0x6a6258, 0.7));
const sun = new THREE.DirectionalLight(0xfff2e0, 2.6); sun.position.set(3, 7, 6); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 4, bottom: -1, far: 30 }); scene.add(sun);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ color: 0x77777a, roughness: 0.95 })); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
const errors = []; const specs = [];
const pid = (id) => PRESETS.find((p) => p.id === id) ? id : undefined;
if (set === 'police' || set === 'mix') for (const [i, r] of ['patrol', 'traffic', 'supervisor', 'csru', 'motorcycle', 'patrol', 'staff'].entries()) if (!q.get('roles') || q.get('roles').split(',').includes(r)) specs.push({ label: r, sp: makePoliceAppearance(300 + i * 7, r, i === 5 ? { sex: 'f' } : {}) });
if (set === 'civ' || set === 'mix') { const ids = (q.get('presets') || '').split(',').filter(Boolean); const pool = ids.length ? ids : PRESETS.filter((p) => p.band !== 'child').map((p) => p.id).filter((_, i) => i % Math.max(1, Math.floor(PRESETS.length / 8)) === 0).slice(0, 8);
  pool.forEach((id, i) => specs.push({ label: id, sp: makeAppearance(500 + i * 13, { preset: pid(id) }) })); }
if (q.get('hero') !== '0') specs.push({ label: 'dineth (hero)', sp: HEROES.dineth });
const n = specs.length, gap = 0.95; const walk = +(q.get('walk') || 0); const chars = [];
specs.forEach((s, i) => { try { const ch = new Character(s.sp); ch.root.position.set((i - (n - 1) / 2) * gap, 0, 0); ch.root.rotation.y = view === 'back' || view === 'feet' ? Math.PI : view === 'side' ? Math.PI / 2 : 0; scene.add(ch.root);
  ch.root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } }); chars.push(ch); } catch (e) { errors.push(s.label + ': ' + e.message); } });
for (let f = 0; f < 90; f++) { for (const ch of chars) ch.anim.update(1 / 60, walk, 0); }
scene.updateMatrixWorld(true);
const cam = new THREE.PerspectiveCamera(view === 'legs' || view === 'face' || view === 'chest' || view === 'feet' ? 22 : 30, W / H, 0.05, 100); const span = n * gap;
if (view === 'feet') { cam.position.set(0, 0.35, span * 0.8); cam.lookAt(0, 0.12, 0); }
else if (view === 'legs') { cam.position.set(0, 0.75, span * 1.15); cam.lookAt(0, 0.62, 0); }
else if (view === 'chest') { cam.position.set(0, 1.3, span * 1.0); cam.lookAt(0, 1.22, 0); }
else if (view === 'face') { cam.position.set(0, 1.62, span * 1.05); cam.lookAt(0, 1.5, 0); }
else { cam.position.set(0, 1.2, span * 1.18 + 1.5); cam.lookAt(0, 0.92, 0); }
renderer.render(scene, cam);
const info = renderer.info; window.__result = { errors, n, labels: specs.map((s) => s.label), calls: info.render.calls, tris: info.render.triangles, perChar: chars.map((c) => { let t = 0; c.root.traverse((o) => { if (o.isMesh && o.geometry.index) t += o.geometry.index.count / 3; }); return t; }) };
window.__ready = true;
