// The ledges of the wall you're on, as real geometry: string courses, bands and rails round the
// climber. (Everything else on a facade is drawn by the shader; these are what your hands touch.)
import * as THREE from 'three';

const R = 10, MAX = 60;
export class HoldsView {
  constructor() {
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x5a5d60, roughness: 0.7, metalness: 0.3 }), MAX);
    this.mesh.frustumCulled = false; this.mesh.count = 0; this.mesh.castShadow = true; this.mesh.receiveShadow = true; this.mesh.name = 'holds';
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._up = new THREE.Vector3(0, 1, 0); this._p = new THREE.Vector3(); this._s = new THREE.Vector3();
  }
  update(climber, toRender) {
    if (!climber) { this.mesh.count = 0; return; }
    let n = 0; const P = climber.pelvis, faces = new Set([climber.face]); for (const k of ['lh', 'rh', 'lf', 'rf']) { const f = climber.limb[k].hold?.face; if (f) faces.add(f); }
    for (const f of faces) {
      const a = (P[0] - f.o[0]) * f.t[0] + (P[2] - f.o[1]) * f.t[1], a0 = Math.max(0, a - R), a1 = Math.min(f.w, a + R); if (a1 <= a0) continue;
      const rot = Math.atan2(f.t[0], f.t[1]);
      for (const r of f.rows) {
        if (Math.abs(r.y - P[1]) > R || r.kind === 'ground' || n >= MAX) continue;
        const c = (a0 + a1) / 2, p = toRender(f.o[0] + f.t[0] * c + f.n[0] * 0.05, r.y - 0.03, f.o[1] + f.t[1] * c + f.n[1] * 0.05);
        this._m.compose(this._p.set(...p), this._q.setFromAxisAngle(this._up, rot), this._s.set(0.11, r.kind === 'rail' ? 0.035 : 0.06, a1 - a0)); this.mesh.setMatrixAt(n++, this._m);
      }
    }
    this.mesh.count = n; this.mesh.instanceMatrix.needsUpdate = true;
  }
}
