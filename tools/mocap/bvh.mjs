// Minimal BVH reader + forward kinematics (node, build time only — tools/mocap/build.mjs).
// Joints keep their OFFSET, CHANNELS and parent; frames are raw channel values. fk(frame) returns per-joint world quaternions
// and positions (source units), with the channel order honoured (CMU / cgspeed files: root Xpos Ypos Zpos Zrot Yrot Xrot,
// joints Zrot Yrot Xrot → local rotation = Rz · Ry · Rx).
import * as THREE from 'three';

export function parseBVH(text) {
  const tok = text.replace(/\r/g, '').split(/\s+/).filter(Boolean); let i = 0; const joints = []; const stack = [];
  const next = () => tok[i++];
  while (i < tok.length) {
    const t = next();
    if (t === 'ROOT' || t === 'JOINT') { const name = next(); const j = { name, parent: stack.length ? stack[stack.length - 1] : -1, offset: [0, 0, 0], channels: [], end: null, idx: joints.length }; joints.push(j); stack.push(j.idx); }
    else if (t === 'End') { next(); /* Site */ next(); /* { */ next(); /* OFFSET */ const o = [+next(), +next(), +next()]; joints[stack[stack.length - 1]].end = o; next(); /* } */ }
    else if (t === 'OFFSET') { const j = joints[stack[stack.length - 1]]; j.offset = [+next(), +next(), +next()]; }
    else if (t === 'CHANNELS') { const j = joints[stack[stack.length - 1]]; const n = +next(); for (let k = 0; k < n; k++) j.channels.push(next()); }
    else if (t === '}') stack.pop();
    else if (t === 'MOTION') break;
  }
  next(); /* Frames: */ const nF = +next(); next(); next(); /* Frame Time: */ const dt = +next();
  let nC = 0; for (const j of joints) { j.c0 = nC; nC += j.channels.length; }
  const data = new Float32Array(nF * nC); for (let f = 0; f < nF * nC; f++) data[f] = +tok[i++];
  return { joints, frames: nF, dt, nC, data, byName: Object.fromEntries(joints.map((j) => [j.name, j])) };
}

const _e = new THREE.Euler(), _q = new THREE.Quaternion(), AX = { X: new THREE.Vector3(1, 0, 0), Y: new THREE.Vector3(0, 1, 0), Z: new THREE.Vector3(0, 0, 1) };
export function fk(B, f) {
  const n = B.joints.length; const Q = new Array(n), P = new Array(n); const base = f * B.nC;
  for (const j of B.joints) {
    const lq = new THREE.Quaternion(); const lp = new THREE.Vector3(...j.offset);
    j.channels.forEach((c, k) => { const v = B.data[base + j.c0 + k]; if (c.endsWith('position')) { lp.setComponent('XYZ'.indexOf(c[0]), v + j.offset['XYZ'.indexOf(c[0])]); } else { lq.multiply(_q.setFromAxisAngle(AX[c[0]], v * Math.PI / 180)); } });
    if (j.parent < 0) { Q[j.idx] = lq; P[j.idx] = lp; }
    else { Q[j.idx] = Q[j.parent].clone().multiply(lq); P[j.idx] = lp.applyQuaternion(Q[j.parent]).add(P[j.parent]); }
  }
  return { Q, P };
}
