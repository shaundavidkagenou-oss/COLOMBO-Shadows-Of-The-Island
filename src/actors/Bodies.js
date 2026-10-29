// Physical presence of every on-foot character (player, crowd, police, HQ staff, story/cinematic actors).
// Characters register themselves on construction (Character.js) and leave on dispose(). Each frame Game gathers
// the standing ones that are actually in the scene graph into a flat list used for player↔NPC and NPC↔NPC
// collision, so nobody walks through anybody.
import * as THREE from 'three';

export const LIVE = new Set();
const _v = new THREE.Vector3();
export const BODY_R = 0.27;

function inScene(o, scene) { let n = o; while (n) { if (n === scene) return true; if (!n.visible) return false; n = n.parent; } return false; }

// returns [{ ch, x, y, z, r, ped }] — ped is the Crowd record when the character belongs to the crowd
export function gatherBodies(scene) {
  const out = [];
  for (const ch of LIVE) {
    const root = ch.root; if (!root.parent || ch.noBody) continue;
    if (ch.anim && ch.anim.seated && ch.anim.seatW > 0.3) continue; // sitting in a vehicle / on a seat
    if (!inScene(root, scene)) continue;
    const ped = ch.crowdPed || null; if (ped && (ped.state === 'down' || ped.vanish)) continue;
    let x, y, z; if (root.parent === scene) { x = root.position.x; y = root.position.y; z = root.position.z; } else { root.getWorldPosition(_v); x = _v.x; y = _v.y; z = _v.z; }
    out.push({ ch, x, y, z, r: ch.bodyR || BODY_R, ped });
  }
  return out;
}

// push a circle (x, z, r) out of all bodies except `self`; returns {x, z, hit}. `share` (0..1) moves crowd peds
// out of the way instead of the mover for that fraction of the overlap.
export function separate(bodies, x, z, y, r, self, share = 0) {
  let hit = false;
  for (const b of bodies) {
    if (b.ch === self || Math.abs(b.y - y) > 1.4) continue;
    const dx = x - b.x, dz = z - b.z, m = r + b.r; if (Math.abs(dx) > m || Math.abs(dz) > m) continue;
    const d2 = dx * dx + dz * dz; if (d2 >= m * m) continue;
    const d = Math.sqrt(d2) || 1e-3, nx = d2 > 1e-8 ? dx / d : 1, nz = d2 > 1e-8 ? dz / d : 0, o = m - d;
    const k = b.ped && share > 0 && b.ped.state !== 'idle' ? share : 0; // peds standing at a stall/bench hold their spot
    if (k) { b.ped.x -= nx * o * k; b.ped.z -= nz * o * k; b.x = b.ped.x; b.z = b.ped.z; b.ped.bumped = 0.6; }
    x += nx * o * (1 - k); z += nz * o * (1 - k); hit = true;
  }
  return { x, z, hit };
}
