// Draws ships: the 'shuttle' model and its boarding ramp from the asset library, placed
// by the ship's logical frame (landed) or its flight state (centre, heading, pitch, roll).
// The model is built in the ship frame, so it needs no fitting; the ramp swings about
// its hinge at the deck edge.
import * as THREE from 'three';
import { shipPlan } from '../gen/ships.js';
import { PAINTS_VEHICLE } from './props.js';

const MAX = 8;
export class ShipView {
  constructor(lib) {
    this.group = new THREE.Group(); this.group.name = 'ships';
    const L = shipPlan().layout, find = k => lib ? [...lib.variants.values()].find(v => v.kind === k) : null;
    const hull = find('shuttle'), ramp = find('shuttle_ramp');
    const box = (w, h, d, x, y, z) => [{ geometry: new THREE.BoxGeometry(w, h, d).translate(x, y, z), material: new THREE.MeshStandardMaterial({ color: 0xaaaaaa }), tinted: true }];
    const mk = prims => prims.map(pr => {
      const im = new THREE.InstancedMesh(pr.geometry, pr.material, MAX);
      im.count = 0; im.frustumCulled = false; im.castShadow = true; im.receiveShadow = true;
      if (pr.tinted) im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
      this.group.add(im); return { im, tinted: pr.tinted };
    });
    this.hull = mk(hull ? hull.prims : box(5.6, 3.4, 15.5, L.W / 2, 2.9, 12.5));
    this.ramp = mk(ramp ? ramp.prims : box(1.9, 0.1, 4, 5, 0.8, 3.1));
    this.L = L;
    this.hinge = new THREE.Vector3((L.ramp.x0 + L.ramp.x1) / 2, L.deck, L.ramp.z1);
    const down = new THREE.Vector3(0, -L.deck, L.ramp.z0 - L.ramp.z1).normalize();
    this.raise = new THREE.Quaternion().setFromUnitVectors(down, new THREE.Vector3(0, 1, 0));   // lowered → standing up, closing the door
    this.anim = new Map();      // ship id → ramp openness 0..1
    this._m = new THREE.Matrix4(); this._r = new THREE.Matrix4(); this._c = new THREE.Color(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler(0, 0, 0, 'YXZ');
  }
  // list: [{ id, c (render space ground point under the centre), facing, pitch?, roll?, colour, rampDown }]
  update(list, dt) {
    let n = 0;
    const { W, D } = this.L;
    for (const s of list) {
      if (n >= MAX) break;
      this._e.set(-(s.pitch || 0), s.facing, s.roll || 0);
      this._m.compose(new THREE.Vector3(...s.c), this._q.setFromEuler(this._e), new THREE.Vector3(1, 1, 1)).multiply(new THREE.Matrix4().makeTranslation(-W / 2, 0, -D / 2));
      const col = PAINTS_VEHICLE[s.colour % PAINTS_VEHICLE.length];
      this._c.setRGB(col[0], col[1], col[2]);
      for (const { im, tinted } of this.hull) { im.setMatrixAt(n, this._m); if (tinted) im.setColorAt(n, this._c); }
      let a = this.anim.get(s.id) ?? (s.rampDown ? 1 : 0);
      a += Math.max(-dt / 2.5, Math.min(dt / 2.5, (s.rampDown ? 1 : 0) - a)); this.anim.set(s.id, a);
      const q = new THREE.Quaternion().slerp(this.raise, 1 - a);       // 1 = down (as built), 0 = raised
      this._r.copy(this._m).multiply(new THREE.Matrix4().makeTranslation(this.hinge.x, this.hinge.y, this.hinge.z))
        .multiply(new THREE.Matrix4().makeRotationFromQuaternion(q)).multiply(new THREE.Matrix4().makeTranslation(-this.hinge.x, -this.hinge.y, -this.hinge.z));
      for (const { im, tinted } of this.ramp) { im.setMatrixAt(n, this._r); if (tinted) im.setColorAt(n, this._c); }
      n++;
    }
    for (const { im, tinted } of [...this.hull, ...this.ramp]) { im.count = n; im.instanceMatrix.needsUpdate = true; if (tinted && im.instanceColor) im.instanceColor.needsUpdate = true; }
  }
  rampOpen(id) { return (this.anim.get(id) ?? 1) > 0.98; }
}
