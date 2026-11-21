// Cinematic lens for the second trailer (src/story/CineTrailer.js) — depth of field and camera motion blur, as one composer
// pass that only exists while that trailer plays (it is inserted into the game's own composer when the trailer starts and
// the page reloads when it ends, so free play never runs it and no game setting changes).
//
//   · depth of field: a 20-tap golden-angle gather whose radius is the circle of confusion from the real depth buffer (the
//     DepthTapPass texture the cinematic grade already reads) — thin-lens style, |1 − focus / depth|, with a near-field guard so
//     a sharp subject never smears over a blurred background;
//   · motion blur: every pixel is reprojected with the previous frame's view-projection matrix (camera motion only — the
//     camera paths are smooth, so this is exactly the blur a film shutter adds to a moving camera); 8 taps along the motion,
//     clamped, and reset on every cut so a cut never streaks.
// Both run in linear HDR before bloom and the grade (highlights bloom into proper bokeh). They render into two private
// half-float targets and copy back, so the depth texture is never sampled while it is attached to the bound framebuffer.
import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';

const VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
const DEPTH = `uniform sampler2D tDepth; uniform float uRev, uNear, uFar;
  float viewZ(vec2 uv) { float d = texture2D(tDepth, uv).x; return uRev > 0.5 ? (d <= 0.0 ? 6000.0 : min(6000.0, uNear / d)) : (d >= 1.0 ? 6000.0 : min(6000.0, (uNear * uFar) / (uFar - (uFar - uNear) * d))); }
`;
const DofFS = `uniform sampler2D tColor; uniform vec2 uTexel; uniform float uFocus, uK, uMaxR; varying vec2 vUv;
  ${DEPTH}
  float coc(float z) { return clamp(uK * abs(1.0 - uFocus / z), 0.0, uMaxR); }
  void main() {
    vec3 base = texture2D(tColor, vUv).rgb; if (uK <= 0.0) { gl_FragColor = vec4(base, 1.0); return; }
    float z0 = viewZ(vUv), c0 = coc(z0);
    // the gather radius: this pixel's own blur, or a nearer blurred neighbour's (foreground bokeh spills over sharp edges)
    float r = c0; for (int i = 0; i < 4; i++) { float a = float(i) * 1.5708 + 0.785; vec2 o = vec2(cos(a), sin(a)) * uMaxR * uTexel; float zz = viewZ(vUv + o); if (zz < z0) r = max(r, coc(zz) * 0.85); }
    if (r < 0.6) { gl_FragColor = vec4(base, 1.0); return; }
    vec3 acc = base; float wsum = 1.0;
    for (int i = 1; i <= 20; i++) {
      float fi = float(i); float rr = sqrt(fi / 20.0) * r; float a = fi * 2.39996;
      vec2 uv = vUv + vec2(cos(a), sin(a)) * rr * uTexel; float zs = viewZ(uv); float cs = coc(zs);
      // a sample counts if its own blur reaches this pixel, or if it lies behind the pixel and the pixel is blurred
      float w = zs < z0 ? smoothstep(rr - 1.0, rr + 1.0, cs) : smoothstep(rr - 1.0, rr + 1.0, min(cs, c0) + 0.5);
      vec3 s = texture2D(tColor, uv).rgb; acc += s * w; wsum += w;
    }
    gl_FragColor = vec4(acc / wsum, 1.0);
  }`;
const BlurFS = `uniform sampler2D tColor; uniform mat4 uCamWorld, uPrevVP; uniform float uTan, uAspect, uShutter, uMaxV; varying vec2 vUv;
  ${DEPTH}
  void main() {
    vec3 base = texture2D(tColor, vUv).rgb; if (uShutter <= 0.0) { gl_FragColor = vec4(base, 1.0); return; }
    float z = viewZ(vUv); vec2 ndc = vUv * 2.0 - 1.0;
    vec4 wp = uCamWorld * vec4(ndc.x * uTan * uAspect * z, ndc.y * uTan * z, -z, 1.0);
    vec4 pc = uPrevVP * wp; vec2 prev = pc.w > 0.0 ? pc.xy / pc.w * 0.5 + 0.5 : vUv;
    vec2 v = (vUv - prev) * uShutter; float l = length(v); if (l > uMaxV) v *= uMaxV / l;
    if (length(v * vec2(uAspect, 1.0)) < 0.0015) { gl_FragColor = vec4(base, 1.0); return; }
    vec3 acc = vec3(0.0); for (int i = 0; i < 8; i++) { float t = (float(i) + 0.5) / 8.0 - 0.5; acc += texture2D(tColor, vUv + v * t).rgb; }
    gl_FragColor = vec4(acc / 8.0, 1.0);
  }`;
const CopyFS = 'uniform sampler2D tColor; varying vec2 vUv; void main(){ gl_FragColor = texture2D(tColor, vUv); }';

export class LensPass extends Pass {
  constructor(cine, camera) {
    super(); this.cine = cine; this.camera = camera; this.needsSwap = false; this.enabled = true;
    const o = { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };
    this.rtA = new THREE.WebGLRenderTarget(1, 1, o); this.rtB = new THREE.WebGLRenderTarget(1, 1, o);
    const dep = () => ({ tDepth: { value: null }, uRev: { value: 1 }, uNear: { value: 0.1 }, uFar: { value: 1000 } });
    this.dof = new THREE.ShaderMaterial({ name: 'TrailerDOF', uniforms: { ...dep(), tColor: { value: null }, uTexel: { value: new THREE.Vector2() }, uFocus: { value: 10 }, uK: { value: 0 }, uMaxR: { value: 9 } }, vertexShader: VS, fragmentShader: DofFS, depthTest: false, depthWrite: false });
    this.blur = new THREE.ShaderMaterial({ name: 'TrailerMotionBlur', uniforms: { ...dep(), tColor: { value: null }, uCamWorld: { value: new THREE.Matrix4() }, uPrevVP: { value: new THREE.Matrix4() }, uTan: { value: 0.4 }, uAspect: { value: 1.78 }, uShutter: { value: 0 }, uMaxV: { value: 0.03 } }, vertexShader: VS, fragmentShader: BlurFS, depthTest: false, depthWrite: false });
    this.copy = new THREE.ShaderMaterial({ name: 'TrailerLensCopy', uniforms: { tColor: { value: null } }, vertexShader: VS, fragmentShader: CopyFS, depthTest: false, depthWrite: false });
    this.qDof = new FullScreenQuad(this.dof); this.qBlur = new FullScreenQuad(this.blur); this.qCopy = new FullScreenQuad(this.copy);
    this.prevVP = new THREE.Matrix4(); this.curVP = new THREE.Matrix4(); this.havePrev = false;
    this.focus = 10; this.k = 0; this.shutter = 0; // set per frame by the trailer (setLens)
  }
  setSize(w, h) { this.rtA.setSize(w, h); this.rtB.setSize(w, h); this.w = w; this.h = h; }
  // per frame: focus distance (m), blur strength (px of CoC far from focus at 1080p-equivalent), shutter (0 = off, 0.5 = 180°)
  setLens(focus, k, shutter, cut) { this.focus = focus; this.k = k; this.shutter = shutter; if (cut) this.havePrev = false; }
  render(renderer, writeBuffer, readBuffer) {
    const depth = this.cine && this.cine.depthTex; const cam = this.camera;
    cam.updateMatrixWorld(); this.curVP.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    const useBlur = this.havePrev && this.shutter > 0.001, useDof = this.k > 0.05;
    if (!depth || (!useBlur && !useDof)) { this.prevVP.copy(this.curVP); this.havePrev = true; return; }
    const scale = (this.h || 1080) / 1080; let src = readBuffer.texture, out = null;
    const setDep = (U) => { U.tDepth.value = depth; U.uRev.value = this.cine.rev; U.uNear.value = cam.near; U.uFar.value = cam.far; };
    if (useDof) { const U = this.dof.uniforms; setDep(U); U.tColor.value = src; U.uTexel.value.set(1 / readBuffer.width, 1 / readBuffer.height); U.uFocus.value = Math.max(0.3, this.focus); U.uK.value = this.k * scale; U.uMaxR.value = 10 * scale; renderer.setRenderTarget(this.rtA); this.qDof.render(renderer); src = this.rtA.texture; out = this.rtA; }
    if (useBlur) { const U = this.blur.uniforms; setDep(U); U.tColor.value = src; U.uCamWorld.value.copy(cam.matrixWorld); U.uPrevVP.value.copy(this.prevVP); U.uTan.value = Math.tan((cam.fov * Math.PI) / 360); U.uAspect.value = cam.aspect; U.uShutter.value = this.shutter; renderer.setRenderTarget(out === this.rtA ? this.rtB : this.rtA); this.qBlur.render(renderer); out = out === this.rtA ? this.rtB : this.rtA; src = out.texture; }
    this.copy.uniforms.tColor.value = src; renderer.setRenderTarget(readBuffer); this.qCopy.render(renderer); // back into the composer's buffer (colour only)
    this.prevVP.copy(this.curVP); this.havePrev = true;
  }
  dispose() { this.rtA.dispose(); this.rtB.dispose(); this.dof.dispose(); this.blur.dispose(); this.copy.dispose(); this.qDof.dispose(); this.qBlur.dispose(); this.qCopy.dispose(); }
}
// insert into the game's composer right after the Sanitize pass (linear HDR, before AO / bloom / grade); returns the pass
export function addLens(post, camera) {
  if (!post || !post.composer || !post.cine) return null; const C = post.composer;
  const p = new LensPass(post.cine, camera); const rt = C.renderTarget1; p.setSize(rt.width, rt.height);
  const i = C.passes.findIndex((q) => q.material && q.material.fragmentShader && /Sanitize|isnan/i.test(q.material.name + q.material.fragmentShader));
  C.insertPass(p, i >= 0 ? i + 1 : 2); return p;
}
