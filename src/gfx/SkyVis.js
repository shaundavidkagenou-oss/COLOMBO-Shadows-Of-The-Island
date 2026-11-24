// 79th request — location-sensitive daylight ("narrow streets in shadow, open roads sunlit, darker covered walkways, light
// broken under trees, sunlit rooftops").
//
// Why the day looked flat: every outdoor surface got the SAME indirect light — one hemisphere light and one sky environment
// map (PMREM), at full strength, whether it stood on an open seafront or at the bottom of a 6 m Pettah lane between five-storey
// blocks. Only the sun's shadow map varied, so a shaded lane read as bright as an open road and the image went uniform grey.
//
// What this does: the city is static, so how much of the sky a spot sees is baked ONCE from the city plan (no runtime cost on
// the CPU) into a small map, 2 m per texel over the whole city (770 × 1390, RGBA8 ≈ 4 MB of GPU memory):
//   R  sky-view factor of the surface (fraction of the sky's irradiance a horizontal surface there receives — buildings,
//      landmark volumes, tree crowns at half density, Fort arcade roofs)
//   G  the height (×64 m) over which that occlusion fades out going up (the street's canyon height / the crown / arcade top)
//   B  the surface height (×127.5 m: building roof or ground), 255 = an interior with its own lighting (left untouched)
// and every lit material (standard / physical / lambert / phong — patched once through three's shader chunks, no per-material
// work and no extra uniforms to set per draw) scales its INDIRECT light (hemisphere + ambient + environment irradiance, and part
// of the environment reflection) by it, per pixel: two texture reads and a few ALU ops. The sun is never touched — its
// visibility already comes from the shadow maps — so sunlit patches in a lane stay as bright as on an open road while the
// shade around them is properly darker (real sun-vs-shade contrast instead of raising or lowering the ambient everywhere).
// Walls sample the map 1.2 m in front of themselves (the street they face), so a lane facade darkens at its foot and opens up
// toward the eaves, rooftops see the full sky.
//
// Uniform sharing: three clones a built-in material's uniforms from ShaderLib at compile time. Typed arrays are copied by
// reference (so the Float32Array parameters below are live for every material), textures are cloned but share one Source —
// so the map is created at import with its final size, filled in place by build(), and re-uploaded once into the shared GL
// texture (renderer.initTexture) — materials compiled before or after see the same data.
import * as THREE from 'three';
import { BOUNDS } from '../world/Layout.js';

export const SKYVIS = { cell: 2, pad: 40, floor: 0.3, spec: 0.65, enabled: true,
  dirs: 8, steps: [1.2, 2.6, 4.4, 6.8, 9.8, 13.5, 18.5, 26, 36, 50], treeDensity: 0.5, coverK: 0.82 };
const C = SKYVIS.cell, X0 = BOUNDS.minX - SKYVIS.pad, Z0 = BOUNDS.minZ - SKYVIS.pad;
const NX = Math.ceil((BOUNDS.maxX + SKYVIS.pad - X0) / C), NZ = Math.ceil((BOUNDS.maxZ + SKYVIS.pad - Z0) / C);
const DATA = new Uint8Array(NX * NZ * 4); for (let i = 0; i < NX * NZ; i++) DATA[i * 4] = 255; // open sky until built
export const skyVisTex = new THREE.DataTexture(DATA, NX, NZ, THREE.RGBAFormat, THREE.UnsignedByteType);
skyVisTex.magFilter = THREE.LinearFilter; skyVisTex.minFilter = THREE.LinearFilter; skyVisTex.generateMipmaps = false; skyVisTex.colorSpace = THREE.NoColorSpace; skyVisTex.needsUpdate = true; skyVisTex.name = 'skyVis';
// [enabled, specular share, floor, -], [x0, z0, 1/(NX·C), 1/(NZ·C)], [NX, NZ, ground y, -]
export const SV_P = new Float32Array([0, SKYVIS.spec, SKYVIS.floor, 0]);
const SV_O = new Float32Array([X0, Z0, 1 / (NX * C), 1 / (NZ * C)]), SV_S = new Float32Array([NX, NZ, 0.15, 0]);
export const SKYVIS_STATS = { ms: 0, cells: NX * NZ, built: false, avgGround: 0, minGround: 1, w: NX, h: NZ };

// ---------------------------------------------------------------------------------------------------------- shader chunks
{ const S = THREE.ShaderChunk, L = THREE.ShaderLib;
  const DECL = '\nuniform sampler2D uSkyVisMap; uniform vec4 uSkyVisP, uSkyVisO, uSkyVisS;\n';
  const CODE = `
if ( uSkyVisP.x > 0.5 ) {
  vec3 svW = cameraPosition + ( vec4( -vViewPosition, 0.0 ) * viewMatrix ).xyz; vec3 svN = ( vec4( normal, 0.0 ) * viewMatrix ).xyz;
  vec2 svUV = ( svW.xz + svN.xz * 1.2 - uSkyVisO.xy ) * uSkyVisO.zw;
  vec4 sv = texture2D( uSkyVisMap, svUV ); ivec2 svI = clamp( ivec2( svUV * uSkyVisS.xy ), ivec2( 0 ), ivec2( uSkyVisS.xy ) - 1 );
  float svB = texelFetch( uSkyVisMap, svI, 0 ).b; float svH = svW.y - uSkyVisS.z - svB * 127.5;
  float svV = mix( sv.r, 1.0, smoothstep( 0.0, max( 1.5, sv.g * 64.0 ), svH ) );
  svV = ( svB > 0.995 || svH < -1.2 ) ? 1.0 : svV; // an interior / under a roof: its own lighting decides
  float svK = mix( uSkyVisP.z, 1.0, svV );
  irradiance *= svK; iblIrradiance *= svK;
#if defined( RE_IndirectSpecular )
  radiance *= mix( 1.0, svK, uSkyVisP.y );
#endif
}
`;
  if (S.lights_pars_begin.includes('uSkyVisMap') === false) S.lights_pars_begin = DECL + S.lights_pars_begin;
  if (S.lights_fragment_end.includes('svK') === false) S.lights_fragment_end = CODE + S.lights_fragment_end;
  for (const k of ['standard', 'physical', 'lambert', 'phong', 'toon']) if (L[k]) Object.assign(L[k].uniforms, { uSkyVisMap: { value: skyVisTex }, uSkyVisP: { value: SV_P }, uSkyVisO: { value: SV_O }, uSkyVisS: { value: SV_S } });
}
export function setSkyVisEnabled(on) { SKYVIS.enabled = !!on; SV_P[0] = on && SKYVIS_STATS.built ? 1 : 0; }

// ---------------------------------------------------------------------------------------------------------------- the bake
// buildings: plan.buildings ({x0,x1,z0,z1,h, tower:{inset}, totalH, colonnade}); boxes: extra solid volumes (landmark / hospital
// colliders {x0,x1,z0,z1,h,y0}); trees: plan.trees ({type,x,z,s,sq,sy}) with crown(type) → {r, top, base}; exempt: rects
// [x0,x1,z0,z1] of buildings with their own interior lighting; arcades: [{a:[x,z], b:[x,z], n:[nx,nz]}]; groundY: land height.
export async function buildSkyVis({ buildings, boxes = [], trees = [], crown, exempt = [], arcades = [], groundY = 0.15, renderer = null, yieldFn = null }) {
  const t0 = performance.now(), N = NX * NZ; SV_S[2] = groundY;
  const H = new Float32Array(N).fill(groundY), T = new Float32Array(N).fill(-1), TB = new Float32Array(N), CV = new Float32Array(N), CT = new Float32Array(N), EX = new Uint8Array(N);
  const rect = (x0, x1, z0, z1, fn) => { const i0 = Math.max(0, Math.ceil((x0 - X0) / C - 0.5)), i1 = Math.min(NX - 1, Math.floor((x1 - X0) / C - 0.5)), k0 = Math.max(0, Math.ceil((z0 - Z0) / C - 0.5)), k1 = Math.min(NZ - 1, Math.floor((z1 - Z0) / C - 0.5));
    for (let k = k0; k <= k1; k++) for (let i = i0; i <= i1; i++) fn(k * NX + i); };
  for (const b of buildings) { if (!(b.h > 0)) continue; const top = groundY + b.h; rect(b.x0, b.x1, b.z0, b.z1, (o) => { if (top > H[o]) H[o] = top; });
    if (b.tower && b.totalH > b.h) { const t = b.tower.inset || 0, tt = groundY + b.totalH; rect(b.x0 + t, b.x1 - t, b.z0 + t, b.z1 - t, (o) => { if (tt > H[o]) H[o] = tt; }); } }
  for (const c of boxes) { if (!(c.h - (c.y0 || 0) > 2.5) || (c.x1 - c.x0) * (c.z1 - c.z0) < 1.5 || c.kind === 'tree' || c.kind === 'pole') continue; rect(c.x0, c.x1, c.z0, c.z1, (o) => { if (c.h > H[o]) H[o] = c.h; }); }
  for (const e of exempt) rect(e[0], e[1], e[2], e[3], (o) => { EX[o] = 1; });
  // tree crowns: canopy top / base and cover (soft round edge)
  for (const t of trees) { const cr = crown(t.type); if (!cr) continue; const s = t.s || 1, sq = t.sq || 1, sy = t.sy || 1, r = cr.r * s * sq, top = groundY + cr.top * s * sy, base = groundY + cr.base * s * sy;
    const i0 = Math.max(0, Math.floor((t.x - r - X0) / C)), i1 = Math.min(NX - 1, Math.ceil((t.x + r - X0) / C)), k0 = Math.max(0, Math.floor((t.z - r - Z0) / C)), k1 = Math.min(NZ - 1, Math.ceil((t.z + r - Z0) / C));
    for (let k = k0; k <= k1; k++) for (let i = i0; i <= i1; i++) { const dx = X0 + (i + 0.5) * C - t.x, dz = Z0 + (k + 0.5) * C - t.z, d = Math.hypot(dx, dz) / r; if (d > 1) continue; const o = k * NX + i;
      const cov = Math.min(1, (1 - d * d) * 1.4); if (cov > CV[o]) { CV[o] = cov; CT[o] = Math.max(CT[o], top); } if (top > T[o]) { T[o] = top; TB[o] = base; } } }
  // Fort arcades: the 1.4 m verandah roof in front of the facade (cells on the street side of the columns)
  for (const a of arcades) { const len = Math.hypot(a.b[0] - a.a[0], a.b[1] - a.a[1]), n = Math.max(1, Math.ceil(len / (C * 0.5)));
    for (let q = 0; q <= n; q++) for (const off of [0.35, 0.9]) { const x = a.a[0] + (a.b[0] - a.a[0]) * q / n + a.n[0] * off, z = a.a[1] + (a.b[1] - a.a[1]) * q / n + a.n[1] * off;
      const i = Math.floor((x - X0) / C), k = Math.floor((z - Z0) / C); if (i < 0 || k < 0 || i >= NX || k >= NZ) continue; const o = k * NX + i; if (H[o] > groundY + 0.5) continue; CV[o] = Math.max(CV[o], 1); CT[o] = Math.max(CT[o], groundY + 4.6); } }
  // horizon scan: for each cell, from its surface, the highest obstruction angle in SKYVIS.dirs azimuths; sky irradiance on a
  // horizontal surface from above elevation θ is ∝ cos²θ — averaged over the azimuths; trees count at treeDensity
  const D = SKYVIS.dirs, ST = SKYVIS.steps, dxs = new Float32Array(D), dzs = new Float32Array(D); for (let j = 0; j < D; j++) { const a = (j + 0.5) / D * Math.PI * 2; dxs[j] = Math.cos(a); dzs[j] = Math.sin(a); }
  const td = SKYVIS.treeDensity, out = DATA; let gsum = 0, gn = 0, gmin = 1;
  for (let k = 0; k < NZ; k++) {
    for (let i = 0; i < NX; i++) { const o = k * NX + i, d4 = o * 4;
      if (EX[o]) { out[d4] = 255; out[d4 + 1] = 0; out[d4 + 2] = 255; out[d4 + 3] = 255; continue; }
      const y = H[o], isRoof = y > groundY + 0.5; let sum = 0, hsum = 0;
      for (let j = 0; j < D; j++) { let sB = 0, sT = 0, hm = 0; const ux = dxs[j], uz = dzs[j];
        for (let q = 0; q < ST.length; q++) { const d = ST[q] / C; const ii = (i + ux * d + 0.5) | 0, kk = (k + uz * d + 0.5) | 0; if (ii < 0 || kk < 0 || ii >= NX || kk >= NZ) break; const p = kk * NX + ii;
          const dh = H[p] - y; if (dh > 0) { const s2 = (dh * dh) / (dh * dh + ST[q] * ST[q]); if (s2 > sB) sB = s2; if (ST[q] < 30 && dh > hm) hm = dh; }
          const th = T[p] - y; if (th > 0 && !isRoof) { const s2 = (th * th) / (th * th + ST[q] * ST[q]); if (s2 > sT) sT = s2; } }
        sum += 1 - Math.max(sB, td * sT); hsum += hm; }
      let v = sum / D, hc = (hsum / D) * 0.9;
      if (!isRoof && CV[o] > 0) { v *= 1 - SKYVIS.coverK * CV[o] * (CT[o] > groundY + 4.7 ? 0.62 : 1); hc = Math.max(hc, CT[o] - groundY); } // under a crown (leaf gaps) / an arcade roof
      out[d4] = Math.round(Math.max(0, Math.min(1, v)) * 255); out[d4 + 1] = Math.round(Math.min(1, hc / 64) * 255); out[d4 + 2] = Math.round(Math.min(254, (y - groundY) / 127.5 * 255)); out[d4 + 3] = 255;
      if (!isRoof) { gsum += v; gn++; if (v < gmin) gmin = v; } }
    if (yieldFn && (k & 127) === 127) await yieldFn();
  }
  skyVisTex.needsUpdate = true; if (renderer && renderer.initTexture) renderer.initTexture(skyVisTex);
  Object.assign(SKYVIS_STATS, { ms: Math.round(performance.now() - t0), built: true, avgGround: +(gsum / Math.max(1, gn)).toFixed(3), minGround: +gmin.toFixed(3) });
  SV_P[0] = SKYVIS.enabled ? 1 : 0; return SKYVIS_STATS;
}
// CPU mirror of the shader (tests / probes): the factor the indirect light gets at a world point with normal n
export function skyVisAt(x, y, z, nx = 0, nz = 0) {
  const u = (x + nx * 1.2 - X0) / (NX * C), v = (z + nz * 1.2 - Z0) / (NZ * C); const i = Math.min(NX - 1, Math.max(0, Math.floor(u * NX))), k = Math.min(NZ - 1, Math.max(0, Math.floor(v * NZ))); const o = (k * NX + i) * 4;
  const B = DATA[o + 2] / 255, h = y - SV_S[2] - B * 127.5; if (B > 0.995 || h < -1.2) return 1;
  const r = DATA[o] / 255, g = DATA[o + 1] / 255 * 64, t = Math.min(1, Math.max(0, h / Math.max(1.5, g))), sm = t * t * (3 - 2 * t); const vis = r + (1 - r) * sm;
  return SKYVIS.floor + (1 - SKYVIS.floor) * vis;
}
