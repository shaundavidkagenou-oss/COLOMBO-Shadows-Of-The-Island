// Traffic police on point duty — a familiar Colombo sight: an officer in the white-topped cap, white gauntlets and
// white belt/cross strap standing at the corner of a busy signalised junction, palm out to the stopped approach and
// beckoning the moving one. The hand signals follow the junction's real signal phase (Layout.signalState), so they
// always agree with what the traffic is doing. Daytime only; streamed in near the player and cached.
import { Character } from '../actors/Character.js';
import { makePoliceAppearance } from '../actors/Appearance.js';
import * as L from '../world/Layout.js';

const hash = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };
const NEAR = 110, FAR = 140, MAX_ACTIVE = 4;

export class TrafficDuty {
  constructor(game) {
    this.g = game; this.posts = []; this.acc = 0; this.spotT = 0;
    for (const n of L.nodes) {
      if (!n.signal || n.segs.length < 4 || hash(n.i, n.j) > 0.4) continue; // about two in five four-way signalised junctions
      const sx = hash(n.j, n.i) < 0.5 ? -1 : 1, sz = hash(n.i + 7, n.j) < 0.5 ? -1 : 1;
      const x = n.x + sx * (n.hwV + 1.7), z = n.z + sz * (n.hwH + 1.7);
      if (L.isWater(x, z) || L.roadAt(x, z) || L.zoneAt(x, z)) continue;
      this.posts.push({ n, sx, sz, x, z, yaw: Math.atan2(n.x - x, n.z - z), ch: null, on: false, seed: 900 + this.posts.length * 13 });
    }
  }
  get active() { return this.posts.filter((p) => p.on); }
  update(dt) {
    const g = this.g, P = g.player, A = g.atmos; const day = A.hour >= 7 && A.hour < 19;
    this.acc -= dt;
    if (this.acc <= 0) { this.acc = 0.5; // streaming
      let n = 0; const order = this.posts.map((p) => [p, Math.hypot(p.x - P.x, p.z - P.z)]).sort((a, b) => a[1] - b[1]);
      for (const [p, d] of order) { const want = day && n < MAX_ACTIVE && (p.on ? d < FAR : d < NEAR); if (want) n++;
        if (want && !p.on) { if (!p.ch) { p.ch = new Character(makePoliceAppearance(p.seed, 'traffic')); p.ch.anim.set('signal'); } p.ch.root.position.set(p.x, L.groundY(p.x, p.z), p.z); p.ch.root.rotation.y = p.yaw; g.scene.add(p.ch.root); p.on = true; }
        else if (!want && p.on) { g.scene.remove(p.ch.root); p.on = false; } }
    }
    const PO = g.police; this.spotT -= dt;
    for (const p of this.posts) { if (!p.on) continue; const a = p.ch.anim, d = Math.hypot(p.x - P.x, p.z - P.z);
      // a wanted suspect walking or driving past an officer on duty gets reported
      if (PO && PO.level > 0 && d < 18 && this.spotT <= 0) { this.spotT = 1; PO.spotted && PO.spotted(); }
      if (PO && PO.level > 0 && d < 30) { if (a.action !== 'point') a.set('point'); p.ch.root.rotation.y = Math.atan2(P.x - p.x, P.z - p.z); }
      else { if (a.action !== 'signal') { a.set('signal'); p.ch.root.rotation.y = p.yaw; }
        const t = g.clock || 0, v = L.signalState(p.n, 'v', t), h = L.signalState(p.n, 'h', t); const vRight = p.sx * p.sz < 0; // which road lies to the officer's right
        a.sigSide = v === 'green' ? (vRight ? 1 : -1) : h === 'green' ? (vRight ? -1 : 1) : 0; }
      if (d < 70) a.update(dt, 0); }
  }
  hideAll() { for (const p of this.posts) if (p.on) { this.g.scene.remove(p.ch.root); p.on = false; } }
}
