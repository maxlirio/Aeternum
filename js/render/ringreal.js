// The houses of the Commons drawn as what they are (world/ringreal.js plots). From across the ring each is its shell: a block of its size and
// colour with its floors and windows. Near you it's the real building: walls with real openings, floors, stairs, rooms and furniture, built
// flat as any town building is and then set rigidly where its plot lies on the curve of the ring (up is toward the axle), in the ring's own
// turning frame and lit as the ring is (render/rings.js). Built one a frame, dropped when you're well away.
import * as THREE from 'three';
import { MeshBuilder } from './meshbuilder.js';
import { buildBuilding } from './building-mesh.js';
import { PropView } from './props.js';
import { ringLit } from './rings.js';
import { shellMaterial } from './vesperreal.js';
import { W } from '../gen/rings.js';
import { ringPlots, plotReal, plotFrame, DEPTH, STOREY } from '../world/ringreal.js';

const NEAR = 110, FAR = 150;
const WALLS = [[0.82, 0.76, 0.66], [0.62, 0.66, 0.7], [0.74, 0.6, 0.52], [0.55, 0.58, 0.52], [0.86, 0.84, 0.8], [0.48, 0.5, 0.56], [0.7, 0.68, 0.6], [0.66, 0.55, 0.48]];
// the rigid move that takes the flat strip round (xc, 0, sc) to where that piece of floor is in the ring's turning frame
export function bendMatrix(g, xc, sc, out = new THREE.Matrix4()) {
  const a = sc / g.Rf, sa = Math.sin(a), ca = Math.cos(a);
  // flat x → (0, 0, -1); flat y (up) → (-sin a, cos a, 0); flat s → (cos a, sin a, 0)
  out.set(0, -sa, ca, 0, 0, ca, sa, 0, -1, 0, 0, 0, 0, 0, 0, 1);
  return out.premultiply(new THREE.Matrix4().makeTranslation(g.Rf * sa, -g.Rf * ca, W / 2 - xc)).multiply(new THREE.Matrix4().makeTranslation(-xc, 0, -sc));
}
export class RingHouses {
  // ringView: render/rings.js (its turning groups are what these are drawn in); structs: the rings' structures in the collision world
  constructor(planet, s, world, lib, ringView, structs) {
    Object.assign(this, { planet, s, world, lib, ringView, structs }); this.live = new Map(); this.shells = new Map(); this.mats = new Map(); this._m = new THREE.Matrix4();
  }
  turnOf(g) { return this.ringView.spin.find(q => q.g === g)?.turn || null; }
  lit(g, base, inst = false) { const k = g.key + (inst ? 'i' : '') + base.uuid; let m = this.mats.get(k); if (!m) { m = ringLit(base, g, { day: this.ringView.U.day, glass: { value: 0.4 } }, inst); this.mats.set(k, m); } return m; }
  shellMatrix(g, P, hide = false) {
    const h = P.floors * STOREY + 0.6, F = plotFrame(P), xc = F.O[0] + F.bz[0] * DEPTH / 2, sc = (P.a0 + P.a1) / 2, M = bendMatrix(g, xc, sc, this._m);
    return M.multiply(new THREE.Matrix4().compose(new THREE.Vector3(xc, h / 2, sc), new THREE.Quaternion(), hide ? new THREE.Vector3(0, 0, 0) : new THREE.Vector3(DEPTH, h, P.w))).clone();
  }
  // every plot's shell, in the ring's turning frame
  shellsFor(g, turn) {
    const U = ringPlots(g), base = shellMaterial(), m = ringLit(base, g, { day: this.ringView.U.day, glass: { value: 0.4 } }, true), lit = m.onBeforeCompile; m.onBeforeCompile = sh => { base.onBeforeCompile(sh); lit(sh); }; m.customProgramCacheKey = () => 'ring-shell-' + g.key;
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), m, U.length), c = new THREE.Color(); im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(U.length * 3), 3);
    U.forEach((P, i) => { im.setMatrixAt(i, this.shellMatrix(g, P)); im.setColorAt(i, c.setRGB(...WALLS[P.colour % WALLS.length])); });
    im.frustumCulled = false; im.name = 'ring-houses'; turn.add(im); this.shells.set(g.key, im); return im;
  }
  // ringB: the ring you're in (its structure), or null. pos: where you are (flat, world)
  update(ringB, pos) {
    if (!this.ringView.built) return;
    for (const b of this.structs) { const g = b.plan.ring; if (g.kind !== 'town' || this.shells.has(g.key)) continue; const turn = this.turnOf(g); if (turn) this.shellsFor(g, turn); }
    const g = ringB?.plan.ring, here = g && g.kind === 'town' ? this.world.toB(ringB, pos[0], pos[2]) : null;
    const away = (P, lim) => { if (!here || P.ring !== g.key) return true; let d = Math.abs((P.a0 + P.a1) / 2 - here[1]); if (d > g.C / 2) d = g.C - d; return d > lim; };
    if (here) { const turn = this.turnOf(g);
      for (const P of ringPlots(g)) { if (this.live.has(P) || away(P, NEAR)) continue;
        const rec = plotReal(this.planet, this.s, ringB, g, P); if (!rec || !turn) continue;
        const F = plotFrame(P), mb = new MeshBuilder(), pv = this.lib ? new PropView(this.lib, 1e5) : null; if (pv) mb.propSink = (pr, fr, len, dep, rng) => pv.add(pr, fr, len, dep, rng);
        buildBuilding(mb, rec.plan, rec, [[F.O[0], 0, F.O[1]], [F.bx[0], 0, F.bx[1]], [F.bz[0], 0, F.bz[1]]], this.planet);
        const M = bendMatrix(g, F.O[0] + F.bz[0] * DEPTH / 2, (P.a0 + P.a1) / 2), meshes = mb.build();
        for (const m of meshes) { m.geometry.applyMatrix4(M); m.material = this.lit(g, m.material); m.castShadow = false; m.receiveShadow = false; m.frustumCulled = false; }
        if (pv) { const grp = pv.build(); if (grp) { pv.update(F.O[0], 0, F.O[1]); const q = new THREE.Matrix4();
            grp.traverse(o => { if (!o.isInstancedMesh) return; for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, q); o.setMatrixAt(i, q.premultiply(M)); } o.instanceMatrix.needsUpdate = true; o.material = this.lit(g, o.material, true); o.frustumCulled = false; o.castShadow = false; }); meshes.push(grp); } }
        turn.add(...meshes); const im = this.shells.get(g.key); if (im) { im.setMatrixAt(P.id, this.shellMatrix(g, P, true)); im.instanceMatrix.needsUpdate = true; }
        this.live.set(P, { g, turn, meshes }); break; } }      // (one a frame)
    for (const [P, L] of this.live) { if (!away(P, FAR)) continue;
      for (const m of L.meshes) { L.turn.remove(m); m.traverse?.(o => o.geometry?.dispose?.()); }
      const im = this.shells.get(L.g.key); if (im) { im.setMatrixAt(P.id, this.shellMatrix(L.g, P)); im.instanceMatrix.needsUpdate = true; }
      this.live.delete(P); }
  }
}
