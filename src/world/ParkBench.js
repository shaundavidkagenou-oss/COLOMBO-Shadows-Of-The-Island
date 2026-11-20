// A teak-slatted park bench on dark-green cast-iron side frames (75th: the hospital garden). Drawn into an existing merged
// builder (no meshes of its own): E(name) → MeshBuilder for 'h_wood' (slats) and 'h_metal' (frames). The seat top is a
// parameter so a bench can be built at the height its sitter needs (people are never lowered into seats).
import * as THREE from 'three';
const C = (h) => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };
// a park bench into the builder: centre (x, z) of the seat, facing yaw (seat front direction), seat top height sy
export function parkBench(E, x, y0, z, yaw, sy = 0.45) {
  const wood = E('h_wood'), iron = E('h_metal'); const c = Math.cos(yaw), s = Math.sin(yaw);
  const P = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c]; const TEAK = C('#9a6a42'), IRON = C('#24372c');
  for (let i = 0; i < 5; i++) { const lz = 0.17 - i * 0.085; const [px, pz] = P(0, lz); wood.box(px, y0 + sy - 0.018, pz, 1.7, 0.032, 0.07, { rotY: yaw, col: TEAK.map((q) => q * (0.94 + (i % 2) * 0.08)) }); } // seat slats
  for (let i = 0; i < 3; i++) { const h = sy + 0.12 + i * 0.12; const lz = -0.24 - i * 0.025; const [px, pz] = P(0, lz); wood.box(px, y0 + h, pz, 1.7, 0.085, 0.028, { rotY: yaw - 0, col: TEAK.map((q) => q * (0.96 + (i % 2) * 0.06)) }); } // back slats (reclined)
  for (const lx of [-0.8, 0.8]) { // cast-iron side frames: front leg, back leg rising into the back support, armrest
    let [px, pz] = P(lx, 0.17); iron.box(px, y0 + (sy - 0.03) / 2, pz, 0.045, sy - 0.03, 0.05, { rotY: yaw, col: IRON });
    [px, pz] = P(lx, -0.2); iron.box(px, y0 + (sy - 0.03) / 2, pz, 0.045, sy - 0.03, 0.05, { rotY: yaw, col: IRON });
    [px, pz] = P(lx, -0.01); iron.box(px, y0 + sy - 0.05, pz, 0.04, 0.04, 0.46, { rotY: yaw, col: IRON }); // seat rail
    [px, pz] = P(lx, -0.26); iron.box(px, y0 + sy + 0.2, pz, 0.04, 0.42, 0.04, { rotY: yaw, col: IRON }); // back post
    [px, pz] = P(lx, -0.02); iron.box(px, y0 + sy + 0.21, pz, 0.06, 0.035, 0.5, { rotY: yaw, col: IRON }); // armrest
    [px, pz] = P(lx, 0.2); iron.box(px, y0 + sy + 0.1, pz, 0.04, 0.22, 0.04, { rotY: yaw, col: IRON }); // armrest front post
    [px, pz] = P(lx, -0.01); iron.box(px, y0 + 0.08, pz, 0.035, 0.03, 0.42, { rotY: yaw, col: IRON }); } // foot stretcher
}
// the bench's solid footprint (small boxes, like the city benches: tight to the slats at any yaw)
export function parkBenchColliders(out, x, z, yaw, top, id) { const c = Math.cos(yaw), s = Math.sin(yaw);
  for (const lz of [-0.2, 0.02]) for (let k = 0; k < 8; k++) { const lx = -0.805 + k * 0.23, hx = 0.115, hz = 0.11; const cx = x + lx * c + lz * s, cz = z - lx * s + lz * c;
    const ex = Math.abs(c) * hx + Math.abs(s) * hz, ez = Math.abs(s) * hx + Math.abs(c) * hz; out.push({ x0: cx - ex, x1: cx + ex, z0: cz - ez, z1: cz + ez, h: top, kind: 'bench', id, front: [s, c] }); } }
