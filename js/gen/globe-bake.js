// The whole planet's surface as pictures, one for each face of the unfolded globe, worked out on a
// background thread: what you see from high up, made from the same land you walk on.
import { Address } from '../core/address.js';
import { makePlanet } from './planet.js';
import { globeOf, geoAt } from './globe.js';
import { rawHeight, moisture } from './terrain.js';
import { groundAt } from './land.js';
import { smoothstep } from '../core/noise.js';

self.onmessage = ({ data: { universe, address, sizes } }) => {
  const planet = makePlanet(universe, Address.parse(address)), G = globeOf(planet), C = planet.climate, W = new Float32Array(16), col = [0, 0, 0];
  for (const n of sizes) for (const F of G.faces) {
    const data = new Uint8ClampedArray(n * n * 4), H = new Float32Array(n * n), step = G.L / n;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) H[j * n + i] = rawHeight(planet, F.x + (i + 0.5 - n / 2) * step, F.z + (j + 0.5 - n / 2) * step);
    for (let j = 0; j < n; j++) { const lat = j % 16 === 0 ? null : 0; for (let i = 0; i < n; i++) {
      const x = F.x + (i + 0.5 - n / 2) * step, z = F.z + (j + 0.5 - n / 2) * step, h = H[j * n + i], k = (j * n + i) * 4;
      const g = (i & 7) === 0 && (j & 7) === 0 || n <= 128 ? geoAt(planet, x, z) : null; if (g) F.lastLat = g.lat; const cold = smoothstep(0.95, 1.3, Math.abs(g ? g.lat : (F.lastLat ?? 0)));
      if (h < planet.seaLevel) {
        const d = smoothstep(0, -220, h), ice = smoothstep(1.2, 1.38, Math.abs(g ? g.lat : (F.lastLat ?? 0)));
        data[k] = (14 + 18 * (1 - d)) * (1 - ice) + 225 * ice; data[k + 1] = (40 + 62 * (1 - d)) * (1 - ice) + 232 * ice; data[k + 2] = (74 + 58 * (1 - d)) * (1 - ice) + 240 * ice; data[k + 3] = 255 * (1 - ice);
        continue;
      }
      const m = moisture(planet, x, z); groundAt(planet, x, z, 0.95, m, W, col);
      // lit from one side, so ranges stand out from orbit
      const hx = H[j * n + Math.min(n - 1, i + 1)] - H[j * n + Math.max(0, i - 1)], hz = H[Math.min(n - 1, j + 1) * n + i] - H[Math.max(0, j - 1) * n + i], shade = Math.max(0.55, Math.min(1.35, 1 + (hx + hz) / step * 9));
      const high = smoothstep(C.treeline, C.treeline + 500, h), snow = Math.max(cold, high * 0.8);
      for (let q = 0; q < 3; q++) { const c = Math.pow(Math.max(0, col[q]), 0.72) * shade; data[k + q] = Math.min(255, (c * (1 - snow) + 0.93 * snow) * 255); }
      data[k + 3] = 0;
    } }
    // A sample every few km lands on peak or valley at random, so the land comes out as gravel: soften it to what that much land averages to.
    if (n > 128) for (let pass = 0; pass < 2; pass++) for (const st of [4, n * 4]) { const o = data.slice(); for (let k = 0; k < data.length; k += 4) { const a = k - st >= 0 ? k - st : k, b = k + st < data.length ? k + st : k; for (let q = 0; q < 3; q++) data[k + q] = (o[a + q] + 2 * o[k + q] + o[b + q]) / 4; } }
    self.postMessage({ face: F.i, n, data }, [data.buffer]);
  }
  self.postMessage({ done: true });
};
