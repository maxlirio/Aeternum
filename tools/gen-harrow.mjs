// The Harrow: the enemy's dreadnought (sim/planetwar.js), inside. Not rooms put into a hull: the ship is a lance with a ship built round it
// (two long hulls, the lance slung in a drum between them on four arms), and what you walk is that ship. From the fighter bay in the
// starboard hull's flank, across its spine way, through the hall where the lance's heat is carried off to the vents, out along an arm over
// open air, into the drum where the lance stands in its well. The aft arm is the other way in: no gallery, only the coolant mains and a
// walkway beside them. The hull (tools/assets/harrow_kit.py) is built to the same numbers.
//   node tools/gen-harrow.mjs
// Layout frame: x along the ship (100 = abeam the lance, more = toward the bow), z inward from the bay's mouth, y up from the bay's sill.
import { writeFileSync } from 'node:fs';
const W = 200, D = 592, deck = 1, r2 = v => Math.round(v * 100) / 100;
// the spaces: [purpose, label, rect [x0, z0, x1, z1], floor, ceiling]
const SP = [
  ['hold', 'fighter bay', [80, 1, 120, 61], 1, 13],
  ['corridor', 'spine way', [20, 61, 180, 69], 1, 6],
  ['bedroom', 'pilots\' ready room', [24, 41, 76, 61], 1, 4.6],
  ['storage', 'armoury', [124, 41, 176, 61], 1, 4.6],
  ['bedroom', 'marines\' mess', [60, 69, 140, 93], 1, 4.6],
  ['shopfloor-workshop', 'heat exchange hall', [150, 69, 190, 220], 1, 15],
  ['corridor', 'forward arm', [164, 220, 176, 430], 1, 7],
  ['corridor', 'coolant run', [26, 69, 34, 430], 1, 4.5],
  ['shopfloor-workshop', 'lance hall', [20, 430, 180, 590], -9, 45],
];
const BAY = 0, SPINE = 1, READY = 2, ARMS = 3, MESS = 4, HALL = 5, ARM = 6, RUN = 7, LANCE = 8;
// the ways between them: [rooms, x, z, width, height, axis] (axis x: in a wall that runs along x)
const DOORS = [
  [[BAY, 'outside'], 100, 1, 28, 6.6, 'x', 'ramp'],
  [[BAY, SPINE], 100, 61, 4, 3.2, 'x'], [[SPINE, READY], 50, 61, 2.4, 2.4, 'x'], [[SPINE, ARMS], 150, 61, 2.4, 2.4, 'x'], [[SPINE, MESS], 100, 69, 3, 2.6, 'x'],
  [[SPINE, HALL], 170, 69, 5, 4, 'x'], [[SPINE, RUN], 30, 69, 2.4, 2.4, 'x'], [[HALL, ARM], 170, 220, 6, 4, 'x'], [[ARM, LANCE], 170, 430, 11.6, 6, 'x', 'open'], [[RUN, LANCE], 30, 430, 4, 3.4, 'x', 'open'],
];
const rooms = SP.map(([purpose, label, rect, y0, y1], i) => ({ i, purpose, label, rect, y0, y1 }));
const doors = DOORS.map(([rm, x, z, width, height, axis, kind], id) => ({ id, kind: kind || 'hatch', rooms: rm, x, z, width, height, axis }));
// walls: every side of every space, open where a door is in it
const walls = [];
for (const R of rooms) { const [x0, z0, x1, z1] = R.rect, lo = R.i === LANCE ? -9 : 0;
  for (const [a, b, c, d] of [[x0, z0, x1, z0], [x0, z1, x1, z1], [x0, z0, x0, z1], [x1, z0, x1, z1]]) {
    const along = b === d, ds = doors.filter(q => q.rooms.includes(R.i) && (along ? q.axis === 'x' && Math.abs(q.z - b) < 0.01 && q.x > a && q.x < c : q.axis === 'z' && Math.abs(q.x - a) < 0.01 && q.z > b && q.z < d)).map(q => q.id);
    walls.push({ x0: a, z0: b, x1: c, z1: d, y0: lo, y1: R.y1, room: R.i, doors: ds }); } }
const rails = [], rail = (x0, z0, x1, z1, y, top = 1.05) => rails.push({ x0, z0, x1, z1, y0: y, y1: y + top, rail: true, doors: [] });
const slabs = [], ramps = [], props = [], lights = [], posts = [], seats = [];
const put = (kind, room, x0, z0, x1, z1, h, face = 0, more = {}) => props.push({ kind, room, x0: r2(x0), z0: r2(z0), x1: r2(x1), z1: r2(z1), h, face, ...more });
const lamp = (room, x, y, z, R, col = 'warm', I = 1) => lights.push({ room, p: [r2(x), r2(y), r2(z)], R, col, I });
// floors and the decks over them
for (const R of rooms) if (R.i !== LANCE) { slabs.push({ y: R.y0, rects: [R.rect.slice()] }); slabs.push({ y: R.y1 + 0.2, roof: true, rects: [R.rect.slice()] }); }

// ---- the fighter bay: the mouth, a clear deck to set down on, cradles with their fighters hung in them along both walls further in
for (const z of [38, 49]) { put('cradle', BAY, 80.3, z, 85.3, z + 9, 5.2, 1); put('cradle', BAY, 114.7, z, 119.7, z + 9, 5.2, 3); }
put('crate', BAY, 87, 57.2, 89.4, 59.6, 2.2); put('crate', BAY, 89.8, 58, 91, 59.2, 1.0); put('bowser', BAY, 108, 56.6, 113, 59.4, 1.9); put('crate', BAY, 104.6, 58, 105.8, 59.2, 1.0);
for (const z of [8, 22, 36, 50]) for (const x of [90, 110]) lamp(BAY, x, 12.2, z, 13, 'red', 0.9);
for (const z of [15, 43]) lamp(BAY, 100, 12.2, z, 14, 'warm', 0.55);
// ---- the spine way: the ship's street, frames every ten metres, shut off fore and aft by blast doors at action stations
for (let x = 30; x <= 170; x += 10) { if (Math.abs(x - 100) < 4 || Math.abs(x - 50) < 3 || Math.abs(x - 150) < 3 || Math.abs(x - 170) < 4 || Math.abs(x - 30) < 3) continue; put('frame', SPINE, x - 0.3, 61.05, x + 0.3, 61.65, 5); put('frame', SPINE, x - 0.3, 68.35, x + 0.3, 68.95, 5); }
put('crate', SPINE, 118, 61.2, 120.4, 63.6, 2.2); put('crate', SPINE, 76, 66.4, 77.2, 67.6, 1.0); put('crate', SPINE, 141, 61.2, 143.4, 63.6, 1.6); put('shield', SPINE, 60, 64.2, 60.5, 68.6, 1.25); put('shield', SPINE, 136, 61.4, 136.5, 65.4, 1.25);
for (let x = 30; x <= 170; x += 20) lamp(SPINE, x, 5.6, 65, 8, 'red', 0.8);
// ---- pilots' ready room: benches before a briefing wall, lockers, bunks for the watch
for (let x = 30; x < 50; x += 3.2) for (const z of [47, 50, 53]) put('bench', READY, x, z, x + 2.4, z + 0.5, 0.45, 0);
put('console', READY, 34, 42, 36.4, 42.75, 1.0, 0); put('console', READY, 40, 42, 42.4, 42.75, 1.0, 0);
for (let x = 56; x < 74; x += 1.0) put('locker', READY, x, 41.2, x + 0.9, 41.75, 2.0, 0);
for (const z of [45, 49, 53, 57]) put('bed', READY, 73.6, z, 75.7, z + 1.5, 2.0, 3);
for (const x of [36, 62]) lamp(READY, x, 4.3, 51, 7, 'warm', 0.9);
// ---- the armoury: racks end-on in rows, a cage counter, crates of cells
for (let x = 128; x < 172; x += 3.4) for (const z of [43, 49]) put('rack', ARMS, x, z, x + 0.8, z + 2.4 + (z === 49 ? 1.6 : 0), 2.2, 1);
for (let x = 126; x < 146; x += 1.3) put('crate', ARMS, x, 58.6, x + 1.2, 59.8, 1.0, 0);
for (const x of [137, 163]) lamp(ARMS, x, 4.3, 51, 7, 'warm', 0.8);
// ---- the marines' mess: long tables, the galley wall, bunks in tiers at each end
for (let x = 84; x < 118; x += 5) for (const z of [76, 84]) { if (Math.abs(x + 1.5 - 100) < 2.6 && z === 76) continue; put('table', MESS, x, z, x + 3, z + 1.2, 0.75, 0); put('bench', MESS, x + 0.3, z - 0.62, x + 2.7, z - 0.12, 0.45, 2); put('bench', MESS, x + 0.3, z + 1.32, x + 2.7, z + 1.82, 0.45, 0); }
for (const [xa, f] of [[61, 1], [136.9, 3]]) for (let z = 70.2; z + 1.6 < 92.6; z += 2.4) { put('bed', MESS, xa, z, xa + 2.1, z + 1.5, 2.0, f); const xb = f === 1 ? xa + 3.6 : xa - 3.6; put('bed', MESS, xb, z, xb + 2.1, z + 1.5, 2.0, f); }
for (let x = 70; x < 80; x += 1.0) put('locker', MESS, x, 92.2, x + 0.9, 92.75, 2.0, 2);
for (let x = 120; x < 130; x += 1.0) put('locker', MESS, x, 92.2, x + 0.9, 92.75, 2.0, 2);
put('counter', MESS, 86, 92.1, 96, 92.75, 0.92, 2); put('counter', MESS, 104, 92.1, 114, 92.75, 0.92, 2);
for (const x of [72, 100, 128]) lamp(MESS, x, 4.3, 81, 8, 'warm', 0.9);
// ---- the heat exchange hall: where the lance's heat comes down the arm in the coolant mains and is given to the hull's vents. Two rows of
// exchanger stacks with an aisle between, pump sets in the aisle, a catwalk down the outboard wall with a stair up to it
for (let z = 84; z <= 204; z += 20) { put('exchanger', HALL, 156, z, 164, z + 10, 9.5); put('exchanger', HALL, 176, z, 183.6, z + 10, 9.5); }
put('pump', HALL, 166.4, 96, 169.4, 97.8, 1.3); put('pump', HALL, 170.6, 116, 173.6, 117.8, 1.3); put('pump', HALL, 166.4, 136, 169.4, 137.8, 1.3); put('pump', HALL, 170.6, 156, 173.6, 157.8, 1.3); put('pump', HALL, 166.4, 176, 169.4, 177.8, 1.3); put('pump', HALL, 170.6, 196, 173.6, 197.8, 1.3);
put('crate', HALL, 151, 71, 153.4, 73.4, 2.2); put('crate', HALL, 153.8, 71, 155, 72.2, 1.0);
slabs.push({ y: 7, rects: [[184, 90, 190, 214]] }); ramps.push({ x0: 186.6, x1: 190, z0: 72, z1: 90, y0: 1, y1: 7 });
rail(184, 90, 184, 214, 7); rail(184, 214, 190, 214, 7); rail(186.6, 72, 186.6, 90, 1, 7.05); rail(184, 90, 186.6, 90, 7);
for (let z = 79; z <= 209; z += 20) { lamp(HALL, 170, 14, z, 13, 'amber', 1.0); lamp(HALL, 187, 10.5, z + 10, 6, 'red', 0.5); }
// ---- the forward arm: a gallery 200 m long over open air, slit windows either side, the lance's power bus overhead, a pier every fifteen metres
for (let z = 234.25; z < 426; z += 15) { put('pier', ARM, 164.05, z, 165.6, z + 1.5, 6); put('pier', ARM, 174.4, z, 175.95, z + 1.5, 6); }
put('crate', ARM, 166, 268, 168.4, 270.4, 1.5); put('crate', ARM, 171.4, 300, 173.8, 302.4, 1.5); put('crate', ARM, 172.4, 302.8, 173.6, 304, 1.0); put('crate', ARM, 166, 342, 168.4, 344.4, 1.5); put('crate', ARM, 171.6, 372, 174, 374.4, 1.5);
put('shield', ARM, 164.2, 398, 169.2, 398.5, 1.25); put('shield', ARM, 170.8, 410, 175.8, 410.5, 1.25);
for (let z = 228; z < 428; z += 15) lamp(ARM, 170, 6.5, z + 7, 9, z > 395 ? 'lance' : 'red', 0.8);
// ---- the coolant run in the aft arm: the mains either side, a walkway between, valve stations standing out into it
put('main', RUN, 26.1, 69.4, 28.2, 429.6, 4.3); put('main', RUN, 31.8, 69.4, 33.9, 429.6, 4.3);
for (let z = 96, k = 0; z < 420; z += 34, k++) { if (k % 2) put('valve', RUN, 28.2, z, 29.5, z + 1.3, 1.5); else put('valve', RUN, 30.5, z, 31.8, z + 1.3, 1.5); }
for (let z = 80; z < 430; z += 22) lamp(RUN, 30, 4.2, z, 6, z > 400 ? 'lance' : 'red', 0.75);
// ---- the lance hall: the drum. The lance's barrel stands in a well; a gallery runs round the walls at the deck you came in on, bridges cross
// to the collar round the barrel, and the floor of the well is twelve metres down among the capacitor banks (two stairs down to it)
slabs.push({ y: 1, rects: [[20, 430, 44, 590], [156, 430, 180, 590], [44, 430, 156, 454], [44, 566, 156, 590], [96, 454, 104, 492], [96, 528, 104, 566], [82, 492, 118, 528], [44, 454, 50, 466], [150, 554, 156, 566]] });
slabs.push({ y: -9, rects: [[44, 454, 156, 566]] }); slabs.push({ y: 45.2, roof: true, rects: [[20, 430, 180, 590]] });
ramps.push({ x0: 44, x1: 50, z0: 466, z1: 506, y0: 1, y1: -9 }, { x0: 150, x1: 156, z0: 514, z1: 554, y0: -9, y1: 1 });
// (the well's rails; the stairs' sides are walls down to the floor of the well)
rail(50, 454, 96, 454, 1); rail(104, 454, 156, 454, 1); rail(44, 566, 96, 566, 1); rail(104, 566, 150, 566, 1); rail(44, 466, 44, 566, 1); rail(156, 454, 156, 554, 1);
rail(96, 454, 96, 492, 1); rail(104, 454, 104, 492, 1); rail(96, 528, 96, 566, 1); rail(104, 528, 104, 566, 1);
rail(82, 492, 96, 492, 1); rail(104, 492, 118, 492, 1); rail(82, 528, 96, 528, 1); rail(104, 528, 118, 528, 1); rail(82, 492, 82, 528, 1); rail(118, 492, 118, 528, 1);
rail(50, 454, 50, 466, 1); rails.push({ x0: 50, z0: 466, x1: 50, z1: 506, y0: -9, y1: 2.05, rail: true, doors: [] }); rail(150, 554, 150, 566, 1); rails.push({ x0: 150, z0: 514, x1: 150, z1: 554, y0: -9, y1: 2.05, rail: true, doors: [] });
// (the well's own sides, under the gallery)
for (const [a, b, c, d] of [[44, 454, 156, 454], [44, 566, 156, 566], [44, 454, 44, 566], [156, 454, 156, 566]]) rails.push({ x0: a, z0: b, x1: c, z1: d, y0: -9, y1: 0.7, pit: true, doors: [] });
put('barrel', LANCE, 88, 498, 112, 522, 54, 0, { y: -9 });
// capacitor banks on the floor of the well, in ranks either side of the barrel; the collar's four pylons
for (const x of [58, 72, 128, 142]) for (let z = 470; z <= 546; z += 19) { if ((x === 58 || x === 72) && z < 510) continue; if ((x === 128 || x === 142) && z > 520) continue; put('capacitor', LANCE, x - 4, z, x + 4, z + 9, 7.5, 0, { y: -9 }); }
for (const z of [462, 548]) for (const x of [84, 116]) put('capacitor', LANCE, x - 4, z, x + 4, z + 9, 7.5, 0, { y: -9 });
for (const [x, z] of [[82, 492], [115, 492], [82, 525], [115, 525]]) put('pylon', LANCE, x, z, x + 3, z + 3, 10, 0, { y: -9 });
// on the gallery: consoles watching the lance, shields the hall's guard fights from, coolant headers where the arms come in
for (const x of [60, 76, 124, 140]) { put('console', LANCE, x - 1.2, 449, x + 1.2, 449.75, 1.0, 0); put('console', LANCE, x - 1.2, 570.2, x + 1.2, 570.95, 1.0, 2); }
put('shield', LANCE, 150, 444, 150.5, 449, 1.25); put('shield', LANCE, 120, 436, 120.5, 441, 1.25); put('shield', LANCE, 80, 436, 80.5, 441, 1.25); put('shield', LANCE, 49, 444, 49.5, 449, 1.25);
put('shield', LANCE, 162, 500, 167, 500.5, 1.25); put('shield', LANCE, 33, 520, 38, 520.5, 1.25); put('shield', LANCE, 90, 574, 90.5, 579, 1.25); put('shield', LANCE, 110, 574, 110.5, 579, 1.25);
put('header', LANCE, 176.4, 438, 179.6, 452, 5); put('header', LANCE, 20.4, 438, 23.6, 452, 5); put('crate', LANCE, 158, 470, 160.4, 472.4, 1.5); put('crate', LANCE, 40, 548, 42.4, 550.4, 1.5); put('crate', LANCE, 24, 584, 26.4, 586.4, 2.2); put('crate', LANCE, 172, 584, 174.4, 586.4, 2.2);
for (const [x, z] of [[32, 442], [100, 442], [168, 442], [32, 510], [168, 510], [32, 578], [100, 578], [168, 578], [32, 476], [168, 476], [32, 544], [168, 544], [66, 442], [134, 442], [66, 578], [134, 578]]) lamp(LANCE, x, 9, z, 13, 'amber', 0.8);
for (const [x, z] of [[100, 478], [100, 542], [72, 510], [128, 510]]) lamp(LANCE, x, 16, z, 30, 'lance', 0.8);      // (the barrel's own light, through its ports)
for (const [x, z] of [[60, 470], [140, 470], [60, 550], [140, 550], [100, 460], [100, 560]]) lamp(LANCE, x, -3, z, 16, 'lance', 0.9);

// ---- who's aboard (sim/boarding.js): posts [x, y, z, facing, kind]: 'post' stands it; 'crew' is at work until the alarm; 'react' comes from the mess when it goes
const post = (x, y, z, face, kind = 'post') => posts.push({ p: [x, y, z], face, kind });
post(96, 1, 55, Math.PI, 'crew'); post(110, 1, 53, Math.PI, 'crew');
post(58, 1, 66, Math.PI / 2); post(138, 1, 63.5, -Math.PI / 2);
for (const x of [88, 96, 104, 112]) post(x, 1, 80, Math.PI, 'react');
post(160, 1, 100, Math.PI); post(180, 1, 122, Math.PI); post(168, 1, 139.5, Math.PI); post(160, 1, 162, Math.PI); post(172, 1, 199.5, Math.PI); post(187, 7, 150, Math.PI);
post(167, 1, 272, Math.PI); post(173, 1, 306, Math.PI); post(167, 1, 346, Math.PI); post(166, 1, 400.5, Math.PI); post(173, 1, 412.5, Math.PI);
post(30, 1, 200, Math.PI); post(30, 1, 330, Math.PI);
post(152, 1, 446.5, -Math.PI / 2); post(122, 1, 438.5, -Math.PI / 2); post(78, 1, 438.5, Math.PI / 2); post(47, 1, 446.5, Math.PI / 2); post(164, 1, 502.5, Math.PI); post(36, 1, 522.5, Math.PI);
post(85, 1, 510, Math.PI / 2, 'crew'); post(115, 1, 510, -Math.PI / 2, 'crew'); post(100, 1, 576, Math.PI);
// ---- the ways they walk: nodes [x, y, z] and the links between them
const NODES = [[100, 1, 45], [100, 1, 61], [100, 1, 65], [170, 1, 67], [30, 1, 62.5], [100, 1, 72], [170, 1, 73], [170, 1, 146], [170, 1, 216], [170, 1, 226], [170, 1, 325], [170, 1, 424], [170, 1, 442], [100, 1, 442], [100, 1, 494],
  [30, 1, 73], [30, 1, 250], [30, 1, 424], [30, 1, 442], [100, 1, 582], [168, 1, 510], [32, 1, 510], [100, 1, 526], [168, 1, 582], [32, 1, 582], [100, 1, 80], [135, 1, 67], [65, 1, 62.5]];
const LINKS = [[0, 1], [1, 2], [2, 26], [26, 3], [2, 27], [27, 4], [2, 5], [5, 25], [3, 6], [6, 7], [7, 8], [8, 9], [9, 10], [10, 11], [11, 12], [12, 13], [13, 14], [4, 15], [15, 16], [16, 17], [17, 18], [18, 13], [12, 20], [20, 23], [23, 19], [18, 21], [21, 24], [24, 19], [19, 22]];

const layout = { name: 'Harrow', cls: 'decks', custom: true, note: 'Generated by tools/gen-harrow.mjs.', W, D, H: 46, deck, ceiling: 13, hull: [80, 1, 120, 61], partitions: [],
  ramp: { x0: 86.1, x1: 113.9, z0: 0.8, z1: 1 }, doors, rooms, walls: walls.concat(rails), slabs, ramps, props, seats, lights, posts, nav: { nodes: NODES, links: LINKS },
  charge: [100, 1, 496.6], flight: { top: 0, boost: 0, thrust: 0, yaw: 0, lift: 0 }, style: 'decks', decks: true, price: 0, stairs: [], extra: { slabs: [], ramps: [], walls: [] } };
writeFileSync(new URL('../assets/ships/harrow.json', import.meta.url), JSON.stringify({ harrow_decks: layout }));
console.log(`harrow_decks ${W}x${D}: ${rooms.length} spaces, ${walls.length} walls + ${rails.length} rails, ${props.length} props, ${lights.length} lights, ${posts.length} posts`);
