// Draws vehicles: each catalogue type's model (assets/vehicles.json → 'veh_<id>' in the
// asset library), instanced, fitted to its type's box at its logical position, heading and
// (for the one being ridden) pitch and lean. Paint per vehicle; taxis and limousines wear their own.
import * as THREE from 'three';
import { TYPES } from '../gen/vehicles.js';
import { PAINTS_VEHICLE } from './props.js';

const MAX = 120;
export class VehicleView {
  constructor(lib) {
    this.group = new THREE.Group(); this.group.name = 'vehicles';
    this.types = {};
    for (const T of Object.values(TYPES)) {
      const v = lib ? [...lib.variants.values()].find(x => x.kind === 'veh_' + T.id) : null;
      const prims = v ? v.prims : [{ geometry: new THREE.BoxGeometry(T.L, T.H * 0.6, T.W).translate(T.L / 2, T.H * 0.5, T.W / 2), material: new THREE.MeshStandardMaterial({ color: 0x999999 }), tinted: true }];
      const dims = v ? v.dims : [T.L, T.W, T.H];
      const fit = new THREE.Matrix4().makeScale(T.L / dims[0], T.H / dims[2], T.W / dims[1]).premultiply(new THREE.Matrix4().makeTranslation(-T.L / 2, 0, -T.W / 2));
      this.types[T.id] = { T, fit, meshes: null, prims };
    }
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler(0, 0, 0, 'YZX'); this._c = new THREE.Color();
  }
  meshesFor(K) {
    if (K.meshes) return K.meshes;
    K.meshes = K.prims.map(pr => {
      const im = new THREE.InstancedMesh(pr.geometry, pr.material, MAX);
      im.count = 0; im.frustumCulled = false; im.castShadow = true; im.receiveShadow = true;
      if (pr.tinted) im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
      this.group.add(im); return { im, tinted: pr.tinted };
    });
    return K.meshes;
  }
  // list: [{ type, pos (render space), facing, pitch?, roll?, colour }]
  update(list) {
    const n = {};
    for (const v of list) {
      const K = this.types[v.type || 'speeder']; if (!K) continue;
      const i = n[K.T.id] ?? 0; if (i >= MAX) continue;
      const M = this.meshesFor(K);
      // heading (sin f, cos f) is the model's +x: yaw f − 90°; then nose up (about z), lean (about x)
      this._e.set(v.roll || 0, v.facing - Math.PI / 2, v.pitch || 0);
      this._m.compose(new THREE.Vector3(v.pos[0], v.pos[1], v.pos[2]), this._q.setFromEuler(this._e), new THREE.Vector3(1, 1, 1)).multiply(K.fit);
      const c = K.T.paint || PAINTS_VEHICLE[((v.colour % PAINTS_VEHICLE.length) + PAINTS_VEHICLE.length) % PAINTS_VEHICLE.length];
      for (const { im, tinted } of M) { im.setMatrixAt(i, this._m); if (tinted) im.setColorAt(i, this._c.setRGB(c[0], c[1], c[2])); }
      n[K.T.id] = i + 1;
    }
    for (const K of Object.values(this.types)) if (K.meshes) for (const { im, tinted } of K.meshes) {
      im.count = n[K.T.id] || 0; im.instanceMatrix.needsUpdate = true; if (tinted && im.instanceColor) im.instanceColor.needsUpdate = true;
    }
  }
}
