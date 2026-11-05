// Rocks: boulders, slabs and pillars lying on the land, as many as the kind of land has. Pure data, as
// plants are: where, how big, which shape, and the solid circle a walker can't pass (gen/land.js says how
// many; render/rocks.js makes the models). Cached per tile; nothing's stored.
import { hashInts } from '../core/hash.js';
import { surfaceAt } from './surface.js';
import { gridTraits, mainLand } from './land.js';
import { settlementNear } from './settlement.js';
import { sitesNear, tracksNear, onTrack } from './outposts.js';

export const TILE = 96, SHAPES = ['boulder', 'slab', 'pillar'], VARIANTS = 4;
const cache = new Map();
const onSite = (planet, x, z) => { let on = false; sitesNear(planet, x, z, 140, S => { if (Math.hypot(S.x - x, S.z - z) < S.clear) on = true; }); return on; };

export function rockTile(planet, ti, tj) {
  const ck = planet.universeSeed.join(':') + '|' + ti + ',' + tj; if (cache.has(ck)) return cache.get(ck);
  const out = [], seed = planet.universeSeed[1] ^ 0x70cc5, x0 = ti * TILE, z0 = tj * TILE, LT = gridTraits(planet, x0, z0, TILE, 2), tracks = tracksNear(planet, x0 + TILE / 2, z0 + TILE / 2, TILE);
  const put = (x, z, sp, size, r) => {
    const s = surfaceAt(planet, x, z);
    if (s.town > 0.01 || s.road > 0.01 || s.wet > 0.05 || s.h < planet.seaLevel + 1) return;
    if (onSite(planet, x, z) || tracks.some(T => onTrack(T, x, z))) return;
    const e = Math.max(0.8, size * 0.4), hx = surfaceAt(planet, x + e, z).h - s.h, hz = surfaceAt(planet, x, z + e).h - s.h, ny = e / Math.hypot(hx, e, hz);
    const c = mainLand(planet, x, z), shape = sp, tall = shape === 'pillar' ? size * (2 + 2.2 * r(9)) : shape === 'slab' ? size * (0.3 + 0.25 * r(9)) : size * (0.65 + 0.5 * r(9));
    const sink = 0.12 + 0.2 * (1 - ny);     // sat in the ground, not on it
    out.push({ x, z, y: s.h - tall * sink, shape, rock: c.T.rock, moss: c.T.soft.moss || c.T.soft.peat ? 1 : c.kind === 'meadow' || c.kind === 'moor' || c.kind === 'karst' ? 0.3 : 0,
      v: Math.floor(r(10) * VARIANTS), size, tall, rot: r(11) * 6.283, tilt: (r(12) - 0.5) * (shape === 'pillar' ? 0.1 : 0.4), tint: r(13),
      r: shape === 'pillar' ? size * 0.72 : size * (shape === 'slab' ? 0.8 : 0.72), top: tall * (1 - sink) * (shape === 'slab' ? 0.95 : 0.8) });
  };
  // small stones and boulders, 8 m apart at most
  for (let b = 0; b < 12; b++) for (let a = 0; a < 12; a++) {
    const i = ti * 12 + a, j = tj * 12 + b, r = k => hashInts(seed, [i, j, k]) / 4294967296, x = (i + r(1)) * 8, z = (j + r(2)) * 8, st = LT(x, z, 'stones');
    const clump = 0.35 + 1.3 * (0.5 + 0.5 * Math.sin(x / 19 + Math.sin(z / 13) * 2.2) * Math.cos(z / 17 + Math.sin(x / 11) * 2));   // boulders lie in spreads
    if (r(3) > 0.14 * st * clump) continue;
    put(x, z, r(4) < 0.2 ? 'slab' : 'boulder', 0.28 + 2.1 * r(5) ** 2.6, r);
  }
  // house-sized rocks and pillars, 32 m apart at most
  for (let b = 0; b < 3; b++) for (let a = 0; a < 3; a++) {
    const i = ti * 3 + a, j = tj * 3 + b, r = k => hashInts(seed ^ 0x51, [i, j, k]) / 4294967296, x = (i + r(1)) * 32, z = (j + r(2)) * 32;
    if (r(3) < 0.2 * LT(x, z, 'big')) put(x, z, r(4) < 0.25 ? 'slab' : 'boulder', 3 + 7 * r(5) ** 1.7, r);
    else if (r(6) < 0.11 * LT(x, z, 'spire')) put(x, z, 'pillar', 2 + 3.6 * r(5), r);
  }
  cache.set(ck, out);
  if (cache.size > 2500) cache.delete(cache.keys().next().value);
  return out;
}

// Rocks whose solid circle could touch a walker at (x, z) with reach R. (The biggest is 10 m across its middle.)
export function rocksNear(planet, x, z, R, fn) {
  const reach = R + 8, t0 = Math.floor((x - reach) / TILE), t1 = Math.floor((x + reach) / TILE), u0 = Math.floor((z - reach) / TILE), u1 = Math.floor((z + reach) / TILE);
  for (let ti = t0; ti <= t1; ti++) for (let tj = u0; tj <= u1; tj++) for (const q of rockTile(planet, ti, tj)) { const d = R + q.r; if ((q.x - x) ** 2 + (q.z - z) ** 2 <= d * d) fn(q); }
}
