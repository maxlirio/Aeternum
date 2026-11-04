// The megacity's moving life, as pure functions of (city, time): stacked air lanes over
// the avenues and boulevards (Coruscant-style streams at several altitudes), hover-cars on
// the streets, and people walking the sidewalks round each block. Nothing is stored and
// nothing is simulated step by step: where a vehicle or walker is at time t is closed
// form, so it is the same however the frames are sliced, and costs only what is near.
import { hash01 } from '../core/hash.js';
import { lineAt, lineWidth, lineKind, PITCH, CURB, blockIndex, cityBlock, rimAt } from './city.js';

const AIR = { boulevard: [42, 78, 130, 205, 300], avenue: [48, 96, 160] };
const AIR_TYPES = ['sedan', 'coupe', 'wedge', 'taxi', 'limo', 'compact', 'estate', 'racer', 'speeder', 'minibus', 'van', 'buggy'];
// the upper lanes carry ships: small craft of every class (gen/ships.js layouts)
export const SKY_SHIPS = ['runabout0', 'runabout1', 'runabout2', 'racer0', 'racer1', 'racer2', 'courier', 'yacht', 'ferry0', 'ferry1', 'ferry2', 'dropship0', 'dropship1',
  'explorer0', 'explorer1', 'explorer2', 'shuttle', 'hauler0', 'hauler1', 'miner0', 'gunship1', 'patrol'];
const GROUND_TYPES = ['sedan', 'compact', 'taxi', 'van', 'truck', 'speeder', 'estate', 'pickup', 'minibus', 'hauler', 'coupe', 'tanker'];

const laneCache = new WeakMap();
// Each lane is a loop: along the right of a street, a U-turn at its end, back along the other
// side, a U-turn at the near end. So nothing appears or vanishes. { axis (0: runs along v at u = at; 1: along u at v = at),
// at, off (lane centre off the street's centre), alt, altBack, speed, gap, a0, a1, L, P, key }
export function cityLanes(city) {
  if (laneCache.has(city)) return laneCache.get(city);
  const out = [], n = Math.ceil(city.R / PITCH) + 1;
  for (const axis of [0, 1]) for (let i = -n; i <= n; i++) {
    const at = lineAt(city, axis, i);
    if (Math.abs(at) > city.R * 0.9) continue;
    const half = Math.sqrt(Math.max(0, (city.R * 0.86) ** 2 - at * at)), kind = lineKind(i), w = lineWidth(i);
    if (half < 300) continue;
    const add = (alt, altBack, off, speed, gap, ground, ships) => { const L = 2 * half, P = 2 * L + 2 * Math.PI * off; out.push({ axis, at, off, alt, altBack, speed, gap, a0: -half, a1: half, L, P, n: Math.floor(P / gap), key: out.length, ground, ships, kind }); };
    // on the street, keeping right: one or two lanes each way. (Each street keeps one pace per lane.)
    const lanes = kind === 'street' ? 1 : 2;
    for (let k = 0; k < lanes; k++) add(0.45, 0.45, w / 4 + (k - (lanes - 1) / 2) * 3.4, 13 + 6 * hash01(city.seed, [axis, i, k, 1]), 55 + 50 * hash01(city.seed, [axis, i, k, 9]), true, false);
    // the sky lanes above the wider streets: tighter, faster streams going up
    for (const alt of AIR[kind] || []) {
      if (hash01(city.seed, [axis, i, alt, 3]) < 0.25) continue;
      const ships = alt >= 120;
      add(alt, alt + (ships ? 14 : 7), ships ? 13 : 7, 34 + alt * 0.12 + 14 * hash01(city.seed, [axis, i, alt, 1]), (ships ? 110 : 38) + (ships ? 90 : 30) * hash01(city.seed, [axis, i, alt]), false, ships);
    }
  }
  laneCache.set(city, out);
  return out;
}
export const lanePhase = (city, L) => L.ph ??= hash01(city.seed, [L.key, 77]) * L.P;

// Where along its loop a vehicle is: sets Q.u, Q.v (city-local), Q.alt, Q.du, Q.dv (heading).
// (One shared result object: this runs for tens of thousands of vehicles a frame.)
export const Q = { u: 0, v: 0, alt: 0, du: 0, dv: 0 };
export function loopPoint(L, s) {
  // outbound along +v (axis 0) or +u (axis 1). Your right is -u heading +v, and +v heading +u.
  const sr = L.axis ? 1 : -1, arc = Math.PI * L.off;
  let a, lat, h, t = 1, n = 0;
  if (s < L.L) { a = L.a0 + s; lat = sr * L.off; h = L.alt; }
  else if (s < L.L + arc) { const th = (s - L.L) / L.off, c = Math.cos(th), si = Math.sin(th); a = L.a1 + si * L.off; lat = sr * c * L.off; h = L.alt + (L.altBack - L.alt) * (th / Math.PI); t = c; n = -si * sr; }
  else if (s < 2 * L.L + arc) { a = L.a1 - (s - L.L - arc); lat = -sr * L.off; h = L.altBack; t = -1; }
  else { const th = (s - 2 * L.L - arc) / L.off, c = Math.cos(th), si = Math.sin(th); a = L.a0 - si * L.off; lat = -sr * c * L.off; h = L.altBack + (L.alt - L.altBack) * (th / Math.PI); t = -c; n = si * sr; }
  if (L.axis) { Q.u = a; Q.v = L.at + lat; Q.du = t; Q.dv = n; } else { Q.u = L.at + lat; Q.v = a; Q.du = n; Q.dv = t; }
  Q.alt = h;
  return Q;
}

// Call fn(vehicle) for each vehicle on the lanes at time t (world coordinates), optionally
// only those within r of (x, z). vehicle: { id, type, ship, pos:[x, y, z], facing, colour, air, speed }
export function cityTraffic(city, t, fn, x = 0, z = 0, r = Infinity) {
  const lanes = cityLanes(city), base = city.h + CURB;
  const [qu, qv] = r < Infinity ? city.toLocal(x, z) : [0, 0];
  const cs = city.cos, sn = city.sin;
  for (const L of lanes) {
    if (r < Infinity && Math.abs((L.axis ? qv : qu) - L.at) > r + L.off + 1) continue;      // not near this street at all
    const ph = lanePhase(city, L) + L.speed * t;
    for (let k = 0; k < L.n; k++) {
      loopPoint(L, ((k * L.gap + ph) % L.P + L.P) % L.P);
      if (r < Infinity && (Math.abs(Q.u - qu) > r || Math.abs(Q.v - qv) > r)) continue;
      const h = hash01(city.seed, [L.key, k]), T = L.ground ? GROUND_TYPES : L.ships ? SKY_SHIPS : AIR_TYPES, type = T[Math.floor(h * T.length)];
      fn({ id: `ct:${L.key}:${k}`, type, ship: L.ships ? type : null, pos: [city.cx + Q.u * cs - Q.v * sn, base + Q.alt - (L.ground ? CURB : 0) + (L.ground ? 0 : Math.sin(t * 0.7 + k) * 0.6), city.cz + Q.u * sn + Q.v * cs],
        facing: Math.atan2(Q.du * cs - Q.dv * sn, Q.du * sn + Q.dv * cs), colour: Math.floor(h * 997), air: !L.ground, speed: L.speed });
    }
  }
}

// People on the sidewalks of the blocks near (x, z): each block has a few walkers going
// round its kerb ring, some each way, at walking pace. → [{ id, pos, facing, moving, age }]
const WALKERS = { spire: 18, commerce: 16, housing: 8, market: 26, undercity: 14, industry: 3, port: 4, park: 10 };
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
