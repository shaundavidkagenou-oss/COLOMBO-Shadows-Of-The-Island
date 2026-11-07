// Colombo Lotus Tower (Nelum Kuluna) — the bud, sepals and night LED show.
// Real landmark: ≈350 m, on Beira Lake: a 4-storey podium, a tapering pale-green shaft, a closed magenta lotus bud (the tower
// house: observation deck + revolving restaurant) cupped by green sepals, and a long antenna mast. At night ~20,000 LEDs
// light the petals and run up the shaft in changing colours. Everything here is original geometry (no external assets).
//
// Petals are real shells: a pointed parametric surface (widest just below mid-height, converging to a tip) with an outer
// skin, an inner skin and rim strips, so no edge is ever paper-thin or see-through. Each vertex carries `aLed` (0..1),
// brighter toward the petal's edges and tip: at night the emissive LED wash follows the petal shapes, so the bud reads as a
// lotus of outlined petals instead of a glowing ball.
import * as THREE from 'three';

const lerp = (a, b, t) => a + (b - a) * t;
function along(pts, v) { const f = v * (pts.length - 1), i = Math.min(pts.length - 2, Math.floor(f)), k = f - i; return [lerp(pts[i][0], pts[i + 1][0], k), lerp(pts[i][1], pts[i + 1][1], k)]; }
// half-width factor along the petal: narrow at the base, widest at ~45 %, pointed tip
function widthAt(v, base = 0.42) { return v < 0.45 ? base + (1 - base) * Math.sin((v / 0.45) * Math.PI / 2) : Math.pow(Math.cos(((v - 0.45) / 0.55) * Math.PI / 2), 0.85); }

class Shells {
  constructor() { this.pos = []; this.col = []; this.led = []; this.idx = []; }
  // one petal / sepal: cx, by, cz = bud origin; phi0 = centre angle; halfW = half angular width at the widest point
  petal(cx, by, cz, pts, phi0, halfW, t, colOut, colIn, { nV = 16, nU = 10, bulge = 0.045, curl = 0.05, base = 0.42 } = {}) {
    const co = new THREE.Color(colOut), ci = new THREE.Color(colIn); const P = this.pos, C = this.col, Ld = this.led, I = this.idx;
    const grid = (inner) => { const start = P.length / 3;
      for (let j = 0; j <= nV; j++) { const v = j / nV; const [rc, h] = along(pts, v); const wf = widthAt(v, base);
        for (let i = 0; i <= nU; i++) { const u = i / nU * 2 - 1; const a = phi0 + u * halfW * wf;
          let r = rc * (1 + bulge * (1 - u * u)) - curl * rc * u * u * 0.4; if (inner) r -= t; // convex petal, edges curl in slightly
          P.push(cx + Math.cos(a) * r, by + h, cz + Math.sin(a) * r);
          const shade = inner ? 0.75 : 0.9 + 0.1 * (1 - u * u); const c = inner ? ci : co; C.push(c.r * shade, c.g * shade, c.b * shade);
          Ld.push(Math.min(1, 0.32 + 0.68 * Math.pow(Math.abs(u), 4) + 0.35 * Math.pow(v, 3))); } }
      for (let j = 0; j < nV; j++) for (let i = 0; i < nU; i++) { const a = start + j * (nU + 1) + i, b = a + 1, c = a + nU + 1, d = c + 1; if (inner) I.push(a, b, c, b, d, c); else I.push(a, c, b, b, c, d); }
      return start; };
    const o = grid(false), n = grid(true);
    // rims: both long edges and the base row (outer → inner)
    const rim = (ia, ib) => { for (let k = 0; k < ia.length - 1; k++) { const a0 = o + ia[k], a1 = o + ia[k + 1], b0 = n + ib[k], b1 = n + ib[k + 1]; I.push(a0, b0, a1, a1, b0, b1); } };
    const L = [], R = [], B = []; for (let j = 0; j <= nV; j++) { L.push(j * (nU + 1)); R.push(j * (nU + 1) + nU); } for (let i = 0; i <= nU; i++) B.push(i);
    rim(L, L); rim(R.slice().reverse(), R.slice().reverse()); rim(B.slice().reverse(), B.slice().reverse());
  }
  build() {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aLed', new THREE.Float32BufferAttribute(this.led, 1)); g.setIndex(this.idx); g.computeVertexNormals(); g.computeBoundingSphere(); return g;
  }
}
// emissive scaled per vertex by aLed (the LED wash follows each petal's outline)
function ledMaterial(opts) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, emissive: 0x000000, ...opts });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aLed; varying float vLed;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvLed = aLed;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vLed;').replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= vLed;');
  };
  m.customProgramCacheKey = () => 'lotus-led-v1'; return m;
}

// x, z = tower axis; by = bud base (top of the shaft); SH/sy/R = shaft height, base and radius function (for the stem LEDs)
export function buildLotusBud(group, { x, z, by, sy, SH, R }) {
  const petals = new Shells(), sepals = new Shells();
  // core body behind the petals (structure), and the glazed observation deck / restaurant band seen through the petal slits
  const coreProfile = [[5.6, -2], [9.5, 2], [15, 8], [17.6, 15], [18.2, 22], [17.4, 30], [14.4, 38], [9.6, 46], [4.8, 54], [1.8, 60]];
  const core = new THREE.Mesh(new THREE.LatheGeometry(coreProfile.map(([r, h]) => new THREE.Vector2(r, h)), 48), new THREE.MeshStandardMaterial({ color: 0x4a1a3e, roughness: 0.6, metalness: 0.2 }));
  core.position.set(x, by, z); core.castShadow = true; group.add(core);
  const deckMat = new THREE.MeshStandardMaterial({ color: 0x1c2228, roughness: 0.08, metalness: 0.6, emissive: 0xffc890, emissiveIntensity: 0.05, envMapIntensity: 1.6 });
  const deck = new THREE.Mesh(new THREE.LatheGeometry([[18.35, 15.5], [18.45, 22], [17.75, 29]].map(([r, h]) => new THREE.Vector2(r, h)), 64), deckMat); deck.position.set(x, by, z); group.add(deck);
  // sepals: 8 broad green leaves cupping the lower bud, tips flaring out
  for (let k = 0; k < 8; k++) sepals.petal(x, by, z, [[6.4, -8], [8.6, -4.5], [12.4, -0.5], [16.4, 3.6], [19.6, 7.6], [21.6, 11.4], [22.6, 14.6]], (k / 8) * Math.PI * 2, (Math.PI / 8) * 1.02, 0.55, k % 2 ? '#5aa85e' : '#64b468', '#3d7c44', { base: 0.55, bulge: 0.06 });
  // petals: outer ring (8, long, tips just parted), second ring (8, offset), third ring (8) closing over the crown, tip cluster (6)
  const ring = (n, off, pts, hw, t, cOut, cIn, o) => { for (let k = 0; k < n; k++) petals.petal(x, by, z, pts, ((k + off) / n) * Math.PI * 2, hw, t, k % 2 ? cOut[0] : cOut[1], cIn, o); };
  ring(8, 0.5, [[7.2, -1], [12.4, 3], [16.8, 8], [19.8, 14], [20.9, 20.5], [20.4, 27.5], [18.0, 34.5], [14.6, 41], [10.8, 46.5], [7.6, 50.5]], (Math.PI / 8) * 1.08, 0.5, ['#c9579d', '#d26aa8'], '#7a2a66', { bulge: 0.05 });
  ring(8, 0, [[6.4, 5], [13.2, 9], [17.4, 15.5], [18.9, 23], [17.8, 31], [14.6, 39], [10.4, 46.5], [6.4, 53], [3.2, 58]], (Math.PI / 8) * 1.04, 0.45, ['#b8488e', '#c4559a'], '#6d2259', { bulge: 0.05 });
  ring(8, 0.5, [[8.0, 26], [12.2, 32], [11.6, 39], [9.0, 46], [6.0, 52.5], [3.4, 58], [1.7, 62]], (Math.PI / 8) * 1.0, 0.4, ['#a63e80', '#b1468a'], '#5e1e4e', { bulge: 0.04, base: 0.5 });
  ring(6, 0.25, [[4.6, 44], [5.6, 49], [4.6, 54], [3.0, 59], [1.6, 62.5], [0.7, 64.5]], (Math.PI / 6) * 1.0, 0.35, ['#9c3a78', '#a74282'], '#561a48', { bulge: 0.03, base: 0.6, nV: 10, nU: 8 });
  const petalMat = ledMaterial({ roughness: 0.34, metalness: 0.12, envMapIntensity: 1.2 }), sepalMat = ledMaterial({ roughness: 0.4, metalness: 0.08, envMapIntensity: 1.0 });
  const pm = new THREE.Mesh(petals.build(), petalMat), sm = new THREE.Mesh(sepals.build(), sepalMat);
  for (const m of [pm, sm]) { m.castShadow = true; m.receiveShadow = true; group.add(m); } pm.name = 'lotus-petals'; sm.name = 'lotus-sepals';
  // stem LEDs: 16 lines in the flutes, colour waves travelling up the shaft (one additive lathe just proud of the concrete)
  const stripPts = []; for (let h = 0; h <= SH; h += 4) stripPts.push(new THREE.Vector2(R(h) + 0.1, h));
  const stemU = { uOn: { value: 0 }, uT: { value: 0 }, uA: { value: new THREE.Color() }, uB: { value: new THREE.Color() } };
  const stemMat = new THREE.ShaderMaterial({ uniforms: stemU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.FrontSide,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float uOn, uT; uniform vec3 uA, uB; varying vec2 vUv;
      void main(){ float u = fract(vUv.x * 16.0 + 0.0625); float w = fwidth(vUv.x * 16.0) * 1.2 + 0.035; float line = 1.0 - smoothstep(w * 0.5, w, abs(u - 0.5));
        float wave = 0.5 + 0.5 * sin(vUv.y * 22.0 - uT * 1.6); vec3 c = mix(uA, uB, wave);
        float base = smoothstep(0.0, 0.06, vUv.y) * (0.75 + 0.25 * wave); gl_FragColor = vec4(c * line * base * uOn, 1.0); }` });
  const strip = new THREE.Mesh(new THREE.LatheGeometry(stripPts, 128), stemMat); strip.position.set(x, sy, z); strip.renderOrder = 2; group.add(strip);
  // animation: default scheme is the landmark's signature (magenta bud, green sepals, green/white shaft); every few minutes a
  // short colour show sweeps the hue (as the real tower does on festival nights)
  const cP = new THREE.Color(), cS = new THREE.Color(), tmp = new THREE.Color();
  const update = (t, night) => {
    const on = THREE.MathUtils.smoothstep(night, 0.05, 0.6); petalMat.emissive.setRGB(0, 0, 0); sepalMat.emissive.setRGB(0, 0, 0); stemU.uOn.value = on; stemU.uT.value = t;
    deckMat.emissiveIntensity = 0.05 + on * 0.9; if (on <= 0) { petalMat.color.setRGB(1, 1, 1); sepalMat.color.setRGB(1, 1, 1); return; }
    const cyc = t % 240, show = cyc > 200 ? Math.sin(((cyc - 200) / 40) * Math.PI) : 0; // 40 s show every 4 min
    const hue = (0.88 + (cyc - 200) * 0.025) % 1;
    cP.setRGB(1.0, 0.05, 0.5); // saturated LED magenta (a paler pink washed out to white-pink under ACES) if (show > 0) cP.lerp(tmp.setHSL(hue, 0.95, 0.5), show);
    cS.setRGB(0.08, 0.85, 0.22); if (show > 0) cS.lerp(tmp.setHSL((hue + 0.5) % 1, 0.9, 0.5), show * 0.8);
    const pulse = 0.85 + 0.15 * Math.sin(t * 0.7);
    petalMat.emissive.copy(cP).multiplyScalar(1.15 * on * pulse); sepalMat.emissive.copy(cS).multiplyScalar(0.6 * on); petalMat.color.setRGB(1, 1, 1).lerp(tmp.setRGB(0.45, 0.4, 0.45), on); sepalMat.color.setRGB(1, 1, 1).lerp(tmp.setRGB(0.5, 0.5, 0.5), on); // darker albedo at night: the LEDs, not the moonlit paint, set the colour
    stemU.uA.value.copy(cS).multiplyScalar(1.4); stemU.uB.value.setRGB(0.9, 1.0, 0.92).lerp(cP, 0.25 + 0.5 * show).multiplyScalar(1.2);
  };
  return { update, petalMat, sepalMat };
}
