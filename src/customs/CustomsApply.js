// COLOMBO CUSTOMS — puts a mod record on a live vehicle (the one parked in the bay for the preview, or an owned vehicle spawned
// from the garage). Idempotent: applyMods(v, mods) can be called for every preview step; each subsystem compares its own inputs
// with what it applied last time and does nothing when they are unchanged, so turning a colour wheel is a uniform write, cycling
// wheels swaps two geometry pointers per wheel, and a body part swaps the geometry of at most six meshes. Nothing is rebuilt from
// scratch, no second preview vehicle is ever created, and every per-vehicle material is released with the vehicle.
//
// What lives where on the vehicle:
//   body paint            → the vehicle's own 'vpaint-custom' material on every 'paint' mesh (body, detail, real LODs, doors)
//   glass / trim / plate  → per-vehicle clones on the 'glass' / 'chrome' / 'plate' meshes (tint film, chrome delete, vanity text)
//   cabin                 → a clone of the interior material whose emissive follows the lights (night ambient lighting)
//   add-on parts          → up to six meshes directly under the vehicle group, named like the body materials ('paint', 'carbon',
//                           'rubber', 'chrome', 'glass', 'vlight') so the wreck pass chars them like everything else
//   wheels                → the tyre / rim meshes already inside each wheel get new geometry + material (no extra meshes); the
//                           performance caliper reuses (or adds, near LOD only) the caliper mesh on the pivot
//   lamps                 → the vehicle's own head / tail materials; the pooled real headlight beam reads userData.beamCol
//   underglow             → two neon strips under the sills + one additive glow on the road, lit with the headlights
import * as THREE from 'three';
import { vehicleMaterials, vehicleMeshesNamed, customizeMesh, tintCustom } from '../vehicles/VehicleModels.js';
import { tyreMaterial } from '../vehicles/TyreMaterial.js';
import { scanVehicle } from './BodyScan.js';
import { profileOf, effective, tuneOf, plateText } from './CustomsCatalog.js';
import { makePaintMaterial, paintFrame, setPaint, tintGlass, trimMaterial, vanityPlateMaterial } from './CustomsPaint.js';
import { rimGeometry, tyreGeometry, tyreMat, caliperGeometry, makeRimMaterial, setRimMaterial } from './CustomsWheels.js';
import { buildParts } from './CustomsParts.js';
import { MeshBuilder } from '../gfx/MeshBuilder.js';

export const CUSTOM_LIVE = new Set(); // vehicles wearing a custom look (the per-frame lamp pass only walks these)
const PART_KEYS = [['paint', 'paint'], ['carbon', 'carbon'], ['black', 'rubber'], ['chrome', 'chrome'], ['glass', 'glass'], ['lamp', 'vlight']];
const HEAD = { led: [0xeef4ff, 0xf2f7ff], xenon: [0xcadcff, 0xd8e6ff], yellow: [0xffc23a, 0xffd27a] }; // lens emissive, real beam colour
const RIM_DEFAULT = { steelie: '#1a1b1d', trucker: '#d4d8dc', beadlock: '#2a2c30' };
const key = (...a) => a.map((x) => (x == null ? '' : String(x))).join('|');

// the vehicle's customisation state, created on first use (wears the custom look; invisible: same colour as before)
function state(v) {
  const g = v.mesh, ud = g.userData; if (ud.cust) return ud.cust;
  customizeMesh(g, ud.color); const S = scanVehicle(g), P = profileOf(ud.type), M = vehicleMaterials().mats;
  const C = { S, P, F: paintFrame(S), paint: makePaintMaterial(), last: {}, own: new Set(), origMesh: new Map(), origName: {}, parts: {}, wheel: null, cal: null, rim: null, glow: null, lamp: null, cabin: null, plate: null, lit: -1 };
  C.origName.paint = ud.bake ? ud.bake.mats.paint : null; C.exhaust0 = ud.exhaust;
  C.head0 = ud.headMat ? ud.headMat.emissive.clone() : null; C.tail0 = ud.tailMat ? [ud.tailMat.color.clone(), ud.tailMat.emissive.clone()] : null;
  setNamed(C, g, 'paint', C.paint); C.own.add(C.paint);
  C.release = () => release(v); ud.cust = C; CUSTOM_LIVE.add(v); void M; return C;
}
// put a material on every mesh of a body material name (+ the bake table door meshes are built from later); remembers the originals
function setNamed(C, g, name, mat) {
  const ud = g.userData; for (const m of vehicleMeshesNamed(g, name)) { if (!C.origMesh.has(m)) C.origMesh.set(m, m.material); m.material = mat || C.origMesh.get(m); }
  if (ud.bake && (name in ud.bake.mats || mat)) { if (!(name in C.origName)) C.origName[name] = ud.bake.mats[name]; ud.bake.mats[name] = mat || C.origName[name]; }
}
// a per-vehicle variant of each distinct original material on that name (e.g. body glass and detail glass differ)
function setNamedVariant(C, g, name, make) {
  const made = new Map(); const ud = g.userData;
  for (const m of vehicleMeshesNamed(g, name)) { if (!C.origMesh.has(m)) C.origMesh.set(m, m.material); const o = C.origMesh.get(m); if (!o) continue; let n = made.get(o); if (n === undefined) { n = make(o); made.set(o, n); if (n !== o) C.own.add(n); } m.material = n; }
  if (ud.bake && ud.bake.mats[name]) { if (!(name in C.origName)) C.origName[name] = ud.bake.mats[name]; const o = C.origName[name]; let n = made.get(o); if (n === undefined) { n = make(o); made.set(o, n); if (n !== o) C.own.add(n); } ud.bake.mats[name] = n; }
  return made;
}
function dropOwn(C, mats) { for (const m of mats) if (m && C.own.has(m) && m !== C.paint) { C.own.delete(m); if (m.map && m.name === 'plate-vanity') m.map.dispose(); m.dispose(); } }

// ------------------------------------------------------------------------------------------------ public
// apply a full mod record (installed or previewed). Returns the effective record actually shown.
export function applyMods(v, mods, opts = {}) {
  const C = state(v), g = v.mesh, ud = g.userData, m = effective(mods || {}); const L = C.last;
  // paint (uniforms) + body-colour trim meshes (tuk-tuk canvas etc.)
  const c1 = m.paint1 || ud.color || '#ffffff';
  const pk = key(c1, m.paint2, m.finish, m.zone, m.livery, m.decal); if (L.paint !== pk) { setPaint(C.paint, { c1, c2: m.paint2 || '#151517', finish: m.finish, zone: m.zone, livery: m.livery, decal: m.decal }, C.F); L.paint = pk; }
  if (L.tintHex !== c1 && (opts.commit || !opts.preview)) { tintCustom(g, c1); L.tintHex = c1; } // a respray of the few body-colour non-paint meshes: only on commit / spawn (it copies buffers)
  // glass tint
  const tk = m.tint || 'stock'; if (L.tint !== tk) { const prev = [...C.own].filter((x) => x.name === 'vglass-tint'); setNamedVariant(C, g, 'glass', (o) => (tk === 'stock' ? o : tintGlass(o, tk))); dropOwn(C, prev); L.tint = tk; }
  // brightwork
  const tr = m.trim || 'stock'; if (L.trim !== tr) { const prev = [...C.own].filter((x) => x.name === 'vchrome-delete'); setNamedVariant(C, g, 'chrome', (o) => (tr === 'stock' ? o : trimMaterial(o, tr))); dropOwn(C, prev); L.trim = tr; }
  // plates
  const pt = m.plate === 'vanity' ? plateText(m.plateText) || 'CUSTOM' : null; if (L.plate !== pt) { const prev = C.plate; C.plate = pt ? vanityPlateMaterial(pt) : null; if (C.plate) C.own.add(C.plate); setNamed(C, g, 'plate', C.plate); if (prev) dropOwn(C, [prev]); L.plate = pt; }
  // cabin ambient lighting
  const cb = m.cabin && m.cabin !== 'stock' ? m.cabin : null; if (L.cabin !== cb) { const prev = C.cabin; C.cabin = null; if (cb) { const made = setNamedVariant(C, g, 'interior', (o) => { const n = o.clone(); n.name = 'vinterior-amb'; n.emissive = new THREE.Color(cb); n.emissiveIntensity = 0; return n; }); C.cabin = [...made.values()]; } else setNamed(C, g, 'interior', null); if (prev) dropOwn(C, prev); C.lit = -1; L.cabin = cb; }
  // add-on parts
  partsOf(C, v, m);
  // wheels + calipers + track
  wheelsOf(C, v, m);
  // lamps
  const hd = m.head && HEAD[m.head] ? m.head : null; if (L.head !== hd && ud.headMat) { if (hd) ud.headMat.emissive.setHex(HEAD[hd][0]); else ud.headMat.emissive.copy(C.head0); ud.beamCol = hd ? HEAD[hd][1] : undefined; L.head = hd; }
  const tl = m.tail && m.tail !== 'stock' ? m.tail : null; if (L.tail !== tl && ud.tailMat && C.tail0) { const [c0, e0] = C.tail0; ud.tailMat.color.copy(c0); ud.tailMat.emissive.copy(e0);
    if (tl === 'smoked') { ud.tailMat.color.multiplyScalar(0.28); ud.tailMat.emissive.multiplyScalar(0.8); } else if (tl === 'bright') { ud.tailMat.color.lerp(new THREE.Color(1, 1, 1), 0.12); ud.tailMat.emissive.setRGB(e0.r * 1.55, e0.g * 1.25, e0.b * 1.25); } L.tail = tl; }
  glowOf(C, v, m.glow && m.glow !== 'none' ? m.glow : null);
  C.preview = !!opts.preview; C.mods = m; return m;
}
// install for real: the record becomes the vehicle's own (physics tune, audio, smoke) and the look is applied
export function installMods(v, mods) { const m = applyMods(v, mods, { commit: true }); v.mods = { ...mods }; v.tune = tuneOf(v.type, mods); return m; }
// restore the installed record after a preview (free: nothing is charged, nothing persists)
export function restoreInstalled(v) { applyMods(v, v.mods || {}, { preview: false }); v.tune = v.mods ? tuneOf(v.type, v.mods) : null; }
export function lookScan(v) { return state(v).S; }


// ------------------------------------------------------------------------------------------------ parts
function partsOf(C, v, m) {
  const g = v.mesh, ud = g.userData; const out = buildParts(C.S, C.P, m); if (C.last.parts === out && C.last.screen === m.screen) return; C.last.parts = out; C.last.screen = m.screen;
  const M = vehicleMaterials().mats;
  for (const [k, name] of PART_KEYS) { const geo = out[k]; let mesh = C.parts[k];
    if (!geo) { if (mesh) { g.remove(mesh); delete C.parts[k]; } continue; }
    if (!mesh) { mesh = new THREE.Mesh(geo, M.vchrome); mesh.name = name; mesh.userData.custPart = true; mesh.castShadow = k !== 'glass' && k !== 'lamp'; mesh.receiveShadow = k === 'paint'; if (k === 'glass') mesh.renderOrder = 2; mesh.matrixAutoUpdate = false; mesh.updateMatrix(); g.add(mesh); C.parts[k] = mesh; }
    mesh.geometry = geo;
    mesh.material = k === 'paint' ? C.paint : k === 'carbon' ? M.vcarbon : k === 'black' ? M.vrubber : k === 'chrome' ? M.vchrome : k === 'glass' ? screenGlass(C, M, m.screen) : lampMat(C, M); }
  const tip = out.tip; ud.exhaust = tip && C.exhaust0 ? { ...C.exhaust0, p: tip.slice() } : tip ? { p: tip.slice(), d: [0, 0, -1], fuel: C.P.diesel ? 'dieselLight' : 'petrol' } : C.exhaust0; v.smokeDirty = true;
}
function screenGlass(C, M, id) { if (id !== 'bubble') return M.vglass; if (!C.smoked) { C.smoked = tintGlass(M.vglass, 'dark'); C.own.add(C.smoked); } return C.smoked; }
function lampMat(C, M) { if (!C.lamp) { C.lamp = M.vlight.clone(); C.lamp.name = 'cust-lamp'; C.lamp.emissive.setHex(0xf2f6ff); C.lamp.emissiveIntensity = 0.05; C.own.add(C.lamp); C.lit = -1; } return C.lamp; }

// ------------------------------------------------------------------------------------------------ wheels
function wheelsOf(C, v, m) {
  const g = v.mesh, ud = g.userData, P = C.P, T = v.T; const W = ud.wheels || []; if (!W.length) return;
  const rims = m.rims && m.rims !== 'stock' ? m.rims : null, tyres = m.tyres || 'stock', size = rims ? m.wsize || 'stock' : 'stock';
  const lvl = P.kind === 'car' && m.brakes && m.brakes[0] === 'l' ? +m.brakes.slice(1) || 0 : 0;
  const wk = key(rims, tyres, size, lvl, m.rimCol, m.rimFin, m.calCol, m.fenders === 'wide'); if (C.last.wheels === wk) return; C.last.wheels = wk;
  const kind = P.kind === 'bike' ? 'bike' : P.klass === 'truck' ? 'heavy' : 'car'; const R = T.wheelR; const widths = (ud.custom && ud.custom.wheels) || [];
  const ri = P.kind === 'bike' ? 0.8 : kind === 'heavy' ? 0.66 : 0.66 + (size === 'p1' ? 0.05 : size === 'p2' ? 0.1 : 0);
  if (rims && !C.rim) { C.rim = makeRimMaterial(); C.own.add(C.rim); }
  if (rims) setRimMaterial(C.rim, m.rimCol || RIM_DEFAULT[rims] || '#c9ccd0', m.rimFin || (rims === 'trucker' ? 'chrome' : 'paint'));
  if (lvl && !C.cal) { C.cal = makeRimMaterial(); C.own.add(C.cal); }
  if (lvl) setRimMaterial(C.cal, m.calCol || (lvl >= 2 ? '#b81c1c' : '#2c2e32'), 'paint');
  if (!C.wheel) C.wheel = W.map((w) => { const u = w.userData; const lo = u.lo.children, hi = u.hi.children; return { x: w.position.x, lo: [lo[0].geometry, lo[0].material, lo[1].geometry, lo[1].material], hi: [hi[0].geometry, hi[0].material, hi[1].geometry, hi[1].material], cal: u.cal ? [u.cal.geometry, u.cal.material] : null, addedCal: null }; });
  W.forEach((w, i) => { const u = w.userData, O = C.wheel[i]; const lo = u.lo.children, hi = u.hi.children; const wd = (widths[i] && widths[i][3]) || O.lo[0].boundingBox?.max.x * 2 || 0.2;
    if (rims) { for (const [ms, h] of [[lo, false], [hi, true]]) { const tg = tyreGeometry(R, wd, ri, tyres, P.kind === 'bike', h); ms[0].geometry = tg; ms[0].material = tyreMat(tg, tyres); ms[1].geometry = rimGeometry(rims, R, wd, ri, kind, u.front, h); ms[1].material = C.rim; } }
    else { lo[0].geometry = O.lo[0]; lo[1].geometry = O.lo[2]; lo[1].material = O.lo[3]; hi[0].geometry = O.hi[0]; hi[1].geometry = O.hi[2]; hi[1].material = O.hi[3];
      lo[0].material = tyres === 'stock' ? O.lo[1] : tyreMaterial(O.lo[0], TREADK[tyres] || 0); hi[0].material = tyres === 'stock' ? O.hi[1] : tyreMaterial(O.hi[0], TREADK[tyres] || 0); }
    // performance calipers (cars)
    if (lvl) { const cg = caliperGeometry(R, wd, ri, lvl, kind);
      if (u.cal && !O.addedCal) { u.cal.geometry = cg; u.cal.material = C.cal; }
      else if (!u.cal) { const c = new THREE.Mesh(cg, C.cal); c.name = 'cust-cal'; if (O.x < 0) c.rotation.y = Math.PI; c.updateMatrix(); c.matrixAutoUpdate = false; c.userData.host = w; u.cal = c; O.addedCal = c; c.visible = !!ud.lodNear; if (ud.lodNear) w.add(c); }
      else { u.cal.geometry = cg; u.cal.material = C.cal; } }
    else if (O.addedCal) { if (O.addedCal.parent) O.addedCal.parent.remove(O.addedCal); if (u.cal === O.addedCal) u.cal = null; O.addedCal = null; }
    else if (u.cal && O.cal) { u.cal.geometry = O.cal[0]; u.cal.material = O.cal[1]; }
    // widebody: the track widened to fill the arches
    w.position.x = O.x + (m.fenders === 'wide' ? Math.sign(O.x) * 0.015 : 0); });
}
const TREADK = { stock: 0, sport: 0, semi: 3, at: 1, mt: 2 };

// ------------------------------------------------------------------------------------------------ underglow
let glowTex = null;
function glowTexture() { if (glowTex) return glowTex; const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); const gr = x.createRadialGradient(32, 32, 2, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gr; x.fillRect(0, 0, 64, 64); glowTex = new THREE.CanvasTexture(c); return glowTex; }
const stripCache = new Map();
function stripGeo(S) { let g0 = stripCache.get(S.key); if (g0) return g0; const mb = new MeshBuilder(); const box = new THREE.BoxGeometry(1, 1, 1); const wf = S.axles.wf - S.wheelR * 1.15, wr = S.axles.wr + S.wheelR * 1.15; const y = (S.sill ? S.sill.y : S.wheelR * 0.9) - 0.025;
  for (const sx of [-1, 1]) { const x = sx * ((S.sill ? S.sill.xAt((wf + wr) / 2) : S.hw) - 0.08); mb.geometry(box, new THREE.Matrix4().compose(new THREE.Vector3(x, y, (wf + wr) / 2), new THREE.Quaternion(), new THREE.Vector3(0.025, 0.02, Math.max(0.3, wf - wr))), [1, 1, 1]); }
  box.dispose(); g0 = mb.build(); stripCache.set(S.key, g0); return g0; }
function glowOf(C, v, hex) {
  if (C.last.glow === hex) return; C.last.glow = hex; const g = v.mesh, S = C.S;
  if (!hex) { if (C.glow) { const G = C.glow; if (G.strip) { g.remove(G.strip); G.strip.material.dispose(); } g.remove(G.pool); G.pool.material.dispose(); C.glow = null; } return; }
  if (!C.glow) { let strip = null; if (C.P.kind !== 'bike') { /* two-wheelers: no sills to hide a tube under; the glow on the road is the effect */ const sm = new THREE.MeshBasicMaterial({ color: 0x000000, toneMapped: false }); sm.name = 'cust-glow-strip'; strip = new THREE.Mesh(stripGeo(S), sm); strip.name = 'cust-glow'; strip.matrixAutoUpdate = false; strip.updateMatrix(); g.add(strip); }
    const pm = new THREE.MeshBasicMaterial({ map: glowTexture(), color: 0x000000, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }); pm.name = 'cust-glow-pool';
    const pool = new THREE.Mesh(POOL_GEO, pm); pool.name = 'cust-glowpool'; pool.renderOrder = 1; pool.raycast = () => {}; const len = (S.zF - S.zR) * 1.05, wid = S.hw * 2 + (C.P.kind === 'bike' ? 1.1 : 0.9); pool.scale.set(wid, 1, len); pool.position.set(0, 0.03, (S.zF + S.zR) / 2); pool.matrixAutoUpdate = false; pool.updateMatrix(); pool.visible = false;
    g.add(pool); C.glow = { strip, pool, col: new THREE.Color() }; }
  C.glow.col.set(hex); C.lit = -1;
}
const POOL_GEO = (() => { const p = new THREE.PlaneGeometry(1, 1); p.rotateX(-Math.PI / 2); return p; })();

// ------------------------------------------------------------------------------------------------ per frame
// lamps that follow the vehicle's own lights: underglow, aux lamp lenses, cabin ambient. Only customised vehicles are visited, and a
// material is only touched when its state changes (lights switched, night fell, the preview forced them on).
export function updateCustoms(night) {
  for (const v of CUSTOM_LIVE) { const C = v.mesh.userData.cust; if (!C) continue; const occupied = !v.parked || v.player;
    const on = C.forceLights || (v.lights && occupied && !v.headOut && !v.wrecked); const lv = (on ? 1 : 0) + (occupied && night > 0.3 ? 2 : 0) + (C.forceLights ? 4 : 0) + Math.round(night * 4) * 8;
    if (lv === C.lit) continue; C.lit = lv;
    if (C.glow) { const k = on ? 1 : 0; if (C.glow.strip) C.glow.strip.material.color.copy(C.glow.col).multiplyScalar(on ? 2.2 : 0.06); C.glow.pool.material.color.copy(C.glow.col).multiplyScalar(k * (0.35 + 0.65 * night)); C.glow.pool.visible = on; }
    if (C.lamp) C.lamp.emissiveIntensity = on ? 2.4 : 0.05;
    if (C.cabin) { const e = C.forceLights ? 0.5 : occupied && night > 0.3 ? 0.35 * night : 0; for (const m of C.cabin) m.emissiveIntensity = e; } }
}
export function setPreviewLights(v, on) { const C = v.mesh.userData.cust; if (C) { C.forceLights = !!on; C.lit = -1; } }

// ------------------------------------------------------------------------------------------------ release
function release(v) {
  const g = v.mesh, ud = g.userData, C = ud.cust; if (!C) return; CUSTOM_LIVE.delete(v);
  if (C.glow) { if (C.glow.strip) C.glow.strip.material.dispose(); C.glow.pool.material.dispose(); }
  for (const m of C.own) { if (m.map && m.name === 'plate-vanity') m.map.dispose(); m.dispose(); } C.own.clear(); ud.cust = null;
}
// shader warm-up meshes for Game.shaderWarmSet (glow strip / pool programs)
export function customsWarmMeshes() {
  const sm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), new THREE.MeshBasicMaterial({ color: 0x000000, toneMapped: false })); sm.name = 'cg-warm-strip';
  const pm = new THREE.Mesh(POOL_GEO, new THREE.MeshBasicMaterial({ map: glowTexture(), color: 0x000000, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })); pm.name = 'cg-warm-pool';
  return [sm, pm];
}
