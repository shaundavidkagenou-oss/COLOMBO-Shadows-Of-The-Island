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
let tyreTex = null; const tyreMats = new Map();
function tyreLettering() {
  if (tyreTex) return tyreTex; const c = document.createElement('canvas'); c.width = 2048; c.height = 64; const x = c.getContext('2d'); x.fillStyle = '#000'; x.fillRect(0, 0, 2048, 64); x.fillStyle = '#fff'; x.textBaseline = 'middle';
  const put = (t, px, size, w = 'bold') => { x.font = `${w} ${size}px Arial, Helvetica, sans-serif`; x.fillText(t, px, 32); };
  for (const o of [0, 1024]) { put('GALEWAY', o + 30, 46, '900'); put('RADIAL TUBELESS', o + 330, 24); put('205/55 R16 91V', o + 590, 30); put('M+S', o + 860, 26); put('▲', o + 960, 22); }
  tyreTex = new THREE.CanvasTexture(c); tyreTex.wrapS = THREE.RepeatWrapping; tyreTex.colorSpace = THREE.NoColorSpace; tyreTex.anisotropy = 4; return tyreTex;
}
export function tyreMaterial(geo) {
  if (!geo || !geo.attributes || !geo.attributes.position) return fallback; let m = tyreMats.get(geo); if (m) return m;
  if (!geo.boundingBox) geo.computeBoundingBox(); const bb = geo.boundingBox; const rOut = Math.max(bb.max.y, -bb.min.y, bb.max.z, -bb.min.z); let rIn = rOut * 0.62;
  { const p = geo.attributes.position; let mn = Infinity; for (let i = 0; i < p.count; i++) { const r = Math.hypot(p.getY(i), p.getZ(i)); if (r < mn) mn = r; } if (mn > rOut * 0.3 && mn < rOut * 0.95) rIn = mn; }
  m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.88, metalness: 0, side: THREE.DoubleSide, envMapIntensity: 0.6 });
  const U = { uTyR: { value: new THREE.Vector4(rOut, rIn, (bb.min.x + bb.max.x) / 2, Math.max(0.05, bb.max.x - bb.min.x)) }, uTyTex: { value: tyreLettering() } };
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, U);
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vTyP; varying vec3 vTyN;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvTyP = position; vTyN = objectNormal;');
    s.fragmentShader = s.fragmentShader.replace('#include <common>', `#include <common>
uniform vec4 uTyR; uniform sampler2D uTyTex; varying vec3 vTyP; varying vec3 vTyN;
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
  m.customProgramCacheKey = () => 'vd-tyre'; m.userData.tyre = U; tyreMats.set(geo, m); return m;
}

