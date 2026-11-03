// Plants and boulders on open ground. Pure: one candidate per 6 m cell, kept or not by a
// hash against a density that reads the same things the ground colour does (moisture,
// slope, height above the sea and below the treeline) and stays off towns and roads.
// A plant is logical data — species, position, size, and for trees and boulders a solid
// radius the collision world blocks — so the models (tools/assets/build.py) can change freely.
import { hashInts, hashStr } from '../core/hash.js';
import { surfaceAt } from './surface.js';
import { moisture } from './terrain.js';
import { smoothstep } from '../core/noise.js';
import { settlementNear } from './settlement.js';
import { shipsAt, LAYOUTS } from './ships.js';

// ground kept clear for ships standing outside town (cargo fields): [x, z, radius]
function clearings(planet, x, z) {
  const s = settlementNear(planet, x, z); if (!s) return [];
  return shipsAt(planet, s).filter(sh => sh.field && sh.at).map(sh => [sh.at.c[0], sh.at.c[2], LAYOUTS[sh.model].D * 0.6 + 4]);
}

export const CELL = 6, TILE = 96;               // candidate spacing; flora is generated and cached per tile
export const SPECIES = {
  // trees: h = height range (m); habitat: preferred moisture (0..1) and how high above the sea (fraction of the treeline)
  oak:     { tree: true, solid: 0.4, h: [8, 15], moist: 0.65, alt: 0.3, alien: false },
  birch:   { tree: true, solid: 0.2, h: [9, 16], moist: 0.7, alt: 0.5, alien: false },
  spruce:  { tree: true, solid: 0.3, h: [10, 22], moist: 0.6, alt: 0.75, alien: false },
  pine:    { tree: true, solid: 0.3, h: [10, 18], moist: 0.4, alt: 0.6, alien: false },
  parasol: { tree: true, solid: 0.45, h: [6, 11], moist: 0.35, alt: 0.35, alien: true },
  spiral:  { tree: true, solid: 0.3, h: [6, 10], moist: 0.85, alt: 0.25, alien: true },
  bottle:  { tree: true, solid: 0.7, h: [5, 9], moist: 0.2, alt: 0.3, alien: true },
  shrub:   { solid: 0, h: [0.8, 2.0] },
  fern:    { solid: 0, h: [0.5, 1.1] },
  boulder: { solid: 1, h: [0.6, 2.2] },       // solid for boulders scales with size (×0.6 of height)
};
export const TREES = Object.keys(SPECIES).filter(k => SPECIES[k].tree);
// Which trees grow on this planet: a few familiar ones and some that aren't, by the planet's seed.
const sets = new Map();
export function plantSet(planet) {
  const ck = planet.universeSeed.join(':') + '|' + (planet.address?.key || '');
  if (sets.has(ck)) return sets.get(ck);
  const h = k => hashInts(planet.universeSeed[0] ^ 0x7ee5, [hashStr(3, planet.address?.key || 'p'), k]) / 4294967296;
  const alien = 0.25 + 0.6 * h(0);                                   // how strange this world's plants are
  const pool = TREES.map((k, i) => ({ k, w: (SPECIES[k].alien ? alien : 1 - alien * 0.6) * (0.4 + h(i + 1)) })).sort((a, b) => b.w - a.w);
  const chosen = pool.slice(0, 4 + Math.floor(h(20) * 2)).map(x => x.k);
  if (!chosen.some(k => !SPECIES[k].alien)) chosen[chosen.length - 1] = 'oak';
  sets.set(ck, chosen);
  return chosen;
}

const cache = new Map();
// Everything in the TILE × TILE square whose corner is (ti·TILE, tj·TILE).
export function floraTile(planet, ti, tj) {
  const ck = planet.universeSeed.join(':') + '|' + ti + ',' + tj;
  if (cache.has(ck)) return cache.get(ck);
  const out = [], C = planet.climate, n = TILE / CELL, seed = planet.universeSeed[0] ^ 0x5f10a, clear = clearings(planet, (ti + 0.5) * TILE, (tj + 0.5) * TILE);
  for (let b = 0; b < n; b++) for (let a = 0; a < n; a++) {
    const ci = ti * n + a, cj = tj * n + b;
    const r = k => hashInts(seed, [ci, cj, k]) / 4294967296;
    const x = (ci + 0.15 + 0.7 * r(1)) * CELL, z = (cj + 0.15 + 0.7 * r(2)) * CELL;
    const s = surfaceAt(planet, x, z);
    if (s.town > 0.01 || s.road > 0.01 || s.h < planet.seaLevel + 2) continue;
    if (clear.some(([cx, cz, r]) => (x - cx) ** 2 + (z - cz) ** 2 < r * r)) continue;
    const e = 1.5, hx = surfaceAt(planet, x + e, z).h - s.h, hz = surfaceAt(planet, x, z + e).h - s.h;
    const ny = e / Math.hypot(hx, e, hz);                                         // 1 = flat
    const moist = moisture(planet, x, z), above = s.h - planet.seaLevel;
    const alpine = 1 - smoothstep(C.treeline - 150, C.treeline + 80, s.h);
    const lush = smoothstep(0.5, 0.85, moist), flat = smoothstep(0.7, 0.88, ny);   // lush: where the ground colour (gen/chunk.js) is turning green
    // patchy: woods come in stands, not an even carpet
    const stand = 0.5 + 0.5 * Math.sin(x / 83 + Math.sin(z / 57) * 2) * Math.cos(z / 71 + Math.sin(x / 49) * 2);
    const pTree = 0.75 * (0.35 + 0.65 * lush) * flat * alpine * smoothstep(0.35, 0.75, stand) * smoothstep(4, 15, above);
    const pShrub = 0.12 + 0.25 * (1 - lush) * flat;
    const pRock = 0.04 + 0.25 * (1 - smoothstep(0.55, 0.8, ny)) + 0.1 * (1 - alpine);
    const roll = r(3);
    let sp = null;
    if (roll < pTree) {     // which tree: the planet's species, weighted by how well this spot suits each
      const set = plantSet(planet), altF = Math.max(0, s.h - planet.seaLevel) / Math.max(1, C.treeline - planet.seaLevel);
      let tot = 0; const w = set.map(k => { const S = SPECIES[k]; const v = Math.exp(-((moist - S.moist) ** 2) / 0.08 - ((altF - S.alt) ** 2) / 0.12) + 0.02; tot += v; return v; });
      let q = r(4) * tot; sp = set[set.length - 1];
      for (let i = 0; i < set.length; i++) { q -= w[i]; if (q < 0) { sp = set[i]; break; } }
    }
    else if (roll < pTree + 0.55 * pTree / 0.75 * lush) sp = 'fern';                       // undergrowth: ferns where the woods are, and damp
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
