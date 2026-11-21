import { Boat } from '../../src/boats/Boat.js';
import { BOATS } from '../../src/boats/BoatCatalog.js';
import { waterUniforms } from '../../src/world/Water.js';
const ids = process.argv[2] ? process.argv[2].split(',') : Object.keys(BOATS);
const sea = process.argv[3] === 'sea';
for (const id of ids) {
  const b = new Boat(id, { x: sea ? -900 : 100, z: sea ? -400 : -1300, yaw: sea ? -Math.PI / 2 : -Math.PI / 2, mode: 'drive' }); if (b.sails.length) b.setSailsVisible(true);
  let t = 0, out = []; const env = { t: 0, E: null, wakes: null, blocked: () => false, near: 999, wind: 0.5 };
  let maxAir = 0, maxRoll = 0, maxTrim = 0, t60 = null;
  for (let i = 0; i < 60 * 40; i++) { const dt = 1 / 60; t += dt; env.t = t; waterUniforms.uTime.value = t; const steer = t > 25 && t < 32 ? 1 : 0; b.update(dt, { thr: 1, steer }, env);
    if (!Number.isFinite(b.y + b.pitch + b.roll + b.x)) { out.push('NaN at ' + t.toFixed(2)); break; }
    if (t < 25) maxTrim = Math.max(maxTrim, b.pitch); if (t > 25) maxRoll = Math.max(maxRoll, Math.abs(b.roll)); if (b.air) maxAir++; if (t60 === null && b.u > b.def.max * 0.9) t60 = t;
    if ([5, 10, 24].some((s) => Math.abs(t - s) < 1e-6 + dt / 2)) out.push(`t${Math.round(t)} u${b.u.toFixed(1)} pitch${(b.pitch * 57.3).toFixed(1)} y${b.y.toFixed(2)}`); }
  console.log(id.padEnd(12), out.join(' | '), `| t90 ${t60 ? t60.toFixed(1) : '-'} maxTrim ${(maxTrim * 57.3).toFixed(1)}° turnRoll ${(maxRoll * 57.3).toFixed(1)}° airFrames ${maxAir}`, b.sails.length ? `sailF ${b.sailF.toFixed(2)}` : '');
}
