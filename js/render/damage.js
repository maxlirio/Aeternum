// Ships that are hit stay hit. A ship that takes its first round is drawn from then on from its own copy of its hull (render/ships.js
// draws every other ship from shared, instanced geometry), and every hit is done to that metal where the round struck it:
//   · the round's line is cast against the hull to find where it met the skin;
//   · the skin there is driven in along the round's line, deepest at the point and fading out, unevenly vertex by vertex so it crumples
//     rather than dishes, and its normals are worked out again so the creases catch the light;
//   · the paint is scorched black round it, and a fresh hit glows a moment, hot metal cooling;
//   · the hull is the parts it was built from (its separate pieces of geometry: wings, fins, pods, panels), each with its own strength:
//     a part that has had enough tears off and goes tumbling away trailing smoke. What holds the ship together (the big pieces) never does.
import * as THREE from 'three';

const _inv = new THREE.Matrix4(), _p = new THREE.Vector3(), _d = new THREE.Vector3(), _v = new THREE.Vector3(), _ray = new THREE.Raycaster();
const hash = i => { let h = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; return (h >>> 0) / 4294967296 * 2 - 1; };

function scorched(material, tint, clock) {      // the paint chars where aBurn is high; aHot (when it was last hit) glows and cools
  const m = material.clone(); if (tint && m.color) m.color = m.color.clone().multiply(tint);
  m.onBeforeCompile = sh => {
    sh.uniforms.uNow = clock;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aBurn; attribute float aHot; varying float vBurn; varying float vHot;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvBurn = aBurn; vHot = aHot;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uNow; varying float vBurn; varying float vHot;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.07 + vec3(0.012, 0.01, 0.009), smoothstep(0.05, 0.9, vBurn));')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\nfloat heat = vHot > 0.0 ? exp(-(uNow - vHot) * 0.7) * smoothstep(0.35, 1.0, vBurn) : 0.0; totalEmissiveRadiance += vec3(1.0, 0.32, 0.06) * heat * 3.0;');
  };
  m.customProgramCacheKey = () => 'scorched'; return m;
}

export class ShipDamage {
  constructor(view) { this.view = view; this.ships = new Map(); this.debris = []; this.clock = { value: 0 }; this.group = new THREE.Group(); this.group.name = 'damage'; view.group.add(this.group); }
  has(id) { return this.ships.has(id); }
  // a ship's own copy of its hull, its parts found: pieces of geometry joined by shared corners (welded by position, so a seam in the texture doesn't split a panel)
  make(id, model, tint) {
    const M = this.view.models[model]; if (!M) return null;
    const g = new THREE.Group(); g.matrixAutoUpdate = false; this.group.add(g);
    const R = { id, model, g, meshes: [], parts: [], pending: [], hits: 0, len: Math.max(M.L.D, M.L.W) };
    for (const { im, tinted } of [...M.hull, ...M.ramp]) {
      const geo = im.geometry.clone(); if (!geo.index) geo.setIndex([...Array(geo.attributes.position.count).keys()]);
      const n = geo.attributes.position.count; geo.setAttribute('aBurn', new THREE.BufferAttribute(new Float32Array(n), 1)); geo.setAttribute('aHot', new THREE.BufferAttribute(new Float32Array(n), 1));
      const mesh = new THREE.Mesh(geo, scorched(im.material, tinted ? tint : null, this.clock)); mesh.castShadow = mesh.receiveShadow = true; mesh.frustumCulled = false; g.add(mesh);
      // parts: union-find over triangles, corners welded to the millimetre
      const P = geo.attributes.position, I = geo.index, par = new Int32Array(n).map((_, i) => i), find = i => { while (par[i] !== i) i = par[i] = par[par[i]]; return i; }, weld = new Map();
      for (let i = 0; i < n; i++) { const k = `${Math.round(P.getX(i) * 1000)},${Math.round(P.getY(i) * 1000)},${Math.round(P.getZ(i) * 1000)}`, w = weld.get(k); if (w === undefined) weld.set(k, i); else par[find(i)] = find(w); }
      for (let t = 0; t < I.count; t += 3) { const a = find(I.getX(t)), b = find(I.getX(t + 1)), c = find(I.getX(t + 2)); par[b] = a; par[find(c)] = a; }
      const of = new Int32Array(n), boxes = new Map();
      for (let i = 0; i < n; i++) { const r = find(i); let B = boxes.get(r); if (!B) boxes.set(r, B = { box: new THREE.Box3(), n: 0, idx: R.parts.length + boxes.size }); B.box.expandByPoint(_v.fromBufferAttribute(P, i)); B.n++; }
      for (const [r, B] of boxes) { const s = B.box.getSize(new THREE.Vector3()).length(); R.parts[B.idx] = { mesh, box: B.box, size: s, core: s > R.len * 0.55, hp: 18 + 55 * s, gone: false }; }
      for (let i = 0; i < n; i++) of[i] = boxes.get(find(i)).idx;
      R.meshes.push({ mesh, of, pos0: P.array.slice() });
    }
    // the biggest piece holds the ship together however it's built
    if (!R.parts.some(p => p.core)) R.parts.reduce((a, b) => (b.size > a.size ? b : a)).core = true;
    this.ships.set(id, R); return R;
  }
  // A hit: where the round met the ship (render space, near or on it), the way it was going, how hard (the sim's damage).
  hit(id, model, tint, at, dir, dmg) { const R = this.ships.get(id) || this.make(id, model, tint); if (R) R.pending.push({ at: at.slice(), dir: dir.slice(), dmg }); }
  // Each frame for a damaged ship: its hits done to it (in its own frame), then drawn where it is. → true if it was drawn here
  draw(id, matrix, now) {
    const R = this.ships.get(id); if (!R) return false;
    R.g.matrix.copy(matrix); R.g.matrixWorldNeedsUpdate = true; R.g.visible = true; R.seen = true; this.clock.value = now;
    if (R.pending.length) { R.g.updateMatrixWorld(true); _inv.copy(R.g.matrixWorld).invert(); const touched = new Set(); for (const h of R.pending.splice(0)) this.apply(R, h, touched); for (const m of touched) { m.geometry.attributes.position.needsUpdate = true; m.geometry.attributes.aBurn.needsUpdate = true; m.geometry.attributes.aHot.needsUpdate = true; m.geometry.computeVertexNormals(); m.geometry.computeBoundingSphere(); } }
    return true;
  }
  apply(R, h, touched) {
    // the skin where the round met it: its line cast against the hull (a round that only grazed the bounds: the nearest corner to its line)
    const Aw = new THREE.Vector3(...h.at), Dw = new THREE.Vector3(...h.dir).normalize();
    _ray.set(Aw.clone().addScaledVector(Dw, -R.len), Dw); _ray.far = R.len * 2.5;
    const hits = _ray.intersectObjects(R.meshes.map(m => m.mesh), false);
    _p.copy(Aw).applyMatrix4(_inv); _d.copy(Dw).transformDirection(_inv).normalize();
    let P; if (hits.length) P = hits[0].point.clone().applyMatrix4(_inv); else { let best = Infinity; for (const m of R.meshes) { const A = m.mesh.geometry.attributes.position; for (let i = 0; i < A.count; i += 7) { _v.fromBufferAttribute(A, i); const w = _v.clone().sub(_p), t = w.dot(_d), d2 = w.lengthSq() - t * t; if (d2 < best) { best = d2; P = _v.clone(); } } } }
    if (!P) return;
    const e = Math.sqrt(Math.max(1, h.dmg)), r = Math.min(R.len * 0.25, 0.22 + 0.075 * e), depth = Math.min(r * 0.8, 0.018 * e * e / (3 + e)), now = this.clock.value || 1e-3;
    let part = -1, pd = Infinity;
    for (const m of R.meshes) {
      const A = m.mesh.geometry.attributes.position, B = m.mesh.geometry.attributes.aBurn, Ht = m.mesh.geometry.attributes.aHot; let any = false;
      for (let i = 0; i < A.count; i++) {
        if (R.parts[m.of[i]].gone) continue;
        const dx = A.getX(i) - P.x, dy = A.getY(i) - P.y, dz = A.getZ(i) - P.z, d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < pd) { pd = d2; part = m.of[i]; }
        if (d2 > r * r * 2.2) continue;
        const q = Math.sqrt(d2) / r, f = q < 1 ? (1 - q * q) ** 2 : 0, scorch = Math.max(0, 1 - q / 1.48);
        if (f > 0) { const n = hash(i * 7 + R.hits), k = depth * f * (0.7 + 0.6 * n);      // driven in along the round's line, crumpled across it
          A.setXYZ(i, A.getX(i) + _d.x * k + (_d.y * n - _d.z * hash(i + 3)) * depth * 0.4 * f, A.getY(i) + _d.y * k + (_d.z * hash(i + 5) - _d.x * n) * depth * 0.4 * f, A.getZ(i) + _d.z * k + (_d.x * hash(i + 9) - _d.y * n) * depth * 0.4 * f); }
        B.setX(i, Math.min(1, B.getX(i) + scorch * (0.25 + h.dmg / 60))); if (scorch > 0.3) Ht.setX(i, now); any = true;
      }
      if (any) touched.add(m.mesh);
    }
    R.hits++;
    // the part it hit takes it; past what it can take, it tears away
    const pt = R.parts[part]; if (pt && !pt.core && !pt.gone && (pt.hp -= h.dmg) <= 0) this.tear(R, part);
  }
  tear(R, k) {
    const pt = R.parts[k]; pt.gone = true;
    for (const m of R.meshes) {
      if (m.mesh !== pt.mesh) continue;
      const G = m.mesh.geometry, I = G.index, A = G.attributes.position, idx = [], keep = [];
      for (let t = 0; t < I.count; t += 3) { const a = I.getX(t); (m.of[a] === k ? idx : keep).push(I.getX(t), I.getX(t + 1), I.getX(t + 2)); }
      if (!idx.length) continue;
      // the piece: its own geometry, centred on itself, out into the world where it was, flung off spinning
      const used = [...new Set(idx)], map = new Map(used.map((v, i) => [v, i])), pos = new Float32Array(used.length * 3), burn = new Float32Array(used.length), hot = new Float32Array(used.length), c = new THREE.Vector3();
      used.forEach(v => c.add(_v.fromBufferAttribute(A, v))); c.divideScalar(used.length);
      used.forEach((v, i) => { pos[i * 3] = A.getX(v) - c.x; pos[i * 3 + 1] = A.getY(v) - c.y; pos[i * 3 + 2] = A.getZ(v) - c.z; burn[i] = G.attributes.aBurn.getX(v); hot[i] = G.attributes.aHot.getX(v); });
      const g2 = new THREE.BufferGeometry(); g2.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g2.setAttribute('aBurn', new THREE.BufferAttribute(burn, 1)); g2.setAttribute('aHot', new THREE.BufferAttribute(hot, 1));
      for (const nm of ['uv', 'normal']) if (G.attributes[nm]) { const src = G.attributes[nm], a2 = new Float32Array(used.length * src.itemSize); used.forEach((v, i) => { for (let j = 0; j < src.itemSize; j++) a2[i * src.itemSize + j] = src.array[v * src.itemSize + j]; }); g2.setAttribute(nm, new THREE.BufferAttribute(a2, src.itemSize)); }
      g2.setIndex(idx.map(v => map.get(v))); g2.computeVertexNormals();
      const piece = new THREE.Mesh(g2, m.mesh.material); piece.castShadow = true; piece.frustumCulled = false;
      R.g.updateMatrixWorld(true); const wp = c.clone().applyMatrix4(R.g.matrixWorld); piece.position.copy(wp).applyMatrix4(new THREE.Matrix4().copy(this.group.matrixWorld).invert()); piece.quaternion.setFromRotationMatrix(R.g.matrixWorld); this.group.add(piece);
      const out = wp.clone().sub(new THREE.Vector3().setFromMatrixPosition(R.g.matrixWorld)).normalize();
      this.debris.push({ mesh: piece, v: out.multiplyScalar(6 + Math.random() * 8).add(R.vel ? new THREE.Vector3(...R.vel) : new THREE.Vector3()), w: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(6), t: 0, smoke: 0 });
      G.setIndex(keep); G.computeBoundingSphere();
    }
    R.torn = (R.torn || 0) + 1;
  }
  // per frame: the pieces in the air (falling, spinning, smoking: `smoke(p)` puts a puff at a render-space point), and ships no longer drawn let go
  update(dt, smoke = null, groundAt = null) {
    for (const D of this.debris) {
      D.t += dt; D.v.y -= 9.81 * dt; D.v.multiplyScalar(Math.exp(-dt * 0.08)); D.mesh.position.addScaledVector(D.v, dt);
      const ang = D.w.length(); if (ang > 1e-4) D.mesh.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(_v.copy(D.w).normalize(), ang * dt));
      if (smoke && (D.smoke -= dt) < 0 && D.t < 14) { D.smoke = 0.12; smoke(D.mesh.getWorldPosition(new THREE.Vector3()).toArray()); }
      if (groundAt) { const p = D.mesh.getWorldPosition(new THREE.Vector3()), g = groundAt(p.x, p.z); if (g != null && p.y < g) { D.mesh.position.y += g - p.y; D.v.set(D.v.x * 0.3, Math.abs(D.v.y) * 0.15, D.v.z * 0.3); D.w.multiplyScalar(0.5); } }
    }
    this.debris = this.debris.filter(D => { if (D.t > 40) { this.group.remove(D.mesh); D.mesh.geometry.dispose(); return false; } return true; });
    for (const R of this.ships.values()) { if (!R.seen) R.g.visible = false; R.seen = false; }
  }
  // repaired, or gone for good
  forget(id) { const R = this.ships.get(id); if (!R) return; this.group.remove(R.g); for (const m of R.meshes) { m.mesh.geometry.dispose(); m.mesh.material.dispose(); } this.ships.delete(id); }
  // how badly: torn-off parts and hits taken (for smoke trails)
  state(id) { const R = this.ships.get(id); return R ? { hits: R.hits, torn: R.torn || 0 } : null; }
}
