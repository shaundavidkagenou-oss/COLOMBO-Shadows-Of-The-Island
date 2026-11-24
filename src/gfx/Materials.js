// Shared materials. Time of day (night factor) and rain (wetness) drive emissive and roughness.
import { applyWeathering } from './Weathering.js';
import * as THREE from 'three';
import { TEX } from './Textures.js';
import { powerMaterial } from '../world/PowerGrid.js';
import { barkTextures } from './RealTextures.js';
import { applyInteriorMapping, INTERIOR, occupancy, winFlag, syncWindowLayers } from './InteriorMapping.js';
export const MAT = {};
// ---------------------------------------------------------------------------------------------- own material per object type
// 60th request: every kind of object has its OWN material (Texture Studio: select a part, retexture only that part). They start
// as copies of a few base materials (same textures, same values, same shader patches → same GPU program, no extra texture
// memory, identical look); they only differ once someone edits them. ROLE_DEFS = role → [base material, label shown in the
// Studio]. Builders name every part with its role (BuildingGen, GroundBuilder, Props, CityStreets …). Two more kinds of key:
//   'Scope.base'  (e.g. 'Lotus Tower.concrete')   — a landmark's / site's own copy of a base material (MultiBuilder scope)
//   'role@b<id>'  (e.g. 'winFrame@b234')          — ONE building's own copy ("This building only" in the Studio)
// Draw calls: a key only gets its own draw (its own merged mesh / GPU batch) once it is SPLIT. Unsplit parts are merged into
// the draw of the nearest split ancestor (winFrame@b234 → winFrame → paint), which is exactly the old geometry/material/draw
// layout. The Texture Studio splits a key the moment a rule is made for it (World.rebuildForKeys rebuilds the affected
// buildings), and on start the saved rules split their keys before the city is generated. Props, landmarks and the street
// parts that already draw on their own are split from the start (EAGER): that costs no extra draws.
export const ROLE_DEFS = {
  // building shell (base LOD) + rooftop
  bldParapet: ['concrete', 'Building parapets + copings'], bldRoofHut: ['concrete', 'Rooftop stair / lift huts'], bldRoofPlant: ['metal', 'Rooftop plant, tanks + antennas'],
  bldTrim: ['concrete', 'Facade mouldings (cornices, bands, pilasters, crowns)'], bldPlinth: ['concrete', 'Building plinths (wall base course)'],
  bldColumn: ['concrete', 'Building columns + arcade beams'], bldOrnament: ['paint', 'Heritage ornaments (roundels, urns, finials)'],
  balcony: ['concrete', 'Balcony slabs + solid balustrades'], balconyRail: ['metal', 'Balcony steel railings'], planterBox: ['paint', 'Balcony planters'],
  porch: ['concrete', 'Porch roofs + pillars'], porchFloor: ['concrete', 'Porch floors (floor concrete)'],
  acUnit: ['paint', 'AC condenser casings'], acGrille: ['metal', 'AC grilles + wall brackets'], waterTank: ['paint', 'Rooftop water tanks'], tankStand: ['metal', 'Water tank stands'],
  satDish: ['paint', 'Satellite dishes'], downpipe: ['paint', 'Rainwater downpipes + gutters'], meterBox: ['paint', 'Electricity meter boxes + cables'],
  lampBracket: ['metal', 'House lamp brackets'], signBoard: ['concrete', 'Shop sign mounting boards + brackets'], rebar: ['metal', 'Rebar stubs on roofs'],
  // windows (near LOD joinery; the painted windows in the facade are kept by the facade's window layer, see InteriorMapping.js)
  winSurround: ['concrete', 'Window surrounds (reveals, sills, hoods)'], winFrame: ['paint', 'Window frames + glazing bars'], winShutter: ['paint', 'Window shutters (louvres)'],
  winGrill: ['metal', 'Window security grills'],
  // compound walls
  compoundWall: ['concrete', 'Compound / boundary walls'], wallCoping: ['concrete', 'Compound wall copings'],
  // streets
  manholeCover: ['metal', 'Manhole covers (cast iron)'], manholeCollar: ['concrete', 'Manhole concrete collars'], drainGrate: ['metal', 'Kerb drain grates'],
  drainSump: ['paint', 'Drain sumps (dark pit under the grate)'], roadStud: ['paint', 'Road studs'],
  lampPole: ['metal', 'Street lamp poles'], heritageLampPole: ['metal', 'Heritage lamp posts'], utilityPole: ['concrete', 'Concrete utility poles'], transformer: ['metal', 'Pole transformers'],
  signalPole: ['metal', 'Traffic signal poles + heads'], busShelter: ['paint', 'Bus shelters'], bench: ['paint', 'Benches'], pedRailing: ['paint', 'Pedestrian railings'], lakeRailing: ['metal', 'Beira Lake promenade railings'], telecomTower: ['metal', 'Telecom towers + compounds'],
  gate: ['metal', 'Gates'], stall: ['paint', 'Pavement stalls (tables + goods)'], foodCart: ['paint', 'Food carts'], shrine: ['paint', 'Junction shrines'],
  signPost: ['metal', 'Street-name sign posts + frames'], signPostBand: ['paint', 'Sign post banded feet'], litterBin: ['paint', 'Litter bins'], billboardFrame: ['metal', 'Rooftop billboard frames'],
};
const ROLES = new Map(); // key → { base, label } for every copy made (roles, scoped, per building)
const EAGER = ['lakeRailing', 'telecomTower', 'signPost', 'signPostBand', 'litterBin', 'billboardFrame', 'manholeCover', 'manholeCollar', 'drainGrate', 'drainSump', 'roadStud', 'lampPole', 'heritageLampPole', 'utilityPole', 'transformer', 'signalPole', 'busShelter', 'bench', 'pedRailing', 'gate', 'stall', 'foodCart', 'shrine'];
export const SPLIT = new Set(EAGER); // keys drawn with their own material (see above)
export function parentKey(k) { const sp = splitKey(k); return sp ? sp.base : null; }
// the key whose material actually draws part `k` right now
export function effKey(k) { let x = k; for (let i = 0; i < 5; i++) { if (SPLIT.has(x)) return x; const p = parentKey(x); if (!p) return x; x = p; } return x; }
// can `k` get a material of its own? (its root base must be copyable — not the road / foliage / emissive helpers the game checks by identity)
export function splittable(k) { if (!parentKey(k)) return false; let x = k; for (let i = 0; i < 5; i++) { const p = parentKey(x); if (!p) return canCopy(x); x = p; } return false; }
// a building part's key: its role tagged with the building ('winFrame@b234'); MultiBuilder draws it with effKey() of that
export function partKey(role, b) { return b && b.id != null ? role + '@b' + b.id : role; }
export function markSplit(k) { if (SPLIT.has(k) || !parentKey(k)) return false; SPLIT.add(k); return true; }
const NO_COPY = new Set(['road', 'roadTint', 'pool', 'glow', 'ao', 'emissive', 'lampHead', 'leaves', 'leavesBright', 'palm', 'foliage', 'leavesSmall', 'banana', 'bloom']); // identity-checked by game code / universal leaves
export function canCopy(base) { const m = MAT[base]; return !!m && !NO_COPY.has(base) && !m.isShaderMaterial && !m.isSpriteMaterial; }
// a copy that keeps the game's shader patches (onBeforeCompile + program cache key: same program, so no new shader compile)
export function cloneMaterial(src, name) {
  const ud = src.userData; src.userData = {}; let c; try { c = src.clone(); } finally { src.userData = ud; }
  c.userData = Object.assign({}, ud); c.onBeforeCompile = src.onBeforeCompile; c.customProgramCacheKey = src.customProgramCacheKey; if (name) c.name = name;
  return c;
}
// role / scoped / per-building material (made once; `src` = a ready copy to register instead of cloning MAT[base])
export function roleMaterial(key, base, label, src = null) {
  if (MAT[key]) return MAT[key]; if (!src && !canCopy(base)) return MAT[base] || null;
  const m = src || cloneMaterial(MAT[base]); m.name = label || key; MAT[key] = m;
  let root = base; for (let i = 0; i < 4 && ROLES.has(root); i++) root = ROLES.get(root).base;
  ROLES.set(key, { base, root, label: m.name, drive: root.startsWith('f_') || root === 'shops' || root === 'signs' ? ['emissiveIntensity'] : root === 'winGlass' ? ['envMapIntensity'] : null });
  if (root.startsWith('f_') || root === 'shops' || root === 'signs') powerMaterial(m); // 79th: its light follows the district's electricity (a clone loses the define)
  const wt = wetTarget(MAT[base]); if (wt) wetTargets.push([m, wt[1], wt[2]]); // rain response like its base
  if (FACADE_WIN.has(MAT[base])) FACADE_WIN.set(m, FACADE_WIN.get(MAT[base]));
  return m;
}
// base material of a role key ('winFrame' → 'paint', 'Lotus Tower.concrete' → 'concrete', 'f_colonial@b12' → 'f_colonial')
export function splitKey(key) {
  const at = key.lastIndexOf('@b'); if (at > 0 && /^\d+$/.test(key.slice(at + 2))) return { base: key.slice(0, at), building: +key.slice(at + 2) };
  const dot = key.lastIndexOf('.'); if (dot > 0) return { base: key.slice(dot + 1), scope: key.slice(0, dot) };
  if (ROLE_DEFS[key]) return { base: ROLE_DEFS[key][0] };
  return null;
}
export function materialLabel(key) { const r = ROLES.get(key); if (r) return r.label; if (ROLE_DEFS[key]) return ROLE_DEFS[key][1]; if (BASE_LABEL[key]) return BASE_LABEL[key]; const m = MAT[key]; return m && m.name ? m.name : key; }
export function roleInfo(key) { return ROLES.get(key) || null; }
// MAT[key], made on demand for role / scoped / per-building keys (MeshBuilder.meshFor)
export function ensureMat(key) {
  if (MAT[key]) return MAT[key]; const sp = splitKey(key); if (!sp) return null; const base = ensureMat(sp.base); if (!base) return null;
  const label = sp.building != null ? materialLabel(sp.base) + ' — building #' + sp.building + ' only' : sp.scope ? sp.scope + ' · ' + materialLabel(sp.base) : materialLabel(key);
  return roleMaterial(key, sp.base, label);
}
export function roleKeys() { return [...ROLES.keys()]; }
const FACADE_WIN = new Map(); // facade material → its window layer uniforms (copies share them; see InteriorMapping.applyInteriorMapping)
export function facadeWindowLayer(m) { return FACADE_WIN.get(m) || null; } // { uWinMap, uWinRM, normal }: the facade's own painted windows
const facadeKeys = ['colonial', 'brick', 'glass', 'glass2', 'glass3', 'office', 'office2', 'office3', 'hotel', 'shop', 'shop2', 'shop3', 'apartment', 'apartment2', 'villa', 'warehouse'];
const wetTargets = [];
// outdoor materials built elsewhere (modelled forecourt slabs …) join the rain response: white-based maps only (the colour is driven)
// Texture Studio (src/debug/TexRuntime.js): a weather-driven material's entry [m, dryR, wetR, tint?] — its edits change the dry
// roughness / multiply a tint over the weather colour instead of being overwritten every frame
export function wetTarget(m) { return wetTargets.find((t) => t[0] === m) || null; }
export function addWetTarget(m, dryR, wetR) { if (!wetTargets.some((t) => t[0] === m)) wetTargets.push([m, dryR, wetR]); }
// Road glare: on wet asphalt at night every oncoming headlight (a spot light pointed back at the viewer) became a white
// mirror streak between the car and the camera, so bright that bloom turned it into a white halo hiding the car (tested:
// bloom off → car visible behind a streak; beam off → no halo). On road surfaces each spot light's SPECULAR term is capped
// (0.55, below the night bloom threshold of 1.7) and scaled by ROAD_SPOT_SPEC; the wet streak stays, it just never blooms.
// Diffuse light (the lit road ahead) and every other light are untouched. Driven by updateMaterials.
export const ROAD_SPOT_SPEC = { value: 1 };
// Dry asphalt is matte: the roughness map's smoother (puddle-prone) patches only turn glossy once the road is actually wet
// (ROAD_WET follows Atmosphere.wet, which now tracks the rain). Without this a dry road sheened like a wet one toward the sun.
export const ROAD_WET = { value: 0 };
// 63rd: the Road007 asphalt tiles every ROAD_TILE (4 m). Two extra lookups of the SAME albedo (no new texture) at 7.3× and
// 19.6× the tile size, rotated, modulate its brightness by ±~8 %: broad, irregular tonal drift across the carriageway (older /
// newer surfacing, sun-bleached and darker stretches) that hides the 4 m repeat at a distance. Any map the Texture Studio puts
// on the road gets the same treatment (it samples whatever `map` is); without a map nothing changes.
// In the rain the same term varies the wet film: the darker, lower-lying patches hold water (glossier), the lighter ones drain.
const ROAD_MACRO = `#include <map_fragment>
#ifdef USE_MAP
  { vec2 q = vMapUv * 0.137 + vec2( 0.31, 0.17 ); vec2 q2 = mat2( 0.8, -0.6, 0.6, 0.8 ) * vMapUv * 0.051 + vec2( 0.62, 0.05 );
    float a = dot( texture2D( map, q ).rgb, vec3( 0.333 ) ), b = dot( texture2D( map, q2 ).rgb, vec3( 0.333 ) );
    gRoadMacro = ( ( a + b ) * 0.5 - uRoadMapMean ) / max( uRoadMapMean, 0.01 );
    diffuseColor.rgb *= clamp( 1.0 + 0.3 * gRoadMacro, 0.86, 1.12 ); }
#endif
`;
// mean linear brightness of the road albedo (Road007 ≈ 0.075); the macro term is relative to it
export const ROAD_MAP_MEAN = { value: 0.075 };
function roadSpotSpec(m) {
  m.onBeforeCompile = (sh) => { sh.uniforms.uRoadSpotSpec = ROAD_SPOT_SPEC; sh.uniforms.uRoadWet = ROAD_WET; sh.uniforms.uRoadMapMean = ROAD_MAP_MEAN;
    const pars = THREE.ShaderChunk.lights_physical_pars_fragment.replace('reflectedLight.directSpecular += irradiance * specularBRDF * material.multiScatteringCompensation;', 'reflectedLight.directSpecular += min( irradiance * specularBRDF * material.multiScatteringCompensation, vec3( gSpotCap ) ) * gSpotSpec;');
    let beg = THREE.ShaderChunk.lights_fragment_begin; const i = beg.indexOf('#if ( NUM_SPOT_LIGHTS > 0 ) && defined( RE_Direct )'); const call = 'RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );';
    const j = i >= 0 ? beg.indexOf(call, i) : -1; if (j >= 0) beg = beg.slice(0, j) + 'gSpotSpec = uRoadSpotSpec; gSpotCap = 0.55; ' + call + ' gSpotSpec = 1.0; gSpotCap = 1e6;' + beg.slice(j + call.length);
    if (j < 0 || pars === THREE.ShaderChunk.lights_physical_pars_fragment) return; // three changed its chunks: leave the material as it is
    sh.fragmentShader = 'uniform float uRoadSpotSpec;\nuniform float uRoadWet;\nuniform float uRoadMapMean;\nfloat gRoadMacro = 0.0;\nfloat gSpotSpec = 1.0;\nfloat gSpotCap = 1e6;\n' + sh.fragmentShader.replace('#include <lights_physical_pars_fragment>', pars).replace('#include <lights_fragment_begin>', beg)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor = mix( max( roughnessFactor, 0.94 ), roughnessFactor * clamp( 1.0 + 0.9 * gRoadMacro, 0.55, 1.35 ), smoothstep( 0.05, 0.6, uRoadWet ) );')
      .replace('#include <map_fragment>', ROAD_MACRO); };
  m.customProgramCacheKey = () => 'roadSpotSpec5';
}
// Surface relief (Visual upgrade phase 1): tangent-space normal maps baked from each procedural texture's own height field
// (Textures.js heightToNormal). They share the albedo's UVs (and so its tiling / world-space mapping), so every road, wall and
// roof keeps its look and gains depth that reacts to the sun, moon, street lamps and headlights. NORMAL_SCALE is the one place
// the relief is tuned per surface; the geometry needs no tangents (three derives the frame from the UV derivatives).
// 36th Stage 3: the building relief read as embossed plastic at street level (every render bump and moulding lit like a
// relief map). Only the strengths change — same baked maps: facades 1.25 → 0.8, roof tiles 1.15 → 0.85, flat roofs 1 → 0.75,
// corrugated sheet 1 → 0.8, building concrete (trims, boundary walls, plinths) 1 → 0.8. Ground surfaces keep theirs.
export const NORMAL_SCALE = { road: 1.6 /* 63rd: Road007's NormalGL is gentle — this brings its aggregate out in low sun */, walk: 1.2, kerb: 1, concrete: 0.8, sand: 1.6, roofTiles: 0.85, roofFlat: 0.75, corrugated: 0.8, facade: 0.8 };
export function withNormal(m, tex, s) { if (!m || !tex) return m; m.normalMap = tex; m.normalScale = new THREE.Vector2(s, s); m.needsUpdate = true; return m; }
export function buildMaterials() {
  const std = (o) => new THREE.MeshStandardMaterial(o);
  MAT.road = std({ map: TEX.asphalt, roughnessMap: TEX.asphaltRough, roughness: 1, metalness: 0, color: 0xffffff });
  // same asphalt + same world-space UVs as MAT.road, but vertex-tinted: wheel-path polish, oil-stained stop zones and
  // repair patches are real overlay geometry on the carriageway (tone changes only, texture stays continuous)
  MAT.roadTint = std({ map: TEX.asphalt, roughnessMap: TEX.asphaltRough, roughness: 1, metalness: 0, vertexColors: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  roadSpotSpec(MAT.road); roadSpotSpec(MAT.roadTint);
  MAT.walk = std({ map: TEX.pave1, roughness: 0.9, color: 0xffffff }); // 62nd: pavement type 1 — cement flagstones (was brick pavers)
  MAT.walkGrey = std({ map: TEX.pave2, roughness: 0.9 }); // pavement type 2 — grey concrete slabs, running bond
  // 62nd: the short grass growing out of some footpath joints (GroundDetail instances it near the camera); its texture is
  // sampled along each blade (u = tone column, v = root → tip), so a replacement in the Texture Studio recolours every blade
  MAT.paveGrass = std({ map: TEX.jointGrass, roughness: 0.82, side: THREE.DoubleSide });
  MAT.kerb = std({ map: TEX.concrete, roughness: 0.85, vertexColors: true });
  MAT.concrete = applyWeathering(std({ map: TEX.concrete, roughness: 0.9, vertexColors: true }), 'wall'); // compound walls, plinths, trims: faded patches, rising damp (36th Stage 4)
  withNormal(MAT.road, TEX.n_asphalt, NORMAL_SCALE.road); withNormal(MAT.roadTint, TEX.n_asphalt, NORMAL_SCALE.road);
  withNormal(MAT.walk, TEX.n_pave1, NORMAL_SCALE.walk); withNormal(MAT.walkGrey, TEX.n_pave2, NORMAL_SCALE.walk);
  withNormal(MAT.kerb, TEX.n_concrete, NORMAL_SCALE.kerb); withNormal(MAT.concrete, TEX.n_concrete, NORMAL_SCALE.concrete);
  MAT.grass = std({ map: TEX.grass, roughness: 1 });
  MAT.ballast = std({ map: TEX.ballast, roughness: 1, vertexColors: true });
  MAT.lawn = std({ map: TEX.lawn, roughness: 1 });
  MAT.laterite = std({ map: TEX.laterite, roughness: 1 });
  MAT.sand = withNormal(std({ map: TEX.sand, roughness: 1 }), TEX.n_sand, NORMAL_SCALE.sand);
  MAT.rocks = std({ map: TEX.rocks, roughness: 0.95, vertexColors: true });
  // 63rd: road paint = worn thermoplastic over the Road007 asphalt (TEX.roadPaint: the asphalt's pits show through), on the
  // asphalt's own relief (same normal image) and smoother than the asphalt, as the set's roughness map has it for its lines
  MAT.marking = std({ color: 0xf2f2ea, map: TEX.roadPaint || null, roughness: 0.62, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, vertexColors: true });
  if (TEX.n_roadPaint) withNormal(MAT.marking, TEX.n_roadPaint, 0.7);
  for (const k of facadeKeys) {
    const f = TEX['f_' + k];
    MAT['f_' + k] = std({ map: f.map, emissiveMap: f.emissive, emissive: 0xffffff, emissiveIntensity: 0, roughnessMap: f.rm, metalnessMap: f.rm, roughness: 1, metalness: k.startsWith('glass') ? 1 : 1, vertexColors: true, envMapIntensity: k.startsWith('glass') ? 1.0 : 0.8 });
    withNormal(MAT['f_' + k], f.normal, NORMAL_SCALE.facade); // brick courses / mouldings / render; glass held flat in the map
    // windows show parallax rooms with depth (offices: lit floor sections). The window layer keeps the painted windows (glass,
    // frames, shutters + the rooms behind) from the facade's ORIGINAL art, so a new wall texture (Texture Studio) never paints over them
    FACADE_WIN.set(MAT['f_' + k], applyInteriorMapping(MAT['f_' + k], { office: /^(glass|office)/.test(k), win: { map: f.map, rm: f.rm, normal: f.normal } }));
  }
  MAT.shops = std({ map: TEX.shops.map, emissiveMap: TEX.shops.emissive, emissive: 0xffffff, emissiveIntensity: 0.15, roughness: 0.8 });
  // after closing time each shop unit pulls down its own roller shutter (galvanised or painted; ~14% trade late)
  MAT.shops.onBeforeCompile = (sh) => { sh.uniforms.uShut = SHOP_SHUT;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vSWPos;').replace('#include <project_vertex>', '#include <project_vertex>\nvSWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vSWPos; uniform float uShut;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      { float cellU = floor(vMapUv.x * 4.0 + 0.0005); float hs = fract(sin(cellU * 12.9898 + 4.1) * 43758.5453); // one id per shop unit
        float late = step(0.86, hs); float shut = uShut * (1.0 - late); // ~14% (pharmacies, kades, bakeries) trade late
        if (shut > 0.001) {
          float lu = fract(vMapUv.x * 4.0), lv = fract(vMapUv.y * 8.0); // position inside this shop's front (0..1)
          float ry = vSWPos.y / 0.1; float fw = fwidth(ry); float ribRaw = 0.78 + 0.22 * smoothstep(0.3, 0.5, abs(fract(ry) - 0.5));
          float rib = mix(ribRaw, 0.9, smoothstep(0.25, 0.7, fw)); // slats resolve up close, average out far away (no shimmer)
          vec3 sc = hs < 0.5 ? vec3(0.55, 0.57, 0.58) : hs < 0.64 ? vec3(0.2, 0.36, 0.27) : hs < 0.76 ? vec3(0.22, 0.31, 0.46) : vec3(0.47, 0.2, 0.16);
          vec3 col = sc * rib;
          col *= 0.86 + 0.14 * smoothstep(0.0, 0.5, lv); // grime and splash marks towards the pavement
          col *= 1.0 - 0.12 * smoothstep(0.6, 1.0, fract(sin(floor(lu * 23.0) * 78.233 + cellU) * 4375.85)) * (1.0 - lv); // streaks
          float housing = smoothstep(0.86, 0.875, lv); col = mix(col, sc * 0.55, housing); // roller box at the top
          col = mix(col, vec3(0.09), max(step(lu, 0.025), step(0.975, lu))); // steel guide rails at both sides
          col = mix(col, vec3(0.12), step(lv, 0.04)); // bottom bar
          col = mix(col, vec3(0.05), step(0.47, lu) * step(lu, 0.53) * step(0.045, lv) * step(lv, 0.09)); // padlock / hasp
          diffuseColor.rgb = mix(diffuseColor.rgb, col, shut); totalEmissiveRadiance *= 1.0 - shut; } }`); };
  MAT.shops.customProgramCacheKey = () => 'shops-shutter-v3';
  MAT.signs = std({ map: TEX.signs.map, emissiveMap: TEX.signs.emissive, emissive: 0xffffff, emissiveIntensity: 0.05, roughness: 0.6, side: THREE.DoubleSide });
  MAT.roofTiles = applyWeathering(withNormal(std({ map: TEX.roofTiles, roughness: 0.85, vertexColors: true }), TEX.n_roofTiles, NORMAL_SCALE.roofTiles), 'roof'); // lichen / soot blotches across a roof (36th Stage 4)
  MAT.roofFlat = applyWeathering(withNormal(std({ map: TEX.roofConcrete, roughness: 0.95, vertexColors: true }), TEX.n_roofConcrete, NORMAL_SCALE.roofFlat), 'roof');
  MAT.corrugated = withNormal(std({ map: TEX.corrugated, roughness: 0.6, metalness: 0.4, vertexColors: true, side: THREE.DoubleSide }), TEX.n_corrugated, NORMAL_SCALE.corrugated); applyWeathering(MAT.corrugated, 'roof');
  MAT.paint = std({ roughness: 0.75, vertexColors: true });       // generic vertex-coloured props
  MAT.paintDS = std({ roughness: 0.8, vertexColors: true, side: THREE.DoubleSide });
  MAT.metal = std({ roughness: 0.45, metalness: 0.85, vertexColors: true });
  // window panes over painted/interior-mapped glass: black albedo + additive blend = pure Fresnel reflection on top
  MAT.winGlass = std({ color: 0x000000, roughness: 0.06, metalness: 0, envMapIntensity: 2.4, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
  MAT.soil = std({ map: TEX.laterite, color: 0x5e4a3c, roughness: 1 });
  MAT.hedge = std({ map: TEX.hedge, roughness: 0.95, vertexColors: true });
  MAT.glass = std({ color: 0x9fb8c0, roughness: 0.08, metalness: 0.9, envMapIntensity: 1.5, transparent: true, opacity: 0.55 });
  MAT.emissive = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  MAT.lampHead = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xffd9a0, emissiveIntensity: 0, roughness: 0.5 });
  MAT.awning = std({ roughness: 0.8, vertexColors: true, side: THREE.DoubleSide, map: TEX.weave });
  // 88th: ONE leaf material for every tree, shrub, hedge and creeper card — the user's photographic leaf sheet laid out per card
  // by the shader (world/LeafAtlas.js, wind in world/Vegetation.js). 'leavesBright' / 'leavesSmall' / 'foliage' are the same
  // material (the species differences are per-card styles and vertex tints), so the forest draws one leaf batch instead of
  // three and Texture Studio shows a single "Tree leaves" material whose base colour is that image.
  MAT.leaves = std({ map: TEX.leaves, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.72, vertexColors: true });
  if (TEX.leafAtlas) { MAT.leaves.name = 'Tree leaves'; MAT.leavesBright = MAT.foliage = MAT.leaves; }
  else { MAT.leavesBright = std({ map: TEX.leavesBright, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.9, vertexColors: true }); MAT.foliage = MAT.leavesBright; }
  MAT.palm = std({ map: TEX.palm, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.85, vertexColors: true });
  MAT.bark = std({ color: 0x6b5a48, roughness: 1, vertexColors: true });
  // trees / plants (Forest.js): real bark and palm-trunk textures, small-leaf sprigs (creepers, shrubs), banana blades, flowers
  // 35th request: photographic bark (RealTextures.barkTextures): fissured ridges, flaking plates, lichen and damp streaks with a matching
  // tangent normal map. Trunk UVs (TreeShapes.tubeGeo) run once around (u) and h/6 per tile up (v): repeat (2, 0.32) gives ~1.2 m of
  // bark per tile around a 0.3–0.4 m trunk and ~2.4 m up, i.e. undistorted, real-size fissures. Node / no canvas: the old texture.
  const RB = barkTextures();
  if (RB) { for (const t of [RB.map, RB.normal]) t.repeat.set(2, 0.32); MAT.treeBark = std({ map: RB.map, normalMap: RB.normal, normalScale: new THREE.Vector2(2.4, 2.4), color: 0xffffff, roughness: 0.96, vertexColors: true }); }
  else MAT.treeBark = std({ map: TEX.bark, bumpMap: TEX.bark, bumpScale: 2.2, color: 0xf2ece4, roughness: 0.95, vertexColors: true }); // mid grey-brown bark with relief (was ~3 % albedo: read as black sticks)
  MAT.palmBark = std({ map: TEX.palmBark, roughness: 1, vertexColors: true });
  MAT.leavesSmall = TEX.leafAtlas ? MAT.leaves : std({ map: TEX.leavesSmall, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.9, vertexColors: true });
  MAT.banana = std({ map: TEX.banana, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.75, vertexColors: true });
  MAT.bloom = std({ roughness: 0.7, side: THREE.DoubleSide, vertexColors: true });
  // baked contact occlusion: gradient geometry at wall bases / along their footings, multiplied over what is already drawn
  // (darkens only, never lightens; no fog so distant facades are not tinted)
  MAT.ao = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.MultiplyBlending, premultipliedAlpha: true, depthWrite: false, fog: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  MAT.pool = new THREE.MeshBasicMaterial({ map: TEX.pool, color: 0xffc98a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  MAT.glow = new THREE.SpriteMaterial({ map: TEX.glow, color: 0xffd7a0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 });
  wetTargets.push([MAT.road, 1.0, 0.18], [MAT.roadTint, 0.95, 0.14], [MAT.walk, 0.9, 0.35], [MAT.walkGrey, 0.9, 0.35], [MAT.kerb, 0.85, 0.4], [MAT.concrete, 0.9, 0.45], [MAT.roofFlat, 0.95, 0.5]);
  for (const k of facadeKeys) powerMaterial(MAT['f_' + k]); for (const k of ['shops', 'signs', 'lampHead']) powerMaterial(MAT[k]); powerMaterial(MAT.pool, true); // 79th: lit windows, shop fronts, signs, lamp heads and lamp pools go dark with their district (PowerGrid)
  for (const [k, [base, label]] of Object.entries(ROLE_DEFS)) roleMaterial(k, base, label); // every object type's own material
  for (const k of ['concrete', 'metal', 'paint', 'awning', 'roofTiles', 'roofFlat', 'corrugated', 'shops', 'signs', 'winGlass', 'kerb', 'walk', 'walkGrey', 'paveGrass', 'road', 'roadTint', 'marking', 'treeBark', 'palmBark', 'leaves', 'leavesBright', 'palm']) if (MAT[k] && !MAT[k].name) MAT[k].name = BASE_LABEL[k];
  for (const k of facadeKeys) MAT['f_' + k].name = 'Building walls · ' + k + ' facade';
  return MAT;
}
const BASE_LABEL = { concrete: 'Concrete', metal: 'Metal', paint: 'Painted surfaces', awning: 'Awnings', roofTiles: 'Clay tile roofs', roofFlat: 'Flat concrete roofs', corrugated: 'Corrugated sheet roofs', shops: 'Shop fronts', signs: 'Shop signs', winGlass: 'Window glass (reflection)',
  kerb: 'Kerbs', walk: 'Pavement type 1 · cement flagstones', walkGrey: 'Pavement type 2 · grey concrete slabs', paveGrass: 'Pavement joint grass', road: 'Road asphalt', roadTint: 'Road wear overlay', marking: 'Road markings', treeBark: 'Tree bark', palmBark: 'Palm trunks',
  leaves: 'Tree leaves', leavesBright: 'Leaves, bright (universal)', palm: 'Palm fronds (universal)' };
const SHOP_SHUT = { value: 0 };
const _dry = new THREE.Color(1, 1, 1), _wet = new THREE.Color(0.62, 0.62, 0.64);
export function updateMaterials(night, wet, t) {
  const n = night;
  for (const k of facadeKeys) MAT['f_' + k].emissiveIntensity = n * 1.25;
  for (const [m, W] of FACADE_WIN) winFlag(m).value = m.normalMap === W.normal ? 0 : 1; // window layer: painted windows stay flat under a replaced normal map
  syncWindowLayers(); // a wall texture swapped in (Texture Studio) re-links the window layer's samplers (InteriorMapping.winOwn)
  for (const [k, R] of ROLES) { const d = R.drive; if (!d) continue; const m = MAT[k], b = MAT[R.base]; if (m && b) for (const p of d) m[p] = b[p]; } // copies follow the night / weather values the game drives on their base
  INTERIOR.uIntDay.value = (1 - n) * 0.24; INTERIOR.uIntNight.value = n * 0.8; INTERIOR.uOcc.value = occupancy(t ?? 21); INTERIOR.uITime.value = performance.now() / 1000;
  // shop fronts are lit while trading (until ~9 pm, shutters down by 10:30) and dark until early morning; illuminated
  // signboards stay on but many are switched off after midnight
  const h = t ?? 12, open = h >= 21 ? Math.max(0, 1 - (h - 21) / 1.5) : h < 6.5 ? 0 : Math.min(1, (h - 6.5) / 0.75), late = h >= 0.5 && h < 5.5 ? 0.45 : 1;
  MAT.shops.emissiveIntensity = 0.12 + n * 0.75; // closed shops go dark in the shader (per shop), late traders stay lit
  SHOP_SHUT.value = 1 - open;
  MAT.signs.emissiveIntensity = 0.04 + n * 1.3 * late;
  MAT.lampHead.emissiveIntensity = n * 3.0;
  if (MAT.winGlass) MAT.winGlass.envMapIntensity = 2.4 * (1 - 0.85 * n); // a dark night sky barely reflects: panes show the room behind (lit or dark) instead of a uniform sky sheen
  MAT.pool.opacity = n * 0.55;
  MAT.glow.opacity = n * 0.9;
  // wet roads at night: a film of water on real asphalt is not a mirror (the texture breaks it up); at 0.18 every oncoming
  // headlight smeared into a long white streak that hid the car behind it. Night keeps the wet look (darker, glossier)
  // but with a broader, dimmer highlight.
  for (const t of wetTargets) { const [m, dryR, wetR] = t; const wr = m === MAT.road || m === MAT.roadTint ? wetR + (0.26 - wetR) * n : wetR; m.roughness = dryR + (wr - dryR) * wet; m.color.copy(_dry).lerp(_wet, wet * 0.8); if (t[3]) m.color.multiply(t[3]); m.envMapIntensity = (0.6 + wet * 1.6) * (1 - 0.45 * n); if (m === MAT.road || m === MAT.roadTint) m.envMapIntensity = (0.3 + wet * 1.9) * (1 - 0.45 * n); }
  ROAD_WET.value = wet;
  ROAD_SPOT_SPEC.value = 1 - 0.45 * Math.min(1, wet * 1.5) * n - 0.2 * (1 - Math.min(1, wet * 1.5)) * n; // wet night 0.55, dry night 0.8, day 1 (and every spot highlight on the road capped below the bloom threshold, see roadSpotSpec)
}
