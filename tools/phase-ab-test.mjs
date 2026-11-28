// Dedicated verification suite for Phase A (60+ FPS performance optimizations) and Phase B (GTA VI-tier NPC upgrades).
import './node-dom-stub.mjs';
globalThis.addEventListener ??= () => {};
globalThis.removeEventListener ??= () => {};
document.addEventListener ??= () => {};
{
  const origCreate = document.createElement;
  const mkDomEl = () => ({
    className: '', innerHTML: '', textContent: '', style: {}, children: [],
    appendChild(c) { this.children.push(c); return c; },
    addEventListener() {},
    querySelector: () => null,
    querySelectorAll: () => [],
    classList: { toggle() {}, add() {}, remove() {} },
  });
  document.createElement = (tag) => (tag === 'canvas' ? origCreate(tag) : Object.assign(origCreate(tag), mkDomEl()));
}
import * as THREE from 'three';
await import('../src/core/fastMath.js');

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

const { patchLightChunks, MAT } = await import('../src/gfx/Materials.js');
Object.setPrototypeOf(MAT, new Proxy({}, { get: (t, k) => { if (typeof k !== 'string') return undefined; if (!t[k]) t[k] = new THREE.MeshStandardMaterial(); return t[k]; } }));
patchLightChunks();
await import('../src/gfx/Atmosphere.js');
const { addWind } = await import('../src/world/Vegetation.js');
const { createVehicleMesh } = await import('../src/vehicles/VehicleModels.js');
const { gatherBodies } = await import('../src/actors/Bodies.js');

const { buildWater, WaterReflection, skipInRefl, unskipInRefl, reflSkipProviders } = await import('../src/world/Water.js');
const { Forest } = await import('../src/world/Forest.js');
const { Blood } = await import('../src/gfx/Blood.js');
const { Character, randomSpec } = await import('../src/actors/Character.js');
const { gpuInfo } = await import('../src/gfx/GpuInfo.js');
const { Settings } = await import('../src/core/Settings.js');
const CP = await import('../src/world/CityPlan.js'); CP.generatePlan();
const { Collision } = await import('../src/world/Collision.js');
const { Traffic } = await import('../src/vehicles/Traffic.js');
const { Crowd } = await import('../src/actors/Crowd.js');
const { Phone } = await import('../src/ui/Phone.js');
const Mi = await import('../src/actors/Mind.js');
const L = await import('../src/world/Layout.js');

let pass = 0, fail = 0;
const ok = (cond, msg) => {
  if (cond) { pass++; console.log('  PASS ', msg); }
  else { fail++; console.error('  FAIL ', msg); }
};

console.log('=== PHASE A: PERFORMANCE OPTIMIZATIONS ===');

// 1. Shader light-chunk early-out, directLight.visible guard & WebGL2 GLSL 300 es preprocessor validation
{
  const pars = THREE.ShaderChunk.lights_pars_begin;
  const frag = THREE.ShaderChunk.lights_fragment_begin;
  ok(pars.includes('pointLight.distance * pointLight.distance') && pars.includes('light.visible = false;'),
    'PointLight GLSL chunk early-outs on squared distance / zero color before sqrt');
  ok(pars.includes('spotLight.distance * spotLight.distance'),
    'SpotLight GLSL chunk early-outs on squared distance / zero color before cone/sqrt');
  const gated = (frag.match(/if \( directLight\.visible \) \{\s+RE_Direct\(/g) || []).length;
  ok(gated === 2 && frag.includes('#if !( ( defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 1 )'),
    `lights_fragment_begin gates point+spot RE_Direct (${gated}) while keeping Atmosphere NUM_DIR_LIGHTS #if intact`);

  const expandIncludes = (src, d = 0) => (d > 8 ? src : src.replace(/#include <(\w+)>/g, (_, k) => expandIncludes(THREE.ShaderChunk[k] || '', d + 1)));
  const validateGLSL = (name, raw) => {
    const src = expandIncludes(raw);
    const clean = src.replace(/\/\*[\s\S]*?\*\//g, (m) => '\n'.repeat((m.match(/\n/g) || []).length)).replace(/\/\/[^\n]*/g, '');
    const lines = clean.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const ln = lines[i], h = ln.indexOf('#');
      if (h >= 0 && ln.slice(0, h).trim() !== '') throw new Error(`${name}:${i + 1} mid-line #: ${ln}`);
      if (/^\s*#(endif|else)\b/.test(ln) && ln.replace(/^\s*#(endif|else)\b/, '').trim() !== '') throw new Error(`${name}:${i + 1} extra tokens: ${ln}`);
    }
    for (const take of [true, false]) {
      const stack = []; let braces = 0, parens = 0;
      for (const ln of lines) {
        const m = /^\s*#(\w+)/.exec(ln);
        if (m) {
          const dir = m[1], pt = stack.every((s) => s.take);
          if (dir === 'if' || dir === 'ifdef' || dir === 'ifndef') stack.push({ take: pt && take, done: pt && take });
          else if (dir === 'elif') { const top = stack[stack.length - 1]; top.take = stack.slice(0, -1).every((s) => s.take) && !top.done && !take; if (top.take) top.done = true; }
          else if (dir === 'else') { const top = stack[stack.length - 1]; top.take = stack.slice(0, -1).every((s) => s.take) && !top.done; if (top.take) top.done = true; }
          else if (dir === 'endif') stack.pop();
          continue;
        }
        if (!stack.every((s) => s.take)) continue;
        for (const ch of ln) {
          if (ch === '{') braces++; else if (ch === '}') braces--;
          else if (ch === '(') parens++; else if (ch === ')') parens--;
          if (braces < 0 || parens < 0) throw new Error(`${name}: negative balance`);
        }
      }
      if (stack.length || braces || parens) throw new Error(`${name}: unclosed preprocessor/braces/parens`);
    }
  };
  let glslOk = true;
  try {
    validateGLSL('StandardFrag', THREE.ShaderLib.standard.fragmentShader);
    const leafM = new THREE.MeshStandardMaterial({ alphaTest: 0.5 }); addWind(leafM, 'leaf');
    const leafSh = { vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader, uniforms: THREE.UniformsUtils.clone(THREE.ShaderLib.standard.uniforms) };
    leafM.onBeforeCompile(leafSh);
    validateGLSL('LeafVert', leafSh.vertexShader); validateGLSL('LeafFrag', leafSh.fragmentShader);
    const vm = createVehicleMesh('sedan', 7);
    vm.traverse((o) => {
      if (!o.isMesh || !o.material?.onBeforeCompile) return;
      const lib = o.material.isMeshPhysicalMaterial ? THREE.ShaderLib.physical : THREE.ShaderLib.standard;
      const sh = { vertexShader: lib.vertexShader, fragmentShader: lib.fragmentShader, uniforms: THREE.UniformsUtils.clone(lib.uniforms) };
      o.material.onBeforeCompile(sh);
      validateGLSL('VehFrag:' + o.name, sh.fragmentShader);
    });
  } catch (e) { glslOk = false; console.error('GLSL validation error:', e); }
  ok(glslOk, 'All patched WebGL2 / GLSL 300 es shaders (Standard + Atmosphere + Vegetation + Vehicle) pass preprocessor & brace validation');
}

// 1b. WaterReflection reflSkipProviders Set & mark(obj) + iterable execution
{
  ok(reflSkipProviders instanceof Set && typeof reflSkipProviders.add === 'function', 'reflSkipProviders is a Set supporting .add() / .delete()');
  const wScene = new THREE.Scene();
  const waterGrp = buildWater(); wScene.add(waterGrp);
  const wr = new WaterReflection(waterGrp);
  const dynA = new THREE.Group(), dynB = new THREE.Group(), keepBld = new THREE.Group();
  wScene.add(dynA, dynB, keepBld);
  skipInRefl(dynA);
  const provMark = (mark) => { mark(dynB); };
  reflSkipProviders.add(provMark);
  const wCam = new THREE.PerspectiveCamera(60, 1.6, 0.25, 4000);
  wCam.position.set(-520, 8, 0); wCam.lookAt(-700, 0, 0); wCam.updateMatrixWorld(); wCam.updateProjectionMatrix();
  let duringRefl = null;
  const mockR = {
    shadowMap: { autoUpdate: true }, xr: { enabled: false },
    getContext: () => null,
    getSize: (v) => v.set(1280, 720),
    getRenderTarget: () => null,
    setRenderTarget() {},
    clear() {},
    render: () => { duringRefl = { a: dynA.visible, b: dynB.visible, k: keepBld.visible, w: waterGrp.visible }; },
  };
  wr.update(mockR, wScene, wCam, true);
  unskipInRefl(dynA); reflSkipProviders.delete(provMark);
  ok(duringRefl && !duringRefl.a && !duringRefl.b && duringRefl.k && !duringRefl.w && dynA.visible && dynB.visible && waterGrp.visible,
    'WaterReflection.update hides skipInRefl + reflSkipProviders(mark) targets during mirror render and restores visibility');
}

// 2. GPU tier detection & GTX 1660 Super autoTune
{
  const mockRenderer = (unmasked, vendor = 'NVIDIA Corporation') => ({
    getContext: () => ({
      getExtension: (n) => (n === 'WEBGL_debug_renderer_info' ? { UNMASKED_VENDOR_WEBGL: 1, UNMASKED_RENDERER_WEBGL: 2 } : null),
      getParameter: (p) => (p === 1 ? vendor : p === 2 ? unmasked : 8192),
    }),
    capabilities: { maxTextures: 16 },
  });
  const g1660 = gpuInfo(mockRenderer('ANGLE (NVIDIA, NVIDIA GeForce GTX 1660 SUPER Direct3D11 vs_5_0 ps_5_0)'), true);
  const g4070 = gpuInfo(mockRenderer('NVIDIA GeForce RTX 4070'), true);
  const gUhd = gpuInfo(mockRenderer('Intel(R) UHD Graphics 620', 'Intel'), true);
  ok(g1660.tier === 'mid' && g4070.tier === 'high' && gUhd.tier === 'low',
    `GPU tier classification: 1660S=${g1660.tier}, 4070=${g4070.tier}, UHD620=${gUhd.tier}`);
  const tuned = Settings.autoTune(g1660);
  ok(tuned === true && Settings.get('quality') === 'high' && Settings.get('upscale') === 'sgsr85' && Settings.get('dynamicRes') === true,
    `Settings.autoTune(GTX 1660 Super) -> quality=${Settings.get('quality')}, upscale=${Settings.get('upscale')}, dynamicRes=${Settings.get('dynamicRes')}`);
}

// 3. Pooled npcHead materials + bloodClone Color uniform safety + 9.5 m LOD
{
  const specSet = Array.from({ length: 10 }, (_, i) => randomSpec(4000 + i * 19));
  const chars = [];
  const headMats = new Set();
  const findHeadLOD = (ch) => ch.bones.head.getObjectByName('npcHeadLOD');
  for (let i = 0; i < 36; i++) {
    const ch = new Character(specSet[i % specSet.length]);
    chars.push(ch);
    const lod = findHeadLOD(ch);
    if (lod) {
      const levels = lod.levels;
      if (i === 0) ok(levels.length === 2 && levels[1].distance === 9.5 && !levels[1].object.castShadow,
        `npcHead LOD switches to shadowless lo mesh at ${levels[1].distance} m`);
      levels[0].object.traverse((m) => { if (m.isMesh && m.material?.userData?.pooledHead) headMats.add(m.material); });
    }
  }
  ok(headMats.size > 0 && headMats.size <= 10, `36 spawned pedestrians across 10 Crowd specs share ${headMats.size} pooled npcHead materials (<= 10)`);

  // Blood.wound lazy-clones ONLY the wounded character's head material and preserves THREE.Color uniforms
  const scene = new THREE.Scene();
  const col = new Collision();
  const blood = new Blood(scene, col);
  const target = chars.find((c) => findHeadLOD(c));
  const getHeadMat = (ch) => { let out = null; findHeadLOD(ch).levels[0].object.traverse((m) => { if (m.isMesh && m.material?.userData?.u) out = m.material; }); return out; };
  const mBefore = getHeadMat(target);
  target.root.updateMatrixWorld(true);
  const hb = target.bones.head; hb.updateWorldMatrix(true, false);
  const pt = new THREE.Vector3().setFromMatrixPosition(hb.matrixWorld); pt.z += 0.1;
  blood.wound(target, pt, { x: 0, y: 0, z: -1 }, 0.4);
  const mAfter = getHeadMat(target);
  ok(mAfter !== mBefore && !mAfter.userData.pooledHead && mBefore.userData.pooledHead,
    'Blood.wound lazy-clones pooled npcHead material without mutating the shared pool');
  ok(mAfter.userData.u.uLip.value instanceof THREE.Color && mAfter.userData.u.uHair.value instanceof THREE.Color,
    'Cloned npcHead material preserves live THREE.Color uniform instances');
  for (const ch of chars) ch.dispose();
  ok([...headMats].every((m) => m.userData.pooledHead), 'Character.dispose() preserves pooled npcHead materials');
}

// 4. Forest waterRefl ground-plant skip & shNear shadow tiering
{
  const F = new Forest(CP.plan.trees.slice(0, 400), CP.plan.plants.slice(0, 800), 'high');
  const leafBm = F.meshes.find((m) => m.userData.ci === 0 && m.name.includes('leaves'));
  const plantBm = F.meshes.find((m) => m.name.startsWith('forest:plant:'));
  ok(!leafBm.userData.leafMesh || leafBm.userData.shNear === 2, 'Forest on High uses shNear=2 shadow crown LOD');
  const cam = new THREE.PerspectiveCamera(60, 1.6, 0.25, 2000);
  const p0 = CP.plan.plants[0];
  cam.position.set(p0.x, L.LAND_Y + 2, p0.z - 12); cam.lookAt(p0.x, L.LAND_Y + 1, p0.z + 20); cam.updateMatrixWorld();
  F.update({ x: p0.x, z: p0.z }, cam);
  F.fill(plantBm, cam, false);
  const mainPlantDraws = plantBm._multiDrawCount;
  cam.name = 'waterRefl';
  F.fill(plantBm, cam, false);
  const reflPlantDraws = plantBm._multiDrawCount;
  ok(mainPlantDraws > 0 && reflPlantDraws === 0, `Forest skips ground plants in waterRefl (${mainPlantDraws} -> ${reflPlantDraws} draws)`);
}

console.log('\n=== PHASE B: GTA VI-TIER NPC UPGRADES ===');

const col = new Collision(); col.addAll(CP.plan.colliders);
const scene = new THREE.Scene();
const posts = [];
const handlers = {};
const events = {
  emit(n, e) { if (n === 'socialPost') posts.push(e); (handlers[n] || []).forEach((f) => f(e)); },
  on(n, f) { (handlers[n] || (handlers[n] = [])).push(f); },
};
const C = new Crowd(scene, col, events); C.max = 70; C.prepareSpecs(24);
const T = new Traffic(scene, col, events); T.max = 22; T.crowd = C; await T.warmModels([[-392, 700]]);
const blood = new Blood(scene, col); C.blood = blood;
const focus = { x: -392, z: 700 };
const player = { x: focus.x, z: focus.z, y: 0, yaw: 0, speed: 0, vehicle: null, ch: null, player: true };
const camDir = new THREE.Vector3(0, 0, -1);
const ctx = { simTime: 0, vehicles: [], player, bodies: [], hourFactor: 1, hour: 14, rain: 0, night: 0, hero: 'dineth', armed: false };
let simT = 0;
const step = (n = 1, dt = 1 / 30) => {
  for (let i = 0; i < n; i++) {
    T.update(dt, focus, camDir, simT, C.peds, player);
    ctx.simTime = simT; ctx.vehicles = T.all();
    C.update(dt, focus, camDir, ctx);
    simT += dt;
  }
};
step(180);
ok(C.group.parent === scene && C.group.userData.identityGroup === true && C.peds.length > 20 && C.peds.every((p) => p.ch.root.parent === C.group),
  `Crowd parented under single WaterReflection-cullable identityGroup (${C.peds.length} peds)`);
{
  const bodies = gatherBodies(scene);
  const sample = C.peds[0];
  const bSample = bodies.find((b) => b.ch === sample.ch);
  ok(!!bSample && Math.hypot(bSample.x - sample.x, bSample.z - sample.z) < 1e-4,
    'Bodies.gatherBodies(scene) reads exact coordinates from Crowd.group via identityGroup fast-path');
  const relSample = C.peds[C.peds.length - 1];
  C.release(relSample);
  ok(relSample.ch.root.parent === scene && !C.peds.includes(relSample),
    'Crowd.release(p) reparents handed-over pedestrian from Crowd.group back onto scene');
  relSample.ch.root.parent?.remove(relSample.ch.root); relSample.ch.dispose();
}
skipInRefl(C.group); unskipInRefl(C.group);

// 5. Multi-turn Greet -> Small talk -> Wish well, Antagonize -> Provoke -> Defuse, and Armed Hold-up
{
  const p = C.peds.find((q) => q.state === 'walk' && q.sp.age !== 'elder');
  player.x = p.x + 1.2; player.z = p.z;
  const s1 = C.interactSpec(p, false);
  const r1 = C.interact(p, s1.e, player);
  const s2 = C.interactSpec(p, false);
  const r2 = C.interact(p, s2.e, player);
  const s3 = C.interactSpec(p, false);
  const r3 = C.interact(p, s3.e, player);
  ok(s1.e === 'talk' && s2.e === 'chat' && s3.e === 'farewell' && r1.playerLine && r2.playerLine && r3.playerLine,
    `3-step positive Greet chain: ${s1.eLabel} -> ${s2.eLabel} -> ${s3.eLabel}`);
  const relGood = Mi.rel(p.mind, 'dineth');
  ok(relGood && relGood.like > 0.15, `Mind relationship warmed across multi-turn chat (like=${relGood.like.toFixed(2)})`);

  // Antagonize -> Defuse
  const p2 = C.peds.find((q) => q !== p && q.state === 'walk' && q.sp.age !== 'elder');
  p2.mind.tr[Mi.TI.AGG] = 0.85; p2.mind.tr[Mi.TI.CONF] = 0.85;
  const a1 = C.interactSpec(p2, false);
  C.interact(p2, a1.n, player);
  p2.state = 'confront'; p2.timer = 4;
  const dSpec = C.interactSpec(p2, false);
  const dRes = C.interact(p2, dSpec.e, player);
  ok(a1.n === 'insult' && dSpec.e === 'defuse' && dRes.playerLine === 'playerDefuse',
    `Escalation -> De-escalation prompt switches dynamically (${a1.nLabel} -> ${dSpec.eLabel})`);

  // Armed Hold-Up (Rob) + Intimidate
  const p3 = C.peds.find((q) => q !== p && q !== p2 && q.state === 'walk' && q.sp.age !== 'elder');
  ctx.armed = true; C.playerArmed = true;
  const robSpec = C.interactSpec(p3, true);
  const robRes = C.interact(p3, robSpec.e, player);
  const afterRobSpec = C.interactSpec(p3, true);
  ok(robSpec.e === 'rob' && robRes.cash >= 450 && p3.state === 'surrender' && afterRobSpec.e === 'intimidate',
    `Armed Hold-Up yields Rs. ${robRes.cash} -> surrender pose -> follow-up=${afterRobSpec.eLabel}`);
  ctx.armed = false; C.playerArmed = false;
}

// 6. Witness Filming -> 5s ColomboLive Upload -> Phone Feed & Interruption
{
  const w = C.peds.find((q) => q.state === 'walk' && q.sp.age !== 'elder');
  player.x = w.x + 4; player.z = w.z;
  C.startFilm(w, player, 'holdup', true);
  step(2, 1 / 30);
  const activeRec = C.activeFilmerNear(player.x, player.z, 20);
  ok(activeRec === w && w.state === 'film' && w.ch.anim.action === 'photo' && !!w.phone,
    'Witness filming enters film state with camera-up pose and smartphone prop');
  step(160, 1 / 30); // > 5.0 s
  ok(posts.length >= 1 && posts[0].playerInvolved && C.viralUntil > C.t && C.viralDistrict === posts[0].district,
    `5s witness upload emits socialPost in district '${posts[0].district}' and activates viral heat`);

  // Verify Phone ColomboLive app renders live post & viral banner
  const mockGame = {
    crowd: C, atmos: { day: 2, timeString: '14:25', hour: 14.4, w: { rain: 0 } },
    story: { state: { money: 5000, ledger: [], msgs: [], stats: {} } },
    hud: { key: () => 'P', setWaypoint: () => {}, notify: () => {} },
    player, traffic: T, health: { hp: 100 },
  };
  const phoneParent = document.createElement('div');
  const phone = new Phone(mockGame, phoneParent);
  phone.pushLivePost(posts[0]);
  phone.open = true; phone.launch('live');
  ok(phone.liveRows().length >= 4 && phone.screen.innerHTML.includes('ColomboLive') && phone.screen.innerHTML.includes('VIRAL IN'),
    'Phone ColomboLive app renders uploaded witness clip + active district VIRAL banner');

  // Verify interrupting a second witness before 5s prevents upload
  const nPostsBefore = posts.length;
  const w2 = C.peds.find((q) => q !== w && q.state === 'walk' && q.sp.age !== 'elder');
  C.startFilm(w2, player, 'brawl', true);
  step(30, 1 / 30); // 1.0 s
  C.interact(w2, 'intimidate', player);
  step(160, 1 / 30);
  ok(posts.length === nPostsBefore && w2.state !== 'film',
    'Intimidating a filming witness before 5s cancels the ColomboLive upload');
}

// 7. 2–4 Person Friend Cliques & Group Solidarity
{
  const spawned = C.life.spawnClique();
  const cl = C.life.cliques[C.life.cliques.length - 1];
  ok(spawned && cl && cl.members.length >= 2 && cl.members.length <= 4,
    `spawnClique creates a ${cl ? cl.members.length : 0}-person friend clique on sidewalk graph`);
  step(45, 1 / 30);
  const victim = cl.members[cl.members.length - 1];
  const peers = cl.members.filter((m) => m !== victim);
  victim.temper = 0.8; for (const f of peers) f.temper = 0.85;
  player.x = victim.x + 1.0; player.z = victim.z;
  C.interact(victim, 'shove', player);
  ok(cl.ended && peers.some((f) => f.state === 'fight' || f.state === 'film' || f.state === 'confront'),
    `Friend clique reacts with group solidarity when member is shoved (${peers.map((f) => f.state).join(', ')})`);
}

// 8. Multimodal Transit (Tuk-tuk / Bus Boarding via Crowd.update) & Parked Car Owner Return Loop
{
  const nearV = (v) => Math.hypot(v.x - focus.x, v.z - focus.z) < 85 && v.ai && (v.mesh.userData.seats || []).some((s) => !s.driver);
  const tuk = T.vehicles.find((v) => v.type === 'tuktuk' && nearV(v)) || T.vehicles.find(nearV);
  if (tuk) {
    tuk.pax = []; tuk.paxPlan = []; tuk.speed = 0;
    const rider = C.peds.find((q) => q.state === 'walk' && !q.clique && !q.partner);
    const bp = T.paxBoardPoint(tuk);
    rider.x = bp.x + 0.3; rider.z = bp.z + 0.3;
    T.hailStop(tuk, 6);
    rider.state = 'scene'; rider.scene = { kind: 'transitBoard', v: tuk, t: 0 };
    step(2, 1 / 30);
    ok(tuk.pax.includes(rider.ch) && !C.peds.includes(rider) && rider.ch.root.parent === tuk.mesh && rider.ch.root.position.length() < 3 && tuk.transitDropT > 0,
      `Multimodal transit: Crowd.update safely boards ${tuk.type} outside ped loop with seat-local coords (pos=${rider.ch.root.position.length().toFixed(2)}m)`);
  }

  // Parked vehicle owner return & unparkDriveOff
  T.updateParked(0.1, focus);
  const pk = T.parked.find((v) => v.T.entry !== 'bike');
  if (pk) {
    const owner = C.peds.find((q) => q.state === 'walk' && !q.clique);
    owner.homeCar = pk; pk.awayDriver = owner; owner.errandT = 0.05;
    step(3, 1 / 30);
    ok(owner.state === 'toCar', 'Parked-car owner transitions from errand to toCar when errandT expires');
    const unparked = T.unparkDriveOff(pk);
    ok(unparked && !pk.parked && !!pk.ai && T.vehicles.includes(pk),
      `unparkDriveOff merges parked ${pk.type} smoothly back onto live traffic lane`);
  }
}

// 9. Environmental Micro-Awareness (Blood Pool & Sudden Rain)
{
  const walker = C.peds.find((q) => q.state === 'walk' && Math.hypot(q.x - focus.x, q.z - focus.z) < 25);
  if (walker) {
    blood.pool(walker.x + 1.2, walker.z + 0.8, 1.2);
    for (let i = 0; i < 30; i++) blood.update(0.1);
    const foundPool = blood.nearPool(walker.x, walker.z, 5.5);
    ok(!!foundPool, 'Blood.nearPool locates fresh blood pool for pedestrian micro-awareness');
    walker.envCd = 0;
    ctx.rain = 0.85; // trigger sudden rain onset too
    step(3, 1 / 30);
    ok(walker.state === 'recover', 'Pedestrian spots fresh blood pool, reacts in shock, and steers wide');
  }
}

console.log(`\nphase-ab-test: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
