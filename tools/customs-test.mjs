// Colombo Customs — Node regression test (no browser): catalogue rules, police / emergency exclusion, applying / previewing /
// restoring mods on real vehicle meshes of every customisable type, material / buffer bookkeeping over many previews, and release.
// Usage: node tools/customs-test.mjs [type ...]
import './node-dom-stub.mjs';
globalThis.localStorage ??= { getItem: () => null, setItem: () => {}, removeItem: () => {} };
const VM = await import('../src/vehicles/VehicleModels.js');
const CC = await import('../src/customs/CustomsCatalog.js');
const CA = await import('../src/customs/CustomsApply.js');
let pass = 0, fail = 0; const ok = (c, ...m) => { if (c) pass++; else { fail++; console.log('FAIL', ...m); } };
let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

// ---- exclusion: police / emergency / service vehicles have no profile, no slots, no categories, no prices
for (const t of Object.keys(VM.VTYPES)) { const T = VM.VTYPES[t]; if (T.police || T.ambulance || T.tow) { ok(!CC.profileOf(t), 'profile for excluded', t); ok(CC.slotsFor(t).length === 0, 'slots for excluded', t); ok(CC.categoriesFor(t).length === 0, 'cats for excluded', t); ok(CC.priceOf(t, 'engine', 'l1') === Infinity, 'price for excluded', t); ok(!CC.tuneOf(t, { engine: 'l4' }), 'tune for excluded', t); } }
ok(CC.excludedTypes().includes('police') && CC.excludedTypes().includes('ambulance'), 'police/ambulance not excluded');
// ---- categories by kind: bikes never see car parts, tuk-tuks no turbo, EVs no exhaust
for (const t of CC.customizableTypes()) { const P = CC.profileOf(t), sl = CC.slotsFor(t).map((s) => s.id);
  if (P.kind === 'bike') ok(!sl.includes('turbo') && !sl.includes('armour') && !sl.includes('bulletproof') && !sl.includes('wsize'), 'car slot on bike', t, sl.join(','));
  if (P.kind === 'tuk') ok(!sl.includes('turbo'), 'turbo on tuk', t); if (P.ev) ok(!sl.includes('exhaust'), 'exhaust on EV', t);
  const tn = CC.tuneOf(t, { engine: 'l4', turbo: 'l3', trans: 'l3', exhaust: 'straight' }); ok(tn.accel <= 1.55 && tn.top <= 1.15, 'tune cap', t); }
// ---- prerequisite gating
ok(CC.effective({ rimCol: '#ff0000' }).rimCol === undefined && CC.effective({ rims: 'mesh', rimCol: '#ff0000' }).rimCol === '#ff0000', 'effective() gate');
ok(CC.sanitize('ventra', { engine: 'l9', turbo: 'l1', rims: 'nonsense', plateText: 'ab$c12345' }).engine === undefined && CC.sanitize('ventra', { plateText: 'ab$c12345' }).plateText === 'ABC1234', 'sanitize');

// ---- apply on real meshes
const pick = process.argv.slice(2).length ? process.argv.slice(2) : CC.customizableTypes();
const matsOf = (g) => { const out = new Map(); g.traverse((o) => { if (o.isMesh) out.set(o, [o.material, o.geometry]); }); for (const w of g.userData.wheels || []) { const u = w.userData; for (const grp of [u.lo, u.hi]) for (const o of grp.children) out.set(o, [o.material, o.geometry]); if (u.cal) out.set(u.cal, [u.cal.material, u.cal.geometry]); } return out; };
for (const t of pick) {
  const g = VM.createVehicleMesh(t, 11); const T = VM.VTYPES[t]; const v = { mesh: g, type: t, T, lights: true, parked: false, player: true };
  // the vehicle is customised (custom look) before the "before" snapshot: wearing the custom look itself changes buffers by design
  CA.applyMods(v, {}); const before = matsOf(g); const bake0 = g.userData.bake ? { ...g.userData.bake.mats } : null; const wheelX = (g.userData.wheels || []).map((w) => w.position.x); const nChildren = g.children.length;
  const S = CA.lookScan(v); const slots = CC.slotsFor(t, S);
  // a full build: the most expensive option of every slot + colours
  const full = {}; for (const s of slots) full[s.id] = s.kind === 'colour' ? '#3a7aff' : s.options[s.options.length - 1].id; full.plateText = 'SHAUN';
  const shown = CA.applyMods(v, full, { preview: true });
  const C = g.userData.cust; ok(!!C, t, 'no cust state');
  const P = CC.profileOf(t); const wantParts = ['frontBumper', 'rearBumper', 'skirts', 'spoiler', 'hood', 'fenders', 'roof', 'mudflaps', 'screen', 'cowl', 'sliders', 'crashbars', 'guard', 'exhaust', 'aux', 'bedcover'].some((k) => shown[k] && shown[k] !== 'stock' && shown[k] !== 'none');
  ok(!wantParts || Object.keys(C.parts).length > 0, t, 'parts missing');
  if (shown.rims && shown.rims !== 'stock') { const u = g.userData.wheels[0].userData; ok(u.lo.children[1].material === C.rim && u.hi.children[1].material === C.rim, t, 'rim material'); }
  if (shown.tint && shown.tint !== 'stock') ok(VM.vehicleMeshesNamed(g, 'glass').every((m) => m.material.name === 'vglass-tint'), t, 'tint');
  if (P.kind === 'car' && shown.brakes && shown.brakes !== 'stock') ok(g.userData.wheels.every((w) => w.userData.cal && w.userData.cal.material === C.cal), t, 'calipers');
  if (shown.fenders === 'wide') ok(g.userData.wheels.every((w, i) => Math.abs(Math.abs(w.position.x) - Math.abs(wheelX[i]) - 0.015) < 1e-6), t, 'track');
  // 300 random preview steps: the per-vehicle material set stays bounded (no leak per step)
  let maxOwn = 0; for (let k = 0; k < 300; k++) { const s = slots[(rnd() * slots.length) | 0]; const m = { ...full }; m[s.id] = s.kind === 'colour' ? '#' + ((rnd() * 0xffffff) | 0).toString(16).padStart(6, '0') : s.options[(rnd() * s.options.length) | 0].id; CA.applyMods(v, m, { preview: true }); maxOwn = Math.max(maxOwn, C.own.size); }
  ok(maxOwn <= 12, t, 'own materials grew to', maxOwn);
  // back to stock: every mesh has its original material + geometry again, wheels back in place, no extra children
  CA.applyMods(v, {}); const after = matsOf(g); let diff = 0; for (const [o, [m0, g0]] of before) { const a = after.get(o); if (!a || a[0] !== m0 || a[1] !== g0) { diff++; if (diff < 4) console.log('   diff', t, o.name, a ? (a[0] !== m0 ? 'material ' + (m0 && m0.name) + '→' + (a[0] && a[0].name) : 'geometry') : 'gone'); } }
  ok(diff === 0, t, 'stock restore differs on', diff, 'meshes');
  ok(g.children.length === nChildren, t, 'children', nChildren, '→', g.children.length);
  if (bake0) ok(Object.keys(bake0).every((k) => g.userData.bake.mats[k] === bake0[k]), t, 'bake mats not restored');
  ok((g.userData.wheels || []).every((w, i) => w.position.x === wheelX[i]), t, 'wheel x not restored');
  // kept for reuse while the vehicle stays customised (bounded; freed on release): its paint, one rim, one caliper and one aux-lamp material
  ok([...C.own].every((m) => /^(vpaint-custom|cw-rim|cust-lamp)$/.test(m.name)) && C.own.size <= 4, t, 'own after stock', C.own.size, [...C.own].map((m) => m.name).join(','));
  // install → tune present; release frees everything
  CA.installMods(v, { engine: 'l1', exhaust: shown.exhaust || undefined }); ok(v.tune && v.tune.accel > 1, t, 'tune after install');
  const own = [...C.own]; let disposed = 0; for (const m of own) m.addEventListener('dispose', () => disposed++); C.release(); ok(disposed === own.length && !g.userData.cust && !CA.CUSTOM_LIVE.has(v), t, 'release', disposed, '/', own.length);
}
console.log(`customs-test: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
