// Planet-level parameters, derived purely from the body's seed.
import { Rng } from '../core/prng.js';
import { derive } from '../core/hash.js';
import { Simplex2 } from '../core/noise.js';
import { planetName } from './names.js';
import { buildGenome } from './genome.js';

export const OLD_CLIMATES = [   // (the three presets before gen/genome.js: kept for reference)
  // ground palettes are linear-ish sRGB; render converts.
  { id: 'temperate', grass: [0.20, 0.27, 0.10], dry: [0.40, 0.34, 0.20], rock: [0.27, 0.25, 0.23], sand: [0.58, 0.52, 0.38], snow: 0.92, treeline: 900, moistBias: 0.15 },
  { id: 'steppe',    grass: [0.33, 0.32, 0.16], dry: [0.50, 0.40, 0.25], rock: [0.34, 0.29, 0.25], sand: [0.64, 0.55, 0.40], snow: 0.90, treeline: 1100, moistBias: -0.15 },
  { id: 'highland',  grass: [0.23, 0.27, 0.16], dry: [0.37, 0.33, 0.25], rock: [0.25, 0.25, 0.26], sand: [0.52, 0.49, 0.41], snow: 0.95, treeline: 650, moistBias: 0.0 },
];

export function makePlanet(universeSeed, address) {
  const seed = address.seed(universeSeed);
  const rng = new Rng(seed);
  // Everything that makes this world unlike the others: gen/genome.js. Its climate (palette, tree line, how wet) and atmosphere replace the old three presets.
  const genome = buildGenome(seed), climate = genome.climate;
  return {
    address, seed, universeSeed, genome,
    name: planetName(rng),
    climate,
    seaLevel: genome.noGround ? -100000 : 0,          // (a cloud world has no sea: the clouds are render/skyisles.js)
    dayLength: Math.round(rng.range(19, 31) * 3600),       // seconds per solar day
    axialTilt: rng.range(0.05, 0.42),                       // radians
    latitude: rng.range(-0.7, 0.7),                         // of the surface patch M1 uses
    yearLength: Math.round(rng.range(280, 520)) * 86400,
    atmosphere: genome.atmosphere,
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
