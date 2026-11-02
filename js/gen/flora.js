// Plants and boulders on open ground. Pure: one candidate per 6 m cell, kept or not by a
// hash against a density that reads the same things the ground colour does (moisture,
// slope, height above the sea and below the treeline) and stays off towns and roads.
// A plant is logical data — species, position, size, and for trees and boulders a solid
// radius the collision world blocks — so the models (tools/assets/build.py) can change freely.
import { hashInts } from '../core/hash.js';
import { surfaceAt } from './surface.js';
import { moisture } from './terrain.js';
import { smoothstep } from '../core/noise.js';

export const CELL = 6, TILE = 96;               // candidate spacing; flora is generated and cached per tile
export const SPECIES = {
  conifer:   { solid: 0.3, h: [7, 16] },        // h: height range (m) — the model is scaled to it
  broadleaf: { solid: 0.35, h: [6, 12] },
  shrub:     { solid: 0, h: [0.8, 2.0] },
  boulder:   { solid: 1, h: [0.6, 2.2] },       // solid for boulders scales with size (×0.6 of height)
};

const cache = new Map();
// Everything in the TILE × TILE square whose corner is (ti·TILE, tj·TILE).
export function floraTile(planet, ti, tj) {
  const ck = planet.universeSeed.join(':') + '|' + ti + ',' + tj;
  if (cache.has(ck)) return cache.get(ck);
  const out = [], C = planet.climate, n = TILE / CELL, seed = planet.universeSeed[0] ^ 0x5f10a;
  for (let b = 0; b < n; b++) for (let a = 0; a < n; a++) {
    const ci = ti * n + a, cj = tj * n + b;
    const r = k => hashInts(seed, [ci, cj, k]) / 4294967296;
    const x = (ci + 0.15 + 0.7 * r(1)) * CELL, z = (cj + 0.15 + 0.7 * r(2)) * CELL;
    const s = surfaceAt(planet, x, z);
    if (s.town > 0.01 || s.road > 0.01 || s.h < planet.seaLevel + 2) continue;
    const e = 1.5, hx = surfaceAt(planet, x + e, z).h - s.h, hz = surfaceAt(planet, x, z + e).h - s.h;
    const ny = e / Math.hypot(hx, e, hz);                                         // 1 = flat
    const moist = moisture(planet, x, z), above = s.h - planet.seaLevel;
    const alpine = 1 - smoothstep(C.treeline - 150, C.treeline + 80, s.h);
    const lush = smoothstep(0.5, 0.85, moist), flat = smoothstep(0.7, 0.88, ny);   // lush: where the ground colour (gen/chunk.js) is turning green
    // patchy: woods come in stands, not an even carpet
    const stand = 0.5 + 0.5 * Math.sin(x / 83 + Math.sin(z / 57) * 2) * Math.cos(z / 71 + Math.sin(x / 49) * 2);
    const pTree = 0.75 * lush * flat * alpine * smoothstep(0.35, 0.75, stand) * smoothstep(4, 15, above);
    const pShrub = 0.12 + 0.25 * (1 - lush) * flat;
    const pRock = 0.04 + 0.25 * (1 - smoothstep(0.55, 0.8, ny)) + 0.1 * (1 - alpine);
    const roll = r(3);
    let sp = null;
    if (roll < pTree) sp = s.h > C.treeline - 400 || r(4) < 0.45 ? 'conifer' : 'broadleaf';
    else if (roll < pTree + pShrub * flat * smoothstep(1, 4, above) * (0.4 + alpine)) sp = 'shrub';
    else if (roll < pTree + pShrub + pRock * 0.35) sp = 'boulder';
    if (!sp) continue;
    const S = SPECIES[sp], size = S.h[0] + (S.h[1] - S.h[0]) * r(5) ** 1.5;
    out.push({ sp, x, y: s.h, z, size, rot: r(6) * Math.PI * 2, tint: r(7), solid: sp === 'boulder' ? size * 0.6 : S.solid });
  }
  cache.set(ck, out);
  if (cache.size > 4000) cache.delete(cache.keys().next().value);
  return out;
}

// Plants within radius R of (x, z): calls fn(plant) for each.
export function floraNear(planet, x, z, R, fn) {
  const t0 = Math.floor((x - R) / TILE), t1 = Math.floor((x + R) / TILE), u0 = Math.floor((z - R) / TILE), u1 = Math.floor((z + R) / TILE);
  for (let ti = t0; ti <= t1; ti++) for (let tj = u0; tj <= u1; tj++) for (const p of floraTile(planet, ti, tj)) if ((p.x - x) ** 2 + (p.z - z) ** 2 <= R * R) fn(p);
}

// Grass clumps: much denser than plants, only ever needed near the player. One candidate
// per GCELL m; kept where the ground is green enough and flat, off towns and roads.
// → Float32Array of [x, y, z, size, lush] per clump.
export const GCELL = 0.65, GTILE = 26;
const gcache = new Map();
export function grassTile(planet, ti, tj) {
  const ck = planet.universeSeed.join(':') + '|g' + ti + ',' + tj;
  if (gcache.has(ck)) return gcache.get(ck);
  const n = GTILE / GCELL, seed = planet.universeSeed[1] ^ 0x6a55, out = [];
  for (let b = 0; b < n; b++) for (let a = 0; a < n; a++) {
    const ci = ti * n + a, cj = tj * n + b, r = k => hashInts(seed, [ci, cj, k]) / 4294967296;
    const x = (ci + r(1)) * GCELL, z = (cj + r(2)) * GCELL;
    const s = surfaceAt(planet, x, z);
    if (s.town > 0.01 || s.road > 0.01 || s.h < planet.seaLevel + 1.5 || s.h > planet.climate.treeline + 150) continue;
    const moist = moisture(planet, x, z), lush = smoothstep(0.2, 0.75, moist);
    if (r(3) > 0.25 + 0.7 * lush) continue;
    out.push(x, s.h, z, 0.35 + 0.55 * r(4) * (0.5 + lush), lush);
  }
  const arr = new Float32Array(out);
  gcache.set(ck, arr);
  if (gcache.size > 3000) gcache.delete(gcache.keys().next().value);
  return arr;
}
