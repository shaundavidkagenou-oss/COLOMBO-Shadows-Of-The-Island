// Door gaps along a body side. Every passenger-car body has real (hinged / sliding) doors: front doors on both sides,
// rear doors on both sides of four-door bodies and a sliding door on the kerb side (+x) of vans. Strips, bands, belt
// chrome and trims that run along a side stop at each door's shut lines; the door panels carry their own pieces.
//  D: body profile ({ door, rearDoor?, slide? }); sx: side (−1 driver / +1 kerb)
export function doorGaps(D, sx) {
  const g = [[D.door[1], D.door[0]]]; if (D.rearDoor) g.push([D.rearDoor[1], D.rearDoor[0]]); if (D.slide && sx > 0) g.push([D.slide[1], D.slide[0]]); return g;
}
// gaps from built door metadata ({ side, hinge: [x, zFront], len })
export function doorGapsMeta(doors, sx) { return (doors || []).filter((d) => d.side === sx).map((d) => [d.hinge[1] - d.len, d.hinge[1]]); }
// [za, zb] minus the gaps (each widened by pad), pieces shorter than 2 cm dropped
export function spansOutside(za, zb, gaps, pad = 0.005) {
  let segs = [[za, zb]]; for (const [lo0, hi0] of gaps) { const lo = lo0 - pad, hi = hi0 + pad; segs = segs.flatMap(([a, b]) => (b <= lo || a >= hi ? [[a, b]] : [[a, lo], [hi, b]].filter(([p, q]) => q - p > 0.02))); }
  return segs;
}
