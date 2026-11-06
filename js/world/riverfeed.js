// Keeps the rivers around you worked out ahead of time, on a background thread. If you outrun it
// the game works the cell out itself, exactly as before: it's the same answer, only with a pause.
import { REGION, riverCellDone, adoptRiverCell } from '../gen/rivers.js';
import { adoptLinks } from '../gen/network.js';
import { REGION as TOWN } from '../core/units.js';

const REACH = 2;      // cells either side of the one you're in
export class RiverFeed {
  constructor(planet) { this.planet = planet; this.worker = null; this.busy = null; this.at = null; this.roadsDone = new Set(); }
  update(x, z) {
    if (this.busy) return;
    const ci = Math.floor(x / REGION), cj = Math.floor(z / REGION);
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
    try {
      if (!this.worker) { this.worker = new Worker(new URL('../gen/rivers-worker.js', import.meta.url), { type: 'module' }); this.worker.onerror = e => { console.warn('river thread', e.message); this.worker?.terminate(); this.worker = null; this.busy = null; this.update = () => {}; };
        this.worker.onmessage = ({ data }) => { if (data.roads) { adoptLinks(this.planet, data.list, data.ri, data.rj); this.roadsDone.add(data.ri / 5 + ',' + data.rj / 5); } else adoptRiverCell(this.planet, data.ri, data.rj, data.list); this.busy = null; }; }
      this.busy = [ri, rj];
      this.worker.postMessage({ universe: this.planet.universeSeed, address: this.planet.address.key, ri, rj, roads });
    } catch (e) { console.warn('no river thread', e); this.update = () => {}; }
  }
}
