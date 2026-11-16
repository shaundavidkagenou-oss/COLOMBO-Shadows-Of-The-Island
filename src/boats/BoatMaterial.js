// Boat surfaces: ONE standard material per boat for the whole body (hull, deck, superstructure, glass, steel, cushions,
// lamp lenses), so a boat is one draw call. Each vertex carries a surface id (aMat) and the shader picks the finish:
//   0 painted / gelcoat superstructure   1 hull topsides (per-boat colour; waterline boot stripe + antifouling by height)
//   2 teak deck (fore-and-aft planks, black caulking seams, per-plank tone)   3 tinted glass (dark, mirror-like)
//   4 polished stainless          5 marine vinyl / canvas (matte)   6 black rubber / anodised black
//   7 cabin glass that glows warm at night (per boat: lights on inside)        8 navigation-lamp lens (lit with the lamps)
//   9 non-skid moulded deck (fine diamond texture)   10 anodised aluminium (mast, boom, arch)
//   11 police beacon lens — blue   12 police beacon lens — red   13 underwater LED housing
//   14 fenders (only while the boat lies in a berth: collapsed in the vertex shader otherwise — no extra mesh)
// Colour comes from the vertex colours; hull colour, stripes and the night lights are per-boat uniforms (the program is
// shared by every boat — same shader text, same cache key).
import * as THREE from 'three';

export const SURF = { paint: 0, hull: 1, teak: 2, glass: 3, steel: 4, vinyl: 5, rubber: 6, cabin: 7, lens: 8, nonskid: 9, alu: 10, blue: 11, red: 12, uwl: 13, fender: 14 };
const BODY_KEY = 'boatBody51';
export function boatUniforms(o = {}) {
  return {
    uHull: { value: new THREE.Color(o.hull || '#f2f2ee') }, uBoot: { value: new THREE.Color(o.boot || '#1d2b45') }, uAnti: { value: new THREE.Color(o.anti || '#3a1f22') },
    uSheer: { value: new THREE.Color(o.sheer || o.hull || '#f2f2ee') },
    uWL: { value: new THREE.Vector4(o.wl ?? 0.02, o.bootTop ?? 0.13, o.sheerLo ?? 9, o.sheerHi ?? 9) }, // antifoul top, boot top, sheer stripe y-range
    uCabin: { value: 0 }, uLamps: { value: 0 }, uBeacon: { value: new THREE.Vector2(0, 0) }, uDamage: { value: 0 }, uUwl: { value: 0 }, uFend: { value: 0 },
    uCabinCol: { value: new THREE.Color(o.cabinCol || '#ffc98a') },
  };
}
export function boatMaterial(U) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0, side: THREE.DoubleSide }); m.name = 'boatBody'; // double-sided: open cockpits, canopies and rails are seen from both sides
  m.userData.U = U;
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, U);
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nattribute float aMat; varying float vMat; varying vec3 vLoc; uniform float uFend;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMat = aMat; vLoc = position; if (abs(aMat - 14.0) < 0.5 && uFend < 0.5) transformed = vec3(0.0);');
    s.fragmentShader = s.fragmentShader.replace('#include <common>', `#include <common>
      varying float vMat; varying vec3 vLoc; uniform vec3 uHull, uBoot, uAnti, uSheer, uCabinCol; uniform vec4 uWL; uniform float uCabin, uLamps, uDamage, uUwl; uniform vec2 uBeacon;
      float bHash(float n) { return fract(sin(n * 91.345) * 47453.5453); }
      bool isM(float id) { return abs(vMat - id) < 0.5; }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
      if (isM(1.0)) { float y = vLoc.y; diffuseColor.rgb = y < uWL.x ? uAnti : y < uWL.y ? uBoot : (y > uWL.z && y < uWL.w) ? uSheer : uHull;
        diffuseColor.rgb *= 1.0 - uDamage * 0.35 * step(0.6, bHash(floor(vLoc.z * 1.7) + floor(vLoc.y * 3.0) * 7.0)); }
      if (isM(2.0)) { float pw = 0.115; float row = floor(vLoc.x / pw); float f = fract(vLoc.x / pw); float seg = floor((vLoc.z + bHash(row) * 4.0) / 3.6);
        float tone = 0.86 + 0.24 * bHash(row * 13.0 + seg); float seam = smoothstep(0.0, 0.07, f) * smoothstep(1.0, 0.93, f);
        float butt = smoothstep(0.0, 0.012, abs(fract((vLoc.z + bHash(row) * 4.0) / 3.6) - 0.5) - 0.497 + 0.012);
        diffuseColor.rgb *= mix(0.16, tone, seam * (1.0 - 0.0 * butt)); }
      if (isM(9.0)) { vec2 g = fract(vLoc.xz * 14.0) - 0.5; diffuseColor.rgb *= 0.93 + 0.07 * step(abs(g.x) + abs(g.y), 0.3); }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      roughnessFactor = isM(1.0) ? (vLoc.y < uWL.x ? 0.8 : 0.16) : isM(2.0) ? 0.78 : isM(3.0) || isM(7.0) ? 0.05 : isM(4.0) ? 0.16 : isM(5.0) ? 0.88 : isM(6.0) ? 0.62 : isM(14.0) ? 0.45 : isM(8.0) || isM(11.0) || isM(12.0) || isM(13.0) ? 0.12 : isM(9.0) ? 0.72 : isM(10.0) ? 0.34 : 0.3;`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
      metalnessFactor = isM(4.0) ? 1.0 : isM(10.0) ? 0.85 : isM(3.0) || isM(7.0) ? 0.55 : 0.0;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      if (isM(7.0)) { float rnd = bHash(floor(vLoc.x * 1.3 + 31.0) + floor(vLoc.z * 0.9) * 3.0 + floor(vLoc.y * 1.2) * 11.0); totalEmissiveRadiance += uCabinCol * uCabin * (0.55 + 0.9 * step(0.35, rnd)) * 1.6; }
      if (isM(8.0)) totalEmissiveRadiance += vColor.rgb * uLamps * 6.0;
      if (isM(11.0)) totalEmissiveRadiance += vec3(0.15, 0.3, 1.0) * uBeacon.x * 9.0;
      if (isM(12.0)) totalEmissiveRadiance += vec3(1.0, 0.08, 0.06) * uBeacon.y * 9.0;
      if (isM(13.0)) totalEmissiveRadiance += vec3(0.3, 0.75, 1.0) * uUwl * 5.0;`);
  };
  m.customProgramCacheKey = () => BODY_KEY;
  return m;
}

// Sails: woven sailcloth, double-sided, drawn as their own mesh so each sail keeps its own bullet holes. The vertex shader
// bellies the cloth to its camber (deepest a third back from the luff, like a cut sail) and, once torn, lets the loose
// panels flog in the wind; the fragment shader punches the holes — ragged-edged, frayed darker rim — and the big rips.
const SAIL_KEY = 'boatSail51';
export const MAX_HOLES = 20;
export function sailMaterial(color = '#f1ede2') {
  const U = { uHoles: { value: Array.from({ length: MAX_HOLES }, () => new THREE.Vector3(-9, -9, 0)) }, uTear: { value: 0 }, uTime: { value: 0 }, uCamber: { value: 0.09 }, uSide: { value: 1 }, uSeed: { value: Math.random() * 10 } };
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.82, metalness: 0, side: THREE.DoubleSide }); m.name = 'sail'; m.userData.U = U;
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, U);
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTear, uTime, uCamber, uSide, uSeed; varying vec2 vSail;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vSail = uv; float cu = uv.x; float span = 1.0 - uv.y * 0.85;   // chord position (luff 0 … leech 1), the head has little chord
        float belly = uCamber * span * 4.0 * cu * (1.0 - cu) * (1.0 - 0.35 * cu) * 1.6 * (0.35 + 0.65 * (1.0 - uv.y));
        float flog = uTear * (sin(uTime * 13.0 + uv.y * 9.0 + cu * 6.0 + uSeed) * 0.12 + sin(uTime * 23.0 + cu * 15.0) * 0.05) * cu;
        transformed.x += (belly * (1.0 - 0.7 * uTear) + flog) * uSide;`);
    s.fragmentShader = s.fragmentShader.replace('#include <common>', `#include <common>
      uniform vec3 uHoles[${MAX_HOLES}]; uniform float uTear, uSeed; varying vec2 vSail;
      float sHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float sNoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(sHash(i), sHash(i + vec2(1, 0)), f.x), mix(sHash(i + vec2(0, 1)), sHash(i + vec2(1, 1)), f.x), f.y); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
      { float rim = 0.0; for (int i = 0; i < ${MAX_HOLES}; i++) { vec3 h = uHoles[i]; if (h.z <= 0.0) continue; vec2 d = (vSail - h.xy) * vec2(1.0, 1.6);
          float ang = atan(d.y, d.x); float r = h.z * (0.75 + 0.5 * sNoise(vec2(ang * 2.2 + float(i) * 3.1, float(i)))); float l = length(d);
          if (l < r) discard; rim = max(rim, 1.0 - smoothstep(r, r * 1.6, l)); }
        if (uTear > 0.0) { float n = sNoise(vSail * vec2(5.0, 9.0) + uSeed) * 0.65 + sNoise(vSail * vec2(17.0, 23.0) + uSeed * 2.0) * 0.35;
          float lane = abs(fract(vSail.y * 3.0 + vSail.x * 0.8 + uSeed * 0.1) - 0.5);                  // tears run along the panel seams
          if (n < uTear * 0.5 - 0.02 || lane < uTear * 0.05 * n) discard; rim = max(rim, 1.0 - smoothstep(0.0, 0.08, n - uTear * 0.5)); }
        float seam = 1.0 - smoothstep(0.0, 0.012, abs(fract(vSail.y * 7.0) - 0.5) - 0.488);              // horizontal panel seams
        diffuseColor.rgb *= (1.0 - rim * 0.45) * (1.0 - seam * 0.12); }`);
  };
  m.customProgramCacheKey = () => SAIL_KEY;
  return m;
}
