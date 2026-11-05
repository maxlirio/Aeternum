// The country's farms, mines, masts and ruins near you (gen/outposts.js), from the shared kit.
// Rebuilt when you've moved a way; far ones are simply not there yet, past the haze.
import { cultureOf } from '../gen/culture.js';
import { share } from './share.js';
import * as THREE from 'three';
import { sitesNear } from '../gen/outposts.js';
import { kitTint } from './city.js';
import { surfaceAt } from '../gen/surface.js';

const PLANTS = 340, R = 1500, FAR_ONLY = /^(gb_(?!step)|sm_(shrine|monument|watertower|gate|windpump|poweredge)|fam_(coolingtower|column|spheretank|gate)|windmillbig|pylon|radiomast|lighthouse|grainsilo|headframe|barn|watchtower|greenhouse|drillrig|ruinwall|bunker|solarfield|substation|fuelcanopy)/, NEAR = 500;
export class OutpostView {
  constructor(planet, lib, kitOf) { Object.assign(this, { planet, lib, kitOf }); this.where = new Map(); this.hidden = new Set(); this.group = new THREE.Group(); this.group.name = 'outposts'; this.at = null; this.count = 0; }
  // fields: tilled soil laid over the land, and the crop planted row by row on it, so a field follows any ground
  sowFields(x, z) {
    const pos = [], uv = [], col = [], idx = [], plants = new Map();
    sitesNear(this.planet, x, z, NEAR + 200, s => { if (!s.fields?.length || Math.hypot(s.x - x, s.z - z) > NEAR + 200) return;
      for (const f of s.fields) { const c = Math.cos(f.rot), sn = Math.sin(f.rot), [A, B] = f.box, world = (u, v) => [f.x + u * c + v * sn, f.z - u * sn + v * c], cell = 2.5, nu = Math.ceil(2 * A / cell), nv = Math.ceil(2 * B / cell), b = pos.length / 3;
        for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv; j++) { const u = -A + 2 * A * i / nu, v = -B + 2 * B * j / nv, [px, pz] = world(u, v), edge = i === 0 || j === 0 || i === nu || j === nv; pos.push(px, surfaceAt(this.planet, px, pz).h + 0.06, pz); uv.push(u, v); col.push(1, 1, 1, edge ? 0 : 0.97); }
        for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) { const a = b + i * (nv + 1) + j, d = a + nv + 1; idx.push(a, a + 1, d, a + 1, d + 1, d); }
        const list = plants.get(f.crop) || plants.set(f.crop, []).get(f.crop), row = 1.5, step = 0.95;
        if (Math.hypot(f.x - x, f.z - z) > PLANTS) continue;                     // from further off, the soil's colour is all you'd see
        for (let v = -B + 1; v <= B - 1; v += row) for (let u = -A + 1; u <= A - 1; u += step) { const w = 0.5 + 0.5 * Math.sin(u * 12.9 + v * 78.2), [px, pz] = world(u + (w - 0.5) * 0.25, v + (0.5 - w) * 0.14); list.push([px, surfaceAt(this.planet, px, pz).h + 0.03, pz, w * 6.28, 0.82 + 0.36 * w]); }
      } });
    if (idx.length) {
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4)); g.setIndex(idx); g.computeVertexNormals();
      if (!this.soilMat) { const b = this.lib?.surface('soil'); this.soilMat = b ? b.clone() : new THREE.MeshStandardMaterial({ color: 0x3a2a1e, roughness: 1 }); this.soilMat.vertexColors = true; this.soilMat.transparent = true; this.soilMat.polygonOffset = true; this.soilMat.polygonOffsetFactor = -3; this.soilMat.polygonOffsetUnits = -12; this.soilMat.depthWrite = false; }
      const m = new THREE.Mesh(g, this.soilMat); m.receiveShadow = true; m.name = 'lanes'; this.group.add(m);
    }
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), S = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), tint = new THREE.Color();
    for (const [k, list] of plants) { const parts = this.kitOf(k); if (!parts) continue;
      for (const part of parts) { const im = new THREE.InstancedMesh(share(part.geometry), part.material, list.length);
        list.forEach(([px, py, pz, r, sc], q) => { M.compose(P.set(px, py, pz), Q.setFromAxisAngle(up, r), S.setScalar(sc)); im.setMatrixAt(q, M); if (part.tinted) im.setColorAt(q, tint.setRGB(...kitTint(part.tinted, k, 3, 7))); });
        im.computeBoundingSphere(); im.castShadow = false; im.receiveShadow = true; this.group.add(im); } }
    this.plants = [...plants.values()].reduce((n, l) => n + l.length, 0);
  }
  // the lanes people have worn between their houses: laid over the land, a little proud of it
  layLanes(x, z) {
    const pos = [], uv = [], col = [], idx = [];
    sitesNear(this.planet, x, z, NEAR + 300, s => { if (!s.lanes?.length || Math.hypot(s.x - x, s.z - z) > NEAR + 300) return;
      for (const [x0, z0, x1, z1, w] of s.lanes) { const L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.ceil(L / 3)), ux = (x1 - x0) / L, uz = (z1 - z0) / L, b = pos.length / 3;
        for (let i = 0; i <= n; i++) { const t = i / n, f = t * L, wob = Math.sin(f * 0.09) * 1.1 + Math.sin(f * 0.031 + 2) * 1.6, W = w * (0.85 + 0.15 * Math.sin(f * 0.21)), cx = x0 + ux * f - uz * wob, cz = z0 + uz * f + ux * wob;
          for (const q of [-1, -0.45, 0.45, 1]) { const px = cx - uz * W * q, pz = cz + ux * W * q; pos.push(px, surfaceAt(this.planet, px, pz).h + 0.05, pz); uv.push(px, pz); col.push(1, 1, 1, Math.abs(q) === 1 ? 0 : 0.92 * Math.min(1, Math.min(i, n - i) / 2)); } }     // (both edges and both ends fade into the ground)
        for (let i = 0; i < n; i++) for (let j = 0; j < 3; j++) { const a = b + i * 4 + j, c = a + 4; idx.push(a, a + 1, c, a + 1, c + 1, c); }
      } });
    // the tracks that bring them in from the road (near stretches only: from further off it's the land's own colour)
    sitesNear(this.planet, x, z, NEAR + 1500, s => { for (const T of s.tracks || []) { const near = T.pts.map(p => Math.hypot(p[0] - x, p[1] - z) < NEAR + 300); let run = -1;
      for (let i = 0; i <= T.pts.length; i++) { const on = near[i]; if (on && run < 0) run = i; if ((!on || i === T.pts.length) && run >= 0) { const P = T.pts.slice(Math.max(0, run - 1), i + 1); run = -1; if (P.length < 2) continue; const b = pos.length / 3;
        P.forEach((p, q) => { const a = P[Math.max(0, q - 1)], c = P[Math.min(P.length - 1, q + 1)], L = Math.hypot(c[0] - a[0], c[1] - a[1]) || 1, nx = -(c[1] - a[1]) / L, nz = (c[0] - a[0]) / L; for (const f of [-1, -0.45, 0.45, 1]) { const px = p[0] + nx * T.w * f, pz = p[1] + nz * T.w * f; pos.push(px, surfaceAt(this.planet, px, pz).h + 0.05, pz); uv.push(px, pz); col.push(1, 1, 1, Math.abs(f) === 1 ? 0 : 0.92); } });
        for (let q = 0; q < P.length - 1; q++) for (let j = 0; j < 3; j++) { const a = b + q * 4 + j, c = a + 4; idx.push(a, a + 1, c, a + 1, c + 1, c); } } } } });
    this.sowFields(x, z);
    if (!idx.length) return;
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4)); g.setIndex(idx); g.computeVertexNormals();
    if (!this.laneMat) { const paved = ['masonry', 'garden'].includes(cultureOf(this.planet).key), b = this.lib?.surface(paved ? 'cobble' : 'dirt');     // (a people who build in stone lay their lanes in it too)
      this.laneMat = b ? b.clone() : new THREE.MeshStandardMaterial({ color: 0x776a55, roughness: 1 }); this.laneMat.vertexColors = true; this.laneMat.transparent = true; this.laneMat.depthWrite = false; this.laneMat.polygonOffset = true; this.laneMat.polygonOffsetFactor = -3; this.laneMat.polygonOffsetUnits = -12; }     // fades out into the grass at its edges
    const m = new THREE.Mesh(g, this.laneMat); m.receiveShadow = true; m.name = 'lanes'; this.group.add(m);
  }
  // a building close enough to be real (render/sitereal.js) stands in for its model here
  hide(it, off) {
    if (off === this.hidden.has(it)) return;
    if (off) this.hidden.add(it); else this.hidden.delete(it);
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), it.rot);
    for (const [im, q] of this.where.get(it) || []) { M.compose(new THREE.Vector3(it.x, it.y, it.z), Q, off ? new THREE.Vector3(0, 0, 0) : new THREE.Vector3(it.s || 1, 1, 1)); im.setMatrixAt(q, M); im.instanceMatrix.needsUpdate = true; }
  }
  update(x, z) {
    if (this.at && Math.hypot(this.at[0] - x, this.at[1] - z) < 120) return; this.at = [x, z];
    this.group.traverse(o => { if (o.isInstancedMesh) o.dispose(); else if (o.name === 'lanes') o.geometry.dispose(); }); this.group.clear();
    const by = new Map(); let n = 0; this.where.clear();
    sitesNear(this.planet, x, z, R, s => { const d = Math.hypot(s.x - x, s.z - z); if (d > R) return; for (const it of s.items) { if (d > NEAR && !FAR_ONLY.test(it.k)) continue; (by.get(it.k) || by.set(it.k, []).get(it.k)).push(it); n++; } });
    this.count = n;
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(1, 1, 1), P = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), col = new THREE.Color();
    for (const [k, list] of by) {
      const parts = this.kitOf(k); if (!parts) continue;
      for (const part of parts) {
        const im = new THREE.InstancedMesh(share(part.geometry), part.material, list.length);
        list.forEach((it, q) => { const off = this.hidden.has(it); M.compose(P.set(it.x, it.y, it.z), Q.setFromAxisAngle(up, it.rot), off ? S.set(0, 0, 0) : S.set(it.s || 1, 1, 1)); im.setMatrixAt(q, M); if (it.box) (this.where.get(it) || this.where.set(it, []).get(it)).push([im, q]); if (part.tinted) im.setColorAt(q, col.setRGB(...kitTint(part.tinted, k, it.x, it.z))); });
        im.computeBoundingSphere(); im.castShadow = !!part.cast; im.receiveShadow = true; this.group.add(im);
      }
    }
    this.layLanes(x, z);
  }
}
