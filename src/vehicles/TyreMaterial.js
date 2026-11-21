// Tyre rubber for every vehicle wheel (VehicleModels: low and high wheel LODs). One shader program, one material per tyre
// geometry (its radii / width as uniforms). Dark carbon-black rubber — albedo ~2.5-3.5 %, rough, a faint worn sheen on the
// tread — with real relief instead of a flat colour: four circumferential grooves, staggered tread blocks and sipes on the
// tread; concentric ribs by the bead, moulded lettering (fictional maker GALEWAY + size) and mould flash lines on the
// sidewall. All of it is bumped in the tyre's own hub space (axle = x), so it turns with the wheel; the lettering is a small
// shared canvas, everything else is procedural (no per-vehicle textures).
import * as THREE from 'three';
const fallback = new THREE.MeshStandardMaterial({ color: 0x1b1b1c, roughness: 0.93, metalness: 0.0, side: THREE.DoubleSide });
// Tyres: dark carbon-black rubber (albedo ~3-4 %, rough) with real tread — four circumferential grooves, staggered tread blocks
// with sipes — and sidewall ribs + moulded lettering (bumped, not printed), worked out in the tyre's own hub space.
let tyreTex = null; const tyreMats = new Map(); const tyreMatsK = new WeakMap();
function tyreLettering() {
  if (tyreTex) return tyreTex; const c = document.createElement('canvas'); c.width = 2048; c.height = 64; const x = c.getContext('2d'); x.fillStyle = '#000'; x.fillRect(0, 0, 2048, 64); x.fillStyle = '#fff'; x.textBaseline = 'middle';
  const put = (t, px, size, w = 'bold') => { x.font = `${w} ${size}px Arial, Helvetica, sans-serif`; x.fillText(t, px, 32); };
  for (const o of [0, 1024]) { put('GALEWAY', o + 30, 46, '900'); put('RADIAL TUBELESS', o + 330, 24); put('205/55 R16 91V', o + 590, 30); put('M+S', o + 860, 26); put('▲', o + 960, 22); }
  tyreTex = new THREE.CanvasTexture(c); tyreTex.wrapS = THREE.RepeatWrapping; tyreTex.colorSpace = THREE.NoColorSpace; tyreTex.anisotropy = 4; return tyreTex;
}
// kind (Street Customs tyres): 0 road (every stock tyre), 1 all-terrain, 2 mud-terrain, 3 semi-slick — a uniform, same program
export function tyreMaterial(geo, kind = 0) {
  if (!geo || !geo.attributes || !geo.attributes.position) return fallback; const mk = kind ? (tyreMatsK.get(geo) || tyreMatsK.set(geo, new Map()).get(geo)) : null; let m = kind ? mk.get(kind) : tyreMats.get(geo); if (m) return m;
  if (!geo.boundingBox) geo.computeBoundingBox(); const bb = geo.boundingBox; const rOut = Math.max(bb.max.y, -bb.min.y, bb.max.z, -bb.min.z); let rIn = rOut * 0.62;
  { const p = geo.attributes.position; let mn = Infinity; for (let i = 0; i < p.count; i++) { const r = Math.hypot(p.getY(i), p.getZ(i)); if (r < mn) mn = r; } if (mn > rOut * 0.3 && mn < rOut * 0.95) rIn = mn; }
  m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.88, metalness: 0, side: THREE.DoubleSide, envMapIntensity: 0.6 });
  const U = { uTyR: { value: new THREE.Vector4(rOut, rIn, (bb.min.x + bb.max.x) / 2, Math.max(0.05, bb.max.x - bb.min.x)) }, uTyTex: { value: tyreLettering() }, uTyK: { value: new THREE.Vector4(kind, 0, 0, 0) } };
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, U);
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vTyP; varying vec3 vTyN;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvTyP = position; vTyN = objectNormal;');
    s.fragmentShader = s.fragmentShader.replace('#include <common>', `#include <common>
uniform vec4 uTyR; uniform vec4 uTyK; uniform sampler2D uTyTex; varying vec3 vTyP; varying vec3 vTyN;
float tyHash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5); }
// height of the rubber surface (m, 0 = top of the tread / sidewall) and a cavity mask for the dirt in the grooves
vec3 tyHeight(vec3 p, vec3 n) { // (height, groove cavity, sidewall letter / rib mask)
  float r = length(p.yz), th = atan(p.z, p.y); float x = (p.x - uTyR.z) / uTyR.w; float h = 0.0, cav = 0.0, mk = 0.0;
  if (abs(n.x) < 0.55 && r > uTyR.x * 0.86) { // tread: 4 circumferential grooves, blocks staggered rib to rib, sipes across
    float s = th * uTyR.x; float ax = abs(x);
    float gr = 0.0; for (int i = 0; i < 2; i++) { float gx = i == 0 ? 0.12 : 0.31; gr = max(gr, 1.0 - smoothstep(0.022, 0.04, abs(ax - gx))); }
    float rib = floor((x + 0.5) * 5.0); float blk = fract(s / 0.034 + rib * 0.37 + (ax > 0.31 ? 0.5 : 0.0)); float lat = 1.0 - smoothstep(0.035, 0.08, min(blk, 1.0 - blk));
    lat *= step(0.06, ax); float sipe = (1.0 - smoothstep(0.0, 0.05, abs(fract(s / 0.017 + rib * 0.21) - 0.5) - 0.42)) * step(ax, 0.42);
    float shoulder = smoothstep(0.44, 0.5, ax); h = -0.0075 * gr - 0.006 * lat * (1.0 - gr) - 0.0012 * sipe - 0.002 * shoulder; cav = max(gr, lat * 0.8);
    if (uTyK.x > 2.5) { float g2 = 1.0 - smoothstep(0.02, 0.035, abs(ax - 0.3)); h = -0.005 * g2 - 0.002 * shoulder; cav = g2; } // semi-slick: two shallow grooves, smooth shoulders
    else if (uTyK.x > 0.5) { float per = uTyK.x > 1.5 ? 0.09 : 0.06; float b2 = fract(s / per + rib * 0.5); float l2 = 1.0 - smoothstep(0.12, 0.2, min(b2, 1.0 - b2)); float cg = 1.0 - smoothstep(0.03, 0.05, ax); h = -0.009 * max(l2, cg) - 0.002 * shoulder; cav = max(l2, cg); } // all- / mud-terrain: big staggered voids
  } else if (r > uTyR.y * 1.02) { // sidewall: concentric ribs by the rim, lettering in a band, faint radial flash lines
    float v = (r - uTyR.y) / (uTyR.x - uTyR.y); float u = (th / 6.28318 + 0.5) * 2.0; if (p.x > uTyR.z) u = -u; /* reads left-to-right on both walls (the template's +x wall faces out) */
    float txt = 0.0; if (v > 0.38 && v < 0.74) txt = texture2D(uTyTex, vec2(u, (v - 0.38) / 0.36)).r;
    float ribs = v < 0.18 ? 0.5 + 0.5 * sin(v * 520.0) : 0.0; float flash = (1.0 - smoothstep(0.0, 0.004, abs(fract(u * 24.0) - 0.5) - 0.495));
    h = 0.0016 * txt + 0.0005 * ribs - 0.0002 * flash; cav = 0.0; mk = max(txt, ribs * 0.35);
  }
  return vec3(h, cav, mk);
}
vec3 tyBump(vec3 pos, vec3 n, float h) { vec3 dpx = dFdx(pos), dpy = dFdy(pos); float dhx = dFdx(h), dhy = dFdy(h); vec3 r1 = cross(dpy, n), r2 = cross(n, dpx); float det = dot(dpx, r1); vec3 g = sign(det) * (dhx * r1 + dhy * r2); return normalize(abs(det) * n - g); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
vec3 tyHC = tyHeight(vTyP, normalize(vTyN)); float tyTread = step(abs(normalize(vTyN).x), 0.55) * step(uTyR.x * 0.86, length(vTyP.yz));
float tyGrain = tyHash(floor(vTyP.yz * 900.0) + floor(vTyP.x * 900.0));
// the sidewall is satin black; raised letters and ribs are matte and catch a little grey; road dust settles toward the
// shoulder and in the grooves; the worn tread face is a touch lighter than the sidewall
float tyV = clamp((length(vTyP.yz) - uTyR.y) / max(0.01, uTyR.x - uTyR.y), 0.0, 1.0); float tyDust = smoothstep(0.55, 1.0, tyV) * (1.0 - tyTread) * 0.4 + tyTread * 0.3;
diffuseColor.rgb = vec3(mix(0.026, 0.038, tyTread) * (0.92 + 0.16 * tyGrain)) * (1.0 - 0.45 * tyHC.y) + vec3(0.016, 0.013, 0.010) * tyHC.y * tyTread
  + vec3(0.022) * tyHC.z + vec3(0.016, 0.013, 0.010) * tyDust;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor = clamp(mix(0.68, 0.82, tyTread * (1.0 - tyHC.y)) + 0.26 * tyHC.z + 0.12 * tyDust + 0.06 * (tyGrain - 0.5), 0.55, 1.0);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
normal = tyBump(-vViewPosition, normal, tyHC.x * 1.0);`);
  };
  m.customProgramCacheKey = () => 'vd-tyre'; m.userData.tyre = U; if (kind) mk.set(kind, m); else tyreMats.set(geo, m); return m;
}


// ---- wheel rims: one shared material for every rim (and the bike stands). The rim geometry only carries a vertex colour,
// so the shader reads the finish from it, per pixel:
//   silver (light grey)  → bare / clear-coated aluminium: fully metallic, a fine machined lathe sheen across the face
//                          (concentric, faded out by pixel footprint so it never shimmers), a touch of brake dust;
//   gunmetal (mid-dark)  → dark-painted / anodised alloy: metallic, a little rougher;
//   black (near 0)       → painted black steel / hub bores: glossy paint, not metal (a black mirror looks like a hole).
// Before this every rim was metalness 0.3 / roughness 0.4: grey plastic in daylight.
let rimMat = null, calMat = null;
export function rimMaterial() {
  if (rimMat) return rimMat;
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 1.0, envMapIntensity: 1.15, side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vRimP;').replace('#include <begin_vertex>', '#include <begin_vertex>\n  vRimP = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vRimP;')
      .replace('#include <color_fragment>', `#include <color_fragment>
  float rimL = dot( diffuseColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) );
  float rimSilver = smoothstep( 0.2, 0.32, rimL ); float rimDark = smoothstep( 0.035, 0.09, rimL ) * ( 1.0 - rimSilver ); float rimBlack = 1.0 - rimSilver - rimDark;
  float rimR = length( vRimP.yz ); float rimFw = fwidth( rimR ) * 1400.0;
  float rimLathe = ( 0.5 + 0.5 * sin( rimR * 1400.0 ) ) * ( 1.0 - smoothstep( 0.6, 2.5, rimFw ) );
  vec3 alu = mix( vec3( 0.70, 0.71, 0.73 ), diffuseColor.rgb * 1.25, 0.35 ) * ( 0.94 + 0.06 * rimLathe );
  alu = mix( alu, vec3( 0.36, 0.31, 0.26 ), 0.08 ); // brake dust
  diffuseColor.rgb = alu * rimSilver + min( diffuseColor.rgb * 2.2, vec3( 0.5 ) ) * rimDark + diffuseColor.rgb * rimBlack;`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor = rimSilver * ( 0.27 + 0.08 * rimLathe ) + rimDark * 0.32 + rimBlack * 0.36;')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n  metalnessFactor = rimSilver + rimDark * 0.9;');
  };
  m.customProgramCacheKey = () => 'vd-rim'; rimMat = m; return m;
}
// brake calipers: painted (red / grey / black), not raw metal
export function caliperMaterial() { return calMat || (calMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.15, envMapIntensity: 0.9 })); }
