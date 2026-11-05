// Animals drawn: one skinned model per species at two levels of detail, a skeleton per animal, moved each frame by
// hand. Feet are planted where they land on the actual ground and the leg solved to reach them, so nothing skates or
// sinks; the body follows the land; heads drop to graze and turn to watch you; tails, ears and wings live a little.
import * as THREE from 'three';
import { rigOf } from '../gen/fauna.js';
import { skinOf } from '../gen/creature.js';
import { baked } from './materials.js';
import { surfaceHeight } from '../gen/surface.js';

const NEAR_LOD = 42, DRAW = 300, MAX_DRAWN = 40;
const V = () => new THREE.Vector3(), Q = () => new THREE.Quaternion();
const v0 = V(), v1 = V(), v2 = V(), v3 = V(), q0 = Q(), q1 = Q(), euler = new THREE.Euler(), IDENT = Q(), UP = new THREE.Vector3(0, 1, 0);

function skinMaterial(skin, tile) {
  const b = baked(skin, 1), m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: skin === 'scales' ? 0.55 : skin === 'hide' ? 0.75 : 0.95, metalness: 0, side: THREE.DoubleSide });
  m.onBeforeCompile = sh => {
    sh.uniforms.tSkin = { value: b?.map }; sh.uniforms.uTile = { value: tile };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vBind; varying vec3 vBindN;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvBind = position; vBindN = normal;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D tSkin; uniform float uTile; varying vec3 vBind; varying vec3 vBindN; float gSkinH;')
      .replace('#include <map_fragment>', `
        vec3 bwS = pow(abs(normalize(vBindN)), vec3(3.0)); bwS /= bwS.x + bwS.y + bwS.z;
        vec3 cS = texture2D(tSkin, vBind.zy / uTile).rgb * bwS.x + texture2D(tSkin, vBind.xz / uTile).rgb * bwS.y + texture2D(tSkin, vBind.xy / uTile).rgb * bwS.z;
        gSkinH = dot(cS, vec3(0.333)); diffuseColor.rgb *= 0.55 + 0.9 * gSkinH;`)
      .replace('#include <normal_fragment_maps>', `{   // the skin's relief, from its own shading (bump)
        vec3 dpx = dFdx(-vViewPosition), dpy = dFdy(-vViewPosition); float hx = dFdx(gSkinH), hy = dFdy(gSkinH); vec3 r1 = cross(dpy, normal), r2 = cross(normal, dpx); float det = dot(dpx, r1); vec3 grad = sign(det) * (hx * r1 + hy * r2);
        normal = normalize(abs(det) * normal - 0.012 * clamp(1.0 - vViewPosition.z / 40.0, 0.0, 1.0) * grad); }`);
  };
  return m;
}

function geometryOf(d) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(d.pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(d.nrm, 3)); g.setAttribute('color', new THREE.BufferAttribute(d.col, 3));
  g.setAttribute('skinIndex', new THREE.BufferAttribute(d.ski, 4)); g.setAttribute('skinWeight', new THREE.BufferAttribute(d.skw, 4)); g.setIndex(new THREE.BufferAttribute(d.idx, 1));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 50);
  return g;
}

// eyes: wet, dark and large with a thin warm iris
function eyeGeometry(R, coat) {
  const pos = [], nrm = [], col = [], ski = [], skw = [], idx = [], base = new THREE.IcosahedronGeometry(1, 3), P = base.attributes.position;
  for (const E of R.eyes) {
    const o = pos.length / 3, side = Math.sign(E.at[0]) || 1, look = new THREE.Vector3(side * 0.82, 0.05, 0.56).normalize();
    for (let i = 0; i < P.count; i++) { const x = P.getX(i), y = P.getY(i), z = P.getZ(i), t = x * look.x + y * look.y + z * look.z; pos.push(E.at[0] - side * E.r * 0.35 + x * E.r, E.at[1] + y * E.r, E.at[2] + z * E.r); nrm.push(x, y, z); /* nearly all pupil: a large soft dark eye */ const c = t > 0.42 ? [0.012, 0.01, 0.01] : t > 0.2 ? [0.16, 0.09, 0.04] : [0.05, 0.04, 0.035]; col.push(...c); ski.push(E.bone, 0, 0, 0); skw.push(1, 0, 0, 0); }
    for (let i = 0; i < P.count; i += 3) idx.push(o + i, o + i + 1, o + i + 2);
  }
  return geometryOf({ pos: new Float32Array(pos), nrm: new Float32Array(nrm), col: new Float32Array(col), ski: new Uint16Array(ski), skw: new Float32Array(skw), idx: new Uint32Array(idx) });
}

export class FaunaView {
  constructor(planet) { this.planet = planet; this.group = new THREE.Group(); this.group.name = 'fauna'; this.kinds = new Map(); this.drawn = new Map(); this.pool = new Map(); this.eyeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.07, metalness: 0 }); }
  kind(S) {
    let K = this.kinds.get(S.id); if (K) return K;
    const r = rigOf(S), R = r.R;
    K = { S, r, R, hi: geometryOf(skinOf(R, 62, S.coat, S.pattern, S.patternSeed)), lo: geometryOf(skinOf(R, 26, S.coat, S.pattern, S.patternSeed)), eye: R.eyes.length ? eyeGeometry(R, S.coat) : null, mat: skinMaterial(S.skin, S.skin === 'scales' ? S.size * 0.1 : S.skin === 'hide' ? S.size * 0.3 : S.size * 0.12) };
    this.kinds.set(S.id, K);
    return K;
  }
  body(K) {
    const list = this.pool.get(K.S.id); if (list?.length) return list.pop();
    const obj = new THREE.Group(), bones = K.R.bones.map(b => { const o = new THREE.Bone(); o.name = b.name; return o; });
    K.R.bones.forEach((b, i) => { const par = b.parent >= 0 ? K.R.bones[b.parent].at : [0, 0, 0]; bones[i].position.set(b.at[0] - par[0], b.at[1] - par[1], b.at[2] - par[2]); (b.parent >= 0 ? bones[b.parent] : obj).add(bones[i]); });
    obj.updateMatrixWorld(true);
    const sk = new THREE.Skeleton(bones); sk.calculateInverses(); const mk = (g, m) => { const s = new THREE.SkinnedMesh(g, m); s.frustumCulled = false; s.castShadow = true; s.receiveShadow = true; s.bind(sk, new THREE.Matrix4()); obj.add(s); return s; };
    const hi = mk(K.hi, K.mat), lo = mk(K.lo, K.mat), eye = K.eye ? mk(K.eye, this.eyeMat) : null;
    const rest = K.R.bones.map(b => new THREE.Vector3(...b.at));
    const qm = bones.map(() => Q()), pm = bones.map(() => V());
    return { obj, bones, sk, hi, lo, eye, rest, qm, pm, feet: K.R.legs.map(() => ({ plant: null, from: null, was: false })), phase: Math.random(), yb: 0 };
  }
  update(dt, sim, px, pz) {
    const near = sim.animals.map(A => [A, Math.hypot(A.x - px, A.z - pz)]).filter(q => q[1] < DRAW).sort((a, b) => a[1] - b[1]).slice(0, MAX_DRAWN);
    const keep = new Set(near.map(q => q[0]));
    for (const [A, B] of this.drawn) if (!keep.has(A)) { this.group.remove(B.obj); const K = A.sp.id; (this.pool.get(K) || this.pool.set(K, []).get(K)).push(B); B.feet.forEach(f => { f.plant = null; }); this.drawn.delete(A); }
    for (const [A, d] of near) {
      let B = this.drawn.get(A);
      if (!B) { const K = this.kind(A.sp); B = this.body(K); B.K = K; this.drawn.set(A, B); this.group.add(B.obj); }
      B.hi.visible = d < NEAR_LOD; B.lo.visible = !B.hi.visible; if (B.eye) B.eye.visible = d < 90; B.lo.castShadow = d < 90;
      // far ones are moved every few frames
      if (d > 100 && (B.skip = (B.skip || 0) + 1) % 3) { B.obj.position.set(A.x, A.y, A.z); continue; }
      this.pose(A, B, B.K, d > 100 ? dt * 3 : dt, px, pz);
    }
  }
  fk(B, K) {
    K.R.bones.forEach((b, i) => {
      const o = B.bones[i];
      if (b.parent < 0) { B.qm[i].copy(o.quaternion); B.pm[i].copy(o.position); }
      else { B.qm[i].copy(B.qm[b.parent]).multiply(o.quaternion); B.pm[i].copy(o.position).applyQuaternion(B.qm[b.parent]).add(B.pm[b.parent]); }
    });
  }
  // Point bone `i` (its rest axis to `child`) along `dir` in model space.
  aim(B, K, i, child, dir, parentQ) {
    v3.copy(B.rest[child]).sub(B.rest[i]).normalize();
    q0.setFromUnitVectors(v3, dir);
    B.qm[i].copy(q0);
    B.bones[i].quaternion.copy(q1.copy(parentQ).invert().multiply(q0));
  }
  pose(A, B, K, dt, px, pz) {
    const r = K.r, R = K.R, t = performance.now() / 1000 + A.seed, S = A.sp, size = S.size, dead = A.state === 'down' || A.dead;
    B.obj.position.set(A.x, A.y, A.z); B.obj.rotation.set(0, A.facing, 0, 'YXZ');
    const speed = dead ? 0 : A.speed, walkCycle = r.stride * (speed > 3 ? 1.5 : 1);
    if (A.frozen) { /* a held pose for photographs */ }
    B.phase = (B.phase + speed / Math.max(0.2, walkCycle) * dt) % 1;
    // reset, then body
    for (const b of B.bones) b.quaternion.identity();
    const rootB = B.bones[r.root], bob = R.legs.length ? Math.sin(B.phase * 12.566) * 0.012 * size * Math.min(1, speed) : 0;
    rootB.position.set(0, R.bones[r.root].at[1] + bob, 0);
    let hopY = 0; if (r.hop && speed > 0.2) { const f = (B.phase * 2) % 1; hopY = Math.sin(Math.min(1, f / 0.6) * Math.PI) * size * 0.2 * Math.min(1.5, speed); rootB.position.y += hopY; }
    if (dead) { rootB.quaternion.setFromEuler(euler.set(0, 0, 1.45 * (A.seed % 2 ? 1 : -1))); rootB.position.y = S.size * 0.26; A.dying && (A.dying = false); }
    else if (r.wings) rootB.quaternion.setFromEuler(euler.set(0, 0, -(A.bank || 0) * 0.7));
    else rootB.quaternion.setFromEuler(euler.set(A.pitch * 0.85, 0, Math.sin(B.phase * 6.283) * 0.018 * Math.min(1, speed)));
    // head and neck: down to graze, up and turned to you when wary, stretched out when running
    const grazing = A.state === 'graze' || A.state === 'pose' ? 1 : 0; B.gr = (B.gr || 0) + (grazing * (1 - A.alert) - (B.gr || 0)) * Math.min(1, dt * 1.5); B.al = (B.al || 0) + (A.alert - (B.al || 0)) * Math.min(1, dt * 3);
    const nodDown = (r.hop ? 0.12 : r.trunk ? 0.1 + 0.2 * Math.sin(t * 0.33) ** 2 : 0.2 + 0.45 * Math.sin(t * 0.33) ** 2) * B.gr, neckN = r.neck.length - 1; let look = 0;
    if (B.al > 0.05 && !dead) { const want = Math.atan2(px - A.x, pz - A.z); look = Math.atan2(Math.sin(want - A.facing), Math.cos(want - A.facing)); look = Math.max(-1.1, Math.min(1.1, look)) * B.al; }
    const run = Math.min(1, speed / 5), downN = dead ? 0.3 : r.plan === 'stilter' ? nodDown * 1.1 : nodDown * 1.4;
    if (r.neck) for (let i = 0; i < neckN; i++) B.bones[r.neck[i]].quaternion.setFromEuler(euler.set(downN + run * 0.22 - B.al * 0.12, look / neckN, Math.sin(t * 0.8) * 0.015));
    if (r.head !== undefined && !r.flies) { const hq = euler.set(downN * 0.35 + (dead ? 0.2 : 0) + Math.sin(t * 1.3) * 0.02, look * 0.4, 0); B.bones[r.head].quaternion.setFromEuler(hq); }
    // tail: hangs, sways, streams when moving
    if (r.tail) r.tail.slice(0, -1).forEach((id, i) => B.bones[id].quaternion.setFromEuler(euler.set(0.05 - run * 0.06, Math.sin(t * (speed > 1 ? 3.4 : 1.1) - i * 0.9) * (0.05 + 0.04 * i) * (dead ? 0 : 1), 0)));
    for (const e of r.ears || []) { const fl = Math.max(0, Math.sin(t * 0.31 + e.side) - 0.965) * 18; B.bones[e.bone].quaternion.setFromEuler(euler.set(-B.al * 0.3 + run * 0.7, 0, e.side * (fl * 0.5 + Math.sin(t * 2) * 0.015))); }
    if (r.trunk) r.trunk.slice(0, -1).forEach((id, i) => B.bones[id].quaternion.setFromEuler(euler.set(-0.32 + Math.sin(t * 1.5 + i) * 0.14 - B.al * 0.14, Math.sin(t * 1.1 + i * 1.5) * 0.2, 0)));
    if (r.crest !== undefined) B.bones[r.crest].quaternion.setFromEuler(euler.set(-B.al * 0.9 + 0.5, 0, 0));
    if (r.wings) { const fl = Math.sin(t * 5.2 + A.seed) * (0.3 + 0.28 * (Math.sin(t * 0.5 + A.seed) > -0.3 ? 1 : 0.15)); for (const W of r.wings) { const f = W.front ? fl : Math.sin(t * 5.2 + A.seed + 1.2) * 0.8 * Math.abs(fl) / 0.58; B.bones[W.w0].quaternion.setFromEuler(euler.set(0, 0, W.side * (f + 0.05))); B.bones[W.w1].quaternion.setFromEuler(euler.set(0, 0, W.side * f * 0.5)); } if (dead) for (const W of r.wings) { B.bones[W.w0].quaternion.setFromEuler(euler.set(0, 0, -W.side * 0.3)); B.bones[W.w1].quaternion.setFromEuler(euler.set(0, 0, W.side * 0.5)); } }
    this.fk(B, K);
    // legs: stance foot stays where it was put; swing foot arcs to where it'll next be needed
    if (!dead && !r.flies) {
      const sf = Math.sin(A.facing), cf = Math.cos(A.facing), toM = (wx, wy, wz, out) => { const dx = wx - A.x, dz = wz - A.z; return out.set(dx * cf - dz * sf, wy - A.y, dx * sf + dz * cf); };
      const duty = speed > 3.5 ? 0.42 : 0.62;
      R.legs.forEach((L, i) => {
        const F = B.feet[i], rx = L.rest[0], rz = L.rest[1], wrx = A.x + rx * cf + rz * sf, wrz = A.z - rx * sf + rz * cf;
        if (!F.plant) { F.plant = [wrx, surfaceHeight(this.planet, wrx, wrz), wrz]; }
        const lp = (B.phase + L.phase) % 1, moving = speed > 0.08;
        let wx, wy, wz, arc = 0;
        if (moving && lp >= duty) {
          const u = (lp - duty) / (1 - duty);
          if (!F.was) { F.was = true; F.from = F.plant.slice(); const lead = speed * walkCycle / Math.max(speed, 0.5) * 0.28; const tx = wrx + sf * lead, tz = wrz + cf * lead; F.to = [tx, surfaceHeight(this.planet, tx, tz), tz]; }
          const e = u * u * (3 - 2 * u); wx = F.from[0] + (F.to[0] - F.from[0]) * e; wy = F.from[1] + (F.to[1] - F.from[1]) * e; wz = F.from[2] + (F.to[2] - F.from[2]) * e; arc = Math.sin(u * Math.PI) * Math.min(size * 0.22, 0.25 * r.stride);
        } else {
          if (F.was) { F.was = false; F.plant = F.to.slice(); }
          // standing: a foot left too far behind takes a small step
          if (!moving && Math.hypot(F.plant[0] - wrx, F.plant[2] - wrz) > r.stride * 0.3) { F.plant = [wrx, surfaceHeight(this.planet, wrx, wrz), wrz]; }
          [wx, wy, wz] = F.plant;
        }
        toM(wx, wy + L.ankle + arc + (r.hop ? hopY * 0.7 : 0), wz, v0);
        // two-bone solve in the model's frame
        const hip = B.pm[L.thigh], pQ = B.qm[R.bones[L.thigh].parent];
        v1.copy(v0).sub(hip); const a = L.len0, b = L.len1, reach = Math.min(a + b - 1e-3, Math.max(Math.abs(a - b) + 1e-3, v1.length())); v1.normalize();
        const cosA = (a * a + reach * reach - b * b) / (2 * a * reach), sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
        v2.set(0, 0, L.pole); v2.addScaledVector(v1, -v2.dot(v1)); if (v2.lengthSq() < 1e-5) v2.set(0, 0, L.pole); v2.normalize();
        const knee = V(); knee.copy(hip).addScaledVector(v1, cosA * a).addScaledVector(v2, sinA * a);
        const dirT = V().copy(knee).sub(hip).normalize(), dirS = V().copy(hip).addScaledVector(v1, reach).sub(knee).normalize();
        this.aim(B, K, L.thigh, L.shin, dirT, pQ); this.aim(B, K, L.shin, L.foot, dirS, B.qm[L.thigh]);
        // keep the sole flat: undo what the shin did
        q1.copy(B.qm[L.shin]).invert(); B.bones[L.foot].quaternion.copy(q1);
      });
    }
  }
}
