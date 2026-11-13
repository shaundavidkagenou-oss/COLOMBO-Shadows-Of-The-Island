// `sounds` console command: the sound replacement window (code-split — downloaded only when the command is typed).
// Lists every sound in the game (SOUND_DEFS in src/audio/SoundBank.js). For any of them the player picks an .mp3 / .wav / .ogg,
// previews it against the original, sets its volume, and presses Save: from then on the game plays the recording instead of the
// synthesised sound (saved on this machine; on the dev server also written to the project's sounds/ folder, which `npm run build`
// and build-exe.bat build into the game / the .exe). Export pack (.zip) carries recordings saved in a built copy back to sounds/.
import { Win, h, btn, beginSession, toast } from '../debug/ui.js';
import { SOUND_DEFS, SOUND_BY_ID, SOUND_EXT, SoundBank } from '../audio/SoundBank.js';
import { Audio } from '../audio/Audio.js';
import { WEAPONS, POLICE_T56 } from '../combat/WeaponDefs.js';

const CSS = `
.snd-top{display:flex;gap:6px;align-items:center;margin-bottom:6px;flex-wrap:wrap}
.snd-info{color:#9fb0c0;font-size:11px;margin:0 0 6px;line-height:1.45}
.snd-info b{color:#e0a030;font-weight:600}
.snd-list{flex:1;overflow:auto;border:1px solid #2c3340;border-radius:5px;background:#0f1116;min-height:0}
.snd-cat{position:sticky;top:0;background:#1d222c;color:#e0a030;font-weight:600;padding:4px 8px;border-bottom:1px solid #2c3340;z-index:1}
.snd-row{display:grid;grid-template-columns:26px minmax(150px,1.5fr) minmax(120px,1.2fr) auto 74px auto;gap:6px;align-items:center;padding:4px 8px;border-bottom:1px solid #1a1f28}
.snd-row:hover{background:#151a22}
.snd-row .nm small{display:block;color:#6f7a88;font-family:ui-monospace,Consolas,monospace;font-size:10px}
.snd-row .st{color:#7f8a98;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.snd-row .st.cus{color:#7fd0a0}.snd-row .st.pend{color:#f0c060}.snd-row .st.bad{color:#f0866e}
.snd-row input[type=range]{width:70px;accent-color:#e0a030}
.snd-play{width:24px;height:22px;padding:0;text-align:center}
.snd-foot{display:flex;gap:6px;align-items:center;margin-top:6px;flex-wrap:wrap}
.snd-foot .sp{flex:1}
`;
let cssDone = false;
const ACCEPT = '.mp3,.wav,.ogg,audio/mpeg,audio/wav,audio/x-wav,audio/ogg';

// how each original (synthesised) sound is heard in the preview; recordings are bypassed while it plays
function demoOriginal(g, id) {
  const A = Audio, l = A.listener || { x: 0, z: 0 }, W = g.weapons; const run = (f) => { SoundBank.bypass = true; try { f(); } finally { SoundBank.bypass = false; } };
  const gun = id.startsWith('gun.') && (WEAPONS.find((w) => 'gun.' + w.id === id) || (id === 'gun.t56' ? POLICE_T56 : null));
  if (gun && W && W.gunSound) { run(() => W.gunSound(gun, l.x, l.z)); return true; }
  if (id.startsWith('reload.') && W && W.reloadSnd) { run(() => W.reloadSnd({ reload: id === 'reload.pistol' ? 1.4 : 2.4, cls: id.slice(7) })); return true; }
  const D = {
    'gun.cycle': () => { A.noise(0.05, { f: 2200, q: 3, vol: 0.08 }); A.noise(0.06, { f: 1500, q: 3, vol: 0.07, when: 0.12 }); }, 'gun.dry': () => A.tone(1800, 0.03, { type: 'square', vol: 0.06 }),
    'gun.equip': () => A.noise(0.12, { f: 700, q: 0.8, vol: 0.06 }), 'gun.scope': () => A.noise(0.05, { f: 900, q: 1, vol: 0.05 }), 'gun.shell': () => A.tone(4300, 0.05, { type: 'triangle', vol: 0.03 }),
    'gun.hitmarker': () => A.tone(1400, 0.04, { type: 'triangle', vol: 0.04 }), 'gun.ricochet': () => A.tone(3000, 0.07, { type: 'triangle', vol: 0.05 }), 'impact.metal': () => A.bulletMetal(l.x, l.z),
    'punch.swing': () => A.noise(0.09, { f: 800, q: 0.9, vol: 0.05 }), 'punch.hit': () => A.noise(0.06, { f: 250, q: 1.4, vol: 0.13 }), 'punch.taken': () => A.noise(0.06, { f: 240, q: 1.3, vol: 0.12 }),
    'grenade.pin': () => { A.tone(2600, 0.02, { type: 'square', vol: 0.05 }); A.noise(0.05, { f: 4200, q: 4, vol: 0.06, when: 0.02 }); }, 'grenade.throw': () => A.noise(0.12, { f: 900, q: 0.8, vol: 0.05 }),
    'grenade.bounce': () => { A.tone(700, 0.05, { type: 'triangle', vol: 0.07 }); A.noise(0.04, { f: 1800, q: 1.5, vol: 0.04 }); }, explosion: () => A.explosion(l.x + 20, l.z, 1),
    'turbo.bov': () => { A.noise(0.42, { f: 3200, q: 0.9, vol: 0.1, attack: 0.004, sweep: 1100 }); A.noise(0.2, { f: 6000, q: 0.5, type: 'highpass', vol: 0.05, attack: 0.002 }); },
    'horn.car': () => A.horn('car', l.x, l.z), 'horn.small': () => A.horn('tuktuk', l.x, l.z), 'horn.heavy': () => A.horn('bus', l.x, l.z),
    'horn.dual': () => A.horn('car', l.x, l.z, 'dual'), 'horn.sport': () => A.horn('car', l.x, l.z, 'sport'), 'horn.air': () => A.horn('car', l.x, l.z, 'air'), 'horn.tune': () => A.horn('car', l.x, l.z, 'tune'),
    'veh.crash': () => A.crash(14), 'veh.glass': () => A.glassShatter(l.x, l.z, 1), 'veh.glassCrack': () => A.glassCrack(l.x, l.z), 'veh.tyreBurst': () => A.tyreBurst(l.x, l.z), 'veh.doorOpen': () => A.doorOpen(), 'veh.doorSlam': () => A.doorSlam(3),
    'police.radio': () => A.radioBlip(), 'train.horn': () => A.trainHorn(l.x, l.z), 'train.bell': () => A.tone(1350, 0.16, { type: 'triangle', vol: 0.06 }),
    'train.clack': () => { A.noise(0.04, { f: 2200, q: 2, vol: 0.08 }); A.noise(0.04, { f: 2200, q: 2, vol: 0.08, when: 0.11 }); },
    thunder: () => A.thunder(0.2), 'bird.crow': () => A.crow(), 'bird.song': () => A.bird(), cricket: () => A.cricket(),
    fire: () => { for (let i = 0; i < 12; i++) setTimeout(() => run(() => A.fireCrackle(l.x, l.z, 1)), i * 60); },
    debris: () => A.debrisHit(l.x, l.z), 'bread.tuk': () => A.breadTuk(l.x, l.z), footstep: () => A.footstep(false, false), 'phone.ring': () => A.tone(425, 0.9, { type: 'sine', vol: 0.05, attack: 0.02 }),
  };
  if (id.startsWith('ui.')) { run(() => A.ui(id.slice(3))); return true; }
  if (D[id]) { run(D[id]); return true; }
  return false; // continuous sounds (engines, sirens, rotor, ambience, music) are heard in the game itself
}

// store-only .zip (no compression: audio is already compressed) — sounds/<id>.<ext> + sounds/sounds.json
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (u8) => { let c = 0xffffffff; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
export function makeZip(files) {
  const enc = new TextEncoder(); const parts = []; const cen = []; let off = 0;
  for (const f of files) {
    const name = enc.encode(f.name), data = f.data instanceof Uint8Array ? f.data : new Uint8Array(f.data), crc = crc32(data);
    const lh = new DataView(new ArrayBuffer(30)); lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, name.length, true);
    parts.push(new Uint8Array(lh.buffer), name, data);
    const ch = new DataView(new ArrayBuffer(46)); ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, name.length, true); ch.setUint32(42, off, true);
    cen.push(new Uint8Array(ch.buffer), name); off += 30 + name.length + data.length;
  }
  const csz = cen.reduce((a, b) => a + b.length, 0); const end = new DataView(new ArrayBuffer(22)); end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, csz, true); end.setUint32(16, off, true);
  return new Blob([...parts, ...cen, new Uint8Array(end.buffer)], { type: 'application/zip' });
}

async function devServer() { try { const r = await fetch('__colombo/sounds', { cache: 'no-cache' }); if (!r.ok || !(r.headers.get('content-type') || '').includes('json')) return null; const j = await r.json(); return j && j.ok ? j : null; } catch { return null; } }
const pickFiles = (multiple) => new Promise((res) => { const i = h('input', { type: 'file', accept: ACCEPT, multiple, style: { display: 'none' } }); i.addEventListener('change', () => { res([...i.files]); i.remove(); }); document.body.appendChild(i); i.click(); });
const extOf = (name, fb = 'mp3') => ((name || '').match(SOUND_EXT) || ['', fb])[1].toLowerCase();

export async function open(game) {
  if (!cssDone) { cssDone = true; const s = document.createElement('style'); s.textContent = CSS; document.head.appendChild(s); }
  if (globalThis.__soundsWin && !globalThis.__soundsWin.closed) return globalThis.__soundsWin;
  Audio.init(); await SoundBank.load();
  const session = beginSession(game, 'sounds');
  const W = Math.min(900, innerWidth - 40), H = Math.min(640, innerHeight - 40);
  let preview = null; const stopPreview = () => { if (preview) { try { preview.stop(); } catch { /* ended */ } preview = null; } };
  const win = new Win('Sounds — replace any sound in the game', { x: (innerWidth - W) / 2, y: (innerHeight - H) / 2, w: W, h: H, onClose: () => { stopPreview(); session.end(); } });
  globalThis.__soundsWin = win; win.body.style.display = 'flex'; win.body.style.flexDirection = 'column';
  const pend = new Map(); // id → { op: 'set', data, name, vol } | { op: 'remove' } | { op: 'vol', vol }
  let dev = null;
  const playBuf = async (data, vol, id) => {
    stopPreview(); const c = Audio.ctx; if (!c) return; if (c.state === 'suspended') await c.resume();
    const b = data instanceof AudioBuffer ? data : await c.decodeAudioData(data.slice(0)); const s = c.createBufferSource(); s.buffer = b; const gn = c.createGain(); gn.gain.value = (SOUND_BY_ID[id] ? SOUND_BY_ID[id].lvl : 0.4) * vol;
    s.connect(gn); gn.connect(Audio.bus.sfx); s.start(); preview = s; s.onended = () => { if (preview === s) preview = null; };
  };
  const decodes = async (data) => { try { await Audio.ctx.decodeAudioData(data.slice(0)); return true; } catch { return false; } };

  const search = h('input', { type: 'text', placeholder: 'Search sounds…', style: { flex: 1, minWidth: '160px' } });
  const cats = [...new Set(SOUND_DEFS.map((d) => d.cat))];
  const catSel = h('select', {}, h('option', { value: '' }, 'All categories'), cats.map((c) => h('option', { value: c }, c)));
  const onlyCus = h('input', { type: 'checkbox' });
  const info = h('div', { cls: 'snd-info' }, 'Checking where sounds are saved…');
  const list = h('div', { cls: 'snd-list' });
  const saveB = btn('Save', () => save(), { cls: 'on' }), discardB = btn('Discard changes', () => { pend.clear(); render(); });
  const counter = h('span', { style: { color: '#9fb0c0' } });
  win.body.append(h('div', { cls: 'snd-top' }, search, catSel, h('label', { style: { display: 'flex', gap: '4px', alignItems: 'center', color: '#aeb7c4' } }, onlyCus, 'Replaced only')), info, list,
    h('div', { cls: 'snd-foot' }, saveB, discardB, counter, h('span', { cls: 'sp' }),
      btn('Import files…', () => importFiles(), { title: 'Pick several recordings at once; each file must be named after its sound id, e.g. gun.assault.mp3' }),
      btn('Export pack (.zip)', () => exportPack(), { title: 'All replaced sounds as a .zip: unzip into the project folder (creates sounds/) to build them into the .exe' }), btn('Close', () => win.close())));
  search.addEventListener('input', () => render()); catSel.addEventListener('change', () => render()); onlyCus.addEventListener('change', () => render());

  const state = (id) => {
    const p = pend.get(id), cur = SoundBank.info(id);
    if (p && p.op === 'set') return { cls: 'pend', txt: '● ' + p.name + ' (not saved)', custom: true, vol: p.vol };
    if (p && p.op === 'remove') return { cls: 'pend', txt: cur && cur.pack && cur.src === 'user' ? '● back to the built-in pack (not saved)' : '● back to the original (not saved)', custom: false, vol: 1 };
    if (cur) return { cls: cur.ok ? 'cus' : 'bad', txt: (cur.ok ? '' : '⚠ cannot decode · ') + cur.name + (cur.src === 'pack' ? ' · built into the game' : '') + (p && p.op === 'vol' ? ' · volume (not saved)' : ''), custom: true, vol: p && p.op === 'vol' ? p.vol : cur.vol };
    return { cls: '', txt: 'Original (synthesised)', custom: false, vol: 1 };
  };
  async function choose(id) {
    const [f] = await pickFiles(false); if (!f) return; if (!SOUND_EXT.test(f.name)) { toast('Only .mp3, .wav or .ogg files', 2600); return; }
    const data = await f.arrayBuffer(); if (!(await decodes(data))) { toast(`"${f.name}" is not a playable audio file`, 3000); return; }
    pend.set(id, { op: 'set', data, name: f.name, vol: 1 }); render(); playBuf(data, 1, id);
  }
  async function importFiles() {
    const files = await pickFiles(true); let ok = 0; const bad = [];
    for (const f of files) { const id = f.name.replace(SOUND_EXT, ''); if (!SOUND_BY_ID[id] || !SOUND_EXT.test(f.name)) { bad.push(f.name); continue; } const data = await f.arrayBuffer(); if (!(await decodes(data))) { bad.push(f.name); continue; } pend.set(id, { op: 'set', data, name: f.name, vol: 1 }); ok++; }
    render(); toast(`${ok} file(s) ready — press Save` + (bad.length ? ` · skipped: ${bad.slice(0, 4).join(', ')}${bad.length > 4 ? '…' : ''} (the name must be a sound id)` : ''), 4200);
  }
  function exportPack() {
    const files = []; const meta = {};
    for (const d of SOUND_DEFS) { const r = SoundBank.raw.get(d.id); if (!r || !r.data) continue; files.push({ name: `sounds/${d.id}.${extOf(r.name, r.type || 'mp3')}`, data: r.data }); meta[d.id] = { name: r.name, vol: r.vol ?? 1 }; }
    if (!files.length) { toast('No replaced sounds to export yet', 2400); return; }
    files.push({ name: 'sounds/sounds.json', data: new TextEncoder().encode(JSON.stringify(meta, null, 2) + '\n') });
    const a = h('a', { href: URL.createObjectURL(makeZip(files)), download: 'colombo-custom-sounds.zip' }); document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 800);
    toast(`Exported ${files.length - 1} sound(s). Unzip into the project folder (it creates sounds/), then run build-exe.bat`, 5200);
  }
  async function save() {
    if (!pend.size) return; saveB.disabled = true; let n = 0; const errs = [];
    for (const [id, p] of pend) {
      try {
        const q = encodeURIComponent(id);
        if (p.op === 'set') { await SoundBank.set(id, p.data, p.name, p.vol); if (dev) { const r = await fetch(`__colombo/sounds/${q}?ext=${extOf(p.name)}&name=${encodeURIComponent(p.name)}&vol=${p.vol}`, { method: 'POST', body: p.data }); if (!r.ok) errs.push(`${id}: project folder write failed (${r.status})`); } }
        else if (p.op === 'remove') { await SoundBank.remove(id); if (dev) await fetch(`__colombo/sounds/${q}`, { method: 'DELETE' }); }
        else if (p.op === 'vol') { await SoundBank.setVolume(id, p.vol); if (dev) await fetch(`__colombo/sounds/${q}?vol=${p.vol}`, { method: 'PATCH' }); }
        n++;
      } catch (e) { errs.push(`${id}: ${(e && e.message) || e}`); }
    }
    pend.clear(); saveB.disabled = false; render();
    toast(errs.length ? `Saved ${n} · problems: ${errs.slice(0, 2).join(' · ')}` : `Saved ${n} change(s) — the game now uses ${n === 1 ? 'it' : 'them'}${dev ? ' (also written to sounds/ for .exe builds)' : ''}`, errs.length ? 5000 : 3200);
  }
  const playOriginal = (id) => { stopPreview(); if (!demoOriginal(game, id)) toast('Continuous sound (engine / siren / rotor / ambience / music) — the original is heard in the game itself', 2600); };
  function row(d) {
    const st = state(d.id), p = pend.get(d.id), cur = SoundBank.info(d.id);
    const play = btn('▶', () => { if (p && p.op === 'set') return playBuf(p.data, p.vol, d.id); if (p && p.op === 'remove') return playOriginal(d.id); const b = SoundBank.buf.get(d.id); if (b) return playBuf(b, st.vol, d.id); return playOriginal(d.id); }, { title: 'Play what the game will use', cls: 'snd-play' });
    const orig = btn('Original', () => playOriginal(d.id), { title: 'Play the original synthesised sound' });
    const vol = h('input', { type: 'range', min: 0, max: 2, step: 0.05, value: st.vol, title: 'Volume of the recording' }); vol.disabled = !st.custom;
    vol.addEventListener('change', () => { const v = +vol.value; if (p && p.op === 'set') p.vol = v; else pend.set(d.id, { op: 'vol', vol: v }); render(); });
    const reset = btn('Reset', () => { if (p) pend.delete(d.id); if (cur && cur.src === 'user' && !(p && p.op === 'remove')) pend.set(d.id, { op: 'remove' }); render(); }, { title: 'Back to the original sound', cls: 'warn' });
    if (!p && (!cur || cur.src === 'pack')) { reset.disabled = true; if (cur) reset.title = 'Built into the game from the project\'s sounds/ folder — remove the file there to undo'; }
    return h('div', { cls: 'snd-row' }, play, h('div', { cls: 'nm' }, d.name, h('small', {}, d.id + (d.kind === 'loop' ? ' · loop' : ''))), h('div', { cls: 'st ' + st.cls, title: st.txt }, st.txt),
      h('span', { style: { display: 'flex', gap: '4px' } }, btn('Choose file…', () => choose(d.id), { title: '.mp3 / .wav / .ogg' }), orig), vol, reset);
  }
  function render() {
    const q = search.value.trim().toLowerCase(), cat = catSel.value; const top = list.scrollTop; list.textContent = ''; let last = null, shown = 0;
    for (const d of SOUND_DEFS) {
      if (cat && d.cat !== cat) continue; if (q && !(d.name.toLowerCase().includes(q) || d.id.includes(q))) continue; if (onlyCus.checked && !SoundBank.info(d.id) && !pend.has(d.id)) continue;
      if (d.cat !== last) { last = d.cat; list.append(h('div', { cls: 'snd-cat' }, d.cat)); } list.append(row(d)); shown++;
    }
    if (!shown) list.append(h('div', { style: { padding: '14px', color: '#7f8a98' } }, 'No sounds match.'));
    list.scrollTop = top; const nCus = SOUND_DEFS.filter((d) => SoundBank.info(d.id)).length;
    counter.textContent = `${SOUND_DEFS.length} sounds · ${nCus} replaced` + (pend.size ? ` · ${pend.size} unsaved change(s)` : ''); saveB.disabled = !pend.size; discardB.disabled = !pend.size;
  }
  render();
  dev = await devServer();
  const esc = (t) => String(t).replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
  info.innerHTML = dev
    ? `Saving to <b>this machine</b> and to the project folder <b>${esc(dev.folder)}</b> — <b>npm run build</b> and <b>build-exe.bat</b> build those recordings into the game and the .exe.`
    : `Saving to <b>this ${navigator.userAgent.includes('Electron') ? 'app' : 'browser'}</b> (kept between launches). To build your recordings into the .exe: <b>Export pack (.zip)</b>, unzip it in the project folder (it creates <b>sounds/</b>), then run <b>build-exe.bat</b>. Running the game with <b>npm run dev</b> saves into sounds/ directly.`;
  win.session = session; win.pend = pend; win.render = render; win.save = save; // (inspectable / scriptable from tests)
  return win;
}
