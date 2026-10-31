// Quadtree terrain streaming. Tiles near the player are fine (64 m, 2 m spacing),
// doubling in size with distance out to the horizon. Tiles build within a per-frame
// time budget, nearest first; a stale tile is only removed once every tile replacing
// it is ready, so the ground never has holes.
import * as THREE from 'three';
import { CHUNK, MAX_LOD } from '../core/units.js';
import { chunkData } from '../gen/chunk.js';
import { texture } from './textures.js';

const VIEW = 16000, SPLIT = 1.7;

function terrainMaterial() {
  const t = texture('ground');
  const map = t.map.clone(); map.repeat.set(1 / 6, 1 / 6); map.needsUpdate = true;
  const nmap = t.normalMap.clone(); nmap.repeat.set(1 / 6, 1 / 6); nmap.needsUpdate = true;
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, map, normalMap: nmap, roughness: 0.96, metalness: 0 });
  m.normalScale.set(0.6, 0.6);
  m.onBeforeCompile = sh => {
    // Albedo detail at two scales, normalised so it modulates rather than darkens,
    // faded out with distance to avoid tiling shimmer.
    sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `
      vec4 d1 = texture2D(map, vMapUv);
      vec4 d2 = texture2D(map, vMapUv * 0.073 + 0.31);
      float fade = clamp(1.0 - vViewPosition.z / 400.0, 0.0, 1.0);
      float detail = mix(1.0, (d1.r * 1.25 + 0.35) * (d2.r * 0.9 + 0.55), 0.85);
      diffuseColor.rgb *= mix(d2.r * 0.8 + 0.6, detail, fade);
    `);
  };
  return m;
}

export class TerrainStreamer {
  constructor(planet, parent) {
    this.planet = planet; this.parent = parent;
    this.material = terrainMaterial();
    this.tiles = new Map();          // key -> { mesh, lod, i, j }
    this.desired = new Set();
    this.queue = [];
    this.lastSplit = null;
  }
  key(l, i, j) { return l + ':' + i + ':' + j; }

  // Recompute the wanted leaf set around (px, pz).
  plan(px, pz) {
    const want = new Set(), queue = [];
    const S = CHUNK * 2 ** MAX_LOD;
    const visit = (l, i, j) => {
      const size = CHUNK * 2 ** l, x0 = i * size, z0 = j * size;
      const dx = Math.max(x0 - px, 0, px - (x0 + size)), dz = Math.max(z0 - pz, 0, pz - (z0 + size));
      const dist = Math.hypot(dx, dz);
      if (dist > VIEW) return;
      if (l > 0 && dist < size * SPLIT) { for (const [a, b] of [[0, 0], [1, 0], [0, 1], [1, 1]]) visit(l - 1, i * 2 + a, j * 2 + b); return; }
      const k = this.key(l, i, j);
      want.add(k);
      if (!this.tiles.has(k)) queue.push({ k, l, i, j, dist });
    };
    const r0 = Math.floor((px - VIEW) / S), r1 = Math.floor((px + VIEW) / S), c0 = Math.floor((pz - VIEW) / S), c1 = Math.floor((pz + VIEW) / S);
    for (let i = r0; i <= r1; i++) for (let j = c0; j <= c1; j++) visit(MAX_LOD, i, j);
    queue.sort((a, b) => a.dist - b.dist || a.l - b.l);
    this.desired = want; this.queue = queue;
  }

  update(px, pz, budgetMs = 6) {
    const cell = Math.floor(px / 32) + ',' + Math.floor(pz / 32);
    if (cell !== this.lastSplit) { this.plan(px, pz); this.lastSplit = cell; }
    const t0 = performance.now();
    while (this.queue.length && performance.now() - t0 < budgetMs) {
      const q = this.queue.shift();
      if (this.tiles.has(q.k) || !this.desired.has(q.k)) continue;
      this.tiles.set(q.k, { mesh: this.buildTile(q.l, q.i, q.j), lod: q.l, i: q.i, j: q.j });
    }
    // retire stale tiles whose area is fully covered by ready desired tiles
    for (const [k, t] of this.tiles) {
      if (this.desired.has(k)) continue;
      if (this.covered(t)) { this.parent.remove(t.mesh); t.mesh.geometry.dispose(); this.tiles.delete(k); }
    }
  }
  covered(t) {
    for (const k of this.desired) {
      if (this.tiles.has(k)) continue;
      const [l, i, j] = k.split(':').map(Number);
      const s1 = CHUNK * 2 ** l, s0 = CHUNK * 2 ** t.lod;
      const ax = i * s1, az = j * s1, bx = t.i * s0, bz = t.j * s0;
      if (ax < bx + s0 && ax + s1 > bx && az < bz + s0 && az + s1 > bz) return false;
    }
    return true;
  }
  buildTile(l, i, j) {
    const d = chunkData(this.planet, l, i, j);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(d.pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(d.nrm, 3));
    g.setAttribute('color', new THREE.BufferAttribute(d.col, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(d.uv, 2));
    g.setIndex(new THREE.BufferAttribute(d.idx, 1));
    g.boundingBox = new THREE.Box3(new THREE.Vector3(0, d.minH - 40, 0), new THREE.Vector3(d.size, d.maxH, d.size));
    g.boundingSphere = g.boundingBox.getBoundingSphere(new THREE.Sphere());
    const mesh = new THREE.Mesh(g, this.material);
    mesh.position.set(d.x0, 0, d.z0);
    mesh.receiveShadow = true; mesh.castShadow = l <= 1;
    mesh.matrixAutoUpdate = false; mesh.updateMatrix();
    this.parent.add(mesh);
    return mesh;
  }
  get pending() { return this.queue.length; }
  get count() { return this.tiles.size; }
}
