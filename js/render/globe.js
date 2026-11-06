// The planet from high up: a real sphere at its real size, with the land on it made from the
// generator (gen/globe-bake.js), a sun, day and night, clouds, and a rim of air. It's placed so the
// point under you is straight down, so it lines up with the ground as you climb away from it.
import * as THREE from 'three';
import { globeOf, frameAt } from '../gen/globe.js';

const VERT = `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec2 vUv; varying vec3 vN; varying vec3 vO; varying vec3 vW;
void main() { vUv = uv; vO = position; vN = normalize(mat3(modelMatrix) * position); vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w;
#include <logdepthbuf_vertex>
}`;
const FRAG = `
#include <logdepthbuf_pars_fragment>
uniform sampler2D map; uniform vec3 sun; uniform float time;
varying vec2 vUv; varying vec3 vN; varying vec3 vO; varying vec3 vW;
float h3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vn(vec3 x) { vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y), mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z); }
float fbm(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * vn(p); p = p * 2.03 + 11.0; a *= 0.5; } return s; }
void main() {
#include <logdepthbuf_fragment>
  vec4 t = texture2D(map, vUv); vec3 N = normalize(vN), V = normalize(cameraPosition - vW);
  float lit = dot(N, sun), day = smoothstep(-0.08, 0.2, lit);
  vec3 col = t.rgb; col *= col;                                                 // (the picture is display colours)
  // clouds drift over it, in sheets and swirls
  vec3 q = normalize(vO); q += 0.25 * vec3(fbm(q * 4.0 + time * 0.01), fbm(q * 4.0 + 7.0), fbm(q * 4.0 - 5.0));
  float c = smoothstep(0.5, 0.72, fbm(q * 7.0 + vec3(time * 0.004, 0.0, 0.0)));
  vec3 surf = col * (0.04 + 1.25 * max(lit, 0.0));
  if (t.a > 0.5) { vec3 Hh = normalize(sun + V); surf += vec3(1.0, 0.92, 0.78) * pow(max(dot(N, Hh), 0.0), 90.0) * 0.8 * step(0.0, lit); }
  surf = mix(surf, vec3(0.95) * (0.05 + 1.15 * max(lit, 0.0)), c * 0.86);
  // the air, thicker toward the edge of the disc
  float rim = pow(1.0 - max(dot(N, V), 0.0), 3.0);
  surf += vec3(0.24, 0.44, 0.85) * rim * (0.05 + 0.9 * day);
  surf += vec3(0.015, 0.03, 0.07) * day;
  gl_FragColor = vec4(surf, 1.0);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`;
const AIR_F = `
#include <logdepthbuf_pars_fragment>
uniform vec3 sun; varying vec3 vN; varying vec3 vW;
void main() {
#include <logdepthbuf_fragment>
  vec3 N = normalize(vN), V = normalize(cameraPosition - vW); float d = max(dot(-N, V), 0.0), day = smoothstep(-0.25, 0.3, dot(N, sun));
  float edge = pow(smoothstep(0.0, 0.45, d), 2.0) * (1.0 - smoothstep(0.45, 1.0, d) * 0.8);
  gl_FragColor = vec4(vec3(0.3, 0.55, 1.0) * edge * (0.05 + 1.3 * day), 1.0);
#include <colorspace_fragment>
}`;

function grid(F, n = 48) {   // unit sphere over one face, laid out as gen/globe.js toSphere has it
  const pos = [], uv = [], idx = [], Q = Math.PI / 4;
  for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
    const u = i / n * 2 - 1, v = j / n * 2 - 1, a = Math.tan(u * Q), b = Math.tan(v * Q), p = [0, 1, 2].map(k => F.c[k] + a * F.r[k] + b * F.d[k]), l = Math.hypot(...p);
    pos.push(p[0] / l, p[1] / l, p[2] / l); uv.push(i / n, j / n);
  }
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const A = j * (n + 1) + i, B = A + 1, C = A + n + 1, D = C + 1; idx.push(A, C, B, B, C, D); }     // (faces outward: the charts are all the same way round)
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); return g;
}

export class GlobeView {
  constructor(planet, scene) {
    this.planet = planet; this.G = globeOf(planet); this.sun = { value: new THREE.Vector3(0, 1, 0) }; this.time = { value: 0 };
    this.group = new THREE.Group(); this.group.name = 'globe'; this.group.visible = false; this.group.renderOrder = -0.5; this.group.frustumCulled = false; scene.add(this.group);
    this.tex = []; this.mats = [];
    for (const F of this.G.faces) {
      const blank = new Uint8ClampedArray([24, 60, 96, 255]), T = new THREE.DataTexture(blank, 1, 1); T.colorSpace = THREE.NoColorSpace; T.magFilter = T.minFilter = THREE.LinearFilter; T.needsUpdate = true;
      const M = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: { map: { value: T }, sun: this.sun, time: this.time }, side: THREE.FrontSide, toneMapped: true, fog: false });
      const m = new THREE.Mesh(grid(F), M); m.frustumCulled = false; this.group.add(m); this.tex.push(T); this.mats.push(M);
    }
    const air = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: AIR_F, uniforms: { sun: this.sun }, side: THREE.BackSide, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    air.frustumCulled = false; air.scale.setScalar(1 + 90000 / this.G.R); this.group.add(air);
    this.sunDisc = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), new THREE.MeshBasicMaterial({ color: 0xfff6e0, fog: false, toneMapped: false })); this.sunDisc.frustumCulled = false; this.sunDisc.visible = false; scene.add(this.sunDisc);
    this.scale = new THREE.Vector3(this.G.R, this.G.R, this.G.R); this.baking = false; this.done = 0;
  }
  bake() {
    if (this.baking) return; this.baking = true;
    try {
      const w = new Worker(new URL('../gen/globe-bake.js', import.meta.url), { type: 'module' });
      w.onmessage = ({ data }) => { if (data.done) { w.terminate(); this.finished = true; return; } const T = new THREE.DataTexture(data.data, data.n, data.n); T.colorSpace = THREE.NoColorSpace; T.magFilter = THREE.LinearFilter; T.minFilter = THREE.LinearFilter; T.needsUpdate = true; this.mats[data.face].uniforms.map.value.dispose(); this.mats[data.face].uniforms.map.value = T; this.done++; };
      w.onerror = e => console.warn('globe picture', e.message);
      w.postMessage({ universe: this.planet.universeSeed, address: this.planet.address.key, sizes: [96, 384] });
    } catch (e) { console.warn('no globe picture', e); }
  }
  // px, pz: where you are on the planet; rx, rz: that spot in scene coordinates; alt: how high.
  update(dt, px, pz, rx, rz, alt, sunDir, camera, oy = 0) {
    const show = alt > 2500;
    this.group.visible = show; this.sunDisc.visible = alt > 30000;
    if (alt > 400) this.bake();
    if (!show) return;
    const F = frameAt(this.G, px, pz), { ex, up, ez } = F, M = new THREE.Matrix4().set(ex[0], ex[1], ex[2], 0, up[0], up[1], up[2], 0, ez[0], ez[1], ez[2], 0, 0, 0, 0, 1);
    this.group.quaternion.setFromRotationMatrix(M); this.group.scale.copy(this.scale); this.group.position.set(rx, this.planet.seaLevel - this.G.R - oy - Math.min(1, Math.max(0, 20000 - alt) / 17500) * 60, rz);
    this.sun.value.copy(sunDir); this.time.value += dt;
    if (this.sunDisc.visible) { const D = Math.max(camera.far * 0.8, 1e6); this.sunDisc.position.copy(camera.position).addScaledVector(sunDir, D); this.sunDisc.scale.setScalar(D * 0.0052); }
  }
}
