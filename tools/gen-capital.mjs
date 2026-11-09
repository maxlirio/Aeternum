// The decks you can walk inside the fleet's ships: same layout format as every other ship. Rooms run in a line from the docking mouth inward.
//   node tools/gen-capital.mjs
import { writeFileSync } from 'node:fs';
const W = 34, deck = 1, ceiling = 8.2, hx0 = 2, hx1 = W - 2, xc = W / 2, hz0 = 1;
const ROOMS = {
  bastion: [['hold', 'hangar', 46], ['storage', 'armoury', 12], ['bedroom', 'crew bunks', 12], ['kitchen', 'mess deck', 12], ['office', 'combat bridge', 12]],
  meridian: [['hold', 'arrivals bay', 40], ['lobby', 'promenade', 16], ['living', 'lounge', 12], ['bedroom', 'staterooms', 12], ['office', 'purser\'s bridge', 12]],
  halcyon: [['hold', 'tender bay', 40], ['lobby', 'grand stair', 16], ['living', 'salon', 14], ['bedroom', 'staterooms', 12], ['office', 'bridge', 12]],
  longshore: [['hold', 'lighter bay', 44], ['shopfloor-workshop', 'machine shop', 14], ['kitchen', 'galley', 10], ['bedroom', 'bunks', 10], ['office', 'wheelhouse', 12]],
  // the great ones, each its own ship inside as well as out
  anvil: [['hold', 'flight deck', 44], ['storage', 'ordnance magazine', 12], ['shopfloor-workshop', 'drone shop', 10], ['kitchen', 'wardroom', 10], ['bedroom', 'marine barracks', 10], ['office', 'flag bridge', 12]],
  vesper: [['hold', 'skyport', 38], ['lobby', 'concourse', 16], ['kitchen', 'food hall', 14], ['living', 'transit lounge', 12], ['office', 'harbour control', 12]],
  tiller: [['hold', 'ore bay', 46], ['shopfloor-workshop', 'smelter floor', 16], ['storage', 'parts store', 10], ['kitchen', 'canteen', 10], ['office', 'tow control', 12]],
  sable: [['hold', 'shadow bay', 36], ['storage', 'weapons locker', 10], ['office', 'ops room', 14], ['bedroom', 'sleep pods', 10], ['office', 'command deck', 12]],
};
const LINERS = new Set(['meridian', 'halcyon', 'vesper']);
const FURN = {
  hold: [['crate', 2.4, 2.4, 2.2], ['crate', 1.2, 1.2, 1.0], ['rack', 2.4, 0.8, 2.2], ['machine', 1.8, 1.4, 1.7]],
  storage: [['locker', 0.9, 0.55, 2.0], ['rack', 2.4, 0.8, 2.2], ['locker', 0.9, 0.55, 2.0], ['crate', 1.2, 1.2, 1.0]],
  bedroom: [['bed', 2.1, 1.5, 0.55], ['locker', 0.9, 0.55, 2.0]],
  kitchen: [['counter', 1.8, 0.65, 0.92], ['fridge', 0.8, 0.7, 1.9], ['table', 1.2, 0.8, 0.75], ['bench', 2.4, 0.5, 0.45]],
  office: [['console', 2.4, 0.75, 1.0], ['desk', 1.5, 0.75, 0.75], ['console', 2.4, 0.75, 1.0], ['cabinet', 1.0, 0.5, 1.4]],
  lobby: [['bench', 2.4, 0.5, 0.45], ['planter', 1.0, 1.0, 1.1]],
  living: [['sofa', 2.0, 0.9, 0.8], ['armchair', 0.85, 0.85, 0.95], ['table', 1.2, 0.8, 0.75]],
  'shopfloor-workshop': [['bench', 2.4, 1.0, 0.95], ['machine', 1.8, 1.4, 1.7], ['rack', 2.4, 0.8, 2.2]],
};
// what stands along a hangar's walls says what the ship is: a warship racks ordnance, a skyport seats travellers, an ore ship stacks crates and plant
const HOLD = {
  anvil: [['rack', 2.4, 0.8, 2.2], ['crate', 2.4, 2.4, 2.2], ['rack', 2.4, 0.8, 2.2], ['locker', 0.9, 0.55, 2.0]],
  vesper: [['bench', 2.4, 0.5, 0.45], ['planter', 1.0, 1.0, 1.1], ['bench', 2.4, 0.5, 0.45], ['counter', 1.8, 0.65, 0.92]],
  tiller: [['crate', 2.4, 2.4, 2.2], ['crate', 2.4, 2.4, 2.2], ['machine', 1.8, 1.4, 1.7], ['crate', 1.2, 1.2, 1.0]],
  sable: [['locker', 0.9, 0.55, 2.0], ['locker', 0.9, 0.55, 2.0], ['cabinet', 1.0, 0.5, 1.4], ['rack', 2.4, 0.8, 2.2]],
};
const r1 = v => Math.round(v * 100) / 100;
function decks(name, rooms) {
  let z = hz0; const zs = [z]; for (const [, , len] of rooms) { z += len; zs.push(z); }
  const hz1 = z, D = hz1 + 1, doors = [{ id: 0, kind: 'ramp', rooms: [0, 'outside'], x: xc, z: hz0, width: 28, height: 6.6 }], partitions = [], roomList = [], props = [], seats = [], stairs = [], extra = { slabs: [], ramps: [], walls: [] };
  rooms.forEach(([purpose, label], i) => {
    const z0 = zs[i], z1 = zs[i + 1]; roomList.push({ i, purpose, label, rect: [hx0, z0, hx1, z1] });
    if (i > 0) { doors.push({ id: doors.length, kind: 'hatch', rooms: [i - 1, i], x: xc, z: z0, width: 2.4 }); partitions.push({ z: z0, door: doors.length - 1 }); }
    // Each room furnished for what it is, either side of a 6 m clear way down the middle from hatch to hatch. Everything here is solid to walk round.
    const put = (kind, x0, z0_, x1, z1_, h, face, extra = {}) => { if (z1_ > z1 - 0.3 || z0_ < z0 + 0.3 || x0 < hx0 + 0.1 || x1 > hx1 - 0.1) return false; props.push({ kind, room: i, x0: r1(x0), x1: r1(x1), z0: r1(z0_), z1: r1(z1_), h, face, ...(['bed', 'sofa', 'armchair', 'chair'].includes(kind) ? { soft: true } : {}), ...extra }); return true; };
    const wallRun = (list, start = z0 + 0.6, gap = 0.6) => { for (const side of [0, 1]) { let at = start, n = 0; while (true) { const [kind, len, dep, h] = list[n++ % list.length]; if (at + len > z1 - 0.5) break; if (side === 0) put(kind, hx0 + 0.1, at, hx0 + 0.1 + dep, at + len, h, 1); else put(kind, hx1 - 0.1 - dep, at, hx1 - 0.1, at + len, h, 3); at += len + gap; } } };
    const sides = fn => { for (const s of [-1, 1]) fn(s); };
    if (purpose === 'hold') wallRun(HOLD[name] || FURN.hold, z0 + 14);
    else if (purpose === 'kitchen') {           // a mess: galley down one wall and fridges, long tables with benches either side
      wallRun([['counter', 2.6, 0.65, 0.92], ['fridge', 0.8, 0.7, 1.9], ['counter', 1.8, 0.65, 0.92]]);
      sides(s => { for (const off of [5.4, 10]) for (let z = z0 + 1.6; z + 2 < z1; z += 4.2) { const xa = xc + s * off - 1.5; put('table', xa, z, xa + 3, z + 1.2, 0.75, 0); put('bench', xa + 0.3, z - 0.62, xa + 2.7, z - 0.12, 0.45, 2); put('bench', xa + 0.3, z + 1.32, xa + 2.7, z + 1.82, 0.45, 0); } });
    } else if (purpose === 'bedroom') {         // sleeping bays off the way: a partition, a bunk and locker at the wall, another bunk and a desk nearer the way
      sides(s => { for (let z = z0 + 0.5; z + 3.1 < z1; z += 3.4) { const a = s < 0 ? hx0 + 0.15 : hx1 - 0.15, xin = xc + s * 3.3, [pa, pb] = s < 0 ? [a, xin] : [xin, a]; put('partition', pa, z, pb, z + 0.1, 2.3, 0);
        const bed = (x) => { const [p0, p1] = s < 0 ? [x, x + 2.1] : [x - 2.1, x]; if (put('bed', p0, z + 0.4, p1, z + 1.9, 0.55, 0)) seats.push({ kind: 'sleep', pose: 'lie', prop: props.length - 1, x: r1((p0 + p1) / 2), z: r1(z + 1.15), facing: 0, top: 0.55 }); };
        bed(a + s * -0.05); const lk = s < 0 ? a + 2.4 : a - 3.3; put('locker', lk, z + 0.4, lk + 0.9, z + 0.95, 2, 2); bed(a - s * 4.2); const dk = s < 0 ? xin - 1.7 : xin + 0.2; put(LINERS.has(name) ? 'cabinet' : 'desk', dk, z + 2.15, dk + 1.5, z + 2.9, LINERS.has(name) ? 0.9 : 0.75, 0); } });
    } else if (purpose === 'office') {           // a bridge: stations in curved banks facing the wall of displays, a chart table behind them, every station its chair
      sides(s => { for (const [off, zz] of [[3.2, z1 - 2.3], [7.4, z1 - 2.8], [11.4, z1 - 3.6], [3.2, z1 - 5.6], [7.4, z1 - 6.1]]) { const xa = xc + s * off - 1.3; put('console', xa, zz, xa + 2.4, zz + 0.75, 1, 0); put('chair', xa + 0.95, zz - 0.85, xa + 1.45, zz - 0.35, 0.9, 2); } });
      put('table', xc - 1.5, z0 + 2.4, xc + 1.5, z0 + 3.6, 0.75, 0); wallRun([['cabinet', 1.0, 0.5, 1.4]], z0 + 0.8, 1.4);
    } else if (purpose === 'storage') {          // an armoury: rows of racks end-on to the way, lockers along the walls
      wallRun([['locker', 0.9, 0.55, 2]], z0 + 0.6, 0.15);
      sides(s => { for (let z = z0 + 1; z + 1 < z1; z += 2.6) for (const off of [4.6, 8.0]) { const xa = xc + s * off - 1.2; put('rack', xa, z, xa + 2.4, z + 0.8, 2.2, 0); } });
    } else if (purpose === 'living') {           // a saloon: groups of sofas and armchairs round low tables, plants between them
      sides(s => { for (let z = z0 + 1.2; z + 3 < z1; z += 4.4) for (const off of [6.4, 11]) { const x = xc + s * off; put('sofa', x - 1, z, x + 1, z + 0.9, 0.8, 2); put('table', x - 0.6, z + 1.2, x + 0.6, z + 2, 0.45, 0); put('armchair', x - 1.9, z + 1.1, x - 1.05, z + 1.95, 0.95, 1); put('armchair', x + 1.05, z + 1.1, x + 1.9, z + 1.95, 0.95, 3); put('planter', x + 2, z - 0.1, x + 2.7, z + 0.6, 1.1, 0); } });
    } else if (purpose === 'shopfloor-workshop') { // a machine shop: machines in two lines, benches at the walls
      wallRun([['bench', 2.4, 1.0, 0.95], ['rack', 2.4, 0.8, 2.2]]);
      sides(s => { for (let z = z0 + 1.2; z + 2 < z1; z += 3.4) for (const off of [5.2, 9.4]) { const x = xc + s * off; put('machine', x - 0.9, z, x + 0.9, z + 1.4, 1.7, 0); } });
    } else if (purpose === 'lobby') {            // a tall hall: planters and benches along its length; the stair and balcony are added below
      sides(s => { for (let z = z0 + 1; z + 2 < z1 - 9.8; z += 3.5) { const x = xc + s * 7; put('planter', x - 0.5, z, x + 0.5, z + 1, 1.1, 0); put('bench', x - 1.2, z + 1.2, x + 1.2, z + 1.7, 0.45, 2); } });
      const by = deck + 3.6, top = z1 - 2.4, foot = top - 7.2, inL = hx0 + 3, inR = hx1 - 3, fA = [xc - 9.5, xc - 5.5], fB = [xc + 5.5, xc + 9.5];
      stairs.push({ flights: [fA, fB], foot, top, by, inL, inR, z0, z1 });
      extra.slabs.push({ y: by, rects: [[hx0, z0 + 0.2, inL, z1], [inR, z0 + 0.2, hx1, z1], [inL, top, inR, z1]] });
      const st = (by - deck) / Math.floor((by - deck) / 0.18);      // (the treads are drawn as steps: the slope you walk runs half a step up, through the middle of each tread, so your feet are on the wood, not in it)
      for (const [a, b] of [fA, fB]) { extra.ramps.push({ x0: a, x1: b, z0: foot, z1: top, y0: deck + st / 2, y1: by + st / 2 }); extra.walls.push([a, foot, a, top, deck, by + 1.05], [b, foot, b, top, deck, by + 1.05]); }
      extra.walls.push([inL, z0 + 0.2, inL, top, by, by + 1.05], [inR, z0 + 0.2, inR, top, by, by + 1.05], [inL, top, fA[0], top, by, by + 1.05], [fA[1], top, fB[0], top, by, by + 1.05], [fB[1], top, inR, top, by, by + 1.05]);
    }
    // the ship's frame shows in its rooms: columns either side of the clear way, carrying girders under the deck above (where nothing stands already)
    if (purpose !== 'hold' && purpose !== 'lobby') for (let z = z0 + 1.75; z + 0.3 < z1; z += 7) for (const x of [xc - 3.45, xc + 3.45]) {
      const r = [x - 0.22, z - 0.22, x + 0.22, z + 0.22]; if (props.some(q => q.room === i && !(r[2] < q.x0 - 0.15 || r[0] > q.x1 + 0.15 || r[3] < q.z0 - 0.15 || r[1] > q.z1 + 0.15))) continue;
      put('pillar', ...r, ceiling - deck, 0);
    }
  });
  return { name: name[0].toUpperCase() + name.slice(1), cls: 'decks', note: 'Generated by tools/gen-capital.mjs.', W, D, H: ceiling + 1, deck, ceiling, hull: [hx0, hz0, hx1, hz1], partitions, ramp: { x0: r1(xc - 13.9), x1: r1(xc + 13.9), z0: hz0 - 0.2, z1: hz0 }, doors, rooms: roomList, props, seats, flight: { top: 0, boost: 0, thrust: 0, yaw: 0, lift: 0 }, style: 'decks', decks: true, price: 0, stairs, extra };
}
const out = {}; for (const [k, v] of Object.entries(ROOMS)) out[k + '_decks'] = decks(k, v);
writeFileSync(new URL('../assets/ships/capital.json', import.meta.url), JSON.stringify(out, null, 1));
console.log(Object.entries(out).map(([k, d]) => `${k} ${d.W}x${d.D}, ${d.props.length} props`).join('\n'));
