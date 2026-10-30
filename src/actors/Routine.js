// Idle routines for people who keep one post (desk staff, gate guards, officers chatting outside, cart vendors). They stay
// where they belong but keep doing believable, varied things instead of freezing in a single pose: desk staff type, take
// calls, read a message, glance up; guards fold their arms, check a watch, use the radio, look around; people in a
// conversation take turns to talk and listen; vendors serve, call out and wait. Changes are spaced 4–20 s apart.
const KINDS = {
  desk: { seated: true, acts: [['type', 5], ['sit', 3], ['text', 1.5], ['phone', 1.2], ['glance', 1], ['look', 0.8]], dur: [5, 18] },
  guard: { acts: [[null, 3], ['crossarms', 2], ['look', 2], ['hips', 1.2], ['glance', 1], ['watch', 0.7], ['comms', 0.6]], dur: [6, 18] },
  stand: { acts: [[null, 2.5], ['look', 2], ['phone', 1.2], ['text', 1.5], ['crossarms', 1], ['glance', 1], ['stretch', 0.3]], dur: [5, 16] },
  phone: { acts: [['phone', 4], ['text', 2], ['look', 1], [null, 1]], dur: [6, 20] },
  chat: { acts: [['talk', 3], ['listen', 3], ['shrug', 0.4], ['point', 0.3], ['crossarms', 0.6]], dur: [2, 6] },
  vendor: { acts: [['interact', 3], ['talk', 2], ['crossarms', 1], ['look', 1.5], ['wave', 0.5], [null, 1.2]], dur: [4, 12] },
};
export const ROUTINE_KINDS = Object.keys(KINDS);
function pick(acts, rnd, avoid) { let tot = 0; for (const [a, w] of acts) if (a !== avoid) tot += w; let r = rnd() * tot; for (const [a, w] of acts) { if (a === avoid) continue; if ((r -= w) <= 0) return a; } return acts[0][0]; }
// p: any object to hold the routine state; ch: Character. Returns the current action.
export function routine(p, ch, dt, kind, rnd = Math.random) {
  const K = KINDS[kind] || KINDS.stand; const A = ch.anim;
  if (!p._rtn || p._rtn.kind !== kind) { p._rtn = { kind, t: rnd() * K.dur[1], act: undefined, n: 0 }; if (K.seated) A.seated = true; }
  const r = p._rtn; r.t -= dt;
  if (r.t <= 0 || r.act === undefined) {
    let act = pick(K.acts, rnd, r.act); if (kind === 'chat' && r.act === 'talk') act = rnd() < 0.8 ? 'listen' : act; else if (kind === 'chat' && r.act === 'listen') act = rnd() < 0.8 ? 'talk' : act;
    r.act = act; r.n++; r.t = K.dur[0] + rnd() * (K.dur[1] - K.dur[0]);
    if (A.action !== act) A.set(act); if (ch.face) ch.face.talking = act === 'talk' || act === 'phone';
  }
  return r.act;
}
