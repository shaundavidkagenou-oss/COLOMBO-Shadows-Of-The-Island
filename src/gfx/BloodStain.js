// Wound stains that stay ON the body: blood soaking into skin and clothing around a hit, with a run trickling down from it.
// A wound is a sphere in the mesh's BIND space (the rest-pose coordinates the skinning starts from), so the stain is glued to that
// patch of shirt or skin through every animation, the ragdoll and the get-up; it is painted in the material's own lighting (wet and
// glossy when fresh, soaking darker into fabric, drying to a matte brown-maroon over a few minutes). Up to 4 wounds per material.
//   • addBloodStain(mat) patches a MeshStandardMaterial (chains any existing onBeforeCompile; one extra program key). The crowd's
//     shared body material is patched with 0 wounds, so a wounded pedestrian only needs a CLONE of it (same program, own uniforms):
//     no shader compile when the first shot lands.
//   • placeWound(target, worldPoint, dir, size) works out the bind-space point (closest bone segment → exact inverse skin transform for
//     a SkinnedMesh, mesh-local for a rigid head), snaps it to the nearest surface vertex facing the shooter, and fills a slot.
import * as THREE from 'three';

export const BLOOD_T = { value: 0 }; // seconds, advanced by Blood.update
export const WOUNDS = 4;
export function bloodUniforms() {
  return { uWound: { value: Array.from({ length: WOUNDS }, () => new THREE.Vector4()) }, uWoundI: { value: Array.from({ length: WOUNDS }, () => new THREE.Vector4()) }, uWoundN: { value: 0 }, uBloodT: BLOOD_T };
}
const DECL_V = `varying vec3 vBindP;`;
const DECL_F = `varying vec3 vBindP; uniform vec4 uWound[${WOUNDS}]; uniform vec4 uWoundI[${WOUNDS}]; uniform int uWoundN; uniform float uBloodT;
float bwHash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float bwNoise(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(bwHash(i), bwHash(i + vec3(1, 0, 0)), f.x), mix(bwHash(i + vec3(0, 1, 0)), bwHash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(bwHash(i + vec3(0, 0, 1)), bwHash(i + vec3(1, 0, 1)), f.x), mix(bwHash(i + vec3(0, 1, 1)), bwHash(i + vec3(1, 1, 1)), f.x), f.y), f.z); }`;
// uWound[i] = (bind-space centre, radius); uWoundI[i] = (born, run length, surface normal x, z)
const BODY_F = `
  float bloodK = 0.0, bloodDry = 0.0, bloodRim = 0.0, bloodCore = 0.0, bloodHalo = 0.0;
  for (int i = 0; i < ${WOUNDS}; i++) { if (i >= uWoundN) break;
    vec4 W = uWound[i]; vec4 I = uWoundI[i]; float age = max(0.0, uBloodT - I.x);
    float soak = 0.45 + 0.55 * min(1.0, age / 30.0);                           // the soak front creeps outward for half a minute
    float r = W.w * soak; vec3 dp = vBindP - W.xyz; float L = length(dp);
    // fabric wicks unevenly: coarse blotches + fine stretched capillary fingers along the weave
    float n = bwNoise(vBindP * 46.0) * 0.5 + bwNoise(vBindP * 13.0) * 0.3 + bwNoise(vBindP * vec3(150.0, 34.0, 150.0)) * 0.2;
    float d = L + (n - 0.5) * r * 1.05;
    float spot = smoothstep(r, r * 0.84, d);                                    // fairly crisp soak front, not a soft airbrush
    float rim = spot * smoothstep(r * 0.5, r * 0.93, d);                         // tide line: blood concentrates at the front
    float core = smoothstep(r * 0.3, r * 0.04, L + (n - 0.5) * r * 0.25);         // the hole itself: clotted, almost black
    float halo = smoothstep(r * 1.28, r * 0.97, d) * (1.0 - spot);              // damp fabric just beyond the front
    vec2 tg = vec2(-I.w, I.z); float lat = abs(dot(dp.xz, tg)) + abs(dp.x * I.z + dp.z * I.w) * 0.25;
    float runL = I.y * min(1.0, age / 9.0); float dy = -dp.y;                    // trickles down (bind −y), reaching full length in ~9 s
    float wid = r * 0.3 * (1.0 - 0.55 * clamp(dy / max(runL, 1e-3), 0.0, 1.0)) * (0.75 + 0.5 * bwNoise(vBindP * vec3(30.0, 4.0, 30.0)));
    float runE = lat + sin(dy * 55.0 + W.x * 30.0) * r * 0.06;
    float run = step(0.0, dy) * smoothstep(runL, runL * 0.8, dy) * smoothstep(wid, wid * 0.5, runE);
    float runRim = run * smoothstep(wid * 0.35, wid * 0.85, runE);               // a run's edges dry darker too
    float k = max(spot, run * 0.95);
    if (k > bloodK) { bloodK = k; bloodDry = clamp((age - 40.0) / 200.0, 0.0, 1.0); bloodRim = max(rim, runRim); bloodCore = core; }
    bloodHalo = max(bloodHalo, halo); }
  if (bloodK > 0.0 || bloodHalo > 0.0) {
    vec3 base = diffuseColor.rgb; float gn = 0.85 + 0.3 * bwNoise(vBindP * 90.0);
    vec3 soaked = base * vec3(0.4, 0.09, 0.085);                                  // the cloth itself, darkened and stained (dark cloth stays dark)
    vec3 blood = mix(vec3(0.11, 0.006, 0.007), vec3(0.07, 0.02, 0.015), bloodDry) * gn; // deep maroon, browning as it dries
    vec3 c = mix(soaked, blood, 0.72);
    c *= 1.0 - bloodRim * (0.5 + 0.2 * bloodDry);                                 // darker edges
    c = mix(c, vec3(0.018, 0.002, 0.002), bloodCore);
    diffuseColor.rgb = mix(base, c, bloodK);
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.7, bloodHalo * 0.65);
    float wet = mix(0.17, 0.7, bloodDry); wet = mix(wet, 0.1, bloodCore * (1.0 - bloodDry));          // wet gloss → matte crust
    roughnessFactor = mix(roughnessFactor, wet, bloodK); roughnessFactor = mix(roughnessFactor, roughnessFactor * 0.8, bloodHalo);
  }
`;
const PATCHED = new WeakSet(); // not a userData flag: Material.clone() JSON-copies userData (hero bodies are clones of the crowd's)
export const isBloodPatched = (m) => !!m && PATCHED.has(m);
export function addBloodStain(mat) {
  if (!mat || PATCHED.has(mat)) return mat; PATCHED.add(mat);
  const prev = mat.onBeforeCompile, prevKey = mat.customProgramCacheKey; const base = THREE.Material.prototype;
  mat.userData.bloodU = bloodUniforms(); mat.userData.bloodPatched = true;
  mat.onBeforeCompile = function (sh, r) {
    if (prev && prev !== base.onBeforeCompile) prev.call(this, sh, r);
    Object.assign(sh.uniforms, this.userData.bloodU);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>\n${DECL_V}`).replace('#include <project_vertex>', 'vBindP = position;\n#include <project_vertex>');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\n${DECL_F}`).replace('#include <lights_physical_fragment>', `${BODY_F}\n#include <lights_physical_fragment>`);
  };
  mat.customProgramCacheKey = function () { return (prevKey && prevKey !== base.customProgramCacheKey ? prevKey.call(this) : '') + '|bloodstain2'; };
  mat.needsUpdate = true; return mat;
}
// a per-character copy of a shared patched material (same program, its own wound uniforms)
export function bloodClone(mat) { const m = mat.clone(); m.onBeforeCompile = mat.onBeforeCompile; m.customProgramCacheKey = mat.customProgramCacheKey; /* copy() drops both */ m.userData.bloodU = bloodUniforms(); m.userData.bloodOwn = true; PATCHED.add(m); return m; }

const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _p = new THREE.Vector3(), _d = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _n = new THREE.Vector3();
function segDist(p, a, b) { _d.subVectors(b, a); const L = _d.lengthSq(); const t = L > 1e-9 ? Math.max(0, Math.min(1, _p.subVectors(p, a).dot(_d) / L)) : 0; return p.distanceTo(_a.copy(a).addScaledVector(_d, t)); }
// world point + shot direction → { p: bind-space Vector3, n: bind-space normal } on the target mesh's surface
export function bindPoint(mesh, world, dir) {
  const g = mesh.geometry, P = g.attributes.position, N = g.attributes.normal; let toBind, dirB;
  if (mesh.isSkinnedMesh) {
    const bones = mesh.skeleton.bones; let best = -1, bd = 1e9;
    for (let i = 0; i < bones.length; i++) { const b = bones[i]; const kid = b.children.find((c) => c.isBone); _b.setFromMatrixPosition(b.matrixWorld);
      const d = kid ? segDist(world, _b, _n.setFromMatrixPosition(kid.matrixWorld)) : world.distanceTo(_b); if (d < bd) { bd = d; best = i; } }
    if (best < 0) return null;
    _m.multiplyMatrices(bones[best].matrixWorld, mesh.skeleton.boneInverses[best]).multiply(mesh.bindMatrix); toBind = _m2.copy(_m).invert();
  } else { mesh.updateWorldMatrix(true, false); toBind = _m2.copy(mesh.matrixWorld).invert(); }
  const q = world.clone().applyMatrix4(toBind); dirB = dir ? new THREE.Vector3(dir.x, dir.y || 0, dir.z).transformDirection(toBind) : null;
  // nearest surface vertex that faces the shooter (the entry side, never the far side of the torso)
  let bi = -1, bd2 = 1e9; for (let i = 0; i < P.count; i++) { const dx = P.getX(i) - q.x, dy = P.getY(i) - q.y, dz = P.getZ(i) - q.z; const d2 = dx * dx + dy * dy + dz * dz; if (d2 >= bd2) continue;
    if (dirB && N && N.getX(i) * dirB.x + N.getY(i) * dirB.y + N.getZ(i) * dirB.z > 0.15) continue; bd2 = d2; bi = i; }
  if (bi < 0 || bd2 > 0.25 * 0.25) return null;
  const p = new THREE.Vector3(P.getX(bi), P.getY(bi), P.getZ(bi)); const n = N ? new THREE.Vector3(N.getX(bi), N.getY(bi), N.getZ(bi)) : new THREE.Vector3(0, 0, 1);
  return { p, n, dist: Math.sqrt(bd2) };
}
// fill a wound slot on a patched material (oldest replaced when full)
export function writeWound(mat, p, n, radius, run) {
  const U = mat.userData.bloodU; if (!U) return -1; let i = U.uWoundN.value;
  if (i >= WOUNDS) { let o = 0; for (let k = 1; k < WOUNDS; k++) if (U.uWoundI.value[k].x < U.uWoundI.value[o].x) o = k; i = o; } else U.uWoundN.value = i + 1;
  const h = Math.hypot(n.x, n.z) || 1; U.uWound.value[i].set(p.x, p.y, p.z, radius); U.uWoundI.value[i].set(BLOOD_T.value, run, n.x / h, n.z / h); return i;
}
