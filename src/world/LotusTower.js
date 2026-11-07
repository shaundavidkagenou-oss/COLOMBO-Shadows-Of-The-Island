// Colombo Lotus Tower (Nelum Kuluna) — calyx, bud, crown, mast and the night LED show.
// Modelled on photographs of the real landmark (≈351 m on Beira Lake):
//   • a slim teal shaft with two thin collars just under the bud;
//   • a smooth green CALYX — a concave funnel flaring from the shaft up into the bud (not leaves sticking out);
//   • the BUD: an egg-shaped tower house clad in three rows of overlapping pointed-arch petal panels (12 per row), deep
//     magenta glass by day; at night every panel is outlined by white/violet LED lines and filled with magenta light;
//   • a flat grey crown drum, a gold-lit observation drum, then a thick tapering mast with a service ring and an antenna.
// Petals are real shells (outer skin, inner skin, rims) that follow the bud's egg profile, so each row sits proud of the one
// above it like the real cladding. Each vertex carries `aLed` (0 in the panel middle → 1 on the outline) which drives the
// two-tone LED material. Everything is original geometry (no external assets).
import * as THREE from 'three';

const lerp = (a, b, t) => a + (b - a) * t;
// bud body profile [radius, height above the calyx base]; the calyx funnel is the first part
const CALYX = [[5.7, 0], [5.9, 3], [6.6, 7], [8.2, 10.5], [10.8, 13.5], [13.6, 15.8], [15.6, 17.2]];
const BODY = [[15.6, 17.2], [17.3, 21], [18.2, 26], [18.4, 30], [17.9, 35], [16.6, 40], [14.4, 45], [11.6, 49.5], [9.0, 52.6], [8.2, 53.6]];
function profileR(h) { const P = CALYX.concat(BODY.slice(1)); if (h <= P[0][1]) return P[0][0]; for (let i = 0; i < P.length - 1; i++) if (h <= P[i + 1][1]) { const k = (h - P[i][1]) / (P[i + 1][1] - P[i][1]); return lerp(P[i][0], P[i + 1][0], k); } return P[P.length - 1][0]; }
// pointed-arch half-width along the petal (v = 0 base → 1 tip): full width at the base, gently widening, then a gothic point
function archW(v) { return v < 0.3 ? 0.9 + 0.1 * Math.sin((v / 0.3) * Math.PI / 2) : Math.pow(Math.cos(((v - 0.3) / 0.7) * Math.PI / 2), 0.75); }

class Shells {
  constructor() { this.pos = []; this.col = []; this.led = []; this.idx = []; }
  // a petal panel conforming to the bud profile between heights h0..h1, `lift` metres proud of the body
  petal(cx, by, cz, h0, h1, phi0, halfW, lift, t, colOut, colIn, { nV = 22, nU = 20 } = {}) {
    const co = new THREE.Color(colOut), ci = new THREE.Color(colIn); const P = this.pos, C = this.col, Ld = this.led, I = this.idx;
    const grid = (inner) => { const start = P.length / 3;
      for (let j = 0; j <= nV; j++) { const v = j / nV; const h = lerp(h0, h1, v); const wf = archW(v);
        for (let i = 0; i <= nU; i++) { const u = (i / nU) * 2 - 1; const a = phi0 + u * halfW * wf;
          // slight convex belly across the panel; the tip leans onto the body
          const r = profileR(h) + lift * (1 - 0.55 * v) + 0.35 * (1 - u * u) * (1 - v * 0.7) - (inner ? t : 0);
          P.push(cx + Math.cos(a) * r, by + h, cz + Math.sin(a) * r);
          // outline: 1 on the two edges and along the base, falling to 0 within `edge` of the panel width
          Ld.push(u, inner ? -1 : v); // petal coords: the fragment shader draws the frame lines (crisp at any distance)
          const sh = inner ? 0.7 : 0.8 + 0.2 * (1 - u * u) * (0.6 + 0.4 * v); const c = inner ? ci : co; C.push(c.r * sh, c.g * sh, c.b * sh); } }
      for (let j = 0; j < nV; j++) for (let i = 0; i < nU; i++) { const a = start + j * (nU + 1) + i, b = a + 1, c = a + nU + 1, d = c + 1; if (inner) I.push(a, b, c, b, d, c); else I.push(a, c, b, b, c, d); }
      return start; };
    const o = grid(false), n = grid(true);
    const rim = (ia) => { for (let k = 0; k < ia.length - 1; k++) { const a0 = o + ia[k], a1 = o + ia[k + 1], b0 = n + ia[k], b1 = n + ia[k + 1]; I.push(a0, b0, a1, a1, b0, b1); } };
    const L = [], R = [], B = []; for (let j = 0; j <= nV; j++) { L.push(j * (nU + 1)); R.push(j * (nU + 1) + nU); } for (let i = 0; i <= nU; i++) B.push(i);
    rim(L); rim(R.slice().reverse()); rim(B.slice().reverse());
  }
  build() {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aPet', new THREE.Float32BufferAttribute(this.led, 2)); g.setIndex(this.idx); g.computeVertexNormals(); g.computeBoundingSphere(); return g;
  }
}
// Two-tone LED cladding: panel fill = emissive × fill, outline = uEdge colour (by aLed). By day both are off.
function ledMaterial(opts, key) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, emissive: 0x000000, ...opts });
  m.userData.uEdge = { value: new THREE.Color(0, 0, 0) }; m.userData.uFill = { value: 1 };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uEdge = m.userData.uEdge; sh.uniforms.uFill = m.userData.uFill;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 aPet; varying vec2 vPet;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvPet = aPet;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec2 vPet; uniform vec3 uEdge; uniform float uFill; float ledLine;
float petLine(float d, float w, float px) { float ww = max(w, px * 1.25); return 1.0 - smoothstep(ww * 0.5, ww, d); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{ float pxu = fwidth(vPet.x), pxv = fwidth(vPet.y); float outer = max(petLine(1.0 - abs(vPet.x), 0.07, pxu), petLine(vPet.y, 0.025, pxv));
  float inner = 0.55 * petLine(abs(abs(vPet.x) - 0.5), 0.05, pxu) * step(0.08, vPet.y); // nested facet line inside each panel
  ledLine = vPet.y < 0.0 ? 0.0 : max(outer, inner); diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.9, 0.86, 0.92), ledLine * 0.85); }`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance = totalEmissiveRadiance * uFill * (1.0 - 0.6 * ledLine) + uEdge * ledLine;');
  };
  m.customProgramCacheKey = () => key; return m;
}
function latheMesh(prof, seg, mat, x, y, z) { const m = new THREE.Mesh(new THREE.LatheGeometry(prof.map(([r, h]) => new THREE.Vector2(r, h)), seg), mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; return m; }

// x, z = tower axis; by = top of the shaft; SH/sy/R = shaft height, base and radius function (for the stem LEDs)
// returns { update, top, av: [[y, r], …] aviation-light rings, beaconY }
export function buildLotusBud(group, { x, z, by, sy, SH, R }) {
  // ---- calyx funnel (green, smooth) + the dark structural core behind the petal panels
  const calyxMat = new THREE.MeshStandardMaterial({ color: 0x4d9f86, roughness: 0.38, metalness: 0.12, emissive: 0x000000, envMapIntensity: 1.1 });
  const calyx = latheMesh(CALYX.concat([[15.2, 18.4], [14.6, 18.6]]), 64, calyxMat, x, by, z); calyx.name = 'lotus-calyx'; group.add(calyx);
  const core = latheMesh(BODY.map(([r, h]) => [r - 0.25, h]).concat([[0.1, 53.6]]), 64, new THREE.MeshStandardMaterial({ color: 0x2e1430, roughness: 0.5, metalness: 0.3 }), x, by, z); group.add(core);
  // ---- petal cladding: 3 rows × 12 pointed arches; the lowest row is outermost (overlaps the row above, as on the tower)
  const petals = new Shells(); const N = 12, hw = (Math.PI / N) * 1.04;
  const rows = [[15.2, 41.5, 0, 1.15, ['#ad438f', '#b84d99']], [24.5, 49.5, 0.5, 0.8, ['#a03c86', '#ab4590']], [34.5, 54.6, 0, 0.45, ['#93357c', '#9e3d86']]];
  for (const [h0, h1, off, lift, cols] of rows) for (let k = 0; k < N; k++) petals.petal(x, by, z, h0, h1, ((k + off) / N) * Math.PI * 2, hw, lift, 0.32, k % 2 ? cols[0] : cols[1], '#4a1844');
  const petalMat = ledMaterial({ roughness: 0.24, metalness: 0.22, envMapIntensity: 1.3 }, 'lotus-led-v3'); // glass-clad panels: glossy, reflective
  const pm = new THREE.Mesh(petals.build(), petalMat); pm.castShadow = true; pm.receiveShadow = true; pm.name = 'lotus-petals'; group.add(pm);
  // ---- crown: flat grey drum, gold-lit observation drum, cap
  const grey = new THREE.MeshStandardMaterial({ color: 0x9aa0a4, roughness: 0.45, metalness: 0.55 });
  const goldMat = new THREE.MeshStandardMaterial({ color: 0xd8c9a0, roughness: 0.25, metalness: 0.6, emissive: 0xffc46a, emissiveIntensity: 0 });
  group.add(latheMesh([[0.1, 53.4], [8.6, 53.4], [8.9, 54.2], [8.4, 56.8], [7.6, 57.2], [0.1, 57.2]], 48, grey, x, by, z));
  group.add(latheMesh([[6.6, 57.1], [6.6, 63.6]], 48, goldMat, x, by, z));
  for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2; const f = new THREE.Mesh(new THREE.BoxGeometry(0.35, 6.5, 0.5), grey); f.position.set(x + Math.cos(a) * 6.72, by + 60.35, z + Math.sin(a) * 6.72); f.rotation.y = -a; group.add(f); } // drum mullions
  group.add(latheMesh([[0.1, 63.5], [7.4, 63.5], [7.4, 64.4], [5.2, 65.0], [0.1, 65.0]], 48, grey, x, by, z));
  // ---- mast: thick tapering body (white by day, warm-lit at night), service ring, antenna, beacon
  const mastMat = new THREE.MeshStandardMaterial({ color: 0xece8de, roughness: 0.4, metalness: 0.35, emissive: 0xffb456, emissiveIntensity: 0 });
  group.add(latheMesh([[3.9, 65], [3.6, 72], [3.1, 90], [2.7, 106], [2.6, 107]], 24, mastMat, x, by, z));
  group.add(latheMesh([[2.6, 106.8], [4.2, 107.2], [4.2, 108.2], [2.4, 108.6]], 24, grey, x, by, z));
  group.add(latheMesh([[2.2, 108.6], [1.8, 118], [1.4, 119], [1.1, 132], [0.55, 133], [0.32, 138]], 16, mastMat, x, by, z));
  // ---- stem LEDs: 16 thin lines in the flutes, colour waves travelling up the shaft
  const stripPts = []; for (let h = 0; h <= SH; h += 4) stripPts.push(new THREE.Vector2(R(h) + 0.1, h));
  const stemU = { uOn: { value: 0 }, uT: { value: 0 }, uA: { value: new THREE.Color() }, uB: { value: new THREE.Color() } };
  const stemMat = new THREE.ShaderMaterial({ uniforms: stemU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.FrontSide,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float uOn, uT; uniform vec3 uA, uB; varying vec2 vUv;
      void main(){ float u = fract(vUv.x * 16.0 + 0.0625); float w = fwidth(vUv.x * 16.0) * 1.2 + 0.03; float line = 1.0 - smoothstep(w * 0.5, w, abs(u - 0.5));
        float wave = 0.5 + 0.5 * sin(vUv.y * 22.0 - uT * 1.6); vec3 c = mix(uA, uB, wave);
        float base = smoothstep(0.0, 0.06, vUv.y) * (0.6 + 0.4 * wave); gl_FragColor = vec4(c * line * base * uOn * 0.5, 1.0); }` });
  const strip = new THREE.Mesh(new THREE.LatheGeometry(stripPts, 128), stemMat); strip.position.set(x, sy, z); strip.renderOrder = 2; group.add(strip);
  // ---- animation: signature scheme (magenta panels, white/violet outlines, green calyx, gold crown) with a 40 s colour
  // show every 4 minutes, as the real tower does on festival nights
  const cP = new THREE.Color(), cE = new THREE.Color(), cS = new THREE.Color(), tmp = new THREE.Color();
  const update = (t, night) => {
    const on = THREE.MathUtils.smoothstep(night, 0.05, 0.6); stemU.uOn.value = on; stemU.uT.value = t;
    goldMat.emissiveIntensity = on * 1.1; mastMat.emissiveIntensity = on * 0.22;
    if (on <= 0) { petalMat.emissive.setRGB(0, 0, 0); petalMat.userData.uEdge.value.setRGB(0, 0, 0); calyxMat.emissive.setRGB(0, 0, 0); petalMat.color.setRGB(1, 1, 1); return; }
    const cyc = t % 240, show = cyc > 200 ? Math.sin(((cyc - 200) / 40) * Math.PI) : 0;
    const hue = (0.85 + (cyc - 200) * 0.025) % 1;
    cP.setRGB(0.85, 0.05, 0.75); if (show > 0) cP.lerp(tmp.setHSL(hue, 0.95, 0.5), show);
    cE.setRGB(0.78, 0.72, 1.0); if (show > 0) cE.lerp(tmp.setHSL((hue + 0.15) % 1, 0.6, 0.75), show * 0.6);
    cS.setRGB(0.1, 0.85, 0.3); if (show > 0) cS.lerp(tmp.setHSL((hue + 0.5) % 1, 0.9, 0.5), show * 0.8);
    const pulse = 0.88 + 0.12 * Math.sin(t * 0.7);
    petalMat.emissive.copy(cP).multiplyScalar(0.42 * on * pulse); petalMat.userData.uEdge.value.copy(cE).multiplyScalar(2.2 * on);
    petalMat.color.setRGB(1, 1, 1).lerp(tmp.setRGB(0.5, 0.45, 0.5), on); calyxMat.emissive.copy(cS).multiplyScalar(0.22 * on);
    stemU.uA.value.copy(cS).multiplyScalar(1.3); stemU.uB.value.setRGB(0.9, 1.0, 0.92).lerp(cP, 0.25 + 0.5 * show).multiplyScalar(1.1);
  };
  return { update, petalMat, top: by + 138, av: [[by + 108.3, 4.3], [by + 132.4, 1.3]], beaconY: by + 138.4 };
}
