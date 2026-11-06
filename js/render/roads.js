// The roads between towns, drawn as you come near them: asphalt draped over the graded ground, a
// broken centre line, and bridges where they cross a river. Taken down once they're well behind you.
import * as THREE from 'three';
import { MeshBuilder } from './meshbuilder.js';
import { materials } from './materials.js';
import { bridgesOn } from './bridges.js';
import { knownLinks } from '../gen/network.js';
import { surfaceHeight } from '../gen/surface.js';

const IN = 5000, OUT = 7500;
const away = (r, x, z) => Math.hypot(Math.max(r.x0 - x, 0, x - r.x1), Math.max(r.z0 - z, 0, z - r.z1));

export class RoadView {
  constructor(planet, root) { this.planet = planet; this.group = new THREE.Group(); this.group.name = 'roads'; root.add(this.group); this.shown = new Map(); this.busy = false; }
  update(x, z) {
    for (const [r, G] of this.shown) if (G && away(r, x, z) > OUT) { this.group.remove(G); G.traverse(o => o.geometry?.dispose()); this.shown.delete(r); }
    if (this.busy) return;
    let best = null, bd = IN; for (const r of knownLinks(this.planet)) { if (this.shown.has(r)) continue; const d = away(r, x, z); if (d < bd) { bd = d; best = r; } }
    if (best) { this.busy = true; this.shown.set(best, null); this.build(best).catch(e => console.error('road', e)).finally(() => { this.busy = false; }); }
  }
  async build(r) {
    const M = materials(), P = r.pts, ox = P[0][0], oz = P[0][1], hw = r.w / 2, mb = new MeshBuilder();
    const over = i => r.bridges.some(B => i >= B.i0 - 1 && i <= B.i1 + 1);
    const edge = i => {
      const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)], dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1, nx = -dz / L, nz = dx / L;
      return [-1, 1].map(side => { const x = P[i][0] + nx * side * hw, z = P[i][1] + nz * side * hw; return [x - ox, over(i) ? r.h[i] + 0.03 : surfaceHeight(this.planet, x, z) + 0.12, z - oz]; });
    };
    let prev = edge(0), t0 = performance.now();
    for (let i = 1; i < P.length; i++) {
      const cur = edge(i), quad = [prev[0], prev[1], cur[1], cur[0]], [p0, p1, p2] = quad, cross = (p1[0] - p0[0]) * (p2[2] - p0[2]) - (p1[2] - p0[2]) * (p2[0] - p0[0]), q = cross < 0 ? quad : [quad[0], quad[3], quad[2], quad[1]];
      mb.quad(M.asphalt, q, [0, 1, 0], q.map(p => [p[0], -p[2]]), [1, 1, 1]);
      if (i % 3 === 0) {       // the centre line: a dash, then a gap
        const c = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 0.015, (a[2] + b[2]) / 2], A = c(prev[0], prev[1]), B = c(cur[0], cur[1]), ux = B[2] - A[2], uz = A[0] - B[0], l = Math.hypot(ux, uz) || 1, sx = ux / l * 0.09, sz = uz / l * 0.09;
        const d = [[A[0] - sx, A[1], A[2] - sz], [A[0] + sx, A[1], A[2] + sz], [B[0] + sx, B[1], B[2] + sz], [B[0] - sx, B[1], B[2] - sz]], [d0, d1, d2] = d, cr = (d1[0] - d0[0]) * (d2[2] - d0[2]) - (d1[2] - d0[2]) * (d2[0] - d0[0]), dq = cr < 0 ? d : [d[0], d[3], d[2], d[1]];
        mb.quad(M.marking, dq, [0, 1, 0], dq.map(p => [p[0], -p[2]]), [1, 1, 1]);
      }
      prev = cur;
      if (performance.now() - t0 > 3) { await new Promise(res => setTimeout(res, 0)); t0 = performance.now(); }
    }
    // where it joins a town's road: enough asphalt that they meet whatever the angle
    for (const i of [0, P.length - 1]) { const cx = P[i][0] - ox, cz = P[i][1] - oz, rad = hw + 1, y = surfaceHeight(this.planet, P[i][0], P[i][1]) + 0.11, N = 16;
      for (let k = 0; k < N; k++) { const a0 = k / N * Math.PI * 2, a1 = (k + 1) / N * Math.PI * 2, A = [cx, y, cz], B = [cx + Math.cos(a1) * rad, y, cz + Math.sin(a1) * rad], C = [cx + Math.cos(a0) * rad, y, cz + Math.sin(a0) * rad]; mb.quad(M.asphalt, [A, B, C, A], [0, 1, 0], [A, B, C, A].map(p => [p[0], -p[2]]), [1, 1, 1]); } }
    const G = new THREE.Group(); G.name = 'road'; G.position.set(ox, 0, oz); G.add(...mb.build({ castShadow: false }));
    if (r.bridges.length) { const B = bridgesOn(this.planet, [r]); B.position.x -= ox; B.position.z -= oz; G.add(B); }
    this.group.add(G); this.shown.set(r, G);
  }
}
