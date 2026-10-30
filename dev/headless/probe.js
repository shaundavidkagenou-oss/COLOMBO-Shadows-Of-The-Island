// Realism / glitch probe, imported by headless scenarios: `const {probe}=await import('/dev/headless/probe.js'); return probe(g)`.
// Counts NPCs embedded in buildings, floating / sunk characters, overlapping or embedded vehicles and NaN transforms near the player.
export function probe(g, R = 90) {
  const C = g.collision, P = g.player, out = { peds: 0, inWall: [], float: [], vOverlap: [], vInWall: [], nan: 0, vehicles: 0, pedOnRoadStill: 0 };
  const solidAt = (x, z, y, r, opts = {}) => {
    for (const c of C.query(x - r, z - r, x + r, z + r)) {
      if (c.kind === 'deck' || c.kind === 'platform') continue;
      const base = c.y0 || 0, top = base + c.h; if (top <= y + 0.45 || base > y + 1.8) continue;
      if (c.walkUnder && !opts.vehicle) continue;
      if (x > c.x0 + r && x < c.x1 - r && z > c.z0 + r && z < c.z1 - r) return c; // deeply inside, not just touching
    }
    return null;
  };
  for (const p of g.crowd.peds) {
    if (Math.hypot(p.x - P.x, p.z - P.z) > R || p.vanish) continue; out.peds++;
    const y = p.ch.root.position.y; const seated = ['sit', 'squat', 'kneel'].includes(p.ch.anim.action) || p.ch.anim.seat;
    const c = solidAt(p.x, p.z, y, 0.05); if (c) out.inWall.push([+p.x.toFixed(1), +p.z.toFixed(1), c.kind || '?', p.state]);
    if (!seated && p.state !== 'down') { const gy = C.groundAt(p.x, p.z, y + 0.3); if (Math.abs(gy - y) > 0.2) out.float.push([+p.x.toFixed(1), +p.z.toFixed(1), +(y - gy).toFixed(2), p.state, p.ch.anim.action]); }
  }
  const vs = g.traffic.all().filter((v) => Math.hypot(v.x - P.x, v.z - P.z) < R); out.vehicles = vs.length;
  for (let i = 0; i < vs.length; i++) {
    const a = vs[i]; const c = solidAt(a.x, a.z, a.y, 0.3, { vehicle: true }); if (c && !a.dead) out.vInWall.push([a.type, +a.x.toFixed(1), +a.z.toFixed(1), c.kind || '?']);
    for (let j = i + 1; j < vs.length; j++) {
      const b = vs[j]; // oriented-box overlap (SAT, 2D)
      const ax = [Math.sin(a.yaw), Math.cos(a.yaw)], bx = [Math.sin(b.yaw), Math.cos(b.yaw)];
      const d = [b.x - a.x, b.z - a.z]; let sep = false;
      for (const n of [ax, [ax[1], -ax[0]], bx, [bx[1], -bx[0]]]) {
        const pr = (v, f, hw, hl) => Math.abs(f[0] * n[0] + f[1] * n[1]) * hl + Math.abs(f[1] * n[0] - f[0] * n[1]) * hw;
        const ra = pr(a, ax, a.T.wid / 2, a.half), rb = pr(b, bx, b.T.wid / 2, b.half);
        if (Math.abs(d[0] * n[0] + d[1] * n[1]) > (ra + rb) * 0.92) { sep = true; break; }
      }
      if (!sep) out.vOverlap.push([a.type, b.type, +a.x.toFixed(1), +a.z.toFixed(1), +Math.hypot(d[0], d[1]).toFixed(2)]);
    }
  }
  g.scene.traverse((o) => { const p = o.position; if (!Number.isFinite(p.x + p.y + p.z)) out.nan++; });
  return out;
}
