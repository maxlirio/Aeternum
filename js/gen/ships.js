// Ships. One shuttle stands on each landing pad: most belong to a business in town, the
// one on the first pad is for sale. A ship is logical data like a building — a frame,
// a plan (deck, hull walls, ramp, rooms, furniture, the pilot's seat) read from its
// layout file — so the collision world, furniture and theft work in it unchanged, and
// the model (tools/assets/build.py) is built to fit the same layout.
import SHUTTLE from '../../assets/ships/shuttle.json' with { type: 'json' };
import { Rng } from '../core/prng.js';
import { derive, hashStr } from '../core/hash.js';

export const LAYOUTS = { shuttle: SHUTTLE };
export const SHIP_PRICE = 9500;
const PAD = 22;

// The layout as a building-format plan (gen/building.js), in the ship's frame.
const plans = new Map();
export function shipPlan(model = 'shuttle') {
  if (plans.has(model)) return plans.get(model);
  const L = LAYOUTS[model], [hx0, hz0, hx1, hz1] = L.hull, y0 = 0, y1 = L.ceiling, T = 0.2;
  const door = id => L.doors[id];
  const opening = (id, along) => { const d = door(id), c = along === 'x' ? d.x : d.z; return { kind: 'door', door: id, a: c - d.width / 2, b: c + d.width / 2, y0: L.deck, y1: L.ceiling }; };
  const wall = (x0, z0, x1, z1, openings = [], side = '') => ({ x0, z0, x1, z1, t: T, y0, y1, k: 0, exterior: false, side, openings });
  const walls = [
    wall(hx0, hz0, hx1, hz0, [opening(0, 'x')], 'back'), wall(hx0, hz1, hx1, hz1, [], 'front'),
    wall(hx0, hz0, hx0, hz1, [], 'left'), wall(hx1, hz0, hx1, hz1, [], 'right'),
    ...L.partitions.map(p => wall(hx0, p.z, hx1, p.z, [opening(p.door, 'x')], 'inner')),
  ];
  const rooms = L.rooms.map(r => ({ i: r.i, k: 0, purpose: r.purpose, label: r.label, rect: r.rect.slice(), doors: L.doors.filter(d => d.rooms.includes(r.i)).map(d => d.id) }));
  const props = L.props.map(p => ({ kind: p.kind, k: 0, x0: p.x0, z0: p.z0, x1: p.x1, z1: p.z1, y: L.deck, h: p.h, face: p.face, room: p.room, ...(p.soft ? { soft: true } : {}) }));
  const anchors = L.seats.map(a => {
    const r = rooms.find(q => q.i === L.props[a.prop].room);
    return { kind: a.kind, pose: a.pose, k: 0, x: a.x, y: L.deck + (a.top || 0), z: a.z, facing: a.facing, prop: a.prop, slots: 1, room: r.i, purpose: r.purpose };
  });
  const plan = {
    key: 'ship:' + model, type: 'ship', w: L.W, d: L.D, F: 1, H: L.H, walls, windows: [], units: [],
    slabs: [{ k: 0, y: L.deck, rects: [L.hull.slice()] }, { k: 0, y: L.ceiling + 0.2, roof: true, rects: [L.hull.slice()] }],
    ramps: [{ k: 0, x0: L.ramp.x0, x1: L.ramp.x1, z0: L.ramp.z0, z1: L.ramp.z1, y0: 0, y1: L.deck }],
    rooms, props, anchors, doors: L.doors.map(d => ({ ...d, k: 0, axis: 'x', height: L.ceiling })), entrance: 0,
    layout: L,
  };
  plans.set(model, plan);
  return plan;
}

// The ships parked in a town at the epoch: one per pad.
const cache = new Map();
export function shipsAt(planet, s) {
  const ck = planet.universeSeed.join(':') + '|' + s.key;
  if (cache.has(ck)) return cache.get(ck);
  const rng = new Rng(derive(planet.universeSeed, 'ships', [hashStr(9, s.key)]));
  const firms = s.buildings.filter(b => (b.type === 'hangar' || b.type === 'workshop' || b.type === 'store') && b.owner);
  const out = s.pads.map((pad, i) => {
    const firm = firms.length ? rng.pick(firms) : null, L = LAYOUTS.shuttle;
    // centred on the pad, ramp toward the road (the pad's ez points away from it)
    const O = [pad.O[0] + pad.ex[0] * (PAD - L.W) / 2 + pad.ez[0] * (PAD - L.D) / 2, pad.O[1] + pad.ex[1] * (PAD - L.W) / 2 + pad.ez[1] * (PAD - L.D) / 2];
    return { id: `ship:${s.key}:${pad.n}`, model: 'shuttle', pad: pad.n, O, ex: pad.ex.slice(), ez: pad.ez.slice(),
      name: shipName(rng), colour: rng.int(0, 6),
      ...(i === 0 || !firm ? { owner: 'dealer', ownerName: 'a private seller', forSale: true } : { owner: 'firm:' + firm.key, ownerName: firm.owner, firmB: firm.key }) };
  });
  cache.set(ck, out);
  return out;
}

const NAMES_A = ['Quiet', 'Long', 'Red', 'Patient', 'Second', 'Brass', 'Late', 'Northern', 'Grey', 'Lucky', 'Small', 'Far'];
const NAMES_B = ['Heron', 'Margin', 'Ledger', 'Kestrel', 'Promise', 'Lantern', 'Harvest', 'Wake', 'Anvil', 'Courier', 'Errand', 'Tide'];
function shipName(rng) { return `${rng.pick(NAMES_A)} ${rng.pick(NAMES_B)}`; }
