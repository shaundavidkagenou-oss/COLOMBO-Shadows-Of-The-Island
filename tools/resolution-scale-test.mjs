// Regression test for the VRAM leak that made Quality / Resolution-scale changes kill the WebGL context.
// The old PostFX.build() replaced the EffectComposer (and therefore every render target: the full-res RGBA16F main target,
// its 32-bit float depth, bloom's ~10 half-res mips, GTAO's 3 full-res targets, SMAA's 2 full-res targets, the sense history
// buffer) on every settings change, and never disposed the previous chain. Sliding Resolution scale therefore leaked
// hundreds of MB per nudge, and the driver eventually dropped the context - after which the game never drew another frame.
//
// This test drives PostFX with a stub renderer so it needs no GPU, and asserts:
//   1. the same preset does not rebuild the chain at all (resize only),
//   2. a real preset change rebuilds it and disposes the previous targets,
//   3. repeated changes do not grow the number of live render targets.
// Run: node tools/resolution-scale-test.mjs
globalThis.localStorage ??= { getItem: () => null, setItem: () => {}, removeItem: () => {} };
globalThis.requestAnimationFrame ??= (cb) => setTimeout(() => cb(performance.now()), 0);
// SMAAPass decodes two lookup textures through an <img>; the DOM stub has no image loader, so hand it a no-op element.
globalThis.Image ??= class { set src(v) {} get src() { return ''; } addEventListener() {} removeEventListener() {} }; // eslint-disable-line
const THREE = await import('three');
const { PostFX } = await import('../src/gfx/PostFX.js');

// ---- stub renderer: enough of WebGLRenderer for EffectComposer / Pass setSize paths ---------------------------
const live = new Set(); // every WebGLRenderTarget that has not been disposed
let allocated = 0, disposed = 0;
// WebGLRenderTarget's constructor calls setSize(), so hooking setSize sees every allocation (composer targets, bloom mips,
// GTAO, SMAA, the sense history buffer) without needing to subclass anything three owns.
const _setSize = THREE.WebGLRenderTarget.prototype.setSize;
THREE.WebGLRenderTarget.prototype.setSize = function (w, h, d) {
  if (!live.has(this)) { live.add(this); allocated++; }
  return _setSize.call(this, w, h, d);
};
const _dispose = THREE.WebGLRenderTarget.prototype.dispose;
THREE.WebGLRenderTarget.prototype.dispose = function () { if (live.delete(this)) disposed++; return _dispose.call(this); };
const stub = {
  _pr: 1, _w: 1920, _h: 1080,
  getPixelRatio() { return this._pr; },
  setPixelRatio(p) { this._pr = p; },
  getSize(v) { return v.set(this._w, this._h); },
  setSize(w, h) { this._w = w; this._h = h; },
  getDrawingBufferSize(v) { return v.set(this._w * this._pr, this._h * this._pr); },
  getContext() { return { isContextLost: () => false }; },
  capabilities: { maxSamples: 4 },
  getRenderTarget() { return null; },
  setRenderTarget() {},
  clear() {},
  render() {},
  getClearColor(c) { return c.set(0, 0, 0); },
  getClearAlpha() { return 1; },
  autoClear: true,
};
const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(62, 16 / 9, 0.25, 16000);

const fx = new PostFX(stub, scene, camera);
fx.rebuild({ bloom: true, ao: false });
const baseTargets = countTargets(); // everything the full chain allocated - the baseline
const baseMB = fx.vramMB();

// ---- 1. Resolution-scale changes: same preset -> no rebuild ---------------------------------------------------
const composerBefore = fx.composer;
for (const s of [0.85, 0.75, 0.67, 1.0, 1.25, 1.5, 1.0]) {
  stub.setPixelRatio(s);
  fx.rebuild({ bloom: true, ao: false }); // what Game.applySettings does
  fx.setSize(stub._w, stub._h);
}
const sameChain = fx.composer === composerBefore;
const rtAt = () => { const t = fx.composer.renderTarget1; return [Math.round(t.width), Math.round(t.height)]; };
stub.setPixelRatio(1.0); fx.rebuild({ bloom: true, ao: false }); fx.setSize(1920, 1080); const sizeAt100 = rtAt();
stub.setPixelRatio(0.75); fx.rebuild({ bloom: true, ao: false }); fx.setSize(1920, 1080); const sizeAt75 = rtAt();
stub.setPixelRatio(1.0); fx.rebuild({ bloom: true, ao: false }); fx.setSize(1920, 1080);
const afterSlider = countTargets();

// ---- 2. Quality changes: different preset -> rebuild + dispose ------------------------------------------------
const before = fx.composer;
let disposedBefore = disposed;
fx.rebuild({ bloom: false, ao: false, smaa: false });
const rebuilt = fx.composer !== before;
const disposedAfter = disposed - disposedBefore;

// ---- 3. Many toggles must not grow live targets --------------------------------------------------------------
const liveAfterSwitch = countTargets();
for (let i = 0; i < 40; i++) { fx.rebuild({ bloom: i % 2 === 0, ao: i % 3 === 0 }); stub.setPixelRatio(1); fx.setSize(1920, 1080); }
const liveAfterStress = countTargets();

function countTargets() { return live.size; }

const fails = [];
const chk = (ok, msg) => { console.log(`${ok ? '  ok  ' : ' FAIL '} ${msg}`); if (!ok) fails.push(msg); };
console.log('\nPostFX chain lifecycle');
chk(sameChain, 'same preset after 7 resolution-scale changes reuses the composer (no rebuild)');
chk(afterSlider === baseTargets, `resolution-scale changes allocate nothing new (baseline ${baseTargets}, after ${afterSlider})`);
chk(rebuilt, 'a preset change (bloom off) builds a new chain');
chk(sizeAt100[0] === 1920 && sizeAt100[1] === 1080, `post chain renders at full resolution at scale 100% (${sizeAt100.join('x')})`);
chk(sizeAt75[0] === 1440 && sizeAt75[1] === 810, `and follows Resolution scale to 75% on the SAME chain (${sizeAt75.join('x')}) - composer pixel ratio kept in step`);
chk(disposedAfter > 0, `a preset change disposes the old targets (${disposedAfter} disposed)`);
chk(liveAfterSwitch <= baseTargets + 8, `live target count stays bounded after a preset switch (${afterSlider} -> ${liveAfterSwitch})`);
chk(liveAfterStress <= baseTargets + 8, `40 preset changes leave no leaked targets (${liveAfterStress} live, ${disposed} total disposed)`);
chk(Number.isFinite(baseMB) && baseMB > 0, `post VRAM estimate reports a real number (${baseMB.toFixed(0)} MB at ${stub._w}x${stub._h})`);

console.log(fails.length ? `\n${fails.length} FAILED` : '\nall checks passed');
process.exit(fails.length ? 1 : 0);
