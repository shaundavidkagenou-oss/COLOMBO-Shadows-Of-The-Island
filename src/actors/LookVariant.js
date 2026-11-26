// 96th: recoloured crowd bodies. A look variant (Appearance.lookVariant) wears the base look's cached body geometry with
// only its vertex colours redrawn: the variant geometry is a thin BufferGeometry that SHARES every attribute, the index and
// the morph targets of the cached one and owns just a new colour buffer (no new material, no new texture, no new shader).
//
// Every crowd-body vertex colour comes from a colour in the spec (garment, skin, hair, shoes, ...) times a shade factor
// (hems ×0.78, free edges ×0.96, hair strands ×0.9-1.1 + 0.004, ...). Each vertex of a base geometry is classified once
// (cached per geometry, 1 byte a vertex) to the spec colour it came from; a variant then maps old → new colour per slot,
// keeping the vertex's own shade factor and residual: c' = f·new + (c − f·old), f = (c·old)/(old·old).
//
// Variant geometries are reference-counted per (base geometry, colour map) — two people in the same variant share one —
// and freed (their colour buffer only: the shared buffers are detached first) once unused beyond a small idle pool.
import * as THREE from 'three';

const SLOTS = new WeakMap(); // base geometry → { cands: [[r,g,b]...], hex: [...], slot: Uint8Array }
const VARS = new Map(); // `${geo.uuid}|${sig}` → { geo, refs }
const IDLE = []; const IDLE_KEEP = 24;
export const variantStats = { built: 0, freed: 0, live: () => VARS.size, idle: () => IDLE.length, ms: 0 };
const OFS = 0.004; // Character.js hair strands: hair × (0.9-1.1) + 0.004
const lin = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };

// all colour-valued fields of a spec (candidates for classification — including the ones a variant never changes, so a
// black shoe is not mistaken for dark hair)
function specColours(sp) { const out = []; const seen = new Set();
  for (const k in sp) { const v = sp[k]; if (typeof v !== 'string' || v[0] !== '#' || (v.length !== 7 && v.length !== 4)) continue; const h = v.toLowerCase(); if (seen.has(h)) continue; seen.add(h); out.push(h); }
  return out; }

function classify(geo, base) {
  let S = SLOTS.get(geo); if (S) return S;
  const hex = specColours(base).slice(0, 127); const cands = hex.map(lin); const oo = cands.map((o) => o[0] * o[0] + o[1] * o[1] + o[2] * o[2]);
  const col = geo.attributes.color; const n = col.count; const slot = new Uint8Array(n).fill(255);
  for (let i = 0; i < n; i++) { const r0 = col.getX(i), g0 = col.getY(i), b0 = col.getZ(i); const cl = Math.sqrt(r0 * r0 + g0 * g0 + b0 * b0); let best = 255, bd = 0.012 + 0.07 * cl;
    for (let a = 0; a < 2; a++) { const r = r0 - a * OFS, g = g0 - a * OFS, b = b0 - a * OFS; // a = 1: the hair strands' small lift (×k + 0.004), which dominates very dark hair
      for (let k = 0; k < cands.length; k++) { const o = cands[k]; if (oo[k] < 1e-7) continue; const f = (r * o[0] + g * o[1] + b * o[2]) / oo[k]; if (f < 0.4 || f > 1.32) continue;
        const dr = r - f * o[0], dg = g - f * o[1], db = b - f * o[2]; const d = Math.sqrt(dr * dr + dg * dg + db * db); if (d < bd) { bd = d; best = k + a * 128; } } }
    slot[i] = best; }
  S = { hex, cands, slot }; SLOTS.set(geo, S); return S;
}

function share(geo, color) { // a geometry with every buffer of `geo` except the colours
  const g = new THREE.BufferGeometry(); for (const k in geo.attributes) g.setAttribute(k, k === 'color' ? color : geo.attributes[k]); if (geo.index) g.setIndex(geo.index);
  for (const k in geo.morphAttributes) g.morphAttributes[k] = geo.morphAttributes[k]; g.morphTargetsRelative = geo.morphTargetsRelative;
  for (const gr of geo.groups) g.addGroup(gr.start, gr.count, gr.materialIndex); g.boundingSphere = geo.boundingSphere; g.boundingBox = geo.boundingBox; g.userData = geo.userData; g.name = geo.name;
  return g;
}
function release(g) { // free the variant's own colour buffer (and its VAOs / morph texture) without touching the shared buffers
  const c = g.attributes.color; for (const k of Object.keys(g.attributes)) if (k !== 'color') g.deleteAttribute(k); g.setIndex(null); g.morphAttributes = {}; g.dispose(); void c; variantStats.freed++;
}

// the colour map of a variant against its base: [old hex → new linear rgb] for the slots that change
function colourMap(base, sp, S) { const out = new Map(); const fields = Object.keys(base);
  for (let k = 0; k < S.hex.length; k++) { const h = S.hex[k]; for (const f of fields) { const b = base[f]; if (typeof b === 'string' && b.toLowerCase() === h && typeof sp[f] === 'string' && sp[f].toLowerCase() !== h) { out.set(k, sp[f].toLowerCase()); break; } } }
  return out; }

function recolour(geo, S, map) { // raw-array pass (the cached colours are a plain float buffer): ~0.1 ms for a 6 k-vertex body
  const col = geo.attributes.color; const n = col.count; const src = col.array, raw = src instanceof Float32Array && col.itemSize === 3 && !col.normalized; const a = new Uint16Array(n * 3); /* 16-bit normalised: half the bytes of the float buffer it replaces */
  const nq = new Float32Array(128 * 3), has = new Uint8Array(128), oq = new Float32Array(128 * 4); for (const [k, h] of map) { const q = lin(h); nq.set(q, k * 3); has[k] = 1; }
  for (let k = 0; k < S.cands.length; k++) { const o = S.cands[k]; oq[k * 4] = o[0]; oq[k * 4 + 1] = o[1]; oq[k * 4 + 2] = o[2]; oq[k * 4 + 3] = 1 / Math.max(1e-9, o[0] * o[0] + o[1] * o[1] + o[2] * o[2]); }
  const slot = S.slot;
  for (let i = 0, i3 = 0; i < n; i++, i3 += 3) { let r = raw ? src[i3] : col.getX(i), g = raw ? src[i3 + 1] : col.getY(i), b = raw ? src[i3 + 2] : col.getZ(i); const sl = slot[i];
    if (sl !== 255) { const k = sl & 127; if (has[k]) { const ofs = sl >= 128 ? OFS : 0, k4 = k * 4, k3 = k * 3; r -= ofs; g -= ofs; b -= ofs; const ox = oq[k4], oy = oq[k4 + 1], oz = oq[k4 + 2]; const f = (r * ox + g * oy + b * oz) * oq[k4 + 3];
      r = f * nq[k3] + r - f * ox + ofs; g = f * nq[k3 + 1] + g - f * oy + ofs; b = f * nq[k3 + 2] + b - f * oz + ofs; } }
    a[i3] = (r <= 0 ? 0 : r >= 1 ? 1 : r) * 65535 + 0.5; a[i3 + 1] = (g <= 0 ? 0 : g >= 1 ? 1 : g) * 65535 + 0.5; a[i3 + 2] = (b <= 0 ? 0 : b >= 1 ? 1 : b) * 65535 + 0.5; }
  return new THREE.BufferAttribute(a, 3, true);
}

/** The variant geometry of `geo` (a cached crowd body built from `base`) for the variant spec `sp`; null = wear `geo` itself. */
export function acquireVariant(geo, base, sp) {
  if (!geo || !geo.attributes.color || !base || base === sp) return null; const t0 = performance.now();
  const S = classify(geo, base); const map = colourMap(base, sp, S); if (!map.size) return null;
  const sig = [...map].map(([k, h]) => k + h).join(','); const key = geo.uuid + '|' + sig; let e = VARS.get(key);
  if (!e) { e = { key, geo: share(geo, recolour(geo, S, map)), refs: 0 }; e.geo.__var = e; VARS.set(key, e); variantStats.built++; }
  else if (!e.refs) { const i = IDLE.indexOf(e); if (i >= 0) IDLE.splice(i, 1); }
  e.refs++; variantStats.ms += performance.now() - t0; return e.geo;
}
export function releaseVariant(g) {
  const e = g && g.__var; if (!e || e.refs <= 0) return;
  if (--e.refs > 0) return; IDLE.push(e);
  while (IDLE.length > IDLE_KEEP) { const o = IDLE.shift(); VARS.delete(o.key); release(o.geo); }
}
if (typeof window !== 'undefined') window.__variantStats = variantStats; // tools/crowd-bench.mjs
/** share of a cached look's coloured vertices traced back to a spec colour (tools/variety-test.mjs) */
export function coverage(geo, base) { const S = classify(geo, base); let n = 0; for (let i = 0; i < S.slot.length; i++) if (S.slot[i] !== 255) n++; return n / Math.max(1, S.slot.length); }
