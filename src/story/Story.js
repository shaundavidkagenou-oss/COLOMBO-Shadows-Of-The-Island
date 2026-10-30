// Campaign, missions (checkpointed stages), relationships, side activities and collectibles.
import * as THREE from 'three';
import * as L from '../world/Layout.js';
import { plan } from '../world/CityPlan.js';
import { HEROES, randomSpec, Character } from '../actors/Character.js';
import { seatCharacter } from '../actors/Seating.js';
import { Vehicle } from '../vehicles/Vehicle.js';
import { Input } from '../core/Input.js';
import { Audio } from '../audio/Audio.js';
import { RNG } from '../core/rng.js';
import { clamp, dampAngle } from '../core/math.js';

class Cancel extends Error {}
const P = L.PLACES;
export const MISSIONS = [
  // lead = the protagonist who starts (and, outside free-switch stages, plays) the mission
  { id: 'm0', title: 'The Meeting', giver: 'Ruwan', lead: 'dineth', desc: 'Dineth is back in Colombo after seven years. Ruwan has something to show him — and has called in two old friends.' },
  { id: 'm1', title: 'Galle Face After Dark', giver: 'Ruwan', lead: 'dineth', desc: 'Meet Ruwan by the food carts on Galle Face Green at night. Shashika and David stay close.' },
  { id: 'm2', title: 'Paper Trail', giver: 'Ruwan', lead: 'dineth', desc: 'Talk to the Pettah shopkeepers who received the letters, then get eyes on the company they name.' },
  { id: 'm3', title: 'The Courier', giver: 'Ruwan', lead: 'david', desc: 'David tails the Harbour Crest courier van and finds out where the papers go.' },
  { id: 'm4', title: 'Rain Run', giver: 'Anjali Fernando', lead: 'shashika', desc: 'Shashika gets the evidence across a flooded city to Anjali before the presses close.' },
  { id: 'm5', title: 'Lotus Tower', giver: 'Dilan Wickramaratne', lead: 'dineth', desc: 'Dilan wants to meet Dineth on top of the city. All three of you go.' },
];
const STAMPS = [[-60, -930], [-300, -860], [-470, -600], [-520, -380], [280, -450], [-130, -330], [110, 60], [250, -110], [-150, -160], [460, -760], [380, -1050], [-90, -1060], [-330, 300], [-340, 700], [-380, 1120], [660, 140], [620, -240], [40, -820], [-420, -940], [740, 230]];
const PHOTO_SPOTS = [
  { id: 'lotus', name: 'Lotus Tower', x: 305, y: 120, z: -480, view: [230, -560] },
  { id: 'mosque', name: 'Jami Ul-Alfar Mosque', x: 13, y: 14, z: -877, view: [-20, -905] },
  { id: 'clock', name: 'Fort Clock Tower', x: -385, y: 18, z: -915, view: [-400, -880] },
  { id: 'gfhotel', name: 'Galle Face Hotel', x: -440, y: 12, z: -222, view: [-470, -280] },
  { id: 'townhall', name: 'Town Hall', x: 246, y: 20, z: -30, view: [246, -110] },
  { id: 'seema', name: 'Seema Malaka', x: -112, y: 4, z: -300, view: [-150, -340] },
  { id: 'lighthouse', name: 'Colombo Lighthouse', x: -500, y: 18, z: -765, view: [-470, -700] },
  { id: 'stlucia', name: "St. Lucia's Cathedral", x: 360, y: 20, z: -1144, view: [360, -1060] },
];
const TRIALS = [
  { id: 'marine', name: 'Marine Drive Sprint', pts: [[-475, -150], [-475, 200], [-475, 600], [-475, 1000]], par: 75 },
  { id: 'fort', name: 'Fort Loop', pts: [[-280, -700], [-280, -900], [-10, -900], [-10, -660], [-280, -660]], par: 70 },
  { id: 'baseline', name: 'Baseline Run', pts: [[660, -800], [660, -240], [660, 40], [660, 400]], par: 60 },
];
export class Story {
  constructor(game) {
    this.g = game; this.state = Story.freshState(); this.conds = []; this.npcs = new Map(); this.running = null; this.side = null; this.talkTarget = null; this.photoTargets = []; this.pursuers = []; this.guards = [];
  }
  static freshState() { return { money: 2500, mission: { id: 'm0', stage: 0 }, done: [], rel: { ruwan: 50, fathima: 50, selvaraj: 50, bandara: 50, anjali: 50 }, stamps: [], photos: [], trials: {}, flags: {}, stats: { taxi: 0, deliveries: 0 }, ending: null, outfit: null, health: 100, ledger: [], msgs: [] }; }
  get hud() { return this.g.hud; }
  // ------------------------------------------------------------ primitives
  until(fn) { return new Promise((res, rej) => this.conds.push({ fn, res, rej, token: this.token })); }
  sleep(sec) { const t = this.g.clock + sec; return this.until(() => this.g.clock >= t); }
  cancelAll() { this.token = {}; for (const c of this.conds) c.rej(new Cancel()); this.conds = []; this.cleanupStage(); }
  safeSpot(x, z) { const col = this.g.collision; for (let r = 0; r < 30; r += 1.5) for (let a = 0; a < 8; a++) { const px = x + Math.cos(a * 0.785) * r, pz = z + Math.sin(a * 0.785) * r; if (!col.blocked(px, pz, 0.45) && !L.roadAt(px, pz)) return [px, pz]; } return [x, z]; }
  goto(t, title, text, { radius = 6, vehicle = null, onFoot = false, time = null } = {}) {
    this.hud.setObjective(title, text, t); let left = time;
    return this.until(() => {
      if (left !== null) { left -= this.g.dt; this.hud.setTimer(Math.max(0, left)); if (left <= 0) throw this.fail('Out of time.'); }
      const p = this.g.player; const d = Math.hypot(p.x - t.x, p.z - t.z);
      if (vehicle === true && !p.vehicle) { this.hud.prompt(`Get a vehicle ${this.hud.key('enter')}`); return false; }
      if (onFoot && p.vehicle) return false;
      if (d < radius) { this.hud.setTimer(null); return true; } return false;
    });
  }
  fail(reason) { const e = new Error('fail'); e.failReason = reason; return e; }
  spawnNPC(id, spec, x, z, yaw) { this.removeNPC(id); const a = this.g.director.spawnActor(id, spec, x, z, yaw); this.npcs.set(id, a); return a; }
  removeNPC(id) { if (this.npcs.has(id)) { this.g.director.removeActor(id); this.npcs.delete(id); } }
  talk(id, name, lines, { spec, x, z, yaw = 0, prompt = null } = {}) {
    let a = this.npcs.get(id); if (!a && spec) a = this.spawnNPC(id, spec, x, z, yaw);
    const pos = a.root.position; this.hud.setObjective(this.hud.objTitle.textContent, prompt || `Talk to ${name}`, { x: pos.x, z: pos.z });
    return this.until(() => { const p = this.g.player; const d = Math.hypot(p.x - pos.x, p.z - pos.z); if (d < 2.6 && !p.vehicle) { this.talkTarget = { name, id }; if (Input.wasPressed('interact')) return true; } else if (this.talkTarget && this.talkTarget.id === id) this.talkTarget = null; return false; })
      .then(() => { this.talkTarget = null; return this.conversation(a, lines); });
  }
  async conversation(a, lines) {
    const g = this.g, p = g.player, D = g.director; const pos = a.root.position;
    // stage the pair: player ~1.25 m in front of the NPC, facing each other
    let ox = p.x - pos.x, oz = p.z - pos.z, od = Math.hypot(ox, oz); if (od < 0.5) { ox = Math.sin(a.yaw || 0); oz = Math.cos(a.yaw || 0); od = 1; }
    const tx = pos.x + (ox / od) * 1.25, tz = pos.z + (oz / od) * 1.25; if (!g.collision.blocked(tx, tz, 0.28)) { p.x = tx; p.z = tz; p.y = g.collision.groundAt(tx, tz, p.y + 0.3); }
    D.face(a, p.x, p.z); p.yaw = Math.atan2(pos.x - p.x, pos.z - p.z); p.speed = 0; p.ch.anim.set(null); p.sync(); D.skip = false; D.begin(); g.hud.show(false);
    const mid = new THREE.Vector3((p.x + pos.x) / 2, 1.5 + pos.y, (p.z + pos.z) / 2); const dx = pos.x - p.x, dz = pos.z - p.z, d = Math.hypot(dx, dz) || 1;
    let best = null; for (const sgn of [1, -1]) { const nx = (dz / d) * sgn, nz = (-dx / d) * sgn; const cam = [mid.x + nx * 2.6 - dx / d * 0.7, mid.y + 0.2, mid.z + nz * 2.6 - dz / d * 0.7]; const t = g.collision.raycast(mid.x, mid.y, mid.z, cam[0], cam[1], cam[2], 0.3); if (!best || t > best.t) best = { cam, t }; if (t >= 1) break; }
    if (best.t < 1) best.cam = [mid.x + (best.cam[0] - mid.x) * Math.max(0.35, best.t - 0.05), best.cam[1], mid.z + (best.cam[2] - mid.z) * Math.max(0.35, best.t - 0.05)];
    D.hold(best.cam, [mid.x, mid.y, mid.z]);
    let result = null;
    for (const l of lines) {
      if (l.choice) { result = await g.hud.choice(l.choice, l.title || ''); if (l.onChoice) await l.onChoice(result); continue; }
      const who = l[0], text = l[1]; const sm = g.squad && g.squad.members.find((q) => q.def.name === who); const speaker = sm && sm.ch ? sm.ch : who === 'Dineth' ? p.ch : a; // NPC ids ('siri') differ from display names ('Siri')
      await D.say(who, text, null, l[2] || '', l[3] || 'en', speaker);
    }
    D.end(); return result;
  }
  photoTarget(t, label) { this.photoTargets.push({ ...t, label }); return this.until(() => t.done); }
  rel(who, d) { this.state.rel[who] = clamp(this.state.rel[who] + d, 0, 100); if (d) this.hud.notify(`${who[0].toUpperCase() + who.slice(1)} ${d > 0 ? 'appreciated that' : 'will remember that'}`, `Relationship ${d > 0 ? '+' : ''}${d}`, d > 0 ? 'success' : 'info', 3); }
  message(from, text) { const M = this.state.msgs || (this.state.msgs = []); const A = this.g.atmos; M.unshift({ from, text, when: A ? `Day ${A.day} ${A.timeString}` : '' }); if (M.length > 30) M.length = 30; }
  pay(n, why) { this.state.money += n; if (n) { const A = this.g.atmos; const L2 = this.state.ledger || (this.state.ledger = []); L2.unshift({ n, why: why || (n > 0 ? 'Income' : 'Payment'), bal: this.state.money, when: A ? `Day ${A.day} ${A.timeString}` : '' }); if (L2.length > 60) L2.length = 60; } if (n) this.hud.notify(`${n > 0 ? '+' : '−'} Rs. ${Math.abs(n).toLocaleString('en-LK')}`, why || '', n > 0 ? 'success' : 'info', 3); }
  cleanupStage() { for (const id of [...this.npcs.keys()]) this.removeNPC(id); this.photoTargets = []; this.clearPursuers(); this.clearGuards(); this.hud.setTimer(null); this.hud.clearBlips('m:'); if (this.follow) { this.g.traffic.remove(this.follow); this.follow = null; } this.g.director.clearVehicles(); }
  // ------------------------------------------------------------ squad: mission leads and free-switch stages
  leadFor(id) { const d = MISSIONS.find((m) => m.id === id); return d && d.lead ? d.lead : 'dineth'; }
  leadName(id) { const l = this.leadFor(id); return l[0].toUpperCase() + l.slice(1); }
  freeSwitch(on, note = null) { this.allowSwitch = on; if (on && note && this.g.squad && this.g.squad.unlocked) this.hud.notify('Squad', note, 'info', 6); }
  ensureLead(id) { // a stage that the lead must play: hand control back to them (a real transition when possible)
    const sq = this.g.squad; if (!sq || !sq.unlocked) return; const lead = this.leadFor(id); if (sq.activeId === lead) return; const i = sq.members.findIndex((m) => m.def.id === lead);
    this.hud.notify('Squad', `${sq.members[i].def.name} takes point for this part.`, 'info', 4); const P = this.g.player; if (!P.vehicle && !this.g.indoor && !this.g.director.active) sq.startSwitch(i); else sq.switchInstant(i);
  }
  // ------------------------------------------------------------ mission runner
  async startMission(id, stage = 0) {
    this.cancelAll(); this.token = {}; const def = MISSIONS.find((m) => m.id === id); if (!def) return;
    this.state.mission = { id, stage }; const stages = this['stages_' + id](); this.running = id;
    if (stage === 0) this.message(def.giver || 'Mission', `${def.title}: ${def.desc}`);
    if (stage === 0 && id !== 'm0') await this.hud.missionBanner('MISSION', def.title, def.desc);
    try {
      for (let s = stage; s < stages.length; s++) { this.state.mission.stage = s; if (s > stage) this.g.autosave(); this.allowSwitch = false; if (!(stages[s].free)) this.ensureLead(id); await stages[s](); }
      this.allowSwitch = false;
      this.complete(id);
    } catch (e) {
      this.allowSwitch = false; if (e instanceof Cancel) return;
      if (e && e.failReason) { await this.failMission(id, e.failReason); return; }
      console.error(e);
    }
  }
  async failMission(id, reason) {
    const stage = this.state.mission.stage; this.cancelAll(); this.token = {}; this.hud.setObjective('', '');
    await this.hud.titleCard(`<div class="mb-top fail">MISSION FAILED</div><div class="mb-sub">${reason}</div>`, 2.5);
    Audio.ui('fail'); this.retryAt = { id, stage }; this.hud.notify('Retry', `Press ${this.hud.key('interact')} to retry from the last checkpoint`, 'info', 8);
    const t = this.g.clock + 8; await this.until(() => Input.wasPressed('interact') || this.g.clock > t).catch(() => {});
    this.startMission(id, stage);
  }
  complete(id) {
    const def = MISSIONS.find((m) => m.id === id); this.running = null; if (!this.state.done.includes(id)) this.state.done.push(id);
    const idx = MISSIONS.findIndex((m) => m.id === id); const next = MISSIONS[idx + 1];
    this.hud.setObjective('', ''); this.cleanupStage();
    const rewards = { m0: 1000, m1: 3000, m2: 8000, m3: 12000, m4: 15000, m5: 50000 }; this.pay(rewards[id] || 0, 'Mission reward');
    this.hud.missionBanner('MISSION COMPLETE', def.title, next ? `Next: ${next.title}` : ''); Audio.ui('success');
    if (next) { this.state.mission = { id: next.id, stage: 0 }; this.offerNext(); } else this.state.mission = { id: null, stage: 0 };
    this.g.autosave();
  }
  // Show a start marker for the next mission (missions begin when you reach the marker)
  offerNext() {
    const m = this.state.mission; if (!m.id || this.running) return;
    const starts = { m0: P.meeting, m1: P.gfKade, m2: plan.missionShops.kade || P.kade, m3: P.warehouse, m4: P.police, m5: P.lotus };
    const s = starts[m.id]; const def = MISSIONS.find((q) => q.id === m.id);
    if (m.id === 'm1' && !this.isNight()) this.hud.setObjective(def.title, 'Meet Ruwan at Galle Face around 8 PM. You can rest at your room in Slave Island.', s);
    else this.hud.setObjective(def.title, `Go to the marker to begin`, s);
    this.hud.addBlip('start', s.x, s.z, 'mission', def.title); this.startPoint = { ...s, id: m.id };
  }
  isNight() { const h = this.g.atmos.hour; return h >= 19 || h < 4; }
  // ------------------------------------------------------------ M0 (after the opening cinematic)
  stages_m0() {
    const kade = plan.missionShops.kade || P.kade;
    return [
      async () => {
        this.hud.notify('Controls', `Move <kbd>W A S D</kbd> · Sprint ${this.hud.key('sprint')} · Jump/climb ${this.hud.key('jump')} · Camera ${this.hud.key('camera')}`, 'info', 9);
        await this.goto(kade, 'The Meeting', 'Get out of the rain — head to Lucky Tea Kade', { radius: 4 });
        const [x, z] = [kade.x + Math.sin(kade.faceIn) * 0.2, kade.z + Math.cos(kade.faceIn) * 0.2];
        await this.talk('siri', 'Siri', [
          ['Siri', 'Dineth? Aiyo, look at you! Seven years and not one postcard.'],
          ['Dineth', 'Uncle Siri. You still make the best plain tea in Pettah?'],
          ['Siri', 'Best and cheapest. For now. They sent me the letter too, you know. Sell or else.'],
          ['Dineth', 'Ruwan told me. Who is behind it?'],
          ['Siri', 'Nobody says the name loudly. Go home, rest. Your old room in Slave Island is still there — I kept paying the lock.'],
          ['Siri', 'Here, take some money. And take a tuk. You will melt in this rain.'],
        ], { spec: randomSpec(4242, { sex: 'm', age: 'elder', outfit: 'shirt', top: '#f2f2ee' }), x, z, yaw: kade.rot + Math.PI });
        this.pay(1500, 'Uncle Siri');
      },
      async () => {
        this.hud.notify('Vehicles', `Stand next to a vehicle and press ${this.hud.key('enter')} to get in. Parked tuk-tuks are everywhere.`, 'info', 8);
        const [rx, rz] = this.safeSpot(P.slaveFlat.x, P.slaveFlat.z); this.state.flags.room = [rx, rz];
        await this.goto({ x: rx, z: rz }, 'The Meeting', "Go to your old room in Slave Island", { radius: 5 });
      },
      async () => { // Ruwan called in two old friends: the squad assembles at the door
        const [rx, rz] = this.state.flags.room; const sq = this.g.squad; const p = this.g.player;
        if (this.state.flags.squad && sq && sq.unlocked) return; if (sq && !sq.unlocked) sq.unlock(false);
        // meet on open pavement near the door (room for the two-shot camera), not against the wall
        let gx = rx, gz = rz; search: for (const r of [2, 3.5, 5, 7, 9]) for (let k = 0; k < 16; k++) { const an = (k / 16) * Math.PI * 2, x = rx + Math.sin(an) * r, z = rz + Math.cos(an) * r; if (!this.g.collision.blocked(x, z, 2.6) && !L.roadAt(x, z)) { gx = x; gz = z; break search; } }
        if (Math.hypot(p.x - gx, p.z - gz) > 0.5) { await this.hud.fade(1, 0.35); p.teleport(gx, gz, Math.atan2(rx - gx, rz - gz)); this.hud.fade(0, 0.6); }
        const fy = p.yaw; const off = (a, d) => this.safeSpot(gx + Math.sin(fy + a) * d, gz + Math.cos(fy + a) * d);
        const [sx, sz] = off(0.5, 1.6), [dx, dz] = off(-0.6, 1.8);
        const sh = sq ? sq.placeAt('shashika', sx, sz, fy) : null; sq && sq.placeAt('david', dx, dz, fy);
        if (sh) await this.conversation(sh, [
          ['Shashika', 'Machan! Seven years and you walk in looking like a wet cat.'],
          ['Dineth', 'Shashika? Ruwan said he had called someone. I didn\'t think he meant my cousin.'],
          ['Shashika', 'He called both of us. This is David — David Rodrigo. Telecom engineer, national rifle team, and he fixes my phone for free.'],
          ['David', 'Only when he stops dropping it in the harbour. Good to finally meet you, Dineth. Ruwan showed us the folder.'],
          ['Dineth', 'Then you know what Harbour Crest is doing to Pettah.'],
          ['David', 'I know their paperwork is too clean. Stamps from offices that closed years ago. Shell companies. Somebody is very organised.'],
          ['Shashika', 'And organised people hire security. That is my side of the business — I know half the guards at the port.'],
          { choice: ['"Then we do this together."', '"I can handle it alone."'], onChoice: async (i) => { if (i === 1) await this.g.director.say('Shashika', 'Alone you will end up in Beira Lake. We stay together.', null, '', 'en', sq.memberById('shashika').ch); } },
          ['David', 'Rest first. Ruwan wants you at Galle Face tonight. We will be close.'],
        ]);
        this.state.flags.squad = true;
        this.hud.notify('Squad assembled', `Switch protagonist: tap <kbd>Z</kbd> for the next one, hold <kbd>Z</kbd> for the squad selector, or <kbd>F1</kbd> Dineth · <kbd>F2</kbd> Shashika · <kbd>F3</kbd> David. The other two follow on their own, ride with you and can hold a position (hold <kbd>Z</kbd>, then <kbd>E</kbd>).`, 'info', 14);
      },
      async () => {
        const [rx, rz] = this.state.flags.room; this.hud.setObjective('The Meeting', `Rest until evening (${this.hud.key('interact')} at the door)`, { x: rx, z: rz });
        await this.until(() => { const p = this.g.player; if (Math.hypot(p.x - rx, p.z - rz) < 3 && !p.vehicle) { this.hud.prompt(`${this.hud.key('interact')} Rest until 7:45 PM`); return Input.wasPressed('interact'); } return false; });
        await this.g.restUntil(19.75);
      },
    ];
  }
  // ------------------------------------------------------------ M1
  stages_m1() {
    return [
      async () => {
        if (!this.isNight()) { this.hud.setObjective('Galle Face After Dark', 'Come back after 7 PM (rest at your room to pass time)', P.gfKade); await this.until(() => this.isNight()); }
        const [x, z] = this.safeSpot(P.gfKade.x + 4, P.gfKade.z);
        await this.talk('ruwan', 'Ruwan', [
          ['Ruwan', 'You came. Good. Sit, eat something. Isso vadai — you look like you missed it.'],
          ['Dineth', 'I opened the folder. Land deeds, eviction notices... and a company name. Harbour Crest Developments.'],
          ['Ruwan', 'On paper they are building a luxury tower. In reality they are buying the whole street for nothing, by scaring people.'],
          ['Ruwan', 'Three shopkeepers kept copies of everything: Mrs. Fathima, Mr. Selvaraj and Uncle Bandara. They trust me. They will trust you.'],
          { choice: ['"I\'ll help. For the street."', '"What do I get out of it?"'], onChoice: async (i) => { if (i === 0) this.rel('ruwan', 8); else { this.rel('ruwan', -5); await this.g.director.say('Ruwan', 'You get your city back, machan. That\'s the deal.'); } } },
          ['Ruwan', 'Careful. Someone has been watching me all evening. Black SUV, near the hotel.'],
          ...(this.g.squad && this.g.squad.unlocked ? [['Shashika', 'I saw it on Galle Road too. Dineth — go. We keep up.']] : []),
        ], { spec: HEROES.ruwan, x, z, yaw: -Math.PI / 2 });
      },
      async () => {
        this.removeNPC('ruwan'); this.hud.notify('Watch out', 'A black SUV is coming your way. Lose it!', 'warn', 5);
        await this.escape(2, 'Lose the black SUV', { dist: 170, hold: 7, timeLimit: 150 });
      },
    ];
  }
  // ------------------------------------------------------------ M2
  stages_m2() {
    const S = plan.missionShops; const near = (s) => { const [x, z] = [s.x + Math.sin(s.faceIn) * 0.3, s.z + Math.cos(s.faceIn) * 0.3]; return { x, z, yaw: s.rot + Math.PI }; };
    return [
      async () => {
        const f = near(S.fathima); await this.goto(S.fathima, 'Paper Trail', 'Visit Mrs. Fathima at Fathima Textiles', { radius: 6 });
        await this.talk('fathima', 'Mrs. Fathima', [
          ['Mrs. Fathima', 'Ruwan\'s friend? Come, come inside the doorway, the rain will ruin the fabric.'],
          ['Mrs. Fathima', 'My father opened this shop in 1971. Last month a man came with a lawyer and a price. A joke of a price.'],
          ['Dineth', 'Did you keep the letter?'],
          ['Mrs. Fathima', 'I kept everything. Here — the eviction notice. Look at the stamp. That office closed years ago.'],
          { choice: ['"We will stop them. I promise."', '"I can\'t promise anything, but I\'ll try."'], onChoice: async (i) => this.rel('fathima', i === 0 ? 6 : 3) },
        ], { spec: HEROES.fathima, ...f });
        this.hud.notify('Evidence', 'Forged eviction notice', 'collect', 4); this.state.flags.ev1 = true;
      },
      async () => {
        const s = near(S.selvaraj); await this.goto(S.selvaraj, 'Paper Trail', 'Visit Mr. Selvaraj at Selvaraj Electronics', { radius: 6 });
        await this.talk('selvaraj', 'Mr. Selvaraj', [
          ['Mr. Selvaraj', 'வணக்கம், தம்பி.', 'Hello, young man.', 'ta'],
          ['Mr. Selvaraj', 'They didn\'t only send letters. They cut my power three times. Then a man offered to "fix" it — if I signed.'],
          ['Mr. Selvaraj', 'I recorded him on one of these old phones. Electronics shop, after all.'],
          ['Dineth', 'You\'re a genius, uncle.'],
          ['Mr. Selvaraj', 'A careful old man. Take the memory card. And bring it back with good news.'],
        ], { spec: HEROES.selvaraj, ...s });
        this.hud.notify('Evidence', 'Recorded threat (memory card)', 'collect', 4); this.state.flags.ev2 = true;
      },
      async () => {
        const b = near(S.bandara); await this.goto(S.bandara, 'Paper Trail', 'Visit Uncle Bandara at Bandara Spice Stores', { radius: 6 });
        await this.talk('bandara', 'Uncle Bandara', [
          ['Uncle Bandara', 'ආයුබෝවන්, putha. Ruwan said you would come.', 'Ayubowan (greetings), son.', 'en'],
          ['Uncle Bandara', 'I signed. God forgive me, I signed. They said the debt on my lorry would just... go away. That was the price of my name.'],
          ['Uncle Bandara', 'But I kept the receipt they gave me. Harbour Crest. And a second company name — Sapphire Logistics. Union Place.'],
          { title: 'Uncle Bandara is ashamed.', choice: ['"Your name stays out of this."', '"People need to hear your story, uncle."'], onChoice: async (i) => { this.state.flags.bandaraPublic = i === 1; this.rel('bandara', i === 0 ? 8 : -2); if (i === 1) await this.g.director.say('Uncle Bandara', 'Maybe you are right. Maybe it is time somebody stopped being afraid.'); } },
        ], { spec: HEROES.bandara, ...b });
        this.hud.notify('Evidence', 'Payment receipt — Sapphire Logistics', 'collect', 4); this.state.flags.ev3 = true;
      },
      async () => {
        const w = P.warehouse; const t = { x: w.x, y: 6, z: w.z, done: false }; this.freeSwitch(true, 'Free switching: any of you can take the photo — David has the steadiest hands.');
        await this.goto(w, 'Paper Trail', 'Photograph the Sapphire Logistics warehouse at Union Place', { radius: 45 });
        this.hud.setObjective('Paper Trail', `Take a photo of the warehouse (${this.hud.key('phone')} camera)`, w); await this.photoTarget(t, 'warehouse');
      },
    ];
  }
  // ------------------------------------------------------------ M3
  stages_m3() {
    return [
      async () => {
        const [x, z] = this.safeSpot(P.warehouse.x - 25, P.warehouse.z - 10);
        await this.talk('ruwan', 'Ruwan', [
          ['Ruwan', 'That warehouse never sleeps. Every night a white van leaves for the port with document boxes.'],
          ['Ruwan', 'David, this one is yours. Dineth says you can follow a signal through half of Colombo.'],
          ['David', 'A van is easier than a signal. Vans don\'t hop between towers. I just stay three cars back.'],
          ['Ruwan', 'Stay back — if the driver sees you, it\'s over. I found you a ride.'],
        ], { spec: HEROES.ruwan, x, z, yaw: 0 });
        this.removeNPC('ruwan');
        const pt = this.safeRoadSpot(x, z); const v = new Vehicle('tuktuk', 31, this.g.scene); v.place(pt[0], pt[1], pt[2]); this.g.traffic.release(v); v.keep = true;
        this.hud.addBlip('m:ride', pt[0], pt[1], 'side');
        await this.goto({ x: pt[0], z: pt[1] }, 'The Courier', 'Get in the tuk-tuk Ruwan arranged', { radius: 3 });
        await this.until(() => !!this.g.player.vehicle);
      },
      async () => { await this.followVehicle('van', [[-120, -40], [-280, -40], [-280, -240], [-280, -660], [-280, -900], [-150, -900], [-150, -1000], [-100, -1040]], 'Follow the courier van — don\'t get too close'); },
      async () => {
        this.hud.notify('Sneak', `Crouch with ${this.hud.key('crouch')}. Stay out of the guards\' sight. Your squad-mates crouch with you.`, 'info', 6); this.freeSwitch(true, 'Free switching: send whoever you like into the yard — or leave someone holding the gate (hold Z, then E).');
        const tgt = { x: -95, y: 1.5, z: -1080, done: false };
        this.spawnGuards([[[-130, -1070], [-60, -1070]], [[-110, -1100], [-110, -1050]], [[-70, -1095], [-140, -1095]]]);
        this.hud.setObjective('The Courier', 'Sneak into the yard and photograph the shipping ledger', tgt);
        await this.photoTarget(tgt, 'ledger');
        this.clearGuards(); this.hud.notify('Evidence', 'Shipping ledger: deeds sent offshore', 'collect', 4); this.state.flags.ev4 = true;
      },
      Object.assign(async () => { this.freeSwitch(true); this.hud.notify('Spotted!', 'Nalin "Gold" Fonseka\'s men are on to you. Get out of the port!', 'warn', 5); await this.escape(2, 'Escape the port', { dist: 180, hold: 8, timeLimit: 180 }); }, { free: true }),
    ];
  }
  // ------------------------------------------------------------ M4
  stages_m4() {
    const tailor = plan.missionShops.tailor || P.tailor;
    return [
      async () => {
        this.g.atmos.forceWeather('rain');
        const [x, z] = this.safeSpot(P.police.x + 6, P.police.z + 12);
        await this.talk('anjali', 'Anjali Fernando', [
          ['Anjali Fernando', 'You must be Shashika. Dineth says if anyone can get through Colombo in this rain, it\'s you. I\'m Anjali — I write for the Sunday paper.'],
          ['Shashika', 'Dineth says too much. David has the ledger copied three times. What do you need?'],
          ['Anjali Fernando', 'If this goes to print tonight, nobody can bury it. But the presses close at midnight and the files are with my source in Bambalapitiya.'],
          ['Anjali Fernando', 'Ceylon Threads, the tailor on Galle Road. Collect the envelope and bring everything to the Town Hall steps. Fast.'],
          { choice: ['"Consider it done."', '"Why should I trust a journalist?"'], onChoice: async (i) => { this.rel('anjali', i === 0 ? 6 : -3); if (i === 1) await this.g.director.say('Anjali Fernando', 'Because I\'m the only one in this city who wants to be sued by Harbour Crest.'); } },
        ], { spec: HEROES.anjali, x, z, yaw: Math.PI });
        this.removeNPC('anjali');
      },
      async () => { await this.goto(tailor, 'Rain Run', 'Collect the envelope at Ceylon Threads, Bambalapitiya', { radius: 6, time: 150 }); this.hud.notify('Envelope collected', 'Now get to the Town Hall', 'collect', 3); },
      async () => {
        const th = { x: P.townhall.x, z: P.townhall.z - 70 }; let spawned = false;
        const run = this.goto(th, 'Rain Run', 'Deliver the files to Anjali at the Town Hall', { radius: 10, time: 170 });
        const chase = this.until(() => { if (!spawned && this.g.clock > (this.chaseAt ??= this.g.clock + 20)) { spawned = true; this.spawnPursuers(2); this.hud.notify('Pursuers', 'Black SUVs behind you — don\'t let them box you in!', 'warn', 4); } return false; });
        void chase; await run; this.clearPursuers(); this.chaseAt = null;
        const [x, z] = this.safeSpot(th.x, th.z);
        await this.talk('anjali', 'Anjali Fernando', [['Anjali Fernando', 'You made it! Soaked, but you made it. This is enough to go to print.'], ['Anjali Fernando', 'Expect a call. Men like Dilan don\'t like reading about themselves.']], { spec: HEROES.anjali, x, z, yaw: 0 });
        this.g.atmos.forceWeather(null);
      },
    ];
  }
  // ------------------------------------------------------------ M5
  stages_m5() {
    return [
      async () => {
        const l = P.lotus; const [x, z] = this.safeSpot(l.x - 30, l.z + 60);
        await this.goto({ x, z }, 'Lotus Tower', 'Go to the Lotus Tower', { radius: 8 });
        await this.talk('dilan', 'Dilan Wickramaratne', [
          ['Dilan Wickramaratne', 'Dineth Jayasekara. The boy who left. Do you know how many jobs my tower will create?'],
          ['Dineth', 'You forged deeds and threatened old shopkeepers. That\'s not development.'],
          ['Dilan Wickramaratne', 'That\'s Colombo, my friend. Everyone signs eventually. I can make it worth your while — a flat with a sea view.'],
          ['Dilan Wickramaratne', 'Or Nalin can make sure you leave the island again. Decide.'],
          { title: 'What do you do with the evidence?', choice: ['Publish everything with Anjali', 'Take it to the police', 'Make Dilan return the shops — and keep quiet'], onChoice: async (i) => { this.state.ending = ['press', 'police', 'deal'][i]; } },
        ], { spec: HEROES.dilan, x, z, yaw: Math.PI });
        this.removeNPC('dilan');
      },
      async () => {
        if (this.state.ending === 'deal') { this.hud.notify('Dilan', 'The deeds will be returned. Nalin is not happy.', 'info', 5); }
        else { this.hud.notify('Nalin "Gold" Fonseka', 'His men are coming for the evidence. Get to Galle Face!', 'warn', 5); this.spawnPursuers(3); }
        this.freeSwitch(true, 'Free switching: all three of you are in this.');
        await this.goto(P.gfPromenade, 'Lotus Tower', this.state.ending === 'deal' ? 'Meet Ruwan at Galle Face Promenade' : 'Reach Galle Face Promenade with the evidence', { radius: 14, time: this.state.ending === 'deal' ? null : 200 });
        this.clearPursuers();
      },
      Object.assign(async () => { await this.g.playEnding(this.state.ending, this.state); }, { free: true }),
    ];
  }
  // ------------------------------------------------------------ chase / follow / stealth helpers
  safeRoadSpot(x, z) { const n = L.nodes.filter((q) => q.segs.length).reduce((b, q) => ((q.x - x) ** 2 + (q.z - z) ** 2 < (b.x - x) ** 2 + (b.z - z) ** 2 ? q : b)); const s = n.segs[0]; const [dx, dz] = s.dir === 'v' ? [0, 1] : [1, 0]; return [n.x + dx * (n.hwH + n.hwV + 8) + dz * s.hw * 0.5, n.z + dz * (n.hwH + n.hwV + 8) - dx * s.hw * 0.5, Math.atan2(dx, dz)]; }
  spawnPursuers(n) {
    const p = this.g.player;
    for (let i = 0; i < n; i++) {
      let best = null; for (const node of L.nodes) { if (!node.segs.length) continue; const d = Math.hypot(node.x - p.x, node.z - p.z); if (d > 70 && d < 140 && (!best || Math.abs(d - 100) < Math.abs(best.d - 100)) && !this.pursuers.some((q) => Math.hypot(q.x - node.x, q.z - node.z) < 20)) best = { node, d }; }
      if (!best) continue; const v = new Vehicle('suv', 900 + i, this.g.scene); v.place(best.node.x, best.node.z, Math.atan2(p.x - best.node.x, p.z - best.node.z)); v.keep = true; v.pursuer = { stuck: 0, reverse: 0 }; this.g.traffic.addDriver(v); v.lights = true; this.pursuers.push(v);
    }
  }
  clearPursuers() { for (const v of this.pursuers) this.g.traffic.remove(v); this.pursuers = []; this.hud.clearBlips('m:p'); }
  updatePursuers(dt) {
    const p = this.g.player; const tgt = p.vehicle || p; const others = this.g.traffic.all().concat(this.pursuers);
    this.pursuers.forEach((v, i) => {
      const s = v.pursuer; const dx = tgt.x - v.x, dz = tgt.z - v.z; const want = Math.atan2(dx, dz); const diff = Math.atan2(Math.sin(want - v.yaw), Math.cos(want - v.yaw)); const d = Math.hypot(dx, dz);
      let throttle = d < 8 ? 0.2 : 1, steer = clamp(diff * 2, -1, 1);
      if (Math.abs(v.speed) < 1 && d > 10) s.stuck += dt; else s.stuck = 0; if (s.stuck > 1.5) { s.reverse = 1.4; s.stuck = 0; }
      if (s.reverse > 0) { s.reverse -= dt; throttle = -1; steer = -steer; }
      v.drive(dt, { throttle, steer, handbrake: false }, this.g.collision, others.filter((o) => o !== v)); this.hud.addBlip('m:p' + i, v.x, v.z, 'enemy');
    });
  }
  escape(n, text, { dist = 160, hold = 6, timeLimit = 150 } = {}) {
    this.spawnPursuers(n); this.hud.setObjective('Escape', text, null); let away = 0, caught = 0, left = timeLimit; Audio.setMusic('chase');
    return this.until(() => {
      const p = this.g.player; const near = Math.min(...this.pursuers.map((v) => Math.hypot(v.x - p.x, v.z - p.z)), 999);
      if (near > dist) away += this.g.dt; else away = Math.max(0, away - this.g.dt * 0.5);
      if (near < 7 && Math.abs((p.vehicle ? p.vehicle.speed : p.speed)) < 2.5) caught += this.g.dt; else caught = Math.max(0, caught - this.g.dt);
      left -= this.g.dt; this.hud.setTimer(Math.max(0, left)); this.hud.prompt(away > 0 ? `Losing them… ${Math.ceil(hold - away)}` : '');
      if (caught > 4) throw this.fail('Nalin\'s men boxed you in.'); if (left <= 0) throw this.fail('They kept up with you.');
      if (away >= hold) { this.clearPursuers(); this.hud.setTimer(null); this.hud.prompt(''); Audio.setMusic('explore'); this.hud.notify('You lost them', '', 'success', 3); return true; } return false;
    });
  }
  followVehicle(type, route, text) {
    const v = new Vehicle(type, 77, this.g.scene); v.place(route[0][0], route[0][1], Math.atan2(route[1][0] - route[0][0], route[1][1] - route[0][1])); v.keep = true; this.g.traffic.addDriver(v); this.follow = v; let i = 1, far = 0, close = 0;
    this.hud.setObjective('The Courier', text, null);
    return this.until(() => {
      const p = this.g.player; const pv = p.vehicle || p; const d = Math.hypot(pv.x - v.x, pv.z - v.z); const dt = this.g.dt;
      const tg = route[i]; if (tg) { const dx = tg[0] - v.x, dz = tg[1] - v.z, dd = Math.hypot(dx, dz); if (dd < 4) i++; else { const sp = d < 15 ? 5 : d > 70 ? 6 : 9; v.yaw = dampAngle(v.yaw, Math.atan2(dx, dz), 2.5, dt); v.speed = sp; v.x += Math.sin(v.yaw) * sp * dt; v.z += Math.cos(v.yaw) * sp * dt; v.y = L.groundY(v.x, v.z); v.sync(dt); } }
      this.hud.addBlip('m:follow', v.x, v.z, 'objective'); this.hud.objective = { x: v.x, z: v.z };
      if (d > 110) far += dt; else far = 0; if (d < 12) close += dt; else close = Math.max(0, close - dt * 0.5);
      this.hud.prompt(d < 18 ? '<span class="warn">Too close!</span>' : d > 90 ? '<span class="warn">You\'re losing the van</span>' : '');
      if (far > 7) throw this.fail('You lost the courier.'); if (close > 5) throw this.fail('The courier spotted you.');
      if (!tg) { this.hud.prompt(''); this.g.traffic.remove(v); this.follow = null; return true; } return false;
    });
  }
  spawnGuards(routes) { this.guards = routes.map((r, i) => { const a = this.g.director.spawnActor('guard' + i, { ...HEROES.nalin, seed: 80 + i, top: '#2a2a2a', beard: i % 2 === 0, bangles: false }, r[0][0], r[0][1], 0); return { a, r, i: 1, alert: 0 }; }); this.detect = 0; }
  clearGuards() { for (const g of this.guards || []) this.g.director.removeActor(g.a.id); this.guards = []; }
  updateGuards(dt) {
    if (!this.guards.length) return; const p = this.g.player; let seen = false;
    for (const gd of this.guards) {
      const pos = gd.a.root.position; const tg = gd.r[gd.i]; const dx = tg[0] - pos.x, dz = tg[1] - pos.z, d = Math.hypot(dx, dz);
      if (d < 0.5) gd.i = (gd.i + 1) % gd.r.length; else { gd.a.yaw = dampAngle(gd.a.yaw || 0, Math.atan2(dx, dz), 4, dt); gd.a.root.rotation.y = gd.a.yaw; pos.x += dx / d * 1.2 * dt; pos.z += dz / d * 1.2 * dt; }
      gd.a.anim.update(dt, 1.2);
      const px = p.x - pos.x, pz = p.z - pos.z, pd = Math.hypot(px, pz); const ang = Math.abs(Math.atan2(Math.sin(Math.atan2(px, pz) - gd.a.yaw), Math.cos(Math.atan2(px, pz) - gd.a.yaw)));
      const range = p.crouching ? 8 : 16; if (pd < range && ang < 0.75 && this.g.collision.raycast(pos.x, 1.6, pos.z, p.x, 1.4, p.z, 0.05) >= 1) seen = true; if (pd < 2) seen = true;
    }
    this.detect = clamp(this.detect + (seen ? dt * 0.6 : -dt * 0.25), 0, 1); this.hud.prompt(this.detect > 0.02 ? `<span class="warn">Detection ${'▮'.repeat(Math.ceil(this.detect * 10))}</span>` : '');
    if (this.detect >= 1) { this.detect = 0; for (const c of this.conds) c.rej(this.fail('A guard spotted you.')); this.conds = []; }
  }
  // ------------------------------------------------------------ side activities
  setupWorldActivities() {
    STAMPS.forEach(([x, z], i) => { if (!this.state.stamps.includes(i)) { const [sx, sz] = this.safeSpot(x, z); STAMPS[i] = [sx, sz]; this.hud.addBlip('stamp' + i, sx, sz, 'stamp'); } });
    PHOTO_SPOTS.forEach((s) => { if (!this.state.photos.includes(s.id)) this.hud.addBlip('photo' + s.id, s.view[0], s.view[1], 'photo'); });
    TRIALS.forEach((t) => this.hud.addBlip('trial' + t.id, t.pts[0][0], t.pts[0][1], 'side', t.name));
    const S = plan.missionShops; if (S.kade) this.hud.addBlip('shop_kade', S.kade.x, S.kade.z, 'shop', 'Tea Kade'); if (S.garage) this.hud.addBlip('shop_garage', S.garage.x, S.garage.z, 'shop', 'Garage'); if (S.tailor) this.hud.addBlip('shop_tailor', S.tailor.x, S.tailor.z, 'shop', 'Tailor');
    this.stampMeshes = STAMPS.map(([x, z], i) => { if (this.state.stamps.includes(i)) return null; const m = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.4, 0.02), new THREE.MeshStandardMaterial({ color: 0xd8a0ff, emissive: 0x9a50ff, emissiveIntensity: 0.8 })); m.position.set(x, 1.1, z); this.g.scene.add(m); return m; });
  }
  updateSide(dt) {
    const p = this.g.player; const pv = p.vehicle;
    // stamps
    if (this.stampMeshes) this.stampMeshes.forEach((m, i) => { if (!m) return; m.rotation.y += dt * 2; m.position.y = 1.1 + Math.sin(this.g.clock * 2 + i) * 0.1; if (Math.hypot(p.x - m.position.x, p.z - m.position.z) < 1.6) { this.g.scene.remove(m); this.stampMeshes[i] = null; this.state.stamps.push(i); this.hud.removeBlip('stamp' + i); this.hud.notify('Old Ceylon Stamp', `${this.state.stamps.length} / ${STAMPS.length} found`, 'collect', 4); this.pay(250); if (this.state.stamps.length === STAMPS.length) this.pay(10000, 'Complete stamp collection!'); } });
    // prompts for shops and activities (only when not in a mission conversation)
    if (this.side) { this.side.update(dt); return; }
    if (this.g.phone?.open || this.g.health?.busy) { this.sidePrompt = null; return; } // E confirms inside the phone: never buy/start things behind it
    const S = plan.missionShops; let pr = null;
    if (!pv && S.kade && Math.hypot(p.x - S.kade.x, p.z - S.kade.z) < 3 && this.running !== 'm0') { pr = `${this.hud.key('interact')} Plain tea & rotti (Rs. 150) · ${this.hud.key('more')} Delivery job`; if (Input.wasPressed('interact')) this.buyFood(); if (Input.wasPressed('more')) this.startDelivery(); }
    if (!pv && S.tailor && Math.hypot(p.x - S.tailor.x, p.z - S.tailor.z) < 3) { pr = `${this.hud.key('interact')} New jacket colour (Rs. 2,000)`; if (Input.wasPressed('interact')) this.buyOutfit(); }
    if (pv && S.garage && Math.hypot(p.x - S.garage.x, p.z - S.garage.z) < 8) { pr = `${this.hud.key('interact')} Repair vehicle (Rs. 800)`; if (Input.wasPressed('interact')) { if (this.state.money >= 800) { this.pay(-800, 'Repairs'); pv.damage = 0; this.hud.notify('Vehicle repaired'); } else this.hud.notify('Not enough money'); } }
    if (pv && pv.type === 'tuktuk' && !this.running) { pr = pr || `${this.hud.key('more')} Start tuk-tuk taxi job`; if (Input.wasPressed('more')) this.startTaxi(); }
    for (const t of TRIALS) if (pv && Math.hypot(p.x - t.pts[0][0], p.z - t.pts[0][1]) < 10 && !this.running) { pr = `${this.hud.key('more')} Start time trial: ${t.name}`; if (Input.wasPressed('more')) this.startTrial(t); }
    for (const sp of PHOTO_SPOTS) if (!this.state.photos.includes(sp.id) && Math.hypot(p.x - sp.view[0], p.z - sp.view[1]) < 40 && !pv) pr = pr || `Photo spot: ${sp.name} — open the phone (${this.hud.key('phone')}) → Camera`;
    if (this.startPoint && !this.running) { const s = this.startPoint; if (Math.hypot(p.x - s.x, p.z - s.z) < 8) { const sq = this.g.squad, lead = this.leadFor(s.id), md = sq && sq.memberById(lead); if (sq && sq.unlocked && sq.activeId !== lead) { pr = `${md.def.name} leads this mission — switch with <kbd>${md.def.key}</kbd> or <kbd>Z</kbd>`; } else { pr = `${this.hud.key('interact')} Start mission: ${MISSIONS.find((m) => m.id === s.id).title}`; } if (pr.includes('Start mission') && Input.wasPressed('interact')) { this.hud.removeBlip('start'); this.startPoint = null; this.startMission(s.id, this.state.mission.stage || 0); } } }
    if (pr || !this.talkTarget) this.sidePrompt = pr; else this.sidePrompt = null;
  }
  buyFood() { if (this.state.money < 150) { this.hud.notify('Not enough money'); return; } this.pay(-150, 'Plain tea & rotti'); this.g.player.stamina = 1; this.g.health?.heal(25); this.hud.subtitle('Siri', 'Fresh rotti, extra pol sambol. On the house next time, maybe!', '', 3); }
  buyOutfit() { if (this.state.money < 2000) { this.hud.notify('Not enough money'); return; } this.pay(-2000, 'Ceylon Threads'); const cols = ['#3c4536', '#5a2a2a', '#1f2a3a', '#6b5a3a', '#2a2a2a', '#3a5a6b']; const fits = this.state.outfits || (this.state.outfits = {}); const who = this.g.squad ? this.g.squad.activeId : 'dineth'; const i = (cols.indexOf(fits[who] || '#3c4536') + 1) % cols.length; fits[who] = cols[i]; this.g.rebuildPlayer(); this.hud.notify('New jacket', 'Looking sharp, machan.'); }
  // taxi: pick a pedestrian-side spot nearby, then a destination 400-900 m away
  startTaxi() {
    const rng = new RNG(Math.floor(this.g.clock * 1000)); const p = this.g.player; const pick = (min, max) => { for (let k = 0; k < 200; k++) { const n = L.pedNodes[Math.floor(rng.next() * L.pedNodes.length)]; const d = Math.hypot(n.x - p.x, n.z - p.z); if (d > min && d < max) return n; } return null; };
    const a = pick(80, 260), b = pick(450, 1000); if (!a || !b) return; const spec = randomSpec(Math.floor(rng.next() * 1e5), { age: 'adult' }); let rider = null; let stage = 0, passenger = null, left = 0, fare = Math.round(Math.hypot(a.x - b.x, a.z - b.z) * 1.6 / 10) * 10 + 150;
    this.hud.notify('Tuk-tuk taxi', 'A fare is waiting. Pick them up!', 'info', 4); this.hud.setObjective('Taxi', 'Pick up the passenger', a);
    this.side = { update: (dt) => {
      const pv = this.g.player.vehicle; if (!pv) { this.hud.notify('Taxi job cancelled', rider ? 'Your passenger got out and walked off.' : ''); this.endSide(); this.removeNPC('fare'); if (rider) { const T = this.g.traffic; T.paxCount++; const vv = rider.v; vv.pax = [rider.ch]; vv.paxPlan = [{ si: rider.si }]; T.disembark(vv, 'calm'); rider = null; } return; }
      if (rider) rider.ch.anim.update(dt, 0);
      if (stage === 0) { if (!passenger) passenger = this.spawnNPC('fare', spec, a.x, a.z, 0); passenger.anim.set('wave'); if (Math.hypot(pv.x - a.x, pv.z - a.z) < 7 && Math.abs(pv.speed) < 1.5) { stage = 1; this.removeNPC('fare'); passenger = true; { const seats = pv.mesh.userData.seats; const si = seats.findIndex((q) => !q.driver && !(pv.pax || []).some((c) => c.seat === q)); if (si >= 0) { const ch = new Character(spec); seatCharacter(ch, pv, seats[si], 'phone'); rider = { ch, si, v: pv }; } } left = Math.max(60, Math.hypot(a.x - b.x, a.z - b.z) / 7); this.hud.setObjective('Taxi', `Drive to ${L.districtAt(b.x, b.z).name.split(' · ')[0]}`, b); this.hud.subtitle('Passenger', 'Machan, quickly please — I\'m already late!', '', 3); } }
      else { left -= dt; this.hud.setTimer(left); if (Math.hypot(pv.x - b.x, pv.z - b.z) < 9 && Math.abs(pv.speed) < 1.5) { const tip = left > 0 ? Math.round(fare * 0.3) : 0; this.pay(fare + tip, tip ? `Tuk-tuk fare Rs. ${fare.toLocaleString('en-LK')} + tip Rs. ${tip.toLocaleString('en-LK')}` : `Tuk-tuk fare (late — no tip)`); this.state.stats.taxi++; if (rider) { const T = this.g.traffic; T.paxCount++; const vv = rider.v; vv.pax = [rider.ch]; vv.paxPlan = [{ si: rider.si }]; T.disembark(vv, 'calm'); rider = null; } this.hud.subtitle('Passenger', tip ? 'ස්තූතියි! Super driving.' : 'Finally. Thanks anyway.', tip ? 'Thank you!' : '', 3); this.endSide(); } }
    } };
  }
  startDelivery() {
    const rng = new RNG(Math.floor(this.g.clock * 777)); let n; for (let k = 0; k < 300; k++) { const c = L.pedNodes[Math.floor(rng.next() * L.pedNodes.length)]; const d = Math.hypot(c.x - this.g.player.x, c.z - this.g.player.z); if (d > 300 && d < 800) { n = c; break; } } if (!n) return;
    let left = Math.hypot(n.x - this.g.player.x, n.z - this.g.player.z) / 6 + 25; this.hud.notify('Delivery', 'Take the parcel of short eats before it gets cold!', 'info', 4); this.hud.setObjective('Delivery', 'Deliver the parcel', n);
    this.side = { update: (dt) => { left -= dt; this.hud.setTimer(left); if (left <= 0) { this.hud.notify('Delivery failed', 'Too late — the food is cold.', 'warn'); this.endSide(); return; } const p = this.g.player; if (Math.hypot(p.x - n.x, p.z - n.z) < 5) { this.pay(600 + Math.round(left * 10), 'Delivery'); this.state.stats.deliveries++; this.endSide(); } } };
  }
  startTrial(t) {
    let i = 1, time = 0; this.hud.notify(t.name, 'Hit every checkpoint. Go!', 'info', 3); this.hud.setObjective('Time trial', `${t.name} — checkpoint 1/${t.pts.length - 1}`, { x: t.pts[1][0], z: t.pts[1][1] });
    this.side = { update: (dt) => { const pv = this.g.player.vehicle; if (!pv) { this.endSide(); return; } time += dt; this.hud.setTimer(time); const c = t.pts[i]; if (Math.hypot(pv.x - c[0], pv.z - c[1]) < 14) { Audio.ui('collect'); i++; if (i >= t.pts.length) { const best = this.state.trials[t.id]; const medal = time < t.par ? 'Gold' : time < t.par * 1.25 ? 'Silver' : 'Bronze'; if (!best || time < best) this.state.trials[t.id] = time; this.pay(medal === 'Gold' ? 3000 : medal === 'Silver' ? 1500 : 700, `${t.name}: ${medal} (${time.toFixed(1)} s)`); this.endSide(); return; } this.hud.setObjective('Time trial', `${t.name} — checkpoint ${i}/${t.pts.length - 1}`, { x: t.pts[i][0], z: t.pts[i][1] }); } } };
  }
  endSide() { this.side = null; this.hud.setTimer(null); if (this.running || this.startPoint) { if (this.startPoint) this.offerNext(); } else this.hud.setObjective('', ''); if (!this.running && this.state.mission.id) this.offerNext(); this.g.autosave(); }
  // photo mode callback: returns true if something mission-relevant was captured
  onPhoto(camera) {
    const v = new THREE.Vector3(); let hit = false;
    const inFrame = (x, y, z, maxD) => { v.set(x, y, z); const d = v.distanceTo(camera.position); if (d > maxD) return false; v.project(camera); return Math.abs(v.x) < 0.45 && Math.abs(v.y) < 0.45 && v.z < 1 && this.g.collision.raycast(camera.position.x, camera.position.y, camera.position.z, x, y, z, 0.05) > 0.92; };
    for (const t of this.photoTargets) if (!t.done && inFrame(t.x, t.y, t.z, 70)) { t.done = true; hit = true; this.hud.notify('Photo taken', t.label === 'warehouse' ? 'Sapphire Logistics — company sign captured' : 'Shipping ledger captured', 'collect', 4); }
    for (const s of PHOTO_SPOTS) if (!this.state.photos.includes(s.id) && inFrame(s.x, s.y, s.z, 260)) { this.state.photos.push(s.id); this.hud.removeBlip('photo' + s.id); this.pay(500, `Photo: ${s.name} (${this.state.photos.length}/${PHOTO_SPOTS.length})`); hit = true; }
    return hit;
  }
  update(dt) {
    for (const c of [...this.conds]) { if (c.token !== this.token) continue; try { if (c.fn()) { this.conds.splice(this.conds.indexOf(c), 1); c.res(); } } catch (e) { this.conds.splice(this.conds.indexOf(c), 1); c.rej(e); } }
    if (this.pursuers.length) this.updatePursuers(dt);
    this.updateGuards(dt);
    this.updateSide(dt);
    for (const [id, a] of this.npcs) { const p = this.g.player; const d = Math.hypot(p.x - a.root.position.x, p.z - a.root.position.z); if (d < 6 && !this.g.director.active && !this.g.director.movers.some((m) => m.ch === a)) { const want = Math.atan2(p.x - a.root.position.x, p.z - a.root.position.z); a.yaw = dampAngle(a.yaw || 0, want, 3, dt); a.root.rotation.y = a.yaw; } }
    const prompt = this.talkTarget ? `${this.hud.key('interact')} Talk to ${this.talkTarget.name}` : this.sidePrompt;
    return prompt;
  }
  serialize() { return structuredClone(this.state); }
  restore(s) { this.state = Object.assign(Story.freshState(), s); }
}
export { STAMPS, PHOTO_SPOTS, TRIALS };
