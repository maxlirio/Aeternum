// A field of real grass blades around the player. Each blade is a tapering, curving strip,
// instanced in their hundreds of thousands; per blade: position, facing, height, width,
// lean and colour. The vertex shader bends them in the wind (travelling gusts) and the
// fragment darkens the roots and lights the tips. Patches (PATCH m square) are generated
// near you a few per frame from the same rules as gen/flora.js grass: green, flat, open
// ground off towns and roads. Heights come from a coarse grid per patch, interpolated.
import * as THREE from 'three';
import { surfaceAt } from '../gen/surface.js';
import { moisture } from '../gen/terrain.js';

const PATCH = 10, NEAR = 20, FAR = 60;           // m; dense blades out to NEAR, a coarser ring to FAR
const SEG = 3;                                   // segments per near blade
const DENS_NEAR = 90, DENS_FAR = 12;              // blades per m² at full lushness
const G = 5;                                     // height-sample grid per patch side
const sat = (c, k) => { const m = (c[0] + c[1] + c[2]) / 3; return c.map(v => Math.max(0, m + (v - m) * k)); };

function bladeGeometry(seg) {
  const P = [], U = [], I = [];
  for (let i = 0; i <= seg; i++) { const t = i / seg; P.push(-0.5, t, 0, 0.5, t, 0); U.push(0, t, 1, t); }
  for (let i = 0; i < seg; i++) { const a = i * 2; I.push(a, a + 1, a + 3, a, a + 3, a + 2); }
  P.push(0, 1.0, 0); U.push(0.5, 1);                          // a pointed tip
  const tip = (seg + 1) * 2; I.push(tip - 2, tip - 1, tip);
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); g.setIndex(I);
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(P.length).fill(0).map((_, i) => i % 3 === 2 ? 1 : 0), 3));
  return g;
}

export class GrassField {
  constructor(planet) {
    this.planet = planet; this.group = new THREE.Group(); this.group.name = 'grass';
    this.time = { value: 0 }; this.wind = { value: new THREE.Vector2(1, 0.3) };
    const C = planet.climate, norm = v => { const k = Math.max(...v); return [v[0] / k, v[1] / k, v[2] / k]; };
    this.green = norm(C.grass); this.dry = norm(C.dry);
    this.mat = this.material();
    this.layers = [this.layer(bladeGeometry(SEG), 200000), this.layer(bladeGeometry(1), 160000)];
    this.patches = new Map(); this.queue = []; this.at = null;
  }
  material() {
    const m = new THREE.MeshStandardMaterial({ roughness: 0.85, side: THREE.DoubleSide, vertexColors: false });
    m.onBeforeCompile = sh => {
      sh.uniforms.uTime = this.time; sh.uniforms.uWind = this.wind;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
        attribute vec4 aPos;      // x, y, z, facing
        attribute vec4 aShape;    // height, width, lean, phase
        attribute vec3 aCol;
        uniform float uTime; uniform vec2 uWind;
        varying vec3 vCol; varying float vT;`)
        .replace('#include <beginnormal_vertex>', `
          float t = uv.y; vT = t; vCol = aCol;
          float c = cos(aPos.w), s = sin(aPos.w);
          // wind: a steady lean plus gusts travelling across the field, stronger toward the tip
          float gust = sin(dot(aPos.xz, vec2(0.11, 0.07)) - uTime * 1.9) * 0.5 + 0.5;
          gust = gust * gust * (0.6 + 0.4 * sin(uTime * 0.37 + aShape.w * 6.0));
          float flutter = sin(uTime * 4.1 + aShape.w * 20.0) * 0.06;
          float bendAmt = aShape.z + (0.35 + 0.9 * gust) * length(uWind) * 0.11 + flutter;
          vec2 wdir = normalize(uWind + vec2(1e-4));
          vec3 objectNormal = normalize(vec3(s * 0.4, 0.75, c * 0.4));        // soft: lit mostly like the ground
        `)
        .replace('#include <begin_vertex>', `
          float h = aShape.x, w = aShape.y * (1.0 - t * 0.85);
          vec3 local = vec3(position.x * w, 0.0, 0.0);
          local = vec3(local.x * c, 0.0, -local.x * s);                      // the blade faces its own way
          float b = bendAmt * t * t * h;                                       // it curves over as it rises
          vec3 transformed = vec3(aPos.x + local.x + wdir.x * b + s * aShape.z * t * t * h * 0.4,
                                  aPos.y + h * t * (1.0 - 0.35 * bendAmt * t),
                                  aPos.z + local.z + wdir.y * b + c * aShape.z * t * t * h * 0.4);
        `);
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vCol; varying float vT;')
        .replace('#include <color_fragment>', `#include <color_fragment>
          diffuseColor.rgb = vCol * mix(0.18, 1.1, smoothstep(0.0, 1.0, vT));    // shaded root (the sward shades itself), sunlit tip`);
    };
    return m;
  }
  layer(geo, cap) {
    geo.setAttribute('aPos', new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4));
    geo.setAttribute('aShape', new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4));
    geo.setAttribute('aCol', new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3));
    geo.instanceCount = 0;
    const mesh = new THREE.Mesh(geo, this.mat); mesh.frustumCulled = false; mesh.receiveShadow = true;
    this.group.add(mesh);
    return { geo, cap, mesh };
  }
  // one patch's blades for one ring: Float32Array [x, y, z, facing, h, w, lean, phase, r, g, b] per blade
  patch(pi, pj, far) {
    const key = pi + ',' + pj + (far ? 'f' : 'n');
    if (this.patches.has(key)) return this.patches.get(key);
    const P = this.planet, x0 = pi * PATCH, z0 = pj * PATCH, hs = [], ls = [], os = [];
    for (let b = 0; b <= G; b++) for (let a = 0; a <= G; a++) {
      const x = x0 + a * PATCH / G, z = z0 + b * PATCH / G, s = surfaceAt(P, x, z);
      const e = 1.2, sx = surfaceAt(P, x + e, z).h - s.h, sz = surfaceAt(P, x, z + e).h - s.h, ny = e / Math.hypot(sx, e, sz);
      hs.push(s.h);
      const ok = s.town < 0.01 && s.road < 0.01 && s.h > P.seaLevel + 0.6 && s.h < P.climate.treeline + 120;
      ls.push(ok ? 0.25 + 0.75 * Math.max(0, Math.min(1, (moisture(P, x, z) - 0.12) / 0.6)) : 0);      // 0: no grass; else lushness (dry ground still has dry grass)
      os.push(ok ? Math.max(0, Math.min(1, (ny - 0.66) / 0.2)) : 0);                                 // too steep thins it out
    }
    const at = (arr, u, v) => { const fu = u * G, fv = v * G, a = Math.min(G - 1, Math.floor(fu)), b = Math.min(G - 1, Math.floor(fv)), du = fu - a, dv = fv - b, k = b * (G + 1) + a;
      return arr[k] * (1 - du) * (1 - dv) + arr[k + 1] * du * (1 - dv) + arr[k + G + 1] * (1 - du) * dv + arr[k + G + 2] * du * dv; };
    const n = Math.round(PATCH * PATCH * (far ? DENS_FAR : DENS_NEAR)), out = new Float32Array(n * 11);
    let seed = (Math.imul(pi, 73856093) ^ Math.imul(pj, 19349663) ^ (far ? 0x55 : 0)) >>> 0, k = 0;
    const rnd = () => { seed = (Math.imul(seed ^ (seed >>> 15), 2246822519) + 0x9e3779b9) >>> 0; seed ^= seed >>> 13; return (seed >>> 0) / 4294967296; };
    for (let i = 0; i < n; i++) {
      const u = rnd(), v = rnd(), lush = at(ls, u, v), cover = at(os, u, v), keep = rnd();
      if (lush <= 0.01 || keep > cover * (0.55 + 0.6 * lush)) continue;
      const clump = 0.6 + 0.4 * Math.sin((x0 + u * PATCH) * 0.9) * Math.sin((z0 + v * PATCH) * 0.7);   // grass grows in tussocks
      const h = (0.18 + 0.45 * rnd() * rnd() + 0.3 * lush * clump) * (far ? 0.9 : 1);
      const dry = Math.max(0, 0.75 - lush) * 1.1 + 0.2 * rnd() * rnd(), shade = 0.7 + 0.4 * rnd();
      out.set([x0 + u * PATCH, at(hs, u, v) - 0.02, z0 + v * PATCH, rnd() * Math.PI * 2, h, (far ? 0.07 : 0.028) * (0.7 + 0.6 * rnd()), 0.15 + 0.5 * rnd(), rnd(),
        ...sat([this.green[0] * (1 - dry) + this.dry[0] * dry, this.green[1] * (1 - dry) + this.dry[1] * dry, this.green[2] * (1 - dry) + this.dry[2] * dry], 1.35).map(c => c * shade * 0.24)], k * 11);
      k++;
    }
    const res = out.subarray(0, k * 11);
    this.patches.set(key, res);
    if (this.patches.size > 900) this.patches.delete(this.patches.keys().next().value);
    return res;
  }
  update(x, z, dt, wind) {
    this.time.value += dt;
    if (wind) this.wind.value.set(wind[0], wind[1]);
    const moved = !this.at || Math.hypot(x - this.at[0], z - this.at[1]) > 3;
    if (!moved) return;
    // generate missing patches nearest first, within a frame budget; then rebuild the buffers
    const R = Math.ceil(FAR / PATCH) + 1, ci = Math.floor(x / PATCH), cj = Math.floor(z / PATCH), need = [];
    for (let a = -R; a <= R; a++) for (let b = -R; b <= R; b++) {
      const cx = (ci + a + 0.5) * PATCH, cz = (cj + b + 0.5) * PATCH, d = Math.hypot(cx - x, cz - z);
      if (d > FAR + PATCH) continue;
      need.push([ci + a, cj + b, d < NEAR + PATCH * 0.7, d]);
    }
    need.sort((p, q) => p[3] - q[3]);
    const t0 = performance.now(); let missing = false;
    for (const [i, j, near] of need) {
      if (!this.patches.has(i + ',' + j + (near ? 'n' : 'f'))) { if (performance.now() - t0 > 8) { missing = true; continue; } this.patch(i, j, !near); }
    }
    const fill = (L, list) => {
      const A = L.geo.attributes, pos = A.aPos.array, shp = A.aShape.array, col = A.aCol.array; let n = 0;
      for (const arr of list) for (let o = 0; o < arr.length && n < L.cap; o += 11) {
        pos[n * 4] = arr[o]; pos[n * 4 + 1] = arr[o + 1]; pos[n * 4 + 2] = arr[o + 2]; pos[n * 4 + 3] = arr[o + 3];
        shp[n * 4] = arr[o + 4]; shp[n * 4 + 1] = arr[o + 5]; shp[n * 4 + 2] = arr[o + 6]; shp[n * 4 + 3] = arr[o + 7];
        col[n * 3] = arr[o + 8]; col[n * 3 + 1] = arr[o + 9]; col[n * 3 + 2] = arr[o + 10]; n++;
      }
      L.geo.instanceCount = n; A.aPos.needsUpdate = A.aShape.needsUpdate = A.aCol.needsUpdate = true;
    };
    fill(this.layers[0], need.filter(q => q[2]).map(([i, j]) => this.patches.get(i + ',' + j + 'n')).filter(Boolean));
    fill(this.layers[1], need.filter(q => !q[2]).map(([i, j]) => this.patches.get(i + ',' + j + 'f')).filter(Boolean));
    this.at = missing ? null : [x, z];
  }
}
