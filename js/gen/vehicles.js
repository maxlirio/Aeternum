// Vehicles parked around town: bikes, hover cars, vans, trucks (assets/vehicles.json).
// Pure: who owns what and where it stands is a function of the generated town. A vehicle
// is logical data — a type, an owner, a spot, a heading, a colour — and its type's box
// (L, W, H, seat, top speed) is the only shape gameplay knows; each model is fitted to it.
//   households: about half keep something outside — mostly cars and bikes
//   workshops and stores: a van, pickup or truck at the door
//   hangars: the dealer, with a mix for sale out front
import { Rng } from '../core/prng.js';
import { derive, hashStr } from '../core/hash.js';
import { buildingPlan } from './building.js';
import { buildingToWorld } from './place.js';
import { getPopulation } from './population.js';
import CAT from '../../assets/vehicles.json' with { type: 'json' };

export const TYPES = Object.fromEntries(CAT.types.map(v => [v.id, v]));
const pickType = (rng, kinds) => { const list = CAT.types.filter(v => kinds.includes(v.kind)); return rng.weighted(list.map(v => [v.id, v.w])); };
export const typeOf = v => TYPES[v.type || 'speeder'];

export const SPEEDER = { L: 2.6, W: 1.0, H: 1.05, seat: 0.86, price: 1800 };   // (the original bike; kept for old saves and tests)
export const VEHICLE_COLOURS = 7;   // render/props.js PAINTS_VEHICLE

const cache = new Map();
export function parkedVehicles(planet, s) {
  const ck = planet.universeSeed.join(':') + '|' + s.key;
  if (cache.has(ck)) return cache.get(ck);
  const pop = getPopulation(planet, s), rng = new Rng(derive(planet.universeSeed, 'vehicles', [hashStr(5, s.key)]));
  const want = new Map();                        // building key → [{ type, owner, ownerName, forSale }]
  const add = (b, v) => (want.get(b.key) || want.set(b.key, []).get(b.key)).push(v);
  for (const hh of pop.households) {
    if (!rng.chance(0.5)) continue;
    const u = pop.unitByKey.get(hh.unit);
    add(u.b, { type: pickType(rng, rng.chance(0.4) ? ['bike'] : ['car']), owner: 'hh:' + hh.id, ownerName: `the ${hh.surname} household`, home: hh.unit });
  }
  for (const b of s.buildings) {
    if (b.type === 'workshop' || b.type === 'store') for (let i = rng.int(0, 2); i > 0; i--) add(b, { type: pickType(rng, b.type === 'workshop' ? ['truck', 'van'] : ['van', 'truck', 'car']), owner: 'firm:' + b.key, ownerName: b.owner });
    if (b.type === 'hangar') for (const kinds of [['bike'], ['bike'], ['car'], ['car'], ['car'], ['van', 'truck']]) add(b, { type: pickType(rng, kinds), owner: 'dealer:' + b.key, ownerName: b.owner, forSale: true });
  }
  const out = [];
  for (const b of s.buildings) {
    const list = want.get(b.key); if (!list) continue;
    let i = 0;
    for (const sp of parkAlong(planet, s, b, list.map(v => TYPES[v.type]))) {
      const v = list[sp.i], T = TYPES[v.type];
      out.push({ id: `${b.key}~${i++}`, kind: T.kind, b: b.key, ...v, pos: sp.pos, facing: sp.facing, colour: T.paint ? -1 : rng.int(0, VEHICLE_COLOURS - 1) });
    }
  }
  cache.set(ck, out);
  return out;
}

// Spots along a building's front for a list of vehicle types: bikes backed in (nose to the
// street), anything longer parked alongside the facade; clear of the door and of other lots.
function parkAlong(planet, s, b, types) {
  const plan = buildingPlan(planet, s, b), d = plan.doors[plan.entrance], spots = [];
  const outward = (() => { const a = buildingToWorld(s, b, 0, 0, -1), c = buildingToWorld(s, b, 0, 0, 0); return Math.atan2(a[0] - c[0], a[2] - c[2]); })();
  const along = (() => { const a = buildingToWorld(s, b, 1, 0, 0), c = buildingToWorld(s, b, 0, 0, 0); return Math.atan2(a[0] - c[0], a[2] - c[2]); })();
  const free = (lx, lz) => {
    const u = b.O[0] + b.ex[0] * lx + b.ez[0] * lz, v = b.O[1] + b.ex[1] * lx + b.ez[1] * lz;
    if (Math.hypot(u, v) > s.R - 3) return false;
    return !s.buildings.some(o => o !== b && u > o.rect[0] - 2 && u < o.rect[2] + 2 && v > o.rect[1] - 2 && v < o.rect[3] + 2);
  };
  const doorA = d.x - d.width / 2 - 1.2, doorB = d.x + d.width / 2 + 1.2;
  let x = 0.6;
  types.forEach((T, i) => {
    const bike = T.kind === 'bike', span = bike ? T.W + 0.5 : T.L + 0.8, depth = bike ? T.L : T.W;
    if (x < doorB && x + span > doorA) x = doorB;
    if (x + span > b.w - 0.4) return;
    const cx = x + span / 2, lz = -(depth / 2 + 0.45);
    if (free(cx - span / 2, lz) && free(cx + span / 2, lz)) spots.push({ i, pos: buildingToWorld(s, b, cx, 0, lz).map((c, k) => k === 1 ? s.h : c), facing: bike ? outward : along });
    x += span;
  });
  return spots;
}
