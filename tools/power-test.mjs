// 79th: city power grid (src/world/PowerGrid.js) — zones match Layout's districts, faults / restores / substations /
// backup generators / load shedding behave, the levels only change while a transition runs, no work while steady, the GPU
// lookup texture agrees with the CPU, and the shader chunks are installed once.
//   node tools/power-test.mjs
import './node-dom-stub.mjs';
const THREE = await import('three');
const L = await import('../src/world/Layout.js');
const PG = await import('../src/world/PowerGrid.js');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL', m); } if (process.env.VERB || !c) console.log('  ', c ? 'ok ' : 'NO ', m); };
// 1 · zones = Layout districts everywhere (sampled grid)
{ let bad = 0, n = 0; for (let x = L.BOUNDS.minX; x < L.BOUNDS.maxX; x += 23) for (let z = L.BOUNDS.minZ; z < L.BOUNDS.maxZ; z += 23) { n++; const g = new PG.PowerGrid(); const zid = g.zoneAt(x, z); const want = L.districtIdAt(x, z); const site = PG.BACKUP_SITES.find((b) => b[0] === zid); if (site) continue; if (zid !== want) bad++; }
  ok(bad <= n * 0.01, `power zones follow Layout.districtIdAt (${bad}/${n} cells differ — only at 4 m cell edges)`); }
ok(PG.ZONE_IDS.length === new Set(Object.keys(L.DISTRICTS)).size || PG.ZONE_IDS.every((z) => L.DISTRICTS[z]), `${PG.ZONE_IDS.length} supply zones, all real districts`);
const g = new PG.PowerGrid(); PG.GRID.cur = g; const step = (sec, env = {}) => { let busy = 0; for (let t = 0; t < sec; t += 0.05) if (g.update(0.05, { night: 1, hour: 12, day: 1, ...env })) busy++; return busy; };
// 2 · steady: no work
ok(step(5) === 0 && g.stats.updates === 0, 'steady grid: update() does no level work');
// 3 · outage → level drops fast, CPU consumers see it, other districts untouched
const pet = L.nodes.find((n) => n.signal && L.districtIdAt(n.x, n.z) === 'pettah'); const fort = L.nodes.find((n) => n.signal && L.districtIdAt(n.x, n.z) === 'fort');
g.cut('pettah', 30, 'test'); step(0.5);
ok(g.levelAt(pet.x, pet.z) === 0 && !PG.signalPowered(pet), `Pettah out: level ${g.levelAt(pet.x, pet.z)}, junction dark`);
ok(!fort || (g.levelAt(fort.x, fort.z) === 1 && PG.signalPowered(fort)), 'Fort still powered');
ok(g.events.some((e) => e.type === 'outage' && e.zone === 'pettah'), 'outage event emitted');
// 4 · restore after the timeout: staggered, flicker, then full
let saw = { mid: false, flick: false }; let prev = 0; for (let t = 0; t < 40; t += 0.05) { g.update(0.05, { night: 1 }); const v = g.level[g.slot('pettah')]; if (v > 0.05 && v < 0.95) saw.mid = true; if (v < prev - 0.2) saw.flick = true; prev = v; }
ok(g.level[g.slot('pettah')] === 1 && saw.mid && saw.flick, `restored smoothly (ramp ${saw.mid}, restart flicker ${saw.flick}) → 1`);
ok(step(3) === 0, 'steady again after the restore');
// 5 · hospital backup generator
const hz = L.ZONES.find((z) => z.id === 'hospital'); const hx = (hz.rect[0] + hz.rect[1]) / 2, hzz = (hz.rect[2] + hz.rect[3]) / 2; const hd = g.siteZone('hospital');
g.cut(hd, 60, 'test'); step(1); const hOff = g.levelAt(hx, hzz); step(PG.POWER_CFG.genDelay + 3); const hGen = g.levelAt(hx, hzz); const dOut = g.level[g.slot(hd)];
ok(hOff < 0.05 && Math.abs(hGen - PG.POWER_CFG.genLevel) < 0.01 && dOut === 0, `hospital (${hd}): mains lost ${hOff.toFixed(2)} → generator ${hGen.toFixed(2)} while the district stays dark (${dOut})`);
g.restore(hd); step(6); ok(g.levelAt(hx, hzz) === 1 && g.level[g.slot(hd)] === 1, 'hospital back on mains with its district');
// 6 · substation trip: several zones together
g.tripSubstation('north', 20); step(1); const outN = g.outages().map((o) => o.zone); ok(['port', 'kotahena', 'fort', 'pettah', 'maradana'].every((z) => outN.includes(z)), `north substation trip → ${outN.join(', ')}`); g.restoreAll(); step(8);
ok(g.outages().length === 0, 'all restored');
// 7 · explosion next to a transformer pole
const poles = [{ x: 100, z: 100, transformer: true }, { x: 300, z: 100, transformer: false }];
ok(!g.onBlast(300, 102, poles) && g.onBlast(102, 98, poles) && g.outages().length === 1, `blast by a transformer pole cuts ${g.outages()[0] && g.outages()[0].zone}; a plain pole does not`); g.restoreAll(); step(8);
// 8 · load shedding: one district for an hour on some evenings, then back
{ const G = new PG.PowerGrid(); PG.POWER_CFG.shedChancePerNight = 1; let cutAt = null, back = null; for (let h = 18; h < 24.5; h += 0.01) { G.update(0.6, { hour: h % 24, day: 3, night: 1 }); const o = G.outages(); if (o.length && cutAt == null) cutAt = h; if (!o.length && cutAt != null && back == null) back = h; }
  ok(cutAt != null && back != null && Math.abs(back - cutAt - PG.POWER_CFG.shedLen) < 0.05, `load shedding ${cutAt && cutAt.toFixed(2)} → ${back && back.toFixed(2)} (${PG.POWER_CFG.shedLen} h)`); PG.POWER_CFG.shedChancePerNight = 0.3; }
// 9 · save / load
g.cut('beira', 50, 'test'); step(0.5); const sv = g.serialize(); const g2 = new PG.PowerGrid(); g2.restoreState(JSON.parse(JSON.stringify(sv))); ok(g2.outages().length === 1 && g2.outages()[0].zone === 'beira' && g2.level[g2.slot('beira')] === 0, 'outage saved and restored'); g.restoreAll(); step(8);
// 10 · GPU side: LUT agrees with the CPU slot, chunks installed once, uniforms shared
{ const T = PG.powerLUT, W = T.image.width; let bad = 0; for (let k = 0; k < 200; k++) { const x = L.BOUNDS.minX + Math.random() * (L.BOUNDS.maxX - L.BOUNDS.minX), z = L.BOUNDS.minZ + Math.random() * (L.BOUNDS.maxZ - L.BOUNDS.minZ); const i = Math.floor((x - (L.BOUNDS.minX - 40)) / 4), j = Math.floor((z - (L.BOUNDS.minZ - 40)) / 4); if (T.image.data[j * W + i] !== g.slotAt(x, z)) bad++; } ok(bad === 0, 'LUT texel = CPU slot'); }
ok((THREE.ShaderChunk.common.match(/float pwAt\(/g) || []).length === 1 && THREE.ShaderChunk.opaque_fragment.includes('pwk') && THREE.ShaderChunk.lights_fragment_end.includes('pwW'), 'shader chunks installed once');
{ const U = THREE.UniformsUtils.clone(THREE.ShaderLib.basic.uniforms); ok(U.uPwLvl.value === PG.POWER_LVL && U.uPwLUT.value.source === PG.powerLUT.source, 'cloned uniforms share the live levels + LUT'); }
{ const m = PG.powerMaterial(new THREE.MeshStandardMaterial()); ok('POWERED' in m.defines && m.userData.powered, 'powerMaterial sets the define'); }
console.log(`power-test: ${pass} pass, ${fail} fail`); process.exit(fail ? 1 : 0);
