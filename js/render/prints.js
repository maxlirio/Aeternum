// What walking does to the ground, and what wind does to loose ground. Boots press real dents into a height map where
// the ground is soft (gen/underfoot.js): sand, snow, mud, ash, and nowhere else. The terrain shader lights them with the
// sun and looks down into them. They fill in with time and wind. Plus a kick of dust at each step, and sand blowing off
// the dunes when it's windy, thickest over the crests.
import * as THREE from 'three';
import { groundFeel, landAt, landTones } from '../gen/land.js';
import { surfaceHeight } from '../gen/surface.js';
import { terrainMarks } from './terrain.js';

const MAX = 500, STRIDE = 0.72, GRAINS = 900, RES = 1024, SPAN = 40;     // SPAN m of ground around you, RES² samples: 4 cm each

// The dent a boot leaves, as signed height at (u along the foot, heel to toe, v across), in metres: a real sole outline with
// a narrow waist and a heel, cleated, ground pushed up in a rim around it and mostly thrown back off the toe.
function sole(u, v) {
  const q = u / 0.145, ball = Math.hypot((q - 0.32) / 0.68, v / 0.052), heel = Math.hypot((q + 0.6) / 0.42, v / 0.042), waist = q > -0.5 && q < 0.3 ? Math.abs(v) / 0.034 : 9;
  return Math.min(ball, heel, waist);    // < 1 inside
}
export class GroundMarks {
  constructor(planet) {
    this.planet = planet; this.group = new THREE.Group(); this.group.name = 'ground marks';
    // the map of dents, in the terrain shader's hands (render/terrain.js)
    this.h = new Uint8Array(RES * RES).fill(128);
    this.tex = new THREE.DataTexture(this.h, RES, RES, THREE.RedFormat, THREE.UnsignedByteType); this.tex.minFilter = this.tex.magFilter = THREE.LinearFilter; this.tex.needsUpdate = true;
    terrainMarks.tex.value = this.tex; terrainMarks.s.value = SPAN; this.c = null; this.steps = []; this.side = 1; this.dist = 0; this.dirty = false; this.rebuilt = 0;
    // dust and blowing sand: one set of points, each with a place, a speed and an age
    const tone = landTones(planet).sand; this.pos = new Float32Array(GRAINS * 3); this.life = new Float32Array(GRAINS * 2); this.vel = new Float32Array(GRAINS * 3); this.size = new Float32Array(GRAINS); this.alpha = new Float32Array(GRAINS);
    const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage)); pg.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage)); pg.setAttribute('aA', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    const pm = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { uC: { value: new THREE.Color(tone[0] * 1.1, tone[1] * 1.08, tone[2] * 1.05) } },
      vertexShader: 'attribute float aSize; attribute float aA; varying float vA; void main() { vA = aA; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = aSize * 700.0 / max(1.0, -mv.z); }',
      fragmentShader: 'uniform vec3 uC; varying float vA; void main() { vec2 d = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.05, length(d)); if (a * vA < 0.004) discard; gl_FragColor = vec4(uC, a * vA); }' });
    this.points = new THREE.Points(pg, pm); this.points.frustumCulled = false; this.group.add(this.points); this.pi = 0; this.acc = 0;
  }
  // Press one boot into the map. strength 0..1: how soft the ground is, how little it has blown in since.
  stamp(P, str) {
    const c = this.c, R = 0.26, sc = RES / SPAN, ca = Math.cos(P.rot), sa = Math.sin(P.rot), x0 = Math.max(0, Math.floor((P.x - R - c[0] + SPAN / 2) * sc)), x1 = Math.min(RES - 1, Math.ceil((P.x + R - c[0] + SPAN / 2) * sc)), y0 = Math.max(0, Math.floor((P.z - R - c[1] + SPAN / 2) * sc)), y1 = Math.min(RES - 1, Math.ceil((P.z + R - c[1] + SPAN / 2) * sc));
    if (x0 > x1 || y0 > y1) return;
    for (let j = y0; j <= y1; j++) for (let i = x0; i <= x1; i++) {
      const wx = (i + 0.5) / sc + c[0] - SPAN / 2 - P.x, wz = (j + 0.5) / sc + c[1] - SPAN / 2 - P.z, u = wx * sa + wz * ca, v = wx * ca - wz * sa, d = sole(u, v);
      // grains: the edge crumbles a little differently everywhere
      const n = Math.sin(wx * 91.7 + P.seed) * Math.cos(wz * 83.3 - P.seed) * 0.5 + Math.sin(wx * 211 + wz * 173) * 0.25, e = d + n * 0.09;
      let t;
      if (e < 1) { const wall = Math.min(1, (1 - e) * 3.2), cleat = Math.sin(u * 150) > 0.3 ? 0.14 : 0; t = -wall * (0.8 + 0.2 * Math.max(0, u / 0.145) - cleat); }      // down into it, deeper at the toe where you push off
      else { const out = e - 1, rim = u > 0.05 ? 0.55 : 0.32; t = out < 0.55 ? rim * Math.sin(Math.min(1, out / 0.55) * Math.PI) : 0; }
      if (!t) continue;
      const k = j * RES + i, cur = this.h[k], nv = 128 + t * 127 * str;
      this.h[k] = t < 0 ? Math.min(cur, nv) : Math.max(cur, Math.min(nv, cur + t * 127 * str));
    }
    this.dirty = true;
  }
  // Redraw everything near: when you've walked on far enough for the map to move, or the wind has had time to soften them.
  rebuild(x, z, erode) {
    this.c = [Math.round(x), Math.round(z)]; terrainMarks.c.value.set(this.c[0], this.c[1]); this.h.fill(128);
    this.steps = this.steps.filter(P => P.age < P.life);
    for (const P of this.steps) if (Math.abs(P.x - x) < SPAN / 2 + 1 && Math.abs(P.z - z) < SPAN / 2 + 1) this.stamp(P, P.soft * Math.max(0, 1 - (P.age / P.life) ** 2));
    this.dirty = true;
  }
  step(x, z, facing, F) {
    const px = x + Math.cos(facing) * this.side * 0.11, pz = z - Math.sin(facing) * this.side * 0.11, h = surfaceHeight(this.planet, px, pz); this.side = -this.side;
    if (F.print > 0) { const P = { x: px, z: pz, rot: facing, soft: F.print, age: 0, life: 120 + 480 * F.print, seed: Math.random() * 100 }; this.steps.push(P); if (this.steps.length > MAX) this.steps.shift(); this.stamp(P, P.soft); }
    if (F.dust > 0.05 && !F.firm) for (let k = 0; k < 4 + 8 * F.dust; k++) this.spawn(px, h + 0.05, pz, (Math.random() - 0.5) * 0.9, 0.25 + Math.random() * 0.7, (Math.random() - 0.5) * 0.9, 0.5 + Math.random() * 0.7, 0.05 + 0.05 * F.dust, 0.22 * F.dust);
  }
  spawn(x, y, z, vx, vy, vz, life, size, a) {
    const i = this.pi; this.pi = (this.pi + 1) % GRAINS;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z; this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz; this.life[i * 2] = life; this.life[i * 2 + 1] = life; this.size[i] = size; this.alpha[i] = a;
  }
  update(dt, ctrl, wind) {
    const [x, y, z] = ctrl.pos;
    if (!this.c || Math.abs(x - this.c[0]) > SPAN / 4 || Math.abs(z - this.c[1]) > SPAN / 4) this.rebuild(x, z);
    // a footfall every stride, on what holds one
    if (ctrl.mode === 'walk' && ctrl.grounded && !ctrl.where && ctrl.feel && !ctrl.feel.firm) {
      this.dist += (ctrl.speed || 0) * dt;
      if (this.dist > STRIDE) { this.dist = 0; this.step(x, z, ctrl.facing, ctrl.feel); }
      if (ctrl.sliding > 0.2) for (let k = 0; k < 3; k++) this.spawn(x + (Math.random() - 0.5) * 0.8, y + 0.05, z + (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.5, 0.15, (Math.random() - 0.5) * 0.5, 0.6, 0.07, 0.25);
    } else this.dist = 0;
    // prints fill in, faster when it's blowing; redrawn now and then, not every frame
    const ws = Math.hypot(wind[0], wind[1]), erode = 1 + ws * ws * 0.05;
    for (const P of this.steps) P.age += dt * erode;
    this.rebuilt += dt; if (this.rebuilt > 6 && this.steps.length) { this.rebuilt = 0; this.rebuild(x, z); }
    if (this.dirty) { this.dirty = false; this.tex.needsUpdate = true; }
    // sand lifting off the dunes: a few per frame near you, above a breeze, more on the crests
    if (ws > 3.5) {
      this.acc += dt * 70 * Math.min(1, (ws - 3.5) / 6);
      while (this.acc > 1) { this.acc--;
        const a = Math.random() * 6.283, r = 3 + Math.random() * 60, px = x + Math.cos(a) * r - wind[0] * 1.5, pz = z + Math.sin(a) * r - wind[1] * 1.5;
        let sandy = 0; for (const { c, w } of landAt(this.planet, px, pz)) if (c.kind === 'dunes') sandy += w;
        if (sandy < 0.5) continue;
        const h = surfaceHeight(this.planet, px, pz), up = surfaceHeight(this.planet, px - wind[0] / ws * 5, pz - wind[1] / ws * 5), dn = surfaceHeight(this.planet, px + wind[0] / ws * 5, pz + wind[1] / ws * 5);
        const crest = h >= up && h >= dn;      // the wind's own crest: it leaves the ground there
        if (!crest && Math.random() > 0.3) continue;
        for (let k = 0, n = crest ? 5 : 1; k < n; k++) this.spawn(px + Math.random() * 2, h + 0.05 + Math.random() * (crest ? 0.8 : 0.25), pz + Math.random() * 2, wind[0] * (0.7 + 0.4 * Math.random()), crest ? 0.5 + Math.random() : 0.15, wind[1] * (0.7 + 0.4 * Math.random()), 1 + Math.random() * 2, crest ? 0.11 : 0.06, crest ? 0.13 : 0.09);
      }
    }
    for (let i = 0; i < GRAINS; i++) {
      if (this.life[i * 2] <= 0) { this.alpha[i] = 0; continue; }
      this.life[i * 2] -= dt; const f = Math.max(0, this.life[i * 2] / this.life[i * 2 + 1]);
      this.vel[i * 3 + 1] -= dt * 0.5; this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.size[i] *= 1 + dt * 0.5; if (f < 0.4) this.alpha[i] *= 1 - dt * 3;
    }
    const A = this.points.geometry.attributes; A.position.needsUpdate = true; A.aSize.needsUpdate = true; A.aA.needsUpdate = true;
  }
}
