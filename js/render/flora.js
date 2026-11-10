// Draws the plants and boulders of gen/flora.js: full models near the player, a light
// stand-in for trees further out, nothing beyond. Tiles are generated a few per frame
// as you move, so nothing stalls; instance buffers are rebuilt when you've moved far
// enough to matter. Leaves take the planet's own grass colour.
import { share } from './share.js';
import * as THREE from 'three';
import { floraTile, TILE, grassTile, GTILE, SPECIES, TREES } from '../gen/flora.js';

const NEAR_TREE = 190, NEAR = { shrub: 95, fern: 70 };     // full model within (m)
const MAX_FULL_TREES = 42;
const FAR = 1000;                                                // trees as stand-ins out to (m)
const LEAFY = new Set(['leafcard', 'needlecard', 'frondcard', 'padcard', 'leaf', 'crystal']);      // (what takes the world's living colour: leaves, a succulent's flesh, a fungus cap, crystal)
// Leaf colours: familiar trees take the planet's own green; the others have their own
const TINT = { parasol: [0.32, 0.55, 0.42], spiral: [0.45, 0.42, 0.78], bottle: [0.95, 0.55, 0.28] };

export class FloraView {
  constructor(lib, planet, renderer) {
    this.planet = planet; this.renderer = renderer; this.group = new THREE.Group(); this.group.name = 'flora';
    this.kinds = {};
    const v = k => lib && [...lib.variants.values()].find(x => x.kind === k);
    for (const sp of [...TREES, 'shrub', 'fern']) {
      const va = v(SPECIES[sp].tree ? 'tree_' + sp : sp); if (!va) continue;
      this.kinds[sp] = { sp, dims: va.dims, prims: va.prims.map(pr => ({ pr, im: null, leafy: LEAFY.has(pr.slot) })), list: [] };
      if (SPECIES[sp].tree) this.kinds[sp + '_far'] = { sp, far: true, dims: va.dims, prims: null, list: [] };
    }
    // leaves part as the camera comes up to them, rather than filling the screen
    const hueFree = !!planet.genome && !['green', 'olive'].includes(planet.genome.keys.foliage);      // (only where life isn't green: there the textures' own green must not show)
    const parted = new Set(); for (const k in this.kinds) for (const P of this.kinds[k].prims || []) if (P.leafy && !parted.has(P.pr.material)) { parted.add(P.pr.material); const m = P.pr.material, prior = m.onBeforeCompile; m.onBeforeCompile = (sh, r) => { prior?.(sh, r); sh.fragmentShader = sh.fragmentShader.replace('#include <alphatest_fragment>', `#include <alphatest_fragment>
      if (vViewPosition.z < 4.5 && fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) > smoothstep(1.2, 4.5, vViewPosition.z)) discard;`);
      if (hueFree && m.map) sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      { float lum = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11)); diffuseColor.rgb = vec3(lum * 2.6); }`);      // (the leaf picture gives light and shade only; the hue is this world's instance colour, so a violet world's leaves are violet, not green-stained)
    }; m.customProgramCacheKey = () => 'parted' + (hueFree ? 'h' : ''); m.needsUpdate = true; }
    const g = planet.climate.canopy || planet.climate.grass, l = Math.max(...g);
    this.leafBase = new THREE.Color(g[0] / l, g[1] / l, g[2] / l).lerp(new THREE.Color(1, 1, 1), 0.3);
    this.at = null; this.tiles = new Map(); this.queue = [];
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._q2 = new THREE.Quaternion(); this._fx = new THREE.Vector3(); this._c = new THREE.Color(); this.up = new THREE.Vector3(0, 1, 0);
  }
  get ok() { return Object.keys(this.kinds).length > 0; }
  leafColour(sp, tint, out) {
    const t = TINT[sp];
    if (t) { out.setRGB(t[0], t[1], t[2]); const w = this.planet.genome ? 0.25 + 0.6 * this.planet.genome.weird : 0; if (w) out.lerp(this.leafBase, w); }      // (the strange trees carry the world's own hue too, more so the stranger it is)
    else out.copy(this.leafBase);
    return out.multiplyScalar((sp === 'spruce' || sp === 'pine' ? 0.6 : 0.78) + 0.3 * tint);
  }
  // The distant stand-in for a species: its real model photographed from the side into a
  // texture, on three crossed upright cards. Made once, the first time it's needed.
  impostor(K) {
    if (K.prims) return K.prims;
    const near = this.kinds[K.sp], [L, D, H] = near.dims, W = 256, Hh = 320;
    const scene = new THREE.Scene(), cam = new THREE.OrthographicCamera(-L * 0.62, L * 0.62, H * 1.03, -H * 0.03, -50, 50);
    cam.position.set(0, 0, 20); cam.lookAt(0, 0, 0);
    const dl = new THREE.DirectionalLight(0xffffff, 2.2); dl.position.set(3, 6, 8); scene.add(new THREE.HemisphereLight(0xffffff, 0x445544, 1.6), dl);
    for (const P of near.prims) {
      const m = new THREE.Mesh(P.pr.geometry, P.leafy ? P.pr.material.clone() : P.pr.material); m.position.set(-L / 2, 0, -D / 2);
      if (P.leafy) m.material.color = this.leafColour(K.sp, 0.5, new THREE.Color());
      scene.add(m);
    }
    const rt = new THREE.WebGLRenderTarget(W, Hh, { samples: 4 }), r = this.renderer, oldT = r.getRenderTarget(), oldC = r.getClearColor(new THREE.Color()), oldA = r.getClearAlpha();
    r.setRenderTarget(rt); r.setClearColor(0x000000, 0); r.clear(); r.render(scene, cam); r.setRenderTarget(oldT); r.setClearColor(oldC, oldA);
    const geo = new THREE.BufferGeometry(), Pp = [], U = [], I = [];
    for (let k = 0; k < 3; k++) {
      const a = k * Math.PI / 3, cx = Math.cos(a) * L * 0.62, cz = Math.sin(a) * L * 0.62, o = Pp.length / 3;
      Pp.push(L / 2 - cx, -H * 0.03, D / 2 - cz, L / 2 + cx, -H * 0.03, D / 2 + cz, L / 2 + cx, H * 1.03, D / 2 + cz, L / 2 - cx, H * 1.03, D / 2 - cz);
      U.push(0, 0, 1, 0, 1, 1, 0, 1); I.push(o, o + 1, o + 2, o, o + 2, o + 3);
    }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(Pp, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); geo.setIndex(I); geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ map: rt.texture, alphaTest: 0.35, side: THREE.DoubleSide, roughness: 0.9 });
    K.prims = [{ pr: { geometry: geo, material: mat }, im: null, leafy: false }];
    return K.prims;
  }
  update(x, z) {
    if (!this.ok) return;
    const R = Math.ceil(FAR / TILE), ti = Math.floor(x / TILE), tj = Math.floor(z / TILE);
    const moved = !this.at || Math.hypot(x - this.at[0], z - this.at[1]) > 30;
    if (this.queue.length && this.queueAt && Math.hypot(x - this.queueAt[0], z - this.queueAt[1]) > 120) this.queue.length = 0;   // (moved on a long way: what was wanted back there can wait)
    if (moved || this.queue.length) {
      if (!this.queue.length && moved) {
        this.queueAt = [x, z];
        for (let a = -R; a <= R; a++) for (let b = -R; b <= R; b++) {
          const k = (ti + a) + ',' + (tj + b);
          if (!this.tiles.has(k) && (a * a + b * b) * TILE * TILE <= (FAR + TILE) ** 2) this.queue.push([ti + a, tj + b, a * a + b * b]);
        }
        this.queue.sort((p, q) => q[2] - p[2]);
      }
      const t0 = performance.now();
      while (this.queue.length && performance.now() - t0 < 6) { const [a, b] = this.queue.pop(); this.tiles.set(a + ',' + b, floraTile(this.planet, a, b)); }
      const now = performance.now(); if (moved || !this.queue.length || now - (this.lastBuild || 0) > 900) { this.lastBuild = now; this.rebuild(x, z); }      // (and every second while they come in, so a forest grows in rather than appearing all at once)
    }
  }
  rebuild(x, z) {
    this.at = [x, z];
    for (const k in this.kinds) this.kinds[k].list.length = 0;
    const nearT = [];
    for (const [key, list] of this.tiles) {
      const [a, b] = key.split(',').map(Number);
      if (Math.abs((a + 0.5) * TILE - x) > FAR + TILE || Math.abs((b + 0.5) * TILE - z) > FAR + TILE) { this.tiles.delete(key); continue; }
      for (const p of list) {
        const d = Math.hypot(p.x - x, p.z - z), K = this.kinds[p.sp]; if (!K) continue;
        if (p.felled) { if (d < NEAR_TREE) K.list.push(p); continue; }
        if (SPECIES[p.sp].tree && d < NEAR_TREE) { nearT.push(p, d); continue; }
        if (!SPECIES[p.sp].tree && d < NEAR[p.sp]) K.list.push(p);
        else if (SPECIES[p.sp].tree && d < FAR && (d < 220 || p.tint < (d < 450 ? 0.6 : d < 700 ? 0.38 : 0.2))) this.kinds[p.sp + '_far'].list.push(p);
      }
    }
    // Only so many full trees: in deep forest the nearest get the real model and the rest their stand-ins
    const ord = []; for (let i = 0; i < nearT.length; i += 2) ord.push(i); ord.sort((a, b) => nearT[a + 1] - nearT[b + 1]);
    ord.forEach((i, n) => { const p = nearT[i]; (n < MAX_FULL_TREES ? this.kinds[p.sp] : this.kinds[p.sp + '_far']).list.push(p); });
    for (const k in this.kinds) this.fill(this.kinds[k]);
  }
  fill(K) {
    const n = K.list.length, [L, D, H] = K.dims;
    if (K.far && !n && !K.prims) return;
    const prims = K.far ? this.impostor(K) : K.prims;
    for (const P of prims) {
      if (!P.im || P.im.instanceMatrix.count < n) {
        if (P.im) { this.group.remove(P.im); P.im.dispose(); }
        const cap = Math.max(64, Math.ceil(n * 1.4));
        P.im = new THREE.InstancedMesh(share(P.pr.geometry), P.pr.material, cap); P.im.frustumCulled = false; P.im.castShadow = !K.far; P.im.receiveShadow = !K.far;
        if (P.leafy || K.far) P.im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
        this.group.add(P.im);
      }
    }
    K.list.forEach((p, i) => {
      const GS = this.planet.genome?.flora.shape, s = p.size / H * (GS?.h ?? 1), sx = p.size / H * (GS?.w ?? 1) * (0.85 + 0.3 * p.tint) * (K.far ? 1.2 : 1);      // (each world's trees have their own build: taller and slimmer, or squat)
      this._q.setFromAxisAngle(this.up, K.far ? 0 : p.rot);
      if (p.felled) { this._q.setFromAxisAngle(this._fx.set(Math.cos(p.felled.a), 0, -Math.sin(p.felled.a)), 1.5).multiply(this._q2.setFromAxisAngle(this.up, p.rot)); }
      this._m.compose(new THREE.Vector3(p.x, p.y - 0.05, p.z), this._q, new THREE.Vector3(sx, s, sx)).multiply(new THREE.Matrix4().makeTranslation(-L / 2, 0, -D / 2));
      if (K.far) this._c.setScalar(1.25 + 0.5 * p.tint);
      else { this.leafColour(K.sp, p.tint, this._c); if (p.sp === 'fern') this._c.multiplyScalar(0.85); if (p.sp === 'shrub') this._c.lerp(new THREE.Color(0.62, 0.55, 0.34), 0.2 * p.tint + 0.6 * (p.dry || 0)); }
      for (const P of prims) { P.im.setMatrixAt(i, this._m); if (P.leafy || K.far) P.im.setColorAt(i, this._c); }
    });
    for (const P of prims) { P.im.count = n; P.im.instanceMatrix.needsUpdate = true; if (P.im.instanceColor) P.im.instanceColor.needsUpdate = true; }
  }
}

// Grass clumps around the player: three crossed cards of blades, tinted between the
// planet's green and its dry colour, swaying a little. Rebuilt as you walk.
const GR = 40;
export class GrassView {
  constructor(planet, base = './assets/') {
    this.planet = planet;
    const g = new THREE.BufferGeometry(), P = [], U = [], I = [];
    for (let k = 0; k < 3; k++) {
      const a = k * Math.PI / 3, cx = Math.cos(a) * 0.35, cz = Math.sin(a) * 0.35, o = P.length / 3;
      P.push(-cx, 0, -cz, cx, 0, cz, cx, 0.5, cz, -cx, 0.5, -cz); U.push(0, 0, 1, 0, 1, 1, 0, 1); I.push(o, o + 1, o + 2, o, o + 2, o + 3);
    }
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); g.setIndex(I);
    g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(P.length).fill(0).map((_, i) => i % 3 === 1 ? 1 : 0), 3));   // lit like the ground
    const t = new THREE.TextureLoader().load(base + 'materials/grass_blades.png'); t.colorSpace = THREE.SRGBColorSpace;
    this.time = { value: 0 };
    const m = new THREE.MeshStandardMaterial({ map: t, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.9 });
    m.onBeforeCompile = sh => {
      sh.uniforms.uTime = this.time;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vec4 ip = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          transformed.x += sin(uTime * 1.7 + ip.x * 0.31 + ip.z * 0.17) * 0.07 * uv.y;
          transformed.z += cos(uTime * 1.3 + ip.z * 0.29) * 0.05 * uv.y;`);
    };
    this.cap = 45000;
    this.mesh = new THREE.InstancedMesh(g, m, this.cap); this.mesh.frustumCulled = false; this.mesh.receiveShadow = true; this.mesh.count = 0;
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.cap * 3), 3);
    const C = planet.climate, l = v => { const k = Math.max(...v); return new THREE.Color(v[0] / k, v[1] / k, v[2] / k); };
    this.green = l(C.grass).lerp(new THREE.Color(1, 1, 1), 0.3); this.dry = l(C.dry).lerp(new THREE.Color(1, 1, 1), 0.2);
    this.at = null; this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._c = new THREE.Color(); this.up = new THREE.Vector3(0, 1, 0);
  }
  update(x, z, dt) {
    this.time.value += dt;
    if (this.at && Math.hypot(x - this.at[0], z - this.at[1]) < 6) return;
    this.at = [x, z];
    let n = 0;
    const t0 = Math.floor((x - GR) / GTILE), t1 = Math.floor((x + GR) / GTILE), u0 = Math.floor((z - GR) / GTILE), u1 = Math.floor((z + GR) / GTILE);
    for (let ti = t0; ti <= t1; ti++) for (let tj = u0; tj <= u1; tj++) {
      const A = grassTile(this.planet, ti, tj);
      for (let i = 0; i < A.length && n < this.cap; i += 5) {
        const d = Math.hypot(A[i] - x, A[i + 2] - z); if (d > GR) continue;
        const s = A[i + 3] * Math.min(1, (GR - d) / 10);          // shrink out toward the edge instead of popping
        this._q.setFromAxisAngle(this.up, A[i] * 7.3 + A[i + 2]);
        this._m.compose(new THREE.Vector3(A[i], A[i + 1] - 0.06, A[i + 2]), this._q, new THREE.Vector3(s, s, s));
        this.mesh.setMatrixAt(n, this._m);
        this.mesh.setColorAt(n, this._c.copy(this.dry).lerp(this.green, A[i + 4]).multiplyScalar(0.75 + 0.25 * ((A[i] * 13.1) % 1)));
        n++;
      }
    }
    this.mesh.count = n; this.mesh.instanceMatrix.needsUpdate = true; this.mesh.instanceColor.needsUpdate = true;
  }
}
