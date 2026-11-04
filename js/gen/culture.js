// How a planet's people build. Everything that gives a world its look but isn't terrain comes
// from here, from the seed: which facades they favour, how high and how round they build, their
// colours, how much green and neon they tolerate. Two planets should be told apart at a glance.
import { Rng } from '../core/prng.js';
import { derive } from '../core/hash.js';

// [facade styles by weight per kind of building, height, round towers, setbacks, storey, bay, parks, neon, tint]
const WAYS = {
  corporate: { label: 'corporate glass', tower: { glass: 5, bronze: 2, ribbon: 2, white: 1 }, office: { glass: 4, ribbon: 3, grid: 2, bronze: 1 }, home: { hab: 3, grid: 2, white: 2 }, low: { grime: 2, brick: 1, hab: 2 }, height: 1.1, round: 0.25, steps: 1, storey: 1, bay: 1, green: 0.04, neon: 0.6, tint: [0.96, 1.0, 1.05] },
  masonry: { label: 'old masonry', tower: { brick: 4, grid: 3, bronze: 1 }, office: { brick: 4, grid: 3, white: 1 }, home: { brick: 5, hab: 2 }, low: { brick: 4, grime: 2 }, height: 0.55, round: 0.06, steps: 1.5, storey: 1.08, bay: 0.92, green: 0.09, neon: 0.2, tint: [1.08, 1.0, 0.9] },
  brutalist: { label: 'poured concrete', tower: { grid: 4, podium: 2, hab: 2 }, office: { grid: 5, ribbon: 1 }, home: { hab: 5, grid: 2 }, low: { grime: 3, hab: 2 }, height: 0.85, round: 0.03, steps: 0.6, storey: 0.96, bay: 1.1, green: 0.02, neon: 0.3, tint: [0.97, 0.97, 0.96] },
  garden: { label: 'white terraces', tower: { white: 5, ribbon: 3, glass: 1 }, office: { white: 4, ribbon: 3 }, home: { white: 5, hab: 2 }, low: { white: 3, hab: 2 }, height: 0.7, round: 0.4, steps: 2, storey: 1.03, bay: 1.1, green: 0.18, neon: 0.1, tint: [1.03, 1.03, 1.0] },
  foundry: { label: 'dark iron', tower: { bronze: 3, shed: 1, grid: 3 }, office: { grid: 3, bronze: 2 }, home: { grime: 4, brick: 3 }, low: { grime: 5, shed: 2 }, height: 0.8, round: 0.1, steps: 0.8, storey: 1.12, bay: 0.9, green: 0.01, neon: 0.9, tint: [0.84, 0.82, 0.8] },
  neon: { label: 'crowded neon', tower: { glass: 3, grime: 2, grid: 2 }, office: { grid: 3, glass: 3 }, home: { grime: 4, hab: 3 }, low: { grime: 5, brick: 2 }, height: 1.25, round: 0.12, steps: 1.2, storey: 0.94, bay: 0.9, green: 0.01, neon: 1.4, tint: [0.92, 0.9, 1.0] },
};
const HUES = [[0.72, 0.16, 0.12], [0.1, 0.36, 0.62], [0.86, 0.6, 0.12], [0.16, 0.5, 0.3], [0.56, 0.2, 0.52], [0.84, 0.82, 0.76], [0.2, 0.22, 0.24], [0.9, 0.36, 0.1], [0.12, 0.56, 0.6], [0.5, 0.42, 0.3], [0.36, 0.1, 0.16], [0.62, 0.72, 0.5]];
const cache = new WeakMap();
export function cultureOf(planet) {
  if (cache.has(planet)) return cache.get(planet);
  const rng = new Rng(derive(planet.seed, 'culture')), key = rng.pick(Object.keys(WAYS)), w = WAYS[key], jit = (v, a) => v * rng.range(1 - a, 1 + a);
  const shuffled = rng.shuffle(HUES.slice()), c = {
    key, label: w.label, tower: w.tower, office: w.office, home: w.home, low: w.low,
    height: jit(w.height, 0.12), round: Math.min(0.6, jit(w.round, 0.3)), steps: jit(w.steps, 0.15), storey: jit(w.storey, 0.04), bay: jit(w.bay, 0.08), green: jit(w.green, 0.25), neon: jit(w.neon, 0.25),
    tint: w.tint.map(v => jit(v, 0.035)), paints: shuffled.slice(0, 6), // the colours this people paint things
    trim: rng.range(0.3, 1), wear: rng.range(0.35, 1),              // how grand; how worn
  };
  cache.set(planet, c);
  return c;
}
