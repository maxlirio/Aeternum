// What walking does to the ground, and what wind does to loose ground. Footprints pressed where the land holds them
// (deep in sand, a smudge on salt, dark and wet in a bog), filling in over time as the wind blows; a kick of dust at
// each step; and sand blowing off the dunes when it's windy, thickest over the crests. All of it reads gen/land.js.
import * as THREE from 'three';
import { groundFeel, landAt, landTones } from '../gen/land.js';
import { surfaceHeight } from '../gen/surface.js';

const MAX = 700, STRIDE = 0.72, GRAINS = 900;

function printTexture() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 128;
  const x = c.getContext('2d'); x.clearRect(0, 0, 64, 128);
  const oval = (cx, cy, rx, ry, st) => { x.fillStyle = st; x.beginPath(); x.ellipse(cx, cy, rx, ry, 0, 0, 6.3); x.fill(); };
  // raised rim of pushed-up ground (light), the pressed hollow (dark), heel and ball
  x.filter = 'blur(3px)'; oval(32, 40, 25, 34, 'rgba(255,240,215,0.6)'); oval(32, 94, 21, 26, 'rgba(255,240,215,0.6)');
  x.filter = 'blur(2px)'; oval(32, 40, 19, 28, 'rgba(0,0,0,0.85)'); oval(32, 94, 15, 20, 'rgba(0,0,0,0.85)');
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

export class GroundMarks {
  constructor(planet) {
    this.planet = planet; this.group = new THREE.Group(); this.group.name = 'ground marks';
    // footprints: one quad each; colour × alpha from the attribute, so they fade one at a time
    const g = new THREE.PlaneGeometry(0.17, 0.32); g.rotateX(-Math.PI / 2);
    this.aFade = new THREE.InstancedBufferAttribute(new Float32Array(MAX), 1); this.aFade.setUsage(THREE.DynamicDrawUsage); g.setAttribute('aFade', this.aFade);
    const m = new THREE.MeshStandardMaterial({ map: printTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4, roughness: 1, metalness: 0 });
    m.onBeforeCompile = sh => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aFade; varying float vFade;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvFade = aFade;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vFade;').replace('#include <map_fragment>', `
        vec4 tp = texture2D(map, vMapUv); float dark = 1.0 - smoothstep(0.0, 0.6, tp.r);
        diffuseColor.rgb = mix(vec3(0.82, 0.72, 0.56), vec3(0.09, 0.07, 0.05), dark); diffuseColor.a = tp.a * vFade * mix(0.55, 0.8, dark);`);
    };
    this.prints = new THREE.InstancedMesh(g, m, MAX); this.prints.frustumCulled = false; this.prints.count = 0; this.prints.renderOrder = 1; this.group.add(this.prints);
    this.at = []; this.next = 0; this.dist = 0; this.side = 1; this.last = null; this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._p = new THREE.Vector3(); this._s = new THREE.Vector3(1, 1, 1); this._n = new THREE.Vector3(); this._up = new THREE.Vector3(0, 1, 0); this._f = new THREE.Quaternion();
    // dust and blowing sand: one set of points, each with a place, a speed and an age
    const tone = landTones(planet).sand; this.pos = new Float32Array(GRAINS * 3); this.life = new Float32Array(GRAINS * 2); this.vel = new Float32Array(GRAINS * 3); this.size = new Float32Array(GRAINS); this.alpha = new Float32Array(GRAINS);
    const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage)); pg.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage)); pg.setAttribute('aA', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    const pm = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { uC: { value: new THREE.Color(tone[0] * 1.1, tone[1] * 1.08, tone[2] * 1.05) } },
      vertexShader: 'attribute float aSize; attribute float aA; varying float vA; void main() { vA = aA; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = aSize * 700.0 / max(1.0, -mv.z); }',
      fragmentShader: 'uniform vec3 uC; varying float vA; void main() { vec2 d = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.05, length(d)); if (a * vA < 0.004) discard; gl_FragColor = vec4(uC, a * vA); }' });
    this.points = new THREE.Points(pg, pm); this.points.frustumCulled = false; this.group.add(this.points); this.pi = 0; this.acc = 0;
  }
  step(x, y, z, facing, F, slope) {
    const ox = Math.cos(facing) * this.side * 0.11, oz = -Math.sin(facing) * this.side * 0.11, px = x + ox, pz = z + oz, e = 0.25;
    const h = surfaceHeight(this.planet, px, pz), hx = surfaceHeight(this.planet, px + e, pz) - h, hz = surfaceHeight(this.planet, px, pz + e) - h;
    this._n.set(-hx, e, -hz).normalize(); this._q.setFromUnitVectors(this._up, this._n).multiply(this._f.setFromAxisAngle(this._up, facing));
    this.at[this.next] = { born: 0, life: 40 + 500 * F.print, strength: Math.min(1, 0.2 + F.print) };
    this.prints.setMatrixAt(this.next, this._m.compose(this._p.set(px, h + 0.012, pz), this._q, this._s)); this.aFade.setX(this.next, this.at[this.next].strength);
    this.next = (this.next + 1) % MAX; this.prints.count = Math.max(this.prints.count, Math.min(MAX, this.at.length)); this.prints.instanceMatrix.needsUpdate = true; this.side = -this.side;
    if (F.dust > 0.05) for (let k = 0; k < 4 + 8 * F.dust; k++) this.spawn(px, h + 0.05, pz, (Math.random() - 0.5) * 0.9, 0.25 + Math.random() * 0.7, (Math.random() - 0.5) * 0.9, 0.5 + Math.random() * 0.7, 0.05 + 0.05 * F.dust, 0.22 * F.dust);
  }
  spawn(x, y, z, vx, vy, vz, life, size, a) {
    const i = this.pi; this.pi = (this.pi + 1) % GRAINS;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z; this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz; this.life[i * 2] = life; this.life[i * 2 + 1] = life; this.size[i] = size; this.alpha[i] = a;
  }
  update(dt, ctrl, wind) {
    const [x, y, z] = ctrl.pos;
    // a footfall every stride, on what holds one
    if (ctrl.mode === 'walk' && ctrl.grounded && !ctrl.where && ctrl.feel) {
      this.dist += (ctrl.speed || 0) * dt;
      if (this.dist > STRIDE) { this.dist = 0; if (ctrl.feel.print > 0.05 || ctrl.feel.dust > 0.05) this.step(x, y, z, ctrl.facing, ctrl.feel); }
      if (ctrl.sliding > 0.2) for (let k = 0; k < 3; k++) this.spawn(x + (Math.random() - 0.5) * 0.8, y + 0.05, z + (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.5, 0.15, (Math.random() - 0.5) * 0.5, 0.6, 0.07, 0.25);
    } else this.dist = 0;
    // prints fill in, faster when it's blowing
    const ws = Math.hypot(wind[0], wind[1]), erode = 1 + ws * ws * 0.05;
    let any = false; for (let i = 0; i < this.at.length; i++) { const P = this.at[i]; if (!P || P.born > P.life) continue; P.born += dt * erode; this.aFade.setX(i, P.strength * Math.max(0, 1 - (P.born / P.life) ** 2)); any = true; }
    if (any) this.aFade.needsUpdate = true;
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
