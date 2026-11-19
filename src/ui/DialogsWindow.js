// `dialogs` console command: NPC voice recordings (code-split — downloaded only when the command is typed).
// Pick a kind of NPC on the left (Everyone, men, women, elderly, drivers, police, paramedics, shopkeepers, vendors, tourists …)
// and give any situation up to four clips: talking, greeting, laughing, angry, scared, screaming, running away, calling for
// help, hurt, dying, hands up, car stolen, orders. The game plays them from that NPC's position when it happens (Voices.js);
// several clips of one situation take turns. Saved like the `sounds` window's recordings: on this machine, on the dev server
// also into the project's sounds/ folder (so npm run build / build-exe.bat build them into the game and the .exe).
import { Win, h, btn, beginSession, toast } from '../debug/ui.js';
import { SOUND_BY_ID, SOUND_EXT, SoundBank } from '../audio/SoundBank.js';
import { VOICE_GROUPS, VOICE_SITS, VOICE_CLIPS, voiceId, PROFILE_GROUP, GROUP_BY_ID, BANK_CALL, BANK_TELLERS, bankCallId, bankCounterId } from '../audio/VoiceDefs.js';
import { Voices } from '../audio/Voices.js';
import { Audio } from '../audio/Audio.js';
import { makeZip } from './SoundsWindow.js';

const CSS = `
.dlg-wrap{display:flex;gap:8px;flex:1;min-height:0}
.dlg-groups{width:190px;overflow:auto;border:1px solid #2c3340;border-radius:5px;background:#0f1116;flex:none}
.dlg-g{padding:6px 9px;border-bottom:1px solid #1a1f28;cursor:pointer;display:flex;gap:6px;align-items:center}
.dlg-g:hover{background:#151a22}.dlg-g.on{background:#2a2412;color:#f0c060}
.dlg-g .n{flex:1}.dlg-g .c{color:#7fd0a0;font-size:10px}
.dlg-main{flex:1;overflow:auto;border:1px solid #2c3340;border-radius:5px;background:#0f1116;min-width:0}
.dlg-head{position:sticky;top:0;background:#1d222c;padding:6px 10px;border-bottom:1px solid #2c3340;z-index:1}
.dlg-head b{color:#e0a030}.dlg-head small{display:block;color:#8a95a3;margin-top:2px}
.dlg-sit{padding:6px 10px;border-bottom:1px solid #1a1f28}
.dlg-sit .t{display:flex;gap:8px;align-items:baseline}.dlg-sit .t b{color:#dfe6ee}.dlg-sit .t small{color:#7f8a98;flex:1}
.dlg-sit .t .use{color:#9fb0c0;font-size:10px;white-space:nowrap}
.dlg-clips{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px 10px;margin-top:4px}
.dlg-clip{display:flex;gap:4px;align-items:center;min-width:0}
.dlg-clip .st{flex:1;color:#6f7a88;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dlg-clip .st.cus{color:#7fd0a0}.dlg-clip .st.pend{color:#f0c060}.dlg-clip .st.bad{color:#f0866e}
.dlg-clip input[type=range]{width:54px;accent-color:#e0a030}
.dlg-clip button{padding:1px 6px}
.dlg-g.bank{border-top:2px solid #2c3340}.dlg-line{color:#cfd7e0;font-style:italic;margin:2px 0 4px;font-size:11px}
`;
let cssDone = false;
const ACCEPT = '.mp3,.wav,.ogg,audio/mpeg,audio/wav,audio/x-wav,audio/ogg';
const pickFiles = (multiple) => new Promise((res) => { const i = h('input', { type: 'file', accept: ACCEPT, multiple, style: { display: 'none' } }); i.addEventListener('change', () => { res([...i.files]); i.remove(); }); document.body.appendChild(i); i.click(); });
const extOf = (name, fb = 'mp3') => ((name || '').match(SOUND_EXT) || ['', fb])[1].toLowerCase();
async function devServer() { try { const r = await fetch('__colombo/sounds', { cache: 'no-cache' }); if (!r.ok || !(r.headers.get('content-type') || '').includes('json')) return null; const j = await r.json(); return j && j.ok ? j : null; } catch { return null; } }
// a stand-in speaker of a group (to show / hear which clip such an NPC would get)
const CONTEXT = new Set(['driver', 'police', 'medic', 'shopkeeper']);
export function specOf(g) { const prof = Object.keys(PROFILE_GROUP).find((k) => PROFILE_GROUP[k] === g && !CONTEXT.has(g)); return { sex: g === 'woman' || g === 'aunty' ? 'f' : 'm', age: g === 'uncle' || g === 'aunty' ? 'elder' : 'adult', profile: prof || null }; }
const BASIC = new Set(['any', 'man', 'woman', 'uncle', 'aunty']);
const ctxOf = (g) => (BASIC.has(g) ? null : g); // the group itself heads the chain (specOf covers the basic ones)

export async function open(game) {
  if (!cssDone) { cssDone = true; const s = document.createElement('style'); s.textContent = CSS; document.head.appendChild(s); }
  if (globalThis.__dialogsWin && !globalThis.__dialogsWin.closed) return globalThis.__dialogsWin;
  Audio.init(); await SoundBank.load();
  const session = beginSession(game, 'dialogs');
  const W = Math.min(980, innerWidth - 40), H = Math.min(680, innerHeight - 40);
  let preview = null; const stopPreview = () => { if (preview) { try { preview.stop(); } catch { /* ended */ } preview = null; } };
  const win = new Win('Dialogs — NPC voices', { x: (innerWidth - W) / 2, y: (innerHeight - H) / 2, w: W, h: H, onClose: () => { stopPreview(); session.end(); } });
  globalThis.__dialogsWin = win; win.body.style.display = 'flex'; win.body.style.flexDirection = 'column';
  const pend = new Map(); let dev = null; let group = 'any';
  const playBuf = async (data, vol, id) => {
    stopPreview(); const c = Audio.ctx; if (!c) return; if (c.state === 'suspended') await c.resume();
    const b = data instanceof AudioBuffer ? data : await c.decodeAudioData(data.slice(0)); const s = c.createBufferSource(); s.buffer = b; const gn = c.createGain(); gn.gain.value = (SOUND_BY_ID[id] ? SOUND_BY_ID[id].lvl : 0.6) * vol;
    s.connect(gn); gn.connect(Audio.bus.dlg); s.start(); preview = s; s.onended = () => { if (preview === s) preview = null; };
  };
  const decodes = async (data) => { try { await Audio.ctx.decodeAudioData(data.slice(0)); return true; } catch { return false; } };

  const info = h('div', { cls: 'snd-info', style: { color: '#9fb0c0', fontSize: '11px', margin: '0 0 6px', lineHeight: '1.45' } }, 'Checking where recordings are saved…');
  const search = h('input', { type: 'text', placeholder: 'Filter situations…', style: { flex: 1, minWidth: '160px' } });
  const groupsEl = h('div', { cls: 'dlg-groups' }), main = h('div', { cls: 'dlg-main' });
  const saveB = btn('Save', () => save(), { cls: 'on' }), discardB = btn('Discard changes', () => { pend.clear(); render(); });
  const counter = h('span', { style: { color: '#9fb0c0' } });
  win.body.append(h('div', { style: { display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '6px' } }, search), info, h('div', { cls: 'dlg-wrap' }, groupsEl, main),
    h('div', { style: { display: 'flex', gap: '6px', alignItems: 'center', marginTop: '6px', flexWrap: 'wrap' } }, saveB, discardB, counter, h('span', { style: { flex: 1 } }),
      btn('Import files…', () => importFiles(), { title: 'Pick many recordings at once; each file named after its slot id, e.g. dlg.man.scream.mp3, dlg.man.scream.var1.mp3' }),
      btn('Export pack (.zip)', () => exportPack(), { title: 'Every recording (NPC voices + sounds) as a .zip: unzip into the project folder (creates sounds/) to build them into the .exe' }), btn('Close', () => win.close())));
  search.addEventListener('input', () => render());

  const state = (id) => {
    const p = pend.get(id), cur = SoundBank.info(id);
    if (p && p.op === 'set') return { cls: 'pend', txt: '● ' + p.name + ' (not saved)', custom: true, vol: p.vol };
    if (p && p.op === 'remove') return { cls: 'pend', txt: '● removed (not saved)', custom: false, vol: 1 };
    if (cur) return { cls: cur.ok ? 'cus' : 'bad', txt: (cur.ok ? '' : '⚠ cannot decode · ') + cur.name + (cur.src === 'pack' ? ' · built in' : '') + (p && p.op === 'vol' ? ' · volume (not saved)' : ''), custom: true, vol: p && p.op === 'vol' ? p.vol : cur.vol };
    return { cls: '', txt: 'empty', custom: false, vol: 1 };
  };
  const filled = (id) => { const p = pend.get(id); if (p) return p.op !== 'remove'; return !!SoundBank.info(id); };
  const BANK_IDS = [...BANK_CALL.map((_, i) => bankCallId(i + 1)), ...BANK_TELLERS.flatMap((t) => t.lines.map((_, i) => bankCounterId(t.id, i + 1)))];
  const groupCount = (g) => { if (g === 'bank') return BANK_IDS.filter(filled).length; let n = 0; for (const s of VOICE_SITS) for (let k = 0; k < VOICE_CLIPS; k++) if (filled(voiceId(g, s.id, k))) n++; return n; };
  // which group's clips a speaker of group g would hear for situation s (saved recordings only)
  const answers = (g, s) => { if (g === 'any') return SoundBank.has(voiceId('any', s)) ? 'any' : null; const id = Voices.find(specOf(g), s, ctxOf(g)); return id ? id.split('.')[1] : null; };

  async function choose(id) {
    const [f] = await pickFiles(false); if (!f) return; if (!SOUND_EXT.test(f.name)) { toast('Only .mp3, .wav or .ogg files', 2600); return; }
    const data = await f.arrayBuffer(); if (!(await decodes(data))) { toast(`"${f.name}" is not a playable audio file`, 3000); return; }
    pend.set(id, { op: 'set', data, name: f.name, vol: 1 }); render(); playBuf(data, 1, id);
  }
  async function importFiles() {
    const files = await pickFiles(true); let ok = 0; const bad = [];
    for (const f of files) { const id = f.name.replace(SOUND_EXT, ''); if (!SOUND_BY_ID[id] || !SOUND_BY_ID[id].dlg || !SOUND_EXT.test(f.name)) { bad.push(f.name); continue; } const data = await f.arrayBuffer(); if (!(await decodes(data))) { bad.push(f.name); continue; } pend.set(id, { op: 'set', data, name: f.name, vol: 1 }); ok++; }
    render(); toast(`${ok} file(s) ready — press Save` + (bad.length ? ` · skipped: ${bad.slice(0, 4).join(', ')}${bad.length > 4 ? '…' : ''} (name must be a slot id like dlg.woman.scream.mp3)` : ''), 4500);
  }
  function exportPack() {
    const files = []; const meta = {};
    for (const [id, r] of SoundBank.raw) { if (!r || !r.data || !SOUND_BY_ID[id]) continue; files.push({ name: `sounds/${id}.${extOf(r.name, r.type || 'mp3')}`, data: r.data }); meta[id] = { name: r.name, vol: r.vol ?? 1 }; }
    if (!files.length) { toast('No recordings to export yet', 2400); return; }
    files.push({ name: 'sounds/sounds.json', data: new TextEncoder().encode(JSON.stringify(meta, null, 2) + '\n') });
    const a = h('a', { href: URL.createObjectURL(makeZip(files)), download: 'colombo-custom-sounds.zip' }); document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 800);
    toast(`Exported ${files.length - 1} recording(s). Unzip into the project folder (it creates sounds/), then run build-exe.bat`, 5200);
  }
  async function save() {
    if (!pend.size) return; saveB.disabled = true; let n = 0; const errs = [];
    for (const [id, p] of pend) {
      try { const q = encodeURIComponent(id);
        if (p.op === 'set') { await SoundBank.set(id, p.data, p.name, p.vol); if (dev) { const r = await fetch(`__colombo/sounds/${q}?ext=${extOf(p.name)}&name=${encodeURIComponent(p.name)}&vol=${p.vol}`, { method: 'POST', body: p.data }); if (!r.ok) errs.push(`${id}: project folder write failed (${r.status})`); } }
        else if (p.op === 'remove') { await SoundBank.remove(id); if (dev) await fetch(`__colombo/sounds/${q}`, { method: 'DELETE' }); }
        else if (p.op === 'vol') { await SoundBank.setVolume(id, p.vol); if (dev) await fetch(`__colombo/sounds/${q}?vol=${p.vol}`, { method: 'PATCH' }); }
        n++; } catch (e) { errs.push(`${id}: ${(e && e.message) || e}`); }
    }
    pend.clear(); saveB.disabled = false; render();
    toast(errs.length ? `Saved ${n} · problems: ${errs.slice(0, 2).join(' · ')}` : `Saved ${n} change(s) — NPCs use them now${dev ? ' (also written to sounds/ for .exe builds)' : ''}`, errs.length ? 5000 : 3200);
  }
  // hear the situation as the game would play it, from 3 m in front of the player (saved recordings, the group's fallback chain)
  const hear = (g, s) => { const l = Audio.listener || { x: 0, z: 0, yaw: 0 }; const x = l.x + Math.sin(l.yaw || 0) * 3, z = l.z + Math.cos(l.yaw || 0) * 3;
    const d = g === 'any' ? (SoundBank.has(voiceId('any', s)) ? Audio.voice(voiceId('any', s), x, z) : 0) : Voices.say(specOf(g), s, x, z, null, ctxOf(g), { rate: 1 }); if (!d) toast('Nothing saved for this yet (save first) — the game keeps its own voice blip / silence', 2600); };

  function clipCell(id, n) {
    const st = state(id), p = pend.get(id), cur = SoundBank.info(id);
    const play = btn('▶', () => { if (p && p.op === 'set') return playBuf(p.data, p.vol, id); const b = SoundBank.buf.get(id); if (b && !(p && p.op === 'remove')) return playBuf(b, st.vol, id); toast('Empty slot', 1200); }, { title: 'Play this clip' });
    const vol = h('input', { type: 'range', min: 0, max: 2, step: 0.05, value: st.vol, title: 'Volume' }); vol.disabled = !st.custom;
    vol.addEventListener('change', () => { const v = +vol.value; if (p && p.op === 'set') p.vol = v; else pend.set(id, { op: 'vol', vol: v }); render(); });
    const del = btn('✕', () => { if (p) pend.delete(id); if (cur && cur.src === 'user' && !(p && p.op === 'remove')) pend.set(id, { op: 'remove' }); render(); }, { title: 'Remove this clip', cls: 'warn' });
    if (!p && (!cur || cur.src === 'pack')) { del.disabled = true; if (cur) del.title = 'Built into the game from the project\'s sounds/ folder — remove the file there to undo'; }
    return h('div', { cls: 'dlg-clip' }, h('span', { style: { color: '#6f7a88', width: '14px' } }, String(n + 1)), play, h('div', { cls: 'st ' + st.cls, title: id + ' · ' + st.txt }, st.txt), btn('Choose…', () => choose(id), { title: '.mp3 / .wav / .ogg' }), vol, del);
  }
  function render() {
    const gt = groupsEl.scrollTop; groupsEl.textContent = '';
    for (const g of VOICE_GROUPS) { const n = groupCount(g.id); groupsEl.append(h('div', { cls: 'dlg-g' + (g.id === group ? ' on' : ''), title: g.note, onclick: () => { group = g.id; main.scrollTop = 0; render(); } }, h('span', { cls: 'n' }, g.name), n ? h('span', { cls: 'c' }, n + ' clip' + (n > 1 ? 's' : '')) : null)); }
    { const n = groupCount('bank'); groupsEl.append(h('div', { cls: 'dlg-g bank' + (group === 'bank' ? ' on' : ''), title: 'Ceylon Meridian Bank: the back-office phone call and the counter officers', onclick: () => { group = 'bank'; main.scrollTop = 0; render(); } }, h('span', { cls: 'n' }, 'Bank staff (CMB)'), n ? h('span', { cls: 'c' }, n + ' clip' + (n > 1 ? 's' : '')) : null)); }
    groupsEl.scrollTop = gt;
    if (group === 'bank') { renderBank(); return; }
    const G = GROUP_BY_ID[group]; const q = search.value.trim().toLowerCase(); const mt = main.scrollTop; main.textContent = '';
    const chain = group === 'any' ? ['any'] : Voices.chain(specOf(group), ctxOf(group)).filter((x, i, a) => a.indexOf(x) === i);
    main.append(h('div', { cls: 'dlg-head' }, h('b', {}, G.name), ' — ', G.note, h('small', {}, group === 'any' ? 'Used by any NPC that has nothing more specific for that situation.' : `Where a situation has no clip here, these NPCs use: ${chain.slice(1).map((c) => GROUP_BY_ID[c].name).join(' → ')} → (the game's own voice blip / silence).`)));
    for (const s of VOICE_SITS) {
      if (q && !(s.name.toLowerCase().includes(q) || s.note.toLowerCase().includes(q))) continue;
      const a = answers(group, s.id); const use = a ? (a === group ? 'uses these clips' : `now uses: ${GROUP_BY_ID[a].name}`) : 'nothing saved — game default';
      main.append(h('div', { cls: 'dlg-sit' }, h('div', { cls: 't' }, h('b', {}, s.name), h('small', {}, s.note), h('span', { cls: 'use' }, use), btn('Hear in game', () => hear(group, s.id), { title: 'Play it like the game does, from 3 m in front of you (saved clips; several take turns)' })),
        h('div', { cls: 'dlg-clips' }, [...Array(VOICE_CLIPS)].map((_, n) => clipCell(voiceId(group, s.id, n), n)))));
    }
    main.scrollTop = mt; footer();
  }
  // 71st: Ceylon Meridian Bank staff — one clip per line; the line's text is the subtitle and the recording script
  function renderBank() {
    const q = search.value.trim().toLowerCase(); const mt = main.scrollTop; main.textContent = '';
    main.append(h('div', { cls: 'dlg-head' }, h('b', {}, 'Bank staff — Ceylon Meridian Bank'), h('small', {}, 'Phone call: the officer who gets up to answer the back-office phone says lines 1 → 9 in order over about a minute (the caller\'s side is the pauses). Counter: each officer says one of their three lines on their own when the player walks up to the counter (they take turns). An empty slot shows the subtitle only.')));
    const hearId = (id) => { const l = Audio.listener || { x: 0, z: 0, yaw: 0 }; if (!SoundBank.has(id) || !Audio.voice(id, l.x + Math.sin(l.yaw || 0) * 3, l.z + Math.cos(l.yaw || 0) * 3)) toast('Nothing saved for this line yet (save first)', 2200); };
    const row = (title, text, id) => { if (q && !(title.toLowerCase().includes(q) || text.toLowerCase().includes(q))) return; main.append(h('div', { cls: 'dlg-sit' }, h('div', { cls: 't' }, h('b', {}, title), h('small', {}, id), btn('Hear in game', () => hearId(id), { title: 'Play it from 3 m in front of you (saved clip)' })), h('div', { cls: 'dlg-line' }, '“' + text + '”'), h('div', { cls: 'dlg-clips', style: { gridTemplateColumns: '1fr' } }, clipCell(id, 0)))); };
    BANK_CALL.forEach((text, i) => row(`Phone call — line ${i + 1}`, text, bankCallId(i + 1)));
    for (const t of BANK_TELLERS) t.lines.forEach((text, i) => row(`${t.name} — counter line ${i + 1}`, text, bankCounterId(t.id, i + 1)));
    main.scrollTop = mt; footer();
  }
  function footer() {
    let tot = groupCount('bank'); for (const g of VOICE_GROUPS) tot += groupCount(g.id);
    counter.textContent = `${VOICE_GROUPS.length} kinds of NPC × ${VOICE_SITS.length} situations + ${BANK_IDS.length} bank staff lines · ${tot} clip(s)` + (pend.size ? ` · ${pend.size} unsaved change(s)` : ''); saveB.disabled = !pend.size; discardB.disabled = !pend.size;
  }
  render();
  dev = await devServer();
  const esc = (t) => String(t).replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
  info.innerHTML = (dev
    ? `Saving to <b>this machine</b> and to the project folder <b>${esc(dev.folder)}</b> — <b>npm run build</b> and <b>build-exe.bat</b> build them into the game and the .exe.`
    : `Saving to <b>this ${navigator.userAgent.includes('Electron') ? 'app' : 'browser'}</b> (kept between launches). For the .exe: <b>Export pack (.zip)</b>, unzip in the project folder, run <b>build-exe.bat</b>.`)
    + ' Up to 4 clips per situation — they take turns, never the same one twice in a row. Each NPC speaks with the most specific kind that has a clip.';
  win.session = session; win.pend = pend; win.render = render; win.save = save; win.setGroup = (g) => { group = g; render(); };
  return win;
}
