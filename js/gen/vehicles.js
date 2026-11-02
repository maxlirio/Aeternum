// Speeder bikes parked around town. Pure: who owns one and where it stands is a function
// of the generated town, like the furniture. A bike is logical data — an owner, a spot,
// a heading, a colour — and its size (SPEEDER) is the only shape gameplay knows; the
// model (assets/props.glb 'speeder') is fitted to that box.
//   households: about one in three keep a bike outside their building
//   hangars: the dealer, with bikes for sale out front
import { Rng } from '../core/prng.js';
import { derive, hashStr } from '../core/hash.js';
import { buildingPlan } from './building.js';
import { buildingToWorld } from './place.js';
import { getPopulation } from './population.js';

export const SPEEDER = {
  L: 2.6, W: 1.0, H: 1.05,        // the box the model fills (m); origin on the ground at its centre
  seat: 0.86,                     // saddle height above the ground line
  price: 1800,                    // new, from a dealer (cr)
};
export const VEHICLE_COLOURS = 7;   // render/props.js PAINTS_VEHICLE

const cache = new Map();
export function parkedVehicles(planet, s) {
  const ck = planet.universeSeed.join(':') + '|' + s.key;
  if (cache.has(ck)) return cache.get(ck);
  const pop = getPopulation(planet, s), rng = new Rng(derive(planet.universeSeed, 'vehicles', [hashStr(5, s.key)]));
  const want = new Map();                        // building key → [{ owner, ownerName, forSale }]
  const add = (b, v) => (want.get(b.key) || want.set(b.key, []).get(b.key)).push(v);
  for (const hh of pop.households) {
    if (!rng.chance(0.33)) continue;
    const u = pop.unitByKey.get(hh.unit);
    add(u.b, { owner: 'hh:' + hh.id, ownerName: `the ${hh.surname} household`, home: hh.unit });
  }
  for (const b of s.buildings) if (b.type === 'hangar') for (let i = 0; i < 3; i++) add(b, { owner: 'dealer:' + b.key, ownerName: b.owner, forSale: true });
  const out = [];
  for (const b of s.buildings) {
    const list = want.get(b.key); if (!list) continue;
    const spots = spotsBy(planet, s, b);
    list.forEach((v, i) => {
      const sp = spots[i]; if (!sp) return;
      out.push({ id: `${b.key}~${i}`, kind: 'speeder', b: b.key, ...v, pos: sp.pos, facing: sp.facing, colour: rng.int(0, VEHICLE_COLOURS - 1) });
    });
  }
  cache.set(ck, out);
  return out;
}

// Parking spots along a building's front, backed in (nose to the street), clear of its door and of other lots.
function spotsBy(planet, s, b) {
  const plan = buildingPlan(planet, s, b), d = plan.doors[plan.entrance], spots = [];
  const facing = (() => { const a = buildingToWorld(s, b, 0, 0, -1), c = buildingToWorld(s, b, 0, 0, 0); return Math.atan2(a[0] - c[0], a[2] - c[2]); })();
  const free = (lx, lz) => {
    const u = b.O[0] + b.ex[0] * lx + b.ez[0] * lz, v = b.O[1] + b.ex[1] * lx + b.ez[1] * lz;
    if (Math.hypot(u, v) > s.R - 3) return false;
    return !s.buildings.some(o => o !== b && u > o.rect[0] - 2 && u < o.rect[2] + 2 && v > o.rect[1] - 2 && v < o.rect[3] + 2);
  };
  for (let k = 0; k < 24 && spots.length < 8; k++) {
    const side = k % 2 ? 1 : -1, lx = d.x + side * (2.4 + 1.4 * Math.floor(k / 2));
    if (lx < 0.8 || lx > b.w - 0.8) continue;
    const lz = -(SPEEDER.L / 2 + 0.5);
    if (!free(lx, lz)) continue;
    spots.push({ pos: buildingToWorld(s, b, lx, 0, lz).map((c, i) => i === 1 ? s.h : c), facing });
  }
  return spots;
}
