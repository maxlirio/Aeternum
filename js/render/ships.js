// Draws ships: each model's hull and boarding ramp from the asset library, placed by the
// ship's logical frame (landed) or its flight state (centre, heading, pitch, roll). Models
// are built in their ship frame, so they need no fitting; a ramp swings about its hinge.
import { share } from './share.js';
import * as THREE from 'three';
import { shipPlan, LAYOUTS } from '../gen/ships.js';
import { PAINTS_VEHICLE } from './props.js';

const MAX = 10;
export class ShipView {
  constructor(lib) {
    this.group = new THREE.Group(); this.group.name = 'ships';
    const find = k => lib ? [...lib.variants.values()].find(v => v.kind === k) : null;
    const mk = prims => prims.map(pr => {
      const im = new THREE.InstancedMesh(share(pr.geometry), pr.material, MAX);
      im.count = 0; im.frustumCulled = false; im.castShadow = true; im.receiveShadow = true;
      if (pr.tinted) im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
      this.group.add(im); return { im, tinted: pr.tinted };
    });
    this.models = {};
    for (const model of Object.keys(LAYOUTS)) {
      const L = shipPlan(model).layout, hull = find(model), ramp = find(model + '_ramp');
      const box = (w, h, d, x, y, z) => [{ geometry: new THREE.BoxGeometry(w, h, d).translate(x, y, z), material: new THREE.MeshStandardMaterial({ color: 0xaaaaaa }), tinted: true }];
      const [hx0, hz0, hx1, hz1] = L.hull;
      const hinge = new THREE.Vector3((L.ramp.x0 + L.ramp.x1) / 2, L.deck, L.ramp.z1);
      const down = new THREE.Vector3(0, -L.deck, L.ramp.z0 - L.ramp.z1).normalize();
      this.models[model] = {
        L, hinge, raise: new THREE.Quaternion().setFromUnitVectors(down, new THREE.Vector3(0, 1, 0)),
        hullPrims: hull ? hull.prims : [],
        hull: mk(hull ? hull.prims : box(hx1 - hx0 + 0.6, L.ceiling - L.deck + 1, hz1 - hz0, (hx0 + hx1) / 2, (L.deck + L.ceiling) / 2, (hz0 + hz1) / 2)),
        ramp: mk(ramp ? ramp.prims : box(L.ramp.x1 - L.ramp.x0, 0.1, L.ramp.z1 - L.ramp.z0, hinge.x, L.deck / 2, (L.ramp.z0 + L.ramp.z1) / 2)),
      };
    }
    this.anim = new Map();      // ship id → ramp openness 0..1
    this._m = new THREE.Matrix4(); this._r = new THREE.Matrix4(); this._c = new THREE.Color(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler(0, 0, 0, 'YXZ');
  }
  // list: [{ id, model, c (render space ground point under the centre), facing, pitch?, roll?, colour, rampDown }]
  update(list, dt) {
    const n = {};
    for (const s of list) {
      const M = this.models[s.model || 'shuttle']; if (!M || this.hidden?.(s)) continue; if (this.viewer && Math.hypot(s.c[0] - this.viewer[0], s.c[2] - this.viewer[2]) > 2400) continue;     // (too far to see)
      const i = n[s.model || 'shuttle'] = (n[s.model || 'shuttle'] ?? 0); if (i >= MAX) continue;
      const { W, D } = M.L;
      this._e.set(-(s.pitch || 0), s.facing, s.roll || 0);
      this._m.compose(new THREE.Vector3(...s.c), this._q.setFromEuler(this._e), new THREE.Vector3(1, 1, 1)).multiply(new THREE.Matrix4().makeTranslation(-W / 2, 0, -D / 2));
      const col = PAINTS_VEHICLE[s.colour % PAINTS_VEHICLE.length];
      this._c.setRGB(col[0], col[1], col[2]);
      for (const { im, tinted } of M.hull) { im.setMatrixAt(i, this._m); if (tinted) im.setColorAt(i, this._c); }
      let a = this.anim.get(s.id) ?? (s.rampDown ? 1 : 0);
      a += Math.max(-dt / 2.5, Math.min(dt / 2.5, (s.rampDown ? 1 : 0) - a)); this.anim.set(s.id, a);
      const q = new THREE.Quaternion().slerp(M.raise, 1 - a), h = M.hinge;
      this._r.copy(this._m).multiply(new THREE.Matrix4().makeTranslation(h.x, h.y, h.z)).multiply(new THREE.Matrix4().makeRotationFromQuaternion(q)).multiply(new THREE.Matrix4().makeTranslation(-h.x, -h.y, -h.z));
      for (const { im, tinted } of M.ramp) { im.setMatrixAt(i, this._r); if (tinted) im.setColorAt(i, this._c); }
      n[s.model || 'shuttle']++;
    }
    for (const [model, M] of Object.entries(this.models)) for (const { im, tinted } of [...M.hull, ...M.ramp]) {
      im.count = n[model] || 0; im.instanceMatrix.needsUpdate = true; if (tinted && im.instanceColor) im.instanceColor.needsUpdate = true;
    }
  }
  rampOpen(id) { return (this.anim.get(id) ?? 1) > 0.98; }
}
