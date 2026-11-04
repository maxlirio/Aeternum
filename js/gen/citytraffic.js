// People on the pavements of the blocks near you, walking round each block's kerb ring: pure in
// time. (The city's vehicles have drivers and destinations of their own: gen/cityfleet.js.)
import { hash01 } from '../core/hash.js';
import { CURB, blockIndex, cityBlock } from './city.js';

// People on the sidewalks of the blocks near (x, z): each block has a few walkers going
// round its kerb ring, some each way, at walking pace. → [{ id, pos, facing, moving, age }]
const WALKERS = { spire: 18, commerce: 16, housing: 8, market: 26, undercity: 14, industry: 3, port: 4, park: 10, works: 4 };
export function cityWalkers(city, t, x, z, r, max = 60) {
  const [u, v] = city.toLocal(x, z), out = [], base = city.h + CURB;
  const [i0, j0] = blockIndex(city, u - r, v - r), [i1, j1] = blockIndex(city, u + r, v + r);
  for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
    const B = cityBlock(city, i, j); if (!B.district) continue;
    const [a0, b0, a1, b1] = B.rect, o = 1.3, W = a1 - a0 - 2 * o, D = b1 - b0 - 2 * o, P = 2 * (W + D);
    const n = WALKERS[B.district] || 6;
    for (let k = 0; k < n; k++) {
      const h = hash01(city.seed, [i, j, k, 41]), dir = h < 0.5 ? 1 : -1, sp = 1.05 + 0.5 * hash01(city.seed, [i, j, k, 42]);
      const lane = o + (dir > 0 ? 0 : 0.9);
      let s = ((k / n * P + dir * sp * t) % P + P) % P;
      let pu, pv, du, dv;
      // round the ring: south edge (+u), east (+v), north (−u), west (−v)
      if (s < W) { pu = a0 + o + s; pv = b0 + lane; du = 1; dv = 0; }
      else if ((s -= W) < D) { pu = a1 - lane; pv = b0 + o + s; du = 0; dv = 1; }
      else if ((s -= D) < W) { pu = a1 - o - s; pv = b1 - lane; du = -1; dv = 0; }
      else { s -= W; pu = a0 + lane; pv = b1 - o - s; du = 0; dv = -1; }
      if (Math.hypot(pu - u, pv - v) > r) continue;
      du *= dir; dv *= dir;
      const wx = du * city.cos - dv * city.sin, wz = du * city.sin + dv * city.cos;
      out.push({ id: `cw:${i}:${j}:${k}`, pos: [city.cx + pu * city.cos - pv * city.sin, base, city.cz + pu * city.sin + pv * city.cos], facing: Math.atan2(wx, wz), moving: true, pose: 'walk', age: 16 + Math.floor(60 * hash01(city.seed, [i, j, k, 43])), d: Math.hypot(pu - u, pv - v) });
    }
  }
  return out.sort((p, q) => p.d - q.d).slice(0, max);
}
