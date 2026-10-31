// In-memory backend with the same contract as store-idb.js. Serialises through JSON
// so tests catch anything that would not survive a real save.
export class MemoryBackend {
  constructor() { this.data = null; this.writes = 0; }
  async load() { return this.data ? JSON.parse(JSON.stringify(this.data)) : null; }
  async save(b) {
    this.writes++;
    const c = JSON.parse(JSON.stringify(b));
    if (c.wipe || !this.data) this.data = { meta: null, player: null, deltas: [], events: [], jobs: [] };
    const d = this.data;
    d.meta = c.meta;
    if (c.player !== undefined) d.player = c.player;
    const m = new Map(d.deltas);
    for (const [k, v] of c.deltas) v === undefined ? m.delete(k) : m.set(k, v);
    d.deltas = [...m];
    d.events.push(...c.events);
    if (c.jobs !== undefined) d.jobs = c.jobs;
  }
  bytes() { return this.data ? JSON.stringify(this.data).length : 0; }
}
