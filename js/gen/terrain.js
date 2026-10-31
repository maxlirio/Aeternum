// Raw planetary terrain: a pure function height(x, z) in metres on the surface patch.
// "Raw" means before settlements grade the land (see gen/surface.js).
import { clamp, smoothstep } from '../core/noise.js';

export function rawHeight(planet, x, z) {
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

export function moisture(planet, x, z) {
  return clamp(0.5 + 0.5 * planet.noise.moist.fbm(x / 5000, z / 5000, 4) + planet.climate.moistBias, 0, 1);
}
