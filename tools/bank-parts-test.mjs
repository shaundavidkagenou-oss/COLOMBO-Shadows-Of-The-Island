// 73rd: the bank's named parts (BankLayout.js / console bank-edit): every kit-built piece of the hall is a part; a layout moves /
// turns / scales / hides parts or gives them their own materials, without extra draw calls for untouched parts; obstacles follow;
// reset restores the original geometry exactly; the saved layout (model pack "bank") is applied when the hall is built.
import './node-dom-stub.mjs';
import * as THREE from 'three';
globalThis.localStorage ??= { getItem: () => null, setItem: () => {}, removeItem: () => {} };
const M = await import('../src/gfx/Materials.js'); M.MAT.paint ||= new THREE.MeshStandardMaterial({ vertexColors: true }); M.MAT.emissive ||= new THREE.MeshBasicMaterial({ vertexColors: true });
const { buildBankInterior } = await import('../src/world/BankInterior.js');
const { applyLayout, partBox, partAtFace, partObject } = await import('../src/world/BankLayout.js');
const { setModelPack } = await import('../src/debug/boot.js');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else fail++; console.log((c ? '  PASS ' : '  FAIL ') + m); };
const g2 = { clock: 0, hud: { key: () => '[E]', subtitle: () => {}, notify: () => {} } };
const count = (g) => { let n = 0; g.traverse((o) => { if (o.isMesh && o.visible) n++; }); return n; };
const room = buildBankInterior(g2, null); const P = room.parts;
ok(P && P.names.length >= 50, `the hall is split into ${P.names.length} named parts`);
for (const n of ['Teller counter', 'Counter security glass', 'ATM 1', 'ATM 2', 'Vault door', 'Reception desk', 'Hall air conditioner', 'Waiting chair bases', "Manager's desk", 'Ceiling tiles']) ok(P.names.includes(n), 'part: ' + n);
let unassigned = 0; for (const r of P.recs) { const cov = r.R.reduce((s, x) => s + x[4] - x[3], 0); unassigned += r.m.geometry.index.count - cov; } ok(unassigned === 0, `every triangle of the kit meshes belongs to a part (${unassigned} indices unassigned)`);
const base = count(room.g); const orig = P.recs.map((r) => r.m.geometry.attributes.position.array.slice());
// pick: a ray down onto the middle of the reception desk top finds that part
{ const b = partBox(P, 'Reception desk'); const c = b.getCenter(new THREE.Vector3()); const rc = new THREE.Raycaster(new THREE.Vector3(c.x, 2.0, c.z), new THREE.Vector3(0, -1, 0)); room.g.updateMatrixWorld(true);
  const hits = rc.intersectObjects(P.recs.map((r) => r.m), false); const n = hits.length ? partAtFace(P, hits[0].object, hits[0].faceIndex) : null; ok(n === 'Reception desk' || n === 'Enquiries sign', `picking the desk from above finds "${n}"`); }
// edits
const plantOb = P.obs.find((x) => x.o.part === 'Plant by the door').o; const po = { ...plantOb }; const binOb = P.obs.find((x) => x.o.part === 'Litter bin').o;
const vb0 = partBox(P, 'Vault door'); const pb0 = partBox(P, 'Plant by the door');
applyLayout(P, { parts: { 'Plant by the door': { p: [-1, 0, 0.5] }, 'Litter bin': { hide: true }, 'ATM 1': { own: true }, 'Vault door': { s: [1, 1.5, 1] }, 'Wall clock': { r: 90 } } });
const pb1 = partBox(P, 'Plant by the door'); ok(Math.abs(pb1.min.x - pb0.min.x + 1) < 1e-4 && Math.abs(pb1.min.z - pb0.min.z - 0.5) < 1e-4, 'moved part: its box moved by (−1, 0, +0.5)');
{ let moved = false; for (const r of P.recs) { const R = r.R.find((x) => x[0] === 'Plant by the door'); if (!R) continue; const p = r.m.geometry.attributes.position.array, o = orig[P.recs.indexOf(r)]; moved = Math.abs(p[R[1] * 3] - o[R[1] * 3] + 1) < 1e-4; } ok(moved, 'and its vertices really moved in the merged mesh'); }
ok(Math.abs(plantOb.x0 - (po.x0 - 1)) < 1e-4 && Math.abs(plantOb.z0 - (po.z0 + 0.5)) < 1e-4, 'its obstacle followed it');
ok(binOb.x0 > 1e4, 'hidden part: its obstacle is gone');
{ let left = 0; for (const r of P.recs) { const R = r.R.filter((x) => x[0] === 'Litter bin'); if (!R.length) continue; left += R.reduce((s, x) => s + x[4] - x[3], 0); } ok(left > 0, 'the bin had geometry'); }
{ let tri = 0; for (const r of P.recs) tri += r.m.geometry.index.count; let tri0 = 0; for (const r of P.recs) tri0 += r.orig ? r.orig.i.length : r.m.geometry.index.count; ok(tri < tri0, `hidden / own parts left the merged meshes (${tri0} → ${tri} indices)`); }
const vb1 = partBox(P, 'Vault door'); ok(Math.abs((vb1.max.y - vb1.min.y) / (vb0.max.y - vb0.min.y) - 1.5) < 1e-3, 'scaled part: 1.5× taller');
const own = []; room.g.traverse((o) => { if (o.isMesh && o.userData.bankPart) own.push(o); });
ok(own.length > 0 && own.every((o) => o.userData.bankPart === 'ATM 1' && o.material.name.startsWith('CMB · ATM 1 · ')), `own materials: ${own.length} meshes for ATM 1, materials named "${own[0] && own[0].material.name}"…`);
ok(own.every((o) => !P.recs.some((r) => r.m.material === o.material)), 'their materials are copies (the shared ones are untouched)');
ok(count(room.g) === base + own.length, `draw calls: ${base} → ${count(room.g)} (+1 per own material only)`);
{ const hit = own[0]; ok(partAtFace(P, hit, 0) === 'ATM 1', 'picking an own-material mesh finds its part'); }
const keepMat = own[0].material; applyLayout(P, { parts: { 'ATM 1': { own: true } } }); const own2 = []; room.g.traverse((o) => { if (o.isMesh && o.userData.bankPart) own2.push(o); }); ok(own2.some((o) => o.material === keepMat), 're-applying keeps the same own material (Texture Studio edits stay on it)');
ok(partObject(P, 'Vault door').children.length > 0, 'a part can be exported on its own (.glb download)');
applyLayout(P, { parts: {} });
{ let same = true; P.recs.forEach((r, i) => { const p = r.m.geometry.attributes.position.array, o = orig[i]; for (let k = 0; k < o.length; k++) if (p[k] !== o[k]) { same = false; break; } }); ok(same, 'reset: every vertex exactly back'); }
ok(count(room.g) === base && plantOb.x0 === po.x0 && binOb.x0 === P.obs.find((x) => x.o === binOb).orig.x0, 'reset: draw calls and obstacles back');
// saved layout applied when the hall is built
setModelPack({ format: 'colombo.model-manifest', bank: { v: 1, parts: { 'Litter bin': { hide: true } } } });
const room2 = buildBankInterior(g2, null); ok(room2.parts.obs.find((x) => x.o.part === 'Litter bin').o.x0 > 1e4, 'a saved layout (model pack "bank") is applied when the hall is built'); setModelPack(null);
console.log(fail ? `bank-parts: ${pass} passed, ${fail} failed` : `ALL PASS (${pass})`); process.exit(fail ? 1 : 0);
