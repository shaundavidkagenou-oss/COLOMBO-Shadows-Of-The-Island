// 78th request — the Ceylon Meridian Bank hall's lighting / reflection pass ("GTA VI-inspired realism, performance equally
// important"). Everything here is either baked once or a few ALU per pixel; no new real-time lights, no shadow maps, no
// screen-space passes:
//
//   • REFLECTION PROBE — the hall is rendered once into a 256-px cube (PMREM, the same size as the sky environment, so every
//     material keeps its compiled program) from the middle of the public hall, with the room's own light pool on, the city
//     hidden and nobody in it. While the player is inside, that probe is the scene environment: the polished floor, the
//     marble, the glass, the steel — and the people — reflect and are lit (indirectly) by THIS room instead of the sky.
//     Captured on the loading screen (WalkIn.preloadAll); re-captured once on entering when day ↔ night has changed.
//   • BOX PROJECTION — the hall's own materials look the probe up parallax-corrected against the room's box (a local
//     reflection probe: the ceiling panels reflected in the floor sit under the real panels and slide correctly as you walk),
//     a dozen ALU in getIBLRadiance. The floor's roughness map follows each tile's own texture offset (no repeating sheen).
//   • BAKED CONTACT SHADOWS / OCCLUSION — one merged mesh, one draw: soft-edged darkening under every piece of floor-standing
//     furniture, each waiting seat, along the counter front and the walls' floor line, and a soft corner falloff on the
//     ceiling along the walls (the corners keep depth without going black). Vertex alpha only, no texture.
//   • PEOPLE — a soft contact shadow under everyone standing or walking in the hall (one instanced draw, ≤ 16 instances,
//     positions copied each frame), so the customers and staff stand ON the floor.
//
// Graphics settings (Settings → quality → preset.bankFX): 0 low — probe + baked shadows only; 1 medium / 2 high / 3 ultra —
// + box projection and the people's shadows. (Texture sizes: BankTex.js, preset.bankTex.)
import * as THREE from 'three';
import { Settings } from '../core/Settings.js';

// tunables (window.__bankFX in dev builds, for the screenshot harness)
export const BANKFX = { env: 0.9, hemi: 0.42, amb: 0.55, pool: 0.88, ao: 1, blob: 0.42, captured: 0 };
const level = () => { const p = Settings.preset; return p && p.bankFX !== undefined ? p.bankFX : 2; };

// ------------------------------------------------------------------------------------------------ box-projected probe
const BP = {
  uBPOn: { value: 0 }, uBPRot: { value: new THREE.Matrix3() }, uBPOrigin: { value: new THREE.Vector3() },
  uBPMin: { value: new THREE.Vector3() }, uBPMax: { value: new THREE.Vector3() }, uBPProbe: { value: new THREE.Vector3() },
};
const ANCHOR = 'reflectVec = transformDirectionByInverseViewMatrix( reflectVec, viewMatrix );';
let CHUNK = null;
function chunk() {
  if (CHUNK) return CHUNK; const src = THREE.ShaderChunk.envmap_physical_pars_fragment; const at = src.indexOf(ANCHOR);
  if (at < 0) { console.warn('[bankFX] envmap chunk changed: no box projection'); return (CHUNK = src); }
  // world → room-local (rotation + origin), intersect the room box from inside, back to a world direction from the probe
  const inj = `${ANCHOR}
		if ( uBPOn > 0.5 ) {
			vec3 bpL = uBPRot * ( vBPWorld - uBPOrigin ); vec3 bpD = uBPRot * reflectVec;
			vec3 bpA = ( uBPMax - bpL ) / bpD; vec3 bpB = ( uBPMin - bpL ) / bpD; vec3 bpF = max( bpA, bpB );
			float bpT = min( min( bpF.x, bpF.y ), bpF.z );
			reflectVec = transpose( uBPRot ) * ( bpL + bpD * bpT - uBPProbe );
		}`;
  return (CHUNK = src.slice(0, at) + inj + src.slice(at + ANCHOR.length));
}
const BASE_KEY = THREE.Material.prototype.customProgramCacheKey;
// patch one of the hall's own MeshStandardMaterials (keeps any patch it already has, e.g. the floor tiles' per-tile UVs)
// surface touches (a few ALU, no textures): 'glass' — Fresnel: the pane stays see-through face-on and turns reflective /
// greener toward grazing angles and on its 10–20 mm edges (its thickness reads); 'wall' / 'ceil' — a slow, room-scale tone
// drift (no two ceiling panels or wall bays quite the same: the repeat of the texture disappears), and on walls a faint
// scuff band just above the skirting (a maintained bank: light, not dirty)
const NOISE = `float bpH( vec3 p ) { p = fract( p * 0.3183099 + 0.1 ); p *= 17.0; return fract( p.x * p.y * p.z * ( p.x + p.y + p.z ) ); }
float bpN( vec3 x ) { vec3 i = floor( x ), f = fract( x ); f = f * f * ( 3.0 - 2.0 * f );
	return mix( mix( mix( bpH( i ), bpH( i + vec3( 1, 0, 0 ) ), f.x ), mix( bpH( i + vec3( 0, 1, 0 ) ), bpH( i + vec3( 1, 1, 0 ) ), f.x ), f.y ),
		mix( mix( bpH( i + vec3( 0, 0, 1 ) ), bpH( i + vec3( 1, 0, 1 ) ), f.x ), mix( bpH( i + vec3( 0, 1, 1 ) ), bpH( i + vec3( 1, 1, 1 ) ), f.x ), f.y ), f.z ); }
`;
const TOUCH = {
  wall: `#ifdef USE_ENVMAP
	{ vec3 bq = uBPRot * ( vBPWorld - uBPOrigin ); float n = bpN( bq * 0.55 ) * 0.65 + bpN( bq * 2.3 ) * 0.35;
	  diffuseColor.rgb *= ( 0.955 + 0.075 * n ) * ( 1.0 - 0.07 * ( 1.0 - smoothstep( 0.12, 0.42, bq.y ) ) * bpN( bq * 6.0 + 3.1 ) ); }
#endif`,
  ceil: `#ifdef USE_ENVMAP
	{ vec3 bq = uBPRot * ( vBPWorld - uBPOrigin ); diffuseColor.rgb *= 0.95 + 0.07 * ( bpN( bq * 0.45 ) * 0.6 + bpN( bq * 1.7 + 7.0 ) * 0.4 ); }
#endif`,
};
const GLASS = `{ float bpF = 1.0 - saturate( abs( dot( normal, normalize( vViewPosition ) ) ) ); bpF = bpF * bpF * bpF;
	diffuseColor.a = clamp( diffuseColor.a + bpF * 0.42, 0.0, 0.6 ); outgoingLight *= mix( vec3( 1.0 ), vec3( 0.86, 0.97, 0.93 ), bpF ); }
#include <opaque_fragment>`;
export function patchBankMaterial(m, { roughFromMap = false, touch = '' } = {}) {
  if (!m || !m.isMeshStandardMaterial || m.userData.bankBP) return m; m.userData.bankBP = true;
  const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey; const pk = prevKey && prevKey !== BASE_KEY ? prevKey.call(m) : prev ? String(prev) : '';
  m.onBeforeCompile = function (sh, r) {
    if (prev) prev.call(this, sh, r);
    Object.assign(sh.uniforms, BP);
    sh.vertexShader = 'varying vec3 vBPWorld;\n' + sh.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n#ifdef USE_ENVMAP\n\tvBPWorld = worldPosition.xyz;\n#endif');
    sh.fragmentShader = 'uniform float uBPOn; uniform mat3 uBPRot; uniform vec3 uBPOrigin, uBPMin, uBPMax, uBPProbe; varying vec3 vBPWorld;\n' + (TOUCH[touch] ? NOISE : '') +
      sh.fragmentShader.replace('#include <envmap_physical_pars_fragment>', chunk());
    // the floor: its roughness map read with the colour map's per-tile offset UVs (every tile a different patch of polish)
    if (roughFromMap) sh.fragmentShader = sh.fragmentShader.replace('#include <roughnessmap_fragment>', `float roughnessFactor = roughness;
#if defined( USE_ROUGHNESSMAP ) && defined( USE_MAP )
	roughnessFactor *= texture2D( roughnessMap, vMapUv * 1.37 ).g;
#elif defined( USE_ROUGHNESSMAP )
	roughnessFactor *= texture2D( roughnessMap, vRoughnessMapUv ).g;
#endif`);
    if (TOUCH[touch]) sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\n' + TOUCH[touch]);
    if (touch === 'glass') sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', GLASS);
  };
  m.customProgramCacheKey = () => pk + '|bankBP' + (roughFromMap ? 'R' : '') + touch;
  m.needsUpdate = true; return m;
}
const touchOf = (m) => (m.transparent && /glass|glazing/i.test(m.name) ? 'glass' : /ceiling tile/i.test(m.name) ? 'ceil' : /wall plaster/i.test(m.name) ? 'wall' : '');
// every own material of the hall (skips the people: their materials are shared city-wide and have their own patches)
export function patchBankRoom(g) {
  const seen = new Set(); g.traverse((o) => { if (!o.isMesh || o.isSkinnedMesh) return; for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
    if (!m || seen.has(m) || !m.isMeshStandardMaterial || !/^CMB/.test(m.name || '')) continue; seen.add(m); patchBankMaterial(m, { roughFromMap: /Granite floor tiles/.test(m.name), touch: touchOf(m) }); } });
  return seen.size;
}

// ------------------------------------------------------------------------------------------------ baked contact shadows
// soft rectangle on the floor: core = footprint (inset), fading to 0 over `m` outside it — a 4 × 4 vertex grid, 9 quads
function softRect(P, A, x0, x1, z0, z1, m, a, y = 0.004, inset = 0.02) {
  const xs = [x0 - m, x0 + inset, x1 - inset, x1 + m], zs = [z0 - m, z0 + inset, z1 - inset, z1 + m]; const base = P.length / 3;
  for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) { P.push(xs[i], y, zs[j]); A.push((i === 1 || i === 2) && (j === 1 || j === 2) ? a : 0); }
  const idx = []; for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) { const q = base + j * 4 + i; idx.push(q, q + 4, q + 1, q + 1, q + 4, q + 5); } return idx;
}
// a strip: edge p0-p1 at alpha a, fading to 0 at p0+d, p1+d (d = the fade direction × width)
function strip(P, A, p0, p1, d, a) { const base = P.length / 3; P.push(...p0, ...p1, p1[0] + d[0], p1[1] + d[1], p1[2] + d[2], p0[0] + d[0], p0[1] + d[1], p0[2] + d[2]); A.push(a, a, 0, 0); return [base, base + 3, base + 1, base + 1, base + 3, base + 2]; }
const SKIP = /Brochure rack|Teller counter|^Manager's chair$/; // wall-hung · the whole staff zone (its front is a strip) · the guard's spot (a person: dynamic)
export function buildBankAO(room, { x0, x1, z0, zf, H, nStatic, counterZ = -8.82 }) {
  const P = [], A = [], I = []; const k = BANKFX.ao;
  for (let i = 0; i < nStatic; i++) { const o = room.obstacles[i]; if (!o || SKIP.test(o.part || '')) continue; const w = o.x1 - o.x0, d = o.z1 - o.z0;
    const thin = Math.min(w, d) < 0.15; const big = w * d > 0.8; I.push(...softRect(P, A, o.x0, o.x1, o.z0, o.z1, thin ? 0.1 : big ? 0.22 : 0.16, (thin ? 0.22 : big ? 0.42 : 0.36) * k)); }
  for (const s of room.seats || []) I.push(...softRect(P, A, s.x - 0.2, s.x + 0.2, s.z - 0.2, s.z + 0.2, 0.18, 0.2 * k, 0.0045)); // the chair's star base
  // counter front (the public side of the teller counter, x0 … x1) and the walls' floor line + the ceiling corners
  I.push(...strip(P, A, [x0, 0.005, counterZ], [x1, 0.005, counterZ], [0, 0, 0.32], 0.4 * k));
  const zc = counterZ;
  for (const [x, s] of [[x0 + 0.015, 1], [x1 - 0.015, -1]]) { I.push(...strip(P, A, [x, 0.005, zc], [x, 0.005, zf], [s * 0.3, 0, 0], 0.3 * k)); I.push(...strip(P, A, [x, H - 0.006, zc], [x, H - 0.006, zf], [s * 0.55, 0, 0], 0.16 * k)); }
  I.push(...strip(P, A, [x0, 0.005, zf - 0.03], [x1, 0.005, zf - 0.03], [0, 0, -0.28], 0.22 * k)); I.push(...strip(P, A, [x0, H - 0.006, zf - 0.03], [x1, H - 0.006, zf - 0.03], [0, 0, -0.5], 0.12 * k));
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  const col = new Float32Array(A.length * 4); for (let i = 0; i < A.length; i++) col[i * 4 + 3] = A[i]; g.setAttribute('color', new THREE.BufferAttribute(col, 4)); g.setIndex(I);
  const m = new THREE.MeshBasicMaterial({ name: 'CMB · Baked contact shadows', color: 0x000000, vertexColors: true, transparent: true, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  m.userData.own = true; const mesh = new THREE.Mesh(g, m); mesh.name = 'bankContactAO'; mesh.renderOrder = -1; mesh.matrixAutoUpdate = false; mesh.castShadow = mesh.receiveShadow = false; mesh.userData.noPart = true;
  return mesh;
}

// ------------------------------------------------------------------------------------------------ people's contact shadows
let BLOBTEX = null;
function blobTex() {
  if (BLOBTEX || typeof document === 'undefined') return BLOBTEX; const c = document.createElement('canvas'); c.width = c.height = 64; const a = c.getContext('2d'); if (!a || !a.createRadialGradient) return null;
  const gr = a.createRadialGradient(32, 32, 2, 32, 32, 31); gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.45, 'rgba(0,0,0,0.6)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); a.fillStyle = gr; a.fillRect(0, 0, 64, 64);
  BLOBTEX = new THREE.CanvasTexture(c); return BLOBTEX;
}
export function buildPeopleShadows() {
  const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2); const t = blobTex();
  const m = new THREE.MeshBasicMaterial({ name: 'CMB · People contact shadows', color: 0xffffff, map: t, transparent: true, opacity: BANKFX.blob, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6 });
  m.userData.own = true; const im = new THREE.InstancedMesh(geo, m, 16); im.name = 'bankPeopleShadows'; im.count = 0; im.frustumCulled = false; im.userData.noPart = true; return im;
}
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _w = new THREE.Vector3();
function updatePeople(room, P) {
  const im = room.fxPeople; if (!im) return; im.visible = level() >= 1; if (!im.visible) return; let n = 0;
  const add = (x, z, r) => { if (n >= 16) return; _m4.compose(_p.set(x, 0.006, z), _q.identity(), _s.set(r, 1, r)); im.setMatrixAt(n++, _m4); };
  const st = room.stand || {}; const people = [...(st.tellers || []), st.recep, st.mgr, st.sup, st.guard].filter(Boolean).map((p) => p.ch);
  for (const c of room.customers || []) if (c && c.on && c.ch) people.push(c.ch);
  for (const ch of people) { const r = ch && ch.root; if (!r || !r.visible || (ch.anim && ch.anim.seated)) continue; add(r.position.x, r.position.z, 0.78); }
  if (P && P.indoor === room.proxy && !P.vehicle) { room.g.worldToLocal(_w.set(P.x, P.y, P.z)); add(_w.x, _w.z, 0.8); }
  im.count = n; im.instanceMatrix.needsUpdate = true; im.material.opacity = BANKFX.blob;
}

// ------------------------------------------------------------------------------------------------ capture + per frame
const PROBE_LOCAL = new THREE.Vector3(0, 1.55, -5.4);
export function captureBankProbe(game, room) {
  const A = game.atmos, R = game.renderer, scene = game.scene; if (!A || !A.pmrem || !R || !room || !room.og) return false;
  const og = room.og; const hidden = []; const t0 = performance.now();
  for (const c of scene.children) if (c !== og && c.visible && !c.isLight) { c.visible = false; hidden.push(c); }
  for (const c of room.g.children) { let skin = false; c.traverse((o) => { if (o.isSkinnedMesh) skin = true; }); if (skin && c.visible) { c.visible = false; hidden.push(c); } }
  if (room.fxPeople && room.fxPeople.visible) { room.fxPeople.visible = false; hidden.push(room.fxPeople); }
  const ogVis = og.visible, sa = R.shadowMap.autoUpdate, ei = scene.environmentIntensity; og.visible = true; R.shadowMap.autoUpdate = false; scene.environmentIntensity = 0.1; BP.uBPOn.value = 0;
  // the light the hall has while someone is in it (Game.update's walk-in blend × this pass), whatever the loading screen had:
  // no sun through the roof, the dimmed sky fill, the room's own pool
  const L0 = [A.sun && A.sun.intensity, A.hemi && A.hemi.intensity, A.ambient && A.ambient.intensity];
  if (A.sun) A.sun.intensity = 0; if (A.hemi) A.hemi.intensity = 0.8 * BANKFX.hemi; if (A.ambient) A.ambient.intensity = (A.night || 0) * 0.85 * BANKFX.amb;
  let rt = null; try { og.updateMatrixWorld(true); const pos = og.localToWorld(PROBE_LOCAL.clone()); rt = A.pmrem.fromScene(scene, 0, 0.05, 40, { size: 256, position: pos }); }
  catch (e) { console.warn('[bankFX] probe capture failed', e); }
  finally { if (A.sun) A.sun.intensity = L0[0]; if (A.hemi) A.hemi.intensity = L0[1]; if (A.ambient) A.ambient.intensity = L0[2]; for (const c of hidden) c.visible = true; og.visible = ogVis; R.shadowMap.autoUpdate = sa; scene.environmentIntensity = ei; }
  if (!rt) return false; if (room.fxProbe) room.fxProbe.dispose(); room.fxProbe = rt; room.fxProbeNight = A.night || 0;
  // the room box for the parallax correction (local frame of og; the hall's group sits at og's origin)
  const b = room.bounds; BP.uBPMin.value.set(b.x0, 0, b.z0); BP.uBPMax.value.set(b.x1, room.H || 3.6, b.z1 + 0.25); BP.uBPProbe.value.copy(PROBE_LOCAL);
  BP.uBPRot.value.setFromMatrix4(og.matrixWorld).invert(); og.getWorldPosition(BP.uBPOrigin.value);
  BANKFX.captured = +(performance.now() - t0).toFixed(1); return true;
}

let active = false, savedEnv = null;
// once per frame (Game.update, after the indoor light blend): swap the environment while the player is in the hall
export function updateBankFX(game) {
  const W = game.interiors && game.interiors.walkIn; const s = W && W.siteById ? W.siteById('bank') : null; const room = s && s.room; const P = game.player;
  const inside = !!(room && P && P.indoor === room.proxy && room.fxProbe);
  if (room && room.visible) updatePeople(room, P);
  if (inside) {
    const A = game.atmos; if (room.fxProbe && Math.abs((A.night || 0) - room.fxProbeNight) > 0.45 && !room.fxRecap) { room.fxRecap = true; captureBankProbe(game, room); room.fxRecap = false; }
    if (!active) { active = true; savedEnv = game.scene.environment; }
    game.scene.environment = room.fxProbe.texture; game.scene.environmentIntensity = BANKFX.env; BP.uBPOn.value = level() >= 1 ? 1 : 0;
    // the probe is the room's indirect light now: the sky-coloured fill (hemisphere / ambient) steps back, the pool a little
    if (A.hemi) A.hemi.intensity *= BANKFX.hemi; if (A.ambient) A.ambient.intensity *= BANKFX.amb; room.lightK = BANKFX.pool;
  } else if (active) {
    active = false; BP.uBPOn.value = 0; const A = game.atmos; game.scene.environment = A && A.envRT ? A.envRT.texture : savedEnv; savedEnv = null; if (room) room.lightK = 1;
  }
}
if (typeof window !== 'undefined') window.__bankFX = BANKFX;
