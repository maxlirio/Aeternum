// Weather you can see (gen/weather.js says what it is): a drifting cloud deck at a fixed
// altitude — you can fly up through it — lit by the sun from above and shadowed beneath,
// and rain streaking down around the camera.
import * as THREE from 'three';

const NOISE = `
  float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float vn(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(h21(i), h21(i + vec2(1, 0)), u.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), u.x), u.y); }
  float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 6; i++) { s += a * vn(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }`;

export class WeatherView {
  constructor(scene, planet) {
    this.planet = planet; this.base = planet.seaLevel + 1700;
    this.u = { uOff: { value: new THREE.Vector2() }, uCloud: { value: 0.3 }, uSun: { value: new THREE.Vector3(0, 1, 0) }, uLit: { value: new THREE.Color(1, 1, 1) },
      uShade: { value: new THREE.Color(0.5, 0.55, 0.62) }, uCam: { value: new THREE.Vector3() }, uDay: { value: 1 } };
    const m = new THREE.ShaderMaterial({
      uniforms: this.u, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      vertexShader: `#include <common>
      #include <logdepthbuf_pars_vertex>
      varying vec3 vW; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w;
      #include <logdepthbuf_vertex>
      }`,
      fragmentShader: `#include <common>
        #include <logdepthbuf_pars_fragment>
        uniform vec2 uOff; uniform float uCloud; uniform vec3 uSun; uniform vec3 uLit; uniform vec3 uShade; uniform vec3 uCam; uniform float uDay; varying vec3 vW;
        ${NOISE}
        void main() {
          #include <logdepthbuf_fragment>
          vec2 p = (vW.xz + uOff) / 2600.0;
          float n = fbm(p), d = smoothstep(1.05 - uCloud * 1.1, 1.3 - uCloud * 1.1, n + 0.25 * uCloud);
          float n2 = fbm(p + uSun.xz * 0.06);
          float lit = clamp(0.62 + 1.6 * (n - n2), 0.0, 1.0);                        // brighter where the cloud thins toward the sun
          float below = step(uCam.y, vW.y);
          vec3 col = mix(uShade, uLit, mix(lit * 0.7, 0.55 + 0.45 * lit, 1.0 - below)) * (0.12 + 0.88 * uDay);
          col = mix(col, uShade * (0.12 + 0.88 * uDay) * 0.85, below * uCloud * 0.5);   // heavy overcast is dark underneath
          float dist = length(vW.xz - uCam.xz);
          gl_FragColor = vec4(col, d * (1.0 - smoothstep(9000.0, 26000.0, dist)) * 0.96);
        }`,
    });
    this.clouds = new THREE.Mesh(new THREE.PlaneGeometry(60000, 60000, 1, 1).rotateX(-Math.PI / 2), m);
    this.clouds.frustumCulled = false; this.clouds.renderOrder = 2;
    scene.add(this.clouds);
    // rain: streaks in a box that follows the camera, moved here each frame (wrapping round the box)
    const N = this.N = 16000;
    this.rel = new Float32Array(N * 3);
    for (let i = 0; i < N * 3; i += 3) { this.rel[i] = Math.random() * 24 - 12; this.rel[i + 1] = Math.random() * 16 - 8; this.rel[i + 2] = Math.random() * 24 - 12; }
    const g = new THREE.BufferGeometry(); this.rpos = new THREE.BufferAttribute(new Float32Array(N * 6), 3); this.rpos.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.rpos);
    const a = new Float32Array(N * 2); for (let i = 0; i < N; i++) a[i * 2 + 1] = 1; g.setAttribute('aEnd', new THREE.BufferAttribute(a, 1));
    this.ru = { uRain: { value: 0 }, uDay: { value: 1 } };
    this.rain = new THREE.LineSegments(g, new THREE.ShaderMaterial({
      uniforms: this.ru, transparent: true, depthWrite: false,
      vertexShader: `#include <common>
      #include <logdepthbuf_pars_vertex>
      attribute float aEnd; varying float vA; void main() { vA = 1.0 - aEnd * 0.7; gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
      #include <logdepthbuf_vertex>
      }`,
      fragmentShader: `#include <common>
      #include <logdepthbuf_pars_fragment>
      uniform float uRain; uniform float uDay; varying float vA; void main() {
      #include <logdepthbuf_fragment>
      gl_FragColor = vec4(vec3(0.85, 0.88, 0.94) * (0.3 + 0.7 * uDay), 0.45 * uRain * vA); }`,
    }));
    this.rain.frustumCulled = false; this.rain.visible = false;
    scene.add(this.rain);
    this.drift = new THREE.Vector2();
  }
  // origin: the floating origin (world = render + origin); camW: camera in world space
  update(dt, w, sky, camera, origin, sheltered = false) {
    this.drift.x += w.wind[0] * dt; this.drift.y += w.wind[1] * dt;
    this.u.uOff.value.set(origin[0] - this.drift.x, origin[2] - this.drift.y);
    this.u.uCloud.value += (w.cloud - this.u.uCloud.value) * Math.min(1, dt * 0.2);
    this.clouds.position.set(camera.position.x, this.base, camera.position.z);
    this.u.uCam.value.copy(camera.position);
    this.u.uSun.value.copy(sky.dir); this.u.uDay.value = sky.day;
    this.u.uLit.value.copy(sky.sunColor).lerp(new THREE.Color(1, 1, 1), 0.5);
    this.ru.uDay.value = sky.day;
    this.ru.uRain.value += (w.rain * (camera.position.y < this.base && !sheltered ? 1 : 0) - this.ru.uRain.value) * Math.min(1, dt * (sheltered ? 4 : 0.5));
    if (this.ru.uRain.value > 0.01) {
      const vx = w.wind[0], vy = -11, vz = w.wind[1], R = this.rel, P = this.rpos.array, c = camera.position;
      const wrap = (v, h) => v > h ? v - 2 * h : v < -h ? v + 2 * h : v;
      const dx = c.x - (this.lastCam?.x ?? c.x), dy = c.y - (this.lastCam?.y ?? c.y), dz = c.z - (this.lastCam?.z ?? c.z);   // the box travels with you
      for (let i = 0, j = 0; i < R.length; i += 3, j += 6) {
        R[i] = wrap(R[i] + vx * dt - dx, 12); R[i + 1] = wrap(R[i + 1] + vy * dt - dy, 8); R[i + 2] = wrap(R[i + 2] + vz * dt - dz, 12);
        const x = c.x + R[i], y = c.y + R[i + 1], z = c.z + R[i + 2];
        P[j] = x; P[j + 1] = y; P[j + 2] = z; P[j + 3] = x - vx * 0.11; P[j + 4] = y - vy * 0.11; P[j + 5] = z - vz * 0.11;
      }
      this.rpos.needsUpdate = true;
    }
    this.lastCam = camera.position.clone();
    this.rain.visible = this.ru.uRain.value > 0.01;
  }
}
