// 75th request — the computers the hospital staff work at show their actual work. Each staffed PC (registration, ED
// triage, nurses' station, consultation) gets a live screen laid over its monitor while its user sits at it:
//   a hospital management system window (title bar, menu, a patient form / queue list / medication chart / clinic
//   notes depending on the desk) that fills in character by character while the person types (one key sound per
//   key, 3 variations), the caret blinking at the field being typed; while the person works the mouse the pointer
//   moves between fields and buttons, a click (3 variations) highlights the button and the next record / field opens.
//   The right hand follows the same pointer path (Character 'mouse' act, anim.mouseD).
// Unstaffed PCs keep the static screen of the kit. Cost: one 384 × 224 canvas per staffed PC (4), redrawn only when
// something changed and the room is drawn (≤ ~12×/s while typing); one quad per staffed PC in its room group.
import * as THREE from 'three';
import { FURNITURE, FLOOR_Y, roomAt, toWorld } from './HospitalPlan.js';
import { itemFrame } from './HospitalKit.js';
import { HospitalSound } from '../audio/HospitalAudio.js';

export const PC_SCR = { y: 1.08, z: 0.0185, w: 0.48, h: 0.28 }; // the kit's screen rectangle (K.pc), item-local
const W = 384, H = 224;
const R = Math.random;
// what each desk works on (fictional records; ages / wards / complaints only — no real people)
const DESKS = {
  rec: { title: 'OPD Registration', fields: ['Name', 'NIC No.', 'Age', 'Phone', 'Complaint', 'Clinic'],
    data: [['K. A. Silva', '198734501234', '38', '077 214 5530', 'Fever 3 days, body aches', 'OPD 2'], ['R. Jayasinghe', '197612300987', '49', '071 556 2091', 'Chest pain on exertion', 'Medical'],
      ['N. Fernando', '200145603321', '24', 'none', 'Cut on left hand', 'Surgical'], ['M. Rizwan', '199290107654', '33', '075 880 1402', 'Cough, wheezing', 'OPD 1']] },
  ed: { title: 'Emergency — Triage', fields: ['Arrival', 'Mode', 'Triage', 'BP', 'Pulse', 'Notes'],
    data: [['10:42', 'Walk-in', 'P3 Yellow', '132/84', '96', 'RTA, abrasions R arm'], ['10:51', 'Ambulance 1990', 'P2 Orange', '98/60', '118', 'Fall from height'],
      ['11:05', 'Walk-in', 'P4 Green', '120/78', '82', 'Sprained ankle']] },
  station: { title: 'Ward 1 — Medication chart', fields: ['Bed', 'Drug', 'Dose', 'Route', 'Time', 'Given by'],
    data: [['Bed 1', 'Paracetamol', '1 g', 'Oral', '12:00', 'SN Perera'], ['Bed 3', 'Ceftriaxone', '1 g', 'IV', '12:00', 'SN Perera'], ['Bed 4', 'Omeprazole', '20 mg', 'Oral', '13:00', 'SN Perera']] },
  doctor: { title: 'Clinic notes', fields: ['Patient', 'History', 'Exam', 'Diagnosis', 'Plan', 'Review'],
    data: [['Bed 1 · 52 M', 'Fever, rigors 2 days', 'T 38.4, chest clear', 'Viral fever', 'FBC, CRP, fluids', '2 days'], ['OPD · 31 F', 'Headache 1 week', 'BP 118/76, NAD', 'Tension headache', 'Analgesia, rest', '2 weeks']] },
};

export class HospitalScreens {
  constructor(hosp) { this.h = hosp; this.list = []; this.stats = { live: 0, draws: 0, keys: 0, clicks: 0 }; }
  // lazily: the PC nearest each staffed seat
  init() { if (this.ready) return; this.ready = true; if (typeof document === 'undefined') return; const S = this.h.seats || {};
    for (const key of Object.keys(DESKS)) { const st = S[key]; if (!st) continue; let best = null, bd = 1.6; for (const f of FURNITURE) { if (f[0] !== 'pc' || f[1] !== st.floor) continue; const [x, z] = toWorld(f[2], f[3]); const d = Math.hypot(x - st.x, z - st.z); if (d < bd) { bd = d; best = f; } }
      if (!best) continue; const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.generateMipmaps = false; tex.minFilter = THREE.LinearFilter; tex.anisotropy = 4;
      const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }); mat.name = 'Hospital · PC screen (' + key + ')';
      const [, fl, u, v, yaw = 0] = best; const F = itemFrame(u, v, yaw, FLOOR_Y[fl]); const [wx, wz] = F.P(0, PC_SCR.z); const me = new THREE.Mesh(new THREE.PlaneGeometry(PC_SCR.w, PC_SCR.h), mat);
      me.position.set(wx, F.y + PC_SCR.y, wz); me.rotation.y = Math.PI - yaw; me.matrixAutoUpdate = false; me.updateMatrix(); me.visible = false; me.name = 'hosp-pc-screen-' + key;
      const room = roomAt(u, v, fl); const RM = room && this.h.rooms.get(room.id); if (RM) RM.group.add(me);
      const D = DESKS[key]; this.list.push({ key, seat: st, me, room: RM, cv, a: cv.getContext('2d'), tex, D, x: wx, z: wz, rec: (R() * D.data.length) | 0, field: 0, typed: 0, chars: 0, keyT: 0, ptr: [0.7, 0.8], to: [0.5, 0.5], click: 0, hot: -1, blink: 0, dirty: true, saved: 0 }); } }
  update(dt) { this.init(); this.stats.live = 0;
    for (const s of this.list) { const p = s.seat.occ; const who = p && p !== 'player' && p.phase === 'seated' ? p : null; const on = !!who; if (s.me.visible !== on) { s.me.visible = on; s.dirty = true; } if (!on) continue; this.stats.live++;
      const act = who.ch.anim.action; const D = s.D; const rec = D.data[s.rec]; const drawn = !s.room || s.room.group.visible;
      if (act === 'type') { // characters into the current field at a typist's pace (bursts, small pauses)
        if ((s.keyT -= dt) <= 0) { const txt = rec[s.field]; s.keyT = 0.09 + R() * 0.12 + (R() < 0.08 ? 0.5 : 0); if (s.typed < txt.length) { s.typed++; s.dirty = true; if (drawn) { HospitalSound.pcKey(s.x, s.z); this.stats.keys++; } }
          else { s.field++; s.typed = 0; s.keyT = 0.5; if (drawn && R() < 0.6) HospitalSound.pcKey(s.x, s.z); if (s.field >= D.fields.length) { s.field = 0; s.saved = 1.4; s.rec = (s.rec + 1) % D.data.length; } s.dirty = true; } } }
      if (act === 'mouse') { // the pointer glides to a target (a field or a button), clicks, picks the next target
        const k = Math.min(1, dt * 3.2); const ox = s.ptr[0], oy = s.ptr[1]; s.ptr[0] += (s.to[0] - s.ptr[0]) * k; s.ptr[1] += (s.to[1] - s.ptr[1]) * k; if (Math.abs(s.ptr[0] - ox) + Math.abs(s.ptr[1] - oy) > 0.001) s.dirty = true;
        if (Math.hypot(s.to[0] - s.ptr[0], s.to[1] - s.ptr[1]) < 0.01 && (s.click -= dt) <= -0.6) { s.click = 0.18; s.dirty = true; if (drawn) { HospitalSound.pcClick(s.x, s.z); this.stats.clicks++; }
          if (s.hot >= 100) { s.saved = 1.2; s.rec = (s.rec + 1) % D.data.length; s.field = 0; s.typed = 0; } else if (s.hot >= 0) { s.field = s.hot; s.typed = 0; }
          const r = R(); if (r < 0.3) { s.hot = 100; s.to = [0.9, 0.91]; } else { s.hot = (R() * D.fields.length) | 0; s.to = [0.42 + R() * 0.3, 0.27 + s.hot * 0.1]; } } }
      who.ch.anim.mouseD = act === 'mouse' ? [(s.ptr[0] - 0.6) * 2, (s.ptr[1] - 0.55) * 2] : null;
      if (s.click > 0) s.click -= dt; if (s.saved > 0) { s.saved -= dt; if (s.saved <= 0) s.dirty = true; }
      s.blink += dt; if (s.blink > 0.5) { s.blink = 0; s.caret = !s.caret; s.dirty = true; }
      if (s.dirty && drawn) { this.draw(s); s.dirty = false; } } }
  draw(s) { const a = s.a, D = s.D, rec = D.data[s.rec]; this.stats.draws++;
    const f = (px, w = 600) => `${w} ${px}px "Segoe UI", Arial, sans-serif`;
    a.fillStyle = '#e9edf1'; a.fillRect(0, 0, W, H); // window body
    a.fillStyle = '#1d5fa3'; a.fillRect(0, 0, W, 20); a.fillStyle = '#fff'; a.font = f(11, 700); a.textBaseline = 'middle'; a.fillText('HMS · National Hospital — ' + D.title, 8, 10);
    for (const [i, c] of [['#e5534b', 0], ['#e0a32e', 1], ['#3fae5a', 2]]) { a.fillStyle = i; a.beginPath(); a.arc(W - 12 - c * 14, 10, 4, 0, 7); a.fill(); }
    a.fillStyle = '#d4dbe2'; a.fillRect(0, 20, W, 16); a.fillStyle = '#2b3a48'; a.font = f(10); ['File', 'Patient', 'Records', 'Reports', 'Help'].forEach((m, i) => a.fillText(m, 8 + i * 52, 28));
    a.fillStyle = '#c9d3dc'; a.fillRect(0, 36, 88, H - 36); a.fillStyle = '#2b3a48'; a.font = f(10); ['Queue', 'New record', 'Search', 'History', 'Lab results', 'Discharge'].forEach((m, i) => { if (i === 1) { a.fillStyle = '#1d5fa3'; a.fillRect(0, 40 + i * 20, 88, 18); a.fillStyle = '#fff'; } else a.fillStyle = '#2b3a48'; a.fillText(m, 8, 49 + i * 20); });
    // the form
    a.font = f(11, 600); D.fields.forEach((lab, i) => { const y = 0.27 * H + i * 0.1 * H; a.fillStyle = '#34495e'; a.textAlign = 'right'; a.fillText(lab, 150, y); a.textAlign = 'left';
      const cur = i === s.field; a.fillStyle = cur ? '#ffffff' : '#f6f8fa'; a.fillRect(158, y - 9, 196, 18); a.strokeStyle = cur ? '#1d5fa3' : '#aab6c2'; a.lineWidth = cur ? 2 : 1; a.strokeRect(158.5, y - 8.5, 195, 17);
      const txt = i < s.field ? rec[i] : cur ? rec[i].slice(0, s.typed) : ''; a.fillStyle = '#111'; a.font = f(11, 500); a.fillText(txt, 163, y + 1);
      if (cur && s.caret) { const w = a.measureText(txt).width; a.fillStyle = '#111'; a.fillRect(164 + w, y - 6, 1.2, 13); } a.font = f(11, 600); });
    // buttons
    const btn = (x, y, w, lab, hot) => { a.fillStyle = hot ? '#174d86' : '#1d5fa3'; a.fillRect(x, y, w, 18); a.fillStyle = '#fff'; a.textAlign = 'center'; a.font = f(10, 700); a.fillText(lab, x + w / 2, y + 9); a.textAlign = 'left'; };
    btn(W - 120, H - 30, 52, 'Clear', false); btn(W - 62, H - 30, 52, 'Save', s.hot >= 100 && s.click > 0);
    a.fillStyle = '#5b6b7a'; a.font = f(9); a.fillText(`Record ${s.rec + 1} of ${D.data.length}`, 96, H - 21);
    if (s.saved > 0) { a.fillStyle = 'rgba(46,140,80,0.95)'; a.fillRect(96, 42, 160, 18); a.fillStyle = '#fff'; a.font = f(10, 700); a.fillText('✓ Saved to patient record', 104, 51); }
    // the pointer (arrow), only when the mouse is in use or recently used
    { const x = s.ptr[0] * W, y = s.ptr[1] * H; a.fillStyle = '#fff'; a.strokeStyle = '#000'; a.lineWidth = 1; a.beginPath(); a.moveTo(x, y); a.lineTo(x, y + 13); a.lineTo(x + 3.5, y + 10); a.lineTo(x + 6, y + 15); a.lineTo(x + 8, y + 14); a.lineTo(x + 5.5, y + 9); a.lineTo(x + 10, y + 9); a.closePath(); a.fill(); a.stroke(); }
    s.tex.needsUpdate = true; }
}
