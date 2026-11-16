// Gun audio placement (Node, headless; 54th): no echo / reverb is ever added to a gunshot, the shooter's own gun plays dry
// and centred, and other guns (police T-56, shopkeeper, the assassin's sniper) are placed by distance ONLY — gain fall-off
// with no loudness floor, the speed-of-sound delay and the air's high-cut. Checks the recorded path (SoundBank.play
// arguments) and the synthesised fallback (Audio.noise / tone arguments).
import './node-dom-stub.mjs';
globalThis.localStorage ??= { getItem: () => null, setItem: () => {}, removeItem: () => {} };
globalThis.addEventListener ??= () => {}; if (!document.addEventListener) document.addEventListener = () => {};
const { Audio } = await import('../src/audio/Audio.js'); const { SoundBank: SB } = await import('../src/audio/SoundBank.js');
const { Weapons } = await import('../src/combat/Weapons.js'); const { WEAPONS, POLICE_T56 } = await import('../src/combat/WeaponDefs.js');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; if (process.env.V) console.log('ok  ', m); } else { fail++; console.log('FAIL', m); } };
Audio.listener = { x: 0, z: 0, yaw: 0 };
let calls = []; const realPlay = SB.play.bind(SB); let recorded = true;
SB.play = (id, k = 1, pan = 0, when = 0, o = {}) => { calls.push({ id, k, pan, when, ...o }); return recorded; };
const syn = []; Audio.noise = (dur, o) => syn.push({ kind: 'noise', ...o }); Audio.tone = (f, dur, o) => syn.push({ kind: 'tone', ...o });
const pistol = WEAPONS.find((w) => w.cls === 'pistol') || WEAPONS[0]; const W = Object.create(Weapons.prototype);
// own gun
calls = []; W.gunSound(pistol, 1.5, 2, true); let c = calls[0];
ok(c && c.k === 1 && c.pan === 0 && c.when === 0 && !c.verb && !c.lp, `own gun: dry, centred, full level (k ${c && c.k}, verb ${c && c.verb})`);
// other guns by distance
const rows = []; let prevK = 2, prevD = -1, prevLp = 1e9, monotone = true;
for (const d of [5, 25, 60, 150, 300]) { calls = []; W.gunSound(pistol, d, 0); c = calls[0]; rows.push(`${d} m: k ${c.k.toFixed(3)} delay ${c.when.toFixed(3)} lp ${c.lp ? Math.round(c.lp) : 'open'}`);
  if (!(c.k < prevK && c.when > prevD && (c.lp || 2e4) <= prevLp)) monotone = false; prevK = c.k; prevD = c.when; prevLp = c.lp || 2e4;
  ok(!c.verb && c.wet === undefined, `${d} m: no reverb send`); ok(Math.abs(c.when - d / 343) < 1e-6, `${d} m: delay = distance / speed of sound (${c.when.toFixed(3)} s)`); }
ok(monotone, 'farther = quieter, later and duller'); ok(calls[0].k < 0.02, `no loudness floor: 300 m is ${calls[0].k.toFixed(4)} of full (the old police floor was 0.12)`);
console.log('  ' + rows.join(' · '));
// synthesised fallback: same placement, no verb
recorded = false; syn.length = 0; W.gunSound(pistol, 150, 0); ok(syn.length > 0 && syn.every((s) => !s.verb), 'fallback synthesis: no reverb send'); ok(syn.every((s) => (s.when || 0) >= 150 / 343 - 1e-6), 'fallback synthesis: delayed by the distance');
// police rifle (Firefight) source check: distance only — gain from Audio.at, no floor, no verb
const fs = await import('node:fs'); const src = fs.readFileSync(new URL('../src/police/Firefight.js', import.meta.url), 'utf8');
const blk = src.slice(src.indexOf("SoundBank.play('gun.t56'") - 200, src.indexOf("SoundBank.play('gun.t56'") + 200);
ok(/Audio\.at\(mz\.x, mz\.z, 70\)/.test(blk) && !/Math\.max\(0\.12/.test(blk) && !/verb/.test(blk), 'police T-56: Audio.at placement, no 0.12 loudness floor, no reverb');
ok(!!POLICE_T56, 'police T-56 definition present'); void realPlay;
console.log(`gun-audio-test: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
