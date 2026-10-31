// WorldStore — everything that is NOT regenerable. Generated content is never stored;
// only changes ("deltas") keyed by universe address, an append-only event log of
// things that happened, the timed-job queue the scheduler runs, and save metadata.
//
// The working copy lives in memory; a backend (IndexedDB in the browser, in-memory
// for tests) persists dirty records. The delta set is small (only touched things),
// so loading it whole is fine for now; ROADMAP covers sharding by region later.

export const SAVE_VERSION = 1;
// Bump whenever generation output changes for the same seed. Saves only hold deltas
// against generated content, so a save made under another generator version may point
// at things that no longer exist; the game warns instead of silently misapplying them.
export const GEN_VERSION = 3;   // 2: apartments + furniture anchors; 3: workplace heads hired first

export class WorldStore {
  constructor(backend) {
    this.backend = backend;
    this.meta = null;            // { version, universe, created, gameTime, realTime, nextEvent, nextJob }
    this.deltas = new Map();     // addressKey -> object
    this.events = [];            // [{ id, t, type, ... }]
    this.jobs = [];              // [{ id, at, kind, target, data }] sorted by (at, id)
    this.player = null;
    this.dirty = { meta: false, player: false, deltas: new Set(), events: [], jobsChanged: false };
  }

  async open() {
    const data = await this.backend.load();
    if (data) {
      this.meta = data.meta; this.player = data.player;
      this.deltas = new Map(data.deltas);
      this.events = data.events; this.jobs = data.jobs;
    }
    return !!data;
  }

  create(universeHex, gameTime, realTime) {
    this.meta = { version: SAVE_VERSION, gen: GEN_VERSION, universe: universeHex, created: realTime, gameTime, realTime, nextEvent: 1, nextJob: 1 };
    this.deltas.clear(); this.events = []; this.jobs = []; this.player = null;
    this.dirty.meta = true; this.dirty.player = true; this.dirty.jobsChanged = true; this.dirty.wipe = true;
  }

  // ---- deltas
  getDelta(key) { return this.deltas.get(key); }
  patchDelta(key, patch) {
    const cur = this.deltas.get(key) || {};
    const next = { ...cur, ...patch };
    for (const k of Object.keys(next)) if (next[k] === undefined) delete next[k];
    if (Object.keys(next).length) this.deltas.set(key, next); else this.deltas.delete(key);
    this.dirty.deltas.add(key);
    return next;
  }

  // ---- events
  log(ev) {
    const e = { id: this.meta.nextEvent++, ...ev };
    this.events.push(e); this.dirty.events.push(e); this.dirty.meta = true;
    return e;
  }
  eventsBetween(t0, t1) { return this.events.filter(e => e.t > t0 && e.t <= t1); }

  // ---- timed jobs (dormant-tier simulation)
  schedule(job) {
    const j = { id: this.meta.nextJob++, ...job };
    let i = this.jobs.length;
    while (i > 0 && (this.jobs[i - 1].at > j.at || (this.jobs[i - 1].at === j.at && this.jobs[i - 1].id > j.id))) i--;
    this.jobs.splice(i, 0, j);
    this.dirty.jobsChanged = true; this.dirty.meta = true;
    return j;
  }
  cancelJobs(pred) { const n = this.jobs.length; this.jobs = this.jobs.filter(j => !pred(j)); if (this.jobs.length !== n) this.dirty.jobsChanged = true; }
  popDue(t) { if (this.jobs.length && this.jobs[0].at <= t) { this.dirty.jobsChanged = true; return this.jobs.shift(); } return null; }

  setPlayer(p) { this.player = p; this.dirty.player = true; }
  touchPlayer() { this.dirty.player = true; }

  async flush() {
    const d = this.dirty;
    const batch = {
      wipe: !!d.wipe,
      meta: this.meta,
      player: d.player ? this.player : undefined,
      deltas: [...d.deltas].map(k => [k, this.deltas.get(k)]),
      events: d.events,
      jobs: d.jobsChanged ? this.jobs : undefined,
    };
    this.dirty = { meta: false, player: false, deltas: new Set(), events: [], jobsChanged: false };
    await this.backend.save(batch);
  }

  // Whole-save JSON for Backup/Restore.
  exportJSON() {
    return JSON.stringify({ format: 'orbis-save', meta: this.meta, player: this.player, deltas: [...this.deltas], events: this.events, jobs: this.jobs });
  }
  async importJSON(text) {
    const o = JSON.parse(text);
    if (o.format !== 'orbis-save' || !o.meta) throw new Error('not an ORBIS save file');
    this.meta = o.meta; this.player = o.player; this.deltas = new Map(o.deltas); this.events = o.events; this.jobs = o.jobs;
    this.dirty = { wipe: true, meta: true, player: true, deltas: new Set(this.deltas.keys()), events: [...this.events], jobsChanged: true };
    await this.flush();
  }
}
