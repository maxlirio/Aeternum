// Ship designer: writes assets/ships/catalog.json — many ship designs, each a walkable
// layout (same rules as the hand-made ones in assets/ships/*.json) plus a "look" the model
// builder dresses the hull with. Deterministic: the same designs every run.
//   node tools/gen-ships.mjs
import { writeFileSync } from 'node:fs';
import { Rng } from '../js/core/prng.js';
import { seedFromString } from '../js/core/hash.js';

// room purposes map onto what the game already knows how to use
const ROOM = {
  hold:     { purpose: 'hold', label: 'cargo hold', walls: [['crate', 1.2, 1.2, 1.0], ['rack', 2.4, 0.8, 2.2], ['crate', 1.0, 1.0, 0.8]] },
  bay:      { purpose: 'hold', label: 'troop bay', walls: [['bench', 2.4, 0.5, 0.45], ['bench', 2.4, 0.5, 0.45], ['locker', 0.9, 0.55, 2.0]] },
  crew:     { purpose: 'bedroom', label: 'crew quarters', walls: [['bed', 2.1, 1.5, 0.55], ['locker', 0.9, 0.55, 2.0], ['bed', 2.1, 1.5, 0.55]] },
  galley:   { purpose: 'kitchen', label: 'galley', walls: [['counter', 1.8, 0.65, 0.92], ['fridge', 0.8, 0.7, 1.9], ['table', 1.2, 0.8, 0.75]] },
  lab:      { purpose: 'office', label: 'laboratory', walls: [['desk', 1.5, 0.75, 0.75], ['cabinet', 1.0, 0.5, 1.4], ['machine', 0.7, 0.7, 0.95]] },
  workshop: { purpose: 'shopfloor-workshop', label: 'workshop', walls: [['bench', 2.4, 1.0, 0.95], ['machine', 1.8, 1.4, 1.7], ['rack', 2.4, 0.8, 2.2]] },
  seats:    { purpose: 'lobby', label: 'passenger cabin', walls: [['bench', 2.4, 0.5, 0.45], ['bench', 2.4, 0.5, 0.45], ['bench', 2.4, 0.5, 0.45], ['bench', 2.4, 0.5, 0.45]] },
  armory:   { purpose: 'storage', label: 'armoury', walls: [['locker', 0.9, 0.55, 2.0], ['locker', 0.9, 0.55, 2.0], ['rack', 2.0, 0.6, 2.0]] },
  lounge:   { purpose: 'living', label: 'lounge', walls: [['sofa', 2.0, 0.9, 0.8], ['armchair', 0.85, 0.85, 0.95], ['tvstand', 1.6, 0.45, 0.55]] },
};
const CLASSES = [
  { cls: 'runabout', name: 'Runabout', W: [6.5, 7.5], D: [11, 13], rooms: [['lounge'], ['galley'], ['crew']], fields: false, price: [5200, 7400], flight: [210, 26, 1.3] },
  { cls: 'racer', name: 'Racer', W: [6, 7], D: [10, 12], rooms: [[]], fields: false, price: [14000, 22000], flight: [300, 34, 1.6] },
  { cls: 'dropship', name: 'Dropship', W: [9, 10], D: [16, 19], rooms: [['bay'], ['bay', 'armory']], fields: false, price: [18000, 26000], flight: [190, 20, 1.0] },
  { cls: 'gunship', name: 'Gunship', W: [8, 9], D: [14, 16], rooms: [['armory'], ['armory', 'crew']], fields: false, price: [30000, 38000], flight: [260, 28, 1.2] },
  { cls: 'explorer', name: 'Explorer', W: [9, 10], D: [21, 24], rooms: [['lab', 'galley', 'crew'], ['lab', 'crew']], fields: true, price: [36000, 52000], flight: [190, 18, 0.9] },
  { cls: 'hauler', name: 'Hauler', W: [12, 14], D: [26, 30], rooms: [['hold', 'hold', 'crew'], ['hold', 'galley', 'crew']], fields: true, price: [34000, 48000], flight: [120, 10, 0.6] },
  { cls: 'ferry', name: 'Ferry', W: [10, 11], D: [22, 25], rooms: [['seats', 'seats'], ['seats', 'galley']], fields: true, price: [30000, 40000], flight: [170, 14, 0.8] },
  { cls: 'miner', name: 'Mining barge', W: [11, 13], D: [20, 23], rooms: [['workshop', 'crew'], ['workshop', 'hold', 'crew']], fields: true, price: [26000, 36000], flight: [110, 9, 0.6] },
];
const LOOK = {
  engines: ['twin', 'quad', 'single', 'pods', 'ring'],
  fins: ['twin', 'single', 'none', 'swept', 'ventral'],
  nose: ['pointed', 'blunt', 'hammer', 'chisel'],
  wings: ['none', 'stub', 'delta', 'forward', 'gull'],
  stripe: ['none', 'band', 'chevron', 'twin'],
};
const r1 = v => Math.round(v * 10) / 10;

function design(C, v) {
  const rng = new Rng(seedFromString('ship-design:' + C.cls + ':' + v));
  const W = r1(rng.range(C.W[0], C.W[1])), D = r1(rng.range(C.D[0], C.D[1]));
  const big = W >= 11, deck = big ? 2.0 : W >= 9 ? 1.4 : 1.0, ceiling = deck + (big ? 3.4 : 2.4);
  const hx0 = r1(W * 0.22), hx1 = r1(W - W * 0.22), xc = r1(W / 2);
  const rampLen = r1(deck * 2.4), hz0 = r1(0.6 + rampLen), noseLen = r1(Math.max(2.4, D * 0.13)), hz1 = r1(D - noseLen);
  const rooms = (C.rooms[v % C.rooms.length] || []).map(k => ROOM[k] ? k : 'lounge');
  const zs = [hz0]; const span = hz1 - hz0 - 3.2;         // the cockpit takes the last 3.2 m
  rooms.forEach((_, i) => zs.push(r1(hz0 + span * (i + 1) / rooms.length)));
  zs.push(hz1); if (!rooms.length) zs.splice(1, 0);
  const doorW = big ? 3.4 : W >= 9 ? 1.8 : 1.4;
  const doors = [{ id: 0, kind: 'ramp', rooms: [0, 'outside'], x: xc, z: hz0, width: doorW, height: Math.min(ceiling - deck - 0.2, big ? 3.2 : 2.1) }];
  const partitions = [];
  const roomList = [];
  const allRooms = [...rooms, 'cockpit'];
  allRooms.forEach((k, i) => {
    const z0 = zs[i], z1 = i === allRooms.length - 1 ? hz1 : zs[i + 1];
    roomList.push({ i, purpose: k === 'cockpit' ? 'cockpit' : ROOM[k].purpose, label: k === 'cockpit' ? 'cockpit' : ROOM[k].label, rect: [hx0, z0, hx1, z1] });
    if (i > 0) { doors.push({ id: doors.length, kind: 'hatch', rooms: [i - 1, i], x: xc, z: z0, width: 1.1 }); partitions.push({ z: z0, door: doors.length - 1 }); }
  });
  // furniture: along the side walls, an aisle down the middle kept clear
  const props = [], seats = [];
  roomList.forEach(R => {
    const [x0, z0, x1, z1] = R.rect;
    if (R.purpose === 'cockpit') {
      const cw = Math.min(3.4, x1 - x0 - 0.6), cx0 = r1(xc - cw / 2);
      props.push({ kind: 'console', room: R.i, x0: cx0, z0: r1(z1 - 0.75), x1: r1(cx0 + cw), z1: r1(z1 - 0.05), h: 1.0, face: 0 });
      const n = W >= 9 ? 2 : 1;
      for (let k = 0; k < n; k++) {
        const sx = n === 1 ? xc : xc + (k ? 0.7 : -0.7);
        props.push({ kind: 'chair', room: R.i, x0: r1(sx - 0.25), z0: r1(z1 - 1.85), x1: r1(sx + 0.25), z1: r1(z1 - 1.35), h: 0.9, face: 2, soft: true });
        seats.push({ kind: k === 0 ? 'pilot' : 'sit', pose: 'sit', prop: props.length - 1, x: r1(sx), z: r1(z1 - 1.6), facing: 0 });
      }
      return;
    }
    const kinds = ROOM[allRooms[R.i]].walls.slice();
    let zl = z0 + 0.4, zr = z0 + 0.4, side = 0;
    for (const [kind, len, dep, h] of kinds) {
      const leftSide = side++ % 2 === 0, z = leftSide ? zl : zr;
      if (z + len > z1 - 0.4) continue;
      const aisle = Math.max(1.4, doorW * 0.5);
      if (dep > (x1 - x0 - aisle) / 2) continue;
      const p = leftSide ? { x0: r1(x0 + 0.05), x1: r1(x0 + 0.05 + dep), face: 1 } : { x0: r1(x1 - 0.05 - dep), x1: r1(x1 - 0.05), face: 3 };
      props.push({ kind, room: R.i, ...p, z0: r1(z), z1: r1(z + len), h });
      if (kind === 'bed') seats.push({ kind: 'sleep', pose: 'lie', prop: props.length - 1, x: r1((p.x0 + p.x1) / 2), z: r1(z + len / 2), facing: 0, top: 0.55 });
      if (leftSide) zl += len + 0.4; else zr += len + 0.4;
    }
  });
  const pick = k => LOOK[k][rng.int(0, LOOK[k].length - 1)];
  const [top, thrust, yaw] = C.flight;
  return {
    name: `${C.name} ${String.fromCharCode(65 + v)}`, cls: C.cls, note: 'Generated by tools/gen-ships.mjs.',
    W, D, H: r1(ceiling + 1.4), deck, ceiling, hull: [hx0, hz0, hx1, hz1],
    partitions, ramp: { x0: r1(xc - doorW / 2 + 0.05), x1: r1(xc + doorW / 2 - 0.05), z0: r1(hz0 - rampLen), z1: hz0 },
    doors, rooms: roomList, props, seats,
    flight: { top: r1(top * rng.range(0.9, 1.1)), boost: r1(top * 1.8), thrust: r1(thrust * rng.range(0.9, 1.1)), yaw: r1(yaw * rng.range(0.9, 1.1)), lift: r1(thrust * 0.55) },
    style: 'generated', field: C.fields, price: Math.round(rng.range(C.price[0], C.price[1]) / 100) * 100,
    look: { engines: pick('engines'), fins: pick('fins'), nose: pick('nose'), wings: pick('wings'), stripe: pick('stripe'), greeble: r1(rng.range(0.3, 1.2)), bulk: r1(rng.range(0.9, 1.25)) },
  };
}

const catalog = {};
for (const C of CLASSES) for (let v = 0; v < 3; v++) catalog[`${C.cls}${v}`] = design(C, v);
writeFileSync(new URL('../assets/ships/catalog.json', import.meta.url), JSON.stringify(catalog, null, 1));
console.log(Object.keys(catalog).length, 'designs:', Object.entries(catalog).map(([k, d]) => `${k} ${d.W}×${d.D} ${d.rooms.map(r => r.label).join('/')}`).join('\n  '));
