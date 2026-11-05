// Fire, smoke, sparks, blasts. One pool of soft particles, with noise inside each so they don't look like discs; flames and sparks are added
// to the light, smoke isn't. Positions are in the same world coordinates as everything under the floating origin.
import * as THREE from 'three';

const N = 2600;
function system(additive) {
  const g = new THREE.BufferGeometry(), S = { pos: new Float32Array(N * 3), col: new Float32Array(N * 4), size: new Float32Array(N), vel: new Float32Array(N * 3), life: new Float32Array(N), max: new Float32Array(N), grow: new Float32Array(N), drag: new Float32Array(N), grav: new Float32Array(N), seed: new Float32Array(N), a0: new Float32Array(N), i: 0 };
  g.setAttribute('position', new THREE.BufferAttribute(S.pos, 3).setUsage(THREE.DynamicDrawUsage)); g.setAttribute('aCol', new THREE.BufferAttribute(S.col, 4).setUsage(THREE.DynamicDrawUsage)); g.setAttribute('aSize', new THREE.BufferAttribute(S.size, 1).setUsage(THREE.DynamicDrawUsage)); g.setAttribute('aSeed', new THREE.BufferAttribute(S.seed, 1));
  const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, uniforms: { uT: { value: 0 }, uH: { value: 900 } },
    vertexShader: `#include <common>
#include <logdepthbuf_pars_vertex>
attribute vec4 aCol; attribute float aSize; attribute float aSeed; varying vec4 vC; varying float vS; uniform float uH; void main() { vC = aCol; vS = aSeed; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = min(aSize * uH / max(0.5, -mv.z), 512.0);
#include <logdepthbuf_vertex>
}`,
    fragmentShader: `#include <common>
#include <logdepthbuf_pars_fragment>
uniform float uT; varying vec4 vC; varying float vS; float hsh(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5); } float n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(hsh(i), hsh(i + vec2(1, 0)), f.x), mix(hsh(i + vec2(0, 1)), hsh(i + vec2(1, 1)), f.x), f.y); }
      void main() {
#include <logdepthbuf_fragment>
vec2 p = gl_PointCoord - 0.5; float r = length(p) * 2.0; if (r > 1.0) discard; vec2 q = p * 5.0 + vS * 37.0; float t = uT * 0.5 + vS; float nz = n(q + vec2(0.0, t)) * 0.6 + n(q * 2.1 - vec2(t, 0.0)) * 0.4; float a = 1.0 - smoothstep(0.25, 1.0, r + (nz - 0.5) * 0.9); if (a * vC.a < 0.004) discard; gl_FragColor = vec4(vC.rgb * (0.75 + 0.5 * nz), a * vC.a); }` });
  S.points = new THREE.Points(g, m); S.points.frustumCulled = false; S.points.renderOrder = 3; return S;
}
export class FX {
  constructor() {
    this.group = new THREE.Group(); this.group.name = 'fx'; this.glow = system(true); this.dark = system(false); this.group.add(this.dark.points, this.glow.points); this.t = 0;
    this.lights = [0, 1, 2].map(() => { const l = new THREE.PointLight(0xff9040, 0, 40, 1.6); this.group.add(l); return { l, at: null, v: 0, decay: 0, flicker: 0 }; }); this.shake = 0;
  }
  put(S, x, y, z, vx, vy, vz, life, size, grow, r, g, b, a, drag, grav) { const i = S.i; S.i = (i + 1) % N; S.pos.set([x, y, z], i * 3); S.vel.set([vx, vy, vz], i * 3); S.life[i] = life; S.max[i] = life; S.size[i] = size; S.grow[i] = grow; S.col.set([r, g, b, a], i * 4); S.a0[i] = a; S.drag[i] = drag; S.grav[i] = grav; S.seed[i] = Math.random(); this.seedDirty = true; S.fresh = true; }
  sparks(p, n = 20, sp = 7, dir = null) { for (let k = 0; k < n; k++) { const a = Math.random() * 6.28, u = Math.random(), s = sp * (0.3 + Math.random()), hx = Math.cos(a) * Math.sqrt(1 - u * u), hz = Math.sin(a) * Math.sqrt(1 - u * u); const dx = dir ? dir[0] * 0.8 : 0, dz = dir ? dir[2] * 0.8 : 0; this.put(this.glow, p[0], p[1], p[2], (hx + dx) * s, (u + 0.3) * s, (hz + dz) * s, 0.25 + Math.random() * 0.55, 0.035 + Math.random() * 0.03, -0.02, 2.6, 1.5, 0.5, 1, 0.6, 9.8); } }
  dust(p, n = 10, c = [0.5, 0.46, 0.4]) { for (let k = 0; k < n; k++) this.put(this.dark, p[0] + (Math.random() - 0.5) * 0.6, p[1] + 0.1, p[2] + (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 3, 0.5 + Math.random(), (Math.random() - 0.5) * 3, 0.7 + Math.random() * 0.8, 0.5, 0.9, c[0], c[1], c[2], 0.28, 1.5, 0); }
  glass(p, n = 14) { for (let k = 0; k < n; k++) { const a = Math.random() * 6.28, s = 1.5 + Math.random() * 3.5; this.put(this.glow, p[0], p[1], p[2], Math.cos(a) * s, 1 + Math.random() * 3, Math.sin(a) * s, 0.4 + Math.random() * 0.5, 0.025, 0, 0.8, 0.95, 1, 0.8, 0.3, 9.8); } }
  flame(p, size, w = [0, 0]) { const j = size * 0.45; this.put(this.glow, p[0] + (Math.random() - 0.5) * j, p[1] + Math.random() * size * 0.2, p[2] + (Math.random() - 0.5) * j, w[0] * 0.12 + (Math.random() - 0.5) * 0.5, 1.3 + Math.random() * 1.8 * size, w[1] * 0.12 + (Math.random() - 0.5) * 0.5, 0.35 + Math.random() * 0.4, size * (0.7 + Math.random() * 0.55), -size * 0.65, 1.05, 0.34 + Math.random() * 0.2, 0.05, 0.5, 0.4, -1.2); }
  smoke(p, size, w = [0, 0], shade = 0.06, a = 0.5) { this.put(this.dark, p[0] + (Math.random() - 0.5) * size * 0.5, p[1], p[2] + (Math.random() - 0.5) * size * 0.5, w[0] * 0.3 + (Math.random() - 0.5) * 0.4, 1.4 + Math.random() * 1.3, w[1] * 0.3 + (Math.random() - 0.5) * 0.4, 2.4 + Math.random() * 2.4, size * 0.7, size * 0.65, shade, shade, shade * 1.02, a, 0.3, -0.25); }
  blast(p, R) {
    const k = Math.min(1.6, R / 12);
    // the fireball: fast out, hanging a moment, then lifting
    for (let i = 0; i < 90; i++) { const a = Math.random() * 6.28, u = Math.random() * 1.6 - 0.4, c = Math.sqrt(Math.max(0, 1 - u * u)), s = (4 + Math.random() * 15) * k; this.put(this.glow, p[0], p[1] + 0.4, p[2], Math.cos(a) * c * s, u * s + 1.6, Math.sin(a) * c * s, 0.45 + Math.random() * 0.75, (1.3 + Math.random() * 1.9) * k, 1.8 * k, 1.5, 0.5 + Math.random() * 0.3, 0.08, 0.62, 3.6, -2); }
    for (let i = 0; i < 12; i++) this.put(this.glow, p[0], p[1] + 0.5, p[2], (Math.random() - 0.5) * 3, (Math.random() - 0.2) * 3, (Math.random() - 0.5) * 3, 0.16, 4 * k, 9 * k, 1.8, 1.3, 0.8, 0.7, 0, 0);       // the flash itself
    // black smoke rolling up out of it
    for (let i = 0; i < 60; i++) { const a = Math.random() * 6.28, s = (2 + Math.random() * 7) * k; this.put(this.dark, p[0] + Math.cos(a), p[1] + Math.random() * 2, p[2] + Math.sin(a), Math.cos(a) * s, 1 + Math.random() * 5, Math.sin(a) * s, 2.5 + Math.random() * 3.5, (0.7 + Math.random() * 0.9) * k, 1.5 * k, 0.05, 0.048, 0.045, 0.42, 1.8, -0.5); }
    // burning scraps, trailing
    this.sparks(p, 70, 16 * k); this.dustRing(p, R);
    const L = this.lights.find(q => q.v < 1) || this.lights[0]; L.at = p.slice(); L.v = 240 * k; L.decay = 6; L.l.position.set(...p); L.l.color.setHex(0xffa860); L.l.distance = R * 7; this.shake = Math.max(this.shake, Math.min(1, 1.2 * k));
  }
  dustRing(p, R) { for (let i = 0; i < 40; i++) { const a = i / 40 * 6.28, s = R * (1.1 + Math.random() * 0.6); this.put(this.dark, p[0], p[1] - 0.2, p[2], Math.cos(a) * s, 0.5, Math.sin(a) * s, 1 + Math.random(), 1, 2.4, 0.42, 0.38, 0.33, 0.3, 3.2, 0); } }
  update(dt, renderer) {
    this.t += dt; this.shake = Math.max(0, this.shake - dt * 1.4);
    const H = renderer ? renderer.domElement.height * 0.9 : 900;
    for (const S of [this.glow, this.dark]) {
      let live = S.fresh ? 1 : 0; S.fresh = false; for (let i = 0; i < N && !live; i++) if (S.life[i] > 0) live = 1;
      S.points.visible = !!live; if (!live && !S.wasLive) continue; S.wasLive = !!live;      // nothing burning: nothing to do
      S.points.material.uniforms.uT.value = this.t; S.points.material.uniforms.uH.value = H;
      for (let i = 0; i < N; i++) {
        if (S.life[i] <= 0) { S.col[i * 4 + 3] = 0; continue; }
        S.life[i] -= dt; const f = Math.max(0, S.life[i] / S.max[i]), k = Math.exp(-S.drag[i] * dt);
        S.vel[i * 3] *= k; S.vel[i * 3 + 2] *= k; S.vel[i * 3 + 1] = S.vel[i * 3 + 1] * k - S.grav[i] * dt;
        S.pos[i * 3] += S.vel[i * 3] * dt; S.pos[i * 3 + 1] += S.vel[i * 3 + 1] * dt; S.pos[i * 3 + 2] += S.vel[i * 3 + 2] * dt;
        S.size[i] = Math.max(0.005, S.size[i] + S.grow[i] * dt);
        S.col[i * 4 + 3] = S.a0[i] * Math.min(1, f * 2) * Math.min(1, (1 - f) * 12 + 0.3);
        if (S === this.glow && S.grow[i] > 0.5) { S.col[i * 4 + 1] *= 1 - dt * 1.2; S.col[i * 4 + 2] *= 1 - dt * 2.4; }     // flames redden as they cool
      }
      const A = S.points.geometry.attributes; A.position.needsUpdate = A.aCol.needsUpdate = A.aSize.needsUpdate = true; if (this.seedDirty) A.aSeed.needsUpdate = true;
    }
    this.seedDirty = false;
    for (const L of this.lights) { L.v *= Math.exp(-L.decay * dt); L.l.intensity = L.v < 0.05 ? 0 : L.v; }
  }
  // a steady light on a burning thing (rendered close): one of the pool
  burnLight(p, power, idx = 2) { const L = this.lights[idx]; if (L.v > power) return; L.l.position.set(p[0], p[1] + 1.2, p[2]); L.l.color.setHex(0xff7a30); L.l.distance = 30; L.v = power * (0.75 + 0.35 * Math.random()); L.decay = 8; }
}
