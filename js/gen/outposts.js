// What people put out in the country, between towns: farms where it's green and flat, mines in the
// hills, wells and camps in dry country, wind and sun farms on open ground, watch posts and masts on
// high ground, lighthouses on the shore, ruins anywhere. Pure: (planet, tile) → sites, read from the
// land itself, so each planet's countryside follows its own terrain and climate. Nothing is stored
// until you change something. Each item: { k (kit name), x, y, z, rot, r (solid radius, or 0) }.
import { Rng } from '../core/prng.js';
import { derive, hash01 } from '../core/hash.js';
import { surfaceAt } from './surface.js';
import { moisture } from './terrain.js';
import { cultureOf } from './culture.js';
import { designOf, footOf } from './designs.js';
import { designById, designPlan, FORMS } from './housegen.js';
import { SMALL } from './smallgen.js';
import { FAMILIES } from './familydata.js';

const TILE = 900, FAM = new Set(FAMILIES);
const r_ = { barn: 7, grainsilo: 3, tractor: 2, harvester: 3.2, animalpen: 3.2, greenhouse: 4.6, headframe: 5, drillrig: 3.6, workcamp: 3.2, generatorset: 1.7, substation: 4.2, pylon: 3.4, windmillbig: 1.6, solarfield: 0, pumpjack: 3, watchtower: 2, radiomast: 1.4, bunker: 4, ruinwall: 0, lighthouse: 2.5, wellhead: 0.8, waterwheel: 1.6, fuelcanopy: 0, fuelpump: 0.5, irrigator: 0, watertankfarm: 1, haybale: 0.7, orecart: 1.1, cairn: 0.7 };
// site kinds: [center piece, ring items [kind, count, radius], weight fn of the land]
const KINDS = {
  farm: { label: 'a farm', fit: l => l.flat * l.wet * l.low, core: 'barn', ring: [['cropfield', 4, 48], ['cottage', 1, 24], ['stable', 1, 25], ['shed', 1, 19], ['windpump', 1, 32], ['scarecrow', 2, 44], ['beehives', 1, 22], ['trough', 2, 21], ['grainsilo', 2, 14], ['tractor', 1, 12], ['animalpen', 1, 20], ['haybale', 5, 24], ['greenhouse', 2, 28], ['irrigator', 1, 42], ['harvester', 1, 26], ['watertankfarm', 1, 16], ['washingline', 1, 11]] },
  mine: { label: 'a mine', fit: l => l.steep * (1 - l.wet * 0.5) * 0.3, core: 'headframe', ring: [['drillrig', 1, 22], ['orecart', 3, 14], ['railtrack', 3, 12], ['workcamp', 2, 26], ['generatorset', 1, 18], ['gascan', 3, 9], ['pallettruck', 1, 16], ['sandbag', 2, 20], ['container', 2, 20]] },
  wind: { label: 'a wind farm', fit: l => l.flat * l.high, core: 'windmillbig', ring: [['windmillbig', 3, 70], ['substation', 1, 26], ['pylon', 2, 60]] },
  solar: { label: 'a solar field', fit: l => l.flat * (1 - l.wet), core: 'substation', ring: [['solarfield', 12, 30], ['workcamp', 1, 22], ['pylon', 1, 50]] },
  oil: { label: 'a well field', fit: l => l.flat * (1 - l.wet) * 0.6, core: 'pumpjack', ring: [['pumpjack', 3, 34], ['gastanks', 2, 12], ['tank', 1, 20], ['generatorset', 1, 12]] },
  well: { label: 'a well', fit: l => (1 - l.wet) * l.flat * 0.5, core: 'villagewell', ring: [['windpump', 1, 12], ['fencepanel', 4, 8], ['bucket', 2, 2], ['campfire', 1, 7], ['tent', 2, 10], ['washingline', 1, 9]] },
  mill: { label: 'a water mill', fit: l => l.wet * l.shore, core: 'waterwheel', ring: [['pumphouse', 1, 14], ['barn', 1, 16], ['fencepanel', 4, 14], ['haybale', 3, 12]] },
  watch: { label: 'a watch post', fit: l => l.high * 0.3, core: 'watchtower', ring: [['bunker', 1, 16], ['radiomast', 1, 22], ['sandbag', 4, 8], ['barricade', 2, 12]] },
  light: { label: 'a lighthouse', fit: l => l.shore * 1.4, core: 'lighthouse', ring: [['cottage', 1, 15], ['fencepanel', 3, 9], ['radiomast', 1, 18]] },
  ruin: { label: 'ruins', fit: () => 0.22, core: 'ruinwall', ring: [['ruinwall', 6, 16], ['cairn', 3, 22], ['stonewall', 4, 24], ['scrapheap', 2, 12]] },
  camp: { label: 'a camp', fit: () => 0.16, core: 'campfire', ring: [['tent', 3, 6], ['tarp', 1, 8], ['backpack', 2, 4], ['gascan', 1, 6], ['washingline', 1, 7]] },
  // people living together, and what they build in common: laid out by plan() below
  village: { label: 'a village', clear: 92, fit: l => l.flat * l.low * (0.5 + 0.5 * l.wet) * 1.5, plan: (put, x, z, a, rng, ctx) => (rng.weighted(Object.entries(LAYOUT[ctx.culture] || LAYOUT.corporate)) === 'street' ? village : ctx.culture === 'garden' || ctx.culture === 'masonry' ? villageGreen : villageGrid)(put, x, z, a, rng, ctx) },
  township: { label: 'a township', clear: 135, fit: l => l.flat * l.low * 0.34, plan: township },
  lumber: { label: 'a sawmill', clear: 40, fit: l => l.wet * l.flat * 0.32, core: 'sawmill', ring: [['cottage', 1, 24], ['shed', 1, 19], ['cart', 2, 15], ['poweredge', 1, 14]] },
  refuge: { label: 'a mountain refuge', fit: l => l.high * l.steep * 0.28 + 0.02, core: 'shelterhut', ring: [['cairn', 2, 7], ['noticeboard', 1, 4]] },
  depot: { label: 'a freight depot', clear: 60, fit: l => l.flat * l.road * 0.5 + l.flat * 0.03, core: 'warehouse', ring: [['warehouse', 1, 32], ['container', 4, 22], ['poweredge', 2, 26], ['busstop', 1, 26], ['garage', 1, 36]] },
  hamlet: { label: 'a hamlet', clear: 44, fit: l => l.flat * (0.3 + 0.7 * l.wet) * 0.9, plan: hamlet },
  fishing: { label: 'a fishing landing', clear: 40, fit: l => l.shore * 1.6, plan: fishing },
  graveyard: { label: 'a burial ground', fit: l => l.flat * 0.18, core: 'graves', ring: [['gate', 1, 9], ['shrine', 1, 15], ['lamp', 2, 11], ['bench', 2, 12]] },
  shrine: { label: 'a shrine', fit: l => 0.12 + l.high * 0.14, core: 'shrine', ring: [['bench', 2, 8], ['lamp', 2, 7], ['cairn', 2, 12]] },
  monument: { label: 'a monument', fit: l => l.high * 0.16, core: 'monument', ring: [['bench', 3, 9], ['lamp', 4, 8]] },
  power: { label: 'a power station', clear: 90, fit: l => l.flat * l.wet * 0.14, core: 'longhouse', ring: [['coolingtower', 2, 58], ['substation', 1, 30], ['pylon', 3, 82], ['spheretank', 1, 34]] },
  refinery: { label: 'a refinery', clear: 70, fit: l => l.flat * (1 - l.wet) * 0.2, core: 'column', ring: [['column', 3, 14], ['spheretank', 3, 34], ['longhouse', 1, 28], ['gastanks', 2, 20], ['tank', 2, 44]] },
  // places a planet's people build for bigger reasons
  airfield: { label: 'an airfield', clear: 170, must: /^gb_hangar_/, fit: l => l.plain * l.low * 0.5, plan: airfield },
  base: { label: 'a military base', clear: 100, guarded: true, must: /^gb_barracks_/, fit: l => l.plain * 0.4, plan: base },
  factory: { label: 'a factory', clear: 85, must: /^gb_factory_/, fit: l => l.plain * (0.9 + 0.6 * l.road), plan: factoryYard },
  harbour: { label: 'a harbour', clear: 75, must: /^gb_warehouse_/, fit: l => l.shore * 0.75, plan: harbour },
  observatory: { label: 'an observatory', clear: 44, must: /^gb_observatory_/, fit: l => l.high * l.plain * 0.2 + 0.004, core: 'observatory', ring: [['cottage', 1, 24], ['shed', 1, 18], ['radiomast', 1, 26], ['lamp', 2, 13], ['bench', 1, 12]] },
  fuel: { label: 'a fuel stop', fit: l => l.flat * 0.3 * l.road, core: 'fuelcanopy', ring: [['fuelpump', 2, 3.5], ['garage', 1, 20], ['busstop', 1, 16], ['roadsign', 1, 18], ['skip_bin', 1, 11]] },
};
// a front (-z in the kit) that looks toward (fx, fz); a long axis (+z) that runs along it
const facing = (fx, fz) => Math.atan2(-fx, -fz), along = (dx, dz) => Math.atan2(dx, dz);
// a lane with houses either side looking onto it, a green with the well or fountain at its middle, a gate where the track comes in
function village(put, x, z, a, rng) {
  const ux = Math.cos(a), uz = Math.sin(a), n = rng.int(4, 6), gap = 13.5, L = (n + 0.6) * gap, lanes = [[x - ux * L, z - uz * L, x + ux * L, z + uz * L, 3.4]];
  const at = (s, o) => [x + ux * s - uz * o, z + uz * s + ux * o];
  { const [px, pz] = at(0, -10); put(rng.next() < 0.5 ? 'fountain' : 'villagewell', px, pz, rng.range(0, 6.28)); }
  const lookIn = o => facing(uz * o, -ux * o);                     // a front that looks at the lane, from offset o
  { const o = -27, big = rng.next() < 0.45 ? 'temple' : rng.next() < 0.5 ? 'shrine' : 'monument', [px, pz] = at(rng.next() < 0.5 ? 15 : -15, o); put(big, px, pz, big === 'temple' ? lookIn(o) : 0); }
  { const o = 19, [px, pz] = at(0, o); put('hall', px, pz, lookIn(o)); }
  { const [px, pz] = at(rng.next() < 0.5 ? 17 : -17, 11); put('pavilion', px, pz, rng.range(0, 6.28)); }
  { const [px, pz] = at(5, -6.2); put('noticeboard', px, pz, lookIn(-6.2)); }
  for (let u = -L + 14; u < L; u += 26) { const [px, pz] = at(u, 5.4); put('poweredge', px, pz, a); }
  { const [px, pz] = at(L - 12, -6.5); put('busstop', px, pz, lookIn(-6.5)); }
  { const [px, pz] = at(-9, -6.5); put('marketcross', px, pz, facing(uz, -ux)); }
  for (const s of [9, 13.5]) { const [px, pz] = at(s, -6.5); put('bandstall', px, pz, facing(-uz, ux)); }     // what they grew, sold by the lane
  for (const [s, o] of [[L * 0.3, 54], [-L * 0.3, -56], [L * 0.75, -58]]) { const [px, pz] = at(s, o); put('cropfield', px, pz, a + rng.range(-0.1, 0.1)); }
  for (const s of [-L, L]) { const [px, pz] = at(s + (s < 0 ? 5 : -5), 0); put('gate', px, pz, along(ux, uz)); }
  const civics = rng.shuffle(['inn', 'smithy', 'garage', 'clinic', 'school', 'shop']);
  for (const side of [-1, 1]) for (let i = -n; i <= n; i++) {
    if (Math.abs(i) < 2) continue;                                            // the green
    const s = i * gap + rng.range(-1.5, 1.5), o = side * rng.range(10.5, 13), [px, pz] = at(s, o), [lx, lz] = [-(-uz * o), -(ux * o)];
    const q = rng.next(), civic = civics.length && rng.next() < 0.3 ? civics.shift() : null, k = civic || (q < 0.12 ? 'shop' : q < 0.22 ? 'longhouse' : q < 0.36 ? 'hut' : 'cottage');
    if (civic) { const [cx, cz] = at(s, side * rng.range(13, 15)); put(k, cx, cz, facing(lx, lz)); } else put(k, px, pz, facing(lx, lz));
    if (rng.next() < 0.6) { const [bx, bz] = at(s + rng.range(-3, 3), side * rng.range(21, 25)); put(rng.next() < 0.75 ? 'shed' : 'cart', bx, bz, facing(lx, lz) + rng.range(-0.2, 0.2)); }
    if (rng.next() < 0.4) { const [bx, bz] = at(s + rng.range(-5, 5), side * rng.range(31, 38)); put(rng.next() < 0.7 ? 'cottage' : 'hut', bx, bz, facing(lx, lz)); }   // a back row, off the lane
    if (i % 2 === 0) { const [bx, bz] = at(s + gap * 0.5, side * 4); put('lamp', bx, bz, facing(lx, lz)); }
    if (rng.next() < 0.12) { const [bx, bz] = at(s + gap * 0.5, side * 7); put(rng.next() < 0.5 ? 'bench' : 'cart', bx, bz, facing(lx, lz)); }
  }
  for (const [k, s, o] of [['watertower', L * 0.55, 30], ['graves', -L * 0.6, 36], ['swings', 26, -24], ['picnic', -9, 11], ['bench', 6, -9], ['bench', -6, -9], ['haybale', L * 0.7, -30], ['animalpen', -L * 0.3, -36], ['stable', L * 0.4, -34], ['pumphouse', L * 0.75, 30], ['trough', L * 0.2, -28]]) { const [px, pz] = at(s, o); put(k, px, pz, rng.range(0, 6.28)); }
  return lanes;
}
// a small town that grew by itself: two streets crossing at a covered market, tenements close to the middle, houses further out, sheds and works at the edge
function township(put, x, z, a, rng) {
  const ux = Math.cos(a), uz = Math.sin(a), vx = -uz, vz = ux, L = 118, L2 = 92, lanes = [[x - ux * L, z - uz * L, x + ux * L, z + uz * L, 4.2], [x - vx * L2, z - vz * L2, x + vx * L2, z + vz * L2, 3.8]];
  const at = (s, o) => [x + ux * s + vx * o, z + uz * s + vz * o];
  const onMain = (s, o, k) => { const [px, pz] = at(s, o); put(k, px, pz, facing(-vx * o, -vz * o)); }, onCross = (s, o, k) => { const [px, pz] = at(s, o); put(k, px, pz, facing(-ux * s, -uz * s)); };
  { const [px, pz] = at(17, 19); put('markethall', px, pz, a); }
  onMain(-22, 22, 'hall'); onMain(20, -32, 'temple');
  { const [px, pz] = at(-13, -13); put('fountain', px, pz, 0); }
  { const [px, pz] = at(-8, -7); put('marketcross', px, pz, 0); }
  { const [px, pz] = at(10, -7); put('noticeboard', px, pz, facing(-vx * -7, -vz * -7)); }
  const inner = rng.shuffle(['tenement', 'tenement', 'tenement', 'inn', 'clinic', 'shop', 'shop', 'garage', 'tenement', 'school', 'shop']);
  const mid = rng.shuffle(['cottage', 'cottage', 'cottage', 'shop', 'hut', 'longhouse', 'smithy', 'cottage', 'stable', 'cottage', 'shop']);
  for (const side of [-1, 1]) for (let s = 40; s < L - 8; s += 15.5) for (const e of [-1, 1]) { const q = s < 76 ? inner : mid, k = q.length ? q.pop() : 'cottage'; onMain(e * s, side * rng.range(14.5, 16.5), k); if (s > 60 && rng.next() < 0.55) onMain(e * s + rng.range(-3, 3), side * rng.range(29, 34), rng.next() < 0.7 ? 'cottage' : 'shed'); }
  for (const side of [-1, 1]) for (let o = 38; o < L2 - 7; o += 15) for (const e of [-1, 1]) { onCross(side * rng.range(14, 16), e * o, o < 60 && inner.length ? inner.pop() : mid.length ? mid.pop() : 'cottage'); }
  for (let u = -L + 8; u < L; u += 24) { const [px, pz] = at(u, 7.2); put('lamp', px, pz, a); const [qx, qz] = at(u + 12, -7.2); put('poweredge', qx, qz, a); }
  for (const [k, s, o] of [['warehouse', L * 0.72, -50], ['warehouse', -L * 0.8, 50], ['watertower', L * 0.5, 54], ['graves', -L * 0.55, -56], ['swings', -44, 42], ['busstop', L - 16, -8], ['busstop', -L + 16, 8], ['gate', L - 3, 0], ['gate', -L + 3, 0], ['substation', -L * 0.3, 64]]) { const [px, pz] = at(s, o); put(k, px, pz, k === 'gate' ? along(ux, uz) : o ? facing(-vx * o, -vz * o) : a); }
  for (const [s, o] of [[L * 0.3, 78], [-L * 0.2, -84], [L * 0.8, 74], [-L * 0.75, -78]]) { const [px, pz] = at(s, o); put('cropfield', px, pz, a + rng.range(-0.08, 0.08)); }
  return lanes;
}
function hamlet(put, x, z, a, rng) {
  const n = rng.int(3, 5), ux = Math.cos(a), uz = Math.sin(a), lanes = [[x - ux * 30, z - uz * 30, x + ux * 30, z + uz * 30, 2.6]];
  for (let i = 0; i < n; i++) { const s = (i - (n - 1) / 2) * 15, o = i % 2 ? 11 : -11, px = x + ux * s - uz * o, pz = z + uz * s + ux * o; put(rng.next() < 0.3 ? 'hut' : 'cottage', px, pz, facing(uz * o, -ux * o)); }
  put('villagewell', x - uz * 6.2, z + ux * 6.2, 0);
  for (const [k, s, o] of [['shed', 8, 21], ['cart', -10, 6], ['haybale', 18, -20], ['fencepanel', 26, 12], ['bench', 2, 5], ['cropfield', 0, 40], ['scarecrow', 4, 42], ['beehives', -17, 17], ['trough', -14, -18]]) put(k, x + ux * s - uz * o, z + uz * s + ux * o, rng.range(0, 6.28));
  return lanes;
}
// a landing goes out over the water from the nearest shore: a jetty, boats tied up or drawn out, huts behind
function fishing(put, x, z, a, rng, ctx) {
  const dir = ctx.shoreDir ?? a, dx = Math.cos(dir), dz = Math.sin(dir); let d = 0;
  for (; d < 170 && ctx.h(dx * d, dz * d) > ctx.sea + 0.1; d += 3);
  const cx = x + dx * d, cz = z + dz * d, sx = -dz, sz = dx;
  put('jetty', cx + dx * 9, cz + dz * 9, along(dx, dz), { y: ctx.sea, wet: true });
  for (const [s, o] of [[5.5, 6], [-6, 15]]) put('boat', cx + dx * o + sx * s, cz + dz * o + sz * s, along(dx, dz) + rng.range(-0.25, 0.25), { y: ctx.sea - 0.3, wet: true });
  for (let i = -1; i <= 1; i++) { const r = 18 + rng.range(0, 7), px = cx - dx * r + sx * i * 13, pz = cz - dz * r + sz * i * 13; put(rng.next() < 0.6 ? 'hut' : 'shed', px, pz, facing(dx, dz)); }
  for (const [k, r, s] of [['cart', 9, 7], ['barrels', 7, -6], ['lamp', 6, 3], ['villagewell', 30, -20]]) put(k, cx - dx * r + sx * s, cz - dz * r + sz * s, rng.range(0, 6.28));
  return [];
}
// how a people lays out a village: along one street, or their own way (round a green, or squared off in blocks)
const LAYOUT = { masonry: { street: 3, own: 4 }, garden: { street: 1, own: 4 }, corporate: { street: 1, own: 5 }, brutalist: { street: 1, own: 6 }, foundry: { street: 3, own: 3 }, neon: { street: 3, own: 3 } };
const CIVIC = ['inn', 'smithy', 'garage', 'clinic', 'school', 'shop', 'shop'];
// houses in a ring, all looking in at a common with the well on it, a track out each side
function villageGreen(put, x, z, a, rng) {
  const R = rng.range(30, 40), n = Math.round(2 * Math.PI * R / 14), at = (b, r) => [x + Math.cos(b) * r, z + Math.sin(b) * r], lanes = put.lanes = [], out = [a, a + Math.PI + rng.range(-0.5, 0.5)];
  for (const b of out) { const [p, q] = at(b, 4), [u, v] = at(b, R + 34); lanes.push([p, q, u, v, 2.8]); }
  put(rng.next() < 0.5 ? 'fountain' : 'villagewell', x, z, rng.range(0, 6.28));
  { const [p, q] = at(a + 2, 9); put('pavilion', p, q, rng.range(0, 6.28)); } { const [p, q] = at(a + 4, 10); put('marketcross', p, q, 0); } { const [p, q] = at(a + 1, 12); put('bench', p, q, a + 1); } { const [p, q] = at(a + 5, 12); put('noticeboard', p, q, a + 5); }
  const civ = rng.shuffle(CIVIC.slice());
  for (let i = 0; i < n; i++) { const b = a + (i + 0.5) / n * 6.283; if (out.some(o => Math.abs(Math.atan2(Math.sin(b - o), Math.cos(b - o))) < 0.3)) continue;
    const [p, q] = at(b, R), k = i === 2 ? 'hall' : i === Math.floor(n / 2) + 1 ? (rng.next() < 0.5 ? 'temple' : 'hall') : civ.length && rng.next() < 0.3 ? civ.pop() : rng.next() < 0.18 ? 'hut' : 'cottage'; put(k, p, q, facing(-Math.cos(b), -Math.sin(b)));
    if (rng.next() < 0.5) { const [s, t] = at(b + 0.04, R + 14); put('shed', s, t, facing(-Math.cos(b), -Math.sin(b)) + rng.range(-0.3, 0.3)); }
    if (i % 3 === 0) { const [s, t] = at(b + 3.14 / n, R - 12); put('lamp', s, t, b); } }
  for (const b of [a + 1.2, a + 2.6, a + 4.2]) { const [p, q] = at(b, R + 44); put('cropfield', p, q, b + 1.57); }
  for (const [k, b, r] of [['watertower', a + 1.8, R + 26], ['graves', a + 3.6, R + 30], ['swings', a + 0.8, 18], ['stable', a + 5.4, R + 24], ['beehives', a + 2.2, R + 22]]) { const [p, q] = at(b, r); put(k, p, q, b); }
  return lanes;
}
// squared off: parallel streets and a cross street, a row of houses to each block
function villageGrid(put, x, z, a, rng) {
  const ux = Math.cos(a), uz = Math.sin(a), vx = -uz, vz = ux, at = (s, o) => [x + ux * s + vx * o, z + uz * s + vz * o], rows = [-22, 22], L = 58, lanes = put.lanes = rows.map(o => [...at(-L, o), ...at(L, o), 3]).concat([[...at(0, -44), ...at(0, 44), 3]]);
  const civ = rng.shuffle(CIVIC.slice());
  for (const o of rows) for (const side of [-1, 1]) { const O = o + side * 11.5; for (let s = -L + 9; s < L - 6; s += 13.5) { if (Math.abs(s) < 8) continue; const [p, q] = at(s, O), k = civ.length && rng.next() < 0.3 ? civ.pop() : rng.next() < 0.14 ? 'tenement' : rng.next() < 0.12 ? 'longhouse' : 'cottage'; put(k, p, q, facing(-vx * side, -vz * side)); } }
  { const [p, q] = at(-9, 0); put('hall', p, q, facing(ux, uz)); } { const [p, q] = at(11, 0); put(rng.next() < 0.5 ? 'fountain' : 'villagewell', p, q, 0); }
  for (let s = -L + 12; s < L; s += 22) { const [p, q] = at(s, 18); put('lamp', p, q, a); const [e, f] = at(s + 8, -18); put('poweredge', e, f, a); }
  for (const [k, s, o] of [['busstop', L - 6, 26], ['noticeboard', 5, 7], ['bench', 5, -7], ['watertower', L + 8, -38], ['warehouse', -L - 8, 40], ['gate', 0, 44], ['swings', 22, 4]]) { const [p, q] = at(s, o); put(k, p, q, k === 'gate' ? along(vx, vz) : facing(-vx, -vz)); }
  for (const [s, o] of [[-34, 62], [34, -62], [L + 26, 12]]) { const [p, q] = at(s, o); put('cropfield', p, q, a); }
  return lanes;
}
// a strip of mown ground, hangars along one side of it, a tower, fuel
function airfield(put, x, z, a, rng) {
  const ux = Math.cos(a), uz = Math.sin(a), L = 150, at = (s, o) => [x + ux * s - uz * o, z + uz * s + ux * o], lanes = put.lanes = [[x - ux * L, z - uz * L, x + ux * L, z + uz * L, 11]];
  const look = o => facing(uz * o, -ux * o), n = rng.int(2, 4);
  for (let i = 0; i < n; i++) { const o = 44, s = (i - (n - 1) / 2) * 40, [px, pz] = at(s, o); put.big('hangar', px, pz, look(o)); }
  { const o = 30, s = 70, [px, pz] = at(s, o); put.big('controltower', px, pz, look(o)); }
  for (const [k, s, o] of [['warehouse', -82, 46], ['gastanks', -64, 22], ['gastanks', -72, 22], ['fuelpump', -56, 19], ['radiomast', 92, 30], ['guardhouse', 0, 74], ['lamp', -30, 18], ['lamp', 10, 18], ['lamp', 50, 18], ['bench', 62, 21]]) { const [px, pz] = at(s, o); put(k, px, pz, look(o)); }
  return lanes;
}
// a fence you shouldn't cross, a gate with a guard on it, barracks, watchtowers at the corners
function base(put, x, z, a, rng) {
  const ux = Math.cos(a), uz = Math.sin(a), vx = -uz, vz = ux, H = 62, at = (s, o) => [x + ux * s + vx * o, z + uz * s + vz * o], lanes = put.lanes = [[...at(-H - 4, 0), ...at(H * 0.55, 0), 3.2]];
  const look = o => facing(-vx * o, -vz * o);
  { const o = -24, [px, pz] = at(-6, o); put.big('barracks', px, pz, look(o)); } { const o = 24, [px, pz] = at(-6, o); put.big('barracks', px, pz, look(o)); }
  { const o = -28, [px, pz] = at(34, o); put.big('warehouse', px, pz, look(o)); } { const o = 26, [px, pz] = at(36, o); put.big('hall', px, pz, look(o)); }
  { const [px, pz] = at(-H + 7, 8.5); put('guardhouse', px, pz, look(8.5)); }
  for (const [s, o] of [[H - 4, H - 4], [H - 4, -H + 4], [-H + 4, H - 4], [-H + 4, -H + 4]]) { const [px, pz] = at(s, o); put('watchtower', px, pz, 0); }
  for (const [k, s, o] of [['radiomast', 50, 0], ['bunker', 14, 46], ['sandbag', -H + 12, -7], ['sandbag', -H + 12, 7], ['generatorset', 18, -46], ['gastanks', 44, 48], ['lamp', -18, 5], ['lamp', 14, 5], ['lamp', 40, 5]]) { const [px, pz] = at(s, o); put(k, px, pz, 0); }
  const fence = (s0, o0, s1, o1) => { const L = Math.hypot(s1 - s0, o1 - o0), n = Math.round(L / 6), r = along(ux * (s1 - s0) / L + vx * (o1 - o0) / L, uz * (s1 - s0) / L + vz * (o1 - o0) / L) + Math.PI / 2; for (let i = 0; i < n; i++) { const f = (i + 0.5) / n, s = s0 + (s1 - s0) * f, o = o0 + (o1 - o0) * f; if (s0 === -H && s1 === -H && Math.abs(o) < 7) continue; const [px, pz] = at(s, o); put('stockfence', px, pz, r); } };
  fence(-H, -H, H, -H); fence(H, -H, H, H); fence(H, H, -H, H); fence(-H, H, -H, -H);
  return lanes;
}
function factoryYard(put, x, z, a, rng) {
  const ux = Math.cos(a), uz = Math.sin(a), at = (s, o) => [x + ux * s - uz * o, z + uz * s + ux * o], lanes = put.lanes = [[...at(-70, -20), ...at(70, -20), 4.2]], look = o => facing(uz * (o + 20), -ux * (o + 20));
  { const [px, pz] = at(-14, 8); put.big('factory', px, pz, look(8)); }
  { const [px, pz] = at(38, 10); put.big('warehouse', px, pz, look(10)); } if (rng.next() < 0.5) { const [px, pz] = at(-60, 10); put.big('warehouse', px, pz, look(10)); }
  for (const [k, s, o] of [['container', -46, -38], ['container', -36, -38], ['container', -26, -38], ['container', 22, -40], ['tank', 56, -36], ['substation', 66, 22], ['pylon', 76, 46], ['garage', 18, -46], ['lamp', -40, -14], ['lamp', 0, -14], ['lamp', 40, -14], ['gate', -66, -20], ['busstop', 58, -26], ['pallettruck', -12, -28]]) { const [px, pz] = at(s, o); put(k, px, pz, k === 'gate' ? along(ux, uz) : look(o)); }
  return lanes;
}
// a real harbour: jetties out over the water, boats at them, sheds and a hall behind
function harbour(put, x, z, a, rng, ctx) {
  const dir = ctx.shoreDir ?? a, dx = Math.cos(dir), dz = Math.sin(dir); let d = 0;
  for (; d < 170 && ctx.h(dx * d, dz * d) > ctx.sea + 0.1; d += 3);
  const cx = x + dx * d, cz = z + dz * d, sx = -dz, sz = dx, back = (r, s) => [cx - dx * r + sx * s, cz - dz * r + sz * s], front = facing(dx, dz);
  put.lanes = [[...back(14, -44), ...back(14, 44), 3.4]];
  for (const s of [-18, 0, 18]) { const jx = cx + dx * 9 + sx * s, jz = cz + dz * 9 + sz * s; put('jetty', jx, jz, along(dx, dz), { y: ctx.sea, wet: true }); for (const q of [-1, 1]) if (rng.next() < 0.75) put('boat', jx + sx * q * 5.5 + dx * rng.range(-3, 6), jz + sz * q * 5.5 + dz * rng.range(-3, 6), along(dx, dz) + rng.range(-0.15, 0.15), { y: ctx.sea - 0.3, wet: true }); }
  { const [px, pz] = back(26, -24); put.big('warehouse', px, pz, front); } { const [px, pz] = back(24, 24); put.big('warehouse', px, pz, front); } { const [px, pz] = back(34, 0); put.big('hall', px, pz, front); }
  for (const [k, r, s] of [['container', 11, -30], ['container', 11, -21], ['container', 11, 28], ['barrels', 8, 8], ['barrels', 8, -8], ['lamp', 6, -12], ['lamp', 6, 12], ['cart', 10, 3], ['inn', 56, -28], ['cottage', 56, 12], ['shop', 56, 34]]) { const [px, pz] = back(r, s); put(k, px, pz, front); }
  return put.lanes;
}
// do two turned footprints overlap? (separating axes) a = { x, z, rot, box }
function overlaps(a, b, m = 0.6) {
  const corners = q => { const c = Math.cos(q.rot), s = Math.sin(q.rot); return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, j]) => { const u = i * (q.box[0] + m / 2), v = j * (q.box[1] + m / 2); return [q.x + u * c + v * s, q.z - u * s + v * c]; }); };
  const A = corners(a), B = corners(b);
  for (const q of [a, b]) for (const ax of [[Math.cos(q.rot), -Math.sin(q.rot)], [Math.sin(q.rot), Math.cos(q.rot)]]) {
    const pa = A.map(p => p[0] * ax[0] + p[1] * ax[1]), pb = B.map(p => p[0] * ax[0] + p[1] * ax[1]);
    if (Math.max(...pa) < Math.min(...pb) || Math.max(...pb) < Math.min(...pa)) return false;
  }
  return true;
}
const cache = new Map();
export function sitesInTile(planet, ti, tj) {
  const ck = planet.universeSeed.join(':') + '|' + ti + ',' + tj; if (cache.has(ck)) return cache.get(ck); if (cache.size > 400) cache.clear();
  const out = [], rng = new Rng(derive(planet.seed, 'outposts', [ti, tj])), cul = cultureOf(planet);
  if (rng.next() < 0.5) {     // about every other 900 m square has someone in it
    const x = (ti + rng.range(0.15, 0.85)) * TILE, z = (tj + rng.range(0.15, 0.85)) * TILE, S = surfaceAt(planet, x, z);
    if (S.town < 0.01 && S.h > planet.seaLevel + 2 && !S.road) {
      // what's the land like here?
      const h = (dx, dz) => surfaceAt(planet, x + dx, z + dz).h, d = Math.max(Math.abs(h(30, 0) - S.h), Math.abs(h(-30, 0) - S.h), Math.abs(h(0, 30) - S.h), Math.abs(h(0, -30) - S.h));
      let shore = 0, shoreDir = null; for (let k = 0; k < 8 && !shore; k++) if (h(Math.cos(k * 0.785) * 160, Math.sin(k * 0.785) * 160) < planet.seaLevel) { shore = 1; shoreDir = k * 0.785; }
      let road = 0; for (let k = 0; k < 8 && !road; k++) if (surfaceAt(planet, x + Math.cos(k * 0.785) * 40, z + Math.sin(k * 0.785) * 40).road > 0.5) road = 1;
      let d80 = 0; for (let k = 0; k < 8; k++) d80 = Math.max(d80, Math.abs(h(Math.cos(k * 0.785) * 80, Math.sin(k * 0.785) * 80) - S.h));
      const land = { plain: d80 < 7 ? 1 : d80 < 14 ? 0.25 : 0, flat: d < 3 ? 1 : d < 7 ? 0.45 : 0.05, steep: d > 6 ? 1 : 0.15, wet: moisture(planet, x, z), low: S.h < 180 ? 1 : 0.4, high: S.h > 150 ? 1 : 0.25, shore, road };
      const pick = rng.weighted(Object.entries(KINDS).map(([k, K]) => [k, Math.max(0.0001, K.fit(land))])), K = KINDS[pick], rot0 = rng.range(0, 6.28), items = [];
      const fields = [];
      // one thing placed: a family becomes this planet's version of it, with its own footing and walls; on land, or over water if it says so
      const place = (k0, px, pz, rot, opt = {}) => {
        // a field isn't a thing but a stretch of land: soil and rows that follow the ground (render/outposts.js), and a fence round some of them
        if (k0 === 'cropfield') {
          const A = rng.range(11, 20), B = rng.range(8, 14), yard = { x: px, z: pz, rot, box: [A, B] }, Q0 = surfaceAt(planet, px, pz);
          const c = Math.cos(rot), s = Math.sin(rot), hs = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => surfaceAt(planet, px + a * A * c + b * B * s, pz - a * A * s + b * B * c));
          if (Q0.town > 0.01 || hs.some(q => q.road > 0.01 || q.town > 0.01 || q.h < planet.seaLevel + 0.6) || Math.max(...hs.map(q => q.h)) - Math.min(...hs.map(q => q.h)) > 7) return;
          if (items.some(o => (o.box || o.r) && overlaps(yard, { x: o.x, z: o.z, rot: o.rot, box: o.box || [o.r, o.r] })) || fields.some(f => overlaps(yard, f))) return;
          fields.push({ ...yard, crop: designOf(planet, 'crop', 1, 0.12) });
          if (rng.next() < 0.6) { const fence = designOf(planet, 'stockfence', 2, 0);
            for (const [u0, v0, u1, v1] of [[-A, -B, A, -B], [A, -B, A, B], [A, B, -A, B], [-A, B, -A, -B]]) { const L = Math.hypot(u1 - u0, v1 - v0), n = Math.round(L / 6), du = (u1 - u0) / L, dv = (v1 - v0) / L;
              for (let i = 0; i < n; i++) { if (i === 0 && u0 === -A && v0 === -B) continue;   // the way in
                const q = (i + 0.5) * L / n, v = v0 + dv * q, fu = u0 + du * q, X = px + fu * c + v * s, Z = pz - fu * s + v * c, Q = surfaceAt(planet, X, Z); if (Q.h < planet.seaLevel + 0.5 || Q.road > 0.01) continue; items.push({ k: fence, x: X, y: Q.h, z: Z, rot: rot + (du ? 0 : 1.5708), r: 0, s: L / n / 6, box: [L / n / 2, 0.15, 0], top: 1.1 }); } } }
          return;
        }
        let k = k0, foot = 0;
        if (FAM.has(k0) || FORMS[k0] || SMALL[k0]) { k = designOf(planet, k0, Math.round(px * 7 + pz * 13)); foot = footOf(k, planet); }
        const Q = surfaceAt(planet, px, pz);
        if (Q.town > 0.01 || Q.road > 0.01) return;
        if (opt.wet) { items.push({ k, x: px, y: opt.y, z: pz, rot, r: 0, s: 1 }); return; }
        if (Q.h < planet.seaLevel + 0.5) return;
        let y = Q.h, gb = k.startsWith('gb_');
        if (gb) {                                                   // you can go in: the floor clears all the ground under it, so none comes up through it, and steps make up the drop
          const c = Math.cos(rot), s = Math.sin(rot); let lo = Infinity, hi = -Infinity;
          for (let a = -1; a <= 1; a += 0.5) for (let b = -1; b <= 1; b += 0.5) { const u = a * (foot[0] + 0.4), v = b * (foot[1] + 0.4), g = surfaceAt(planet, px + u * c + v * s, pz - u * s + v * c).h; if (g < lo) lo = g; if (g > hi) hi = g; }
          if (hi - lo > (foot[0] > 9 ? 4.2 : 3.1) || lo < planet.seaLevel + 0.3) return;
          y = hi + 0.12;
        } else if (foot) {                                                 // level on its footing; too steep to build on, and they don't
          const c = Math.cos(rot), s = Math.sin(rot), hs = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => { const u = a * foot[0], v = b * foot[1]; return surfaceAt(planet, px + u * c + v * s, pz - u * s + v * c).h; });
          const lo = Math.min(...hs), hi = Math.max(...hs); if (hi - lo > Math.max(3, foot[0] * 0.45) || lo < planet.seaLevel + 0.3) return;
          y = Math.max((lo + hi) / 2, surfaceAt(planet, px - s * foot[1], pz - c * foot[1]).h - 0.05);  // the floor is never below the ground at the front door
        }
        const it = { k, x: px, y, z: pz, rot, r: r_[k] ?? 0, s: 1 }; if (foot) { it.box = foot; it.r = 0; }
        const hit = it.box || [Math.max(0.4, it.r), Math.max(0.4, it.r)], me = { x: px, z: pz, rot, box: hit };   // nobody builds through their neighbour
        if (items.some(o => (o.box || o.r > 0) && overlaps(me, { x: o.x, z: o.z, rot: o.rot, box: o.box || [o.r, o.r] }))) return;
        if (foot && fields.some(f => overlaps(me, f))) return;
        if (gb) {                                                   // the steps up to its door, down to wherever the ground is; if they'd never get there, nobody builds here
          const D = designById(planet, k), pl = designPlan(planet, D), dr = pl.doors[pl.entrance], c = Math.cos(rot), s = Math.sin(rot), u = dr.x - D.w / 2, W = dr.width + 0.5, treads = []; let n = 0, down = false;
          for (let cap = D.w > 18 ? 26 : 18; n < cap; n++) { const v = -D.d / 2 - 0.17 - n * 0.34, top = y - (n + 1) * 0.19, X = px + u * c + v * s, Z = pz - u * s + v * c; if (top < surfaceAt(planet, X, Z).h - 0.04) { down = true; break; } treads.push({ k: 'gb_step', x: X, y: top, z: Z, rot, r: 0, s: W }); }
          if (!down) return;
          if (n) it.stoop = { u, W, n, run: 0.34, rise: 0.19 };
          items.push(it, ...treads); return;
        }
        items.push(it);
      };
      // something big looks about for a spot it fits: the ground under it, level enough, near where it was meant to go
      place.big = (k0, px, pz, rot) => { for (const [ox, oz] of [[0, 0], [7, 0], [-7, 0], [0, 7], [0, -7], [13, 6], [-13, 6], [13, -6], [-13, -6], [20, 0], [-20, 0], [0, 20], [0, -20]]) { const n = items.length; place(k0, px + ox, pz + oz, rot); if (items.length === n) continue;
        const it = items[n], reach = Math.hypot(it.box?.[0] || 1, it.box?.[1] || 1); if ((place.lanes || []).some(([x0, z0, x1, z1, w]) => { const L = Math.hypot(x1 - x0, z1 - z0) || 1, u = Math.max(0, Math.min(L, ((it.x - x0) * (x1 - x0) + (it.z - z0) * (z1 - z0)) / L)); return Math.hypot(x0 + (x1 - x0) * u / L - it.x, z0 + (z1 - z0) * u / L - it.z) < reach + w + 2; })) { items.length = n; continue; }   // (not on the lane)
        return true; } return false; };
      let lanes = [];
      if (K.plan) lanes = K.plan(place, x, z, rot0, rng, { culture: cul.key, h: (a, b) => h(a, b), sea: planet.seaLevel, shoreDir });
      else {
        if (K.must) place.big(K.core, x, z, rot0); else place(K.core, x, z, rot0);
        for (const [k, n, R] of K.ring) for (let q = 0; q < n; q++) { const a = rot0 + (q + rng.next() * 0.5) * 6.283 / n, r2 = R * rng.range(0.8, 1.15); place(k, x + Math.cos(a) * r2, z + Math.sin(a) * r2, k === 'fencepanel' ? a + 1.57 : rng.range(0, 6.28)); }
      }
      // a place people live has a way in: a track from the end of its lane to the nearest road, wandering a little
      if (K.must && !items.some(i => K.must.test(i.k))) items.length = 0, fields.length = 0;      // what it's all for wouldn't stand here: nobody built it
      const tracks = [];
      if (items.length && /^(village|township|hamlet|depot|lumber|airfield|base|factory|harbour|observatory)$/.test(pick)) {
        const ends = lanes.length ? [[lanes[0][0], lanes[0][1]], [lanes[0][2], lanes[0][3]]] : [[x, z]]; let to = null;
        for (let r = 80; r <= 1300 && !to; r += 70) for (let k = 0; k < 14 && !to; k++) { const a = k * 0.449, X = x + Math.cos(a) * r, Z = z + Math.sin(a) * r; if (surfaceAt(planet, X, Z).road > 0.5) to = [X, Z]; }
        if (to) { const from = ends.slice().sort((p, q) => Math.hypot(p[0] - to[0], p[1] - to[1]) - Math.hypot(q[0] - to[0], q[1] - to[1]))[0], L = Math.hypot(to[0] - from[0], to[1] - from[1]), n = Math.max(2, Math.round(L / 9)), nx = -(to[1] - from[1]) / L, nz = (to[0] - from[0]) / L, p1 = rng.range(0, 6.28), p2 = rng.range(0, 6.28), pts = []; let ok = true;
          for (let i = 0; i <= n; i++) { const f = i / n, off = Math.sin(f * Math.PI) * (Math.sin(f * 7 + p1) * 14 + Math.sin(f * 17 + p2) * 5), px = from[0] + (to[0] - from[0]) * f + nx * off, pz = from[1] + (to[1] - from[1]) * f + nz * off, Q = surfaceAt(planet, px, pz); if (Q.h < planet.seaLevel + 0.4 || Q.town > 0.05) { ok = false; break; } pts.push([+px.toFixed(1), +pz.toFixed(1)]); }
          if (ok) tracks.push({ pts, w: lanes[0]?.[4] ? Math.min(2.8, lanes[0][4]) : 2.4 }); }
      }
      if (items.length) out.push({ guarded: !!K.guarded, tracks, kind: pick, label: K.label, x, y: S.h, z, items, lanes, fields, clear: K.clear || 62, id: `site:${ti},${tj}`, wear: cul.wear });
    }
  }
  cache.set(ck, out);
  return out;
}
export function sitesNear(planet, x, z, R, fn) {
  const i0 = Math.floor((x - R) / TILE), i1 = Math.floor((x + R) / TILE), j0 = Math.floor((z - R) / TILE), j1 = Math.floor((z + R) / TILE);
  for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) for (const s of sitesInTile(planet, i, j)) fn(s);
}
// the sites working the land near a spot, then: is this ground tilled or walked bare? (a field, a lane). Grass doesn't grow on it.
export function workedNear(planet, x, z, R) { const out = []; sitesNear(planet, x, z, R + 1500, S => { if ((S.fields.length || S.lanes.length || S.items.some(i => i.box && i.k.startsWith('gb_'))) && Math.hypot(S.x - x, S.z - z) < S.clear + R || S.tracks?.some(T => nearTrack(T, x, z, R))) out.push(S); }); return out; }
// a track, indexed once: which of its stretches pass each 32 m square
function trackIndex(T) {
  if (T.idx) return T.idx;
  const m = new Map(), C = 32, reach = T.w + 2; let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9;
  T.pts.forEach((p, i) => { x0 = Math.min(x0, p[0]); z0 = Math.min(z0, p[1]); x1 = Math.max(x1, p[0]); z1 = Math.max(z1, p[1]); const q = T.pts[i + 1]; if (!q) return;
    for (let a = Math.floor((Math.min(p[0], q[0]) - reach) / C); a <= Math.floor((Math.max(p[0], q[0]) + reach) / C); a++) for (let b = Math.floor((Math.min(p[1], q[1]) - reach) / C); b <= Math.floor((Math.max(p[1], q[1]) + reach) / C); b++) { const k = a * 100003 + b; (m.get(k) || m.set(k, []).get(k)).push(i); } });
  Object.defineProperty(T, 'idx', { value: { m, C, box: [x0, z0, x1, z1] }, enumerable: false });
  return T.idx;
}
export function tracksNear(planet, x, z, R) { const out = []; sitesNear(planet, x, z, R + 1500, S => { for (const T of S.tracks || []) if (nearTrack(T, x, z, R)) out.push(T); }); return out; }
const nearTrack = (T, x, z, R) => { const { box: b } = trackIndex(T); return x > b[0] - R && x < b[2] + R && z > b[1] - R && z < b[3] + R; };
export function onTrack(T, x, z) {
  const I = trackIndex(T), segs = I.m.get(Math.floor(x / I.C) * 100003 + Math.floor(z / I.C)); if (!segs) return false;
  for (const i of segs) { const [ax, az] = T.pts[i], [bx, bz] = T.pts[i + 1], ex = bx - ax, ez = bz - az, f = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / (ex * ex + ez * ez || 1))); if (Math.hypot(ax + ex * f - x, az + ez * f - z) < T.w * 0.7) return true; }
  return false;
}
// → 1 a field, 2 a lane or track, 3 under a floor, or false
export function workedGround(sites, x, z) {
  for (const S of sites) {
    if (S.tracks) for (const T of S.tracks) if (onTrack(T, x, z)) return 2;
    for (const it of S.items) if (it.box && it.k.startsWith('gb_') && Math.abs(x - it.x) < 32 && Math.abs(z - it.z) < 32) { const c = Math.cos(it.rot), s = Math.sin(it.rot), dx = x - it.x, dz = z - it.z; if (Math.abs(dx * c - dz * s) < it.box[0] + 0.2 && Math.abs(dx * s + dz * c) < it.box[1] + 0.2) return 3; }
    for (const f of S.fields) { const c = Math.cos(f.rot), s = Math.sin(f.rot), dx = x - f.x, dz = z - f.z; if (Math.abs(dx * c - dz * s) < f.box[0] && Math.abs(dx * s + dz * c) < f.box[1]) return 1; }
    for (const [x0, z0, x1, z1, w] of S.lanes) { const L = Math.hypot(x1 - x0, z1 - z0), u = ((x - x0) * (x1 - x0) + (z - z0) * (z1 - z0)) / L; if (u < 0 || u > L) continue; const wob = Math.sin(u * 0.09) * 1.1 + Math.sin(u * 0.031 + 2) * 1.6, o = ((x - x0) * (z1 - z0) - (z - z0) * (x1 - x0)) / L; if (Math.abs(o + wob) < w * 0.7) return 2; }
  }
  return false;
}
