// Post-processing: subtle bloom (night lights), optional GTAO, the cinematic output pass (Cinematic.js: light shafts, lens flare,
// ACES tone mapping + sRGB, time-of-day 32³ LUT grade, vignette), screen effects, SMAA.
import * as THREE from 'three';
import { bloomIsHot } from './BloomHot.js';
const lerp = (a, b, t) => a + (b - a) * t;
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { CinePass, DepthTapPass, profileWeights, PROFILES, PROFILE_ORDER, CINE } from './Cinematic.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
// Senses: blast shock ripple (a refraction ring racing out from the explosion on screen), concussion (blur, washed-out colour,
// dark edges) and being drunk (wobble, double vision, motion smear from a history buffer, swimming edges, rich colour).
// Only enabled while one of them is active, so normal frames cost nothing.
const SenseShader = {
  uniforms: { tDiffuse: { value: null }, tHist: { value: null }, uShock: { value: new THREE.Vector4() }, uAspect: { value: 1.7 }, uConc: { value: 0 }, uDrunk: { value: 0 }, uGhost: { value: 0 }, uTime: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform sampler2D tHist; uniform vec4 uShock; uniform float uAspect; uniform float uConc; uniform float uDrunk; uniform float uGhost; uniform float uTime; varying vec2 vUv;
    void main() {
      vec2 uv = vUv; vec2 c = vUv - 0.5; float lc = length(c);
      if (uShock.w > 0.0) { vec2 d = uv - uShock.xy; d.x *= uAspect; float l = length(d); float ring = exp(-pow((l - uShock.z) / 0.055, 2.0)); vec2 dir = d / max(l, 1e-4); dir.x /= uAspect; uv -= dir * ring * uShock.w * 0.03; }
      if (uDrunk > 0.0) uv += vec2(sin(uv.y * 5.0 + uTime * 1.3) + sin(uv.y * 11.0 - uTime * 0.7) * 0.4, cos(uv.x * 4.0 + uTime * 1.05)) * 0.0045 * uDrunk;
      vec3 col = texture2D(tDiffuse, uv).rgb;
      if (uDrunk > 0.0) {
        vec2 o = vec2(sin(uTime * 0.61) + 0.35 * sin(uTime * 1.7), cos(uTime * 0.43)) * 0.012 * uDrunk;
        col = mix(col, texture2D(tDiffuse, uv + o).rgb, 0.42 * min(1.0, uDrunk * 1.6));                    // double vision
        float e = smoothstep(0.12, 0.7, lc) * uDrunk;                                                      // the edges swim out of focus
        if (e > 0.01) { vec3 s = texture2D(tDiffuse, uv + c * 0.025 * e).rgb + texture2D(tDiffuse, uv - c * 0.025 * e).rgb + texture2D(tDiffuse, uv + vec2(c.y, -c.x) * 0.02 * e).rgb; col = mix(col, s / 3.0, min(1.0, e * 0.9)); }
        col = mix(col, texture2D(tHist, vUv).rgb, uGhost);                                                 // smear: the last frames linger
        float lum = dot(col, vec3(0.299, 0.587, 0.114)); col = mix(vec3(lum), col, 1.0 + 0.4 * uDrunk); col *= vec3(1.0 + 0.05 * uDrunk, 1.0, 1.0 - 0.04 * uDrunk);
        col *= 1.0 - 0.3 * uDrunk * smoothstep(0.3, 0.9, lc) * (0.8 + 0.2 * sin(uTime * 1.9));
      }
      if (uConc > 0.0) {
        vec3 s = vec3(0.0); for (int i = 0; i < 6; i++) { float a = float(i) * 1.0472 + 0.4; s += texture2D(tDiffuse, uv + vec2(cos(a), sin(a) * uAspect) * 0.007 * uConc).rgb; } s /= 6.0;
        col = mix(col, s, min(1.0, uConc * 0.9)); float lum = dot(col, vec3(0.299, 0.587, 0.114)); col = mix(col, vec3(lum), uConc * 0.65);
        col = mix(col, vec3(1.0, 0.97, 0.92), smoothstep(0.6, 1.0, uConc) * 0.5); col *= 1.0 - 0.45 * uConc * smoothstep(0.2, 0.8, lc);
      }
      gl_FragColor = vec4(col, 1.0);
    }`,
};
// FPS: by day the bloom runs at threshold 7 / strength 0.03 — measured: it changes no pixel at all (tools: identical frames
// with and without it at 12:00 and 17:00, both view directions). Its ~13 half-res passes are skipped then. Anything that can
// exceed the threshold keeps it on: night / dusk (lamps), storm darkness, a fireball (glow), interiors (club neon), a muzzle
// flash or flashing beacons (bloomHot).
const CopyFS = 'uniform sampler2D tDiffuse; varying vec2 vUv; void main(){ gl_FragColor = texture2D(tDiffuse, vUv); }';
class SensePass extends Pass {
  constructor(w, h) {
    super(); this.mat = new THREE.ShaderMaterial({ uniforms: THREE.UniformsUtils.clone(SenseShader.uniforms), vertexShader: SenseShader.vertexShader, fragmentShader: SenseShader.fragmentShader, depthTest: false, depthWrite: false }); this.uniforms = this.mat.uniforms;
    this.copy = new THREE.ShaderMaterial({ uniforms: { tDiffuse: { value: null } }, vertexShader: SenseShader.vertexShader, fragmentShader: CopyFS, depthTest: false, depthWrite: false });
    this.quad = new FullScreenQuad(this.mat); this.cq = new FullScreenQuad(this.copy); this.hist = new THREE.WebGLRenderTarget(Math.max(1, w), Math.max(1, h), { type: THREE.HalfFloatType }); this.histOk = false;
  }
  setSize(w, h) { this.hist.setSize(w, h); this.histOk = false; }
  render(renderer, writeBuffer, readBuffer) {
    const U = this.uniforms; U.tDiffuse.value = readBuffer.texture; U.tHist.value = this.hist.texture; const ghost = U.uGhost.value; if (!this.histOk) U.uGhost.value = 0;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer); this.quad.render(renderer); U.uGhost.value = ghost;
    if (U.uDrunk.value > 0.001 && !this.renderToScreen) { this.copy.uniforms.tDiffuse.value = writeBuffer.texture; renderer.setRenderTarget(this.hist); this.cq.render(renderer); this.histOk = true; } else this.histOk = false;
  }
  dispose() { this.hist.dispose(); this.mat.dispose(); this.copy.dispose(); this.quad.dispose(); this.cq.dispose(); }
}

// (The former GradeShader — saturation, warm/teal split tone, vignette, lightning flash — ran as a second full-screen pass AFTER
// the OutputPass, on tone-mapped sRGB values: its additive split tone lifted pure black to a blue-tinted floor (+0.024 B) and
// pushed clipped whites yellow (+0.06 R / −0.05 B). Its features now live in CinePass: saturation and split toning in the LUT
// profiles, vignette, flash and the wet desaturation in the output shader — applied once, in the right colour space.)
// Replaces NaN/Inf pixels (degenerate normals, half-float overflow) so bloom can't smear them across the frame.
const SanitizeShader = {
  uniforms: { tDiffuse: { value: null } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv;
    void main(){ vec4 c = texture2D(tDiffuse, vUv); /* comparisons are false for NaN and fail for Inf; unlike isnan() they are not folded away by fast-math drivers */ if (any(isnan(c)) || any(isinf(c)) || !all(lessThan(abs(c), vec4(65000.0)))) c = vec4(0.0, 0.0, 0.0, 1.0); gl_FragColor = vec4(min(c.rgb, vec3(40.0)), c.a); }`,
};
// Squad-switch transit: radial motion blur toward the screen centre, chromatic aberration growing to the edges, and for
// jump-cuts a short signal glitch (row tearing, RGB split, scanlines). Disabled (zero cost) whenever all three are 0.
const TransitShader = {
  uniforms: { tDiffuse: { value: null }, uBlur: { value: 0 }, uChroma: { value: 0 }, uGlitch: { value: 0 }, uTime: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uBlur, uChroma, uGlitch, uTime; varying vec2 vUv;
    float h(float n) { return fract(sin(n) * 43758.5453); }
    void main(){ vec2 uv = vUv; vec2 c = vec2(0.5);
      if (uGlitch > 0.0) { float row = floor(uv.y * 38.0); float r = h(row * 13.1 + floor(uTime * 30.0)); uv.x += (r - 0.5) * 0.09 * uGlitch * step(0.62, r); }
      vec2 d = uv - c; float len = length(d);
      vec3 col = vec3(0.0); float tot = 0.0;
      for (int i = 0; i < 12; i++) { float t = float(i) / 11.0; float s = 1.0 - uBlur * 0.11 * t * smoothstep(0.05, 0.5, len); float w = 1.0 - t * 0.6; col += texture2D(tDiffuse, c + d * s).rgb * w; tot += w; }
      col /= tot;
      float ca = (uChroma * 0.011 + uGlitch * 0.012) * smoothstep(0.0, 0.7, len) + uGlitch * 0.004;
      if (ca > 0.0) { vec2 o = normalize(d + 1e-5) * ca; float rr = texture2D(tDiffuse, uv + o).r, bb = texture2D(tDiffuse, uv - o).b; col.r = mix(col.r, rr, 0.85); col.b = mix(col.b, bb, 0.85); }
      if (uGlitch > 0.0) { col *= 1.0 - 0.18 * uGlitch * step(0.5, fract(uv.y * 270.0)); col += vec3(0.05, 0.08, 0.1) * uGlitch * step(0.93, h(floor(uv.y * 90.0) + floor(uTime * 24.0))); }
      col *= 1.0 - uBlur * 0.22 * smoothstep(0.35, 0.8, len); // tunnel darkening at the edges
      gl_FragColor = vec4(col, 1.0); }`,
};
export class PostFX {
  constructor(renderer, scene, camera) {
    this.r = renderer; this.scene = scene; this.camera = camera; this.enabled = true; this.build();
  }
  build(preset = { bloom: true, ao: false, cine: 1 }) {
    if (this.composer) this.disposeComposer(); // a rebuild (start-up, quality change) used to leak the previous targets
    const r = this.r, size = r.getSize(new THREE.Vector2()); const pr = r.getPixelRatio();
    const rt = new THREE.WebGLRenderTarget(size.x * pr, size.y * pr, { type: THREE.HalfFloatType, samples: 0, depthTexture: new THREE.DepthTexture(size.x * pr, size.y * pr, THREE.FloatType) }); // 32-bit float depth: with the reversed-Z renderer this removes distance z-fighting
    this.composer = new EffectComposer(r, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.cine = new CinePass(preset.cine ?? 1, size.x * pr, size.y * pr); this.cine.flareOn = this.flareOn !== false; this.cine.raysOn = this.raysOn !== false;
    this.composer.addPass(new DepthTapPass(this.cine));
    this.composer.addPass(new ShaderPass(SanitizeShader));
    if (preset.ao) { this.ao = new GTAOPass(this.scene, this.camera, size.x, size.y); this.ao.blendIntensity = 0.7; this.composer.addPass(this.ao); } else this.ao = null;
    if (preset.bloom) { this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.35, 0.55, 0.92); this.composer.addPass(this.bloom); } else this.bloom = null;
    this.composer.addPass(this.cine); this.grade = this.cine; // tone mapping + sRGB + grade in one pass (replaces OutputPass + GradeShader)
    this.transit = new ShaderPass(TransitShader); this.transit.enabled = false; this.composer.addPass(this.transit);
    if (this.sense) this.sense.dispose(); this.sense = new SensePass(size.x * pr, size.y * pr); this.sense.enabled = false; this.composer.addPass(this.sense); this.shocks = this.shocks || []; this.conc = this.conc || 0; this.drunk = this.drunk || 0; this.glow = 0;
    if (preset.smaa !== false) { this.smaa = new SMAAPass(size.x * pr, size.y * pr); this.composer.addPass(this.smaa); }
  }
  setSize(w, h) { this.composer.setSize(w, h); }
  disposeComposer() { for (const p of this.composer.passes) if (p !== this.sense && p.dispose) p.dispose(); this.composer.dispose(); this.composer = null; }
  // Settings → Lens flare / Light shafts (effective only where the preset includes them)
  setCine(flare, rays) { this.flareOn = flare; this.raysOn = rays; if (this.cine) { this.cine.flareOn = flare; this.cine.raysOn = rays; } }
  // explosion hooks (Explosions.js) and the drunk level (Drinks): see SenseShader
  shock(x, y, a) { this.shocks.push({ x, y, a, t: 0 }); if (this.shocks.length > 3) this.shocks.shift(); this.glow = Math.max(this.glow, Math.min(1, a * 1.5)); }
  concuss(k) { this.conc = Math.max(this.conc, Math.min(1, k)); }
  setDrunk(k) { this.drunk = Math.max(0, Math.min(1, k)); }
  tickSenses(dt) {
    const S = this.sense; if (!S) return; const U = S.uniforms; const sz = this.r.getSize(new THREE.Vector2()); U.uAspect.value = sz.x / Math.max(1, sz.y); U.uTime.value += dt;
    for (const s of this.shocks) s.t += dt; this.shocks = this.shocks.filter((s) => s.t < 0.6); const s = this.shocks[this.shocks.length - 1];
    if (s) U.uShock.value.set(s.x, s.y, 0.05 + s.t * 1.6, s.a * Math.pow(1 - s.t / 0.6, 1.5)); else U.uShock.value.w = 0;
    this.conc = Math.max(0, this.conc - dt / 5); U.uConc.value = this.conc > 0.01 ? Math.min(1, this.conc * 1.15) : 0;
    U.uDrunk.value = this.drunk > 0.01 ? this.drunk : 0; U.uGhost.value = Math.min(0.82, this.drunk * 0.8);
    S.enabled = !!s || U.uConc.value > 0 || U.uDrunk.value > 0; this.glow = Math.max(0, this.glow - dt * 0.9);
  }
  setTransit(blur, chroma, glitch) { const u = this.transit.uniforms; u.uBlur.value = blur; u.uChroma.value = chroma; u.uGlitch.value = glitch; u.uTime.value = performance.now() / 1000; this.transit.enabled = blur > 0.001 || chroma > 0.001 || glitch > 0.001; }
  update(atmos) {
    if (this.bloom) { const gl = this.glow || 0; this.bloom.enabled = atmos.night > 0.001 || gl > 0 || (atmos.w && atmos.w.dark > 0.15) || this.indoor || bloomIsHot(); this.bloom.strength = 0.03 + atmos.night * 0.3 + gl * 0.35; this.bloom.threshold = lerp(lerp(7, 1.7, atmos.night), 2.2, gl); /* daylight: effectively off (no veil); night: lamps and windows glow; a fireball briefly glows in daylight too */ this.bloom.radius = 0.3 + gl * 0.25; }
    // time-of-day grade: profile weights from the sun and the weather, eased (≈ 0.7 s) so a time skip or a weather jump never
    // pops the colours; snapped on the first frame and when a tool asks (gradeSnap)
    const now = performance.now(), dt = this.lastUpd ? Math.min(0.25, (now - this.lastUpd) / 1000) : 0.016, first = !this.lastUpd || now - this.lastUpd > 1500; this.lastUpd = now;
    const tgt = profileWeights(atmos.sunDir.y, atmos.hour, atmos.night, atmos.w.dark, this._wt || (this._wt = new Array(5)));
    const inside = this.inside === undefined ? !!this.indoor : !!this.inside; if (inside) { tgt.fill(0); tgt[1] = 1; } // interiors: neutral grade, no sun effects
    if (!this.gradeW || first || this.gradeSnap) { this.gradeW = tgt.slice(); this.gradeSnap = false; } else { const k = 1 - Math.exp(-dt * CINE.gradeRate); for (let i = 0; i < 5; i++) this.gradeW[i] += (tgt[i] - this.gradeW[i]) * k; }
    let expo = 0; for (let i = 0; i < 5; i++) expo += this.gradeW[i] * PROFILES[PROFILE_ORDER[i]].expo;
    const C = this.cine; C.rev = this.r.state.buffers.depth.getReversed ? (this.r.state.buffers.depth.getReversed() ? 1 : 0) : 0;
    C.setFrame(this.camera, atmos, { weights: this.gradeW, expo: inside ? 1 : expo, indoor: inside, dt });
    const u = C.uniforms; u.uWet.value = atmos.wet; u.uFlash.value = atmos.flash * 0.25;
  }
  render(dt) { this.tickSenses(dt || 0.016); if (this.enabled) this.composer.render(dt); else this.r.render(this.scene, this.camera); }
}
