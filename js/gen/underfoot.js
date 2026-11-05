// What's actually under your feet, here and now. The land's kind sets how it treads (gen/land.js), but only where you're
// really standing on that land: a street, a road or a roof in dune country is still a street, a road or a roof. And only
// ground soft enough to be pressed takes a print: sand, snow, mud, ash; never rock, turf, salt or paving.
import { surfaceAt } from './surface.js';
import { groundFeel, groundAt, S } from './land.js';
import { moisture } from './terrain.js';
import { smoothstep } from '../core/noise.js';

const FIRM = Object.freeze({ speed: 1, sink: 0, print: 0, loose: 0, dust: 0, kind: 'firm', firm: true });
const W = new Float32Array(16), C = [0, 0, 0];

export function underfoot(planet, x, z, y = null) {
  const s = surfaceAt(planet, x, z);
  if (s.town > 0.02 || s.road > 0.05 || s.city > 0) return FIRM;
  if (y !== null && y - s.h > 0.35) return FIRM;                  // up on something: a roof, a deck, a rock
  const e = 1.2, hx = surfaceAt(planet, x + e, z).h - s.h, hz = surfaceAt(planet, x, z + e).h - s.h, ny = e / Math.hypot(hx, e, hz), T = planet.climate;
  groundAt(planet, x, z, ny, moisture(planet, x, z), W, C);
  const shore = 1 - smoothstep(planet.seaLevel + 1.5, planet.seaLevel + 6, s.h), snow = smoothstep(T.treeline + 250, T.treeline + 500, s.h) * smoothstep(0.6, 0.8, ny);
  const soft = Math.max(W[S.sand] + 0.85 * W[S.peat] + 0.6 * W[S.ash], shore, snow, s.wet > 0.2 ? 0.8 : 0);
  const F = groundFeel(planet, x, z);
  return { speed: F.speed, sink: F.sink * Math.min(1, soft + 0.3), print: soft < 0.25 ? 0 : Math.min(1, soft), loose: F.loose, dust: F.dust, kind: F.kind, firm: false };
}
