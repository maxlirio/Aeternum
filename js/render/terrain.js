// Quadtree terrain streaming. Tiles near the player are fine (64 m, 2 m spacing),
// doubling in size with distance out to the horizon. Tiles build within a per-frame
// time budget, nearest first; a stale tile is only removed once every tile replacing
// it is ready, so the ground never has holes.
import * as THREE from 'three';
import { CHUNK, MAX_LOD } from '../core/units.js';
import { chunkData } from '../gen/chunk.js';
import { texture } from './textures.js';
import { groundTextures } from './materials.js';
import { prevailing } from '../gen/land.js';

const VIEW = 16000, SPLIT = 1.7;

export const terrainWind = { value: new THREE.Vector2(0, 0) };   // today's wind (main.js)
// the ground's dents around the player (render/prints.js): a height map, c its centre, s its width in metres
export const terrainMarks = { tex: { value: null }, c: { value: new THREE.Vector2() }, s: { value: 40 } };
export const terrainTime = { value: 0 };    // advanced by main.js (shoreline wash)
function terrainMaterial(planet) {
  // The ground surfaces (grass, sand, cracked salt, ash, rocks...) as detail over the land's own colour
  // (vertex colours from gen/chunk.js): each is divided by its mean albedo, so a red-grass world keeps red
  // grass. Weights per vertex say how much of each lies there. Soft ground is laid from above; rock is
  // projected from three sides, so a cliff doesn't smear.
  const T = groundTextures();
  if (!T) return proceduralTerrainMaterial();
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
  m.normalScale.set(0.8, 0.8);
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, { tG: { value: T.map }, tGN: { value: T.normal }, uMean: { value: T.means }, uTile: { value: T.tiles }, uSea: { value: planet.seaLevel }, uTime: terrainTime, uWind: terrainWind, tMark: terrainMarks.tex, uMarkC: terrainMarks.c, uMarkS: terrainMarks.s, uPrev: { value: new THREE.Vector2(Math.cos(prevailing(planet)), Math.sin(prevailing(planet))) }, uCanopy: { value: new THREE.Vector3(...planet.climate.grass).multiplyScalar(0.62) } });
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
      attribute vec4 aS0; attribute vec4 aS1; attribute vec4 aS2; attribute vec4 aR;
      varying vec3 vWP; varying vec3 vWN; varying vec4 vS0; varying vec4 vS1; varying vec4 vS2; varying vec4 vR;`)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWP = vec3(uv.x, position.y, uv.y); vWN = normal; vS0 = aS0; vS1 = aS1; vS2 = aS2; vR = aR;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      uniform mat3 normalMatrix; uniform sampler2DArray tG; uniform sampler2DArray tGN; uniform vec3 uMean[16]; uniform float uTile[16]; uniform float uSea; uniform float uTime; uniform vec2 uWind; uniform sampler2D tMark; uniform vec2 uMarkC; uniform float uMarkS; float markH(vec2 p) { vec2 q = (p - uMarkC) / uMarkS + 0.5; if (q.x <= 0.0 || q.y <= 0.0 || q.x >= 1.0 || q.y >= 1.0) return 0.0; return (texture2D(tMark, q).r - 0.5) * 2.0; }  uniform vec2 uPrev; uniform vec3 uCanopy;
      varying vec3 vWP; varying vec3 vWN; varying vec4 vS0; varying vec4 vS1; varying vec4 vS2; varying vec4 vR;`)
      .replace('#include <normal_fragment_maps>', '')
      .replace('#include <normalmap_pars_fragment>', 'uniform vec2 normalScale;')
      .replace('#include <map_fragment>', `
      vec3 wn = normalize(vWN);
      float W[16] = float[16](vS0.x, vS0.y, vS0.z, vS0.w, vS1.x, vS1.y, vS1.z, vS1.w, vS2.x, vS2.y, vS2.z, vS2.w, vR.x, vR.y, vR.z, vR.w);
      float rockW = vS2.w + vR.x + vR.y + vR.z + vR.w;
      vec2 top = vWP.xz;
      // Pressed ground. Look down into the dent along the line of sight, so its near wall hides what's behind it and the sand inside sits lower
      float markD = 0.0; vec3 markN = vec3(0.0, 1.0, 0.0);
      if (vViewPosition.z < 30.0) {
        vec3 Vw = normalize(transpose(mat3(viewMatrix)) * vViewPosition); vec2 stepUv = Vw.xz / max(Vw.y, 0.28) * 0.07 / 7.0; vec2 pm = top; float rayH = 1.0;
        for (int i = 0; i < 7; i++) { float hh = markH(pm) * 0.5 + 0.5; if (hh >= rayH) break; pm -= stepUv; rayH -= 1.0 / 7.0; }
        float fadeM = 1.0 - smoothstep(16.0, 30.0, vViewPosition.z); top = mix(top, pm, fadeM);
        const float eM = 0.035; float hL = markH(top - vec2(eM, 0.0)), hR = markH(top + vec2(eM, 0.0)), hD = markH(top - vec2(0.0, eM)), hU = markH(top + vec2(0.0, eM)); markD = markH(top);
        markN = normalize(vec3((hL - hR) * 0.07 / (2.0 * eM), 1.0, (hD - hU) * 0.07 / (2.0 * eM)));
      }
      vec2 dTx = dFdx(vWP.xz), dTy = dFdy(vWP.xz), sd = vWP.zy, dSx = dFdx(sd), dSy = dFdy(sd), fr = vWP.xy, dFx = dFdx(fr), dFy = dFdy(fr);
      vec3 bw = pow(abs(wn), vec3(4.0)); bw /= (bw.x + bw.y + bw.z);
      vec3 detail = vec3(0.0), nAcc = vec3(0.0);
      float near = clamp(1.0 - vViewPosition.z / 300.0, 0.0, 1.0);
      for (int i = 0; i < 16; i++) {
        float w = W[i]; if (w < 0.012) continue;
        float t = uTile[i], fi = float(i);
        if (i < 11) {     // laid from above, a coarser pass breaking up the tiling
          float t2 = t * 9.7;
          vec2 p = top, px = dTx, py = dTy;
          if (i == 3) {   // sand: ripples lie square across the prevailing wind
            mat2 Rw = mat2(uPrev.y, uPrev.x, -uPrev.x, uPrev.y); p = Rw * top; px = Rw * dTx; py = Rw * dTy;
          }
          vec3 a = textureGrad(tG, vec3(p / t, fi), px / t, py / t).rgb, b = textureGrad(tG, vec3(p / t2 + 0.37, fi), px / t2, py / t2).rgb;
          vec3 lay = (a * 0.6 + b * 0.4) / uMean[i], layN = near > 0.0 ? textureGrad(tGN, vec3(p / t, fi), px / t, py / t).xyz : vec3(0.5, 0.5, 1.0);
          if (i == 3) {   // a slip face has just avalanched: smooth, no ripples on it
            float slip = 1.0 - smoothstep(0.85, 0.93, wn.y); lay = mix(lay, vec3(1.0), slip); layN = mix(layN, vec3(0.5, 0.5, 1.0), slip);
          }
          detail += w * lay;
          if (near > 0.0) nAcc += w * layN;
        } else {          // rock, from three sides at two scales
          float t2 = t * 3.6;
          vec3 c = vec3(0.0);
          float kf = clamp(1.0 - vViewPosition.z / 220.0, 0.12, 1.0), kc = 2.0 - kf;
          if (bw.x > 0.02) c += bw.x * (kf * textureGrad(tG, vec3(sd / t, fi), dSx / t, dSy / t).rgb + kc * textureGrad(tG, vec3(sd / t2 + 0.3, fi), dSx / t2, dSy / t2).rgb);
          if (bw.y > 0.02) c += bw.y * (kf * textureGrad(tG, vec3(top / t, fi), dTx / t, dTy / t).rgb + kc * textureGrad(tG, vec3(top / t2 + 0.3, fi), dTx / t2, dTy / t2).rgb);
          if (bw.z > 0.02) c += bw.z * (kf * textureGrad(tG, vec3(fr / t, fi), dFx / t, dFy / t).rgb + kc * textureGrad(tG, vec3(fr / t2 + 0.3, fi), dFx / t2, dFy / t2).rgb);
          // (further off, lean on the coarse pass: the fine one starts to show its tile)
          detail += w * c * 0.5 / uMean[i];
          if (near > 0.0) { vec3 q = bw.y > 0.5 ? vec3(top / t, fi) : (bw.x > bw.z ? vec3(sd / t, fi) : vec3(fr / t, fi)); vec2 qx = bw.y > 0.5 ? dTx : (bw.x > bw.z ? dSx : dFx), qy = bw.y > 0.5 ? dTy : (bw.x > bw.z ? dSy : dFy); nAcc += w * textureGrad(tGN, q, qx / t, qy / t).xyz; }
        }
      }
      float fade = clamp(1.0 - vViewPosition.z / 1500.0, 0.0, 1.0);
      detail *= 1.0 - 0.4 * clamp(-markD, 0.0, 1.0);        // (little sky reaches the bottom of a hollow)
      diffuseColor.rgb *= 0.55 * mix(vec3(1.0), clamp(detail, 0.0, 3.0), 0.85 * fade);   // real ground is dark: grass and soil reflect 10–25%
      // sandstone shows its beds from a long way off: pale and red bands that wander a little with the land
      if (W[12] > 0.01) {
        float tilt = vWP.x * 0.018 + vWP.z * 0.011, y = vWP.y + 2.5 * sin(tilt) + 5.0 * sin(vWP.x * 0.0031 - vWP.z * 0.0043);
        float thick = sin(y * 0.083 + 1.7 * sin(y * 0.021)), thin = sin(y * 0.47 + 2.3 * sin(y * 0.11)), fine = sin(y * 1.9 + 3.1 * sin(y * 0.37));
        float b = 0.5 + 0.34 * smoothstep(-0.35, 0.35, thick) - 0.17 + 0.2 * thin * smoothstep(-0.8, 0.8, thick) + 0.07 * fine;   // thick beds, thin ones among them
        vec3 bed = mix(vec3(0.62, 0.52, 0.5), vec3(1.42, 1.34, 1.2), clamp(b, 0.0, 1.0));
        diffuseColor.rgb *= mix(vec3(1.0), bed, W[12]);
      }
      // a forest from a distance is its canopy, not its floor
      if (W[2] > 0.01) diffuseColor.rgb = mix(diffuseColor.rgb, uCanopy * (0.75 + 0.5 * detail.g * 0.5), W[2] * smoothstep(70.0, 230.0, vViewPosition.z));
      // when it blows, sand runs over the ground in long streaks
      if (W[3] > 0.02) { float ws = length(uWind), run = smoothstep(4.0, 11.0, ws); if (run > 0.0 && vViewPosition.z < 260.0) { vec2 wd = uWind / max(ws, 0.1), wp = vec2(dot(top, wd), dot(top, vec2(-wd.y, wd.x))); float st = textureGrad(tG, vec3(vec2(wp.x * 0.018 - uTime * ws * 0.045, wp.y * 0.22), 3.0), dTx * 0.1, dTy * 0.1).r / uMean[3].r; st *= textureGrad(tG, vec3(vec2(wp.x * 0.041 - uTime * ws * 0.07, wp.y * 0.09), 3.0), dTx * 0.1, dTy * 0.1).r / uMean[3].r; diffuseColor.rgb *= 1.0 + W[3] * run * smoothstep(1.15, 1.9, st) * 0.45 * clamp(1.0 - vViewPosition.z / 260.0, 0.0, 1.0); } }
      // where grass grows the ground reads as the sward seen from afar: darker, a touch more saturated
      float sward = (W[0] + 0.7 * W[5]) * smoothstep(0.6, 2.0, vWP.y - uSea);
      vec3 swardCol = diffuseColor.rgb * vec3(0.62, 0.66, 0.5);
      diffuseColor.rgb = mix(diffuseColor.rgb, swardCol, sward * 0.85);
      // the shoreline: ground darkens as it gets wet near the water, and a line of foam washes up and back
      float above = vWP.y - uSea;
      diffuseColor.rgb *= 1.0 - 0.45 * (1.0 - smoothstep(-0.2, 1.4, above));
      // under water: light is absorbed on the way down and back — red first, the bed turns dark blue-green with depth
      float uw = max(0.0, -above);
      diffuseColor.rgb *= exp(-uw * vec3(0.9, 0.38, 0.3));
      float wash = 0.35 + 0.25 * sin(uTime * 0.7 + vWP.x * 0.05 + vWP.z * 0.04);
      float foam = smoothstep(0.18, 0.0, abs(above - wash + 0.15)) * smoothstep(0.35, 0.75, textureGrad(tG, vec3(vWP.xz / 1.7 + uTime * 0.01, 1.0), dTx / 1.7, dTy / 1.7).r * 1.6);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.92, 0.95, 0.96), foam * 0.85);
      `)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      // peat holds water: its dark hollows shine. Salt and snow are a little smoother than soil.
      if (W[6] > 0.02) { float dk = 1.0 - smoothstep(0.18, 0.42, textureGrad(tG, vec3(top / uTile[6], 6.0), dTx / uTile[6], dTy / uTile[6]).r / uMean[6].r); roughnessFactor = mix(roughnessFactor, mix(0.92, 0.1, dk), W[6]); }
      roughnessFactor = mix(roughnessFactor, 0.72, W[10] + 0.4 * W[4]);`)
      .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
      if (near > 0.0) {   // tangent frame from the world: x along east, z along south, y the surface's own normal
        vec3 mapN = nAcc * 2.0 - 1.0; mapN.xy *= normalScale * near;
        vec3 wm = normalize(wn + vec3(markN.x, 0.0, markN.z));     // the dent's own walls, lit by the same sun
        vec3 Tn = normalize(cross(vec3(0.0, 0.0, 1.0), wm) + vec3(1e-4, 0.0, 0.0)), Bn = normalize(cross(wm, Tn));
        normal = normalize(normalMatrix * (Tn * mapN.x + Bn * mapN.y + wm * max(mapN.z, 0.05)));
      }`);
  };
  return m;
}

function proceduralTerrainMaterial() {
  const t = texture('ground');
  const map = t.map.clone(); map.repeat.set(1 / 6, 1 / 6); map.needsUpdate = true;
  const nmap = t.normalMap.clone(); nmap.repeat.set(1 / 6, 1 / 6); nmap.needsUpdate = true;
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, map, normalMap: nmap, roughness: 0.96, metalness: 0 });
  m.normalScale.set(0.6, 0.6);
  m.onBeforeCompile = sh => {
    // Albedo detail at two scales, normalised so it modulates rather than darkens,
    // faded out with distance to avoid tiling shimmer.
    sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `
      vec4 d1 = texture2D(map, vMapUv);
      vec4 d2 = texture2D(map, vMapUv * 0.073 + 0.31);
      float fade = clamp(1.0 - vViewPosition.z / 400.0, 0.0, 1.0);
      float detail = mix(1.0, (d1.r * 1.25 + 0.35) * (d2.r * 0.9 + 0.55), 0.85);
      diffuseColor.rgb *= mix(d2.r * 0.8 + 0.6, detail, fade);
    `);
  };
  return m;
}

export class TerrainStreamer {
  constructor(planet, parent) {
    this.planet = planet; this.parent = parent;
    this.material = terrainMaterial(planet);
    this.tiles = new Map();          // key -> { mesh, lod, i, j }
    this.desired = new Set();
    this.queue = [];
    this.lastSplit = null;
  }
  key(l, i, j) { return l + ':' + i + ':' + j; }

  // Recompute the wanted leaf set around (px, pz).
  plan(px, pz) {
    const want = new Set(), queue = [];
    const S = CHUNK * 2 ** MAX_LOD;
    const visit = (l, i, j) => {
      const size = CHUNK * 2 ** l, x0 = i * size, z0 = j * size;
      const dx = Math.max(x0 - px, 0, px - (x0 + size)), dz = Math.max(z0 - pz, 0, pz - (z0 + size));
      const dist = Math.hypot(dx, dz);
      if (dist > VIEW) return;
      if (l > 0 && dist < size * SPLIT) { for (const [a, b] of [[0, 0], [1, 0], [0, 1], [1, 1]]) visit(l - 1, i * 2 + a, j * 2 + b); return; }
      const k = this.key(l, i, j);
      want.add(k);
      if (!this.tiles.has(k)) queue.push({ k, l, i, j, dist });
    };
    const r0 = Math.floor((px - VIEW) / S), r1 = Math.floor((px + VIEW) / S), c0 = Math.floor((pz - VIEW) / S), c1 = Math.floor((pz + VIEW) / S);
    for (let i = r0; i <= r1; i++) for (let j = c0; j <= c1; j++) visit(MAX_LOD, i, j);
    queue.sort((a, b) => a.dist - b.dist || a.l - b.l);
    this.desired = want; this.queue = queue;
  }

  update(px, pz, budgetMs = 6) {
    const cell = Math.floor(px / 32) + ',' + Math.floor(pz / 32);
    if (cell !== this.lastSplit) { this.plan(px, pz); this.lastSplit = cell; }
    const t0 = performance.now();
    while (this.queue.length && performance.now() - t0 < budgetMs) {
      const q = this.queue.shift();
      if (this.tiles.has(q.k) || !this.desired.has(q.k)) continue;
      this.tiles.set(q.k, { mesh: this.buildTile(q.l, q.i, q.j), lod: q.l, i: q.i, j: q.j });
    }
    // retire stale tiles whose area is fully covered by ready desired tiles
    for (const [k, t] of this.tiles) {
      if (this.desired.has(k)) continue;
      if (this.covered(t)) { this.parent.remove(t.mesh); t.mesh.geometry.dispose(); this.tiles.delete(k); }
    }
  }
  covered(t) {
    for (const k of this.desired) {
      if (this.tiles.has(k)) continue;
      const [l, i, j] = k.split(':').map(Number);
      const s1 = CHUNK * 2 ** l, s0 = CHUNK * 2 ** t.lod;
      const ax = i * s1, az = j * s1, bx = t.i * s0, bz = t.j * s0;
      if (ax < bx + s0 && ax + s1 > bx && az < bz + s0 && az + s1 > bz) return false;
    }
    return true;
  }
  buildTile(l, i, j) {
    const d = chunkData(this.planet, l, i, j);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(d.pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(d.nrm, 3));
    g.setAttribute('color', new THREE.BufferAttribute(d.col, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(d.uv, 2));
    g.setIndex(new THREE.BufferAttribute(d.idx, 1));
    const ib = new THREE.InterleavedBuffer(d.ground, 16);
    g.setAttribute('aS0', new THREE.InterleavedBufferAttribute(ib, 4, 0, true)); g.setAttribute('aS1', new THREE.InterleavedBufferAttribute(ib, 4, 4, true)); g.setAttribute('aS2', new THREE.InterleavedBufferAttribute(ib, 4, 8, true)); g.setAttribute('aR', new THREE.InterleavedBufferAttribute(ib, 4, 12, true));
    g.boundingBox = new THREE.Box3(new THREE.Vector3(0, d.minH - 40, 0), new THREE.Vector3(d.size, d.maxH, d.size));
    g.boundingSphere = g.boundingBox.getBoundingSphere(new THREE.Sphere());
    const mesh = new THREE.Mesh(g, this.material);
    mesh.position.set(d.x0, 0, d.z0);
    mesh.receiveShadow = true; mesh.castShadow = l <= 1;
    mesh.matrixAutoUpdate = false; mesh.updateMatrix();
    this.parent.add(mesh);
    return mesh;
  }
  get pending() { return this.queue.length; }
  get count() { return this.tiles.size; }
}
