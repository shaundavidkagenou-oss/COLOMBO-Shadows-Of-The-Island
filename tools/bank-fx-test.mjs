// 78th: the Ceylon Meridian Bank visual pass must not move anything. The hall's bounds, every collider, every waiting seat
// and the people's posts are compared with the values measured from the hall BEFORE the pass (530af1d); then the pass
// itself: the baked contact-shadow mesh, the people's shadow instancer, the material patch (box-projected probe) and its
// shader injection, and the graphics-quality texture sizes.
import './node-dom-stub.mjs';
import * as THREE from 'three';
globalThis.localStorage ??= { getItem: () => null, setItem: () => {}, removeItem: () => {} };
const M = await import('../src/gfx/Materials.js'); M.MAT.paint ||= new THREE.MeshStandardMaterial({ vertexColors: true }); M.MAT.emissive ||= new THREE.MeshBasicMaterial({ vertexColors: true });
const { buildBankInterior } = await import('../src/world/BankInterior.js');
const FX = await import('../src/world/BankFX.js');
const { fitSize, floorRough, BANK_SURFACES } = await import('../src/world/BankTex2K.js');
const { bankTexSize } = await import('../src/world/BankTex.js');
const { QUALITY_PRESETS } = await import('../src/core/Settings.js');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else fail++; console.log((c ? '  PASS ' : '  FAIL ') + m); };
const near = (a, b, e = 0.006) => Math.abs(a - b) <= e;

const g2 = { clock: 0, hud: { key: () => '[E]', subtitle: () => {}, notify: () => {} } };
const room = buildBankInterior(g2, null);

// ---- 1. layout preserved (values dumped from 530af1d, the hall before the 78th pass)
const B = room.bounds; ok(near(B.x0, -7) && near(B.x1, 7) && near(B.z0, -13.62) && near(B.z1, -0.24) && room.H === 3.6, `hall bounds unchanged (${B.x0}, ${B.x1}, ${B.z0}, ${B.z1.toFixed(2)}, H ${room.H})`);
const BEFORE = [
  ['ATM lobby surround', -7, -6.15, -4.32, -0.92], ['ATM privacy screen', -6.45, -5.81, -2.65, -2.59], ['Litter bin', -6.90, -6.54, -4.85, -4.49],
  ['Queue-ticket kiosk', -1.72, -1.28, -2.60, -2.28], ['Reception desk', 1.15, 3.45, -4.82, -3.12], ['Plant by the door', 6.30, 6.80, -1.07, -0.57],
  ['Brochure rack', 6.76, 7, -3.26, -2.58], ['Water dispenser', -6.92, -6.52, -6.02, -5.62], ['Plant by the counter', -6.78, -6.22, -8.45, -7.89],
  ['Teller counter', -7, 7, -13.62, -8.82], ["Manager's chair", 1.80, 2.30, -1.52, -1.02],
];
for (const [n, x0, x1, z0, z1] of BEFORE) { const o = room.obstacles.find((q) => q.part === n); ok(o && near(o.x0, x0) && near(o.x1, x1) && near(o.z0, z0) && near(o.z1, z1), `collider "${n}" where it was`); }
const fins = room.obstacles.filter((o) => near(o.z0, -8.82) && near(o.z1, -8.42)); ok(fins.length === 3, `3 counter privacy fins (${fins.length})`);
const SX = [-5.30, -4.64, -3.98, -3.32, 1.40, 2.06, 2.72, 3.38], SZ = [-5.52, -6.82];
ok(room.seats.length === 16 && room.seats.every((s) => SX.some((x) => near(x, s.x)) && SZ.some((z) => near(z, s.z)) && near(s.yaw, 3.14, 0.01)), `16 waiting seats at the same places, facing the counters`);
const st = room.stand; ok(st.tellers.length >= 3 && st.recep && st.mgr && st.sup && st.guard, `staff at their posts (${st.tellers.length} tellers, reception, manager, supervisor, guard)`);

// ---- 2. the pass
const ao = room.g.getObjectByName('bankContactAO'); ok(ao && ao.isMesh && !ao.material.depthWrite && ao.material.transparent, 'baked contact-shadow / occlusion mesh in the hall (no depth write)');
const tri = ao ? ao.geometry.index.count / 3 : 0; ok(tri > 200 && tri < 3000, `…one draw, ${tri} triangles`);
{ const a = ao.geometry.attributes.color; let mx = 0; for (let i = 0; i < a.count; i++) mx = Math.max(mx, a.getW(i)); ok(mx > 0.1 && mx <= 0.6, `…soft (peak darkening ${mx.toFixed(2)})`); }
{ const p = ao.geometry.attributes.position; let below = 0; for (let i = 0; i < p.count; i++) if (p.getY(i) < 0) below++; ok(below === 0, 'nothing of it below the floor'); }
const ppl = room.fxPeople; ok(ppl && ppl.isInstancedMesh && ppl.instanceMatrix.count >= 16, 'people contact shadows: one instanced draw (16 slots)');
let own = 0, patched = 0, floorR = 0; const seen = new Set();
room.g.traverse((o) => { if (!o.isMesh || o.isSkinnedMesh) return; for (const m of [].concat(o.material)) { if (!m || seen.has(m) || !m.isMeshStandardMaterial || !/^CMB/.test(m.name || '')) continue; seen.add(m); own++; if (m.userData.bankBP) patched++; if (/Granite floor tiles/.test(m.name) && m.customProgramCacheKey().endsWith('|bankBPR')) floorR++; } });
ok(own >= 20 && patched === own, `every own PBR material of the hall takes the box-projected probe (${patched}/${own})`);
ok(floorR >= 1, `the granite floor tiles read their polish (roughness map) per tile (${floorR} materials)`);
// shader injection on a real compile-time shader object
{ const m = [...seen].find((x) => /Granite floor tiles/.test(x.name)); const sh = { uniforms: {}, vertexShader: THREE.ShaderLib.physical.vertexShader, fragmentShader: THREE.ShaderLib.physical.fragmentShader };
  m.onBeforeCompile(sh, null);
  ok(sh.uniforms.uBPOn && sh.uniforms.uBPRot && sh.uniforms.uBPMin, 'probe uniforms bound');
  ok(/vBPWorld = worldPosition\.xyz/.test(sh.vertexShader), 'vertex shader writes the world position');
  ok(!sh.fragmentShader.includes('#include <envmap_physical_pars_fragment>') && /bpT = min/.test(sh.fragmentShader), 'fragment shader: box intersection injected into the reflection lookup');
  ok(/texture2D\( roughnessMap, vMapUv \* 1\.37 \)/.test(sh.fragmentShader), 'floor: roughness from the per-tile UVs'); }
{ const key = (re) => [...seen].filter((m) => re.test(m.name)).map((m) => m.customProgramCacheKey().split('|').pop());
  ok(key(/^CMB clear glass$/)[0] === 'bankBPglass' && key(/Wall plaster/)[0] === 'bankBPwall' && key(/Ceiling tiles/)[0] === 'bankBPceil', 'glass Fresnel, wall and ceiling tone variation assigned');
  const gm = [...seen].find((m) => m.name === 'CMB clear glass'); const sh = { uniforms: {}, vertexShader: THREE.ShaderLib.physical.vertexShader, fragmentShader: THREE.ShaderLib.physical.fragmentShader }; gm.onBeforeCompile(sh, null);
  ok(/bpF = bpF \* bpF \* bpF/.test(sh.fragmentShader) && sh.fragmentShader.includes('#include <opaque_fragment>') && gm.opacity < 0.2, `glass: Fresnel injected, face-on opacity stays ${gm.opacity} (see-through)`);
  const wm = [...seen].find((m) => /Wall plaster/.test(m.name)); const s2 = { uniforms: {}, vertexShader: THREE.ShaderLib.physical.vertexShader, fragmentShader: THREE.ShaderLib.physical.fragmentShader }; wm.onBeforeCompile(s2, null);
  ok(/float bpN\( vec3 x \)/.test(s2.fragmentShader) && /smoothstep\( 0\.12, 0\.42, bq\.y \)/.test(s2.fragmentShader), 'walls: tone drift + light scuff band above the skirting'); }
// box projection maths (the GLSL, in JS): a ray from a floor point toward the ceiling hits the box at the right place
{ const mn = new THREE.Vector3(B.x0, 0, B.z0), mx = new THREE.Vector3(B.x1, 3.6, B.z1 + 0.25); const L = new THREE.Vector3(2, 0, -4), D = new THREE.Vector3(0.3, 1, 0.1).normalize();
  const a = mx.clone().sub(L).divide(D), b = mn.clone().sub(L).divide(D), f = a.max(b); const t = Math.min(f.x, f.y, f.z); const hit = L.clone().addScaledVector(D, t);
  ok(near(hit.y, 3.6, 1e-6) && hit.x > 2 && hit.x < 7, `box projection: a floor reflection ray meets the ceiling at (${hit.x.toFixed(2)}, ${hit.y}, ${hit.z.toFixed(2)})`); }

// ---- 3. textures: quality sizes, data maps linear
ok(QUALITY_PRESETS.low.bankTex === 1024 && QUALITY_PRESETS.ultra.bankTex === 2048 && ['low', 'medium', 'high', 'ultra'].every((q) => typeof QUALITY_PRESETS[q].bankFX === 'number'), 'quality presets carry bankTex / bankFX');
ok(bankTexSize('cmbGranite') === 2048 && bankTexSize('cmbChrome') === 1024 && bankTexSize('cmbGraniteRough') === 1024, 'close-up surfaces 2K, secondary ones 1K (at the default preset)');
{ const r = floorRough(256); let lo = 255, hi = 0, sum = 0; for (let i = 1; i < r.rgba.length; i += 4) { lo = Math.min(lo, r.rgba[i]); hi = Math.max(hi, r.rgba[i]); sum += r.rgba[i]; } const mean = sum / (r.rgba.length / 4) / 255;
  ok(r.linear && lo / 255 >= 0.058 && hi / 255 <= 0.43 && mean > 0.12 && mean < 0.24, `floor polish: roughness ${(lo / 255).toFixed(2)}…${(hi / 255).toFixed(2)}, mean ${mean.toFixed(3)} (polished, never a mirror)`); }
{ const s = fitSize({ w: 2048, h: 2048, rgba: new Uint8ClampedArray(2048 * 2048 * 4).fill(100), n: { w: 1024, h: 1024, rgba: new Uint8ClampedArray(1024 * 1024 * 4).fill(128) } }, 1024);
  ok(s.w === 1024 && s.n.w === 512 && s.rgba[0] === 100, 'downsample to the preset size keeps the colours'); }
ok(typeof BANK_SURFACES.cmbGraniteRough === 'function', 'floor roughness is one of the bank surfaces (worker-generated)');
ok(typeof FX.updateBankFX === 'function' && typeof FX.captureBankProbe === 'function', 'per-frame + capture entry points');

console.log(fail ? `${fail} FAILED, ${pass} passed` : `ALL PASS (${pass})`); process.exit(fail ? 1 : 0);
