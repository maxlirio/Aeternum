// A damaged vehicle gets its own copy of its model, bent to match its record (sim/crash.js): metal pushed in where it was struck, with
// creases and a twisted frame when it's bad; paint scraped back round the dents; windows gone; and scorched black once it has burned.
// Flames and smoke come off the record each frame, and scraps of it fly off when it's hit hard.
import * as THREE from 'three';

const GLASS = /glass|visor|screen|canopy/i, GLOW = /glow|nav|lamp|neon/i, DEBRIS = 150;
const REST = 0.92;

// These models are made to be seen whole: far too few points to bend. Cut every long edge until it can crumple. Triangles stay flat, so folded metal has hard creases.
function tessellate(G, maxE) {
  G = G.index ? G.toNonIndexed() : G;
  let P = Array.from(G.attributes.position.array), N = Array.from(G.attributes.normal.array), U = G.attributes.uv ? Array.from(G.attributes.uv.array) : null;
  for (let pass = 0; pass < 7; pass++) {
    const P2 = [], N2 = [], U2 = []; let cut = 0;
    const v = (A, i, n) => A.slice(i * n, i * n + n), mid = (a, b) => a.map((q, k) => (q + b[k]) / 2);
    for (let t = 0; t < P.length / 9; t++) {
      const i = t * 3, pa = v(P, i, 3), pb = v(P, i + 1, 3), pc = v(P, i + 2, 3), e = [Math.hypot(pa[0] - pb[0], pa[1] - pb[1], pa[2] - pb[2]), Math.hypot(pb[0] - pc[0], pb[1] - pc[1], pb[2] - pc[2]), Math.hypot(pc[0] - pa[0], pc[1] - pa[1], pc[2] - pa[2])], m = e.indexOf(Math.max(...e));
      const put = (qp, qn, qu) => { P2.push(...qp); N2.push(...qn); if (U) U2.push(...qu); };
      const na = v(N, i, 3), nb = v(N, i + 1, 3), nc = v(N, i + 2, 3), ua = U ? v(U, i, 2) : 0, ub = U ? v(U, i + 1, 2) : 0, uc = U ? v(U, i + 2, 2) : 0;
      if (e[m] <= maxE) { put(pa, na, ua); put(pb, nb, ub); put(pc, nc, uc); continue; }
      cut++;
      // split the longest edge: (a,b,c) with the long edge first
      const [A, B, C, nA, nB, nC, uA, uB, uC] = m === 0 ? [pa, pb, pc, na, nb, nc, ua, ub, uc] : m === 1 ? [pb, pc, pa, nb, nc, na, ub, uc, ua] : [pc, pa, pb, nc, na, nb, uc, ua, ub];
      const M = mid(A, B), nM = mid(nA, nB), uM = U ? mid(uA, uB) : 0;
      put(A, nA, uA); put(M, nM, uM); put(C, nC, uC); put(M, nM, uM); put(B, nB, uB); put(C, nC, uC);
    }
    P = P2; N = N2; U = U2.length ? U2 : U; if (!cut || P.length > 500000) break;
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); if (U) g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  return g;
}
// Faces whose points moved get true flat normals (the folds catch the light); the untouched paint keeps its smooth ones.
function refold(G, moved) {
  const P = G.attributes.position.array, N = G.attributes.normal.array;
  for (let t = 0; t < P.length / 9; t++) { const i = t * 9, j = t * 3; if (!moved[j] && !moved[j + 1] && !moved[j + 2]) continue;
    const ax = P[i + 3] - P[i], ay = P[i + 4] - P[i + 1], az = P[i + 5] - P[i + 2], bx = P[i + 6] - P[i], by = P[i + 7] - P[i + 1], bz = P[i + 8] - P[i + 2]; let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    for (let k = 0; k < 3; k++) { N[i + k * 3] = nx; N[i + k * 3 + 1] = ny; N[i + k * 3 + 2] = nz; } }
  G.attributes.normal.needsUpdate = true;
}
function crumple(G, hit, L, H, W, seedK, moved) {
  const P = G.attributes.position, C = G.attributes.color, R = Math.max(0.42, 0.5 + hit.depth * 1.7) * Math.min(1.6, Math.sqrt(L / 3.5)), px = hit.p[0], py = hit.p[1], pz = hit.p[2], dl = Math.hypot(...hit.d) || 1, dx = hit.d[0] / dl, dy = hit.d[1] / dl, dz = hit.d[2] / dl, s = hit.depth;
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), y = P.getY(i), z = P.getZ(i), rx = x - px, ry = y - py, rz = z - pz, d = Math.hypot(rx, ry * 0.8, rz);
    if (d >= R) continue;
    const e = 1 - d / R, f = e * e * (3 - 2 * e);
    // folds across the struck panel: metal doesn't push in smoothly
    const crease = 1 + 0.26 * Math.sin(x * 7.3 + y * 4.7 + seedK) * Math.sin(z * 6.1 - y * 3.1 + seedK * 2) + 0.07 * Math.sin((x * 1.3 + z) * 17 + y * 13);     // (broad buckles, then finer folds; never spikes)
    const push = s * f * crease;
    let nx = x + dx * push, ny = y + dy * push, nz = z + dz * push;
    // and what's pushed in bulges out to the sides of it
    const sp = 0.38 * s * e * (1 - e) * 4, pr = d > 1e-3 ? 1 / d : 0; nx += rx * pr * sp * 0.3; ny += ry * pr * sp * 0.4; nz += rz * pr * sp * 0.3;
    P.setXYZ(i, nx, Math.max(-0.05, ny), nz); if (moved) moved[i] = 1;
    const k = 1 - Math.min(0.68, 0.72 * f * Math.min(1, s * 5)); C.setXYZ(i, C.getX(i) * k, C.getY(i) * k, C.getZ(i) * k);
  }
  // A heavy hit bends the whole frame
  if (s > 0.45) { const b = (s - 0.45) * 0.2; for (let i = 0; i < P.count; i++) { const x = P.getX(i), q = (x - px) / (L || 1); P.setZ(i, P.getZ(i) + dz * b * q * q * 2 + (dz === 0 ? (Math.sin(seedK) * b * q * q) : 0)); P.setY(i, Math.max(-0.05, P.getY(i) - Math.abs(q) * b * 0.25)); } }
}

export class WreckView {
  // kinds(D) → { prims: [{ geometry, material, tinted, slot }], fit: Matrix4 }, paint(D) → [r, g, b]
  constructor(kinds, paint) {
    this.kinds = kinds; this.paint = paint; this.group = new THREE.Group(); this.group.name = 'wrecks'; this.items = new Map(); this.q = new THREE.Quaternion(); this.e = new THREE.Euler(0, 0, 0, 'YZX');
    const g = new THREE.BufferGeometry(); const P = [], N = []; for (const [a, b, c] of [[[-.5, 0, -.3], [.5, .08, -.4], [.3, -.05, .4]], [[-.5, 0, -.3], [.3, -.05, .4], [-.4, .1, .35]]]) { for (const q of [a, b, c]) { P.push(...q); N.push(0, 1, 0); } }
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    this.scrap = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.55, metalness: 0.5 }), DEBRIS); this.scrap.frustumCulled = false; this.scrap.castShadow = true; this.scrap.count = 0; this.scrap.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(DEBRIS * 3), 3); this.group.add(this.scrap);
    this.bits = []; this._m = new THREE.Matrix4(); this._s = new THREE.Vector3(); this._p = new THREE.Vector3(); this._c = new THREE.Color();
  }
  build(D) {
    const K = this.kinds(D); if (!K) return null;
    const obj = new THREE.Group(), parts = [], paint = this.paint(D);
    for (const pr of K.prims) {
      const G0 = pr.geometry.clone(); if (K.fit) G0.applyMatrix4(K.fit);
      for (const a of Object.keys(G0.attributes)) if (!['position', 'normal', 'uv'].includes(a)) G0.deleteAttribute(a);
      const G = tessellate(G0, Math.max(0.13, D.L / 28));
      const n = G.attributes.position.count; G.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
      const M = pr.material.clone(); M.vertexColors = true; M.userData.base = M.color.clone(); if (pr.tinted) { M.color.setRGB(paint[0], paint[1], paint[2]); M.userData.base.copy(M.color); }
      const mesh = new THREE.Mesh(G, M); mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false; obj.add(mesh);
      parts.push({ mesh, G, M, slot: pr.slot || M.name || '', base: G.attributes.position.array.slice(), baseN: G.attributes.normal.array.slice(), moved: new Uint8Array(n) });
    }
    this.group.add(obj);
    return { D, obj, parts, ver: -1, applied: 0, burn: -1, paint };
  }
  // Scraps off the struck side, in its paint.
  throwBits(D, at, dir, n, speed, paint) {
    const f = D.facing, ax = Math.sin(f), az = Math.cos(f), wx = D.pos[0] + at[0] * ax - at[2] * az, wz = D.pos[2] + at[0] * az + at[2] * Math.sin(f), wy = D.pos[1] + at[1];
    for (let i = 0; i < n; i++) { if (this.bits.length >= DEBRIS) this.bits.shift(); const a = Math.random() * 6.28, s = speed * (0.2 + Math.random() * 0.9), dark = Math.random() < 0.35; this.bits.push({ p: [wx, wy, wz], v: [Math.cos(a) * s - dir[0] * s * 0.3, 1.5 + Math.random() * speed * 0.5, Math.sin(a) * s - dir[2] * s * 0.3], r: [Math.random() * 6, Math.random() * 6, Math.random() * 6], w: [(Math.random() - 0.5) * 18, (Math.random() - 0.5) * 18, (Math.random() - 0.5) * 18], s: 0.08 + Math.random() * Math.random() * 0.55, c: dark ? [0.05, 0.05, 0.05] : paint, life: 18 + Math.random() * 30 }); }
  }
  update(dt, crashes, ground, fx, wind, px, pz) {
    const seen = new Set();
    for (const D of crashes.list.values()) {
      seen.add(D.id);
      let W = this.items.get(D.id);
      if (!W && D.hits.length + (D.burnt > 0 ? 1 : 0) === 0) continue;          // not a mark on it yet
      if (!W) { W = this.build(D); if (!W) continue; this.items.set(D.id, W); }
      W.obj.visible = true;
      this.e.set(D.roll || 0, D.facing - Math.PI / 2, D.pitch || 0); W.obj.position.set(D.pos[0], D.pos[1], D.pos[2]); W.obj.quaternion.setFromEuler(this.e);
      // new hits: bend the metal
      if (W.ver !== D.ver) {
        W.ver = D.ver; const n = D.hits.length;
        // (a trimmed list means start from clean)
        if (W.applied > n || D.hits.length >= 14) { for (const q of W.parts) { q.G.attributes.position.array.set(q.base); q.G.attributes.normal.array.set(q.baseN); q.G.attributes.color.array.fill(1); q.moved.fill(0); } W.applied = 0; }
        for (const q of W.parts) { for (let i = W.applied; i < n; i++) crumple(q.G, D.hits[i], D.L, D.H, D.W, i * 1.73 + (D.id.length || 1), q.moved); q.G.attributes.position.needsUpdate = true; q.G.attributes.color.needsUpdate = true; refold(q.G, q.moved); }
        const big = D.hits.slice(W.applied).reduce((a, h) => Math.max(a, h.depth), 0), last = D.hits[n - 1];
        if (big > 0.1 && last && W.bitsUpTo !== D.ver) { this.throwBits(D, last.p, last.d, Math.min(26, Math.round(big * 40)), 4 + big * 7, W.paint); W.bitsUpTo = D.ver; }
        W.applied = n;
        const smashed = D.hits.some(h => h.depth > 0.14) || D.exploded || D.hp < 55;
        for (const q of W.parts) { if (GLASS.test(q.slot) && smashed && !q.crazed) { q.crazed = true; q.M.color.multiplyScalar(0.45); q.M.roughness = 0.85; q.M.metalness = 0; fx?.glass([D.pos[0], D.pos[1] + D.H * 0.6, D.pos[2]], 24); } if (GLOW.test(q.slot) && D.dead) q.mesh.visible = false; }      // (the screen stays in its frame, crazed white-over-dark: on these bodies the roof has nothing else to stand on)
      }
      // what fire has done to it
      if (Math.abs(W.burn - D.burnt) > 0.015) { W.burn = D.burnt; const k = Math.min(1, D.burnt * 1.25); for (const q of W.parts) { if (q.M.userData.base) q.M.color.copy(q.M.userData.base).lerp(this._c.setRGB(0.012, 0.011, 0.01), k); if (k > 0.2) { q.M.roughness = 0.9; if (q.M.roughnessMap) q.M.roughnessMap = null; q.M.metalness = Math.max(0, (q.M.metalness ?? 0) * (1 - k)); q.M.needsUpdate = W.matOnce !== true; } } W.matOnce = k > 0.2; }
      // flames and smoke: only near you are they worth drawing
      const dist = Math.hypot(D.pos[0] - px, D.pos[2] - pz);
      if (fx && dist < 420) {
        const over = Math.abs(Math.sin(D.roll || 0)), engine = D.kind === 'ship' ? [0, D.H * 0.55, 0] : [D.L * 0.26, (D.H * 0.62) * (1 - over) + D.W * 0.5 * over, 0], f = D.facing, wx = D.pos[0] + engine[0] * Math.sin(f), wz = D.pos[2] + engine[0] * Math.cos(f), wy = D.pos[1] + engine[1];
        D._em = (D._em || 0) + dt;
        if (D.fire > 0) {
          const sz = (0.7 + D.fire * 1.3) * Math.min(2.8, Math.sqrt(D.L / 4)), rate = 42 * Math.min(1, 0.3 + D.fire) * (dist > 140 ? 0.4 : 1);
          while (D._em > 1 / rate) { D._em -= 1 / rate; const a = Math.random(), sx = (Math.random() - 0.5) * D.L * (0.2 + 0.55 * D.fire), sz2 = (Math.random() - 0.5) * D.W * 0.8; const q = [wx + sx * Math.sin(f) - sz2 * Math.cos(f), wy + Math.random() * 0.2, wz + sx * Math.cos(f) + sz2 * Math.sin(f)]; fx.flame(q, sz, wind); if (a < 0.35) fx.smoke([q[0], q[1] + sz * 0.8, q[2]], sz * 0.9, wind, 0.05, 0.42); if (a > 0.985) fx.sparks(q, 3, 2.2); }
          if (dist < 70) fx.burnLight([wx, wy, wz], 18 + 22 * D.fire);
        } else if (D.smoke > 0.03 || D.burnt > 0.1) {
          const s = Math.max(D.smoke, D.burnt * 0.5), rate = 7 * s; while (D._em > 1 / Math.max(0.5, rate)) { D._em -= 1 / Math.max(0.5, rate); fx.smoke([wx, wy, wz], 0.55 + s * 0.8, wind, D.burnt > 0.2 ? 0.05 : 0.2, 0.18 + 0.28 * s); }
        } else D._em = 0;
      }
    }
    for (const [id, W] of this.items) if (!seen.has(id)) { this.group.remove(W.obj); for (const q of W.parts) { q.G.dispose(); q.M.dispose(); } this.items.delete(id); }
    // the scraps
    let n = 0;
    for (let i = this.bits.length - 1; i >= 0; i--) {
      const b = this.bits[i]; b.life -= dt; if (b.life <= 0) { this.bits.splice(i, 1); continue; }
      if (b.v) { b.v[1] -= 9.81 * dt; b.p[0] += b.v[0] * dt; b.p[1] += b.v[1] * dt; b.p[2] += b.v[2] * dt; for (let k = 0; k < 3; k++) b.r[k] += b.w[k] * dt; const g = ground(b.p[0], b.p[2], b.p[1] + 2) + 0.02; if (b.p[1] <= g) { b.p[1] = g; if (Math.abs(b.v[1]) > 1.8) { b.v[1] *= -0.3; b.v[0] *= 0.55; b.v[2] *= 0.55; for (let k = 0; k < 3; k++) b.w[k] *= 0.45; } else { b.v = null; b.r[0] = 0; b.r[2] = 0; } } }
      this.e.set(b.r[0], b.r[1], b.r[2]); this._m.compose(this._p.set(...b.p), this.q.setFromEuler(this.e), this._s.setScalar(b.s)); this.scrap.setMatrixAt(n, this._m); this.scrap.setColorAt(n, this._c.setRGB(b.c[0], b.c[1], b.c[2])); n++;
    }
    this.scrap.count = n; this.scrap.instanceMatrix.needsUpdate = true; if (this.scrap.instanceColor) this.scrap.instanceColor.needsUpdate = true;
  }
}
