// Draws vehicles: the 'speeder' model from the asset library, instanced, each fitted to
// SPEEDER's box at its logical position, heading, and (for the one being ridden) its
// pitch and lean. Falls back to a plain box if the library didn't load.
import * as THREE from 'three';
import { SPEEDER } from '../gen/vehicles.js';
import { PAINTS_VEHICLE } from './props.js';

const MAX = 160;
export class VehicleView {
  constructor(lib) {
    this.group = new THREE.Group(); this.group.name = 'vehicles';
    const v = lib ? [...lib.variants.values()].find(x => x.kind === 'speeder') : null;
    const prims = v ? v.prims : [{ geometry: new THREE.BoxGeometry(SPEEDER.L, 0.5, SPEEDER.W).translate(SPEEDER.L / 2, 0.6, SPEEDER.W / 2), material: new THREE.MeshStandardMaterial({ color: 0x999999 }), tinted: true }];
    const dims = v ? v.dims : [SPEEDER.L, SPEEDER.W, SPEEDER.H];
    // model frame: x rear→nose, z across, origin at the rear-left ground corner → centre it, fit it
    this.fit = new THREE.Matrix4().makeScale(SPEEDER.L / dims[0], SPEEDER.H / dims[2], SPEEDER.W / dims[1]).premultiply(new THREE.Matrix4().makeTranslation(-SPEEDER.L / 2, 0, -SPEEDER.W / 2));
    this.meshes = prims.map(pr => {
      const im = new THREE.InstancedMesh(pr.geometry, pr.material, MAX);
      im.count = 0; im.frustumCulled = false; im.castShadow = true; im.receiveShadow = true;
      if (pr.tinted) im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
      this.group.add(im); return { im, tinted: pr.tinted };
    });
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler(0, 0, 0, 'YZX'); this._c = new THREE.Color();
  }
  // list: [{ pos (render space), facing, pitch?, roll?, colour }]
  update(list) {
    let n = 0;
    for (const v of list) {
      if (n >= MAX) break;
      // heading (sin f, cos f) is the model's +x: yaw f − 90°; then nose up (about z), lean (about x)
      this._e.set(v.roll || 0, v.facing - Math.PI / 2, v.pitch || 0);
      this._m.compose(new THREE.Vector3(v.pos[0], v.pos[1], v.pos[2]), this._q.setFromEuler(this._e), new THREE.Vector3(1, 1, 1)).multiply(this.fit);
      const c = PAINTS_VEHICLE[v.colour % PAINTS_VEHICLE.length];
      for (const { im, tinted } of this.meshes) { im.setMatrixAt(n, this._m); if (tinted) im.setColorAt(n, this._c.setRGB(c[0], c[1], c[2])); }
      n++;
    }
    for (const { im, tinted } of this.meshes) { im.count = n; im.instanceMatrix.needsUpdate = true; if (tinted && im.instanceColor) im.instanceColor.needsUpdate = true; }
  }
}
