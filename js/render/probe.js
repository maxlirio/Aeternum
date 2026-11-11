// Feeling the real surfaces. A climber's hand goes where the stone actually is, so before a hand takes a hold the
// meshes that are drawn there are probed: short rays against their own triangles. Each mesh gets a coarse grid of its
// triangles the first time it's probed (in its own space, so the floating origin never stales it); a probe only tests
// the triangles in the cells its ray crosses. Then findLedge reads a ledge off the surfaces the way a climbing game's
// traces do: where the top is, how far it comes out, how deep the lip is, and what's behind it.
import * as THREE from 'three';

const CELL = 0.75, _inv = new THREE.Matrix4(), _o = new THREE.Vector3(), _d = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _e1 = new THREE.Vector3(), _e2 = new THREE.Vector3(), _p = new THREE.Vector3(), _q = new THREE.Vector3(), _t = new THREE.Vector3(), _n = new THREE.Vector3();
const key = (i, j, k) => (i * 73856093) ^ (j * 19349663) ^ (k * 83492791);

function gridOf(mesh) {
  if (mesh.userData._probe && mesh.userData._probe.g === mesh.geometry) return mesh.userData._probe;
  const g = mesh.geometry, P = g.attributes.position, I = g.index, n = I ? I.count / 3 : P.count / 3, cells = new Map();
  for (let t = 0; t < n; t++) {
    const ia = I ? I.getX(t * 3) : t * 3, ib = I ? I.getX(t * 3 + 1) : t * 3 + 1, ic = I ? I.getX(t * 3 + 2) : t * 3 + 2;
    const x0 = Math.min(P.getX(ia), P.getX(ib), P.getX(ic)), x1 = Math.max(P.getX(ia), P.getX(ib), P.getX(ic)), y0 = Math.min(P.getY(ia), P.getY(ib), P.getY(ic)), y1 = Math.max(P.getY(ia), P.getY(ib), P.getY(ic)), z0 = Math.min(P.getZ(ia), P.getZ(ib), P.getZ(ic)), z1 = Math.max(P.getZ(ia), P.getZ(ib), P.getZ(ic));
    if ((x1 - x0) / CELL * (y1 - y0) / CELL * (z1 - z0) / CELL > 4000) continue;      // (a huge ground sheet: never a ledge)
    for (let i = Math.floor(x0 / CELL); i <= Math.floor(x1 / CELL); i++) for (let j = Math.floor(y0 / CELL); j <= Math.floor(y1 / CELL); j++) for (let k = Math.floor(z0 / CELL); k <= Math.floor(z1 / CELL); k++) {
      const h = key(i, j, k); let L = cells.get(h); if (!L) cells.set(h, L = []); L.push(t);
    }
  }
  return mesh.userData._probe = { g, cells, I, P };
}

export class SurfaceProbe {
  // roots(): the groups whose meshes are walls and what's on them (towns, sites, rooms, ledges); read at each probe, so towns can come and go
  constructor(roots) { this.roots = roots; }
  meshesNear(o, far) { const out = []; for (const R of this.roots()) R?.traverse(m => { if (!m.isMesh || m.isInstancedMesh || m.isSkinnedMesh || !m.visible || !m.geometry?.attributes?.position) return; out.push(m); }); return out; }
  // The nearest surface along a ray from `o` (render space) in direction `d` (unit), up to `far`: { t, n (world normal) } or null.
  ray(o, d, far, list = null) {
    let best = null;
    for (const m of list || this.meshesNear(o, far)) {
      if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
      const bs = m.geometry.boundingSphere; _p.copy(bs.center).applyMatrix4(m.matrixWorld); const r = bs.radius * m.matrixWorld.getMaxScaleOnAxis() + far;
      if (_p.distanceToSquared(o) > r * r) continue;
      const G = gridOf(m); _inv.copy(m.matrixWorld).invert(); _o.copy(o).applyMatrix4(_inv); _d.copy(d).transformDirection(_inv);
      const sc = m.matrixWorld.getMaxScaleOnAxis() || 1, F = far / sc;
      // the cells along the segment
      const seen = new Set(), steps = Math.max(1, Math.ceil(F / (CELL * 0.5)));
      for (let s = 0; s <= steps; s++) {
        _q.copy(_o).addScaledVector(_d, F * s / steps);
        for (const di of [-1, 0, 1]) for (const dj of [-1, 0, 1]) for (const dk of [-1, 0, 1]) {
          const i = Math.floor(_q.x / CELL) + di, j = Math.floor(_q.y / CELL) + dj, k = Math.floor(_q.z / CELL) + dk, h = key(i, j, k); if (seen.has(h)) continue; seen.add(h);
          const L = G.cells.get(h); if (!L) continue;
          for (const t of L) {
            const ia = G.I ? G.I.getX(t * 3) : t * 3, ib = G.I ? G.I.getX(t * 3 + 1) : t * 3 + 1, ic = G.I ? G.I.getX(t * 3 + 2) : t * 3 + 2;
            _a.fromBufferAttribute(G.P, ia); _b.fromBufferAttribute(G.P, ib); _c.fromBufferAttribute(G.P, ic);
            // Möller–Trumbore, both faces
            _e1.subVectors(_b, _a); _e2.subVectors(_c, _a); _p.crossVectors(_d, _e2); const det = _e1.dot(_p); if (Math.abs(det) < 1e-12) continue;
            const inv = 1 / det; _t.subVectors(_o, _a); const u = _t.dot(_p) * inv; if (u < 0 || u > 1) continue;
            _q.crossVectors(_t, _e1); const v = _d.dot(_q) * inv; if (v < 0 || u + v > 1) continue;
            const tt = _e2.dot(_q) * inv; if (tt < 0 || tt > F) continue;
            const T = tt * sc; if (best && T >= best.t) continue;
            _n.crossVectors(_e1, _e2).transformDirection(m.matrixWorld); if (_n.dot(d) > 0) _n.negate();
            best = { t: T, n: _n.clone() };
          }
          _q.copy(_o).addScaledVector(_d, F * s / steps);
        }
      }
    }
    return best;
  }
}

// A ledge near `p` (render space) on a wall whose outward normal is `n` (horizontal, unit), the hold's own guess at
// where it is. Looks from y−0.3 to y+0.35. → { E: the lip's edge [x,y,z], d: how far its top runs back to the wall (or
// further), th: the height of its front face, top: true when nothing rises behind it (a roof's edge) } or null.
const V = (x, y, z) => new THREE.Vector3(x, y, z), UP = V(0, 1, 0), DOWN = V(0, -1, 0);
export function findLedge(probe0, p, n, wallAt = 0) {
  const N = V(n[0], 0, n[1]).normalize(), P0 = V(...p), list = probe0.meshesNear(P0, 1.5), probe = { ray: (o, d, f) => probe0.ray(o, d, f, list) };
  // the wall's plane: what a level ray toward it meets a hand's height above the guess and a little below it
  const at = (o, y) => P0.clone().addScaledVector(N, o).setY(y);
  // tops: straight down onto whatever stands out from the wall, a few distances out
  const outs = [0.015, 0.035, 0.06, 0.09, 0.12, 0.16, 0.22], tops = [];
  for (const o of outs) { const h = probe.ray(at(wallAt + o, p[1] + 0.35), DOWN, 0.7); tops.push(h && h.n.y > 0.7 ? p[1] + 0.35 - h.t : null); }
  // the ledge: the highest top near the guess, standing proud of the wall below it
  let best = null; for (let i = 0; i < outs.length; i++) { const y = tops[i]; if (y == null || y < p[1] - 0.3) continue; if (!best || y > best.y + 0.01) best = { y, i }; }
  if (!best) return null;
  const y = best.y; let iOut = best.i; while (iOut + 1 < outs.length && tops[iOut + 1] != null && Math.abs(tops[iOut + 1] - y) < 0.012) iOut++;
  // the lip's edge, to a few millimetres: between the last distance on the top and the next one off it
  let lo = outs[iOut], hi = outs[iOut + 1] ?? outs[iOut] + 0.08;
  for (let k = 0; k < 5; k++) { const m = (lo + hi) / 2, h = probe.ray(at(wallAt + m, y + 0.1), DOWN, 0.12); if (h && Math.abs(y + 0.1 - h.t - y) < 0.012) lo = m; else hi = m; }
  const lipO = wallAt + lo;
  // what's behind: a level ray toward the wall just above the top (nothing → a roof's edge, or a parapet's)
  const back = probe.ray(at(lipO + 0.3, y + 0.06), N.clone().negate(), 1.2), d = back ? Math.max(0.02, back.t - 0.3) : 10;
  // the front face: level rays at falling heights until they pass under the lip (where the wall below is further in)
  let th = 0.4; for (const dy of [0.02, 0.05, 0.09, 0.14, 0.2, 0.28, 0.38]) { const h = probe.ray(at(lipO + 0.25, y - dy), N.clone().negate(), 0.6); if (!h || h.t > 0.25 + 0.025) { th = dy; break; } }
  const E = at(lipO, y);
  return { E: E.toArray(), d, th, top: !back || d > 0.5, lipO };
}
