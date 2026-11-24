// Build-time patch for three.js (WebGLRenderer.setProgram / renderBufferDirect): a draw never waits for a shader compile.
//
// three creates a program the first time a material is drawn in a new state (new material, new light set, first shadow pass,
// instanced / skinned variant ...) and then immediately reads its uniform locations — which makes the driver finish compiling
// and linking right there, on the frame that needs it. On Windows (ANGLE → Direct3D 11) that is tens to hundreds of ms per
// program: the "huge sudden FPS drop" when something appears for the first time (a shop's room, a police unit, gunfire
// effects, a shadow variant) even though the loading screen pre-compiles everything it can reach.
//
// Browsers with KHR_parallel_shader_compile (Chrome / Edge / Electron on Windows, macOS, Linux) compile on background threads
// and report completion through program.isReady(). With `renderer.deferCompile = true` (Game.frameStep sets it during play),
// a scene draw whose program is still compiling is skipped for that frame (renderer.info.deferred counts them) and drawn as
// soon as the program is ready — a frame or two later — instead of stalling the whole frame. Untouched:
//   • full-screen post passes (their "scene" is the quad itself, not a THREE.Scene): never skipped — a missing post pass would
//     show a black frame;
//   • one-shot captures (sky environment, bank probe, map capture): they set deferCompile = false around their render;
//   • without KHR_parallel_shader_compile isReady() is always true: exactly the old behaviour.
// Every edit asserts it matched exactly once, so a three.js upgrade fails the build loudly instead of silently skipping it.

export function patchAsyncCompile(code) {
  const once = (src, find, repl) => {
    const n = src.split(find).length - 1;
    if (n !== 1) throw new Error(`[three-async-compile] expected 1 match for "${find.slice(0, 80)}", found ${n} (three.js changed? update tools/vite/threeAsyncCompile.mjs)`);
    return src.replace(find, repl);
  };
  // setProgram: after the program for this draw is known, before its uniforms are fetched (the blocking call)
  let out = once(code,
    '\t\t\tlet refreshProgram = false;\n\t\t\tlet refreshMaterial = false;\n\t\t\tlet refreshLights = false;\n\n\t\t\tconst p_uniforms = program.getUniforms(),',
    '\t\t\tif ( _this.deferCompile === true && scene.isScene === true && program.isReady() === false ) {\n\n' +
    '\t\t\t\t_this.info.deferred = ( _this.info.deferred || 0 ) + 1; // [three-async-compile] still compiling: skip this draw\n' +
    '\t\t\t\treturn null;\n\n\t\t\t}\n\n' +
    '\t\t\tlet refreshProgram = false;\n\t\t\tlet refreshMaterial = false;\n\t\t\tlet refreshLights = false;\n\n\t\t\tconst p_uniforms = program.getUniforms(),');
  // renderBufferDirect: nothing to draw with yet
  out = once(out,
    '\t\t\tconst program = setProgram( camera, scene, geometry, material, object );\n\n\t\t\tstate.setMaterial( material, frontFaceCW );',
    '\t\t\tconst program = setProgram( camera, scene, geometry, material, object );\n\n\t\t\tif ( program === null ) return; // [three-async-compile]\n\n\t\t\tstate.setMaterial( material, frontFaceCW );');
  return out;
}

export default function threeAsyncCompile() {
  return {
    name: 'three-async-compile',
    enforce: 'pre',
    transform(code, id) {
      if (!/[\\/]three[\\/]build[\\/]three\.module(\.min)?\.js$/.test(id.split('?')[0])) return null;
      return { code: patchAsyncCompile(code), map: null };
    },
  };
}
