// Towns built out over the sea (gen/settlement.js onWater), and the boats that work from them and from any coastal town:
// the deck's edge on its piles, a timber quay face down to the water, jetties out from it with boats tied up, and fishing
// boats going out to their grounds, working them in slow circles, and coming home. Boats are pure in time, like air traffic.
import * as THREE from 'three';
import { getSettlement, regionOf } from '../gen/settlement.js';
import { rawHeight } from '../gen/terrain.js';
import { hashInts, hashStr } from '../core/hash.js';

const NEAR = 5000, BOATS = 9;
// Where boat k of town s is at t: out to its ground, working it, back; null if this town has no water for boats.
export function boatAt(planet, s, k, t) {
  const h = j => hashInts(planet.seed[0] ^ 0xb0a7, [hashStr(5, s.key), k, j]) / 4294967296, sea = planet.seaLevel;
  const a = h(1) * 6.283, R = s.R + 50, dx = Math.sin(a), dz = Math.cos(a), out = 400 + 1400 * h(2), gx = s.cx + dx * (R + out), gz = s.cz + dz * (R + out);
  if (!s.onWater && (rawHeight(planet, s.cx + dx * (R + 60), s.cz + dz * (R + 60)) > sea - 1 || rawHeight(planet, gx, gz) > sea - 2)) return null;
  const sp = 5 + 3 * h(3), go = out / sp, work = 600 + 900 * h(4), dock = 500 + 900 * h(5), P = 2 * go + work + dock, u = ((t / P + h(6)) % 1) * P;
  let x, z, f;
  if (u < go) { f = u / go; x = s.cx + dx * (R + out * f); z = s.cz + dz * (R + out * f); f = Math.atan2(dx, dz); }
  else if (u < go + work) { const w = (u - go) / 40, rr = 60 + 40 * h(7); x = gx + Math.cos(w) * rr; z = gz + Math.sin(w) * rr; f = Math.atan2(-Math.sin(w), Math.cos(w)); }
  else if (u < 2 * go + work) { const q = (u - go - work) / go; x = s.cx + dx * (R + out * (1 - q)); z = s.cz + dz * (R + out * (1 - q)); f = Math.atan2(-dx, -dz); }
  else { x = s.cx + dx * (R + 8); z = s.cz + dz * (R + 8); f = a + 1.57; }       // (tied up at the quay)
  return { x, z, facing: f, k };
}

export class HarbourView {
  constructor(planet, kitOf, lib) {
    this.planet = planet; this.kitOf = kitOf; this.lib = lib; this.group = new THREE.Group(); this.group.name = 'harbour'; this.built = new Map(); this.at = null;
    const wood = lib?.surface?.('plank') || new THREE.MeshStandardMaterial({ color: 0x6b5238, roughness: 0.9 });
    this.mats = { wood, dark: new THREE.MeshStandardMaterial({ color: 0x2b2420, roughness: 0.95 }), rope: new THREE.MeshStandardMaterial({ color: 0x8a7a5a, roughness: 1 }) };
    this.boats = null; this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this.up = new THREE.Vector3(0, 1, 0); this.t = 0;
  }
  // a water town's edge: piles all round, a quay face, jetties
  buildTown(s) {
    const g = new THREE.Group(), sea = this.planet.seaLevel, R = s.R + 40, top = s.h, n = Math.round(R * 6.283 / 3.2);
    const pile = new THREE.CylinderGeometry(0.32, 0.38, 1, 10).translate(0, 0.5, 0), piles = new THREE.InstancedMesh(pile, this.mats.wood, n * 2 + 200), m = this._m; let c = 0;
    for (let i = 0; i < n; i++) for (const off of [0.6, -2.4]) { const a = i / n * 6.283, x = s.cx + Math.cos(a) * (R + off), z = s.cz + Math.sin(a) * (R + off), y0 = sea - 9, L = top - y0 + (off > 0 ? 0.9 : -0.2); m.compose(new THREE.Vector3(x, y0, z), this._q.identity(), new THREE.Vector3(1, L, 1)); piles.setMatrixAt(c++, m); }
    // the quay face: boards round the edge, from the deck down to under the water; a rail along the top
    const face = new THREE.CylinderGeometry(R + 0.45, R + 0.45, top - sea + 1.4, 160, 1, true).translate(s.cx, (top + sea - 1.4) / 2, s.cz); g.add(new THREE.Mesh(face, this.mats.dark));
    const rail = new THREE.TorusGeometry(R + 0.6, 0.09, 6, 220).rotateX(Math.PI / 2).translate(s.cx, top + 1.0, s.cz); g.add(new THREE.Mesh(rail, this.mats.wood));
    // jetties out over the water: a deck on piles
    for (let j = 0; j < 4; j++) {
      const a = j * 1.571 + (s.angle || 0) + 0.4, dx = Math.cos(a), dz = Math.sin(a), L = 45, x0 = s.cx + dx * R, z0 = s.cz + dz * R;
      const deck = new THREE.BoxGeometry(3.2, 0.3, L).translate(0, 0, L / 2).rotateY(Math.atan2(dx, dz)).translate(x0, top - 0.25, z0); g.add(new THREE.Mesh(deck, this.mats.wood));
      for (let q = 4; q <= L; q += 4) for (const side of [-1.4, 1.4]) { const x = x0 + dx * q - dz * side, z = z0 + dz * q + dx * side; if (c < piles.count) { m.compose(new THREE.Vector3(x, sea - 6, z), this._q.identity(), new THREE.Vector3(0.8, top - sea + 6, 0.8)); piles.setMatrixAt(c++, m); } }
    }
    piles.count = c; piles.castShadow = true; g.add(piles);
    for (const o of g.children) { o.receiveShadow = true; o.frustumCulled = false; }
    return g;
  }
  update(x, z, t, dt) {
    this.t += dt;
    if (!this.at || Math.hypot(x - this.at[0], z - this.at[1]) > 300) {
      this.at = [x, z]; const [rx, rz] = regionOf(x, z), want = new Set(); this.near = [];
      for (let i = rx - 2; i <= rx + 2; i++) for (let j = rz - 2; j <= rz + 2; j++) { const s = getSettlement(this.planet, i, j); if (!s || Math.hypot(s.cx - x, s.cz - z) > NEAR + s.R) continue; this.near.push(s);
        if (s.onWater) { want.add(s.key); if (!this.built.has(s.key)) { const g = this.buildTown(s); this.group.add(g); this.built.set(s.key, g); } } }
      for (const [k, g] of this.built) if (!want.has(k)) { this.group.remove(g); g.traverse(o => o.geometry?.dispose()); this.built.delete(k); }
    }
    // the boats
    if (!this.boats) { const parts = this.kitOf('boat'); if (!parts) return; this.boats = parts.map(p => { const im = new THREE.InstancedMesh(p.geometry, p.material, 64); im.count = 0; im.castShadow = true; im.frustumCulled = false; this.group.add(im); return im; }); }
    let n = 0; const m = this._m, sea = this.planet.seaLevel;
    for (const s of this.near || []) for (let k = 0; k < BOATS && n < 64; k++) { const B = boatAt(this.planet, s, k, t); if (!B) continue;
      const bob = Math.sin(this.t * 1.3 + k) * 0.12, roll = Math.sin(this.t * 0.9 + k * 2) * 0.05; this._q.setFromEuler(new THREE.Euler(Math.sin(this.t * 0.7 + k) * 0.03, B.facing, roll, 'YXZ'));
      m.compose(new THREE.Vector3(B.x, sea - 0.35 + bob, B.z), this._q, new THREE.Vector3(1, 1, 1)); for (const im of this.boats) im.setMatrixAt(n, m); n++; }
    for (const im of this.boats) { im.count = n; im.instanceMatrix.needsUpdate = true; }
  }
}
