// Hit-reaction hand placement (node tools/clutch-test.mjs [--tune]): when a punched NPC's hand goes up to where it hurts
// (Boxing.js CLUTCH), the palm must land ON the struck place of the real skinned mesh — the jaw on the struck side (hook),
// the mouth (snap), the chin (uppercut), the ribs / stomach (body shot) — not hover beside the face, and must not sink into
// the head or torso. Measured on 4 NPC bodies (women / men, short / tall) at the peak of each reaction, both sides.
// 'On the target' = palm centre within 7 cm of a point 3.5 cm off the skin at the landmark (NpcHead mouth / chin / jaw from
// the head ellipsoid; ribs / stomach from the chest / spine vertices).
// --tune: coordinate-descent search of the CLUTCH table on these bodies (prints the values to paste into Boxing.js).
import './node-dom-stub.mjs';
const THREE = await import('three');
const { Character, randomSpec } = await import('../src/actors/Character.js');
const { CLUTCH, reactDur } = await import('../src/actors/Boxing.js');
const { npcHeadFit } = await import('../src/actors/NpcHead.js');
const TUNE = process.argv.includes('--tune');
let pass = 0, fail = 0; const fails = []; const ok = (c, m) => { if (c) pass++; else { fail++; fails.push(m); } };
const specs = [randomSpec(77, { age: 'adult', sex: 'f' }), randomSpec(4021, { age: 'adult', sex: 'f' }), randomSpec(91, { age: 'adult', sex: 'm' }), randomSpec(5550, { age: 'adult', sex: 'm' })];
const V3 = THREE.Vector3; const M4 = THREE.Matrix4;
// per body: the vertices of each bone (weight > 0.85) in that bone's local frame, and simple ellipsoid fits of head / chest
function prep(spec) {
  const ch = new Character(spec); ch.root.updateMatrixWorld(true); const m = ch.mesh, g = m.geometry, sk = m.skeleton; const names = sk.bones.map((b) => b.name);
  const pos = g.attributes.position, si = g.attributes.skinIndex, sw = g.attributes.skinWeight; const per = {}; const v = new V3();
  for (let i = 0; i < pos.count; i++) { for (let k = 0; k < 4; k++) { if (sw.getComponent(i, k) < 0.6) continue; const bi = si.getComponent(i, k); const nm = names[bi];
    v.fromBufferAttribute(pos, i).applyMatrix4(m.bindMatrix).applyMatrix4(sk.boneInverses[bi]); (per[nm] || (per[nm] = [])).push(v.clone()); } }
  if (process.env.V) console.log(Object.entries(per).map(([k, a]) => k + ":" + a.length).join(" "));
  const box = (nm) => { const b = new THREE.Box3(); for (const p of per[nm]) b.expandByPoint(p); return b; };
  // the face: lower 55 % of the head vertices, front half (no hair volume / bun / hat), for the jaw / mouth / chin targets
  const hb = box('head'), hy = hb.max.y - hb.min.y, zc = (hb.min.z + hb.max.z) / 2; const face = new THREE.Box3(); for (const p of per.head) if (p.y < hb.min.y + hy * 0.55 && p.z > zc) face.expandByPoint(p);
  // anatomical landmarks of the crowd head (NpcHead.js: the head the mesh is built from), bind space → head-bone frame
  const NH = npcHeadFit(spec); const hi = names.indexOf('head'); const toHead = (p) => new V3(...p).applyMatrix4(sk.boneInverses[hi]);
  const lm = { mouth: toHead(NH.mouth), chin: toHead(NH.chin), hc: toHead(NH.hc), hr: NH.hr };
  return { ch, per, head: hb, face, lm, chest: box('chest'), spine: box('spine') };
}
const bodies = specs.map(prep);
const world = (B, nm, p) => p.clone().applyMatrix4(B.ch.bones[nm].matrixWorld);
const toLocal = (B, nm, w) => w.clone().applyMatrix4(new M4().copy(B.ch.bones[nm].matrixWorld).invert());
// palm: centroid of the hand vertices, nudged to the palm face (the hand's inner side faces the body in a clutch)
const palm = (B, side) => { const L = B.per['hand' + side]; const c = new V3(); for (const p of L) c.add(p); c.multiplyScalar(1 / L.length); return world(B, 'hand' + side, c); };
// inside an ellipsoid fitted to a bone's box (shrunk slightly: the hair / clothes layer is allowed to be touched)
const inside = (box, l, k = 0.92) => { const c = box.getCenter(new V3()), h = box.getSize(new V3()).multiplyScalar(0.5 * k); const q = l.clone().sub(c); return (q.x / h.x) ** 2 + (q.y / h.y) ** 2 + (q.z / h.z) ** 2 < 1; };
// inside the skull (the anatomical head ellipsoid the crowd head is sculpted from, 0.9 of it: nose / lips / jaw shape stick out of it)
const inHead = (B, l) => { const M = B.lm, q = l.clone().sub(M.hc); return (q.x / (M.hr[0] * 0.9)) ** 2 + (q.y / (M.hr[1] * 0.9)) ** 2 + (q.z / (M.hr[2] * 0.9)) ** 2 < 1; };
// targets in the bone's local frame (character faces +z, its right is −x): returns [bone, point on the surface, outward normal]
function targets(B, kind, d) { const C = B.chest, S = B.spine, M = B.lm; const rs = d > 0 ? -1 : 1; // struck side: d > 0 → right (−x)
  const n = (x, y, z) => new V3(x, y, z).normalize();
  if (kind === 'snap') return [{ side: d > 0 ? 'R' : 'L', bone: 'head', p: M.mouth.clone(), n: n(0, 0, 1) }]; // palm over the mouth
  if (kind === 'hook') return [{ side: d > 0 ? 'R' : 'L', bone: 'head', p: new V3(M.hc.x + rs * M.hr[0] * 0.78, M.hc.y - M.hr[1] * 0.5, M.hc.z + M.hr[2] * 0.38), n: n(rs * 0.85, -0.1, 0.5) }]; // the struck jaw
  if (kind === 'upper') return [{ side: 'R', bone: 'head', p: M.chin.clone(), n: n(0, -0.5, 0.85) }]; // the chin
  if (kind === 'body') return [{ side: 'L', bone: 'chest', p: new V3(C.max.x * 0.72, C.min.y + (C.max.y - C.min.y) * 0.18, C.max.z * 0.55), n: n(0.6, 0, 0.8) }, { side: 'R', bone: 'spine', p: new V3(0, (S.min.y + S.max.y) / 2, S.max.z), n: n(0, 0, 1) }];
  return []; }
function pose(B, kind, d) { const an = B.ch.anim; an.fight = null; an.takeHit(kind, d, 1); const T = reactDur(kind) * 0.55; for (let t = 0; t < T; t += 1 / 30) an.update(1 / 30, 0); an.update(0, 0); B.ch.root.updateMatrixWorld(true); }
function measure(kind, d, log = null) { let err = 0, pen = 0; const rows = [];
  for (const B of bodies) { pose(B, kind, d);
    for (const tg of targets(B, kind, d)) { const P = palm(B, tg.side); const surf = tg.p.clone().addScaledVector(tg.n, 0.035); const W = world(B, tg.bone, surf); const e = P.distanceTo(W); err += e;
      let inn = 0; for (const p of B.per['hand' + tg.side]) { const w = world(B, 'hand' + tg.side, p); if (inHead(B, toLocal(B, 'head', w)) || inside(B.chest, toLocal(B, 'chest', w), 0.88) || inside(B.spine, toLocal(B, 'spine', w), 0.88)) inn++; }
      pen += inn; rows.push({ B, tg, e, inn, n: B.per['hand' + tg.side].length }); } }
  if (log) for (const r of rows) log(r); return { err, pen, rows }; }
const cost = (kind) => { const a = measure(kind, 1), b = kind === 'hook' || kind === 'snap' ? measure(kind, -1) : { err: 0, pen: 0 }; return a.err + b.err + 0.015 * (a.pen + b.pen); };
if (TUNE) { // the IK wrist targets (bone frame) and the wrist bend; the upper-cut's supporting left hand is not a contact
  for (const kind of ['snap', 'hook', 'upper', 'body']) { const C = CLUTCH[kind]; let best = cost(kind);
    for (const st of [0.04, 0.02, 0.01, 0.005]) for (let it = 0; it < 16; it++) { let moved = false;
      for (const sd of Object.keys(C)) { if (kind === 'upper' && sd === 'L') continue; const c = C[sd];
        for (let j = 0; j < 5; j++) for (const sg of [-1, 1]) { const get = () => (j < 3 ? c.p[j] : j === 3 ? c.wr || 0 : c.wz || 0), set = (x) => { if (j < 3) c.p[j] = x; else if (j === 3) c.wr = x; else c.wz = x; };
          const old = get(), nv = old + sg * (j < 3 ? st : st * 5); if (j >= 3 && Math.abs(nv) > 0.6) continue; set(nv); const v = cost(kind); if (v < best - 1e-5) { best = v; moved = true; } else set(old); } }
      if (!moved) break; }
    for (const c of Object.values(C)) { c.p = c.p.map((x) => +x.toFixed(3)); if (c.wr) c.wr = +c.wr.toFixed(2); if (c.wz) c.wz = +c.wz.toFixed(2); }
    console.log(`${kind}: ${JSON.stringify(C)}  cost ${best.toFixed(3)}`); }
}
const rows = [];
for (const kind of ['snap', 'hook', 'upper', 'body']) for (const d of kind === 'hook' || kind === 'snap' ? [1, -1] : [1]) measure(kind, d, (r) => {
  const tag = `${kind}${d < 0 ? '(left)' : ''} ${r.B.ch.spec.sex}${(r.B.ch.spec.height || 0).toFixed?.(2) ?? ''} hand${r.tg.side}→${r.tg.bone}`;
  ok(r.e < 0.07, `${tag}: palm on the target (${(r.e * 100).toFixed(1)} cm away)`); ok(r.inn <= Math.max(2, r.n * 0.04), `${tag}: hand not sunk into the body (${r.inn}/${r.n} vertices inside)`); rows.push([tag, r.e, r.inn, r.n]); });
for (const [t, e, i, n] of rows) console.log(`  ${t.padEnd(36)} ${(e * 100).toFixed(1).padStart(5)} cm  inside ${i}/${n}`);
console.log(`clutch-test: ${pass} passed, ${fail} failed`); for (const f of fails) console.log('  FAIL', f);
process.exit(fail ? 1 : 0);
