// Terrain chunk data: heights, normals and ground colour for one quadtree tile.
// Pure (no three.js) so it can move into a Web Worker unchanged.
// Tiles are keyed (lod, i, j): edge = CHUNK·2^lod metres, origin (i·edge, j·edge).
import { CHUNK, CHUNK_RES } from '../core/units.js';
import { surfaceAt } from './surface.js';
import { moisture } from './terrain.js';
import { smoothstep } from '../core/noise.js';

export function chunkData(planet, lod, i, j) {
  const size = CHUNK * 2 ** lod, step = size / CHUNK_RES, n = CHUNK_RES + 1, x0 = i * size, z0 = j * size;
  const m = n + 2;                                    // one-sample border for normals
  const H = new Float64Array(m * m), TOWN = new Float32Array(m * m), ROAD = new Float32Array(m * m);
  for (let b = 0; b < m; b++) for (let a = 0; a < m; a++) {
    const s = surfaceAt(planet, x0 + (a - 1) * step, z0 + (b - 1) * step);
    H[b * m + a] = s.h; TOWN[b * m + a] = s.town; ROAD[b * m + a] = s.road;
  }
  const skirt = 4 * CHUNK_RES;
  const vcount = n * n + skirt;
  const pos = new Float32Array(vcount * 3), nrm = new Float32Array(vcount * 3), col = new Float32Array(vcount * 3), uv = new Float32Array(vcount * 2);
  const C = planet.climate, sea = planet.seaLevel;
  for (let b = 0; b < n; b++) for (let a = 0; a < n; a++) {
    const k = (b + 1) * m + (a + 1), v = b * n + a;
    const h = H[k];
    let nx = H[k - 1] - H[k + 1], nz = H[k - m] - H[k + m], ny = 2 * step;
    const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    pos[v * 3] = a * step; pos[v * 3 + 1] = h; pos[v * 3 + 2] = b * step;
    nrm[v * 3] = nx; nrm[v * 3 + 1] = ny; nrm[v * 3 + 2] = nz;
    uv[v * 2] = x0 + a * step; uv[v * 2 + 1] = z0 + b * step;
    // ground colour: moisture blends lush↔dry, slope exposes rock, height brings snow
    const wx = x0 + a * step, wz = z0 + b * step;
    const moist = moisture(planet, wx, wz);
    let c = mix3(C.dry, C.grass, smoothstep(0.25, 0.75, moist));
    c = mix3(c, C.sand, 1 - smoothstep(sea + 1.5, sea + 6, h));
    // rock shows on steep ground and high up, banded by strata
    const band = 0.85 + 0.3 * planet.noise.detail.n(h / 23, wx / 4000);
    const rock = [C.rock[0] * band, C.rock[1] * band, C.rock[2] * band];
    c = mix3(c, rock, smoothstep(0.82, 0.6, ny) + smoothstep(C.treeline, C.treeline + 350, h) * 0.6);
    const snow = smoothstep(C.treeline + 250, C.treeline + 500, h) * smoothstep(0.6, 0.8, ny);
    c = mix3(c, [C.snow, C.snow, C.snow * 1.02], snow);
    c = mix3(c, [0.40, 0.37, 0.32], TOWN[k] * 0.85);
    c = mix3(c, [0.30, 0.29, 0.27], ROAD[k]);
    col[v * 3] = c[0]; col[v * 3 + 1] = c[1]; col[v * 3 + 2] = c[2];
  }
  // skirts: duplicate edge vertices, dropped, to hide cracks against coarser neighbours
  const drop = step * 1.5 + 2;
  const edge = [];
  for (let a = 0; a < CHUNK_RES; a++) edge.push(a);                          // b = 0 row
  for (let b = 0; b < CHUNK_RES; b++) edge.push(b * n + CHUNK_RES);          // a = max col
  for (let a = CHUNK_RES; a > 0; a--) edge.push(CHUNK_RES * n + a);          // b = max row
  for (let b = CHUNK_RES; b > 0; b--) edge.push(b * n);                      // a = 0 col
  edge.forEach((src, e) => {
    const v = n * n + e;
    for (let c = 0; c < 3; c++) { pos[v * 3 + c] = pos[src * 3 + c]; nrm[v * 3 + c] = nrm[src * 3 + c]; col[v * 3 + c] = col[src * 3 + c]; }
    pos[v * 3 + 1] -= drop; uv[v * 2] = uv[src * 2]; uv[v * 2 + 1] = uv[src * 2 + 1];
  });
  const idx = new Uint32Array(CHUNK_RES * CHUNK_RES * 6 + skirt * 6);
  let p = 0;
  for (let b = 0; b < CHUNK_RES; b++) for (let a = 0; a < CHUNK_RES; a++) {
    const v = b * n + a;
    idx[p++] = v; idx[p++] = v + n; idx[p++] = v + 1;
    idx[p++] = v + 1; idx[p++] = v + n; idx[p++] = v + n + 1;
  }
  for (let e = 0; e < skirt; e++) {
    const a0 = edge[e], a1 = edge[(e + 1) % skirt], s0 = n * n + e, s1 = n * n + (e + 1) % skirt;
    idx[p++] = a0; idx[p++] = a1; idx[p++] = s0;
    idx[p++] = a1; idx[p++] = s1; idx[p++] = s0;
  }
  let minH = Infinity, maxH = -Infinity;
  for (let v = 0; v < n * n; v++) { const h = pos[v * 3 + 1]; if (h < minH) minH = h; if (h > maxH) maxH = h; }
  return { lod, i, j, x0, z0, size, pos, nrm, col, uv, idx, minH, maxH };
}

const mix3 = (a, b, t) => { t = t < 0 ? 0 : t > 1 ? 1 : t; return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; };
