// Weather: a pure function of the planet and the time, so it is the same whether you
// watch it or come back hours later. Cloud cover drifts on a few-hour scale (smooth value
// noise in time), wetter planets are cloudier, and rain falls when it is heavily overcast.
//   → { cloud 0..1, rain 0..1, wind [x, z] m/s, label }
import { hashInts } from '../core/hash.js';
import { smoothstep } from '../core/noise.js';

const at = (planet, k, i) => hashInts(planet.seed[0] ^ 0x3e47, [k, i]) / 4294967296;      // (the planet's own seed: two worlds don't share their weather)
function vnoise(planet, k, x) {            // smooth 1D value noise
  const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
  return at(planet, k, i) * (1 - u) + at(planet, k, i + 1) * u;
}

export function weatherAt(planet, t) {
  const H = planet.dayLength / 24, bias = (planet.climate.moistBias || 0) + ((planet.atmosphere.cloud ?? 0.4) - 0.4) * 0.6;
  const slow = vnoise(planet, 1, t / (9 * H)), fast = vnoise(planet, 2, t / (2.5 * H));
  const cloud = Math.min(1, Math.max(0, 0.15 + 0.75 * slow + 0.3 * (fast - 0.5) + bias));
  const rain = smoothstep(0.72, 0.92, cloud) * Math.min(1, 0.15 + 1.2 * (planet.climate.damp ?? 0.5));
  const wa = vnoise(planet, 3, t / (14 * H)) * Math.PI * 4, ws = 2 + 9 * vnoise(planet, 4, t / (5 * H)) + 6 * rain;
  const label = rain > 0.5 ? 'rain' : rain > 0.05 ? 'drizzle' : cloud > 0.75 ? 'overcast' : cloud > 0.45 ? 'cloudy' : cloud > 0.2 ? 'fair' : 'clear';
  return { cloud, rain, wind: [Math.cos(wa) * ws, Math.sin(wa) * ws], label };
}
