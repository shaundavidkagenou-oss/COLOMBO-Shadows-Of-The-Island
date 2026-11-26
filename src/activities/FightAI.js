// 92nd: the fighter brain for the underground ring (FightNight.js). Pure logic, no three.js: it decides footwork, guard and
// strikes from the fighter's attributes and his state, and works out what a punch does to the other man. The animation
// layer is the existing one (Boxing.js via Character.anim: fightOn / strike / takeHit / block); this only says WHEN.
//
// Attributes (0..1): power, speed, chin, cardio, defence, iq. Style biases the decisions:
//   boxer   — works behind the jab at long range, moves, combinations of 2–3
//   brawler — walks forward, hooks and uppercuts in close, guard drops when tired
//   counter — waits at mid range with a high guard and fires back when the other man misses / finishes a combination
// State: hp (0..100, the head and body together), stamina (0..1, punches and blocking cost it, it comes back while
// moving off), balance (0..1, big shots take it, low balance = a stagger and an open guard), downs (knock-downs this bout).
import { MOVES } from '../actors/Boxing.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const STYLES = {
  boxer: { label: 'Boxer', range: 1.2, aggr: 0.55, combo: 0.6, guard: 0.55, counter: 0.3, mix: { jab: 5, cross: 3, hook: 1.4, upper: 0.6 } },
  brawler: { label: 'Brawler', range: 0.98, aggr: 0.82, combo: 0.45, guard: 0.35, counter: 0.15, mix: { jab: 1.5, cross: 2.2, hook: 3.4, upper: 2.4 } },
  counter: { label: 'Counter-puncher', range: 1.18, aggr: 0.38, combo: 0.5, guard: 0.75, counter: 0.65, mix: { jab: 3, cross: 3.4, hook: 2, upper: 1 } },
};
// what follows what in a combination (a real boxer's habits: 1-2, 1-2-3, 2-3-2, 3-2 …)
const NEXT = { jab: ['cross', 'jab', 'hook'], cross: ['hook', 'upper', 'jab'], hook: ['cross', 'upper'], upper: ['hook', 'cross'] };

export class FighterBrain {
  constructor(f, rnd) {
    this.f = f; this.rnd = rnd; this.S = STYLES[f.style] || STYLES.boxer;
    this.hp = 100; this.stamina = 1; this.balance = 1; this.downs = 0; this.out = false; this.down = 0;
    this.cool = 0.6 + rnd() * 0.6; this.combo = 0; this.comboNext = null; this.guard = 0.5; this.circle = rnd() < 0.5 ? -1 : 1; this.circleT = 2;
    this.stats = { thrown: 0, landed: 0, blocked: 0, missed: 0, dmg: 0, knockdowns: 0 }; this.round = { landed: 0, dmg: 0, downs: 0, aggr: 0 };
    this.lastMiss = -9; this.oppMissed = -9; this.t = 0;
  }
  // per frame: dist (m) to the other man, opp = his brain, busy = my strike / reaction still playing
  decide(dt, dist, opp, busy) {
    const S = this.S, f = this.f; this.t += dt; this.cool -= dt; this.circleT -= dt;
    // stamina: back while not punching (cardio), slower when hurt
    this.stamina = clamp(this.stamina + dt * (0.055 + 0.05 * f.cardio) * (0.6 + 0.4 * this.hp / 100), 0, 1); this.balance = clamp(this.balance + dt * 0.45, 0, 1);
    if (this.circleT <= 0) { this.circleT = 1.5 + this.rnd() * 2.5; if (this.rnd() < 0.45) this.circle = -this.circle; }
    const hurt = 1 - this.hp / 100, tired = 1 - this.stamina;
    // guard: style + defence, drops with fatigue and a broken balance; a counter-puncher keeps it high
    this.guard = clamp(S.guard * 0.6 + f.defence * 0.4 - tired * 0.35 - (1 - this.balance) * 0.5, 0.05, 0.95);
    const want = S.range + (hurt > 0.55 ? 0.15 : 0) - (opp.hp < 35 ? 0.1 : 0); // hurt: keep away; the other man hurt: press
    let step = dist > want + 0.12 ? 1 : dist < want - 0.18 ? -0.8 : 0; if (tired > 0.75 && dist < want + 0.4) step = -0.6; // gassed: back off to breathe
    let move = null;
    if (!busy && this.cool <= 0 && this.balance > 0.35) {
      const inRange = (m) => dist < MOVES[m].reach + 0.08;
      if (this.comboNext && inRange(this.comboNext) && this.stamina > 0.12) { move = this.comboNext; }
      else {
        // the chance to open this beat: aggression, the other man's state, a counter after his miss
        const counterWin = this.t - this.oppMissed < 0.6 ? S.counter * (0.6 + f.iq * 0.6) : 0;
        const pOpen = (S.aggr * 0.6 + 0.3) * (0.5 + this.stamina * 0.6) * (opp.balance < 0.5 ? 1.5 : 1) + counterWin;
        if (this.rnd() < clamp(pOpen, 0, 0.95)) {
          const mix = S.mix; let tot = 0; const c = []; for (const m in mix) { if (!inRange(m)) continue; let w = mix[m]; if (opp.guard > 0.7 && (m === 'hook' || m === 'upper')) w *= 1.4; tot += w; c.push([m, w]); }
          if (tot > 0) { let r = this.rnd() * tot; for (const [m, w] of c) { r -= w; if (r <= 0) { move = m; break; } } if (!move) move = c[c.length - 1][0]; this.combo = 0; }
        }
        this.cool = move ? 0 : 0.25 + (1 - S.aggr) * 0.5 + this.rnd() * 0.4; // looked for an opening and held
      }
    }
    if (move) {
      this.stats.thrown++; this.round.aggr++; this.stamina = clamp(this.stamina - (MOVES[move].dmg / 100) * (0.2 + 0.1 * (1 - this.f.cardio)), 0, 1);
      this.combo++; const more = this.combo < 2 + Math.round(S.combo * 2) && this.rnd() < S.combo * (0.5 + this.stamina * 0.5);
      this.comboNext = more ? NEXT[move][Math.floor(this.rnd() * NEXT[move].length)] : null;
      this.cool = this.comboNext ? 0.04 : 0.5 + (1 - this.f.speed) * 0.5 + this.rnd() * 0.45; // between combinations: reset, look
    }
    return { move, step, circle: this.circle * (0.5 + 0.5 * this.f.speed), block: !busy && this.guard > 0.5 && dist < 1.6 };
  }
  // my strike lands (or not) on `opp` at the impact frame. dist / facing come from the ring. Returns the outcome.
  land(move, dist, opp, facing) {
    const M = MOVES[move]; const f = this.f;
    if (dist > M.reach + 0.12 || facing < 0.55 || opp.down || opp.out) { this.stats.missed++; this.lastMiss = this.t; opp.oppMissed = opp.t; this.balance = clamp(this.balance - 0.08, 0, 1); return { kind: 'miss' }; }
    // the other man reads it: guard × his defence × how quick this hand is; tired arms are slow to cover
    const read = opp.guard * (0.55 + opp.f.defence * 0.45) * (1.15 - f.speed * 0.35) * (0.5 + opp.stamina * 0.5);
    const blocked = this.rnd() < clamp(read, 0.05, 0.8);
    if (!blocked && this.rnd() < 0.1 + opp.f.defence * 0.14 * opp.stamina) { this.stats.missed++; this.lastMiss = this.t; opp.oppMissed = opp.t; return { kind: 'miss', slip: true }; } // he slips it (head movement)
    const pow = (M.dmg / 100) * (0.55 + f.power * 0.6) * (0.55 + this.stamina * 0.45);
    if (blocked) { const d = pow * 3; opp.hp = clamp(opp.hp - d, 0, 100); opp.stamina = clamp(opp.stamina - pow * 0.18, 0, 1); this.stats.blocked++; return { kind: 'block', dmg: d, pow }; }
    const d = pow * 11 * (1.25 - opp.f.chin * 0.45); opp.hp = clamp(opp.hp - d, 0, 100); opp.balance = clamp(opp.balance - pow * (1.1 - opp.f.chin * 0.5), 0, 1);
    this.stats.landed++; this.stats.dmg += d; this.round.landed++; this.round.dmg += d;
    // down: no hp left, or a clean heavy shot on a man whose legs are gone
    const heavy = move === 'hook' || move === 'upper' || move === 'cross';
    if (opp.hp <= 0 || (heavy && opp.balance < 0.1 && opp.hp < 30 && this.rnd() < 0.3)) { opp.down = 1; opp.downs++; this.stats.knockdowns++; opp.round.downs++; return { kind: 'down', dmg: d, pow }; }
    return { kind: opp.balance < 0.3 ? 'stagger' : 'hit', dmg: d, pow };
  }
  // on the canvas: does he beat the count? (chin, how hurt, how many times already)
  beatsCount() { if (this.downs >= 3) return false; const p = clamp(0.5 + this.f.chin * 0.45 - (this.downs - 1) * 0.25 + this.stamina * 0.1, 0.05, 0.94); return this.rnd() < p; }
  getUp() { this.down = 0; this.hp = clamp(30 + this.f.chin * 25 - this.downs * 6, 12, 55); this.balance = 0.6; this.stamina = Math.max(this.stamina, 0.45); this.comboNext = null; }
  newRound() { this.round = { landed: 0, dmg: 0, downs: 0, aggr: 0 }; this.stamina = clamp(this.stamina + 0.35, 0, 1); this.hp = clamp(this.hp + 6 + this.f.cardio * 6, 0, 100); this.balance = 1; this.comboNext = null; }
}
// a round on the judges' cards (10-point must): the more clean damage wins it 10-9, each knock-down suffered costs a point
export function scoreRound(a, b) {
  const ea = a.round.dmg + a.round.landed * 2 + a.round.aggr * 0.3, eb = b.round.dmg + b.round.landed * 2 + b.round.aggr * 0.3;
  let sa = ea >= eb ? 10 : 9, sb = eb > ea ? 10 : 9; if (Math.abs(ea - eb) < 1.5) sa = sb = 10; sa -= a.round.downs; sb -= b.round.downs; return [Math.max(6, sa), Math.max(6, sb)];
}
// pre-fight odds from a rating (decimal odds, a small house margin) — what the prediction pays in points
export function rating(f, rec) { const w = rec ? rec.w : 0, l = rec ? rec.l : 0; return f.power * 1.1 + f.speed + f.chin * 0.9 + f.cardio * 0.7 + f.defence * 0.8 + f.iq * 0.6 + clamp((w - l) * 0.03, -0.25, 0.25); }
export function odds(fa, fb, ra, rb) { const a = rating(fa, ra), b = rating(fb, rb); const pa = 1 / (1 + Math.exp(-(a - b) * 2.2)); const m = 0.92; return [Math.max(1.08, +(m / pa).toFixed(2)), Math.max(1.08, +(m / (1 - pa)).toFixed(2)), pa]; }

// ---- one bout in the ring: footwork, strikes on the animation's impact frame, reactions, knock-downs and the count,
// rounds and the cards. Positions are in metres around the ring centre (cx, cz). The presentation (FightNight) reads
// a / b (x, z, yaw, strike, react) and drains `events` (swing / hit / block / miss / down / up / bell / result).
export class Bout {
  constructor(fa, fb, rnd, { rounds = 3, roundT = 60, restT = 8, half = 2.6, cx = 0, cz = 0, yaw = 0 } = {}) {
    this.rnd = rnd; this.rounds = rounds; this.roundT = roundT; this.restT = restT; this.half = half; this.cx = cx; this.cz = cz; this.yaw = yaw;
    const c = Math.cos(yaw), s = Math.sin(yaw); const at = (lx) => ({ x: cx + lx * c, z: cz - lx * s });
    const mk = (f, lx) => { const p = at(lx); return { f, brain: new FighterBrain(f, rnd), x: p.x, z: p.z, yaw: 0, strike: null, react: null, walk: 0, animK: 1, stopT: 0, corner: { ...p } }; };
    this.a = mk(fa, -1.6); this.b = mk(fb, 1.6); this.a.opp = this.b; this.b.opp = this.a;
    this.phase = 'intro'; this.t = 0; this.round = 1; this.cards = [[0, 0], [0, 0], [0, 0]]; this.events = []; this.result = null; this.count = 0; this.tTotal = 0;
  }
  ev(type, who, extra) { this.events.push({ type, who, ...extra }); }
  dist() { return Math.hypot(this.b.x - this.a.x, this.b.z - this.a.z); }
  busy(F) { return !!((F.strike && F.strike.t < MOVES[F.strike.move].dur) || (F.react && F.react.t < F.react.dur)); }
  step(dt) {
    this.t += dt; this.tTotal += dt; const A = this.a, B = this.b;
    for (const F of [A, B]) { if (F.stopT > 0) { F.stopT -= dt; if (F.stopT <= 0) F.animK = 1; } if (F.strike) F.strike.t += dt; if (F.react) { F.react.t += dt; if (F.react.t >= F.react.dur) F.react = null; } }
    const face = (F, tx, tz, k) => { const want = Math.atan2(tx - F.x, tz - F.z); let d = want - F.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); F.yaw += d * Math.min(1, dt * k); };
    const walkTo = (F, tx, tz, sp) => { const dx = tx - F.x, dz = tz - F.z, d = Math.hypot(dx, dz); if (d < 0.05) { F.walk = 0; return true; } const v = Math.min(sp, d / dt); F.x += (dx / d) * v * dt; F.z += (dz / d) * v * dt; F.walk = v; face(F, tx, tz, 8); return false; };
    if (this.phase === 'intro') { // to the corners, touch gloves in the middle, back, bell
      if (this.t < 3) { for (const F of [A, B]) { F.walk = 0; face(F, F.opp.x, F.opp.z, 6); } return; }
      if (this.t < 6.5) { const okA = walkTo(A, this.cx + (A.corner.x - this.cx) * 0.3, this.cz + (A.corner.z - this.cz) * 0.3, 1.2); const okB = walkTo(B, this.cx + (B.corner.x - this.cx) * 0.3, this.cz + (B.corner.z - this.cz) * 0.3, 1.2); if (okA && okB) { face(A, B.x, B.z, 8); face(B, A.x, A.z, 8); } return; }
      if (this.t < 9) { walkTo(A, A.corner.x, A.corner.z, 1.4); walkTo(B, B.corner.x, B.corner.z, 1.4); return; }
      this.phase = 'fight'; this.t = 0; this.ev('bell', null, { round: 1 }); return;
    }
    if (this.phase === 'rest') { walkTo(A, A.corner.x, A.corner.z, 1.3); walkTo(B, B.corner.x, B.corner.z, 1.3); if (this.t > this.restT) { this.phase = 'fight'; this.t = 0; this.round++; A.brain.newRound(); B.brain.newRound(); this.ev('bell', null, { round: this.round }); } return; }
    if (this.phase === 'count') { const D = this.downed, U = D.opp; walkTo(U, U.corner.x, U.corner.z, 1.2); face(U, D.x, D.z, 4);
      const n = Math.floor(this.t); if (n > this.count) { this.count = n; this.ev('count', D, { n }); }
      if (this.willRise && this.t > this.riseAt) { D.brain.getUp(); D.react = { kind: 'rise', t: 0, dur: 1.3 }; this.phase = 'fight'; this.t = this.resumeT; this.ev('up', D); return; }
      if (this.t >= 10) { this.finish(U, this.downed.brain.downs >= 3 ? 'TKO' : 'KO'); } return; }
    if (this.phase === 'over') { for (const F of [A, B]) F.walk = 0; return; }
    // ---- fighting
    const d = this.dist();
    for (const F of [A, B]) {
      const O = F.opp, br = F.brain; const busy = this.busy(F);
      face(F, O.x, O.z, busy ? 3 : 9);
      const dec = br.decide(dt, d, O.brain, busy);
      if (dec.move) { F.strike = { move: dec.move, t: 0, done: false }; this.ev('swing', F, { move: dec.move }); }
      F.block = dec.block && !F.strike;
      // footwork: along the line to him + circling; slower while punching / hurt; stay inside the ropes
      const dx = O.x - F.x, dz = O.z - F.z, dd = Math.hypot(dx, dz) || 1; const ux = dx / dd, uz = dz / dd;
      const sp = (0.75 + 0.55 * F.f.speed) * (busy ? 0.25 : 1) * (0.6 + 0.4 * br.stamina);
      let vx = (ux * dec.step + -uz * dec.circle * 0.55) * sp, vz = (uz * dec.step + ux * dec.circle * 0.55) * sp;
      if (dd < 0.75) { vx -= ux * 1.5; vz -= uz * 1.5; } // never inside each other
      F.x += vx * dt; F.z += vz * dt; F.walk = Math.hypot(vx, vz);
      const c = Math.cos(this.yaw), s = Math.sin(this.yaw); let lx = (F.x - this.cx) * c - (F.z - this.cz) * s, lz = (F.x - this.cx) * s + (F.z - this.cz) * c; const m = this.half - 0.45;
      if (Math.abs(lx) > m || Math.abs(lz) > m) { lx = clamp(lx, -m, m); lz = clamp(lz, -m, m); F.x = this.cx + lx * c + lz * s; F.z = this.cz - lx * s + lz * c; br.circle = -br.circle; } // on the ropes: turn out of it
    }
    // impacts on the animation's hit frame
    for (const F of [A, B]) { const S = F.strike; if (!S || S.done || S.t < MOVES[S.move].hit) continue; S.done = true; const O = F.opp;
      const dx = O.x - F.x, dz = O.z - F.z, dd = Math.hypot(dx, dz) || 1; const facing = (Math.sin(F.yaw) * dx + Math.cos(F.yaw) * dz) / dd;
      const r = F.brain.land(S.move, dd, O.brain, facing);
      if (r.kind === 'miss') { this.ev('miss', F, { move: S.move }); continue; }
      if (r.kind === 'block') { O.react = { kind: 'block', t: 0, dur: 0.25 }; this.ev('block', F, { move: S.move, pow: r.pow }); continue; }
      const heavy = r.pow > 0.22 || r.kind !== 'hit'; const push = 0.12 + r.pow * 0.5; O.x += (dx / dd) * push; O.z += (dz / dd) * push;
      O.react = { kind: MOVES[S.move].react, t: 0, dur: r.kind === 'stagger' ? 0.95 : 0.45, stagger: r.kind === 'stagger', dir: S.move === 'hook' ? 1 : 0, pow: r.pow }; if (O.strike && !O.strike.done) O.strike = null; // a clean shot takes his own punch away
      if (heavy) { F.animK = O.animK = 0.06; F.stopT = O.stopT = 0.07; this.hitStops = (this.hitStops || 0) + 1; } // localised hit-stop: only these two, ~70 ms
      this.ev(r.kind === 'down' ? 'down' : 'hit', F, { move: S.move, pow: r.pow, kind: r.kind });
      if (r.kind === 'down') { this.downed = O; this.phase = 'count'; this.resumeT = this.t; this.t = 0; this.count = 0; O.react = { kind: 'down', t: 0, dur: 99 }; this.willRise = O.brain.beatsCount(); this.riseAt = 3.5 + this.rnd() * 4.5; F.strike = null; return; }
    }
    if (this.t >= this.roundT) { const sc = scoreRound(A.brain, B.brain); for (let j = 0; j < 3; j++) { const v = this.rnd() < 0.15 ? [sc[1], sc[0]] : sc; this.cards[j][0] += v[0]; this.cards[j][1] += v[1]; } // judges disagree now and then on a close round
      this.ev('bell', null, { end: this.round }); A.strike = B.strike = null;
      if (this.round >= this.rounds) { let wa = 0, wb = 0; for (const c of this.cards) { if (c[0] > c[1]) wa++; else if (c[1] > c[0]) wb++; } const w = wa >= 2 ? A : wb >= 2 ? B : null; this.finish(w, !w ? 'Draw' : wa === 3 || wb === 3 ? 'UD' : Math.min(wa, wb) === 1 ? 'SD' : 'MD'); } // a winner needs two of the three judges (MD = majority: one card even)
      else { this.phase = 'rest'; this.t = 0; } }
  }
  finish(winner, how) { this.phase = 'over'; this.t = 0; this.result = { winner, loser: winner ? winner.opp : null, how, round: this.round, cards: this.cards.map((c) => c.slice()) }; this.ev('result', winner, { how }); }
}
