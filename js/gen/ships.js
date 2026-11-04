// Ships. One shuttle stands on each landing pad: most belong to a business in town, the
// one on the first pad is for sale. A ship is logical data like a building — a frame,
// a plan (deck, hull walls, ramp, rooms, furniture, the pilot's seat) read from its
// layout file — so the collision world, furniture and theft work in it unchanged, and
// the model (tools/assets/build.py) is built to fit the same layout.
import SHUTTLE from '../../assets/ships/shuttle.json' with { type: 'json' };
import FREIGHTER from '../../assets/ships/freighter.json' with { type: 'json' };
import COURIER from '../../assets/ships/courier.json' with { type: 'json' };
import PATROL from '../../assets/ships/patrol.json' with { type: 'json' };
import YACHT from '../../assets/ships/yacht.json' with { type: 'json' };
import CATALOG from '../../assets/ships/catalog.json' with { type: 'json' };
import { surfaceAt } from './surface.js';
import { getPolity } from './polity.js';
import { Rng } from '../core/prng.js';
import { derive, hashStr, hashInts } from '../core/hash.js';
import { dayIndex, dayStart } from './schedule.js';

export const LAYOUTS = { shuttle: SHUTTLE, freighter: FREIGHTER, courier: COURIER, patrol: PATROL, yacht: YACHT, ...CATALOG };
// designs that fit a 22 m pad, and those that need a field
export const PAD_DESIGNS = Object.keys(LAYOUTS).filter(k => LAYOUTS[k].D <= 21 && LAYOUTS[k].W <= 12 && k !== 'patrol' && k !== 'freighter' && k !== 'yacht');
export const FIELD_DESIGNS = Object.keys(CATALOG).filter(k => CATALOG[k].field);
export const SHIP_PRICE = 9500;
export const PRICES = { shuttle: 9500, freighter: 42000, courier: 6800, yacht: 68000, patrol: 0, ...Object.fromEntries(Object.entries(CATALOG).map(([k, d]) => [k, d.price])) };
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
  // pad 0: something for sale; the pad nearest the civic office: their patrol ship; the rest: firms' shuttles and couriers
  const secKey = getPolity(planet, s).security, sec = s.buildings.find(b => b.key === secKey);
  const patrolPad = sec && s.pads.length > 2 ? s.pads.slice(1).sort((a, b) => Math.hypot(a.O[0] - sec.O[0], a.O[1] - sec.O[1]) - Math.hypot(b.O[0] - sec.O[0], b.O[1] - sec.O[1]))[0].n : -1;
  const out = s.pads.map((pad, i) => {
    const firm = firms.length ? rng.pick(firms) : null, model = pad.n === patrolPad ? 'patrol' : rng.pick(PAD_DESIGNS), L = LAYOUTS[model];
    // centred on the pad, ramp toward the road (the pad's ez points away from it)
    const O = [pad.O[0] + pad.ex[0] * (PAD - L.W) / 2 + pad.ez[0] * (PAD - L.D) / 2, pad.O[1] + pad.ex[1] * (PAD - L.W) / 2 + pad.ez[1] * (PAD - L.D) / 2];
    return { id: `ship:${s.key}:${pad.n}`, model, pad: pad.n, O, ex: pad.ex.slice(), ez: pad.ez.slice(),
      name: model === 'patrol' ? 'Patrol ' + (pad.n + 1) : shipName(rng), colour: model === 'patrol' ? 4 : rng.int(0, 6),
      ...(model === 'patrol' ? { owner: 'firm:' + sec.key, ownerName: getPolity(planet, s).securityName, firmB: sec.key, patrol: true }
        : i === 0 || !firm ? { owner: 'dealer', ownerName: 'a private seller', forSale: true } : { owner: 'firm:' + firm.key, ownerName: firm.owner, firmB: firm.key }) };
  });
  // a freighter is too big for a pad: it stands on level open ground just outside town (the cargo field)
  const firm = s.buildings.find(b => b.type === 'hangar') || firms[0];
  const spot = cargoField(planet, s, FREIGHTER);
  if (spot && firm) out.push({ id: `ship:${s.key}:field0`, model: 'freighter', field: true, at: spot, name: shipName(rng), colour: rng.int(0, 6), owner: 'firm:' + firm.key, ownerName: firm.owner, firmB: firm.key });
  // and a yacht on a second field, for sale, in about half the towns
  // more fields further out: a yacht for sale in about half the towns, and two or three working ships
  const taken = spot ? [[spot.c[0], spot.c[2]]] : [];
  const field = (model, extra) => {
    const at = cargoField(planet, s, LAYOUTS[model], taken.map(([x, z]) => [x, z, 45]));
    if (!at) return; taken.push([at.c[0], at.c[2]]);
    out.push({ id: `ship:${s.key}:field${taken.length}`, model, field: true, at, name: shipName(rng), colour: rng.int(0, 6), ...extra });
  };
  if (rng.chance(0.55)) field('yacht', { owner: 'dealer', ownerName: 'a private seller', forSale: true });
  for (let k = rng.int(2, 3); k > 0; k--) { const f2 = firms.length ? rng.pick(firms) : null; field(rng.pick(FIELD_DESIGNS), f2 && rng.chance(0.75) ? { owner: 'firm:' + f2.key, ownerName: f2.owner, firmB: f2.key } : { owner: 'dealer', ownerName: 'a private seller', forSale: true }); }
  cache.set(ck, out);
  return out;
}

// Level ground near the edge of town, off roads, where a ship of this layout fits.
function cargoField(planet, s, L, avoid = []) {
  if (avoid && !Array.isArray(avoid[0])) avoid = avoid ? [avoid] : [];
  let best = null;
  for (let k = 0; k < 1500; k++) {
    const a = k * 2.39996, r = s.R + 40 + (k % 100) * 9;
    const cx = s.cx + Math.cos(a) * r, cz = s.cz + Math.sin(a) * r, facing = a + Math.PI;     // nose toward town
    const fx = Math.sin(facing), fz = Math.cos(facing), rx = -fz, rz = fx;
    const pts = [];
    for (const u of [-0.5, -0.17, 0.17, 0.5]) for (const v of [-0.5, 0, 0.5]) pts.push(surfaceAt(planet, cx + fx * u * L.D + rx * v * L.W, cz + fz * u * L.D + rz * v * L.W));
    if (pts.some(p => p.town > 0.01 || p.road > 0.01 || p.h < planet.seaLevel + 2)) continue;
    if (avoid.some(a => Math.hypot(cx - a[0], cz - a[1]) < a[2])) continue;
    const hs = pts.map(p => p.h), spread = Math.max(...hs) - Math.min(...hs);
    if (spread <= 2.0) return { c: [cx, Math.max(...hs), cz], facing };
    if (spread < 3.2 && (!best || spread < best.spread)) best = { c: [cx, Math.max(...hs), cz], facing, spread };   // the flattest seen, as a fallback
  }
  return best && { c: best.c, facing: best.facing };
}

const NAMES_A = ['Quiet', 'Long', 'Red', 'Patient', 'Second', 'Brass', 'Late', 'Northern', 'Grey', 'Lucky', 'Small', 'Far'];
const NAMES_B = ['Heron', 'Margin', 'Ledger', 'Kestrel', 'Promise', 'Lantern', 'Harvest', 'Wake', 'Anvil', 'Courier', 'Errand', 'Tide'];
function shipName(rng) { return `${rng.pick(NAMES_A)} ${rng.pick(NAMES_B)}`; }

// ---- cargo runs: a firm's ship leaves its pad once a day and comes back hours later.
// Pure in time: where the ship is at t follows from (planet, ship, t) alone.
//   → { phase: 'pad'|'departing'|'away'|'arriving', D, c?: [x, y, z], facing?, pitch? }
const RUN_CLIMB = 30, RUN_OUT = 120;            // s to lift off vertically; s from lift-off to out of sight
const hr = (planet, sh, D, k) => hashInts(planet.universeSeed[0] ^ 0x51a9, [hashStr(4, sh.id), D, k]) / 4294967296;
export function runOn(planet, sh, D) {
  const H = planet.dayLength / 24;
  const depart = dayStart(planet, D) + (8 + 6 * hr(planet, sh, D, 1)) * H;
  return { D, depart, back: depart + (2 + 4 * hr(planet, sh, D, 2)) * H, heading: hr(planet, sh, D, 3) * Math.PI * 2 };
}
export function tripOf(planet, sh, t, home, skip = null) {     // home: { c, facing } on its pad / field
  if (sh.forSale) return { phase: 'pad' };
  const D = dayIndex(planet, t), run = runOn(planet, sh, D);
  if (skip === D || t < run.depart || t >= run.back) return { phase: 'pad', D };
  const L = LAYOUTS[sh.model], climb = 70;
  const along = s => {                          // s seconds after lift-off: up, then away along the heading, nose turning to it
    const up = Math.min(1, s / RUN_CLIMB), out = Math.max(0, s - RUN_CLIMB), tc = 120 / 4.5, d = out < tc ? 0.5 * 4.5 * out * out : 0.5 * 4.5 * tc * tc + 120 * (out - tc);   // 4.5 m/s² up to 120 m/s
    const f = home.facing + Math.atan2(Math.sin(run.heading - home.facing), Math.cos(run.heading - home.facing)) * Math.min(1, out / 25);
    return { c: [home.c[0] + Math.sin(run.heading) * d, home.c[1] + climb * up * up * (3 - 2 * up) + d * 0.08, home.c[2] + Math.cos(run.heading) * d], facing: f, pitch: out > 0 ? 0.08 : 0 };
  };
  if (t < run.depart + RUN_OUT) return { phase: 'departing', D, ...along(t - run.depart) };
  if (t >= run.back - RUN_OUT) { const a = along(run.back - t); return { phase: 'arriving', D, ...a, pitch: -a.pitch }; }
  return { phase: 'away', D };
}
