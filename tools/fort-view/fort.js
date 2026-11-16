// Dev tool: Colombo Fort railway station alone (game code: world/FortStation.js + vehicles/TrainModels.js), game materials.
//   /tools/fort-view/index.html?cam=x,y,z&at=x,y,z&fov=50&night=0|1&w=1280&h=720&hour=9.5&train=1
//   → window.__result { errors, calls, tris }
import '@fontsource/noto-sans-sinhala/600.css';
import '@fontsource/noto-sans-tamil/600.css';
import '@fontsource/cormorant-garamond/700.css';
import '@fontsource/barlow-condensed/700.css';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { buildTextures } from '../../src/gfx/Textures.js';
import { buildMaterials, MAT, updateMaterials } from '../../src/gfx/Materials.js';
import { MultiBuilder } from '../../src/gfx/MeshBuilder.js';
import { buildFortStation } from '../../src/world/FortStation.js';
import { buildDmuCar, makeTrainMaterials, protoMeshes, CAR_LEN } from '../../src/vehicles/TrainModels.js';
import { RAIL_TOP } from '../../src/world/Railway.js';

const q = new URLSearchParams(location.search); const W = +(q.get('w') || 1280), H = +(q.get('h') || 720); const night = q.get('night') === '1';
const v3 = (s, d) => (s ? s.split(',').map(Number) : d);
const errors = []; window.addEventListener('error', (e) => errors.push(String(e.message)));
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); renderer.setSize(W, H); renderer.setPixelRatio(1);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(night ? 0x060a12 : 0xa9bccb);
const pm = new THREE.PMREMGenerator(renderer); if (!night) { scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.5; }
scene.add(new THREE.HemisphereLight(night ? 0x5f6672 : 0xdfe8f0, night ? 0x10141a : 0x4a5258, night ? 0.54 : 0.75));
if (night) { const am = new THREE.AmbientLight(0xffffff, 0.85); am.color.setRGB(0.34, 0.37, 0.55); scene.add(am); }
const sun = new THREE.DirectionalLight(night ? 0x8090b0 : 0xfff2e0, night ? 0.12 : 2.6); sun.position.set(-35 + 60, 90, -620 - 70); sun.target.position.set(-35, 0, -620); scene.add(sun.target);
sun.castShadow = true; sun.shadow.mapSize.set(4096, 4096); Object.assign(sun.shadow.camera, { left: -110, right: 110, top: 110, bottom: -110, near: 1, far: 300 }); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04; scene.add(sun);
await Promise.race([Promise.all(['600 32px "Noto Sans Sinhala"', '600 32px "Noto Sans Tamil"', '700 32px "Barlow Condensed"', '700 32px "Cormorant Garamond"'].map((f) => document.fonts.load(f, 'අආ தமி Aa'))), new Promise((r) => setTimeout(r, 4000))]);
await buildTextures('medium'); buildMaterials(); updateMaterials(night ? 1 : 0, 0, +(q.get('hour') || 9.5));
const C = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
const mb = new MultiBuilder(); const colliders = []; const group = new THREE.Group(); scene.add(group);
// the landmarks' hip-roof helper (same maths as Landmarks.js)
const hip = (x0, x1, z0, z1, y, rise, col = '#ffffff', mat = 'roofTiles') => {
  const b = mb.get(mat); const ov = 0.8; x0 -= ov; x1 += ov; z0 -= ov; z1 += ov; const w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2; const rh = Math.abs(w - d) / 2; const c = C(col);
  const r0 = w >= d ? [cx - rh, y + rise, cz] : [cx, y + rise, cz - rh], r1 = w >= d ? [cx + rh, y + rise, cz] : [cx, y + rise, cz + rh];
  const A = [x0, y, z1], B = [x1, y, z1], Cc = [x1, y, z0], D = [x0, y, z0];
  const T = (p, qq, r) => { const i = b.vcount; const ux = qq[0] - p[0], uy = qq[1] - p[1], uz = qq[2] - p[2], vx = r[0] - p[0], vy = r[1] - p[1], vz = r[2] - p[2]; const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1; b.vert(...p, nx / l, ny / l, nz / l, 0, 0, c); b.vert(...qq, nx / l, ny / l, nz / l, Math.hypot(ux, uz) / 4, 0, c); b.vert(...r, nx / l, ny / l, nz / l, 0.5, rise / 2, c); b.idx.push(i, i + 1, i + 2); };
  if (w >= d) { b.quad(A, B, r1, r0, [0, 0, w / 4, d / 6], c); b.quad(Cc, D, r0, r1, [0, 0, w / 4, d / 6], c); T(B, Cc, r1); T(D, A, r0); } else { b.quad(B, Cc, r0, r1, [0, 0, d / 4, w / 6], c); b.quad(D, A, r1, r0, [0, 0, d / 4, w / 6], c); T(A, B, r1); T(Cc, D, r0); }
};
const lightPool = (x, z, y, size) => { const h = size / 2; mb.get('pool').hrect(x - h, z - h, x + h, z + h, y, size, null, false, [-(x - h) / size, (z + h) / size]); };
let anim = null;
try { anim = buildFortStation({ mb, colliders, group, C, hip, lightPool }); anim.update(+(q.get('hour') || 9.5), night ? 1 : 0); } catch (e) { errors.push(e.message + ' ' + (e.stack || '').split('\n').slice(1, 3).join(' ')); }
for (const m of mb.toMeshes(MAT, { cast: true, receive: true })) { if (m.name === 'emissive' || m.name === 'pool') m.castShadow = false; if (m.name === 'pool' && !night) m.visible = false; group.add(m); }
// ground: footway / road / ballast strips (enough context for the review)
const gnd = (x0, x1, z0, z1, y, col) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), new THREE.MeshStandardMaterial({ color: col, roughness: 0.95 })); m.rotation.x = -Math.PI / 2; m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2); m.receiveShadow = true; scene.add(m); };
gnd(-400, 300, -900, -400, 0.0, 0x6d6a62); gnd(-300, 200, -669, -651, 0.02, 0x3c3d3f); gnd(-300, 200, -651, -646.5, 0.15, 0x9a958c); gnd(-300, 200, -614, -610, 0.3, 0x7d776f);
// the running train at platform 1 (game proto meshes)
if (q.get('train') !== '0') { try { const mats = makeTrainMaterials(); const P = { cab: protoMeshes(buildDmuCar(true).mb, mats), trailer: protoMeshes(buildDmuCar(false).mb, mats) }; for (let k = 0; k < 5; k++) { const cab = k === 0 || k === 4; const proto = cab ? P.cab : P.trailer; const g = new THREE.Group(); for (const m of proto) { const c = m.clone(); g.add(c); } g.position.set(-35 + (k - 2) * (CAR_LEN + 0.6), RAIL_TOP, -612); g.rotation.y = k === 4 ? -Math.PI / 2 : Math.PI / 2; scene.add(g); } } catch (e) { errors.push('train: ' + e.message); } }
scene.updateMatrixWorld(true);
const cam = new THREE.PerspectiveCamera(+(q.get('fov') || 50), W / H, 0.1, 3000); cam.position.set(...v3(q.get('cam'), [-35, 12, -700])); cam.lookAt(new THREE.Vector3(...v3(q.get('at'), [-35, 4, -630])));
renderer.render(scene, cam); renderer.render(scene, cam);
const info = renderer.info; window.__result = { errors, calls: info.render.calls, tris: info.render.triangles, colliders: colliders.length };
window.__ready = true;
