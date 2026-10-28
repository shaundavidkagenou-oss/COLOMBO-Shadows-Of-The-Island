// Post-processing: subtle bloom (night lights), optional GTAO, warm tropical colour grade + gentle vignette, SMAA, output.
import * as THREE from 'three';
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
    void main(){ vec4 c = texture2D(tDiffuse, vUv); if (any(isnan(c)) || any(isinf(c))) c = vec4(0.0, 0.0, 0.0, 1.0); gl_FragColor = vec4(min(c.rgb, vec3(40.0)), c.a); }`,
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
    if (preset.smaa !== false) { this.smaa = new SMAAPass(size.x * pr, size.y * pr); this.composer.addPass(this.smaa); }
  }
  setSize(w, h) { this.composer.setSize(w, h); }
  update(atmos) {
    if (this.bloom) { this.bloom.strength = 0.08 + atmos.night * 0.28; this.bloom.threshold = 3.2 - atmos.night * 1.5; this.bloom.radius = 0.3; }
    const u = this.grade.uniforms; u.uWarm.value = 0.35 + atmos.golden * 0.5 * (1 - atmos.w.dark); u.uSat.value = 1.1 - atmos.w.dark * 0.12; u.uWet.value = atmos.wet; u.uFlash.value = atmos.flash * 0.25;
  }
  render(dt) { if (this.enabled) this.composer.render(dt); else this.r.render(this.scene, this.camera); }
}
