// Keeps the rivers around you worked out ahead of time, on a background thread. If you outrun it
// the game works the cell out itself, exactly as before: it's the same answer, only with a pause.
import { REGION, riverCellDone, adoptRiverCell, forgetRiverCells } from '../gen/rivers.js';
import { GenCache, noteExplored } from './gencache.js';
import { adoptLinks } from '../gen/network.js';
import { REGION as TOWN } from '../core/units.js';

const REACH = 2;      // cells either side of the one you're in
export class RiverFeed {
  // cache: the generated-data cache (world/gencache.js), so country you've been through comes back at once. onExplore(ci, cj): a cell you've just come into.
  constructor(planet, { cache = new GenCache(planet), onExplore = null } = {}) { this.planet = planet; this.worker = null; this.busy = null; this.at = null; this.roadsDone = new Set(); this.cache = cache; this.onExplore = onExplore; this.cell = null; }
  update(x, z) {
    if (this.busy) return;
    const ci = Math.floor(x / REGION), cj = Math.floor(z / REGION);
    if (!this.cell || this.cell[0] !== ci || this.cell[1] !== cj) { this.cell = [ci, cj]; this.onExplore?.(ci, cj); forgetRiverCells(this.planet, ci, cj, REACH + 1); }      // (far country let go: it comes back from the cache)
    for (let d = 0; d <= REACH; d++) for (let a = -d; a <= d; a++) for (let b = -d; b <= d; b++) {
      if (Math.max(Math.abs(a), Math.abs(b)) !== d || riverCellDone(this.planet, ci + a, cj + b)) continue;
      return this.ask(ci + a, cj + b);
    }
    // then the roads between towns, in blocks around you, nearest first
    const ti = Math.round(x / TOWN / 5), tj = Math.round(z / TOWN / 5);
    for (let d = 0; d <= 1; d++) for (let a = -d; a <= d; a++) for (let b = -d; b <= d; b++) {
      if (Math.max(Math.abs(a), Math.abs(b)) !== d || this.roadsDone.has((ti + a) + ',' + (tj + b))) continue;
      return this.ask((ti + a) * 5, (tj + b) * 5, true);
    }
    if (this.worker) { this.worker.terminate(); this.worker = null; }      // (nothing left to do: give its memory back)
  }
  ask(ri, rj, roads = false) {
    // first the cache: worked out on an earlier visit, it needs no thread at all
    this.busy = [ri, rj];
    this.cache.get(roads ? 'roads' : 'rivers', ri + ',' + rj).then(hit => {
      if (hit !== undefined) { if (roads) { adoptLinks(this.planet, hit, ri, rj); this.roadsDone.add(ri / 5 + ',' + rj / 5); } else adoptRiverCell(this.planet, ri, rj, hit); this.busy = null; return; }
      this.busy = null; this.work(ri, rj, roads);
    }, () => { this.busy = null; this.work(ri, rj, roads); });
  }
  work(ri, rj, roads = false) {
    try {
      if (!this.worker) { this.worker = new Worker(new URL('../gen/rivers-worker.js', import.meta.url), { type: 'module' }); this.worker.onerror = e => { console.warn('river thread', e.message); this.worker?.terminate(); this.worker = null; this.busy = null; this.update = () => {}; };
        this.worker.onmessage = ({ data }) => { if (data.list) this.cache.put(data.roads ? 'roads' : 'rivers', data.ri + ',' + data.rj, data.list); if (data.roads) { adoptLinks(this.planet, data.list, data.ri, data.rj); this.roadsDone.add(data.ri / 5 + ',' + data.rj / 5); } else adoptRiverCell(this.planet, data.ri, data.rj, data.list); this.busy = null; }; }
      this.busy = [ri, rj];
      this.worker.postMessage({ universe: this.planet.universeSeed, address: this.planet.address.key, ri, rj, roads });
    } catch (e) { console.warn('no river thread', e); this.update = () => {}; }
  }
}
