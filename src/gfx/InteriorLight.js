// Interior light for covered places (55th request: "inside the station is fake bright, like nothing casts a shadow").
//
// Outdoor materials get the whole sky as ambient light (hemisphere + environment). Under a roof that is wrong: a booking
// hall sees the sky only through its doors, a train shed through its open ends and the skylight strip. patchInterior(mat)
// makes a material's INDIRECT light (hemisphere, ambient, environment — never the sun, whose shadows already come from the
// shadow map) follow a cheap analytic sky-visibility:
//   zones   — boxes (x0, z0, x1, z1, top y): the visibility falls from `edge` at the walls to `base` deep inside
//   portals — doorways / arches / shed ends: light spilling in, a soft round falloff around each opening
// and adds the light of the fluorescent tubes / pendant lamps (rows of lamps: start, step, count, height, a fixed
// coordinate, run axis, intensity, reach, clip box), lit day and night (brighter at night). No real lights are created:
// this is plain per-pixel arithmetic in the material, the same cost everywhere (rows outside their clip box cost a compare).
import * as THREE from 'three';

const MAXZ = 8, MAXP = 12, MAXR = 16;
const v4 = (n) => Array.from({ length: n }, () => new THREE.Vector4());
export const INTERIOR = {
  uIZa: { value: v4(MAXZ) }, uIZb: { value: v4(MAXZ) }, uIZc: { value: v4(MAXZ) }, uIZn: { value: 0 },
  uIPa: { value: v4(MAXP) }, uIPb: { value: v4(MAXP) }, uIPn: { value: 0 },
  uIRa: { value: v4(MAXR) }, uIRb: { value: v4(MAXR) }, uIRc: { value: v4(MAXR) }, uIRn: { value: 0 },
  uILamp: { value: 1 }, uILampCol: { value: new THREE.Color(1.0, 0.93, 0.82) }, uIOn: { value: 1 },
};
// zones: [{x0,z0,x1,z1, top, base, edge, soft}], portals: [{x, y, z, r, s, top}], rows: [{start, step, n, y, at, axis:'x'|'z', I, R, clip:[x0,z0,x1,z1]}]
export function setInterior({ zones = [], portals = [], rows = [] }) {
  const U = INTERIOR;
  zones.slice(0, MAXZ).forEach((z, i) => { U.uIZa.value[i].set(z.x0, z.z0, z.x1, z.z1); U.uIZb.value[i].set(z.top, z.base, z.edge, z.soft); U.uIZc.value[i].set(z.roofY ?? 99, 0, 0, 0); }); U.uIZn.value = Math.min(MAXZ, zones.length);
  portals.slice(0, MAXP).forEach((p, i) => { U.uIPa.value[i].set(p.x, p.z, p.r, p.s); U.uIPb.value[i].set(p.y ?? 0, p.top ?? 99, 0, 0); }); U.uIPn.value = Math.min(MAXP, portals.length);
  rows.slice(0, MAXR).forEach((r, i) => { U.uIRa.value[i].set(r.start, r.step || 1, r.n || 1, r.y); U.uIRb.value[i].set(r.at, r.axis === 'z' ? 1 : 0, r.I, r.R); U.uIRc.value[i].set(...r.clip); }); U.uIRn.value = Math.min(MAXR, rows.length);
}
// night 0..1: the tubes are on all day in the halls (as at Fort), brighter-looking at night
export function setInteriorNight(night) { INTERIOR.uILamp.value = 0.55 + 0.75 * night; }

const PARS = /* glsl */`
uniform vec4 uIZa[${MAXZ}]; uniform vec4 uIZb[${MAXZ}]; uniform vec4 uIZc[${MAXZ}]; uniform int uIZn;
uniform vec4 uIPa[${MAXP}]; uniform vec4 uIPb[${MAXP}]; uniform int uIPn;
uniform vec4 uIRa[${MAXR}]; uniform vec4 uIRb[${MAXR}]; uniform vec4 uIRc[${MAXR}]; uniform int uIRn;
uniform float uILamp; uniform vec3 uILampCol; uniform float uIOn;
varying vec3 vIW;
float intVis(vec3 p, vec3 n) {
  float v = 1.0;
  for (int i = 0; i < ${MAXZ}; i++) { if (i >= uIZn) break; vec4 a = uIZa[i], b = uIZb[i]; if (p.y > b.x || (p.y > uIZc[i].x && n.y > 0.2)) continue; // above the roof / the roof's upper face
    float d = min(min(p.x - a.x, a.z - p.x), min(p.z - a.y, a.w - p.z)); if (d < 0.05) continue;
    v = min(v, mix(b.z, b.y, smoothstep(0.0, b.w, d))); }
  if (v > 0.999) return 1.0;
  float add = 0.0;
  for (int i = 0; i < ${MAXP}; i++) { if (i >= uIPn) break; vec4 q = uIPa[i]; vec4 q2 = uIPb[i]; vec2 dd = p.xz - q.xy; float h = max(0.0, p.y - q2.y); add += q.w * exp(-(dot(dd, dd) + h * h * 0.5) / (q.z * q.z)); }
  return clamp(v + min(add, 1.0) * (1.0 - v), 0.0, 1.0);
}
vec3 intLamps(vec3 p, vec3 n) {
  vec3 acc = vec3(0.0);
  for (int i = 0; i < ${MAXR}; i++) { if (i >= uIRn) break; vec4 a = uIRa[i], b = uIRb[i], c = uIRc[i];
    if (p.x < c.x || p.x > c.z || p.z < c.y || p.z > c.w) continue;
    float al = b.y < 0.5 ? p.x : p.z; float k0 = clamp(floor((al - a.x) / a.y + 0.5), 0.0, a.z - 1.0);
    for (int j = -1; j <= 1; j++) { float k = k0 + float(j); if (k < 0.0 || k > a.z - 1.0) continue; float s = a.x + k * a.y;
      vec3 lp = b.y < 0.5 ? vec3(s, a.w, b.x) : vec3(b.x, a.w, s); vec3 Lv = lp - p; float d2 = dot(Lv, Lv); float il = inversesqrt(d2 + 1e-4);
      float win = clamp(1.0 - d2 / (b.w * b.w), 0.0, 1.0); win *= win;
      float nl = max(dot(n, Lv * il), 0.0) * 0.85 + 0.15; float dn = smoothstep(-0.35, 0.4, Lv.y * il);
      acc += b.z * nl * dn * win / (d2 + 1.5); } }
  return acc * uILampCol * uILamp;
}
`;
export function patchInterior(m) {
  const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey;
  m.onBeforeCompile = function (sh, r) { if (prev) prev.call(this, sh, r); Object.assign(sh.uniforms, INTERIOR);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vIW;')
      .replace('#include <project_vertex>', `#include <project_vertex>
{ vec4 iw = vec4(transformed, 1.0);
#ifdef USE_BATCHING
  iw = batchingMatrix * iw;
#endif
#ifdef USE_INSTANCING
  iw = instanceMatrix * iw;
#endif
  vIW = (modelMatrix * iw).xyz; }`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + PARS)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
if (uIOn > 0.5 && (uIZn > 0 || uIRn > 0)) { vec3 wn = normalize((vec4(normal, 0.0) * viewMatrix).xyz); float iv = intVis(vIW, wn);
  reflectedLight.indirectDiffuse *= iv; reflectedLight.indirectSpecular *= mix(0.3, 1.0, iv);
  vec3 lampI = intLamps(vIW, wn); reflectedLight.indirectDiffuse += lampI * BRDF_Lambert(material.diffuseColor); }`);
  };
  m.customProgramCacheKey = function () { return (prevKey ? prevKey.call(this) : '') + '|interior1'; };
  m.needsUpdate = true; return m;
}
