// NPC voice recordings at run time (slots: VoiceDefs.js · editor: console `dialogs` → src/ui/DialogsWindow.js).
// say(spec, situation, x, z, who, group) finds the most specific group along the speaker's chain that has a recording for that
// situation (context group → walk of life → elderly man / woman → man / woman → Everyone), plays one of its clips at the
// speaker's position (distance, pan, muffling; it follows the speaker while it plays) and returns the clip's length — or 0
// when nothing is recorded, so the caller keeps its synthesised blip / silence.
// Limits so a panicking crowd doesn't become a wall of voices: one clip per speaker at a time, MAX_ON clips at once (screams
// and pain may push in up to MAX_LOUD), and the same situation from a crowd is thinned out (RUN_GAP).
import { SoundBank as SB } from './SoundBank.js';
import { Audio } from './Audio.js';
import { voiceId, PROFILE_GROUP, LINE_SIT } from './VoiceDefs.js';

const MAX_ON = 4, MAX_LOUD = 6, RUN_GAP = 0.35; // clips at once · incl. screams / pain · s between two crowd screams / runs
const LOUD = new Set(['scream', 'hurt', 'die', 'run']);

class VoiceSystem {
  constructor() { this.on = []; this.lastSit = new Map(); this.stats = { played: 0, skipped: 0, busy: 0 }; }
  // the speaker's groups, most specific first
  chain(spec, group = null) {
    const out = []; if (group) out.push(group);
    const pg = spec && PROFILE_GROUP[spec.profile]; if (pg && pg !== group) out.push(pg);
    const f = spec && spec.sex === 'f'; if (spec && (spec.age === 'elder' || spec.profile === 'retiree')) out.push(f ? 'aunty' : 'uncle');
    out.push(f ? 'woman' : 'man', 'any'); return out;
  }
  // the slot id that would play (or null)
  find(spec, sit, group = null) { for (const g of this.chain(spec, group)) { const id = voiceId(g, sit); if (SB.has(id)) return id; } return null; }
  any() { for (const k of SB.buf.keys()) if (k.startsWith('dlg.')) return true; return false; }
  say(spec, sit, x, z, who = null, group = null, { rate = null } = {}) {
    if (!(x === x && z === z)) return 0; const id = this.find(spec, sit, group); if (!id) return 0;
    const now = performance.now() / 1000; this.on = this.on.filter((e) => e.end > now);
    if (who && (who._voiceT || 0) > now) { this.stats.busy++; return 0; } // already speaking
    const loud = LOUD.has(sit); if (this.on.length >= (loud ? MAX_LOUD : MAX_ON)) { this.stats.skipped++; return 0; }
    if (loud && now - (this.lastSit.get(sit) || 0) < RUN_GAP) { this.stats.skipped++; return 0; } this.lastSit.set(sit, now);
    // the same recording from many mouths: each speaker a hair higher / lower (stable per speaker), never chipmunked
    const r = rate ?? (who ? 0.96 + (((who.id ?? hash(who)) * 0.6180339) % 1) * 0.08 : 1);
    const d = Audio.voice(id, x, z, { src: who && who.x !== undefined ? who : null, rate: r, ref: loud ? 30 : 16 }); if (!d) return 0;
    if (who) who._voiceT = now + d; this.on.push({ end: now + d }); this.stats.played++; return d;
  }
  // a line of dialogue (Crowd.say / road rage / police / EMS …): category → situation
  line(spec, cat, x, z, who = null, group = null) { return this.say(spec, LINE_SIT[cat] || 'talk', x, z, who, group); }
}
let hid = 1; const hash = (o) => (o._vh || (o._vh = hid++));
export const Voices = new VoiceSystem();
if (typeof window !== 'undefined') window.__voices = Voices;
