// Animation overrides (made in the animation editor) applied on top of the game's procedural Animator.
// Every character's pose is computed by Animator.update (gait cycle, actions, fights, seats …). An override clip is keyed to
// one of those animation states and runs right after it:
//   mode 'add'     — keyed rotations (radians) / hip offset are ADDED to the procedural pose, scaled by weight
//   mode 'replace' — the bones are blended from the procedural pose TO the keyed pose by weight (1 = fully keyed)
// Locomotion clips (idle / walk / run) are phase-locked to the gait cycle (0..1 of a stride); others run on the action's time.
// The patch is only installed when this module is loaded (editor opened, or saved clips exist).
import { Animator, BONES } from '../actors/Character.js';
import { LIVE } from '../actors/Bodies.js';
import { storeGet, storeSet, setSavedFlag } from './boot.js';

export const ANIM = { clips: {}, enabled: true, seen: new Map(), force: null };
export const LOCO = ['idle', 'walk', 'run'];
// every procedural animation state the game uses (live detection adds anything else it sees)
export const KNOWN = ['idle', 'walk', 'run', 'crouch', 'seated', 'seated:drive', 'seated:ride', 'seated:pass', 'fight', 'fight:jab', 'fight:cross', 'fight:hook', 'fight:upper', 'hit:head', 'hit:body', 'hit:block',
  'interact', 'talk', 'stumble', 'argue', 'wave', 'point', 'photo', 'phone', 'text', 'handsup', 'umbrella', 'tackle', 'tackled', 'collapse', 'cuffKneel', 'cuffStand', 'kneel', 'kneelCuffed', 'prone', 'medKneel', 'medLift',
  'torch', 'signal', 'shrug', 'shove', 'look', 'hit', 'hips', 'down', 'cower'];

export function keyOf(a) {
  if (a.seated) return a.seatMode ? 'seated:' + a.seatMode : 'seated';
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
export function applyClip(ch, clip, t) {
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
    const pre = ANIM.enabled && this._edKey ? ANIM.clips[this._edKey] : null; // time scale of the clip that was playing last frame
    orig.call(this, pre && pre.speed ? dt * pre.speed : dt, speed, turnRate);
    if (this.ch.rag) return;
    const key = ANIM.force && this.ch === ANIM.force.ch ? ANIM.force.key : keyOf(this); this._edKey = key;
    ANIM.seen.set(key, (ANIM.seen.get(key) || 0) + 1);
    if (this._edScaled) { for (const n of this._edScaled) { const bn = this.ch.bones[n]; if (bn) bn.scale.set(1, 1, 1); } this._edScaled = null; } // bone scales belong to the clip that set them
    const clip = ANIM.enabled ? ANIM.clips[key] : null; if (!clip || clip.off) return;
    if (clip.scale) this._edScaled = Object.keys(clip.scale);
    const t = ANIM.force && this.ch === ANIM.force.ch && ANIM.force.t != null ? ANIM.force.t : timeOf(this, key, clip);
    applyClip(this.ch, clip, t);
  };
}
export function newClip(key) { return { key, mode: 'add', weight: 1, speed: 1, length: LOCO.includes(key) && key !== 'idle' ? 1 : 2, loop: true, tracks: {}, scale: null }; }
// characters currently alive and what each is doing (for the editor's detection list)
export function liveStates() { const m = new Map(); for (const ch of LIVE) { if (!ch.anim) continue; const k = keyOf(ch.anim); m.set(k, (m.get(k) || 0) + 1); } return m; }
export const BONE_LIST = ['hipPos', ...BONES.filter((b) => !b.startsWith('skirt'))];

export async function saveAnims() { await storeSet('anims', JSON.parse(JSON.stringify(ANIM.clips))); setSavedFlag('anim', Object.keys(ANIM.clips).length > 0); }
export async function loadSavedAnims() { const c = await storeGet('anims'); if (c && typeof c === 'object') ANIM.clips = c; install(); return ANIM.clips; }
