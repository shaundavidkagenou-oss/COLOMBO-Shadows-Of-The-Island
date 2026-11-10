// FPS — night-only light pools out of the shaders while they are dark.
//
// three.js shades forward: every lit fragment of every standard / physical material runs the full direct-light BRDF for EVERY
// light in the scene, whatever its intensity (the unrolled light loop has no intensity test). The game keeps fixed pools of
// lights so their count never changes mid-play (a new count recompiles every material): street-lamp spots (6–10), the
// headlight beams (4), the police torches and the school guard's torch. By day all of them sit at intensity 0 — yet each
// pixel still evaluated ~17 spot lights that add exactly nothing.
//
// This module hides that pool (light.visible = false, which drops the lights from the shaders) while every member is dark,
// and shows it the moment any member lights up (dusk, a torch, a headlight). The image is identical — dark lights contribute
// 0 — only the wasted shading goes. The two light states are two shader variants per material; the loading screen compiles
// both (Game: 'Compiling shaders' / warmLightSets), so the switch at dusk / dawn only rebinds already-built programs.
// A hold time keeps the pool visible for a while after the last light goes dark, so it never toggles back and forth.
const NIGHT = new Set(); const HOLD = 12; // s
let state = null, forced = null, holdT = 0;
// register a light that is dark most of the time (by day); returns it
export function nightLight(l) { NIGHT.add(l); if (state !== null) setOne(l, forced ?? state); return l; }
export function dropNightLight(l) { NIGHT.delete(l); }
export const nightSetOn = () => state !== false;
// force a state (shader warm-up compiles both variants); null hands control back to the lights
export function forceNightSet(on) { forced = on; if (on !== null) apply(on); else { holdT = HOLD; apply(true); } }
function setOne(l, on) { if (l.visible === on) return; l.visible = on; if (on && l.castShadow && l.shadow && !l.shadow.map) l.shadow.needsUpdate = true; /* its depth map is allocated on its first shadow pass */ }
function apply(on) { state = on; for (const l of NIGHT) setOne(l, on); }
// once per frame, after the simulation set the intensities and before rendering
export function updateLightSets(dt) {
  if (forced !== null) return;
  let lit = false; for (const l of NIGHT) if (l.intensity > 0) { lit = true; break; }
  if (lit) holdT = HOLD; else holdT -= dt;
  const want = holdT > 0; if (want !== state) apply(want);
}
// Keeping the other light state compiled. The loading screen compiles both states for everything then in the scene; content
// that streams in later (a new district, a vehicle type, an effect) compiles only for the current state when first drawn. So
// whenever the renderer has built new programs, the objects whose materials were never warmed are compiled for the OTHER
// state too (KHR_parallel_shader_compile: off the main thread; only those objects, not the scene), at most every few seconds.
// Then dusk / dawn finds every program already built. `rt` = the main pass's target (programs depend on the output target).
const WARM = new WeakSet(); let progSeen = -1, warmCd = 0;
const isDrawable = (o) => o.isMesh || o.isPoints || o.isLine || o.isSprite;
const matsOf = (o) => (Array.isArray(o.material) ? o.material : o.material ? [o.material] : []);
export function markWarm(scene) { scene.traverse((o) => { if (isDrawable(o)) for (const m of matsOf(o)) WARM.add(m); }); }
export function maintainWarm(R, camera, scene, rt, dt) {
  if (forced !== null || state === null) return; const n = R.info.programs ? R.info.programs.length : 0;
  if (progSeen < 0) { progSeen = n; return; } if ((warmCd -= dt) > 0 || n === progSeen) return; warmCd = 4; progSeen = n;
  const list = []; scene.traverse((o) => { if (!isDrawable(o)) return; for (const m of matsOf(o)) if (!WARM.has(m)) { list.push(o); break; } });
  if (!list.length) return;
  const root = { traverse: (fn) => { for (const o of list) fn(o); }, traverseVisible() {} }; // compile() only walks it for materials
  const prev = R.getRenderTarget(), was = state; apply(!was);
  try { R.setRenderTarget(rt || null); if (R.compileAsync) R.compileAsync(root, camera, scene).catch(() => {}); else R.compile(root, camera, scene); } catch (e) { console.warn('light-set warm', e); }
  finally { R.setRenderTarget(prev); apply(was); }
  for (const o of list) for (const m of matsOf(o)) WARM.add(m); progSeen = R.info.programs ? R.info.programs.length : n;
}
