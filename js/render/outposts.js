// The country's farms, mines, masts and ruins near you (gen/outposts.js), from the shared kit.
// Rebuilt when you've moved a way; far ones are simply not there yet, past the haze.
import * as THREE from 'three';
import { sitesNear } from '../gen/outposts.js';
import { kitTint } from './city.js';
import { surfaceAt } from '../gen/surface.js';

const R = 1500, FAR_ONLY = /^(fam_(cottage|hut|longhouse|shop|shrine|monument|watertower|windpump|coolingtower|column|spheretank|gate)|windmillbig|pylon|radiomast|lighthouse|grainsilo|headframe|barn|watchtower|greenhouse|drillrig|ruinwall|bunker|solarfield|substation|fuelcanopy)/, NEAR = 500;
export class OutpostView {
  constructor(planet, lib, kitOf) { Object.assign(this, { planet, lib, kitOf }); this.group = new THREE.Group(); this.group.name = 'outposts'; this.at = null; this.count = 0; }
  // the lanes people have worn between their houses: laid over the land, a little proud of it
  layLanes(x, z) {
    const pos = [], uv = [], col = [], idx = [];
    sitesNear(this.planet, x, z, NEAR + 300, s => { if (!s.lanes?.length || Math.hypot(s.x - x, s.z - z) > NEAR + 300) return;
      for (const [x0, z0, x1, z1, w] of s.lanes) { const L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.ceil(L / 3)), ux = (x1 - x0) / L, uz = (z1 - z0) / L, b = pos.length / 3;
        for (let i = 0; i <= n; i++) { const t = i / n, f = t * L, wob = Math.sin(f * 0.09) * 1.1 + Math.sin(f * 0.031 + 2) * 1.6, W = w * (0.85 + 0.15 * Math.sin(f * 0.21)), cx = x0 + ux * f - uz * wob, cz = z0 + uz * f + ux * wob;
          for (const q of [-1, -0.45, 0.45, 1]) { const px = cx - uz * W * q, pz = cz + ux * W * q; pos.push(px, surfaceAt(this.planet, px, pz).h + 0.05, pz); uv.push(px, pz); col.push(1, 1, 1, Math.abs(q) === 1 ? 0 : 0.92); } }
        for (let i = 0; i < n; i++) for (let j = 0; j < 3; j++) { const a = b + i * 4 + j, c = a + 4; idx.push(a, a + 1, c, a + 1, c + 1, c); }
      } });
    if (!idx.length) return;
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4)); g.setIndex(idx); g.computeVertexNormals();
    if (!this.laneMat) { const b = this.lib?.surface('dirt'); this.laneMat = b ? b.clone() : new THREE.MeshStandardMaterial({ color: 0x776a55, roughness: 1 }); this.laneMat.vertexColors = true; this.laneMat.transparent = true; this.laneMat.depthWrite = false; }     // fades out into the grass at its edges
    const m = new THREE.Mesh(g, this.laneMat); m.receiveShadow = true; m.name = 'lanes'; this.group.add(m);
  }
  update(x, z) {
    if (this.at && Math.hypot(this.at[0] - x, this.at[1] - z) < 120) return; this.at = [x, z];
    this.group.traverse(o => { if (o.isInstancedMesh) o.dispose(); else if (o.name === 'lanes') o.geometry.dispose(); }); this.group.clear();
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
    this.layLanes(x, z);
  }
}
