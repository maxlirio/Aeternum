// Draws the plants and boulders of gen/flora.js: full models near the player, a light
// stand-in for trees further out, nothing beyond. Tiles are generated a few per frame
// as you move, so nothing stalls; instance buffers are rebuilt when you've moved far
// enough to matter. Leaves take the planet's own grass colour.
import * as THREE from 'three';
import { floraTile, TILE } from '../gen/flora.js';

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
