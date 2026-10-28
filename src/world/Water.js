// Indian Ocean, harbour, Beira Lake and canals.
//
// One physically-motivated water shader shared by every water body:
//  * swell: a sum of Gerstner waves (onshore from the south-west monsoon side), amplitude driven by the weather's wind,
//    damped against the seawall; the Jacobian of the displacement gives whitecaps on steep crests;
//  * micro-surface: three scrolling normal-map octaves plus a very-low-frequency "wind patch" mask, so the sea has the
//    rough and glassy streaks real water has instead of one uniform tiling texture; detail fades with distance;
//  * reflection: a real planar reflection of the city, sky, Lotus Tower and lights (rendered once per frame at reduced
//    resolution on high / ultra quality), distorted by the surface normal; falls back to the sky gradient on low;
//  * Schlick Fresnel, GGX sun / moon glints, sub-surface scattering through backlit wave crests, depth-dependent colour
//    (turquoise shallows along the shore and lake edges, deep blue offshore, algae-green Beira Lake);
//  * surf: breaking foam bands rolling in to the seawall, crest foam, rain rings; night dims the body but the reflected
//    city lights stay bright.
import * as THREE from 'three';
import { TEX } from '../gfx/Textures.js';
import { LAKE, CANALS } from './Layout.js';

export const waterUniforms = {
  uTime: { value: 0 }, uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunColor: { value: new THREE.Color(1, 0.95, 0.85) },
  uSkyTop: { value: new THREE.Color(0.3, 0.5, 0.8) }, uSkyHorizon: { value: new THREE.Color(0.7, 0.8, 0.9) },
  uNight: { value: 0 }, uRain: { value: 0 }, uNormalMap: { value: null }, uCloud: { value: 0 }, uWind: { value: 0.3 },
  uRefl: { value: null }, uReflMat: { value: new THREE.Matrix4() }, uReflOn: { value: 0 }, uReflH: { value: -0.9 },
  uLake: { value: LAKE.map(([cx, cz, rx, rz]) => new THREE.Vector4(cx, cz, rx, rz)) },
};
const COAST_GLSL = /* glsl */`float coastX(float z) { if (z < -660.0) return -515.0 + 3.0 * sin(z / 40.0); return -520.0 + 5.0 * sin(z / 95.0) + 3.0 * sin(z / 31.0); }`;
const vert = /* glsl */`
  uniform float uTime; uniform float uWaves; uniform float uWind; uniform float uFoamCoast;
  varying vec3 vWorld; varying vec3 vNormalW; varying float vHeight; varying float vCrest;
  #include <fog_pars_vertex>
  ${COAST_GLSL}
  // Gerstner wave with steepness q; accumulates displacement, tangent-frame derivatives and the Jacobian terms
  void gerstner(vec2 p, vec2 dir, float amp, float len, float q, inout vec3 d, inout vec3 tang, inout vec3 bino, inout float jac) {
    float k = 6.2831853 / len; float c = sqrt(9.81 / k); float f = k * (dot(dir, p) - c * uTime); float qa = q * amp; float s = sin(f), co = cos(f);
    d += vec3(dir.x * qa * co, amp * s, dir.y * qa * co);
    tang += vec3(-dir.x * dir.x * qa * k * s, dir.x * amp * k * co, -dir.x * dir.y * qa * k * s);
    bino += vec3(-dir.x * dir.y * qa * k * s, dir.y * amp * k * co, -dir.y * dir.y * qa * k * s);
    jac -= qa * k * s;
  }
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vec3 tang = vec3(1.0, 0.0, 0.0), bino = vec3(0.0, 0.0, 1.0); vec3 d = vec3(0.0); float jac = 1.0;
    if (uWaves > 0.0) {
      float sea = uWaves * (0.55 + 1.1 * uWind);                        // calm morning … monsoon storm
      float shore = uFoamCoast > 0.0 ? smoothstep(2.0, 40.0, coastX(wp.z) - wp.x) : 1.0; // waves die against the seawall
      float a = sea * mix(0.35, 1.0, shore);
      gerstner(wp.xz, normalize(vec2(1.0, 0.22)), 0.42 * a, 61.0, 0.55, d, tang, bino, jac);
      gerstner(wp.xz, normalize(vec2(0.92, -0.38)), 0.26 * a, 33.0, 0.6, d, tang, bino, jac);
      gerstner(wp.xz, normalize(vec2(0.97, 0.55)), 0.17 * a, 19.0, 0.65, d, tang, bino, jac);
      gerstner(wp.xz, normalize(vec2(0.6, -0.8)), 0.09 * a, 11.5, 0.6, d, tang, bino, jac);
      gerstner(wp.xz, normalize(vec2(0.75, 0.66)), 0.06 * a, 7.3, 0.55, d, tang, bino, jac);
      gerstner(wp.xz, normalize(vec2(0.99, -0.1)), 0.035 * a, 4.6, 0.5, d, tang, bino, jac);
    }
    wp.xyz += d; vHeight = d.y; vCrest = clamp(1.0 - jac, 0.0, 1.0);
    vWorld = wp.xyz; vNormalW = normalize(cross(bino, tang));
    vec4 mvPosition = viewMatrix * wp; gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }`;
const frag = /* glsl */`
  uniform float uTime; uniform vec3 uSunDir; uniform vec3 uSunColor; uniform vec3 uSkyTop; uniform vec3 uSkyHorizon;
  uniform float uNight; uniform float uRain; uniform float uCloud; uniform float uWind; uniform sampler2D uNormalMap;
  uniform vec3 uShallow; uniform vec3 uDeep; uniform vec3 uScatter; uniform float uFoamCoast; uniform float uRough; uniform float uLakeOn; uniform float uSurfaceH;
  uniform sampler2D uRefl; uniform mat4 uReflMat; uniform float uReflOn; uniform float uReflH; uniform vec4 uLake[${LAKE.length}];
  varying vec3 vWorld; varying vec3 vNormalW; varying float vHeight; varying float vCrest;
  #include <fog_pars_fragment>
  ${COAST_GLSL}
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  vec2 nrm(vec2 uv) { return texture2D(uNormalMap, uv).xy * 2.0 - 1.0; }
  // water depth proxy (m): sea shelves away from the seawall, Beira Lake is shallow at its banks
  float depthAt(vec2 p) {
    if (uLakeOn > 0.5) { float dd = 0.0; for (int i = 0; i < ${LAKE.length}; i++) { vec2 q = (p - uLake[i].xy) / uLake[i].zw; dd = max(dd, (1.0 - length(q)) * min(uLake[i].z, uLake[i].w)); } return clamp(dd * 0.09, 0.0, 6.0); }
    if (uFoamCoast > 0.0) return clamp((coastX(p.y) - p.x) * 0.11, 0.0, 30.0);
    return 12.0;
  }
  float ggx(float NdH, float r) { float a = r * r; float a2 = a * a; float dd = NdH * NdH * (a2 - 1.0) + 1.0; return a2 / (3.14159 * dd * dd); }
  void main() {
    float t = uTime; vec2 p = vWorld.xz;
    float camD = length(cameraPosition - vWorld); float detail = 1.0 - smoothstep(60.0, 900.0, camD);
    // wind patches: big slow streaks of rough and glassy water
    float patchN = nrm(p * 0.0019 + vec2(t * 0.0009, -t * 0.0006)).x + nrm(p * 0.0047 - vec2(t * 0.0013, t * 0.0004)).y * 0.6;
    float patchM = 0.45 + 0.75 * smoothstep(-0.45, 0.6, patchN) + uWind * 0.5;
    // micro normals: three octaves, different scales / directions / speeds
    vec2 n = nrm(p * 0.031 + vec2(t * 0.011, t * 0.004)) * 1.0
           + nrm(mat2(0.8, -0.6, 0.6, 0.8) * p * 0.083 + vec2(-t * 0.019, t * 0.013)) * 0.7 * (0.4 + 0.6 * detail)
           + nrm(mat2(0.36, 0.93, -0.93, 0.36) * p * 0.27 + vec2(t * 0.045, t * 0.031)) * 0.45 * detail;
    float rough = uRough * patchM * (1.0 + uRain * 0.8);
    vec3 nm = vec3(n.x, 0.0, n.y) * 0.16 * rough * mix(0.35, 1.0, detail);
    // rain rings
    if (uRain > 0.01) { vec2 cell = floor(p * 1.4); vec2 f = fract(p * 1.4) - 0.5; float tt = fract(t * 1.3 + hash(cell)); float r = length(f); float ring = sin((r - tt * 0.5) * 42.0) * smoothstep(0.5, 0.0, r) * (1.0 - tt); nm.xz += f * ring * 0.7 * uRain * detail; }
    vec3 N = normalize(vNormalW + nm);
    vec3 V = normalize(cameraPosition - vWorld); float NdV = max(dot(N, V), 0.0);
    float F = 0.02 + 0.98 * pow(1.0 - NdV, 5.0);
    // ---- reflection: planar (real city / sky) with normal distortion, sky gradient fallback
    vec3 R = reflect(-V, N); R.y = abs(R.y);
    vec3 sky = mix(uSkyHorizon, uSkyTop, pow(clamp(R.y, 0.0, 1.0), 0.6));
    vec3 refl = sky;
    if (uReflOn > 0.5) {
      vec4 rc = uReflMat * vec4(vWorld.x, uReflH, vWorld.z, 1.0); vec2 ruv = rc.xy / rc.w;
      ruv += (N.xz - vNormalW.xz * 0.4) * (0.085 / (1.0 + camD * 0.01)) * (0.7 + rough * 0.5);
      vec3 pr = texture2D(uRefl, clamp(ruv, vec2(0.002), vec2(0.998))).rgb;
      refl = pr;
    }
    // ---- water body: absorption by depth, view-dependent; sub-surface glow through backlit crests
    float depth = depthAt(p) + max(vHeight, -1.0) * 0.6;
    float dk = 1.0 - exp(-depth * 0.32);
    vec3 L = normalize(uSunDir); float day = clamp(L.y * 3.0 + 0.15, 0.0, 1.0);
    vec3 body = mix(uShallow, uDeep, dk) * (0.18 + 0.82 * day) * (1.0 - uCloud * 0.35);
    float sss = pow(clamp(dot(V, -vec3(L.x, 0.0, L.z) * 0.9 + vec3(0.0, 0.25, 0.0)), 0.0, 1.0), 4.0) * clamp(vHeight * 1.2 + vCrest * 1.5, 0.0, 1.0);
    body += uScatter * sss * day * 0.9 * (1.0 - uCloud * 0.5);
    body += uSkyTop * 0.05 * day;
    vec3 col = mix(body, refl, F);
    // ---- sun / moon glints (GGX), broad sheen on rough patches
    vec3 H = normalize(L + V); float NdH = max(dot(N, H), 0.0); float NdL = max(dot(N, L), 0.0);
    float spec = ggx(NdH, mix(0.045, 0.16, clamp(rough * 0.5, 0.0, 1.0))) * NdL * F * 0.25;
    col += uSunColor * min(spec, 40.0) * (1.0 - uCloud * 0.85) * step(0.0, L.y) * detail;
    if (uNight > 0.3) { vec3 Lm = normalize(vec3(-L.x, max(0.25, -L.y), -0.3)); vec3 Hm = normalize(Lm + V); col += vec3(0.75, 0.8, 0.95) * ggx(max(dot(N, Hm), 0.0), 0.1) * max(dot(N, Lm), 0.0) * F * 0.05 * uNight * (1.0 - uCloud); }
    // ---- foam: whitecaps on steep crests, breaking surf rolling in to the seawall, rough foam texture
    float foamTex = texture2D(uNormalMap, p * 0.17 + vec2(t * 0.02, -t * 0.013)).r * texture2D(uNormalMap, p * 0.41 - vec2(t * 0.03, t * 0.017)).g;
    foamTex = smoothstep(0.12, 0.42, foamTex);
    float foam = smoothstep(0.32, 0.75, vCrest) * (0.5 + uWind) * detail;
    if (uFoamCoast > 0.0) {
      float dx = coastX(vWorld.z) - vWorld.x;
      float wave = fract(dx * 0.055 + t * 0.14 + sin(vWorld.z * 0.021) * 0.35 + sin(vWorld.z * 0.0071) * 0.8);
      float band = smoothstep(0.0, 0.08, wave) * smoothstep(0.32, 0.08, wave) * smoothstep(60.0, 8.0, dx);
      foam += band * (0.8 + uWind) + smoothstep(9.0, 0.0, dx) * (0.85 + 0.25 * sin(dx * 1.7 - t * 2.4));
    }
    if (uLakeOn > 0.5) foam += smoothstep(0.35, 0.0, depthAt(p)) * 0.25; // scum line at the banks
    foam = clamp(foam * foamTex * 1.25, 0.0, 0.9);
    vec3 foamCol = vec3(0.93, 0.95, 0.95) * (0.12 + 0.88 * day) * (1.0 - uCloud * 0.3) + uSunColor * 0.05 * day;
    col = mix(col, foamCol, foam);
    // night: the body darkens but reflected lights stay bright
    col = mix(col, col * 0.55 + refl * F * 0.45, uNight * 0.6);
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }`;
function waterMat(opts) {
  return new THREE.ShaderMaterial({
    uniforms: { ...THREE.UniformsLib.fog, ...waterUniforms, uWaves: { value: opts.waves || 0 }, uShallow: { value: new THREE.Color(opts.shallow) }, uDeep: { value: new THREE.Color(opts.deep) }, uScatter: { value: new THREE.Color(opts.scatter || '#3fb7a4') }, uFoamCoast: { value: opts.foam || 0 }, uRough: { value: opts.rough ?? 1 }, uLakeOn: { value: opts.lake ? 1 : 0 }, uSurfaceH: { value: opts.h ?? 0 } },
    vertexShader: vert, fragmentShader: frag, fog: true,
  });
}

// ------------------------------------------------------------------ planar reflection
// One mirror render per frame for the water plane nearest the camera (sea −0.9 / lake −0.55), oblique near plane so
// nothing under the surface leaks in, reduced resolution, shadows reused, skipped when no water is in view.
export class WaterReflection {
  constructor(group) {
    this.group = group; this.rt = new THREE.WebGLRenderTarget(512, 256, { type: THREE.HalfFloatType, samples: 0 }); this.rt.texture.generateMipmaps = false;
    this.cam = new THREE.PerspectiveCamera(); this.enabled = true; this.scale = 0.5;
    this._v = new THREE.Vector3(); this._p = new THREE.Plane(); this._c = new THREE.Vector4(); this._q = new THREE.Vector4(); this._fr = new THREE.Frustum(); this._m = new THREE.Matrix4(); this._wq = new THREE.Quaternion();
    const lake = new THREE.Box3(); for (const [cx, cz, rx, rz] of LAKE) lake.union(new THREE.Box3(new THREE.Vector3(cx - rx, -1, cz - rz), new THREE.Vector3(cx + rx, 0, cz + rz)));
    this.boxes = [{ box: new THREE.Box3(new THREE.Vector3(-2600, -1.5, -2500), new THREE.Vector3(-505, 0.5, 1900)), h: -0.9 }, { box: new THREE.Box3(new THREE.Vector3(-2600, -1.5, -4200), new THREE.Vector3(230, 0.5, -1180)), h: -0.95 }, { box: lake, h: -0.55 }];
    for (const c of CANALS) this.boxes.push({ box: new THREE.Box3(new THREE.Vector3(-570, -1.5, c.z0), new THREE.Vector3(930, 0.5, c.z1)), h: -1.0 });
    waterUniforms.uRefl.value = this.rt.texture;
  }
  update(renderer, scene, camera, on) {
    waterUniforms.uReflOn.value = 0; if (!on || !this.enabled) return;
    // nearest visible water body
    this._m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); this._fr.setFromProjectionMatrix(this._m);
    let best = null, bd = 1e9; const cp = camera.position;
    for (const b of this.boxes) { if (!this._fr.intersectsBox(b.box)) continue; const d = b.box.distanceToPoint(cp); if (d < 1400 && d < bd) { bd = d; best = b; } }
    if (!best || cp.y < best.h) return;
    const size = renderer.getSize(this._v); const w = Math.min(1280, Math.round(size.x * this.scale)), h = Math.round(w * size.y / size.x);
    if (this.rt.width !== w || this.rt.height !== h) this.rt.setSize(w, h);
    const H = best.h, cam = this.cam; cam.copy(camera, false);
    // mirror the camera across y = H
    cam.position.set(cp.x, 2 * H - cp.y, cp.z); cam.quaternion.identity();
    const fwd = this._v.set(0, 0, -1).applyQuaternion(camera.getWorldQuaternion(this._wq)); const tgt = new THREE.Vector3(cp.x + fwd.x, 2 * H - (cp.y + fwd.y), cp.z + fwd.z);
    cam.up.set(0, 1, 0).applyQuaternion(camera.getWorldQuaternion(this._wq)); cam.up.y = -cam.up.y; // camera up, reflected across the plane
    cam.lookAt(tgt); cam.far = Math.min(camera.far, 2600); cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    const tm = waterUniforms.uReflMat.value; tm.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1); tm.multiply(cam.projectionMatrix).multiply(cam.matrixWorldInverse);
    // oblique clip plane (Lengyel) so geometry below the water line is not reflected
    this._p.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, H, 0)).applyMatrix4(cam.matrixWorldInverse);
    const c = this._c.set(this._p.normal.x, this._p.normal.y, this._p.normal.z, this._p.constant - 0.05); const pm = cam.projectionMatrix, q = this._q;
    q.x = (Math.sign(c.x) + pm.elements[8]) / pm.elements[0]; q.y = (Math.sign(c.y) + pm.elements[9]) / pm.elements[5]; q.z = -1; q.w = (1 + pm.elements[10]) / pm.elements[14];
    c.multiplyScalar(2 / c.dot(q)); pm.elements[2] = c.x; pm.elements[6] = c.y; pm.elements[10] = c.z + 1; pm.elements[14] = c.w;
    // render (water hidden, shadows reused, no post)
    const prevRT = renderer.getRenderTarget(), prevShadow = renderer.shadowMap.autoUpdate, prevXR = renderer.xr.enabled; const vis = this.group.visible;
    this.group.visible = false; renderer.shadowMap.autoUpdate = false; renderer.xr.enabled = false;
    renderer.setRenderTarget(this.rt); renderer.clear(); renderer.render(scene, cam);
    renderer.setRenderTarget(prevRT); renderer.shadowMap.autoUpdate = prevShadow; renderer.xr.enabled = prevXR; this.group.visible = vis;
    waterUniforms.uReflOn.value = 1; waterUniforms.uReflH.value = H;
  }
}

export function buildWater() {
  waterUniforms.uNormalMap.value = TEX.waterNormal;
  const group = new THREE.Group(); group.name = 'water';
  // near-shore ocean with real swell geometry (5 m grid)
  const ocean = new THREE.Mesh(new THREE.PlaneGeometry(1400, 3200, 280, 640).rotateX(-Math.PI / 2), waterMat({ waves: 1, shallow: '#2d9a98', deep: '#0a3550', scatter: '#45c2b0', foam: 1, rough: 1.0 }));
  ocean.position.set(-1180, -0.9, 100); group.add(ocean);
  // far ocean (flat, to the horizon)
  const far = new THREE.Mesh(new THREE.PlaneGeometry(30000, 30000, 1, 1).rotateX(-Math.PI / 2), waterMat({ waves: 0, shallow: '#0d3f5a', deep: '#0a3550', rough: 0.7 }));
  far.position.set(-14000, -1.0, 0); far.renderOrder = -1; group.add(far);
  const harbour = new THREE.Mesh(new THREE.PlaneGeometry(4000, 3000, 1, 1).rotateX(-Math.PI / 2), waterMat({ waves: 0, shallow: '#1f6670', deep: '#0f3444', scatter: '#2f8f86', rough: 0.75 }));
  harbour.position.set(0, -0.95, -2700); group.add(harbour);
  // Beira Lake (algae-green, calm, mirror-like)
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (const [cx, cz, rx, rz] of LAKE) { x0 = Math.min(x0, cx - rx); x1 = Math.max(x1, cx + rx); z0 = Math.min(z0, cz - rz); z1 = Math.max(z1, cz + rz); }
  const lake = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0 + 10, z1 - z0 + 10).rotateX(-Math.PI / 2), waterMat({ shallow: '#5d7a45', deep: '#1c3a2c', scatter: '#6f9a4a', rough: 0.62, lake: true }));
  lake.position.set((x0 + x1) / 2, -0.55, (z0 + z1) / 2); group.add(lake);
  for (const c of CANALS) { const m = new THREE.Mesh(new THREE.PlaneGeometry(1500, c.z1 - c.z0).rotateX(-Math.PI / 2), waterMat({ shallow: '#4f5a36', deep: '#262f1e', scatter: '#5a6a3a', rough: 0.35 })); m.position.set(180, -1.0, (c.z0 + c.z1) / 2); group.add(m); }
  // dark seabed so shallow edges never show the void
  const bed = new THREE.Mesh(new THREE.PlaneGeometry(30000, 30000).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x0a1a20 })); bed.position.y = -4; group.add(bed);
  return group;
}
