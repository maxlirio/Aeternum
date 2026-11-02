// Draws the plants and boulders of gen/flora.js: full models near the player, a light
// stand-in for trees further out, nothing beyond. Tiles are generated a few per frame
// as you move, so nothing stalls; instance buffers are rebuilt when you've moved far
// enough to matter. Leaves take the planet's own grass colour.
import * as THREE from 'three';
import { floraTile, TILE, grassTile, GTILE } from '../gen/flora.js';

const NEAR = { conifer: 170, broadleaf: 170, shrub: 95, boulder: 320 };   // full model within (m)
const FAR = 1100;                                                         // trees as stand-ins out to (m)
const LEAFY = new Set(['leafcard', 'needlecard', 'leaf', 'impconifer', 'impbroadleaf']);

export class FloraView {
  constructor(lib, planet) {
    this.planet = planet; this.group = new THREE.Group(); this.group.name = 'flora';
    this.kinds = {};
    const v = k => lib && [...lib.variants.values()].find(x => x.kind === k);
    for (const k of ['conifer', 'broadleaf', 'shrub', 'boulder', 'conifer_far', 'broadleaf_far']) {
      const va = v(k); if (!va) continue;
      this.kinds[k] = { dims: va.dims, prims: va.prims.map(pr => ({ pr, im: null, leafy: LEAFY.has(pr.slot) })), list: [] };
    }
    const g = planet.climate.grass, l = Math.max(...g);
    this.leafBase = new THREE.Color(g[0] / l, g[1] / l, g[2] / l).lerp(new THREE.Color(1, 1, 1), 0.35);   // the planet's green, kept bright enough to tint by
    this.at = null; this.tiles = new Map(); this.queue = [];
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._c = new THREE.Color(); this.up = new THREE.Vector3(0, 1, 0);
  }
  get ok() { return !!this.kinds.conifer; }
  update(x, z) {
    if (!this.ok) return;
    // generate missing tiles around, nearest first, a few per frame
    const R = Math.ceil(FAR / TILE), ti = Math.floor(x / TILE), tj = Math.floor(z / TILE);
    if (!this.at || Math.hypot(x - this.at[0], z - this.at[1]) > 30 || this.queue.length) {
      if (!this.queue.length && (!this.at || Math.hypot(x - this.at[0], z - this.at[1]) > 30)) {
        for (let a = -R; a <= R; a++) for (let b = -R; b <= R; b++) {
          const k = (ti + a) + ',' + (tj + b);
          if (!this.tiles.has(k) && (a * a + b * b) * TILE * TILE <= (FAR + TILE) ** 2) this.queue.push([ti + a, tj + b, a * a + b * b]);
        }
        this.queue.sort((p, q) => q[2] - p[2]);
      }
      const t0 = performance.now();
      while (this.queue.length && performance.now() - t0 < 6) { const [a, b] = this.queue.pop(); this.tiles.set(a + ',' + b, floraTile(this.planet, a, b)); }
      if (!this.at || Math.hypot(x - this.at[0], z - this.at[1]) > 30 || !this.queue.length) this.rebuild(x, z);
    }
  }
  rebuild(x, z) {
    this.at = [x, z];
    for (const k in this.kinds) this.kinds[k].list.length = 0;
    for (const [key, list] of this.tiles) {
      const [a, b] = key.split(',').map(Number);
      if (Math.abs((a + 0.5) * TILE - x) > FAR + TILE || Math.abs((b + 0.5) * TILE - z) > FAR + TILE) { this.tiles.delete(key); continue; }
      for (const p of list) {
        const d = Math.hypot(p.x - x, p.z - z);
        if (d < NEAR[p.sp]) this.kinds[p.sp].list.push(p);
        else if ((p.sp === 'conifer' || p.sp === 'broadleaf') && d < FAR) this.kinds[p.sp + '_far']?.list.push(p);
      }
    }
    for (const k in this.kinds) this.fill(this.kinds[k]);
  }
  fill(K) {
    const n = K.list.length, [L, D, H] = K.dims;
    for (const P of K.prims) {
      if (!P.im || P.im.instanceMatrix.count < n) {
        if (P.im) { this.group.remove(P.im); P.im.dispose(); }
        const cap = Math.max(64, Math.ceil(n * 1.4));
        P.im = new THREE.InstancedMesh(P.pr.geometry, P.pr.material, cap); P.im.frustumCulled = false; P.im.castShadow = true; P.im.receiveShadow = true;
        if (P.leafy) P.im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
        this.group.add(P.im);
      }
    }
    K.list.forEach((p, i) => {
      const s = p.size / H, sx = s * (0.85 + 0.3 * p.tint);
      this._q.setFromAxisAngle(this.up, p.rot);
      this._m.compose(new THREE.Vector3(p.x, p.y - 0.05, p.z), this._q, new THREE.Vector3(sx, s, sx)).multiply(new THREE.Matrix4().makeTranslation(-L / 2, 0, -D / 2));
      this._c.copy(this.leafBase).multiplyScalar(p.sp === 'conifer' ? 0.62 + 0.2 * p.tint : 0.78 + 0.3 * p.tint);
      if (p.sp === 'shrub') this._c.lerp(new THREE.Color(0.75, 0.68, 0.45), 0.25 * p.tint);
      for (const P of K.prims) { P.im.setMatrixAt(i, this._m); if (P.leafy) P.im.setColorAt(i, this._c); }
    });
    for (const P of K.prims) { P.im.count = n; P.im.instanceMatrix.needsUpdate = true; if (P.leafy) P.im.instanceColor.needsUpdate = true; }
  }
}

// Grass clumps around the player: three crossed cards of blades, tinted between the
// planet's green and its dry colour, swaying a little. Rebuilt as you walk.
const GR = 40;
export class GrassView {
  constructor(planet, base = './assets/') {
    this.planet = planet;
    const g = new THREE.BufferGeometry(), P = [], U = [], I = [];
    for (let k = 0; k < 3; k++) {
      const a = k * Math.PI / 3, cx = Math.cos(a) * 0.35, cz = Math.sin(a) * 0.35, o = P.length / 3;
      P.push(-cx, 0, -cz, cx, 0, cz, cx, 0.5, cz, -cx, 0.5, -cz); U.push(0, 0, 1, 0, 1, 1, 0, 1); I.push(o, o + 1, o + 2, o, o + 2, o + 3);
    }
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); g.setIndex(I);
    g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(P.length).fill(0).map((_, i) => i % 3 === 1 ? 1 : 0), 3));   // lit like the ground
    const t = new THREE.TextureLoader().load(base + 'materials/grass_blades.png'); t.colorSpace = THREE.SRGBColorSpace;
    this.time = { value: 0 };
    const m = new THREE.MeshStandardMaterial({ map: t, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.9 });
    m.onBeforeCompile = sh => {
      sh.uniforms.uTime = this.time;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vec4 ip = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          transformed.x += sin(uTime * 1.7 + ip.x * 0.31 + ip.z * 0.17) * 0.07 * uv.y;
          transformed.z += cos(uTime * 1.3 + ip.z * 0.29) * 0.05 * uv.y;`);
    };
    this.cap = 45000;
    this.mesh = new THREE.InstancedMesh(g, m, this.cap); this.mesh.frustumCulled = false; this.mesh.receiveShadow = true; this.mesh.count = 0;
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.cap * 3), 3);
    const C = planet.climate, l = v => { const k = Math.max(...v); return new THREE.Color(v[0] / k, v[1] / k, v[2] / k); };
    this.green = l(C.grass).lerp(new THREE.Color(1, 1, 1), 0.3); this.dry = l(C.dry).lerp(new THREE.Color(1, 1, 1), 0.2);
    this.at = null; this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._c = new THREE.Color(); this.up = new THREE.Vector3(0, 1, 0);
  }
  update(x, z, dt) {
    this.time.value += dt;
    if (this.at && Math.hypot(x - this.at[0], z - this.at[1]) < 6) return;
    this.at = [x, z];
    let n = 0;
    const t0 = Math.floor((x - GR) / GTILE), t1 = Math.floor((x + GR) / GTILE), u0 = Math.floor((z - GR) / GTILE), u1 = Math.floor((z + GR) / GTILE);
    for (let ti = t0; ti <= t1; ti++) for (let tj = u0; tj <= u1; tj++) {
      const A = grassTile(this.planet, ti, tj);
      for (let i = 0; i < A.length && n < this.cap; i += 5) {
        const d = Math.hypot(A[i] - x, A[i + 2] - z); if (d > GR) continue;
        const s = A[i + 3] * Math.min(1, (GR - d) / 10);          // shrink out toward the edge instead of popping
        this._q.setFromAxisAngle(this.up, A[i] * 7.3 + A[i + 2]);
        this._m.compose(new THREE.Vector3(A[i], A[i + 1] - 0.06, A[i + 2]), this._q, new THREE.Vector3(s, s, s));
        this.mesh.setMatrixAt(n, this._m);
        this.mesh.setColorAt(n, this._c.copy(this.dry).lerp(this.green, A[i + 4]).multiplyScalar(0.75 + 0.25 * ((A[i] * 13.1) % 1)));
        n++;
      }
    }
    this.mesh.count = n; this.mesh.instanceMatrix.needsUpdate = true; this.mesh.instanceColor.needsUpdate = true;
  }
}
