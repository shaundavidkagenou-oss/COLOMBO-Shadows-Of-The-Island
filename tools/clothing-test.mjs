// Clothing clip test (Node): for every garment that covers the legs (skirts, sarongs, sarees, frocks, kurtas / kurtis,
// salwar tunics, abayas, national dress) the skinned leg vertices that sit under the garment must stay inside the
// skinned garment surface through idle, walk, brisk-walk and run cycles — i.e. no thigh / knee / shin pokes through
// the cloth. Uses the real body geometry, skeleton and Animator.
import './node-dom-stub.mjs';
const THREE = await import('three');
const { Character } = await import('../src/actors/Character.js');
const { makeAppearance } = await import('../src/actors/Appearance.js');

const specs = new Map();
for (let seed = 1; seed < 3000 && specs.size < 40; seed++) {
  const sp = makeAppearance(seed); if (!sp.skirt) continue; const k = `${sp.outfit}|${sp.skirt}|${sp.sex}`; const n = [...specs.keys()].filter((q) => q.startsWith(k)).length; if (n < 2) specs.set(`${k}#${n}`, sp);
}
const v = new THREE.Vector3(), hp = new THREE.Vector3();
let fails = 0, checks = 0; const out = [];
for (const [key, sp] of specs) {
  const ch = new Character(sp); const m = ch.mesh, P = m.geometry.userData.parts, A = ch.anim; if (!P || !P.skirt) { out.push(`skip ${key}: no part ranges`); continue; }
  const W = P.skirtSeg + 1, nR = (P.skirt[1] - P.skirt[0]) / W; const pos = m.geometry.attributes.position;
  const topY = pos.getY(P.skirt[0]), hemY = pos.getY(P.skirt[0] + (nR - 1) * W);
  const legIdx = []; for (const [a, b] of P.legs) for (let i = a; i < b; i++) { const y = pos.getY(i); if (y < topY - 0.06 && y > hemY + 0.03) legIdx.push(i); }
  let worst = 0, worstPose = ''; const per = {};
  for (const [pose, spd, frames] of [['idle', 0, 30], ['walk', 1.4, 90], ['brisk', 2.0, 90], ['run', 5.0, 60]]) {
    A.set(null); for (let i = 0; i < 60; i++) A.update(1 / 60, spd);
    for (let f = 0; f < frames; f++) {
      A.update(1 / 60, spd); if (f % 3) continue; ch.root.updateMatrixWorld(true); ch.bones.hips.getWorldPosition(hp);
      // skirt rings in skinned space: per ring, [angle, radius, y] for each vertex
      const rings = []; for (let r = 0; r < nR; r++) { const ring = []; for (let k = 0; k < W - 1; k++) { m.getVertexPosition(P.skirt[0] + r * W + k, v); ring.push([Math.atan2(v.z - hp.z, v.x - hp.x), Math.hypot(v.x - hp.x, v.z - hp.z), v.y]); } rings.push(ring); }
      const at = (ring, th) => { // radius / y of the ring surface at angle th (linear between neighbouring vertices)
        for (let k = 0; k < ring.length; k++) { const a = ring[k], b = ring[(k + 1) % ring.length]; let d = b[0] - a[0]; if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; let e = th - a[0]; if (e > Math.PI) e -= 2 * Math.PI; if (e < -Math.PI) e += 2 * Math.PI;
          if (Math.abs(d) > 1e-6 && e / d >= 0 && e / d <= 1) { const t = e / d; return [a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; } }
        return null; };
      for (const i of legIdx) {
        m.getVertexPosition(i, v); /* r16x+: getVertexPosition already returns the skinned position */ const th = Math.atan2(v.z - hp.z, v.x - hp.x), rad = Math.hypot(v.x - hp.x, v.z - hp.z);
        // garment profile at this angle: polyline (radius, y) from waist ring to hem; signed distance to the closest segment,
        // positive = outside the cloth. Points past the hem or above the waist are not covered by the garment and are skipped.
        const prof = []; for (let r = 0; r < nR; r++) { const c = at(rings[r], th); if (c) prof.push(c); }
        if (prof.length < 2) continue; let best = Infinity, sd = 0, cover = false;
        for (let q = 0; q < prof.length - 1; q++) { const [r0, y0] = prof[q], [r1, y1] = prof[q + 1]; const dr = r1 - r0, dy = y1 - y0, L2 = dr * dr + dy * dy || 1e-9;
          const tt = ((rad - r0) * dr + (v.y - y0) * dy) / L2; const tc = Math.min(1, Math.max(0, tt)); const pr = r0 + dr * tc, py = y0 + dy * tc; const dist = Math.hypot(rad - pr, v.y - py);
          if (dist < best) { best = dist; const L = Math.sqrt(L2); sd = ((rad - pr) * -dy + (v.y - py) * dr) / L; cover = !((q === 0 && tt < 0) || (q === prof.length - 2 && tt > 1)); } }
        if (!cover) continue; checks++; per[pose] = Math.max(per[pose] || 0, sd); if (sd > worst) { worst = sd; worstPose = `${pose} f${f}`; }
      }
    }
  }
  const ok = worst <= 0.004; if (!ok) fails++;
  out.push(`${ok ? 'ok  ' : 'FAIL'} ${key.padEnd(26)} leg-through-cloth max ${(worst * 1000).toFixed(1)} mm${worst > 0 ? ` (${worstPose})` : ''} | ${Object.entries(per).map(([k, x]) => `${k} ${(x * 1000).toFixed(0)}`).join(' ')}`);
  ch.dispose();
}
console.log(out.join('\n')); console.log(`clothing: ${specs.size} garments, ${checks} vertex checks, ${fails} failed`); process.exit(fails ? 1 : 0);
