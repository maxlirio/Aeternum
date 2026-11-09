// Draws ships: each model's hull and boarding ramp from the asset library, placed by the
// ship's logical frame (landed) or its flight state (centre, heading, pitch, roll). Models
// are built in their ship frame, so they need no fitting; a ramp swings about its hinge.
import { share } from './share.js';
import * as THREE from 'three';
import { shipPlan, LAYOUTS } from '../gen/ships.js';
// Liveries: deep paints, because a ship in full sun is bright already. Oxblood, signal orange, navy, ivory, gunmetal, forest, teal.
const LIVERY = [[0.3, 0.045, 0.04], [0.62, 0.22, 0.035], [0.035, 0.09, 0.22], [0.5, 0.48, 0.42], [0.055, 0.06, 0.07], [0.05, 0.16, 0.09], [0.03, 0.2, 0.22]];

const MAX = 10;
export class ShipView {
  constructor(lib) {
    this.group = new THREE.Group(); this.group.name = 'ships';
    const find = k => lib ? [...lib.variants.values()].find(v => v.kind === k) : null;
    const mk = prims => prims.map(pr => {
      const im = new THREE.InstancedMesh(share(pr.geometry), pr.material, MAX);
      im.count = 0; im.frustumCulled = false; im.castShadow = true; im.receiveShadow = true;
      if (pr.tinted) im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
      this.group.add(im); return { im, tinted: pr.tinted };
    });
    this.models = {};
    for (const model of Object.keys(LAYOUTS)) {
      if (model.endsWith('_decks')) continue;      // (the fleet's insides come with the fleet's own model: render/capital.js)
      const L = shipPlan(model).layout, hull = find(model), ramp = find(model + '_ramp');
      const box = (w, h, d, x, y, z) => [{ geometry: new THREE.BoxGeometry(w, h, d).translate(x, y, z), material: new THREE.MeshStandardMaterial({ color: 0xaaaaaa }), tinted: true }];
      const [hx0, hz0, hx1, hz1] = L.hull;
      const hinge = new THREE.Vector3((L.ramp.x0 + L.ramp.x1) / 2, L.deck, L.ramp.z1);
      const down = new THREE.Vector3(0, -L.deck, L.ramp.z0 - L.ramp.z1).normalize();
      this.models[model] = {
        L, hinge, raise: new THREE.Quaternion().setFromUnitVectors(down, new THREE.Vector3(0, 1, 0)),
        hullPrims: hull ? hull.prims : [],
        hull: mk(hull ? hull.prims : box(hx1 - hx0 + 0.6, L.ceiling - L.deck + 1, hz1 - hz0, (hx0 + hx1) / 2, (L.deck + L.ceiling) / 2, (hz0 + hz1) / 2)),
        ramp: mk(ramp ? ramp.prims : box(L.ramp.x1 - L.ramp.x0, 0.1, L.ramp.z1 - L.ramp.z0, hinge.x, L.deck / 2, (L.ramp.z0 + L.ramp.z1) / 2)),
      };
    }
    // landing gear, made of its parts and drawn here so it can move: a leg at each of the four points the ship stands on (player/flight.js
    // feet), its strut down from inside the hull, a polished piston, a torque link, a foot; bay doors that swing open for it
    const gm = (c, r, mt) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: mt });
    const GP = { strut: [new THREE.CylinderGeometry(0.1, 0.12, 1, 12).translate(0, -0.5, 0), gm(0x2a2c30, 0.55, 0.6)], piston: [new THREE.CylinderGeometry(0.07, 0.07, 0.42, 12).translate(0, -0.79, 0), gm(0xd8dade, 0.15, 1)],
      link: [new THREE.BoxGeometry(0.035, 0.36, 0.05).rotateX(0.5).translate(0, -0.72, 0.09), gm(0x55585e, 0.4, 0.8)], foot: [new THREE.CylinderGeometry(0.2, 0.26, 0.09, 18).translate(0, 0.045, 0), gm(0x1c1d20, 0.7, 0.4)],
      door: [new THREE.BoxGeometry(0.34, 0.025, 0.8).translate(0.17, 0, 0), gm(0x3a3c40, 0.5, 0.5)] };
    this.gearParts = Object.fromEntries(Object.entries(GP).map(([k, [g, m]]) => { const im = new THREE.InstancedMesh(g, m, 512); im.count = 0; im.frustumCulled = false; im.castShadow = true; this.group.add(im); return [k, im]; }));
    for (const [model, M] of Object.entries(this.models)) {
      const L = M.L, pts = [[L.W / 2 + L.W * 0.3, L.D / 2 + L.D * 0.32], [L.W / 2 - L.W * 0.3, L.D / 2 + L.D * 0.32], [L.W / 2 + L.W * 0.3, L.D / 2 - L.D * 0.32], [L.W / 2 - L.W * 0.3, L.D / 2 - L.D * 0.32]];
      // how high the hull's underside is over each foot: from the model itself
      const low = pts.map(() => Infinity), v = new THREE.Vector3();
      for (const pr of M.hullPrims) { if (pr.slot === 'glow') continue; const P = pr.geometry.attributes.position; for (let i = 0; i < P.count; i++) { v.fromBufferAttribute(P, i); pts.forEach(([x, z], k) => { if (Math.abs(v.x - x) < 0.9 && Math.abs(v.z - z) < 0.9 && v.y > 0.12 && v.y < low[k]) low[k] = v.y; }); } }
      M.gear = pts.map(([x, z], k) => ({ x, z, bot: Math.min(Number.isFinite(low[k]) ? low[k] : L.deck * 0.6, L.deck + 0.2) }));
    }
    this.gearAnim = new Map();   // ship id → how far its gear is down, 0..1
    this.anim = new Map();      // ship id → ramp openness 0..1
    this._m = new THREE.Matrix4(); this._r = new THREE.Matrix4(); this._c = new THREE.Color(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler(0, 0, 0, 'YXZ');
  }
  // list: [{ id, model, c (render space ground point under the centre), facing, pitch?, roll?, colour, rampDown }]
  putGear(k, m) { const im = this.gearParts[k], i = this.gearN[im.uuid] = (this.gearN[im.uuid] || 0); if (i >= 512) return; im.setMatrixAt(i, m); this.gearN[im.uuid]++; }
  gearOf(id) { return this.gearAnim.get(id); }
  update(list, dt) {
    const n = {}; this.gearN = {}; this.gearSeen = new Set();
    for (const s of list) {
      const M = this.models[s.model || 'shuttle']; if (!M || this.hidden?.(s)) continue; if (this.viewer && Math.hypot(s.c[0] - this.viewer[0], s.c[2] - this.viewer[2]) > 2400) continue;     // (too far to see)
      const i = n[s.model || 'shuttle'] = (n[s.model || 'shuttle'] ?? 0); if (i >= MAX) continue;
      const { W, D } = M.L;
      this._e.set(-(s.pitch || 0), s.facing, s.roll || 0);
      this._m.compose(new THREE.Vector3(...s.c), this._q.setFromEuler(this._e), new THREE.Vector3(1, 1, 1)).multiply(new THREE.Matrix4().makeTranslation(-W / 2, 0, -D / 2));
      const col = LIVERY[(((s.colour | 0) % LIVERY.length) + LIVERY.length) % LIVERY.length];     // (whatever a ship's record says, drawing it must not stop the game)
      this._c.setRGB(col[0], col[1], col[2]);
      for (const { im, tinted } of M.hull) { im.setMatrixAt(i, this._m); if (tinted) im.setColorAt(i, this._c); }
      let a = this.anim.get(s.id) ?? (s.rampDown ? 1 : 0);
      a += Math.max(-dt / 2.5, Math.min(dt / 2.5, (s.rampDown ? 1 : 0) - a)); this.anim.set(s.id, a);
      const q = new THREE.Quaternion().slerp(M.raise, 1 - a), h = M.hinge;
      this._r.copy(this._m).multiply(new THREE.Matrix4().makeTranslation(h.x, h.y, h.z)).multiply(new THREE.Matrix4().makeRotationFromQuaternion(q)).multiply(new THREE.Matrix4().makeTranslation(-h.x, -h.y, -h.z));
      for (const { im, tinted } of M.ramp) { im.setMatrixAt(i, this._r); if (tinted) im.setColorAt(i, this._c); }
      n[s.model || 'shuttle']++;
      // the gear: down on the ground, or when it's been asked for; up and stowed in the hull otherwise
      let g = this.gearAnim.get(s.id) ?? (s.gear ?? 1); g += Math.max(-dt / 2.2, Math.min(dt / 2.2, (s.gear ?? 1) - g)); this.gearAnim.set(s.id, g); this.gearSeen.add(s.id);
      const legT = Math.min(1, g * 1.35), doorT = Math.min(1, g * 3, (1 - g) * 6 + (g > 0.98 ? 0.75 : 0));      // (the doors open first, the leg swings down; closed again once it's stowed)
      for (const G of M.gear || []) {
        if (G.bot < 0.3) continue; const top = G.bot + 0.25, fold = (1 - legT) * Math.PI / 2, len = top * (0.62 + 0.38 * legT);
        if (g > 0.01) {
          const base = this._m.clone().multiply(new THREE.Matrix4().makeTranslation(G.x, top, G.z)).multiply(new THREE.Matrix4().makeRotationX(G.z > M.L.D / 2 ? fold : -fold));      // (each leg folds in toward the middle of the ship)
          const S = base.clone().multiply(new THREE.Matrix4().makeScale(1, len, 1));
          this.putGear('strut', S); this.putGear('piston', S); this.putGear('link', S); this.putGear('foot', base.clone().multiply(new THREE.Matrix4().makeTranslation(0, -len, 0)));
        }
        for (const sx of [-1, 1]) this.putGear('door', this._m.clone().multiply(new THREE.Matrix4().makeTranslation(G.x + sx * 0.34, G.bot - 0.02, G.z)).multiply(new THREE.Matrix4().makeRotationZ(sx > 0 ? Math.PI + doorT * 1.35 : -doorT * 1.35)));
      }
    }
    for (const im of Object.values(this.gearParts)) { im.count = this.gearN[im.uuid] || 0; im.instanceMatrix.needsUpdate = true; }
    for (const id of [...this.gearAnim.keys()]) if (!this.gearSeen.has(id)) this.gearAnim.delete(id);
    for (const [model, M] of Object.entries(this.models)) for (const { im, tinted } of [...M.hull, ...M.ramp]) {
      im.count = n[model] || 0; im.instanceMatrix.needsUpdate = true; if (tinted && im.instanceColor) im.instanceColor.needsUpdate = true;
    }
  }
  rampOpen(id) { return (this.anim.get(id) ?? 1) > 0.98; }
}
