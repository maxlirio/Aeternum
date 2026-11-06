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

const VIEW = 16000, SPLIT = 2.2;
// One seamless sheet of natural noise (r: soft, g: sharp crests, b: soft and unrelated), read at many sizes and angles so nothing lines up.
let noiseTex = null, noiseSlopes = null;
const NOISE_SLOPE = 40;
function terrainNoise() {
  if (noiseTex) return noiseTex;
  const N = 512, data = new Uint8Array(N * N * 4), lat = (cells, seed) => { const g = new Float32Array(cells * cells); let h = seed >>> 0; for (let i = 0; i < g.length; i++) { h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) + 0x6b43a9b5 | 0; g[i] = ((h ^ (h >>> 13)) >>> 0) / 4294967296; } return g; };
  const octave = (cells, seed) => { const g = lat(cells, seed), out = new Float32Array(N * N); for (let y = 0; y < N; y++) { const v = y / N * cells, j = Math.floor(v), fy = v - j, sy = fy * fy * fy * (fy * (fy * 6 - 15) + 10); for (let x = 0; x < N; x++) { const u = x / N * cells, i = Math.floor(u), fx = u - i, sx = fx * fx * fx * (fx * (fx * 6 - 15) + 10), a = g[j % cells * cells + i % cells], b = g[j % cells * cells + (i + 1) % cells], c = g[(j + 1) % cells * cells + i % cells], d = g[(j + 1) % cells * cells + (i + 1) % cells]; out[y * N + x] = a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy; } } return out; };
  const stack = (seed, ridged) => { const out = new Float32Array(N * N); let amp = 1, tot = 0; for (let o = 0; o < 6; o++) { const q = octave(8 << o, seed + o * 7919); for (let k = 0; k < out.length; k++) out[k] += amp * (ridged ? 1 - Math.abs(2 * q[k] - 1) : q[k]); tot += amp; amp *= 0.55; } let lo = 1e9, hi = -1e9; for (let k = 0; k < out.length; k++) { if (out[k] < lo) lo = out[k]; if (out[k] > hi) hi = out[k]; } for (let k = 0; k < out.length; k++) out[k] = (out[k] - lo) / (hi - lo); return out; };
  const R = stack(11, false), G = stack(211, true), Bl = stack(417, false);
  for (let k = 0; k < N * N; k++) { data[k * 4] = R[k] * 255; data[k * 4 + 1] = G[k] * 255; data[k * 4 + 2] = Bl[k] * 255; data[k * 4 + 3] = 255; }
  const sheet = d => { const T = new THREE.DataTexture(d, N, N); T.wrapS = T.wrapT = THREE.RepeatWrapping; T.magFilter = THREE.LinearFilter; T.minFilter = THREE.LinearMipmapLinearFilter; T.generateMipmaps = true; T.anisotropy = 8; T.needsUpdate = true; return T; };
  // the slopes of the crested noise, per sheet width: lighting reads these directly, so the land's small shape doesn't depend on the mesh's triangles
  const slopes = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const k = y * N + x, dx = (G[y * N + (x + 1) % N] - G[y * N + (x + N - 1) % N]) * N / 2, dy = (G[(y + 1) % N * N + x] - G[(y + N - 1) % N * N + x]) * N / 2; slopes[k * 4] = Math.max(0, Math.min(255, 127.5 + dx / NOISE_SLOPE * 127.5)); slopes[k * 4 + 1] = Math.max(0, Math.min(255, 127.5 + dy / NOISE_SLOPE * 127.5)); slopes[k * 4 + 3] = 255; }
  noiseSlopes = sheet(slopes);
  return noiseTex = sheet(data);
}

export const terrainWind = { value: new THREE.Vector2(0, 0) };   // today's wind (main.js)
// the ground's dents around the player (render/prints.js): a height map, c its centre, s its width in metres
export const terrainMarks = { tex: { value: null }, c: { value: new THREE.Vector2() }, s: { value: 40 }, on: { value: 0 } };
export const terrainFar = { value: new THREE.Vector3(0, 1, 0) };   // (fade from, fade to, height of the eye above the land: 0 near the ground, no fade)
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
    Object.assign(sh.uniforms, { tG: { value: T.map }, tGN: { value: T.normal }, uMean: { value: T.means }, uTile: { value: T.tiles }, uSea: { value: planet.seaLevel }, uTime: terrainTime, uWind: terrainWind, tMark: terrainMarks.tex, uMarkOn: terrainMarks.on, uMarkC: terrainMarks.c, uMarkS: terrainMarks.s, uFar: terrainFar, tNoise: { value: terrainNoise() }, tSlopes: { value: noiseSlopes }, uPrev: { value: new THREE.Vector2(Math.cos(prevailing(planet)), Math.sin(prevailing(planet))) }, uCanopy: { value: new THREE.Vector3(...planet.climate.grass).multiplyScalar(0.62) } });
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
      attribute vec4 aS0; attribute vec4 aS1; attribute vec4 aS2; attribute vec4 aR; attribute vec3 aRock; varying vec3 vRock;
      varying vec3 vWP; varying vec3 vWN; varying vec4 vS0; varying vec4 vS1; varying vec4 vS2; varying vec4 vR;`)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRock = aRock; vWP = vec3(uv.x, position.y, uv.y); vWN = normal; vS0 = aS0; vS1 = aS1; vS2 = aS2; vR = aR;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vRock; uniform sampler2D tNoise; uniform sampler2D tSlopes; uniform vec3 uFar; uniform mat3 normalMatrix; uniform sampler2DArray tG; uniform sampler2DArray tGN; uniform vec3 uMean[16]; uniform float uTile[16]; uniform float uSea; uniform float uTime; uniform vec2 uWind; uniform float uMarkOn; uniform sampler2D tMark; uniform vec2 uMarkC; uniform float uMarkS; float markH(vec2 p) { vec2 q = (p - uMarkC) / uMarkS + 0.5; if (q.x <= 0.0 || q.y <= 0.0 || q.x >= 1.0 || q.y >= 1.0) return 0.0; return (texture2D(tMark, q).r - 0.5) * 2.0; }  uniform vec2 uPrev; uniform vec3 uCanopy;
      varying vec3 vWP; varying vec3 vWN; varying vec4 vS0; varying vec4 vS1; varying vec4 vS2; varying vec4 vR;
      // a tile without its repeat: which of eight shifted copies you see drifts across the ground, so no two stretches of it line up
      vec3 hash33(vec3 p) { p = fract(p * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yxz + 33.33); return fract((p.xxy + p.yxx) * p.zyx); }
      // Rock breaks along planes: long bedding seams, and joints across each bed at uneven spacing, some of them not running through. Not cells.
      // → x: metres to the nearest break, y: 0 if that's a bed seam 1 if a joint, z: which side of it, w: unused. id: which block.
      vec3 rockBreaks(vec2 q, float H, out vec3 id) { float tv = q.y / H, iv = floor(tv), fv = tv - iv; vec3 hr = hash33(vec3(iv, H * 3.1, 11.0)); float L = H * (1.5 + 3.4 * hr.x), tu = q.x / L + hr.y * 9.0, iu = floor(tu), fu = tu - iu; float dv = min(fv, 1.0 - fv) * H, du = min(fu, 1.0 - fu) * L, side = fu < 0.5 ? iu : iu + 1.0; if (hash33(vec3(iv, side, H)).x < 0.38) du = 9.0; id = vec3(iv, du > 8.0 ? side : iu, H); bool bed = dv < du; return vec3(min(dv, du), bed ? 0.0 : 1.0, bed ? (fv < 0.5 ? -1.0 : 1.0) : (fu < 0.5 ? -1.0 : 1.0)); }
      vec3 anyTile(float layer, vec2 uv, vec2 dx, vec2 dy) {
        float l = texture2D(tNoise, uv * 0.019).b * 16.0, ia = floor(l), f = l - ia;
        vec2 oa = sin(vec2(3.0, 7.0) * ia), ob = sin(vec2(3.0, 7.0) * (ia + 1.0));
        vec3 a = textureGrad(tG, vec3(uv + oa, layer), dx, dy).rgb, b = textureGrad(tG, vec3(uv + ob, layer), dx, dy).rgb;
        return mix(a, b, smoothstep(0.25, 0.75, f - 0.15 * (a.g + a.r - b.g - b.r)));
      }`)
      .replace('#include <normal_fragment_maps>', '')
      .replace('#include <normalmap_pars_fragment>', 'uniform vec2 normalScale;')
      .replace('#include <map_fragment>', `
      // from high up the streamed land dissolves into the planet's picture underneath, not stopping at a hard edge
      if (uFar.z > 0.0) { float hd = sqrt(max(dot(vViewPosition, vViewPosition) - uFar.z * uFar.z, 0.0)); diffuseColor.a *= 1.0 - smoothstep(uFar.x, uFar.y, hd); if (diffuseColor.a < 0.004) discard; }
      vec3 wn = normalize(vWN);
      float W[16] = float[16](vS0.x, vS0.y, vS0.z, vS0.w, vS1.x, vS1.y, vS1.z, vS1.w, vS2.x, vS2.y, vS2.z, vS2.w, vR.x, vR.y, vR.z, vR.w);
      float rockW = vS2.w + vR.x + vR.y + vR.z + vR.w;
      vec2 top = vWP.xz;
      // Pressed ground. Look down into the dent along the line of sight, so its near wall hides what's behind it and the sand inside sits lower
      float markD = 0.0; vec3 markN = vec3(0.0, 1.0, 0.0);
      if (uMarkOn > 0.5 && vViewPosition.z < 30.0 && W[3] + W[10] + W[6] + W[7] > 0.05) {
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
      // A photo of a metre of rock says nothing about a mountain: it's gone by here, and what the land itself is made of takes over (below).
      float fade = 1.0 - smoothstep(70.0, 520.0, vViewPosition.z);
      for (int i = 0; i < 16; i++) {
        float w = W[i]; if (w < 0.012) continue;
        if (fade <= 0.0) { detail += w; continue; }
        float t = uTile[i], fi = float(i);
        if (i < 11) {     // laid from above, a coarser pass breaking up the tiling
          float t2 = t * 9.7;
          vec2 p = top, px = dTx, py = dTy;
          if (i == 3) {   // sand: ripples lie square across the prevailing wind
            mat2 Rw = mat2(uPrev.y, uPrev.x, -uPrev.x, uPrev.y); p = Rw * top; px = Rw * dTx; py = Rw * dTy;
          }
          vec3 a = anyTile(fi, p / t, px / t, py / t), b = textureGrad(tG, vec3(p / t2 + 0.37, fi), px / t2, py / t2).rgb;
          vec3 lay = (a * 0.6 + b * 0.4) / uMean[i], layN = near > 0.0 ? textureGrad(tGN, vec3(p / t, fi), px / t, py / t).xyz : vec3(0.5, 0.5, 1.0);
          if (i == 3) {   // a slip face has just avalanched: smooth, no ripples on it
            float slip = 1.0 - smoothstep(0.85, 0.93, wn.y); lay = mix(lay, vec3(1.0), slip); layN = mix(layN, vec3(0.5, 0.5, 1.0), slip);
          }
          detail += w * lay;
          if (near > 0.0) nAcc += w * layN;
        } else {          // rock: only its grain comes from the tile, read small; the fractures are drawn below
          vec3 c = vec3(0.0); t *= 0.7;
          if (bw.x > 0.02) c += bw.x * anyTile(fi, sd / t, dSx / t, dSy / t);
          if (bw.y > 0.02) c += bw.y * anyTile(fi, top / t, dTx / t, dTy / t);
          if (bw.z > 0.02) c += bw.z * anyTile(fi, fr / t, dFx / t, dFy / t);
          detail += w * mix(vec3(1.0), c / uMean[i], 0.38 * (1.0 - smoothstep(10.0, 110.0, vViewPosition.z)));
          if (near > 0.0) { vec3 q = bw.y > 0.5 ? vec3(top / t, fi) : (bw.x > bw.z ? vec3(sd / t, fi) : vec3(fr / t, fi)); vec2 qx = bw.y > 0.5 ? dTx : (bw.x > bw.z ? dSx : dFx), qy = bw.y > 0.5 ? dTy : (bw.x > bw.z ? dSy : dFy); nAcc += w * mix(vec3(0.5, 0.5, 1.0), textureGrad(tGN, q * vec3(0.37, 0.37, 1.0), qx * 0.8 / t, qy * 0.8 / t).xyz, 0.22); }   // (kept weak and soft: at a low sun a strong one sparkles)
        }
      }
      detail *= 1.0 - 0.4 * clamp(-markD, 0.0, 1.0);        // (little sky reaches the bottom of a hollow)
      diffuseColor.rgb *= 0.55 * mix(vec3(1.0), clamp(detail, 0.0, 3.0), 0.85 * fade);   // real ground is dark: grass and soil reflect 10–25%
      // What the land is made of, at every size a tile can't reach. Sheared through height so a cliff doesn't smear; turned at each size so nothing lines up.
      vec2 sh = top + vWP.y * vec2(0.62, -0.41);
      mat2 R1 = mat2(0.8, 0.6, -0.6, 0.8), R2 = mat2(0.28, 0.96, -0.96, 0.28);
      float m0 = texture2D(tNoise, R1 * sh / 9700.0).r, m1 = texture2D(tNoise, R2 * sh / 2300.0).b, m2 = texture2D(tNoise, sh / 610.0).r, m3 = texture2D(tNoise, R1 * sh / 157.0).g, m4 = texture2D(tNoise, R2 * sh / 41.0).r;
      float macro = m0 * 0.3 + m1 * 0.27 + m2 * 0.2 + m3 * 0.14 + m4 * 0.09;
      float rocky = clamp(rockW + 0.0, 0.0, 1.0), soft = 1.0 - rocky;
      // weathered patches, iron stains, lichen: a slow drift of warm and cool
      vec3 tint = mix(vec3(0.66, 0.69, 0.76), vec3(1.34, 1.2, 1.02), smoothstep(0.34, 0.66, macro));
      diffuseColor.rgb *= mix(vec3(1.0), tint, 0.32 * soft + 0.85 * rocky);
      if (rocky > 0.01) {
        // down a rock face, water stains; through it, beds of harder and softer rock that wander with the land. Never ruled lines.
        float streak = bw.x * texture2D(tNoise, vec2(vWP.z / 95.0, vWP.y / 900.0)).g + bw.z * texture2D(tNoise, vec2(vWP.x / 95.0, vWP.y / 900.0)).g + bw.y * 0.5;
        float wander = 90.0 * (m1 - 0.5) + 30.0 * (m2 - 0.5);
        float yb = vWP.y + wander + 0.03 * vWP.x - 0.018 * vWP.z;
        float bedA = texture2D(tNoise, vec2(0.13, yb / 760.0)).r, bedB = texture2D(tNoise, vec2(0.61, yb / 190.0)).b, bed = smoothstep(0.3, 0.7, bedA * 0.65 + bedB * 0.35);
        float showBeds = W[11] * 0.34 + W[12] * 1.0 + W[13] * 0.28 + W[14] * 0.14 + W[15] * 0.5;
        diffuseColor.rgb *= mix(vec3(1.0), mix(vec3(0.68, 0.62, 0.6), vec3(1.24, 1.2, 1.12), bed), showBeds * (0.55 + 0.45 * m2));
        diffuseColor.rgb *= mix(1.0, 0.62 + 0.76 * streak, rocky * (1.0 - bw.y));
        // fractures at two sizes: thin wandering lines, not a net of cells
        float fr1 = bw.x * texture2D(tNoise, vec2(vWP.z, vWP.y) / 37.0).g + bw.z * texture2D(tNoise, vec2(vWP.x, vWP.y) / 37.0).g + bw.y * texture2D(tNoise, top / 37.0).g;
        float fr2 = bw.x * texture2D(tNoise, R1 * vec2(vWP.z, vWP.y) / 11.0).g + bw.z * texture2D(tNoise, R1 * vec2(vWP.x, vWP.y) / 11.0).g + bw.y * texture2D(tNoise, R1 * top / 11.0).g;
        diffuseColor.rgb *= 1.0 - rocky * (0.3 * smoothstep(0.74, 0.92, fr1) + 0.22 * smoothstep(0.76, 0.94, fr2));
      }
      // Close up, what the rock is: beds and joints, each block its own tone, tilted its own way, its edges worn over into the break.
      vec3 blockN = vec3(0.0); float blockK = 0.0;
      if (rockW > 0.02 && vViewPosition.z < 110.0) {
        float axis = max(bw.x, max(bw.y, bw.z)), k1 = (1.0 - smoothstep(60.0, 110.0, vViewPosition.z)) * clamp(rockW * 1.6, 0.0, 1.0) * smoothstep(0.6, 0.86, axis), k2 = (1.0 - smoothstep(14.0, 32.0, vViewPosition.z)) * k1;
        bool flat_ = bw.y > 0.55; vec2 q0 = flat_ ? R1 * top : (bw.x > bw.z ? vec2(vWP.z, vWP.y) : vec2(vWP.x, vWP.y));
        // the planes wander, tilt a little along the country, and never rule a line
        q0.y += 0.09 * q0.x * (m1 - 0.5) + 2.6 * (m3 - 0.5);
        vec2 q = q0 + 0.8 * (texture2D(tNoise, q0 / 9.1).rb - 0.5) + 0.1 * (texture2D(tNoise, q0 / 2.3).br - 0.5);
        vec3 idA, idB; vec3 A = rockBreaks(q, 1.7, idA), B = rockBreaks(R1 * q * 0.97 + 13.0, 0.52, idB); vec3 h1 = hash33(idA), h2 = hash33(idB);
        float rag = 0.012 + 0.05 * texture2D(tNoise, q / 0.8).g;         // a break is wider here, tighter there
        float crack1 = 1.0 - smoothstep(rag * 0.5, rag + 0.03, A.x), lip1 = 1.0 - smoothstep(0.02, 0.26, A.x), crack2 = (1.0 - smoothstep(0.006, 0.04, B.x)) * smoothstep(0.42, 0.62, h1.z);
        diffuseColor.rgb *= mix(vec3(1.0), (0.84 + 0.32 * h1.x) * mix(vec3(1.0), vec3(1.07, 1.0, 0.93), h1.y), k1);
        diffuseColor.rgb *= 1.0 - k1 * crack1 * 0.86; diffuseColor.rgb *= 1.0 - k1 * lip1 * 0.18; diffuseColor.rgb *= 1.0 - k2 * crack2 * 0.5;
        // the world direction of each set of breaks
        vec3 dirV = flat_ ? vec3(R1[0][1], 0.0, R1[1][1]) : vec3(0.0, 1.0, 0.0), dirU = flat_ ? vec3(R1[0][0], 0.0, R1[1][0]) : (bw.x > bw.z ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0));
        vec3 side1 = (A.y < 0.5 ? dirV : dirU) * A.z;
        // the rough of a broken face, too small for the mesh
        vec2 g1 = texture2D(tSlopes, q / 3.1).rg - 0.5, g2 = texture2D(tSlopes, R2 * q / 0.83).rg - 0.5;
        blockN = (h1 - 0.5) * vec3(0.5, 0.26, 0.5) * k1 - side1 * lip1 * 0.6 * k1 + (dirU * (g1.x * 0.5 + g2.x * 0.42 * (1.0 - smoothstep(9.0, 26.0, vViewPosition.z))) + dirV * (g1.y * 0.5 + g2.y * 0.42 * (1.0 - smoothstep(9.0, 26.0, vViewPosition.z)))) * k1; blockK = k1;
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
      // Rock and soil are different stuff with an edge between them, not a blend: past a threshold that wanders with the ground, you're on one or the other.
      .replace('#include <color_fragment>', `
      { float rv = clamp(rockW, 0.0, 1.0), rn = 0.6 * m4 + 0.4 * texture2D(tNoise, R1 * sh / 13.0).r, crisp = smoothstep(0.42, 0.53, rv + (rn - 0.5) * 0.62);
        vec3 rockC = vRock * vRock, soilC = clamp((vColor - rv * rockC) / max(1.0 - rv, 0.2), 0.0, 1.0);
        diffuseColor.rgb *= (rv < 0.004 ? vColor : mix(soilC, rockC, crisp)); }`)
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
      }
      // The small shape of the land, in the light: buttresses, cracks, ledges. Real heights in metres, seen from three sides as the rock is; each size fades as it goes under a pixel.
      {
        float crag = clamp(rockW + (1.0 - wn.y) * 1.1 * (1.0 - W[3]), 0.0, 1.0), lawn = 0.14 * (1.0 - W[3] - W[4] * 0.7), hs = crag + (1.0 - crag) * lawn;
        #define BUMP(P) (0.9 * (texture2D(tSlopes, R2 * (P) / 23.0).rg - 0.5) / 23.0 * R2 + 4.0 * (texture2D(tSlopes, (P) / 97.0).rg - 0.5) / 97.0 + 15.0 * (texture2D(tSlopes, R1 * (P) / 380.0).rg - 0.5) / 380.0 * R1 + 44.0 * (texture2D(tSlopes, R2 * (P) / 1500.0).rg - 0.5) / 1500.0 * R2)
        vec3 dn = vec3(0.0);
        if (bw.y > 0.04) { vec2 g = BUMP(top); dn += bw.y * vec3(g.x, 0.0, g.y); }
        if (bw.x > 0.04) { vec2 g = BUMP(vec2(vWP.z, vWP.y)); dn += bw.x * vec3(0.0, g.y, g.x); }
        if (bw.z > 0.04) { vec2 g = BUMP(vec2(vWP.x, vWP.y)); dn += bw.z * vec3(g.x, g.y, 0.0); }
        normal = normalize(normal - normalMatrix * dn * hs * 2.0 * 40.0);
        if (blockK > 0.0) normal = normalize(normal - normalMatrix * blockN);
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
    g.setAttribute('aRock', new THREE.BufferAttribute(d.rock, 3, true));
    g.setIndex(new THREE.BufferAttribute(d.idx, 1));
    const ib = new THREE.InterleavedBuffer(d.ground, 16);
    g.setAttribute('aS0', new THREE.InterleavedBufferAttribute(ib, 4, 0, true)); g.setAttribute('aS1', new THREE.InterleavedBufferAttribute(ib, 4, 4, true)); g.setAttribute('aS2', new THREE.InterleavedBufferAttribute(ib, 4, 8, true)); g.setAttribute('aR', new THREE.InterleavedBufferAttribute(ib, 4, 12, true));
    g.boundingBox = new THREE.Box3(new THREE.Vector3(0, d.minH - 40, 0), new THREE.Vector3(d.size, d.maxH, d.size));
    g.boundingSphere = g.boundingBox.getBoundingSphere(new THREE.Sphere());
    const mesh = new THREE.Mesh(g, this.material); mesh.renderOrder = -1;     // (while the land's fading it draws in the see-through pass: first in it, or it would paint over glass and haze)
    mesh.position.set(d.x0, 0, d.z0);
    mesh.receiveShadow = true; mesh.castShadow = l <= 1;
    mesh.matrixAutoUpdate = false; mesh.updateMatrix();
    this.parent.add(mesh);
    return mesh;
  }
  get pending() { return this.queue.length; }
  get count() { return this.tiles.size; }
}
