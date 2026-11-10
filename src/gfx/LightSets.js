// FPS — night-only light pools out of the shaders while they are dark.
//
// three.js shades forward: every lit fragment of every standard / physical material runs the full direct-light BRDF for EVERY
// light in the scene, whatever its intensity (the unrolled light loop has no intensity test). The game keeps fixed pools of
// lights so their count never changes mid-play (a new count recompiles every material): street-lamp spots (6–10), the
// headlight beams (4), the police torches and the school guard's torch. By day all of them sit at intensity 0 — yet each
// pixel still evaluated ~17 spot lights that add exactly nothing.
//
// This module hides that pool (light.visible = false, which drops the lights from the shaders) while every member is dark,
// and shows it the moment any member lights up (dusk, a torch, a headlight) — in two tiers, see below. The image is identical — dark lights contribute
// 0 — only the wasted shading goes. The light levels are shader variants per material; the loading screen compiles
// both (Game: 'Compiling shaders' / warmLightSets), so the switch at dusk / dawn only rebinds already-built programs.
// A hold time keeps the pool visible for a while after the last light goes dark, so it never toggles back and forth.
// Two tiers: 1 = street lamps + headlight beams (every night), 2 = torches (police flashlights, the school guard — only while one
// is actually lit, a few minutes of a night at most). Level 0 = day (neither), 1 = night, 2 = night with a torch: three shader
// variants per material, all pre-compiled; a tier's lights are in the shaders exactly while the level reaches it.
const TIER = new Map(); const HOLD = 12; // s
let level = null, forced = null; const holdT = [0, 0, 0];
// register a light that is dark most of the time; tier 1 (night pools) or 2 (occasional torches); returns it
export function nightLight(l, tier = 1) { TIER.set(l, tier); if (level !== null) setOne(l, tier <= (forced ?? level)); return l; }
export function dropNightLight(l) { TIER.delete(l); }
export const LIGHT_LEVELS = [0, 1, 2];
export const lightLevel = () => (level === null ? 2 : level);
export const nightSetOn = () => lightLevel() > 0;
// force a level (shader warm-up compiles every variant); null hands control back to the lights
export function forceNightSet(on) { forced = on === true ? 2 : on === false ? 0 : on; if (forced !== null) apply(forced); else { holdT[1] = holdT[2] = HOLD; apply(2); } }
function setOne(l, on) { if (l.visible === on) return; l.visible = on; if (on && l.castShadow && l.shadow && !l.shadow.map) l.shadow.needsUpdate = true; /* its depth map is allocated on its first shadow pass */ }
function apply(lv) { level = lv; for (const [l, t] of TIER) setOne(l, t <= lv); }
// once per frame, after the simulation set the intensities and before rendering
export function updateLightSets(dt) {
  if (forced !== null) return;
  let lit = 0; for (const [l, t] of TIER) if (t > lit && l.intensity > 0) { lit = t; if (lit === 2) break; }
  for (let t = 1; t <= 2; t++) { if (lit >= t) holdT[t] = HOLD; else holdT[t] -= dt; }
  const want = holdT[2] > 0 ? 2 : holdT[1] > 0 ? 1 : 0; if (want !== level) apply(want);
}
// Keeping the other light levels compiled. The loading screen compiles every level for everything then in the scene; content
// that streams in later (a new district, a vehicle type, an effect) compiles only for the current level when first drawn. So
// whenever the renderer has built new programs, the objects whose materials were never warmed are compiled for EVERY level
// (the current one too: an object still hidden — a night-only glow — was never drawn) (KHR_parallel_shader_compile: off the main thread; only those objects, not the scene), at most every few seconds.
// Then dusk / dawn finds every program already built. `rt` = the main pass's target (programs depend on the output target).
const WARM = new WeakSet(); let progSeen = -1, warmCd = 0;
const isDrawable = (o) => o.isMesh || o.isPoints || o.isLine || o.isSprite;
const matsOf = (o) => (Array.isArray(o.material) ? o.material : o.material ? [o.material] : []);
export function markWarm(scene) { scene.traverse((o) => { if (isDrawable(o)) for (const m of matsOf(o)) WARM.add(m); }); }
export function maintainWarm(R, camera, scene, rt, dt) {
  if (forced !== null || level === null) return; const n = R.info.programs ? R.info.programs.length : 0;
  if (progSeen < 0) { progSeen = n; return; } if ((warmCd -= dt) > 0 || n === progSeen) return; warmCd = 4; progSeen = n;
  const list = []; scene.traverse((o) => { if (!isDrawable(o)) return; for (const m of matsOf(o)) if (!WARM.has(m)) { list.push(o); break; } });
  if (!list.length) return;
  const root = { traverse: (fn) => { for (const o of list) fn(o); }, traverseVisible() {} }; // compile() only walks it for materials
  const prev = R.getRenderTarget(), was = level;
  try { R.setRenderTarget(rt || null); for (const lv of LIGHT_LEVELS) { apply(lv); /* the current level too: hidden objects (night-only glows, signs) were never drawn yet */ if (R.compileAsync) R.compileAsync(root, camera, scene).catch(() => {}); else R.compile(root, camera, scene); } } catch (e) { console.warn('light-set warm', e); }
  finally { R.setRenderTarget(prev); apply(was); }
  for (const o of list) for (const m of matsOf(o)) WARM.add(m); progSeen = R.info.programs ? R.info.programs.length : n;
}
