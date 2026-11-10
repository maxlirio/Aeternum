// The water in the rivers near you (gen/rivers.js): a ribbon laid down each channel at its own level.
// Rebuilt when you've moved a way; the ground itself is cut by gen/surface.js.
import * as THREE from 'three';
import { riversNear } from '../gen/rivers.js';
import { surfaceAt } from '../gen/surface.js';

const NEAR = 2200, MOVE = 320;
export class RiverView {
  constructor(planet) {
    this.planet = planet; this.group = new THREE.Group(); this.group.name = 'rivers'; this.at = null;
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'), d = g.createImageData(128, 128);
    for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) { const v = 128 + 26 * Math.sin(x * 0.098 * 2) * Math.sin(y * 0.049 * 3 + Math.sin(x * 0.098) * 2) + 18 * Math.sin(y * 0.196 + x * 0.049), i = (y * 128 + x) * 4; d.data[i] = 128 + 30 * Math.cos(y * 0.147 + x * 0.098); d.data[i + 1] = v; d.data[i + 2] = 255; d.data[i + 3] = 255; }
    g.putImageData(d, 0, 0); const n = new THREE.CanvasTexture(c); n.wrapS = n.wrapT = THREE.RepeatWrapping;
    this.tex = n; const sc = planet.climate?.sea; this.mat = new THREE.MeshStandardMaterial({ color: sc ? new THREE.Color(...sc.shallow.map((v, i) => v * 0.55 + sc.deep[i] * 0.6)) : new THREE.Color(0.1, 0.2, 0.22), roughness: 0.12, metalness: 0.5, transparent: true, opacity: 0.86, normalMap: n, normalScale: new THREE.Vector2(0.35, 0.35), depthWrite: false, side: THREE.DoubleSide }); void sc;
  }
  update(x, z, dt) {
    this.tex.offset.y -= dt * 0.22;
    if (this.at && Math.hypot(this.at[0] - x, this.at[1] - z) < MOVE) return; this.at = [x, z];
    for (const m of this.group.children) m.geometry.dispose(); this.group.clear();
    const pos = [], uv = [], nor = [], idx = [];
    for (const R of riversNear(this.planet, x, z)) {
      const P = R.pts; let open = -1;
      for (let i = 0; i < P.length; i++) { const on = Math.hypot(P[i].x - x, P[i].z - z) < NEAR;
        if (!on) { open = -1; continue; }
        const a = P[Math.max(0, i - 1)], c = P[Math.min(P.length - 1, i + 1)], L = Math.hypot(c.x - a.x, c.z - a.z) || 1, nx = -(c.z - a.z) / L, nz = (c.x - a.x) / L, hw = R.w[i] / 2 + 2.4, road = surfaceAt(this.planet, P[i].x, P[i].z).road > 0.2 || P[i].y <= this.planet.seaLevel + 0.25, b = pos.length / 3;     // (it stops at a road's embankment, and where the sea takes over)
       
        for (const s of [-1, 1]) { pos.push(P[i].x + nx * hw * s, P[i].y, P[i].z + nz * hw * s); nor.push(0, 1, 0); uv.push(s * hw / 6, i * 60 / 6); }
        if (open >= 0 && !road) idx.push(open, b, open + 1, open + 1, b, b + 1);
        open = road ? -1 : b; }
    }
    if (!idx.length) return;
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeBoundingSphere();
    const m = new THREE.Mesh(g, this.mat); m.frustumCulled = false; m.receiveShadow = true; this.group.add(m);
  }
}
