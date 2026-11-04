// What a shop actually has: the stock in its shelves (sim/processes/use.js contents) drawn on them,
// each item its own model at true size. Buy the last one and it's gone from the shelf.
import * as THREE from 'three';
import { usablesOf, contents } from '../sim/processes/use.js';
import { kitTint } from './city.js';

export class Goods {
  constructor(lib, planet, s, store, world) {
    Object.assign(this, { lib, planet, s, store, world }); this.group = new THREE.Group(); this.group.name = 'goods'; this.group.position.set(s.cx, 0, s.cz); this.key = null; this.next = 0;
  }
  update(t, pos) {
    const now = performance.now(); if (now < this.next) return; this.next = now + 2500;
    const loc = this.world.locate(pos[0], pos[1], pos[2]), b = loc?.b; let list = [];
    if (b && b.type !== 'ship') for (const u of usablesOf(this.planet, this.s, b)) if (u.verbs.includes('buy') && u.pr.k === (loc.k ?? 0) && u.box) list.push(u);
    const sig = (b?.key || '') + '|' + list.map(u => contents(this.store, this.planet, b, u, t).map(i => i.id + i.n).join()).join(';');
    if (sig === this.key) return; this.key = sig;
    this.group.traverse(o => { if (o.isInstancedMesh) o.dispose(); }); this.group.clear();
    if (!list.length) return;
    const s = this.s, rot = ([u, v]) => new THREE.Vector3(u * s.cos - v * s.sin, 0, u * s.sin + v * s.cos), O = rot(b.O), ex = rot(b.ex), ez = rot(b.ez), base = this.world.baseOf(b), up = new THREE.Vector3(0, 1, 0);
    const places = new Map();
    for (const u of list) {
      const pr = u.pr, along = pr.x1 - pr.x0 >= pr.z1 - pr.z0, L = along ? pr.x1 - pr.x0 : pr.z1 - pr.z0, levels = Math.max(2, Math.round(pr.h / 0.55)); let n = 0;
      const items = contents(this.store, this.planet, b, u, t).flatMap(i => Array.from({ length: Math.min(i.n, 6) }, () => i.id));
      for (const id of items) {
        const k = 'item_' + id; if (!this.lib?.cityPart?.(k)) continue;
        const col = n % Math.max(2, Math.floor(L / 0.28)), lv = Math.floor(n / Math.max(2, Math.floor(L / 0.28))) % levels; n++;
        const a = (col + 0.5) * L / Math.max(2, Math.floor(L / 0.28)), lx = along ? pr.x0 + a : (pr.x0 + pr.x1) / 2, lz = along ? (pr.z0 + pr.z1) / 2 : pr.z0 + a, y = (pr.y || 0) + 0.12 + lv * pr.h / levels;
        (places.get(k) || places.set(k, []).get(k)).push(O.clone().addScaledVector(ex, lx).addScaledVector(ez, lz).setY(base + y));
      }
    }
    const M = new THREE.Matrix4(), q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), ex), col = new THREE.Color();
    for (const [k, pts] of places) for (const part of this.lib.cityPart(k)) {
      const im = new THREE.InstancedMesh(part.geometry, part.material, pts.length);
      pts.forEach((p, i) => { M.compose(p, q, new THREE.Vector3(1, 1, 1)); im.setMatrixAt(i, M); if (part.tinted) im.setColorAt(i, col.setRGB(...kitTint(part.tinted, k, p.x, p.z))); });
      im.frustumCulled = false; this.group.add(im);
    }
  }
}
