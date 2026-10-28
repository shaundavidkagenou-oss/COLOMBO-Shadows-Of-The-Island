// Shared materials. Time of day (night factor) and rain (wetness) drive emissive and roughness.
import * as THREE from 'three';
import { TEX } from './Textures.js';
import { applyInteriorMapping, INTERIOR } from './InteriorMapping.js';
export const MAT = {};
const facadeKeys = ['colonial', 'brick', 'glass', 'glass2', 'office', 'hotel', 'shop', 'shop2', 'apartment', 'villa', 'warehouse'];
const wetTargets = [];
export function buildMaterials() {
  const std = (o) => new THREE.MeshStandardMaterial(o);
  MAT.road = std({ map: TEX.asphalt, roughnessMap: TEX.asphaltRough, roughness: 1, metalness: 0, color: 0xffffff });
  MAT.walk = std({ map: TEX.pavers, roughness: 0.9, color: 0xffffff });
  MAT.walkGrey = std({ map: TEX.paversGrey, roughness: 0.9 });
  MAT.kerb = std({ map: TEX.concrete, roughness: 0.85, vertexColors: true });
  MAT.concrete = std({ map: TEX.concrete, roughness: 0.9, vertexColors: true });
  MAT.grass = std({ map: TEX.grass, roughness: 1 });
  MAT.ballast = std({ map: TEX.ballast, roughness: 1, vertexColors: true });
  MAT.lawn = std({ map: TEX.lawn, roughness: 1 });
  MAT.laterite = std({ map: TEX.laterite, roughness: 1 });
  MAT.sand = std({ map: TEX.sand, roughness: 1 });
  MAT.rocks = std({ map: TEX.rocks, roughness: 0.95, vertexColors: true });
  MAT.marking = std({ color: 0xf2f2ea, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, vertexColors: true });
  for (const k of facadeKeys) {
    const f = TEX['f_' + k];
    MAT['f_' + k] = std({ map: f.map, emissiveMap: f.emissive, emissive: 0xffffff, emissiveIntensity: 0, roughnessMap: f.rm, metalnessMap: f.rm, roughness: 1, metalness: k.startsWith('glass') ? 1 : 1, vertexColors: true, envMapIntensity: k.startsWith('glass') ? 1.0 : 0.8 });
    applyInteriorMapping(MAT['f_' + k]); // windows show parallax rooms with depth
  }
  MAT.shops = std({ map: TEX.shops.map, emissiveMap: TEX.shops.emissive, emissive: 0xffffff, emissiveIntensity: 0.15, roughness: 0.8 });
  MAT.signs = std({ map: TEX.signs.map, emissiveMap: TEX.signs.emissive, emissive: 0xffffff, emissiveIntensity: 0.05, roughness: 0.6, side: THREE.DoubleSide });
  MAT.roofTiles = std({ map: TEX.roofTiles, roughness: 0.85, vertexColors: true });
  MAT.roofFlat = std({ map: TEX.roofConcrete, roughness: 0.95, vertexColors: true });
  MAT.corrugated = std({ map: TEX.corrugated, roughness: 0.6, metalness: 0.4, vertexColors: true, side: THREE.DoubleSide });
  MAT.paint = std({ roughness: 0.75, vertexColors: true });       // generic vertex-coloured props
  MAT.paintDS = std({ roughness: 0.8, vertexColors: true, side: THREE.DoubleSide });
  MAT.metal = std({ roughness: 0.45, metalness: 0.85, vertexColors: true });
  MAT.glass = std({ color: 0x9fb8c0, roughness: 0.08, metalness: 0.9, envMapIntensity: 1.5, transparent: true, opacity: 0.55 });
  MAT.emissive = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  MAT.lampHead = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xffd9a0, emissiveIntensity: 0, roughness: 0.5 });
  MAT.awning = std({ roughness: 0.8, vertexColors: true, side: THREE.DoubleSide, map: TEX.weave });
  MAT.leaves = std({ map: TEX.leaves, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.9, vertexColors: true });
  MAT.leavesBright = std({ map: TEX.leavesBright, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.9, vertexColors: true });
  MAT.palm = std({ map: TEX.palm, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.85, vertexColors: true });
  MAT.bark = std({ color: 0x6b5a48, roughness: 1, vertexColors: true });
  MAT.pool = new THREE.MeshBasicMaterial({ map: TEX.pool, color: 0xffc98a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  MAT.glow = new THREE.SpriteMaterial({ map: TEX.glow, color: 0xffd7a0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 });
  wetTargets.push([MAT.road, 1.0, 0.18], [MAT.walk, 0.9, 0.35], [MAT.walkGrey, 0.9, 0.35], [MAT.kerb, 0.85, 0.4], [MAT.concrete, 0.9, 0.45], [MAT.roofFlat, 0.95, 0.5]);
  return MAT;
}
const _dry = new THREE.Color(1, 1, 1), _wet = new THREE.Color(0.62, 0.62, 0.64);
export function updateMaterials(night, wet, t) {
  const n = night;
  for (const k of facadeKeys) MAT['f_' + k].emissiveIntensity = n * 1.25;
  INTERIOR.uIntDay.value = (1 - n) * 0.24; INTERIOR.uIntNight.value = n * 0.8;
  MAT.shops.emissiveIntensity = 0.12 + n * 0.75;
  MAT.signs.emissiveIntensity = 0.04 + n * 1.3;
  MAT.lampHead.emissiveIntensity = n * 3.0;
  MAT.pool.opacity = n * 0.55;
  MAT.glow.opacity = n * 0.9;
  for (const [m, dryR, wetR] of wetTargets) { m.roughness = dryR + (wetR - dryR) * wet; m.color.copy(_dry).lerp(_wet, wet * 0.8); m.envMapIntensity = 0.6 + wet * 1.6; }
}
