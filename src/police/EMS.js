// 1990 Suwa Seriya ambulance response (phone → Contacts → 119 → "Ambulance"). Owned by PoliceResponse (this.ems) and
// built on its unit / crew machinery (spawn on a road out of view, drive the route with lights and siren, crew climbs
// out / back in), with the medics' work scripted here:
//
// 74th: bystanders call it too — a civilian down (dead, or unconscious for a while) near the player is recorded as an
// incident and, after the time it takes someone to phone 1990, the one ambulance available is sent (one per patient; one
// unit on the road at a time; incidents expire with the body). A body the crew could not revive is taken to the National
// Hospital: lane AI to the emergency gate, a pulled-in path through it to the bay under the ED canopy, the stretcher
// wheeled in through the emergency entrance, then the empty ambulance waits in the bay until it is out of sight.
//
//   arrive   ambulance pulls up near the patient, two EMTs (green uniforms, blue nitrile gloves) climb out
//   assess   EMT A kneels at the chest, EMT B at the head; a face-down patient is log-rolled onto the back together;
//            A checks the carotid pulse and taps the shoulder ("Can you hear me?"), B opens the airway
//   KO       (knocked out) breathing, pulse: they talk them round — the patient sits up with A's hand on the back,
//            gets up and walks off
//   dead     CPR: A compresses the sternum (rocking from the hips over locked arms, the chest visibly pushed down),
//            B ventilates with a bag-valve mask at the head; two cycles, pulse check. Survival chance falls with the time
//            since death (≈45 % → 0 over two minutes):
//              revived → the patient takes a breath, sits up, gets up (ragdoll → Animator hand-back)
//              not     → they fetch the stretcher from the back together, set it beside the body, slide the body across,
//                        cover it with a sheet, lift and carry it to the open rear doors, load it, close up and leave
//
// The patient is a ragdoll for all of this (src/actors/Ragdoll.js, kinematic paths), so every pose is a real body
// position with fixed limb lengths; the medics' hands are IK-pinned to world points on the body / stretcher
// (Character.js: holdWL / holdWR on medKneel / medLift / medCarry).
import * as THREE from 'three';
import { Keys, supineFrame, rollAngle, rotateAbout, RAG_N } from '../actors/Ragdoll.js';
import { AMB } from '../vehicles/AmbulanceKit.js';
import { Audio } from '../audio/Audio.js';
import { Voices } from '../audio/Voices.js';
import { SoundBank } from '../audio/SoundBank.js';
import { HospitalSound } from '../audio/HospitalAudio.js';
import { parkPath } from '../vehicles/Traffic.js';
import { LIVE_VEHICLES } from '../vehicles/Vehicle.js';

const IX = Object.fromEntries(RAG_N.map((n, i) => [n, i]));
const V = () => new THREE.Vector3();
const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };
const sm = (k) => { k = Math.max(0, Math.min(1, k)); return k * k * (3 - 2 * k); };
export const MEDIC_LINES = {
  arrive: [{ si: 'ගිලන් රථය! පාර දෙන්න.', tr: 'Ambulance! Make way, please.' }, { en: 'Ambulance crew — let us through, please.' }],
  hear: [{ si: 'ඔයාට මට ඇහෙනවද? ඇස් අරින්න.', tr: 'Can you hear me? Open your eyes.' }],
  roll: [{ en: 'Log roll on three — one, two, three.' }],
  pulse: [{ si: 'නාඩිය තියෙනවා, හුස්ම ගන්නවා.', tr: "There's a pulse — breathing." }],
  wake: [{ si: 'හෙමින්… හෙමින් නැගිටින්න.', tr: 'Slowly… sit up slowly.' }],
  okay: [{ si: 'දැන් කමක් නෑ. කරකැවිල්ල තිබ්බොත් රෝහලට යන්න.', tr: "You're all right now. If you feel dizzy, go to the hospital." }],
  nopulse: [{ en: 'No pulse, not breathing — starting CPR!' }],
  breaths: [{ en: '…twenty-nine, thirty. Two breaths.' }],
  check: [{ en: 'Stop compressions — pulse check.' }],
  rosc: [{ en: "We've got a pulse! Breathing on their own!" }, { si: 'හුස්ම ගන්නවා! ඇස් ඇරියා!', tr: "Breathing! Eyes open!" }],
  dead: [{ si: 'සමාවෙන්න… අපිට තවත් කරන්න දෙයක් නෑ.', tr: "I'm sorry… there's nothing more we can do." }],
  stretcher: [{ en: 'Get the stretcher. We take them to the National Hospital.' }],
  lift: [{ en: 'On three — one, two, three. Lift.' }],
  // 75th: the body is under something / wedged where nobody can kneel beside it — the crew does not clip in, it gives up
  unreachM: [{ en: "We won't be able to treat him — we can't get to him." }, { si: 'අපිට එයාට ප්‍රතිකාර කරන්න බෑ — ළඟට යන්න විදියක් නෑ.', tr: "We won't be able to treat him — there's no way to get to him." }],
  unreachF: [{ en: "We won't be able to treat her — we can't get to her." }, { si: 'අපිට එයාට ප්‍රතිකාර කරන්න බෑ — ළඟට යන්න විදියක් නෑ.', tr: "We won't be able to treat her — there's no way to get to her." }],
};

// ------------------------------------------------------------------ props
const ST = { len: 2.2, half: 1.1, poleX: 0.28, poleY: 0.36, top: 0.43, handZ: 1.1 }; // stretcher, local: +z = feet end, y = 0 floor
// 75th: an ambulance cot, not a stick stretcher. Aluminium side rails with black grips at both ends (the medics' hands go
// exactly there — ST.poleX / poleY / handZ), a deck under a black vinyl mattress with piping, folded side rails, three
// black straps with steel buckles, two loading wheels at the head end, and an X-frame undercarriage on four swivel
// castors. The undercarriage is live (setCotLegs): folded flat inside the van, each end drops to the ground as it leaves
// the doors, so the cot stands on its wheels while it is wheeled; lowered to the ground beside a patient it folds again.
let cotMats = null;
function cotMaterials() {
  if (cotMats) return cotMats; const c = document.createElement('canvas'); c.width = 64; c.height = 256; const x = c.getContext('2d');
  x.fillStyle = '#1c1e22'; x.fillRect(0, 0, 64, 256); for (let i = 0; i < 900; i++) { x.fillStyle = `rgba(255,255,255,${Math.random() * 0.03})`; x.fillRect(Math.random() * 64, Math.random() * 256, 1, 1); } // vinyl grain
  x.fillStyle = 'rgba(0,0,0,0.55)'; for (const y of [70, 150]) x.fillRect(0, y, 64, 2); x.fillStyle = 'rgba(255,255,255,0.08)'; for (const y of [72, 152]) x.fillRect(0, y, 64, 1); // section seams
  x.strokeStyle = 'rgba(120,124,130,0.5)'; x.lineWidth = 2; x.strokeRect(2, 2, 60, 252); // piping
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  cotMats = { alu: new THREE.MeshStandardMaterial({ color: 0xc9cdd3, metalness: 0.8, roughness: 0.3 }), blk: new THREE.MeshStandardMaterial({ color: 0x18191c, roughness: 0.75 }),
    pad: new THREE.MeshStandardMaterial({ map: t, roughness: 0.45 }), deck: new THREE.MeshStandardMaterial({ color: 0x3a3e44, metalness: 0.4, roughness: 0.6 }),
    strap: new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.85 }), steel: new THREE.MeshStandardMaterial({ color: 0xd8dade, metalness: 0.9, roughness: 0.25 }), yel: new THREE.MeshStandardMaterial({ color: 0xe8b41c, roughness: 0.5 }) };
  return cotMats;
}
const COT = { legZ: 0.55, frameY: ST.poleY - 0.045, baseY: 0.075, wheelR: 0.062, maxExt: 0.5 };
function buildStretcher() {
  const g = new THREE.Group(); g.name = 'emsStretcher'; const M = cotMaterials();
  const tube = (r, len, mat, axis = 'z') => { const geo = new THREE.CylinderGeometry(r, r, len, 10); if (axis === 'z') geo.rotateX(Math.PI / 2); else if (axis === 'x') geo.rotateZ(Math.PI / 2); return new THREE.Mesh(geo, mat); };
  for (const x of [-ST.poleX, ST.poleX]) { const m = tube(0.018, ST.len - 0.24, M.alu); m.position.set(x, ST.poleY, 0); g.add(m);
    for (const z of [-ST.handZ + 0.07, ST.handZ - 0.07]) { const h = tube(0.022, 0.14, M.blk); h.position.set(x, ST.poleY, z); g.add(h); } // grips
    const rail = tube(0.011, 1.3, M.alu); rail.position.set(x * 1.07, ST.top - 0.005, 0.05); g.add(rail); for (const z of [-0.6, 0.7]) { const post = tube(0.009, 0.07, M.alu, 'y'); post.position.set(x * 1.07, ST.top - 0.04, z); g.add(post); } } // folded safety rails
  for (const z of [-ST.handZ + 0.15, ST.handZ - 0.15, -0.3, 0.35]) { const m = tube(0.014, ST.poleX * 2, M.alu, 'x'); m.position.set(0, ST.poleY - 0.012, z); g.add(m); }
  const deck = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.014, 1.92), M.deck); deck.position.set(0, ST.top - 0.075, 0.02); g.add(deck);
  const pad = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.065, 1.9), M.pad); pad.position.set(0, ST.top - 0.033, 0.02); g.add(pad);
  const pil = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.34, 3, 8), M.pad); pil.rotation.z = Math.PI / 2; pil.scale.set(1, 1, 0.55); pil.position.set(0, ST.top + 0.012, -0.8); g.add(pil);
  for (const z of [-0.3, 0.15, 0.62]) { const st = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.006, 0.048), M.strap); st.position.set(0, ST.top + 0.004, z); g.add(st); const bk = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.012, 0.055), M.steel); bk.position.set(0.04, ST.top + 0.01, z); g.add(bk); }
  for (const sx of [-1, 1]) { const lw = tube(0.035, 0.035, M.blk, 'x'); lw.position.set(sx * 0.16, ST.poleY - 0.07, -ST.handZ + 0.1); g.add(lw); } // head-end loading wheels
  // undercarriage (posed by setCotLegs): X legs, base side tubes, cross tubes + castors at both ends
  const U = { legs: [], base: [], cross: [], wheels: [], ext: [0, 0] }; const unitY = new THREE.CylinderGeometry(1, 1, 1, 8);
  for (let i = 0; i < 4; i++) { const m = new THREE.Mesh(unitY, M.alu); m.scale.set(0.015, 1, 0.015); g.add(m); U.legs.push(m); }
  for (let i = 0; i < 2; i++) { const m = new THREE.Mesh(unitY, M.alu); m.scale.set(0.014, 1, 0.014); g.add(m); U.base.push(m); }
  for (let i = 0; i < 2; i++) { const m = tube(0.016, 0.5, M.alu, 'x'); g.add(m); U.cross.push(m); }
  const wGeo = new THREE.CylinderGeometry(COT.wheelR, COT.wheelR, 0.035, 14); wGeo.rotateZ(Math.PI / 2); const fork = new THREE.BoxGeometry(0.05, 0.07, 0.02);
  for (let i = 0; i < 4; i++) { const w = new THREE.Group(); const wh = new THREE.Mesh(wGeo, M.blk); const fk = new THREE.Mesh(fork, M.yel); fk.position.y = COT.wheelR * 0.9; w.add(wh, fk); g.add(w); U.wheels.push(w); }
  g.userData.cot = U; setCotLegs(g, 0, 0, true);
  g.traverse((q) => { if (q.isMesh) q.castShadow = true; });
  return g;
}
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
function stick(m, A, B) { _b.subVectors(B, A); const L = _b.length() || 1e-3; m.position.addVectors(A, B).multiplyScalar(0.5); m.scale.y = L; m.quaternion.setFromUnitVectors(_up, _b.multiplyScalar(1 / L)); }
// eH / eF: how far the head / feet end's wheels reach below the cot's floor plane (0 = folded, wheels at the deck's base)
function setCotLegs(st, eH, eF, snap = false) {
  const U = st && st.userData.cot; if (!U) return; if (!snap && Math.abs(U.ext[0] - eH) < 1e-4 && Math.abs(U.ext[1] - eF) < 1e-4) return; U.ext[0] = eH; U.ext[1] = eF;
  const yb = [COT.baseY - eH, COT.baseY - eF]; const fold = [1 - Math.min(1, eH / 0.3), 1 - Math.min(1, eF / 0.3)]; // folded: the base ends slide in toward the middle (scissor)
  const zb = [-COT.legZ * (1 - 0.22 * fold[0]), COT.legZ * (1 - 0.22 * fold[1])];
  for (let s = 0; s < 2; s++) { const x = (s ? 1 : -1) * (ST.poleX - 0.05); const bH = new THREE.Vector3(x, yb[0], zb[0]), bF = new THREE.Vector3(x, yb[1], zb[1]);
    stick(U.legs[s * 2], _a.set(x, COT.frameY, -COT.legZ), bF); stick(U.legs[s * 2 + 1], _a.set(x, COT.frameY, COT.legZ), bH); stick(U.base[s], bH, bF);
    U.wheels[s * 2].position.set(x, yb[0] - COT.baseY + COT.wheelR, zb[0]); U.wheels[s * 2 + 1].position.set(x, yb[1] - COT.baseY + COT.wheelR, zb[1]); }
  U.cross[0].position.set(0, yb[0], zb[0]); U.cross[1].position.set(0, yb[1], zb[1]);
}
// 75th: a real cloth, not a reveal. A 1.05 × 2.3 m white sheet (hospital cotton, one mesh): the medics spread it out
// taut between them at chest height, lower it, and it settles over the body — highest points (face, toes) first — then hangs
// over the stretcher's sides and ends. The body shape is a set of capsules along the ragdoll's bones (torso, limbs, hands,
// feet up, head), so arms / hands / feet / nose can't poke through between joints; once it is down the body itself is
// hidden (the sheet carries its silhouette), so nothing can clip through while it is carried, loaded or wheeled in.
const SH = { w: 1.05, len: 2.3, padX: 0.29, padZ: 1.0, nx: 16, nz: 44 };
const SH_BONES = [['pelvis', 'chest', 0.15], ['chest', 'neck', 0.135], ['neck', 'head', 0.07], ['head', 'head', 0.115], ['shL', 'shR', 0.085], ['hipL', 'hipR', 0.115], ['pelvis', 'hipL', 0.1], ['pelvis', 'hipR', 0.1],
  ['shL', 'elL', 0.06], ['shR', 'elR', 0.06], ['elL', 'wrL', 0.052], ['elR', 'wrR', 0.052], ['hipL', 'knL', 0.085], ['hipR', 'knR', 0.085], ['knL', 'anL', 0.065], ['knR', 'anR', 0.065]].map(([a, b, r]) => [IX[a], IX[b], r]);
let sheetTex = null;
function sheetTexture() { // 128² woven cotton: faint warp/weft, a hemmed border, a fold crease — tiny, shared by every sheet
  if (sheetTex) return sheetTex; const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
  x.fillStyle = '#f2f2ee'; x.fillRect(0, 0, 128, 128); for (let i = 0; i < 128; i += 2) { x.fillStyle = `rgba(120,120,110,${0.025 + (i % 6 === 0 ? 0.02 : 0)})`; x.fillRect(i, 0, 1, 128); x.fillRect(0, i, 128, 1); }
  for (let i = 0; i < 500; i++) { x.fillStyle = `rgba(90,90,80,${Math.random() * 0.04})`; x.fillRect(Math.random() * 128, Math.random() * 128, 1 + Math.random() * 2, 1); }
  x.fillStyle = 'rgba(150,150,140,0.18)'; x.fillRect(0, 0, 128, 3); x.fillRect(0, 125, 128, 3); x.fillRect(0, 0, 3, 128); x.fillRect(125, 0, 3, 128);
  sheetTex = new THREE.CanvasTexture(c); sheetTex.colorSpace = THREE.SRGBColorSpace; sheetTex.wrapS = sheetTex.wrapT = THREE.RepeatWrapping; sheetTex.repeat.set(3, 6); sheetTex.anisotropy = 2; return sheetTex; }
let sheetMat = null;
function buildSheet() {
  const geo = new THREE.PlaneGeometry(SH.w, SH.len, SH.nx, SH.nz); geo.rotateX(-Math.PI / 2);
  sheetMat = sheetMat || new THREE.MeshStandardMaterial({ color: 0xffffff, map: sheetTexture(), roughness: 0.93, side: THREE.DoubleSide });
  const m = new THREE.Mesh(geo, sheetMat); m.name = 'emsSheet'; m.castShadow = true; m.receiveShadow = true; m.userData.base = Float32Array.from(geo.attributes.position.array); m.userData.fin = new Float32Array(geo.attributes.position.array.length); m.visible = false; return m;
}
// the settled shape (stretcher space): cloth on the capsules, sagging between them onto the mattress, hanging over the edges
function sheetRest(sheet, local) {
  const base = sheet.userData.base, fin = sheet.userData.fin, n = base.length / 3; const caps = SH_BONES.map(([a, b, r]) => [local[a], local[b], r]);
  for (let i = 0; i < n; i++) { const x0 = base[i * 3], z0 = base[i * 3 + 2]; const x = Math.max(-SH.padX, Math.min(SH.padX, x0)), z = Math.max(-SH.padZ, Math.min(SH.padZ, z0));
    let h = ST.top + 0.012; for (const [A, B, r] of caps) { const abx = B.x - A.x, abz = B.z - A.z, L2 = abx * abx + abz * abz; let t = L2 > 1e-6 ? ((x - A.x) * abx + (z - A.z) * abz) / L2 : 0; t = Math.max(0, Math.min(1, t));
      const cx = A.x + abx * t, cz = A.z + abz * t, cy = A.y + (B.y - A.y) * t; const d = Math.hypot(x - cx, z - cz); const R = r + 0.018; // cloth thickness + ease
      const y = d < R ? cy + Math.sqrt(R * R - d * d) : cy + R * 0.0 - (d - R) * 0.9 - (d - R) * (d - R) * 3.5; if (y > h) h = y; } // over the body, then a tented fall to the mattress
    const ox = Math.max(0, Math.abs(x0) - SH.padX), oz = Math.max(0, Math.abs(z0) - SH.padZ); const hang = Math.hypot(ox, oz); // beyond the pad edge: hangs straight down (slightly out)
    fin[i * 3] = x + Math.sign(x0) * Math.min(ox, 0.025); fin[i * 3 + 1] = (hang > 0 ? Math.min(h, ST.top + 0.03) : h) - hang; fin[i * 3 + 2] = z + Math.sign(z0) * Math.min(oz, 0.025); }
}
// m: 0 folded in the hands · 0..0.25 spread taut at chest height · 0.25..1 lowered until it rests on sheetRest's shape
function drapeSheet(sheet, m) {
  const pos = sheet.geometry.attributes.position, base = sheet.userData.base, fin = sheet.userData.fin; const spread = Math.min(1, m / 0.25), low = Math.max(0, (m - 0.25) / 0.75);
  const H0 = ST.top + 0.62, yPlane = H0 + (ST.top - 0.35 - H0) * sm(low);
  for (let i = 0; i < pos.count; i++) { const bx = base[i * 3], bz = base[i * 3 + 2]; const u = bz / (SH.len / 2);
    const fx = bx * (0.25 + 0.75 * sm(spread)), fy = yPlane - 0.07 * (1 - u * u) * (0.3 + 0.7 * spread) - 0.03 * (bx / (SH.w / 2)) ** 2; // held at the four corners: sags in the middle
    const ty = fin[i * 3 + 1]; const w = sm(Math.max(0, Math.min(1, (ty + 0.04 - fy) / 0.08))); // touched down → follows the rest shape
    pos.setXYZ(i, fx + (fin[i * 3] - fx) * w, Math.max(fy, ty) * (1 - w) + ty * w, bz + (fin[i * 3 + 2] - bz) * w); }
  pos.needsUpdate = true; sheet.geometry.computeVertexNormals(); sheet.geometry.computeBoundingSphere(); sheet.visible = m > 0.001;
}
function sheetCorner(m, sx, sz) { // where the medics' hands hold the cloth (stretcher space), for the IK targets
  const spread = Math.min(1, m / 0.25), low = Math.max(0, (m - 0.25) / 0.75); const H0 = ST.top + 0.62, y = H0 + (ST.top - 0.35 - H0) * sm(low);
  return [sx * SH.w / 2 * (0.25 + 0.75 * sm(spread)), Math.max(ST.top + 0.12, y + 0.02), sz * SH.len / 2]; }
function buildBVM() { // 75th: adult bag-valve-mask — clear mask with a blue air cushion, elbow + valve, a ribbed self-inflating bag, green O2 reservoir and tubing
  const g = new THREE.Group(); const clear = new THREE.MeshStandardMaterial({ color: 0xe6f0f2, roughness: 0.15, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false });
  const prof = []; for (let i = 0; i <= 12; i++) { const t = i / 12; prof.push(new THREE.Vector2(0.012 + Math.sin(t * Math.PI) * 0.056 * (1 + 0.06 * Math.sin(t * Math.PI * 9)), t * 0.24)); } // ribbed bag profile
  const bagGeo = new THREE.LatheGeometry(prof, 16); bagGeo.rotateX(Math.PI / 2); const bag = new THREE.Mesh(bagGeo, new THREE.MeshStandardMaterial({ color: 0xbfe0d6, roughness: 0.35, transparent: true, opacity: 0.8 })); bag.position.z = 0.07; g.add(bag);
  const mask = new THREE.Mesh(new THREE.ConeGeometry(0.058, 0.06, 18, 1, true), clear); mask.rotation.x = Math.PI; mask.position.y = -0.02; g.add(mask);
  const cush = new THREE.Mesh(new THREE.TorusGeometry(0.052, 0.012, 8, 20), new THREE.MeshStandardMaterial({ color: 0x3a7fd0, roughness: 0.4 })); cush.rotation.x = Math.PI / 2; cush.position.y = -0.05; g.add(cush);
  const elbow = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.07, 10), new THREE.MeshStandardMaterial({ color: 0x2b6fc0, roughness: 0.4 })); elbow.rotation.x = Math.PI / 2; elbow.position.set(0, 0.012, 0.035); g.add(elbow);
  const res = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), new THREE.MeshStandardMaterial({ color: 0x4caf62, roughness: 0.5, transparent: true, opacity: 0.75 })); res.scale.set(0.8, 0.6, 1.6); res.position.z = 0.4; g.add(res);
  const tubeCurve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0.32), new THREE.Vector3(0.08, -0.06, 0.4), new THREE.Vector3(0.18, -0.1, 0.38), new THREE.Vector3(0.3, -0.11, 0.3)]);
  const tb = new THREE.Mesh(new THREE.TubeGeometry(tubeCurve, 12, 0.005, 6), new THREE.MeshStandardMaterial({ color: 0x5fc27a, roughness: 0.4, transparent: true, opacity: 0.85 })); g.add(tb);
  g.userData.bag = bag; return g;
}
// 75th: response bag (red trauma bag with reflective bands and a Star of Life) and an AED (green / yellow), set down beside the patient
let kitTex = null;
function kitTexture() { if (kitTex) return kitTex; const c = document.createElement('canvas'); c.width = 128; c.height = 64; const x = c.getContext('2d');
  x.fillStyle = '#b8231d'; x.fillRect(0, 0, 128, 64); for (let i = 0; i < 400; i++) { x.fillStyle = `rgba(0,0,0,${Math.random() * 0.12})`; x.fillRect(Math.random() * 128, Math.random() * 64, 1, 1); } // cordura weave
  x.fillStyle = '#d9dcd6'; x.fillRect(0, 12, 128, 5); x.fillRect(0, 47, 128, 5); x.fillStyle = '#1a1a1a'; x.fillRect(0, 0, 128, 3); x.fillRect(0, 61, 128, 3); x.fillRect(62, 0, 4, 64); // reflective bands, zip seams
  x.fillStyle = '#1d4fa0'; x.save(); x.translate(96, 32); for (let k = 0; k < 3; k++) { x.rotate(Math.PI / 3); x.fillRect(-2.5, -10, 5, 20); } x.restore(); x.fillStyle = '#fff'; x.fillRect(95, 24, 2, 16);
  kitTex = new THREE.CanvasTexture(c); kitTex.colorSpace = THREE.SRGBColorSpace; return kitTex; }
function buildKit() {
  const g = new THREE.Group(); g.name = 'emsKit';
  const bag = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.26, 0.3), new THREE.MeshStandardMaterial({ map: kitTexture(), roughness: 0.85 })); bag.position.set(0, 0.13, 0); g.add(bag);
  const hdl = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.012, 6, 12, Math.PI), new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.8 })); hdl.position.set(0, 0.26, 0); g.add(hdl);
  const aed = new THREE.Group(); aed.position.set(0.05, 0, 0.42); g.add(aed);
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.085, 0.3), new THREE.MeshStandardMaterial({ color: 0x2f8d4e, roughness: 0.55 })); body.position.y = 0.0425; aed.add(body);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.2), new THREE.MeshStandardMaterial({ map: aedTexture(), roughness: 0.4 })); face.rotation.x = -Math.PI / 2; face.position.y = 0.0855; aed.add(face);
  g.traverse((q) => { if (q.isMesh) q.castShadow = true; }); return g; }
let aedTex = null;
function aedTexture() { if (aedTex) return aedTex; const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); x.fillStyle = '#e9ece6'; x.fillRect(0, 0, 64, 64);
  x.fillStyle = '#111'; x.fillRect(6, 6, 52, 22); x.fillStyle = '#39e36f'; x.fillRect(9, 16, 46, 1); x.fillRect(24, 10, 2, 7); // screen with ECG
  x.fillStyle = '#f0b81c'; x.beginPath(); x.arc(32, 44, 9, 0, 7); x.fill(); x.fillStyle = '#c0281f'; x.beginPath(); x.moveTo(30, 38); x.lineTo(35, 43); x.lineTo(31, 44); x.lineTo(35, 50); x.lineTo(28, 44); x.lineTo(32, 43); x.fill(); // shock button
  x.fillStyle = '#2f8d4e'; x.beginPath(); x.arc(12, 44, 4, 0, 7); x.fill(); aedTex = new THREE.CanvasTexture(c); aedTex.colorSpace = THREE.SRGBColorSpace; return aedTex; }

export class EMS {
  constructor(pr) { this.pr = pr; this.g = pr.g; this.units = []; this.stats = { calls: 0, sent: 0, koRevived: 0, revived: 0, carried: 0, refused: 0, incidents: 0, auto: 0, toHospital: 0, delivered: 0, bayFail: 0 }; this.force = null; this.siren = null; this.t = 0;
    this.incidents = new Map(); this.scanT = 2; this.MAX_UNITS = 1; }
  get crowd() { return this.g.crowd; }
  // ---------------------------------------------------------------- the phone call
  findPatient(r = 40) {
    const P = this.g.player, C = this.crowd; if (!C) return null; let best = null, bd = r;
    for (const p of C.peds) { if (p.state !== 'down' || p.awaitMedic || p.emsNoReach || !p.ch.root.parent || (p.ch.rag && p.ch.rag.kin)) continue; const d = Math.hypot(p.x - P.x, p.z - P.z); if (d < bd) { bd = d; best = p; } }
    return best;
  }
  call(opts = {}) { // opts.at: {x, z, yaw} spawn the ambulance on that lane (tests)
    const g = this.g; this.stats.calls++;
    if (g.indoor) return this.refuse('Go outside first — the crew has to be able to reach the patient.');
    if (this.active()) return this.refuse('An ambulance is already on its way to you.');
    if (this.full()) return this.refuse('No ambulance free right now — try again in a moment.');
    const p = this.findPatient(); if (!p) return this.refuse('There is nobody down near you (within 40 m) — no ambulance sent. Call again next to the injured person.');
    if (!this.dispatch(p, opts)) return this.refuse('No ambulance can reach you right now — try again in a moment.');
    return { ok: true, title: '1990 Suwa Seriya', msg: `Ambulance dispatched — ${p.dead ? 'a person not breathing' : 'an unconscious person'}. Stay with them; the crew will be there shortly.` };
  }
  // one ambulance for patient p: spawned on a road out of view, routed by the lane AI (never placed next to the patient)
  dispatch(p, opts = {}) {
    if (!p || p.awaitMedic || p.emsNoReach || this.full()) return null;
    const u = this.pr.spawnUnit({ ems: true, at: opts.at || null, near: true }) || (opts.at ? null : this.pr.spawnUnit({ ems: true })); if (!u) return null;
    this.pr.units = this.pr.units.filter((q) => q !== u); this.units.push(u); u.ems = true; u.task = 'ems';
    u.e = { ph: 'drive', t: 0, p, dead: !!p.dead, deadT0: p.deadT || 0, ct: 0, auto: !!opts.auto }; p.awaitMedic = true; p.keep = true; u.v.ai.v0 = 14; u.v.ems = true;
    if (!this.pr.plan(u, p.x, p.z)) { this.removeUnit(u); return null; }
    this.incidents.delete(p); this.stats.sent++; this.pr.note(`EMS unit ${u.id} sent (${p.dead ? 'not breathing' : 'unconscious'}${opts.auto ? ', bystander call' : ''})`);
    return u;
  }
  // bystanders: record civilians down near the player, phone it in after a while (one incident per person, never twice)
  scan() {
    const C = this.crowd, g = this.g, P = g.player; if (!C || !P) return;
    for (const [p, inc] of this.incidents) if (p.awaitMedic || p.state !== 'down' || !p.ch.root.parent || p.recycle || !C.peds.includes(p) || this.t - inc.t > 300) this.incidents.delete(p);
    for (const p of C.peds) { if (p.state !== 'down' || p.awaitMedic || p.emsNoReach || p.recycle || this.incidents.has(p) || !p.ch.root.parent || (p.ch.rag && p.ch.rag.kin) || p.helpedUp) continue;
      if (!(p.dead || (p.downT || 0) > 8)) continue; if (Math.hypot(p.x - P.x, p.z - P.z) > 130) continue; // serious: not breathing, or still out after 8 s
      this.incidents.set(p, { x: p.x, z: p.z, t: this.t, due: this.t + 12 + Math.random() * 16, dead: !!p.dead, tries: 0 }); this.stats.incidents++; }
    if (!this.incidents.size || this.full() || g.indoor || (this.pr.level | 0) >= 3) return; // a gunfight: no crew sent in until it is over
    let best = null; for (const [p, inc] of this.incidents) if (this.t >= inc.due && (!best || inc.t < best[1].t)) best = [p, inc]; if (!best) return;
    const [p, inc] = best; const u = this.dispatch(p, { auto: true });
    if (u) { this.stats.auto++; if (Math.hypot(p.x - P.x, p.z - P.z) < 70) g.hud.notify?.('1990 Suwa Seriya', 'Someone nearby has called an ambulance.', 'info', 3.5); }
    else if (++inc.tries >= 4) this.incidents.delete(p); else inc.due = this.t + 20; // no unit can reach: try again a little later, then give up
  }
  refuse(msg) { this.stats.refused++; return { ok: false, title: '1990 Suwa Seriya', msg }; }
  removeUnit(u) {
    const e = u.e; if (e) { this.dropProps(u); this.dropCargo(u); if (e.kit) { e.kit.parent?.remove(e.kit); e.kit = null; } const p = e.p; if (p && p.awaitMedic) { p.awaitMedic = false; p.keep = false; } }
    this.units = this.units.filter((q) => q !== u); this.pr.units.push(u); this.pr.removeUnit(u);
  }
  dropCargo(u) { const e = u.e; if (!e) return; for (const m of [...(e.cargo || []), e.st, e.sheet]) { if (!m) continue; m.parent?.remove(m); m.traverse((q) => { if (q.isMesh) { q.geometry.dispose(); for (const mt of [].concat(q.material)) mt.dispose(); } }); } e.cargo = null; e.st = null; e.sheet = null; }
  // ---------------------------------------------------------------- the National Hospital run (74th)
  bayInfo() { const H = this.g.hospital; return H && H.emsBay ? H.emsBay : null; }
  // another van still standing in the bay: it slips away if nobody is looking, otherwise this one waits its turn (drives round)
  bayTaken(u) { for (const q of this.units) { if (q === u || !q.e || (q.e.ph !== 'parked' && q.e.ph !== 'bay' && q.e.toBay !== 'in')) continue;
    if (q.e.ph === 'parked' && !this.pr.inView(q.v)) { this.removeUnit(q); continue; } return true; } return false; }
  // units on a job (a van parked at the hospital after a run does not block the next call; at most one more vehicle on the map)
  active() { let n = 0; for (const q of this.units) if (!q.e || q.e.ph !== 'parked') n++; return n; }
  full() { return this.active() >= this.MAX_UNITS || this.units.length >= this.MAX_UNITS + 1; }
  toBay(u, dt) {
    const g = this.g, pr = this.pr, v = u.v, ai = v.ai, e = u.e, B = this.bayInfo(); e.bayT += dt; const P = g.player;
    if (!B) { e.toBay = null; return; }
    // nobody watching and far away: the crew is "at the hospital" — the unit goes back to the pool (no visible jump)
    if (Math.hypot(v.x - P.x, v.z - P.z) > 220 && !pr.inView(v)) { this.stats.delivered++; pr.note(`EMS unit ${u.id} delivered (out of sight)`); this.removeUnit(u); return; }
    if (e.toBay === 'road') {
      const p0 = ai.pieces[0]; if (v.speed < 0.3) u.stuckT = (u.stuckT || 0) + dt; else u.stuckT = 0;
      // on a lane that runs past the gate (the gate within ~10 m of its line, ahead of us): turn in from it
      if (p0 && p0.type === 'line' && !ai.rejoin) { const al = (B.gate.x - p0.p0[0]) * p0.d[0] + (B.gate.z - p0.p0[1]) * p0.d[1], lat = Math.abs((B.gate.x - p0.p0[0]) * p0.d[1] - (B.gate.z - p0.p0[1]) * p0.d[0]);
        if (lat < 14 && al > ai.s + 9 && al < p0.len + 2 && !this.bayTaken(u)) { const sA = Math.max(ai.s + 2, al - 7); const path = this.bayPath(p0, sA, B); const cut = { ...p0, p1: [p0.p0[0] + p0.d[0] * sA, p0.p0[1] + p0.d[1] * sA], len: sA };
          ai.pieces = [cut, path]; ai.route = null; ai.goal = null; ai.park = { path, bay: true }; ai.sMaxP = path; ai.sMax = path.len - 0.02; ai.v0 = 8; e.toBay = 'in'; e.inT = 0; return; } }
      // stopped at the routing goal without a way in (came at it from the wrong side / too close): go round the block and try again
      const gd = ai.goal && ai.goal.dist !== undefined ? ai.goal.dist : Infinity; if (!ai.goal && !ai.route && v.speed < 0.5) u.stuckT += dt * 2;
      if (u.stuckT > 6 || (gd < 6 && v.speed < 0.6)) { v.dbgOn = true; const by = ai.dbgBy === 'body' && ai.bodyBlock ? ai.bodyBlock : ai.dbgBy; e.dbg = [ai.stopped ? 'stopped' : 'run', 'gap ' + (+(ai.dbgGap ?? -1)).toFixed(1), 'stop ' + (+(ai.dbgStop ?? -1)).toFixed(1), 'goal ' + (+gd).toFixed(1), !by ? '-' : typeof by === 'string' ? by : (by.parked ? 'parked ' : by.ai ? 'car ' : by.ch ? 'ped ' : 'obj ') + (by.id ?? '') + (by.police ? ' police' : '') + ' @' + Math.hypot(by.x - v.x, by.z - v.z).toFixed(1), 'p0 ' + (ai.pieces[0] ? ai.pieces[0].type : 'none') + ' n' + ai.pieces.length, 'em ' + (ai.emergency ? 1 : 0) + (v.beaconsOn ? 'b' : '')];
        u.stuckT = 0; if ((e.replans | 0) >= 1) e.blockLit = true; /* held up on the way (a car standing in the lane, a jam): lights on — traffic pulls over and the van may pass it */ e.replans = (e.replans || 0) + 1; ai.goal = null; ai.route = null; if (!this.planBay(u, B)) e.bayT += 60; }
      if (e.bayT > 300) { e.toBay = null; e.transport = false; this.stats.bayFail++; pr.note(`EMS unit ${u.id} could not reach the hospital`); ai.route = null; ai.goal = null; ai.park = null; } // drives on; recycled out of view
      return; }
    // pulling in through the gate to the bay
    e.inT += dt; const path = ai.park && ai.park.path;
    if (path && ai.pieces[0] === path && ai.s > path.len - 0.35 && v.speed < 0.15) { ai.stopped = true; ai.park = null; ai.sMaxP = null; e.toBay = null; e.ph = 'bay'; e.t = 0; e.bp = 'stop'; pr.note(`EMS unit ${u.id} in the hospital bay`); return; }
    if (e.inT > 60) { ai.park = null; ai.sMaxP = null; e.toBay = null; e.transport = false; this.stats.bayFail++; ai.stopped = false; }
  }
  // 74th: the ±30 m point fell into the next junction on this short block (the van circled the block until the 300 s limit):
  // now the goal is 12 m BEFORE the gate on the hospital-side lane (left-hand traffic: the lane with the gate on its left, so
  // the turn-in is a left turn) — on that lane the turn-in check above fires as soon as the gate is ≥ 9 m ahead
  planBay(u, B) { const ax = B.road.x - B.gate.x, az = B.road.z - B.gate.z; const L = Math.hypot(ax, az) || 1; const fx = az / L, fz = -ax / L; // the hospital-side lane's direction
    return this.pr.plan(u, B.road.x - fx * 12, B.road.z - fz * 12); }
  // the lane → the gate (the kerb S of the parking arrivals) → straight down the drive to the bay, as one path piece
  bayPath(p0, sA, B) {
    const a = parkPath(p0, sA, { x: B.gate.x, z: B.gate.z, yaw: B.yaw }); const last = a.poly[a.poly.length - 1]; const L = Math.hypot(B.x - B.gate.x, B.z - B.gate.z); const n = Math.max(2, Math.ceil(L / 0.25));
    for (let j = 1; j <= n; j++) { const t = j / n; a.poly.push([B.gate.x + (B.x - B.gate.x) * t, B.gate.z + (B.z - B.gate.z) * t, last[2]]); a.cum.push(a.cum[a.cum.length - 1] + L / n); a.vlim.push(4); }
    a.len = a.cum[a.cum.length - 1]; for (let i = 0; i < a.vlim.length; i++) a.vlim[i] = Math.min(a.vlim[i], 6); a.bay = true; return a;
  }
  // in the bay: doors open, the stretcher out and wheeled in through the emergency entrance, the crew back, the van waits
  atBay(u, dt) {
    const e = u.e, v = u.v, pr = this.pr, B = this.bayInfo(), A = u.officers[0], Bm = u.officers[1] || A; if (!B) { e.ph = 'parked'; return; }
    v.ai.stopped = true; v.speed = 0;
    switch (e.bp) {
      case 'stop': if (e.t > 1.2) { pr.dismount(u, 'ems'); u.task = 'ems'; e.bp = 'out'; e.t = 0; } return;
      case 'out': if (u.officers.every((o) => o.mode === 'foot') || e.t > 12) { e.bp = 'rear'; e.t = 0; } return;
      case 'rear': { const ca = this.vanPt(u, AMB.rearZ - 0.75, -0.75), cb = this.vanPt(u, AMB.rearZ - 0.75, 0.75); this.spot(A, ca.x, ca.z, v.yaw, null, {}); this.spot(Bm, cb.x, cb.z, v.yaw, null, {});
        if ((this.at(A, 0.5) && this.at(Bm, 0.5)) || e.t > 15) { e.rearOpen = true; if (e.rear === undefined) e.rear = 0; if (e.rear > 0.95) { e.bp = 'unload'; e.t = 0; this.takeCargo(u); } } return; }
      case 'unload': { // slide it out feet first (B), set it on its wheels, A to the head end
        const zIn = AMB.rearZ + ST.half + 0.05, zOut = AMB.rearZ - ST.half - 0.9; const k = sm(Math.min(1, e.t / 2.4)); if (!e.pullSnd) { e.pullSnd = true; const c0 = this.vanPt(u, zIn); HospitalSound.trolleyPull(c0.x, c0.z); } const c = this.vanPt(u, zIn + (zOut - zIn) * k); const S = e.S; S.x = c.x; S.z = c.z; S.yaw = v.yaw + Math.PI;
        const gy = this.g.collision.groundAt(c.x, c.z, v.y + 0.5); S.y = (v.y + AMB.doorY0) + ((gy + 0.42) - (v.y + AMB.doorY0)) * sm((k - 0.45) / 0.55);
        this.carryHands(u, true, 1, 'feet'); for (const o of u.officers) if (o.want) o.want.speed = k < 1 ? 0.4 : 0; this.syncStretcher(u);
        if (e.t > 2.6) { e.bp = 'wheel'; e.t = 0; e.from = { x: S.x, z: S.z }; } return; }
      case 'wheel': { // to the emergency entrance and in (the sliding doors open for the crew)
        const S = e.S; const BR = this.g.hospital && this.g.hospital.bodyRoom; if (BR && e.sheet) { e.bp = 'room'; e.t = 0; e.wi = 0; return; } const way = [B.door, B.inside]; const tg = way[e.wi || 0]; const dx = tg.x - S.x, dz = tg.z - S.z, d = Math.hypot(dx, dz);
        if (d < 0.15) { e.wi = (e.wi || 0) + 1; if (e.wi >= way.length) { e.bp = 'handed'; e.t = 0; this.dropCargo(u); this.stats.delivered++; pr.note(`EMS unit ${u.id} patient handed over at the emergency entrance`); for (const o of u.officers) { o.want = null; o.ch.anim.set(null); o.ch.anim.holdWL = o.ch.anim.holdWR = null; } } return; }
        const st = Math.min(d, 1.05 * dt); const want = Math.atan2(dx, dz); /* feet end leads: the stretcher's +z (feet) points the way it goes */ S.yaw += angDiff(want, S.yaw) * Math.min(1, dt * 3); S.x += dx / d * st; S.z += dz / d * st;
        S.y = this.g.collision.groundAt(S.x, S.z, S.y) + 0.42; if (this.g.hospital && Math.hypot(S.x - B.inside.x, S.z - B.inside.z) < 4) S.y = this.g.hospital.FLOOR_Y[0] + 0.42;
        this.carryHands(u, true, 1, 'feet'); for (const o of u.officers) if (o.want) o.want.speed = 1.05; this.syncStretcher(u);
        if (e.t > 40) { e.wi = 9; } return; }
      // 75th: a covered body goes to the body holding room (HospitalBodyRoom.js), not in through the ED: straight from the
      // van to its door (it opens for the crew), across onto the steel trolley, the empty cot back to the van and in
      case 'room': case 'back': { const BR = this.g.hospital.bodyRoom, Pt = BR.points, S = e.S; const back = e.bp === 'back';
        const rear = this.vanPt(u, AMB.rearZ - ST.half - 0.9); const [, rv] = this.g.hospital.toLocal(rear.x, rear.z); const s0 = BR.W(BR.lane, rv + 0.4), s1 = BR.W(BR.lane, 8.6); // round the van's side (it stands nose-in, rear doors to the street)
        const way = back ? [Pt.door, Pt.out, s1, s0, rear] : [s0, s1, Pt.out, Pt.door, Pt.cot]; const tg = way[e.wi || 0];
        const dx = tg.x - S.x, dz = tg.z - S.z, d = Math.hypot(dx, dz); BR.want(S.x, S.z); for (const o of u.officers) BR.want(o.x, o.z);
        if (d < 0.12) { e.wi = (e.wi || 0) + 1; if (e.wi >= way.length) { e.t = 0; e.wi = 0; if (back) { e.bp = 'restow'; e.pullSnd = false; } else { e.bp = 'transfer'; e.from = { x: S.x, y: S.y, z: S.z }; } } return; }
        const st = Math.min(d, 1.0 * dt); const want = Math.atan2(dx, dz) + (back ? Math.PI : 0); /* in: the feet end leads; back: the head end */ S.yaw += angDiff(want, S.yaw) * Math.min(1, dt * 3); S.x += dx / d * st; S.z += dz / d * st;
        S.y = this.g.collision.groundAt(S.x, S.z, S.y) + 0.42; this.carryHands(u, true, 1, back ? 'head' : 'feet'); for (const o of u.officers) if (o.want) o.want.speed = 1.0; this.syncStretcher(u);
        if (e.t > 45) { e.wi = way.length - 1; S.x = tg.x; S.z = tg.z; } return; }
      case 'transfer': { const BR = this.g.hospital.bodyRoom, S = e.S; BR.want(S.x, S.z); this.carryHands(u, false, 1, 'feet');
        if (e.sheet && e.t > 0.8) { const k = Math.min(1, (e.t - 0.8) / 1.6); BR.transfer(e.sheet, k, e.from); if (k >= 1) { BR.receive(e.sheet); e.sheet = null; this.pr.note(`EMS unit ${u.id} body left in the holding room`); this.stats.delivered++; } }
        if (!e.sheet && e.t > 3.2) { e.bp = 'back'; e.t = 0; e.wi = 0; } return; }
      case 'restow': { // the empty cot back in: the reverse of 'unload'
        const zIn = AMB.rearZ + ST.half + 0.05, zOut = AMB.rearZ - ST.half - 0.9; const k = sm(Math.min(1, e.t / 2.4)); if (!e.pullSnd) { e.pullSnd = true; HospitalSound.trolleyPull(e.S.x, e.S.z); }
        const c = this.vanPt(u, zOut + (zIn - zOut) * k); const S = e.S; S.x = c.x; S.z = c.z; S.yaw = v.yaw + Math.PI; const gy = this.g.collision.groundAt(c.x, c.z, v.y + 0.5);
        S.y = (gy + 0.42) + ((v.y + AMB.doorY0) - (gy + 0.42)) * sm(k / 0.55); this.carryHands(u, true, 1, 'feet'); for (const o of u.officers) if (o.want) o.want.speed = k < 1 ? 0.4 : 0; this.syncStretcher(u);
        if (e.t > 2.6) { this.dropCargo(u); e.cotOut = false; e.bp = 'handed'; e.t = 0; for (const o of u.officers) { o.want = null; o.ch.anim.set(null); o.ch.anim.holdWL = o.ch.anim.holdWR = null; } } return; }
      case 'handed': if (e.t > 3) { e.rearOpen = false; for (const o of u.officers) if (o.mode === 'foot') { o.mode = 'return'; o.goal = null; } e.bp = 'mount'; e.t = 0; } return;
      case 'mount': if (pr.allSeated(u) || e.t > 40) { if (!pr.allSeated(u)) for (const o of u.officers) { o.mode = 'seated'; } e.ph = 'parked'; e.t = 0; e.leaveT = 0; v.beacons(false, pr.t); } return;
    }
  }
  takeCargo(u) { // the stretcher (and the sheet over the body) out of the van into the scene, where the carry code moves it
    const e = u.e, v = u.v; const c = e.cargo || []; v.mesh.updateMatrixWorld(); for (const m of c) this.g.scene.attach(m);
    e.st = c.find((m) => m.name === 'emsStretcher') || c[0] || null; e.sheet = c.find((m) => m !== e.st) || null; e.cargo = [];
    if (!e.st) { e.st = buildStretcher(); this.g.scene.add(e.st); }
    const zIn = AMB.rearZ + ST.half + 0.05; const p = this.vanPt(u, zIn); e.S = { x: p.x, z: p.z, y: v.y + AMB.doorY0, yaw: v.yaw + Math.PI }; this.syncStretcher(u);
    if (e.sheet) { e.sheet.position.copy(e.st.position); e.sheet.rotation.copy(e.st.rotation); }
  }
  dropProps(u) { const e = u.e; for (const k of ['stretcher', 'bvm']) if (e[k]) { e[k].parent?.remove(e[k]); e[k] = null; } }
  abort(u, why) { // the player took the ambulance / the patient vanished: the crew gives up and the patient is left as they were
    const e = u.e; this.pr.note(`EMS unit ${u.id} aborted (${why})`); const p = e.p;
    if (p && p.ch.rag && p.ch.rag.kin) { p.ch.rag.kin = null; p.ch.rag.wake(); }
    if (p) { p.awaitMedic = false; p.keep = false; if (u.e.hidBody) { p.ch.root.visible = true; u.e.hidBody = false; } }
    this.dropProps(u); e.ph = 'leave'; e.t = 0; for (const o of u.officers) { o.want = null; o.stuck = false; if (o.mode === 'foot') { o.mode = 'return'; o.goal = null; o.ch.anim.set(null); } }
    if (!u.v || u.v.player) { if (e.kit) { e.kit.parent?.remove(e.kit); e.kit = null; } this.units = this.units.filter((q) => q !== u); for (const o of u.officers) if (o.mode !== 'seated') { o.ch.root.parent?.remove(o.ch.root); o.ch.dispose(); } if (u.v) { u.v.police = null; u.v.ems = false; } }
  }
  say(kind, who = 'EMT') { const arr = MEDIC_LINES[kind]; if (!arr) return; const l = arr[Math.floor(Math.random() * arr.length)]; const lang = l.si ? 'si' : l.ta ? 'ta' : 'en'; const P = this.g.player; const u = this.units[0]; if (u && u.officers[0] && Math.hypot(u.officers[0].x - P.x, u.officers[0].z - P.z) > 45) return; const m = u && u.officers[0]; const vd = m ? Voices.say(m.ch && m.ch.spec, 'order', m.x, m.z, m, 'medic') : 0; this.g.hud.subtitle(`${who} · 1990 Suwa Seriya`, l.si || l.ta || l.en, l.tr || '', Math.max(3, vd + 0.3), lang); if (!vd) Audio.talkBlip?.(lang); }
  // ---------------------------------------------------------------- per frame
  update(dt) {
    this.t += dt; if (this.waits && this.waits.length) { const due = this.waits.filter((w) => (w.t -= dt) <= 0); this.waits = this.waits.filter((w) => w.t > 0); for (const w of due) w.fn(); }
    if ((this.scanT -= dt) <= 0) { this.scanT = 1; this.scan(); }
    for (const u of this.units.slice()) this.updateUnit(u, dt); this.updateSiren(dt); this.updateCpr(dt);
  }
  updateUnit(u, dt) {
    this.cotView(u);
    const g = this.g, pr = this.pr, v = u.v, e = u.e; e.t += dt; e.ct += dt;
    if (!v || v.player) { if (e.ph !== 'leave' || v) this.abort(u, 'vehicle taken'); return; }
    if (e.ph !== 'leave' && e.ph !== 'bay' && e.ph !== 'parked' && e.p && !e.p.ch.root.parent) { this.abort(u, 'patient gone'); return; }
    const lit = e.ph === 'drive' || e.ph === 'out' || (e.ph !== 'leave' && e.ph !== 'load' && e.ph !== 'bay' && e.ph !== 'parked') || (e.blockLit && e.toBay === 'road'); v.beacons(lit, pr.t); v.lights = g.atmos ? g.atmos.night > 0.4 : false;
    for (const o of u.officers) pr.updateOfficer(o, u, dt);
    if (e.rear !== undefined) { const want = e.rearOpen ? 1 : 0; e.rear += Math.sign(want - e.rear) * Math.min(Math.abs(want - e.rear), dt / 1.1); v.rearDoors(sm(e.rear)); }
    const p = e.p;
    switch (e.ph) {
      case 'drive': {
        const ai = v.ai; const gd = ai.goal && ai.goal.piece && ai.goal.dist !== undefined ? ai.goal.dist : Infinity; const near = Math.hypot(v.x - p.x, v.z - p.z);
        if (v.speed < 0.3 && gd > 5) u.stuckT += dt; else u.stuckT = 0;
        e.minNear = Math.min(e.minNear ?? 1e9, near); if (e.minNear < 45 && near > e.minNear + 25) { e.minNear = 1e9; pr.plan(u, p.x, p.z); pr.note(`EMS unit ${u.id} overshot — re-routing`); } // drove past: come round again
        if ((gd < 5 && v.speed < 0.6) || (near < 26 && v.speed < 0.6 && gd < 30) || (u.stuckT > 6 && near < 45)) { e.ph = 'out'; e.t = 0; pr.dismount(u, 'ems'); u.task = 'ems'; this.say('arrive'); }
        else if (u.stuckT > 6) { u.stuckT = 0; pr.plan(u, p.x, p.z); }
        else if (e.ct > 200) { this.abort(u, 'could not reach'); }
        return; }
      case 'bay': this.atBay(u, dt); return;
      case 'parked': { const P = g.player; const d = Math.hypot(v.x - P.x, v.z - P.z); e.leaveT = (e.leaveT || 0) + dt; if ((d > 60 && !pr.inView(v)) || d > 180) this.removeUnit(u); return; }
      case 'out': if (u.officers.every((o) => o.mode === 'foot')) { e.ph = 'approach'; e.t = 0; this.toRagdoll(p); } return;
      case 'leave': {
        if (u.officers.some((o) => o.mode === 'foot')) for (const o of u.officers) if (o.mode === 'foot') { o.mode = 'return'; o.goal = null; }
        if (!pr.allSeated(u)) return; if (e.kit) { e.kit.parent?.remove(e.kit); e.kit = null; } /* the response bag went back in with them */ if (!e.going) { e.going = true; v.ai.stopped = false; v.ai.route = null; v.ai.goal = null; v.ai.v0 = 11; e.rearOpen = false;
          const B = this.bayInfo(); if (e.transport && B && !v.ai.chase) { if (this.planBay(u, B)) { e.toBay = 'road'; e.bayT = 0; this.stats.toHospital++; pr.note(`EMS unit ${u.id} → National Hospital`); } else { e.transport = false; this.stats.bayFail++; } } }
        if (e.toBay) { this.toBay(u, dt); return; }
        const P = g.player; const d = Math.hypot(v.x - P.x, v.z - P.z); e.leaveT = (e.leaveT || 0) + dt; if ((d > 140 && !pr.inView(v)) || d > 300 || e.leaveT > 120) this.removeUnit(u); return; }
      default: this.script(u, dt);
    }
  }
  // 75th: what the interior-mapped compartment shows on its floor rails: the stowed cot (empty / with the covered patient),
  // the part of it still inside while it slides out or in, or nothing once it is out
  cotView(u) { const v = u.v, e = u.e; const r = v && v.mesh && v.mesh.userData.rear; if (!r || !r.cav.visible || !r.cav.material.uniforms) return; const U = r.cav.material.uniforms;
    if (e && e.st && e.S) { const lz = (e.S.x - v.x) * Math.sin(v.yaw) + (e.S.z - v.z) * Math.cos(v.yaw); const inside = Math.max(0, Math.min(ST.len, lz + ST.half - AMB.rearZ - 0.02)); U.uCot.value = inside > 0.05 ? (e.sheet ? 2 : 1) : 0; U.uCotIn.value = inside; }
    else if (e && e.cargo && e.cargo.length) { U.uCot.value = e.cargo.length > 1 ? 2 : 1; U.uCotIn.value = ST.len; }
    else { U.uCot.value = e && e.cotOut ? 0 : 1; U.uCotIn.value = ST.len; } }
  toRagdoll(p) { // a knocked-out (tilted) body becomes a ragdoll for the medics' handling (no blood pool for the living)
    const R = this.g.ragdolls; if (!p.ch.rag && R) { if (!p.dead) p.noPool = true; R.add(p.ch, { vel: [0, 0, 0] }); }
  }
  // ---------------------------------------------------------------- body geometry
  body(p) { const r = p.ch.rag; const P = r.pelvis(), H = r.part('head'), C = r.part('chest'); const ax = V().set(H.x - P.x, 0, H.z - P.z); if (ax.lengthSq() < 1e-4) ax.set(0, 0, 1); ax.normalize(); return { r, P, H, C, ax, n: V().set(ax.z, 0, -ax.x) }; }
  spot(o, x, z, yaw, act, opts = {}) { o.want = Object.assign({ x, z, yaw, act }, opts); }
  // ---------------------------------------------------------------- the scripted scene
  script(u, dt) {
    const e = u.e, p = e.p; if (!p) { if (e.ph === 'load') this.load(u, dt); return; } // loaded: only the doors left to close
    const A = u.officers[0], B = u.officers[1] || u.officers[0], r = p.ch.rag; const col = this.g.collision;
    if (!r) { this.abort(u, 'no body'); return; }
    const b = this.body(p); const sg = e.side || (e.side = this.pickSide(b));
    const chestSpot = () => { const c = b.C; return { x: c.x + b.n.x * sg * 0.58 - b.ax.x * 0.05, z: c.z + b.n.z * sg * 0.58 - b.ax.z * 0.05, yaw: Math.atan2(-b.n.x * sg, -b.n.z * sg) }; };
    const headSpot = () => { const h = b.H; return { x: h.x + b.ax.x * 0.52, z: h.z + b.ax.z * 0.52, yaw: Math.atan2(-b.ax.x, -b.ax.z) }; };
    const placed = (o) => o.want && o.placedT > 0.45;
    switch (e.ph) {
      case 'approach': { const a = chestSpot(), h = headSpot();
        if (e.reach === undefined) { e.reach = this.unreachable(u, b, a, h); if (e.reach) { this.pr.note(`EMS unit ${u.id}: patient unreachable (${e.reach})`); e.ph = 'untreat'; e.t = 0; return; } }
        this.spot(A, a.x, a.z, a.yaw, 'medKneel', { run: true, look: 0.5, noStep: true }); this.spot(B, h.x, h.z, h.yaw, 'medKneel', { run: true, look: 0.55, noStep: true });
        if (A.stuck || B.stuck || e.t > 40) { this.pr.note(`EMS unit ${u.id}: could not get beside the patient`); e.reach = 'blocked on approach'; e.ph = 'untreat'; e.t = 0; return; }
        if (placed(A) && placed(B)) { e.ph = Math.abs(rollAngle(r)) > 1.2 ? 'roll' : 'supine'; e.t = 0; if (e.ph === 'roll') this.say('roll'); }
        return; }
      case 'roll': { if (!e.rolling) { e.rolling = true; const ang = rollAngle(r); const snap = r.snapshot(); const P0 = r.pelvis().clone(); P0.y = col.groundAt(P0.x, P0.z, P0.y) + 0.15; const ax = r.part('chest').clone().sub(r.pelvis()).setY(0).normalize(); r.play((k, out) => rotateAbout(snap, P0, ax, ang * k, out), 1.5, () => { e.ph = 'supine'; e.t = 0; e.rolling = false; }, { hold: true }); }
        this.handsOn(A, r.part(sg > 0 ? 'shR' : 'shL'), r.part(sg > 0 ? 'hipR' : 'hipL'), 0.3); this.handsOn(B, r.part('head'), null, 0.3); return; }
      case 'supine': { if (!e.sup) { e.sup = true; const fr = supineFrame(r); e.fr = fr; const sup = Keys.toWorld(Keys.supine(r.rest), fr.x, fr.z, fr.yaw, col); r.blendTo(sup, 0.9, () => { e.ph = 'assess'; e.t = 0; e.sup = false; }, { hold: true }); } this.handsOn(A, r.part('chest'), null, 0.25); return; }
      case 'assess': { // pulse at the neck, tap the shoulder and call; B tilts the head back
        if (!e.kit) { e.kit = buildKit(); const kx = b.H.x - b.n.x * sg * 0.75 + b.ax.x * 0.35, kz = b.H.z - b.n.z * sg * 0.75 + b.ax.z * 0.35; /* by the head on the far side: clear of A, B and where the cot is set down (side sg) */ e.kit.position.set(kx, col.groundAt(kx, kz, b.C.y + 0.3), kz); e.kit.rotation.y = Math.atan2(b.ax.x, b.ax.z); this.g.scene.add(e.kit); }
        const tap = Math.sin(e.t * 9) * 0.025 * (e.t > 1.2 && e.t < 2.8 ? 1 : 0); const sh = r.part(sg > 0 ? 'shR' : 'shL');
        this.handsOn(A, V().copy(sh).add(V().set(0, 0.06 + tap, 0)), V().copy(r.part('neck')).addScaledVector(b.n, sg * 0.05).add(V().set(0, 0.07, 0)), 0.3); A.want.look = 0.7;
        this.handsOn(B, V().copy(r.part('head')).addScaledVector(b.n, 0.08).add(V().set(0, 0.04, 0)), V().copy(r.part('head')).addScaledVector(b.n, -0.08).add(V().set(0, 0.04, 0)), 0.4);
        if (e.t > 1.2 && !e.saidHear) { e.saidHear = true; this.say('hear'); }
        if (e.t > 4.5) { e.t = 0; if (e.dead) { e.ph = 'cpr'; e.cyc = 0; this.say('nopulse'); } else { e.ph = 'wake'; this.say('pulse'); } }
        return; }
      case 'wake': { // knocked out: they come round, sit up (A's hand on the back), get up
        if (e.t > 1.6 && !e.woke) { e.woke = true; p.ch.face.set?.('pain', 4); this.say('wake'); this.getUp(u, () => { this.stats.koRevived++; this.finishRevive(u); }); }
        this.supportHands(u, b, sg); return; }
      case 'cpr': { // 2 cycles: 20 compressions (~1.9 /s) + 2 breaths; then a pulse check
        const comp = 20 / 1.9, cyc = comp + 2.6; const tc = e.t % cyc; const n = Math.floor(e.t / cyc);
        const fr = e.fr; const st = this.sternum(r); let push = 0; let squeeze = 0;
        if (n >= 2) { e.compress = null; r.chestPush = 0; this.handsOn(A, V().copy(r.part('neck')).addScaledVector(b.n, sg * 0.05).add(V().set(0, 0.07, 0)), null, 0.3); if (!e.saidCheck) { e.saidCheck = true; this.say('check'); }
          if (e.t > 2 * cyc + 3.2) { e.t = 0; const k = Math.max(0, 1 - ((e.deadT0 || 0) + e.ct * 0.25) / 120); const live = this.force ? this.force === 'revive' : Math.random() < 0.45 * k; this.pr.note(`EMS unit ${u.id} CPR ${live ? 'success' : 'failed'} (chance ${(45 * k).toFixed(0)} %)`); if (live) { e.ph = 'rosc'; this.say('rosc'); } else { e.ph = 'dead'; this.say('dead'); } }
          this.bvm(u, b, 0, false); return; }
        e.compress = tc < comp ? (e._cp || (e._cp = { x: 0, z: 0 })) : null; if (e.compress) { e.compress.x = st.x; e.compress.z = st.z; } // (own object: st is a pooled temp vector) // 75th: the CPR loop (sounds board: Hospitals → CPR) runs while compressing
        if (tc < comp) { const ph = (tc * 1.9) % 1; push = ph < 0.45 ? Math.sin((ph / 0.45) * Math.PI) : 0; if (tc > comp - 1.2 && n === 0 && !e.saidBreaths) { e.saidBreaths = true; this.say('breaths'); } }
        else squeeze = Math.max(0, Math.sin(((tc - comp) / 1.3) * Math.PI)); 
        r.chestPush = push * 0.05; const top = V().copy(st).add(V().set(0, 0.12 - push * 0.05, 0));
        this.handsOn(A, V().copy(top).add(V().set(0, 0.035, 0)), top, 0.32 + push * 0.12); A.want.look = 0.85;
        this.bvm(u, b, squeeze, true); void fr; return; }
      case 'rosc': { r.chestPush = 0; this.bvm(u, b, 0, false); if (e.t > 1.5 && !e.woke) { e.woke = true; p.ch.face.set?.('pain', 4); this.dropProps(u); this.getUp(u, () => { this.stats.revived++; this.finishRevive(u); }); } this.supportHands(u, b, sg); return; }
      case 'dead': { r.chestPush = 0; this.bvm(u, b, 0, false); A.want.shake = e.t < 2.2 ? 0.5 : 0; this.handsOn(A, null, null, 0.2);
        if (e.t > 3) { this.dropProps(u); e.ph = 'fetch'; e.t = 0; this.say('stretcher'); e.dead = true; }
        return; }
      case 'untreat': { // 75th: stop short (where they are), look at the body, say so, walk back to the van and leave
        if (e.t < 0.05) for (const o of [A, B]) { const d = Math.hypot(b.C.x - o.x, b.C.z - o.z) || 1; const k = d > 1.8 ? 0 : (1.8 - d); this.spot(o, o.x + (o.x - b.C.x) / d * k, o.z + (o.z - b.C.z) / d * k, Math.atan2(b.C.x - o.x, b.C.z - o.z), null, { look: 0.4, noStep: true }); o.stuck = false; }
        if (e.t > 1.2 && !e.saidNo) { e.saidNo = true; this.say(p.ch.spec && p.ch.spec.sex === 'f' ? 'unreachF' : 'unreachM'); }
        if (e.t > 5) { p.emsNoReach = true; this.stats.unreachable = (this.stats.unreachable || 0) + 1; this.abort(u, 'unreachable: ' + e.reach); }
        return; }
      case 'fetch': return this.fetch(u, dt, b, sg);
      case 'set': return this.setDown(u, dt, b, sg);
      case 'transfer': return this.transfer(u, dt, b, sg);
      case 'cover': return this.cover(u, dt);
      case 'liftUp': return this.liftUp(u, dt);
      case 'carry': return this.carry(u, dt);
      case 'load': return this.load(u, dt);
    }
  }
  // 75th: can the crew work on this body without clipping? null = yes, else the reason. Under a parked car / bench / table,
  // inside a wall or prop (a ragdoll that came to rest through geometry), floating / wedged above the ground, or no free
  // ground to kneel on at the chest (either side) and the head.
  unreachable(u, b, a, h) {
    const col = this.g.collision; const r = b.r; const pts = [r.pelvis(), b.C, b.H];
    let inside = 0, under = 0, off = 0;
    for (const q of pts) { const gy = col.groundAt(q.x, q.z, q.y + 0.3); if (q.y - gy > 0.6) off++;
      for (const c of col.query(q.x - 0.01, q.z - 0.01, q.x + 0.01, q.z + 0.01)) { if (c.h <= 0.3 || c.kind === 'deck' || c.kind === 'platform') continue; const m = 0.06; if (q.x < c.x0 + m || q.x > c.x1 - m || q.z < c.z0 + m || q.z > c.z1 - m) continue;
        const base = c.y0 || 0, top = base + c.h; if (top < q.y + 0.12) continue; if (base > q.y + 1.1) continue; if (base > q.y + 0.05) under++; else inside++; break; } }
    for (const v of LIVE_VEHICLES) { if (v === u.v || !v.mesh || !v.mesh.parent || !v.T || v.T.entry === 'bike') continue; if (Math.hypot(v.x - b.C.x, v.z - b.C.z) > 6) continue;
      const fx = Math.sin(v.yaw), fz = Math.cos(v.yaw); let n = 0; for (const q of pts) { const dx = q.x - v.x, dz = q.z - v.z; const lo = dx * fx + dz * fz, la = dx * fz - dz * fx; if (Math.abs(lo) < v.T.len / 2 - 0.1 && Math.abs(la) < v.T.wid / 2 - 0.08) n++; } if (n >= 2) return 'under a vehicle'; }
    if (under >= 2) return 'under an object'; if (inside >= 2) return 'inside geometry'; if (off >= 2) return 'wedged off the ground';
    const ok = (s) => { if (col.blocked(s.x, s.z, 0.2)) return false; const gy = col.groundAt(s.x, s.z, b.C.y + 0.3); return Math.abs(gy - col.groundAt(b.C.x, b.C.z, b.C.y + 0.3)) < 0.45; };
    const other = { x: b.C.x - (a.x - b.C.x), z: b.C.z - (a.z - b.C.z) };
    if (!ok(a) && !ok(other)) return 'no room beside the body'; if (!ok(h)) return 'no room at the head';
    return null;
  }
  pickSide(b) { const col = this.g.collision; const score = (s) => { let n = 0; for (const d of [0.6, 0.9, 1.4]) { const x = b.C.x + b.n.x * s * d, z = b.C.z + b.n.z * s * d; if (col.blocked(x, z, 0.2)) n++; } return n; }; return score(1) <= score(-1) ? 1 : -1; }
  place(o, s) { o.x = s.x; o.z = s.z; o.yaw = s.yaw; }
  handsOn(o, L, R, lean) { const w = o.want || (o.want = {}); w.holdL = L ? V().copy(L) : null; w.holdR = R ? V().copy(R) : null; if (lean !== undefined) w.lean = lean; }
  sternum(r) { const C = r.part('chest'), N = r.part('neck'); return V().copy(C).lerp(N, 0.3); }
  supportHands(u, b, sg) { const A = u.officers[0], B = u.officers[1] || A; const r = b.r; const back = V().copy(r.part('chest')).add(V().set(0, -0.02, 0)).addScaledVector(b.n, sg * 0.1); this.handsOn(A, back, V().copy(r.part(sg > 0 ? 'shR' : 'shL')).add(V().set(0, 0.04, 0)), 0.25); this.handsOn(B, null, null, 0.2); }
  bvm(u, b, squeeze, on) { // B holds the mask on the face (left hand) and squeezes the bag (right)
    const e = u.e, B = u.officers[1] || u.officers[0], r = b.r; if (!on) { if (e.bvm) e.bvm.visible = false; this.handsOn(B, null, null, 0.25); return; }
    if (!e.bvm) { e.bvm = buildBVM(); this.g.scene.add(e.bvm); } const m = e.bvm; m.visible = true; const H = r.part('head'); const face = V().copy(H).addScaledVector(b.ax, -0.02).add(V().set(0, 0.11, 0));
    m.position.copy(face); m.rotation.set(0, Math.atan2(b.ax.x, b.ax.z), 0); m.userData.bag.scale.set(1 - squeeze * 0.35, 1 - squeeze * 0.35, 2.1); m.updateMatrixWorld();
    const bagW = V().set(0, 0, 0.17).applyMatrix4(m.matrixWorld); this.handsOn(B, V().copy(face).add(V().set(0, 0.03, 0)), bagW.add(V().set(0, 0.05 - squeeze * 0.02, 0)), 0.35); B.want.look = 0.8;
  }
  // sit up → crouch → stand along the body-frame keys, then the Animator takes over again
  getUp(u, done) {
    const e = u.e, p = e.p, r = p.ch.rag, col = this.g.collision; const fr = e.fr || supineFrame(r); e.fr = fr; const live = () => p.ch.rag === r && this.units.includes(u) && e.p === p;
    const key = (n) => Keys.toWorld(Keys[n](r.rest), fr.x, fr.z, fr.yaw, col);
    const stand = () => { if (!live()) return; const zA = Keys.standZ(r.rest); r.release(); const root = p.ch.root; const x = fr.x + Math.sin(fr.yaw) * zA, z = fr.z + Math.cos(fr.yaw) * zA; root.position.set(x, col.groundAt(x, z, 0.5), z); root.rotation.set(0, fr.yaw, 0); p.x = x; p.z = z; p.yaw = fr.yaw; p.y = root.position.y; done(); };
    r.blendTo(key('supine'), 0.5, () => { if (live()) r.blendTo(key('sit'), 1.7, () => { this.wait(2.2, () => { if (live()) r.blendTo(key('crouch'), 1.3, () => { if (live()) r.blendTo(key('stand'), 1.2, stand, { hold: true }); }, { hold: true }); }); }, { hold: true }); }, { hold: true });
  }
  wait(sec, fn) { (this.waits || (this.waits = [])).push({ t: sec, fn }); }
  finishRevive(u) { // back into the crowd as a normal (shaken) pedestrian; the crew packs up and leaves
    const e = u.e, p = e.p, C = this.crowd; p.dead = false; p.awaitMedic = false; p.keep = false; p.hits = 0; p.deadT = 0; p.downT = 0; p.timer = 0; p.ch.mesh.rotation.set(0, 0, 0); p.ch.mesh.position.set(0, 0, 0);
    p.ch.face.set?.('concern', 6); p.ch.face.mood = 'concern'; const away = { x: Math.sin(p.yaw), z: Math.cos(p.yaw) };
    if (C && C.react) { C.react(p, 'recover', 6, { fleeDir: [away.x, away.z] }, true); p.ch.anim.set(null); }
    if (p.mind) { p.mind.dead = false; if (C && C.minds) C.minds.playerAct(p, 'helped'); } // the player phoned the ambulance that saved them: remembered with gratitude (Mind.js)
    this.say('okay'); e.ph = 'leave'; e.t = 0; for (const o of u.officers) { o.want = null; o.ch.anim.set(null); o.ch.anim.holdWL = o.ch.anim.holdWR = null; o.mode = 'return'; o.goal = null; }
  }
  // ---------------------------------------------------------------- the stretcher (not revived)
  rearPose(u, out = 1.5) { const v = u.v; const fx = Math.sin(v.yaw), fz = Math.cos(v.yaw); const z = AMB.rearZ - out; return { x: v.x + fx * z, z: v.z + fz * z, yaw: v.yaw, fx, fz }; }
  vanPt(u, lz, lx = 0) { const v = u.v, fx = Math.sin(v.yaw), fz = Math.cos(v.yaw); return { x: v.x + fx * lz + fz * lx, z: v.z + fz * lz - fx * lx }; }
  fetch(u, dt, b, sg) { // both walk to the back, B opens the doors; B pulls the stretcher out (feet end first), A takes the head end
    const e = u.e, A = u.officers[0], B = u.officers[1] || A, v = u.v; if (e.rear === undefined) e.rear = 0;
    const zIn = AMB.rearZ + ST.half + 0.05, zOut = AMB.rearZ - ST.half - 0.9; const yaw = v.yaw + Math.PI;
    if (!e.st) { const ca = this.vanPt(u, AMB.rearZ - 0.75, -0.75), cb = this.vanPt(u, AMB.rearZ - 0.75, 0.75); this.spot(A, ca.x, ca.z, v.yaw, null, {}); this.spot(B, cb.x, cb.z, v.yaw, null, {});
      if (this.at(A, 0.45) && this.at(B, 0.45)) { e.rearOpen = true; if (e.rear > 0.95) { e.st = buildStretcher(); e.cotOut = true; this.g.scene.add(e.st); const c = this.vanPt(u, zIn); e.S = { x: c.x, z: c.z, y: v.y + AMB.doorY0, yaw }; e.slide = -1; this.syncStretcher(u); } }
      return; }
    if (e.slide < 0) { const bp = this.vanPt(u, zIn - ST.handZ - 0.42); this.spot(B, bp.x, bp.z, v.yaw, null, {}); if (this.at(B, 0.3)) { e.slide = 0; HospitalSound.trolleyPull(bp.x, bp.z); } return; } // B steps up to the feet end
    if (e.slide < 1) { e.slide = Math.min(1, e.slide + dt / 2.4); const k = sm(e.slide); const zc = zIn + (zOut - zIn) * k; const c = this.vanPt(u, zc); e.S.x = c.x; e.S.z = c.z; e.S.yaw = yaw;
      const gy = this.g.collision.groundAt(c.x, c.z, v.y + 0.5); e.S.y = (v.y + AMB.doorY0) + ((gy + 0.42) - (v.y + AMB.doorY0)) * sm((e.slide - 0.45) / 0.55);
      const H = this.handles(e.S); const bp = this.vanPt(u, zc - ST.handZ - 0.42); this.spot(B, bp.x, bp.z, v.yaw, 'medCarry', { direct: true, speed: 0.35, look: 0.3, holdL: H.hand(-1, 1), holdR: H.hand(1, 1) }); // B faces the van (= stretcher −z): his left is the stretcher's −x
      this.syncStretcher(u); return; }
    // out: A walks round to the head end, then they set off (feet end leading, B in front)
    if (!e.aReady) { const H = this.handles(e.S); const ap = this.vanPt(u, zOut + ST.handZ + 0.42); this.spot(A, ap.x, ap.z, v.yaw + Math.PI, null, {}); const bp = this.vanPt(u, zOut - ST.handZ - 0.42); this.spot(B, bp.x, bp.z, v.yaw, 'medCarry', { direct: true, look: 0.3, holdL: H.hand(-1, 1), holdR: H.hand(1, 1) }); if (this.at(A, 0.3)) e.aReady = true; return; }
    e.trip = { to: this.besidePose(b, sg), lead: 'feet' }; e.ph = 'carry'; e.t = 0; e.al = 0;
  }
  besidePose(b, sg) { const fr = supineFrame(b.r); const S = Keys.supine(b.r.rest); const mid = (S[IX.head].z + S[IX.anL].z) / 2; const fx = Math.sin(fr.yaw), fz = Math.cos(fr.yaw); const cx = fr.x + fx * mid, cz = fr.z + fz * mid;
    const nx = Math.cos(fr.yaw), nz = -Math.sin(fr.yaw); const s = sg * Math.sign(nx * b.n.x + nz * b.n.z || 1); return { x: cx + nx * s * 0.8, z: cz + nz * s * 0.8, yaw: fr.yaw, fr, mid }; }
  at(o, r) { const w = o.want; return !!w && Math.hypot(w.x - o.x, w.z - o.z) < r && o.placedT > 0.2; }
  // stretcher space: +z = feet end. hand(sx, end): grip on the pole at x = sx·poleX, end −1 head / +1 feet
  handles(S) { const c = Math.cos(S.yaw), s = Math.sin(S.yaw); const w = (lx, ly, lz) => V().set(S.x + lx * c + lz * s, S.y + ly, S.z - lx * s + lz * c); return { w, dir: V().set(s, 0, c), hand: (sx, end) => w(sx * ST.poleX, ST.poleY, end * ST.handZ) }; }
  // A at the head end, B at the feet end. The leading medic stands just beyond his end facing away (hands behind him on
  // the grips), the trailing one faces the stretcher. A character facing the stretcher's +z has the stretcher's +x on his left.
  carryHands(u, walking, up = 1, lead = 'head', direct = true) {
    const e = u.e, A = u.officers[0], B = u.officers[1] || A, S = e.S; const H = this.handles(S); const d = H.dir; const act = walking ? 'medCarry' : 'medLift';
    const back = { poleL: new THREE.Vector3(0.3, -0.5, -1), poleR: new THREE.Vector3(-0.3, -0.5, -1) };
    { const leads = lead === 'head'; const off = ST.handZ + (leads ? 0.14 : 0.42); const f = leads ? -1 : 1; // facing ±d
      this.spot(A, S.x - d.x * off, S.z - d.z * off, Math.atan2(d.x * f, d.z * f), act, Object.assign({ direct, up, look: leads ? 0.05 : 0.3, holdL: H.hand(f, -1), holdR: H.hand(-f, -1) }, leads ? back : {})); }
    { const leads = lead === 'feet'; const off = ST.handZ + (leads ? 0.14 : 0.42); const f = leads ? 1 : -1;
      this.spot(B, S.x + d.x * off, S.z + d.z * off, Math.atan2(d.x * f, d.z * f), act, Object.assign({ direct, up, look: leads ? 0.05 : 0.3, holdL: H.hand(f, 1), holdR: H.hand(-f, 1) }, leads ? back : {})); }
  }
  syncStretcher(u) { const e = u.e, S = e.S; if (!e.st) return; e.st.position.set(S.x, S.y, S.z); e.st.rotation.set(0, S.yaw, 0); this.cotLegs(u); if (e.sheet) { e.sheet.position.copy(e.st.position); e.sheet.rotation.copy(e.st.rotation); }
    if (e.kitOn && e.kit) { const c = Math.cos(S.yaw), s = Math.sin(S.yaw); e.kit.position.set(S.x + s * 0.5, S.y + ST.top + 0.15, S.z + c * 0.5); e.kit.rotation.set(0, S.yaw, 0); } }
  // 75th: each end of the undercarriage reaches the ground under it (inside the van: folded on the floor), rate-limited so
  // the legs visibly drop and lock as the cot leaves the doors and fold as it is lowered beside a patient
  cotLegs(u) { const e = u.e, S = e.S, v = u.v, st = e.st; const U = st && st.userData.cot; if (!U) return; const col = this.g.collision; const fx = Math.sin(S.yaw), fz = Math.cos(S.yaw); const now = this.t, dt = Math.min(0.1, now - (U.t ?? now)); U.t = now;
    const want = [-1, 1].map((sz) => { const x = S.x + fx * sz * COT.legZ, z = S.z + fz * sz * COT.legZ; if (v) { const lz = (x - v.x) * Math.sin(v.yaw) + (z - v.z) * Math.cos(v.yaw), lx = (x - v.x) * Math.cos(v.yaw) - (z - v.z) * Math.sin(v.yaw); if (lz > AMB.rearZ - 0.02 && lz < 1 && Math.abs(lx) < 0.9) return 0; }
      return Math.max(0, Math.min(COT.maxExt, S.y - col.groundAt(x, z, S.y + 0.1))); });
    const step = dt > 0 ? 1.6 * dt : 1; const eh = U.ext[0] + Math.max(-step, Math.min(step, want[0] - U.ext[0])), ef = U.ext[1] + Math.max(-step, Math.min(step, want[1] - U.ext[1])); setCotLegs(st, eh, ef);
  }
  // carried: the leading medic walks the route (FootNav); the stretcher trails him like a trailer, the other follows the far end
  carry(u, dt) {
    const e = u.e, S = e.S, pr = this.pr, col = this.g.collision, T = e.trip; const lead = T.lead; const Lm = lead === 'head' ? u.officers[0] : (u.officers[1] || u.officers[0]);
    const G = T.lead === 'head' ? (() => { const c = this.vanPt(u, AMB.rearZ - ST.half - 0.6); return { x: c.x, z: c.z, yaw: u.v.yaw + Math.PI }; })() : T.to;
    const sgn = lead === 'head' ? -1 : 1; // centre → leading end = sgn·d
    const dG = V().set(Math.sin(G.yaw), 0, Math.cos(G.yaw)).multiplyScalar(sgn); const aim = { x: G.x + dG.x * (ST.handZ + 0.14), z: G.z + dG.z * (ST.handZ + 0.14) };
    const d = V().set(Math.sin(S.yaw), 0, Math.cos(S.yaw)).multiplyScalar(sgn); const fx = S.x + d.x * (ST.handZ + 0.14), fz = S.z + d.z * (ST.handZ + 0.14);
    const dist = Math.hypot(aim.x - fx, aim.z - fz);
    if (dist > 0.7 && e.t < 60 && !e.al) {
      Lm.x = fx; Lm.z = fz; const sp = pr.moveTo(Lm, aim.x, aim.z, 1.15, dt); const tx = S.x - d.x * ST.handZ, tz = S.z - d.z * ST.handZ; // trailing end
      const ux0 = Lm.x - tx, uz0 = Lm.z - tz, L = Math.hypot(ux0, uz0) || 1; const ux = ux0 / L, uz = uz0 / L;
      S.x = Lm.x - ux * (ST.handZ + 0.14); S.z = Lm.z - uz * (ST.handZ + 0.14); S.yaw = Math.atan2(ux * sgn, uz * sgn); S.y = col.groundAt(S.x, S.z, S.y - 0.2) + 0.42; e.walkSp = sp;
    } else { // final few steps: square up exactly on the goal pose
      e.al = (e.al || 0) + dt; const k = Math.min(1, dt * 3); S.x += (G.x - S.x) * k; S.z += (G.z - S.z) * k; S.yaw += angDiff(G.yaw, S.yaw) * k; S.y = col.groundAt(S.x, S.z, S.y - 0.2) + 0.42; e.walkSp = Math.max(0, 0.6 - e.al * 0.4);
      if (e.al > 1.4) { S.x = G.x; S.z = G.z; S.yaw = G.yaw; e.al = 0; if (lead === 'head') { e.ph = 'load'; e.t = 0; e.slide = 0; HospitalSound.trolleyPull(S.x, S.z); e.zc0 = AMB.rearZ - ST.half - 0.6; } else { e.ph = 'set'; e.t = 0; } } }
    this.carryHands(u, true, 1, lead); for (const o of u.officers) if (o.want) o.want.speed = e.walkSp || 0; this.syncStretcher(u); this.followBody(u);
  }
  setDown(u, dt, b, sg) { // lower it to the ground beside the body
    const e = u.e, S = e.S; const k = Math.min(1, e.t / 1.2); const gy = this.g.collision.groundAt(S.x, S.z, S.y); S.y = gy + 0.42 * (1 - sm(k)); this.carryHands(u, false, 1 - 0.6 * sm(k), 'feet'); this.syncStretcher(u);
    if (k >= 1) { e.ph = 'transfer'; e.t = 0; e.tr = null; this.say('lift'); }
  }
  bodyOnStretcher(u, out) { const e = u.e, S = e.S, r = e.p.ch.rag; const key = Keys.supine(r.rest); const mid = (key[IX.head].z + key[IX.anL].z) / 2; const fx = Math.sin(S.yaw), fz = Math.cos(S.yaw); return Keys.toWorld(key, S.x - fx * mid, S.z - fz * mid, S.yaw, null, out, S.y + ST.top - 0.005 - 0.004); }
  transfer(u, dt, b, sg) { // two-person extremity lift: A behind the head (hands under the shoulders), B beyond the feet (hands under the knees); they lift the body across onto the stretcher and shuffle with it
    const e = u.e, A = u.officers[0], B = u.officers[1] || A, r = e.p.ch.rag;
    const H = r.part('head'), An = V().copy(r.part('anL')).lerp(r.part('anR'), 0.5); const ax = V().set(H.x - An.x, 0, H.z - An.z); if (ax.lengthSq() < 1e-4) ax.set(0, 0, 1); ax.normalize();
    const aS = { x: H.x + ax.x * 0.5, z: H.z + ax.z * 0.5, yaw: Math.atan2(-ax.x, -ax.z) }, bS = { x: An.x - ax.x * 0.45, z: An.z - ax.z * 0.45, yaw: Math.atan2(ax.x, ax.z) };
    if (!e.tr) e.tr = { a0: aS, b0: bS, go: false, k: 0 }; const T = e.tr; const lift = T.go ? Math.sin(Math.min(1, T.k) * Math.PI) : 0;
    if (!T.go) { this.spot(A, T.a0.x, T.a0.z, T.a0.yaw, 'medKneel', { look: 0.5 }); this.spot(B, T.b0.x, T.b0.z, T.b0.yaw, 'medKneel', { look: 0.5 }); }
    else { this.spot(A, aS.x, aS.z, aS.yaw, 'medKneel', { direct: true, look: 0.5 }); this.spot(B, bS.x, bS.z, bS.yaw, 'medKneel', { direct: true, look: 0.5 }); }
    const under = (n) => V().copy(r.part(n)).add(V().set(0, -0.035, 0));
    this.handsOn(A, under('shL'), under('shR'), 0.42 + 0.18 * lift); this.handsOn(B, under('knR'), under('knL'), 0.42 + 0.18 * lift); // A faces the feet (his left = the body's left); B faces the head
    if (!T.go && A.placedT > 0.8 && B.placedT > 0.8) { T.go = true; const from = r.snapshot(); const tgt = this.bodyOnStretcher(u, from.map(() => V())); r.play((k, out) => { T.k = k; for (let i = 0; i < out.length; i++) { out[i].lerpVectors(from[i], tgt[i], k); out[i].y += Math.sin(k * Math.PI) * 0.22; } }, 2.4, () => { e.ph = 'cover'; e.t = 0; }, { hold: true }); }
    if (e.t > 25 && !T.go) { this.place(A, T.a0); this.place(B, T.b0); A.placedT = B.placedT = 1; }
  }
  localBody(u) { const e = u.e, S = e.S, r = e.p.ch.rag; const c = Math.cos(S.yaw), s = Math.sin(S.yaw); return r.p.map((q) => { const dx = q.x - S.x, dz = q.z - S.z; return new THREE.Vector3(dx * c - dz * s, q.y - S.y, dx * s + dz * c); }); }
  cover(u, dt) { // 75th: A at the head end, B at the feet end, each holding two corners: spread it, lower it, let go, tuck it
    const e = u.e, S = e.S; const H = this.handles(S); const d = H.dir; const A = u.officers[0], B = u.officers[1] || A;
    const m = e.cov || 0; const up = 1 - 0.55 * sm(Math.max(0, (m - 0.35) / 0.65));
    this.spot(A, S.x - d.x * (SH.len / 2 + 0.3), S.z - d.z * (SH.len / 2 + 0.3), Math.atan2(d.x, d.z), 'medLift', { look: 0.5, up }); this.spot(B, S.x + d.x * (SH.len / 2 + 0.3), S.z + d.z * (SH.len / 2 + 0.3), Math.atan2(-d.x, -d.z), 'medLift', { look: 0.5, up });
    if (!e.sheet) { e.sheet = buildSheet(); this.g.scene.add(e.sheet); e.local = this.localBody(u); sheetRest(e.sheet, e.local); e.cov = 0; HospitalSound.cover(S.x, S.z); }
    if (A.placedT > 0.5 && B.placedT > 0.5) e.cov = Math.min(1, e.cov + dt / 3.2);
    const hold = e.cov < 0.92; const c = (sx, sz) => { const q = sheetCorner(e.cov, sx, sz); return H.w(q[0], q[1], q[2]); }; // A faces +d: the stretcher's +x is on his left
    this.handsOn(A, hold ? c(1, -1) : null, hold ? c(-1, -1) : null, 0.25 + 0.3 * sm(e.cov)); this.handsOn(B, hold ? c(-1, 1) : null, hold ? c(1, 1) : null, 0.25 + 0.3 * sm(e.cov));
    if (!e.sheetDone) { drapeSheet(e.sheet, e.cov); if (e.cov >= 1) { e.sheetDone = true; const ch = e.p && e.p.ch; if (ch) { ch.root.visible = false; e.hidBody = true; } } } // fully down: the body is under it
    this.syncStretcher(u); if (e.cov >= 1 && e.t > 1) { e.ph = 'liftUp'; e.t = 0; this.say('lift'); }
  }
  followBody(u) { const e = u.e, r = e.p && e.p.ch.rag; if (!r || !e.local || !e.sheet) return; if (!e.follow) { e.follow = true; const L = e.local; r.play((k, out) => { const S = e.S, c = Math.cos(S.yaw), s = Math.sin(S.yaw); for (let i = 0; i < out.length; i++) { const q = L[i]; out[i].set(S.x + q.x * c + q.z * s, S.y + q.y, S.z - q.x * s + q.z * c); } }, 1e9, null, { hold: true, ease: false }); } }
  liftUp(u, dt) { // A turns to face away at the head end, both squat, take the grips and stand up together
    const e = u.e, S = e.S; const k = Math.max(0, Math.min(1, (e.t - 1.2) / 1.4)); const gy = this.g.collision.groundAt(S.x, S.z, S.y); S.y = gy + 0.42 * sm(k);
    this.carryHands(u, false, 0.4 + 0.6 * sm(k), 'head', e.t > 1.0); this.syncStretcher(u); this.followBody(u);
    if (k >= 1) { e.kitOn = !!e.kit; /* the response bag rides on the cot's foot end, back to the van */ e.trip = { lead: 'head' }; e.ph = 'carry'; e.t = 0; e.al = 0; } }
  load(u, dt) { // head first onto the floor: A steps aside, B pushes from the feet end; then the doors close and they leave
    const e = u.e, v = u.v, S = e.S, A = u.officers[0], B = u.officers[1] || A; e.slide = Math.min(1, e.slide + dt / 2.8); const k = sm(e.slide);
    const zc = e.zc0 + ((AMB.rearZ + ST.half + 0.05) - e.zc0) * k; const c = this.vanPt(u, zc); S.x = c.x; S.z = c.z; S.yaw = v.yaw + Math.PI; S.y0 = S.y0 ?? S.y; S.y = S.y0 + ((v.y + AMB.doorY0) - S.y0) * Math.min(1, k * 3.5);
    const H = this.handles(S); const side = this.vanPt(u, AMB.rearZ - 0.9, -1.05); this.spot(A, side.x, side.z, v.yaw, null, { look: 0.2 }); this.handsOn(A, null, null, 0.2);
    const bz = Math.min(zc - ST.handZ - 0.42, AMB.rearZ - 0.5); const bp = this.vanPt(u, bz); const reach = (zc - ST.handZ) - bz < 0.62;
    this.spot(B, bp.x, bp.z, v.yaw, 'medCarry', { direct: true, look: 0.3, holdL: reach ? H.hand(-1, 1) : null, holdR: reach ? H.hand(1, 1) : null, speed: reach && e.slide < 1 ? 0.45 : 0 });
    this.syncStretcher(u); this.followBody(u);
    if (e.slide >= 1) { if (!e.stowed) { e.stowed = true; this.stow(u); } e.rearOpen = false; if (e.rear <= 0.01) { this.stats.carried++; e.ph = 'leave'; e.t = 0; e.transport = true; for (const o of u.officers) { o.want = null; o.ch.anim.set(null); o.ch.anim.holdWL = o.ch.anim.holdWR = null; o.mode = 'return'; o.goal = null; } } }
  }
  stow(u) { // inside: the stretcher and sheet ride in the van (the body under the sheet is the draped shape); the person leaves the crowd
    const e = u.e, v = u.v, p = e.p, C = this.crowd; v.mesh.updateMatrixWorld(); e.cargo = []; if (e.st) setCotLegs(e.st, 0, 0); for (const m of [e.st, e.sheet]) { if (!m) continue; v.mesh.attach(m); e.cargo.push(m); }
    if (e.kit) { e.kit.parent?.remove(e.kit); e.kit = null; e.kitOn = false; } // the bag went in with the cot
    e.st = null; e.sheet = null; if (p.ch.rag) { p.ch.rag.kin = null; p.ch.rag.release(); } const i = C.peds.indexOf(p); if (i >= 0) { C.peds.splice(i, 1); C.despawn(p); } else { p.ch.root.parent?.remove(p.ch.root); p.ch.dispose(); } e.p = null; this.pr.note(`EMS unit ${u.id} patient loaded`);
  }
  // ---------------------------------------------------------------- a medic on foot (called from PoliceResponse.updateOfficer)
  medic(o, u, dt) {
    const pr = this.pr, A = o.ch.anim, W = o.want; let speed = 0;
    if (!W) { pr.animOfficer(o, dt, 0); return; }
    if (W.direct) { const d = Math.hypot(W.x - o.x, W.z - o.z); o.x = W.x; o.z = W.z; o.yaw += angDiff(W.yaw, o.yaw) * Math.min(1, dt * 8); speed = W.speed || 0; o.placedT = (o.placedT || 0) + dt; void d; if (A.action !== W.act) A.set(W.act); }
    else { const d = Math.hypot(W.x - o.x, W.z - o.z); const key = `${W.x.toFixed(1)},${W.z.toFixed(1)}`;
      if (o.wantKey && o.wantKey !== key && d > 0.5) { o.placedT = 0; o.seekT = 0; } o.wantKey = key;
      if (d > 0.35 && !(o.placedT > 0)) { o.seekT = (o.seekT || 0) + dt; speed = pr.moveTo(o, W.x, W.z, W.run && d > 3 ? 3.1 : d > 1.2 ? 1.5 : 0.9, dt); if (A.action && A.action !== 'medCarry') A.set(null); if ((o.blockedT > 2.5 && d < 1.5) || o.seekT > 15) { if (W.noStep) o.stuck = true; else { o.x = W.x; o.z = W.z; } o.seekT = 0; } } // can't get there (blocked): step in (75th: never on the approach — the crew gives up instead of clipping through)
      else { o.placedT = (o.placedT || 0) + dt; o.x += (W.x - o.x) * Math.min(1, dt * 6); o.z += (W.z - o.z) * Math.min(1, dt * 6); o.yaw += angDiff(W.yaw, o.yaw) * Math.min(1, dt * 6); if (A.action !== (W.act || null)) A.set(W.act || null); } }
    if (W.act === 'medCarry' || W.act === 'medLift') { for (const k of ['holdL', 'holdR']) { const t = W[k]; if (!t || t._palm) continue; const dx = o.x - t.x, dz = o.z - t.z, dl = Math.hypot(dx, dz) || 1; t.x += dx / dl * 0.07; t.z += dz / dl * 0.07; t.y += 0.03; t._palm = true; } } // 75th: the IK puts the WRIST on its target — for the cot grips (and the sheet corners) the wrist sits 7 cm back toward the medic and 3 cm up, so the palm closes over the bar instead of the fingers poking past it
    A.holdWL = W.holdL || null; A.holdWR = W.holdR || null; A.holdPoleL = W.poleL || null; A.holdPoleR = W.poleR || null; A.medLean = W.lean ?? 0.2; A.medLook = W.look ?? 0.35; A.medShake = W.shake || 0; A.medUp = W.up ?? 1;
    o.y = this.g.collision.groundAt(o.x, o.z, (o.y || 0) + 0.5); pr.animOfficer(o, dt, speed);
  }
  // ---------------------------------------------------------------- siren: a two-tone wail of its own (distinct from the police)
  // 75th: chest compressions — the 'hosp.cpr' recording loops while a paramedic is compressing; without one, a soft thump
  // on every push (synth placeholder, 1.9 /s like the animation)
  updateCpr(dt) {
    if (!Audio.ready || !Audio.ctx) return; const c = Audio.ctx; let at = null; for (const u of this.units) if (u.e && u.e.ph === 'cpr' && u.e.compress) { at = u.e.compress; break; }
    if (!this.cpr) { if (!at) return; const gn = c.createGain(); gn.gain.value = 0; const pan = c.createStereoPanner ? c.createStereoPanner() : null; if (pan) { gn.connect(pan); pan.connect(Audio.bus.sfx); } else gn.connect(Audio.bus.sfx); this.cpr = { gn, pan, ph: 0, rec: false }; }
    const S = this.cpr, now = c.currentTime; let g = 0, pn = 0; if (at) { const [gg, pp] = Audio.spatial(at.x, at.z, 14); g = gg * (this.g.indoor ? 0.25 : 1); pn = pp; }
    S.gn.gain.setTargetAtTime(g * 0.9, now, 0.08); if (S.pan) S.pan.pan.setTargetAtTime(pn, now, 0.1);
    S.rec = !!SoundBank.syncLoop(S, 'hosp.cpr', at ? S.gn : null);
    if (at && !S.rec) { S.ph += dt * 1.9; if (S.ph >= 1) { S.ph -= 1; if (g > 0.02) Audio.noise(0.07, { f: 160, q: 0.9, vol: 0.05 * g, pan: pn }); } } else S.ph = 0.9;
  }
  updateSiren(dt) {
    if (!Audio.ready || !Audio.ctx) return; const c = Audio.ctx; let best = null, bd = 1e9; for (const u of this.units) { if (!u.v || !(u.e.ph === 'drive' || (u.e.blockLit && u.e.toBay === 'road'))) continue; /* 75th: also a held-up transport running with lights (the siren loops while it is on) */ const d = Math.hypot(u.v.x - this.g.camera.position.x, u.v.z - this.g.camera.position.z); if (d < bd) { bd = d; best = u.v; } }
    if (!this.siren) { if (!best) return; const o1 = c.createOscillator(); o1.type = 'triangle'; const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1000; f.Q.value = 0.7; const gn = c.createGain(); gn.gain.value = 0; const og = c.createGain(); const pan = c.createStereoPanner ? c.createStereoPanner() : null; o1.connect(f); f.connect(og); og.connect(gn); if (pan) { gn.connect(pan); pan.connect(Audio.bus.sfx); } else gn.connect(Audio.bus.sfx); o1.start(); this.siren = { o1, og, gn, pan, ph: 0 }; }
    const S = this.siren, now = c.currentTime; let gain = 0, pan = 0; if (best) { const [gg, pp] = Audio.spatial(best.x, best.z, 100); gain = 0.06 * gg * (this.g.indoor ? 0.3 : 1); pan = pp; }
    S.ph += dt; const hi = Math.floor(S.ph / 0.62) % 2 === 0; S.o1.frequency.setTargetAtTime(hi ? 960 : 720, now, 0.02); S.gn.gain.setTargetAtTime(gain, now, 0.15); if (S.pan) S.pan.pan.setTargetAtTime(pan, now, 0.1);
    const rec = !!SoundBank.syncLoop(S, 'siren.ambulance', S.gn); if (rec !== !!S.rec) { S.rec = rec; S.og.gain.setTargetAtTime(rec ? 0 : 1, now, 0.05); }
  }
}
