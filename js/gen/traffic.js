// Through-traffic: speeders running the roads out of town and the town's main roads, in
// both directions, keeping to the right. Pure in time — where each one is at t follows
// from the road and a hash — so traffic needs no saving and is the same for everyone.
// Ambient only: nobody in it is a resident, and it doesn't collide.
import { hashInts, hashStr } from '../core/hash.js';
import { outRoutes } from './highways.js';
import { VEHICLE_COLOURS, TYPES } from './vehicles.js';
const MIX = Object.values(TYPES).map(T => [T.id, T.w * (T.kind === 'truck' || T.kind === 'van' ? 1.6 : 1)]);
const pickBy = x => { const tot = MIX.reduce((a, m) => a + m[1], 0); let q = x * tot; for (const [id, w] of MIX) { q -= w; if (q < 0) return id; } return MIX[0][0]; };

const cache = new Map();
function lanes(planet, s) {
  const ck = planet.universeSeed.join(':') + '|' + s.key;
  if (cache.has(ck)) return cache.get(ck);
  const out = [];
  const lane = (pts, ys, speed, n, key) => {             // pts: [[x, z]] world; ys: heights per point
    const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    for (let k = 0; k < n; k++) for (const dir of [1, -1]) {
      const h = j => hashInts(planet.universeSeed[1] ^ 0x77a1, [hashStr(6, key), k, dir, j]) / 4294967296;
      const type = pickBy(h(4)), T = TYPES[type];
      out.push({ pts, ys, cum, L: cum.at(-1), dir, type, speed: Math.min(speed * (0.8 + 0.4 * h(1)), T.top * 0.8), phase: h(2), colour: Math.floor(h(3) * VEHICLE_COLOURS), id: `tr:${key}:${k}:${dir}` });
    }
  };
  for (const r of outRoutes(planet, s)) lane(r.pts, r.h, 24, Math.max(1, Math.floor(r.length / 300)), 'r' + r.id);
  s.roads.forEach((r, i) => {
    if (!r.arterial) return;
    const a = s.toWorld(...r.a), b = s.toWorld(...r.b), len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    lane([a, b], [s.h, s.h], 11, Math.max(1, Math.floor(len / 110)), 'a' + i);
  });
  cache.set(ck, out);
  return out;
}

// Vehicles within R of (x, z) at time t: [{ id, pos, facing, colour, speed }]
export function trafficNear(planet, s, t, x, z, R = 500) {
  const res = [];
  for (const v of lanes(planet, s)) {
    const span = v.L / v.speed;                                  // seconds for one pass
    let d = (((t / span + v.phase) % 1) + 1) % 1 * v.L;
    if (v.dir < 0) d = v.L - d;
    if (v.ys.length === 2 && (d < 12 || d > v.L - 12)) continue;     // town road: appear/leave at the junctions, not mid-street
    let i = 1; while (i < v.cum.length - 1 && v.cum[i] < d) i++;
    const A = v.pts[i - 1], B = v.pts[i], f = v.cum[i] > v.cum[i - 1] ? (d - v.cum[i - 1]) / (v.cum[i] - v.cum[i - 1]) : 0;
    const dx = (B[0] - A[0]) * v.dir, dz = (B[1] - A[1]) * v.dir, l = Math.hypot(dx, dz) || 1;
    const lane = TYPES[v.type].W / 2 + 0.9, px = A[0] + (B[0] - A[0]) * f - dz / l * lane, pz = A[1] + (B[1] - A[1]) * f + dx / l * lane;      // keep right
    if ((px - x) ** 2 + (pz - z) ** 2 > R * R) continue;
    const y = v.ys.length === 2 ? v.ys[0] : (v.ys[i - 1] ?? v.ys[0]) + ((v.ys[i] ?? v.ys[0]) - (v.ys[i - 1] ?? v.ys[0])) * f;
    res.push({ id: v.id, type: v.type, pos: [px, y + 0.05, pz], facing: Math.atan2(dx, dz), colour: v.colour, speed: v.speed });
  }
  return res;
}
