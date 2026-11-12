// Time of day, sky, clouds, sun/moon lighting, fog, environment reflections and weather.
import * as THREE from 'three';
import { leafLight } from '../world/Wind.js';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { clamp, lerp, smoothstep } from '../core/math.js';
import { updateMaterials } from './Materials.js';
import { waterUniforms } from '../world/Water.js';
import { RNG } from '../core/rng.js';

// ---------------------------------------------------------------------------------------------------------------- sun shadow
// One 2048² (preset) sun shadow map, fitted every frame to what the player can actually see up close instead of a fixed
// 160 × 160 m box: ≈ 70 m across around the player, pushed ahead of the camera, fitted in light space (fitSunShadow).
// The edge of the box fades the shadow out over its last few metres (directional lights only) so the boundary never shows
// as a line; beyond it the city is unshadowed by the sun as before at 80 m.
export const SUN_SHADOW = { range: 34, ahead: 0.3, wallH: 22, dist: 300, pcf: { 1024: 1.0, 2048: 1.5, 4096: 2.2 }, snap: true }; // snap: false only for the stability test
{ const C = THREE.ShaderChunk; const a = 'directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;';
  if (C.lights_fragment_begin.includes(a)) C.lights_fragment_begin = C.lights_fragment_begin.replace(a, '{ vec2 sunEdge = abs( vDirectionalShadowCoord[ i ].xy / vDirectionalShadowCoord[ i ].w * 2.0 - 1.0 ); ' +
    a.replace('? getShadow(', '? mix( getShadow(').replace('vDirectionalShadowCoord[ i ] ) : 1.0;', 'vDirectionalShadowCoord[ i ] ), 1.0, smoothstep( 0.86, 0.995, max( sunEdge.x, sunEdge.y ) ) ) : 1.0; }')); }
// ----------------------------------------------------------------------------------------------------------------- sun disc
// The Preetham disc was a 0.53°-radius circle of ~60 000 (HDR), clamped by the post sanitizer to a flat white dot whatever the
// time of day. Now (uDiscMode 1, the main view): a 0.39° disc with a soft anti-aliased limb and limb darkening, tinted by the
// atmosphere's own transmittance (white-gold high up, deep orange near the horizon), bright enough to drive the flare and
// shafts but dimming as it sinks, plus a faint forward-scattering corona that blends it into the sky. The environment-map
// capture keeps the original disc (uDiscMode 0) so reflections are unchanged.
export const SUN_DISC = { rad: 0.0075, hdr: 30 };
export const SKY_KNEE = { k: 0.55, w: 0.9 }; // sky in-scatter luminance (HDR, after the sky gain) where the roll-off starts, and its asymptotic headroom
// sun light warmth: the light turns gold well before the last half hour (17:00 ≈ 18° sun is the golden hour; the old warmth
// only started below ~13°), so buildings take the warm evening / morning light; 0 = the previous curve
export const SUN_WARMTH = 0.8;
function sunDiscPatch(fs) {
  const a = 'vec3 sundiscColor = ( 760.0 * sundisc ) * min( vSunE * Fex, 80.0 );';
  if (!fs.includes(a)) { console.warn('Sky: sun disc patch not applied'); return fs; }
  return fs.replace(a, a + `
      if ( uDiscMode > 0.5 ) {
        float rr = sqrt( max( 2.0 * ( 1.0 - cosTheta ), 0.0 ) ) / uSunRad; float fw = max( fwidth( rr ), 1e-3 );
        float disc = 1.0 - smoothstep( 1.0 - fw, 1.0 + fw, rr ); float mu = sqrt( max( 0.0, 1.0 - min( rr * rr, 1.0 ) ) );
        vec3 tint = Fex / max( max( Fex.r, Fex.g ), max( Fex.b, 1e-5 ) ); float up = smoothstep( 0.0, 0.25, vSunDirection.y );
        float k = mix( 5.0, uSunDisc, up ) * smoothstep( -0.03, 0.01, vSunDirection.y ) * showSunDisc;
        float corona = exp( -max( rr - 1.0, 0.0 ) * 1.4 ) * ( 1.0 - disc ) * 0.05;
        sundiscColor = tint * k * ( disc * ( 1.0 - 0.6 * ( 1.0 - mu ) ) + corona );
        // sky highlight knee: Preetham's Mie peak is 8–12 (HDR) for degrees around the sun and the open sky ~1.5–2, which
        // ACES turned into a flat white patch (the disc vanished into it) over a pale, washed-out blue. Above SKY_KNEE the sky's
        // in-scattering rolls off smoothly with its hue kept: a deeper blue, a warm circumsolar glow, a disc that reads as one.
        { vec3 sk = Lin * 0.04 * uSkyGain; float L = dot( sk, vec3( 0.2126, 0.7152, 0.0722 ) ); if ( L > ${SKY_KNEE.k.toFixed(3)} ) Lin *= ( ${SKY_KNEE.k.toFixed(3)} + ( L - ${SKY_KNEE.k.toFixed(3)} ) / ( 1.0 + ( L - ${SKY_KNEE.k.toFixed(3)} ) / ${SKY_KNEE.w.toFixed(3)} ) ) / L; }
      }`);
}
const _sf = new THREE.Vector3(), _sc = new THREE.Vector3(), _sx = new THREE.Vector3(), _sy = new THREE.Vector3(), _sl = new THREE.Vector3(), _slq = new THREE.Vector3(), _UP = new THREE.Vector3(0, 1, 0);
const cloudVert = `varying vec3 vDir; void main(){ vDir = normalize((modelMatrix * vec4(position,1.0)).xyz - cameraPosition); vec4 p = projectionMatrix * viewMatrix * modelMatrix * vec4(position,1.0); gl_Position = p.xyww;
#ifdef USE_REVERSED_DEPTH_BUFFER
 gl_Position.z = 0.0;
#endif
 }`; // on the far plane (reversed-Z: far = 0)
const cloudFrag = `
  uniform float uTime, uCover, uDark, uNight; uniform vec3 uSunDir, uSunCol, uSkyCol, uGlow, uMoonDir;
  varying vec3 vDir;
  float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
  float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
  float fbm(vec2 p){ float s=0.0, a=0.5; for(int i=0;i<6;i++){ s+=a*n(p); p=p*2.03+vec2(1.7,9.2); a*=0.5; } return s; }
  void main(){
    if (vDir.y < 0.0) discard;
    vec2 p = vDir.xz / (vDir.y + 0.12) * 1.6 + vec2(uTime * 0.006, uTime * 0.003);
    float base = fbm(p);
    float d = smoothstep(1.0 - uCover - 0.05, 1.0 - uCover + 0.35, base);
    float detail = fbm(p * 3.0 + 4.0);
    d *= 0.7 + 0.3 * detail;
    float horizon = smoothstep(0.0, 0.12, vDir.y);
    float sunAmt = pow(max(dot(normalize(vDir), uSunDir), 0.0), 6.0);
    vec3 lit = mix(vec3(1.0), uSunCol, 0.55) * (0.65 + 0.35 * (1.0 - detail));
    vec3 shade = mix(uSkyCol * 0.7, vec3(0.32, 0.34, 0.38), uDark);
    vec3 col = mix(lit, shade, clamp(base * 1.1 * uDark + (1.0 - detail) * 0.3, 0.0, 1.0));
    col += uSunCol * sunAmt * 0.8 * (1.0 - uDark);
    // night: moonlit tops (cool grey-blue) and undersides lit orange by the city's lights (strongest low over the horizon)
    float moonAmt = pow(max(dot(normalize(vDir), uMoonDir), 0.0), 4.0);
    vec3 ncol = vec3(0.05, 0.058, 0.08) * (0.55 + 0.45 * detail) * (1.0 - 0.45 * uDark) + uGlow * (0.9 + 1.6 * (1.0 - smoothstep(0.0, 0.5, vDir.y))) * (0.6 + 0.4 * base) + vec3(0.09, 0.1, 0.13) * moonAmt * (1.0 - detail) * (1.0 - uDark);
    col = mix(col, ncol, uNight);
    gl_FragColor = vec4(col, d * horizon * mix(0.95, 1.0, uDark));
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

export const WEATHER = {
  clear:    { cloud: 0.18, dark: 0.0, rain: 0, fog: 1.0, wind: 0.3 },
  cloudy:   { cloud: 0.45, dark: 0.2, rain: 0, fog: 1.0, wind: 0.5 },
  overcast: { cloud: 0.8, dark: 0.55, rain: 0, fog: 0.85, wind: 0.7 },
  rain:     { cloud: 0.92, dark: 0.75, rain: 0.65, fog: 0.6, wind: 1.0 },
  storm:    { cloud: 1.0, dark: 0.95, rain: 1.0, fog: 0.45, wind: 1.6 },
};

const _warmSky = new THREE.Color(0.98, 0.9, 0.78);
export class Atmosphere {
  constructor(scene, renderer) {
    this.scene = scene; this.renderer = renderer;
    this.hour = 16.5; this.day = 1;
    this.weather = 'clear'; this.target = 'clear'; this.w = { ...WEATHER.clear }; this.wet = 0; this.lightning = 0; this.forced = null;
    this.weatherTimer = 240; this.drawDist = 1400; this.rng = new RNG(99);
    // sky
    this.sky = new Sky(); this.sky.scale.setScalar(18000); scene.add(this.sky);
    { const m = this.sky.material; m.uniforms.uSkyGain = { value: 1 }; m.vertexShader = m.vertexShader.replace('gl_Position.z = gl_Position.w; // set z to camera.far', '#ifdef USE_REVERSED_DEPTH_BUFFER\n gl_Position.z = 0.0;\n#else\n gl_Position.z = gl_Position.w;\n#endif'); m.uniforms.uNightK = { value: 0 }; m.uniforms.uNZen = { value: new THREE.Color(0.0035, 0.0065, 0.018) }; m.uniforms.uNHor = { value: new THREE.Color(0.016, 0.02, 0.034) }; m.uniforms.uGlow = { value: new THREE.Color(0.05, 0.028, 0.014) }; m.uniforms.uMoonDir = { value: new THREE.Vector3(0, 1, 0) }; m.uniforms.uDiscMode = { value: 1 }; m.uniforms.uSunRad = { value: SUN_DISC.rad }; m.uniforms.uSunDisc = { value: SUN_DISC.hdr };
      /* night sky (the Preetham model is black once the sun has set): navy zenith, a lighter horizon band, the warm sodium/LED light
         pollution dome over the city (strongest at the horizon) and the moon's scattering glow; also feeds the PMREM environment */
      m.fragmentShader = 'uniform float uSkyGain; uniform float uNightK; uniform vec3 uNZen, uNHor, uGlow, uMoonDir; uniform float uDiscMode, uSunRad, uSunDisc;\n' + sunDiscPatch(m.fragmentShader).replace('gl_FragColor = vec4( texColor, 1.0 );', `{ float ey = clamp( direction.y, 0.0, 1.0 ); vec3 nsky = mix( uNHor, uNZen, pow( ey, 0.42 ) );
        nsky += uGlow * ( exp( -ey * 7.0 ) * 0.85 + exp( -ey * 26.0 ) * 0.6 ); float md = max( dot( direction, uMoonDir ), 0.0 ); nsky += vec3( 0.55, 0.6, 0.75 ) * ( 0.012 * pow( md, 12.0 ) + 0.05 * pow( md, 300.0 ) );
        if ( direction.y < 0.0 ) nsky = uNHor * 0.8 + uGlow * 0.9;
        gl_FragColor = vec4( texColor * uSkyGain + nsky * uNightK, 1.0 ); }`); m.needsUpdate = true; } // midday Preetham sky is far hotter than the city it lights: scale it so the horizon isn't a white wall
    const u = this.sky.material.uniforms; u.turbidity.value = 6; u.rayleigh.value = 1.6; u.mieCoefficient.value = 0.004; u.mieDirectionalG.value = 0.82;
    // clouds
    this.cloudMat = new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 }, uCover: { value: 0.3 }, uDark: { value: 0 }, uNight: { value: 0 }, uSunDir: { value: new THREE.Vector3() }, uSunCol: { value: new THREE.Color() }, uSkyCol: { value: new THREE.Color() }, uGlow: { value: new THREE.Color(0.05, 0.028, 0.014) }, uMoonDir: { value: new THREE.Vector3(0, 1, 0) } }, vertexShader: cloudVert, fragmentShader: cloudFrag, transparent: true, depthWrite: false, side: THREE.BackSide });
    this.clouds = new THREE.Mesh(new THREE.SphereGeometry(9000, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2), this.cloudMat); this.clouds.renderOrder = -1; this.clouds.frustumCulled = false; scene.add(this.clouds);
    // stars
    // A full celestial sphere: magnitudes follow the real star-count law (many faint, few bright), colours from blue-white to
    // orange by temperature, a faint Milky Way band, soft round point profiles, horizon extinction + city light pollution
    // (Colombo washes out the faint stars low in the sky), scintillation that is stronger near the horizon. The sphere turns
    // about the celestial pole (Colombo, 6.9° N: ~7° above the northern horizon, game north = −z) as the night goes on.
    const r = new RNG(5); for (let i = 0; i < 5000; i++) r.next(); // the rain seeds below keep their original sequence (the old star loop drew 5000)
    { const r = new RNG(1205), N = 7000, P = new Float32Array(N * 3), Bf = new Float32Array(N), Cf = new Float32Array(N * 3), Sd = new Float32Array(N);
      const gp = new THREE.Vector3(0.38, 0.62, -0.69).normalize(), ga = new THREE.Vector3().crossVectors(gp, new THREE.Vector3(1, 0, 0)).normalize(), gb = new THREE.Vector3().crossVectors(gp, ga); // galactic plane basis
      const v = new THREE.Vector3(), gauss = () => { let t = 0; for (let k = 0; k < 4; k++) t += r.next(); return (t - 2) / 0.577; };
      for (let i = 0; i < N; i++) {
        const mw = i < N * 0.3; // Milky Way share: faint stars hugging the galactic plane
        if (mw) { const a = r.next() * Math.PI * 2, lat = gauss() * 0.11; v.copy(ga).multiplyScalar(Math.cos(a) * Math.cos(lat)).addScaledVector(gb, Math.sin(a) * Math.cos(lat)).addScaledVector(gp, Math.sin(lat)); }
        else { const z = r.next() * 2 - 1, a = r.next() * Math.PI * 2, q = Math.sqrt(1 - z * z); v.set(q * Math.cos(a), z, q * Math.sin(a)); }
        v.normalize().multiplyScalar(9500); P.set([v.x, v.y, v.z], i * 3);
        const m = Math.max(-1.4, 6.6 + Math.log10(r.next() * 0.9999 + 1e-4) / 0.5) + (mw ? 0.8 : 0); // N(<m) ∝ 10^(0.5 m)
        Bf[i] = Math.min(3.2, Math.pow(10, -0.4 * (m - 5.6)) * 0.09); // relative flux (magnitude 5.6 ≈ the faintest visible in the city)
        const bv = Math.min(1.8, Math.max(-0.3, 0.55 + gauss() * 0.42)); // colour index B−V
        const c = bv < 0.3 ? [lerp(0.66, 1, (bv + 0.3) / 0.6), lerp(0.78, 1, (bv + 0.3) / 0.6), 1] : bv < 0.9 ? [1, lerp(1, 0.9, (bv - 0.3) / 0.6), lerp(1, 0.74, (bv - 0.3) / 0.6)] : [1, lerp(0.9, 0.72, (bv - 0.9) / 0.9), lerp(0.74, 0.46, (bv - 0.9) / 0.9)];
        Cf.set(c, i * 3); Sd[i] = r.next();
      }
      const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(P, 3)); sg.setAttribute('aFlux', new THREE.BufferAttribute(Bf, 1)); sg.setAttribute('aCol', new THREE.BufferAttribute(Cf, 3)); sg.setAttribute('aSeed', new THREE.BufferAttribute(Sd, 1));
      this.starMat = new THREE.ShaderMaterial({ uniforms: { uOpacity: { value: 0 }, uTime: { value: 0 }, uPix: { value: 1 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
        vertexShader: `attribute float aFlux; attribute vec3 aCol; attribute float aSeed; uniform float uOpacity, uTime, uPix; varying vec3 vC; varying float vCore;
          void main() { vec4 wp = modelMatrix * vec4(position, 1.0); vec3 d = normalize(wp.xyz - cameraPosition); float el = d.y;
            float ext = smoothstep(-0.01, 0.12 + 0.45 / (1.0 + aFlux * 6.0), el); // extinction + light pollution: faint stars vanish low down
            float tw = 1.0 + (0.18 + 0.5 * (1.0 - smoothstep(0.05, 0.7, el))) * sin(uTime * (7.0 + aSeed * 9.0) + aSeed * 61.0) * sin(uTime * (2.3 + aSeed * 3.0) + aSeed * 17.0);
            float b = aFlux * ext * tw * uOpacity; vC = aCol * b; vCore = clamp(aFlux, 0.0, 1.0);
            gl_PointSize = (1.6 + 2.4 * sqrt(clamp(aFlux, 0.0, 3.2))) * uPix; gl_Position = projectionMatrix * viewMatrix * wp; if (b < 0.004) gl_Position = vec4(2.0, 2.0, 2.0, 1.0); }`,
        fragmentShader: `varying vec3 vC; varying float vCore; void main() { vec2 q = gl_PointCoord - 0.5; float r2 = dot(q, q) * 4.0; if (r2 > 1.0) discard;
            float a = exp(-r2 * 5.5) + 0.12 * vCore * exp(-r2 * 1.6); gl_FragColor = vec4(vC * a, 1.0); }` });
      this.stars = new THREE.Points(sg, this.starMat); this.stars.frustumCulled = false; this.stars.renderOrder = -2; scene.add(this.stars);
      this.starPole = new THREE.Vector3(0, Math.sin(6.93 * Math.PI / 180), -Math.cos(6.93 * Math.PI / 180)); }
    // moon: shaded disc (maria, craters, limb darkening) + a soft halo
    { const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'); const rr = new RNG(31);
      const grd = g.createRadialGradient(118, 116, 10, 128, 128, 124); grd.addColorStop(0, '#fbf8ee'); grd.addColorStop(0.8, '#e9e4d6'); grd.addColorStop(1, '#bdb6a4'); g.fillStyle = grd; g.beginPath(); g.arc(128, 128, 124, 0, Math.PI * 2); g.fill();
      g.save(); g.beginPath(); g.arc(128, 128, 124, 0, Math.PI * 2); g.clip();
      for (const [x, y, rx, ry, a] of [[96, 92, 34, 26, 0.2], [140, 78, 26, 20, 0.17], [150, 120, 30, 24, 0.19], [104, 140, 22, 30, 0.15], [170, 150, 18, 14, 0.13], [74, 118, 16, 22, 0.12]]) { g.fillStyle = `rgba(110,106,96,${a})`; g.beginPath(); g.ellipse(x, y, rx, ry, rr.next() * 3, 0, Math.PI * 2); g.fill(); } // maria
      for (let k = 0; k < 40; k++) { const x = 20 + rr.next() * 216, y = 20 + rr.next() * 216, cr = 2 + rr.next() * 6; g.strokeStyle = 'rgba(255,255,250,0.18)'; g.lineWidth = 1; g.beginPath(); g.arc(x, y, cr, 0, Math.PI * 2); g.stroke(); g.fillStyle = 'rgba(90,86,78,0.1)'; g.beginPath(); g.arc(x + 0.8, y + 0.8, cr * 0.8, 0, Math.PI * 2); g.fill(); }
      g.restore(); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
      this.moon = new THREE.Mesh(new THREE.CircleGeometry(150, 48), new THREE.MeshBasicMaterial({ map: t, transparent: true, opacity: 0, fog: false, depthWrite: false })); this.moon.renderOrder = -1; scene.add(this.moon);
      const hc = document.createElement('canvas'); hc.width = hc.height = 128; const hg = hc.getContext('2d'); const hgr = hg.createRadialGradient(64, 64, 14, 64, 64, 64); hgr.addColorStop(0, 'rgba(255,250,235,0.55)'); hgr.addColorStop(0.35, 'rgba(220,226,240,0.16)'); hgr.addColorStop(1, 'rgba(200,210,235,0)'); hg.fillStyle = hgr; hg.fillRect(0, 0, 128, 128);
      const ht = new THREE.CanvasTexture(hc); ht.colorSpace = THREE.SRGBColorSpace; this.moonHalo = new THREE.Mesh(new THREE.PlaneGeometry(1300, 1300), new THREE.MeshBasicMaterial({ map: ht, transparent: true, opacity: 0, fog: false, depthWrite: false, blending: THREE.AdditiveBlending })); this.moonHalo.renderOrder = -1; scene.add(this.moonHalo); }
    // lights
    this.sun = new THREE.DirectionalLight(0xffffff, 3); this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048); const sc = this.sun.shadow.camera; sc.left = -80; sc.right = 80; sc.top = 80; sc.bottom = -80; sc.near = 1; sc.far = 600;
    this.sun.shadow.bias = -0.0001; this.sun.shadow.normalBias = 0.05; scene.add(this.sun, this.sun.target); // refitted every frame (fitSunShadow)
    this.hemi = new THREE.HemisphereLight(0xbfd8ff, 0x6b5a48, 0.8); scene.add(this.hemi);
    this.ambient = new THREE.AmbientLight(0x404a60, 0.0); scene.add(this.ambient);
    scene.fog = new THREE.Fog(0xbcc8d0, 200, 1400);
    // environment (PMREM of sky + clouds)
    this.pmrem = new THREE.PMREMGenerator(renderer); this.envScene = new THREE.Scene();
    const envSky = new Sky(); envSky.material = this.sky.material; envSky.scale.setScalar(80); this.envScene.add(envSky);
    const envClouds = new THREE.Mesh(new THREE.SphereGeometry(60, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), this.cloudMat); this.envScene.add(envClouds);
    this.envGround = new THREE.Mesh(new THREE.CircleGeometry(80, 16).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x2c2a26 })); this.envGround.position.y = -2; this.envScene.add(this.envGround);
    // surroundings band (buildings, tree line) up to ~9° above the horizon: grazing reflections — the silhouette edges of fence
    // bars, dark clothing, car flanks, where Fresnel reflectance goes to ~100 % — pick up a muted city tone instead of bright
    // cyan horizon haze (which rendered as 1-px cyan fringes on every dark edge in daylight)
    // …and above that band a painted Colombo skyline (towers with window grids; lit windows at night), so glass towers and car
    // bodies reflect a city instead of an empty horizon
    this.envSkyline = new THREE.Mesh(new THREE.CylinderGeometry(60, 60, 11.5, 48, 1, true), new THREE.MeshBasicMaterial({ color: 0x4a4c46, side: THREE.BackSide })); this.envSkyline.position.y = 3.6; this.envScene.add(this.envSkyline);
    { const sk = skylineTextures(); const geo = new THREE.CylinderGeometry(59.5, 59.5, 22, 64, 1, true);
      this.envCity = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: sk.day, transparent: true, alphaTest: 0.02, side: THREE.BackSide, depthWrite: false, fog: false })); this.envCity.position.y = 10.5; this.envScene.add(this.envCity);
      this.envCityLit = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: sk.lit, transparent: true, blending: THREE.AdditiveBlending, side: THREE.BackSide, depthWrite: false, opacity: 0, fog: false })); this.envCityLit.position.y = 10.5; this.envScene.add(this.envCityLit); }
    this.envTimer = 0; this.envRT = null; this.lastEnvHour = -99;
    // rain streaks
    this.rainCount = 7000; const rg = new THREE.BufferGeometry(); const rp = new Float32Array(this.rainCount * 6); this.rainSeeds = new Float32Array(this.rainCount * 3);
    for (let i = 0; i < this.rainCount; i++) { this.rainSeeds[i * 3] = r.next(); this.rainSeeds[i * 3 + 1] = r.next(); this.rainSeeds[i * 3 + 2] = r.next(); }
    // GPU rain: the streak geometry is static (per-vertex seeds); the vertex shader does the same fall/wrap/wind maths the CPU loop used to do every frame — no per-frame 7000-drop loop or 168 KB buffer upload
    const aEnd = new Float32Array(this.rainCount * 2), aIdx = new Float32Array(this.rainCount * 2);
    for (let i = 0; i < this.rainCount; i++) { for (let e = 0; e < 2; e++) { rp[i * 6 + e * 3] = this.rainSeeds[i * 3]; rp[i * 6 + e * 3 + 1] = this.rainSeeds[i * 3 + 1]; rp[i * 6 + e * 3 + 2] = this.rainSeeds[i * 3 + 2]; aEnd[i * 2 + e] = e; aIdx[i * 2 + e] = i; } }
    rg.setAttribute('position', new THREE.BufferAttribute(rp, 3)); rg.setAttribute('aEnd', new THREE.BufferAttribute(aEnd, 1)); rg.setAttribute('aIdx', new THREE.BufferAttribute(aIdx, 1));
    const rmat = new THREE.LineBasicMaterial({ color: 0xaab4c0, transparent: true, opacity: 0.0, depthWrite: false, fog: true });
    this.rainU = { uRT: { value: 0 }, uRCam: { value: new THREE.Vector3() }, uRWind: { value: 0 }, uRN: { value: 0 } };
    rmat.onBeforeCompile = (sh) => { Object.assign(sh.uniforms, this.rainU);
      sh.vertexShader = 'uniform float uRT; uniform vec3 uRCam; uniform float uRWind; uniform float uRN; attribute float aEnd; attribute float aIdx;\n' + sh.vertexShader.replace('#include <begin_vertex>', `
        vec3 transformed; { const float W = 46.0, H = 26.0; vec3 sd = position;
          float fall = mod(sd.y * H - uRT * (17.0 + sd.z * 5.0), H);
          float x = uRCam.x + sd.x * W - W * 0.5, z = uRCam.z + sd.z * W - W * 0.5, y = uRCam.y - 8.0 + fall;
          transformed = vec3(x - uRWind * 0.08 * aEnd, y + 0.6 * aEnd, z - uRWind * 0.03 * aEnd);
          if (aIdx >= uRN) transformed = vec3(0.0, -999.0, 0.0); }`); };
    this.rain = new THREE.LineSegments(rg, rmat);
    this.rain.frustumCulled = false; scene.add(this.rain);
    this.flash = 0; this.listeners = { thunder: null }; this.shadowCfg = SUN_SHADOW;
    this.sunDir = new THREE.Vector3(); this.night = 0;
  }
  // Fit the sun (or moon) shadow to the area round the player, every frame, at no extra draw cost:
  //  · centre: the player, pushed ~10 m ahead of where the camera looks (more coverage in view, less behind it);
  //  · light-space box: ±range across the light, and along it exactly the span the ground disc + street-level receivers up to
  //    wallH (facades, people, trees) occupy at the current sun elevation — high sun ≈ 68 × 70 m, low sun shrinks the box
  //    along the light so the texels stay square on the ground and the long evening shadows keep their resolution;
  //  · texel snapping: the box edges sit on the shadow map's texel grid in light space, so walking / driving / turning the
  //    camera slides the box by whole texels and shadow edges never crawl or flicker (extents are quantised for the same reason);
  //  · biases follow the texel size (≈ 1.5 texels of normal offset, ≈ 3 cm of depth bias) instead of the old 0.6 m normal bias
  //    that lifted every contact shadow off the ground; PCF softness (shadow.radius: 5 rotated Vogel taps of hardware 2×2
  //    comparisons in three r186) is set per shadow resolution for a ≈ 4–7 cm natural penumbra.
  // Satellite map capture overrides the box for its tiles and restores it; the next frame refits it here anyway.
  fitSunShadow(focus, camera, L) {
    const S = SUN_SHADOW, sun = this.sun, sh = sun.shadow, sc = sh.camera, N = sh.mapSize.x || 2048, R = S.range;
    _sf.set(0, 0, 0); if (camera) { camera.getWorldDirection(_sf); _sf.y = 0; const l = _sf.length(); if (l > 0.2) _sf.multiplyScalar((R * S.ahead) / l); else _sf.set(0, 0, 0); }
    const C = _sc.copy(focus).add(_sf);
    sun.position.copy(C).addScaledVector(L, S.dist); sun.target.position.copy(C); sun.target.updateMatrixWorld();
    // light basis exactly as Object3D.lookAt builds the shadow camera (z = L, x = up × z, y = z × x)
    _sx.crossVectors(_UP, L).normalize(); _sy.crossVectors(L, _sx);
    const sinE = Math.min(1, Math.max(0.05, L.y)), cosE = Math.sqrt(1 - sinE * sinE);
    const W = 2 * (R + 1), y0 = -R * sinE - 1, H = Math.ceil((2 * R * sinE + S.wallH * cosE + 2) / 2) * 2; // light-space extents (m)
    const tx = W / N, ty = H / N, cx = C.dot(_sx), cy = C.dot(_sy);
    const left = S.snap ? Math.floor((cx - W / 2) / tx) * tx - cx : -W / 2, bottom = S.snap ? Math.floor((cy + y0) / ty) * ty - cy : y0;
    // (three marks the shadow camera reversed-depth on its first shadow pass but never rebuilds its projection: done here)
    if (sc.left !== left || sc.bottom !== bottom || sc.right !== left + W || sc.top !== bottom + H || sc.far !== S.dist + R + 60 || sc.userData.rev !== sc.reversedDepth) {
      sc.left = left; sc.right = left + W; sc.bottom = bottom; sc.top = bottom + H; sc.near = 1; sc.far = S.dist + R + 60; sc.userData.rev = sc.reversedDepth; sc.updateProjectionMatrix(); }
    const pcf = S.pcf[N] ?? (N > 2048 ? 2.2 : N < 2048 ? 1.0 : 1.5), texel = Math.max(tx, ty);
    sh.radius = pcf; sh.normalBias = Math.min(0.12, Math.max(0.025, texel * (1 + 0.35 * pcf)));
    sh.bias = (sc.reversedDepth ? 1 : -1) * 0.03 / (sc.far - sc.near); // ≈ 3 cm towards the light (reversed-Z: nearer = larger depth)
  }
  setWeather(name, instant = false) { this.target = name; if (instant) { this.weather = name; this.w = { ...WEATHER[name] }; if (WEATHER[name].rain > 0.5) this.wet = 1; } }
  forceWeather(name) { this.forced = name; if (name) this.setWeather(name); }
  get timeString() { const h = Math.floor(this.hour), m = Math.floor((this.hour - h) * 60); return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`; }
  advance(gameMinutes) { this.hour += gameMinutes / 60; while (this.hour >= 24) { this.hour -= 24; this.day++; } }
  update(dt, focus, camera, gameDt) {
    // weather transitions
    if (!this.forced) {
      this.weatherTimer -= gameDt;
      if (this.weatherTimer <= 0) {
        const afternoon = this.hour > 13 && this.hour < 19; // monsoon showers favour late afternoon
        this.target = this.rng.weighted([['clear', 4], ['cloudy', 3], ['overcast', 2], ['rain', afternoon ? 2.5 : 1], ['storm', afternoon ? 0.8 : 0.3]]);
        this.weatherTimer = this.rng.range(180, 420);
      }
    }
    const tgt = WEATHER[this.target]; const k = 1 - Math.exp(-dt * 0.08);
    for (const key of Object.keys(tgt)) this.w[key] = lerp(this.w[key], tgt[key], k);
    if (Math.abs(this.w.cloud - tgt.cloud) < 0.02) this.weather = this.target;
    this.wet = clamp(this.wet + (this.w.rain > 0.2 ? dt * 0.05 : -dt * 0.016), 0, 1); // wet only while it rains: the shine is gone about a minute after the rain stops (a road that still mirrored the sky minutes after a shower read as a bug)
    // sun & moon
    const th = ((this.hour - 6.15) / (18.3 - 6.15)) * Math.PI;
    this.sunDir.set(Math.cos(th), Math.sin(th) * 0.97, 0.22).normalize();
    const elev = this.sunDir.y;
    this.night = 1 - smoothstep(-0.12, 0.06, elev);
    const golden = 1 - smoothstep(0.05, 0.35, Math.max(elev, 0));
    const cloudDim = 1 - this.w.cloud * 0.72;
    const u = this.sky.material.uniforms; u.sunPosition.value.copy(this.sunDir).multiplyScalar(1000);
    u.turbidity.value = lerp(3, 11, this.w.cloud) + golden * 2; u.mieDirectionalG.value = lerp(0.8, 0.75, golden); /* a tighter forward-scattering halo by day: the sun reads as a disc in a glow, not a white quarter of the sky */ u.rayleigh.value = lerp(1.3, 3.2, golden) * (1 - this.w.dark * 0.5) + this.night * 0.0;
    u.mieCoefficient.value = lerp(0.0018, 0.008, golden); u.uSkyGain.value = lerp(0.58, 1.0, Math.max(golden, this.night)); // tight sun halo: no white-out across the skyline
    const warm = Math.max(golden, SUN_WARMTH * (1 - smoothstep(0.1, 0.6, Math.max(elev, 0)))); this.warmth = warm;
    const sunCol = new THREE.Color().setRGB(1, lerp(0.95, 0.55, warm), lerp(0.88, 0.32, warm));
    this.sun.color.copy(sunCol);
    this.sun.intensity = Math.max(0, smoothstep(0.0, 0.12, elev)) * 2.7 * cloudDim; // 35th (smooth transitions): reaches 0 exactly at the horizon, where the light hands over to the moon
    // moon light at night (kept bright enough for readable night gameplay)
    if (elev < 0) { _sl.set(-0.4, 0.8, -0.3).normalize(); this.sun.color.setRGB(0.62, 0.72, 1.0); this.sun.intensity = 0.78 * this.night * (1 - this.w.cloud * 0.45) * smoothstep(0.0, 0.07, -elev); } // fades in from 0 below the horizon: the switch of direction / colour from sun to moon happens at zero intensity (it used to flip the shadows and the light colour in one frame at sunset / sunrise) // moonlight: readable silhouettes and road surface, still clearly night
    else _sl.copy(this.sunDir);
    // 35th request (shadow errors): the light direction the shadow map is rendered along moves in small fixed steps (0.0025 rad ≈
    // 0.14°: a 10 m pole's shadow tip jumps ~2–3 cm every half game minute) instead of rotating a little every frame — a rotating
    // light basis re-rasterises every shadow edge each frame, which reads as constant crawling / shimmering on cars, walls and trees
    // even with the texel-snapped box. Shading (the sky, the sun disc, leaf translucency) keeps the exact direction.
    { const az = Math.atan2(_sl.z, _sl.x), el = Math.asin(Math.max(-1, Math.min(1, _sl.y))), q = 0.0025; const azq = Math.round(az / q) * q, elq = Math.round(el / q) * q;
      _slq.set(Math.cos(elq) * Math.cos(azq), Math.sin(elq), Math.cos(elq) * Math.sin(azq)); }
    this.fitSunShadow(focus, camera, _slq); // places the sun / moon light and its shadow box
    { const d = leafLight.dir.value, c = leafLight.col.value; const sd = _sl; d[0] = sd.x; d[1] = sd.y; d[2] = sd.z;
      c[0] = this.sun.color.r * this.sun.intensity; c[1] = this.sun.color.g * this.sun.intensity; c[2] = this.sun.color.b * this.sun.intensity; }
    const skyTop = new THREE.Color().setRGB(0.28, 0.48, 0.82).lerp(new THREE.Color(0.32, 0.36, 0.42), this.w.dark).lerp(new THREE.Color(0.02, 0.04, 0.1), this.night);
    const horizon = new THREE.Color().setRGB(0.75, 0.82, 0.88).lerp(new THREE.Color(1.0, 0.62, 0.38), golden * (1 - this.night) * (1 - this.w.dark)).lerp(new THREE.Color(0.5, 0.52, 0.55), this.w.dark * 0.7).lerp(new THREE.Color(0.06, 0.08, 0.14), this.night);
    this.hemi.color.copy(skyTop).lerp(new THREE.Color(1, 1, 1), 0.35).lerp(_warmSky, 0.22 * (1 - this.night) * (1 - this.w.dark)); /* daytime shade also gets light bounced off sunlit streets and facades, not only blue sky: shaded walls (Fort's north faces) read blue-grey otherwise. Light only — the grade / exposure are untouched */ this.hemi.groundColor.setRGB(0.42, 0.36, 0.3).lerp(new THREE.Color(0.15, 0.115, 0.09), this.night); /* night bounce: warm street light off the roads */
    this.hemi.intensity = lerp(0.55, 0.42, golden) * (1 + this.w.cloud * 0.5) * (1 - this.night * 0.55) + 0.12 + this.night * 0.17;
    this.ambient.intensity = this.night * 0.85; this.ambient.color.setRGB(0.34, 0.37, 0.55);
    // fog
    const fogCol = horizon.clone().lerp(skyTop, 0.35).multiplyScalar(0.8); /* aerial perspective: bluish, never white */ fogCol.lerp(new THREE.Color(0.042, 0.04, 0.052).multiplyScalar(1 + this.w.cloud * 0.4), this.night); /* night: the city's light haze, matching the sky's horizon glow */ this.scene.fog.color.copy(fogCol);
    this.scene.fog.near = this.drawDist * 0.35 * this.w.fog; this.scene.fog.far = this.drawDist * 1.5 * this.w.fog * (1 - this.night * 0.2);
    this.renderer.toneMappingExposure = lerp(0.82, 1.0, golden) * (1 + this.night * 0.3) * (1 + this.w.dark * 0.12) * lerp(1, this.nightBoost ?? 1, this.night); // Settings → Night brightness
    // clouds
    const cu = this.cloudMat.uniforms; cu.uTime.value += dt * (0.5 + this.w.wind); cu.uCover.value = this.w.cloud; cu.uDark.value = this.w.dark; cu.uNight.value = this.night;
    cu.uSunDir.value.copy(elev > -0.1 ? this.sunDir : new THREE.Vector3(0, 1, 0)); cu.uSunCol.value.copy(sunCol); cu.uSkyCol.value.copy(horizon);
    this.clouds.position.copy(camera.position); this.stars.position.copy(camera.position);
    { const su = this.starMat.uniforms; su.uOpacity.value = this.night * Math.pow(1 - this.w.cloud, 1.5) * (1 - this.w.dark * 0.8); su.uTime.value += dt; su.uPix.value = this.renderer.getPixelRatio ? this.renderer.getPixelRatio() : 1;
      this.stars.quaternion.setFromAxisAngle(this.starPole, -((this.day || 0) * 0.0172 + this.hour / 24) * Math.PI * 2); } // sidereal turn through the night
    const moonDir = new THREE.Vector3(-this.sunDir.x, Math.max(0.25, -this.sunDir.y), -0.3).normalize();
    { const su = this.sky.material.uniforms, glow = 1 + this.w.cloud * 0.9; su.uNightK.value = this.night; su.uMoonDir.value.copy(moonDir); su.uGlow.value.setRGB(0.042 * glow, 0.03 * glow, 0.022 * glow);
      cu.uMoonDir.value.copy(moonDir); cu.uGlow.value.copy(su.uGlow.value).multiplyScalar(0.9); }
    this.moon.position.copy(camera.position).addScaledVector(moonDir, 9000); this.moon.lookAt(camera.position); this.moon.material.opacity = this.night * (1 - this.w.cloud * 0.8);
    this.moonHalo.position.copy(camera.position).addScaledVector(moonDir, 9010); this.moonHalo.lookAt(camera.position); this.moonHalo.material.opacity = this.night * (1 - this.w.cloud * 0.6) * 0.7;
    this.sky.visible = true;
    // lightning
    if (this.w.rain > 0.85 && Math.random() < dt * 0.06) { this.flash = 1; this.listeners.thunder && this.listeners.thunder(); }
    this.flash = Math.max(0, this.flash - dt * 2.5);
    if (this.flash > 0) { this.ambient.intensity += this.flash * 2.5 * (Math.random() > 0.3 ? 1 : 0.2); this.ambient.color.setRGB(0.8, 0.85, 1); }
    // shared material + water state
    updateMaterials(this.night, this.indoor ? 0 : this.wet, this.hour); // shared materials stay dry indoors (wet roughness/env reflections made ceiling blotches)
    waterUniforms.uSunDir.value.copy(this.sunDir); waterUniforms.uSunColor.value.copy(sunCol); waterUniforms.uSkyTop.value.copy(skyTop); waterUniforms.uSkyHorizon.value.copy(horizon);
    waterUniforms.uNight.value = this.night; waterUniforms.uRain.value = this.w.rain; waterUniforms.uCloud.value = this.w.cloud; waterUniforms.uWind.value = this.w.wind ?? 0.3; waterUniforms.uTime.value += dt;
    this.horizon = horizon; this.skyTop = skyTop; this.golden = golden;
    this.updateRain(dt, camera);
    // environment map refresh
    this.envTimer -= dt;
    if (this.envTimer <= 0 || Math.abs(this.hour - this.lastEnvHour) > 0.4) {
      this.envTimer = 12; this.lastEnvHour = this.hour;
      this.envGround.material.color.setRGB(0.25, 0.23, 0.2).multiplyScalar(1 - this.night * 0.8);
      this.envSkyline.material.color.setRGB(0.3, 0.31, 0.28).multiplyScalar((1 - this.night * 0.85) * (1 - this.w.dark * 0.35));
      if (this.envCity) { this.envCity.material.color.setRGB(1, 1, 1).multiplyScalar(Math.max(0.06, (1 - this.night * 0.9)) * (1 - this.w.dark * 0.4)); this.envCityLit.material.opacity = this.night * 0.9; }
      const prevFog = this.scene.fog; const old = this.envRT;
      const sm = this.sky.material.uniforms; sm.uDiscMode.value = 0; this.envRT = this.pmrem.fromScene(this.envScene, 0.02, 0.1, 200); sm.uDiscMode.value = 1; // reflections keep the original disc
      this.scene.environment = this.envRT.texture; this.envBase = this.scene.environmentIntensity = 0.62 * (1 - this.night * 0.7) * (1 - this.w.dark * 0.3); // sky PMREM is HDR: full strength washed every facade
      if (old) old.dispose(); void prevFog;
    }
  }
  updateRain(dt, camera) {
    const amt = this.w.rain; this.rain.visible = amt > 0.02; this.rain.material.opacity = 0.18 + amt * 0.25;
    if (!this.rain.visible) return;
    const U = this.rainU; U.uRN.value = Math.floor(this.rainCount * amt); U.uRCam.value.copy(camera.position); U.uRWind.value = this.w.wind * 0.6;
    U.uRT.value = (performance.now() * 0.001) % 1000; /* wrapped so float precision in the shader never degrades over a long session */
  }
  serialize() { return { hour: this.hour, day: this.day, weather: this.target }; }
  restore(s) { if (!s) return; this.hour = s.hour; this.day = s.day || 1; this.setWeather(s.weather || 'clear', true); }
}

// Reflection-only skyline strip for the environment map: 2048×256, towers of varied height and width, window grids; a second
// texture holds the lit windows for night. Bottom ~30 % is the building bases (merges with the dark surroundings band).
function skylineTextures() {
  const W = 2048, H = 256; const mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };
  const cd = mk(), cl = mk(), d = cd.getContext('2d'), l = cl.getContext('2d'); let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  l.fillStyle = '#000'; l.fillRect(0, 0, W, H);
  for (let pass = 0; pass < 2; pass++) for (let x = 0; x < W;) {
    const w = 18 + rnd() * (pass ? 60 : 40), tall = pass ? 0.25 + rnd() * 0.55 : 0.15 + rnd() * 0.3; const top = Math.floor(H * (1 - tall)), glass = rnd() < 0.45;
    const base = pass ? [70 + rnd() * 30, 78 + rnd() * 30, 88 + rnd() * 34] : [96, 100, 104]; const k = pass ? 1 : 1.12;
    d.fillStyle = `rgb(${base[0] * k | 0},${base[1] * k | 0},${base[2] * k | 0})`; d.fillRect(x, top, w, H - top);
    if (glass) { const g = d.createLinearGradient(x, 0, x + w, 0); g.addColorStop(0, 'rgba(150,180,205,0.55)'); g.addColorStop(1, 'rgba(60,80,100,0.35)'); d.fillStyle = g; d.fillRect(x, top, w, H - top); }
    for (let y = top + 4; y < H - 6; y += 5) for (let wx = x + 3; wx < x + w - 3; wx += 4) {
      d.fillStyle = glass ? 'rgba(20,30,40,0.25)' : 'rgba(30,30,35,0.45)'; d.fillRect(wx, y, 2, 2.5);
      if (rnd() < 0.32) { l.fillStyle = rnd() < 0.7 ? 'rgba(255,214,150,0.9)' : 'rgba(210,230,255,0.85)'; l.fillRect(wx, y, 2, 2.5); } }
    x += w + (pass ? 6 + rnd() * 40 : 2 + rnd() * 10);
  }
  const t = (c) => { const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace; tx.wrapS = THREE.RepeatWrapping; return tx; };
  return { day: t(cd), lit: t(cl) };
}
