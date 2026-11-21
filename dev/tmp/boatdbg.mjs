import { Boat } from '../../src/boats/Boat.js';
import { waterUniforms } from '../../src/world/Water.js';
const b = new Boat('dondra26', { x: -900, z: -400, yaw: -Math.PI / 2, mode: 'drive' }); const env = { t: 0, blocked: () => false, near: 999, wind: 0.5 };
let t = 0; for (let i = 0; i < 60 * 26; i++) { const dt = 1 / 60; t += dt; env.t = t; waterUniforms.uTime.value = t; b.update(dt, { thr: 1, steer: 0 }, env); if (i % 15 === 0 && t > 14 && (b.air || b.y > -0.2)) console.log(t.toFixed(2), 'y', b.y.toFixed(2), 'vy', b.vy.toFixed(2), 'air', b.air, 'yc', b.prevYC.toFixed(2), 'pitch', (b.pitch * 57.3).toFixed(1), 'x', b.x.toFixed(0)); }
