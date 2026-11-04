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

const TILE = 900;
const r_ = { barn: 7, grainsilo: 3, tractor: 2, harvester: 3.2, animalpen: 3.2, greenhouse: 4.6, headframe: 5, drillrig: 3.6, workcamp: 3.2, generatorset: 1.7, substation: 4.2, pylon: 3.4, windmillbig: 1.6, solarfield: 0, pumpjack: 3, watchtower: 2, radiomast: 1.4, bunker: 4, ruinwall: 0, lighthouse: 2.5, wellhead: 0.8, waterwheel: 1.6, fuelcanopy: 0, fuelpump: 0.5, irrigator: 0, watertankfarm: 1, haybale: 0.7, orecart: 1.1, cairn: 0.7 };
// site kinds: [center piece, ring items [kind, count, radius], weight fn of the land]
const KINDS = {
  farm: { label: 'a farm', fit: l => l.flat * l.wet * l.low, core: 'barn', ring: [['grainsilo', 2, 14], ['tractor', 1, 12], ['animalpen', 1, 20], ['haybale', 5, 24], ['greenhouse', 2, 28], ['irrigator', 1, 42], ['harvester', 1, 26], ['fencepanel', 8, 34], ['watertankfarm', 1, 16], ['washingline', 1, 11]] },
  mine: { label: 'a mine', fit: l => l.steep * (1 - l.wet * 0.5), core: 'headframe', ring: [['drillrig', 1, 22], ['orecart', 3, 14], ['railtrack', 3, 12], ['workcamp', 2, 26], ['generatorset', 1, 18], ['gascan', 3, 9], ['pallettruck', 1, 16], ['sandbag', 2, 20], ['container', 2, 20]] },
  wind: { label: 'a wind farm', fit: l => l.flat * l.high, core: 'windmillbig', ring: [['windmillbig', 3, 70], ['substation', 1, 26], ['pylon', 2, 60]] },
  solar: { label: 'a solar field', fit: l => l.flat * (1 - l.wet), core: 'substation', ring: [['solarfield', 12, 30], ['workcamp', 1, 22], ['pylon', 1, 50]] },
  oil: { label: 'a well field', fit: l => l.flat * (1 - l.wet) * 0.6, core: 'pumpjack', ring: [['pumpjack', 3, 34], ['gastanks', 2, 12], ['tank', 1, 20], ['generatorset', 1, 12]] },
  well: { label: 'a well', fit: l => (1 - l.wet) * l.flat * 0.5, core: 'wellhead', ring: [['fencepanel', 4, 8], ['bucket', 2, 2], ['campfire', 1, 7], ['tent', 2, 10], ['washingline', 1, 9]] },
  mill: { label: 'a water mill', fit: l => l.wet * l.shore, core: 'waterwheel', ring: [['barn', 1, 16], ['fencepanel', 4, 14], ['haybale', 3, 12]] },
  watch: { label: 'a watch post', fit: l => l.high * 0.7, core: 'watchtower', ring: [['bunker', 1, 16], ['radiomast', 1, 22], ['sandbag', 4, 8], ['barricade', 2, 12]] },
  light: { label: 'a lighthouse', fit: l => l.shore * 1.4, core: 'lighthouse', ring: [['workcamp', 1, 13], ['fencepanel', 3, 9], ['radiomast', 1, 18]] },
  ruin: { label: 'ruins', fit: () => 0.22, core: 'ruinwall', ring: [['ruinwall', 6, 16], ['cairn', 3, 22], ['stonewall', 4, 24], ['scrapheap', 2, 12]] },
  camp: { label: 'a camp', fit: () => 0.16, core: 'campfire', ring: [['tent', 3, 6], ['tarp', 1, 8], ['backpack', 2, 4], ['gascan', 1, 6], ['washingline', 1, 7]] },
  fuel: { label: 'a fuel stop', fit: l => l.flat * 0.3 * l.road, core: 'fuelcanopy', ring: [['fuelpump', 2, 3.5], ['workcamp', 1, 14], ['roadsign', 1, 18], ['skip_bin', 1, 11]] },
};
const cache = new Map();
export function sitesInTile(planet, ti, tj) {
  const ck = planet.universeSeed.join(':') + '|' + ti + ',' + tj; if (cache.has(ck)) return cache.get(ck); if (cache.size > 400) cache.clear();
  const out = [], rng = new Rng(derive(planet.seed, 'outposts', [ti, tj])), cul = cultureOf(planet);
  if (rng.next() < 0.5) {     // about every other 900 m square has someone in it
    const x = (ti + rng.range(0.15, 0.85)) * TILE, z = (tj + rng.range(0.15, 0.85)) * TILE, S = surfaceAt(planet, x, z);
    if (S.town < 0.01 && S.h > planet.seaLevel + 2 && !S.road) {
      // what's the land like here?
      const h = (dx, dz) => surfaceAt(planet, x + dx, z + dz).h, d = Math.max(Math.abs(h(30, 0) - S.h), Math.abs(h(-30, 0) - S.h), Math.abs(h(0, 30) - S.h), Math.abs(h(0, -30) - S.h));
      let shore = 0; for (let k = 0; k < 8 && !shore; k++) if (h(Math.cos(k * 0.785) * 160, Math.sin(k * 0.785) * 160) < planet.seaLevel) shore = 1;
      let road = 0; for (let k = 0; k < 8 && !road; k++) if (surfaceAt(planet, x + Math.cos(k * 0.785) * 40, z + Math.sin(k * 0.785) * 40).road > 0.5) road = 1;
      const land = { flat: d < 3 ? 1 : d < 7 ? 0.45 : 0.05, steep: d > 6 ? 1 : 0.15, wet: moisture(planet, x, z), low: S.h < 180 ? 1 : 0.4, high: S.h > 150 ? 1 : 0.25, shore, road };
      const pick = rng.weighted(Object.entries(KINDS).map(([k, K]) => [k, Math.max(0.0001, K.fit(land))])), K = KINDS[pick], rot0 = rng.range(0, 6.28), items = [];
      const place = (k, px, pz, rot) => { const Q = surfaceAt(planet, px, pz); if (Q.h < planet.seaLevel + 0.5 || Q.town > 0.01 || Q.road > 0.01) return; items.push({ k, x: px, y: Q.h, z: pz, rot, r: r_[k] ?? 0, s: 1 }); };
      place(K.core, x, z, rot0);
      for (const [k, n, R] of K.ring) for (let q = 0; q < n; q++) { const a = rot0 + (q + rng.next() * 0.5) * 6.283 / n, r2 = R * rng.range(0.8, 1.15); place(k, x + Math.cos(a) * r2, z + Math.sin(a) * r2, k === 'fencepanel' ? a + 1.57 : rng.range(0, 6.28)); }
      if (items.length) out.push({ kind: pick, label: K.label, x, y: S.h, z, items, id: `site:${ti},${tj}`, wear: cul.wear });
    }
  }
  cache.set(ck, out);
  return out;
}
export function sitesNear(planet, x, z, R, fn) {
  const i0 = Math.floor((x - R) / TILE), i1 = Math.floor((x + R) / TILE), j0 = Math.floor((z - R) / TILE), j1 = Math.floor((z + R) / TILE);
  for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) for (const s of sitesInTile(planet, i, j)) fn(s);
}
