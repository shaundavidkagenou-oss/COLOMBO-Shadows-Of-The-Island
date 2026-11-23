// Environment editor (console `paint`) — layout and widgets on top of the debug UI kit (src/debug/ui.js): a docked editor
// frame around the live game view (toolbar, left / right docks with tabs, status bar), modal dialogs, asset cards.
import { h, btn, css as baseCss } from './ui.js';

const CSS = `
.pe-root{position:fixed;inset:0;z-index:8990;pointer-events:none;font:12px/1.4 system-ui,'Segoe UI',Arial,sans-serif;color:#dfe5ec}
.pe-root *{box-sizing:border-box}
.pe-bar{position:absolute;left:0;right:0;top:0;height:42px;display:flex;align-items:center;gap:6px;padding:0 10px;background:linear-gradient(#1d222c,#161a22);border-bottom:1px solid #313949;pointer-events:auto;box-shadow:0 2px 12px rgba(0,0,0,.45)}
.pe-logo{font-weight:700;letter-spacing:.6px;color:#f0b440;margin-right:8px;white-space:nowrap}.pe-logo small{color:#8a93a0;font-weight:500;margin-left:6px;letter-spacing:0}
.pe-grp{display:flex;gap:2px;padding:0 6px;border-left:1px solid #2c3442;align-items:center}
.pe-tb{background:#262d3a;color:#e6ebf1;border:1px solid #3a4456;border-radius:5px;height:28px;min-width:30px;padding:0 9px;cursor:pointer;font:inherit;display:flex;align-items:center;gap:5px;white-space:nowrap}
.pe-tb:hover{background:#323b4c}.pe-tb.on{background:#a8701a;border-color:#e0a030;color:#fff}.pe-tb:disabled{opacity:.45;cursor:default}
.pe-tb.primary{background:#2f6b3a;border-color:#4fa860}.pe-tb.primary:hover{background:#3a8247}.pe-tb.danger{background:#5a2428;border-color:#8a3a40}
.pe-tb kbd{font:10px ui-monospace,monospace;color:#9aa4b2;background:none;border:0}
.pe-sp{flex:1}
.pe-dock{position:absolute;top:42px;bottom:26px;width:318px;background:rgba(17,20,27,.95);pointer-events:auto;display:flex;flex-direction:column;border-color:#2c3442;border-style:solid;border-width:0;transition:transform .15s}
.pe-dock.l{left:0;border-right-width:1px}.pe-dock.r{right:0;width:346px;border-left-width:1px}
.pe-dock.l.hid{transform:translateX(-100%)}.pe-dock.r.hid{transform:translateX(100%)}
.pe-tabs{display:flex;background:#141820;border-bottom:1px solid #2c3442;flex:none}
.pe-tab{flex:1;padding:8px 4px;text-align:center;cursor:pointer;color:#9aa4b2;border-bottom:2px solid transparent;font-weight:600;white-space:nowrap}
.pe-tab:hover{color:#dfe5ec}.pe-tab.on{color:#f0b440;border-bottom-color:#f0b440;background:#1a1f29}
.pe-pane{flex:1;overflow:auto;padding:8px 10px;display:none;min-height:0}.pe-pane.on{display:block}
.pe-status{position:absolute;left:0;right:0;bottom:0;height:26px;display:flex;align-items:center;gap:14px;padding:0 10px;background:#12151c;border-top:1px solid #2c3442;pointer-events:auto;color:#9aa4b2;white-space:nowrap;overflow:hidden}
.pe-status b{color:#dfe5ec;font-weight:600}.pe-status .warn{color:#f0b440}.pe-status .ok{color:#6fcf7f}
.pe-h{font-weight:700;color:#f0b440;margin:10px 0 5px;text-transform:uppercase;font-size:11px;letter-spacing:.7px}
.pe-h:first-child{margin-top:2px}
.pe-hint{color:#8a93a0;font-size:11px;margin:4px 0}
.pe-cards{display:grid;grid-template-columns:repeat(2,1fr);gap:6px}
.pe-card{background:#1b2029;border:1px solid #2c3442;border-radius:6px;cursor:pointer;overflow:hidden;position:relative}
.pe-card:hover{border-color:#4a5568}.pe-card.sel{border-color:#e0a030;box-shadow:0 0 0 1px #e0a030}
.pe-card img,.pe-card .ph{display:block;width:100%;aspect-ratio:1.25;object-fit:cover;background:#232935}
.pe-card .ph{display:flex;align-items:center;justify-content:center;color:#5a6474;font-size:22px}
.pe-card .nm{padding:3px 6px 0;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pe-card .mt{padding:0 6px 4px;color:#8a93a0;font-size:10.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pe-card .bad{position:absolute;top:4px;right:4px;background:#b0283a;color:#fff;border-radius:3px;padding:0 4px;font-size:10px}
.pe-card .inmix{position:absolute;top:4px;left:4px;background:#2f6b3a;color:#fff;border-radius:3px;padding:0 4px;font-size:10px}
.pe-row{display:flex;align-items:center;gap:6px;margin:3px 0;min-height:24px}
.pe-row>label{flex:0 0 40%;color:#aeb7c4;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pe-row input[type=number]{width:100%;min-width:0}
.pe-root input,.pe-root select,.pe-root textarea,.pe-modal input,.pe-modal select{background:#0e1116;color:#e8edf3;border:1px solid #3a4456;border-radius:4px;padding:3px 5px;font:inherit}
.pe-root input[type=range]{accent-color:#e0a030;padding:0}
.pe-xyz{display:grid;grid-template-columns:auto 1fr 1fr 1fr;gap:4px;align-items:center;margin:3px 0}
.pe-xyz label{color:#aeb7c4;width:58px}.pe-xyz input{width:100%;min-width:0}
.pe-xyz .x{border-left:3px solid #d0474f}.pe-xyz .y{border-left:3px solid #5fb34f}.pe-xyz .z{border-left:3px solid #4a7fd6}
.pe-btns{display:flex;flex-wrap:wrap;gap:4px;margin:5px 0}
.pe-list{border:1px solid #2c3442;border-radius:5px;background:#0f1218;max-height:220px;overflow:auto}
.pe-li{display:flex;align-items:center;gap:6px;padding:4px 7px;cursor:pointer;border-bottom:1px solid #1a1f28}
.pe-li:hover{background:#1b212c}.pe-li.sel{background:#563c10}
.pe-li .n{flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.pe-li .c{color:#8a93a0;font-size:11px}
.pe-ico{background:none;border:0;color:#9aa4b2;cursor:pointer;font-size:13px;padding:0 3px;line-height:1}.pe-ico:hover{color:#fff}.pe-ico.off{color:#4a5260}
.pe-sw{width:10px;height:10px;border-radius:2px;flex:none}
.pe-drop{border:2px dashed #3a4456;border-radius:8px;padding:16px 10px;text-align:center;color:#8a93a0;margin:6px 0}
.pe-drop.over{border-color:#e0a030;color:#f0b440;background:#2a2112}
.pe-msg{padding:5px 8px;border-radius:4px;margin:3px 0;font-size:11.5px}
.pe-msg.err{background:#3a1a1e;color:#ff9aa4}.pe-msg.warn{background:#3a2e14;color:#f0c870}.pe-msg.ok{background:#16301c;color:#8fdf9a}.pe-msg.info{background:#172233;color:#9cc0ef}
.pe-map{display:flex;align-items:center;gap:6px;margin:4px 0;padding:4px;border:1px solid #262d3a;border-radius:5px;background:#141820}
.pe-map .th{width:38px;height:38px;border-radius:3px;background:#232935 center/cover;flex:none;border:1px solid #333c4c}
.pe-map .inf{flex:1;min-width:0}.pe-map .inf div{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pe-map .inf .t{font-weight:600}.pe-map .inf .s{color:#8a93a0;font-size:10.5px}
.pe-vp{height:210px;margin:6px 0}
.pe-modal-bg{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9600;display:flex;align-items:center;justify-content:center}
.pe-modal{background:#181c24;border:1px solid #3a4456;border-radius:9px;min-width:380px;max-width:min(720px,92vw);max-height:86vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,.6);color:#dfe5ec;font:12.5px/1.45 system-ui,'Segoe UI',Arial,sans-serif}
.pe-modal .mh{padding:10px 14px;font-weight:700;font-size:14px;border-bottom:1px solid #2c3442;color:#f0b440}
.pe-modal .mb{padding:10px 14px;overflow:auto}
.pe-modal .mf{padding:10px 14px;border-top:1px solid #2c3442;display:flex;gap:6px;justify-content:flex-end;flex-wrap:wrap}
.pe-modal pre{white-space:pre-wrap;background:#0e1116;border:1px solid #2c3442;border-radius:5px;padding:6px;max-height:240px;overflow:auto;font:11px ui-monospace,Consolas,monospace}
.pe-marquee{position:fixed;border:1px solid #f0b440;background:rgba(240,180,64,.12);z-index:8985;pointer-events:none}
.pe-help{position:absolute;left:330px;bottom:34px;background:rgba(14,17,23,.86);border:1px solid #2c3442;border-radius:6px;padding:6px 10px;color:#aeb7c4;font-size:11px;pointer-events:none;max-width:540px}
.pe-help b{color:#f0b440}
`;
let done = false;
export function css() { baseCss(); if (done || typeof document === 'undefined') return; done = true; const s = document.createElement('style'); s.textContent = CSS; document.head.appendChild(s); }
export const tb = (label, onClick, { title, cls, key } = {}) => h('button', { cls: 'pe-tb' + (cls ? ' ' + cls : ''), title: title ? title + (key ? ' (' + key + ')' : '') : key || undefined, onclick: onClick }, label, key ? h('kbd', {}, key) : null);
// tabbed dock: tabs = [[id, label]] → { el, panes: { id: element }, show(id) }
export function dock(side, tabs, onShow) {
  const el = h('div', { cls: 'pe-dock ' + side }); const bar = h('div', { cls: 'pe-tabs' }); const panes = {}; const tabEls = {};
  for (const [id, label] of tabs) { tabEls[id] = h('div', { cls: 'pe-tab', onclick: () => D.show(id) }, label); bar.append(tabEls[id]); panes[id] = h('div', { cls: 'pe-pane' }); }
  el.append(bar, ...Object.values(panes));
  const D = { el, panes, cur: null, show(id) { if (!panes[id]) return; D.cur = id; for (const k of Object.keys(panes)) { panes[k].classList.toggle('on', k === id); tabEls[k].classList.toggle('on', k === id); } if (onShow) onShow(id); } };
  for (const ev of ['keydown', 'keyup']) el.addEventListener(ev, (e) => { if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) e.stopPropagation(); });
  return D;
}
export const head = (t) => h('div', { cls: 'pe-h' }, t);
export const hint = (t) => h('div', { cls: 'pe-hint' }, t);
export const msg = (t, kind = 'info') => h('div', { cls: 'pe-msg ' + kind }, t);
export function row(label, ...kids) { return h('div', { cls: 'pe-row' }, h('label', { title: label }, label), ...kids); }
// three numeric fields (x y z); get() → values, set(arr | null = mixed)
export function xyz(label, onChange, { step = 0.1, digits = 3 } = {}) {
  const ins = ['x', 'y', 'z'].map((a, i) => { const e = h('input', { type: 'number', step, cls: a }); e.addEventListener('change', () => { const v = parseFloat(e.value); if (Number.isFinite(v)) onChange(i, v); }); return e; });
  const el = h('div', { cls: 'pe-xyz' }, h('label', {}, label), ...ins);
  el.set = (arr) => { ins.forEach((e, i) => { if (document.activeElement === e) return; if (!arr || arr[i] == null) { e.value = ''; e.placeholder = '—'; } else e.value = (+arr[i]).toFixed(digits).replace(/\.?0+$/, '') || '0'; }); };
  return el;
}
// slider + number box in one row (value v, { min, max, step }) — onChange(v); .set(v)
export function slider(label, v, { min = 0, max = 1, step = 0.01, title } = {}, onChange) {
  const r = h('input', { type: 'range', min, max, step, value: v, style: { flex: 1, minWidth: '40px' } }), n = h('input', { type: 'number', min, step, value: v, style: { width: '62px', flex: 'none' } });
  r.addEventListener('input', () => { n.value = r.value; onChange(+r.value); }); n.addEventListener('change', () => { const x = +n.value; if (!Number.isFinite(x)) return; r.value = x; onChange(x); });
  const el = h('div', { cls: 'pe-row', title }, h('label', { title: title || label }, label), r, n); el.set = (x) => { r.value = x; n.value = x; }; return el;
}
export function checkRow(label, v, onChange, title) { const c = h('input', { type: 'checkbox' }); c.checked = !!v; c.addEventListener('change', () => onChange(c.checked)); const el = h('div', { cls: 'pe-row', title }, h('label', { title: title || label }, label), c); el.set = (x) => { c.checked = !!x; }; return el; }
export function selectRow(label, opts, v, onChange, title) {
  const s = h('select', { style: { flex: 1, minWidth: 0 } }); const fill = (o, val) => { s.replaceChildren(...o.map((x) => { const [k, t] = Array.isArray(x) ? x : [x, x]; const e = h('option', { value: k }, t); if (String(k) === String(val)) e.selected = true; return e; })); }; fill(opts, v);
  s.addEventListener('change', () => onChange(s.value)); const el = h('div', { cls: 'pe-row', title }, h('label', { title: title || label }, label), s); el.set = (x) => { s.value = x; }; el.fill = fill; return el;
}
export function colorRow(label, v, onChange) { const c = h('input', { type: 'color', value: v, style: { width: '46px', height: '24px', padding: '0 2px' } }); c.addEventListener('input', () => onChange(c.value)); const el = h('div', { cls: 'pe-row' }, h('label', {}, label), c); el.set = (x) => { c.value = x; }; return el; }
// modal dialog → Promise(value of the clicked button | null on Esc)
export function modal(title, body, buttons = [['OK', true]], { wide = false } = {}) {
  css(); return new Promise((res) => {
    const bg = h('div', { cls: 'pe-modal-bg' }); const box = h('div', { cls: 'pe-modal', style: wide ? { width: 'min(720px,92vw)' } : {} }); const close = (v) => { bg.remove(); removeEventListener('keydown', onKey, true); res(v); };
    const onKey = (e) => { if (e.code === 'Escape') { e.stopPropagation(); e.preventDefault(); close(null); } }; addEventListener('keydown', onKey, true);
    const foot = h('div', { cls: 'mf' }, ...buttons.map(([label, val, cls]) => h('button', { cls: 'pe-tb' + (cls ? ' ' + cls : ''), onclick: () => close(typeof val === 'function' ? val() : val) }, label)));
    box.append(h('div', { cls: 'mh' }, title), h('div', { cls: 'mb' }, ...(Array.isArray(body) ? body : [body])), foot); bg.append(box); document.body.append(bg);
    for (const ev of ['keydown', 'keyup', 'wheel', 'pointerdown']) box.addEventListener(ev, (e) => e.stopPropagation()); box.closeWith = close; bg.box = box;
  });
}
export const fmtN = (n) => Number(n || 0).toLocaleString('en-US');
export const fmtB = (b) => (b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : b > 1024 ? (b / 1024).toFixed(0) + ' KB' : (b | 0) + ' B');
export { h, btn };
