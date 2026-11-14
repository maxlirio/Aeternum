// Draws the war on foot (sim/infantry.js): the soldiers, each in his side's fatigues and helmet with a carbine in his hands
// (the same gun model the player carries, render/weapons.js), aiming when he fires; their tracers; the sandbag walls, steel
// hedgehogs and coils of wire of the two lines; the objectives' flags, in the colour of whoever holds them.
import * as THREE from 'three';
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
    this.col = new THREE.Color(); this.gait = new Map(); this.line = null; this.m = new THREE.Matrix4();
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
    // sandbags: each one a squashed, rounded sack, laid in two courses with the joints staggered, the wall bowed toward the enemy
    const bag = new THREE.SphereGeometry(0.5, 12, 8); bag.scale(0.62, 0.26, 0.36); { const a = bag.attributes.position; for (let i = 0; i < a.count; i++) { const x = a.getX(i), y = a.getY(i); a.setY(i, Math.sign(y) * Math.min(Math.abs(y), 0.11) + y * 0.15); a.setX(i, x * (1 - 0.15 * Math.abs(y) / 0.13)); } bag.computeVertexNormals(); }
    const bags = []; for (const C of I.cover) { const n = Math.round(C.len / 0.6); for (let row = 0; row < 3; row++) for (let k = 0; k < n - (row === 2 ? 2 : 0); k++) { const f = (k + (row % 2) * 0.5 + (row === 2 ? 1 : 0)) / n - 0.5, s = f * C.len, bow = C.curve * (f * f * 4 - 1) * 0.8, ca = Math.cos(C.face), sa = Math.sin(C.face);
      const x = C.pos[0] + ca * s + sa * bow, z = C.pos[2] - sa * s + ca * bow; bags.push([x, C.pos[1] + 0.12 + row * 0.25, z, C.face + Math.PI / 2 + f * C.curve * 1.2 + (Math.random() - 0.5) * 0.12]); } }
    const bm = new THREE.InstancedMesh(bag, plain('canvas'), bags.length); bags.forEach(([x, y, z, a], i) => { q.setFromAxisAngle(up, a); m.compose(P([x, y, z]), q, new THREE.Vector3(1, 1, 1)); bm.setMatrixAt(i, m); bm.setColorAt(i, this.col.setRGB(0.62 + Math.random() * 0.08, 0.55 + Math.random() * 0.06, 0.4)); }); bm.castShadow = bm.receiveShadow = true; g.add(bm);
    // hedgehogs: three steel angles crossed and welded at the middle
    const beam = new THREE.BoxGeometry(0.16, 0.16, 2.3), hh = [], parts = [];
    for (const [rx, ry, rz] of [[0.6, 0, 0], [0, 0.6, Math.PI / 2], [Math.PI / 2, 0.6, 0.6]]) parts.push(beam.clone().applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz))));
    const hedge = mergeGeo(parts); hedge.translate(0, 0.72, 0);
    const props = I.props.filter(p => p.kind === 'hedgehog'), hm = new THREE.InstancedMesh(hedge, plain('rust'), props.length); props.forEach((p, i) => { q.setFromAxisAngle(up, p.rot); m.compose(P(p.pos), q, new THREE.Vector3(1, 1, 1)); hm.setMatrixAt(i, m); hm.setColorAt(i, this.col.setRGB(0.7, 0.62, 0.55)); }); hm.castShadow = true; g.add(hm);
    // wire: a coil of rings along each run, on pickets
    const ring = new THREE.TorusGeometry(0.45, 0.012, 4, 20), post = new THREE.CylinderGeometry(0.035, 0.045, 1.2, 6).translate(0, 0.6, 0), rings = [], posts = [];
    for (const W of I.props.filter(p => p.kind === 'wire')) { const n = Math.round(W.len / 0.32), ca = Math.cos(W.rot), sa = Math.sin(W.rot); for (let k = 0; k < n; k++) { const s = (k / n - 0.5) * W.len, x = W.pos[0] + sa * s, z = W.pos[2] + ca * s; rings.push([x, I.ground(x, z) + 0.45, z, W.rot, k]); if (k % 9 === 0) posts.push([x, I.ground(x, z), z]); } }
    const rm = new THREE.InstancedMesh(ring, plain('metal'), rings.length); rings.forEach(([x, y, z, a, k], i) => { q.setFromEuler(new THREE.Euler(0.25 * Math.sin(k * 1.7), a, 0.3 * Math.cos(k * 1.3), 'YXZ')); m.compose(P([x, y, z]), q, new THREE.Vector3(1, 1, 1)); rm.setMatrixAt(i, m); rm.setColorAt(i, this.col.setRGB(0.6, 0.58, 0.55)); }); g.add(rm);
    const pm = new THREE.InstancedMesh(post, plain('wood'), posts.length); posts.forEach(([x, y, z], i) => { m.compose(P([x, y, z]), q.identity(), new THREE.Vector3(1, 1, 1)); pm.setMatrixAt(i, m); pm.setColorAt(i, this.col.setRGB(0.5, 0.42, 0.34)); }); g.add(pm);
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
  update(I, dt, t) {
    if (!I.F) { this.group.visible = false; if (this.line) this.line.visible = false; return; } this.group.visible = true;
    if (this.builtFor !== I.F) { this.builtFor = I.F; this.build(I); } this.line.visible = true;
    const rig = this.rig, n = Math.min(MAX, I.men.length);
    for (let i = 0; i < n; i++) {
      const M = I.men[i], L = SIDES[M.side], h = hashId(M.id); let ph = this.gait.get(M.id) || 0; if (M.moving) ph += dt * 6.2; this.gait.set(M.id, ph);
      rig.root.position.set(...this.toRender(...M.pos)); rig.root.rotation.set(0, M.facing, 0); rig.root.scale.setScalar(0.95 + (h % 10) / 100);
      soldierPose(rig, M, ph);
      if (M.hp <= 0) { const lying = M.dead >= FALL; rig.root.rotation.set(0, M.fall + Math.PI, 0); rig.root.rotateX(-Math.PI / 2 * (lying ? 1 : rig.fallTilt || 0)); }      // (he faced the one who shot him, and goes over backwards)
      rig.root.updateMatrixWorld(true);
      for (const im of this.meshes) { const part = rig.parts[this.meshes.indexOf(im)]; im.setMatrixAt(i, part.mesh.matrixWorld); im.setColorAt(i, this.col.setHex(im.userData.kind === 'skin' ? SKIN[h % SKIN.length] : L[im.userData.kind])); }
      this.m.copy(rig.gunSock.matrixWorld); if (M.hp <= 0) this.m.makeTranslation(0, -100, 0);
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
    // flags: the holder's colour, blending as it's taken; the cloth stirs
    for (const Fl of this.flags) { const p = Fl.O.prog, c = this.col.copy(FLAG.none).lerp(p > 0 ? FLAG.ours : FLAG.theirs, Math.abs(p)); Fl.cloth.material.color.copy(c); Fl.mark.material.color.copy(c);
      const a = Fl.cloth.geometry.attributes.position; for (let i = 0; i < a.count; i++) { const x = Fl.base[3 * i]; a.setZ(i, Math.sin(x * 1.6 - t * 5 + Fl.O.id) * 0.26 * x / 3.6); } a.needsUpdate = true; }
  }
}

// a soldier's pose: walking or running with the carbine at the ready, up to the shoulder to fire, or down
export function soldierPose(rig, M, ph) {
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
const FALL = 0.55;
const hashId = s => { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; };
function mergeGeo(list) {
  const pos = [], nor = [], uv = []; for (const g0 of list) { const g = g0.index ? g0.toNonIndexed() : g0; pos.push(...g.attributes.position.array); nor.push(...g.attributes.normal.array); uv.push(...g.attributes.uv.array); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); return g;
}
