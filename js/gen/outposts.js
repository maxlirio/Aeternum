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
  village: { label: 'a village', clear: 92, fit: l => l.flat * l.low * (0.5 + 0.5 * l.wet) * 1.5, plan: village },
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
      const land = { flat: d < 3 ? 1 : d < 7 ? 0.45 : 0.05, steep: d > 6 ? 1 : 0.15, wet: moisture(planet, x, z), low: S.h < 180 ? 1 : 0.4, high: S.h > 150 ? 1 : 0.25, shore, road };
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
        if (FAM.has(k0)) { k = designOf(planet, k0, Math.round(px * 7 + pz * 13)); foot = footOf(k, planet); }
        const Q = surfaceAt(planet, px, pz);
        if (Q.town > 0.01 || Q.road > 0.01) return;
        if (opt.wet) { items.push({ k, x: px, y: opt.y, z: pz, rot, r: 0, s: 1 }); return; }
        if (Q.h < planet.seaLevel + 0.5) return;
        let y = Q.h;
        if (foot) {                                                 // level on its footing; too steep to build on, and they don't
          const c = Math.cos(rot), s = Math.sin(rot), hs = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => { const u = a * foot[0], v = b * foot[1]; return surfaceAt(planet, px + u * c + v * s, pz - u * s + v * c).h; });
          const lo = Math.min(...hs), hi = Math.max(...hs); if (hi - lo > Math.max(3, foot[0] * 0.45) || lo < planet.seaLevel + 0.3) return;
          y = Math.max((lo + hi) / 2, surfaceAt(planet, px - s * foot[1], pz - c * foot[1]).h - 0.05);  // the floor is never below the ground at the front door
        }
        const it = { k, x: px, y, z: pz, rot, r: r_[k] ?? 0, s: 1 }; if (foot) { it.box = foot; it.r = 0; }
        const hit = it.box || [Math.max(0.4, it.r), Math.max(0.4, it.r)], me = { x: px, z: pz, rot, box: hit };   // nobody builds through their neighbour
        if (items.some(o => (o.box || o.r > 0) && overlaps(me, { x: o.x, z: o.z, rot: o.rot, box: o.box || [o.r, o.r] }))) return;
        if (foot && fields.some(f => overlaps(me, f))) return;
        items.push(it);
      };
      let lanes = [];
      if (K.plan) lanes = K.plan(place, x, z, rot0, rng, { h: (a, b) => h(a, b), sea: planet.seaLevel, shoreDir });
      else {
        place(K.core, x, z, rot0);
        for (const [k, n, R] of K.ring) for (let q = 0; q < n; q++) { const a = rot0 + (q + rng.next() * 0.5) * 6.283 / n, r2 = R * rng.range(0.8, 1.15); place(k, x + Math.cos(a) * r2, z + Math.sin(a) * r2, k === 'fencepanel' ? a + 1.57 : rng.range(0, 6.28)); }
      }
      if (items.length) out.push({ kind: pick, label: K.label, x, y: S.h, z, items, lanes, fields, clear: K.clear || 62, id: `site:${ti},${tj}`, wear: cul.wear });
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
export function workedNear(planet, x, z, R) { const out = []; sitesNear(planet, x, z, R, S => { if ((S.fields.length || S.lanes.length) && Math.hypot(S.x - x, S.z - z) < S.clear + R) out.push(S); }); return out; }
export function workedGround(sites, x, z) {
  for (const S of sites) {
    for (const f of S.fields) { const c = Math.cos(f.rot), s = Math.sin(f.rot), dx = x - f.x, dz = z - f.z; if (Math.abs(dx * c - dz * s) < f.box[0] && Math.abs(dx * s + dz * c) < f.box[1]) return true; }
    for (const [x0, z0, x1, z1, w] of S.lanes) { const L = Math.hypot(x1 - x0, z1 - z0), u = ((x - x0) * (x1 - x0) + (z - z0) * (z1 - z0)) / L; if (u < 0 || u > L) continue; const wob = Math.sin(u * 0.09) * 1.1 + Math.sin(u * 0.031 + 2) * 1.6, o = ((x - x0) * (z1 - z0) - (z - z0) * (x1 - x0)) / L; if (Math.abs(o + wob) < w * 0.7) return true; }
  }
  return false;
}
