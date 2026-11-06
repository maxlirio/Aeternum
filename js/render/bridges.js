// Bridges where this town's roads cross rivers: a deck under the road, parapets, and piers down to the bed. Geometry from the route's own numbers.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { outRoutes } from '../gen/highways.js';
import { materials } from './materials.js';
import { rawHeight } from '../gen/terrain.js';

function beam(a, b, y0, y1, w, off = 0) {   // a box from a to b (x, z), y0 to y1 high, w wide, offset sideways
  const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1, g = new THREE.BoxGeometry(w, 1, L + 0.05), m = new THREE.Matrix4(), ux = dz / L, uz = -dx / L;
  m.makeRotationY(Math.atan2(dx, dz)); m.scale(new THREE.Vector3(1, y1 - y0, 1)); m.setPosition((a[0] + b[0]) / 2 + ux * off, (y0 + y1) / 2, (a[1] + b[1]) / 2 + uz * off); g.applyMatrix4(m); return g;
}
export const bridgeGroup = (planet, s) => bridgesOn(planet, outRoutes(planet, s));
// (Laid out around the first bridge rather than in world numbers, which get too big for a graphics card a long way from home.)
export function bridgesOn(planet, routes) {
  const G = new THREE.Group(); G.name = 'bridges'; const M = materials(); const deck = [], rail = [], pier = [];
  const first = routes.find(r => r.bridges?.length); if (!first) return G;
  const ox = first.pts[first.bridges[0].i0][0], oz = first.pts[first.bridges[0].i0][1]; G.position.set(ox, 0, oz); const L = p => [p[0] - ox, p[1] - oz];
  for (const r of routes) for (const B of r.bridges || []) {
    const w = r.w + 1.4;
    for (let i = B.i0 - 1; i < B.i1 + 1; i++) { if (i < 0 || i + 1 >= r.pts.length) continue; const a = L(r.pts[i]), b = L(r.pts[i + 1]), wa = r.pts[i], y = Math.min(r.h[i], r.h[i + 1]) - 0.06;
      deck.push(beam(a, b, y - 0.75, y, w));
      for (const sd of [-1, 1]) { rail.push(beam(a, b, y, y + 0.55, 0.28, sd * (w / 2 - 0.14))); rail.push(beam(a, b, y + 0.55, y + 0.65, 0.36, sd * (w / 2 - 0.14))); }
      if ((i - B.i0) % 3 === 0 || i === B.i0 - 1) { const bed = Math.min(rawHeight(planet, wa[0], wa[1]), B.water) - 3; for (const sd of [-1, 1]) pier.push(beam(a, [a[0] + (b[0] - a[0]) * 0.28, a[1] + (b[1] - a[1]) * 0.28], bed, y - 0.7, 1.1, sd * (w / 2 - 1.2))); pier.push(beam(a, [a[0] + (b[0] - a[0]) * 0.28, a[1] + (b[1] - a[1]) * 0.28], y - 1.3, y - 0.7, w - 1, 0)); }
    }
  }
  const add = (list, mat) => { if (!list.length) return; const g = mergeGeometries(list.map(q => q.index ? q.toNonIndexed() : q)); g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(0.8), 3)); const m = new THREE.Mesh(g, mat); m.castShadow = true; m.receiveShadow = true; G.add(m); };
  add(deck, M.concrete); add(rail, M.concrete); add(pier, M.concrete);
  return G;
}
