// Raw planetary terrain: a pure function height(x, z) in metres on the surface patch.
// "Raw" means before settlements grade the land (see gen/surface.js).
import { clamp, smoothstep } from '../core/noise.js';
import { shapeLand, setLandBase } from './land.js';
import { globeOf, canon, seamAt, continentDrop, cornerDrop, HOME_LAND } from './globe.js';

// The bare continental shape: sea, ranges and rolling hills, before the kinds of land work on it.
export function baseHeight(planet, x, z) {
  const N = planet.noise;
  // Domain warp gives the continents and ranges non-grid, flowing shapes.
  const wx = x + 900 * N.warp.fbm(x / 6000, z / 6000, 3);
  const wz = z + 900 * N.warp.fbm(x / 6000 + 5.2, z / 6000 - 1.3, 3);
  const cont = N.cont.fbm(wx / 14000, wz / 14000, 4);                  // [-1,1]
  // Keep the origin (where milestone 1 spawns) on dry land.
  const r = Math.sqrt(x * x + z * z);
  const landBias = 0.45 * (1 - smoothstep(4000, 14000, r));
  const c = cont + landBias;
  let h = 260 * c + 40;                                                  // lowlands & seas
  const mountMask = smoothstep(0.05, 0.55, c + 0.35 * N.mount.fbm(wx / 9000, wz / 9000, 2));
  h += 820 * mountMask * N.mount.ridged(wx / 3200, wz / 3200, 6);       // ranges
  h += 55 * N.hill.fbm(x / 800, z / 800, 5);                            // rolling hills
  h += 3.5 * N.detail.fbm(x / 70, z / 70, 3);                           // ground texture
  // Gentle terracing on high plateaus (sedimentary benches).
  if (h > 180) { const t = (h - 180) / 45, f = t - Math.floor(t); h += 45 * 0.18 * (smoothstep(0.35, 0.65, f) - f); }
  return h;
}
setLandBase(baseHeight);

const plain = (planet, x, z) => shapeLand(planet, x, z, baseHeight(planet, x, z));
// The land at (x, z) on the planet. Near home the pattern simply runs on; further out, oceans lie over it, and along a seam
// of the unfolded globe (gen/globe.js) the two sides are blended so a walk across doesn't meet a cliff.
export function rawHeight(planet, x, z) {
  if (x < HOME_LAND && x > -HOME_LAND && z < HOME_LAND && z > -HOME_LAND) return plain(planet, x, z);
  const G = globeOf(planet), [a, b] = canon(G, x, z), S = seamAt(G, a, b);
  let h = plain(planet, a, b); if (S) h += (plain(planet, S.x, S.z) - h) * S.w;
  h -= continentDrop(planet, G, a, b);
  const c = cornerDrop(G, a, b); if (c) h += (-140 - h) * c;
  return h;
}

const wet = (planet, x, z) => clamp(0.5 + 0.5 * planet.noise.moist.fbm(x / 5000, z / 5000, 4) + planet.climate.moistBias, 0, 1);
export function moisture(planet, x, z) {
  if (x < HOME_LAND && x > -HOME_LAND && z < HOME_LAND && z > -HOME_LAND) return wet(planet, x, z);
  const G = globeOf(planet), [a, b] = canon(G, x, z), S = seamAt(G, a, b), m = wet(planet, a, b);
  return S ? m + (wet(planet, S.x, S.z) - m) * S.w : m;
}
