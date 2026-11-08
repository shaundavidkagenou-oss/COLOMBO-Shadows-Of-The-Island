// Blood test (Node): the REAL Blood + BloodStain against REAL crowd characters. Checks
//   • shader patches: the wound-stain injection finds its anchors in three's real standard / physical shaders, also chained after the
//     crowd-head and protagonist patches (so it cannot silently drop out); the crowd's shared body material keeps 0 wounds;
//   • wounds: placed on the surface the shot struck (entry side, never the far side), in bind space — skinning the stored point in the
//     CURRENT (walking) pose lands back on the hit; a wounded pedestrian gets its own material copy (same program key), others don't;
//     4 slots, the oldest replaced; a shot near the head marks the head mesh; the wound keeps dripping; dispose frees the copy;
//   • spatter: more forward than back spatter, a red mist, drops fall and leave splats ON the ground, shallow landings leave
//     elongated splats pointing along their travel; a wall behind the victim gets a stain on its face (facing back), a tree's box or
//     a wall beyond 2.5 m doesn't; marks dry (fresh 0 → crust 1) over minutes; the Blood setting off stops everything.
// Run: node tools/blood-test.mjs
import './node-dom-stub.mjs';
{ let sd = 5; Math.random = () => { sd = (sd * 16807) % 2147483647; return (sd - 1) / 2147483646; }; }
globalThis.localStorage ??= { getItem: () => null, setItem: () => {}, removeItem: () => {} };
const THREE = await import('three');
const { Character, randomSpec, getBodyMaterial } = await import('../src/actors/Character.js');
const { Blood } = await import('../src/gfx/Blood.js');
const { addBloodStain, isBloodPatched, BLOOD_T, bindPoint } = await import('../src/gfx/BloodStain.js');
const { Settings } = await import('../src/core/Settings.js');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; if (fail < 50) console.log('  FAIL', m); } };
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ---- 1. shader anchors (three's real shader sources)
const SL = THREE.ShaderLib;
function runPatch(mat, lib) { const sh = { vertexShader: SL[lib].vertexShader, fragmentShader: SL[lib].fragmentShader, uniforms: {} }; mat.onBeforeCompile.call(mat, sh, null); return sh; }
for (const lib of ['standard', 'physical']) { const m = addBloodStain(lib === 'standard' ? new THREE.MeshStandardMaterial() : new THREE.MeshPhysicalMaterial()); const sh = runPatch(m, lib);
  ok(sh.vertexShader.includes('vBindP = position;'), lib + ': vertex injection'); ok(sh.fragmentShader.includes('uniform vec4 uWound[') && sh.fragmentShader.includes('bloodK'), lib + ': fragment injection');
  ok(sh.fragmentShader.indexOf('bloodK') < sh.fragmentShader.indexOf('#include <lights_physical_fragment>'), lib + ': stain before lighting');
  ok(sh.uniforms.uWoundN && sh.uniforms.uWoundN.value === 0 && sh.uniforms.uBloodT === BLOOD_T, lib + ': uniforms bound'); ok(m.customProgramCacheKey().includes('bloodstain'), lib + ': program key'); }
const shared = getBodyMaterial(); ok(isBloodPatched(shared), 'crowd body material not patched'); ok(shared.userData.bloodU.uWoundN.value === 0, 'shared material has wounds');

// ---- characters: a crowd man, a crowd woman, standing in a walk pose
const scene = new THREE.Scene();
const mkCh = (seed, o) => { const ch = new Character(randomSpec(seed, { age: 'adult', ...o })); ch.root.position.set(4, 0, 6); ch.root.rotation.y = 0.6; scene.add(ch.root); for (let f = 0; f < 50; f++) ch.anim.update(1 / 60, 1.4, 0); scene.updateMatrixWorld(true); ch.mesh.skeleton.update(); return ch; };
const chs = [mkCh(91, { sex: 'm' }), mkCh(4021, { sex: 'f' })];
{ const ch = chs[0], head = ch.root.getObjectByName('npcHead'); ok(!!head, 'crowd head mesh'); if (head) { const sh = runPatch(head.material, 'standard'); ok(sh.vertexShader.includes('vBindP') && sh.fragmentShader.includes('bloodK'), 'crowd-head chain lost the stain'); } }
// world position of a body vertex in the current pose
const skinned = (mesh, i) => { const v = new THREE.Vector3().fromBufferAttribute(mesh.geometry.attributes.position, i); mesh.applyBoneTransform(i, v); return v.applyMatrix4(mesh.matrixWorld); };
const bindIndex = (mesh, p) => { const P = mesh.geometry.attributes.position; for (let i = 0; i < P.count; i++) if (Math.abs(P.getX(i) - p.x) + Math.abs(P.getY(i) - p.y) + Math.abs(P.getZ(i) - p.z) < 1e-6) return i; return -1; };

// ---- 2. bind-space accuracy in the walking pose: hit a real surface point from outside, the stored point skins back onto it
for (const ch of chs) { const m = ch.mesh, P = m.geometry.attributes.position, N = m.geometry.attributes.normal; let errs = [], far = 0, n = 0; const g = m.geometry.groups[0];
  for (let k = 0; k < 60; k++) { const i = m.geometry.index.getX(g.start + Math.floor(Math.random() * g.count)); const w = skinned(m, i);
    if (w.y < 0.25 || w.y > 1.55) continue; // legs / arms / torso — the head is tested on its own mesh
    const nb = new THREE.Vector3().fromBufferAttribute(N, i); const nw = nb.clone(); m.applyBoneTransform(i, new THREE.Vector3()); // (just to be sure the transform runs)
    // outward normal in world: skin a point 1 cm out along the bind normal
    const out = new THREE.Vector3().fromBufferAttribute(P, i).addScaledVector(nw, 0.01); const tmp = out.clone(); { const s = new THREE.Vector3(); m.applyBoneTransform(i, s.copy(tmp)); s.applyMatrix4(m.matrixWorld); nw.copy(s.sub(w)).normalize(); }
    const dir = nw.clone().negate(); const hit = w.clone().addScaledVector(nw, 0.02);
    const bp = bindPoint(m, hit, dir); if (!bp) { far++; continue; } const j = bindIndex(m, bp.p); const back = skinned(m, j); errs.push(back.distanceTo(w)); n++;
    if (back.clone().sub(w).dot(nw) < -0.06) far++; }
  errs.sort((a, b) => a - b); const med = errs[Math.floor(errs.length / 2)], p90 = errs[Math.floor(errs.length * 0.9)];
  ok(n >= 25, 'surface samples ' + n); ok(med < 0.03, 'bind point median error ' + (med * 100).toFixed(1) + ' cm'); ok(p90 < 0.07, 'bind point p90 error ' + (p90 * 100).toFixed(1) + ' cm'); ok(far <= 2, 'far-side / failed snaps ' + far);
  console.log(`  ${ch.spec.sex}: bind-space error median ${(med * 100).toFixed(1)} cm, p90 ${(p90 * 100).toFixed(1)} cm over ${n} hits`); }

// ---- 3. Blood with a stub world: flat ground at y=0, a building face 1.5 m behind the victim, a tree box beside it
const cols = [{ x0: 6.0, x1: 12, z0: -20, z1: 20, h: 12, kind: 'building' }, { x0: -3, x1: -2, z0: 5, z1: 7, h: 6, kind: 'tree' }];
const collision = { groundAt: () => 0, query: (x0, z0, x1, z1) => cols.filter((c) => c.x1 >= x0 && c.x0 <= x1 && c.z1 >= z0 && c.z0 <= z1),
  raycast(ax, ay, az, bx, by, bz) { let best = 1; for (const c of cols) { let t0 = 0, t1 = 1; const sl = (o, d, a, b) => { if (Math.abs(d) < 1e-9) return o >= a && o <= b; let ta = (a - o) / d, tb = (b - o) / d; if (ta > tb) [ta, tb] = [tb, ta]; t0 = Math.max(t0, ta); t1 = Math.min(t1, tb); return t0 <= t1; };
    if (sl(ax, bx - ax, c.x0, c.x1) && sl(az, bz - az, c.z0, c.z1) && sl(ay, by - ay, 0, c.h)) best = Math.min(best, t0); } return best; } };
const B = new Blood(scene, collision); Settings.set('blood', true);
const step = (secs) => { for (let f = 0; f < secs * 60; f++) B.update(1 / 60); };
// a shot from the west (−x) hitting the man's chest: dir +x; the building face is at x = 6
{ const ch = chs[0]; const chest = new THREE.Vector3().setFromMatrixPosition(ch.bones.chest.matrixWorld); const hit = chest.clone(); hit.x -= 0.12;
  const before = ch.mesh.material.slice(); ok(B.wound(ch, hit, V(1, 0, 0), 1.5), 'wound refused');
  ok(!!ch.bloodMat && ch.bloodMat !== shared && ch.mesh.material.includes(ch.bloodMat) && !ch.mesh.material.includes(shared), 'wounded ped did not get its own material');
  ok(ch.bloodMat.customProgramCacheKey() === shared.customProgramCacheKey(), 'own copy changes the program key');
  ok(shared.userData.bloodU.uWoundN.value === 0 && ch.bloodMat.userData.bloodU.uWoundN.value === 1, 'wound written to the wrong material');
  ok(chs[1].mesh.material.includes(shared), 'an unhurt ped lost the shared material'); ok(before.length === ch.mesh.material.length, 'material slots changed');
  const W = ch.bloodMat.userData.bloodU.uWound.value[0]; const j = bindIndex(ch.mesh, W); const w = j >= 0 ? skinned(ch.mesh, j) : V(1e3, 0, 0);
  ok(w.distanceTo(hit) < 0.12, 'wound not where the shot struck: ' + w.distanceTo(hit).toFixed(3)); ok(w.x < chest.x, 'wound on the far side of the chest');
  ok(W.w > 0.03 && W.w < 0.12, 'wound radius ' + W.w);
  // 4 slots then the oldest goes
  for (let k = 0; k < 4; k++) { BLOOD_T.value += 1; B.t = BLOOD_T.value; B.wound(ch, hit.clone().add(V(0, -0.05 * k, 0.04 * k)), V(1, 0, 0), 1); }
  const I = ch.bloodMat.userData.bloodU.uWoundI.value; ok(ch.bloodMat.userData.bloodU.uWoundN.value === 4, 'wound count cap'); ok(Math.min(...I.map((v) => v.x)) > 0, 'oldest wound not replaced');
  // a head shot marks the head mesh (its own material), not the body
  const head = ch.root.getObjectByName('npcHead'); const hp = new THREE.Vector3().setFromMatrixPosition(head.matrixWorld); hp.x -= 0.08; hp.y += 0.06; const nb = ch.bloodMat.userData.bloodU.uWoundN.value;
  ok(B.wound(ch, hp, V(1, 0, 0), 1), 'head wound refused'); ok(head.material.userData.bloodU.uWoundN.value === 1, 'head wound not on the head'); ok(ch.bloodMat.userData.bloodU.uWoundN.value === nb, 'head shot marked the body');
  // the wound drips: drops fall near the victim and land as splats
  const d0 = B.stats.drips, s0 = B.stats.splats; step(6); ok(B.stats.drips - d0 >= 5, 'wound drips ' + (B.stats.drips - d0)); ok(B.stats.splats > s0, 'drips left no marks');
  ch.dispose(); ok(ch.bloodMat === null, 'dispose kept the copy'); step(0.5); ok(B.bleeders.every((b) => b.ch !== ch), 'a disposed body still drips'); }

// ---- 4. spatter physics + shapes + wall
B.clear(); { const p = V(4.5, 1.2, 6), st = { ...B.stats }; ok(B.spray(p, V(1, 0, 0), 1.5), 'spray refused');
  const live = []; for (let i = 0; i < 512; i++) if (B.life[i] > 0) live.push(i); const fwd = live.filter((i) => B.vel[i * 3] > 0).length, back = live.length - fwd;
  ok(fwd > back * 1.5 && back >= 3, `spatter forward ${fwd} / back ${back}`); ok(B.stats.mist - st.mist >= 2, 'no mist');
  ok(B.walls.length === 1, 'wall stain ' + B.walls.length); const w = B.walls[0]; if (w) { ok(Math.abs(w.x - (6 - 0.012)) < 0.02, 'wall stain not on the face x=' + w.x.toFixed(3)); ok(Math.abs(Math.sin(w.yaw) + 1) < 1e-6, 'wall stain faces the wrong way'); ok(w.y > 0.3 && w.y < 1.4, 'wall stain height ' + w.y.toFixed(2)); }
  B.spray(V(4.5, 0.45, 5), V(1, 0, 0), 1.5); // a leg shot: drops from knee height land at shallow angles
  step(3); const all = B.splatList.flat(); ok(all.length >= 4, 'landed splats ' + all.length); ok(all.every((s) => Math.abs(s.y - 0.012) < 0.006), 'splats not on the ground');
  ok(B.stats.dirSplats > 0, 'no directional splats'); const dirs = B.splatList.slice(4).flat(); ok(dirs.every((s) => s.sx > s.sz * 1.4), 'directional splats not elongated');
  ok(dirs.filter((s) => Math.cos(s.r) > 0.3).length >= dirs.length * 0.6, 'directional splats do not point along the travel (+x)');
  // no wall: away from the building, toward the tree, beyond 2.5 m
  B.clear(); B.spray(V(1, 1.2, 6), V(-1, 0, 0), 1.5); ok(B.walls.length === 0, 'stained a tree box'); B.spray(V(2.5, 1.2, 0), V(1, 0, 0), 1.5); ok(B.walls.length === 0, 'stained a wall 3.5 m away');
  // drying
  B.clear(); B.splat(4, 6, 0.3); B.pool(4.5, 6.5, 1); step(1); ok(B.dry(B.splatList.flat()[0].born) === 0, 'fresh splat dried'); step(240); ok(B.dry(B.splatList.flat()[0].born) > 0.9, 'old splat never dried');
  const D = B.splatMesh.find((m) => m.count > 0).geometry.attributes.aDry; ok(D.getX(0) > 0.9, 'dryness not uploaded'); ok(B.poolMesh.geometry.attributes.aDry.getX(0) > 0.7, 'pool not drying'); }

// ---- 5. the setting off: nothing at all
B.clear(); Settings.set('blood', false); { const ch = chs[1]; const c = new THREE.Vector3().setFromMatrixPosition(ch.bones.chest.matrixWorld);
  ok(B.spray(c, V(1, 0, 0), 1) === false && B.wound(ch, c, V(1, 0, 0), 1) === false && !ch.bloodMat, 'blood off still bleeds'); step(0.2); ok(!B.points.visible && !B.wallMesh.visible, 'blood off still visible'); }
Settings.set('blood', true);
console.log(`blood-test: ${pass + fail} checks, ${fail} failed (sprays ${B.stats.sprays}, wounds ${B.stats.wounds}, splats ${B.stats.splats}, directional ${B.stats.dirSplats}, wall ${B.stats.wall}, drips ${B.stats.drips})`);
process.exit(fail ? 1 : 0);
