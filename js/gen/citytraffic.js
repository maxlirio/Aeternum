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
// Every lane: { axis (0: runs along v at u = line; 1: along u at v = line), at (the line's
// coordinate), off (lateral), alt (metres above the street), dir (±1), speed, gap, a0, a1, key }
export function cityLanes(city) {
  if (laneCache.has(city)) return laneCache.get(city);
  const out = [], n = Math.ceil(city.R / PITCH) + 1;
  for (const axis of [0, 1]) for (let i = -n; i <= n; i++) {
    const at = lineAt(city, axis, i);
    if (Math.abs(at) > city.R * 0.9) continue;
    const half = Math.sqrt(Math.max(0, (city.R * 0.86) ** 2 - at * at)), kind = lineKind(i), w = lineWidth(i);
    if (half < 300) continue;
    const add = (alt, off, dir, speed, gap, ground) => out.push({ axis, at, off, alt, dir, speed, gap, a0: -half, a1: half, key: out.length, ground, kind });
    // on the street: drive on the right, one or two lanes each way
    for (const dir of [1, -1]) {
      const lanes = kind === 'street' ? 1 : 2;
      for (let k = 0; k < lanes; k++) add(0.45, dir * (w / 4 + (k - (lanes - 1) / 2) * 3.4) * (axis ? -1 : 1), dir, 13 + 6 * hash01(city.seed, [axis, i, k, dir]), 55 + 50 * hash01(city.seed, [axis, i, k, 9]), true);
    }
    // the sky lanes above the wider streets: tighter, faster streams going up
    for (const alt of AIR[kind] || []) for (const dir of [1, -1]) {
      if (hash01(city.seed, [axis, i, alt, 3]) < 0.25) continue;
      const ships = alt >= 120;
      add(alt + (dir > 0 ? 0 : (ships ? 14 : 7)), dir * (ships ? 13 : 7) * (axis ? -1 : 1), dir, 34 + alt * 0.12 + 14 * hash01(city.seed, [axis, i, alt, dir]), (ships ? 110 : 38) + (ships ? 90 : 30) * hash01(city.seed, [axis, i, alt]), false);
      out.at(-1).ships = ships;
    }
  }
  laneCache.set(city, out);
  return out;
}

export const lanePhase = (city, L) => L.ph ??= hash01(city.seed, [L.key, 77]) * (L.a1 - L.a0);

// Call fn(vehicle) for each vehicle on the lanes at time t (world coordinates), optionally
// only those within r of (x, z). vehicle: { id, type, pos:[x, y, z], facing, colour, air }
export function cityTraffic(city, t, fn, x = 0, z = 0, r = Infinity) {
  const lanes = cityLanes(city), base = city.h + CURB;
  const [qu, qv] = r < Infinity ? city.toLocal(x, z) : [0, 0];
  const fx = city.cos, fz = city.sin;
  for (const L of lanes) {
    // a lane is a line: skip it whole if it doesn't pass within r
    const lat = L.at + L.off;
    if (r < Infinity && Math.abs((L.axis ? qv : qu) - lat) > r) continue;
    const len = L.a1 - L.a0, n = Math.floor(len / L.gap), phase = lanePhase(city, L);
    // heading: along +v (axis 0) or +u (axis 1), times dir; city local → world
    const du = L.axis ? L.dir : 0, dv = L.axis ? 0 : L.dir;
    const wx = du * fx - dv * fz, wz = du * fz + dv * fx, facing = Math.atan2(wx, wz);
    const along = L.axis ? qu : qv;
    for (let k = 0; k < n; k++) {
      let s = ((k * L.gap + phase + L.dir * L.speed * t) % len + len) % len;
      const a = L.a0 + s;
      if (r < Infinity && Math.abs(a - along) > r) continue;
      const u = L.axis ? a : lat, v = L.axis ? lat : a;
      const h = hash01(city.seed, [L.key, k]);
      const T = L.ground ? GROUND_TYPES : L.ships ? SKY_SHIPS : AIR_TYPES;
      fn({ id: `ct:${L.key}:${k}`, type: T[Math.floor(h * T.length)], ship: L.ships ? T[Math.floor(h * T.length)] : null, pos: [city.cx + u * fx - v * fz, base + L.alt - (L.ground ? CURB : 0) + (L.ground ? 0 : Math.sin(t * 0.7 + k) * 0.6), city.cz + u * fz + v * fx],
        facing, colour: Math.floor(h * 997), air: !L.ground, speed: L.speed });
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
