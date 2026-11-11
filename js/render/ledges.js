// Ledges you can see wherever a wall has a hold that nothing else draws: the rails that cross a long blank stretch of a
// town wall (a steel sheeting rail on a shed, a stone string course on the rest), and every course of a city facade
// (whose windows, sills and bands are otherwise painted by its shader): sills and lintels under and over each window,
// the floor bands, the shopfront's fascia. Real geometry, near you, so that the hand that takes a hold is on something,
// and the probe (render/probe.js) finds its true top. Rebuilt as you move; one mesh per material.
import * as THREE from 'three';
import { facesNear, rowSpans } from '../gen/holds.js';

const R = 38, DEPTH = { rail: 0.07, sill: 0.1, head: 0.07, band: 0.09, shop: 0.12 }, TALL = { rail: 0.06, sill: 0.06, head: 0.1, band: 0.16, shop: 0.24 };
export class LedgeView {
  constructor() {
    this.group = new THREE.Group(); this.group.name = 'ledges'; this.at = null;
    this.mats = { stone: new THREE.MeshStandardMaterial({ color: 0x9a948a, roughness: 0.92 }), course: new THREE.MeshStandardMaterial({ color: 0xd2cec6, roughness: 0.9 }), steel: new THREE.MeshStandardMaterial({ color: 0x7d8286, roughness: 0.55, metalness: 0.6 }) };
    this.meshes = {}; for (const k in this.mats) { const m = new THREE.Mesh(new THREE.BufferGeometry(), this.mats[k]); m.castShadow = m.receiveShadow = true; m.frustumCulled = false; m.name = 'ledges:' + k; this.meshes[k] = m; this.group.add(m); }
  }
  // which rows of a face need drawing here, and where along them (a town wall draws its own sills, heads, bands and coping)
  static spansOf(f, row) {
    if (row.kind === 'ground' || row.kind === 'top') return [];
    if (f.town) return row.kind === 'rail' ? rowSpans(f, row, true) || [[0.05, f.w - 0.05]] : [];
    if (!f.b) return [];
    return rowSpans(f, row) || [[0.02, f.w - 0.02]];
  }
  update(world, x, y, z) {      // (in world coordinates, under the floating origin's root, like the pipes)
    if (this.at && Math.abs(x - this.at[0]) + Math.abs(z - this.at[1]) + Math.abs(y - this.at[2]) < 6) return;
    const faces = new Set(); facesNear(world, x, y, z, R, f => { if (!f.tower) faces.add(f); });
    const parts = { stone: [], course: [], steel: [] };
    for (const f of faces) {
      const rot = Math.atan2(f.t[0], f.t[1]);
      for (const row of f.rows) {
        if (Math.abs(row.y - y) > R) continue;
        const d = DEPTH[row.kind] ?? 0.08, h = TALL[row.kind] ?? 0.06, kind = row.kind !== 'rail' ? 'stone' : f.town ? (/workshop|hangar/.test(f.town.type) ? 'steel' : 'course') : 'steel';      // (a rail: a string course on a town's masonry, a steel rail on a shed or a city facade)
        for (const [a0, a1] of LedgeView.spansOf(f, row)) {
          const c = (a0 + a1) / 2, p = [f.o[0] + f.t[0] * c + f.n[0] * d / 2, row.y - h / 2, f.o[1] + f.t[1] * c + f.n[1] * d / 2];
          if (Math.hypot(p[0] - x, p[2] - z) > R + (a1 - a0) / 2) continue;
          parts[kind].push({ p, rot, len: a1 - a0, d, h });
        }
        // across a town window the rail is the window's transom: a steel bar inside its frame
        if (f.town && row.kind === 'rail') for (const o of f.openings || []) { if (o.door || row.y < o.y0 + 0.1 || row.y > o.y1 - 0.1) continue; const c = (o.a0 + o.a1) / 2; parts.steel.push({ p: [f.o[0] + f.t[0] * c + f.n[0] * 0.03, row.y - 0.025, f.o[1] + f.t[1] * c + f.n[1] * 0.03], rot, len: o.a1 - o.a0, d: 0.06, h: 0.05 }); }
      }
    }
    const O = [0, 0, 0];
    for (const k in parts) {
      const L = parts[k], pos = new Float32Array(L.length * 24 * 3), nrm = new Float32Array(L.length * 24 * 3), idx = new Uint32Array(L.length * 36), box = new THREE.BoxGeometry(1, 1, 1), bp = box.attributes.position, bn = box.attributes.normal, bi = box.index, m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), v = new THREE.Vector3(), s = new THREE.Vector3();
      L.forEach((e, i) => {
        m.compose(v.set(e.p[0] + O[0], e.p[1] + O[1], e.p[2] + O[2]), q.setFromAxisAngle(up, e.rot), s.set(e.d, e.h, e.len)); const nm = new THREE.Matrix3().getNormalMatrix(m);
        for (let j = 0; j < 24; j++) { v.fromBufferAttribute(bp, j).applyMatrix4(m); pos.set([v.x, v.y, v.z], (i * 24 + j) * 3); v.fromBufferAttribute(bn, j).applyMatrix3(nm).normalize(); nrm.set([v.x, v.y, v.z], (i * 24 + j) * 3); }
        for (let j = 0; j < 36; j++) idx[i * 36 + j] = bi.getX(j) + i * 24;
      });
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3)); g.setIndex(new THREE.BufferAttribute(idx, 1)); g.computeBoundingSphere();
      this.meshes[k].geometry.dispose(); this.meshes[k].geometry = g; this.meshes[k].userData._probe = null;
    }
    this.at = [x, z, y];
  }
}
