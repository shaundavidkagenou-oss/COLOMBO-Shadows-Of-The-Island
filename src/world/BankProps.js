// Ceylon Meridian Bank props (71st): built to real dimensions out of rounded parts so they read as real objects up close.
//   acUnit      — a wall split air conditioner (indoor unit, 0.89 × 0.29 × 0.20 m): rounded white casing, a separate front
//                 panel, the top intake grille, the outlet under the front with its vertical vanes and the open louvre
//                 flap, the small blue temperature display and power LED, and the PVC trunking taking the pipes up into the
//                 ceiling void. The casing is merged into the room's kit; 73rd: the louvre flap and the vertical vanes move
//                 (auto-swing) as two small meshes of their own (acUnit returns them with tick(t)).
//   landline    — a corded office desk phone: wedge body with the keypad deck tilted to the user, the handset in its cradle
//                 on the right, hook switch, LCD, function keys, message LED. Static.
//   callPhone   — the same phone whose handset can be lifted: the base is static, the handset is one small mesh moved by
//                 the phone-call routine (BankInterior) and its coiled cord a line redrawn while the handset is off the cradle.
//   bankCard    — a CMB debit card for the ATM card animation: ISO ID-1 (85.60 × 53.98 mm, 3.18 mm corners), the front with
//                 the EMV chip, contactless mark, embossed-style number, holder name and dates; the back with the magnetic
//                 stripe and signature panel. One mesh, one small canvas texture.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { MeshBuilder } from '../gfx/MeshBuilder.js';
import { C, kitMaterial, KIT } from './ShopKit.js';
import './RobberyShops.js'; // registers KIT.plastic / steel (the kit materials the props use)
import { CMB, drawLogo, hasCanvas } from './BankBrand.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), ONE = new THREE.Vector3(1, 1, 1);
export const frame = (x, y, z, yaw = 0, rx = 0) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, yaw, 0, 'YXZ')), ONE);
const rbox = (w, h, d, r, seg = 2) => new RoundedBoxGeometry(w, h, d, seg, Math.max(1e-4, Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4)));
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
// one part: geometry placed at (lx, ly, lz) with rotation (rx, ry, rz) in frame F, merged into builder b, then disposed
export function part(b, F, geo, lx, ly, lz, rx, ry, rz, col) { _m.compose(_v.set(lx, ly, lz), _q.setFromEuler(_e.set(rx, ry, rz)), ONE); b.geometry(geo, new THREE.Matrix4().multiplyMatrices(F, _m), col); geo.dispose(); }
// axis-aligned rounded box straight into a builder (room coordinates)
export function rb(b, x, y, z, w, h, d, r, col, seg = 2) { part(b, IDENT, rbox(w, h, d, r, seg), x, y, z, 0, 0, 0, col); }
const IDENT = new THREE.Matrix4();

// ------------------------------------------------------------------ wall split air conditioner
// (x, y, z): the middle of the unit's back on the wall; yaw: the direction it blows (0 = +z); ceil: ceiling height (trunking)
export function acUnit(k, x, y, z, yaw, ceil = 3.6) {
  const F = frame(x, y, z, yaw); const pl = k.get('plastic'), em = k.get('emissive');
  const W = 0.89, H = 0.29, D = 0.2; const white = C('#eceeec'), panel = C('#f4f5f2'), dark = C('#1d2024'), grey = C('#c4c8ca'), seam = C('#a3a8ab');
  part(pl, F, box(W + 0.014, H + 0.014, 0.004), 0, 0, 0.002, 0, 0, 0, C('#8f918e')); // the shadow line where the casing meets the wall
  part(pl, F, rbox(W, H - 0.04, D, 0.05, 4), 0, 0.02, D / 2 + 0.004, 0, 0, 0, white); // casing: the upper body
  part(pl, F, rbox(W, 0.09, D - 0.035, 0.04, 4), 0, -H / 2 + 0.05, (D - 0.035) / 2 + 0.004, 0, 0, 0, white); // the lower body, stepped back under the outlet (the real units' tapered belly)
  part(pl, F, rbox(W - 0.024, 0.2, 0.018, 0.008, 3), 0, 0.034, D + 0.003, -0.06, 0, 0, panel); // front panel (lifts for the filters), its top leaning back
  part(pl, F, box(W - 0.05, 0.0015, 0.003), 0, -0.068, D + 0.009, 0, 0, 0, seam); // panel seam
  part(pl, F, box(W - 0.3, 0.0012, 0.002), 0, 0.1, D + 0.011, -0.06, 0, 0, C('#dfe1de')); // a faint moulded line across the panel
  for (const s of [-1, 1]) part(pl, F, rbox(0.006, H - 0.07, D - 0.04, 0.0025), s * (W / 2 - 0.001), 0.005, D / 2 + 0.012, 0, 0, 0, grey); // side cap joints
  // top intake grille: dark recess with slats parallel to the wall
  part(pl, F, box(W - 0.09, 0.002, 0.118), 0, H / 2 + 0.0008, 0.082, 0, 0, 0, dark);
  for (let i = 0; i < 15; i++) part(pl, F, box(W - 0.09, 0.003, 0.0035), 0, H / 2 + 0.0022, 0.027 + i * 0.0078, 0, 0, 0, white);
  // outlet under the front edge: the dark throat with the heat-exchanger fins showing deep inside (the moving vanes / flap are separate)
  part(pl, F, box(W - 0.11, 0.056, 0.004), 0, -H / 2 + 0.034, D - 0.03, 0.62, 0, 0, dark);
  part(pl, F, box(W - 0.11, 0.003, 0.11), 0, -H / 2 + 0.004, D - 0.07, 0, 0, 0, dark);
  for (let i = 0; i < 40; i++) part(pl, F, box(0.0012, 0.03, 0.02), -(W - 0.14) / 2 + i * (W - 0.14) / 39, -H / 2 + 0.03, D - 0.105, 0.5, 0, 0, C('#5a5f64')); // fins
  // display window lower right: two blue digits ("24"), the green power LED, the receiver eye
  part(pl, F, rbox(0.074, 0.024, 0.004, 0.003), W / 2 - 0.12, -0.05, D + 0.011, -0.06, 0, 0, C('#15171a'));
  for (const dx of [-0.009, 0.007]) part(em, F, box(0.009, 0.013, 0.001), W / 2 - 0.12 + dx, -0.049, D + 0.0135, -0.06, 0, 0, [0.35, 0.72, 1.0]);
  part(em, F, box(0.004, 0.004, 0.001), W / 2 - 0.085, -0.05, D + 0.0135, -0.06, 0, 0, [0.3, 1.0, 0.45]);
  part(pl, F, rbox(0.012, 0.008, 0.003, 0.0015), W / 2 - 0.16, -0.05, D + 0.012, -0.06, 0, 0, C('#3a1f24'));
  // pipe trunking from the casing's top left up into the ceiling void
  const th = Math.max(0.05, ceil - (y + H / 2)); part(pl, F, rbox(0.08, th + 0.02, 0.06, 0.008), -W / 2 + 0.1, H / 2 + th / 2 - 0.01, 0.034, 0, 0, 0, C('#e8e6df'));
  part(pl, F, box(0.09, 0.012, 0.07), -W / 2 + 0.1, ceil - 0.006, 0.038, 0, 0, 0, C('#dedcd4')); // ceiling collar
  // 73rd: the moving parts — the horizontal louvre flap (auto-swing: it sweeps the air down and up) and the row of vertical vanes
  // (sweeping left / right) are their own two small meshes on the kit's plastic material, turned by tick(t) while the room is
  // drawn. Both are in the room group (no light, no new material: two draw calls per unit, only while the bank is on screen).
  const mat = k.extra.plastic || kitMaterial('plastic', KIT.plastic); const grp = new THREE.Group(); grp.name = 'acMoving'; // (74th: the bank's own plastic) F.decompose(grp.position, grp.quaternion, grp.scale);
  const fb = new MeshBuilder(); { const g = rbox(W - 0.12, 0.0055, 0.074, 0.0025); g.translate(0, 0, -0.037); fb.geometry(g, new THREE.Matrix4(), panel); g.dispose();
    const r = box(W - 0.13, 0.0015, 0.004); r.translate(0, 0.0032, -0.07); fb.geometry(r, new THREE.Matrix4(), seam); r.dispose(); }
  const flap = new THREE.Mesh(fb.build(), mat); flap.name = 'acFlap'; flap.position.set(0, -H / 2 - 0.006, D - 0.004); flap.rotation.x = -0.55; grp.add(flap);
  const vb = new MeshBuilder(); const NV = 13; const vanes = [];
  for (let i = 0; i < NV; i++) { const g = box(0.0025, 0.034, 0.05); vb.geometry(g, new THREE.Matrix4().makeTranslation(-(W - 0.16) / 2 + i * (W - 0.16) / (NV - 1), 0, 0), C('#30343a')); g.dispose(); }
  const vg = vb.build(); const vane = new THREE.Mesh(vg, mat); vane.name = 'acVanes'; vane.position.set(0, -H / 2 + 0.012, D - 0.05); grp.add(vane); vanes.push(vane);
  // the vanes turn together about their own vertical axes: one mesh, so the turn is a shear of the row (x stays, z skews with x)
  const P0 = Float32Array.from(vg.attributes.position.array); const pos = vg.attributes.position; const cx = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) { const xx = P0[i * 3]; cx[i] = Math.round((xx + (W - 0.16) / 2) / ((W - 0.16) / (NV - 1))) * ((W - 0.16) / (NV - 1)) - (W - 0.16) / 2; }
  const ph = (x + z) * 0.37; let lastA = 99;
  return { group: grp, flap, vane, tick(t) {
    const a = -0.55 - 0.32 * (0.5 - 0.5 * Math.cos((t * 2 * Math.PI) / 13 + ph)); flap.rotation.x = a; // auto swing: ~13 s up and down
    const va = 0.38 * Math.sin((t * 2 * Math.PI) / 17 + ph * 1.7); if (Math.abs(va - lastA) < 0.004) return; lastA = va; const c = Math.cos(va), sn = Math.sin(va);
    for (let i = 0; i < pos.count; i++) { const lx = P0[i * 3] - cx[i], lz = P0[i * 3 + 2]; pos.array[i * 3] = cx[i] + lx * c + lz * sn; pos.array[i * 3 + 2] = -lx * sn + lz * c; }
    pos.needsUpdate = true; } };
}

// ------------------------------------------------------------------ office desk phone
// local frame: origin on the desk top, +z towards the user, +x the user's right. Returns the deck frame and the handset's
// cradle matrix (in the builder's coordinates)
const PH = { charcoal: C('#2a2c30'), body: C('#303237'), key: C('#d4d7da'), fkey: C('#8d9196'), dark: C('#121315') };
function phoneBase(k, F) {
  const pl = k.get('plastic'), em = k.get('emissive');
  part(pl, F, rbox(0.215, 0.02, 0.19, 0.008), 0, 0.01, 0, 0, 0, 0, PH.charcoal); // foot plate
  const Fb = new THREE.Matrix4().multiplyMatrices(F, frame(0, 0.042, -0.006, 0, 0.18)); // the body, its deck tilted to the user
  part(pl, F, rbox(0.205, 0.046, 0.175, 0.013), 0, 0.042, -0.006, 0.18, 0, 0, PH.body);
  const top = 0.023; const on = (geo, lx, lz, h, col, b = pl) => part(b, Fb, geo, lx, top + h / 2, lz, 0, 0, 0, col);
  // cradle on the right: two rounded rests and the hook switch between them
  for (const lz of [-0.058, 0.052]) on(rbox(0.062, 0.02, 0.032, 0.009), 0.058, lz, 0.02, PH.charcoal);
  on(rbox(0.014, 0.012, 0.012, 0.003), 0.058, -0.004, 0.012, C('#9aa0a6'));
  // keypad 4 × 3 and the function keys
  for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) on(rbox(0.015, 0.005, 0.012, 0.0025), -0.062 + c * 0.02, -0.022 + r * 0.017, 0.005, PH.key);
  for (let c = 0; c < 4; c++) on(rbox(0.013, 0.004, 0.009, 0.002), -0.074 + c * 0.018, 0.058, 0.004, PH.fkey);
  for (let r = 0; r < 4; r++) on(rbox(0.009, 0.004, 0.009, 0.002), -0.092, -0.022 + r * 0.017, 0.004, PH.fkey); // memory keys
  // LCD (bezel + softly lit face), speaker slots, message-waiting LED, the cord jack on the left
  on(rbox(0.08, 0.004, 0.032, 0.003), -0.04, -0.06, 0.004, PH.dark); part(em, Fb, box(0.07, 0.001, 0.022), -0.04, top + 0.0045, -0.06, 0, 0, 0, [0.34, 0.42, 0.36]);
  for (let i = 0; i < 5; i++) on(box(0.022, 0.0015, 0.0025), 0.0, -0.076 + i * 0.0055, 0.0015, PH.dark);
  part(em, Fb, box(0.006, 0.004, 0.006), 0.09, top + 0.002, -0.074, 0, 0, 0, [1, 0.12, 0.08]);
  part(pl, F, box(0.006, 0.008, 0.012), -0.106, 0.024, 0.03, 0, 0, 0, PH.dark);
  return { Fb, cradle: new THREE.Matrix4().multiplyMatrices(Fb, frame(0.058, top + 0.02 + 0.0235, -0.003, Math.PI)), jack: new THREE.Vector3(-0.108, 0.024, 0.03).applyMatrix4(F) };
}
// the handset in its own frame: long axis +z (earpiece at +z), the face side (cups) towards −y
function handsetInto(b, F) {
  const c = PH.charcoal; part(b, F, rbox(0.045, 0.026, 0.135, 0.012), 0, 0.004, 0, 0, 0, 0, c);
  part(b, F, rbox(0.053, 0.034, 0.06, 0.015), 0, -0.006, 0.073, 0.12, 0, 0, c); part(b, F, rbox(0.05, 0.034, 0.058, 0.015), 0, -0.006, -0.073, -0.12, 0, 0, c);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) part(b, F, box(0.004, 0.002, 0.004), -0.008 + i * 0.008, -0.0235, 0.066 + j * 0.008, 0, 0, 0, PH.dark); // earpiece holes
  for (let i = 0; i < 4; i++) part(b, F, box(0.003, 0.002, 0.003), -0.006 + i * 0.004, -0.0235, -0.075, 0, 0, 0, PH.dark); // microphone holes
}
export const HANDSET = { len: 0.2, ear: new THREE.Vector3(0, -0.024, 0.073), mic: new THREE.Vector3(0, -0.024, -0.073), cord: new THREE.Vector3(0, -0.005, -0.1) };
export function landline(k, x, y, z, yaw) { const F = frame(x, y, z, yaw); const P = phoneBase(k, F); handsetInto(k.get('plastic'), P.cradle); }

// a phone whose handset is lifted: base into the kit, handset mesh + cord line added to group g (same frame as the kit)
export function callPhone(k, g, x, y, z, yaw) {
  const F = frame(x, y, z, yaw); const P = phoneBase(k, F);
  const hb = new MeshBuilder(); handsetInto(hb, IDENT); const mesh = new THREE.Mesh(hb.build(), k.extra.plastic || kitMaterial('plastic', KIT.plastic));
  mesh.name = 'bank-call-handset'; mesh.matrixAutoUpdate = false; mesh.castShadow = false; mesh.receiveShadow = true; g.add(mesh);
  const N = 260; const pos = new Float32Array(N * 3); const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const cord = new THREE.Line(lg, new THREE.LineBasicMaterial({ color: 0x1b1c1f })); cord.name = 'bank-call-cord'; cord.frustumCulled = false; g.add(cord);
  const ph = { mesh, cord, cradle: P.cradle.clone(), jack: P.jack.clone(), M: P.cradle.clone(), off: false,
    // place the handset (matrix in g's frame) and redraw the cord between the base's jack and the handset's lower end
    set(M) { this.M.copy(M); mesh.matrix.copy(M); mesh.matrixWorldNeedsUpdate = true; this.drawCord(); },
    home() { this.set(this.cradle); this.off = false; },
    drawCord() {
      const A = this.jack, B = HANDSET.cord.clone().applyMatrix4(this.M); const d = A.distanceTo(B); const tan = _v.subVectors(B, A).normalize().clone();
      const u = new THREE.Vector3(0, 1, 0).cross(tan); if (u.lengthSq() < 1e-6) u.set(1, 0, 0); u.normalize(); const w = new THREE.Vector3().crossVectors(tan, u);
      const sag = Math.max(0.015, 0.3 - d * 0.22), turns = 26 + d * 22, r = 0.0055; // a short cord hangs in a loop; stretched, the coil opens up
      for (let i = 0; i < N; i++) { const t = i / (N - 1), a = t * turns * Math.PI * 2, cr = r * Math.min(1, t * 12, (1 - t) * 12);
        pos[i * 3] = A.x + (B.x - A.x) * t + (Math.cos(a) * u.x + Math.sin(a) * w.x) * cr; pos[i * 3 + 1] = A.y + (B.y - A.y) * t - sag * 4 * t * (1 - t) + (Math.cos(a) * u.y + Math.sin(a) * w.y) * cr; pos[i * 3 + 2] = A.z + (B.z - A.z) * t + (Math.cos(a) * u.z + Math.sin(a) * w.z) * cr; }
      lg.attributes.position.needsUpdate = true;
    },
  };
  ph.home(); return ph;
}

// ------------------------------------------------------------------ CMB debit card
export const CARD = { w: 0.0856, h: 0.05398, r: 0.00318, t: 0.00076 };
let cardTex = null;
function drawCard(ctx, W, H) { // front on the left half, back on the right half
  const f = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); }; const hw = W / 2;
  { const g = ctx.createLinearGradient(0, 0, hw, H); g.addColorStop(0, '#0d2a52'); g.addColorStop(0.55, '#123a6e'); g.addColorStop(1, '#0a2142'); ctx.fillStyle = g; ctx.fillRect(0, 0, hw, H);
    ctx.globalAlpha = 0.12; ctx.strokeStyle = '#c9a54a'; ctx.lineWidth = 1; for (let i = 0; i < 9; i++) { ctx.beginPath(); ctx.ellipse(hw * 0.95, H * 1.05, 40 + i * 9, 26 + i * 7, 0, Math.PI, Math.PI * 1.5); ctx.stroke(); } ctx.globalAlpha = 1;
    try { drawLogo(ctx, 8, 6, 18, { keyline: false }); } catch { /* no logo */ }
    ctx.fillStyle = '#e9dcae'; ctx.font = 'bold 8px sans-serif'; ctx.textBaseline = 'top'; ctx.fillText(CMB.name.toUpperCase(), 30, 9); ctx.font = '6px sans-serif'; ctx.fillStyle = '#c9b77e'; ctx.fillText('MERIDIAN SAVINGS · DEBIT', 30, 19);
    // EMV chip: gold pad with its contact pattern
    const cx = 14, cy = 33, cw = 17, ch = 13; const cg = ctx.createLinearGradient(cx, cy, cx + cw, cy + ch); cg.addColorStop(0, '#f2dc8f'); cg.addColorStop(0.5, '#c9a447'); cg.addColorStop(1, '#e8cf7a'); ctx.fillStyle = cg; ctx.fillRect(cx, cy, cw, ch);
    ctx.strokeStyle = '#8c6d22'; ctx.lineWidth = 0.6; ctx.strokeRect(cx + 0.5, cy + 0.5, cw - 1, ch - 1); ctx.beginPath(); ctx.moveTo(cx + cw / 2, cy); ctx.lineTo(cx + cw / 2, cy + ch); for (const yy of [cy + ch / 3, cy + 2 * ch / 3]) { ctx.moveTo(cx, yy); ctx.lineTo(cx + cw * 0.36, yy); ctx.moveTo(cx + cw * 0.64, yy); ctx.lineTo(cx + cw, yy); } ctx.stroke();
    ctx.strokeStyle = '#dfe6ee'; ctx.lineWidth = 1.1; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(38 + i * 3.2, cy + ch / 2, 3 + i * 2.6, -0.8, 0.8); ctx.stroke(); } // contactless mark
    ctx.fillStyle = '#eef1f4'; ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowOffsetY = 0.6; ctx.shadowBlur = 0.6; ctx.font = 'bold 9px monospace'; ctx.fillText('4729 6105 3318 0471', 12, 52);
    ctx.font = '5px sans-serif'; ctx.fillText('VALID THRU', 46, 63); ctx.font = 'bold 7px monospace'; ctx.fillText('08/30', 70, 62); ctx.font = 'bold 7px monospace'; ctx.fillText('CARD HOLDER', 12, 71); ctx.shadowColor = 'transparent';
    ctx.fillStyle = '#c9a54a'; ctx.font = 'bold italic 8px sans-serif'; ctx.fillText('DEBIT', hw - 30, 70); }
  { const x0 = hw; f(x0, 0, hw, H, '#e4e7ea'); f(x0, 8, hw, 14, '#141414'); f(x0 + 8, 28, hw * 0.62, 11, '#f6f4ee'); ctx.strokeStyle = '#c8c2b2'; for (let i = 0; i < 10; i++) { ctx.beginPath(); ctx.moveTo(x0 + 8 + i * 6, 28); ctx.lineTo(x0 + 14 + i * 6, 39); ctx.stroke(); }
    ctx.fillStyle = '#2b3440'; ctx.font = '5px sans-serif'; ctx.textBaseline = 'top'; ctx.fillText('AUTHORISED SIGNATURE', x0 + 8, 41); ctx.fillText('This card is the property of ' + CMB.name.toUpperCase() + '.', x0 + 8, 52); ctx.fillText('If found, please return it to any CMB branch.', x0 + 8, 59);
    ctx.fillStyle = '#1b1c1f'; ctx.font = 'italic bold 7px monospace'; ctx.fillText('047', x0 + hw * 0.7 + 4, 30); }
}
export function bankCard() {
  const s = new THREE.Shape(); const { w, h, r } = CARD, x0 = -w / 2, y0 = -h / 2;
  s.moveTo(x0 + r, y0); s.lineTo(x0 + w - r, y0); s.quadraticCurveTo(x0 + w, y0, x0 + w, y0 + r); s.lineTo(x0 + w, y0 + h - r); s.quadraticCurveTo(x0 + w, y0 + h, x0 + w - r, y0 + h); s.lineTo(x0 + r, y0 + h); s.quadraticCurveTo(x0, y0 + h, x0, y0 + h - r); s.lineTo(x0, y0 + r); s.quadraticCurveTo(x0, y0, x0 + r, y0);
  const front = new THREE.ShapeGeometry(s, 3), back = new THREE.ShapeGeometry(s, 3);
  // card frame: long side along x, the face up (+y) — the shapes lie in xy, so lay them down; the back is the front flipped over
  const uvF = front.attributes.uv, pF = front.attributes.position; for (let i = 0; i < pF.count; i++) uvF.setXY(i, (pF.getX(i) - x0) / w * 0.5, (pF.getY(i) - y0) / h);
  const uvB = back.attributes.uv, pB = back.attributes.position; for (let i = 0; i < pB.count; i++) uvB.setXY(i, 0.5 + (1 - (pB.getX(i) - x0) / w) * 0.5, (pB.getY(i) - y0) / h);
  front.rotateX(-Math.PI / 2); front.translate(0, CARD.t / 2, 0); back.rotateX(-Math.PI / 2); back.rotateZ(Math.PI); back.translate(0, -CARD.t / 2, 0);
  const geo = mergeTwo(front, back); front.dispose(); back.dispose();
  if (!cardTex && hasCanvas()) { const cv = document.createElement('canvas'); cv.width = 256; cv.height = 80; const ctx = cv.getContext('2d'); drawCard(ctx, 256, 80); cardTex = new THREE.CanvasTexture(cv); cardTex.colorSpace = THREE.SRGBColorSpace; cardTex.anisotropy = 4; }
  const mat = new THREE.MeshStandardMaterial({ map: cardTex, color: cardTex ? 0xffffff : 0x123a6e, roughness: 0.32, metalness: 0.08 }); mat.userData.own = true;
  const m = new THREE.Mesh(geo, mat); m.name = 'cmb-card'; m.castShadow = false; m.visible = false; m.matrixAutoUpdate = false; return m;
}
function mergeTwo(a, b) {
  const out = new THREE.BufferGeometry(); const na = a.attributes.position.count; const cat = (k, n) => { const x = a.attributes[k].array, y = b.attributes[k].array; const r = new Float32Array(x.length + y.length); r.set(x); r.set(y, x.length); out.setAttribute(k, new THREE.BufferAttribute(r, n)); };
  cat('position', 3); cat('normal', 3); cat('uv', 2); const ia = a.index.array, ib = b.index.array; const idx = new Uint32Array(ia.length + ib.length); idx.set(ia); for (let i = 0; i < ib.length; i++) idx[ia.length + i] = ib[i] + na; out.setIndex(new THREE.BufferAttribute(idx, 1)); return out;
}
