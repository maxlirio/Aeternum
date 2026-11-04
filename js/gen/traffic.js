// Through-traffic: speeders running the roads out of town and the town's main roads, in
// both directions, keeping to the right. Pure in time — where each one is at t follows
// from the road and a hash — so traffic needs no saving and is the same for everyone.
// Nobody in it is a resident; it doesn't stop for you, and being hit by it hurts (struckBy).
import { hashInts, hashStr } from '../core/hash.js';
import { outRoutes } from './highways.js';
import { VEHICLE_COLOURS, TYPES } from './vehicles.js';
const MIX = Object.values(TYPES).map(T => [T.id, T.w * (T.kind === 'truck' || T.kind === 'van' ? 1.6 : 1)]);
const pickBy = x => { const tot = MIX.reduce((a, m) => a + m[1], 0); let q = x * tot; for (const [id, w] of MIX) { q -= w; if (q < 0) return id; } return MIX[0][0]; };

const cache = new Map();
const LAT = 2.3;                     // lane centre, off the road's centre line
const ROAD_PACE = 15;                  // road traffic keeps one pace (so nothing drives through the car ahead)
// A road's traffic is one loop: out along the right of the road, a U-turn at the far end, back
// along the other side. Nobody appears or vanishes anywhere; only time moves them round.
function lanes(planet, s) {
  const ck = planet.universeSeed.join(':') + '|' + s.key;
  if (cache.has(ck)) return cache.get(ck);
  const out = [];
  const loop = (pts, ys, speed, gap, key) => {
    const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const L = cum.at(-1), P = 2 * L + 2 * Math.PI * LAT, n = Math.max(1, Math.floor(P / gap)), cars = [];
    for (let k = 0; k < n; k++) {
      const h = j => hashInts(planet.universeSeed[1] ^ 0x77a1, [hashStr(6, key), k, j]) / 4294967296;
      cars.push({ type: pickBy(h(4)), colour: Math.floor(h(3) * VEHICLE_COLOURS), off: (k + 0.6 * h(2)) * P / n, id: `tr:${key}:${k}` });
    }
    out.push({ pts, ys, cum, L, P, speed, cars });
  };
  // the arterial runs through town as one road per axis, joined to the roads out where they meet it
  const routes = outRoutes(planet, s).slice();
  for (const axis of [0, 1]) {
    const segs = s.roads.filter(r => r.arterial && (axis ? r.a[0] === r.b[0] : r.a[1] === r.b[1]));
    if (!segs.length) continue;
    const at = q => (axis ? q[1] : q[0]), xs = [...new Set(segs.flatMap(r => [at(r.a), at(r.b)]))].sort((a, b) => a - b);
    let pts = xs.map(x => s.toWorld(...(axis ? [segs[0].a[0], x] : [x, segs[0].a[1]]))), ys = xs.map(() => s.h);
    for (const end of [0, 1]) {
      const E = end ? pts.at(-1) : pts[0];
      const ri = routes.findIndex(r => Math.hypot(r.pts[0][0] - E[0], r.pts[0][1] - E[1]) < 30 || Math.hypot(r.pts.at(-1)[0] - E[0], r.pts.at(-1)[1] - E[1]) < 30); if (ri < 0) continue;
      const r = routes.splice(ri, 1)[0], fromStart = Math.hypot(r.pts[0][0] - E[0], r.pts[0][1] - E[1]) < 30;
      const P = fromStart ? r.pts : r.pts.slice().reverse(), H = fromStart ? r.h : r.h.slice().reverse();     // running away from town
      if (end) { pts = pts.concat(P); ys = ys.concat(H); } else { pts = P.slice().reverse().concat(pts); ys = H.slice().reverse().concat(ys); }
    }
    loop(pts, ys, ROAD_PACE, 130, 'art' + axis);
  }
  for (const r of routes) loop(r.pts, r.h, ROAD_PACE, 170, 'r' + r.id);
  cache.set(ck, out);
  return out;
}

// Vehicles within R of (x, z) at time t: [{ id, type, pos, facing, colour, speed }]
export function trafficNear(planet, s, t, x, z, R = 500) {
  const res = [];
  for (const v of lanes(planet, s)) for (const c of v.cars) {
    const q = (((t * v.speed + c.off) % v.P) + v.P) % v.P, arc = Math.PI * LAT, turnFar = q >= v.L && q < v.L + arc, back = q >= v.L + arc && q < 2 * v.L + arc, turnNear = q >= 2 * v.L + arc;
    const d = turnFar ? v.L : turnNear ? 0 : back ? v.L - (q - v.L - arc) : q;
    let i = 1; while (i < v.cum.length - 1 && v.cum[i] < d) i++;
    const A = v.pts[i - 1], B = v.pts[i], f = v.cum[i] > v.cum[i - 1] ? (d - v.cum[i - 1]) / (v.cum[i] - v.cum[i - 1]) : 0;
    let ux = B[0] - A[0], uz = B[1] - A[1]; const l = Math.hypot(ux, uz) || 1; ux /= l; uz /= l;     // along the road, outbound
    const rx = -uz, rz = ux, cx = A[0] + (B[0] - A[0]) * f, cz = A[1] + (B[1] - A[1]) * f;             // its right-hand side
    let px, pz, fx, fz;
    if (turnFar) { const th = (q - v.L) / LAT, c0 = Math.cos(th), s0 = Math.sin(th); px = cx + (rx * c0 + ux * s0) * LAT; pz = cz + (rz * c0 + uz * s0) * LAT; fx = -rx * s0 + ux * c0; fz = -rz * s0 + uz * c0; }
    else if (turnNear) { const th = (q - 2 * v.L - arc) / LAT, c0 = Math.cos(th), s0 = Math.sin(th); px = cx + (-rx * c0 - ux * s0) * LAT; pz = cz + (-rz * c0 - uz * s0) * LAT; fx = rx * s0 - ux * c0; fz = rz * s0 - uz * c0; }
    else if (back) { px = cx - rx * LAT; pz = cz - rz * LAT; fx = -ux; fz = -uz; }
    else { px = cx + rx * LAT; pz = cz + rz * LAT; fx = ux; fz = uz; }
    if ((px - x) ** 2 + (pz - z) ** 2 > R * R) continue;
    const y = (v.ys[i - 1] ?? v.ys[0]) + ((v.ys[i] ?? v.ys[0]) - (v.ys[i - 1] ?? v.ys[0])) * f;
    res.push({ id: c.id, type: c.type, pos: [px, y + 0.05, pz], facing: Math.atan2(fx, fz), colour: c.colour, speed: v.speed });
  }
  return res;
}

// Is someone standing at (x, y, z) inside this vehicle's box? (Its box is logical: type L, W, H.)
export function struckBy(v, x, y, z, r = 0.32) {
  const T = TYPES[v.type] || TYPES.speeder, dx = x - v.pos[0], dz = z - v.pos[2], fx = Math.sin(v.facing), fz = Math.cos(v.facing);
  if (y + 1.7 < v.pos[1] || y > v.pos[1] + T.H) return false;
  return Math.abs(dx * fx + dz * fz) <= T.L / 2 + r && Math.abs(dx * fz - dz * fx) <= T.W / 2 + r;
}

// Air traffic: ships crossing the sky over a town on straight lanes at a few altitudes,
// in both directions, every design in the catalogue. Pure in time, like the road traffic.
import { LAYOUTS } from './ships.js';
const AIR = Object.keys(LAYOUTS).filter(k => k !== 'patrol');
export function airTraffic(planet, s, t, x, z, R = 4000) {
  const out = [], seed = planet.universeSeed[1] ^ 0x41a7;
  for (let k = 0; k < 14; k++) {
    const h = j => hashInts(seed, [hashStr(6, s.key), k, j]) / 4294967296;
    const ang = h(1) * Math.PI, off = (h(2) - 0.5) * 2400, alt = s.h + 160 + 520 * h(3), speed = 70 + 110 * h(4), span = 9000;
    const model = AIR[Math.floor(h(5) * AIR.length)], dir = h(6) < 0.5 ? 1 : -1;
    const along = ((t * speed / span + h(7)) % 1) * span - span / 2;
    const ux = Math.cos(ang), uz = Math.sin(ang);
    const px = s.cx + ux * along * dir - uz * off, pz = s.cz + uz * along * dir + ux * off;
    if ((px - x) ** 2 + (pz - z) ** 2 > R * R) continue;
    out.push({ id: `air:${k}`, model, c: [px, alt, pz], facing: Math.atan2(ux * dir, uz * dir), colour: Math.floor(h(8) * 7), pitch: 0, roll: 0, rampDown: false });
  }
  return out;
}
