// 91st: duplicate sound slots — no two slots share an id, the removed duplicates are gone from the list and from the code,
// and a recording saved in a removed slot moves to its replacement (only into an empty slot; the old one is otherwise kept).
// Node only (no browser): the store falls back to memory without IndexedDB.  node tools/sound-slots-test.mjs
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
const LS = new Map(); globalThis.localStorage = { getItem: (k) => (LS.has(k) ? LS.get(k) : null), setItem: (k, v) => LS.set(k, String(v)), removeItem: (k) => LS.delete(k) };
const { SOUND_DEFS, SOUND_BY_ID, MERGED_SLOTS, SoundBank } = await import('../src/audio/SoundBank.js');
const { storeGet, storeSet, setSavedFlag } = await import('../src/debug/boot.js');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log('  ok  ' + m); } else { fail++; console.log('  FAIL ' + m); } };
const ids = SOUND_DEFS.map((d) => d.id); ok(new Set(ids).size === ids.length, `no duplicate slot ids (${ids.length} slots)`);
const gone = Object.keys(MERGED_SLOTS); ok(gone.every((k) => !SOUND_BY_ID[k]), `removed duplicates are not slots any more: ${gone.join(', ')}`);
ok(Object.values(MERGED_SLOTS).every((m) => m.to.length && m.to.every((k) => SOUND_BY_ID[k])), 'every replacement is an existing slot');
// no code still plays a removed id (the merge table, this test and the README may name them)
const files = []; const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/\.(js|mjs)$/.test(f)) files.push(p); } }; walk('src');
const hits = []; for (const p of files) { const s = readFileSync(p, 'utf8'); for (const k of gone) { const re = new RegExp(`['"\`]${k.replace(/\./g, '\\.')}['"\`]`, 'g'); const n = (s.match(re) || []).length - (p.endsWith('SoundBank.js') ? (s.slice(s.indexOf('MERGED_SLOTS = {'), s.indexOf('const mergedInto')).match(re) || []).length : 0); if (n > 0) hits.push(`${p}: ${k}`); } }
ok(hits.length === 0, `no code references a removed slot ${hits.join(' · ')}`);
// migration of saved recordings
const rec = (name) => ({ data: new Uint8Array([1, 2, 3, name.length]).buffer, name, vol: 0.8, type: 'mp3', t: 1 });
await storeSet('sound:gun.equip', rec('equip.mp3')); await storeSet('sound:hosp.door.open', rec('hdoor.mp3')); await storeSet('sound:bank.step.tile', rec('bstep.mp3'));
await storeSet('sound:bird.crow', rec('crow-old.mp3')); await storeSet('sound:ba.crow.call', rec('crow-new.mp3')); await storeSet('sound:ba.crow.call2', rec('crow-new2.mp3'));
await storeSet('sound:index', ['gun.equip', 'hosp.door.open', 'bank.step.tile', 'bird.crow', 'ba.crow.call', 'ba.crow.call2', 'not.a.slot']); setSavedFlag('sounds', true);
await SoundBank.load();
const nm = (id) => (SoundBank.raw.get(id) || {}).name;
ok(nm('foley.draw') === 'equip.mp3' && nm('foley.holster') === 'equip.mp3', `'Weapon drawn / holstered' recording now in foley.draw + foley.holster (${nm('foley.draw')}, ${nm('foley.holster')})`);
ok(nm('door.open1') === 'hdoor.mp3', `hospital door recording → door.open1 (${nm('door.open1')})`);
ok(nm('step.tile.walk') === 'bstep.mp3', `bank NPC step → step.tile.walk (${nm('step.tile.walk')})`);
ok(nm('ba.crow.call') === 'crow-new.mp3' && nm('ba.crow.call2') === 'crow-new2.mp3', 'a filled replacement keeps its own recording');
ok(!!(await storeGet('sound:bird.crow')), 'the old recording is kept in storage when every replacement is filled');
ok(!(await storeGet('sound:gun.equip')) && !(await storeGet('sound:hosp.door.open')) && !!(await storeGet('sound:foley.holster')), 'moved recordings: old keys removed, new keys stored');
const idx = await storeGet('sound:index'); ok(['foley.draw', 'foley.holster', 'door.open1', 'step.tile.walk', 'ba.crow.call'].every((k) => idx.includes(k)) && !idx.includes('gun.equip'), `index updated (${idx.join(', ')})`);
ok(SoundBank.raw.get('foley.draw').src === 'user' && SoundBank.raw.get('foley.draw').vol === 0.8, 'volume and source carried over');
console.log(`sound-slots-test: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
