// Colombo Fort railway station (54th request) — layout data shared by the geometry (FortStation.js), the station life
// (StationLife.js: passengers, ticket clerks, shoulder vendors, the announcer), the plan clearance (CityPlan.js) and tests.
// World axes: +x east, +z toward the tracks. The frontage faces Olcott Mawatha (−z side, the road at z −660); the main line
// runs along z −612 behind the booking hall. Everything here is plain numbers (no three.js), so Node tests can import it.
import { LAND_Y } from './Layout.js';

const Y = LAND_Y, FL = LAND_Y + 1.0; // street level · booking-hall floor = platform top (Fort's halls open straight onto platform 1)
const winZ = [0, 1, 2, 3, 4, 5, 6, 7].map((k) => -647.4 + k * 2.2);
export const FORT = {
  Y, FL,
  bld: { x0: -100, x1: 30, z0: -650, z1: -630, top: Y + 8.0 }, // the long single-storey frontage
  hall: { x0: -60, x1: -10, z0: -650, z1: -630, ceil: FL + 6.6 }, // booking hall
  // ticket windows in the hall's west wall (clerks sit behind them in the west wing): number, what the board says
  counterX: -60,
  windows: winZ.map((z, i) => ({ n: i + 1, z, stand: { x: -59.15, z }, clerk: { x: -61.75, z } })),
  counterSigns: [
    ['1', 'ALL RAILWAY STATIONS', 'සියලුම දුම්රිය ස්ථාන', '1,2 CLASS'], ['2', 'MAIN LINE', 'ප්‍රධාන මාර්ගය', 'KANDY · BADULLA'], ['3', 'BATTICALOA · TRINCOMALEE', 'මඩකලපුව · ත්‍රිකුණාමලය', '2,3 CLASS'],
    ['4', 'ALL RAILWAY STATIONS', 'සියලුම දුම්රිය ස්ථාන', '2,3 CLASS'], ['5', 'COAST LINE', 'මුහුදුබඩ මාර්ගය', 'GALLE · MATARA'], ['6', 'PUTTALAM LINE', 'පුත්තලම මාර්ගය', 'NEGOMBO · CHILAW'],
    ['7', 'KELANI VALLEY LINE', 'කැලණිවැලි මාර්ගය', 'AVISSAWELLA'], ['8', 'PLATFORM TICKETS', 'වේදිකා ප්‍රවේශ පත්‍ර', 'SEASON TICKETS'],
  ],
  entrances: [{ x: -35, w: 5, h: 4.0, main: true }, { x: -52, w: 3, h: 3.2 }, { x: -18, w: 3, h: 3.2 }], // hall front openings
  backArches: [-50, -35, -20], archW: 5, // hall → platform 1
  res: { x0: -10, x1: 8, z0: -650, z1: -630, portalX: -1, counterX: 4, door: { x: -10, z: -644 } }, // intercity reservations office
  ann: { x0: 8, x1: 18, z0: -638, z1: -630, door: { x: 15.5, z: -630 }, chair: { x: 11, z: -631.75, yaw: 0 }, win: [9.4, 13.2] }, // announcer's room (window onto platform 1)
  // platforms: 1 against the building (the line the trains use), two island platforms beside the stabling sidings
  p1: { x0: -117.75, x1: 30.75, z0: -630, z1: -613.65 },
  islands: [{ x0: -110, x1: 20, z0: -610.35, z1: -601.65, n: [2, 3] }, { x0: -110, x1: 20, z0: -598.35, z1: -589.65, n: [4, 5] }],
  sidings: [{ z: -600, x0: -140, x1: 24 }, { z: -588, x0: -140, x1: 24 }],
  shed: { x0: -112, x1: 26, zA: -628.8, zM: -606, zB: -584.8, eave: Y + 9.45, rise: 3.4, frames: 15, dx: 9.5 },
  bridge: { x0: -76.5, x1: -73.5, z0: -622.7, z1: -592.8, deck: FL + 6.2, stairs: [{ zc: -621.5 }, { zc: -607.8 }, { zc: -594 }], run: 10.8, w: 2.4 },
  // passengers' waypoints
  street: [{ x: -35, z: -650.55 }, { x: -52, z: -650.5 }, { x: -18, z: -650.5 }], // on the (narrow) Olcott Mawatha footway, at the foot of each entrance's steps
  inside: [{ x: -35, z: -647.8 }, { x: -52, z: -647.8 }, { x: -18, z: -647.8 }],
  queueX: -57.6, // where the queue for a window starts (people stand at window.stand, the rest line up along +x)
  // where waiting passengers stand on platform 1 (the trains stop with their centre at x −35 → doors in x −86 … 16)
  wait: { x0: -82, x1: 12, z0: -626.5, z1: -616.8 },
  edgeZ: -613.65, // platform 1 face
  // vendor beat (platform 1 and the hall), and the PA horn speakers (on the shed columns, in the hall, outside)
  vendorLoop: [[-60.5, -619.5], [-35, -620.5], [8, -619.5], [8, -624.6], [-19.6, -624.6], [-19.6, -633], [-35, -644.5], [-51, -633], [-51, -624.6], [-60.5, -624.6]], // clear of the benches, the bridge stairs and the shed columns (tools/fort-station-test.mjs)
  // 55th: every horn is mounted on something — a shed column (on a clamp, the horn facing the platform), a wall bracket in the
  // hall, or the pavilion piers outside (beside the openings, never in front of a doorway). x, z = the horn (sound source).
  speakers: [
    ...[-100.5, -81.5, -62.5, -43.5, -24.5, -5.5, 13.5].map((x) => ({ x, z: -628.8 + 0.35, y: FL + 3.5, mount: 'col', at: -628.8, dirs: [1] })),
    ...[-91, -53, -15].map((x) => ({ x, z: -606, y: FL + 3.5, mount: 'col', at: -606, dirs: [-1, 1] })),
    { x: -42.5, z: -630.4 - 0.35, y: FL + 4.6, mount: 'wall', at: -630.4, dirs: [-1] }, { x: -27.5, z: -649.6 + 0.35, y: FL + 4.6, mount: 'wall', at: -649.6, dirs: [1] },
    { x: -39.35, z: -650.8 - 0.35, y: FL + 3.3, mount: 'wall', at: -650.8, dirs: [-1] }, { x: -3.67, z: -650.8 - 0.35, y: FL + 3.3, mount: 'wall', at: -650.8, dirs: [-1] }, { x: -80, z: -650 - 0.35, y: FL + 3.0, mount: 'wall', at: -650.1, dirs: [-1] },
  ],
  // hall benches and platform benches: seats (sit pose roots) [x, z, yaw]
  benches: [],
  // plan clearance: no plan trees / plants / props inside the station (the shed, platforms and sidings stand here now)
  clear: [{ x0: -145, x1: 34, z0: -632, z1: -580 }, { x0: -100, x1: 30, z0: -650, z1: -630 }],
  frontGaps: [[-37.6, -32.4]], // railings dropped in front of the main entrance steps
};
// benches: hall (4 rows across the middle, facing the platforms and the counters) + platform 1 (backs to the building)
for (const x of [-48, -44.2, -26.2, -22.4]) for (const [z, yaw] of [[-640.6, 0], [-641.4, Math.PI]]) for (const o of [-1, 0, 1]) FORT.benches.push({ x: x + o * 0.95, z: z + (yaw ? -0.05 : 0.05), yaw, y: FL + 0.45, where: 'hall' });
for (const x of [-108, -96, -89.5, -58, -42.5, -27.5, -12, 0, 12, 24]) { for (const o of [-1, 0, 1]) FORT.benches.push({ x: x + o * 0.95, z: -627.2, yaw: 0, y: FL + 0.45, where: 'p1' }); }

export const inRect = (r, x, z, pad = 0) => x > r.x0 - pad && x < r.x1 + pad && z > r.z0 - pad && z < r.z1 + pad;
export function fortClearAt(x, z, pad = 0) { return FORT.clear.some((r) => inRect(r, x, z, pad)); }
export function inAnnouncerRoom(x, z) { return inRect(FORT.ann, x, z, -0.05); }
// under the station's roofs (the frontage block with the halls, the platform-1 canopy and the train shed): no rain falls here
export function underFortRoof(x, z) { return x > FORT.shed.x0 && x < FORT.shed.x1 && z > FORT.bld.z0 && z < FORT.shed.zB && (x > FORT.bld.x0 || z > FORT.shed.zA); }
export function inStation(x, z) { return x > -125 && x < 36 && z > -656 && z < -583; }
