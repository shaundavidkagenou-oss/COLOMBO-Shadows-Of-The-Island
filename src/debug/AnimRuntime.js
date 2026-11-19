// Animation overrides (made in the animation editor) applied on top of the game's procedural Animator.
// Every character's pose is computed by Animator.update (gait cycle, actions, fights, seats …). An override clip is keyed to
// one of those animation states and runs right after it:
//   mode 'add'     — keyed rotations (radians) / hip offset are ADDED to the procedural pose, scaled by weight
//   mode 'replace' — the bones are blended from the procedural pose TO the keyed pose by weight (1 = fully keyed)
// Locomotion clips (idle / walk / run) are phase-locked to the gait cycle (0..1 of a stride); others run on the action's time.
// The patch is only installed when this module is loaded (editor opened, or saved clips exist).
import * as THREE_ from 'three';
import { Animator, BONES } from '../actors/Character.js';
import { LIVE } from '../actors/Bodies.js';
import { storeGet, storeSet, setSavedFlag } from './boot.js';

export const ANIM = { clips: {}, targets: {}, enabled: true, seen: new Map(), force: null };
// 68th: clip sets for one group of characters (model tools: model-player / model-npc) — checked before the global clips:
//   'hero:dineth' | 'hero:shashika' | 'hero:david' · 'custom:<npc editor id>' · 'preset:<appearance preset>' · 'police' · 'role:<role>'
//   · 'npc:f' / 'npc:m' (every pedestrian of that sex) · 'npc' (every pedestrian) · 'heroes' (all three protagonists)
export function targetsOf(ch) {
  if (ch._animIds) return ch._animIds; const sp = ch.spec || {}; const ids = [];
  if (sp.mh) ids.push('hero:' + sp.mh); if (sp._custom) ids.push('custom:' + sp._custom); if (sp.preset) ids.push('preset:' + sp.preset); if (sp.police) ids.push('police'); if (sp.role) ids.push('role:' + sp.role);
  if (sp.hero) ids.push('heroes'); else { ids.push(sp.sex === 'f' ? 'npc:f' : 'npc:m'); ids.push('npc'); }
  return (ch._animIds = ids);
}
export function clipFor(ch, key) { const T = ANIM.targets; if (T) for (const id of targetsOf(ch)) { const set = T[id]; const c = set && set[key]; if (c && !c.off) return c; } return ANIM.clips[key] || null; }
export const LOCO = ['idle', 'walk', 'run'];
// every procedural animation state the game uses (live detection adds anything else it sees)
export const KNOWN = ['idle', 'walk', 'run', 'crouch', 'seated', 'seated:drive', 'seated:ride', 'seated:pass', 'seated:lap', 'fight', 'fight:jab', 'fight:cross', 'fight:hook', 'fight:upper', 'hit:snap', 'hit:hook', 'hit:upper', 'hit:body', 'hit:block',
  'interact', 'talk', 'stumble', 'argue', 'wave', 'point', 'glovethrow', 'photo', 'phone', 'text', 'handsup', 'umbrella', 'tackle', 'tackled', 'collapse', 'cuffKneel', 'cuffStand', 'kneel', 'kneelCuffed', 'prone', 'medKneel', 'medLift',
  'torch', 'signal', 'shrug', 'shove', 'look', 'hit', 'hips', 'down', 'cower',
  // 69th: every other action the Animator poses (Character.js action switch + BODY_POSES) — the list was missing these
  'alert', 'bat', 'beckon', 'bowl', 'browse', 'carry', 'clap', 'comms', 'cover', 'crossarms', 'cuffed', 'dance', 'dive', 'drive', 'flinch', 'glance', 'glasses', 'gloves',
  'guard', 'hold', 'laugh', 'listen', 'medCarry', 'nod', 'paper', 'pray', 'pullup', 'pump', 'punch', 'ride', 'rise', 'sigh', 'sit', 'sitGround', 'smoke', 'straps', 'stretch',
  'suitcase', 'swim', 'type', 'vault', 'watch'];
// 69th: how to put a bare Animator into one of those states without the game around it (model tools: preview + "download the
// original animation"): actions via set(), the fight moves / hit reactions via strike() / takeHit(), seats via a stand-in seat
const STAND_SEAT = { x: 0, y: 0.45, z: 0, floor: 0, roof: 1.5, driver: false };
export function driveState(a, key, t) {
  if (!a) return; const [k0, k1] = key.split(':'); if (a._drvK !== key) { a._drvK = key; a._drvT = undefined; if (a.fight) { a.fight.move = null; a.fight.react = null; } } // (a new state strikes / reacts straight away)
  if (key === 'idle' || key === 'walk' || key === 'run') { if (a.action) a.set(null); if (a.seated) a.standUp(); if (a.fight) a.fightOn(false, true); return; }
  if (k0 === 'seated') { if (a.action) a.set(null); const seat = k1 === 'drive' ? Object.assign({}, STAND_SEAT, { driver: true, wheel: { p: [0, 0.95, 0.42], r: 0.19, tilt: 0.45 } }) : k1 === 'ride' ? Object.assign({}, STAND_SEAT, { bars: [[0.32, 1.0, 0.55], [-0.32, 1.0, 0.55]] }) : STAND_SEAT; if (!a.seated || a._standSeat !== key) { a.sitIn(seat, 1, k1 === 'lap' ? 'lap' : null); a._standSeat = key; } return; }
  if (a.seated) { a.standUp(); a._standSeat = null; }
  if (k0 === 'fight') { if (a.action) a.set(null); a.fightOn(true); const F = a.fight; if (k1 && F && !F.move && !(t - a._drvT < 1.2)) { a._drvT = t; a.strike(k1); } return; }
  if (k0 === 'hit' && k1) { if (a.action) a.set(null); a.fightOn(true); const F = a.fight; if (F && !F.react && !(t - a._drvT < 1.4)) { a._drvT = t; a.takeHit(k1, 1, 1); } return; }
  if (a.fight && a.fight.on) a.fightOn(false, true);
  if (a.action !== key) a.set(key);
}

export function keyOf(a) {
  if (a.seated) { const S = a.seated; return 'seated:' + (a.seatMode || (S.ride || S.bars ? 'ride' : S.driver || S.wheel ? 'drive' : 'pass')); } // 69th: the kind of seat (the game never sets a seat mode 'drive' / 'ride' / 'pass' — those keys never matched before)
  const F = a.fight; if (F && F.w > 0.05) { if (F.react) return 'hit:' + F.react; if (F.move) return 'fight:' + F.move; return 'fight'; }
  if (a.action) return a.action;
  return a.speed < 0.3 ? 'idle' : a.runW > 0.5 ? 'run' : 'walk';
}
export function timeOf(a, key, clip) {
  if (LOCO.includes(key)) return (key === 'idle' ? (a.t % clip.length) / clip.length : a.cyc) * clip.length;
  const F = a.fight; const t = key.startsWith('fight:') && F ? F.mt || 0 : key.startsWith('hit:') && F ? F.rt || 0 : a.seated ? a.t : a.actionT || 0;
  return clip.loop ? t % clip.length : Math.min(t, clip.length);
}
const smooth = (u) => u * u * (3 - 2 * u);
// sample one track ([{t, x, y, z}] sorted by t) at time t (loops wrap between the last and first key)
export function sample(track, t, length, loop, out) {
  const n = track.length; if (!n) return null; if (n === 1) { out.x = track[0].x; out.y = track[0].y; out.z = track[0].z; return out; }
  let i = 0; while (i < n && track[i].t <= t) i++;
  let A, B, ta, tb; if (i === 0) { if (loop) { A = track[n - 1]; B = track[0]; ta = A.t - length; tb = B.t; } else { A = B = track[0]; ta = tb = 0; } }
  else if (i === n) { if (loop) { A = track[n - 1]; B = track[0]; ta = A.t; tb = B.t + length; } else { A = B = track[n - 1]; ta = tb = 0; } }
  else { A = track[i - 1]; B = track[i]; ta = A.t; tb = B.t; }
  const u = tb > ta ? smooth(Math.min(1, Math.max(0, (t - ta) / (tb - ta)))) : 0;
  out.x = A.x + (B.x - A.x) * u; out.y = A.y + (B.y - A.y) * u; out.z = A.z + (B.z - A.z) * u; return out;
}
const _v = { x: 0, y: 0, z: 0 };
const _qa = new THREE_.Quaternion(), _qb = new THREE_.Quaternion();
// imported clips (model tools: BVH / FBX / GLB retargeted by Retarget.importClip): sampled quaternions per bone at fps + hip offset
export function applyQuatClip(ch, clip, t) {
  const w = clip.weight ?? 1, b = ch.bones, n = clip.n; if (!n) return; let f = (t / Math.max(1e-6, clip.length)) * (n - 1); if (clip.loop) f = ((f % (n - 1)) + (n - 1)) % (n - 1); else f = Math.min(n - 1, Math.max(0, f));
  const i0 = Math.floor(f), i1 = Math.min(n - 1, i0 + 1), u = f - i0;
  for (const name in clip.q) { const bone = b[name]; const a = clip.q[name]; if (!bone || !a || a.length < n * 4) continue;
    _qa.fromArray(a, i0 * 4); _qb.fromArray(a, i1 * 4); _qa.slerp(_qb, u); if (clip.mode === 'add') bone.quaternion.multiply(_qa.slerp(_qb.identity(), 1 - w)); else bone.quaternion.slerp(_qa, w); }
  if (clip.hip && b.hips && clip.hip.length >= n * 3) { const H = clip.hip, k0 = i0 * 3, k1 = i1 * 3; const hx = H[k0] + (H[k1] - H[k0]) * u, hy = H[k0 + 1] + (H[k1 + 1] - H[k0 + 1]) * u, hz = H[k0 + 2] + (H[k1 + 2] - H[k0 + 2]) * u; const hp = b.hips.position, y0 = ch.hipY ?? hp.y;
    hp.x += (hx - hp.x) * w; hp.y += (y0 + hy - hp.y) * w; hp.z += (hz - hp.z) * w; }
}
export function applyClip(ch, clip, t) {
  if (clip.quat) return applyQuatClip(ch, clip, t);
  const w = clip.weight ?? 1, add = clip.mode !== 'replace', b = ch.bones;
  for (const name in clip.tracks) { const bone = b[name]; const tr = clip.tracks[name]; if (!tr || !tr.length) continue;
    if (name === 'hipPos') { const hp = b.hips; if (!hp || !sample(tr, t, clip.length, clip.loop, _v)) continue; if (add) { hp.position.x += _v.x * w; hp.position.y += _v.y * w; hp.position.z += _v.z * w; } else { hp.position.x += (_v.x - hp.position.x) * w; hp.position.y += (ch.hipY + _v.y - hp.position.y) * w; hp.position.z += (_v.z - hp.position.z) * w; } continue; }
    if (!bone || !sample(tr, t, clip.length, clip.loop, _v)) continue; const r = bone.rotation;
    if (add) { r.x += _v.x * w; r.y += _v.y * w; r.z += _v.z * w; } else { r.x += (_v.x - r.x) * w; r.y += (_v.y - r.y) * w; r.z += (_v.z - r.z) * w; } }
  if (clip.scale) for (const name in clip.scale) { const bone = b[name], s = clip.scale[name]; if (bone && s) bone.scale.set(s[0], s[1], s[2]); }
}

let installed = false;
export function install() {
  if (installed) return; installed = true; const orig = Animator.prototype.update;
  Animator.prototype.update = function (dt, speed, turnRate) {
    const pre = ANIM.enabled && this._edKey ? this._edClip : null; // time scale of the clip that was playing last frame
    orig.call(this, pre && pre.speed ? dt * pre.speed : dt, speed, turnRate);
    if (this.ch.rag) return;
    const key = ANIM.force && this.ch === ANIM.force.ch ? ANIM.force.key : keyOf(this); this._edKey = key;
    ANIM.seen.set(key, (ANIM.seen.get(key) || 0) + 1);
    if (this._edScaled) { for (const n of this._edScaled) { const bn = this.ch.bones[n]; if (bn) bn.scale.set(1, 1, 1); } this._edScaled = null; } // bone scales belong to the clip that set them
    const clip = ANIM.enabled ? clipFor(this.ch, key) || (key.startsWith('seated:') ? clipFor(this.ch, 'seated') : null) : null; /* (a clip for 'seated' covers every seat) */ this._edClip = clip; if (!clip || clip.off) return;
    if (clip.scale) this._edScaled = Object.keys(clip.scale);
    const t = ANIM.force && this.ch === ANIM.force.ch && ANIM.force.t != null ? ANIM.force.t : timeOf(this, key, clip);
    applyClip(this.ch, clip, t);
  };
}
export function newClip(key) { return { key, mode: 'add', weight: 1, speed: 1, length: LOCO.includes(key) && key !== 'idle' ? 1 : 2, loop: true, tracks: {}, scale: null }; }
// characters currently alive and what each is doing (for the editor's detection list)
export function liveStates() { const m = new Map(); for (const ch of LIVE) { if (!ch.anim) continue; const k = keyOf(ch.anim); m.set(k, (m.get(k) || 0) + 1); } return m; }
export const BONE_LIST = ['hipPos', ...BONES.filter((b) => !b.startsWith('skirt') && b !== 'cap')];

export async function saveAnims() {
  await storeSet('anims', JSON.parse(JSON.stringify(ANIM.clips))); setSavedFlag('anim', Object.keys(ANIM.clips).length > 0); const at = new Date().toISOString(); try { localStorage.setItem('colombo.editor.animAt', at); } catch { /* private */ }
  let baked = false; let err = null; if (import.meta.env && import.meta.env.DEV) try { const MP = await import('./ModelPack.js'); const m = await MP.loadPack(); m.anims = Object.assign(m.anims || {}, { clips: JSON.parse(JSON.stringify(ANIM.clips)), saved: at }); await MP.savePack(); baked = true; } catch (e) { err = (e && e.message) || String(e); console.warn('[model pack] not written', e); }
  return { baked, err };
}
export async function loadSavedAnims() { const c = await storeGet('anims'); if (c && typeof c === 'object') ANIM.clips = c; install(); return ANIM.clips; }
// 68th: the pack's copy (built into the game): its target sets always; its global clips when newer than this browser's
export function adoptPack(A) {
  if (!A) return; let localAt = null; try { localAt = localStorage.getItem('colombo.editor.animAt'); } catch { /* none */ }
  if (A.clips && Object.keys(A.clips).length && (!Object.keys(ANIM.clips).length || !localAt || (Date.parse(A.saved || 0) || 0) >= (Date.parse(localAt) || 0))) ANIM.clips = JSON.parse(JSON.stringify(A.clips));
  if (A.targets) ANIM.targets = JSON.parse(JSON.stringify(A.targets)); install();
}
