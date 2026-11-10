// COLOMBO CUSTOMS — paint. One shared shader program ('vpaint-custom'), one material instance per customised vehicle.
//
// A customised vehicle wears its custom look (VehicleModels.customizeMesh): the same buffers as its traffic look, but the paint is
// baked white × its panel shade and flagged by a 'pmask' vertex attribute. This material colours those vertices from uniforms:
//   primary / second colour, two-tone zone (contrast roof · lower panels · upper half), livery (stripes, bands, sash, fade,
//   checker roof), door decals (one shared atlas texture) and the finish (gloss / metallic / pearl / satin / matte / chrome).
// Every value is a uniform or a scalar material property, so a preview change is a uniform write — no geometry rebuild, no new
// shader program (clearcoat never reaches exactly 0, which would flip a define and compile a second program). Non-paint vertices
// inside the paint mesh (black trims, rubber seals, lamp bezels) keep their own colour; glass, tyres, lamps and chrome are other
// meshes and are untouched. Scrapes (VehicleDamage.scrape) lower pmask → bare metal shows through the custom paint as before.
import * as THREE from 'three';
import { vehicleMaterials } from '../vehicles/VehicleModels.js';

export const FINISH = {
  gloss: { roughness: 0.3, metalness: 0.25, clearcoat: 1, clearcoatRoughness: 0.07, flake: 0.45, pearl: 0 },
  metallic: { roughness: 0.34, metalness: 0.55, clearcoat: 1, clearcoatRoughness: 0.05, flake: 1.0, pearl: 0 },
  pearl: { roughness: 0.28, metalness: 0.35, clearcoat: 1, clearcoatRoughness: 0.05, flake: 0.7, pearl: 1 },
  satin: { roughness: 0.55, metalness: 0.3, clearcoat: 0.35, clearcoatRoughness: 0.45, flake: 0.25, pearl: 0 },
  matte: { roughness: 0.84, metalness: 0.08, clearcoat: 0.0001, clearcoatRoughness: 0.9, flake: 0, pearl: 0 },
  chrome: { roughness: 0.06, metalness: 1.0, clearcoat: 0.0001, clearcoatRoughness: 0.1, flake: 0, pearl: 0 },
};
const LIV = { none: 0, stripes: 1, centre: 2, band: 3, hockey: 4, rally: 5, fade: 6, checker: 7 };
const ZONE = { none: 0, roof: 1, lower: 2, upper: 3 };
// decal atlas cells (u0, v0, du, dv) and whether the art is text (mirrored per side so it always reads) or directional (front → back)
const DECALS = { lotus: [[0, 0.5, 0.25, 0.5], 0, 0.3, 0.3], n07: [[0.25, 0.5, 0.25, 0.5], 0, 0.27, 0.27], n27: [[0.5, 0.5, 0.25, 0.5], 0, 0.27, 0.27], n94: [[0.75, 0.5, 0.25, 0.5], 0, 0.27, 0.27], cc: [[0, 0, 0.5, 0.5], 0, 0.42, 0.21], flame: [[0.5, 0, 0.5, 0.5], 1, 0.8, 0.4] };

let atlas = null;
function decalAtlas() {
  if (atlas) return atlas; const c = document.createElement('canvas'); c.width = 1024; c.height = 512; const g = c.getContext('2d'); g.clearRect(0, 0, 1024, 512);
  // lotus emblem (white): eight pointed petals in two rings + a base bar
  g.save(); g.translate(128, 140); g.fillStyle = '#f4f4f0'; const petal = (a, len, wd) => { g.save(); g.rotate(a); g.beginPath(); g.moveTo(0, 0); g.bezierCurveTo(wd, -len * 0.35, wd * 0.7, -len * 0.8, 0, -len); g.bezierCurveTo(-wd * 0.7, -len * 0.8, -wd, -len * 0.35, 0, 0); g.fill(); g.restore(); };
  for (const a of [-1.05, -0.52, 0, 0.52, 1.05]) petal(a, 92, 30); g.globalCompositeOperation = 'destination-out'; g.lineWidth = 5; g.strokeStyle = '#000'; for (const a of [-0.78, -0.26, 0.26, 0.78]) { g.save(); g.rotate(a); g.beginPath(); g.moveTo(0, -4); g.lineTo(0, -70); g.stroke(); g.restore(); }
  g.globalCompositeOperation = 'source-over'; g.fillRect(-70, 14, 140, 12); g.fillRect(-46, 34, 92, 9); g.restore();
  // race number roundels
  [['07', 256], ['27', 512], ['94', 768]].forEach(([n, x]) => { g.save(); g.translate(x + 128, 128); g.fillStyle = '#f6f6f2'; g.beginPath(); g.arc(0, 0, 112, 0, Math.PI * 2); g.fill(); g.lineWidth = 10; g.strokeStyle = '#141414'; g.beginPath(); g.arc(0, 0, 100, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#141414'; g.font = 'bold 132px "Barlow Condensed", "Arial Narrow", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(n, 0, 8); g.restore(); });
  // the workshop's own sticker: COLOMBO CUSTOMS
  { g.save(); g.translate(256, 384); const w = 470, h = 200; g.fillStyle = '#17181b'; g.beginPath(); g.roundRect(-w / 2, -h / 2, w, h, 26); g.fill(); g.fillStyle = '#ff7a1a'; g.beginPath(); g.roundRect(-w / 2 + 12, -h / 2 + 12, w - 24, 22, 8); g.fill(); g.beginPath(); g.roundRect(-w / 2 + 12, h / 2 - 34, w - 24, 22, 8); g.fill();
    g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = 'bold 74px "Barlow Condensed", "Arial Narrow", sans-serif'; g.fillText('COLOMBO', 0, -14); g.fillStyle = '#ff7a1a'; g.font = 'bold 44px "Barlow Condensed", "Arial Narrow", sans-serif'; g.fillText('CUSTOMS', 0, 40); g.restore(); }
  // flame licks: base at the left (front of the car), tongues streaming right (toward the rear)
  { g.save(); g.translate(512, 256); const grd = g.createLinearGradient(0, 0, 512, 0); grd.addColorStop(0, '#fff2a0'); grd.addColorStop(0.25, '#ffc21a'); grd.addColorStop(0.6, '#ff5a10'); grd.addColorStop(1, '#c8140a');
    const tongues = [[128, 330, 40], [92, 450, 34], [164, 400, 30], [60, 260, 26], [196, 300, 24], [120, 500, 22]];
    for (const [y, len, wd] of tongues) { g.beginPath(); g.moveTo(0, y - wd * 1.6); g.bezierCurveTo(len * 0.35, y - wd * 1.9, len * 0.55, y - wd * 0.2, len * 0.72, y - wd * 0.9); g.bezierCurveTo(len * 0.86, y - wd * 1.3, len * 0.95, y - wd * 0.5, len, y - wd * 0.9);
      g.bezierCurveTo(len * 0.82, y + wd * 0.2, len * 0.6, y + wd * 0.9, len * 0.42, y + wd * 0.5); g.bezierCurveTo(len * 0.3, y + wd * 1.4, len * 0.12, y + wd * 1.7, 0, y + wd * 1.6); g.closePath(); g.fillStyle = grd; g.fill(); g.lineWidth = 5; g.strokeStyle = 'rgba(150,10,6,0.9)'; g.stroke(); }
    g.restore(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.generateMipmaps = true; atlas = t; return t;
}

const VERT_HEAD = 'attribute float pmask;\nvarying float vPM;\nvarying vec3 vFlakeP;\nvarying vec3 vObjN;';
const FRAG_HEAD = `varying float vPM; varying vec3 vFlakeP; varying vec3 vObjN;
uniform vec3 cpC1; uniform vec3 cpC2; uniform vec4 cpZ; uniform vec4 cpL; uniform vec4 cpB; uniform vec4 cpD; uniform vec4 cpDR; uniform vec4 cpF; uniform sampler2D cpTex;
float flakeH(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
float cpBand(float d, float w) { float f = max(fwidth(d), 1e-4); return 1.0 - smoothstep(w - f, w + f, d); }
// cpZ: zone, belt (roof split), low (lower split), mid (upper split / band height)
// cpL: livery, zFront, zRear, half width ; cpB: roof top y, unused... ; cpD: decal box (zc, yc, hz, hy) ; cpDR: atlas rect ; cpF: flake, pearl, decal on, decal mode
vec3 cpPaint(vec3 p, vec3 n, out float topF) {
  vec3 c = cpC1; float zone = cpZ.x; topF = 0.0;
  if (zone > 0.5 && zone < 1.5) { if (p.y > cpZ.y) c = cpC2; }
  else if (zone > 1.5 && zone < 2.5) { if (p.y < cpZ.z) c = cpC2; }
  else if (zone > 2.5) { if (p.y > cpZ.w) c = cpC2; }
  vec3 lc = distance(c, cpC2) < 0.02 ? cpC1 : cpC2; // the livery contrasts with whatever is under it
  float liv = cpL.x, hw = cpL.w, ax = abs(p.x), L = 0.0; float side = smoothstep(0.35, 0.55, abs(n.x)); float top = smoothstep(0.25, 0.45, n.y); float ends = smoothstep(0.45, 0.65, abs(n.z));
  float zF = cpL.y, zR = cpL.z, len = zF - zR;
  if (liv > 0.5 && liv < 1.5) L = cpBand(abs(ax - hw * 0.2), hw * 0.075) * max(top, ends) * step(cpZ.z, p.y);
  else if (liv > 1.5 && liv < 2.5) L = cpBand(ax, hw * 0.2) * max(top, ends) * step(cpZ.z, p.y);
  else if (liv > 2.5 && liv < 3.5) L = cpBand(abs(p.y - cpZ.w), 0.045) * side * step(zR + 0.12, p.z) * step(p.z, zF - 0.12);
  else if (liv > 3.5 && liv < 4.5) { float zk = zR + len * 0.3; float a = cpBand(abs(p.y - cpZ.w), 0.04) * step(zk, p.z) * step(p.z, zF - 0.15);
    float b = cpBand(abs((p.y - cpZ.w) - (zk - p.z) * 1.15), 0.05) * step(p.z, zk + 0.02) * step(cpZ.w - 0.04, p.y) * step(p.y, cpZ.y); L = max(a, b) * side; }
  else if (liv > 4.5 && liv < 5.5) L = cpBand(abs((p.z - (zR + len * 0.5)) + (p.y - cpZ.w) * 1.3), 0.16) * side * step(cpZ.z, p.y);
  else if (liv > 5.5 && liv < 6.5) { c = mix(c, lc, smoothstep(zR + len * 0.62, zR + len * 0.12, p.z)); }
  else if (liv > 6.5) { if (p.y > cpB.x - 0.1 && n.y > 0.6) { vec2 q = floor(p.xz / 0.11); float k = mod(q.x + q.y, 2.0); c = mix(vec3(0.82), vec3(0.012), k); topF = 1.0; } }
  c = mix(c, lc, L);
  if (cpF.z > 0.5 && side > 0.5) { float sx = sign(p.x); float u = (cpF.w > 0.5 ? (cpD.x - p.z) : sx * (cpD.x - p.z)) / (2.0 * cpD.z) + 0.5; float v = (p.y - cpD.y) / (2.0 * cpD.w) + 0.5;
    if (u > 0.0 && u < 1.0 && v > 0.0 && v < 1.0) { vec4 t = texture2D(cpTex, cpDR.xy + vec2(u, v) * cpDR.zw); c = mix(c, t.rgb, t.a); } }
  return c;
}`;
// one compile hook for every customised vehicle (same source → one program); each material binds its own uniform objects
function hook(mat) {
  const U = mat.userData.cp;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + VERT_HEAD).replace('#include <begin_vertex>', '#include <begin_vertex>\nvFlakeP = position; vPM = pmask; vObjN = objectNormal;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + FRAG_HEAD)
      .replace('#include <color_fragment>', '#include <color_fragment>\nfloat cpTop = 0.0; if (vPM > 0.001) { vec3 pc = cpPaint(vFlakeP, normalize(vObjN), cpTop); diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * pc, vPM); }')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nvec3 flakeC = floor(vFlakeP * 1400.0); float flakeA = clamp(1.6 - length(fwidth(vFlakeP)) * 1400.0, 0.0, 1.0) * cpF.x * step(0.5, vPM); roughnessFactor = clamp(roughnessFactor * (1.0 + (flakeH(flakeC) - 0.5) * 0.6 * flakeA), 0.04, 1.0);')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = normalize(normal + (vec3(flakeH(flakeC + 1.3), flakeH(flakeC + 7.1), flakeH(flakeC + 3.7)) - 0.5) * 0.16 * flakeA);\nif (cpF.y > 0.5 && vPM > 0.5) { float fr = pow(1.0 - clamp(dot(normalize(vViewPosition), normal), 0.0, 1.0), 2.2); diffuseColor.rgb = mix(diffuseColor.rgb, cpC2 * max(vColor.r, 0.25), fr * 0.7); }');
  };
  mat.customProgramCacheKey = () => 'vpaint-custom';
}
const lin = (hex, out = new THREE.Color()) => out.set(hex); // THREE.Color.set(hex) converts sRGB hex → linear working space
export function makePaintMaterial() {
  const base = vehicleMaterials().mats.vpaint;
  const m = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: base.roughness, metalness: base.metalness, clearcoat: 1, clearcoatRoughness: base.clearcoatRoughness, envMapIntensity: base.envMapIntensity });
  m.userData.cp = { cpC1: { value: new THREE.Color(1, 1, 1) }, cpC2: { value: new THREE.Color(0, 0, 0) }, cpZ: { value: new THREE.Vector4(0, 9, -9, 9) }, cpL: { value: new THREE.Vector4(0, 2, -2, 0.9) }, cpB: { value: new THREE.Vector4(1.5, 0, 0, 0) }, cpD: { value: new THREE.Vector4(0, 0.6, 0.3, 0.3) }, cpDR: { value: new THREE.Vector4(0, 0, 0.25, 0.5) }, cpF: { value: new THREE.Vector4(0.45, 0, 0, 0) }, cpTex: { value: decalAtlas() } };
  hook(m); m.name = 'vpaint-custom'; return m;
}
// body metrics the zones / liveries / decals need, from the body scan (BodyScan.scanVehicle)
export function paintFrame(S) {
  const bike = !!S.bike; const sillY = S.sill ? S.sill.y : (S.wheelR || 0.3) * 1.1; const belt = bike ? 9 : (S.belt || S.H * 0.62);
  const low = bike ? (S.engine ? S.engine.y1 - 0.04 : 0.55) : sillY + (belt - sillY) * 0.42; const mid = bike ? low + 0.16 : sillY + (belt - sillY) * 0.62;
  const wf = S.axles ? S.axles.wf : S.zF * 0.6, wr = S.axles ? S.axles.wr : S.zR * 0.6;
  return { belt, low, mid, zF: S.zF, zR: S.zR, hw: S.hw, roofY: S.roof ? S.roof.y : S.H, wf, wr, bike, R: S.wheelR || 0.3 };
}
// write a paint state into a vehicle's material: { c1, c2, finish, zone, livery, decal }
export function setPaint(mat, st, F) {
  const U = mat.userData.cp; lin(st.c1 || '#ffffff', U.cpC1.value); lin(st.c2 || '#111111', U.cpC2.value);
  const fin = FINISH[st.finish] || FINISH.gloss; mat.roughness = fin.roughness; mat.metalness = fin.metalness; mat.clearcoat = fin.clearcoat; mat.clearcoatRoughness = fin.clearcoatRoughness; U.cpF.value.x = fin.flake; U.cpF.value.y = fin.pearl;
  U.cpZ.value.set(ZONE[st.zone] || 0, F.belt, F.low, F.mid); U.cpL.value.set(LIV[st.livery] || 0, F.zF, F.zR, F.hw); U.cpB.value.x = F.roofY;
  const D = DECALS[st.decal]; if (D) { const [rect, mode, hz, hy] = D; const s = F.bike ? 0.42 : 1; U.cpDR.value.set(rect[0], rect[1], rect[2], rect[3]); U.cpF.value.z = 1; U.cpF.value.w = mode;
    let zc = (F.wf + F.wr) / 2, yc = F.mid + 0.06; if (st.decal === 'cc') { zc = F.bike ? F.wr * 0.4 : F.wr + 0.05; yc = F.bike ? F.low + 0.08 : F.mid + 0.1; } if (st.decal === 'flame') { zc = F.wf - 0.85; yc = F.low + 0.12; } if (F.bike && st.decal !== 'cc') { zc = 0.18; yc = F.low + 0.12; }
    U.cpD.value.set(zc, yc, hz * s, hy * s); } else U.cpF.value.z = 0;
}
// shader warm-up (Game.shaderWarmSet): the custom paint program compiled with the scene, not on the first visit to the workshop
export function paintWarmMesh() { const g = new THREE.BoxGeometry(0.1, 0.1, 0.1); const n = g.attributes.position.count; g.setAttribute('pmask', new THREE.BufferAttribute(new Float32Array(n).fill(1), 1)); g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3)); const m = new THREE.Mesh(g, makePaintMaterial()); m.name = 'cp-warm'; return m; }

// ---------------------------------------------------------------------------------------------------- glass / trim / plates
const TINT = { light: [0x0a0e10, 0.86], dark: [0x060809, 0.91], limo: [0x020303, 0.965], green: [0x0c2a16, 0.86], blue: [0x0a1a34, 0.86] };
export function tintGlass(base, id) { const t = TINT[id]; if (!t) return base; const m = base.clone(); m.color.setHex(t[0]); m.opacity = t[1]; m.name = 'vglass-tint'; return m; }
const TRIM = { satin: [0x1a1b1d, 0.5, 0.3], gloss: [0x0d0e0f, 0.12, 0.2] };
export function trimMaterial(base, id) { const t = TRIM[id]; if (!t) return base; const m = base.clone(); m.color.setHex(t[0]); m.roughness = t[1]; m.metalness = t[2]; m.name = 'vchrome-delete'; return m; }
// vanity plates: the shared plate atlas has 8 rows (variants × front / rear); a vanity set paints the owner's text into every row
export function vanityPlateMaterial(text) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 512; const g = c.getContext('2d'); const txt = (text || 'COLOMBO').toUpperCase();
  for (let i = 0; i < 8; i++) { const y = i * 64; g.fillStyle = i < 4 ? '#f2c818' : '#f4f4f0'; g.fillRect(0, y, 256, 64); g.strokeStyle = '#111'; g.lineWidth = 4; g.strokeRect(3, y + 3, 250, 58);
    g.fillStyle = '#111'; g.font = 'bold 15px "Barlow Condensed", sans-serif'; g.textBaseline = 'middle'; g.textAlign = 'left'; g.fillText('WP', 12, y + 32);
    g.font = 'bold 44px "Barlow Condensed", sans-serif'; g.textAlign = 'center'; const w = g.measureText(txt).width; g.save(); g.translate(142, y + 34); if (w > 200) g.scale(200 / w, 1); g.fillText(txt, 0, 0); g.restore(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; const m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.45, metalness: 0.1 }); m.name = 'plate-vanity'; return m;
}
