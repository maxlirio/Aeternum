// Walk-in country buildings near you (world/sitereal.js): each gets real walls with real openings,
// floors, stairs, rooms and furniture, and joins the collision world; its model in the outposts' view
// is hidden meanwhile. Outside it looks the same as the model it stands in for (one design, one plan).
// A few at a time, nearest first, built one per frame as you approach.
import { share } from './share.js';
import * as THREE from 'three';
import { MeshBuilder } from './meshbuilder.js';
import { buildBuilding } from './building-mesh.js';
import { PropView } from './props.js';
import { kitTint } from './city.js';
import { shellOf } from './housegen.js';
import { formSurface } from './forms.js';
import { sitesNear } from '../gen/outposts.js';
import { siteReal } from '../world/sitereal.js';
import { doorState } from '../world/doors.js';

const NEAR = 42, FAR = 58, MAX = 8, FLOORS = { house: 'plank', hab: 'plank', workshop: 'concrete', store: 'plank', office: 'floortile' };
const IS = /^gb_(?!step)/;
export class SiteInteriors {
  constructor(planet, s, world, view, lib, store, kitOf) {
    Object.assign(this, { planet, s, world, view, lib, store, kitOf });
    this.group = new THREE.Group(); this.group.name = 'site-interiors';
    this.live = new Map(); this.now = 0;
  }
  skin(D) { const S = n => this.lib.wornSurface(n); return { wall: S(D.wall), trim: S(D.trim === 'rubber' ? 'metal' : D.trim), floor: S(FLOORS[D.type] || 'plank') }; }
  build(rec, it) {
    const D = rec.design, g = new THREE.Group(); g.position.set(rec.worldO[0], it.y, rec.worldO[1]);
    const c = Math.cos(it.rot), sn = Math.sin(it.rot), frame = [[0, 0, 0], [c, 0, -sn], [sn, 0, c]];
    const mb = new MeshBuilder(), pv = new PropView(this.lib, 22);
    mb.propSink = (pr, fr, len, dep, rng) => pv.add(pr, fr, len, dep, rng);     // furniture from the asset library, as in town
    const b = Object.assign(Object.create(rec), { skin: this.skin(D) });
    buildBuilding(mb, rec.plan, b, frame);
    const meshes = mb.build(); for (const m of meshes) { m.castShadow = true; m.receiveShadow = true; g.add(m); }
    const pm = pv.build(); if (pm) g.add(pm);
    // what stands outside the walls: the model's own frame, centred on the item
    const shell = new THREE.Group(); shell.position.set(it.x - rec.worldO[0], 0, it.z - rec.worldO[1]); shell.rotation.y = it.rot; g.add(shell);
    const col = new THREE.Color(), parts = [];
    for (const p of shellOf(D, rec.plan)) {
      const im = new THREE.InstancedMesh(share(p.geometry), formSurface(this.lib.wornSurface, p.surface, p.tinted), 1); im.setMatrixAt(0, new THREE.Matrix4());
      if (p.tinted) im.setColorAt(0, col.setRGB(...kitTint(p.tinted, it.k, it.x, it.z)));
      im.frustumCulled = false; im.castShadow = true; im.receiveShadow = true; shell.add(im); parts.push(p.geometry);
    }
    // the front door, on a hinge
    const dr = rec.plan.doors[rec.plan.entrance], roll = dr.kind === 'hangar', leafGeo = new THREE.BoxGeometry(dr.width - 0.03, dr.height - 0.03, 0.06); leafGeo.translate(roll ? 0 : (dr.width - 0.03) / 2, (dr.height - 0.03) / 2, 0);
    const leaf = roll ? new THREE.Mesh(leafGeo, this.lib.wornSurface('metal')) : new THREE.InstancedMesh(leafGeo, this.lib.wornSurface('tint', 'bright'), 1);
    if (!roll) { leaf.setMatrixAt(0, new THREE.Matrix4()); leaf.setColorAt(0, col.setRGB(...kitTint('bright', it.k, it.x, it.z))); leaf.frustumCulled = false; }
    const hx = roll ? dr.x : dr.x - dr.width / 2, hinge = new THREE.Group(); hinge.position.set(c * hx + sn * 0.09, 0, -sn * hx + c * 0.09); hinge.rotation.y = it.rot; hinge.add(leaf); g.add(hinge);
    leaf.castShadow = true;
    // what it's fitted out with: kit models on the floor, built only when you're close to it
    for (const q of rec.plan.decor || []) for (const part of this.kitOf(q.k) || this.kitOf('common_' + q.k) || []) {
      const im = new THREE.InstancedMesh(share(part.geometry), part.material, 1), P = new THREE.Vector3(c * q.x + sn * q.z, 0, -sn * q.x + c * q.z), M = new THREE.Matrix4().makeRotationY(it.rot + q.rot).setPosition(P); im.setMatrixAt(0, M); im.userData.shared = true;
      if (part.tinted) im.setColorAt(0, col.setRGB(...kitTint(part.tinted, q.k, q.x, q.z))); im.frustumCulled = false; im.castShadow = true; im.receiveShadow = true; g.add(im);
    }
    this.group.add(g);
    return { rec, g, pv, parts, hinge, leaf, roll, a: 0, it };
  }
  // an E on this door, or its lock: the door you're at, within reach and on your level
  doorNear(pos) {
    let best = null;
    for (const L of this.live.values()) {
      const dr = L.rec.plan.doors[L.rec.plan.entrance], lx = dr.x, u = L.rec.worldO, c = Math.cos(L.it.rot), sn = Math.sin(L.it.rot), x = u[0] + c * lx + sn * dr.z, z = u[1] - sn * lx + c * dr.z;
      if (Math.abs(pos[1] - L.rec.base) > 1.4) continue;
      const d = Math.hypot(x - pos[0], z - pos[2]) - dr.width / 2 + 0.5;
      if (d < 2.2 && (!best || d < best.d)) best = { b: L.rec, door: dr, d };
    }
    return best;
  }
  update(pos, t) {
    this.now = t;
    const want = [], x = pos[0], z = pos[2];
    sitesNear(this.planet, x, z, FAR, S => { if (Math.hypot(S.x - x, S.z - z) > S.clear + FAR + 60) return; S.items.forEach((it, i) => { if (!IS.test(it.k)) return; const d = Math.hypot(it.x - x, it.z - z); if (d < FAR) want.push([it, i, S, d]); }); });
    want.sort((a, b) => a[3] - b[3]);
    const keep = new Set(); let built = 0;
    for (const [it, i, S, d] of want.slice(0, MAX)) {
      const rec = siteReal(this.planet, this.s, S, it, i);
      if (this.live.has(rec.key)) { const L = this.live.get(rec.key); L.it = it; it.live = true; this.view.hide(it, true); keep.add(rec.key); continue; }
      if (d > NEAR || built) continue;     // (one a frame, and only once you're properly near)
      const L = this.build(rec, it); built++;
      rec.doorPassable = id => id !== rec.plan.entrance || this.isOpen(rec);
      this.world.addStructure(rec); if (rec.stoop) this.world.addStructure(rec.stoop);
      it.live = true; this.view.hide(it, true);
      this.live.set(rec.key, L); keep.add(rec.key);
    }
    for (const [key, L] of this.live) {
      if (!keep.has(key)) { this.drop(key, L); continue; }
      L.pv?.update(x - L.g.position.x, pos[1] - L.g.position.y, z - L.g.position.z);
      // the door swings to match its state
      const goal = this.isOpen(L.rec) ? 1 : 0; L.a += Math.sign(goal - L.a) * Math.min(Math.abs(goal - L.a), 0.05);
      if (L.roll) { L.leaf.scale.y = 1 - 0.9 * L.a; L.leaf.position.y = L.rec.plan.doors[L.rec.plan.entrance].height * 0.9 * L.a; }
      else L.leaf.rotation.y = -1.75 * L.a;
    }
  }
  isOpen(rec) { const dr = rec.plan.doors[rec.plan.entrance], st = doorState(this.store, this.planet, rec, dr, this.now); return st.open || (rec.design.access === null); }
  drop(key, L) {
    this.group.remove(L.g); L.g.traverse(o => { if (o.isInstancedMesh) o.dispose(); else if (o.isMesh && !o.userData.shared) o.geometry?.dispose(); });
    for (const g of L.parts) g.dispose();
    const rec = L.rec; this.world.removeStructure(rec); this.world.cols.delete(rec.key); if (rec.stoop) { this.world.removeStructure(rec.stoop); this.world.cols.delete(rec.stoop.key); }
    L.it.live = false; this.view.hide(L.it, false); this.live.delete(key);
  }
}
