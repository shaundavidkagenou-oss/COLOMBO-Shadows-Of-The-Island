// Time of day, sky, clouds, sun/moon lighting, fog, environment reflections and weather.
import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { clamp, lerp, smoothstep } from '../core/math.js';
import { updateMaterials } from './Materials.js';
import { waterUniforms } from '../world/Water.js';
import { RNG } from '../core/rng.js';

const cloudVert = `varying vec3 vDir; void main(){ vDir = normalize((modelMatrix * vec4(position,1.0)).xyz - cameraPosition); vec4 p = projectionMatrix * viewMatrix * modelMatrix * vec4(position,1.0); gl_Position = p.xyww; }`;
const cloudFrag = `
  uniform float uTime, uCover, uDark, uNight; uniform vec3 uSunDir, uSunCol, uSkyCol;
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
    col *= mix(1.0, 0.08, uNight);
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

export class Atmosphere {
  constructor(scene, renderer) {
    this.scene = scene; this.renderer = renderer;
    this.hour = 16.5; this.day = 1;
    this.weather = 'clear'; this.target = 'clear'; this.w = { ...WEATHER.clear }; this.wet = 0; this.lightning = 0; this.forced = null;
    this.weatherTimer = 240; this.drawDist = 1400; this.rng = new RNG(99);
    // sky
    this.sky = new Sky(); this.sky.scale.setScalar(18000); scene.add(this.sky);
    { const m = this.sky.material; m.uniforms.uSkyGain = { value: 1 }; m.fragmentShader = 'uniform float uSkyGain;\n' + m.fragmentShader.replace('gl_FragColor = vec4( texColor, 1.0 );', 'gl_FragColor = vec4( texColor * uSkyGain, 1.0 );'); m.needsUpdate = true; } // midday Preetham sky is far hotter than the city it lights: scale it so the horizon isn't a white wall
    const u = this.sky.material.uniforms; u.turbidity.value = 6; u.rayleigh.value = 1.6; u.mieCoefficient.value = 0.004; u.mieDirectionalG.value = 0.82;
    // clouds
    this.cloudMat = new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 }, uCover: { value: 0.3 }, uDark: { value: 0 }, uNight: { value: 0 }, uSunDir: { value: new THREE.Vector3() }, uSunCol: { value: new THREE.Color() }, uSkyCol: { value: new THREE.Color() } }, vertexShader: cloudVert, fragmentShader: cloudFrag, transparent: true, depthWrite: false, side: THREE.BackSide });
    this.clouds = new THREE.Mesh(new THREE.SphereGeometry(9000, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2), this.cloudMat); this.clouds.renderOrder = -1; this.clouds.frustumCulled = false; scene.add(this.clouds);
    // stars
    // A full celestial sphere: magnitudes follow the real star-count law (many faint, few bright), colours from blue-white to
    // orange by temperature, a faint Milky Way band, soft round point profiles, horizon extinction + city light pollution
    // (Colombo washes out the faint stars low in the sky), scintillation that is stronger near the horizon. The sphere turns
    // about the celestial pole (Colombo, 6.9° N: ~7° above the northern horizon, game north = −z) as the night goes on.
    { const r = new RNG(5), N = 7000, P = new Float32Array(N * 3), Bf = new Float32Array(N), Cf = new Float32Array(N * 3), Sd = new Float32Array(N);
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
    this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.6; scene.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xbfd8ff, 0x6b5a48, 0.8); scene.add(this.hemi);
    this.ambient = new THREE.AmbientLight(0x404a60, 0.0); scene.add(this.ambient);
    scene.fog = new THREE.Fog(0xbcc8d0, 200, 1400);
    // environment (PMREM of sky + clouds)
    this.pmrem = new THREE.PMREMGenerator(renderer); this.envScene = new THREE.Scene();
    const envSky = new Sky(); envSky.material = this.sky.material; envSky.scale.setScalar(80); this.envScene.add(envSky);
    const envClouds = new THREE.Mesh(new THREE.SphereGeometry(60, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), this.cloudMat); this.envScene.add(envClouds);
    this.envGround = new THREE.Mesh(new THREE.CircleGeometry(80, 16).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x2c2a26 })); this.envGround.position.y = -2; this.envScene.add(this.envGround);
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
    this.flash = 0; this.listeners = { thunder: null };
    this.sunDir = new THREE.Vector3(); this.night = 0;
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
    this.wet = clamp(this.wet + (this.w.rain > 0.2 ? dt * 0.05 : -dt * 0.006), 0, 1);
    // sun & moon
    const th = ((this.hour - 6.15) / (18.3 - 6.15)) * Math.PI;
    this.sunDir.set(Math.cos(th), Math.sin(th) * 0.97, 0.22).normalize();
    const elev = this.sunDir.y;
    this.night = 1 - smoothstep(-0.12, 0.06, elev);
    const golden = 1 - smoothstep(0.05, 0.35, Math.max(elev, 0));
    const cloudDim = 1 - this.w.cloud * 0.72;
    const u = this.sky.material.uniforms; u.sunPosition.value.copy(this.sunDir).multiplyScalar(1000);
    u.turbidity.value = lerp(3, 11, this.w.cloud) + golden * 2; u.mieDirectionalG.value = 0.74; u.rayleigh.value = lerp(1.3, 3.2, golden) * (1 - this.w.dark * 0.5) + this.night * 0.0;
    u.mieCoefficient.value = lerp(0.0018, 0.008, golden); u.uSkyGain.value = lerp(0.58, 1.0, Math.max(golden, this.night)); // tight sun halo: no white-out across the skyline
    const sunCol = new THREE.Color().setRGB(1, lerp(0.95, 0.55, golden), lerp(0.88, 0.32, golden));
    this.sun.color.copy(sunCol);
    this.sun.intensity = Math.max(0, smoothstep(-0.02, 0.12, elev)) * 2.7 * cloudDim;
    // moon light at night (kept bright enough for readable night gameplay)
    if (elev < 0) { this.sun.position.copy(focus).addScaledVector(new THREE.Vector3(-0.4, 0.8, -0.3).normalize(), 300); this.sun.color.setRGB(0.6, 0.7, 1.0); this.sun.intensity = 0.32 * this.night * (1 - this.w.cloud * 0.6); }
    else this.sun.position.copy(focus).addScaledVector(this.sunDir, 300);
    this.sun.target.position.copy(focus); this.sun.target.updateMatrixWorld();
    // snap shadow camera to texel grid to avoid shimmering
    const skyTop = new THREE.Color().setRGB(0.28, 0.48, 0.82).lerp(new THREE.Color(0.32, 0.36, 0.42), this.w.dark).lerp(new THREE.Color(0.02, 0.04, 0.1), this.night);
    const horizon = new THREE.Color().setRGB(0.75, 0.82, 0.88).lerp(new THREE.Color(1.0, 0.62, 0.38), golden * (1 - this.night) * (1 - this.w.dark)).lerp(new THREE.Color(0.5, 0.52, 0.55), this.w.dark * 0.7).lerp(new THREE.Color(0.06, 0.08, 0.14), this.night);
    this.hemi.color.copy(skyTop).lerp(new THREE.Color(1, 1, 1), 0.35); this.hemi.groundColor.setRGB(0.42, 0.36, 0.3).lerp(new THREE.Color(0.08, 0.07, 0.08), this.night);
    this.hemi.intensity = lerp(0.55, 0.42, golden) * (1 + this.w.cloud * 0.5) * (1 - this.night * 0.55) + 0.12;
    this.ambient.intensity = this.night * 0.55; this.ambient.color.setRGB(0.35, 0.38, 0.55);
    // fog
    const fogCol = horizon.clone().lerp(skyTop, 0.35).multiplyScalar(0.8); /* aerial perspective: bluish, never white */ this.scene.fog.color.copy(fogCol);
    this.scene.fog.near = this.drawDist * 0.35 * this.w.fog; this.scene.fog.far = this.drawDist * 1.5 * this.w.fog * (1 - this.night * 0.2);
    this.renderer.toneMappingExposure = lerp(0.82, 1.0, golden) * (1 + this.night * 0.22) * (1 + this.w.dark * 0.12);
    // clouds
    const cu = this.cloudMat.uniforms; cu.uTime.value += dt * (0.5 + this.w.wind); cu.uCover.value = this.w.cloud; cu.uDark.value = this.w.dark; cu.uNight.value = this.night;
    cu.uSunDir.value.copy(elev > -0.1 ? this.sunDir : new THREE.Vector3(0, 1, 0)); cu.uSunCol.value.copy(sunCol); cu.uSkyCol.value.copy(horizon);
    this.clouds.position.copy(camera.position); this.stars.position.copy(camera.position);
    { const su = this.starMat.uniforms; su.uOpacity.value = this.night * Math.pow(1 - this.w.cloud, 1.5) * (1 - this.w.dark * 0.8); su.uTime.value += dt; su.uPix.value = this.renderer.getPixelRatio ? this.renderer.getPixelRatio() : 1;
      this.stars.quaternion.setFromAxisAngle(this.starPole, -((this.day || 0) * 0.0172 + this.hour / 24) * Math.PI * 2); } // sidereal turn through the night
    const moonDir = new THREE.Vector3(-this.sunDir.x, Math.max(0.25, -this.sunDir.y), -0.3).normalize();
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
      const prevFog = this.scene.fog; const old = this.envRT;
      this.envRT = this.pmrem.fromScene(this.envScene, 0.02, 0.1, 200);
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
