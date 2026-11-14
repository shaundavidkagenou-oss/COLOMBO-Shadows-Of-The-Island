// Street Customs — geometry sanity for every customisable type: wheels (all designs / treads / calipers), body scan, paint frame,
// and every bolt-on part option (triangles, NaNs, nothing below the road / outside the body envelope). Usage: node tools/customs-geometry-test.mjs [type ...]
import './node-dom-stub.mjs';
globalThis.localStorage ??= { getItem: () => null, setItem: () => {}, removeItem: () => {} };
const VM = await import('../src/vehicles/VehicleModels.js');
const C = await import('../src/customs/CustomsCatalog.js');
const BS = await import('../src/customs/BodyScan.js');
const CP = await import('../src/customs/CustomsParts.js');
const CW = await import('../src/customs/CustomsWheels.js');
const PA = await import('../src/customs/CustomsPaint.js');
let bad = 0; const fail = (...a) => { bad++; console.log('  FAIL', ...a); };
const tris = (g) => !g ? 0 : (g.index ? g.index.count : g.attributes.position.count) / 3;
const nanOf = (g) => { if (!g) return 0; let n = 0; for (const k in g.attributes) { const a = g.attributes[k].array; for (let i = 0; i < a.length; i++) if (!Number.isFinite(a[i])) n++; } return n; };
const bbox = (g) => { g.computeBoundingBox(); return g.boundingBox; };
const pick = process.argv.slice(2).length ? process.argv.slice(2) : C.customizableTypes();
console.log('customizable', C.customizableTypes().length, 'excluded', C.excludedTypes().join(','));
// wheels: every design / tread once
for (const d of ['split5', 'mesh', 'multi10', 'dish', 'turbine', 'y6', 'mono7', 'beadlock', 'steelie', 'trucker']) for (const hi of [false, true]) { const g = CW.rimGeometry(d, 0.33, 0.2, 0.71, d === 'trucker' ? 'heavy' : 'car', true, hi); if (!g || nanOf(g) || tris(g) < 20) fail('rim', d, hi, tris(g), nanOf(g)); else { const b = bbox(g); if (b.max.y > 0.33 * 0.71 * 1.15 || b.min.y < -0.33 * 0.71 * 1.15 || b.max.x > 0.112 || b.min.x < -0.112) fail('rim bbox', d, hi, JSON.stringify(b)); } }
for (const d of ['laced', 'cast3', 'cast5', 'forged7']) for (const hi of [false, true]) { const g = CW.rimGeometry(d, 0.3, 0.12, 0.8, 'bike', false, hi); if (!g || nanOf(g) || tris(g) < 20) fail('bike rim', d, hi); }
for (const k of ['stock', 'sport', 'semi', 'at', 'mt']) for (const bk of [false, true]) for (const hi of [false, true]) { const g = CW.tyreGeometry(0.33, bk ? 0.12 : 0.2, bk ? 0.8 : 0.71, k, bk, hi); if (!g || nanOf(g)) fail('tyre', k, bk, hi); else { const b = bbox(g); if (b.max.y > 0.33 * 1.08 || b.max.y < 0.33 * 0.95) fail('tyre R', k, bk, hi, b.max.y.toFixed(3)); } }
for (let l = 0; l <= 3; l++) { const g = CW.caliperGeometry(0.33, 0.2, 0.71, l, 'car'); if (!g || nanOf(g)) fail('caliper', l); else { const b = bbox(g); const r = Math.max(Math.hypot(b.max.y, b.max.z), Math.hypot(b.min.y, b.min.z)); if (r > 0.33 * 0.71) fail('caliper outside barrel', l, r.toFixed(3)); } }
console.log('wheels checked');
let parts = 0, ptris = 0;
for (const t of pick) { const P = C.profileOf(t); if (!P) { console.log('skip (excluded)', t); continue; }
  const m = VM.createVehicleMesh(t, 7); VM.customizeMesh(m); const S = BS.scanVehicle(m); if (!S.key) fail(t, 'no S.key');
  if (!m.userData.custom) fail(t, 'customizeMesh did nothing');
  const F = PA.paintFrame(S); for (const k in F) if (typeof F[k] === 'number' && !Number.isFinite(F[k])) fail(t, 'paintFrame', k, F[k]);
  const slots = C.slotsFor(t, S); const cats = C.categoriesFor(t, S).map((c) => c.id);
  let line = `${t.padEnd(12)} ${P.kind}/${P.klass.padEnd(10)} f=${P.f.toFixed(2)} slots ${slots.length} cats ${cats.length}`;
  for (const sl of slots) { if (sl.kind === 'colour') continue; for (const o of sl.options) { if (o.id === 'stock' || o.id === 'none') continue;
    const pr = C.priceOf(t, sl.id, o.id, S); if (!(pr >= (o === sl.options[0] ? 0 : 1) && pr < 1e6)) fail(t, sl.id, o.id, 'price', pr);
    if (!['frontBumper', 'rearBumper', 'skirts', 'spoiler', 'hood', 'fenders', 'roof', 'mudflaps', 'screen', 'cowl', 'sliders', 'crashbars', 'guard', 'exhaust', 'aux', 'bedcover'].includes(sl.id)) continue;
    let out; try { out = CP.buildParts(S, P, { [sl.id]: o.id }); } catch (e) { fail(t, sl.id, o.id, 'THROW', e.message); continue; }
    let n = 0; for (const k of ['paint', 'carbon', 'black', 'chrome', 'glass', 'lamp']) { const g = out[k]; if (!g) continue; n += tris(g); if (nanOf(g)) fail(t, sl.id, o.id, k, 'NaN', nanOf(g));
      const b = bbox(g); if (b.min.y < -0.02) fail(t, sl.id, o.id, k, 'below ground', b.min.y.toFixed(3)); if (b.max.y > S.H + 0.75) fail(t, sl.id, o.id, k, 'too high', b.max.y.toFixed(2), 'H', S.H.toFixed(2));
      if (b.max.z > S.zF + 0.45 || b.min.z < S.zR - 0.45) fail(t, sl.id, o.id, k, 'z out', b.min.z.toFixed(2), b.max.z.toFixed(2), S.zR.toFixed(2), S.zF.toFixed(2));
      if (Math.max(-b.min.x, b.max.x) > S.hw + 0.25) fail(t, sl.id, o.id, k, 'x out', b.min.x.toFixed(2), b.max.x.toFixed(2), 'hw', S.hw.toFixed(2)); }
    if (n === 0) fail(t, sl.id, o.id, 'no geometry'); if (sl.id === 'exhaust' && !out.tip) fail(t, 'exhaust no tip'); parts++; ptris += n; } }
  const tn = C.tuneOf(t, { engine: 'l2', turbo: P.kind === 'car' ? 'l1' : undefined, susp: 'l2', brakes: 'l2' }); for (const k of ['accel', 'top', 'brake', 'grip', 'roll', 'steer', 'armour']) if (!Number.isFinite(tn[k])) fail(t, 'tune', k);
  console.log(line, `tune a${tn.accel.toFixed(2)} g${tn.grip.toFixed(2)} r${tn.ride.toFixed(2)}`);
}
console.log(`parts built ${parts}, avg tris ${(ptris / Math.max(1, parts)) | 0}, cache ${CP.partsCacheSize()}, scans ${BS.scanCacheSize()}`);
console.log(bad ? `FAILURES ${bad}` : "ALL OK"); process.exit(bad ? 1 : 0);
