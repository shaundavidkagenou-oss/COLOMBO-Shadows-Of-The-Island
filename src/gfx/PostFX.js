// Post-processing: subtle bloom (night lights), optional GTAO, warm tropical colour grade + gentle vignette, SMAA, output.
import * as THREE from 'three';
const lerp = (a, b, t) => a + (b - a) * t;
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';

const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uWarm: { value: 0.5 }, uSat: { value: 1.08 }, uVig: { value: 0.18 }, uWet: { value: 0 }, uFlash: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uWarm, uSat, uVig, uWet, uFlash; varying vec2 vUv;
    void main(){ vec4 c = texture2D(tDiffuse, vUv); vec3 col = c.rgb;
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722)); col = mix(vec3(l), col, uSat - uWet * 0.12);
      // split tone: warm highlights, slightly teal shadows
      col += (vec3(0.035, 0.012, -0.03) * smoothstep(0.35, 1.0, l) + vec3(-0.012, 0.004, 0.014) * (1.0 - smoothstep(0.0, 0.35, l))) * uWarm * 2.0;
      float v = smoothstep(0.85, 0.25, length(vUv - 0.5)); col *= mix(1.0 - uVig, 1.0, v);
      col += uFlash * vec3(0.6, 0.65, 0.8);
      gl_FragColor = vec4(col, c.a); }`,
};
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
  build(preset = { bloom: true, ao: false }) {
    const r = this.r, size = r.getSize(new THREE.Vector2()); const pr = r.getPixelRatio();
    const rt = new THREE.WebGLRenderTarget(size.x * pr, size.y * pr, { type: THREE.HalfFloatType, samples: 0 });
    this.composer = new EffectComposer(r, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.composer.addPass(new ShaderPass(SanitizeShader));
    if (preset.ao) { this.ao = new GTAOPass(this.scene, this.camera, size.x, size.y); this.ao.blendIntensity = 0.7; this.composer.addPass(this.ao); } else this.ao = null;
    if (preset.bloom) { this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.35, 0.55, 0.92); this.composer.addPass(this.bloom); } else this.bloom = null;
    this.composer.addPass(new OutputPass());
    this.grade = new ShaderPass(GradeShader); this.composer.addPass(this.grade);
    this.transit = new ShaderPass(TransitShader); this.transit.enabled = false; this.composer.addPass(this.transit);
    if (preset.smaa !== false) { this.smaa = new SMAAPass(size.x * pr, size.y * pr); this.composer.addPass(this.smaa); }
  }
  setSize(w, h) { this.composer.setSize(w, h); }
  setTransit(blur, chroma, glitch) { const u = this.transit.uniforms; u.uBlur.value = blur; u.uChroma.value = chroma; u.uGlitch.value = glitch; u.uTime.value = performance.now() / 1000; this.transit.enabled = blur > 0.001 || chroma > 0.001 || glitch > 0.001; }
  update(atmos) {
    if (this.bloom) { this.bloom.strength = 0.03 + atmos.night * 0.3; this.bloom.threshold = lerp(7, 1.7, atmos.night); /* daylight: effectively off (no veil); night: lamps and windows glow */ this.bloom.radius = 0.3; }
    const u = this.grade.uniforms; u.uWarm.value = 0.35 + atmos.golden * 0.5 * (1 - atmos.w.dark); u.uSat.value = 1.1 - atmos.w.dark * 0.12; u.uWet.value = atmos.wet; u.uFlash.value = atmos.flash * 0.25;
  }
  render(dt) { if (this.enabled) this.composer.render(dt); else this.r.render(this.scene, this.camera); }
}
