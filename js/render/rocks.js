// Rock models, made here from the planet's own numbers, so no two worlds have quite the same stones. A sphere
// is cut by random planes (the way real rock breaks along joints), then roughened at a few scales: boulders
// keep their fracture faces; slabs are bedded; pillars rise out of a skirt of their own rubble. Rock surfaces come
// from the same texture array as the ground, projected from three sides, with moss where the land is damp.
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { rockTile, ledgeTile, TILE, VARIANTS } from '../gen/rocks.js';
import { hashInts, hashStr } from '../core/hash.js';
import { Simplex2 } from '../core/noise.js';
import { groundTextures, GROUND_LAYERS } from './materials.js';
import { landTones } from '../gen/land.js';

const LAYER = { plain: 'rock', sandstone: 'sandstone', basalt: 'basalt', granite: 'granite', pale: 'pale' };
const NEAR_SMALL = 110, NEAR_BIG = 420, FAR = 1500, LEDGE = 170;

function rockGeometry(seed, shape, rock, detail) {
  const r = k => hashInts(seed, [k]) / 4294967296, N = new Simplex2([seed, seed ^ 0x77]);
  let g = new THREE.IcosahedronGeometry(1, detail); g.deleteAttribute('uv'); g.deleteAttribute('normal'); g = mergeVertices(g, 1e-4);
  const planes = [], n = shape === 'pillar' ? 7 : 9 + Math.floor(r(1) * 8);
  for (let i = 0; i < n; i++) { const a = r(10 + i) * 6.283, y = shape === 'pillar' ? (r(30 + i) - 0.5) * 0.3 : r(30 + i) * 1.7 - 0.85, c = Math.sqrt(Math.max(0, 1 - y * y)); planes.push([Math.cos(a) * c, y, Math.sin(a) * c, 0.58 + 0.4 * r(50 + i)]); }
  const P = g.attributes.position, v = new THREE.Vector3(), beds = rock === 'sandstone' ? 9 : rock === 'pale' ? 6 : rock === 'basalt' ? 0 : 3;
  for (let i = 0; i < P.count; i++) {
    v.fromBufferAttribute(P, i).normalize();
    // the joints cut it, but no break in stone is a knife edge: where two faces meet the edge is worn round (a soft minimum, not a hard one)
    let R = 1.15; const kk = 0.075; for (const [a, b, c, d] of planes) { const q = a * v.x + b * v.y + c * v.z; if (q > 0.02) { const r2 = d / q, h = Math.max(kk - Math.abs(R - r2), 0) / kk; R = Math.min(R, r2) - h * h * kk * 0.25; } }
    const u = v.x * 1.9 + v.y * 0.7, w = v.z * 1.9 - v.y * 0.7;
    // then roughened at every scale the mesh can carry: the lumps of the block, the chips off its faces, the grain of the stone
    R *= 1 + 0.11 * N.fbm(u * 1.4 + 3, w * 1.4, 3) + 0.035 * N.ridged(u * 6, w * 6, 2) + (detail >= 5 ? 0.014 * N.fbm(u * 17 + 7, w * 17 - 3, 2) + 0.006 * N.n(u * 41, w * 41) : 0);
    let x = v.x * R, y = v.y * R, z = v.z * R;
    if (shape === 'slab') y = y * 0.62;
    if (beds) { const k = beds * 0.5, t = (y + 2) * k, f = t - Math.floor(t), step = (Math.floor(t) + (f > 0.7 ? (f - 0.7) / 0.3 : 0)) / k - 2, sh = 1 + 0.05 * Math.sin(Math.floor(t) * 12.9 + seed); y = y * 0.35 + step * 0.65; x *= sh; z *= sh; }
    if (shape === 'pillar') {               // tall, waisted under a harder cap, flaring into its rubble at the foot
      const t = y * 0.5 + 0.5, waist = 0.62 + 0.3 * Math.abs(t - 0.45) * 2 + 0.55 * Math.max(0, 0.16 - t) * 4 + 0.18 * N.fbm(t * 5, seed % 7, 2), cap = t > 0.86 ? 1.32 - (t - 0.86) * 1.1 : 1;
      x *= waist * cap * 0.9; z *= waist * cap * 0.9;
    }
    P.setXYZ(i, x, y, z);
  }
  // to unit box: x, z within ±1, y from 0 to 1
  g.computeBoundingBox(); const B = g.boundingBox, sx = Math.max(-B.min.x, B.max.x), sz = Math.max(-B.min.z, B.max.z), hy = B.max.y - B.min.y;
  for (let i = 0; i < P.count; i++) P.setXYZ(i, P.getX(i) / sx, (P.getY(i) - B.min.y) / hy, P.getZ(i) / sz);
  g.computeVertexNormals(); g.computeBoundingSphere();
  return g;
}

function rockMaterial(layerName) {
  const T = groundTextures(), i = GROUND_LAYERS.indexOf(layerName), tile = T.tiles[i], m = new THREE.MeshStandardMaterial({ roughness: 0.92, metalness: 0, vertexColors: false });
  const iMoss = GROUND_LAYERS.indexOf('moss');
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, { tG: { value: T.map }, tGN: { value: T.normal }, uL: { value: i }, uM: { value: iMoss }, uT: { value: Math.min(tile, 5) }, uMean: { value: T.means[i] }, uMossMean: { value: T.means[iMoss] } });
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aMoss; varying vec3 vWP; varying vec3 vWN; varying float vMoss;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec4 wp0 = instanceMatrix * vec4(position, 1.0); vWP = wp0.xyz; vMoss = aMoss;
        vWN = normalize(mat3(instanceMatrix) * (normal / vec3(dot(instanceMatrix[0].xyz, instanceMatrix[0].xyz), dot(instanceMatrix[1].xyz, instanceMatrix[1].xyz), dot(instanceMatrix[2].xyz, instanceMatrix[2].xyz))));`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      uniform mat3 normalMatrix; uniform sampler2DArray tG; uniform sampler2DArray tGN; uniform float uL; uniform float uM; uniform float uT; uniform vec3 uMean; uniform vec3 uMossMean;
      varying vec3 vWP; varying vec3 vWN; varying float vMoss;`)
      .replace('#include <map_fragment>', `
      vec3 wn = normalize(vWN), bw = pow(abs(wn), vec3(4.0)); bw /= bw.x + bw.y + bw.z;
      vec3 c0 = texture(tG, vec3(vWP.zy / uT, uL)).rgb * bw.x + texture(tG, vec3(vWP.xz / uT, uL)).rgb * bw.y + texture(tG, vec3(vWP.xy / uT, uL)).rgb * bw.z;
      vec3 c1 = texture(tG, vec3(vWP.zy / (uT * 0.31), uL)).rgb * bw.x + texture(tG, vec3(vWP.xz / (uT * 0.31), uL)).rgb * bw.y + texture(tG, vec3(vWP.xy / (uT * 0.31), uL)).rgb * bw.z;
      vec3 stone = clamp((c0 * 0.6 + c1 * 0.4) / uMean, 0.0, 2.6);
      diffuseColor.rgb *= 0.34 * stone;


      // moss on what faces the sky, where the land is damp
      float blot = texture(tG, vec3(vWP.xz / 7.0, uL)).r / max(uMean.r, 0.01);
      float mossW = vMoss * smoothstep(0.25, 0.85, wn.y + 0.5 * (blot - 1.0));
      if (mossW > 0.01) diffuseColor.rgb = mix(diffuseColor.rgb, texture(tG, vec3(vWP.xz / 1.3, uM)).rgb * 0.75, mossW);
      `)
      .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
      { vec3 q = bw.y > 0.5 ? vec3(vWP.xz / uT, uL) : (bw.x > bw.z ? vec3(vWP.zy / uT, uL) : vec3(vWP.xy / uT, uL));
        vec3 mapN = texture(tGN, q).xyz * 2.0 - 1.0; mapN.xy *= 0.9;
        vec3 Tn = normalize(cross(vec3(0.0, 0.0, 1.0), wn) + vec3(1e-4, 0.0, 0.0)), Bn = normalize(cross(wn, Tn));
        normal = normalize(mat3(viewMatrix) * (Tn * mapN.x + Bn * mapN.y + wn * max(mapN.z, 0.05))); }`);
  };
  return m;
}

const UP = new THREE.Vector3(0, 1, 0);
export class RockView {
  constructor(planet) {
    this.planet = planet; this.group = new THREE.Group(); this.group.name = 'rocks';
    this.ok = !!groundTextures(); this.sets = new Map(); this.mats = {}; this.tiles = new Map(); this.ledgeTiles = new Map(); this.queue = []; this.at = null; this.last = 0;
    const seed = hashStr(planet.universeSeed[1] ^ 0x60ccc, planet.address?.key || 'p'), t = landTones(planet);
    this.seed = seed;
    this.colour = { plain: planet.climate.rock.map(v => v * 1.5), sandstone: t.sandstone.map(v => v * 1.15), basalt: [0.2, 0.19, 0.19], granite: [0.62, 0.59, 0.56], pale: [0.92, 0.88, 0.8] };
    this._m = new THREE.Matrix4(); this._c = new THREE.Color(); this._p = new THREE.Vector3(); this._q = new THREE.Quaternion(); this._s = new THREE.Vector3(); this._e = new THREE.Euler(); this._n = new THREE.Vector3(); this._q2 = new THREE.Quaternion();
  }
  set(rock, shape, v, hi) {
    const k = rock + shape + v + (hi === 2 ? 'm' : hi ? 'h' : 'l'); let S = this.sets.get(k); if (S) return S;
    const geo = rockGeometry(hashInts(this.seed, [hashStr(5, rock + shape), v]), shape, rock, hi === 2 ? 6 : hi ? 9 : 4);
    const mat = this.mats[rock] || (this.mats[rock] = rockMaterial(LAYER[rock]));
    S = { geo, mat, list: [], im: null, hi }; this.sets.set(k, S);
    return S;
  }
  update(x, z) {
    if (!this.ok) return;
    const moved = !this.at || Math.hypot(x - this.at[0], z - this.at[1]) > 24;
    if (this.queue.length && this.queueAt && Math.hypot(x - this.queueAt[0], z - this.queueAt[1]) > 120) this.queue.length = 0;
    if (moved && !this.queue.length) {
      this.queueAt = [x, z];
      const R = Math.ceil(FAR / TILE), ti = Math.floor(x / TILE), tj = Math.floor(z / TILE);
      for (let a = -R; a <= R; a++) for (let b = -R; b <= R; b++) if (!this.tiles.has((ti + a) + ',' + (tj + b)) && (a * a + b * b) * TILE * TILE <= (FAR + TILE) ** 2) this.queue.push([ti + a, tj + b, a * a + b * b]);
      this.queue.sort((p, q) => q[2] - p[2]);
    }
    const t0 = performance.now();
    while (this.queue.length && performance.now() - t0 < 4) { const [a, b] = this.queue.pop(); this.tiles.set(a + ',' + b, rockTile(this.planet, a, b)); }
    if (moved || (this.queue.length && t0 - this.last > 800) || (!this.queue.length && this.pending)) { this.last = t0; this.pending = this.queue.length > 0; this.rebuild(x, z); }
  }
  rebuild(x, z) {
    this.at = [x, z];
    for (const S of this.sets.values()) S.list.length = 0;
    for (const [key, list] of this.tiles) {
      const [a, b] = key.split(',').map(Number);
      if (Math.abs((a + 0.5) * TILE - x) > FAR + TILE || Math.abs((b + 0.5) * TILE - z) > FAR + TILE) { this.tiles.delete(key); continue; }
      for (const q of list) {
        const d = Math.hypot(q.x - x, q.z - z), big = q.size > 2.5;
        if (d > (big ? FAR : q.size > 1.1 ? NEAR_BIG : NEAR_SMALL)) continue;
        this.set(q.rock, q.shape, q.v, d < (big ? 300 : 45)).list.push(q);
      }
    }
    // the rock standing out of the steep ground around you
    { const R = Math.ceil(LEDGE / TILE), ti = Math.floor(x / TILE), tj = Math.floor(z / TILE), t0 = performance.now();
      for (let a = -R; a <= R; a++) for (let b = -R; b <= R; b++) { const key = (ti + a) + ',' + (tj + b); let L = this.ledgeTiles.get(key); if (!L) { if (performance.now() - t0 > 6) { this.pending = true; continue; } L = ledgeTile(this.planet, ti + a, tj + b); this.ledgeTiles.set(key, L); if (this.ledgeTiles.size > 80) this.ledgeTiles.delete(this.ledgeTiles.keys().next().value); }
        for (const q of L) { const d = Math.hypot(q.x - x, q.z - z); if (d < LEDGE) this.set(q.rock, q.shape, q.v, d < 110 ? 2 : false).list.push(q); } } }
    for (const S of this.sets.values()) {
      const n = S.list.length;
      if (!S.im || S.im.instanceMatrix.count < n) {
        if (S.im) { this.group.remove(S.im); S.im.dispose(); }
        const cap = Math.max(32, Math.ceil(n * 1.5));
        S.im = new THREE.InstancedMesh(S.geo, S.mat, cap); S.im.frustumCulled = false; S.im.castShadow = S.hi; S.im.receiveShadow = S.hi;
        S.im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
        S.moss = new THREE.InstancedBufferAttribute(new Float32Array(cap), 1); S.geo = S.geo.clone(); S.geo.setAttribute('aMoss', S.moss); S.im.geometry = S.geo;
        this.group.add(S.im);
      }
      S.list.forEach((q, i) => {
        if (q.gx !== undefined) {      // a ledge: long across the slope, leaning back into it
          this._n.set(-q.gx * 0.9, 1, -q.gz * 0.9).normalize(); this._q.setFromUnitVectors(UP, this._n).multiply(this._q2.setFromAxisAngle(UP, q.across)); this._p.set(q.x, q.y - q.tall * 0.38, q.z); this._s.set(q.size, q.tall, q.deep * 0.8);      // (bedded in the slope it stands out of, not laid on it)
        } else { this._e.set(q.tilt, q.rot, q.tilt * 0.6); this._q.setFromEuler(this._e); this._p.set(q.x, q.y, q.z); this._s.set(q.size, q.tall, q.size * (0.75 + 0.4 * q.tint)); }
        S.im.setMatrixAt(i, this._m.compose(this._p, this._q, this._s));
        const col = this.colour[q.rock], k = (0.82 + 0.34 * q.tint) * (q.gx !== undefined ? 0.78 : 1); S.im.setColorAt(i, this._c.setRGB(col[0] * k, col[1] * k, col[2] * k));
        S.moss.setX(i, q.moss);
      });
      S.im.count = n; S.im.instanceMatrix.needsUpdate = true; S.im.instanceColor.needsUpdate = true; S.moss.needsUpdate = true;
    }
  }
}
