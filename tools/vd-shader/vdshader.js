// Dev tool: every vehicle-damage material compiled and drawn by a real WebGL renderer (glass cracks / shatter, bullet holes,
// dents, scrapes, charred wreck shell, shards / fragments, flung pieces, the textured tyre) plus the real Explosions particles.
// Built with `npx vite build tools/vd-shader --outDir /tmp/vdsh` and driven by tools/vd-shader/run.mjs (puppeteer).
// ?stage=0..3 picks what is on screen: 0 clean, 1 shot up / dented, 2 burning, 3 after the explosion. window.__result = report.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Vehicle, setRealLevel, setVehicleLOD } from '../../src/vehicles/Vehicle.js';
import { preloadRealModels } from '../../src/vehicles/RealModels.js';
import { VehicleDamage } from '../../src/vehicles/VehicleDamage.js';
import { Explosions } from '../../src/gfx/Explosions.js';

const q = new URLSearchParams(location.search); const stage = +(q.get('stage') ?? 3); const W = 1280, H = 720; const errors = [];
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); renderer.setSize(W, H); renderer.setPixelRatio(1);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.shadowMap.enabled = true; document.body.appendChild(renderer.domElement);
renderer.debug.checkShaderErrors = true; renderer.debug.onShaderError = (gl, prog, vs, fs) => { errors.push('shader: ' + (gl.getProgramInfoLog(prog) || '') + ' | ' + (gl.getShaderInfoLog(vs) || '') + ' | ' + (gl.getShaderInfoLog(fs) || '')); };
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x9fb4c8); const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.8;
const sun = new THREE.DirectionalLight(0xfff2dd, 2.6); sun.position.set(12, 18, 8); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, far: 80 }); scene.add(sun, new THREE.HemisphereLight(0xcfe0ff, 0x6b5a48, 0.7));
const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshStandardMaterial({ color: 0x55575a, roughness: 0.95 })); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
const camera = new THREE.PerspectiveCamera(40, W / H, 0.1, 200);
const stub = new Proxy({}, { get: () => () => {} });
const game = { scene, camera, traffic: null, collision: null, crowd: { alarm() {}, peds: [], list: [] }, police: null, player: { x: 999, z: 999, shake() {} }, health: { damage() {}, hp: 100 }, hud: { notify() {} }, post: { concuss() {}, shock() {} }, blood: stub, birds: null, atmos: null, debug: {}, impulse: null, indoor: false };
try { await preloadRealModels((t) => fetch(`assets/vehicles/${t}.glb`).then((r) => r.arrayBuffer())); } catch (e) { errors.push('preload: ' + e.message); }
game.explosions = new Explosions(game); const VD = game.vdamage = new VehicleDamage(game);
const types = (q.get('types') || 'ventra,car,raiden,bus,tuktuk,brennhart_blitz').split(','); const V = []; let x = -((types.length - 1) * 3.4) / 2;
for (const t of types) { try { const v = new Vehicle(t, 1, scene); if (v.mesh.userData.detail) { v.mesh.add(v.mesh.userData.detail); setVehicleLOD(v.mesh.userData, true); } const w = v.T.wid; v.place(x, 0, 0.35); v.sync(0); if (v.mesh.userData.real) setRealLevel(v.mesh.userData, 0); V.push(v); x += 3.4 + (w > 2.2 ? 1.2 : 0); } catch (e) { errors.push(t + ': ' + e.message); } }
scene.add(VD.warmGroup());
let frames = 0; const tick = (n, dt = 1 / 30) => { for (let i = 0; i < n; i++) { VD.update(dt); game.explosions.update(dt); for (const v of V) if (!v.wrecked) v.sync(dt); if (i % 5 === 0) { renderer.render(scene, camera); frames++; } } };
camera.position.set(0, 4.5, 15); camera.lookAt(0, 0.8, 0); tick(2);
const step = (f) => { try { f(); } catch (e) { errors.push('step: ' + e.message + ' ' + (e.stack || '').split('\n')[1]); } };
if (stage >= 1 && q.get('view') !== 'ws') for (const v of V) step(() => { VD.shootDemo(v, 14); const W0 = (v.mesh.userData.wheels || [])[0]; if (W0) VD.burst(v, W0); const [fx, fz] = v.forward(); VD.onImpact(v, 12, { nx: -fx, nz: -fz, t: v.T.len / 2 }); VD.onImpact(v, 6, { nx: fz, nz: -fx, t: 0, slide: 5, scrapeOnly: true }); });
if (stage >= 1 && V[1]) step(() => VD.smashAll(V[1]));
if (q.get('view') === 'ws' && V[0]) step(() => { const v = V[0]; v.mesh.updateMatrixWorld(true); const L = (x, y, z) => new THREE.Vector3(x, y, z).applyMatrix4(v.mesh.matrixWorld);
  for (const [x, y] of [[0.35, 1.0], [-0.25, 1.08], [0.05, 0.93]]) { const o = L(x, y + 0.6, 4.5), t = L(x, y, 0.5); VD.bullet(v, o, t.sub(o).normalize(), { cls: 'pistol', dmg: 0.8 }, { by: 'debug' }); } });
tick(20);
if (stage >= 2) for (const v of V.slice(0, 3)) step(() => VD.ignite(v, 2.5, 'debug', 'engine'));
tick(stage >= 2 ? 40 : 1);
if (stage >= 3) { for (const v of V.slice(3)) step(() => VD.explode(v, 'debug')); tick(30); }
const gl = renderer.getContext(); let glErr = gl.getError(); const glErrs = []; while (glErr !== gl.NO_ERROR && glErrs.length < 8) { glErrs.push(glErr); glErr = gl.getError(); }
// the view: close on the first vehicle for stages 1-2, wide for 3
if (stage === 1 || stage === 2) { const v = V[0]; camera.position.set(v.x - 3.6, 1.6, v.z + 4.6); camera.lookAt(v.x, 0.7, v.z); } else if (stage === 0) { const v = V[0]; camera.position.set(v.x - 1.2, 0.55, v.z + 2.6); camera.lookAt(v.x - 0.6, 0.35, v.z + 1.3); }
const view = q.get('view'); if (view && V[0]) { const v = V[0]; v.mesh.updateMatrixWorld(true); const L = (x, y, z) => new THREE.Vector3(x, y, z).applyMatrix4(v.mesh.matrixWorld);
  if (view === 'ws') { const p = L(0.05, 1.0, 0.6); camera.position.copy(L(-0.6, 1.45, 3.2)); camera.lookAt(p); camera.fov = 34; }
  else if (view === 'tyre') { const w = (v.mesh.userData.wheels || [])[1] || v.mesh.userData.wheels[0]; const c = w.getWorldPosition(new THREE.Vector3()); const side = Math.sign(w.position.x) || 1; camera.position.copy(L(w.position.x + side * 1.3, 0.55, w.position.z + 0.5)); camera.lookAt(c); camera.fov = 32; }
  camera.updateProjectionMatrix(); }
renderer.render(scene, camera); frames++;
window.__result = { stage, errors, glErrs, frames, programs: renderer.info.programs ? renderer.info.programs.length : -1, calls: renderer.info.render.calls, tris: renderer.info.render.triangles, stats: VD.stats, wrecked: V.filter((v) => v.wrecked).length, burning: V.filter((v) => v.burning).length, bodies: VD.bodies ? VD.bodies.filter((b) => b.obj && b.obj.visible).length : -1 };
window.__ready = true;
