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
    const sp = []; const r = new RNG(5); for (let i = 0; i < 2500; i++) { const a = r.next() * Math.PI * 2, b = Math.acos(r.next() * 0.95); sp.push(Math.sin(b) * Math.cos(a) * 9500, Math.cos(b) * 9500, Math.sin(b) * Math.sin(a) * 9500); }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    this.starMat = new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, fog: false });
    this.stars = new THREE.Points(sg, this.starMat); this.stars.frustumCulled = false; scene.add(this.stars);
    this.moon = new THREE.Mesh(new THREE.CircleGeometry(160, 32), new THREE.MeshBasicMaterial({ color: 0xf4f1e6, transparent: true, opacity: 0, fog: false, depthWrite: false })); scene.add(this.moon);
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
    rg.setAttribute('position', new THREE.BufferAttribute(rp, 3));
    this.rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: 0xaab4c0, transparent: true, opacity: 0.0, depthWrite: false, fog: true }));
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
    this.starMat.opacity = this.night * (1 - this.w.cloud) * 0.9;
    const moonDir = new THREE.Vector3(-this.sunDir.x, Math.max(0.25, -this.sunDir.y), -0.3).normalize();
    this.moon.position.copy(camera.position).addScaledVector(moonDir, 9000); this.moon.lookAt(camera.position); this.moon.material.opacity = this.night * (1 - this.w.cloud * 0.8);
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
    const n = Math.floor(this.rainCount * amt); const pos = this.rain.geometry.attributes.position.array; const cp = camera.position;
    const t = performance.now() * 0.001; const W = 46, H = 26; const wind = this.w.wind * 0.6;
    for (let i = 0; i < this.rainCount; i++) {
      const o = i * 6;
      if (i >= n) { pos[o] = pos[o + 3] = 0; pos[o + 1] = pos[o + 4] = -999; pos[o + 2] = pos[o + 5] = 0; continue; }
      const sx = this.rainSeeds[i * 3], sy = this.rainSeeds[i * 3 + 1], sz = this.rainSeeds[i * 3 + 2];
      const fall = ((sy * H - t * (17 + sz * 5)) % H + H) % H;
      const x = cp.x + ((sx * W + cp.x * 0) % W) - W / 2, z = cp.z + ((sz * W) % W) - W / 2, y = cp.y - 8 + fall;
      pos[o] = x; pos[o + 1] = y; pos[o + 2] = z; pos[o + 3] = x - wind * 0.08; pos[o + 4] = y + 0.6; pos[o + 5] = z - wind * 0.03;
    }
    this.rain.geometry.attributes.position.needsUpdate = true;
  }
  serialize() { return { hour: this.hour, day: this.day, weather: this.target }; }
  restore(s) { if (!s) return; this.hour = s.hour; this.day = s.day || 1; this.setWeather(s.weather || 'clear', true); }
}
