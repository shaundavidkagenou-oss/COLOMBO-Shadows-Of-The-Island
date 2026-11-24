// Build-time patch for three.js (WebGLRenderer.setProgram / getUniformList): per-material memo of program variants.
//
// three keeps ONE "current program" per material and re-derives it whenever the draw's conditions differ from the last draw
// of that material: BatchedMesh vs Mesh, InstancedMesh (with / without instance colours), SkinnedMesh, another light set,
// render target, environment or fog. Re-deriving means WebGLPrograms.getParameters (an object of ~100 fields) plus
// getProgramCacheKey (a ~100-part string) plus a fresh uniform list — even though the program it finds already exists.
// Colombo shares its city materials (painted surfaces, concrete, metal, facades, roofs, roads ...) between the merged city
// batches and ordinary meshes, so ~70 of ~475 draws a frame took that path (measured, 85th), and the shadow pass's single
// depth material flips the same way between batched / instanced / skinned / plain casters: a few ms of CPU every frame.
//
// The patch remembers, per material, which program each combination of exactly the conditions three itself compares
// (needsProgramChange in setProgram) led to, and switches straight back to it. Only when the material is unchanged
// (material.version) — any material edit / needsUpdate clears the memo and three runs its normal path. The light set is
// keyed by the lights object itself AND its version (stock three compares the version only). A miss runs three's own
// getProgram and records the result. Side flips of three's own two-pass transparent draw are keyed, not invalidating. Every edit asserts it matched exactly once (a three.js upgrade fails the build loudly).

export function patchProgramVariants(code) {
  const once = (src, find, repl) => {
    const n = src.split(find).length - 1;
    if (n !== 1) throw new Error(`[three-program-variants] expected 1 match for "${find.slice(0, 80)}", found ${n} (three.js changed? update tools/vite/threeProgramVariants.mjs)`);
    return src.replace(find, repl);
  };
  const T = '\t\t\t';
  // 1) setProgram: fast path before getProgram, record after it
  let out = once(code,
    `${T}let program = materialProperties.currentProgram;\n\n${T}if ( needsProgramChange === true ) {\n\n${T}\tprogram = getProgram( material, scene, object );\n`,
    `${T}let program = materialProperties.currentProgram;\n\n` +
    `${T}// [three-program-variants] a variant of this (unchanged) material seen before: switch straight back to its program\n` +
    `${T}let _pvKey = null;\n` +
    `${T}if ( needsProgramChange === true ) {\n` +
    `${T}\tconst _ls = lights.state, _bat = object.isBatchedMesh === true, _ins = object.isInstancedMesh === true;\n` +
    `${T}\t_pvKey = ( _bat ? 1 : 0 ) + ( _bat && object._colorsTexture !== null ? 2 : 0 ) + ( _ins ? 4 : 0 ) + ( _ins && object.instanceColor !== null ? 8 : 0 ) + ( _ins && object.morphTexture !== null ? 16 : 0 ) + ( object.isSkinnedMesh === true ? 32 : 0 ) +\n` +
    `${T}\t\t( vertexAlphas ? 64 : 0 ) + ( vertexTangents ? 128 : 0 ) + ( morphTargets ? 256 : 0 ) + ( morphNormals ? 512 : 0 ) + ( morphColors ? 1024 : 0 ) + ( currentRenderState.state.lightProbeGridArray.length > 0 ? 2048 : 0 ) + material.side * 4096 +\n` +
    `${T}\t\t'|' + ( _ls.__pvId || ( _ls.__pvId = ++ _pvSeq ) ) + ':' + _ls.version + '|' + ( envMap ? envMap.id : 0 ) + '|' + ( material.fog === true && fog ? ( fog.__pvId || ( fog.__pvId = ++ _pvSeq ) ) : 0 ) +\n` +
    `${T}\t\t'|' + colorSpace + '|' + toneMapping + '|' + morphTargetsCount + '|' + clipping.numPlanes + ':' + clipping.numIntersection;\n` +
    `${T}\tconst _pvMap = materialProperties.__pvMap;\n` +
    `${T}\tconst _pv = ( _this.programVariants !== false && _pvMap !== undefined && materialProperties.__pvVer === material.version - ( material.__pvSideBumps || 0 ) && material.version === materialProperties.__version ) ? _pvMap.get( _pvKey ) : undefined;\n` +
    `${T}\tif ( _pv !== undefined ) {\n` +
    `${T}\t\tmaterialProperties.environment = environment; materialProperties.fog = fog; materialProperties.envMap = envMap;\n` +
    `${T}\t\tmaterialProperties.envMapRotation = ( environment !== null && material.envMap === null ) ? scene.environmentRotation : material.envMapRotation;\n` +
    `${T}\t\tconst _c = _pv.c; for ( const _k in _c ) materialProperties[ _k ] = _c[ _k ];\n` +
    `${T}\t\tconst _u = materialProperties.uniforms;\n` +
    `${T}\t\tif ( ( ! material.isShaderMaterial && ! material.isRawShaderMaterial ) || material.clipping === true ) _u.clippingPlanes = clipping.uniform;\n` +
    `${T}\t\tmaterialProperties.lightsStateVersion = _ls.version;\n` +
    `${T}\t\tif ( materialProperties.needsLights ) {\n` +
    `${T}\t\t\t_u.ambientLightColor.value = _ls.ambient; _u.lightProbe.value = _ls.probe; _u.sunLights.value = _ls.sun; _u.sunLightShadows.value = _ls.sunShadow;\n` +
    `${T}\t\t\t_u.directionalLights.value = _ls.directional; _u.directionalLightShadows.value = _ls.directionalShadow; _u.spotLights.value = _ls.spot; _u.spotLightShadows.value = _ls.spotShadow;\n` +
    `${T}\t\t\t_u.rectAreaLights.value = _ls.rectArea; _u.ltc_1.value = _ls.rectAreaLTC1; _u.ltc_2.value = _ls.rectAreaLTC2; _u.pointLights.value = _ls.point; _u.pointLightShadows.value = _ls.pointShadow;\n` +
    `${T}\t\t\t_u.hemisphereLights.value = _ls.hemi; _u.sunShadowMatrix.value = _ls.sunShadowMatrix; _u.sunShadowCascade.value = _ls.sunShadowCascade; _u.directionalShadowMatrix.value = _ls.directionalShadowMatrix;\n` +
    `${T}\t\t\t_u.spotLightMatrix.value = _ls.spotLightMatrix; _u.spotLightMap.value = _ls.spotLightMap; _u.pointShadowMatrix.value = _ls.pointShadowMatrix;\n` +
    `${T}\t\t}\n` +
    `${T}\t\tmaterialProperties.currentProgram = _pv.program; materialProperties.__pvCur = _pv;\n` +
    `${T}\t\tmaterialProperties.uniformsList = ( _pv.uniforms === _u ) ? _pv.uniformsList : null;\n` +
    `${T}\t\tprogram = _pv.program; needsProgramChange = false;\n` +
    `${T}\t\t_this.info.variantHits = ( _this.info.variantHits || 0 ) + 1;\n` +
    `${T}\t}\n` +
    `${T}}\n\n` +
    `${T}if ( needsProgramChange === true ) {\n\n${T}\tprogram = getProgram( material, scene, object );\n` +
    `${T}\tif ( materialProperties.__pvMap === undefined || materialProperties.__pvVer !== material.version - ( material.__pvSideBumps || 0 ) ) { materialProperties.__pvMap = new Map(); materialProperties.__pvVer = material.version - ( material.__pvSideBumps || 0 ); }\n` +
    `${T}\tif ( _pvKey !== null && material.version === materialProperties.__version && materialProperties.__pvMap.size < 32 ) {\n` +
    `${T}\t\tconst _mp = materialProperties;\n` +
    `${T}\t\tconst _e = { program, uniforms: _mp.uniforms, uniformsList: null, c: { outputColorSpace: _mp.outputColorSpace, batching: _mp.batching, batchingColor: _mp.batchingColor, instancing: _mp.instancing, instancingColor: _mp.instancingColor, instancingMorph: _mp.instancingMorph, skinning: _mp.skinning,\n` +
    `${T}\t\t\tmorphTargets: _mp.morphTargets, morphNormals: _mp.morphNormals, morphColors: _mp.morphColors, morphTargetsCount: _mp.morphTargetsCount, numClippingPlanes: _mp.numClippingPlanes, numIntersection: _mp.numIntersection,\n` +
    `${T}\t\t\tvertexAlphas: _mp.vertexAlphas, vertexTangents: _mp.vertexTangents, toneMapping: _mp.toneMapping, needsLights: _mp.needsLights, lightProbeGrid: _mp.lightProbeGrid } };\n` +
    `${T}\t\t_mp.__pvMap.set( _pvKey, _e ); _mp.__pvCur = _e;\n` +
    `${T}\t} else materialProperties.__pvCur = null;\n` +
    `${T}\t_this.info.variantMisses = ( _this.info.variantMisses || 0 ) + 1;\n`);
  // 2) getUniformList: keep the list it builds with the variant that is current
  out = once(out,
    `${T}\tmaterialProperties.uniformsList = WebGLUniforms.seqWithValue( progUniforms.seq, materialProperties.uniforms );\n`,
    `${T}\tmaterialProperties.uniformsList = WebGLUniforms.seqWithValue( progUniforms.seq, materialProperties.uniforms );\n` +
    `${T}\tconst _pc = materialProperties.__pvCur; if ( _pc && _pc.program === materialProperties.currentProgram && _pc.uniforms === materialProperties.uniforms ) _pc.uniformsList = materialProperties.uniformsList; // [three-program-variants]\n`);
  // 3) renderObject's two-pass transparent DoubleSide draw flips material.side (Back, then Front) with needsUpdate twice a
  //    frame. Count those bumps so they don't wipe the memo (side is part of the variant key instead); any other edit still does.
  out = once(out,
    `${T}\tmaterial.side = BackSide;\n${T}\tmaterial.needsUpdate = true;\n${T}\t_this.renderBufferDirect(`,
    `${T}\tmaterial.side = BackSide;\n${T}\tmaterial.needsUpdate = true; material.__pvSideBumps = ( material.__pvSideBumps || 0 ) + 1; // [three-program-variants]\n${T}\t_this.renderBufferDirect(`);
  out = once(out,
    `${T}\tmaterial.side = FrontSide;\n${T}\tmaterial.needsUpdate = true;\n${T}\t_this.renderBufferDirect(`,
    `${T}\tmaterial.side = FrontSide;\n${T}\tmaterial.needsUpdate = true; material.__pvSideBumps = ( material.__pvSideBumps || 0 ) + 1; // [three-program-variants]\n${T}\t_this.renderBufferDirect(`);
  // 4) the id counter, next to setProgram's other renderer-scope state
  out = once(out, `\t\tfunction setProgram( camera, scene, geometry, material, object ) {\n`, `\t\tlet _pvSeq = 0; // [three-program-variants]\n\n\t\tfunction setProgram( camera, scene, geometry, material, object ) {\n`);
  return out;
}

export default function threeProgramVariants() {
  return {
    name: 'three-program-variants',
    enforce: 'pre',
    transform(code, id) {
      if (!/[\\/]three[\\/]build[\\/]three\.module(\.min)?\.js$/.test(id.split('?')[0])) return null;
      return { code: patchProgramVariants(code), map: null };
    },
  };
}
