// Drunk system test (Node, headless): shots raise the level, the effect eases in, it wears off over time,
// each protagonist keeps his own state, dying sobers you up, and drinking past the limit blacks you out
// (clock jumps forward, you wake up by your bed with a hangover).
import './node-dom-stub.mjs';
if (!globalThis.addEventListener) globalThis.addEventListener = () => {};
if (!document.addEventListener) document.addEventListener = () => {};
if (!globalThis.localStorage) { const m = new Map(); globalThis.localStorage = { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; }
if (!document.head) document.head = { appendChild() {} }; if (!document.body) document.body = { appendChild() {} }; if (!document.getElementById) document.getElementById = () => null;
const { Drunk, SHOT } = await import('../src/actors/Drunk.js');

let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const mkCh = () => ({ anim: { drunkSway: 0, action: null, play() {} } });
let who = 'dineth'; const notes = []; let mins = 0, fx = 0;
const P = { x: 0, z: 0, yaw: 0, control: true, speed: 0, ch: mkCh(), sync() {}, snapCamera() {} };
const game = {
  player: P, health: { hp: 100 }, squad: { get activeMember() { return { def: { id: who } }; } },
  post: { setDrunk: (k) => { fx = k; } }, camera: null,
  atmos: { advance: (m) => { mins += m; }, update() {}, timeString: '02:10' },
  hud: { fade: async () => {}, notify: (t) => notes.push(t) },
  interiors: { current: { bed: { wake: [12, 34, 1.5] } } },
};
const D = new Drunk(game);
const step = (sec) => { for (let t = 0; t < sec; t += 0.05) D.update(0.05); };
step(0.1);

ok(D.drink() === 'ok' && Math.abs(D.level - SHOT) < 1e-9, 'one shot = one step of drunkenness');
ok(D.eff < 0.05, 'the effect does not hit instantly'); step(20); ok(D.eff > 0.15 && D.eff <= D.level + 1e-9, `the effect eases in (${D.eff.toFixed(2)})`);
ok(P.drunk === D.eff && P.ch.anim.drunkSway === D.eff && P.camFx, 'the effect drives the walk sway and the camera'); ok(fx > 0, 'and the screen effect');
for (let i = 0; i < 3; i++) D.drink(); ok(D.drink() === 'very' && D.level >= 0.95, 'five shots = very drunk');
step(30); ok(D.label === 'Very drunk' || D.label === 'Drunk', `label (${D.label})`);
// switching protagonist: the other man is sober, and switching back restores this one
who = 'shashika'; step(0.1); ok(D.level === 0 && D.eff === 0, 'switching to a sober protagonist'); D.drink(); const sh = D.level;
who = 'dineth'; step(0.1); ok(D.level >= 0.95, 'switching back keeps Dineth drunk');
who = 'shashika'; step(0.1); ok(Math.abs(D.level - sh) < 0.01, 'and Shashika keeps his one shot'); who = 'dineth'; step(0.1);
// blackout
const lvl0 = D.level; ok(lvl0 >= 0.95, 'ready to black out');
const r = D.drink(); ok(r === 'blackout', 'one more shot past the limit blacks you out'); await new Promise((res) => setTimeout(res, 10));
ok(mins >= 7 * 60 && mins <= 9 * 60, `the clock jumps 7-9 hours (${(mins / 60).toFixed(1)} h)`);
ok(P.x === 12 && P.z === 34 && P.yaw === 1.5, 'you wake up by your bed'); ok(P.control && !D.busy, 'control comes back');
ok(D.level > 0.2 && D.level < 0.5, 'with a hangover'); ok(notes.includes('Blacked out'), 'and a notification');
// wearing off: hangover 0.35 is gone after a few minutes
step(3 * 60); ok(D.level === 0, `wears off (${D.level.toFixed(3)})`); step(40); ok(D.eff < 0.01 && !P.camFx, 'the effect fades out with it');
// death sobers you up
D.drink(); D.drink(); game.health.hp = 0; step(0.1); ok(D.level === 0, 'dying sobers you up'); game.health.hp = 100;
// switching body clears the old body's sway
D.drink(); step(20); const old = P.ch; P.ch = mkCh(); step(0.1); ok(old.anim.drunkSway === 0, 'the previous body stops swaying');
D.reset(); ok(D.level === 0 && P.drunk === 0 && fx === 0, 'reset');

console.log(`drunk-test: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
