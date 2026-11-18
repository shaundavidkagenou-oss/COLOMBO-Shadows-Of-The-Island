// Shared editing core of the model tools (68th) — used by the runtime (built game) and the tools (dev):
//   parts        per mesh / per material-slot edits of a built object: hide, colour, texture (any image of the pack), normal /
//                roughness maps, roughness, metalness, glow, opacity, UV tiling / offset / rotation
//   replacement  an uploaded model shown instead of (or as well as) an object's own meshes, with its own transform, part edits
//                and animation clips
//   garments     hero clothing textures: a texture / colour per garment of the protagonists' one-piece body (HeroBody CLOTH ids)
// Original materials are never changed: an edited slot gets a clone (shared between objects with the same edit) and the
// original stays on mesh.userData.__origMat for "Restore".
import * as THREE from 'three';
import { loadTexture, loadAsset, readyAsset } from './ModelPack.js';

export const HIDDEN = (() => { const m = new THREE.MeshBasicMaterial(); m.visible = false; m.name = '__hidden'; return m; })();
export const PART_PROPS = ['hide', 'color', 'map', 'normalMap', 'roughnessMap', 'emissiveMap', 'alphaMap', 'roughness', 'metalness', 'emissive', 'emissiveIntensity', 'opacity', 'repeat', 'offset', 'rotation', 'flipY', 'side', 'wireframe', 'flat'];
const TEX_SLOTS = ['map', 'normalMap', 'roughnessMap', 'emissiveMap', 'alphaMap'];

// stable key of a mesh inside a built object: names / child indices from the root ("body/3/glass")
export function pathOf(o, root) { const p = []; for (let x = o; x && x !== root; x = x.parent) { const par = x.parent; const i = par ? par.children.indexOf(x) : 0; p.push(x.name ? x.name.replace(/[/@|]/g, '_') + (dupName(par, x) ? '~' + i : '') : '#' + i); } return p.reverse().join('/'); }
const dupName = (par, x) => !!par && par.children.some((c) => c !== x && c.name === x.name);
export const matsOf = (o) => (Array.isArray(o.material) ? o.material : o.material ? [o.material] : []);
// every editable mesh + its slots; skip: our own helpers, hidden-for-replacement meshes
export function listParts(root, { skip = null } = {}) {
  const out = []; root.updateMatrixWorld(true);
  root.traverse((o) => { if (!(o.isMesh || o.isSkinnedMesh || o.isLine || o.isPoints) || o.userData.__helper) return; if (skip && skip(o)) return; for (let p = o.parent; p && p !== root; p = p.parent) if (p.userData.__replacement && !(skip && skip.inReplacement)) return;
    const orig = o.userData.__origMat || o.material; const ms = Array.isArray(orig) ? orig : [orig];
    ms.forEach((m, i) => out.push({ key: pathOf(o, root) + (ms.length > 1 ? '@' + i : ''), mesh: o, slot: i, mat: m, matName: (m && m.name) || '', label: (o.name || o.parent?.name || 'mesh') + (ms.length > 1 ? ' · slot ' + i : '') + (m && m.name ? ' · ' + m.name : '') })); });
  return out;
}
// which edit applies to a part: exact part key > its mesh (all slots) > its material name ('m:<name>') > its mesh name ('n:<name>')
export function editFor(parts, key, mesh, mat) {
  if (!parts) return null; const base = key.split('@')[0];
  return parts['p:' + key] || (key !== base && parts['p:' + base]) || (mat && mat.name && parts['m:' + mat.name]) || (mesh.name && parts['n:' + mesh.name]) || null;
}
const CLONES = new Map(); // orig.uuid + edit → clone (cars of one type share their edited materials)
function editedMat(orig, e, tex) {
  if (!orig) return orig; if (e.hide) return HIDDEN;
  const key = orig.uuid + '|' + JSON.stringify(e) + '|' + TEX_SLOTS.map((s) => (tex[s] ? tex[s].uuid : '')).join(','); let m = CLONES.get(key); if (m) return m;
  m = orig.clone(); m.name = orig.name; m.userData = Object.assign({}, orig.userData, { __editedFrom: orig.uuid });
  if (orig.onBeforeCompile && orig.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile) { m.onBeforeCompile = orig.onBeforeCompile; m.customProgramCacheKey = orig.customProgramCacheKey; }
  if (e.color && m.color) m.color.set(e.color);
  if (e.roughness != null && 'roughness' in m) m.roughness = +e.roughness; if (e.metalness != null && 'metalness' in m) m.metalness = +e.metalness;
  if (e.emissive && m.emissive) m.emissive.set(e.emissive); if (e.emissiveIntensity != null && 'emissiveIntensity' in m) m.emissiveIntensity = +e.emissiveIntensity;
  if (e.opacity != null) { m.opacity = +e.opacity; m.transparent = m.opacity < 1 || orig.transparent; m.depthWrite = m.opacity >= 1 ? orig.depthWrite : false; }
  if (e.side != null) m.side = +e.side; if (e.wireframe != null && 'wireframe' in m) m.wireframe = !!e.wireframe; if (e.flat != null && 'flatShading' in m) m.flatShading = !!e.flat;
  for (const s of TEX_SLOTS) { if (!(s in e) || !(s in m)) continue; const t = tex[s] || null; m[s] = t; if (s === 'alphaMap' && t) m.transparent = true; }
  for (const s of TEX_SLOTS) { const t = m[s]; if (!t || !(e.repeat || e.offset || e.rotation != null)) continue; const c = t.userData.__edClone && t.userData.__edKey === JSON.stringify([e.repeat, e.offset, e.rotation]) ? t : t.clone(); c.userData = { __edClone: true, __edKey: JSON.stringify([e.repeat, e.offset, e.rotation]) }; c.wrapS = c.wrapT = THREE.RepeatWrapping; if (e.repeat) c.repeat.set(+e.repeat[0] || 1, +e.repeat[1] || 1); if (e.offset) c.offset.set(+e.offset[0] || 0, +e.offset[1] || 0); if (e.rotation != null) { c.center.set(0.5, 0.5); c.rotation = THREE.MathUtils.degToRad(+e.rotation || 0); } c.needsUpdate = true; m[s] = c; }
  m.needsUpdate = true; CLONES.set(key, m); return m;
}
async function texturesFor(e) {
  const out = {}; await Promise.all(TEX_SLOTS.map(async (s) => { if (!e[s]) return; try { out[s] = await loadTexture(e[s], { color: s === 'map' || s === 'emissiveMap', flipY: e.flipY ?? null }); } catch (err) { console.warn('[model tools] texture', e[s], err); } }));
  return out;
}
// apply part edits to a built object (sync for everything but textures; textures arrive when loaded unless preloaded)
export async function applyParts(root, parts, { skip = null } = {}) {
  if (!parts || !Object.keys(parts).length) return 0; let n = 0; const jobs = [];
  for (const p of listParts(root, { skip })) {
    const e = editFor(parts, p.key, p.mesh, p.mat); if (!e) continue; n++;
    jobs.push(texturesFor(e).then((tex) => setSlot(p.mesh, p.slot, editedMat(p.mat, e, tex))));
  }
  await Promise.all(jobs); return n;
}
export function setSlot(mesh, slot, mat) {
  if (!mesh.userData.__origMat) mesh.userData.__origMat = Array.isArray(mesh.material) ? mesh.material.slice() : mesh.material;
  if (Array.isArray(mesh.material)) { const a = mesh.material.slice(); a[slot] = mat; mesh.material = a; } else mesh.material = mat;
}
export function resetParts(root) { root.traverse((o) => { if (o.userData.__origMat) { o.material = o.userData.__origMat; delete o.userData.__origMat; } }); }

// ---- hiding a built object's own meshes (replacement): layers off (never drawn, no shadow) — children like held weapons stay
export function hideOriginal(root, { keep = null, container = null } = {}) {
  const hidden = []; root.traverse((o) => {
    if (o === container) return; for (let p = o; p && p !== root; p = p.parent) { if (p === container || p.userData.__replacement) return; if (/^weapon-/.test(p.name || '')) return; }
    if (!(o.isMesh || o.isSkinnedMesh || o.isLine || o.isPoints)) return; if (keep && keep(o)) return; if (o.userData.__hiddenMask == null) { o.userData.__hiddenMask = o.layers.mask; hidden.push(o); } o.layers.disableAll();
  });
  return hidden;
}
export function unhide(root) { root.traverse((o) => { if (o.userData.__hiddenMask != null) { o.layers.mask = o.userData.__hiddenMask; delete o.userData.__hiddenMask; } }); }

// ---- a replacement model under a host group. r: { asset, xf: { px, py, pz, rx, ry, rz (deg), s, sx, sy, sz }, parts, clip, clipSpeed, hideOriginal, keep: [names] }
export function makeContainer(r) { const c = new THREE.Group(); c.name = '__replacement'; c.userData.__replacement = true; setXf(c, r.xf); return c; }
export function setXf(o, xf = {}) { o.position.set(+xf.px || 0, +xf.py || 0, +xf.pz || 0); o.rotation.set(THREE.MathUtils.degToRad(+xf.rx || 0), THREE.MathUtils.degToRad(+xf.ry || 0), THREE.MathUtils.degToRad(+xf.rz || 0)); const s = xf.s ?? 1; o.scale.set((xf.sx ?? 1) * s, (xf.sy ?? 1) * s, (xf.sz ?? 1) * s); o.updateMatrix(); }
// sync when the asset is already loaded (runtime preloads every asset in the pack), else async
export function attachReplacement(host, r, { parent = host, keepFn = null } = {}) {
  detachReplacement(host); const c = makeContainer(r); parent.add(c); host.userData.__repl = c;
  const fill = (inst) => { if (host.userData.__repl !== c) return; c.add(inst.scene); c.userData.clips = inst.clips || []; if (r.parts) applyParts(c, r.parts, { skip: Object.assign(() => false, { inReplacement: true }) }); inst.scene.traverse((o) => { if (o.isMesh) { o.castShadow = r.shadow !== false; o.receiveShadow = true; } });
    if (r.clip) playClip(c, r.clip, r.clipSpeed); };
  const ready = readyAsset(r.asset); if (ready) fill(ready); else loadAsset(r.asset).then(fill).catch((e) => console.warn('[model tools] replacement not loaded', e));
  if (r.hideOriginal !== false) { const keep = new Set(r.keep || []); hideOriginal(host, { container: c, keep: (o) => (keepFn && keepFn(o)) || keep.has(o.name) || (o.parent && keep.has(o.parent.name)) }); }
  return c;
}
export function detachReplacement(host) { const c = host.userData.__repl; if (c) { c.parent && c.parent.remove(c); MIXERS.delete(c); host.userData.__repl = null; } unhide(host); }
// ---- clips of a replacement / placed model
export const MIXERS = new Map(); // container → { mixer, action, name }
export function playClip(c, name, speed = 1, { once = false } = {}) {
  const clips = c.userData.clips || []; const clip = name === '*' ? clips[0] : clips.find((x) => x.name === name); let M = MIXERS.get(c);
  if (!clip) { if (M && !once) { M.mixer.stopAllAction(); MIXERS.delete(c); } return false; }
  if (!M) { M = { mixer: new THREE.AnimationMixer(c.children[0] || c), action: null, name: null }; MIXERS.set(c, M); }
  if (M.name === name && M.action && !once) { M.action.setEffectiveTimeScale(speed ?? 1); return true; }
  const a = M.mixer.clipAction(clip); a.reset(); a.setEffectiveTimeScale(speed ?? 1); a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity); a.clampWhenFinished = !!once;
  if (M.action && M.action !== a) M.action.crossFadeTo(a, 0.15, false); a.play(); M.action = a; M.name = name; return true;
}
export function tickMixers(dt) { for (const [c, M] of MIXERS) { if (!c.parent) { MIXERS.delete(c); continue; } let vis = true; for (let p = c; p; p = p.parent) if (!p.visible) { vis = false; break; } if (vis) M.mixer.update(dt); } }

// ---- hero garments (HeroBody CLOTH ids 0..7) — one array texture per hero (8 layers ≤ 512²), sampled by garment id in the
// body shader, projected on the bind-pose body (box mapping, metres × repeat), so fabrics tile across seams like real cloth
export const GARMENTS = [[1, 'Shirt / top (body)'], [3, 'Sleeves'], [7, 'Coat / jacket'], [5, 'Waistcoat / vest'], [6, 'Tie'], [2, 'Trousers'], [4, 'Skin'], [0, 'Shoes, belt & accessories']];
export const GARMENT_MODES = [[0, 'Original'], [1, 'Texture (replaces the colour)'], [2, 'Texture × original colour (pattern)'], [3, 'Colour only']];
const GSIZE = 256;
export async function garmentPatch(ch, garments) {
  const body = ch && ch.mesh && Array.isArray(ch.mesh.material) ? ch.mesh.material[0] : null; if (!body || !ch.spec || !ch.spec.hero) return false;
  let G = body.userData.__gar; if (!G) {
    const data = new Uint8Array(GSIZE * GSIZE * 4 * 8).fill(255); const tex = new THREE.DataArrayTexture(data, GSIZE, GSIZE, 8); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.generateMipmaps = true; tex.needsUpdate = true;
    G = body.userData.__gar = { tex, on: Array.from({ length: 8 }, () => new THREE.Vector4()), tint: Array.from({ length: 8 }, () => new THREE.Color(1, 1, 1)) };
    const prev = body.onBeforeCompile, prevKey = body.customProgramCacheKey;
    body.onBeforeCompile = (sh, r) => { prev.call(body, sh, r); sh.uniforms.uGarTex = { value: G.tex }; sh.uniforms.uGarOn = { value: G.on }; sh.uniforms.uGarTint = { value: G.tint };
      const tag = 'hbH = 0.0; hbAO = 1.0; hbRough = -1.0;'; if (!sh.fragmentShader.includes(tag)) return;
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform highp sampler2DArray uGarTex; uniform vec4 uGarOn[8]; uniform vec3 uGarTint[8];\n')
        .replace(tag, `{ int gi = int( clamp( floor( vCloth.x + 0.5 ), 0.0, 7.0 ) ); vec4 go = uGarOn[gi];
    if ( go.x > 0.5 ) { vec3 tn = abs( normalize( vBN ) ); vec2 tc = tn.z >= tn.x && tn.z >= tn.y ? vBP.xy : ( tn.x >= tn.y ? vBP.zy : vBP.xz );
      float cr = cos( go.z ), sr = sin( go.z ); tc = mat2( cr, -sr, sr, cr ) * tc * go.y; vec3 tx = pow( texture( uGarTex, vec3( tc, float( gi ) ) ).rgb, vec3( 2.2 ) );
      vec3 nc = go.x < 1.5 ? tx * uGarTint[gi] : go.x < 2.5 ? diffuseColor.rgb * tx * uGarTint[gi] : uGarTint[gi]; diffuseColor.rgb = mix( diffuseColor.rgb, nc, go.w ); } }
  ${tag}`); };
    body.customProgramCacheKey = () => (prevKey ? prevKey.call(body) : '') + '|gar1'; body.needsUpdate = true;
  }
  const cv = document.createElement('canvas'); cv.width = cv.height = GSIZE; const cx = cv.getContext('2d', { willReadFrequently: true });
  for (let id = 0; id < 8; id++) {
    const e = garments && garments[id]; const on = G.on[id]; if (!e || !e.mode) { on.set(0, 1, 0, 1); continue; }
    on.set(+e.mode, +(e.repeat ?? 4), THREE.MathUtils.degToRad(+e.rot || 0), +(e.strength ?? 1)); G.tint[id].set(e.tint || '#ffffff').convertSRGBToLinear();
    if (e.map && e.mode < 3) { try { const t = await loadTexture(e.map, { color: true, max: GSIZE }); const im = t.image; cx.clearRect(0, 0, GSIZE, GSIZE); cx.drawImage(im, 0, 0, GSIZE, GSIZE); G.tex.image.data.set(cx.getImageData(0, 0, GSIZE, GSIZE).data, id * GSIZE * GSIZE * 4); } catch (err) { console.warn('[model tools] garment texture', err); on.x = 0; } }
  }
  G.tex.needsUpdate = true; return true;
}
// a weapon's spent-case prototype: { asset?, color, scale, xf } → Object3D (cloned per shot)
export function shellProto(e, fallbackMat) {
  if (!e) return null; if (e.asset) { const inst = readyAsset(e.asset); if (!inst) return null; const g = new THREE.Group(); const c = makeContainer({ xf: e.xf || {} }); c.add(inst.scene); g.add(c); g.scale.multiplyScalar(e.scale || 1); if (e.parts) applyParts(c, e.parts, { skip: Object.assign(() => false, { inReplacement: true }) }); return g; }
  const geo = new THREE.CylinderGeometry(0.0045 * (e.radius || 1), 0.0045 * (e.radius || 1), 0.02 * (e.length || 1), 8); const mat = fallbackMat ? fallbackMat.clone() : new THREE.MeshStandardMaterial({ metalness: 0.9, roughness: 0.35 }); if (e.color) mat.color.set(e.color);
  const m = new THREE.Mesh(geo, mat); m.scale.setScalar(e.scale || 1); return m;
}
// one edited copy of a material (door panels and other meshes that are built later from a material table)
export async function buildEdited(orig, e) { return editedMat(orig, e, await texturesFor(e)); }
