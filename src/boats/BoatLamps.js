// Boat lamps at night: every navigation / deck / beacon lamp of every boat near the camera is one point of ONE draw call
// (additive, depth-tested, so a cabin top hides a lamp behind it). Each point knows its lamp's arc of visibility, exactly
// as the collision regulations (COLREGs, Rule 21) prescribe — the screens on a real lantern do the same:
//   sidelights   red to port / green to starboard, from right ahead to 22.5° abaft the beam (112.5° each)
//   masthead     white, 225° forward (112.5° either side of ahead)        stern   white, 135° aft
//   all-round / anchor   white, 360°        tricolour (sailing, at the masthead): the three sectors in one lantern
// so a boat seen bow-on shows red AND green, from the port beam only red, from astern only the white stern light — which
// is how a mariner reads another vessel's heading at night. Lights cut off over ~2° at the sector edges like real screens.
// The far end: a lamp never shrinks below ~2 px (nav lights are visible for miles as pinpoints), fading gently with range.
// Real light (lights the hull, deck and the people on it) comes from a FIXED pool made at load: one warm deck light and one
// beacon light (blue/red) — registered as night lights, so by day they leave the shaders (LightSets), the count never changes.
import * as THREE from 'three';
import { nightLight } from '../gfx/LightSets.js';

const MAXP = 1400;
const D2R = Math.PI / 180;
// kind → [colour, intensity, size (m), centre angle (rad, from ahead toward port), half arc (rad)]
const KIND = {
  port: [[1.0, 0.1, 0.05], 5.5, 0.55, 56.25 * D2R, 56.25 * D2R], stbd: [[0.1, 1.0, 0.35], 5.0, 0.55, -56.25 * D2R, 56.25 * D2R],
  mast: [[1.0, 0.93, 0.8], 5.5, 0.6, 0, 112.5 * D2R], stern: [[1.0, 0.93, 0.8], 4.8, 0.5, Math.PI, 67.5 * D2R],
  allround: [[1.0, 0.92, 0.78], 5.0, 0.55, 0, 4], anchor: [[1.0, 0.92, 0.78], 4.6, 0.5, 0, 4],
  deck: [[1.0, 0.82, 0.6], 1.6, 0.42, 0, 4], courtesy: [[1.0, 0.8, 0.55], 1.0, 0.25, 0, 4],
  uwl: [[0.25, 0.75, 1.0], 1.3, 3.2, 0, 4], beaconB: [[0.12, 0.3, 1.0], 9, 0.7, 0, 4], beaconR: [[1.0, 0.07, 0.05], 9, 0.7, 0, 4],
};
const TRI = [['port', 'tp'], ['stbd', 'ts'], ['stern', 'tw']]; // the tricolour = three sectors of one lantern
export function lampKinds() { return Object.keys(KIND); }

export class BoatLamps {
  constructor(scene) {
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(MAXP * 3); this.col = new Float32Array(MAXP * 3); this.arc = new Float32Array(MAXP * 4); this.size = new Float32Array(MAXP);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage)); g.setAttribute('aCol', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aArc', new THREE.BufferAttribute(this.arc, 4).setUsage(THREE.DynamicDrawUsage)); g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0); g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    this.U = { uScale: { value: 500 }, uMinPx: { value: 2.2 }, uMaxPx: { value: 90 } };
    const m = new THREE.ShaderMaterial({ uniforms: this.U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */`
        attribute vec3 aCol; attribute vec4 aArc; attribute float aSize; uniform float uScale, uMinPx, uMaxPx; varying vec3 vCol;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
          float vis = 1.0;
          if (aArc.w < 3.2) { vec2 d = cameraPosition.xz - position.xz; vec2 f = aArc.xy; vec2 p = vec2(f.y, -f.x);   // ahead / to port (boat frame)
            float th = atan(dot(d, p), dot(d, f)); float df = abs(mod(th - aArc.z + 3.14159265, 6.2831853) - 3.14159265);
            vis = 1.0 - smoothstep(aArc.w - 0.012, aArc.w + 0.035, df); }                                                    // ~2° screen cut-off
          float px = aSize * uScale / max(0.05, -mv.z); float ps = clamp(px, uMinPx, uMaxPx);
          float far = clamp(px / uMinPx, 0.0, 1.0); vCol = aCol * vis * mix(0.35, 1.0, sqrt(far));
          gl_PointSize = vis > 0.002 ? ps : 0.0; if (vis <= 0.002) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
        }`,
      fragmentShader: /* glsl */`
        varying vec3 vCol;
        void main() { vec2 c = gl_PointCoord - 0.5; float r2 = dot(c, c) * 4.0; float a = exp(-r2 * 9.0) + 0.22 * exp(-r2 * 2.2); if (a < 0.01) discard; gl_FragColor = vec4(vCol * a, 1.0); }
      ` });
    m.name = 'boatLamps'; this.mesh = new THREE.Points(g, m); this.mesh.name = 'boatLamps'; this.mesh.frustumCulled = false; this.mesh.renderOrder = 12; this.mesh.matrixAutoUpdate = false; scene.add(this.mesh);
    this.n = 0; this.geo = g;
    // the real light pool (fixed count, made now)
    this.deckL = new THREE.PointLight(0xffd9a8, 0, 13, 2); this.deckL.name = 'boatDeckLight'; this.deckL.position.set(0, -600, 0); scene.add(nightLight(this.deckL, 2));
    this.beaconL = new THREE.PointLight(0x3355ff, 0, 22, 2); this.beaconL.name = 'boatBeaconLight'; this.beaconL.position.set(0, -600, 0); scene.add(nightLight(this.beaconL, 1));
    this._v = new THREE.Vector3();
  }
  begin(camera, H) { this.n = 0; this.U.uScale.value = H / (2 * Math.tan((camera.fov * D2R) / 2)); }
  // add one boat's lamps. state: { nav: 'motor'|'sail'|null, anchor, deck, uwl, beacon: {b, r} 0..1 } ; night 0..1
  addBoat(b, state, night) {
    if (night <= 0.02) return; const M = b.model, mw = b.root.matrixWorld; const fx = Math.sin(b.yaw), fz = Math.cos(b.yaw);
    for (const l of M.lights) {
      let on = 0; const k = l.kind;
      if (k === 'port' || k === 'stbd' || k === 'stern' || k === 'mast' || k === 'allround') on = state.nav ? 1 : 0; // underway (motor or sail)
      else if (k === 'tri') { if (state.nav === 'sail') { for (const [kk] of TRI) this.push(l.p, kk, mw, fx, fz, night, 0.9); } continue; }
      else if (k === 'anchor') on = state.anchor ? 1 : 0; else if (k === 'deck' || k === 'courtesy') on = state.deck ? 1 : 0; else if (k === 'uwl') on = state.uwl ? 1 : 0;
      else if (k === 'beaconB') on = state.beacon ? state.beacon.b(l.idx || 0) : 0; else if (k === 'beaconR') on = state.beacon ? state.beacon.r(l.idx || 0) : 0;
      if (state.nav === 'sail' && M.sails.length && (k === 'port' || k === 'stbd' || k === 'stern')) on = 0; // under sail: the masthead tricolour replaces them
      if (state.nav === 'sail' && M.sails.length && k === 'mast') on = 0; // and no steaming light
      if (on > 0.01) this.push(l.p, k, mw, fx, fz, night, on);
    }
  }
  push(p, k, mw, fx, fz, night, on) {
    if (this.n >= MAXP) return; const K = KIND[k]; if (!K) return; const i = this.n++; const v = this._v.set(p[0], p[1], p[2]).applyMatrix4(mw);
    this.pos[i * 3] = v.x; this.pos[i * 3 + 1] = v.y; this.pos[i * 3 + 2] = v.z; const I = K[1] * night * on;
    this.col[i * 3] = K[0][0] * I; this.col[i * 3 + 1] = K[0][1] * I; this.col[i * 3 + 2] = K[0][2] * I;
    this.arc[i * 4] = fx; this.arc[i * 4 + 1] = fz; this.arc[i * 4 + 2] = K[3]; this.arc[i * 4 + 3] = K[4]; this.size[i] = K[2];
  }
  end() {
    const g = this.geo; g.setDrawRange(0, this.n); if (!this.n) return;
    for (const a of ['position', 'aCol', 'aArc', 'aSize']) { const at = g.attributes[a]; at.clearUpdateRanges(); at.addUpdateRange(0, this.n * at.itemSize); at.needsUpdate = true; }
  }
  // the pool: the deck light over the nearest boat with deck lights on, the beacon light on the nearest police boat
  pool(deck, beacon, night) {
    const D = this.deckL; if (deck && night > 0.05) { D.position.copy(deck.p); D.intensity = 7 * night; D.color.setRGB(1, 0.85, 0.66); } else { D.intensity = 0; D.position.set(0, -600, 0); }
    const B = this.beaconL; if (beacon && night > 0.05) { B.position.copy(beacon.p); B.intensity = beacon.k * 26 * night; B.color.copy(beacon.col); } else { B.intensity = 0; B.position.set(0, -600, 0); }
  }
}
