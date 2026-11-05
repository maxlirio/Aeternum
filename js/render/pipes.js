// Drainpipes on the city's walls, as real pipes you can see and climb (the same ones gen/holds.js gives your hands). Drawn near you only: thin
// things, they'd be nothing but cost from further off.
import * as THREE from 'three';
import { facesNear } from '../gen/holds.js';

const R = 70, MAX = 260, BRACKET = 2.4;
export class PipeView {
  constructor() {
    this.group = new THREE.Group(); this.group.name = 'pipes';
    const m = new THREE.MeshStandardMaterial({ color: 0x8d9193, roughness: 0.6, metalness: 0.45 });
    this.pipe = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.048, 0.048, 1, 8), m, MAX); this.brk = new THREE.InstancedMesh(new THREE.BoxGeometry(0.15, 0.04, 0.12), m, MAX * 8);
    for (const q of [this.pipe, this.brk]) { q.frustumCulled = false; q.castShadow = true; q.receiveShadow = true; q.count = 0; this.group.add(q); }
    this.at = null; this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._v = new THREE.Vector3(); this._s = new THREE.Vector3(1, 1, 1);
  }
  update(world, x, y, z) {
    if (this.at && Math.abs(x - this.at[0]) + Math.abs(z - this.at[1]) + Math.abs(y - this.at[2]) < 8) return; this.at = [x, z, y];
    let n = 0, b = 0;
    const seen = new Set(); facesNear(world, x, y, z, R, f => seen.add(f));
    for (const f of seen) { if (!f.pipes?.length || f.y1 - f.y0 < 3) continue;
      for (const a of f.pipes) { if (n >= MAX) break;
        const px = f.o[0] + f.t[0] * a + f.n[0] * 0.09, pz = f.o[1] + f.t[1] * a + f.n[1] * 0.09; if (Math.hypot(px - x, pz - z) > R) continue;
        const y0 = f.y0 + 0.2, y1 = Math.min(f.y1, Math.max(y0 + 2, y + 150)); this._s.set(1, y1 - y0, 1); this.pipe.setMatrixAt(n++, this._m.compose(this._v.set(px, (y0 + y1) / 2, pz), this._q.identity(), this._s));
        for (let q = Math.max(y0 + 1, y - 40); q < Math.min(y1, y + 40) && b < MAX * 8; q += BRACKET) { const yb = Math.round(q / BRACKET) * BRACKET; this._s.set(1, 1, 1); this._q.setFromAxisAngle(this._v.set(0, 1, 0), Math.atan2(f.n[0], f.n[1])); this.brk.setMatrixAt(b++, this._m.compose(this._v.set(px - f.n[0] * 0.05, yb, pz - f.n[1] * 0.05), this._q, this._s)); }
      } }
    this.pipe.count = n; this.brk.count = b; this.pipe.instanceMatrix.needsUpdate = true; this.brk.instanceMatrix.needsUpdate = true;
  }
}
