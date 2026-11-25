// Draws the fight inside a boarded ship (sim/boarding.js): its marines (the same built-up soldier as the line's, render/infantry.js, in the
// ship's own dark fatigues), their tracers and muzzle flashes, and the charge once it's set: a demolition pack strapped to the lance's
// coolant junction, its fuse light quickening as it runs down.
import * as THREE from 'three';
import { buildRig } from '../player/avatar.js';
import { armParts } from './weapons.js';
import { soldierPose } from './infantry.js';

const MAX = 40, KIT = { suit: 0x2a1c1a, pad: 0x141112, hair: 0x1c1616, accent: 0xb03a20 }, SKIN = [0xe2b99a, 0xc9967a, 0xb48a6e, 0x8d5f45, 0x6b4532, 0xd8a888];
const hashId = s => { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; };

export class BoardingView {
  constructor(scene, planet, toRender) {
    this.toRender = toRender; this.group = new THREE.Group(); this.group.name = 'boarding'; this.group.visible = false; scene.add(this.group);
    const white = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 }); this.rig = buildRig({ suit: white, pad: white, skin: white, hair: white, accent: white });
    // (lit by the ship's own lamps, which the scene's sun knows nothing of: they carry a little light of their own so they read in there)
    const lit = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, emissive: 0x30201c, emissiveIntensity: 0.5 });
    this.meshes = this.rig.parts.map(({ mesh, kind }) => { const im = new THREE.InstancedMesh(mesh.geometry, lit, MAX); im.count = 0; im.frustumCulled = false; im.userData.kind = kind; this.group.add(im); return im; });
    this.guns = armParts(planet, 'carbine').map(p => { const im = new THREE.InstancedMesh(p.geometry, p.material, MAX); im.count = 0; im.frustumCulled = false; this.group.add(im); return im; });
    this.tr = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.tr.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX * 6), 3)); this.tr.geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(MAX * 6), 3)); this.tr.frustumCulled = false; this.group.add(this.tr);
    this.flash = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ color: 0xff9a6a, size: 0.5, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.flash.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX * 3), 3)); this.flash.frustumCulled = false; this.group.add(this.flash);
    this.col = new THREE.Color(); this.gait = new Map(); this.last = new Map(); this.vel = new Map(); this.m = new THREE.Matrix4();
    // the charge: two blocks in a canvas carrier strapped round a pipe, a fuse box on top with its light and its dial, the firing lead between them
    const C = this.charge = new THREE.Group(), box = (w, h, d, x, y, z, m) => { const q = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); q.position.set(x, y, z); C.add(q); return q; };
    const canvas = new THREE.MeshStandardMaterial({ color: 0x4a4a32, roughness: 0.95 }), steel = new THREE.MeshStandardMaterial({ color: 0x2a2c30, roughness: 0.5, metalness: 0.7 }), strap = new THREE.MeshStandardMaterial({ color: 0x15140f, roughness: 0.9 });
    box(0.34, 0.24, 0.16, -0.19, 0, 0, canvas); box(0.34, 0.24, 0.16, 0.19, 0, 0, canvas); for (const x of [-0.3, -0.08, 0.08, 0.3]) box(0.035, 0.26, 0.18, x, 0, 0, strap);
    box(0.2, 0.09, 0.12, 0, 0.165, 0, steel); const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.02, 14), steel); dial.position.set(-0.05, 0.22, 0); C.add(dial);
    this.lamp = new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff3018 })); this.lamp.position.set(0.05, 0.225, 0); C.add(this.lamp);
    const lead = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.008, 6, 14, Math.PI), strap); lead.position.set(0.02, 0.16, 0.06); lead.rotation.y = Math.PI / 2; C.add(lead);
    C.visible = false; this.group.add(C);
  }
  update(B, dt, t) {
    if (!B) { this.group.visible = false; return; } this.group.visible = true;
    const rig = this.rig, n = Math.min(MAX, B.men.length);
    for (let i = 0; i < n; i++) {
      const M = B.men[i], h = hashId(M.id); let ph = this.gait.get(M.id) || 0; if (M.moving) ph += dt * 6.2; this.gait.set(M.id, ph);
      rig.root.position.set(...this.toRender(...M.pos)); rig.root.rotation.set(0, M.facing, 0); rig.root.scale.setScalar(0.96 + (h % 10) / 100);
      { const L0 = this.last.get(M.id); this.last.set(M.id, [M.pos[0], M.pos[2]]); if (L0 && dt > 0) { const vx = (M.pos[0] - L0[0]) / dt, vz = (M.pos[2] - L0[1]) / dt, v = Math.hypot(vx, vz), S = this.vel.get(M.id) || { v: 0, back: 0 }; S.v += (v - S.v) * Math.min(1, dt * 5); S.back = v > 0.4 ? (vx * Math.sin(M.facing) + vz * Math.cos(M.facing)) / v : S.back; this.vel.set(M.id, S); } }
      const ok = soldierPose(rig, M, ph, B.t, this.vel.get(M.id));
      if (M.hp <= 0 && !ok) { const lying = M.dead >= 0.55; rig.root.rotation.set(0, M.fall + Math.PI, 0); rig.root.rotateX(-Math.PI / 2 * (lying ? 1 : rig.fallTilt || 0)); }
      rig.root.updateMatrixWorld(true);
      this.meshes.forEach((im, k) => { im.setMatrixAt(i, rig.parts[k].mesh.matrixWorld); im.setColorAt(i, this.col.setHex(im.userData.kind === 'skin' ? SKIN[h % SKIN.length] : KIT[im.userData.kind])); });
      this.m.copy(rig.gunSock.matrixWorld); if (M.hp <= 0) this.m.makeTranslation(0, -100, 0);
      for (const im of this.guns) im.setMatrixAt(i, this.m);
    }
    for (const im of this.meshes.concat(this.guns)) { im.count = n; im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; }
    const tp = this.tr.geometry.attributes.position, tc = this.tr.geometry.attributes.color, fp = this.flash.geometry.attributes.position; let k = 0;
    for (const S of B.shots) { if (k >= MAX) break; const age = (B.t - S.t) / 0.25, f0 = Math.min(1, age * 1.4), f1 = Math.min(1, f0 + 0.18), A = S.from, Z = S.to, a = this.toRender(A[0] + (Z[0] - A[0]) * f0, A[1] + (Z[1] - A[1]) * f0, A[2] + (Z[2] - A[2]) * f0), b = this.toRender(A[0] + (Z[0] - A[0]) * f1, A[1] + (Z[1] - A[1]) * f1, A[2] + (Z[2] - A[2]) * f1), w = Math.max(0, 1 - age);
      tp.setXYZ(2 * k, ...a); tp.setXYZ(2 * k + 1, ...b); tc.setXYZ(2 * k, w, 0.5 * w, 0.3 * w); tc.setXYZ(2 * k + 1, w, 0.5 * w, 0.3 * w); fp.setXYZ(k, ...(age < 0.3 ? this.toRender(...A) : [0, -1e4, 0])); k++; }
    this.tr.geometry.setDrawRange(0, k * 2); this.flash.geometry.setDrawRange(0, k); tp.needsUpdate = tc.needsUpdate = fp.needsUpdate = true;
    // the charge, on the junction's face
    this.charge.visible = B.fuse != null && !B.blown;
    if (this.charge.visible) { const c = B.L.charge, p = B.toWorld(c[0], c[1] + 1.25, c[2] + 0.42); this.charge.position.set(...this.toRender(...p)); this.charge.rotation.y = B.f; const rate = B.fuse > 30 ? 1 : B.fuse > 10 ? 2.5 : 7; this.lamp.visible = (t * rate) % 1 < 0.5; }
  }
}
