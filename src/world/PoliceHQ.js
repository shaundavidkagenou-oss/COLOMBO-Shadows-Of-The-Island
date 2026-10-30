// Sri Lanka Police Headquarters compound, Kompannaveediya (Slave Island), Colombo 02.
// Since March 2024 the Police HQ occupies the former Sri Lanka Air Force headquarters building at the Slave Island end of
// Sir Chittampalam A. Gardiner Mawatha. The game's city is compressed, so this compound is placed on the game's Union
// Place block next to Beira Lake / Gangaramaya. The building massing, compound layout and everything inside are an
// artistic interpretation — NOT a survey of the real site.
import * as THREE from 'three';

// shared layout (world metres; x = east, z = south). Used by the builder, the HQ runtime and the interior.
export const HQ = {
  rect: [-52, 30, -227, -178], // fence line
  gate: { x: -10, z: -227, w: 8 }, // vehicle gate on Union Place (north side)
  wicket: { x: -3.2, w: 1.8 }, // pedestrian gate next to it
  building: [-40, 18, -205, -183], storeys: 5,
  door: { x: -11, z: -207.6, faceIn: 0 }, // in front of the portico steps; interior entered from here
  // walk-in interior (no loading, no button): ground floor sits on the plinth (LAND_Y 0.15 + 0.9 + 2 cm), front wall just inside the facade
  interior: { x: -11, z: -204.85, y: 1.07 }, entrance: { x0: -13, x1: -9, h: 2.3 } /* top stays under the first-floor band */,
  booth: { x: -18, z: -223 },
  boom: { x: -14.6, z: -225.4, len: 8.4 }, // pivot; arm swings over the gate lane towards +x
  carBays: [-48, -44.8, -41.6, -38.4, -35.2, -32].map((x, i) => ({ x, z: -222.2, yaw: 0, type: i === 2 ? 'policejeep' : 'police' })),
  bikeBays: Array.from({ length: 9 }, (_, i) => ({ x: -47.6, z: -202.6 + i * 1.3, yaw: Math.PI / 2 })),
  staffBays: [-200.5, -196.3, -192.1, -187.9].map((z) => ({ x: 25.5, z, yaw: -Math.PI / 2 })),
  guards: [{ x: -15.4, z: -228.2, yaw: Math.PI }, { x: -4.6, z: -228.2, yaw: Math.PI }, { x: -18, z: -221.2, yaw: Math.PI * 0.75 }],
  // departure route for the motorcycle unit (shed → gate → Union Place, westbound kerb lane)
  depart: [[-44.5, -207.5], [-30, -209.5], [-14, -212], [-10, -217], [-10, -224], [-10, -229.5], [-12.5, -233.6]],
  // pedestrian paths staff use (wicket ↔ portico, car park ↔ portico, east lane)
  walks: [[[-3.2, -229], [-3.2, -215], [-8, -209.5]], [[-36, -214], [-24, -210], [-13, -209]], [[24, -186], [22, -209], [-6, -209.5]]],
};

export function buildPoliceHQ({ mb, box, coll, label, group, LAND_Y, SANS, SI, TA, columns, anim, C }) {
  const y0 = LAND_Y; const conc = mb.get('concrete'), paint = mb.get('paint'), metal = mb.get('metal'), glass = mb.get('glass'), leaves = mb.get('leaves');
  const [fx0, fx1, fz0, fz1] = HQ.rect; const G = HQ.gate, Wk = HQ.wicket;
  // ---------------------------------------------------------------- paving (asphalt drive + car parks, light walkways)
  const ASPH = '#56585b', PAVE = '#cbc5ba';
  box(conc, -28, y0 + 0.03, -219.2, 46, 0.06, 14.4, ASPH, { uv: 8 }); // car park + gate drive  x −51…−5, z −226.4…−212
  box(conc, -11, y0 + 0.03, -208.5, 80, 0.06, 7, ASPH, { uv: 8 }); // forecourt along the front of the building
  box(conc, 24.5, y0 + 0.03, -193.5, 10, 0.06, 23, ASPH, { uv: 8 }); // east lane (staff parking)
  box(conc, -46, y0 + 0.03, -196, 10, 0.06, 18, ASPH, { uv: 8 }); // west strip: motorcycle shed
  box(conc, Wk.x, y0 + 0.05, -220, 1.8, 0.08, 14, PAVE, { uv: 4 }); // walkway from the wicket gate
  box(conc, -11, y0 + 0.05, -180.6, 58, 0.08, 1.6, PAVE, { uv: 4 }); // rear service path
  for (const b of HQ.carBays) { for (const dx of [-1.6, 1.6]) box(paint, b.x + dx, y0 + 0.065, b.z, 0.1, 0.01, 5, '#ecebe4'); box(paint, b.x, y0 + 0.065, b.z - 2.5, 3.2, 0.01, 0.1, '#ecebe4'); }
  for (const b of HQ.staffBays) box(paint, b.x, y0 + 0.065, b.z + 2.1, 5, 0.01, 0.1, '#ecebe4');
  box(paint, G.x, y0 + 0.065, -225.6, 7.6, 0.012, 0.35, '#ecebe4'); // stop line inside the gate
  for (let k = 0; k < 5; k++) box(paint, G.x - 3 + k * 1.5, y0 + 0.07, -224.2, 0.7, 0.08, 0.5, k % 2 ? '#f2f2ee' : '#c9a227'); // speed hump stripes
  box(conc, G.x, y0 + 0.04, -224.2, 7.8, 0.06, 0.6, '#3e4042');

  // ---------------------------------------------------------------- perimeter: low wall, pillars, painted railing
  const WALLC = '#ece7dc', RAIL = '#1d2a4a';
  const fence = (ax, az, bx, bz) => { // straight run (axis-aligned)
    const len = Math.hypot(bx - ax, bz - az); if (len < 0.3) return; const cx = (ax + bx) / 2, cz = (az + bz) / 2, alongX = Math.abs(bx - ax) > Math.abs(bz - az);
    box(conc, cx, y0 + 0.35, cz, alongX ? len : 0.32, 0.7, alongX ? 0.32 : len, WALLC, { uv: 3 });
    box(metal, cx, y0 + 0.95, cz, alongX ? len : 0.06, 0.05, alongX ? 0.06 : len, RAIL); box(metal, cx, y0 + 2.05, cz, alongX ? len : 0.06, 0.05, alongX ? 0.06 : len, RAIL);
    const n = Math.floor(len / 0.18); for (let k = 1; k < n; k++) { const t = k / n; const x = ax + (bx - ax) * t, z = az + (bz - az) * t; metal.box(x, y0 + 1.5, z, 0.03, 1.12, 0.03, { col: C(RAIL) }); }
    const np = Math.max(1, Math.round(len / 3.6)); for (let k = 0; k <= np; k++) { const t = k / np; box(conc, ax + (bx - ax) * t, y0 + 1.15, az + (bz - az) * t, 0.46, 2.3, 0.46, WALLC, { uv: 2 }); }
    coll(Math.min(ax, bx) - 0.2, Math.max(ax, bx) + 0.2, Math.min(az, bz) - 0.2, Math.max(az, bz) + 0.2, 2.3, { kind: 'wall' });
  };
  fence(fx0, fz0, G.x - G.w / 2 - 0.6, fz0); fence(G.x + G.w / 2 + 0.6, fz0, Wk.x - Wk.w / 2 - 0.2, fz0); fence(Wk.x + Wk.w / 2 + 0.2, fz0, fx1, fz0); /* end pillars meet the wicket leaf frame */
  fence(fx0, fz1, fx1, fz1); fence(fx0, fz0, fx0, fz1); fence(fx1, fz0, fx1, fz1);
  for (const gx of [G.x - G.w / 2 - 0.6, G.x + G.w / 2 + 0.6]) { // gate pillars with lamps
    box(conc, gx, y0 + 1.5, fz0, 1.0, 3.0, 1.0, '#dcd5c6', { uv: 2 }); box(conc, gx, y0 + 3.05, fz0, 1.2, 0.12, 1.2, '#bdb4a2');
    paint.cylinder(gx, y0 + 3.1, fz0, 0.16, 0.16, 0.42, 10, { col: C('#fff4d6') }); coll(gx - 0.5, gx + 0.5, fz0 - 0.5, fz0 + 0.5, 3, { kind: 'wall' });
  }
  // sliding gate (open: parked behind the fence west of the opening)
  box(metal, G.x - G.w / 2 - 4.6, y0 + 1.1, fz0 + 0.55, 7.6, 0.08, 0.06, RAIL); box(metal, G.x - G.w / 2 - 4.6, y0 + 2.0, fz0 + 0.55, 7.6, 0.08, 0.06, RAIL); box(metal, G.x - G.w / 2 - 4.6, y0 + 0.2, fz0 + 0.55, 7.6, 0.08, 0.06, RAIL);
  for (let k = 0; k <= 30; k++) metal.box(G.x - G.w / 2 - 8.4 + k * 0.253, y0 + 1.1, fz0 + 0.55, 0.035, 1.85, 0.035, { col: C(RAIL) });

  // ---------------------------------------------------------------- guard booth + boom barrier
  { const { x, z } = HQ.booth; box(conc, x, y0 + 1.3, z, 2.4, 2.6, 2.4, '#f2eee4', { uv: 2 }); box(paint, x, y0 + 2.72, z, 3.0, 0.24, 3.0, '#1d3a7a');
    box(glass, x, y0 + 1.6, z - 1.21, 1.9, 1.0, 0.04, '#ffffff'); box(glass, x + 1.21, y0 + 1.6, z, 0.04, 1.0, 1.9, '#ffffff'); box(glass, x - 1.21, y0 + 1.6, z, 0.04, 1.0, 1.4, '#ffffff');
    box(paint, x + 0.5, y0 + 1.05, z + 1.21, 0.8, 2.0, 0.05, '#6b4a2a'); coll(x - 1.25, x + 1.25, z - 1.25, z + 1.25, 2.8);
    label([{ text: 'SECURITY CHECK', font: SANS(96), color: '#ffffff' }, { text: 'All visitors please report here', font: SANS(60), color: '#ffffff' }], x, y0 + 2.72, z - 1.52, 2.9, 0.42, Math.PI, { w: 1024, h: 150, bg: '#1d3a7a' });
  }
  { const B = HQ.boom; box(paint, B.x, y0 + 0.5, B.z, 0.42, 1.0, 0.42, '#d4a017'); box(paint, B.x, y0 + 1.02, B.z, 0.46, 0.05, 0.46, '#151515');
    const c = document.createElement('canvas'); c.width = 256; c.height = 16; const g2 = c.getContext('2d'); for (let k = 0; k < 8; k++) { g2.fillStyle = k % 2 ? '#ffffff' : '#c0262d'; g2.fillRect(k * 32, 0, 32, 16); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const pivot = new THREE.Group(); pivot.position.set(B.x, y0 + 0.95, B.z); const arm = new THREE.Mesh(new THREE.BoxGeometry(B.len, 0.1, 0.1), new THREE.MeshStandardMaterial({ map: t, roughness: 0.5 })); arm.position.x = B.len / 2 + 0.15; arm.castShadow = true; pivot.add(arm);
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 0.08), new THREE.MeshStandardMaterial({ color: 0x333333 })); tip.position.set(B.len + 0.1, -0.22, 0); pivot.add(tip);
    group.add(pivot); anim.hqBoom = pivot;
    coll(B.x + 0.25, B.x + B.len + 0.2, B.z - 0.12, B.z + 0.12, 1.05, { kind: 'barrier', id: 'hqBoom' }); } // solid while the arm is down (PoliceHQLife lifts it for anyone approaching)
  { // pedestrian wicket gate: a hinged railing leaf that swings inwards when someone walks up to it
    const hx = Wk.x - Wk.w / 2 + 0.06, lw = Wk.w - 0.12; const leaf = new THREE.Group(); leaf.position.set(hx, y0, fz0);
    const rm = new THREE.MeshStandardMaterial({ color: RAIL, roughness: 0.45, metalness: 0.6 });
    const bar = (x, y, w, h, d) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), rm); m.position.set(x, y, 0); m.castShadow = true; leaf.add(m); };
    bar(lw / 2, 0.12, lw, 0.06, 0.05); bar(lw / 2, 1.0, lw, 0.05, 0.05); bar(lw / 2, 1.9, lw, 0.06, 0.05); bar(0.03, 1.0, 0.06, 1.85, 0.06); bar(lw - 0.03, 1.0, 0.06, 1.85, 0.06);
    for (let k = 1; k < 9; k++) bar(k * lw / 9, 1.0, 0.025, 1.78, 0.025);
    const latch = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.14, 0.09), new THREE.MeshStandardMaterial({ color: 0xb8a24a, metalness: 0.8, roughness: 0.35 })); latch.position.set(lw - 0.1, 1.05, 0); leaf.add(latch);
    group.add(leaf); anim.hqWicket = leaf; coll(Wk.x - Wk.w / 2, Wk.x + Wk.w / 2, fz0 - 0.1, fz0 + 0.1, 2.0, { kind: 'barrier', id: 'hqWicket' });
  }

  // ---------------------------------------------------------------- main building
  const [bx0, bx1, bz0, bz1] = HQ.building; const top = y0 + HQ.storeys * 3.3;
  box(conc, (bx0 + bx1) / 2, y0 + 0.45, (bz0 + bz1) / 2, bx1 - bx0 + 0.8, 0.9, bz1 - bz0 + 0.8, '#bfb6a6', { uv: 4 }); // plinth
  { // facade shell (same texture mapping as a box) with a real opening for the main entrance
    const fo = mb.get('f_office'), col = C('#efe9dc'), S = 12.8, yb = y0 + 0.9, E = HQ.entrance, yd = yb + E.h; const U = (x) => (bx1 - x) / S, V = (y) => (y - yb) / S;
    const front = (xa, xb, ya, yt) => fo.quad([xa, ya, bz0], [xb, ya, bz0], [xb, yt, bz0], [xa, yt, bz0], [U(xa), V(ya), U(xb), V(yt)], col); // runs +x → −x (faces −z)
    front(bx1, E.x1, yb, top); front(E.x0, bx0, yb, top); front(E.x1, E.x0, yd, top);
    fo.quad([bx0, yb, bz1], [bx1, yb, bz1], [bx1, top, bz1], [bx0, top, bz1], [0, 0, (bx1 - bx0) / S, (top - yb) / S], col);
    fo.quad([bx1, yb, bz1], [bx1, yb, bz0], [bx1, top, bz0], [bx1, top, bz1], [0, 0, (bz1 - bz0) / S, (top - yb) / S], col);
    fo.quad([bx0, yb, bz0], [bx0, yb, bz1], [bx0, top, bz1], [bx0, top, bz0], [0, 0, (bz1 - bz0) / S, (top - yb) / S], col);
    // reveal of the opening (wall thickness) and a dark frame
    box(paint, E.x0 - 0.06, yb + E.h / 2, bz0 + 0.16, 0.12, E.h, 0.32, '#2a2a2a'); box(paint, E.x1 + 0.06, yb + E.h / 2, bz0 + 0.16, 0.12, E.h, 0.32, '#2a2a2a'); box(paint, (E.x0 + E.x1) / 2, yd + 0.06, bz0 + 0.16, E.x1 - E.x0 + 0.24, 0.12, 0.32, '#2a2a2a');
  }
  mb.get('roofFlat').hrect(bx0, bz0, bx1, bz1, top, 6, [0.75, 0.73, 0.7]);
  box(conc, (bx0 + bx1) / 2, top + 0.45, bz0 + 0.12, bx1 - bx0 + 0.3, 0.9, 0.24, '#e4ddcc'); box(conc, (bx0 + bx1) / 2, top + 0.45, bz1 - 0.12, bx1 - bx0 + 0.3, 0.9, 0.24, '#e4ddcc'); // parapet
  box(conc, bx0 + 0.12, top + 0.45, (bz0 + bz1) / 2, 0.24, 0.9, bz1 - bz0, '#e4ddcc'); box(conc, bx1 - 0.12, top + 0.45, (bz0 + bz1) / 2, 0.24, 0.9, bz1 - bz0, '#e4ddcc');
  for (let f = 1; f < HQ.storeys; f++) { box(paint, (bx0 + bx1) / 2, y0 + f * 3.3 + 0.2, bz0 - 0.08, bx1 - bx0 + 0.16, 0.5, 0.16, '#24427e'); box(paint, (bx0 + bx1) / 2, y0 + f * 3.3 + 0.2, bz1 + 0.08, bx1 - bx0 + 0.16, 0.5, 0.16, '#24427e'); for (const x of [bx0 - 0.08, bx1 + 0.08]) box(paint, x, y0 + f * 3.3 + 0.2, (bz0 + bz1) / 2, 0.16, 0.5, bz1 - bz0 + 0.32, '#24427e'); } // blue spandrel bands at each floor
  for (const [x, z] of [[-30, -195], [-24, -191], [6, -195]]) { box(metal, x, top + 0.7, z, 2.2, 1.4, 1.4, '#b8bcc0'); } // AC plant
  paint.cylinder(10, top, -188, 1.2, 1.2, 2.2, 14, { col: C('#2c3e50') }); // water tank
  { const mx = 12, mz = -199; for (let k = 0; k < 4; k++) { const h = top + k * 4; for (const [dx, dz] of [[-0.4, -0.4], [0.4, -0.4], [0.4, 0.4], [-0.4, 0.4]]) metal.box(mx + dx * (1 - k * 0.15), h + 2, mz + dz * (1 - k * 0.15), 0.06, 4, 0.06, { col: C('#c8ccd0') }); metal.box(mx, h + 4, mz, 0.9 - k * 0.12, 0.05, 0.9 - k * 0.12, { col: C('#c8ccd0') }); }
    paint.box(mx, top + 16.6, mz, 0.12, 0.3, 0.12, { col: C('#c0262d') }); anim.hqMast = { x: mx, y: top + 16.8, z: mz }; } // radio mast with an aviation light
  { // shell walls (the inside is the walk-in interior) + the entrance threshold on the plinth
    const E = HQ.entrance, T = 0.7; coll(bx0 - 0.4, E.x0, bz0 - 0.4, bz0 + T, top + 1); coll(E.x1, bx1 + 0.4, bz0 - 0.4, bz0 + T, top + 1);
    coll(bx0 - 0.4, bx1 + 0.4, bz1 - T, bz1 + 0.4, top + 1); coll(bx0 - 0.4, bx0 + T, bz0, bz1, top + 1); coll(bx1 - T, bx1 + 0.4, bz0, bz1, top + 1);
    coll(E.x0, E.x1, bz0 - 0.45, bz0 + T, y0 + 0.9, { kind: 'deck' });
  }

  // portico: canopy over the drop-off, columns, steps, glass doors
  const px = HQ.door.x; box(conc, px, y0 + 4.6, -208.5, 16, 0.4, 7, '#f3efe6', { uv: 3 }); box(paint, px, y0 + 4.6, -212.02, 16.1, 0.42, 0.06, '#1d3a7a');
  columns(px - 7.2, -211.5, px + 7.2, -211.5, 4, y0, 4.2, 0.32, '#f3efe6'); for (const cx of [px - 7.2, px - 2.4, px + 2.4, px + 7.2]) coll(cx - 0.35, cx + 0.35, -211.85, -211.15, 4.4, { kind: 'pole' });
  for (let k = 0; k < 3; k++) { const hh = 0.3 * (k + 1), zf = -205.4 - (3 - k) * 0.5, w = 9 - k * 0.6; box(conc, px, y0 + hh / 2, (zf - 205.4) / 2, w, hh, -205.4 - zf, '#d8d2c6', { uv: 2 }); coll(px - w / 2, px + w / 2, zf, -205.4, y0 + hh, { kind: 'deck' }); } // three 30 cm steps up to the plinth
  { // automatic sliding glass doors (PoliceHQLife opens them for anyone walking up)
    const E = HQ.entrance, w = (E.x1 - E.x0) / 2, gm = new THREE.MeshStandardMaterial({ color: 0xa9c4d2, transparent: true, opacity: 0.32, roughness: 0.05, metalness: 0.2, depthWrite: false }), fm = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.4, metalness: 0.6 });
    const leaves = []; for (const sd of [-1, 1]) { const lf = new THREE.Group(); const pane = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.06, E.h - 0.12), gm); pane.position.y = E.h / 2; lf.add(pane);
      for (const [x, y, sw, sh] of [[0, 0.04, w, 0.08], [0, E.h - 0.04, w, 0.08], [-(w / 2) + 0.03, E.h / 2, 0.06, E.h], [w / 2 - 0.03, E.h / 2, 0.06, E.h]]) { const f = new THREE.Mesh(new THREE.BoxGeometry(sw, sh, 0.05), fm); f.position.set(x, y, 0); lf.add(f); }
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.9, 0.04), new THREE.MeshStandardMaterial({ color: 0xc8ccd0, metalness: 0.9, roughness: 0.25 })); bar.position.set(-sd * (w / 2 - 0.15), 1.05, -0.05); lf.add(bar);
      lf.position.set(px + sd * w / 2, y0 + 0.9, bz0 + 0.05); lf.userData.home = px + sd * w / 2; lf.userData.dir = sd; lf.userData.w = w; group.add(lf); leaves.push(lf); }
    anim.hqDoors = leaves; // (the blue first-floor band above acts as the door header)
    // the closed leaves are solid glass: a barrier across the opening that Interiors drops only once the doors have slid open
    coll(E.x0, E.x1, bz0 - 0.04, bz0 + 0.14, y0 + 0.9 + E.h, { kind: 'barrier', id: 'hqDoors' });
  }
  // signage: trilingual name board above the portico + badge disc
  label([{ text: 'ශ්‍රී ලංකා පොලිසිය  ·  இலங்கை பொலிஸ்', font: SI(54), color: '#f1d27a' }, { text: 'POLICE HEADQUARTERS', font: SANS(118), color: '#ffffff' }, { text: 'පොලිස් මූලස්ථානය  ·  பொலிஸ் தலைமையகம்', font: SI(60), color: '#ffffff' }], px, y0 + 7.6, -205.275, 15, 2.6, Math.PI, { w: 1536, h: 300, bg: '#1d3a7a', border: '#d9b13b' });
  box(paint, px, y0 + 7.6, -205.21, 15.2, 2.8, 0.1, '#14295a'); // fascia backing: the board stands proud of the blue floor band (no band across the lettering), high enough that the portico canopy never hides its lower lines from the street
  { const c = document.createElement('canvas'); c.width = c.height = 256; const g2 = c.getContext('2d'); g2.fillStyle = '#d9b13b'; g2.beginPath(); g2.arc(128, 128, 124, 0, 7); g2.fill(); g2.fillStyle = '#1d3a7a'; g2.beginPath(); g2.arc(128, 128, 104, 0, 7); g2.fill();
    g2.fillStyle = '#d9b13b'; g2.beginPath(); for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2 - Math.PI / 2, r = k % 2 ? 36 : 82; g2.lineTo(128 + Math.cos(a) * r, 128 + Math.sin(a) * r); } g2.fill(); // generic star badge (not the official crest)
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; const m = new THREE.Mesh(new THREE.CircleGeometry(1.1, 32), new THREE.MeshStandardMaterial({ map: t, roughness: 0.5, metalness: 0.2 })); m.position.set(px, y0 + 10.5, -205.24); m.rotation.y = Math.PI; group.add(m); const rim = new THREE.Mesh(new THREE.CylinderGeometry(1.17, 1.17, 0.07, 40), new THREE.MeshStandardMaterial({ color: 0x14295a, roughness: 0.5, metalness: 0.3 })); rim.rotation.x = Math.PI / 2; rim.position.set(px, y0 + 10.5, -205.2); group.add(rim); }

  // ---------------------------------------------------------------- motorcycle shed (west strip) + car-park lighting
  { const x0 = -51.2, x1 = -44.2, z0 = -204.2, z1 = -190.6; for (const [x, z] of [[x0 + 0.2, z0 + 0.2], [x1 - 0.2, z0 + 0.2], [x0 + 0.2, z1 - 0.2], [x1 - 0.2, z1 - 0.2]]) { metal.box(x, y0 + 1.4, z, 0.12, 2.8, 0.12, { col: C('#5a6068') }); coll(x - 0.1, x + 0.1, z - 0.1, z + 0.1, 2.8, { kind: 'pole' }); }
    mb.get('corrugated').box((x0 + x1) / 2, y0 + 2.86, (z0 + z1) / 2, x1 - x0 + 0.6, 0.08, z1 - z0 + 0.6, { col: C('#9aa4ac'), uvScale: 2 }); box(paint, x1 + 0.1, y0 + 2.7, (z0 + z1) / 2, 0.1, 0.3, z1 - z0 + 0.6, '#1d3a7a'); }
  for (const [x, z] of [[-40, -226], [-24, -226], [26, -210], [26, -182], [-50, -186]]) { metal.cylinder(x, y0, z, 0.08, 0.06, 6, 8, { col: C('#4a4f55') }); paint.box(x, y0 + 6, z, 0.6, 0.12, 0.3, { col: C('#fff4d6') }); coll(x - 0.12, x + 0.12, z - 0.12, z + 0.12, 6, { kind: 'pole' }); }

  // ---------------------------------------------------------------- landscaping: hedges, beds, sign monument
  const hedge = (x0, x1, z0, z1, h = 0.9) => { leaves.box((x0 + x1) / 2, y0 + h / 2, (z0 + z1) / 2, x1 - x0, h, z1 - z0, { col: C('#3f7a34'), uvScale: 2 }); coll(x0, x1, z0, z1, h, { kind: 'low' }); };
  hedge(bx0, px - 5, -206.2, -205.6); hedge(px + 5, bx1, -206.2, -205.6); hedge(-5, 29, -212.4, -211.8, 0.7); hedge(-51, -6.2, -226.5, -226.0, 0.6);
  const bed = (x, z, w, d, seed) => { box(conc, x, y0 + 0.15, z, w + 0.2, 0.3, d + 0.2, '#bdb4a2'); box(conc, x, y0 + 0.31, z, w, 0.04, d, '#4a3424');
    const cols = ['#d6304a', '#f2b632', '#f2f2ee', '#e86a1c', '#b8327a']; let k = seed; for (let i = 0; i < w / 0.35; i++) for (let j = 0; j < d / 0.35; j++) { k = (k * 9301 + 49297) % 233280; leaves.box(x - w / 2 + 0.18 + i * 0.35, y0 + 0.42, z - d / 2 + 0.18 + j * 0.35, 0.22, 0.22, 0.22, { col: C(k % 3 ? '#4f8a3a' : cols[k % cols.length]) }); } coll(x - w / 2 - 0.1, x + w / 2 + 0.1, z - d / 2 - 0.1, z + d / 2 + 0.1, 0.8, { kind: 'low' }); };
  bed(px - 12, -207.4, 5, 1.2, 3); bed(px + 12, -207.4, 5, 1.2, 7); bed(4, -223.2, 3.4, 1.4, 11); bed(-26, -216.2, 2.4, 2.4, 5);
  { const mx = 12, mz = -224.6; box(conc, mx, y0 + 0.2, mz, 11, 0.4, 1.6, '#b9b09e', { uv: 3 }); box(conc, mx, y0 + 1.2, mz, 10, 1.8, 0.7, '#e9e2d2', { uv: 3 }); box(paint, mx, y0 + 2.16, mz, 10.2, 0.12, 0.8, '#1d3a7a'); coll(mx - 5.5, mx + 5.5, mz - 0.8, mz + 0.8, 2.2);
    label([{ text: 'ශ්‍රී ලංකා පොලිසිය', font: SI(70), color: '#1d3a7a' }, { text: 'SRI LANKA POLICE HEADQUARTERS', font: SANS(84), color: '#1d3a7a' }, { text: 'இலங்கை பொலிஸ் தலைமையகம்', font: TA(64), color: '#1d3a7a' }], mx, y0 + 1.22, mz - 0.37, 9.4, 1.55, Math.PI, { w: 1536, h: 260, bg: '#f5f1e6' }); }
  // HQ name on Union Place facing the street (small plate on the fence by the gate)
  label([{ text: 'POLICE HEADQUARTERS', font: SANS(92), color: '#ffffff' }, { text: 'පොලිස් මූලස්ථානය', font: SI(78), color: '#ffffff' }, { text: 'பொலிஸ் தலைமையகம்', font: TA(70), color: '#ffffff' }], G.x - G.w / 2 - 0.6, y0 + 2.15, fz0 - 0.53, 0.95, 0.62, Math.PI, { w: 1024, h: 668, bg: '#1d3a7a', border: '#d9b13b' });
}
