// The country's farms, mines, masts and ruins near you (gen/outposts.js), from the shared kit.
// Rebuilt when you've moved a way; far ones are simply not there yet, past the haze.
import * as THREE from 'three';
import { sitesNear } from '../gen/outposts.js';
import { kitTint } from './city.js';

const R = 1500, FAR_ONLY = /^(windmillbig|pylon|radiomast|lighthouse|grainsilo|headframe|barn|watchtower|greenhouse|drillrig|ruinwall|bunker|solarfield|substation|fuelcanopy)/, NEAR = 500;
export class OutpostView {
  constructor(planet, lib, kitOf) { Object.assign(this, { planet, lib, kitOf }); this.group = new THREE.Group(); this.group.name = 'outposts'; this.at = null; this.count = 0; }
  update(x, z) {
    if (this.at && Math.hypot(this.at[0] - x, this.at[1] - z) < 120) return; this.at = [x, z];
    this.group.traverse(o => { if (o.isInstancedMesh) o.dispose(); }); this.group.clear();
    const by = new Map(); let n = 0;
    sitesNear(this.planet, x, z, R, s => { const d = Math.hypot(s.x - x, s.z - z); if (d > R) return; for (const it of s.items) { if (d > NEAR && !FAR_ONLY.test(it.k)) continue; (by.get(it.k) || by.set(it.k, []).get(it.k)).push(it); n++; } });
    this.count = n;
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(1, 1, 1), P = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), col = new THREE.Color();
    for (const [k, list] of by) {
      const parts = this.kitOf(k); if (!parts) continue;
      for (const part of parts) {
        const im = new THREE.InstancedMesh(part.geometry, part.material, list.length);
        list.forEach((it, q) => { M.compose(P.set(it.x, it.y, it.z), Q.setFromAxisAngle(up, it.rot), S); im.setMatrixAt(q, M); if (part.tinted) im.setColorAt(q, col.setRGB(...kitTint(part.tinted, k, it.x, it.z))); });
        im.computeBoundingSphere(); im.castShadow = !!part.cast; im.receiveShadow = true; this.group.add(im);
      }
    }
  }
}
