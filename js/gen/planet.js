// Planet-level parameters, derived purely from the body's seed.
import { Rng } from '../core/prng.js';
import { derive } from '../core/hash.js';
import { Simplex2 } from '../core/noise.js';
import { planetName } from './names.js';

const CLIMATES = [
  // ground palettes are linear-ish sRGB; render converts.
  { id: 'temperate', grass: [0.29, 0.34, 0.17], dry: [0.47, 0.42, 0.28], rock: [0.40, 0.38, 0.35], sand: [0.66, 0.60, 0.46], snow: 0.92, treeline: 900, moistBias: 0.15 },
  { id: 'steppe',    grass: [0.43, 0.41, 0.24], dry: [0.56, 0.47, 0.31], rock: [0.45, 0.40, 0.35], sand: [0.70, 0.62, 0.47], snow: 0.90, treeline: 1100, moistBias: -0.15 },
  { id: 'highland',  grass: [0.33, 0.36, 0.25], dry: [0.44, 0.40, 0.33], rock: [0.36, 0.36, 0.37], sand: [0.58, 0.55, 0.47], snow: 0.95, treeline: 650, moistBias: 0.0 },
];

export function makePlanet(universeSeed, address) {
  const seed = address.seed(universeSeed);
  const rng = new Rng(seed);
  const climate = rng.pick(CLIMATES);
  return {
    address, seed, universeSeed,
    name: planetName(rng),
    climate,
    seaLevel: 0,
    dayLength: Math.round(rng.range(19, 31) * 3600),       // seconds per solar day
    axialTilt: rng.range(0.05, 0.42),                       // radians
    latitude: rng.range(-0.7, 0.7),                         // of the surface patch M1 uses
    yearLength: Math.round(rng.range(280, 520)) * 86400,
    atmosphere: { turbidity: rng.range(2.2, 6), rayleigh: rng.range(1.2, 2.6), mie: rng.range(0.003, 0.008) },
    noise: {
      cont: new Simplex2(derive(seed, 'cont')),
      mount: new Simplex2(derive(seed, 'mount')),
      hill: new Simplex2(derive(seed, 'hill')),
      warp: new Simplex2(derive(seed, 'warp')),
      moist: new Simplex2(derive(seed, 'moist')),
      detail: new Simplex2(derive(seed, 'detail')),
    },
  };
}
