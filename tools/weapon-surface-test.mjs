// Weapon realism test (Node): the REAL WeaponModels / WeaponSurface code.
//  · every weapon material carries its procedural finish (machined metal, blued steel, brass, varnished wood grain, stippled polymer, rubber);
//  · the shader patch lands at the right anchors of three's standard / physical shaders, and each kind gets its own program key;
//  · wooden furniture is clear-coated physical material;
//  · each of the 10 guns gained modelled hardware (screws, pins, bolts, knurling) compared with the committed models, without
//    growing its outline (everything sits flush on a surface) and with no NaN in any vertex.
import './node-dom-stub.mjs';
import * as THREE from 'three';
import { execSync } from 'node:child_process';
import { writeFileSync, rmSync } from 'node:fs';
import { WEAPONS, POLICE_T56 } from '../src/combat/WeaponDefs.js';
import * as NEW from '../src/combat/WeaponModels.js';
import { SURFACE_KINDS } from '../src/combat/WeaponSurface.js';

let pass = 0, fail = 0;
const ok = (c, msg) => { if (c) pass++; else { fail++; console.log('FAIL', msg); } };

// 1. materials -------------------------------------------------------------------------------------------------------------
const M = NEW.weaponMaterials();
const want = { metal: 'metal', steel: 'steel', blued: 'blued', brass: 'brass', poly: 'poly', polyTan: 'poly', polyOlive: 'poly', rubber: 'rubber', wood: 'wood', woodDark: 'wood', woodT56: 'wood', woodT56d: 'wood' };
for (const [k, kind] of Object.entries(want)) {
  ok(M[k] && M[k].userData.surface === kind, `material ${k} has surface ${kind} (got ${M[k] && M[k].userData.surface})`);
  if (kind === 'wood') ok(M[k].isMeshPhysicalMaterial && M[k].clearcoat > 0.3, `${k} is clear-coated physical material`);
  if (['metal', 'steel', 'blued', 'brass'].includes(kind)) ok(M[k].metalness >= 0.8, `${k} metalness ${M[k].metalness} >= 0.8`);
}
ok(M.slot && M.slot.color.getHex() < 0x111111, 'dark slot / socket material exists');
for (const k of ['lens', 'canvas']) ok(M[k] && !M[k].userData.surface, `${k} left untouched`);

// 2. shader patch ----------------------------------------------------------------------------------------------------------
const keys = new Set();
for (const [k, kind] of Object.entries(want)) {
  const lib = M[k].isMeshPhysicalMaterial ? THREE.ShaderLib.physical : THREE.ShaderLib.standard;
  const sh = { vertexShader: lib.vertexShader, fragmentShader: lib.fragmentShader, uniforms: THREE.UniformsUtils.clone(lib.uniforms) };
  M[k].onBeforeCompile(sh, null);
  const v = sh.vertexShader, f = sh.fragmentShader;
  ok(/varying vec3 vWsP;/.test(v) && /varying vec3 vWsP;/.test(f) && /vWsP = position;/.test(v), `${k}: object-space varyings declared + written`);
  const iBody = f.indexOf('wsBump(');
  const iMaps = f.indexOf('#include <normal_fragment_maps>'), iLight = f.indexOf('#include <lights_physical_fragment>');
  ok(iMaps >= 0 && iLight > iMaps, `${k}: anchors present`);
  const span = (src) => src.slice(src.indexOf('#include <normal_fragment_maps>'), src.indexOf('#include <lights_physical_fragment>'));
  const added = span(f).length - span(lib.fragmentShader).length; // the surface body is injected between the normal maps and lighting
  ok(iBody > 0 && added > 80 && /roughnessFactor/.test(span(f)), `${k}: surface body runs after the normal maps and before lighting (+${added} chars)`);
  ok(!/\bround\s*=/.test(f), `${k}: no variable shadows the GLSL builtin round()`);
  ok((f.match(/\{/g) || []).length === (f.match(/\}/g) || []).length, `${k}: braces balanced`);
  keys.add(M[k].customProgramCacheKey());
}
ok(keys.size === new Set(Object.values(want)).size, `one program key per surface kind (${keys.size})`);
ok(SURFACE_KINDS.length === 9 && SURFACE_KINDS.includes('carbon') && SURFACE_KINDS.includes('cast'), 'nine surface kinds (7 weapon + carbon, cast for the motorcycles)');

// 3. hardware vs the committed models ------------------------------------------------------------------------------------
const tmp = new URL('../src/combat/.__old_WeaponModels.js', import.meta.url);
// baseline = the models before the metal / wood / hardware rework (895e6af, the commit before it); override with WEAPON_BASE=<rev>
writeFileSync(tmp, execSync(`git show ${process.env.WEAPON_BASE || '895e6af'}:src/combat/WeaponModels.js`).toString());
let OLD;
try { OLD = await import(tmp.href); } finally { rmSync(tmp); }

function stats(g) {
  g.updateMatrixWorld(true); let tris = 0, nan = 0, slot = 0, steel = 0; const box = new THREE.Box3();
  g.traverse((o) => {
    if (!o.isMesh) return; const p = o.geometry.attributes.position, n = o.geometry.attributes.normal; const t = p.count / 3; tris += t;
    for (let i = 0; i < p.array.length; i++) if (!Number.isFinite(p.array[i])) nan++;
    if (n) for (let i = 0; i < n.array.length; i++) if (!Number.isFinite(n.array[i])) nan++;
    if (o.material.color && o.material.color.getHex() === 0x050505) slot += t; if (o.material.userData.surface === 'steel') steel += t;
    if (o.material.name !== 'lens') box.expandByObject(o);
  });
  return { tris, nan, slot, steel, box };
}
const defs = [...WEAPONS.filter((d) => d.cls !== 'melee' && d.cls), POLICE_T56];
for (const d of defs) {
  const isT = d === POLICE_T56;
  const a = stats(isT ? OLD.buildT56() : OLD.buildWeaponModel(d)), b = stats(isT ? NEW.buildT56() : NEW.buildWeaponModel(d));
  const grow = Math.max(...['x', 'y', 'z'].map((ax) => Math.max(a.box.min[ax] - b.box.min[ax], b.box.max[ax] - a.box.max[ax]))) * 1000;
  console.log(`${d.id.padEnd(9)} tris ${a.tris} -> ${b.tris} (+${b.tris - a.tris})  steel tris ${b.steel}  slots/sockets ${b.slot}  outline growth ${grow.toFixed(1)} mm`);
  ok(b.nan === 0, `${d.id}: no NaN`);
  ok(b.tris - a.tris >= 150, `${d.id}: gained modelled hardware (+${b.tris - a.tris} tris)`);
  ok(b.slot > 0, `${d.id}: has dark screw slots / sockets / pin holes`);
  ok(grow < 6, `${d.id}: hardware flush, outline grew ${grow.toFixed(1)} mm < 6`);
}

console.log(`\nweapon-surface-test: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
