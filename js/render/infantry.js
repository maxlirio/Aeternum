// Draws the war on foot (sim/infantry.js): the soldiers, each in his side's fatigues and helmet with a carbine in his hands
// (the same gun model the player carries, render/weapons.js), aiming when he fires; their tracers; the sandbag walls, steel
// hedgehogs and coils of wire of the two lines; the objectives' flags, in the colour of whoever holds them.
import * as THREE from 'three';
import { lib, poseCrowd } from '../player/mixamo.js';
import { buildRig, applyPose, holdLong } from '../player/avatar.js';
import { armParts } from './weapons.js';
import { townSurface } from './materials.js';

const MAX = 64, SIDES = { ours: { suit: 0x4a5236, pad: 0x2a2c22, hair: 0x3a4030, accent: 0x9aa070 }, theirs: { suit: 0x5e4436, pad: 0x2e2420, hair: 0x4a3a30, accent: 0xb06a40 } };
const SKIN = [0xe2b99a, 0xc9967a, 0xb48a6e, 0x8d5f45, 0x6b4532, 0xd8a888];
const plainMats = new Map(), plain = n => { if (!plainMats.has(n)) { const m = townSurface(n).clone(); m.vertexColors = false; plainMats.set(n, m); } return plainMats.get(n); };
const FLAG = { ours: new THREE.Color(0x3a6ab0), theirs: new THREE.Color(0xb03a30), none: new THREE.Color(0xd8a030) };

export class InfantryView {
  constructor(scene, root, planet, toRender) {
    this.root = root; this.scene = scene; this.planet = planet; this.toRender = toRender; this.group = new THREE.Group(); this.group.name = 'infantry'; scene.add(this.group);
    const white = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 });
    this.rig = buildRig({ suit: white, pad: white, skin: white, hair: white, accent: white });
    this.meshes = this.rig.parts.map(({ mesh, kind }) => { const im = new THREE.InstancedMesh(mesh.geometry, white, MAX); im.count = 0; im.castShadow = true; im.frustumCulled = false; im.userData.kind = kind; this.group.add(im); return im; });
    this.guns = armParts(planet, 'carbine').map(p => { const im = new THREE.InstancedMesh(p.geometry, p.material, MAX); im.count = 0; im.castShadow = true; im.frustumCulled = false; this.group.add(im); return im; });
    // tracers: short bright streaks along each shot
    this.tr = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.tr.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX * 6), 3)); this.tr.geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(MAX * 6), 3)); this.tr.frustumCulled = false; this.group.add(this.tr);
    this.flash = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ color: 0xffd08a, size: 0.5, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.flash.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX * 3), 3)); this.flash.frustumCulled = false; this.group.add(this.flash);
    this.col = new THREE.Color(); this.gait = new Map(); this.last = new Map(); this.vel = new Map(); this.line = null; this.m = new THREE.Matrix4();
    // grenades in the air: a ribbed steel egg with its lever; and what the dead dropped: cells glowing blue, grenades olive
    const egg = new THREE.SphereGeometry(0.055, 10, 8); egg.scale(1, 1.3, 1);
    this.nadeIm = new THREE.InstancedMesh(egg, new THREE.MeshStandardMaterial({ color: 0x4c5432, roughness: 0.6, metalness: 0.4 }), 16); this.nadeIm.count = 0; this.nadeIm.frustumCulled = false; this.group.add(this.nadeIm);
    const cell = new THREE.CylinderGeometry(0.07, 0.07, 0.24, 12).rotateZ(Math.PI / 2);
    this.cellIm = new THREE.InstancedMesh(cell, new THREE.MeshStandardMaterial({ color: 0x60c8ff, emissive: 0x2a90ff, emissiveIntensity: 1.6, roughness: 0.3 }), 48); this.cellIm.count = 0; this.cellIm.frustumCulled = false; this.group.add(this.cellIm);
    this.dropNade = new THREE.InstancedMesh(egg, this.nadeIm.material, 48); this.dropNade.count = 0; this.dropNade.frustumCulled = false; this.group.add(this.dropNade);
  }
  // the lines' works, built once per front
  build(I) {
    if (this.line) { this.root.remove(this.line); this.line.traverse(o => { if (o.isMesh) o.geometry.dispose(); }); }
    const g = this.line = new THREE.Group(), m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), P = p => new THREE.Vector3(...p);       // (the works stand in the world group, which carries the floating origin)
    // sandbags: each a filled sack, flat where it beds on the one below and bulging at its sides, laid lengthways along the wall in four courses.
    // Each course is bedded into the one under it with the joints broken (a bag sits over the joint of the two below), the top course short of the ends.
    const BL = 0.6, BH = 0.25, BD = 0.4, LIFT = 0.205;
    const bag = new THREE.SphereGeometry(1, 16, 10); { const a = bag.attributes.position, pw = (v, e) => Math.sign(v) * Math.pow(Math.abs(v), e); for (let i = 0; i < a.count; i++) { const x = a.getX(i), y = a.getY(i), z = a.getZ(i), r = Math.hypot(x, z) || 1, sag = 1 + 0.1 * (1 - Math.abs(y)) * (y < 0 ? 1 : 0.4);
      a.setXYZ(i, pw(x, 0.55) * BL / 2 * 1.04 * sag, pw(y, 0.5) * BH / 2, pw(z, 0.62) * BD / 2 * sag); } bag.computeVertexNormals(); }
    const bags = []; for (const C of I.cover) { const n = Math.max(2, Math.round(C.len / BL)), step = C.len / n, ca = Math.cos(C.face), sa = Math.sin(C.face);
      for (let row = 0; row < 4; row++) { const odd = row % 2, cnt = n - odd - (row === 3 ? 2 : 0), off = (odd ? 0.5 : 0) + (row === 3 ? 1 : 0);
        for (let k = 0; k < cnt; k++) { const f = (k + off + 0.5) / n - 0.5, s = f * C.len, bow = C.curve * (f * f * 4 - 1) * 0.8, x = C.pos[0] + ca * s + sa * bow, z = C.pos[2] - sa * s + ca * bow;
          // (the bag lies along the wall where it is: the wall's own line, turned by its bow there)
          bags.push([x, (I.wallYAt ? I.wallYAt(C, x, z) : C.pos[1]) + BH / 2 - 0.03 + row * LIFT, z, C.face - Math.atan2(C.curve * 6.4 * f, C.len) + (Math.random() - 0.5) * 0.07, C, row]); } } }
    const bm = this.bagMesh = new THREE.InstancedMesh(bag, plain('canvas'), bags.length); this.bags = bags; bags.forEach(([x, y, z, a], i) => { q.setFromAxisAngle(up, a); m.compose(P([x, y, z]), q, new THREE.Vector3(1, 1, 1)); bm.setMatrixAt(i, m); bm.setColorAt(i, this.col.setRGB(0.62 + Math.random() * 0.08, 0.55 + Math.random() * 0.06, 0.4)); }); bm.castShadow = bm.receiveShadow = true; g.add(bm);
    // hedgehogs: three steel angles crossed and welded at the middle
    const beam = new THREE.BoxGeometry(0.16, 0.16, 2.3), hh = [], parts = [];
    for (const [rx, ry, rz] of [[0.6, 0, 0], [0, 0.6, Math.PI / 2], [Math.PI / 2, 0.6, 0.6]]) parts.push(beam.clone().applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz))));
    const hedge = mergeGeo(parts); hedge.translate(0, 0.72, 0);
    const props = I.props.filter(p => p.kind === 'hedgehog'), hm = new THREE.InstancedMesh(hedge, plain('rust'), props.length); props.forEach((p, i) => { q.setFromAxisAngle(up, p.rot); m.compose(P(p.pos), q, new THREE.Vector3(1, 1, 1)); hm.setMatrixAt(i, m); hm.setColorAt(i, this.col.setRGB(0.7, 0.62, 0.55)); }); hm.castShadow = true; g.add(hm);
    // wire: a coil of rings along each run, on pickets
    const ring = new THREE.TorusGeometry(0.45, 0.012, 4, 20), post = new THREE.CylinderGeometry(0.035, 0.045, 1.2, 6).translate(0, 0.6, 0), rings = [], posts = [];
    for (const W of I.props.filter(p => p.kind === 'wire')) { const n = Math.round(W.len / 0.32), ca = Math.cos(W.rot), sa = Math.sin(W.rot); for (let k = 0; k < n; k++) { const s = (k / n - 0.5) * W.len, x = W.pos[0] + sa * s, z = W.pos[2] + ca * s, S = W.segs?.find(S => s >= S.s0 - 1e-6 && s <= S.s1 + 1e-6); rings.push([x, I.ground(x, z) + 0.45, z, W.rot, k, S, s]); if (k % 9 === 0) posts.push([x, I.ground(x, z), z, S]); } }
    const rm = this.ringMesh = new THREE.InstancedMesh(ring, plain('metal'), rings.length); this.rings = rings; rings.forEach((r, i) => { rm.setColorAt(i, this.col.setRGB(0.6, 0.58, 0.55)); }); g.add(rm);
    const pm = this.postMesh = new THREE.InstancedMesh(post, plain('wood'), posts.length); this.posts = posts; posts.forEach((r, i) => pm.setColorAt(i, this.col.setRGB(0.5, 0.42, 0.34))); g.add(pm);
    this.worksSig = -1; this.works(I);
    // the heavy gun on each objective (sim/infantry.js stepGuns): a tripod of three splayed legs, the cradle on its pintle, and on that — turning
    // with the gun — the receiver, the ribbed barrel jacket and its muzzle, the spade grips, the shield with its slot, and the belt box
    this.gunPosts = [];
    { const steel = plain('metal').clone(); steel.color.setHex(0x30342f); const dark = plain('metal').clone(); dark.color.setHex(0x1b1d1c); const olive = plain('metal').clone(); olive.color.setHex(0x4a5236);
      for (const O of I.obj) { const G = O.gun, grp = new THREE.Group(); grp.position.copy(P(G.pos)); g.add(grp);
        for (let k = 0; k < 3; k++) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 1.05, 8).translate(0, -0.52, 0), steel); leg.position.set(0, 0.72, 0); leg.rotation.set(0.72, 0, 0); const hip = new THREE.Group(); hip.rotation.y = k * 2.094 + 0.5; hip.add(leg); grp.add(hip);
          const foot = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.03, 0.16), dark); foot.position.set(0, 0.02, 0.7); hip.add(foot); }
        const pintle = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.26, 10).translate(0, 0.8, 0), dark); grp.add(pintle);
        const piv = new THREE.Group(); piv.position.y = 0.95; grp.add(piv);
        const add = (geo, mat, x, y, z) => { const mm = new THREE.Mesh(geo, mat); mm.position.set(x, y, z); mm.castShadow = true; piv.add(mm); return mm; };
        add(new THREE.BoxGeometry(0.14, 0.08, 0.3), dark, 0, -0.03, 0.02);                                           // cradle
        add(new THREE.BoxGeometry(0.11, 0.16, 0.52), steel, 0, 0.09, -0.05);                                         // receiver
        add(new THREE.CylinderGeometry(0.045, 0.045, 0.78, 12).rotateX(Math.PI / 2), steel, 0, 0.1, 0.6);            // barrel jacket
        for (let k = 0; k < 6; k++) add(new THREE.CylinderGeometry(0.052, 0.052, 0.025, 12).rotateX(Math.PI / 2), dark, 0, 0.1, 0.3 + k * 0.11);      // its cooling ribs
        add(new THREE.CylinderGeometry(0.03, 0.038, 0.12, 10).rotateX(Math.PI / 2), dark, 0, 0.1, 1.05);             // muzzle
        for (const sx of [-1, 1]) add(new THREE.CylinderGeometry(0.016, 0.016, 0.16, 8), dark, sx * 0.07, 0.09, -0.36);      // spade grips
        add(new THREE.BoxGeometry(0.2, 0.02, 0.02), dark, 0, 0.17, -0.36);
        for (const sx of [-1, 1]) add(new THREE.BoxGeometry(0.4, 0.5, 0.018), olive, sx * 0.27, 0.16, 0.26);      // the shield, in two plates with the gun through the slot between
        add(new THREE.BoxGeometry(0.16, 0.14, 0.018), olive, 0, 0.36, 0.26);
        add(new THREE.BoxGeometry(0.2, 0.16, 0.14), olive, -0.19, 0.03, -0.04);                                      // belt box
        const flash = add(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffd9a0 }), 0, 0.1, 1.2); flash.castShadow = false; flash.visible = false;
        this.gunPosts.push({ O, grp, piv, flash }); } }
    // the objectives: a tall pole, its flag, a ring marked out on the ground
    this.flags = [];
    for (const O of I.obj) { const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 12, 8).translate(0, 6, 0), plain('metal')); pole.material = pole.material.clone(); pole.material.color.setHex(0x3a3a3a); pole.position.copy(P(O.pos)); g.add(pole);
      const cloth = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 2.1, 12, 4).translate(1.8, 0, 0), new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide, roughness: 0.9 })); cloth.position.set(0, 10.8, 0); pole.add(cloth);
      // the ring marked out round it, laid on the ground as it lies
      const rp = [], N = 96; for (let k = 0; k <= N; k++) { const a = k / N * Math.PI * 2; for (const R of [24.5, 26]) { const x = O.pos[0] + Math.cos(a) * R, z = O.pos[2] + Math.sin(a) * R; rp.push(x - O.pos[0], I.ground(x, z) + 0.3 - O.pos[1], z - O.pos[2]); } }
      const rg = new THREE.BufferGeometry(), ix = []; rg.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3)); for (let k = 0; k < N; k++) ix.push(2 * k, 2 * k + 2, 2 * k + 1, 2 * k + 1, 2 * k + 2, 2 * k + 3); rg.setIndex(ix);
      const mark = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4, depthWrite: false, side: THREE.DoubleSide })); pole.add(mark);
      this.flags.push({ O, cloth, mark, base: cloth.geometry.attributes.position.array.slice() }); }
    this.root.add(g);
  }
  // what's been done to the works: burst walls spill their top two courses about the ground; cut wire falls slack in a heap
  // at the cut, flattened wire lies squashed into the ground; a post at a cut or under a track goes over
  works(I) {
    let sig = 0; for (const C of I.cover) if (C.down) sig++; for (const W of I.props) if (W.segs) for (const S of W.segs) if (S.dead) sig += 1000;
    if (sig === this.worksSig) return; this.worksSig = sig;
    const m = this.m, q = new THREE.Quaternion(), e = new THREE.Euler(), one = new THREE.Vector3(1, 1, 1), sc = new THREE.Vector3(), P = p => new THREE.Vector3(...p), up = new THREE.Vector3(0, 1, 0);
    this.bags.forEach(([x, y, z, a, C, row], i) => { if (!C.down || row === 0) { q.setFromAxisAngle(up, a); m.compose(P([x, y, z]), q, one); }
      else { const h = hashId(C.i + ':' + i), r1 = (h % 997) / 997, r2 = ((h >> 10) % 991) / 991, ang = r1 * 6.28, d = 0.4 + r2 * 1.1, nx = x + Math.cos(ang) * d, nz = z + Math.sin(ang) * d; e.set((r2 - 0.5) * 0.6, a + r1 * 3, (r1 - 0.5) * 0.5); q.setFromEuler(e); sc.set(1.08, 0.85, 1.05); m.compose(P([nx, I.ground(nx, nz) + 0.07, nz]), q, sc); }
      this.bagMesh.setMatrixAt(i, m); }); this.bagMesh.instanceMatrix.needsUpdate = true;
    this.rings.forEach(([x, y, z, a, k, S, s], i) => { const dead = S?.dead;
      if (!dead) { e.set(0.25 * Math.sin(k * 1.7), a, 0.3 * Math.cos(k * 1.3), 'YXZ'); q.setFromEuler(e); m.compose(P([x, y, z]), q, one); }
      else if (dead === 'crushed') { e.set(1.35 + 0.15 * Math.sin(k * 2.3), a, 0.2 * Math.cos(k * 1.9), 'YXZ'); q.setFromEuler(e); sc.set(1.25, 1.25, 0.5); m.compose(P([x, I.ground(x, z) + 0.05, z]), q, sc); }
      else { const f = (s - S.s0) / (S.s1 - S.s0), toEnd = f < 0.5 ? f : 1 - f; e.set(0.9 + 0.3 * Math.sin(k), a + 0.4 * Math.cos(k * 1.3), 0.4 * Math.sin(k * 0.7), 'YXZ'); q.setFromEuler(e); sc.set(1, 1, 1).multiplyScalar(toEnd < 0.2 ? 1 : 0.0001); m.compose(P([x, I.ground(x, z) + 0.2, z]), q, sc); }
      this.ringMesh.setMatrixAt(i, m); }); this.ringMesh.instanceMatrix.needsUpdate = true;
    this.posts.forEach(([x, y, z, S], i) => { if (S?.dead) { e.set(1.4, hashId(i + 'p') % 6, 0); q.setFromEuler(e); m.compose(P([x, y + 0.05, z]), q, one); } else m.compose(P([x, y, z]), q.identity(), one); this.postMesh.setMatrixAt(i, m); }); this.postMesh.instanceMatrix.needsUpdate = true;
  }
  update(I, dt, t) {
    if (!I.F) { this.group.visible = false; if (this.line) this.line.visible = false; return; } this.group.visible = true;
    if (this.builtFor !== I.F) { this.builtFor = I.F; this.build(I); } this.line.visible = true; this.works(I);
    const rig = this.rig, n = Math.min(MAX, I.men.length);
    for (let i = 0; i < n; i++) {
      const M = I.men[i], L = SIDES[M.side], h = hashId(M.id); let ph = this.gait.get(M.id) || 0; if (M.moving) ph += dt * 6.2; this.gait.set(M.id, ph);
      rig.root.position.set(...this.toRender(...M.pos)); rig.root.rotation.set(0, M.facing, 0); rig.root.scale.setScalar(0.95 + (h % 10) / 100);
      // how fast and which way he's going (for the recorded sprint and the backward walk)
      { const L0 = this.last.get(M.id); this.last.set(M.id, [M.pos[0], M.pos[2]]); if (L0 && dt > 0) { const vx = (M.pos[0] - L0[0]) / dt, vz = (M.pos[2] - L0[1]) / dt, v = Math.hypot(vx, vz); const S = this.vel.get(M.id) || { v: 0, back: 0 }; S.v += (v - S.v) * Math.min(1, dt * 5); S.back = v > 0.4 ? (vx * Math.sin(M.facing) + vz * Math.cos(M.facing)) / v : S.back; this.vel.set(M.id, S); } }
      const ok = soldierPose(rig, M, ph, I.t, this.vel.get(M.id));
      if (M.hp <= 0 && !ok) { const lying = M.dead >= FALL; rig.root.rotation.set(0, M.fall + Math.PI, 0); rig.root.rotateX(-Math.PI / 2 * (lying ? 1 : rig.fallTilt || 0)); }      // (no recorded fall: he faced the one who shot him, and goes over backwards)
      rig.root.updateMatrixWorld(true);
      for (const im of this.meshes) { const part = rig.parts[this.meshes.indexOf(im)]; im.setMatrixAt(i, part.mesh.matrixWorld); im.setColorAt(i, this.col.setHex(im.userData.kind === 'skin' ? SKIN[h % SKIN.length] : L[im.userData.kind])); }
      this.m.copy(rig.gunSock.matrixWorld); if (M.hp <= 0) this.m.makeTranslation(0, -100, 0); else if (M.climb) this.m.copy(rig.torso.matrixWorld).multiply(SLUNG);      // (on a ladder: slung across his back)
      for (const im of this.guns) im.setMatrixAt(i, this.m);
    }
    for (const im of this.meshes.concat(this.guns)) { im.count = n; im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; }
    // tracers: a streak a third of the way along, moving out; the muzzle flash at the start
    const tp = this.tr.geometry.attributes.position, tc = this.tr.geometry.attributes.color, fp = this.flash.geometry.attributes.position; let k = 0;
    for (const S of I.shots) { if (k >= MAX) break; const age = (I.t - S.t) / 0.25, f0 = Math.min(1, age * 1.4), f1 = Math.min(1, f0 + 0.18), A = S.from, B = S.to, a = this.toRender(A[0] + (B[0] - A[0]) * f0, A[1] + (B[1] - A[1]) * f0, A[2] + (B[2] - A[2]) * f0), b = this.toRender(A[0] + (B[0] - A[0]) * f1, A[1] + (B[1] - A[1]) * f1, A[2] + (B[2] - A[2]) * f1), c = S.side === 'ours' ? [1, 0.85, 0.5] : [1, 0.55, 0.35], w = 1 - age;
      tp.setXYZ(2 * k, ...a); tp.setXYZ(2 * k + 1, ...b); tc.setXYZ(2 * k, c[0] * w, c[1] * w, c[2] * w); tc.setXYZ(2 * k + 1, c[0] * w, c[1] * w, c[2] * w); fp.setXYZ(k, ...(age < 0.3 ? this.toRender(...A) : [0, -1e4, 0])); k++; }
    { let n = 0; for (const N of I.nades) { if (n >= 16) break; const p = I.nadeAt(N); this.m.makeRotationFromEuler(new THREE.Euler(N.age * 9, N.age * 5, 0)); this.m.setPosition(...this.toRender(...p)); this.nadeIm.setMatrixAt(n++, this.m); } this.nadeIm.count = n; this.nadeIm.instanceMatrix.needsUpdate = true;
      let c = 0, g = 0; for (const D of I.drops) { const bob = 0.12 + Math.sin(t * 3 + D.pos[0]) * 0.05; this.m.makeRotationY(t * 1.5 + D.pos[2]); this.m.setPosition(...this.toRender(D.pos[0], D.pos[1] + bob, D.pos[2])); if (D.kind === 'cell' && c < 48) this.cellIm.setMatrixAt(c++, this.m); else if (g < 48) this.dropNade.setMatrixAt(g++, this.m); }
      this.cellIm.count = c; this.dropNade.count = g; this.cellIm.instanceMatrix.needsUpdate = this.dropNade.instanceMatrix.needsUpdate = true; }
    this.tr.geometry.setDrawRange(0, k * 2); this.flash.geometry.setDrawRange(0, k); tp.needsUpdate = tc.needsUpdate = fp.needsUpdate = true;
    for (const Q of this.gunPosts || []) { const G = Q.O.gun; Q.piv.rotation.y = G.yaw; Q.grp.rotation.z += ((G.out > 0 ? 0.9 : 0) - Q.grp.rotation.z) * Math.min(1, dt * 4); Q.flash.visible = I.t - G.firedT < 0.05; }      // (knocked out, it lies over on its side)
    // flags: the holder's colour, blending as it's taken; the cloth stirs
    for (const Fl of this.flags) { const p = Fl.O.prog, c = this.col.copy(FLAG.none).lerp(p > 0 ? FLAG.ours : FLAG.theirs, Math.abs(p)); Fl.cloth.material.color.copy(c); Fl.mark.material.color.copy(c);
      const a = Fl.cloth.geometry.attributes.position; for (let i = 0; i < a.count; i++) { const x = Fl.base[3 * i]; a.setZ(i, Math.sin(x * 1.6 - t * 5 + Fl.O.id) * 0.26 * x / 3.6); } a.needsUpdate = true; }
  }
}

// a soldier's pose, from the recorded takes (player/mixamo.js) where there's one for it: dead (the way the round took him), flat on his
// front firing, the bayonet, a grenade from the ground, hit, sprinting, backing off; the rifleman's stance aiming or firing. The arms then
// put on the gun (holdLong), except flat or lunging, where the take's own hands hold it. → true if a take placed him (dead: its fall)
const DOWN_T = new THREE.Vector3(), _hr = new THREE.Vector3(), _hl = new THREE.Vector3(), _m4 = new THREE.Matrix4();
function gunInHands(rig) {      // the gun from the right hand toward the left (prone, the bayonet: the take's hands are on it)
  const G = rig.gunSock || (rig.gunSock = (() => { const g = new THREE.Group(); rig.torso.add(g); return g; })()); G.visible = true; rig.root.updateMatrixWorld(true);
  _hr.set(0, -0.36, 0).applyMatrix4(rig.armR.lower.matrixWorld); _hl.set(0, -0.36, 0).applyMatrix4(rig.armL.lower.matrixWorld);
  const inv = _m4.copy(rig.torso.matrixWorld).invert(), a = _hr.clone().applyMatrix4(inv), b = _hl.clone().applyMatrix4(inv), d = b.clone().sub(a).normalize();
  G.position.copy(a); G.quaternion.setFromUnitVectors(DOWN_T.set(0, 0, 1), d); G.updateMatrix();
}
export function soldierPose(rig, M, ph, now = 0, mv = null) {
  if (lib) {
    const take = (id, t, w = 1) => { applyPose(rig, { mode: 'stand', phase: 0, blend: 0, k: 0 }); return poseCrowd(rig, id, t, w); };
    if (M.hp <= 0) { const k = M.fall != null ? Math.cos(M.fall - M.facing) : -1, id = M.diedBy === 'blast' || (M.id.length * 13) % 5 === 0 ? 'dying' : k > 0 ? 'death_back' : 'death_front';
      if (M.diedBy === 'blast' && take('death_blast', M.dead * 1.1)) { if (rig.gunSock) rig.gunSock.visible = false; rig.fallTilt = 0; return true; }      // (thrown by a shell or a grenade)      // (the round going his way: shot from behind)
      if (take(id, M.dead * (id === 'dying' ? 1.3 : 1))) { if (rig.gunSock) rig.gunSock.visible = false; rig.fallTilt = 0; return true; } }
    else if (M.climb) { applyPose(rig, { mode: 'climb', phase: now * 5.5 + M.id.length, blend: 1, k: 1, lean: 0 }); rig.fallTilt = 0; if (rig.gunSock) rig.gunSock.visible = false; return true; }      // (on a ladder: hand over hand, the rifle slung)
    else {
      rig.fallTilt = 0; let placed = false, hands = false;
      if (M.stab != null && now - M.stab < 1.3) { placed = take('bayonet', 0.55 + (now - M.stab) * 1.6); hands = true; }
      else if (M.prone) { const thr = M.throwT != null && now - M.throwT < 1.4; placed = thr ? take('grenade', 0.5 + (now - M.throwT) * 1.5) : take('prone_fire', M.firedT != null && now - M.firedT < 0.8 ? (now * 1.2) % 0.83 : 0); hands = !thr; if (thr && rig.gunSock) rig.gunSock.visible = false; }
      else if (M.throwT != null && now - M.throwT < 1.1) { placed = take(M.duck > 0.3 ? 'nade_crouch' : 'nade_stand', 1.75 + (now - M.throwT) * 1.4); if (rig.gunSock) rig.gunSock.visible = false; }      // (a grenade from cover, ducked or standing: the recorded throws, from just before they let go)
      else if (M.moving && mv && mv.back < -0.5) placed = take('rifle_back', (ph / 6.2 * 1.3) % 1.27);
      else if (M.moving && mv && mv.v > 5.6) placed = take('sprint', (ph / 6.2 * (mv.v / 7.05) * 2) % 0.5);
      else if (M.moving && mv && mv.v > 2.8) placed = take('rifle_run', ((now + (M.id.length % 5) * 0.13) * mv.v / 4.2) % 0.73) || take('sprint', (ph / 6.2 * (mv.v / 7.05) * 2) % 0.5);      // (going forward under arms: the recorded run with the rifle carried across him)
      else if (!M.moving && !(M.duck > 0.3)) placed = take(M.firedT != null && now - M.firedT < 0.5 ? 'rifle_fire' : 'rifle_aim', (now + (M.id.length % 7)) % 3);
      if (placed) {
        if (hands) gunInHands(rig); else holdLong(rig, M.moving ? 0.25 : 0.3 + 0.7 * M.aim);
        if (M.flinch > 0) { const k = M.flinch / 0.28; poseCrowd(rig, (M.id.length % 2) ? 'hit_a' : 'hit_b', (1 - k) * 0.6 + 0.3, 0.6 * k); if (!hands) holdLong(rig, 0.3 + 0.7 * M.aim); }
        return true; }
    }
  }
  const falling = M.hp <= 0 && M.dead < FALL;
  applyPose(rig, { mode: M.hp <= 0 && !falling ? 'lie' : 'walk', phase: ph, blend: M.moving ? 1 : 0, k: M.moving ? 0.8 : 0 });
  if (M.hp <= 0) {
    if (rig.gunSock) rig.gunSock.visible = false;
    if (falling) {      // the knees go, then he goes over the way the round pushed him (render: the root turned about the feet)
      const f = M.dead / FALL, e = f * f; rig.hips.position.y = 0.95 - 0.25 * Math.min(1, f * 2); rig.legL.upper.rotation.x = rig.legR.upper.rotation.x = -0.5 * Math.min(1, f * 2); rig.legL.lower.rotation.x = rig.legR.lower.rotation.x = 0.9 * Math.min(1, f * 2);
      rig.torso.rotation.x = -0.3 * f; rig.armL.upper.rotation.z = 0.5 * f; rig.armR.upper.rotation.z = -0.5 * f; rig.fallTilt = e;
    }
    return;
  }
  rig.fallTilt = 0;
  const a = M.moving ? 0.25 : 0.3 + 0.7 * M.aim * (1 - 0.6 * (M.duck || 0));      // at the ready running (muzzle down, across the body), up into the shoulder to fire
  // ducked behind the wall: down on his heels, back bent, the gun held up and over it
  const d = M.duck || 0;
  if (d > 0.01) { rig.hips.position.y = 0.95 - 0.47 * d; rig.legL.upper.rotation.x = -1.35 * d; rig.legR.upper.rotation.x = -0.9 * d; rig.legL.lower.rotation.x = 2.0 * d; rig.legR.lower.rotation.x = 1.6 * d; }
  holdLong(rig, a);
  rig.torso.rotation.y = -0.22 * a; rig.torso.rotation.x = 0.06 + (M.moving ? 0.12 : 0.04 * a) + 0.35 * d;
  // hit: thrown back a little at the shoulders
  if (M.flinch > 0) { const k = M.flinch / 0.28; rig.torso.rotation.x -= 0.45 * k; rig.torso.rotation.z = (((M.id.length * 7) % 2) ? 0.2 : -0.2) * k; }
}
const FALL = 0.55, SLUNG = new THREE.Matrix4().compose(new THREE.Vector3(0.04, 0.22, -0.17), new THREE.Quaternion().setFromEuler(new THREE.Euler(-1.3, 0, 0.5)), new THREE.Vector3(1, 1, 1));
const hashId = s => { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; };
function mergeGeo(list) {
  const pos = [], nor = [], uv = []; for (const g0 of list) { const g = g0.index ? g0.toNonIndexed() : g0; pos.push(...g.attributes.position.array); nor.push(...g.attributes.normal.array); uv.push(...g.attributes.uv.array); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); return g;
}
