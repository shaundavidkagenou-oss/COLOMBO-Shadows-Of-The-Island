// 53rd: horn gate, sound variations in turn with fallback, NPC voice group chain
import { SoundBank as SB, SOUND_BY_ID, VARIED } from '../../src/audio/SoundBank.js';
import { Audio } from '../../src/audio/Audio.js';
import { Voices } from '../../src/audio/Voices.js';
import { voiceId } from '../../src/audio/VoiceDefs.js';
let fails = 0; const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) fails++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// --- horns
const a = {}, b = {}, c = {}, d = {}, P = {};
ok(Audio.hornFree(a) && !Audio.hornFree(a), 'NPC horn: second press within 2 s refused');
ok(Audio.hornFree(b) && Audio.hornFree(c) && !Audio.hornFree(d), 'at most 3 NPC horns at once');
ok(Audio.hornFree(P, true) && !Audio.hornFree(P, true), 'player horn always allowed past the cap, but not stacked');
await sleep(2050);
ok(Audio.hornFree(a) && Audio.hornFree(P, true), 'after 2 s the same vehicles can horn again');
// --- distance cues
Audio.update(0.016, { listener: { x: 0, z: 0, yaw: 0 } });
const n5 = Audio.at(5, 0, 14), f150 = Audio.at(150, 0, 14);
ok(n5.g > f150.g * 20 && n5.delay < 0.02 && Math.abs(f150.delay - 150 / 343) < 1e-6 && n5.lp === 0 && f150.lp > 0 && f150.lp < 4000 && f150.wet > n5.wet, `near ${JSON.stringify(n5)} far ${JSON.stringify(f150)}`);
// --- variations
ok(VARIED.length === 4 && VARIED.every((v) => SOUND_BY_ID[v].vars.length === 3), 'four varied sounds × 3 variation slots');
const B = (n) => ({ duration: n });
SB.buf.set('veh.glass', B(1)); SB.buf.set('veh.glass.var2', B(2));
const seq = [...Array(8)].map(() => SB.pick('veh.glass'));
ok(JSON.stringify(seq) === JSON.stringify(['veh.glass', 'veh.glass', 'veh.glass.var2', 'veh.glass', 'veh.glass', 'veh.glass', 'veh.glass.var2', 'veh.glass']), 'in turn, empty slots → original: ' + seq.join(','));
SB.buf.set('gun.dry.var1', B(1)); ok(SB.has('gun.dry') && SB.pick('gun.dry') === 'gun.dry', 'only a variation filled: has() true, the original turn falls back to the synth (id itself)');
ok(!SB.has('veh.crash'), 'nothing filled → has() false (synth)');
// --- voices
const man = { sex: 'm', age: 'adult', profile: 'vendor' }, oldW = { sex: 'f', age: 'elder', profile: null };
ok(Voices.find(man, 'scream') === null, 'no clips → null (game keeps blip / silence)');
SB.buf.set(voiceId('any', 'scream'), B(1)); ok(Voices.find(man, 'scream') === 'dlg.any.scream', 'falls back to Everyone');
SB.buf.set(voiceId('woman', 'scream', 2), B(1)); ok(Voices.find(oldW, 'scream') === 'dlg.woman.scream' && Voices.find(man, 'scream') === 'dlg.any.scream', 'a woman clip (only var2 filled) serves women, not men');
SB.buf.set(voiceId('aunty', 'scream'), B(1)); ok(Voices.find(oldW, 'scream') === 'dlg.aunty.scream', 'elderly woman prefers Aunty');
SB.buf.set(voiceId('vendor', 'talk'), B(1)); ok(Voices.find(man, 'talk') === 'dlg.vendor.talk' && Voices.find(oldW, 'talk') === null, 'profile group first');
SB.buf.set(voiceId('police', 'order'), B(1)); ok(Voices.find(man, 'order', 'police') === 'dlg.police.order' && Voices.find(man, 'order') === null, 'context group (police) only when the caller says so');
ok(JSON.stringify(Voices.chain(oldW, 'driver')) === JSON.stringify(['driver', 'aunty', 'woman', 'any']), 'chain ' + Voices.chain(oldW, 'driver'));
const pool = new Set(); SB.buf.set(voiceId('man', 'hurt'), B(1)); SB.buf.set(voiceId('man', 'hurt', 1), B(1)); SB.buf.set(voiceId('man', 'hurt', 3), B(1));
let rep = false, last = null; for (let i = 0; i < 30; i++) { const k = SB.pick('dlg.man.hurt'); pool.add(k); if (k === last) rep = true; last = k; }
ok(pool.size === 3 && !rep && !pool.has('dlg.man.hurt.var2'), 'voice clips: shuffled, all filled used, never twice in a row, empty skipped');
console.log(fails ? `${fails} FAILED` : 'ALL OK'); process.exit(fails ? 1 : 0);
