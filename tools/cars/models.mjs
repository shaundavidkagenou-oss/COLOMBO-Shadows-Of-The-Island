// Real-car sources for the asset pipeline (tools/cars/build.mjs). Every model is CC BY 4.0 (licence checked on the source
// page; credits are written to public/assets/vehicles/CREDITS.md and shown in-game). The game never uses a real make or model
// NAME (fictional catalogue names stay) and every logo, badge, script and number plate is removed here.
// classify(tr, X) → game category or null (dropped). tr: { mat, hex (baked sRGB colour), a (alpha), c (centroid, game axes:
// +z forward, +x left, y up, metres), n (face normal), wheel (0..3 or −1: the whole piece lies in that wheel), isl (connected
// piece: lo / hi / size / c / n) }. X.inBox(point, [x0,x1,y0,y1,z0,z1]), X.islIn(isl, box).
const ax = (o) => [Math.min(Math.abs(o.lo[0]), Math.abs(o.hi[0])), Math.max(Math.abs(o.lo[0]), Math.abs(o.hi[0]))]; // |x| range of a piece (one side)

export const MODELS = {
  // 2010s compact saloon (catalogue: Hoshida Ventra)
  ventra: {
    src: 'corolla.glb', title: 'Toyota Corolla', url: 'https://sketchfab.com/3d-models/toyota-corolla-723da379600d4fb9a3e9687e99ca68d5', author: 'Nieve5677',
    scale: 0.001, rotY: Math.PI,
    isWheel: (tr) => tr.mat === 'PaletteMaterial005',
    colOf: (tr, tc) => (tr.cat === 'rim' ? tc.map((c) => Math.min(c, 1) * 0.55) : null), // painted silver alloy (the source's is near white: chalky under the sky)
    classify(tr, X) {
      const { mat, hex, a, wheel, isl } = tr; const [xa] = ax(isl);
      const chrome = mat === 'PaletteMaterial004', black = mat === 'PaletteMaterial002' && hex === '#000000';
      if (wheel >= 0) { if (chrome && isl.size[1] < 0.07 && isl.n > 100 && xa > 0.79) return null; /* maker emblem on the hub cap */ return black ? 'tyre' : mat === 'PaletteMaterial003' ? 'paint' : 'rim'; }
      // the source cabin (dash, wheel, console, seats, mirror): the game's own fitted interior replaces it
      if ((black || chrome || mat === 'PaletteMaterial002') && X.islIn(isl, [-0.745, 0.745, 0.1, 1.37, -1.5, 1.3])) return null;
      // logos / scripts: grille emblem, boot-lid emblem and model script (chrome above the boot chrome bar)
      if (isl.hi[2] > 2.1 && Math.abs(isl.c[0]) < 0.1 && isl.size[0] < 0.17 && isl.lo[1] > 0.62 && isl.hi[1] < 0.76 && mat !== 'PaletteMaterial003') { if (black) { tr.k = 0.995; /* 0.995 marks a badge blank: build.mjs keeps it in every LOD */ tr.flip = tr.n[2] < 0; return 'paint'; } return 'logo'; } /* emblem gone; its flat backing disc stays as a plain body-colour blank so the grille opening keeps no badge outline */
      if (chrome && isl.lo[2] < -2.05 && isl.lo[1] > 0.94) return 'logo';
      if (mat === 'PaletteMaterial001') { if (a < 0.05) return 'plate'; /* the invisible rear plate quad: where the game's plate goes */ if (hex === '#ee0104') return 'vtail'; if (a < 0.47 && hex !== '#000000') return 'lens'; return 'glass'; }
      if (mat === 'PaletteMaterial002' && hex === '#fefefe') return 'chrome'; // lamp inserts // white plate (the game adds its own) / lamp parts
      if (mat === 'PaletteMaterial003') return 'paint';
      if (chrome) {
        if (xa > 0.79 && isl.lo[1] > 0.94 && isl.hi[1] < 1.11 && isl.lo[2] > 0.6 && isl.hi[2] < 0.86) return 'mirror';
        if (isl.lo[2] > 1.5 && isl.lo[1] > 0.6 && isl.hi[1] < 0.82 && xa > 0.47) return xa > 0.75 ? 'vind' : 'vlight'; // headlamp: reflectors glow with the lamps, outer bay = indicator
        if (isl.hi[2] < -1.85 && isl.lo[1] > 0.7 && isl.hi[1] < 0.95 && xa > 0.39) return xa >= 0.595 ? 'vind' : 'vrev'; // tail lamp: body-side bay indicator, boot-lid bay reverse
        return 'chrome';
      }
      return 'rubber';
    },
    doors: [
      { role: 'front', zone: [-0.235, 0.92, 0.15, 1.40], xmin: 0.5, split: [-0.205, 0.92], splitY: [0.9, 1.42] },
      { role: 'rear', zone: [-1.25, -0.185, 0.15, 1.40], xmin: 0.5, split: [-1.25, -0.205], splitY: [0.9, 1.42] },
    ],
    isHandle: (tr) => tr.cat === 'paint' && tr.isl.size[2] < 0.25 && tr.isl.size[1] < 0.08 && tr.isl.n < 700,
    plates: { rear: 'drop', front: [0, 0.43] }, // rear: where the source plate was; front: on the bumper (z found on the skin)
  },
  // A90-generation sports coupe (catalogue: Kensei Raiden) — ZTARK's de-identified edit (emblems, lettering, wheel-cap logos removed)
  raiden: {
    src: 'z_supra.glb', title: 'Toyota Supra 3D Model (Free)', url: 'https://sketchfab.com/3d-models/toyota-supra-3d-model-free-41b83cfb912b4eab9af19a802bcf5ffc', author: 'Mpgs.studio3DModels',
    note: 'de-identified edit by ZTARK (github.com/windowfilmresources-prog/ztark-tint-visualizer)', scale: 1, rotY: 0,
    budget: { lod0: 70000, wheel0: 9000, wheel1: 600 }, // a rare sports car: the multi-spoke wheels and the body surfacing get more
    isWheel: (tr) => ['Tire', 'Rim_Alloy', 'Brake_Disc', 'Caliper'].includes(tr.mat),
    colOf: (tr, tc) => (tr.cat === 'rim' ? tc.map((c) => Math.min(c, 1) * (tr.mat === 'Brake_Disc' ? 0.3 : 0.24)) : null), // dark satin-grey forged alloy, steel-grey discs (the source's are near white)
    classify(tr) {
      const { mat, wheel } = tr;
      if (wheel >= 0) return mat === 'Tire' ? 'tyre' : mat === 'Caliper' ? 'caliper' : 'rim';
      switch (mat) {
        case 'Body_Paint': return 'paint';
        case 'Interior': case 'Interior_Accent': return null; // the game's own fitted interior replaces it
        case 'Windows': return 'glass';
        case 'Trim_Gloss': return 'chrome'; // gloss-black trim: dark vertex colour on the metallic material
        case 'Chrome': case 'Lamp_Chrome': return 'chrome';
        case 'Mirror_Face': return 'mirror';
        case 'Lens_Clear': return 'lens';
        case 'Lamp_Front': return 'vlight';
        case 'Lamp_Red': case 'Lens_Red': return 'vtail';
        case 'Lamp_Amber': case 'Lens_Amber': return 'vind';
        default: return 'rubber'; // Trim_Black, Underbody, lamp housings, reflectors (their own colours)
      }
    },
    // the door is one skin with the body: cut on its seam (a line of gaps in the source mesh, traced from its open edges)
    doors: [{ role: 'front', zone: [-0.93, 0.46, 0.15, 1.08], xmin: 0.82, card: { xmin: 0.6, y0: 0.32, y1: 0.9 }, /* y0: above the seam's rounded lower-rear corner */ /* the rebuilt cabin tub's side wall + the trim mesh's door cards */ outline: [[0.44, 0.95], [0.44, 0.16], [-0.61, 0.16], [-0.66, 0.2], [-0.72, 0.23], [-0.8, 0.26], [-0.87, 0.28], [-0.905, 0.32], [-0.905, 0.95]],
      split: [-0.9, 0.45], splitY: [0.84, 1.26] }],
    isHandle: (tr) => tr.cat === 'paint' && tr.isl.size[2] < 0.25 && tr.isl.size[1] < 0.08 && tr.isl.lo[2] > -0.8 && tr.isl.hi[2] < -0.45,
    plates: { front: [0, 0.36], rear: [0, 0.62] },
  },
};
