// Model tools runtime (68th): applies model-pack/manifest.json to the game — in the built game / .exe as well as in development.
// Loaded at start-up only when the pack has model edits (boot.js), or by the model tools. What it applies:
//   weapons[id]    part edits of the procedural gun, a replacement model (own transform, parts, clips for idle / fire / reload),
//                  the spent case (model or colour / size), the ejection / muzzle points
//   vehicles[type] part edits (by material slot or mesh), a replacement body (wheels kept or replaced), replacement wheels,
//                  handling (VTYPES numbers: top speed, acceleration, mass, steering …), clip of the replacement
//   heroes[mh]     garment textures / colours (HeroBody), part edits, a replacement model driven by the game's skeleton (every
//                  game animation, IK and weapon pose carries over) or by the model's own clips, its own animation clips
//   npcs.rules     which pedestrians / police / staff (all, sex, preset, role, police, custom NPC) get a look override,
//                  part edits or a replacement model; chance per rule
//   anims          AnimRuntime clips: global (animation editor) and per target (hero / police / npc …)
import * as THREE from 'three';
import { HOOKS } from '../core/Hooks.js';
import { loadAsset, readyAsset } from './ModelPack.js';
import { applyParts, resetParts, attachReplacement, detachReplacement, garmentPatch, shellProto, tickMixers, playClip, editFor, buildEdited, hideOriginal, unhide, makeContainer } from './ModelEdit.js';
import { RigDriver, autoMap, bonesOf } from './Retarget.js';
import { weaponMaterials } from '../combat/WeaponModels.js';
import { VTYPES } from '../vehicles/VehicleModels.js';
import { BOATS } from '../boats/BoatCatalog.js';
import { WEAPONS, POLICE_T56 } from '../combat/WeaponDefs.js';
import { LIVE } from '../actors/Bodies.js';
import { LIVE_VEHICLES } from '../vehicles/Vehicle.js';

export const RT = { pack: null, game: null, drivers: new Map(), handling0: {}, specMemo: new WeakMap(), installed: false, stats: { weapons: 0, vehicles: 0, characters: 0 } };

// ------------------------------------------------------------------ assets
export function assetsOf(p) {
  const out = []; const add = (r) => { if (r && r.asset && r.asset.main) out.push(r.asset); };
  for (const e of Object.values(p.weapons || {})) { add(e.model); add(e.shell); }
  for (const e of Object.values(p.vehicles || {})) { add(e.model); add(e.wheel); }
  for (const e of Object.values(p.heroes || {})) add(e.model);
  for (const r of (p.npcs && p.npcs.rules) || []) if (r.on !== false) add(r.model);
  return out;
}
export async function preload(p) { await Promise.all(assetsOf(p).map((a) => loadAsset(a).catch((e) => console.warn('[model tools] not loaded:', a.main, e)))); }

export async function boot(game, pack) {
  RT.game = game; RT.pack = pack; await preload(pack); install(); applyHandling(); applyStats(); await applyAnimsNpcs(); refreshAll();
  console.info('[model tools] applied:', Object.keys(pack.weapons || {}).length, 'weapons,', Object.keys(pack.vehicles || {}).length, 'vehicles,', Object.keys(pack.heroes || {}).length, 'heroes,', ((pack.npcs && pack.npcs.rules) || []).length, 'NPC rules');
  return RT;
}
// the tools: a new document (after an edit) — re-applied to everything alive
export async function setPack(pack, { what = null } = {}) { RT.pack = pack; await preload(pack); install(); if (!what || what === 'vehicles') applyHandling(); if (!what || what === 'weapons') applyStats(); if (!what || what === 'anims' || what === 'npcs') await applyAnimsNpcs(); refreshAll(what); }

export function install() {
  if (RT.installed) return; RT.installed = true;
  HOOKS.weapon = (g, def) => { try { applyWeapon(g, def); } catch (e) { console.warn('[model tools] weapon', e); } };
  HOOKS.vehicle = (g, type) => { try { applyVehicle(g, type); } catch (e) { console.warn('[model tools] vehicle', e); } };
  HOOKS.character = (ch) => { try { applyCharacter(ch); } catch (e) { console.warn('[model tools] character', e); } };
  HOOKS.spec = (sp) => specFor(sp);
  HOOKS.weaponEvent = (g, kind) => { const c = g && g.userData.__repl; const e = g && g.userData.__wEntry; if (!c || !e || !e.model) return; const clips = e.model.clips || {}; if (clips[kind]) { playClip(c, clips[kind], e.model.clipSpeed ?? 1, { once: true }); c.userData.__back = 0.6; } };
  HOOKS.preRender.add(tick);
}
const _cam = new THREE.Vector3();
function tick(dt) {
  tickMixers(dt); const cam = RT.game && RT.game.camera; if (cam) _cam.setFromMatrixPosition(cam.matrixWorld);
  for (const [ch, D] of RT.drivers) {
    if (!ch.root.parent) { RT.drivers.delete(ch); continue; } let vis = true; for (let p = ch.root; p; p = p.parent) if (!p.visible) { vis = false; break; } if (!vis) continue;
    if (cam && ch.root.getWorldPosition(D.wp).distanceToSquared(_cam) > 90 * 90) continue;
    driveOne(ch, D);
  }
  for (const c of RETURN) { if (!c.parent) { RETURN.delete(c); continue; } if (c.userData.__back > 0 && (c.userData.__back -= dt) <= 0) { const e = c.userData.__entry; if (e && e.clip) playClip(c, e.clip, e.clipSpeed ?? 1); RETURN.delete(c); } }
}
const RETURN = new Set();
// one replaced character: follow the game skeleton (rig) or play the model's own clip for the current animation state
export function driveOne(ch, D = RT.drivers.get(ch)) {
  if (!D) return; if (D.mode === 'clips') { const key = stateOf(ch); const map = D.clips || {}; const name = map[key] || (key.startsWith('fight') ? map.fight : null) || (key.startsWith('seated') ? map.seated : null) || map.idle; if (name) playClip(D.c, name, D.speed); }
  else if (D.rig) D.rig.update();
  if ((D.rescan = (D.rescan || 0) + 1) % 45 === 0) hideOriginal(ch.root, { container: D.c, keep: D.keep }); // garments / accessories attached later
}
function stateOf(ch) { const a = ch.anim; if (!a) return 'idle'; if (a.seated) return a.seatMode ? 'seated:' + a.seatMode : 'seated'; const F = a.fight; if (F && F.w > 0.05) return F.move ? 'fight:' + F.move : 'fight'; if (a.action) return a.action; return a.speed < 0.3 ? 'idle' : a.runW > 0.5 ? 'run' : 'walk'; }

// ------------------------------------------------------------------ weapons
export function applyWeapon(g, def) {
  const e = RT.pack && RT.pack.weapons && RT.pack.weapons[def.id]; const ud = g.userData;
  if (ud.__wEntry) { resetParts(g); detachReplacement(g); ud.shellProto = null; if (ud.__pts0) for (const [k, v] of Object.entries(ud.__pts0)) if (ud[k] && ud[k].isVector3) ud[k].copy(v); ud.__wEntry = null; }
  if (!e) return; ud.__wEntry = e; RT.stats.weapons++;
  if (e.parts) applyParts(g, e.parts);
  if (e.model && e.model.asset) { const c = attachReplacement(g, e.model); c.userData.__entry = e.model; RETURN.add(c); }
  if (e.shell && (e.shell.asset || e.shell.color || e.shell.scale || e.shell.radius || e.shell.length)) ud.shellProto = shellProto(e.shell, weaponMaterials().brass);
  if (e.points) { ud.__pts0 ||= {}; for (const [k, v] of Object.entries(e.points)) { if (!ud[k] || !ud[k].isVector3 || !Array.isArray(v)) continue; if (!ud.__pts0[k]) ud.__pts0[k] = ud[k].clone(); ud[k].set(+v[0] || 0, +v[1] || 0, +v[2] || 0); } }
}
// ------------------------------------------------------------------ vehicles
const isWheel = (o) => { for (let p = o; p; p = p.parent) if (p.userData && p.userData.spin && p.userData.baseY !== undefined) return true; return false; };
export function applyVehicle(g, type) {
  const e = RT.pack && RT.pack.vehicles && RT.pack.vehicles[type]; const ud = g.userData;
  const groups = () => [g, ud.detail, ud.real && ud.real.mid, ud.real && ud.real.low].filter(Boolean);
  if (ud.__vEntry) { for (const G of groups()) { resetParts(G); unhide(G); } detachReplacement(g); for (const w of ud.wheels || []) { const c = w.userData.__wrepl; if (c) { c.parent && c.parent.remove(c); w.userData.__wrepl = null; } for (const o of [w.userData.lo, w.userData.hi, w.userData.cal]) if (o) unhide(o); } if (ud.bake && ud.__bakeMats0) { Object.assign(ud.bake.mats, ud.__bakeMats0); ud.__bakeMats0 = null; } ud.__vEntry = null; }
  if (!e) return; ud.__vEntry = e; RT.stats.vehicles++;
  if (e.parts) { for (const G of groups()) applyParts(G, e.parts); // door panels (DoorRig builds them later from bake.mats)
    if (ud.bake && ud.bake.mats) { ud.__bakeMats0 ||= Object.assign({}, ud.bake.mats); for (const [name, m] of Object.entries(ud.__bakeMats0)) { const ed = editFor(e.parts, name, { name }, m); if (ed) buildEdited(m, ed).then((nm) => { if (ud.__vEntry === e) ud.bake.mats[name] = nm; }); } } }
  if (e.model && e.model.asset) {
    const keepWheels = e.model.keepWheels !== false; const c = attachReplacement(g, e.model, { keepFn: (o) => (keepWheels && isWheel(o)) || o.name === 'contactShadow' }); c.userData.__entry = e.model;
    for (const G of [ud.detail, ud.real && ud.real.mid, ud.real && ud.real.low]) if (G) hideOriginal(G, {});
    if (ud.bake && ud.bake.mats) { ud.__bakeMats0 ||= Object.assign({}, ud.bake.mats); for (const k of Object.keys(ud.bake.mats)) ud.bake.mats[k] = new THREE.MeshBasicMaterial({ visible: false }); }
  }
  if (e.wheel && e.wheel.asset) for (const w of ud.wheels || []) {
    const spin = w.userData.spin; if (!spin) continue; for (const o of [w.userData.lo, w.userData.hi, w.userData.cal]) if (o) hideOriginal(o, {});
    const c = makeContainer(e.wheel); if (w.position.x < 0 && e.wheel.mirror !== false) c.scale.x *= -1; c.updateMatrix(); spin.add(c); w.userData.__wrepl = c;
    const inst = readyAsset(e.wheel.asset); const fill = (i) => { c.add(i.scene); if (e.wheel.parts) applyParts(c, e.wheel.parts, { skip: Object.assign(() => false, { inReplacement: true }) }); };
    if (inst) fill(inst); else loadAsset(e.wheel.asset).then(fill).catch(() => {});
  }
}
const handlingTables = () => [...Object.entries(VTYPES), ...Object.entries(BOATS).map(([k, v]) => ['boat:' + k, v])];
export function applyHandling() {
  for (const [type, T] of handlingTables()) { const e = RT.pack && RT.pack.vehicles && RT.pack.vehicles[type]; const h0 = RT.handling0[type];
    if (h0) { Object.assign(T, h0); delete RT.handling0[type]; }
    if (e && e.handling) { RT.handling0[type] = {}; for (const [k, v] of Object.entries(e.handling)) { const okNum = typeof T[k] === 'number' && typeof v === 'number' && Number.isFinite(v); const okCols = k === 'colors' && Array.isArray(v) && v.length && v.every((c) => /^#[0-9a-f]{6}$/i.test(c)); if (!okNum && !okCols) continue; RT.handling0[type][k] = T[k]; T[k] = okCols ? v.slice() : v; } } }
}
// weapon numbers (damage, rate of fire, magazine, range, recoil …) — WEAPONS defs are shared by the player, squad and police
const STATS0 = new Map();
export function applyStats() {
  for (const d of [...WEAPONS, POLICE_T56]) { const s0 = STATS0.get(d); if (s0) { Object.assign(d, s0); STATS0.delete(d); } const e = RT.pack && RT.pack.weapons && RT.pack.weapons[d.id]; if (!e || !e.stats) continue;
    const keep = {}; for (const [k, v] of Object.entries(e.stats)) { if (typeof d[k] !== 'number' || typeof v !== 'number' || !Number.isFinite(v)) continue; keep[k] = d[k]; d[k] = v; } STATS0.set(d, keep); }
}
// ------------------------------------------------------------------ characters
const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return ((h >>> 0) % 10000) / 10000; };
export function ruleMatches(r, sp) {
  if (!r || r.on === false || !sp || sp.hero) return false; const m = r.match || { who: 'all' }; const v = m.value;
  const ok = m.who === 'all' ? true : m.who === 'f' ? sp.sex === 'f' : m.who === 'm' ? sp.sex === 'm' : m.who === 'police' ? !!sp.police : m.who === 'civil' ? !sp.police : m.who === 'preset' ? sp.preset === v : m.who === 'role' ? sp.role === v : m.who === 'custom' ? sp._custom === v : m.who === 'profile' ? sp.profile === v : m.who === 'outfit' ? sp.outfit === v : false;
  if (!ok) return false; const ch = r.chance ?? 1; return ch >= 1 || hash(String(sp.seed ?? sp._k ?? '') + '|' + (sp.preset || '') + '|' + r.id) < ch;
}
export function rulesFor(sp) { return ((RT.pack && RT.pack.npcs && RT.pack.npcs.rules) || []).filter((r) => ruleMatches(r, sp)); }
export function specFor(sp) {
  if (!RT.pack || !sp) return sp; const looks = [];
  if (sp.hero && sp.mh) { const e = RT.pack.heroes && RT.pack.heroes[sp.mh]; if (e && e.look && Object.keys(e.look).length) looks.push(e.look); }
  else for (const r of rulesFor(sp)) if (r.look && Object.keys(r.look).length) looks.push(r.look);
  if (!looks.length) return sp; const key = JSON.stringify(looks); let memo = RT.specMemo.get(sp); if (memo && memo.key === key) return memo.sp;
  const out = Object.assign({}, sp); for (const L of looks) for (const [k, v] of Object.entries(L)) { if (v === '' || v == null) continue; if (k === 'heightK') out.height = (sp.height || 1.7) * v; else if (k === 'buildK') out.build = (sp.build || 1) * v; else out[k] = v; }
  RT.specMemo.set(sp, { key, sp: out }); return out;
}
export function entryFor(ch) { const sp = ch.spec || {}; if (sp.hero) return sp.mh && RT.pack && RT.pack.heroes ? RT.pack.heroes[sp.mh] || null : null; const rs = rulesFor(sp); if (!rs.length) return null; const out = {}; for (const r of rs) { if (r.parts) out.parts = Object.assign(out.parts || {}, r.parts); if (r.model && r.model.asset) out.model = r.model; } return out; }
export function applyCharacter(ch) {
  if (!ch || !ch.root) return; const D = RT.drivers.get(ch);
  if (ch.__mEntry) { resetParts(ch.root); detachReplacement(ch.root); if (D) RT.drivers.delete(ch); ch.__mEntry = null; }
  const e = entryFor(ch); if (!e) { if (ch.spec && ch.spec.hero && ch.mesh && Array.isArray(ch.mesh.material) && ch.mesh.material[0].userData.__gar) garmentPatch(ch, {}); return; }
  ch.__mEntry = e; RT.stats.characters++;
  if (ch.spec.hero) garmentPatch(ch, garmentsFor(ch, e));
  if (e.parts) applyParts(ch.root, e.parts);
  if (e.model && e.model.asset) attachCharacterModel(ch, e.model);
}
// hero garments: the general ones + the ones made for the wardrobe items the hero wears now (model-player: "only with this item")
export const WORN_SLOTS = ['top', 'pants', 'shoes', 'coat', 'hat', 'glasses'];
export function wornLook(ch) { const mh = ch.spec && ch.spec.mh; if (RT.previewLook && RT.previewLook.mh === mh) return RT.previewLook.look || {}; const st = RT.game && RT.game.story && RT.game.story.state; const o = st && st.outfits && st.outfits[mh]; return o && typeof o === 'object' ? o : {}; }
export function garmentsFor(ch, e) { const out = Object.assign({}, e.garments || {}); const look = wornLook(ch); for (const sl of WORN_SLOTS) { const id = look[sl]; const it = id && e.items && e.items[id]; if (it && it.garments) Object.assign(out, it.garments); } return out; }
export function attachCharacterModel(ch, r) {
  const keep = new Set(r.keep || []); const keepFn = (o) => keep.has(o.name) || (r.keepHead && /head/i.test(o.name || ''));
  const c = attachReplacement(ch.root, Object.assign({}, r, { clip: null }), { keepFn }); c.userData.__entry = r;
  const D = { c, mode: r.drive === 'clips' ? 'clips' : 'rig', clips: r.clips || {}, speed: r.clipSpeed ?? 1, rig: null, keep: keepFn, wp: new THREE.Vector3() };
  const setup = () => { const model = c.children[0]; if (!model) return;
    if (r.autoHeight !== false) { c.updateMatrixWorld(true); const bb = new THREE.Box3().setFromObject(model); const hgt = bb.max.y - bb.min.y; if (hgt > 0.05) { const want = (ch.spec.height || 1.72) * (r.heightK || 1); const k = want / hgt; model.scale.multiplyScalar(k); model.position.y -= bb.min.y * k; } }
    if (D.mode === 'rig') { const map = r.map && Object.keys(r.map).length ? r.map : autoMap(bonesOf(model).map((b) => b.name)); if (map.hips) { c.updateMatrixWorld(true); D.rig = new RigDriver(ch, c, model, map, { fix: r.fix }); } else D.mode = 'clips'; }
    RT.drivers.set(ch, D); };
  if (c.children[0]) setup(); else { const t = setInterval(() => { if (c.children[0] || !c.parent) { clearInterval(t); if (c.parent) setup(); } }, 100); }
  return c;
}
// ------------------------------------------------------------------ anims / custom NPCs from the pack
async function applyAnimsNpcs() {
  const p = RT.pack; if (!p) return;
  if (p.anims && ((p.anims.clips && Object.keys(p.anims.clips).length) || (p.anims.targets && Object.keys(p.anims.targets).length))) (await import('./AnimRuntime.js')).adoptPack(p.anims);
  if (p.npcs && Array.isArray(p.npcs.list) && p.npcs.list.length && RT.game) (await import('./NpcRuntime.js')).adoptPack(p.npcs, RT.game);
}
// ------------------------------------------------------------------ everything alive now
export function refreshAll(what = null) {
  const g = RT.game; RT.stats = { weapons: 0, vehicles: 0, characters: 0 };
  if (!what || what === 'weapons') { const W = g && g.weapons; if (W && W.built) for (const i of W.built) { const m = W.models[i]; const def = W.models && m && m.name && m.name.slice(7); if (m && def) applyWeapon(m, { id: def }); }
    if (g && g.scene) g.scene.traverse((o) => { if (/^weapon-/.test(o.name || '') && o.userData && !(W && W.built && W.built.some((i) => W.models[i] === o))) applyWeapon(o, { id: o.name.slice(7) }); }); }
  if (!what || what === 'vehicles') { for (const v of LIVE_VEHICLES) if (v.mesh) applyVehicle(v.mesh, v.type); if (g && g.trains && g.trains.trains) for (const t of g.trains.trains) (t.cars || []).forEach((car, i, all) => { const inner = car.children[0]; if (inner) applyVehicle(inner, i === 0 || i === all.length - 1 ? 'train:dmuCab' : 'train:dmuTrailer'); }); }
  if (!what || what === 'vehicles') if (g && g.scene) g.scene.traverse((o) => { const t = o.userData && o.userData.__vtype || (/^boat:/.test(o.name || '') && o.isGroup ? o.name : null); if (t) applyVehicle(o, t); });
  if (!what || what === 'heroes' || what === 'npcs' || what === 'player') for (const ch of LIVE) applyCharacter(ch);
}
