// Drawing the great ships' fight (sim/fleetwar.js): laser beams, missiles out of their cells and on their way, bombs falling,
// the bomber's scanning sweep, and a ship cut in two: its halves, clipped along the cut, drifting apart, tumbling, burning.
import * as THREE from 'three';

const N_BEAM = 12, N_MSL = 64, N_BOMB = 96;
export class FleetWarView {
  constructor(scene, shipView, fx, renderer) {
    this.scene = scene; this.shipView = shipView; this.fx = fx; this.group = new THREE.Group(); this.group.name = 'fleetwar'; scene.add(this.group);
    renderer.localClippingEnabled = true;      // (the cut halves are clipped; nothing else sets clipping planes)
    const add = (g, m, n) => { const im = new THREE.InstancedMesh(g, m, n); im.count = 0; im.frustumCulled = false; this.group.add(im); return im; };
    // a beam: a hot white core in a coloured glow, both additive
    const beamG = new THREE.CylinderGeometry(1, 1, 1, 12, 1, true).translate(0, 0.5, 0).rotateX(Math.PI / 2);
    this.beamCore = add(beamG, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }), N_BEAM);
    this.beamGlow = add(beamG, new THREE.MeshBasicMaterial({ color: 0xff3a2a, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }), N_BEAM);
    // a missile: a grey body with a dark nose, and its motor's flame when it's lit
    this.msl = add(new THREE.CylinderGeometry(0.42, 0.42, 7, 12).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xb8bcc2, metalness: 0.6, roughness: 0.35 }), N_MSL);
    this.nose = add(new THREE.ConeGeometry(0.42, 1.6, 12).rotateX(Math.PI / 2).translate(0, 0, 4.3), new THREE.MeshStandardMaterial({ color: 0x2a2c30, roughness: 0.5 }), N_MSL);
    this.flame = add(new THREE.ConeGeometry(0.55, 5, 12, 1, true).rotateX(-Math.PI / 2).translate(0, 0, -6), new THREE.MeshBasicMaterial({ color: 0xffb060, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), N_MSL);
    this.bomb = add(new THREE.CapsuleGeometry(0.5, 2.2, 4, 10), new THREE.MeshStandardMaterial({ color: 0x23262a, metalness: 0.5, roughness: 0.5 }), N_BOMB);
    // the scan: a fan of thin lines from the belly to the ground
    this.scan = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x7fe8ff, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false })); this.scan.frustumCulled = false; this.group.add(this.scan);
    this.halves = []; this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._v = new THREE.Vector3(); this._s = new THREE.Vector3(); this.up = new THREE.Vector3(0, 0, 1);
  }
  // a craft cut in two by a beam: two copies of its hull, each clipped to one side of the cut, pushed apart and set tumbling
  slice(craft, n, toRender) {
    const M = this.shipView.models[craft.f.ship?.model || craft.model]; if (!M) return;
    const L = M.L, f = craft.f, base = new THREE.Group(), q = new THREE.Quaternion(...(f.q ? [f.q[0], f.q[1], f.q[2], f.q[3]] : [0, 0, 0, 1]));
    const across = new THREE.Vector3(n[0], n[1], n[2]).cross(new THREE.Vector3(0, 1, 0)); if (across.lengthSq() < 1e-4) across.set(1, 0, 0); across.normalize();
    for (const side of [1, -1]) {
      const g = new THREE.Group(), local = new THREE.Plane(new THREE.Vector3(0, 0.15 * side, side).normalize(), 0), mats = [];
      for (const pr of M.hullPrims) { const m = pr.material.clone(); m.clippingPlanes = [new THREE.Plane()]; m.clipShadows = true; m.side = THREE.DoubleSide; mats.push(m); const mesh = new THREE.Mesh(pr.geometry, m); mesh.position.set(-L.W / 2, -L.deck - 0.6, -L.D / 2); g.add(mesh); }
      const r = toRender(f.pos[0], f.pos[1], f.pos[2]); g.position.set(r[0], r[1], r[2]); g.quaternion.copy(q);
      const kick = across.clone().multiplyScalar(0).add(new THREE.Vector3(0, 0, side).applyQuaternion(q)).multiplyScalar(6 + Math.random() * 4);
      this.group.add(g); this.halves.push({ g, mats, local, vel: [f.vel[0] * 0.8 + kick.x, f.vel[1] * 0.8 + 4, f.vel[2] * 0.8 + kick.z], spin: new THREE.Vector3((Math.random() - 0.5) * 1.6, (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 1.6), w: f.pos.slice(), t: 0 });
    }
    this.fx.blast(f.pos, 10); this.fx.sparks(f.pos, 60, 26); this.fx.burnLight?.(f.pos, 4);
  }
  update(dt, FW, toRender, groundAt, events = [], camera = null) {
    const cam = camera?.position, far = p => cam ? Math.hypot(p[0] - cam.x, p[1] - cam.y, p[2] - cam.z) : 500;      // (from far off, a beam or a motor still has to read: they're drawn at least a pixel or two wide)
    for (const e of events) if (e.type === 'sliced') this.slice(e.craft, e.n, toRender);
    const m = this._m, q = this._q, v = this._v, s = this._s;
    // beams
    let i = 0; for (const b of FW.beams) { if (i >= N_BEAM || !b.target) break; const a = toRender(...b.from), t = b.target.f.pos, c = toRender(t[0], t[1], t[2]), d = new THREE.Vector3(c[0] - a[0], c[1] - a[1], c[2] - a[2]), L = d.length(), k = Math.min(1, b.t / 0.12) * (b.t > b.life ? Math.max(0, 1 - (b.t - b.life) / 0.15) : 1);
      const mid = [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2, (a[2] + c[2]) / 2], wd = Math.max(1, far(mid) * 0.0016);
      q.setFromUnitVectors(this.up, d.normalize()); m.compose(v.set(...a), q, s.set(0.6 * k * wd, 0.6 * k * wd, L)); this.beamCore.setMatrixAt(i, m); m.compose(v.set(...a), q, s.set(2.6 * k * wd, 2.6 * k * wd, L)); this.beamGlow.setMatrixAt(i, m);
      if (b.target.alive) { this.fx.sparks(t, 4, 14); if (Math.random() < 0.5) this.fx.flame(t, 3); } i++; }
    this.beamCore.count = this.beamGlow.count = i; this.beamCore.instanceMatrix.needsUpdate = this.beamGlow.instanceMatrix.needsUpdate = true;
    // missiles
    i = 0; let fl = 0; for (const M of FW.missiles) { if (i >= N_MSL || M.t < 0) continue; const p = toRender(...M.p), dir = M.phase === 'slide' ? new THREE.Vector3(...M.out) : new THREE.Vector3(...M.v).normalize();
      const sc = Math.max(1.6, far(p) * 0.0012);      // (ship-launched: big, and never smaller than a few pixels)
      q.setFromUnitVectors(this.up, dir); m.compose(v.set(...p), q, s.set(sc, sc, sc)); this.msl.setMatrixAt(i, m); this.nose.setMatrixAt(i, m);
      if (M.phase === 'burn') { m.compose(v.set(...p), q, s.set(sc * 1.4, sc * 1.4, sc * (1.4 + Math.random() * 0.8))); this.flame.setMatrixAt(fl++, m); const back = [M.p[0] - dir.x * 6, M.p[1] - dir.y * 6, M.p[2] - dir.z * 6]; this.fx.smoke(back, 4.5, [0, 0], 0.55, 0.26); }
      else if (M.t > 1.1) this.fx.sparks(M.p, 2, 4);     // (about to light)
      i++; }
    this.msl.count = this.nose.count = i; this.flame.count = fl; this.msl.instanceMatrix.needsUpdate = this.nose.instanceMatrix.needsUpdate = this.flame.instanceMatrix.needsUpdate = true;
    // bombs
    i = 0; for (const B of FW.bombs) { if (i >= N_BOMB) break; const p = toRender(...B.p); m.compose(v.set(...p), q.identity(), s.set(1, 1, 1)); this.bomb.setMatrixAt(i++, m); }
    this.bomb.count = i; this.bomb.instanceMatrix.needsUpdate = true;
    // the scanning sweep: a fan swinging across under the wing
    const pts = []; for (const S of FW.scans) { const a = toRender(...S.p), g = groundAt(S.p[0], S.p[2]), sw = Math.sin(S.t * 5 + S.p[0] * 0.01) * 0.9;
      for (let k = -6; k <= 6; k++) { const off = k * 70 + sw * 300, x = S.p[0] + Math.cos(S.yaw) * off, z = S.p[2] - Math.sin(S.yaw) * off, b = toRender(x, g, z); pts.push(a[0], a[1] - 20, a[2], b[0], b[1], b[2]); } }
    this.scan.geometry.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); this.scan.visible = pts.length > 0;
    // the halves of a cut ship: falling, turning, burning, gone when they hit the ground
    for (const H of this.halves) {
      H.t += dt; H.vel[1] -= 9.8 * dt; for (let k = 0; k < 3; k++) H.w[k] += H.vel[k] * dt;
      const r = toRender(...H.w); H.g.position.set(...r); H.g.rotateX(H.spin.x * dt); H.g.rotateY(H.spin.y * dt); H.g.rotateZ(H.spin.z * dt); H.g.updateMatrixWorld(true);
      const pl = H.local.clone().applyMatrix4(H.g.matrixWorld); for (const mt of H.mats) mt.clippingPlanes[0].copy(pl);
      if (Math.random() < 0.7) { this.fx.flame(H.w, 4); this.fx.smoke(H.w, 6, [0, 0], 0.05, 0.6); }
      if (H.w[1] <= groundAt(H.w[0], H.w[2]) || H.t > 40) { this.fx.blast(H.w, 12); this.group.remove(H.g); H.dead = true; }
    }
    this.halves = this.halves.filter(H => !H.dead);
  }
}
