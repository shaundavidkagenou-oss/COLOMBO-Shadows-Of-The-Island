// Indian Ocean, harbour, Beira Lake and canals: one shader with swell, fresnel sky reflection,
// sun glitter, shoreline foam, rain ripples and night city-light shimmer.
import * as THREE from 'three';
import { TEX } from '../gfx/Textures.js';
import { LAKE, CANALS } from './Layout.js';

export const waterUniforms = {
  uTime: { value: 0 }, uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunColor: { value: new THREE.Color(1, 0.95, 0.85) },
  uSkyTop: { value: new THREE.Color(0.3, 0.5, 0.8) }, uSkyHorizon: { value: new THREE.Color(0.7, 0.8, 0.9) },
  uNight: { value: 0 }, uRain: { value: 0 }, uNormalMap: { value: null }, uCloud: { value: 0 },
};
const vert = /* glsl */`
  uniform float uTime; uniform float uWaves;
  varying vec3 vWorld; varying vec3 vNormalW; varying float vFoamWave;
  #include <fog_pars_vertex>
  vec3 gerstner(vec2 p, vec2 dir, float amp, float len, float spd, inout vec3 tang, inout vec3 bino) {
    float k = 6.2831 / len; float f = k * (dot(dir, p) - spd * uTime); float a = amp;
    tang += vec3(-dir.x * dir.x * a * k * sin(f), dir.x * a * k * cos(f), -dir.x * dir.y * a * k * sin(f));
    bino += vec3(-dir.x * dir.y * a * k * sin(f), dir.y * a * k * cos(f), -dir.y * dir.y * a * k * sin(f));
    return vec3(dir.x * a * cos(f), a * sin(f), dir.y * a * cos(f));
  }
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vec3 tang = vec3(1.0, 0.0, 0.0), bino = vec3(0.0, 0.0, 1.0); vec3 d = vec3(0.0);
    if (uWaves > 0.0) {
      d += gerstner(wp.xz, normalize(vec2(1.0, 0.25)), 0.55 * uWaves, 48.0, 6.0, tang, bino);
      d += gerstner(wp.xz, normalize(vec2(0.8, -0.5)), 0.28 * uWaves, 23.0, 4.2, tang, bino);
      d += gerstner(wp.xz, normalize(vec2(1.0, 0.9)), 0.14 * uWaves, 11.0, 3.0, tang, bino);
    }
    wp.xyz += d; vFoamWave = d.y;
    vWorld = wp.xyz; vNormalW = normalize(cross(bino, tang));
    vec4 mvPosition = viewMatrix * wp; gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }`;
const frag = /* glsl */`
  uniform float uTime; uniform vec3 uSunDir; uniform vec3 uSunColor; uniform vec3 uSkyTop; uniform vec3 uSkyHorizon;
  uniform float uNight; uniform float uRain; uniform float uCloud; uniform sampler2D uNormalMap;
  uniform vec3 uShallow; uniform vec3 uDeep; uniform float uFoamCoast; uniform float uCity; uniform float uRough;
  varying vec3 vWorld; varying vec3 vNormalW; varying float vFoamWave;
  #include <fog_pars_fragment>
  float coastX(float z) { if (z < -660.0) return -515.0 + 3.0 * sin(z / 40.0); return -520.0 + 5.0 * sin(z / 95.0) + 3.0 * sin(z / 31.0); }
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  void main() {
    vec2 uv1 = vWorld.xz * 0.045 + vec2(uTime * 0.012, uTime * 0.008);
    vec2 uv2 = vWorld.xz * 0.11 - vec2(uTime * 0.02, -uTime * 0.015);
    vec3 n1 = texture2D(uNormalMap, uv1).xyz * 2.0 - 1.0, n2 = texture2D(uNormalMap, uv2).xyz * 2.0 - 1.0;
    float camD = length(cameraPosition - vWorld); float detail = mix(1.0, 0.2, smoothstep(40.0, 700.0, camD));
    vec3 nm = vec3(n1.x + n2.x, 0.0, n1.y + n2.y) * 0.16 * uRough * detail; // small tangent-plane perturbation (never normalised on its own)
    // rain ripples
    if (uRain > 0.01) { vec2 cell = floor(vWorld.xz * 1.5); vec2 f = fract(vWorld.xz * 1.5) - 0.5; float t = fract(uTime * 1.3 + hash(cell)); float r = length(f); float ring = sin((r - t * 0.5) * 40.0) * smoothstep(0.5, 0.0, r) * (1.0 - t); nm.xz += f * ring * 0.6 * uRain; }
    vec3 N = normalize(vNormalW + nm);
    vec3 V = normalize(cameraPosition - vWorld);
    float fres = 0.02 + 0.98 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
    vec3 R = reflect(-V, N);
    vec3 sky = mix(uSkyHorizon, uSkyTop, clamp(R.y * 1.6, 0.0, 1.0));
    float depthMix = clamp(0.5 + vFoamWave * 0.4, 0.0, 1.0);
    vec3 body = mix(uDeep, uShallow, depthMix) * (0.35 + 0.65 * max(uSunDir.y, 0.0)) + uSkyTop * 0.08;
    vec3 col = mix(body, sky, fres);
    // sun glitter
    float sd = max(dot(R, normalize(uSunDir)), 0.0);
    col += uSunColor * (pow(sd, 900.0) * 4.0 * detail + pow(sd, 90.0) * 0.3) * (1.0 - uCloud * 0.85) * step(0.0, uSunDir.y);
    // city light shimmer at night (lake / harbour)
    if (uCity > 0.0 && uNight > 0.01) {
      float streak = smoothstep(0.75, 1.0, sin(vWorld.x * 0.35 + nm.x * 8.0) * sin(vWorld.z * 0.21 + nm.z * 6.0 + uTime * 0.2));
      vec3 cl = mix(vec3(1.0, 0.75, 0.45), vec3(0.85, 0.4, 1.0), step(0.5, hash(floor(vWorld.xz * 0.05))));
      col += cl * streak * uNight * uCity * 0.55 * fres * 3.0;
    }
    // shoreline foam along the seawall
    if (uFoamCoast > 0.0) {
      float dx = coastX(vWorld.z) - vWorld.x;
      float foam = smoothstep(9.0, 0.0, dx) * (0.55 + 0.45 * sin(dx * 1.3 - uTime * 2.2 + sin(vWorld.z * 0.07) * 3.0));
      foam += smoothstep(0.35, 0.7, vFoamWave) * 0.18 * detail;
      float nfo = texture2D(uNormalMap, vWorld.xz * 0.2 + uTime * 0.03).r;
      col = mix(col, vec3(0.92, 0.95, 0.95) * (0.4 + 0.6 * max(uSunDir.y, 0.15)), clamp(foam * nfo * 1.4, 0.0, 0.85));
    }
    col *= 1.0 - uNight * 0.55;
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }`;
function waterMat(opts) {
  return new THREE.ShaderMaterial({
    uniforms: { ...THREE.UniformsLib.fog, ...waterUniforms, uWaves: { value: opts.waves || 0 }, uShallow: { value: new THREE.Color(opts.shallow) }, uDeep: { value: new THREE.Color(opts.deep) }, uFoamCoast: { value: opts.foam || 0 }, uCity: { value: opts.city || 0 }, uRough: { value: opts.rough ?? 1 } },
    vertexShader: vert, fragmentShader: frag, fog: true,
  });
}
export function buildWater() {
  waterUniforms.uNormalMap.value = TEX.waterNormal;
  const group = new THREE.Group(); group.name = 'water';
  // near-shore ocean with real swell geometry
  const ocean = new THREE.Mesh(new THREE.PlaneGeometry(1400, 3200, 140, 320).rotateX(-Math.PI / 2), waterMat({ waves: 1, shallow: '#2f7f86', deep: '#0d3a52', foam: 1, rough: 1.0 }));
  ocean.position.set(-1180, -0.9, 100); group.add(ocean);
  // far ocean (flat, to the horizon)
  const far = new THREE.Mesh(new THREE.PlaneGeometry(30000, 30000, 1, 1).rotateX(-Math.PI / 2), waterMat({ waves: 0, shallow: '#1f5f72', deep: '#0b2f45', rough: 0.6 }));
  far.position.set(-14000, -1.0, 0); far.renderOrder = -1; group.add(far);
  const harbour = new THREE.Mesh(new THREE.PlaneGeometry(4000, 3000, 1, 1).rotateX(-Math.PI / 2), waterMat({ waves: 0, shallow: '#2a6670', deep: '#123848', city: 0.6, rough: 0.8 }));
  harbour.position.set(0, -0.95, -2700); group.add(harbour);
  // Beira Lake (green-tinted, calm, reflective)
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (const [cx, cz, rx, rz] of LAKE) { x0 = Math.min(x0, cx - rx); x1 = Math.max(x1, cx + rx); z0 = Math.min(z0, cz - rz); z1 = Math.max(z1, cz + rz); }
  const lake = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0 + 10, z1 - z0 + 10).rotateX(-Math.PI / 2), waterMat({ shallow: '#3f6b55', deep: '#1d3b33', city: 1, rough: 0.45 }));
  lake.position.set((x0 + x1) / 2, -0.55, (z0 + z1) / 2); group.add(lake);
  for (const c of CANALS) { const m = new THREE.Mesh(new THREE.PlaneGeometry(1500, c.z1 - c.z0).rotateX(-Math.PI / 2), waterMat({ shallow: '#4a5a3a', deep: '#2a3322', city: 0.5, rough: 0.4 })); m.position.set(180, -1.0, (c.z0 + c.z1) / 2); group.add(m); }
  // dark seabed so shallow edges never show the void
  const bed = new THREE.Mesh(new THREE.PlaneGeometry(30000, 30000).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x0a1a20 })); bed.position.y = -4; group.add(bed);
  return group;
}
