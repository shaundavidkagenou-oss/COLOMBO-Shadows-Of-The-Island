// Opening cinematic "The Meeting" — fully in-engine, in the same location the player takes control.
import * as THREE from 'three';
import * as L from '../world/Layout.js';
import { HEROES } from '../actors/Character.js';
import { Audio } from '../audio/Audio.js';
import { easeOut } from '../core/math.js';

const MEET = { x: -128, z: -891.8 }; // middle of the north pavement of Main Street (road edge z=-894, shopfronts ~-890.5)
function folderMesh() {
  const g = new THREE.Group();
  const cover = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.32, 0.018), new THREE.MeshStandardMaterial({ color: 0x8a6a3a, roughness: 0.85 }));
  const paper = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.3, 0.012), new THREE.MeshStandardMaterial({ color: 0xf0ece0, roughness: 0.9 })); paper.position.set(0.006, 0.01, 0.004);
  const strap = new THREE.Mesh(new THREE.BoxGeometry(0.245, 0.02, 0.022), new THREE.MeshStandardMaterial({ color: 0x5a1a1a, roughness: 0.6 }));
  g.add(cover, paper, strap); g.traverse((m) => (m.castShadow = true)); return g;
}
const attach = (ch, obj) => { const h = ch.bones.handR; h.add(obj); obj.position.set(0, -0.12, 0.05); obj.rotation.set(0.2, 0, Math.PI / 2); };

export async function playOpening(g) {
  const d = g.director, hud = g.hud, A = g.atmos, P = g.player;
  // late afternoon, rain clouds gathering
  A.hour = 16.75; A.setWeather('overcast', true); A.forceWeather('overcast'); A.wet = 0.15;
  g.world.warm(MEET.x, MEET.z); g.world.warm(-560, -330);
  d.begin(); Audio.setMusic('intro');
  const skipper = g.bus.on('key', (code) => { if (code === 'Escape' || code === 'Enter') { d.skip = true; hud.clearSubtitle(); } });
  // place Kavindu and Ruwan
  const kStart = { x: -168, z: MEET.z }; P.teleport(kStart.x, kStart.z, Math.PI / 2); P.ch.anim.set(null);
  const ruwan = d.spawnActor('Ruwan', HEROES.ruwan, MEET.x + 0.3, MEET.z + 0.25, -Math.PI / 2);
  ruwan.anim.set('phone'); const folder = folderMesh(); attach(ruwan, folder); folder.visible = false;
  hud.fade(0, 2.2);
  try {
    // 1) over the sea toward the Galle Face skyline
    await d.shot({ pos: [-700, 55, -520], look: [-420, 40, -380] }, { pos: [-585, 42, -330], look: [-380, 30, -300] }, 7.5);
    // 2) the markets of Pettah from above, rooftops and cables
    d.skip || g.screens?.caption?.('<div class="cap-place">PETTAH</div><div class="cap-si">පිටකොටුව · புறக்கோட்டை</div>', 4.5);
    await d.shot({ pos: [-40, 75, -790], look: [-120, 5, -900] }, { pos: [-108, 50, -858], look: [-135, 2, -896] }, 6);
    // 3) the skyline and Lotus Tower under a heavy sky
    await d.shot({ pos: [150, 45, -640], look: [305, 120, -480] }, { pos: [190, 40, -650], look: [305, 140, -480] }, 5);
    // 4) street level: Kavindu walks along Main Street
    const walk = d.walkTo(P.ch, MEET.x - 0.95, MEET.z, 1.25);
    d.follow(P.ch, [-3.8, 1.8, -1.9], [1.5, 1.4, 0]);
    await d.wait(5.5);
    await d.shot({ pos: [MEET.x + 6, 1.6, MEET.z - 1.7], look: [MEET.x - 6, 1.5, MEET.z] }, { pos: [MEET.x + 5, 1.65, MEET.z - 1.5], look: [MEET.x - 2, 1.5, MEET.z] }, 3.5);
    await walk;
    ruwan.anim.set(null); d.face(ruwan, P.ch.root.position.x, P.ch.root.position.z); d.face(P.ch, ruwan.root.position.x, ruwan.root.position.z);
    const C = MEET.x - 0.32; // midpoint between the two
    const two = { pos: [C, 1.55, MEET.z - 4.2], look: [C, 1.42, MEET.z] };
    const overK = { pos: [MEET.x - 2.3, 1.72, MEET.z - 0.62], look: [MEET.x + 0.3, 1.52, MEET.z + 0.3] };
    const overR = { pos: [MEET.x + 1.75, 1.7, MEET.z - 0.62], look: [MEET.x - 0.95, 1.52, MEET.z + 0.05] };
    d.hold(two.pos, two.look);
    await d.say('Ruwan', 'You really picked the worst day to come back, machan.', 3.4);
    d.hold(overR.pos, overR.look);
    await d.say('Kavindu', 'Seven years, Ruwan. I was hoping for "welcome home."', 3.2);
    d.hold(overK.pos, overK.look);
    await d.say('Ruwan', 'Welcome home. Now listen. Main Street — the tea kade, Fathima\'s shop, Uncle Bandara\'s spice store. Someone wants all of it.', 5.2);
    await d.say('Ruwan', 'Not buying. Pressuring. Lawyers in the morning, black SUVs at night, signatures nobody remembers giving.', 5);
    d.hold(overR.pos, overR.look);
    await d.say('Kavindu', 'Who?', 1.4);
    d.hold(overK.pos, overK.look);
    await d.say('Ruwan', 'A company called Harbour Crest Developments. That\'s all anyone will say out loud.', 4);
    // the folder
    folder.visible = true; ruwan.anim.set('interact');
    d.shot({ pos: [C - 0.1, 1.45, MEET.z - 1.9], look: [C, 1.12, MEET.z + 0.1] }, { pos: [C, 1.38, MEET.z - 1.5], look: [C, 1.1, MEET.z + 0.1] }, 4.5);
    await d.say('Ruwan', 'Photos, land records, and an address. Don\'t open it here.', 3.6);
    attach(P.ch, folder); P.ch.anim.set('interact'); ruwan.anim.set(null); await d.wait(0.9); P.ch.anim.set(null);
    d.hold(overR.pos, overR.look);
    await d.say('Kavindu', 'Why me?', 1.5);
    d.hold(overK.pos, overK.look);
    await d.say('Ruwan', 'Because nobody here knows your face any more. And because you never could leave things alone.', 4.6);
    // weather turns
    if (!d.skip) { A.flash = 1; Audio.thunder(0.2); } A.forceWeather('rain'); A.w.rain = Math.max(A.w.rain, 0.55); A.w.cloud = Math.max(A.w.cloud, 0.85);
    d.shot({ pos: [MEET.x + 0.5, 1.3, MEET.z - 5], look: [MEET.x + 0.5, 5, MEET.z + 6] }, { pos: [MEET.x + 0.5, 1.4, MEET.z - 4.6], look: [MEET.x + 0.5, 2.0, MEET.z] }, 3);
    await d.wait(2.4);
    d.hold(two.pos, two.look);
    await d.say('Ruwan', 'Meet me tonight at Galle Face. Eight o\'clock, by the food carts.', 3.6);
    await d.say('Ruwan', 'And Kavindu — if you see a black SUV twice, it isn\'t a coincidence.', 3.8);
    // a black SUV crawls past through the puddles; Ruwan watches it, then leaves
    const lane = MEET.z - 3.4; // westbound (left-hand traffic) lane next to the kerb d.driveBy('suv', [[MEET.x + 70, lane], [MEET.x + 20, lane], [MEET.x - 40, lane], [MEET.x - 160, lane]], 8.5, 31);
    d.face(ruwan, MEET.x + 40, lane);
    await d.shot({ pos: [MEET.x - 6, 0.6, MEET.z - 1.4], look: [MEET.x + 20, 0.8, lane] }, { pos: [MEET.x - 6.5, 0.7, MEET.z - 1.6], look: [MEET.x - 10, 0.9, lane] }, 6.5);
    d.hold(two.pos, two.look);
    await d.say('Kavindu', 'Ruwan—', 1.1);
    d.walkTo(ruwan, MEET.x + 14, MEET.z + 0.6, 1.5);
    await d.say('Ruwan', 'Eight o\'clock. Don\'t be late.', 2.4);
    await d.shot({ pos: [MEET.x - 3.5, 1.7, MEET.z - 1.3], look: [MEET.x + 8, 1.4, MEET.z] }, { pos: [MEET.x - 3.8, 1.75, MEET.z - 1.5], look: [MEET.x + 14, 1.5, MEET.z] }, 4);
    // title card over the rainy street, then the camera settles behind Kavindu
    hud.titleCard('<div class="mb-title big">COLOMBO</div><div class="mb-sub">SHADOWS OF THE ISLAND</div>', 4.5);
    await d.shot({ pos: [MEET.x - 1, 7, MEET.z - 10], look: [MEET.x, 1.5, MEET.z] }, { pos: [MEET.x - 1 - 3.6, 2.1, MEET.z + 0.2], look: [MEET.x - 1, 1.55, MEET.z] }, 5, easeOut);
  } finally {
    skipper();
    folder.parent && folder.parent.remove(folder);
    d.removeActor('Ruwan'); d.clearVehicles(); P.ch.anim.set(null);
    const p = P.ch.root.position; P.x = p.x; P.z = p.z; P.y = p.y; P.yaw = Math.atan2(1, 0); P.sync();
    A.forceWeather(null); A.setWeather('rain'); A.weatherTimer = 220;
    d.end(); Audio.setMusic('explore');
    if (d.skip) { await hud.fade(1, 0.01); await hud.fade(0, 0.8); }
  }
}
