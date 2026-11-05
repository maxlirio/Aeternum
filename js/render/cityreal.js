// Walk-in city buildings near you (world/cityreal.js): each gets the town's building mesh
// (shell with real openings, floors, stairs, rooms, furniture) and joins the collision
// world as a structure; its stand-in box in the city's instanced mesh is hidden meanwhile.
// Built a couple per frame as you approach, dropped when you're far.
import { share } from './share.js';
import * as THREE from 'three';
import { MeshBuilder } from './meshbuilder.js';
import { buildBuilding } from './building-mesh.js';
import { blocksNear } from '../gen/city.js';
import { realOf } from '../world/cityreal.js';
import { PropView } from './props.js';
import { kitTint } from './city.js';

const NEAR = 130, FAR = 190;
export class CityInteriors {
  constructor(planet, s, city, world, cityView, lib = null) {
    Object.assign(this, { planet, s, city, world, cityView, lib });
    this.group = new THREE.Group(); this.group.name = 'city-interiors'; this.group.position.set(s.cx, 0, s.cz);   // (the settlement frame)
    this.live = new Map();        // record key → { rec, meshes }
  }
  frame(rec) {
    const s = this.s, rot = ([u, v]) => [u * s.cos - v * s.sin, 0, u * s.sin + v * s.cos], o = rot(rec.O);
    return [[o[0], rec.base, o[2]], rot(rec.ex), rot(rec.ez)];
  }
  // Its furniture, built only when you're close (a few draw calls per building you might walk into).
  decor(L, pos) {
    const rec = L.rec, near = pos && rec.decor && Math.hypot(pos[0] - this.s.toWorld((rec.rect[0] + rec.rect[2]) / 2, (rec.rect[1] + rec.rect[3]) / 2)[0], pos[2] - this.s.toWorld((rec.rect[0] + rec.rect[2]) / 2, (rec.rect[1] + rec.rect[3]) / 2)[1]) < 35;
    if (!near) { if (L.items) { for (const m of L.items) { this.group.remove(m); m.dispose(); } L.items = null; } return; }
    if (L.items) return;
    L.items = [];
    const [o, ex, ez] = this.frame(rec), X = new THREE.Vector3(...ex), Z = new THREE.Vector3(...ez), Y = new THREE.Vector3(0, 1, 0), base = new THREE.Matrix4().makeBasis(X, Y, Z), M = new THREE.Matrix4(), col = new THREE.Color();
    for (const d of rec.decor) for (const part of this.cityView.kit(d.k) || this.cityView.kit('common_' + d.k)) {
      const P = new THREE.Vector3(...o).addScaledVector(X, d.x).addScaledVector(Z, d.z);
      const im = new THREE.InstancedMesh(share(part.geometry), part.material, 1); M.copy(base).multiply(new THREE.Matrix4().makeRotationY(d.rot)).setPosition(P); im.setMatrixAt(0, M);
      if (part.tinted) im.setColorAt(0, col.setRGB(...kitTint(part.tinted, d.k, d.x, d.z))); im.frustumCulled = false; im.castShadow = true; im.receiveShadow = true; this.group.add(im); L.items.push(im);
    }
  }
  update(pos) {
    const c = this.city, [u, v] = c.toLocal(pos[0], pos[2]);
    if (Math.hypot(u, v) > c.R + 300 && !this.live.size) return;
    const want = new Map();
    if (Math.hypot(u, v) < c.R + 300) blocksNear(c, u, v, NEAR, B => { for (const b of B.buildings) if (b.enter) {
      const t = b.tiers[0], d = Math.hypot((t.r[0] + t.r[2]) / 2 - u, (t.r[1] + t.r[3]) / 2 - v);
      if (d < NEAR) want.set(b.id, [B, b, d]);
    } });
    let built = 0;
    for (const [id, [B, b]] of [...want].sort((p, q) => p[1][2] - q[1][2])) {
      if (this.live.has(id) || built >= 2) continue;
      const rec = realOf(this.planet, this.s, c, B, b); if (!rec) continue;
      const mb = new MeshBuilder(), pv = this.lib ? new PropView(this.lib, 22) : null;
      if (pv) mb.propSink = (pr, fr, len, dep, rng) => pv.add(pr, fr, len, dep, rng);     // furniture from the asset library, as in town
      buildBuilding(mb, rec.plan, rec, this.frame(rec));
      const meshes = mb.build(); for (const m of meshes) { m.castShadow = true; m.receiveShadow = true; }
      if (pv) meshes.push(pv.build());
      this.group.add(...meshes);
      this.world.addStructure(rec); this.cityView.hideTier(b.id, true);
      this.live.set(id, { rec, meshes, pv }); built++;
    }
    const lx = pos[0] - this.s.cx, lz = pos[2] - this.s.cz;
    for (const [id, L] of this.live) {
      if (L.pv) L.pv.update(lx, pos[1], lz);
      this.decor(L, pos);
      const t = L.rec, [cu, cv] = c.toLocal(...this.s.toWorld((t.rect[0] + t.rect[2]) / 2, (t.rect[1] + t.rect[3]) / 2));
      if (Math.hypot(cu - u, cv - v) < FAR) continue;
      this.decor(L, null); for (const m of L.meshes) { this.group.remove(m); m.geometry?.dispose(); }
      this.world.removeStructure(t); this.world.cols.delete(t.key); this.cityView.hideTier(id, false); this.live.delete(id);
    }
  }
}
