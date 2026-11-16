// Dev tool: one boat (game code: boats/Boat.js + BoatModels.js) on flat water, by day or by night with its lamps.
//   /tools/boat-view/index.html?id=dondra26&view=side|front|q3|rear|top|helm|bowq|sternq|low&night=0|1&nav=motor|sail|anchor|off
//      &sails=1&deck=1&cabin=1&uwl=1&beacon=1&w=1200&h=800&dist=metres&yawc=degrees (camera orbit)&holes=n&tear=0..1
//   → window.__result { errors, calls, tris, lamps }
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Boat } from '../../src/boats/Boat.js';
import { BoatLamps } from '../../src/boats/BoatLamps.js';

const q = new URLSearchParams(location.search); const W = +(q.get('w') || 1200), H = +(q.get('h') || 800); const view = q.get('view') || 'q3'; const night = q.get('night') === '1';
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); renderer.setSize(W, H); renderer.setPixelRatio(1);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.shadowMap.enabled = true; document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(night ? 0x060a12 : 0xa9bccb);
const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = night ? 0.04 : 0.8;
scene.add(new THREE.HemisphereLight(night ? 0x223044 : 0xdfe8f0, night ? 0x05070a : 0x4a5258, night ? 0.25 : 0.7));
const sun = new THREE.DirectionalLight(night ? 0x8090b0 : 0xfff2e0, night ? 0.12 : 2.6); sun.position.set(14, 22, 10); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -25, right: 25, top: 25, bottom: -25, far: 120 }); scene.add(sun);
const water = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshStandardMaterial({ color: night ? 0x0a1a24 : 0x1f5c6a, roughness: 0.18, metalness: 0.1 })); water.rotation.x = -Math.PI / 2; water.position.y = -0.95; water.receiveShadow = true; scene.add(water);
const errors = []; let B = null; const lamps = new BoatLamps(scene);
const t = 7.3;
try {
  B = new Boat(q.get('id') || 'dondra26', { x: 0, z: 0, yaw: 0, mode: 'drive' }); scene.add(B.root); B.place(0, 0, 0, true); B.y = -0.95; B.sync();
  if (q.get('sails') === '1') { B.setSailsVisible(true); B.windSide = 1; for (const s of B.sails) { s.ang = s.def.jib ? -0.35 : -0.5; s.piv.rotation.y = s.ang; s.U.uSide.value = -1; s.U.uTime.value = t; } }
  const nh = +(q.get('holes') || 0); for (let i = 0; i < nh; i++) B.sailHit(i % Math.max(1, B.sails.length), new THREE.Vector2(0.15 + Math.random() * 0.7, 0.1 + Math.random() * 0.75));
  if (q.get('tear')) for (const s of B.sails) { s.tear = +q.get('tear'); s.U.uTear.value = s.tear; }
  if (q.get('fend') === '1') B.U.uFend.value = 1;
  const nav = q.get('nav') || (night ? 'motor' : 'off'); const bc = q.get('beacon') === '1';
  const beacon = bc ? { b: (i) => ((t * 2.4 + i * 0.12) % 1 < 0.5 ? 1 : 0.1), r: (i) => ((t * 2.4 + i * 0.12 + 0.5) % 1 < 0.5 ? 1 : 0.1) } : null;
  const LS = { nav: nav === 'motor' || nav === 'sail' ? nav : null, anchor: nav === 'anchor', deck: q.get('deck') === '1', uwl: q.get('uwl') === '1', beacon, cabin: q.get('cabin') === '1' ? 1 : 0 };
  B.setLights(LS, night ? 1 : 0);
  window.__boat = B;
  globalThis.__LS = LS;
} catch (e) { errors.push(e.message + ' ' + (e.stack || '').split('\n')[1]); }
scene.updateMatrixWorld(true);
const M = B ? B.model : { len: 8, height: 3 }; const L = M.len, Ht = M.height;
const cam = new THREE.PerspectiveCamera(30, W / H, 0.05, 3000);
const V = { side: [[-L * 1.7, Ht * 0.45, 0], [0, Ht * 0.3, 0]], front: [[0, Ht * 0.5, L * 1.6], [0, Ht * 0.3, 0]], q3: [[-L * 1.05, Ht * 0.75 + 1, L * 1.15], [0, Ht * 0.28, 0]], rear: [[L * 0.7, Ht * 0.7 + 1, -L * 1.3], [0, Ht * 0.3, 0]],
  top: [[0.1, L * 2.6, 0], [0, 0, 0]], helm: [[-1.6, Ht * 0.55 + 1.2, -L * 0.15], [0, Ht * 0.25, L * 0.2]], bowq: [[-L * 0.5, Ht * 0.4 + 0.8, L * 0.95], [0, Ht * 0.2, L * 0.2]], sternq: [[-L * 0.55, Ht * 0.5 + 1, -L * 1.0], [0, Ht * 0.25, -L * 0.2]], low: [[-L * 1.2, 0.3, L * 0.8], [0, Ht * 0.3, 0]] }[view] || [[-L, Ht, L], [0, 0, 0]];
cam.position.set(...V[0]); const tgt = new THREE.Vector3(...V[1]);
if (q.get('yawc')) { const a = (+q.get('yawc') * Math.PI) / 180; const r = Math.hypot(cam.position.x, cam.position.z); cam.position.x = Math.sin(a) * r; cam.position.z = Math.cos(a) * r; }
if (q.get('dist')) { const d = cam.position.clone().sub(tgt); cam.position.copy(tgt).addScaledVector(d, +q.get('dist') / d.length()); }
cam.lookAt(tgt);
if (B && night) { lamps.begin(cam, H); lamps.addBoat(B, B.lights, 1); lamps.end(); const dl = B.model.lights.filter((l) => l.kind === 'deck'); if (dl.length && B.lights.deck) { const p = B.worldPoint(dl[0].p); lamps.pool({ p }, null, 1); } }
renderer.render(scene, cam); renderer.render(scene, cam);
const info = renderer.info; window.__result = { errors, calls: info.render.calls, tris: info.render.triangles, lamps: lamps.n };
window.__ready = true;
