/*! @license
 * Snapdragon(TM) Game Super Resolution 1 (SGSR 1) — WebGL2 port used by COLOMBO: Shadows of the Island.
 *
 * The shader below is ported from Qualcomm's official SGSR 1 GLSL sources:
 *   https://github.com/SnapdragonGameStudios/snapdragon-gsr  (commit d926f074bcb9d714e179f1ce0fcb9ee2eeb5074e)
 *   sgsr/v1/include/glsl/sgsr1_shader_mobile.frag
 *   sgsr/v1/include/glsl/sgsr1_shader_mobile_edge_direction.frag
 * Those files carry this notice:
 *
 *                  Copyright (c) 2025, Qualcomm Innovation Center, Inc. All rights reserved.
 *                              SPDX-License-Identifier: BSD-3-Clause
 *
 * and the repository's LICENSE (reproduced in full here and in src/gfx/sgsr/LICENSE):
 *
 * Copyright (c) 2023, Qualcomm Innovation Center, Inc. All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * 1. Redistributions of source code must retain the above copyright notice,
 *    this list of conditions and the following disclaimer.
 *
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 *    this list of conditions and the following disclaimer in the documentation
 *    and/or other materials provided with the distribution.
 *
 * 3. Neither the name of the copyright holder nor the names of its contributors
 *    may be used to endorse or promote products derived from this software
 *    without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
 * AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
 * ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE
 * LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
 * CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
 * SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
 * INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
 * CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
 * ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
 * POSSIBILITY OF SUCH DAMAGE.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */
// 91st: SGSR 1 as the composer's last pass (PostFX.setUpscale). It reads the frame AFTER the whole existing chain at the internal
// resolution — scene → sanitize → GTAO → bloom → CinePass (exposure, ACES, sRGB encode, LUT grade, vignette, dither) → transit →
// senses → SMAA — and writes the canvas at the output resolution (CSS size × devicePixelRatio). Colour: SGSR works on
// display-referred values in [0, 1] (its luma is the G channel, every result is clamped to [0, 1], the high-contrast limit is
// 23/255) — exactly what CinePass writes (its own srgbOETF; no pass in the chain adds an output conversion and this one adds none
// either), so the colour encode still happens exactly once and nothing is tone-mapped or encoded twice.
//
// Changes from the official GLSL, all forced by WebGL2 / three.js and none of them in the algorithm:
//   • textureGather (GLSL ES 3.10) does not exist in WebGL2 (GLSL ES 3.00). Every gather in the shader is taken at a texel corner
//     (floor(uv·size + (−0.5, 0.5)) · texelSize), where textureGather(ps0, corner(px, py), 1) returns the G channel of the texels
//     x = (px−1, py), y = (px, py), z = (px, py−1), w = (px−1, py−1) (GL spec gather order, clamp-to-edge). gatherG() returns exactly
//     that with texelFetch on integer coordinates clamped to the texture — the same 12 texels the four gathers read (they don't
//     overlap), so the early-out vote fetches only the two it needs and the full kernel fetches each texel once.
//   • the fragment input in_TEXCOORD0 (layout-qualified fragment inputs are not allowed in GLSL ES 3.00) is three's vUv (a vec2:
//     the shader only ever reads .xy); EdgeSharpness is a uniform (the README's 1.0–2.0 range) instead of a
//     #define so the setting applies without recompiling; OperationMode is fixed to 1 (RGBA: what the game feeds it).
//   • UseUniformBlock (Vulkan only, per the README) is not used.
import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { withoutDefer } from './AsyncCompile.js';

export const SGSR_SHARP_MIN = 1.0, SGSR_SHARP_MAX = 2.0, SGSR_SHARP_DEFAULT = 2.0; // README: "default 2.0, range 1.0–2.0"

const VS = /* glsl */ `
out highp vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

// ---- sgsr1_shader_mobile.frag / sgsr1_shader_mobile_edge_direction.frag (Qualcomm, BSD-3-Clause — see the notice above)
const FS = /* glsl */ `
//============================================================================================================
//
//
//                  Copyright (c) 2025, Qualcomm Innovation Center, Inc. All rights reserved.
//                              SPDX-License-Identifier: BSD-3-Clause
//
//============================================================================================================
// WebGL2 port (COLOMBO): textureGather emulated with texelFetch (gatherG), three.js input / output, EdgeSharpness as a uniform.

precision mediump float;
precision highp int;

////////////////////////
// USER CONFIGURATION //
////////////////////////

/*
* Operation modes:
* RGBA -> 1
* RGBY -> 3
* LERP -> 4
*/
#define OperationMode 1

#define EdgeThreshold 8.0/255.0

#define EdgeSharpness uEdgeSharpness

/*
* If set, will use edge direction to improve visual quality
* Expect a minimal cost increase
*/
// #define UseEdgeDirection   (set by the material's defines: SGSR_EDGE_DIRECTION)
#if defined(SGSR_EDGE_DIRECTION)
#define UseEdgeDirection
#endif

////////////////////////
////////////////////////
////////////////////////

uniform highp vec4 ViewportInfo[1];
uniform mediump sampler2D ps0;
uniform float uEdgeSharpness;

in highp vec2 vUv;
#define in_TEXCOORD0 vUv
layout(location=0) out vec4 out_Target0;

// textureGather(ps0, corner, 1) at the texel corner (c.x, c.y): G of (c.x-1, c.y), (c.x, c.y), (c.x, c.y-1), (c.x-1, c.y-1)
highp ivec2 gMax;
float tG(highp ivec2 p) { return texelFetch(ps0, clamp(p, ivec2(0), gMax), 0).y; }
vec4 gatherG(highp ivec2 c) { return vec4(tG(c + ivec2(-1, 0)), tG(c), tG(c + ivec2(0, -1)), tG(c + ivec2(-1, -1))); }

float fastLanczos2(float x)
{
	float wA = x-4.0;
	float wB = x*wA-wA;
	wA *= wA;
	return wB*wA;
}

#if defined(UseEdgeDirection)
vec2 weightY(float dx, float dy, float c, vec3 data)
#else
vec2 weightY(float dx, float dy, float c, float data)
#endif
{
#if defined(UseEdgeDirection)
	float std = data.x;
	vec2 dir = data.yz;

	float edgeDis = ((dx*dir.y)+(dy*dir.x));
	float x = (((dx*dx)+(dy*dy))+((edgeDis*edgeDis)*((clamp(((c*c)*std),0.0,1.0)*0.7)+-1.0)));
#else
	float std = data;
	float x = ((dx*dx)+(dy* dy))* 0.55 + clamp(abs(c)*std, 0.0, 1.0);
#endif

	float w = fastLanczos2(x);
	return vec2(w, w * c);
}

#if defined(UseEdgeDirection)
vec2 edgeDirection(vec4 left, vec4 right)
{
	vec2 dir;
	float RxLz = (right.x + (-left.z));
	float RwLy = (right.w + (-left.y));
	vec2 delta;
	delta.x = (RxLz + RwLy);
	delta.y = (RxLz + (-RwLy));
	float lengthInv = inversesqrt((delta.x * delta.x+ 3.075740e-05) + (delta.y * delta.y));
	dir.x = (delta.x * lengthInv);
	dir.y = (delta.y * lengthInv);
	return dir;
}
#endif

void main()
{
	gMax = ivec2(ViewportInfo[0].zw) - ivec2(1);
	vec4 color;
	if(OperationMode == 1)
		color.xyz = textureLod(ps0,in_TEXCOORD0.xy,0.0).xyz;
	else
		color.xyzw = textureLod(ps0,in_TEXCOORD0.xy,0.0).xyzw;

	if ( OperationMode!=4)
	{
		highp vec2 imgCoord = ((in_TEXCOORD0.xy*ViewportInfo[0].zw)+vec2(-0.5,0.5));
		highp vec2 imgCoordPixel = floor(imgCoord);
		highp ivec2 corner = ivec2(imgCoordPixel); // = coord / ViewportInfo[0].xy (the gather corner, in texels)
		vec2 pl = (imgCoord+(-imgCoordPixel));
		vec4  left;
		left.y = tG(corner); left.z = tG(corner + ivec2(0, -1)); // the two texels the vote reads (gatherG fills x / w below)

		float edgeVote = abs(left.z - left.y) + abs(color[OperationMode] - left.y)  + abs(color[OperationMode] - left.z) ;
		if(edgeVote > EdgeThreshold)
		{
			left.x = tG(corner + ivec2(-1, 0)); left.w = tG(corner + ivec2(-1, -1));
			corner.x += 1; // coord.x += ViewportInfo[0].x;

			vec4 right = gatherG(corner + ivec2(1, 0));
			vec4 upDown;
			upDown.xy = gatherG(corner + ivec2(0, -1)).wz;
			upDown.zw  = gatherG(corner + ivec2(0, 1)).yx;

			float mean = (left.y+left.z+right.x+right.w)*0.25;
			left = left - vec4(mean);
			right = right - vec4(mean);
			upDown = upDown - vec4(mean);
			color.w =color[OperationMode] - mean;

			float sum = (((((abs(left.x)+abs(left.y))+abs(left.z))+abs(left.w))+(((abs(right.x)+abs(right.y))+abs(right.z))+abs(right.w)))+(((abs(upDown.x)+abs(upDown.y))+abs(upDown.z))+abs(upDown.w)));
#if defined(SGSR_EDGE_FILE)
			// sgsr1_shader_mobile_edge_direction.frag
			float sumMean = 1.014185e+01/sum;
			float std = (sumMean*sumMean);
#else
			// sgsr1_shader_mobile.frag
			float std = 2.181818/sum;
#endif

#if defined(UseEdgeDirection)
			vec3 data = vec3(std, edgeDirection(left, right));
#else
			float data = std;
#endif
			vec2 aWY = weightY(pl.x, pl.y+1.0, upDown.x,data);
			aWY += weightY(pl.x-1.0, pl.y+1.0, upDown.y,data);
			aWY += weightY(pl.x-1.0, pl.y-2.0, upDown.z,data);
			aWY += weightY(pl.x, pl.y-2.0, upDown.w,data);
			aWY += weightY(pl.x+1.0, pl.y-1.0, left.x,data);
			aWY += weightY(pl.x, pl.y-1.0, left.y,data);
			aWY += weightY(pl.x, pl.y, left.z,data);
			aWY += weightY(pl.x+1.0, pl.y, left.w,data);
			aWY += weightY(pl.x-1.0, pl.y-1.0, right.x,data);
			aWY += weightY(pl.x-2.0, pl.y-1.0, right.y,data);
			aWY += weightY(pl.x-2.0, pl.y, right.z,data);
			aWY += weightY(pl.x-1.0, pl.y, right.w,data);

			float finalY = aWY.y/aWY.x;

			float maxY = max(max(left.y,left.z),max(right.x,right.w));
			float minY = min(min(left.y,left.z),min(right.x,right.w));
			float deltaY = clamp(EdgeSharpness*finalY, minY, maxY) -color.w;

			//smooth high contrast input
			deltaY = clamp(deltaY, -23.0 / 255.0, 23.0 / 255.0);

			color.x = clamp((color.x+deltaY),0.0,1.0);
			color.y = clamp((color.y+deltaY),0.0,1.0);
			color.z = clamp((color.z+deltaY),0.0,1.0);
		}
	}

	color.w = 1.0;  //assume alpha channel is not used
	out_Target0.xyzw = color;
}`;

// variant: 'edge' = sgsr1_shader_mobile_edge_direction.frag with UseEdgeDirection (README: better quality, small extra cost);
//          'base' = sgsr1_shader_mobile.frag (the original)
export class SGSRPass extends Pass {
  constructor({ variant = 'edge', sharpness = SGSR_SHARP_DEFAULT } = {}) {
    super(); this.needsSwap = false; this.clear = false; this.failed = false; this.checked = false; this.timer = null;
    this.uniforms = { ViewportInfo: { value: [new THREE.Vector4(1, 1, 1, 1)] }, ps0: { value: null }, uEdgeSharpness: { value: SGSR_SHARP_DEFAULT } };
    this.mat = new THREE.ShaderMaterial({ name: 'SGSR1', glslVersion: THREE.GLSL3, uniforms: this.uniforms, vertexShader: VS, fragmentShader: FS, depthTest: false, depthWrite: false, toneMapped: false });
    this.quad = new FullScreenQuad(this.mat); this.setVariant(variant); this.setSharpness(sharpness);
  }
  setVariant(v) { const edge = v !== 'base'; const d = this.mat.defines; const want = edge ? { SGSR_EDGE_FILE: '', SGSR_EDGE_DIRECTION: '' } : {};
    if (('SGSR_EDGE_FILE' in d) === edge) return; for (const k of Object.keys(d)) delete d[k]; Object.assign(d, want); this.mat.needsUpdate = true; this.checked = false; this.variant = edge ? 'edge' : 'base'; }
  setSharpness(k) { const x = Number(k); this.uniforms.uEdgeSharpness.value = Number.isFinite(x) ? Math.min(SGSR_SHARP_MAX, Math.max(SGSR_SHARP_MIN, x)) : SGSR_SHARP_DEFAULT; }
  // readBuffer: the internal-resolution frame (linear filtering, clamp to edge: the composer's targets); output: the canvas
  render(renderer, writeBuffer, readBuffer) {
    const T = this.timer; if (T) { T.end(); T.begin('sgsr'); } // GPU time of this pass alone (benchmark: GpuTimer, non-blocking queries)
    const w = readBuffer.width, h = readBuffer.height; this.uniforms.ViewportInfo.value[0].set(1 / w, 1 / h, w, h); this.uniforms.ps0.value = readBuffer.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    if (this.checked) this.quad.render(renderer); else withoutDefer(renderer, () => this.quad.render(renderer)); // the first draw compiles now: a deferred one would leave the canvas black for a frame
    if (T) T.end();
    if (!this.checked) { this.checked = true; const p = renderer.properties.get(this.mat).currentProgram; if (p && p.diagnostics && p.diagnostics.runnable === false) { this.failed = true; console.warn('[SGSR] the upscaling shader did not compile on this GPU — falling back to native rendering', p.diagnostics); } }
  }
  dispose() { this.mat.dispose(); this.quad.dispose(); }
}

